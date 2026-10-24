
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import "./profile.css";

type Profile = {
  full_name: string;
  birth_date: string;
  sex: string;
  height_cm: string;
  current_weight_kg: string;
  goal: string;
  activity_level: string;
};

const emptyProfile: Profile = {
  full_name: "",
  birth_date: "",
  sex: "",
  height_cm: "",
  current_weight_kg: "",
  goal: "",
  activity_level: "",
};

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [stepSyncToken, setStepSyncToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenMessage, setTokenMessage] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        router.replace("/");
        return;
      }

      const userId = sessionData.session.user.id;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        setMessage("Errore nel caricamento del profilo.");
        setLoading(false);
        return;
      }

      if (data) {
        setProfile({
          full_name: data.full_name ?? "",
          birth_date: data.birth_date ?? "",
          sex: data.sex ?? "",
          height_cm: data.height_cm?.toString() ?? "",
          current_weight_kg:
            data.current_weight_kg?.toString() ?? "",
          goal: data.goal ?? "",
          activity_level: data.activity_level ?? "",
        });
        setStepSyncToken((data as { step_sync_token?: string | null }).step_sync_token ?? null);
      }

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function generateStepSyncToken() {
    setTokenBusy(true);
    setTokenMessage("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        router.replace("/");
        return;
      }

      const token =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

      const { error } = await supabase
        .from("profiles")
        .update({ step_sync_token: token })
        .eq("id", sessionData.session.user.id);

      if (error) throw error;

      setStepSyncToken(token);
      setTokenMessage("Nuovo token generato. I token precedenti smettono di funzionare.");
    } catch (error) {
      setTokenMessage(
        error instanceof Error ? `Errore: ${error.message}` : "Impossibile generare il token.",
      );
    } finally {
      setTokenBusy(false);
    }
  }

  async function revokeStepSyncToken() {
    const confirmed = window.confirm(
      "Vuoi disattivare la sincronizzazione passi? L'automazione Shortcuts smetterà di funzionare finché non generi un nuovo token.",
    );
    if (!confirmed) return;

    setTokenBusy(true);
    setTokenMessage("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        router.replace("/");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ step_sync_token: null })
        .eq("id", sessionData.session.user.id);

      if (error) throw error;

      setStepSyncToken(null);
      setTokenMessage("Token disattivato.");
    } catch (error) {
      setTokenMessage(
        error instanceof Error ? `Errore: ${error.message}` : "Impossibile disattivare il token.",
      );
    } finally {
      setTokenBusy(false);
    }
  }

  function updateField(
    field: keyof Profile,
    value: string
  ) {
    setProfile((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSaving(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        router.replace("/");
        return;
      }

      const height = Number(profile.height_cm);
      const weight = Number(profile.current_weight_kg);

      if (
        !profile.height_cm ||
        !Number.isFinite(height) ||
        height <= 0 ||
        height > 300
      ) {
        setMessage("Inserisci un'altezza valida in centimetri.");
        return;
      }

      if (
        !profile.current_weight_kg ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        weight > 500
      ) {
        setMessage("Inserisci un peso valido in kg.");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: sessionData.session.user.id,
            full_name: profile.full_name.trim() || null,
            birth_date: profile.birth_date || null,
            sex: profile.sex || null,
            height_cm: height,
            current_weight_kg: weight,
            goal: profile.goal || null,
            activity_level: profile.activity_level || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (error) {
        throw error;
      }

      setMessage("Profilo salvato correttamente!");
    } catch (error) {
      console.error("Errore salvataggio profilo:", error);
      setMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Non è stato possibile salvare il profilo."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="profile-loading">Caricamento profilo...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <main className="profile-container">
      <section className="profile-content">
        <p className="profile-eyebrow">IL TUO SPAZIO PERSONALE</p>
        <h1>Il tuo profilo</h1>
        <p className="profile-description">
          Inserisci i tuoi dati per personalizzare allenamento,
          alimentazione e monitoraggio dei progressi.
        </p>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-field">
            <label htmlFor="full_name">Nome</label>
            <input
              id="full_name"
              type="text"
              autoComplete="name"
              value={profile.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
              placeholder="Il tuo nome"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="birth_date">Data di nascita</label>
            <input
              id="birth_date"
              type="date"
              value={profile.birth_date}
              onChange={(e) => updateField("birth_date", e.target.value)}
            />
          </div>

          <div className="profile-field">
            <label htmlFor="sex">Sesso (per i calcoli energetici)</label>
            <select
              id="sex"
              value={profile.sex}
              onChange={(e) => updateField("sex", e.target.value)}
            >
              <option value="">Preferisco non specificarlo</option>
              <option value="male">Uomo</option>
              <option value="female">Donna</option>
            </select>
          </div>

          <div className="profile-row">
            <div className="profile-field">
              <label htmlFor="height_cm">Altezza (cm) *</label>
              <input
                id="height_cm"
                type="number"
                min="1"
                max="300"
                step="0.1"
                value={profile.height_cm}
                onChange={(e) => updateField("height_cm", e.target.value)}
                placeholder="es. 175"
                required
              />
            </div>

            <div className="profile-field">
              <label htmlFor="current_weight_kg">Peso (kg) *</label>
              <input
                id="current_weight_kg"
                type="number"
                min="1"
                max="500"
                step="0.1"
                value={profile.current_weight_kg}
                onChange={(e) =>
                  updateField("current_weight_kg", e.target.value)
                }
                placeholder="es. 72.5"
                required
              />
            </div>
          </div>

          <div className="profile-field">
            <label htmlFor="goal">Il tuo obiettivo</label>
            <select
              id="goal"
              value={profile.goal}
              onChange={(e) => updateField("goal", e.target.value)}
            >
              <option value="">Seleziona un obiettivo</option>
              <option value="lose_fat">Perdere grasso</option>
              <option value="build_muscle">Aumentare la massa muscolare</option>
              <option value="recomposition">Ricomp. corporea</option>
              <option value="maintain">Mantenere il peso</option>
              <option value="improve_fitness">Migliorare la forma fisica</option>
            </select>
          </div>

          <div className="profile-field">
            <label htmlFor="activity_level">Livello di attività</label>
            <select
              id="activity_level"
              value={profile.activity_level}
              onChange={(e) =>
                updateField("activity_level", e.target.value)
              }
            >
              <option value="">Seleziona il livello</option>
              <option value="sedentary">Sedentario</option>
              <option value="light">Leggermente attivo</option>
              <option value="moderate">Moderatamente attivo</option>
              <option value="high">Molto attivo</option>
              <option value="very_high">Estremamente attivo</option>
            </select>
          </div>

          <p className="profile-hint">
            * Campi obbligatori. Potrai modificare i dati in qualsiasi momento.
          </p>

          <button
            type="submit"
            className="profile-save"
            disabled={saving}
          >
            {saving ? "Salvataggio..." : "Salva profilo"}
          </button>

          {message && (
            <p className="profile-message" role="status">
              {message}
            </p>
          )}
        </form>

        <section className="profile-integration">
          <p className="profile-eyebrow">INTEGRAZIONI</p>
          <h2>Contapassi da iPhone</h2>
          <p className="profile-description">
            Genera un token personale e usalo in un&apos;Automazione dell&apos;app Comandi di
            iOS per inviare automaticamente i passi letti da Salute ogni giorno.
          </p>

          {stepSyncToken ? (
            <>
              <div className="profile-field">
                <label>Token attivo</label>
                <input type="text" readOnly value={stepSyncToken} onFocus={(e) => e.target.select()} />
              </div>

              <div className="profile-integration__code">
                <p>Nell&apos;Automazione Shortcuts, usa un&apos;azione &quot;Richiedi contenuti URL&quot;:</p>
                <code>URL: {origin || "https://il-tuo-dominio"}/api/health/steps</code>
                <code>Metodo: POST</code>
                <code>Intestazioni: Authorization = Bearer {stepSyncToken}</code>
                <code>{"Corpo JSON: { \"date\": \"<data corrente ISO>\", \"steps\": <passi di oggi> }"}</code>
              </div>

              <div className="profile-integration__actions">
                <button
                  type="button"
                  className="profile-save profile-save--secondary"
                  disabled={tokenBusy}
                  onClick={() => void generateStepSyncToken()}
                >
                  {tokenBusy ? "..." : "Rigenera token"}
                </button>
                <button
                  type="button"
                  className="profile-save profile-save--danger"
                  disabled={tokenBusy}
                  onClick={() => void revokeStepSyncToken()}
                >
                  Disattiva
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="profile-save profile-save--secondary"
              disabled={tokenBusy}
              onClick={() => void generateStepSyncToken()}
            >
              {tokenBusy ? "Genero..." : "Genera token per Shortcuts"}
            </button>
          )}

          {tokenMessage && (
            <p className="profile-message" role="status">
              {tokenMessage}
            </p>
          )}

          <p className="profile-hint">
            In alternativa puoi sempre inserire i passi a mano dal Calendario, senza alcuna
            configurazione.
          </p>
        </section>
      </section>
    </main>
    </AppShell>
  );
}