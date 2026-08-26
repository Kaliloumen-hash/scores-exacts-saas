/**
 * Moteur de prédiction football basé sur la loi de Poisson.
 *
 * Le moteur calcule :
 * - force offensive domicile
 * - force défensive domicile
 * - force offensive extérieur
 * - force défensive extérieur
 * - buts attendus (lambda)
 * - score exact le plus probable
 * - probabilités 1N2
 * - top 10 des scores probables
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

/**
 * Factorielle.
 *
 * Les scores de football restent petits,
 * donc cette méthode est suffisante.
 */
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

/**
 * Probabilité de Poisson.
 */
function poissonProb(
  lambda: number,
  k: number
): number {
  if (!Number.isFinite(lambda) || lambda < 0) {
    return 0;
  }

  if (k < 0 || !Number.isInteger(k)) {
    return 0;
  }

  if (lambda === 0) {
    return k === 0 ? 1 : 0;
  }

  return (
    Math.pow(lambda, k) *
    Math.exp(-lambda) /
    factorial(k)
  );
}

/**
 * Nettoyage d'une valeur numérique.
 */
function safeNumber(
  value: unknown,
  fallback = 0
): number {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return number;
}

/**
 * Limite une valeur entre min et max.
 */
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

/**
 * Prédit un match.
 */
export function predictMatch(
  home: TeamStats,
  away: TeamStats,
  league: LeagueAverages,
  maxGoals = 8
): PredictionResult {
  const avgGoalsHome = safeNumber(
    league.avgGoalsHome,
    1.4
  );

  const avgGoalsAway = safeNumber(
    league.avgGoalsAway,
    1.1
  );

  /*
   * Évite une division par zéro.
   */
  const safeLeagueHome =
    avgGoalsHome > 0
      ? avgGoalsHome
      : 1.4;

  const safeLeagueAway =
    avgGoalsAway > 0
      ? avgGoalsAway
      : 1.1;

  /*
   * Statistiques domicile.
   */
  const homeGoalsScored =
    safeNumber(
      home.goalsScoredAvgHome
    );

  const homeGoalsConceded =
    safeNumber(
      home.goalsConcededAvgHome
    );

  /*
   * Statistiques extérieur.
   */
  const awayGoalsScored =
    safeNumber(
      away.goalsScoredAvgAway
    );

  const awayGoalsConceded =
    safeNumber(
      away.goalsConcededAvgAway
    );

  /*
   * Forces offensives.
   */
  const homeAttackStrength =
    homeGoalsScored /
    safeLeagueHome;

  const awayAttackStrength =
    awayGoalsScored /
    safeLeagueAway;

  /*
   * Forces défensives.
   *
   * Plus une équipe encaisse de buts,
   * plus sa faiblesse défensive est élevée.
   */
  const homeDefenseStrength =
    homeGoalsConceded /
    safeLeagueAway;

  const awayDefenseStrength =
    awayGoalsConceded /
    safeLeagueHome;

  /*
   * Lambda domicile.
   */
  let lambdaHome =
    homeAttackStrength *
    awayDefenseStrength *
    safeLeagueHome;

  /*
   * Lambda extérieur.
   */
  let lambdaAway =
    awayAttackStrength *
    homeDefenseStrength *
    safeLeagueAway;

  /*
   * Protection contre les valeurs absurdes.
   */
  lambdaHome = clamp(
    safeNumber(lambdaHome, 0.1),
    0.05,
    8
  );

  lambdaAway = clamp(
    safeNumber(lambdaAway, 0.1),
    0.05,
    8
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
      const homeProbability =
        poissonProb(
          lambdaHome,
          homeGoals
        );

      const awayProbability =
        poissonProb(
          lambdaAway,
          awayGoals
        );

      const probability =
        homeProbability *
        awayProbability;

      matrix.push({
        home: homeGoals,
        away: awayGoals,
        prob: probability,
      });
    }
  }

  /*
   * Score exact le plus probable.
   */
  const best =
    matrix.reduce(
      (maximum, current) => {
        return current.prob >
          maximum.prob
          ? current
          : maximum;
      },
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
  const total =
    homeWinProb +
    drawProb +
    awayWinProb;

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
              item.prob / total
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
          best.prob / total
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
