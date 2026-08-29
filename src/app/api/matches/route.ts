```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/matches
 *
 * Récupère les matchs du :
 * - 26 août 2026
 * - 27 août 2026
 * - 28 août 2026
 *
 * avec les prédictions associées lorsqu'elles existent.
 */
export async function GET() {
  try {
    console.log("====================================");
    console.log("⚽ GET /api/matches");
    console.log("====================================");

    // ========================================
    // PÉRIODE
    // ========================================
    //
    // 26 inclus
    // 29 exclus
    //
    // Donc :
    // 26 août
    // 27 août
    // 28 août
    //
    // ========================================

    const fromDate = new Date("2026-08-26T00:00:00.000Z");
    const toDate = new Date("2026-08-29T00:00:00.000Z");

    console.log(
      `📅 Du ${fromDate.toISOString()}`
    );

    console.log(
      `📅 Au ${toDate.toISOString()}`
    );

    // ========================================
    // RÉCUPÉRATION PRISMA
    // ========================================

    const matches = await prisma.match.findMany({
      where: {
        kickoffAt: {
          gte: fromDate,
          lt: toDate,
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
    });

    console.log(
      `⚽ ${matches.length} match(s) trouvé(s)`
    );

    // ========================================
    // FORMATAGE
    // ========================================

    const formattedMatches = matches.map((match) => {
      return {
        id: match.id,

        externalId: match.externalId,

        homeTeam: {
          id: match.homeTeam.id,
          externalId: match.homeTeam.externalId,
          name: match.homeTeam.name,
          logoUrl: match.homeTeam.logoUrl,
        },

        awayTeam: {
          id: match.awayTeam.id,
          externalId: match.awayTeam.externalId,
          name: match.awayTeam.name,
          logoUrl: match.awayTeam.logoUrl,
        },

        league: {
          id: match.league.id,
          externalId: match.league.externalId,
          name: match.league.name,
          country: match.league.country,
          logoUrl: match.league.logoUrl,
          season: match.league.season,
        },

        kickoffAt: match.kickoffAt,

        status: match.status,

        homeScore: match.homeScore,

        awayScore: match.awayScore,

        prediction: match.prediction
          ? {
              id: match.prediction.id,

              predictedHomeGoals:
                match.prediction.predictedHomeGoals,

              predictedAwayGoals:
                match.prediction.predictedAwayGoals,

              exactScoreProb:
                match.prediction.exactScoreProb,

              homeWinProb:
                match.prediction.homeWinProb,

              drawProb:
                match.prediction.drawProb,

              awayWinProb:
                match.prediction.awayWinProb,

              scoreDistribution:
                match.prediction.scoreDistribution,

              modelVersion:
                match.prediction.modelVersion,

              generatedAt:
                match.prediction.generatedAt,
            }
          : null,
      };
    });

    // ========================================
    // STATISTIQUES
    // ========================================

    const predictionsCount =
      formattedMatches.filter(
        (match) => match.prediction !== null
      ).length;

    const withoutPredictionCount =
      formattedMatches.length - predictionsCount;

    console.log(
      `🤖 ${predictionsCount} match(s) avec prédiction`
    );

    console.log(
      `⚠️ ${withoutPredictionCount} match(s) sans prédiction`
    );

    console.log("====================================");
    console.log("✅ API MATCHES TERMINÉE");
    console.log("====================================");

    // ========================================
    // RÉPONSE
    // ========================================

    return NextResponse.json(
      {
        ok: true,

        dateRange: {
          from: "2026-08-26",
          to: "2026-08-28",
        },

        count: formattedMatches.length,

        predictionsCount,

        withoutPredictionCount,

        matches: formattedMatches,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("====================================");
    console.error("❌ ERREUR /api/matches");
    console.error("====================================");

    console.error(error);

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Impossible de récupérer les matchs.",
      },
      {
        status: 500,
      }
    );
  }
}
```
