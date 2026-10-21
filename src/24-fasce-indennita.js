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
export const GIORNI_FASCIA = [["lun","L"],["mar","M"],["mer","M"],["gio","G"],["ven","V"],["sab","S"],["dom","D"]]; // non più mostrati: bastano le condizioni
// Pulsanti di CONDIZIONE (si possono togliere e aggiungerne di personali). NOTTURNO ha l'orario modificabile.
export const PULSANTI_DEFAULT = [
  { cod:"fer", label:"FERIALE",          v:4 },
  { cod:"not", label:"NOTTURNO",         v:4, da:"22:00", a:"06:00" },
  { cod:"fes", label:"FESTIVO",          v:4, dom:true, fest:true, sab:false, vigilia:true, dopo:true, infNotte:true },
  { cod:"inf", label:"INFRASETTIMANALE", v:4 },
];
// Le 4 voci del CCNL, in ordine di priorità (vale la prima che combacia). modo "e" = devono valere TUTTE le condizioni,
// "o" = ne basta UNA. Orari: 00:00 = inizio giornata, 24:00 = fine giornata.
export const FASCE_INDENNITA_DEFAULT = [
  { key:"infrasettimanale",  label:"Festivo infrasettimanale", da:"00:00", a:"24:00", giorni:["inf"],        modo:"e", perc:"100", v:4 },
  { key:"notturno_festivo",  label:"Notturno e festivo",       da:"00:00", a:"24:00", giorni:["not","fes"], modo:"e", perc:"50",  v:4 },
  { key:"notturno_o_festivo",label:"Notturno o festivo",       da:"00:00", a:"24:00", giorni:["not","fes"], modo:"o", perc:"30",  v:4 },
  { key:"diurno",            label:"Feriale",                  da:"06:00", a:"22:00", giorni:["fer"],       modo:"e", perc:"10",  v:4 },
];
const DOW = ["dom","lun","mar","mer","gio","ven","sab"]; // getDay()
const DOWSET = new Set(DOW);
export function fasceIndennitaDi(cfg){
  // Le fasce salvate con una versione precedente (senza v:4) vengono ignorate: vale l'elenco standard (retribuzioni e aumenti restano).
  const f = cfg && Array.isArray(cfg.fasceIndennita) && cfg.fasceIndennita.length && cfg.fasceIndennita.every(x=>x && x.v===4) ? cfg.fasceIndennita : null;
  return f || FASCE_INDENNITA_DEFAULT;
}
export function pulsantiFasciaDi(cfg){
  const pf = cfg && Array.isArray(cfg.pulsantiFascia) && cfg.pulsantiFascia.length && cfg.pulsantiFascia.every(x=>x && x.v===4) ? cfg.pulsantiFascia : null;
  return pf || PULSANTI_DEFAULT;
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
function condVera(c, att){
  if(c==="not") return att.not;
  if(c==="fes") return att.fes;
  if(c==="fer") return att.fer;
  if(c==="inf") return att.inf;
  if(String(c).startsWith("c_")) return att.custom.has(c);
  return true;
}
function combacia(giorni, att, modo){
  const g = giorni || [];
  const giorniSel = g.filter(c=>DOWSET.has(c));                 // (vecchi) giorni della settimana: ne basta uno
  if(giorniSel.length>0 && !giorniSel.includes(att.dow)) return false;
  const cond = g.filter(c=>!DOWSET.has(c));
  if(cond.length===0) return true;
  return modo==="o" ? cond.some(c=>condVera(c,att)) : cond.every(c=>condVera(c,att));
}
// Minuti del turno per ogni fascia. dateKey = giorno d'inizio; m1/m2raw = minuti dalla mezzanotte
// (m2<=m1: il turno finisce il giorno dopo); eFest(dateKey) = true se domenica o festività.
export function minutiPerFasceEvento({ dateKey, m1, m2raw, fasce, pulsanti, eFest, eFesta }){
  const out = {}; fasce.forEach(f=>{ out[f.key] = 0; });
  if(m1===null || m2raw===null || m1===undefined || m2raw===undefined) return out;
  let m2 = m2raw; if(m2<=m1) m2 += 24*60;
  const dk = [-1,0,1,2].map(n=>addDays(dateKey, n));     // giorno prima, oggi, domani, dopodomani
  const dow = dk.map(d=>dowDi(d));
  // FESTIVO configurabile: quali giorni sono festivi (domenica / festività / sabato) e, di notte, se contano anche
  // la sera prima e la mattina dopo il festivo.
  const pFes = (pulsanti||[]).find(x=>x && x.cod==="fes") || {};
  const oDom = pFes.dom!==false, oFest = pFes.fest!==false, oSab = pFes.sab===true, oVig = pFes.vigilia!==false, oDopo = pFes.dopo!==false, oInfNotte = pFes.infNotte!==false;
  const festaDi = (d,i)=> eFesta ? !!eFesta(d) : (!!eFest(d) && dow[i]!==0);   // festività (non domenica semplice)
  const festaArr = dk.map((d,i)=>festaDi(d,i));
  const fest = dk.map((d,i)=> (dow[i]===0 && oDom) || (festaArr[i] && oFest) || (dow[i]===6 && oSab));
  const mmdd = dk.map(d=>d.slice(5));
  const personali = (pulsanti||[]).filter(p=>p && p.mmdd && p.mmdd.length);
  const customDi = dk.map((_,i)=>new Set(personali.filter(p=>p.mmdd.includes(mmdd[i])).map(p=>p.cod)));
  const iv = fasce.map(f=>{
    let s = orarioInMinuti(f.da), e = orarioInMinuti(f.a);
    if(s===0 && e===0) e = 24*60;      // vecchio «00:00 → 00:00» = tutta la giornata (ora si scrive 00:00 → 24:00)
    // vigilia / dopo / infNotte per-fascia (se non impostati valgono quelli del pulsante FESTIVO)
    return { key:f.key, s, e, giorni:f.giorni||[], modo:f.modo||"e",
      vig: f.vigilia===undefined ? oVig : !!f.vigilia, dopo: f.dopo===undefined ? oDopo : !!f.dopo,
      infP: f.infPrima===undefined ? (f.infNotte===undefined ? oInfNotte : !!f.infNotte) : !!f.infPrima,
      infD: f.infDopo===undefined ? (f.infNotte===undefined ? oInfNotte : !!f.infNotte) : !!f.infDopo };
  }).filter(x=>x.s!==null && x.e!==null);
  // Orario del NOTTURNO (modificabile nel pulsante NOTTURNO; di partenza 22:00 → 06:00)
  const pNot = (pulsanti||[]).find(x=>x && x.cod==="not");
  const nS = (pNot && orarioInMinuti(pNot.da)!==null) ? orarioInMinuti(pNot.da) : 22*60;
  const nE = (pNot && orarioInMinuti(pNot.a)!==null) ? orarioInMinuti(pNot.a) : 6*60;
  const nottePassaMezzanotte = nS>nE;
  for(let t=m1; t<m2; t++){
    const di = t>=24*60 ? 2 : 1;                         // indice del giorno in cui cade il minuto
    const md = t % (24*60);
    const notte = nottePassaMezzanotte ? (md>=nS || md<nE) : (md>=nS && md<nE);
    const sera = nottePassaMezzanotte ? (md>=nS ? di : di-1) : di;   // giorno in cui è iniziata la notte
    for(const x of iv){
      const dentro = x.s<x.e ? (md>=x.s && md<x.e) : x.s>x.e ? (md>=x.s || md<x.e) : false; // inizio = fine: nessun minuto
      if(!dentro) continue;
      let fes = fest[di];
      if(notte && nottePassaMezzanotte){
        if(md>=nS) fes = fest[di] || (x.vig && fest[di+1]);          // sera: festivo se lo è il giorno, o la sera prima del festivo
        else       fes = fest[di] || (x.dopo && fest[di-1]);         // mattina: festivo se lo è il giorno, o la mattina dopo il festivo
      }
      const att = {
        dow: DOW[dow[di]],
        not: notte,
        fes,
        fer: !fes,
        inf: (festaArr[di] && dow[di]!==0) || (notte && nottePassaMezzanotte && (
          (x.infP && md>=nS && festaArr[di+1] && dow[di+1]!==0) ||
          (x.infD && md<nE && festaArr[di-1] && dow[di-1]!==0)
        )),
        custom: customDi[di],
      };
      if(combacia(x.giorni, att, x.modo)){ out[x.key]++; break; }
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
