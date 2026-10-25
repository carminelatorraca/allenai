
"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import FoodSearchInput from "@/components/FoodSearchInput";
import { SparklesIcon, UploadIcon } from "@/components/icons";
import type { FoodSearchResult } from "@/app/api/food-search/route";
import type { ExtractedMeal } from "@/lib/meal-plan-schema";
import { SLOT_LABEL, SLOT_ORDER, num, round, sumMacros } from "@/lib/nutrition";
import "../nutrition-plan.css";
import "./plan-detail.css";

const WEEKDAY_LABEL = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

const PLAN_DAYS_SELECT =
  "id,weekday,notes,nutrition_plan_meals(id,plan_day_id,meal_type,title,instructions,sort_order,nutrition_plan_meal_items(id,food_name,quantity_g,calories,protein_g,carbs_g,fat_g,sort_order))";

type PlanMealItem = {
  id: string;
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sort_order: number;
};

type PlanMeal = {
  id: string;
  plan_day_id: string;
  meal_type: string;
  title: string;
  instructions: string | null;
  sort_order: number;
  items: PlanMealItem[];
};

type PlanDay = {
  id: string;
  weekday: number;
  notes: string | null;
  meals: PlanMeal[];
};

type NutritionPlan = {
  id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  duration_weeks: number | null;
  status: string;
};

type ItemDraft = {
  food_name: string;
  quantity_g: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

type MealForm = {
  meal_type: string;
  title: string;
  instructions: string;
  weekday: number;
  items: ItemDraft[];
};

const emptyItemDraft: ItemDraft = {
  food_name: "",
  quantity_g: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
};

const emptyMealForm: MealForm = {
  meal_type: "breakfast",
  title: "",
  instructions: "",
  weekday: 0,
  items: [emptyItemDraft],
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Si è verificato un errore imprevisto.";
}

/**
 * Le risposte AI possono arrivare vuote o troncate (richiesta interrotta,
 * riavvio del server dev, timeout di rete) — in quel caso response.json()
 * lancia "Unexpected end of JSON input", poco comprensibile per l'utente.
 */
async function parseAiResponse(
  response: Response,
): Promise<{ meals?: ExtractedMeal[]; message?: string }> {
  const text = await response.text();

  if (!text) {
    throw new Error(
      "La richiesta si è interrotta prima di ricevere una risposta (es. generazione troppo lunga o connessione persa). Riprova.",
    );
  }

  try {
    return JSON.parse(text) as { meals?: ExtractedMeal[]; message?: string };
  } catch {
    throw new Error("Risposta non valida dal server. Riprova.");
  }
}

/**
 * I modelli gratuiti (es. Gemini Flash) possono rispondere "503 high demand"
 * in modo intermittente. Con 7 richieste in sequenza, basta un solo errore
 * transitorio per far fallire l'intera generazione: riprova prima di
 * arrendersi.
 */
function isTransientAiError(message: string): boolean {
  return /503|UNAVAILABLE|high demand|sovraccaric|overloaded/i.test(message);
}

async function generateDayWithRetry(
  weekday: number,
  payload: Record<string, unknown>,
  onProgress: (message: string) => void,
): Promise<ExtractedMeal[]> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onProgress(
      attempt === 1
        ? `Genero ${WEEKDAY_LABEL[weekday]} (${weekday + 1} di 7)...`
        : `${WEEKDAY_LABEL[weekday]}: il modello AI è sovraccarico, riprovo (tentativo ${attempt}/${maxAttempts})...`,
    );

    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
    }

    try {
      const response = await fetch("/api/nutrition/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await parseAiResponse(response);

      if (!response.ok) {
        const message = data.message ?? "impossibile generare il giorno.";
        if (attempt < maxAttempts && isTransientAiError(message)) {
          lastError = new Error(message);
          continue;
        }
        throw new Error(`${WEEKDAY_LABEL[weekday]}: ${message}`);
      }

      return data.meals ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt < maxAttempts && isTransientAiError(message)) {
        lastError = err instanceof Error ? err : new Error(message);
        continue;
      }

      throw err;
    }
  }

  throw lastError ?? new Error(`${WEEKDAY_LABEL[weekday]}: impossibile generare il giorno.`);
}

