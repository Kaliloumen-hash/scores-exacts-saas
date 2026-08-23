import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PRICE_PRO_XOF = Number(process.env.PRICE_PRO_XOF ?? 5000);

/**
 * Flux "manuel" pour Wave et Orange Money (pas de compte marchand/API) :
 * 1. L'utilisateur clique "Payer avec Wave/Orange Money"
 * 2. On génère un code de référence unique et on crée un paiement "pending_verification"
 * 3. On affiche le lien Wave / numéro Orange Money + le code à indiquer dans la note du virement
 * 4. Toi (admin) tu vérifies la réception sur ton compte Wave/Orange Money, puis tu confirmes
 *    le paiement depuis /admin/payments — ce qui prolonge l'accès Pro de l'utilisateur.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = await req.json();
  const provider = body.provider as "wave" | "orange_money";
  if (!["wave", "orange_money"].includes(provider)) {
    return NextResponse.json({ error: "Moyen de paiement invalide" }, { status: 400 });
  }

  // Code court et lisible que l'utilisateur va recopier dans la note du virement
  const reference = `PRO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await prisma.payment.create({
    data: {
      userId,
      provider,
      reference,
      amount: PRICE_PRO_XOF,
      status: "pending_verification",
    },
  });

  return NextResponse.json({
    reference,
    amount: PRICE_PRO_XOF,
    // Ces infos viennent de tes variables d'environnement (ton numéro/lien perso)
    wavePaymentLink: process.env.WAVE_PAYMENT_LINK,
    orangeMoneyPhoneNumber: process.env.ORANGE_MONEY_PHONE_NUMBER,
  });
}
