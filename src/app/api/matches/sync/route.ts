import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FREE_PLAN_DAILY_LIMIT = 3;

export async function GET(req: NextRequest) {
  try {
    /*
     * ============================================================
     * 1. RÉCUPÉRATION DE LA SESSION
     * ============================================================
     *
     * La connexion n'est plus obligatoire pour afficher
     * les prédictions publiques du dashboard.
     */

    const session =
      await getServerSession(authOptions);

    let isPro = false;
    let userId: string | null = null;

    if (session?.user) {
      userId =
        (session.user as { id?: string }).id ??
        null;

      if (userId) {
        const user =
          await prisma.user.findUnique({
            where: {
              id: userId,
            },

            select: {
              subscriptionPlan: true,
              subscriptionStatus: true,
            },
          });

        isPro =
          user?.subscriptionPlan === "pro" &&
          user?.subscriptionStatus === "active";
      }
    }

    /*
     * ============================================================
     * 2. QUOTA UTILISATEUR CONNECTÉ
     * ============================================================
     *
     * Les utilisateurs gratuits connectés restent limités
     * à 3 consultations par jour.
     *
     * Les visiteurs non connectés peuvent voir la liste
     * publique du dashboard.
     */

    if (
      userId &&
      !isPro
    ) {
      const since =
        new Date();

      since.setHours(
        0,
        0,
        0,
        0
      );

      const viewsToday =
        await prisma.predictionView.count({
          where: {
            userId,

            viewedAt: {
              gte: since,
            },
          },
        });

      if (
        viewsToday >=
        FREE_PLAN_DAILY_LIMIT
      ) {
        return NextResponse.json(
          {
            error:
              "Quota gratuit atteint. Passez au plan Pro pour un accès illimité.",
            isPro: false,
            quotaReached: true,
          },
          {
            status: 403,
          }
        );
      }
    }

    /*
     * ============================================================
     * 3. DATE ACTUELLE
     * ============================================================
     *
     * On récupère uniquement les matchs à venir.
     */

    const now =
      new Date();

    /*
     * ============================================================
     * 4. RÉCUPÉRATION DES PRÉDICTIONS
     * ============================================================
     *
     * On prend les matchs :
     * - prévus
     * - avec une prédiction
     * - à partir de maintenant
     *
     * Limite : 20 matchs.
     */

    const matches =
      await prisma.match.findMany({
        where: {
          kickoffAt: {
            gte: now,
          },

          status: "NS",

          prediction: {
            isNot: null,
          },
        },

        include: {
          homeTeam: true,
          awayTeam: true,
          league: true,
          prediction: true,
        },

        orderBy: {
          kickoffAt: "asc",
        },

        take: 20,
      });

    /*
     * ============================================================
     * 5. RÉPONSE
     * ============================================================
     */

    return NextResponse.json({
      success: true,

      count:
        matches.length,

      matches,

      isPro,

      quotaReached: false,
    });
  } catch (error) {
    console.error(
      "❌ Erreur /api/predictions :",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Impossible de récupérer les prédictions.",
      },
      {
        status: 500,
      }
    );
  }
}
