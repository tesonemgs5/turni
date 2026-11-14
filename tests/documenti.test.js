import assert from "node:assert/strict";
import test from "node:test";
import { nomeSicuro, scadenzaDa, documentiDaPulire, idEventiDaStore, GIORNI_ATTESA_ORFANI } from "../src/32-documenti.js";

test("la scadenza e' 4 mesi dopo la data dell'evento", () => {
  assert.equal(scadenzaDa("2026-11-14"), "2027-03-14");
  assert.equal(scadenzaDa("2026-09-01"), "2027-01-01");
});

test("la scadenza accorcia il giorno se il mese di arrivo e' piu' corto", () => {
  assert.equal(scadenzaDa("2026-10-31"), "2027-02-28");
  assert.equal(scadenzaDa("2027-10-31"), "2028-02-29");
});

test("data non valida = nessuna scadenza", () => {
  assert.equal(scadenzaDa("14/11/2026"), null);
  assert.equal(scadenzaDa(""), null);
});

const GIORNO = 24 * 60 * 60 * 1000;
const ADESSO = Date.UTC(2027, 3, 1);

test("si cancellano solo i documenti scaduti", () => {
  const elenco = [
    { id: "a", eventId: "e1", scade: "2027-03-14", creato: ADESSO },
    { id: "b", eventId: "e2", scade: "2027-04-01", creato: ADESSO },
    { id: "c", eventId: "e3", scade: "2027-08-01", creato: ADESSO },
  ];
  const presenti = new Set(["e1", "e2", "e3"]);
  assert.deepEqual(documentiDaPulire(elenco, "2027-04-01", presenti, ADESSO), ["a"]);
});

test("un orfano si cancella solo dopo l'attesa", () => {
  const elenco = [
    { id: "nuovo", eventId: "x", scade: "2027-12-01", creato: ADESSO - 2 * GIORNO },
    { id: "vecchio", eventId: "y", scade: "2027-12-01", creato: ADESSO - (GIORNI_ATTESA_ORFANI + 1) * GIORNO },
    { id: "ok", eventId: "e1", scade: "2027-12-01", creato: ADESSO - (GIORNI_ATTESA_ORFANI + 1) * GIORNO },
  ];
  assert.deepEqual(documentiDaPulire(elenco, "2027-04-01", new Set(["e1"]), ADESSO), ["vecchio"]);
});

test("senza eventi noti non si cancella nessun orfano", () => {
  const elenco = [{ id: "v", eventId: "y", scade: "2027-12-01", creato: 0 }];
  assert.deepEqual(documentiDaPulire(elenco, "2027-04-01", new Set(), ADESSO), []);
  assert.deepEqual(documentiDaPulire(elenco, "2027-04-01", null, ADESSO), []);
});

test("idEventiDaStore raccoglie gli id di tutti i giorni e calendari", () => {
  const store = { events: { "2026-11-14": { c1: [{ id: "a" }, { id: "b" }], c2: [{ id: "c" }] }, "2026-11-15": { c1: [{ id: "d" }] } } };
  assert.deepEqual([...idEventiDaStore(store)].sort(), ["a", "b", "c", "d"]);
  assert.equal(idEventiDaStore(null).size, 0);
});

test("nomeSicuro toglie i caratteri pericolosi e tiene accenti ed estensione", () => {
  assert.equal(nomeSicuro("Certificato/medico:2026?.pdf"), "Certificato_medico_2026_.pdf");
  assert.equal(nomeSicuro("Perché già.pdf"), "Perché già.pdf");
  assert.equal(nomeSicuro(""), "documento");
  assert.ok(nomeSicuro("a".repeat(200)).length <= 80);
});
