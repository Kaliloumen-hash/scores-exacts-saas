import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

import {
  fetchFixturesByDate,
  fetchTeamStatistics,
  parseTeamAverages,
} from "@/lib/footballApi";

import { predictMatch } from "@/lib/prediction";

/**
 * Configuration Next.js / Vercel
 */
export const dynamic = "force-dynamic";

export const maxDuration = 300;

/**
 * Nombre maximum de matchs pour lesquels
 * on calcule une prédiction pendant une exécution.
 *
 * Cela évite de faire plusieurs centaines
 * d'appels API-Football dans un seul Cron.
 */
const MAX_PREDICTIONS_PER_RUN = 30;

/**
 * Moyennes par défaut.
 *
 * IMPORTANT :
 * Ce sont des valeurs de secours.
 * Le moteur Poisson utilise ensuite les
 * statistiques réelles des équipes.
 */
const DEFAULT_LEAGUE_AVERAGES = {
  avgGoalsHome: 1.4,
  avgGoalsAway: 1.1,
};

/**
 * Vérifie le CRON_SECRET.
 */
function isAuthorized(
  req: NextRequest
): boolean {
  const cronSecret =
    process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error(
      "❌ CRON_SECRET n'est pas configuré."
    );

    return false;
  }

  const authorization =
    req.headers.get(
      "authorization"
    );

  return (
    authorization ===
    `Bearer ${cronSecret}`
  );
}

/**
 * Convertit une valeur en nombre sûr.
 */
function safeNumber(
  value: unknown,
  fallback = 0
): number {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return number;
}

/**
 * Vérifie qu'un match peut être utilisé.
 */
function isValidFixture(
  fixture: any
): boolean {
  return Boolean(
    fixture?.fixture?.id &&
      fixture?.league?.id &&
      fixture?.teams?.home?.id &&
      fixture?.teams?.away?.id &&
      fixture?.fixture?.date
  );
}

/**
 * Vérifie si le match est réellement
 * un match à venir.
 *
 * API-Football peut utiliser :
 * NS = Not Started
 * TBD = To Be Defined
 *
 * On accepte NS et TBD.
 */
function isUpcomingStatus(
  status: string
): boolean {
  return (
    status === "NS" ||
    status === "TBD"
  );
}

