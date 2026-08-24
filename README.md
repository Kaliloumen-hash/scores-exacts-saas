# Scores Exacts — SaaS de pronostics football

SaaS complet qui prédit le score exact et le vainqueur probable des matchs de football,
avec authentification, abonnement payant (Stripe) et un moteur de prédiction statistique.

## Stack
- **Frontend/Backend** : Next.js 14 (App Router) + Tailwind CSS
- **Base de données** : PostgreSQL + Prisma ORM
- **Auth** : NextAuth.js (email/mot de passe + Google)
- **Paiement** : Stripe (abonnement mensuel)
- **Données football** : API-Football (RapidAPI)
- **Moteur de prédiction** : modèle de Poisson (voir `src/lib/prediction.ts`)

## Démarrage en local

```bash
npm install
cp .env.example .env   # puis remplis les variables (voir ci-dessous)
npx prisma migrate dev --name init
npm run dev
```

## Variables d'environnement à configurer

| Variable | Où l'obtenir |
|---|---|
| `DATABASE_URL` | Ta base PostgreSQL (ex: Neon, Supabase, Railway) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `SECRET` | Google Cloud Console → OAuth 2.0 |
| `API_FOOTBALL_KEY` | [RapidAPI - API-Football](https://rapidapi.com/api-sports/api/api-football) |
| `STRIPE_SECRET_KEY` | Dashboard Stripe → Développeurs → Clés API |
| `STRIPE_WEBHOOK_SECRET` | Créé lors de la configuration du webhook Stripe |
| `STRIPE_PRICE_ID_PRO` | Créé dans Stripe → Produits → ton abonnement Pro |
| `WAVE_PAYMENT_LINK` | Ton lien de paiement Wave personnel (ex: `https://wave.com/pay/ton-nom`, généré depuis l'app Wave) |
| `ORANGE_MONEY_PHONE_NUMBER` | Ton numéro Orange Money personnel pour recevoir les paiements |
| `PRICE_PRO_XOF` | Prix du plan Pro en francs CFA (ex: 5000) |
| `CRON_SECRET` | Chaîne aléatoire de ton choix |

## Moyens de paiement

Trois moyens sont proposés sur la page `/pricing` :

- **Carte bancaire (Stripe)** : entièrement automatique, abonnement récurrent.
- **Wave** et **Orange Money** : mode **manuel**, sans compte marchand/API — pas besoin de
  Wave Business ni d'Orange Money Marchand.
  1. L'utilisateur clique sur Wave ou Orange Money → un code de référence unique est généré
     (ex: `PRO-A3F9K2`) et un paiement `pending_verification` est créé en base.
  2. Il envoie le montant sur ton lien Wave / numéro Orange Money personnel, en indiquant
     le code dans la note du transfert.
  3. Toi, en tant qu'admin, tu vérifies la réception sur ton compte Wave/Orange Money
     (montant + code de référence), puis tu confirmes le paiement sur `/admin/payments`.
  4. La confirmation prolonge automatiquement l'accès Pro de l'utilisateur de 30 jours.

### Devenir admin

Pour accéder à `/admin/payments`, passe `isAdmin` à `true` sur ton compte directement en base :
```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'ton-email@exemple.com';
```

## Synchronisation des matchs et prédictions

L'endpoint `POST /api/matches/sync` récupère les matchs du jour, met à jour les stats
des équipes et génère les prédictions. À appeler via un cron externe (ex: Vercel Cron,
cron-job.org) toutes les heures :

```
Authorization: Bearer <CRON_SECRET>
```

## Déploiement

Recommandé : **Vercel** pour le frontend/backend + **Neon** ou **Supabase** pour Postgres.

1. `vercel deploy`
2. Configure les variables d'environnement dans Vercel
3. Configure le webhook Stripe pour pointer vers `https://tondomaine.com/api/stripe/webhook`
4. Configure un Vercel Cron (`vercel.json`) pour appeler `/api/matches/sync` régulièrement

Le fichier `vercel.json` est déjà inclus : il appelle `/api/matches/sync` toutes les heures.
Vercel ajoute automatiquement le header `Authorization: Bearer <CRON_SECRET>` à l'appel,
à condition que la variable d'environnement `CRON_SECRET` soit bien configurée sur Vercel.

## Prochaines étapes suggérées
Mise à jour finale

- Affiner le modèle de prédiction (Poisson bivarié, ou passer à XGBoost avec plus de features :
  forme récente, blessures, historique face-à-face)
- Calculer dynamiquement les moyennes de ligue (`avgGoalsHome`/`avgGoalsAway`) plutôt que
  les valeurs fixes actuelles dans `src/app/api/matches/sync/route.ts`
- Ajouter un vrai suivi de fiabilité du modèle (comparer prédictions vs résultats réels)
- Filtres par championnat / équipe favorite sur le dashboard
