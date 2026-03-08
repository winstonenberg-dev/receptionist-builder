import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { id } = await params;

  // Verify ownership
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Hittades inte" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (project.userId !== user?.id) return NextResponse.json({ error: "Ej behörig" }, { status: 403 });

  // Delete related records first, then project
  await prisma.answer.deleteMany({ where: { projectId: id } });
  await prisma.systemPrompt.deleteMany({ where: { projectId: id } });
  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      prompts: { orderBy: { version: "desc" }, take: 1 },
      answers: { select: { questionKey: true, answer: true } },
      _count: { select: { prompts: true, answers: true } },
    },
  });

  if (!project) return NextResponse.json({ error: "Hittades inte" }, { status: 404 });

  return NextResponse.json({
    ...project,
    latestVersion: project.prompts[0]?.version ?? null,
    latestPromptUpdated: project.prompts[0]?.updatedAt ?? null,
    hasWebsite: project.answers.some(a => a.questionKey === "website_knowledge" && a.answer),
    hasSynthesis: project.answers.some(a => a.questionKey === "synthesis_findings" && a.answer),
  });
}