/**
 * Fonction principale de synchronisation.
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
    /**
     * ==================================================
     * 1. AUTHENTIFICATION
     * ==================================================
     */

    console.log(
      "🔐 Vérification CRON_SECRET..."
    );

    if (
      !isAuthorized(req)
    ) {
      console.error(
        "❌ Accès non autorisé."
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
      "✅ CRON_SECRET valide."
    );

    /**
     * ==================================================
     * 2. DATE DU JOUR
     * ==================================================
     *
     * On récupère uniquement :
     *
     * - aujourd'hui
     * - demain
     *
     * Cela évite de récupérer les matchs
     * d'hier qui sont déjà terminés.
     */

    const now =
      new Date();

    const today =
      now
        .toISOString()
        .slice(0, 10);

    const tomorrowDate =
      new Date(now);

    tomorrowDate.setUTCDate(
      tomorrowDate.getUTCDate() + 1
    );

    const tomorrow =
      tomorrowDate
        .toISOString()
        .slice(0, 10);

    console.log(
      "===================================="
    );

    console.log(
      `📅 Aujourd'hui : ${today}`
    );

    console.log(
      `📅 Demain : ${tomorrow}`
    );

    console.log(
      "===================================="
    );

    /**
     * ==================================================
     * 3. RÉCUPÉRATION API-FOOTBALL
     * ==================================================
     */

    let todayFixtures: any[] =
      [];

    let tomorrowFixtures: any[] =
      [];

    try {
      console.log(
        `🌐 Récupération matchs ${today}...`
      );

      todayFixtures =
        await fetchFixturesByDate(
          today
        );

      console.log(
        `✅ ${todayFixtures.length} match(s)`
      );
    } catch (error) {
      console.error(
        `❌ Erreur récupération ${today}`
      );

      console.error(error);
    }

    try {
      console.log(
        `🌐 Récupération matchs ${tomorrow}...`
      );

      tomorrowFixtures =
        await fetchFixturesByDate(
          tomorrow
        );

      console.log(
        `✅ ${tomorrowFixtures.length} match(s)`
      );
    } catch (error) {
      console.error(
        `❌ Erreur récupération ${tomorrow}`
      );

      console.error(error);
    }

    /**
     * Combine les deux journées.
     */
    const fixtures = [
      ...todayFixtures,
      ...tomorrowFixtures,
    ];

    /**
     * Évite les doublons.
     */
    const uniqueFixtures =
      Array.from(
        new Map(
          fixtures
            .filter(
              (fixture) =>
                fixture?.fixture?.id
            )
            .map(
              (fixture) => [
                fixture.fixture.id,
                fixture,
              ]
            )
        ).values()
      );

    console.log(
      "===================================="
    );

    console.log(
      `⚽ Matchs récupérés : ${uniqueFixtures.length}`
    );

    console.log(
      "===================================="
    );

    /**
     * ==================================================
     * 4. COMPTEURS
     * ==================================================
     */

    let matchesCreated = 0;

    let matchesUpdated = 0;

    let predictionsGenerated = 0;

    let predictionErrors = 0;

    let statisticsErrors = 0;

    let skippedFixtures = 0;

    let nonUpcomingMatches = 0;

    /**
     * ==================================================
     * 5. LIMITATION DES PRÉDICTIONS
     * ==================================================
     *
     * On ne lance pas 300 ou 400 calculs
     * statistiques dans le même Cron.
     *
     * On sélectionne d'abord les matchs
     * à venir.
     */

    const upcomingFixtures =
      uniqueFixtures.filter(
        (fixture) => {
          if (
            !isValidFixture(
              fixture
            )
          ) {
            return false;
          }

          const status =
            fixture.fixture.status
              ?.short;

          return isUpcomingStatus(
            status
          );
        }
      );

    console.log(
      `🔮 Matchs à venir : ${upcomingFixtures.length}`
    );

    /**
     * ==================================================
     * 6. TRAITEMENT DES MATCHS
     * ==================================================
     */

    for (
      let index = 0;
      index <
      uniqueFixtures.length;
      index++
    ) {
      const fixture =
        uniqueFixtures[index];

      let homeName =
        "Inconnu";

      let awayName =
        "Inconnu";

      try {
        /**
         * ==============================================
         * VALIDATION
         * ==============================================
         */

        if (
          !isValidFixture(
            fixture
          )
        ) {
          console.warn(
            `⚠️ Match ${index + 1} ignoré : données incomplètes.`
          );

          skippedFixtures++;

          continue;
        }

        /**
         * ==============================================
         * DONNÉES DU MATCH
         * ==============================================
         */

        const fixtureId =
          safeNumber(
            fixture.fixture.id
          );

        const leagueId =
          safeNumber(
            fixture.league.id
          );

        const season =
          safeNumber(
            fixture.league.season
          );

        const homeTeamId =
          safeNumber(
            fixture.teams.home.id
          );

        const awayTeamId =
          safeNumber(
            fixture.teams.away.id
          );

        homeName =
          String(
            fixture.teams.home.name ??
              "Inconnu"
          );

        awayName =
          String(
            fixture.teams.away.name ??
              "Inconnu"
          );

        const leagueName =
          String(
            fixture.league.name ??
              "Inconnue"
          );

        const country =
          String(
            fixture.league.country ??
              ""
          );

        const status =
          String(
            fixture.fixture.status
              ?.short ??
              "NS"
          );

        const kickoffAt =
          new Date(
            fixture.fixture.date
          );

        /**
         * Vérification date.
         */
        if (
          Number.isNaN(
            kickoffAt.getTime()
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
          `⚽ MATCH ${index + 1}/${uniqueFixtures.length}`
        );

        console.log(
          `🆔 Fixture : ${fixtureId}`
        );

        console.log(
          `🏆 Ligue : ${leagueName}`
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

        /**
         * ==============================================
         * LIGUE
         * ==============================================
         */

        const league =
          await prisma.league.upsert(
            {
              where: {
                externalId:
                  leagueId,
              },

              update: {
                name:
                  leagueName,

                country,

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

                country,

                season,

                logoUrl:
                  fixture.league.logo ??
                  null,
              },
            }
          );

        /**
         * ==============================================
         * ÉQUIPE DOMICILE
         * ==============================================
         */

        const homeTeam =
          await prisma.team.upsert(
            {
              where: {
                externalId:
                  homeTeamId,
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
                  homeTeamId,

                name:
                  homeName,

                logoUrl:
                  fixture.teams.home.logo ??
                  null,

                leagueId:
                  league.id,
              },
            }
          );

        /**
         * ==============================================
         * ÉQUIPE EXTÉRIEURE
         * ==============================================
         */

        const awayTeam =
          await prisma.team.upsert(
            {
              where: {
                externalId:
                  awayTeamId,
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
                  awayTeamId,

                name:
                  awayName,

                logoUrl:
                  fixture.teams.away.logo ??
                  null,

                leagueId:
                  league.id,
              },
            }
          );

        /**
         * ==============================================
         * MATCH
         * ==============================================
         */

        const existingMatch =
          await prisma.match.findUnique(
            {
              where: {
                externalId:
                  fixtureId,
              },

              select: {
                id: true,
              },
            }
          );

        const match =
          await prisma.match.upsert(
            {
              where: {
                externalId:
                  fixtureId,
              },

              update: {
                status,

                kickoffAt,

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

                kickoffAt,

                status,
              },
            }
          );

        if (existingMatch) {
          matchesUpdated++;

          console.log(
            "🔄 Match mis à jour."
          );
        } else {
          matchesCreated++;

          console.log(
            "🆕 Match créé."
          );
        }

        /**
         * ==============================================
         * PRÉDICTION
         * ==============================================
         */

        if (
          !isUpcomingStatus(
            status
          )
        ) {
          nonUpcomingMatches++;

          console.log(
            `⏭️ Pas de prédiction : statut ${status}`
          );

          continue;
        }

        /**
         * On limite le nombre de prédictions
         * par exécution.
         */
        if (
          predictionsGenerated >=
          MAX_PREDICTIONS_PER_RUN
        ) {
          console.log(
            `⏭️ Limite de ${MAX_PREDICTIONS_PER_RUN} prédictions atteinte.`
          );

          continue;
        }

        /**
         * Vérifie si une prédiction existe déjà.
         *
         * Si elle existe, on évite de refaire
         * deux appels statistiques.
         */
        const existingPrediction =
          await prisma.prediction.findUnique(
            {
              where: {
                matchId:
                  match.id,
              },

              select: {
                id: true,
              },
            }
          );

        if (
          existingPrediction
        ) {
          console.log(
            "♻️ Prédiction déjà présente → pas de nouvel appel statistiques."
          );

          continue;
        }

        console.log(
          "===================================="
        );

        console.log(
          "🤖 DÉBUT PRÉDICTION"
        );

        console.log(
          `🤖 ${homeName} - ${awayName}`
        );

        console.log(
          "===================================="
        );

        /**
         * ==============================================
         * STATISTIQUES DES DEUX ÉQUIPES
         * ==============================================
         */

        let homeStatsRaw: any;

        let awayStatsRaw: any;

        try {
          console.log(
            `📊 Stats : ${homeName}`
          );

          console.log(
            `📊 Stats : ${awayName}`
          );

          [
            homeStatsRaw,
            awayStatsRaw,
          ] =
            await Promise.all([
              fetchTeamStatistics(
                homeTeamId,
                leagueId,
                season
              ),

              fetchTeamStatistics(
                awayTeamId,
                leagueId,
                season
              ),
            ]);

          console.log(
            "✅ Statistiques récupérées."
          );
        } catch (error) {
          statisticsErrors++;

          console.error(
            "❌ ERREUR STATISTIQUES"
          );

          console.error(
            `⚽ ${homeName} - ${awayName}`
          );

          console.error(error);

          continue;
        }

        /**
         * ==============================================
         * CONVERSION DES STATS
         * ==============================================
         */

        let homeStats:
          ReturnType<
            typeof parseTeamAverages
          >;

        let awayStats:
          ReturnType<
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
            "❌ ERREUR CONVERSION STATISTIQUES"
          );

          console.error(error);

          continue;
        }

        /**
         * Vérification minimale.
         */
        if (
          homeStats.matchesPlayed <=
            0 ||
          awayStats.matchesPlayed <=
            0
        ) {
          statisticsErrors++;

          console.warn(
            `⚠️ Pas assez de statistiques : ${homeName} - ${awayName}`
          );

          continue;
        }

        console.log(
          "📈 Stats domicile :",
          homeStats
        );

        console.log(
          "📈 Stats extérieur :",
          awayStats
        );

        /**
         * ==============================================
         * MOYENNES DE LIGUE
         * ==============================================
         */

        const leagueAverages = {
          avgGoalsHome:
            DEFAULT_LEAGUE_AVERAGES.avgGoalsHome,

          avgGoalsAway:
            DEFAULT_LEAGUE_AVERAGES.avgGoalsAway,
        };

        /**
         * ==============================================
         * CALCUL POISSON
         * ==============================================
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
          "✅ Prédiction calculée."
        );

        console.log(
          "🎯 Résultat :",
          result
        );

        /**
         * ==============================================
         * ENREGISTREMENT PRISMA
         * ==============================================
         */

        console.log(
          "💾 Enregistrement prédiction..."
        );

        await prisma.prediction.upsert(
          {
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
          }
        );

        predictionsGenerated++;

        console.log(
          "===================================="
        );

        console.log(
          "✅ PRÉDICTION ENREGISTRÉE"
        );

        console.log(
          `⚽ ${homeName} - ${awayName}`
        );

        console.log(
          `🎯 Score : ${result.predictedHomeGoals}-${result.predictedAwayGoals}`
        );

        console.log(
          `📈 Lambda domicile : ${result.lambdaHome}`
        );

        console.log(
          `📈 Lambda extérieur : ${result.lambdaAway}`
        );

        console.log(
          `🏠 Victoire domicile : ${result.homeWinProb}`
        );

        console.log(
          `🤝 Nul : ${result.drawProb}`
        );

        console.log(
          `✈️ Victoire extérieur : ${result.awayWinProb}`
        );

        console.log(
          "===================================="
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

    /**
     * ==================================================
     * 7. RÉSUMÉ
     * ==================================================
     */

    const duration =
      Date.now() -
      startTime;

    console.log("");

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
      `📅 Aujourd'hui : ${today}`
    );

    console.log(
      `📅 Demain : ${tomorrow}`
    );

    console.log(
      `⚽ Matchs récupérés : ${uniqueFixtures.length}`
    );

    console.log(
      `🔮 Matchs à venir : ${upcomingFixtures.length}`
    );

    console.log(
      `🆕 Matchs créés : ${matchesCreated}`
    );

    console.log(
      `🔄 Matchs mis à jour : ${matchesUpdated}`
    );

    console.log(
      `🤖 Prédictions générées : ${predictionsGenerated}`
    );

    console.log(
      `❌ Erreurs prédictions : ${predictionErrors}`
    );

    console.log(
      `📊 Erreurs statistiques : ${statisticsErrors}`
    );

    console.log(
      `⏭️ Matchs non éligibles : ${nonUpcomingMatches}`
    );

    console.log(
      `⚠️ Matchs ignorés : ${skippedFixtures}`
    );

    console.log(
      `🔢 Limite prédictions/run : ${MAX_PREDICTIONS_PER_RUN}`
    );

    console.log(
      `⏱️ Durée : ${duration} ms`
    );

    console.log(
      "===================================="
    );

    return NextResponse.json(
      {
        ok: true,

        dateRange: {
          today,
          tomorrow,
        },

        fixturesFound:
          uniqueFixtures.length,

        upcomingFixtures:
          upcomingFixtures.length,

        matchesCreated,

        matchesUpdated,

        predictionsGenerated,

        predictionErrors,

        statisticsErrors,

        nonUpcomingMatches,

        skippedFixtures,

        maxPredictionsPerRun:
          MAX_PREDICTIONS_PER_RUN,

        durationMs:
          duration,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    /**
     * ==================================================
     * ERREUR GÉNÉRALE
     * ==================================================
     */

    const duration =
      Date.now() -
      startTime;

    console.error("");

    console.error(
      "===================================="
    );

    console.error(
      "❌ ERREUR GÉNÉRALE /api/matches/sync"
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

        durationMs:
          duration,
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * ======================================================
 * GET — VERCEL CRON
 * ======================================================
 */
export async function GET(
  req: NextRequest
) {
  console.log(
    "⏰ Vercel Cron → GET /api/matches/sync"
  );

  return syncMatches(
    req
  );
}

/**
 * ======================================================
 * POST — TEST MANUEL
 * ======================================================
 */
export async function POST(
  req: NextRequest
) {
  console.log(
    "🔄 POST /api/matches/sync"
  );

  return syncMatches(
    req
  );
}
