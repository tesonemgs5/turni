// ─────────────────────────────────────────────────────────────────────────────
// Documenti allegati agli eventi: copie di PROMEMORIA, solo sul telefono.
//  - I file stanno nella memoria privata dell'app (Filesystem, Directory.Data).
//  - L'elenco degli allegati sta in localStorage ("turni_documenti_v1"), separato
//    dagli eventi: non tocca Supabase, la sincronizzazione ne' i backup.
//  - Ogni documento scade 4 mesi dopo la DATA DELL'EVENTO e viene cancellato in
//    automatico (pulisciDocumenti, chiamata all'avvio dell'app).
// ─────────────────────────────────────────────────────────────────────────────

const CHIAVE = "turni_documenti_v1";
const CARTELLA = "documenti";
export const MESI_VALIDITA = 4;
export const MAX_BYTES = 25 * 1024 * 1024;
// Un documento senza evento viene considerato "orfano" solo dopo questo tempo,
// per non cancellare nulla durante sincronizzazioni o form ancora aperti.
export const GIORNI_ATTESA_ORFANI = 30;

// ── Logica pura (testata in tests/documenti.test.js) ────────────────────────

export function nomeSicuro(nome) {
  const base = String(nome || "documento").normalize("NFC");
  const pulito = base.replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/\s+/g, " ").trim();
  return (pulito || "documento").slice(0, 80);
}

function giorniNelMese(anno, mese0) {
  return new Date(Date.UTC(anno, mese0 + 1, 0)).getUTCDate();
}

// "YYYY-MM-DD" + N mesi (il giorno si accorcia se il mese di arrivo e' piu' corto).
export function scadenzaDa(dateKey, mesi = MESI_VALIDITA) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!m) return null;
  const anno = Number(m[1]);
  const mese0 = Number(m[2]) - 1;
  const giorno = Number(m[3]);
  const tot = mese0 + mesi;
  const annoFine = anno + Math.floor(tot / 12);
  const meseFine0 = ((tot % 12) + 12) % 12;
  const giornoFine = Math.min(giorno, giorniNelMese(annoFine, meseFine0));
  const p = (n) => String(n).padStart(2, "0");
  return `${annoFine}-${p(meseFine0 + 1)}-${p(giornoFine)}`;
}

export function dataISO(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Id dei documenti da cancellare: scaduti (scade < oggi) oppure orfani da piu' di
// GIORNI_ATTESA_ORFANI giorni. Se non si conoscono gli eventi presenti (null o
// vuoto) non si cancella mai nulla per "orfano".
export function documentiDaPulire(elenco, oggiISO, idEventiPresenti, adessoMs) {
  const soglia = GIORNI_ATTESA_ORFANI * 24 * 60 * 60 * 1000;
  const conosco = idEventiPresenti && idEventiPresenti.size > 0;
  const ids = [];
  for (const d of elenco || []) {
    if (!d || !d.id) continue;
    const scaduto = d.scade && d.scade < oggiISO;
    const orfano = conosco && !idEventiPresenti.has(d.eventId) && adessoMs - (d.creato || 0) > soglia;
    if (scaduto || orfano) ids.push(d.id);
  }
  return ids;
}

export function idEventiDaStore(store) {
  const ids = new Set();
  const eventi = (store && store.events) || {};
  for (const dKey of Object.keys(eventi)) {
    const perCal = eventi[dKey] || {};
    for (const cId of Object.keys(perCal)) {
      for (const e of perCal[cId] || []) if (e && e.id) ids.add(e.id);
    }
  }
  return ids;
}

// ── Elenco in memoria + localStorage ────────────────────────────────────────

let cache = null;
const ascoltatori = new Set();

function leggi() {
  if (cache) return cache;
  let v = [];
  try {
    v = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(CHIAVE)) || "[]");
  } catch (e) { v = []; }
  cache = Array.isArray(v) ? v : [];
  return cache;
}

function scrivi(nuovo) {
  cache = nuovo;
  try { if (typeof localStorage !== "undefined") localStorage.setItem(CHIAVE, JSON.stringify(nuovo)); } catch (e) { /* spazio esaurito: resta in memoria */ }
  ascoltatori.forEach((f) => { try { f(); } catch (e) { /* ignora */ } });
}

export function sottoscrivi(f) {
  ascoltatori.add(f);
  return () => ascoltatori.delete(f);
}

export function documentiEvento(eventId) {
  if (!eventId) return [];
  return leggi().filter((d) => d.eventId === eventId).sort((a, b) => (a.creato || 0) - (b.creato || 0));
}

