import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/projects/[id]/lock
// Body: { locked: true, pin: "1234" } to lock, { locked: false, pin: "1234" } to unlock
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { id } = await params;
  const { locked, pin } = await req.json();

  const project = await prisma.project.findFirst({
    where: { id, user: { email: session.user.email } },
  });
  if (!project) return NextResponse.json({ error: "Projekt hittades inte eller ej behörig" }, { status: 404 });

  if (locked) {
    // Locking: require a PIN
    if (!pin || String(pin).trim().length < 4) {
      return NextResponse.json({ error: "PIN måste vara minst 4 tecken" }, { status: 400 });
    }
    await prisma.project.update({
      where: { id },
      data: { promptLocked: true, lockPin: String(pin).trim() },
    });
  } else {
    // Unlocking: verify PIN first
    if (project.promptLocked && project.lockPin && project.lockPin !== String(pin).trim()) {
      return NextResponse.json({ error: "Fel PIN-kod" }, { status: 403 });
    }
    await prisma.project.update({
      where: { id },
      data: { promptLocked: false, lockPin: null },
    });
  }

  return NextResponse.json({ locked });
}

// POST /api/projects/[id]/lock/verify — check PIN without unlocking
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { id } = await params;
  const { pin } = await req.json();

  const project = await prisma.project.findFirst({
    where: { id, user: { email: session.user.email } },
  });
  if (!project) return NextResponse.json({ error: "Ej behörig" }, { status: 404 });

  if (!project.promptLocked) return NextResponse.json({ ok: true });
  if (project.lockPin === String(pin).trim()) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Fel PIN-kod" }, { status: 403 });
}
