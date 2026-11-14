import { useState, useEffect, useRef } from "react";
import { prendiCondivisi, collegaCondiviso, scartaCondiviso, idGiorno } from "./32-documenti";
import { NOMI_MESI_IT } from "./04-Rotazione";

// Schermata che si apre quando si condivide un file verso Turni da un'altra app:
// calendario, scelta del giorno e dell'evento (o solo del giorno) a cui legarlo.

const GIORNI = ["L", "M", "M", "G", "V", "S", "D"];
const p2 = (n) => String(n).padStart(2, "0");
const chiave = (y, m0, d) => `${y}-${p2(m0 + 1)}-${p2(d)}`;

function eventiDelGiorno(store, dateKey) {
  const out = [];
  const perCal = (store && store.events && store.events[dateKey]) || {};
  for (const calId of Object.keys(perCal)) {
    const cal = ((store && store.calendars) || []).find((c) => c.id === calId);
    for (const e of perCal[calId] || []) out.push({ e, calNome: cal ? cal.name : "" });
  }
  return out.sort((a, b) => String(a.e.tIn || "").localeCompare(String(b.e.tIn || "")));
}

function giornoHaEventi(store, dateKey) {
  const perCal = (store && store.events && store.events[dateKey]) || {};
  return Object.keys(perCal).some((c) => (perCal[c] || []).length > 0);
}

function dataIt(dateKey) {
  const [y, m, d] = String(dateKey).split("-");
  return `${d}/${m}/${y}`;
}

