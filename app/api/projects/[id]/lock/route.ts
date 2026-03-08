import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locked } = await req.json();

  await prisma.project.update({
    where: { id },
    data: { promptLocked: locked },
  });

  return NextResponse.json({ locked });
}
