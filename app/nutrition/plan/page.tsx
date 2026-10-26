
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import PlanDetail from "./[id]/PlanDetail";
import "./nutrition-plan.css";

type NutritionPlan = {
  id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  duration_weeks: number | null;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  active: "Attivo",
  completed: "Completato",
  archived: "Archiviato",
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Si è verificato un errore imprevisto.";
}

export default function NutritionPlanListPage() {
  const router = useRouter();

  const [plans, setPlans] = useState<NutritionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("Mantenimento");
  const [startDate, setStartDate] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("4");

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data: authData, error: authError } = await supabase.auth.getSession();

    if (authError || !authData.session) {
      router.replace("/");
      setLoading(false);
      return;
    }

    const userId = authData.session.user.id;

    const { data, error: queryError } = await supabase
      .from("nutrition_plans")
      .select("id,name,goal,start_date,duration_weeks,status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (queryError) {
      setError(`Errore nel caricamento dei piani: ${queryError.message}`);
      setLoading(false);
      return;
    }

    let loaded = (data ?? []) as NutritionPlan[];

    // Senza nessun piano, questa pagina sarebbe una lista vuota senza modo
    // di arrivare alla generazione PDF/AI (che vive nel pannello di
    // dettaglio di un piano aperto): ne creiamo uno di default e lo
    // selezioniamo subito, come per le schede.
    if (loaded.length === 0) {
      const { data: created, error: createError } = await supabase
        .from("nutrition_plans")
        .insert({
          user_id: userId,
          name: "Il mio piano alimentare",
          goal: "Mantenimento",
          start_date: new Date().toLocaleDateString("en-CA"),
          duration_weeks: null,
          status: "active",
        })
        .select("id,name,goal,start_date,duration_weeks,status")
        .single();

      if (!createError && created) {
        await supabase.from("nutrition_plan_days").insert(
          WEEKDAYS.map((weekday) => ({
            plan_id: created.id,
            user_id: userId,
            weekday,
          })),
        );
        loaded = [created as NutritionPlan];
      }
    }

    setPlans(loaded);
    setSelectedPlanId((current) => current ?? loaded[0]?.id ?? null);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadPlans();
    setStartDate(new Date().toLocaleDateString("en-CA"));
  }, [loadPlans]);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Inserisci il nome del piano.");
      return;
    }

    const weeks = durationWeeks.trim() === "" ? null : Number(durationWeeks);

    if (weeks !== null && (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)) {
      setError("La durata deve essere un numero di settimane tra 1 e 52, o vuota.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData.session?.user;

      if (authError || !user) {
        router.replace("/");
        return;
      }

      const { data: created, error: createError } = await supabase
        .from("nutrition_plans")
        .insert({
          user_id: user.id,
          name: name.trim(),
          goal,
          start_date: startDate || null,
          duration_weeks: weeks,
          status: "draft",
        })
        .select("id")
        .single();

      if (createError || !created) {
        throw new Error(createError?.message ?? "Impossibile creare il piano.");
      }

      const { error: daysError } = await supabase.from("nutrition_plan_days").insert(
        WEEKDAYS.map((weekday) => ({
          plan_id: created.id,
          user_id: user.id,
          weekday,
        })),
      );

      if (daysError) throw daysError;

      setShowForm(false);
      setName("");
      setNotice("Piano alimentare creato.");
      setSelectedPlanId(created.id);
      await loadPlans();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(plan: NutritionPlan, status: string) {
    setError("");
    setNotice("");

    const { data: authData } = await supabase.auth.getSession();
    const userId = authData.session?.user.id;

    if (!userId) {
      router.replace("/");
      return;
    }

    const { error: updateError } = await supabase
      .from("nutrition_plans")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", plan.id)
      .eq("user_id", userId);

    if (updateError) {
      setError(`Impossibile aggiornare lo stato: ${updateError.message}`);
      return;
    }

    setNotice("Stato aggiornato.");
    await loadPlans();
  }

  async function deletePlan(plan: NutritionPlan) {
    const confirmed = window.confirm(
      `Vuoi eliminare il piano "${plan.name}" e tutti i pasti che contiene?`,
    );
    if (!confirmed) return;

    setError("");
    setNotice("");

    const { data: authData } = await supabase.auth.getSession();
    const userId = authData.session?.user.id;

    if (!userId) {
      router.replace("/");
      return;
    }

    const { error: deleteError } = await supabase
      .from("nutrition_plans")
      .delete()
      .eq("id", plan.id)
      .eq("user_id", userId);

    if (deleteError) {
      setError(`Impossibile eliminare il piano: ${deleteError.message}`);
      return;
    }

    setNotice("Piano eliminato.");
    setSelectedPlanId((current) => (current === plan.id ? null : current));
    await loadPlans();
  }

  return (
    <AppShell>
      <main className="nplan-page nplan-page--workspace">
        <section className="nplan-hero">
          <p className="nplan-eyebrow">ALIMENTAZIONE</p>
          <h1>
            I tuoi <span>piani alimentari</span>
          </h1>
          <p>
            Crea, genera e modifica i tuoi piani settimanali: clicca un piano qui sotto per
            vederne i dettagli e i pasti pianificati.
          </p>
        </section>

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

        <div className="nplan-workspace">
          <div className="nplan-master">
            <div className="nplan-section-heading">
              <div>
                <h2>I tuoi piani</h2>
                <p>{plans.length} piani</p>
              </div>
              <button
                type="button"
                className="nplan-primary"
                onClick={() => {
                  setShowForm((current) => !current);
                  setError("");
                }}
              >
                {showForm ? "Annulla" : "+ Nuovo piano"}
              </button>
            </div>

            {showForm && (
              <form className="nplan-form-panel nplan-form" onSubmit={createPlan}>
                <label>
                  Nome del piano *
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Es. Piano massa - Blocco 1"
                    maxLength={120}
                    required
                  />
                </label>

                <div className="nplan-form-grid">
                  <label>
                    Obiettivo
                    <select value={goal} onChange={(event) => setGoal(event.target.value)}>
                      <option value="Dimagrimento">Dimagrimento</option>
                      <option value="Mantenimento">Mantenimento</option>
                      <option value="Massa">Aumento massa</option>
                      <option value="Ricomposizione">Ricomposizione corporea</option>
                      <option value="Personalizzato">Personalizzato</option>
                    </select>
                  </label>

                  <label>
                    Durata (settimane, facoltativa)
                    <input
                      type="number"
                      min="1"
                      max="52"
                      value={durationWeeks}
                      onChange={(event) => setDurationWeeks(event.target.value)}
                      placeholder="Vuoto = continuativo"
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

                <p className="nplan-field-help">
                  Dopo la creazione potrai compilare i 7 giorni della settimana con i pasti e
                  gli alimenti.
                </p>

                <button type="submit" className="nplan-primary" disabled={saving}>
                  {saving ? "Creazione..." : "Crea piano"}
                </button>
              </form>
            )}

            {loading ? (
              <p className="nplan-loading">Caricamento...</p>
            ) : plans.length === 0 ? (
              <div className="nplan-empty">
                <h3>Non hai ancora nessun piano alimentare</h3>
                <p>Creane uno per iniziare a strutturare la tua settimana tipo.</p>
              </div>
            ) : (
              <div className="nplan-list">
                {plans.map((plan) => (
                  <article
                    className={`nplan-item${plan.id === selectedPlanId ? " nplan-item--active" : ""}`}
                    key={plan.id}
                  >
                    <button
                      type="button"
                      className="nplan-item-link"
                      onClick={() => setSelectedPlanId(plan.id)}
                    >
                      <h3>{plan.name}</h3>
                      <p>{plan.goal ?? "Obiettivo non specificato"}</p>
                      <p>
                        {plan.duration_weeks ? `${plan.duration_weeks} settimane` : "Continuativo"}
                        {plan.start_date ? ` · Inizio ${plan.start_date}` : ""}
                      </p>
                      <span className="nplan-status">{STATUS_LABEL[plan.status] ?? plan.status}</span>
                    </button>

                    <div className="nplan-item-actions">
                      <label className="nplan-inline-label">
                        Stato
                        <select
                          value={plan.status}
                          onChange={(event) => void updateStatus(plan, event.target.value)}
                        >
                          <option value="draft">Bozza</option>
                          <option value="active">Attivo</option>
                          <option value="completed">Completato</option>
                          <option value="archived">Archiviato</option>
                        </select>
                      </label>

                      <button type="button" className="nplan-danger" onClick={() => void deletePlan(plan)}>
                        Elimina
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="nplan-detail-panel">
            {selectedPlanId ? (
              <PlanDetail planId={selectedPlanId} embedded />
            ) : (
              !loading && (
                <div className="nplan-empty">
                  <h3>Nessun piano selezionato</h3>
                  <p>Scegli un piano dall&apos;elenco, o creane uno nuovo, per vederne i dettagli.</p>
                </div>
              )
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
