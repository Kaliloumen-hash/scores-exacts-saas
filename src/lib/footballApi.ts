/**
 * Client pour API-Football (via RapidAPI).
 * Doc : https://www.api-football.com/documentation-v3
 *
 * Nécessite la variable d'environnement API_FOOTBALL_KEY.
 */

const BASE_URL = "https://api-football-v1.p.rapidapi.com/v3";

function headers() {
  return {
    "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
    "x-rapidapi-key": process.env.API_FOOTBALL_KEY ?? "",
  };
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: headers(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Erreur API-Football: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
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
  const data = await fetchJson(
    `${BASE_URL}/fixtures?date=${encodeURIComponent(date)}`
  );

  return (data.response ?? []) as any[];
}

/**
 * Récupère les matchs d'une période.
 *
 * API-Football accepte les paramètres from/to.
 *
 * @param fromDate Format YYYY-MM-DD
 * @param toDate Format YYYY-MM-DD
 */
export async function fetchFixturesByDateRange(
  fromDate: string,
  toDate: string
) {
  const data = await fetchJson(
    `${BASE_URL}/fixtures?from=${encodeURIComponent(
      fromDate
    )}&to=${encodeURIComponent(toDate)}`
  );

  return (data.response ?? []) as any[];
}

export async function fetchLeagueStandings(
  leagueId: number,
  season: number
) {
  const data = await fetchJson(
    `${BASE_URL}/standings?league=${leagueId}&season=${season}`
  );

  return (data.response ?? []) as any[];
}

export async function fetchTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number
) {
  const data = await fetchJson(
    `${BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`
  );

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
