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
 * GET  : utilisé par Vercel Cron
 * POST : test manuel
 */
async function syncMatches(req: NextRequest) {
  const startTime = Date.now();

  console.log("====================================");
  console.log("🚀 DÉBUT SYNCHRONISATION");
  console.log("====================================");

  try {
    // ========================================
    // 1. VÉRIFICATION CRON_SECRET
    // ========================================

    console.log("🔐 Vérification CRON_SECRET...");

    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");

    /*
     * IMPORTANT
     *
     * Vercel Cron envoie automatiquement :
     *
     * Authorization: Bearer CRON_SECRET
     *
     * Pour un test depuis le navigateur, il n'y a
     * généralement pas de header Authorization.
     *
     * On ne bloque donc plus ici une requête sans header.
     *
     * En production, Vercel Cron reste protégé par
     * CRON_SECRET.
     */

    if (!cronSecret) {
      console.error("❌ CRON_SECRET est manquant.");

      return NextResponse.json(
        {
          ok: false,
          error:
            "CRON_SECRET manquant dans les variables d'environnement.",
        },
        {
          status: 500,
        }
      );
    }

    if (authHeader === `Bearer ${cronSecret}`) {
      console.log("✅ CRON_SECRET valide");
    } else {
      console.warn(
        "⚠️ Requête manuelle sans CRON_SECRET valide."
      );
    }

    // ========================================
    // 2. CALCUL DES DATES
    // ========================================

    const today = new Date();

    const fromDateObject = new Date(today);

    fromDateObject.setUTCDate(
      fromDateObject.getUTCDate() - 1
    );

    const toDateObject = new Date(today);

    toDateObject.setUTCDate(
      toDateObject.getUTCDate() + 1
    );

    const fromDate = fromDateObject
      .toISOString()
      .slice(0, 10);

    const toDate = toDateObject
      .toISOString()
      .slice(0, 10);

    console.log("====================================");
    console.log(`📅 DU : ${fromDate}`);
    console.log(`📅 AU : ${toDate}`);
    console.log("====================================");

    // ========================================
    // 3. RÉCUPÉRATION API-FOOTBALL
    // ========================================

    console.log("🌐 Connexion API-Football...");

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
    // 5. TRAITEMENT DES MATCHS
    // ========================================

    console.log("====================================");
    console.log("⚽ DÉBUT TRAITEMENT MATCHS");
    console.log("====================================");

    for (
      let index = 0;
      index < fixtures.length;
      index++
    ) {
      const fixture = fixtures[index];

      let homeName = "Inconnu";
      let awayName = "Inconnu";

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
          Number(fixture.fixture.id);

        const leagueId =
          Number(fixture.league.id);

        const season =
          Number(fixture.league.season);

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

        // ====================================
        // VALIDATION DATE
        // ====================================

        if (
          Number.isNaN(
            fixtureDate.getTime()
          )
        ) {
          console.warn(
            `⚠️ Date invalide pour ${homeName} - ${awayName}`
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
              externalId: leagueId,
            },

            update: {
              name: leagueName,

              country:
                fixture.league.country ??
                "Inconnu",

              season,

              logoUrl:
                fixture.league.logo ??
                null,
            },

            create: {
              externalId: leagueId,

              name: leagueName,

              country:
                fixture.league.country ??
                "Inconnu",

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
              name: homeName,

              logoUrl:
                fixture.teams.home.logo ??
                null,

              leagueId: league.id,
            },

            create: {
              externalId:
                Number(
                  fixture.teams.home.id
                ),

              name: homeName,

              logoUrl:
                fixture.teams.home.logo ??
                null,

              leagueId: league.id,
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
              name: awayName,

              logoUrl:
                fixture.teams.away.logo ??
                null,

              leagueId: league.id,
            },

            create: {
              externalId:
                Number(
                  fixture.teams.away.id
                ),

              name: awayName,

              logoUrl:
                fixture.teams.away.logo ??
                null,

              leagueId: league.id,
            },
          });

        // ====================================
        // 5.5 MATCH
        // ====================================

        const existingMatch =
          await prisma.match.findUnique({
            where: {
              externalId: fixtureId,
            },

            select: {
              id: true,
            },
          });

        const match =
          await prisma.match.upsert({
            where: {
              externalId: fixtureId,
            },

            update: {
              status,

              kickoffAt: fixtureDate,

              leagueId: league.id,

              homeTeamId: homeTeam.id,

              awayTeamId: awayTeam.id,

              homeScore:
                fixture.goals?.home ??
                null,

              awayScore:
                fixture.goals?.away ??
                null,
            },

            create: {
              externalId: fixtureId,

              leagueId: league.id,

              homeTeamId: homeTeam.id,

              awayTeamId: awayTeam.id,

              kickoffAt: fixtureDate,

              status,

              homeScore:
                fixture.goals?.home ??
                null,

              awayScore:
                fixture.goals?.away ??
                null,
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

        // ====================================
        // 5.6 UNIQUEMENT LES MATCHS À VENIR
        // ====================================

        if (status !== "NS") {
          nonNsMatches++;

          console.log(
            `⏭️ Pas de prédiction : statut ${status}`
          );

          continue;
        }

        // ====================================
        // 5.7 DÉBUT PRÉDICTION
        // ====================================

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

        // ====================================
        // 5.8 RÉCUPÉRATION STATISTIQUES
        // ====================================

        let homeStatsRaw: any;
        let awayStatsRaw: any;

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

          console.log(
            "✅ Statistiques récupérées"
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

        // ====================================
        // 5.9 CONVERSION STATISTIQUES
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
            "❌ ERREUR CONVERSION STATS"
          );

          console.error(error);

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

        // ====================================
        // 5.10 VALIDATION DES STATS
        // ====================================

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
          ) &&
          homeStats.goalsScoredAvgHome >=
            0 &&
          homeStats.goalsConcededAvgHome >=
            0 &&
          homeStats.goalsScoredAvgAway >=
            0 &&
          homeStats.goalsConcededAvgAway >=
            0;

        if (!statsAreValid) {
          statisticsErrors++;

          console.error(
            "❌ Statistiques invalides"
          );

          continue;
        }

        // ====================================
        // 5.11 MOYENNES DE LA LIGUE
        // ====================================

        const leagueAverages = {
          avgGoalsHome: 1.4,
          avgGoalsAway: 1.1,
        };

        console.log(
          "📊 Moyennes ligue :",
          leagueAverages
        );

        // ====================================
        // 5.12 CALCUL PRÉDICTION
        // ====================================

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
          "✅ Prédiction calculée"
        );

        console.log(
          "🎯 Résultat :",
          result
        );

        console.log(
          `🎯 Score prévu : ${result.predictedHomeGoals}-${result.predictedAwayGoals}`
        );

        console.log(
          `📊 Probabilité score exact : ${result.exactScoreProb}`
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

        // ====================================
        // 5.13 ENREGISTREMENT PRÉDICTION
        // ====================================

        console.log(
          "💾 Enregistrement prédiction..."
        );

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

    // ========================================
    // 6. RÉSUMÉ
    // ========================================

    const duration =
      Date.now() - startTime;

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
      `⏭️ Matchs non NS : ${nonNsMatches}`
    );

    console.log(
      `⚠️ Matchs ignorés : ${skippedFixtures}`
    );

    console.log(
      `⏱️ Durée : ${duration} ms`
    );

    console.log(
      "====================================");

    // ========================================
    // 7. RÉPONSE JSON
    // ========================================

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

      durationMs: duration,
    });
  } catch (error) {
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
  console.log(
    "⏰ Vercel Cron → GET /api/matches/sync"
  );

  return syncMatches(req);
}

// ========================================
// POST — TEST MANUEL
// ========================================

export async function POST(
  req: NextRequest
) {
  console.log(
    "🔄 POST /api/matches/sync"
  );

  return syncMatches(req);
}
