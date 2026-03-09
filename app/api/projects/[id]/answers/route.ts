import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Auth + ownership in one query
  const project = await prisma.project.findFirst({
    where: { id, user: { email: session.user.email } },
    include: { answers: true },
  });
  if (!project) return NextResponse.json({ error: "Hittades inte eller ej behörig" }, { status: 404 });

  return NextResponse.json(project.answers);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Auth + ownership in one query
  const project = await prisma.project.findFirst({
    where: { id, user: { email: session.user.email } },
  });
  if (!project) return NextResponse.json({ error: "Hittades inte eller ej behörig" }, { status: 404 });

  const { answers } = await req.json();

  await Promise.all(
    answers.map(({ questionKey, question: qLabel, answer }: { questionKey: string; question?: string; answer: string }) =>
      prisma.answer.upsert({
        where: { projectId_questionKey: { projectId: id, questionKey } },
        update: { answer },
        create: { projectId: id, questionKey, question: qLabel ?? questionKey, answer },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
