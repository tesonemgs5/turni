import { useState, useMemo } from "react";
import { ColorPickerModal, nomeDelColore as nomeDelColoreShared, ConfermaEliminazione } from "./05-Comuni";

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
// modelli in base all'orario di inizio (colByTime/colLabel). Formato
// allineato a quello letto/scritto dalla UI Impostazioni (updateFascia,
// 02-Modelli.jsx) e salvato su Supabase in fasce_automatiche: color (hex),
// from/to in MINUTI dalla mezzanotte (non stringhe "HH:MM").
export const FASCE_AUTOMATICHE_DEFAULT = [
  { key:"mattina",     label:"PRIMO",    color:"#FFEB3C", from:360,  to:705  }, // 06:00–11:45
  { key:"pomeriggio",  label:"SECONDO",  color:"#FAC02E", from:720,  to:990  }, // 12:00–16:30
  { key:"terzo_turno", label:"3° TURNO", color:"#90CAF8", from:991,  to:1080 }, // 16:31–18:00
  { key:"notte",       label:"NOTTE",    color:"#1E40AF", from:1080, to:359  }, // 18:00–05:59 (attraversa la mezzanotte)
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

// Genera un UUID v4 valido. In precedenza restituiva una stringa tipo
// "local_xxx_yyy": funzionava per lo stato locale, ma quando lo stesso id
// veniva scritto anche nel payload verso Supabase (colonna "id" di tipo
// uuid) il database rifiutava l'insert con errore 22P02 "invalid input
// syntax for type uuid". Usiamo crypto.randomUUID() quando disponibile
// (browser moderni in contesto sicuro), con un fallback manuale altrimenti,
// così l'id è sempre valido sia in locale sia su Supabase.
export function generaIdLocale() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4 senza crypto.randomUUID (es. contesto non sicuro).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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

// Formatta un numero di minuti (accetta anche stringa, anche negativo, es.
// da calcDurata o dal "-durata" dei "meno_recupero") in "Nh Mm" per la sola
// visualizzazione in UI. Non altera il valore numerico usato nei calcoli:
// va chiamata solo al momento del render, mai al posto di calcDurata.
export function formattaDurataHM(minutiTotali) {
  const n = typeof minutiTotali === "string" ? parseInt(minutiTotali, 10) : minutiTotali;
  if (n == null || isNaN(n)) return "";
  const negativo = n < 0;
  const assoluto = Math.abs(n);
  const ore = Math.floor(assoluto / 60);
  const minuti = assoluto % 60;
  const testo = ore > 0 ? `${ore}h ${minuti}m` : `${minuti}m`;
  return negativo ? `-${testo}` : testo;
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
    const da = f.from, a = f.to;
    if (da == null || a == null) continue;
    if (da === a) continue; // fascia "riposo" senza intervallo, salta
    if (da < a) { if (m >= da && m < a) return f; }
    else { if (m >= da || m < a) return f; } // fascia che attraversa la mezzanotte
  }
  return lista[0];
}

export function getColorByTime(tIn, fasceAutomatiche) {
  const f = trovaFascia(tIn, fasceAutomatiche);
  return f?.color || PALETTE[0];
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

// ─────────────────────────────────────────────────────────────────────
// FESTIVITÀ — catalogo unico (nazionali + mobili + regionali + patroni)
// ─────────────────────────────────────────────────────────────────────
// Un solo elenco per TUTTE le festività selezionabili dall'utente in
// Impostazioni -> Festivi. Ogni voce ha una chiave stabile (`key`) che è
// ciò che viene salvato in store.nationalHolsEnabled / Supabase
// (national_hols_enabled): i nomi e le categorie possono cambiare senza
// rompere le preferenze già salvate, le chiavi no.
//
// Due forme possibili per la data:
//   - FISSA:  { m, d }            es. Natale { m:12, d:25 }
//   - MOBILE: { off: <giorni> }   offset in giorni rispetto alla Pasqua
//                                 di quell'anno (Pasquetta = off:1)
// Le mobili NON hanno data in catalogo: viene calcolata ogni volta per
// l'anno richiesto, quindi il ricalcolo annuale è automatico e non
// richiede alcun aggiornamento manuale del codice.
//
// Categorie (`cat`), usate solo per raggruppare la lista nella UI:
//   nazionale | mobile | regionale | patrono

// Domenica di Pasqua per l'anno indicato (calendario gregoriano,
// algoritmo di Meeus/Jones/Butcher). Restituisce { m, d } con mese
// 1-based, coerente con il resto del catalogo.
export function calcolaPasqua(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * mm + 114) / 31);
  const giorno = ((h + l - 7 * mm + 114) % 31) + 1;
  return { m: mese, d: giorno };
}

// Data ottenuta spostando la Pasqua di `off` giorni (off può essere
// negativo: Venerdì Santo = -2, Carnevale = -47).
function dataDaPasqua(year, off) {
  const p = calcolaPasqua(year);
  const dt = new Date(year, p.m - 1, p.d + off);
  return { m: dt.getMonth() + 1, d: dt.getDate() };
}

