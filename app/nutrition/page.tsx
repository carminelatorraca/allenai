
"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import FoodAlternativeSearch, { type ReplacementItem } from "@/components/FoodAlternativeSearch";
import { CheckIcon, ChevronDownIcon, PencilIcon, TrashIcon } from "@/components/icons";
import NutritionPlanModal from "@/components/NutritionPlanModal";
import { getExtraDailyTrainingCalories } from "@/lib/activity";
import {
  MEAL_STATUS_LABEL,
  SLOT_LABEL,
  SLOT_ORDER,
  calculateMacroTargets,
  num,
  round,
  sumMacros,
  toSlot,
  type MacroTargets,
} from "@/lib/nutrition";
import "./nutrition.css";

/* ------------------------------------------------------------------ */
/* Tipi                                                                */
/* ------------------------------------------------------------------ */

type PlanPreviewItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sort_order: number;
};

type PlanPreviewMeal = {
  id: string;
  meal_type: string;
  title: string;
  instructions: string | null;
  sort_order: number;
  items: PlanPreviewItem[];
};

type PlanPreview = {
  planId: string;
  planName: string;
  weekdayLabel: string;
  planDayId: string | null;
  meals: PlanPreviewMeal[];
};

type PlanItemDraft = {
  food_name: string;
  quantity_g: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

type PlanMealFormState = {
  meal_type: string;
  title: string;
  instructions: string;
  items: PlanItemDraft[];
};

const emptyPlanItemDraft: PlanItemDraft = {
  food_name: "",
  quantity_g: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
};

const emptyPlanMealForm: PlanMealFormState = {
  meal_type: "breakfast",
  title: "",
  instructions: "",
  items: [emptyPlanItemDraft],
};

const WEEKDAY_LABEL = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

type PlannedItem = {
  id: string;
  meal_id: string;
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sort_order: number;
};

type PlannedMeal = {
  id: string;
  plan_date: string;
  meal_type: string;
  title: string;
  instructions: string | null;
  status: string;
  items: PlannedItem[];
};

type FoodEntry = {
  id: string;
  eaten_at: string;
  meal_type: string;
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
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
  plan_date: string;
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
  plan_date: "",
  items: [emptyItemDraft],
};

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function formatHeading(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Si è verificato un errore imprevisto.";
}

function parseNonNegative(value: string): number | null {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Pagina                                                              */
/* ------------------------------------------------------------------ */

function NutritionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [plannedMeals, setPlannedMeals] = useState<PlannedMeal[]>([]);
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showMealForm, setShowMealForm] = useState(false);
  const [editingMeal, setEditingMeal] = useState<PlannedMeal | null>(null);
  const [mealForm, setMealForm] = useState<MealForm>(emptyMealForm);

  const [macroTargets, setMacroTargets] = useState<MacroTargets | null>(null);

  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [copyingMealId, setCopyingMealId] = useState<string | null>(null);
  const [copyingAllDay, setCopyingAllDay] = useState(false);
  const [swapSearchKey, setSwapSearchKey] = useState<string | null>(null);
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showPlanMealForm, setShowPlanMealForm] = useState(false);
  const [editingPlanMeal, setEditingPlanMeal] = useState<PlanPreviewMeal | null>(null);
  const [planMealForm, setPlanMealForm] = useState<PlanMealFormState>(emptyPlanMealForm);
  const [savingPlanMeal, setSavingPlanMeal] = useState(false);
  const [previewOverride, setPreviewOverride] = useState<{ date: string; weekday: number } | null>(
    null,
  );
  const previewWeekday =
    previewOverride && previewOverride.date === selectedDate ? previewOverride.weekday : null;
  const effectiveWeekday =
    previewWeekday ?? (new Date(`${selectedDate}T12:00:00`).getDay() + 6) % 7;

  const loadPlanPreview = useCallback(async (uid: string, dateKey: string, weekdayOverride?: number) => {
    setPlanLoading(true);

    try {
      const weekday = weekdayOverride ?? (new Date(`${dateKey}T12:00:00`).getDay() + 6) % 7;

      const { data: activePlan } = await supabase
        .from("nutrition_plans")
        .select("id,name")
        .eq("user_id", uid)
        .eq("status", "active")
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      let plan = activePlan;

      if (!plan) {
        const { data: latestPlan } = await supabase
          .from("nutrition_plans")
          .select("id,name")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        plan = latestPlan;
      }

      if (!plan) {
        setPlanPreview(null);
        return;
      }

      const { data: dayData, error: dayError } = await supabase
        .from("nutrition_plan_days")
        .select(
          "id,weekday,nutrition_plan_meals(id,meal_type,title,instructions,sort_order,nutrition_plan_meal_items(food_name,quantity_g,calories,protein_g,carbs_g,fat_g,sort_order))",
        )
        .eq("plan_id", plan.id)
        .eq("user_id", uid)
        .eq("weekday", weekday)
        .maybeSingle();

      if (dayError || !dayData) {
        setPlanPreview({
          planId: plan.id,
          planName: plan.name,
          weekdayLabel: WEEKDAY_LABEL[weekday],
          planDayId: null,
          meals: [],
        });
        return;
      }

      type RawMeal = Omit<PlanPreviewMeal, "items"> & {
        nutrition_plan_meal_items: PlanPreviewItem[] | null;
      };

      const rawMeals = (dayData.nutrition_plan_meals ?? []) as unknown as RawMeal[];

      setPlanPreview({
        planId: plan.id,
        planName: plan.name,
        weekdayLabel: WEEKDAY_LABEL[weekday],
        planDayId: dayData.id,
        meals: rawMeals
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
      });
    } catch {
      setPlanPreview(null);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  async function insertPlanMealIntoDiary(uid: string, meal: PlanPreviewMeal) {
    const { data: created, error: insertError } = await supabase
      .from("planned_meals")
      .insert({
        user_id: uid,
        plan_date: selectedDate,
        meal_type: meal.meal_type,
        title: meal.title,
        instructions: meal.instructions,
        status: "planned",
      })
      .select("id")
      .single();

    if (insertError || !created) {
      throw new Error(insertError?.message ?? "Impossibile copiare il pasto.");
    }

    if (meal.items.length > 0) {
      const { error: insertItemsError } = await supabase.from("planned_meal_items").insert(
        meal.items.map((item, index) => ({
          meal_id: created.id,
          user_id: uid,
          food_name: item.food_name,
          quantity_g: item.quantity_g,
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          sort_order: index,
        })),
      );

      if (insertItemsError) throw insertItemsError;
    }
  }

  async function copyPlanMealToDiary(meal: PlanPreviewMeal) {
    if (!userId) return;

    setCopyingMealId(meal.id);
    setError("");
    setNotice("");

    try {
      await insertPlanMealIntoDiary(userId, meal);
      setNotice(`"${meal.title}" aggiunto ai pasti pianificati di oggi.`);
      await loadDay(userId, selectedDate, { silent: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCopyingMealId(null);
    }
  }

  async function copyAllPlanMealsToDiary() {
    if (!userId || !planPreview || planPreview.meals.length === 0) return;

    setCopyingAllDay(true);
    setError("");
    setNotice("");

    try {
      for (const meal of planPreview.meals) {
        await insertPlanMealIntoDiary(userId, meal);
      }
      setNotice(`${planPreview.meals.length} pasti aggiunti ai pasti pianificati di oggi.`);
      await loadDay(userId, selectedDate, { silent: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCopyingAllDay(false);
    }
  }

  function openNewPlanMeal() {
    setEditingPlanMeal(null);
    setPlanMealForm(emptyPlanMealForm);
    setShowPlanMealForm(true);
    setError("");
  }

  function openEditPlanMeal(meal: PlanPreviewMeal) {
    setEditingPlanMeal(meal);
    setPlanMealForm({
      meal_type: meal.meal_type,
      title: meal.title,
      instructions: meal.instructions ?? "",
      items: meal.items.length
        ? meal.items.map((item) => ({
            food_name: item.food_name,
            quantity_g: item.quantity_g.toString(),
            calories: item.calories.toString(),
            protein_g: item.protein_g.toString(),
            carbs_g: item.carbs_g.toString(),
            fat_g: item.fat_g.toString(),
          }))
        : [emptyPlanItemDraft],
    });
    setShowPlanMealForm(true);
    setError("");
  }

  function updatePlanMealField<K extends keyof PlanMealFormState>(key: K, value: PlanMealFormState[K]) {
    setPlanMealForm((current) => ({ ...current, [key]: value }));
  }

  function updatePlanItemDraft(index: number, field: keyof PlanItemDraft, value: string) {
    setPlanMealForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function addPlanItemRow() {
    setPlanMealForm((current) => ({
      ...current,
      items: [...current.items, emptyPlanItemDraft],
    }));
  }

  function removePlanItemRow(index: number) {
    setPlanMealForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function savePlanMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId || !planPreview?.planDayId) return;

    const planDayId = planPreview.planDayId;
    const title = planMealForm.title.trim();

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

    for (const item of planMealForm.items) {
      if (!item.food_name.trim()) continue;

      const quantity = parseNonNegative(item.quantity_g);
      const calories = parseNonNegative(item.calories);
      const protein = parseNonNegative(item.protein_g);
      const carbs = parseNonNegative(item.carbs_g);
      const fat = parseNonNegative(item.fat_g);

      if (
        quantity === null ||
        calories === null ||
        protein === null ||
        carbs === null ||
        fat === null
      ) {
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

    setSavingPlanMeal(true);
    setError("");
    setNotice("");

    try {
      let mealId: string;

      if (editingPlanMeal) {
        const { error: updateError } = await supabase
          .from("nutrition_plan_meals")
          .update({
            meal_type: planMealForm.meal_type,
            title,
            instructions: planMealForm.instructions.trim() || null,
          })
          .eq("id", editingPlanMeal.id)
          .eq("user_id", userId);

        if (updateError) throw updateError;

        mealId = editingPlanMeal.id;

        const { error: deleteItemsError } = await supabase
          .from("nutrition_plan_meal_items")
          .delete()
          .eq("plan_meal_id", mealId);

        if (deleteItemsError) throw deleteItemsError;
      } else {
        const { data: created, error: insertError } = await supabase
          .from("nutrition_plan_meals")
          .insert({
            plan_day_id: planDayId,
            user_id: userId,
            meal_type: planMealForm.meal_type,
            title,
            instructions: planMealForm.instructions.trim() || null,
            sort_order: planPreview.meals.length,
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

      setShowPlanMealForm(false);
      setNotice(editingPlanMeal ? "Pasto del piano aggiornato." : "Pasto aggiunto al piano.");
      await loadPlanPreview(userId, selectedDate, effectiveWeekday);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingPlanMeal(false);
    }
  }

  async function deletePlanMeal(meal: PlanPreviewMeal) {
    if (!userId) return;

    const confirmed = window.confirm(`Vuoi eliminare "${meal.title}" dal piano?`);
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

      setNotice("Pasto eliminato dal piano.");
      await loadPlanPreview(userId, selectedDate, effectiveWeekday);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function openSwapSearch(meal: PlannedMeal, item: PlannedItem) {
    setSwapSearchKey(`${meal.id}:${item.id}`);
  }

  function closeSwapSearch() {
    setSwapSearchKey(null);
  }

  async function replacePlannedItem(meal: PlannedMeal, item: PlannedItem, replacement: ReplacementItem) {
    if (!userId) return;

    setError("");
    setNotice("");

    try {
      const { error: updateError } = await supabase
        .from("planned_meal_items")
        .update({
          food_name: replacement.food_name,
          quantity_g: replacement.quantity_g,
          calories: replacement.calories,
          protein_g: replacement.protein_g,
          carbs_g: replacement.carbs_g,
          fat_g: replacement.fat_g,
        })
        .eq("id", item.id)
        .eq("user_id", userId);

      if (updateError) throw updateError;

      setSwapSearchKey(null);
      setNotice(`"${item.food_name}" sostituito con "${replacement.food_name}".`);
      await loadDay(userId, selectedDate, { silent: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const loadDay = useCallback(async (uid: string, dateKey: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError("");

    try {
      const [plannedRes, entriesRes] = await Promise.all([
        supabase
          .from("planned_meals")
          .select(
            "id,plan_date,meal_type,title,instructions,status,planned_meal_items(id,meal_id,food_name,quantity_g,calories,protein_g,carbs_g,fat_g,sort_order)",
          )
          .eq("user_id", uid)
          .eq("plan_date", dateKey),
        supabase
          .from("food_entries")
          .select(
            "id,eaten_at,meal_type,food_name,quantity_g,calories,protein_g,carbs_g,fat_g",
          )
          .eq("user_id", uid)
          .eq("eaten_at", dateKey)
          .order("created_at", { ascending: true }),
      ]);

      if (plannedRes.error) throw plannedRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const rawMeals = (plannedRes.data ?? []) as unknown as (Omit<
        PlannedMeal,
        "items"
      > & { planned_meal_items: PlannedItem[] | null })[];

      setPlannedMeals(
        rawMeals.map(({ planned_meal_items, ...meal }) => ({
          ...meal,
          items: (planned_meal_items ?? [])
            .map((item) => ({
              ...item,
              quantity_g: num(item.quantity_g),
              calories: num(item.calories),
              protein_g: num(item.protein_g),
              carbs_g: num(item.carbs_g),
              fat_g: num(item.fat_g),
            }))
            .sort((a, b) => a.sort_order - b.sort_order),
        })),
      );

      setFoodEntries(
        ((entriesRes.data ?? []) as FoodEntry[]).map((entry) => ({
          ...entry,
          quantity_g: num(entry.quantity_g),
          calories: num(entry.calories),
          protein_g: num(entry.protein_g),
          carbs_g: num(entry.carbs_g),
          fat_g: num(entry.fat_g),
        })),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      const { data, error: authError } = await supabase.auth.getUser();

      if (!active) return;

      if (authError || !data.user) {
        router.replace("/");
        return;
      }

      const key = localDateKey(new Date());
      const requestedDate = searchParams.get("date");
      const isValidDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate);

      setUserId(data.user.id);
      setTodayKey(key);
      setSelectedDate(isValidDate ? requestedDate : key);

      // Link diretto dal hub "Genera con AI" (/generate): apre subito la
      // modale piani invece di richiedere altri due click.
      if (searchParams.get("plan") === "1") setShowPlanModal(true);
    }

    void init();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!userId || !selectedDate) return;
    void loadDay(userId, selectedDate);
    void loadPlanPreview(userId, selectedDate);
  }, [userId, selectedDate, loadDay, loadPlanPreview]);

  useEffect(() => {
    if (!userId) return;

    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("birth_date,sex,height_cm,current_weight_kg,goal,activity_level")
        .eq("id", userId)
        .maybeSingle();

      if (data) {
        const extraCalories = await getExtraDailyTrainingCalories(userId);
        setMacroTargets(calculateMacroTargets(data, extraCalories));
      }
    })();
  }, [userId]);

  function changePreviewWeekday(weekday: number) {
    if (!userId || !selectedDate) return;
    setPreviewOverride({ date: selectedDate, weekday });
    void loadPlanPreview(userId, selectedDate, weekday);
  }

  /* ---------- Dati derivati ---------- */

  const plannedTotals = useMemo(
    () =>
      sumMacros(
        plannedMeals
          .filter((meal) => meal.status !== "skipped")
          .flatMap((meal) => meal.items),
      ),
    [plannedMeals],
  );

  const loggedTotals = useMemo(() => sumMacros(foodEntries), [foodEntries]);

  /* ---------- Navigazione data ---------- */

  const goToPreviousDay = () => setSelectedDate((d) => addDays(d, -1));
  const goToNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const goToToday = () => setSelectedDate(todayKey);

  /* ---------- Form pasto pianificato ---------- */

  function openNewMeal() {
    setEditingMeal(null);
    setMealForm({ ...emptyMealForm, plan_date: selectedDate });
    setShowMealForm(true);
    setError("");
  }

  function openEditMeal(meal: PlannedMeal) {
    setEditingMeal(meal);
    setMealForm({
      meal_type: meal.meal_type,
      title: meal.title,
      instructions: meal.instructions ?? "",
      plan_date: meal.plan_date,
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

  function updateMealField<K extends keyof MealForm>(key: K, value: MealForm[K]) {
    setMealForm((current) => ({ ...current, [key]: value }));
  }

  function updateItemDraft(index: number, field: keyof ItemDraft, value: string) {
    setMealForm((current) => ({
      ...current,
      items: current.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function addItemRow() {
    setMealForm((current) => ({
      ...current,
      items: [...current.items, emptyItemDraft],
    }));
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

    const title = mealForm.title.trim();
    if (!title) {
      setError("Inserisci il nome del pasto.");
      return;
    }

    const planDate = mealForm.plan_date || selectedDate;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
      setError("Seleziona un giorno valido per il pasto.");
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

      if (
        quantity === null ||
        calories === null ||
        protein === null ||
        carbs === null ||
        fat === null
      ) {
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
          .from("planned_meals")
          .update({
            meal_type: mealForm.meal_type,
            title,
            instructions: mealForm.instructions.trim() || null,
            plan_date: planDate,
          })
          .eq("id", editingMeal.id)
          .eq("user_id", userId);

        if (updateError) throw updateError;

        mealId = editingMeal.id;

        const { error: deleteItemsError } = await supabase
          .from("planned_meal_items")
          .delete()
          .eq("meal_id", mealId);

        if (deleteItemsError) throw deleteItemsError;
      } else {
        const { data: created, error: insertError } = await supabase
          .from("planned_meals")
          .insert({
            user_id: userId,
            plan_date: planDate,
            meal_type: mealForm.meal_type,
            title,
            instructions: mealForm.instructions.trim() || null,
            status: "planned",
          })
          .select("id")
          .single();

        if (insertError || !created) {
          throw new Error(
            insertError?.message ?? "Impossibile creare il pasto pianificato.",
          );
        }

        mealId = created.id;
      }

      if (parsedItems.length > 0) {
        const { error: insertItemsError } = await supabase
          .from("planned_meal_items")
          .insert(parsedItems.map((item) => ({ ...item, meal_id: mealId, user_id: userId })));

        if (insertItemsError) throw insertItemsError;
      }

      await loadDay(userId, selectedDate, { silent: true });

      const dateNote =
        planDate !== selectedDate
          ? ` (salvato per il ${formatHeading(planDate)}, non visibile in questa giornata)`
          : "";

      setShowMealForm(false);
      setNotice(
        editingMeal ? `Pasto aggiornato${dateNote}.` : `Pasto pianificato aggiunto${dateNote}.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function setMealStatus(meal: PlannedMeal, status: string) {
    if (!userId) return;

    setError("");
    setNotice("");

    const { error: updateError } = await supabase
      .from("planned_meals")
      .update({ status })
      .eq("id", meal.id)
      .eq("user_id", userId);

    if (updateError) {
      setError(`Impossibile aggiornare lo stato: ${updateError.message}`);
      return;
    }

    await loadDay(userId, selectedDate, { silent: true });
  }

  async function markMealEaten(meal: PlannedMeal) {
    if (!userId) return;

    setError("");
    setNotice("");

    try {
      if (meal.items.length > 0) {
        const { error: insertError } = await supabase.from("food_entries").insert(
          meal.items.map((item) => ({
            user_id: userId,
            eaten_at: selectedDate,
            meal_type: meal.meal_type,
            food_name: item.food_name,
            quantity_g: item.quantity_g,
            calories: item.calories,
            protein_g: item.protein_g,
            carbs_g: item.carbs_g,
            fat_g: item.fat_g,
          })),
        );

        if (insertError) throw insertError;
      }

      const { error: updateError } = await supabase
        .from("planned_meals")
        .update({ status: "eaten" })
        .eq("id", meal.id)
        .eq("user_id", userId);

      if (updateError) throw updateError;

      setNotice("Pasto segnato come mangiato e copiato nel registro.");
      await loadDay(userId, selectedDate, { silent: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteMeal(meal: PlannedMeal) {
    if (!userId) return;

    const confirmed = window.confirm(`Vuoi eliminare il pasto "${meal.title}"?`);
    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      const { error: deleteItemsError } = await supabase
        .from("planned_meal_items")
        .delete()
        .eq("meal_id", meal.id);

      if (deleteItemsError) throw deleteItemsError;

      const { error: deleteMealError } = await supabase
        .from("planned_meals")
        .delete()
        .eq("id", meal.id)
        .eq("user_id", userId);

      if (deleteMealError) throw deleteMealError;

      setNotice("Pasto pianificato eliminato.");
      await loadDay(userId, selectedDate, { silent: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  /* ---------- Render ---------- */

  const hasTotals =
    plannedTotals.kcal > 0 || loggedTotals.kcal > 0 || foodEntries.length > 0;

  if (!selectedDate) {
    return (
      <AppShell>
        <p className="nutrition-loading">Caricamento...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="nutrition-page">
        <div className="nutrition-heading">
          <div>
            <p className="nutrition-eyebrow">ALIMENTAZIONE</p>
            <h1>Diario alimentare</h1>
            <p>Pianifica i pasti della giornata e registra cosa mangi davvero.</p>
          </div>
          <div className="nutrition-heading-actions">
            <button
              type="button"
              className="nutrition-button-secondary"
              onClick={() => setShowPlanModal(true)}
            >
              I miei piani
            </button>
            <Link className="nutrition-button-secondary" href="/nutrition/calculator">
              Calcola fabbisogno
            </Link>
          </div>
        </div>

        {error && <div className="nutrition-alert nutrition-alert--error">{error}</div>}
        {notice && <div className="nutrition-alert nutrition-alert--notice">{notice}</div>}

        <section className="nutrition-day-nav">
          <button type="button" className="nutrition-icon-button" onClick={goToPreviousDay} aria-label="Giorno precedente">
            ‹
          </button>

          <div className="nutrition-day-heading">
            <h2>{formatHeading(selectedDate)}</h2>
            <div className="nutrition-day-controls">
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
              {selectedDate !== todayKey && (
                <button type="button" className="nutrition-today-button" onClick={goToToday}>
                  Oggi
                </button>
              )}
            </div>
          </div>

          <button type="button" className="nutrition-icon-button" onClick={goToNextDay} aria-label="Giorno successivo">
            ›
          </button>
        </section>

        {!planLoading && planPreview && (
          <div className="nutrition-weekday-pills" role="tablist" aria-label="Giorno del piano">
            {WEEKDAY_LABEL.map((label, index) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={index === effectiveWeekday}
                className={`nutrition-weekday-pill${
                  index === effectiveWeekday ? " nutrition-weekday-pill--active" : ""
                }`}
                onClick={() => changePreviewWeekday(index)}
              >
                {label.slice(0, 3)}
              </button>
            ))}
          </div>
        )}

        {hasTotals && (
          <div className="nutrition-totals">
            <div>
              <span>Pianificato</span>
              <strong>{round(plannedTotals.kcal)} kcal</strong>
              <small>
                P {round(plannedTotals.protein)} · C {round(plannedTotals.carbs)} · F{" "}
                {round(plannedTotals.fat)} g
              </small>
            </div>
            <div>
              <span>Registrato</span>
              <strong>{round(loggedTotals.kcal)} kcal</strong>
              <small>
                P {round(loggedTotals.protein)} · C {round(loggedTotals.carbs)} · F{" "}
                {round(loggedTotals.fat)} g
              </small>
            </div>
            {macroTargets && (
              <div>
                <span>Obiettivo macro</span>
                <strong>{round(macroTargets.calories)} kcal</strong>
                <small>
                  P {round(macroTargets.protein)} · C {round(macroTargets.carbs)} · F{" "}
                  {round(macroTargets.fat)} g
                </small>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="nutrition-loading">Caricamento...</p>
        ) : (
          <div className="nutrition-main">
            {/* ---------- Diario: pasti pianificati e registrati per questo giorno ---------- */}
            <section className="nutrition-panel">
              <div className="nutrition-panel-heading">
                <div>
                  <h3>Diario</h3>
                  <p>{plannedMeals.length} pasti per questo giorno</p>
                </div>
                <button type="button" className="nutrition-primary" onClick={openNewMeal}>
                  + Nuovo pasto
                </button>
              </div>

              {showMealForm && (
                <form className="nutrition-form-panel nutrition-form" onSubmit={saveMeal}>
                  <h4>{editingMeal ? "Modifica pasto" : "Nuovo pasto pianificato"}</h4>

                  <div className="nutrition-form-grid">
                    <label>
                      Giorno
                      <input
                        type="date"
                        value={mealForm.plan_date}
                        onChange={(event) => updateMealField("plan_date", event.target.value)}
                        required
                      />
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
                      placeholder="Note facoltative sulla preparazione"
                      rows={2}
                    />
                  </label>

                  <div className="nutrition-items-heading">
                    <span>Alimenti del pasto</span>
                    <button type="button" className="nutrition-secondary" onClick={addItemRow}>
                      + Aggiungi alimento
                    </button>
                  </div>

                  {mealForm.items.map((item, index) => (
                    <div className="nutrition-item-row" key={index}>
                      <input
                        value={item.food_name}
                        onChange={(event) => updateItemDraft(index, "food_name", event.target.value)}
                        placeholder="Alimento"
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
                          className="nutrition-item-remove"
                          onClick={() => removeItemRow(index)}
                          aria-label="Rimuovi alimento"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}

                  <div className="nutrition-form-actions">
                    <button
                      type="button"
                      className="nutrition-secondary"
                      onClick={() => setShowMealForm(false)}
                    >
                      Annulla
                    </button>
                    <button type="submit" className="nutrition-primary" disabled={saving}>
                      {saving ? "Salvataggio..." : "Salva pasto"}
                    </button>
                  </div>
                </form>
              )}

              {plannedMeals.length === 0 ? (
                <p className="nutrition-no-items">
                  Nessun pasto pianificato per questo giorno.
                </p>
              ) : (
                plannedMeals.map((meal) => {
                  const mealTotals = sumMacros(meal.items);
                  const isExpanded = expandedMealId === meal.id;
                  const isEaten = meal.status === "eaten";
                  return (
                  <article className="nutrition-meal" key={meal.id} data-expanded={isExpanded}>
                    <button
                      type="button"
                      className="nutrition-meal__summary"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedMealId((current) => (current === meal.id ? null : meal.id))
                      }
                    >
                      <span
                        className={`nutrition-meal__check${isEaten ? " nutrition-meal__check--done" : ""}`}
                        aria-hidden="true"
                      >
                        {isEaten && <CheckIcon size={14} />}
                      </span>

                      <span className="nutrition-meal__summary-text">
                        <span className="nutrition-meal__slot">{SLOT_LABEL[toSlot(meal.meal_type)]}</span>
                        <strong>{meal.title}</strong>
                      </span>

                      {meal.items.length > 0 && (
                        <strong className="nutrition-meal__kcal">{round(mealTotals.kcal)} kcal</strong>
                      )}

                      <ChevronDownIcon size={18} className="nutrition-meal__chevron" />
                    </button>

                    {isExpanded && (
                      <div className="nutrition-meal__detail">
                        <span className="nutrition-status" data-status={meal.status}>
                          {MEAL_STATUS_LABEL[meal.status] ?? meal.status}
                        </span>

                        {meal.instructions && <p className="nutrition-note">{meal.instructions}</p>}

                        {meal.items.length > 0 && (
                          <>
                            <p className="nutrition-meal__totals">
                              <span>
                                P {round(mealTotals.protein)} · C {round(mealTotals.carbs)} · F{" "}
                                {round(mealTotals.fat)} g
                              </span>
                            </p>
                            <ul className="nutrition-item-list">
                              {meal.items.map((item) => (
                                <li key={item.id}>
                                  <div className="nutrition-item-list__row">
                                    <span>{item.food_name}</span>
                                    <span>
                                      {round(item.quantity_g)} g · {round(item.calories)} kcal
                                    </span>
                                  </div>
                                  <div className="nutrition-item-list__macros">
                                    <span>P {round(item.protein_g)} g</span>
                                    <span>C {round(item.carbs_g)} g</span>
                                    <span>F {round(item.fat_g)} g</span>
                                    <button
                                      type="button"
                                      className="nutrition-chip nutrition-chip--small"
                                      disabled={swapSearchKey === `${meal.id}:${item.id}`}
                                      onClick={() => void openSwapSearch(meal, item)}
                                    >
                                      Cerca alternativa
                                    </button>
                                  </div>
                                  {swapSearchKey === `${meal.id}:${item.id}` && (
                                    <FoodAlternativeSearch
                                      original={item}
                                      onCancel={closeSwapSearch}
                                      onReplace={(result) => void replacePlannedItem(meal, item, result)}
                                    />
                                  )}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}

                        <div className="nutrition-item-actions">
                          {meal.status !== "eaten" && (
                            <button type="button" className="nutrition-chip" onClick={() => void markMealEaten(meal)}>
                              Segna mangiato
                            </button>
                          )}
                          {meal.status !== "skipped" && (
                            <button
                              type="button"
                              className="nutrition-chip"
                              onClick={() => void setMealStatus(meal, "skipped")}
                            >
                              Salta
                            </button>
                          )}
                          {meal.status !== "planned" && (
                            <button
                              type="button"
                              className="nutrition-chip"
                              onClick={() => void setMealStatus(meal, "planned")}
                            >
                              Da mangiare
                            </button>
                          )}
                          <button type="button" className="nutrition-chip" onClick={() => openEditMeal(meal)}>
                            Modifica
                          </button>
                          <button
                            type="button"
                            className="nutrition-chip nutrition-chip--danger"
                            onClick={() => void deleteMeal(meal)}
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                  );
                })
              )}
            </section>
          </div>
        )}

        {!planLoading && !planPreview && (
          <div className="nutrition-plan-preview nutrition-plan-preview--empty">
            <h3>Cosa mangiare</h3>
            <p className="nutrition-no-items">
              Non hai ancora un piano nutrizionale. Creane uno per vedere qui cosa mangiare ogni
              giorno della settimana.
            </p>
            <button type="button" className="nutrition-secondary" onClick={() => setShowPlanModal(true)}>
              Crea un piano
            </button>
          </div>
        )}

        {!planLoading && planPreview && (
          <details className="nutrition-plan-preview" open>
            <summary className="nutrition-panel-heading">
              <div>
                <h3>Cosa mangiare — {planPreview.weekdayLabel}</h3>
                <p>{planPreview.planName}</p>
              </div>
              <div
                className="nutrition-plan-preview__actions"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="nutrition-secondary"
                  onClick={() => setShowPlanModal(true)}
                >
                  AI, import, altri piani
                </button>
              </div>
              <ChevronDownIcon size={18} className="nutrition-plan-preview__chevron" />
            </summary>

            {planPreview.meals.length === 0 ? (
              <p className="nutrition-no-items">
                Nessun pasto previsto dal piano per questo giorno della settimana.
              </p>
            ) : (
              planPreview.meals.map((meal) => (
                <div className="nutrition-plan-preview__meal" key={meal.id}>
                  <div className="nutrition-plan-preview__meal-info">
                    <span className="nutrition-meal__slot">{SLOT_LABEL[toSlot(meal.meal_type)]}</span>
                    <strong>{meal.title}</strong>
                    {meal.items.length > 0 && (
                      <span className="nutrition-note">
                        {meal.items.map((item) => item.food_name).join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="nutrition-plan-preview__meal-actions">
                    <button
                      type="button"
                      className="nutrition-chip"
                      disabled={copyingMealId === meal.id}
                      onClick={() => void copyPlanMealToDiary(meal)}
                    >
                      {copyingMealId === meal.id ? "Copio..." : "Aggiungi al diario"}
                    </button>
                    <button
                      type="button"
                      className="nutrition-icon-chip"
                      aria-label={`Modifica ${meal.title}`}
                      onClick={() => openEditPlanMeal(meal)}
                    >
                      <PencilIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="nutrition-icon-chip nutrition-icon-chip--danger"
                      aria-label={`Elimina ${meal.title}`}
                      onClick={() => void deletePlanMeal(meal)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}

            {showPlanMealForm && (
              <form className="nutrition-form-panel nutrition-form" onSubmit={savePlanMeal}>
                <h4>{editingPlanMeal ? "Modifica pasto del piano" : `Nuovo pasto per ${planPreview.weekdayLabel}`}</h4>

                <div className="nutrition-form-grid">
                  <label>
                    Momento del pasto
                    <select
                      value={planMealForm.meal_type}
                      onChange={(event) => updatePlanMealField("meal_type", event.target.value)}
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
                      value={planMealForm.title}
                      onChange={(event) => updatePlanMealField("title", event.target.value)}
                      placeholder="Es. Pollo e riso"
                      required
                    />
                  </label>
                </div>

                <label>
                  Istruzioni / note
                  <textarea
                    value={planMealForm.instructions}
                    onChange={(event) => updatePlanMealField("instructions", event.target.value)}
                    placeholder="Note facoltative sulla preparazione"
                    rows={2}
                  />
                </label>

                <div className="nutrition-items-heading">
                  <span>Alimenti del pasto</span>
                  <button type="button" className="nutrition-secondary" onClick={addPlanItemRow}>
                    + Aggiungi alimento
                  </button>
                </div>

                {planMealForm.items.map((item, index) => (
                  <div className="nutrition-item-row" key={index}>
                    <input
                      value={item.food_name}
                      onChange={(event) => updatePlanItemDraft(index, "food_name", event.target.value)}
                      placeholder="Alimento"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.quantity_g}
                      onChange={(event) => updatePlanItemDraft(index, "quantity_g", event.target.value)}
                      placeholder="g"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.calories}
                      onChange={(event) => updatePlanItemDraft(index, "calories", event.target.value)}
                      placeholder="kcal"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.protein_g}
                      onChange={(event) => updatePlanItemDraft(index, "protein_g", event.target.value)}
                      placeholder="P g"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.carbs_g}
                      onChange={(event) => updatePlanItemDraft(index, "carbs_g", event.target.value)}
                      placeholder="C g"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.fat_g}
                      onChange={(event) => updatePlanItemDraft(index, "fat_g", event.target.value)}
                      placeholder="F g"
                    />
                    {planMealForm.items.length > 1 && (
                      <button
                        type="button"
                        className="nutrition-item-remove"
                        onClick={() => removePlanItemRow(index)}
                        aria-label="Rimuovi alimento"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <div className="nutrition-form-actions">
                  <button
                    type="button"
                    className="nutrition-secondary"
                    onClick={() => setShowPlanMealForm(false)}
                  >
                    Annulla
                  </button>
                  <button type="submit" className="nutrition-primary" disabled={savingPlanMeal}>
                    {savingPlanMeal ? "Salvataggio..." : "Salva pasto"}
                  </button>
                </div>
              </form>
            )}

            <div className="nutrition-plan-preview__footer">
              <button
                type="button"
                className="nutrition-secondary"
                disabled={!planPreview.planDayId}
                onClick={openNewPlanMeal}
              >
                + Pasto per {planPreview.weekdayLabel}
              </button>
              {planPreview.meals.length > 0 && (
                <button
                  type="button"
                  className="nutrition-primary"
                  disabled={copyingAllDay}
                  onClick={() => void copyAllPlanMealsToDiary()}
                >
                  {copyingAllDay ? "Aggiungo..." : "Copia tutto nel diario"}
                </button>
              )}
            </div>
          </details>
        )}
      </div>

      {showPlanModal && userId && (
        <NutritionPlanModal
          userId={userId}
          initialWeekday={effectiveWeekday}
          onClose={() => {
            setShowPlanModal(false);
            void loadPlanPreview(userId, selectedDate, effectiveWeekday);
          }}
        />
      )}
    </AppShell>
  );
}

export default function NutritionPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <p className="nutrition-loading">Caricamento...</p>
        </AppShell>
      }
    >
      <NutritionPageInner />
    </Suspense>
  );
}
