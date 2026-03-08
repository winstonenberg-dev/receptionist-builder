import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const prompt = await prisma.systemPrompt.findFirst({ where: { projectId: id }, orderBy: { version: "desc" } });
  return NextResponse.json(prompt);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { prompt } = await req.json();
  const latest = await prisma.systemPrompt.findFirst({ where: { projectId: id }, orderBy: { version: "desc" } });
  const saved = await prisma.systemPrompt.create({
    data: { projectId: id, prompt, version: (latest?.version ?? 0) + 1 },
  });
  return NextResponse.json(saved);
}
