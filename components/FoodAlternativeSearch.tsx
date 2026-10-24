"use client";

import { useEffect, useRef, useState } from "react";
import type { FoodSearchResult } from "@/app/api/food-search/route";
import { round } from "@/lib/nutrition";
import "./food-alternative-search.css";

export type OriginalItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type ReplacementItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type Candidate = {
  result: FoodSearchResult;
  replacement: ReplacementItem;
  macroDistance: number;
};

/** Densità di macro per 100 kcal: permette di confrontare alimenti diversi a parità di calorie. */
function macroDensity(calories: number, protein: number, carbs: number, fat: number) {
  if (calories <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: (protein / calories) * 100,
    carbs: (carbs / calories) * 100,
    fat: (fat / calories) * 100,
  };
}

function buildCandidate(original: OriginalItem, result: FoodSearchResult): Candidate | null {
  const cal100 = result.calories_100g;
  if (!cal100 || cal100 <= 0) return null;

  // Scala la quantità in modo che l'alternativa fornisca le stesse calorie dell'originale.
  const quantity_g = (original.calories / cal100) * 100;
  const protein_g = ((result.protein_100g ?? 0) * quantity_g) / 100;
  const carbs_g = ((result.carbs_100g ?? 0) * quantity_g) / 100;
  const fat_g = ((result.fat_100g ?? 0) * quantity_g) / 100;

  const originalDensity = macroDensity(
    original.calories,
    original.protein_g,
    original.carbs_g,
    original.fat_g,
  );
  const candidateDensity = macroDensity(original.calories, protein_g, carbs_g, fat_g);

  const macroDistance =
    Math.abs(originalDensity.protein - candidateDensity.protein) +
    Math.abs(originalDensity.carbs - candidateDensity.carbs) +
    Math.abs(originalDensity.fat - candidateDensity.fat);

  return {
    result,
    replacement: {
      food_name: result.name,
      quantity_g,
      calories: original.calories,
      protein_g,
      carbs_g,
      fat_g,
    },
    macroDistance,
  };
}

type Props = {
  original: OriginalItem;
  onCancel: () => void;
  onReplace: (replacement: ReplacementItem) => void;
};

export default function FoodAlternativeSearch({ original, onCancel, onReplace }: Props) {
  const [query, setQuery] = useState(original.food_name);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runSearch(trimmed: string) {
    setLoading(true);

    try {
      const response = await fetch(`/api/food-search?q=${encodeURIComponent(trimmed)}`);
      const data = (await response.json()) as { results?: FoodSearchResult[] };

      const ranked = (data.results ?? [])
        .map((result) => buildCandidate(original, result))
        .filter((candidate): candidate is Candidate => candidate !== null)
        .sort((a, b) => a.macroDistance - b.macroDistance);

      setCandidates(ranked);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  useEffect(() => {
    const initial = original.food_name.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ricerca iniziale una tantum al mount
    if (initial.length >= 2) void runSearch(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(nextValue: string) {
    setQuery(nextValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = nextValue.trim();

    if (trimmed.length < 2) {
      setCandidates([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => void runSearch(trimmed), 350);
  }

  return (
    <div className="food-alt">
      <div className="food-alt__header">
        <input
          autoFocus
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Cerca un alimento alternativo..."
        />
        <button type="button" className="nutrition-chip" onClick={onCancel}>
          Annulla
        </button>
      </div>

      <p className="food-alt__hint">
        Originale: {round(original.quantity_g)} g · {round(original.calories)} kcal (P{" "}
        {round(original.protein_g)} · C {round(original.carbs_g)} · F {round(original.fat_g)} g).
        Le alternative sono quantificate per avere le stesse calorie e ordinate per somiglianza di
        macronutrienti.
      </p>

      {loading && <p className="food-alt__status">Cerco alternative...</p>}

      {!loading && searched && candidates.length === 0 && (
        <p className="food-alt__status">
          Nessuna alternativa trovata con dati nutrizionali sufficienti.
        </p>
      )}

      {candidates.length > 0 && (
        <ul className="food-alt__list">
          {candidates.map((candidate) => (
            <li key={candidate.result.id}>
              <button
                type="button"
                className="food-alt__item"
                onClick={() => onReplace(candidate.replacement)}
              >
                <span className="food-alt__item-name">
                  {candidate.result.name}
                  {candidate.result.brand && <small> · {candidate.result.brand}</small>}
                </span>
                <span className="food-alt__item-macros">
                  {round(candidate.replacement.quantity_g)} g · {round(candidate.replacement.calories)}{" "}
                  kcal · P {round(candidate.replacement.protein_g)} · C{" "}
                  {round(candidate.replacement.carbs_g)} · F {round(candidate.replacement.fat_g)} g
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
