import test from "node:test";
import assert from "node:assert/strict";
import { riconosciInizioRiga, trovaGiorniInTesto } from "../src/39-formato-giorno.js";

const g = (linea) => {
  const r = riconosciInizioRiga(linea);
  return r && { giorno: r.giorno, mese: r.mese, anno: r.anno, resto: r.resto.trim() };
};

test("nome intero + data gg/mm/aaaa, anno 0026 = 2026", () => {
  assert.deepEqual(g("Mercoledì 04/11/0026 Primo"), { giorno: 4, mese: 11, anno: 2026, resto: "Primo" });
  assert.deepEqual(g("Domenica 01/11/0026 Riposo settimanale"), { giorno: 1, mese: 11, anno: 2026, resto: "Riposo settimanale" });
});
test("accento mancante o scomposto", () => {
  assert.equal(g("Mercoledi 04/11/2026 Primo").giorno, 4);
  assert.equal(g("Mercoledi\u0300 04/11/2026 Primo").giorno, 4);
});
test("nome abbreviato, con e senza punto", () => {
  assert.deepEqual(g("Gio. 01 Secondo"), { giorno: 1, mese: null, anno: null, resto: "Secondo" });
  assert.deepEqual(g("mer 01 P"), { giorno: 1, mese: null, anno: null, resto: "P" });
  assert.equal(g("Mer. 04/11 Primo").mese, 11);
});
test("numero prima del nome", () => {
  assert.deepEqual(g("01 mer Primo"), { giorno: 1, mese: null, anno: null, resto: "Primo" });
});
test("solo data, separatori diversi e anno a 2 cifre", () => {
  assert.deepEqual(g("04/11/2026 Primo"), { giorno: 4, mese: 11, anno: 2026, resto: "Primo" });
  assert.deepEqual(g("4.11.26 Primo"), { giorno: 4, mese: 11, anno: 2026, resto: "Primo" });
  assert.deepEqual(g("04-11-2026 Primo"), { giorno: 4, mese: 11, anno: 2026, resto: "Primo" });
  assert.deepEqual(g("04 / 11 / 2026 Primo"), { giorno: 4, mese: 11, anno: 2026, resto: "Primo" });
});
test("data ISO", () => {
  assert.deepEqual(g("2026-11-04 Primo"), { giorno: 4, mese: 11, anno: 2026, resto: "Primo" });
});
test("mese in lettere", () => {
  assert.deepEqual(g("Mercoledì 4 novembre 2026 Primo"), { giorno: 4, mese: 11, anno: 2026, resto: "Primo" });
  assert.deepEqual(g("4 nov Primo"), { giorno: 4, mese: 11, anno: null, resto: "Primo" });
  assert.equal(g("1 marzo 2026 Primo").mese, 3);
});
test("nomi inglesi", () => {
  assert.deepEqual(g("Wed 04/11/2026 Primo"), { giorno: 4, mese: 11, anno: 2026, resto: "Primo" });
});
test("icona o simbolo prima del giorno", () => {
  assert.equal(g("» Sab 07 Primo").giorno, 7);
});
test("non sono giorni", () => {
  assert.equal(riconosciInizioRiga("Giorno Assenza Turno COT Inizio"), null);
  assert.equal(riconosciInizioRiga("Novembre 2026"), null);
  assert.equal(riconosciInizioRiga("Primo"), null);
  assert.equal(riconosciInizioRiga("Marzo 2026"), null);
  assert.equal(riconosciInizioRiga("32/11/2026 x"), null);
  assert.equal(riconosciInizioRiga("04/13/2026 x"), null);
});
test("orari dopo il giorno non diventano una data", () => {
  assert.deepEqual(g("Lun 01 - 06:00-14:00 Primo"), { giorno: 1, mese: null, anno: null, resto: "- 06:00-14:00 Primo" });
});
test("testo continuo: più giorni, resto fino al successivo", () => {
  const t = "Titolo Novembre 2026 Lunedì 02/11/0026 Secondo - - Martedì 03/11/0026 Primo Giovedì 05/11/0026 Riposo settimanale";
  const r = trovaGiorniInTesto(t, { richiediMese: true });
  assert.deepEqual(r.map((x) => [x.giorno, x.mese, x.anno]), [[2, 11, 2026], [3, 11, 2026], [5, 11, 2026]]);
  assert.match(r[0].resto, /^\s*Secondo/);
  assert.match(r[2].resto, /Riposo/);
});
