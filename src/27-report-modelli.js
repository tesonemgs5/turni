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

// Modelli del filtro del report che esistono ancora. Un ID rimasto nel filtro dopo che un modello e' stato
// eliminato o ricreato non corrisponde a niente: non si conta e non si mostra.
export function modelliInclusiValidi(inclusi, esistenti){
  const ok = new Set(esistenti||[]);
  return (inclusi||[]).filter(id=>id!=="__nessuno__" && ok.has(id));
}

// Toglie dal filtro gli ID che non corrispondono a nessun modello. Se non c'e' nulla da togliere restituisce
// LO STESSO oggetto. Se i modelli rimasti sono zero la lista diventa «nessun modello» (mai «tutti»).
export function pulisciModelliInclusi(config, esistenti){
  const inc = config?.modelliInclusi;
  if(!Array.isArray(inc) || inc.length===0) return config;
  const ok = new Set(esistenti||[]);
  const tenuti = inc.filter(id=>id==="__nessuno__" || ok.has(id));
  if(tenuti.length===inc.length) return config;
  const veri = tenuti.filter(id=>id!=="__nessuno__");
  return {...config, modelliInclusi: veri.length>0 ? veri : ["__nessuno__"]};
}
