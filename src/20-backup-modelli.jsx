import { useState, useEffect, useMemo } from "react";
import { supabase } from "./11-supabase";
import { scaricaFileTesto } from "./18-scarica-file";

// Copie di emergenza PER MODELLO (tabella backup_per_modello, riempita dal database ogni domenica).
// Ogni copia contiene il modello e tutti i suoi eventi. Qui: elenco, ripristino di un solo modello, scarico file.
export function BackupPerModello({ T }) {
  const [elenco, setElenco] = useState(null);
  const [cerca, setCerca] = useState("");
  const [msg, setMsg] = useState("");
  const [lavoro, setLavoro] = useState(false);

  async function carica() {
    try {
      const { data, error } = await supabase.rpc("backup_modelli_elenco");
      if (error) throw error;
      setElenco(Array.isArray(data) ? data : []);
    } catch (e) { setElenco([]); setMsg("❌ Elenco non caricato: " + (e?.message || e)); }
  }
  useEffect(() => { carica(); }, []);

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (elenco || []).filter(x => !q || String(x.titolo || "").toLowerCase().includes(q));
  }, [elenco, cerca]);

  async function scarica(x) {
    setLavoro(true); setMsg("");
    try {
      const { data, error } = await supabase.rpc("backup_modello_dati", { p_modello_id: x.modello_id, p_batch_id: x.batch_id });
      if (error) throw error;
      const nome = String(x.titolo || "modello").replace(/[^\w\-]+/g, "_").slice(0, 40);
      await scaricaFileTesto(`turnipm_modello_${nome}.json`, JSON.stringify(data, null, 2));
    } catch (e) { setMsg("❌ Scarico non riuscito: " + (e?.message || e)); }
    setLavoro(false);
  }

  async function ripristina(x) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setMsg("❌ Sei offline: nulla è stato modificato."); return; }
    if (!window.confirm(`Ripristinare il modello "${x.titolo}" con i suoi ${x.n_eventi} eventi com'erano il ${new Date(x.creato_il).toLocaleString("it-IT")}? Gli altri modelli non vengono toccati. Prima viene salvata una copia dello stato attuale.`)) return;
    setLavoro(true); setMsg("⏳ Ripristino in corso...");
    try {
      const { data, error } = await supabase.rpc("ripristina_modello", { p_modello_id: x.modello_id, p_batch_id: x.batch_id });
      if (error) throw error;
      setMsg(`✅ Ripristinato "${data?.modello || x.titolo}": ${data?.eventi_ripristinati ?? 0} eventi. Ricarico l'app...`);
      try { localStorage.setItem("turnipm_pull_da_supabase", "1"); } catch (e) {}
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) { setLavoro(false); setMsg("❌ Ripristino non riuscito: " + (e?.message || e) + ". Nulla è cambiato."); }
  }

  const btn = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 9px", fontSize: 12, fontWeight: 800, color: T.text, cursor: "pointer" };
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: T.text }}>🧩 Copie per modello (emergenza)</div>
      <div style={{ fontSize: 11, color: T.sub, margin: "2px 0 8px" }}>
        Ogni modello con tutti i suoi eventi in una copia sola. {elenco && elenco.length ? `Ultima copia: ${new Date(elenco.reduce((a, x) => (x.creato_il > a ? x.creato_il : a), "")).toLocaleString("it-IT")}` : ""}
      </div>
      {msg && <div style={{ fontSize: 12, color: T.text, background: T.s2, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>{msg}</div>}
      <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca modello..."
        style={{ width: "100%", boxSizing: "border-box", background: T.s2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 13, marginBottom: 8 }} />
      {elenco === null ? (
        <div style={{ fontSize: 12, color: T.sub, padding: 8 }}>⏳ Caricamento...</div>
      ) : filtrati.length === 0 ? (
        <div style={{ fontSize: 12, color: T.sub, padding: 8 }}>Nessuna copia trovata.</div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {filtrati.map(x => (
            <div key={x.modello_id} style={{ display: "flex", gap: 6, alignItems: "center", background: T.s2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.titolo}</div>
                <div style={{ fontSize: 11, color: T.sub }}>{x.n_eventi} eventi · {new Date(x.creato_il).toLocaleDateString("it-IT")}</div>
              </div>
              <button disabled={lavoro} onClick={() => scarica(x)} style={btn} aria-label="Scarica">⬇️</button>
              <button disabled={lavoro} onClick={() => ripristina(x)} style={btn}>Ripristina</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
