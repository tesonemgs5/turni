import assert from "node:assert/strict";
import test from "node:test";
import { impostaInclusioneModelloReport, statoInclusioneModelloReport, modelliInclusiValidi, pulisciModelliInclusi } from "../src/27-report-modelli.js";

test("usa le inclusioni del report e rispetta il filtro esplicito senza modelli", () => {
  assert.equal(statoInclusioneModelloReport("conteggio_turni", {}, "m1", false), true);
  assert.equal(statoInclusioneModelloReport("conteggio_turni", { modelliInclusi:["__nessuno__"] }, "m1", false), false);
  assert.equal(statoInclusioneModelloReport("conteggio_turni", { modelliInclusi:["m1"] }, "m2", false), false);
});

test("aggiunge o esclude modelli dai report senza alterare la configurazione originale", () => {
  const config = { modelliInclusi:["__nessuno__"], sottomenu:[{id:"sm", assegnazioni:{}}] };
  const incluso = impostaInclusioneModelloReport("conteggio_turni", config, "m1", true, false, ["m1","m2"]);
  assert.deepEqual(incluso.modelliInclusi, ["m1"]);
  assert.deepEqual(config.modelliInclusi, ["__nessuno__"]);
  const escluso = impostaInclusioneModelloReport("conteggio_turni", {modelliInclusi:["m1","m2"]}, "m1", false, false, ["m1","m2"]);
  assert.deepEqual(escluso.modelliInclusi, ["m2"]);
  assert.deepEqual(impostaInclusioneModelloReport("conteggio_turni", {modelliInclusi:["m1"]}, "m1", false, false, ["m1"]), {modelliInclusi:["__nessuno__"]});
});

test("un modello escluso dal filtro resta deselezionato anche se assegnato a un sottomenu", () => {
  const config = {
    modelliInclusi:["__nessuno__"],
    sottomenu:[{id:"sm",assegnazioni:{m1:"gruppo-a",m2:"gruppo-b"}}],
  };
  assert.equal(statoInclusioneModelloReport("conteggio_turni", config, "m1", false), false);
  assert.deepEqual(config.modelliInclusi, ["__nessuno__"]);
});

test("mantiene la regola standard e le esclusioni della Turnazione", () => {
  const config = { modelliEsclusi:["standard"], modelliAggiunti:[] };
  const incluso = impostaInclusioneModelloReport("turnazione", config, "standard", true, true);
  assert.deepEqual(incluso.modelliEsclusi, []);
  assert.equal(statoInclusioneModelloReport("turnazione", incluso, "standard", true), true);
  const aggiunto = impostaInclusioneModelloReport("turnazione", {}, "personalizzato", true, false);
  assert.equal(statoInclusioneModelloReport("turnazione", aggiunto, "personalizzato", false), true);
});

test("il filtro conta solo i modelli che esistono ancora (un ID vecchio non fa 2 al posto di 1)", () => {
  assert.deepEqual(modelliInclusiValidi(["piano","vecchio"], ["piano","altro"]), ["piano"]);
  assert.deepEqual(modelliInclusiValidi(["__nessuno__"], ["piano"]), []);
  assert.deepEqual(modelliInclusiValidi(undefined, ["piano"]), []);
});

test("pulisce gli ID vecchi dal filtro e non tocca il resto della configurazione", () => {
  const config = { modelliInclusi:["piano","vecchio"], ordineTot:"A", sottomenu:[{id:"sm"}] };
  const pulita = pulisciModelliInclusi(config, ["piano","altro"]);
  assert.deepEqual(pulita.modelliInclusi, ["piano"]);
  assert.equal(pulita.ordineTot, "A");
  assert.deepEqual(pulita.sottomenu, [{id:"sm"}]);
  assert.deepEqual(config.modelliInclusi, ["piano","vecchio"]);
});

test("senza ID vecchi restituisce lo stesso oggetto (nessuna scrittura inutile)", () => {
  const config = { modelliInclusi:["piano"] };
  assert.equal(pulisciModelliInclusi(config, ["piano"]), config);
  const tutti = { modelliInclusi:[] };
  assert.equal(pulisciModelliInclusi(tutti, ["piano"]), tutti);
  const nessuno = { modelliInclusi:["__nessuno__"] };
  assert.equal(pulisciModelliInclusi(nessuno, ["piano"]), nessuno);
});

test("se erano tutti ID vecchi il filtro diventa «nessun modello», mai «tutti»", () => {
  const pulita = pulisciModelliInclusi({ modelliInclusi:["v1","v2"] }, ["piano"]);
  assert.deepEqual(pulita.modelliInclusi, ["__nessuno__"]);
  assert.equal(statoInclusioneModelloReport("conteggio_turni", pulita, "piano", false), false);
});
