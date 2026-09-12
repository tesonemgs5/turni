import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 04-Rotazione.jsx — RICOSTRUITO
// ═══════════════════════════════════════════════════════════════════════
//
// Il file originale con questo nome non è mai stato recuperato (in due
// tentativi separati). Questo file è stato ricostruito da zero deducendo
// ogni funzione dal modo in cui viene usata in 01-App.jsx e 06-Logica.jsx.
//
// ⚠️ SEZIONI DA VERIFICARE A MANO (comportamento dedotto, non certo):
//   - FASCE_AUTOMATICHE_DEFAULT / getColorByTime / getColorLabel
//     (bande orarie automatiche per colorare i modelli — le fasce esatte
//     che usavi prima non sono note, ho messo 4 fasce standard)
//   - categoriaTurnoAutomatica / categoriaAppAutoAutomatica
//     (classificazione automatica 1°/2° turno e app/auto per i report)
//   - isModelloTurnazioneDefault (quali modelli contano come "turnazione
//     standard 6h15" nei report)
//   - getShiftBand (mai effettivamente chiamata da nessuna parte nel
//     codice che ho — presente solo per compatibilità di import)
//   - ModelForm — la parte "conteggio per report" (getConteggioConfig/
//     updateConteggioConfig) NON è inclusa: non avevo abbastanza contesto
//     sulla struttura dei report per ricostruirla senza rischiare di
//     rompere quella funzionalità. Il resto del form (titolo, nome
//     visualizzato, durata, orari, colore, categoria) è completo.
//   - ModelloCard / RotazioneCard — presenti per sicurezza (import
//     probabili da 02-Modelli.jsx, che non ho in questa sessione), sono
//     card di visualizzazione a basso rischio.
//
// Le 3 funzioni withEvento* (che toccano i dati reali dei turni) sono
// scritte nel modo più conservativo possibile: sempre immutabili (mai
// mutano lo store originale), sempre con deep-enough clone della sola
// porzione .events toccata.
// ═══════════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────────
// COSTANTI DI BASE
// ─────────────────────────────────────────────────────────────────────

export const MONTHS = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
];
export const NOMI_MESI_IT = MONTHS;

// Indicizzato come Date.getDay(): 0=Domenica..6=Sabato
export const NOMI_GIORNI_IT = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
export const DAYS = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

export const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
  "#10b981","#14b8a6","#06b6d4","#0ea5e9","#3b82f6","#6366f1",
  "#8b5cf6","#a855f7","#d946ef","#ec4899","#64748b","#78716c",
];

export const COLORE_H24 = "#64748b";

// Bande orarie automatiche di default, usate per colorare/etichettare i
// modelli in base all'orario di inizio (colByTime/colLabel). Da
// verificare/aggiustare rispetto a quelle realmente in uso prima.
export const FASCE_AUTOMATICHE_DEFAULT = [
  { key:"mattina",   label:"Mattina",   colore:"#f59e0b", da:"06:00", a:"14:00" },
  { key:"pomeriggio",label:"Pomeriggio",colore:"#0ea5e9", da:"14:00", a:"22:00" },
  { key:"notte",     label:"Notte",     colore:"#6366f1", da:"22:00", a:"06:00" },
  { key:"riposo",    label:"Riposo",    colore:"#94a3b8", da:"00:00", a:"00:00" },
];

// Array di chiavi delle festività attive di default (usato come fallback
// di store.nationalHolsEnabled finché l'utente non personalizza le sue
// preferenze in Impostazioni -> Festivi). Le chiavi devono corrispondere
// a quelle restituite da resolveFestivitaCatalogo().
export const FESTIVITA_DEFAULT_ATTIVE = [
  "capodanno", "epifania", "liberazione", "lavoro", "repubblica",
  "ferragosto", "ognissanti", "immacolata", "natale", "santostefano",
];

export const NB = {
  padding:"10px 14px", borderRadius:10, fontWeight:700, fontSize:13,
  cursor:"pointer", border:"none",
};

// Scala di dimensioni font usata (in origine) per gli stili condivisi tra
// 02-Modelli.jsx e 03-Calendario.jsx. Importata ma non referenziata
// direttamente nei file recuperati: valori standard forniti per
// compatibilità, da aggiustare se in qualche punto dell'interfaccia i
// testi risultano di dimensione diversa da quella attesa.
export const FONT_SIZE = {
  xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, xxl: 22,
};


// ─────────────────────────────────────────────────────────────────────
// UTILITY DI DATA / ORARIO
// ─────────────────────────────────────────────────────────────────────

