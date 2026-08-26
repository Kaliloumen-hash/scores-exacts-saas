/**
 * Client API-Football / API-Sports
 *
 * Documentation :
 * https://www.api-football.com/documentation-v3
 *
 * Variable d'environnement requise :
 * API_FOOTBALL_KEY
 */

const BASE_URL =
  "https://v3.football.api-sports.io";

const API_TIMEOUT_MS = 30_000;

/**
 * Vérifie que la clé API existe.
 */
function getApiKey(): string {
  const apiKey =
    process.env.API_FOOTBALL_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "API_FOOTBALL_KEY est absente des variables d'environnement."
    );
  }

  return apiKey;
}

/**
 * Headers API-Football.
 */
function getHeaders(): HeadersInit {
  return {
    "x-apisports-key": getApiKey(),
    Accept: "application/json",
  };
}

/**
 * Erreur spécifique lorsqu'une date
 * n'est pas accessible avec le forfait API.
 */
export class ApiFootballDateRestrictionError extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "ApiFootballDateRestrictionError";
  }
}

/**
 * Erreur API-Football.
 */
export class ApiFootballError extends Error {
  status?: number;

  constructor(
    message: string,
    status?: number
  ) {
    super(message);

    this.name =
      "ApiFootballError";

    this.status = status;
  }
}

/**
 * Vérifie si une erreur correspond
 * à une restriction de forfait/date.
 */
function isDateRestrictionError(
  errorText: string
): boolean {
  const text =
    errorText.toLowerCase();

  return (
    text.includes(
      "free plans do not have access to this date"
    ) ||
    text.includes(
      "free plan does not have access to this date"
    ) ||
    text.includes(
      "les forfaits gratuits n'ont pas accès à cette date"
    ) ||
    text.includes(
      "les forfaits gratuits n’ont pas accès à cette date"
    ) ||
    text.includes(
      "access to this date"
    )
  );
}

/**
 * Fetch JSON sécurisé avec timeout.
 */
async function fetchJson<T = any>(
  url: string
): Promise<T> {
  console.log(
    `🌐 API-Football → ${url}`
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, API_TIMEOUT_MS);

  try {
    const response =
      await fetch(url, {
        method: "GET",

        headers:
          getHeaders(),

        cache: "no-store",

        signal:
          controller.signal,
      });

    const rawText =
      await response.text();

    let data: any;

    try {
      data =
        rawText
          ? JSON.parse(rawText)
          : {};
    } catch {
      throw new ApiFootballError(
        "API-Football a retourné une réponse JSON invalide.",
        response.status
      );
    }

    /*
     * Erreur HTTP.
     */
    if (!response.ok) {
      console.error(
        `❌ API-Football HTTP ${response.status}`
      );

      console.error(
        JSON.stringify(data)
      );

      throw new ApiFootballError(
        `Erreur API-Football: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    /*
     * Erreurs retournées par API-Football
     */
    if (
      data?.errors &&
      Object.keys(data.errors).length > 0
    ) {
      const errorText =
        JSON.stringify(
          data.errors
        );

      console.error(
        "❌ Erreurs API-Football:",
        errorText
      );

      if (
        isDateRestrictionError(
          errorText
        )
      ) {
        throw new ApiFootballDateRestrictionError(
          errorText
        );
      }

      throw new ApiFootballError(
        `Erreur API-Football: ${errorText}`
      );
    }

    return data as T;
  } catch (error) {
    /*
     * Timeout.
     */
    if (
      error instanceof
        DOMException &&
      error.name === "AbortError"
    ) {
      throw new ApiFootballError(
        `Timeout API-Football après ${API_TIMEOUT_MS / 1000} secondes.`
      );
    }

    /*
     * Dans certains environnements,
     * AbortError peut être un Error classique.
     */
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new ApiFootballError(
        `Timeout API-Football après ${API_TIMEOUT_MS / 1000} secondes.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Récupère les matchs d'une date précise.
 *
 * Format :
 * YYYY-MM-DD
 *
 * Si la date n'est pas accessible avec
 * le forfait API, retourne [].
 */
export async function fetchFixturesByDate(
  date: string
): Promise<any[]> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date
    )
  ) {
    throw new Error(
      `Date invalide : ${date}. Format attendu : YYYY-MM-DD.`
    );
  }

  const url =
    new URL(
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
      }>(
        url.toString()
      );

    const fixtures =
      Array.isArray(
        data?.response
      )
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
        `⚠️ Date ${date} non accessible avec le forfait API.`
      );

      return [];
    }

    throw error;
  }
}

/**
 * Récupère les matchs d'une période.
 *
 * ATTENTION :
 * Cette fonction fait un appel par jour.
 *
 * Exemple :
 *
 * fetchFixturesByDateRange(
 *   "2026-08-26",
 *   "2026-08-27"
 * );
 */
