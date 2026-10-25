"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { DumbbellIcon, UtensilsIcon } from "@/components/icons";
import "./generate-hub.css";

export default function GenerateHubPage() {
  return (
    <AppShell>
      <main className="genhub-page">
        <p className="genhub-eyebrow">INTELLIGENZA ARTIFICIALE</p>
        <h1>Genera con AI</h1>
        <p className="genhub-description">
          Scegli cosa vuoi generare. Scheda e piano alimentare sono completamente indipendenti:
          puoi crearne anche solo uno, in qualsiasi ordine.
        </p>

        <div className="genhub-grid">
          <Link className="genhub-card" href="/plan/generate">
            <div className="genhub-card__icon genhub-card__icon--workout" aria-hidden="true">
              <DumbbellIcon size={22} />
            </div>
            <h2>Scheda di allenamento</h2>
            <p>
              L&apos;AI crea un mesociclo completo (settimane, giorni ed esercizi) in base al tuo
              profilo, ai giorni a settimana e all&apos;attrezzatura disponibile.
            </p>
            <span className="genhub-card__cta">Genera una scheda →</span>
          </Link>

          <Link className="genhub-card" href="/nutrition/plan">
            <div className="genhub-card__icon genhub-card__icon--nutrition" aria-hidden="true">
              <UtensilsIcon size={22} />
            </div>
            <h2>Piano alimentare</h2>
            <p>
              Crea (o apri) un piano alimentare settimanale, poi genera i pasti con AI in base al
              tuo profilo — oppure importa un piano esistente da PDF.
            </p>
            <span className="genhub-card__cta">Vai ai piani alimentari →</span>
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
