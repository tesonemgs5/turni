-- Eseguire una volta nel SQL editor di Supabase prima di usare l'ordine per gruppo.
ALTER TABLE public.gruppi_modelli
  ADD COLUMN IF NOT EXISTS ordine_modelli TEXT NOT NULL DEFAULT 'manuale'
  CHECK (ordine_modelli IN ('manuale', 'orario', 'alfabetico'));
