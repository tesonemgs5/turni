// ═══════════════════════════════════════════════════════════════════════
// PATCH per 04-Rotazione.jsx
// ═══════════════════════════════════════════════════════════════════════
//
// NON è un file da caricare così com'è al posto del tuo 04-Rotazione.jsx
// reale: quel file contiene molte altre funzioni (MONTHS, DAYS, PALETTE,
// uid, firstDay, getShiftBand, minsOf, sameData, withEventoAggiornato,
// ecc.) che io non ho mai visto per intero, quindi non posso riscriverle
// senza rischiare di romperle.
//
// Questo file contiene SOLO i pezzi da sostituire/aggiungere dentro il
// tuo 04-Rotazione.jsx vero, più le istruzioni esatte di dove.
//
// Le 3 modifiche richieste:
//   1) Tolto il tipo "nlrs" (NL/RS classico) dalle opzioni selezionabili
//   2) Aggiunto il tipo "reperibilita" con la logica a scalare (8 giorni)
//   3) La rotazione "Personalizzata" ora è una griglia 7 righe (Lun..Dom)
//      x 52 colonne (settimane), con un modello scelto da una LISTA DI
//      MODELLI (con colore e dipendenze) invece che libera giorno-per-
//      giorno singolo.
//
// ═══════════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────────
// PARTE 1 — MODIFICA a 02-Modelli.jsx (e 01-App.jsx, se ha lo stesso
// elenco): togliere la riga "NL/RS classico" dalla lista dei tipi
// disponibili mostrata quando non ci sono ancora rotazioni.
// ─────────────────────────────────────────────────────────────────────
//
// In 02-Modelli.jsx, cerca questo blocco (intorno alla riga 500):
//
//   {[
//     ["🗓 Domeniche 1/4","1 domenica lavoro (festivo) + 3 riposo ogni 4 settimane"],
//     ["📅 RS/NL Scalante","RS venerdì→NL+7gg, poi giovedì, poi mercoledì... (salta domenica)"],
//     ["🔄 NL/RS classico","NL e RS a rotazione settimanale scalante"],
//     ["📋 Personalizzata","Griglia libera giorno per giorno"],
//   ].map(([t,d])=>(
//
// e sostituiscilo con:

const ELENCO_TIPI_ROTAZIONE_DISPONIBILI = [
  ["🗓 Domeniche 1/4","1 domenica lavoro (festivo) + 3 riposo ogni 4 settimane"],
  ["📅 RS/NL Scalante","RS venerdì→NL+7gg, poi giovedì, poi mercoledì... (salta domenica)"],
  ["📞 Reperibilità","Turno 14-24 e turno 00-14 a scalare ogni 8 giorni"],
  ["🗓️ Personalizzata","Griglia annuale 7 giorni x 52 settimane, a modelli"],
];
// (nel file reale questo va inserito al posto dell'array [ ... ].map(...) esistente)


// ─────────────────────────────────────────────────────────────────────
// PARTE 2 — RotazioneForm: i 4 bottoni "TIPO DI ROTAZIONE" nel modale
// "Nuova rotazione" (quello dello screenshot). Qui sotto la versione
// completa del form, con "NL/RS classico" tolto e "Reperibilità" al
// suo posto. Sostituisce la funzione RotazioneForm nel tuo
// 04-Rotazione.jsx.
// ─────────────────────────────────────────────────────────────────────

