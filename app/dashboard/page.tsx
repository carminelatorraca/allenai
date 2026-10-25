
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { calculateMacroTargets, SLOT_LABEL, toSlot, type NutritionProfile } from "@/lib/nutrition";
import { getExtraDailyTrainingCalories, getNextWorkoutDay, getWorkoutStreak, type NextWorkoutDay } from "@/lib/activity";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChartIcon,
  ClockIcon,
  FireIcon,
  DropletIcon,
  FootstepsIcon,
  GridIcon,
  PlusIcon,
  UserIcon,
} from "@/components/icons";
import "./dashboard.css";

const WEEKDAY_SHORT = ["L", "M", "M", "G", "V", "S", "D"];
const MEAL_EMOJI: Record<string, string> = {
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

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7; // 0 = lunedì
  result.setDate(result.getDate() - day);
  return result;
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
  meal_type: string;
  food_name: string;
  calories: number | null;
};

type TodaySession = {
  id: string;
  title: string;
  actual_duration_minutes: number | null;
  actual_distance_km: number | null;
  actual_calories: number | null;
};

const secondaryItems = [
  {
    title: "Progressi",
    description: "Consulta peso e misurazioni corporee.",
    path: "/progress",
    icon: ChartIcon,
  },
  {
    title: "Il mio calendario",
    description: "Consulta allenamenti e pasti per ogni giorno.",
    path: "/calendar",
    icon: CalendarIcon,
  },
  {
    title: "Piano di allenamento",
    description: "Gestisci mesocicli, settimane e giornate.",
    path: "/plan",
    icon: GridIcon,
  },
  {
    title: "Profilo personale",
    description: "Aggiorna i tuoi dati e le preferenze.",
    path: "/profile",
    icon: UserIcon,
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [consumedKcal, setConsumedKcal] = useState(0);
  const [macroTargets, setMacroTargets] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [todayKey, setTodayKey] = useState("");
  const [userId, setUserId] = useState("");
  const [glasses, setGlasses] = useState(0);
  const [savingWater, setSavingWater] = useState(false);
  const [streak, setStreak] = useState(0);
  const [nextWorkout, setNextWorkout] = useState<NextWorkoutDay | null>(null);
  const [todayMeals, setTodayMeals] = useState<FoodEntryRow[]>([]);
  const [todaySession, setTodaySession] = useState<TodaySession | null>(null);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error || !data.session) {
        router.replace("/");
        return;
      }

      const uid = data.session.user.id;
      setUserId(uid);
      const key = localDateKey(new Date());
      setTodayKey(key);

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("full_name,birth_date,sex,height_cm,current_weight_kg,goal,activity_level")
        .eq("id", uid)
        .maybeSingle();

      if (!active) return;

      if (profileRow) {
        setFirstName((profileRow.full_name ?? "").split(" ")[0] || "");

        const extraCalories = await getExtraDailyTrainingCalories(uid);
        const targets = calculateMacroTargets(profileRow as NutritionProfile, extraCalories);
        if (active) setMacroTargets(targets);
      }

      const { data: entries } = await supabase
        .from("food_entries")
        .select("id,meal_type,food_name,calories")
        .eq("user_id", uid)
        .eq("eaten_at", key);

      if (active && entries) {
        setConsumedKcal(entries.reduce((sum, row) => sum + (row.calories ?? 0), 0));
        setTodayMeals(entries);
      }

      const { data: stepRow } = await supabase
        .from("step_counts")
        .select("steps")
        .eq("user_id", uid)
        .eq("date", key)
        .maybeSingle();

      if (active) setSteps(stepRow?.steps ?? null);

      const { data: waterRow } = await supabase
        .from("water_logs")
        .select("glasses")
        .eq("user_id", uid)
        .eq("date", key)
        .maybeSingle();

      if (active) setGlasses(waterRow?.glasses ?? 0);

      const { data: sessionRow } = await supabase
        .from("workout_sessions")
        .select("id,title,actual_duration_minutes,actual_distance_km,actual_calories")
        .eq("user_id", uid)
        .eq("performed_at", key)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active) setTodaySession(sessionRow ?? null);

      const [streakDays, workoutDay] = await Promise.all([
        getWorkoutStreak(uid),
        getNextWorkoutDay(uid),
      ]);

      if (active) {
        setStreak(streakDays);
        setNextWorkout(workoutDay);
      }

      setLoading(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session) {
        router.replace("/");
        return;
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function addGlass() {
    if (!userId || !todayKey || savingWater) return;
    const next = Math.min(12, glasses + 1);
    setGlasses(next);
    setSavingWater(true);
    try {
      await supabase
        .from("water_logs")
        .upsert({ user_id: userId, date: todayKey, glasses: next }, { onConflict: "user_id,date" });
    } finally {
      setSavingWater(false);
    }
  }

  const weekDates = todayKey
    ? Array.from({ length: 7 }, (_, index) => {
        const start = startOfWeek(new Date(`${todayKey}T12:00:00`));
        const date = new Date(start);
        date.setDate(date.getDate() + index);
        return date;
      })
    : [];

  const waterLitersValue = glasses * 0.25;
  const waterLiters = Number.isInteger(waterLitersValue)
    ? String(waterLitersValue)
    : waterLitersValue.toFixed(2).replace(/0$/, "");

  function openSection(path: string) {
    router.push(path);
  }

  if (loading) {
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

        {weekDates.length > 0 && (
          <div className="home-day-strip">
            {weekDates.map((date, index) => {
              const key = localDateKey(date);
              const isToday = key === todayKey;

              return (
                <Link
                  key={key}
                  href={`/calendar?date=${key}`}
                  className={`home-day${isToday ? " home-day--active" : ""}`}
                >
                  <span>{WEEKDAY_SHORT[index]}</span>
                  <strong>{date.getDate()}</strong>
                </Link>
              );
            })}
          </div>
        )}

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
              <button
                type="button"
                className="home-stat-card__add"
                aria-label="Aggiungi un bicchiere d'acqua"
                onClick={() => void addGlass()}
              >
                <PlusIcon size={15} />
              </button>
            </div>
            <p className="home-stat-card__label">Acqua</p>
            <p className="home-stat-card__value">
              {waterLiters} L <span>/ 2 L</span>
            </p>
            <div className="home-stat-card__bar">
              <div style={{ width: `${Math.min(100, glasses * 12.5)}%` }} />
            </div>
          </article>

          <article className="home-stat-card home-stat-card--dark">
            <div className="home-stat-card__top">
              <span className="home-stat-card__icon home-stat-card__icon--lime">
                <FootstepsIcon size={18} />
              </span>
            </div>
            <p className="home-stat-card__label">Passi</p>
            <p className="home-stat-card__value">
              {steps !== null ? steps.toLocaleString("it-IT") : "—"} <span>/ 10.000</span>
            </p>
            <div className="home-stat-card__bar">
              <div style={{ width: `${steps !== null ? Math.min(100, (steps / 10000) * 100) : 0}%` }} />
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

            {todaySession ? (
              <div className="home-activity-row">
                <div>
                  <p>{todaySession.title}</p>
                  <span>
                    {[
                      todaySession.actual_distance_km ? `${todaySession.actual_distance_km} km` : null,
                      todaySession.actual_duration_minutes ? `${todaySession.actual_duration_minutes} min` : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </span>
                </div>
                {todaySession.actual_calories ? <strong>+{todaySession.actual_calories} kcal</strong> : null}
              </div>
            ) : (
              <div className="home-activity-row home-activity-row--empty">
                <span>Nessuna attività registrata oggi</span>
              </div>
            )}
          </article>
        </div>

        <div className="home-row home-row--wide">
          <article className="home-card-plain">
            <div className="home-card-plain__head">
              <div>
                <p className="home-card-plain__title">Piano alimentare</p>
                <p className="home-card-plain__subtitle">I tuoi pasti di oggi</p>
              </div>
              <button type="button" className="home-card-plain__link" onClick={() => openSection("/nutrition")}>
                Vedi piano <ArrowRightIcon size={14} />
              </button>
            </div>

            <div className="home-meal-list">
              {todayMeals.length === 0 && <p className="home-empty-text">Nessun pasto registrato oggi.</p>}
              {todayMeals.map((meal) => (
                <div key={meal.id} className="home-meal-row">
                  <span className="home-meal-row__emoji">{MEAL_EMOJI[toSlot(meal.meal_type)]}</span>
                  <div className="home-meal-row__content">
                    <div>
                      <strong>{meal.food_name}</strong>
                      <span>{SLOT_LABEL[toSlot(meal.meal_type)]}</span>
                    </div>
                  </div>
                  <p className="home-meal-row__kcal">
                    {meal.calories ?? 0} <span>kcal</span>
                  </p>
                </div>
              ))}
            </div>

            <button type="button" className="home-dashed-button" onClick={() => openSection("/nutrition")}>
              <PlusIcon size={16} /> Aggiungi pasto
            </button>
          </article>

          <article className="home-workout-card">
            <div className="home-workout-card__header">
              <span className="home-workout-card__badge">
                {nextWorkout ? "PROSSIMO" : "ALLENAMENTO"}
              </span>
              {nextWorkout?.duration_minutes && (
                <span className="home-workout-card__duration">
                  <ClockIcon size={14} />
                  {nextWorkout.duration_minutes} min
                </span>
              )}
            </div>

            {nextWorkout ? (
              <>
                <p className="home-workout-card__title">{nextWorkout.title}</p>
                <p className="home-workout-card__subtitle">
                  Settimana {nextWorkout.week_number} • Giornata {nextWorkout.day_code}
                </p>

                <div className="home-workout-card__exercises">
                  {nextWorkout.exercises.length === 0 && (
                    <p className="home-empty-text home-empty-text--dark">Nessun esercizio pianificato.</p>
                  )}
                  {nextWorkout.exercises.slice(0, 4).map((exercise) => (
                    <div key={exercise.id} className="home-workout-exercise">
                      <span className="home-workout-exercise__dot" />
                      <span className="home-workout-exercise__text">
                        <strong>{exercise.exercise_name}</strong>
                        <small>{formatExerciseDetail(exercise.sets, exercise.reps_min, exercise.reps_max)}</small>
                      </span>
                    </div>
                  ))}
                </div>

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
