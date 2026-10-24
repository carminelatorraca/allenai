-- Piano alimentare: struttura settimanale riutilizzabile, separata dal
-- diario giornaliero (planned_meals / food_entries). Stesso pattern già
-- usato per i mesocicli di allenamento (mesocycles / mesocycle_weeks /
-- mesocycle_days / exercise_prescriptions).
--
-- Da eseguire nell'SQL editor di Supabase (Project > SQL Editor > New query).

create table if not exists nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  goal text,
  start_date date,
  duration_weeks integer,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- weekday: 0 = lunedì ... 6 = domenica
create table if not exists nutrition_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references nutrition_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  notes text,
  created_at timestamptz not null default now(),
  unique (plan_id, weekday)
);

create table if not exists nutrition_plan_meals (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references nutrition_plan_days(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type text not null,
  title text not null,
  instructions text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists nutrition_plan_meal_items (
  id uuid primary key default gen_random_uuid(),
  plan_meal_id uuid not null references nutrition_plan_meals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_name text not null,
  quantity_g numeric not null default 0,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table nutrition_plans enable row level security;
alter table nutrition_plan_days enable row level security;
alter table nutrition_plan_meals enable row level security;
alter table nutrition_plan_meal_items enable row level security;

create policy "own nutrition_plans" on nutrition_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own nutrition_plan_days" on nutrition_plan_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own nutrition_plan_meals" on nutrition_plan_meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own nutrition_plan_meal_items" on nutrition_plan_meal_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists nutrition_plans_user_id_idx on nutrition_plans(user_id);
create index if not exists nutrition_plan_days_plan_id_idx on nutrition_plan_days(plan_id);
create index if not exists nutrition_plan_meals_plan_day_id_idx on nutrition_plan_meals(plan_day_id);
create index if not exists nutrition_plan_meal_items_plan_meal_id_idx on nutrition_plan_meal_items(plan_meal_id);
