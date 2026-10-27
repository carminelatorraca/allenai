
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import ExerciseProgress from "@/components/ExerciseProgress";
import { ChartIcon, TargetIcon } from "@/components/icons";
import "./progress.css";

type Profile = {
  full_name: string | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  goal: string | null;
  activity_level: string | null;
  updated_at: string | null;
};

const GOAL_LABEL: Record<string, string> = {
  lose_fat: "Perdere grasso",
  build_muscle: "Aumentare la massa muscolare",
  recomposition: "Ricomposizione corporea",
  maintain: "Mantenere il peso",
  improve_fitness: "Migliorare la forma fisica",
};

export default function ProgressPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (!active) return;

      if (sessionError || !sessionData.session) {
        router.replace("/");
        return;
      }

      setUserId(sessionData.session.user.id);

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name,height_cm,current_weight_kg,goal,activity_level,updated_at")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();

      if (!active) return;

      if (profileError) {
        setError("Non riesco a caricare i tuoi dati.");
      } else {
        setProfile(data as Profile | null);
      }

      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  const bmi =
    profile?.height_cm && profile?.current_weight_kg
      ? profile.current_weight_kg / (profile.height_cm / 100) ** 2
      : null;

  return (
    <AppShell>
      <div className="progress-page">
        <div className="progress-heading">
          <p className="progress-eyebrow">PROGRESSI</p>
          <h1>I tuoi progressi</h1>
          <p>Peso, misure e obiettivo attuale.</p>
        </div>

        {loading ? (
          <p className="progress-loading">Caricamento...</p>
        ) : error ? (
          <div className="progress-card progress-empty">
            <p>{error}</p>
          </div>
        ) : !profile || !profile.current_weight_kg ? (
          <div className="progress-card progress-empty">
            <ChartIcon size={28} />
            <h3>Nessun dato ancora disponibile</h3>
            <p>Completa il tuo profilo per vedere qui peso, altezza e obiettivo.</p>
            <button type="button" className="progress-button" onClick={() => router.push("/profile")}>
              Completa il profilo
            </button>
          </div>
        ) : (
          <>
            <div className="progress-stats">
              <div className="progress-stat">
                <span>Peso attuale</span>
                <strong>{profile.current_weight_kg} kg</strong>
              </div>
              <div className="progress-stat">
                <span>Altezza</span>
                <strong>{profile.height_cm ?? "—"} cm</strong>
              </div>
              <div className="progress-stat">
                <span>BMI stimato</span>
                <strong>{bmi ? bmi.toFixed(1) : "—"}</strong>
              </div>
              <div className="progress-stat">
                <span>Obiettivo</span>
                <strong>{GOAL_LABEL[profile.goal ?? ""] ?? "Non impostato"}</strong>
              </div>
            </div>

            <div className="progress-card">
              <div className="progress-card__header">
                <TargetIcon size={18} />
                <h3>Storico peso e misure</h3>
              </div>
              <p className="progress-note">
                Lo storico nel tempo (grafico peso, misurazioni corporee) arriverà
                presto: al momento viene mostrato solo l&apos;ultimo valore salvato nel
                tuo profilo, il {profile.updated_at
                  ? new Date(profile.updated_at).toLocaleDateString("it-IT")
                  : "—"}.
              </p>
              <button type="button" className="progress-button-outline" onClick={() => router.push("/profile")}>
                Aggiorna peso nel profilo
              </button>
            </div>
          </>
        )}

        {!loading && userId && <ExerciseProgress userId={userId} />}
      </div>
    </AppShell>
  );
}
