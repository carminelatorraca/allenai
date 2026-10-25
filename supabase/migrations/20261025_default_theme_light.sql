-- Il tema chiaro diventa quello predefinito dell'app.
alter table public.profiles
  alter column theme set default 'light';

update public.profiles
  set theme = 'light'
  where theme = 'dark';
