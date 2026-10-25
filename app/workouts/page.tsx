
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { TimerIcon, TrashIcon } from "@/components/icons";
import { estimateSessionCalories } from "@/lib/activity";
import "./workouts.css";

type TrainingDay = {
  id: string;
  title: string;
  day_code: string | null;
  sort_order: number;
  week_number: number;
  mesocycle_name: string;
  mesocycle_id: string;
  activity_type?: string | null;
  duration_minutes?: number | null;
  intensity?: string | null;
};

type Prescription = {
  id: string;
  exercise_name: string;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  target_weight_kg: number | null;
  tut: string | null;
  rest_seconds: number | null;
  notes: string | null;
  sort_order: number;
};

type Session = {
  id: string;
  mesocycle_day_id?: string | null;
  title: string;
  performed_at: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  created_at?: string | null;
  notes: string | null;
  actual_duration_minutes?: number | null;
  actual_distance_km?: number | null;
  actual_intensity?: string | null;
  actual_calories?: number | null;
};

type SessionExercise = {
  id: string;
  session_id?: string;
  exercise_name: string;
  planned_sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  target_weight_kg: number | null;
  tut: string | null;
  rest_seconds: number | null;
  notes: string | null;
  sort_order: number;
};

type PerformedSet = {
  id: string;
  session_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  completed: boolean;
};

type SetDraft = {
  reps: string;
  weight_kg: string;
  rpe: string;
  completed: boolean;
};

type DisplayStatus = "not_started" | "partial" | "completed";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function hasEnteredData(draft: SetDraft | undefined) {
  return Boolean(
    draft &&
      (draft.reps.trim() !== "" ||
        draft.weight_kg.trim() !== "" ||
        draft.rpe.trim() !== ""),
  );
}

function hasValidReps(draft: SetDraft | undefined) {
  if (!draft || draft.reps.trim() === "") return false;
  const reps = Number(draft.reps);
  return Number.isInteger(reps) && reps > 0;
}

function compareSessionsNewestFirst(a: Session, b: Session) {
  const dateComparison = b.performed_at.localeCompare(a.performed_at);
  if (dateComparison !== 0) return dateComparison;

  return (b.started_at ?? b.created_at ?? "").localeCompare(
    a.started_at ?? a.created_at ?? "",
  );
}

function findLogicalDayIndex(days: TrainingDay[], target: TrainingDay) {
  if (target.day_code) {
    const byCode = days.findIndex((day) => day.day_code === target.day_code);
    if (byCode >= 0) return byCode;
  }

  return days.findIndex((day) => day.sort_order === target.sort_order);
}

