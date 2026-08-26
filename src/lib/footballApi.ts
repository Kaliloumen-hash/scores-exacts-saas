const BASE_URL = "https://v3.football.api-sports.io";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    throw new Error(
      "La variable d'environnement API_FOOTBALL_KEY est manquante."
    );
  }

  return {
    "x-apisports-key": apiKey,
    Accept: "application/json",
  };
}

class ApiFootballDateRestrictionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiFootballDateRestrictionError";
  }
}

async function fetchJson<T = any>(url: string): Promise<T> {
  console.log(`🌐 API-Football → ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
    cache: "no-store",
  });

  let data: any;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `API-Football a retourné une réponse invalide. HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    console.error(
      `❌ API-Football HTTP ${response.status}:`,
      JSON.stringify(data)
    );

    throw new Error(
      `Erreur API-Football: ${response.status} ${response.statusText}`
    );
  }

  if (
    data?.errors &&
    Object.keys(data.errors).length > 0
  ) {
    const errors = data.errors;

    console.error(
      "❌ Erreurs API-Football:",
      JSON.stringify(errors)
    );

    const errorText = JSON.stringify(errors);

    const isDateRestriction =
      errorText.includes(
        "Les forfaits gratuits n’ont pas accès à cette date"
      ) ||
      errorText.includes(
        "Les forfaits gratuits n'ont pas accès à cette date"
      ) ||
      errorText.includes(
        "free plans do not have access to this date"
      );

    if (isDateRestriction) {
      throw new ApiFootballDateRestrictionError(
        errorText
      );
    }

    throw new Error(
      `Erreur API-Football: ${errorText}`
    );
  }

  return data as T;
}

/**
 * Récupère les matchs d'une date précise.
 */
export async function fetchFixturesByDate(
  date: string
): Promise<any[]> {
  const url = new URL(
    `${BASE_URL}/fixtures`
  );

  url.searchParams.set(
    "date",
    date
  );

  try {
    const data =
      await fetchJson<{
        response?: any[];
      }>(url.toString());

    const fixtures =
      Array.isArray(data.response)
        ? data.response
        : [];

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
        `⚠️ Date ${date} non accessible avec le forfait API actuel.`
      );

      return [];
    }

    throw error;
  }
}

/**
 * Récupère les matchs sur une période.
 *
 * IMPORTANT :
 * Cette fonction est bien exportée.
 * C'est elle que route.ts importe.
 */
export async function fetchFixturesByDateRange(
  fromDate: string,
  toDate: string
): Promise<any[]> {
  const fixtures: any[] = [];

  const start =
    new Date(`${fromDate}T00:00:00Z`);

  const end =
    new Date(`${toDate}T00:00:00Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    throw new Error(
      `Dates invalides : ${fromDate} → ${toDate}`
    );
  }

  if (start > end) {
    throw new Error(
      `La date de début ${fromDate} est après la date de fin ${toDate}.`
    );
  }

  for (
    let current = new Date(start);
    current <= end;
    current.setUTCDate(
      current.getUTCDate() + 1
    )
  ) {
    const date =
      current
        .toISOString()
        .slice(0, 10);

    console.log(
      "------------------------------------"
    );

    console.log(
      `📅 Récupération des matchs pour ${date}`
    );

    try {
      const dailyFixtures =
        await fetchFixturesByDate(date);

      fixtures.push(
        ...dailyFixtures
      );

      console.log(
        `✅ ${date} : ${dailyFixtures.length} match(s)`
      );
    } catch (error) {
      console.error(
        `❌ Erreur récupération ${date}:`,
        error
      );

      // On continue avec le jour suivant.
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
 * Récupère le classement d'une ligue.
 */
export async function fetchLeagueStandings(
  leagueId: number,
  season: number
): Promise<any[]> {
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

  const data =
    await fetchJson<{
      response?: any[];
    }>(url.toString());

  return Array.isArray(data.response)
    ? data.response
    : [];
}

/**
 * Récupère les statistiques d'une équipe.
 */
export async function fetchTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number
): Promise<any> {
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

  const data =
    await fetchJson<{
      response?: any;
    }>(url.toString());

  return data.response ?? null;
}

/**
 * Convertit les statistiques API-Football
 * en moyennes utilisables par le modèle.
 */
export function parseTeamAverages(
  rawStats: any
) {
  const played =
    rawStats?.fixtures?.played;

  const homePlayed =
    Number(played?.home ?? 0);

  const awayPlayed =
    Number(played?.away ?? 0);

  const goalsScoredAvgHome =
    Number(
      rawStats?.goals?.for
        ?.average?.home ?? 0
    );

  const goalsConcededAvgHome =
    Number(
      rawStats?.goals?.against
        ?.average?.home ?? 0
    );

  const goalsScoredAvgAway =
    Number(
      rawStats?.goals?.for
        ?.average?.away ?? 0
    );

  const goalsConcededAvgAway =
    Number(
      rawStats?.goals?.against
        ?.average?.away ?? 0
    );

  return {
    goalsScoredAvgHome:
      Number.isFinite(
        goalsScoredAvgHome
      )
        ? goalsScoredAvgHome
        : 0,

    goalsConcededAvgHome:
      Number.isFinite(
        goalsConcededAvgHome
      )
        ? goalsConcededAvgHome
        : 0,

    goalsScoredAvgAway:
      Number.isFinite(
        goalsScoredAvgAway
      )
        ? goalsScoredAvgAway
        : 0,

    goalsConcededAvgAway:
      Number.isFinite(
        goalsConcededAvgAway
      )
        ? goalsConcededAvgAway
        : 0,

    matchesPlayed:
      homePlayed + awayPlayed,
  };
}
