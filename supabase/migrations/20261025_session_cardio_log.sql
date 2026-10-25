-- Permette di registrare sessioni non-palestra (nuoto, corsa...) con
-- durata/distanza/intensità effettive invece di serie/reps.
alter table public.workout_sessions
  add column if not exists actual_duration_minutes integer check (actual_duration_minutes is null or actual_duration_minutes >= 0),
  add column if not exists actual_distance_km numeric check (actual_distance_km is null or actual_distance_km >= 0),
  add column if not exists actual_intensity text check (actual_intensity is null or actual_intensity in ('low', 'moderate', 'high')),
  add column if not exists actual_calories integer check (actual_calories is null or actual_calories >= 0);
