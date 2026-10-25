-- Permette di quantificare giorni non-palestra (nuoto, corsa, altro cardio) con
-- durata/intensità invece di serie/reps, e di stimare le calorie bruciate per
-- collegare il carico di allenamento pianificato al fabbisogno calorico.
alter table public.mesocycle_days
  add column if not exists duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  add column if not exists intensity text check (intensity is null or intensity in ('low', 'moderate', 'high')),
  add column if not exists estimated_calories integer check (estimated_calories is null or estimated_calories >= 0);
