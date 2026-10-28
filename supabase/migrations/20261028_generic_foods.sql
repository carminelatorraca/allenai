create table if not exists public.generic_foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  calories_100g numeric(6,1) not null,
  protein_100g numeric(5,2) not null,
  carbs_100g numeric(5,2) not null,
  fat_100g numeric(5,2) not null,
  fiber_100g numeric(5,2),
  source text not null default 'CREA - Tabelle di Composizione degli Alimenti, agg. 2019',
  created_at timestamptz not null default now()
);

alter table public.generic_foods enable row level security;

create policy "generic_foods_read_all"
  on public.generic_foods
  for select
  using (true);

insert into public.generic_foods (name, category, calories_100g, protein_100g, carbs_100g, fat_100g, fiber_100g) values
  ('Pasta di semola, cruda', 'Cereali e derivati', 341, 13.5, 72.7, 1.2, 1.7),
  ('Pasta di semola, cotta, bollita', 'Cereali e derivati', 175, 6.9, 37.3, 0.6, 0.9),
  ('Riso, brillato, crudo', 'Cereali e derivati', 334, 6.7, 80.4, 0.4, 1.0),
  ('Riso, brillato, cotto, bollito', 'Cereali e derivati', 100, 2.0, 24.2, 0.1, 0.2),
  ('Riso Basmati, crudo', 'Cereali e derivati', 367, 9.0, 82.9, 1.9, 1.3),
  ('Riso Basmati, cotto, bollito', 'Cereali e derivati', 113, 3.0, 25.2, 0.6, 0.7),
  ('Pane bianco', 'Cereali e derivati', 268, 8.1, 59.5, 0.5, 3.8),
  ('Pane di tipo integrale', 'Cereali e derivati', 224, 8.5, 44.1, 1.3, 6.5),
  ('Farina di frumento, tipo 00', 'Cereali e derivati', 323, 11.0, 71.6, 0.7, 2.2),
  ('Couscous, crudo', 'Cereali e derivati', 361, 13.7, 76.5, 1.1, 4.5),
  ('Couscous, cotto', 'Cereali e derivati', 179, 3.6, 39.7, 1.1, 2.7),
  ('Farro perlato, crudo', 'Cereali e derivati', 353, 14.6, 69.3, 2.4, 6.5),
  ('Farro perlato, cotto, bollito', 'Cereali e derivati', 178, 6.2, 37.3, 1.0, 2.1),
  ('Orzo perlato, crudo', 'Cereali e derivati', 346, 9.4, 73.7, 1.5, 9.2),
  ('Orzo perlato, cotto, bollito', 'Cereali e derivati', 118, 2.6, 26.4, 0.6, 1.8),
  ('Polenta, cotta', 'Cereali e derivati', 73, 0.9, 17.8, 0.04, 0.9),
  ('Fette biscottate', 'Cereali e derivati', 387, 11.3, 75.0, 6.0, 3.5),
  ('Gnocchi di patate, crudi', 'Cereali e derivati', 164, 3.9, 37.9, 0.3, 1.9),

  ('Ceci, secchi, cotti, bolliti', 'Legumi', 132, 7.0, 18.9, 2.4, 5.8),
  ('Lenticchie, secche, cotte, bollite', 'Legumi', 109, 6.9, 16.3, 0.4, 8.3),
  ('Fagioli, Borlotti, secchi, cotti, bolliti', 'Legumi', 106, 6.9, 16.4, 0.4, 6.9),
  ('Piselli, freschi', 'Legumi', 64, 5.5, 6.5, 0.6, 6.3),

  ('Patate, crude', 'Verdure e ortaggi', 72, 2.0, 16.0, 0.1, 1.8),
  ('Zucchine, crude', 'Verdure e ortaggi', 16, 1.5, 1.7, 0.1, 1.2),
  ('Pomodori, maturi, freschi', 'Verdure e ortaggi', 23, 1.0, 3.5, 0.2, 2.0),
  ('Lattuga, fresca', 'Verdure e ortaggi', 22, 1.8, 2.2, 0.4, 1.5),
  ('Carote, crude', 'Verdure e ortaggi', 41, 1.1, 7.6, 0.2, 3.1),
  ('Spinaci, crudi', 'Verdure e ortaggi', 35, 3.4, 2.9, 0.7, 1.9),
  ('Broccolo a testa, crudo', 'Verdure e ortaggi', 33, 3.0, 3.1, 0.4, 3.1),
  ('Melanzane, crude', 'Verdure e ortaggi', 23, 1.0, 2.6, 0.4, 2.6),
  ('Peperoni, crudi', 'Verdure e ortaggi', 26, 0.9, 4.2, 0.3, 1.9),

  ('Mele, fresche, con buccia', 'Frutta', 44, 0.2, 10.0, 0.1, 2.6),
  ('Banane, fresche', 'Frutta', 76, 1.2, 17.4, 0.3, 1.8),
  ('Arance, fresche', 'Frutta', 37, 0.7, 7.8, 0.2, 1.6),
  ('Pere, fresche, senza buccia', 'Frutta', 43, 0.3, 8.8, 0.1, 3.8),

  ('Pollo, petto, crudo', 'Carni fresche', 100, 23.3, 0, 0.8, null),
  ('Tacchino, fesa, crudo', 'Carni fresche', 107, 24.0, 0, 1.2, null),
  ('Bovino adulto o vitellone, fesa, crudo', 'Carni fresche', 103, 21.8, 0, 1.8, null),
  ('Vitello, filetto, crudo', 'Carni fresche', 107, 20.7, 0, 2.7, null),

  ('Tonno, fresco, crudo', 'Prodotti della pesca', 159, 21.5, 0.1, 8.1, null),
  ('Tonno in salamoia, sgocciolato', 'Prodotti della pesca', 103, 25.1, 0, 0.3, null),
  ('Salmone, fresco, crudo', 'Prodotti della pesca', 185, 18.4, 1.0, 12.0, null),
  ('Merluzzo o nasello, crudo', 'Prodotti della pesca', 71, 17.0, 0, 0.3, null),
  ('Gamberi, crudi', 'Prodotti della pesca', 71, 13.6, 2.9, 0.6, null),

  ('Uova di gallina, intero', 'Uova', 128, 12.4, 0.1, 8.7, null),

  ('Latte di vacca, pastorizzato, parzialmente scremato', 'Latte e yogurt', 46, 3.5, 5.0, 1.5, null),
  ('Yogurt da latte, parzialmente scremato', 'Latte e yogurt', 43, 3.4, 3.8, 1.7, null),

  ('Mozzarella di vacca', 'Formaggi e latticini', 253, 18.7, 0.7, 19.5, null),
  ('Parmigiano Reggiano DOP', 'Formaggi e latticini', 397, 32.4, 0.1, 29.7, null),
  ('Ricotta di vacca', 'Formaggi e latticini', 146, 8.8, 3.5, 10.9, null),

  ('Olio di oliva extra vergine', 'Oli e grassi', 899, 0, 0, 99.9, null)
on conflict do nothing;
