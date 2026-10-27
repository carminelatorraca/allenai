-- Peso corporeo: storico nel tempo (card "Storico peso e misure" in /progress).
-- profiles.current_weight_kg resta il valore "attuale" usato altrove
-- nell'app (macro, stima calorie): viene aggiornato dal client ogni volta
-- che si salva il peso per la data più recente registrata.

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric(5,2) not null check (weight_kg > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.weight_logs enable row level security;

create policy "weight_logs_owner" on public.weight_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists weight_logs_user_date_idx on public.weight_logs (user_id, date);
