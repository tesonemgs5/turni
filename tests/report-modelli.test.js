import assert from "node:assert/strict";
import test from "node:test";
import { aggiungiAssegnatiAlReport, impostaInclusioneModelloReport, normalizzaInclusioniDaSottomenu, statoInclusioneModelloReport } from "../src/27-report-modelli.js";

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

test("recupera in modo coerente i modelli già assegnati ai sottomenu", () => {
  const config = {
    modelliInclusi:["__nessuno__"],
    sottomenu:[{id:"sm",assegnazioni:{m1:"gruppo-a"}}],
  };
  assert.deepEqual(normalizzaInclusioniDaSottomenu(config).modelliInclusi, ["m1"]);
  assert.equal(statoInclusioneModelloReport("conteggio_turni", config, "m1", false), true);
  assert.deepEqual(config.modelliInclusi, ["__nessuno__"]);
});

test("selezionare modelli nei gruppi del report li include usando gli ID dei modelli", () => {
  const aggiornato = aggiungiAssegnatiAlReport(
    {modelliInclusi:["__nessuno__"]},
    {modelloA:"domenica", modelloB:"turno-1", modelloC:null},
  );
  assert.deepEqual(aggiornato.modelliInclusi, ["modelloA","modelloB"]);
});

test("mantiene la regola standard e le esclusioni della Turnazione", () => {
  const config = { modelliEsclusi:["standard"], modelliAggiunti:[] };
  const incluso = impostaInclusioneModelloReport("turnazione", config, "standard", true, true);
  assert.deepEqual(incluso.modelliEsclusi, []);
  assert.equal(statoInclusioneModelloReport("turnazione", incluso, "standard", true), true);
  const aggiunto = impostaInclusioneModelloReport("turnazione", {}, "personalizzato", true, false);
  assert.equal(statoInclusioneModelloReport("turnazione", aggiunto, "personalizzato", false), true);
});
