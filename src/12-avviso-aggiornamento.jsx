import { useEffect, useState } from "react"

// Aggiornamento dell'APK: pop-up "nuova versione disponibile".
// Si sceglie in Impostazioni -> Aggiornamenti app quando controllare:
//  - "ogni"    (predefinita): all'avvio e ogni volta che l'app torna in primo piano
//              (tocchi l'icona, anche se era gia' aperta), al massimo 1 richiesta al minuto;
//  - "avvio"   : solo quando l'app parte da zero (era chiusa del tutto);
//  - "manuale" : mai in automatico, solo col pulsante "Controlla aggiornamenti ora".
// In "ogni" e "avvio", se manca il segnale riprova una volta appena torna.
// Nessun timer e nessun controllo in background: costo batteria trascurabile.
// "Dopo" chiude il pop-up; te lo ripropone al prossimo controllo.
// Non fa nulla su web/PWA/Electron: tutto vale solo dentro l'APK.
const REPO = "tesonemgs5/turni"
const APK_URL = `https://github.com/${REPO}/releases/latest/download/turni.apk`
const PAUSA_MIN_MS = 60 * 1000   // evita controlli doppi ravvicinati
const CHIAVE_MODO = "turnipm_aggiornamenti_modo"
const MODI = ["ogni", "avvio", "manuale"]

export function inApk() {
  try {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform())
  } catch { return false }
}
export function leggiModo() {
  try {
    const m = localStorage.getItem(CHIAVE_MODO)
    return MODI.includes(m) ? m : "ogni"
  } catch { return "ogni" }
}
function salvaModo(m) {
  try { localStorage.setItem(CHIAVE_MODO, m) } catch { /* non bloccante */ }
}
function versioneInstallata() {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null
}
function parti(v) { return String(v || "").replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0) }
function piuNuova(a, b) { // true se a > b
  const x = parti(a), y = parti(b)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

// Stato condiviso tra il pop-up e la pagina Impostazioni
let mostraPopup = null   // la registra il componente AvvisoAggiornamento
let inVolo = null        // controllo in corso (evita richieste doppie)
let ultimo = 0           // quando e' riuscito l'ultimo controllo
let daRiprovare = false  // l'ultimo tentativo e' fallito (niente segnale / errore)

// Esito: "nuova" | "aggiornato" | "errore" | "saltato"
export function controllaAggiornamenti({ forza = false } = {}) {
  if (inVolo) return inVolo
  const corrente = versioneInstallata()
  if (!corrente) return Promise.resolve({ esito: "errore" })
  if (!forza && Date.now() - ultimo < PAUSA_MIN_MS) return Promise.resolve({ esito: "saltato" })
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    daRiprovare = true
    return Promise.resolve({ esito: "errore" })
  }
  inVolo = (async () => {
    const ctrl = new AbortController()
    const stop = setTimeout(() => ctrl.abort(), 10000)
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store",
        signal: ctrl.signal,
      })
      if (!r.ok) throw new Error("http " + r.status)
      const dati = await r.json()
      ultimo = Date.now()
      daRiprovare = false
      const versione = String(dati.tag_name || "").replace(/^v/, "")
      if (versione && piuNuova(versione, corrente)) {
        if (mostraPopup) mostraPopup(versione)
        return { esito: "nuova", versione }
      }
      return { esito: "aggiornato", versione: corrente }
    } catch {
      daRiprovare = true   // riprova al ritorno del segnale o alla prossima apertura
      return { esito: "errore" }
    } finally {
      clearTimeout(stop)
      inVolo = null
    }
  })()
  return inVolo
}

