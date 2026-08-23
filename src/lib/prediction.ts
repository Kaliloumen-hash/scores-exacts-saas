/**
 * Moteur de prédiction basé sur un modèle de Poisson (indépendant, extensible en bivarié).
 *
 * Principe :
 * - On calcule la "force d'attaque" et la "force de défense" de chaque équipe
 *   à partir de leurs moyennes de buts marqués/encaissés (domicile/extérieur).
 * - On en déduit un "lambda" (nombre de buts attendu) pour chaque équipe dans ce match précis.
 * - On génère une matrice de probabilités pour chaque score possible (0-0, 1-0, 2-1, ...)
 *   via la loi de Poisson, puis on en extrait :
 *     - le score exact le plus probable
 *     - les probabilités 1N2 (victoire domicile / nul / victoire extérieur)
 */

export interface TeamStats {
  goalsScoredAvgHome: number;
  goalsConcededAvgHome: number;
  goalsScoredAvgAway: number;
  goalsConcededAvgAway: number;
}

export interface LeagueAverages {
  avgGoalsHome: number; // moyenne de buts marqués à domicile, toutes équipes confondues
  avgGoalsAway: number;
}

export interface PredictionResult {
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  exactScoreProb: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  scoreDistribution: { score: string; prob: number }[];
}

// Factorielle (petits nombres uniquement, suffisant pour des scores de foot)
function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

// Probabilité de Poisson : P(X = k) pour un lambda donné
function poissonProb(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

export function predictMatch(
  home: TeamStats,
  away: TeamStats,
  league: LeagueAverages,
  maxGoals = 6
): PredictionResult {
  // Force d'attaque/défense relative à la moyenne de la ligue
  const homeAttackStrength = home.goalsScoredAvgHome / league.avgGoalsHome;
  const homeDefenseStrength = home.goalsConcededAvgHome / league.avgGoalsAway;
  const awayAttackStrength = away.goalsScoredAvgAway / league.avgGoalsAway;
  const awayDefenseStrength = away.goalsConcededAvgAway / league.avgGoalsHome;

  // Lambda = nombre de buts attendu pour chaque équipe dans CE match
  const lambdaHome = homeAttackStrength * awayDefenseStrength * league.avgGoalsHome;
  const lambdaAway = awayAttackStrength * homeDefenseStrength * league.avgGoalsAway;

  // Construction de la matrice de probabilités pour chaque score possible
  const matrix: { home: number; away: number; prob: number }[] = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a);
      matrix.push({ home: h, away: a, prob });
    }
  }

  // Score exact le plus probable
  const best = matrix.reduce((max, cur) => (cur.prob > max.prob ? cur : max));

  // Agrégation en probabilités 1N2
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  for (const { home: h, away: a, prob } of matrix) {
    if (h > a) homeWinProb += prob;
    else if (h === a) drawProb += prob;
    else awayWinProb += prob;
  }

  // Normalisation (la matrice tronquée à maxGoals ne somme pas exactement à 1)
  const total = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;

  const scoreDistribution = matrix
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 10)
    .map((m) => ({ score: `${m.home}-${m.away}`, prob: Number((m.prob / total).toFixed(4)) }));

  return {
    predictedHomeGoals: best.home,
    predictedAwayGoals: best.away,
    exactScoreProb: Number((best.prob / total).toFixed(4)),
    homeWinProb: Number(homeWinProb.toFixed(4)),
    drawProb: Number(drawProb.toFixed(4)),
    awayWinProb: Number(awayWinProb.toFixed(4)),
    scoreDistribution,
  };
}
