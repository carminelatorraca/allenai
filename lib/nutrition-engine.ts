import { supabase } from "@/lib/supabase";
import { searchOffProducts } from "@/lib/openfoodfacts";

export type DraftItem = {
  food_name: string;
  /** "generic" → cercato prima nelle tabelle CREA, "branded" → prima su OpenFoodFacts. */
  kind: "generic" | "branded";
  quantity_g: number;
};

export type VerifiedItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "crea" | "off";
};

export type MealTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type VerifiedAlternative = {
  title: string;
  items: VerifiedItem[];
  totals: MealTotals;
  /** totali verificati meno originale: positivo = l'alternativa ne ha di più. */
  deltas: MealTotals;
  /** alimenti proposti dall'AI che non è stato possibile verificare (né CREA né OFF). */
  unresolved: string[];
};

type Per100g = { calories: number; protein: number; carbs: number; fat: number };
type ResolvedFood = { resolvedName: string; per100g: Per100g; source: "crea" | "off" };

const STOPWORDS = new Set(["di", "da", "al", "in", "con", "e", "del", "della", "dei", "delle", "il", "la", "lo"]);

function searchWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

async function lookupGeneric(name: string): Promise<{ name: string; per100g: Per100g } | null> {
  const words = searchWords(name);
  if (words.length === 0) return null;

  let query = supabase
    .from("generic_foods")
    .select("name,calories_100g,protein_100g,carbs_100g,fat_100g");

  for (const word of words) {
    query = query.ilike("name", `%${word}%`);
  }

  const { data } = await query.order("name", { ascending: true }).limit(3);
  const row = data?.[0];
  if (!row) return null;

  return {
    name: row.name,
    per100g: {
      calories: Number(row.calories_100g),
      protein: Number(row.protein_100g),
      carbs: Number(row.carbs_100g),
      fat: Number(row.fat_100g),
    },
  };
}

async function lookupBranded(name: string): Promise<{ name: string; per100g: Per100g } | null> {
  const results = await searchOffProducts(name, { limit: 1 });
  const best = results[0];
  if (!best || best.calories_100g === null) return null;

  return {
    name: best.brand ? `${best.name} (${best.brand})` : best.name,
    per100g: {
      calories: best.calories_100g,
      protein: best.protein_100g ?? 0,
      carbs: best.carbs_100g ?? 0,
      fat: best.fat_100g ?? 0,
    },
  };
}

/**
 * Risolve un alimento proposto dall'AI su una fonte reale: prova prima quella
 * indicata da `kind` (CREA per i generici, OpenFoodFacts per i prodotti di
 * marca) e, se non trova nulla, prova l'altra prima di arrendersi — l'AI può
 * sbagliare il "ruolo" (es. proporre come generico un prodotto che esiste
 * solo come marca, o viceversa).
 */
export async function resolveFoodItem(draft: DraftItem): Promise<ResolvedFood | null> {
  const [primaryLookup, primarySource, fallbackLookup, fallbackSource] =
    draft.kind === "generic"
      ? ([lookupGeneric, "crea", lookupBranded, "off"] as const)
      : ([lookupBranded, "off", lookupGeneric, "crea"] as const);

  const primaryResult = await primaryLookup(draft.food_name);
  if (primaryResult) {
    return { resolvedName: primaryResult.name, per100g: primaryResult.per100g, source: primarySource };
  }

  const fallbackResult = await fallbackLookup(draft.food_name);
  if (fallbackResult) {
    return { resolvedName: fallbackResult.name, per100g: fallbackResult.per100g, source: fallbackSource };
  }

  return null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Risolve ogni alimento di una composizione proposta dall'AI su dati reali,
 * poi scala uniformemente le quantità per avvicinare le kcal totali a quelle
 * del pasto originale (un solo fattore di scala, non un solver su tutti i
 * macro insieme: le differenze di proteine/carboidrati/grassi che risultano
 * si mostrano, non si azzerano forzatamente).
 */
export async function buildAlternativeMeal(
  title: string,
  draftItems: DraftItem[],
  original: MealTotals,
): Promise<VerifiedAlternative> {
  const unresolved: string[] = [];
  const resolved: Array<{ food_name: string; quantity_g: number; per100g: Per100g; source: "crea" | "off" }> = [];

  for (const draft of draftItems) {
    const match = await resolveFoodItem(draft);
    if (!match) {
      unresolved.push(draft.food_name);
      continue;
    }

    resolved.push({
      food_name: match.resolvedName,
      quantity_g: draft.quantity_g > 0 ? draft.quantity_g : 100,
      per100g: match.per100g,
      source: match.source,
    });
  }

  const rawCalories = resolved.reduce(
    (sum, item) => sum + (item.per100g.calories * item.quantity_g) / 100,
    0,
  );

  const scale = rawCalories > 0 && original.calories > 0 ? original.calories / rawCalories : 1;

  const items: VerifiedItem[] = resolved.map((item) => {
    const quantity_g = item.quantity_g * scale;

    return {
      food_name: item.food_name,
      quantity_g: round1(quantity_g),
      calories: Math.round((item.per100g.calories * quantity_g) / 100),
      protein_g: round1((item.per100g.protein * quantity_g) / 100),
      carbs_g: round1((item.per100g.carbs * quantity_g) / 100),
      fat_g: round1((item.per100g.fat * quantity_g) / 100),
      source: item.source,
    };
  });

  const totals = items.reduce<MealTotals>(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein_g: round1(acc.protein_g + item.protein_g),
      carbs_g: round1(acc.carbs_g + item.carbs_g),
      fat_g: round1(acc.fat_g + item.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const deltas: MealTotals = {
    calories: Math.round(totals.calories - original.calories),
    protein_g: round1(totals.protein_g - original.protein_g),
    carbs_g: round1(totals.carbs_g - original.carbs_g),
    fat_g: round1(totals.fat_g - original.fat_g),
  };

  return { title, items, totals, deltas, unresolved };
}
