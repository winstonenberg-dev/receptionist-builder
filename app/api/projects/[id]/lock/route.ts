import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { id } = await params;
  const { locked } = await req.json();

  // Auth + ownership in one query
  const project = await prisma.project.findFirst({
    where: { id, user: { email: session.user.email } },
  });
  if (!project) return NextResponse.json({ error: "Projekt hittades inte eller ej behörig" }, { status: 404 });

  await prisma.project.update({
    where: { id },
    data: { promptLocked: locked },
  });

  return NextResponse.json({ locked });
}
