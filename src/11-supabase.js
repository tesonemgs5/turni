import { createClient } from '@supabase/supabase-js'
import { SUPABASE_CONFIGURATO } from './42-regola-supabase.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// REGOLA 1: Supabase e' solo un backup. Senza chiavi nella build (app distribuita senza Supabase)
// al posto del collegamento vero c'e' questo finto client: ogni richiesta risponde subito
// «backup disattivato» e l'app va avanti da sola, tutta in locale, senza errori.
function creaClientSpento() {
  const risposta = { data: null, count: null, status: 0, error: { message: 'Backup Supabase non collegato', code: 'BACKUP_DISATTIVATO', backupDisattivato: true } }
  const catena = new Proxy(function () {}, {
    get: (_t, chiave) => (chiave === 'then' ? (ok) => ok(risposta) : catena),
    apply: () => catena,
  })
  const canale = { on() { return canale }, subscribe() { return canale }, unsubscribe() {} }
  const erroreAuth = { data: { session: null, user: null }, error: risposta.error }
  return {
    from: () => catena,
    rpc: () => catena,
    functions: { invoke: async () => risposta },
    storage: { from: () => catena },
    channel: () => canale,
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => erroreAuth,
      signUp: async () => erroreAuth,
    },
  }
}

export const supabase = SUPABASE_CONFIGURATO
  ? createClient(supabaseUrl, supabaseKey, {
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
  : creaClientSpento()
