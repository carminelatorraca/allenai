import { NextRequest, NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";

type GeneratePlanRequest = {
  heightCm?: number | null;
  weightKg?: number | null;
  sex?: string | null;
  age?: number | null;
  goal?: string | null;
  activityLevel?: string | null;
  experience?: string;
  daysPerWeek?: number;
  equipment?: string;
  notes?: string;
};

const GOAL_LABEL: Record<string, string> = {
  lose_fat: "perdere grasso",
  build_muscle: "aumentare la massa muscolare",
  recomposition: "ricomposizione corporea",
  maintain: "mantenere il livello attuale",
  improve_fitness: "migliorare la forma fisica generale",
};

const ACTIVITY_LABEL: Record<string, string> = {
  sedentary: "sedentario",
  light: "leggermente attivo",
  moderate: "moderatamente attivo",
  high: "molto attivo",
  very_high: "estremamente attivo",
};

const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: "principiante (meno di 1 anno di allenamento strutturato)",
  intermediate: "intermedio (1-3 anni di allenamento strutturato)",
  advanced: "avanzato (oltre 3 anni di allenamento strutturato)",
};

const EQUIPMENT_LABEL: Record<string, string> = {
  full_gym: "palestra completamente attrezzata (bilancieri, macchine, cavi)",
  home_basic: "casa con attrezzatura essenziale (manubri, panca, elastici)",
  bodyweight: "solo corpo libero, nessun attrezzo",
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
        message: "Altezza e peso sono necessari per generare una scheda personalizzata.",
      },
      { status: 400 },
    );
  }

  const daysPerWeek =
    body.daysPerWeek && body.daysPerWeek >= 1 && body.daysPerWeek <= 6 ? body.daysPerWeek : 3;

  const profileLines = [
    `Altezza: ${body.heightCm} cm`,
    `Peso: ${body.weightKg} kg`,
    body.sex ? `Sesso: ${body.sex === "male" ? "uomo" : "donna"}` : null,
    body.age ? `Età: ${body.age} anni` : null,
    body.goal ? `Obiettivo: ${GOAL_LABEL[body.goal] ?? body.goal}` : null,
    body.activityLevel
      ? `Livello di attività quotidiana: ${ACTIVITY_LABEL[body.activityLevel] ?? body.activityLevel}`
      : null,
    body.experience
      ? `Esperienza in allenamento con i pesi: ${EXPERIENCE_LABEL[body.experience] ?? body.experience}`
      : null,
    body.equipment
      ? `Attrezzatura disponibile: ${EQUIPMENT_LABEL[body.equipment] ?? body.equipment}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Genera una scheda di allenamento settimanale con i pesi per un utente con queste caratteristiche. Rispondi in italiano.

${profileLines}
Giorni di allenamento a settimana: ${daysPerWeek}
${body.notes ? `Note/preferenze dell'utente: ${body.notes}` : ""}

Regole:
- Genera esattamente ${daysPerWeek} giorni (day_code: A, B, C, ... in ordine), con una suddivisione muscolare sensata per quel numero di giorni (es. 3 giorni: full body o push/pull/legs; 4 giorni: upper/lower; 5-6 giorni: split per gruppo muscolare).
- Ogni giorno deve avere un title breve che descrive la suddivisione (es. "Spinta", "Gambe", "Full body").
- Scegli esercizi coerenti con l'attrezzatura disponibile indicata.
- Per ogni esercizio indica sets (numero di serie), reps_min e reps_max (range di ripetizioni), rest_seconds (recupero in secondi, 60-180 a seconda dell'esercizio), tut (tempo sotto tensione indicativo, es. "2-0-2"), e notes (indicazione tecnica breve, o stringa vuota se non necessaria).
- Il numero di esercizi per giorno deve essere ragionevole per il livello di esperienza indicato (principiante: 4-6 esercizi; intermedio: 5-7; avanzato: 6-9).
- Adatta il volume e l'intensità all'obiettivo e al livello di esperienza indicati.
- Non includere riscaldamento o stretching come esercizi: solo lavoro di forza/ipertrofia.`;

  try {
    const result = await getAiProvider().generateWorkoutPlan(prompt);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.code, message: result.message },
        { status: result.status },
      );
    }

    return NextResponse.json({ days: result.days });
  } catch (error) {
    console.error("Errore generazione scheda AI:", error);
    return NextResponse.json(
      {
        error: "ai_error",
        message:
          error instanceof Error ? error.message : "Errore durante la generazione della scheda.",
      },
      { status: 502 },
    );
  }
}
