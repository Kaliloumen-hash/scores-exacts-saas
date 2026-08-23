/**
 * Client pour API-Football (via RapidAPI).
 * Doc : https://www.api-football.com/documentation-v3
 *
 * Nécessite la variable d'environnement API_FOOTBALL_KEY (clé RapidAPI).
 */

const BASE_URL = "https://api-football-v1.p.rapidapi.com/v3";

function headers() {
  return {
    "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
    "x-rapidapi-key": process.env.API_FOOTBALL_KEY ?? "",
  };
}

export async function fetchFixturesByDate(date: string) {
  // date au format YYYY-MM-DD
  const res = await fetch(`${BASE_URL}/fixtures?date=${date}`, { headers: headers() });
  if (!res.ok) throw new Error(`Erreur API-Football fixtures: ${res.status}`);
  const data = await res.json();
  return data.response as any[];
}

export async function fetchLeagueStandings(leagueId: number, season: number) {
  const res = await fetch(
    `${BASE_URL}/standings?league=${leagueId}&season=${season}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`Erreur API-Football standings: ${res.status}`);
  const data = await res.json();
  return data.response as any[];
}

export async function fetchTeamStatistics(teamId: number, leagueId: number, season: number) {
  const res = await fetch(
    `${BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`Erreur API-Football team stats: ${res.status}`);
  const data = await res.json();
  return data.response;
}

// Convertit les stats brutes de l'API en moyennes exploitables par le moteur de prédiction
export function parseTeamAverages(rawStats: any) {
  const played = rawStats.fixtures.played;
  return {
    goalsScoredAvgHome: Number(rawStats.goals.for.average.home),
    goalsConcededAvgHome: Number(rawStats.goals.against.average.home),
    goalsScoredAvgAway: Number(rawStats.goals.for.average.away),
    goalsConcededAvgAway: Number(rawStats.goals.against.average.away),
    matchesPlayed: played.home + played.away,
  };
}
