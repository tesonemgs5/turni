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
