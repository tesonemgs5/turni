import { useEffect, useRef, useState } from "react"
import AGGIORNAMENTI_APP from "./aggiornamenti.json"

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
const CHIAVE_IGNORA = "turnipm_aggiornamenti_ignora"   // versione per cui non chiedere piu'
function versioneIgnorata() {
  try { return localStorage.getItem(CHIAVE_IGNORA) || "" } catch { return "" }
}
function ignoraVersione(v) {
  try { localStorage.setItem(CHIAVE_IGNORA, v) } catch { /* non bloccante */ }
}
const CHIAVE_NOTE = "turnipm_note_da_fare"   // note libere dell'utente (cose da fare)
function leggiNote() {
  try { return localStorage.getItem(CHIAVE_NOTE) || "" } catch { return "" }
}
function salvaNote(t) {
  try { localStorage.setItem(CHIAVE_NOTE, t) } catch { /* non bloccante */ }
}

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
// Versione completa mostrata all'utente: stessa stringa di Impostazioni (es. 6.286.2151#1028)
function versioneCompleta() {
  const v = versioneInstallata()
  if (!v) return null
  const n = typeof __BUILD_NUM__ !== "undefined" ? __BUILD_NUM__ : ""
  return n ? `${v}#${n}` : v
}
function parti(v) { return String(v || "").replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0) }
function piuNuova(a, b) { // true se a > b
  const x = parti(a), y = parti(b)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

// Le note della release contengono l'elenco delle novità (scritto dal workflow
// da src/aggiornamenti.json), la riga «Build automatica...» e un marcatore interno.
function noteDaRelease(body) {
  return String(body || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter(r => !/^Build automatica/i.test(r.trim()))
    .join("\n")
    .trim()
}

// Stato condiviso tra il pop-up e la pagina Impostazioni
let mostraPopup = null   // la registra il componente AvvisoAggiornamento
let inVolo = null        // controllo in corso (evita richieste doppie)
let ultimo = 0           // quando e' riuscito l'ultimo controllo
let daRiprovare = false  // l'ultimo tentativo e' fallito (niente segnale / errore)

// Esito: "nuova" | "aggiornato" | "errore" | "saltato"
export function controllaAggiornamenti({ forza = false, mostraSempre = false } = {}) {
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
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest?_=${Date.now()}`, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store",
        signal: ctrl.signal,
      })
      if (!r.ok) throw new Error("http " + r.status)
      const dati = await r.json()
      ultimo = Date.now()
      daRiprovare = false
      // Il tag e' "6.310.0105#230" (versione#build); si accetta anche il vecchio "v6.310.0105".
      const tag = String(dati.tag_name || "").replace(/^v/, "")
      const versione = tag.split("#")[0]
      const numBuild = (String(dati.name || "").match(/#(\d+)/) || tag.match(/#(\d+)/) || [])[1]
      const versioneMostrata = numBuild ? `${versione}#${numBuild}` : versione
      if (versione && piuNuova(versione, corrente)) {
        if (mostraPopup && (mostraSempre || versioneIgnorata() !== versioneMostrata)) mostraPopup({ versione: versioneMostrata, note: noteDaRelease(dati.body) })
        return { esito: "nuova", versione: versioneMostrata }
      }
      return { esito: "aggiornato", versione: versioneCompleta() || corrente }
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
  const corrente = versioneCompleta() || ""
  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#1e293b",border:"1px solid #3b82f6",borderRadius:16,color:"#f1f5f9",
        width:"100%",maxWidth:360,padding:"22px 20px",textAlign:"center",
        boxShadow:"0 10px 40px rgba(0,0,0,0.5)"}}>
        <div style={{fontSize:34,marginBottom:6}}>🔔</div>
        <div style={{fontSize:17,fontWeight:800,marginBottom:8}}>Nuova versione disponibile</div>
        <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.5,marginBottom:18}}>
          Versione <b>{nuova.versione}</b>{corrente ? <> (installata: {corrente})</> : null}.<br/>
          Vuoi scaricarla ora?
        </div>
        {nuova.note ? (
          <div style={{textAlign:"left",marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:800,marginBottom:4}}>Cosa cambia</div>
            <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.45,whiteSpace:"pre-wrap",
              maxHeight:200,overflowY:"auto",background:"#0f172a",borderRadius:10,padding:"8px 10px"}}>
              {nuova.note}
            </div>
          </div>
        ) : null}
        <div style={{display:"flex",gap:10}}>
          <button onClick={() => setNuova(null)}
            style={{flex:1,background:"#334155",border:"none",borderRadius:10,color:"#e2e8f0",
              padding:"12px 0",fontWeight:700,fontSize:14}}>Dopo</button>
          <button onClick={() => { window.location.href = APK_URL }}
            style={{flex:1,background:"#3b82f6",border:"none",borderRadius:10,color:"#fff",
              padding:"12px 0",fontWeight:800,fontSize:14}}>Scarica ora</button>
        </div>
        <button onClick={() => { ignoraVersione(nuova.versione); setNuova(null) }}
          style={{width:"100%",marginTop:10,background:"none",border:"1px solid #475569",borderRadius:10,color:"#94a3b8",
            padding:"10px 0",fontWeight:700,fontSize:12}}>Non chiedere più per questa versione</button>
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

