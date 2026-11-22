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

const PADDLE_BASE = "/ocr/pp-ocrv5-mobile/";
const PADDLE_CACHE = "turni-ocr-pp-ocrv5-mobile-v1";
let paddleEnginePromise = null;

export function righeDaDizionarioDictionary(contents){
  const lines = String(contents || "").split("\n");
  if(lines.length && lines[lines.length - 1] === "") lines.pop();
  const dictionary = lines.map(line => line.endsWith("\r") ? line.slice(0, -1) : line);
  if(dictionary.length === 0 || dictionary[dictionary.length - 1] !== " ") dictionary.push(" ");
  return dictionary;
}

export function decodificaCTC(scores, timesteps, vocabulary){
  let text = "";
  let previous = -1;
  let probability = 0;
  let kept = 0;
  const vocabSize = vocabulary.length + 1;
  for(let t = 0; t < timesteps; t++){
    const base = t * vocabSize;
    let best = 0;
    let bestValue = scores[base] || 0;
    for(let v = 1; v <= vocabulary.length; v++){
      const value = scores[base + v] || 0;
      if(value > bestValue){ best = v; bestValue = value; }
    }
    if(best !== 0 && best !== previous){
      const character = vocabulary[best - 1];
      if(character != null){
        text += character;
        probability += Math.min(1, Math.max(0, bestValue));
        kept++;
      }
    }
    previous = best;
  }
  return { text, confidence: kept ? (probability / kept) * 100 : 100 };
}

export function paroleDaRiga(text, bbox, confidence){
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if(!words.length) return [];
  const width = Math.max(1, bbox.x1 - bbox.x0);
  const totalLength = words.reduce((n, word) => n + word.length, 0);
  let cursor = bbox.x0;
  return words.map((word, index) => {
    const fraction = (word.length + (index < words.length - 1 ? 1 : 0)) / (totalLength + Math.max(0, words.length - 1));
    const x1 = index === words.length - 1 ? bbox.x1 : cursor + fraction * width;
    const out = { text: word, confidence, bbox: { x0: cursor, y0: bbox.y0, x1, y1: bbox.y1 } };
    cursor = x1;
    return out;
  });
}

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

// Impronta SHA-256 (esadecimale) di un file: serve a verificare che i modelli
// non siano corrotti o alterati. Se il browser non la sa calcolare l'OCR Paddle
// non parte (meglio un errore chiaro che un modello non verificato).
export async function sha256Hex(buffer){
  const sub = globalThis.crypto?.subtle;
  if(!sub) throw new Error("Controllo SHA-256 non disponibile in questo ambiente: modelli OCR non verificabili.");
  const digest = await sub.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Impronte ufficiali dei modelli PP-OCRv5 mobile (le stesse di dart-pdf, ocr_model.dart).
export const MODELLI_SHA256 = {
  "det.onnx": "d5de5df358366210d16419b9636a2fc1efa5d7a20688f38a7869ec7b1a4f4f7d",
  "rec.onnx": "0030c6b05fbe29b07a93701503938d637efe7423325e2efb2bd7c8f220d40a8d",
  "dict.txt": "d1979e9f794c464c0d2e0b70a7fe14dd978e9dc644c0e71f14158cdf8342af1b",
};

async function verificaSha(buffer, nome){
  const atteso = MODELLI_SHA256[nome];
  if(!atteso) throw new Error(`Modello OCR sconosciuto: ${nome}.`);
  return (await sha256Hex(buffer)) === atteso;
}

async function fetchModello(url, onBytes){
  const nome = url.split("/").pop();
  let cache = null;
  try{
    cache = await caches.open(PADDLE_CACHE);
    const hit = await cache.match(url);
    if(hit){
      const buffer = await hit.arrayBuffer();
      // Copia in cache corrotta o vecchia: si scarta e si riscarica.
      if(await verificaSha(buffer, nome)){
        onBytes?.(buffer.byteLength, buffer.byteLength);
        return buffer;
      }
      await cache.delete(url);
    }
  }catch(e){
    if(e && /SHA-256/.test(e.message || "")) throw e;
    cache = null;
  }
  const response = await fetch(url);
  if(!response.ok) throw new Error(`OCR model ${url}: HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();
  let buffer;
  if(!reader){
    buffer = await response.arrayBuffer();
    onBytes?.(buffer.byteLength, buffer.byteLength);
  }else{
    const chunks = [];
    let loaded = 0;
    for(;;){
      const step = await reader.read();
      if(step.done) break;
      chunks.push(step.value);
      loaded += step.value.byteLength;
      onBytes?.(loaded, Math.max(total, loaded));
    }
    const unito = new Uint8Array(loaded);
    let offset = 0;
    for(const chunk of chunks){ unito.set(chunk, offset); offset += chunk.byteLength; }
    buffer = unito.buffer;
  }
  if(!(await verificaSha(buffer, nome))){
    throw new Error(`Modello OCR ${nome} corrotto o alterato (SHA-256 diverso dall'originale).`);
  }
  if(cache){
    try{ await cache.put(url, new Response(buffer.slice(0))); }catch{}
  }
  return buffer;
}

async function creaImmagine(file){
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { canvas, context, width: canvas.width, height: canvas.height,
    rgba: context.getImageData(0, 0, canvas.width, canvas.height).data };
}

function dimensioneDetezione(width, height, sideLimit = 4000){
  const longest = Math.max(width, height);
  const ratio = longest > sideLimit ? sideLimit / longest : 1;
  const round32 = value => Math.max(32, Math.round(value / 32) * 32);
  return { width: round32(width * ratio), height: round32(height * ratio),
    scaleX: width / round32(width * ratio), scaleY: height / round32(height * ratio) };
}

function ridimensionaRgba(rgba, srcWidth, srcHeight, dstWidth, dstHeight){
  const canvas = document.createElement("canvas");
  canvas.width = srcWidth;
  canvas.height = srcHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), srcWidth, srcHeight), 0, 0);
  const out = document.createElement("canvas");
  out.width = dstWidth;
  out.height = dstHeight;
  const outCtx = out.getContext("2d", { willReadFrequently: true });
  outCtx.drawImage(canvas, 0, 0, dstWidth, dstHeight);
  return outCtx.getImageData(0, 0, dstWidth, dstHeight).data;
}

