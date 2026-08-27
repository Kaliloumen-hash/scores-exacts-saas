import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FREE_PLAN_DAILY_LIMIT = 3;

export async function GET(req: NextRequest) {
  try {
    console.log("====================================");
    console.log("🔮 GET /api/predictions");
    console.log("====================================");

    /*
     * ============================================================
     * 1. SESSION
     * ============================================================
     */

    const session =
      await getServerSession(authOptions);

    let userId: string | null = null;
    let isPro = false;

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

    console.log(
      `👤 Utilisateur : ${
        userId ?? "visiteur"
      }`
    );

    console.log(
      `⭐ Pro : ${isPro}`
    );

    /*
     * ============================================================
     * 2. QUOTA GRATUIT
     * ============================================================
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

      console.log(
        `📊 Vues aujourd'hui : ${viewsToday}/${FREE_PLAN_DAILY_LIMIT}`
      );

      if (
        viewsToday >=
        FREE_PLAN_DAILY_LIMIT
      ) {
        return NextResponse.json(
          {
            success: false,

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
     */

    const now =
      new Date();

    console.log(
      `📅 Maintenant : ${now.toISOString()}`
    );

    /*
     * ============================================================
     * 4. MATCHS FUTURS AVEC PRÉDICTION
     * ============================================================
     *
     * IMPORTANT :
     * On ne filtre plus sur status = "NS".
     *
     * La date de coup d'envoi est la référence principale.
     */

    const matches =
      await prisma.match.findMany({
        where: {
          kickoffAt: {
            gte: now,
          },

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

    console.log(
      `⚽ ${matches.length} match(s) futur(s) avec prédiction`
    );

    /*
     * ============================================================
     * 5. SI AUCUN MATCH
     * ============================================================
     */

    if (matches.length === 0) {
      console.warn(
        "⚠️ Aucun match futur avec prédiction trouvé."
      );

      /*
       * Diagnostic :
       * on regarde combien de prédictions existent
       * réellement dans la base.
       */

      const predictionCount =
        await prisma.prediction.count();

      const matchCount =
        await prisma.match.count();

      console.log(
        `📊 Nombre total de matchs : ${matchCount}`
      );

      console.log(
        `🤖 Nombre total de prédictions : ${predictionCount}`
      );
    }

    /*
     * ============================================================
     * 6. RÉPONSE
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
      "===================================="
    );

    console.error(
      "❌ ERREUR /api/predictions"
    );

    console.error(
      "===================================="
    );

    console.error(error);

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Impossible de récupérer les prédictions.",

        isPro: false,
      },
      {
        status: 500,
      }
    );
  }
}
