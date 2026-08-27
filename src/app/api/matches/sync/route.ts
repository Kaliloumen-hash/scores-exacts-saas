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

/**
 * Synchronisation des matchs + génération des prédictions.
 *
 * Sécurité :
 *
 * 1. Vercel Cron :
 *    Authorization: Bearer CRON_SECRET
 *
 * 2. Test manuel :
 *    /api/matches/sync?test=SYNC_TEST_KEY
 *
 * IMPORTANT :
 * La clé SYNC_TEST_KEY doit uniquement être stockée
 * dans les variables d'environnement Vercel.
 */

async function checkAuthorization(
  req: NextRequest
): Promise<boolean> {
  const cronSecret =
    process.env.CRON_SECRET;

  const testKey =
    process.env.SYNC_TEST_KEY;

  const authHeader =
    req.headers.get("authorization");

  // ========================================
  // 1. AUTHENTIFICATION CRON
  // ========================================

  if (
    cronSecret &&
    authHeader === `Bearer ${cronSecret}`
  ) {
    console.log(
      "✅ Authentification CRON réussie"
    );

    return true;
  }

  // ========================================
  // 2. AUTHENTIFICATION TEST
  // ========================================

  const testParameter =
    req.nextUrl.searchParams.get("test");

  if (
    testKey &&
    testParameter === testKey
  ) {
    console.log(
      "✅ Authentification TEST réussie"
    );

    return true;
  }

  return false;
}

/**
 * Synchronisation principale.
 */
