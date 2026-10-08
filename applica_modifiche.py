#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
applica_modifiche.py - due modifiche in un colpo solo, UN SOLO commit e UNA sola build:

  1) AGGIORNAMENTI APP (Impostazioni): scegli quando controllare le versioni nuove
     - a ogni apertura dell'app (predefinita) / solo all'avvio da zero / solo manuale
     - pulsante "Controlla aggiornamenti ora"; pop-up "Scarica ora" / "Dopo"
  2) NORMALIZZA COLORI sistemato (Impostazioni > Manutenzione): ora ricolora anche gli
     eventi gia' inseriti (anche quelli scritti a mano, non collegati a un modello) e non
     annulla piu' il cambio delle fasce. Nessun pulsante nuovo: e' quello che gia' c'e'.

Fa: backup, scrittura/modifica dei file in src/, commit e push.
Uso (dalla cartella del progetto, dopo git pull):  python applica_modifiche.py
Opzioni: --si (non chiede conferme)  --senza-push
"""
import os, sys, shutil, subprocess

ARGS = set(sys.argv[1:])
SI = "--si" in ARGS

AVVISO = r'''import { useEffect, useState } from "react"

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
'''

def say(t=""): print(t, flush=True)
def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
def chiedi(d):
    return True if SI else input(d + " (s/n): ").strip().lower() in ("s", "si", "y", "yes")

IMPORT_ANCORA = 'import { ImportaTurniJsonDialog, ImportaFotoDialog } from "./07-Turni";'
IMPORT_NUOVO = 'import { ImpostazioniAggiornamenti, inApk } from "./12-avviso-aggiornamento";'
SEZ_ANCORA = '<SecCollapsible label="FASCE ORARIE AUTOMATICHE" T={T}>'
SEZ_NUOVA = (
    '{inApk()&&(\n'
    '        <SecCollapsible label="AGGIORNAMENTI APP" T={T}>\n'
    '          <ImpostazioniAggiornamenti T={T}/>\n'
    '        </SecCollapsible>\n'
    '      )}\n'
    '      '
)


HELPER_COLORI = r'''// Allinea il COLORE degli eventi gia' in calendario a quello del loro modello.
// Funzione pura (non scrive nulla): calcola cosa andrebbe cambiato.
//  - evento con modello valido: deve avere il colore del modello;
//  - evento "orfano" (senza modello, o con un modello che non esiste piu'):
//      * stesso calendario + stesso nome + stessi orari di un modello -> si COLLEGA
//        al modello (come fa gia' l'app al salvataggio) e prende il suo colore;
//      * stesso nome ma orari diversi, e UN SOLO modello con quel nome nel calendario
//        -> prende solo il colore (nessun collegamento, i report non cambiano);
//      * altrimenti non si tocca.
// Titoli e orari degli eventi non vengono mai modificati.
const norm = s => (s || "").trim().toUpperCase()
const hex = h => String(h || "").trim().toLowerCase()

export function calcolaAllineamentoColori({ events, modelli, mainCalId, coloreDelModello }) {
  const lista = (modelli || []).filter(Boolean)
  const perId = new Map(lista.map(m => [m.id, m]))
  const eventi = []
  Object.keys(events || {}).forEach(dk => {
    Object.keys(events[dk] || {}).forEach(cid => {
      ;(events[dk][cid] || []).forEach(e => {
        if (!e || !e.id) return
        let mod = e.modelloId ? perId.get(e.modelloId) : null
        let collega = null
        if (!mod) {
          const nome = norm(e.label)
          if (!nome) return
          const cand = lista.filter(m =>
            (m.calendarId || mainCalId) === cid &&
            (norm(m.titolo) === nome || norm(m.label) === nome))
          const esatto = cand.find(m => (m.inizio || "") === (e.tIn || "") && (m.fine || "") === (e.tOut || ""))
          if (esatto) { mod = esatto; collega = esatto.id }
          else if (cand.length === 1) { mod = cand[0] }
        }
        if (!mod) return
        const nuovo = coloreDelModello(mod)
        if (!nuovo) return
        if (hex(e.color) !== hex(nuovo) || collega) {
          eventi.push({ id: e.id, dk, cid, label: e.label, coloreVecchio: e.color, coloreNuovo: nuovo,
            collega, titoloModello: mod.titolo || mod.label || "" })
        }
      })
    })
  })
  const conteggio = new Map()
  eventi.forEach(x => conteggio.set(x.titoloModello, (conteggio.get(x.titoloModello) || 0) + 1))
  const perModello = [...conteggio.entries()].map(([titolo, n]) => ({ titolo, n })).sort((a, b) => b.n - a.n)
  return { totale: eventi.length, collegati: eventi.filter(x => x.collega).length, eventi, perModello }
}
'''

LOGICA_IMPORT_ANCORA = 'import { supabase } from "./11-supabase";'
LOGICA_IMPORT_NUOVO = 'import { calcolaAllineamentoColori } from "./13-allinea-colori";'

LOGICA_FUNZ_ANCORA = "  async function ricoloraModelliPerFasciaOraria(){"
LOGICA_FUNZ_NUOVA = r'''  // -- Ricolora gli eventi gia' in calendario (anche quelli scritti a mano) come il loro
  // modello. Cambia solo il colore (e il collegamento al modello se nome+orari coincidono).
  // Aggiorna SOLO gli eventi nello store: fasce, calendari e il resto restano come sono.
  async function applicaAllineamentoEventi(lista){
    if(!lista || lista.length===0 || !userId) return null;
    const perId = new Map(lista.map(x=>[x.id,x]));
    const mappa = ev => {
      const out = JSON.parse(JSON.stringify(ev||{}));
      Object.keys(out).forEach(dk=>{
        Object.keys(out[dk]||{}).forEach(cid=>{
          out[dk][cid] = (out[dk][cid]||[]).map(e=>{
            const x = e && perId.get(e.id);
            return x ? {...e, color:x.coloreNuovo, ...(x.collega?{modelloId:x.collega}:{})} : e;
          });
        });
      });
      return out;
    };
    const eventiNuovi = mappa((storeRef.current||store).events);
    setStore(s=>({...s, events: mappa(s.events)}));
    if(storeRef.current) storeRef.current = {...storeRef.current, events:eventiNuovi};
    const ts = new Date().toISOString();
    (async()=>{
      let errori = 0;
      for(let i=0;i<lista.length;i+=20){
        await Promise.all(lista.slice(i,i+20).map(async x=>{
          const payload = x.collega ? { color:x.coloreNuovo, modello_id:x.collega } : { color:x.coloreNuovo };
          const ris = await scriviConBackup({
            tipo:"update", table:"events", payload, matchObj:{ id:x.id, user_id:userId },
            contesto:"Normalizza colori: allineo evento al suo modello", ts, opzioni:{ soloLog:true },
          });
          if(ris?.errore) errori++;
        }));
      }
      if(errori>0) segnalaErroreSoloLog(`${errori} eventi non salvati su Supabase durante la normalizzazione colori`, "Normalizzazione colori");
    })();
    return eventiNuovi;
  }

'''

CALCOLO_COLORE_MODELLO = 'm => m.coloreCustom||m.colore||(m.tempo==="h24"?COLORE_H24:colByTime(m.inizio))'

ANALIZZA_SOLO_EVENTI_VECCHIO = "    if(!snapRaw || !snap) return { totale:0, modelli:[], fasce:[], nessunaDisposizione:true };\n"
ANALIZZA_SOLO_EVENTI_NUOVO = (
    "    if(!snapRaw || !snap){\n"
    "      const soloEv = calcolaAllineamentoColori({ events:store.events, modelli, mainCalId, coloreDelModello:" + CALCOLO_COLORE_MODELLO + " });\n"
    "      return { totale:soloEv.totale, modelli:[], fasce:[], eventi:soloEv.eventi, perModelloEventi:soloEv.perModello, collegati:soloEv.collegati, nessunaDisposizione:soloEv.totale===0 };\n"
    "    }\n"
)
ANALIZZA_RETURN_VECCHIO = "    return { totale: candidati.length + fasceDaRipristinare.length, modelli:candidati, fasce:fasceDaRipristinare };\n"
ANALIZZA_RETURN_NUOVO = (
    "    // Eventi gia' in calendario: devono avere il colore del loro modello (come sara' dopo la normalizzazione).\n"
    "    const nuoviCol = new Map(candidati.map(c=>[c.id, c.coloreNuovo]));\n"
    "    const modelliFuturi = modelli.map(m=>(m && nuoviCol.has(m.id)) ? {...m, coloreCustom:nuoviCol.get(m.id), colore:nuoviCol.get(m.id)} : m);\n"
    "    const ev = calcolaAllineamentoColori({ events:store.events, modelli:modelliFuturi, mainCalId, coloreDelModello:" + CALCOLO_COLORE_MODELLO + " });\n"
    "    return { totale: candidati.length + fasceDaRipristinare.length + ev.totale, modelli:candidati, fasce:fasceDaRipristinare, eventi:ev.eventi, perModelloEventi:ev.perModello, collegati:ev.collegati };\n"
)
APPLICA_EVENTI_VECCHIO = (
    "    // Eventi gia' inseriti passano al colore ripristinato del modello.\n"
    "    const mappaColori = {};\n"
    "    candidati.forEach(c=>{ mappaColori[c.id] = c.coloreNuovo; });\n"
    "    const eventiAggiornati = await propagaColoreModelliAgliEventi(mappaColori);\n"
)
APPLICA_EVENTI_NUOVO = (
    "    // Eventi gia' in calendario (anche quelli scritti a mano): prendono il colore del loro modello.\n"
    "    const eventiAggiornati = await applicaAllineamentoEventi(analisi.eventi);\n"
)
APPLICA_RETURN_VECCHIO = "    return { ok:true, totale: candidati.length, totaleFasce: fasceR.length };\n"
APPLICA_RETURN_NUOVO = "    return { ok:true, totale: candidati.length, totaleFasce: fasceR.length, totaleEventi: (analisi.eventi||[]).length };\n"
PROPAGA_VECCHIO = "    saveToLocalStorage(nuovoStore.events, nuovoStore.calendars, modelli);\n    setStore(nuovoStore);\n    const ts = new Date().toISOString();\n"
PROPAGA_NUOVO = "    saveToLocalStorage(nuovoStore.events, nuovoStore.calendars, modelli);\n    setStore(s=>({...s, events:nuovoStore.events})); // solo gli eventi: non riporta indietro fasce e altro\n    const ts = new Date().toISOString();\n"

MOD_ELENCO_ANCORA = "              ...analisi.modelli.map(m=>`\u2022 ${m.titolo||\"Senza nome\"}`),\n"
MOD_ELENCO_NUOVO = "              ...(analisi.perModelloEventi||[]).slice(0,8).map(r=>`\u2022 Eventi ${r.titolo}: ${r.n} da ricolorare`),\n"
MOD_CONFIRM_VECCHIO = "Trovati ${analisi.modelli.length} modelli e ${analisi.fasce.length} fasce da riportare ai colori dell'ultima disposizione salvata:"
MOD_CONFIRM_NUOVO = "Trovati ${analisi.modelli.length} modelli, ${analisi.fasce.length} fasce e ${(analisi.eventi||[]).length} eventi da riportare ai colori giusti:"
MOD_BANNER_VECCHIO = "${esito.totale} modelli e ${esito.totaleFasce} fasce riportati ai colori salvati. Eventi gi\u00e0 inseriti aggiornati."
MOD_BANNER_NUOVO = "${esito.totale} modelli, ${esito.totaleFasce} fasce e ${esito.totaleEventi||0} eventi riportati ai colori giusti."


def _patch_testo(t, coppie):
    # coppie: (ancora, nuovo, dopo?) -> inserisce prima (dopo=False) o dopo (dopo=True) l'ancora
    for ancora, nuovo, dopo in coppie:
        if t.count(ancora) != 1:
            return None, "ancora non trovata o non unica: " + ancora.strip()[:60]
        if dopo == "sost":
            t = t.replace(ancora, nuovo)
        else:
            t = t.replace(ancora, ancora + nuovo if dopo else nuovo + ancora)
    return t, None

def patch_file(root, rel, segno, coppie):
    p = os.path.join(root, rel)
    if not os.path.isfile(p):
        say("  [!!] non trovo " + rel); return False
    with open(p, "r", encoding="utf-8", newline="") as f: orig = f.read()
    if segno in orig:
        say("  [--] gia' presente in " + rel); return True
    eol = "\r\n" if "\r\n" in orig else "\n"
    t, err = _patch_testo(orig.replace("\r\n", "\n"), coppie)
    if err:
        say("  [!!] " + rel + " e' diverso dal previsto (" + err + "): non lo tocco"); return False
    b = os.path.join(root, "_backup_prima_applica", rel)
    if not os.path.exists(b):
        os.makedirs(os.path.dirname(b), exist_ok=True); shutil.copy2(p, b)
    with open(p, "w", encoding="utf-8", newline="") as f: f.write(t.replace("\n", eol))
    say("  [OK] modificato " + rel); return True

def scrivi_file(root, rel, contenuto):
    dst = os.path.join(root, rel)
    vecchio = ""
    if os.path.isfile(dst):
        with open(dst, "r", encoding="utf-8", newline="") as f: vecchio = f.read()
        b = os.path.join(root, "_backup_prima_applica", rel)
        if not os.path.exists(b):
            os.makedirs(os.path.dirname(b), exist_ok=True); shutil.copy2(dst, b)
    eol = "\r\n" if "\r\n" in vecchio else "\n"
    if vecchio.replace("\r\n", "\n") == contenuto:
        say("  [--] " + rel + " gia' aggiornato"); return
    with open(dst, "w", encoding="utf-8", newline="") as f: f.write(contenuto.replace("\n", eol))
    say("  [OK] scritto " + rel)

def main():
    root = os.getcwd()
    rel = os.path.join("src", "12-avviso-aggiornamento.jsx")
    mainjsx = os.path.join(root, "src", "09-main.jsx")
    say("=" * 60); say("  AGGIORNAMENTI E COLORI - progetto Turni"); say("=" * 60)
    if not os.path.isfile(mainjsx):
        say("\nERRORE: non trovo src/09-main.jsx. Lancia lo script dalla cartella del progetto."); sys.exit(1)
    if "AvvisoAggiornamento" not in open(mainjsx, encoding="utf-8").read():
        say("\nERRORE: 09-main.jsx non usa AvvisoAggiornamento. Fai prima 'git pull' (serve il lavoro precedente).")
        sys.exit(1)
    if not chiedi("\nAggiungo la scelta aggiornamenti e sistemo Normalizza colori. Procedo?"): say("Annullato."); return

    scrivi_file(root, rel, AVVISO)
    scrivi_file(root, os.path.join("src", "13-allinea-colori.js"), HELPER_COLORI)
    ok = True
    ok &= patch_file(root, os.path.join("src", "02-Modelli.jsx"), "ImpostazioniAggiornamenti", [
        (IMPORT_ANCORA, "\n" + IMPORT_NUOVO, True),
        (SEZ_ANCORA, SEZ_NUOVA, False),
    ])
    ok &= patch_file(root, os.path.join("src", "06-Logica.jsx"), "applicaAllineamentoEventi", [
        (LOGICA_IMPORT_ANCORA, "\n" + LOGICA_IMPORT_NUOVO, True),
        (LOGICA_FUNZ_ANCORA, LOGICA_FUNZ_NUOVA, False),
        (ANALIZZA_SOLO_EVENTI_VECCHIO, ANALIZZA_SOLO_EVENTI_NUOVO, "sost"),
        (ANALIZZA_RETURN_VECCHIO, ANALIZZA_RETURN_NUOVO, "sost"),
        (APPLICA_EVENTI_VECCHIO, APPLICA_EVENTI_NUOVO, "sost"),
        (APPLICA_RETURN_VECCHIO, APPLICA_RETURN_NUOVO, "sost"),
        (PROPAGA_VECCHIO, PROPAGA_NUOVO, "sost"),
    ])
    ok &= patch_file(root, os.path.join("src", "02-Modelli.jsx"), "perModelloEventi", [
        (MOD_ELENCO_ANCORA, MOD_ELENCO_NUOVO, True),
        (MOD_CONFIRM_VECCHIO, MOD_CONFIRM_NUOVO, "sost"),
        (MOD_BANNER_VECCHIO, MOD_BANNER_NUOVO, "sost"),
    ])
    if not ok:
        say("\nFermo qui: nessun commit fatto. Dimmi cosa e' comparso sopra e lo sistemo."); sys.exit(1)
    run(["git", "add", "--", rel, os.path.join("src", "13-allinea-colori.js"), os.path.join("src", "02-Modelli.jsx"), os.path.join("src", "06-Logica.jsx")], cwd=root)
    if run(["git", "diff", "--cached", "--quiet"], cwd=root).returncode != 0:
        r = run(["git", "commit", "-q", "-m", "Scelta aggiornamenti app e Normalizza colori anche sugli eventi"], cwd=root)
        if r.returncode != 0:
            say("  [!!] commit non riuscito: " + (r.stderr or r.stdout).strip()[:200]); sys.exit(1)
        say("  [OK] commit creato")
    else:
        say("  [--] niente da committare")

    if "--senza-push" in ARGS: say("  [--] push saltato"); return
    if not chiedi("Faccio il push ora?"): say("Ok. Lo farai tu con: git push"); return
    p = run(["git", "pull", "--rebase", "--autostash", "-q"], cwd=root)
    if p.returncode != 0:
        say("  [!!] git pull non riuscito: " + (p.stderr or p.stdout).strip()[:300]); return
    r = run(["git", "push"], cwd=root)
    if r.returncode == 0:
        say("  [OK] push fatto")
        say("\nFINE. La build parte da sola: https://github.com/tesonemgs5/turni/actions")
        say("Quando la build e' verde (pallino verde su Actions), installa il nuovo APK.")
        say("Impostazioni -> Aggiornamenti app: li' scegli la modalita' (di base: a ogni apertura).")
        say("Impostazioni -> Manutenzione -> \"Normalizza colori automatici\": premilo una volta.")
        say("Il pop-up compare quando esce una versione PIU' NUOVA di quella installata.")
    else:
        say("  [!!] push non riuscito: " + (r.stderr or r.stdout).strip()[:300])

if __name__ == "__main__":
    main()
