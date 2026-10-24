
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  CalendarIcon,
  ChartIcon,
  DumbbellIcon,
  GridIcon,
  UserIcon,
  UtensilsIcon,
} from "@/components/icons";
import "./dashboard.css";

const primaryItems = [
  {
    category: "ORGANIZZAZIONE",
    title: "Il mio calendario",
    description: "Consulta gli allenamenti e i pasti previsti per ogni giorno.",
    path: "/calendar",
    icon: CalendarIcon,
  },
  {
    category: "PROGRAMMAZIONE",
    title: "Piano di allenamento",
    description: "Gestisci mesocicli, settimane, giornate ed esercizi.",
    path: "/plan",
    icon: GridIcon,
  },
  {
    category: "ATTIVITÀ",
    title: "I miei allenamenti",
    description: "Accedi alle sessioni e registra le attività svolte.",
    path: "/workouts",
    icon: DumbbellIcon,
  },
  {
    category: "ALIMENTAZIONE",
    title: "Diario alimentare",
    description: "Organizza i pasti e monitora la tua alimentazione.",
    path: "/nutrition",
    icon: UtensilsIcon,
  },
];

const secondaryItems = [
  {
    title: "Progressi",
    description: "Consulta peso e misurazioni corporee.",
    path: "/progress",
    icon: ChartIcon,
  },
  {
    title: "Profilo personale",
    description: "Aggiorna i tuoi dati e le preferenze fitness.",
    path: "/profile",
    icon: UserIcon,
  },
  {
    title: "Template",
    description: "Gestisci i modelli di allenamento riutilizzabili.",
    path: "/templates",
    icon: GridIcon,
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error || !data.session) {
        router.replace("/");
        return;
      }

      setLoading(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session) {
        router.replace("/");
        return;
      }

      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  function openSection(path: string) {
    router.push(path);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="home-loading">Caricamento AllenAI...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="home-page">
        <section className="home-hero">
          <p className="home-eyebrow">IL TUO SPAZIO FITNESS PERSONALE</p>
          <h1>
            Il tuo percorso, <span>un giorno alla volta.</span>
          </h1>
          <p className="home-intro">
            Pianifica gli allenamenti, organizza i pasti e monitora i tuoi
            progressi. Tutto quello che ti serve, in un unico posto.
          </p>

          <button className="home-primary-cta" onClick={() => openSection("/calendar")}>
            Apri il calendario
          </button>
        </section>

        <section className="home-section">
          <div className="home-section-heading">
            <p className="home-eyebrow">IL TUO SPAZIO OPERATIVO</p>
            <h2>Le tue attività</h2>
          </div>

          <div className="home-grid">
            {primaryItems.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.path}
                  className="home-card"
                  role="link"
                  tabIndex={0}
                  aria-label={`Apri ${item.title}`}
                  onClick={() => openSection(item.path)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openSection(item.path);
                    }
                  }}
                >
                  <div className="home-card-icon">
                    <Icon size={22} />
                  </div>
                  <span className="home-card-category">{item.category}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <span className="home-card-cta">Apri sezione →</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="home-section">
          <div className="home-section-heading">
            <p className="home-eyebrow">STRUMENTI PERSONALI</p>
            <h2>Altre sezioni</h2>
          </div>

          <div className="home-secondary-grid">
            {secondaryItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  type="button"
                  className="home-secondary-card"
                  onClick={() => openSection(item.path)}
                >
                  <span className="home-secondary-icon">
                    <Icon size={19} />
                  </span>
                  <span className="home-secondary-content">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