export const FESTIVITA_CATALOGO = [
  // ── Festività nazionali civili e religiose a data fissa ────────────
  { key:"capodanno",    cat:"nazionale", name:"Capodanno",                    m:1,  d:1  },
  { key:"epifania",     cat:"nazionale", name:"Epifania",                     m:1,  d:6  },
  { key:"liberazione",  cat:"nazionale", name:"Festa della Liberazione",      m:4,  d:25 },
  { key:"lavoro",       cat:"nazionale", name:"Festa dei Lavoratori",         m:5,  d:1  },
  { key:"repubblica",   cat:"nazionale", name:"Festa della Repubblica",       m:6,  d:2  },
  { key:"ferragosto",   cat:"nazionale", name:"Ferragosto — Assunzione",      m:8,  d:15 },
  { key:"ognissanti",   cat:"nazionale", name:"Ognissanti",                   m:11, d:1  },
  { key:"immacolata",   cat:"nazionale", name:"Immacolata Concezione",        m:12, d:8  },
  { key:"natale",       cat:"nazionale", name:"Natale",                       m:12, d:25 },
  { key:"santostefano", cat:"nazionale", name:"Santo Stefano",                m:12, d:26 },

  // ── Festività mobili legate alla Pasqua (ricalcolate ogni anno) ────
  { key:"carnevale",    cat:"mobile", name:"Martedì Grasso (Carnevale)",      off:-47 },
  { key:"ceneri",       cat:"mobile", name:"Mercoledì delle Ceneri",          off:-46 },
  { key:"domenicapalme",cat:"mobile", name:"Domenica delle Palme",            off:-7  },
  { key:"giovedisanto", cat:"mobile", name:"Giovedì Santo",                   off:-3  },
  { key:"venerdisanto", cat:"mobile", name:"Venerdì Santo",                   off:-2  },
  { key:"sabatosanto",  cat:"mobile", name:"Sabato Santo",                    off:-1  },
  { key:"pasqua",       cat:"mobile", name:"Pasqua",                          off:0   },
  { key:"pasquetta",    cat:"mobile", name:"Lunedì dell'Angelo (Pasquetta)",  off:1   },
  { key:"ascensione",   cat:"mobile", name:"Ascensione",                      off:39  },
  { key:"pentecoste",   cat:"mobile", name:"Pentecoste",                      off:49  },
  { key:"lunpentecoste",cat:"mobile", name:"Lunedì di Pentecoste",            off:50  },
  { key:"corpusdomini", cat:"mobile", name:"Corpus Domini",                   off:60  },

  // ── Ricorrenze regionali / statutarie ──────────────────────────────
  { key:"reg_sardegna", cat:"regionale", luogo:"Sardegna",  name:"Sa Die de sa Sardigna",          m:4,  d:28 },
  { key:"reg_sicilia",  cat:"regionale", luogo:"Sicilia",   name:"Autonomia siciliana",            m:5,  d:15 },
  { key:"reg_friuli",   cat:"regionale", luogo:"Friuli-VG", name:"Festa della Patria del Friuli",  m:4,  d:3  },
  { key:"reg_sudtirol", cat:"regionale", luogo:"Alto Adige",name:"Sacro Cuore di Gesù (Herz-Jesu)",m:6,  d:20 },
  { key:"reg_valdaosta",cat:"regionale", luogo:"Valle d'Aosta", name:"Sant'Orso",                  m:2,  d:1  },
  { key:"reg_trentino", cat:"regionale", luogo:"Trentino",  name:"San Vigilio",                    m:6,  d:26 },

  // ── Patroni: Italia e Europa ───────────────────────────────────────
  { key:"pat_italia",    cat:"patrono", luogo:"ITALIA",  name:"San Francesco d'Assisi — Patrono d'Italia", m:10, d:4  },
  { key:"pat_italia_cat",cat:"patrono", luogo:"ITALIA",  name:"Santa Caterina da Siena — Patrona d'Italia", m:4, d:29 },
  { key:"pat_padrepio",  cat:"patrono", luogo:"ITALIA",  name:"San Pio da Pietrelcina (Padre Pio)", m:9,  d:23 },
  { key:"pat_sanantonio",cat:"patrono", luogo:"ITALIA",  name:"Sant'Antonio Abate",                 m:1,  d:17 },
  { key:"pat_sangiuseppe",cat:"patrono",luogo:"ITALIA",  name:"San Giuseppe (Festa del Papà)",      m:3,  d:19 },

  // ── Patroni delle città (capoluoghi e principali centri) ───────────
  { key:"pat_agrigento",  cat:"patrono", luogo:"Agrigento",       name:"San Gerlando",                  m:2,  d:25 },
  { key:"pat_alessandria",cat:"patrono", luogo:"Alessandria",     name:"San Baudolino",                 m:11, d:10 },
  { key:"pat_ancona",     cat:"patrono", luogo:"Ancona",          name:"San Ciriaco",                   m:5,  d:4  },
  { key:"pat_aosta",      cat:"patrono", luogo:"Aosta",           name:"San Grato",                     m:9,  d:7  },
  { key:"pat_arezzo",     cat:"patrono", luogo:"Arezzo",          name:"San Donato",                    m:8,  d:7  },
  { key:"pat_ascoli",     cat:"patrono", luogo:"Ascoli Piceno",   name:"Sant'Emidio",                   m:8,  d:5  },
  { key:"pat_assisi",     cat:"patrono", luogo:"Assisi",          name:"San Francesco",                 m:10, d:4  },
  { key:"pat_asti",       cat:"patrono", luogo:"Asti",            name:"San Secondo",                   m:3,  d:30 },
  { key:"pat_avellino",   cat:"patrono", luogo:"Avellino",        name:"San Modestino",                 m:2,  d:14 },
  { key:"pat_bari",       cat:"patrono", luogo:"Bari",            name:"San Nicola",                    m:12, d:6  },
  { key:"pat_barletta",   cat:"patrono", luogo:"Barletta",        name:"San Ruggero",                   m:12, d:30 },
  { key:"pat_belluno",    cat:"patrono", luogo:"Belluno",         name:"San Martino",                   m:11, d:11 },
  { key:"pat_benevento",  cat:"patrono", luogo:"Benevento",       name:"San Bartolomeo",                m:8,  d:24 },
  { key:"pat_bergamo",    cat:"patrono", luogo:"Bergamo",         name:"Sant'Alessandro",               m:8,  d:26 },
  { key:"pat_biella",     cat:"patrono", luogo:"Biella",          name:"Santo Stefano",                 m:12, d:26 },
  { key:"pat_bologna",    cat:"patrono", luogo:"Bologna",         name:"San Petronio",                  m:10, d:4  },
  { key:"pat_bolzano",    cat:"patrono", luogo:"Bolzano",         name:"Santa Maria Assunta",           m:8,  d:15 },
  { key:"pat_brescia",    cat:"patrono", luogo:"Brescia",         name:"Santi Faustino e Giovita",      m:2,  d:15 },
  { key:"pat_brindisi",   cat:"patrono", luogo:"Brindisi",        name:"San Teodoro d'Amasea",          m:9,  d:7  },
  { key:"pat_cagliari",   cat:"patrono", luogo:"Cagliari",        name:"Sant'Efisio",                   m:5,  d:1  },
  { key:"pat_caltaniss",  cat:"patrono", luogo:"Caltanissetta",   name:"San Michele Arcangelo",         m:9,  d:29 },
  { key:"pat_campobasso", cat:"patrono", luogo:"Campobasso",      name:"San Giorgio",                   m:4,  d:23 },
  { key:"pat_caserta",    cat:"patrono", luogo:"Caserta",         name:"Sant'Anna",                     m:7,  d:26 },
  { key:"pat_catania",    cat:"patrono", luogo:"Catania",         name:"Sant'Agata",                    m:2,  d:5  },
  { key:"pat_catanzaro",  cat:"patrono", luogo:"Catanzaro",       name:"San Vitaliano",                 m:7,  d:16 },
  { key:"pat_chieti",     cat:"patrono", luogo:"Chieti",          name:"San Giustino",                  m:5,  d:11 },
  { key:"pat_como",       cat:"patrono", luogo:"Como",            name:"Sant'Abbondio",                 m:8,  d:31 },
  { key:"pat_cosenza",    cat:"patrono", luogo:"Cosenza",         name:"Madonna del Pilerio",           m:2,  d:12 },
  { key:"pat_cremona",    cat:"patrono", luogo:"Cremona",         name:"Sant'Omobono",                  m:11, d:13 },
  { key:"pat_crotone",    cat:"patrono", luogo:"Crotone",         name:"San Dionigi",                   m:10, d:9  },
  { key:"pat_cuneo",      cat:"patrono", luogo:"Cuneo",           name:"San Michele Arcangelo",         m:9,  d:29 },
  { key:"pat_enna",       cat:"patrono", luogo:"Enna",            name:"Maria SS. della Visitazione",   m:7,  d:2  },
  { key:"pat_ferrara",    cat:"patrono", luogo:"Ferrara",         name:"San Giorgio",                   m:4,  d:23 },
  { key:"pat_firenze",    cat:"patrono", luogo:"Firenze",         name:"San Giovanni Battista",         m:6,  d:24 },
  { key:"pat_foggia",     cat:"patrono", luogo:"Foggia",          name:"Madonna dei Sette Veli",        m:3,  d:22 },
  { key:"pat_forli",      cat:"patrono", luogo:"Forlì",           name:"Madonna del Fuoco",             m:2,  d:4  },
  { key:"pat_frosinone",  cat:"patrono", luogo:"Frosinone",       name:"San Silverio",                  m:6,  d:20 },
  { key:"pat_genova",     cat:"patrono", luogo:"Genova",          name:"San Giovanni Battista",         m:6,  d:24 },
  { key:"pat_gorizia",    cat:"patrono", luogo:"Gorizia",         name:"Santi Ilario e Taziano",        m:3,  d:16 },
  { key:"pat_grosseto",   cat:"patrono", luogo:"Grosseto",        name:"San Lorenzo",                   m:8,  d:10 },
  { key:"pat_imperia",    cat:"patrono", luogo:"Imperia",         name:"San Leonardo",                  m:11, d:6  },
  { key:"pat_isernia",    cat:"patrono", luogo:"Isernia",         name:"San Pietro Celestino",          m:5,  d:19 },
  { key:"pat_laquila",    cat:"patrono", luogo:"L'Aquila",        name:"San Massimo",                   m:6,  d:10 },
  { key:"pat_laspezia",   cat:"patrono", luogo:"La Spezia",       name:"San Giuseppe",                  m:3,  d:19 },
  { key:"pat_latina",     cat:"patrono", luogo:"Latina",          name:"San Marco",                     m:4,  d:25 },
  { key:"pat_lecce",      cat:"patrono", luogo:"Lecce",           name:"Sant'Oronzo",                   m:8,  d:26 },
  { key:"pat_lecco",      cat:"patrono", luogo:"Lecco",           name:"San Nicolò",                    m:12, d:6  },
  { key:"pat_livorno",    cat:"patrono", luogo:"Livorno",         name:"Santa Giulia",                  m:5,  d:22 },
  { key:"pat_lodi",       cat:"patrono", luogo:"Lodi",            name:"San Bassiano",                  m:1,  d:19 },
  { key:"pat_lucca",      cat:"patrono", luogo:"Lucca",           name:"San Paolino",                   m:7,  d:12 },
  { key:"pat_macerata",   cat:"patrono", luogo:"Macerata",        name:"San Giuliano",                  m:8,  d:31 },
  { key:"pat_mantova",    cat:"patrono", luogo:"Mantova",         name:"Sant'Anselmo",                  m:3,  d:18 },
  { key:"pat_massa",      cat:"patrono", luogo:"Massa",           name:"San Francesco",                 m:10, d:4  },
  { key:"pat_matera",     cat:"patrono", luogo:"Matera",          name:"Madonna della Bruna",           m:7,  d:2  },
  { key:"pat_messina",    cat:"patrono", luogo:"Messina",         name:"Madonna della Lettera",         m:6,  d:3  },
  { key:"pat_milano",     cat:"patrono", luogo:"Milano",          name:"Sant'Ambrogio",                 m:12, d:7  },
  { key:"pat_modena",     cat:"patrono", luogo:"Modena",          name:"San Geminiano",                 m:1,  d:31 },
  { key:"pat_monza",      cat:"patrono", luogo:"Monza",           name:"San Giovanni Battista",         m:6,  d:24 },
  { key:"pat_napoli",     cat:"patrono", luogo:"Napoli",          name:"San Gennaro",                   m:9,  d:19 },
  { key:"pat_novara",     cat:"patrono", luogo:"Novara",          name:"San Gaudenzio",                 m:1,  d:22 },
  { key:"pat_nuoro",      cat:"patrono", luogo:"Nuoro",           name:"Madonna delle Grazie",          m:9,  d:8  },
  { key:"pat_oristano",   cat:"patrono", luogo:"Oristano",        name:"Sant'Archelao",                 m:2,  d:13 },
  { key:"pat_padova",     cat:"patrono", luogo:"Padova",          name:"Sant'Antonio da Padova",        m:6,  d:13 },
  { key:"pat_palermo",    cat:"patrono", luogo:"Palermo",         name:"Santa Rosalia",                 m:7,  d:15 },
  { key:"pat_parma",      cat:"patrono", luogo:"Parma",           name:"Sant'Ilario",                   m:1,  d:13 },
  { key:"pat_pavia",      cat:"patrono", luogo:"Pavia",           name:"San Siro",                      m:12, d:9  },
  { key:"pat_perugia",    cat:"patrono", luogo:"Perugia",         name:"Sant'Ercolano",                 m:3,  d:1  },
  { key:"pat_pesaro",     cat:"patrono", luogo:"Pesaro",          name:"San Terenzio",                  m:9,  d:24 },
  { key:"pat_pescara",    cat:"patrono", luogo:"Pescara",         name:"San Cetteo",                    m:10, d:10 },
  { key:"pat_piacenza",   cat:"patrono", luogo:"Piacenza",        name:"Sant'Antonino",                 m:7,  d:4  },
  { key:"pat_pisa",       cat:"patrono", luogo:"Pisa",            name:"San Ranieri",                   m:6,  d:17 },
  { key:"pat_pistoia",    cat:"patrono", luogo:"Pistoia",         name:"San Jacopo",                    m:7,  d:25 },
  { key:"pat_pordenone",  cat:"patrono", luogo:"Pordenone",       name:"San Marco",                     m:4,  d:25 },
  { key:"pat_potenza",    cat:"patrono", luogo:"Potenza",         name:"San Gerardo",                   m:5,  d:30 },
  { key:"pat_prato",      cat:"patrono", luogo:"Prato",           name:"Santo Stefano",                 m:12, d:26 },
  { key:"pat_ragusa",     cat:"patrono", luogo:"Ragusa",          name:"San Giovanni Battista",         m:8,  d:29 },
  { key:"pat_ravenna",    cat:"patrono", luogo:"Ravenna",         name:"Sant'Apollinare",               m:7,  d:23 },
  { key:"pat_reggiocal",  cat:"patrono", luogo:"Reggio Calabria", name:"San Giorgio",                   m:4,  d:23 },
  { key:"pat_reggioem",   cat:"patrono", luogo:"Reggio Emilia",   name:"San Prospero",                  m:11, d:24 },
  { key:"pat_rieti",      cat:"patrono", luogo:"Rieti",           name:"Santa Barbara",                 m:12, d:4  },
  { key:"pat_rimini",     cat:"patrono", luogo:"Rimini",          name:"San Gaudenzio",                 m:10, d:14 },
  { key:"pat_roma",       cat:"patrono", luogo:"Roma",            name:"Santi Pietro e Paolo",          m:6,  d:29 },
  { key:"pat_rovigo",     cat:"patrono", luogo:"Rovigo",          name:"San Bellino",                   m:11, d:26 },
  { key:"pat_salerno",    cat:"patrono", luogo:"Salerno",         name:"San Matteo",                    m:9,  d:21 },
  { key:"pat_sassari",    cat:"patrono", luogo:"Sassari",         name:"San Nicola",                    m:12, d:6  },
  { key:"pat_savona",     cat:"patrono", luogo:"Savona",          name:"N.S. della Misericordia",       m:3,  d:18 },
  { key:"pat_siena",      cat:"patrono", luogo:"Siena",           name:"Sant'Ansano",                   m:12, d:1  },
  { key:"pat_siracusa",   cat:"patrono", luogo:"Siracusa",        name:"Santa Lucia",                   m:12, d:13 },
  { key:"pat_sondrio",    cat:"patrono", luogo:"Sondrio",         name:"Santi Gervasio e Protasio",     m:6,  d:19 },
  { key:"pat_taranto",    cat:"patrono", luogo:"Taranto",         name:"San Cataldo",                   m:5,  d:10 },
  { key:"pat_teramo",     cat:"patrono", luogo:"Teramo",          name:"San Berardo",                   m:12, d:19 },
  { key:"pat_terni",      cat:"patrono", luogo:"Terni",           name:"San Valentino",                 m:2,  d:14 },
  { key:"pat_torino",     cat:"patrono", luogo:"Torino",          name:"San Giovanni Battista",         m:6,  d:24 },
  { key:"pat_trapani",    cat:"patrono", luogo:"Trapani",         name:"Sant'Alberto degli Abati",      m:8,  d:7  },
  { key:"pat_trento",     cat:"patrono", luogo:"Trento",          name:"San Vigilio",                   m:6,  d:26 },
  { key:"pat_treviso",    cat:"patrono", luogo:"Treviso",         name:"San Liberale",                  m:4,  d:27 },
  { key:"pat_trieste",    cat:"patrono", luogo:"Trieste",         name:"San Giusto",                    m:11, d:3  },
  { key:"pat_udine",      cat:"patrono", luogo:"Udine",           name:"Santi Ermacora e Fortunato",    m:7,  d:12 },
  { key:"pat_varese",     cat:"patrono", luogo:"Varese",          name:"San Vittore",                   m:5,  d:8  },
  { key:"pat_venezia",    cat:"patrono", luogo:"Venezia",         name:"San Marco",                     m:4,  d:25 },
  { key:"pat_verbania",   cat:"patrono", luogo:"Verbania",        name:"San Vittore",                   m:5,  d:8  },
  { key:"pat_vercelli",   cat:"patrono", luogo:"Vercelli",        name:"Sant'Eusebio",                  m:8,  d:1  },
  { key:"pat_verona",     cat:"patrono", luogo:"Verona",          name:"San Zeno",                      m:5,  d:21 },
  { key:"pat_vibo",       cat:"patrono", luogo:"Vibo Valentia",   name:"Santa Maria Maggiore",          m:8,  d:5  },
  { key:"pat_vicenza",    cat:"patrono", luogo:"Vicenza",         name:"Madonna di Monte Berico",       m:9,  d:8  },
  { key:"pat_viterbo",    cat:"patrono", luogo:"Viterbo",         name:"Santa Rosa",                    m:9,  d:4  },
];

