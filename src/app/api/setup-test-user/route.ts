import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const password = "ScoresTest2026!";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {
      passwordHash,
    },
    create: {
      email: "test@example.com",
      passwordHash,
      name: "Utilisateur Test",
    },
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email,
    password,
    passwordHash,
  });
}
