// Flusso dell'aggiornamento dentro l'APK, come in DartPDF: piano (patch o APK intero),
// download nella cache dell'app (mai nella cartella Download), applicazione delle patch,
// installatore Android. Il lavoro pesante lo fa il plugin nativo TurniUpdate; qui si
// sceglie la strada e si racconta l'avanzamento alla finestra.
import {
  baseUrlCanale, urlCanale, pianificaAggiornamento, passiDaPiano, formatoMb, noteTraBuild, rigaTipoDaPiano,
} from "./36-aggiornamento-piano.js"

let plugin = null
async function pluginUpdate() {
  if (plugin) return { P: plugin }
  const { registerPlugin } = await import("@capacitor/core")
  plugin = registerPlugin("TurniUpdate")
  // Il proxy del plugin NON va restituito da una funzione async: la Promise proverebbe a chiamare
  // plugin.then() e Capacitor risponderebbe "TurniUpdate.then() is not implemented" (e il flusso
  // resterebbe fermo). Per questo lo si incapsula in un oggetto normale.
  return { P: plugin }
}

function conTempo(promessa, ms, messaggio) {
  let timer
  const scadenza = new Promise((_, no) => { timer = setTimeout(() => no(new Error(messaggio)), ms) })
  return Promise.race([promessa, scadenza]).finally(() => clearTimeout(timer))
}

// Chiamata al plugin nativo: prima il canale diretto (come widget e file, quello che nell'APK
// funziona sempre), poi registerPlugin. Con msMax una risposta che non arriva diventa un errore
// leggibile invece di una finestra bloccata.
async function chiama(metodo, opzioni, msMax) {
  const C = typeof window !== "undefined" ? window.Capacitor : null
  const lancia = C && typeof C.nativePromise === "function"
    ? C.nativePromise("TurniUpdate", metodo, opzioni || {})
    : pluginUpdate().then(({ P }) => P[metodo](opzioni || {}))
  return msMax ? conTempo(lancia, msMax, `Il telefono non risponde (${metodo})`) : lancia
}

function testoErrore(e) {
  return String((e && (e.message || e.errorMessage)) || e || "errore sconosciuto")
}

export async function annullaAggiornamentoApp() {
  try {
    await chiama("annullaAggiornamento", {}, 5000)
  } catch { /* niente da annullare */ }
}

