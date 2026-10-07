import { useEffect, useState } from "react"

// Avviso "nuova versione disponibile" per l'APK. Controlla l'ultima release
// su GitHub; se e' piu' nuova di quella installata mostra un banner con il
// pulsante per scaricare l'APK. Non fa nulla su web/PWA/Electron.
const REPO = "tesonemgs5/turni"
const APK_URL = `https://github.com/${REPO}/releases/latest/download/turni.apk`
const INTERVALLO_MS = 30 * 60 * 1000

function inApk() {
  try {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform())
  } catch { return false }
}
function parti(v) { return String(v || "").replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0) }
function piuNuova(a, b) { // true se a > b
  const x = parti(a), y = parti(b)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

export default function AvvisoAggiornamento() {
  const [nuova, setNuova] = useState(null)

  useEffect(() => {
    if (!inApk()) return
    const corrente = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null
    if (!corrente) return

    async function controlla(forza) {
      try {
        const ultimo = Number(localStorage.getItem("turnipm_upd_check") || 0)
        if (!forza && Date.now() - ultimo < INTERVALLO_MS) return
        const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: "application/vnd.github+json" },
        })
        if (!r.ok) return
        const dati = await r.json()
        localStorage.setItem("turnipm_upd_check", String(Date.now()))
        const versione = String(dati.tag_name || "").replace(/^v/, "")
        if (!versione || !piuNuova(versione, corrente)) return
        if (localStorage.getItem("turnipm_upd_ignora") === versione) return
        setNuova(versione)
      } catch { /* offline: nessun avviso */ }
    }

    controlla(true)
    const onVis = () => { if (document.visibilityState === "visible") controlla(false) }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  if (!nuova) return null
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:"#1e293b",
      borderBottom:"1px solid #3b82f6",color:"#f1f5f9",fontSize:13,
      padding:"calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
      display:"flex",alignItems:"center",gap:10}}>
      <div style={{flex:1}}>🔔 Nuova versione disponibile: <b>{nuova}</b></div>
      <button onClick={() => { window.location.href = APK_URL }}
        style={{background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",
          padding:"8px 12px",fontWeight:800,fontSize:12}}>Scarica</button>
      <button onClick={() => { try { localStorage.setItem("turnipm_upd_ignora", nuova) } catch {} setNuova(null) }}
        style={{background:"none",border:"none",color:"#94a3b8",fontSize:12}}>Dopo</button>
    </div>
  )
}
