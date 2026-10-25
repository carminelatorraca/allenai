
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import "./plan-detail.css";

type Exercise = {
  id: string;
  mesocycle_day_id: string;
  exercise_name: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  target_weight_kg: number | null;
  tut: string | null;
  rest_seconds: number | null;
  notes: string | null;
  sort_order: number;
};

type TrainingDay = {
  id: string;
  week_id: string;
  day_code: string;
  title: string;
  activity_type: string | null;
  notes: string | null;
  sort_order: number;
  duration_minutes: number | null;
  intensity: string | null;
  estimated_calories: number | null;
  exercises: Exercise[];
};

const INTENSITY_LABEL: Record<string, string> = {
  low: "bassa",
  moderate: "moderata",
  high: "alta",
};

type Week = {
  id: string;
  week_number: number;
  notes: string | null;
  days: TrainingDay[];
};

type Mesocycle = {
  id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  duration_weeks: number;
  status: string;
};

type ExerciseForm = {
  exercise_name: string;
  sets: string;
  reps_min: string;
  reps_max: string;
  target_weight_kg: string;
  tut: string;
  rest_seconds: string;
  notes: string;
  apply_to_other_weeks: boolean;
};

const emptyForm: ExerciseForm = {
  exercise_name: "",
  sets: "3",
  reps_min: "8",
  reps_max: "12",
  target_weight_kg: "",
  tut: "",
  rest_seconds: "90",
  notes: "",
  apply_to_other_weeks: false,
};

