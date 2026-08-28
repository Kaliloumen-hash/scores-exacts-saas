```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await prisma.match.findMany({
      orderBy: {
        kickoffAt: "asc"
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        league: true,
        prediction: true
      }
    });

    return NextResponse.json({
      ok: true,
      count: matches.length,
      matches: matches,
      isPro: false
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "Impossible de recuperer les matchs"
      },
      {
        status: 500
      }
    );
  }
}
```