export async function fetchFixturesByDateRange(
  fromDate: string,
  toDate: string
): Promise<any[]> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      fromDate
    )
  ) {
    throw new Error(
      `fromDate invalide : ${fromDate}`
    );
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      toDate
    )
  ) {
    throw new Error(
      `toDate invalide : ${toDate}`
    );
  }

  const start =
    new Date(
      `${fromDate}T00:00:00.000Z`
    );

  const end =
    new Date(
      `${toDate}T00:00:00.000Z`
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    throw new Error(
      "Impossible de convertir les dates."
    );
  }

  if (start > end) {
    throw new Error(
      `Période invalide : ${fromDate} → ${toDate}`
    );
  }

  const fixtures: any[] = [];

  for (
    let current =
      new Date(start);
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
        await fetchFixturesByDate(
          date
        );

      fixtures.push(
        ...dailyFixtures
      );

      console.log(
        `✅ ${date} : ${dailyFixtures.length} match(s)`
      );
    } catch (error) {
      console.error(
        `❌ Erreur récupération ${date}:`
      );

      console.error(error);

      /*
       * On continue avec le jour suivant.
       */
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
 * Récupère les matchs d'une seule date
 * avec uniquement les paramètres utiles.
 *
 * Cette fonction est utile pour le Cron
 * lorsqu'on ne veut pas récupérer plusieurs jours.
 */
export async function fetchFixturesByDateOnly(
  date: string
): Promise<any[]> {
  return fetchFixturesByDate(
    date
  );
}

/**
 * Récupère le classement d'une ligue.
 */
export async function fetchLeagueStandings(
  leagueId: number,
  season: number
): Promise<any[]> {
  if (
    !Number.isInteger(
      leagueId
    ) ||
    leagueId <= 0
  ) {
    throw new Error(
      `leagueId invalide : ${leagueId}`
    );
  }

  if (
    !Number.isInteger(
      season
    ) ||
    season < 1900
  ) {
    throw new Error(
      `season invalide : ${season}`
    );
  }

  const url =
    new URL(
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
    }>(
      url.toString()
    );

  return Array.isArray(
    data?.response
  )
    ? data.response
    : [];
}

/**
 * Récupère les statistiques
 * d'une équipe pour une ligue/saison.
 */
export async function fetchTeamStatistics(
  teamId: number,
  leagueId: number,
  season: number
): Promise<any> {
  if (
    !Number.isInteger(
      teamId
    ) ||
    teamId <= 0
  ) {
    throw new Error(
      `teamId invalide : ${teamId}`
    );
  }

  if (
    !Number.isInteger(
      leagueId
    ) ||
    leagueId <= 0
  ) {
    throw new Error(
      `leagueId invalide : ${leagueId}`
    );
  }

  if (
    !Number.isInteger(
      season
    ) ||
    season < 1900
  ) {
    throw new Error(
      `season invalide : ${season}`
    );
  }

  const url =
    new URL(
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
    }>(
      url.toString()
    );

  if (
    !data ||
    !data.response
  ) {
    throw new Error(
      `Aucune statistique disponible pour l'équipe ${teamId}, ligue ${leagueId}, saison ${season}.`
    );
  }

  return data.response;
}

/**
 * Convertit une valeur en nombre sûr.
 */
function toNumber(
  value: unknown,
  fallback = 0
): number {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : fallback;
}

/**
 * Convertit les statistiques API-Football
 * en statistiques utilisables par le moteur
 * de prédiction.
 */
export function parseTeamAverages(
  rawStats: any
) {
  const played =
    rawStats?.fixtures?.played;

  const homePlayed =
    toNumber(
      played?.home
    );

  const awayPlayed =
    toNumber(
      played?.away
    );

  const goalsFor =
    rawStats?.goals?.for;

  const goalsAgainst =
    rawStats?.goals?.against;

  const homeGoalsScored =
    toNumber(
      goalsFor?.average?.home
    );

  const homeGoalsConceded =
    toNumber(
      goalsAgainst?.average?.home
    );

  const awayGoalsScored =
    toNumber(
      goalsFor?.average?.away
    );

  const awayGoalsConceded =
    toNumber(
      goalsAgainst?.average?.away
    );

  return {
    goalsScoredAvgHome:
      homeGoalsScored,

    goalsConcededAvgHome:
      homeGoalsConceded,

    goalsScoredAvgAway:
      awayGoalsScored,

    goalsConcededAvgAway:
      awayGoalsConceded,

    matchesPlayed:
      homePlayed +
      awayPlayed,

    homeMatchesPlayed:
      homePlayed,

    awayMatchesPlayed:
      awayPlayed,
  };
}