export function RiceviDocumento({ T, accent, store }) {
  const oggi = new Date();
  const chiaveOggi = chiave(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const [coda, setCoda] = useState([]);
  const [errori, setErrori] = useState([]);
  const [mese, setMese] = useState({ y: oggi.getFullYear(), m: oggi.getMonth() });
  const [giorno, setGiorno] = useState(null);
  const [scelta, setScelta] = useState(null); // id evento oppure "giorno"
  const [lavoro, setLavoro] = useState(false);
  const [esito, setEsito] = useState("");
  const occupato = useRef(false);

  // Legge i file ricevuti: all'avvio e ogni volta che l'app torna in primo piano.
  async function controlla() {
    if (occupato.current) return;
    occupato.current = true;
    try {
      for (let i = 0; i < 20; i++) {
        const r = await prendiCondivisi();
        const buoni = r.items.filter((x) => x && x.path);
        const falliti = r.items.filter((x) => x && !x.path);
        if (buoni.length) setCoda((c) => [...c, ...buoni]);
        if (falliti.length) setErrori((er) => [...er, ...falliti.map((x) => `${x.nome || "file"}: ${x.errore || "non riuscito"}`)]);
        if (!r.inCorso) break;
        await new Promise((res) => setTimeout(res, 500));
      }
    } finally {
      occupato.current = false;
    }
  }

  useEffect(() => {
    controlla();
    const alRitorno = () => { if (document.visibilityState === "visible") controlla(); };
    document.addEventListener("visibilitychange", alRitorno);
    window.addEventListener("focus", controlla);
    return () => {
      document.removeEventListener("visibilitychange", alRitorno);
      window.removeEventListener("focus", controlla);
    };
  }, []);

  function cambiaMese(delta) {
    setMese((v) => {
      const tot = v.y * 12 + v.m + delta;
      return { y: Math.floor(tot / 12), m: ((tot % 12) + 12) % 12 };
    });
  }

  function scegliGiorno(k) {
    setGiorno(k);
    setScelta(null);
  }

  async function annulla() {
    for (const voce of coda) await scartaCondiviso(voce);
    setCoda([]);
    setGiorno(null);
    setScelta(null);
  }

  async function collega() {
    if (!giorno || !scelta) return;
    setLavoro(true);
    const eventId = scelta === "giorno" ? idGiorno(giorno) : scelta;
    let fatti = 0;
    let errore = "";
    for (const voce of coda) {
      const r = await collegaCondiviso({ voce, eventId, dateKey: giorno });
      if (!r.ok) { errore = `${voce.nome}: ${r.errore || "non riuscito"}`; break; }
      fatti++;
    }
    setLavoro(false);
    setCoda((c) => c.slice(fatti));
    if (errore) { setErrori((er) => [...er, errore]); return; }
    setGiorno(null);
    setScelta(null);
    setEsito(`✅ ${fatti === 1 ? "Documento collegato" : fatti + " documenti collegati"} al ${dataIt(giorno)}`);
    setTimeout(() => setEsito(""), 3500);
  }

  const toast = esito && (
    <div style={{
      position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", zIndex: 100002,
      background: "rgba(0,0,0,0.8)", color: "#fff", padding: "8px 16px", borderRadius: 20,
      fontSize: 13, fontWeight: 700, pointerEvents: "none", textAlign: "center",
    }}>{esito}</div>
  );

  // Solo errori (nessun file utilizzabile): piccolo avviso.
  if (coda.length === 0) {
    return (
      <>
        {toast}
        {errori.length > 0 && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 100001, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div style={{ background: T.surface, color: T.text, borderRadius: 14, padding: 16, maxWidth: 380, width: "100%" }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Documento non ricevuto</div>
              {errori.map((er, i) => <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>{er}</div>)}
              <button type="button" onClick={() => setErrori([])} style={{
                marginTop: 10, width: "100%", background: accent, color: "#fff", border: "none",
                borderRadius: 10, padding: "12px 0", fontWeight: 800, fontSize: 14, cursor: "pointer",
              }}>Chiudi</button>
            </div>
          </div>
        )}
      </>
    );
  }

  const primo = (new Date(mese.y, mese.m, 1).getDay() + 6) % 7;
  const giorniMese = new Date(mese.y, mese.m + 1, 0).getDate();
  const celle = [];
  for (let i = 0; i < primo; i++) celle.push(null);
  for (let d = 1; d <= giorniMese; d++) celle.push(d);
  const eventiGiorno = giorno ? eventiDelGiorno(store, giorno) : [];
  const nomiFile = coda.slice(0, 3).map((v) => v.nome).join(", ") + (coda.length > 3 ? ` e altri ${coda.length - 3}` : "");

  const rigaScelta = (attiva, onClick, children) => (
    <button type="button" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
      background: attiva ? `${accent}22` : T.surface, border: `2px solid ${attiva ? accent : T.border}`,
      borderRadius: 10, padding: "10px 12px", marginBottom: 6, cursor: "pointer", color: T.text,
    }}>
      <span style={{ fontSize: 16 }}>{attiva ? "●" : "○"}</span>
      {children}
    </button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100001, background: T.bg, color: T.text, overflowY: "auto",
      padding: "calc(env(safe-area-inset-top, 0px) + 12px) 14px 0",
    }}>
      {toast}
      <div style={{ fontSize: 18, fontWeight: 800 }}>📎 Collega documento</div>
      <div style={{ fontSize: 12, color: T.sub, margin: "2px 0 12px", wordBreak: "break-word" }}>
        {nomiFile} — scegli il giorno e l'evento
      </div>
      {errori.length > 0 && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{errori.join(" · ")}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <button type="button" onClick={() => cambiaMese(-1)} style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, width: 40, height: 36, fontSize: 18, cursor: "pointer" }}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{NOMI_MESI_IT[mese.m]} {mese.y}</div>
        <button type="button" onClick={() => cambiaMese(1)} style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, width: 40, height: 36, fontSize: 18, cursor: "pointer" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 10 }}>
        {GIORNI.map((g, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: T.sub }}>{g}</div>)}
        {celle.map((d, i) => {
          if (d === null) return <div key={i} />;
          const k = chiave(mese.y, mese.m, d);
          const sel = giorno === k;
          const ha = giornoHaEventi(store, k);
          return (
            <button key={i} type="button" onClick={() => scegliGiorno(k)} style={{
              height: 42, borderRadius: 8, cursor: "pointer", fontWeight: 800, fontSize: 14,
              background: sel ? accent : T.surface, color: sel ? "#fff" : T.text,
              border: `2px solid ${k === chiaveOggi && !sel ? accent : T.border}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.1,
            }}>
              <span>{d}</span>
              <span style={{ fontSize: 8, visibility: ha ? "visible" : "hidden" }}>●</span>
            </button>
          );
        })}
      </div>

      {giorno && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Giorno {dataIt(giorno)}</div>
          {eventiGiorno.length === 0 && (
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 6 }}>Nessun evento in questo giorno.</div>
          )}
          {eventiGiorno.map(({ e, calNome }) => rigaScelta(scelta === e.id, () => setScelta(e.id), (
            <>
              <span style={{ width: 8, alignSelf: "stretch", borderRadius: 4, background: e.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{e.label}</span>
                <span style={{ display: "block", fontSize: 11, color: T.sub }}>
                  {[e.tIn ? `${e.tIn}${e.tOut ? " → " + e.tOut : ""}` : "", calNome].filter(Boolean).join(" · ")}
                </span>
              </span>
            </>
          )))}
          {rigaScelta(scelta === "giorno", () => setScelta("giorno"), (
            <span style={{ fontSize: 14, fontWeight: 800 }}>📅 Solo il giorno (senza evento)</span>
          ))}
        </div>
      )}

      <div style={{
        position: "sticky", bottom: 0, background: T.bg, display: "flex", gap: 8,
        padding: "10px 0 calc(env(safe-area-inset-bottom, 0px) + 12px)",
      }}>
        <button type="button" disabled={lavoro} onClick={annulla} style={{
          flex: 1, background: T.surface, color: T.sub, border: `1px solid ${T.border}`,
          borderRadius: 10, padding: "13px 0", fontWeight: 800, fontSize: 15, cursor: "pointer",
        }}>Annulla</button>
        <button type="button" disabled={lavoro || !giorno || !scelta} onClick={collega} style={{
          flex: 2, background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "13px 0",
          fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: (lavoro || !giorno || !scelta) ? 0.45 : 1,
        }}>{lavoro ? "Attendi…" : "Collega"}</button>
      </div>
    </div>
  );
}
