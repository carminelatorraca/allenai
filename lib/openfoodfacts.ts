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
  countries_tags?: string[];
};

const USER_AGENT = "AllenAI-TrainLog/1.0 (uso personale, no contatti pubblici)";

// OpenFoodFacts limita la ricerca a 10 richieste/min per IP e sconsiglia
// esplicitamente di usarla per un search-as-you-type. Questa cache tiene le
// risposte per query normalizzata finché l'istanza serverless resta "calda":
// query comuni ("pollo", "riso"...) cercate da utenti (o funzioni) diversi
// nello stesso periodo non toccano più OpenFoodFacts a ogni richiesta.
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

// Secondo OpenFoodFacts (confermato dal loro staff su Slack), un 503 non
// indica di aver sfondato il rate limit (quello sarebbe un 429): è il loro
// server sotto carico per il traffico di altri crawler, quindi è un errore
// transitorio su cui vale la pena ritentare subito un paio di volte. Un 429
// invece è un limite reale: ritentare lo peggiorerebbe solo.
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [300, 800];

/**
 * Cerca prodotti su OpenFoodFacts, limitati a quelli venduti in Italia
 * (`countries_tags=en:italy`): un prodotto senza questo tag non è acquistabile
 * da chi usa l'app, quindi non ha senso proporlo come alternativa.
 */
export async function searchOffProducts(
  query: string,
  options?: { limit?: number },
): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const limit = options?.limit ?? 10;
  const cacheKey = trimmed.toLowerCase();
  const cached = searchCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.results.slice(0, limit);
  }

  // L'endpoint /api/v2/search NON applica search_terms come ricerca testuale:
  // verificato dal vivo, restituisce l'intero catalogo (~4.8M prodotti) senza
  // filtrarlo per termine — è pensato per filtri strutturati su campi
  // taggati (categories_tags, brands_tags...), non per il testo libero. La
  // ricerca testuale vera va fatta sul vecchio /cgi/search.pl, che la
  // applica correttamente (verificato: "pollo" → prodotti al pollo) insieme
  // al filtro countries_tags.
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", trimmed);
  url.searchParams.set("countries_tags", "en:italy");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "15");
  url.searchParams.set("lc", "it");
  url.searchParams.set(
    "fields",
    "code,product_name,product_name_it,brands,nutriments,countries_tags",
  );

  let response: Response | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok || !RETRYABLE_STATUSES.has(response.status)) break;
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }

  if (!response || !response.ok) {
    throw new Error(`OpenFoodFacts ha risposto con stato ${response?.status}.`);
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
    .filter((item) => item.calories_100g !== null);

  // Il filtro countries_tags lato server a volte lascia passare risultati da
  // cache non coerenti con il filtro (verificato dal vivo): si ricontrolla
  // qui il tag sul prodotto originale prima di considerarlo valido.
  const italyOnly = products.filter((product) =>
    product.countries_tags?.includes("en:italy"),
  );
  const italyCodes = new Set(italyOnly.map((product) => product.code));
  const filteredResults = results.filter((item) => italyCodes.has(item.id));

  pruneCache();
  searchCache.set(cacheKey, { results: filteredResults, expiresAt: Date.now() + CACHE_TTL_MS });

  return filteredResults.slice(0, limit);
}
