    // popup.
    if(typeof navigator!=="undefined" && navigator.onLine===false){
      return accodaSilenziosamente();
    }
    async function provaSupabase(payloadCorrente, tentativi=0){
      if(tentativi>=10) return { error:{message:"Troppi tentativi di retry sullo schema"} };
      let q;
      if(tipo==="insert") q = supabase.from(table).insert(payloadCorrente);
      else if(tipo==="update") q = supabase.from(table).update(payloadCorrente).match(matchObj);
      else q = supabase.from(table).delete().match(matchObj);
      const { error } = await q;
      if(!error) return { error:null, payloadUsato:payloadCorrente };
      const m = /Could not find the '([^']+)' column/.exec(error.message||"");
      if(m && payloadCorrente && m[1] in payloadCorrente){
        segnalaErroreSoloLog(`Colonna '${m[1]}' assente su Supabase: omessa e riprovato automaticamente. Esegui l'ALTER TABLE per abilitarla stabilmente.`, `${contesto} (schema database)`);
        const { [m[1]]: _omessa, ...resto } = payloadCorrente;
        return provaSupabase(resto, tentativi+1);
      }
      return { error, payloadUsato:payloadCorrente };
    }
    try{
      const [risSupabase] = await Promise.all([
        provaSupabase(payload),
        (eventsPerSheets!==undefined) ? syncSeAttivo(eventsPerSheets, calendarsPerSheets, modelliPerSheets) : Promise.resolve(),
      ]);
      if(risSupabase.error){
        // Se l'errore sembra di rete (connessione ballerina che ha lasciato
        // cadere questa singola richiesta, anche se navigator.onLine
        // risultava true) NON è un errore vero: si accoda silenziosamente,
        // esattamente come nel caso offline sopra. Il popup è riservato
        // solo agli errori che una nuova connessione non risolverebbe da
        // sola (permessi, validazione, RLS...).
        if(eRoreDiRete(risSupabase.error)){