export default function MesocycleDetail({
  mesocycleId,
}: {
  mesocycleId: string;
}) {
  const [mesocycle, setMesocycle] = useState<Mesocycle | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<TrainingDay | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState<ExerciseForm>(emptyForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Devi effettuare l'accesso.");

      const { data: mesocycleData, error: mesocycleError } =
        await supabase
          .from("mesocycles")
          .select("*")
          .eq("id", mesocycleId)
          .eq("user_id", user.id)
          .single();

      if (mesocycleError) throw mesocycleError;

      const { data: weekData, error: weekError } = await supabase
        .from("mesocycle_weeks")
        .select("*")
        .eq("mesocycle_id", mesocycleId)
        .eq("user_id", user.id)
        .order("week_number", { ascending: true });

      if (weekError) throw weekError;

      const weekIds = (weekData ?? []).map((week) => week.id);

      let dayData: any[] = [];

      if (weekIds.length > 0) {
        const { data, error: dayError } = await supabase
          .from("mesocycle_days")
          .select("*")
          .in("week_id", weekIds)
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true });

        if (dayError) throw dayError;
        dayData = data ?? [];
      }

      const dayIds = dayData.map((day) => day.id);

      let exerciseData: Exercise[] = [];

      if (dayIds.length > 0) {
        const { data, error: exerciseError } = await supabase
          .from("exercise_prescriptions")
          .select("*")
          .in("mesocycle_day_id", dayIds)
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true });

        if (exerciseError) throw exerciseError;
        exerciseData = (data ?? []) as Exercise[];
      }

      const daysWithExercises: TrainingDay[] = dayData.map((day) => ({
        ...day,
        exercises: exerciseData.filter(
          (exercise) => exercise.mesocycle_day_id === day.id
        ),
      }));

      const weeksWithDays: Week[] = (weekData ?? []).map((week) => ({
        ...week,
        days: daysWithExercises.filter((day) => day.week_id === week.id),
      }));

      setMesocycle(mesocycleData as Mesocycle);
      setWeeks(weeksWithDays);
    } catch (err) {
      console.error("Errore caricamento mesociclo:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Si è verificato un errore durante il caricamento."
      );
    } finally {
      setLoading(false);
    }
  }, [mesocycleId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openNewExercise(day: TrainingDay) {
    setSelectedDay(day);
    setEditingExercise(null);
    setForm(emptyForm);
    setMessage("");
    setModalOpen(true);
  }

  function openEditExercise(day: TrainingDay, exercise: Exercise) {
    setSelectedDay(day);
    setEditingExercise(exercise);
    setForm({
      exercise_name: exercise.exercise_name,
      sets: String(exercise.sets),
      reps_min: String(exercise.reps_min),
      reps_max: String(exercise.reps_max),
      target_weight_kg:
        exercise.target_weight_kg == null
          ? ""
          : String(exercise.target_weight_kg),
      tut: exercise.tut ?? "",
      rest_seconds:
        exercise.rest_seconds == null
          ? ""
          : String(exercise.rest_seconds),
      notes: exercise.notes ?? "",
      apply_to_other_weeks: false,
    });
    setMessage("");
    setModalOpen(true);
  }

  function updateForm<K extends keyof ExerciseForm>(
    key: K,
    value: ExerciseForm[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveExercise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDay || !form.exercise_name.trim()) {
      setError("Inserisci il nome dell'esercizio.");
      return;
    }

    const sets = Number(form.sets);
    const repsMin = Number(form.reps_min);
    const repsMax = Number(form.reps_max);
    const weight =
      form.target_weight_kg.trim() === ""
        ? null
        : Number(form.target_weight_kg);
    const rest =
      form.rest_seconds.trim() === ""
        ? null
        : Number(form.rest_seconds);

    if (
      !Number.isInteger(sets) ||
      sets < 1 ||
      !Number.isInteger(repsMin) ||
      repsMin < 1 ||
      !Number.isInteger(repsMax) ||
      repsMax < repsMin
    ) {
      setError("Controlla serie e ripetizioni inserite.");
      return;
    }

    if (
      (weight !== null && (!Number.isFinite(weight) || weight < 0)) ||
      (rest !== null && (!Number.isInteger(rest) || rest < 0))
    ) {
      setError("Controlla il peso e il recupero inseriti.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Devi effettuare l'accesso.");

      const exercisePayload = {
        exercise_name: form.exercise_name.trim(),
        sets,
        reps_min: repsMin,
        reps_max: repsMax,
        target_weight_kg: weight,
        tut: form.tut.trim() || null,
        rest_seconds: rest,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingExercise) {
        const { error: updateError } = await supabase
          .from("exercise_prescriptions")
          .update(exercisePayload)
          .eq("id", editingExercise.id)
          .eq("user_id", user.id);

        if (updateError) throw updateError;

        setMessage("Esercizio aggiornato.");
      } else {
        const dayIds = form.apply_to_other_weeks
          ? weeks
              .flatMap((week) => week.days)
              .filter(
                (day) =>
                  day.day_code === selectedDay.day_code &&
                  day.id !== selectedDay.id
              )
              .map((day) => day.id)
              .concat(selectedDay.id)
          : [selectedDay.id];

        const rows = dayIds.map((dayId) => ({
          ...exercisePayload,
          mesocycle_day_id: dayId,
          user_id: user.id,
          sort_order:
            Math.max(
              -1,
              ...(weeks
                .flatMap((week) => week.days)
                .find((day) => day.id === dayId)
                ?.exercises.map((exercise) => exercise.sort_order) ?? [])
            ) + 1,
        }));

        const { error: insertError } = await supabase
          .from("exercise_prescriptions")
          .insert(rows);

        if (insertError) throw insertError;

        setMessage(
          rows.length > 1
            ? "Esercizio aggiunto ai giorni corrispondenti delle settimane."
            : "Esercizio aggiunto."
        );
      }

      setModalOpen(false);
      await loadData();
    } catch (err) {
      console.error("Errore salvataggio esercizio:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile salvare l'esercizio."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteExercise(exercise: Exercise) {
    const confirmed = window.confirm(
      `Vuoi eliminare "${exercise.exercise_name}"?`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Devi effettuare l'accesso.");

      const { error: deleteError } = await supabase
        .from("exercise_prescriptions")
        .delete()
        .eq("id", exercise.id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      setMessage("Esercizio eliminato.");
      await loadData();
    } catch (err) {
      console.error("Errore eliminazione esercizio:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile eliminare l'esercizio."
      );
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="plan-detail__loading">Caricamento mesociclo...</div>
      </AppShell>
    );
  }

  if (error && !mesocycle) {
    return (
      <AppShell>
        <main className="plan-detail">
          <a className="plan-detail__back" href="/plan">
            ← Torna ai programmi
          </a>
          <p className="plan-detail__message plan-detail__message--error">
            {error}
          </p>
        </main>
      </AppShell>
    );
  }

  if (!mesocycle) {
    return (
      <AppShell>
        <main className="plan-detail">
          <a className="plan-detail__back" href="/plan">
            ← Torna ai programmi
          </a>
          <p className="plan-detail__empty">Mesociclo non trovato.</p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <main className="plan-detail">
      <a className="plan-detail__back" href="/plan">
        ← Torna ai programmi
      </a>

      <header className="plan-detail__header">
        <div>
          <p className="plan-detail__eyebrow">IL TUO PROGRAMMA</p>
          <h1 className="plan-detail__title">{mesocycle.name}</h1>

          <p className="plan-detail__subtitle">
            {mesocycle.goal || "Nessun obiettivo specificato"}
            {" · "}
            {mesocycle.duration_weeks} settimane
            {mesocycle.start_date
              ? ` · Inizio ${new Date(
                  `${mesocycle.start_date}T00:00:00`
                ).toLocaleDateString("it-IT")}`
              : ""}
          </p>
        </div>

        <span className="plan-detail__status">{mesocycle.status}</span>
      </header>

      {message && (
        <p className="plan-detail__message">{message}</p>
      )}

      {error && (
        <p className="plan-detail__message plan-detail__message--error">
          {error}
        </p>
      )}

      {weeks.length === 0 ? (
        <section className="plan-detail__empty">
          <h2>Nessuna settimana disponibile</h2>
          <p>
            Questo mesociclo non contiene ancora settimane o giorni di
            allenamento.
          </p>
        </section>
      ) : (
        weeks.map((week, weekIndex) => (
          <details className="plan-detail__week" key={week.id} open={weekIndex === 0}>
            <summary className="plan-detail__week-title">
              Settimana {week.week_number}
              <span className="plan-detail__week-chevron" aria-hidden="true">
                ›
              </span>
            </summary>

            {week.notes && <p>{week.notes}</p>}

            {week.days.length === 0 ? (
              <p className="plan-detail__empty">
                Nessun giorno configurato per questa settimana.
              </p>
            ) : (
              <div className="plan-detail__days">
                {week.days.map((day) => (
                  <article className="plan-detail__day" key={day.id}>
                    <div className="plan-detail__day-header">
                      <div>
                        <h3 className="plan-detail__day-title">
                          {day.title || day.day_code}
                        </h3>
                        <p className="plan-detail__day-description">
                          {day.activity_type || "Allenamento"}
                          {day.duration_minutes ? ` · ${day.duration_minutes} min` : ""}
                          {day.intensity ? ` · intensità ${INTENSITY_LABEL[day.intensity] ?? day.intensity}` : ""}
                          {day.estimated_calories ? ` · ≈${day.estimated_calories} kcal` : ""}
                          {day.notes ? ` · ${day.notes}` : ""}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="plan-detail__button plan-detail__button--primary"
                        onClick={() => openNewExercise(day)}
                      >
                        + Esercizio
                      </button>
                    </div>

                    {day.exercises.length === 0 ? (
                      <p className="plan-detail__empty">
                        Nessun esercizio inserito.
                      </p>
                    ) : (
                      <div className="plan-detail__exercises">
                        {day.exercises.map((exercise) => (
                          <div
                            className="plan-detail__exercise"
                            key={exercise.id}
                          >
                            <div>
                              <h4 className="plan-detail__exercise-name">
                                {exercise.exercise_name}
                              </h4>

                              <div className="plan-detail__exercise-stats">
                                <span className="plan-detail__stat">
                                  {exercise.sets} serie
                                </span>
                                <span className="plan-detail__stat">
                                  {exercise.reps_min === exercise.reps_max
                                    ? `${exercise.reps_min} ripetizioni`
                                    : `${exercise.reps_min}-${exercise.reps_max} ripetizioni`}
                                </span>

                                {exercise.target_weight_kg !== null && (
                                  <span className="plan-detail__stat">
                                    {exercise.target_weight_kg} kg
                                  </span>
                                )}

                                {exercise.tut && (
                                  <span className="plan-detail__stat">
                                    TUT {exercise.tut}
                                  </span>
                                )}

                                {exercise.rest_seconds !== null && (
                                  <span className="plan-detail__stat">
                                    Recupero {exercise.rest_seconds}s
                                  </span>
                                )}
                              </div>

                              {exercise.notes && (
                                <p className="plan-detail__exercise-notes">
                                  {exercise.notes}
                                </p>
                              )}
                            </div>

                            <div className="plan-detail__actions">
                              <button
                                type="button"
                                className="plan-detail__button"
                                onClick={() => openEditExercise(day, exercise)}
                              >
                                Modifica
                              </button>

                              <button
                                type="button"
                                className="plan-detail__button plan-detail__button--danger"
                                onClick={() => void deleteExercise(exercise)}
                              >
                                Elimina
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </details>
        ))
      )}

      {modalOpen && selectedDay && (
        <div className="plan-detail__overlay">
          <section
            className="plan-detail__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exercise-modal-title"
          >
            <div className="plan-detail__modal-header">
              <div>
                <h2
                  className="plan-detail__modal-title"
                  id="exercise-modal-title"
                >
                  {editingExercise ? "Modifica esercizio" : "Nuovo esercizio"}
                </h2>
                <p>{selectedDay.title || selectedDay.day_code}</p>
              </div>

              <button
                type="button"
                className="plan-detail__button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Chiudi
              </button>
            </div>

            <form className="plan-detail__form" onSubmit={saveExercise}>
              <div className="plan-detail__field">
                <label className="plan-detail__label" htmlFor="exercise-name">
                  Nome esercizio *
                </label>
                <input
                  id="exercise-name"
                  className="plan-detail__input"
                  value={form.exercise_name}
                  onChange={(event) =>
                    updateForm("exercise_name", event.target.value)
                  }
                  placeholder="Es. Panca piana con bilanciere"
                  required
                />
              </div>

              <div className="plan-detail__form-grid">
                <div className="plan-detail__field">
                  <label className="plan-detail__label" htmlFor="sets">
                    Serie *
                  </label>
                  <input
                    id="sets"
                    className="plan-detail__input"
                    type="number"
                    min="1"
                    step="1"
                    value={form.sets}
                    onChange={(event) => updateForm("sets", event.target.value)}
                    required
                  />
                </div>

                <div className="plan-detail__field">
                  <label className="plan-detail__label" htmlFor="reps-min">
                    Ripetizioni min *
                  </label>
                  <input
                    id="reps-min"
                    className="plan-detail__input"
                    type="number"
                    min="1"
                    step="1"
                    value={form.reps_min}
                    onChange={(event) =>
                      updateForm("reps_min", event.target.value)
                    }
                    required
                  />
                </div>

                <div className="plan-detail__field">
                  <label className="plan-detail__label" htmlFor="reps-max">
                    Ripetizioni max *
                  </label>
                  <input
                    id="reps-max"
                    className="plan-detail__input"
                    type="number"
                    min="1"
                    step="1"
                    value={form.reps_max}
                    onChange={(event) =>
                      updateForm("reps_max", event.target.value)
                    }
                    required
                  />
                </div>

                <div className="plan-detail__field">
                  <label className="plan-detail__label" htmlFor="weight">
                    Peso target (kg)
                  </label>
                  <input
                    id="weight"
                    className="plan-detail__input"
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.target_weight_kg}
                    onChange={(event) =>
                      updateForm("target_weight_kg", event.target.value)
                    }
                    placeholder="Es. 40"
                  />
                </div>

                <div className="plan-detail__field">
                  <label className="plan-detail__label" htmlFor="tut">
                    TUT
                  </label>
                  <input
                    id="tut"
                    className="plan-detail__input"
                    value={form.tut}
                    onChange={(event) => updateForm("tut", event.target.value)}
                    placeholder="Es. 3-1-1"
                  />
                </div>

                <div className="plan-detail__field">
                  <label className="plan-detail__label" htmlFor="rest">
                    Recupero (secondi)
                  </label>
                  <input
                    id="rest"
                    className="plan-detail__input"
                    type="number"
                    min="0"
                    step="1"
                    value={form.rest_seconds}
                    onChange={(event) =>
                      updateForm("rest_seconds", event.target.value)
                    }
                    placeholder="Es. 90"
                  />
                </div>
              </div>

              <div className="plan-detail__field">
                <label className="plan-detail__label" htmlFor="exercise-notes">
                  Note
                </label>
                <textarea
                  id="exercise-notes"
                  className="plan-detail__input"
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  rows={3}
                  placeholder="Tecnica, RPE o altre indicazioni..."
                />
              </div>

              {!editingExercise && (
                <label className="plan-detail__checkbox">
                  <input
                    type="checkbox"
                    checked={form.apply_to_other_weeks}
                    onChange={(event) =>
                      updateForm("apply_to_other_weeks", event.target.checked)
                    }
                  />
                  Aggiungi anche ai giorni corrispondenti delle altre settimane
                </label>
              )}

              {error && (
                <p className="plan-detail__message plan-detail__message--error">
                  {error}
                </p>
              )}

              <div className="plan-detail__modal-footer">
                <button
                  type="button"
                  className="plan-detail__button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Annulla
                </button>

                <button
                  type="submit"
                  className="plan-detail__button plan-detail__button--primary"
                  disabled={saving}
                >
                  {saving
                    ? "Salvataggio..."
                    : editingExercise
                      ? "Salva modifiche"
                      : "Aggiungi esercizio"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
    </AppShell>
  );
}
