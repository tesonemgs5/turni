// Le due finestre dell'aggiornamento, identiche a quelle di DartPDF (Material, tema chiaro):
//  1) "La versione #N e' disponibile (hai la #M). Cosa cambia: ... Aggiornamento: patch, circa N MB"
//     con Piu' tardi / Salta questa versione / Aggiorna ora;
//  2) "Download dell'aggiornamento": intestazione, stato, elenco dei pezzi (spunta blu = fatto,
//     rotella = in corso, cerchio vuoto = da fare, con i MB), barra e Annulla.
import { formatoMb } from "./36-aggiornamento-piano.js"

const C = { sfondo: "#EAE9F2", testo: "#1C1B20", icona: "#44464F", primario: "#505A94", traccia: "#DDDDF2", dim: "rgba(0,0,0,0.5)", blu: "#2196F3", grigio: "#9E9E9E" }
const FONT = "Roboto, 'Segoe UI', system-ui, sans-serif"
const bTesto = { background: "none", border: "none", color: C.primario, fontSize: 16, fontWeight: 500, padding: "10px 12px", cursor: "pointer", fontFamily: FONT }
const bPieno = { background: C.primario, border: "none", color: "#fff", fontSize: 16, fontWeight: 500, padding: "12px 24px", borderRadius: 100, cursor: "pointer", fontFamily: FONT }

const ANIMAZIONI = "@keyframes agg-ruota{to{transform:rotate(360deg)}}@keyframes agg-scorri{0%{left:-40%}100%{left:100%}}"

function Scheda({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: C.dim, display: "flex",
      alignItems: "center", justifyContent: "center", padding: "0 28px", boxSizing: "border-box" }}>
      <style>{ANIMAZIONI}</style>
      <div style={{ background: C.sfondo, color: C.testo, borderRadius: 28, padding: 24, width: "100%",
        maxWidth: 560, boxSizing: "border-box", fontFamily: FONT, maxHeight: "86vh", overflowY: "auto",
        boxShadow: "0 6px 24px rgba(0,0,0,0.25)" }}>
        {children}
      </div>
    </div>
  )
}

function IconaAggiorna() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill={C.icona} aria-hidden="true">
      <path d="M12 16.5l4-4h-3v-9h-2v9H8l4 4zm9-13h-6v1.99h6v14.03H3V5.49h6V3.5H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2v-14c0-1.11-.9-2-2-2z" />
    </svg>
  )
}

export function DialogoDisponibile({ info, onPiuTardi, onSalta, onAggiorna }) {
  const nuova = info.build ? `#${info.build}` : info.versione
  const mia = info.buildInstallata ? ` (hai la #${info.buildInstallata})` : ""
  const note = info.note && info.note.length ? info.note.join("\n") : "- Miglioramenti e correzioni"
  const testo = `La versione ${nuova} è disponibile${mia}.\n\nCosa cambia:\n${note}\n${info.rigaTipo || ""}`.trim()
  return (
    <Scheda>
      <div style={{ textAlign: "center", marginBottom: 16 }}><IconaAggiorna /></div>
      <div style={{ fontSize: 16, lineHeight: "24px", whiteSpace: "pre-wrap" }}>{testo}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, marginTop: 28 }}>
        <button style={bTesto} onClick={onPiuTardi}>Più tardi</button>
        <button style={bTesto} onClick={onSalta}>Salta questa versione</button>
        <button style={bPieno} onClick={onAggiorna}>Aggiorna ora</button>
      </div>
    </Scheda>
  )
}

function Barra({ frazione }) {
  const fissa = typeof frazione === "number"
  return (
    <div style={{ position: "relative", height: 4, borderRadius: 2, background: C.traccia, overflow: "hidden" }}>
      {fissa
        ? <div style={{ height: "100%", width: `${Math.max(0, Math.min(1, frazione)) * 100}%`, background: C.primario, transition: "width .15s linear" }} />
        : <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: C.primario, animation: "agg-scorri 1.2s linear infinite" }} />}
    </div>
  )
}

function Riga({ passo, fatto, corrente }) {
  let icona
  if (fatto) {
    icona = <svg width="22" height="22" viewBox="0 0 24 24" fill={C.blu} aria-label="fatto"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
  } else if (corrente) {
    icona = <svg width="20" height="20" viewBox="0 0 24 24" style={{ animation: "agg-ruota 1s linear infinite" }} aria-label="in corso"><circle cx="12" cy="12" r="9" fill="none" stroke={C.primario} strokeWidth="2.5" strokeDasharray="42 60" strokeLinecap="round" /></svg>
  } else {
    icona = <svg width="22" height="22" viewBox="0 0 24 24" fill={C.grigio} aria-label="da fare"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" /></svg>
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0", fontSize: 16 }}>
      <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>{icona}</div>
      <div style={{ flex: 1 }}>{passo.etichetta}</div>
      <div>{formatoMb(passo.size)} MB</div>
    </div>
  )
}

function etichettaStato(s) {
  if (s.fase === "errore") return `Aggiornamento non riuscito: ${s.errore || "errore"}`
  if (s.fase === "installatore") return "Aggiornamento scaricato. Apertura del programma di installazione…"
  if (s.fase === "applico") return "Applico l’aggiornamento…"
  if (s.fase === "scarico" && typeof s.frazione === "number") return `Download… ${Math.round(s.frazione * 100)}%`
  return "Preparazione…"
}

export function DialogoDownload({ stato, onAnnulla, onChiudi, onRiprova }) {
  const s = stato || {}
  const passi = s.passi || []
  const errore = s.fase === "errore"
  const finito = s.fase === "installatore"
  const indeterminata = s.fase === "applico" || s.fase === "preparazione" || s.fase === "installatore"
  return (
    <Scheda>
      <div style={{ fontSize: 24, lineHeight: "32px", marginBottom: 16 }}>Download dell’aggiornamento</div>
      {s.intestazione ? <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{s.intestazione}</div> : null}
      <div style={{ fontSize: 16, lineHeight: "24px" }}>{etichettaStato(s)}</div>
      {passi.length > 1 ? (
        <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
          {passi.map((p, i) => (
            <Riga key={p.asset + i} passo={p} fatto={finito || i < (s.fatti || 0)} corrente={!errore && i === (s.fatti || 0)} />
          ))}
        </div>
      ) : null}
      {errore ? null : (
        <div style={{ marginTop: 16 }}><Barra frazione={indeterminata ? null : s.frazione} /></div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
        {errore ? <button style={bTesto} onClick={onRiprova}>Riprova</button> : null}
        {errore || finito
          ? <button style={bTesto} onClick={onChiudi}>Chiudi</button>
          : <button style={bTesto} onClick={onAnnulla}>Annulla</button>}
      </div>
    </Scheda>
  )
}
