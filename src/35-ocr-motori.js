// ═══════════════════════════════════════════════════════════════
// 35-ocr-motori.js — Modulo OCR unico per le letture da foto.
//
// Tutti i motori restituiscono la stessa forma:
//   { text: string, words: [{ text, confidence (0-100), bbox:{x0,y0,x1,y1} }] }
// cosi' il resto dell'app (turni personali, turni Stella, quartine) non
// dipende dal motore usato.
//
// Motori:
//   "tesseract" — tesseract.js (lingua italiana).
//   "paddle"    — PaddleOCR via onnxruntime-web (aggiunto nel passo 1-b).
//
// NOTA tesseract.js 7: la chiamata Tesseract.recognize(img, lang, opts) NON
// restituisce data.words (di default l'uscita e' solo il testo) e non permette
// di chiedere altri formati di uscita. Per avere le parole con posizione serve
// createWorker + worker.recognize(img, {}, { text:true, blocks:true }) e poi si
// appiattisce la gerarchia blocks > paragraphs > lines > words.
// ═══════════════════════════════════════════════════════════════

export const MOTORI_OCR = ["tesseract", "paddle"];

// Appiattisce blocks > paragraphs > lines > words in una lista di parole.
export function paroleDaBlocchi(blocks){
  const out = [];
  for(const b of (blocks || [])){
    for(const p of (b.paragraphs || [])){
      for(const l of (p.lines || [])){
        for(const w of (l.words || [])) out.push(w);
      }
    }
  }
  return out;
}

// Porta una parola di qualsiasi origine alla forma comune; scarta quelle
// senza testo o senza posizione.
function normalizzaParola(w){
  if(!w || typeof w.text !== "string" || !w.text.trim() || !w.bbox) return null;
  const { x0, y0, x1, y1 } = w.bbox;
  if([x0, y0, x1, y1].some(v => typeof v !== "number" || !isFinite(v))) return null;
  const conf = typeof w.confidence === "number" ? w.confidence : 0;
  return { text: w.text, confidence: conf, bbox: { x0, y0, x1, y1 } };
}

async function leggiTesseract(file, onProgress){
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("ita", 1, {
    logger: m => {
      if(m && m.status === "recognizing text" && onProgress) onProgress(Math.round((m.progress || 0) * 100));
    },
  });
  try{
    const r = await worker.recognize(file, {}, { text: true, blocks: true });
    const data = r.data || {};
    // Ordine di preferenza: words (se una versione futura lo rimette), poi
    // blocks, poi lines.
    const grezze = (Array.isArray(data.words) && data.words.length)
      ? data.words
      : (data.blocks && data.blocks.length)
        ? paroleDaBlocchi(data.blocks)
        : (data.lines || []).flatMap(l => l.words || []);
    const words = grezze.map(normalizzaParola).filter(Boolean);
    return { text: data.text || "", words };
  }finally{
    await worker.terminate();
  }
}

// motore: "tesseract" | "paddle". onProgress(0-100) opzionale.
// Lancia un errore se il motore non riesce a partire (modello non scaricato,
// rete assente...): sta al chiamante decidere se proseguire senza.
export async function leggiConMotore(motore, file, onProgress){
  if(motore === "tesseract") return leggiTesseract(file, onProgress);
  const e = new Error(`Motore OCR "${motore}" non disponibile.`);
  e.isMotoreNonDisponibile = true;
  throw e;
}
