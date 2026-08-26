/**
 * Client pour API-Football / API-Sports
 *
 * Documentation :
 * https://www.api-football.com/documentation-v3
 *
 * Nécessite la variable d'environnement :
 * API_FOOTBALL_KEY
 */

const BASE_URL = "https://v3.football.api-sports.io";

function headers() {
  return {
    "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "",
  };
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: headers(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Erreur API-Football: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();

  if (
    data.errors &&
    Object.keys(data.errors).length > 0
  ) {
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

  return (data.response ?? []) as any[];
}

/**
 * Récupère les matchs d'une période.
 *
 * @param fromDate Format YYYY-MM-DD
 * @param toDate Format YYYY-MM-DD
 */
export async function fetchFixturesByDateRange(
  fromDate: string,
  toDate: string
) {
  const url = new URL(`${BASE_URL}/fixtures`);

  url.searchParams.set("from", fromDate);
  url.searchParams.set("to", toDate);

  const data = await fetchJson(url.toString());

  return (data.response ?? []) as any[];
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
