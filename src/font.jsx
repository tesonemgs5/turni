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
// Colori selezionabili nella sezione "Colori" e nel form modello.
export const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
  "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6",
  "#a855f7","#ec4899","#f43f5e","#64748b","#0f172a","#ffffff",
  "#fca5a5","#fed7aa","#fef08a","#bbf7d0","#bfdbfe","#ddd6fe",
];

// ── COLORI AUTOMATICI PER FASCIA ORARIA ─────────────────────────
// Questi restano fissi: non sono riassegnabili dalla sezione Colori,
// sono solo mostrati come riferimento.
export const FASCE_AUTOMATICHE = [
  { key:"mattina",     label:"MATTINA",     color:"#f59e0b", from:360,  to:705  }, // 06:00–11:45
  { key:"pomeriggio",  label:"POMERIGGIO",  color:"#f97316", from:705,  to:1035 }, // 11:45–17:15
  { key:"terzo_turno", label:"3° TURNO",    color:"#8b5cf6", from:1035, to:1080 }, // 17:15–18:00
  { key:"notte",       label:"NOTTE",       color:"#1e40af", from:1080, to:360  }, // resto (avvolge la mezzanotte)
];

// Colore standard per i modelli H24 / senza orario
export const COLORE_H24 = "#64748b";

// ── FUNZIONI COLORE/ORARIO (automatiche, non modificabili) ─────
export function getColorByTime(tIn){
  if(!tIn) return COLORE_H24;
  const [h,m]=tIn.split(":").map(Number);
  const mins=h*60+m;
  if(mins>=360&&mins<705) return "#f59e0b";
  if(mins>=705&&mins<1035) return "#f97316";
  if(mins>=1035&&mins<1080) return "#8b5cf6";
  return "#1e40af";
}

export function getColorLabel(tIn){
  if(!tIn) return "";
  const [h,m]=tIn.split(":").map(Number);
  const mins=h*60+m;
  if(mins>=360&&mins<705) return "MATTINA";
  if(mins>=705&&mins<1035) return "POMERIGGIO";
  if(mins>=1035&&mins<1080) return "3° TURNO";
  return "NOTTE";
}
