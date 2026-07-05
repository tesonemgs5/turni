-- ═══════════════════════════════════════════════════════════════
-- COLORI.SQL — Tabella dedicata per i colori personalizzati
-- della sezione "Colori" (accanto a Turni e Rotazioni).
--
-- Da eseguire su Supabase: SQL Editor → incolla → Run.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.colori (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  hex         text not null,
  created_at  timestamptz not null default now(),

  -- Un utente non può avere lo stesso colore duplicato due volte
  constraint colori_user_hex_unique unique (user_id, hex),
  -- Il colore deve essere un hex valido tipo #RRGGBB
  constraint colori_hex_format check (hex ~* '^#[0-9a-f]{6}$')
);

-- Indice per velocizzare le query per utente
create index if not exists idx_colori_user_id on public.colori(user_id);

-- Row Level Security: ogni utente vede/modifica solo i propri colori
alter table public.colori enable row level security;

drop policy if exists "colori_select_own" on public.colori;
create policy "colori_select_own"
  on public.colori for select
  using (auth.uid() = user_id);

drop policy if exists "colori_insert_own" on public.colori;
create policy "colori_insert_own"
  on public.colori for insert
  with check (auth.uid() = user_id);

drop policy if exists "colori_update_own" on public.colori;
create policy "colori_update_own"
  on public.colori for update
  using (auth.uid() = user_id);

drop policy if exists "colori_delete_own" on public.colori;
create policy "colori_delete_own"
  on public.colori for delete
  using (auth.uid() = user_id);

-- Nota: la colonna "colore_custom" già esistente sulla tabella "modelli"
-- resta invariata ed è quella che tiene traccia di QUALE colore ha
-- ciascun modello. Questa nuova tabella "colori" serve solo a ricordare
-- QUALI colori personalizzati sono stati creati dall'utente nella
-- sezione Colori, così restano disponibili anche se al momento
-- nessun modello li sta usando.
