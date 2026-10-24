// ═══════════════════════════════════════════════════════════════
// 30-pdf-cot.js — Lettura diretta del PDF "Programmazione autopattuglie"
// (prospetto COT) SENZA OCR e SENZA AI. Il PDF ha il livello di testo:
// ogni cella è una parola con coordinate. Una occorrenza di "Stella" è
// l'INCONTRO tra asse Y (riga = giorno) e asse X (colonna = fascia).
//
// Output: { turni_stella: { "00.00_06.30": ["3 novembre 2026", ...], ... } }
// cioè lo stesso formato del JSON incollato, così passa dallo stesso
// codice di importazione (stesso matching fasce -> modelli).
// Gira interamente nel browser (nessuna API, nessun server).
// ═══════════════════════════════════════════════════════════════

const RIGA_DATA_RE =
  /^(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{4})$/i;
const ORARIO_RE = /(\d{1,2})[.:](\d{2})\s*\/\s*(\d{1,2})[.:](\d{2})/;
const TOLLERANZA_Y = 6;
const SOGLIA_CLUSTER_X = 20;

const due = (n) => String(n).padStart(2, "0");

// Divide n colonne in k gruppi contigui scegliendo la partizione in cui il
// centro di ogni gruppo è più vicino al centro della sua intestazione
// (le intestazioni sono centrate sul proprio gruppo di colonne).
function partizionaColonne(centriColonne, centriIntestazioni) {
  const n = centriColonne.length;
  const k = centriIntestazioni.length;
  if (k === 0 || k > n) return null;
  let migliore = null;
  const tagli = [];
  const prova = (inizio, rimasti) => {
    if (rimasti === 0) {
      const estremi = [0, ...tagli, n];
      let costo = 0;
      for (let g = 0; g < k; g++) {
        const gruppo = centriColonne.slice(estremi[g], estremi[g + 1]);
        const media = gruppo.reduce((a, b) => a + b, 0) / gruppo.length;
        costo += Math.abs(media - centriIntestazioni[g]);
      }
      if (!migliore || costo < migliore.costo) migliore = { costo, estremi: [...estremi] };
      return;
    }
    for (let t = inizio; t <= n - rimasti; t++) {
      tagli.push(t);
      prova(t + 1, rimasti - 1);
      tagli.pop();
    }
  };
  prova(1, k - 1);
  return migliore && migliore.estremi;
}

function clusterizzaX(valori) {
  const ordinati = [...valori].sort((a, b) => a - b);
  const cluster = [];
  for (const v of ordinati) {
    const ultimo = cluster[cluster.length - 1];
    if (ultimo && v - ultimo.max < SOGLIA_CLUSTER_X) {
      ultimo.max = v;
      ultimo.somma += v;
      ultimo.n += 1;
    } else {
      cluster.push({ max: v, somma: v, n: 1 });
    }
  }
  return cluster.map((c) => c.somma / c.n);
}

// Funzione pura (testabile senza browser).
// pagine: [ [ { str, x, w, y }, ... ], ... ]  (x = inizio testo, w = larghezza, y = baseline)
export function parseItemsPdfCot(pagine) {
  const turni = {};
  let giorniTrovati = 0;
  let stelleTrovate = 0;

  for (const items of pagine) {
    const centro = (it) => it.x + it.w / 2;

    // Righe-data (asse Y).
    const righe = [];
    for (const it of items) {
      const m = RIGA_DATA_RE.exec((it.str || "").trim());
      if (m) righe.push({ y: it.y, testo: `${parseInt(m[1], 10)} ${m[2].toLowerCase()} ${m[3]}` });
    }
    if (righe.length === 0) continue;
    giorniTrovati += righe.length;

    const vicinaRiga = (y) => {
      let best = null;
      for (const r of righe) {
        const d = Math.abs(r.y - y);
        if (d <= TOLLERANZA_Y && (!best || d < best.d)) best = { r, d };
      }
      return best && best.r;
    };

    // Celle del corpo (asse X): solo le parole sulle righe-data, esclusa la data.
    const celle = items.filter((it) => {
      const s = (it.str || "").trim();
      return s && !RIGA_DATA_RE.test(s) && vicinaRiga(it.y);
    });
    const centriColonne = clusterizzaX(celle.map(centro));

    // Intestazioni delle fasce (asse X): "ORARIO 00.00/06.15 ...", "14.45/21.00".
    // Le righe "(festivi)" danno l'orario festivo usato come chiave.
    const festivi = items.filter((it) => /\(festivi\)/i.test(it.str) && ORARIO_RE.test(it.str));
    const intestazioni = items
      .filter((it) => ORARIO_RE.test(it.str) && !/\(festivi\)/i.test(it.str))
      .map((it) => {
        const m = ORARIO_RE.exec(it.str);
        const c = centro(it);
        let inizio = `${due(m[1])}.${m[2]}`;
        let fine = `${due(m[3])}.${m[4]}`;
        let vicino = null;
        for (const f of festivi) {
          const d = Math.abs(centro(f) - c);
          if (d < 40 && (!vicino || d < vicino.d)) vicino = { f, d };
        }
        if (vicino) {
          const mf = ORARIO_RE.exec(vicino.f.str);
          inizio = `${due(mf[1])}.${mf[2]}`;
          fine = `${due(mf[3])}.${mf[4]}`;
        }
        return { centro: c, chiave: `${inizio}_${fine}` };
      })
      .sort((a, b) => a.centro - b.centro);

    const estremi = partizionaColonne(centriColonne, intestazioni.map((h) => h.centro));
    if (!estremi) continue;

    const fasciaDiColonna = (indice) => {
      for (let g = 0; g < intestazioni.length; g++) {
        if (indice >= estremi[g] && indice < estremi[g + 1]) return intestazioni[g].chiave;
      }
      return null;
    };

    for (const it of celle) {
      if ((it.str || "").trim().toLowerCase() !== "stella") continue;
      const riga = vicinaRiga(it.y);
      const c = centro(it);
      let col = 0;
      for (let i = 1; i < centriColonne.length; i++) {
        if (Math.abs(centriColonne[i] - c) < Math.abs(centriColonne[col] - c)) col = i;
      }
      const chiave = fasciaDiColonna(col);
      if (!riga || !chiave) continue;
      (turni[chiave] = turni[chiave] || []).push(riga.testo);
      stelleTrovate += 1;
    }
  }

  for (const k of Object.keys(turni)) {
    turni[k] = [...new Set(turni[k])];
  }

  const ok = giorniTrovati > 0 && Object.keys(turni).length > 0;
  return {
    ok,
    motivo: ok ? "" : "Questo PDF non sembra il prospetto COT (giorni o fasce non trovati)",
    giorniTrovati,
    stelleTrovate,
    turni_stella: turni,
  };
}

