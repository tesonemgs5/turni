import assert from "node:assert/strict";
import test from "node:test";
import { dataNelPeriodoReport, impostaSelezioneModelliGruppo, intervalloPersonalizzatoReport } from "../src/29-periodo-sottomenu.js";

test("converte un intervallo personalizzato del sottomenu in estremi inclusivi", () => {
  const periodo = intervalloPersonalizzatoReport({from:"2023-01-01",to:"2023-12-31"});
  assert.deepEqual(periodo, {from:"2023-01-01",to:"2023-12-31"});
  assert.equal(dataNelPeriodoReport("2023-01-01", periodo), true);
  assert.equal(dataNelPeriodoReport("2024-01-01", periodo), false);
});

test("l'estremo toOggi segue la data corrente", () => {
  const periodo = intervalloPersonalizzatoReport(
    {from:"2023-01-01",to:"2023-12-31",toOggi:true},
    new Date(2026,9,21),
  );
  assert.deepEqual(periodo, {from:"2023-01-01",to:"2026-10-21"});
  assert.equal(dataNelPeriodoReport("2026-10-21", periodo), true);
});

test("un intervallo assente o invertito non sostituisce il periodo generale", () => {
  assert.equal(intervalloPersonalizzatoReport(null), null);
  assert.equal(intervalloPersonalizzatoReport({from:"2024-01-01",to:"2023-12-31"}), null);
});

test("seleziona o deseleziona tutti i modelli del gruppo senza toccare gli altri", () => {
  const assegnazioni = {m1:"g1",m2:"g1",m3:"g2"};
  assert.deepEqual(impostaSelezioneModelliGruppo(assegnazioni, ["m1","m2"], "g1", false), {m3:"g2"});
  assert.deepEqual(impostaSelezioneModelliGruppo(assegnazioni, ["m1","m2","m4"], "g1", true), {
    m1:"g1",m2:"g1",m3:"g2",m4:"g1",
  });
  assert.deepEqual(assegnazioni, {m1:"g1",m2:"g1",m3:"g2"});
});
