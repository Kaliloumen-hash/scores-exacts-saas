/**
 * Moteur de prédiction football basé sur la loi de Poisson.
 *
 * Le moteur fonctionne même lorsque certaines statistiques
 * d'équipe sont absentes ou invalides.
 */

export interface TeamStats {
  goalsScoredAvgHome: number;
  goalsConcededAvgHome: number;
  goalsScoredAvgAway: number;
  goalsConcededAvgAway: number;
}

export interface LeagueAverages {
  avgGoalsHome: number;
  avgGoalsAway: number;
}

export interface PredictionResult {
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  exactScoreProb: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  scoreDistribution: {
    score: string;
    prob: number;
  }[];
  lambdaHome: number;
  lambdaAway: number;
}

function safeNumber(
  value: unknown,
  fallback: number
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.min(
    Math.max(value, min),
    max
  );
}

function factorial(n: number): number {
  if (n <= 1) {
    return 1;
  }

  let result = 1;

  for (let i = 2; i <= n; i++) {
    result *= i;
  }

  return result;
}

function poissonProb(
  lambda: number,
  goals: number
): number {
  if (
    !Number.isFinite(lambda) ||
    lambda < 0 ||
    goals < 0
  ) {
    return 0;
  }

  if (lambda === 0) {
    return goals === 0 ? 1 : 0;
  }

  return (
    Math.pow(lambda, goals) *
    Math.exp(-lambda) /
    factorial(goals)
  );
}

/**
 * Valeurs de secours utilisées lorsqu'API-Football
 * ne fournit pas de statistiques exploitables.
 */
function normalizeTeamStats(
  stats: TeamStats
): TeamStats {
  return {
    goalsScoredAvgHome: clamp(
      safeNumber(
        stats?.goalsScoredAvgHome,
        1.4
      ),
      0.2,
      4
    ),

    goalsConcededAvgHome: clamp(
      safeNumber(
        stats?.goalsConcededAvgHome,
        1.1
      ),
      0.2,
      4
    ),

    goalsScoredAvgAway: clamp(
      safeNumber(
        stats?.goalsScoredAvgAway,
        1.1
      ),
      0.2,
      4
    ),

    goalsConcededAvgAway: clamp(
      safeNumber(
        stats?.goalsConcededAvgAway,
        1.4
      ),
      0.2,
      4
    ),
  };
}

export function predictMatch(
  home: TeamStats,
  away: TeamStats,
  league: LeagueAverages,
  maxGoals = 8
): PredictionResult {
  const homeStats =
    normalizeTeamStats(home);

  const awayStats =
    normalizeTeamStats(away);

  const leagueHome =
    clamp(
      safeNumber(
        league?.avgGoalsHome,
        1.4
      ),
      0.5,
      3
    );

  const leagueAway =
    clamp(
      safeNumber(
        league?.avgGoalsAway,
        1.1
      ),
      0.5,
      3
    );

  /*
   * Force offensive domicile.
   */
  const homeAttack =
    homeStats.goalsScoredAvgHome /
    leagueHome;

  /*
   * Force défensive extérieur.
   *
   * Plus l'équipe extérieure encaisse,
   * plus l'adversaire a de potentiel offensif.
   */
  const awayDefense =
    awayStats.goalsConcededAvgAway /
    leagueHome;

  /*
   * Force offensive extérieur.
   */
  const awayAttack =
    awayStats.goalsScoredAvgAway /
    leagueAway;

  /*
   * Force défensive domicile.
   */
  const homeDefense =
    homeStats.goalsConcededAvgHome /
    leagueAway;

  /*
   * Buts attendus.
   */
  let lambdaHome =
    homeAttack *
    awayDefense *
    leagueHome;

  let lambdaAway =
    awayAttack *
    homeDefense *
    leagueAway;

  /*
   * Protection.
   */
  lambdaHome = clamp(
    safeNumber(lambdaHome, 1.4),
    0.2,
    5
  );

  lambdaAway = clamp(
    safeNumber(lambdaAway, 1.1),
    0.2,
    5
  );

  /*
   * Matrice des scores.
   */
  const matrix: {
    home: number;
    away: number;
    prob: number;
  }[] = [];

  for (
    let homeGoals = 0;
    homeGoals <= maxGoals;
    homeGoals++
  ) {
    for (
      let awayGoals = 0;
      awayGoals <= maxGoals;
      awayGoals++
    ) {
      const homeProb =
        poissonProb(
          lambdaHome,
          homeGoals
        );

      const awayProb =
        poissonProb(
          lambdaAway,
          awayGoals
        );

      matrix.push({
        home: homeGoals,
        away: awayGoals,
        prob:
          homeProb * awayProb,
      });
    }
  }

  /*
   * Total de la matrice.
   */
  const total =
    matrix.reduce(
      (sum, item) =>
        sum + item.prob,
      0
    );

  /*
   * Score exact le plus probable.
   */
  const best =
    matrix.reduce(
      (maximum, current) =>
        current.prob >
        maximum.prob
          ? current
          : maximum,
      matrix[0]
    );

  /*
   * Probabilités 1N2.
   */
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (const item of matrix) {
    if (item.home > item.away) {
      homeWinProb += item.prob;
    } else if (
      item.home === item.away
    ) {
      drawProb += item.prob;
    } else {
      awayWinProb += item.prob;
    }
  }

  /*
   * Normalisation.
   */
  if (total > 0) {
    homeWinProb /=
      total;

    drawProb /=
      total;

    awayWinProb /=
      total;
  }

  /*
   * Top 10 scores.
   */
  const scoreDistribution =
    [...matrix]
      .sort(
        (a, b) =>
          b.prob - a.prob
      )
      .slice(0, 10)
      .map((item) => ({
        score:
          `${item.home}-${item.away}`,

        prob:
          Number(
            (
              item.prob /
              total
            ).toFixed(4)
          ),
      }));

  return {
    predictedHomeGoals:
      best.home,

    predictedAwayGoals:
      best.away,

    exactScoreProb:
      Number(
        (
          best.prob /
          total
        ).toFixed(4)
      ),

    homeWinProb:
      Number(
        homeWinProb.toFixed(4)
      ),

    drawProb:
      Number(
        drawProb.toFixed(4)
      ),

    awayWinProb:
      Number(
        awayWinProb.toFixed(4)
      ),

    scoreDistribution,

    lambdaHome:
      Number(
        lambdaHome.toFixed(4)
      ),

    lambdaAway:
      Number(
        lambdaAway.toFixed(4)
      ),
  };
}
