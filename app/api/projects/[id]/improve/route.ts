import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";

function getGroqKey(): string {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const match = content.match(/GROQ_API_KEY=([^\r\n]+)/);
    return match?.[1]?.trim() ?? "";
  } catch { return ""; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { instruction } = await req.json();
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (project?.promptLocked) {
    return NextResponse.json({ error: "Prompten är låst. Lås upp den först." }, { status: 403 });
  }

  const latest = await prisma.systemPrompt.findFirst({
    where: { projectId: id },
    orderBy: { version: "desc" },
  });

  const currentPrompt = latest?.prompt ?? "Du är en AI-receptionist. Svara på svenska.";
  const nextVersion = (latest?.version ?? 0) + 1;

  try {
    const groq = new Groq({ apiKey: getGroqKey() });
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Du är en expert på att skriva system-promptar för AI-receptionister.
Du får en befintlig system-prompt och en instruktion om hur den ska förbättras.
Returnera BARA den uppdaterade system-prompten — ingen annan text, inga kommentarer, ingen förklaring.

ABSOLUTA REGLER SOM ALDRIG FÅR BRYTAS:
1. Skriv ALDRIG in specifika fakta (priser, tider, telefonnummer, adresser, öppettider, kapacitet etc.) som inte redan finns i den befintliga prompten eller explicit uppges i instruktionen.
2. Om instruktionen säger "förbättra svar om priser" men inga priser finns → skriv in en regel att receptionisten ska säga "Jag har tyvärr inte den informationen — kontakta oss direkt." Uppfinn INGA siffror.
3. Om instruktionen säger "förbättra svar om öppettider" men inga tider finns → samma princip. Hänvisa, uppfinn inte.
4. Skriv ALDRIG in fraser som "vanligtvis", "brukar", "troligtvis X kr" eller andra uppskattningar om specifika fakta.
5. Det är alltid bättre att receptionisten säger "det vet jag inte" än att den uppger felaktig information. En felaktig uppgift förstör all trovärdighet.`,
        },
        {
          role: "user",
          content: `BEFINTLIG SYSTEM-PROMPT:\n${currentPrompt}\n\nINSTRUKTION: ${instruction}`,
        },
      ],
      max_tokens: 2000,
    });

    const newPrompt = res.choices[0].message.content ?? currentPrompt;
    await prisma.systemPrompt.create({
      data: { projectId: id, prompt: newPrompt, version: nextVersion },
    });

    return NextResponse.json({ prompt: newPrompt, version: nextVersion });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
