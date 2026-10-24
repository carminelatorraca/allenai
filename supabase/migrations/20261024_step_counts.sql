-- Contapassi: conteggio passi giornaliero, inseribile manualmente o tramite
-- l'automazione Shortcuts di iOS (endpoint /api/health/steps).

create table if not exists public.step_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  steps integer not null check (steps >= 0),
  source text not null default 'manual' check (source in ('manual', 'shortcuts')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.step_counts enable row level security;

create policy "step_counts_owner" on public.step_counts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists step_counts_user_date_idx on public.step_counts (user_id, date);

-- Token personale usato dall'automazione Shortcuts per autenticarsi
-- senza bisogno di una sessione interattiva (vedi /api/health/steps).
alter table public.profiles
  add column if not exists step_sync_token text unique;
