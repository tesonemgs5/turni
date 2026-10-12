// ═══════════════════════════════════════════════════════════════
// 15-quartine.js — Quartine (I-IV): lettura del PDF/foto "QUARTINE ANNO xxxx"
// e funzioni di supporto. Il PDF ha un livello di testo: si leggono i numeri con
// la loro posizione (pdf.js), senza AI. Per le foto si usa Tesseract (stessa
// logica sulle posizioni delle parole). Tutto gira nel browser.
//
// Modello dati salvato in reportSettings.quartine:
//   { visibili:{I:bool,...}, colori:{I:"#hex",...}, date:{ "2025-01-05":"IV", ... } }
// Un giorno appartiene a una sola quartina. L'asterisco (festivo infrasettimanale)
// viene ignorato: domeniche e festivi hanno lo stesso colore.
// ═══════════════════════════════════════════════════════════════

export const QUARTINE = ["I", "II", "III", "IV"];
const PREFISSI_MESI = ["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"];
const GIORNI_MAX = [31,29,31,30,31,30,31,31,30,31,30,31];

export const COLORI_QUARTINE_DEFAULT = {
  chiaro: { I:"#bfdbfe", II:"#bbf7d0", III:"#fbcfe8", IV:"#fed7aa" },
  scuro:  { I:"#1e3a5f", II:"#14532d", III:"#5b1a45", IV:"#5a3510" },
};

export function quartineVuote(dark){
  return {
    visibili: { I:false, II:false, III:false, IV:false },
    colori: { ...(dark ? COLORI_QUARTINE_DEFAULT.scuro : COLORI_QUARTINE_DEFAULT.chiaro) },
    date: {},
  };
}

export function chiaveData(anno, mese, giorno){
  const a = mese > 12 ? anno + 1 : anno;
  const m = mese > 12 ? mese - 12 : mese;
  return `${a}-${String(m).padStart(2,"0")}-${String(giorno).padStart(2,"0")}`;
}

const mediana = (v)=>{ const s=[...v].sort((a,b)=>a-b); return s.length ? s[Math.floor(s.length/2)] : 0; };

