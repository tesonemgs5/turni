// ═══════════════════════════════════════════════════════════════
// APP.JSX — Mappa delle region: vedi mappa.md per indice completo
// (font.jsx accorpato qui sotto — SEZIONE 0)
// ═══════════════════════════════════════════════════════════════

// #region SEZIONE 0: FONT & COLORI (ex font.jsx, accorpato)
// ═══════════════════════════════════════════════════════════════
export const FONT_FAMILY_BASE = "system-ui,sans-serif";
export const FONT_FAMILY_DISPLAY = "Georgia,serif";
export const FONT_SIZE = { xs:9, sm:10, base:12, md:13, lg:14, xl:16, xxl:18, title:22, hero:24 };

// Palette condivisa: sezione Colori, form modello, fasce automatiche
export const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
  "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6",
  "#a855f7","#ec4899","#f43f5e","#64748b","#0f172a","#ffffff",
  "#fca5a5","#fed7aa","#fef08a","#bbf7d0","#bfdbfe","#ddd6fe",
];

// Colori automatici per fascia oraria (default, sovrascrivibili da Impostazioni)
export const FASCE_AUTOMATICHE_DEFAULT = [
  { key:"mattina",     label:"PRIMO",       color:"#f59e0b", from:360,  to:705  },
  { key:"pomeriggio",  label:"SECONDO",     color:"#f97316", from:705,  to:1035 },
  { key:"terzo_turno", label:"3° TURNO",    color:"#8b5cf6", from:1035, to:1080 },
  { key:"notte",       label:"NOTTE",       color:"#1e40af", from:1080, to:360  },
];
export const FASCE_AUTOMATICHE = FASCE_AUTOMATICHE_DEFAULT; // retro-compat
export const COLORE_H24 = "#64748b";

function minsOf(tIn){
  if(!tIn) return 0;
  let s=String(tIn).trim().replace(/["']/g,"").trim();
  let m=s.match(/^(\d{1,2})[:.,](\d{1,2})/);
  if(!m){
    const digits=s.match(/^(\d{3,4})$/);
    if(digits){ const d=digits[1].padStart(4,"0"); m=[null,d.slice(0,2),d.slice(2,4)]; }
  }
  if(!m) return 0;
  const h=parseInt(m[1],10), mi=parseInt(m[2],10);
  if(!Number.isFinite(h)||!Number.isFinite(mi)) return 0;
  return h*60+mi;
}
function inRange(mins, from, to){ return from<=to ? (mins>=from && mins<to) : (mins>=from || mins<to); }
export function getColorByTime(tIn, fasce=FASCE_AUTOMATICHE_DEFAULT){
  if(!tIn) return COLORE_H24;
  const mins=minsOf(tIn);
  for(const f of fasce) if(inRange(mins, f.from, f.to)) return f.color;
  return fasce[fasce.length-1]?.color||COLORE_H24;
}
export function getColorLabel(tIn, fasce=FASCE_AUTOMATICHE_DEFAULT){
  if(!tIn) return "";
  const mins=minsOf(tIn);
  for(const f of fasce) if(inRange(mins, f.from, f.to)) return f.label;
  return fasce[fasce.length-1]?.label||"";
}
export function getContrastTextColor(hex){
  if(!hex) return "#ffffff";
  try {
    const h=hex.replace("#","");
    const r=parseInt(h.substring(0,2),16), g=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16);
    const a=[r,g,b].map(v=>{ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); });
    const lum=0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
    return lum < 0.5 ? "#ffffff" : "#0f172a";
  } catch(e){ return "#ffffff"; }
}
// #endregion


// #region SEZIONE 1: IMPORTS + COSTANTI
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { supabase } from "./supabase";

const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAYS = ["L","M","M","G","V","S","D"];

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
// #endregion


// #region SEZIONE 2: LOCALSTORAGE CACHE
// ═══════════════════════════════════════════════════════════════
function saveToLocalStorage(events, calendars, modelli, calId){
  try {
    localStorage.setItem('cache_events', JSON.stringify(events));
    localStorage.setItem('cache_calendars', JSON.stringify(calendars));
    localStorage.setItem('cache_modelli', JSON.stringify(modelli));
    localStorage.setItem('cache_timestamp', new Date().toISOString());
    if(calId) localStorage.setItem('cache_calId', calId);
  } catch(e){ console.warn('localStorage error:', e); }
}
function loadFromLocalStorage(){
  try {
    const events = JSON.parse(localStorage.getItem('cache_events')||'{}');
    const calendars = JSON.parse(localStorage.getItem('cache_calendars')||'[]');
    const modelli = JSON.parse(localStorage.getItem('cache_modelli')||'[]');
    const timestamp = localStorage.getItem('cache_timestamp')||null;
    const calId = localStorage.getItem('cache_calId')||null;
    return { events, calendars, modelli, timestamp, calId };
  } catch(e){ return null; }
}
function clearLocalStorageCache(){
  localStorage.removeItem('cache_events');
  localStorage.removeItem('cache_calendars');
  localStorage.removeItem('cache_modelli');
  localStorage.removeItem('cache_timestamp');
  localStorage.removeItem('cache_calId');
}
// Confronto "sono uguali questi dati?" usato per evitare un re-render visibile
// quando la risposta di Supabase coincide con quanto già mostrato dalla cache.
function sameData(a, b){
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch(e){ return false; }
}
// ── Helper immutabili per lo store eventi. Al posto del deep-clone completo
// (JSON.parse(JSON.stringify(prev))) che ricopia TUTTO lo storico ad ogni
// singola modifica, questi toccano solo il giorno/calendario interessato:
// tutti gli altri giorni restano lo stesso riferimento (più veloce, e più
// corretto per eventuali ottimizzazioni di render future con React.memo).
// Usati solo nei CRUD "singolo evento" (hot path, chiamati ad ogni tap);
// le operazioni bulk (rotazioni, import, cancellazioni massive) continuano
// a usare il deep-clone completo perché toccano molti giorni sparsi insieme.
function withEventoAggiunto(store, dayKey, calId, evt){
  const dayEvents = { ...(store.events[dayKey]||{}) };
  dayEvents[calId] = [...(dayEvents[calId]||[]), evt];
  return { ...store, events: { ...store.events, [dayKey]: dayEvents } };
}
function withEventoAggiornato(store, dayKey, calId, evtId, patch){
  const dayEvents = { ...(store.events[dayKey]||{}) };
  dayEvents[calId] = (dayEvents[calId]||[]).map(e=>e.id===evtId?{...e,...patch}:e);
  return { ...store, events: { ...store.events, [dayKey]: dayEvents } };
}
function withEventoRimosso(store, dayKey, calId, evtId){
  const dayEvents = { ...(store.events[dayKey]||{}) };
  dayEvents[calId] = (dayEvents[calId]||[]).filter(e=>e.id!==evtId);
  return { ...store, events: { ...store.events, [dayKey]: dayEvents } };
}
// #endregion


// #region SEZIONE 3: UTILITY FUNCTIONS (date/festivi)
// ═══════════════════════════════════════════════════════════════
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function firstDay(y,m){ const d=new Date(y,m,1).getDay(); return d===0?6:d-1; }
function dkey(y,m,d){ return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function fmtDataIT(input){
  // Accetta una date_key "YYYY-MM-DD" oppure un oggetto Date, restituisce "GG-MM-AAAA"
  if(input instanceof Date){
    const g=String(input.getDate()).padStart(2,"0");
    const m=String(input.getMonth()+1).padStart(2,"0");
    const a=input.getFullYear();
    return `${g}-${m}-${a}`;
  }
  if(typeof input==="string" && /^\d{4}-\d{2}-\d{2}$/.test(input)){
    const [a,m,g]=input.split("-");
    return `${g}-${m}-${a}`;
  }
  return input;
}
const NOMI_GIORNI_IT=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
const NOMI_MESI_IT=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];

function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m2=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*m2+114)/31),da=((h+l-7*m2+114)%31)+1;
  return {m:mo-1,d:da};
}
function italianHols(y){
  const e=easter(y);
  // Gestione nativa del rollover del mese se Pasqua è a fine mese
  const pasquettaDate = new Date(y, e.m, e.d + 1);
  return [{m:0,d:1},{m:0,d:6},{m:3,d:25},{m:4,d:1},{m:5,d:2},
    {m:7,d:15},{m:10,d:1},{m:11,d:8},{m:11,d:25},{m:11,d:26},
    {m:e.m,d:e.d},{m:pasquettaDate.getMonth(),d:pasquettaDate.getDate()}];
}
// #endregion


