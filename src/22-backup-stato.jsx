import { useState, useEffect } from "react";
import { supabase } from "./11-supabase";

// Blocco nelle Impostazioni → Backup automatici: scelta di frequenza e numero delle copie PER MODELLO,
// data dell'ultimo backup riuscito (completo e per modello) e avviso se un backup non parte.
const fmt = (x) => { try { return new Date(x).toLocaleString("it-IT", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }); } catch(e){ return "?"; } };

export function BackupModelliConfigEStato({ T, userId }) {
  const [cfg, setCfg] = useState({ frequenza: "settimanale", max: 4 });
  const [stato, setStato] = useState(null);
  const [msg, setMsg] = useState("");

  async function carica() {
    try {
      const [c, s] = await Promise.all([supabase.rpc("backup_modelli_config_leggi"), supabase.rpc("backup_stato")]);
      if (!c.error && c.data) setCfg({ frequenza: c.data.frequenza, max: c.data.max });
      if (!s.error && s.data) setStato(s.data);
    } catch (e) {}
  }
  useEffect(() => { if (userId) carica(); }, [userId]);

  async function salva(frequenza, max) {
    const prima = cfg;
    setCfg({ frequenza, max }); setMsg("");
    try {
      const { error } = await supabase.rpc("backup_modelli_config_salva", { p_frequenza: frequenza, p_max: max });
      if (error) throw error;
      setMsg("✅ Salvato");
      carica();
    } catch (e) { setCfg(prima); setMsg("❌ Non salvato: " + (e?.message || e)); }
  }

  const sel = { background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 12, fontWeight: 700 };
  const avvisi = (stato && stato.avvisi) || [];
  const avvCompleto = avvisi.some(a => /completo/i.test(a));
  const avvModelli = avvisi.some(a => /modello/i.test(a));
  const riga = { fontSize: 11.5, color: T.text, margin: "3px 0" };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 8 }}>🧩 Copie per modello</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, color: T.sub, flex: 1 }}>Ogni quanto</span>
        <select value={cfg.frequenza} onChange={e => salva(e.target.value, cfg.max)} style={sel}>
          <option value="disattivato">Disattivato</option>
          <option value="giornaliero">Ogni giorno</option>
          <option value="settimanale">Ogni settimana</option>
          <option value="mensile">Ogni mese</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11.5, color: T.sub, flex: 1 }}>Quante tenerne</span>
        <select value={cfg.max} onChange={e => salva(cfg.frequenza, parseInt(e.target.value, 10))} style={sel}>
          {[1, 2, 3, 4, 5, 8, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {msg && <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{msg}</div>}

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${T.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 4 }}>🕓 Ultimo backup riuscito</div>
        {!stato ? <div style={{ ...riga, color: T.sub }}>⏳ Controllo...</div> : (
          <>
            <div style={riga}>{avvCompleto ? "⚠️" : "✅"} Completo: <b>{stato.completo?.ultimo_qualsiasi ? fmt(stato.completo.ultimo_qualsiasi) : "mai"}</b></div>
            <div style={riga}>{avvModelli ? "⚠️" : "✅"} Per modello: <b>{stato.modelli?.ultima ? fmt(stato.modelli.ultima) : "mai"}</b></div>
            {avvisi.map((a, i) => <div key={i} style={{ ...riga, color: "#ef4444", fontWeight: 700 }}>⚠️ {a}</div>)}
          </>
        )}
      </div>
    </div>
  );
}

// ── Esito di «Importa da Supabase» (e dei ricaricamenti dopo un ripristino) ──
// L'importazione avviene all'avvio dell'app, dopo un ricaricamento: l'esito si salva sul dispositivo e questa finestra lo mostra.
const CHIAVE_ESITO_IMPORT = "turnipm_esito_import";
export function scriviEsitoImport(o) {
  try { localStorage.setItem(CHIAVE_ESITO_IMPORT, JSON.stringify({ ...o, quando: Date.now() })); } catch (e) {}
  try { window.dispatchEvent(new Event("turnipm-esito-import")); } catch (e) {}
}
export function EsitoImportSupabase({ T }) {
  const [esito, setEsito] = useState(null);
  useEffect(() => {
    const leggi = () => {
      try {
        const raw = localStorage.getItem(CHIAVE_ESITO_IMPORT);
        if (!raw) return;
        const o = JSON.parse(raw);
        if (o && Date.now() - (o.quando || 0) < 10 * 60 * 1000) setEsito(o);
        else localStorage.removeItem(CHIAVE_ESITO_IMPORT);
      } catch (e) {}
    };
    leggi();
    window.addEventListener("turnipm-esito-import", leggi);
    return () => window.removeEventListener("turnipm-esito-import", leggi);
  }, []);
  if (!esito) return null;
  const chiudi = () => { try { localStorage.removeItem(CHIAVE_ESITO_IMPORT); } catch (e) {} setEsito(null); };
  return (
    <div onClick={chiudi} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: T.surface, border: `1px solid ${esito.ok ? "#10b981" : "#ef4444"}`, borderRadius: 16, color: T.text, width: "100%", maxWidth: 380, maxHeight: "80vh", overflowY: "auto", padding: "22px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 6 }}>{esito.ok ? "✅" : "⚠️"}</div>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{esito.titolo || "Importa da Supabase"}</div>
        <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5, wordBreak: "break-word" }}>{esito.messaggio}</div>
        <button onClick={chiudi} style={{ marginTop: 16, width: "100%", background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", padding: "12px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Chiudi</button>
      </div>
    </div>
  );
}
