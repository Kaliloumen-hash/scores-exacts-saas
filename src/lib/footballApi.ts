/**
 * Client API-Football / API-Sports
 */

const BASE_URL = "https://v3.football.api-sports.io";

function headers() {
  return {
    "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "",
    Accept: "application/json",
  };
}

class ApiFootballDateRestrictionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiFootballDateRestrictionError";
  }
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
    const errors = data.errors;
    const errorText = JSON.stringify(errors);

    console.error(
      "❌ Erreurs API-Football:",
      errorText
    );

    const lower = errorText.toLowerCase();

    if (
      lower.includes("free plans do not have access to this date") ||
      lower.includes("les forfaits gratuits n'ont pas accès à cette date") ||
      lower.includes("les forfaits gratuits n’ont pas accès à cette date")
    ) {
      throw new ApiFootballDateRestrictionError(
        errorText
      );
    }

    throw new Error(
      `Erreur API-Football: ${errorText}`
    );
  }

  return data;
}

/**
 * Matchs d'une date.
 */
export async function fetchFixturesByDate(
  date: string
) {
  const url = new URL(
    `${BASE_URL}/fixtures`
  );

  url.searchParams.set("date", date);

  try {
    const data = await fetchJson(
      url.toString()
    );

    const fixtures =
      (data.response ?? []) as any[];

    console.log(
      `⚽ ${fixtures.length} match(s) récupéré(s) pour ${date}`
    );

    return fixtures;
  } catch (error) {
    if (
      error instanceof
      ApiFootballDateRestrictionError
    ) {
      console.warn(
        `⚠️ Date ${date} inaccessible avec le forfait actuel.`
      );

      return [];
    }

    throw error;
  }
}

/**
 * Matchs sur une période.
 */
export async function fetchFixturesByDateRange(
  fromDate: string,
  toDate: string
) {
  const fixtures: any[] = [];

  const start =
    new Date(`${fromDate}T00:00:00Z`);

  const end =
    new Date(`${toDate}T00:00:00Z`);

  for (
    let current = new Date(start);
    current <= end;
    current.setUTCDate(
      current.getUTCDate() + 1
    )
  ) {
    const date =
      current.toISOString().slice(0, 10);

    console.log(
      "------------------------------------"
    );

    console.log(
      `📅 Récupération des matchs pour ${date}`
    );

    try {
      const dailyFixtures =
        await fetchFixturesByDate(date);

      fixtures.push(...dailyFixtures);

      console.log(
        `✅ ${date} : ${dailyFixtures.length} match(s)`
      );
    } catch (error) {
      console.error(
        `❌ Erreur récupération ${date}:`,
        error
      );

      continue;
    }
  }

  console.log(
    "===================================="
  );

  console.log(
    `⚽ Total : ${fixtures.length} match(s)`
  );

  console.log(
    `📅 Période : ${fromDate} → ${toDate}`
  );

  console.log(
    "===================================="
  );

  return fixtures;
}

/**
 * Classement.
 */
export async function fetchLeagueStandings(
  leagueId: number,
  season: number
) {
  const url = new URL(
    `${BASE_URL}/standings`
  );

  url.searchParams.set(
    "league",
    String(leagueId)
  );

  url.searchParams.set(
    "season",
    String(season)
  );

  const data = await fetchJson(
    url.toString()
  );

  return (
    data.response ?? []
  ) as any[];
}

/**
 * Statistiques équipe.
 */
export async function fetchTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number
) {
  if (!teamId || !leagueId || !season) {
    throw new Error(
      "Paramètres statistiques invalides"
    );
  }

  const url = new URL(
    `${BASE_URL}/teams/statistics`
  );

  url.searchParams.set(
    "team",
    String(teamId)
  );

  url.searchParams.set(
    "league",
    String(leagueId)
  );

  url.searchParams.set(
    "season",
    String(season)
  );

  const data = await fetchJson(
    url.toString()
  );

  if (!data.response) {
    throw new Error(
      `Aucune statistique disponible pour l'équipe ${teamId}`
    );
  }

  return data.response;
}

/**
 * Conversion statistiques.
 */
export function parseTeamAverages(
  rawStats: any
) {
  if (!rawStats) {
    throw new Error(
      "Statistiques équipe absentes"
    );
  }

  const homeScored = Number(
    rawStats?.goals?.for?.average?.home
  );

  const homeConceded = Number(
    rawStats?.goals?.against?.average?.home
  );

  const awayScored = Number(
    rawStats?.goals?.for?.average?.away
  );

  const awayConceded = Number(
    rawStats?.goals?.against?.average?.away
  );

  const homePlayed = Number(
    rawStats?.fixtures?.played?.home ?? 0
  );

  const awayPlayed = Number(
    rawStats?.fixtures?.played?.away ?? 0
  );

  const values = [
    homeScored,
    homeConceded,
    awayScored,
    awayConceded,
  ];

  const invalid = values.some(
    (value) =>
      !Number.isFinite(value) ||
      value < 0
  );

  if (invalid) {
    throw new Error(
      "Statistiques insuffisantes ou invalides"
    );
  }

  return {
    goalsScoredAvgHome: homeScored,
    goalsConcededAvgHome: homeConceded,
    goalsScoredAvgAway: awayScored,
    goalsConcededAvgAway: awayConceded,

    matchesPlayed:
      homePlayed + awayPlayed,
  };
}
