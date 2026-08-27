import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("❌ CRON_SECRET est manquant");
    return false;
  }

  const authorization = req.headers.get("authorization");

  return authorization === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  try {
    // ========================================
    // SÉCURITÉ
    // ========================================

    if (!isAuthorized(req)) {
      console.error("❌ Accès non autorisé /api/matches");

      return NextResponse.json(
        {
          ok: false,
          error: "Non autorisé",
        },
        {
          status: 401,
        }
      );
    }

    // ========================================
    // RÉCUPÉRATION DES MATCHS
    // ========================================

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

    // ========================================
    // FORMATAGE
    // ========================================

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
      `✅ /api/matches : ${formattedMatches.length} match(s)`
    );

    // ========================================
    // RÉPONSE
    // ========================================

    return NextResponse.json({
      ok: true,
      matches: formattedMatches,
    });
  } catch (error) {
    console.error(
      "❌ Erreur /api/matches"
    );

    console.error(error);

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
