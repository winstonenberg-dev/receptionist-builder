import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { name, websiteUrl, industry } = await req.json();
    const project = await prisma.project.create({
      data: { userId: session.user.id, name, websiteUrl: websiteUrl || null, industry: industry || null },
    });
    return NextResponse.json(project);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/projects error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
