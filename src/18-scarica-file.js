import { Capacitor, registerPlugin } from "@capacitor/core";

// ─────────────────────────────────────────────────────────────────────────────
// Punto UNICO per scaricare/salvare un file di testo (usato da tutti i "scarica").
//  - Web: download normale del browser.
//  - APK Android: <a download> in WebView non fa nulla, quindi si apre un dialogo
//    (19-dialogo-scarica.jsx) con: salva nella cartella scelta, salva con nome,
//    condividi. Se per qualche motivo il dialogo non e' montato, si ripiega sulla
//    condivisione.
// scaricaFileTesto ritorna sempre { ok, annullato?, errore? } e non lancia mai.
// ─────────────────────────────────────────────────────────────────────────────

export function inNativo() {
  try { return Capacitor.isNativePlatform(); } catch (e) { return false; }
}

function scaricaWeb(nomeFile, testo) {
  try {
    const blob = new Blob([testo], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nomeFile;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: String((e && e.message) || e) };
  }
}

// Chiamata al plugin nativo "TurniFile" (stesso canale diretto usato dal widget).
let _plugin = null;
async function chiamaNativo(metodo, opzioni) {
  const C = typeof window !== "undefined" ? window.Capacitor : null;
  if (C && typeof C.nativePromise === "function") return await C.nativePromise("TurniFile", metodo, opzioni || {});
  if (!_plugin) _plugin = registerPlugin("TurniFile");
  return await _plugin[metodo](opzioni || {});
}

function esito(e) {
  const msg = String((e && e.message) || e);
  return { ok: false, errore: msg };
}

export async function infoCartella() {
  try { return await chiamaNativo("infoCartella"); } catch (e) { return { presente: false }; }
}
export async function scegliCartella() {
  try { return await chiamaNativo("scegliCartella"); } catch (e) { return esito(e); }
}
export async function dimenticaCartella() {
  try { await chiamaNativo("dimenticaCartella"); return { ok: true }; } catch (e) { return esito(e); }
}
export async function salvaInCartella(nome, testo) {
  try { return await chiamaNativo("salvaInCartella", { nome, dati: testo, mime: "application/json" }); } catch (e) { return esito(e); }
}
export async function salvaConNome(nome, testo) {
  try { return await chiamaNativo("salvaConNome", { nome, dati: testo, mime: "application/json" }); } catch (e) { return esito(e); }
}
export async function condividi(nome, testo) {
  try {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const r = await Filesystem.writeFile({ path: nome, data: testo, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: nome, dialogTitle: "Salva o condividi il file", url: r.uri });
    return { ok: true };
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/cancel|dismiss/i.test(msg)) return { ok: true, annullato: true };
    return { ok: false, errore: msg };
  }
}

export function scaricaFileTesto(nomeFile, testo) {
  if (!inNativo()) return Promise.resolve(scaricaWeb(nomeFile, testo));
  return new Promise(risolvi => {
    const ev = new CustomEvent("turni-scarica", { detail: { nome: nomeFile, testo, risolvi, gestito: false } });
    window.dispatchEvent(ev);
    if (!ev.detail.gestito) condividi(nomeFile, testo).then(risolvi);
  });
}