// Etichette leggibili delle categorie, per i titoli dei gruppi nella UI.
export const FESTIVITA_CATEGORIE = [
  { cat:"nazionale", label:"FESTIVITÀ NAZIONALI" },
  { cat:"mobile",    label:"FESTIVITÀ MOBILI (ricalcolate ogni anno)" },
  { cat:"regionale", label:"RICORRENZE REGIONALI" },
  { cat:"patrono",   label:"SANTI PATRONI — CITTÀ" },
];

// Chiavi attive di default (fallback di store.nationalHolsEnabled finché
// l'utente non personalizza la selezione in Impostazioni -> Festivi):
// le 10 festività nazionali riconosciute per legge più Pasqua e
// Pasquetta. I patroni restano spenti perché valgono solo nella propria
// città: è l'utente a scegliere la sua.
export const FESTIVITA_DEFAULT_ATTIVE = [
  "capodanno", "epifania", "pasqua", "pasquetta", "liberazione", "lavoro",
  "repubblica", "ferragosto", "ognissanti", "immacolata", "natale",
  "santostefano",
];

// Mantenuto per compatibilità con gli import esistenti: la stessa lista
// di patroni, derivata dal catalogo unico invece di essere duplicata.
export const SANTI_PATRONI_CITTA = FESTIVITA_CATALOGO
  .filter(f => f.cat === "patrono")
  .map(f => ({ citta: f.luogo, nome: f.name, d: f.d, m: f.m }));

// Cache per anno del catalogo risolto: resolveFestivitaCatalogo viene
// chiamata a ogni render del calendario e per ogni giorno da isFestivo,
// quindi ricalcolare Pasqua ogni volta sarebbe uno spreco.
const _catalogoPerAnno = new Map();

// Catalogo completo con le date CONCRETE dell'anno richiesto: le voci
// fisse riportano la loro m/d, quelle mobili la data calcolata a partire
// dalla Pasqua di quell'anno. Cambiando anno il ricalcolo è automatico.
export function resolveFestivitaCatalogo(year) {
  const y = Number(year) || new Date().getFullYear();
  if (_catalogoPerAnno.has(y)) return _catalogoPerAnno.get(y);
  const risolto = FESTIVITA_CATALOGO.map(f => {
    if (typeof f.off === "number") {
      const { m, d } = dataDaPasqua(y, f.off);
      return { ...f, m, d, y, mobile: true };
    }
    return { ...f, y, mobile: false };
  });
  _catalogoPerAnno.set(y, risolto);
  return risolto;
}

