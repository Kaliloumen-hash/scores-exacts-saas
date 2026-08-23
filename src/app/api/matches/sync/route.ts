import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFixturesByDate, fetchTeamStatistics, parseTeamAverages } from "@/lib/footballApi";
import { predictMatch } from "@/lib/prediction";

/**
 * Endpoint appelé par un cron job (ex: Vercel Cron, toutes les heures) pour :
 * 1. Récupérer les matchs à venir depuis API-Football
 * 2. Mettre à jour les stats des équipes
 * 3. Générer une prédiction pour chaque match
 *
 * Protégé par un secret partagé (header Authorization) pour éviter les appels non autorisés.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const fixtures = await fetchFixturesByDate(today);

  let created = 0;
  let predicted = 0;

  for (const fixture of fixtures) {
    const league = await prisma.league.upsert({
      where: { externalId: fixture.league.id },
      update: {},
      create: {
        externalId: fixture.league.id,
        name: fixture.league.name,
        country: fixture.league.country,
        season: fixture.league.season,
        logoUrl: fixture.league.logo,
      },
    });

    const homeTeam = await prisma.team.upsert({
      where: { externalId: fixture.teams.home.id },
      update: {},
      create: {
        externalId: fixture.teams.home.id,
        name: fixture.teams.home.name,
        logoUrl: fixture.teams.home.logo,
        leagueId: league.id,
      },
    });

    const awayTeam = await prisma.team.upsert({
      where: { externalId: fixture.teams.away.id },
      update: {},
      create: {
        externalId: fixture.teams.away.id,
        name: fixture.teams.away.name,
        logoUrl: fixture.teams.away.logo,
        leagueId: league.id,
      },
    });

    const match = await prisma.match.upsert({
      where: { externalId: fixture.fixture.id },
      update: { status: fixture.fixture.status.short },
      create: {
        externalId: fixture.fixture.id,
        leagueId: league.id,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        kickoffAt: new Date(fixture.fixture.date),
        status: fixture.fixture.status.short,
      },
    });
    created++;

    // Génère une prédiction uniquement pour les matchs pas encore joués
    if (fixture.fixture.status.short === "NS") {
      try {
        const [homeStatsRaw, awayStatsRaw] = await Promise.all([
          fetchTeamStatistics(fixture.teams.home.id, fixture.league.id, fixture.league.season),
          fetchTeamStatistics(fixture.teams.away.id, fixture.league.id, fixture.league.season),
        ]);
        const homeStats = parseTeamAverages(homeStatsRaw);
        const awayStats = parseTeamAverages(awayStatsRaw);

        // Moyennes de la ligue : approximées ici à 1.4/1.1 (à affiner avec un vrai calcul
        // sur l'ensemble des équipes de la ligue, stocké sur le modèle League)
        const leagueAverages = { avgGoalsHome: 1.4, avgGoalsAway: 1.1 };

        const result = predictMatch(homeStats, awayStats, leagueAverages);

        await prisma.prediction.upsert({
          where: { matchId: match.id },
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
        predicted++;
      } catch (e) {
        console.error(`Erreur prédiction pour le match ${match.id}`, e);
      }
    }
  }

  return NextResponse.json({ matchesSynced: created, predictionsGenerated: predicted });
}
