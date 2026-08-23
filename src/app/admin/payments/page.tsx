"use client";

import { useEffect, useState } from "react";

interface PendingPayment {
  id: string;
  provider: string;
  reference: string;
  amount: number;
  createdAt: string;
  user: { email: string };
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/payments")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error);
        return res.json();
      })
      .then((data) => setPayments(data.payments))
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleAction(paymentId: string, action: "confirm" | "reject") {
    await fetch("/api/admin/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, action }),
    });
    load();
  }

  if (error) return <p className="text-center py-24 text-red-400">{error}</p>;

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-8">Paiements en attente de vérification</h1>
      {payments.length === 0 && <p className="text-slate-500">Aucun paiement en attente.</p>}
      <div className="flex flex-col gap-4">
        {payments.map((p) => (
          <div key={p.id} className="border border-slate-800 rounded-xl p-5">
            <p className="text-sm text-slate-400 mb-1">{p.user.email}</p>
            <p className="font-semibold mb-1">
              {p.provider === "wave" ? "Wave" : "Orange Money"} — {p.amount} FCFA
            </p>
            <p className="text-emerald-400 font-mono mb-3">Réf: {p.reference}</p>
            <p className="text-xs text-slate-500 mb-4">
              Vérifie que ce montant avec cette référence est bien arrivé sur ton compte avant de confirmer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleAction(p.id, "confirm")}
                className="bg-emerald-500 text-slate-950 font-semibold px-4 py-2 rounded-lg"
              >
                Confirmer
              </button>
              <button
                onClick={() => handleAction(p.id, "reject")}
                className="border border-slate-700 px-4 py-2 rounded-lg"
              >
                Rejeter
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
