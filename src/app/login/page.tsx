"use client";
export const dynamic = "force-dynamic";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="max-w-sm mx-auto px-6 py-24">
      <h1 className="text-2xl font-bold mb-6">Connexion</h1>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          signIn("credentials", { email, password, callbackUrl: "/dashboard" });
        }}
      >
        <input
          type="email"
          placeholder="Email"
          className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Mot de passe"
          className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="bg-emerald-500 text-slate-950 font-semibold rounded-lg py-2">
          Se connecter
        </button>
      </form>

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="w-full mt-3 border border-slate-700 rounded-lg py-2"
      >
        Continuer avec Google
      </button>
    </main>
  );
}
