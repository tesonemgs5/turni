import test from "node:test";
import assert from "node:assert/strict";
import {
  descriviModificheReport, aggiungiVersioneReport, leggiCronologiaReport, azzeraCronologiaReport, MAX_VERSIONI_REPORT, stabile,
} from "../src/40-cronologia-report.js";

const base = () => ({
  ordine: "A",
  sottomenu: [{
    id: "sm1", tipo: "libero", nome: "Giorni",
    gruppi: [{ key: "g1", label: "DOMENICA" }],
    assegnazioni: { m1: "g1", m2: "g1", m3: "g1" },
  }],
});

test("nessuna modifica: cambiato false", () => {
  assert.equal(descriviModificheReport(base(), base()).cambiato, false);
});

test("seleziona/deseleziona tutti: dice da quanti a quanti modelli", () => {
  const dopo = base(); dopo.sottomenu[0].assegnazioni = {};
  const r = descriviModificheReport(base(), dopo);
  assert.equal(r.cambiato, true);
  assert.match(r.riepilogo, /DOMENICA.*3 → 0/);
});

test("cambio ordine, gruppi e sottomenu", () => {
  const dopo = base();
  dopo.ordine = "B"; dopo.ordineTot = "Q";
  dopo.sottomenu[0].gruppi.push({ key: "g2", label: "LUNEDI" });
  const r = descriviModificheReport(base(), dopo);
  assert.ok(r.dettagli.some((d) => /Ordine generale: A→Z → cronologico/.test(d)));
  assert.ok(r.dettagli.some((d) => /Per modello.*quantità/.test(d)));
  assert.ok(r.dettagli.some((d) => /aggiunto il gruppo «LUNEDI»/.test(d)));
  assert.match(r.riepilogo, /\+\d+ altre modifiche/);
});

test("stesso numero di modelli ma diversi: lo dice", () => {
  const dopo = base(); dopo.sottomenu[0].assegnazioni = { m1: "g1", m2: "g1", m9: "g1" };
  assert.ok(descriviModificheReport(base(), dopo).dettagli.some((d) => /cambiati i modelli selezionati/.test(d)));
});

test("stabile: ordine delle chiavi indifferente", () => {
  assert.equal(stabile({ a: 1, b: { c: 2, d: 3 } }), stabile({ b: { d: 3, c: 2 }, a: 1 }));
});

test("versioni: si salva lo stato precedente e si rilegge", () => {
  azzeraCronologiaReport();
  aggiungiVersioneReport("r1", { x: 1 }, "prima modifica", 1000);
  aggiungiVersioneReport("r1", { x: 2 }, "seconda modifica", 2000);
  const v = leggiCronologiaReport("r1");
  assert.equal(v.length, 2);
  assert.deepEqual(v[1].cfg, { x: 2 });
  assert.equal(v[1].riepilogo, "seconda modifica");
  assert.deepEqual(leggiCronologiaReport("altro"), []);
});

test("versioni: due stati uguali di fila non si duplicano", () => {
  azzeraCronologiaReport();
  aggiungiVersioneReport("r1", { x: 1 }, "a", 1000);
  aggiungiVersioneReport("r1", { x: 1 }, "b", 2000);
  assert.equal(leggiCronologiaReport("r1").length, 1);
});

test("versioni: al massimo MAX_VERSIONI_REPORT per report, si perdono le piu' vecchie", () => {
  azzeraCronologiaReport();
  for (let i = 0; i < MAX_VERSIONI_REPORT + 5; i++) aggiungiVersioneReport("r1", { x: i }, `m${i}`, 1000 + i);
  const v = leggiCronologiaReport("r1");
  assert.equal(v.length, MAX_VERSIONI_REPORT);
  assert.deepEqual(v[0].cfg, { x: 5 });
});

test("versioni: i report sono separati", () => {
  azzeraCronologiaReport();
  aggiungiVersioneReport("r1", { x: 1 }, "a", 1000);
  aggiungiVersioneReport("r2", { y: 1 }, "b", 1001);
  azzeraCronologiaReport("r1");
  assert.equal(leggiCronologiaReport("r1").length, 0);
  assert.equal(leggiCronologiaReport("r2").length, 1);
});
