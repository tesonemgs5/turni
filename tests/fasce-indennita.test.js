import assert from "node:assert/strict";
import test from "node:test";
import { FASCE_INDENNITA_DEFAULT, PULSANTI_DEFAULT, minutiPerFasceEvento } from "../src/24-fasce-indennita.js";

const festaInfrasettimanale = "2026-10-21";

function calcolaTurnoNotturno(dataInizio, pulsanti=PULSANTI_DEFAULT){
  return minutiPerFasceEvento({
    dateKey: dataInizio,
    m1: 22 * 60,
    m2raw: 6 * 60,
    fasce: FASCE_INDENNITA_DEFAULT,
    pulsanti,
    eFest: () => false,
    eFesta: data => data === festaInfrasettimanale,
  });
}

test("le notti prima e dopo un festivo infrasettimanale ricadono nella fascia al 100%", () => {
  assert.equal(calcolaTurnoNotturno("2026-10-20").infrasettimanale, 480);
  assert.equal(calcolaTurnoNotturno(festaInfrasettimanale).infrasettimanale, 480);
});

test("disattivando l'opzione le notti adiacenti tornano notturno-festivo", () => {
  const pulsanti = PULSANTI_DEFAULT.map(p => p.cod === "fes" ? { ...p, infNotte: false } : p);
  const prima = calcolaTurnoNotturno("2026-10-20", pulsanti);
  const dopo = calcolaTurnoNotturno(festaInfrasettimanale, pulsanti);
  assert.deepEqual(
    [prima.infrasettimanale, prima.notturno_festivo, dopo.infrasettimanale, dopo.notturno_festivo],
    [360, 120, 120, 360],
  );
});

test("la notte tra sabato e domenica resta notturno-festiva", () => {
  const risultato = minutiPerFasceEvento({
    dateKey: "2026-10-24",
    m1: 22 * 60,
    m2raw: 6 * 60,
    fasce: FASCE_INDENNITA_DEFAULT,
    pulsanti: PULSANTI_DEFAULT,
    eFest: () => false,
    eFesta: () => false,
  });
  assert.equal(risultato.notturno_festivo, 480);
  assert.equal(risultato.infrasettimanale, 0);
});
