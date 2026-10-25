export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

export type Slot = "breakfast" | "lunch" | "snack" | "dinner" | "other";

export const SLOT_ORDER: Slot[] = ["breakfast", "lunch", "snack", "dinner", "other"];

export const SLOT_LABEL: Record<Slot, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  snack: "Spuntino",
  dinner: "Cena",
  other: "Altro",
};

export const MEAL_STATUS_LABEL: Record<string, string> = {
  planned: "Da mangiare",
  eaten: "Mangiato",
  skipped: "Saltato",
};

export function toSlot(value: string): Slot {
  const v = value.trim().toLowerCase();
  if (v === "breakfast" || v === "colazione") return "breakfast";
  if (v === "lunch" || v === "pranzo") return "lunch";
  if (v === "snack" || v === "spuntino" || v === "merenda") return "snack";
  if (v === "dinner" || v === "cena") return "dinner";
  return "other";
}

export function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function round(value: number): string {
  return String(Math.round(value));
}

export type MacroTargets = { calories: number; protein: number; carbs: number; fat: number };

export type NutritionProfile = {
  birth_date: string | null;
  sex: string | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  goal: string | null;
  activity_level: string | null;
};

const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
};

export function calculateAge(birthDate: string): number {
  const birth = new Date(`${birthDate}T00:00:00`);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();

  const birthdayNotReached =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());

  if (birthdayNotReached) age--;

  return age;
}

/**
 * Stima calorie e macronutrienti target in base al profilo (formula Mifflin-St Jeor).
 * Ritorna null se il profilo non ha dati sufficienti/validi per una stima.
 *
 * `extraDailyCalories` è una media giornaliera di calorie bruciate dagli
 * allenamenti pianificati (es. giorni di nuoto/cardio nel mesociclo attivo),
 * da sommare al fabbisogno oltre al generico "livello di attività" del profilo.
 */
export function calculateMacroTargets(
  profile: NutritionProfile,
  extraDailyCalories = 0,
): MacroTargets | null {
  const age = profile.birth_date ? calculateAge(profile.birth_date) : 0;

  const valid =
    Boolean(profile.birth_date) &&
    Boolean(profile.height_cm) &&
    Boolean(profile.current_weight_kg) &&
    Boolean(profile.activity_level) &&
    age >= 18 &&
    age <= 100 &&
    Number(profile.height_cm) > 0 &&
    Number(profile.current_weight_kg) > 0 &&
    ["male", "female"].includes(profile.sex ?? "") &&
    ACTIVITY_FACTORS[profile.activity_level ?? ""] !== undefined;

  if (!valid) return null;

  const weight = Number(profile.current_weight_kg);
  const height = Number(profile.height_cm);

  const bmr = 10 * weight + 6.25 * height - 5 * age + (profile.sex === "male" ? 5 : -161);
  const maintenance = bmr * ACTIVITY_FACTORS[profile.activity_level ?? ""] + extraDailyCalories;

  const adjustment =
    profile.goal === "lose_fat" ? -300 : profile.goal === "build_muscle" ? 200 : 0;

  const calories = maintenance + adjustment;
  const protein = weight * 1.6;
  const fat = (calories * 0.28) / 9;
  const carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);

  return { calories, protein, carbs, fat };
}

export function sumMacros(
  rows: { calories: number; protein_g: number; carbs_g: number; fat_g: number }[],
): Macros {
  return rows.reduce<Macros>(
    (acc, row) => ({
      kcal: acc.kcal + row.calories,
      protein: acc.protein + row.protein_g,
      carbs: acc.carbs + row.carbs_g,
      fat: acc.fat + row.fat_g,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
