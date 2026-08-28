```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const fromDate = new Date("2026-08-26T00:00:00.000Z");
    const toDate = new Date("2026-08-29T00:00:00.000Z");

    const matches = await prisma.match.findMany({
      where: {
        kickoffAt: {
          gte: fromDate,
          lt: toDate
        }
      },
      orderBy: {
        kickoffAt: "asc"
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        league: true,
        prediction: true
      }
    });

    const result = matches.map(function (match) {
      return {
        id: match.id,
        externalId: match.externalId,

        homeTeam: {
          id: match.homeTeam.id,
          externalId: match.homeTeam.externalId,
          name: match.homeTeam.name,
          logoUrl: match.homeTeam.logoUrl
        },

        awayTeam: {
          id: match.awayTeam.id,
          externalId: match.awayTeam.externalId,
          name: match.awayTeam.name,
          logoUrl: match.awayTeam.logoUrl
        },

        league: {
          id: match.league.id,
          externalId: match.league.externalId,
          name: match.league.name,
          country: match.league.country,
          logoUrl: match.league.logoUrl,
          season: match.league.season
        },

        kickoffAt: match.kickoffAt,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,

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
                match.prediction.generatedAt
            }
          : null
      };
    });

    return NextResponse.json({
      ok: true,
      dateRange: {
        from: "2026-08-26",
        to: "2026-08-28"
      },
      count: result.length,
      matches: result,
      isPro: false
    });
  } catch (error) {
    console.error("Erreur API matches:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Impossible de recuperer les matchs."
      },
      {
        status: 500
      }
    );
  }
}
```
