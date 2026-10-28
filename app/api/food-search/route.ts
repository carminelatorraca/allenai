import { NextRequest, NextResponse } from "next/server";
import { searchOffProducts } from "@/lib/openfoodfacts";

export type { FoodSearchResult } from "@/lib/openfoodfacts";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchOffProducts(query, { limit: 10 });
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Errore ricerca OpenFoodFacts:", error);
    return NextResponse.json(
      {
        results: [],
        error:
          error instanceof Error
            ? error.message
            : "Impossibile contattare il database alimentare.",
      },
      { status: 502 },
    );
  }
}
