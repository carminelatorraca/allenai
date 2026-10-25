"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { calculateAge, type NutritionProfile } from "@/lib/nutrition";
import { estimateSessionCalories } from "@/lib/activity";
import type { GeneratedWorkoutDay } from "@/lib/workout-plan-schema";
import "./generate-plan.css";

const GOAL_LABEL: Record<string, string> = {
  lose_fat: "Perdere grasso",
  build_muscle: "Aumentare la massa muscolare",
  recomposition: "Ricomposizione corporea",
  maintain: "Mantenere il livello attuale",
  improve_fitness: "Migliorare la forma fisica",
};

const ACTIVITY_LABEL: Record<string, string> = {
  swimming: "Nuoto",
  running: "Corsa",
  cycling: "Bici",
  cardio: "Cardio",
  other: "Altro",
};

type ExtraActivity = {
  id: string;
  type: string;
  sessionsPerWeek: number;
  durationMinutes: string;
  intensity: string;
};

function newExtraActivity(): ExtraActivity {
  return {
    id: Math.random().toString(36).slice(2),
    type: "swimming",
    sessionsPerWeek: 1,
    durationMinutes: "45",
    intensity: "moderate",
  };
}

async function parseJsonResponse(
  response: Response,
): Promise<{ days?: GeneratedWorkoutDay[]; message?: string }> {
  const text = await response.text();
  if (!text) {
    throw new Error(
      "La richiesta si è interrotta prima di ricevere una risposta. Riprova.",
    );
  }
  try {
    return JSON.parse(text) as { days?: GeneratedWorkoutDay[]; message?: string };
  } catch {
    throw new Error("Risposta non valida dal server. Riprova.");
  }
}

