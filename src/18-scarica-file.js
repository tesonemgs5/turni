import { Capacitor } from "@capacitor/core";

// Salva/condivide un file di testo.
// - APK (Android): il vecchio metodo <a download> in WebView non fa NIENTE. Si scrive il file
//   nella cache dell'app e si apre il foglio di condivisione di Android (Salva su Drive/File,
//   WhatsApp, e-mail...).
// - Web: download normale del browser.
// Ritorna sempre { ok, errore? }: non lancia mai eccezioni.
export async function scaricaFileTesto(nomeFile, testo) {
  let nativo = false;
  try { nativo = Capacitor.isNativePlatform(); } catch (e) { /* web */ }
  if (nativo) {
    try {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const r = await Filesystem.writeFile({
        path: nomeFile, data: testo, directory: Directory.Cache, encoding: Encoding.UTF8,
      });
      await Share.share({ title: nomeFile, dialogTitle: "Salva o condividi il file", url: r.uri });
      return { ok: true };
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/cancel|dismiss/i.test(msg)) return { ok: true }; // l'utente ha chiuso il foglio di condivisione
      return { ok: false, errore: msg };
    }
  }
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
