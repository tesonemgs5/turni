// Elenco modelli a TENDINE, uguale a quello della lista Modelli > Turni (stessa regola, stesso aspetto):
//  · ordine B = gruppi veri nell'ordine in cui si vedono, poi i modelli senza gruppo;
//  · ordine A = tendine automatiche per classe (APP, AUTO, DISTACCATI, FESTIVI, PI, H24, PERSONALIZZATO, lettere),
//    oppure i gruppi veri se per quel calendario esistono;
//  · tutti i calendari insieme: i gruppi con lo stesso nome si uniscono; con la ricerca attiva l'elenco e' piatto.
// Serve a tutte le liste che richiamano i modelli (selettori, colori, rotazioni, report...), cosi' hanno lo stesso sistema.
import { useState, Fragment, createContext, useContext } from "react";
import { classeModelloA, ordinaClassiA, minutiInizio } from "./21-ordine";

// Valori condivisi (ordine A/B, gruppi...) forniti una volta sola dalla schermata principale: cosi' ogni lista li trova da se'.
export const ContestoTendine = createContext(null);

export function costruisciSezioni({ modelli, ordine, calId, mainCalId, gruppiDelCalendario, gruppi, cercando, estrai }) {
  const mod = (x) => (estrai ? estrai(x) : x);
  const lista = (modelli || []).filter(Boolean);
  if (cercando) return { blocchi: [], senza: lista };
  const gruppoDi = (x) => { const m = mod(x); return ordine === "A" ? m.gruppoA : m.gruppoB; };
  const perInizio = (arr) => arr; // dentro la tendina vale la posizione salvata (si sposta a mano)
  const veriA = !!calId && ordine === "A" && (gruppiDelCalendario ? gruppiDelCalendario(calId, "A") : []).length > 0;
  if (ordine === "A" && !veriA) {
    const perClasse = new Map();
    lista.forEach((m) => { const k = classeModelloA(mod(m)); if (!perClasse.has(k)) perClasse.set(k, []); perClasse.get(k).push(m); });
    return { blocchi: ordinaClassiA([...perClasse.keys()]).map((k) => ({ key: "C:" + k, label: k, modelli: perClasse.get(k) })), senza: [] };
  }
  if (calId) {
    const gl = gruppiDelCalendario ? gruppiDelCalendario(calId, ordine) : [];
    const perId = new Map(gl.map((g) => [g.id, { key: "G:" + g.id, label: g.nome, modelli: [] }]));
    const senza = [];
    lista.forEach((m) => {
      const gid = gruppoDi(m);
      const sez = (mod(m).calendarId || mainCalId) === calId && gid ? perId.get(gid) : null;
      if (sez) sez.modelli.push(m); else senza.push(m);
    });
    return { blocchi: gl.map((g) => perId.get(g.id)).filter((b) => b.modelli.length > 0).map((b) => ({ ...b, modelli: perInizio(b.modelli) })), senza: perInizio(senza) };
  }
  const perNome = new Map(); const senza = [];
  lista.forEach((m) => {
    const gid = gruppoDi(m);
    const g = gid ? (gruppi || []).find((x) => x.id === gid && x.ordine === ordine) : null;
    if (!g) { senza.push(m); return; }
    const nk = String(g.nome || "").toUpperCase();
    let sez = perNome.get(nk);
    if (!sez) { sez = { key: "N:" + nk, label: g.nome, ord: g.sortOrder || 0, modelli: [] }; perNome.set(nk, sez); }
    sez.modelli.push(m);
  });
  return { blocchi: [...perNome.values()].sort((a, b) => (a.ord - b.ord) || String(a.label).localeCompare(String(b.label))).map((b) => ({ ...b, modelli: perInizio(b.modelli) })), senza: perInizio(senza) };
}

// Pulsante A/B, identico a quello della lista Modelli.
export function PulsanteOrdineAB(props) {
  const ctx = useContext(ContestoTendine) || {};
  const ordine = props.ordine ?? ctx.ordine, onCambia = props.onCambia || ctx.cambiaOrdine, T = props.T || ctx.T, accent = props.accent || ctx.accent;
  if (!T || !onCambia) return null;
  return (
    <button onClick={() => onCambia(ordine === "A" ? "B" : "A")}
      title={ordine === "A" ? "Ordine alfabetico (A) — tocca per passare all'ordine per orario (B)" : "Ordine per orario (B) — tocca per passare all'ordine alfabetico (A)"}
      style={{ background: T.s2, border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "6px 9px", fontSize: 15, fontWeight: 700, cursor: "pointer", color: T.sub, flexShrink: 0 }}>
      <span style={{ color: ordine === "A" ? accent : T.sub, fontWeight: ordine === "A" ? 900 : 600 }}>A</span>
      <span style={{ color: T.sub }}>/</span>
      <span style={{ color: ordine === "B" ? accent : T.sub, fontWeight: ordine === "B" ? 900 : 600 }}>B</span>
    </button>
  );
}

