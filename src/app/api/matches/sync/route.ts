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

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 *
 * Avec le forfait API-Football Free, on limite volontairement
 * la synchronisation aux dates accessibles.
 *
 * Aujourd'hui : 27 août 2026
 *
 * On récupère :
 * - hier
 * - aujourd'hui
 * - demain
 *
 * Donc :
 * 26/08/2026
 * 27/08/2026
 * 28/08/2026
 *
 * Le 29/08 n'est PAS demandé à API-Football.
 */

const FREE_PLAN_DAYS_AHEAD = 1;

/*
 * ============================================================
 * OUTIL : AUTHENTIFICATION
 * ============================================================
 */

function isAuthorized(req: NextRequest): boolean {
  const cronSecret =
    process.env.CRON_SECRET;

  const testKey =
    process.env.SYNC_TEST_KEY;

  /*
   * Autorisation Vercel Cron.
   */
  const authorization =
    req.headers.get("authorization");

  if (
    cronSecret &&
    authorization ===
      `Bearer ${cronSecret}`
  ) {
    return true;
  }

  /*
   * Autorisation test manuel.
   *
   * Exemple :
   * /api/matches/sync?test=TA_CLE
   */
  const test =
    req.nextUrl.searchParams.get("test");

  if (
    testKey &&
    test === testKey
  ) {
    return true;
  }

  return false;
}

/*
 * ============================================================
 * OUTIL : DATE YYYY-MM-DD
 * ============================================================
 */

function formatDate(
  date: Date
): string {
  return date
    .toISOString()
    .slice(0, 10);
}

/*
 * ============================================================
 * OUTIL : DATE AVEC DÉCALAGE
 * ============================================================
 */

function addDays(
  date: Date,
  days: number
): Date {
  const result =
    new Date(date);

  result.setUTCDate(
    result.getUTCDate() + days
  );

  return result;
}

/*
 * ============================================================
 * OUTIL : STATISTIQUES DE SECOURS
 * ============================================================
 *
 * Si API-Football ne fournit pas de statistiques pour une
 * équipe, on ne bloque plus la prédiction.
 */

function getFallbackStats() {
  return {
    goalsScoredAvgHome: 1.4,
    goalsConcededAvgHome: 1.1,
    goalsScoredAvgAway: 1.1,
    goalsConcededAvgAway: 1.4,
  };
}

