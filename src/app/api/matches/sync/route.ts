import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import {
  fetchFixturesByDateRange,
  fetchTeamStatistics,
  parseTeamAverages,
} from "@/lib/footballApi";

import { predictMatch } from "@/lib/prediction";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function syncMatches(req: NextRequest) {
  const startTime = Date.now();

  try {
    // ========================================
    // 1. VÉRIFICATION DU CRON SECRET
    // ========================================

    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");

    if (!cronSecret) {
      return NextResponse.json(
        {
          ok: false,
          error: "CRON_SECRET manquant dans les variables d'environnement.",
        },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          ok: false,
          error: "Non autorisé",
        },
        { status: 401 }
      );
    }

    // ========================================
    // 2. DATES À SYNCHRONISER
    // ========================================
    //
    // Aujourd'hui + 2 jours
    //
    // Exemple le 27 août :
    // 27, 28 et 29 août
    //
    // ========================================

    const today = new Date();

    const fromDateObject = new Date(today);
    fromDateObject.setUTCHours(0, 0, 0, 0);

    const toDateObject = new Date(today);
    toDateObject.setUTCHours(0, 0, 0, 0);
    toDateObject.setUTCDate(
      toDateObject.getUTCDate() + 2
    );

    const fromDate = fromDateObject
      .toISOString()
      .slice(0, 10);

    const toDate = toDateObject
      .toISOString()
      .slice(0, 10);

    console.log("====================================");
    console.log("🚀 SYNCHRONISATION MATCHS");
    console.log("====================================");
    console.log(`📅 Du ${fromDate} au ${toDate}`);

    // ========================================
    // 3. RÉCUPÉRATION DES MATCHS
    // ========================================

    const fixtures = await fetchFixturesByDateRange(
      fromDate,
      toDate
    );

    console.log(
      `⚽ ${fixtures.length} matchs récupérés`
    );

    // ========================================
    // 4. COMPTEURS
    // ========================================

    let matchesCreated = 0;
    let matchesUpdated = 0;

    let predictionsGenerated = 0;
    let predictionErrors = 0;

    let statisticsErrors = 0;
    let skippedFixtures = 0;
    let nonNsMatches = 0;

    // ========================================
    // 5. TRAITEMENT DES MATCHS
    // ========================================

    for (const fixture of fixtures) {
      let homeName = "Inconnu";
      let awayName = "Inconnu";

      try {
        // ======================================
        // VALIDATION
        // ======================================

        if (
          !fixture?.fixture?.id ||
          !fixture?.league?.id ||
          !fixture?.teams?.home?.id ||
          !fixture?.teams?.away?.id
        ) {
          skippedFixtures++;
          continue;
        }

        const fixtureId = Number(
          fixture.fixture.id
        );

        const leagueExternalId = Number(
          fixture.league.id
        );

        const season = Number(
          fixture.league.season
        );

        homeName =
          fixture.teams.home.name ?? "Inconnu";

        awayName =
          fixture.teams.away.name ?? "Inconnu";

        const leagueName =
          fixture.league.name ?? "Inconnu";

        const country =
          fixture.league.country ?? "Inconnu";

        const status =
          fixture.fixture.status?.short ?? "NS";

        const kickoffAt = new Date(
          fixture.fixture.date
        );

        if (
          Number.isNaN(
            kickoffAt.getTime()
          )
        ) {
          skippedFixtures++;
          continue;
        }

        console.log(
          `⚽ ${homeName} - ${awayName} | ${status}`
        );

        // ======================================
        // LIGUE
        // ======================================

        const league =
          await prisma.league.upsert({
            where: {
              externalId: leagueExternalId,
            },
            update: {
              name: leagueName,
              country,
              season,
              logoUrl:
                fixture.league.logo ?? null,
            },
            create: {
              externalId: leagueExternalId,
              name: leagueName,
              country,
              season,
              logoUrl:
                fixture.league.logo ?? null,
            },
          });

        // ======================================
        // ÉQUIPE DOMICILE
        // ======================================

        const homeTeamExternalId = Number(
          fixture.teams.home.id
        );

        const homeTeam =
          await prisma.team.upsert({
            where: {
              externalId:
                homeTeamExternalId,
            },
            update: {
              name: homeName,
              logoUrl:
                fixture.teams.home.logo ?? null,
              leagueId: league.id,
            },
            create: {
              externalId:
                homeTeamExternalId,
              name: homeName,
              logoUrl:
                fixture.teams.home.logo ?? null,
              leagueId: league.id,
            },
          });

        // ======================================
        // ÉQUIPE EXTÉRIEURE
        // ======================================

        const awayTeamExternalId = Number(
          fixture.teams.away.id
        );

        const awayTeam =
          await prisma.team.upsert({
            where: {
              externalId:
                awayTeamExternalId,
            },
            update: {
              name: awayName,
              logoUrl:
                fixture.teams.away.logo ?? null,
              leagueId: league.id,
            },
            create: {
              externalId:
                awayTeamExternalId,
              name: awayName,
              logoUrl:
                fixture.teams.away.logo ?? null,
              leagueId: league.id,
            },
          });

        // ======================================
        // MATCH
        // ======================================

        const existingMatch =
          await prisma.match.findUnique({
            where: {
              externalId: fixtureId,
            },
            select: {
              id: true,
            },
          });

        const homeScore =
          fixture.goals?.home != null
            ? Number(fixture.goals.home)
            : null;

        const awayScore =
          fixture.goals?.away != null
            ? Number(fixture.goals.away)
            : null;

        const match =
          await prisma.match.upsert({
            where: {
              externalId: fixtureId,
            },
            update: {
              leagueId: league.id,
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              kickoffAt,
              status,
              homeScore,
              awayScore,
            },
            create: {
              externalId: fixtureId,
              leagueId: league.id,
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              kickoffAt,
              status,
              homeScore,
              awayScore,
            },
          });

        if (existingMatch) {
          matchesUpdated++;
        } else {
          matchesCreated++;
        }

        // ======================================
        // UNIQUEMENT LES MATCHS À VENIR
        // ======================================

        if (status !== "NS") {
          nonNsMatches++;
          continue;
        }

        // ======================================
        // RÉCUPÉRATION DES STATISTIQUES
        // ======================================

        let homeStatsRaw: any;
        let awayStatsRaw: any;

        try {
          [
            homeStatsRaw,
            awayStatsRaw,
          ] = await Promise.all([
            fetchTeamStatistics(
              homeTeamExternalId,
              leagueExternalId,
              season
            ),

            fetchTeamStatistics(
              awayTeamExternalId,
              leagueExternalId,
              season
            ),
          ]);
        } catch (error) {
          statisticsErrors++;

          console.error(
            `❌ Erreur statistiques : ${homeName} - ${awayName}`
          );

          console.error(error);

          continue;
        }

        // ======================================
        // CONVERSION DES STATISTIQUES
        // ======================================

        let homeStats;
        let awayStats;

        try {
          homeStats =
            parseTeamAverages(
              homeStatsRaw
            );

          awayStats =
            parseTeamAverages(
              awayStatsRaw
            );
        } catch (error) {
          statisticsErrors++;

          console.error(
            "❌ Erreur conversion statistiques"
          );

          console.error(error);

          continue;
        }

        // ======================================
        // VALIDATION DES STATISTIQUES
        // ======================================

        const statsAreValid =
          Number.isFinite(
            homeStats.goalsScoredAvgHome
          ) &&
          Number.isFinite(
            homeStats.goalsConcededAvgHome
          ) &&
          Number.isFinite(
            homeStats.goalsScoredAvgAway
          ) &&
          Number.isFinite(
            homeStats.goalsConcededAvgAway
          );

        if (!statsAreValid) {
          statisticsErrors++;
          continue;
        }

        // ======================================
        // MOYENNES DE LA LIGUE
        // ======================================

        const leagueAverages = {
          avgGoalsHome: 1.4,
          avgGoalsAway: 1.1,
        };

        // ======================================
        // PRÉDICTION
        // ======================================

        try {
          const result = predictMatch(
            homeStats,
            awayStats,
            leagueAverages
          );

          console.log(
            `🎯 ${homeName} ${result.predictedHomeGoals}-${result.predictedAwayGoals} ${awayName}`
          );

          // ====================================
          // ENREGISTREMENT
          // ====================================

          await prisma.prediction.upsert({
            where: {
              matchId: match.id,
            },

            update: {
              predictedHomeGoals:
                result.predictedHomeGoals,

              predictedAwayGoals:
                result.predictedAwayGoals,

              exactScoreProb:
                result.exactScoreProb,

              homeWinProb:
                result.homeWinProb,

              drawProb:
                result.drawProb,

              awayWinProb:
                result.awayWinProb,

              scoreDistribution:
                result.scoreDistribution,

              modelVersion:
                "poisson-v1",

              generatedAt:
                new Date(),
            },

            create: {
              matchId: match.id,

              predictedHomeGoals:
                result.predictedHomeGoals,

              predictedAwayGoals:
                result.predictedAwayGoals,

              exactScoreProb:
                result.exactScoreProb,

              homeWinProb:
                result.homeWinProb,

              drawProb:
                result.drawProb,

              awayWinProb:
                result.awayWinProb,

              scoreDistribution:
                result.scoreDistribution,

              modelVersion:
                "poisson-v1",
            },
          });

          predictionsGenerated++;
        } catch (error) {
          predictionErrors++;

          console.error(
            `❌ Erreur prédiction : ${homeName} - ${awayName}`
          );

          console.error(error);
        }
      } catch (error) {
        predictionErrors++;

        console.error(
          `❌ Erreur match : ${homeName} - ${awayName}`
        );

        console.error(error);
      }
    }

    // ========================================
    // 6. RÉSULTAT
    // ========================================

    const durationMs =
      Date.now() - startTime;

    console.log("====================================");
    console.log("🏁 SYNCHRONISATION TERMINÉE");
    console.log("====================================");

    console.log(
      `⚽ Matchs trouvés : ${fixtures.length}`
    );

    console.log(
      `🆕 Matchs créés : ${matchesCreated}`
    );

    console.log(
      `🔄 Matchs mis à jour : ${matchesUpdated}`
    );

    console.log(
      `🤖 Prédictions : ${predictionsGenerated}`
    );

    console.log(
      `📊 Erreurs statistiques : ${statisticsErrors}`
    );

    console.log(
      `❌ Erreurs prédictions : ${predictionErrors}`
    );

    console.log(
      `⏭️ Matchs non NS : ${nonNsMatches}`
    );

    console.log(
      `⚠️ Matchs ignorés : ${skippedFixtures}`
    );

    console.log(
      `⏱️ Durée : ${durationMs} ms`
    );

    console.log("====================================");

    return NextResponse.json({
      ok: true,

      dateRange: {
        from: fromDate,
        to: toDate,
      },

      fixturesFound:
        fixtures.length,

      matchesCreated,

      matchesUpdated,

      predictionsGenerated,

      predictionErrors,

      statisticsErrors,

      nonNsMatches,

      skippedFixtures,

      durationMs,
    });
  } catch (error) {
    console.error(
      "❌ ERREUR GÉNÉRALE /api/matches/sync"
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

// ========================================
// GET — VERCEL CRON
// ========================================

export async function GET(
  req: NextRequest
) {
  return syncMatches(req);
}

// ========================================
// POST — TEST MANUEL
// ========================================

export async function POST(
  req: NextRequest
) {
  return syncMatches(req);
}
