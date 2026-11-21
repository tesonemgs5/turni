// Piano dell'aggiornamento con patch. Porta di planUpdate di DartPDF
// (app/lib/patch_manifest.dart): sceglie la strada che scarica meno.
// Modulo puro: niente browser, niente plugin (si prova con node --test).

export const CANALE = "canale-aggiornamenti"

export function baseUrlCanale(repo) {
  return `https://github.com/${repo}/releases/download/${CANALE}/`
}

export function urlCanale(repo, nome) {
  return baseUrlCanale(repo) + nome
}

// Dimensione come nella finestra di DartPDF: una cifra decimale ("5.2 MB").
export function formatoMb(byte) {
  return (Number(byte || 0) / (1024 * 1024)).toFixed(1)
}

// Strada piu' leggera per portare l'app dalla build installata a quella corrente:
// le patch dalla build installata (se c'e' una catena continua e pesa meno
// dell'APK base con le sue patch), altrimenti la base piu' le patch che da li'
// arrivano alla build corrente. Con forzaCompleto parte sempre dalla base.
// null se non c'e' niente da fare o nessuna strada.
export function pianificaAggiornamento(manifest, buildInstallata, { forzaCompleto = false } = {}) {
  const corrente = manifest && manifest.current
  if (!corrente || !Number.isFinite(Number(corrente.build))) return null
  const installata = Number(buildInstallata) || 0
  if (!forzaCompleto && installata >= corrente.build) return null

  const archi = Array.isArray(manifest.patches) ? manifest.patches : []
  const catena = da => {
    const out = []
    let b = da
    while (b !== corrente.build) {
      const e = archi.find(x => x.from === b)
      if (!e || out.length > 200) return null
      out.push(e)
      b = e.to
    }
    return out
  }
  const somma = lista => lista.reduce((s, e) => s + (Number(e.size) || 0), 0)

  let viaPatch = null
  if (!forzaCompleto) {
    const c = catena(installata)
    if (c && c.length > 0) {
      viaPatch = { usaBase: false, base: manifest.base, target: corrente, patch: c, byte: somma(c) }
    }
  }
  let viaBase = null
  const base = manifest.base
  const cb = base && base.asset ? catena(base.build) : null
  if (cb && base.asset) {
    viaBase = { usaBase: true, base, target: corrente, patch: cb, byte: (Number(base.size) || 0) + somma(cb) }
  }
  if (viaPatch && (!viaBase || viaPatch.byte < viaBase.byte)) return viaPatch
  return viaBase
}

// Pezzi da scaricare, nell'ordine, con etichetta e dimensione (come nella lista di DartPDF).
export function passiDaPiano(piano) {
  const passi = []
  if (piano.usaBase) {
    passi.push({
      tipo: "base", etichetta: `APK base (build ${piano.base.build})`,
      asset: piano.base.asset, size: Number(piano.base.size) || 0,
    })
  }
  for (const e of piano.patch) {
    passi.push({
      tipo: "patch", etichetta: `Patch ${e.from} \u2192 ${e.to}`,
      asset: e.asset, size: Number(e.size) || 0,
      from_sha: e.from_sha || "", to_sha: e.to_sha || "",
    })
  }
  return passi
}

// Il corpo della release scritto dal workflow: novita' (una per riga), la riga
// "Aggiornamento: patch, circa N MB" (o "completo, ... perche' ...") e marcatori.
export function leggiBodyRelease(body) {
  const testo = String(body || "")
  const m = testo.match(/<!--\s*update-kind:\s*(patch|full)\s*-->/i)
  const tipo = m ? m[1].toLowerCase() : null
  const mb = testo.match(/<!--\s*app-build:\s*(\d+)\s*-->/i)
  let rigaTipo = null
  const note = []
  for (const riga of testo.replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
    const t = riga.trim()
    if (!t) continue
    if (/^Aggiornamento:/i.test(t)) { rigaTipo = t; continue }
    if (/^Tipo aggiornamento:/i.test(t) || /^Build automatica/i.test(t)) continue
    note.push(riga.replace(/\s+$/, "").replace(/^(\s*)[\u2022]/, "$1-").replace(/^(\s*)\u2013/, "$1-"))
  }
  if (!rigaTipo && tipo) rigaTipo = tipo === "patch" ? "Aggiornamento: patch" : "Aggiornamento: completo"
  return { note, rigaTipo, tipo, build: mb ? Number(mb[1]) : null }
}

// Novita' di TUTTE le build tra quella installata e quella nuova (la piu' recente per prima),
// lette da note.json del canale: cosi' chi salta una build vede anche cosa e' cambiato in quella.
export function noteTraBuild(voci, buildInstallata, buildNuova) {
  const da = Number(buildInstallata) || 0
  const a = Number(buildNuova) || 0
  const scelte = (Array.isArray(voci) ? voci : [])
    .filter(v => Number(v.build) > da && Number(v.build) <= a && String(v.note || "").trim())
    .sort((x, y) => Number(y.build) - Number(x.build))
  const righe = []
  for (const v of scelte) {
    if (scelte.length > 1) righe.push(`Build #${v.build}`)
    for (const r of String(v.note).split("\n")) {
      if (!r.trim()) continue
      righe.push(r.replace(/\s+$/, "").replace(/^(\s*)[\u2022]/, "$1-").replace(/^(\s*)\u2013/, "$1-"))
    }
  }
  return righe
}

// Riga "Aggiornamento: ..." calcolata sul piano reale (tutte le patch da scaricare, non solo l'ultima).
export function rigaTipoDaPiano(piano) {
  const mb = formatoMb(piano.byte)
  return piano.usaBase
    ? `Aggiornamento: APK base e patch, circa ${mb} MB`
    : `Aggiornamento: patch, circa ${mb} MB`
}
