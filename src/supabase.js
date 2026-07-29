import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Salva la sessione in localStorage: è quello che rende un dispositivo
    // "noto" anche offline, perché main.jsx la può rileggere subito senza rete.
    persistSession: true,
    // Prova a rinnovare automaticamente il token quando c'è connessione.
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
})
