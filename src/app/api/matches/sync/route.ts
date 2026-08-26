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
    // 1. VÉRIFICATION CRON_SECRET
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
        { status: 401 }
      );
    }

    console.log("✅ CRON_SECRET valide");

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
    console.log("📅 PÉRIODE");
    console.log(`📅 Du : ${fromDate}`);
    console.log(`📅 Au : ${toDate}`);
    console.log("====================================");

    // ========================================
    // 3. RÉCUPÉRATION API-FOOTBALL
    // ========================================

    console.log("🌐 Connexion à API-Football...");

    let fixtures: any[] = [];

    try {
      fixtures = await fetchFixturesByDateRange(
        fromDate,
        toDate
      );

      console.log(
        `✅ API-Football a retourné ${fixtures.length} match(s)`
      );
    } catch (error) {
      console.error(
        "❌ ERREUR API-FOOTBALL :",
        error
      );

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
    // 5. SI AUCUN MATCH
    // ========================================

    if (fixtures.length === 0) {
      console.warn(
        "⚠️ Aucun match récupéré par API-Football"
      );
    }

    // ========================================
    // 6. TRAITEMENT DES MATCHS
    // ========================================

    console.log("====================================");
    console.log("⚽ DÉBUT TRAITEMENT DES MATCHS");
    console.log("====================================");

    for (let index = 0; index < fixtures.length; index++) {
      const fixture = fixtures[index];

      console.log("------------------------------------");
      console.log(
        `⚽ MATCH ${index + 1}/${fixtures.length}`
      );

      try {
        // ========================================
        // 6.1 VÉRIFICATION DONNÉES
        // ========================================

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

        const homeName =
          fixture.teams.home.name;

        const awayName =
          fixture.teams.away.name;

        const leagueName =
          fixture.league.name;

        const status =
          fixture.fixture.status.short;

        console.log(`🆔 Fixture ID : ${fixtureId}`);
        console.log(
          `🏆 Ligue : ${leagueName}`
        );
        console.log(
          `🏠 Domicile : ${homeName}`
        );
        console.log(
          `✈️ Extérieur : ${awayName}`
        );
        console.log(`📊 Statut : ${status}`);

        // ========================================
        // 6.2 LIGUE
        // ========================================

        console.log("🏆 Enregistrement de la ligue...");

        const league = await prisma.league.upsert({
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

        console.log(
          `✅ Ligue enregistrée : ${league.name}`
        );

        // ========================================
        // 6.3 ÉQUIPE DOMICILE
        // ========================================

        console.log(
          `🏠 Enregistrement équipe : ${homeName}`
        );

        const homeTeam = await prisma.team.upsert({
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

        console.log(
          `✅ Équipe domicile enregistrée : ${homeTeam.name}`
        );

        // ========================================
        // 6.4 ÉQUIPE EXTÉRIEURE
        // ========================================

        console.log(
          `✈️ Enregistrement équipe : ${awayName}`
        );

        const awayTeam = await prisma.team.upsert({
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

        console.log(
          `✅ Équipe extérieure enregistrée : ${awayTeam.name}`
        );

        // ========================================
        // 6.5 MATCH
        // ========================================

        console.log("⚽ Enregistrement du match...");

        const existingMatch =
          await prisma.match.findUnique({
            where: {
              externalId: fixtureId,
            },
            select: {
              id: true,
            },
          });

        const match = await prisma.match.upsert({
          where: {
            externalId: fixtureId,
          },
          update: {
            status: status,
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
            status: status,
          },
        });

        if (existingMatch) {
          matchesUpdated++;

          console.log(
            `🔄 Match mis à jour : ${homeName} - ${awayName}`
          );
        } else {
          matchesCreated++;

          console.log(
            `🆕 Match créé : ${homeName} - ${awayName}`
          );
        }

        console.log(
          `📌 Match enregistré : ${homeName} - ${awayName}`
        );

        // ========================================
        // 6.6 VÉRIFICATION STATUT
        // ========================================

        console.log(
          `🔎 Vérification du statut pour la prédiction : ${status}`
        );

        if (status !== "NS") {
          nonNsMatches++;

          console.log(
            `⏭️ PRÉDICTION NON LANCÉE`
          );

          console.log(
            `⏭️ ${homeName} - ${awayName}`
          );

          console.log(
            `⏭️ Raison : statut = ${status}, attendu = NS`
          );

          continue;
        }

        // ========================================
        // 6.7 DÉBUT PRÉDICTION
        // ========================================

        console.log("====================================");
        console.log("🤖 DÉBUT PRÉDICTION");
        console.log(
          `🤖 ${homeName} - ${awayName}`
        );
        console.log("====================================");

        let homeStatsRaw;
        let awayStatsRaw;

        // ========================================
        // 6.8 RÉCUPÉRATION STATISTIQUES
        // ========================================

        try {
          console.log(
            `📊 Récupération statistiques : ${homeName}`
          );

          console.log(
            `📊 Récupération statistiques : ${awayName}`
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
            `✅ Statistiques récupérées : ${homeName}`
          );

          console.log(
            `✅ Statistiques récupérées : ${awayName}`
          );
        } catch (error) {
          statisticsErrors++;

          console.error(
            `❌ ERREUR STATISTIQUES : ${homeName} - ${awayName}`
          );

          console.error(error);

          continue;
        }

        // ========================================
        // 6.9 VÉRIFICATION STATISTIQUES
        // ========================================

        if (!homeStatsRaw || !awayStatsRaw) {
          statisticsErrors++;

          console.warn(
            `⚠️ Statistiques indisponibles : ${homeName} - ${awayName}`
          );

          continue;
        }

        console.log(
          "✅ Statistiques disponibles pour la prédiction"
        );

        // ========================================
        // 6.10 CONVERSION STATISTIQUES
        // ========================================

        console.log(
          "📈 Conversion des statistiques..."
        );

        const homeStats =
          parseTeamAverages(homeStatsRaw);

        const awayStats =
          parseTeamAverages(awayStatsRaw);

        console.log(
          "✅ Statistiques converties"
        );

        console.log(
          "🏠 Stats domicile :",
          homeStats
        );

        console.log(
          "✈️ Stats extérieur :",
          awayStats
        );

        // ========================================
        // 6.11 MOYENNES LIGUE
        // ========================================

        const leagueAverages = {
          avgGoalsHome: 1.4,
          avgGoalsAway: 1.1,
        };

        console.log(
          "📊 Moyennes ligue :",
          leagueAverages
        );

        // ========================================
        // 6.12 CALCUL PRÉDICTION
        // ========================================

        console.log(
          "🧠 Calcul de la prédiction..."
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

        // ========================================
        // 6.13 ENREGISTREMENT PRÉDICTION
        // ========================================

        console.log(
          "💾 Enregistrement de la prédiction dans Prisma..."
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

            modelVersion: "poisson-v1",
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

            modelVersion: "poisson-v1",
          },
        });

        predictionsGenerated++;

        console.log("====================================");
        console.log("✅ PRÉDICTION ENREGISTRÉE");
        console.log(
          `⚽ ${homeName} - ${awayName}`
        );
        console.log(
          `🎯 Score prédit : ${result.predictedHomeGoals} - ${result.predictedAwayGoals}`
        );
        console.log("====================================");
      } catch (error) {
        skippedFixtures++;

        console.error(
          `❌ ERREUR TRAITEMENT MATCH`
        );

        console.error(error);
      }
    }

    // ========================================
    // 7. RÉSUMÉ FINAL
    // ========================================

    const duration =
      Date.now() - startTime;

    console.log("");
    console.log("====================================");
    console.log("🏁 SYNCHRONISATION TERMINÉE");
    console.log("====================================");

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
      `🤖 Prédictions générées : ${predictionsGenerated}`
    );

    console.log(
      `❌ Erreurs prédictions : ${predictionErrors}`
    );

    console.log(
      `📊 Erreurs statistiques : ${statisticsErrors}`
    );

    console.log(
      `⏭️ Matchs sans prédiction (statut différent de NS) : ${nonNsMatches}`
    );

    console.log(
      `⚠️ Matchs ignorés : ${skippedFixtures}`
    );

    console.log(
      `⏱️ Durée : ${duration} ms`
    );

    console.log("====================================");

    return NextResponse.json({
      ok: true,

      dateRange: {
        from: fromDate,
        to: toDate,
      },

      fixturesFound: fixtures.length,

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
    console.error("====================================");
    console.error(
      "❌ ERREUR GÉNÉRALE /api/matches/sync"
    );
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
// POST — TESTS MANUELS
// ========================================

export async function POST(
  req: NextRequest
) {
  console.log(
    "🔄 POST /api/matches/sync"
  );

  return syncMatches(req);
}
