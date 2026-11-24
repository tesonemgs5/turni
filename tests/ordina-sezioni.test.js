import test from "node:test";
import assert from "node:assert/strict";
import { ordinaSezioni } from "../src/26-ordine-modelli.js";

const m = (id, titolo, inizio) => ({ id, titolo, inizio, tempo: "orario" });
const insieme = () => ({
  blocchi: [
    { key: "G:1", label: "NOTTE", modelli: [m("a", "N2", "22:00"), m("b", "N1", "21:00")] },
    { key: "G:2", label: "MATTINA", modelli: [m("c", "M2", "08:00"), m("d", "M1", "09:00")] },
    { key: "G:3", label: "H24", modelli: [m("e", "H", "00:00")] },
  ],
  senza: [m("f", "M 11-16", "11:00"), m("g", "KATIA", "10:30")],
});
const nomi = (a) => a.map((x) => x.titolo);

test("A: cartelle, modelli e sciolti in ordine alfabetico", () => {
  const r = ordinaSezioni(insieme(), "A");
  assert.deepEqual(r.blocchi.map((b) => b.label), ["H24", "MATTINA", "NOTTE"]);
  assert.deepEqual(nomi(r.blocchi[1].modelli), ["M1", "M2"]);
  assert.deepEqual(nomi(r.senza), ["KATIA", "M 11-16"]);
});

test("B: cronologico per orario di inizio", () => {
  const r = ordinaSezioni(insieme(), "B");
  assert.deepEqual(r.blocchi.map((b) => b.label), ["H24", "MATTINA", "NOTTE"]);
  assert.deepEqual(nomi(r.blocchi[1].modelli), ["M2", "M1"]);
  assert.deepEqual(nomi(r.senza), ["KATIA", "M 11-16"]);
});

test("Q: per quantita' decrescente, cartella = somma dei suoi modelli", () => {
  const q = { a: 1, b: 1, c: 5, d: 5, e: 0, f: 2, g: 7 };
  const r = ordinaSezioni(insieme(), "Q", (x) => q[x.id]);
  assert.deepEqual(r.blocchi.map((b) => b.label), ["MATTINA", "NOTTE", "H24"]);
  assert.deepEqual(nomi(r.senza), ["KATIA", "M 11-16"]);
});

test("criterio sconosciuto: nessun cambiamento", () => {
  const i = insieme();
  assert.equal(ordinaSezioni(i, "manuale").blocchi, i.blocchi);
});
