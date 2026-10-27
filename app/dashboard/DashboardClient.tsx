"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  calculateMacroTargets,
  SLOT_LABEL,
  SLOT_ORDER,
  toSlot,
  type NutritionProfile,
  type Slot,
} from "@/lib/nutrition";
import {
  getExtraDailyTrainingCalories,
  getTodayWorkoutDay,
  getWorkoutStreak,
  type TodayWorkoutDay,
} from "@/lib/activity";
import {
  ArrowRightIcon,
  CheckIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FireIcon,
  DropletIcon,
  FootstepsIcon,
  GridIcon,
  MinusIcon,
  PlusIcon,
  UserIcon,
  UtensilsIcon,
} from "@/components/icons";
import "./dashboard.css";

const WEEKDAY_SHORT = ["L", "M", "M", "G", "V", "S", "D"];
const MEAL_EMOJI: Record<Slot, string> = {
  breakfast: "🥣",
  lunch: "🍚",
  snack: "🍎",
  dinner: "🍽️",
  other: "🍴",
};
const SPORT_SHORTCUTS = [
  { emoji: "🏋️", label: "Palestra" },
  { emoji: "🏃", label: "Corsa" },
  { emoji: "🏊", label: "Nuoto" },
  { emoji: "🚴", label: "Bici" },
];
const MEALS_PAGE_SIZE = 3;

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateKey(key: string): Date {
  return new Date(`${key.slice(0, 10)}T12:00:00`);
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("it-IT", options).format(date);
}

