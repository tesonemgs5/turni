import assert from "node:assert/strict";
import test from "node:test";
import { calcolaAnteprimaReperibilita, costruisciMatriceGriglia, oraInMinuti } from "../src/25-calcoli-rotazione.js";

test("genera i quattro turni e riparte dopo 16 giorni senza duplicati", () => {
  const anteprima = calcolaAnteprimaReperibilita({ dataInizio: "2026-12-31" }, 2);
  assert.deepEqual(anteprima, [
    { data: "2026-12-31", giornoCiclo: 1 },
    { data: "2027-01-01", giornoCiclo: 2 },
    { data: "2027-01-08", giornoCiclo: 3 },
    { data: "2027-01-09", giornoCiclo: 4 },
    { data: "2027-01-16", giornoCiclo: 1 },
    { data: "2027-01-17", giornoCiclo: 2 },
    { data: "2027-01-24", giornoCiclo: 3 },
    { data: "2027-01-25", giornoCiclo: 4 },
  ]);
});

test("costruisce 52 settimane da lunedì, includendo l'anno successivo", () => {
  const matrice = costruisciMatriceGriglia({ dataInizio: "2026-12-31" });
  assert.equal(matrice.length, 52);
  assert.equal(matrice.every(settimana => settimana.length === 7), true);
  assert.deepEqual(matrice[0], [
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
    "2027-01-01", "2027-01-02", "2027-01-03",
  ]);
});

test("converte gli orari e rifiuta input assente", () => {
  assert.equal(oraInMinuti("06:15"), 375);
  assert.equal(oraInMinuti(""), null);
});
