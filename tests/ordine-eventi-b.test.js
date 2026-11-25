import test from "node:test";
import assert from "node:assert/strict";

// Dispositivo impostato sull'ordine A: gli eventi devono comunque seguire il sistema B (fasce orarie).
globalThis.localStorage = { _v: "A", getItem() { return this._v; }, setItem(k, v) { this._v = v; } };

const { calcolaOrdineVisuale } = await import("../src/26-ordine-modelli.js");

const gruppi = [
  { id: "gMat", calendarId: null, ordine: "B", sortOrder: 1 },
  { id: "gPom", calendarId: null, ordine: "B", sortOrder: 2 },
  { id: "gNot", calendarId: null, ordine: "B", sortOrder: 3 },
];
// sortOrder = posizione dell'ordine ATTIVO (A qui), sortOrderAltro = posizione del B.
const modelli = [
  { id: "n", titolo: "NOTTE 00-06", inizio: "00:00", sortOrder: 1, sortOrderAltro: 3, gruppoB: "gNot" },
  { id: "p", titolo: "POMERIGGIO", inizio: "14:30", sortOrder: 2, sortOrderAltro: 2, gruppoB: "gPom" },
  { id: "m", titolo: "MATTINA", inizio: "06:00", sortOrder: 3, sortOrderAltro: 1, gruppoB: "gMat" },
];
const ids = (l) => l.map((x) => x.id).join(",");

test("senza forzare, con il dispositivo su A, l'ordine e' quello A", () => {
  assert.notEqual(ids(calcolaOrdineVisuale(modelli, gruppi, null)), "m,p,n");
});

test("forzando B: gruppi per fasce (mattina, pomeriggio, notte) anche con il dispositivo su A", () => {
  assert.equal(ids(calcolaOrdineVisuale(modelli, gruppi, null, "B")), "m,p,n");
});

test("forzando B, nello stesso gruppo vale la posizione B, poi la fascia oraria e l'orario", () => {
  const due = [
    { id: "x", titolo: "X", inizio: "09:00", sortOrder: 1, sortOrderAltro: 2, gruppoB: "gMat" },
    { id: "y", titolo: "Y", inizio: "06:00", sortOrder: 2, sortOrderAltro: 1, gruppoB: "gMat" },
  ];
  assert.equal(ids(calcolaOrdineVisuale(due, gruppi, null, "B")), "y,x");
});

test("modelli senza gruppo B vanno dopo i gruppi", () => {
  const con = [...modelli, { id: "z", titolo: "Z", inizio: "07:00", sortOrder: 4, sortOrderAltro: 0, gruppoB: null }];
  assert.equal(ids(calcolaOrdineVisuale(con, gruppi, null, "B")), "m,p,n,z");
});

const { tipoProtrazionePerTitolo } = await import("../src/26-ordine-modelli.js");

test("protrazione: titoli classici e sigle PP/PR", () => {
  assert.equal(tipoProtrazionePerTitolo("PROTRAZIONE PAGAMENTO"), "pagamento");
  assert.equal(tipoProtrazionePerTitolo("PROTRAZIONE RECUPERO"), "recupero");
  assert.equal(tipoProtrazionePerTitolo("-PROTRAZIONE RECUPERO"), "meno_recupero");
  assert.equal(tipoProtrazionePerTitolo("PP PAGAMENTO"), "pagamento");
  assert.equal(tipoProtrazionePerTitolo("PP RECUPERO"), "recupero");
  assert.equal(tipoProtrazionePerTitolo("PR PAGAMENTO"), "pagamento");
});

test("protrazione: altri modelli non vengono scambiati", () => {
  assert.equal(tipoProtrazionePerTitolo("PI DF CHIAIA AUTO"), null);
  assert.equal(tipoProtrazionePerTitolo("PIANO INCENTIVANTE"), null);
  assert.equal(tipoProtrazionePerTitolo("PP"), null);
  assert.equal(tipoProtrazionePerTitolo("PI RC"), null);
  assert.equal(tipoProtrazionePerTitolo(""), null);
});
