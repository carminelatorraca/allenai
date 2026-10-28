"use client";

import { useState } from "react";
import { SparklesIcon } from "@/components/icons";
import { round } from "@/lib/nutrition";
import "./meal-alternatives.css";

export type OriginalMealItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type VerifiedItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "crea" | "off";
};

type MealTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

type VerifiedAlternative = {
  title: string;
  items: VerifiedItem[];
  totals: MealTotals;
  deltas: MealTotals;
  unresolved: string[];
};

type Category = "similar" | "faster" | "different";

const CATEGORY_TABS: { key: Category; label: string }[] = [
  { key: "similar", label: "Simili" },
  { key: "faster", label: "Veloci" },
  { key: "different", label: "Diverse" },
];

function formatDelta(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return `=${unit === "kcal" ? "" : " "}${unit}`;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}${unit}`;
}

type Props = {
  original: { title: string; items: OriginalMealItem[] };
  onReplace: (items: OriginalMealItem[]) => void;
  onClose: () => void;
};

export default function MealAlternatives({ original, onReplace, onClose }: Props) {
  const [activeCategory, setActiveCategory] = useState<Category>("similar");
  const [resultsByCategory, setResultsByCategory] = useState<Partial<Record<Category, VerifiedAlternative[]>>>({});
  const [loadingCategory, setLoadingCategory] = useState<Category | null>(null);
  const [errorByCategory, setErrorByCategory] = useState<Partial<Record<Category, string>>>({});

  async function loadCategory(category: Category) {
    setLoadingCategory(category);
    setErrorByCategory((prev) => ({ ...prev, [category]: undefined }));

    try {
      const response = await fetch("/api/nutrition/meal-alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original, category }),
      });

      const data = (await response.json()) as { alternatives?: VerifiedAlternative[]; message?: string };

      if (!response.ok) {
        setErrorByCategory((prev) => ({
          ...prev,
          [category]: data.message || "Impossibile generare alternative. Riprova.",
        }));
        return;
      }

      setResultsByCategory((prev) => ({ ...prev, [category]: data.alternatives ?? [] }));
    } catch {
      setErrorByCategory((prev) => ({ ...prev, [category]: "Impossibile generare alternative. Riprova." }));
    } finally {
      setLoadingCategory(null);
    }
  }

  function selectCategory(category: Category) {
    setActiveCategory(category);
    if (!resultsByCategory[category] && loadingCategory !== category) {
      void loadCategory(category);
    }
  }

  const activeResults = resultsByCategory[activeCategory];
  const activeError = errorByCategory[activeCategory];
  const isLoading = loadingCategory === activeCategory;

  return (
    <div className="meal-alt">
      <div className="meal-alt__header">
        <span className="meal-alt__title">
          <SparklesIcon size={16} /> Alternative a &ldquo;{original.title}&rdquo;
        </span>
        <button type="button" className="nutrition-chip" onClick={onClose}>
          Chiudi
        </button>
      </div>

      <div className="meal-alt__tabs" role="tablist">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeCategory === tab.key}
            className={`meal-alt__tab${activeCategory === tab.key ? " meal-alt__tab--active" : ""}`}
            onClick={() => selectCategory(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="meal-alt__status">Genero alternative...</p>}

      {!isLoading && activeError && (
        <p className="meal-alt__status meal-alt__status--error">
          {activeError}{" "}
          <button type="button" className="meal-alt__retry" onClick={() => void loadCategory(activeCategory)}>
            Riprova
          </button>
        </p>
      )}

      {!isLoading && !activeError && activeResults?.length === 0 && (
        <p className="meal-alt__status">Nessuna alternativa trovata. Riprova.</p>
      )}

      {!isLoading && !activeError && activeResults && activeResults.length > 0 && (
        <ul className="meal-alt__list">
          {activeResults.map((alternative, index) => (
            <li key={`${alternative.title}-${index}`} className="meal-alt__card">
              <div className="meal-alt__card-header">
                <strong>{alternative.title}</strong>
                <span className="meal-alt__card-kcal">{round(alternative.totals.calories)} kcal</span>
              </div>

              <ul className="meal-alt__items">
                {alternative.items.map((item) => (
                  <li key={item.food_name}>
                    <span>
                      {item.food_name}
                      <small className="meal-alt__source">{item.source === "crea" ? "CREA" : "OFF"}</small>
                    </span>
                    <span>{round(item.quantity_g)} g</span>
                  </li>
                ))}
              </ul>

              {alternative.unresolved.length > 0 && (
                <p className="meal-alt__warning">
                  Non verificati: {alternative.unresolved.join(", ")}.
                </p>
              )}

              <div className="meal-alt__deltas">
                <span>P {formatDelta(alternative.deltas.protein_g, "g")}</span>
                <span>C {formatDelta(alternative.deltas.carbs_g, "g")}</span>
                <span>F {formatDelta(alternative.deltas.fat_g, "g")}</span>
                <span>{formatDelta(alternative.deltas.calories, "kcal")}</span>
              </div>
              <p className="meal-alt__deltas-hint">Differenza rispetto al pasto originale.</p>

              <button
                type="button"
                className="nutrition-chip meal-alt__use"
                onClick={() =>
                  onReplace(
                    alternative.items.map((item) => ({
                      food_name: item.food_name,
                      quantity_g: item.quantity_g,
                      calories: item.calories,
                      protein_g: item.protein_g,
                      carbs_g: item.carbs_g,
                      fat_g: item.fat_g,
                    })),
                  )
                }
              >
                Usa questa alternativa
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="meal-alt__footnote">
        Valori verificati su Open Food Facts (prodotti venduti in Italia) e sulle tabelle CREA di
        composizione degli alimenti.
      </p>
    </div>
  );
}
