import assert from "node:assert/strict";
import test from "node:test";
import { calcolaOrdineModelli, classificaFasciaOrariaModello, ordinaModelliInGruppo, stessoHexColore } from "../src/26-ordine-modelli.js";
import { mapGruppoDb } from "../src/21-ordine.js";

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

test("ordina i modelli del singolo gruppo per orario o alfabeticamente senza mutare la lista", () => {
  const modelli = [
    { id: "sera", titolo: "Sera", inizio: "18:00" },
    { id: "mattina", titolo: "Mattina", inizio: "06:00" },
    { id: "altra-mattina", titolo: "Altra mattina", inizio: "07:00" },
  ];
  assert.deepEqual(ordinaModelliInGruppo(modelli,"orario").map(m=>m.id), ["mattina","altra-mattina","sera"]);
  assert.deepEqual(ordinaModelliInGruppo(modelli,"alfabetico").map(m=>m.id), ["altra-mattina","mattina","sera"]);
  assert.deepEqual(ordinaModelliInGruppo(modelli,"manuale"), modelli);
  assert.deepEqual(modelli.map(m=>m.id), ["sera","mattina","altra-mattina"]);
});

test("mappa e valida il criterio di ordinamento sincronizzato del gruppo", () => {
  const base = { id:"g1", nome:"PI", ordine:"A", sort_order:100 };
  assert.equal(mapGruppoDb({ ...base, ordine_modelli:"alfabetico" }).ordineModelli, "alfabetico");
  assert.equal(mapGruppoDb({ ...base, ordine_modelli:"non-valido" }).ordineModelli, "manuale");
  assert.equal(mapGruppoDb(base).ordineModelli, "manuale");
});
