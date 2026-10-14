import { useState, useEffect } from "react";
import { infoCartella, scegliCartella, dimenticaCartella, salvaInCartella, salvaConNome, condividi } from "./18-scarica-file";

// Dialogo mostrato nell'APK quando si scarica un file (vedi scaricaFileTesto).
// Montato una sola volta in 01-App. Ascolta l'evento "turni-scarica".
export function DialogoScarica({ T }) {
  const [rich, setRich] = useState(null);       // { nome, testo, risolvi }
  const [cartella, setCartella] = useState({ presente: false });
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState(null);         // { tipo:"ok"|"errore", testo }

  useEffect(() => {
    function onRichiesta(e) {
      e.detail.gestito = true;
      setMsg(null); setLavoro(false);
      setRich({ nome: e.detail.nome, testo: e.detail.testo, risolvi: e.detail.risolvi });
      infoCartella().then(setCartella);
    }
    window.addEventListener("turni-scarica", onRichiesta);
    return () => window.removeEventListener("turni-scarica", onRichiesta);
  }, []);

  if (!rich) return null;

  function chiudi(esito) {
    const r = rich;
    setRich(null);
    r.risolvi(esito);
  }
  async function esegui(fn, testoOk) {
    setLavoro(true); setMsg(null);
    const r = await fn();
    setLavoro(false);
    if (r && r.annullato) return;                       // chiuso il selettore: si resta nel dialogo
    if (r && r.ok === false) { setMsg({ tipo: "errore", testo: "❌ " + (r.errore || "Operazione non riuscita.") }); return; }
    setMsg({ tipo: "ok", testo: testoOk(r) });
    setTimeout(() => chiudi({ ok: true }), 1300);
  }
  async function salvaNellaCartella() {
    if (!cartella.presente) {
      setLavoro(true); setMsg(null);
      const s = await scegliCartella();
      setLavoro(false);
      if (s && s.annullato) return;
      if (!s || s.ok === false) { setMsg({ tipo: "errore", testo: "❌ " + ((s && s.errore) || "Cartella non utilizzabile.") }); return; }
      setCartella({ presente: true, nome: s.nome });
    }
    await esegui(() => salvaInCartella(rich.nome, rich.testo), r => `✅ Salvato in ${(r && r.cartella) || cartella.nome || "cartella"}: ${rich.nome}`);
  }
  async function cambiaCartella() {
    setLavoro(true); setMsg(null);
    const s = await scegliCartella();
    setLavoro(false);
    if (s && s.ok) setCartella({ presente: true, nome: s.nome });
    else if (s && s.ok === false && !s.annullato) setMsg({ tipo: "errore", testo: "❌ " + (s.errore || "Cartella non utilizzabile.") });
  }
  async function togliCartella() {
    await dimenticaCartella();
    setCartella({ presente: false });
  }

  const bott = (primario) => ({
    width: "100%", textAlign: "left", padding: "13px 14px", marginBottom: 8, borderRadius: 12, cursor: lavoro ? "wait" : "pointer",
    fontSize: 14, fontWeight: 800, color: primario ? "#fff" : T.text, opacity: lavoro ? 0.6 : 1,
    background: primario ? "#2563eb" : T.s2, border: `1px solid ${primario ? "#2563eb" : T.border}`,
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100002, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={() => { if (!lavoro) chiudi({ ok: true, annullato: true }); }}>
      <div style={{ background: T.surface, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480, padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 900, color: T.text }}>Salva file</div>
        <div style={{ fontSize: 12, color: T.sub, margin: "2px 0 12px", wordBreak: "break-all" }}>{rich.nome}</div>

        <button disabled={lavoro} style={bott(true)} onClick={salvaNellaCartella}>
          {cartella.presente ? `📁 Salva in «${cartella.nome}»` : "📁 Scegli una cartella e salva"}
        </button>
        <button disabled={lavoro} style={bott(false)} onClick={() => esegui(() => salvaConNome(rich.nome, rich.testo), () => `✅ File salvato: ${rich.nome}`)}>
          🗂️ Salva con nome… (scegli dove)
        </button>
        <button disabled={lavoro} style={bott(false)} onClick={() => esegui(() => condividi(rich.nome, rich.testo), () => "✅ Fatto")}>
          📤 Condividi…
        </button>

        {cartella.presente && (
          <div style={{ display: "flex", gap: 16, margin: "2px 0 8px", fontSize: 12 }}>
            <span onClick={() => { if (!lavoro) cambiaCartella(); }} style={{ color: "#2563eb", fontWeight: 800, cursor: "pointer" }}>Cambia cartella</span>
            <span onClick={() => { if (!lavoro) togliCartella(); }} style={{ color: T.sub, fontWeight: 700, cursor: "pointer" }}>Non usare più la cartella</span>
          </div>
        )}
        {!cartella.presente && (
          <div style={{ fontSize: 11, color: T.sub, margin: "0 0 8px" }}>
            Su Android 11 o successivo non puoi scegliere direttamente «Download»: crea al suo interno una cartella (es. Turni) e scegli quella. La scelta resta memorizzata per tutti i salvataggi.
          </div>
        )}
        {msg && (
          <div style={{ fontSize: 13, fontWeight: 800, margin: "4px 0 8px", color: msg.tipo === "ok" ? "#10b981" : "#ef4444" }}>{msg.testo}</div>
        )}
        <button disabled={lavoro} style={{ ...bott(false), textAlign: "center", marginBottom: 0 }} onClick={() => chiudi({ ok: true, annullato: true })}>Annulla</button>
      </div>
    </div>
  );
}
