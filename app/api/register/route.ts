import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email, password, name } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Email och lösenord krävs" }, { status: 400 });
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Email används redan" }, { status: 400 });
  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { email, password: hashed, name } });
  return NextResponse.json({ ok: true });
}
