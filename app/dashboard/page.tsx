
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import CircularProgress from "@/components/CircularProgress";
import { calculateMacroTargets, round, type NutritionProfile } from "@/lib/nutrition";
import { getExtraDailyTrainingCalories } from "@/lib/activity";
import {
  CalendarIcon,
  ChartIcon,
  DumbbellIcon,
  FootstepsIcon,
  GridIcon,
  SparklesIcon,
  UserIcon,
  UtensilsIcon,
} from "@/components/icons";
import "./dashboard.css";

const WEEKDAY_SHORT = ["L", "M", "M", "G", "V", "S", "D"];

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

const primaryItems = [
  {
    category: "INTELLIGENZA ARTIFICIALE",
    title: "Genera con AI",
    description: "Scheda di allenamento o piano alimentare, generati in base al tuo profilo.",
    path: "/generate",
    icon: SparklesIcon,
  },
  {
    category: "ORGANIZZAZIONE",
    title: "Il mio calendario",
    description: "Consulta gli allenamenti e i pasti previsti per ogni giorno.",
    path: "/calendar",
    icon: CalendarIcon,
  },
  {
    category: "PROGRAMMAZIONE",
    title: "Piano di allenamento",
    description: "Gestisci mesocicli, settimane, giornate ed esercizi.",
    path: "/plan",
    icon: GridIcon,
  },
  {
    category: "ATTIVITÀ",
    title: "I miei allenamenti",
    description: "Accedi alle sessioni e registra le attività svolte.",
    path: "/workouts",
    icon: DumbbellIcon,
  },
  {
    category: "ALIMENTAZIONE",
    title: "Diario alimentare",
    description: "Organizza i pasti e monitora la tua alimentazione.",
    path: "/nutrition",
    icon: UtensilsIcon,
  },
];

const secondaryItems = [
  {
    title: "Progressi",
    description: "Consulta peso e misurazioni corporee.",
    path: "/progress",
    icon: ChartIcon,
  },
  {
    title: "Profilo personale",
    description: "Aggiorna i tuoi dati e le preferenze fitness.",
    path: "/profile",
    icon: UserIcon,
  },
  {
    title: "Template",
    description: "Gestisci i modelli di allenamento riutilizzabili.",
    path: "/templates",
    icon: GridIcon,
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [consumedKcal, setConsumedKcal] = useState(0);
  const [macros, setMacros] = useState<{ protein: number; carbs: number; fat: number }>({
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  const [macroTargets, setMacroTargets] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [todayKey, setTodayKey] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error || !data.session) {
        router.replace("/");
        return;
      }

      const userId = data.session.user.id;
      const key = localDateKey(new Date());
      setTodayKey(key);

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("full_name,birth_date,sex,height_cm,current_weight_kg,goal,activity_level")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;

      if (profileRow) {
        setFirstName((profileRow.full_name ?? "").split(" ")[0] || "");

        const extraCalories = await getExtraDailyTrainingCalories(userId);
        const targets = calculateMacroTargets(profileRow as NutritionProfile, extraCalories);
        if (active) setMacroTargets(targets);
      }

      const { data: entries } = await supabase
        .from("food_entries")
        .select("calories,protein_g,carbs_g,fat_g")
        .eq("user_id", userId)
        .eq("eaten_at", key);

      if (active && entries) {
        setConsumedKcal(entries.reduce((sum, row) => sum + (row.calories ?? 0), 0));
        setMacros({
          protein: entries.reduce((sum, row) => sum + (row.protein_g ?? 0), 0),
          carbs: entries.reduce((sum, row) => sum + (row.carbs_g ?? 0), 0),
          fat: entries.reduce((sum, row) => sum + (row.fat_g ?? 0), 0),
        });
      }

      const { data: stepRow } = await supabase
        .from("step_counts")
        .select("steps")
        .eq("user_id", userId)
        .eq("date", key)
        .maybeSingle();

      if (active) setSteps(stepRow?.steps ?? null);

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

  const weekDates = todayKey
    ? Array.from({ length: 7 }, (_, index) => {
        const start = startOfWeek(new Date(`${todayKey}T12:00:00`));
        const date = new Date(start);
        date.setDate(date.getDate() + index);
        return date;
      })
    : [];

  const kcalLeft = macroTargets ? Math.max(0, Math.round(macroTargets.calories - consumedKcal)) : null;

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

        <section className="home-today-card">
          <CircularProgress
            value={consumedKcal}
            max={macroTargets?.calories ?? 0}
            size={100}
            strokeWidth={9}
            trackColor="rgba(0, 0, 0, 0.14)"
            fillColor="var(--ink-text)"
          >
            <strong>{kcalLeft ?? "—"}</strong>
            <span>kcal left</span>
          </CircularProgress>

          <div className="home-today-card__macros">
            <div>
              <div className="home-today-card__macro-row">
                <span>
                  <i className="home-today-card__dot home-today-card__dot--protein" />
                  Protein
                </span>
                <small>
                  {round(macros.protein)}/{macroTargets ? round(macroTargets.protein) : "—"}g
                </small>
              </div>
              <div className="home-today-card__bar">
                <div
                  style={{
                    width: `${macroTargets?.protein ? Math.min(100, (macros.protein / macroTargets.protein) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="home-today-card__macro-row">
                <span>
                  <i className="home-today-card__dot home-today-card__dot--carbs" />
                  Carbs
                </span>
                <small>
                  {round(macros.carbs)}/{macroTargets ? round(macroTargets.carbs) : "—"}g
                </small>
              </div>
              <div className="home-today-card__bar">
                <div
                  style={{
                    width: `${macroTargets?.carbs ? Math.min(100, (macros.carbs / macroTargets.carbs) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="home-today-card__macro-row">
                <span>
                  <i className="home-today-card__dot home-today-card__dot--fat" />
                  Fat
                </span>
                <small>
                  {round(macros.fat)}/{macroTargets ? round(macroTargets.fat) : "—"}g
                </small>
              </div>
              <div className="home-today-card__bar">
                <div
                  style={{
                    width: `${macroTargets?.fat ? Math.min(100, (macros.fat / macroTargets.fat) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {steps !== null && (
          <div className="home-stat-row">
            <div className="home-stat-chip">
              <span className="home-stat-chip__icon">
                <FootstepsIcon size={16} />
              </span>
              <div>
                <strong>{steps.toLocaleString("it-IT")}</strong>
                <span>Passi oggi</span>
              </div>
            </div>
          </div>
        )}

        <section className="home-section">
          <div className="home-section-heading">
            <p className="home-eyebrow">IL TUO SPAZIO OPERATIVO</p>
            <h2>Le tue attività</h2>
          </div>

          <div className="home-grid">
            {primaryItems.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.path}
                  className="home-card"
                  role="link"
                  tabIndex={0}
                  aria-label={`Apri ${item.title}`}
                  onClick={() => openSection(item.path)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openSection(item.path);
                    }
                  }}
                >
                  <div className="home-card-icon">
                    <Icon size={22} />
                  </div>
                  <span className="home-card-category">{item.category}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <span className="home-card-cta">Apri sezione →</span>
                </article>
              );
            })}
          </div>
        </section>

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
