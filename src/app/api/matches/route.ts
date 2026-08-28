```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FROM_DATE = new Date("2026-08-26T00:00:00.000Z");
const TO_DATE = new Date("2026-08-29T00:00:00.000Z");

export async function GET(_req: NextRequest) {
  try {
    console.log("GET /api/matches");

    const matches = await prisma.match.findMany({
      where: {
        kickoffAt: {
          gte: FROM_DATE,
          lt: TO_DATE,
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

    const formattedMatches = matches.map((match) => {
      let prediction = null;

      if (match.prediction) {
        prediction = {
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
        };
      }

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

        prediction: prediction,
      };
    });

    const predictionCount = formattedMatches.filter(
      (match) => match.prediction !== null
    ).length;

    const upcomingCount = formattedMatches.filter(
      (match) => match.status === "NS"
    ).length;

    const finishedCount = formattedMatches.filter(
      (match) => match.status === "FT"
    ).length;

    console.log(
      "Matchs trouvés:",
      formattedMatches.length
    );

    console.log(
      "Prédictions:",
      predictionCount
    );

    return NextResponse.json(
      {
        ok: true,

        dateRange: {
          from: "2026-08-26",
          to: "2026-08-28",
        },

        count: formattedMatches.length,

        predictionCount: predictionCount,

        upcomingCount: upcomingCount,

        finishedCount: finishedCount,

        matches: formattedMatches,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "ERREUR /api/matches"
    );

    console.error(error);

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Impossible de récupérer les matchs.",

        dateRange: {
          from: "2026-08-26",
          to: "2026-08-28",
        },

        matches: [],
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  req: NextRequest
) {
  return GET(req);
}
```
