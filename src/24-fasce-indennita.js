// Fasce dell'INDENNITA' DI SERVIZIO configurabili: nome, orario (da → a, anche a cavallo della mezzanotte)
// e giorni a cui si applicano (Lun…Dom oppure Festivi). Senza configurazione valgono le 4 fasce di sempre.
export const GIORNI_FASCIA = [["lun","Lun"],["mar","Mar"],["mer","Mer"],["gio","Gio"],["ven","Ven"],["sab","Sab"],["dom","Dom"],["fes","Festivi"]];
const DOW = ["dom","lun","mar","mer","gio","ven","sab"]; // getDay()
export const FASCE_INDENNITA_DEFAULT = [
  { key:"diurno",           label:"Diurno",           da:"06:00", a:"22:00", giorni:["lun","mar","mer","gio","ven","sab"] },
  { key:"notturno",         label:"Notturno",         da:"22:00", a:"06:00", giorni:["lun","mar","mer","gio","ven","sab"] },
  { key:"festivo",          label:"Festivo",          da:"06:00", a:"22:00", giorni:["dom","fes"] },
  { key:"notturno_festivo", label:"Notturno festivo", da:"22:00", a:"06:00", giorni:["dom","fes"] },
];
export function fasceIndennitaDi(cfg){
  return (cfg && Array.isArray(cfg.fasceIndennita) && cfg.fasceIndennita.length) ? cfg.fasceIndennita : FASCE_INDENNITA_DEFAULT;
}
export function orarioInMinuti(hm){
  const t = /^(\d{1,2}):(\d{2})/.exec(String(hm||""));
  return t ? (+t[1])*60 + (+t[2]) : null;
}
// Fasce valide in un giorno: una festività infrasettimanale usa le fasce con «Festivi» (se esistono),
// altrimenti conta il giorno della settimana (la domenica è «Dom»).
export function fasceDelGiorno(fasce, dateKey, eFestivo){
  const [y,m,d] = String(dateKey).split("-").map(Number);
  const dow = new Date(y, (m||1)-1, d||1).getDay();
  if(eFestivo && dow!==0){
    const fes = fasce.filter(f=>(f.giorni||[]).includes("fes"));
    if(fes.length>0) return fes;
  }
  return fasce.filter(f=>(f.giorni||[]).includes(DOW[dow]));
}
// Minuti del turno [m1,m2) per ogni fascia (m in minuti dalla mezzanotte; m2<=m1 = oltre la mezzanotte).
// Se due fasce si sovrappongono vale la prima della lista; i minuti fuori da ogni fascia non si contano.
export function minutiPerFascia(m1, m2raw, fasceGiorno){
  const out = {}; fasceGiorno.forEach(f=>{ out[f.key] = 0; });
  if(m1===null || m2raw===null || m1===undefined || m2raw===undefined) return out;
  let m2 = m2raw; if(m2<=m1) m2 += 24*60;
  const iv = fasceGiorno.map(f=>({ key:f.key, s:orarioInMinuti(f.da), e:orarioInMinuti(f.a) })).filter(x=>x.s!==null && x.e!==null);
  for(let t=m1; t<m2; t++){
    const md = t % (24*60);
    for(const x of iv){
      const dentro = x.s<x.e ? (md>=x.s && md<x.e) : x.s>x.e ? (md>=x.s || md<x.e) : true;
      if(dentro){ out[x.key]++; break; }
    }
  }
  return out;
}
