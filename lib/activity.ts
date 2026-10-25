import { supabase } from "@/lib/supabase";

export type Intensity = "low" | "moderate" | "high";

/**
 * Valori MET (Metabolic Equivalent of Task) indicativi per tipo di attività e
 * intensità. Stima approssimativa, non clinica: serve a collegare il carico
 * di allenamento pianificato (palestra, nuoto, corsa...) al fabbisogno
 * calorico, non a sostituire un cardiofrequenzimetro.
 */
const MET_TABLE: Record<string, Record<Intensity, number>> = {
  gym: { low: 3.5, moderate: 5, high: 6 },
  cardio: { low: 5, moderate: 7, high: 9 },
  swimming: { low: 6, moderate: 8, high: 10 },
  running: { low: 7, moderate: 9.5, high: 12 },
  cycling: { low: 5, moderate: 7.5, high: 10 },
  other: { low: 4, moderate: 5.5, high: 7 },
  rest: { low: 0, moderate: 0, high: 0 },
};

export function estimateSessionCalories(
  activityType: string,
  durationMinutes: number | null | undefined,
  intensity: string | null | undefined,
  weightKg: number,
): number | null {
  if (!durationMinutes || durationMinutes <= 0 || !weightKg) return null;

  const met = MET_TABLE[activityType] ?? MET_TABLE.other;
  const level: Intensity =
    intensity === "low" || intensity === "high" ? intensity : "moderate";

  if (met[level] <= 0) return 0;

  return Math.round(met[level] * weightKg * (durationMinutes / 60));
}

/**
 * Somma le calorie stimate dei giorni di allenamento pianificati nella prima
 * settimana del mesociclo attivo, come stima di una settimana "tipo", e
 * ritorna la media giornaliera da aggiungere al fabbisogno calorico.
 */
export async function getExtraDailyTrainingCalories(userId: string): Promise<number> {
  const { data: mesocycle } = await supabase
    .from("mesocycles")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!mesocycle) return 0;

  const { data: week } = await supabase
    .from("mesocycle_weeks")
    .select("id")
    .eq("mesocycle_id", mesocycle.id)
    .order("week_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!week) return 0;

  const { data: days } = await supabase
    .from("mesocycle_days")
    .select("estimated_calories")
    .eq("week_id", week.id);

  const weeklyTotal = (days ?? []).reduce(
    (sum, day) => sum + (day.estimated_calories ?? 0),
    0,
  );

  return Math.round(weeklyTotal / 7);
}
