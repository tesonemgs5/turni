import test from "node:test";
import assert from "node:assert/strict";
import { abbinaPianoIncentivanteRiposi, chiaveOccorrenza } from "../src/43-collegamenti-pi.js";

const pi = (id, dateKey) => ({ id, dateKey });
const occ = (r, dateKey, id) => r.perOccorrenza[chiaveOccorrenza(dateKey, id)];

test("regola invariata: il 1° riposo con la 1ª domenica, il 2° con la 2ª", () => {
  const r = abbinaPianoIncentivanteRiposi(
    [pi("a", "2026-10-18"), pi("b", "2026-10-25"), pi("c", "2026-11-01")],
    [pi("r1", "2026-11-10"), pi("r2", "2026-11-11")],
  );
  assert.equal(occ(r, "2026-10-18", "a").collegatoDateKey, "2026-11-10");
  assert.equal(occ(r, "2026-10-25", "b").collegatoDateKey, "2026-11-11");
  assert.equal(occ(r, "2026-11-01", "c").collegatoDateKey, null);
  assert.equal(occ(r, "2026-11-10", "r1").collegatoDateKey, "2026-10-18");
  assert.equal(occ(r, "2026-11-11", "r2").collegatoDateKey, "2026-10-25");
});

test("un riposo e' collegato a UNA sola domenica e viceversa (collegamenti reciproci)", () => {
  const r = abbinaPianoIncentivanteRiposi(
    [pi("a", "2026-10-18"), pi("b", "2026-10-25"), pi("c", "2026-11-22")],
    [pi("r1", "2026-11-11"), pi("r2", "2026-11-13"), pi("r3", "2026-11-14")],
  );
  const usati = new Set();
  for (const d of ["2026-10-18", "2026-10-25", "2026-11-22"]) {
    const id = { "2026-10-18": "a", "2026-10-25": "b", "2026-11-22": "c" }[d];
    const rip = occ(r, d, id).collegatoDateKey;
    assert.ok(rip && !usati.has(rip), "riposo gia' usato: " + rip);
    usati.add(rip);
  }
});

test("due domeniche con lo stesso id non condividono piu' lo stesso riposo", () => {
  // Caso reale: 18/10 e 25/10 con lo stesso id "X" mostravano entrambe lo stesso riposo.
  const r = abbinaPianoIncentivanteRiposi(
    [pi("X", "2026-10-18"), pi("X", "2026-10-25")],
    [pi("r1", "2026-11-11"), pi("r2", "2026-11-13")],
  );
  assert.equal(occ(r, "2026-10-18", "X").collegatoDateKey, "2026-11-11");
  assert.equal(occ(r, "2026-10-25", "X").collegatoDateKey, "2026-11-13");
  assert.deepEqual(r.duplicati, { X: ["2026-10-18", "2026-10-25"] });
});

test("lo stesso evento visto da piu' calendari (stessa data e id) conta una volta sola", () => {
  const r = abbinaPianoIncentivanteRiposi(
    [pi("a", "2026-10-18"), pi("a", "2026-10-18")],
    [pi("r1", "2026-11-11")],
  );
  assert.equal(Object.keys(r.duplicati).length, 0);
  assert.equal(occ(r, "2026-10-18", "a").collegatoDateKey, "2026-11-11");
});

test("senza domeniche o senza riposi non si rompe niente", () => {
  const r = abbinaPianoIncentivanteRiposi([], [pi("r1", "2026-11-11")]);
  assert.equal(occ(r, "2026-11-11", "r1").collegatoDateKey, null);
  assert.deepEqual(abbinaPianoIncentivanteRiposi(undefined, undefined).perEvento, {});
});

test("perEvento (per id) resta disponibile con la prima occorrenza", () => {
  const r = abbinaPianoIncentivanteRiposi([pi("a", "2026-10-18")], [pi("r1", "2026-11-11")]);
  assert.equal(r.perEvento.a.collegatoDateKey, "2026-11-11");
  assert.equal(r.perEvento.r1.collegatoDateKey, "2026-10-18");
});