export function dkey(year, monthIndex0, day) {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function firstDay(year, monthIndex0) {
  // Colonna (0=Lunedì..6=Domenica) su cui cade il giorno 1 del mese, nella
  // griglia del calendario che parte da Lunedì. Date.getDay() usa invece
  // 0=Domenica..6=Sabato: va convertito, altrimenti ogni mese che inizia
  // di Domenica (getDay()===0) risulterebbe con "zero celle vuote" prima
  // del giorno 1 invece di 6, sfalsando tutta la griglia di conseguenza.
  const dow = new Date(year, monthIndex0, 1).getDay();
  return (dow + 6) % 7;
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function generaIdLocale() {
  return "local_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function oraInMinuti(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function normalizzaOraHHMM(v) {
  if (!v) return "";
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return s;
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
}

export function minsOf(hhmm) {
  return oraInMinuti(normalizzaOraHHMM(hhmm));
}

function addMinutiAOra(hhmm, minutiDaAggiungere) {
  const base = oraInMinuti(normalizzaOraHHMM(hhmm));
  if (base == null) return "";
  const tot = (base + minutiDaAggiungere) % (24 * 60);
  const h = Math.floor(tot / 60), m = tot % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function calcFine6h15(inizio) {
  return addMinutiAOra(inizio, 6 * 60 + 15);
}
export function calcFine6h30(inizio) {
  return addMinutiAOra(inizio, 6 * 60 + 30);
}

export function calcFineModello(mod) {
  if (!mod) return "";
  if (mod.tempo === "h24") return "";
  if ((mod.tempo === "6h15" || mod.tempo === "6h 15m") && mod.inizio) return calcFine6h15(mod.inizio);
  if ((mod.tempo === "6h30" || mod.tempo === "6h 30m") && mod.inizio) return calcFine6h30(mod.inizio);
  return mod.fine || "";
}

export function minutiTurnoModello(mod) {
  if (!mod) return 0;
  if (mod.tempo === "6h15") return 375;
  if (mod.tempo === "6h30") return 390;
  const a = oraInMinuti(mod.inizio), b = oraInMinuti(calcFineModello(mod));
  if (a == null || b == null) return 0;
  return b >= a ? b - a : (24 * 60 - a) + b;
}

export function calcDurata(inizio, fine) {
  const a = oraInMinuti(inizio), b = oraInMinuti(fine);
  if (a == null || b == null) return 0;
  return b >= a ? b - a : (24 * 60 - a) + b;
}

export function sameData(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

export function fmtDataIT(dateKey) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(y, m - 1, d);
  return `${NOMI_GIORNI_IT[dt.getDay()]} ${d}/${m}/${y}`;
}

export function getContrastTextColor(hex) {
  if (!hex) return "#fff";
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (full.length !== 6) return "#fff";
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#111827" : "#ffffff";
}

// Bande orarie: dato un orario di inizio, trova la fascia automatica di
// appartenenza (per colore/etichetta di default dei modelli).
function trovaFascia(tIn, fasce) {
  const lista = fasce && fasce.length ? fasce : FASCE_AUTOMATICHE_DEFAULT;
  const m = oraInMinuti(tIn);
  if (m == null) return lista[0];
  for (const f of lista) {
    const da = oraInMinuti(f.da), a = oraInMinuti(f.a);
    if (da == null || a == null) continue;
    if (da === a) continue; // fascia "riposo" senza intervallo, salta
    if (da < a) { if (m >= da && m < a) return f; }
    else { if (m >= da || m < a) return f; } // fascia che attraversa la mezzanotte
  }
  return lista[0];
}

export function getColorByTime(tIn, fasceAutomatiche) {
  const f = trovaFascia(tIn, fasceAutomatiche);
  return f?.colore || PALETTE[0];
}
export function getColorLabel(tIn, fasceAutomatiche) {
  const f = trovaFascia(tIn, fasceAutomatiche);
  return f?.label || "";
}

// Usata per l'asse "1°/2° turno" nei report: mattina/pomeriggio ->
// "primo", notte -> "secondo". Da verificare rispetto al criterio reale.
export function categoriaTurnoAutomatica(mod) {
  if (!mod) return null;
  const m = oraInMinuti(mod.inizio);
  if (m == null) return null;
  return (m >= oraInMinuti("06:00") && m < oraInMinuti("18:00")) ? "primo" : "secondo";
}

// Usata per l'asse "app/auto" nei report: se il titolo/etichetta del
// modello contiene la parola "APP" viene classificato come "app",
// altrimenti "auto". Da verificare rispetto al criterio reale.
export function categoriaAppAutoAutomatica(mod) {
  if (!mod) return null;
  const t = `${mod.titolo || ""} ${mod.label || ""}`.toUpperCase();
  return t.includes("APP") ? "app" : "auto";
}

// Un modello conta come "turnazione standard 6h15" se la sua durata è
// esattamente 6h15 (375 minuti tra inizio e fine).
export function isModelloTurnazioneDefault(mod) {
  if (!mod || mod.tempo === "h24") return false;
  if (mod.tempo === "6h15") return true;
  return minutiTurnoModello(mod) === 375;
}

// Non risulta chiamata da nessuna parte nel codice disponibile: presente
// solo per soddisfare l'import. Ritorna la stessa cosa di getColorLabel.
export function getShiftBand(tIn, fasceAutomatiche) {
  return getColorLabel(tIn, fasceAutomatiche);
}

// Festività italiane fisse (non include la Pasqua/Pasquetta, che sono
// mobili — se ti servono aggiungile qui calcolandole per anno). Chiave
// stabile condivisa con FESTIVITA_DEFAULT_ATTIVE e resolveFestivitaCatalogo,
// così le tre restano sempre coerenti tra loro.
const FESTIVITA_FISSE = [
  { key: "capodanno",    name: "Capodanno",              m: 1,  d: 1 },
  { key: "epifania",     name: "Epifania",                m: 1,  d: 6 },
  { key: "liberazione",  name: "Festa della Liberazione", m: 4,  d: 25 },
  { key: "lavoro",       name: "Festa dei Lavoratori",    m: 5,  d: 1 },
  { key: "repubblica",   name: "Festa della Repubblica",  m: 6,  d: 2 },
  { key: "ferragosto",   name: "Ferragosto",              m: 8,  d: 15 },
  { key: "ognissanti",   name: "Ognissanti",              m: 11, d: 1 },
  { key: "immacolata",   name: "Immacolata Concezione",   m: 12, d: 8 },
  { key: "natale",       name: "Natale",                  m: 12, d: 25 },
  { key: "santostefano", name: "Santo Stefano",           m: 12, d: 26 },
];

// Restituisce le festività EFFETTIVAMENTE attive per un anno, filtrate in
// base a nationalHolsEnabled: un array di chiavi (es. quelle salvate in
// store.nationalHolsEnabled) oppure `true`/`undefined` per "tutte attive"
// (comodo per chiamate senza preferenze salvate) o `false` per "nessuna".
export function italianHols(year, nationalHolsEnabled = true) {
  if (nationalHolsEnabled === false) return [];
  const attive = Array.isArray(nationalHolsEnabled)
    ? FESTIVITA_FISSE.filter(h => nationalHolsEnabled.includes(h.key))
    : FESTIVITA_FISSE; // true / undefined / altro: tutte attive
  return attive.map(h => ({ ...h, y: year }));
}

// Catalogo delle festività nazionali disponibili, con chiave stabile e
// nome leggibile, per popolare l'elenco toggle in Impostazioni -> Festivi.
// A differenza di italianHols() (che restituisce solo le date attive per
// un anno) questo elenca SEMPRE tutte le festività note, attive o meno.
export function resolveFestivitaCatalogo(year) {
  return FESTIVITA_FISSE.map(f => ({ ...f, y: year }));
}

// nationalHolsEnabled: come in italianHols (true/undefined = tutte attive,
// false = nessuna, array = solo le chiavi elencate). extraHols: array di
// festivi locali definiti dall'utente in Impostazioni -> Festivi Locali,
// nello stesso formato salvato da store.extraHols ({name, d, m}, con m
// 1-based come inserito dall'utente, es. 9 per settembre — NON va
// convertito a 0-based, altrimenti il confronto con il mese del dateKey
// (anch'esso 1-based) fallisce sempre).
export function isFestivo(dateKey, nationalHolsEnabled = true, extraHols = []) {
  if (!dateKey) return false;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0) return true; // domenica
  const nazionaliAttive = nationalHolsEnabled === false
    ? []
    : Array.isArray(nationalHolsEnabled)
      ? FESTIVITA_FISSE.filter(h => nationalHolsEnabled.includes(h.key))
      : FESTIVITA_FISSE;
  if (nazionaliAttive.some(h => h.m === m && h.d === d)) return true;
  return (extraHols || []).some(h => +h.m === m && +h.d === d);
}


// ─────────────────────────────────────────────────────────────────────
// LOCALSTORAGE — cache locale (calendari/eventi/modelli/impostazioni)
// ─────────────────────────────────────────────────────────────────────

const LS_CACHE_KEY = "turnipm_cache_v1";

export function saveToLocalStorage(events, calendars, modelli, calId, extra = {}) {
  try {
    const payload = { events, calendars, modelli, calId, ...extra, _savedAt: Date.now() };
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    // Storage pieno o non disponibile: non blocchiamo l'app per questo.
    console.warn("saveToLocalStorage fallito:", e);
  }
}

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Svuota solo la cache locale dei dati app (eventi/calendari/modelli),
// usata prima di forzare un ricaricamento completo dal server. Non tocca
// log errori, coda sync o altre chiavi: quelle restano gestite dalle loro
// funzioni dedicate.
export function clearLocalStorageCache() {
  try {
    localStorage.removeItem(LS_CACHE_KEY);
  } catch (e) {
    console.warn("clearLocalStorageCache fallito:", e);
  }
}


// ─────────────────────────────────────────────────────────────────────
// ERRORI — coda per il modale, log persistente, silenziamento per
// contesto, listener registrabile dal componente principale.
// ─────────────────────────────────────────────────────────────────────

const LS_LOG_ERRORI_KEY = "turnipm_log_errori_v1";
const LS_ERRORI_SILENZIATI_KEY = "turnipm_errori_silenziati_v1";
const LS_CODA_SYNC_KEY = "turnipm_coda_sync_v1";

let _listenerCodaErrori = null;

export function registraListenerCodaErrori(cb) {
  _listenerCodaErrori = cb || null;
}

function scriviLogErrori(voce) {
  try {
    const log = leggiLogErrori();
    log.push(voce);
    // Tiene solo le ultime 200 voci per non far crescere localStorage indefinitamente.
    const tagliato = log.slice(-200);
    localStorage.setItem(LS_LOG_ERRORI_KEY, JSON.stringify(tagliato));
  } catch (e) {
    console.warn("scriviLogErrori fallito:", e);
  }
}

export function leggiLogErrori() {
  try {
    const raw = localStorage.getItem(LS_LOG_ERRORI_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function cancellaLogErrori() {
  try {
    localStorage.removeItem(LS_LOG_ERRORI_KEY);
  } catch (e) {
    console.warn("cancellaLogErrori fallito:", e);
  }
}

export function leggiErroriSilenziati() {
  try {
    const raw = localStorage.getItem(LS_ERRORI_SILENZIATI_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function impostaSilenziamentoErrore(contesto, silenziato) {
  try {
    const attuali = leggiErroriSilenziati();
    const senza = attuali.filter(c => c !== contesto);
    const nuovi = silenziato ? [...senza, contesto] : senza;
    localStorage.setItem(LS_ERRORI_SILENZIATI_KEY, JSON.stringify(nuovi));
  } catch (e) {
    console.warn("impostaSilenziamentoErrore fallito:", e);
  }
}

// segnala un errore: lo scrive sempre nel Log persistente, e — se il
// contesto non è stato silenziato dall'utente — lo accoda anche per il
// modale a schermo tramite il listener registrato dal componente App.
export function segnalaErrore(error, contesto) {
  const voce = {
    id: generaIdLocale(),
    ts: new Date().toISOString(),
    contesto,
    message: error?.message || String(error || "Errore sconosciuto"),
  };
  scriviLogErrori(voce);
  const silenziati = leggiErroriSilenziati();
  if (!silenziati.includes(contesto) && _listenerCodaErrori) {
    _listenerCodaErrori(voce);
  }
  console.error(`[${contesto}]`, error);
}

// Come segnalaErrore, ma non apre mai il modale — solo Log. Usata nei
// cicli dove serve un riepilogo unico invece di N popup.
export function segnalaErroreSoloLog(error, contesto) {
  const voce = {
    id: generaIdLocale(),
    ts: new Date().toISOString(),
    contesto,
    message: error?.message || String(error || "Errore sconosciuto"),
  };
  scriviLogErrori(voce);
  console.error(`[${contesto}] (solo log)`, error);
}

// Problemi rilevati durante un import (righe mancanti/sospette): salvati
// nel Log come voci dedicate, consultabili in Impostazioni -> Log.
export function registraProblemiImport(mancanti = [], sospetti = []) {
  if ((mancanti?.length || 0) === 0 && (sospetti?.length || 0) === 0) return;
  scriviLogErrori({
    id: generaIdLocale(),
    ts: new Date().toISOString(),
    contesto: "Import",
    message: `Import completato con avvisi: ${mancanti.length} mancanti, ${sospetti.length} sospetti.`,
    mancanti, sospetti,
  });
}

// Registro import problematici: elenco delle sessioni di import che hanno
// generato avvisi (righe mancanti/sospette), consultabile e cancellabile
// dall'utente in Impostazioni -> Log import.
const LS_REGISTRO_IMPORT_KEY = "turnipm_registro_import_v1";

export function leggiRegistroImportProblemi() {
  try {
    const raw = localStorage.getItem(LS_REGISTRO_IMPORT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function cancellaRegistroImportProblemi() {
  try {
    localStorage.removeItem(LS_REGISTRO_IMPORT_KEY);
  } catch (e) {
    console.warn("cancellaRegistroImportProblemi fallito:", e);
  }
}

function scriviRegistroImportProblemi(voce) {
  try {
    const registro = leggiRegistroImportProblemi();
    registro.unshift(voce);
    localStorage.setItem(LS_REGISTRO_IMPORT_KEY, JSON.stringify(registro.slice(0, 50)));
  } catch (e) {
    console.warn("scriviRegistroImportProblemi fallito:", e);
  }
}

// Ripulisce testo grezzo (spesso output di OCR/AI esterno, es. screenshot
// di un turnario incollato) prima di passarlo a JSON.parse: rimuove i fence
// markdown ```json ... ``` (o ``` ... ```) se presenti, e taglia via
// eventuale testo prima della prima { o [ e dopo l'ultima } o ] --
// artefatti tipici di OCR/AI che aggiungono frasi introduttive o note
// finali attorno al JSON vero e proprio.
export function estraiJsonDaTesto(testo) {
  let t = String(testo || "").trim();

  // Rimuove fence markdown tipo ```json ... ``` o ``` ... ```
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    t = fenceMatch[1].trim();
  }

  // Trova il primo carattere di apertura ({ o [) e l'ultimo di chiusura
  // corrispondente, per scartare testo estraneo prima/dopo.
  const primaGraffa = t.indexOf("{");
  const primaQuadra = t.indexOf("[");
  let inizio = -1;
  if (primaGraffa === -1) inizio = primaQuadra;
  else if (primaQuadra === -1) inizio = primaGraffa;
  else inizio = Math.min(primaGraffa, primaQuadra);

  if (inizio > 0) {
    const ultimaGraffa = t.lastIndexOf("}");
    const ultimaQuadra = t.lastIndexOf("]");
    const fine = Math.max(ultimaGraffa, ultimaQuadra);
    if (fine > inizio) {
      t = t.slice(inizio, fine + 1);
    }
  }

  return t.trim();
}

// Prova a interpretare testo "a blocchi" (non JSON) tipo export turnario
// incollato a mano: righe del tipo "NomeGiorno GG/MM/AAAA" seguite da righe
// "Campo: valore" (es. "Turno: 06:00-14:00"), fino alla riga vuota o al
// prossimo blocco data. Restituisce un array di righe nello stesso formato
// "canonico" prodotto da normalizzaRigheImportGrezzo (data, titolo,
// oraInizio, oraFine, auto, collega, note), oppure [] se non riconosce
// nessun blocco.
export function normalizzaTestoGrezzoTurni(testo) {
  const righe = String(testo || "").split(/\r?\n/);
  const risultato = [];
  const regexData = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;

  let corrente = null;

  for (const rigaGrezza of righe) {
    const riga = rigaGrezza.trim();
    if (!riga) continue;

    const matchData = riga.match(regexData);
    if (matchData) {
      if (corrente && (corrente.titolo || corrente.oraInizio)) {
        risultato.push(corrente);
      }
      let [, gg, mm, aaaa] = matchData;
      if (aaaa.length === 2) aaaa = "20" + aaaa;
      const data = `${aaaa}-${mm.padStart(2, "0")}-${gg.padStart(2, "0")}`;
      corrente = { data, titolo: "", oraInizio: "", oraFine: "", auto: "", collega: "", note: "" };
      continue;
    }

    if (!corrente) continue;

    const matchCampo = riga.match(/^([A-Za-zÀ-ú]+)\s*[:\-]\s*(.+)$/);
    if (matchCampo) {
      const chiave = matchCampo[1].toLowerCase();
      const valore = matchCampo[2].trim();
      if (chiave.includes("turno") || chiave.includes("titolo")) corrente.titolo = valore;
      else if (chiave.includes("inizio")) corrente.oraInizio = valore;
      else if (chiave.includes("fine")) corrente.oraFine = valore;
      else if (chiave.includes("auto")) corrente.auto = valore;
      else if (chiave.includes("collega")) corrente.collega = valore;
      else if (chiave.includes("nota")) corrente.note = valore;
      else corrente.note = corrente.note ? `${corrente.note} ${valore}` : valore;
    } else if (!corrente.titolo) {
      corrente.titolo = riga;
    } else {
      corrente.note = corrente.note ? `${corrente.note} ${riga}` : riga;
    }
  }
  if (corrente && (corrente.titolo || corrente.oraInizio)) {
    risultato.push(corrente);
  }

  return risultato;
}

// Normalizza un JSON "grezzo" (parsato ma di forma libera, spesso output
// di un OCR/AI esterno) nel formato canonico [{data, titolo, oraInizio,
// oraFine, auto, collega, note}]. Gestisce le varianti più comuni:
// - array piatto già nel formato giusto (o quasi)
// - oggetto singolo invece di array (un solo giorno)
// - annidato sotto una chiave contenitore (es. { turni: [...] }, { giorni: [...] })
// - "giorno" numerico invece di "data" completa (richiede year/month)
// - "orario" come intervallo unico "HH:MM-HH:MM" invece di oraInizio/oraFine separati
export function normalizzaRigheImportGrezzo(parsed, year, month) {
  if (parsed == null) return [];

  // Se è annidato sotto una chiave contenitore comune, scendi di un livello.
  if (!Array.isArray(parsed) && typeof parsed === "object") {
    const chiaviContenitore = ["turni", "giorni", "data", "items", "results", "eventi"];
    const chiaveTrovata = chiaviContenitore.find(
      (k) => Array.isArray(parsed[k])
    );
    if (chiaveTrovata) {
      parsed = parsed[chiaveTrovata];
    } else {
      // Oggetto singolo: trattalo come array di un elemento.
      parsed = [parsed];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const risultato = [];
  for (const voceGrezza of parsed) {
    if (!voceGrezza || typeof voceGrezza !== "object") continue;

    let data = voceGrezza.data || voceGrezza.date || "";
    // "giorno" numerico invece di data completa: ricostruiscila da year/month.
    if (!data && (voceGrezza.giorno != null || voceGrezza.day != null)) {
      const gg = Number(voceGrezza.giorno ?? voceGrezza.day);
      if (Number.isFinite(gg) && gg > 0 && year && month) {
        data = `${year}-${String(month).padStart(2, "0")}-${String(gg).padStart(2, "0")}`;
      }
    }
    if (!data) continue;

    let oraInizio = voceGrezza.oraInizio || voceGrezza.inizio || voceGrezza.start || "";
    let oraFine = voceGrezza.oraFine || voceGrezza.fine || voceGrezza.end || "";
    // "orario" come intervallo unico "HH:MM-HH:MM" da spezzare.
    if (!oraInizio && !oraFine && voceGrezza.orario) {
      const matchOrario = String(voceGrezza.orario).match(/(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})/);
      if (matchOrario) {
        oraInizio = matchOrario[1].replace(".", ":");
        oraFine = matchOrario[2].replace(".", ":");
      }
    }

    risultato.push({
      data,
      titolo: voceGrezza.titolo || voceGrezza.title || voceGrezza.turno || "",
      oraInizio,
      oraFine,
      auto: voceGrezza.auto || "",
      collega: voceGrezza.collega || voceGrezza.collegaCon || "",
      note: voceGrezza.note || voceGrezza.notes || "",
    });
  }

  return risultato;
}


// Coda di sincronizzazione offline: operazioni (insert/update/delete) da
// riprovare quando torna la connessione.
export function leggiCodaSync() {
  try {
    const raw = localStorage.getItem(LS_CODA_SYNC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function scriviCodaSync(coda) {
  try {
    localStorage.setItem(LS_CODA_SYNC_KEY, JSON.stringify(coda || []));
  } catch (e) {
    console.warn("scriviCodaSync fallito:", e);
  }
}


// ─────────────────────────────────────────────────────────────────────
// MUTAZIONI IMMUTABILI DELLO STORE EVENTI — store.events[dateKey][calId]
// = [array di eventi, ognuno con .id]. Scritte nel modo più conservativo
// possibile: nuovi oggetti/array ad ogni livello toccato, il resto dello
// store (calendars, theme, fasceAutomatiche, ecc.) resta lo stesso
// riferimento, non viene mai clonato o alterato.
// ─────────────────────────────────────────────────────────────────────

export function withEventoAggiunto(store, dateKey, calId, evento) {
  const eventiEsistentiGiorno = store.events?.[dateKey] || {};
  const eventiEsistentiCal = eventiEsistentiGiorno[calId] || [];
  return {
    ...store,
    events: {
      ...store.events,
      [dateKey]: {
        ...eventiEsistentiGiorno,
        [calId]: [...eventiEsistentiCal, evento],
      },
    },
  };
}

export function withEventoAggiornato(store, dateKey, calId, eventId, patch) {
  const eventiEsistentiGiorno = store.events?.[dateKey] || {};
  const eventiEsistentiCal = eventiEsistentiGiorno[calId] || [];
  const nuoviEventi = eventiEsistentiCal.map(ev => (ev.id === eventId ? { ...ev, ...patch } : ev));
  return {
    ...store,
    events: {
      ...store.events,
      [dateKey]: {
        ...eventiEsistentiGiorno,
        [calId]: nuoviEventi,
      },
    },
  };
}

export function withEventoRimosso(store, dateKey, calId, eventId) {
  const eventiEsistentiGiorno = store.events?.[dateKey] || {};
  const eventiEsistentiCal = eventiEsistentiGiorno[calId] || [];
  const nuoviEventi = eventiEsistentiCal.filter(ev => ev.id !== eventId);
  return {
    ...store,
    events: {
      ...store.events,
      [dateKey]: {
        ...eventiEsistentiGiorno,
        [calId]: nuoviEventi,
      },
    },
  };
}


// ─────────────────────────────────────────────────────────────────────
// ModelloSelector — dropdown/lista compatta per scegliere un modello
// esistente (usato da RotazioneForm, ReperibilitaFormFields, GrigliaRotazione).
// ─────────────────────────────────────────────────────────────────────

export function ModelloSelector({ T, modelli = [], value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <button type="button" onClick={() => onChange(null)}
        style={{
          padding: "6px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
          border: `1.5px solid ${!value ? "#ef4444" : T.border}`,
          background: !value ? "#ef4444" : T.s2, color: !value ? "#fff" : T.text,
        }}>
        ✕ Nessuno
      </button>
      {modelli.map(m => {
        const attivo = value === m.id;
        return (
          <button key={m.id} type="button" onClick={() => onChange(m.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20,
              border: `1.5px solid ${attivo ? (m.coloreCustom || "#2563eb") : T.border}`,
              background: attivo ? (m.coloreCustom || "#2563eb") : T.s2,
              color: attivo ? getContrastTextColor(m.coloreCustom || "#2563eb") : T.text,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.coloreCustom || "#2563eb" }} />
            {m.titolo}
          </button>
        );
      })}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// ModelForm — form di creazione/modifica di un "modello turno".
// NOTA: non include la sezione "conteggio per report" (getConteggioConfig
// / updateConteggioConfig) — vedi avviso in cima al file.
// ─────────────────────────────────────────────────────────────────────

const TEMPI_MODELLO = [
  { key: "6h15", label: "6h 15m" },
  { key: "6h30", label: "6h 30m" },
  { key: "h24", label: "Tutto il giorno (H24)" },
  { key: "personalizzato", label: "Orario personalizzato" },
];

export function ModelForm({
  T, form, setForm, accent, dark, fasceAutomatiche, modelli,
  suggerimentiTitolo = [], suggerimentiNomeVis = [], onRimuoviSuggerimento,
  onSave,
}) {
  const [mostraSuggTitolo, setMostraSuggTitolo] = useState(false);
  const accentText = getContrastTextColor(accent);
  const coloreAnteprima = form.coloreCustom || (form.tempo === "h24" ? COLORE_H24 : getColorByTime(form.inizio, fasceAutomatiche));

  function campo(label, node) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>{label}</div>
        {node}
      </div>
    );
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box", background: T.s2, border: `1px solid ${T.border}`,
    borderRadius: 8, padding: "10px 12px", color: T.text, fontSize: 14,
  };

  return (
    <div style={{ padding: 16 }}>
      {campo("TITOLO", (
        <div style={{ position: "relative" }}>
          <input value={form.titolo || ""} placeholder="es. MATTINA"
            onFocus={() => setMostraSuggTitolo(true)}
            onBlur={() => setTimeout(() => setMostraSuggTitolo(false), 150)}
            onChange={e => setForm(prev => ({ ...prev, titolo: e.target.value }))}
            style={inputStyle} />
          {mostraSuggTitolo && suggerimentiTitolo.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
              marginTop: 4, maxHeight: 160, overflowY: "auto",
            }}>
              {suggerimentiTitolo.filter(s => !form.titolo || s.toUpperCase().includes(form.titolo.toUpperCase())).map(s => (
                <div key={s} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", cursor: "pointer", fontSize: 13, color: T.text,
                }}
                  onMouseDown={() => setForm(prev => ({ ...prev, titolo: s }))}>
                  <span>{s}</span>
                  {onRimuoviSuggerimento && (
                    <span onMouseDown={e => { e.stopPropagation(); onRimuoviSuggerimento("titolo", s); }}
                      style={{ color: T.sub, padding: "0 4px" }}>✕</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {campo("NOME VISUALIZZATO (opzionale)", (
        <input value={form.label || ""} placeholder="es. M"
          list="suggerimenti-nome-vis"
          onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
          style={inputStyle} />
      ))}
      {suggerimentiNomeVis.length > 0 && (
        <datalist id="suggerimenti-nome-vis">
          {suggerimentiNomeVis.map(s => <option key={s} value={s} />)}
        </datalist>
      )}

      {campo("DURATA", (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {TEMPI_MODELLO.map(t => (
            <button key={t.key} type="button" onClick={() => setForm(prev => ({ ...prev, tempo: t.key }))}
              style={{
                ...NB, background: form.tempo === t.key ? accent : T.s2,
                color: form.tempo === t.key ? accentText : T.text,
                border: `1px solid ${form.tempo === t.key ? accent : T.border}`,
              }}>
              {t.label}
            </button>
          ))}
        </div>
      ))}

      {form.tempo !== "h24" && campo("ORARIO DI INIZIO", (
        <input type="time" value={form.inizio || ""} onChange={e => setForm(prev => ({ ...prev, inizio: e.target.value }))}
          style={inputStyle} />
      ))}

      {form.tempo === "personalizzato" && campo("ORARIO DI FINE", (
        <input type="time" value={form.fine || ""} onChange={e => setForm(prev => ({ ...prev, fine: e.target.value }))}
          style={inputStyle} />
      ))}

      {(form.tempo === "6h15" || form.tempo === "6h30") && form.inizio && (
        <div style={{ fontSize: 12, color: T.sub, marginTop: -8, marginBottom: 14 }}>
          Fine calcolata automaticamente: {calcFineModello(form)}
        </div>
      )}

      {campo("COLORE", (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {PALETTE.map(c => (
              <div key={c} onClick={() => setForm(prev => ({ ...prev, coloreCustom: c }))}
                style={{
                  width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                  border: form.coloreCustom === c ? `2px solid ${T.text}` : "2px solid transparent",
                }} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: coloreAnteprima, border: `1px solid ${T.border}` }} />
            <button type="button" onClick={() => setForm(prev => ({ ...prev, coloreCustom: null }))}
              style={{ ...NB, background: T.s2, color: T.text, border: `1px solid ${T.border}`, fontSize: 12, padding: "6px 10px" }}>
              Usa colore automatico (fascia oraria)
            </button>
          </div>
        </div>
      ))}

      {campo("CATEGORIA TURNO (per i report — opzionale)", (
        <div style={{ display: "flex", gap: 6 }}>
          {[["primo", "1° turno"], ["secondo", "2° turno"], [null, "Automatico"]].map(([val, lab]) => (
            <button key={lab} type="button" onClick={() => setForm(prev => ({ ...prev, categoria: val }))}
              style={{
                ...NB, flex: 1, fontSize: 12, background: (form.categoria || null) === val ? accent : T.s2,
                color: (form.categoria || null) === val ? accentText : T.text,
                border: `1px solid ${(form.categoria || null) === val ? accent : T.border}`,
              }}>
              {lab}
            </button>
          ))}
        </div>
      ))}

      <button onClick={onSave}
        style={{ width: "100%", background: accent, color: accentText, border: "none", borderRadius: 10,
          padding: "13px 0", fontWeight: 800, fontSize: 14, cursor: "pointer", marginTop: 6 }}>
        💾 Salva modello
      </button>
    </div>
  );
}

// Card di riepilogo di un modello, per le liste (02-Modelli.jsx).
export function ModelloCard({ T, modello, accent, onEdit, onDelete }) {
  const colore = modello.coloreCustom || COLORE_H24;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: colore, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {modello.titolo}
          </div>
          <div style={{ fontSize: 11, color: T.sub }}>
            {modello.tempo === "h24" ? "Tutto il giorno" : `${modello.inizio || "—"} – ${calcFineModello(modello) || modello.fine || "—"}`}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {onEdit && <button onClick={() => onEdit(modello)} style={{ ...NB, background: "none", color: accent, padding: 4 }}>✎</button>}
        {onDelete && <button onClick={() => onDelete(modello)} style={{ ...NB, background: "none", color: "#ef4444", padding: 4 }}>🗑</button>}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// RotazioneCard — riepilogo di una rotazione nell'elenco.
// ─────────────────────────────────────────────────────────────────────

export function RotazioneCard({ T, rot, accent, onOpen, onDelete }) {
  const tipoLabel = rot.tipo === "domeniche" ? "🗓 Domeniche 1/4"
    : rot.tipo === "reperibilita" ? "📞 Reperibilità"
    : rot.tipo === "nlrs_scalante" ? "📅 RS/NL Scalante"
    : "🗓️ Personalizzata";
  return (
    <div onClick={() => onOpen && onOpen(rot)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px",
      marginBottom: 8, cursor: onOpen ? "pointer" : "default",
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{rot.titolo || "Senza nome"}</div>
        <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{tipoLabel}</div>
      </div>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(rot); }}
          style={{ ...NB, background: "none", color: "#ef4444", padding: 4 }}>🗑</button>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// NLRSScalanteView — vista dettaglio per il tipo "nlrs_scalante"
// (RS venerdì -> NL+7gg, poi giovedì, mercoledì... salta domenica).
// La logica di calcolo/inserimento resta in applyRotazione (06-Logica.jsx,
// invariata); qui si mostra solo un riepilogo dei modelli assegnati.
// ─────────────────────────────────────────────────────────────────────

// NLRSView — vista dettaglio per il tipo "nlrs" (RS/NL fisso, senza scalo
// di giorno ad ogni quartina). Mostra solo i due modelli associati; a
// differenza di NLRSScalanteView non c'è una sequenza di giorni da
// visualizzare perché il giorno di RS/NL resta lo stesso ogni settimana.
export function NLRSView({ rot, T, accent, modelli }) {
  const modRS = modelli.find(m => m.id === rot.modelloRSId);
  const modNL = modelli.find(m => m.id === rot.modelloNLId);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>MODELLO RS</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modRS?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modRS?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>MODELLO NL</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modNL?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modNL?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.sub, marginTop: 10 }}>
        RS e NL sono fissi: stesso giorno della settimana ad ogni ciclo, senza scalo.
      </div>
    </div>
  );
}

export function NLRSScalanteView({ rot, T, accent, modelli }) {
  const modRS = modelli.find(m => m.id === rot.modelloRSId);
  const modNL = modelli.find(m => m.id === rot.modelloNLId);
  const SEQ_LABEL = ["Ven", "Gio", "Mer", "Mar", "Lun", "Sab"];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>MODELLO RS</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modRS?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modRS?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>MODELLO NL</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modNL?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modNL?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 8 }}>
        SEQUENZA DI SCALO (un giorno diverso ogni quartina)
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SEQ_LABEL.map((g, i) => (
          <div key={g} style={{
            padding: "6px 10px", borderRadius: 8, background: T.s2, border: `1px solid ${T.border}`,
            fontSize: 12, fontWeight: 700, color: T.text,
          }}>
            {i + 1}. {g}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.sub, marginTop: 10 }}>
        La data effettiva di partenza è agganciata alle quartine (Domeniche 1/4) già presenti a calendario.
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// DomenicheView — vista dettaglio per il tipo "domeniche" (1 domenica
// lavoro ogni 4 settimane).
// ─────────────────────────────────────────────────────────────────────

export function DomenicheView({ rot, T, accent, modelli, fasceAutomatiche, sundayColor, onUpdate }) {
  const modLav = modelli.find(m => m.id === rot.modellaLavoroId);
  const modRip = modelli.find(m => m.id === rot.modelloNLId);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>DOMENICA LAVORO</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modLav?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modLav?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>DOMENICHE RIPOSO</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modRip?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modRip?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.sub }}>
        1 domenica di lavoro ogni 4 settimane, a partire dalla data di applicazione della rotazione.
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// PARTE REPERIBILITÀ — turno 14:00-24:00 e turno 00:00-14:00 a scalare
// ogni 8 giorni. (invariato rispetto alla patch già validata)
// ─────────────────────────────────────────────────────────────────────

const GIORNI_SETTIMANA_FORM = [
  { key: 1, label: "Lun" }, { key: 2, label: "Mar" }, { key: 3, label: "Mer" },
  { key: 4, label: "Gio" }, { key: 5, label: "Ven" }, { key: 6, label: "Sab" },
  { key: 0, label: "Dom" },
];

export function ReperibilitaFormFields({ T, form, setForm, accent, accentText, modelli }) {
  const giornoPartenza = form.reperibilitaGiornoPartenza ?? 1;
  const turnoPartenza = form.reperibilitaTurnoPartenza || "14-24";

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        GIORNO DI PARTENZA
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {GIORNI_SETTIMANA_FORM.map(g => (
          <button key={g.key} type="button"
            onClick={() => setForm(prev => ({ ...prev, reperibilitaGiornoPartenza: g.key }))}
            style={{
              background: giornoPartenza === g.key ? accent : T.s2,
              color: giornoPartenza === g.key ? accentText : T.text,
              border: `1px solid ${giornoPartenza === g.key ? accent : T.border}`,
              borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer"
            }}>
            {g.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        TURNO DI PARTENZA (nel giorno scelto sopra)
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setForm(prev => ({ ...prev, reperibilitaTurnoPartenza: "14-24" }))}
          style={{
            flex: 1, background: turnoPartenza === "14-24" ? accent : T.s2,
            color: turnoPartenza === "14-24" ? accentText : T.text,
            border: `1px solid ${turnoPartenza === "14-24" ? accent : T.border}`,
            borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}>
          14:00 – 24:00
        </button>
        <button type="button" onClick={() => setForm(prev => ({ ...prev, reperibilitaTurnoPartenza: "00-14" }))}
          style={{
            flex: 1, background: turnoPartenza === "00-14" ? accent : T.s2,
            color: turnoPartenza === "00-14" ? accentText : T.text,
            border: `1px solid ${turnoPartenza === "00-14" ? accent : T.border}`,
            borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}>
          00:00 – 14:00
        </button>
      </div>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 14 }}>
        Il giorno successivo prende automaticamente l'altro turno.
        Ogni blocco (2 giorni) si ripete ogni 8 giorni, avanzando di un
        giorno della settimana ad ogni ripetizione.
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        MODELLO PER 14:00–24:00
      </div>
      <ModelloSelector T={T} modelli={modelli} value={form.modelloRSId}
        onChange={id => setForm(prev => ({ ...prev, modelloRSId: id }))} />

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, margin: "10px 0 6px" }}>
        MODELLO PER 00:00–14:00
      </div>
      <ModelloSelector T={T} modelli={modelli} value={form.modelloNLId}
        onChange={id => setForm(prev => ({ ...prev, modelloNLId: id }))} />
    </div>
  );
}

export function calcolaAnteprimaReperibilita(rot, nBlocchi = 12) {
  if (!rot?.dataInizio) return [];
  const [y0, m0, d0] = rot.dataInizio.split("-").map(Number);
  const start = new Date(y0, m0 - 1, d0);
  const turnoA = rot.reperibilitaTurnoPartenza === "00-14" ? "00:00-14:00" : "14:00-24:00";
  const turnoB = turnoA === "14:00-24:00" ? "00:00-14:00" : "14:00-24:00";

  const righe = [];
  for (let i = 0; i < nBlocchi; i++) {
    const giorno1 = new Date(start);
    giorno1.setDate(giorno1.getDate() + i * 8);
    const giorno2 = new Date(giorno1);
    giorno2.setDate(giorno2.getDate() + 1);

    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    righe.push({ data: fmt(giorno1), turno: turnoA });
    righe.push({ data: fmt(giorno2), turno: turnoB });
  }
  return righe;
}

export function ReperibilitaView({ rot, T, accent, modelli }) {
  const modA = modelli.find(m => m.id === rot.modelloRSId);
  const modB = modelli.find(m => m.id === rot.modelloNLId);
  const anteprima = calcolaAnteprimaReperibilita(rot, 12);

  const NOMI_GIORNI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>TURNO 14:00–24:00</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modA?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modA?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>TURNO 00:00–14:00</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modB?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modB?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 8 }}>
        ANTEPRIMA (prossimi {anteprima.length} giorni di turno)
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        {anteprima.map((r, i) => {
          const [ry, rm, rd] = r.data.split("-").map(Number);
          const giornoSett = NOMI_GIORNI[new Date(ry, rm - 1, rd).getDay()];
          const mod = r.turno === "14:00-24:00" ? modA : modB;
          return (
            <div key={r.data + r.turno} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 14px", borderBottom: i < anteprima.length - 1 ? `1px solid ${T.border}` : "none"
            }}>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
                {giornoSett} {rd}/{rm}/{ry}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: mod?.coloreCustom || accent }} />
                <div style={{ fontSize: 12, color: T.sub }}>{r.turno}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// GRIGLIA PERSONALIZZATA — 7 (giorni) x 52 (settimane), a scelta di
// modello da lista. (invariato rispetto alla patch già validata)
// ─────────────────────────────────────────────────────────────────────

const NOMI_GIORNI_GRIGLIA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function lunediDellaSettimana(dataStr) {
  const [y, m, d] = dataStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const giorno = dt.getDay();
  const offset = giorno === 0 ? -6 : 1 - giorno;
  dt.setDate(dt.getDate() + offset);
  return dt;
}

function fmtDateKey(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function costruisciMatriceGriglia(rot) {
  const baseStr = rot?.dataInizio || fmtDateKey(new Date());
  const lunedi0 = lunediDellaSettimana(baseStr);
  const colonne = [];
  for (let w = 0; w < 52; w++) {
    const riga = [];
    for (let g = 0; g < 7; g++) {
      const dt = new Date(lunedi0);
      dt.setDate(dt.getDate() + w * 7 + g);
      riga.push(fmtDateKey(dt));
    }
    colonne.push(riga);
  }
  return colonne;
}

export function GrigliaRotazione({ rot, T, accent, modelli, fasceAutomatiche, sundayColor, onUpdate }) {
  const [pallinoAttivo, setPallinoAttivo] = useState(null);
  const [modelloSelezionato, setModelloSelezionato] = useState(null);

  const matrice = useMemo(() => costruisciMatriceGriglia(rot), [rot?.dataInizio]);
  const griglia = rot.griglia || {};

  function coloreDiData(dateKey) {
    const modId = griglia[dateKey];
    if (!modId) return null;
    const mod = modelli.find(m => m.id === modId);
    if (!mod) return accent;
    return mod.coloreCustom || (mod.tempo === "h24" ? COLORE_H24 : getColorByTime(mod.inizio, fasceAutomatiche));
  }

  function clickPallino(dateKey) {
    if (modelloSelezionato !== null) {
      const nuova = { ...griglia };
      if (modelloSelezionato === "__clear__") delete nuova[dateKey];
      else nuova[dateKey] = modelloSelezionato;
      onUpdate(nuova);
      return;
    }
    setPallinoAttivo(dateKey);
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "6px 8px 60px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 4 }}>
        SELEZIONA UN MODELLO, POI TOCCA I PALLINI DELLA GRIGLIA
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <button onClick={() => setModelloSelezionato(m => m === "__clear__" ? null : "__clear__")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20,
            border: `1.5px solid ${modelloSelezionato === "__clear__" ? "#ef4444" : T.border}`,
            background: modelloSelezionato === "__clear__" ? "#ef4444" : T.s2,
            color: modelloSelezionato === "__clear__" ? "#fff" : T.text,
            fontSize: 12, fontWeight: 700, cursor: "pointer"
          }}>
          ✕ Vuoto
        </button>
        {modelli.map(m => {
          const attivo = modelloSelezionato === m.id;
          const colM = m.coloreCustom || (m.tempo === "h24" ? COLORE_H24 : getColorByTime(m.inizio, fasceAutomatiche));
          return (
            <button key={m.id} onClick={() => setModelloSelezionato(cur => cur === m.id ? null : m.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20,
                border: `1.5px solid ${attivo ? colM : T.border}`,
                background: attivo ? colM : T.s2,
                color: attivo ? getContrastTextColor(colM) : T.text,
                fontSize: 12, fontWeight: 700, cursor: "pointer"
              }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: colM }} />
              {m.titolo}
            </button>
          );
        })}
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 10, background: "#ffffff" }}>
        <div style={{ display: "block", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              width: 30, flexShrink: 0, fontSize: 10, fontWeight: 700, color: "#0f172a",
              textAlign: "right", paddingRight: 6, position: "sticky", left: 0, background: "#ffffff"
            }} />
            {NOMI_GIORNI_GRIGLIA.map(nomeGiorno => (
              <div key={nomeGiorno} style={{
                flex: 1, minWidth: 0, fontSize: 10, fontWeight: 700, color: "#0f172a", textAlign: "center"
              }}>
                {nomeGiorno}
              </div>
            ))}
          </div>
          {matrice.map((settimana, w) => (
            <div key={w} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: 30, flexShrink: 0, fontSize: 9, fontWeight: 700, color: "#0f172a",
                textAlign: "right", paddingRight: 6, position: "sticky", left: 0, background: "#ffffff"
              }}>
                {w + 1}
              </div>
              {settimana.map((dateKey, g) => {
                const colore = coloreDiData(dateKey);
                return (
                  <div key={dateKey} title={dateKey} onClick={() => clickPallino(dateKey)}
                    style={{
                      flex: 1, minWidth: 0, height: 22, margin: 2, borderRadius: 11, flexShrink: 0,
                      background: colore || "#ffffff",
                      border: "1.5px solid #000000",
                      cursor: "pointer", boxSizing: "border-box"
                    }} />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {pallinoAttivo && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 700,
          display: "flex", alignItems: "flex-end"
        }} onClick={() => setPallinoAttivo(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", background: T.surface, borderRadius: "16px 16px 0 0", padding: 16, maxHeight: "70vh", overflowY: "auto"
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 12 }}>
              {pallinoAttivo}
            </div>
            <ModelloSelector T={T} modelli={modelli} value={griglia[pallinoAttivo] || null}
              onChange={id => {
                const nuova = { ...griglia };
                if (id) nuova[pallinoAttivo] = id; else delete nuova[pallinoAttivo];
                onUpdate(nuova);
                setPallinoAttivo(null);
              }} />
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// RotazioneForm — form "Nuova rotazione" (i 4 bottoni tipo). NL/RS
// classico rimosso, Reperibilità aggiunta al suo posto.
// ─────────────────────────────────────────────────────────────────────

export function RotazioneForm({ T, form, setForm, accent, modelli, sortedModelli, onSave }) {
  const accentText = getContrastTextColor(accent);
  const listaModelli = sortedModelli || modelli || [];

  const TIPI = [
    { key: "personalizzata", label: "🗓️ Personalizzata" },
    { key: "domeniche",      label: "📅 Domeniche 1/4" },
    { key: "reperibilita",   label: "📞 Reperibilità" },
    { key: "nlrs_scalante",  label: "📆 RS/NL scalante" },
  ];

  function setTipo(tipo) {
    setForm(prev => ({ ...prev, tipo }));
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 8 }}>
        TIPO DI ROTAZIONE
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {TIPI.map(t => (
          <button key={t.key} type="button" onClick={() => setTipo(t.key)}
            style={{
              background: form.tipo === t.key ? accent : T.s2,
              color: form.tipo === t.key ? accentText : T.text,
              border: `1px solid ${form.tipo === t.key ? accent : T.border}`,
              borderRadius: 10, padding: "12px 10px", fontWeight: 700, fontSize: 13,
              cursor: "pointer", textAlign: "left"
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        TITOLO ROTAZIONE
      </div>
      <input value={form.titolo || ""} onChange={e => setForm(prev => ({ ...prev, titolo: e.target.value }))}
        placeholder="es. Reperibilità Team A"
        style={{ width: "100%", boxSizing: "border-box", background: T.s2, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 12px", color: T.text, fontSize: 14, marginBottom: 16 }} />

      {form.tipo === "reperibilita" && (
        <ReperibilitaFormFields T={T} form={form} setForm={setForm} accent={accent}
          accentText={accentText} modelli={listaModelli} />
      )}

      {form.tipo === "domeniche" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>MODELLO GIORNO LAVORO</div>
          <ModelloSelector T={T} modelli={listaModelli} value={form.modellaLavoroId}
            onChange={id => setForm(prev => ({ ...prev, modellaLavoroId: id }))} />
        </div>
      )}

      {form.tipo === "nlrs_scalante" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>MODELLO RS</div>
          <ModelloSelector T={T} modelli={listaModelli} value={form.modelloRSId}
            onChange={id => setForm(prev => ({ ...prev, modelloRSId: id }))} />
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, margin: "10px 0 6px" }}>MODELLO NL</div>
          <ModelloSelector T={T} modelli={listaModelli} value={form.modelloNLId}
            onChange={id => setForm(prev => ({ ...prev, modelloNLId: id }))} />
        </div>
      )}

      <button onClick={onSave}
        style={{ width: "100%", background: accent, color: accentText, border: "none", borderRadius: 10,
          padding: "13px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
        💾 Salva rotazione
      </button>
    </div>
  );
}
