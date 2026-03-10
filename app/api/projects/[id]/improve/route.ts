import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGroqClient } from "@/lib/groq";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { instruction } = await req.json();
  const { id } = await params;

  // Auth + ownership in one query
  const project = await prisma.project.findFirst({
    where: { id, user: { email: session.user.email } },
  });
  if (!project) return NextResponse.json({ error: "Projekt hittades inte eller ej behörig" }, { status: 404 });

  if (project.promptLocked) {
    return NextResponse.json({ error: "Prompten är låst. Lås upp den först." }, { status: 403 });
  }

  const latest = await prisma.systemPrompt.findFirst({
    where: { projectId: id },
    orderBy: { version: "desc" },
  });

  const currentPrompt = latest?.prompt ?? "Du är en AI-receptionist. Svara på svenska.";
  const nextVersion = (latest?.version ?? 0) + 1;

  try {
    const groq = getGroqClient();
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
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("improve error:", detail);
    if (detail.includes("429") || detail.toLowerCase().includes("rate limit")) {
      return NextResponse.json({ error: "AI-kvot slut för idag — försök igen senare." }, { status: 429 });
    }
    return NextResponse.json({ error: `Fel: ${detail}` }, { status: 500 });
  }
}