async function syncMatches(
  req: NextRequest
) {
  const startTime =
    Date.now();

  console.log(
    "===================================="
  );

  console.log(
    "🚀 DÉBUT SYNCHRONISATION"
  );

  console.log(
    "===================================="
  );

  try {
    // ========================================
    // 1. SÉCURITÉ
    // ========================================

    console.log(
      "🔐 Vérification de l'autorisation..."
    );

    const authorized =
      await checkAuthorization(req);

    if (!authorized) {
      console.error(
        "❌ Accès non autorisé"
      );

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

    console.log(
      "✅ Autorisation valide"
    );

    // ========================================
    // 2. CALCUL DES DATES
    // ========================================

    const today =
      new Date();

    const fromDateObject =
      new Date(today);

    fromDateObject.setUTCDate(
      fromDateObject.getUTCDate() - 1
    );

    const toDateObject =
      new Date(today);

    toDateObject.setUTCDate(
      toDateObject.getUTCDate() + 1
    );

    const fromDate =
      fromDateObject
        .toISOString()
        .slice(0, 10);

    const toDate =
      toDateObject
        .toISOString()
        .slice(0, 10);

    console.log(
      "===================================="
    );

    console.log(
      `📅 DU : ${fromDate}`
    );

    console.log(
      `📅 AU : ${toDate}`
    );

    console.log(
      "===================================="
    );

    // ========================================
    // 3. API-FOOTBALL
    // ========================================

    let fixtures: any[] = [];

    try {
      console.log(
        "🌐 Récupération des matchs..."
      );

      fixtures =
        await fetchFixturesByDateRange(
          fromDate,
          toDate
        );

      console.log(
        `✅ ${fixtures.length} match(s) récupéré(s)`
      );
    } catch (error) {
      console.error(
        "❌ Erreur API-Football"
      );

      console.error(error);

      throw error;
    }

    // ========================================
    // 4. COMPTEURS
    // ========================================

    let matchesCreated = 0;

    let matchesUpdated = 0;

    let predictionsGenerated = 0;

    let predictionErrors = 0;

    let skippedFixtures = 0;

    let nonNsMatches = 0;

    let statisticsErrors = 0;

    // ========================================
    // 5. TRAITEMENT
    // ========================================

    for (
      let index = 0;
      index < fixtures.length;
      index++
    ) {
      const fixture =
        fixtures[index];

      let homeName =
        "Inconnu";

      let awayName =
        "Inconnu";

      try {
        // ====================================
        // 5.1 VALIDATION
        // ====================================

        if (
          !fixture?.fixture?.id ||
          !fixture?.league?.id ||
          !fixture?.teams?.home?.id ||
          !fixture?.teams?.away?.id
        ) {
          console.warn(
            "⚠️ Match ignoré : données incomplètes"
          );

          skippedFixtures++;

          continue;
        }

        const fixtureId =
          Number(
            fixture.fixture.id
          );

        const leagueId =
          Number(
            fixture.league.id
          );

        const season =
          Number(
            fixture.league.season
          );

        homeName =
          fixture.teams.home.name ??
          "Inconnu";

        awayName =
          fixture.teams.away.name ??
          "Inconnu";

        const leagueName =
          fixture.league.name ??
          "Inconnu";

        const status =
          fixture.fixture?.status?.short ??
          "NS";

        const fixtureDate =
          new Date(
            fixture.fixture.date
          );

        if (
          Number.isNaN(
            fixtureDate.getTime()
          )
        ) {
          console.warn(
            `⚠️ Date invalide : ${homeName} - ${awayName}`
          );

          skippedFixtures++;

          continue;
        }

        console.log(
          "------------------------------------"
        );

        console.log(
          `⚽ MATCH ${index + 1}/${fixtures.length}`
        );

        console.log(
          `🏆 ${leagueName}`
        );

        console.log(
          `🏠 ${homeName}`
        );

        console.log(
          `✈️ ${awayName}`
        );

        console.log(
          `📊 Statut : ${status}`
        );

        // ====================================
        // 5.2 LIGUE
        // ====================================

        const league =
          await prisma.league.upsert({
            where: {
              externalId:
                leagueId,
            },

            update: {
              name:
                leagueName,

              country:
                fixture.league.country ??
                null,

              season,

              logoUrl:
                fixture.league.logo ??
                null,
            },

            create: {
              externalId:
                leagueId,

              name:
                leagueName,

              country:
                fixture.league.country ??
                null,

              season,

              logoUrl:
                fixture.league.logo ??
                null,
            },
          });

        // ====================================
        // 5.3 ÉQUIPE DOMICILE
        // ====================================

        const homeTeam =
          await prisma.team.upsert({
            where: {
              externalId:
                Number(
                  fixture.teams.home.id
                ),
            },

            update: {
              name:
                homeName,

              logoUrl:
                fixture.teams.home.logo ??
                null,

              leagueId:
                league.id,
            },

            create: {
              externalId:
                Number(
                  fixture.teams.home.id
                ),

              name:
                homeName,

              logoUrl:
                fixture.teams.home.logo ??
                null,

              leagueId:
                league.id,
            },
          });

        // ====================================
        // 5.4 ÉQUIPE EXTÉRIEURE
        // ====================================

        const awayTeam =
          await prisma.team.upsert({
            where: {
              externalId:
                Number(
                  fixture.teams.away.id
                ),
            },

            update: {
              name:
                awayName,

              logoUrl:
                fixture.teams.away.logo ??
                null,

              leagueId:
                league.id,
            },

            create: {
              externalId:
                Number(
                  fixture.teams.away.id
                ),

              name:
                awayName,

              logoUrl:
                fixture.teams.away.logo ??
                null,

              leagueId:
                league.id,
            },
          });

        // ====================================
        // 5.5 MATCH
        // ====================================

        const existingMatch =
          await prisma.match.findUnique({
            where: {
              externalId:
                fixtureId,
            },

            select: {
              id: true,
            },
          });

        const match =
          await prisma.match.upsert({
            where: {
              externalId:
                fixtureId,
            },

            update: {
              status,

              kickoffAt:
                fixtureDate,

              leagueId:
                league.id,

              homeTeamId:
                homeTeam.id,

              awayTeamId:
                awayTeam.id,
            },

            create: {
              externalId:
                fixtureId,

              leagueId:
                league.id,

              homeTeamId:
                homeTeam.id,

              awayTeamId:
                awayTeam.id,

              kickoffAt:
                fixtureDate,

              status,
            },
          });

        if (existingMatch) {
          matchesUpdated++;
        } else {
          matchesCreated++;
        }

        // ====================================
        // 5.6 MATCH À VENIR UNIQUEMENT
        // ====================================

        if (status !== "NS") {
          nonNsMatches++;

          continue;
        }

        // ====================================
        // 5.7 STATISTIQUES
        // ====================================

        let homeStatsRaw: any;

        let awayStatsRaw: any;

        try {
          [
            homeStatsRaw,
            awayStatsRaw,
          ] =
            await Promise.all([
              fetchTeamStatistics(
                Number(
                  fixture.teams.home.id
                ),
                leagueId,
                season
              ),

              fetchTeamStatistics(
                Number(
                  fixture.teams.away.id
                ),
                leagueId,
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

        // ====================================
        // 5.8 CONVERSION
        // ====================================

        let homeStats: ReturnType<
          typeof parseTeamAverages
        >;

        let awayStats: ReturnType<
          typeof parseTeamAverages
        >;

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

        // ====================================
        // 5.9 VALIDATION
        // ====================================

        const statsAreValid =
          Number.isFinite(
            homeStats.goalsScoredAvgHome
          ) &&
          Number.isFinite(
            homeStats.goalsConcededAvgHome
          ) &&
          Number.isFinite(
            awayStats.goalsScoredAvgAway
          ) &&
          Number.isFinite(
            awayStats.goalsConcededAvgAway
          ) &&
          homeStats.goalsScoredAvgHome >=
            0 &&
          homeStats.goalsConcededAvgHome >=
            0 &&
          awayStats.goalsScoredAvgAway >=
            0 &&
          awayStats.goalsConcededAvgAway >=
            0;

        if (!statsAreValid) {
          statisticsErrors++;

          console.error(
            `❌ Statistiques invalides : ${homeName} - ${awayName}`
          );

          continue;
        }

        // ====================================
        // 5.10 MOYENNES LIGUE
        // ====================================

        const leagueAverages = {
          avgGoalsHome: 1.4,
          avgGoalsAway: 1.1,
        };

        // ====================================
        // 5.11 PRÉDICTION
        // ====================================

        try {
          const result =
            predictMatch(
              homeStats,
              awayStats,
              leagueAverages
            );

          console.log(
            `🎯 ${homeName} ${result.predictedHomeGoals}-${result.predictedAwayGoals} ${awayName}`
          );

          // ==================================
          // 5.12 ENREGISTREMENT
          // ==================================

          await prisma.prediction.upsert({
            where: {
              matchId:
                match.id,
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
            },

            create: {
              matchId:
                match.id,

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

          console.log(
            `✅ Prédiction enregistrée : ${homeName} - ${awayName}`
          );
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
          "❌ Erreur traitement match"
        );

        console.error(
          `⚽ ${homeName} - ${awayName}`
        );

        console.error(error);
      }
    }

    // ========================================
    // 6. RÉSUMÉ
    // ========================================

    const duration =
      Date.now() - startTime;

    console.log(
      "===================================="
    );

    console.log(
      "🏁 SYNCHRONISATION TERMINÉE"
    );

    console.log(
      "===================================="
    );

    console.log(
      `📅 ${fromDate} → ${toDate}`
    );

    console.log(
      `⚽ Matchs trouvés : ${fixtures.length}`
    );

    console.log(
      `🆕 Créés : ${matchesCreated}`
    );

    console.log(
      `🔄 Mis à jour : ${matchesUpdated}`
    );

    console.log(
      `🤖 Prédictions : ${predictionsGenerated}`
    );

    console.log(
      `❌ Erreurs prédictions : ${predictionErrors}`
    );

    console.log(
      `📊 Erreurs statistiques : ${statisticsErrors}`
    );

    console.log(
      `⏭️ Non NS : ${nonNsMatches}`
    );

    console.log(
      `⚠️ Ignorés : ${skippedFixtures}`
    );

    console.log(
      `⏱️ Durée : ${duration} ms`
    );

    console.log(
      "===================================="
    );

    return NextResponse.json({
      ok: true,

      dateRange: {
        from:
          fromDate,

        to:
          toDate,
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

      durationMs:
        duration,
    });
  } catch (error) {
    console.error(
      "❌ ERREUR GÉNÉRALE"
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
// GET
// ========================================

export async function GET(
  req: NextRequest
) {
  console.log(
    "⏰ GET /api/matches/sync"
  );

  return syncMatches(req);
}

// ========================================
// POST
// ========================================

export async function POST(
  req: NextRequest
) {
  console.log(
    "🔄 POST /api/matches/sync"
  );

  return syncMatches(req);
}
