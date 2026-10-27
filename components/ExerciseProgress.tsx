"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./exercise-progress.css";

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

const VBW = 640;
const VBH = 230;
const MARGIN = { top: 28, right: 14, bottom: 30, left: 38 };
const PLOT_W = VBW - MARGIN.left - MARGIN.right;
const PLOT_H = VBH - MARGIN.top - MARGIN.bottom;

function formatShortDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });
}

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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

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
      setHoverIndex(null);

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

  const chart = useMemo(() => {
    if (!points.length) return null;

    const values = points.map((point) => point.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = rawMax === rawMin ? Math.max(1, rawMax * 0.1) : (rawMax - rawMin) * 0.15;
    const yMin = Math.max(0, rawMin - padding);
    const yMax = rawMax + padding;

    const xForIndex = (index: number) =>
      points.length === 1
        ? MARGIN.left + PLOT_W / 2
        : MARGIN.left + (index / (points.length - 1)) * PLOT_W;

    const yForValue = (value: number) =>
      MARGIN.top + (1 - (value - yMin) / (yMax - yMin || 1)) * PLOT_H;

    const coords = points.map((point, index) => ({
      x: xForIndex(index),
      y: yForValue(point.value),
      point,
    }));

    const linePath = coords
      .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
      .join(" ");

    const gridValues = [yMin, (yMin + yMax) / 2, yMax];

    return { coords, linePath, gridValues, yMin, yMax };
  }, [points]);

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!chart || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = VBW / rect.width;
    const xInViewBox = (event.clientX - rect.left) * scaleX;

    let nearest = 0;
    let nearestDistance = Infinity;
    chart.coords.forEach((coord, index) => {
      const distance = Math.abs(coord.x - xInViewBox);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });

    setHoverIndex(nearest);
  }

  const unit = metricIsWeight ? "kg" : "reps";
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredCoord = hoverIndex !== null && chart ? chart.coords[hoverIndex] : null;

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
              <svg
                ref={svgRef}
                className="exercise-progress__chart"
                viewBox={`0 0 ${VBW} ${VBH}`}
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoverIndex(null)}
              >
                {chart?.gridValues.map((value, index) => {
                  const y = MARGIN.top + (1 - (value - chart.yMin) / (chart.yMax - chart.yMin || 1)) * PLOT_H;
                  return (
                    <g key={index}>
                      <line
                        x1={MARGIN.left}
                        x2={VBW - MARGIN.right}
                        y1={y}
                        y2={y}
                        className="exercise-progress__grid"
                      />
                      <text x={MARGIN.left - 8} y={y} className="exercise-progress__axis-label" textAnchor="end" dominantBaseline="middle">
                        {niceValue(value)}
                      </text>
                    </g>
                  );
                })}

                {chart && (
                  <>
                    <text
                      x={MARGIN.left}
                      y={VBH - 8}
                      className="exercise-progress__axis-label"
                      textAnchor="start"
                    >
                      {formatShortDate(points[0].date)}
                    </text>
                    <text
                      x={VBW - MARGIN.right}
                      y={VBH - 8}
                      className="exercise-progress__axis-label"
                      textAnchor="end"
                    >
                      {formatShortDate(points[points.length - 1].date)}
                    </text>

                    <path d={chart.linePath} className="exercise-progress__line" />

                    {hoveredCoord && (
                      <line
                        x1={hoveredCoord.x}
                        x2={hoveredCoord.x}
                        y1={MARGIN.top}
                        y2={VBH - MARGIN.bottom}
                        className="exercise-progress__crosshair"
                      />
                    )}

                    {chart.coords.map((coord, index) => (
                      <circle
                        key={coord.point.sessionId}
                        cx={coord.x}
                        cy={coord.y}
                        r={index === hoverIndex || index === chart.coords.length - 1 ? 5 : 4}
                        className="exercise-progress__dot"
                      />
                    ))}

                    <text
                      x={chart.coords[chart.coords.length - 1].x}
                      y={chart.coords[chart.coords.length - 1].y - 12}
                      className="exercise-progress__end-label"
                      textAnchor="end"
                    >
                      {niceValue(points[points.length - 1].value)} {unit}
                    </text>

                    {hovered && hoveredCoord && (
                      <g transform={`translate(${Math.min(Math.max(hoveredCoord.x, MARGIN.left + 55), VBW - MARGIN.right - 55)}, ${Math.max(hoveredCoord.y - 44, MARGIN.top)})`}>
                        <rect x={-55} y={-26} width={110} height={40} rx={8} className="exercise-progress__tooltip-box" />
                        <text x={0} y={-10} textAnchor="middle" className="exercise-progress__tooltip-value">
                          {niceValue(hovered.value)} {unit}
                        </text>
                        <text x={0} y={6} textAnchor="middle" className="exercise-progress__tooltip-date">
                          {formatShortDate(hovered.date)}
                        </text>
                      </g>
                    )}
                  </>
                )}
              </svg>

              <div className="exercise-progress__history">
                <p className="exercise-progress__history-title">Storico</p>
                {[...points].reverse().map((point) => (
                  <div className="exercise-progress__history-row" key={point.sessionId}>
                    <span className="exercise-progress__history-date">
                      {formatLongDate(point.date)}
                    </span>
                    <span className="exercise-progress__history-sets">
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
