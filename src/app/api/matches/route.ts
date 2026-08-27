import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await prisma.match.findMany({
      orderBy: {
        kickoffAt: "asc",
      },
      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
        prediction: true,
      },
    });

    return NextResponse.json({
      success: true,
      count: matches.length,
      matches,
    });
  } catch (error) {
    console.error("❌ Erreur récupération des matchs :", error);

    return NextResponse.json(
      {
        success: false,
        error: "Impossible de récupérer les matchs.",
      },
      { status: 500 }
    );
  }
}
