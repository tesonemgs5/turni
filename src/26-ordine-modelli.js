import { BANDA_A, classeModelloA, ordinaClassiA, ordineAttivo, minutiInizio } from "./21-ordine.js";
import { oraInMinuti } from "./25-calcoli-rotazione.js";

export function stessoHexColore(a,b){
  return String(a||"").toLowerCase()===String(b||"").toLowerCase();
}

function chiaveColoreModello(m){
  return String((m && (m.coloreCustom||m.colore)) || "").toLowerCase();
}

function fasciaModelloEtichetta(m){
  const t = (m.titolo||"").toUpperCase().replace(/[°.\s]/g,"");
  if(t==="NOTTE") return 0;
  if(t==="PRIMO"||t==="MATTINA") return 1;
  if(t==="SECONDO"||t==="POMERIGGIO") return 2;
  if(t==="3TURNO"||t==="3ETURNO"||t==="TERZOTURNO") return 3;
  return null;
}

export function raggruppaPerColore(lista){
  const blocchi = new Map();
  (lista||[]).filter(Boolean).forEach(m=>{
    const k = chiaveColoreModello(m);
    if(!blocchi.has(k)) blocchi.set(k, []);
    blocchi.get(k).push(m);
  });
  const out = [];
  blocchi.forEach(arr=>{
    out.push(...arr.filter(m=>fasciaModelloEtichetta(m)!=null));
    out.push(...arr.filter(m=>fasciaModelloEtichetta(m)==null));
  });
  return out;
}

// ordineForzato (facoltativo, "A" o "B"): usa le posizioni di QUELL'ordine invece di quello scelto sul dispositivo.
// sortOrder = posizione dell'ordine attivo, sortOrderAltro = posizione dell'altro.
export function calcolaOrdineModelli(sottoinsieme, ordineForzato){
  const attivo = ordineAttivo();
  const ord = ordineForzato || attivo;
  const pos = (m)=> ((ord===attivo ? m.sortOrder : m.sortOrderAltro) || 0);
  return [...(sottoinsieme||[])].filter(Boolean).sort((a,b)=>{
    const sa = pos(a), sb = pos(b);
    if(sa!==sb) return sa-sb;
    const fa = classificaFasciaOrariaModello(a);
    const fb = classificaFasciaOrariaModello(b);
    if(fa!==fb) return fa-fb;
    const ma = a.tempo==="h24" ? 99999 : (oraInMinuti(a.inizio||"") ?? 99999);
    const mb = b.tempo==="h24" ? 99999 : (oraInMinuti(b.inizio||"") ?? 99999);
    if(ma!==mb) return ma-mb;
    return (a.titolo||"").localeCompare(b.titolo||"");
  });
}

export function ordinaModelliInGruppo(lista, criterio="manuale", estrai){
  const modelli = [...(lista||[])].filter(Boolean);
  const mod = x => (estrai ? estrai(x) : x);
  if(criterio==="manuale") return modelli;
  return modelli.map((m,i)=>({m,i})).sort((a,b)=>{
    if(criterio==="alfabetico"){
      const titoloA = String(mod(a.m).label||mod(a.m).titolo||"");
      const titoloB = String(mod(b.m).label||mod(b.m).titolo||"");
      const diff = titoloA.localeCompare(titoloB,"it",{sensitivity:"base",numeric:true});
      if(diff) return diff;
    }
    const oraA = mod(a.m).tempo==="h24" ? 99999 : (oraInMinuti(mod(a.m).inizio||"") ?? 99999);
    const oraB = mod(b.m).tempo==="h24" ? 99999 : (oraInMinuti(mod(b.m).inizio||"") ?? 99999);
    return (oraA-oraB) || (a.i-b.i);
  }).map(x=>x.m);
}

// ordineForzato (facoltativo): "B" per avere SEMPRE l'ordine per fasce orarie (gruppi B), come per gli eventi del giorno.
export function calcolaOrdineVisuale(modelli, gruppi, mainCalId, ordineForzato){
  const ordine = ordineForzato || ordineAttivo();
  const base = calcolaOrdineModelli(modelli, ordine);
  const perCal = new Map();
  base.forEach(m=>{ const c = m.calendarId||mainCalId||"__"; if(!perCal.has(c)) perCal.set(c,[]); perCal.get(c).push(m); });
  const rank = new Map();
  const iniz = new Map();
  perCal.forEach((lista,c)=>{
    const gl = (gruppi||[]).filter(g=>g.ordine===ordine && (g.calendarId||mainCalId||"__")===c && (ordine!=="A" || (g.sortOrder||0)>=BANDA_A))
      .sort((a,b)=> a.sortOrder!==b.sortOrder ? a.sortOrder-b.sortOrder : String(a.id).localeCompare(String(b.id)));
    if(ordine==="A" && gl.length===0){
      const classi = ordinaClassiA([...new Set(lista.map(classeModelloA))]);
      lista.forEach(m=>{ rank.set(m.id, classi.indexOf(classeModelloA(m))); });
    } else {
      const pos = new Map(gl.map((g,i)=>[g.id,i]));
      lista.forEach(m=>{ const gid = ordine==="A" ? m.gruppoA : m.gruppoB; rank.set(m.id, pos.has(gid) ? pos.get(gid) : gl.length); });
    }
  });
  return base.map((m,i)=>({m,i})).sort((a,b)=> ((rank.get(a.m.id)||0)-(rank.get(b.m.id)||0)) || ((iniz.get(a.m.id)||0)-(iniz.get(b.m.id)||0)) || (a.i-b.i)).map(x=>x.m);
}

