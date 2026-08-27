```typescript
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * API PUBLIQUE DU DASHBOARD
 *
 * IMPORTANT :
 * - Aucun CRON_SECRET ici.
 * - Aucun secret n'est envoyé au navigateur.
 * - Le CRON_SECRET reste uniquement dans /api/matches/sync.
 *
 * Cette route sert uniquement à afficher les matchs
 * et leurs prédictions dans le dashboard.
 */

export async function GET() {
  try {
    console.log("====================================");
    console.log("⚽ GET /api/matches");
    console.log("====================================");

    const matches = await prisma.match.findMany({
      orderBy: {
        kickoffAt: "asc",
      },

      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
        prediction: true,
      },
    });

    const formattedMatches = matches.map((match) => ({
      id: match.id,

      externalId: match.externalId,

      kickoffAt: match.kickoffAt,

      status: match.status,

      homeScore: match.homeScore,

      awayScore: match.awayScore,

      league: {
        id: match.league.id,

        name: match.league.name,

        country: match.league.country,

        logoUrl: match.league.logoUrl,
      },

      homeTeam: {
        id: match.homeTeam.id,

        name: match.homeTeam.name,

        logoUrl: match.homeTeam.logoUrl,
      },

      awayTeam: {
        id: match.awayTeam.id,

        name: match.awayTeam.name,

        logoUrl: match.awayTeam.logoUrl,
      },

      prediction: match.prediction
        ? {
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
    }));

    console.log(
      `✅ ${formattedMatches.length} match(s) envoyé(s) au dashboard`
    );

    const predictionsCount =
      formattedMatches.filter(
        (match) => match.prediction !== null
      ).length;

    console.log(
      `🤖 ${predictionsCount} prédiction(s) disponible(s)`
    );

    return NextResponse.json(
      {
        ok: true,

        count: formattedMatches.length,

        predictionsCount,

        matches: formattedMatches,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",

          Pragma: "no-cache",

          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("====================================");

    console.error(
      "❌ ERREUR GET /api/matches"
    );

    console.error(error);

    console.error("====================================");

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue",
      },
      {
        status: 500,
      }
    );
  }
}
```