// chiave = nome della lista (ricorda quali tendine erano aperte). renderRiga(m, i, arr) disegna la riga del modello.
export function ElencoModelliTendine(props) {
  const ctx = useContext(ContestoTendine) || {};
  const { modelli, calId, cercando, chiave, renderRiga, estrai, stileContenitore, selezionati, onSelezionaGruppo } = props;
  const ordine = props.ordine ?? ctx.ordine, mainCalId = props.mainCalId ?? ctx.mainCalId, gruppiDelCalendario = props.gruppiDelCalendario || ctx.gruppiDelCalendario, gruppi = props.gruppi || ctx.gruppi, T = props.T || ctx.T;
  const LS = "turnipm_tendine_aperte_" + (chiave || "x");
  const [aperte, setAperte] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(LS) || "[]")); } catch (e) { return new Set(); } });
  const salva = (s) => { setAperte(s); try { localStorage.setItem(LS, JSON.stringify([...s])); } catch (e) {} };
  const { blocchi, senza } = costruisciSezioni({ modelli, ordine, calId, mainCalId, gruppiDelCalendario, gruppi, cercando, estrai });
  const chiavi = blocchi.map((b) => b.key);
  const tutteAperte = chiavi.length > 0 && chiavi.every((k) => aperte.has(k));
  const ordinati = [...blocchi.flatMap((b) => b.modelli), ...senza];
  const toggle = (k) => { const s = new Set(aperte); if (s.has(k)) s.delete(k); else s.add(k); salva(s); };
  // Tendina «SELEZIONATI» in testa (solo se chi usa l'elenco passa `selezionati`): i modelli scelti, nell'ordine attivo.
  const LS_SEL = "turnipm_sel_aperta_" + (chiave || "x");
  const [selAperta, setSelAperta] = useState(() => { try { return localStorage.getItem(LS_SEL) !== "0"; } catch (e) { return true; } });
  const selSet = new Set(selezionati || []);
  // In ordine A la lista dei selezionati e' in ORDINE DI INIZIO TURNO (ora d'inizio crescente, senza orario in fondo);
  // a parita' resta l'ordine delle tendine sotto. In ordine B resta l'ordine per orario che gia' hanno.
  const selBase = (!cercando && selSet.size > 0) ? ordinati.filter((m) => selSet.has((estrai ? estrai(m) : m).id)) : [];
  const selLista = ordine === "A"
    ? selBase.map((m, i) => ({ m, i })).sort((a, b) => (minutiInizio(estrai ? estrai(a.m) : a.m) - minutiInizio(estrai ? estrai(b.m) : b.m)) || (a.i - b.i)).map((x) => x.m)
    : selBase;
  const toggleSel = () => { const n = !selAperta; setSelAperta(n); try { localStorage.setItem(LS_SEL, n ? "1" : "0"); } catch (e) {} };
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 12, ...(stileContenitore || {}) }}>
      {chiavi.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 12px", background: T.surface, borderBottom: `1px solid ${T.border}`, width: "100%", boxSizing: "border-box" }}>
          <button onClick={() => salva(tutteAperte ? new Set() : new Set(chiavi))}
            style={{ background: T.s2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, padding: "5px 10px", cursor: "pointer", fontWeight: 800, fontSize: 12 }}>
            {tutteAperte ? "▶ Chiudi tutti" : "▼ Apri tutti"}
          </button>
        </div>
      )}
      {selLista.length > 0 && (
        <Fragment key="__SEL__">
          <div onClick={toggleSel}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: T.s2, fontSize: 12, fontWeight: 900, letterSpacing: 0.5, color: T.text, cursor: "pointer", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ flex: 1, minWidth: 0 }}>✅ SELEZIONATI</span>
            <span style={{ color: T.sub, fontWeight: 700, marginRight: 10 }}>{selLista.length}</span>
            <span style={{ fontSize: 13 }}>{selAperta ? "▼" : "▶"}</span>
          </div>
          {selAperta && selLista.map((m) => renderRiga(m, selLista.indexOf(m), selLista))}
        </Fragment>
      )}
      {blocchi.map((b) => {
        const aperto = aperte.has(b.key);
        // Con una selezione (prop `selezionati`): accanto al nome si vede «selezionati / totale del gruppo», non solo il totale.
        const nSelB = selezionati ? b.modelli.filter((m) => selSet.has((estrai ? estrai(m) : m).id)).length : 0;
        return (
          <Fragment key={b.key}>
            <div onClick={() => toggle(b.key)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: T.s2, fontSize: 12, fontWeight: 900, letterSpacing: 0.5, color: T.text, borderBottom: `1px solid ${T.border}`, cursor: "pointer", width: "100%", boxSizing: "border-box" }}>
              {onSelezionaGruppo && (() => {
                const ids = b.modelli.map((m) => (estrai ? estrai(m) : m).id);
                const n = ids.filter((id) => selSet.has(id)).length;
                const tutti = n === ids.length && n > 0, parziale = n > 0 && !tutti;
                const acc = props.accent || ctx.accent || "#2563eb";
                return (
                  <div onClick={(e) => { e.stopPropagation(); onSelezionaGruppo(b.modelli, !tutti); }}
                    title={tutti ? "Deseleziona tutto il gruppo" : "Seleziona tutto il gruppo"}
                    style={{ width: 20, height: 20, borderRadius: 6, marginRight: 10, flexShrink: 0, border: `2px solid ${n > 0 ? acc : T.border}`, background: tutti ? acc : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {tutti && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
                    {parziale && <span style={{ color: acc, fontSize: 14, fontWeight: 900, lineHeight: 1 }}>–</span>}
                  </div>
                );
              })()}
              <span style={{ flex: 1, minWidth: 0 }}>{b.label}</span>
              <span style={{ color: T.sub, fontWeight: 700, marginRight: 10 }}>{selezionati ? (<span title="modelli selezionati / modelli del gruppo"><b style={{ color: nSelB > 0 ? (props.accent || ctx.accent || T.text) : T.sub }}>{nSelB}</b>/{b.modelli.length}</span>) : b.modelli.length}</span>
              <span style={{ fontSize: 13 }}>{aperto ? "▼" : "▶"}</span>
            </div>
            {aperto && b.modelli.map((m) => renderRiga(m, ordinati.indexOf(m), ordinati))}
          </Fragment>
        );
      })}
      {senza.map((m) => renderRiga(m, ordinati.indexOf(m), ordinati))}
    </div>
  );
}