// ───────────────────────────────────────────────────────────────
// SECONDO METODO (controllo incrociato), indipendente dal primo:
//  - fascia: dalle LINEE VERTICALI della griglia (non dalle coordinate del
//    testo). Le linee che salgono fino all'intestazione separano le fasce,
//    quelle più corte separano le colonne dentro la fascia. Funziona con
//    qualsiasi numero di colonne per fascia (4, 5, 6...).
//  - giorno: dall'ORDINE del testo nel PDF (ogni riga inizia con la sua
//    data), non dalla coordinata Y.
// pagine: [ { items:[{str,x,w,y}], linee:[{x,yMin,yMax}] }, ... ]
// ───────────────────────────────────────────────────────────────
export function parseLineePdfCot(pagine) {
  const turni = {};
  let stelleTrovate = 0;

  for (const { items, linee } of pagine) {
    const centro = (it) => it.x + it.w / 2;
    const dateItems = items.filter((it) => RIGA_DATA_RE.test((it.str || "").trim()));
    if (dateItems.length === 0) continue;
    const destraDate = Math.max(...dateItems.map((it) => it.x + it.w));

    const verticali = (linee || []).filter((l) => l.yMax - l.yMin > 20);
    if (verticali.length < 3) return { ok: false, motivo: "linee della griglia non trovate", turni_stella: {} };

    // Le linee interne iniziano tutte alla stessa altezza (sotto l'intestazione).
    const yMinOrdinati = verticali.map((l) => l.yMin).sort((a, b) => a - b);
    const topCorpo = yMinOrdinati[Math.floor(yMinOrdinati.length / 2)];
    const interne = verticali.filter((l) => Math.abs(l.yMin - topCorpo) < 3);
    const separatori = verticali
      .filter((l) => l.yMin < topCorpo - 10 && l.x > destraDate)
      .map((l) => l.x)
      .sort((a, b) => a - b);
    if (separatori.length < 2) return { ok: false, motivo: "separatori delle fasce non trovati", turni_stella: {} };

    // Gruppi di fasce = intervalli tra separatori consecutivi.
    const gruppi = [];
    for (let i = 0; i < separatori.length - 1; i++) gruppi.push({ da: separatori[i], a: separatori[i + 1] });

    // Intestazioni lette da sinistra a destra, una per gruppo.
    const festivi = items.filter((it) => /\(festivi\)/i.test(it.str) && ORARIO_RE.test(it.str));
    const intestazioni = items
      .filter((it) => ORARIO_RE.test(it.str) && !/\(festivi\)/i.test(it.str))
      .sort((a, b) => centro(a) - centro(b));
    if (intestazioni.length !== gruppi.length) {
      return { ok: false, motivo: "intestazioni e gruppi di colonne non corrispondono", turni_stella: {} };
    }
    const chiaviGruppo = gruppi.map((g, idx) => {
      const h = intestazioni[idx];
      const c = centro(h);
      if (c < g.da || c > g.a) return null;
      let inizio = ORARIO_RE.exec(h.str);
      let vicino = null;
      for (const f of festivi) {
        const d = Math.abs(centro(f) - c);
        if (d < 40 && (!vicino || d < vicino.d)) vicino = { f, d };
      }
      const m = vicino ? ORARIO_RE.exec(vicino.f.str) : inizio;
      return `${due(m[1])}.${m[2]}_${due(m[3])}.${m[4]}`;
    });
    if (chiaviGruppo.some((k) => !k)) {
      return { ok: false, motivo: "intestazione fuori dal suo gruppo di colonne", turni_stella: {} };
    }
    void interne;

    // Scorro il testo nell'ordine del PDF: l'ultima data letta è il giorno della riga.
    let giornoCorrente = null;
    for (const it of items) {
      const t = (it.str || "").trim();
      const m = RIGA_DATA_RE.exec(t);
      if (m) {
        giornoCorrente = `${parseInt(m[1], 10)} ${m[2].toLowerCase()} ${m[3]}`;
        continue;
      }
      if (!giornoCorrente || t.toLowerCase() !== "stella") continue;
      const c = centro(it);
      const idx = gruppi.findIndex((g) => c >= g.da && c < g.a);
      if (idx < 0) continue;
      (turni[chiaviGruppo[idx]] = turni[chiaviGruppo[idx]] || []).push(giornoCorrente);
      stelleTrovate += 1;
    }
  }

  for (const k of Object.keys(turni)) turni[k] = [...new Set(turni[k])];
  return {
    ok: stelleTrovate > 0,
    motivo: stelleTrovate > 0 ? "" : "nessuna occorrenza trovata dal secondo metodo",
    stelleTrovate,
    turni_stella: turni,
  };
}

