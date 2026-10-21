import assert from "node:assert/strict";
import test from "node:test";
import { meseCorrenteReport, statoInizialeMeseReport } from "../src/28-periodo-report.js";

test("il periodo automatico parte dal mese corrente e segue i cambi di mese", () => {
  const oggi = new Date(2026, 9, 21);
  assert.deepEqual(statoInizialeMeseReport(null, null, oggi), {mese:{anno:2026,mese:10},segueCorrente:true});
  assert.deepEqual(meseCorrenteReport(new Date(2026, 10, 1)), {anno:2026,mese:11});
});

test("mantiene un mese scelto manualmente anche se non è quello corrente", () => {
  assert.deepEqual(statoInizialeMeseReport("2026-8", "0", new Date(2026, 9, 21)), {
    mese:{anno:2026,mese:8},
    segueCorrente:false,
  });
});

test("migra le preferenze precedenti distinguendo il mese corrente da quello manuale", () => {
  const oggi = new Date(2026, 9, 21);
  assert.equal(statoInizialeMeseReport("2026-10", null, oggi).segueCorrente, true);
  assert.equal(statoInizialeMeseReport("2026-9", null, oggi).segueCorrente, false);
});

test("un mese salvato non valido usa il mese corrente", () => {
  assert.deepEqual(statoInizialeMeseReport("2026-13", null, new Date(2026, 9, 21)), {
    mese:{anno:2026,mese:10},
    segueCorrente:true,
  });
});