// Normalizza il parametro delle festività attive nelle tre forme
// accettate: array di chiavi, false (nessuna), true/undefined (usa le
// predefinite — NON tutto il catalogo, che includerebbe i patroni di
// ogni città d'Italia).
function chiaviAttive(nationalHolsEnabled) {
  if (nationalHolsEnabled === false) return [];
  if (Array.isArray(nationalHolsEnabled)) return nationalHolsEnabled;
  return FESTIVITA_DEFAULT_ATTIVE;
}

// Festività EFFETTIVAMENTE attive per un anno, con data risolta.
export function italianHols(year, nationalHolsEnabled = true) {
  const keys = chiaviAttive(nationalHolsEnabled);
  if (keys.length === 0) return [];
  return resolveFestivitaCatalogo(year).filter(f => keys.includes(f.key));
}

// nationalHolsEnabled: array di chiavi, oppure true/undefined (attive di
// default) o false (nessuna). extraHols: festivi PERSONALIZZATI definiti
// a mano dall'utente, nel formato salvato in store.extraHols
// ({name, d, m}, con m 1-based come inserito dall'utente — es. 9 per
// settembre: NON va convertito a 0-based, altrimenti il confronto con il
// mese del dateKey (anch'esso 1-based) fallisce sempre). Un extraHol può
// avere anche `y`: in quel caso vale solo per quell'anno (data personale
// non ricorrente), altrimenti si ripete ogni anno.
export function isFestivo(dateKey, nationalHolsEnabled = true, extraHols = []) {
  if (!dateKey) return false;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0) return true; // domenica
  const keys = chiaviAttive(nationalHolsEnabled);
  if (keys.length > 0) {
    const attive = resolveFestivitaCatalogo(y).filter(f => keys.includes(f.key));
    if (attive.some(h => h.m === m && h.d === d)) return true;
  }
  return (extraHols || []).some(h =>
    +h.m === m && +h.d === d && (h.y == null || +h.y === y));
}


// ─────────────────────────────────────────────────────────────────────
// LOCALSTORAGE — cache locale (calendari/eventi/modelli/impostazioni)
// ─────────────────────────────────────────────────────────────────────

const LS_CACHE_KEY = "turnipm_cache_v1";

export function saveToLocalStorage(events, calendars, modelli, calId, extra = {}) {
  try {
    // Molte chiamate a questa funzione (es. dopo aggiungere/modificare un
    // singolo evento) passano solo events/calendars/modelli, SENZA extra
    // (impostazioni: tema, colori, fasce, festività attive...). Se qui
    // scrivessimo solo i campi ricevuti, ogni salvataggio "parziale"
    // cancellerebbe dalla cache le impostazioni salvate in precedenza
    // (es. da un caricamento completo), perché localStorage.setItem
    // sovrascrive l'intera voce. Per questo prima leggiamo quanto già
    // presente in cache e facciamo merge: i campi non passati in questa
    // chiamata restano quelli già salvati, invece di sparire — è proprio
    // questo il bug che causava il ritorno dei festivi/colori di default
    // al primo render, ad ogni piccola modifica successiva al calendario.
    let precedente = {};
    try {
      const raw = localStorage.getItem(LS_CACHE_KEY);
      if (raw) precedente = JSON.parse(raw) || {};
    } catch { /* cache corrotta o assente: si riparte da vuoto */ }
    const payload = {
      ...precedente, events, calendars, modelli,
      ...(calId !== undefined ? { calId } : {}),
      ...extra, _savedAt: Date.now(),
    };
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

// Salva nella STESSA cache (turnipm_cache_v1, merge come saveToLocalStorage)
// i dati che prima esistevano SOLO in RAM perché arrivavano unicamente da
// Supabase ad ogni avvio: rotazioni, colori extra, autocomplete, indennità,
// valore ticket, configurazioni conteggio. Senza questo, un riavvio
// dell'app senza connessione li faceva ripartire vuoti anche se l'utente
// li aveva già impostati — l'app doveva restare 100% funzionante offline
// dopo il primo render, e questi 6 campi erano il buco che lo impediva.
// Va chiamata da un useEffect che osserva questi stati (vedi 06-Logica.jsx),
// così ogni punto che li modifica è coperto automaticamente, senza dover
// aggiungere una chiamata manuale ad ogni singolo setRotazioni/setColoriExtra/ecc.
export function saveDatiSessioneLocale({ rotazioni, coloriExtra, autocompleteValori, indennita, valoreTicket, conteggioConfigs }) {
  try {
    let precedente = {};
    try {
      const raw = localStorage.getItem(LS_CACHE_KEY);
      if (raw) precedente = JSON.parse(raw) || {};
    } catch { /* cache corrotta o assente: si riparte da vuoto */ }
    const payload = {
      ...precedente,
      ...(rotazioni !== undefined ? { rotazioni } : {}),
      ...(coloriExtra !== undefined ? { coloriExtra } : {}),
      ...(autocompleteValori !== undefined ? { autocompleteValori } : {}),
      ...(indennita !== undefined ? { indennita } : {}),
      ...(valoreTicket !== undefined ? { valoreTicket } : {}),
      ...(conteggioConfigs !== undefined ? { conteggioConfigs } : {}),
      _savedAt: Date.now(),
    };
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("saveDatiSessioneLocale fallito:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────
// BACKUP LOCALE COMPLETO — export/import, indipendente da Supabase.
// ─────────────────────────────────────────────────────────────────────
// Legge/scrive TUTTE le chiavi presenti in localStorage per questa app,
// senza elencarle una per una a mano: qualunque chiave esista oggi (o
// venga aggiunta in futuro da qualunque parte del codice) viene inclusa
// automaticamente. Non è una selezione di "quello che serve": è un dump
// 1:1 dell'intero localStorage del dominio, con un unico filtro di
// sicurezza per non catturare eventuali chiavi di ALTRI siti che
// condividono lo stesso storage (qui non applicabile nella pratica, dato
// che ogni dominio ha il proprio localStorage isolato dal browser, ma il
// filtro resta come garanzia esplicita piuttosto che implicita).
const BACKUP_LOCALE_VERSIONE = 1;

// dataInizio/dataFine (stringhe "YYYY-MM-DD", opzionali): se presenti,
// filtrano SOLO gli eventi dentro la cache principale (turnipm_cache_v1),
// che sono organizzati come { [calendarId]: { [dateKey]: [eventi] } } con
// dateKey nello stesso formato "YYYY-MM-DD" — il confronto è quindi un
// confronto di stringhe, corretto perché il formato è a lunghezza fissa e
// ordinabile lessicograficamente. Tutte le altre chiavi (log, coda sync,
// impostazioni, syncMode...) non vengono filtrate: un filtro per periodo
// ha senso solo sugli eventi, e filtrare anche il resto lascerebbe un
// backup incoerente (es. modelli o calendari mancanti per eventi che poi
// non torneresti a vedere). Un file con filtro periodo NON è pensato come
// backup di sicurezza completo, ma come export mirato per archiviare o
// condividere un intervallo — per questo l'interfaccia mostra un avviso
// quando il periodo è impostato (vedi 02-Modelli.jsx).
export function esportaBackupLocaleCompleto({ dataInizio = "", dataFine = "" } = {}) {
  const filtraPerData = !!(dataInizio || dataFine);
  const chiavi = {};
  let nChiavi = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k == null) continue;
      let valoreGrezzo = null;
      try { valoreGrezzo = localStorage.getItem(k); } catch { continue; }
      if (valoreGrezzo == null) continue;
      // Ogni valore viene salvato così com'è (stringa grezza) E, quando è
      // JSON valido, anche già parsato: questo rende il file leggibile e
      // ispezionabile da un umano (utile per verificare "c'è davvero
      // tutto?" aprendo il .json in un editor), mentre l'import userà
      // sempre e solo il valore grezzo per scrivere su localStorage,
      // garantendo un ripristino byte-per-byte identico all'originale.
      let valoreJson = undefined;
      try { valoreJson = JSON.parse(valoreGrezzo); } catch { /* non è JSON: resta solo grezzo, va bene comunque */ }

      if (filtraPerData && k === LS_CACHE_KEY && valoreJson && typeof valoreJson === "object") {
        // Struttura reale (confermata in 06-Logica.jsx, caricamento da
        // Supabase): events = { [dateKey]: { [calendarId]: [eventi] } } —
        // la DATA è la chiave esterna, il calendario quella interna. La
        // primissima versione di questo filtro aveva le due chiavi
        // invertite (calendario fuori, data dentro): confrontava un id
        // calendario con una stringa data, il confronto falliva sempre e
        // il filtro svuotava silenziosamente tutti gli eventi anche con un
        // periodo che li copriva tutti (es. dal 2023 a oggi → 0 eventi).
        const eventsOriginali = valoreJson.events || {};
        const eventsFiltrati = {};
        for (const dateKey of Object.keys(eventsOriginali)) {
          const dentroInizio = !dataInizio || dateKey >= dataInizio;
          const dentroFine = !dataFine || dateKey <= dataFine;
          if (dentroInizio && dentroFine) eventsFiltrati[dateKey] = eventsOriginali[dateKey];
        }
        const cacheFiltrata = { ...valoreJson, events: eventsFiltrati };
        valoreJson = cacheFiltrata;
        valoreGrezzo = JSON.stringify(cacheFiltrata);
      }

      chiavi[k] = { grezzo: valoreGrezzo, ...(valoreJson !== undefined ? { json: valoreJson } : {}) };
      nChiavi++;
    }
  } catch (e) {
    console.warn("esportaBackupLocaleCompleto: errore durante la scansione di localStorage:", e);
  }
  return {
    _tipo: "turnipm_backup_locale",
    _versione: BACKUP_LOCALE_VERSIONE,
    _esportatoIl: new Date().toISOString(),
    _numeroChiavi: nChiavi,
    _filtroPeriodo: filtraPerData ? { dataInizio: dataInizio||null, dataFine: dataFine||null } : null,
    localStorage: chiavi,
  };
}

// Scrive 1:1 ogni chiave del backup in localStorage (sovrascrivendo quelle
// esistenti con lo stesso nome), poi disattiva syncMode per evitare che al
// prossimo avvio Supabase (se e quando torna la linea) sovrascriva quanto
// appena ripristinato prima che l'utente abbia potuto verificarlo o
// riportarlo lui stesso sul cloud. Ritorna un riepilogo (quante chiavi
// scritte, eventuali errori) invece di lanciare eccezioni silenziose, così
// chi chiama questa funzione può mostrare un esito chiaro all'utente.
export function importaBackupLocaleCompleto(backup) {
  const risultato = { ok: false, chiaviScritte: 0, chiaviTotali: 0, errori: [], messaggio: "", filtroPeriodo: null };
  if (!backup || typeof backup !== "object" || backup._tipo !== "turnipm_backup_locale" || !backup.localStorage) {
    risultato.messaggio = "Il file selezionato non è un backup locale valido di questa app.";
    return risultato;
  }
  risultato.filtroPeriodo = backup._filtroPeriodo || null;
  const chiavi = backup.localStorage;
  const nomiChiavi = Object.keys(chiavi);
  risultato.chiaviTotali = nomiChiavi.length;
  for (const k of nomiChiavi) {
    try {
      const voce = chiavi[k];
      // grezzo è la fonte di verità per l'import: è esattamente ciò che
      // c'era in localStorage al momento dell'export, senza passare da un
      // giro di JSON.parse/stringify che potrebbe alterare formattazione
      // o precisione numerica di casi limite.
      const valore = (voce && typeof voce === "object" && "grezzo" in voce) ? voce.grezzo : JSON.stringify(voce);
      localStorage.setItem(k, valore);
      risultato.chiaviScritte++;
    } catch (e) {
      risultato.errori.push({ chiave: k, errore: String(e && e.message || e) });
    }
  }
  // Sync disattivata dopo l'import: i dati locali appena ripristinati
  // restano quelli in uso finché l'utente stesso non riaccende la
  // sincronizzazione (vedi toggle in Impostazioni), invece di rischiare
  // che un successivo avvio online li sovrascriva silenziosamente.
  try { localStorage.setItem("syncMode", "off"); } catch { /* non bloccante */ }
  risultato.ok = risultato.errori.length === 0;
  risultato.messaggio = risultato.ok
    ? `Importazione completata: ${risultato.chiaviScritte} elementi ripristinati. Sincronizzazione con Supabase disattivata: riattivala dalle Impostazioni quando vuoi tornare a sincronizzare.`
    : `Importati ${risultato.chiaviScritte}/${risultato.chiaviTotali} elementi, con ${risultato.errori.length} errori. Sincronizzazione con Supabase disattivata.`;
  return risultato;
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

export function ModelloSelector({ T, modelli = [], value, onChange, fasceAutomatiche = [] }) {
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
        const colore = m.coloreCustom || m.colore || (m.tempo === "h24" ? COLORE_H24 : getColorByTime(m.inizio, fasceAutomatiche));
        const orario = m.tempo === "h24" ? "H24" : `${m.inizio || "—"} – ${calcFineModello(m) || m.fine || "—"}`;
        return (
          <button key={m.id} type="button" onClick={() => onChange(m.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20,
              border: `1.5px solid ${attivo ? colore : T.border}`,
              background: attivo ? colore : T.s2,
              color: attivo ? getContrastTextColor(colore) : T.text,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: colore, flexShrink: 0 }} />
            <span>{m.titolo}</span>
            <span style={{ opacity: 0.85, fontWeight: 600 }}>{orario}</span>
          </button>
        );
      })}
    </div>
  );
}


