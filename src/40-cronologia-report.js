// ═══════════════════════════════════════════════════════════════
// 40-cronologia-report.js — Cronologia delle modifiche ai report.
//  - descriviModificheReport(prima, dopo): dice in parole cosa e' cambiato (per il Log).
//  - versioni: prima di ogni modifica si salva lo stato PRECEDENTE del report sul telefono,
//    cosi' si puo' tornare indietro (anche dopo un tocco sbagliato, tipo «seleziona tutti»).
// Le versioni stanno solo su questo telefono (localStorage), non su Supabase.
// ═══════════════════════════════════════════════════════════════

const CHIAVE = "turni_report_cronologia_v1";
export const MAX_VERSIONI_REPORT = 25;
const MAX_BYTE = 1500000;
const ETICHETTA_ORDINE = { A: "A→Z", B: "cronologico", Q: "quantità" };
const eo = (o) => ETICHETTA_ORDINE[o] || "come il ramo sopra";

// JSON con le chiavi in ordine: due configurazioni uguali danno lo stesso testo.
export function stabile(v) {
  const ord = (x) => (Array.isArray(x) ? x.map(ord)
    : (x && typeof x === "object") ? Object.keys(x).sort().reduce((o, k) => { o[k] = ord(x[k]); return o; }, {})
    : x);
  return JSON.stringify(ord(v === undefined ? null : v));
}

const perChiave = (arr, k) => new Map((arr || []).map((x) => [x[k], x]));
const conta = (ass, key) => Object.values(ass || {}).filter((v) => v === key).length;
const idsDi = (ass, key) => Object.keys(ass || {}).filter((k) => ass[k] === key).sort();

export function descriviModificheReport(prima, dopo) {
  const a = prima || {}, b = dopo || {};
  if (stabile(a) === stabile(b)) return { cambiato: false, riepilogo: "", dettagli: [] };
  const det = [];
  if ((a.ordine || null) !== (b.ordine || null)) det.push(`Ordine generale: ${eo(a.ordine)} → ${eo(b.ordine)}`);
  if ((a.ordineTot || null) !== (b.ordineTot || null)) det.push(`Ordine «Per modello»: ${eo(a.ordineTot)} → ${eo(b.ordineTot)}`);
  if (stabile(a.modelliInclusi || []) !== stabile(b.modelliInclusi || [])) {
    det.push(`Modelli inclusi nel report: ${(a.modelliInclusi || []).length} → ${(b.modelliInclusi || []).length}`);
  }
  if (stabile(a.fasceFiltro || []) !== stabile(b.fasceFiltro || [])) det.push("Filtro per fascia modificato");
  if (stabile(a.intervallo) !== stabile(b.intervallo)) det.push("Periodo del report modificato");
  if ((a.filtraCollega || "") !== (b.filtraCollega || "")) det.push(`Filtro collega: «${a.filtraCollega || "nessuno"}» → «${b.filtraCollega || "nessuno"}»`);
  const sa = perChiave(a.sottomenu, "id"), sb = perChiave(b.sottomenu, "id");
  const nomeSm = (s) => s.nome || s.label || s.titolo || "sottomenu";
  for (const [id, s] of sb) if (!sa.has(id)) det.push(`Aggiunto il sottomenu «${nomeSm(s)}»`);
  for (const [id, s] of sa) if (!sb.has(id)) det.push(`Tolto il sottomenu «${nomeSm(s)}»`);
  for (const [id, s2] of sb) {
    const s1 = sa.get(id);
    if (!s1) continue;
    const nome = nomeSm(s2);
    if ((s1.ordine || null) !== (s2.ordine || null)) det.push(`Sottomenu «${nome}»: ordine ${eo(s1.ordine)} → ${eo(s2.ordine)}`);
    const g1 = perChiave(s1.gruppi, "key"), g2 = perChiave(s2.gruppi, "key");
    for (const [k, g] of g2) {
      const lab = g.label || "senza nome";
      const v = g1.get(k);
      if (!v) { det.push(`Sottomenu «${nome}»: aggiunto il gruppo «${lab}»`); continue; }
      if ((v.label || "") !== (g.label || "")) det.push(`Gruppo «${v.label || "senza nome"}» rinominato «${lab}»`);
      if ((v.ordine || null) !== (g.ordine || null)) det.push(`Gruppo «${lab}»: ordine ${eo(v.ordine)} → ${eo(g.ordine)}`);
      if (stabile(v.intervallo) !== stabile(g.intervallo)) det.push(`Gruppo «${lab}»: periodo modificato`);
      const c1 = conta(s1.assegnazioni, k), c2 = conta(s2.assegnazioni, k);
      if (c1 !== c2) det.push(`Gruppo «${lab}»: modelli selezionati ${c1} → ${c2}`);
      else if (stabile(idsDi(s1.assegnazioni, k)) !== stabile(idsDi(s2.assegnazioni, k))) det.push(`Gruppo «${lab}»: cambiati i modelli selezionati`);
      if (stabile(v.figli) !== stabile(g.figli)) det.push(`Gruppo «${lab}»: sottomenu interni modificati`);
    }
    for (const [k, v] of g1) if (!g2.has(k)) det.push(`Sottomenu «${nome}»: tolto il gruppo «${v.label || "senza nome"}»`);
  }
  if (det.length === 0) det.push("Altre impostazioni del report modificate");
  const riepilogo = det.length > 1 ? `${det[0]} (+${det.length - 1} altre modifiche)` : det[0];
  return { cambiato: true, riepilogo, dettagli: det.slice(0, 40) };
}

