"use client";

import { useState } from "react";

interface ManualPaymentInfo {
  reference: string;
  amount: number;
  wavePaymentLink?: string;
  orangeMoneyPhoneNumber?: string;
}

async function goToStripeCheckout() {
  const res = await fetch("/api/stripe/checkout", { method: "POST" });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
}

export default function PricingPage() {
  const [manualInfo, setManualInfo] = useState<ManualPaymentInfo | null>(null);
  const [provider, setProvider] = useState<"wave" | "orange_money" | null>(null);
  const [loading, setLoading] = useState(false);

  async function startManualPayment(p: "wave" | "orange_money") {
    setLoading(true);
    const res = await fetch("/api/payments/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: p }),
    });
    const data = await res.json();
    setManualInfo(data);
    setProvider(p);
    setLoading(false);
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-6">
      <div className="border border-slate-800 rounded-xl p-8">
        <h2 className="text-xl font-bold mb-2">Gratuit</h2>
        <p className="text-slate-400 mb-6">3 prédictions par jour</p>
        <p className="text-3xl font-bold mb-6">0€</p>
        <a href="/login" className="block text-center border border-slate-700 rounded-lg py-2">
          Commencer
        </a>
      </div>

      <div className="border border-emerald-500 rounded-xl p-8">
        <h2 className="text-xl font-bold mb-2">Pro</h2>
        <p className="text-slate-400 mb-6">Prédictions illimitées, toutes les ligues</p>
        <p className="text-3xl font-bold mb-1">9,99€ / mois</p>
        <p className="text-slate-500 text-sm mb-6">≈ 5 000 FCFA</p>

        {!manualInfo && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => startManualPayment("wave")}
              disabled={loading}
              className="w-full bg-[#1DC8CD] text-slate-950 font-semibold rounded-lg py-2 disabled:opacity-50"
            >
              Payer avec Wave
            </button>
            <button
              onClick={() => startManualPayment("orange_money")}
              disabled={loading}
              className="w-full bg-[#FF7900] text-slate-950 font-semibold rounded-lg py-2 disabled:opacity-50"
            >
              Payer avec Orange Money
            </button>
            <button
              onClick={goToStripeCheckout}
              disabled={loading}
              className="w-full bg-emerald-500 text-slate-950 font-semibold rounded-lg py-2 disabled:opacity-50"
            >
              Payer par carte bancaire
            </button>
          </div>
        )}

        {manualInfo && (
          <div className="border border-slate-700 rounded-lg p-4 text-sm">
            {provider === "wave" && manualInfo.wavePaymentLink && (
              <p className="mb-2">
                Envoie <strong>{manualInfo.amount} FCFA</strong> via Wave :{" "}
                <a href={manualInfo.wavePaymentLink} target="_blank" className="text-emerald-400 underline">
                  {manualInfo.wavePaymentLink}
                </a>
              </p>
            )}
            {provider === "orange_money" && manualInfo.orangeMoneyPhoneNumber && (
              <p className="mb-2">
                Envoie <strong>{manualInfo.amount} FCFA</strong> par Orange Money au numéro :{" "}
                <strong>{manualInfo.orangeMoneyPhoneNumber}</strong>
              </p>
            )}
            <p className="mb-2">
              Indique impérativement ce code dans la note/motif du transfert :
            </p>
            <p className="font-mono text-lg text-emerald-400 mb-3">{manualInfo.reference}</p>
            <p className="text-slate-400 text-xs">
              Ton accès Pro sera activé dès que le paiement est vérifié manuellement (généralement sous
              quelques heures).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
