-- Acqua: bicchieri d'acqua bevuti in giornata (card "Acqua" della dashboard).

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  glasses integer not null default 0 check (glasses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.water_logs enable row level security;

create policy "water_logs_owner" on public.water_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists water_logs_user_date_idx on public.water_logs (user_id, date);