// onStato(parziale): fase ("preparazione" | "scarico" | "applico" | "installatore"),
//   intestazione, passi [{etichetta,size}], fatti (quanti pezzi sono finiti), frazione 0..1 o null.
// scrivi(chiave, titolo, testo, dettagli): una riga nel Log (una chiave diversa per fase).
// Se qualcosa va storto lancia l'errore (il chiamante mostra "Aggiornamento non riuscito").
export async function eseguiAggiornamentoApp({ repo, buildInstallata, buildNuova, onStato, scrivi }) {
  let passi = []
  const dettaglio = testo => onStato({ dettaglio: testo })
  // Avanzamento in tempo reale: se il telefono non lo permette si va avanti senza (si vede
  // comunque l'elenco dei pezzi e la spunta a ogni pezzo finito).
  let ascolto = { remove: async () => {} }
  try {
    const { P } = await conTempo(pluginUpdate(), 5000, "plugin non pronto")
    ascolto = await conTempo(P.addListener("avanzamentoAggiornamento", e => {
    const tot = passi.reduce((s, p) => s + p.size, 0)
    const prima = passi.slice(0, e.indice).reduce((s, p) => s + p.size, 0)
    const questo = passi[e.indice] ? passi[e.indice].size : 0
    let dentro = questo
    if (e.fase === "scarico") {
      dentro = e.byteTotali > 0 && questo > 0
        ? Math.min(questo, questo * (e.byteLetti / e.byteTotali))
        : Math.min(questo, e.byteLetti || 0)
    }
    const pronto = e.fase === "pronto"
    const frazione = pronto ? 1 : (tot > 0 ? Math.max(0, Math.min(1, (prima + dentro) / tot)) : null)
    onStato({
      fase: pronto ? "installatore" : (e.fase === "scarico" ? "scarico" : "applico"),
      fatti: pronto ? passi.length : e.indice,
      frazione,
    })
  }), 5000, "ascolto dell'avanzamento non disponibile")
  } catch (e) {
    scrivi("avanzamento", "Aggiornamento: avanzamento non in tempo reale", testoErrore(e), [])
  }
  try {
    onStato({ fase: "preparazione", frazione: null, passi: [], fatti: 0, intestazione: null, errore: null, dettaglio: "leggo l'elenco delle patch" })
    const r = await chiama("leggiTesto", { url: urlCanale(repo, "patches.json") }, 20000)
    const manifest = JSON.parse(r.testo)
    let piano = pianificaAggiornamento(manifest, buildInstallata)
    if (!piano) {
      const cur = manifest && manifest.current && manifest.current.build
      throw new Error(cur && cur < buildNuova
        ? `Le patch sono ancora alla build ${cur}: riprova tra qualche minuto`
        : "Nessun aggiornamento da installare")
    }
    let ripiegato = false
    for (;;) {
      passi = passiDaPiano(piano)
      const intestazione = `Aggiorno dalla build ${buildInstallata} alla ${piano.target.build}`
      onStato({ fase: "preparazione", intestazione, passi, fatti: 0, frazione: null })
      scrivi("avviato", "Aggiornamento avviato",
        `${intestazione}: ${piano.usaBase ? "APK base e patch" : "solo patch"}, circa ${formatoMb(piano.byte)} MB.`,
        passi.map(p => `${p.etichetta}: ${formatoMb(p.size)} MB`))
      try {
        dettaglio("scarico e applico le patch")
        await chiama("eseguiAggiornamento", {
          baseUrl: baseUrlCanale(repo),
          passi,
          partenza: piano.usaBase ? "base" : "installata",
          shaBase: piano.base ? piano.base.sha256 || "" : "",
          shaFinale: piano.target.sha256,
        })
        break
      } catch (e) {
        const m = testoErrore(e)
        // L'APK installato non e' quello da cui parte la patch: si riparte dalla base.
        if (!piano.usaBase && !ripiegato && /non coincide|non adatta/i.test(m)) {
          ripiegato = true
          const altro = pianificaAggiornamento(manifest, buildInstallata, { forzaCompleto: true })
          if (altro) {
            scrivi("ripiego", "Aggiornamento: riparto dall'APK base",
              "L'APK installato non coincide con quello delle patch: scarico l'APK base e applico le patch da lì.", [m])
            piano = altro
            continue
          }
        }
        throw e
      }
    }
    onStato({ fase: "installatore", fatti: passi.length, frazione: 1 })
    scrivi("scaricato", "Aggiornamento scaricato",
      "Scaricato nella cache dell'app e verificato: apertura del programma di installazione Android.",
      passi.map(p => `${p.etichetta}: ${formatoMb(p.size)} MB`))
  } finally {
    try { await ascolto.remove() } catch { /* gia' rimosso */ }
  }
}

// Per il popup "nuova versione": elenco delle patch da scaricare (con MB) e novita' di tutte
// le build tra quella installata e quella nuova. Ogni parte e' facoltativa: se manca, il popup
// usa le note della release.
export async function leggiDettagliAggiornamento({ repo, buildInstallata, buildNuova }) {
  const fuori = { passi: [], rigaTipo: null, note: [] }
  const leggi = async nome => {
    const r = await chiama("leggiTesto", { url: urlCanale(repo, nome) }, 8000)
    return JSON.parse(r.testo)
  }
  try {
    const piano = pianificaAggiornamento(await leggi("patches.json"), buildInstallata)
    if (piano) {
      fuori.passi = passiDaPiano(piano)
      fuori.rigaTipo = rigaTipoDaPiano(piano)
    }
  } catch { /* elenco non disponibile */ }
  try {
    fuori.note = noteTraBuild(await leggi("note.json"), buildInstallata, buildNuova)
  } catch { /* note per build non disponibili */ }
  return fuori
}
