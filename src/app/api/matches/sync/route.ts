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

  console.log("====================================");
  console.log("🚀 DÉBUT SYNCHRONISATION");
  console.log("====================================");

  try {
    // ========================================
    // 1. CRON SECRET
    // ========================================

    console.log("🔐 Vérification CRON_SECRET...");

    const authHeader = req.headers.get("authorization");

    if (
      !process.env.CRON_SECRET ||
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      console.error("❌ Accès non autorisé");

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

    console.log("✅ CRON_SECRET valide");

    // ========================================
    // 2. DATES
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
    // 3. API-FOOTBALL
    // ========================================

    console.log("🌐 Connexion API-Football...");

    let fixtures: any[] = [];

    try {
      fixtures = await fetchFixturesByDateRange(
        fromDate,
        toDate
      );

      console.log(
        `✅ ${fixtures.length} match(s) récupéré(s)`
      );
    } catch (error) {
      console.error("❌ ERREUR API-FOOTBALL");
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
    // 5. MATCHS
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

        const fixtureId = fixture.fixture.id;

        homeName = fixture.teams.home.name;
        awayName = fixture.teams.away.name;

        const leagueName = fixture.league.name;

        const status =
          fixture.fixture.status.short;

        console.log(
          "------------------------------------"
        );

        console.log(
          `⚽ MATCH ${index + 1}/${fixtures.length}`
        );

        console.log(`🆔 Fixture : ${fixtureId}`);
        console.log(`🏆 Ligue : ${leagueName}`);
        console.log(`🏠 ${homeName}`);
        console.log(`✈️ ${awayName}`);
        console.log(`📊 Statut : ${status}`);

        // ====================================
        // 5.2 LIGUE
        // ====================================

        const league =
          await prisma.league.upsert({
            where: {
              externalId: fixture.league.id,
            },

            update: {
              name: fixture.league.name,
              country: fixture.league.country,
              season: fixture.league.season,
              logoUrl: fixture.league.logo,
            },

            create: {
              externalId: fixture.league.id,
              name: fixture.league.name,
              country: fixture.league.country,
              season: fixture.league.season,
              logoUrl: fixture.league.logo,
            },
          });

        // ====================================
        // 5.3 ÉQUIPE DOMICILE
        // ====================================

        const homeTeam =
          await prisma.team.upsert({
            where: {
              externalId: fixture.teams.home.id,
            },

            update: {
              name: fixture.teams.home.name,
              logoUrl: fixture.teams.home.logo,
              leagueId: league.id,
            },

            create: {
              externalId: fixture.teams.home.id,
              name: fixture.teams.home.name,
              logoUrl: fixture.teams.home.logo,
              leagueId: league.id,
            },
          });

        // ====================================
        // 5.4 ÉQUIPE EXTÉRIEURE
        // ====================================

        const awayTeam =
          await prisma.team.upsert({
            where: {
              externalId: fixture.teams.away.id,
            },

            update: {
              name: fixture.teams.away.name,
              logoUrl: fixture.teams.away.logo,
              leagueId: league.id,
            },

            create: {
              externalId: fixture.teams.away.id,
              name: fixture.teams.away.name,
              logoUrl: fixture.teams.away.logo,
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

              kickoffAt: new Date(
                fixture.fixture.date
              ),

              leagueId: league.id,

              homeTeamId: homeTeam.id,

              awayTeamId: awayTeam.id,
            },

            create: {
              externalId: fixtureId,

              leagueId: league.id,

              homeTeamId: homeTeam.id,

              awayTeamId: awayTeam.id,

              kickoffAt: new Date(
                fixture.fixture.date
              ),

              status,
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
        // 5.6 STATUT
        // ====================================

        if (status !== "NS") {
          nonNsMatches++;

          console.log(
            `⏭️ Pas de prédiction : statut ${status}`
          );

          continue;
        }

        // ====================================
        // 5.7 PRÉDICTION
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
        // 5.8 STATISTIQUES
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
              fixture.teams.home.id,
              fixture.league.id,
              fixture.league.season
            ),

            fetchTeamStatistics(
              fixture.teams.away.id,
              fixture.league.id,
              fixture.league.season
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
        // 5.9 CONVERSION
        // ====================================

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
        // 5.10 MOYENNES LIGUE
        // ====================================

        const leagueAverages = {
          avgGoalsHome: 1.4,
          avgGoalsAway: 1.1,
        };

        // ====================================
        // 5.11 CALCUL PRÉDICTION
        // ====================================

        console.log(
          "🧠 Calcul prédiction..."
        );

        const result = predictMatch(
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

        // ====================================
        // 5.12 PRISMA
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
      "===================================="
    );

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
