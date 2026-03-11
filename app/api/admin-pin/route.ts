import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — check if a PIN is set
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  return NextResponse.json({ hasPin: !!user?.adminPin });
}

// POST — set or update PIN  { pin: "1234" }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { pin } = await req.json();
  if (!pin || String(pin).trim().length < 4) {
    return NextResponse.json({ error: "PIN måste vara minst 4 tecken" }, { status: 400 });
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data: { adminPin: String(pin).trim() },
  });

  return NextResponse.json({ ok: true });
}

// PUT — verify PIN  { pin: "1234" }
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { pin } = await req.json();
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });

  if (!user?.adminPin) return NextResponse.json({ ok: true }); // no PIN set = open
  if (user.adminPin === String(pin).trim()) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: "Fel PIN-kod" }, { status: 403 });
}

// DELETE — remove PIN
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  await prisma.user.update({
    where: { email: session.user.email },
    data: { adminPin: null },
  });

  return NextResponse.json({ ok: true });
}
