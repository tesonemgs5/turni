// ═══════════════════════════════════════════════════════════════
// 39-formato-giorno.js — Riconoscimento del "giorno" in una riga di
// tabella turni, in tutte le forme in cui compare (foto OCR e PDF).
//
// Per aggiungere una variante NUOVA basta aggiungere una voce a
// FORMATI_GIORNO qui sotto: foto (Tesseract/Paddle) e PDF la usano
// da sole, senza toccare i parser.
//
// Forme riconosciute (maiuscole/minuscole indifferenti, accenti
// facoltativi, punto dopo il nome facoltativo):
//   "Mercoledì 04/11/0026"   nome intero + data gg/mm/aaaa (anno a 2 o 4 cifre, "0026" = 2026)
//   "Mer. 04/11"             nome abbreviato + gg/mm (anno assente)
//   "mer 04"                 nome + solo numero del giorno
//   "04 mer"                 numero + nome
//   "04/11/2026", "4.11.26"  solo data, separatori / . - |
//   "2026-11-04"             data ISO
//   "Mercoledì 4 novembre 2026", "4 nov"   mese in lettere
//   "Wed 04/11/2026"         nomi inglesi
// ═══════════════════════════════════════════════════════════════

const MESI = {
  gennaio: 1, gen: 1, febbraio: 2, feb: 2, marzo: 3, aprile: 4, apr: 4,
  maggio: 5, mag: 5, giugno: 6, giu: 6, luglio: 7, lug: 7, agosto: 8, ago: 8,
  settembre: 9, set: 9, ottobre: 10, ott: 10, novembre: 11, nov: 11, dicembre: 12, dic: 12,
};

// Nome del giorno: radice di 3 lettere + il resto della parola ("Mercoledì", "Mer.", "Wed").
// "mar" non deve prendere "marzo".
const NOME = String.raw`(?:lun|mar(?!zo\b)|mer|gio|ven|sab|dom|mon|tue|wed|thu|fri|sat|sun)[a-zà-ù\u0300]{0,8}\.?`;
const MESE_TESTO = String.raw`(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|apr|mag|giu|lug|ago|set|ott|nov|dic)\.?`;
// Separatore di data: "/" "." "|" (anche con uno spazio intorno, l'OCR ne aggiunge) oppure "-" attaccato.
const SEP = String.raw`(?:\s{0,2}[/.|]\s{0,2}|-)`;
const INIZIO = String.raw`^[^a-zA-Z0-9]{0,6}`;

const re = (s) => new RegExp(s, "i");
const num = (x) => (x == null || x === "" ? null : parseInt(x, 10));

// Ogni formato: re (ancorata a inizio riga) + leggi(match) -> { giorno, mese|null, anno|null }.
export const FORMATI_GIORNO = [
  { id: "iso",
    re: re(`${INIZIO}(?:${NOME}\\s*)?(\\d{4})-(\\d{1,2})-(\\d{1,2})`),
    leggi: (m) => ({ giorno: num(m[3]), mese: num(m[2]), anno: num(m[1]) }) },
  { id: "mese-in-lettere",
    re: re(`${INIZIO}(?:${NOME}\\s*)?(\\d{1,2})\\s*(${MESE_TESTO})\\s*(\\d{2,4})?`),
    leggi: (m) => ({ giorno: num(m[1]), mese: MESI[m[2].toLowerCase().replace(".", "")] || null, anno: num(m[3]) }) },
  { id: "nome-e-data",
    re: re(`${INIZIO}${NOME}\\s*(\\d{1,2})(?:${SEP}(\\d{1,2})(?:${SEP}(\\d{2,4}))?)?`),
    leggi: (m) => ({ giorno: num(m[1]), mese: num(m[2]), anno: num(m[3]) }) },
  { id: "solo-data",
    re: re(`${INIZIO}(\\d{1,2})${SEP}(\\d{1,2})(?:${SEP}(\\d{2,4}))?`),
    leggi: (m) => ({ giorno: num(m[1]), mese: num(m[2]), anno: num(m[3]) }) },
  { id: "numero-e-nome",
    re: re(`${INIZIO}(\\d{1,2})\\s*${NOME}`),
    leggi: (m) => ({ giorno: num(m[1]), mese: null, anno: null }) },
];

// Anno scritto a 2 cifre o come "0026" -> 2026.
function annoCompleto(a) {
  if (a == null) return null;
  return a < 100 ? a + 2000 : a;
}

// Se la riga INIZIA con un giorno riconoscibile restituisce
// { giorno, mese, anno, formato, resto, lunghezza } (resto = testo dopo il giorno/data), altrimenti null.
export function riconosciInizioRiga(linea) {
  const s = String(linea || "");
  for (const f of FORMATI_GIORNO) {
    const m = f.re.exec(s);
    if (!m) continue;
    const { giorno, mese, anno } = f.leggi(m);
    if (!giorno || giorno < 1 || giorno > 31) continue;
    if (mese != null && (mese < 1 || mese > 12)) continue;
    return {
      giorno, mese, anno: annoCompleto(anno), formato: f.id,
      resto: s.slice(m[0].length), lunghezza: m[0].length,
    };
  }
  return null;
}

// Cerca tutti i giorni dentro un testo continuo (PDF su una riga, OCR senza a capo).
// resto = testo che segue il giorno, fino al giorno successivo.
// richiediMese: considera solo le date complete (con mese), per evitare falsi positivi.
export function trovaGiorniInTesto(testo, { richiediMese = false } = {}) {
  const s = String(testo || "");
  const trovati = [];
  let i = 0;
  while (i < s.length) {
    if (i > 0 && /[a-zà-ù0-9]/i.test(s[i - 1])) { i++; continue; }
    const rc = riconosciInizioRiga(s.slice(i));
    if (rc && (!richiediMese || rc.mese != null)) {
      trovati.push({ ...rc, inizio: i, fine: i + rc.lunghezza });
      i += Math.max(1, rc.lunghezza);
    } else {
      i++;
    }
  }
  return trovati.map((g, k) => {
    const fineResto = k + 1 < trovati.length ? trovati[k + 1].inizio : Math.min(s.length, g.fine + 60);
    return { ...g, resto: s.slice(g.fine, fineResto) };
  });
}
