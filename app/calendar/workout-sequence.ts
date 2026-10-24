/**
 * Sequenza degli allenamenti (A → B → C → A …).
 *
 * Regola: la progressione dipende SOLO dalle sessioni completate, mai dalle date.
 * - le sessioni `skipped` e i giorni senza sessione non spostano il puntatore;
 * - una sessione `in_progress` ha priorità e va ripresa con la sua data originale.
 *
 * Questo modulo è condiviso da `calendar/page.tsx` e `workouts/page.tsx`,
 * così le due pagine propongono sempre la stessa scheda.
 */

export type SequenceDay = {
  id: string;
  week_number: number;
  sort_order: number;
  activity_type: string | null;
};

export type SequenceSession = {
  id: string;
  mesocycle_day_id: string | null;
  performed_at: string;
  status: string;
  started_at?: string | null;
  created_at?: string | null;
};

/** Giorni allenanti del mesociclo nell'ordine di progressione. */
export function orderTrainingDays<T extends SequenceDay>(days: T[]): T[] {
  return days
    .filter((day) => day.activity_type !== "rest")
    .slice()
    .sort(
      (a, b) => a.week_number - b.week_number || a.sort_order - b.sort_order,
    );
}

function sessionStamp(session: SequenceSession): string {
  return `${session.performed_at.slice(0, 10)}|${
    session.started_at ?? session.created_at ?? ""
  }`;
}

export function compareSessionsNewestFirst(
  a: SequenceSession,
  b: SequenceSession,
): number {
  return sessionStamp(b).localeCompare(sessionStamp(a));
}

/** Sessione in corso più recente collegata a una giornata del mesociclo. */
export function findResumableSession<S extends SequenceSession>(
  sessions: S[],
): S | null {
  return (
    sessions
      .filter((s) => s.status === "in_progress" && s.mesocycle_day_id)
      .sort(compareSessionsNewestFirst)[0] ?? null
  );
}

/**
 * Prossima giornata in sequenza = quella dopo l'ultima sessione COMPLETATA.
 * Senza sessioni completate parte dalla prima; dopo l'ultima riparte dalla prima.
 */
export function getNextWorkoutDay<T extends SequenceDay>(
  days: T[],
  sessions: SequenceSession[],
): T | null {
  const sequence = orderTrainingDays(days);
  if (sequence.length === 0) return null;

  const positionById = new Map(sequence.map((day, index) => [day.id, index]));

  const lastCompleted = sessions
    .filter(
      (s) =>
        s.status === "completed" &&
        s.mesocycle_day_id !== null &&
        positionById.has(s.mesocycle_day_id),
    )
    .sort(compareSessionsNewestFirst)[0];

  if (!lastCompleted || lastCompleted.mesocycle_day_id === null) {
    return sequence[0];
  }

  const position = positionById.get(lastCompleted.mesocycle_day_id) ?? -1;
  return sequence[(position + 1) % sequence.length];
}