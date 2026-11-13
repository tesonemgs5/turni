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

// Informazioni sulla griglia di una rotazione personalizzata: primo/ultimo giorno configurato,
// quanti giorni sono configurati e su quante settimane intere si estende (da lunedi' a domenica).
export function infoGriglia(griglia) {
  const chiavi = Object.keys(griglia || {}).filter(k => griglia[k]).sort();
  if (chiavi.length === 0) return null;
  const prima = chiavi[0];
  const ultima = chiavi[chiavi.length - 1];
  const lunedi0 = lunediDellaSettimana(prima);
  const [y, m, d] = ultima.split("-").map(Number);
  const giorniSpan = Math.round((new Date(y, m - 1, d).getTime() - lunedi0.getTime()) / 86400000) + 1;
  return { prima, ultima, nGiorni: chiavi.length, nSettimane: Math.max(1, Math.ceil(giorniSpan / 7)) };
}

export function costruisciMatriceGriglia(rot) {
  // La griglia e' ancorata al lunedi' del primo giorno configurato: le date salvate restano stabili
  // anche se data di inizio o giorno corrente cambiano. Griglia vuota: data di inizio o oggi.
  const baseStr = infoGriglia(rot?.griglia)?.prima || rot?.dataInizio || fmtDateKey(new Date());
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
