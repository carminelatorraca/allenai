"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DumbbellIcon,
  FootstepsIcon,
  PlayIcon,
  RefreshIcon,
  SwapIcon,
  TargetIcon,
  UtensilsIcon,
} from "@/components/icons";
import {
  findResumableSession,
  getNextWorkoutDay,
} from "./workout-sequence";
import {
  SLOT_LABEL,
  SLOT_ORDER,
  num,
  round,
  sumMacros,
  toSlot,
} from "@/lib/nutrition";
import "./calendar.css";

/* ------------------------------------------------------------------ */
/* Tipi                                                                */
/* ------------------------------------------------------------------ */

type Mesocycle = {
  id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  duration_weeks: number;
  status: string;
};

type WorkoutSession = {
  id: string;
  mesocycle_day_id: string | null;
  performed_at: string;
  status: string;
  title: string;
  started_at: string | null;
  created_at: string | null;
};

type Prescription = {
  id: string;
  mesocycle_day_id: string;
  exercise_name: string;
  sets: number;
  reps_min: number | null;
  reps_max: number | null;
  target_weight_kg: number | null;
  rest_seconds: number | null;
  notes: string | null;
  sort_order: number;
};

type PlanDay = {
  id: string;
  week_id: string;
  day_code: string;
  title: string;
  activity_type: string | null;
  notes: string | null;
  sort_order: number;
  week_number: number;
  exercises: Prescription[];
};

type RawWeek = {
  id: string;
  week_number: number;
  mesocycle_days: (Omit<PlanDay, "week_number" | "exercises"> & {
    exercise_prescriptions: Prescription[] | null;
  })[] | null;
};

type PlannedItem = {
  id: string;
  meal_id: string;
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sort_order: number;
};

type PlannedMeal = {
  id: string;
  plan_date: string;
  meal_type: string;
  title: string;
  instructions: string | null;
  status: string;
  items: PlannedItem[];
};

type FoodEntry = {
  id: string;
  eaten_at: string;
  meal_type: string;
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type StepCount = {
  date: string;
  steps: number;
  source: string;
};

/* ------------------------------------------------------------------ */
/* Costanti e helper                                                   */
/* ------------------------------------------------------------------ */

const PLAN_SELECT =
  "id,week_number,mesocycle_days(id,week_id,day_code,title,activity_type,notes,sort_order,exercise_prescriptions(id,mesocycle_day_id,exercise_name,sets,reps_min,reps_max,target_weight_kg,rest_seconds,notes,sort_order))";

const SESSION_STATUS_LABEL: Record<string, string> = {
  completed: "Completato",
  in_progress: "In corso",
  skipped: "Saltato",
};

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

function formatTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(date, { hour: "2-digit", minute: "2-digit" });
}

function formatReps(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min !== max) return `${min}–${max} rip.`;
  return `${min ?? max} rip.`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return "Si è verificato un errore imprevisto.";
}

function workoutsHref(dayId: string, dateKey: string): string {
  return `/workouts?day=${encodeURIComponent(dayId)}&date=${dateKey}`;
}

function daysAgoLabel(dateKey: string | undefined, todayKey: string): string {
  if (!dateKey) return "Mai svolta";
  const diff = Math.round(
    (parseDateKey(todayKey).getTime() - parseDateKey(dateKey).getTime()) / 86400000,
  );
  if (diff <= 0) return "Svolta oggi";
  if (diff === 1) return "Ultimo allenamento completato: 1 giorno fa";
  return `Ultimo allenamento completato: ${diff} giorni fa`;
}

function estimateDuration(day: PlanDay): string {
  if (day.exercises.length === 0) return "—";
  const totalSeconds = day.exercises.reduce(
    (sum, exercise) => sum + exercise.sets * ((exercise.rest_seconds ?? 60) + 45),
    0,
  );
  const minutes = Math.round(totalSeconds / 60);
  const low = Math.max(15, Math.round((minutes - 10) / 5) * 5);
  const high = Math.round((minutes + 10) / 5) * 5;
  return `${low}–${high} minuti`;
}