// #region SEZIONE 4: COLOR & TIME FUNCTIONS
// ═══════════════════════════════════════════════════════════════
// getColorByTime / getColorLabel sono in SEZIONE 0 (ex font.jsx).
// ─── Parser tollerante per QUALSIASI scrittura di un orario ───
// Accetta: "6:15", "06:15", "6.15", "6,15", "615" (senza separatore),
// "6:15:00" (con secondi), con spazi o virgolette attorno, ecc.
// Ritorna sempre "HH:MM" a due cifre (formato canonico), oppure "" se non
// è un orario riconoscibile (l'input era vuoto o proprio incomprensibile).
function normalizzaOraHHMM(raw){
  if(raw===null || raw===undefined) return "";
  let s=String(raw).trim().replace(/["']/g,"").trim();
  if(!s) return "";
  // "6:15:00" -> tronca i secondi
  s=s.replace(/^(\d{1,2}[:.,]\d{1,2})[:.,]\d{1,2}$/, "$1");
  // separatori misti (":" "." ",") -> uniforma a ":"
  let m=s.match(/^(\d{1,2})[:.,](\d{1,2})$/);
  if(!m){
    // senza separatore, es "615" (6:15) o "0615" (06:15)
    const digits=s.match(/^(\d{1,4})$/);
    if(digits){
      const d=digits[1].padStart(4,"0");
      m=[null, d.slice(0,2), d.slice(2,4)];
    }
  }
  if(!m) return "";
  let h=parseInt(m[1],10), mm=parseInt(m[2],10);
  if(!Number.isFinite(h)||!Number.isFinite(mm)||h>23||mm>59) return "";
  return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}
// Converte un orario (in qualsiasi formato tollerato) in minuti dalla mezzanotte.
function oraInMinuti(raw){
  const hhmm=normalizzaOraHHMM(raw);
  if(!hhmm) return null;
  const [h,m]=hhmm.split(":").map(Number);
  return h*60+m;
}
function calcFine6h15(tIn){
  const mins=oraInMinuti(tIn);
  if(mins===null) return "";
  const tot=mins+375;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`;
}
function calcDurata(tIn,tOut){
  const m1=oraInMinuti(tIn), m2=oraInMinuti(tOut);
  if(m1===null||m2===null) return "";
  let mins=m2-m1;
  if(mins<0) mins+=24*60;
  const hh=Math.floor(mins/60),mm=mins%60;
  return `${hh}h${mm>0?` ${mm}m`:""}`;
}
// ─── Parser tollerante per varianti "sporche" del campo tempo ───
// Riconosce QUALSIASI scrittura tipo: "6h15", "6h 15m", "6h15m", "6:15",
// "06:15", "375" (minuti totali), '"6h15"' (con virgolette), spazi extra, ecc.
// Ritorna i minuti totali (es. 375) oppure null se non è un formato riconoscibile.
function parseMinutiDaStringaTempo(raw){
  if(raw===null || raw===undefined) return null;
  // numero puro -> già minuti totali
  if(typeof raw==="number" && Number.isFinite(raw)) return raw;
  let s=String(raw).trim();
  if(!s) return null;
  // rimuove virgolette (singole o doppie) e spazi superflui attorno ai numeri
  s=s.replace(/["']/g,"").trim();
  // stringa che è solo un numero -> minuti totali (es. "375")
  if(/^\d+$/.test(s)) return parseInt(s,10);
  // pattern tipo "6h15", "6h 15m", "6h15m", "6 h 15 m", "6h", "6:15", "06:15"
  const m=s.match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})?\s*m?$/i);
  if(m){
    const ore=parseInt(m[1],10);
    const min=m[2]?parseInt(m[2],10):0;
    return ore*60+min;
  }
  return null;
}
// Calcola i minuti reali di un modello dal suo campo tempo (se è una scrittura
// libera del tipo "6h15") oppure da inizio/fine (se presenti e validi).
function minutiTurnoModello(m){
  // 1) prova a leggere il campo tempo come durata scritta liberamente
  //    (es. "6h15", "6h 15m", "6:15"...) — utile per import/dati legacy
  //    ma SOLO se non è uno dei valori "di stato" noti del sistema.
  if(m.tempo && m.tempo!=="personalizzato" && m.tempo!=="h24"){
    const daTempo=parseMinutiDaStringaTempo(m.tempo);
    if(daTempo!==null) return daTempo;
  }
  // 2) altrimenti calcola dalla coppia inizio/fine, se presenti (in QUALSIASI
  //    formato tollerato, non solo "HH:MM" pulito)
  if(m.inizio && m.fine){
    const m1=oraInMinuti(m.inizio), m2=oraInMinuti(m.fine);
    if(m1!==null && m2!==null){
      let mins=m2-m1;
      if(mins<0) mins+=24*60;
      return mins;
    }
  }
  return null;
}
function isModelloTurnazioneDefault(m){
  if(m.tempo==="h24") return false; // H24 non è mai 6h15/6h30
  const mins=minutiTurnoModello(m);
  const isDefault = mins===375 || mins===390; // 6h15 o 6h30
  // Segnala in console i modelli "salvati" dal parser tollerante ma che
  // NON sono già nel formato canonico "6h15" — così emergono subito i
  // dati sporchi da sistemare con normalizzaModelliTempo(), invece di
  // scoprirli mesi dopo. Non blocca nulla, è solo un avviso per lo sviluppatore.
  if(isDefault && m.tempo!=="6h15" && typeof window!=="undefined" && window.__DEBUG_MODELLI__){
    console.warn(`[modelli] formato non standard rilevato su "${m.titolo||m.id}": tempo="${m.tempo}" inizio="${m.inizio}" fine="${m.fine}" → normalizzato a ${mins} min. Esegui normalizzaModelliTempo() per fissarlo a DB.`);
  }
  return isDefault;
}
// ── Due assi di classificazione automatica, completamente indipendenti:
// TURNO (1°/2°) decide solo in base all'orario di inizio.
// APP/AUTO decide solo in base al titolo del modello.
function categoriaTurnoAutomatica(m){
  if(!m) return null;
  if(m.tempo==="h24" || !m.inizio) return null; // H24 non ha una fascia oraria di inizio
  const isPrimo = inRange(minsOf(m.inizio), 360, 705);
  return isPrimo ? "primo" : "secondo";
}
function categoriaAppAutoAutomatica(m){
  if(!m) return null;
  if(m.tempo==="h24") return null; // H24 non ha mai categoria APP/AUTO
  const titoloEvt=(m.titolo||"").toUpperCase();
  return titoloEvt.includes("APP") ? "app" : "auto";
}
function getShiftBand(tIn){
  const mins=oraInMinuti(tIn);
  if(mins===null) return "diurno";
  const h=Math.floor(mins/60);
  if(h>=6 && h<22) return "diurno";
  return "notturno";
}
function isFestivo(dateKey){
  const d=new Date(dateKey);
  return d.getDay()===0;
}
// #endregion


// #region SEZIONE 5: REPORT TEMPLATES + INIT STATE
// ═══════════════════════════════════════════════════════════════
const REPORT_TEMPLATES = [
  { type:"conteggio_turni", label:"Conteggio turni", desc:"Conta i turni per fascia oraria" },
  { type:"turnazione",      label:"Turnazione", desc:"Turni per modello con date, 1°/2° turno automatico" },
  { type:"indennita",       label:"Indennità di servizio", desc:"Calcola le indennità per fascia" },
  { type:"ore_turno",       label:"Ore per turno", desc:"Stima ore lavorate" },
  { type:"straordinari",    label:"Straordinari", desc:"Protrazioni e straordinari" },
  { type:"guadagni",        label:"Guadagni", desc:"Stima guadagni da indennità" },
];

const INIT = { calendars:[], events:{}, theme:"auto", extraHols:[], reports:[], reportSettings:{}, fasceAutomatiche: FASCE_AUTOMATICHE_DEFAULT };

export default function App({ session }){
  const today = new Date();
  // ← AGGANCIO: qui aggiungo un <style> globale con @keyframes calFadeIn, iniettato una sola volta nel render finale
// #endregion


// #region SEZIONE 6: USESTATE HOOKS
// ═══════════════════════════════════════════════════════════════
  const [store, setStore] = useState(INIT);
  const [loading, setLoading] = useState(true);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calId, setCalId] = useState(null);
  useEffect(()=>{
    if(calId){ try{ localStorage.setItem('cache_calId', calId); }catch(e){} }
  }, [calId]);
  const [editMode, setEditMode] = useState(false); // "M" — ON = modifica singola, OFF = selezione multipla
  const [selectedCalIds, setSelectedCalIds] = useState([]); // selezione multipla calendari — determina anche cosa resta visibile in editMode
  const [reportCalIds, setReportCalIds] = useState([]); // selezione calendari per il Report (vuoto = tutti)
  const [selectedModelloIds, setSelectedModelloIds] = useState([]); // selezione multipla modelli (editMode OFF)
  const [screen, setScreen] = useState("cal");
  const [dayKey, setDayKey] = useState(null);
  const [form,   setForm]   = useState(null);
  const [pal,    setPal]    = useState(null);
  const [ncName,  setNcName]  = useState("");
  const [ncColor, setNcColor] = useState(PALETTE[9]);
  const [nsName,  setNsName]  = useState("");
  const [nsColor, setNsColor] = useState(PALETTE[0]);
  const [exCal,   setExCal]   = useState(null);
  const [nhName,  setNhName]  = useState("");
  const [syncMsg,  setSyncMsg]  = useState("");
  const [backupsList, setBackupsList] = useState([]);
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [showLocalDataModal, setShowLocalDataModal] = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [nhD,     setNhD]     = useState("");
  const [nhM,     setNhM]     = useState("");
  const [bgSyncing, setBgSyncing] = useState(false);
  const [dbError, setDbError] = useState("");
  const dbErrorTimer = useRef(null);
  function segnalaErroreDb(error, contesto){
    console.error(`[${contesto}]`, error);
    const msg = error?.message || "Errore sconosciuto";
    setDbError(`⚠️ ${contesto}: ${msg}`);
    if(dbErrorTimer.current) clearTimeout(dbErrorTimer.current);
    dbErrorTimer.current = setTimeout(()=>setDbError(""), 6000);
  }
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [sheetsSecret, setSheetsSecret] = useState("");
  const [stats, setStats] = useState(null);
  const [showDbModal, setShowDbModal] = useState(false);
  const [showModelloEditor, setShowModelloEditor] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [banner, setBanner] = useState(null);
  const [syncMode, setSyncMode] = useState(()=>localStorage.getItem('syncMode')||'on');
  const [dbRawData, setDbRawData] = useState(null);
  const [dbCalsCount, setDbCalsCount] = useState(0);
  const [dbEvtsCount, setDbEvtsCount] = useState(0);

  const [modelliTab, setModelliTab] = useState("turni");
  const [modelli, setModelli] = useState([]);
  const [modelliSort, setModelliSort] = useState("orario");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);
  const [editModello, setEditModello] = useState(null);
  const [modelForm, setModelForm] = useState({ titolo:"", tempo:"personalizzato", inizio:"", fine:"", coloreCustom:null, posizione:"" });

  // ── Colori: popup assegnazione modelli + palette colori extra creati dall'utente
  const [showColorAssignPicker, setShowColorAssignPicker] = useState(null); // colore hex attualmente aperto nel popup
  const [showAddColorPicker, setShowAddColorPicker] = useState(false); // popup "+" per aggiungere un colore alla sezione
  const [coloriExtra, setColoriExtra] = useState([]); // colori aggiunti manualmente o generati da modelli
  const [showEditFasciaColor, setShowEditFasciaColor] = useState(null); // key della fascia automatica di cui si sta editando il colore

  const [rotazioni, setRotazioni] = useState([]);
  const [showRotForm, setShowRotForm] = useState(false);
  const [editRotazione, setEditRotazione] = useState(null);
  const [rotForm, setRotForm] = useState({ tipo:"personalizzata", titolo:"", dataInizio:"", nSettimane:52, modellaLavoroId:null, modelloNLId:null, modelloRSId:null });
  const [showRotDetail, setShowRotDetail] = useState(null);
  const [showApplyRotDialog, setShowApplyRotDialog] = useState(null);
  const [showDeleteRotEvtDialog, setShowDeleteRotEvtDialog] = useState(null);
  const [showImportaFotoDialog, setShowImportaFotoDialog] = useState(false);
  const [showModelloPicker, setShowModelloPicker] = useState(false);
  const [quickModeModello, setQuickModeModello] = useState(null);
  const [showRotazionePicker, setShowRotazionePicker] = useState(false);
  const dragSrcId = useRef(null);
  const dragTargetId = useRef(null); // target reale del drag col mouse, calcolato con elementFromPoint (non l'id della card che riceve l'evento onDrop, inaffidabile su liste lunghe)
  const touchSrcId = useRef(null);
  const touchTargetId = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const [prevGrid, setPrevGrid] = useState(null);

  // ── Drag & drop modelli: scroll container + autoscroll a velocità variabile + preview ordine live
  const modelliScrollRef = useRef(null);
  const autoScrollRAF = useRef(null);
  const autoScrollSpeed = useRef(0);
  const [dragOverId, setDragOverId] = useState(null); // id della card su cui si sta trascinando ora (per preview)
  const [draggingId, setDraggingId] = useState(null); // id della card attualmente trascinata
  // Su telefono, touchstart/touchmove sulla card altrimenti intercettano SEMPRE
  // il dito per il drag, impedendo lo scroll verticale normale della lista.
  // Questo toggle esplicito distingue i due gesti: OFF (default) = il dito
  // scorre la pagina come sempre; ON = il tocco sulle card trascina per riordinare.
  const [modalitaSpostamento, setModalitaSpostamento] = useState(false);

  const [reportInterval, setReportInterval] = useState("mese");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [openReportConfig, setOpenReportConfig] = useState(null);
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  const [indennita, setIndennita] = useState({ diurno:"", notturno:"", festivo:"", notturno_festivo:"" });
  const [conteggioConfigs, setConteggioConfigs] = useState({});
  const [showReportModelliPicker, setShowReportModelliPicker] = useState(null); // reportId aperto
  const [editFascia, setEditFascia] = useState(null); // key fascia in editing (nome/orario)
  const [showFasciaColorPicker, setShowFasciaColorPicker] = useState(null); // key fascia per cambio colore rapido

  const userId = session?.user?.id;
  const isInitialized = useRef(false);

  useEffect(()=>{
// #endregion


// #region SEZIONE 7: USEEFFECT INIT + LOAD DA SUPABASE
// ═══════════════════════════════════════════════════════════════
    if(!userId) return;
    (async()=>{
      try {
        // Mostra subito i dati da localStorage (invariato)
        const cached = loadFromLocalStorage();
        if(cached && cached.calendars.length > 0){
          setStore(s=>({...s, calendars:cached.calendars, events:cached.events}));
          setModelli(cached.modelli||[]);
          const calIdValido = cached.calId && cached.calendars.some(c=>c.id===cached.calId);
          setCalId(calIdValido ? cached.calId : (cached.calendars[0]?.id||null));
          setLoading(false);
        }
        const calIdDaCache = (cached?.calId && cached.calendars.some(c=>c.id===cached.calId))
          ? cached.calId
          : (cached?.calendars?.[0]?.id || null);

        // Una sola chiamata al database: la funzione get_user_data (creata su
        // Supabase) legge le 6 tabelle internamente e restituisce tutto insieme.
        const { data: all, error: rpcErr } = await supabase.rpc("get_user_data", { p_user_id: userId });
        if(rpcErr) throw rpcErr;

        const cals = all?.calendars || [];
        const evts = all?.events || [];
        const settings = all?.user_settings || null;
        const modelliDb = all?.modelli || [];
        const coloriDb = all?.colori || [];
        const rotazioniDb = all?.rotazioni || [];

        const calendars = (cals||[]).map(c=>({
          id: c.id, name: c.name, color: c.color, isMain: c.is_main, shifts: c.shifts||[],
        }));
        const events = {};
        (evts||[]).forEach(e=>{
          if(!events[e.date_key]) events[e.date_key]={};
          if(!events[e.date_key][e.calendar_id]) events[e.date_key][e.calendar_id]=[];
          events[e.date_key][e.calendar_id].push({
            id: e.id, label: e.label, color: e.color, allDay: e.all_day,
            tIn: e.time_in||"", tOut: e.time_out||"", place: e.place||"",
            map: e.map_url||"", note: e.note||"",
            modelloId: e.modello_id||null, rotazioneId: e.rotazione_id||null, collega: e.collega||null,
            auto: e.auto||"", parentId: e.parent_id||null,
            protPagFine: e.prot_pag_fine||"", protRecFine: e.prot_rec_fine||"",
          });
        });

        const theme = settings?.theme||"auto";
        const extraHols = settings?.extra_hols||[];
        const sUrl = settings?.sheets_url || "";
        const sSec = settings?.sheets_secret || "";
        const savedReports = settings?.reports || [];
        const savedReportSettings = settings?.report_settings || {};
        const savedIndennita = settings?.indennita || { diurno:"", notturno:"", festivo:"", notturno_festivo:"" };
        const savedConteggioConfigs = settings?.conteggio_configs || {};
        const savedFasce = settings?.fasce_automatiche || FASCE_AUTOMATICHE_DEFAULT;

        const modelliMappati = (modelliDb||[]).map(m=>({
          id:m.id, titolo:m.titolo, label:m.label||"", tempo:m.tempo,
          inizio:m.inizio||"", fine:m.fine||"",
          colore:m.colore, coloreCustom:m.colore_custom||null,
          posizione:m.posizione||"", sortOrder:m.sort_order||0,
          calendarId:m.calendar_id||null,
          categoria:(m.categoria==="primo"||m.categoria==="secondo")?m.categoria:"",
          categoriaAppAuto:(m.categoria_app_auto==="app"||m.categoria_app_auto==="auto")?m.categoria_app_auto:((m.categoria==="app"||m.categoria==="auto")?m.categoria:""),
        }));

        const rotazioniMappate = (rotazioniDb||[]).map(r=>({
          id:r.id, tipo:r.tipo, titolo:r.titolo,
          dataInizio:r.data_inizio||"", nSettimane:r.n_settimane||52,
          modellaLavoroId:r.modello_lavoro_id||null,
          modelloNLId:r.modello_nl_id||null,
          modelloRSId:r.modello_rs_id||null,
          griglia:r.griglia||{},
        }));

        // Applico TUTTO insieme, in un solo giro di render: niente più
        // calendario che appare prima e modelli/colori che arrivano dopo.
        const calendariUguali = cached && sameData(cached.calendars, calendars);
        const eventiUguali = cached && sameData(cached.events, events);
        const modelliUguali = cached && sameData(cached.modelli, modelliMappati);

        if(!(calendariUguali && eventiUguali)){
          setStore(s=>({ ...s, calendars, events, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings, fasceAutomatiche: savedFasce }));
        } else {
          setStore(s=>({ ...s, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings, fasceAutomatiche: savedFasce }));
        }
        if(!modelliUguali){
          setModelli(modelliMappati);
        }
        setColoriExtra((coloriDb||[]).map(c=>c.hex));
        setRotazioni(rotazioniMappate);
        setSheetsUrl(sUrl);
        setSheetsSecret(sSec);
        setIndennita(savedIndennita);
        setConteggioConfigs(savedConteggioConfigs);
        setCalId(prevCalId => {
          if(prevCalId && calendars.some(c=>c.id===prevCalId)) return prevCalId;
          const daCache = calIdDaCache && calendars.some(c=>c.id===calIdDaCache) ? calIdDaCache : null;
          return daCache || calendars[0]?.id || null;
        });
        saveToLocalStorage(events, calendars, modelliMappati, cached?.calId);
        isInitialized.current = true;
        setLoading(false);

        // ── Da qui in giù: sola manutenzione in background. Non serve per
        // mostrare il calendario, quindi non blocca né ridisegna la UI a meno
        // che trovi davvero qualcosa da correggere (casi rari).
        (async()=>{
          try {
            const { data: curStats } = await supabase.from("usage_stats").select("login_count").eq("user_id", userId).maybeSingle();
            const newCount = (curStats?.login_count || 0) + 1;
            await supabase.from("usage_stats").upsert({ user_id: userId, last_active: new Date().toISOString(), login_count: newCount });
          } catch(statErr) { console.warn("Stats error:", statErr); }

          // Sincronizza i colori custom già presenti sui modelli con la tabella "colori"
          try {
            const coloriUsati = [...new Set((modelliDb||[]).map(m=>m.colore_custom).filter(Boolean))];
            const coloriGiaSalvati = new Set((coloriDb||[]).map(c=>c.hex));
            const daSalvare = coloriUsati.filter(hex=>!coloriGiaSalvati.has(hex));
            const nuoviColoriSalvati = [];
            for(const hex of daSalvare){
              const { data:cRes } = await supabase.from("colori").insert({ user_id:userId, hex }).select().maybeSingle();
              if(cRes) nuoviColoriSalvati.push(hex);
            }
            if(nuoviColoriSalvati.length > 0) {
              setColoriExtra(prev => {
                const aggiornato = [...prev];
                nuoviColoriSalvati.forEach(hex => { if(!aggiornato.includes(hex)) aggiornato.push(hex); });
                return aggiornato;
              });
            }
          } catch(e){ console.warn("Sync colori modelli:", e); }

          // Inizializza sortOrder per modelli H24 che hanno tutti 0
          try {
            // Fix "una tantum": normalizza i sort_order duplicati ALL'INTERNO
            // DI OGNI SINGOLO CALENDARIO. Con più modelli che condividono lo
            // stesso sort_order (es. mai assegnato correttamente in passato,
            // o residuo di versioni precedenti dell'app), l'ordinamento
            // diventa ambiguo: la posizione calcolata di un modello può non
            // corrispondere a quella reale, con l'effetto pratico di frecce
            // che sembrano disabilitate o spostamenti che non hanno effetto
            // visibile. Il fix raggruppa i modelli per calendario e, solo
            // dove trova sort_order ripetuti, li rinumera in modo univoco
            // preservando l'ordine relativo con cui sono arrivati dal DB.
            const perCalendario = new Map();
            for(const m of (modelliDb||[])){
              const cid = m.calendar_id || "null";
              if(!perCalendario.has(cid)) perCalendario.set(cid, []);
              perCalendario.get(cid).push(m);
            }
            const daCorreggere = [];
            for(const [, gruppo] of perCalendario){
              const valori = gruppo.map(m=>m.sort_order||0);
              const haDuplicati = new Set(valori).size !== valori.length;
              if(haDuplicati){
                const ordinatoPerArrivo = [...gruppo].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
                ordinatoPerArrivo.forEach((m,i)=>{
                  const nuovoVal = i*10;
                  if(nuovoVal!==(m.sort_order||0)) daCorreggere.push({id:m.id, nuovoVal});
                });
              }
            }
            if(daCorreggere.length>0){
              await Promise.all(daCorreggere.map(({id,nuovoVal}) =>
                supabase.from("modelli").update({sort_order:nuovoVal}).eq("id",id).eq("user_id",userId)
              ));
              const {data:modelliDb2}=await supabase.from("modelli").select("*").eq("user_id",userId).order("sort_order");
              setModelli((modelliDb2||[]).map(m=>({
                id:m.id,titolo:m.titolo,label:m.label||"",tempo:m.tempo,
                inizio:m.inizio||"",fine:m.fine||"",
                colore:m.colore,coloreCustom:m.colore_custom||null,
                posizione:m.posizione||"",sortOrder:m.sort_order||0,
              })));
            }
          } catch(e){ console.warn("Fix sortOrder h24:", e); }
        })();
      } catch(e){ console.log("Errore startup:", e); setLoading(false); }
    })();
  },[userId]);
// #endregion


// #region SEZIONE 8: USEEFFECT OVERSCROLL + ONLINE/OFFLINE
// ═══════════════════════════════════════════════════════════════
  useEffect(()=>{
    function goOnline(){ setIsOnline(true); }
    function goOffline(){ setIsOnline(false); }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return ()=>{ window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  },[]);
// #endregion


// #region SEZIONE 9: THEME & COLORS
// ═══════════════════════════════════════════════════════════════
  const sysDark = window.matchMedia?.("(prefers-color-scheme:dark)").matches??false;
  const dark = store.theme==="auto"?sysDark:store.theme==="dark";
  const T = {
    bg:      dark?"#090e1a":"#f1f5f9",
    surface: dark?"#0f172a":"#ffffff",
    s2:      dark?"#1e293b":"#f1f5f9",
    border:  dark?"#334155":"#e2e8f0",
    text:    dark?"#f1f5f9":"#0f172a",
    sub:     dark?"#64748b":"#94a3b8",
    gap:     dark?"#1e293b":"#e2e8f0",
  };

  const activeCal = store.calendars.find(c=>c.id===calId)||null;
  const mainCal   = store.calendars.find(c=>c.isMain)||null;
  const mainCalId = mainCal?.id||null; // calendario principale: usato come fallback per i modelli/rotazioni senza calendarId esplicito
  const accent    = activeCal?.color||"#3b82f6";
  const hols      = italianHols(year);
  const fasceAutomatiche = store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT;
  const colByTime = (tIn)=>getColorByTime(tIn, fasceAutomatiche);
  const colLabel  = (tIn)=>getColorLabel(tIn, fasceAutomatiche);

  function isRed(d,m){
    return hols.some(h=>h.m===m&&h.d===d) ||
      (store.extraHols||[]).some(h=>+h.m-1===m&&+h.d===d);
  }
  function getEvts(key,cid){ return store.events?.[key]?.[cid]||[]; }
  function allEvts(key){
    const res=[];
    const soloCal = selectedCalIds.length>0 ? selectedCalIds : null; // visibilità eventi: sempre tutti i calendari selezionati, editMode o no
    if(mainCal && (!soloCal||soloCal.includes(mainCal.id))) getEvts(key,mainCal.id).forEach(e=>res.push({...e,_cid:mainCal.id}));
    store.calendars.filter(c=>!c.isMain && (!soloCal||soloCal.includes(c.id))).forEach(c=>
      getEvts(key,c.id).forEach(e=>res.push({...e,_cid:c.id})));
    return res.sort((a,b)=>{
      if(a.allDay && b.allDay) return 0;
      if(a.allDay) return -1; if(b.allDay) return 1;
      const ta=a.tIn||"", tb=b.tIn||"";
      if(ta===tb) return 0; if(!ta) return 1; if(!tb) return -1;
      return ta.localeCompare(tb);
    });
  }
  function dots(key){ return store.calendars.filter(c=>getEvts(key,c.id).length>0); }

  async function saveSettings(updates={}){
    if(!userId) return;
    await supabase.from("user_settings").upsert({
      user_id: userId,
      theme: store.theme,
      extra_hols: store.extraHols,
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }
// #endregion


// #region SEZIONE 10: CRUD CALENDARI
// ═══════════════════════════════════════════════════════════════
  async function addCalendar(name, color, isFirst){
    if(!userId) return null;
    const { data, error } = await supabase.from("calendars").insert({
      user_id: userId, name, color, is_main: isFirst, shifts: [],
    }).select().maybeSingle();
    if(error){ segnalaErroreDb(error, "Creazione calendario"); return null; }
    return data;
  }
  async function updateCalendar(cId, fields){
    if(!userId) return;
    const { error } = await supabase.from("calendars").update(fields).eq("id", cId).eq("user_id", userId);
    if(error) segnalaErroreDb(error, "Aggiornamento calendario");
  }
  async function deleteCalendar(cId){
    if(!userId) return;
    const { error } = await supabase.from("calendars").delete().eq("id", cId).eq("user_id", userId);
    if(error){ segnalaErroreDb(error, "Eliminazione calendario"); return; }
    const newCals = store.calendars.filter(c=>c.id!==cId);
    saveToLocalStorage(store.events, newCals, modelli);
    await syncSeAttivo(store.events, newCals);
  }
// #endregion


// #region SEZIONE 11: CRUD EVENTI
// ═══════════════════════════════════════════════════════════════
  async function saveEvt(){
    if(!form||!dayKey||!calId||!userId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;
    let color = form.colorOvr || cal.color;
    let label = (form.label||"Evento").toUpperCase();
    let tInFinal = form.dur==="allday"?"":form.tIn||"";
    let tOutFinal = form.dur==="allday"?"":form.tOut||"";
    if(form.modelloId){
      const mod = modelli.find(m=>m.id===form.modelloId);
      if(mod){
        color = form.colorOvr||(mod.coloreCustom||colByTime(mod.inizio));
        label = (mod.label||mod.titolo||label).toUpperCase();
        if(mod.tempo==="h24"){ tInFinal=""; tOutFinal=""; }
        else if(mod.tempo==="6h15"){
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||calcFine6h15(tInFinal)||"";
        } else {
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||mod.fine||"";
        }
      }
    } else if(form.shiftId){
      const sh = cal.shifts?.find(s=>s.id===form.shiftId);
      if(sh){ color=form.colorOvr||sh.color; label=sh.label.toUpperCase(); }
    }
    if(form.dur==="fixed" && tInFinal && !form.modelloId){
      tOutFinal = form.tOut||calcFine6h15(tInFinal);
    }
    let extraNote = form.note||"";
    if(form.modelloId && tInFinal && tOutFinal){
      const mod=modelli.find(m=>m.id===form.modelloId);
      if(mod&&mod.fine&&mod.inizio){
        const durPrevista=calcMinuti(mod.inizio,mod.fine);
        const durEffettiva=calcMinuti(tInFinal,tOutFinal);
        const diff=durEffettiva-durPrevista;
        if(diff>0) extraNote=(extraNote?extraNote+" | ":"")+`Protrazione: +${Math.floor(diff/60)}h${diff%60>0?diff%60+"m":""}`;
        if(diff<0) extraNote=(extraNote?extraNote+" | ":"")+`Anticipo: ${Math.floor(Math.abs(diff)/60)}h${Math.abs(diff)%60>0?Math.abs(diff)%60+"m":""}`;
      }
    }

    const { data, error } = await supabase.from("events").insert({
      user_id: userId, calendar_id: calId, date_key: dayKey,
      label, color, all_day: form.dur==="allday"&&!form.modelloId,
      time_in: tInFinal, time_out: tOutFinal,
      place: (form.place||"").toUpperCase(),
      map_url: form.map||"",
      note: (extraNote||"").toUpperCase(),
      modello_id: form.modelloId||null,
      rotazione_id: form.rotazioneId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
      prot_pag_fine: form.protPagFine||null,
      prot_rec_fine: form.protRecFine||null,
    }).select().maybeSingle();
    if(error){ segnalaErroreDb(error, "Salvataggio turno"); return; }
    const evt = {
      id: data.id, color, label, allDay: data.all_day,
      tIn: data.time_in||"", tOut: data.time_out||"",
      place: data.place||"", map: data.map_url||"",
      note: data.note||"", modelloId: data.modello_id||null,
      rotazioneId: data.rotazione_id||null,
      collega: data.collega||null, auto: data.auto||"",
      protPagFine: data.prot_pag_fine||"", protRecFine: data.prot_rec_fine||"",
    };

    setStore(prev=>{
      const ns = withEventoAggiunto(prev, dayKey, calId, evt);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }

  async function updateEvt(){
    if(!form||!dayKey||!calId||!userId||!form.editId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;
    let color = form.colorOvr || cal.color;
    let label = (form.label||"Evento").toUpperCase();
    let tInFinal = form.dur==="allday"?"":form.tIn||"";
    let tOutFinal = form.dur==="allday"?"":form.tOut||"";
    if(form.modelloId){
      const mod = modelli.find(m=>m.id===form.modelloId);
      if(mod){
        color = form.colorOvr||(mod.coloreCustom||colByTime(mod.inizio));
        label = (mod.label||mod.titolo||label).toUpperCase();
        if(mod.tempo==="h24"){ tInFinal=""; tOutFinal=""; }
        else if(mod.tempo==="6h15"){
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||calcFine6h15(tInFinal)||"";
        } else {
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||mod.fine||"";
        }
      }
    } else if(form.dur==="fixed" && tInFinal && !form.modelloId){
      tOutFinal = form.tOut||calcFine6h15(tInFinal);
    }
    const { error } = await supabase.from("events").update({
      label, color, all_day: form.dur==="allday",
      time_in: tInFinal, time_out: tOutFinal,
      place: (form.place||"").toUpperCase(),
      map_url: form.map||"",
      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
      prot_pag_fine: form.protPagFine||null,
      prot_rec_fine: form.protRecFine||null,
    }).eq("id", form.editId).eq("user_id", userId);
    if(error){ segnalaErroreDb(error, "Modifica turno"); return; }

    setStore(prev=>{
      const patch = {label, color,
        allDay: form.dur==="allday", tIn: tInFinal, tOut: tOutFinal,
        place: (form.place||"").toUpperCase(), map: form.map||"",
        note: (form.note||"").toUpperCase(), modelloId: form.modelloId||null,
        collega: (form.collega||"").toUpperCase(), auto: (form.auto||"").toUpperCase(),
        protPagFine: form.protPagFine||"", protRecFine: form.protRecFine||"",
      };
      const ns = withEventoAggiornato(prev, dayKey, calId, form.editId, patch);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }

  async function delEvt(dKey, cId, evtId){
    await supabase.from("events").delete().eq("id", evtId).eq("user_id", userId);
    setStore(prev=>{
      const ns = withEventoRimosso(prev, dKey, cId, evtId);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  async function delEvtiRotazioneDaData(rotazioneId, fromDateKey, cId, limit=null){
    let query = supabase.from("events").select("id,date_key")
      .eq("rotazione_id", rotazioneId).eq("user_id", userId)
      .gte("date_key", fromDateKey).order("date_key",{ascending:true});
    const { data: rows, error } = await query;
    if(error || !rows) return;
    const toDelete = limit ? rows.slice(0, limit) : rows;
    const ids = toDelete.map(r=>r.id);
    if(ids.length===0) return;
    await supabase.from("events").delete().in("id", ids).eq("user_id", userId);
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      const idSet = new Set(ids);
      for(const dKey of Object.keys(ns.events||{})){
        if(ns.events[dKey]?.[cId]){
          ns.events[dKey][cId] = ns.events[dKey][cId].filter(e=>!idSet.has(e.id));
        }
      }
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  async function delTutteEvtiRotazione(rotazioneId, cId){
    const { data: rows, error } = await supabase.from("events").select("id")
      .eq("rotazione_id", rotazioneId).eq("user_id", userId);
    if(error || !rows) return;
    const ids = rows.map(r=>r.id);
    if(ids.length===0) return;
    await supabase.from("events").delete().in("id", ids).eq("user_id", userId);
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      const idSet = new Set(ids);
      for(const dKey of Object.keys(ns.events||{})){
        if(ns.events[dKey]?.[cId]){
          ns.events[dKey][cId] = ns.events[dKey][cId].filter(e=>!idSet.has(e.id));
        }
      }
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  async function cancellaTuttiEventiMese(y, m, cId){
    // Cancella tutti gli eventi del mese (y=anno, m=mese 0-based) sul calendario cId
    const mm = String(m+1).padStart(2,"0");
    const ultimoGiorno = new Date(y, m+1, 0).getDate();
    const fromKey = `${y}-${mm}-01`;
    const toKey = `${y}-${mm}-${String(ultimoGiorno).padStart(2,"0")}`;
    const { data: rows, error } = await supabase.from("events").select("id")
      .eq("user_id", userId).eq("calendar_id", cId)
      .gte("date_key", fromKey).lte("date_key", toKey);
    if(error || !rows) return;
    const ids = rows.map(r=>r.id);
    if(ids.length===0) return;
    await supabase.from("events").delete().in("id", ids).eq("user_id", userId);
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      for(const dKey of Object.keys(ns.events||{})){
        if(dKey>=fromKey && dKey<=toKey && ns.events[dKey]?.[cId]){
          delete ns.events[dKey][cId];
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  function calcMinuti(tIn, tOut){
    const m1=oraInMinuti(tIn), m2=oraInMinuti(tOut);
    if(m1===null||m2===null) return 0;
    let mins=m2-m1;
    if(mins<0) mins+=24*60;
    return mins;
  }
// #endregion


// #region SEZIONE 12: SYNC GOOGLE SHEETS + SUPABASE BACKUP
// ═══════════════════════════════════════════════════════════════
  async function saveToSheets(events, calendars, customUrl=sheetsUrl, customSecret=sheetsSecret, modelliToSave=modelli){
    if(!customUrl) return "⚠️ Sheets non configurato";
    if(!isInitialized.current) return;
    try {
      await fetch("/api/sheets", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ secret: customSecret, action:"save", events, calendars, userId }),
      });
      await fetch("/api/sheets", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ secret: customSecret, action:"save_modelli", modelli: modelliToSave.map(m=>({
          ...m,
          fine: (m.tempo==="6h15"||m.tempo==="6h 15m")&&m.inizio ? calcFine6h15(m.inizio) : m.fine||"",
        }))}),
      });
      return "✅ Esportato su Sheets";
    } catch(e){ return "❌ Errore connessione Sheets"; }
  }

  // Wrapper unico per il sync "automatico" dopo un CRUD: prima erano 15 punti
  // diversi nel file, ciascuno con una condizione leggermente diversa
  // (chi controllava solo syncMode, chi solo sheetsUrl, chi entrambi).
  // Il salvataggio esplicito da pulsante ("Esporta su Sheets") continua a
  // chiamare saveToSheets(...) direttamente, senza passare da qui.
  async function syncSeAttivo(events, calendars, modelliOverride=modelli){
    if(syncMode!=='on' || !sheetsUrl) return;
    return saveToSheets(events, calendars, sheetsUrl, sheetsSecret, modelliOverride);
  }

  async function loadFromSheets(customUrl=sheetsUrl, customSecret=sheetsSecret){
    try {
      const res = await fetch(`/api/sheets?secret=${customSecret}&action=load&userId=${userId}`);
      return await res.json() || null;
    } catch(e){ return null; }
  }

  async function syncFromSheets(cals=store.calendars, evts=store.events, customUrl=sheetsUrl, customSecret=sheetsSecret, isBackground=false){
    if(!customUrl) return "⚠️ Sincronizzazione non configurata";
    if(isBackground) setBgSyncing(true); else setSyncing(true);
    try {
      const data = await loadFromSheets(customUrl, customSecret);
      if(!data||!data.data) return "❌ Nessun dato valido da Sheets";
      await supabase.from("events").delete().eq("user_id", userId);
      const existingNames = cals.map(c=>c.name);
      const newCals = [...cals];
      for(const tabName of (data.tabs||Object.keys(data.data))){
        if(!existingNames.includes(tabName)){
          const dbCal = await addCalendar(tabName, PALETTE[newCals.length%PALETTE.length], newCals.length===0);
          if(dbCal) newCals.push({id:dbCal.id,name:dbCal.name,color:dbCal.color,isMain:dbCal.is_main,shifts:[]});
        }
      }
      const newEvents={};
      const rowsToInsert = [];
      for(const cal of newCals){
        const calData=data.data[cal.name]||{};
        for(const [dateKey,sheetEvts] of Object.entries(calData)){
          for(const e of sheetEvts){
            rowsToInsert.push({
              user_id:userId, calendar_id:cal.id, date_key:dateKey,
              label:e.label||"Evento", color:e.color||cal.color,
              all_day:e.allDay??true, time_in:e.tIn||"", time_out:e.tOut||"",
              place:e.place||"", map_url:e.map||"", note:e.note||"",
              modello_id:e.modelloId||null, collega:e.collega||"", auto:e.auto||"",
            });
          }
        }
      }

      if(rowsToInsert.length > 0) {
        const { data: insertedEvts, error: insertErr } = await supabase.from("events").insert(rowsToInsert).select();
        if(!insertErr && insertedEvts) {
          insertedEvts.forEach(dbEvt => {
            const dK = dbEvt.date_key;
            const cI = dbEvt.calendar_id;
            if(!newEvents[dK]) newEvents[dK]={};
            if(!newEvents[dK][cI]) newEvents[dK][cI]=[];
            newEvents[dK][cI].push({
              id:dbEvt.id, color:dbEvt.color, label:dbEvt.label,
              allDay:dbEvt.all_day, tIn:dbEvt.time_in||"", tOut:dbEvt.time_out||"",
              place:dbEvt.place||"", map:dbEvt.map_url||"", note:dbEvt.note||"",
              modelloId:dbEvt.modello_id||null, collega:dbEvt.collega||"", auto:dbEvt.auto||"",
            });
          });
        }
      }
      setStore(s=>({...s, calendars:newCals, events:newEvents}));
      if(newCals.length>0&&!calId) setCalId(newCals[0].id);
      try {
        const resMod = await fetch(`${customUrl}?secret=${customSecret}&action=load_modelli`);
        const dataMod = await resMod.json();
        if(dataMod.modelli&&dataMod.modelli.length>0){
          await supabase.from("modelli").delete().eq("user_id",userId);
          const newModelli=[];
          for(const m of dataMod.modelli){
            const coloreEff=m.tempo==="h24"?"#64748b":colByTime(m.inizio);
            const {data:res2}=await supabase.from("modelli").insert({
              user_id:userId, titolo:m.titolo.toUpperCase(), tempo:m.tempo,
              inizio:m.inizio||null, fine:m.fine||null,
              colore:coloreEff, sort_order:newModelli.length,
            }).select().maybeSingle();
            if(res2) newModelli.push({id:res2.id,titolo:res2.titolo,tempo:res2.tempo,
              inizio:res2.inizio||"",fine:res2.fine||"",colore:coloreEff,
              coloreCustom:null,posizione:"",sortOrder:res2.sort_order||0});
          }
          setModelli(newModelli);
        }
      } catch(e){ console.error("Errore import modelli:",e); }
      return "✅ Importazione completata";
    } catch(e){
      console.error(e);
      return "❌ Errore sincronizzazione Sheets";
    } finally {
      if(isBackground) setBgSyncing(false); else setSyncing(false);
    }
  }

  async function handleSave(){
    setSyncing(true); setSyncMsg("");
    const msg = await saveToSheets(store.events, store.calendars);
    setSyncMsg(msg); setSyncing(false);
  }
  async function handleLoad(){
    setSyncMsg("");
    const msg = await syncFromSheets(store.calendars, store.events, sheetsUrl, sheetsSecret, false);
    setSyncMsg(msg);
  }
  async function handleSaveSheetsConfig(){
    if(!userId) return;
    setSyncing(true); setSyncMsg("");
    try {
      const {error} = await supabase.from("user_settings").upsert({
        user_id:userId, sheets_url:sheetsUrl.trim(), sheets_secret:sheetsSecret.trim(),
        updated_at:new Date().toISOString(),
      });
      if(error) throw error;
      setSyncMsg("✅ Impostazioni Google Sheets salvate");
    } catch(err){ setSyncMsg("❌ Errore salvataggio: "+err.message); }
    finally { setSyncing(false); }
  }

  useEffect(()=>{
    if(screen==="settings" && session?.user?.email==='tesonemgs5@gmail.com'){
      (async()=>{
        try {
          const {data,error}=await supabase.rpc('get_app_stats');
          if(!error&&data&&data.length>0) setStats(data[0]);
        } catch(e){ console.error(e); }
      })();
    }
  },[screen, session]);

  async function handleViewDbData(){
    setShowDbModal(true); setDbRawData(null);
    try {
      const {data:cals}=await supabase.from("calendars").select("*").eq("user_id",userId).order("created_at");
      const {data:evts}=await supabase.from("events").select("*").eq("user_id",userId).order("date_key",{ascending:false});
      setDbCalsCount(cals?.length||0);
      setDbEvtsCount(evts?.length||0);
      setDbRawData({calendars:cals||[],events:evts||[]});
    } catch(e){ console.error(e); }
  }

  async function buildBackupPayload(){
    const {data:cals} = await supabase.from("calendars").select("*").eq("user_id",userId);
    const {data:evts} = await supabase.from("events").select("*").eq("user_id",userId);
    const {data:mods} = await supabase.from("modelli").select("*").eq("user_id",userId);
    const {data:rots} = await supabase.from("rotazioni").select("*").eq("user_id",userId);
    const {data:sett} = await supabase.from("user_settings").select("*").eq("user_id",userId).maybeSingle();
    return {
      exported_at: new Date().toISOString(),
      calendars: cals||[], events: evts||[], modelli: mods||[],
      rotazioni: rots||[], user_settings: sett||null,
    };
  }

  async function handleExportSupabase(){
    setSyncMsg("⏳ Esportazione in corso...");
    try {
      const backup = await buildBackupPayload();
      const {error:insErr} = await supabase.from("backups").insert({
        user_id:userId, data:backup,
      });
      if(insErr) throw insErr;
      setSyncMsg("✅ Backup salvato su Supabase");
    } catch(e){ console.error(e); setSyncMsg("❌ Errore durante l'esportazione: "+e.message); }
  }

  async function handleOpenImportSupabase(){
    setSyncMsg("⏳ Carico elenco backup...");
    try {
      const {data, error} = await supabase.from("backups")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", {ascending:false})
        .limit(20);
      if(error) throw error;
      setBackupsList(data||[]);
      setShowBackupsModal(true);
      setSyncMsg("");
    } catch(e){ console.error(e); setSyncMsg("❌ Errore nel caricare i backup: "+e.message); }
  }

  async function handleRestoreBackup(backupId){
    if(!window.confirm("Questo SOVRASCRIVERÀ tutti i dati attuali con quelli del backup selezionato. Continuare?")) return;
    setSyncMsg("⏳ Importazione in corso...");
    setShowBackupsModal(false);
    try {
      const {data:row, error} = await supabase.from("backups").select("data").eq("id", backupId).eq("user_id", userId).maybeSingle();
      if(error) throw error;
      if(!row?.data) throw new Error("Backup non trovato");
      const backup = row.data;

      await supabase.from("events").delete().eq("user_id",userId);
      await supabase.from("calendars").delete().eq("user_id",userId);
      await supabase.from("modelli").delete().eq("user_id",userId);
      await supabase.from("rotazioni").delete().eq("user_id",userId);

      const calIdMap = {};
      for(const c of (backup.calendars||[])){
        const {data} = await supabase.from("calendars").insert({
          user_id:userId, name:c.name, color:c.color, is_main:c.is_main, shifts:c.shifts||[],
        }).select().maybeSingle();
        if(data) calIdMap[c.id] = data.id;
      }
      const modIdMap = {};
      for(const m of (backup.modelli||[])){
        const {data} = await supabase.from("modelli").insert({
          user_id:userId, titolo:m.titolo, tempo:m.tempo, inizio:m.inizio, fine:m.fine,
          colore:m.colore, colore_custom:m.colore_custom, posizione:m.posizione||"", // flag "manuale"/vuoto, non un id: nessun rimapping necessario
          sort_order:m.sort_order, calendar_id: calIdMap[m.calendar_id]||null,
        }).select().maybeSingle();
        if(data) modIdMap[m.id] = data.id;
      }
      for(const e of (backup.events||[])){
        await supabase.from("events").insert({
          user_id:userId, calendar_id: calIdMap[e.calendar_id]||e.calendar_id,
          date_key:e.date_key, label:e.label, color:e.color, all_day:e.all_day,
          time_in:e.time_in, time_out:e.time_out, place:e.place, map_url:e.map_url,
          note:e.note, modello_id: modIdMap[e.modello_id]||null,
          collega:e.collega, auto:e.auto,
        });
      }
      for(const r of (backup.rotazioni||[])){
        await supabase.from("rotazioni").insert({
          user_id:userId, tipo:r.tipo, titolo:r.titolo, data_inizio:r.data_inizio,
          n_settimane:r.n_settimane,
          modello_lavoro_id: modIdMap[r.modello_lavoro_id]||null,
          modello_nl_id: modIdMap[r.modello_nl_id]||null,
          modello_rs_id: modIdMap[r.modello_rs_id]||null,
          griglia:r.griglia||{},
        });
      }
      setSyncMsg("✅ Importazione completata — ricarico l'app...");
      setTimeout(()=>window.location.reload(), 1500);
    } catch(e){ console.error(e); setSyncMsg("❌ Errore durante l'importazione: "+e.message); }
  }

  async function handleLogout(){ await supabase.auth.signOut(); }

  // ─── Manutenzione: standardizza tempo/inizio/fine di tutti i modelli ───
  // Riscrive su Supabase, per ogni modello con formato "sporco", i campi:
  //   - tempo: "6h15" quando la durata è 6h15/6h30 (qualunque fosse la scrittura originale)
  //   - inizio: sempre in "HH:MM" pulito (es. "6.15" -> "06:15")
  //   - fine: ricalcolata da inizio via calcFine6h15 per i modelli 6h15/6h30,
  //           altrimenti solo normalizzata in "HH:MM" per i modelli personalizzati
  // Va lanciata una tantum (es. da console: window.normalizzaModelliTempo())
  // dopo aver verificato in anteprima l'elenco che stampa.
  async function normalizzaModelliTempo({dryRun=true}={}){
    if(!userId){ console.warn("normalizzaModelliTempo: utente non loggato"); return; }
    function calcolaTarget(m){
      if(m.tempo==="h24") return null; // H24 non ha inizio/fine, niente da normalizzare
      const inizioNorm=normalizzaOraHHMM(m.inizio);
      const mins=minutiTurnoModello(m);
      const isDefault = mins===375 || mins===390;
      const target = isDefault
        ? { tempo:"6h15", inizio:inizioNorm, fine: inizioNorm?calcFine6h15(inizioNorm):(m.fine||"") }
        : { tempo:"personalizzato", inizio:inizioNorm, fine: normalizzaOraHHMM(m.fine) };
      const cambiato = target.tempo!==m.tempo || target.inizio!==(m.inizio||"") || target.fine!==(m.fine||"");
      return cambiato ? target : null;
    }
    const daSistemare = (modelli||[])
      .map(m=>({ m, target: calcolaTarget(m) }))
      .filter(x=>x.target!==null);
    if(daSistemare.length===0){ console.log("✅ Nessun modello da normalizzare, sono già tutti in formato standard."); return; }
    console.table(daSistemare.map(({m,target})=>({
      id:m.id, titolo:m.titolo,
      tempo_attuale:m.tempo, tempo_nuovo:target.tempo,
      inizio_attuale:m.inizio, inizio_nuovo:target.inizio,
      fine_attuale:m.fine, fine_nuovo:target.fine,
    })));
    if(dryRun){
      console.log(`ℹ️ Anteprima: ${daSistemare.length} modelli verrebbero normalizzati. Richiama con {dryRun:false} per applicare davvero su Supabase.`);
      return daSistemare;
    }
    let ok=0, ko=0;
    for(const {m,target} of daSistemare){
      if((target.tempo==="6h15") && !target.inizio){
        console.warn(`⚠️ Modello "${m.titolo}" (${m.id}) ha durata 6h15/6h30 ma nessun orario di inizio leggibile: sistemalo a mano.`);
        ko++; continue;
      }
      const { error } = await supabase.from("modelli")
        .update({ tempo:target.tempo, inizio:target.inizio, fine:target.fine })
        .eq("id", m.id).eq("user_id", userId);
      if(error){ console.error(`❌ Errore su "${m.titolo}" (${m.id}):`, error); ko++; }
      else ok++;
    }
    console.log(`✅ Normalizzati ${ok} modelli su Supabase${ko>0?`, ${ko} da controllare a mano`:""}. Ricarica la pagina per vedere i dati aggiornati.`);
    setModelli(prev=>prev.map(m=>{
      const hit=daSistemare.find(d=>d.m.id===m.id);
      return hit ? {...m, ...hit.target} : m;
    }));
  }
  // Non più esposta su window: era uno script di migrazione una tantum,
  // già eseguito. La funzione resta definita sopra se dovesse servire ancora
  // (richiamabile riattivando temporaneamente l'useEffect qui sotto),
  // ma non è più raggiungibile dalla console di chiunque apra l'app pubblica.
  // useEffect(()=>{
  //   if(typeof window!=="undefined") window.normalizzaModelliTempo = normalizzaModelliTempo;
  // }, [modelli, userId]);

  // ─── Manutenzione: sistema eventi storici con orario di uscita mancante ───
  // Prima del fix, un evento con modello 6h15/6h30 (o INGRESSO digitato a mano)
  // poteva salvare time_out vuoto pur mostrandolo calcolato in UI.
  // Per ogni evento con time_in valorizzato e time_out vuoto:
  //   - se ha un modello collegato con tempo "6h15" -> fine = calcFine6h15(time_in)
  //   - se ha un modello collegato "personalizzato" con fine propria -> fine = mod.fine
  //   - altrimenti (nessun modello o non determinabile) -> calcFine6h15(time_in) come fallback standard
  // Va lanciata una tantum da console: window.normalizzaEventiTempo({dryRun:false})
  async function normalizzaEventiTempo({dryRun=true}={}){
    if(!userId){ console.warn("normalizzaEventiTempo: utente non loggato"); return; }
    const { data: evts, error: fetchErr } = await supabase.from("events")
      .select("id,date_key,time_in,time_out,modello_id,label").eq("user_id", userId);
    if(fetchErr){ console.error("normalizzaEventiTempo: errore lettura eventi", fetchErr); return; }
    const daSistemare = (evts||[])
      .filter(e=>e.time_in && !e.time_out)
      .map(e=>{
        const mod = modelli.find(m=>m.id===e.modello_id);
        let fineCalcolata = "";
        if(mod && mod.tempo==="6h15") fineCalcolata = calcFine6h15(e.time_in);
        else if(mod && mod.fine) fineCalcolata = normalizzaOraHHMM(mod.fine);
        else fineCalcolata = calcFine6h15(e.time_in); // fallback standard 6h15
        return { e, fineCalcolata };
      })
      .filter(x=>x.fineCalcolata);
    if(daSistemare.length===0){ console.log("✅ Nessun evento da normalizzare, time_out già ok per tutti."); return; }
    console.table(daSistemare.map(({e,fineCalcolata})=>({
      id:e.id, data:e.date_key, label:e.label,
      time_in:e.time_in, time_out_attuale:e.time_out||"(vuoto)", time_out_nuovo:fineCalcolata,
    })));
    if(dryRun){
      console.log(`ℹ️ Anteprima: ${daSistemare.length} eventi verrebbero sistemati. Richiama con {dryRun:false} per applicare davvero su Supabase.`);
      return daSistemare;
    }
    let ok=0, ko=0;
    for(const {e,fineCalcolata} of daSistemare){
      const { error } = await supabase.from("events")
        .update({ time_out: fineCalcolata }).eq("id", e.id).eq("user_id", userId);
      if(error){ console.error(`❌ Errore su evento ${e.id} (${e.date_key}):`, error); ko++; }
      else ok++;
    }
    console.log(`✅ Sistemati ${ok} eventi su Supabase${ko>0?`, ${ko} da controllare a mano`:""}. Ricarica la pagina per vedere i dati aggiornati.`);
  }
  // Stesso discorso: script di migrazione una tantum, non più esposto su window.
  // useEffect(()=>{
  //   if(typeof window!=="undefined") window.normalizzaEventiTempo = normalizzaEventiTempo;
  // }, [modelli, userId]);
// #endregion


// #region SEZIONE 13: CRUD MODELLI + COLORI (con fix sync colore custom)
// ═══════════════════════════════════════════════════════════════
// Memoizzato: prima veniva ricalcolato (sort completo) ad ogni singolo
// render dell'app, anche quando i modelli non erano cambiati.
// Flag salvato nel campo "posizione" (riusato come semplice stringa, niente
// nuove colonne Supabase): "manuale" se il modello è stato spostato almeno
// una volta dall'utente (freccia o drag), stringa vuota se è ancora nella
// lista automatica per orario. Sostituisce il vecchio sistema di riferimenti
// a catena (un modello agganciato "sopra" un altro id), che era la causa
// architetturale dell'instabilità: un riferimento relativo può creare cicli,
// asimmetrie tra "su" e "giù", casi limite in testa/coda alla lista. Con un
// flag + una posizione numerica scoped per calendario, ogni operazione è un
// semplice shift di interi, sempre reversibile, senza casi speciali nascosti.
const FLAG_MANUALE = "manuale";

// ── Calcola l'ordine dei modelli PER UN DATO SOTTOINSIEME (già filtrato per
// calendario dal chiamante — mai calcolato sull'insieme completo di più
// calendari insieme, altrimenti un modello potrebbe confrontarsi con
// "vicini" che nella vista reale non esistono).
//
// Architettura a 3 fasi, come da richiesta esplicita:
// 1) Lista AUTOMATICA per orario: tutti i modelli con flag!==FLAG_MANUALE,
//    ordinati per orario di inizio (h24/senza orario sempre in cima).
// 2) Lista MANUALE/libera: tutti i modelli con flag===FLAG_MANUALE, ordinati
//    semplicemente per sort_order crescente — un numero intero, niente
//    riferimenti relativi tra modelli.
// 3) Le due liste si "intrecciano" leggendo sort_order come UNA POSIZIONE
//    ASSOLUTA CONDIVISA: ogni modello (automatico o manuale) occupa lo slot
//    sort_order nell'elenco finale. Un nuovo modello automatico si inserisce
//    calcolando il suo sort_order in base all'orario rispetto agli altri
//    automatici, e chi viene dopo (automatico O manuale) scala di uno.
function calcolaOrdineModelli(sottoinsieme){
  // sort_order è semplicemente la posizione finale: ordino tutto insieme,
  // un solo criterio, nessuna eccezione — la stabilità viene proprio dal
  // non avere più casi speciali da conciliare tra loro.
  return [...sottoinsieme].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
}

// Elenco completo (tutti i calendari insieme), usato dove serve una vista
// globale — es. il ripristino da backup, o quando calId===null ("tutti").
const modelliOrdinati = useMemo(()=>calcolaOrdineModelli(modelli), [modelli]);


  function getFasciaModello(m){
    if(m.tempo==="h24") return "libero";
    if(!m.inizio) return "libero";
    const mins=oraInMinuti(m.inizio);
    if(mins===null) return "libero";
    const h=Math.floor(mins/60), mi=mins%60;
    if(h>=6&&h<12) return "mattina";
    if(h>=12&&h<16||(h===16&&mi<30)) return "pomeriggio";
    if(h>=16&&h<23) return "terzo";
    return "notte";
  }

  // Pinna un modello: lo aggancia "sopra" il modello che si trova alla
  // posizione newIdx nell'elenco visivo corrente (già senza il modello
  // stesso). Se newIdx è oltre la fine della lista (va portato in fondo),
  // lo spinna senza riferimento (torna automatico, va in fondo per orario
  // di default 99999 se non ha inizio, altrimenti resta comunque ultimo tra
  // i pari-orario) — nel nostro caso pratico c'è sempre un vicino di sotto
  // perché non permettiamo di superare i confini della lista.
  // ── pinnaSoprapPuro: funzione PURA (nessuna lettura di state esterno, nessun
  // side-effect) che calcola il nuovo elenco modelli dato lo stato attuale
  // (prev). Prima questa logica leggeva "modelli" (lo state catturato al
  // momento della creazione della funzione) invece di "prev": con click
  // ravvicinati sulle frecce, la seconda chiamata poteva ancora vedere lo
  // stato PRIMA del primo spostamento, calcolando sortOrder e controllo
  // anti-ciclo su dati superati — causa architetturale dei blocchi e salti
  // imprevedibili. Ora tutto il calcolo avviene sullo stato più recente,
  // dentro un'unica operazione atomica di setModelli.
  // ── Sottoinsieme dei modelli appartenenti a un dato calendario (o tutti,
  // se calIdFiltro è null). Sempre calcolato da "prev" (lo stato più
  // recente), mai da uno snapshot esterno del render, per evitare le
  // desincronizzazioni con click ravvicinati viste nell'architettura precedente.
  function modelliDelCalendario(prev, calIdFiltro){
    if(calIdFiltro==null) return prev;
    return prev.filter(m=>(m.calendarId||mainCalId)===calIdFiltro);
  }

  // ── Sposta un modello di UNA posizione (freccia ▲▼) all'interno del suo
  // calendario. Operazione: scambio diretto del sort_order con il vicino
  // immediato nella direzione scelta — un semplice swap fra due interi,
  // sempre reversibile e senza casi limite nascosti (a differenza del vecchio
  // sistema a riferimenti relativi, che poteva creare cicli e asimmetrie tra
  // "su" e "giù"). Il modello spostato viene marcato FLAG_MANUALE: da questo
  // momento appartiene alla lista libera e non torna più a riordinarsi da
  // solo per orario.
  function spostaModelloPuro(prev, id, dir, calIdFiltro){
    const sottoinsieme = calcolaOrdineModelli(modelliDelCalendario(prev, calIdFiltro));
    const idx = sottoinsieme.findIndex(m=>m.id===id);
    if(idx===-1) return prev;
    const vicinoIdx = dir==="up" ? idx-1 : idx+1;
    if(vicinoIdx<0 || vicinoIdx>=sottoinsieme.length) return prev; // già al limite, nessun movimento
    const modello = sottoinsieme[idx];
    const vicino = sottoinsieme[vicinoIdx];
    const sortModello = modello.sortOrder||0;
    const sortVicino = vicino.sortOrder||0;
    return prev.map(m=>{
      if(m.id===modello.id) return {...m, sortOrder:sortVicino, posizione:FLAG_MANUALE};
      if(m.id===vicino.id) return {...m, sortOrder:sortModello, posizione:FLAG_MANUALE};
      return m;
    });
  }

  // ── Trascina un modello (drag & drop) fino alla posizione esatta di
  // dstId, all'interno dello stesso calendario. Operazione: rimuovo il
  // modello dalla sua posizione, lo reinserisco nell'indice di destinazione,
  // e riassegno sort_order 0,1,2... a tutto il sottoinsieme in ordine —
  // uno shift completo ma su un insieme piccolo (i modelli di un calendario),
  // quindi economico, e soprattutto sempre corretto per costruzione: non
  // c'è modo che questo produca cicli o incoerenze, perché non uso mai
  // riferimenti tra modelli, solo una rinumerazione sequenziale.
  function trascinaModelloPuro(prev, srcId, dstId, calIdFiltro){
    if(!srcId || !dstId || srcId===dstId) return prev;
    const sottoinsiemeIds = new Set(modelliDelCalendario(prev, calIdFiltro).map(m=>m.id));
    if(!sottoinsiemeIds.has(srcId) || !sottoinsiemeIds.has(dstId)) return prev;
    const ordinato = calcolaOrdineModelli(modelliDelCalendario(prev, calIdFiltro));
    const srcIdx = ordinato.findIndex(m=>m.id===srcId);
    const dstIdx = ordinato.findIndex(m=>m.id===dstId);
    if(srcIdx===-1 || dstIdx===-1) return prev;
    const riordinato = [...ordinato];
    const [tolto] = riordinato.splice(srcIdx,1);
    riordinato.splice(dstIdx,0,tolto);
    // Rinumerazione sequenziale: ogni modello del sottoinsieme prende un
    // sort_order 0,10,20... (passo 10 per lasciare margine a inserimenti
    // automatici futuri senza dover rinumerare tutto). Tutti i modelli
    // toccati da un drag esplicito diventano manuali.
    const nuoviValori = new Map(riordinato.map((m,i)=>[m.id, i*10]));
    return prev.map(m=>{
      if(!nuoviValori.has(m.id)) return m;
      return {...m, sortOrder:nuoviValori.get(m.id), posizione:FLAG_MANUALE};
    });
  }

  // Salva su Supabase i modelli effettivamente cambiati (confronto tra stato
  // precedente e nuovo), scoperti passando entrambi gli elenchi.
  async function salvaModifichePosizioni(prevElenco, nuovoElenco){
    const prevById = new Map(prevElenco.map(m=>[m.id,m]));
    const daSalvare = nuovoElenco.filter(m=>{
      const prima = prevById.get(m.id);
      return !prima || prima.sortOrder!==m.sortOrder || prima.posizione!==m.posizione;
    });
    for(const m of daSalvare){
      await supabase.from("modelli").update({sort_order:m.sortOrder, posizione:m.posizione||""}).eq("id",m.id).eq("user_id",userId);
    }
  }

  async function moveH24(id, dir, calIdFiltro){
    // Tutto il calcolo avviene dentro il callback funzionale di setModelli,
    // sempre sullo stato più recente anche con click ravvicinati.
    let prevSnapshot = null, nuovoElenco = null;
    setModelli(prev=>{
      prevSnapshot = prev;
      nuovoElenco = spostaModelloPuro(prev, id, dir, calIdFiltro);
      return nuovoElenco;
    });
    if(prevSnapshot && nuovoElenco) await salvaModifichePosizioni(prevSnapshot, nuovoElenco);
  }

  async function reorderModelli(srcId, dstId, calIdFiltro){
    let prevSnapshot = null, nuovoElenco = null;
    setModelli(prev=>{
      prevSnapshot = prev;
      nuovoElenco = trascinaModelloPuro(prev, srcId, dstId, calIdFiltro);
      return nuovoElenco;
    });
    if(prevSnapshot && nuovoElenco) await salvaModifichePosizioni(prevSnapshot, nuovoElenco);
  }


  // ── FIX: quando un modello riceve un coloreCustom, quel colore viene
  // salvato subito nella tabella "colori" (se non già presente), così
  // compare istantaneamente nella tab Modelli → Colori senza dover
  // ricaricare l'app, e può essere associato ad altri modelli da lì.
  async function ensureColoreRegistrato(hex){
    if(!userId || !hex) return;
    if(coloriExtra.includes(hex)) return;
    try {
      const { data, error } = await supabase.from("colori").insert({ user_id:userId, hex }).select().maybeSingle();
      if(!error && data) setColoriExtra(prev=>prev.includes(hex)?prev:[...prev, hex]);
    } catch(e){ console.warn("ensureColoreRegistrato:", e); }
  }

  // Prova a salvare; se Supabase segnala una colonna mancante nello schema,
  // la rimuove dal payload e riprova, finché va a buon fine o non c'è più nulla da togliere.
  // Così l'app resta funzionante anche se lo schema del DB non è ancora aggiornato.
  async function supabaseUpsertConRetry(query, payloadIniziale, isInsert){
    let payload = {...payloadIniziale};
    for(let tentativi=0; tentativi<10; tentativi++){
      const q = isInsert
        ? supabase.from("modelli").insert(payload).select().maybeSingle()
        : query(payload);
      const { data, error } = await q;
      if(!error) return { data, error:null, payloadUsato:payload };
      const match = /Could not find the '([^']+)' column/.exec(error.message||"");
      if(match && match[1] in payload){
        console.warn(`Colonna '${match[1]}' assente su Supabase: la ometto e riprovo. Esegui l'ALTER TABLE per abilitarla stabilmente.`);
        const { [match[1]]: _omessa, ...resto } = payload;
        payload = resto;
        continue;
      }
      return { data:null, error, payloadUsato:payload };
    }
    return { data:null, error:{message:"Troppi tentativi di retry sullo schema"}, payloadUsato:payload };
  }

  async function saveModello(data){
    if(!userId) return;
    const coloreEff=data.coloreCustom||(data.tempo==="h24"?"#64748b":colByTime(data.inizio));
    const targetCalId = data.calendarId||calId||mainCalId;
    const payload={
      user_id:userId, titolo:(data.titolo||"").toUpperCase(), label:(data.label||"").toUpperCase(), tempo:data.tempo,
      inizio:data.inizio||null, fine:data.fine||null,
      colore:coloreEff, colore_custom:data.coloreCustom||null,
      posizione:data.posizione||null,
      sort_order:data.sortOrder||modelli.length,
      calendar_id: targetCalId,
      categoria: (data.categoria==="primo"||data.categoria==="secondo") ? data.categoria : null,
      categoria_app_auto: (data.categoriaAppAuto==="app"||data.categoriaAppAuto==="auto") ? data.categoriaAppAuto : null,
      categoria_turno_vuoto: !!data.turnoVuoto,
      categoria_app_auto_vuoto: !!data.appAutoVuoto,
    };
    if(data.coloreCustom) await ensureColoreRegistrato(data.coloreCustom);
    if(data.id){
      const { error: errUpdate } = await supabaseUpsertConRetry(
        (p)=>supabase.from("modelli").update(p).eq("id",data.id).eq("user_id",userId),
        payload, false
      );
      if(errUpdate){
        console.error("Errore salvataggio modello (update):", errUpdate);
        return { ok:false, error: errUpdate.message };
      }

      // ── Retroattivo: propaga le modifiche a tutti i turni già in calendario
      const labelNuova = (data.label||data.titolo||"").toUpperCase();
      const tInNuovo = data.tempo==="h24" ? "" : (data.inizio||"");
      const tOutNuovo = data.tempo==="h24" ? "" : (data.tempo==="6h15" ? (calcFine6h15(data.inizio)||"") : (data.fine||""));
      await supabase.from("events").update({
        label: labelNuova, color: coloreEff, time_in: tInNuovo, time_out: tOutNuovo,
      }).eq("modello_id", data.id).eq("user_id", userId);
      setStore(prev=>{
        const ns = JSON.parse(JSON.stringify(prev));
        Object.keys(ns.events||{}).forEach(dk=>{
          Object.keys(ns.events[dk]||{}).forEach(cid=>{
            ns.events[dk][cid] = (ns.events[dk][cid]||[]).map(e=>
              e.modelloId===data.id
                ? {...e, label:labelNuova, color:coloreEff, tIn:tInNuovo, tOut:tOutNuovo}
                : e
            );
          });
        });
        saveToLocalStorage(ns.events, ns.calendars, modelli);
        return ns;
      });

      setModelli(prev=>{
        const updated=prev.map(m=>m.id===data.id?{...m,...data,colore:coloreEff,calendarId:targetCalId}:m);
        syncSeAttivo(store.events, store.calendars, updated);
        return updated;
      });
      return { ok:true };
    } else {
      const {data:res, error:errInsert}=await supabaseUpsertConRetry(null, payload, true);
      if(errInsert){
        console.error("Errore salvataggio modello (insert):", errInsert);
        return { ok:false, error: errInsert.message };
      }
      if(res){
        // ── Inserimento automatico (avviene UNA SOLA VOLTA, alla
        // creazione): dopo questo momento il modello non viene più
        // ricalcolato o spostato da nessun automatismo — solo l'utente lo
        // sposta, con frecce o drag. Regole:
        // 1) h24: sempre in fondo a tutto il calendario, nessun avviso.
        // 2) Esiste già almeno un modello con lo STESSO orario, e sono tutti
        //    raggruppati insieme (adiacenti tra loro nell'elenco attuale):
        //    si inserisce in fondo a quel gruppo, nessun avviso.
        // 3) In ogni altro caso — zero modelli con quell'orario, OPPURE
        //    modelli con quell'orario ma sparsi in punti diversi della
        //    lista — l'app non può decidere da sola dove metterlo: va in
        //    fondo a TUTTO il calendario, e l'utente viene avvisato con un
        //    messaggio che richiede OK per procedere.
        const calendarioModelli = modelli.filter(m=>(m.calendarId||mainCalId)===targetCalId);
        const tutti = calcolaOrdineModelli(calendarioModelli);

        function rinumeraEInserisci(idxInserimento){
          // Rinumera l'intero calendario con passo 10 e restituisce il
          // sort_order assegnato al nuovo modello nello slot scelto.
          for(let i=0;i<tutti.length;i++){
            const nuovoVal = i>=idxInserimento ? (i+1)*10 : i*10;
            if(nuovoVal!==tutti[i].sortOrder){
              supabase.from("modelli").update({sort_order:nuovoVal}).eq("id",tutti[i].id).eq("user_id",userId);
            }
          }
          return idxInserimento*10 + 5;
        }

        let nuovoSortOrder;
        if(data.tempo==="h24"){
          // Regola 1: h24 sempre in fondo a tutto, senza eccezioni.
          nuovoSortOrder = rinumeraEInserisci(tutti.length);
        } else {
          const nuovoOrarioKey = data.inizio||"";
          const indiciStessoOrario = [];
          tutti.forEach((m,i)=>{
            const k = m.tempo==="h24" ? "h24" : (m.inizio||"");
            if(k===nuovoOrarioKey) indiciStessoOrario.push(i);
          });
          // Gruppo "coeso" = esiste almeno un modello con lo stesso orario E
          // tutti quelli trovati sono adiacenti tra loro (es. indici [3,4,5],
          // non [1,6]). Zero risultati o indici sparsi sono entrambi motivo
          // di avviso, secondo la regola 3.
          const coeso = indiciStessoOrario.length>0 &&
            indiciStessoOrario.every((v,i)=>i===0 || v===indiciStessoOrario[i-1]+1);
          if(coeso){
            const ultimoIdx = indiciStessoOrario[indiciStessoOrario.length-1];
            nuovoSortOrder = rinumeraEInserisci(ultimoIdx+1);
          } else {
            // Zero match o gruppo sparso: in fondo a tutto, con avviso.
            // Eccezione: se il calendario non ha ALCUN altro modello con un
            // proprio orario (es. è vuoto, o ha solo h24), non c'è alcuna
            // ambiguità reale da segnalare — è semplicemente il primo/unico
            // modello con quell'orario, non un conflitto. L'avviso ha senso
            // solo quando esisteva un contesto in cui un aggancio automatico
            // sarebbe stato possibile ma non lo è stato.
            const esistonoAltriModelliConOrario = tutti.some(m=>m.tempo!=="h24" && m.inizio);
            nuovoSortOrder = rinumeraEInserisci(tutti.length);
            if(esistonoAltriModelliConOrario){
              const messaggio = indiciStessoOrario.length===0
                ? `Non ci sono altri modelli con l'orario ${nuovoOrarioKey} in questo calendario, quindi non ho un riferimento per posizionarlo: ho messo "${(data.titolo||"il nuovo modello").toUpperCase()}" in fondo alla lista. Spostalo manualmente quando vuoi.`
                : `Ci sono già più modelli con l'orario ${nuovoOrarioKey} ma in posizioni diverse della lista, quindi non posso capire automaticamente dove raggrupparlo: ho messo "${(data.titolo||"il nuovo modello").toUpperCase()}" in fondo alla lista. Spostalo manualmente quando vuoi.`;
              window.alert(messaggio);
            }
          }
        }
        await supabase.from("modelli").update({sort_order:nuovoSortOrder}).eq("id",res.id).eq("user_id",userId);
        setModelli(prev=>{
          const updated=[...prev,{...data,id:res.id,colore:coloreEff,sortOrder:nuovoSortOrder,posizione:"",calendarId:targetCalId}];
          syncSeAttivo(store.events, store.calendars, updated);
          return updated;
        });
        return { ok:true };
      }
      return { ok:false, error:"Nessun dato restituito dal salvataggio." };
    }
  }

  async function deleteModello(id){
    // Con la nuova architettura (posizioni assolute, non riferimenti tra
    // modelli) l'eliminazione è semplice: nessun altro modello punta a
    // questo tramite id, quindi non serve "riparare" nessun riferimento.
    await supabase.from("modelli").delete().eq("id",id).eq("user_id",userId);
    setModelli(prev=>{
      const updated=prev.filter(m=>m.id!==id);
      syncSeAttivo(store.events, store.calendars, updated);
      return updated;
    });
  }

  // ── COLORI: aggiunta/rimozione dalla sezione + assegnazione esclusiva ai modelli
  async function addColoreExtra(hex){
    if(!userId || coloriExtra.includes(hex)) return;
    const { data, error } = await supabase.from("colori").insert({
      user_id: userId, hex,
    }).select().maybeSingle();
    if(error){ segnalaErroreDb(error, "Aggiunta colore"); return; }
    setColoriExtra(prev=>[...prev, hex]);
  }

  async function removeColoreExtra(hex){
    if(!userId) return;
    await supabase.from("colori").delete().eq("user_id", userId).eq("hex", hex);
    setColoriExtra(prev=>prev.filter(c=>c!==hex));
    const daResettare = modelli.filter(m=>m.coloreCustom===hex);
    for(const m of daResettare){
      await saveModello({...m, coloreCustom:null});
    }
  }

  // ── FIX: sostituisce l'hex di un colore ovunque sia usato (modelli +
  // registro colori), permettendo di editare liberamente anche i colori
  // delle fasce automatiche (es. #F59E0B "mattina") con la palette
  // condivisa, invece di lasciarli fissi.
  async function replaceColoreEverywhere(oldHex, newHex){
    if(!userId || !newHex || oldHex===newHex) return;
    // Aggiorna tutti i modelli che usano oldHex come coloreCustom
    const daAggiornare = modelli.filter(m=>m.coloreCustom===oldHex);
    for(const m of daAggiornare){
      const {error} = await supabase.from("modelli").update({ colore_custom:newHex, colore:newHex }).eq("id",m.id).eq("user_id",userId);
      if(error) console.error("Errore update modello colore:", error.message, error.details, error.hint);
    }
    setModelli(prev=>prev.map(m=>m.coloreCustom===oldHex?{...m,coloreCustom:newHex,colore:newHex}:m));
    // Aggiorna il registro colori extra
    if(coloriExtra.includes(oldHex)){
      await supabase.from("colori").delete().eq("user_id",userId).eq("hex",oldHex);
      await supabase.from("colori").insert({ user_id:userId, hex:newHex });
      setColoriExtra(prev=>[...prev.filter(c=>c!==oldHex), newHex]);
    } else {
      await ensureColoreRegistrato(newHex);
    }
    // Se oldHex era il colore di una fascia automatica, aggiorna anche quella
    const fasciaIdx = (store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT).findIndex(f=>f.color===oldHex);
    if(fasciaIdx>-1){
      const nuoveFasce = (store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT).map((f,i)=>i===fasciaIdx?{...f,color:newHex}:f);
      setStore(s=>({...s, fasceAutomatiche:nuoveFasce}));
      saveSettings({fasce_automatiche:nuoveFasce});
    }
    syncSeAttivo(store.events, store.calendars, modelli);
  }

  async function saveRotazione(data){
    if(!userId) return;
    const payload={
      user_id:userId, tipo:data.tipo, titolo:data.titolo||"",
      data_inizio:data.dataInizio||null, n_settimane:data.nSettimane||52,
      modello_lavoro_id:data.modellaLavoroId||null,
      modello_nl_id:data.modelloNLId||null,
      modello_rs_id:data.modelloRSId||null,
      griglia:data.griglia||{},
    };
    if(data.id){
      await supabase.from("rotazioni").update(payload).eq("id",data.id).eq("user_id",userId);
      setRotazioni(prev=>prev.map(r=>r.id===data.id?{...r,...data}:r));
    } else {
      const {data:res}=await supabase.from("rotazioni").insert(payload).select().maybeSingle();
      if(res) setRotazioni(prev=>[...prev,{...data,id:res.id,griglia:{}}]);
    }
  }

  async function deleteRotazione(id){
    await supabase.from("rotazioni").delete().eq("id",id).eq("user_id",userId);
    setRotazioni(prev=>prev.filter(r=>r.id!==id));
  }

  async function updateGrigliaRotazione(rotId, griglia){
    await supabase.from("rotazioni").update({griglia}).eq("id",rotId).eq("user_id",userId);
    setRotazioni(prev=>prev.map(r=>r.id===rotId?{...r,griglia}:r));
  }

  async function inserisciEventoGenerico(mod, dataEv, rotazioneId, nuoviEventiLocali, labelOverride=null){
    if(!mod && !labelOverride) return;
    const dateKey = dkey(dataEv.getFullYear(), dataEv.getMonth(), dataEv.getDate());
    const color = mod ? (mod.coloreCustom || (mod.tempo==="h24" ? "#64748b" : colByTime(mod.inizio))) : "#94a3b8";
    const label = (labelOverride || mod?.label || mod?.titolo || "").toUpperCase();
    const allDay = mod ? mod.tempo==="h24" : true;
    const tIn = (!mod || allDay) ? "" : (mod.inizio || "");
    const tOut = (!mod || allDay) ? "" : (mod.tempo==="6h15" ? calcFine6h15(mod.inizio) : (mod.fine || ""));

    const { data, error } = await supabase.from("events").insert({
      user_id: userId,
      calendar_id: calId,
      date_key: dateKey,
      label,
      color,
      all_day: allDay,
      time_in: tIn,
      time_out: tOut,
      place: "",
      map_url: "",
      note: "",
      modello_id: mod?.id || null,
      rotazione_id: rotazioneId,
      collega: "",
      auto: "",
      prot_pag_fine: null,
      prot_rec_fine: null,
    }).select().maybeSingle();

    if(error) {
      console.error("Errore inserimento evento:", error);
      return;
    }

    if(!nuoviEventiLocali[dateKey]) nuoviEventiLocali[dateKey] = {};
    if(!nuoviEventiLocali[dateKey][calId]) nuoviEventiLocali[dateKey][calId] = [];
    nuoviEventiLocali[dateKey][calId].push({
      id: data.id,
      color,
      label,
      allDay: data.all_day,
      tIn: data.time_in || "",
      tOut: data.time_out || "",
      place: "",
      map: "",
      note: "",
      modelloId: data.modello_id || null,
      rotazioneId: data.rotazione_id || null,
      collega: "",
      auto: "",
    });
  }

  async function importaEventiSingoli(righe){
    // righe: [{ dateKey, modelloId }] -- righe senza modelloId vengono ignorate
    // Restituisce il numero di righe EFFETTIVAMENTE scritte (esclude modelloId
    // mancante, modello inesistente, e duplicati già presenti sullo stesso giorno).
    if(!userId || !calId || !righe?.length) return 0;
    const nuoviEventiLocali = {};
    let nScritte = 0;
    for(const r of righe){
      if(!r.modelloId) continue;
      const mod = modelli.find(m=>m.id===r.modelloId);
      if(!mod) continue;
      // Se il giorno ha già un evento con lo stesso modello, non duplicare.
      // Se ha eventi con modelli diversi, aggiungi sotto (non sovrascrivere).
      // Se non ha eventi, aggiungi normalmente.
      const eventiEsistenti = store.events?.[r.dateKey]?.[calId] || [];
      const giaPresente = eventiEsistenti.some(ev => ev.modelloId === r.modelloId);
      if(giaPresente) continue;
      const [y,m,d] = r.dateKey.split("-").map(Number);
      const dataEv = new Date(y, m-1, d);
      await inserisciEventoGenerico(mod, dataEv, null, nuoviEventiLocali);
      nScritte++;
    }
    setStore(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      for(const [dateKey, calMap] of Object.entries(nuoviEventiLocali)) {
        if(!ns.events[dateKey]) ns.events[dateKey] = {};
        for(const [cid, evts] of Object.entries(calMap)) {
          if(!ns.events[dateKey][cid]) ns.events[dateKey][cid] = [];
          ns.events[dateKey][cid].push(...evts);
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
    return nScritte;
  }

  async function applyRotazione(rotId, startDayKey, numRipetizioni, modPartenza="RS") {
    if(!userId || !calId || !startDayKey || !numRipetizioni) return;
    const rot = rotazioni.find(r=>r.id===rotId);
    if(!rot) return;

    await supabase.from("rotazioni").update({dataInizio:startDayKey, nSettimane:numRipetizioni}).eq("id",rotId).eq("user_id",userId);
    setRotazioni(prev=>prev.map(r=>r.id===rotId?{...r,dataInizio:startDayKey,nSettimane:numRipetizioni}:r));

    const nuoviEventiLocali = {};

    async function inserisciEvento(mod, dataEv){
      await inserisciEventoGenerico(mod, dataEv, rot.id, nuoviEventiLocali);
    }

    if(rot.tipo === "nlrs_scalante") {
      const modRS = modelli.find(m=>m.id===rot.modelloRSId);
      const modNL = modelli.find(m=>m.id===rot.modelloNLId);
      const primoModello = modPartenza==="NL" ? modNL : modRS;
      const secondoModello = modPartenza==="NL" ? modRS : modNL;
      const GIORNI_CICLO = [5, 4, 3, 2, 1, 6];
      const [y0, m0, d0] = startDayKey.split("-").map(Number);
      let dataCorrRS = new Date(y0, m0-1, d0);
      let giornoCicloIdx = 0;
      const totalCicli = numRipetizioni * GIORNI_CICLO.length;

      for(let i=0; i<totalCicli; i++) {
        const dataRS = new Date(dataCorrRS);
        const dataNL = new Date(dataCorrRS);
        dataNL.setDate(dataNL.getDate() + 7);

        await inserisciEvento(primoModello, dataRS);
        await inserisciEvento(secondoModello, dataNL);

        giornoCicloIdx = (giornoCicloIdx + 1) % GIORNI_CICLO.length;
        const prossimoDow = GIORNI_CICLO[giornoCicloIdx];
        const base = new Date(dataCorrRS);
        base.setDate(base.getDate() + 21);
        let tentativo = new Date(base);
        let iter = 0;
        while(tentativo.getDay() !== prossimoDow && iter < 14) {
          tentativo.setDate(tentativo.getDate() + 1);
          iter++;
        }
        dataCorrRS = tentativo;
      }
    } else {
      const modLav = modelli.find(m=>m.id===rot.modellaLavoroId);
      const modRip = modelli.find(m=>m.id===rot.modelloNLId);
      const totalWeeks = numRipetizioni * 4;

      const [y0, m0, d0] = startDayKey.split("-").map(Number);
      const start = new Date(y0, m0-1, d0);

      for(let i=0; i<totalWeeks; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        const isLavoro = (i % 4) === 0;
        const mod = isLavoro ? modLav : modRip;
        await inserisciEvento(mod, d);
      }
    }

    setStore(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      for(const [dateKey, calMap] of Object.entries(nuoviEventiLocali)) {
        if(!ns.events[dateKey]) ns.events[dateKey] = {};
        for(const [cid, evts] of Object.entries(calMap)) {
          if(!ns.events[dateKey][cid]) ns.events[dateKey][cid] = [];
          ns.events[dateKey][cid].push(...evts);
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }
// #endregion


// #region SEZIONE 14: REPORT HELPERS
// ═══════════════════════════════════════════════════════════════
  function getReportRange(){
    const now = new Date();
    if(reportInterval==="mese"){
      const y=now.getFullYear(), m=now.getMonth();
      const from=`${y}-${String(m+1).padStart(2,"0")}-01`;
      const to=`${y}-${String(m+1).padStart(2,"0")}-${String(daysInMonth(y,m)).padStart(2,"0")}`;
      return {from, to, label: MONTHS[m]+" "+y};
    }
    if(reportInterval==="anno"){
      return {from:`${now.getFullYear()}-01-01`, to:`${now.getFullYear()}-12-31`, label: now.getFullYear().toString()};
    }
    return {from:reportDateFrom, to:reportDateTo, label:reportDateFrom+" → "+reportDateTo};
  }

  function computeConteggioForReport(cfg){
    const {from, to} = getReportRange();
    const result = { totale:0, primo:0, secondo:0, h24:0, app:0, auto:0 };
    const perModello = {};
    const modelliInclusi = cfg?.modelliInclusi || [];
    const fasceManuali = cfg?.fasceManuali || {};
    const fasceFiltro = cfg?.fasceFiltro || [];
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          const fascia = e.modelloId ? (fasceManuali[e.modelloId]||"") : "";
          if(fasceFiltro.length>0 && !fasceFiltro.includes(fascia||"nessuna")) continue;
          result.totale++;
          if(fascia==="primo"||fascia==="secondo") result[fascia]=(result[fascia]||0)+1;
          else result.h24++;
          if(e.modelloId) perModello[e.modelloId]=(perModello[e.modelloId]||0)+1;
          const modelloEvt = e.modelloId ? modelli.find(mm=>mm.id===e.modelloId) : null;
          const titoloEvt = (modelloEvt?.titolo||"").toUpperCase();
          if(titoloEvt.includes("APP")) result.app=(result.app||0)+1;
          else if(titoloEvt.includes("AUTO")) result.auto=(result.auto||0)+1;
        }
      }
    }
    return {...result, perModello};
  }


  function computeTurnazioneForReport(cfg){
    const {from, to} = getReportRange();
    const esclusi = cfg?.modelliEsclusi || [];
    const aggiunti = cfg?.modelliAggiunti || [];
    const default6h15 = modelli.filter(m=>isModelloTurnazioneDefault(m) && !esclusi.includes(m.id)).map(m=>m.id);
    const modelliInclusi = [...new Set([...default6h15, ...aggiunti])];
    const gruppiManuali = cfg?.gruppiManuali || {}; // { modelloId: "primo"|"secondo"|"app"|"auto" }
    const result = { totale:0, primo:0, secondo:0, app:0, auto:0 };
    const perModello = {};
    const perGruppo = { primo:{}, secondo:{}, app:{}, auto:{} };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          result.totale++;
          const modelloEvt = e.modelloId ? modelli.find(mm=>mm.id===e.modelloId) : null;
          const overrideGruppo = e.modelloId ? gruppiManuali[e.modelloId] : null;
          const overrideTurno = (overrideGruppo==="primo"||overrideGruppo==="secondo") ? overrideGruppo : null;
          const overrideAppAuto = (overrideGruppo==="app"||overrideGruppo==="auto") ? overrideGruppo : null;

          // ── Asse 1: TURNO (1°/2°) — indipendente, decide su categoria manuale del
          // modello, poi override di questo report, poi automatico per orario.
          // Se l'utente ha esplicitamente deselezionato questo asse, niente auto: nessun gruppo.
          const gruppoTurno = modelloEvt?.categoria_turno_vuoto
            ? null
            : ((modelloEvt?.categoria==="primo"||modelloEvt?.categoria==="secondo")
              ? modelloEvt.categoria
              : (overrideTurno || categoriaTurnoAutomatica(modelloEvt)));

          // ── Asse 2: APP/AUTO — indipendente, stessa priorità ma decide su titolo.
          // Se l'utente ha esplicitamente deselezionato questo asse, niente auto: nessun gruppo.
          const gruppoAppAuto = modelloEvt?.categoria_app_auto_vuoto
            ? null
            : ((modelloEvt?.categoriaAppAuto==="app"||modelloEvt?.categoriaAppAuto==="auto")
              ? modelloEvt.categoriaAppAuto
              : (overrideAppAuto || categoriaAppAutoAutomatica(modelloEvt) || "auto"));

          if(e.modelloId){
            if(!perModello[e.modelloId]) perModello[e.modelloId] = { count:0, dates:[] };
            perModello[e.modelloId].count++;
            perModello[e.modelloId].dates.push(dateKey);
          }
          if(gruppoTurno){
            result[gruppoTurno] = (result[gruppoTurno]||0)+1;
            if(e.modelloId){
              if(!perGruppo[gruppoTurno][e.modelloId]) perGruppo[gruppoTurno][e.modelloId] = { count:0, dates:[] };
              perGruppo[gruppoTurno][e.modelloId].count++;
              perGruppo[gruppoTurno][e.modelloId].dates.push(dateKey);
            }
          }
          if(gruppoAppAuto){
            result[gruppoAppAuto] = (result[gruppoAppAuto]||0)+1;
            if(e.modelloId){
              if(!perGruppo[gruppoAppAuto][e.modelloId]) perGruppo[gruppoAppAuto][e.modelloId] = { count:0, dates:[] };
              perGruppo[gruppoAppAuto][e.modelloId].count++;
              perGruppo[gruppoAppAuto][e.modelloId].dates.push(dateKey);
            }
          }
        }
      }
    }
    Object.values(perModello).forEach(v=>v.dates.sort());
    Object.values(perGruppo).forEach(g=>Object.values(g).forEach(v=>v.dates.sort()));
    return {...result, perModello, perGruppo, modelliInclusiEffettivi:modelliInclusi};
  }

  function computeConteggio(){
    return computeConteggioForReport({fasceFiltro:[]});
  }

  function computeIndennita(modelliInclusi=[]){
    const {from, to} = getReportRange();
    const totals = { diurno:0, notturno:0, festivo:0, notturno_festivo:0 };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fest = isFestivo(dateKey);
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          if(e.allDay) continue;
          const band = getShiftBand(e.tIn);
          if(fest && band==="notturno") totals.notturno_festivo++;
          else if(fest) totals.festivo++;
          else if(band==="notturno") totals.notturno++;
          else totals.diurno++;
        }
      }
    }
    return totals;
  }

  const activeReports = (store.reports||[]).filter(r=>r.active);
  const inactiveTypes = REPORT_TEMPLATES;

  function addReport(type){
    const tmpl = REPORT_TEMPLATES.find(t=>t.type===type);
    if(!tmpl) return;
    const newReport = {
      id: uid(),
      type,
      label: tmpl.label,
      active: true,
    };
    const newRep = [...(store.reports||[]), newReport];
    setStore(s=>({...s, reports:newRep}));
    saveSettings({reports:newRep});
    if(type==="turnazione"){
      const default6h15 = modelli.filter(m=>isModelloTurnazioneDefault(m)).map(m=>m.id);
      if(default6h15.length>0){
        const newCfg = {...conteggioConfigs, [newReport.id]: {fasceFiltro:[], modelliInclusi:default6h15}};
        setConteggioConfigs(newCfg);
        saveSettings({conteggio_configs: newCfg});
      }
    }
  }

  function removeReport(id){
    const newRep = (store.reports||[]).filter(r=>r.id!==id);
    setStore(s=>({...s, reports:newRep}));
    saveSettings({reports:newRep});
  }

  function renameReport(id, label){
    const newRep = (store.reports||[]).map(r=>r.id===id?{...r,label}:r);
    setStore(s=>({...s, reports:newRep}));
    saveSettings({reports:newRep});
  }

  function moveReport(id, dir){
    const reps = [...(store.reports||[])];
    const idx = reps.findIndex(r=>r.id===id);
    if(idx===-1) return;
    const newIdx = dir==="up" ? idx-1 : idx+1;
    if(newIdx<0||newIdx>=reps.length) return;
    const [moved] = reps.splice(idx,1);
    reps.splice(newIdx,0,moved);
    setStore(s=>({...s, reports:reps}));
    saveSettings({reports:reps});
  }

  function getConteggioConfig(reportId, reportType){
    const saved = conteggioConfigs[reportId];
    if(saved) return saved;
    if(reportType==="turnazione"){
      return { fasceFiltro:[], modelliEsclusi:[], modelliAggiunti:[] };
    }
    return { fasceFiltro:[], modelliInclusi:[] };
  }

  function updateConteggioConfig(reportId, cfg){
    const newCfg = {...conteggioConfigs, [reportId]: cfg};
    setConteggioConfigs(newCfg);
    saveSettings({conteggio_configs: newCfg});
  }

  const totaleTurni = computeConteggio().totale;
