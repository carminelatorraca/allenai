import { NextRequest, NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { buildAlternativeMeal, type MealTotals } from "@/lib/nutrition-engine";

type OriginalMealItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type MealAlternativesRequest = {
  original?: { title?: string; items?: OriginalMealItem[] };
  category?: "similar" | "faster" | "different";
  notes?: string;
};

const CATEGORY_INSTRUCTIONS: Record<"similar" | "faster" | "different", string> = {
  similar:
    "Le alternative devono avere apporto calorico e ripartizione di macronutrienti " +
    "(proteine/carboidrati/grassi) il più simile possibile al pasto originale.",
  faster:
    "Le alternative devono essere più veloci da preparare dell'originale: pochi ingredienti, " +
    "pochi passaggi, alimenti pronti o che richiedono poca cottura. Le calorie totali devono " +
    "restare vicine a quelle dell'originale; i macronutrienti possono variare.",
  different:
    "Le alternative devono proporre alimenti e abbinamenti diversi dall'originale (altra " +
    "cucina, altri ingredienti principali), restando comunque un pasto equilibrato. Le calorie " +
    "totali devono restare vicine a quelle dell'originale; i macronutrienti possono variare.",
};

function sumTotals(items: OriginalMealItem[]): MealTotals {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein_g: acc.protein_g + item.protein_g,
      carbs_g: acc.carbs_g + item.carbs_g,
      fat_g: acc.fat_g + item.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export async function POST(request: NextRequest) {
  let body: MealAlternativesRequest;

  try {
    body = (await request.json()) as MealAlternativesRequest;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Richiesta non valida." },
      { status: 400 },
    );
  }

  const items = body.original?.items ?? [];
  const title = body.original?.title?.trim();
  const category = body.category;

  if (!title || items.length === 0 || !category || !CATEGORY_INSTRUCTIONS[category]) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Servono il pasto originale (titolo e alimenti) e una categoria valida.",
      },
      { status: 400 },
    );
  }

  const originalTotals = sumTotals(items);

  const itemsDescription = items
    .map(
      (item) =>
        `- ${item.food_name}: ${Math.round(item.quantity_g)} g, ${Math.round(item.calories)} kcal ` +
        `(P ${item.protein_g.toFixed(1)} · C ${item.carbs_g.toFixed(1)} · F ${item.fat_g.toFixed(1)} g)`,
    )
    .join("\n");

  const prompt = `Proponi esattamente 3 pasti alternativi a questo pasto, in italiano.

Pasto originale: "${title}"
${itemsDescription}
Totali originali: ${Math.round(originalTotals.calories)} kcal, P ${originalTotals.protein_g.toFixed(1)} · C ${originalTotals.carbs_g.toFixed(1)} · F ${originalTotals.fat_g.toFixed(1)} g.

${CATEGORY_INSTRUCTIONS[category]}
${body.notes?.trim() ? `Preferenze/allergie dell'utente da rispettare: ${body.notes.trim()}` : ""}

Regole:
- Per ogni alimento specifica "kind": "generic" per un alimento generico/non di marca (es. "petto di pollo", "riso basmati", "pane integrale"), "branded" SOLO se intendi un prodotto specifico con marchio commerciale (es. "Pasta Barilla n°5").
- NON includere valori calorici o di macronutrienti: verranno calcolati da fonti nutrizionali reali dopo la tua proposta. Indica solo una quantity_g indicativa e plausibile.
- Usa alimenti comuni, facilmente reperibili in Italia.
- "title" è il nome breve del pasto alternativo.`;

  try {
    const result = await getAiProvider().generateMealAlternatives(prompt);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.code, message: result.message },
        { status: result.status },
      );
    }

    const alternatives = await Promise.all(
      result.alternatives.map((draft) =>
        buildAlternativeMeal(draft.title, draft.items, originalTotals),
      ),
    );

    return NextResponse.json({ alternatives });
  } catch (error) {
    console.error("Errore generazione alternative pasto:", error);
    return NextResponse.json(
      {
        error: "ai_error",
        message:
          error instanceof Error ? error.message : "Errore durante la generazione delle alternative.",
      },
      { status: 502 },
    );
  }
}
