// ═══════════════════════════════════════════════════════════════
// 43-collegamenti-pi.js — Abbinamento Piano Incentivante (domenica) ↔ RC PI (riposo).
// Regola (invariata): in ordine di data, il 1° riposo va con la 1ª domenica, il 2° con la 2ª, ecc.
// Novita': ogni evento si distingue per DATA + id, non solo per id. Due eventi con lo stesso id in
// date diverse non si "rubano" piu' il collegamento: ognuno ha il suo, e il problema viene segnalato.
// ═══════════════════════════════════════════════════════════════

export const chiaveOccorrenza = (dateKey, id) => `${dateKey}|${id}`;

// eventiPI / eventiRc: elenchi di { id, dateKey }.
// Ritorna:
//  - perOccorrenza[dateKey|id] = { tipo, collegatoId, collegatoDateKey }
//  - perEvento[id]             = come sopra (prima occorrenza), per compatibilita'
//  - duplicati[id]             = elenco delle date in cui compare lo stesso id (solo se piu' di una)
export function abbinaPianoIncentivanteRiposi(eventiPI, eventiRc) {
  const k = (e) => chiaveOccorrenza(e.dateKey, e.id);
  const unici = (arr) => {
    const viste = new Set();
    return (arr || []).filter((e) => { const c = k(e); if (viste.has(c)) return false; viste.add(c); return true; });
  };
  const cmp = (a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  };
  const pi = unici(eventiPI).sort(cmp);
  const rc = unici(eventiRc).sort(cmp);

  const perOccorrenza = {};
  pi.forEach((e) => { perOccorrenza[k(e)] = { tipo: "piano_incentivante", collegatoId: null, collegatoDateKey: null }; });
  rc.forEach((e) => { perOccorrenza[k(e)] = { tipo: "rc_pi", collegatoId: null, collegatoDateKey: null }; });

  const assegnati = new Set();
  for (const consumo of rc) {
    const credito = pi.find((p) => !assegnati.has(k(p)));
    if (!credito) continue; // nessun Piano Incentivante libero da recuperare
    assegnati.add(k(credito));
    const a = perOccorrenza[k(consumo)], b = perOccorrenza[k(credito)];
    a.collegatoId = credito.id; a.collegatoDateKey = credito.dateKey;
    b.collegatoId = consumo.id; b.collegatoDateKey = consumo.dateKey;
  }

  const perEvento = {};
  const dateDiId = new Map();
  [...pi, ...rc].forEach((e) => {
    if (!perEvento[e.id]) perEvento[e.id] = perOccorrenza[k(e)];
    if (!dateDiId.has(e.id)) dateDiId.set(e.id, []);
    dateDiId.get(e.id).push(e.dateKey);
  });
  const duplicati = {};
  dateDiId.forEach((date, id) => { if (date.length > 1) duplicati[id] = date; });
  return { perEvento, perOccorrenza, duplicati };
}
