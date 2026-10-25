-- Preferenza di tema (scuro/chiaro) salvata per account.
alter table public.profiles
  add column if not exists theme text not null default 'dark' check (theme in ('dark', 'light'));