/*
 * ============================================================
 * TRAITEMENT PRINCIPAL
 * ============================================================
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
    "🚀 DÉBUT SYNCHRONISATION MATCHS"
  );

  console.log(
    "===================================="
  );

  /*
   * ==========================================================
   * 1. AUTHENTIFICATION
   * ==========================================================
   */

  if (!isAuthorized(req)) {
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

  /*
   * ==========================================================
   * 2. CALCUL DES DATES
   * ==========================================================
   */

  const today =
    new Date();

  const fromDate =
    formatDate(
      addDays(today, -1)
    );

  const toDate =
    formatDate(
      addDays(
        today,
        FREE_PLAN_DAYS_AHEAD
      )
    );

  console.log(
    "===================================="
  );

  console.log(
    `📅 Période : ${fromDate} → ${toDate}`
  );

  console.log(
    "===================================="
  );

  /*
   * ==========================================================
   * 3. RÉCUPÉRATION DES MATCHS
   * ==========================================================
   */

  let fixtures: any[] = [];

  try {
    fixtures =
      await fetchFixturesByDateRange(
        fromDate,
        toDate
      );
  } catch (error) {
    console.error(
      "❌ Erreur récupération API-Football"
    );

    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur API-Football",
      },
      {
        status: 500,
      }
    );
  }

  console.log(
    `⚽ ${fixtures.length} match(s) récupéré(s)`
  );

  /*
   * ==========================================================
   * 4. COMPTEURS
   * ==========================================================
   */

  let matchesCreated = 0;
  let matchesUpdated = 0;

  let predictionsGenerated = 0;

  let predictionErrors = 0;

  let statisticsErrors = 0;

  let fallbackStatisticsUsed = 0;

  let nonNsMatches = 0;

  let skippedFixtures = 0;

  /*
   * ==========================================================
   * 5. TRAITEMENT DES MATCHS
   * ==========================================================
   */

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
      /*
       * ========================================================
       * 5.1 VALIDATION
       * ========================================================
       */

      if (
        !fixture?.fixture?.id ||
        !fixture?.league?.id ||
        !fixture?.teams?.home?.id ||
        !fixture?.teams?.away?.id ||
        !fixture?.fixture?.date
      ) {
        skippedFixtures++;

        console.warn(
          "⚠️ Fixture ignorée : données incomplètes"
        );

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
        fixture.fixture.status?.short ??
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
        skippedFixtures++;

        console.warn(
          `⚠️ Date invalide : ${homeName} - ${awayName}`
        );

        continue;
      }

      /*
       * ========================================================
       * 5.2 LOG
       * ========================================================
       */

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

      /*
       * ========================================================
       * 5.3 LIGUE
       * ========================================================
       */

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

      /*
       * ========================================================
       * 5.4 ÉQUIPE DOMICILE
       * ========================================================
       */

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

      /*
       * ========================================================
       * 5.5 ÉQUIPE EXTÉRIEURE
       * ========================================================
       */

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

      /*
       * ========================================================
       * 5.6 MATCH
       * ========================================================
       */

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

      /*
       * ========================================================
       * 5.7 UNIQUEMENT LES MATCHS À VENIR
       * ========================================================
       */

      if (status !== "NS") {
        nonNsMatches++;

        continue;
      }

      /*
       * ========================================================
       * 5.8 STATISTIQUES
       * ========================================================
       */

      let homeStats =
        getFallbackStats();

      let awayStats =
        getFallbackStats();

      let homeStatsAvailable =
        false;

      let awayStatsAvailable =
        false;

      try {
        const [
          homeStatsRaw,
          awayStatsRaw,
        ] = await Promise.all([
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

        /*
         * Conversion.
         */
        if (homeStatsRaw) {
          try {
            const parsed =
              parseTeamAverages(
                homeStatsRaw
              );

            if (
              Number.isFinite(
                parsed.goalsScoredAvgHome
              ) &&
              Number.isFinite(
                parsed.goalsConcededAvgHome
              ) &&
              Number.isFinite(
                parsed.goalsScoredAvgAway
              ) &&
              Number.isFinite(
                parsed.goalsConcededAvgAway
              ) &&
              (
                parsed.goalsScoredAvgHome >
                  0 ||
                parsed.goalsConcededAvgHome >
                  0 ||
                parsed.goalsScoredAvgAway >
                  0 ||
                parsed.goalsConcededAvgAway >
                  0
              )
            ) {
              homeStats =
                parsed;

              homeStatsAvailable =
                true;
            }
          } catch {
            console.warn(
              `⚠️ Statistiques invalides domicile : ${homeName}`
            );
          }
        }

        if (awayStatsRaw) {
          try {
            const parsed =
              parseTeamAverages(
                awayStatsRaw
              );

            if (
              Number.isFinite(
                parsed.goalsScoredAvgHome
              ) &&
              Number.isFinite(
                parsed.goalsConcededAvgHome
              ) &&
              Number.isFinite(
                parsed.goalsScoredAvgAway
              ) &&
              Number.isFinite(
                parsed.goalsConcededAvgAway
              ) &&
              (
                parsed.goalsScoredAvgHome >
                  0 ||
                parsed.goalsConcededAvgHome >
                  0 ||
                parsed.goalsScoredAvgAway >
                  0 ||
                parsed.goalsConcededAvgAway >
                  0
              )
            ) {
              awayStats =
                parsed;

              awayStatsAvailable =
                true;
            }
          } catch {
            console.warn(
              `⚠️ Statistiques invalides extérieur : ${awayName}`
            );
          }
        }
      } catch (error) {
        statisticsErrors++;

        console.warn(
          `⚠️ Statistiques indisponibles : ${homeName} - ${awayName}`
        );

        console.warn(error);
      }

      /*
       * Si une des deux équipes n'a pas de stats,
       * on utilise le fallback.
       */

      if (
        !homeStatsAvailable
      ) {
        fallbackStatisticsUsed++;

        console.log(
          `🔧 Fallback statistiques : ${homeName}`
        );
      }

      if (
        !awayStatsAvailable
      ) {
        fallbackStatisticsUsed++;

        console.log(
          `🔧 Fallback statistiques : ${awayName}`
        );
      }

      /*
       * ========================================================
       * 5.9 MOYENNES DE LIGUE
       * ========================================================
       */

      const leagueAverages = {
        avgGoalsHome: 1.4,
        avgGoalsAway: 1.1,
      };

      /*
       * ========================================================
       * 5.10 PRÉDICTION
       * ========================================================
       */

      try {
        const result =
          predictMatch(
            homeStats,
            awayStats,
            leagueAverages
          );

        /*
         * ======================================================
         * 5.11 ENREGISTREMENT
         * ======================================================
         */

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
              "poisson-v2",
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
              "poisson-v2",
          },
        });

        predictionsGenerated++;

        console.log(
          `🤖 PRÉDICTION : ${homeName} ${result.predictedHomeGoals}-${result.predictedAwayGoals} ${awayName}`
        );

        console.log(
          `🎯 Score exact : ${(result.exactScoreProb * 100).toFixed(2)}%`
        );

        console.log(
          `🏠 1 : ${(result.homeWinProb * 100).toFixed(2)}%`
        );

        console.log(
          `🤝 N : ${(result.drawProb * 100).toFixed(2)}%`
        );

        console.log(
          `✈️ 2 : ${(result.awayWinProb * 100).toFixed(2)}%`
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
        `❌ Erreur traitement : ${homeName} - ${awayName}`
      );

      console.error(error);
    }
  }

  /*
   * ==========================================================
   * 6. RÉSUMÉ
   * ==========================================================
   */

  const durationMs =
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
    `⚽ Fixtures : ${fixtures.length}`
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
    `📊 Erreurs statistiques : ${statisticsErrors}`
  );

  console.log(
    `🔧 Fallbacks utilisés : ${fallbackStatisticsUsed}`
  );

  console.log(
    `❌ Erreurs prédictions : ${predictionErrors}`
  );

  console.log(
    `⏭️ Non NS : ${nonNsMatches}`
  );

  console.log(
    `⚠️ Ignorés : ${skippedFixtures}`
  );

  console.log(
    `⏱️ Durée : ${durationMs} ms`
  );

  console.log(
    "===================================="
  );

  /*
   * ==========================================================
   * 7. RÉPONSE
   * ==========================================================
   */

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

    fallbackStatisticsUsed,

    nonNsMatches,

    skippedFixtures,

    durationMs,
  });
}

/*
 * ============================================================
 * GET — VERCEL CRON / TEST
 * ============================================================
 */

export async function GET(
  req: NextRequest
) {
  return syncMatches(req);
}

/*
 * ============================================================
 * POST — TEST MANUEL
 * ============================================================
 */

export async function POST(
  req: NextRequest
) {
  return syncMatches(req);
}