export default function WorkoutsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [days, setDays] = useState<TrainingDay[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [displayStatuses, setDisplayStatuses] = useState<Record<string, DisplayStatus>>({});
  const [selectedDay, setSelectedDay] = useState("");
  const [trainingDate, setTrainingDate] = useState("");

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [sets, setSets] = useState<PerformedSet[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const [cardioDuration, setCardioDuration] = useState("");
  const [cardioDistance, setCardioDistance] = useState("");
  const [cardioIntensity, setCardioIntensity] = useState("moderate");
  const [cardioNotes, setCardioNotes] = useState("");
  const [cardioSaving, setCardioSaving] = useState(false);
  const [userWeight, setUserWeight] = useState<number | null>(null);

  const [restTimer, setRestTimer] = useState<{
    exerciseName: string;
    totalSeconds: number;
    secondsLeft: number;
  } | null>(null);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latestDrafts = useRef<Record<string, SetDraft>>({});
  const activeSessionRef = useRef<Session | null>(null);
  const userIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const savingSetIdsRef = useRef(new Set<string>());
  const savePromisesRef = useRef<Record<string, Promise<void>>>({});
  const saveErrorsRef = useRef<Record<string, string>>({});
  const urlDayRef = useRef<string | null>(null);

  const showError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage("");
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage("");
  };

  const setSetError = (setId: string, message: string | null) => {
    const next = { ...saveErrorsRef.current };

    if (message) next[setId] = message;
    else delete next[setId];

    saveErrorsRef.current = next;
    if (mountedRef.current) setSaveErrors(next);
  };

  const loadSessions = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("*")
      .eq("user_id", uid)
      .order("performed_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const loaded = (data ?? []) as Session[];
    setSessions(loaded);

    const statuses: Record<string, DisplayStatus> = {};

    if (loaded.length) {
      const { data: exerciseRows, error: exerciseError } = await supabase
        .from("session_exercises")
        .select("id,session_id")
        .eq("user_id", uid)
        .in("session_id", loaded.map((session) => session.id));

      if (exerciseError) throw exerciseError;

      const allExercises = exerciseRows ?? [];
      let allSets: {
        session_exercise_id: string;
        reps: number | null;
        weight_kg: number | null;
        rpe: number | null;
      }[] = [];

      if (allExercises.length) {
        const { data: setRows, error: setError } = await supabase
          .from("performed_sets")
          .select("session_exercise_id,reps,weight_kg,rpe")
          .eq("user_id", uid)
          .in("session_exercise_id", allExercises.map((exercise) => exercise.id));

        if (setError) throw setError;
        allSets = setRows ?? [];
      }

      for (const session of loaded) {
        if (session.status === "completed") {
          statuses[session.id] = "completed";
          continue;
        }

        const exerciseIds = allExercises
          .filter((exercise) => exercise.session_id === session.id)
          .map((exercise) => exercise.id);

        const hasData = allSets.some(
          (set) =>
            exerciseIds.includes(set.session_exercise_id) &&
            (set.reps !== null || set.weight_kg !== null || set.rpe !== null),
        );

        statuses[session.id] = hasData ? "partial" : "not_started";
      }
    }

    setDisplayStatuses(statuses);
  }, []);

  const loadTrainingDays = useCallback(async (uid: string) => {
    // Prima cerca i mesocicli attivi.
    const { data: activeMesocycles, error: activeError } = await supabase
      .from("mesocycles")
      .select("id,name,status,start_date,created_at")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("start_date", { ascending: false });

    if (activeError) throw activeError;

    let mesocycles = activeMesocycles ?? [];

    // Se non ce ne sono, usa l'ultimo mesociclo creato.
    if (mesocycles.length === 0) {
      const { data: latest, error: latestError } = await supabase
        .from("mesocycles")
        .select("id,name,status,start_date,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1);

      if (latestError) throw latestError;
      mesocycles = latest ?? [];
    }

    if (!mesocycles.length) {
      setDays([]);
      return;
    }

    // Mantiene un solo mesociclo, coerentemente con il calendario.
    const selectedMesocycle = mesocycles[0];

    const { data: weeks, error: weekError } = await supabase
      .from("mesocycle_weeks")
      .select("id,mesocycle_id,week_number")
      .eq("user_id", uid)
      .eq("mesocycle_id", selectedMesocycle.id)
      .order("week_number", { ascending: true });

    if (weekError) throw weekError;

    if (!weeks?.length) {
      setDays([]);
      return;
    }

    const { data: dayRows, error: dayError } = await supabase
      .from("mesocycle_days")
      .select("id,week_id,title,day_code,sort_order,activity_type,duration_minutes,intensity")
      .eq("user_id", uid)
      .in("week_id", weeks.map((week) => week.id))
      .order("sort_order", { ascending: true });

    if (dayError) throw dayError;

    const result: TrainingDay[] = (dayRows ?? [])
      .filter((day) => day.activity_type !== "rest")
      .map((day) => {
        const week = weeks.find((item) => item.id === day.week_id);

        return {
          id: day.id,
          title: day.title || day.day_code || "Allenamento",
          day_code: day.day_code,
          sort_order: day.sort_order,
          week_number: week?.week_number ?? 0,
          mesocycle_name: selectedMesocycle.name ?? "Mesociclo",
          mesocycle_id: selectedMesocycle.id,
          activity_type: day.activity_type,
          duration_minutes: day.duration_minutes,
          intensity: day.intensity,
        };
      })
      .sort(
        (a, b) =>
          a.week_number - b.week_number ||
          a.sort_order - b.sort_order,
      );

    setDays(result);
  }, []);

  const openSession = useCallback(async (session: Session, uid: string) => {
    setBusy(true);
    setErrorMessage("");

    try {
      // Non aprire un'altra sessione mentre ci sono salvataggi in sospeso.
      await flushPendingSaves();

      const { data: exerciseRows, error: exerciseError } = await supabase
        .from("session_exercises")
        .select("*")
        .eq("session_id", session.id)
        .eq("user_id", uid)
        .order("sort_order", { ascending: true });

      if (exerciseError) throw exerciseError;

      const loadedExercises = (exerciseRows ?? []) as SessionExercise[];
      let loadedSets: PerformedSet[] = [];

      if (loadedExercises.length) {
        const { data: setRows, error: setError } = await supabase
          .from("performed_sets")
          .select("*")
          .eq("user_id", uid)
          .in("session_exercise_id", loadedExercises.map((exercise) => exercise.id))
          .order("set_number", { ascending: true });

        if (setError) throw setError;
        loadedSets = (setRows ?? []) as PerformedSet[];
      }

      Object.values(saveTimers.current).forEach(clearTimeout);
      saveTimers.current = {};

      const initialDrafts: Record<string, SetDraft> = {};

      loadedSets.forEach((set) => {
        initialDrafts[set.id] = {
          reps: set.reps?.toString() ?? "",
          weight_kg: set.weight_kg?.toString() ?? "",
          rpe: set.rpe?.toString() ?? "",
          completed: set.completed,
        };
      });

      latestDrafts.current = initialDrafts;
      activeSessionRef.current = session;
      saveErrorsRef.current = {};

      setDrafts(initialDrafts);
      setSaveErrors({});
      setExercises(loadedExercises);
      setSets(loadedSets);
      setActiveSession(session);
      setTrainingDate(session.performed_at);

      if (session.mesocycle_day_id) {
        setSelectedDay(session.mesocycle_day_id);
      }

      const sessionDay = days.find((item) => item.id === session.mesocycle_day_id);
      setCardioDuration(session.actual_duration_minutes?.toString() ?? "");
      setCardioDistance(session.actual_distance_km?.toString() ?? "");
      setCardioIntensity(session.actual_intensity ?? sessionDay?.intensity ?? "moderate");
      setCardioNotes(session.notes ?? "");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Impossibile aprire la sessione.",
      );
    } finally {
      setBusy(false);
    }
  // flushPendingSaves is a function declaration and does not capture render state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
          router.replace("/");
          return;
        }

        const uid = data.user.id;
        userIdRef.current = uid;
        setUserId(uid);

        const { data: profileRow } = await supabase
          .from("profiles")
          .select("current_weight_kg")
          .eq("id", uid)
          .maybeSingle();
        setUserWeight(profileRow?.current_weight_kg ?? null);

        await Promise.all([loadTrainingDays(uid), loadSessions(uid)]);
      } catch (err) {
        showError(
          err instanceof Error ? err.message : "Errore durante il caricamento.",
        );
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    void initialize();

    return () => {
      mountedRef.current = false;
      Object.values(saveTimers.current).forEach(clearTimeout);
      saveTimers.current = {};
    };
  }, [router, loadTrainingDays, loadSessions]);

  // Legge /workouts?day=ID&date=YYYY-MM-DD.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dayId = params.get("day");
    const date = params.get("date");

    urlDayRef.current = dayId;

    if (dayId) setSelectedDay(dayId);

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setTrainingDate(date);
    } else {
      setTrainingDate(localDate());
    }
  }, []);

  const restTimerActive = restTimer !== null && restTimer.secondsLeft > 0;

  useEffect(() => {
    if (!restTimerActive) return;

    const id = setInterval(() => {
      setRestTimer((current) => {
        if (!current) return current;
        const secondsLeft = Math.max(0, current.secondsLeft - 1);
        if (secondsLeft === 0 && current.secondsLeft !== 0) {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate(300);
          }
        }
        return { ...current, secondsLeft };
      });
    }, 1000);

    return () => clearInterval(id);
  }, [restTimerActive]);

  /*
   * Se non è stata passata una giornata nell'URL:
   * 1. riprende la sessione in corso;
   * 2. altrimenti propone la giornata successiva al più recente allenamento;
   * 3. dopo l'ultima giornata riparte dall'inizio del ciclo.
   */
  useEffect(() => {
    if (!days.length || urlDayRef.current) return;

    const inProgress = sessions
      .filter((session) => session.status === "in_progress" && session.mesocycle_day_id)
      .sort(compareSessionsNewestFirst)[0];

    if (inProgress?.mesocycle_day_id) {
      const existingDay = days.find(
        (day) => day.id === inProgress.mesocycle_day_id,
      );

      if (existingDay) {
        setSelectedDay(existingDay.id);
        return;
      }
    }

    const startedSessions = sessions
      .filter(
        (session) =>
          session.mesocycle_day_id &&
          session.status !== "not_started" &&
          days.some((day) => day.id === session.mesocycle_day_id),
      )
      .sort(compareSessionsNewestFirst);

    const latestSession = startedSessions[0];

    if (!latestSession?.mesocycle_day_id) {
      const firstWeek = Math.min(...days.map((day) => day.week_number));
      const firstDay = days
        .filter((day) => day.week_number === firstWeek)
        .sort((a, b) => a.sort_order - b.sort_order)[0];

      if (firstDay) setSelectedDay(firstDay.id);
      return;
    }

    const previousDay = days.find(
      (day) => day.id === latestSession.mesocycle_day_id,
    );

    if (!previousDay) return;

    const sameMesocycleDays = days.filter(
      (day) => day.mesocycle_id === previousDay.mesocycle_id,
    );

    const firstWeek = Math.min(
      ...sameMesocycleDays.map((day) => day.week_number),
    );

    const cycle = sameMesocycleDays
      .filter((day) => day.week_number === firstWeek)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (!cycle.length) return;

    const index = findLogicalDayIndex(cycle, previousDay);

    if (index < 0) {
      setSelectedDay(cycle[0].id);
      return;
    }

    setSelectedDay(cycle[(index + 1) % cycle.length].id);
  }, [days, sessions]);

  async function startWorkout() {
    if (!userId || !selectedDay || !trainingDate || busy) return;

    setBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    let createdSessionId: string | null = null;

    try {
      const day = days.find((item) => item.id === selectedDay);
      if (!day) throw new Error("Giornata non trovata.");

      // performed_at è una colonna DATE: confronto con YYYY-MM-DD.
      const { data: existing, error: existingError } = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("mesocycle_day_id", selectedDay)
        .eq("performed_at", trainingDate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        await openSession(existing as Session, userId);
        showSuccess("Sessione esistente riaperta.");
        return;
      }

      if (day.activity_type && day.activity_type !== "gym") {
        const { data: cardioSession, error: cardioError } = await supabase
          .from("workout_sessions")
          .insert({
            user_id: userId,
            mesocycle_day_id: selectedDay,
            performed_at: trainingDate,
            started_at: new Date().toISOString(),
            title: day.title,
            status: "in_progress",
          })
          .select("*")
          .single();

        if (cardioError || !cardioSession) {
          throw new Error(cardioError?.message ?? "Impossibile avviare la sessione.");
        }

        await loadSessions(userId);
        await openSession(cardioSession as Session, userId);
        showSuccess("Sessione avviata.");
        return;
      }

      const { data: prescriptions, error: prescriptionError } = await supabase
        .from("exercise_prescriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("mesocycle_day_id", selectedDay)
        .order("sort_order", { ascending: true });

      if (prescriptionError) throw prescriptionError;

      const planned = (prescriptions ?? []) as Prescription[];

      if (!planned.length) {
        throw new Error("Questa giornata non contiene esercizi programmati.");
      }

      const { data: session, error: sessionError } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: userId,
          mesocycle_day_id: selectedDay,
          performed_at: trainingDate,
          started_at: new Date().toISOString(),
          title: day.title,
          status: "in_progress",
        })
        .select("*")
        .single();

      if (sessionError) throw sessionError;
      createdSessionId = session.id;

      const { data: createdExercises, error: exerciseError } = await supabase
        .from("session_exercises")
        .insert(
          planned.map((exercise) => ({
            session_id: session.id,
            prescription_id: exercise.id,
            user_id: userId,
            exercise_name: exercise.exercise_name,
            planned_sets: exercise.sets,
            reps_min: exercise.reps_min,
            reps_max: exercise.reps_max,
            target_weight_kg: exercise.target_weight_kg,
            tut: exercise.tut,
            rest_seconds: exercise.rest_seconds,
            notes: exercise.notes,
            sort_order: exercise.sort_order,
          })),
        )
        .select("id,planned_sets");

      if (exerciseError) throw exerciseError;

      const setPayload = (createdExercises ?? []).flatMap((exercise) =>
        Array.from(
          { length: Math.max(0, exercise.planned_sets ?? 0) },
          (_, index) => ({
            session_exercise_id: exercise.id,
            user_id: userId,
            set_number: index + 1,
            completed: false,
          }),
        ),
      );

      if (setPayload.length) {
        const { error: setError } = await supabase
          .from("performed_sets")
          .insert(setPayload);

        if (setError) throw setError;
      }

      await loadSessions(userId);
      await openSession(session as Session, userId);
      showSuccess("Allenamento avviato. Le modifiche si salvano automaticamente.");
    } catch (err) {
      if (createdSessionId) {
        const { data: partialExercises } = await supabase
          .from("session_exercises")
          .select("id")
          .eq("session_id", createdSessionId)
          .eq("user_id", userId);

        if (partialExercises?.length) {
          await supabase
            .from("performed_sets")
            .delete()
            .eq("user_id", userId)
            .in("session_exercise_id", partialExercises.map((exercise) => exercise.id));
        }

        await supabase
          .from("session_exercises")
          .delete()
          .eq("session_id", createdSessionId)
          .eq("user_id", userId);

        await supabase
          .from("workout_sessions")
          .delete()
          .eq("id", createdSessionId)
          .eq("user_id", userId);

        await loadSessions(userId).catch(() => {});
      }

      showError(
        err instanceof Error ? err.message : "Impossibile avviare l'allenamento.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveSet(setId: string): Promise<void> {
    // Se il salvataggio è già attivo, chi lo invoca può attenderne la Promise.
    const existingPromise = savePromisesRef.current[setId];

    if (existingPromise) {
      await existingPromise;
      return;
    }

    const uid = userIdRef.current;
    const session = activeSessionRef.current;
    const draft = latestDrafts.current[setId];

    if (!uid || !session || !draft) return;

    const reps = draft.reps.trim() === "" ? null : Number(draft.reps);
    const weight = draft.weight_kg.trim() === "" ? null : Number(draft.weight_kg);
    const rpe = draft.rpe.trim() === "" ? null : Number(draft.rpe);

    if (
      (reps !== null && (!Number.isInteger(reps) || reps < 0)) ||
      (weight !== null && (!Number.isFinite(weight) || weight < 0)) ||
      (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10))
    ) {
      setSetError(setId, "Controlla i valori inseriti.");
      throw new Error("Valori non validi: controlla le serie prima di uscire.");
    }

    savingSetIdsRef.current.add(setId);
    if (mountedRef.current) {
      setSavingIds((prev) => prev.includes(setId) ? prev : [...prev, setId]);
    }

    const savePromise = (async () => {
      try {
        const { data, error } = await supabase
          .from("performed_sets")
          .update({
            reps,
            weight_kg: weight,
            rpe,
            completed: reps !== null && reps > 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", setId)
          .eq("user_id", uid)
          .select("*")
          .single();

        if (error) throw error;

        if (mountedRef.current) {
          setSets((prev) =>
            prev.map((item) => item.id === setId ? data as PerformedSet : item),
          );
        }

        setSetError(setId, null);

        // Ricalcola lo stato della sessione.
        const { data: exerciseRows, error: exerciseError } = await supabase
          .from("session_exercises")
          .select("id,planned_sets")
          .eq("session_id", session.id)
          .eq("user_id", uid);

        if (exerciseError) throw exerciseError;

        const exerciseIds = (exerciseRows ?? []).map((item) => item.id);
        let savedSets: PerformedSet[] = [];

        if (exerciseIds.length) {
          const { data: rows, error: setError } = await supabase
            .from("performed_sets")
            .select("*")
            .eq("user_id", uid)
            .in("session_exercise_id", exerciseIds);

          if (setError) throw setError;
          savedSets = (rows ?? []) as PerformedSet[];
        }

        const setsByExercise = new Map<string, PerformedSet[]>();

        savedSets.forEach((item) => {
          setsByExercise.set(item.session_exercise_id, [
            ...(setsByExercise.get(item.session_exercise_id) ?? []),
            item,
          ]);
        });

        const allComplete =
          (exerciseRows ?? []).length > 0 &&
          (exerciseRows ?? []).every((exercise) => {
            const plannedCount = Math.max(0, exercise.planned_sets ?? 0);
            const exerciseSets = setsByExercise.get(exercise.id) ?? [];

            return (
              plannedCount > 0 &&
              exerciseSets.length >= plannedCount &&
              exerciseSets
                .slice(0, plannedCount)
                .every((item) => item.reps !== null && item.reps > 0)
            );
          });

        const { data: updatedSession, error: updateError } = await supabase
          .from("workout_sessions")
          .update({
            status: allComplete ? "completed" : "in_progress",
            finished_at: allComplete ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id)
          .eq("user_id", uid)
          .select("*")
          .single();

        if (updateError) throw updateError;

        if (mountedRef.current) {
          activeSessionRef.current = updatedSession as Session;
          setActiveSession(updatedSession as Session);
          await loadSessions(uid);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Salvataggio non riuscito. Modifica il campo per riprovare.";

        setSetError(setId, message);
        throw err;
      } finally {
        savingSetIdsRef.current.delete(setId);
        delete savePromisesRef.current[setId];

        if (mountedRef.current) {
          setSavingIds((prev) => prev.filter((id) => id !== setId));
        }
      }
    })();

    savePromisesRef.current[setId] = savePromise;
    await savePromise;
  }

  /*
   * Annulla i timer di autosalvataggio, salva i valori più recenti
   * e attende anche gli eventuali salvataggi già partiti.
   */
  async function flushPendingSaves(): Promise<void> {
    const pendingIds = new Set<string>([
      ...Object.keys(saveTimers.current),
      ...Object.keys(savePromisesRef.current),
    ]);

    Object.entries(saveTimers.current).forEach(([id, timer]) => {
      clearTimeout(timer);
      delete saveTimers.current[id];
    });

    const failures: string[] = [];

    for (const id of pendingIds) {
      try {
        // saveSet attende un salvataggio già in corso, se presente.
        await saveSet(id);
      } catch {
        failures.push(id);
      }
    }

    // Se un campo è ancora in errore, non chiudere silenziosamente la sessione.
    const currentErrors = saveErrorsRef.current;
    const remainingErrors = Object.keys(currentErrors).filter(
      (id) => pendingIds.has(id),
    );

    if (failures.length > 0 || remainingErrors.length > 0) {
      throw new Error(
        "Alcune serie non sono state salvate. Controlla gli errori e riprova prima di uscire.",
      );
    }
  }

  function updateDraft(
    id: string,
    field: keyof SetDraft,
    value: string,
    restContext?: { exerciseName: string; restSeconds: number | null },
  ) {
    const current = latestDrafts.current[id] ?? {
      reps: "",
      weight_kg: "",
      rpe: "",
      completed: false,
    };

    const next: SetDraft = { ...current, [field]: value };

    if (field === "reps") {
      const reps = value.trim() === "" ? null : Number(value);
      next.completed = reps !== null && Number.isInteger(reps) && reps > 0;

      if (next.completed && !current.completed && restContext) {
        startRestTimer(restContext.exerciseName, restContext.restSeconds);
      }
    }

    latestDrafts.current = { ...latestDrafts.current, [id]: next };
    setDrafts((prev) => ({ ...prev, [id]: next }));
    setSetError(id, null);

    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);

    saveTimers.current[id] = setTimeout(() => {
      delete saveTimers.current[id];
      void saveSet(id).catch(() => {});
    }, 700);
  }

  function startRestTimer(exerciseName: string, restSeconds: number | null) {
    const total = restSeconds && restSeconds > 0 ? restSeconds : 90;
    setRestTimer({ exerciseName, totalSeconds: total, secondsLeft: total });
  }

  function stopRestTimer() {
    setRestTimer(null);
  }

  function adjustRestTimer(deltaSeconds: number) {
    setRestTimer((current) => {
      if (!current) return current;
      return { ...current, secondsLeft: Math.max(0, current.secondsLeft + deltaSeconds) };
    });
  }

  function saveOnBlur(setId: string) {
    if (saveTimers.current[setId]) {
      clearTimeout(saveTimers.current[setId]);
      delete saveTimers.current[setId];
    }

    void saveSet(setId).catch(() => {});
  }

  async function saveCardioLog() {
    if (!userId || !activeSession) return;

    setCardioSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const sessionDay = days.find((item) => item.id === activeSession.mesocycle_day_id);
      const activityType = sessionDay?.activity_type ?? "other";
      const duration = cardioDuration.trim() === "" ? null : Number(cardioDuration);
      const distance = cardioDistance.trim() === "" ? null : Number(cardioDistance);
      const intensity = duration ? cardioIntensity : null;
      const calories = userWeight
        ? estimateSessionCalories(activityType, duration, intensity, userWeight)
        : null;
      const notes = cardioNotes.trim() || null;

      const { error } = await supabase
        .from("workout_sessions")
        .update({
          actual_duration_minutes: duration,
          actual_distance_km: distance,
          actual_intensity: intensity,
          actual_calories: calories,
          notes,
          status: duration ? "completed" : "in_progress",
          finished_at: duration ? new Date().toISOString() : null,
        })
        .eq("id", activeSession.id)
        .eq("user_id", userId);

      if (error) throw error;

      const updated: Session = {
        ...activeSession,
        actual_duration_minutes: duration,
        actual_distance_km: distance,
        actual_intensity: intensity,
        actual_calories: calories,
        notes,
        status: duration ? "completed" : "in_progress",
      };

      activeSessionRef.current = updated;
      setActiveSession(updated);
      await loadSessions(userId);
      showSuccess("Sessione salvata.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Impossibile salvare la sessione.");
    } finally {
      setCardioSaving(false);
    }
  }

  async function closeSession() {
    if (busy) return;

    setBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await flushPendingSaves();

      activeSessionRef.current = null;
      setActiveSession(null);
      setExercises([]);
      setSets([]);
      setDrafts({});
      latestDrafts.current = {};
      saveErrorsRef.current = {};
      setSaveErrors({});
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Impossibile chiudere la sessione perché ci sono salvataggi in sospeso.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession(session: Session) {
    if (!userId) return;

    const confirmed = window.confirm(
      `Vuoi eliminare la sessione "${session.title}" del ${formatDate(session.performed_at)}? L'operazione non è reversibile.`,
    );

    if (!confirmed) return;

    setDeletingSessionId(session.id);
    showSuccess("");

    try {
      const { error: deleteError } = await supabase
        .from("workout_sessions")
        .delete()
        .eq("id", session.id)
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      if (activeSessionRef.current?.id === session.id) {
        activeSessionRef.current = null;
        setActiveSession(null);
        setExercises([]);
        setSets([]);
        setDrafts({});
      }

      showSuccess("Sessione eliminata.");
      await loadSessions(userId);
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Impossibile eliminare la sessione.",
      );
    } finally {
      setDeletingSessionId(null);
    }
  }

  const completedSets = sets.filter((set) => hasValidReps(drafts[set.id])).length;
  const totalSets = sets.length;
  const allSeriesComplete = totalSets > 0 && completedSets === totalSets;

  const activeDay = days.find((item) => item.id === activeSession?.mesocycle_day_id);
  const isCardioSession = Boolean(activeDay?.activity_type && activeDay.activity_type !== "gym");
  const cardioCaloriesPreview =
    userWeight && cardioDuration.trim() !== ""
      ? estimateSessionCalories(
          activeDay?.activity_type ?? "other",
          Number(cardioDuration),
          cardioIntensity,
          userWeight,
        )
      : null;

  if (loading) {
    return (
      <AppShell>
        <p>Caricamento allenamenti...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <main className="workouts-page">
      <div className="workouts-container">
        <div className="workouts-heading">
          <p className="workouts-eyebrow">TRAINING TRACKER</p>
          <h1>I miei allenamenti</h1>
          <p>Registra le serie: le modifiche vengono salvate automaticamente.</p>
        </div>

        {errorMessage && (
          <div className="workouts-message workouts-error" role="alert">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="workouts-message workouts-success" role="status">
            {successMessage}
          </div>
        )}

        {activeSession ? (
          <section className="workouts-panel">
            <div className="workouts-panel-heading">
              <div>
                <p className="workouts-eyebrow">
                  {isCardioSession
                    ? activeSession.status === "completed"
                      ? "SESSIONE COMPLETATA"
                      : "SESSIONE NON INIZIATA"
                    : allSeriesComplete
                      ? "SESSIONE COMPLETATA"
                      : completedSets > 0
                        ? "SESSIONE PARZIALE"
                        : "SESSIONE NON INIZIATA"}
                </p>
                <h2>{activeSession.title}</h2>
                <p>{formatDate(activeSession.performed_at)}</p>
              </div>

              <button
                className="workouts-button-secondary"
                onClick={() => void closeSession()}
                disabled={busy}
              >
                {busy ? "Salvataggio…" : "← Elenco"}
              </button>
            </div>

            {isCardioSession ? (
              <div className="workouts-cardio-log">
                <p className="workouts-cardio-log__type">
                  {activeDay?.activity_type === "swimming"
                    ? "Nuoto"
                    : activeDay?.activity_type === "running"
                      ? "Corsa"
                      : activeDay?.activity_type === "cycling"
                        ? "Bici"
                        : activeDay?.activity_type === "cardio"
                          ? "Cardio"
                          : "Attività"}
                  {activeDay?.duration_minutes &&
                    ` · programmati ${activeDay.duration_minutes} min${activeDay.intensity ? ` · intensità ${activeDay.intensity}` : ""}`}
                </p>

                <div className="workouts-cardio-log__grid">
                  <label>
                    Durata (minuti)
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={cardioDuration}
                      onChange={(event) => setCardioDuration(event.target.value)}
                      placeholder={activeDay?.duration_minutes?.toString() ?? "Es. 45"}
                    />
                  </label>

                  <label>
                    Distanza (km, opzionale)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={cardioDistance}
                      onChange={(event) => setCardioDistance(event.target.value)}
                    />
                  </label>

                  <label>
                    Intensità percepita
                    <select
                      value={cardioIntensity}
                      onChange={(event) => setCardioIntensity(event.target.value)}
                    >
                      <option value="low">Bassa</option>
                      <option value="moderate">Moderata</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>
                </div>

                <label className="workouts-cardio-log__notes">
                  Note
                  <textarea
                    value={cardioNotes}
                    onChange={(event) => setCardioNotes(event.target.value)}
                    placeholder="Sensazioni, percorso, vasche fatte..."
                    rows={3}
                  />
                </label>

                {cardioCaloriesPreview !== null && (
                  <p className="workouts-cardio-log__hint">
                    ≈ {cardioCaloriesPreview} kcal stimate per questa sessione.
                  </p>
                )}

                <button
                  type="button"
                  className="workouts-button-primary"
                  disabled={cardioSaving}
                  onClick={() => void saveCardioLog()}
                >
                  {cardioSaving ? "Salvataggio…" : "Salva sessione"}
                </button>
              </div>
            ) : (
              <>
            <div className="workouts-progress-summary">
              <strong>{completedSets} / {totalSets}</strong>
              <span>serie con ripetizioni registrate</span>
            </div>
            <div className="workouts-progress-bar">
              <div
                style={{ width: `${totalSets > 0 ? (completedSets / totalSets) * 100 : 0}%` }}
              />
            </div>

            <p className="workouts-autosave-note" aria-live="polite">
              Le modifiche vengono salvate automaticamente dopo una breve pausa.
              {savingIds.length > 0 && " Salvataggio in corso…"}
            </p>

            {exercises.map((exercise) => {
              const exerciseSets = sets.filter(
                (set) => set.session_exercise_id === exercise.id,
              );

              return (
                <article className="workouts-exercise" key={exercise.id}>
                  <div className="workouts-exercise-heading">
                    <h3>{exercise.exercise_name}</h3>
                    <span>
                      {exercise.planned_sets ?? 0} serie ·{" "}
                      {exercise.reps_min ?? "—"}–{exercise.reps_max ?? "—"} reps
                    </span>
                  </div>

                  <div className="workouts-exercise-meta">
                    <span>Peso target: {exercise.target_weight_kg ?? "—"} kg</span>
                    <span>Recupero: {exercise.rest_seconds ?? "—"} s</span>
                    {exercise.tut && <span>TUT: {exercise.tut}</span>}
                    <button
                      type="button"
                      className="workouts-timer-start"
                      onClick={() => startRestTimer(exercise.exercise_name, exercise.rest_seconds)}
                    >
                      <TimerIcon size={14} /> Avvia recupero
                    </button>
                  </div>

                  {exercise.notes && (
                    <p className="workouts-exercise-notes">{exercise.notes}</p>
                  )}

                  <div className="workouts-sets">
                    {exerciseSets.map((set) => {
                      const draft = drafts[set.id];
                      if (!draft) return null;

                      return (
                        <div className="workouts-set-row" key={set.id}>
                          <strong>Serie {set.set_number}</strong>

                          <label>
                            Reps
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={draft.reps}
                              onChange={(event) =>
                                updateDraft(set.id, "reps", event.target.value, {
                                  exerciseName: exercise.exercise_name,
                                  restSeconds: exercise.rest_seconds,
                                })
                              }
                              onBlur={() => saveOnBlur(set.id)}
                            />
                          </label>

                          <label>
                            Kg
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={draft.weight_kg}
                              onChange={(event) =>
                                updateDraft(set.id, "weight_kg", event.target.value)
                              }
                              onBlur={() => saveOnBlur(set.id)}
                            />
                          </label>

                          <label>
                            RPE
                            <input
                              type="number"
                              min="1"
                              max="10"
                              step="0.5"
                              value={draft.rpe}
                              onChange={(event) =>
                                updateDraft(set.id, "rpe", event.target.value)
                              }
                              onBlur={() => saveOnBlur(set.id)}
                            />
                          </label>

                          <span className="workouts-save-status" aria-live="polite">
                            {saveErrors[set.id]
                              ? saveErrors[set.id]
                              : savingIds.includes(set.id)
                                ? "Salvataggio…"
                                : hasEnteredData(draft)
                                  ? "Salvato automaticamente"
                                  : "Pronto"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
              </>
            )}
          </section>
        ) : (
          <>
            <section className="workouts-panel">
              <p className="workouts-eyebrow">NUOVA SESSIONE</p>
              <h2>Inizia un allenamento</h2>
              <p className="workouts-description">
                Seleziona una giornata del mesociclo attivo. Gli esercizi verranno copiati nella sessione.
              </p>

              <div className="workouts-form">
                <label>
                  Giornata programmata
                  <select
                    value={selectedDay}
                    onChange={(event) => setSelectedDay(event.target.value)}
                  >
                    <option value="">Seleziona una giornata</option>
                    {days.map((day) => (
                      <option key={day.id} value={day.id}>
                        {day.mesocycle_name} · Settimana {day.week_number} · {day.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Data allenamento
                  <input
                    type="date"
                    value={trainingDate}
                    onChange={(event) => setTrainingDate(event.target.value)}
                  />
                </label>

                <button
                  className="workouts-button-primary"
                  disabled={!selectedDay || !trainingDate || busy}
                  onClick={() => void startWorkout()}
                >
                  {busy ? "Avvio..." : "Inizia allenamento ↗"}
                </button>
              </div>

              {!days.length && (
                <p className="workouts-empty">
                  Nessuna giornata disponibile in un mesociclo attivo. Verifica il tuo piano di allenamento.
                </p>
              )}
            </section>

            <section className="workouts-history">
              <div className="workouts-history-heading">
                <div>
                  <p className="workouts-eyebrow">IL TUO PERCORSO</p>
                  <h2>Storico sessioni</h2>
                </div>
                <span>{sessions.length} sessioni</span>
              </div>

              {sessions.length === 0 ? (
                <div className="workouts-empty">
                  Non hai ancora registrato allenamenti.
                </div>
              ) : (
                <div className="workouts-history-list">
                  {sessions.map((session) => {
                    const status =
                      displayStatuses[session.id] ??
                      (session.status === "completed" ? "completed" : "not_started");

                    const label =
                      status === "completed"
                        ? "Completato"
                        : status === "partial"
                          ? "Parziale"
                          : "Non iniziato";

                    return (
                      <div className="workouts-history-item" key={session.id}>
                        <button
                          type="button"
                          className="workouts-history-item__open"
                          disabled={busy}
                          onClick={() => userId && void openSession(session, userId)}
                        >
                          <div>
                            <strong>{session.title}</strong>
                            <span>{formatDate(session.performed_at)}</span>
                          </div>
                          <span className={`workouts-status ${status}`}>{label}</span>
                          <span className="workouts-history-arrow">↗</span>
                        </button>
                        <button
                          type="button"
                          className="workouts-history-item__delete"
                          disabled={busy || deletingSessionId === session.id}
                          onClick={() => void deleteSession(session)}
                          aria-label="Elimina sessione"
                          title="Elimina sessione"
                        >
                          {deletingSessionId === session.id ? "…" : <TrashIcon size={16} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {restTimer && (
        <div
          className="workouts-rest-timer"
          data-done={restTimer.secondsLeft === 0}
          role="status"
          aria-live="polite"
        >
          <div className="workouts-rest-timer__info">
            <span className="workouts-rest-timer__label">Recupero · {restTimer.exerciseName}</span>
            <span className="workouts-rest-timer__clock">
              {String(Math.floor(restTimer.secondsLeft / 60)).padStart(2, "0")}:
              {String(restTimer.secondsLeft % 60).padStart(2, "0")}
            </span>
          </div>
          <div className="workouts-rest-timer__actions">
            <button type="button" onClick={() => adjustRestTimer(-15)}>
              -15s
            </button>
            <button type="button" onClick={() => adjustRestTimer(15)}>
              +15s
            </button>
            <button type="button" className="workouts-rest-timer__stop" onClick={stopRestTimer}>
              {restTimer.secondsLeft === 0 ? "Chiudi" : "Salta"}
            </button>
          </div>
        </div>
      )}
    </main>
    </AppShell>
  );
}
