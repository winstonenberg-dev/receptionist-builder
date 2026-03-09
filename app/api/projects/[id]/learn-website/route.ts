import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Block SSRF: only allow public http/https URLs */
function isSafeUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") return false;
    if (/^10\./.test(h)) return false;                          // RFC 1918
    if (/^192\.168\./.test(h)) return false;                   // RFC 1918
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;   // RFC 1918
    if (/^169\.254\./.test(h)) return false;                   // link-local
    if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return false;
    return true;
  } catch { return false; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInternalLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const matches = [...html.matchAll(/href=["']([^"']+)["']/gi)];
  const seen = new Set<string>();
  const links: string[] = [];

  for (const m of matches) {
    try {
      const abs = new URL(m[1], base);
      if (abs.hostname !== base.hostname) continue;
      if (abs.pathname === base.pathname) continue;
      const p = abs.pathname.toLowerCase();
      if (p.match(/\.(pdf|jpg|jpeg|png|gif|svg|ico|css|js|xml|json)$/)) continue;
      if (p.includes("#")) continue;
      const url = abs.origin + abs.pathname;
      if (!seen.has(url)) { seen.add(url); links.push(url); }
    } catch { /* ignore */ }
  }

  const priority = [
    "kontakt", "contact", "priser", "pris", "price",
    "boka", "bokning", "book", "reservation",
    "faciliteter", "anlaggning", "bana", "course",
    "om-oss", "about", "info", "tjanster", "service",
    "restaurang", "mat", "food", "golf", "personal",
    "oppettider", "hitta", "karta",
  ];
  links.sort((a, b) => {
    const aScore = priority.findIndex(k => a.toLowerCase().includes(k));
    const bScore = priority.findIndex(k => b.toLowerCase().includes(k));
    return (aScore === -1 ? 999 : aScore) - (bScore === -1 ? 999 : bScore);
  });

  return links.slice(0, 15);
}

/** Jina AI Reader — renderar JS-sidor, gratis utan API-nyckel */
async function fetchViaJina(url: string, maxChars = 2000): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "Accept": "text/plain", "X-Timeout": "10" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 100 ? text.slice(0, maxChars) : null;
  } catch { return null; }
}

async function fetchPage(url: string): Promise<{ url: string; text: string } | null> {
  // Prova Jina först (klarar JS-renderade sidor)
  const jina = await fetchViaJina(url);
  if (jina) return { url, text: jina };

  // Fallback: direkthämtning + strippa HTML
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; receptionist-bot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = stripHtml(html);
    if (text.length < 50) return null;
    return { url, text: text.slice(0, 2000) };
  } catch { return null; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

    const { url } = await req.json();
    const { id } = await params;

    if (!url) return NextResponse.json({ error: "URL krävs" }, { status: 400 });
    if (!isSafeUrl(url)) return NextResponse.json({ error: "Ogiltig eller ej tillåten URL" }, { status: 400 });

    // Auth + ownership in one query
    const project = await prisma.project.findFirst({
      where: { id, user: { email: session.user.email } },
    });
    if (!project) return NextResponse.json({ error: "Projekt hittades inte eller ej behörig" }, { status: 404 });

    await prisma.project.update({ where: { id }, data: { websiteUrl: url } });

    // 1. Hämta startsidan — hämta råHTML för länkextraktion parallellt med Jina för text
    let mainHtml = "";
    let mainText = "";

    const [htmlResult, jinaResult] = await Promise.allSettled([
      fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; receptionist-bot/1.0)" },
        signal: AbortSignal.timeout(12000),
      }).then(r => r.text()).catch(() => ""),
      fetchViaJina(url, 3000),
    ]);

    mainHtml = htmlResult.status === "fulfilled" ? htmlResult.value : "";
    const jinaText = jinaResult.status === "fulfilled" ? jinaResult.value : null;

    // Använd Jina-text om tillgänglig, annars strippa HTML
    mainText = jinaText ?? stripHtml(mainHtml).slice(0, 3000);

    if (mainText.length < 50) {
      return NextResponse.json({ error: "Hemsidan verkar tom eller blockerar läsning. Prova att klistra in URL:en utan www, eller kontakta supporten." }, { status: 400 });
    }

    // 2. Hämta upp till 15 undersidor parallellt
    const subLinks = extractInternalLinks(mainHtml, url);
    const subPages = await Promise.all(subLinks.map(fetchPage));
    const validSubs = subPages.filter(Boolean) as { url: string; text: string }[];

    // 3. Bygg kombinerat innehåll
    const allContent = [
      `=== STARTSIDA ===\n${mainText}`,
      ...validSubs.map(p => `=== ${p.url.replace(/^https?:\/\/[^/]+/, "")} ===\n${p.text}`),
    ].join("\n\n");

    const pagesRead = 1 + validSubs.length;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

    // 4. Strukturerad faktaextraktion — bevarar exakta värden, ingen fri sammanfattning
    const knowledgeRes = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Du är ett precisionsinstrument för faktaextraktion. Din enda uppgift är att hitta och lista EXAKTA faktauppgifter från hemsidan.

REGLER:
- Skriv BARA fakta som faktiskt finns på hemsidan — aldrig gissningar
- Bevara EXAKTA värden: priser i kr, tider i HH:MM, telefonnummer, adresser
- Om ett faktum inte finns → skriv det inte
- Inga fluffiga beskrivningar — bara konkreta fakta`,
        },
        {
          role: "user",
          content: `Extrahera ALLA specifika faktauppgifter från dessa ${pagesRead} sidor. Lista varje faktum under rätt kategori.

KATEGORIER ATT LETA I:
📍 KONTAKT & ADRESS
  - Adress, telefonnummer, email, webbplats

🕐 ÖPPETTIDER
  - Exakta öppettider för bana, reception, restaurang, shop — per dag/säsong

💰 PRISER
  - Exakta priser i kr för greenfee, medlemskap, golfbil, driving range, lektioner, restaurang, etc.

⛳ FACILITETER & UTRUSTNING
  - Vad som finns: golfbilar (antal, pris), driving range, putting green, restaurang, pro shop, omklädningsrum, dusch, locker, etc.

📋 BOKNING & REGLER
  - Hur man bokar (telefon/hemsida/app), avbokningsregler, handicapkrav, klädkod, husdjur

🏌️ BANA & SPEL
  - Antal hål, par, längd, banrating, antal banor

🎁 ERBJUDANDEN
  - Rabatter, paket, lojalitetsprogram, presentkort, grupperbjudanden

📞 FAQ
  - Vanliga frågor och svar som finns på hemsidan

HEMSIDANS INNEHÅLL (${pagesRead} sidor):
${allContent}`,
        },
      ],
      max_tokens: 3000,
    });

    const knowledge = knowledgeRes.choices[0].message.content ?? "";

    // 5. Spara i DB
    await prisma.answer.upsert({
      where: { projectId_questionKey: { projectId: id, questionKey: "website_knowledge" } },
      update: { answer: knowledge },
      create: {
        projectId: id,
        questionKey: "website_knowledge",
        question: `Faktaextraktion från hemsidan (${pagesRead} sidor lästa)`,
        answer: knowledge,
      },
    });

    return NextResponse.json({ pagesRead, summary: knowledge });

  } catch (err) {
    console.error("learn-website error:", err);
    return NextResponse.json({ error: "Internt fel — försök igen" }, { status: 500 });
  }
}
