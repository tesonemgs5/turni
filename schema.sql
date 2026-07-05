-- =====================================================================
-- SCRIPT DI CONFIGURAZIONE DATABASE SUPABASE - CALENDARIO TURNI
-- =====================================================================
-- Esegui questo script nell'area "SQL Editor" di Supabase per creare
-- le tabelle necessarie, abilitare le politiche di sicurezza (RLS)
-- e configurare gli indici di performance.
-- =====================================================================

-- 1. Tabella Calendari
CREATE TABLE IF NOT EXISTS public.calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    is_main BOOLEAN NOT NULL DEFAULT false,
    shifts JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Abilita RLS per la tabella Calendari
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;

-- Politiche RLS per Calendari (Isolamento utenti)
DROP POLICY IF EXISTS "Gli utenti possono gestire solo i propri calendari" ON public.calendars;
CREATE POLICY "Gli utenti possono gestire solo i propri calendari" 
ON public.calendars 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 2. Tabella Modelli Turni
CREATE TABLE IF NOT EXISTS public.modelli (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    titolo TEXT NOT NULL,
    label TEXT,
    tempo TEXT,
    inizio TEXT,
    fine TEXT,
    colore TEXT,
    colore_custom TEXT,
    posizione TEXT,
    sort_order INTEGER DEFAULT 0,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Abilita RLS per la tabella Modelli
ALTER TABLE public.modelli ENABLE ROW LEVEL SECURITY;

-- Politiche RLS per Modelli (Isolamento utenti)
DROP POLICY IF EXISTS "Gli utenti possono gestire solo i propri modelli" ON public.modelli;
CREATE POLICY "Gli utenti possono gestire solo i propri modelli" 
ON public.modelli 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 3. Tabella Rotazioni
CREATE TABLE IF NOT EXISTS public.rotazioni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    titolo TEXT,
    data_inizio TEXT,
    n_settimane INTEGER DEFAULT 52,
    modello_lavoro_id UUID REFERENCES public.modelli(id) ON DELETE SET NULL,
    modello_nl_id UUID REFERENCES public.modelli(id) ON DELETE SET NULL,
    modello_rs_id UUID REFERENCES public.modelli(id) ON DELETE SET NULL,
    griglia JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Abilita RLS per la tabella Rotazioni
ALTER TABLE public.rotazioni ENABLE ROW LEVEL SECURITY;

-- Politiche RLS per Rotazioni (Isolamento utenti)
DROP POLICY IF EXISTS "Gli utenti possono gestire solo le proprie rotazioni" ON public.rotazioni;
CREATE POLICY "Gli utenti possono gestire solo le proprie rotazioni" 
ON public.rotazioni 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 4. Tabella Eventi
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    calendar_id UUID NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
    date_key TEXT NOT NULL, -- Formato: AAAA-MM-GG
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT true,
    time_in TEXT DEFAULT '',
    time_out TEXT DEFAULT '',
    place TEXT DEFAULT '',
    map_url TEXT DEFAULT '',
    note TEXT DEFAULT '',
    modello_id UUID REFERENCES public.modelli(id) ON DELETE SET NULL,
    rotazione_id UUID REFERENCES public.rotazioni(id) ON DELETE SET NULL,
    collega TEXT DEFAULT '',
    auto TEXT DEFAULT '',
    prot_pag_fine TEXT DEFAULT NULL,
    prot_rec_fine TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Abilita RLS per la tabella Eventi
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Politiche RLS per Eventi (Isolamento utenti)
DROP POLICY IF EXISTS "Gli utenti possono gestire solo i propri eventi" ON public.events;
CREATE POLICY "Gli utenti possono gestire solo i propri eventi" 
ON public.events 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 5. Tabella Impostazioni Utente
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'auto',
    extra_hols JSONB NOT NULL DEFAULT '[]'::jsonb,
    sheets_url TEXT DEFAULT '',
    sheets_secret TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Abilita RLS per la tabella Impostazioni
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Politiche RLS per Impostazioni (Isolamento utenti)
DROP POLICY IF EXISTS "Gli utenti possono gestire solo le proprie impostazioni" ON public.user_settings;
CREATE POLICY "Gli utenti possono gestire solo le proprie impostazioni" 
ON public.user_settings 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 6. Tabella Statistiche di Utilizzo (Anonima e conforme al GDPR)
CREATE TABLE IF NOT EXISTS public.usage_stats (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    login_count INTEGER DEFAULT 1 NOT NULL
);

-- Abilita RLS per la tabella Statistiche
ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;

-- Politica per permettere a ciascun utente loggato di salvare/aggiornare le proprie statistiche
DROP POLICY IF EXISTS "Gli utenti possono aggiornare le proprie statistiche" ON public.usage_stats;
CREATE POLICY "Gli utenti possono aggiornare le proprie statistiche" 
ON public.usage_stats 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 7. Tabella Backups (Snapshot del database dell'utente)
CREATE TABLE IF NOT EXISTS public.backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Abilita RLS per la tabella Backups
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- Politica per permettere a ciascun utente loggato di salvare/ripristinare i propri backup
DROP POLICY IF EXISTS "Gli utenti possono gestire solo i propri backup" ON public.backups;
CREATE POLICY "Gli utenti possono gestire solo i propri backup" 
ON public.backups 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- =====================================================================
-- INDICI DI PERFORMANCE PER OTTIMIZZARE LE QUERY
-- =====================================================================

-- Indici per Calendari
CREATE INDEX IF NOT EXISTS idx_calendars_user_id ON public.calendars(user_id);

-- Indici per Eventi
CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_calendar_id ON public.events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_events_date_key ON public.events(date_key);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON public.events(user_id, date_key);
CREATE INDEX IF NOT EXISTS idx_events_modello_id ON public.events(modello_id);
CREATE INDEX IF NOT EXISTS idx_events_rotazione_id ON public.events(rotazione_id);

-- Indici per Modelli
CREATE INDEX IF NOT EXISTS idx_modelli_user_id ON public.modelli(user_id);
CREATE INDEX IF NOT EXISTS idx_modelli_calendar_id ON public.modelli(calendar_id);

-- Indici per Rotazioni
CREATE INDEX IF NOT EXISTS idx_rotazioni_user_id ON public.rotazioni(user_id);

-- Indici per Backups
CREATE INDEX IF NOT EXISTS idx_backups_user_id ON public.backups(user_id);


-- =====================================================================
-- FUNZIONI SICURE E AMMINISTRAZIONE
-- =====================================================================

-- Funzione Sicura per Statistiche Amministratore (GDPR Compliant)
CREATE OR REPLACE FUNCTION public.get_app_stats()
RETURNS TABLE (
    total_users BIGINT,
    active_users_7d BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    caller_email TEXT;
BEGIN
    caller_email := auth.jwt() ->> 'email';
    IF caller_email = 'tesonemgs5@gmail.com' THEN
        RETURN QUERY
        SELECT 
            COUNT(DISTINCT user_id)::BIGINT as total_users,
            COUNT(DISTINCT user_id) FILTER (WHERE last_active > (now() - INTERVAL '7 days'))::BIGINT as active_users_7d
        FROM public.usage_stats;
    ELSE
        RAISE EXCEPTION 'Accesso negato: Non hai i permessi di amministratore per visualizzare le statistiche.';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_app_stats() FROM public;
REVOKE EXECUTE ON FUNCTION public.get_app_stats() FROM anonymous;
GRANT EXECUTE ON FUNCTION public.get_app_stats() TO authenticated;
