export function intervalloPersonalizzatoReport(intervallo, oggi = new Date()){
  if(!intervallo?.from || (!intervallo.to && !intervallo.toOggi)) return null;
  const to = intervallo.toOggi
    ? `${oggi.getFullYear()}-${String(oggi.getMonth()+1).padStart(2,"0")}-${String(oggi.getDate()).padStart(2,"0")}`
    : intervallo.to;
  return intervallo.from<=to ? {from:intervallo.from, to} : null;
}

export function dataNelPeriodoReport(data, periodo){
  return !!periodo && data>=periodo.from && data<=periodo.to;
}

export function impostaSelezioneModelliGruppo(assegnazioni, modelIds, gruppoKey, selezionato){
  const next = {...assegnazioni};
  if(selezionato) modelIds.forEach(id=>{ next[id]=gruppoKey; });
  else Object.keys(next).forEach(id=>{ if(next[id]===gruppoKey) delete next[id]; });
  return next;
}
