"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import MiniLineChart from "./MiniLineChart";
import "./exercise-progress.css";
import "./progress-history.css";

type SetRow = {
  session_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
};

type ExercisePoint = {
  sessionId: string;
  date: string;
  value: number;
  sets: { set_number: number; reps: number | null; weight_kg: number | null }[];
};

function formatLongDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function niceValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function ExerciseProgress({ userId }: { userId: string }) {
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [selectedExercise, setSelectedExercise] = useState("");
  const [points, setPoints] = useState<ExercisePoint[]>([]);
  const [metricIsWeight, setMetricIsWeight] = useState(true);
  const [loadingNames, setLoadingNames] = useState(true);
  const [loadingPoints, setLoadingPoints] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadNames() {
      const { data } = await supabase
        .from("session_exercises")
        .select("exercise_name")
        .eq("user_id", userId);

      if (!active) return;

      const names = Array.from(
        new Set((data ?? []).map((row) => row.exercise_name as string)),
      ).sort((a, b) => a.localeCompare(b, "it"));

      setExerciseNames(names);
      setSelectedExercise((current) => current || names[0] || "");
      setLoadingNames(false);
    }

    void loadNames();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    // selectedExercise parte da "" solo finché i nomi non sono caricati:
    // points è già [] in quel momento, non serve azzerarlo qui.
    if (!selectedExercise) return;

    let active = true;

    async function loadPoints() {
      setLoadingPoints(true);

      const { data: exerciseRows } = await supabase
        .from("session_exercises")
        .select("id,session_id")
        .eq("user_id", userId)
        .eq("exercise_name", selectedExercise);

      const rows = exerciseRows ?? [];

      if (!rows.length) {
        if (active) {
          setPoints([]);
          setLoadingPoints(false);
        }
        return;
      }

      const sessionIds = Array.from(new Set(rows.map((row) => row.session_id as string)));
      const exerciseIds = rows.map((row) => row.id as string);

      const [sessionsRes, setsRes] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("id,performed_at")
          .eq("user_id", userId)
          .in("id", sessionIds),
        supabase
          .from("performed_sets")
          .select("session_exercise_id,set_number,reps,weight_kg")
          .eq("user_id", userId)
          .in("session_exercise_id", exerciseIds)
          .order("set_number", { ascending: true }),
      ]);

      if (!active) return;

      const sessionDate = new Map<string, string>();
      (sessionsRes.data ?? []).forEach((session) =>
        sessionDate.set(session.id as string, session.performed_at as string),
      );

      const exerciseToSession = new Map<string, string>();
      rows.forEach((row) => exerciseToSession.set(row.id as string, row.session_id as string));

      const setsBySession = new Map<string, SetRow[]>();
      ((setsRes.data ?? []) as SetRow[]).forEach((set) => {
        const sessionId = exerciseToSession.get(set.session_exercise_id);
        if (!sessionId) return;
        setsBySession.set(sessionId, [...(setsBySession.get(sessionId) ?? []), set]);
      });

      const hasWeightData = ((setsRes.data ?? []) as SetRow[]).some(
        (set) => set.weight_kg !== null,
      );

      const built: ExercisePoint[] = [];

      setsBySession.forEach((sets, sessionId) => {
        const date = sessionDate.get(sessionId);
        if (!date) return;

        const validSets = sets.filter((set) => set.reps !== null && set.reps > 0);
        if (!validSets.length) return;

        const top = validSets.reduce((best, current) => {
          const bestValue = hasWeightData ? best.weight_kg ?? -1 : best.reps ?? 0;
          const currentValue = hasWeightData ? current.weight_kg ?? -1 : current.reps ?? 0;
          return currentValue > bestValue ? current : best;
        });

        built.push({
          sessionId,
          date,
          value: hasWeightData ? top.weight_kg ?? 0 : top.reps ?? 0,
          sets: [...sets].sort((a, b) => a.set_number - b.set_number),
        });
      });

      built.sort((a, b) => a.date.localeCompare(b.date));

      if (active) {
        setMetricIsWeight(hasWeightData);
        setPoints(built);
        setLoadingPoints(false);
      }
    }

    void loadPoints();
    return () => {
      active = false;
    };
  }, [userId, selectedExercise]);

  const unit = metricIsWeight ? "kg" : "reps";
  const chartPoints = useMemo(
    () => points.map((point) => ({ key: point.sessionId, date: point.date, value: point.value })),
    [points],
  );

  return (
    <div className="progress-card exercise-progress">
      <div className="progress-card__header">
        <h3>Progressione esercizi</h3>
      </div>

      {loadingNames ? (
        <p className="progress-note">Caricamento...</p>
      ) : !exerciseNames.length ? (
        <p className="progress-note">
          Registra qualche serie in un allenamento per vedere qui l&apos;andamento di un esercizio.
        </p>
      ) : (
        <>
          <div className="exercise-progress__filters">
            <label>
              Esercizio
              <select
                value={selectedExercise}
                onChange={(event) => setSelectedExercise(event.target.value)}
              >
                {exerciseNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loadingPoints ? (
            <p className="progress-note">Caricamento andamento...</p>
          ) : !points.length ? (
            <p className="progress-note">
              Nessuna serie registrata per questo esercizio con ripetizioni valide.
            </p>
          ) : (
            <>
              <MiniLineChart points={chartPoints} unit={unit} />

              <div className="progress-history">
                <p className="progress-history__title">Storico</p>
                {[...points].reverse().map((point) => (
                  <div className="progress-history__row" key={point.sessionId}>
                    <span className="progress-history__primary">
                      {formatLongDate(point.date)}
                    </span>
                    <span className="progress-history__secondary">
                      {point.sets
                        .map((set) =>
                          set.weight_kg !== null
                            ? `${niceValue(set.weight_kg)} kg × ${set.reps ?? "—"}`
                            : `${set.reps ?? "—"} reps`,
                        )
                        .join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
