import { NextRequest, NextResponse } from "next/server";

export type FoodSearchResult = {
  id: string;
  name: string;
  brand: string | null;
  calories_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
};

type OffNutriments = {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
};

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_it?: string;
  brands?: string;
  nutriments?: OffNutriments;
};

const USER_AGENT = "AllenAI-TrainLog/1.0 (uso personale, no contatti pubblici)";

// OpenFoodFacts limita la ricerca a 10 richieste/min per IP e sconsiglia
// esplicitamente di usarla per un search-as-you-type. Questa cache tiene le
// risposte per query normalizzata finché l'istanza serverless resta "calda":
// query comuni ("pollo", "riso"...) cercate da utenti diversi nello stesso
// periodo non toccano più OpenFoodFacts a ogni richiesta.
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

type CacheEntry = { results: FoodSearchResult[]; expiresAt: number };

const searchCache = new Map<string, CacheEntry>();

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of searchCache) {
    if (entry.expiresAt <= now) searchCache.delete(key);
  }
  if (searchCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey !== undefined) searchCache.delete(oldestKey);
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ results: cached.results });
  }

  const url = new URL("https://world.openfoodfacts.org/api/v2/search");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("page_size", "15");
  url.searchParams.set("lc", "it");
  url.searchParams.set(
    "fields",
    "code,product_name,product_name_it,brands,nutriments",
  );

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`OpenFoodFacts ha risposto con stato ${response.status}.`);
    }

    const data = (await response.json()) as { products?: OffProduct[] };
    const products = data.products ?? [];

    const results: FoodSearchResult[] = products
      .map((product) => {
        const name = product.product_name_it || product.product_name;
        if (!name || !product.code) return null;

        const nutriments = product.nutriments ?? {};

        return {
          id: product.code,
          name,
          brand: product.brands?.split(",")[0]?.trim() || null,
          calories_100g: nutriments["energy-kcal_100g"] ?? null,
          protein_100g: nutriments.proteins_100g ?? null,
          carbs_100g: nutriments.carbohydrates_100g ?? null,
          fat_100g: nutriments.fat_100g ?? null,
        };
      })
      .filter((item): item is FoodSearchResult => item !== null)
      .filter((item) => item.calories_100g !== null)
      .slice(0, 10);

    pruneCache();
    searchCache.set(cacheKey, { results, expiresAt: Date.now() + CACHE_TTL_MS });

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
