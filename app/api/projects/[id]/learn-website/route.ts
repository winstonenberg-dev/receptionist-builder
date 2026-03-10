import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGroqClient } from "@/lib/groq";

// Vercel Pro: allow up to 60s (hobby plan is capped at 10s regardless)
export const maxDuration = 60;

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
    // golf
    "faciliteter", "anlaggning", "bana", "course", "golf",
    // hotell
    "rum", "svit", "suite", "accommodation", "boende",
    "bekvamligheter", "faciliteter", "amenities",
    "restaurang", "bar", "mat", "food", "frukost",
    "gym", "spa", "pool", "relax",
    "parkering", "parking",
    "husdjur", "pet",
    // övrigt
    "om-oss", "about", "info", "tjanster", "service",
    "personal", "oppettider", "hitta", "karta",
  ];
  links.sort((a, b) => {
    const aScore = priority.findIndex(k => a.toLowerCase().includes(k));
    const bScore = priority.findIndex(k => b.toLowerCase().includes(k));
    return (aScore === -1 ? 999 : aScore) - (bScore === -1 ? 999 : bScore);
  });

  return links.slice(0, 6);
}

/** Branschanpassade extraktionskategorier */
function getIndustryCategories(industry: string): string {
  switch (industry) {
    case "hotell":
      return `🛏️ RUM & BOENDE
  - Rumstyper (enkelrum, dubbelrum, svit, familjerum), priser, vad som ingår, max gäster, tillgänglighetsrum

🍽️ MAT & DRYCK
  - Restaurang (namn, meny, öppettider), bar, frukost (ingår? pris?), rumsservice, specialkost/allergier

🏋️ BEKVÄMLIGHETER & FACILITETER
  - Gym, pool, spa, relax, bastu, konferensrum, mötesutrustning — vad ingår, vad kostar extra

🚗 PARKERING & TRANSPORT
  - Parkering (pris, antal platser, inomhus/utomhus, EV-laddning), avstånd till station/flygplats, shuttle

🐾 HUSDJURSPOLICY
  - Husdjur tillåtna (ja/nej), kostnad, regler, begränsningar

♻️ MILJÖ & CERTIFIERING
  - Miljömärkningar (Svanen, Green Key etc.), hållbarhetsarbete, certifieringar`;

    case "restaurang":
      return `🍽️ MENY & MATUTBUD
  - Typer av rätter, kök/matlagningsstil, säsongsmeny, specialrätter, vegetariskt/veganskt/glutenfritt

🍷 DRYCK & BAR
  - Bar (namn, öppettider), vinlista, alkoholfritt alternativ, happy hour

🎉 BORD & PRIVATA TILLSTÄLLNINGAR
  - Bordsbokning, sittplatsantal, privata rum, catering, events, konferens`;

    case "golf":
      return `⛳ BANA & SPEL
  - Antal hål, par, längd, banrating, slope, antal banor

🏌️ FACILITETER
  - Golfbilar (antal, pris), driving range, putting green, pro shop, omklädningsrum, dusch, locker

📋 REGLER & KRAV
  - Handicapkrav, klädkod, gästpolicy, tee time-bokning`;

    case "frisör":
      return `✂️ TJÄNSTER & BEHANDLINGAR
  - Klippning, färgning, slingor, styling, skäggtrimning — priser per tjänst

💆 EXTRA TJÄNSTER
  - Manikyr, pedikyr, bröllopspaket, andra behandlingar`;

    default:
      return `🏢 TJÄNSTER & ERBJUDANDEN
  - Vad erbjuds, priser, paket, vad ingår

🏗️ FACILITETER & UTRYMMEN
  - Vad finns på plats, utrustning, lokaler, tillgänglighet`;
  }
}

/** Jina AI Reader — renderar JS-sidor, gratis utan API-nyckel */
async function fetchViaJina(url: string, maxChars = 2500, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "Accept": "text/plain", "X-Timeout": "7" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 100 ? text.slice(0, maxChars) : null;
  } catch { return null; }
}

