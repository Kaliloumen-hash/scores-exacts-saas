"use client";

import { useEffect, useState } from "react";

interface MatchWithPrediction {
  id: string;
  kickoffAt: string;
  homeTeam: { name: string; logoUrl?: string };
  awayTeam: { name: string; logoUrl?: string };
  league: { name: string };
  prediction: {
    predictedHomeGoals: number;
    predictedAwayGoals: number;
    exactScoreProb: number;
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
  };
}

export default function DashboardPage() {
  const [matches, setMatches] = useState<MatchWithPrediction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/predictions")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Erreur");
        }
        return res.json();
      })
      .then((data) => setMatches(data.matches))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-center py-24">Chargement des prédictions...</p>;

  if (error) {
    return (
      <main className="max-w-xl mx-auto px-6 py-24 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <a href="/pricing" className="bg-emerald-500 text-slate-950 font-semibold px-6 py-3 rounded-lg">
          Passer au plan Pro
        </a>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-8">Prochains matchs</h1>
      <div className="flex flex-col gap-4">
        {matches.map((m) => (
          <div key={m.id} className="border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-2">{m.league.name}</p>
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold">{m.homeTeam.name}</span>
              <span className="text-emerald-400 font-bold text-lg">
                {m.prediction.predictedHomeGoals} - {m.prediction.predictedAwayGoals}
              </span>
              <span className="font-semibold">{m.awayTeam.name}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Dom {Math.round(m.prediction.homeWinProb * 100)}%</span>
              <span>Nul {Math.round(m.prediction.drawProb * 100)}%</span>
              <span>Ext {Math.round(m.prediction.awayWinProb * 100)}%</span>
              <span>Score exact {Math.round(m.prediction.exactScoreProb * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
