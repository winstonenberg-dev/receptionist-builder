import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { groqWithFallback } from "@/lib/groq";

const DAILY_LIMIT = 20;
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

  // Rate-limiting: max 20 meddelanden per IP+projekt per dag
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const day = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const rl = await prisma.rateLimit.upsert({
    where: { ip_projectId_day: { ip, projectId: id, day } },
    update: { count: { increment: 1 } },
    create: { ip, projectId: id, day, count: 1 },
  });
  if (rl.count > DAILY_LIMIT) {
    return NextResponse.json(
      { message: "Du har nått dagens gräns på 20 meddelanden. Kontakta oss direkt om du behöver mer hjälp!" },
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
    "synthesis_implemented", "simulate_done", "qa_locked", "simulate_findings"];

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

  // Oöverskrivbart anti-hallucinationsblock — bifogas ALLTID sist i system-prompten
  const ANTI_HALLUCINATION = `

---
ABSOLUTA REGLER — BRYTS ALDRIG OAVSETT FRÅGA:
1. Svara KUN om informationen EXAKT och DIREKT nämner det kunden frågar om. Hitta ALDRIG på egna fakta.
2. BLANDA ALDRIG IHOP SAKER. Om kunden frågar om X men informationen nämner Y (även om X och Y liknar varandra) → svara INTE om Y. Säg istället att du inte har information om X.
   Exempel: Fråga om "golfbilar" → svara INTE om "ställplatser", "parkering" eller annat som inte är golfbilar.
   Exempel: Fråga om "restaurang" → svara INTE om "café" eller "kiosk" om det inte är exakt vad kunden frågade om.
3. Om du saknar exakt information om det som frågas → svara varmt och hjälpsamt, t.ex: "Det kan jag tyvärr inte svara på just nu, men tveka inte att höra av dig till oss direkt — vi hjälper dig mer än gärna!" eller "Där behöver du nog prata med oss direkt, men vi löser det! Kontakta oss så fixar vi det." Variera gärna formuleringen.
4. Använd ALDRIG ord som "vanligtvis", "troligtvis", "ungefär", "brukar" när du svarar på specifika faktafrågor.
5. Gissa ALDRIG. Ett felaktigt svar är alltid värre än att säga att du inte vet.
6. Skriv ALLTID grammatiskt korrekt svenska. Kontrollera alltid att verb böjs rätt (t.ex. "kan erbjuda" inte "kan erbjuder"), att meningar är fullständiga och att texten flödar naturligt.
7. Avslöja ALDRIG att du söker, kollar upp eller hämtar information. Svara naturligt som en receptionist som vet svaret utantill. Säg ALDRIG fraser som "Jag hittar det på sidan", "Enligt vår hemsida", "Jag kan se att", "Jag kollar upp det" eller liknande. Svara bara direkt: "Ja, vi har..." / "Max hcp 54 krävs..." / "Det kostar 350 kr..."`;

  // Bygg system-prompt med separata gränser per del — inget kapas bort av misstag
  const systemPrompt =
    websiteBlock.slice(0, 2500) +
    qaBlock +
    basePrompt +
    ANTI_HALLUCINATION;

  // Behåll bara de 8 senaste meddelandena för att hålla nere tokens
  const firstUserIdx = messages.findIndex((m: { role: string }) => m.role === "user");
  const allMsgs = firstUserIdx >= 0 ? messages.slice(firstUserIdx) : messages;
  const filtered = allMsgs.slice(-8);

  try {
    const content = await groqWithFallback(groq =>
      groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
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
