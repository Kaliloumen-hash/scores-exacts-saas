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
        homeTeam: true,
        awayTeam: true,
        league: true,
        prediction: true,
      },
    });

    const formattedMatches = matches.map((match) => {
      const prediction = match.prediction;

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

        prediction: prediction
          ? {
              predictedHomeGoals:
                prediction.predictedHomeGoals,

              predictedAwayGoals:
                prediction.predictedAwayGoals,

              exactScoreProb:
                prediction.exactScoreProb,

              homeWinProb:
                prediction.homeWinProb,

              drawProb:
                prediction.drawProb,

              awayWinProb:
                prediction.awayWinProb,

              scoreDistribution:
                prediction.scoreDistribution,

              modelVersion:
                prediction.modelVersion,

              generatedAt:
                prediction.generatedAt,
            }
          : null,
      };
    });

    console.log(
      `✅ ${formattedMatches.length} match(s) envoyé(s) au dashboard`
    );

    const predictionsCount =
      formattedMatches.filter(
        (match) => match.prediction !== null
      ).length;

    return NextResponse.json(
      {
        ok: true,

        matches: formattedMatches,

        count: formattedMatches.length,

        predictionsCount,

        isPro: false,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "❌ Erreur /api/matches :",
      error
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue",

        matches: [],

        isPro: false,
      },
      {
        status: 500,
      }
    );
  }
}