// Funzione pura: da elementi di testo con posizione [{s, x, y}] (x,y = centro; y cresce verso il basso)
// a { ok, motivo, anno, entries:[{mese:1..13, giorno, q}], avvisi, metodo }.
export function quartineDaItems(itemsGrezzi){
  // pdf.js (v5+) può fondere parole vicine in un solo elemento ("MAGGIO GIUGNO LUGLIO ...").
  // Qui li riduco a parole singole, ripartendo la larghezza in proporzione ai caratteri.
  const items = [];
  for(const i of (itemsGrezzi||[])){
    const testo = String(i.s||"").replace(/\u00a0/g," ");
    const parti = testo.trim().split(/\s+/).filter(Boolean);
    if(parti.length <= 1 || !(i.w > 0)){ const s = testo.trim(); if(s) items.push({ s, x:i.x, y:i.y }); continue; }
    const tot = testo.trim().length; let pos = 0; const x0 = i.x - i.w/2;
    for(const p of parti){
      const ini = testo.trim().indexOf(p, pos);
      items.push({ s:p, x: x0 + i.w * (ini + p.length/2) / tot, y:i.y });
      pos = ini + p.length;
    }
  }
  const avvisi = [];

  // 1) intestazioni dei mesi (12 colonne + l'ultimo gennaio, dell'anno dopo)
  let intest = items.filter(i=>/^[A-Za-zÀ-ÿ]{5,}$/.test(i.s) && PREFISSI_MESI.includes(i.s.slice(0,3).toUpperCase()));
  if(intest.length < 12) return { ok:false, motivo:"Non trovo le intestazioni dei mesi (gennaio–dicembre).", entries:[], avvisi };
  const yIntest = mediana(intest.map(i=>i.y));
  intest = intest.filter(i=>Math.abs(i.y - yIntest) < 20).sort((a,b)=>a.x-b.x);
  if(intest.length < 12) return { ok:false, motivo:"Le intestazioni dei mesi non sono allineate: prova con una foto più dritta o con il PDF.", entries:[], avvisi };
  const colonne = intest.slice(0,13).map((i,k)=>{
    const mese = PREFISSI_MESI.indexOf(i.s.slice(0,3).toUpperCase()) + 1;
    return { x:i.x, mese: (k>=12 && mese===1) ? 13 : mese };
  });
  const diff = []; for(let k=1;k<colonne.length;k++) diff.push(colonne[k].x - colonne[k-1].x);
  const larg = mediana(diff) || 50;

  // 2) numeri dentro la tabella (l'asterisco si ignora)
  const numeri = items.filter(i=>/^\d{1,2}\*?$/.test(i.s)
    && i.y > yIntest + 5
    && i.x > colonne[0].x - larg*0.6 && i.x < colonne[colonne.length-1].x + larg*0.6)
    .map(i=>({ giorno:parseInt(i.s,10), ast:i.s.endsWith("*"), x:i.x, y:i.y }))
    .filter(n=>n.giorno>=1 && n.giorno<=31);
  if(numeri.length === 0) return { ok:false, motivo:"Non trovo nessun giorno nella tabella.", entries:[], avvisi };

  // 3) blocchi delle quartine: dai numeri romani a sinistra, altrimenti dividendo la tabella in 4
  const xMaxRomani = colonne[0].x - larg*0.5;
  const romani = items.filter(i=>QUARTINE.includes(i.s) && i.x < xMaxRomani && i.y > yIntest);
  const romPerNome = {}; romani.forEach(r=>{ if(!romPerNome[r.s]) romPerNome[r.s]=r; });
  let quartinaDaY, metodo;
  if(QUARTINE.every(q=>romPerNome[q])){
    const c = QUARTINE.map(q=>romPerNome[q].y);
    const ordinati = c.every((v,k)=>k===0||v>c[k-1]);
    if(ordinati){
      metodo = "numeri romani";
      quartinaDaY = (y)=>{ for(let k=0;k<3;k++){ if(y < (c[k]+c[k+1])/2) return QUARTINE[k]; } return QUARTINE[3]; };
    }
  }
  if(!quartinaDaY){
    const ys = numeri.map(n=>n.y), minY=Math.min(...ys), maxY=Math.max(...ys), passo=(maxY-minY)/4;
    metodo = "posizione";
    avvisi.push("Numeri romani I–IV non riconosciuti: ho diviso la tabella in 4 parti uguali. Controlla bene l'anteprima.");
    quartinaDaY = (y)=>QUARTINE[Math.min(3, Math.floor((y-minY)/(passo||1)))];
  }

  // 4) costruzione elenco
  const entries = []; const visti = new Map(); let fuoriColonna = 0;
  for(const n of numeri){
    let col = colonne[0]; for(const c of colonne) if(Math.abs(c.x-n.x) < Math.abs(col.x-n.x)) col=c;
    if(Math.abs(col.x-n.x) > larg*0.6){ fuoriColonna++; continue; }
    const q = quartinaDaY(n.y);
    const mese12 = col.mese>12 ? col.mese-12 : col.mese;
    if(n.giorno > GIORNI_MAX[mese12-1]){ avvisi.push(`Giorno non valido scartato: ${n.giorno}/${mese12}.`); continue; }
    const k = `${col.mese}-${n.giorno}`;
    if(visti.has(k)){ if(visti.get(k)!==q) avvisi.push(`Il ${n.giorno}/${mese12} compare in due quartine (${visti.get(k)} e ${q}): tengo ${visti.get(k)}.`); continue; }
    visti.set(k,q);
    entries.push({ mese:col.mese, giorno:n.giorno, q, ast:n.ast });
  }
  if(fuoriColonna>0) avvisi.push(`${fuoriColonna} numeri fuori colonna ignorati.`);
  entries.sort((a,b)=>a.mese-b.mese || a.giorno-b.giorno);
  for(const q of QUARTINE) if(!entries.some(e=>e.q===q)) avvisi.push(`Nessun giorno trovato per la quartina ${q}.`);

  // 5) anno dal titolo "QUARTINE ANNO 2025"
  const cand = items.filter(i=>/^(19|20)\d{2}$/.test(i.s) && i.y < yIntest).sort((a,b)=>a.y-b.y||b.x-a.x);
  const anno = cand.length ? parseInt(cand[0].s,10) : null;

  // 6) controllo: un giorno senza asterisco dovrebbe essere una domenica
  if(anno){
    const nomi = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
    for(const e of entries){
      if(e.ast) continue;
      const a = e.mese>12 ? anno+1 : anno, m = e.mese>12 ? e.mese-12 : e.mese;
      const g = new Date(a, m-1, e.giorno).getDay();
      if(g!==0) avvisi.push(`Il ${e.giorno}/${m}/${a} (quartina ${e.q}) è un ${nomi[g]} senza asterisco: controlla se il numero è giusto.`);
    }
  }

  // 7) controlli di coerenza (solo avvisi, i dati restano come nel PDF):
  //    ogni domenica dell'anno deve essere presente, e le domeniche scorrono nel ciclo I-II-III-IV.
  if(anno){
    const ymd = (d)=>`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    const presenti = new Set(entries.map(e=>`${e.mese>12?anno+1:anno}-${e.mese>12?e.mese-12:e.mese}-${e.giorno}`));
    const mancanti = [];
    for(let d=new Date(anno,0,1); d.getFullYear()===anno; d.setDate(d.getDate()+1)){
      if(d.getDay()===0 && !presenti.has(ymd(d))) mancanti.push(`${d.getDate()}/${d.getMonth()+1}`);
    }
    if(mancanti.length) avvisi.push(`Domeniche non trovate nel PDF: ${mancanti.join(", ")}. Controlla se un numero è stato scritto male.`);
    const dom = entries.filter(e=>e.mese<=12 && new Date(anno,e.mese-1,e.giorno).getDay()===0);
    for(let k=1;k<dom.length;k++){
      const att = QUARTINE[(QUARTINE.indexOf(dom[k-1].q)+1)%4];
      if(dom[k].q!==att) avvisi.push(`Domenica ${dom[k].giorno}/${dom[k].mese}: quartina ${dom[k].q}, ma dopo la ${dom[k-1].q} era attesa la ${att}.`);
    }
  }

  return { ok:true, motivo:"", anno, entries, avvisi, metodo };
}

// Aggiorna le date di una quartina-config con un import: sostituisce l'anno letto
// (e il gennaio dell'anno dopo, letto dalla stessa tabella), lascia gli altri anni.
export function applicaImportQuartine(cfg, anno, entries){
  const date = { ...(cfg?.date||{}) };
  for(const k of Object.keys(date)){
    const [y,m] = k.split("-").map(Number);
    if(y===anno || (y===anno+1 && m===1)) delete date[k];
  }
  for(const e of entries) date[chiaveData(anno, e.mese, e.giorno)] = e.q;
  return { ...cfg, date };
}

export async function leggiPdfQuartine(file){
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pagina = await pdf.getPage(1);
  const H = pagina.getViewport({ scale:1 }).height;
  const c = await pagina.getTextContent();
  const items = c.items.filter(i=>i.str && i.str.trim())
    .map(i=>({ s:i.str, x:i.transform[4] + (i.width||0)/2, y:H - i.transform[5], w:i.width||0 }));
  return quartineDaItems(items);
}

export async function leggiFotoQuartine(file, onProgress){
  const Tesseract = (await import("tesseract.js")).default;
  let data;
  try{
    const r = await Tesseract.recognize(file, "ita", {
      logger: m => { if(m.status==="recognizing text" && onProgress) onProgress(Math.round((m.progress||0)*100)); }
    });
    data = r.data;
  }catch(e){
    return { ok:false, motivo:"Impossibile caricare il modulo di lettura delle foto (problema di connessione). Riprova o usa il PDF.", entries:[], avvisi:[] };
  }
  const parole = data.words || (data.lines||[]).flatMap(l=>l.words||[]);
  const items = parole.filter(w=>w.text && w.bbox)
    .map(w=>({ s:w.text, x:(w.bbox.x0+w.bbox.x1)/2, y:(w.bbox.y0+w.bbox.y1)/2 }));
  const r = quartineDaItems(items);
  if(!r.ok) r.motivo += " Per le foto serve uno scatto dritto e ben illuminato; se non basta usa il PDF.";
  else r.avvisi.unshift("Lettura da foto: controlla con attenzione ogni giorno nell'anteprima.");
  return r;
}
