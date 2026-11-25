// ═══════════════════════════════════════════════════════════════
// REGOLA 1 — Tutto (A→Z, 0→100%) vive e si gestisce in LOCALE, compresi i log.
// Supabase e' il BACKUP e il canale per allineare un altro dispositivo, ma l'app
// deve funzionare benissimo anche senza: chiavi assenti, servizio spento, progetto
// cancellato, oppure scelta «Continua senza account».
// La sincronizzazione tra dispositivi resta sotto controllo dell'utente
// (interruttore «Sincronizzazione automatica» nelle Impostazioni).
// ═══════════════════════════════════════════════════════════════

// Nessun controllo automatico della struttura di Supabase (resta il pulsante manuale).
export const CONTROLLI_AUTOMATICI_SUPABASE = false;

// Supabase e' collegabile solo se la build contiene le chiavi (l'app distribuita senza Supabase non le ha).
export const SUPABASE_CONFIGURATO = Boolean(
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Scelta «Continua senza account»: l'app gira solo in locale, senza backup.
export const CHIAVE_MODALITA_LOCALE = "turnipm_modalita_locale";
export const CHIAVE_ULTIMO_UTENTE = "turnipm_ultimo_utente";
