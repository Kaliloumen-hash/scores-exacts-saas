import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const adminId = (session?.user as any)?.id as string | undefined;
  if (!adminId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin?.isAdmin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { paymentId, action } = await req.json(); // action: "confirm" | "reject"

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });

  if (action === "reject") {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "rejected", confirmedBy: adminId },
    });
    return NextResponse.json({ ok: true });
  }

  // Confirmation : on marque le paiement comme réussi et on prolonge l'accès Pro de 30 jours
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "success", paidAt: new Date(), confirmedBy: adminId },
  });

  const user = await prisma.user.findUnique({ where: { id: payment.userId } });
  const base = user?.currentPeriodEnd && user.currentPeriodEnd > new Date() ? user.currentPeriodEnd : new Date();
  const newPeriodEnd = new Date(base);
  newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

  await prisma.user.update({
    where: { id: payment.userId },
    data: { subscriptionPlan: "pro", subscriptionStatus: "active", currentPeriodEnd: newPeriodEnd },
  });

  return NextResponse.json({ ok: true });
}
