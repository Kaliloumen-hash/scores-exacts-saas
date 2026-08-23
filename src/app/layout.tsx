import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scores Exacts — Pronostics Football par IA",
  description: "Prédictions de scores exacts et de vainqueur pour les matchs de football, basées sur un modèle statistique.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-slate-950 text-slate-100 min-h-screen">{children}</body>
    </html>
  );
}
