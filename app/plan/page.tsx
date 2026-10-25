
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import "./plan.css";

type Mesocycle = {
    id: string;
    name: string;
    goal: string | null;
    start_date: string | null;
    duration_weeks: number;
    status: string;
};

type MesocycleWeek = {
    id: string;
    week_number: number;
    notes: string | null;
};

type MesocycleDay = {
    id: string;
    week_id: string;
    day_code: string;
    title: string;
    activity_type: string;
    notes: string | null;
    sort_order: number;
};

type TrainingTemplate = {
    id: string;
    name: string;
    description: string | null;
};

type TemplateDay = {
    id: string;
    day_code: string;
    title: string;
    activity_type: string;
    notes: string | null;
    sort_order: number;
};

type TemplateExercise = {
    template_day_id: string;
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

export default function PlanPage() {
    const router = useRouter();

    const [mesocycles, setMesocycles] = useState<Mesocycle[]>([]);
    const [selectedMesocycle, setSelectedMesocycle] =
        useState<Mesocycle | null>(null);
    const [weeks, setWeeks] = useState<MesocycleWeek[]>([]);
    const [days, setDays] = useState<MesocycleDay[]>([]);
    const [templates, setTemplates] = useState<TrainingTemplate[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [name, setName] = useState("");
    const [goal, setGoal] = useState("Ipertrofia");
    const [startDate, setStartDate] = useState("");
    const [duration, setDuration] = useState("8");
    const [selectedTemplateId, setSelectedTemplateId] = useState("");

    const [showDayForm, setShowDayForm] = useState(false);
    const [editingDay, setEditingDay] = useState<MesocycleDay | null>(null);
    const [dayCode, setDayCode] = useState("");
    const [dayTitle, setDayTitle] = useState("");
    const [dayActivity, setDayActivity] = useState("gym");
    const [dayNotes, setDayNotes] = useState("");
    const [dayScope, setDayScope] = useState<"single" | "all">("single");
    const [targetWeekId, setTargetWeekId] = useState("");

    const loadMesocycles = useCallback(async () => {
        setLoading(true);
        setError("");

        const { data: authData, error: authError } =
            await supabase.auth.getSession();

        if (authError || !authData.session) {
            router.replace("/");
            setLoading(false);
            return;
        }

        const { data, error: queryError } = await supabase
            .from("mesocycles")
            .select("id, name, goal, start_date, duration_weeks, status")
            .eq("user_id", authData.session.user.id)
            .order("created_at", { ascending: false });

        if (queryError) {
            setError(`Errore nel caricamento dei mesocicli: ${queryError.message}`);
            setLoading(false);
            return;
        }

        setMesocycles((data ?? []) as Mesocycle[]);
        setLoading(false);
    }, [router]);

    const loadTemplates = useCallback(async () => {
        const { data: authData, error: authError } =
            await supabase.auth.getSession();

        const user = authData.session?.user;

        if (authError || !user) {
            router.replace("/");
            return;
        }

        const { data, error: queryError } = await supabase
            .from("training_templates")
            .select("id, name, description")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (queryError) {
            setError(`Errore nel caricamento dei template: ${queryError.message}`);
            return;
        }

        setTemplates((data ?? []) as TrainingTemplate[]);
    }, [router]);

    const loadStructure = useCallback(async (mesocycle: Mesocycle) => {
        setError("");
        setSelectedMesocycle(mesocycle);
        setWeeks([]);
        setDays([]);

        const { data: weekData, error: weekError } = await supabase
            .from("mesocycle_weeks")
            .select("id, week_number, notes")
            .eq("mesocycle_id", mesocycle.id)
            .order("week_number");

        if (weekError) {
            setError(`Errore nel caricamento delle settimane: ${weekError.message}`);
            return;
        }

        const loadedWeeks = (weekData ?? []) as MesocycleWeek[];
        setWeeks(loadedWeeks);

        if (loadedWeeks.length === 0) return;

        const { data: dayData, error: dayError } = await supabase
            .from("mesocycle_days")
            .select(
                "id, week_id, day_code, title, activity_type, notes, sort_order"
            )
            .in("week_id", loadedWeeks.map((week) => week.id))
            .order("sort_order");

        if (dayError) {
            setError(`Errore nel caricamento dei giorni: ${dayError.message}`);
            return;
        }

        setDays((dayData ?? []) as MesocycleDay[]);
    }, []);

    useEffect(() => {
        void loadMesocycles();
        void loadTemplates();
        setStartDate(new Date().toLocaleDateString("en-CA"));
    }, [loadMesocycles, loadTemplates]);

    async function createMesocycle(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const numberOfWeeks = Number(duration);

        if (!name.trim()) {
            setError("Inserisci il nome del mesociclo.");
            return;
        }

        if (!Number.isInteger(numberOfWeeks) ||
            numberOfWeeks < 1 || numberOfWeeks > 52) {
            setError("La durata deve essere compresa tra 1 e 52 settimane.");
            return;
        }

        setSaving(true);
        setError("");
        setNotice("");

        let createdId: string | null = null;

        try {
            const { data: authData, error: authError } =
                await supabase.auth.getSession();

            const user = authData.session?.user;

            if (authError || !user) {
                router.replace("/");
                return;
            }

            let templateDays: TemplateDay[] = [];
            let templateExercises: TemplateExercise[] = [];

            if (selectedTemplateId) {
                const { data: templateData, error: templateError } =
                    await supabase
                        .from("training_templates")
                        .select("id")
                        .eq("id", selectedTemplateId)
                        .eq("user_id", user.id)
                        .single();

                if (templateError || !templateData) {
                    throw new Error("Il template selezionato non è disponibile.");
                }

                const { data: dayData, error: dayError } = await supabase
                    .from("template_days")
                    .select(
                        "id, day_code, title, activity_type, notes, sort_order"
                    )
                    .eq("template_id", selectedTemplateId)
                    .eq("user_id", user.id)
                    .order("sort_order");

                if (dayError) throw dayError;

                templateDays = (dayData ?? []) as TemplateDay[];

                if (templateDays.length === 0) {
                    throw new Error("Il template non contiene giorni.");
                }

                const { data: exerciseData, error: exerciseError } =
                    await supabase
                        .from("template_exercises")
                        .select(
                            "template_day_id, exercise_name, sets, reps_min, reps_max, target_weight_kg, tut, rest_seconds, notes, sort_order"
                        )
                        .in("template_day_id", templateDays.map((day) => day.id))
                        .eq("user_id", user.id)
                        .order("sort_order");

                if (exerciseError) throw exerciseError;

                templateExercises = (exerciseData ?? []) as TemplateExercise[];
            }

            const { data: created, error: createError } = await supabase
                .from("mesocycles")
                .insert({
                    user_id: user.id,
                    name: name.trim(),
                    goal,
                    start_date: startDate || null,
                    duration_weeks: numberOfWeeks,
                    status: "draft",
                })
                .select("id, name, goal, start_date, duration_weeks, status")
                .single();

            if (createError || !created) {
                throw new Error(
                    `Impossibile creare il mesociclo: ${createError?.message ?? "errore sconosciuto"}`
                );
            }

            createdId = created.id;

            const weekRows = Array.from(
                { length: numberOfWeeks },
                (_, index) => ({
                    mesocycle_id: created.id,
                    user_id: user.id,
                    week_number: index + 1,
                })
            );

            const { data: createdWeeks, error: weeksError } = await supabase
                .from("mesocycle_weeks")
                .insert(weekRows)
                .select("id, week_number, notes");

            if (weeksError || !createdWeeks) {
                throw new Error(
                    `Errore nella creazione delle settimane: ${weeksError?.message ?? "errore sconosciuto"}`
                );
            }

            const dayRows = createdWeeks.flatMap((week) => {
                if (selectedTemplateId) {
                    return templateDays.map((day) => ({
                        week_id: week.id,
                        user_id: user.id,
                        day_code: day.day_code,
                        title: day.title,
                        activity_type: day.activity_type,
                        notes: day.notes,
                        sort_order: day.sort_order,
                    }));
                }

                return [
                    { code: "A", title: "Giorno A" },
                    { code: "B", title: "Giorno B" },
                    { code: "C", title: "Giorno C" },
                ].map((day, index) => ({
                    week_id: week.id,
                    user_id: user.id,
                    day_code: day.code,
                    title: day.title,
                    activity_type: "gym",
                    notes: null,
                    sort_order: index,
                }));
            });

            const { data: createdDays, error: daysError } = await supabase
                .from("mesocycle_days")
                .insert(dayRows)
                .select(
                    "id, week_id, day_code, title, activity_type, notes, sort_order"
                );

            if (daysError || !createdDays) {
                throw new Error(
                    `Errore nella creazione dei giorni: ${daysError?.message ?? "errore sconosciuto"}`
                );
            }

            if (selectedTemplateId && templateExercises.length > 0) {
                const prescriptionRows = createdDays.flatMap((day) => {
                    const week = createdWeeks.find((item) => item.id === day.week_id);
                    if (!week) return [];

                    const sourceDay = templateDays.find(
                        (item) =>
                            item.day_code === day.day_code &&
                            item.sort_order === day.sort_order
                    );

                    if (!sourceDay) return [];

                    return templateExercises
                        .filter((exercise) => exercise.template_day_id === sourceDay.id)
                        .map((exercise) => ({
                            mesocycle_day_id: day.id,
                            user_id: user.id,
                            exercise_name: exercise.exercise_name,
                            sets: exercise.sets,
                            reps_min: exercise.reps_min,
                            reps_max: exercise.reps_max,
                            target_weight_kg: exercise.target_weight_kg,
                            tut: exercise.tut,
                            rest_seconds: exercise.rest_seconds,
                            notes: exercise.notes,
                            sort_order: exercise.sort_order,
                        }));
                });

                if (prescriptionRows.length > 0) {
                    const { error: prescriptionError } = await supabase
                        .from("exercise_prescriptions")
                        .insert(prescriptionRows);

                    if (prescriptionError) throw prescriptionError;
                }
            }

            setShowForm(false);
            setName("");
            setSelectedTemplateId("");
            setNotice(
                selectedTemplateId
                    ? "Mesociclo creato dal template, con giorni ed esercizi copiati."
                    : "Mesociclo creato correttamente."
            );

            await loadMesocycles();
            await loadStructure(created as Mesocycle);
        } catch (err) {
            let message = err instanceof Error
                ? err.message
                : "Errore durante la creazione del mesociclo.";

            if (createdId) {
                message +=
                    " Il mesociclo potrebbe essere stato creato parzialmente. Verifica la programmazione prima di riprovare.";
            }

            setError(message);
        } finally {
            setSaving(false);
        }
    }

    async function updateStatus(
        mesocycle: Mesocycle,
        status: "draft" | "active" | "completed" | "archived"
    ) {
        setError("");
        setNotice("");

        const { data: authData, error: authError } =
            await supabase.auth.getSession();
        const userId = authData.session?.user.id;

        if (authError || !userId) {
            router.replace("/");
            return;
        }

        const { error: updateError } = await supabase
            .from("mesocycles")
            .update({ status })
            .eq("id", mesocycle.id)
            .eq("user_id", userId);

        if (updateError) {
            setError(`Impossibile aggiornare lo stato: ${updateError.message}`);
            return;
        }

        setNotice("Stato aggiornato.");
        await loadMesocycles();
    }

    async function deleteMesocycle(mesocycle: Mesocycle) {
        const confirmed = window.confirm(
            `Vuoi eliminare il mesociclo "${mesocycle.name}" e la sua programmazione?`
        );

        if (!confirmed) return;

        const { data: authData, error: authError } =
            await supabase.auth.getSession();
        const userId = authData.session?.user.id;

        if (authError || !userId) {
            router.replace("/");
            return;
        }

        const { error: deleteError } = await supabase
            .from("mesocycles")
            .delete()
            .eq("id", mesocycle.id)
            .eq("user_id", userId);

        if (deleteError) {
            setError(
                `Impossibile eliminare il mesociclo. Potrebbero esserci dati collegati: ${deleteError.message}`
            );
            return;
        }

        if (selectedMesocycle?.id === mesocycle.id) {
            setSelectedMesocycle(null);
            setWeeks([]);
            setDays([]);
        }

        setNotice("Mesociclo eliminato.");
        await loadMesocycles();
    }

    function openNewDay(week: MesocycleWeek) {
        setEditingDay(null);
        setTargetWeekId(week.id);
        setDayCode("");
        setDayTitle("");
        setDayActivity("gym");
        setDayNotes("");
        setDayScope("single");
        setShowDayForm(true);
        setError("");
    }

    function openEditDay(day: MesocycleDay) {
        setEditingDay(day);
        setTargetWeekId(day.week_id);
        setDayCode(day.day_code);
        setDayTitle(day.title);
        setDayActivity(day.activity_type);
        setDayNotes(day.notes ?? "");
        setDayScope("single");
        setShowDayForm(true);
        setError("");
    }


    async function saveDay(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedMesocycle || !targetWeekId) return;

        const code = dayCode.trim().toUpperCase();
        const title = dayTitle.trim();

        if (!/^[A-Z0-9]{1,3}$/.test(code) || !title) {
            setError("Inserisci un codice valido e un nome per il giorno.");
            return;
        }

        setSaving(true);
        setError("");
        setNotice("");

        try {
            const { data: authData, error: authError } =
                await supabase.auth.getSession();

            const user = authData.session?.user;

            if (authError || !user) {
                router.replace("/");
                return;
            }

            const payload = {
                day_code: code,
                title,
                activity_type: dayActivity,
                notes: dayNotes.trim() || null,
            };

            if (editingDay) {
                const targetWeeks = dayScope === "all"
                    ? weeks
                    : weeks.filter((week) => week.id === editingDay.week_id);

                const targetWeekIds = targetWeeks.map((week) => week.id);

                // Identifica i giorni che devono essere aggiornati.
                const targetDays = dayScope === "all"
                    ? days.filter(
                        (day) =>
                            targetWeekIds.includes(day.week_id) &&
                            day.day_code === editingDay.day_code
                    )
                    : [editingDay];

                if (targetDays.length === 0) {
                    throw new Error("Non sono stati trovati giorni da aggiornare.");
                }

                const targetDayIds = new Set(
                    targetDays.map((day) => day.id)
                );

                // Evita codici duplicati nella stessa settimana.
                const duplicate = days.some(
                    (day) =>
                        targetWeekIds.includes(day.week_id) &&
                        day.day_code.toUpperCase() === code &&
                        !targetDayIds.has(day.id)
                );

                if (duplicate) {
                    throw new Error(
                        `Il codice ${code} è già utilizzato in una delle settimane interessate.`
                    );
                }

                const { error: updateError } = await supabase
                    .from("mesocycle_days")
                    .update(payload)
                    .in("id", [...targetDayIds])
                    .eq("user_id", user.id);

                if (updateError) throw updateError;

                setNotice(
                    dayScope === "all"
                        ? "Giorno aggiornato in tutte le settimane interessate."
                        : "Giorno aggiornato."
                );
            } else {
                const targetWeeks = dayScope === "all"
                    ? weeks
                    : weeks.filter((week) => week.id === targetWeekId);

                if (targetWeeks.length === 0) {
                    throw new Error("Non sono state trovate settimane da aggiornare.");
                }

                const duplicate = days.some(
                    (day) =>
                        targetWeeks.some((week) => week.id === day.week_id) &&
                        day.day_code.toUpperCase() === code
                );

                if (duplicate) {
                    throw new Error(
                        `Il giorno ${code} esiste già in una delle settimane selezionate.`
                    );
                }

                const rows = targetWeeks.map((week) => ({
                    ...payload,
                    week_id: week.id,
                    user_id: user.id,
                    sort_order: days.filter(
                        (day) => day.week_id === week.id
                    ).length,
                }));

                const { error: insertError } = await supabase
                    .from("mesocycle_days")
                    .insert(rows);

                if (insertError) throw insertError;

                setNotice(
                    dayScope === "all"
                        ? "Giorno aggiunto a tutte le settimane."
                        : "Giorno aggiunto."
                );
            }

            setShowDayForm(false);
            await loadStructure(selectedMesocycle);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Errore durante il salvataggio del giorno."
            );
        } finally {
            setSaving(false);
        }
    }

    async function removeDay(day: MesocycleDay) {
        if (!selectedMesocycle) return;

        const allWeeks = window.confirm(
            `Vuoi eliminare il giorno ${day.day_code} da tutte le settimane?\n\nOK = tutte le settimane\nAnnulla = solo questa settimana`
        );

        const confirmed = window.confirm(
            "Confermi l'eliminazione? Verifica prima che il giorno non contenga allenamenti da conservare."
        );

        if (!confirmed) return;

        const { data: authData, error: authError } =
            await supabase.auth.getSession();
        const user = authData.session?.user;

        if (authError || !user) {
            router.replace("/");
            return;
        }

        let query = supabase
            .from("mesocycle_days")
            .delete()
            .eq("user_id", user.id);

        if (allWeeks) {
            query = query
                .in("week_id", weeks.map((week) => week.id))
                .eq("day_code", day.day_code);
        } else {
            query = query.eq("id", day.id);
        }

        const { error: deleteError } = await query;

        if (deleteError) {
            setError(`Errore durante l'eliminazione: ${deleteError.message}`);
            return;
        }

        setNotice("Giorno eliminato.");
        await loadStructure(selectedMesocycle);
    }

    return (
        <AppShell>
        <main className="plan-page">
            <section className="plan-hero">
                <p className="plan-eyebrow">ALLENAMENTO</p>
                <h1>I miei <span>mesocicli</span></h1>
                <p>
                    Organizza la programmazione, settimana per settimana,
                    e prepara i tuoi allenamenti.
                </p>
            </section>

            {error && <p className="plan-error" role="alert">{error}</p>}
            {notice && <p className="plan-notice" role="status">{notice}</p>}

            <section className="plan-day-details">
                <div className="plan-day-title">
                    <div>
                        <p className="plan-eyebrow">PROGRAMMAZIONE</p>
                        <h2>Mesocicli</h2>
                    </div>

                    <div className="plan-day-title-actions">
                        <Link className="plan-secondary" href="/plan/generate">
                            ✨ Genera con AI
                        </Link>
                        <button
                            className="plan-primary"
                            onClick={() => {
                                setShowForm((current) => !current);
                                setError("");
                            }}
                        >
                            {showForm ? "Annulla" : "+ Nuovo mesociclo"}
                        </button>
                    </div>
                </div>

                {showForm && (
                    <form className="plan-form-panel plan-form" onSubmit={createMesocycle}>
                        <label>
                            Nome del mesociclo *
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Es. Ipertrofia - Blocco 1"
                                maxLength={120}
                                required
                            />
                        </label>

                        <label>
                            Crea da template (facoltativo)
                            <select
                                value={selectedTemplateId}
                                onChange={(event) => setSelectedTemplateId(event.target.value)}
                            >
                                <option value="">Parti da zero (giorni A, B, C)</option>
                                {templates.map((template) => (
                                    <option key={template.id} value={template.id}>
                                        {template.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {selectedTemplateId && (
                            <p className="plan-field-help">
                                I giorni e gli esercizi saranno copiati in ogni
                                settimana. Le modifiche future al template non
                                modificheranno questo mesociclo.
                            </p>
                        )}

                        {!selectedTemplateId && templates.length === 0 && (
                            <p className="plan-field-help">
                                Non hai ancora template disponibili. Puoi crearne
                                uno nella sezione Template.
                            </p>
                        )}

                        <div className="plan-form-grid">
                            <label>
                                Obiettivo
                                <select value={goal} onChange={(event) => setGoal(event.target.value)}>
                                    <option value="Ipertrofia">Ipertrofia</option>
                                    <option value="Forza">Forza</option>
                                    <option value="Dimagrimento">Dimagrimento</option>
                                    <option value="Ricondizionamento">Ricondizionamento</option>
                                    <option value="Personalizzato">Personalizzato</option>
                                </select>
                            </label>

                            <label>
                                Durata (settimane)
                                <input
                                    type="number"
                                    min="1"
                                    max="52"
                                    value={duration}
                                    onChange={(event) => setDuration(event.target.value)}
                                    required
                                />
                            </label>
                        </div>

                        <label>
                            Data di inizio
                            <input
                                type="date"
                                value={startDate}
                                onChange={(event) => setStartDate(event.target.value)}
                            />
                        </label>

                        <p className="plan-field-help">
                            {selectedTemplateId
                                ? "Ogni settimana riceverà una copia dei giorni e delle prescrizioni del template."
                                : "Verranno creati automaticamente i giorni A, B e C, che potrai personalizzare."}
                        </p>

                        <button type="submit" className="plan-primary" disabled={saving}>
                            {saving ? "Creazione..." : "Crea mesociclo"}
                        </button>
                    </form>
                )}

                {showDayForm && (
                    <form className="plan-form-panel plan-form" onSubmit={saveDay}>
                        <h3>{editingDay ? "Modifica giorno" : "Aggiungi giorno"}</h3>

                        <label>
                            Codice del giorno
                            <input
                                value={dayCode}
                                onChange={(event) => setDayCode(event.target.value)}
                                placeholder="A"
                                maxLength={3}
                                required
                            />
                        </label>

                        <label>
                            Nome
                            <input
                                value={dayTitle}
                                onChange={(event) => setDayTitle(event.target.value)}
                                placeholder="Es. Petto e tricipiti"
                                required
                            />
                        </label>

                        <label>
                            Tipo di attività
                            <select value={dayActivity} onChange={(event) => setDayActivity(event.target.value)}>
                                <option value="gym">Palestra</option>
                                <option value="cardio">Cardio</option>
                                <option value="swimming">Nuoto</option>
                                <option value="rest">Riposo</option>
                                <option value="other">Altro</option>
                            </select>
                        </label>

                        <label>
                            Note
                            <textarea
                                value={dayNotes}
                                onChange={(event) => setDayNotes(event.target.value)}
                                placeholder="Note facoltative"
                            />
                        </label>

                        <label>
                            Applica a
                            <select
                                value={dayScope}
                                onChange={(event) => setDayScope(event.target.value as "single" | "all")}
                            >
                                <option value="single">Solo questa settimana</option>
                                <option value="all">Tutte le settimane</option>
                            </select>
                        </label>

                        <div className="plan-item-actions">
                            <button type="submit" className="plan-primary" disabled={saving}>
                                {saving ? "Salvataggio..." : "Salva giorno"}
                            </button>
                            <button type="button" className="plan-back" onClick={() => setShowDayForm(false)}>
                                Annulla
                            </button>
                        </div>
                    </form>
                )}

                {loading ? (
                    <p className="plan-loading">Caricamento...</p>
                ) : mesocycles.length === 0 ? (
                    <div className="plan-empty">
                        <h2>Non hai ancora mesocicli</h2>
                        <p>
                            Creane uno per iniziare a costruire la tua
                            programmazione di allenamento.
                        </p>
                    </div>
                ) : (
                    <div className="plan-columns">
                        <article className="plan-panel">
                            <div className="plan-panel-heading">
                                <div>
                                    <h3>I tuoi programmi</h3>
                                    <p>{mesocycles.length} mesocicli</p>
                                </div>
                            </div>

                            {mesocycles.map((mesocycle) => (
                                <div className="plan-item" key={mesocycle.id}>
                                    <button
                                        type="button"
                                        className="plan-select-mesocycle"
                                        onClick={() => void loadStructure(mesocycle)}
                                    >
                                        <h4>{mesocycle.name}</h4>
                                        <p>{mesocycle.goal ?? "Obiettivo non specificato"}</p>
                                        <p>
                                            {mesocycle.duration_weeks} settimane
                                            {mesocycle.start_date ? ` · Inizio ${mesocycle.start_date}` : ""}
                                        </p>
                                        <span className="plan-status">
                                            {mesocycle.status === "active"
                                                ? "Attivo"
                                                : mesocycle.status === "completed"
                                                    ? "Completato"
                                                    : mesocycle.status === "archived"
                                                        ? "Archiviato"
                                                        : "Bozza"}
                                        </span>
                                    </button>

                                    <div className="plan-item-actions">
                                        <button
                                            type="button"
                                            className="plan-primary"
                                            onClick={() => router.push(`/plan/${mesocycle.id}`)}
                                        >
                                            Apri programma →
                                        </button>

                                        <label className="plan-inline-label">
                                            Stato
                                            <select
                                                value={mesocycle.status}
                                                onChange={(event) =>
                                                    void updateStatus(
                                                        mesocycle,
                                                        event.target.value as
                                                        | "draft"
                                                        | "active"
                                                        | "completed"
                                                        | "archived"
                                                    )
                                                }
                                            >
                                                <option value="draft">Bozza</option>
                                                <option value="active">Attivo</option>
                                                <option value="completed">Completato</option>
                                                <option value="archived">Archiviato</option>
                                            </select>
                                        </label>

                                        <button
                                            type="button"
                                            className="plan-danger"
                                            onClick={() => void deleteMesocycle(mesocycle)}
                                        >
                                            Elimina
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </article>

                        <article className="plan-panel">
                            <div className="plan-panel-heading">
                                <div>
                                    <h3>Struttura del programma</h3>
                                    <p>{selectedMesocycle?.name ?? "Seleziona un mesociclo"}</p>
                                </div>
                            </div>

                            {!selectedMesocycle ? (
                                <p className="plan-no-items">
                                    Seleziona un mesociclo per vedere settimane e giorni.
                                </p>
                            ) : weeks.length === 0 ? (
                                <p className="plan-no-items">
                                    Non sono state trovate settimane per questo mesociclo.
                                </p>
                            ) : (
                                weeks.map((week) => (
                                    <div className="plan-item" key={week.id}>
                                        <div className="plan-panel-heading">
                                            <h4>Settimana {week.week_number}</h4>
                                            <button
                                                type="button"
                                                className="plan-primary"
                                                onClick={() => openNewDay(week)}
                                            >
                                                + Giorno
                                            </button>
                                        </div>

                                        {days
                                            .filter((day) => day.week_id === week.id)
                                            .map((day) => (
                                                <div className="plan-week-day" key={day.id}>
                                                    <strong>Giorno {day.day_code}</strong>
                                                    <p>{day.title}</p>
                                                    <span>
                                                        {day.activity_type === "gym"
                                                            ? "Palestra"
                                                            : day.activity_type}
                                                    </span>

                                                    <div className="plan-item-actions">
                                                        <button
                                                            type="button"
                                                            className="plan-back"
                                                            onClick={() => openEditDay(day)}
                                                        >
                                                            Modifica
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="plan-danger"
                                                            onClick={() => void removeDay(day)}
                                                        >
                                                            Elimina
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                ))
                            )}
                        </article>
                    </div>
                )}
            </section>
        </main>
        </AppShell>
    );
}
