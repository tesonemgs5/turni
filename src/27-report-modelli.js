export function statoInclusioneModelloReport(tipoReport, config, modelloId, isModelloStandard){
  if(tipoReport==="turnazione"){
    const esclusi = config?.modelliEsclusi||[];
    const aggiunti = config?.modelliAggiunti||[];
    return (isModelloStandard && !esclusi.includes(modelloId)) || aggiunti.includes(modelloId);
  }
  const inclusi = config?.modelliInclusi||[];
  return inclusi.length===0 || inclusi.includes(modelloId);
}

export function impostaInclusioneModelloReport(tipoReport, config, modelloId, incluso, isModelloStandard, tuttiModelliIds=[]){
  const nuovo = {...(config||{})};
  if(tipoReport==="turnazione"){
    const esclusi = nuovo.modelliEsclusi||[];
    const aggiunti = nuovo.modelliAggiunti||[];
    if(isModelloStandard){
      nuovo.modelliEsclusi = incluso
        ? esclusi.filter(id=>id!==modelloId)
        : [...new Set([...esclusi, modelloId])];
      nuovo.modelliAggiunti = aggiunti.filter(id=>id!==modelloId);
    } else {
      nuovo.modelliAggiunti = incluso
        ? [...new Set([...aggiunti, modelloId])]
        : aggiunti.filter(id=>id!==modelloId);
    }
    return nuovo;
  }

  const inclusi = (nuovo.modelliInclusi||[]).filter(id=>id!=="__nessuno__");
  const nessuno = (nuovo.modelliInclusi||[]).includes("__nessuno__");
  const tuttiInclusi = inclusi.length===0 && !nessuno;
  if(incluso){
    if(!tuttiInclusi) nuovo.modelliInclusi = [...new Set([...inclusi, modelloId])];
  } else {
    const restanti = tuttiInclusi
      ? tuttiModelliIds.filter(id=>id!==modelloId)
      : inclusi.filter(id=>id!==modelloId);
    nuovo.modelliInclusi = restanti.length===0 ? ["__nessuno__"] : restanti;
  }
  return nuovo;
}
