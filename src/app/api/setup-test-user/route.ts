import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      email: "test@example.com",
      passwordHash: "$2b$10$koXeF8wWflqV0E/mXXDp8uHnC5bYeJYla9a.zOCsvaspBlPge32wi",
      name: "Utilisateur Test",
    },
  });
  return NextResponse.json({ ok: true, userId: user.id });
}