// ── Versioni salvate sul telefono ────────────────────────────────

let memoria = null; // al posto di localStorage dove non esiste (test)
function leggiTutto() {
  try {
    const grezzo = typeof localStorage !== "undefined" ? localStorage.getItem(CHIAVE) : memoria;
    const v = grezzo ? JSON.parse(grezzo) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch (e) { return {}; }
}
function scriviTutto(o) {
  const testo = JSON.stringify(o);
  if (typeof localStorage === "undefined") { memoria = testo; return; }
  localStorage.setItem(CHIAVE, testo);
}

export function leggiCronologiaReport(reportId) {
  const v = leggiTutto()[String(reportId)];
  return Array.isArray(v) ? v : [];
}

export function azzeraCronologiaReport(reportId) {
  try {
    if (reportId === undefined) { if (typeof localStorage !== "undefined") localStorage.removeItem(CHIAVE); memoria = null; return; }
    const t = leggiTutto(); delete t[String(reportId)]; scriviTutto(t);
  } catch (e) { /* ignora */ }
}

// Salva lo stato PRECEDENTE (cfgPrima) con la descrizione della modifica che sta per essere applicata.
// Ritorna { ok } oppure { ok:false, errore } (per esempio spazio del telefono esaurito).
export function aggiungiVersioneReport(reportId, cfgPrima, riepilogo, ts = Date.now()) {
  try {
    const id = String(reportId);
    const tutto = leggiTutto();
    const lista = Array.isArray(tutto[id]) ? tutto[id] : [];
    const ultima = lista[lista.length - 1];
    if (ultima && stabile(ultima.cfg) === stabile(cfgPrima)) return { ok: true };
    lista.push({ id: `v${ts.toString(36)}${Math.random().toString(36).slice(2, 5)}`, ts, riepilogo: riepilogo || "", cfg: cfgPrima || {} });
    while (lista.length > MAX_VERSIONI_REPORT) lista.shift();
    tutto[id] = lista;
    // Spazio: se troppo grande si butta via la versione piu' vecchia (di qualsiasi report).
    while (JSON.stringify(tutto).length > MAX_BYTE) {
      let piuVecchia = null;
      for (const [k, l] of Object.entries(tutto)) {
        if (Array.isArray(l) && l.length > 0 && (piuVecchia === null || l[0].ts < tutto[piuVecchia][0].ts)) piuVecchia = k;
      }
      if (piuVecchia === null) break;
      tutto[piuVecchia].shift();
      if (tutto[piuVecchia].length === 0) delete tutto[piuVecchia];
    }
    scriviTutto(tutto);
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `cronologia delle versioni non salvata (${e?.message || "spazio del telefono esaurito"})` };
  }
}