function greetingFor(hour: number): string {
  if (hour < 6) return "Ancora sveglio";
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

function formatExerciseDetail(sets: number | null, repsMin: number | null, repsMax: number | null): string {
  const reps = repsMin && repsMax && repsMin !== repsMax ? `${repsMin}-${repsMax}` : repsMin ?? repsMax;
  if (!sets && !reps) return "";
  if (!reps) return `${sets} serie`;
  return `${sets ?? "?"} serie × ${reps} ripetizioni`;
}

type FoodEntryRow = {
  id: string;
  eaten_at: string;
  meal_type: string;
  calories: number | null;
};

type SessionRow = {
  id: string;
  performed_at: string;
  status: string;
  title: string;
  actual_duration_minutes: number | null;
  actual_distance_km: number | null;
  actual_calories: number | null;
};

type StepRow = { date: string; steps: number };
type WaterRow = { date: string; glasses: number };

type MealSlotSummary = { slot: Slot; calories: number; count: number };

const secondaryItems = [
  {
    title: "Progressi",
    description: "Consulta peso e misurazioni corporee.",
    path: "/progress",
    icon: ChartIcon,
  },
  {
    title: "Piano di allenamento",
    description: "Gestisci mesocicli, settimane e giornate.",
    path: "/plan",
    icon: GridIcon,
  },
  {
    title: "Piani alimentari",
    description: "Crea, genera e modifica i tuoi piani settimanali.",
    path: "/nutrition/plan",
    icon: UtensilsIcon,
  },
  {
    title: "Profilo personale",
    description: "Aggiorna i tuoi dati e le preferenze.",
    path: "/profile",
    icon: UserIcon,
  },
];

export default function DashboardClient({ initialDate }: { initialDate?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [firstName, setFirstName] = useState("");

  const [selectedDate, setSelectedDateState] = useState<Date | null>(null);
  const [macroTargets, setMacroTargets] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);

  const [foodEntries, setFoodEntries] = useState<FoodEntryRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [stepsByDate, setStepsByDate] = useState<Record<string, number>>({});
  const [waterByDate, setWaterByDate] = useState<Record<string, number>>({});
  const [savingWater, setSavingWater] = useState(false);

  const [stepsEditing, setStepsEditing] = useState(false);
  const [stepDraft, setStepDraft] = useState("");
  const [savingSteps, setSavingSteps] = useState(false);

  const [streak, setStreak] = useState(0);
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkoutDay | null>(null);
  const [mealsVisible, setMealsVisible] = useState(MEALS_PAGE_SIZE);

  /* ---------- Sessione + data iniziale ---------- */

  useEffect(() => {
    setSelectedDateState(initialDate ? parseDateKey(initialDate) : new Date());
  }, [initialDate]);

  useEffect(() => {
    let active = true;

    async function init() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
        router.replace("/");
        return;
      }

      const uid = data.session.user.id;
      setUserId(uid);

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("full_name,birth_date,sex,height_cm,current_weight_kg,goal,activity_level")
        .eq("id", uid)
        .maybeSingle();

      if (!active) return;

      if (profileRow) {
        setFirstName((profileRow.full_name ?? "").split(" ")[0] || "");
        const extraCalories = await getExtraDailyTrainingCalories(uid);
        if (active) setMacroTargets(calculateMacroTargets(profileRow as NutritionProfile, extraCalories));
      }

      const [streakDays, workoutDay] = await Promise.all([
        getWorkoutStreak(uid),
        getTodayWorkoutDay(uid),
      ]);

      if (active) {
        setStreak(streakDays);
        setTodayWorkout(workoutDay);
        setLoading(false);
      }
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) router.replace("/");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  /* ---------- Date derivate ---------- */

  const todayKey = localDateKey(new Date());
  const selectedKey = selectedDate ? localDateKey(selectedDate) : "";
  const weekStart = useMemo(() => (selectedDate ? startOfWeek(selectedDate) : null), [selectedDate]);
  const weekDates = useMemo(
    () => (weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : []),
    [weekStart],
  );
  const weekStartKey = weekDates[0] ? localDateKey(weekDates[0]) : "";
  const weekEndKey = weekDates[6] ? localDateKey(weekDates[6]) : "";

  function setSelectedDate(date: Date) {
    setSelectedDateState(date);
    setMealsVisible(MEALS_PAGE_SIZE);
  }

  /* ---------- Dati della settimana visibile (alimentazione, passi, acqua, sessioni) ---------- */

  useEffect(() => {
    if (!userId || !weekStartKey || !weekEndKey) return;
    let cancelled = false;

    void (async () => {
      const [entriesRes, stepsRes, waterRes, sessionsRes] = await Promise.all([
        supabase
          .from("food_entries")
          .select("id,eaten_at,meal_type,calories")
          .eq("user_id", userId)
          .gte("eaten_at", weekStartKey)
          .lte("eaten_at", weekEndKey),
        supabase
          .from("step_counts")
          .select("date,steps")
          .eq("user_id", userId)
          .gte("date", weekStartKey)
          .lte("date", weekEndKey),
        supabase
          .from("water_logs")
          .select("date,glasses")
          .eq("user_id", userId)
          .gte("date", weekStartKey)
          .lte("date", weekEndKey),
        supabase
          .from("workout_sessions")
          .select("id,performed_at,status,title,actual_duration_minutes,actual_distance_km,actual_calories")
          .eq("user_id", userId)
          .gte("performed_at", weekStartKey)
          .lte("performed_at", weekEndKey),
      ]);

      if (cancelled) return;

      setFoodEntries((entriesRes.data ?? []) as FoodEntryRow[]);

      const steps: Record<string, number> = {};
      for (const row of (stepsRes.data ?? []) as StepRow[]) steps[row.date] = row.steps;
      setStepsByDate(steps);

      const water: Record<string, number> = {};
      for (const row of (waterRes.data ?? []) as WaterRow[]) water[row.date] = row.glasses;
      setWaterByDate(water);

      setSessions((sessionsRes.data ?? []) as SessionRow[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, weekStartKey, weekEndKey]);

  useEffect(() => {
    setStepDraft(stepsByDate[selectedKey] != null ? String(stepsByDate[selectedKey]) : "");
    setStepsEditing(false);
  }, [selectedKey, stepsByDate]);

  /* ---------- Dati derivati per la data selezionata ---------- */

  const selectedEntries = useMemo(
    () => foodEntries.filter((entry) => entry.eaten_at.slice(0, 10) === selectedKey),
    [foodEntries, selectedKey],
  );

  const consumedKcal = selectedEntries.reduce((sum, row) => sum + (row.calories ?? 0), 0);

  const mealSummaries = useMemo<MealSlotSummary[]>(() => {
    const bySlot = new Map<Slot, MealSlotSummary>();
    for (const entry of selectedEntries) {
      const slot = toSlot(entry.meal_type);
      const existing = bySlot.get(slot) ?? { slot, calories: 0, count: 0 };
      existing.calories += entry.calories ?? 0;
      existing.count += 1;
      bySlot.set(slot, existing);
    }
    return SLOT_ORDER.filter((slot) => bySlot.has(slot)).map((slot) => bySlot.get(slot) as MealSlotSummary);
  }, [selectedEntries]);

  const selectedSteps = stepsByDate[selectedKey] ?? null;
  const selectedGlasses = waterByDate[selectedKey] ?? 0;

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const session of sessions) {
      const key = session.performed_at.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), session]);
    }
    return map;
  }, [sessions]);

  const mealDatesInWeek = useMemo(() => {
    const set = new Set<string>();
    foodEntries.forEach((entry) => set.add(entry.eaten_at.slice(0, 10)));
    return set;
  }, [foodEntries]);

  const selectedActivity = (sessionsByDate.get(selectedKey) ?? []).find(
    (session) => session.actual_calories != null || session.actual_duration_minutes != null,
  );

  /* ---------- Azioni ---------- */

  async function adjustGlasses(delta: 1 | -1) {
    if (!userId || !selectedKey || savingWater) return;
    const next = Math.max(0, Math.min(12, selectedGlasses + delta));
    if (next === selectedGlasses) return;
    setWaterByDate((current) => ({ ...current, [selectedKey]: next }));
    setSavingWater(true);
    try {
      await supabase
        .from("water_logs")
        .upsert({ user_id: userId, date: selectedKey, glasses: next }, { onConflict: "user_id,date" });
    } finally {
      setSavingWater(false);
    }
  }

  async function saveSteps() {
    if (!userId || !selectedKey) return;
    const steps = Number(stepDraft);
    if (stepDraft.trim() === "" || !Number.isFinite(steps) || steps < 0) return;

    setSavingSteps(true);
    try {
      await supabase.from("step_counts").upsert(
        { user_id: userId, date: selectedKey, steps: Math.round(steps), source: "manual", updated_at: new Date().toISOString() },
        { onConflict: "user_id,date" },
      );
      setStepsByDate((current) => ({ ...current, [selectedKey]: Math.round(steps) }));
      setStepsEditing(false);
    } finally {
      setSavingSteps(false);
    }
  }

  function openSection(path: string) {
    router.push(path);
  }

  const previousWeek = () => selectedDate && setSelectedDate(addDays(selectedDate, -7));
  const nextWeek = () => selectedDate && setSelectedDate(addDays(selectedDate, 7));
  const goToToday = () => setSelectedDate(new Date());

  if (loading || !selectedDate) {
    return (
      <AppShell>
        <div className="home-loading">Caricamento AllenAI...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="home-page">
        <section className="home-greeting">
          <div>
            <p className="home-eyebrow">{greetingFor(new Date().getHours())}</p>
            <h1>Ciao{firstName ? `, ${firstName}` : ""}</h1>
          </div>
        </section>

        <section className="home-week-panel" aria-label="Settimana">
          <div className="home-week-toolbar">
            <button type="button" className="home-icon-button" onClick={previousWeek} aria-label="Settimana precedente">
              <ChevronLeftIcon size={17} />
            </button>

            <div className="home-day-strip">
              {weekDates.map((date) => {
                const key = localDateKey(date);
                const daySessions = sessionsByDate.get(key) ?? [];
                const done = daySessions.some((s) => s.status === "completed");
                const inProgress = daySessions.some((s) => s.status === "in_progress");
                const hasMeals = mealDatesInWeek.has(key);
                const active = key === selectedKey;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={`home-day${active ? " home-day--active" : ""}`}
                    aria-pressed={active}
                  >
                    <span>{WEEKDAY_SHORT[date.getDay() === 0 ? 6 : date.getDay() - 1]}</span>
                    <strong>{date.getDate()}</strong>
                    <span className="home-day__dots" aria-hidden="true">
                      {done && <i className="home-dot home-dot--done" />}
                      {inProgress && <i className="home-dot home-dot--progress" />}
                      {hasMeals && <i className="home-dot home-dot--meal" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <button type="button" className="home-icon-button" onClick={nextWeek} aria-label="Settimana successiva">
              <ChevronRightIcon size={17} />
            </button>
          </div>

          {selectedKey !== todayKey && (
            <button type="button" className="home-today-button" onClick={goToToday}>
              Vai a oggi
            </button>
          )}
        </section>

        <div className="home-stat-grid">
          <article className="home-stat-card home-stat-card--dark">
            <div className="home-stat-card__top">
              <span className="home-stat-card__icon home-stat-card__icon--lime">
                <FireIcon size={18} />
              </span>
            </div>
            <p className="home-stat-card__label">Calorie</p>
            <p className="home-stat-card__value">
              {Math.round(consumedKcal).toLocaleString("it-IT")}{" "}
              <span>/ {macroTargets ? Math.round(macroTargets.calories).toLocaleString("it-IT") : "—"} kcal</span>
            </p>
            <div className="home-stat-card__bar">
              <div
                style={{
                  width: `${macroTargets?.calories ? Math.min(100, (consumedKcal / macroTargets.calories) * 100) : 0}%`,
                }}
              />
            </div>
          </article>

          <article className="home-stat-card home-stat-card--lime">
            <div className="home-stat-card__top">
              <span className="home-stat-card__icon home-stat-card__icon--dark">
                <DropletIcon size={18} />
              </span>
              <div className="home-stat-card__add-group">
                <button
                  type="button"
                  className="home-stat-card__add"
                  aria-label="Togli un bicchiere d'acqua"
                  disabled={selectedGlasses <= 0}
                  onClick={() => void adjustGlasses(-1)}
                >
                  <MinusIcon size={15} />
                </button>
                <button
                  type="button"
                  className="home-stat-card__add"
                  aria-label="Aggiungi un bicchiere d'acqua"
                  onClick={() => void adjustGlasses(1)}
                >
                  <PlusIcon size={15} />
                </button>
              </div>
            </div>
            <p className="home-stat-card__label">Acqua</p>
            <p className="home-stat-card__value">
              {(selectedGlasses * 0.25).toFixed(2).replace(/0$/, "").replace(/\.$/, "")} L <span>/ 2 L</span>
            </p>
            <div className="home-stat-card__bar">
              <div style={{ width: `${Math.min(100, selectedGlasses * 12.5)}%` }} />
            </div>
          </article>

          <article className="home-stat-card home-stat-card--dark">
            <div className="home-stat-card__top">
              <span className="home-stat-card__icon home-stat-card__icon--lime">
                <FootstepsIcon size={18} />
              </span>
            </div>
            <p className="home-stat-card__label">Passi</p>
            {stepsEditing ? (
              <div className="home-stat-card__edit">
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  autoFocus
                  value={stepDraft}
                  onChange={(event) => setStepDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveSteps();
                    if (event.key === "Escape") setStepsEditing(false);
                  }}
                />
                <button type="button" disabled={savingSteps} onClick={() => void saveSteps()}>
                  {savingSteps ? "..." : "OK"}
                </button>
              </div>
            ) : (
              <button type="button" className="home-stat-card__value home-stat-card__value--button" onClick={() => setStepsEditing(true)}>
                {selectedSteps !== null ? selectedSteps.toLocaleString("it-IT") : "—"} <span>/ 10.000</span>
              </button>
            )}
            <div className="home-stat-card__bar">
              <div style={{ width: `${selectedSteps !== null ? Math.min(100, (selectedSteps / 10000) * 100) : 0}%` }} />
            </div>
          </article>

          <article className="home-stat-card home-stat-card--lime">
            <div className="home-stat-card__top">
              <span className="home-stat-card__icon home-stat-card__icon--dark">
                <CheckIcon size={18} />
              </span>
            </div>
            <p className="home-stat-card__label">Costanza</p>
            <p className="home-stat-card__value">
              {streak} <span>{streak === 1 ? "giorno di fila" : "giorni di fila"}</span>
            </p>
            <div className="home-stat-card__bar">
              <div style={{ width: `${Math.min(100, (streak / 7) * 100)}%` }} />
            </div>
          </article>
        </div>

        <div className="home-row">
          <article className="home-ai-card" onClick={() => openSection("/generate")} role="link" tabIndex={0}>
            <span className="home-ai-card__badge">FORMA AI</span>
            <p className="home-ai-card__title">Il tuo piano, creato intorno a te.</p>
            <p className="home-ai-card__text">
              Genera un piano alimentare o una scheda di allenamento in base ai tuoi obiettivi, preferenze e tempo
              disponibile.
            </p>
            <span className="home-ai-card__cta">
              Genera con AI <ArrowRightIcon size={16} />
            </span>
          </article>

          <article className="home-card-plain">
            <div className="home-card-plain__head">
              <div>
                <p className="home-card-plain__title">Attività</p>
                <p className="home-card-plain__subtitle">Registra il movimento</p>
              </div>
              <button
                type="button"
                className="home-card-plain__action"
                aria-label="Registra attività"
                onClick={() => openSection("/workouts")}
              >
                <PlusIcon size={16} />
              </button>
            </div>

            <div className="home-sport-grid">
              {SPORT_SHORTCUTS.map((sport) => (
                <button
                  key={sport.label}
                  type="button"
                  className="home-sport-button"
                  onClick={() => openSection("/workouts")}
                  aria-label={sport.label}
                >
                  {sport.emoji}
                </button>
              ))}
            </div>

            {selectedActivity ? (
              <div className="home-activity-row">
                <div>
                  <p>{selectedActivity.title}</p>
                  <span>
                    {[
                      selectedActivity.actual_distance_km ? `${selectedActivity.actual_distance_km} km` : null,
                      selectedActivity.actual_duration_minutes ? `${selectedActivity.actual_duration_minutes} min` : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </span>
                </div>
                {selectedActivity.actual_calories ? <strong>+{selectedActivity.actual_calories} kcal</strong> : null}
              </div>
            ) : (
              <div className="home-activity-row home-activity-row--empty">
                <span>Nessuna attività registrata {selectedKey === todayKey ? "oggi" : "in questo giorno"}</span>
              </div>
            )}
          </article>
        </div>

        <div className="home-row home-row--wide">
          <article className="home-card-plain">
            <div className="home-card-plain__head">
              <div>
                <p className="home-card-plain__title">Piano alimentare</p>
                <p className="home-card-plain__subtitle">
                  {formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
              <button type="button" className="home-card-plain__link" onClick={() => openSection("/nutrition/plan")}>
                Vedi piano <ArrowRightIcon size={14} />
              </button>
            </div>

            <div className="home-meal-list">
              {mealSummaries.length === 0 && <p className="home-empty-text">Nessun pasto registrato in questo giorno.</p>}
              {mealSummaries.slice(0, mealsVisible).map((meal) => (
                <div key={meal.slot} className="home-meal-row">
                  <span className="home-meal-row__emoji">{MEAL_EMOJI[meal.slot]}</span>
                  <div className="home-meal-row__content">
                    <div>
                      <strong>{SLOT_LABEL[meal.slot]}</strong>
                      <span>{meal.count} {meal.count === 1 ? "alimento" : "alimenti"}</span>
                    </div>
                  </div>
                  <p className="home-meal-row__kcal">
                    {Math.round(meal.calories)} <span>kcal</span>
                  </p>
                </div>
              ))}
            </div>

            {mealSummaries.length > mealsVisible && (
              <button
                type="button"
                className="home-dashed-button"
                onClick={() => setMealsVisible((current) => current + MEALS_PAGE_SIZE)}
              >
                Mostra altri ({mealSummaries.length - mealsVisible})
              </button>
            )}

            <button type="button" className="home-dashed-button" onClick={() => openSection("/nutrition")}>
              <PlusIcon size={16} /> Aggiungi pasto
            </button>
          </article>

          <article className="home-workout-card">
            <div className="home-workout-card__header">
              <span className="home-workout-card__badge">{todayWorkout?.resumed ? "DA RIPRENDERE" : "OGGI"}</span>
              {todayWorkout?.duration_minutes && (
                <span className="home-workout-card__duration">
                  <ClockIcon size={14} />
                  {todayWorkout.duration_minutes} min
                </span>
              )}
            </div>

            {todayWorkout ? (
              <>
                <p className="home-workout-card__title">{todayWorkout.title}</p>
                <p className="home-workout-card__subtitle">
                  Settimana {todayWorkout.week_number} • Giornata {todayWorkout.day_code}
                </p>

                {todayWorkout.activity_type === "rest" ? (
                  <p className="home-empty-text home-empty-text--dark">
                    Giorno di riposo programmato. Recupero prima del prossimo allenamento.
                  </p>
                ) : (
                  <div className="home-workout-card__exercises">
                    {todayWorkout.exercises.length === 0 && (
                      <p className="home-empty-text home-empty-text--dark">Nessun esercizio pianificato.</p>
                    )}
                    {todayWorkout.exercises.slice(0, 4).map((exercise) => (
                      <div key={exercise.id} className="home-workout-exercise">
                        <span className="home-workout-exercise__dot" />
                        <span className="home-workout-exercise__text">
                          <strong>{exercise.exercise_name}</strong>
                          <small>{formatExerciseDetail(exercise.sets, exercise.reps_min, exercise.reps_max)}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button type="button" className="home-workout-card__cta" onClick={() => openSection("/workouts")}>
                  Vai all&apos;allenamento <ArrowRightIcon size={16} />
                </button>
              </>
            ) : (
              <>
                <p className="home-workout-card__title">Nessun piano attivo</p>
                <p className="home-workout-card__subtitle">Genera una scheda per iniziare ad allenarti.</p>
                <button type="button" className="home-workout-card__cta" onClick={() => openSection("/generate")}>
                  Genera con AI <ArrowRightIcon size={16} />
                </button>
              </>
            )}
          </article>
        </div>

        <section className="home-section">
          <div className="home-section-heading">
            <p className="home-eyebrow">STRUMENTI PERSONALI</p>
            <h2>Altre sezioni</h2>
          </div>

          <div className="home-secondary-grid">
            {secondaryItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  type="button"
                  className="home-secondary-card"
                  onClick={() => openSection(item.path)}
                >
                  <span className="home-secondary-icon">
                    <Icon size={19} />
                  </span>
                  <span className="home-secondary-content">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
