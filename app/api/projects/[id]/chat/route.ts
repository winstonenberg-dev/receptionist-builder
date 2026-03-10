import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { groqWithFallback } from "@/lib/groq";

const DAILY_LIMIT = 500;
const MAX_MSG_LENGTH = 500;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { messages } = await req.json();
  const { id } = await params;

  // Meddelandelängdsbegränsning — hindrar token-missbruk
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.content && lastMsg.content.length > MAX_MSG_LENGTH) {
    return NextResponse.json(
      { message: "Ditt meddelande är för långt. Max 500 tecken." },
      { status: 400 }
    );
  }

  // Rate-limiting: max 500 meddelanden per IP+projekt per dag
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const day = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const rl = await prisma.rateLimit.upsert({
    where: { ip_projectId_day: { ip, projectId: id, day } },
    update: { count: { increment: 1 } },
    create: { ip, projectId: id, day, count: 1 },
  });
  if (rl.count > DAILY_LIMIT) {
    return NextResponse.json(
      { message: "Du har nått dagens gräns för idag. Kontakta oss direkt om du behöver mer hjälp!" },
      { status: 429 }
    );
  }
  // Rensa gamla IP-rader (tidigare dagar) — körs passivt utan att blockera svaret
  prisma.rateLimit.deleteMany({ where: { day: { lt: day } } }).catch(() => {});

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      answers: true,
      prompts: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  // Exkludera agent-findings, meta-data och simulate_findings från Q&A-blocket
  const AGENT_FINDING_KEYS = ["faq_findings", "service_findings",
    "focus_findings", "season_findings", "industry_findings", "synthesis_findings",
    "synthesis_implemented", "simulate_done", "qa_locked", "simulate_findings", "custom_persona"];

  // Hemsidans fakta — viktigast, inkluderas alltid (trunkerat)
  const wkAnswer = project?.answers.find(a => a.questionKey === "website_knowledge");
  const websiteBlock = wkAnswer?.answer
    ? `INFORMATION FRÅN HEMSIDAN:\n${wkAnswer.answer.slice(0, 3000)}\n\n`
    : "";

  // Korta Q&A-svar (öppettider, priser etc. manuellt ifyllda)
  const qaLines = (project?.answers ?? [])
    .filter((a) => a.answer?.trim() && !AGENT_FINDING_KEYS.includes(a.questionKey) && a.questionKey !== "website_knowledge" && !a.questionKey.startsWith("appearance_"))
    .map((a) => `- ${a.question}: ${a.answer}`);
  const qaBlock = qaLines.length > 0
    ? `FAKTA OM VERKSAMHETEN (använd EXAKT denna information — lägg ALDRIG till egna påhittade detaljer):\n${qaLines.join("\n")}\n\n`
    : "";

  const basePrompt = project?.prompts[0]?.prompt
    ?? `Du är en vänlig och professionell receptionist för ${project?.name ?? "företaget"}. Svara på svenska. Om du inte vet svaret, säg "Det vet jag tyvärr inte — kontakta oss direkt."`;

  // Anpassad bemötning/personlighet — skriven av ägaren
  const personaAnswer = project?.answers.find(a => a.questionKey === "custom_persona");
  const personaBlock = personaAnswer?.answer?.trim()
    ? `\nDIN PERSONLIGHET OCH ROLL:\n${personaAnswer.answer}\n`
    : "";

  // Oöverskrivbart anti-hallucinationsblock — bifogas ALLTID sist i system-prompten
  const ANTI_HALLUCINATION = `

---
VIKTIGA RIKTLINJER:
1. Hitta ALDRIG på specifika fakta — priser, tider, namn, telefonnummer eller bokningsregler måste stämma med den information du faktiskt har. Gissa aldrig sådant.
2. Blanda inte ihop saker. Om kunden frågar om golfbilar och du inte har info om det → säg att du inte vet, svara inte om parkering istället.
3. Du FÅR använda sunt förnuft och göra rimliga antaganden om saker som är självklara för en verksamhet av den här typen — men gissa aldrig specifika siffror eller fakta du inte har.
4. Om du saknar information om något → svara varmt och naturligt, t.ex: "Det vet jag faktiskt inte riktigt — hör av dig till oss direkt så fixar vi det!" Variera formuleringen. Säg ALDRIG fraser som avslöjar att du söker i data: "det nämns inte", "saknas i informationen", "jag hittar inte" eller liknande.
5. Skriv korrekt och naturlig svenska. Korta, avslappnade meningar är bättre än långa och stela. Använd ALLTID svenska specialtecken: "här" (inte "hear"), "är" (inte "are"), "där" (inte "dare"), "för" (inte "for"), "och" (inte "or"), "på" (inte "pa"). Blanda ALDRIG in engelska ord.
6. Du är aldrig en AI som "letar upp" svar — du är en person som vet detta utantill. Svara alltid direkt och personligt.
7. LOVA ALDRIG att utföra handlingar åt kunden — du kan inte boka, beställa, ringa, ordna eller genomföra något. Du ger bara information och hänvisar till direkt kontakt för allt som kräver en åtgärd.`;

  // Bygg system-prompt med separata gränser per del — inget kapas bort av misstag
  const systemPrompt =
    websiteBlock.slice(0, 2500) +
    qaBlock +
    basePrompt +
    personaBlock +
    ANTI_HALLUCINATION;

  // Behåll bara de 8 senaste meddelandena för att hålla nere tokens
  const firstUserIdx = messages.findIndex((m: { role: string }) => m.role === "user");
  const allMsgs = firstUserIdx >= 0 ? messages.slice(firstUserIdx) : messages;
  const filtered = allMsgs.slice(-8);

  try {
    const content = await groqWithFallback(groq =>
      groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, ...filtered],
      }).then(r => r.choices[0].message.content ?? "")
    );
    return NextResponse.json({ message: content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Chat error:", msg);
    const friendly = msg.includes("429") || msg.includes("rate_limit")
      ? "Boten är tillfälligt upptagen — försök igen om en liten stund!"
      : "Något gick fel just nu. Försök igen om en stund.";
    return NextResponse.json({ message: friendly }, { status: 500 });
  }
}