export function RotazioneForm({ T, form, setForm, accent, modelli, sortedModelli, onSave }) {
  const accentText = getContrastTextColor(accent);
  const listaModelli = sortedModelli || modelli || [];

  const TIPI = [
    { key: "personalizzata", label: "🗓️ Personalizzata" },
    { key: "domeniche",      label: "📅 Domeniche 1/4" },
    { key: "reperibilita",   label: "📞 Reperibilità" },
    { key: "nlrs_scalante",  label: "📆 RS/NL scalante" },
  ];

  function setTipo(tipo) {
    setForm(prev => ({ ...prev, tipo }));
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 8 }}>
        TIPO DI ROTAZIONE
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {TIPI.map(t => (
          <button key={t.key} type="button" onClick={() => setTipo(t.key)}
            style={{
              background: form.tipo === t.key ? accent : T.s2,
              color: form.tipo === t.key ? accentText : T.text,
              border: `1px solid ${form.tipo === t.key ? accent : T.border}`,
              borderRadius: 10, padding: "12px 10px", fontWeight: 700, fontSize: 13,
              cursor: "pointer", textAlign: "left"
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        TITOLO ROTAZIONE
      </div>
      <input value={form.titolo || ""} onChange={e => setForm(prev => ({ ...prev, titolo: e.target.value }))}
        placeholder="es. Reperibilità Team A"
        style={{ width: "100%", boxSizing: "border-box", background: T.s2, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 12px", color: T.text, fontSize: 14, marginBottom: 16 }} />

      {/* ── Campi specifici per REPERIBILITÀ ─────────────────────── */}
      {form.tipo === "reperibilita" && (
        <ReperibilitaFormFields T={T} form={form} setForm={setForm} accent={accent}
          accentText={accentText} modelli={listaModelli} />
      )}

      {/* ── Campi specifici per DOMENICHE 1/4 (esistenti, invariati) ── */}
      {form.tipo === "domeniche" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>MODELLO GIORNO LAVORO</div>
          <ModelloSelector T={T} modelli={listaModelli} value={form.modellaLavoroId}
            onChange={id => setForm(prev => ({ ...prev, modellaLavoroId: id }))} />
        </div>
      )}

      {/* ── Campi specifici per RS/NL scalante (esistenti, invariati) ── */}
      {form.tipo === "nlrs_scalante" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>MODELLO RS</div>
          <ModelloSelector T={T} modelli={listaModelli} value={form.modelloRSId}
            onChange={id => setForm(prev => ({ ...prev, modelloRSId: id }))} />
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, margin: "10px 0 6px" }}>MODELLO NL</div>
          <ModelloSelector T={T} modelli={listaModelli} value={form.modelloNLId}
            onChange={id => setForm(prev => ({ ...prev, modelloNLId: id }))} />
        </div>
      )}

      <button onClick={onSave}
        style={{ width: "100%", background: accent, color: accentText, border: "none", borderRadius: 10,
          padding: "13px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
        💾 Salva rotazione
      </button>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// PARTE 3 — Campi di configurazione della REPERIBILITÀ dentro il form:
// giorno della settimana di partenza + turno di partenza (14-24 oppure
// 00-14) + i due modelli-turno da usare.
// ─────────────────────────────────────────────────────────────────────

const GIORNI_SETTIMANA_FORM = [
  { key: 1, label: "Lun" }, { key: 2, label: "Mar" }, { key: 3, label: "Mer" },
  { key: 4, label: "Gio" }, { key: 5, label: "Ven" }, { key: 6, label: "Sab" },
  { key: 0, label: "Dom" },
];

export function ReperibilitaFormFields({ T, form, setForm, accent, accentText, modelli }) {
  const giornoPartenza = form.reperibilitaGiornoPartenza ?? 1; // default lunedì
  const turnoPartenza = form.reperibilitaTurnoPartenza || "14-24"; // "14-24" | "00-14"

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        GIORNO DI PARTENZA
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {GIORNI_SETTIMANA_FORM.map(g => (
          <button key={g.key} type="button"
            onClick={() => setForm(prev => ({ ...prev, reperibilitaGiornoPartenza: g.key }))}
            style={{
              background: giornoPartenza === g.key ? accent : T.s2,
              color: giornoPartenza === g.key ? accentText : T.text,
              border: `1px solid ${giornoPartenza === g.key ? accent : T.border}`,
              borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer"
            }}>
            {g.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        TURNO DI PARTENZA (nel giorno scelto sopra)
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setForm(prev => ({ ...prev, reperibilitaTurnoPartenza: "14-24" }))}
          style={{
            flex: 1, background: turnoPartenza === "14-24" ? accent : T.s2,
            color: turnoPartenza === "14-24" ? accentText : T.text,
            border: `1px solid ${turnoPartenza === "14-24" ? accent : T.border}`,
            borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}>
          14:00 – 24:00
        </button>
        <button type="button" onClick={() => setForm(prev => ({ ...prev, reperibilitaTurnoPartenza: "00-14" }))}
          style={{
            flex: 1, background: turnoPartenza === "00-14" ? accent : T.s2,
            color: turnoPartenza === "00-14" ? accentText : T.text,
            border: `1px solid ${turnoPartenza === "00-14" ? accent : T.border}`,
            borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}>
          00:00 – 14:00
        </button>
      </div>
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 14 }}>
        Il giorno successivo prende automaticamente l'altro turno.
        Ogni blocco (2 giorni) si ripete ogni 8 giorni, avanzando di un
        giorno della settimana ad ogni ripetizione.
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        MODELLO PER 14:00–24:00
      </div>
      <ModelloSelector T={T} modelli={modelli} value={form.modelloRSId}
        onChange={id => setForm(prev => ({ ...prev, modelloRSId: id }))} />

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, margin: "10px 0 6px" }}>
        MODELLO PER 00:00–14:00
      </div>
      <ModelloSelector T={T} modelli={modelli} value={form.modelloNLId}
        onChange={id => setForm(prev => ({ ...prev, modelloNLId: id }))} />
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// PARTE 4 — Vista dettaglio REPERIBILITÀ (quando apri la rotazione
// dallo schermo elenco). Sostituisce/affianca NLRSView per il nuovo
// tipo "reperibilita". Da aggiungere in 04-Rotazione.jsx e da
// richiamare in 02-Modelli.jsx / 03-Calendario.jsx al posto del blocco:
//
//   {rot.tipo==="nlrs"&&(
//     <NLRSView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot}/>
//   )}
//
// con:
//
//   {rot.tipo==="reperibilita"&&(
//     <ReperibilitaView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot}/>
//   )}
// ─────────────────────────────────────────────────────────────────────

// Calcola le prime N date (come stringhe YYYY-MM-DD) generate dal
// pattern di reperibilità, solo per l'anteprima a schermo (l'inserimento
// reale nel calendario resta gestito da applyRotazione, vedi Parte 6).
export function calcolaAnteprimaReperibilita(rot, nBlocchi = 12) {
  if (!rot?.dataInizio) return [];
  const [y0, m0, d0] = rot.dataInizio.split("-").map(Number);
  const start = new Date(y0, m0 - 1, d0);
  const turnoA = rot.reperibilitaTurnoPartenza === "00-14" ? "00:00-14:00" : "14:00-24:00";
  const turnoB = turnoA === "14:00-24:00" ? "00:00-14:00" : "14:00-24:00";

  const righe = [];
  for (let i = 0; i < nBlocchi; i++) {
    const giorno1 = new Date(start);
    giorno1.setDate(giorno1.getDate() + i * 8);
    const giorno2 = new Date(giorno1);
    giorno2.setDate(giorno2.getDate() + 1);

    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    righe.push({ data: fmt(giorno1), turno: turnoA });
    righe.push({ data: fmt(giorno2), turno: turnoB });
  }
  return righe;
}

export function ReperibilitaView({ rot, T, accent, modelli }) {
  const modA = modelli.find(m => m.id === rot.modelloRSId); // 14-24
  const modB = modelli.find(m => m.id === rot.modelloNLId); // 00-14
  const anteprima = calcolaAnteprimaReperibilita(rot, 12);

  const NOMI_GIORNI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>TURNO 14:00–24:00</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modA?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modA?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 10, color: T.sub, fontWeight: 700, marginBottom: 4 }}>TURNO 00:00–14:00</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: modB?.coloreCustom || accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{modB?.titolo || "— nessun modello —"}</div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 8 }}>
        ANTEPRIMA (prossimi {anteprima.length} giorni di turno)
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        {anteprima.map((r, i) => {
          const [ry, rm, rd] = r.data.split("-").map(Number);
          const giornoSett = NOMI_GIORNI[new Date(ry, rm - 1, rd).getDay()];
          const mod = r.turno === "14:00-24:00" ? modA : modB;
          return (
            <div key={r.data + r.turno} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 14px", borderBottom: i < anteprima.length - 1 ? `1px solid ${T.border}` : "none"
            }}>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
                {giornoSett} {rd}/{rm}/{ry}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: mod?.coloreCustom || accent }} />
                <div style={{ fontSize: 12, color: T.sub }}>{r.turno}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// PARTE 5 — Griglia personalizzata 7 (giorni) x 52 (settimane), a
// scelta di MODELLO da lista (con colore e dipendenze già definite nei
// modelli-turno esistenti dell'app). Sostituisce GrigliaRotazione nel
// tuo 04-Rotazione.jsx.
//
// Logica: ogni pallino della griglia corrisponde a un giorno reale
// dell'anno di riferimento (rot.dataInizio = lunedì della settimana 1).
// Click su un pallino → apre la selezione modello (ModelloSelector) →
// il pallino prende il colore del modello scelto. Il dato salvato in
// rot.griglia resta {dateKey: modelloId}, compatibile con
// applyRotazione già esistente per "personalizzata" (Sezione 06-Logica,
// riga ~4347), quindi NON serve toccare 06-Logica.jsx per questa parte.
// ─────────────────────────────────────────────────────────────────────

const NOMI_GIORNI_GRIGLIA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// Trova il lunedì della settimana che contiene dataStr (YYYY-MM-DD).
function lunediDellaSettimana(dataStr) {
  const [y, m, d] = dataStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const giorno = dt.getDay(); // 0=Dom..6=Sab
  const offset = giorno === 0 ? -6 : 1 - giorno;
  dt.setDate(dt.getDate() + offset);
  return dt;
}

function fmtDateKey(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Costruisce le 52 colonne x 7 righe come matrice di dateKey, a partire
// dal lunedì di riferimento (rot.dataInizio, o oggi se non impostata).
export function costruisciMatriceGriglia(rot) {
  const baseStr = rot?.dataInizio || fmtDateKey(new Date());
  const lunedi0 = lunediDellaSettimana(baseStr);
  const colonne = [];
  for (let w = 0; w < 52; w++) {
    const riga = [];
    for (let g = 0; g < 7; g++) {
      const dt = new Date(lunedi0);
      dt.setDate(dt.getDate() + w * 7 + g);
      riga.push(fmtDateKey(dt));
    }
    colonne.push(riga);
  }
  return colonne; // colonne[settimana][giorno] = dateKey
}

// NB: usa useState/useMemo "nominati" (import { useState, useMemo } from
// "react"), la stessa convenzione già usata in 02-Modelli.jsx e negli
// altri file del progetto — assicurati che 04-Rotazione.jsx li importi
// in cima al file, es:
//   import { useState, useMemo } from "react";
export function GrigliaRotazione({ rot, T, accent, modelli, fasceAutomatiche, sundayColor, onUpdate }) {
  const [pallinoAttivo, setPallinoAttivo] = useState(null); // dateKey in modifica
  const [modelloSelezionato, setModelloSelezionato] = useState(null); // per applicazione multipla

  const matrice = useMemo(() => costruisciMatriceGriglia(rot), [rot?.dataInizio]);
  const griglia = rot.griglia || {};

  function coloreDiData(dateKey) {
    const modId = griglia[dateKey];
    if (!modId) return null;
    const mod = modelli.find(m => m.id === modId);
    return mod?.coloreCustom || accent;
  }

  function clickPallino(dateKey) {
    if (modelloSelezionato !== null) {
      // Modalità "pennello": applica subito il modello scelto nella barra sopra.
      const nuova = { ...griglia };
      if (modelloSelezionato === "__clear__") delete nuova[dateKey];
      else nuova[dateKey] = modelloSelezionato;
      onUpdate(nuova);
      return;
    }
    setPallinoAttivo(dateKey);
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
      {/* Barra di selezione modello: sceglie il "pennello" da applicare ai pallini */}
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
        SELEZIONA UN MODELLO, POI TOCCA I PALLINI DELLA GRIGLIA
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        <button onClick={() => setModelloSelezionato(m => m === "__clear__" ? null : "__clear__")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20,
            border: `1.5px solid ${modelloSelezionato === "__clear__" ? "#ef4444" : T.border}`,
            background: modelloSelezionato === "__clear__" ? "#ef4444" : T.s2,
            color: modelloSelezionato === "__clear__" ? "#fff" : T.text,
            fontSize: 12, fontWeight: 700, cursor: "pointer"
          }}>
          ✕ Vuoto
        </button>
        {modelli.map(m => {
          const attivo = modelloSelezionato === m.id;
          return (
            <button key={m.id} onClick={() => setModelloSelezionato(cur => cur === m.id ? null : m.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20,
                border: `1.5px solid ${attivo ? (m.coloreCustom || accent) : T.border}`,
                background: attivo ? (m.coloreCustom || accent) : T.s2,
                color: attivo ? getContrastTextColor(m.coloreCustom || accent) : T.text,
                fontSize: 12, fontWeight: 700, cursor: "pointer"
              }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.coloreCustom || accent }} />
              {m.titolo}
            </button>
          );
        })}
      </div>

      {/* Griglia 7 righe x 52 colonne, scroll orizzontale */}
      <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
        <div style={{ display: "inline-block", minWidth: "100%" }}>
          {NOMI_GIORNI_GRIGLIA.map((nomeGiorno, riga) => (
            <div key={nomeGiorno} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: 34, flexShrink: 0, fontSize: 10, fontWeight: 700, color: T.sub,
                textAlign: "right", paddingRight: 6, position: "sticky", left: 0, background: T.surface
              }}>
                {nomeGiorno}
              </div>
              {matrice.map((colonna, w) => {
                const dateKey = colonna[riga];
                const colore = coloreDiData(dateKey);
                return (
                  <div key={dateKey} title={dateKey} onClick={() => clickPallino(dateKey)}
                    style={{
                      width: 14, height: 14, margin: 1.5, borderRadius: "50%", flexShrink: 0,
                      background: colore || T.s2,
                      border: `1px solid ${colore || T.border}`,
                      cursor: "pointer"
                    }} />
                );
              })}
            </div>
          ))}
          {/* Numeri settimana sotto, ogni 4 colonne per non affollare */}
          <div style={{ display: "flex", marginTop: 4 }}>
            <div style={{ width: 34, flexShrink: 0 }} />
            {matrice.map((_, w) => (
              <div key={w} style={{
                width: 14, margin: 1.5, flexShrink: 0, fontSize: 7, color: T.sub, textAlign: "center"
              }}>
                {(w % 4 === 0) ? (w + 1) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selettore modello puntuale per il singolo pallino (tap senza pennello attivo) */}
      {pallinoAttivo && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 700,
          display: "flex", alignItems: "flex-end"
        }} onClick={() => setPallinoAttivo(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", background: T.surface, borderRadius: "16px 16px 0 0", padding: 16, maxHeight: "70vh", overflowY: "auto"
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 12 }}>
              {pallinoAttivo}
            </div>
            <ModelloSelector T={T} modelli={modelli} value={griglia[pallinoAttivo] || null}
              onChange={id => {
                const nuova = { ...griglia };
                if (id) nuova[pallinoAttivo] = id; else delete nuova[pallinoAttivo];
                onUpdate(nuova);
                setPallinoAttivo(null);
              }} />
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// PARTE 6 — MODIFICA a 06-Logica.jsx, funzione applyRotazione: togliere
// il ramo "nlrs" e aggiungere il ramo "reperibilita".
// ─────────────────────────────────────────────────────────────────────
//
// Nel tuo 06-Logica.jsx, TROVA questo blocco (righe ~4317-4331 nel file
// che mi hai passato) e CANCELLALO:
//
//   } else if(rot.tipo === "nlrs") {
//     const modNL = modelli.find(m=>m.id===rot.modelloNLId);
//     const modRS = modelli.find(m=>m.id===rot.modelloRSId);
//     const [y0, m0, d0] = startDayKey.split("-").map(Number);
//     const start = new Date(y0, m0-1, d0);
//     const totalWeeks = numRipetizioni * 2;
//
//     for(let s=0; s<totalWeeks; s++) {
//       const isNL = (s % 2) === 0;
//       const mod = isNL ? modNL : modRS;
//       if(!mod) continue;
//       const d = new Date(start);
//       d.setDate(d.getDate() + s * 7);
//       await inserisciEvento(mod, d);
//     }
//   } else if(rot.tipo === "domeniche") {
//
// e SOSTITUISCILO con (nota: il "} else if(rot.tipo === "domeniche") {"
// finale resta, cambia solo il pezzo "nlrs"):
//
//   } else if(rot.tipo === "reperibilita") {
//     // modelloRSId = turno 14:00-24:00, modelloNLId = turno 00:00-14:00
//     // (stessi due slot già usati da RS/NL scalante, riutilizzati qui).
//     const modA = modelli.find(m=>m.id===rot.modelloRSId); // 14-24
//     const modB = modelli.find(m=>m.id===rot.modelloNLId); // 00-14
//     const turnoPartenzaA = rot.reperibilitaTurnoPartenza !== "00-14"; // true = A parte con 14-24
//     const primoModello = turnoPartenzaA ? modA : modB;
//     const secondoModello = turnoPartenzaA ? modB : modA;
//
//     const [y0, m0, d0] = startDayKey.split("-").map(Number);
//     const start = new Date(y0, m0-1, d0);
//     // numRipetizioni qui indica il numero di BLOCCHI da 8 giorni da generare.
//     for(let i=0; i<numRipetizioni; i++) {
//       const giorno1 = new Date(start);
//       giorno1.setDate(giorno1.getDate() + i*8);
//       const giorno2 = new Date(giorno1);
//       giorno2.setDate(giorno2.getDate() + 1);
//       if(primoModello) await inserisciEvento(primoModello, giorno1);
//       if(secondoModello) await inserisciEvento(secondoModello, giorno2);
//     }
//   } else if(rot.tipo === "domeniche") {
//
// ─────────────────────────────────────────────────────────────────────
// PARTE 7 — MODIFICA a 02-Modelli.jsx / 03-Calendario.jsx: import e
// punto di rendering della vista dettaglio.
// ─────────────────────────────────────────────────────────────────────
//
// 1) Nell'import da "./04-Rotazione" in cima al file, sostituisci
//    "NLRSView" con "ReperibilitaView" (NLRSScalanteView e
//    DomenicheView restano invariati):
//
//    import { ModelloCard, ModelForm, RotazioneCard, RotazioneForm, ModelloSelector,
//      GrigliaRotazione, NLRSScalanteView, DomenicheView, ReperibilitaView } from "./04-Rotazione";
//
// 2) Nel blocco che sceglie quale vista mostrare (intorno alla riga
//    826-831 di 02-Modelli.jsx), sostituisci:
//
//    {rot.tipo==="nlrs"&&(
//      <NLRSView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot}/>
//    )}
//
//    con:
//
//    {rot.tipo==="reperibilita"&&(
//      <ReperibilitaView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot}/>
//    )}
//
// 3) Nell'etichetta della card elenco rotazioni (01-App.jsx riga 362),
//    sostituisci:
//
//    const tipoLabel=r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL/RS":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":"✏️ Personalizzata";
//
//    con:
//
//    const tipoLabel=r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="reperibilita"?"📞 Reperibilità":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":"🗓️ Personalizzata";
//
// ═══════════════════════════════════════════════════════════════════════
// FINE PATCH
// ═══════════════════════════════════════════════════════════════════════