export function haDocumenti(eventId) {
  if (!eventId) return false;
  return leggi().some((d) => d.eventId === eventId);
}

// ── File (Filesystem di Capacitor: funziona su telefono e anche sul web) ────

function leggiBase64(file) {
  return new Promise((risolvi, rifiuta) => {
    const r = new FileReader();
    r.onload = () => risolvi(String(r.result || "").split(",")[1] || "");
    r.onerror = () => rifiuta(new Error("Lettura del file non riuscita"));
    r.readAsDataURL(file);
  });
}

function messaggio(e) {
  return String((e && e.message) || e);
}

export async function aggiungiDocumento({ eventId, dateKey, file }) {
  try {
    if (!eventId || !dateKey || !file) return { ok: false, errore: "Dati mancanti" };
    if (file.size > MAX_BYTES) return { ok: false, errore: "File troppo grande (massimo 25 MB)" };
    const base64 = await leggiBase64(file);
    const id = "doc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const nome = nomeSicuro(file.name);
    const path = `${CARTELLA}/${id}-${nome}`;
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
    const doc = {
      id, eventId, dateKey, nome: file.name || nome, path,
      mime: file.type || "", size: file.size || 0,
      creato: Date.now(), scade: scadenzaDa(dateKey),
    };
    scrivi([...leggi(), doc]);
    return { ok: true, doc };
  } catch (e) {
    return { ok: false, errore: messaggio(e) };
  }
}

async function cancellaFile(path) {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch (e) { /* file gia' assente: va bene */ }
}

export async function eliminaDocumento(id) {
  const d = leggi().find((x) => x.id === id);
  if (!d) return { ok: true };
  await cancellaFile(d.path);
  scrivi(leggi().filter((x) => x.id !== id));
  return { ok: true };
}

export async function eliminaDocumentiEvento(eventId) {
  const daTogliere = leggi().filter((d) => d.eventId === eventId);
  if (daTogliere.length === 0) return 0;
  for (const d of daTogliere) await cancellaFile(d.path);
  scrivi(leggi().filter((d) => d.eventId !== eventId));
  return daTogliere.length;
}

// Invia il documento (mail o altre app) col menu di condivisione di Android.
// Sul web scarica il file.
export async function inviaDocumento(id) {
  try {
    const d = leggi().find((x) => x.id === id);
    if (!d) return { ok: false, errore: "Documento non trovato" };
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      const r = await Filesystem.readFile({ path: d.path, directory: Directory.Data });
      const blob = typeof r.data === "string"
        ? await (await fetch(`data:${d.mime || "application/octet-stream"};base64,${r.data}`)).blob()
        : r.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = d.nome;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { ok: true };
    }
    // Android: la condivisione legge dalla cache, quindi si fa una copia temporanea.
    const copia = `invio-${d.id}-${nomeSicuro(d.nome)}`;
    try { await Filesystem.deleteFile({ path: copia, directory: Directory.Cache }); } catch (e) { /* non c'era */ }
    await Filesystem.copy({ from: d.path, directory: Directory.Data, to: copia, toDirectory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: copia, directory: Directory.Cache });
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: d.nome, dialogTitle: "Invia documento", url: uri });
    return { ok: true };
  } catch (e) {
    const msg = messaggio(e);
    if (/cancel|dismiss/i.test(msg)) return { ok: true, annullato: true };
    return { ok: false, errore: msg };
  }
}

// Anteprima nell'app (solo immagini): ritorna un indirizzo mostrabile in <img>.
export async function anteprimaDocumento(id) {
  try {
    const d = leggi().find((x) => x.id === id);
    if (!d || !/^image\//.test(d.mime || "")) return null;
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const r = await Filesystem.readFile({ path: d.path, directory: Directory.Data });
    if (typeof r.data === "string") return `data:${d.mime};base64,${r.data}`;
    return URL.createObjectURL(r.data);
  } catch (e) {
    return null;
  }
}

// Pulizia: scaduti (4 mesi dalla data evento) e orfani da tempo.
export async function pulisciDocumenti(idEventiPresenti) {
  const ids = documentiDaPulire(leggi(), dataISO(Date.now()), idEventiPresenti, Date.now());
  if (ids.length === 0) return 0;
  const set = new Set(ids);
  for (const d of leggi()) if (set.has(d.id)) await cancellaFile(d.path);
  scrivi(leggi().filter((d) => !set.has(d.id)));
  return ids.length;
}
