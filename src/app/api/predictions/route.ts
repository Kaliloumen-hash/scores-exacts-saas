import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

const FREE_PLAN_DAILY_LIMIT = 3; // nombre de prédictions consultables/jour en plan gratuit

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isPro = user?.subscriptionPlan === "pro" && user.subscriptionStatus === "active";

  // Vérification du quota pour les utilisateurs gratuits
  if (!isPro) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const viewsToday = await prisma.predictionView.count({
      where: { userId, viewedAt: { gte: since } },
    });
    if (viewsToday >= FREE_PLAN_DAILY_LIMIT) {
      return NextResponse.json(
        { error: "Quota gratuit atteint. Passez au plan Pro pour un accès illimité." },
        { status: 403 }
      );
    }
  }

  // Récupère les prochains matchs avec leur prédiction
  const matches = await prisma.match.findMany({
    where: { status: "scheduled", prediction: { isNot: null } },
    include: { homeTeam: true, awayTeam: true, league: true, prediction: true },
    orderBy: { kickoffAt: "asc" },
    take: 20,
  });

  return NextResponse.json({ matches, isPro });
}
