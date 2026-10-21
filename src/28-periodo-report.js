export function meseCorrenteReport(oggi = new Date()){
  return {anno:oggi.getFullYear(), mese:oggi.getMonth()+1};
}

function parseMeseReport(salvato){
  if(!salvato) return null;
  const [anno, mese] = salvato.split("-").map(Number);
  if(!Number.isInteger(anno) || anno<1 || !Number.isInteger(mese) || mese<1 || mese>12) return null;
  return {anno, mese};
}

export function statoInizialeMeseReport(salvato, segueCorrenteSalvato, oggi = new Date()){
  const corrente = meseCorrenteReport(oggi);
  const meseSalvato = parseMeseReport(salvato);
  if(segueCorrenteSalvato==="1") return {mese:corrente, segueCorrente:true};
  if(segueCorrenteSalvato==="0" && meseSalvato) return {mese:meseSalvato, segueCorrente:false};
  if(meseSalvato){
    const segueCorrente = meseSalvato.anno===corrente.anno && meseSalvato.mese===corrente.mese;
    return {mese:meseSalvato, segueCorrente};
  }
  return {mese:corrente, segueCorrente:true};
}