export default function GeneratePlanPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<NutritionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [experience, setExperience] = useState("intermediate");
  const [equipment, setEquipment] = useState("full_gym");
  const [notes, setNotes] = useState("");
  const [extraActivities, setExtraActivities] = useState<ExtraActivity[]>([]);

  const [name, setName] = useState("Scheda generata dall'AI");
  const [durationWeeks, setDurationWeeks] = useState("8");
  const [startDate, setStartDate] = useState("");

  const [generating, setGenerating] = useState(false);
  const [generatedDays, setGeneratedDays] = useState<GeneratedWorkoutDay[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function init() {
      const { data, error: authError } = await supabase.auth.getUser();

      if (authError || !data.user) {
        router.replace("/");
        return;
      }

      setUserId(data.user.id);

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("birth_date,sex,height_cm,current_weight_kg,goal,activity_level")
        .eq("id", data.user.id)
        .maybeSingle();

      setProfile(profileRow as NutritionProfile | null);
      setLoading(false);
    }

    void init();
  }, [router]);

  async function handleGenerate() {
    if (!profile?.height_cm || !profile?.current_weight_kg) {
      setError(
        "Completa altezza e peso nel tuo profilo prima di generare una scheda personalizzata.",
      );
      return;
    }

    setGenerating(true);
    setError("");
    setGeneratedDays(null);

    try {
      const age = profile.birth_date ? calculateAge(profile.birth_date) : null;

      const response = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heightCm: profile.height_cm,
          weightKg: profile.current_weight_kg,
          sex: profile.sex,
          age,
          goal: profile.goal,
          activityLevel: profile.activity_level,
          experience,
          daysPerWeek,
          equipment,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message ?? "Impossibile generare la scheda.");
      }

      setGeneratedDays(data.days ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la generazione.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateMesocycle() {
    if (!userId || !generatedDays || generatedDays.length === 0) return;

    const weeks = Number(durationWeeks);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
      setError("Inserisci una durata valida in settimane (1-52).");
      return;
    }

    if (!name.trim()) {
      setError("Inserisci un nome per la scheda.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const { data: createdMesocycle, error: mesoError } = await supabase
        .from("mesocycles")
        .insert({
          user_id: userId,
          name: name.trim(),
          goal: profile?.goal ? (GOAL_LABEL[profile.goal] ?? profile.goal) : "Generata dall'AI",
          start_date: startDate || null,
          duration_weeks: weeks,
          status: "draft",
        })
        .select("id")
        .single();

      if (mesoError || !createdMesocycle) {
        throw new Error(mesoError?.message ?? "Impossibile creare la scheda.");
      }

      const weekRows = Array.from({ length: weeks }, (_, index) => ({
        mesocycle_id: createdMesocycle.id,
        user_id: userId,
        week_number: index + 1,
      }));

      const { data: createdWeeks, error: weeksError } = await supabase
        .from("mesocycle_weeks")
        .insert(weekRows)
        .select("id");

      if (weeksError || !createdWeeks) {
        throw new Error(weeksError?.message ?? "Errore nella creazione delle settimane.");
      }

      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const usedCodes = new Set(generatedDays.map((day) => day.day_code.toUpperCase()));

      const extraSessions = extraActivities.flatMap((activity) => {
        const durationMinutes = Number(activity.durationMinutes) || null;
        const estimatedCalories =
          profile?.current_weight_kg && durationMinutes
            ? estimateSessionCalories(
                activity.type,
                durationMinutes,
                activity.intensity,
                profile.current_weight_kg,
              )
            : null;

        return Array.from({ length: activity.sessionsPerWeek }, () => {
          const code =
            [...alphabet].find((letter) => !usedCodes.has(letter)) ??
            `X${usedCodes.size + 1}`;
          usedCodes.add(code);

          return {
            day_code: code,
            title: ACTIVITY_LABEL[activity.type] ?? activity.type,
            activity_type: activity.type,
            duration_minutes: durationMinutes,
            intensity: durationMinutes ? activity.intensity : null,
            estimated_calories: estimatedCalories,
          };
        });
      });

      const dayRows = createdWeeks.flatMap((week) => [
        ...generatedDays.map((day, index) => ({
          week_id: week.id,
          user_id: userId,
          day_code: day.day_code,
          title: day.title,
          activity_type: "gym",
          notes: null,
          sort_order: index,
        })),
        ...extraSessions.map((session, index) => ({
          week_id: week.id,
          user_id: userId,
          day_code: session.day_code,
          title: session.title,
          activity_type: session.activity_type,
          notes: null,
          duration_minutes: session.duration_minutes,
          intensity: session.intensity,
          estimated_calories: session.estimated_calories,
          sort_order: generatedDays.length + index,
        })),
      ]);

      const { data: createdDays, error: daysError } = await supabase
        .from("mesocycle_days")
        .insert(dayRows)
        .select("id, day_code, sort_order");

      if (daysError || !createdDays) {
        throw new Error(daysError?.message ?? "Errore nella creazione dei giorni.");
      }

      const prescriptionRows = createdDays.flatMap((day) => {
        const sourceDay = generatedDays[day.sort_order];
        if (!sourceDay || sourceDay.day_code !== day.day_code) return [];

        return sourceDay.exercises.map((exercise, index) => ({
          mesocycle_day_id: day.id,
          user_id: userId,
          exercise_name: exercise.exercise_name,
          sets: exercise.sets,
          reps_min: exercise.reps_min,
          reps_max: exercise.reps_max,
          target_weight_kg: null,
          tut: exercise.tut || null,
          rest_seconds: exercise.rest_seconds,
          notes: exercise.notes || null,
          sort_order: index,
        }));
      });

      if (prescriptionRows.length > 0) {
        const { error: prescriptionError } = await supabase
          .from("exercise_prescriptions")
          .insert(prescriptionRows);

        if (prescriptionError) throw prescriptionError;
      }

      router.push(`/plan/${createdMesocycle.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la creazione della scheda.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="genplan-loading">Caricamento...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="genplan-page">
        <Link className="genplan-back" href="/plan">
          ← Programmi
        </Link>

        <p className="genplan-eyebrow">PROGRAMMAZIONE</p>
        <h1>Genera una scheda con l&apos;AI</h1>
        <p className="genplan-description">
          L&apos;AI crea una suddivisione settimanale di esercizi in base al tuo profilo e alle tue
          preferenze. Potrai rivedere e modificare tutto prima e dopo averla creata.
        </p>

        {error && <div className="genplan-alert">{error}</div>}

        {(!profile?.height_cm || !profile?.current_weight_kg) && (
          <div className="genplan-alert">
            Completa altezza e peso nel tuo{" "}
            <Link href="/profile">profilo</Link> per generare una scheda personalizzata.
          </div>
        )}

        {!generatedDays ? (
          <section className="genplan-panel">
            <div className="genplan-grid">
              <label>
                Giorni di allenamento a settimana
                <select
                  value={daysPerWeek}
                  onChange={(event) => setDaysPerWeek(Number(event.target.value))}
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} giorni
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Esperienza con i pesi
                <select value={experience} onChange={(event) => setExperience(event.target.value)}>
                  <option value="beginner">Principiante</option>
                  <option value="intermediate">Intermedio</option>
                  <option value="advanced">Avanzato</option>
                </select>
              </label>

              <label>
                Attrezzatura disponibile
                <select value={equipment} onChange={(event) => setEquipment(event.target.value)}>
                  <option value="full_gym">Palestra completa</option>
                  <option value="home_basic">Casa (manubri/elastici)</option>
                  <option value="bodyweight">Solo corpo libero</option>
                </select>
              </label>
            </div>

            <label className="genplan-notes">
              Note o preferenze (opzionale)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Es. evita lo squat per un fastidio al ginocchio, preferisco allenare le spalle due volte a settimana..."
                rows={3}
              />
            </label>

            <div className="genplan-extra">
              <div className="genplan-extra__heading">
                <div>
                  <h3>Altre attività (opzionale)</h3>
                  <p>
                    Nuoto, corsa o altro sport che fai oltre alla palestra: verranno aggiunti come
                    giorni veri nella scheda, e le calorie stimate verranno conteggiate nel
                    fabbisogno della dieta.
                  </p>
                </div>
                <button
                  type="button"
                  className="genplan-secondary"
                  onClick={() => setExtraActivities((current) => [...current, newExtraActivity()])}
                >
                  + Aggiungi
                </button>
              </div>

              {extraActivities.map((activity) => (
                <div className="genplan-extra__row" key={activity.id}>
                  <select
                    value={activity.type}
                    onChange={(event) =>
                      setExtraActivities((current) =>
                        current.map((item) =>
                          item.id === activity.id ? { ...item, type: event.target.value } : item,
                        ),
                      )
                    }
                  >
                    <option value="swimming">Nuoto</option>
                    <option value="running">Corsa</option>
                    <option value="cycling">Bici</option>
                    <option value="cardio">Cardio</option>
                    <option value="other">Altro</option>
                  </select>

                  <label>
                    Volte/sett.
                    <input
                      type="number"
                      min="1"
                      max="7"
                      value={activity.sessionsPerWeek}
                      onChange={(event) =>
                        setExtraActivities((current) =>
                          current.map((item) =>
                            item.id === activity.id
                              ? { ...item, sessionsPerWeek: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>

                  <label>
                    Minuti
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={activity.durationMinutes}
                      onChange={(event) =>
                        setExtraActivities((current) =>
                          current.map((item) =>
                            item.id === activity.id
                              ? { ...item, durationMinutes: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>

                  <label>
                    Intensità
                    <select
                      value={activity.intensity}
                      onChange={(event) =>
                        setExtraActivities((current) =>
                          current.map((item) =>
                            item.id === activity.id
                              ? { ...item, intensity: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="low">Bassa</option>
                      <option value="moderate">Moderata</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="genplan-extra__remove"
                    aria-label="Rimuovi attività"
                    onClick={() =>
                      setExtraActivities((current) => current.filter((item) => item.id !== activity.id))
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="genplan-primary"
              disabled={generating || !profile?.height_cm || !profile?.current_weight_kg}
              onClick={() => void handleGenerate()}
            >
              {generating ? "Genero la scheda..." : "Genera con AI"}
            </button>
          </section>
        ) : (
          <>
            <section className="genplan-panel">
              <h2>Dai un nome alla scheda</h2>
              <div className="genplan-grid">
                <label>
                  Nome
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  Durata (settimane)
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={durationWeeks}
                    onChange={(event) => setDurationWeeks(event.target.value)}
                  />
                </label>
                <label>
                  Data inizio (opzionale)
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </label>
              </div>

              <div className="genplan-preview-actions">
                <button
                  type="button"
                  className="genplan-secondary"
                  disabled={creating}
                  onClick={() => setGeneratedDays(null)}
                >
                  Rigenera
                </button>
                <button
                  type="button"
                  className="genplan-primary"
                  disabled={creating}
                  onClick={() => void handleCreateMesocycle()}
                >
                  {creating ? "Creo la scheda..." : "Crea la scheda"}
                </button>
              </div>
            </section>

            <section className="genplan-days">
              {generatedDays.map((day) => (
                <article className="genplan-day" key={day.day_code}>
                  <h3>
                    Giorno {day.day_code} — {day.title}
                  </h3>
                  <ul>
                    {day.exercises.map((exercise, index) => (
                      <li key={`${day.day_code}-${index}`}>
                        <strong>{exercise.exercise_name}</strong>
                        <span>
                          {exercise.sets} serie · {exercise.reps_min}-{exercise.reps_max} reps ·{" "}
                          {exercise.rest_seconds}s recupero
                          {exercise.tut ? ` · TUT ${exercise.tut}` : ""}
                        </span>
                        {exercise.notes && <em>{exercise.notes}</em>}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}

              {extraActivities.length > 0 && (
                <article className="genplan-day">
                  <h3>Altre attività</h3>
                  <ul>
                    {extraActivities.map((activity) => (
                      <li key={activity.id}>
                        <strong>{ACTIVITY_LABEL[activity.type] ?? activity.type}</strong>
                        <span>
                          {activity.sessionsPerWeek}×/settimana · {activity.durationMinutes || "—"}{" "}
                          min · intensità {activity.intensity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