// Confronta i due risultati. Restituisce le differenze come
// [{ data, fascia, solo: "metodo1" | "metodo2" }]; lista vuota = coincidono.
export function confrontaRisultatiCot(a, b) {
  const insieme = (r) => {
    const set = new Set();
    for (const [fascia, date] of Object.entries(r || {})) for (const d of date) set.add(`${fascia}|${d}`);
    return set;
  };
  const A = insieme(a);
  const B = insieme(b);
  const diff = [];
  for (const x of A) if (!B.has(x)) { const [fascia, data] = x.split("|"); diff.push({ data, fascia, solo: "metodo1" }); }
  for (const x of B) if (!A.has(x)) { const [fascia, data] = x.split("|"); diff.push({ data, fascia, solo: "metodo2" }); }
  return diff;
}

// Estrae le linee verticali sottili (bordi della tabella) dalle istruzioni di
// disegno della pagina, nelle stesse coordinate del testo.
async function leggiLineeVerticali(pdfjs, page) {
  const { OPS } = pdfjs;
  const ol = await page.getOperatorList();
  let m = null;
  const linee = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i];
    if (fn === OPS.transform && !m) { m = args; continue; }
    if (fn !== OPS.constructPath) continue;
    const painting = args[0];
    if (painting !== OPS.fill && painting !== OPS.eoFill) continue;
    const dati = args[1] && args[1][0] && typeof args[1][0].length === "number" ? Array.from(args[1][0]) : args[1];
    if (!Array.isArray(dati)) continue;
    for (let k = 0; k + 12 < dati.length; k += 13) {
      const xs = [dati[k + 1], dati[k + 4], dati[k + 7], dati[k + 10]];
      const ys = [dati[k + 2], dati[k + 5], dati[k + 8], dati[k + 11]];
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      if (w < 2 && h > 20) linee.push({ x: Math.min(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) });
    }
  }
  const a = m ? m[0] : 0.75;
  const e = m ? m[4] : 0;
  return linee.map((l) => ({ x: l.x * a + e, yMin: l.yMin, yMax: l.yMax }));
}

// Legge il file PDF nel browser e restituisce i risultati dei DUE metodi
// e il loro confronto.
export async function leggiPdfCotStella(file) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pagine = [];
  const pagineConLinee = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((it) => typeof it.str === "string")
      .map((it) => ({ str: it.str, x: it.transform[4], w: it.width, y: it.transform[5] }));
    pagine.push(items);
    let linee = [];
    try { linee = await leggiLineeVerticali(pdfjs, page); } catch { linee = []; }
    pagineConLinee.push({ items, linee });
  }
  const r1 = parseItemsPdfCot(pagine);
  let r2;
  try { r2 = parseLineePdfCot(pagineConLinee); } catch { r2 = { ok: false, motivo: "errore nel secondo metodo", turni_stella: {} }; }
  const differenze = r1.ok && r2.ok ? confrontaRisultatiCot(r1.turni_stella, r2.turni_stella) : null;
  return { ...r1, secondo: r2, differenze, verificato: !!(differenze && differenze.length === 0) };
}
