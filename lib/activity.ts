import { supabase } from "@/lib/supabase";
import { findResumableSession, getNextWorkoutDay as pickNextInSequence } from "@/lib/workout-sequence";

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

/**
 * Giorni consecutivi (fino a oggi o ieri) con almeno una sessione di
 * allenamento completata — per la card "Costanza" della dashboard.
 */
export async function getWorkoutStreak(userId: string): Promise<number> {
  const { data: sessions } = await supabase
    .from("workout_sessions")
    .select("performed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("performed_at", { ascending: false })
    .limit(120);

  if (!sessions || sessions.length === 0) return 0;

  const days = new Set(sessions.map((row) => row.performed_at.slice(0, 10)));

  const cursor = new Date();
  const todayKey = cursor.toISOString().slice(0, 10);
  if (!days.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (
    days.has(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
    )
  ) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export type TodayWorkoutExercise = {
  id: string;
  exercise_name: string;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
};

export type TodayWorkoutDay = {
  id: string;
  title: string;
  day_code: string;
  week_number: number;
  activity_type: string | null;
  duration_minutes: number | null;
  resumed: boolean;
  exercises: TodayWorkoutExercise[];
};

/**
 * Giornata di allenamento "di oggi": una sessione in corso da riprendere ha
 * la precedenza, altrimenti la prossima in sequenza (A → B → C → A…) dopo
 * l'ultima completata — stessa logica condivisa con /workouts e usata prima
 * in /calendar (vedi lib/workout-sequence.ts), qui per la card della home.
 */
export async function getTodayWorkoutDay(userId: string): Promise<TodayWorkoutDay | null> {
  const { data: mesocycle } = await supabase
    .from("mesocycles")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!mesocycle) return null;

  const { data: weeks } = await supabase
    .from("mesocycle_weeks")
    .select(
      "id,week_number,mesocycle_days(id,day_code,title,activity_type,sort_order,duration_minutes,exercise_prescriptions(id,exercise_name,sets,reps_min,reps_max,sort_order))",
    )
    .eq("mesocycle_id", mesocycle.id)
    .order("week_number", { ascending: true });

  if (!weeks) return null;

  type Row = {
    id: string;
    day_code: string;
    title: string;
    activity_type: string | null;
    sort_order: number;
    week_number: number;
    duration_minutes: number | null;
    exercise_prescriptions: TodayWorkoutExercise[];
  };

  const flattened: Row[] = [];
  for (const week of weeks as unknown as {
    week_number: number;
    mesocycle_days: Omit<Row, "week_number">[];
  }[]) {
    for (const day of week.mesocycle_days ?? []) {
      flattened.push({ ...day, week_number: week.week_number });
    }
  }

  if (flattened.length === 0) return null;

  const dayIds = flattened.map((row) => row.id);

  const { data: sessions } = await supabase
    .from("workout_sessions")
    .select("id,mesocycle_day_id,performed_at,status,started_at,created_at")
    .eq("user_id", userId)
    .in("mesocycle_day_id", dayIds)
    .order("performed_at", { ascending: false });

  const sessionRows = sessions ?? [];
  const resumable = findResumableSession(sessionRows);
  const picked = resumable
    ? flattened.find((day) => day.id === resumable.mesocycle_day_id)
    : pickNextInSequence(flattened, sessionRows);

  if (!picked) return null;

  return {
    id: picked.id,
    title: picked.title,
    day_code: picked.day_code,
    week_number: picked.week_number,
    activity_type: picked.activity_type,
    duration_minutes: picked.duration_minutes,
    resumed: Boolean(resumable),
    exercises: [...(picked.exercise_prescriptions ?? [])].sort(
      (a, b) => (a as unknown as { sort_order: number }).sort_order - (b as unknown as { sort_order: number }).sort_order,
    ),
  };
}
