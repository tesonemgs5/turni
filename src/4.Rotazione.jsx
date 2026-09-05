    import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { AutocompleteInput, ColorPickerModal } from "./5.Comuni";

// ═══════════════════════════════════════════════════════════════
// utilsRotazione.jsx — Utility base (date, colori, festivi, sync
// locale) + componenti di gestione Modelli/Rotazione (Card, Form,
// Griglia, viste NLRS/Domeniche).
// Provenienza: App.jsx originale, sezioni 0-4, 26, 27, 30.
// ═══════════════════════════════════════════════════════════════

// #region SEZIONE 0: FONT & COLORI
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

export function minsOf(tIn){
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
    // Formula YIQ (invece della luminanza percepita pesata sul canale
    // verde): quella precedente sottostimava il contrasto necessario sui
    // gialli/arancioni saturi usati in questa app (es. #eab308, #f59e0b),
    // restituendo bianco su sfondi già abbastanza chiari da richiedere
    // testo nero per essere leggibili bene.
    const yiq = (r*299 + g*587 + b*114) / 1000;
    // Soglia 140: testo nero su tutti gli sfondi chiari usati nell'app
    // (giallo, arancione incluso #f97316 "SECONDO", bianco, pastelli),
    // testo bianco sugli sfondi scuri/saturi (viola, blu notte, verde,
    // blu, rosso, grigio).
    return yiq >= 140 ? "#0f172a" : "#ffffff";
  } catch(e){ return "#ffffff"; }
}
// #endregion

// #region SEZIONE 1: IMPORTS + COSTANTI
// ═══════════════════════════════════════════════════════════════

export const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
export const DAYS = ["L","M","M","G","V","S","D"];

export function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
// #endregion

// #region SEZIONE 2: LOCALSTORAGE CACHE
// ═══════════════════════════════════════════════════════════════
export function saveToLocalStorage(events, calendars, modelli, calId, impostazioni){
  try {
    localStorage.setItem('cache_events', JSON.stringify(events));
    localStorage.setItem('cache_calendars', JSON.stringify(calendars));
    localStorage.setItem('cache_modelli', JSON.stringify(modelli));
    localStorage.setItem('cache_timestamp', new Date().toISOString());
    if(calId) localStorage.setItem('cache_calId', calId);
    // Impostazioni visive (colori domenica/festivi, tema, fasce orarie,
    // festività attive...): senza questo, ogni avvio le mostrava per un
    // istante al valore di default finché Supabase non rispondeva, prima
    // di "scattare" al valore vero scelto dall'utente — il flash di colore
    // sui giorni festivi visibile ad ogni apertura dell'app.
    // Include anche reports/reportSettings: prima non c'erano, quindi la
    // sezione Report restava sempre vuota quando l'app partiva offline
    // (leggeva solo dalla cache, che non li conteneva mai).
    if(impostazioni) localStorage.setItem('cache_impostazioni', JSON.stringify(impostazioni));
  } catch(e){ console.warn('localStorage error:', e); }
}
export function loadFromLocalStorage(){
  try {
    const events = JSON.parse(localStorage.getItem('cache_events')||'{}');
    const calendars = JSON.parse(localStorage.getItem('cache_calendars')||'[]');
    const modelli = JSON.parse(localStorage.getItem('cache_modelli')||'[]');
    const timestamp = localStorage.getItem('cache_timestamp')||null;
    const calId = localStorage.getItem('cache_calId')||null;
    const impostazioni = JSON.parse(localStorage.getItem('cache_impostazioni')||'null');
    return { events, calendars, modelli, timestamp, calId, impostazioni };
  } catch(e){ return null; }
}