function parseNonNegative(value: string): number | null {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export default function PlanDetail({ planId }: { planId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showMealForm, setShowMealForm] = useState(false);
  const [editingMeal, setEditingMeal] = useState<PlanMeal | null>(null);
  const [mealForm, setMealForm] = useState<MealForm>(emptyMealForm);

  const [importQueue, setImportQueue] = useState<ExtractedMeal[]>([]);
  const [importIndex, setImportIndex] = useState(0);
  const [importBusy, setImportBusy] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiNotes, setAiNotes] = useState("");
  const [generateProgress, setGenerateProgress] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const loadPlan = useCallback(
    async (uid: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError("");

      try {
        const { data: planData, error: planError } = await supabase
          .from("nutrition_plans")
          .select("id,name,goal,start_date,duration_weeks,status")
          .eq("id", planId)
          .eq("user_id", uid)
          .single();

        if (planError) throw planError;

        const { data: daysData, error: daysError } = await supabase
          .from("nutrition_plan_days")
          .select(PLAN_DAYS_SELECT)
          .eq("plan_id", planId)
          .eq("user_id", uid)
          .order("weekday", { ascending: true });

        if (daysError) throw daysError;

        type RawDay = Omit<PlanDay, "meals"> & {
          nutrition_plan_meals:
            | (Omit<PlanMeal, "items"> & {
                nutrition_plan_meal_items: PlanMealItem[] | null;
              })[]
            | null;
        };

        const rawDays = (daysData ?? []) as unknown as RawDay[];

        setDays(
          rawDays.map(({ nutrition_plan_meals, ...day }) => ({
            ...day,
            meals: (nutrition_plan_meals ?? [])
              .map((meal) => {
                const { nutrition_plan_meal_items, ...rest } = meal;
                return {
                  ...rest,
                  items: (nutrition_plan_meal_items ?? [])
                    .map((item) => ({
                      ...item,
                      quantity_g: num(item.quantity_g),
                      calories: num(item.calories),
                      protein_g: num(item.protein_g),
                      carbs_g: num(item.carbs_g),
                      fat_g: num(item.fat_g),
                    }))
                    .sort((a, b) => a.sort_order - b.sort_order),
                };
              })
              .sort((a, b) => a.sort_order - b.sort_order),
          })),
        );

        setPlan(planData as NutritionPlan);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [planId],
  );

  useEffect(() => {
    let active = true;

    async function init() {
      const { data, error: authError } = await supabase.auth.getSession();

      if (!active) return;

      if (authError || !data.session) {
        setError("Devi effettuare l'accesso.");
        setLoading(false);
        return;
      }

      setUserId(data.session.user.id);
      await loadPlan(data.session.user.id);
    }

    void init();

    return () => {
      active = false;
    };
  }, [loadPlan]);

  function openNewMeal(dayId: string) {
    const day = days.find((d) => d.id === dayId);
    setEditingMeal(null);
    setMealForm({ ...emptyMealForm, weekday: day?.weekday ?? 0 });
    setShowMealForm(true);
    setError("");
  }

  function openEditMeal(meal: PlanMeal) {
    const day = days.find((d) => d.id === meal.plan_day_id);
    setEditingMeal(meal);
    setMealForm({
      meal_type: meal.meal_type,
      title: meal.title,
      instructions: meal.instructions ?? "",
      weekday: day?.weekday ?? 0,
      items:
        meal.items.length > 0
          ? meal.items.map((item) => ({
              food_name: item.food_name,
              quantity_g: String(item.quantity_g),
              calories: String(item.calories),
              protein_g: String(item.protein_g),
              carbs_g: String(item.carbs_g),
              fat_g: String(item.fat_g),
            }))
          : [emptyItemDraft],
    });
    setShowMealForm(true);
    setError("");
  }

  function loadQueueItemIntoForm(index: number, queue: ExtractedMeal[], weekdayOverride?: number) {
    const item = queue[index];
    if (!item) return;

    setEditingMeal(null);
    setMealForm({
      meal_type: item.meal_type,
      title: item.title,
      instructions: item.instructions ?? "",
      weekday: item.weekday >= 0 && item.weekday <= 6 ? item.weekday : (weekdayOverride ?? 0),
      items:
        item.items.length > 0
          ? item.items.map((food) => ({
              food_name: food.food_name,
              quantity_g: String(food.quantity_g),
              calories: String(food.calories),
              protein_g: String(food.protein_g),
              carbs_g: String(food.carbs_g),
              fat_g: String(food.fat_g),
            }))
          : [emptyItemDraft],
    });
    setShowMealForm(true);
    setError("");
    setNotice("");
  }

  function cancelImport() {
    setImportQueue([]);
    setImportIndex(0);
    setShowMealForm(false);
  }

  function skipImportItem() {
    const nextIndex = importIndex + 1;

    if (nextIndex >= importQueue.length) {
      setNotice("Importazione completata.");
      cancelImport();
      return;
    }

    setImportIndex(nextIndex);
    loadQueueItemIntoForm(nextIndex, importQueue, mealForm.weekday);
  }

  async function handlePdfFile(file: File) {
    if (!file) return;

    setImportBusy(true);
    setError("");
    setNotice("");

    try {
      const maxAttempts = 2;
      let meals: ExtractedMeal[] = [];

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (attempt > 1) {
          setGenerateProgress(
            `Il modello AI è sovraccarico, riprovo (tentativo ${attempt}/${maxAttempts})...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/nutrition/extract-pdf", {
          method: "POST",
          body: formData,
        });

        const data = await parseAiResponse(response);

        if (!response.ok) {
          const message = data.message ?? "Impossibile leggere il PDF.";
          if (attempt < maxAttempts && isTransientAiError(message)) continue;
          throw new Error(message);
        }

        meals = data.meals ?? [];
        break;
      }

      if (meals.length === 0) {
        setError("Non è stato trovato nessun pasto nel PDF.");
        return;
      }

      setImportQueue(meals);
      setImportIndex(0);
      loadQueueItemIntoForm(0, meals);
      setNotice(
        `${meals.length} ${meals.length === 1 ? "pasto trovato" : "pasti trovati"} nel PDF. Rivedili e salvali uno per uno.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerateProgress("");
      setImportBusy(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

  async function handleGenerateAi() {
    if (!userId) return;

    setImportBusy(true);
    setError("");
    setNotice("");

    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("height_cm,current_weight_kg,sex,birth_date,goal,activity_level")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile?.height_cm || !profile?.current_weight_kg) {
        setError("Completa altezza e peso nel tuo profilo prima di generare un piano con l'AI.");
        return;
      }

      let age: number | null = null;

      if (profile.birth_date) {
        const birth = new Date(`${profile.birth_date}T00:00:00`);
        const today = new Date();
        age = today.getFullYear() - birth.getFullYear();
        if (
          today.getMonth() < birth.getMonth() ||
          (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
        ) {
          age -= 1;
        }
      }

      // Un giorno alla volta: 7 richieste brevi sono molto più affidabili di
      // un'unica richiesta da 28 pasti, che può impiegare minuti ed essere
      // interrotta (riavvio del dev server, timeout di rete, ecc.).
      const allMeals: ExtractedMeal[] = [];

      for (let weekday = 0; weekday < 7; weekday += 1) {
        const meals = await generateDayWithRetry(
          weekday,
          {
            heightCm: profile.height_cm,
            weightKg: profile.current_weight_kg,
            sex: profile.sex,
            age,
            goal: profile.goal,
            activityLevel: profile.activity_level,
            notes: aiNotes.trim() || undefined,
            weekday,
          },
          setGenerateProgress,
        );

        allMeals.push(...meals);
      }

      if (allMeals.length === 0) {
        setError("L'AI non ha generato nessun pasto. Riprova.");
        return;
      }

      setImportQueue(allMeals);
      setImportIndex(0);
      setShowAiPanel(false);
      loadQueueItemIntoForm(0, allMeals);
      setNotice(`Piano generato: ${allMeals.length} pasti. Rivedili e salvali uno per uno.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerateProgress("");
      setImportBusy(false);
    }
  }

  function updateMealField<K extends keyof MealForm>(key: K, value: MealForm[K]) {
    setMealForm((current) => ({ ...current, [key]: value }));
  }

  function updateItemDraft(index: number, field: keyof ItemDraft, value: string) {
    setMealForm((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  }

  function selectFoodResult(index: number, result: FoodSearchResult) {
    setMealForm((current) => ({
      ...current,
      items: current.items.map((item, i) =>
        i === index
          ? {
              food_name: result.name,
              quantity_g: "100",
              calories: String(Math.round(result.calories_100g ?? 0)),
              protein_g: String(result.protein_100g ?? 0),
              carbs_g: String(result.carbs_100g ?? 0),
              fat_g: String(result.fat_100g ?? 0),
            }
          : item,
      ),
    }));
  }

  function addItemRow() {
    setMealForm((current) => ({ ...current, items: [...current.items, emptyItemDraft] }));
  }

  function removeItemRow(index: number) {
    setMealForm((current) => ({
      ...current,
      items: current.items.filter((_, i) => i !== index),
    }));
  }

  async function saveMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId) return;

    const targetDay = days.find((d) => d.weekday === mealForm.weekday);

    if (!targetDay) {
      setError("Giorno non valido.");
      return;
    }

    const title = mealForm.title.trim();
    if (!title) {
      setError("Inserisci il nome del pasto.");
      return;
    }

    const parsedItems: {
      food_name: string;
      quantity_g: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      sort_order: number;
    }[] = [];

    for (const item of mealForm.items) {
      if (!item.food_name.trim()) continue;

      const quantity = parseNonNegative(item.quantity_g);
      const calories = parseNonNegative(item.calories);
      const protein = parseNonNegative(item.protein_g);
      const carbs = parseNonNegative(item.carbs_g);
      const fat = parseNonNegative(item.fat_g);

      if (quantity === null || calories === null || protein === null || carbs === null || fat === null) {
        setError(`Controlla i valori numerici per "${item.food_name.trim()}".`);
        return;
      }

      parsedItems.push({
        food_name: item.food_name.trim(),
        quantity_g: quantity,
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        sort_order: parsedItems.length,
      });
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      let mealId: string;

      if (editingMeal) {
        const { error: updateError } = await supabase
          .from("nutrition_plan_meals")
          .update({
            plan_day_id: targetDay.id,
            meal_type: mealForm.meal_type,
            title,
            instructions: mealForm.instructions.trim() || null,
          })
          .eq("id", editingMeal.id)
          .eq("user_id", userId);

        if (updateError) throw updateError;

        mealId = editingMeal.id;

        const { error: deleteItemsError } = await supabase
          .from("nutrition_plan_meal_items")
          .delete()
          .eq("plan_meal_id", mealId);

        if (deleteItemsError) throw deleteItemsError;
      } else {
        const { data: created, error: insertError } = await supabase
          .from("nutrition_plan_meals")
          .insert({
            plan_day_id: targetDay.id,
            user_id: userId,
            meal_type: mealForm.meal_type,
            title,
            instructions: mealForm.instructions.trim() || null,
            sort_order: targetDay.meals.length,
          })
          .select("id")
          .single();

        if (insertError || !created) {
          throw new Error(insertError?.message ?? "Impossibile creare il pasto.");
        }

        mealId = created.id;
      }

      if (parsedItems.length > 0) {
        const { error: insertItemsError } = await supabase
          .from("nutrition_plan_meal_items")
          .insert(parsedItems.map((item) => ({ ...item, plan_meal_id: mealId, user_id: userId })));

        if (insertItemsError) throw insertItemsError;
      }

      await loadPlan(userId, { silent: true });

      if (importQueue.length > 0 && !editingMeal) {
        const nextIndex = importIndex + 1;

        if (nextIndex < importQueue.length) {
          setImportIndex(nextIndex);
          loadQueueItemIntoForm(nextIndex, importQueue, mealForm.weekday);
          setNotice(`Pasto salvato (${nextIndex} di ${importQueue.length}). Rivedi il prossimo.`);
        } else {
          setImportQueue([]);
          setImportIndex(0);
          setShowMealForm(false);
          setNotice("Pasto salvato. Importazione completata.");
        }
      } else {
        setShowMealForm(false);
        setNotice(editingMeal ? "Pasto aggiornato." : "Pasto aggiunto al piano.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMeal(meal: PlanMeal) {
    if (!userId) return;

    const confirmed = window.confirm(`Vuoi eliminare il pasto "${meal.title}"?`);
    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      const { error: deleteItemsError } = await supabase
        .from("nutrition_plan_meal_items")
        .delete()
        .eq("plan_meal_id", meal.id);

      if (deleteItemsError) throw deleteItemsError;

      const { error: deleteMealError } = await supabase
        .from("nutrition_plan_meals")
        .delete()
        .eq("id", meal.id)
        .eq("user_id", userId);

      if (deleteMealError) throw deleteMealError;

      setNotice("Pasto eliminato.");
      await loadPlan(userId, { silent: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="nplan-loading">Caricamento piano...</p>
      </AppShell>
    );
  }

  if (!plan) {
    return (
      <AppShell>
        <main className="nplan-page">
          <Link className="nplan-secondary" href="/nutrition/plan">
            ← Torna ai piani
          </Link>
          <p className="nplan-error" role="alert">
            {error || "Piano non trovato."}
          </p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="nplan-page">
        <Link className="nplan-secondary pdetail-back" href="/nutrition/plan">
          ← Torna ai piani
        </Link>

        <section className="nplan-hero">
          <p className="nplan-eyebrow">PIANO ALIMENTARE</p>
          <h1>{plan.name}</h1>
          <p>
            {plan.goal ?? "Nessun obiettivo specificato"}
            {" · "}
            {plan.duration_weeks ? `${plan.duration_weeks} settimane` : "Continuativo"}
          </p>
        </section>

        <div className="pdetail-import-actions">
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            className="nutrition-file-input"
            id="pdf-import-input"
            disabled={importBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handlePdfFile(file);
            }}
          />
          <label
            htmlFor="pdf-import-input"
            className={`nplan-secondary${importBusy ? " pdetail-disabled" : ""}`}
          >
            <UploadIcon size={15} />
            {importBusy ? "Elaborazione..." : "Importa da PDF"}
          </label>
          <button
            type="button"
            className="nplan-secondary"
            disabled={importBusy}
            onClick={() => setShowAiPanel((current) => !current)}
          >
            <SparklesIcon size={15} />
            Genera con AI
          </button>
        </div>

        {importBusy && generateProgress && !showAiPanel && (
          <p className="pdetail-note" role="status" aria-live="polite">
            {generateProgress}
          </p>
        )}

        {showAiPanel && (
          <div className="nplan-form-panel nplan-form">
            <h3>Genera un piano settimanale con l&apos;AI</h3>
            <p className="pdetail-note">
              Useremo i dati del tuo profilo (altezza, peso, obiettivo, attività) per generare
              colazione, pranzo, spuntino e cena per ciascun giorno della settimana.
            </p>
            <label>
              Note o preferenze (facoltativo)
              <textarea
                value={aiNotes}
                onChange={(event) => setAiNotes(event.target.value)}
                placeholder="Es. vegetariano, niente latticini, pasti veloci..."
                rows={2}
              />
            </label>
            {importBusy && generateProgress && (
              <p className="pdetail-note" role="status" aria-live="polite">
                {generateProgress}
              </p>
            )}

            <div className="pdetail-form-actions">
              <button type="button" className="nplan-secondary" onClick={() => setShowAiPanel(false)} disabled={importBusy}>
                Annulla
              </button>
              <button
                type="button"
                className="nplan-primary"
                disabled={importBusy}
                onClick={() => void handleGenerateAi()}
              >
                {importBusy ? "Generazione..." : "Genera piano settimanale"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="nplan-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="nplan-notice" role="status">
            {notice}
          </p>
        )}

        {showMealForm && (
          <form className="nplan-form-panel nplan-form" onSubmit={saveMeal}>
            <h3>
              {importQueue.length > 0
                ? `Pasto importato ${importIndex + 1} di ${importQueue.length}`
                : editingMeal
                  ? "Modifica pasto"
                  : "Nuovo pasto"}
            </h3>

            {importQueue.length > 0 && (
              <p className="pdetail-note">
                Rivedi e correggi i dati prima di salvare. Il campo &quot;Giorno&quot; è stato
                compilato automaticamente quando riconosciuto nel documento: controllalo prima
                di salvare.
              </p>
            )}

            <div className="nplan-form-grid">
              <label>
                Giorno della settimana
                <select
                  value={mealForm.weekday}
                  onChange={(event) => updateMealField("weekday", Number(event.target.value))}
                >
                  {WEEKDAY_LABEL.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Momento del pasto
                <select
                  value={mealForm.meal_type}
                  onChange={(event) => updateMealField("meal_type", event.target.value)}
                >
                  {SLOT_ORDER.map((slot) => (
                    <option key={slot} value={slot}>
                      {SLOT_LABEL[slot]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Nome del pasto *
                <input
                  value={mealForm.title}
                  onChange={(event) => updateMealField("title", event.target.value)}
                  placeholder="Es. Pollo e riso"
                  required
                />
              </label>
            </div>

            <label>
              Istruzioni / note
              <textarea
                value={mealForm.instructions}
                onChange={(event) => updateMealField("instructions", event.target.value)}
                rows={2}
                placeholder="Note facoltative sulla preparazione"
              />
            </label>

            <div className="pdetail-items-heading">
              <span>Alimenti del pasto</span>
              <button type="button" className="nplan-secondary" onClick={addItemRow}>
                + Aggiungi alimento
              </button>
            </div>

            {mealForm.items.map((item, index) => (
              <div className="pdetail-item-row" key={index}>
                <FoodSearchInput
                  value={item.food_name}
                  onChangeName={(value) => updateItemDraft(index, "food_name", value)}
                  onSelect={(result) => selectFoodResult(index, result)}
                  placeholder="Cerca alimento (es. petto di pollo)"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={item.quantity_g}
                  onChange={(event) => updateItemDraft(index, "quantity_g", event.target.value)}
                  placeholder="g"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={item.calories}
                  onChange={(event) => updateItemDraft(index, "calories", event.target.value)}
                  placeholder="kcal"
                />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={item.protein_g}
                  onChange={(event) => updateItemDraft(index, "protein_g", event.target.value)}
                  placeholder="P g"
                />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={item.carbs_g}
                  onChange={(event) => updateItemDraft(index, "carbs_g", event.target.value)}
                  placeholder="C g"
                />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={item.fat_g}
                  onChange={(event) => updateItemDraft(index, "fat_g", event.target.value)}
                  placeholder="F g"
                />
                {mealForm.items.length > 1 && (
                  <button
                    type="button"
                    className="pdetail-item-remove"
                    onClick={() => removeItemRow(index)}
                    aria-label="Rimuovi alimento"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            <div className="pdetail-form-actions">
              <button
                type="button"
                className="nplan-secondary"
                onClick={() => (importQueue.length > 0 ? cancelImport() : setShowMealForm(false))}
              >
                {importQueue.length > 0 ? "Annulla importazione" : "Annulla"}
              </button>
              {importQueue.length > 0 && (
                <button type="button" className="nplan-secondary" onClick={skipImportItem}>
                  Salta questo pasto
                </button>
              )}
              <button type="submit" className="nplan-primary" disabled={saving}>
                {saving
                  ? "Salvataggio..."
                  : importQueue.length > 0
                    ? "Salva e vai al prossimo"
                    : "Salva pasto"}
              </button>
            </div>
          </form>
        )}

        <div className="pdetail-days">
          {days.map((day) => {
            const totals = sumMacros(day.meals.flatMap((meal) => meal.items));

            return (
              <details className="pdetail-day" key={day.id} open={day.meals.length > 0}>
                <summary>
                  <span>{WEEKDAY_LABEL[day.weekday]}</span>
                  <span className="pdetail-day__meta">
                    {day.meals.length} {day.meals.length === 1 ? "pasto" : "pasti"}
                    {totals.kcal > 0 ? ` · ${round(totals.kcal)} kcal` : ""}
                  </span>
                </summary>

                <div className="pdetail-day__body">
                  {day.meals.length === 0 ? (
                    <p className="pdetail-no-items">Nessun pasto per questo giorno.</p>
                  ) : (
                    day.meals.map((meal) => (
                      <article className="pdetail-meal" key={meal.id}>
                        <div className="pdetail-meal__row">
                          <div>
                            <span className="pdetail-meal__slot">
                              {SLOT_LABEL[meal.meal_type as keyof typeof SLOT_LABEL] ?? meal.meal_type}
                            </span>
                            <h4>{meal.title}</h4>
                          </div>
                        </div>

                        {meal.instructions && <p className="pdetail-note">{meal.instructions}</p>}

                        {meal.items.length > 0 && (
                          <ul className="pdetail-item-list">
                            {meal.items.map((item) => (
                              <li key={item.id}>
                                <span>{item.food_name}</span>
                                <span>
                                  {round(item.quantity_g)} g · {round(item.calories)} kcal
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="pdetail-meal__actions">
                          <button type="button" className="nplan-secondary" onClick={() => openEditMeal(meal)}>
                            Modifica
                          </button>
                          <button
                            type="button"
                            className="nplan-danger"
                            onClick={() => void deleteMeal(meal)}
                          >
                            Elimina
                          </button>
                        </div>
                      </article>
                    ))
                  )}

                  <button
                    type="button"
                    className="nplan-secondary pdetail-add-meal"
                    onClick={() => openNewMeal(day.id)}
                  >
                    + Pasto per {WEEKDAY_LABEL[day.weekday]}
                  </button>
                </div>
              </details>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
