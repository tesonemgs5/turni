// ═══════════════════════════════════════════════════════════════
// REGOLA 1 — Supabase e' SOLO un backup. Tutto (A→Z, 0→100%) vive e si gestisce
// in LOCALE, compresi i log. Se Supabase non c'e' (chiavi assenti, servizio
// spento, progetto cancellato) l'app funziona come se niente fosse.
//  - I dati di Supabase non sovrascrivono MAI quelli locali in automatico.
//  - Si leggono da Supabase solo per un ripristino chiesto esplicitamente.
// ═══════════════════════════════════════════════════════════════

export const SUPABASE_SOLO_BACKUP = true;

// Supabase e' collegabile solo se la build contiene le chiavi (l'app distribuita senza Supabase non le ha).
export const SUPABASE_CONFIGURATO = Boolean(
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Scelta «Continua senza account»: l'app gira solo in locale, senza backup.
export const CHIAVE_MODALITA_LOCALE = "turnipm_modalita_locale";
export const CHIAVE_ULTIMO_UTENTE = "turnipm_ultimo_utente";