export default function AvvisoAggiornamento() {
  const [nuova, setNuova] = useState(null)

  useEffect(() => {
    if (!inApk()) return
    const setter = v => setNuova(v)
    mostraPopup = setter

    if (leggiModo() !== "manuale") controllaAggiornamenti({ forza: true })   // all'avvio
    const onVis = () => {                                                      // app riaperta
      if (document.visibilityState === "visible" && leggiModo() === "ogni") controllaAggiornamenti({ forza: false })
    }
    const onOnline = () => {                                                   // torna il segnale
      if (daRiprovare && leggiModo() !== "manuale") controllaAggiornamenti({ forza: true })
    }
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("online", onOnline)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("online", onOnline)
      if (mostraPopup === setter) mostraPopup = null
    }
  }, [])

  if (!nuova) return null
  const corrente = versioneInstallata() || ""
  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#1e293b",border:"1px solid #3b82f6",borderRadius:16,color:"#f1f5f9",
        width:"100%",maxWidth:360,padding:"22px 20px",textAlign:"center",
        boxShadow:"0 10px 40px rgba(0,0,0,0.5)"}}>
        <div style={{fontSize:34,marginBottom:6}}>🔔</div>
        <div style={{fontSize:17,fontWeight:800,marginBottom:8}}>Nuova versione disponibile</div>
        <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.5,marginBottom:18}}>
          Versione <b>{nuova}</b>{corrente ? <> (installata: {corrente})</> : null}.<br/>
          Vuoi scaricarla ora?
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={() => setNuova(null)}
            style={{flex:1,background:"#334155",border:"none",borderRadius:10,color:"#e2e8f0",
              padding:"12px 0",fontWeight:700,fontSize:14}}>Dopo</button>
          <button onClick={() => { window.location.href = APK_URL }}
            style={{flex:1,background:"#3b82f6",border:"none",borderRadius:10,color:"#fff",
              padding:"12px 0",fontWeight:800,fontSize:14}}>Scarica ora</button>
        </div>
      </div>
    </div>
  )
}

// Contenuto della sezione "AGGIORNAMENTI APP" nelle Impostazioni
const OPZIONI = [
  ["ogni", "A ogni apertura", "Controlla ogni volta che apri l'app o la riporti in primo piano. Consigliata."],
  ["avvio", "Solo all'avvio da zero", "Controlla solo quando l'app parte da chiusa del tutto."],
  ["manuale", "Solo manuale", "Nessun controllo automatico: usi il pulsante qui sotto."],
]

export function ImpostazioniAggiornamenti({ T }) {
  const [modo, setModo] = useState(leggiModo())
  const [attesa, setAttesa] = useState(false)
  const [stato, setStato] = useState(null)   // { ok: bool, testo: string }

  function scegli(m) {
    salvaModo(m)
    setModo(m)
  }
  async function controllaOra() {
    setAttesa(true)
    setStato(null)
    const r = await controllaAggiornamenti({ forza: true })
    setAttesa(false)
    if (r.esito === "nuova") setStato({ ok: true, testo: `🔔 Nuova versione disponibile: ${r.versione}` })
    else if (r.esito === "aggiornato") setStato({ ok: true, testo: "✅ Sei aggiornato" })
    else setStato({ ok: false, testo: "❌ Non riesco a controllare: verifica la connessione e riprova" })
  }

  return (
    <div>
      <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
        Scegli quando l'app controlla se c'e' una versione nuova. Se c'e', compare un pop-up con
        "Scarica ora" oppure "Dopo". Versione installata: <b>{versioneInstallata() || "dev"}</b>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
        {OPZIONI.map(([v, titolo, sub]) => {
          const attiva = modo === v
          return (
            <button key={v} onClick={() => scegli(v)}
              style={{textAlign:"left",padding:"10px 12px",borderRadius:10,cursor:"pointer",
                background: attiva ? "#6366f1" : T.s2,
                color: attiva ? "#fff" : T.text,
                border: `2px solid ${attiva ? "#6366f1" : T.border}`}}>
              <div style={{fontWeight:800,fontSize:12}}>{attiva ? "● " : "○ "}{titolo}</div>
              <div style={{fontSize:10.5,marginTop:2,opacity:attiva ? 0.9 : 0.75}}>{sub}</div>
            </button>
          )
        })}
      </div>
      <button onClick={controllaOra} disabled={attesa}
        style={{width:"100%",background:"none",border:"1px solid #3b82f6",borderRadius:10,color:"#3b82f6",
          padding:"10px 0",fontWeight:800,fontSize:12,cursor:"pointer",opacity:attesa ? 0.6 : 1}}>
        {attesa ? "⏳ Controllo in corso..." : "🔄 Controlla aggiornamenti ora"}
      </button>
      {stato && (
        <div style={{fontSize:12,marginTop:10,textAlign:"center",fontWeight:700,
          color: stato.ok ? "#22c55e" : "#ef4444"}}>{stato.testo}</div>
      )}
    </div>
  )
}
