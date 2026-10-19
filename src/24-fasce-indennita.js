// Fasce dell'INDENNITA' DI SERVIZIO configurabili: nome, orario (da → a, anche a cavallo della mezzanotte),
// pulsanti di condizione (giorni L M M G V S D + pulsanti come NOTTURNO / FESTIVO / INFRASETTIMANALE, ne
// puoi aggiungere o togliere) e compenso. Senza modifiche valgono le fasce standard del CCNL Funzioni Locali.
//
// REGOLE (ogni minuto del turno vale per il giorno in cui cade):
//  · giorni L…D: ne basta UNO (se non ne scegli nessuno vale ogni giorno);
//  · pulsanti: devono valere TUTTI quelli scelti;
//  · NOTTURNO = minuti dalle 22:00 alle 06:00;
//  · FESTIVO  = giorno di festa (domenica o festività); per i minuti notturni come nel CCNL:
//               dalle 22 del prefestivo alle 6 del festivo e dalle 22 del festivo alle 6 del giorno dopo;
//  · INFRASETTIMANALE = festività che cade dal lunedì al sabato, per tutta la giornata 00:00–24:00;
//  · pulsante personale = una data fissa ogni anno (es. 19/09 San Gennaro);
//  · l'orario (da → a) restringe ancora la fascia; vale la PRIMA fascia della lista che combacia;
//    i minuti fuori da ogni fascia non si contano.
export const GIORNI_FASCIA = [["lun","L"],["mar","M"],["mer","M"],["gio","G"],["ven","V"],["sab","S"],["dom","D"]];
export const PULSANTI_DEFAULT = [
  { cod:"not", label:"NOTTURNO" },
  { cod:"fes", label:"FESTIVO" },
  { cod:"inf", label:"INFRASETTIMANALE" },
];
export const FASCE_INDENNITA_DEFAULT = [
  { key:"infrasettimanale", label:"Festivo infrasettimanale", da:"00:00", a:"24:00", giorni:["inf"],        perc:"100", v:2 },
  { key:"notturno_festivo", label:"Notturno festivo",         da:"22:00", a:"06:00", giorni:["not","fes"], perc:"50",  v:2 },
  { key:"festivo",          label:"Festivo",                  da:"06:00", a:"22:00", giorni:["fes"],       perc:"30",  v:2 },
  { key:"notturno",         label:"Notturno",                 da:"22:00", a:"06:00", giorni:["not"],       perc:"30",  v:2 },
  { key:"diurno",           label:"Diurno",                   da:"06:00", a:"22:00", giorni:[],            perc:"10",  v:2 },
];
const DOW = ["dom","lun","mar","mer","gio","ven","sab"]; // getDay()
const DOWSET = new Set(DOW);
export function fasceIndennitaDi(cfg){
  // Le fasce salvate con la versione provvisoria (senza v:2) non hanno i nuovi pulsanti: valgono quelle standard.
  const f = cfg && Array.isArray(cfg.fasceIndennita) && cfg.fasceIndennita.length && cfg.fasceIndennita.every(x=>x && x.v===2) ? cfg.fasceIndennita : null;
  return f || FASCE_INDENNITA_DEFAULT;
}
export function pulsantiFasciaDi(cfg){
  return (cfg && Array.isArray(cfg.pulsantiFascia)) ? cfg.pulsantiFascia : PULSANTI_DEFAULT;
}
// Convenzione: 00:00 = INIZIO della giornata (minuto 0); 24:00 = FINE della giornata (il minuto dopo le 23:59 = 1440).
// L'inizio di una fascia è incluso, la fine è esclusa. Fine prima dell'inizio (es. 22:00 → 06:00) = oltre la mezzanotte.
export function orarioInMinuti(hm){
  const t = /^(\d{1,2}):(\d{2})/.exec(String(hm||""));
  if(!t) return null;
  const h = +t[1], m = +t[2];
  if(m>59 || h>24 || (h===24 && m>0)) return null;
  return h*60 + m;
}
function pad(n){ return String(n).padStart(2,"0"); }
function addDays(dateKey, n){
  const [y,m,d] = String(dateKey).split("-").map(Number);
  const x = new Date(y, (m||1)-1, (d||1)+n);
  return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
}
function dowDi(dateKey){
  const [y,m,d] = String(dateKey).split("-").map(Number);
  return new Date(y, (m||1)-1, d||1).getDay();
}
export function giornoDopo(dateKey){ return addDays(dateKey, 1); }
function combacia(giorni, att){
  const g = giorni || [];
  const giorniSel = g.filter(c=>DOWSET.has(c));
  if(giorniSel.length>0 && !giorniSel.includes(att.dow)) return false;
  for(const c of g){
    if(DOWSET.has(c)) continue;
    if(c==="not"){ if(!att.not) return false; }
    else if(c==="fes"){ if(!att.fes) return false; }
    else if(c==="inf"){ if(!att.inf) return false; }
    else if(String(c).startsWith("c_")){ if(!att.custom.has(c)) return false; }
  }
  return true;
}
// Minuti del turno per ogni fascia. dateKey = giorno d'inizio; m1/m2raw = minuti dalla mezzanotte
// (m2<=m1: il turno finisce il giorno dopo); eFest(dateKey) = true se domenica o festività.
export function minutiPerFasceEvento({ dateKey, m1, m2raw, fasce, pulsanti, eFest }){
  const out = {}; fasce.forEach(f=>{ out[f.key] = 0; });
  if(m1===null || m2raw===null || m1===undefined || m2raw===undefined) return out;
  let m2 = m2raw; if(m2<=m1) m2 += 24*60;
  const dk = [-1,0,1,2].map(n=>addDays(dateKey, n));     // giorno prima, oggi, domani, dopodomani
  const fest = dk.map(d=>!!eFest(d));
  const dow = dk.map(d=>dowDi(d));
  const mmdd = dk.map(d=>d.slice(5));
  const personali = (pulsanti||[]).filter(p=>p && p.mmdd && p.mmdd.length);
  const customDi = dk.map((_,i)=>new Set(personali.filter(p=>p.mmdd.includes(mmdd[i])).map(p=>p.cod)));
  const iv = fasce.map(f=>{
    let s = orarioInMinuti(f.da), e = orarioInMinuti(f.a);
    if(s===0 && e===0) e = 24*60;      // vecchio «00:00 → 00:00» = tutta la giornata (ora si scrive 00:00 → 24:00)
    return { key:f.key, s, e, giorni:f.giorni||[] };
  }).filter(x=>x.s!==null && x.e!==null);
  for(let t=m1; t<m2; t++){
    const di = t>=24*60 ? 2 : 1;                         // indice del giorno in cui cade il minuto
    const md = t % (24*60);
    const notte = md>=22*60 || md<6*60;
    const sera = md>=6*60 ? di : di-1;                   // giorno in cui è iniziata la notte
    const att = {
      dow: DOW[dow[di]],
      not: notte,
      fes: notte ? (fest[sera] || fest[sera+1]) : fest[di],
      inf: fest[di] && dow[di]!==0,
      custom: customDi[di],
    };
    for(const x of iv){
      const dentro = x.s<x.e ? (md>=x.s && md<x.e) : x.s>x.e ? (md>=x.s || md<x.e) : false; // inizio = fine: nessun minuto
      if(dentro && combacia(x.giorni, att)){ out[x.key]++; break; }
    }
  }
  return out;
}

// ── AUMENTI: elenco di periodi «dal giorno X» con retribuzione oraria base e, se serve, percentuali diverse per fascia.
// Ogni turno usa il periodo in vigore nel giorno in cui INIZIA (arretrati: si inserisce l'aumento con la data passata).
export function periodiDi(cfg){
  return [...((cfg && cfg.periodiRetribuzione) || [])].filter(p=>p && p.da).sort((a,b)=>String(a.da).localeCompare(String(b.da)));
}
// € all'ora di una fascia in un giorno: retribuzione del periodo × percentuale (del periodo, altrimenti quella standard
// della fascia). Senza periodo in vigore vale il compenso fisso in € della fascia (campo «€ fisso»).
export function tariffaOraria(cfg, fascia, dateKey, fisso){
  const per = periodiDi(cfg).filter(p=>p.da<=dateKey).pop();
  if(per){
    const b = parseFloat(per.base);
    const o = per.perc && per.perc[fascia.key];
    const pc = parseFloat(o!==undefined && o!=="" ? o : fascia.perc);
    if(b>0 && !isNaN(pc)) return b*pc/100;
  }
  return parseFloat(fisso)||0;
}