// ModelloSelectorCollassabile — variante compatta di ModelloSelector: un
// singolo pulsante che mostra il modello attualmente scelto (o "Nessuno")
// e che apre/chiude, al click, la stessa lista di pill di ModelloSelector
// per cambiare scelta. Usata dove più selettori simili si susseguono in
// verticale (es. i 4 campi della Reperibilità), per evitare di mostrare
// 4 volte l'intera lista dei modelli sempre espansa.
// ─────────────────────────────────────────────────────────────────────

export function ModelloSelectorCollassabile({ T, modelli = [], value, onChange, fasceAutomatiche = [] }) {
  const [aperto, setAperto] = useState(false);
  const modelloScelto = modelli.find(m => m.id === value) || null;
  const coloreScelto = modelloScelto
    ? (modelloScelto.coloreCustom || modelloScelto.colore ||
      (modelloScelto.tempo === "h24" ? COLORE_H24 : getColorByTime(modelloScelto.inizio, fasceAutomatiche)))
    : null;
  const orarioScelto = modelloScelto
    ? (modelloScelto.tempo === "h24" ? "H24" : `${modelloScelto.inizio || "—"} – ${calcFineModello(modelloScelto) || modelloScelto.fine || "—"}`)
    : null;

  return (
    <div>
      <button type="button" onClick={() => setAperto(a => !a)}
        style={{
          width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8,
          padding: "9px 12px", borderRadius: 10, cursor: "pointer", textAlign: "left",
          border: `1.5px solid ${aperto ? T.sub : T.border}`,
          background: T.s2, color: T.text,
        }}>
        {modelloScelto ? (
          <>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: coloreScelto, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{modelloScelto.titolo}</span>
            <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 600, flexShrink: 0 }}>{orarioScelto}</span>
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: T.sub, flex: 1 }}>✕ Nessuno</span>
        )}
        <span style={{ fontSize: 11, color: T.sub, flexShrink: 0, transform: aperto ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
      {aperto && (
        <div style={{ marginTop: 8 }}>
          <ModelloSelector T={T} modelli={modelli} value={value} fasceAutomatiche={fasceAutomatiche}
            onChange={id => { onChange(id); setAperto(false); }} />
        </div>
      )}
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
  { key: "h24", label: "H24" },
  { key: "personalizzato", label: "Orario personalizzato" },
];

export function ModelForm({
  T, form, setForm, accent, dark, fasceAutomatiche, modelli, coloriExtra = [],
  reports = [], getConteggioConfig, updateConteggioConfig,
  suggerimentiTitolo = [], suggerimentiNomeVis = [], onRimuoviSuggerimento,
  onSave,
}) {
  const [mostraSuggTitolo, setMostraSuggTitolo] = useState(false);
  const [reportListaAperta, setReportListaAperta] = useState(false);
  const [reportEspanso, setReportEspanso] = useState(null);
  const [sottomenuEspanso, setSottomenuEspanso] = useState({});
  const accentText = getContrastTextColor(accent);
  const coloreAnteprima = form.coloreCustom || (form.tempo === "h24" ? COLORE_H24 : getColorByTime(form.inizio, fasceAutomatiche));
  const isH24Form = form.tempo === "h24";
  const activeReports = (reports || []).filter(r => r.active);
  const [mostraTuttaPalette, setMostraTuttaPalette] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  // Solo i colori già assegnati a qualche modello esistente (più quello
  // eventualmente già scelto per questo modello, anche se raro nella
  // palette): evita di mostrare 18 pallini quasi tutti inutilizzati.
  const coloriUsati = Array.from(new Set(
    (modelli || []).map(m => m.coloreCustom).filter(Boolean)
  ));
  if (form.coloreCustom && !coloriUsati.includes(form.coloreCustom)) coloriUsati.push(form.coloreCustom);
  const paletteDaMostrare = mostraTuttaPalette ? PALETTE : (coloriUsati.length > 0 ? coloriUsati : PALETTE);

  // Nome del colore attualmente scelto (coloreAnteprima): cerca prima tra le
  // fasce automatiche (PRIMO/SECONDO/3° TURNO/NOTTE), poi H24, poi tra i
  // colori extra con nome assegnato manualmente nella schermata "Colori".
  // Se il colore non ha ancora un nome assegnato da nessuna parte, ricade
  // sul codice esadecimale (stesso comportamento della schermata Colori).
  function nomeDelColore(hex) {
    return nomeDelColoreShared(hex, { fasceAutomatiche, coloriExtra });
  }
  const nomeColoreAnteprima = nomeDelColore(coloreAnteprima);

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

      {form.tempo !== "h24" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: "0 1 130px" }}>
            <div style={{ fontSize: 9, color: T.sub, marginBottom: 3, fontWeight: 700 }}>ORARIO DI INIZIO</div>
            <input type="time" value={form.inizio || ""} onChange={e => setForm(prev => ({ ...prev, inizio: e.target.value }))}
              style={inputStyle} />
          </div>
          {form.tempo === "personalizzato" ? (
            <div style={{ flex: "0 1 130px" }}>
              <div style={{ fontSize: 9, color: T.sub, marginBottom: 3, fontWeight: 700 }}>ORARIO DI FINE</div>
              <input type="time" value={form.fine || ""} onChange={e => setForm(prev => ({ ...prev, fine: e.target.value }))}
                style={inputStyle} />
            </div>
          ) : (form.tempo === "6h15" || form.tempo === "6h30") && form.inizio ? (
            <div style={{ flex: "0 1 130px" }}>
              <div style={{ fontSize: 9, color: T.sub, marginBottom: 3, fontWeight: 700 }}>ORARIO DI FINE (auto)</div>
              <input type="time" value={calcFineModello(form) || ""} disabled
                style={{ ...inputStyle, opacity: 0.65, cursor: "not-allowed" }} />
            </div>
          ) : null}
        </div>
      )}

      {campo("COLORE", (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {paletteDaMostrare.map(c => (
              <div key={c} onClick={() => setForm(prev => ({ ...prev, coloreCustom: c }))}
                style={{
                  width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                  border: form.coloreCustom === c ? `2px solid ${T.text}` : "2px solid transparent",
                }} />
            ))}
            {!mostraTuttaPalette && (
              <div onClick={() => setMostraTuttaPalette(true)} title="Scegli tra tutti i colori"
                style={{
                  width: 26, height: 26, borderRadius: "50%", background: T.s2, cursor: "pointer",
                  border: `1px dashed ${T.border}`, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 14, fontWeight: 900, color: T.sub,
                }}>+</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => setShowColorPicker(true)} title="Cambia colore"
              style={{ width: 22, height: 22, borderRadius: "50%", background: coloreAnteprima,
                border: `1px solid ${T.border}`, cursor: "pointer", padding: 0 }} />
            <button type="button" onClick={() => setShowColorPicker(true)}
              style={{ ...NB, background: T.s2, color: T.text, border: `1px solid ${T.border}`, fontSize: 12, padding: "6px 10px" }}>
              {nomeColoreAnteprima || "Scegli colore…"}
            </button>
            <button type="button" onClick={() => setForm(prev => ({ ...prev, coloreCustom: null }))}
              style={{ ...NB, background: T.s2, color: T.text, border: `1px solid ${T.border}`, fontSize: 12, padding: "6px 10px" }}>
              Usa colore automatico (fascia oraria)
            </button>
          </div>
          {showColorPicker && (
            <ColorPickerModal T={T} cur={coloreAnteprima} title="Colore modello"
              coloriUsati={coloriUsati}
              getNomeColore={nomeDelColore}
              onPick={c => setForm(prev => ({ ...prev, coloreCustom: c }))}
              onClose={() => setShowColorPicker(false)} />
          )}
        </div>
      ))}

      {campo("CATEGORIA TURNO (per report Turnazione)", (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[["primo", "1° turno"], ["secondo", "2° turno"], [null, "Automatico"], ["nessuna", "Nessuna"]].map(([val, lab]) => (
            <button key={lab} type="button" onClick={() => setForm(prev => ({ ...prev, categoria: val }))}
              style={{
                ...NB, flex: "1 1 22%", fontSize: 12, background: (form.categoria ?? null) === val ? accent : T.s2,
                color: (form.categoria ?? null) === val ? accentText : T.text,
                border: `1px solid ${(form.categoria ?? null) === val ? accent : T.border}`,
              }}>
              {lab}
            </button>
          ))}
        </div>
      ))}

      {!isH24Form && campo("CATEGORIA APP/AUTO (per report Turnazione)", (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[["app", "APP"], ["auto", "AUTO"], [null, "Automatico"], ["nessuna", "Nessuna"]].map(([val, lab]) => (
            <button key={lab} type="button" onClick={() => setForm(prev => ({ ...prev, categoriaAppAuto: val }))}
              style={{
                ...NB, flex: "1 1 22%", fontSize: 12, background: (form.categoriaAppAuto ?? null) === val ? accent : T.s2,
                color: (form.categoriaAppAuto ?? null) === val ? accentText : T.text,
                border: `1px solid ${(form.categoriaAppAuto ?? null) === val ? accent : T.border}`,
              }}>
              {lab}
            </button>
          ))}
        </div>
      ))}

      {activeReports.length > 0 && getConteggioConfig && updateConteggioConfig && (()=>{
        // Inclusione/esclusione di QUESTO modello in ciascun report attivo.
        // Stessa logica di statoInclusioneModello usata per il singolo
        // evento (02-Modelli.jsx), applicata qui direttamente al modello:
        // non c'è distinzione "solo questo evento" perché qui la scelta
        // riguarda sempre tutti gli eventi futuri generati da questo modello.
        const modelloFittizio = { id: form.id, tempo: form.tempo, inizio: form.inizio, fine: form.fine };

        function statoInclusione(r){
          const cfg = getConteggioConfig(r.id, r.type);
          if(r.type === "turnazione"){
            const esclusi = cfg.modelliEsclusi || [];
            const aggiunti = cfg.modelliAggiunti || [];
            const isDefault = isModelloTurnazioneDefault(modelloFittizio);
            if(!form.id) return isDefault; // modello nuovo, non ancora salvato: nessun id da cercare nelle liste
            return (isDefault && !esclusi.includes(form.id)) || aggiunti.includes(form.id);
          }
          const whitelist = cfg.modelliInclusi || [];
          if(!form.id) return whitelist.length === 0;
          return whitelist.length === 0 || whitelist.includes(form.id);
        }

        function setInclusione(r, incluso){
          if(!form.id) return; // serve un id di modello salvato per poter comparire nelle liste
          const cfg = getConteggioConfig(r.id, r.type);
          if(r.type === "turnazione"){
            const esclusi = cfg.modelliEsclusi || [];
            const aggiunti = cfg.modelliAggiunti || [];
            const isDefault = isModelloTurnazioneDefault(modelloFittizio);
            if(incluso){
              if(isDefault) updateConteggioConfig(r.id, {...cfg, modelliEsclusi: esclusi.filter(id=>id!==form.id)});
              else updateConteggioConfig(r.id, {...cfg, modelliAggiunti: [...new Set([...aggiunti, form.id])]});
            } else {
              if(isDefault) updateConteggioConfig(r.id, {...cfg, modelliEsclusi: [...new Set([...esclusi, form.id])]});
              else updateConteggioConfig(r.id, {...cfg, modelliAggiunti: aggiunti.filter(id=>id!==form.id)});
            }
          } else {
            const whitelist = cfg.modelliInclusi || [];
            if(incluso){
              const nuova = whitelist.length === 0
                ? modelli.filter(mm=>mm.id!==form.id).map(mm=>mm.id)
                : whitelist.filter(id=>id!==form.id);
              updateConteggioConfig(r.id, {...cfg, modelliInclusi: nuova});
            } else {
              updateConteggioConfig(r.id, {...cfg, modelliInclusi: [...new Set([...whitelist, form.id])]});
            }
          }
        }

        function setSottomenuGruppo(r, sm, gruppoKey){
          if(!form.id) return;
          const cfg = getConteggioConfig(r.id, r.type);
          const nuoviSottomenu = (cfg.sottomenu || []).map(s => {
            if(s.id !== sm.id) return s;
            const assegnazioni = {...(s.assegnazioni || {})};
            if(gruppoKey) assegnazioni[form.id] = gruppoKey; else delete assegnazioni[form.id];
            return {...s, assegnazioni};
          });
          updateConteggioConfig(r.id, {...cfg, sottomenu: nuoviSottomenu});
        }

        return (
          <div style={{ marginBottom: 14 }}>
            <button type="button" onClick={() => setReportListaAperta(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none",
                border: "none", padding: 0, marginBottom: 8, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 11, color: T.sub, fontWeight: 700 }}>CATEGORIA REPORT (per questo modello)</span>
              <span style={{ fontSize: 11, color: T.sub }}>{reportListaAperta ? "▲" : "▼"}</span>
            </button>
            {!form.id && (
              <div style={{ fontSize: 10, color: T.sub, marginBottom: 8 }}>
                Salva il modello per poter scegliere in quali report includerlo.
              </div>
            )}
            {reportListaAperta && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {activeReports.map(r => {
                  const incluso = statoInclusione(r);
                  const espanso = reportEspanso === r.id;
                  const cfgReport = getConteggioConfig(r.id, r.type);
                  const sottomenuLiberi = (cfgReport.sottomenu || []).filter(sm => sm.tipo === "libero" && (sm.gruppi || []).length > 0);
                  const smEspanso = sottomenuEspanso[r.id] || null;
                  return (
                    <div key={r.id} style={{ background: incluso ? accent + "1f" : T.s2, borderRadius: 10, overflow: "hidden" }}>
                      <button type="button" onClick={() => setReportEspanso(espanso ? null : r.id)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          width: "100%", padding: "9px 12px", border: "none", cursor: "pointer",
                          background: "transparent", textAlign: "left" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: incluso ? accent : T.sub }}>
                            {incluso ? "✓ Incluso" : "Escluso"}
                          </span>
                          <span style={{ fontSize: 11, color: T.sub, padding: "2px 4px" }}>{espanso ? "▲" : "▼"}</span>
                        </div>
                      </button>
                      {espanso && (
                        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            {[["incluso", true], ["escluso", false]].map(([key, val]) => (
                              <button key={key} type="button" disabled={!form.id} onClick={() => setInclusione(r, val)}
                                style={{ flex: 1, padding: "7px 4px", borderRadius: 8, cursor: form.id ? "pointer" : "not-allowed",
                                  fontWeight: 700, fontSize: 11, border: "none", opacity: form.id ? 1 : 0.5,
                                  background: incluso === val ? accent : T.surface,
                                  color: incluso === val ? "#fff" : T.sub }}>
                                {key === "incluso" ? "Incluso" : "Escluso"}
                              </button>
                            ))}
                          </div>
                          {sottomenuLiberi.map(sm => {
                            const smAperto = smEspanso === sm.id;
                            const gruppoScelto = form.id ? (sm.assegnazioni || {})[form.id] || "" : "";
                            return (
                              <div key={sm.id} style={{ background: T.surface, borderRadius: 8, overflow: "hidden" }}>
                                <button type="button" onClick={() => setSottomenuEspanso(prev => ({ ...prev, [r.id]: smAperto ? null : sm.id }))}
                                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                    width: "100%", padding: "7px 10px", border: "none", cursor: "pointer",
                                    background: "transparent", textAlign: "left" }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{sm.nome || "Sottomenu"}</span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: gruppoScelto ? accent : T.sub }}>
                                      {(sm.gruppi || []).find(g => g.key === gruppoScelto)?.label || "—"}
                                    </span>
                                    <span style={{ fontSize: 10, color: T.sub }}>{smAperto ? "▲" : "▼"}</span>
                                  </div>
                                </button>
                                {smAperto && (
                                  <div style={{ padding: "0 10px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {(sm.gruppi || []).map(g => (
                                      <button key={g.key} type="button" disabled={!form.id}
                                        onClick={() => setSottomenuGruppo(r, sm, gruppoScelto === g.key ? null : g.key)}
                                        style={{ padding: "6px 10px", borderRadius: 8, cursor: form.id ? "pointer" : "not-allowed",
                                          fontWeight: 700, fontSize: 11, border: "none", opacity: form.id ? 1 : 0.5,
                                          background: gruppoScelto === g.key ? accent : T.s2,
                                          color: gruppoScelto === g.key ? "#fff" : T.sub }}>
                                        {g.label}
                                      </button>
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
                })}
              </div>
            )}
          </div>
        );
      })()}

      <button onClick={onSave}
        style={{ width: "100%", background: accent, color: accentText, border: "none", borderRadius: 10,
          padding: "13px 0", fontWeight: 800, fontSize: 14, cursor: "pointer", marginTop: 6 }}>
        💾 Salva modello
      </button>
    </div>
  );
}

// Card di riepilogo di un modello, per le liste (02-Modelli.jsx).
export function ModelloCard({
  T, modello, accent, onEdit, onDelete,
  selectMode, selected, onToggleSelect,
  onMoveUp, onMoveDown,
  isDragging, isDropTarget,
  onTouchStart, onTouchMove, onTouchEnd,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  // Priorità: colore scelto a mano (coloreCustom) > colore già calcolato e
  // salvato sul modello (automatico per fascia oraria, o H24) > grigio di
  // fallback solo se manca proprio tutto (dato mai popolato).
  const colore = modello.coloreCustom || modello.colore || COLORE_H24;
  const inSpostamento = !!(onMoveUp || onMoveDown || onDragStart);
  const [confermaVisibile, setConfermaVisibile] = useState(false);
  return (
    <div data-modello-id={modello.id}
      draggable={!!onDragStart}
      onTouchStart={onTouchStart || undefined}
      onTouchMove={onTouchMove || undefined}
      onTouchEnd={onTouchEnd || undefined}
      onDragStart={onDragStart || undefined}
      onDragOver={onDragOver || undefined}
      onDrop={onDrop || undefined}
      onDragEnd={onDragEnd || undefined}
      onClick={selectMode ? onToggleSelect : undefined}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: selectMode && selected ? `${accent}22` : T.surface,
        border: isDropTarget ? `2px dashed ${accent}` : (selectMode && selected ? `2px solid ${accent}` : `1px solid ${T.border}`),
        borderRadius: 12, padding: "12px 14px", marginBottom: 8,
        opacity: isDragging ? 0.5 : 1,
        cursor: selectMode ? "pointer" : (inSpostamento ? "grab" : "default"),
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
        <div style={{ width: 20, height: 20, borderRadius: 5, background: colore, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {modello.titolo}
          </div>
          <div style={{ fontSize: 18, color: T.sub }}>
            {modello.tempo === "h24" ? "H24" : `${modello.inizio || "—"} – ${calcFineModello(modello) || modello.fine || "—"}`}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {(onMoveUp || onMoveDown) && (
          <div style={{ display: "flex", flexDirection: "row", gap: 4, marginRight: 4 }}>
            <button type="button" onClick={e => { e.stopPropagation(); onMoveUp && onMoveUp(); }}
              disabled={!onMoveUp}
              style={{ ...NB, background: T.s2, color: onMoveUp ? T.text : T.border, border: `1px solid ${T.border}`,
                padding: "4px 8px", fontSize: 14, lineHeight: 1, cursor: onMoveUp ? "pointer" : "default" }}>▲</button>
            <button type="button" onClick={e => { e.stopPropagation(); onMoveDown && onMoveDown(); }}
              disabled={!onMoveDown}
              style={{ ...NB, background: T.s2, color: onMoveDown ? T.text : T.border, border: `1px solid ${T.border}`,
                padding: "4px 8px", fontSize: 14, lineHeight: 1, cursor: onMoveDown ? "pointer" : "default" }}>▼</button>
          </div>
        )}
        {onDelete && <button onClick={e => { e.stopPropagation(); setConfermaVisibile(true); }}
          style={{ ...NB, background: "none", color: "#ef4444", padding: 8, fontSize: 20, lineHeight: 1 }}>🗑</button>}
      </div>
      {confermaVisibile && (
        <ConfermaEliminazione T={T} testo={`Vuoi eliminare "${modello.titolo}"?`}
          onConferma={() => { setConfermaVisibile(false); onDelete(modello); }}
          onAnnulla={() => setConfermaVisibile(false)} />
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// RotazioneCard — riepilogo di una rotazione nell'elenco.
// ─────────────────────────────────────────────────────────────────────

export function RotazioneCard({ T, rot, accent, onOpen, onEdit, onDelete, onMoveUp, onMoveDown }) {
  const [confermaVisibile, setConfermaVisibile] = useState(false);
  const tipoLabel = rot.tipo === "domeniche" ? "🗓 Domeniche 1/4"
    : rot.tipo === "reperibilita" ? "📞 Reperibilità"
    : rot.tipo === "nlrs_scalante" ? "📅 RS/NL Scalante"
    : "🗓️ Personalizzata";
  return (
    <>
    <div onClick={() => onOpen && onOpen(rot)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px",
      marginBottom: 8, cursor: onOpen ? "pointer" : "default",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{rot.titolo || "Senza nome"}</div>
        <div style={{ fontSize: 18, color: T.sub, marginTop: 2 }}>{tipoLabel}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {(onMoveUp || onMoveDown) && (
          <div style={{ display: "flex", flexDirection: "row", gap: 4, marginRight: 4 }}>
            <button type="button" onClick={e => { e.stopPropagation(); onMoveUp && onMoveUp(); }}
              disabled={!onMoveUp}
              style={{ ...NB, background: T.s2, color: onMoveUp ? T.text : T.border, border: `1px solid ${T.border}`,
                padding: "4px 8px", fontSize: 14, lineHeight: 1, cursor: onMoveUp ? "pointer" : "default" }}>▲</button>
            <button type="button" onClick={e => { e.stopPropagation(); onMoveDown && onMoveDown(); }}
              disabled={!onMoveDown}
              style={{ ...NB, background: T.s2, color: onMoveDown ? T.text : T.border, border: `1px solid ${T.border}`,
                padding: "4px 8px", fontSize: 14, lineHeight: 1, cursor: onMoveDown ? "pointer" : "default" }}>▼</button>
          </div>
        )}
        {onEdit && (
          <button onClick={e => { e.stopPropagation(); onEdit(rot); }}
            style={{ ...NB, background: "none", color: accent, padding: 8, fontSize: 20, lineHeight: 1 }}>✎</button>
        )}
        {onDelete && (
          <button onClick={e => { e.stopPropagation(); setConfermaVisibile(true); }}
            style={{ ...NB, background: "none", color: "#ef4444", padding: 8, fontSize: 20, lineHeight: 1 }}>🗑</button>
        )}
      </div>
    </div>
    {confermaVisibile && (
      <ConfermaEliminazione T={T} testo={`Vuoi eliminare "${rot.titolo || 'questa rotazione'}"?`}
        onConferma={() => { setConfermaVisibile(false); onDelete(rot); }}
        onAnnulla={() => setConfermaVisibile(false)} />
    )}
    </>
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

export function ReperibilitaFormFields({ T, form, setForm, accent, accentText, modelli, fasceAutomatiche = [] }) {
  const mancaQualcheModello = !form.modelloRSId || !form.modelloNLId || !form.modelloG3Id || !form.modelloG4Id;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        MODELLO GIORNO 1
      </div>
      <ModelloSelectorCollassabile T={T} modelli={modelli} value={form.modelloRSId} fasceAutomatiche={fasceAutomatiche}
        onChange={id => setForm(prev => ({ ...prev, modelloRSId: id }))} />

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, margin: "10px 0 6px" }}>
        MODELLO GIORNO 2 (Giorno 1 + 1)
      </div>
      <ModelloSelectorCollassabile T={T} modelli={modelli} value={form.modelloNLId} fasceAutomatiche={fasceAutomatiche}
        onChange={id => setForm(prev => ({ ...prev, modelloNLId: id }))} />

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, margin: "10px 0 6px" }}>
        MODELLO GIORNO 3 (Giorno 2 + 7)
      </div>
      <ModelloSelectorCollassabile T={T} modelli={modelli} value={form.modelloG3Id} fasceAutomatiche={fasceAutomatiche}
        onChange={id => setForm(prev => ({ ...prev, modelloG3Id: id }))} />

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, margin: "10px 0 6px" }}>
        MODELLO GIORNO 4 (Giorno 3 + 1)
      </div>
      <ModelloSelectorCollassabile T={T} modelli={modelli} value={form.modelloG4Id} fasceAutomatiche={fasceAutomatiche}
        onChange={id => setForm(prev => ({ ...prev, modelloG4Id: id }))} />

      <div style={{ fontSize: 11, color: T.sub, marginTop: 10, marginBottom: 4 }}>
        Il ciclo genera 4 eventi a catena: Giorno 1 → +1 → Giorno 2 → +7 → Giorno 3 → +1 → Giorno 4.
        Il ciclo successivo riparte 16 giorni dopo il Giorno 1 precedente, con la stessa
        sequenza e gli stessi 4 modelli nello stesso ordine.
      </div>

      {mancaQualcheModello && (
        <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginTop: 10,
          background: "#ef444422", border: "1px solid #ef4444", borderRadius: 8, padding: "8px 10px" }}>
          ⚠️ Seleziona un modello per tutti e 4 i giorni,
          altrimenti l'applicazione della rotazione non genera tutti gli eventi.
        </div>
      )}
    </div>
  );
}

export function calcolaAnteprimaReperibilita(rot, nBlocchi = 12) {
  if (!rot?.dataInizio) return [];
  const [y0, m0, d0] = rot.dataInizio.split("-").map(Number);
  const start = new Date(y0, m0 - 1, d0);

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const righe = [];
  for (let i = 0; i < nBlocchi; i++) {
    // Ogni ciclo genera 4 giorni con offset +0,+1,+8,+9 dal proprio Giorno 1
    // (G1 →+1→ G2 →+7→ G3 →+1→ G4). Il ciclo successivo deve perciò
    // ripartire da +16, non +8: con +8 il Giorno1/Giorno2 del ciclo
    // successivo (+8/+9) coinciderebbero esattamente con il Giorno3/Giorno4
    // del ciclo precedente (anch'essi a +8/+9), duplicando gli eventi sulle
    // stesse date invece di proseguire la sequenza.
    const offsetBlocco = i * 16;

    const giorno1 = new Date(start);
    giorno1.setDate(giorno1.getDate() + offsetBlocco);
    const giorno2 = new Date(giorno1);
    giorno2.setDate(giorno2.getDate() + 1);
    const giorno3 = new Date(giorno2);
    giorno3.setDate(giorno3.getDate() + 7);
    const giorno4 = new Date(giorno3);
    giorno4.setDate(giorno4.getDate() + 1);

    righe.push({ data: fmt(giorno1), giornoCiclo: 1 });
    righe.push({ data: fmt(giorno2), giornoCiclo: 2 });
    righe.push({ data: fmt(giorno3), giornoCiclo: 3 });
    righe.push({ data: fmt(giorno4), giornoCiclo: 4 });
  }
  return righe;
}

export function ReperibilitaView({ rot, T, accent, modelli }) {
  const modA = modelli.find(m => m.id === rot.modelloRSId);
  const modB = modelli.find(m => m.id === rot.modelloNLId);
  const modC = modelli.find(m => m.id === rot.modelloG3Id);
  const modD = modelli.find(m => m.id === rot.modelloG4Id);
  const anteprima = calcolaAnteprimaReperibilita(rot, 12);

  const NOMI_GIORNI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const MOD_PER_GIORNO = { 1: modA, 2: modB, 3: modC, 4: modD };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        {[1, 2, 3, 4].map(g => {
          const mod = MOD_PER_GIORNO[g];
          return (
            <div key={g} style={{ flex: "1 1 45%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>GIORNO {g}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: mod?.coloreCustom || accent }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{mod?.titolo || "— nessun modello —"}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 8 }}>
        ANTEPRIMA (prossimi {anteprima.length} giorni di turno)
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        {anteprima.map((r, i) => {
          const [ry, rm, rd] = r.data.split("-").map(Number);
          const giornoSett = NOMI_GIORNI[new Date(ry, rm - 1, rd).getDay()];
          const mod = MOD_PER_GIORNO[r.giornoCiclo];
          return (
            <div key={r.data + r.giornoCiclo} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 14px", borderBottom: i < anteprima.length - 1 ? `1px solid ${T.border}` : "none"
            }}>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
                {giornoSett} {rd}/{rm}/{ry}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: mod?.coloreCustom || accent }} />
                <div style={{ fontSize: 12, color: T.sub }}>{mod?.titolo || `Giorno ${r.giornoCiclo}`}</div>
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
            <ModelloSelector T={T} modelli={modelli} value={griglia[pallinoAttivo] || null} fasceAutomatiche={fasceAutomatiche}
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

export function RotazioneForm({ T, form, setForm, accent, modelli, sortedModelli, fasceAutomatiche = [], onSave }) {
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
          accentText={accentText} modelli={listaModelli} fasceAutomatiche={fasceAutomatiche} />
      )}

      {form.tipo === "domeniche" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>MODELLO GIORNO LAVORO</div>
          <ModelloSelectorCollassabile T={T} modelli={listaModelli} value={form.modellaLavoroId} fasceAutomatiche={fasceAutomatiche}
            onChange={id => setForm(prev => ({ ...prev, modellaLavoroId: id }))} />
        </div>
      )}

      {form.tipo === "nlrs_scalante" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>MODELLO RS</div>
          <ModelloSelectorCollassabile T={T} modelli={listaModelli} value={form.modelloRSId} fasceAutomatiche={fasceAutomatiche}
            onChange={id => setForm(prev => ({ ...prev, modelloRSId: id }))} />
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, margin: "10px 0 6px" }}>MODELLO NL</div>
          <ModelloSelectorCollassabile T={T} modelli={listaModelli} value={form.modelloNLId} fasceAutomatiche={fasceAutomatiche}
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
