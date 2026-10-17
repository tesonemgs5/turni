import { useState, useEffect, useMemo } from "react";
import { supabase } from "./11-supabase";
import { scaricaFileTesto } from "./18-scarica-file";
import { leggiCodaSync } from "./04-Rotazione";

// Copie di emergenza PER MODELLO (tabella backup_per_modello, riempita dal database ogni domenica).
// Ogni copia contiene il modello e tutti i suoi eventi. Qui: elenco, ripristino di un solo modello, scarico file.
const orarioDi = x => (x.inizio || x.fine) ? `${x.inizio || "?"}–${x.fine || "?"}` : "senza orario";
const nomeOrario = x => `${x.titolo} · ${orarioDi(x)}`;

function BackupPerModello({ T }) {
  const [elenco, setElenco] = useState(null);
  const [cerca, setCerca] = useState("");
  const [msg, setMsg] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  // "Il resto": impostazioni, eventi senza modello, gruppi (copie in backup_resto, ripristino con ripristina_resto)
  const [restoAperto, setRestoAperto] = useState(false);
  const [copieResto, setCopieResto] = useState(null);
  const [copiaSel, setCopiaSel] = useState("");
  const [partiResto, setPartiResto] = useState(() => new Set());

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
    return (elenco || []).filter(x => !q || nomeOrario(x).toLowerCase().includes(q));
  }, [elenco, cerca]);

  async function scarica(x) {
    setLavoro(true); setMsg("");
    try {
      const { data, error } = await supabase.rpc("backup_modello_dati", { p_modello_id: x.modello_id, p_batch_id: x.batch_id });
      if (error) throw error;
      const nome = nomeOrario(x).replace(/[^\w\-]+/g, "_").slice(0, 50);
      await scaricaFileTesto(`turnipm_modello_${nome}.json`, JSON.stringify(data, null, 2));
    } catch (e) { setMsg("❌ Scarico non riuscito: " + (e?.message || e)); }
    setLavoro(false);
  }

  async function ripristina(x) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setMsg("❌ Sei offline: nulla è stato modificato."); return; }
    if (!window.confirm(`Ripristinare il modello "${nomeOrario(x)}" con i suoi ${x.n_eventi} eventi com'erano il ${new Date(x.creato_il).toLocaleString("it-IT")}? Gli altri modelli non vengono toccati. Prima viene salvata una copia dello stato attuale.`)) return;
    setLavoro(true); setMsg("⏳ Ripristino in corso...");
    try {
      const { data, error } = await supabase.rpc("ripristina_modello", { p_modello_id: x.modello_id, p_batch_id: x.batch_id });
      if (error) throw error;
      setMsg(`✅ Ripristinato "${nomeOrario(x)}": ${data?.eventi_ripristinati ?? 0} eventi. Ricarico l'app...`);
      try { localStorage.setItem("turnipm_pull_da_supabase", "1"); } catch (e) {}
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) { setLavoro(false); setMsg("❌ Ripristino non riuscito: " + (e?.message || e) + ". Nulla è cambiato."); }
  }

  const selezionati = (elenco || []).filter(x => sel.has(x.modello_id));
  const eventiSel = selezionati.reduce((t, x) => t + (x.n_eventi || 0), 0);
  function toggle(id) { setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function selezionaTutti() { setSel(prev => { const n = new Set(prev); filtrati.forEach(x => n.add(x.modello_id)); return n; }); }

  async function ripristinaSelezionati() {
    if (!selezionati.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setMsg("❌ Sei offline: nulla è stato modificato."); return; }
    if (!window.confirm(`Ripristinare ${selezionati.length} modelli con i loro ${eventiSel} eventi, come nell'ultima copia? Gli altri modelli non vengono toccati. Prima viene salvata una copia dello stato attuale. Se uno fallisce, non cambia nulla.`)) return;
    setLavoro(true); setMsg("⏳ Ripristino in corso...");
    try {
      const { data, error } = await supabase.rpc("ripristina_modelli", { p_ids: selezionati.map(x => x.modello_id) });
      if (error) throw error;
      setMsg(`✅ Ripristinati ${data?.modelli_ripristinati ?? selezionati.length} modelli, ${data?.eventi_ripristinati ?? 0} eventi. Ricarico l'app...`);
      try { localStorage.setItem("turnipm_pull_da_supabase", "1"); } catch (e) {}
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) { setLavoro(false); setMsg("❌ Ripristino non riuscito: " + (e?.message || e) + ". Nulla è cambiato."); }
  }

  async function caricaResto() {
    try {
      const { data, error } = await supabase.rpc("backup_resto_elenco");
      if (error) throw error;
      const l = data || [];
      setCopieResto(l);
      if (l[0]) setCopiaSel(l[0].batch_id);
    } catch (e) { setCopieResto([]); setMsg("❌ Non riesco a leggere le copie del resto: " + (e?.message || e)); }
  }
  useEffect(() => { if (restoAperto && copieResto === null) caricaResto(); }, [restoAperto]);
  const copiaResto = (copieResto || []).find(c => c.batch_id === copiaSel) || null;
  const disponibile = (c, parte) => !!c && (parte === "impostazioni" ? c.ha_impostazioni : parte === "gruppi" ? c.n_gruppi !== null && c.n_gruppi !== undefined : true);
  const partiValide = ["impostazioni", "eventi", "gruppi"].filter(k => partiResto.has(k) && disponibile(copiaResto, k));
  function toggleParte(k) { setPartiResto(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }
  async function ripristinaResto() {
    const c = copiaResto;
    if (!c || partiValide.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setMsg("❌ Sei offline: nulla è stato modificato."); return; }
    let coda = []; try { coda = leggiCodaSync(); } catch (e) {}
    if (Array.isArray(coda) && coda.length > 0) { setMsg("⚠️ Ci sono modifiche di questo dispositivo non ancora inviate a Supabase: aspetta che arrivino, poi riprova. Nulla è stato modificato."); return; }
    const nomi = { impostazioni: "Impostazioni (giorni importanti, colori delle fasce, festività…)", eventi: `Eventi senza modello (${c.n_eventi})`, gruppi: `Gruppi dei modelli (${c.n_gruppi})` };
    if (!window.confirm(`Ripristinare dalla copia del ${new Date(c.creato_il).toLocaleString("it-IT")}:\n${partiValide.map(k => "• " + nomi[k]).join("\n")}\n\nImpostazioni ed eventi senza modello attuali vengono sostituiti da quelli della copia; i gruppi non cancellano nulla. Prima viene salvata una copia dello stato attuale. Continuare?`)) return;
    setLavoro(true); setMsg("⏳ Ripristino in corso...");
    try {
      const { data, error } = await supabase.rpc("ripristina_resto", { p_batch_id: c.batch_id, p_parti: partiValide });
      if (error) throw error;
      setMsg(`✅ Ripristinato: impostazioni ${data?.impostazioni_ripristinate ? "sì" : "no"}, ${data?.eventi_senza_modello_ripristinati ?? 0} eventi senza modello, ${data?.gruppi_ripristinati ?? 0} gruppi. Ricarico l'app...`);
      try { localStorage.setItem("turnipm_pull_da_supabase", "1"); } catch (e) {}
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) { setLavoro(false); setMsg("❌ Ripristino non riuscito: " + (e?.message || e) + ". Nulla è cambiato."); }
  }

  const btn = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 9px", fontSize: 12, fontWeight: 800, color: T.text, cursor: "pointer" };
  return (
    <div>
      <div style={{ fontSize: 11, color: T.sub, margin: "2px 0 8px" }}>
        Ogni modello con tutti i suoi eventi in una copia sola. {elenco && elenco.length ? `Ultima copia: ${new Date(elenco.reduce((a, x) => (x.creato_il > a ? x.creato_il : a), "")).toLocaleString("it-IT")}` : ""}
      </div>
      {msg && <div style={{ fontSize: 12, color: T.text, background: T.s2, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>{msg}</div>}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10, background: T.s2 }}>
        <div onClick={() => setRestoAperto(v => !v)} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 12px", cursor: "pointer", fontSize: 13, fontWeight: 800, color: T.text }}>
          <span>⚙️ Il resto: impostazioni, eventi senza modello, gruppi</span><span>{restoAperto ? "▼" : "▶"}</span>
        </div>
        {restoAperto && (
          <div style={{ padding: "0 12px 12px" }}>
            {copieResto === null ? (
              <div style={{ fontSize: 12, color: T.sub }}>⏳ Caricamento...</div>
            ) : copieResto.length === 0 ? (
              <div style={{ fontSize: 12, color: T.sub }}>Nessuna copia del resto trovata.</div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: 6 }}>Copia del:</div>
                <select value={copiaSel} onChange={e => setCopiaSel(e.target.value)} disabled={lavoro}
                  style={{ width: "100%", boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 13, marginBottom: 8 }}>
                  {copieResto.map(c => <option key={c.batch_id} value={c.batch_id}>{new Date(c.creato_il).toLocaleString("it-IT")}</option>)}
                </select>
                {[["impostazioni", "Impostazioni (giorni importanti, colori delle fasce, festività…)"], ["eventi", `Eventi senza modello (${copiaResto ? copiaResto.n_eventi : 0})`], ["gruppi", copiaResto && copiaResto.n_gruppi !== null && copiaResto.n_gruppi !== undefined ? `Gruppi dei modelli (${copiaResto.n_gruppi})` : "Gruppi dei modelli (non presenti in questa copia)"]].map(([k, lab]) => {
                  const ok = disponibile(copiaResto, k);
                  return (
                    <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", fontSize: 13, color: ok ? T.text : T.sub, opacity: ok ? 1 : 0.6 }}>
                      <input type="checkbox" disabled={lavoro || !ok} checked={ok && partiResto.has(k)} onChange={() => toggleParte(k)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                      <span>{lab}</span>
                    </label>
                  );
                })}
                <button disabled={lavoro || partiValide.length === 0} onClick={ripristinaResto}
                  style={{ width: "100%", marginTop: 8, background: partiValide.length === 0 ? T.s2 : "#dc2626", border: `1px solid ${T.border}`, borderRadius: 10, color: partiValide.length === 0 ? T.sub : "#fff", padding: "11px 0", fontWeight: 900, fontSize: 13, cursor: partiValide.length === 0 ? "default" : "pointer" }}>
                  Ripristina parti selezionate{partiValide.length ? ` (${partiValide.length})` : ""}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca per nome o orario..."
        style={{ width: "100%", boxSizing: "border-box", background: T.s2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 13, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <button disabled={lavoro} onClick={selezionaTutti} style={btn}>☑️ Seleziona tutti{cerca.trim() ? " (filtrati)" : ""}</button>
        <button disabled={lavoro || sel.size === 0} onClick={() => setSel(new Set())} style={btn}>Nessuno</button>
        <span style={{ fontSize: 11.5, color: T.sub }}>{sel.size} selezionati</span>
      </div>
      {elenco === null ? (
        <div style={{ fontSize: 12, color: T.sub, padding: 8 }}>⏳ Caricamento...</div>
      ) : filtrati.length === 0 ? (
        <div style={{ fontSize: 12, color: T.sub, padding: 8 }}>Nessuna copia trovata.</div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {filtrati.map(x => (
            <div key={x.modello_id} style={{ display: "flex", gap: 6, alignItems: "center", background: T.s2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
              <input type="checkbox" checked={sel.has(x.modello_id)} onChange={() => toggle(x.modello_id)} disabled={lavoro}
                style={{ width: 20, height: 20, flexShrink: 0 }} aria-label="Seleziona" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{x.titolo} <span style={{ fontWeight: 900, color: "#2563eb", display: "inline-block", whiteSpace: "nowrap" }}>· {orarioDi(x)}</span></div>
                <div style={{ fontSize: 11, color: T.sub }}>{x.n_eventi} eventi · {new Date(x.creato_il).toLocaleDateString("it-IT")}</div>
              </div>
              <button disabled={lavoro} onClick={() => scarica(x)} style={btn} aria-label="Scarica">⬇️</button>
              <button disabled={lavoro} onClick={() => ripristina(x)} style={btn}>Ripristina</button>
            </div>
          ))}
        </div>
      )}
      {sel.size > 0 && (
        <button disabled={lavoro} onClick={ripristinaSelezionati}
          style={{ width: "100%", marginTop: 10, background: "#dc2626", border: "none", borderRadius: 10, color: "#fff", padding: "12px 0", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
          Ripristina selezionati ({sel.size} · {eventiSel} eventi)
        </button>
      )}
    </div>
  );
}

// Pulsante nel blocco Supabase delle Impostazioni: apre la finestra con le copie per modello.
export function BackupPerModelloPulsante({ T }) {
  const [aperto, setAperto] = useState(false);
  return (
    <>
      <button onClick={() => setAperto(true)}
        style={{ width: "100%", marginTop: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, padding: "10px 0", cursor: "pointer", fontWeight: 800, fontSize: 12 }}>
        🧩 Copie per modello (emergenza)
      </button>
      {aperto && (
        <div onClick={() => setAperto(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: T.surface, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "85vh", overflowY: "auto", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: T.text }}>🧩 Copie per modello</div>
              <button onClick={() => setAperto(false)} style={{ background: "none", border: "none", color: T.sub, fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <BackupPerModello T={T} />
          </div>
        </div>
      )}
    </>
  );
}

// Riga di stato sotto "Sincronizza ora": "Ok" oppure quante modifiche sono da sincronizzare, con dettaglio a scomparsa.
const NOMI_TAB = { events: "Eventi", modelli: "Modelli", calendars: "Calendari", rotazioni: "Rotazioni", colori: "Colori", gruppi_modelli: "Gruppi", autocomplete_valori: "Suggerimenti" };
export function StatoSync({ T, userId, refreshKey }) {
  const [coda, setCoda] = useState([]);
  const [aperto, setAperto] = useState(false);
  const [rx, setRx] = useState(null);

  useEffect(() => {
    const f = () => { try { setCoda(leggiCodaSync() || []); } catch (e) {} };
    f();
    const i = setInterval(f, 3000);
    return () => clearInterval(i);
  }, [refreshKey]);

  async function caricaRicevere() {
    setRx({ caricamento: true });
    try {
      let cursore = null; try { cursore = localStorage.getItem("turnipm_sync_cursore"); } catch (e) {}
      if (!cursore) { setRx({ nessunCursore: true }); return; }
      const { data, error } = await supabase.rpc("get_changes", { p_user_id: userId, p_since: cursore });
      if (error) throw error;
      const el = data?.eliminati || [];
      setRx({
        Eventi: (data?.events || []).length, Modelli: (data?.modelli || []).length, Calendari: (data?.calendars || []).length,
        Rotazioni: (data?.rotazioni || []).length, Colori: (data?.colori || []).length, Eliminati: el.length,
      });
    } catch (e) { setRx({ errore: e?.message || String(e) }); }
  }
  useEffect(() => { if (aperto) caricaRicevere(); /* eslint-disable-next-line */ }, [aperto, refreshKey]);

  const perTipo = {};
  coda.forEach(o => { const k = `${NOMI_TAB[o.table] || o.table || "Altro"}: ${({ insert: "nuovi", update: "modificati", delete: "eliminati", upsert: "salvati" })[o.tipo] || o.tipo || "modifiche"}`; perTipo[k] = (perTipo[k] || 0) + 1; });
  const n = coda.length;
  const riga = { fontSize: 11.5, color: T.text, display: "flex", justifyContent: "space-between", padding: "2px 0" };

  return (
    <div style={{ marginTop: 6, background: T.s2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px" }}>
      <div onClick={() => setAperto(a => !a)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontSize: 12, fontWeight: 800, color: T.text }}>
        <span>{n === 0 ? "✅ Ok: niente da inviare" : `🕓 ${n} da sincronizzare`}</span>
        <span style={{ fontSize: 14 }}>{aperto ? "▲" : "▼"}</span>
      </div>
      {aperto && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, marginBottom: 2 }}>Da inviare a Supabase</div>
          {n === 0 ? <div style={{ ...riga, color: T.sub }}>Nessuna modifica in attesa.</div>
            : Object.entries(perTipo).map(([k, v]) => <div key={k} style={riga}><span>{k}</span><b>{v}</b></div>)}
          <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, margin: "8px 0 2px" }}>Da ricevere da Supabase</div>
          {!rx || rx.caricamento ? <div style={{ ...riga, color: T.sub }}>⏳ Controllo...</div>
            : rx.nessunCursore ? <div style={{ ...riga, color: T.sub }}>Punto di partenza non ancora impostato: premi «Sincronizza ora».</div>
            : rx.errore ? <div style={{ ...riga, color: "#ef4444" }}>❌ {rx.errore}</div>
            : Object.entries(rx).filter(([, v]) => v > 0).length === 0 ? <div style={{ ...riga, color: T.sub }}>Niente di nuovo.</div>
            : Object.entries(rx).filter(([, v]) => v > 0).map(([k, v]) => <div key={k} style={riga}><span>{k}</span><b>{v}</b></div>)}
        </div>
      )}
    </div>
  );
}
