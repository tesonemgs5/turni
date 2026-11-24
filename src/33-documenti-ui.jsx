import { useState, useEffect, useRef } from "react";
import {
  documentiEvento, aggiungiDocumento, eliminaDocumento, inviaDocumento,
  anteprimaDocumento, sottoscrivi, leggiPeriodi, salvaPeriodi, nuovoIdPeriodo, periodoIniziale,
  testoPeriodo, UNITA_PERIODO, MAX_NUMERO_PERIODO,
} from "./32-documenti";
import { ConfermaEliminazione } from "./05-Comuni";

// Fa ridisegnare il componente quando cambiano i documenti (aggiunta/eliminazione/pulizia).
export function useDocumentiVersione() {
  const [v, setV] = useState(0);
  useEffect(() => sottoscrivi(() => setV((x) => x + 1)), []);
  return v;
}

function dimensione(byte) {
  if (!byte) return "";
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
}

function dataIt(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// Selettori del periodo di conservazione: numero + giorno/settimana/mese/anno,
// con i periodi salvati sul telefono (si aggiungono, si sostituiscono, si cancellano).
//  - valore / onCambia: { n, unita } scelto adesso (controllato dal chiamante)
export function SelettoreDurata({ T, accent, valore, onCambia }) {
  const [periodi, setPeriodi] = useState(() => leggiPeriodi());
  const [selId, setSelId] = useState(null);
  const aggiorna = (nuovi) => { setPeriodi(nuovi); salvaPeriodi(nuovi); };
  const uguale = (p) => p.n === valore.n && p.unita === valore.unita;
  const selezionato = periodi.find((p) => p.id === selId) || null;
  const modificato = !!selezionato && !uguale(selezionato);
  const giaSalvato = periodi.some(uguale);
  const plurale = { giorno: "giorni", settimana: "settimane", mese: "mesi", anno: "anni" };

  function salvaNuovo() {
    const p = { id: nuovoIdPeriodo(), n: valore.n, unita: valore.unita };
    aggiorna([...periodi, p]);
    setSelId(p.id);
  }
  function sostituisci() {
    aggiorna(periodi.map((p) => (p.id === selId ? { ...p, n: valore.n, unita: valore.unita } : p)));
  }
  function elimina(id) {
    aggiorna(periodi.filter((p) => p.id !== id));
    if (selId === id) setSelId(null);
  }

  const campo = {
    background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
    padding: "8px 6px", fontWeight: 800, fontSize: 14,
  };
  const piccolo = {
    background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
    padding: "6px 8px", fontWeight: 800, fontSize: 12, cursor: "pointer",
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 6 }}>
        Resta fino alle 23.59 del giorno dell'evento; dal giorno dopo parte il periodo (0 = si cancella alle 00.00 del giorno dopo).
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {periodi.length === 0 && <span style={{ fontSize: 11, color: T.sub }}>Nessun periodo salvato.</span>}
        {periodi.map((p) => {
          const attivo = uguale(p);
          return (
            <span key={p.id} style={{
              display: "inline-flex", alignItems: "center", borderRadius: 8, overflow: "hidden",
              border: `2px solid ${attivo ? accent : T.border}`, background: attivo ? `${accent}22` : T.surface,
            }}>
              <button type="button" onClick={() => { setSelId(p.id); onCambia({ n: p.n, unita: p.unita }); }}
                style={{ background: "transparent", color: T.text, border: "none", padding: "6px 8px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                {testoPeriodo(p)}
              </button>
              <button type="button" aria-label={`Cancella ${testoPeriodo(p)}`} onClick={() => elimina(p.id)}
                style={{ background: "transparent", color: T.sub, border: "none", borderLeft: `1px solid ${T.border}`, padding: "6px 8px", fontSize: 12, cursor: "pointer" }}>✕</button>
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <select aria-label="Numero" value={valore.n} onChange={(e) => onCambia({ ...valore, n: Number(e.target.value) })} style={{ ...campo, flex: 1 }}>
          {Array.from({ length: MAX_NUMERO_PERIODO + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select aria-label="Tipo" value={valore.unita} onChange={(e) => onCambia({ ...valore, unita: e.target.value })} style={{ ...campo, flex: 2 }}>
          {UNITA_PERIODO.map((u) => <option key={u} value={u}>{valore.n === 1 ? u : plurale[u]}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {!giaSalvato && <button type="button" onClick={salvaNuovo} style={piccolo}>💾 Salva «{testoPeriodo(valore)}»</button>}
        {modificato && <button type="button" onClick={sostituisci} style={piccolo}>✏️ Sostituisci «{testoPeriodo(selezionato)}»</button>}
      </div>
    </div>
  );
}

// "scade il 25/11/2026" oppure, per i documenti da 24 ore, "scade il 25/11/2026 alle 10:30".
function testoScadenza(d) {
  if (d.scadeMs) {
    const x = new Date(d.scadeMs);
    const p = (n) => String(n).padStart(2, "0");
    return `scade il ${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} alle ${p(x.getHours())}:${p(x.getMinutes())}`;
  }
  return d.scade ? `scade il ${dataIt(d.scade)}` : "";
}

// Sezione "Documenti" del form evento.
//  - eventId: id dell'evento (esistente o riservato per un evento nuovo)
//  - prenotaId: crea e ritorna un id riservato quando l'evento non e' ancora salvato
export function SezioneDocumenti({ T, accent, eventId, dateKey, prenotaId }) {
  useDocumentiVersione();
  const inputRef = useRef(null);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState("");
  const [anteprima, setAnteprima] = useState(null);
  const [daEliminare, setDaEliminare] = useState(null);
  const [inAttesa, setInAttesa] = useState(null); // file scelti, in attesa del periodo
  const [periodo, setPeriodo] = useState(() => periodoIniziale());
  const docs = documentiEvento(eventId);

  async function scelti(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (files.length === 0) return;
    setErrore("");
    setInAttesa(files); // prima si chiede per quanto tempo tenerli
  }

  async function allega() {
    const files = inAttesa || [];
    setInAttesa(null);
    setLavoro(true);
    const id = eventId || prenotaId();
    for (const file of files) {
      const r = await aggiungiDocumento({ eventId: id, dateKey, file, periodo });
      if (!r.ok) { setErrore(`${file.name}: ${r.errore}`); break; }
    }
    setLavoro(false);
  }

  async function invia(id) {
    setErrore("");
    setLavoro(true);
    const r = await inviaDocumento(id);
    setLavoro(false);
    if (!r.ok) setErrore(r.errore || "Invio non riuscito");
  }

  async function apri(d) {
    if (/^image\//.test(d.mime || "")) {
      const url = await anteprimaDocumento(d.id);
      if (url) { setAnteprima({ url, nome: d.nome }); return; }
    }
    invia(d.id);
  }

  const bottone = {
    background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
    padding: "6px 10px", fontWeight: 800, fontSize: 12, cursor: "pointer",
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 6 }}>
        📎 <b style={{ color: T.text }}>Documenti</b> (copia promemoria: a ogni allegato scegli per quanto tenerlo dopo il giorno dell'evento)
      </div>
      {docs.map((d) => (
        <div key={d.id} style={{
          display: "flex", alignItems: "center", gap: 6, background: T.s2,
          border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", marginBottom: 6,
        }}>
          <div onClick={() => apri(d)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.nome}
            </div>
            <div style={{ fontSize: 10, color: T.sub }}>
              {[dimensione(d.size), testoScadenza(d)].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button type="button" disabled={lavoro} onClick={() => invia(d.id)} style={bottone}>✉️ Invia</button>
          <button type="button" disabled={lavoro} onClick={() => setDaEliminare(d)} style={bottone}>🗑️</button>
        </div>
      ))}
      <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={scelti} />
      {inAttesa && (
        <div style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 8 }}>
            Per quanto tempo tenere {inAttesa.length === 1 ? "il documento" : `i ${inAttesa.length} documenti`}?
          </div>
          <SelettoreDurata T={T} accent={accent} valore={periodo} onCambia={setPeriodo} />
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button type="button" onClick={() => setInAttesa(null)} style={{ ...bottone, flex: 1, color: T.sub }}>Annulla</button>
            <button type="button" onClick={allega} style={{ ...bottone, flex: 2, background: accent, color: "#fff", border: "none" }}>Allega ({testoPeriodo(periodo)})</button>
          </div>
        </div>
      )}
      <button type="button" disabled={lavoro || !!inAttesa} onClick={() => inputRef.current && inputRef.current.click()}
        style={{
          width: "100%", background: T.s2, color: T.text, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "8px 0", fontWeight: 800, fontSize: 12, cursor: "pointer",
        }}>
        {lavoro ? "Attendi…" : "➕ Allega documento"}
      </button>
      {errore && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>{errore}</div>}
      {anteprima && (
        <div onClick={() => setAnteprima(null)} style={{
          position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.85)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12,
        }}>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{anteprima.nome} · tocca per chiudere</div>
          <img src={anteprima.url} alt={anteprima.nome} style={{ maxWidth: "100%", maxHeight: "85%", objectFit: "contain" }} />
        </div>
      )}
      {daEliminare && (
        <ConfermaEliminazione T={T} testo={`Eliminare il documento «${daEliminare.nome}»?`}
          onConferma={() => { const id = daEliminare.id; setDaEliminare(null); eliminaDocumento(id); }}
          onAnnulla={() => setDaEliminare(null)} />
      )}
    </div>
  );
}

// Riga degli allegati dentro la scheda di un evento (vista del giorno): per ogni documento
// titolo, dimensione, scadenza e pulsante "Apri". Le immagini si aprono a schermo intero,
// gli altri file con la condivisione del telefono.
//  - colore / coloreSub: colori del testo della scheda (cambiano col colore dell'evento)
export function DocumentiScheda({ T, eventId, colore, coloreSub }) {
  useDocumentiVersione();
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState("");
  const [anteprima, setAnteprima] = useState(null);
  const docs = documentiEvento(eventId);
  if (docs.length === 0) return null;

  async function apri(d) {
    setErrore("");
    if (/^image\//.test(d.mime || "")) {
      const url = await anteprimaDocumento(d.id);
      if (url) { setAnteprima({ url, nome: d.nome }); return; }
    }
    setLavoro(true);
    const r = await inviaDocumento(d.id);
    setLavoro(false);
    if (!r.ok) setErrore(r.errore || "Apertura non riuscita");
  }

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
      {docs.map((d) => (
        <div key={d.id} style={{
          display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.18)",
          borderRadius: 8, padding: "6px 8px", marginBottom: 4,
        }}>
          <span style={{ fontSize: 16 }}>📎</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: colore, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.nome}
            </div>
            <div style={{ fontSize: 12, color: coloreSub }}>
              {[dimensione(d.size), testoScadenza(d)].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button type="button" disabled={lavoro} onClick={(e) => { e.stopPropagation(); apri(d); }} style={{
            background: "rgba(0,0,0,0.25)", color: colore, border: "none", borderRadius: 8,
            padding: "8px 10px", fontWeight: 800, fontSize: 13, cursor: "pointer", flexShrink: 0,
          }}>{lavoro ? "…" : "📂 Apri"}</button>
        </div>
      ))}
      {errore && <div style={{ fontSize: 12, color: "#fecaca", fontWeight: 700 }}>{errore}</div>}
      {anteprima && (
        <div onClick={(e) => { e.stopPropagation(); setAnteprima(null); }} style={{
          position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.85)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12,
        }}>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{anteprima.nome} · tocca per chiudere</div>
          <img src={anteprima.url} alt={anteprima.nome} style={{ maxWidth: "100%", maxHeight: "85%", objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}
