"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import MiniLineChart from "./MiniLineChart";
import "./weight-history.css";
import "./progress-history.css";

type WeightRow = { date: string; weight_kg: number };

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

type Props = {
  userId: string;
  onLatestWeightChange?: (weightKg: number) => void;
};

export default function WeightHistory({ userId, onLatestWeightChange }: Props) {
  const [entries, setEntries] = useState<WeightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftDate, setDraftDate] = useState(localDate());
  const [draftWeight, setDraftWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const { data, error: loadError } = await supabase
        .from("weight_logs")
        .select("date,weight_kg")
        .eq("user_id", userId)
        .order("date", { ascending: true });

      if (!active) return;

      if (loadError) {
        setError("Non riesco a caricare lo storico del peso.");
      } else {
        setEntries((data ?? []) as WeightRow[]);
      }

      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [userId]);

  async function saveEntry() {
    const weight = Number(draftWeight);
    if (!draftDate || draftWeight.trim() === "" || !Number.isFinite(weight) || weight <= 0) {
      setError("Inserisci data e peso validi.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { error: saveError } = await supabase
        .from("weight_logs")
        .upsert(
          { user_id: userId, date: draftDate, weight_kg: weight, updated_at: new Date().toISOString() },
          { onConflict: "user_id,date" },
        );

      if (saveError) throw saveError;

      const next = [...entries.filter((entry) => entry.date !== draftDate), { date: draftDate, weight_kg: weight }].sort(
        (a, b) => a.date.localeCompare(b.date),
      );
      setEntries(next);
      setDraftWeight("");

      // Se la data salvata è la più recente, tiene sincronizzato il peso
      // "attuale" del profilo, usato altrove nell'app (macro, calorie).
      const latest = next[next.length - 1];
      if (latest.date === draftDate) {
        await supabase.from("profiles").update({ current_weight_kg: weight }).eq("id", userId);
        onLatestWeightChange?.(weight);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile salvare il peso.");
    } finally {
      setSaving(false);
    }
  }

  const chartPoints = useMemo(
    () => entries.map((entry) => ({ key: entry.date, date: entry.date, value: entry.weight_kg })),
    [entries],
  );

  return (
    <div className="progress-card weight-history">
      <div className="progress-card__header">
        <h3>Storico peso</h3>
      </div>

      <div className="weight-history__form">
        <label>
          Data
          <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
        </label>
        <label>
          Peso (kg)
          <input
            type="number"
            min="0"
            step="0.1"
            value={draftWeight}
            placeholder="Es. 74.5"
            onChange={(event) => setDraftWeight(event.target.value)}
          />
        </label>
        <button type="button" className="progress-button" disabled={saving} onClick={() => void saveEntry()}>
          {saving ? "Salvataggio…" : "Salva peso"}
        </button>
      </div>

      {error && <p className="weight-history__error">{error}</p>}

      {loading ? (
        <p className="progress-note">Caricamento...</p>
      ) : !entries.length ? (
        <p className="progress-note">
          Nessun peso registrato ancora: salva il primo valore per iniziare lo storico.
        </p>
      ) : (
        <>
          <MiniLineChart points={chartPoints} unit="kg" />

          <div className="progress-history">
            <p className="progress-history__title">Storico</p>
            {[...entries].reverse().map((entry, index, reversed) => {
              const previous = reversed[index + 1];
              const delta = previous ? entry.weight_kg - previous.weight_kg : null;

              return (
                <div className="progress-history__row" key={entry.date}>
                  <span className="progress-history__primary">{formatLongDate(entry.date)}</span>
                  <span className="progress-history__secondary">
                    {niceValue(entry.weight_kg)} kg
                    {delta !== null && delta !== 0 && (
                      <span className="weight-history__delta">
                        {" "}
                        ({delta > 0 ? "+" : ""}
                        {niceValue(delta)})
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
