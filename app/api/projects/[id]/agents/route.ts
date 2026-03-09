import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function ask(groq: Groq, system: string, user: string, maxTokens = 700): Promise<string> {
  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: maxTokens,
  });
  return res.choices[0].message.content ?? "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { id } = await params;

  // Auth + ownership in one query
  const project = await prisma.project.findFirst({
    where: { id, user: { email: session.user.email } },
    include: { answers: true },
  });
  if (!project) return NextResponse.json({ error: "Projekt hittades inte eller ej behörig" }, { status: 404 });

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });
  const tv = tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });

  const industry = project.industry || "verksamhet";
  const bizName = project.name;
  const currentMonth = new Date().toLocaleString("sv-SE", { month: "long", year: "numeric" });

  const websiteKnowledge = project.answers.find(a => a.questionKey === "website_knowledge")?.answer ?? "";
  const websiteCtx = websiteKnowledge
    ? `\n\nKUNSKAP FRÅN HEMSIDAN:\n${websiteKnowledge.slice(0, 2000)}`
    : "";
  // Larger slice for final synthesis (more room for facts)
  const websiteCtxFull = websiteKnowledge
    ? `\n\nKUNSKAP FRÅN HEMSIDAN:\n${websiteKnowledge.slice(0, 5000)}`
    : "";

  // Konkreta Q&A-svar från 30-frågor-wizarden (telefon, öppettider, priser m.m.)
  const INTERNAL_KEYS = new Set(["website_knowledge", "faq_findings", "service_findings", "focus_findings", "season_findings", "industry_findings", "synthesis_findings"]);
  const qaAnswers = project.answers
    .filter(a => !INTERNAL_KEYS.has(a.questionKey) && a.answer.trim())
    .map(a => `${a.question}: ${a.answer}`)
    .join("\n");
  const qaCtx = qaAnswers
    ? `\n\nKUNDENS EGNA SVAR (konkreta uppgifter):\n${qaAnswers}`
    : "";

  // ── PHASE 1: Search + 5 agents in parallel (allSettled = no total failure) ─
  const settled = await Promise.allSettled([
    tv.search(`vanliga frågor kunder ställer ${industry} Sverige`, { maxResults: 5 }),
    tv.search(`${industry} kundservice standard kvalitet Sverige 2025`, { maxResults: 4 }),

    ask(groq,
      `Du är kundserviceexpert inom ${industry}. Lista de 8 vanligaste frågorna som kunder ställer, med korta svar. Numrerad lista på svenska.`,
      `Företag: ${bizName}, Bransch: ${industry}${websiteCtx}`
    ),
    ask(groq,
      `Du är expert på kundbemötande och kommunikation. Ge 6 konkreta riktlinjer för hur en AI-receptionist ska bemöta kunder inom ${industry}: ton, språk, empati, hantering av missnöjda kunder, hur man avslutar konversationer professionellt. Svenska.`,
      `Företag: ${bizName}${websiteCtx}`
    ),
    ask(groq,
      `Du är strategikonsult för AI-chatbotar. Analysera vad en AI-receptionist för ett ${industry} bör prioritera. Ge 6 konkreta prioriteringar: vad ska botten alltid fråga om, vad ska den alltid nämna, hur ska den hantera bokningar, vad ska den eskalera till personal. Svenska, konkret.`,
      `Företag: ${bizName}${websiteCtx}`
    ),
    ask(groq,
      `Du är expert på säsongsanpassad kommunikation. Det är ${currentMonth}. Ge 4 konkreta tips för hur chatboten ska anpassas till denna tid på året för ett ${industry}. Vad är aktuellt nu? Vad bör botten proaktivt nämna? Svenska.`,
      `Företag: ${bizName}${websiteCtx}`
    ),
    ask(groq,
      `Du är branschexpert inom ${industry}. Beskriv 5 viktiga branschspecifika saker en AI-receptionist måste känna till och kommunicera korrekt. Inkludera branschtermer, vanliga missuppfattningar, och vad som skiljer bra från dålig service i branschen. Svenska.`,
      `Företag: ${bizName}${websiteCtx}`
    ),
  ]);

  const val = <T>(i: number, fallback: T): T =>
    settled[i].status === "fulfilled" ? (settled[i] as PromiseFulfilledResult<T>).value : fallback;

  const faqSearch      = val(0, { results: [] } as { results: unknown[] });
  const industrySearch = val(1, { results: [] } as { results: unknown[] });
  const faqResult      = val(2, "");
  const serviceResult  = val(3, "");
  const focusResult    = val(4, "");
  const seasonResult   = val(5, "");
  const industryResult = val(6, "");

  // ── PHASE 2: Synthesis agent ──────────────────────────────────────────────
  const synthesisResult = await ask(groq,
    `Du är senior AI-konsult specialiserad på konversations-AI. Din uppgift är att analysera alla agenters resultat och skapa en sammanfattning med konkreta förbättringsförslag för AI-receptionisten. Strukturera som:
1. STYRKOR: Vad botten redan borde hantera bra baserat på kunskapen
2. KRITISKA LUCKOR: Vad som saknas eller behöver förtydligas
3. FÖRBÄTTRINGSFÖRSLAG: 5 konkreta åtgärder som förbättrar botten mest
4. PROAKTIVA MÖJLIGHETER: Hur botten kan överraska kunder positivt

Svenska, konkret och handlingsorienterat.`,
    `FÖRETAG: ${bizName}
BRANSCH: ${industry}
PERIOD: ${currentMonth}
${qaCtx}
FAQ AGENT:\n${faqResult}

BEMÖTANDE AGENT:\n${serviceResult}

PRIORITET AGENT:\n${focusResult}

SÄSONG AGENT:\n${seasonResult}

BRANSCH AGENT:\n${industryResult}${websiteCtx}`,
    900
  );

  // ── PHASE 3: Generate system prompt ──────────────────────────────────────
  const systemPromptText = await ask(groq,
    `Du är senior AI-arkitekt. Skapa en komplett system-prompt för en AI-receptionist baserat på informationen nedan.

KRAV:
1. Börja: "Du är en vänlig och professionell receptionist för [företagsnamn]."
2. Inkludera ALLA konkreta faktauppgifter från "KUNDENS EGNA SVAR" — telefonnummer, adress, öppettider, priser etc. måste finnas med exakt som angivna
3. Inkludera tydliga riktlinjer för kundbemötande och ton anpassade till ${industry}
4. Lista vad botten ska prioritera och fokusera på
5. Inkludera säsongsanpassning för ${currentMonth}
6. Kunskapsregel: svara bara på det du vet, annars "Det vet jag tyvärr inte — kontakta oss direkt på [telefonnummer/email]."
7. Svara på svenska om inte kunden skriver annat

VIKTIGT: Skriv BARA den färdiga system-prompten, ingen annan text. Hitta INTE på fakta som inte finns i underlaget.`,
    `FÖRETAG: ${bizName}
BRANSCH: ${industry}
${qaCtx}
FAQ-ANALYS:\n${faqResult}
BEMÖTANDE:\n${serviceResult}
PRIORITET:\n${focusResult}
SÄSONG:\n${seasonResult}
BRANSCH:\n${industryResult}
SYNTES:\n${synthesisResult}${websiteCtxFull}`,
    2000
  );

  const latest = await prisma.systemPrompt.findFirst({ where: { projectId: id }, orderBy: { version: "desc" } });
  await prisma.systemPrompt.create({
    data: { projectId: id, prompt: systemPromptText, version: (latest?.version ?? 0) + 1 },
  });

  const agentSaves = [
    { key: "faq_findings",       question: "FAQ-agent",        answer: faqResult },
    { key: "service_findings",   question: "Ton-agent",        answer: serviceResult },
    { key: "focus_findings",     question: "Prioritets-agent", answer: focusResult },
    { key: "season_findings",    question: "Säsongs-agent",    answer: seasonResult },
    { key: "industry_findings",  question: "Bransch-agent",    answer: industryResult },
    { key: "synthesis_findings", question: "Syntes-agent",     answer: synthesisResult },
  ];
  await Promise.all(agentSaves.map(a =>
    prisma.answer.upsert({
      where: { projectId_questionKey: { projectId: id, questionKey: a.key } },
      update: { answer: a.answer },
      create: { projectId: id, questionKey: a.key, question: a.question, answer: a.answer },
    })
  ));

  return NextResponse.json({
    faq:       { findings: faqResult,       searchResults: faqSearch.results.length },
    service:   { findings: serviceResult },
    focus:     { findings: focusResult },
    season:    { findings: seasonResult,    currentMonth },
    industry:  { findings: industryResult,  searchResults: industrySearch.results.length },
    synthesis: { findings: synthesisResult },
    promptSaved: true,
  });
}
