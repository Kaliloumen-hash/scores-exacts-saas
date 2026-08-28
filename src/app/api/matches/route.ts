```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * ============================================================
 * /api/matches
 * ============================================================
 *
 * Matchs affichés :
 *
 * 26 août 2026
 * 27 août 2026
 * 28 août 2026
 *
 * Le 25 et le 29 août sont exclus.
 *
 * Cette route est une route de LECTURE.
 * Elle ne nécessite PAS CRON_SECRET.
 * ============================================================
 */

export async function GET(_req: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("====================================");
    console.log("⚽ GET /api/matches");
    console.log("====================================");

    // ----------------------------------------------------------
    // PÉRIODE : 26 → 28 AOÛT 2026
    // ----------------------------------------------------------
    //
    // gte = 26 août 00:00 UTC
    // lt  = 29 août 00:00 UTC
    //
    // Cela inclut entièrement :
    // 26 août
    // 27 août
    // 28 août
    //
    // et exclut :
    // 25 août
    // 29 août
    // ----------------------------------------------------------

    const fromDate = new Date(
      "2026-08-26T00:00:00.000Z"
    );

    const toDate = new Date(
      "2026-08-29T00:00:00.000Z"
    );

    console.log(
      `📅 Du ${fromDate.toISOString()}`
    );

    console.log(
      `📅 Au ${toDate.toISOString()}`
    );

    // ----------------------------------------------------------
    // RÉCUPÉRATION DES MATCHS
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // FORMATAGE
    // ----------------------------------------------------------

    const formattedMatches = matches.map(
      (match) => {
        const prediction =
          match.prediction;

        return {
          id: match.id,

          externalId:
            match.externalId,

          homeTeam: {
            id: match.homeTeam.id,

            externalId:
              match.homeTeam.externalId,

            name:
              match.homeTeam.name,

            logoUrl:
              match.homeTeam.logoUrl,
          },

          awayTeam: {
            id: match.awayTeam.id,

            externalId:
              match.awayTeam.externalId,

            name:
              match.awayTeam.name,

            logoUrl:
              match.awayTeam.logoUrl,
          },

          league: {
            id:
              match.league.id,

            externalId:
              match.league.externalId,

            name:
              match.league.name,

            country:
              match.league.country,

            logoUrl:
              match.league.logoUrl,

            season:
              match.league.season,
          },

          kickoffAt:
            match.kickoffAt,

          status:
            match.status,

          homeScore:
            match.homeScore,

          awayScore:
            match.awayScore,

          prediction:
            prediction
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
      }
    );

    // ----------------------------------------------------------
    // STATISTIQUES
    // ----------------------------------------------------------

    const predictionCount =
      formattedMatches.filter(
        (match) =>
          match.prediction !== null
      ).length;

    const upcomingCount =
      formattedMatches.filter(
        (match) =>
          match.status === "NS"
      ).length;

    const finishedCount =
      formattedMatches.filter(
        (match) =>
          match.status === "FT"
      ).length;

    const durationMs =
      Date.now() - startTime;

    console.log(
      `🤖 Prédictions : ${predictionCount}`
    );

    console.log(
      `⏳ Matchs à venir : ${upcomingCount}`
    );

    console.log(
      `🏁 Matchs terminés : ${finishedCount}`
    );

    console.log(
      `⏱️ Durée : ${durationMs} ms`
    );

    console.log("====================================");
    console.log("✅ /api/matches OK");
    console.log("====================================");

    // ----------------------------------------------------------
    // RÉPONSE
    // ----------------------------------------------------------

    return NextResponse.json(
      {
        ok: true,

        dateRange: {
          from: "2026-08-26",
          to: "2026-08-28",
        },

        count:
          formattedMatches.length,

        predictionCount,

        upcomingCount,

        finishedCount,

        durationMs,

        matches:
          formattedMatches,
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
    console.error(
      "===================================="
    );

    console.error(
      "❌ ERREUR /api/matches"
    );

    console.error(
      "===================================="
    );

    if (error instanceof Error) {
      console.error(
        "Message :",
        error.message
      );

      console.error(
        "Stack :",
        error.stack
      );
    } else {
      console.error(error);
    }

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
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}

/**
 * ============================================================
 * POST
 * ============================================================
 *
 * Pour éviter les erreurs côté frontend si celui-ci utilise
 * POST par erreur, on autorise également POST à effectuer
 * exactement la même lecture.
 *
 * Aucune modification de base de données.
 * ============================================================
 */

export async function POST(
  req: NextRequest
) {
  return GET(req);
}
```
