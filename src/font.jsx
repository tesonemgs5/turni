// ═══════════════════════════════════════════════════════════════
// FONT.JSX — Costanti di FONT e COLORI usate da app.jsx
// Tenute qui separate per poterle gestire in un unico posto.
// ═══════════════════════════════════════════════════════════════

// ── FONT ──────────────────────────────────────────────────────
export const FONT_FAMILY_BASE = "system-ui,sans-serif";
export const FONT_FAMILY_DISPLAY = "Georgia,serif";

export const FONT_SIZE = {
  xs: 9,
  sm: 10,
  base: 12,
  md: 13,
  lg: 14,
  xl: 16,
  xxl: 18,
  title: 22,
  hero: 24,
};

// ── PALETTE COLORI DISPONIBILI PER ASSEGNAZIONE MANUALE ────────
// Colori selezionabili nella sezione "Colori", nel form modello,
// e ora anche per personalizzare le fasce automatiche.
export const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
  "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6",
  "#a855f7","#ec4899","#f43f5e","#64748b","#0f172a","#ffffff",
  "#fca5a5","#fed7aa","#fef08a","#bbf7d0","#bfdbfe","#ddd6fe",
];

// ── COLORI AUTOMATICI PER FASCIA ORARIA (DEFAULT) ───────────────
// Usati come fallback iniziale. L'utente può personalizzarli da
// Impostazioni → Fasce orarie automatiche (salvati in user_settings).
export const FASCE_AUTOMATICHE_DEFAULT = [
  { key:"mattina",     label:"MATTINA",     color:"#f59e0b", from:360,  to:705  }, // 06:00–11:45
  { key:"pomeriggio",  label:"POMERIGGIO",  color:"#f97316", from:705,  to:1035 }, // 11:45–17:15
  { key:"terzo_turno", label:"3° TURNO",    color:"#8b5cf6", from:1035, to:1080 }, // 17:15–18:00
  { key:"notte",       label:"NOTTE",       color:"#1e40af", from:1080, to:360  }, // resto (avvolge la mezzanotte)
];

// Retro-compatibilità: se qualcosa importa ancora FASCE_AUTOMATICHE
// direttamente, punta ai default. App.jsx usa invece le fasce
// personalizzate salvate su Supabase (store.fasceAutomatiche).
export const FASCE_AUTOMATICHE = FASCE_AUTOMATICHE_DEFAULT;

// Colore standard per i modelli H24 / senza orario
export const COLORE_H24 = "#64748b";

// ── FUNZIONI COLORE/ORARIO ──────────────────────────────────────
// Accettano un parametro opzionale `fasce` per usare le fasce
// personalizzate dall'utente; se omesso usano i default.
function minsOf(tIn){
  const [h,m]=tIn.split(":").map(Number);
  return h*60+m;
}
function inRange(mins, from, to){
  // Gestisce anche fasce che avvolgono la mezzanotte (from > to)
  if(from<=to) return mins>=from && mins<to;
  return mins>=from || mins<to;
}

export function getColorByTime(tIn, fasce=FASCE_AUTOMATICHE_DEFAULT){
  if(!tIn) return COLORE_H24;
  const mins=minsOf(tIn);
  for(const f of fasce){
    if(inRange(mins, f.from, f.to)) return f.color;
  }
  return fasce[fasce.length-1]?.color||COLORE_H24;
}

export function getColorLabel(tIn, fasce=FASCE_AUTOMATICHE_DEFAULT){
  if(!tIn) return "";
  const mins=minsOf(tIn);
  for(const f of fasce){
    if(inRange(mins, f.from, f.to)) return f.label;
  }
  return fasce[fasce.length-1]?.label||"";
}
