import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { name: true, answers: { select: { questionKey: true, answer: true } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const get = (key: string) => project.answers.find(a => a.questionKey === key)?.answer ?? null;

  return NextResponse.json({
    name: project.name,
    botName: get("appearance_bot_name") || project.name,
    theme:  get("appearance_theme")    || "dark",
    accent: get("appearance_accent")   || "#a855f7",
    size:   get("appearance_size")     || "medium",
  });
}