// Stato di test e build letto da GitHub (repository pubblico): l'ultima build APK completata
// e l'esito dei test automatici (workflow CI) sullo stesso commit.
const API = `https://api.github.com/repos/${REPO}/actions`
// Versione che avra' la build, calcolata come in fase di build: A.GGG.HHMM (ora italiana del commit).
function versioneDaData(iso) {
  const p = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date(iso)).reduce((a, x) => { a[x.type] = x.value; return a }, {})
  const g = Math.floor((Date.UTC(+p.year, +p.month - 1, +p.day) - Date.UTC(+p.year, 0, 1)) / 86400000) + 1
  return `${p.year.slice(-1)}.${g}.${p.hour === "24" ? "00" : p.hour}${p.minute}`
}
async function leggiStatoBuild() {
  // Build e test (CI) hanno tempi diversi: si legge l'ULTIMO run di ciascun workflow, con il suo stato reale.
  const [rb, rc] = await Promise.all([
    fetch(`${API}/workflows/build-apk.yml/runs?branch=master&per_page=8&_=${Date.now()}`, { cache: "no-store" }),
    fetch(`${API}/workflows/ci.yml/runs?branch=master&per_page=1&_=${Date.now()}`, { cache: "no-store" }),
  ])
  const runsBuild = (await rb.json()).workflow_runs || []
  const runCi = (await rc.json()).workflow_runs?.[0] || null
  const b = runsBuild[0] || null
  if (!b && !runCi) return null
  const build = b ? {
    n: b.run_number, stato: b.status, esito: b.conclusion,
    versione: versioneDaData(b.head_commit?.timestamp || b.created_at),
  } : null
  const test = runCi ? {
    stato: runCi.status, esito: runCi.conclusion,
    // build a cui si riferiscono i test: quella dello stesso commit
    buildN: runsBuild.find(x => x.head_sha === runCi.head_sha)?.run_number || null,
    sha: String(runCi.head_sha || "").slice(0, 7),
  } : null
  return { build, test }
}
function apriLink(url) { window.location.href = url }

const LICENZE = [
  ["React", "MIT"], ["Vite", "MIT"], ["Capacitor", "MIT"], ["Supabase JS", "MIT"],
  ["pdf.js", "Apache-2.0"], ["Tesseract.js", "Apache-2.0"], ["Google Generative AI SDK", "Apache-2.0"],
]

function RigaStato({ T, ok, testo, icona }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",fontSize:12,color:T.text}}>
      <span style={{fontSize:16}}>{ok === null ? (icona || "⏳") : ok ? "✅" : "❌"}</span>
      <span>{testo}</span>
    </div>
  )
}
function RigaMenu({ T, icona, testo, onClick, aperta }) {
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",fontSize:13,
      color:T.text,cursor:"pointer",borderTop:`1px solid ${T.border}`}}>
      <span style={{fontSize:16,width:20,textAlign:"center"}}>{icona}</span>
      <span style={{flex:1}}>{testo}</span>
      {aperta !== undefined && <span style={{color:T.sub}}>{aperta ? "▲" : "▼"}</span>}
    </div>
  )
}

