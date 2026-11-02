// ============================================================================
// IDENTITA' DEL MODELLO — REGOLA INVARIABILE (vedi REGOLE-INVARIABILI.md)
//
// Un modello è identificato da: NOME + TIPO DURATA + ORARIO DI INIZIO + ORARIO DI FINE.
//   - H24 e PERSONALIZZATO (anche senza orari) sono modelli DIVERSI, a parità di nome.
//   - Cambiare nome o orario del modello = un altro modello.
//   - Tutto il resto dell'evento (ingresso/uscita effettivi, protrazioni, collega, auto,
//     luogo, note, colore, categorie) NON fa parte dell'identità e NON scollega mai l'evento.
// Per riconoscere il modello di un evento si usano SEMPRE gli orari "ufficiali" salvati
// nell'evento (time_in/time_out), MAI quelli effettivi (time_in_note/time_out_note).
// NON MODIFICARE questa regola senza un ordine esplicito dell'utente.
// ============================================================================

export const normNome = s => (s || "").trim().replace(/\s+/g, " ").toUpperCase();

export function tempoCanonico(t) {
  const v = (t || "").toLowerCase();
  return v === "custom" ? "personalizzato" : v;
}

// Tipo durata dedotto da un evento (l'evento non salva il "tempo" del modello).
export function tempoDaEvento({ allDay, tIn, tOut, calcFine6h15, calcFine6h30 }) {
  if (allDay) return "h24";
  if (tIn && tOut && calcFine6h15 && tOut === calcFine6h15(tIn)) return "6h15";
  if (tIn && tOut && calcFine6h30 && tOut === calcFine6h30(tIn)) return "6h30";
  return "personalizzato";
}

export function chiaveIdentitaModello(m) {
  const tempo = tempoCanonico(m.tempo);
  const nome = normNome(m.titolo || m.label);
  if (tempo === "h24") return `${nome}|h24||`;
  return `${nome}|${tempo}|${m.inizio || ""}|${m.fine || ""}`;
}

// Cerca il modello con la stessa identità. Se ce n'è più di uno e non si distingue, null.
export function trovaModelloIdentita(modelli, { calendarId, nome, inizio, fine, allDay, tempoEvento }) {
  const n = normNome(nome);
  if (!n) return null;
  let cand = modelli.filter(m =>
    m.calendarId === calendarId &&
    (normNome(m.titolo) === n || normNome(m.label) === n) &&
    (allDay
      ? tempoCanonico(m.tempo) === "h24"
      : tempoCanonico(m.tempo) !== "h24" && (m.inizio || "") === (inizio || "") && (m.fine || "") === (fine || ""))
  );
  if (cand.length > 1 && tempoEvento) {
    const stessi = cand.filter(m => tempoCanonico(m.tempo) === tempoEvento);
    if (stessi.length >= 1) cand = stessi;
  }
  return cand.length === 1 ? cand[0] : null;
}
