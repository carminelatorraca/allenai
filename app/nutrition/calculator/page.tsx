
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { calculateAge, calculateMacroTargets, type NutritionProfile } from "@/lib/nutrition";
import "./calculator.css";

type Profile = NutritionProfile;

const activityFactors: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
};

const activityLabels: Record<string, string> = {
  sedentary: "Sedentario",
  light: "Leggermente attivo",
  moderate: "Moderatamente attivo",
  high: "Molto attivo",
  very_high: "Estremamente attivo",
};

const goalLabels: Record<string, string> = {
  lose_fat: "Perdita di grasso",
  build_muscle: "Aumento della massa muscolare",
  recomposition: "Ricomp. corporea",
  maintain: "Mantenimento",
  improve_fitness: "Miglioramento della forma fisica",
};

export default function CalculatorPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        router.replace("/");
        return;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(
          "birth_date, sex, height_cm, current_weight_kg, goal, activity_level"
        )
        .eq("id", sessionData.session.user.id)
        .maybeSingle();

      if (profileError) {
        setError("Non riesco a caricare il profilo.");
      } else if (!data) {
        setError("Completa prima il tuo profilo personale.");
      } else {
        setProfile(data as Profile);
      }

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  if (loading) {
    return (
      <AppShell>
        <p className="calculator-loading">Caricamento...</p>
      </AppShell>
    );
  }

  if (error || !profile) {
    return (
      <AppShell>
        <main className="calculator-page">
          <h1>Calcolatore nutrizionale</h1>
          <p>{error || "Profilo non disponibile."}</p>
          <button className="calculator-secondary" onClick={() => router.push("/profile")}>
            Completa il profilo
          </button>
        </main>
      </AppShell>
    );
  }

  const missing = [
    !profile.birth_date && "data di nascita",
    !profile.sex && "sesso",
    !profile.height_cm && "altezza",
    !profile.current_weight_kg && "peso",
    !profile.activity_level && "livello di attività",
  ].filter(Boolean);

  const age = profile.birth_date
    ? calculateAge(profile.birth_date)
    : 0;

  const valid =
    Boolean(profile.birth_date) &&
    Boolean(profile.sex) &&
    Boolean(profile.height_cm) &&
    Boolean(profile.current_weight_kg) &&
    Boolean(profile.activity_level) &&
    age >= 18 &&
    age <= 100 &&
    Number(profile.height_cm) > 0 &&
    Number(profile.current_weight_kg) > 0 &&
    ["male", "female"].includes(profile.sex ?? "") &&
    activityFactors[profile.activity_level ?? ""] !== undefined;

  let bmr = 0;
  let maintenance = 0;
  let targetCalories = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;

  if (valid) {
    const weight = Number(profile.current_weight_kg);
    const height = Number(profile.height_cm);

    // Formula Mifflin-St Jeor: stima del metabolismo basale (per le card di dettaglio).
    bmr = 10 * weight + 6.25 * height - 5 * age + (profile.sex === "male" ? 5 : -161);
    maintenance = bmr * activityFactors[profile.activity_level!];

    const targets = calculateMacroTargets(profile);
    if (targets) {
      targetCalories = targets.calories;
      protein = targets.protein;
      fat = targets.fat;
      carbs = targets.carbs;
    }
  }

  const fmt = (value: number) =>
    Math.round(value).toLocaleString("it-IT");

  return (
    <AppShell>
    <main className="calculator-page">
      <div className="calculator-top-actions">
        <button className="calculator-secondary" onClick={() => router.push("/profile")}>
          Modifica profilo
        </button>
      </div>

      <section className="calculator-content">
        <p className="calculator-eyebrow">NUTRIZIONE</p>
        <h1>Il tuo fabbisogno</h1>
        <p className="calculator-description">
          Una stima iniziale basata sui dati del tuo profilo.
          Il fabbisogno reale può essere diverso.
        </p>

        {missing.length > 0 && (
          <div className="calculator-warning">
            Dati mancanti: {missing.join(", ")}.
            <br />
            Aggiorna il profilo per ottenere una stima.
          </div>
        )}

        {profile.birth_date && (age < 18 || age > 100) && (
          <div className="calculator-warning">
            Questo calcolatore è pensato per adulti tra 18 e 100 anni.
            Non mostrare questi risultati come fabbisogno personalizzato.
          </div>
        )}

        {valid && (
          <>
            <div className="calculator-summary">
              <span>Obiettivo giornaliero stimato</span>
              <strong>{fmt(targetCalories)} kcal</strong>
              <p>
                Mantenimento stimato: {fmt(maintenance)} kcal
              </p>
            </div>

            <div className="calculator-grid">
              <article className="calculator-card">
                <span>Metabolismo basale</span>
                <strong>{fmt(bmr)} kcal</strong>
                <p>Energia stimata a riposo.</p>
              </article>

              <article className="calculator-card">
                <span>Fabbisogno di mantenimento</span>
                <strong>{fmt(maintenance)} kcal</strong>
                <p>Include il livello di attività selezionato.</p>
              </article>
            </div>

            <h2>Macronutrienti indicativi</h2>
            <div className="calculator-macros">
              <article>
                <span>Proteine</span>
                <strong>{fmt(protein)} g</strong>
              </article>
              <article>
                <span>Carboidrati</span>
                <strong>{fmt(carbs)} g</strong>
              </article>
              <article>
                <span>Grassi</span>
                <strong>{fmt(fat)} g</strong>
              </article>
            </div>

            <div className="calculator-info">
              <p>
                <strong>Obiettivo:</strong>{" "}
                {goalLabels[profile.goal ?? ""] ?? "Non specificato"}
              </p>
              <p>
                <strong>Attività:</strong>{" "}
                {activityLabels[profile.activity_level!] ?? "Non specificata"}
              </p>
              <p>
                I coefficienti e gli aggiustamenti calorici sono stime
                iniziali. Le proteine sono calcolate a 1,6 g/kg e i grassi
                al 28% delle calorie; i carboidrati coprono la quota
                energetica restante. Non sono indicazioni mediche.
              </p>
            </div>
          </>
        )}

        <button
          className="calculator-secondary"
          onClick={() => router.push("/dashboard")}
        >
          Torna alla dashboard
        </button>
      </section>
    </main>
    </AppShell>
  );
}