async function pickMesocycle(userId: string): Promise<Mesocycle | null> {
  const columns = "id,name,goal,start_date,duration_weeks,status";

  const { data: active, error: activeError } = await supabase
    .from("mesocycles")
    .select(columns)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (activeError) throw activeError;
  if (active) return active as Mesocycle;

  const { data: latest, error: latestError } = await supabase
    .from("mesocycles")
    .select(columns)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;
  return (latest as Mesocycle | null) ?? null;
}

async function fetchPlanDays(
  userId: string,
  mesocycleId: string,
): Promise<PlanDay[]> {
  const { data, error } = await supabase
    .from("mesocycle_weeks")
    .select(PLAN_SELECT)
    .eq("user_id", userId)
    .eq("mesocycle_id", mesocycleId)
    .order("week_number", { ascending: true });

  if (error) throw error;

  const weeks = (data ?? []) as unknown as RawWeek[];

  return weeks
    .flatMap((week) =>
      (week.mesocycle_days ?? []).map((day) => {
        const { exercise_prescriptions, ...rest } = day;
        return {
          ...rest,
          week_number: week.week_number,
          exercises: [...(exercise_prescriptions ?? [])].sort(
            (a, b) => a.sort_order - b.sort_order,
          ),
        };
      }),
    )
    .sort(
      (a, b) => a.week_number - b.week_number || a.sort_order - b.sort_order,
    );
}

/* ------------------------------------------------------------------ */
/* Pagina                                                              */
/* ------------------------------------------------------------------ */