// ─── Offline-first: il locale è la fonte di verità, Supabase/Sheets sono
// backup di ripristino. Ogni scrittura (crea/modifica/elimina) aggiorna
// SUBITO lo stato locale — online o offline, l'utente vede il risultato
// all'istante — e in parallelo tenta Supabase; se fallisce per assenza di
// connessione, l'operazione resta in coda e riparte da sola al ritorno
// della rete, senza intervento dell'utente e senza mostrare errori per
// quello specifico caso (un errore "vero", non di rete, resta comunque
// visibile come prima tramite segnalaErroreDb).
//
// L'id di ogni nuova riga (evento/modello/rotazione/calendario) viene
// generato QUI, lato client, con un vero UUID — non più lasciato generare
// al database con l'insert. Così l'id locale e quello su Supabase sono
// identici fin dal primo istante: nessuna riconciliazione "id temporaneo
// -> id reale" necessaria dopo che il server risponde.
export function generaIdLocale(){
  if(typeof crypto!=="undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Fallback per ambienti senza crypto.randomUUID (raro, browser molto vecchi):
  // stesso formato v4, generato con Math.random (meno robusto ma sufficiente
  // per un id locale, non per uso crittografico).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==="x" ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

const CODA_SYNC_KEY = 'coda_sync_offline';

export function leggiCodaSync(){
  try{ return JSON.parse(localStorage.getItem(CODA_SYNC_KEY)||'[]'); }
  catch(e){ return []; }
}
export function scriviCodaSync(coda){
  try{ localStorage.setItem(CODA_SYNC_KEY, JSON.stringify(coda)); }catch(e){}
}
// Accoda un'operazione da ritentare quando torna la connessione.
//   tipo: "insert" | "update" | "delete"
//   table: nome tabella Supabase (es. "events")
//   payload: dati da scrivere (per insert/update)
//   match: filtro per individuare la riga (per update/delete), es. {id, user_id}
//   contesto: per i messaggi di log/errore, coerente col resto dell'app
function accodaOperazioneSync(tipo, table, payload, match, contesto){
  const coda = leggiCodaSync();
  coda.push({ id: generaIdLocale(), ts: new Date().toISOString(), tipo, table, payload, match, contesto });
  scriviCodaSync(coda);
}


// ─── Log persistente di TUTTI gli errori dell'app (non solo import) ───
// Ogni errore, anche il più minore, finisce qui con: quando, da quale
// funzione/azione dell'app arriva (contesto), e il messaggio tecnico
// originale. Serve a due scopi distinti:
//  1) sapere SEMPRE dove guardare quando qualcosa non va, anche per errori
//     che oggi sparivano in console senza che l'utente li vedesse mai;
//  2) per chi lavora sul codice, il campo "contesto" indica esattamente
//     quale funzione ha generato l'errore, senza dover cercarlo alla cieca.
const LOG_ERRORI_KEY = 'log_errori_app';
const ERRORI_SILENZIATI_KEY = 'errori_app_silenziati';

export function leggiLogErrori(){
  try{ return JSON.parse(localStorage.getItem(LOG_ERRORI_KEY)||'[]'); }
  catch(e){ return []; }
}
export function cancellaLogErrori(){
  try{ localStorage.removeItem(LOG_ERRORI_KEY); }catch(e){}
}
export function leggiErroriSilenziati(){
  try{ return JSON.parse(localStorage.getItem(ERRORI_SILENZIATI_KEY)||'{}'); }
  catch(e){ return {}; }
}
export function impostaSilenziamentoErrore(contesto, silenziato){
  try{
    const attuali = leggiErroriSilenziati();
    if(silenziato) attuali[contesto] = true; else delete attuali[contesto];
    localStorage.setItem(ERRORI_SILENZIATI_KEY, JSON.stringify(attuali));
  }catch(e){}
}
// Coda degli errori da mostrare come modale in-app (non popup nativo del
// browser): un array di {messaggio, contesto, id}, letto e svuotato dal
// componente ModaleErrore renderizzato una sola volta nella root dell'app.
// Un semplice array in un oggetto globale, aggiornato tramite un listener,
// evita di dover passare setError attraverso decine di funzioni diverse.
let _codaErroriListener = null;
export function registraListenerCodaErrori(fn){ _codaErroriListener = fn; }
function accodaErroreVisibile(messaggio, contesto){
  if(_codaErroriListener) _codaErroriListener({ id: Date.now()+Math.random(), messaggio, contesto });
}

// Variante di segnalaErrore che scrive SOLO nel log persistente, senza
// accodare il modale visibile. Serve nei pochi punti dove l'errore può
// ripetersi molte volte in un singolo ciclo (es. normalizzazione riga per
// riga): mostrare un modale per ognuno sarebbe una sequenza di N popup da
// chiudere uno a uno. In quei casi il chiamante logga ogni singola riga con
// questa funzione, poi mostra UN alert riassuntivo con segnalaErrore.
export function segnalaErroreSoloLog(messaggioTecnico, contesto){
  console.error(`[${contesto}]`, messaggioTecnico);
  const msg = String(messaggioTecnico?.message||messaggioTecnico||"Errore sconosciuto");
  try{
    const log = leggiLogErrori();
    log.push({ ts: new Date().toISOString(), contesto, messaggio: msg });
    localStorage.setItem(LOG_ERRORI_KEY, JSON.stringify(log.slice(-200)));
  }catch(e){}
}


// dall'utente per questo specifico contesto, lo accoda per la visualizzazione
// come modale in-app (un solo bottone OK + checkbox "non mostrare più").
// Va chiamata al posto di console.error/console.warn ovunque nell'app tocchi
// un'operazione che può fallire (Supabase, localStorage, rete, parsing...).
export function segnalaErrore(messaggioTecnico, contesto){
  console.error(`[${contesto}]`, messaggioTecnico);
  const msg = String(messaggioTecnico?.message||messaggioTecnico||"Errore sconosciuto");
  try{
    const log = leggiLogErrori();
    log.push({ ts: new Date().toISOString(), contesto, messaggio: msg });
    localStorage.setItem(LOG_ERRORI_KEY, JSON.stringify(log.slice(-200)));
  }catch(e){}
  const silenziati = leggiErroriSilenziati();
  if(silenziati[contesto]) return;
  accodaErroreVisibile(msg, contesto);
}


// (mancanti: nessun modello con quel titolo; sospetti: titolo trovato ma
// orario/ambiguità). Prima queste informazioni si vedevano solo nel popup
// "Importazione completata" e sparivano chiudendolo — qui restano
// consultabili in un secondo momento, tenendo le ultime 30 sessioni.
const LOG_IMPORT_KEY = 'log_import_problemi';
export function leggiRegistroImportProblemi(){
  try{ return JSON.parse(localStorage.getItem(LOG_IMPORT_KEY)||'[]'); }
  catch(e){ return []; }
}
export function registraProblemiImport(mancanti, sospetti){
  if((!mancanti||!mancanti.length) && (!sospetti||!sospetti.length)) return;
  try{
    const sessioni = leggiRegistroImportProblemi();
    sessioni.push({ ts: new Date().toISOString(), mancanti: mancanti||[], sospetti: sospetti||[] });
    localStorage.setItem(LOG_IMPORT_KEY, JSON.stringify(sessioni.slice(-30)));
  }catch(e){ console.warn('registro import error:', e); }
}
export function cancellaRegistroImportProblemi(){
  try{ localStorage.removeItem(LOG_IMPORT_KEY); }catch(e){}
}
export function clearLocalStorageCache(){
  localStorage.removeItem('cache_events');
  localStorage.removeItem('cache_calendars');
  localStorage.removeItem('cache_modelli');
  localStorage.removeItem('cache_timestamp');
  localStorage.removeItem('cache_calId');
}
// Confronto "sono uguali questi dati?" usato per evitare un re-render visibile
// quando la risposta di Supabase coincide con quanto già mostrato dalla cache.
export function sameData(a, b){
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
export function withEventoAggiunto(store, dayKey, calId, evt){
  const eventsBase = store?.events||{};
  const dayEvents = { ...(eventsBase[dayKey]||{}) };
  dayEvents[calId] = [...(dayEvents[calId]||[]), evt];
  return { ...store, events: { ...eventsBase, [dayKey]: dayEvents } };
}
export function withEventoAggiornato(store, dayKey, calId, evtId, patch){
  const eventsBase = store?.events||{};
  const dayEvents = { ...(eventsBase[dayKey]||{}) };
  dayEvents[calId] = (dayEvents[calId]||[]).map(e=>e.id===evtId?{...e,...patch}:e);
  return { ...store, events: { ...eventsBase, [dayKey]: dayEvents } };
}
export function withEventoRimosso(store, dayKey, calId, evtId){
  const eventsBase = store?.events||{};
  const dayEvents = { ...(eventsBase[dayKey]||{}) };
  dayEvents[calId] = (dayEvents[calId]||[]).filter(e=>e.id!==evtId);
  return { ...store, events: { ...eventsBase, [dayKey]: dayEvents } };
}
// #endregion

// #region SEZIONE 3: UTILITY FUNCTIONS (date/festivi)
// ═══════════════════════════════════════════════════════════════
export function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
export function firstDay(y,m){ const d=new Date(y,m,1).getDay(); return d===0?6:d-1; }
export function dkey(y,m,d){ return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
export function fmtDataIT(input){
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
export const NOMI_GIORNI_IT=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
export const NOMI_MESI_IT=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];

// Divide una stringa "07:15 - 13:30" / "07:15-13:30" / "07:15–13:30" in
// {inizio, fine}. Serve per interpretare JSON esterni che riportano
// l'orario come intervallo unico invece di oraInizio/oraFine separati.
function dividiOrarioTesto(testoRaw){
  const s = (testoRaw||"").toString().trim();
  if(!s || /tutto il giorno/i.test(s)) return { inizio:"", fine:"" };
  let parti = s.split(/\s*[-–—]\s*/);
  if(parti.length!==2){
    // fallback: "07:30 13:45" (spazio invece di trattino fra le due ore)
    const m = /^(\d{1,2}[:.]\d{2})\s+(\d{1,2}[:.]\d{2})$/.exec(s);
    if(m) parti = [m[1], m[2]];
  }
  if(parti.length===2 && parti[0] && parti[1]) return { inizio:parti[0].trim(), fine:parti[1].trim() };
  return { inizio:"", fine:"" };
}

// Interpreta un riferimento testuale a mese/anno tipo "Agosto 2026" o
// "Gennaio" (con l'anno passato separatamente in un campo "anno" a parte).
// Restituisce {mese, anno} (mese 1-12), null nei campi non riconosciuti.
function parseMeseAnnoTesto(testoRaw, annoSeparato){
  const s = (testoRaw||"").toString().trim().toLowerCase();
  const m = /^([a-zàèéìòù]+)\s*(\d{4})?$/i.exec(s);
  if(!m) return { mese:null, anno:null };
  const idx = NOMI_MESI_IT.indexOf(m[1]);
  const mese = idx>=0 ? idx+1 : null;
  const anno = m[2] ? parseInt(m[2],10) : (annoSeparato!=null ? parseInt(annoSeparato,10) : null);
  return { mese, anno };
}

// Converte "1 agosto 2026" -> "2026-08-01". Restituisce null se non riconosciuta.
function dataItalianaEstesaToISO(testoRaw){
  const m = /^(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{4})$/i.exec((testoRaw||"").toString().trim());
  if(!m) return null;
  const idx = NOMI_MESI_IT.indexOf(m[2].toLowerCase());
  if(idx<0) return null;
  return `${m[3]}-${String(idx+1).padStart(2,"0")}-${String(parseInt(m[1],10)).padStart(2,"0")}`;
}

// Converte "01/03/2026" o "01-03-2026" (giorno/mese/anno, convenzione
// italiana) -> "2026-03-01". Restituisce null se non riconosciuta o se
// mese/giorno non sono in un range plausibile.
function dataSlashToISO(testoRaw){
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec((testoRaw||"").toString().trim());
  if(!m) return null;
  const giorno = parseInt(m[1],10), mese = parseInt(m[2],10), anno = parseInt(m[3],10);
  if(mese<1||mese>12||giorno<1||giorno>31) return null;
  return `${anno}-${String(mese).padStart(2,"0")}-${String(giorno).padStart(2,"0")}`;
}

// Toglie artefatti tipo "[span_114](start_span)[span_114](end_span)" che
// alcuni OCR/AI esterni lasciano nel testo estratto (visti nei tentativi
// con span citati nel testo), e rifila gli spazi. Applicato a OGNI valore
// testuale prima di usarlo, altrimenti finiscono dentro titolo/note e il
// match col modello (che non li ha) fallisce sempre.
function pulisciTestoImport(testoRaw){
  return (testoRaw==null ? "" : String(testoRaw))
    .replace(/\[span_\d+\]\(\s*(?:start|end)_span\s*\)/gi, "")
    .trim();
}

// Legge un campo cercando fra più nomi candidati, IGNORANDO maiuscole/
// minuscole nella chiave: un OCR/AI esterno a volte manda "Titolo"/
// "TITOLO"/"Ora" invece di "titolo"/"orario", e l'accesso diretto o.titolo
// è case-sensitive e non li trova. Ritorna undefined se nessun candidato
// esiste o è vuoto.
function campoCI(o, ...nomi){
  if(!o || typeof o!=="object") return undefined;
  // Mappa chiave-lowercase -> chiave-originale calcolata una sola volta per
  // oggetto (cache su una proprietà non enumerabile), invece di rifare
  // Object.keys()+find() per ogni singolo nome cercato: su import grandi con
  // molte righe e molti campi per riga questo era il costo dominante che
  // teneva il thread occupato e bloccava la UI durante l'importazione.
  let mappa = o.__ciMap;
  if(!mappa){
    mappa = {};
    for(const k of Object.keys(o)) mappa[k.toLowerCase()] = k;
    Object.defineProperty(o, "__ciMap", { value: mappa, enumerable:false, configurable:true });
  }
  for(const nome of nomi){
    const trovata = mappa[nome.toLowerCase()];
    if(trovata!==undefined && o[trovata]!=null && o[trovata]!=="") return o[trovata];
  }
  return undefined;
}

// Estrae il JSON "vero" da un testo che può avere fence markdown
// (```json ... ```) e/o artefatti appiccicati PRIMA o DOPO le parentesi,
// es. "]```[span_0](start_span)[span_0](end_span)": JSON.parse fallisce su
// tutto il blob anche se il JSON al suo interno è perfettamente valido.
// Cerca la prima [ o { e segue la profondità delle parentesi (ignorando
// quelle dentro alle stringhe) fino a quando torna a 0: quello è il vero
// confine del JSON, tutto il resto attorno viene scartato.
export function estraiJsonDaTesto(testoRaw){
  const s = (testoRaw||"").toString();
  const inizio = s.search(/[\[{]/);
  if(inizio===-1) return s.trim();
  let profondita = 0, inStringa = false, escape = false;
  for(let i=inizio; i<s.length; i++){
    const c = s[i];
    if(escape){ escape = false; continue; }
    if(c==="\\"){ escape = true; continue; }
    if(c==='"'){ inStringa = !inStringa; continue; }
    if(inStringa) continue;
    if(c==="["||c==="{") profondita++;
    else if(c==="]"||c==="}"){
      profondita--;
      if(profondita===0) return s.slice(inizio, i+1);
    }
  }
  return s.slice(inizio).trim();
}

// ---- Classificatore note della vecchia app --------------------------
// Nella vecchia app "auto" e "collega" non erano campi separati: erano
// righe dentro l'array "note", mischiate alle note vere e proprie. Qui le
// si separa nei campi giusti della nuova app:
//  - "CH NN" (anche con un cognome sulla stessa riga, es. "CH 51 SANGES")
//    -> campo auto
//  - un modello di auto noto senza "CH" davanti (es. "DOBLO 112")
//    -> campo auto, diventa "CH DOBLO 112"
//  - una o due parole tutte maiuscole (es. "LEPRE", "LA MANNA", "MEO N")
//    -> campo collega
//  - tutto il resto resta nel campo note
// Modelli di auto noti che compaiono senza "CH" davanti: per aggiungerne
// altri, scrivere il nome in minuscolo qui sotto.
const MODELLI_AUTO_NOTI = ["doblo"];

// Righe che assomigliano a un cognome (una o due parole tutte maiuscole)
// ma non lo sono, quindi vanno sempre lasciate in nota anche se altrimenti
// combacerebbero con la regola del cognome (es. "RIS S3102", "PERIMETRALE").
const NOTE_NON_COLLEGA_PREFISSI = ["ris", "ch"];
const NOTE_NON_COLLEGA_ESATTE = ["perimetrale"];

function sembraCognome(rigaRaw){
  const p = pulisciTestoImport(rigaRaw);
  if(!p) return false;
  if(/\d/.test(p)) return false;
  if(/^richiesto/i.test(p)) return false;
  const chiaveIntera = p.toLowerCase();
  if(NOTE_NON_COLLEGA_ESATTE.includes(chiaveIntera)) return false;
  if(NOTE_NON_COLLEGA_PREFISSI.some(pref=>chiaveIntera.startsWith(pref))) return false;
  const parole = p.split(/\s+/);
  if(parole.length<1 || parole.length>2) return false;
  return parole.every(w=>/^[A-ZÀÁÈÉÌÍÒÓÙÚ']+$/.test(w));
}

// Classifica UNA riga di nota della vecchia app in auto / collega / nota.
function classificaRigaNota(rigaRaw){
  const riga = pulisciTestoImport(rigaRaw);
  if(!riga) return { tipo:"nota", testo:"" };

  // "CH NN" da solo, oppure "CH NN COGNOME" sulla stessa riga
  let m = /^CH\s*(\d+)(?:\s+(.+))?$/i.exec(riga);
  if(m){
    const resto = m[2] ? m[2].trim() : "";
    const restoECognome = resto && sembraCognome(resto);
    return {
      tipo: "auto",
      auto: `CH ${m[1]}`,
      collegaExtra: restoECognome ? resto : "",
      notaExtra: resto && !restoECognome ? resto : "",
    };
  }

  // Modello auto noto senza "CH" davanti, es. "DOBLO 112" -> "CH DOBLO 112"
  m = /^([A-Za-zÀ-ù]+)\s+(\d+)$/.exec(riga);
  if(m && MODELLI_AUTO_NOTI.includes(m[1].toLowerCase())){
    return { tipo:"auto", auto:`CH ${riga}` };
  }

  if(sembraCognome(riga)) return { tipo:"collega", testo:riga };

  return { tipo:"nota", testo:riga };
}

// Passa l'intero array "note" della vecchia app e restituisce i tre campi
// separati della nuova app: {auto, collega, note}.
function classificaNoteVecchiaApp(noteArray){
  const auto = [], collega = [], note = [];
  for(const rigaRaw of noteArray){
    const esito = classificaRigaNota(rigaRaw);
    if(esito.tipo==="auto"){
      auto.push(esito.auto);
      if(esito.collegaExtra) collega.push(esito.collegaExtra);
      if(esito.notaExtra) note.push(esito.notaExtra);
    } else if(esito.tipo==="collega"){
      collega.push(esito.testo);
    } else if(esito.testo){
      note.push(esito.testo);
    }
  }
  return { auto: auto.join(", "), collega: collega.join(", "), note: note.join("; ") };
}

// Adatta un JSON di forma ARBITRARIA — array piatto, oggetto con l'array
// annidato sotto una chiave qualsiasi ("voci"/"eventi"/"dettagli"/...), un
// singolo giorno come oggetto invece che un array, "giorno" numerico (anche
// con testo extra tipo "30 Ven") invece di "data" completa, "orario"/"ora"
// come intervallo unico invece di oraInizio/oraFine separati, chiavi in
// Maiuscolo o minuscolo indifferentemente, "titolo" assente ma di fatto
// presente dentro "note" — al formato piatto {data, titolo, oraInizio,
// oraFine, auto, collega, note} che l'import si aspetta. Pensato per
// digerire l'output libero di un OCR/AI esterno all'app (che cambia
// struttura, capitalizzazione e a volte lascia artefatti a ogni
// tentativo): qui si prova a INTERPRETARE la forma del dato, ma il
// modello associato al titolo resta comunque cercato e validato dopo, in
// importaTurniPdfJson — un titolo non riconosciuto in questo calendario
// finisce comunque tra i "mancanti"/"sospetti", non viene mai importato a
// caso o inventato.
export function normalizzaRigheImportGrezzo(input, annoDefault, meseDefault){
  const righe = [];
  const CHIAVI_GESTITE = ["data","giorno","titolo","turno","modello","codice","mese","anno"];

  function estraiTitolo(o){
    const v = campoCI(o, "titolo", "turno", "modello", "codice", "nome_turno");
    return v!=null ? pulisciTestoImport(v) : "";
  }
  function estraiGiornoNumero(o){
    const raw = campoCI(o, "giorno");
    if(raw==null) return null;
    if(typeof raw==="number") return raw;
    // Prende le cifre iniziali e ignora il resto ("30 Ven" -> 30,
    // "28 Sab[span_114]..." -> 28): il giorno a volte arriva con il nome
    // del giorno della settimana o artefatti OCR appiccicati.
    const m = /^\s*(\d{1,2})/.exec(pulisciTestoImport(raw));
    return m ? parseInt(m[1],10) : null;
  }
  function estraiOrario(o){
    const oi = campoCI(o, "oraInizio", "ora_inizio", "inizio");
    const of = campoCI(o, "oraFine", "ora_fine", "fine");
    if(oi!=null || of!=null){
      return { inizio: oi!=null?pulisciTestoImport(oi):"", fine: of!=null?pulisciTestoImport(of):"" };
    }
    const combinato = campoCI(o, "orario", "ora", "fascia_oraria", "fasciaoraria");
    if(combinato!=null) return dividiOrarioTesto(pulisciTestoImport(combinato));
    return { inizio:"", fine:"" };
  }
  function estraiNoteEsplicite(o){
    const parti = [];
    const note = campoCI(o, "note", "nota");
    if(note!=null) parti.push(Array.isArray(note) ? note.map(pulisciTestoImport).join("; ") : pulisciTestoImport(note));
    const dettagli = campoCI(o, "dettagli", "dettaglio");
    if(typeof dettagli==="string" && dettagli.trim()) parti.push(pulisciTestoImport(dettagli));
    return parti.join("; ");
  }
  function costruisciData(o, ctx){
    const dataRaw = campoCI(o, "data");
    if(dataRaw!=null){
      const d = pulisciTestoImport(dataRaw);
      if(/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      const isoEstesa = dataItalianaEstesaToISO(d);
      if(isoEstesa) return isoEstesa;
      const isoSlash = dataSlashToISO(d);
      if(isoSlash) return isoSlash;
    }
    const giornoNum = estraiGiornoNumero(o);
    if(giornoNum && ctx.anno && ctx.mese){
      return `${ctx.anno}-${String(ctx.mese).padStart(2,"0")}-${String(giornoNum).padStart(2,"0")}`;
    }
    return null;
  }
  function aggiornaContesto(o, ctx){
    let { mese, anno } = ctx;
    const annoRaw = campoCI(o, "anno");
    if(annoRaw!=null) anno = parseInt(pulisciTestoImport(annoRaw),10) || anno;
    const meseRaw = campoCI(o, "mese");
    if(meseRaw!=null){
      const r = parseMeseAnnoTesto(pulisciTestoImport(meseRaw), anno);
      if(r.mese) mese = r.mese;
      if(r.anno) anno = r.anno;
    }
    return { mese, anno };
  }
  function assomigliaARigaTurno(o){
    if(!o || typeof o!=="object" || Array.isArray(o)) return false;
    const haData = campoCI(o,"data")!=null || estraiGiornoNumero(o)!=null;
    const haTitoloEsplicito = !!estraiTitolo(o);
    const noteRaw = campoCI(o,"note");
    return haData && (haTitoloEsplicito || typeof noteRaw==="string");
  }
  function elaboraRiga(o, ctx){
    const data = costruisciData(o, ctx);
    let titolo = estraiTitolo(o);
    const noteRawIniziale = campoCI(o,"note");

    // Se "note" è un array (formato tipico della vecchia app), separa le
    // righe CH NN / modello auto noto / cognome nei campi auto e collega
    // invece di lasciarle tutte mischiate nel campo note.
    let note, autoDaNote = "", collegaDaNote = "";
    if(Array.isArray(noteRawIniziale)){
      const cls = classificaNoteVecchiaApp(noteRawIniziale);
      note = cls.note; autoDaNote = cls.auto; collegaDaNote = cls.collega;
      const dettagli = campoCI(o, "dettagli", "dettaglio");
      if(typeof dettagli==="string" && dettagli.trim()){
        note = note ? `${note}; ${pulisciTestoImport(dettagli)}` : pulisciTestoImport(dettagli);
      }
    } else {
      note = estraiNoteEsplicite(o);
    }

    if(!titolo){
      const noteRaw = campoCI(o,"note");
      if(typeof noteRaw==="string" && pulisciTestoImport(noteRaw)){
        // Nessun titolo/turno esplicito: alcuni export usano "note" come
        // etichetta del turno stesso (es. "FESTIVO", "MATTINA"). La usiamo
        // come titolo — se non corrisponde a nessun modello reale di
        // questo calendario finirà comunque tra i "mancanti", non viene
        // inventato nessun modello.
        titolo = pulisciTestoImport(noteRaw);
        const dettagli = campoCI(o,"dettagli","dettaglio");
        note = (typeof dettagli==="string" && dettagli.trim()) ? pulisciTestoImport(dettagli) : "";
      }
    }
    if(!data || !titolo) return;
    const { inizio, fine } = estraiOrario(o);
    righe.push({
      data, titolo, oraInizio:inizio, oraFine:fine,
      auto: pulisciTestoImport(campoCI(o,"auto")||"") || autoDaNote,
      collega: pulisciTestoImport(campoCI(o,"collega")||"") || collegaDaNote,
      note,
    });
  }
  function cammina(nodo, ctx){
    if(Array.isArray(nodo)){ for(const el of nodo) cammina(el, ctx); return; }
    if(!nodo || typeof nodo!=="object") return;
    const ctxAggiornato = aggiornaContesto(nodo, ctx);
    if(assomigliaARigaTurno(nodo)) elaboraRiga(nodo, ctxAggiornato);
    const ctxFiglio = { ...ctxAggiornato };
    const giornoProprio = estraiGiornoNumero(nodo);
    if(giornoProprio!=null) ctxFiglio.giornoEreditato = giornoProprio;
    const dataPropria = campoCI(nodo,"data");
    if(dataPropria!=null) ctxFiglio.dataEreditata = dataPropria;
    for(const [chiave, valore] of Object.entries(nodo)){
      if(CHIAVI_GESTITE.includes(chiave.toLowerCase())) continue;
      if(Array.isArray(valore)){
        for(const el of valore){
          if(el && typeof el==="object" && !Array.isArray(el)){
            const conEredita = { ...el };
            if(campoCI(conEredita,"data")==null && estraiGiornoNumero(conEredita)==null){
              if(ctxFiglio.dataEreditata) conEredita.data = ctxFiglio.dataEreditata;
              else if(ctxFiglio.giornoEreditato!=null) conEredita.giorno = ctxFiglio.giornoEreditato;
            }
            cammina(conEredita, ctxFiglio);
          } else {
            cammina(el, ctxFiglio);
          }
        }
      } else if(valore && typeof valore==="object"){
        cammina(valore, ctxFiglio);
      }
    }
  }

  cammina(input, { mese: meseDefault||null, anno: annoDefault||null });
  return righe;
}

// Riconosce il formato testuale "a blocchi" tipo:
//   Giovedi 01/01/2026
//     Turno:    DF AVVOCATA APPIEDATO
//     Orario:   14:00 - 20:15  (6h 15m)
//     Auto:     -
//     Collega:  MORRA
//     Note:     -
// (non è JSON: è l'export testuale/OCR di un turnario). Ogni blocco inizia
// con una riga "NomeGiorno GG/MM/AAAA" e prosegue con righe "Campo: valore"
// fino al blocco successivo. "-" o vuoto nei campi valgono come assenti.
// Restituisce un array di oggetti compatibile con normalizzaRigheImportGrezzo.
export function normalizzaTestoGrezzoTurni(testoRaw){
  const testo = pulisciTestoImport(testoRaw);
  if(!testo) return [];
  const righeTesto = testo.split(/\r?\n/);
  const RIGA_DATA = /^[A-Za-zÀ-ù]+\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s*$/;
  const RIGA_CAMPO = /^\s*([A-Za-zÀ-ùéé][\w àèéìòù]*)\s*:\s*(.*)$/i;

  const blocchi = [];
  let corrente = null;
  for(const rigaOrig of righeTesto){
    const riga = rigaOrig.trim();
    if(!riga) continue;
    const mData = RIGA_DATA.exec(riga);
    if(mData){
      corrente = { data: mData[1], campi: {} };
      blocchi.push(corrente);
      continue;
    }
    if(!corrente) continue;
    const mCampo = RIGA_CAMPO.exec(riga);
    if(mCampo){
      const chiave = mCampo[1].trim().toLowerCase();
      let valore = mCampo[2].trim();
      if(valore==="-") valore = "";
      corrente.campi[chiave] = valore;
    }
  }

  const risultato = [];
  for(const b of blocchi){
    const dataISO = dataSlashToISO(b.data);
    if(!dataISO) continue;
    const titolo = b.campi["turno"] || "";
    if(!titolo) continue;
    // "Orario" tipo "14:00 - 20:15  (6h 15m)" o "Tutto il giorno": scarta la
    // durata fra parentesi prima di passarlo a dividiOrarioTesto.
    const orarioGrezzo = (b.campi["orario"]||"").replace(/\([^)]*\)\s*$/,"").trim();
    const { inizio, fine } = dividiOrarioTesto(orarioGrezzo);
    const auto = b.campi["auto"]||"";
    const collega = b.campi["collega"]||"";
    const note = b.campi["note"]||"";
    risultato.push({ data: dataISO, titolo, oraInizio: inizio, oraFine: fine, auto, collega, note });
  }
  return risultato;
}

function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m2=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*m2+114)/31),da=((h+l-7*m2+114)%31)+1;
  return {m:mo-1,d:da};
}
// Elenco festività italiane "conosciute": nazionali (sempre attive di default)
// + patronali/facoltative comuni (disattive di default). L'utente può
// abilitare/disabilitare ciascuna singolarmente dalle Impostazioni.
// {key, name, m, d} per le fisse; {key, name, easterOffset} per quelle legate a Pasqua.
const FESTIVITA_CATALOGO = [
  { key:"capodanno",   name:"Capodanno",                 m:0,  d:1  },
  { key:"epifania",    name:"Epifania",                   m:0,  d:6  },
  { key:"pasqua",      name:"Pasqua",                     easterOffset:0 },
  { key:"pasquetta",   name:"Lunedì di Pasqua",            easterOffset:1 },
  { key:"liberazione", name:"Giorno della liberazione",   m:3,  d:25 },
  { key:"sanmarco",    name:"San Marco",                  m:3,  d:25 },
  { key:"lavoro",      name:"Festa del Lavoro",           m:4,  d:1  },
  { key:"pentecoste",  name:"Lunedì di Pentecoste",        easterOffset:50 },
  { key:"repubblica",  name:"Anniversario della Repubblica", m:5, d:2 },
  { key:"sangiovanni", name:"San Giovanni",               m:5,  d:24 },
  { key:"santipietropaolo", name:"Santi Pietro e Paolo",  m:5,  d:29 },
  { key:"santarosalia",name:"Santa Rosalia",              m:6,  d:15 },
  { key:"ferragosto",  name:"Ferragosto",                 m:7,  d:15 },
  { key:"sangennaro",  name:"San Gennaro",                m:8,  d:19 },
  { key:"sanfrancesco",name:"San Francesco",              m:9,  d:4  },
  { key:"sanpetronio", name:"San Petronio",                m:9,  d:4  },
  { key:"ognissanti",  name:"Ognissanti",                 m:10, d:1  },
  { key:"sannicola",   name:"San Nicola",                  m:11, d:6  },
  { key:"santambrogio",name:"Sant'Ambrogio",               m:11, d:7  },
  { key:"immacolata",  name:"Immacolata Concezione",      m:11, d:8  },
  { key:"natale",      name:"Natale",                     m:11, d:25 },
  { key:"santostefano",name:"Santo Stefano",               m:11, d:26 },
];
// Festività attive di default (le altre — patronali locali — partono disattivate).
export const FESTIVITA_DEFAULT_ATTIVE = ["capodanno","epifania","pasqua","pasquetta","liberazione",
  "lavoro","repubblica","ferragosto","sangennaro","sanfrancesco","ognissanti","immacolata","natale","santostefano"];

export function resolveFestivitaCatalogo(y){
  const e=easter(y);
  const easterDate = new Date(y,e.m,e.d);
  return FESTIVITA_CATALOGO.map(f=>{
    if(f.easterOffset!==undefined){
      const dd = new Date(easterDate); dd.setDate(dd.getDate()+f.easterOffset);
      return { key:f.key, name:f.name, m:dd.getMonth(), d:dd.getDate() };
    }
    return { key:f.key, name:f.name, m:f.m, d:f.d };
  });
}
export function italianHols(y, abilitate){
  const attive = abilitate || FESTIVITA_DEFAULT_ATTIVE;
  return resolveFestivitaCatalogo(y).filter(f=>attive.includes(f.key));
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
export function normalizzaOraHHMM(raw){
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
export function oraInMinuti(raw){
  const hhmm=normalizzaOraHHMM(raw);
  if(!hhmm) return null;
  const [h,m]=hhmm.split(":").map(Number);
  return h*60+m;
}
export function calcFine6h15(tIn){
  const mins=oraInMinuti(tIn);
  if(mins===null) return "";
  const tot=mins+375;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`;
}
export function calcFine6h30(tIn){
  const mins=oraInMinuti(tIn);
  if(mins===null) return "";
  const tot=mins+390;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`;
}
// Calcola l'orario di fine di un modello a partire dal suo tempo/inizio/fine.
// Centralizza una logica che era ripetuta identica in circa 10 punti del
// file: se cambia in futuro (es. si aggiunge "6h45"), va cambiata qui sola.
//   - "h24": nessun orario di fine (turno tutto il giorno)
//   - "6h15"/"6h30": fine calcolata automaticamente da inizio
//   - "personalizzato" (o altro): usa mod.fine così com'è salvato
export function calcFineModello(mod){
  if(!mod) return "";
  if(mod.tempo==="h24") return "";
  if(mod.tempo==="6h15") return calcFine6h15(mod.inizio)||"";
  if(mod.tempo==="6h30") return calcFine6h30(mod.inizio)||"";
  return mod.fine||"";
}
export function calcDurata(tIn,tOut){
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
export function minutiTurnoModello(m){
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
export function isModelloTurnazioneDefault(m){
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
export function categoriaTurnoAutomatica(m){
  if(!m) return null;
  if(m.tempo==="h24" || !m.inizio) return null; // H24 non ha una fascia oraria di inizio
  const isPrimo = inRange(minsOf(m.inizio), 360, 705);
  return isPrimo ? "primo" : "secondo";
}
export function categoriaAppAutoAutomatica(m){
  if(!m) return null;
  if(m.tempo==="h24") return null; // H24 non ha mai categoria APP/AUTO
  const titoloEvt=(m.titolo||"").toUpperCase();
  return titoloEvt.includes("APP") ? "app" : "auto";
}
export function getShiftBand(tIn){
  const mins=oraInMinuti(tIn);
  if(mins===null) return "diurno";
  const h=Math.floor(mins/60);
  if(h>=6 && h<22) return "diurno";
  return "notturno";
}
export function isFestivo(dateKey){
  const d=new Date(dateKey);
  return d.getDay()===0;
}
// #endregion

// #region SEZIONE 26: MODELLO CARD & FORM
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
      onClick={e=>{ e.stopPropagation(); if(!disabled){ onClick(); } setPressed(false); }}
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

export function ModelloCard({m, T, accent, fasceAutomatiche, onEdit, onDelete, onMoveUp, onMoveDown, onDragStart, onDragOver, onDrop, onDragEnd, onTouchStart, onTouchMove, onTouchEnd, selectMode, selected, onToggleSelect, isDragging, isDropTarget}){
  const colore=m.coloreCustom||(m.tempo==="h24"?"#64748b":getColorByTime(m.inizio, fasceAutomatiche));
  const durata=m.tempo==="h24"?"H24"
    :m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)} • 6h 15m`:m.tempo==="6h30"&&m.inizio?`${m.inizio} - ${calcFine6h30(m.inizio)} • 6h 30m`
    :m.inizio&&m.fine?`${m.inizio} - ${m.fine} • ${calcDurata(m.inizio,m.fine)}`
    :m.inizio?m.inizio:"";
  const cardRef = useRef(null);
  // React attacca onTouchMove come "passive" in molte versioni (ottimizzazione
  // per lo scroll): quando è passive, preventDefault() al suo interno viene
  // IGNORATO silenziosamente dal browser — lo scroll nativo vince sempre e il
  // drag non parte mai, pur girando comunque tutta la logica JS in background
  // (motivo per cui sembrava "non rispondere per niente"). Per garantire che
  // preventDefault funzioni sempre, il listener va attaccato manualmente sul
  // nodo DOM con {passive:false} esplicito, non tramite la prop JSX.
  useEffect(()=>{
    const el = cardRef.current;
    if(!el || !onTouchMove) return;
    const handler = (e)=>onTouchMove(e);
    el.addEventListener("touchmove", handler, {passive:false});
    return ()=>el.removeEventListener("touchmove", handler);
  }, [onTouchMove]);
  return (
    <div
      ref={cardRef}
      draggable={!!(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={e=>{e.preventDefault();if(onDragOver)onDragOver(e);}}
      onDrop={e=>{e.preventDefault();if(onDrop)onDrop(e);}}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-modello-id={m.id}
      style={{display:"flex",alignItems:"center",padding:"12px 14px",position:"relative",
        cursor:selectMode?"pointer":(onDragStart?"grab":"pointer"),
        touchAction:onTouchStart?"none":"auto",
        // Il modello trascinato appare più trasparente: segnala che è "in volo".
        opacity:isDragging?0.35:1,
        // Quando la card è il bersaglio corrente del trascinamento, uno
        // sfondo leggero la evidenzia (il modello lasciato qui finirà
        // esattamente in questa posizione, spostando questa card e le
        // successive più in basso).
        background:isDropTarget?(accent+"14"):"transparent",
        transition:"opacity 0.15s ease, background 0.15s ease"}}
      onClick={selectMode?onToggleSelect:onEdit}>
      {isDropTarget&&(
        // Riga netta e colorata sopra la card: indica con precisione dove
        // finirà il modello trascinato una volta rilasciato, più chiara del
        // semplice sfondo per capire "sopra o sotto" a colpo d'occhio.
        <div style={{position:"absolute",top:0,left:8,right:8,height:3,
          borderRadius:2,background:accent,boxShadow:`0 0 6px ${accent}99`}}/>
      )}
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


export function ModelForm({T, form, setForm, accent, dark, fasceAutomatiche, modelli=[], reports=[], getConteggioConfig, updateConteggioConfig, suggerimentiTitolo=[], suggerimentiNomeVis=[], onRimuoviSuggerimento, onSave}){
  const [reportEspanso, setReportEspanso] = useState(null);
  const autoColore=form.tempo==="h24"?"#64748b":getColorByTime(form.inizio, fasceAutomatiche);
  const coloreVis=form.coloreCustom||autoColore;
  const fineAuto=form.tempo==="6h15"&&form.inizio?calcFine6h15(form.inizio):form.tempo==="6h30"&&form.inizio?calcFine6h30(form.inizio):null;
  const [showPal,setShowPal]=useState(false);
  return (
    <div style={{padding:"16px 14px 40px"}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:8}}>
        <AutocompleteInput value={form.titolo} onChange={e=>setForm(f=>({...f,titolo:e.target.value.toUpperCase()}))}
          suggestions={suggerimentiTitolo}
          onRemoveSuggestion={onRimuoviSuggerimento?(s=>onRimuoviSuggerimento("titolo", s)):undefined}
          placeholder="TITOLO / CODICE (es. 00-06)"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <AutocompleteInput value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value.toUpperCase()}))}
          suggestions={suggerimentiNomeVis}
          onRemoveSuggestion={onRimuoviSuggerimento?(s=>onRimuoviSuggerimento("nome_visualizzato", s)):undefined}
          placeholder="NOME DA MOSTRARE NEL CALENDARIO (es. NOTTE)"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>DURATA TURNO</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["h24","H24"],["6h15","6h 15m"],["6h30","6h 30m"],["personalizzato","PERSONALIZZATO"]].map(([v,l])=>(
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
            {(form.tempo==="6h15"||form.tempo==="6h30")&&fineAuto?(
              <span style={{fontSize:15,fontWeight:700,color:T.sub}}>{fineAuto} (auto)</span>
            ):(
              <input type="time" value={form.fine} onChange={e=>setForm(f=>({...f,fine:e.target.value}))}
                style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:15,fontWeight:700}}/>
            )}
          </div>
        </div>
      )}
      {(()=>{
        // Le sezioni CATEGORIA TURNO / CATEGORIA APP-AUTO si applicano a
        // TUTTI i modelli normali come prima. Vengono nascoste SOLO per i
        // tre modelli PROTRAZIONE (pagamento, recupero, -recupero): per
        // quei tre non ha senso la distinzione 1Â°/2Â° turno o APP/AUTO.
        // Il riconoscimento usa lo stesso criterio (radice
        // PROTRAZIONE/PROTAZIONE + PAGAMENTO/RECUPERO nel titolo) giÃ 
        // usato nel resto del progetto per riconoscere questi tre modelli.
        const titoloNorm = (form.titolo||"").trim().toUpperCase().replace(/\s+/g," ");
        const haRadiceProtrazione = titoloNorm.includes("PROTRAZIONE") || titoloNorm.includes("PROTAZIONE");
        const eModelloProtrazione = haRadiceProtrazione && (titoloNorm.includes("PAGAMENTO") || titoloNorm.includes("RECUPERO"));
        if(eModelloProtrazione) return null;

        return (
          <>
            <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>CATEGORIA TURNO (per report Turnazione)</div>
            {(()=>{
              // â”€â”€ Due gruppi indipendenti, ciascuno con la propria "Automatica" e
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
          </>
        );
      })()}
      {reports.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>CATEGORIA REPORT</div>
          {!form.id?(
            <div style={{fontSize:11,color:T.sub,paddingLeft:4}}>
              Salva il modello per poterlo includere o escludere dai report.
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {reports.map(r=>{
                const isTurnazione = r.type==="turnazione";
                const cfg = getConteggioConfig(r.id, r.type);
                const isDefault = isTurnazione && isModelloTurnazioneDefault(form);
                const esclusi = cfg.modelliEsclusi||[];
                const aggiunti = cfg.modelliAggiunti||[];
                const whitelist = cfg.modelliInclusi||[];
                const incluso = isTurnazione
                  ? ((isDefault && !esclusi.includes(form.id)) || aggiunti.includes(form.id))
                  : (whitelist.length===0 || whitelist.includes(form.id));
                const toggle=()=>{
                  if(isTurnazione){
                    if(incluso){
                      if(isDefault) updateConteggioConfig(r.id, {...cfg, modelliEsclusi:[...esclusi, form.id]});
                      else updateConteggioConfig(r.id, {...cfg, modelliAggiunti: aggiunti.filter(id=>id!==form.id)});
                    } else {
                      if(isDefault) updateConteggioConfig(r.id, {...cfg, modelliEsclusi: esclusi.filter(id=>id!==form.id)});
                      else updateConteggioConfig(r.id, {...cfg, modelliAggiunti:[...aggiunti, form.id]});
                    }
                  } else {
                    if(incluso){
                      const nuova = whitelist.length===0
                        ? modelli.filter(mm=>mm.id!==form.id).map(mm=>mm.id)
                        : whitelist.filter(id=>id!==form.id);
                      updateConteggioConfig(r.id, {...cfg, modelliInclusi:nuova});
                    } else {
                      updateConteggioConfig(r.id, {...cfg, modelliInclusi:[...whitelist, form.id]});
                    }
                  }
                };
                const espanso = reportEspanso===r.id;
                const isConteggio = r.type==="conteggio_turni";
                const sottomenuLiberi = isConteggio ? (cfg.sottomenu||[]).filter(sm=>sm.tipo==="libero") : [];
                const espandibile = isTurnazione || (isConteggio && sottomenuLiberi.length>0);
                return (
                  <div key={r.id} style={{background:incluso?accent+"1f":T.s2,borderRadius:10,overflow:"hidden"}}>
                    <button onClick={()=>{
                        toggle();
                        if(espandibile) setReportEspanso(espanso?null:r.id);
                      }}
                      style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        width:"100%",padding:"9px 12px",borderRadius:0,border:"none",cursor:"pointer",
                        background:"transparent",textAlign:"left"}}>
                      <span style={{fontSize:13,fontWeight:700,color:T.text}}>{r.label}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,fontWeight:800,color:incluso?accent:T.sub}}>
                          {incluso?"✓ Incluso":"Escluso"}
                        </span>
                        {espandibile&&(
                          <span onClick={e=>{e.stopPropagation();setReportEspanso(espanso?null:r.id);}}
                            style={{fontSize:11,color:T.sub,padding:"2px 4px"}}>{espanso?"▲":"▼"}</span>
                        )}
                      </div>
                    </button>
                    {isTurnazione&&espanso&&(()=>{
                      const gruppiManuali = cfg.gruppiManuali||{};
                      const scelteTurno = gruppiManuali[form.id];
                      const scelteAppAuto = gruppiManuali[form.id+"_appauto"];
                      // Nessuna scelta esplicita ancora salvata per questo report: il pulsante
                      // evidenziato segue il modello (categoria manuale o automatica per orario/titolo),
                      // esattamente come farebbe il calcolo reale del report — mai "Escluso" di default.
                      const turnoDalModello = (form.categoria==="primo"||form.categoria==="secondo")
                        ? form.categoria : categoriaTurnoAutomatica(form);
                      const appAutoDalModello = (form.categoriaAppAuto==="app"||form.categoriaAppAuto==="auto")
                        ? form.categoriaAppAuto : (categoriaAppAutoAutomatica(form) || "auto");
                      const turnoAttuale = scelteTurno || turnoDalModello || "escluso";
                      const appAutoAttuale = scelteAppAuto || appAutoDalModello || "escluso";
                      function setTurno(v){
                        updateConteggioConfig(r.id, {...cfg, gruppiManuali:{...gruppiManuali, [form.id]:v}});
                      }
                      function setAppAuto(v){
                        updateConteggioConfig(r.id, {...cfg, gruppiManuali:{...gruppiManuali, [form.id+"_appauto"]:v}});
                      }
                      return (
                      <div style={{padding:"0 12px 12px"}}>
                        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>TURNO (solo per questo report)</div>
                        <div style={{display:"flex",gap:6,marginBottom:10}}>
                          {[["escluso","Escluso"],["primo","1° Turno"],["secondo","2° Turno"]].map(([v,l])=>(
                            <button key={v} onClick={()=>setTurno(v)}
                              style={{flex:1,padding:"7px 4px",borderRadius:8,cursor:"pointer",
                                fontWeight:700,fontSize:11,border:"none",
                                background:turnoAttuale===v?accent:T.surface,
                                color:turnoAttuale===v?"#fff":T.sub}}>{l}</button>
                          ))}
                        </div>
                        {form.tempo!=="h24"&&(<>
                          <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>APP/AUTO (solo per questo report)</div>
                          <div style={{display:"flex",gap:6}}>
                            {[["escluso","Escluso"],["app","APP"],["auto","AUTO"]].map(([v,l])=>(
                              <button key={v} onClick={()=>setAppAuto(v)}
                                style={{flex:1,padding:"7px 4px",borderRadius:8,cursor:"pointer",
                                  fontWeight:700,fontSize:11,border:"none",
                                  background:appAutoAttuale===v?accent:T.surface,
                                  color:appAutoAttuale===v?"#fff":T.sub}}>{l}</button>
                            ))}
                          </div>
                        </>)}
                      </div>
                      );
                    })()}
                    {isConteggio&&espanso&&sottomenuLiberi.length>0&&(
                      // Ogni sottomenu libero del report (es. "PIANO INCENTIVANTE"
                      // rinominato con dentro un sottomenu "1° turno") elenca i
                      // suoi gruppi qui, con un tasto per modello per assegnarlo:
                      // prima questa sezione non esisteva affatto, quindi non
                      // c'era modo di includere il modello nei gruppi liberi
                      // di un report Conteggio turni dal form del modello.
                      <div style={{padding:"0 12px 12px",display:"flex",flexDirection:"column",gap:10}}>
                        {sottomenuLiberi.map(sm=>{
                          const assegnazioni = sm.assegnazioni||{};
                          const gruppoAttuale = assegnazioni[form.id]||"";
                          function setGruppo(key){
                            const nextAsseg = {...assegnazioni};
                            if(nextAsseg[form.id]===key) delete nextAsseg[form.id];
                            else nextAsseg[form.id]=key;
                            const nextSottomenu = (cfg.sottomenu||[]).map(x=>x.id===sm.id?{...x,assegnazioni:nextAsseg}:x);
                            updateConteggioConfig(r.id, {...cfg, sottomenu:nextSottomenu});
                          }
                          return (
                            <div key={sm.id}>
                              <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>{sm.nome}</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                <button onClick={()=>setGruppo("")}
                                  style={{padding:"7px 10px",borderRadius:8,cursor:"pointer",
                                    fontWeight:700,fontSize:11,border:"none",
                                    background:gruppoAttuale===""?T.sub:T.surface,
                                    color:gruppoAttuale===""?"#fff":T.sub}}>Nessuno</button>
                                {(sm.gruppi||[]).map(g=>(
                                  <button key={g.key} onClick={()=>setGruppo(g.key)}
                                    style={{padding:"7px 10px",borderRadius:8,cursor:"pointer",
                                      fontWeight:700,fontSize:11,border:"none",
                                      background:gruppoAttuale===g.key?(g.color||accent):T.surface,
                                      color:gruppoAttuale===g.key?"#fff":T.sub}}>{g.label}</button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{fontSize:11,color:T.sub,marginTop:6,paddingLeft:4}}>
            Include o esclude questo modello dai report elencati, esistenti e futuri.
          </div>
        </div>
      )}
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
          color:getContrastTextColor(accent),padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
        💾 Salva modello
      </button>
    </div>
  );
}

export const NB={background:"none",border:"none",fontSize:22,cursor:"pointer",
  padding:"0 4px",lineHeight:1,flexShrink:0,color:"rgba(255,255,255,0.8)"};
// #endregion

// #region SEZIONE 27: ROTAZIONE COMPONENTS
// ═══════════════════════════════════════════════════════════════
export function RotazioneCard({r, T, accent, modelli, onOpen, onEdit, onDelete}){
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

export function RotazioneForm({T, form, setForm, accent, modelli, onSave, sortedModelli}){
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
          color:getContrastTextColor(accent),padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
        💾 Salva rotazione
      </button>
    </div>
  );
}

export function ModelloSelector({label, value, onChange, modelli, T, required=false, last=false, sortedModelli}){
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
              {sel.tempo!=="h24"&&sel.inizio&&(
                <span style={{fontSize:12,color:T.sub,fontWeight:600}}>{sel.inizio}→{sel.fine||""}</span>
              )}
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
                    {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.tempo==="6h15"?` - ${calcFine6h15(m.inizio)}`:m.tempo==="6h30"?` - ${calcFine6h30(m.inizio)}`:m.fine?` - ${m.fine}`:""}`:m.tempo}
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

export function GrigliaRotazione({rot, T, accent, modelli, fasceAutomatiche, sundayColor, onUpdate}){
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
                        background:c||(isDOM?(sundayColor||(T.bg==="#f1f5f9"?"#fff5f5":"#2d0a0a")):T.s2),
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

// #endregion

// #region SEZIONE 30: VISTE ROTAZIONE NLRS/DOMENICHE
// ═══════════════════════════════════════════════════════════════
export function NLRSScalanteView({rot, T, accent, modelli}){
  const modRS=modelli.find(m=>m.id===rot.modelloRSId);
  const modNL=modelli.find(m=>m.id===rot.modelloNLId);

  const GIORNI_CICLO = [6, 5, 4, 3, 2, 1];

  function getCoppie(){
    if(!rot.dataInizio) return [];
    const primoRS = new Date(rot.dataInizio);
    const coppie = [];
    let giornoCicloIdx = GIORNI_CICLO.indexOf(primoRS.getDay());
    if(giornoCicloIdx === -1) giornoCicloIdx = 0;
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
        cicloN: coppie.length + 1,
      });

      giornoCicloIdx = (giornoCicloIdx + 1) % GIORNI_CICLO.length;
      const prossimoDow = GIORNI_CICLO[giornoCicloIdx];

      const base = new Date(dataCorrRS);
      base.setDate(base.getDate() + 27);
      let tentativo = new Date(base);
      let iter = 0;
      while(tentativo.getDay() !== prossimoDow && iter < 7){
        tentativo.setDate(tentativo.getDate() - 1);
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
            Ciclo scalante settimanale: Sab → Ven → Gio → Mer → Mar → Lun → (salta Dom) → Sab ...
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
                  {cp.rs ? (
                    <>
                      <div style={{fontSize:12,fontWeight:700,color:T.text}}>
                        {NOMI_GIORNI_IT[cp.rs.date.getDay()].slice(0,3)} {fmtDataIT(cp.rs.date)}
                      </div>
                      <div style={{fontSize:11,color:T.sub,marginTop:2}}>{modRS?.titolo||"—"}</div>
                    </>
                  ) : <div style={{fontSize:12,color:T.sub}}>—</div>}
                </div>
                <div style={{flex:1,padding:"10px 12px"}}>
                  <div style={{fontSize:10,fontWeight:800,color:cNL,marginBottom:3}}>NL</div>
                  {cp.nl ? (
                    <>
                      <div style={{fontSize:12,fontWeight:700,color:T.text}}>
                        {NOMI_GIORNI_IT[cp.nl.date.getDay()].slice(0,3)} {fmtDataIT(cp.nl.date)}
                      </div>
                      <div style={{fontSize:11,color:T.sub,marginTop:2}}>{modNL?.titolo||"—"}</div>
                    </>
                  ) : <div style={{fontSize:12,color:T.sub}}>—</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DomenicheView({rot, T, accent, modelli, fasceAutomatiche, onUpdate}){
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

export function NLRSView({rot, T, accent, modelli}){
  const modNL=modelli.find(m=>m.id===rot.modelloNLId);
  const modRS=modelli.find(m=>m.id===rot.modelloRSId);
  function getCiclo(){
    if(!rot.dataInizio) return [];
    const start = new Date(rot.dataInizio);
    const ciclo = [];
    let dataCorr = new Date(start);
    for(let s=0; s<(rot.nSettimane||52); s++){
      const isNL = (s % 2) === 0;
      const k = dkey(dataCorr.getFullYear(), dataCorr.getMonth(), dataCorr.getDate());
      ciclo.push({key:k, date:new Date(dataCorr), tipo: isNL ? "NL" : "RS", sett: s+1});
      const daysToAdd = dataCorr.getDay() === 1 ? 5 : 6;
      dataCorr.setDate(dataCorr.getDate() + daysToAdd);
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

    