function tensorNCHW(rgba, width, height, mean, std){
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for(let y = 0; y < height; y++){
    for(let x = 0; x < width; x++){
      const p = (y * width + x) * 4;
      const o = y * width + x;
      out[o] = (rgba[p] / 255 - mean[0]) / std[0];
      out[plane + o] = (rgba[p + 1] / 255 - mean[1]) / std[1];
      out[2 * plane + o] = (rgba[p + 2] / 255 - mean[2]) / std[2];
    }
  }
  return out;
}

function estraiBox(probability, width, height, scaleX, scaleY){
  const threshold = 0.3;
  const visited = new Uint8Array(width * height);
  const boxes = [];
  const stack = [];
  for(let start = 0; start < probability.length; start++){
    if(visited[start] || probability[start] < threshold) continue;
    let minX = width, minY = height, maxX = -1, maxY = -1, sum = 0, count = 0;
    stack.push(start);
    visited[start] = 1;
    while(stack.length){
      const idx = stack.pop();
      const x = idx % width, y = Math.floor(idx / width);
      sum += probability[idx]; count++;
      if(x < minX) minX = x; if(x > maxX) maxX = x;
      if(y < minY) minY = y; if(y > maxY) maxY = y;
      const neighbors = [x > 0 ? idx - 1 : -1, x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1, y < height - 1 ? idx + width : -1];
      for(const next of neighbors){
        if(next >= 0 && !visited[next] && probability[next] >= threshold){
          visited[next] = 1; stack.push(next);
        }
      }
    }
    const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
    const score = sum / count;
    if(boxWidth < 3 || boxHeight < 3 || score < 0.6) continue;
    const d = boxWidth * boxHeight * 1.5 / (2 * (boxWidth + boxHeight));
    boxes.push({
      x0: Math.max(0, (minX - d) * scaleX),
      y0: Math.max(0, (minY - d) * scaleY),
      x1: Math.min(width * scaleX, (maxX + 1 + d) * scaleX),
      y1: Math.min(height * scaleY, (maxY + 1 + d) * scaleY),
      score
    });
  }
  boxes.sort((a,b) => a.y0 === b.y0 ? a.x0-b.x0 : a.y0-b.y0);
  return boxes;
}

async function paddleEngine(onProgress){
  if(paddleEnginePromise) return paddleEnginePromise;
  paddleEnginePromise = (async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    const base = new URL(PADDLE_BASE, document.baseURI).href;
    let downloaded = 0, detBuffer, recBuffer;
    detBuffer = await fetchModello(`${base}det.onnx`, (loaded, total) => {
      downloaded = loaded;
      onProgress?.(Math.round(downloaded / (total + 16557298) * 20));
    });
    recBuffer = await fetchModello(`${base}rec.onnx`, (loaded, total) => {
      downloaded = (detBuffer.byteLength) + loaded;
      onProgress?.(Math.round(downloaded / (4819576 + 16557298) * 20));
    });
    const dictionaryBuffer = await fetchModello(`${base}dict.txt`);
    const dictionary = righeDaDizionarioDictionary(new TextDecoder().decode(dictionaryBuffer));
    onProgress?.(25);
    const det = await ort.InferenceSession.create(new Uint8Array(detBuffer), {
      executionProviders: ["wasm"], graphOptimizationLevel: "all"
    });
    const rec = await ort.InferenceSession.create(new Uint8Array(recBuffer), {
      executionProviders: ["wasm"], graphOptimizationLevel: "all"
    });
    onProgress?.(35);
    return { ort, det, rec, dictionary };
  })();
  paddleEnginePromise.catch(() => { paddleEnginePromise = null; });
  return paddleEnginePromise;
}