export default function CalendarPage() {
  const [selectedDate, setSelectedDateState] = useState<Date | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [mesocycle, setMesocycle] = useState<Mesocycle | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [plannedMeals, setPlannedMeals] = useState<PlannedMeal[]>([]);
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [stepCounts, setStepCounts] = useState<Record<string, StepCount>>({});
  const [stepDraft, setStepDraft] = useState("");
  const [stepsEditing, setStepsEditing] = useState(false);
  const [savingSteps, setSavingSteps] = useState(false);
  const [stepsWarning, setStepsWarning] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [planWarning, setPlanWarning] = useState("");
  const [nutritionWarning, setNutritionWarning] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");

  const [manualDayId, setManualDayId] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  /* ---------- Data odierna (calcolata solo lato client) ---------- */

  useEffect(() => {
    setSelectedDateState(new Date());
  }, []);

  /* ---------- Caricamento allenamenti ---------- */

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError("");
    setPlanWarning("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Devi effettuare l'accesso.");

      setUserId(user.id);

      const { data: sessionRows, error: sessionsError } = await supabase
        .from("workout_sessions")
        .select("id,mesocycle_day_id,performed_at,status,title,started_at,created_at")
        .eq("user_id", user.id)
        .order("performed_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (sessionsError) throw sessionsError;
      setSessions((sessionRows ?? []) as WorkoutSession[]);

      const picked = await pickMesocycle(user.id);
      setMesocycle(picked);
      setPlanDays([]);

      if (picked) {
        try {
          setPlanDays(await fetchPlanDays(user.id, picked.id));
        } catch (planError) {
          console.error("Errore caricamento programma:", planError);
          setPlanWarning(
            "Non è stato possibile caricare giornate ed esercizi del programma.",
          );
        }
      }

      setLastUpdated(
        new Intl.DateTimeFormat("it-IT", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()),
      );
    } catch (err) {
      console.error("Errore caricamento calendario:", err);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  /* ---------- Date ---------- */

  const todayKey = selectedDate ? localDateKey(new Date()) : "";
  const selectedKey = selectedDate ? localDateKey(selectedDate) : "";

  const weekStart = useMemo(
    () => (selectedDate ? startOfWeek(selectedDate) : null),
    [selectedDate],
  );
  const weekDates = useMemo(
    () => (weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : []),
    [weekStart],
  );
  const weekStartKey = weekDates[0] ? localDateKey(weekDates[0]) : "";
  const weekEndKey = weekDates[6] ? localDateKey(weekDates[6]) : "";

  function setSelectedDate(date: Date) {
    setSelectedDateState(date);
    setManualDayId(null);
    setShowSwitcher(false);
    setShowDetails(false);
  }

  /* ---------- Caricamento alimentazione (solo settimana visibile) ---------- */

  useEffect(() => {
    if (!userId || !weekStartKey || !weekEndKey) return;
    let cancelled = false;

    void (async () => {
      const [plannedRes, entriesRes] = await Promise.all([
        supabase
          .from("planned_meals")
          .select(
            "id,plan_date,meal_type,title,instructions,status,planned_meal_items(id,meal_id,food_name,quantity_g,calories,protein_g,carbs_g,fat_g,sort_order)",
          )
          .eq("user_id", userId)
          .gte("plan_date", weekStartKey)
          .lte("plan_date", weekEndKey),
        supabase
          .from("food_entries")
          .select(
            "id,eaten_at,meal_type,food_name,quantity_g,calories,protein_g,carbs_g,fat_g",
          )
          .eq("user_id", userId)
          .gte("eaten_at", weekStartKey)
          .lte("eaten_at", weekEndKey)
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;

      if (plannedRes.error || entriesRes.error) {
        console.warn(
          "Errore caricamento alimentazione:",
          plannedRes.error ?? entriesRes.error,
        );
        setNutritionWarning(
          "Alcuni dati alimentari non sono stati caricati. Riprova con “Aggiorna”.",
        );
      } else {
        setNutritionWarning("");
      }

      const rawMeals = (plannedRes.data ?? []) as unknown as (Omit<
        PlannedMeal,
        "items"
      > & { planned_meal_items: PlannedItem[] | null })[];

      setPlannedMeals(
        rawMeals.map(({ planned_meal_items, ...meal }) => ({
          ...meal,
          items: (planned_meal_items ?? [])
            .map((item) => ({
              ...item,
              quantity_g: num(item.quantity_g),
              calories: num(item.calories),
              protein_g: num(item.protein_g),
              carbs_g: num(item.carbs_g),
              fat_g: num(item.fat_g),
            }))
            .sort((a, b) => a.sort_order - b.sort_order),
        })),
      );

      setFoodEntries(
        ((entriesRes.data ?? []) as FoodEntry[]).map((entry) => ({
          ...entry,
          quantity_g: num(entry.quantity_g),
          calories: num(entry.calories),
          protein_g: num(entry.protein_g),
          carbs_g: num(entry.carbs_g),
          fat_g: num(entry.fat_g),
        })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, weekStartKey, weekEndKey, refreshKey]);

  /* ---------- Caricamento passi (solo settimana visibile) ---------- */

  useEffect(() => {
    if (!userId || !weekStartKey || !weekEndKey) return;
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from("step_counts")
        .select("date,steps,source")
        .eq("user_id", userId)
        .gte("date", weekStartKey)
        .lte("date", weekEndKey);

      if (cancelled) return;

      if (error) {
        console.warn("Errore caricamento passi:", error);
        setStepsWarning("Impossibile caricare i passi. Riprova con “Aggiorna”.");
        return;
      }

      setStepsWarning("");
      const byDate: Record<string, StepCount> = {};
      for (const row of (data ?? []) as StepCount[]) {
        byDate[row.date] = row;
      }
      setStepCounts(byDate);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, weekStartKey, weekEndKey, refreshKey]);

  /* ---------- Dati derivati: allenamento ---------- */

  const dayById = useMemo(
    () => new Map(planDays.map((day) => [day.id, day])),
    [planDays],
  );

  const resumeSession = useMemo(() => findResumableSession(sessions), [sessions]);

  const nextDay = useMemo(
    () => getNextWorkoutDay(planDays, sessions),
    [planDays, sessions],
  );

  const extraInProgress = useMemo(() => {
    const total = sessions.filter((s) => s.status === "in_progress").length;
    return Math.max(0, total - (resumeSession ? 1 : 0));
  }, [sessions, resumeSession]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WorkoutSession[]>();
    for (const session of sessions) {
      const key = session.performed_at.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), session]);
    }
    return map;
  }, [sessions]);

  const selectedSessions = sessionsByDate.get(selectedKey) ?? [];
  const selectedStepCount = stepCounts[selectedKey] ?? null;

  useEffect(() => {
    setStepDraft(selectedStepCount ? String(selectedStepCount.steps) : "");
    setStepsEditing(false);
  }, [selectedKey, selectedStepCount]);

  async function saveSteps() {
    if (!userId || !selectedKey) return;

    const steps = Number(stepDraft);

    if (stepDraft.trim() === "" || !Number.isFinite(steps) || steps < 0) {
      setStepsWarning("Inserisci un numero di passi valido.");
      return;
    }

    setSavingSteps(true);
    setStepsWarning("");

    try {
      const { error } = await supabase.from("step_counts").upsert(
        {
          user_id: userId,
          date: selectedKey,
          steps: Math.round(steps),
          source: "manual",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" },
      );

      if (error) throw error;

      setStepCounts((current) => ({
        ...current,
        [selectedKey]: { date: selectedKey, steps: Math.round(steps), source: "manual" },
      }));
      setStepsEditing(false);
    } catch (err) {
      setStepsWarning(
        err instanceof Error ? err.message : "Impossibile salvare i passi.",
      );
    } finally {
      setSavingSteps(false);
    }
  }

  const resumeDay = resumeSession?.mesocycle_day_id
    ? dayById.get(resumeSession.mesocycle_day_id) ?? null
    : null;

  const proposedDay = resumeSession ? resumeDay : nextDay;
  const displayDay = manualDayId ? dayById.get(manualDayId) ?? proposedDay : proposedDay;

  const lastCompletedByCode = useMemo(() => {
    const map = new Map<string, string>();
    sessions
      .filter((s) => s.status === "completed" && s.mesocycle_day_id)
      .forEach((s) => {
        const day = dayById.get(s.mesocycle_day_id as string);
        if (!day) return;
        const existing = map.get(day.day_code);
        if (!existing || s.performed_at > existing) {
          map.set(day.day_code, s.performed_at);
        }
      });
    return map;
  }, [sessions, dayById]);

  const candidateDays = useMemo(() => {
    if (!proposedDay) return [];
    const sameWeek = planDays
      .filter(
        (day) =>
          day.week_number === proposedDay.week_number && day.activity_type !== "rest",
      )
      .sort((a, b) => a.sort_order - b.sort_order);

    const seen = new Set<string>();
    const result: PlanDay[] = [];

    for (const day of sameWeek) {
      if (seen.has(day.day_code)) continue;
      seen.add(day.day_code);
      result.push(day);
    }

    return result;
  }, [planDays, proposedDay]);

  /* ---------- Dati derivati: alimentazione ---------- */

  const mealDates = useMemo(() => {
    const set = new Set<string>();
    plannedMeals.forEach((meal) => set.add(meal.plan_date.slice(0, 10)));
    foodEntries.forEach((entry) => set.add(entry.eaten_at.slice(0, 10)));
    return set;
  }, [plannedMeals, foodEntries]);

  const dayPlanned = useMemo(
    () => plannedMeals.filter((m) => m.plan_date.slice(0, 10) === selectedKey),
    [plannedMeals, selectedKey],
  );

  const dayLogged = useMemo(
    () => foodEntries.filter((e) => e.eaten_at.slice(0, 10) === selectedKey),
    [foodEntries, selectedKey],
  );

  const loggedTotals = useMemo(() => sumMacros(dayLogged), [dayLogged]);

  const plannedTotals = useMemo(
    () =>
      sumMacros(
        dayPlanned
          .filter((meal) => meal.status !== "skipped")
          .flatMap((meal) => meal.items),
      ),
    [dayPlanned],
  );

  const mealSlots = useMemo(() => {
    return SLOT_ORDER.map((slot) => {
      const planned = dayPlanned.filter((meal) => toSlot(meal.meal_type) === slot);
      const logged = dayLogged.filter((entry) => toSlot(entry.meal_type) === slot);
      const count = planned.reduce((sum, meal) => sum + meal.items.length, 0) + logged.length;
      return { slot, count };
    });
  }, [dayPlanned, dayLogged]);

  /* ---------- Navigazione ---------- */

  const previousWeek = () => selectedDate && setSelectedDate(addDays(selectedDate, -7));
  const nextWeek = () => selectedDate && setSelectedDate(addDays(selectedDate, 7));
  const goToToday = () => setSelectedDate(new Date());

  const isToday = selectedKey !== "" && selectedKey === todayKey;
  const isFuture = selectedKey !== "" && selectedKey > todayKey;

  /* ---------- Render ---------- */

  if (loading || !selectedDate) {
    return (
      <AppShell>
        <div className="calendar-state">Caricamento calendario…</div>
      </AppShell>
    );
  }

  const hasTotals =
    loggedTotals.kcal > 0 || plannedTotals.kcal > 0 || dayLogged.length > 0;

  return (
    <AppShell>
      <div className="calendar-page">
        <div className="calendar-heading">
          <div>
            <p className="calendar-eyebrow">IL TUO CALENDARIO</p>
            <h1>
              Settimana {formatDate(weekDates[0], { day: "numeric", month: "long" })}
              {" – "}
              {formatDate(weekDates[6], { day: "numeric", month: "long", year: "numeric" })}
            </h1>
            <p>Allenamenti e alimentazione, giorno per giorno.</p>
          </div>
          <Link className="calendar-button-secondary" href="/plan">
            <CalendarIcon size={16} />
            I miei programmi
          </Link>
        </div>

        {error && <div className="calendar-alert calendar-alert--error">{error}</div>}

        {/* ---------- Striscia settimanale ---------- */}
        <section className="calendar-week-panel" aria-label="Settimana">
          <div className="calendar-week-toolbar">
            <button
              type="button"
              className="calendar-icon-button"
              onClick={previousWeek}
              aria-label="Settimana precedente"
            >
              <ChevronLeftIcon size={18} />
            </button>

            <div className="calendar-days">
              {weekDates.map((date) => {
                const key = localDateKey(date);
                const daySessions = sessionsByDate.get(key) ?? [];
                const done = daySessions.some((s) => s.status === "completed");
                const running = daySessions.some((s) => s.status === "in_progress");
                const meals = mealDates.has(key);
                const active = key === selectedKey;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={[
                      "calendar-day",
                      active ? "calendar-day--active" : "",
                      key === todayKey ? "calendar-day--today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={active}
                    aria-label={formatDate(date, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  >
                    <span className="calendar-day__name">
                      {formatDate(date, { weekday: "short" }).replace(".", "")}
                    </span>
                    <span className="calendar-day__number">{date.getDate()}</span>
                    <span className="calendar-day__dots" aria-hidden="true">
                      {done && <i className="calendar-dot calendar-dot--done" />}
                      {running && <i className="calendar-dot calendar-dot--progress" />}
                      {meals && <i className="calendar-dot calendar-dot--meal" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="calendar-icon-button"
              onClick={nextWeek}
              aria-label="Settimana successiva"
            >
              <ChevronRightIcon size={18} />
            </button>
          </div>

          {selectedKey !== todayKey && (
            <button type="button" className="calendar-today-button" onClick={goToToday}>
              Vai a oggi
            </button>
          )}
        </section>

        <div className="calendar-selected-date">
          <div className="calendar-selected-date__icon">
            <CalendarIcon size={19} />
          </div>
          <div>
            <p className="calendar-eyebrow">GIORNATA SELEZIONATA</p>
            <h2>
              {formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h2>
            <p className="calendar-note">Il tuo allenamento e i pasti previsti per oggi.</p>
          </div>
        </div>

        <div className="calendar-steps-bar">
          <div className="calendar-steps-bar__icon" aria-hidden="true">
            <FootstepsIcon size={18} />
          </div>

          {stepsEditing ? (
            <div className="calendar-steps-bar__edit">
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="es. 8500"
                autoFocus
                value={stepDraft}
                onChange={(event) => setStepDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveSteps();
                  if (event.key === "Escape") setStepsEditing(false);
                }}
              />
              <button
                type="button"
                className="calendar-steps-bar__save"
                disabled={savingSteps}
                onClick={() => void saveSteps()}
              >
                {savingSteps ? "..." : "Salva"}
              </button>
              <button
                type="button"
                className="calendar-steps-bar__cancel"
                onClick={() => setStepsEditing(false)}
              >
                Annulla
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="calendar-steps-bar__display"
              onClick={() => setStepsEditing(true)}
            >
              <strong>
                {selectedStepCount ? selectedStepCount.steps.toLocaleString("it-IT") : "—"}
              </strong>
              <span>
                passi
                {selectedStepCount?.source === "shortcuts" ? " · da iPhone" : ""}
                {!selectedStepCount && " · tocca per inserire"}
              </span>
            </button>
          )}
        </div>

        {stepsWarning && <div className="calendar-alert calendar-alert--warning">{stepsWarning}</div>}

        <div className="calendar-content-grid">
          {/* ---------- 1. Allenamento ---------- */}
          <section className="calendar-card">
            <div className="calendar-card__header">
              <div className="calendar-card__icon" aria-hidden="true">
                <DumbbellIcon size={20} />
              </div>
              <div>
                <h3>Allenamento</h3>
                <p>
                  {resumeSession
                    ? "Hai una sessione da riprendere"
                    : "La scheda suggerita dalla sequenza del tuo mesociclo."}
                </p>
              </div>
            </div>

            {planWarning && (
              <div className="calendar-alert calendar-alert--warning">{planWarning}</div>
            )}

            {!mesocycle ? (
              <div className="calendar-empty">
                <h4>Nessun programma disponibile</h4>
                <p>Crea un mesociclo per iniziare ad allenarti.</p>
                <Link className="calendar-button-primary" href="/plan">
                  Crea un programma
                </Link>
              </div>
            ) : !resumeSession && !nextDay ? (
              <div className="calendar-empty">
                <h4>Nessuna giornata allenante</h4>
                <p>
                  Il programma <strong>{mesocycle.name}</strong> non ha giornate di
                  allenamento. Controlla la programmazione.
                </p>
                <Link className="calendar-button-secondary" href={`/plan/${mesocycle.id}`}>
                  Apri programma
                </Link>
              </div>
            ) : !resumeSession && !isToday && !isFuture ? (
              <div className="calendar-empty">
                <h4>Giorno passato</h4>
                <p>
                  La scheda non è legata alla data: la prossima è{" "}
                  <strong>{nextDay?.title || nextDay?.day_code}</strong>. Qui sotto
                  trovi le sessioni registrate in questa data.
                </p>
              </div>
            ) : (
              <>
                <div className="calendar-suggested">
                  <p className="calendar-eyebrow">
                    {resumeSession ? "Allenamento da riprendere" : "Prossimo allenamento"}
                  </p>
                  <div className="calendar-suggested__row">
                    <span className="calendar-suggested__code">{displayDay?.day_code ?? "—"}</span>
                    <div>
                      <div className="calendar-suggested__title">
                        <strong>Scheda {displayDay?.day_code ?? ""}</strong>
                        {!resumeSession && displayDay?.id === proposedDay?.id && (
                          <span className="calendar-badge calendar-badge--suggested">Suggerita</span>
                        )}
                      </div>
                      <p className="calendar-note">
                        {resumeSession
                          ? `Iniziato il ${formatDate(parseDateKey(resumeSession.performed_at), { day: "numeric", month: "long" })}`
                          : `Settimana ${displayDay?.week_number ?? "-"} · Secondo la sequenza del tuo mesociclo`}
                      </p>
                    </div>
                  </div>
                </div>

                {displayDay?.notes && <p className="calendar-note">{displayDay.notes}</p>}

                {!resumeSession && candidateDays.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="calendar-button-outline"
                      onClick={() => setShowSwitcher((v) => !v)}
                    >
                      <SwapIcon size={16} />
                      Scegli un&apos;altra scheda
                    </button>

                    {showSwitcher && (
                      <div className="calendar-switcher">
                        <p className="calendar-switcher__title">Scegli la scheda che vuoi svolgere</p>
                        <p className="calendar-note">
                          Puoi allenarti con una scheda diversa da quella suggerita. La
                          sequenza avanzerà solo quando completerai l&apos;allenamento.
                        </p>

                        <div className="calendar-switcher__grid">
                          {candidateDays.map((day) => {
                            const selected = displayDay?.id === day.id;
                            const suggested = proposedDay?.id === day.id;

                            return (
                              <button
                                type="button"
                                key={day.id}
                                className={`calendar-switcher__card${selected ? " calendar-switcher__card--selected" : ""}`}
                                onClick={() => setManualDayId(day.id)}
                              >
                                {selected && (
                                  <span className="calendar-switcher__check" aria-hidden="true">
                                    <CheckIcon size={12} />
                                  </span>
                                )}
                                <span className="calendar-switcher__avatar">{day.day_code}</span>
                                <strong>Scheda {day.day_code}</strong>
                                <span
                                  className={`calendar-badge${suggested ? " calendar-badge--suggested" : " calendar-badge--neutral"}`}
                                >
                                  {suggested ? "Suggerita" : "Disponibile"}
                                </span>
                                <span className="calendar-switcher__meta">
                                  {daysAgoLabel(lastCompletedByCode.get(day.day_code), todayKey)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {extraInProgress > 0 && (
                  <p className="calendar-note">
                    Ci sono altre {extraInProgress}{" "}
                    {extraInProgress === 1 ? "sessione" : "sessioni"} in corso da chiudere.
                  </p>
                )}

                <div className="calendar-actions">
                  {resumeSession?.mesocycle_day_id ? (
                    <Link
                      className="calendar-button-primary"
                      href={workoutsHref(
                        resumeSession.mesocycle_day_id,
                        resumeSession.performed_at.slice(0, 10),
                      )}
                    >
                      <PlayIcon size={15} />
                      Riprendi allenamento
                    </Link>
                  ) : isToday && displayDay ? (
                    <Link
                      className="calendar-button-primary"
                      href={workoutsHref(displayDay.id, todayKey)}
                    >
                      <PlayIcon size={15} />
                      Inizia con la scheda {displayDay.day_code}
                    </Link>
                  ) : (
                    <p className="calendar-note">
                      La scheda verrà assegnata quando ti allenerai, non a questa data.
                    </p>
                  )}
                </div>

                {displayDay && displayDay.exercises.length > 0 && (
                  <details
                    className="calendar-details"
                    open={showDetails}
                    onToggle={(event) => setShowDetails(event.currentTarget.open)}
                  >
                    <summary>Dettagli della scheda</summary>

                    <div className="calendar-details__stats">
                      <span>
                        <TargetIcon size={15} /> {displayDay.exercises.length} esercizi
                      </span>
                      <span>
                        <ClockIcon size={15} /> {estimateDuration(displayDay)}
                      </span>
                      <span>
                        <DumbbellIcon size={15} /> {mesocycle?.goal ?? "Allenamento"}
                      </span>
                    </div>

                    <ol className="calendar-exercises">
                      {displayDay.exercises.map((exercise) => {
                        const reps = formatReps(exercise.reps_min, exercise.reps_max);
                        const details = [
                          `${exercise.sets} serie`,
                          reps,
                          exercise.target_weight_kg !== null
                            ? `${exercise.target_weight_kg} kg`
                            : null,
                          exercise.rest_seconds !== null
                            ? `rec. ${exercise.rest_seconds} s`
                            : null,
                        ].filter(Boolean);

                        return (
                          <li key={exercise.id}>
                            <strong>{exercise.exercise_name}</strong>
                            <span>{details.join(" · ")}</span>
                            {exercise.notes && <em>{exercise.notes}</em>}
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                )}

                {displayDay && displayDay.exercises.length === 0 && (
                  <p className="calendar-note">Questa giornata non ha esercizi prescritti.</p>
                )}

                <Link className="calendar-button-secondary calendar-link-block" href={`/plan/${mesocycle.id}`}>
                  Vedi programma completo
                </Link>
              </>
            )}
          </section>

          {/* ---------- 2. Alimentazione ---------- */}
          <section className="calendar-card">
            <div className="calendar-card__header">
              <div className="calendar-card__icon calendar-card__icon--nutrition" aria-hidden="true">
                <UtensilsIcon size={19} />
              </div>
              <div>
                <h3>Alimentazione</h3>
                <p>Pasti previsti e alimenti registrati.</p>
              </div>
            </div>

            {nutritionWarning && (
              <div className="calendar-alert calendar-alert--warning">{nutritionWarning}</div>
            )}

            {hasTotals && (
              <div className="calendar-totals">
                <div>
                  <span>Pianificato</span>
                  <strong>{round(plannedTotals.kcal)} kcal</strong>
                  <small>
                    P {round(plannedTotals.protein)} · C {round(plannedTotals.carbs)} · F{" "}
                    {round(plannedTotals.fat)} g
                  </small>
                </div>
                <div>
                  <span>Registrato</span>
                  <strong>{round(loggedTotals.kcal)} kcal</strong>
                  <small>
                    P {round(loggedTotals.protein)} · C {round(loggedTotals.carbs)} · F{" "}
                    {round(loggedTotals.fat)} g
                  </small>
                </div>
              </div>
            )}

            <div className="calendar-meal-list">
              {mealSlots.map(({ slot, count }) => (
                <Link
                  key={slot}
                  href={`/nutrition?date=${selectedKey}`}
                  className="calendar-meal-row"
                >
                  <span className={`calendar-meal-row__icon calendar-meal-row__icon--${slot}`}>
                    <UtensilsIcon size={16} />
                  </span>
                  <span className="calendar-meal-row__text">
                    <strong>{SLOT_LABEL[slot]}</strong>
                    <span>{count} {count === 1 ? "alimento" : "alimenti"}</span>
                  </span>
                  <ChevronRightIcon size={16} className="calendar-meal-row__chevron" />
                </Link>
              ))}
            </div>

            <Link
              className="calendar-button-secondary calendar-link-block"
              href={`/nutrition?date=${selectedKey}`}
            >
              Apri diario alimentare
            </Link>
          </section>

          {/* ---------- 3. Sessioni registrate ---------- */}
          <section className="calendar-card calendar-card--wide">
            <div className="calendar-card__header">
              <div className="calendar-card__icon" aria-hidden="true">
                <CheckIcon size={18} />
              </div>
              <div>
                <h3>Sessioni registrate</h3>
                <p>Allenamenti iniziati o completati in questa data</p>
              </div>
            </div>

            {selectedSessions.length === 0 ? (
              <div className="calendar-empty">
                <h4>Nessuna sessione registrata</h4>
                <p>In questa data non risultano allenamenti.</p>
              </div>
            ) : (
              <ul className="calendar-sessions">
                {selectedSessions.map((session) => {
                  const day = session.mesocycle_day_id
                    ? dayById.get(session.mesocycle_day_id)
                    : undefined;
                  const time = formatTime(session.started_at);
                  const dateKey = session.performed_at.slice(0, 10);

                  return (
                    <li className="calendar-session" key={session.id}>
                      <div>
                        <strong>
                          {day?.title || session.title || day?.day_code || "Allenamento"}
                        </strong>
                        <p className="calendar-note">
                          {day
                            ? `Settimana ${day.week_number} · Giornata ${day.day_code}`
                            : session.mesocycle_day_id
                              ? "Giornata di un altro programma"
                              : "Senza giornata associata"}
                          {time ? ` · ${time}` : ""}
                        </p>
                        <span className="calendar-status" data-status={session.status}>
                          {SESSION_STATUS_LABEL[session.status] ?? session.status}
                        </span>
                      </div>

                      {session.mesocycle_day_id && session.status !== "skipped" && (
                        <Link
                          className="calendar-button-secondary"
                          href={workoutsHref(session.mesocycle_day_id, dateKey)}
                        >
                          {session.status === "in_progress" ? "Riprendi" : "Apri"}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="calendar-actions calendar-actions--footer">
              <Link className="calendar-button-secondary" href="/workouts">
                Registro allenamenti
              </Link>
              <button
                type="button"
                className="calendar-button-secondary"
                onClick={() => {
                  void loadPlan();
                  setRefreshKey((key) => key + 1);
                }}
              >
                <RefreshIcon size={15} />
                Aggiorna dati
              </button>
              {lastUpdated && (
                <span className="calendar-updated">
                  <i className="calendar-dot calendar-dot--done" /> Ultimo aggiornamento: {lastUpdated}
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
