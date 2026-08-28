```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    /*
     * ========================================
     * DATES À AFFICHER
     * ========================================
     *
     * 26 août 2026
     * 27 août 2026
     * 28 août 2026
     */

    const fromDate = new Date("2026-08-26T00:00:00.000Z");
    const toDate = new Date("2026-08-29T00:00:00.000Z");

    console.log("====================================");
    console.log("⚽ GET /api/matches");
    console.log("====================================");
    console.log("📅 Du :", fromDate.toISOString());
    console.log("📅 Au :", toDate.toISOString());

    /*
     * ========================================
     * RÉCUPÉRATION DES MATCHS
     * ========================================
     */

    const matches = await prisma.match.findMany({
      where: {
        kickoffAt: {
          gte: fromDate,
          lt: toDate,
        },
      },

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

    console.log(
      `⚽ ${matches.length} match(s) trouvé(s)`
    );

    /*
     * ========================================
     * FORMATAGE POUR LE FRONTEND
     * ========================================
     */

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
              predictedHomeGoals:
                match.prediction
                  .predictedHomeGoals,

              predictedAwayGoals:
                match.prediction
                  .predictedAwayGoals,

              exactScoreProb:
                match.prediction
                  .exactScoreProb,

              homeWinProb:
                match.prediction
                  .homeWinProb,

              drawProb:
                match.prediction
                  .drawProb,

              awayWinProb:
                match.prediction
                  .awayWinProb,

              scoreDistribution:
                match.prediction
                  .scoreDistribution,

              modelVersion:
                match.prediction
                  .modelVersion,

              generatedAt:
                match.prediction
                  .generatedAt,
            }
          : null,
      };
    });

    /*
     * ========================================
     * RÉPONSE
     * ========================================
     *
     * isPro reste false ici.
     * L'accès Premium pourra être géré
     * séparément par le frontend / système
     * d'abonnement.
     */

    return NextResponse.json({
      ok: true,

      dateRange: {
        from: "2026-08-26",
        to: "2026-08-28",
      },

      count: formattedMatches.length,

      matches: formattedMatches,

      isPro: false,
    });
  } catch (error) {
    console.error(
      "❌ Erreur GET /api/matches"
    );

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
