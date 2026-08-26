/**
 * Client pour API-Football / API-Sports
 *
 * Documentation :
 * https://www.api-football.com/documentation-v3
 *
 * Nécessite :
 * API_FOOTBALL_KEY
 */

const BASE_URL = "https://v3.football.api-sports.io";

function headers() {
  return {
    "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "",
    Accept: "application/json",
  };
}

async function fetchJson(url: string) {
  console.log(`🌐 API-Football → ${url}`);

  const res = await fetch(url, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(
      `❌ API-Football HTTP ${res.status}:`,
      JSON.stringify(data)
    );

    throw new Error(
      `Erreur API-Football: ${res.status} ${res.statusText}`
    );
  }

  if (
    data.errors &&
    Object.keys(data.errors).length > 0
  ) {
    console.error(
      "❌ Erreurs API-Football:",
      JSON.stringify(data.errors)
    );

    throw new Error(
      `Erreur API-Football: ${JSON.stringify(data.errors)}`
    );
  }

  return data;
}

/**
 * Récupère les matchs d'une date précise.
 *
 * @param date Format YYYY-MM-DD
 */
export async function fetchFixturesByDate(date: string) {
  const url = new URL(`${BASE_URL}/fixtures`);

  url.searchParams.set("date", date);

  const data = await fetchJson(url.toString());

  const fixtures = (data.response ?? []) as any[];

  console.log(
    `⚽ ${fixtures.length} match(s) récupéré(s) pour ${date}`
  );

  return fixtures;
}

/**
 * Récupère les matchs sur une période.
 *
 * Pour éviter les problèmes avec from/to,
 * cette fonction effectue un appel par jour.
 *
 * @param fromDate Format YYYY-MM-DD
 * @param toDate Format YYYY-MM-DD
 */
export async function fetchFixturesByDateRange(
  fromDate: string,
  toDate: string
) {
  const fixtures: any[] = [];

  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);

  for (
    let current = new Date(start);
    current <= end;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const date = current.toISOString().slice(0, 10);

    console.log(
      `📅 Récupération des matchs pour ${date}`
    );

    const dailyFixtures = await fetchFixturesByDate(date);

    fixtures.push(...dailyFixtures);
  }

  console.log(
    `⚽ Total : ${fixtures.length} match(s) récupéré(s) du ${fromDate} au ${toDate}`
  );

  return fixtures;
}

/**
 * Récupère les classements d'une ligue.
 */
export async function fetchLeagueStandings(
  leagueId: number,
  season: number
) {
  const url = new URL(`${BASE_URL}/standings`);

  url.searchParams.set("league", String(leagueId));
  url.searchParams.set("season", String(season));

  const data = await fetchJson(url.toString());

  return (data.response ?? []) as any[];
}

/**
 * Récupère les statistiques d'une équipe.
 */
export async function fetchTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number
) {
  const url = new URL(`${BASE_URL}/teams/statistics`);

  url.searchParams.set("team", String(teamId));
  url.searchParams.set("league", String(leagueId));
  url.searchParams.set("season", String(season));

  const data = await fetchJson(url.toString());

  return data.response;
}

/**
 * Convertit les statistiques brutes de l'API
 * en moyennes exploitables par le moteur de prédiction.
 */
export function parseTeamAverages(rawStats: any) {
  const played = rawStats?.fixtures?.played;

  const homePlayed = Number(played?.home ?? 0);
  const awayPlayed = Number(played?.away ?? 0);

  return {
    goalsScoredAvgHome: Number(
      rawStats?.goals?.for?.average?.home ?? 0
    ),

    goalsConcededAvgHome: Number(
      rawStats?.goals?.against?.average?.home ?? 0
    ),

    goalsScoredAvgAway: Number(
      rawStats?.goals?.for?.average?.away ?? 0
    ),

    goalsConcededAvgAway: Number(
      rawStats?.goals?.against?.average?.away ?? 0
    ),

    matchesPlayed: homePlayed + awayPlayed,
  };
}
