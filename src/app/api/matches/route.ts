```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
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

    const result = matches.map((match) => ({
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

    return NextResponse.json(
      {
        ok: true,
        count: result.length,
        predictionsCount: result.filter(
          (match) => match.prediction !== null
        ).length,
        matches: result,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("API MATCHES ERROR:", error);

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
