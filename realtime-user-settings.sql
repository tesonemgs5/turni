-- Da eseguire UNA volta nel SQL editor di Supabase: abilita il tempo reale anche sulle impostazioni
-- (giorni importanti e festivi personali), così le modifiche arrivano subito sugli altri dispositivi.
alter publication supabase_realtime add table public.user_settings;
