// ═══════════════════════════════════════════════════════════════
// 14-pdf-turni.js — Lettura diretta del PDF "Calendario turni" (turni
// personali) SENZA OCR e SENZA AI: il PDF ha un livello di testo, quindi
// si legge il testo esatto con pdf.js e si ricostruisce il JSON
// [{ "data":"YYYY-MM-DD", "turno":"Primo|Secondo|Terzo|Notte" }].
// Gira interamente nel browser (nessuna API, nessun server).
// ═══════════════════════════════════════════════════════════════

const MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

// Il PDF scrive "Notturno": nell'app il modello si chiama "Notte".
const TURNO_APP = { primo: "Primo", secondo: "Secondo", terzo: "Terzo", notturno: "Notte" };

// Riga tipo: "Gio. 01 Secondo", "Sab. 17 Notturno".
// Riposo settimanale / Art.19 / Non lavoro non combaciano -> ignorati.
const RIGA_RE = /(?:Lun|Mar|Mer|Gio|Ven|Sab|Dom)\.\s*(\d{1,2})\s+(Primo|Secondo|Terzo|Notturno)\b/gi;

// Totali stampati in fondo al PDF, usati come controllo di coerenza.
const TOTALI_RE = {
  Primo:   /giorni\s+primo\s+turno\s*=\s*(\d+)/i,
  Secondo: /giorni\s+secondo\s+turno\s*=\s*(\d+)/i,
  Terzo:   /giorni\s+terzo\s+turno\s*=\s*(\d+)/i,
  Notte:   /giorni\s+notturno\s*=\s*(\d+)/i,
};

// Funzione pura (testabile senza browser): da testo del PDF a risultato.
export function parseTestoCalendarioTurni(testo) {
  const t = (testo || "").replace(/\s+/g, " ");

  const mTit = /Calendario\s+turni\s*-\s*([A-Za-zàèéìòù]+)\s+(\d{4})/i.exec(t);
  if (!mTit) return { ok: false, motivo: "Titolo \"Calendario turni - Mese Anno\" non trovato", turni: [] };
  const mese = MESI[mTit[1].toLowerCase()];
  const anno = mTit[2];
  if (!mese) return { ok: false, motivo: `Mese non riconosciuto: ${mTit[1]}`, turni: [] };

  const turni = [];
  const viste = new Set();
  for (const m of t.matchAll(RIGA_RE)) {
    const giorno = parseInt(m[1], 10);
    if (giorno < 1 || giorno > 31 || viste.has(giorno)) continue;
    viste.add(giorno);
    turni.push({
      data: `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`,
      turno: TURNO_APP[m[2].toLowerCase()],
    });
  }

  // Controllo con i totali del PDF (se presenti).
  const trovati = { Primo: 0, Secondo: 0, Terzo: 0, Notte: 0 };
  for (const x of turni) trovati[x.turno]++;
  const attesi = {};
  let haTotali = false;
  for (const [k, re] of Object.entries(TOTALI_RE)) {
    const mm = re.exec(t);
    if (mm) { attesi[k] = parseInt(mm[1], 10); haTotali = true; }
  }
  const discrepanze = Object.keys(attesi).filter((k) => attesi[k] !== trovati[k]);

  return {
    ok: turni.length > 0 && discrepanze.length === 0,
    motivo: turni.length === 0
      ? "Nessun turno trovato nel PDF"
      : discrepanze.length
        ? "I conteggi non tornano con i totali del PDF: " +
          discrepanze.map((k) => `${k} letti ${trovati[k]} / attesi ${attesi[k]}`).join(", ")
        : "",
    haTotali, trovati, attesi, turni,
  };
}

// Legge il file PDF nel browser e restituisce il risultato del parsing.
export async function leggiPdfCalendarioTurni(file) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let testo = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const c = await pagina.getTextContent();
    testo += c.items.map((i) => i.str).join(" ") + "\n";
  }
  return parseTestoCalendarioTurni(testo);
}
