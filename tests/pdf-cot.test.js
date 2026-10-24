import test from "node:test";
import assert from "node:assert/strict";
import { parseItemsPdfCot, confrontaRisultatiCot } from "../src/30-pdf-cot.js";

const it = (str, x, y, w = 30) => ({ str, x, w, y });

// Mini prospetto: 2 giorni, 2 fasce con numero di colonne diverso (3 + 2).
const pagina = [
  it("ORARIO 00.00/06.15", 100, 520, 60),
  it("00.00/06.30 (festivi)", 100, 505, 60),
  it("ORARIO 06.00/12.15", 330, 520, 60),
  it("06.00/12.30 (festivi)", 330, 505, 60),
  it("domenica 1 novembre 2026", 10, 480, 80),
  it("Avvocata", 100, 480), it("Stella", 150, 480), it("Chiaia", 200, 480),
  it("Vomero", 300, 480), it("Stella", 350, 480),
  it("lunedì 2 novembre 2026", 10, 465, 80),
  it("Stella", 100, 465), it("Chiaia", 150, 465), it("Vomero", 200, 465),
  it("Chiaia", 300, 465), it("Avvocata", 350, 465),
];

test("assegna Stella a giorno (asse Y) e fascia (asse X)", () => {
  const r = parseItemsPdfCot([pagina]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.turni_stella["00.00_06.30"], ["1 novembre 2026", "2 novembre 2026"]);
  assert.deepEqual(r.turni_stella["06.00_12.30"], ["1 novembre 2026"]);
});

test("confronto: coincidono / differiscono", () => {
  const a = { "00.00_06.30": ["1 novembre 2026"] };
  assert.deepEqual(confrontaRisultatiCot(a, { ...a }), []);
  const d = confrontaRisultatiCot(a, { "00.00_06.30": ["2 novembre 2026"] });
  assert.equal(d.length, 2);
});
