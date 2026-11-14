import { useState, useEffect, useRef } from "react";
import {
  documentiEvento, aggiungiDocumento, eliminaDocumento, inviaDocumento,
  anteprimaDocumento, sottoscrivi,
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
  const docs = documentiEvento(eventId);

  async function scelti(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (files.length === 0) return;
    setErrore("");
    setLavoro(true);
    const id = eventId || prenotaId();
    for (const file of files) {
      const r = await aggiungiDocumento({ eventId: id, dateKey, file });
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
        📎 <b style={{ color: T.text }}>Documenti</b> (copia promemoria, si cancella 4 mesi dopo l'evento)
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
              {[dimensione(d.size), d.scade ? `scade il ${dataIt(d.scade)}` : ""].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button type="button" disabled={lavoro} onClick={() => invia(d.id)} style={bottone}>✉️ Invia</button>
          <button type="button" disabled={lavoro} onClick={() => setDaEliminare(d)} style={bottone}>🗑️</button>
        </div>
      ))}
      <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={scelti} />
      <button type="button" disabled={lavoro} onClick={() => inputRef.current && inputRef.current.click()}
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
