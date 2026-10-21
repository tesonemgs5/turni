export function aggiungiAssegnatiAlReport(config, assegnazioni){
  const assegnati = Object.entries(assegnazioni||{}).filter(([,gruppoKey])=>gruppoKey).map(([id])=>id);
  if(assegnati.length===0) return config||{};
  const inclusi = config?.modelliInclusi||[];
  if(inclusi.length===0) return config||{};
  const modelliInclusi = [...new Set([...inclusi.filter(id=>id!=="__nessuno__"), ...assegnati])];
  if(modelliInclusi.length===inclusi.length && modelliInclusi.every(id=>inclusi.includes(id))) return config;
  return {...config, modelliInclusi};
}

export function normalizzaInclusioniDaSottomenu(config){
  return (config?.sottomenu||[]).reduce(
    (normalizzato, sm)=>aggiungiAssegnatiAlReport(normalizzato, sm.assegnazioni),
    config||{},
  );
}

export function statoInclusioneModelloReport(tipoReport, config, modelloId, isModelloStandard){
  if(tipoReport==="turnazione"){
    const esclusi = config?.modelliEsclusi||[];
    const aggiunti = config?.modelliAggiunti||[];
    return (isModelloStandard && !esclusi.includes(modelloId)) || aggiunti.includes(modelloId);
  }
  if((config?.sottomenu||[]).some(sm=>sm.assegnazioni?.[modelloId])) return true;
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
