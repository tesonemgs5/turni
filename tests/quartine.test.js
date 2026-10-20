import assert from "node:assert/strict";
import test from "node:test";
import { applicaImportQuartine, chiaveData, quartineDaItems, quartineVuote } from "../src/15-quartine.js";

test("crea una configurazione vuota con colori e date indipendenti", () => {
  const chiara = quartineVuote(false);
  const scura = quartineVuote(true);
  chiara.date["2026-01-01"] = "I";
  assert.deepEqual(Object.keys(scura.date), []);
  assert.notEqual(chiara.colori.I, scura.colori.I);
});

test("normalizza le date della tabella includendo il gennaio dell'anno seguente", () => {
  assert.equal(chiaveData(2026, 13, 1), "2027-01-01");
});

test("l'import delle quartine sostituisce solo l'anno importato", () => {
  const aggiornata = applicaImportQuartine(
    { date: { "2025-12-01": "I", "2026-01-03": "II", "2027-01-02": "III", "2028-01-01": "IV" } },
    2026,
    [{ mese: 1, giorno: 4, q: "I" }],
  );
  assert.deepEqual(aggiornata.date, {
    "2025-12-01": "I",
    "2026-01-04": "I",
    "2028-01-01": "IV",
  });
});

test("un documento senza intestazioni dei mesi produce un errore controllato", () => {
  const risultato = quartineDaItems([]);
  assert.equal(risultato.ok, false);
  assert.match(risultato.motivo, /intestazioni dei mesi/i);
});
