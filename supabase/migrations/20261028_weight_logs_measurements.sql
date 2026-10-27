-- Misure corporee opzionali per ogni registrazione di peso (card "Storico
-- peso" in /progress): vita, fianchi, torace, braccio, coscia, in cm.
-- "if not exists" cosi' funziona sia se weight_logs e' gia' stata creata
-- sia come parte della prima applicazione, se eseguita insieme.

alter table public.weight_logs
  add column if not exists waist_cm numeric(5,2) check (waist_cm is null or waist_cm > 0),
  add column if not exists hips_cm numeric(5,2) check (hips_cm is null or hips_cm > 0),
  add column if not exists chest_cm numeric(5,2) check (chest_cm is null or chest_cm > 0),
  add column if not exists arm_cm numeric(5,2) check (arm_cm is null or arm_cm > 0),
  add column if not exists thigh_cm numeric(5,2) check (thigh_cm is null or thigh_cm > 0);