// #endregion


// #region SEZIONE 15: CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════
  async function applyQuickModello(key){
    if(!quickModeModello||!calId||!userId) return;
    const mod = modelli.find(m=>m.id===quickModeModello);
    if(!mod) return;
    const color = mod.coloreCustom||(mod.tempo==="h24"?"#64748b":colByTime(mod.inizio));
    const label = (mod.label||mod.titolo||"").toUpperCase();
    const allDay = mod.tempo==="h24";
    const tIn = allDay?"":(mod.inizio||"");
    const tOut = allDay?"":(mod.tempo==="6h15"?calcFine6h15(mod.inizio):(mod.fine||""));
    const { data, error } = await supabase.from("events").insert({
      user_id:userId, calendar_id:calId, date_key:key, label, color,
      all_day:allDay, time_in:tIn, time_out:tOut, place:"", map_url:"", note:"",
      modello_id:mod.id, collega:"", auto:"",
    }).select().maybeSingle();
    if(error){ segnalaErroreDb(error, "Inserimento rapido turno"); return; }
    const evt = { id:data.id, color, label, allDay, tIn, tOut, place:"", map:"", note:"",
      modelloId:mod.id, collega:"", auto:"" };
    setStore(prev=>{
      const ns = withEventoAggiunto(prev, key, calId, evt);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  const totalDays = daysInMonth(year,month);
  const fd = firstDay(year,month);
  const cells = [...Array(fd).fill(null), ...Array.from({length:totalDays},(_,i)=>i+1)];

  if(loading) return (
    <div style={{background:dark?"#090e1a":"#f1f5f9",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#64748b",fontSize:13}}>⏳ Caricamento...</div>
    </div>
  );

  const selectStyle = {
    background:"rgba(255,255,255,0.15)",
    border:"1px solid rgba(255,255,255,0.4)",
    borderRadius:8, color:"#fff", fontSize:12, fontWeight:900,
    fontFamily:"Georgia,serif", padding:"2px 0px", cursor:"pointer",
    outline:"none", flexShrink:0,
    appearance:"none", WebkitAppearance:"none",
  };

  const goPrevMonth = ()=>{
    setPrevGrid({year, month, dir:"prev"});
    setTimeout(()=>setPrevGrid(null), 350);
    month===0?(setYear(y=>y-1),setMonth(11)):setMonth(m=>m-1);
  };
  const goNextMonth = ()=>{
    setPrevGrid({year, month, dir:"next"});
    setTimeout(()=>setPrevGrid(null), 350);
    month===11?(setYear(y=>y+1),setMonth(0)):setMonth(m=>m+1);
  };

  const calView = (
    <div
      onTouchStart={(e)=>{ touchStartX.current=e.touches[0].clientX; touchStartY.current=e.touches[0].clientY; }}
      onTouchEnd={(e)=>{
        if(touchStartX.current===null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)){
          if(dx<0) goNextMonth(); else goPrevMonth();
        }
        touchStartX.current=null; touchStartY.current=null;
      }}
      style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",position:"relative"}}>
      <div style={{background:accent,display:"flex",alignItems:"center",
        gap:5,padding:"6px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0}}>
        <button onClick={()=>month===0?(setYear(y=>y-1),setMonth(11)):setMonth(m=>m-1)} style={NB}>‹</button>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))}
          style={{...selectStyle, maxWidth:80}}>
          {MONTHS.map((mn,i)=>(
            <option key={i} value={i} style={{background:"#1e293b",color:"#fff"}}>
              {mn.toUpperCase()}
            </option>
          ))}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))}
          style={{...selectStyle, maxWidth:50}}>
          {Array.from({length:21},(_,i)=>2023+i).map(y=>(
            <option key={y} value={y} style={{background:"#1e293b",color:"#fff"}}>{y}</option>
          ))}
        </select>
        {bgSyncing&&<span style={{color:"rgba(255,255,255,0.7)",fontSize:11}}>🔄</span>}
        <button onClick={()=>month===11?(setYear(y=>y+1),setMonth(0)):setMonth(m=>m+1)} style={NB}>›</button>
        <div style={{flex:1}}/>
        <button onClick={()=>setShowModelloPicker("quick")}
          title="Applica un modello a più giorni"
          style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",
            borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,color:"#fff",flexShrink:0}}>
          ✏️
        </button>
        
        <button onClick={()=>{
            setEditMode(em=>{
              const next=!em;
              if(next){ // entro in modifica: tutti i calendari selezionati restano visibili,
                        // scelgo come "attivo per l'editing" quello già attivo se è tra i selezionati, altrimenti il primo
                const attivoValido = calId && selectedCalIds.includes(calId);
                const scelto = attivoValido ? calId : (selectedCalIds[0]||calId||null);
                setCalId(scelto);
                if(scelto && !selectedCalIds.includes(scelto)) setSelectedCalIds(prev=>[...prev, scelto]);
              }
              return next;
            });
          }}
          title={editMode?"Modifica attiva — tocca per tornare alla sola consultazione":"Consultazione multipla — tocca per modificare (gli altri calendari restano visibili)"}
          style={{background:editMode?"rgba(255,255,255,0.28)":"rgba(255,255,255,0.1)",
            border:`1.5px solid ${editMode?"rgba(255,255,255,0.85)":"transparent"}`,
            borderRadius:20,padding:"2px 10px",cursor:"pointer",flexShrink:0}}>
          <span style={{color:"#fff",fontSize:11,fontWeight:800}}>M</span>
        </button>
        <button onClick={async()=>{
          setBanner("⏳ Svuotamento cache...");
          clearLocalStorageCache();
          try {
            if("caches" in window){
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(name=>caches.delete(name)));
            }
          } catch(e){ console.warn("Errore pulizia cache SW:", e); }
          try {
            if("serviceWorker" in navigator){
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r=>r.unregister()));
            }
          } catch(e){ console.warn("Errore unregister Service Worker:", e); }
          window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }}
          title="Svuota cache e ricarica tutto"
          style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",
            borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,color:"#fff",flexShrink:0}}>
          🔄
        </button>

        <button onClick={()=>{
          const next = syncMode==='on'?'off':'on';
          setSyncMode(next);
          localStorage.setItem('syncMode', next);
        }} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",
          borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0}}>
          {syncMode==='on'?(isOnline?'🟢 SYNC':'🔴 OFFLINE'):'⏸️ SYNC OFF'}
        </button>
      </div>
      <div style={{background:accent,display:"flex",alignItems:"center",
        gap:5,padding:"4px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0,
        borderTop:"1px solid rgba(255,255,255,0.2)"}}>
        {store.calendars.length===0
          ? <span style={{color:"rgba(255,255,255,0.6)",fontSize:10,fontStyle:"italic"}}>→ Impostazioni</span>
          : store.calendars.map(c=>{
            const visibile = selectedCalIds.includes(c.id);
            const attivoEdit = editMode && calId===c.id;
            return (
            <button key={c.id} onClick={()=>{
                if(editMode){
                  setCalId(c.id);
                  setSelectedCalIds(prev=> prev.includes(c.id) ? prev : [...prev, c.id]); // resta visibile, non toglie gli altri
                  return;
                }
                setSelectedCalIds(prev=> prev.includes(c.id) ? prev.filter(id=>id!==c.id) : [...prev, c.id]);
              }}
              title={editMode?`Tocca per rendere "${c.name}" il calendario attivo per la modifica`:undefined}
              style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,cursor:"pointer",
                background:visibile?"rgba(255,255,255,0.28)":"rgba(255,255,255,0.1)",
                border:`1.5px solid ${attivoEdit?"#ffffff":(visibile?"rgba(255,255,255,0.85)":"transparent")}`,
                boxShadow:attivoEdit?"0 0 0 2px rgba(255,255,255,0.35)":"none",
                borderRadius:20,padding:"2px 8px 2px 5px"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:c.color,border:"1px solid rgba(255,255,255,0.5)"}}/>
              <span style={{color:"#fff",fontSize:12,fontWeight:attivoEdit?900:700}}>{c.name}</span>
              {attivoEdit&&<span style={{color:"#fff",fontSize:9}}>✏️</span>}
              {c.isMain&&<span style={{color:"rgba(255,255,255,0.6)",fontSize:8}}>★</span>}
            </button>
            );})
        }
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
        background:T.s2,borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        {DAYS.map((d,i)=>(
          <div key={i} style={{textAlign:"center",fontSize:9,fontWeight:800,
            padding:"3px 0",color:i===6?"#ef4444":T.sub}}>{d}</div>
        ))}
      </div>
      <div style={{position:"relative",flex:1,overflow:"hidden",minHeight:0}}>
      {prevGrid&&(()=>{
        const pTotalDays=daysInMonth(prevGrid.year,prevGrid.month);
        const pFd=firstDay(prevGrid.year,prevGrid.month);
        const pCells=[...Array(pFd).fill(null), ...Array.from({length:pTotalDays},(_,i)=>i+1)];
        return (
          <div key={"prev-"+prevGrid.month+"-"+prevGrid.year}
            style={{position:"absolute",inset:0,display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
              gridAutoRows:"minmax(54px,1fr)",gap:"1px 0px",background:T.gap,
              animation:`calSlideOut${prevGrid.dir==="next"?"Left":"Right"} 0.35s ease forwards`}}>
            {pCells.map((d,i)=>{
              if(!d) return <div key={i} style={{background:T.bg}}/>;
              const key=dkey(prevGrid.year,prevGrid.month,d);
              const evts=allEvts(key);
              const ds=dots(key);
              const isSun=(i%7)===6;
              const isH=isRed(d,prevGrid.month);
              const red=isSun||isH;
              return (
                <div key={i} style={{background:red?(dark?"#2d0a0a":"#fff5f5"):T.surface,
                  display:"flex",flexDirection:"column",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:2,padding:"2px 3px 0",flexShrink:0}}>
                    <span style={{fontSize:10,fontWeight:500,lineHeight:1,color:red?"#ef4444":T.sub}}>{d}</span>
                    {ds.map(c=><div key={c.id} style={{width:5,height:5,borderRadius:"50%",background:c.color}}/>)}
                  </div>
                  <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",gap:"1px",padding:"0 1px 1px"}}>
                    {evts.slice(0,4).map((e,ei)=>(
                      <div key={e.id+ei} style={{background:e.color,borderRadius:3,padding:"2px 4px",
                        fontSize:14,fontWeight:800,color:getContrastTextColor(e.color),overflow:"hidden",textOverflow:"ellipsis",
                        whiteSpace:"nowrap",height:16,minHeight:16,display:"flex",alignItems:"center",flexShrink:0,
                        textShadow:getContrastTextColor(e.color)==="#ffffff"?"0 1px 2px rgba(0,0,0,0.35)":"none"}}>{e.label}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
      <div key={month+"-"+year} style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
        gridAutoRows:"minmax(54px,1fr)",gap:"1px 0px",background:T.gap,
        position:prevGrid?"absolute":"relative",inset:0,height:"100%",
        animation:prevGrid?`calSlideIn${prevGrid.dir==="next"?"Left":"Right"} 0.35s ease forwards`:"none"}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={i} style={{background:T.bg}}/>;
          const key=dkey(year,month,d);
          const evts=allEvts(key);
          const ds=dots(key);
          const isT=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
          const isSun=(i%7)===6;
          const isH=isRed(d,month);
          const red=isSun||isH;
          return (
            <div key={i} onClick={()=>{
                if(!editMode && selectedCalIds.length>1){ setDayKey(key); setForm(null); setPal(null); return; } // sola consultazione, niente form
                if(quickModeModello){ applyQuickModello(key); return; }
                setDayKey(key); setForm(null); setPal(null);
              }}
              style={{background:isT?(dark?"#1a2f50":"#dbeafe"):red?(dark?"#2d0a0a":"#fff5f5"):T.surface,
                cursor:"pointer",display:"flex",flexDirection:"column",overflow:"hidden",
                borderTop:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:2,padding:"2px 3px 0",flexShrink:0}}>
                <span style={{fontSize:10,fontWeight:isT?900:500,lineHeight:1,
                  color:isT?accent:red?"#ef4444":T.sub}}>{d}</span>
                {ds.map(c=><div key={c.id} style={{width:5,height:5,borderRadius:"50%",background:c.color}}/>)}
              </div>
              <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",gap:"1px",padding:"0 1px 1px"}}>
                {evts.slice(0,4).map((e,ei)=>{
                  const nodes = [];
                  if(e.protPagFine) nodes.push({label:"PR PAG",color:"#8b5cf6"});
                  if(e.protRecFine) nodes.push({label:"PR REC",color:"#64748b"});
                  return (
                    <Fragment key={e.id+ei}>
                      <div style={{background:e.color,borderRadius:3,padding:"2px 4px",
                        fontSize:14,fontWeight:800,color:getContrastTextColor(e.color),overflow:"hidden",textOverflow:"ellipsis",
                        whiteSpace:"nowrap",height:16,minHeight:16,display:"flex",alignItems:"center",flexShrink:0,
                        textShadow:getContrastTextColor(e.color)==="#ffffff"?"0 1px 2px rgba(0,0,0,0.35)":"none"}}>
                        {e.label}
                      </div>
                      {nodes.map((n,ni)=>(
                        <div key={ni} style={{background:n.color,borderRadius:3,padding:"2px 4px",
                          fontSize:14,fontWeight:800,color:getContrastTextColor(n.color),overflow:"hidden",textOverflow:"ellipsis",
                          whiteSpace:"nowrap",height:16,minHeight:16,display:"flex",alignItems:"center",flexShrink:0,
                          textShadow:getContrastTextColor(n.color)==="#ffffff"?"0 1px 2px rgba(0,0,0,0.35)":"none"}}>
                          {n.label}
                        </div>
                      ))}
                    </Fragment>
                  );
                })}
                {evts.length>4&&<div style={{fontSize:8,color:T.sub,padding:"0 2px",flexShrink:0}}>+{evts.length-4}</div>}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
// #endregion


// #region SEZIONE 16: REPORT VIEW
// ═══════════════════════════════════════════════════════════════
  const range = getReportRange();
  const indennitaCalc = computeIndennita();

  function renderReportCard(r){
    const isOpen = openReportConfig===r.id;
    const cfg = getConteggioConfig(r.id, r.type);
    const data = computeConteggioForReport(cfg);
    const pct = totaleTurni>0 ? Math.round((data.totale/totaleTurni)*100) : 0;

    return (
      <div key={r.id}>
        <div style={{display:"flex",alignItems:"center",padding:"12px 14px",
          borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}
          onClick={()=>setOpenReportConfig(isOpen?null:r.id)}>
          <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questo report?"))removeReport(r.id);}}
            style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
              background:"#ef4444",color:"#fff",fontSize:16,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
            –
          </button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:22,fontWeight:700,color:T.text,overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
            {r.type==="conteggio_turni"&&(
              <div style={{fontSize:17,color:T.sub}}>
                {data.totale} turni
                {data.totale>0&&(()=>{
                  const pct1=Math.round(((data.primo||0)/data.totale)*100);
                  const pct2=Math.round(((data.secondo||0)/data.totale)*100);
                  return (
                    <span style={{marginLeft:4}}>
                      {data.primo>0&&<span style={{color:"#f59e0b",marginLeft:4}}>1°T {pct1}%</span>}
                      {data.secondo>0&&<span style={{color:"#f97316",marginLeft:4}}>2°T {pct2}%</span>}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
          <div style={{display:"flex",flexDirection:"row",gap:10,marginRight:10,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"up");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▲</button>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"down");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▼</button>
          </div>
          <span style={{color:T.sub,fontSize:12}}>›</span>
        </div>
        {isOpen && (
          <div style={{background:T.s2,padding:14,borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
              <button onClick={()=>setShowReportModelliPicker(r.id)}
                style={{display:"flex",alignItems:"center",gap:6,background:T.surface,
                  border:`1px solid ${T.border}`,borderRadius:20,padding:"6px 12px",
                  fontSize:12,fontWeight:700,color:T.text,cursor:"pointer"}}>
                📋 Filtra modelli
                {(()=>{
                  const count = r.type==="turnazione"
                    ? [...modelli.filter(m=>isModelloTurnazioneDefault(m)&&!(cfg.modelliEsclusi||[]).includes(m.id)).map(m=>m.id), ...(cfg.modelliAggiunti||[])].length
                    : (cfg.modelliInclusi||[]).length;
                  return count>0&&(
                    <span style={{background:accent,color:"#fff",borderRadius:10,
                      padding:"1px 7px",fontSize:11,fontWeight:800}}>{count}</span>
                  );
                })()}
              </button>
            </div>
            {r.type==="conteggio_turni" && (
              <ConteggioConfigCard T={T} r={r} cfg={cfg} data={data} totaleTurni={totaleTurni}
                modelli={modelli} accent={accent} fasceAutomatiche={fasceAutomatiche}
                onRename={label=>renameReport(r.id, label)}
                onUpdateCfg={newCfg=>updateConteggioConfig(r.id, newCfg)}
                onGoToModelli={()=>setScreen("modelli")}/>
            )}
            {r.type==="turnazione" && (
              <TurnazioneConfigCard T={T} r={r} cfg={cfg} data={computeTurnazioneForReport(cfg)}
                modelli={modelli} modelliOrdinati={modelliOrdinati} accent={accent} fasceAutomatiche={fasceAutomatiche}
                onRename={label=>renameReport(r.id, label)}
                onUpdateCfg={newCfg=>updateConteggioConfig(r.id, newCfg)}/>
            )}
            {r.type==="indennita" && (
              <IndennitaConfig T={T} values={indennita} setValues={setIndennita}
                calc={computeIndennita(cfg.modelliInclusi||[])} onSave={()=>saveSettings({indennita})}/>
            )}
            {r.type==="ore_turno" && <OrePerTurnoView T={T} data={data}/>}
            {r.type==="straordinari" && <StraordinariView T={T} data={data} store={store} reportRange={{from:range.from,to:range.to}} modelliInclusi={cfg.modelliInclusi||[]} reportCalIds={reportCalIds}/>}
            {r.type==="guadagni" && (
              <GuadagniView T={T} indennita={indennita} calc={computeIndennita(cfg.modelliInclusi||[])}/>
            )}
          </div>
        )}
      </div>
    );
  }

  const reportView = (
    <div style={{flex:1,overflowY:"auto",padding:"0 0 80px",color:T.text}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"16px 16px 8px"}}>
        <div style={{fontSize:22,fontWeight:900,fontFamily:"Georgia,serif"}}>Report</div>
        <button onClick={()=>setShowIntervalPicker(true)}
          style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:20,
            padding:"5px 14px",fontSize:12,fontWeight:700,color:T.sub,cursor:"pointer"}}>
          {range.label} ▾
        </button>
      </div>

      {store.calendars.length>0 && (
        <div style={{display:"flex",alignItems:"center",gap:5,padding:"0 12px 10px",
          overflowX:"auto",scrollbarWidth:"none"}}>
          {store.calendars.map(c=>{
            const attivo = reportCalIds.length===0 || reportCalIds.includes(c.id);
            return (
              <button key={c.id} onClick={()=>{
                  setReportCalIds(prev=>{
                    if(prev.length===0) return [c.id];
                    const next = prev.includes(c.id) ? prev.filter(id=>id!==c.id) : [...prev, c.id];
                    return next.length===store.calendars.length ? [] : next;
                  });
                }}
                style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,cursor:"pointer",
                  background:attivo?(T.dark?"rgba(255,255,255,0.15)":T.s2):"transparent",
                  border:`1.5px solid ${attivo?accent:T.border}`,
                  borderRadius:20,padding:"3px 9px 3px 6px"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:c.color}}/>
                <span style={{color:attivo?T.text:T.sub,fontSize:12,fontWeight:700}}>{c.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {activeReports.length>0 && (
        <div style={{margin:"8px 12px"}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6,paddingLeft:4}}>Report attivi</div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            {activeReports.map(r=>renderReportCard(r))}
          </div>
        </div>
      )}

      {(()=>{
        const isAddOpen = openReportConfig==='__add__';
        return (
          <div style={{margin:"16px 12px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:6,paddingLeft:4,cursor:"pointer"}}
              onClick={()=>setOpenReportConfig(isAddOpen?null:'__add__')}>
              <div style={{fontSize:11,color:T.sub,fontWeight:700}}>Aggiungi report</div>
              <span style={{color:T.sub,fontSize:12}}>{isAddOpen?"▲":"▼"}</span>
            </div>
            {isAddOpen&&(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                {REPORT_TEMPLATES.map((tmpl,i,arr)=>(
                  <div key={tmpl.type} style={{display:"flex",alignItems:"center",padding:"12px 14px",
                    borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <button onClick={()=>{addReport(tmpl.type);setOpenReportConfig(null);}}
                      style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
                        background:"#22c55e",color:"#fff",fontSize:18,fontWeight:700,
                        display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
                      +
                    </button>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:T.text}}>{tmpl.label}</div>
                      <div style={{fontSize:11,color:T.sub}}>{tmpl.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {showIntervalPicker && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:400,
          display:"flex",alignItems:"flex-end"}} onClick={()=>setShowIntervalPicker(false)}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",padding:"16px 14px 40px"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:900,marginBottom:14,color:T.text}}>Intervallo</div>
            <div style={{background:T.s2,borderRadius:14,overflow:"hidden",border:`1px solid ${T.border}`}}>
              {[["mese","1 mese"],["anno","1 anno"],["custom","Intervallo personalizzato"]].map(([v,l])=>(
                <div key={v} onClick={()=>{setReportInterval(v);if(v!=="custom")setShowIntervalPicker(false);}}
                  style={{display:"flex",alignItems:"center",padding:"14px 16px",
                    borderBottom:`1px solid ${T.border}`,cursor:"pointer",
                    background:reportInterval===v?accent+"15":"transparent"}}>
                  {reportInterval===v&&<span style={{color:accent,marginRight:10,fontSize:14}}>✓</span>}
                  <span style={{flex:1,fontSize:14,fontWeight:reportInterval===v?700:400,
                    color:reportInterval===v?accent:T.text}}>{l}</span>
                </div>
              ))}
            </div>
            {reportInterval==="custom" && (
              <div style={{display:"flex",gap:10,marginTop:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:T.sub,marginBottom:4}}>DA</div>
                  <input type="date" value={reportDateFrom} onChange={e=>setReportDateFrom(e.target.value)}
                    style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:T.sub,marginBottom:4}}>A</div>
                  <input type="date" value={reportDateTo} onChange={e=>setReportDateTo(e.target.value)}
                    style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                </div>
              </div>
            )}
            {reportInterval==="custom"&&reportDateFrom&&reportDateTo&&(
              <button onClick={()=>setShowIntervalPicker(false)}
                style={{width:"100%",marginTop:12,background:accent,border:"none",borderRadius:10,
                  color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:13}}>
                Conferma
              </button>
            )}
          </div>
        </div>
      )}
      {showReportModelliPicker&&(()=>{
        const reportId = showReportModelliPicker;
        const reportType = (store.reports||[]).find(rr=>rr.id===reportId)?.type;
        const cfg = getConteggioConfig(reportId, reportType);
        const isTurnazione = reportType==="turnazione";
        const esclusi = cfg.modelliEsclusi||[];
        const aggiunti = cfg.modelliAggiunti||[];
        const inclusi = isTurnazione
          ? [...modelli.filter(m=>isModelloTurnazioneDefault(m)&&!esclusi.includes(m.id)).map(m=>m.id), ...aggiunti]
          : (cfg.modelliInclusi||[]);
        function toggleModello(m){
          if(!isTurnazione){
            const selezionato = (cfg.modelliInclusi||[]).includes(m.id);
            const next = selezionato ? (cfg.modelliInclusi||[]).filter(id=>id!==m.id) : [...(cfg.modelliInclusi||[]), m.id];
            updateConteggioConfig(reportId, {...cfg, modelliInclusi: next});
            return;
          }
          if(isModelloTurnazioneDefault(m)){
            const attualmenteIncluso = !esclusi.includes(m.id);
            const nextEsclusi = attualmenteIncluso ? [...esclusi, m.id] : esclusi.filter(id=>id!==m.id);
            updateConteggioConfig(reportId, {...cfg, modelliEsclusi: nextEsclusi});
          } else {
            const attualmenteIncluso = aggiunti.includes(m.id);
            const nextAggiunti = attualmenteIncluso ? aggiunti.filter(id=>id!==m.id) : [...aggiunti, m.id];
            updateConteggioConfig(reportId, {...cfg, modelliAggiunti: nextAggiunti});
          }
        }
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:600,
            display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
              <button onClick={()=>setShowReportModelliPicker(null)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>Filtra modelli</div>
              <div style={{width:32}}/>
            </div>
            <div style={{padding:"10px 16px",fontSize:12,color:T.sub,background:T.s2}}>
              Nessuna selezione = tutti i modelli inclusi nel calcolo di questo report.
            </div>
            <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
              {modelli.length===0?(
                <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>Nessun modello creato ancora.</div>
              ):(
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                  {!isTurnazione&&(
                    <div onClick={()=>updateConteggioConfig(reportId, {...cfg, modelliInclusi:[]})}
                      style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer",
                        borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:20,height:20,borderRadius:6,marginRight:12,flexShrink:0,
                        border:`2px solid ${inclusi.length===0?accent:T.border}`,
                        background:inclusi.length===0?accent:"transparent",
                        display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {inclusi.length===0&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
                      </div>
                      <span style={{fontSize:15,fontWeight:700,color:T.text}}>Tutti i modelli</span>
                    </div>
                  )}
                  {modelliOrdinati.map((m,i,arr)=>{
                    const selezionato = inclusi.includes(m.id);
                    const colore = m.coloreCustom||colByTime(m.inizio);
                    return (
                      <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                        <div onClick={()=>toggleModello(m)}
                          style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                          <div style={{width:20,height:20,borderRadius:6,marginRight:12,flexShrink:0,
                            border:`2px solid ${selezionato?colore:T.border}`,
                            background:selezionato?colore:"transparent",
                            display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {selezionato&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
                          </div>
                          <div style={{width:10,height:10,borderRadius:"50%",background:colore,marginRight:10,flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:15,fontWeight:700,color:T.text}}>{m.titolo||"Senza nome"}</div>
                            <div style={{fontSize:11,color:T.sub}}>
                              {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.fine?` - ${m.fine}`:""}`:""}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{padding:12,borderTop:`1px solid ${T.border}`,background:T.surface}}>
              <button onClick={()=>setShowReportModelliPicker(null)}
                style={{width:"100%",background:accent,border:"none",borderRadius:10,
                  color:"#fff",padding:"12px 0",cursor:"pointer",fontWeight:800,fontSize:14}}>
                Fatto
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
// #endregion


// #region SEZIONE 17: MODELLI VIEW
// ═══════════════════════════════════════════════════════════════
  const modelliView = (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      {(()=>{
        const calAttivo = store.calendars.find(c=>c.id===calId);
        const nomeCal = calId===null ? "TUTTI" : (calAttivo?.name||"Calendario");
        const coloreCal = calAttivo?.color||accent;
        function hexToRgb(hex){
          const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
          return {r,g,b};
        }
        function luminance({r,g,b}){
          const a=[r,g,b].map(v=>{ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); });
          return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
        }
        function contrastColor(hex){
          try {
            const rgb=hexToRgb(hex);
            const lum=luminance(rgb);
            return lum < 0.35 ? "#ffffff" : "#0f172a";
          } catch(e){ return "#ffffff"; }
        }
        const testoContrasto = calId===null ? T.text : contrastColor(coloreCal);
        return (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 8px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:24,fontWeight:900,fontFamily:"Georgia,serif",color:T.text}}>Modelli</div>
              <CalBadge calId={calId} calAttivo={calAttivo} coloreCal={coloreCal}
                testoContrasto={testoContrasto} T={T} store={store} setStore={setStore}
                updateCalendar={updateCalendar} accent={accent} setCalId={setCalId}/>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",position:"relative"}}>
              {modelliTab==="turni"&&(
              <button onClick={()=>setModalitaSpostamento(s=>!s)}
                title={modalitaSpostamento?"Spostamento attivo — tocca per tornare a scorrere normalmente":"Attiva per trascinare e riordinare i modelli col dito"}
                style={{background:modalitaSpostamento?accent:T.s2,
                  border:`1.5px solid ${modalitaSpostamento?accent:T.border}`,borderRadius:8,
                  padding:"6px 10px",fontSize:18,fontWeight:700,cursor:"pointer",
                  color:modalitaSpostamento?"#fff":T.sub,
                  transition:"background 0.12s ease, border-color 0.12s ease"}}>↑↓</button>
              )}
              {modelliTab!=="colori"&&(
              <button onClick={()=>{
                if(modelliTab==="turni"){
                  setEditModello(null);
                  setModelForm({titolo:"",tempo:"6h15",inizio:"",fine:"",coloreCustom:null,posizione:"",calendarId:calId});
                  setShowModelForm(true);
                } else {
                  setEditRotazione(null);
                  setRotForm({tipo:"personalizzata",titolo:"",dataInizio:"",nSettimane:52,modellaLavoroId:null,modelloNLId:null,modelloRSId:null});
                  setShowRotForm(true);
                }
              }} style={{background:accent,border:"none",borderRadius:8,padding:"6px 16px",
                fontSize:20,fontWeight:800,cursor:"pointer",color:"#fff"}}>+</button>
              )}
              {showSortMenu&&(
                <div style={{position:"absolute",top:40,right:0,background:T.surface,
                  border:`1px solid ${T.border}`,borderRadius:12,padding:8,zIndex:200,
                  minWidth:190,boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}
                  onClick={e=>e.stopPropagation()}>
                  {[["orario","Ordina per orario"],["manuale","Ordine manuale"]].map(([v,l])=>(
                    <div key={v} onClick={()=>{setModelliSort(v);setShowSortMenu(false);}}
                      style={{padding:"10px 12px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,
                        background:modelliSort===v?accent+"22":"transparent",
                        color:modelliSort===v?accent:T.text}}>
                      {modelliSort===v?"✓  ":"    "}{l}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div style={{display:"flex",margin:"0 12px 12px",background:T.s2,borderRadius:14,padding:4,gap:4}}>
        {[["turni","Turni"],["rotazioni","Rotazioni"],["colori","Colori"]].map(([v,l])=>(
          <button key={v} onClick={()=>setModelliTab(v)}
            style={{flex:1,padding:"9px 0",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:14,
              background:modelliTab===v?(dark?"#0f172a":"#fff"):"transparent",
              color:modelliTab===v?T.text:T.sub,
              boxShadow:modelliTab===v?"0 2px 8px rgba(0,0,0,0.12)":"none"}}>{l}</button>
        ))}
      </div>
      {store.calendars.length>0&&calId&&(
        <div style={{margin:"0 12px 10px",background:store.calendars.find(c=>c.id===calId)?.color+"22"||"#3b82f622",
          border:`1px solid ${store.calendars.find(c=>c.id===calId)?.color+"55"||"#3b82f655"}`,
          borderRadius:10,padding:"6px 12px",fontSize:12,
          color:store.calendars.find(c=>c.id===calId)?.color||accent,fontWeight:700}}>
           Modelli di: {store.calendars.find(c=>c.id===calId)?.name||""}
        </div>
      )}

      <div ref={modelliScrollRef} style={{flex:1,overflowY:"auto",padding:"0 12px 80px"}}>
        {modelliTab==="turni"&&(()=>{
          const modelliVisibili = calId===null
            ? modelliOrdinati
            : calcolaOrdineModelli(modelli.filter(m=>{
                const mcid = m.calendarId||mainCalId;
                return mcid===calId;
              }));
          return modelliVisibili.length===0?(
            <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
              <div style={{fontSize:36,marginBottom:10}}>📋</div>
              <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessun modello</div>
              <div style={{fontSize:13}}>Premi + per creare il tuo primo modello turno</div>
            </div>
          ):(
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              {modelliVisibili.map((m,i,arr)=>(
                <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                  <ModelloCard m={m} T={T} accent={accent} fasceAutomatiche={fasceAutomatiche}
                    // La modalità selezione multipla (checkbox) resta legata a editMode
                    // (serve per azioni di gruppo, es. eliminazione multipla), ma le
                    // frecce ▲▼ e il drag & drop per il riordino devono essere SEMPRE
                    // disponibili nella lista Modelli, indipendentemente da editMode:
                    // prima erano condizionate allo stesso flag e sparivano di default.
                    selectMode={!editMode}
                    selected={selectedModelloIds.includes(m.id)}
                    onToggleSelect={()=>setSelectedModelloIds(prev=>prev.includes(m.id)?prev.filter(id=>id!==m.id):[...prev,m.id])}
                    onEdit={()=>{ setEditModello(m); setModelForm({
                      ...m,
                      categoria:(m.categoria==="primo"||m.categoria==="secondo")?m.categoria:"",
                      categoriaAppAuto:(m.categoria_app_auto==="app"||m.categoria_app_auto==="auto")?m.categoria_app_auto:((m.categoria==="app"||m.categoria==="auto")?m.categoria:""),
                      turnoVuoto: !!m.categoria_turno_vuoto,
                      appAutoVuoto: !!m.categoria_app_auto_vuoto
                    }); setShowModelForm(true); }}
                    onDelete={()=>deleteModello(m.id)}
                    // Frecce ▲▼: sempre disponibili, spostano di UNA posizione
                    // nell'elenco realmente visibile (modelliVisibili, filtrato
                    // per calendario se un calendario specifico è selezionato).
                    onMoveUp={modalitaSpostamento&&i>0?()=>moveH24(m.id,"up",calId):null}
                    onMoveDown={modalitaSpostamento&&i<arr.length-1?()=>moveH24(m.id,"down",calId):null}
                    // Drag & drop: sempre disponibile, per spostamenti più ampi.
                    isDragging={draggingId===m.id}
                    isDropTarget={dragOverId===m.id && draggingId!==m.id}
                    onTouchStart={modalitaSpostamento?()=>{ touchSrcId.current=m.id; setDraggingId(m.id); }:null}
                    onTouchMove={modalitaSpostamento?(e)=>{
                      e.preventDefault();
                      const t=e.touches[0];
                      updateAutoScroll(t.clientY);
                      const el=document.elementFromPoint(t.clientX,t.clientY);
                      const card=el?.closest("[data-modello-id]");
                      if(card){
                        const id=card.getAttribute("data-modello-id");
                        touchTargetId.current=id;
                        if(dragOverId!==id) setDragOverId(id);
                      }
                    }:null}
                    onTouchEnd={modalitaSpostamento?async()=>{
                      stopAutoScroll();
                      await reorderModelli(touchSrcId.current, touchTargetId.current, calId);
                      touchSrcId.current=null; touchTargetId.current=null;
                      setDraggingId(null); setDragOverId(null);
                    }:null}
                    // Il drag col mouse (HTML5 drag&drop nativo) è notoriamente
                    // inaffidabile nel calcolare "su quale card sto passando" quando
                    // si aggiorna lo state ad ogni dragover su liste con molte righe:
                    // gli eventi possono arrivare fuori ordine o essere persi durante
                    // i re-render, causando drop sulla card sbagliata ("a casaccio").
                    // Soluzione: uso la stessa tecnica del touch — leggo le coordinate
                    // del cursore e trovo la card realmente sotto il puntatore con
                    // elementFromPoint, invece di fidarmi di quale card ha generato
                    // l'evento onDragOver/onDrop. Così mouse e touch condividono
                    // esattamente la stessa logica di targeting, niente più divergenze.
                    onDragStart={(e)=>{
                      dragSrcId.current=m.id;
                      dragTargetId.current=m.id;
                      setDraggingId(m.id);
                      if(e?.dataTransfer){ e.dataTransfer.effectAllowed="move"; try{e.dataTransfer.setData("text/plain",m.id);}catch(_){} }
                    }}
                    onDragOver={(e)=>{
                      e.preventDefault();
                      updateAutoScroll(e.clientY);
                      const el=document.elementFromPoint(e.clientX,e.clientY);
                      const card=el?.closest("[data-modello-id]");
                      const id=card?card.getAttribute("data-modello-id"):m.id;
                      dragTargetId.current=id;
                      if(dragOverId!==id) setDragOverId(id);
                    }}
                    onDrop={async(e)=>{
                      stopAutoScroll();
                      // Uso sempre dragTargetId (calcolato via elementFromPoint),
                      // MAI l'id della card che ha ricevuto l'evento onDrop: quella
                      // può non coincidere con la posizione reale del cursore quando
                      // il drag nativo perde precisione su liste lunghe.
                      await reorderModelli(dragSrcId.current, dragTargetId.current, calId);
                      dragSrcId.current=null; dragTargetId.current=null;
                      setDraggingId(null); setDragOverId(null);
                    }}
                    onDragEnd={()=>{
                      // Copre il caso di drag rilasciato fuori da una card valida
                      // (es. fuori dalla lista): ripulisce comunque lo stato visivo.
                      stopAutoScroll();
                      dragSrcId.current=null; dragTargetId.current=null;
                      setDraggingId(null); setDragOverId(null);
                    }}/>
                </div>
              ))}
            </div>
          );
        })()}
        {modelliTab==="turni"&&!editMode&&selectedModelloIds.length>0&&(
          <div style={{position:"sticky",bottom:0,background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:14,padding:"10px 14px",marginTop:10,display:"flex",alignItems:"center",
            justifyContent:"space-between",boxShadow:"0 -4px 16px rgba(0,0,0,0.08)"}}>
            <span style={{fontSize:13,fontWeight:700,color:T.text}}>{selectedModelloIds.length} selezionati</span>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setSelectedModelloIds([])}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                  color:T.sub,padding:"7px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                Annulla
              </button>
              {selectedModelloIds.length===1&&(
                <button onClick={()=>{
                    const m=modelli.find(x=>x.id===selectedModelloIds[0]);
                    if(m){ setEditModello(m); setModelForm({
                      ...m,
                      categoria:(m.categoria==="primo"||m.categoria==="secondo")?m.categoria:"",
                      categoriaAppAuto:(m.categoria_app_auto==="app"||m.categoria_app_auto==="auto")?m.categoria_app_auto:((m.categoria==="app"||m.categoria==="auto")?m.categoria:""),
                      turnoVuoto: !!m.categoria_turno_vuoto,
                      appAutoVuoto: !!m.categoria_app_auto_vuoto
                    }); setShowModelForm(true); setSelectedModelloIds([]); }
                  }}
                  style={{background:accent,border:"none",borderRadius:8,
                    color:"#fff",padding:"7px 14px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                  ✏️ Modifica
                </button>
              )}
              <button onClick={async()=>{
                  if(!window.confirm(`Eliminare ${selectedModelloIds.length} modelli selezionati?`)) return;
                  for(const id of selectedModelloIds) await deleteModello(id);
                  setSelectedModelloIds([]);
                }}
                style={{background:"#ef4444",border:"none",borderRadius:8,
                  color:"#fff",padding:"7px 14px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                🗑️ Elimina
              </button>
            </div>
          </div>
        )}
        {modelliTab==="rotazioni"&&(
          <div style={{paddingBottom:80}}>
            {rotazioni.length===0?(
              <div style={{textAlign:"center",padding:"32px 24px",color:T.sub}}>
                <div style={{fontSize:36,marginBottom:10}}>🔄</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessuna rotazione</div>
                <div style={{fontSize:12,marginBottom:12}}>Premi + per creare una rotazione</div>
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:12,textAlign:"left"}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.sub,marginBottom:8}}>TIPI DISPONIBILI</div>
                  {[
                    ["🗓 Domeniche 1/4","1 domenica lavoro (festivo) + 3 riposo ogni 4 settimane"],
                    ["📅 RS/NL Scalante","RS venerdì→NL+7gg, poi giovedì, poi mercoledì... (salta domenica)"],
                    ["🔄 NL/RS classico","NL e RS a rotazione settimanale scalante"],
                    ["📋 Personalizzata","Griglia libera giorno per giorno"],
                  ].map(([t,d])=>(
                    <div key={t} style={{marginBottom:8}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.text}}>{t}</div>
                      <div style={{fontSize:11,color:T.sub}}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            ):(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                {rotazioni.map((r,i,arr)=>(
                  <div key={r.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <RotazioneCard r={r} T={T} accent={accent} modelli={
                        modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId)
                      }
                      onOpen={()=>setShowRotDetail(r.id)}
                      onEdit={()=>{ setEditRotazione(r); setRotForm({
                        tipo:r.tipo, titolo:r.titolo||"", dataInizio:r.dataInizio||"",
                        nSettimane:r.nSettimane||52, modellaLavoroId:r.modellaLavoroId||null,
                        modelloNLId:r.modelloNLId||null, modelloRSId:r.modelloRSId||null,
                      }); setShowRotForm(true); }}
                      onDelete={()=>deleteRotazione(r.id)}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {modelliTab==="colori"&&(()=>{
          const fasceColorSet = new Set([...fasceAutomatiche.map(f=>f.color), COLORE_H24]);
          const coloriUsatiDaModelli = [...new Set(modelli.map(m=>m.coloreCustom).filter(Boolean))]
            .filter(h=>!fasceColorSet.has(h));
          const coloriManuali = [...new Set([...coloriExtra, ...coloriUsatiDaModelli])]
            .filter(h=>!fasceColorSet.has(h));
          function contaModelli(hex){ return modelli.filter(m=>m.coloreCustom===hex).length; }
          function contaModelliFascia(fascia){
            return modelli.filter(m=>{
              if(m.coloreCustom) return m.coloreCustom===fascia.color;
              if(fascia.key==="notte") return m.tempo==="h24"?false:(!m.inizio?false:colByTime(m.inizio)===fascia.color);
              return m.tempo!=="h24" && m.inizio && colByTime(m.inizio)===fascia.color;
            }).length;
          }
          const contaH24 = modelli.filter(m=>m.coloreCustom ? m.coloreCustom===COLORE_H24 : m.tempo==="h24").length;
          return (
            <div style={{paddingBottom:80}}>
              <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>
                COLORI AUTOMATICI (per fascia oraria)
              </div>
              <div style={{fontSize:11,color:T.sub,marginBottom:8,paddingLeft:4}}>
                Modifica orari e colori delle fasce da Impostazioni. Tocca un colore per riassegnarlo ai modelli.
              </div>
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
                {fasceAutomatiche.map((f,i,arr)=>(
                  <div key={f.key} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <ColorRow T={T} hex={f.color} label={f.label} sub="Automatico per orario"
                      count={contaModelliFascia(f)} onClick={()=>setShowColorAssignPicker(f.color)}/>
                  </div>
                ))}
                <div style={{borderTop:`1px solid ${T.border}`}}>
                  <ColorRow T={T} hex={COLORE_H24} label="H24" sub="Standard turni H24"
                    count={contaH24} onClick={()=>setShowColorAssignPicker(COLORE_H24)}/>
                </div>
              </div>

              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,paddingLeft:4}}>
                <div style={{fontSize:11,color:T.sub,fontWeight:700}}>COLORI PERSONALIZZATI</div>
                <button onClick={()=>setShowAddColorPicker(true)}
                  style={{background:accent,border:"none",borderRadius:8,padding:"4px 12px",
                    fontSize:16,fontWeight:800,cursor:"pointer",color:"#fff"}}>+</button>
              </div>
              {coloriManuali.length===0?(
                <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
                  Nessun colore personalizzato. Premi + oppure crea un modello con colore custom.
                </div>
              ):(
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                  {coloriManuali.map((hex,i,arr)=>(
                    <div key={hex} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <ColorRow T={T} hex={hex} label={hex.toUpperCase()} sub="Personalizzato"
                        count={contaModelli(hex)} onClick={()=>setShowColorAssignPicker(hex)}
                        onRemove={contaModelli(hex)===0?()=>removeColoreExtra(hex):null}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {showAddColorPicker&&(
        <ColorPickerModal T={T} cur="#3b82f6" title="Aggiungi colore"
          onPick={p=>{addColoreExtra(p);setShowAddColorPicker(false);}}
          onClose={()=>setShowAddColorPicker(false)}/>
      )}

      {showColorAssignPicker&&(()=>{
        const hex = showColorAssignPicker;
        const isFascia = fasceAutomatiche.some(f=>f.color===hex) || hex===COLORE_H24;
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:600,
            display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
              <button onClick={()=>setShowColorAssignPicker(null)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
              <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}
                onClick={()=>setShowEditFasciaColor(hex)}
                title="Tocca per cambiare questo colore con la palette">
                <div style={{width:18,height:18,borderRadius:"50%",background:hex,border:`1px solid ${T.border}`}}/>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>{hex.toUpperCase()}</div>
                <span style={{fontSize:12,color:accent}}>🎨</span>
              </div>
              <div style={{width:32}}/>
            </div>
            {isFascia&&(
              <div style={{padding:"10px 16px",fontSize:12,color:T.sub,background:T.s2}}>
                Colore automatico. Assegnando qui un modello, quel modello userà sempre questo
                colore. Tocca l'hex in alto per cambiare il colore stesso con la palette condivisa
                (si aggiorna ovunque sia usato).
              </div>
            )}
            <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
              {modelli.length===0?(
                <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                  Nessun modello creato ancora.
                </div>
              ):(
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                  {modelliOrdinati.map((m,i,arr)=>{
                    const matchAuto = !m.coloreCustom && (
                      (m.tempo==="h24" && hex===COLORE_H24) ||
                      (m.tempo!=="h24" && m.inizio && colByTime(m.inizio)===hex)
                    );
                    const selezionato = m.coloreCustom===hex || matchAuto;
                    const coloreAttuale = m.coloreCustom||colByTime(m.inizio);
                    return (
                      <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                        <div onClick={()=>{
                          saveModello({...m, coloreCustom: selezionato ? null : hex});
                        }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                          <div style={{width:20,height:20,borderRadius:6,marginRight:12,flexShrink:0,
                            border:`2px solid ${selezionato?hex:T.border}`,
                            background:selezionato?hex:"transparent",
                            display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {selezionato&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
                          </div>
                          <div style={{width:10,height:10,borderRadius:"50%",background:coloreAttuale,marginRight:10,flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:15,fontWeight:700,color:T.text}}>{m.titolo||"Senza nome"}</div>
                            <div style={{fontSize:11,color:T.sub}}>
                              {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.fine?` - ${m.fine}`:""}`:""}
                              {m.coloreCustom&&!selezionato?" · colore personalizzato diverso":""}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{padding:12,borderTop:`1px solid ${T.border}`,background:T.surface}}>
              <button onClick={()=>setShowColorAssignPicker(null)}
                style={{width:"100%",background:accent,border:"none",borderRadius:10,
                  color:"#fff",padding:"12px 0",cursor:"pointer",fontWeight:800,fontSize:14}}>
                Fatto
              </button>
            </div>
          </div>
        );
      })()}

      {showEditFasciaColor&&(
        <ColorPickerModal T={T} cur={showEditFasciaColor} title="Cambia colore"
          coloriUsati={[...new Set(modelli.map(m=>m.coloreCustom||(m.tempo==="h24"?COLORE_H24:colByTime(m.inizio))).filter(Boolean))].filter(h=>h!==showEditFasciaColor)}
          onPick={async(p)=>{
            const old = showEditFasciaColor;
            setShowColorAssignPicker(p);
            await replaceColoreEverywhere(old, p);
          }}
          onClose={()=>setShowEditFasciaColor(null)}/>
      )}

      {showRotForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,
          display:"flex",alignItems:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowRotForm(false);}}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",maxHeight:"92vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 0"}}>
              <button onClick={()=>setShowRotForm(false)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer",padding:4}}>‹</button>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>
                {editRotazione?"Modifica rotazione":"Nuova rotazione"}
              </div>
              <div style={{width:32}}/>
            </div>
            <RotazioneForm T={T} form={rotForm} setForm={setRotForm} accent={accent} modelli={
                modelli.filter(m=>(m.calendarId||mainCalId)===calId)
              }
              sortedModelli={
                modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId)
              }
              onSave={()=>{ saveRotazione({...rotForm,id:editRotazione?.id}); setShowRotForm(false); }}/>
          </div>
        </div>
      )}

      {showRotDetail&&(()=>{
        const rot=rotazioni.find(r=>r.id===showRotDetail);
        if(!rot) return null;
        return (
          <div style={{position:"fixed",inset:0,background:T.bg,zIndex:400,display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"16px 16px 8px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
              <button onClick={()=>setShowRotDetail(null)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>{rot.titolo||"Rotazione"}</div>
                <div style={{fontSize:12,color:T.sub}}>
                  {rot.tipo==="domeniche" && rot.dataInizio
                    ? `${rot.nSettimane || 52} settimane (${Math.ceil((rot.nSettimane || 52)/4)} domeniche di lavoro)`
                    : `${Object.values(rot.griglia||{}).filter(Boolean).length} giorni configurati`}
                </div>
              </div>
              <button onClick={()=>{
                let grigliaFinale = {...(rot.griglia||{})};
                if(rot.tipo==="domeniche" && rot.dataInizio && rot.modellaLavoroId){
                  const inizio = new Date(rot.dataInizio);
                  let d = new Date(inizio);
                  while(d.getDay()!==0) d.setDate(d.getDate()+1);
                  for(let i=0;i<(rot.nSettimane||52);i++){
                    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                    if(i%4===0) grigliaFinale[k]=rot.modellaLavoroId;
                    d.setDate(d.getDate()+7);
                  }
                }
                updateGrigliaRotazione(rot.id, grigliaFinale);
                setShowRotDetail(null);
              }}
                style={{background:accent,border:"none",borderRadius:8,color:"#fff",
                  padding:"6px 14px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Fatto</button>
            </div>
            <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
              {(()=>{
                const modelliDelCalRot = modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId);
                return (<>
              {rot.tipo==="personalizzata"&&(
                <GrigliaRotazione rot={rot} T={T} accent={accent} modelli={modelliDelCalRot} fasceAutomatiche={fasceAutomatiche}
                  onUpdate={griglia=>setRotazioni(prev=>prev.map(r=>r.id===rot.id?{...r,griglia}:r))}/>
              )}
              {rot.tipo==="domeniche"&&(
                <DomenicheView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot} fasceAutomatiche={fasceAutomatiche}
                  onUpdate={griglia=>setRotazioni(prev=>prev.map(r=>r.id===rot.id?{...r,griglia}:r))}/>
              )}
              {rot.tipo==="nlrs"&&(
                <NLRSView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot}/>
              )}
              {rot.tipo==="nlrs_scalante"&&(
                <NLRSScalanteView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot}/>
              )}
                </>);
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );
// #endregion


// #region SEZIONE 18: SETTINGS VIEW
// ═══════════════════════════════════════════════════════════════
  function updateFascia(key, updates){
    const nuove = fasceAutomatiche.map(f=>f.key===key?{...f,...updates}:f);
    setStore(s=>({...s, fasceAutomatiche:nuove}));
    saveSettings({fasce_automatiche:nuove});
  }
  function timeToMins(t){ const mins=oraInMinuti(t); return mins===null?0:mins; }
  function minsToTime(m){ m=((m%1440)+1440)%1440; return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

  const settingsView = (
    <div style={{flex:1,overflowY:"auto",padding:"12px 12px 80px",color:T.text}}>
      <div style={{fontSize:18,fontWeight:900,fontFamily:"Georgia,serif",marginBottom:14}}>Impostazioni</div>
      <Sec label="ACCOUNT" T={T}>
        <div style={{fontSize:12,color:T.sub,marginBottom:10}}>{session?.user?.email}</div>
        <button onClick={handleLogout}
          style={{width:"100%",background:"#ef4444",border:"none",borderRadius:10,
            color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
          🚪 Logout
        </button>
      </Sec>
      <Sec label="TEMA" T={T}>
        <div style={{display:"flex",gap:6}}>
          {[["auto","Auto"],["light","Chiaro"],["dark","Scuro"]].map(([v,l])=>(
            <button key={v} onClick={()=>{
              setStore(s=>({...s,theme:v}));
              saveSettings({theme:v, extra_hols:store.extraHols});
            }}
              style={{flex:1,padding:"9px 4px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:11,
                background:store.theme===v?(v==="light"?"#f8fafc":v==="dark"?"#0f172a":"#6366f1"):T.s2,
                color:store.theme===v?(v==="light"?"#0f172a":"#fff"):T.sub,
                border:`2px solid ${store.theme===v?"#6366f1":T.border}`}}>{l}</button>
          ))}
        </div>
      </Sec>

      <SecCollapsible label="FASCE ORARIE AUTOMATICHE" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Personalizza nome, orario e colore delle 4 fasce usate per colorare automaticamente i modelli.
        </div>
        {fasceAutomatiche.map((f,fi)=>(
          <div key={f.key} style={{background:T.s2,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div onClick={()=>setShowFasciaColorPicker(showFasciaColorPicker===f.key?null:f.key)}
                  style={{width:26,height:26,borderRadius:"50%",background:f.color,
                    border:`2px solid ${T.border}`,cursor:"pointer"}}/>
                {showFasciaColorPicker===f.key&&(
                  <ColorPickerModal T={T} cur={f.color} title={`Colore ${f.label}`}
                    coloriUsati={[...new Set(modelli.map(m=>m.coloreCustom||(m.tempo==="h24"?COLORE_H24:colByTime(m.inizio))).filter(Boolean))]}
                    onPick={p=>{ updateFascia(f.key,{color:p}); }}
                    onClose={()=>setShowFasciaColorPicker(null)}/>
                )}
              </div>
              <input value={f.label} onChange={e=>updateFascia(f.key,{label:e.target.value.toUpperCase()})}
                style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,
                  padding:"7px 10px",color:T.text,fontSize:13,fontWeight:700,outline:"none"}}/>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:9,color:T.sub,marginBottom:3}}>DALLE</div>
                <input type="time" value={minsToTime(f.from)}
                  onChange={e=>updateFascia(f.key,{from:timeToMins(e.target.value)})}
                  style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,
                    padding:"6px 8px",color:T.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:9,color:T.sub,marginBottom:3}}>ALLE</div>
                <input type="time" value={minsToTime(f.to)}
                  onChange={e=>updateFascia(f.key,{to:timeToMins(e.target.value)})}
                  style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,
                    padding:"6px 8px",color:T.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>
        ))}
        <button onClick={()=>{
          setStore(s=>({...s, fasceAutomatiche:FASCE_AUTOMATICHE_DEFAULT}));
          saveSettings({fasce_automatiche:FASCE_AUTOMATICHE_DEFAULT});
        }} style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,
          color:T.sub,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
          ↩ Ripristina fasce predefinite
        </button>
      </SecCollapsible>

      <SecCollapsible label="CALENDARI" T={T}>
        {store.calendars.map((c,ci)=>(
          <div key={c.id} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:T.s2,borderRadius:10,padding:"8px 10px"}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:c.color,
                  border:`2px solid ${T.border}`,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();setPal(pal===c.id?null:c.id);}}/>
                {pal===c.id&&<ColorPickerModal T={T} cur={c.color} title={`Colore ${c.name||"calendario"}`}
                  coloriUsati={[...new Set(store.calendars.map(cc=>cc.color).filter(Boolean))]}
                  onPick={p=>{
                  const newCals=JSON.parse(JSON.stringify(store.calendars));
                  newCals[ci].color=p;
                  setStore(s=>({...s,calendars:newCals}));
                  updateCalendar(c.id,{color:p});
                }}
                  onClose={()=>setPal(null)}/>}
              </div>
              <input value={c.name}
                onChange={e=>{const newCals=JSON.parse(JSON.stringify(store.calendars));newCals[ci].name=e.target.value;setStore(s=>({...s,calendars:newCals}));}}
                onBlur={e=>updateCalendar(c.id,{name:e.target.value})}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:13,fontWeight:700}}/>
              <button onClick={async()=>{
                const newCals=store.calendars.map((x,j)=>({...x,isMain:j===ci}));
                setStore(s=>({...s,calendars:newCals}));
                for(const cal of store.calendars) await updateCalendar(cal.id,{is_main:cal.id===c.id});
              }} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:c.isMain?"#f59e0b":T.sub}}>★</button>
              <button onClick={async()=>{
                if(ci===0) return;
                const newCals=[...store.calendars];
                [newCals[ci-1],newCals[ci]]=[newCals[ci],newCals[ci-1]];
                setStore(s=>({...s,calendars:newCals}));
                for(let i=0;i<newCals.length;i++) await updateCalendar(newCals[i].id,{sort_order:i});
              }} style={{background:"none",border:"none",color:ci===0?T.border:T.sub,cursor:ci===0?"default":"pointer",fontSize:20,padding:"0 4px"}}>↑</button>
              <button onClick={async()=>{
                if(ci===store.calendars.length-1) return;
                const newCals=[...store.calendars];
                [newCals[ci],newCals[ci+1]]=[newCals[ci+1],newCals[ci]];
                setStore(s=>({...s,calendars:newCals}));
                for(let i=0;i<newCals.length;i++) await updateCalendar(newCals[i].id,{sort_order:i});
              }} style={{background:"none",border:"none",color:ci===store.calendars.length-1?T.border:T.sub,cursor:ci===store.calendars.length-1?"default":"pointer",fontSize:20,padding:"0 4px"}}>↓</button>
              <button onClick={()=>setExCal(exCal===c.id?null:c.id)}
                style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12}}>
                {exCal===c.id?"▲":"▼"}</button>
              <button onClick={async()=>{
                if(!window.confirm(`Eliminare il calendario "${c.name}"? Tutti gli eventi associati verranno persi.`)) return;
                await deleteCalendar(c.id);
                const newCals=store.calendars.filter(x=>x.id!==c.id);
                setStore(s=>({...s,calendars:newCals}));
                syncSeAttivo(store.events,newCals);
              }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18}}>×</button>
            </div>
            {exCal===c.id&&(
              <div style={{background:T.s2,borderRadius:"0 0 10px 10px",padding:"10px",borderTop:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,color:T.sub,fontWeight:700,marginBottom:8}}>TURNI PREDEFINITI</div>
                {(c.shifts||[]).map((sh,si)=>(
                  <div key={sh.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <div style={{position:"relative",flexShrink:0}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:sh.color,cursor:"pointer"}}
                        onClick={e=>{e.stopPropagation();setPal(pal===sh.id?null:sh.id);}}/>
                      {pal===sh.id&&<ColorPickerModal T={T} cur={sh.color} title={`Colore ${sh.label||"turno"}`}
                        coloriUsati={[...new Set((c.shifts||[]).map(s2=>s2.color).filter(Boolean))]}
                        onPick={p=>{
                        const newCals=JSON.parse(JSON.stringify(store.calendars));
                        newCals[ci].shifts[si].color=p;
                        setStore(s=>({...s,calendars:newCals}));
                        updateCalendar(c.id,{shifts:newCals[ci].shifts});
                      }}
                        onClose={()=>setPal(null)}/>}
                    </div>
                    <input value={sh.label}
                      onChange={e=>{const newCals=JSON.parse(JSON.stringify(store.calendars));newCals[ci].shifts[si].label=e.target.value;setStore(s=>({...s,calendars:newCals}));}}
                      onBlur={()=>updateCalendar(c.id,{shifts:store.calendars[ci].shifts})}
                      style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:12}}/>
                    <button onClick={()=>{
                      const newCals=JSON.parse(JSON.stringify(store.calendars));
                      newCals[ci].shifts=newCals[ci].shifts.filter((_,k)=>k!==si);
                      setStore(s=>({...s,calendars:newCals}));
                      updateCalendar(c.id,{shifts:newCals[ci].shifts});
                    }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16}}>×</button>
                  </div>
                ))}
                <div style={{display:"flex",gap:6,alignItems:"center",marginTop:6}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:nsColor,
                      border:`2px solid ${T.border}`,cursor:"pointer"}}
                      onClick={e=>{e.stopPropagation();setPal(pal==="ns"?null:"ns");}}/>
                    {pal==="ns"&&<ColorPickerModal T={T} cur={nsColor} title="Colore nuovo turno"
                      coloriUsati={[...new Set((c.shifts||[]).map(s2=>s2.color).filter(Boolean))]}
                      onPick={p=>setNsColor(p)}
                      onClose={()=>setPal(null)}/>}
                  </div>
                  <input value={nsName} onChange={e=>setNsName(e.target.value)} placeholder="Nome turno..."
                    style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,outline:"none"}}/>
                  <button onClick={()=>{
                    if(!nsName.trim()) return;
                    const newCals=JSON.parse(JSON.stringify(store.calendars));
                    if(!newCals[ci].shifts) newCals[ci].shifts=[];
                    newCals[ci].shifts.push({id:uid(),label:nsName.trim(),color:nsColor});
                    setStore(s=>({...s,calendars:newCals}));
                    updateCalendar(c.id,{shifts:newCals[ci].shifts});
                    setNsName("");
                  }} style={{background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",padding:"7px 12px",cursor:"pointer",fontWeight:800,fontSize:14}}>+</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4}}>
          <div style={{position:"relative",flexShrink:0}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:ncColor,
              border:`2px solid ${T.border}`,cursor:"pointer"}}
              onClick={e=>{e.stopPropagation();setPal(pal==="nc"?null:"nc");}}/>
            {pal==="nc"&&<ColorPickerModal T={T} cur={ncColor} title="Colore nuovo calendario"
              coloriUsati={[...new Set(store.calendars.map(cc=>cc.color).filter(Boolean))]}
              onPick={p=>setNcColor(p)}
              onClose={()=>setPal(null)}/>}
          </div>
          <input value={ncName} onChange={e=>setNcName(e.target.value)} placeholder="Nome calendario..."
            style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none"}}/>
          <button onClick={async()=>{
            if(!ncName.trim()) return;
            const isFirst=store.calendars.length===0;
            const dbCal=await addCalendar(ncName.trim(),ncColor,isFirst);
            if(dbCal){
              const newCals=[...store.calendars,{id:dbCal.id,name:dbCal.name,color:dbCal.color,isMain:dbCal.is_main,shifts:[]}];
              setStore(s=>({...s,calendars:newCals}));
              if(!calId) setCalId(dbCal.id);
              syncSeAttivo(store.events,newCals);
            }
            setNcName("");
          }} style={{background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",padding:"8px 14px",cursor:"pointer",fontWeight:800,fontSize:14}}>+</button>
        </div>
      </SecCollapsible>

      <SecCollapsible label="ARCHIVIO GOOGLE SHEETS" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Configura il tuo script Google Sheets per importare ed esportare i dati.
        </div>
        <input value={sheetsUrl} onChange={e=>setSheetsUrl(e.target.value)}
          placeholder="URL Script Google Sheets..."
          style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
            borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none",marginBottom:6,boxSizing:"border-box"}}/>
        <input value={sheetsSecret} onChange={e=>setSheetsSecret(e.target.value)}
          placeholder="Secret Google Sheets..." type="password"
          style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
            borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
        <button onClick={handleSaveSheetsConfig} disabled={syncing}
          style={{width:"100%",background:accent,border:"none",borderRadius:10,
            color:"#fff",padding:"9px 0",cursor:"pointer",fontWeight:800,fontSize:12,marginBottom:8}}>
          {syncing?"⏳ Salvataggio...":"💾 Salva Configurazione Sheets"}
        </button>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={handleSave} disabled={syncing||!sheetsUrl}
            style={{flex:1,background:sheetsUrl?"#16a34a":"#94a3b8",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:sheetsUrl?"pointer":"not-allowed",fontWeight:800,fontSize:12}}>
            {syncing?"⏳ ...":"📤 Esporta su Sheets"}
          </button>
          <button onClick={handleLoad} disabled={syncing||!sheetsUrl}
            style={{flex:1,background:sheetsUrl?"#2563eb":"#94a3b8",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:sheetsUrl?"pointer":"not-allowed",fontWeight:800,fontSize:12}}>
            {syncing?"⏳ ...":"📥 Importa da Sheets"}
          </button>
        </div>
        {sheetsUrl&&(
          <a href="https://docs.google.com/spreadsheets/d/106C8GAh0Ka2WS8O8Ezx0nUnDgX0hyS7Crvixy84uDSA/edit"
            target="_blank" rel="noreferrer"
            style={{display:"block",textAlign:"center",fontSize:11,color:"#16a34a",fontWeight:700,
              textDecoration:"none",background:"#dcfce7",borderRadius:8,padding:"8px 0"}}>
            📊 Apri Google Sheets
          </a>
        )}
        {syncMsg&&<div style={{fontSize:11,color:T.text,padding:"8px 10px",
          background:T.s2,borderRadius:8,textAlign:"center",marginTop:8}}>{syncMsg}</div>}
      </SecCollapsible>

      <SecCollapsible label="DATABASE CLOUD SUPABASE" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Controlla lo stato dei dati memorizzati nel cloud Supabase.
        </div>
        <button onClick={handleViewDbData}
          style={{width:"100%",background:"#475569",border:"none",borderRadius:10,
            color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12,marginBottom:8}}>
          🔍 Visualizza Dati in Supabase
        </button>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={handleExportSupabase}
            style={{flex:1,background:"#16a34a",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📤 Esporta da Supabase
          </button>
          <button onClick={handleOpenImportSupabase}
            style={{flex:1,background:"#2563eb",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📥 Importa su Supabase
          </button>
        </div>
        <button onClick={()=>setShowLocalDataModal(true)}
          style={{width:"100%",background:"#7c3aed",border:"none",borderRadius:10,
            color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
          📱 Visualizza Dati Locali (Telefono)
        </button>
      </SecCollapsible>

      {showLocalDataModal&&(()=>{
        const cached = loadFromLocalStorage();
        const nEvents = cached ? Object.values(cached.events||{}).reduce((sum,calMap)=>
          sum + Object.values(calMap||{}).reduce((s2,arr)=>s2+(arr?.length||0), 0), 0) : 0;
        const nCalendars = cached?.calendars?.length || 0;
        const nModelli = cached?.modelli?.length || 0;
        const ts = cached?.timestamp ? new Date(cached.timestamp).toLocaleString("it-IT") : "Mai";
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,
            display:"flex",alignItems:"flex-end"}}
            onClick={e=>{if(e.target===e.currentTarget)setShowLocalDataModal(false);}}>
            <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
              maxWidth:480,margin:"0 auto",padding:"16px"}}
              onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>Dati salvati su questo dispositivo</div>
                <button onClick={()=>setShowLocalDataModal(false)}
                  style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>×</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,background:T.s2,borderRadius:10,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Eventi/turni salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nEvents}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Calendari salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nCalendars}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Modelli salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nModelli}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Ultimo salvataggio:</span>
                  <span style={{fontWeight:800,color:T.text}}>{ts}</span>
                </div>
              </div>
              <div style={{fontSize:11,color:T.sub,marginTop:10,textAlign:"center"}}>
                Questa è solo una cache locale di sicurezza. I dati reali e definitivi sono su Supabase.
              </div>
            </div>
          </div>
        );
      })()}

      {showBackupsModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,
          display:"flex",alignItems:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowBackupsModal(false);}}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",maxHeight:"80vh",overflowY:"auto",padding:"16px"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>Backup disponibili</div>
              <button onClick={()=>setShowBackupsModal(false)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            {backupsList.length===0?(
              <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
                Nessun backup trovato. Usa "Esporta da Supabase" per crearne uno.
              </div>
            ):(
              backupsList.map(b=>(
                <button key={b.id} onClick={()=>handleRestoreBackup(b.id)}
                  style={{display:"block",width:"100%",textAlign:"left",background:T.s2,
                    border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",
                    marginBottom:8,cursor:"pointer",color:T.text,fontSize:13,fontWeight:700}}>
                  📦 {new Date(b.created_at).toLocaleString("it-IT")}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {session?.user?.email==='tesonemgs5@gmail.com'&&(
        <Sec label="STATISTICHE DI UTILIZZO (ADMIN)" T={T}>
          {stats?(
            <div style={{display:"flex",flexDirection:"column",gap:6,background:T.s2,borderRadius:10,padding:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                <span style={{color:T.sub}}>Utenti Registrati Totali:</span>
                <span style={{fontWeight:800,color:T.text}}>{stats.total_users}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                <span style={{color:T.sub}}>Utenti Attivi (ultimi 7 giorni):</span>
                <span style={{fontWeight:800,color:"#22c55e"}}>{stats.active_users_7d}</span>
              </div>
            </div>
          ):(
            <div style={{fontSize:11,color:T.sub,textAlign:"center",padding:6}}>⏳ Caricamento statistiche...</div>
          )}
        </Sec>
      )}

      <Sec label="FESTIVI LOCALI" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:8}}>
          Domeniche e festivi nazionali italiani sono già in rosso automaticamente.
        </div>
        {(store.extraHols||[]).map((h,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,
            background:T.s2,borderRadius:8,padding:"6px 10px",marginBottom:6}}>
            <span style={{flex:1,fontSize:12,color:T.text}}>🎉 {h.name} — {h.d}/{h.m}</span>
            <button onClick={()=>{
              const newH=(store.extraHols||[]).filter((_,j)=>j!==i);
              setStore(s=>({...s,extraHols:newH}));
              saveSettings({theme:store.theme,extra_hols:newH});
            }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16}}>×</button>
          </div>
        ))}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <input value={nhName} onChange={e=>setNhName(e.target.value)} placeholder="Nome..."
            style={{flex:2,minWidth:100,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,outline:"none"}}/>
          <input value={nhD} onChange={e=>setNhD(e.target.value)} placeholder="GG" type="number"
            style={{width:50,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 6px",color:T.text,fontSize:12,outline:"none",textAlign:"center"}}/>
          <input value={nhM} onChange={e=>setNhM(e.target.value)} placeholder="MM" type="number"
            style={{width:50,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 6px",color:T.text,fontSize:12,outline:"none",textAlign:"center"}}/>
          <button onClick={()=>{
            if(!nhName.trim()||!nhD||!nhM) return;
            const newH=[...(store.extraHols||[]),{name:nhName.trim(),d:nhD,m:nhM}];
            setStore(s=>({...s,extraHols:newH}));
            saveSettings({theme:store.theme,extra_hols:newH});
            setNhName(""); setNhD(""); setNhM("");
          }} style={{background:"#ef4444",border:"none",borderRadius:8,
            color:"#fff",padding:"7px 12px",cursor:"pointer",fontWeight:800}}>+</button>
        </div>
      </Sec>
    </div>
  );
// #endregion


// #region SEZIONE 19: DAY MODAL
// ═══════════════════════════════════════════════════════════════
  const soloConsultazione = !editMode && selectedCalIds.length>1;
  const curEvts = dayKey ? (soloConsultazione ? allEvts(dayKey).filter(e=>selectedCalIds.includes(e._cid)) : getEvts(dayKey,calId)) : [];
  const dayModal = dayKey&&(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,
      display:"flex",alignItems:"center"}}
      onClick={e=>{if(e.target===e.currentTarget){setDayKey(null);setForm(null);setPal(null);}}}>
      <div style={{background:T.surface,borderRadius:18,width:"100%",
        maxWidth:480,margin:"auto",padding:"19.2px 16.8px 38.4px",maxHeight:"88vh",overflowY:"auto",fontSize:"1.2em"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{fontSize:19,fontWeight:900,color:T.text}}>{fmtDataIT(dayKey)}</div>
            <div style={{fontSize:13,color:accent,fontWeight:700}}>{activeCal?.name||"Seleziona un calendario"}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {!form&&activeCal&&!soloConsultazione&&(
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setShowModelloPicker(true)}
                  style={{background:accent,border:"none",borderRadius:8,
                    color:"#fff",fontSize:16,fontWeight:800,padding:"8px 17px",cursor:"pointer"}}>
                  + Modello
                </button>
                <button onClick={()=>setShowRotazionePicker(true)}
                  style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                    color:T.text,fontSize:16,fontWeight:800,padding:"8px 17px",cursor:"pointer"}}>
                  🔄 Rotazioni
                </button>
              </div>
            )}
            <button onClick={()=>{setDayKey(null);setForm(null);}}
              style={{background:T.s2,border:"none",borderRadius:8,
                color:T.sub,width:38,height:38,cursor:"pointer",fontSize:22}}>×</button>
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {store.calendars.map(c=>{
            const n=getEvts(dayKey,c.id).length;
            return (
              <button key={c.id} onClick={()=>setCalId(c.id)}
                style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",
                  background:calId===c.id?c.color+"33":T.s2,
                  border:`1.5px solid ${calId===c.id?c.color:T.border}`,
                  borderRadius:8,padding:"4px 12px"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:c.color}}/>
                <span style={{fontSize:13,color:T.text,fontWeight:600}}>
                  {c.name}{n>0?` (${n})`:""}</span>
              </button>
            );
          })}
        </div>
        {curEvts.length===0&&!form&&(
          <div style={{textAlign:"center",color:T.sub,padding:"29px 0",fontSize:16}}>
            Nessun evento — premi + Aggiungi
          </div>
        )}
        {curEvts.filter(e=>!form||form.editId!==e.id).map(e=>(
          <div key={e.id} onClick={()=>{
              if(soloConsultazione) return;
              if(form?.editId===e.id){ setForm(null); return; }
              setForm({ editId:e.id, modelloId:null, shiftId:null, label:e.label,
                colorOvr:e.color, dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":"custom", tIn:e.tIn||"", tOut:e.tOut||"",
                place:e.place||"", map:e.map||"", note:e.note||"", collega:e.collega||"", auto:e.auto||"",
                protPagFine:e.protPagFine||"", protRecFine:e.protRecFine||"" });
            }}
            style={{background:e.color,borderRadius:10,padding:"10px 12px",marginBottom:8,cursor:"pointer",
              display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            {(()=>{
              const cardTextColor=getContrastTextColor(e.color);
              const cardSubColor=cardTextColor==="#ffffff"?"rgba(255,255,255,0.85)":"rgba(15,23,42,0.75)";
              const cardShadow=cardTextColor==="#ffffff"?"0 1px 3px rgba(0,0,0,0.3)":"none";
              const durataEvt=(!e.allDay&&e.tIn&&e.tOut)?calcDurata(e.tIn,e.tOut):"";
              return (
              <>
            <div style={{flex:1}}>
              <div style={{color:cardTextColor,fontSize:20,fontWeight:800,textShadow:cardShadow}}>{e.label}</div>
              {!e.allDay&&e.tIn&&(
                <div style={{color:cardSubColor,fontSize:17,marginTop:2}}>
                  🕐 {e.tIn}{e.tOut?` → ${e.tOut}`:""}{durataEvt?` · ${durataEvt}`:""}
                </div>
              )}
              {e.collega&&<div style={{color:cardSubColor,fontSize:17,marginTop:3}}>👮 {e.collega}</div>}
              {(e.protPagFine||e.protRecFine)&&(()=>{
                function calcDurProt(tBase, oraFine){
                  const m1=oraInMinuti(tBase), m2=oraInMinuti(oraFine);
                  if(m1===null||m2===null) return "";
                  let d=m2-m1;
                  if(d<0) d+=24*60;
                  return d>0?Math.floor(d/60)+"h"+(d%60>0?" "+d%60+"m":""):"";
                }
                const tBase = e.tOut||calcFine6h15(e.tIn)||"";
                const protC=getContrastTextColor(e.color)==="#ffffff"?"rgba(255,255,255,0.9)":"rgba(15,23,42,0.8)";
                return (
                  <div style={{marginTop:4,display:"flex",flexDirection:"column",gap:2}}>
                    {e.protPagFine&&<div style={{color:protC,fontSize:16}}>
                      💜 PAG → {e.protPagFine}{calcDurProt(tBase,e.protPagFine)?" ("+calcDurProt(tBase,e.protPagFine)+")":""}
                    </div>}
                    {e.protRecFine&&<div style={{color:protC,fontSize:16}}>
                      ⚙️ REC → {e.protRecFine}{calcDurProt(tBase,e.protRecFine)?" ("+calcDurProt(tBase,e.protRecFine)+")":""}
                    </div>}
                  </div>
                );
              })()}

            </div>
            <button onClick={e2=>{e2.stopPropagation();setForm({
                editId:e.id,modelloId:null,shiftId:null,label:e.label,colorOvr:e.color,
                dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":"custom",tIn:e.tIn||"",tOut:e.tOut||"",place:e.place||"",
                map:e.map||"",note:e.note||"",collega:e.collega||"",auto:e.auto||"",
                protPagFine:e.protPagFine||"",protRecFine:e.protRecFine||"",
              });}}
              style={{background:cardTextColor==="#ffffff"?"rgba(0,0,0,0.2)":"rgba(255,255,255,0.35)",border:"none",borderRadius:6,
                color:cardTextColor,width:26,height:26,cursor:"pointer",fontSize:14,marginLeft:4,flexShrink:0,
                display:soloConsultazione?"none":undefined}}>✏️</button>
            <button onClick={e2=>{e2.stopPropagation();
                if(e.rotazioneId){ setShowDeleteRotEvtDialog({evt:e, dKey:dayKey, cId:calId}); }
                else if(window.confirm("Eliminare questo evento?")){ delEvt(dayKey,calId,e.id); }
              }}
              style={{background:cardTextColor==="#ffffff"?"rgba(0,0,0,0.2)":"rgba(255,255,255,0.35)",border:"none",borderRadius:6,
                color:cardTextColor,width:26,height:26,cursor:"pointer",fontSize:14,marginLeft:4,flexShrink:0,
                display:soloConsultazione?"none":undefined}}>×</button>
              </>
              );
            })()}
          </div>
        ))}
        {form&&(
          <div style={{background:T.s2,borderRadius:12,padding:14,marginTop:8}}>
            {!form.modelloId&&!form.editId&&(
              <div style={{fontSize:10,color:T.sub,fontWeight:900,marginBottom:12,letterSpacing:1}}>NUOVO EVENTO</div>
            )}
            {form.editId&&(
              <div style={{fontSize:24,color:T.text,fontWeight:900,marginBottom:12,letterSpacing:1}}>{(form.label||"EVENTO").toUpperCase()}</div>
            )}
            {modelli.length>0&&!form.editId&&(()=>{
              const modelliDelCal = modelliOrdinati.filter(m=>{
                if(!calId) return true;
                const mcid = m.calendarId||mainCalId;
                return mcid===calId;
              });
              if(modelliDelCal.length===0) return null;
              return (
              <>
                {!form.modelloId&&<div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600}}>MODELLO TURNO</div>}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  {(form.modelloId?modelliDelCal.filter(m=>m.id===form.modelloId):modelliDelCal).map(m=>{
                    const c=m.coloreCustom||colByTime(m.inizio);
                    return (
                      <button key={m.id}
                        onClick={()=>setForm(f=>({...f,modelloId:m.id,shiftId:null,label:m.label||m.titolo,colorOvr:null,
                          dur:m.tempo==="h24"?"allday":m.tempo==="6h15"?"fixed":"custom",
                          tIn:m.inizio||"",
                          tOut:m.tempo==="6h15"&&m.inizio?calcFine6h15(m.inizio):(m.fine||"")}))}
                        style={{background:form.modelloId===m.id?c:T.surface,
                          border:`2px solid ${form.modelloId===m.id?c:T.border}`,
                          borderRadius:10,padding:"6px 10px",cursor:"pointer",
                          color:form.modelloId===m.id?"#fff":T.sub,fontSize:11,fontWeight:700,
                          display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:c}}/>
                        {m.titolo}
                      </button>
                    );
                  })}
                  {!form.modelloId&&(
                    <button onClick={()=>setForm(f=>({...f,modelloId:null}))}
                      style={{background:!form.modelloId?accent:T.surface,
                        border:`2px solid ${!form.modelloId?accent:T.border}`,
                        borderRadius:10,padding:"6px 10px",cursor:"pointer",
                        color:!form.modelloId?"#fff":T.sub,fontSize:11,fontWeight:700}}>
                      Libero
                    </button>
                  )}
                </div>
              </>
              );
            })()}
            {(activeCal?.shifts||[]).length>0&&!form.modelloId&&!form.editId&&(
              <>
                <div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600}}>TURNO CALENDARIO</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
                  {activeCal.shifts.map(s=>(
                    <button key={s.id}
                      onClick={()=>setForm(f=>({...f,shiftId:s.id,label:s.label,colorOvr:null}))}
                      style={{background:form.shiftId===s.id?s.color:T.surface,
                        border:`2px solid ${form.shiftId===s.id?s.color:T.border}`,
                        borderRadius:10,padding:"8px 4px",cursor:"pointer",
                        color:form.shiftId===s.id?"#fff":T.sub,fontSize:11,fontWeight:700}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color,margin:"0 auto 4px"}}/>
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {!form.shiftId&&!form.modelloId&&!form.editId&&(
              <input value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
                placeholder="NOME EVENTO..."
                style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:8,padding:"9px 10px",color:T.text,fontSize:13,
                  marginBottom:10,boxSizing:"border-box",outline:"none"}}/>
            )}
            {!form.modelloId&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:14,color:T.sub,fontWeight:700}}>COLORE</span>
                <div style={{position:"relative"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",cursor:"pointer",
                    background:form.colorOvr||(form.shiftId?activeCal?.shifts?.find(s=>s.id===form.shiftId)?.color:activeCal?.color)||"#94a3b8",
                    border:`2px solid ${T.border}`}}
                    onClick={e=>{e.stopPropagation();setPal(pal==="ec"?null:"ec");}}/>
                  {pal==="ec"&&<ColorPickerModal T={T}
                    cur={form.colorOvr||(form.shiftId?activeCal?.shifts?.find(s=>s.id===form.shiftId)?.color:activeCal?.color)||"#94a3b8"}
                    title="Colore evento"
                    onPick={p=>setForm(f=>({...f,colorOvr:p}))}
                    onClose={()=>setPal(null)}
                    coloriUsati={[...new Set(modelli.map(m=>m.coloreCustom||(m.tempo==="h24"?COLORE_H24:colByTime(m.inizio))).filter(Boolean))]}/>}
                </div>
                {form.colorOvr&&(
                  <button onClick={()=>setForm(f=>({...f,colorOvr:null}))}
                    style={{background:"none",border:"none",color:T.sub,fontSize:13,fontWeight:700,cursor:"pointer"}}>↩ auto</button>
                )}
              </div>
            )}
            <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>DURATA</div>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              {[["allday","Tutto il giorno"],["fixed","6h 15m"],["custom","Orario libero"]].map(([v,l])=>(
                <button key={v} onClick={()=>setForm(f=>({...f,dur:v}))}
                  style={{flex:1,padding:"7px 2px",borderRadius:8,cursor:"pointer",fontSize:10,fontWeight:700,
                    background:form.dur===v?accent:T.surface,
                    color:form.dur===v?"#fff":T.sub,
                    border:`1.5px solid ${form.dur===v?accent:T.border}`}}>{l}</button>
              ))}
            </div>
            {form.dur!=="allday"&&(
  <div style={{marginBottom:10}}>
    <div style={{display:"flex",gap:8,marginBottom:8}}>
      <div style={{flex:1}}>
        <div style={{fontSize:9,color:T.sub,marginBottom:3}}>INGRESSO</div>
        <SmartTimeInput value={form.tIn||""} onChange={v=>setForm(f=>({...f,tIn:v,
          tOut: f.dur==="fixed"&&v ? calcFine6h15(v) : ""}))}
          style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
      </div>
      {form.dur==="custom"&&(
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:T.sub,marginBottom:3}}>USCITA</div>
          <SmartTimeInput value={form.tOut||""} onChange={v=>setForm(f=>({...f,tOut:v}))}
            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
        </div>
      )}
      {form.dur==="fixed"&&form.tIn&&(
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:T.sub,marginBottom:3}}>USCITA (modif.)</div>
          <SmartTimeInput value={form.tOut||calcFine6h15(form.tIn)} onChange={v=>setForm(f=>({...f,tOut:v}))}
            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
        </div>
      )}
    </div>
    {(()=>{
      const tBase = form.tOut||calcFine6h15(form.tIn)||"";
      function calcDur(oraFine){
        const m1=oraInMinuti(tBase), m2=oraInMinuti(oraFine);
        if(m1===null||m2===null) return "";
        let d=m2-m1;
        if(d<0) d+=24*60;
        return d>0?Math.floor(d/60)+"h"+(d%60>0?" "+d%60+"m":""):"";
      }
      const durPag = calcDur(form.protPagFine||"");
      const durRec = calcDur(form.protRecFine||"");
      return (
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}>
            <div style={{width:"100%",padding:"5px 8px",borderRadius:8,
              fontSize:9,fontWeight:800,textAlign:"center",
              background:"#8b5cf6",color:"#fff",marginBottom:4}}>
              PROTRAZIONE A PAGAMENTO
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <SmartTimeInput value={form.protPagFine||""} onChange={v=>setForm(f=>({...f,protPagFine:v}))}
                style={{width:64,background:T.surface,border:`1.5px solid #8b5cf6`,
                  borderRadius:8,padding:"5px 6px",color:T.text,fontSize:12,outline:"none"}}/>
              <div style={{background:T.surface,border:"1.5px solid #8b5cf6",borderRadius:8,
                padding:"5px 8px",flex:1,textAlign:"center"}}>
                <div style={{fontSize:12,fontWeight:900,color:"#8b5cf6"}}>{durPag||"—"}</div>
              </div>
            </div>
          </div>
          <div style={{flex:1}}>
            <div style={{width:"100%",padding:"5px 8px",borderRadius:8,
              fontSize:9,fontWeight:800,textAlign:"center",
              background:"#64748b",color:"#fff",marginBottom:4}}>
              PROTRAZIONE A RECUPERO
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <SmartTimeInput value={form.protRecFine||""} onChange={v=>setForm(f=>({...f,protRecFine:v}))}
                style={{width:64,background:T.surface,border:`1.5px solid #64748b`,
                  borderRadius:8,padding:"5px 6px",color:T.text,fontSize:12,outline:"none"}}/>
              <div style={{background:T.surface,border:"1.5px solid #64748b",borderRadius:8,
                padding:"5px 8px",flex:1,textAlign:"center"}}>
                <div style={{fontSize:12,fontWeight:900,color:"#64748b"}}>{durRec||"—"}</div>
              </div>
            </div>
          </div>
        </div>
      );
    })()}
  </div>
)}

            <input value={form.auto||""} onChange={e=>{
                const raw=e.target.value.toUpperCase();
                const stripped=raw.replace(/^(CH\s*)+/i,"").trim();
                setForm(f=>({...f,auto:stripped?"CH "+stripped:""}));
              }}
              placeholder="🚗 Numero auto/pattuglia (opzionale)..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none"}}/>
            <textarea value={form.collega||""} onChange={e=>{setForm(f=>({...f,collega:e.target.value.toUpperCase()}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
              placeholder="👮 Collega" rows={1}
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none",resize:"none",fontFamily:"inherit",
                overflow:"hidden",minHeight:36}}/>
            <input value={form.place||""} onChange={e=>setForm(f=>({...f,place:e.target.value.toUpperCase()}))}
              placeholder="📍 LUOGO (OPZIONALE)..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none"}}/>
            {form.place&&(
              <input value={form.map||""} onChange={e=>setForm(f=>({...f,map:e.target.value}))}
                placeholder="🗺️ Link Google Maps..."
                style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                  marginBottom:6,boxSizing:"border-box",outline:"none"}}/>
            )}
            <input value={form.note||""} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
              placeholder="Note..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:12,boxSizing:"border-box",outline:"none"}}/>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>{setForm(null);setPal(null);}}
                style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:10,color:T.sub,padding:"13px 0",cursor:"pointer",fontSize:16,fontWeight:700}}>
                Annulla
              </button>
              <button onClick={form.editId?updateEvt:saveEvt}
                style={{flex:2,background:accent,border:"none",borderRadius:10,
                  color:"#fff",padding:"13px 0",cursor:"pointer",fontSize:16,fontWeight:800}}>
                💾 Salva
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
// #endregion


// #region SEZIONE 20: DB MODAL + RENDER PRINCIPALE
// ═══════════════════════════════════════════════════════════════
  const dbModal = showDbModal && (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center",padding:12}}
      onClick={()=>setShowDbModal(false)}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:440,
        maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
          <span style={{fontSize:14,fontWeight:900,color:T.text}}>☁️ Dati Salvati in Supabase</span>
          <button onClick={()=>setShowDbModal(false)}
            style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18}}>×</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <div style={{background:T.s2,borderRadius:10,padding:12,textAlign:"center"}}>
              <div style={{fontSize:10,color:T.sub,fontWeight:800}}>CALENDARI</div>
              <div style={{fontSize:22,fontWeight:900,color:accent}}>{dbCalsCount}</div>
            </div>
            <div style={{background:T.s2,borderRadius:10,padding:12,textAlign:"center"}}>
              <div style={{fontSize:10,color:T.sub,fontWeight:800}}>EVENTI TOTALI</div>
              <div style={{fontSize:22,fontWeight:900,color:"#10b981"}}>{dbEvtsCount}</div>
            </div>
          </div>
          {dbRawData?(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:T.sub,marginBottom:6}}>I TUOI CALENDARI ({dbRawData.calendars.length})</div>
                {dbRawData.calendars.map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,background:T.s2,borderRadius:8,padding:"8px 10px",marginBottom:4}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:c.color}}/>
                    <span style={{fontSize:12,fontWeight:700,color:T.text,flex:1}}>{c.name}</span>
                    {c.is_main&&<span style={{fontSize:9,background:accent+"33",color:accent,padding:"2px 6px",borderRadius:10,fontWeight:800}}>Principale</span>}
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:T.sub,marginBottom:6}}>RECENTI EVENTI ({dbRawData.events.length})</div>
                {dbRawData.events.slice(0,50).map(e=>{
                  const cal=dbRawData.calendars.find(c=>c.id===e.calendar_id);
                  return (
                    <div key={e.id} style={{background:T.s2,borderRadius:8,padding:"8px 10px",marginBottom:4}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,fontWeight:800,color:e.color}}>{e.label}</span>
                        <span style={{fontSize:9,color:T.sub}}>{fmtDataIT(e.date_key)}</span>
                      </div>
                      <div style={{fontSize:9,color:T.sub}}>Cal: {cal?.name||"?"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ):(
            <div style={{textAlign:"center",padding:24,color:T.sub,fontSize:12}}>⏳ Caricamento...</div>
          )}
        </div>
        <div style={{padding:12,borderTop:`1px solid ${T.border}`}}>
          <button onClick={()=>setShowDbModal(false)}
            style={{width:"100%",background:"#64748b",border:"none",borderRadius:10,color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );

  const NAV_ITEMS = [
    { id:"cal",      icon:"▦",  label:"Calendario" },
    { id:"report",   icon:"📊", label:"Report" },
    { id:"modelli",  icon:"📋", label:"Modelli" },
    { id:"settings", icon:"⚙", label:"Impostazioni" },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,
      fontFamily:"system-ui,sans-serif",maxWidth:480,margin:"0 auto",overflow:"hidden"}}
      onClick={()=>pal&&setPal(null)}>
      <style>{`
        @keyframes calSlideOutLeft { from { transform:translateX(0); opacity:1; } to { transform:translateX(-100%); opacity:0; } }
        @keyframes calSlideOutRight { from { transform:translateX(0); opacity:1; } to { transform:translateX(100%); opacity:0; } }
        @keyframes calSlideInLeft { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
        @keyframes calSlideInRight { from { transform:translateX(-100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
        .calOuterArrow{display:flex}
        @media (hover:none), (max-width:640px) { .calOuterArrow{display:none} }
      `}</style>
      {screen==="cal" && (
        <>
          <button className="calOuterArrow" onClick={goPrevMonth}
            style={{position:"fixed",left:"calc(50% - 320px)",top:"50%",transform:"translateY(-50%)",
              zIndex:50,width:44,height:44,borderRadius:"50%",border:"1px solid #e2e8f0",
              background:"#fff",color:"#334155",fontSize:22,fontWeight:900,
              alignItems:"center",justifyContent:"center",cursor:"pointer",
              boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>‹</button>
          <button className="calOuterArrow" onClick={goNextMonth}
            style={{position:"fixed",right:"calc(50% - 320px)",top:"50%",transform:"translateY(-50%)",
              zIndex:50,width:44,height:44,borderRadius:"50%",border:"1px solid #e2e8f0",
              background:"#fff",color:"#334155",fontSize:22,fontWeight:900,
              alignItems:"center",justifyContent:"center",cursor:"pointer",
              boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>›</button>
        </>
      )}
      {dbError && (
        <div style={{position:"fixed",top:8,left:"50%",transform:"translateX(-50%)",zIndex:9999,
          maxWidth:440,width:"calc(100% - 24px)",background:"#ef4444",color:"#fff",
          padding:"10px 14px",borderRadius:10,fontSize:12,fontWeight:700,
          boxShadow:"0 4px 16px rgba(0,0,0,0.25)",display:"flex",alignItems:"center",gap:8}}
          onClick={()=>setDbError("")}>
          <span style={{flex:1}}>{dbError}</span>
          <span style={{cursor:"pointer",opacity:0.8}}>✕</span>
        </div>
      )}
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {screen==="cal"      && calView}
        {screen==="report"   && reportView}
        {screen==="modelli"  && modelliView}
        {screen==="settings" && settingsView}
      </div>
      <div style={{display:"flex",borderTop:`1px solid ${T.border}`,background:T.surface,flexShrink:0}}>
        {NAV_ITEMS.map(({id,icon,label})=>(
          <button key={id} onClick={()=>setScreen(id)}
            style={{flex:1,background:"none",border:"none",padding:"8px 0",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <span style={{fontSize:18,color:screen===id?accent:T.sub}}>{icon}</span>
            <span style={{fontSize:9,fontWeight:700,color:screen===id?accent:T.sub}}>{label}</span>
          </button>
        ))}
      </div>
      {banner&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
        background:"rgba(0,0,0,0.75)",color:"#fff",padding:"6px 16px",
        borderRadius:20,fontSize:12,zIndex:9999,pointerEvents:"none"}}>{banner}</div>}
      {dayModal}
      {dbModal}
      {showModelForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:600,
          display:"flex",alignItems:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowModelForm(false);}}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",maxHeight:"92vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 0"}}>
              <button onClick={()=>setShowModelForm(false)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer",padding:4}}>‹</button>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>
                {editModello?"Modifica modello":"Nuovo modello"}
              </div>
              <div style={{width:32}}/>
            </div>
            <ModelForm T={T} form={modelForm} setForm={setModelForm} accent={accent} dark={dark}
              fasceAutomatiche={fasceAutomatiche} modelli={modelli}
              onSave={async()=>{
                const esito = await saveModello({...modelForm,id:editModello?.id});
                if(esito?.ok){
                  setShowModelForm(false);
                  setShowModelloPicker(true);
                } else {
                  alert("Errore nel salvataggio del modello: "+(esito?.error||"errore sconosciuto")+"\n\nIl modello NON è stato salvato, controlla i dati e riprova.");
                }
              }}/>
          </div>
        </div>
      )}
      {showRotazionePicker&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,
          display:"flex",flexDirection:"column"}}>
          {!showRotDetail?(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
                <button onClick={()=>setShowRotazionePicker(false)}
                  style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>Scegli rotazione</div>
                <div style={{width:32}}/>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
                {rotazioni.length===0&&(
                  <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                    <div style={{fontSize:36,marginBottom:10}}>🔄</div>
                    <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessuna rotazione</div>
                  </div>
                )}
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                  {rotazioni.map((r,i,arr)=>{
                    const tipoLabel=r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL/RS":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":"✏️ Personalizzata";
                    return (
                      <div key={r.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                        <div onClick={()=>{
                          if(r.tipo==="domeniche"||r.tipo==="nlrs_scalante"){
                            setShowApplyRotDialog(r);
                          } else {
                            setShowRotDetail(r);
                          }
                        }}
                          style={{display:"flex",alignItems:"center",padding:"14px 16px",cursor:"pointer"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:16,fontWeight:800,color:T.text}}>{r.titolo||"Senza nome"}</div>
                            <div style={{fontSize:13,color:T.sub,marginTop:2}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
                          </div>
                          <span style={{color:T.sub,fontSize:14}}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ):(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
                <button onClick={()=>setShowRotDetail(null)}
                  style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>{showRotDetail.titolo||"Rotazione"}</div>
                <button onClick={()=>{
                  const r=showRotDetail;
                  let modelloScelto=null;
                  if(r.tipo==="personalizzata"){
                    modelloScelto=modelli.find(m=>m.id===r.griglia?.[dayKey])||null;
                  } else if(r.tipo==="domeniche"){
                    const [di,dm,dd]=r.dataInizio.split("-").map(Number);
                    const inizio=new Date(di,dm-1,dd);
                    let prima=new Date(inizio);
                    while(prima.getDay()!==0) prima.setDate(prima.getDate()+1);
                    const [ty,tm,td]=dayKey.split("-").map(Number);
                    const target=new Date(ty,tm-1,td);
                    const diffMs=target-prima;
                    const diffSett=Math.floor(diffMs/(7*24*60*60*1000));
                    if(diffSett>=0&&target.getDay()===0){
                      const isLav=(diffSett%4)===0;
                      modelloScelto=modelli.find(m=>m.id===(isLav?r.modellaLavoroId:r.modelloNLId))||null;
                    }
                  } else if(r.tipo==="nlrs"||r.tipo==="nlrs_scalante"){
                    modelloScelto=modelli.find(m=>m.id===(r.modelloNLId||r.modelloRSId))||null;
                  }
                  if(!modelloScelto){
                    alert("Nessun modello previsto per questo giorno dalla rotazione");
                    return;
                  }
                  setForm({
                    modelloId:modelloScelto.id,
                    rotazioneId:r.id,
                    shiftId:null,
                    label:modelloScelto.titolo,
                    note:"",
                    dur:modelloScelto.tempo==="h24"?"allday":modelloScelto.tempo==="6h15"?"fixed":"custom",
                    tIn:modelloScelto.inizio||"",
                    tOut:modelloScelto.fine||"",
                    place:"",map:"",colorOvr:null,collega:"",auto:"",
                    protPagFine:"",protRecFine:"",
                  });
                  setShowRotDetail(null);
                  setShowRotazionePicker(false);
                }} style={{background:accent,border:"none",borderRadius:8,
                  color:"#fff",fontSize:13,fontWeight:800,padding:"6px 14px",cursor:"pointer"}}>
                  Fatto
                </button>
              </div>
              <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:T.bg,display:"flex",flexDirection:"column"}}>
                {(()=>{
                  const modelliDelCalRot2 = modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId);
                  return (<>
                {showRotDetail.tipo==="domeniche"&&(
                  <DomenicheView rot={showRotDetail} T={T} accent={accent} modelli={modelliDelCalRot2} fasceAutomatiche={fasceAutomatiche} onUpdate={()=>{}}/>
                )}
                {showRotDetail.tipo==="nlrs"&&(
                  <NLRSView rot={showRotDetail} T={T} accent={accent} modelli={modelliDelCalRot2}/>
                )}
                {showRotDetail.tipo==="nlrs_scalante"&&(
                  <NLRSScalanteView rot={showRotDetail} T={T} accent={accent} modelli={modelliDelCalRot2}/>
                )}
                {showRotDetail.tipo==="personalizzata"&&(
                  <div style={{flex:1,minHeight:500}}>
                    <GrigliaRotazione rot={showRotDetail} T={T} accent={accent} modelli={modelliDelCalRot2} fasceAutomatiche={fasceAutomatiche} onUpdate={()=>{}}/>
                  </div>
                )}
                  </>);
                })()}
              </div>
            </>
          )}
        </div>
      )}
      {showModelloPicker&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,
          display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
            <button onClick={()=>{setShowModelloPicker(false);setQuickModeModello(null);}}
              style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
            <div style={{fontSize:16,fontWeight:900,color:T.text}}>
              {showModelloPicker==="quick"?(quickModeModello?"Tocca i giorni da riempire":"Scegli modello da applicare"):"Scegli modello"}
            </div>
            {showModelloPicker==="quick"&&!quickModeModello?(
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setShowImportaFotoDialog(true)}
                  style={{background:"none",border:"none",color:accent,fontSize:20,cursor:"pointer",width:32}}>📷</button>
                <button onClick={()=>{
                    if(confirm(`Cancellare TUTTI gli eventi di ${NOMI_MESI_IT[month]} ${year} su questo calendario? L'azione non è reversibile.`)){
                      cancellaTuttiEventiMese(year, month, calId);
                    }
                  }}
                  style={{background:"none",border:"none",color:"#ef4444",fontSize:20,cursor:"pointer",width:32}}>🗑️</button>
              </div>
            ):(
              <div style={{width:32}}/>
            )}
          </div>
          {showModelloPicker==="quick"&&quickModeModello&&(
            <div style={{padding:"10px 16px",background:"#0f172a",color:"#fff",fontSize:13,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>Modello attivo: <strong>{modelli.find(m=>m.id===quickModeModello)?.titolo}</strong></span>
              <button onClick={()=>{setShowModelloPicker(false);}}
                style={{background:"#fff",border:"none",borderRadius:8,padding:"6px 12px",
                  fontWeight:800,fontSize:12,cursor:"pointer"}}>Fine</button>
            </div>
          )}
          <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
            {modelli.length===0&&(
              <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                <div style={{fontSize:36,marginBottom:10}}>📋</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessun modello</div>
                <div style={{fontSize:13}}>Crea il tuo primo modello turno</div>
              </div>
            )}
            {(()=>{
              const modelliPicker = modelliOrdinati.filter(m=>{
                const mcid = m.calendarId||mainCalId;
                return !calId || mcid===calId;
              });
              if(modelliPicker.length===0) return null;
              return (
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                {modelliPicker.map((m,i,arr)=>{
                  const c=m.coloreCustom||colByTime(m.inizio);
                  const durata=m.tempo==="h24"?"Tutto il giorno"
                    :m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)} • 6h 15m`
                    :m.inizio&&m.fine?`${m.inizio} - ${m.fine} • ${calcDurata(m.inizio,m.fine)}`
                    :m.inizio?m.inizio:"";
                  return (
                    <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <div onClick={()=>{
                        if(showModelloPicker==="quick"){
                          setQuickModeModello(m.id);
                          return;
                        }
                        setForm({modelloId:m.id,shiftId:null,label:m.titolo,note:"",
                          dur:m.tempo==="h24"?"allday":m.tempo==="6h15"?"fixed":"custom",
                          tIn:m.inizio||"",tOut:m.fine||"",place:"",map:"",colorOvr:null,collega:"",auto:""});
                        setShowModelloPicker(false);
                      }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                        <div style={{width:36,height:36,borderRadius:10,background:c+"33",
                          border:`2px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center",
                          flexShrink:0,marginRight:12}}>
                          <div style={{width:14,height:14,borderRadius:"50%",background:c}}/>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
                            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
                          <div style={{fontSize:16,color:T.sub,marginTop:1}}>{durata}</div>
                        </div>
                        <span style={{color:T.sub,fontSize:14}}>›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}
            {(activeCal?.shifts||[]).length>0&&(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                {activeCal.shifts.map((s,i,arr)=>(
                  <div key={s.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <div onClick={()=>{
                      setForm({modelloId:null,shiftId:s.id,label:s.label,note:"",dur:"allday",
                        tIn:"",tOut:"",place:"",map:"",colorOvr:null,collega:"",auto:""});
                      setShowModelloPicker(false);
                    }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                      <div style={{width:36,height:36,borderRadius:10,background:s.color+"33",
                        border:`2px solid ${s.color}`,display:"flex",alignItems:"center",justifyContent:"center",
                        flexShrink:0,marginRight:12}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:s.color}}/>
                      </div>
                      <div style={{flex:1,fontSize:14,fontWeight:800,color:T.text}}>{s.label}</div>
                      <span style={{color:T.sub,fontSize:14}}>›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showModelloPicker!=="quick"&&(
              <>
                <div onClick={()=>{
                  setForm({modelloId:null,shiftId:null,label:"",note:"",dur:"allday",
                    tIn:"",tOut:"",place:"",map:"",colorOvr:null,collega:"",auto:""});
                  setShowModelloPicker(false);
                }} style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"12px 14px",
                  background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,cursor:"pointer",
                  color:T.sub,fontSize:13,fontWeight:700,marginBottom:12}}>
                  Evento libero (senza modello)
                </div>
                <button onClick={()=>{
                  setEditModello(null);
                  setModelForm({titolo:"",tempo:"personalizzato",inizio:"",fine:"",coloreCustom:null,posizione:""});
                  setShowModelForm(true);
                  setShowModelloPicker(false);
                }} style={{width:"100%",background:accent,border:"none",borderRadius:14,
                  color:"#fff",padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
                  + Nuovo modello
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {showDeleteRotEvtDialog && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:600,
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setShowDeleteRotEvtDialog(null)}>
          <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:360,
            padding:20,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:8}}>Eliminare evento</div>
            <div style={{fontSize:13,color:T.sub,marginBottom:16}}>
              Questo evento fa parte di una rotazione. Cosa vuoi eliminare?
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              <button onClick={async()=>{
                  const {evt,dKey,cId}=showDeleteRotEvtDialog;
                  setShowDeleteRotEvtDialog(null);
                  await delEvt(dKey,cId,evt.id);
                }}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                  color:T.text,padding:"10px 12px",cursor:"pointer",fontWeight:700,fontSize:13,textAlign:"left"}}>
                Solo questa giornata
              </button>
              <button onClick={async()=>{
                  const {evt,dKey,cId}=showDeleteRotEvtDialog;
                  const n = parseInt(window.prompt("Quante ripetizioni vuoi eliminare (da questa data in poi)?","1"))||0;
                  setShowDeleteRotEvtDialog(null);
                  if(n>0) await delEvtiRotazioneDaData(evt.rotazioneId, dKey, cId, n);
                }}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                  color:T.text,padding:"10px 12px",cursor:"pointer",fontWeight:700,fontSize:13,textAlign:"left"}}>
                Solo N ripetizioni da questa data
              </button>
              <button onClick={async()=>{
                  const {evt,cId}=showDeleteRotEvtDialog;
                  if(window.confirm("Eliminare TUTTI gli eventi di questa rotazione? L'azione non è reversibile.")){
                    setShowDeleteRotEvtDialog(null);
                    await delTutteEvtiRotazione(evt.rotazioneId, cId);
                  }
                }}
                style={{background:"#ef444422",border:"1px solid #ef4444",borderRadius:10,
                  color:"#ef4444",padding:"10px 12px",cursor:"pointer",fontWeight:700,fontSize:13,textAlign:"left"}}>
                Tutti gli eventi della rotazione
              </button>
            </div>
            <button onClick={()=>setShowDeleteRotEvtDialog(null)}
              style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                color:T.sub,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
              Annulla
            </button>
          </div>
        </div>
      )}
      {showImportaFotoDialog && (
        <ImportaFotoDialog T={T} accent={accent} dark={dark}
          modelli={modelliOrdinati.filter(m=>!m.calendarId || m.calendarId===calId)}
          year={year} month={month}
          onClose={()=>setShowImportaFotoDialog(false)}
          onConfirm={async(righeValide)=>{
            const n = await importaEventiSingoli(righeValide);
            return n;
          }}/>
      )}
      {showApplyRotDialog && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:600,
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setShowApplyRotDialog(null)}>
          <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:360,
            padding:20,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:8}}>Applica Rotazione</div>
            <div style={{fontSize:13,color:T.sub,marginBottom:16}}>
              Stai applicando la rotazione <strong>{showApplyRotDialog.titolo||"Senza nome"}</strong> a partire dal {fmtDataIT(dayKey)}
              {showApplyRotDialog.tipo==="nlrs_scalante"?" (primo RS)":" (domenica)"}.
              <br/><br/>
              {showApplyRotDialog.tipo==="nlrs_scalante"
                ?"Il ciclo scalante è di 6 coppie RS/NL. Quante volte vuoi ripeterlo?"
                :"Il ciclo è di 4 domeniche. Quante volte vuoi ripeterlo?"}
            </div>

            {showApplyRotDialog.tipo==="nlrs_scalante"&&(
              <div style={{marginBottom:16}}>
                <span style={{fontSize:13,color:T.text,fontWeight:700,display:"block",marginBottom:8}}>
                  Con quale modello inizi?
                </span>
                <div style={{display:"flex",gap:8}}>
                  <button type="button" onClick={()=>document.getElementById("modello_partenza_rot").value="RS"}
                    id="btn_rs_partenza"
                    style={{flex:1,background:"#8b5cf622",border:"2px solid #8b5cf6",borderRadius:8,
                      color:"#8b5cf6",padding:"8px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
                    RS
                  </button>
                  <button type="button" onClick={()=>document.getElementById("modello_partenza_rot").value="NL"}
                    id="btn_nl_partenza"
                    style={{flex:1,background:T.s2,border:`2px solid ${T.border}`,borderRadius:8,
                      color:T.sub,padding:"8px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
                    NL
                  </button>
                </div>
                <input type="hidden" id="modello_partenza_rot" defaultValue="RS"/>
              </div>
            )}

            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <span style={{fontSize:13,color:T.text,fontWeight:700}}>Ripetizioni:</span>
              <input type="number" defaultValue={4} min={1} max={52} id="num_ripetizioni_rot"
                style={{width:70,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                  padding:"6px 8px",color:T.text,fontSize:14,fontWeight:700,outline:"none",textAlign:"center"}}/>
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowApplyRotDialog(null)}
                style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                  color:T.sub,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
                Annulla
              </button>
              <button onClick={async()=>{
                const inputVal = parseInt(document.getElementById("num_ripetizioni_rot")?.value) || 4;
                const modPartenza = document.getElementById("modello_partenza_rot")?.value || "RS";
                setShowApplyRotDialog(null);
                setShowRotazionePicker(false);
                setDayKey(null);
                await applyRotazione(showApplyRotDialog.id, dayKey, inputVal, modPartenza);
              }}
                style={{flex:2,background:accent,border:"none",borderRadius:10,
                  color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// #endregion


// #region SEZIONE 21: CAL BADGE
// ═══════════════════════════════════════════════════════════════
function CalBadge({ calId, calAttivo, coloreCal, testoContrasto, T, store, setStore, updateCalendar, accent, setCalId }){
  const [showCalPal, setShowCalPal] = useState(false);
  const [showCalSwitch, setShowCalSwitch] = useState(false);
  if(!calId||!calAttivo) return null;
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <div style={{position:"relative"}}>
        <div onClick={()=>{ setShowCalPal(s=>!s); setShowCalSwitch(false); }}
          style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",
            background:coloreCal,borderRadius:20,padding:"3px 12px 3px 8px"}}>
          <div style={{width:10,height:10,borderRadius:"50%",
            background:"rgba(255,255,255,0.4)",border:"1.5px solid rgba(255,255,255,0.8)"}}/>
          <span style={{fontSize:13,fontWeight:800,color:testoContrasto}}>{calAttivo.name}</span>
          <span style={{fontSize:10,color:testoContrasto,opacity:0.7}}>🎨</span>
        </div>
        {showCalPal&&(
          <ColorPickerModal T={T} cur={coloreCal} title={`Colore ${calAttivo.name||"calendario"}`}
            coloriUsati={[...new Set(store.calendars.map(cc=>cc.color).filter(Boolean))]}
            onPick={p=>{
              const newCals=JSON.parse(JSON.stringify(store.calendars));
              const idx=newCals.findIndex(c=>c.id===calId);
              if(idx>-1){ newCals[idx].color=p; setStore(s=>({...s,calendars:newCals})); updateCalendar(calId,{color:p}); }
            }}
            onClose={()=>setShowCalPal(false)}/>
        )}
      </div>
      {store&&store.calendars&&store.calendars.length>1&&(
        <div style={{position:"relative"}}>
          <button onClick={()=>{ setShowCalSwitch(s=>!s); setShowCalPal(false); }}
            style={{background:coloreCal,border:"none",borderRadius:"50%",
              width:24,height:24,cursor:"pointer",display:"flex",alignItems:"center",
              justifyContent:"center",color:testoContrasto,fontSize:14,fontWeight:900}}>
            ▾
          </button>
          {showCalSwitch&&(
            <div style={{position:"absolute",top:28,left:0,background:T.surface,
              border:`1px solid ${T.border}`,borderRadius:12,padding:6,zIndex:500,
              boxShadow:"0 8px 32px rgba(0,0,0,0.25)",minWidth:140}}
              onClick={e=>e.stopPropagation()}>
              {(store.calendars||[]).map(c=>(
                <div key={c.id} onClick={()=>{ setCalId&&setCalId(c.id); setShowCalSwitch(false); }}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                    borderRadius:8,cursor:"pointer",
                    background:c.id===calId?accent+"18":"transparent"}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c.color}}/>
                  <span style={{fontSize:13,fontWeight:c.id===calId?700:400,
                    color:c.id===calId?accent:T.text}}>{c.name}</span>
                  {c.id===calId&&<span style={{color:accent,fontSize:11}}>✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// #endregion


// #region SEZIONE 22: SMART TIME INPUT
// ═══════════════════════════════════════════════════════════════
function SmartTimeInput({ value, onChange, style }) {
  const [digits, setDigits] = useState(() => (value || "").replace(/\D/g, "").slice(0, 4));

  useEffect(() => {
    setDigits((value || "").replace(/\D/g, "").slice(0, 4));
  }, [value]);

  function clampAndEmit(rawDigits) {
    let d = rawDigits.replace(/\D/g, "").slice(0, 4);

    if (d.length >= 1) {
      const h0 = parseInt(d[0], 10);
      if (h0 > 2) {
        d = "0" + d[0] + d.slice(1, 3);
        d = d.slice(0, 4);
      }
    }
    if (d.length >= 2) {
      let hh = parseInt(d.slice(0, 2), 10);
      if (hh > 23) hh = 23;
      d = String(hh).padStart(2, "0") + d.slice(2);
    }
    if (d.length >= 4) {
      let mm = parseInt(d.slice(2, 4), 10);
      if (mm > 59) mm = 59;
      d = d.slice(0, 2) + String(mm).padStart(2, "0");
    } else if (d.length === 3) {
      const m0 = parseInt(d[2], 10);
      if (m0 > 5) {
        d = d.slice(0, 2) + "0" + d[2];
        d = d.slice(0, 4);
      }
    }

    setDigits(d);

    if (d.length === 4) {
      onChange(d.slice(0, 2) + ":" + d.slice(2, 4));
    } else if (d.length === 0) {
      onChange("");
    }
  }

  function handleChange(e) {
    const typed = e.target.value;
    const onlyDigits = typed.replace(/\D/g, "");
    clampAndEmit(onlyDigits.slice(0, 4));
  }

  function handleKeyDown(e) {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setDigits(d => {
        const next = d.slice(0, -1);
        if (next.length === 4) onChange(next.slice(0, 2) + ":" + next.slice(2, 4));
        else onChange("");
        return next;
      });
    }
  }

  function handleFocus(e) {
    e.target.select();
  }

  let displayValue = "";
  if (digits.length > 0) {
    const hh = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    displayValue = mm ? hh + ":" + mm : (digits.length >= 3 ? hh + ":" + mm : hh);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="HH:MM"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      style={style}
    />
  );
}
// #endregion


// #region SEZIONE 23: REPORT SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════
function FasceExpand({data, pct1, pct2, T, modelli, accent, cfg}){
  const [openFascia, setOpenFascia] = useState(null);
  const fasceManuali = cfg?.fasceManuali || {};

  function turniDiFascia(fascia){
    return Object.entries(data.perModello||{}).filter(([mid])=>{
      const m=modelli.find(x=>x.id===mid);
      if(!m) return false;
      const assegnata = fasceManuali[mid]||"";
      if(fascia==="h24") return assegnata==="";
      return assegnata===fascia;
    });
  }

  const pctH24 = data.totale>0 ? Math.round(((data.h24||0)/data.totale)*100) : 0;

  const fasce=[
    {key:"primo",  label:"1° TURNO (06:00-11:45)", color:"#f59e0b", count:data.primo||0,  pct:pct1},
    {key:"secondo",label:"2° TURNO",                color:"#f97316", count:data.secondo||0, pct:pct2},
    {key:"h24",    label:"NON ASSEGNATI",           color:COLORE_H24, count:data.h24||0,   pct:pctH24},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {fasce.map(f=>(
        <div key={f.key}>
          <div onClick={()=>setOpenFascia(openFascia===f.key?null:f.key)}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 10px",background:f.color+"22",borderRadius:openFascia===f.key?"8px 8px 0 0":8,
              border:`1px solid ${f.color}44`,cursor:"pointer"}}>
            <span style={{fontSize:13,fontWeight:800,color:f.color}}>
              {f.label} {openFascia===f.key?"▲":"▼"}
            </span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:f.color,background:f.color+"22",
                borderRadius:6,padding:"2px 7px"}}>{f.pct}%</span>
              <span style={{fontSize:16,fontWeight:900,color:T.text}}>{f.count}</span>
            </div>
          </div>
          {openFascia===f.key&&(
            <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${f.color}44`,
              borderTop:"none",padding:"8px 10px"}}>
              {turniDiFascia(f.key).length===0?(
                <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun turno</div>
              ):turniDiFascia(f.key).map(([mid,cnt])=>{
                const m=modelli.find(x=>x.id===mid);
                if(!m) return null;
                const c=m.coloreCustom||f.color;
                return (
                  <div key={mid} style={{display:"flex",alignItems:"center",gap:8,
                    padding:"5px 6px",borderRadius:6,marginBottom:3,background:T.surface}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                    <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                    <span style={{fontSize:13,fontWeight:800,color:T.text}}>{cnt}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ConteggioConfigCard({T, r, cfg, data, totaleTurni, modelli, accent, fasceAutomatiche, onRename, onUpdateCfg, onGoToModelli}){
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r.label);
  const pct = totaleTurni>0 ? Math.round((data.totale/totaleTurni)*100) : 0;
  const [showTurniList, setShowTurniList] = useState(false);

  const pct1 = data.totale>0 ? Math.round(((data.primo||0)/data.totale)*100) : 0;
  const pct2 = data.totale>0 ? Math.round(((data.secondo||0)/data.totale)*100) : 0;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:10,color:T.sub,marginBottom:4}}>NOME REPORT</div>
        {editingName?(
          <div style={{display:"flex",gap:6}}>
            <input value={tmpName} onChange={e=>setTmpName(e.target.value)}
              style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"6px 10px",color:T.text,fontSize:13,outline:"none"}}/>
            <button onClick={()=>{onRename(tmpName);setEditingName(false);}}
              style={{background:accent,border:"none",borderRadius:8,color:"#fff",
                padding:"6px 12px",cursor:"pointer",fontWeight:800,fontSize:12}}>✓</button>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text,flex:1}}>{r.label}</span>
            <button onClick={()=>setEditingName(true)}
              style={{background:"none",border:"none",color:accent,cursor:"pointer",fontSize:16,padding:"0 4px"}}>✏️</button>
          </div>
        )}
      </div>

      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div onClick={()=>setShowTurniList(s=>!s)}
  style={{fontSize:10,color:T.sub,fontWeight:700,cursor:"pointer",
    display:"flex",alignItems:"center",gap:4}}>
  TOTALE TURNI {showTurniList?"▲":"▼"}
</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20,fontWeight:900,color:T.text}}>{data.totale}</span>

          </div>
        </div>
        {showTurniList&&(
  <div style={{background:T.s2,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <div style={{fontSize:10,color:T.sub,fontWeight:700}}>
        Assegna manualmente ogni modello al 1° o 2° TURNO
      </div>
      <button onClick={()=>{
          const next={...(cfg.fasceManuali||{})};
          Object.keys(data.perModello||{}).forEach(mid=>{
            const m=modelli.find(x=>x.id===mid);
            if(!m || m.tempo==="h24") return;
            const mins=oraInMinuti(m.inizio);
            if(mins===null) return;
            next[mid] = mins<720 ? "primo" : "secondo"; // prima delle 12:00 -> 1°, dopo -> 2°
          });
          onUpdateCfg({...cfg,fasceManuali:next});
        }}
        style={{fontSize:10,fontWeight:800,padding:"4px 8px",borderRadius:6,cursor:"pointer",
          background:accent,color:"#fff",border:"none"}}>
        Assegna automaticamente
      </button>
    </div>
    {Object.entries(data.perModello||{}).map(([mid,cnt])=>{
      const m=modelli.find(x=>x.id===mid);
      if(!m) return null;
      const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
      const fasceManuali=cfg.fasceManuali||{};
      const faseCorrente=fasceManuali[mid]||"";
      function setFascia(val){
        const next={...fasceManuali};
        if(val==="") delete next[mid];
        else next[mid]=val;
        onUpdateCfg({...cfg,fasceManuali:next});
      }
      return (
        <div key={mid} style={{display:"flex",alignItems:"center",gap:8,
          padding:"6px 8px",borderRadius:6,marginBottom:4,
          background:c+"10",border:`1px solid ${T.border}`}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
          <div style={{flex:1}}>
            <span style={{fontSize:12,fontWeight:700,color:T.text}}>{m.titolo}</span>
            <span style={{fontSize:10,color:T.sub,marginLeft:6}}>
              {m.tempo==="h24"?"H24":m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)}`:m.inizio&&m.fine?`${m.inizio} - ${m.fine}`:m.inizio||""}
            </span>
          </div>
          <span style={{fontSize:12,fontWeight:800,color:T.sub}}>{cnt}</span>
          <div style={{display:"flex",gap:3}}>
            <button onClick={()=>setFascia("primo")}
              style={{fontSize:10,fontWeight:800,padding:"4px 7px",borderRadius:6,cursor:"pointer",
                background:faseCorrente==="primo"?"#f59e0b":"transparent",
                color:faseCorrente==="primo"?"#fff":T.sub,
                border:`1px solid ${faseCorrente==="primo"?"#f59e0b":T.border}`}}>1°</button>
            <button onClick={()=>setFascia("secondo")}
              style={{fontSize:10,fontWeight:800,padding:"4px 7px",borderRadius:6,cursor:"pointer",
                background:faseCorrente==="secondo"?"#f97316":"transparent",
                color:faseCorrente==="secondo"?"#fff":T.sub,
                border:`1px solid ${faseCorrente==="secondo"?"#f97316":T.border}`}}>2°</button>
            <button onClick={()=>setFascia("")}
              style={{fontSize:10,fontWeight:800,padding:"4px 7px",borderRadius:6,cursor:"pointer",
                background:faseCorrente===""?T.sub:"transparent",
                color:faseCorrente===""?"#fff":T.sub,
                border:`1px solid ${T.border}`}}>—</button>
          </div>
        </div>
      );
    })}
  </div>
)}
        {totaleTurni>0&&(
          <div style={{height:6,background:T.s2,borderRadius:3,marginBottom:10,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",background:accent,borderRadius:3,transition:"width 0.3s"}}/>
          </div>
        )}
        <FasceExpand data={data} pct1={pct1} pct2={pct2} T={T} modelli={modelli} accent={accent} cfg={cfg}/>
      </div>

      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>APP / AUTO</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[
            {key:"app",  label:"APP",  color:"#3b82f6", count:data.app||0},
            {key:"auto", label:"AUTO", color:"#8b5cf6", count:data.auto||0},
          ].map(g=>(
            <div key={g.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 10px",background:g.color+"22",borderRadius:8,border:`1px solid ${g.color}44`}}>
              <span style={{fontSize:13,fontWeight:800,color:g.color}}>{g.label}</span>
              <span style={{fontSize:16,fontWeight:900,color:T.text}}>{g.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>FILTRA PER COLLEGA</div>
        <input
          type="text"
          value={cfg.filtraCollega||""}
          onChange={e=>onUpdateCfg({...cfg,filtraCollega:e.target.value})}
          placeholder="Nome collega..."
          style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:10,padding:"10px 14px",color:T.text,fontSize:13,
            outline:"none",boxSizing:"border-box"}}/>
      </div>

      {modelli.length>0&&data.perModello&&Object.keys(data.perModello).length>0&&(
        <div style={{background:T.surface,borderRadius:10,padding:12}}>
          <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>PER MODELLO</div>
          {Object.entries(data.perModello).map(([mid,cnt])=>{
            const m=modelli.find(x=>x.id===mid);
            if(!m) return null;
            const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
            const mp=data.totale>0?Math.round((cnt/data.totale)*100):0;
            return (
              <div key={mid} style={{display:"flex",alignItems:"center",gap:8,
                padding:"6px 8px",background:T.s2,borderRadius:6,marginBottom:4}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                <span style={{flex:1,fontSize:12,color:T.text}}>{m.titolo}</span>
                <span style={{fontSize:11,color:T.sub}}>{mp}%</span>
                <span style={{fontSize:14,fontWeight:800,color:T.text}}>{cnt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TurnazioneConfigCard({T, r, cfg, data, modelli, modelliOrdinati, accent, fasceAutomatiche, onRename, onUpdateCfg}){
  const modelliPerLista = modelliOrdinati || modelli;
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r.label);
  const [openModello, setOpenModello] = useState(null);
  const [openGruppo, setOpenGruppo] = useState(null);
  const pct1 = data.totale>0 ? Math.round(((data.primo||0)/data.totale)*100) : 0;
  const pct2 = data.totale>0 ? Math.round(((data.secondo||0)/data.totale)*100) : 0;
  const pctApp = data.totale>0 ? Math.round(((data.app||0)/data.totale)*100) : 0;
  const pctAuto = data.totale>0 ? Math.round(((data.auto||0)/data.totale)*100) : 0;

  function fmtData(dateKey){
    const [y,m,d] = dateKey.split("-");
    return `${d}/${m}/${y}`;
  }

  const gruppiManuali = cfg.gruppiManuali || {};
  function setGruppoModello(mid, gruppo){
    const next = {...gruppiManuali};
    if(!gruppo) delete next[mid];
    else next[mid] = gruppo;
    onUpdateCfg({...cfg, gruppiManuali:next});
  }

  const GRUPPI = [
    {key:"primo",  label:"1° TURNO", color:"#f59e0b", count:data.primo||0,  pct:pct1},
    {key:"secondo",label:"2° TURNO", color:"#f97316", count:data.secondo||0,pct:pct2},
    {key:"app",    label:"APP",      color:"#3b82f6", count:data.app||0,    pct:pctApp},
    {key:"auto",   label:"AUTO",     color:"#8b5cf6", count:data.auto||0,   pct:pctAuto},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:10,color:T.sub,marginBottom:4}}>NOME REPORT</div>
        {editingName?(
          <div style={{display:"flex",gap:6}}>
            <input value={tmpName} onChange={e=>setTmpName(e.target.value)}
              style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"6px 10px",color:T.text,fontSize:13,outline:"none"}}/>
            <button onClick={()=>{onRename(tmpName);setEditingName(false);}}
              style={{background:accent,border:"none",borderRadius:8,color:"#fff",
                padding:"6px 12px",cursor:"pointer",fontWeight:800,fontSize:12}}>✓</button>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text,flex:1}}>{r.label}</span>
            <button onClick={()=>setEditingName(true)}
              style={{background:"none",border:"none",color:accent,cursor:"pointer",fontSize:16,padding:"0 4px"}}>✏️</button>
          </div>
        )}
      </div>

      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:10,color:T.sub,fontWeight:700}}>TOTALE TURNI</span>
        <span style={{fontSize:20,fontWeight:900,color:T.text}}>{data.totale}</span>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {GRUPPI.map(f=>{
          const isOpen = openGruppo===f.key;
          return (
          <div key={f.key}>
            <div onClick={()=>setOpenGruppo(isOpen?null:f.key)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",
                padding:"8px 10px",background:f.color+"22",borderRadius:isOpen?"8px 8px 0 0":8,
                border:`1px solid ${f.color}44`}}>
              <span style={{fontSize:13,fontWeight:800,color:f.color}}>{f.label} {isOpen?"▲":"▼"}</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:700,color:f.color,background:f.color+"22",
                  borderRadius:6,padding:"2px 7px"}}>{f.pct}%</span>
                <span style={{fontSize:16,fontWeight:900,color:T.text}}>{f.count}</span>
              </div>
            </div>
            {isOpen&&(
              <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${f.color}44`,
                borderTop:"none",padding:"8px 10px"}}>
                {modelliPerLista.length===0?(
                  <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun modello</div>
                ):[...modelliPerLista].sort((a,b)=>{
                  const attA = gruppiManuali[a.id] ? gruppiManuali[a.id]===f.key : (data.perGruppo?.[f.key]?.[a.id]!==undefined);
                  const attB = gruppiManuali[b.id] ? gruppiManuali[b.id]===f.key : (data.perGruppo?.[f.key]?.[b.id]!==undefined);
                  if(attA!==attB) return attA?-1:1;
                  return 0;
                }).map(m=>{
                  const attivo = gruppiManuali[m.id]
                    ? gruppiManuali[m.id]===f.key
                    : (data.perGruppo?.[f.key]?.[m.id]!==undefined);
                  const info = data.perGruppo?.[f.key]?.[m.id];
                  const c = m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                  return (
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,
                      padding:"5px 6px",borderRadius:6,marginBottom:3,background:T.surface}}>
                      <input type="checkbox" checked={attivo}
                        onChange={()=>setGruppoModello(m.id, attivo?"":f.key)}
                        style={{cursor:"pointer",flexShrink:0}}/>
                      <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                      <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                      <span style={{fontSize:13,fontWeight:800,color:T.text}}>{info?.count||0}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
      </div>

      <div>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>FILTRA PER COLLEGA</div>
        <input
          type="text"
          value={cfg.filtraCollega||""}
          onChange={e=>onUpdateCfg({...cfg,filtraCollega:e.target.value})}
          placeholder="Nome collega..."
          style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:10,padding:"10px 14px",color:T.text,fontSize:13,
            outline:"none",boxSizing:"border-box"}}/>
      </div>

      {modelli.length>0&&data.perModello&&Object.keys(data.perModello).length>0&&(
        <div style={{background:T.surface,borderRadius:10,padding:12}}>
          <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>PER MODELLO</div>
          {Object.entries(data.perModello).map(([mid,info])=>{
            const m=modelli.find(x=>x.id===mid);
            if(!m) return null;
            const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
            const isOpen = openModello===mid;
            return (
              <div key={mid} style={{marginBottom:4}}>
                <div onClick={()=>setOpenModello(isOpen?null:mid)}
                  style={{display:"flex",alignItems:"center",gap:8,
                    padding:"6px 8px",background:T.s2,borderRadius:isOpen?"6px 6px 0 0":6,cursor:"pointer"}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                  <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                  <span style={{fontSize:14,fontWeight:800,color:T.text}}>{info.count}</span>
                  <span style={{fontSize:11,color:T.sub}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&(
                  <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",
                    borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",flexWrap:"wrap",gap:6}}>
                    {info.dates.map(dk=>(
                      <span key={dk} style={{fontSize:11,fontWeight:600,color:T.text,
                        background:c+"18",border:`1px solid ${c}44`,borderRadius:6,padding:"3px 7px"}}>
                        {fmtData(dk)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IndennitaConfig({T, values, setValues, calc, onSave}){
  const fasce = [
    { key:"diurno",          label:"Diurno (06:00 - 22:00)", count:calc.diurno },
    { key:"notturno",        label:"Notturno",                count:calc.notturno },
    { key:"festivo",         label:"Festivo",                 count:calc.festivo },
    { key:"notturno_festivo",label:"Notturno festivo",        count:calc.notturno_festivo },
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{fontSize:10,color:T.sub,marginBottom:2}}>Imposta il compenso per fascia oraria</div>
      {fasce.map(f=>(
        <div key={f.key} style={{background:T.surface,borderRadius:10,padding:"10px 12px",
          display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:T.text}}>{f.label}</div>
            <div style={{fontSize:11,color:T.sub}}>{f.count} turni nel periodo</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:13,color:T.sub}}>€</span>
            <input type="number" value={values[f.key]||""} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}
              onBlur={onSave} placeholder="0.00" step="0.01"
              style={{width:70,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                padding:"6px 8px",color:T.text,fontSize:13,outline:"none",textAlign:"right"}}/>
          </div>
        </div>
      ))}
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:800,color:T.text}}>Totale stimato</span>
        <span style={{fontSize:16,fontWeight:900,color:"#22c55e"}}>
          € {fasce.reduce((sum,f)=>{
            const v=parseFloat(values[f.key])||0;
            return sum+v*f.count;
          },0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function OrePerTurnoView({T, data}){
  return (
    <div style={{background:T.surface,borderRadius:10,padding:12}}>
      <div style={{fontSize:11,color:T.sub,marginBottom:8}}>Stima ore lavorate nel periodo</div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:T.sub}}>1° Turno</span>
        <span style={{fontWeight:800,color:T.text}}>{(data.primo||0)*6.25}h</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:T.sub}}>2° Turno</span>
        <span style={{fontWeight:800,color:T.text}}>{(data.secondo||0)*6.25}h</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:12,color:T.sub}}>Totale stimato</span>
        <span style={{fontWeight:900,fontSize:15,color:"#3b82f6"}}>{(data.totale-data.h24)*6.25}h</span>
      </div>
    </div>
  );
}

function StraordinariView({T, data, store, reportRange, modelliInclusi=[], reportCalIds=[]}){
  const {from, to} = reportRange || {from:"", to:""};

  let minPagamento = 0;
  let minRecupero  = 0;

  for(const [dateKey, calMap] of Object.entries(store?.events||{})){
    if(from && dateKey < from) continue;
    if(to   && dateKey > to  ) continue;
    for(const [cid, evts] of Object.entries(calMap)){
      if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
      for(const e of evts){
        if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
        const nota  = (e.note||"").toUpperCase();
        const auto  = (e.auto||"").toUpperCase();
        const matchProt = nota.match(/PROTRAZIONE[^+]*\+?(\d+)H(?:\s*(\d+)M)?/);
        const matchAnti = nota.match(/ANTICIPO[^0-9]*(\d+)H(?:\s*(\d+)M)?/);
        if(matchProt){
          const mins = parseInt(matchProt[1]||0)*60 + parseInt(matchProt[2]||0);
          if(auto.includes(":REC")) minRecupero  += mins;
          else                      minPagamento += mins;
        }
        if(matchAnti){
          const mins = parseInt(matchAnti[1]||0)*60 + parseInt(matchAnti[2]||0);
          minRecupero -= mins;
        }
      }
    }
  }

  function fmtMins(m){
    const sign = m < 0 ? "-" : "+";
    const abs  = Math.abs(m);
    const h    = Math.floor(abs/60);
    const min  = abs%60;
    return sign + h + "h" + (min>0?" "+min+"m":"");
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>
          PROTRAZIONE A PAGAMENTO
        </div>
        {minPagamento===0?(
          <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>
            Nessuna protrazione a pagamento nel periodo
          </div>
        ):(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"10px 12px",background:"#8b5cf622",borderRadius:8,border:"1px solid #8b5cf644"}}>
            <span style={{fontSize:13,fontWeight:700,color:"#8b5cf6"}}>Totale</span>
            <span style={{fontSize:20,fontWeight:900,color:"#8b5cf6"}}>{fmtMins(minPagamento)}</span>
          </div>
        )}
      </div>

      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>
          SALDO RECUPERO
        </div>
        {minRecupero===0?(
          <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>
            Nessuna protrazione a recupero nel periodo
          </div>
        ):(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"10px 12px",
            background:minRecupero>=0?"#22c55e22":"#ef444422",
            borderRadius:8,
            border:`1px solid ${minRecupero>=0?"#22c55e44":"#ef444444"}`}}>
            <span style={{fontSize:13,fontWeight:700,
              color:minRecupero>=0?"#22c55e":"#ef4444"}}>
              {minRecupero>=0?"Credito":"Debito"}
            </span>
            <span style={{fontSize:20,fontWeight:900,
              color:minRecupero>=0?"#22c55e":"#ef4444"}}>
              {fmtMins(minRecupero)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function GuadagniView({T, indennita, calc}){
  const tot = ["diurno","notturno","festivo","notturno_festivo"].reduce((s,k)=>{
    return s+(parseFloat(indennita[k])||0)*calc[k];
  },0);
  return (
    <div style={{background:T.surface,borderRadius:10,padding:12}}>
      <div style={{fontSize:11,color:T.sub,marginBottom:8}}>Stima guadagni da indennità</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:14,fontWeight:800,color:T.text}}>Totale periodo</span>
        <span style={{fontSize:20,fontWeight:900,color:"#22c55e"}}>€ {tot.toFixed(2)}</span>
      </div>
    </div>
  );
}
// #endregion


// #region SEZIONE 24: SHARED UI COMPONENTS (Pal, ColorRow, Sec)
// ═══════════════════════════════════════════════════════════════
function hexToRgbObj(hex){
  const h=hex.replace("#","");
  return {
    r: parseInt(h.substring(0,2),16)||0,
    g: parseInt(h.substring(2,4),16)||0,
    b: parseInt(h.substring(4,6),16)||0,
  };
}
function rgbToHex(r,g,b){
  const clamp=v=>Math.max(0,Math.min(255,Math.round(v||0)));
  return "#"+[clamp(r),clamp(g),clamp(b)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function hsvToRgb(h,s,v){
  h=h/360; s=s/100; v=v/100;
  let r,g,b;
  const i=Math.floor(h*6);
  const f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  switch(i%6){
    case 0: r=v;g=t;b=p; break;
    case 1: r=q;g=v;b=p; break;
    case 2: r=p;g=v;b=t; break;
    case 3: r=p;g=q;b=v; break;
    case 4: r=t;g=p;b=v; break;
    default:r=v;g=p;b=q;
  }
  return {r:r*255,g:g*255,b:b*255};
}
function rgbToHsv(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  const d=max-min;
  let h=0;
  if(d!==0){
    if(max===r) h=((g-b)/d)%6;
    else if(max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60; if(h<0) h+=360;
  }
  const s=max===0?0:d/max;
  return {h, s:s*100, v:max*100};
}

function HexColorPicker({T, value, onChange}){
  const rgb0=hexToRgbObj(value||"#3b82f6");
  const hsv0=rgbToHsv(rgb0.r,rgb0.g,rgb0.b);
  const [hue, setHue] = useState(hsv0.h);
  const [sv, setSv] = useState({s:hsv0.s, v:hsv0.v});
  const [hexInput, setHexInput] = useState((value||"#3b82f6").toUpperCase());
  const svRef = useRef(null);
  const dragging = useRef(false);

  useEffect(()=>{
    const rgb=hexToRgbObj(value||"#3b82f6");
    const hsv=rgbToHsv(rgb.r,rgb.g,rgb.b);
    setHue(hsv.h); setSv({s:hsv.s, v:hsv.v});
    setHexInput((value||"#3b82f6").toUpperCase());
  }, [value]);

  function emit(newHue, newS, newV){
    const rgb=hsvToRgb(newHue,newS,newV);
    const hex=rgbToHex(rgb.r,rgb.g,rgb.b);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  }

  function handleSvPointer(e){
    const rect=svRef.current.getBoundingClientRect();
    const clientX = e.touches?e.touches[0].clientX:e.clientX;
    const clientY = e.touches?e.touches[0].clientY:e.clientY;
    let x=(clientX-rect.left)/rect.width;
    let y=(clientY-rect.top)/rect.height;
    x=Math.max(0,Math.min(1,x));
    y=Math.max(0,Math.min(1,y));
    const newS=x*100, newV=(1-y)*100;
    setSv({s:newS, v:newV});
    emit(hue, newS, newV);
  }

  const rgbNow = hsvToRgb(hue, sv.s, sv.v);
  const hueColor = rgbToHex(...Object.values(hsvToRgb(hue,100,100)));

  function updateRgbField(field, val){
    const n = Math.max(0, Math.min(255, parseInt(val)||0));
    const cur = hsvToRgb(hue, sv.s, sv.v);
    const newRgb = {r:cur.r, g:cur.g, b:cur.b, [field]:n};
    const hsv = rgbToHsv(newRgb.r, newRgb.g, newRgb.b);
    setHue(hsv.h); setSv({s:hsv.s, v:hsv.v});
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  }

  function commitHexInput(val){
    let h = val.trim();
    if(!h.startsWith("#")) h = "#"+h;
    if(/^#[0-9A-Fa-f]{6}$/.test(h)){
      const rgb = hexToRgbObj(h);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      setHue(hsv.h); setSv({s:hsv.s, v:hsv.v});
      onChange(h);
    }
    setHexInput(h.toUpperCase());
  }

  return (
    <div>
      <div ref={svRef}
        onMouseDown={e=>{dragging.current=true; handleSvPointer(e);}}
        onMouseMove={e=>{if(dragging.current) handleSvPointer(e);}}
        onMouseUp={()=>{dragging.current=false;}}
        onMouseLeave={()=>{dragging.current=false;}}
        onTouchStart={e=>{dragging.current=true; handleSvPointer(e);}}
        onTouchMove={e=>{e.preventDefault(); handleSvPointer(e);}}
        onTouchEnd={()=>{dragging.current=false;}}
        style={{
          position:"relative", width:"100%", height:140, borderRadius:10,
          background:`linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          cursor:"crosshair", touchAction:"none", marginBottom:12,
        }}>
        <div style={{
          position:"absolute",
          left:`${sv.s}%`, top:`${100-sv.v}%`,
          width:16, height:16, borderRadius:"50%",
          border:"2px solid #fff", boxShadow:"0 0 0 1px rgba(0,0,0,0.4)",
          transform:"translate(-50%,-50%)", pointerEvents:"none",
          background:rgbToHex(rgbNow.r,rgbNow.g,rgbNow.b),
        }}/>
      </div>

      <input type="range" min="0" max="360" value={hue}
        onChange={e=>{ const h=Number(e.target.value); setHue(h); emit(h, sv.s, sv.v); }}
        style={{
          width:"100%", height:14, marginBottom:14, borderRadius:7, appearance:"none",
          background:"linear-gradient(to right, #f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
          cursor:"pointer",
        }}/>

      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:36,height:36,borderRadius:8,flexShrink:0,
          background:rgbToHex(rgbNow.r,rgbNow.g,rgbNow.b),
          border:`2px solid ${T.border}`}}/>
        <input value={hexInput}
          onChange={e=>setHexInput(e.target.value.toUpperCase())}
          onBlur={e=>commitHexInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter") commitHexInput(e.target.value); }}
          placeholder="#RRGGBB"
          style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
            padding:"8px 10px",color:T.text,fontSize:14,fontWeight:700,
            outline:"none",boxSizing:"border-box",fontFamily:"monospace"}}/>
      </div>

      <div style={{display:"flex",gap:8}}>
        {[["r","R"],["g","G"],["b","B"]].map(([field,label])=>(
          <div key={field} style={{flex:1}}>
            <div style={{fontSize:9,color:T.sub,fontWeight:700,marginBottom:3,textAlign:"center"}}>{label}</div>
            <input type="number" min="0" max="255"
              value={Math.round(rgbNow[field])}
              onChange={e=>updateRgbField(field, e.target.value)}
              style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                padding:"6px 4px",color:T.text,fontSize:13,textAlign:"center",
                outline:"none",boxSizing:"border-box"}}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorPickerModal({T, cur, onPick, onClose, coloriUsati=null, title="Scegli colore"}){
  const [pos,setPos]=useState(null); // null = centrato di default
  const dragState = useRef(null);
  const boxRef = useRef(null);

  function startDrag(e){
    const clientX = e.touches?e.touches[0].clientX:e.clientX;
    const clientY = e.touches?e.touches[0].clientY:e.clientY;
    const rect = boxRef.current.getBoundingClientRect();
    dragState.current = { offX: clientX-rect.left, offY: clientY-rect.top };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", onDrag, {passive:false});
    window.addEventListener("touchend", stopDrag);
  }
  function onDrag(e){
    if(!dragState.current) return;
    if(e.touches) e.preventDefault();
    const clientX = e.touches?e.touches[0].clientX:e.clientX;
    const clientY = e.touches?e.touches[0].clientY:e.clientY;
    setPos({ left: clientX-dragState.current.offX, top: clientY-dragState.current.offY });
  }
  function stopDrag(){
    dragState.current = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("touchmove", onDrag);
    window.removeEventListener("touchend", stopDrag);
  }
  useEffect(()=>()=>stopDrag(), []);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:900,
      display:pos?"block":"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div ref={boxRef}
        style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:340,
          maxHeight:"88vh",overflowY:"auto",padding:18,
          ...(pos?{position:"fixed",left:pos.left,top:pos.top,margin:0}:{})}}
        onClick={e=>e.stopPropagation()}>
        <div onMouseDown={startDrag} onTouchStart={startDrag}
          style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,cursor:"grab",userSelect:"none"}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:cur,border:`2px solid ${T.border}`,flexShrink:0}}/>
          <div style={{fontSize:16,fontWeight:900,color:T.text,flex:1}}>{title}</div>
          <button onClick={onClose}
            style={{background:"none",border:"none",fontSize:18,color:T.sub,cursor:"pointer",padding:4,lineHeight:1}}>✕</button>
        </div>

        {coloriUsati&&coloriUsati.length>0&&(
          <>
            <div style={{fontSize:12,color:T.sub,fontWeight:700,marginBottom:8}}>USATI</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:16}}>
              {coloriUsati.map(p=>(
                <div key={p} onClick={()=>onPick(p)}
                  style={{width:32,height:32,borderRadius:"50%",background:p,cursor:"pointer",
                    outline:cur===p?`3px solid ${T.text}`:"none",outlineOffset:2,flexShrink:0}}/>
              ))}
              <div onClick={()=>{
                  const hexBox = boxRef.current?.querySelector("[data-hex-picker]");
                  hexBox?.scrollIntoView({behavior:"smooth", block:"center"});
                }}
                title="Aggiungi un colore nuovo"
                style={{width:32,height:32,borderRadius:"50%",background:T.s2,cursor:"pointer",
                  border:`1.5px dashed ${T.sub}`,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:18,fontWeight:800,color:T.sub,lineHeight:1,flexShrink:0}}>+</div>
            </div>
          </>
        )}

        <div data-hex-picker style={{fontSize:12,color:T.sub,fontWeight:700,marginBottom:8}}>Colore personalizzato (HEX)</div>
        <HexColorPicker T={T} value={cur} onChange={onPick}/>
      </div>
    </div>
  );
}

function ColorRow({T, hex, label, sub, count, onClick, onRemove}){
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onClick}>
      <div style={{width:32,height:32,borderRadius:"50%",background:hex,
        border:`2px solid ${T.border}`,flexShrink:0,marginRight:12}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text}}>{label}</div>
        <div style={{fontSize:11,color:T.sub}}>{sub}</div>
      </div>
      <div style={{fontSize:12,fontWeight:700,color:T.sub,marginRight:8}}>
        {count} {count===1?"modello":"modelli"}
      </div>
      {onRemove&&(
        <button onClick={e=>{e.stopPropagation();onRemove();}}
          style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:2}}>×</button>
      )}
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}

function SecCollapsible({label,children,T}){
  const [open,setOpen]=useState(false);
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,
      borderRadius:12,marginBottom:14}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"12px 14px",cursor:"pointer"}}>
        <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.8px"}}>{label}</div>
        <span style={{color:T.sub,fontSize:12}}>{open?"▲":"▼"}</span>
      </div>
      {open&&<div style={{padding:"0 14px 14px"}}>{children}</div>}
    </div>
  );
}

function Sec({label,children,T}){
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,
      borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.8px",marginBottom:10}}>{label}</div>
      {children}
    </div>
  );
}
// #endregion


// #region SEZIONE 25: MODELLO CARD & FORM (fix: colore libero via palette condivisa)
// ═══════════════════════════════════════════════════════════════
// Pulsante freccia con feedback "pressed": si schiaccia leggermente e cambia
// colore/ombra appena riceve il tap/click, così l'utente capisce subito che
// l'input è stato ricevuto anche prima che la lista si riordini.
function PressableArrow({ onClick, accent, children, disabled, title }){
  const [pressed, setPressed] = useState(false);
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={e=>{ e.stopPropagation(); if(!disabled) onClick(); }}
      onMouseDown={()=>!disabled&&setPressed(true)}
      onMouseUp={()=>setPressed(false)}
      onMouseLeave={()=>setPressed(false)}
      onTouchStart={()=>!disabled&&setPressed(true)}
      onTouchEnd={()=>setPressed(false)}
      onTouchCancel={()=>setPressed(false)}
      style={{
        background:disabled?"#f8fafc":(pressed?accent:"#f1f5f9"),
        border:`1px solid ${disabled?"#e2e8f0":(pressed?accent:"#e2e8f0")}`,
        borderRadius:8,
        color:disabled?"#cbd5e1":(pressed?"#fff":"#475569"),
        cursor:disabled?"default":"pointer",
        fontSize:20,
        padding:"6px 10px",
        minWidth:36,minHeight:36,
        display:"flex",alignItems:"center",justifyContent:"center",
        marginRight:2,
        transform:pressed?"scale(0.88)":"scale(1)",
        boxShadow:pressed?"inset 0 2px 4px rgba(0,0,0,0.18)":"0 1px 2px rgba(0,0,0,0.04)",
        transition:"transform 0.08s ease, background 0.08s ease, box-shadow 0.08s ease, border-color 0.08s ease"
      }}>
      {children}
    </button>
  );
}

function ModelloCard({m, T, accent, fasceAutomatiche, onEdit, onDelete, onMoveUp, onMoveDown, onDragStart, onDragOver, onDrop, onDragEnd, onTouchStart, onTouchMove, onTouchEnd, selectMode, selected, onToggleSelect, isDragging, isDropTarget}){
  const colore=m.coloreCustom||(m.tempo==="h24"?"#64748b":getColorByTime(m.inizio, fasceAutomatiche));
  const durata=m.tempo==="h24"?"Tutto il giorno"
    :m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)} • 6h 15m`
    :m.inizio&&m.fine?`${m.inizio} - ${m.fine} • ${calcDurata(m.inizio,m.fine)}`
    :m.inizio?m.inizio:"";
  return (
    <div
      draggable={!!(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={e=>{e.preventDefault();if(onDragOver)onDragOver(e);}}
      onDrop={e=>{e.preventDefault();if(onDrop)onDrop(e);}}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      data-modello-id={m.id}
      style={{display:"flex",alignItems:"center",padding:"12px 14px",
        cursor:selectMode?"pointer":(onDragStart?"grab":"pointer"),
        touchAction:onTouchStart?"none":"auto",
        // Il modello trascinato appare più trasparente: segnala che è "in volo".
        opacity:isDragging?0.35:1,
        // Quando la card è il bersaglio corrente del trascinamento, la si mostra
        // già come se il modello trascinato fosse stato lasciato lì (anteprima
        // della posizione finale), con un bordo tratteggiato leggero.
        background:isDropTarget?(accent+"14"):"transparent",
        outline:isDropTarget?`2px dashed ${accent}88`:"none",
        outlineOffset:isDropTarget?"-2px":"0",
        transition:"opacity 0.15s ease, background 0.15s ease, outline-color 0.15s ease"}}
      onClick={selectMode?onToggleSelect:onEdit}>
      {selectMode&&(
        <div style={{width:20,height:20,borderRadius:6,marginRight:10,flexShrink:0,
          border:`2px solid ${selected?accent:T.border}`,
          background:selected?accent:"transparent",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          {selected&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
        </div>
      )}
      <div style={{width:36,height:36,borderRadius:10,background:colore+"33",
        border:`2px solid ${colore}`,display:"flex",alignItems:"center",justifyContent:"center",
        flexShrink:0,marginRight:12}}>
        <div style={{width:14,height:14,borderRadius:"50%",background:colore}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub,marginTop:1}}>{durata}</div>
      </div>
      {onMoveUp&&<PressableArrow accent={accent} onClick={onMoveUp} title="Sposta su">▲</PressableArrow>}
      {onMoveDown&&<PressableArrow accent={accent} onClick={onMoveDown} title="Sposta giù">▼</PressableArrow>}
      {!selectMode&&<button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questo modello?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,
          padding:"0 4px",marginRight:4}}>×</button>}
      {!selectMode&&<span style={{color:T.sub,fontSize:14}}>›</span>}
    </div>
  );
}


function ModelForm({T, form, setForm, accent, dark, fasceAutomatiche, modelli=[], onSave}){
  const autoColore=form.tempo==="h24"?"#64748b":getColorByTime(form.inizio, fasceAutomatiche);
  const coloreVis=form.coloreCustom||autoColore;
  const fineAuto=form.tempo==="6h15"&&form.inizio?calcFine6h15(form.inizio):null;
  const [showPal,setShowPal]=useState(false);
  return (
    <div style={{padding:"16px 14px 40px"}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:8}}>
        <input value={form.titolo} onChange={e=>setForm(f=>({...f,titolo:e.target.value.toUpperCase()}))}
          placeholder="TITOLO / CODICE (es. 00-06)"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <input value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value.toUpperCase()}))}
          placeholder="NOME DA MOSTRARE NEL CALENDARIO (es. NOTTE)"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>DURATA TURNO</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["h24","H24"],["6h15","6h 15m"],["personalizzato","Personalizzato"]].map(([v,l])=>(
          <button key={v} onClick={()=>setForm(f=>({...f,tempo:v, categoriaAppAuto: v==="h24" ? "" : f.categoriaAppAuto}))}
            style={{flex:1,padding:"10px 4px",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:12,
              background:form.tempo===v?accent:T.s2,
              color:form.tempo===v?"#fff":T.sub}}>{l}</button>
        ))}
      </div>
      {form.tempo!=="h24"&&(
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
            <span style={{flex:1,fontSize:15,color:T.text}}>Inizio</span>
            <input type="time" value={form.inizio} onChange={e=>setForm(f=>({...f,inizio:e.target.value}))}
              style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:15,fontWeight:700}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",padding:"14px 16px"}}>
            <span style={{flex:1,fontSize:15,color:T.text}}>Fine</span>
            {form.tempo==="6h15"&&fineAuto?(
              <span style={{fontSize:15,fontWeight:700,color:T.sub}}>{fineAuto} (auto)</span>
            ):(
              <input type="time" value={form.fine} onChange={e=>setForm(f=>({...f,fine:e.target.value}))}
                style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:15,fontWeight:700}}/>
            )}
          </div>
        </div>
      )}
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>CATEGORIA TURNO (per report Turnazione)</div>
      {(()=>{
        // ── Due gruppi indipendenti, ciascuno con la propria "Automatica" e
        // il proprio campo dati: form.categoria (TURNO) e form.categoriaAppAuto
        // (APP/AUTO). Non sono collegati fra loro in nessun modo.
        const catAutoTurno = categoriaTurnoAutomatica(form);
        const catAutoAppAuto = categoriaAppAutoAutomatica(form);
        const renderBtn=(campo, catAuto, flagCampo)=>([v,l])=>{
          const valoreAttuale = form[campo]||"";
          const selezionato = valoreAttuale===v && !form[flagCampo];
          const suggeritoDaAuto = !valoreAttuale && v!=="" && v===catAuto && !form[flagCampo];
          const nuovoValore = (selezionato && v!=="") ? "" : v;
          return (
            <button key={v||l} onClick={()=>setForm(f=>({...f,[campo]:nuovoValore,[flagCampo]:false}))}
              style={{flex:"1 1 30%",padding:"9px 4px",borderRadius:10,cursor:"pointer",
                fontWeight:700,fontSize:11,
                border:suggeritoDaAuto?`2px solid ${accent}`:"2px solid transparent",
                background:selezionato?accent:T.s2,
                color:selezionato?"#fff":(suggeritoDaAuto?accent:T.sub)}}>{l}</button>
          );
        };
        const renderDeselBtn=(flagCampo, campo)=>{
          const attivo = !!form[flagCampo];
          return (
            <button onClick={()=>setForm(f=>({...f,[flagCampo]:!attivo,[campo]: !attivo ? "" : f[campo]}))}
              style={{marginTop:6,marginBottom:10,width:"100%",padding:"7px 4px",borderRadius:10,
                border:attivo?"2px solid #ef4444":"2px solid transparent",cursor:"pointer",
                fontWeight:700,fontSize:11,
                background:attivo?"#ef444422":"transparent",
                color:"#ef4444"}}>
              {attivo?"✓ Nessuna categoria (riattiva per tornare all'automatismo)":"Nessuna categoria per questo asse"}
            </button>
          );
        };
        const isH24 = form.tempo==="h24";
        return (
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              {[["","Automatica"],["primo","1° Turno"],["secondo","2° Turno"]].map(renderBtn("categoria", catAutoTurno, "turnoVuoto"))}
            </div>
            {renderDeselBtn("turnoVuoto","categoria")}
            {!isH24 && (
              <>
                <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>CATEGORIA APP/AUTO (per report Turnazione)</div>
                <div style={{display:"flex",gap:6}}>
                  {[["","Automatica"],["app","APP"],["auto","AUTO"]].map(renderBtn("categoriaAppAuto", catAutoAppAuto, "appAutoVuoto"))}
                </div>
                {renderDeselBtn("appAutoVuoto","categoriaAppAuto")}
              </>
            )}
          </div>
        );
      })()}
      <div style={{fontSize:11,color:T.sub,marginTop:-10,marginBottom:16,paddingLeft:4}}>
        "Automatica" decide da sola in base a titolo/orario. Scegliendo una categoria qui, ogni evento creato da questo modello finirà sempre in quel gruppo nel report Turnazione.
      </div>
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>COLORE</div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 14px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:coloreVis,
            border:`3px solid ${T.border}`,cursor:"pointer",flexShrink:0}}
            onClick={()=>setShowPal(s=>!s)}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text}}>
              {form.coloreCustom?"Personalizzato":`Auto — ${form.tempo==="h24"?"H24":getColorLabel(form.inizio, fasceAutomatiche)||"imposta orario"}`}
            </div>
            <div style={{fontSize:11,color:T.sub,marginTop:2}}>
              Tocca il cerchio per scegliere un colore qualsiasi dalla palette condivisa.
              Comparirà anche in Modelli → Colori.
            </div>
          </div>
          {form.coloreCustom&&(
            <button onClick={()=>setForm(f=>({...f,coloreCustom:null}))}
              style={{background:"none",border:"none",color:T.sub,fontSize:11,cursor:"pointer",flexShrink:0}}>↩ auto</button>
          )}
        </div>
        {showPal&&(
          <ColorPickerModal T={T} cur={coloreVis} title="Colore modello"
            coloriUsati={[...new Set(modelli.map(m=>m.coloreCustom||(m.tempo==="h24"?COLORE_H24:getColorByTime(m.inizio, fasceAutomatiche))).filter(Boolean))]}
            onPick={p=>setForm(f=>({...f,coloreCustom:p}))}
            onClose={()=>setShowPal(false)}/>
        )}
      </div>

      <button onClick={onSave}
        style={{width:"100%",background:accent,border:"none",borderRadius:14,
          color:"#fff",padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
        💾 Salva modello
      </button>
    </div>
  );
}

const NB={background:"none",border:"none",fontSize:22,cursor:"pointer",
  padding:"0 4px",lineHeight:1,flexShrink:0,color:"rgba(255,255,255,0.8)"};
// #endregion


// #region SEZIONE 26: ROTAZIONE COMPONENTS
// ═══════════════════════════════════════════════════════════════
function RotazioneCard({r, T, accent, modelli, onOpen, onEdit, onDelete}){
  const tipoLabel = r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL / RS classico":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":" Personalizzata";
  const modelloLav = modelli.find(m=>m.id===r.modellaLavoroId);
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onOpen}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
        {modelloLav&&<div style={{fontSize:11,color:T.sub,marginTop:1}}>Modello: {modelloLav.titolo}</div>}
      </div>
      {onEdit&&<button onClick={e=>{e.stopPropagation();onEdit();}}
        style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:16,padding:"0 8px",marginRight:2}}>✏️</button>}
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questa rotazione?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:4}}>×</button>
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}

function RotazioneForm({T, form, setForm, accent, modelli, onSave, sortedModelli}){
  return (
    <div style={{padding:"16px 14px 40px"}}>
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>TIPO DI ROTAZIONE</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {[
          ["personalizzata"," Personalizzata"],
          ["domeniche","🗓 Domeniche 1/4"],
          ["nlrs","🔄 NL/RS classico"],
          ["nlrs_scalante","📅 RS/NL scalante"],
        ].map(([v,l])=>(
          <button key={v} onClick={()=>setForm(f=>({...f,tipo:v}))}
            style={{flex:"1 1 40%",padding:"10px 4px",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:11,
              background:form.tipo===v?accent:T.s2,
              color:form.tipo===v?"#fff":T.sub}}>{l}</button>
        ))}
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <input value={form.titolo} onChange={e=>setForm(f=>({...f,titolo:e.target.value}))}
          placeholder="TITOLO ROTAZIONE"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>
      
      {form.tipo==="domeniche"&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>MODELLI</div>
          <div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:10,
            padding:"10px 12px",marginBottom:10,fontSize:12,color:T.sub}}>
            🗓 Ciclo 4 domeniche: 1ª = LAVORO (festivo), 2ª 3ª 4ª = Riposo (colore libero sul calendario)
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ModelloSelector label="Domenica LAVORO (festivo)" value={form.modellaLavoroId}
              onChange={id=>setForm(f=>({...f,modellaLavoroId:id}))} modelli={modelli} T={T} required sortedModelli={sortedModelli}/>
            <ModelloSelector label="Domenica riposo (opzionale)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} last sortedModelli={sortedModelli}/>
          </div>
        </div>
      )}
      {form.tipo==="nlrs"&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>MODELLI</div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} sortedModelli={sortedModelli}/>
            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))} modelli={modelli} T={T} last sortedModelli={sortedModelli}/>
          </div>
        </div>
      )}
      {form.tipo==="nlrs_scalante"&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>
            MODELLI RS / NL SCALANTE
          </div>
          <div style={{background:"#3b82f611",border:"1px solid #3b82f633",borderRadius:10,
            padding:"10px 12px",marginBottom:10,fontSize:12,color:T.sub}}>
            📅 Ciclo: RS venerdì → NL venerdì+7gg → 2 sett. pausa → RS giovedì → NL giovedì+7gg → 2 sett. pausa → RS mercoledì → ... (salta domenica)
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))} modelli={modelli} T={T} sortedModelli={sortedModelli}/>
            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} last sortedModelli={sortedModelli}/>
          </div>
        </div>
      )}
      <button onClick={onSave}
        style={{width:"100%",background:accent,border:"none",borderRadius:14,
          color:"#fff",padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
        💾 Salva rotazione
      </button>
    </div>
  );
}

function ModelloSelector({label, value, onChange, modelli, T, required=false, last=false, sortedModelli}){
  const sel = modelli.find(m=>m.id===value);
  const [open, setOpen] = useState(false);
  const colore = sel?(sel.coloreCustom||getColorByTime(sel.inizio)):"#94a3b8";
  const listaOrdinata = sortedModelli || modelli;
  return (
    <div style={{borderBottom:last?"none":`1px solid ${T.border}`}}>
      <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}
        onClick={()=>setOpen(o=>!o)}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,color:T.sub,marginBottom:2}}>{label}</div>
          {sel?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:colore}}/>
              <span style={{fontSize:14,fontWeight:700,color:T.text}}>{sel.titolo}</span>
            </div>
          ):(
            <span style={{fontSize:13,color:T.sub,fontStyle:"italic"}}>{required?"Seleziona...":"Nessuno (opzionale)"}</span>
          )}
        </div>
        <span style={{color:T.sub,fontSize:12}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{background:T.s2,padding:"6px 0"}}>
          {!required&&(
            <div onClick={()=>{onChange(null);setOpen(false);}}
              style={{padding:"10px 16px",fontSize:13,color:T.sub,cursor:"pointer",
                background:!value?"rgba(0,0,0,0.05)":"transparent"}}>
              — Nessuno
            </div>
          )}
          {listaOrdinata.map(m=>{
            const c=m.coloreCustom||getColorByTime(m.inizio);
            return (
              <div key={m.id} onClick={()=>{onChange(m.id);setOpen(false);}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
                  cursor:"pointer",background:value===m.id?"rgba(0,0,0,0.05)":"transparent"}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:c,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>{m.titolo}</div>
                  <div style={{fontSize:11,color:T.sub}}>
                    {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.tempo==="6h15"?` - ${calcFine6h15(m.inizio)}`:m.fine?` - ${m.fine}`:""}`:m.tempo}
                  </div>
                </div>
                {value===m.id&&<span style={{color:"#3b82f6"}}>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GrigliaRotazione({rot, T, accent, modelli, fasceAutomatiche, onUpdate}){
  const [selModello, setSelModello] = useState(modelli[0]?.id||null);
  const griglia = rot.griglia||{};
  function getDays(){
    const days=[];
    const inizio=rot.dataInizio?new Date(rot.dataInizio):new Date(new Date().getFullYear(),0,1);
    const nDays=(rot.nSettimane||52)*7;
    for(let i=0;i<nDays;i++){
      const d=new Date(inizio); d.setDate(d.getDate()+i);
      const key=dkey(d.getFullYear(),d.getMonth(),d.getDate());
      days.push({key, date:d, dow:d.getDay()});
    }
    return days;
  }
  const days=getDays();
  const weeks=[];
  for(let i=0;i<days.length;i+=7) weeks.push(days.slice(i,i+7));
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"8px 8px 0"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:2}}>
          <div style={{gridColumn:"1",display:"flex",flexDirection:"column",gap:2,paddingTop:20}}>
            {weeks.map((_,wi)=>(
              <div key={wi} style={{height:32,display:"flex",alignItems:"center",
                fontSize:9,color:T.sub,fontWeight:700,justifyContent:"center"}}>{wi+1}</div>
            ))}
          </div>
          <div style={{gridColumn:"2/9",display:"flex",flexDirection:"column",gap:2}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
              {["L","M","M","G","V","S","D"].map((d,i)=>(
                <div key={i} style={{textAlign:"center",fontSize:9,fontWeight:800,
                  color:i===6?"#ef4444":T.sub,padding:"2px 0"}}>{d}</div>
              ))}
            </div>
            {weeks.map((week,wi)=>(
              <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                {week.map(day=>{
                  const m=modelli.find(m=>m.id===griglia[day.key]);
                  const c=m?(m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche)):null;
                  const isDOM=day.dow===0;
                  return (
                    <div key={day.key}
                      onClick={()=>{
                        const newG={...griglia};
                        if(newG[day.key]===selModello) delete newG[day.key];
                        else newG[day.key]=selModello;
                        onUpdate(newG);
                      }}
                      style={{height:32,borderRadius:6,cursor:"pointer",
                        background:c||(isDOM?(T.bg==="#f1f5f9"?"#fff5f5":"#2d0a0a"):T.s2),
                        border:`1px solid ${c?c+"88":T.border}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:9,fontWeight:700,color:c?"#fff":T.sub}}>
                      {m?m.titolo.slice(0,3):day.date.getDate()}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{borderTop:`1px solid ${T.border}`,background:T.surface,
        padding:"8px 8px",overflowX:"auto",display:"flex",gap:8,flexShrink:0}}>
        {modelli.map(m=>{
          const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
          return (
            <button key={m.id} onClick={()=>setSelModello(m.id)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                background:selModello===m.id?c+"22":"transparent",
                border:`2px solid ${selModello===m.id?c:T.border}`,
                borderRadius:10,padding:"6px 10px",cursor:"pointer",flexShrink:0,minWidth:60}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:c}}/>
              <span style={{fontSize:9,fontWeight:700,color:selModello===m.id?c:T.sub,
                textAlign:"center",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {m.titolo}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Preprocessing immagine per migliorare la lettura OCR: upscaling, scala di grigi
// pesata, binarizzazione ad alto contrasto (bianco/nero netto). Restituisce un
// nuovo File (stesso nome, tipo image/png) pronto per Tesseract.
async function preprocessaImmagine(file){
  const bitmap = await createImageBitmap(file);
  const SCALA = 2; // upscaling 2x per migliorare la lettura di caratteri piccoli
  const w = bitmap.width * SCALA;
  const h = bitmap.height * SCALA;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  // Scala di grigi pesata (luminanza percettiva) + soglia di binarizzazione fissa.
  // La soglia 150 è un compromesso ragionevole per foto di tabelle stampate
  // scattate con smartphone in condizioni di luce normali.
  const SOGLIA = 150;
  for(let i=0; i<px.length; i+=4){
    const grigio = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2];
    const bn = grigio >= SOGLIA ? 255 : 0;
    px[i] = bn; px[i+1] = bn; px[i+2] = bn;
  }
  ctx.putImageData(imgData, 0, 0);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  return new File([blob], (file.name||"foto") + "-preproc.png", { type: "image/png" });
}

function ImportaFotoDialog({T, accent, dark, modelli, year, month, onClose, onConfirm}){
  const [step, setStep] = useState("scegli-tipo"); // scegli-tipo | upload | ocr | chiedi-gemini | gemini-ocr | incolla-json | riepilogo
  const [tipoTabella, setTipoTabella] = useState(null); // "personale" | "stella"
  const [imgPreviewUrl, setImgPreviewUrl] = useState(null);
  const [progresso, setProgresso] = useState(0);
  const [errore, setErrore] = useState("");
  const [confidenzaRaggiunta, setConfidenzaRaggiunta] = useState(null); // ultima confidenza OCR calcolata (0-100)
  const [nessunTurnoRilevato, setNessunTurnoRilevato] = useState(false); // true se l'OCR non ha trovato nessuna parola simile a un turno noto
  const [testoJsonIncollato, setTestoJsonIncollato] = useState("");
  const [nRigheAggiunte, setNRigheAggiunte] = useState(0);
  const [importando, setImportando] = useState(false); // true durante l'elaborazione del JSON incollato, per disabilitare il pulsante e mostrare feedback visivo
  const pendingFile = useRef(null);

  // Radici testo-foto -> titolo modello reale. Basta trovare la radice (2-3 lettere)
  // dentro il testo letto dall'OCR, anche con rumore/orari/spazi attorno.
  const MAPPING_TURNI = [
    { radice: "prim", titoli: ["PRIMO","MATTINA"] },
    { radice: "second", titoli: ["SECONDO","POMERIGGIO"] },
    { radice: "terz", titoli: ["3°TURNO","3° TURNO"] },
    { radice: "nott", titoli: ["NOTTE"] },
  ];

  const GIORNI_ABBR = "lun|mar|mer|gio|ven|sab|dom";
  // Riconosce l'inizio di una riga tabella: "mer 01", "mer. 01", "01 mer", ecc.
  // Tollerante a icone/simboli spuri prima del giorno (es. emoji di ferie/riposo
  // lette da Tesseract come caratteri strani), non solo spazi bianchi.
  const INIZIO_RIGA_REGEX = new RegExp(`^[^a-zA-Z0-9]{0,6}(?:(${GIORNI_ABBR})\\.?\\s*(\\d{1,2})|(\\d{1,2})\\s*(${GIORNI_ABBR})\\.?)`, "i");
  // Fallback: cerca ovunque nel testo, usato solo per completare i giorni mancanti
  const RIGA_REGEX_GLOBALE = new RegExp(`(${GIORNI_ABBR})\\.?\\s*(\\d{1,2})[^\\wàèéìòù]*([a-zA-Zàèéìòù°'\\s]+)`, "gi");

  function trovaModelloPerTesto(testoLetto){
    const t = (testoLetto||"").toLowerCase();
    const match = MAPPING_TURNI.find(m=>t.includes(m.radice));
    if(!match) return null; // nessuna radice riconosciuta -> lasciato vuoto
    const titoloMod = (m)=>(m.titolo||"").toUpperCase();
    const mod = modelli.find(m=>match.titoli.includes(titoloMod(m)));
    return mod || null;
  }

  // Confidenza media Tesseract, calcolata solo sulle parole i cui caratteri
  // corrispondono a una radice di turno riconosciuta (non su tutto il testo
  // della pagina, che includerebbe intestazioni, icone lette come testo, ecc.).
  // Restituisce un oggetto (non un numero nudo) per distinguere due casi molto
  // diversi che altrimenti finirebbero entrambi a "0%":
  //  - nessunaParolaRilevante: l'OCR non ha trovato NESSUNA parola che somigli
  //    a un turno noto (foto di tutt'altro, o lettura totalmente fallita) ->
  //    lo 0% qui non è una misura di qualità, è "non applicabile".
  //  - altrimenti: confidenza reale calcolata sulle parole trovate, che può
  //    legittimamente essere bassa (es. 12%) se l'OCR le ha lette male.
  function calcolaConfidenzaTurni(ocrWords, radiciTrovate){
    if(!ocrWords || ocrWords.length===0 || radiciTrovate.length===0){
      return { confidenza: 0, nessunaParolaRilevante: true };
    }
    const paroleRilevanti = ocrWords.filter(w=>{
      const testo = (w.text||"").toLowerCase();
      return radiciTrovate.some(r=>testo.includes(r) || r.includes(testo));
    });
    if(paroleRilevanti.length===0){
      return { confidenza: 0, nessunaParolaRilevante: true };
    }
    const somma = paroleRilevanti.reduce((acc,w)=>acc+(w.confidence||0), 0);
    return { confidenza: somma / paroleRilevanti.length, nessunaParolaRilevante: false };
  }

  // Passaggio 1: parsing riga-per-riga (split su \n).
  // Molto più robusto del regex globale quando ci sono turni uguali consecutivi,
  // perché ogni riga viene analizzata da sola e non può "fondersi" con la successiva.
  function parseRigaPerRiga(testo){
    const risultato = new Map(); // numGiorno -> testoTurno
    const linee = testo.split(/\r?\n/);
    for(let i=0;i<linee.length;i++){
      const linea = linee[i];
      const mtc = INIZIO_RIGA_REGEX.exec(linea);
      if(!mtc) continue;
      const numGiorno = parseInt(mtc[2] || mtc[3], 10);
      if(!numGiorno || numGiorno<1 || numGiorno>31) continue;
      // il testo del turno è quello che resta sulla stessa riga dopo il match iniziale
      let restoRiga = linea.slice(mtc.index + mtc[0].length).trim();
      // se sulla riga non resta nulla di utile (es. il turno è andato a capo),
      // guarda anche la riga successiva come possibile continuazione
      if(restoRiga.length < 2 && linee[i+1]){
        restoRiga = (restoRiga + " " + linee[i+1]).trim();
      }
      if(restoRiga){
        risultato.set(numGiorno, restoRiga);
      }
    }
    return risultato;
  }

  // Passaggio 2: regex globale su tutto il testo, usato solo per riempire i buchi
  // lasciati dal passaggio 1 (es. quando l'OCR non mette a capo correttamente).
  function parseGlobale(testo){
    const risultato = new Map();
    let mtc;
    RIGA_REGEX_GLOBALE.lastIndex = 0;
    while((mtc = RIGA_REGEX_GLOBALE.exec(testo)) !== null){
      const numGiorno = parseInt(mtc[2],10);
      if(!numGiorno || numGiorno<1 || numGiorno>31) continue;
      if(!risultato.has(numGiorno)){
        risultato.set(numGiorno, mtc[3].trim());
      }
    }
    return risultato;
  }

  // Esegue un singolo tentativo di lettura OCR su un file (già grezzo o già
  // preprocessato) e restituisce sia le righe elaborate sia la confidenza
  // media raggiunta sulle sole parole rilevanti per i turni.
  // tipoTabella: "personale" (Primo/Secondo/Terzo/Notte, un modello per giorno)
  //           o "stella" (ricerca "stella" per fascia oraria, più modelli per giorno).
  async function tentativoOCR(file, onProgress, tipoTabella){
    const Tesseract = (await import("tesseract.js")).default;
    let data;
    try{
      const risultato = await Tesseract.recognize(file, "ita", {
        logger: m => { if(m.status==="recognizing text" && onProgress) onProgress(Math.round((m.progress||0)*100)); }
      });
      data = risultato.data;
    }catch(errTess){
      // Tesseract scarica il modello linguistico italiano da un CDN esterno al
      // primo uso; se la rete non lo raggiunge, l'errore arriva qui invece che
      // come "zero parole lette" -> lo segnaliamo in modo esplicito e distinto.
      console.error("Errore Tesseract (probabile problema di rete/download modello):", errTess);
      const erroreRete = new Error("Impossibile caricare il modulo di lettura offline (problema di connessione). Riprova o usa l'AI.");
      erroreRete.isErroreRete = true;
      throw erroreRete;
    }
    const testo = data.text || "";
    const parole = data.words || [];

    const daRigaPerRiga = parseRigaPerRiga(testo);
    const daGlobale = parseGlobale(testo);
    const numeriGiorno = new Set([...daRigaPerRiga.keys(), ...daGlobale.keys()]);

    const mm = String(month+1).padStart(2,"0");
    const righeElaborate = [];
    const radiciTrovate = [];

    if(tipoTabella==="stella"){
      // Percorso per posizione: serve la Y di ogni riga-data nota, dedotta
      // dalle parole che compongono il numero di giorno riconosciuto da
      // INIZIO_RIGA_REGEX (stesso regex del parsing testuale, ma qui si cerca
      // la parola-numero corrispondente dentro `parole` per prenderne la Y).
      const numeroGiorniRigheData = [];
      for(const numGiorno of numeriGiorno){
        const paroleNumero = parole.find(w=>{
          const t=(w.text||"").replace(/\D/g,"");
          return t && parseInt(t,10)===numGiorno;
        });
        if(paroleNumero){
          const yCentro = (paroleNumero.bbox.y0+paroleNumero.bbox.y1)/2;
          numeroGiorniRigheData.push([numGiorno, yCentro]);
        }
      }
      const trovati = trovaRigheStellaPerPosizione(parole, numeroGiorniRigheData);
      for(const r of trovati){
        const dd = String(r.numGiorno).padStart(2,"0");
        righeElaborate.push({ dateKey: `${year}-${mm}-${dd}`, modelloId: r.modelloId });
      }
      if(trovati.length>0) radiciTrovate.push("stella");
    }else{
      for(const numGiorno of numeriGiorno){
        const testoTurno = daRigaPerRiga.get(numGiorno) || daGlobale.get(numGiorno);
        const dd = String(numGiorno).padStart(2,"0");
        const dateKey = `${year}-${mm}-${dd}`;
        const mod = trovaModelloPerTesto(testoTurno);
        if(!mod) continue;
        righeElaborate.push({ dateKey, modelloId: mod.id });
        const radice = MAPPING_TURNI.find(m=>(testoTurno||"").toLowerCase().includes(m.radice));
        if(radice) radiciTrovate.push(radice.radice);
      }
    }

    // data.words è disponibile nell'output di Tesseract.js v5+; se assente
    // per qualche motivo, si tratta come se nessuna parola rilevante fosse
    // stata trovata (forza il tentativo successivo, con messaggio corretto).
    const { confidenza, nessunaParolaRilevante } = calcolaConfidenzaTurni(parole, radiciTrovate);

    return { righeElaborate, confidenza, nessunaParolaRilevante };
  }

  async function handleFile(file){
    pendingFile.current = file;
    setImgPreviewUrl(URL.createObjectURL(file));
    setErrore("");
    setStep("ocr");
    setProgresso(0);
    setConfidenzaRaggiunta(null);
    setNessunTurnoRilevato(false);
    try{
      // Preprocessing sempre applicato (contrasto, bianco/nero, upscaling) per
      // dare a Tesseract la miglior immagine possibile fin dal primo tentativo.
      const filePreproc = await preprocessaImmagine(file);
      const risultato = await tentativoOCR(filePreproc, setProgresso, tipoTabella);

      setNessunTurnoRilevato(risultato.nessunaParolaRilevante);
      if(!risultato.nessunaParolaRilevante) setConfidenzaRaggiunta(risultato.confidenza);

      // Nessuna soglia di confidenza bloccante: se sono stati riconosciuti
      // turni, si accettano. La confidenza resta visibile solo come
      // informazione, non come filtro che scarta risultati validi.
      if(risultato.righeElaborate.length>0){
        const n = await onConfirm(risultato.righeElaborate);
        setNRigheAggiunte(n||0);
        setStep("riepilogo");
        return;
      }

      if(risultato.nessunaParolaRilevante){
        setErrore(tipoTabella==="stella"
          ? "Non ho trovato nella foto nessuna occorrenza di \"Stella\"."
          : "Non ho trovato nella foto nessuna parola simile a un turno conosciuto (Primo, Secondo, Terzo, Notte).");
      }else{
        setErrore("Non sono riuscito a riconoscere nessun turno dalla foto in locale.");
      }
      setStep("chiedi-gemini");
    }catch(err){
      console.error("Errore OCR:", err);
      setErrore(err && err.isErroreRete ? err.message : "Errore durante la lettura della foto in locale.");
      setStep("chiedi-gemini");
    }
  }

  async function handleFileConGemini(file){
    setErrore("");
    setStep("gemini-ocr");
    try{
      const base64 = await new Promise((res, rej)=>{
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Lettura file fallita"));
        r.readAsDataURL(file);
      });
      const resp = await fetch("/api/estrai-turni", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type })
      });
      if(!resp.ok) throw new Error("Chiamata AI fallita");
      const turniTrovati = await resp.json(); // [{data:"YYYY-MM-DD", turno:"..."}]

      const righeElaborate = [];
      for(const t of (turniTrovati||[])){
        const mod = trovaModelloPerTesto(t.turno);
        if(!mod) continue;
        righeElaborate.push({ dateKey: t.data, modelloId: mod.id });
      }

      if(righeElaborate.length===0){
        setErrore("Anche l'AI non è riuscita a riconoscere turni in questo file.");
        setStep("upload");
        return;
      }
      await onConfirm(righeElaborate);
    }catch(err){
      console.error("Errore Gemini:", err);
      setErrore("Errore durante la lettura con l'AI. Riprova.");
      setStep("upload");
    }
  }

  // Converte "1 agosto 2026" -> "2026-08-01". Tollerante a maiuscole/minuscole
  // e a piccole variazioni di spaziatura. Restituisce null se non riconosciuta.
  function dataItalianaToISO(testo){
    const MESI_IT = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
      "luglio","agosto","settembre","ottobre","novembre","dicembre"];
    const m = /^(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{4})$/i.exec((testo||"").trim());
    if(!m) return null;
    const giorno = parseInt(m[1], 10);
    const indiceMese = MESI_IT.indexOf(m[2].toLowerCase());
    if(indiceMese<0) return null;
    const anno = m[3];
    return `${anno}-${String(indiceMese+1).padStart(2,"0")}-${String(giorno).padStart(2,"0")}`;
  }

  // Estrae l'orario di inizio (in minuti) dalla chiave di una fascia oraria,
  // es. "00.00_06.30" o "6.00-12.15" o "06:00_12:30" -> minuti dall'inizio inizio fascia.
  // Tollerante a "." ":" o "-" come separatore ore/minuti, e a "_" "-" tra inizio e fine.
  function estraiMinutiInizioFascia(chiave){
    const primaParte = (chiave||"").split(/[_]/)[0].trim();
    const m = /^(\d{1,2})[.:h]?(\d{2})?/.exec(primaParte);
    if(!m) return null;
    const ore = parseInt(m[1], 10);
    const minuti = m[2] ? parseInt(m[2], 10) : 0;
    return ore*60 + minuti;
  }

  // Trova, tra i modelli del calendario corrente, quello il cui orario di
  // inizio (m.inizio, già in formato HH:MM) è più vicino ai minuti richiesti,
  // entro la tolleranza data (default 30 minuti, come da fasce indicative).
  // Trova, tra i modelli del calendario corrente, quello il cui orario di
  // inizio (m.inizio, già in formato HH:MM) è più vicino ai minuti richiesti,
  // entro la tolleranza data (default 30 minuti, come da fasce indicative).
  function trovaModelloPerOrarioInizio(minutiRichiesti, tolleranzaMinuti=30){
    if(minutiRichiesti==null) return null;
    let migliore = null, distanzaMigliore = Infinity;
    for(const mod of modelli){
      if(!mod.inizio) continue;
      const minMod = oraInMinuti(mod.inizio);
      if(minMod==null) continue;
      const distanza = Math.min(Math.abs(minMod-minutiRichiesti), 1440-Math.abs(minMod-minutiRichiesti));
      if(distanza < distanzaMigliore){
        distanzaMigliore = distanza;
        migliore = mod;
      }
    }
    return distanzaMigliore<=tolleranzaMinuti ? migliore : null;
  }

  // Analizza le parole OCR (con coordinate) per trovare, per ogni occorrenza di
  // "stella", a quale COLONNA della tabella appartiene in base alla posizione X,
  // e a quale GIORNO appartiene in base alla posizione Y (riga più vicina che
  // contiene una data riconosciuta). Le colonne vengono dedotte clusterizzando
  // le X di TUTTE le parole della pagina (non solo "stella"): si assume che le
  // colonne siano bande verticali con poco spazio vuoto tra il testo di una
  // banda e l'altra, separate da vuoti più ampi (i bordi della tabella).
  // Le colonne trovate vengono poi assegnate ai modelli del calendario in
  // ordine di posizione sinistra->destra = ordine di orario di inizio crescente
  // (assunzione: nelle tabelle Stella le fasce orarie procedono così, come
  // osservato negli screenshot forniti).
  // LIMITE NOTO: dipende dalla qualità delle coordinate restituite da Tesseract,
  // che su foto storte/sfocate/a bassa risoluzione possono essere imprecise.
  // Verificare sempre il risultato dopo l'import su foto nuove.
  function trovaRigheStellaPerPosizione(words, numeroGiorniRigheData){
    if(!words || words.length===0) return [];

    // 1) Clusterizza le X di tutte le parole per dedurre i confini delle colonne.
    //    Ordina i centri X, poi taglia dove c'è un salto ampio rispetto alla
    //    larghezza media delle parole (gap = probabile bordo di colonna).
    const centriX = words.map(w=>(w.bbox.x0+w.bbox.x1)/2).sort((a,b)=>a-b);
    const larghezzaMediaParola = words.reduce((acc,w)=>acc+(w.bbox.x1-w.bbox.x0),0)/words.length;
    const sogliaSalto = larghezzaMediaParola*3; // gap oltre 3x la larghezza media parola = nuova colonna
    const confiniColonne = [];
    for(let i=1;i<centriX.length;i++){
      if(centriX[i]-centriX[i-1] > sogliaSalto){
        confiniColonne.push((centriX[i]+centriX[i-1])/2);
      }
    }
    // Le colonne sono gli intervalli tra i confini trovati (+ i due estremi).
    const bordi = [-Infinity, ...confiniColonne, Infinity];
    const numColonne = bordi.length-1;
    const colonnaDiX = (x)=>{
      for(let c=0;c<numColonne;c++){ if(x>=bordi[c] && x<bordi[c+1]) return c; }
      return numColonne-1;
    };

    // 2) Modelli ordinati per orario di inizio crescente, assunti corrispondere
    //    da sinistra a destra alle colonne trovate.
    const modelliOrdinati = [...modelli]
      .filter(m=>m.inizio)
      .sort((a,b)=>(oraInMinuti(a.inizio)??0) - (oraInMinuti(b.inizio)??0));

    // 3) Per ogni parola "stella" trovata, determina colonna (-> modello) e riga
    //    (-> giorno, tramite la Y della parola più vicina a una riga-data nota).
    const risultati = [];
    const paroleStella = words.filter(w=>/stella/i.test(w.text));
    for(const w of paroleStella){
      const centroX = (w.bbox.x0+w.bbox.x1)/2;
      const centroY = (w.bbox.y0+w.bbox.y1)/2;
      const colonna = colonnaDiX(centroX);
      const mod = modelliOrdinati[colonna];
      if(!mod) continue;
      // trova la riga-data (numeroGiorno) la cui Y è più vicina al centroY di "stella"
      let giornoVicino = null, distanzaY = Infinity;
      for(const [numGiorno, yRiga] of numeroGiorniRigheData){
        const d = Math.abs(yRiga-centroY);
        if(d<distanzaY){ distanzaY = d; giornoVicino = numGiorno; }
      }
      if(giornoVicino==null) continue;
      risultati.push({ numGiorno: giornoVicino, modelloId: mod.id });
    }
    return risultati;
  }


  async function handleImportaJsonIncollato(){
    if(importando) return; // guardia esplicita: ignora click ripetuti mentre un'importazione è già in corso
    setImportando(true);
    setErrore("");
    let parsed;
    try{
      parsed = JSON.parse(testoJsonIncollato.trim());
    }catch(err){
      setErrore("Il testo incollato non è un JSON valido. Controlla di aver copiato tutto, comprese le parentesi { } o [ ].");
      setImportando(false);
      return;
    }

    const righeElaborate = [];

    if(Array.isArray(parsed)){
      // Formato "piatto": [{"data":"2026-07-01","turno":"Primo"}, ...]
      for(const t of parsed){
        if(!t || typeof t.data!=="string" || typeof t.turno!=="string") continue;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(t.data)) continue;
        const mod = trovaModelloPerTesto(t.turno);
        if(!mod) continue;
        righeElaborate.push({ dateKey: t.data, modelloId: mod.id });
      }
    }else if(parsed && typeof parsed==="object"){
      // Formato "raggruppato per fascia oraria": un oggetto con un livello di
      // annidamento arbitrario (es. {"turni_stella": {"00.00_06.30": [date...]}})
      // dove le foglie sono array di date testuali italiane. Si scende
      // ricorsivamente finché non si trova un array: la CHIAVE che contiene
      // quell'array è trattata come fascia oraria da matchare per orario.
      const visita = (nodo)=>{
        if(Array.isArray(nodo)) return; // gestito dal chiamante tramite Object.entries
        if(nodo && typeof nodo==="object"){
          for(const [chiave, valore] of Object.entries(nodo)){
            if(Array.isArray(valore)){
              const minutiInizio = estraiMinutiInizioFascia(chiave);
              const mod = trovaModelloPerOrarioInizio(minutiInizio);
              if(!mod) continue;
              for(const dataTesto of valore){
                const iso = dataItalianaToISO(dataTesto);
                if(!iso) continue;
                righeElaborate.push({ dateKey: iso, modelloId: mod.id });
              }
            }else{
              visita(valore);
            }
          }
        }
      };
      visita(parsed);
    }else{
      setErrore("Formato JSON non riconosciuto.");
      setImportando(false);
      return;
    }

    if(righeElaborate.length===0){
      setErrore("Nessun turno riconosciuto in questo JSON (controlla formato date, nomi turno, o orari delle fasce).");
      setImportando(false);
      return;
    }
    const n = await onConfirm(righeElaborate);
    setNRigheAggiunte(n||0);
    setImportando(false);
    setStep("riepilogo");
  }


  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:700,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:420,maxHeight:"85vh",
        display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{padding:"18px 20px 12px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:16,fontWeight:900,color:T.text}}>📷 Importa da foto</div>
          <div style={{fontSize:12,color:T.sub,marginTop:2}}>
            Mese in corso: {NOMI_MESI_IT[month]} {year}. Per ora vengono importati solo Primo, Secondo, Terzo e Notturno.
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:16}}>

          {step==="scegli-tipo"&&(
            <div>
              <div style={{fontSize:13,color:"#1a1a1a",fontWeight:700,marginBottom:14}}>
                Che tipo di tabella stai importando?
              </div>
              <button onClick={()=>{ setTipoTabella("personale"); setStep("upload"); }}
                style={{display:"block",width:"100%",border:`2px dashed ${accent}`,borderRadius:12,
                  padding:"16px",textAlign:"center",cursor:"pointer",color:accent,fontSize:13,fontWeight:700,
                  background:"transparent",marginBottom:10}}>
                👤 Turni personali (Primo, Secondo, Terzo, Notte)
              </button>
              <button onClick={()=>{ setTipoTabella("stella"); setStep("upload"); }}
                style={{display:"block",width:"100%",border:`2px dashed ${accent}`,borderRadius:12,
                  padding:"16px",textAlign:"center",cursor:"pointer",color:accent,fontSize:13,fontWeight:700,
                  background:"transparent"}}>
                ⭐ Turni Stella (per fasce orarie)
              </button>
            </div>
          )}

          {step==="upload"&&(
            <>
              {errore&&(
                <div style={{background:"#ef444422",border:"1px solid #ef4444",borderRadius:8,
                  padding:"8px 10px",fontSize:12,color:"#ef4444",marginBottom:12}}>
                  {errore}
                </div>
              )}
              <label style={{display:"block",border:`2px dashed ${T.border}`,borderRadius:12,
                padding:"32px 16px",textAlign:"center",cursor:"pointer",color:T.sub,fontSize:13}}>
                Tocca per scegliere la foto della tabella
                <input type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFile(f); }}/>
              </label>
              <label style={{display:"block",marginTop:10,border:`2px dashed ${accent}`,borderRadius:12,
                padding:"14px 16px",textAlign:"center",cursor:"pointer",color:accent,fontSize:13,fontWeight:700}}>
                🤖 Interpreta direttamente con l'AI (foto o PDF)
                <input type="file" accept="image/*,application/pdf" style={{display:"none"}}
                  onChange={e=>{ const f=e.target.files?.[0]; if(f){ pendingFile.current=f; setImgPreviewUrl(f.type.startsWith("image")?URL.createObjectURL(f):null); handleFileConGemini(f); } }}/>
              </label>
              <button onClick={()=>{ setErrore(""); setStep("incolla-json"); }}
                style={{display:"block",width:"100%",marginTop:10,border:`2px dashed ${T.sub}`,borderRadius:12,
                  padding:"14px 16px",textAlign:"center",cursor:"pointer",color:T.sub,fontSize:13,fontWeight:700,
                  background:"transparent"}}>
                📋 Incolla un JSON già pronto
              </button>
            </>
          )}

          {step==="incolla-json"&&(
            <div>
              {errore&&(
                <div style={{background:"#ef444422",border:"1px solid #ef4444",borderRadius:8,
                  padding:"8px 10px",fontSize:12,color:"#ef4444",marginBottom:12}}>
                  {errore}
                </div>
              )}
              <div style={{fontSize:12,color:T.sub,marginBottom:8}}>
                Incolla qui l'array JSON con i turni, es: <code>[{"{"}"data":"2026-07-01","turno":"Primo"{"}"}]</code>
              </div>
              <textarea
                value={testoJsonIncollato}
                onChange={e=>setTestoJsonIncollato(e.target.value)}
                placeholder='[{"data":"2026-07-01","turno":"Primo"}]'
                style={{width:"100%",minHeight:160,borderRadius:10,border:`1px solid ${T.border}`,
                  background:T.s2,color:T.text,fontSize:12,fontFamily:"monospace",padding:10,
                  boxSizing:"border-box",resize:"vertical"}}
              />
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={()=>{ setStep("upload"); setErrore(""); }}
                  disabled={importando}
                  style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                    color:importando?T.border:T.sub,padding:"10px 0",
                    cursor:importando?"not-allowed":"pointer",fontWeight:700,fontSize:12}}>
                  Annulla
                </button>
                <button onClick={handleImportaJsonIncollato}
                  disabled={!testoJsonIncollato.trim()||importando}
                  style={{flex:1,background:importando?T.border:(testoJsonIncollato.trim()?accent:T.s2),border:"none",borderRadius:10,
                    color:importando?T.sub:(testoJsonIncollato.trim()?"#fff":T.sub),padding:"10px 0",
                    cursor:(testoJsonIncollato.trim()&&!importando)?"pointer":"not-allowed",fontWeight:700,fontSize:12}}>
                  {importando?"⏳ Importazione in corso…":"Importa"}
                </button>
              </div>
            </div>
          )}

          {step==="riepilogo"&&(
            <div style={{textAlign:"center",padding:"30px 8px"}}>
              <div style={{fontSize:36,marginBottom:12}}>✅</div>
              <div style={{fontSize:15,color:"#1a1a1a",fontWeight:800,marginBottom:8}}>
                {nRigheAggiunte>0
                  ? `${nRigheAggiunte} turno${nRigheAggiunte===1?"":"i"} aggiunto${nRigheAggiunte===1?"":"i"} al calendario`
                  : "Nessun turno nuovo aggiunto"}
              </div>
              {nRigheAggiunte===0&&(
                <div style={{fontSize:12,color:"#1a1a1a",marginBottom:8}}>
                  I turni trovati erano probabilmente già presenti nel calendario.
                </div>
              )}
              <button onClick={()=>{ onClose(); }}
                style={{width:"100%",marginTop:16,background:accent,border:"none",borderRadius:10,
                  color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:700,fontSize:13}}>
                Fatto
              </button>
            </div>
          )}

          {step==="ocr"&&(
            <div style={{textAlign:"center",padding:"40px 16px"}}>
              {imgPreviewUrl&&<img src={imgPreviewUrl} alt="" style={{maxWidth:"100%",maxHeight:140,borderRadius:8,marginBottom:16}}/>}
              <div style={{fontSize:13,color:T.sub,marginBottom:10}}>Lettura della foto in corso… {progresso}%</div>
              <div style={{height:6,background:T.s2,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${progresso}%`,background:accent,transition:"width 0.2s"}}/>
              </div>
            </div>
          )}

          {step==="chiedi-gemini"&&(
            <div style={{textAlign:"center",padding:"20px 8px"}}>
              {imgPreviewUrl&&<img src={imgPreviewUrl} alt="" style={{maxWidth:"100%",maxHeight:140,borderRadius:8,marginBottom:16}}/>}
              {errore&&<div style={{fontSize:13,color:"#1a1a1a",fontWeight:600,marginBottom:16}}>{errore}</div>}
              {confidenzaRaggiunta!=null&&!nessunTurnoRilevato&&(
                <div style={{fontSize:12,color:"#1a1a1a",fontWeight:600,marginBottom:16}}>
                  Confidenza lettura locale raggiunta: {Math.round(confidenzaRaggiunta)}%
                </div>
              )}
              <div style={{fontSize:13,color:"#1a1a1a",marginBottom:16,fontWeight:700}}>
                Il file non è leggibile in locale. Vuoi provare con l'intelligenza artificiale (Gemini)?
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{ setStep("upload"); setErrore(""); }}
                  style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                    color:T.sub,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
                  No, riprovo la foto
                </button>
                <button onClick={()=>handleFileConGemini(pendingFile.current)}
                  style={{flex:1,background:accent,border:"none",borderRadius:10,
                    color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
                  🤖 Sì, usa l'AI
                </button>
              </div>
              <button onClick={()=>{ setErrore(""); setStep("incolla-json"); }}
                style={{width:"100%",marginTop:8,background:"transparent",border:`1px solid ${T.border}`,
                  borderRadius:10,color:T.sub,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
                📋 Oppure incolla un JSON già pronto
              </button>
            </div>
          )}

          {step==="gemini-ocr"&&(
            <div style={{textAlign:"center",padding:"40px 16px"}}>
              {imgPreviewUrl&&<img src={imgPreviewUrl} alt="" style={{maxWidth:"100%",maxHeight:140,borderRadius:8,marginBottom:16}}/>}
              <div style={{fontSize:13,color:T.sub}}>Lettura del file con l'AI in corso…</div>
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:8,padding:16,borderTop:`1px solid ${T.border}`}}>
          <button onClick={onClose}
            style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
              color:T.sub,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}

function NLRSScalanteView({rot, T, accent, modelli}){
  const modRS=modelli.find(m=>m.id===rot.modelloRSId);
  const modNL=modelli.find(m=>m.id===rot.modelloNLId);

  const GIORNI_CICLO = [5, 4, 3, 2, 1, 6];

  function getCoppie(){
    if(!rot.dataInizio) return [];
    const primoRS = new Date(rot.dataInizio);
    const coppie = [];
    let giornoCicloIdx = 0;
    let dataCorrRS = new Date(primoRS);

    const maxSettimane = rot.nSettimane || 52;
    const dataFine = new Date(primoRS);
    dataFine.setDate(dataFine.getDate() + maxSettimane * 7);

    while(dataCorrRS < dataFine){
      const dataRS = new Date(dataCorrRS);
      const dataNL = new Date(dataCorrRS);
      dataNL.setDate(dataNL.getDate() + 7);

      coppie.push({
        rs: { date: dataRS, key: dkey(dataRS.getFullYear(), dataRS.getMonth(), dataRS.getDate()) },
        nl: { date: dataNL, key: dkey(dataNL.getFullYear(), dataNL.getMonth(), dataNL.getDate()) },
        giorno: GIORNI_CICLO[giornoCicloIdx],
        cicloN: giornoCicloIdx + 1,
      });

      giornoCicloIdx = (giornoCicloIdx + 1) % GIORNI_CICLO.length;
      const prossimoDow = GIORNI_CICLO[giornoCicloIdx];

      const base = new Date(dataCorrRS);
      base.setDate(base.getDate() + 21);
      let tentativo = new Date(base);
      let iter = 0;
      while(tentativo.getDay() !== prossimoDow && iter < 14){
        tentativo.setDate(tentativo.getDate() + 1);
        iter++;
      }
      dataCorrRS = tentativo;
    }
    return coppie;
  }

  const coppie = getCoppie();
  const NOMI_GG = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];

  return (
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {!rot.dataInizio&&(
        <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
          Imposta la data del primo RS nella configurazione rotazione
        </div>
      )}
      {coppie.length>0&&(
        <div style={{marginBottom:10,background:T.surface,borderRadius:10,padding:"10px 14px",
          display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#8b5cf6"}}>RS</span> — {modRS?.titolo||"Non assegnato"}
          </div>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#3b82f6"}}>NL</span> — {modNL?.titolo||"Non assegnato"}
          </div>
          <div style={{fontSize:11,color:T.sub,width:"100%"}}>
            Ciclo scalante: Ven → Gio → Mer → Mar → Lun → Sab → ...
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {coppie.map((cp,i)=>{
          const cRS="#8b5cf6", cNL="#3b82f6";
          const nomeGg=NOMI_GG[cp.giorno]||"";
          return (
            <div key={i} style={{background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:12,overflow:"hidden"}}>
              <div style={{background:`linear-gradient(135deg,${cRS}22,${cNL}22)`,
                padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",
                borderBottom:`1px solid ${T.border}`}}>
                <span style={{fontSize:11,fontWeight:800,color:T.sub}}>Ciclo {i+1} — {nomeGg}</span>
              </div>
              <div style={{display:"flex",gap:0}}>
                <div style={{flex:1,padding:"10px 12px",borderRight:`1px solid ${T.border}`}}>
                  <div style={{fontSize:10,fontWeight:800,color:cRS,marginBottom:3}}>RS</div>
                  <div style={{fontSize:12,fontWeight:700,color:T.text}}>
                    {NOMI_GIORNI_IT[cp.rs.date.getDay()].slice(0,3)} {fmtDataIT(cp.rs.date)}
                  </div>
                  <div style={{fontSize:11,color:T.sub,marginTop:2}}>{modRS?.titolo||"—"}</div>
                </div>
                <div style={{flex:1,padding:"10px 12px"}}>
                  <div style={{fontSize:10,fontWeight:800,color:cNL,marginBottom:3}}>NL (+7gg)</div>
                  <div style={{fontSize:12,fontWeight:700,color:T.text}}>
                    {NOMI_GIORNI_IT[cp.nl.date.getDay()].slice(0,3)} {fmtDataIT(cp.nl.date)}
                  </div>
                  <div style={{fontSize:11,color:T.sub,marginTop:2}}>{modNL?.titolo||"—"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DomenicheView({rot, T, accent, modelli, fasceAutomatiche, onUpdate}){
  const griglia=rot.griglia||{};
  const modLav=modelli.find(m=>m.id===rot.modellaLavoroId);
  const modFesta=modelli.find(m=>m.id===rot.modelloNLId);
  function getDomeniche(){
    if(!rot.dataInizio) return [];
    const inizio=new Date(rot.dataInizio);
    let d=new Date(inizio);
    while(d.getDay()!==0) d.setDate(d.getDate()+1);
    const domeniche=[];
    for(let i=0;i<(rot.nSettimane||52);i++){
      const k=dkey(d.getFullYear(),d.getMonth(),d.getDate());
      domeniche.push({key:k,date:new Date(d),idx:i});
      d.setDate(d.getDate()+7);
    }
    return domeniche;
  }
  const domeniche=getDomeniche();
  return (
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {!rot.dataInizio&&(
        <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
          Imposta la data della prima domenica nella configurazione rotazione
        </div>
      )}
      {domeniche.length>0&&(
        <div style={{marginBottom:10,background:T.surface,borderRadius:10,padding:"10px 14px",fontSize:12,color:T.sub}}>
          <span style={{fontWeight:700,color:"#22c55e"}}>🔵 FESTIVO</span> = domenica di lavoro (1 su 4)&nbsp;&nbsp;
          <span style={{fontWeight:700,color:"#64748b"}}>⚪ Riposo</span> = le altre 3 (colore libero)
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {domeniche.map((dom,i)=>{
          const isLavoro=(i%4)===0;
          const autoM=isLavoro?modLav:modFesta;
          const ovrM=modelli.find(m=>m.id===griglia[dom.key]);
          const effM=ovrM||autoM;
          const c=effM?(effM.coloreCustom||getColorByTime(effM.inizio, fasceAutomatiche)):(isLavoro?"#22c55e":"#94a3b8");
          return (
            <div key={dom.key} style={{background:T.surface,
              border:`2px solid ${isLavoro?"#22c55e44":"#94a3b822"}`,
              borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:c,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,fontWeight:800,
                    color:isLavoro?"#22c55e":"#64748b"}}>
                    {isLavoro?"🔵 FESTIVO (lavoro)":"⚪ Riposo"}
                  </span>
                  <span style={{fontSize:10,color:T.sub}}>({`${i%4+1}ª/4`})</span>
                </div>
                <div style={{fontSize:12,color:T.sub,marginTop:1}}>
                  {NOMI_GIORNI_IT[dom.date.getDay()]} {fmtDataIT(dom.date)}
                </div>
                {effM&&<div style={{fontSize:11,fontWeight:700,color:c,marginTop:2}}>{effM.titolo}</div>}
              </div>
              {ovrM&&(
                <button onClick={()=>{const g={...griglia};delete g[dom.key];onUpdate(g);}}
                  style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14}}>↩</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NLRSView({rot, T, accent, modelli}){
  const modNL=modelli.find(m=>m.id===rot.modelloNLId);
  const modRS=modelli.find(m=>m.id===rot.modelloRSId);
  function getCiclo(){
    if(!rot.dataInizio) return [];
    const inizio=new Date(rot.dataInizio);
    const ciclo=[];
    let giornoCiclo=inizio.getDay()===0?6:inizio.getDay()-1;
    let settCiclo=0;
    for(let s=0;s<(rot.nSettimane||52);s++){
      const posNelCiclo=settCiclo%4;
      const d=new Date(inizio);
      d.setDate(d.getDate()+s*7);
      const lunedi=new Date(d);
      while(lunedi.getDay()!==1) lunedi.setDate(lunedi.getDate()-1);
      const target=new Date(lunedi);
      target.setDate(target.getDate()+giornoCiclo);
      const k=dkey(target.getFullYear(),target.getMonth(),target.getDate());
      if(posNelCiclo===0) ciclo.push({key:k,date:target,tipo:"NL",sett:s+1});
      else if(posNelCiclo===1) ciclo.push({key:k,date:target,tipo:"RS",sett:s+1});
      settCiclo++;
      if(settCiclo%4===0) giornoCiclo=((giornoCiclo-1)+7)%7;
    }
    return ciclo;
  }
  const ciclo=getCiclo();
  return (
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {!rot.dataInizio&&(
        <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
          Imposta la data del primo NL nella configurazione rotazione
        </div>
      )}
      {ciclo.length>0&&(
        <div style={{marginBottom:10,background:T.surface,borderRadius:10,padding:"10px 14px",
          display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#3b82f6"}}>NL</span> — {modNL?.titolo||"Non assegnato"}
          </div>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#8b5cf6"}}>RS</span> — {modRS?.titolo||"Non assegnato"}
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {ciclo.map(ev=>{
          const isNL=ev.tipo==="NL";
          const m=isNL?modNL:modRS;
          const c=isNL?"#3b82f6":"#8b5cf6";
          return (
            <div key={ev.key} style={{background:T.surface,border:`2px solid ${c}22`,
              borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:8,background:c+"22",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:900,color:c}}>{ev.tipo}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:T.sub}}>Sett. {ev.sett} · {NOMI_GIORNI_IT[ev.date.getDay()]} {fmtDataIT(ev.date)}</div>
                <div style={{fontSize:13,fontWeight:700,color:T.text}}>{m?.titolo||"Nessun modello"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// #endregion

