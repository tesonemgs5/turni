import assert from "node:assert/strict";
import test from "node:test";
import { chiaveIdentitaModello, trovaModelloIdentita, tempoDaEvento, tempoModelloDaOrari } from "../src/31-identita-modello.js";

const cal = "c1";
const M = (id, titolo, tempo, inizio, fine) => ({ id, calendarId: cal, titolo, label: "", tempo, inizio, fine });

test("stesso nome con orario diverso = modelli diversi", () => {
  assert.notEqual(chiaveIdentitaModello(M(1, "AUTO", "6h15", "13:30", "19:45")), chiaveIdentitaModello(M(2, "AUTO", "6h15", "13:45", "20:00")));
});

test("H24 e personalizzato senza orario con lo stesso nome sono diversi", () => {
  const h24 = M(1, "AUTO", "h24", null, null), pers = M(2, "AUTO", "personalizzato", "", "");
  assert.notEqual(chiaveIdentitaModello(h24), chiaveIdentitaModello(pers));
  const modelli = [h24, pers];
  assert.equal(trovaModelloIdentita(modelli, { calendarId: cal, nome: "auto", allDay: true }).id, 1);
  assert.equal(trovaModelloIdentita(modelli, { calendarId: cal, nome: "AUTO", allDay: false, inizio: "", fine: "" }).id, 2);
});

test("si usa l'orario ufficiale: quello effettivo non fa parte dell'identità", () => {
  const modelli = [M(1, "PI DF SAN LORENZO APP", "6h30", "07:00", "13:30")];
  assert.equal(trovaModelloIdentita(modelli, { calendarId: cal, nome: "PI DF SAN LORENZO APP", inizio: "07:00", fine: "13:30" }).id, 1);
  assert.equal(trovaModelloIdentita(modelli, { calendarId: cal, nome: "PI DF SAN LORENZO APP", inizio: "06:45", fine: "13:15" }), null);
});

test("6h15 e personalizzato con gli stessi orari: decide il tipo durata", () => {
  const modelli = [M(1, "AUTO", "6h15", "07:00", "13:15"), M(2, "AUTO", "personalizzato", "07:00", "13:15")];
  assert.equal(trovaModelloIdentita(modelli, { calendarId: cal, nome: "AUTO", inizio: "07:00", fine: "13:15", tempoEvento: "personalizzato" }).id, 2);
  assert.equal(trovaModelloIdentita(modelli, { calendarId: cal, nome: "AUTO", inizio: "07:00", fine: "13:15", tempoEvento: "6h15" }).id, 1);
  assert.equal(trovaModelloIdentita(modelli, { calendarId: cal, nome: "AUTO", inizio: "07:00", fine: "13:15" }), null);
});

test("tipo durata dedotto dall'evento", () => {
  const c15 = t => (t === "07:00" ? "13:15" : ""), c30 = t => (t === "07:00" ? "13:30" : "");
  assert.equal(tempoDaEvento({ allDay: true }), "h24");
  assert.equal(tempoDaEvento({ allDay: false, tIn: "07:00", tOut: "13:15", calcFine6h15: c15, calcFine6h30: c30 }), "6h15");
  assert.equal(tempoDaEvento({ allDay: false, tIn: "07:00", tOut: "13:30", calcFine6h15: c15, calcFine6h30: c30 }), "6h30");
  assert.equal(tempoDaEvento({ allDay: false, tIn: "", tOut: "", calcFine6h15: c15, calcFine6h30: c30 }), "personalizzato");
});

// Caso 25/10: modello PI DF CHIAIA APP 15:00 con tipo 6h15 (fine 21:15); l'evento e' stato fatto 15:00→21:30 e salvato «per tutti».
const aggiungi = (ora, min) => { const [h, m] = ora.split(":").map(Number); const t = (h * 60 + m + min) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const calc15 = (i) => aggiungi(i, 375), calc30 = (i) => aggiungi(i, 390);

test("tempoModelloDaOrari: fine a 6h30 dall'inizio -> il tipo del modello diventa 6h30", () => {
  assert.equal(tempoModelloDaOrari({ tempoAttuale: "6h15", inizio: "15:00", fine: "21:30", calcFine6h15: calc15, calcFine6h30: calc30 }), "6h30");
});

test("tempoModelloDaOrari: fine a 6h15 -> 6h15; altra durata -> custom", () => {
  assert.equal(tempoModelloDaOrari({ tempoAttuale: "6h30", inizio: "15:00", fine: "21:15", calcFine6h15: calc15, calcFine6h30: calc30 }), "6h15");
  assert.equal(tempoModelloDaOrari({ tempoAttuale: "6h30", inizio: "15:00", fine: "20:00", calcFine6h15: calc15, calcFine6h30: calc30 }), "custom");
});

test("tempoModelloDaOrari: H24 resta H24 e senza orari non cambia il tipo", () => {
  assert.equal(tempoModelloDaOrari({ tempoAttuale: "h24", inizio: "", fine: "", calcFine6h15: calc15, calcFine6h30: calc30 }), "h24");
  assert.equal(tempoModelloDaOrari({ tempoAttuale: "6h15", inizio: "", fine: "", calcFine6h15: calc15, calcFine6h30: calc30 }), "6h15");
  assert.equal(tempoModelloDaOrari({ tempoAttuale: undefined, inizio: "", fine: "", calcFine6h15: calc15, calcFine6h30: calc30 }), "custom");
});

test("tempoModelloDaOrari: attraversa la mezzanotte", () => {
  assert.equal(tempoModelloDaOrari({ tempoAttuale: "custom", inizio: "18:00", fine: "00:15", calcFine6h15: calc15, calcFine6h30: calc30 }), "6h15");
});
