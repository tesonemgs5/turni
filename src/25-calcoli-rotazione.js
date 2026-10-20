export function oraInMinuti(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function fmtDateKey(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function calcolaAnteprimaReperibilita(rot, nBlocchi = 12) {
  if (!rot?.dataInizio) return [];
  const [y0, m0, d0] = rot.dataInizio.split("-").map(Number);
  const start = new Date(y0, m0 - 1, d0);
  const righe = [];
  for (let i = 0; i < nBlocchi; i++) {
    const offsetBlocco = i * 16;
    const giorno1 = new Date(start);
    giorno1.setDate(giorno1.getDate() + offsetBlocco);
    const giorno2 = new Date(giorno1);
    giorno2.setDate(giorno2.getDate() + 1);
    const giorno3 = new Date(giorno2);
    giorno3.setDate(giorno3.getDate() + 7);
    const giorno4 = new Date(giorno3);
    giorno4.setDate(giorno4.getDate() + 1);
    righe.push({ data: fmtDateKey(giorno1), giornoCiclo: 1 });
    righe.push({ data: fmtDateKey(giorno2), giornoCiclo: 2 });
    righe.push({ data: fmtDateKey(giorno3), giornoCiclo: 3 });
    righe.push({ data: fmtDateKey(giorno4), giornoCiclo: 4 });
  }
  return righe;
}

function lunediDellaSettimana(dataStr) {
  const [y, m, d] = dataStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const giorno = dt.getDay();
  const offset = giorno === 0 ? -6 : 1 - giorno;
  dt.setDate(dt.getDate() + offset);
  return dt;
}

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
  return colonne;
}
