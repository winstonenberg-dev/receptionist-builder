import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QUESTIONS } from "@/lib/questions";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const answers = await prisma.answer.findMany({ where: { projectId: id } });
  return NextResponse.json(answers);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { answers } = await req.json();

  await Promise.all(
    answers.map(({ questionKey, question: qLabel, answer }: { questionKey: string; question?: string; answer: string }) => {
      const q = QUESTIONS.find((q) => q.key === questionKey);
      return prisma.answer.upsert({
        where: { projectId_questionKey: { projectId: id, questionKey } },
        update: { answer },
        create: { projectId: id, questionKey, question: qLabel ?? q?.question ?? questionKey, answer },
      });
    })
  );

  return NextResponse.json({ ok: true });
}
