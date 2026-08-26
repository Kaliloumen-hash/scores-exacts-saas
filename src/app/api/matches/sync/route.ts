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
  try {
    const authHeader = req.headers.get("authorization");

    if (
      !process.env.CRON_SECRET ||
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      console.error("❌ Accès non autorisé à /api/matches/sync");

      return NextResponse.json(
        {
          ok: false,
          error: "Non autorisé",
        },
        { status: 401 }
      );
    }

    // Date actuelle
    const today = new Date();

    // Aujourd'hui
    const fromDate = today.toISOString().slice(0, 10);

    // Aujourd'hui + 7 jours
    const toDateObject = new Date(today);
    toDateObject.setUTCDate(toDateObject.getUTCDate() + 7);

    const toDate = toDateObject.toISOString().slice(0, 10);

    console.log(
      `🚀 Synchronisation des matchs du ${fromDate} au ${toDate}`
    );

    // Récupération des matchs
    const fixtures = await fetchFixturesByDateRange(
      fromDate,
      toDate
    );

    console.log(
      `⚽ ${fixtures.length} match(s) récupéré(s) depuis API-Football`
    );

    let matchesCreated = 0;
    let matchesUpdated = 0;
    let predictionsGenerated = 0;
    let predictionErrors = 0;
    let skippedFixtures = 0;

    for (const fixture of fixtures) {
      try {
        // Vérification des données
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

        // =========================
        // LIGUE
        // =========================

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

        // =========================
        // ÉQUIPE DOMICILE
        // =========================

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

        // =========================
        // ÉQUIPE EXTÉRIEURE
        // =========================

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

        // =========================
        // MATCH
        // =========================

        const existingMatch = await prisma.match.findUnique({
          where: {
            externalId: fixture.fixture.id,
          },
          select: {
            id: true,
          },
        });

        const match = await prisma.match.upsert({
          where: {
            externalId: fixture.fixture.id,
          },
          update: {
            status: fixture.fixture.status.short,
            kickoffAt: new Date(fixture.fixture.date),
            leagueId: league.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
          },
          create: {
            externalId: fixture.fixture.id,
            leagueId: league.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            kickoffAt: new Date(fixture.fixture.date),
            status: fixture.fixture.status.short,
          },
        });

        if (existingMatch) {
          matchesUpdated++;
        } else {
          matchesCreated++;
        }

        console.log(
          `📌 Match : ${fixture.teams.home.name} - ${fixture.teams.away.name}`
        );

        // =========================
        // PRÉDICTION
        // =========================

        // NS = match pas encore commencé
        if (fixture.fixture.status.short !== "NS") {
          continue;
        }

        try {
          console.log(
            `🤖 Prédiction : ${fixture.teams.home.name} - ${fixture.teams.away.name}`
          );

          const [
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

          if (!homeStatsRaw || !awayStatsRaw) {
            console.warn(
              `⚠️ Statistiques indisponibles : ${fixture.teams.home.name} - ${fixture.teams.away.name}`
            );

            continue;
          }

          const homeStats = parseTeamAverages(homeStatsRaw);
          const awayStats = parseTeamAverages(awayStatsRaw);

          // Moyennes provisoires de la ligue
          const leagueAverages = {
            avgGoalsHome: 1.4,
            avgGoalsAway: 1.1,
          };

          const result = predictMatch(
            homeStats,
            awayStats,
            leagueAverages
          );

          await prisma.prediction.upsert({
            where: {
              matchId: match.id,
            },
            update: {
              predictedHomeGoals: result.predictedHomeGoals,
              predictedAwayGoals: result.predictedAwayGoals,
              exactScoreProb: result.exactScoreProb,
              homeWinProb: result.homeWinProb,
              drawProb: result.drawProb,
              awayWinProb: result.awayWinProb,
              scoreDistribution: result.scoreDistribution,
              modelVersion: "poisson-v1",
            },
            create: {
              matchId: match.id,
              predictedHomeGoals: result.predictedHomeGoals,
              predictedAwayGoals: result.predictedAwayGoals,
              exactScoreProb: result.exactScoreProb,
              homeWinProb: result.homeWinProb,
              drawProb: result.drawProb,
              awayWinProb: result.awayWinProb,
              scoreDistribution: result.scoreDistribution,
              modelVersion: "poisson-v1",
            },
          });

          predictionsGenerated++;

          console.log(
            `✅ Prédiction créée : ${fixture.teams.home.name} - ${fixture.teams.away.name}`
          );
        } catch (error) {
          predictionErrors++;

          console.error(
            `❌ Erreur prédiction ${fixture.teams.home.name} - ${fixture.teams.away.name}:`,
            error
          );
        }
      } catch (error) {
        skippedFixtures++;

        console.error(
          "❌ Erreur lors du traitement du match :",
          error
        );
      }
    }

    console.log("====================================");
    console.log("✅ SYNCHRONISATION TERMINÉE");
    console.log(`Matchs trouvés : ${fixtures.length}`);
    console.log(`Matchs créés : ${matchesCreated}`);
    console.log(`Matchs mis à jour : ${matchesUpdated}`);
    console.log(`Prédictions : ${predictionsGenerated}`);
    console.log(`Erreurs prédictions : ${predictionErrors}`);
    console.log(`Matchs ignorés : ${skippedFixtures}`);
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

      skippedFixtures,
    });
  } catch (error) {
    console.error(
      "❌ ERREUR GÉNÉRALE /api/matches/sync:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}

// Vercel Cron utilise GET
export async function GET(req: NextRequest) {
  console.log(
    "⏰ Vercel Cron → GET /api/matches/sync"
  );

  return syncMatches(req);
}

// POST conservé pour les tests manuels
export async function POST(req: NextRequest) {
  console.log(
    "🔄 POST /api/matches/sync"
  );

  return syncMatches(req);
}
