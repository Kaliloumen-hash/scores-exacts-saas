import Link from "next/link";

export default function HomePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-24 text-center">
      <h1 className="text-4xl font-bold mb-4">
        Prédisez le score exact de vos matchs préférés
      </h1>
      <p className="text-slate-400 mb-10">
        Notre modèle statistique analyse les stats de chaque équipe pour vous donner
        le score exact le plus probable et le vainqueur pronostiqué, avant chaque match.
      </p>
      <div className="flex gap-4 justify-center">
        <Link href="/login" className="bg-emerald-500 text-slate-950 font-semibold px-6 py-3 rounded-lg">
          Commencer gratuitement
        </Link>
        <Link href="/pricing" className="border border-slate-700 px-6 py-3 rounded-lg">
          Voir les tarifs
        </Link>
      </div>
    </main>
  );
}
