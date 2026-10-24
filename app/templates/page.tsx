
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import "./templates.css";

type TrainingTemplate = {
    id: string;
    name: string;
    description: string | null;
};

type TemplateDay = {
    id: string;
    template_id: string;
    day_code: string;
    title: string;
    activity_type: string;
    notes: string | null;
    sort_order: number;
};

type TemplateExercise = {
    id: string;
    template_day_id: string;
    exercise_name: string;
    sets: number;
    reps_min: number | null;
    reps_max: number | null;
    tut: string | null;
    rest_seconds: number | null;
    notes: string | null;
    sort_order: number;
};

export default function TemplatesPage() {
    const router = useRouter();

    const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
    const [selected, setSelected] = useState<TrainingTemplate | null>(null);
    const [days, setDays] = useState<TemplateDay[]>([]);
    const [exercises, setExercises] = useState<TemplateExercise[]>([]);
    const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [templateName, setTemplateName] = useState("");
    const [templateDescription, setTemplateDescription] = useState("");
    const [showTemplateForm, setShowTemplateForm] = useState(false);

    const [dayCode, setDayCode] = useState("");
    const [dayTitle, setDayTitle] = useState("");
    const [dayNotes, setDayNotes] = useState("");
    const [showDayForm, setShowDayForm] = useState(false);
    const [editingDay, setEditingDay] = useState<TemplateDay | null>(null);

    const [exerciseName, setExerciseName] = useState("");
    const [exerciseSets, setExerciseSets] = useState("3");
    const [repsMin, setRepsMin] = useState("8");
    const [repsMax, setRepsMax] = useState("12");
    const [tut, setTut] = useState("");
    const [restSeconds, setRestSeconds] = useState("90");
    const [exerciseNotes, setExerciseNotes] = useState("");
    const [showExerciseForm, setShowExerciseForm] = useState(false);
    const [editingExercise, setEditingExercise] =
        useState<TemplateExercise | null>(null);

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        setError("");

        const { data: auth, error: authError } =
            await supabase.auth.getSession();

        const user = auth?.session?.user;

        if (authError || !user) {
            router.replace("/");
            setLoading(false);
            return;
        }

        const { data, error: queryError } = await supabase
            .from("training_templates")
            .select("id, name, description")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (queryError) {
            setError(`Errore nel caricamento dei template: ${queryError.message}`);
            setLoading(false);
            return;
        }

        setTemplates((data ?? []) as TrainingTemplate[]);
        setLoading(false);
    }, [router]);

    const loadTemplateDetails = useCallback(
        async (template: TrainingTemplate) => {
            setError("");
            setSelected(template);
            setSelectedDayId(null);
            setDays([]);
            setExercises([]);

            const { data: dayData, error: dayError } = await supabase
                .from("template_days")
                .select(
                    "id, template_id, day_code, title, activity_type, notes, sort_order"
                )
                .eq("template_id", template.id)
                .order("sort_order");

            if (dayError) {
                setError(`Errore nel caricamento dei giorni: ${dayError.message}`);
                return;
            }

            const loadedDays = (dayData ?? []) as TemplateDay[];
            setDays(loadedDays);

            if (loadedDays.length > 0) {
                setSelectedDayId(loadedDays[0].id);
            }

            const dayIds = loadedDays.map((day) => day.id);

            if (dayIds.length === 0) return;

            const { data: exerciseData, error: exerciseError } = await supabase
                .from("template_exercises")
                .select(
                    "id, template_day_id, exercise_name, sets, reps_min, reps_max, tut, rest_seconds, notes, sort_order"
                )
                .in("template_day_id", dayIds)
                .order("sort_order");

            if (exerciseError) {
                setError(
                    `Errore nel caricamento degli esercizi: ${exerciseError.message}`
                );
                return;
            }

            setExercises((exerciseData ?? []) as TemplateExercise[]);
        },
        []
    );

    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);

    async function createTemplate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!templateName.trim()) {
            setError("Inserisci il nome del template.");
            return;
        }

        setSaving(true);
        setError("");
        setNotice("");

        const { data: auth } = await supabase.auth.getSession();
        const user = auth.session?.user;

        if (!user) {
            router.replace("/");
            setSaving(false);
            return;
        }

        const { data, error: insertError } = await supabase
            .from("training_templates")
            .insert({
                user_id: user.id,
                name: templateName.trim(),
                description: templateDescription.trim() || null,
            })
            .select("id, name, description")
            .single();

        if (insertError || !data) {
            setError(
                `Impossibile creare il template: ${insertError?.message ?? "errore sconosciuto"
                }`
            );
            setSaving(false);
            return;
        }

        const created = data as TrainingTemplate;

        setTemplateName("");
        setTemplateDescription("");
        setShowTemplateForm(false);
        setNotice("Template creato.");

        await loadTemplates();
        await loadTemplateDetails(created);

        setSaving(false);
    }

    async function renameTemplate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selected || !templateName.trim()) return;

        setSaving(true);
        setError("");

        const { data: auth } = await supabase.auth.getSession();
        const user = auth.session?.user;

        if (!user) {
            router.replace("/");
            setSaving(false);
            return;
        }

        const { error: updateError } = await supabase
            .from("training_templates")
            .update({
                name: templateName.trim(),
                description: templateDescription.trim() || null,
            })
            .eq("id", selected.id)
            .eq("user_id", user.id);

        if (updateError) {
            setError(`Errore nella modifica: ${updateError.message}`);
        } else {
            setNotice("Template aggiornato.");
            setShowTemplateForm(false);
            await loadTemplates();
            await loadTemplateDetails({
                ...selected,
                name: templateName.trim(),
                description: templateDescription.trim() || null,
            });
        }

        setSaving(false);
    }

    async function deleteTemplate(template: TrainingTemplate) {
        if (
            !window.confirm(
                `Eliminare il template "${template.name}" e i suoi giorni?`
            )
        ) {
            return;
        }

        const { data: auth } = await supabase.auth.getSession();
        const user = auth.session?.user;

        if (!user) {
            router.replace("/");
            return;
        }

        const { error: deleteError } = await supabase
            .from("training_templates")
            .delete()
            .eq("id", template.id)
            .eq("user_id", user.id);

        if (deleteError) {
            setError(`Errore nell'eliminazione: ${deleteError.message}`);
            return;
        }

        if (selected?.id === template.id) {
            setSelected(null);
            setDays([]);
            setExercises([]);
            setSelectedDayId(null);
        }

        setNotice("Template eliminato.");
        await loadTemplates();
    }

    function openNewDay() {
        setEditingDay(null);
        setDayCode("");
        setDayTitle("");
        setDayNotes("");
        setShowDayForm(true);
        setError("");
    }

    function openEditDay(day: TemplateDay) {
        setEditingDay(day);
        setDayCode(day.day_code);
        setDayTitle(day.title);
        setDayNotes(day.notes ?? "");
        setShowDayForm(true);
        setError("");
    }

    async function saveDay(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selected) return;

        const code = dayCode.trim().toUpperCase();
        const title = dayTitle.trim();

        if (!/^[A-Z0-9]{1,3}$/.test(code) || !title) {
            setError("Inserisci un codice valido e il nome del giorno.");
            return;
        }

        setSaving(true);
        setError("");

        const { data: auth } = await supabase.auth.getSession();
        const user = auth.session?.user;

        if (!user) {
            router.replace("/");
            setSaving(false);
            return;
        }

        const duplicate = days.some(
            (day) =>
                day.day_code.toUpperCase() === code &&
                day.id !== editingDay?.id
        );

        if (duplicate) {
            setError(`Il giorno ${code} esiste già in questo template.`);
            setSaving(false);
            return;
        }

        const payload = {
            day_code: code,
            title,
            activity_type: "gym",
            notes: dayNotes.trim() || null,
        };

        let operationError;

        if (editingDay) {
            const { error: updateError } = await supabase
                .from("template_days")
                .update(payload)
                .eq("id", editingDay.id)
                .eq("user_id", user.id);

            operationError = updateError;
        } else {
            const { error: insertError } = await supabase
                .from("template_days")
                .insert({
                    ...payload,
                    template_id: selected.id,
                    user_id: user.id,
                    sort_order: days.length,
                });

            operationError = insertError;
        }

        if (operationError) {
            setError(`Errore nel salvataggio: ${operationError.message}`);
        } else {
            setNotice(editingDay ? "Giorno aggiornato." : "Giorno aggiunto.");
            setShowDayForm(false);
            await loadTemplateDetails(selected);
        }

        setSaving(false);
    }

    async function deleteDay(day: TemplateDay) {
        if (
            !window.confirm(
                `Eliminare il giorno ${day.day_code} e gli esercizi associati?`
            )
        ) {
            return;
        }

        const { data: auth } = await supabase.auth.getSession();
        const user = auth.session?.user;

        if (!user) {
            router.replace("/");
            return;
        }

        const { error: deleteError } = await supabase
            .from("template_days")
            .delete()
            .eq("id", day.id)
            .eq("user_id", user.id);

        if (deleteError) {
            setError(`Errore nell'eliminazione: ${deleteError.message}`);
            return;
        }

        setNotice("Giorno eliminato.");
        await loadTemplateDetails(selected!);
    }

    function openNewExercise() {
        setEditingExercise(null);
        setExerciseName("");
        setExerciseSets("3");
        setRepsMin("8");
        setRepsMax("12");
        setTut("");
        setRestSeconds("90");
        setExerciseNotes("");
        setShowExerciseForm(true);
        setError("");
    }

    function openEditExercise(exercise: TemplateExercise) {
        setEditingExercise(exercise);
        setExerciseName(exercise.exercise_name);
        setExerciseSets(String(exercise.sets));
        setRepsMin(String(exercise.reps_min ?? ""));
        setRepsMax(String(exercise.reps_max ?? ""));
        setTut(exercise.tut ?? "");
        setRestSeconds(String(exercise.rest_seconds ?? ""));
        setExerciseNotes(exercise.notes ?? "");
        setShowExerciseForm(true);
        setError("");
    }

    async function saveExercise(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selected || !selectedDayId) return;

        const sets = Number(exerciseSets);
        const min = repsMin === "" ? null : Number(repsMin);
        const max = repsMax === "" ? null : Number(repsMax);
        const rest = restSeconds === "" ? null : Number(restSeconds);

        if (
            !exerciseName.trim() ||
            !Number.isInteger(sets) ||
            sets < 1 ||
            (min !== null && (!Number.isInteger(min) || min < 1)) ||
            (max !== null && (!Number.isInteger(max) || max < 1)) ||
            (min !== null && max !== null && min > max) ||
            (rest !== null && (!Number.isInteger(rest) || rest < 0))
        ) {
            setError("Controlla nome, serie, ripetizioni e recupero.");
            return;
        }

        setSaving(true);
        setError("");

        const { data: auth } = await supabase.auth.getSession();
        const user = auth.session?.user;

        if (!user) {
            router.replace("/");
            setSaving(false);
            return;
        }

        const payload = {
            exercise_name: exerciseName.trim(),
            sets,
            reps_min: min,
            reps_max: max,
            tut: tut.trim() || null,
            rest_seconds: rest,
            notes: exerciseNotes.trim() || null,
        };

        let operationError;

        if (editingExercise) {
            const { error: updateError } = await supabase
                .from("template_exercises")
                .update(payload)
                .eq("id", editingExercise.id)
                .eq("user_id", user.id);

            operationError = updateError;
        } else {
            const { error: insertError } = await supabase
                .from("template_exercises")
                .insert({
                    ...payload,
                    template_day_id: selectedDayId,
                    user_id: user.id,
                    sort_order: exercises.filter(
                        (exercise) => exercise.template_day_id === selectedDayId
                    ).length,
                });

            operationError = insertError;
        }

        if (operationError) {
            setError(`Errore nel salvataggio: ${operationError.message}`);
        } else {
            setNotice(
                editingExercise ? "Esercizio aggiornato." : "Esercizio aggiunto."
            );
            setShowExerciseForm(false);
            await loadTemplateDetails(selected);
        }

        setSaving(false);
    }

    async function deleteExercise(exercise: TemplateExercise) {
        if (!window.confirm(`Eliminare "${exercise.exercise_name}"?`)) return;

        const { data: auth } = await supabase.auth.getSession();
        const user = auth.session?.user;

        if (!user) {
            router.replace("/");
            return;
        }

        const { error: deleteError } = await supabase
            .from("template_exercises")
            .delete()
            .eq("id", exercise.id)
            .eq("user_id", user.id);

        if (deleteError) {
            setError(`Errore nell'eliminazione: ${deleteError.message}`);
            return;
        }

        setNotice("Esercizio eliminato.");
        await loadTemplateDetails(selected!);
    }

    const selectedDay = days.find((day) => day.id === selectedDayId);

    const visibleExercises = exercises
        .filter((exercise) => exercise.template_day_id === selectedDayId)
        .sort((a, b) => a.sort_order - b.sort_order);

    return (
        <AppShell>
        <main className="plan-page">
            <section className="plan-hero">
                <p className="plan-eyebrow">ALLENAMENTO</p>
                <h1>I miei <span>template</span></h1>
                <p>
                    Crea schede riutilizzabili, organizza i giorni
                    e definisci gli esercizi di ogni allenamento.
                </p>
            </section>

            {error && <p className="plan-error" role="alert">{error}</p>}
            {notice && <p className="plan-notice" role="status">{notice}</p>}

            <section className="plan-day-details">
                <div className="plan-day-title">
                    <div>
                        <p className="plan-eyebrow">LE TUE SCHEDE</p>
                        <h2>Template di allenamento</h2>
                    </div>

                    <button
                        className="plan-primary"
                        onClick={() => {
                            setSelected(null);
                            setTemplateName("");
                            setTemplateDescription("");
                            setShowTemplateForm(true);
                            setError("");
                            setNotice("");
                        }}
                    >
                        + Nuovo template
                    </button>
                </div>

                {showTemplateForm && (
                    <form
                        className="plan-form-panel plan-form"
                        onSubmit={selected ? renameTemplate : createTemplate}
                    >
                        <label>
                            Nome del template *
                            <input
                                value={templateName}
                                onChange={(event) =>
                                    setTemplateName(event.target.value)
                                }
                                placeholder="Es. Push Pull Legs"
                                maxLength={120}
                                required
                            />
                        </label>

                        <label>
                            Descrizione
                            <textarea
                                value={templateDescription}
                                onChange={(event) =>
                                    setTemplateDescription(event.target.value)
                                }
                                placeholder="Descrivi la struttura della scheda..."
                                rows={3}
                            />
                        </label>

                        <div className="plan-form-grid">
                            <button
                                type="submit"
                                className="plan-primary"
                                disabled={saving}
                            >
                                {saving
                                    ? "Salvataggio..."
                                    : selected
                                        ? "Salva modifiche"
                                        : "Crea template"}
                            </button>

                            <button
                                type="button"
                                className="plan-back"
                                onClick={() => setShowTemplateForm(false)}
                            >
                                Annulla
                            </button>
                        </div>
                    </form>
                )}

                {loading ? (
                    <p className="plan-loading">Caricamento...</p>
                ) : (
                    <div className="plan-columns">
                        <article className="plan-panel">
                            <div className="plan-panel-heading">
                                <div>
                                    <h3>Le mie schede</h3>
                                    <p>{templates.length} template</p>
                                </div>
                            </div>

                            {templates.length === 0 && (
                                <p className="plan-no-items">
                                    Non hai ancora template. Creane uno per iniziare.
                                </p>
                            )}

                            {templates.map((template) => (
                                <div className="plan-item" key={template.id}>
                                    <button
                                        type="button"
                                        className="plan-select-mesocycle"
                                        onClick={() => {
                                            setShowTemplateForm(false);
                                            void loadTemplateDetails(template);
                                        }}
                                    >
                                        <h4>{template.name}</h4>
                                        <p>
                                            {template.description ||
                                                "Nessuna descrizione"}
                                        </p>
                                    </button>

                                    <div className="plan-item-actions">
                                        <button
                                            className="plan-back"
                                            onClick={() => {
                                                setSelected(template);
                                                setTemplateName(template.name);
                                                setTemplateDescription(
                                                    template.description ?? ""
                                                );
                                                setShowTemplateForm(true);
                                            }}
                                        >
                                            Modifica
                                        </button>

                                        <button
                                            className="plan-danger"
                                            onClick={() => void deleteTemplate(template)}
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
                                    <h3>Struttura della scheda</h3>
                                    <p>{selected?.name ?? "Seleziona un template"}</p>
                                </div>
                            </div>

                            {!selected ? (
                                <p className="plan-no-items">
                                    Seleziona una scheda per gestirne giorni ed esercizi.
                                </p>
                            ) : (
                                <>
                                    <button
                                        className="plan-primary"
                                        onClick={openNewDay}
                                    >
                                        + Aggiungi giorno
                                    </button>

                                    {showDayForm && (
                                        <form
                                            className="plan-form-panel plan-form"
                                            onSubmit={saveDay}
                                        >
                                            <h4>
                                                {editingDay
                                                    ? "Modifica giorno"
                                                    : "Nuovo giorno"}
                                            </h4>

                                            <label>
                                                Codice (A, B, C...)
                                                <input
                                                    value={dayCode}
                                                    onChange={(event) =>
                                                        setDayCode(event.target.value)
                                                    }
                                                    maxLength={3}
                                                    required
                                                />
                                            </label>

                                            <label>
                                                Nome del giorno
                                                <input
                                                    value={dayTitle}
                                                    onChange={(event) =>
                                                        setDayTitle(event.target.value)
                                                    }
                                                    placeholder="Es. Petto e tricipiti"
                                                    required
                                                />
                                            </label>

                                            <label>
                                                Note
                                                <textarea
                                                    value={dayNotes}
                                                    onChange={(event) =>
                                                        setDayNotes(event.target.value)
                                                    }
                                                    rows={2}
                                                />
                                            </label>

                                            <div className="plan-form-grid">
                                                <button
                                                    type="submit"
                                                    className="plan-primary"
                                                    disabled={saving}
                                                >
                                                    {saving ? "Salvataggio..." : "Salva giorno"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="plan-back"
                                                    onClick={() => setShowDayForm(false)}
                                                >
                                                    Annulla
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {days.map((day) => (
                                        <div className="plan-item" key={day.id}>
                                            <button
                                                type="button"
                                                className="plan-select-mesocycle"
                                                onClick={() => setSelectedDayId(day.id)}
                                            >
                                                <h4>
                                                    Giorno {day.day_code} — {day.title}
                                                </h4>
                                                <p>
                                                    {exercises.filter(
                                                        (exercise) => exercise.template_day_id === day.id
                                                    ).length}{" "}
                                                    esercizi
                                                </p>
                                            </button>

                                            <div className="plan-item-actions">
                                                <button
                                                    className="plan-back"
                                                    onClick={() => openEditDay(day)}
                                                >
                                                    Modifica
                                                </button>
                                                <button
                                                    className="plan-danger"
                                                    onClick={() => void deleteDay(day)}
                                                >
                                                    Elimina
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {selectedDay && (
                                        <div className="plan-form-panel">
                                            <p className="plan-eyebrow">
                                                GIORNO {selectedDay.day_code}
                                            </p>
                                            <h3>{selectedDay.title}</h3>

                                            {selectedDay.notes && (
                                                <p>{selectedDay.notes}</p>
                                            )}

                                            <button
                                                className="plan-primary"
                                                onClick={openNewExercise}
                                            >
                                                + Aggiungi esercizio
                                            </button>

                                            {showExerciseForm && (
                                                <form
                                                    className="plan-form"
                                                    onSubmit={saveExercise}
                                                >
                                                    <h4>
                                                        {editingExercise
                                                            ? "Modifica esercizio"
                                                            : "Nuovo esercizio"}
                                                    </h4>

                                                    <label>
                                                        Nome esercizio *
                                                        <input
                                                            value={exerciseName}
                                                            onChange={(event) =>
                                                                setExerciseName(event.target.value)
                                                            }
                                                            placeholder="Es. Panca piana"
                                                            required
                                                        />
                                                    </label>

                                                    <div className="plan-form-grid">
                                                        <label>
                                                            Serie
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="30"
                                                                value={exerciseSets}
                                                                onChange={(event) =>
                                                                    setExerciseSets(event.target.value)
                                                                }
                                                                required
                                                            />
                                                        </label>

                                                        <label>
                                                            Ripetizioni min.
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                value={repsMin}
                                                                onChange={(event) =>
                                                                    setRepsMin(event.target.value)
                                                                }
                                                            />
                                                        </label>

                                                        <label>
                                                            Ripetizioni max.
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                value={repsMax}
                                                                onChange={(event) =>
                                                                    setRepsMax(event.target.value)
                                                                }
                                                            />
                                                        </label>
                                                    </div>

                                                    <div className="plan-form-grid">
                                                        <label>
                                                            TUT
                                                            <input
                                                                value={tut}
                                                                onChange={(event) =>
                                                                    setTut(event.target.value)
                                                                }
                                                                placeholder="Es. 3-1-1"
                                                            />
                                                        </label>

                                                        <label>
                                                            Recupero (secondi)
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={restSeconds}
                                                                onChange={(event) =>
                                                                    setRestSeconds(event.target.value)
                                                                }
                                                            />
                                                        </label>
                                                    </div>

                                                    <label>
                                                        Note tecniche
                                                        <textarea
                                                            value={exerciseNotes}
                                                            onChange={(event) =>
                                                                setExerciseNotes(event.target.value)
                                                            }
                                                            rows={2}
                                                        />
                                                    </label>

                                                    <button
                                                        type="submit"
                                                        className="plan-primary"
                                                        disabled={saving}
                                                    >
                                                        {saving
                                                            ? "Salvataggio..."
                                                            : "Salva esercizio"}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="plan-back"
                                                        onClick={() =>
                                                            setShowExerciseForm(false)
                                                        }
                                                    >
                                                        Annulla
                                                    </button>
                                                </form>
                                            )}

                                            {visibleExercises.map((exercise) => (
                                                <div
                                                    className="plan-item"
                                                    key={exercise.id}
                                                >
                                                    <div>
                                                        <h4>{exercise.exercise_name}</h4>
                                                        <p>
                                                            {exercise.sets} ×{" "}
                                                            {exercise.reps_min ?? "?"}
                                                            –
                                                            {exercise.reps_max ?? "?"} ripetizioni
                                                        </p>
                                                        <p>
                                                            TUT: {exercise.tut || "—"} · Recupero:{" "}
                                                            {exercise.rest_seconds ?? "—"} s
                                                        </p>
                                                        {exercise.notes && (
                                                            <p>{exercise.notes}</p>
                                                        )}
                                                    </div>

                                                    <div className="plan-item-actions">
                                                        <button
                                                            className="plan-back"
                                                            onClick={() =>
                                                                openEditExercise(exercise)
                                                            }
                                                        >
                                                            Modifica
                                                        </button>
                                                        <button
                                                            className="plan-danger"
                                                            onClick={() =>
                                                                void deleteExercise(exercise)
                                                            }
                                                        >
                                                            Elimina
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </article>
                    </div>
                )}
            </section>
        </main>
        </AppShell>
    );
}
