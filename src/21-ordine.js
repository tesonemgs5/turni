// Doppio ordine dei modelli: A = alfabetico (colonna sort_order_a), B = orario (colonna sort_order).
// In memoria ogni modello ha: sortOrder = posizione dell'ordine ATTIVO, sortOrderAltro = posizione dell'altro.
// La scelta dell'ordine da vedere vale per dispositivo (localStorage), le posizioni sono nel database.
const CHIAVE = "turnipm_ordine_modelli";
export function ordineAttivo(){ try{ return localStorage.getItem(CHIAVE)==="A" ? "A" : "B"; }catch(e){ return "B"; } }
export function impostaOrdineAttivo(o){ try{ localStorage.setItem(CHIAVE, o==="A" ? "A" : "B"); }catch(e){} }
export const colAttiva = ()=> ordineAttivo()==="A" ? "sort_order_a" : "sort_order";
export const colAltra  = ()=> ordineAttivo()==="A" ? "sort_order" : "sort_order_a";
// Riga del database -> campi di posizione in memoria.
export function posDaRiga(r){ return { sortOrder:(r && r[colAttiva()])||0, sortOrderAltro:(r && r[colAltra()])||0, gruppoA:(r && r.gruppo_a)||null, gruppoB:(r && r.gruppo_b)||null }; }
// Gruppi a tendina (tabella gruppi_modelli): riga del database -> oggetto in memoria, e colonna di appartenenza per ordine.
export function mapGruppoDb(r){ return { id:r.id, calendarId:r.calendar_id||null, ordine:r.ordine==="A"?"A":"B", nome:r.nome||"", sortOrder:r.sort_order||0 }; }
export const colGruppo = (ordine)=> ordine==="A" ? "gruppo_a" : "gruppo_b";
// Modello in memoria -> ENTRAMBE le colonne del database.
export function colonnePosizione(m){
  const a = ordineAttivo()==="A"; const v = (m && m.sortOrder)||0, w = (m && m.sortOrderAltro)||0;
  return a ? { sort_order:w, sort_order_a:v } : { sort_order:v, sort_order_a:w };
}
// Solo le colonne cambiate rispetto a "prima" (oggetto vuoto se non è cambiato nulla).
export function payloadPosCambiate(prima, dopo){
  const d = colonnePosizione(dopo); if(!prima) return d;
  const p = colonnePosizione(prima); const o = {};
  if(p.sort_order!==d.sort_order) o.sort_order = d.sort_order;
  if(p.sort_order_a!==d.sort_order_a) o.sort_order_a = d.sort_order_a;
  return o;
}
export function scambiaOrdini(m){ return { ...m, sortOrder:(m.sortOrderAltro||0), sortOrderAltro:(m.sortOrder||0) }; }

// ── Ordine A: gruppi GESTIBILI ma creati in automatico ──────────────────────────────────────────
// Le tendine automatiche di ordine A (APP, AUTO, DISTACCATI, FESTIVI, PI, H24, PERSONALIZZATO, poi una per lettera)
// diventano gruppi veri alla prima gestione (vedi materializzaGruppiA in 06-Logica.jsx). I gruppi "gestiti" di ordine A
// hanno sort_order dalla BANDA_A in su: i vecchi gruppi di ordine A (DISTACCATI, AUTO, APPIEDATI, ALTRI...) restano
// nel database ma sotto la banda e non vengono mai mostrati.
export const BANDA_A = 10000000;
export const FISSI_A = ["APP","AUTO","DISTACCATI","FESTIVI","PI","H24","PERSONALIZZATO"];
// Prima regola che corrisponde (nome senza accenti, maiuscolo): vale la prima parola del nome, APP/AUTO in fondo non contano.
export function classeModelloA(m){
  const t = String((m && m.titolo)||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  if(/^APP/.test(t)) return "APP";
  if(/^AUTO/.test(t)) return "AUTO";
  if(/^D/.test(t)) return "DISTACCATI";
  if(/^F/.test(t)) return "FESTIVI";
  if(/^P\.?I\.?(\s|$)/.test(t)) return "PI";
  if(m && m.tempo==="h24") return "H24";
  if(m && m.tempo==="personalizzato") return "PERSONALIZZATO";
  const c = t.charAt(0); return /[A-Z]/.test(c) ? c : "#";
}
// Ordine delle tendine automatiche: prima i fissi nel loro ordine, poi "#", poi le lettere.
export function ordinaClassiA(chiavi){
  return [...chiavi].sort((x,y)=>{
    const ix = FISSI_A.indexOf(x), iy = FISSI_A.indexOf(y);
    if(ix>=0 || iy>=0) return (ix<0?99:ix) - (iy<0?99:iy);
    if(x==="#") return -1; if(y==="#") return 1;
    return x<y ? -1 : x>y ? 1 : 0;
  });
}

// Dentro ogni tendina automatica dell'ordine A i modelli vanno in ORDINE DI INIZIO (ora d'inizio crescente);
// senza orario d'inizio (es. H24) in fondo. A parita' resta l'ordine alfabetico gia' presente (ordinamento stabile).
export function minutiInizio(m){
  const t = m && m.inizio ? /^(\d{1,2}):(\d{2})/.exec(String(m.inizio)) : null;
  return t ? (+t[1])*60 + (+t[2]) : 99999;
}
export function ordinaPerInizio(lista){
  return (lista||[]).map((m,i)=>({m,i})).sort((a,b)=> (minutiInizio(a.m)-minutiInizio(b.m)) || (a.i-b.i)).map(x=>x.m);
}
