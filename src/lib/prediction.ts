/**
 * Moteur de prédiction football
 * Modèle de Poisson indépendant.
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
}

function factorial(n: number): number {
  if (n < 0) {
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
  k: number
): number {
  if (
    !Number.isFinite(lambda) ||
    lambda < 0 ||
    !Number.isInteger(k) ||
    k < 0
  ) {
    return 0;
  }

  return (
    Math.pow(lambda, k) *
    Math.exp(-lambda)
  ) / factorial(k);
}

function safeNumber(
  value: number,
  fallback = 0
): number {
  return Number.isFinite(value)
    ? value
    : fallback;
}

export function predictMatch(
  home: TeamStats,
  away: TeamStats,
  league: LeagueAverages,
  maxGoals = 6
): PredictionResult {

  // ========================================
  // 1. DONNÉES
  // ========================================

  const avgGoalsHome = Math.max(
    safeNumber(
      league.avgGoalsHome,
      1.4
    ),
    0.1
  );

  const avgGoalsAway = Math.max(
    safeNumber(
      league.avgGoalsAway,
      1.1
    ),
    0.1
  );

  const homeGoalsScored =
    Math.max(
      safeNumber(
        home.goalsScoredAvgHome
      ),
      0
    );

  const homeGoalsConceded =
    Math.max(
      safeNumber(
        home.goalsConcededAvgHome
      ),
      0
    );

  const awayGoalsScored =
    Math.max(
      safeNumber(
        away.goalsScoredAvgAway
      ),
      0
    );

  const awayGoalsConceded =
    Math.max(
      safeNumber(
        away.goalsConcededAvgAway
      ),
      0
    );

  // ========================================
  // 2. FORCES
  // ========================================

  const homeAttackStrength =
    homeGoalsScored /
    avgGoalsHome;

  const homeDefenseStrength =
    homeGoalsConceded /
    avgGoalsAway;

  const awayAttackStrength =
    awayGoalsScored /
    avgGoalsAway;

  const awayDefenseStrength =
    awayGoalsConceded /
    avgGoalsHome;

  // ========================================
  // 3. LAMBDA
  // ========================================

  let lambdaHome =
    homeAttackStrength *
    awayDefenseStrength *
    avgGoalsHome;

  let lambdaAway =
    awayAttackStrength *
    homeDefenseStrength *
    avgGoalsAway;

  lambdaHome = Math.min(
    Math.max(lambdaHome, 0.05),
    6
  );

  lambdaAway = Math.min(
    Math.max(lambdaAway, 0.05),
    6
  );

  console.log(
    "🧠 Lambda domicile:",
    lambdaHome
  );

  console.log(
    "🧠 Lambda extérieur:",
    lambdaAway
  );

  // ========================================
  // 4. MATRICE
  // ========================================

  const matrix: {
    home: number;
    away: number;
    prob: number;
  }[] = [];

  for (
    let h = 0;
    h <= maxGoals;
    h++
  ) {
    for (
      let a = 0;
      a <= maxGoals;
      a++
    ) {
      const homeProb =
        poissonProb(
          lambdaHome,
          h
        );

      const awayProb =
        poissonProb(
          lambdaAway,
          a
        );

      const prob =
        homeProb * awayProb;

      if (Number.isFinite(prob)) {
        matrix.push({
          home: h,
          away: a,
          prob,
        });
      }
    }
  }

  // ========================================
  // 5. TOTAL
  // ========================================

  const total =
    matrix.reduce(
      (sum, item) =>
        sum + item.prob,
      0
    );

  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {
    throw new Error(
      "Impossible de calculer les probabilités"
    );
  }

  // ========================================
  // 6. SCORE EXACT
  // ========================================

  const best =
    matrix.reduce(
      (max, current) =>
        current.prob > max.prob
          ? current
          : max
    );

  // ========================================
  // 7. 1N2
  // ========================================

  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (const item of matrix) {
    if (
      item.home > item.away
    ) {
      homeWinProb += item.prob;
    } else if (
      item.home === item.away
    ) {
      drawProb += item.prob;
    } else {
      awayWinProb += item.prob;
    }
  }

  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;

  // ========================================
  // 8. TOP SCORES
  // ========================================

  const scoreDistribution =
    matrix
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

  // ========================================
  // 9. RESULTAT
  // ========================================

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
  };
}
