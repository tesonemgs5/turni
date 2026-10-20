import assert from "node:assert/strict";
import test from "node:test";
import { calcolaOrdineModelli, classificaFasciaOrariaModello, stessoHexColore } from "../src/26-ordine-modelli.js";

test("ordina i modelli per posizione e risolve le parità con la fascia oraria", () => {
  const modelli = [
    { id: "sera", sortOrder: 1, inizio: "18:30", titolo: "Sera" },
    { id: "mattina", sortOrder: 1, inizio: "06:00", titolo: "Mattina" },
    { id: "prima", sortOrder: 0, inizio: "12:00", titolo: "Prima" },
  ];
  assert.deepEqual(calcolaOrdineModelli(modelli).map(m => m.id), ["prima", "sera", "mattina"]);
});

test("classifica le fasce ed etichette e confronta colori senza distinzione di maiuscole", () => {
  assert.equal(classificaFasciaOrariaModello({ titolo: "3° TURNO" }), 3);
  assert.equal(classificaFasciaOrariaModello({ titolo: "Notte", inizio: "12:00" }), 0);
  assert.equal(classificaFasciaOrariaModello({ tempo: "h24", inizio: "08:00" }), 4);
  assert.equal(stessoHexColore("#FFEEAA", "#ffeeaa"), true);
});