/** Undersidor: Jina först (parallellt = ingen extra tid), fallback direkthämtning */
async function fetchPage(url: string): Promise<{ url: string; text: string } | null> {
  // Prova Jina med kortare timeout (körs parallellt med andra sidor)
  const jina = await fetchViaJina(url, 2500, 7000);
  if (jina) return { url, text: jina };

  // Fallback: direkthämtning
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; receptionist-bot/1.0)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = stripHtml(html);
    if (text.length < 50) return null;
    return { url, text: text.slice(0, 2500) };
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

    // Auth + ownership in one query, include answers for location context
    const project = await prisma.project.findFirst({
      where: { id, user: { email: session.user.email } },
      select: { id: true, name: true, industry: true, websiteUrl: true, answers: { select: { questionKey: true, answer: true } } },
    });
    if (!project) return NextResponse.json({ error: "Projekt hittades inte eller ej behörig" }, { status: 404 });

    await prisma.project.update({ where: { id }, data: { websiteUrl: url } });

    // 1. Hämta startsidan — hämta råHTML för länkextraktion parallellt med Jina för text
    let mainHtml = "";
    let mainText = "";

    const [htmlResult, jinaResult] = await Promise.allSettled([
      fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; receptionist-bot/1.0)" },
        signal: AbortSignal.timeout(7000),
      }).then(r => r.text()).catch(() => ""),
      fetchViaJina(url, 3000, 9000),
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

    const groq = getGroqClient();

    // 4. Strukturerad faktaextraktion — branschanpassad, bevarar exakta värden
    const industry = project.industry ?? "verksamhet";
    const industryCategories = getIndustryCategories(industry);

    // Bygg platskontext från Q&A-svar (adress, stad, postnummer)
    const locationAnswer = project.answers?.find(a =>
      ["adress", "address", "stad", "ort", "city", "location"].some(k => a.questionKey.toLowerCase().includes(k))
    )?.answer ?? "";
    const bizName = project.name ?? "";
    const locationCtx = locationAnswer
      ? `\nDETTA GÄLLER: "${bizName}" på "${locationAnswer}".
REGLER FÖR KEDJOR/FLERA FILIALER:
- Kontaktuppgifter (adress, telefon, email): ta KUN med uppgifter för denna specifika plats
- Öppettider: ta med om de gäller denna plats eller hela kedjan (ange om det är kedjegenerella)
- Meny, priser, erbjudanden, faciliteter: ta med ALL sådan information från hemsidan — den gäller troligtvis denna plats också
- Skriv ALDRIG "inga uppgifter finns för denna plats" för meny/priser/faciliteter om informationen finns på hemsidan`
      : bizName
      ? `\nDETTA GÄLLER: "${bizName}". Extrahera all relevant information från hemsidan.`
      : "";

    const knowledgeRes = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // 500k TPD vs 100k for 70b — räcker för extraktion
      messages: [
        {
          role: "system",
          content: `Du är ett precisionsinstrument för faktaextraktion. Din enda uppgift är att hitta och lista EXAKTA faktauppgifter från hemsidan.${locationCtx}

REGLER:
- Skriv BARA fakta som faktiskt finns på hemsidan — aldrig gissningar
- Bevara EXAKTA värden: priser i kr, tider i HH:MM, telefonnummer, adresser
- Om det finns uppgifter om flera orter/filialer — ta KUN med uppgifter om den specificerade platsen
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
  - Exakta öppettider per avdelning och dag/säsong

💰 PRISER
  - Exakta priser i kr för alla tjänster och produkter

${industryCategories}

📋 BOKNING & REGLER
  - Hur man bokar, avbokningsregler, policys, krav

🎁 ERBJUDANDEN & PAKET
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
    const detail = err instanceof Error ? err.message : String(err);
    console.error("learn-website error:", detail);
    if (detail.includes("429") || detail.toLowerCase().includes("rate limit")) {
      return NextResponse.json({ error: "AI-kvot slut för idag — försök igen imorgon eller uppgradera Groq-planen." }, { status: 429 });
    }
    // Tillfälligt: visa exakt fel för felsökning
    return NextResponse.json({ error: `Fel: ${detail}` }, { status: 500 });
  }
}
