```typescript
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
 * Le Cron reste protégé par CRON_SECRET.
 *
 * Pour un test manuel :
 *
 * GET /api/matches/sync?test=1&key=TA_CLE_DE_TEST
 *
 * Il faut définir dans Vercel :
 *
 * SYNC_TEST_KEY=une-cle-secrete
 *
 * IMPORTANT :
 * Ne jamais mettre CRON_SECRET directement dans le navigateur.
 */

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const testKey = process.env.SYNC_TEST_KEY;

  const authorization =
    req.headers.get("authorization");

  /*
   * Autorisation Cron
   */
  if (
    cronSecret &&
    authorization === `Bearer ${cronSecret}`
  ) {
    return true;
  }

  /*
   * Autorisation test manuel
   */
  const key =
    req.nextUrl.searchParams.get("key");

  const test =
    req.nextUrl.searchParams.get("test");

  if (
    test === "1" &&
    testKey &&
    key === testKey
  ) {
    return true;
  }

  return false;
}

/*
 * ============================================================
 * DATE DU JOUR
 * ============================================================
 */

function formatUTCDate(
  date: Date
): string {
  return date
    .toISOString()
    .slice(0, 10);
}

/*
 * ============================================================
 * SYNCHRONISATION
 * ============================================================
 */

async function syncMatches(
  req: NextRequest
) {
  const startTime = Date.now();

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
    /*
     * ========================================================
     * 1. SÉCURITÉ
     * ========================================================
     */

    console.log(
      "🔐 Vérification autorisation..."
    );

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
     * ========================================================
     * 2. DATES
     * ========================================================
     *
     * On synchronise :
     *
     * hier
     * aujourd'hui
     * demain
     *
     * Cela évite de demander automatiquement
     * des dates trop éloignées au forfait gratuit.
     */

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
      formatUTCDate(
        fromDateObject
      );

    const toDate =
      formatUTCDate(
        toDateObject
      );

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

    /*
     * ========================================================
     * 3. RÉCUPÉRATION DES MATCHS
     * ========================================================
     */

    console.log(
      "🌐 Connexion API-Football..."
    );

    let fixtures: any[] = [];

    try {
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
        "❌ ERREUR API-FOOTBALL"
      );

      console.error(error);

      throw error;
    }

    /*
     * ========================================================
     * 4. COMPTEURS
     * ========================================================
     */

    let matchesCreated = 0;
    let matchesUpdated = 0;

    let predictionsGenerated = 0;
    let predictionErrors = 0;

    let skippedFixtures = 0;
    let nonNsMatches = 0;

    let statisticsErrors = 0;
    let fallbackStatisticsUsed = 0;

    /*
     * ========================================================
     * 5. TRAITEMENT DES MATCHS
     * ========================================================
     */

    console.log(
      "===================================="
    );

    console.log(
      "⚽ DÉBUT TRAITEMENT MATCHS"
    );

    console.log(
      "===================================="
    );

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
         * ====================================================
         * 5.1 VALIDATION
         * ====================================================
         */

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

        const leagueCountry =
          fixture.league.country ??
          "Inconnu";

        const status =
          fixture.fixture?.status?.short ??
          "NS";

        const fixtureDate =
          new Date(
            fixture.fixture.date
          );

        /*
         * ====================================================
         * 5.2 DATE
         * ====================================================
         */

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
          `🆔 Fixture : ${fixtureId}`
        );

        console.log(
          `🏆 Ligue : ${leagueName}`
        );

        console.log(
          `🌍 Pays : ${leagueCountry}`
        );

        console.log(
          `🏠 ${homeName}`
        );

        console.log(
          `✈️ ${awayName}`
        );

        console.log(
          `📅 Date : ${fixtureDate.toISOString()}`
        );

        console.log(
          `📊 Statut : ${status}`
        );

        /*
         * ====================================================
         * 5.3 LIGUE
         * ====================================================
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
                leagueCountry,

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
                leagueCountry,

              season,

              logoUrl:
                fixture.league.logo ??
                null,
            },
          });

        /*
         * ====================================================
         * 5.4 ÉQUIPE DOMICILE
         * ====================================================
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
         * ====================================================
         * 5.5 ÉQUIPE EXTÉRIEURE
         * ====================================================
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
         * ====================================================
         * 5.6 SCORES
         * ====================================================
         */

        const homeScore =
          fixture.goals?.home != null
            ? Number(
                fixture.goals.home
              )
            : null;

        const awayScore =
          fixture.goals?.away != null
            ? Number(
                fixture.goals.away
              )
            : null;

        /*
         * ====================================================
         * 5.7 MATCH
         * ====================================================
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

              homeScore,

              awayScore,
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

              homeScore,

              awayScore,
            },
          });

        if (existingMatch) {
          matchesUpdated++;

          console.log(
            "🔄 Match mis à jour"
          );
        } else {
          matchesCreated++;

          console.log(
            "🆕 Match créé"
          );
        }

        /*
         * ====================================================
         * 5.8 MATCH À VENIR
         * ====================================================
         *
         * On accepte plusieurs statuts utilisés par
         * API-Football pour les matchs programmés.
         */

        const upcomingStatuses =
          new Set([
            "NS",
            "TBD",
            "PST",
          ]);

        if (
          !upcomingStatuses.has(
            status
          )
        ) {
          nonNsMatches++;

          console.log(
            `⏭️ Pas de prédiction : statut ${status}`
          );

          continue;
        }

        /*
         * ====================================================
         * 5.9 STATISTIQUES
         * ====================================================
         */

        let homeStatsRaw: any =
          null;

        let awayStatsRaw: any =
          null;

        try {
          console.log(
            `📊 Stats domicile : ${homeName}`
          );

          console.log(
            `📊 Stats extérieur : ${awayName}`
          );

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

          console.log(
            "✅ Statistiques récupérées"
          );
        } catch (error) {
          statisticsErrors++;

          console.warn(
            "⚠️ Statistiques indisponibles"
          );

          console.warn(
            `⚽ ${homeName} - ${awayName}`
          );

          console.warn(error);
        }

        /*
         * ====================================================
         * 5.10 CONVERSION STATS
         * ====================================================
         */

        let homeStats: ReturnType<
          typeof parseTeamAverages
        > | null = null;

        let awayStats: ReturnType<
          typeof parseTeamAverages
        > | null = null;

        try {
          if (
            homeStatsRaw &&
            awayStatsRaw
          ) {
            homeStats =
              parseTeamAverages(
                homeStatsRaw
              );

            awayStats =
              parseTeamAverages(
                awayStatsRaw
              );
          }
        } catch (error) {
          statisticsErrors++;

          console.warn(
            "⚠️ Erreur conversion statistiques"
          );

          console.warn(error);
        }

        /*
         * ====================================================
         * 5.11 VALIDATION STATS
         * ====================================================
         */

        const validStats =
          homeStats &&
          awayStats &&
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

        /*
         * ====================================================
         * 5.12 FALLBACK
         * ====================================================
         *
         * Si API-Football ne fournit pas les statistiques,
         * on utilise des valeurs neutres raisonnables.
         *
         * Cela permet au moteur de continuer à produire
         * une prédiction au lieu de perdre le match.
         */

        if (!validStats) {
          fallbackStatisticsUsed++;

          console.warn(
            "⚠️ Utilisation des statistiques de secours"
          );

          homeStats = {
            goalsScoredAvgHome: 1.4,
            goalsConcededAvgHome: 1.1,
            goalsScoredAvgAway: 1.1,
            goalsConcededAvgAway: 1.2,
            matchesPlayed: 0,
          };

          awayStats = {
            goalsScoredAvgHome: 1.3,
            goalsConcededAvgHome: 1.2,
            goalsScoredAvgAway: 1.1,
            goalsConcededAvgAway: 1.2,
            matchesPlayed: 0,
          };
        }

        /*
         * ====================================================
         * 5.13 MOYENNES DE LA LIGUE
         * ====================================================
         */

        const leagueAverages = {
          avgGoalsHome: 1.4,
          avgGoalsAway: 1.1,
        };

        /*
         * ====================================================
         * 5.14 PRÉDICTION
         * ====================================================
         */

        console.log(
          "🧠 Calcul prédiction..."
        );

        const result =
          predictMatch(
            homeStats,
            awayStats,
            leagueAverages
          );

        console.log(
          `🎯 Score prévu : ${result.predictedHomeGoals}-${result.predictedAwayGoals}`
        );

        console.log(
          `🎯 Score exact : ${(
            result.exactScoreProb * 100
          ).toFixed(2)}%`
        );

        console.log(
          `🏠 Victoire domicile : ${(
            result.homeWinProb * 100
          ).toFixed(2)}%`
        );

        console.log(
          `🤝 Nul : ${(
            result.drawProb * 100
          ).toFixed(2)}%`
        );

        console.log(
          `✈️ Victoire extérieur : ${(
            result.awayWinProb * 100
          ).toFixed(2)}%`
        );

        /*
         * ====================================================
         * 5.15 ENREGISTREMENT
         * ====================================================
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
              "poisson-v1",

            generatedAt:
              new Date(),
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
          "✅ PRÉDICTION ENREGISTRÉE"
        );
      } catch (error) {
        predictionErrors++;

        console.error(
          "❌ ERREUR TRAITEMENT MATCH"
        );

        console.error(
          `⚽ ${homeName} - ${awayName}`
        );

        console.error(
          error instanceof Error
            ? error.message
            : error
        );
      }
    }

    /*
     * ========================================================
     * 6. RÉSUMÉ
     * ========================================================
     */

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
      `📅 Période : ${fromDate} → ${toDate}`
    );

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
      `❌ Erreurs prédictions : ${predictionErrors}`
    );

    console.log(
      `📊 Erreurs statistiques : ${statisticsErrors}`
    );

    console.log(
      `🛟 Fallback statistiques : ${fallbackStatisticsUsed}`
    );

    console.log(
      `⏭️ Matchs non programmés : ${nonNsMatches}`
    );

    console.log(
      `⚠️ Matchs ignorés : ${skippedFixtures}`
    );

    console.log(
      `⏱️ Durée : ${duration} ms`
    );

    console.log(
      "===================================="
    );

    /*
     * ========================================================
     * 7. RÉPONSE
     * ========================================================
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

      durationMs:
        duration,
    });
  } catch (error) {
    console.error(
      "===================================="
    );

    console.error(
      "❌ ERREUR GÉNÉRALE"
    );

    console.error(
      "===================================="
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

/*
 * ============================================================
 * GET — VERCEL CRON OU TEST
 * ============================================================
 */

export async function GET(
  req: NextRequest
) {
  console.log(
    "⏰ GET /api/matches/sync"
  );

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
  console.log(
    "🔄 POST /api/matches/sync"
  );

  return syncMatches(req);
}
```

