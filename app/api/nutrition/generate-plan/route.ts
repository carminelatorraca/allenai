import { NextRequest, NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";

type GeneratePlanRequest = {
  heightCm?: number | null;
  weightKg?: number | null;
  sex?: string | null;
  age?: number | null;
  goal?: string | null;
  activityLevel?: string | null;
  notes?: string;
  /** 0=Lunedì...6=Domenica. Se presente, genera solo questo giorno invece dell'intera settimana. */
  weekday?: number;
};

const WEEKDAY_LABEL = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

const GOAL_LABEL: Record<string, string> = {
  lose_fat: "perdere grasso",
  build_muscle: "aumentare la massa muscolare",
  recomposition: "ricomposizione corporea",
  maintain: "mantenere il peso",
  improve_fitness: "migliorare la forma fisica",
};

const ACTIVITY_LABEL: Record<string, string> = {
  sedentary: "sedentario",
  light: "leggermente attivo",
  moderate: "moderatamente attivo",
  high: "molto attivo",
  very_high: "estremamente attivo",
};

export async function POST(request: NextRequest) {
  let body: GeneratePlanRequest;

  try {
    body = (await request.json()) as GeneratePlanRequest;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Richiesta non valida." },
      { status: 400 },
    );
  }

  if (!body.heightCm || !body.weightKg) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Altezza e peso sono necessari per generare un piano personalizzato.",
      },
      { status: 400 },
    );
  }

  const profileLines = [
    `Altezza: ${body.heightCm} cm`,
    `Peso: ${body.weightKg} kg`,
    body.sex ? `Sesso: ${body.sex === "male" ? "uomo" : "donna"}` : null,
    body.age ? `Età: ${body.age} anni` : null,
    body.goal ? `Obiettivo: ${GOAL_LABEL[body.goal] ?? body.goal}` : null,
    body.activityLevel
      ? `Livello di attività: ${ACTIVITY_LABEL[body.activityLevel] ?? body.activityLevel}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const hasWeekday = typeof body.weekday === "number" && body.weekday >= 0 && body.weekday <= 6;

  const scopeDescription = hasWeekday
    ? `Genera SOLO i pasti per un singolo giorno: ${WEEKDAY_LABEL[body.weekday as number]} (colazione, pranzo, uno spuntino, cena — 4 pasti totali).`
    : "Genera un piano alimentare SETTIMANALE completo (7 giorni, da Lunedì a Domenica). Per ogni giorno includi colazione, pranzo, uno spuntino e cena (28 pasti totali).";

  const weekdayRule = hasWeekday
    ? `- weekday deve essere impostato a ${body.weekday} (${WEEKDAY_LABEL[body.weekday as number]}) per TUTTI i pasti generati.`
    : "- weekday deve essere impostato per ogni pasto in base al giorno a cui appartiene: 0=Lunedì, 1=Martedì, 2=Mercoledì, 3=Giovedì, 4=Venerdì, 5=Sabato, 6=Domenica. Non usare -1: ogni pasto generato deve avere un giorno assegnato.";

  const prompt = `${scopeDescription} Rispondi in italiano.

${profileLines}
${body.notes ? `Note/preferenze dell'utente: ${body.notes}` : ""}

Regole:
- Stima il fabbisogno calorico ed energetico in base ai dati forniti (formula Mifflin-St Jeor + livello di attività) e adatta le calorie totali all'obiettivo indicato.
- Bilancia i macronutrienti in modo ragionevole: proteine circa 1.6-2.2 g/kg di peso corporeo, grassi circa 25-30% delle calorie totali, il resto da carboidrati.
- Usa alimenti comuni e facilmente reperibili. Indica quantità in grammi.
- meal_type deve essere uno tra: breakfast, lunch, snack, dinner.
${weekdayRule}
- "title" è il nome breve del pasto; "instructions" può contenere brevi indicazioni di preparazione.`;

  try {
    const result = await getAiProvider().generateMealPlan(prompt);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.code, message: result.message },
        { status: result.status },
      );
    }

    return NextResponse.json({ meals: result.meals });
  } catch (error) {
    console.error("Errore generazione piano AI:", error);
    return NextResponse.json(
      {
        error: "ai_error",
        message:
          error instanceof Error ? error.message : "Errore durante la generazione del piano.",
      },
      { status: 502 },
    );
  }
}
