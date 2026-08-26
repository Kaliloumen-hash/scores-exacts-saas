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
 * Synchronise les prochains matchs depuis API-Football.
 *
 * Fonctionnement :
 * 1. Vérifie CRON_SECRET
 * 2. Récupère les matchs des 7 prochains jours
 * 3. Enregistre/met à jour les ligues
 * 4. Enregistre/met à jour les équipes
 * 5. Enregistre/met à jour les matchs
 * 6. Génère les prédictions pour les matchs à venir
 *
 * Endpoint prévu pour Vercel Cron.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    if (
      !process.env.CRON_SECRET ||
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    /*
     * Date actuelle.
     *
     * On utilise la date UTC pour rester cohérent
     * avec les dates retournées par API-Football.
     */
    const today = new Date();

    /*
     * Date de début : aujourd'hui.
     */
    const fromDate = today.toISOString().slice(0, 10);

    /*
     * Date de fin : dans 7 jours.
     */
    const toDateObject = new Date(today);
    toDateObject.setUTCDate(toDateObject.getUTCDate() + 7);

    const toDate = toDateObject.toISOString().slice(0, 10);

    console.log(
      `Synchronisation des matchs du ${fromDate} au ${toDate}`
    );

    /*
     * Récupération des matchs des 7 prochains jours.
     */
    const fixtures = await fetchFixturesByDateRange(
      fromDate,
      toDate
    );

    console.log(
      `${fixtures.length} match(s) récupéré(s) depuis API-Football`
    );

    let created = 0;
    let updated = 0;
    let predicted = 0;
    let predictionErrors = 0;

    /*
     * Traitement de chaque match.
     */
    for (const fixture of fixtures) {
      try {
        /*
         * Vérification minimale des données reçues.
         */
        if (
          !fixture?.fixture?.id ||
          !fixture?.league?.id ||
          !fixture?.teams?.home?.id ||
          !fixture?.teams?.away?.id
        ) {
          console.warn(
            "Fixture ignorée : données incomplètes",
            fixture
          );
          continue;
        }

        /*
         * 1. Ligue
         */
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

        /*
         * 2. Équipe à domicile
         */
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

        /*
         * 3. Équipe à l'extérieur
         */
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

        /*
         * 4. Match
         */
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
          updated++;
        } else {
          created++;
        }

        /*
         * 5. Génération de prédiction uniquement
         * pour les matchs qui ne sont pas encore commencés.
         */
        if (fixture.fixture.status.short !== "NS") {
          continue;
        }

        try {
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

          /*
           * Certaines équipes peuvent avoir des statistiques
           * incomplètes. On évite de faire planter toute la
           * synchronisation dans ce cas.
           */
          if (!homeStatsRaw || !awayStatsRaw) {
            console.warn(
              `Statistiques indisponibles pour ${fixture.teams.home.name} - ${fixture.teams.away.name}`
            );
            continue;
          }

          const homeStats = parseTeamAverages(homeStatsRaw);
          const awayStats = parseTeamAverages(awayStatsRaw);

          /*
           * Moyennes provisoires de la ligue.
           *
           * À améliorer plus tard avec un calcul dynamique
           * basé sur les données réelles de chaque championnat.
           */
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

          predicted++;
        } catch (error) {
          predictionErrors++;

          console.error(
            `Erreur prédiction pour ${fixture.teams.home.name} - ${fixture.teams.away.name}:`,
            error
          );
        }
      } catch (error) {
        console.error(
          "Erreur lors de la synchronisation d'un match:",
          error
        );
      }
    }

    return NextResponse.json({
      ok: true,
      dateRange: {
        from: fromDate,
        to: toDate,
      },
      fixturesFound: fixtures.length,
      matchesCreated: created,
      matchesUpdated: updated,
      predictionsGenerated: predicted,
      predictionErrors,
    });
  } catch (error) {
    console.error("Erreur générale synchronisation matchs:", error);

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