export function ImpostazioniAggiornamenti({ T }) {
  const [modo, setModo] = useState(leggiModo())
  const [attesa, setAttesa] = useState(false)
  const [stato, setStato] = useState(null)   // { ok: bool, testo: string }
  const [build, setBuild] = useState(undefined) // undefined = in lettura, null = non disponibile
  const [novita, setNovita] = useState(false)
  const [licenze, setLicenze] = useState(false)
  const [noteAperte, setNoteAperte] = useState(false)
  const [note, setNote] = useState(leggiNote())
  const vivoRef = useRef(true)
  // Stato di test e build: si legge all'apertura della sezione e a ogni pressione del tasto "Controlla".
  function aggiornaBuild() {
    return leggiStatoBuild()
      .then(b => { if (vivoRef.current) setBuild(b) })
      .catch(() => { if (vivoRef.current) setBuild(null) })
  }
  useEffect(() => {
    vivoRef.current = true
    aggiornaBuild()
    return () => { vivoRef.current = false }
  }, [])

  function scegli(m) {
    salvaModo(m)
    setModo(m)
  }
  async function controllaOra() {
    setAttesa(true)
    setStato(null)
    const [r] = await Promise.all([controllaAggiornamenti({ forza: true, mostraSempre: true }), aggiornaBuild()])
    setAttesa(false)
    if (r.esito === "nuova") setStato({ ok: true, testo: `🔔 Nuova versione disponibile: ${r.versione}` })
    else if (r.esito === "aggiornato") setStato({ ok: true, testo: "✅ Sei aggiornato" })
    else setStato({ ok: false, testo: "❌ Non riesco a controllare: verifica la connessione e riprova" })
  }

  return (
    <div>
      <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
        Scegli quando l'app controlla se c'e' una versione nuova. Se c'e', compare un pop-up con
        "Scarica ora" oppure "Dopo". Versione installata: <b>{versioneCompleta() || "dev"}</b>
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

      <div style={{marginTop:14}}>
        {build === undefined && <RigaStato T={T} ok={null} testo="Lettura stato build..."/>}
        {build === null && <RigaStato T={T} ok={false} testo="Stato build non disponibile (serve la connessione)"/>}
        {build && build.test && (() => {
          const t = build.test
          const rif = t.buildN ? `build #${t.buildN}` : `commit ${t.sha}`
          const inCorso = t.stato !== "completed"
          const ok = inCorso ? null : t.esito === "success"
          const testo = inCorso ? `Test automatici ${t.stato === "queued" ? "in coda" : "in corso"} (${rif})`
            : t.esito === "success" ? `Test automatici superati (${rif})`
            : t.esito === "cancelled" || t.esito === "skipped" ? `Test automatici annullati (${rif})`
            : `Test automatici non superati (${rif})`
          return <RigaStato T={T} ok={ok} icona="🔄" testo={testo}/>
        })()}
        {build && build.build && (() => {
          const b = build.build
          const inCorso = b.stato !== "completed"
          const ok = inCorso ? null : b.esito === "success"
          const testo = inCorso ? `Build #${b.n} ${b.stato === "in_progress" ? "in elaborazione" : "in coda"} (versione ${b.versione}#${b.n})`
            : b.esito === "success" ? `Ultima build #${b.n} completata`
            : b.esito === "cancelled" ? `Build #${b.n} annullata`
            : `Build #${b.n} non riuscita`
          return <RigaStato T={T} ok={ok} icona="🔄" testo={testo}/>
        })()}
        <RigaMenu T={T} icona="<>" testo="Visualizza il codice sorgente su GitHub" onClick={() => apriLink(`https://github.com/${REPO}`)}/>
        <RigaMenu T={T} icona="⚙️" testo="Visualizza Actions su GitHub" onClick={() => apriLink(`https://github.com/${REPO}/actions`)}/>
        <RigaMenu T={T} icona="🐞" testo="Segnala un problema su GitHub" onClick={() => apriLink(`https://github.com/${REPO}/issues/new`)}/>
        <RigaMenu T={T} icona="❗" testo="Novità" aperta={novita} onClick={() => setNovita(v => !v)}/>
        {novita && (
          <div style={{paddingBottom:8}}>
            {AGGIORNAMENTI_APP.map(a => (
              <div key={a.n} style={{background:T.s2,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                <div style={{fontSize:12,fontWeight:800,color:T.text}}>{a.titolo}</div>
                <div style={{fontSize:10,color:T.sub,marginBottom:3}}>{a.data}</div>
                {(a.righe || []).map((r, i) => <div key={i} style={{fontSize:11,color:T.sub,lineHeight:1.45}}>• {r}</div>)}
              </div>
            ))}
          </div>
        )}
        <RigaMenu T={T} icona="📝" testo="Note da fare" aperta={noteAperte} onClick={() => setNoteAperte(v => !v)}/>
        {noteAperte && (
          <div style={{paddingBottom:8}}>
            <textarea value={note} rows={6}
              onChange={e => { setNote(e.target.value); salvaNote(e.target.value) }}
              placeholder="Scrivi qui le cose da fare..."
              style={{width:"100%",boxSizing:"border-box",background:T.s2,color:T.text,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",fontSize:12,lineHeight:1.45,fontFamily:"inherit",resize:"vertical"}}/>
            <div style={{fontSize:10,color:T.sub,marginTop:3}}>Salvate in automatico su questo dispositivo.</div>
          </div>
        )}
        <RigaMenu T={T} icona="📄" testo="Visualizza licenze" aperta={licenze} onClick={() => setLicenze(v => !v)}/>
        {licenze && (
          <div style={{paddingBottom:8}}>
            {LICENZE.map(([nome, lic]) => (
              <div key={nome} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.sub,padding:"3px 2px"}}>
                <span>{nome}</span><span>{lic}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
