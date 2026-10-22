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

function calcolaIntervallo(dataInizio, m1, m2raw){
  return minutiPerFasceEvento({
    dateKey:dataInizio,m1,m2raw,fasce:FASCE_INDENNITA_DEFAULT,pulsanti:PULSANTI_DEFAULT,
    eFest:()=>false,eFesta:()=>false,
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

test("le fasce notturne e festive hanno confini distinti senza doppio conteggio", () => {
  const lunediVenerdi = calcolaIntervallo("2026-10-28",22*60,0);
  const sabatoSera = calcolaIntervallo("2026-10-24",22*60,0);
  const domenicaNotte = calcolaIntervallo("2026-10-25",0,6*60);
  const domenicaGiorno = calcolaIntervallo("2026-10-25",6*60,22*60);
  const domenicaSera = calcolaIntervallo("2026-10-25",22*60,0);
  const lunediMattina = calcolaIntervallo("2026-10-26",0,6*60);

  assert.deepEqual([lunediVenerdi.notturno_o_festivo,lunediVenerdi.notturno_festivo],[120,0]);
  assert.deepEqual([sabatoSera.notturno_o_festivo,sabatoSera.notturno_festivo],[0,120]);
  assert.deepEqual([domenicaNotte.notturno_o_festivo,domenicaNotte.notturno_festivo],[0,360]);
  assert.deepEqual([domenicaGiorno.notturno_o_festivo,domenicaGiorno.notturno_festivo],[960,0]);
  assert.deepEqual([domenicaSera.notturno_o_festivo,domenicaSera.notturno_festivo],[0,120]);
  assert.deepEqual([lunediMattina.notturno_o_festivo,lunediMattina.notturno_festivo],[0,360]);
});

test("notturno o festivo non sottrae minuti alla fascia notturno e festivo, anche se viene prima", () => {
  const notturnoOFestivo = FASCE_INDENNITA_DEFAULT.find(f=>f.key==="notturno_o_festivo");
  const notturnoEFestivo = FASCE_INDENNITA_DEFAULT.find(f=>f.key==="notturno_festivo");
  const fasce = [
    FASCE_INDENNITA_DEFAULT.find(f=>f.key==="diurno"),
    notturnoOFestivo,
    notturnoEFestivo,
    FASCE_INDENNITA_DEFAULT.find(f=>f.key==="infrasettimanale"),
  ];
  const calcola = (dateKey,m1,m2raw)=>minutiPerFasceEvento({
    dateKey,m1,m2raw,fasce,pulsanti:PULSANTI_DEFAULT,eFest:()=>false,eFesta:()=>false,
  });
  const sabatoSera=calcola("2026-10-24",22*60,0);
  const domenicaNotte=calcola("2026-10-25",0,6*60);
  const domenicaGiorno=calcola("2026-10-25",6*60,22*60);
  const lunediMattina=calcola("2026-10-26",0,6*60);

  assert.deepEqual([sabatoSera.notturno_o_festivo,sabatoSera.notturno_festivo],[0,120]);
  assert.deepEqual([domenicaNotte.notturno_o_festivo,domenicaNotte.notturno_festivo],[0,360]);
  assert.deepEqual([domenicaGiorno.notturno_o_festivo,domenicaGiorno.notturno_festivo],[960,0]);
  assert.deepEqual([lunediMattina.notturno_o_festivo,lunediMattina.notturno_festivo],[0,360]);
});

test("le notti adiacenti si possono togliere solo dalla fascia infrasettimanale, senza toccare le altre", () => {
  const fasce = FASCE_INDENNITA_DEFAULT.map(f => f.key === "infrasettimanale" ? { ...f, infPrima: false } : f);
  const r = minutiPerFasceEvento({
    dateKey: "2026-10-20", m1: 22 * 60, m2raw: 6 * 60, fasce, pulsanti: PULSANTI_DEFAULT,
    eFest: () => false, eFesta: data => data === festaInfrasettimanale,
  });
  // sera prima (22→24) esce dall'infrasettimanale; la mattina dopo (00→06) resta al 100%
  assert.equal(r.infrasettimanale, 360);
  assert.equal(r.notturno_festivo, 120);
});
