import assert from "node:assert/strict";
import test from "node:test";
import { nomeSicuro, scadenzaDa, scadenzaDocumento, scadenzaPeriodo, testoPeriodo, periodoValido, leggiPeriodi, PERIODI_PREDEFINITI, documentiDaPulire, idEventiDaStore, idGiorno, GIORNI_ATTESA_ORFANI } from "../src/32-documenti.js";

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

test("i documenti legati a un giorno non sono mai orfani, ma scadono come gli altri", () => {
  const vecchio = ADESSO - (GIORNI_ATTESA_ORFANI + 10) * GIORNO;
  const elenco = [
    { id: "g1", eventId: idGiorno("2027-06-01"), scade: "2027-10-01", creato: vecchio },
    { id: "g2", eventId: idGiorno("2026-11-01"), scade: "2027-03-01", creato: vecchio },
  ];
  assert.equal(idGiorno("2027-06-01"), "giorno:2027-06-01");
  assert.deepEqual(documentiDaPulire(elenco, "2027-04-01", new Set(["e1"]), ADESSO), ["g2"]);
});

test("scadenzaPeriodo: giorni, settimane, mesi e anni dopo la data dell'evento", () => {
  assert.equal(scadenzaPeriodo("2026-11-14", 0, "giorno"), "2026-11-14");
  assert.equal(scadenzaPeriodo("2026-11-14", 1, "giorno"), "2026-11-15");
  assert.equal(scadenzaPeriodo("2026-12-31", 1, "giorno"), "2027-01-01");
  assert.equal(scadenzaPeriodo("2026-11-14", 2, "settimana"), "2026-11-28");
  assert.equal(scadenzaPeriodo("2026-11-14", 4, "mese"), "2027-03-14");
  assert.equal(scadenzaPeriodo("2026-10-31", 4, "mese"), "2027-02-28");
  assert.equal(scadenzaPeriodo("2026-11-14", 1, "anno"), "2027-11-14");
  assert.equal(scadenzaPeriodo("14/11/2026", 1, "giorno"), null);
  assert.equal(scadenzaPeriodo("2026-11-14", 1, "secolo"), null);
});

test("scadenzaDocumento: senza periodo valido sono 4 mesi dopo l'evento", () => {
  assert.deepEqual(scadenzaDocumento(null, "2026-11-14"), { scade: "2027-03-14" });
  assert.deepEqual(scadenzaDocumento({ n: 1, unita: "giorno" }, "2026-11-14"), { scade: "2026-11-15" });
  assert.deepEqual(scadenzaDocumento({ n: 0, unita: "giorno" }, "2026-11-14"), { scade: "2026-11-14" });
});

test("periodo 0: resta fino alle 23.59 del giorno dell'evento, sparisce alle 00.00 dopo", () => {
  const elenco = [{ id: "d", eventId: "e1", scade: "2026-11-14", creato: ADESSO }];
  const presenti = new Set(["e1"]);
  assert.deepEqual(documentiDaPulire(elenco, "2026-11-14", presenti, ADESSO), []);
  assert.deepEqual(documentiDaPulire(elenco, "2026-11-15", presenti, ADESSO), ["d"]);
});

test("testoPeriodo e periodoValido", () => {
  assert.equal(testoPeriodo({ n: 1, unita: "giorno" }), "1 giorno");
  assert.equal(testoPeriodo({ n: 0, unita: "giorno" }), "0 giorni");
  assert.equal(testoPeriodo({ n: 4, unita: "mese" }), "4 mesi");
  assert.equal(testoPeriodo({ n: 2, unita: "settimana" }), "2 settimane");
  assert.equal(testoPeriodo({ n: 1, unita: "anno" }), "1 anno");
  assert.equal(periodoValido({ n: -1, unita: "giorno" }), false);
  assert.equal(periodoValido({ n: 100, unita: "giorno" }), false);
  assert.equal(periodoValido({ n: 1.5, unita: "giorno" }), false);
});

test("senza nulla di salvato i periodi sono 1 giorno e 4 mesi", () => {
  assert.deepEqual(leggiPeriodi().map((p) => [p.n, p.unita]), [[1, "giorno"], [4, "mese"]]);
  assert.equal(PERIODI_PREDEFINITI.length, 2);
});

test("un documento da 24 ore si cancella dopo 24 ore esatte, non prima", () => {
  const elenco = [{ id: "d", eventId: "giorno:2027-12-25", scade: "2027-04-02", scadeMs: ADESSO + GIORNO, creato: ADESSO }];
  assert.deepEqual(documentiDaPulire(elenco, "2027-04-01", new Set(), ADESSO + GIORNO - 1), []);
  assert.deepEqual(documentiDaPulire(elenco, "2027-04-01", new Set(), ADESSO + GIORNO), ["d"]);
});
