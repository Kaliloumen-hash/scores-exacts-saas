```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/matches
 *
 * Retourne UNIQUEMENT les matchs du :
 * 26 août 2026
 * 27 août 2026
 * 28 août 2026
 *
 * Les matchs du 25 et du 29 août sont exclus.
 *
 * GET /api/matches
 */
export async function GET(req: NextRequest) {
  try {
    console.log("====================================");
    console.log("⚽ GET /api/matches");
    console.log("====================================");

    // ============================================================
    // 1. PÉRIODE AUTORISÉE
    // ============================================================

    const fromDate = new Date("2026-08-26T00:00:00.000Z");
    const toDate = new Date("2026-08-29T00:00:00.000Z");

    console.log(
      `📅 Période : ${fromDate.toISOString()} → ${toDate.toISOString()}`
    );

    // ============================================================
    // 2. RÉCUPÉRATION DES MATCHS
    // ============================================================

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
      `✅ ${matches.length} match(s) trouvé(s)`
    );

    // ============================================================
    // 3. FORMATAGE POUR LE DASHBOARD
    // ============================================================

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

    // ============================================================
    // 4. INFORMATIONS POUR LE DASHBOARD
    // ============================================================

    const predictionCount =
      formattedMatches.filter(
        (match) => match.prediction !== null
      ).length;

    const upcomingCount =
      formattedMatches.filter(
        (match) => match.status === "NS"
      ).length;

    const finishedCount =
      formattedMatches.filter(
        (match) =>
          match.status === "FT"
      ).length;

    // ============================================================
    // 5. RÉPONSE
    // ============================================================

    console.log(
      `🤖 Prédictions disponibles : ${predictionCount}`
    );

    console.log(
      `⏳ Matchs à venir : ${upcomingCount}`
    );

    console.log(
      `🏁 Matchs terminés : ${finishedCount}`
    );

    console.log("====================================");
    console.log("✅ /api/matches terminé");
    console.log("====================================");

    return NextResponse.json(
      {
        ok: true,

        dateRange: {
          from: "2026-08-26",
          to: "2026-08-28",
        },

        count: formattedMatches.length,

        predictionCount,

        upcomingCount,

        finishedCount,

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
            : "Erreur inconnue",
      },
      {
        status: 500,
      }
    );
  }
}
```
