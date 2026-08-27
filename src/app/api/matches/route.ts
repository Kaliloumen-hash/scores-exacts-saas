
```typescript
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
      ok: true,
      count: matches.length,
      matches,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error
          ? error.message
          : "Erreur inconnue",
      },
      {
        status: 500,
      }
    );
  }
}
```