function cropAndResizeRgba(rgba, srcWidth, srcHeight, bbox, targetHeight = 48, maxWidth = 3200){
  const left = Math.max(0, Math.floor(bbox.x0));
  const top = Math.max(0, Math.floor(bbox.y0));
  const right = Math.min(srcWidth, Math.ceil(bbox.x1));
  const bottom = Math.min(srcHeight, Math.ceil(bbox.y1));
  const cropWidth = Math.max(1, right - left);
  const cropHeight = Math.max(1, bottom - top);
  const scaledWidth = Math.max(1, Math.min(maxWidth,
    Math.round(cropWidth * targetHeight / cropHeight)));
  const paddedWidth = Math.max(320, scaledWidth);
  const out = new Uint8ClampedArray(paddedWidth * targetHeight * 4);
  for(let y = 0; y < targetHeight; y++){
    const sourceY = top + Math.min(cropHeight - 1, Math.floor(y * cropHeight / targetHeight));
    for(let x = 0; x < scaledWidth; x++){
      const sourceX = left + Math.min(cropWidth - 1, Math.floor(x * cropWidth / scaledWidth));
      const source = (sourceY * srcWidth + sourceX) * 4;
      const destination = (y * paddedWidth + x) * 4;
      out[destination] = rgba[source];
      out[destination + 1] = rgba[source + 1];
      out[destination + 2] = rgba[source + 2];
      out[destination + 3] = rgba[source + 3];
    }
  }
  const plane = paddedWidth * targetHeight;
  const tensor = new Float32Array(3 * plane);
  for(let y = 0; y < targetHeight; y++){
    for(let x = 0; x < paddedWidth; x++){
      const p = (y * paddedWidth + x) * 4;
      const o = y * paddedWidth + x;
      tensor[o] = (out[p] / 255 - 0.5) / 0.5;
      tensor[plane + o] = (out[p + 1] / 255 - 0.5) / 0.5;
      tensor[2 * plane + o] = (out[p + 2] / 255 - 0.5) / 0.5;
    }
  }
  return { tensor, width: paddedWidth };
}

async function leggiPaddle(file, onProgress){
  const engine = await paddleEngine(onProgress);
  const image = await creaImmagine(file);
  const detection = dimensioneDetezione(image.width, image.height);
  const resized = ridimensionaRgba(image.rgba, image.width, image.height,
    detection.width, detection.height);
  const detTensor = tensorNCHW(resized, detection.width, detection.height,
    [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
  const detInput = new engine.ort.Tensor("float32", detTensor,
    [1, 3, detection.height, detection.width]);
  const detOutput = await engine.det.run({ [engine.det.inputNames[0]]: detInput });
  const detValue = detOutput[engine.det.outputNames[0]];
  const probability = await detValue.data;
  const probabilityDims = detValue.dims;
  const probabilityWidth = probabilityDims[3] || detection.width;
  const probabilityHeight = probabilityDims[2] || detection.height;
  const boxes = estraiBox(probability, probabilityWidth, probabilityHeight,
    detection.scaleX, detection.scaleY);
  detInput.dispose();
  detValue.dispose();

  const lines = [];
  for(let i = 0; i < boxes.length; i++){
    const box = boxes[i];
    const crop = cropAndResizeRgba(image.rgba, image.width, image.height, box);
    const recInput = new engine.ort.Tensor("float32", crop.tensor,
      [1, 3, 48, crop.width]);
    const recOutput = await engine.rec.run({ [engine.rec.inputNames[0]]: recInput });
    const recValue = recOutput[engine.rec.outputNames[0]];
    const scores = await recValue.data;
    const dims = recValue.dims;
    const timesteps = dims[1] || 0;
    const vocabSize = dims[2] || engine.dictionary.length + 1;
    const vocabulary = engine.dictionary.slice(0, vocabSize - 1);
    const decoded = decodificaCTC(scores, timesteps, vocabulary);
    recInput.dispose();
    recValue.dispose();
    if(decoded.text.trim()){
      lines.push({ text: decoded.text, confidence: decoded.confidence, bbox: box });
    }
    onProgress?.(35 + Math.round((i + 1) / boxes.length * 65));
  }

  const words = [];
  for(const line of lines){
    words.push(...paroleDaRiga(line.text, line.bbox, line.confidence));
  }
  return { text: lines.map(line => line.text).join("\n"), words };
}

// motore: "tesseract" | "paddle". onProgress(0-100) opzionale.
// Lancia un errore se il motore non riesce a partire (modello non scaricato,
// rete assente...): sta al chiamante decidere se proseguire senza.
export async function leggiConMotore(motore, file, onProgress){
  if(motore === "tesseract") return leggiTesseract(file, onProgress);
  if(motore === "paddle") return leggiPaddle(file, onProgress);
  const e = new Error(`Motore OCR "${motore}" non disponibile.`);
  e.isMotoreNonDisponibile = true;
  throw e;
}