export function classificaFasciaOrariaModello(m){
  const fasciaEtichetta = fasciaModelloEtichetta(m);
  if(fasciaEtichetta!=null) return fasciaEtichetta;
  if(m.tempo==="h24") return 4;
  const mins = oraInMinuti(m.inizio||"");
  if(mins==null) return 4;
  if(mins>=1081 || mins<=359) return 0;
  if(mins>=360 && mins<=705) return 1;
  if(mins>=706 && mins<=960) return 2;
  return 3;
}

export function calcolaOrdinePerFasciaOraria(sottoinsieme){
  return [...sottoinsieme].sort((a,b)=>{
    const fa = classificaFasciaOrariaModello(a);
    const fb = classificaFasciaOrariaModello(b);
    if(fa!==fb) return fa-fb;
    const etichettaA = fasciaModelloEtichetta(a)!=null;
    const etichettaB = fasciaModelloEtichetta(b)!=null;
    if(etichettaA!==etichettaB) return etichettaA ? -1 : 1;
    const ma = a.tempo==="h24" ? 0 : (oraInMinuti(a.inizio||"") ?? 0);
    const mb = b.tempo==="h24" ? 0 : (oraInMinuti(b.inizio||"") ?? 0);
    if(ma!==mb) return ma-mb;
    return (a.sortOrder||0)-(b.sortOrder||0);
  });
}

export function calcolaOrdineRiordinoFasce(sottoinsieme){
  const attuale = calcolaOrdineModelli(sottoinsieme);
  const blocchi = [[],[],[],[],[]];
  attuale.forEach(m=>{ blocchi[classificaFasciaOrariaModello(m)].push(m); });
  const out = [];
  for(let f=0; f<4; f++){
    out.push(...blocchi[f].filter(m=>fasciaModelloEtichetta(m)!=null));
    out.push(...blocchi[f].filter(m=>fasciaModelloEtichetta(m)==null));
  }
  out.push(...blocchi[4]);
  return out;
}

// Riordina le cartelle (blocchi) e i modelli di un elenco a tendine secondo il criterio scelto:
//  A = alfabetico (cartelle, modelli dentro e modelli senza cartella)
//  B = cronologico (per orario di inizio; una cartella vale quanto il suo modello che inizia prima)
//  Q = quantita' (dal maggiore; una cartella vale la somma dei suoi modelli) — serve valoreDi(modello)
// A parita' si va in ordine alfabetico. Qualsiasi altro criterio lascia tutto com'e'.
export function ordinaSezioni({ blocchi, senza }, criterio, valoreDi, estrai) {
  if (criterio !== "A" && criterio !== "B" && criterio !== "Q") return { blocchi, senza };
  const mod = (x) => (estrai ? estrai(x) : x);
  const nome = (x) => String(mod(x).label || mod(x).titolo || "");
  const coll = (a, b) => String(a).localeCompare(String(b), "it", { sensitivity: "base", numeric: true });
  const val = (x) => (valoreDi ? valoreDi(x) || 0 : 0);
  const iniz = (x) => minutiInizio(mod(x));
  const cmpModelli = criterio === "B" ? (a, b) => (iniz(a) - iniz(b)) || coll(nome(a), nome(b))
    : criterio === "Q" ? (a, b) => (val(b) - val(a)) || coll(nome(a), nome(b))
    : (a, b) => coll(nome(a), nome(b)) || (iniz(a) - iniz(b));
  const ord = (arr) => [...arr].sort(cmpModelli);
  const nuovi = blocchi.map((b) => ({ ...b, modelli: ord(b.modelli) }));
  const somma = (b) => b.modelli.reduce((n, m) => n + val(m), 0);
  const primo = (b) => Math.min(...b.modelli.map(iniz));
  if (criterio === "B") nuovi.sort((a, b) => (primo(a) - primo(b)) || coll(a.label, b.label));
  else if (criterio === "Q") nuovi.sort((a, b) => (somma(b) - somma(a)) || coll(a.label, b.label));
  else nuovi.sort((a, b) => coll(a.label, b.label));
  return { blocchi: nuovi, senza: ord(senza) };
}
