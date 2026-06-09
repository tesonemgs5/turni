-- =====================================================================
-- SCRIPT DI CONFIGURAZIONE DATABASE SUPABASE - CALENDARIO TURNI
-- =====================================================================
-- Esegui questo script nell'area "SQL Editor" di Supabase per creare
-- le tabelle necessarie e abilitare le politiche di sicurezza (RLS).
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
CREATE POLICY "Gli utenti possono gestire solo i propri calendari" 
ON public.calendars 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 2. Tabella Eventi
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Abilita RLS per la tabella Eventi
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Politiche RLS per Eventi (Isolamento utenti)
CREATE POLICY "Gli utenti possono gestire solo i propri eventi" 
ON public.events 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 3. Tabella Impostazioni Utente
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
CREATE POLICY "Gli utenti possono gestire solo le proprie impostazioni" 
ON public.user_settings 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 4. Tabella Statistiche di Utilizzo (Anonima e conforme al GDPR)
-- Questa tabella memorizza solo l'ID utente (pseudonimizzato) e l'ultimo accesso.
-- Non memorizza indirizzi IP, email, nomi o dati personali.
CREATE TABLE IF NOT EXISTS public.usage_stats (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    login_count INTEGER DEFAULT 1 NOT NULL
);

-- Abilita RLS per la tabella Statistiche
ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;

-- Politica per permettere a ciascun utente loggato di salvare/aggiornare le proprie statistiche anonime
CREATE POLICY "Gli utenti possono aggiornare le proprie statistiche" 
ON public.usage_stats 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);


-- 5. Funzione Sicura per Statistiche Amministratore (GDPR Compliant)
-- Questa funzione viene eseguita con privilegi elevati (SECURITY DEFINER) per poter
-- contare le righe globalmente, ma restituisce SOLO aggregati numerici (conteggi).
-- Non rivela chi sono gli utenti (nessuna email o ID viene esposto all'admin).
CREATE OR REPLACE FUNCTION public.get_app_stats()
RETURNS TABLE (
    total_users BIGINT,
    active_users_7d BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER -- Permette di bypassare la RLS della tabella usage_stats per fare il conteggio aggregato
AS $$
DECLARE
    caller_email TEXT;
BEGIN
    -- Recupera l'email dell'utente che sta chiamando la funzione dal JWT di Supabase
    caller_email := auth.jwt() ->> 'email';

    -- CONTROLLO SICUREZZA: Sostituisci 'tesonemgs5@gmail.com' con l'email dell'admin se diversa.
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

-- Rendi la funzione eseguibile solo da utenti autenticati
REVOKE EXECUTE ON FUNCTION public.get_app_stats() FROM public;
REVOKE EXECUTE ON FUNCTION public.get_app_stats() FROM anonymous;
GRANT EXECUTE ON FUNCTION public.get_app_stats() TO authenticated;
