"use client";

import { useEffect, useRef, useState } from "react";
import type { FoodSearchResult } from "@/app/api/food-search/route";
import "./food-search-input.css";

type FoodSearchInputProps = {
  value: string;
  onChangeName: (name: string) => void;
  onSelect: (result: FoodSearchResult) => void;
  placeholder?: string;
};

export default function FoodSearchInput({
  value,
  onChangeName,
  onSelect,
  placeholder,
}: FoodSearchInputProps) {
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(nextValue: string) {
    onChangeName(nextValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = nextValue.trim();

    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/food-search?q=${encodeURIComponent(query)}`);
        const data = (await response.json()) as { results?: FoodSearchResult[] };
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  function handleSelect(result: FoodSearchResult) {
    onSelect(result);
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="food-search" ref={containerRef}>
      <input
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder ?? "Alimento"}
        autoComplete="off"
      />

      {open && (
        <div className="food-search__dropdown">
          {loading && <p className="food-search__status">Cerco...</p>}

          {!loading && results.length === 0 && (
            <p className="food-search__status">
              Nessun risultato. Puoi comunque inserire i valori a mano.
            </p>
          )}

          {!loading &&
            results.map((result) => (
              <button
                type="button"
                key={result.id}
                className="food-search__item"
                onClick={() => handleSelect(result)}
              >
                <span className="food-search__item-name">
                  {result.name}
                  {result.brand && <span className="food-search__item-brand"> · {result.brand}</span>}
                </span>
                <span className="food-search__item-kcal">
                  {Math.round(result.calories_100g ?? 0)} kcal/100g
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
