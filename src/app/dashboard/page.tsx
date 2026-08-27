"use client";

import { useEffect, useState } from "react";

interface Match {
  id: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: {
    name: string;
    logoUrl?: string | null;
  };
  awayTeam: {
    name: string;
    logoUrl?: string | null;
  };
  league: {
    name: string;
    country: string;
  };
  prediction: {
    predictedHomeGoals: number;
    predictedAwayGoals: number;
    exactScoreProb: number;
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
  } | null;
}

export default function DashboardPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMatches() {
      try {
        const res = await fetch("/api/matches", {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(
            data.error ?? "Impossible de récupérer les matchs."
          );
        }

        setMatches(data.matches ?? []);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Une erreur est survenue."
        );
      } finally {
        setLoading(false);
      }
    }

    loadMatches();
  }, []);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-24 text-center">
        <p className="text-slate-400">
          Chargement des matchs...
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-xl mx-auto px-6 py-24 text-center">
        <p className="text-red-400 mb-4">{error}</p>

        <button
          onClick={() => window.location.reload()}
          className="bg-emerald-500 text-slate-950 font-semibold px-6 py-3 rounded-lg"
        >
          Réessayer
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Matchs de football
        </h1>

        <p className="text-slate-400">
          {matches.length} match(s) disponible(s)
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="border border-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">
            Aucun match disponible pour le moment.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {matches.map((match) => {
            const date = new Date(match.kickoffAt);

            return (
              <div
                key={match.id}
                className="border border-slate-800 rounded-xl p-5 bg-slate-950"
              >
                {/* Ligue */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-xs text-slate-500">
                      {match.league.name}
                    </p>

                    <p className="text-xs text-slate-600">
                      {match.league.country}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      {date.toLocaleDateString("fr-FR")}
                    </p>

                    <p className="text-xs text-slate-500">
                      {date.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                {/* Équipes */}
                <div className="grid grid-cols-3 items-center gap-4">
                  {/* Équipe domicile */}
                  <div className="text-center">
                    {match.homeTeam.logoUrl && (
                      <img
                        src={match.homeTeam.logoUrl}
                        alt={match.homeTeam.name}
                        className="w-12 h-12 object-contain mx-auto mb-2"
                      />
                    )}

                    <p className="font-semibold">
                      {match.homeTeam.name}
                    </p>
                  </div>

                  {/* Score */}
                  <div className="text-center">
                    {match.prediction ? (
                      <>
                        <p className="text-xs text-slate-500 mb-1">
                          Score prédit
                        </p>

                        <p className="text-2xl font-bold text-emerald-400">
                          {match.prediction.predictedHomeGoals}
                          {" - "}
                          {match.prediction.predictedAwayGoals}
                        </p>
                      </>
                    ) : match.homeScore !== null &&
                      match.awayScore !== null ? (
                      <>
                        <p className="text-xs text-slate-500 mb-1">
                          Score
                        </p>

                        <p className="text-2xl font-bold">
                          {match.homeScore}
                          {" - "}
                          {match.awayScore}
                        </p>
                      </>
                    ) : (
                      <p className="text-slate-500 font-semibold">
                        VS
                      </p>
                    )}
                  </div>

                  {/* Équipe extérieure */}
                  <div className="text-center">
                    {match.awayTeam.logoUrl && (
                      <img
                        src={match.awayTeam.logoUrl}
                        alt={match.awayTeam.name}
                        className="w-12 h-12 object-contain mx-auto mb-2"
                      />
                    )}

                    <p className="font-semibold">
                      {match.awayTeam.name}
                    </p>
                  </div>
                </div>

                {/* Prédiction */}
                {match.prediction && (
                  <div className="grid grid-cols-4 gap-2 mt-5 pt-4 border-t border-slate-800 text-center">
                    <div>
                      <p className="text-xs text-slate-500">
                        Domicile
                      </p>

                      <p className="font-semibold text-sm">
                        {Math.round(
                          match.prediction.homeWinProb * 100
                        )}
                        %
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Nul
                      </p>

                      <p className="font-semibold text-sm">
                        {Math.round(
                          match.prediction.drawProb * 100
                        )}
                        %
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Extérieur
                      </p>

                      <p className="font-semibold text-sm">
                        {Math.round(
                          match.prediction.awayWinProb * 100
                        )}
                        %
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Score exact
                      </p>

                      <p className="font-semibold text-sm">
                        {Math.round(
                          match.prediction.exactScoreProb * 100
                        )}
                        %
                      </p>
                    </div>
                  </div>
                )}

                {!match.prediction && (
                  <div className="mt-5 pt-4 border-t border-slate-800 text-center">
                    <p className="text-xs text-slate-500">
                      Prédiction disponible prochainement
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
