    import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./11-supabase";
import {
  FASCE_AUTOMATICHE_DEFAULT, FESTIVITA_DEFAULT_ATTIVE, MONTHS, NOMI_GIORNI_IT, PALETTE,
  calcFine6h15, calcFine6h30, calcFineModello, categoriaAppAutoAutomatica, categoriaTurnoAutomatica,
  daysInMonth, dkey, , getColorByTime, getColorLabel,
  getContrastTextColor, getShiftBand, isFestivo, isModelloTurnazioneDefault, italianHols,
  leggiCodaSync, leggiErroriSilenziati, leggiLogErrori, loadFromLocalStorage, minsOf,
  minutiTurnoModello, normalizzaOraHHMM, oraInMinuti, registraListenerCodaErrori, registraProblemiImport,
  sameData, saveDatiSessioneLocale, saveToLocalStorage, scriviCodaSync, segnalaErrore, segnalaErroreSoloLog,
  uid, withEventoAggiornato, withEventoAggiunto, withEventoRimosso,
  esportaBackupLocaleCompleto, importaBackupLocaleCompleto, CATEGORIE_BACKUP_LOCALE,
} from "./04-Rotazione";

// ════════════════════════════════════════════════════════════
// useAppCore.js — Custom hook che concentra tutto lo stato e la
// logica dell'app: init, CRUD calendari/eventi, sync Google Sheets
// + Supabase, CRUD modelli/colori/rotazioni, report helpers.
// Provenienza: App.jsx originale, sezioni 5-14.
//
// Uso: nel componente App, `const C = useAppCore(session);` poi si
// passa C (o le chiavi che servono) alle viste.
// ═══════════════════════════════════════════════════════════════

// #region SEZIONE 5: REPORT TEMPLATES + INIT STATE
// ═══════════════════════════════════════════════════════════════
const REPORT_TEMPLATES = [
  { type:"conteggio_turni", label:"Conteggio turni", desc:"Conta i turni per fascia oraria" },
  { type:"turnazione",      label:"Turnazione", desc:"Turni per modello con date, 1°/2° turno automatico" },
  { type:"indennita",       label:"Indennità di servizio", desc:"Calcola le indennità per fascia, con Viabilità/Ticket come sottomenu" },
  { type:"ore_turno",       label:"Ore per turno", desc:"Stima ore lavorate" },
  { type:"straordinari",    label:"Straordinari", desc:"Protrazioni e straordinari" },
  { type:"guadagni",        label:"Guadagni", desc:"Stima guadagni da indennità" },
];

const INIT = { calendars:[], events:{}, theme:"auto", extraHols:[], reports:[], reportSettings:{}, fasceAutomatiche: FASCE_AUTOMATICHE_DEFAULT, sundayColor:"", holidayColor:"", nationalHolsEnabled:FESTIVITA_DEFAULT_ATTIVE, calEventRows:1, calRow1Field:"titolo", calRow2Field:"---" };

export function useAppCore(session){
  const today = new Date();
  // <- AGGANCIO: qui aggiungo un <style> globale con @keyframes calFadeIn, iniettato una sola volta nel render finale
// #endregion

// #region SEZIONE 6: USESTATE HOOKS
// ═══════════════════════════════════════════════════════════════
  const [store, setStore] = useState(INIT);
  // Ref sincrono per leggere l'ultimo valore di store dentro funzioni
  // async (es. sincronizzaEventiProtrazione chiamata subito dopo un
  // setStore, prima che il re-render abbia aggiornato la closure di
  // updateEvt/saveEvt): senza questo ref, la ricerca del figlio di
  // protrazione esistente può leggere uno snapshot di store "vecchio"
  // di un giro, non trovare il figlio già creato in una modifica
  // precedente e crearne un secondo doppione invece di aggiornare quello
  // già presente. Stesso pattern già usato per modelliRef qui sotto.
  const storeRef = useRef(INIT);
  useEffect(()=>{ storeRef.current = store; }, [store]);
  const [loading, setLoading] = useState(true);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calId, setCalId] = useState(null);
  useEffect(()=>{
    if(calId){ try{ localStorage.setItem('cache_calId', calId); }catch(e){} }
  }, [calId]);
  const [editMode, setEditMode] = useState(false); // "M" — ON = modifica singola, OFF = selezione multipla
  const [selectedCalIds, setSelectedCalIds] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('cache_selectedCalIds')||'[]'); }catch(e){ return []; }
  }); // selezione multipla calendari — determina anche cosa resta visibile in editMode. Persistita: al refresh/riavvio resta quella scelta dall'utente, non torna a "tutti".
  useEffect(()=>{
    try{ localStorage.setItem('cache_selectedCalIds', JSON.stringify(selectedCalIds)); }catch(e){}
  }, [selectedCalIds]);
  const [reportCalIds, setReportCalIds] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('cache_reportCalIds')||'[]'); }catch(e){ return []; }
  }); // selezione calendari per il Report. Persistita: il salvataggio avviene SINCRONAMENTE dentro l'handler del click (vedi setReportCalIdsPersistito piu' sotto e il suo uso in 3_Calendario.jsx), non tramite useEffect, per evitare che un refresh immediato dopo il click perda la selezione appena fatta.
  function setReportCalIdsPersistito(updater){
    setReportCalIds(prev=>{
      const next = typeof updater==="function" ? updater(prev) : updater;
      try{ localStorage.setItem('cache_reportCalIds', JSON.stringify(next)); }catch(e){}
      return next;
    });
  }
  const [selectedModelloIds, setSelectedModelloIds] = useState([]); // selezione multipla modelli (editMode OFF)
  const [screen, setScreen] = useState("cal");
  const [dayKey, setDayKey] = useState(null);
  const [form,   setForm]   = useState(null);
  const [pal,    setPal]    = useState(null);
  const [ncName,  setNcName]  = useState("");
  const [ncColor, setNcColor] = useState(PALETTE[9]);
  const [nsName,  setNsName]  = useState("");
  const [nsColor, setNsColor] = useState(PALETTE[0]);
  const [exCal,   setExCal]   = useState(null);
  const [nhName,  setNhName]  = useState("");
  const [patronoCittaSel, setPatronoCittaSel] = useState("");
  const [syncMsg,  setSyncMsg]  = useState("");
  const [backupsList, setBackupsList] = useState([]);
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [showLocalDataModal, setShowLocalDataModal] = useState(false);
  const [esitoBackupLocale, setEsitoBackupLocale] = useState(null); // {tipo:"ok"|"errore", messaggio} — esito ultimo export/import locale
  const [confermaImportLocale, setConfermaImportLocale] = useState(null); // backup parsato in attesa di conferma prima di sovrascrivere
  const [backupPeriodoDa, setBackupPeriodoDa] = useState(""); // filtro export locale: data inizio (YYYY-MM-DD), vuoto = nessun filtro
  const [backupPeriodoA, setBackupPeriodoA] = useState("");   // filtro export locale: data fine (YYYY-MM-DD), vuoto = nessun filtro
  const [syncing,  setSyncing]  = useState(false);
  const [nhD,     setNhD]     = useState("");
  const [nhM,     setNhM]     = useState("");
  // Anno opzionale dei Festivi Personalizzati: se vuoto la data si ripete
  // ogni anno, se valorizzato vale solo per quell'anno specifico.
  const [nhY,     setNhY]     = useState("");
  const [bgSyncing, setBgSyncing] = useState(false);
  const [dbError, setDbError] = useState("");
  const [isWideScreen, setIsWideScreen] = useState(typeof window!=="undefined"?window.innerWidth>900:false);
  useEffect(()=>{
    const onResize=()=>setIsWideScreen(window.innerWidth>900);
    window.addEventListener("resize", onResize);
    return ()=>window.removeEventListener("resize", onResize);
  },[]);
  const evtFontSize = isWideScreen ? "12px" : "clamp(12px,3.2vw,15px)";
  const dbErrorTimer = useRef(null);
  // Coda degli errori accodati da segnalaErrore() in qualsiasi punto
  // dell'app (anche fuori da questo componente). Mostrati uno alla volta:
  // un solo bottone OK (chiude sempre) + checkbox "non mostrare più" per
  // quel contesto specifico (silenziamento persistente, riattivabile da
  // Impostazioni -> Log).
  const [codaErrori, setCodaErrori] = useState([]);
  // Dati per la sezione "Log" in Impostazioni: caricati solo quando la
  // sezione viene aperta (leggiLogErrori/leggiErroriSilenziati leggono da
  // localStorage, non serve tenerli sempre in memoria).
  const [logErroriVisibile, setLogErroriVisibile] = useState(null);
  const [erroriSilenziatiVisibile, setErroriSilenziatiVisibile] = useState(null);
  useEffect(()=>{
    registraListenerCodaErrori((nuovoErrore)=>{
      setCodaErrori(prev=>[...prev, nuovoErrore]);
    });
    return ()=>registraListenerCodaErrori(null);
  }, []);
  // ─── Rete di sicurezza FINALE, a livello di intera pagina: qualsiasi
  // eccezione non gestita — sia una Promise async senza try/catch da
  // qualche parte non ancora coperta, sia un errore sincrono generico —
  // ora arriva comunque qui invece di sparire silenziosamente in
  // console (F12) senza che l'utente ne sappia nulla. Non sostituisce i
  // try/catch mirati già messi sulle azioni principali (salva turno,
  // salva/elimina modello): quelli danno un messaggio specifico e utile;
  // questo è l'ultima rete, generica, per tutto il resto.
  useEffect(()=>{
    function onUnhandledRejection(ev){
      segnalaErrore(
        { message: ev?.reason?.message || String(ev?.reason||"Errore asincrono non gestito") },
        "Errore imprevisto (operazione non completata)"
      );
    }
    function onGlobalError(ev){
      segnalaErrore(
        { message: ev?.message || "Errore sconosciuto" },
        "Errore imprevisto dell'app"
      );
    }
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onGlobalError);
    return ()=>{
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onGlobalError);
    };
  }, []);
  function segnalaErroreDb(error, contesto){
    segnalaErrore(error, contesto);
    const msg = error?.message || "Errore sconosciuto";
    setDbError(`⚠️ ${contesto}: ${msg}`);
    if(dbErrorTimer.current) clearTimeout(dbErrorTimer.current);
    dbErrorTimer.current = setTimeout(()=>setDbError(""), 6000);
  }
  // ─── Wrapper per il pattern Supabase+gestione errore, ripetuto in tutto
  // il file: query, controlla error, segnala se fallisce. Un solo posto da
  // toccare se cambia come viene gestito un errore di scrittura; e soprattutto
  // impossibile dimenticare il controllo dell'errore, perché è già dentro
  // il wrapper stesso invece di doverlo scrivere ogni volta a mano.
  // matchObj: oggetto di filtri applicati con .match() (es. {id, user_id}).
  // opzioni.soloLog: se true, l'errore va solo nel Log senza aprire il
  // modale — per i casi dentro un ciclo dove un riepilogo unico basta
  // (vedi eseguiNormalizzazione).
  async function dbUpdate(table, payload, matchObj, contesto, opzioni={}){
    const { data, error } = await supabase.from(table).update(payload).match(matchObj).select();
    if(error){
      if(opzioni.soloLog) segnalaErroreSoloLog(error, contesto);
      else segnalaErroreDb(error, contesto);
    }
    return { data, error };
  }
  async function dbDelete(table, matchObj, contesto, opzioni={}){
    const { data, error } = await supabase.from(table).delete().match(matchObj).select();
    if(error){
      if(opzioni.soloLog) segnalaErroreSoloLog(error, contesto);
      else segnalaErroreDb(error, contesto);
    }
    return { data, error };
  }
  async function dbInsert(table, payload, contesto, opzioni={}){
    const { data, error } = await supabase.from(table).insert(payload).select();
    if(error){
      if(opzioni.soloLog) segnalaErroreSoloLog(error, contesto);
      else segnalaErroreDb(error, contesto);
    }
    return { data, error };
  }

  // ─── Fetch COMPLETO di una tabella, a prescindere da quante righe ha.
  // Supabase/PostgREST applica di default un limite massimo di 1000 righe
  // per singola query (impostazione db-max-rows del progetto): un normale
  // .select("*") su una tabella con più di 1000 eventi ne restituisce solo
  // i primi 1000, TRONCANDO il resto in silenzio, senza errore. Questo era
  // il motivo per cui il pannello "Dati salvati in Supabase" mostrava
  // esattamente "1000" eventi totali (il muro del limite, non il conteggio
  // vero) e per cui un backup costruito con un select semplice avrebbe
  // perso ogni evento oltre il millesimo. Questa funzione pagina la lettura
  // in blocchi da 1000 con .range(), richiamando finché l'ultimo blocco
  // torna con meno di 1000 righe (segno che si è arrivati alla fine),
  // così ogni chiamante ottiene SEMPRE l'intera tabella, qualunque sia la
  // sua dimensione, senza dover sapere nulla del limite sottostante.
  async function dbSelectTutto(table, { colonne="*", matchObj=null, orderBy=null, ascending=true, contesto }={}){
    const DIMENSIONE_BLOCCO = 1000;
    let tutteLeRighe = [];
    let offset = 0;
    while(true){
      let query = supabase.from(table).select(colonne);
      if(matchObj) query = query.match(matchObj);
      if(orderBy) query = query.order(orderBy, { ascending });
      query = query.range(offset, offset + DIMENSIONE_BLOCCO - 1);
      const { data, error } = await query;
      if(error){
        segnalaErroreDb(error, contesto || `Lettura completa tabella "${table}"`);
        return { data: tutteLeRighe, error };
      }
      const blocco = data || [];
      tutteLeRighe = tutteLeRighe.concat(blocco);
      if(blocco.length < DIMENSIONE_BLOCCO) break; // ultimo blocco: fine tabella
      offset += DIMENSIONE_BLOCCO;
    }
    return { data: tutteLeRighe, error: null };
  }

  // ─── Wrapper unico per OGNI operazione di scrittura CRUD (turni, modelli,
  // rotazioni, calendari...). Il locale è la fonte di verità: il chiamante
  // aggiorna SEMPRE lo stato React + localStorage PRIMA di chiamare questa
  // funzione (quella parte resta specifica di ogni CRUD, cambia da caso a
  // caso). Da qui in poi, il comportamento è identico per tutti:
  //
  //   1) Prova Supabase. Se la tabella rifiuta una colonna che non esiste
  //      ancora (schema non ancora allineato al codice), la toglie dal
  //      payload e riprova in automatico (fino a 10 volte) — stesso
  //      comportamento che aveva supabaseUpsertConRetry, riportato qui.
  //   2) In PARALLELO (non in sequenza), backup su Sheets con la stessa
  //      istantanea di dati passata dal chiamante.
  //   3) Se Supabase fallisce per un'eccezione di rete (offline), l'intera
  //      operazione (con il suo timestamp) va in coda: verrà ritentata
  //      identica al ritorno della connessione. Se invece Supabase risponde
  //      con un errore "vero" (non di rete: validazione, permessi...), non
  //      va in coda — si segnala e basta, ritentarla non la farebbe passare.
  //
  // ts: timestamp ISO dell'istante in cui l'utente ha fatto la modifica
  // (non di quando questa funzione viene eseguita) — usato per decidere la
  // precedenza se due dispositivi modificano la stessa riga mentre uno era
  // offline: vince sempre la modifica con ts più recente.
  // ─── Verifica indipendente: dopo che Supabase ha risposto "nessun
  // errore", RILEGGE la riga (o l'assenza di riga, per i delete) per
  // essere certi che sia davvero scritta/cancellata — non ci si fida
  // della sola assenza di errore nella risposta dell'insert/update.
  // Confronta solo i campi presenti nel payload effettivamente inviato
  // (quello sopravvissuto agli eventuali retry di colonna mancante).
  // Un fallimento di rete DURANTE la verifica non è come un fallimento di
  // rete durante la scrittura vera e propria: qui la scrittura (provaSupabase)
  // è già andata a buon fine senza errori, si sta solo ricontrollando. Se il
  // fetch di verifica cade per rete instabile, non vuol dire che il dato sia
  // andato perso: lo segnaliamo con direte:true così il chiamante lo accoda
  // silenziosamente invece di bloccare con un modale come se fosse un errore vero.
  function eRoreDiRete(e){
    // Raccoglie il testo da TUTTE le forme in cui un errore di rete può
    // presentarsi qui dentro: un vero Error nativo (.message="Failed to
    // fetch", .name="TypeError"), un errore Postgrest/Supabase (plain
    // object con .message, a volte .details con lo stack, a volte .cause),
    // o un AuthRetryableFetchError. Prima si guardava solo e.message: se
    // quel campo era assente/vuoto o il testo utile stava altrove (es.
    // .details, .cause.message), il riconoscimento falliva silenziosamente
    // e l'errore di rete finiva loggato come se fosse un errore "vero"
    // invece di essere accodato silenziosamente e ritentato.
    let testo = "";
    try{
      testo = [
        e?.message, e?.details, e?.hint, e?.cause?.message, e?.name,
        (typeof e==="string") ? e : "",
      ].filter(Boolean).join(" ").toLowerCase();
      if(!testo) testo = JSON.stringify(e||"").toLowerCase();
    }catch(_e){
      testo = String(e?.message||e||"").toLowerCase();
    }
    return testo.includes("failed to fetch") || testo.includes("networkerror") || testo.includes("network request failed")
      || testo.includes("fetch failed") || testo.includes("network") || testo.includes("timeout")
      || testo.includes("connection") || testo.includes("name_not_resolved") || testo.includes("internet_disconnected")
      || testo.includes("err_internet") || testo.includes("err_network") || testo.includes("err_connection")
      || e?.name==="TypeError" || e?.name==="AuthRetryableFetchError";
  }
  async function verificaScrittura(tipo, table, payloadCorrente, matchObj){
    try{
      if(tipo==="delete"){
        const { data, error } = await supabase.from(table).select("id").match(matchObj).limit(1);
        if(error) return { verificata:false, direte:eRoreDiRete(error), motivo:`Verifica cancellazione fallita: ${error.message}` };
        if(data && data.length>0) return { verificata:false, motivo:"La riga risulta ancora presente su Supabase dopo la cancellazione." };
        return { verificata:true };
      }
      // insert/update: individua la riga scritta. Per insert uso l'id del
      // payload se presente (generato in locale), altrimenti matchObj.
      const filtro = (tipo==="insert" && payloadCorrente?.id)
        ? { id: payloadCorrente.id }
        : (matchObj || (payloadCorrente?.id ? { id: payloadCorrente.id } : null));
      if(!filtro) return { verificata:true }; // niente su cui confrontare: non blocchiamo per questo
      const { data, error } = await supabase.from(table).select("*").match(filtro).maybeSingle();
      if(error) return { verificata:false, direte:eRoreDiRete(error), motivo:`Verifica lettura fallita: ${error.message}` };
      if(!data) return { verificata:false, motivo:"La riga non risulta presente su Supabase dopo il salvataggio." };
      const campiDiversi = [];
      // Stringify "stabile": per oggetti/array (come griglia, un JSONB),
      // Postgres può restituire le chiavi in un ordine diverso da quello
      // con cui sono state scritte — non è un dato diverso, solo riordinato.
      // JSON.stringify normale è sensibile all'ordine delle chiavi e
      // genererebbe un falso "Dati diversi" anche a contenuto identico.
      function stringifyStabile(v){
        if(v===null || typeof v!=="object") return JSON.stringify(v);
        if(Array.isArray(v)) return `[${v.map(stringifyStabile).join(",")}]`;
        const chiavi = Object.keys(v).sort();
        return `{${chiavi.map(k=>JSON.stringify(k)+":"+stringifyStabile(v[k])).join(",")}}`;
      }
      for(const k of Object.keys(payloadCorrente||{})){
        if(k==="id") continue;
        const inviato = payloadCorrente[k];
        const letto = data[k];
        // Confronto tollerante: null/undefined/"" sono equivalenti (Supabase
        // e il payload locale a volte differiscono solo su questo).
        const norm = v => (v===undefined||v===null) ? "" : v;
        if(stringifyStabile(norm(inviato))!==stringifyStabile(norm(letto))) campiDiversi.push(k);
      }
      if(campiDiversi.length>0) return { verificata:false, motivo:`Dati diversi da quelli inviati su Supabase per: ${campiDiversi.join(", ")}` };
      return { verificata:true };
    }catch(e){
      // eccezione lanciata (non un {error} nella risposta): quasi sempre
      // un TypeError: Failed to fetch per rete caduta a metà della verifica.
      return { verificata:false, direte:eRoreDiRete(e), motivo:`Eccezione durante la verifica: ${e?.message||e}` };
    }
  }

  async function scriviConBackup({ tipo, table, payload, matchObj, contesto, ts, eventsPerSheets, calendarsPerSheets, modelliPerSheets, opzioni={} }){
    function accodaSilenziosamente(){
      // Locale è già scritto dal chiamante prima di arrivare qui: qui si
      // accoda solo il backup remoto, senza disturbare l'utente. Nessun
      // popup, nemmeno un banner — è lo stato normale "sto aspettando
      // che torni la linea", non un errore da segnalare.
      const coda = leggiCodaSync();
      coda.push({ id: generaIdLocale(), ts: ts||new Date().toISOString(), tipo, table, payload, match: matchObj, contesto });
      scriviCodaSync(coda);
      return { ok:true, accodato:true, errore:null };
    }
    // ─── Se il browser segnala che non c'è connessione, non si tenta
    // nemmeno la scrittura: si accoda direttamente. Provare e fallire non
    // aggiunge informazione, aggiunge solo un giro a vuoto e rischio di
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
          return accodaSilenziosamente();
        }
        // soloLog: il locale è comunque già scritto dal chiamante prima di
        // arrivare qui, quindi un modale bloccante per un errore di solo
        // backup remoto non aggiunge nulla — resta nel log tecnico e basta.
        // Il chiamante che ha bisogno di un riepilogo (es. più scritture
        // della stessa azione utente) lo mostra lui stesso, una volta sola.
        if(opzioni.soloLog) segnalaErroreSoloLog(risSupabase.error, `${contesto} (backup su Supabase)`);
        else segnalaErroreDb(risSupabase.error, `${contesto} (backup su Supabase)`);
        return { ok:false, errore: risSupabase.error };
      }
      // ─── DOPPIO CONTROLLO: Supabase non ha segnalato errori, ma
      // rileggiamo comunque per essere sicuri che il dato sia davvero lì
      // (o davvero sparito, per i delete) prima di considerare l'operazione
      // riuscita per davvero. Questo intercetta anche i casi in cui
      // Supabase risponde "ok" senza aver realmente applicato la scrittura
      // (RLS silenziosa, rete instabile con risposta falsata, ecc).
      const verifica = await verificaScrittura(tipo, table, risSupabase.payloadUsato ?? payload, matchObj);
      if(!verifica.verificata){
        // La scrittura sopra (provaSupabase) è già andata a buon fine senza
        // errori: Supabase ha confermato di aver scritto/cancellato la riga.
        // Se il RICONTROLLO fallisce solo per rete instabile, non significa
        // che il dato sia andato perso — è solo il secondo fetch che non è
        // arrivato a destinazione. Non blocchiamo l'utente per questo: lo
        // segnaliamo nel solo log tecnico e consideriamo l'operazione riuscita.
        if(verifica.direte || opzioni.soloLog){
          segnalaErroreSoloLog(`Verifica post-salvataggio non confermata (il salvataggio stesso è andato a buon fine su Supabase). Dettaglio: ${verifica.motivo}`, `${contesto} (verifica saltata)`);
          return { ok:true, verificaSaltata:true, errore:null };
        }
        const erroreVerifica = { message: verifica.motivo };
        segnalaErroreDb(erroreVerifica, `${contesto} (controllo dopo il salvataggio)`);
        return { ok:false, errore: erroreVerifica };
      }
      return { ok:true, errore:null };
    }catch(e){
      // Eccezione di rete (offline, DNS non risolto, timeout...): l'intera
      // operazione (con il suo timestamp originale) resta in coda, riparte
      // identica al ritorno online. Nessun popup: è lo stato normale
      // "sto aspettando che torni la linea", non un errore dell'utente.
      return accodaSilenziosamente();
    }
  }
  // Normalizza un campo testo in maiuscolo, gestendo null/undefined.
  // Usata al posto di ripetere ovunque (campo||"").toUpperCase().
  const up = (v) => (v||"").toUpperCase();

  // Crea un evento su Supabase con i 13 campi standard della tabella
  // "events" e ne restituisce { data, error }, senza toccare lo stato
  // locale (quello resta a carico del chiamante, che sa già come
  // aggiornare la UI nel proprio contesto specifico).
  // Accorpa in un solo punto i 3 inserimenti quasi identici che
  // c'erano prima sparsi nel file (salvataggio da form, inserimento
  // rapido da modello, inserimento generico da rotazione).
  async function creaEventoSupabase({
    userId, calId, dateKey, label, color,
    allDay, tIn="", tOut="", place="", mapUrl="", note="",
    modelloId=null, rotazioneId=null, collega="", auto="",
    protPagFine=null, protRecFine=null, importId=null,
  }){
    return await supabase.from("events").insert({
      user_id: userId, calendar_id: calId, date_key: dateKey,
      label, color, all_day: allDay,
      time_in: tIn, time_out: tOut,
      place: up(place), map_url: mapUrl, note: up(note),
      modello_id: modelloId, rotazione_id: rotazioneId,
      collega: up(collega), auto: up(auto),
      prot_pag_fine: protPagFine, prot_rec_fine: protRecFine,
      import_id: importId,
    }).select().maybeSingle();
  }
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [sheetsSecret, setSheetsSecret] = useState("");
  const [stats, setStats] = useState(null);
  const [showDbModal, setShowDbModal] = useState(false);
  const [ripristinoInCorso, setRipristinoInCorso] = useState(false);
  const [ripristinoEsito, setRipristinoEsito] = useState(null);
  const [showModelloEditor, setShowModelloEditor] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [banner, setBanner] = useState(null);
  const [syncMode, setSyncMode] = useState(()=>localStorage.getItem('syncMode')||'on');
  const [dbRawData, setDbRawData] = useState(null);
  const [dbCalsCount, setDbCalsCount] = useState(0);
  const [dbEvtsCount, setDbEvtsCount] = useState(0);

  const [modelliTab, setModelliTab] = useState("turni");
  const [modelli, setModelliRaw] = useState([]);
  // GUARDIA GLOBALE: qualunque punto dell'app chiami setModelli (array diretto
  // o funzione prev=>...), il risultato viene SEMPRE ripulito da eventuali
  // elementi null/undefined prima di entrare in stato. Questo impedisce che
  // un singolo punto dimenticato (find() senza match, map() malformato, dato
  // corrotto da cache/DB) faccia crashare l'intera app al primo render che
  // legge m.qualcosaDiUnDefined su un elemento del genere.
  function setModelli(valoreONuovoValore){
    setModelliRaw(prev=>{
      const nuovo = typeof valoreONuovoValore==="function" ? valoreONuovoValore(prev) : valoreONuovoValore;
      const puliti = (nuovo||[]).filter(Boolean);
      if(puliti.length !== (nuovo||[]).length){
        segnalaErrore(
          { message: `setModelli ha ricevuto ${(nuovo||[]).length - puliti.length} elementi null/undefined: rimossi automaticamente.` },
          "Dati modelli corrotti (auto-riparazione in setModelli)"
        );
      }
      return puliti;
    });
  }
  // Ref sincrono per leggere l'ultimo valore di modelli dentro callback
  // async (es. subito dopo un saveModello, prima che il re-render abbia
  // aggiornato la closure di questa funzione).
  const modelliRef = useRef([]);
  useEffect(()=>{ modelliRef.current = modelli; }, [modelli]);
  const [modelliSort, setModelliSort] = useState("orario");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);
  // Da dove è stato aperto il form "Nuovo/Modifica modello": determina dove
  // tornare dopo il salvataggio (lista Modelli, o il picker "Scegli modello"
  // se si stava scegliendo un modello per un evento). Senza questo, il
  // salvataggio riportava sempre al picker anche partendo dalla lista.
  const [origineModelForm, setOrigineModelForm] = useState("lista");
  const [editModello, setEditModello] = useState(null);
  const [modelForm, setModelForm] = useState({ titolo:"", tempo:"personalizzato", inizio:"", fine:"", coloreCustom:null, posizione:"" });

  // ── Snapshot manuale dell'ordine dei modelli (sortOrder), per proteggersi
  // da un bug ancora non individuato che a volte rimescola spontaneamente le
  // posizioni. Il salvataggio NON avviene mai in automatico: solo quando la
  // persona preme esplicitamente "Salva disposizione" (o conferma il popup
  // sotto), per non rischiare di congelare uno stato già corrotto dal bug.
  // Il timer riparte ad ogni modifica (sposta/aggiungi/elimina un modello) e,
  // se passano 30s senza un salvataggio manuale, chiede conferma con un
  // popup. Il flag "modifiche non salvate" e l'istante dell'ultima modifica
  // sono persistiti su localStorage (non solo stato React) così l'avviso
  // sopravvive alla chiusura dell'app: se lo schermo si spegne o l'app viene
  // chiusa con il timer ancora pendente, alla riapertura il popup deve
  // comunque presentarsi.
  const [showSalvaDisposizionePopup, setShowSalvaDisposizionePopup] = useState(false);
  const timerSalvaDisposizioneRef = useRef(null);
  const ULTIMA_MODIFICA_MODELLI_KEY = "ultimaModificaModelliOrdine";

  // ── Colori: popup assegnazione modelli + palette colori extra creati dall'utente
  const [showColorAssignPicker, setShowColorAssignPicker] = useState(null); // colore hex attualmente aperto nel popup
  const [colorAssignCalFiltro, setColorAssignCalFiltro] = useState(null); // calendari selezionati per filtrare la lista modelli nel popup colore (null = tutti)
  const [showAddColorPicker, setShowAddColorPicker] = useState(false); // popup "+" per aggiungere un colore alla sezione
  const [coloriExtra, setColoriExtra] = useState([]); // colori aggiunti manualmente o generati da modelli: array di {hex, label}
  // ── Autocomplete: 5 liste dedicate, sincronizzate su Supabase (tabella
  // autocomplete_valori), una per campo. Caricate una volta all'avvio;
  // l'autocomplete legge SOLO da qui, mai scansionando eventi/modelli —
  // niente rumore da valori sporadici, sempre veloce indipendentemente da
  // quanti eventi/modelli esistono.
  const [autocompleteValori, setAutocompleteValori] = useState({
    titolo:[], nome_visualizzato:[], auto:[], luogo:[], collega:[],
  });
  const [showEditFasciaColor, setShowEditFasciaColor] = useState(null); // key della fascia automatica di cui si sta editando il colore

  const [rotazioni, setRotazioniRaw] = useState([]);
  // Stessa guardia globale applicata a setModelli: nessun elemento
  // null/undefined può entrare nello stato rotazioni, qualunque sia la
  // fonte (cache, DB, aggiornamento locale).
  function setRotazioni(valoreONuovoValore){
    setRotazioniRaw(prev=>{
      const nuovo = typeof valoreONuovoValore==="function" ? valoreONuovoValore(prev) : valoreONuovoValore;
      const puliti = (nuovo||[]).filter(Boolean);
      if(puliti.length !== (nuovo||[]).length){
        segnalaErrore(
          { message: `setRotazioni ha ricevuto ${(nuovo||[]).length - puliti.length} elementi null/undefined: rimossi automaticamente.` },
          "Dati rotazioni corrotti (auto-riparazione in setRotazioni)"
        );
      }
      return puliti;
    });
  }
  const [showRotForm, setShowRotForm] = useState(false);
  const [editRotazione, setEditRotazione] = useState(null);
  const [rotForm, setRotForm] = useState({ tipo:"personalizzata", titolo:"", dataInizio:"", nSettimane:52, modellaLavoroId:null, modelloNLId:null, modelloRSId:null, modelloG3Id:null, modelloG4Id:null });
  const [showRotDetail, setShowRotDetail] = useState(null);
  const [showApplyRotDialog, setShowApplyRotDialog] = useState(null);
  const [showDeleteRotEvtDialog, setShowDeleteRotEvtDialog] = useState(null);
  const [showImportaFotoDialog, setShowImportaFotoDialog] = useState(false);
  const [showImportaTurniJsonDialog, setShowImportaTurniJsonDialog] = useState(false);
  const [showModelloPicker, setShowModelloPicker] = useState(false);
  const [quickModeModello, setQuickModeModello] = useState(null);
  const [showRotazionePicker, setShowRotazionePicker] = useState(false);
  const dragSrcId = useRef(null);
  const dragTargetId = useRef(null); // target reale del drag col mouse, calcolato con elementFromPoint (non l'id della card che riceve l'evento onDrop, inaffidabile su liste lunghe)
  const touchSrcId = useRef(null);
  const touchTargetId = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const [prevGrid, setPrevGrid] = useState(null);

  // ── Drag & drop modelli: scroll container + autoscroll a velocità variabile + preview ordine live
  const modelliScrollRef = useRef(null);
  const autoScrollRAF = useRef(null);
  const autoScrollSpeed = useRef(0);
  const [dragOverId, setDragOverId] = useState(null); // id della card su cui si sta trascinando ora (per preview)
  const [draggingId, setDraggingId] = useState(null); // id della card attualmente trascinata
  // Su telefono, touchstart/touchmove sulla card altrimenti intercettano SEMPRE
  // il dito per il drag, impedendo lo scroll verticale normale della lista.
  // Questo toggle esplicito distingue i due gesti: OFF (default) = il dito
  // scorre la pagina come sempre; ON = il tocco sulle card trascina per riordinare.
  const [modalitaSpostamento, setModalitaSpostamento] = useState(false);

  // Autoscroll della lista modelli durante il trascinamento: quando il dito
  // (o il cursore) si avvicina al bordo superiore o inferiore del contenitore
  // scrollabile, la lista scorre automaticamente, a velocità proporzionale
  // alla vicinanza al bordo. clientY è la coordinata verticale del dito/mouse
  // nella viewport (non relativa al contenitore).
  function updateAutoScroll(clientY){
    const container = modelliScrollRef.current;
    if(!container) return;
    const rect = container.getBoundingClientRect();
    const ZONA = 60; // px dal bordo entro cui parte l'autoscroll
    const VELOCITA_MAX = 14; // px per frame, alla massima vicinanza al bordo
    let velocita = 0;
    if(clientY < rect.top + ZONA){
      const distanza = Math.max(0, clientY - rect.top);
      velocita = -VELOCITA_MAX * (1 - distanza/ZONA);
    } else if(clientY > rect.bottom - ZONA){
      const distanza = Math.max(0, rect.bottom - clientY);
      velocita = VELOCITA_MAX * (1 - distanza/ZONA);
    }
    autoScrollSpeed.current = velocita;
    if(velocita!==0 && !autoScrollRAF.current){
      const step = ()=>{
        const c = modelliScrollRef.current;
        if(!c || autoScrollSpeed.current===0){ autoScrollRAF.current=null; return; }
        c.scrollTop += autoScrollSpeed.current;
        autoScrollRAF.current = requestAnimationFrame(step);
      };
      autoScrollRAF.current = requestAnimationFrame(step);
    }
  }
  function stopAutoScroll(){
    autoScrollSpeed.current = 0;
    if(autoScrollRAF.current){ cancelAnimationFrame(autoScrollRAF.current); autoScrollRAF.current=null; }
  }

  const [reportInterval, setReportInterval] = useState(()=>{
    try{
      const salvato = localStorage.getItem('reportInterval');
      if(salvato==="mese"||salvato==="anno"||salvato==="custom") return salvato;
    }catch(e){}
    return "mese";
  });
  function setReportIntervalPersistito(v){
    setReportInterval(v);
    try{ localStorage.setItem('reportInterval', v); }catch(e){}
  }
  // Mese selezionato per il report (persistente su localStorage, come
  // syncMode sopra): prima "1 mese" usava sempre new Date(), quindi il
  // report mostrava sempre il mese corrente e "dimenticava" la scelta ad
  // ogni uscita dall'app. Ora resta fissato al mese scelto finché l'utente
  // non lo cambia di nuovo, indipendentemente da quando riapre l'app.
  const [reportMeseSel, setReportMeseSel] = useState(()=>{
    try{
      const salvato = localStorage.getItem('reportMeseSel');
      if(salvato){ const [y,m]=salvato.split("-").map(Number); if(y&&m) return {anno:y,mese:m}; }
    }catch(e){}
    const now = new Date();
    return { anno: now.getFullYear(), mese: now.getMonth()+1 }; // mese 1-12
  });
  function selezionaReportMese(anno, mese){
    setReportMeseSel({anno, mese});
    try{ localStorage.setItem('reportMeseSel', `${anno}-${mese}`); }catch(e){}
  }
  const [showMeseReportPicker, setShowMeseReportPicker] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState(()=>{
    try{ return localStorage.getItem('reportDateFrom')||""; }catch(e){ return ""; }
  });
  const [reportDateTo, setReportDateTo] = useState(()=>{
    try{ return localStorage.getItem('reportDateTo')||""; }catch(e){ return ""; }
  });
  function setReportDateFromPersistito(v){
    setReportDateFrom(v);
    try{ localStorage.setItem('reportDateFrom', v||""); }catch(e){}
  }
  function setReportDateToPersistito(v){
    setReportDateTo(v);
    try{ localStorage.setItem('reportDateTo', v||""); }catch(e){}
  }
  // Intervalli personalizzati memorizzati: {id,from,to} salvati dall'utente
  // per riselezionare con un tap un periodo ricorrente, invece di reimpostare
  // le due date da capo ogni volta (selezione più veloce).
  const [intervalliSalvati, setIntervalliSalvati] = useState(()=>{
    try{
      const salvato = JSON.parse(localStorage.getItem('intervalliSalvati')||"[]");
      return Array.isArray(salvato) ? salvato : [];
    }catch(e){ return []; }
  });
  function persistIntervalliSalvati(lista){
    setIntervalliSalvati(lista);
    try{ localStorage.setItem('intervalliSalvati', JSON.stringify(lista)); }catch(e){}
  }
  function salvaIntervalloCorrente(){
    if(!reportDateFrom||!reportDateTo) return;
    const esiste = intervalliSalvati.some(iv=>iv.from===reportDateFrom&&iv.to===reportDateTo);
    if(esiste) return;
    persistIntervalliSalvati([...intervalliSalvati, {id:uid(), from:reportDateFrom, to:reportDateTo}]);
  }
  function applicaIntervalloSalvato(iv){
    setReportDateFromPersistito(iv.from);
    setReportDateToPersistito(iv.to);
  }
  function rimuoviIntervalloSalvato(id){
    persistIntervalliSalvati(intervalliSalvati.filter(iv=>iv.id!==id));
  }
  const [openReportConfig, setOpenReportConfig] = useState(null);
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  const [indennita, setIndennita] = useState({ diurno:"", notturno:"", festivo:"", notturno_festivo:"" });
  const [valoreTicket, setValoreTicket] = useState("");
  const [conteggioConfigs, setConteggioConfigs] = useState({});

  // ── PERSISTENZA LOCALE AUTOMATICA per i dati che prima vivevano SOLO in
  // RAM (arrivavano unicamente da Supabase ad ogni avvio, mai scritti su
  // localStorage): rotazioni, coloriExtra, autocompleteValori, indennita,
  // valoreTicket, conteggioConfigs. Con questo useEffect, OGNI cambiamento
  // a questi 6 stati — da qualunque punto dell'app, presente o futuro —
  // viene scritto in automatico su localStorage (turnipm_cache_v1), senza
  // bisogno di aggiungere una chiamata manuale in ogni singolo
  // setRotazioni/setColoriExtra/setAutocompleteValori/ecc. sparso nel
  // codice: qualunque nuovo punto che li modifichi in futuro è coperto
  // automaticamente. Questo chiude il buco per cui, senza connessione dopo
  // il primo render, un riavvio dell'app faceva ripartire questi dati da
  // vuoto anche se l'utente li aveva già impostati: ora restano
  // disponibili offline esattamente come eventi/calendari/modelli.
  // Il ref sotto salta solo il primissimo giro (i valori iniziali vuoti
  // degli useState), per non sovrascrivere subito la cache buona già
  // presente su disco con dati ancora vuoti prima che il caricamento
  // iniziale (da Supabase, o dalla cache stessa se offline) sia arrivato.
  const primoRenderDatiSessioneFatto = useRef(false);
  useEffect(()=>{
    if(!primoRenderDatiSessioneFatto.current){
      primoRenderDatiSessioneFatto.current = true;
      return;
    }
    saveDatiSessioneLocale({ rotazioni, coloriExtra, autocompleteValori, indennita, valoreTicket, conteggioConfigs });
  }, [rotazioni, coloriExtra, autocompleteValori, indennita, valoreTicket, conteggioConfigs]);

  const [showReportModelliPicker, setShowReportModelliPicker] = useState(null); // reportId aperto
  const [editFascia, setEditFascia] = useState(null); // key fascia in editing (nome/orario)
  const [showFasciaColorPicker, setShowFasciaColorPicker] = useState(null); // key fascia per cambio colore rapido

  const userId = session?.user?.id;
  const isInitialized = useRef(false);

  useEffect(()=>{
// #endregion

// #region SEZIONE 7: USEEFFECT INIT + LOAD DA SUPABASE
// ═══════════════════════════════════════════════════════════════
    if(!userId) return;
    (async()=>{
      try {
        // Mostra subito i dati da localStorage, incluse le impostazioni
        // visive (colori, tema, fasce): senza queste, il calendario partiva
        // con i colori di default e "scattava" al colore vero dopo che
        // Supabase rispondeva — il flash visibile ad ogni apertura dell'app.
        const cached = loadFromLocalStorage();
        if(cached && cached.calendars.length > 0){
          // Le impostazioni (tema, colori, fasce, festività attive...) NON
          // sono salvate sotto una chiave "impostazioni": saveToLocalStorage
          // le scrive direttamente nella radice del payload (vedi "extra" in
          // 04-Rotazione.jsx). Leggere da cached.impostazioni (che non esiste
          // mai) le faceva ignorare qui, quindi al primo render si vedevano
          // sempre i default (es. festività di default) finché Supabase non
          // rispondeva e sovrascriveva tutto — il flash che volevamo evitare.
          setStore(s=>({...s, calendars:cached.calendars, events:cached.events,
            theme: cached.theme ?? s.theme,
            extraHols: cached.extraHols ?? s.extraHols,
            reports: cached.reports ?? s.reports,
            reportSettings: cached.reportSettings ?? s.reportSettings,
            fasceAutomatiche: cached.fasceAutomatiche ?? s.fasceAutomatiche,
            sundayColor: cached.sundayColor ?? s.sundayColor,
            holidayColor: cached.holidayColor ?? s.holidayColor,
            nationalHolsEnabled: cached.nationalHolsEnabled ?? s.nationalHolsEnabled,
            calEventRows: cached.calEventRows ?? s.calEventRows,
            calRow1Field: cached.calRow1Field ?? s.calRow1Field,
            calRow2Field: cached.calRow2Field ?? s.calRow2Field,
          }));
          setModelli((cached.modelli||[]).filter(Boolean));
          // Ripristino anche i 6 campi che prima vivevano solo in RAM
          // (rotazioni, colori extra, autocomplete, indennità, ticket,
          // conteggi): ora sono nella stessa cache locale (vedi
          // saveDatiSessioneLocale in 04-Rotazione.jsx), quindi l'app parte
          // con questi dati già pronti anche offline, invece di mostrarli
          // vuoti finché Supabase non risponde — o per sempre, se la linea
          // non torna. setRotazioni applica anche la guardia anti-null.
          if(cached.rotazioni !== undefined) setRotazioni(cached.rotazioni||[]);
          if(cached.coloriExtra !== undefined) setColoriExtra(cached.coloriExtra||[]);
          if(cached.autocompleteValori !== undefined) setAutocompleteValori(cached.autocompleteValori||{titolo:[],nome_visualizzato:[],auto:[],luogo:[],collega:[]});
          if(cached.indennita !== undefined) setIndennita(cached.indennita||{diurno:"",notturno:"",festivo:"",notturno_festivo:""});
          if(cached.valoreTicket !== undefined) setValoreTicket(cached.valoreTicket||"");
          if(cached.conteggioConfigs !== undefined) setConteggioConfigs(cached.conteggioConfigs||{});
          const calIdValido = cached.calId && cached.calendars.some(c=>c.id===cached.calId);
          setCalId(calIdValido ? cached.calId : (cached.calendars[0]?.id||null));
          setLoading(false);
        }
        const calIdDaCache = (cached?.calId && cached.calendars.some(c=>c.id===cached.calId))
          ? cached.calId
          : (cached?.calendars?.[0]?.id || null);

        // Una sola chiamata al database: la funzione get_user_data (creata su
        // Supabase) legge le 6 tabelle internamente e restituisce tutto insieme.
        // Se fallisce (rete instabile, timeout), NON ci si arrende subito:
        // prima si prova un piccolo numero di retry, perché un fallimento
        // silenzioso qui lasciava l'utente con la cache locale mostrata in
        // precedenza — che può essere vuota (es. subito dopo "svuota cache")
        // dando la falsa impressione che i modelli/dati siano stati persi,
        // quando in realtà sono ancora sul server e il problema era solo di
        // rete/caricamento.
        // Se non c'è proprio linea, non ha senso nemmeno provare la RPC:
        // sarebbero solo secondi di attesa a vuoto prima del fallimento.
        // Si resta sulla cache locale già mostrata sopra, senza alcun
        // banner: l'assenza di connessione non è un errore, è uno stato
        // normale di attesa — riparte da sola quando la linea torna
        // (vedi il retry periodico e l'evento 'online' più sotto nel file).
        if(typeof navigator!=="undefined" && navigator.onLine===false){
          setLoading(false);
          return;
        }
        let all, rpcErr;
        for(let tentativo=0; tentativo<3; tentativo++){
          const risultato = await supabase.rpc("get_user_data", { p_user_id: userId });
          all = risultato.data; rpcErr = risultato.error;
          if(!rpcErr) break;
          if(tentativo<2) await new Promise(r=>setTimeout(r, 800*(tentativo+1)));
        }
        if(rpcErr){
          // Errore di rete (linea caduta a metà dei retry, instabile): non
          // è un errore vero, resta sulla cache locale già mostrata, senza
          // banner. Riparte da sola al ritorno della connessione.
          if(eRoreDiRete(rpcErr)){
            setLoading(false);
            return;
          }
          // Errore vero (non di rete): avviso VISIBILE invece di lasciare
          // la UI silenziosamente con la cache (che potrebbe sembrare
          // "dati spariti" mentre sono solo non ancora ricaricati).
          setBanner("⚠️ Impossibile caricare i dati dal server. Controlla la connessione e riprova (i tuoi dati sono al sicuro, non sono stati toccati).");
          setTimeout(()=>setBanner(null), 8000);
          setLoading(false);
          return;
        }

        const cals = all?.calendars || [];
        const evts = all?.events || [];
        const settings = all?.user_settings || null;
        const modelliDb = all?.modelli || [];
        const coloriDb = all?.colori || [];
        const rotazioniDb = all?.rotazioni || [];

        // Ordino i calendari secondo sort_order (posizione scelta in Impostazioni con <-‘<-“),
        // così l'ordine con cui vengono mostrati gli eventi resta coerente anche dopo un refresh.
        // Come per i modelli poco sotto, la query non garantisce un ordine
        // stabile quando più calendari hanno lo stesso sort_order (inclusi
        // due o più con sort_order null): senza uno spareggio esplicito per
        // id, l'ordine relativo tra loro poteva cambiare da un caricamento
        // all'altro. Dato che ricalcolaPosizioniGlobali assegna a ogni
        // calendario un intero blocco di 1000 posizioni in base alla sua
        // posizione qui, un calendario che "scambiava posto" con un altro
        // tra due caricamenti si vedeva spostare TUTTI i propri modelli in
        // un blocco di sortOrder completamente diverso — la causa, mai
        // isolata prima, del sortOrder dei modelli che "impazzisce da solo".
        const calsOrdinati = [...cals].sort((a,b)=>{
          const sa = a.sort_order, sb = b.sort_order;
          if(sa==null && sb==null) return String(a.id).localeCompare(String(b.id));
          if(sa==null) return 1;
          if(sb==null) return -1;
          if(sa!==sb) return sa-sb;
          return String(a.id).localeCompare(String(b.id));
        });
        const calendars = calsOrdinati.map(c=>({
          id: c.id, name: c.name, color: c.color, isMain: c.is_main, shifts: c.shifts||[],
        }));
        const events = {};
        (evts||[]).forEach(e=>{
          if(!events[e.date_key]) events[e.date_key]={};
          if(!events[e.date_key][e.calendar_id]) events[e.date_key][e.calendar_id]=[];
          events[e.date_key][e.calendar_id].push({
            id: e.id, label: e.label, color: e.color, allDay: e.all_day,
            tIn: e.time_in||"", tOut: e.time_out||"", place: e.place||"",
            tInNote: e.time_in_note||"", tOutNote: e.time_out_note||"",
            map: e.map_url||"", note: e.note||"",
            modelloId: e.modello_id||null, rotazioneId: e.rotazione_id||null, collega: e.collega||null,
            auto: e.auto||"", parentId: e.parent_id||null,
            protPagFine: e.prot_pag_fine||"", protRecFine: e.prot_rec_fine||"",
            protMenoRecIn: e.prot_meno_rec_in||"", protMenoRecOut: e.prot_meno_rec_out||"",
            categoriaTurno: e.categoria_turno||"", categoriaAppAuto: e.categoria_app_auto||"",
            turnoVuoto: !!e.categoria_turno_vuoto, appAutoVuoto: !!e.categoria_app_auto_vuoto,
            reportOverrides: e.report_overrides||{},
            importId: e.import_id||null,
          });
        });

        const theme = settings?.theme||"auto";
        const extraHols = settings?.extra_hols||[];
        const sUrl = settings?.sheets_url || "";
        const sSec = settings?.sheets_secret || "";
        const savedReports = settings?.reports || [];
        const savedReportSettings = settings?.report_settings || {};
        const savedIndennita = settings?.indennita || { diurno:"", notturno:"", festivo:"", notturno_festivo:"" };
        const savedValoreTicket = settings?.valore_ticket || "";
        const savedConteggioConfigs = settings?.conteggio_configs || {};
        const savedFasce = settings?.fasce_automatiche || FASCE_AUTOMATICHE_DEFAULT;
        const savedSundayColor = settings?.sunday_color || "";
        const savedHolidayColor = settings?.holiday_color || "";
        const savedNationalHolsEnabled = settings?.national_hols_enabled || FESTIVITA_DEFAULT_ATTIVE;
        const savedCalEventRows = settings?.cal_event_rows || 1;
        const savedCalRow1Field = settings?.cal_row1_field || "titolo";
        const savedCalRow2Field = settings?.cal_row2_field || "---";

        const modelliMappati = (modelliDb||[]).map(m=>({
          id:m.id, titolo:m.titolo, label:m.label||"", tempo:m.tempo,
          inizio:m.inizio||"", fine:m.fine||"",
          colore:m.colore, coloreCustom:m.colore_custom||null,
          posizione:m.posizione||"", sortOrder:m.sort_order||0,
          calendarId:m.calendar_id||null,
          categoria:(m.categoria==="primo"||m.categoria==="secondo")?m.categoria:"",
          categoriaAppAuto:(m.categoria_app_auto==="app"||m.categoria_app_auto==="auto")?m.categoria_app_auto:((m.categoria==="app"||m.categoria==="auto")?m.categoria:""),
          turnoVuoto: !!m.categoria_turno_vuoto,
          appAutoVuoto: !!m.categoria_app_auto_vuoto,
        // La RPC get_user_data non garantisce l'ordine delle righe (nessun
        // ORDER BY lato server): senza un sort esplicito qui, l'ordine
        // visualizzato dipende dall'ordine fisico di Postgres, che può
        // cambiare dopo un update (es. dopo un drag&drop + refresh
        // ravvicinato) finché non si "ristabilizza" da solo. Ordiniamo
        // sempre per sortOrder (poi per id come spareggio stabile) così
        // il risultato è deterministico ad ogni caricamento.
        })).sort((a,b)=>{
          const sa = a.sortOrder, sb = b.sortOrder;
          if(sa!==sb) return sa-sb;
          return String(a.id).localeCompare(String(b.id));
        });

        const rotazioniMappate = (rotazioniDb||[]).map(r=>({
          id:r.id, tipo:r.tipo, titolo:r.titolo,
          dataInizio:r.data_inizio||"", nSettimane:r.n_settimane||52,
          modellaLavoroId:r.modello_lavoro_id||null,
          modelloNLId:r.modello_nl_id||null,
          modelloRSId:r.modello_rs_id||null,
          modelloG3Id:(r.griglia||{}).__modelloG3Id||null,
          modelloG4Id:(r.griglia||{}).__modelloG4Id||null,
          griglia:r.griglia||{},
          reperibilitaTurnoPartenza:(r.griglia||{}).__reperibilitaTurnoPartenza||"14-24",
          sortOrder:r.sort_order||0,
        // Stesso motivo dell'ordinamento dei modelli sopra: la RPC non
        // garantisce l'ordine delle righe, quindi ordiniamo qui in modo
        // esplicito e deterministico (sortOrder, poi id come spareggio).
        })).sort((a,b)=>{
          const sa = a.sortOrder, sb = b.sortOrder;
          if(sa!==sb) return sa-sb;
          return String(a.id).localeCompare(String(b.id));
        });

        // ─── GUARDIA ANTI-CANCELLAZIONE: prima di sovrascrivere TUTTO lo
        // store locale con quanto arrivato da Supabase, controlliamo che il
        // numero di eventi non sia crollato in modo sospetto rispetto a
        // quello che avevamo già in cache. Una risposta "valida" (nessun
        // errore RPC) ma con MOLTI MENO eventi di prima è quasi sempre un
        // sintomo di dati parziali (RLS, query troncata, sync a metà) e
        // NON deve mai risultare in una cancellazione silenziosa di ciò che
        // l'utente vede sul calendario. In quel caso: non si applica la
        // sovrascrittura, si segnala l'errore, e si tiene la cache buona.
        function contaEventiTotali(ev){
          let n=0;
          for(const dk of Object.keys(ev||{})) for(const cid of Object.keys(ev[dk]||{})) n += (ev[dk][cid]||[]).length;
          return n;
        }
        const nEventiNuovi = contaEventiTotali(events);
        const nEventiCache = contaEventiTotali(cached?.events);
        // Soglia: un calo superiore al 30% (e comunque di almeno 3 eventi,
        // per non far scattare l'allarme su differenze minime/normali tipo
        // un'eliminazione volontaria di un paio di turni) blocca l'applicazione.
        const caloSospetto = nEventiCache>=5 && nEventiNuovi < nEventiCache*0.7 && (nEventiCache-nEventiNuovi)>=3;

        if(caloSospetto){
          segnalaErrore(
            { message: `La sincronizzazione ha restituito ${nEventiNuovi} eventi contro i ${nEventiCache} già presenti in locale: per sicurezza NON è stata applicata, per evitare di cancellare turni per errore. I tuoi dati locali sono intatti. Riprova più tardi o controlla la connessione.` },
            "Sincronizzazione dati (calo eventi sospetto)"
          );
          setLoading(false);
          return;
        }

        // Applico TUTTO insieme, in un solo giro di render: niente più
        // calendario che appare prima e modelli/colori che arrivano dopo.
        const calendariUguali = cached && sameData(cached.calendars, calendars);
        const eventiUguali = cached && sameData(cached.events, events);
        const modelliUguali = cached && sameData(cached.modelli, modelliMappati);

        if(!(calendariUguali && eventiUguali)){
          setStore(s=>({ ...s, calendars, events, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings, fasceAutomatiche: savedFasce, sundayColor: savedSundayColor, holidayColor: savedHolidayColor, nationalHolsEnabled: savedNationalHolsEnabled, calEventRows: savedCalEventRows, calRow1Field: savedCalRow1Field, calRow2Field: savedCalRow2Field }));
        } else {
          setStore(s=>({ ...s, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings, fasceAutomatiche: savedFasce, sundayColor: savedSundayColor, holidayColor: savedHolidayColor, nationalHolsEnabled: savedNationalHolsEnabled, calEventRows: savedCalEventRows, calRow1Field: savedCalRow1Field, calRow2Field: savedCalRow2Field }));
        }
        // Aggiorno anche la cache delle impostazioni visive, così il
        // prossimo avvio dell'app parte già col colore giusto, senza flash.
        saveToLocalStorage(events, calendars, modelliMappati, calId, {
          theme, extraHols, sundayColor: savedSundayColor, holidayColor: savedHolidayColor,
          fasceAutomatiche: savedFasce, nationalHolsEnabled: savedNationalHolsEnabled,
          calEventRows: savedCalEventRows, calRow1Field: savedCalRow1Field, calRow2Field: savedCalRow2Field,
          reports: savedReports, reportSettings: savedReportSettings,
        });
        if(!modelliUguali){
          setModelli(modelliMappati);
        }
        setColoriExtra((coloriDb||[]).map(c=>({hex:c.hex, label:c.label||null, sortOrder:c.sort_order||0}))
          .sort((a,b)=>{
            const sa=a.sortOrder, sb=b.sortOrder;
            if(sa!==sb) return sa-sb;
            return String(a.hex).localeCompare(String(b.hex));
          }));
        setRotazioni(rotazioniMappate);
        setSheetsUrl(sUrl);
        setSheetsSecret(sSec);
        setIndennita(savedIndennita);
        setValoreTicket(savedValoreTicket);
        setConteggioConfigs(savedConteggioConfigs);

        // Autocomplete: tabella dedicata, non inclusa nella RPC get_user_data
        // (aggiunta successivamente), quindi caricata con una query separata.
        try {
          const { data: acRows, error: acErr } = await supabase.from("autocomplete_valori")
            .select("campo, valore").eq("user_id", userId).order("valore");
          if(acErr) segnalaErrore(acErr, "Caricamento valori autocomplete");
          const raggruppati = { titolo:[], nome_visualizzato:[], auto:[], luogo:[], collega:[] };
          (acRows||[]).forEach(r=>{ if(raggruppati[r.campo]) raggruppati[r.campo].push(r.valore); });
          setAutocompleteValori(raggruppati);
        } catch(acEx){ segnalaErrore(acEx, "Caricamento valori autocomplete"); }

        setCalId(prevCalId => {
          if(prevCalId && calendars.some(c=>c.id===prevCalId)) return prevCalId;
          const daCache = calIdDaCache && calendars.some(c=>c.id===calIdDaCache) ? calIdDaCache : null;
          return daCache || calendars[0]?.id || null;
        });
        saveToLocalStorage(events, calendars, modelliMappati, cached?.calId);
        isInitialized.current = true;
        setLoading(false);

        // ── Da qui in giù: sola manutenzione in background. Non serve per
        // mostrare il calendario, quindi non blocca né ridisegna la UI a meno
        // che trovi davvero qualcosa da correggere (casi rari).
        (async()=>{
          try {
            const { data: curStats } = await supabase.from("usage_stats").select("login_count").eq("user_id", userId).maybeSingle();
            const newCount = (curStats?.login_count || 0) + 1;
            await supabase.from("usage_stats").upsert({ user_id: userId, last_active: new Date().toISOString(), login_count: newCount });
          } catch(statErr) { segnalaErrore(statErr, "Aggiornamento statistiche di utilizzo"); }

          // Sincronizza i colori custom già presenti sui modelli con la tabella "colori"
          try {
            const coloriUsati = [...new Set((modelliDb||[]).map(m=>m.colore_custom).filter(Boolean))];
            const coloriGiaSalvati = new Set((coloriDb||[]).map(c=>c.hex));
            const daSalvare = coloriUsati.filter(hex=>!coloriGiaSalvati.has(hex));
            const nuoviColoriSalvati = [];
            for(const hex of daSalvare){
              const { data:cRes } = await supabase.from("colori").insert({ user_id:userId, hex }).select().maybeSingle();
              if(cRes) nuoviColoriSalvati.push(hex);
            }
            if(nuoviColoriSalvati.length > 0) {
              setColoriExtra(prev => {
                const aggiornato = [...prev];
                nuoviColoriSalvati.forEach(hex => { if(!aggiornato.some(c=>c.hex===hex)) aggiornato.push({hex, label:null, sortOrder:aggiornato.length}); });
                return aggiornato;
              });
            }
          } catch(e){ segnalaErrore(e, "Sincronizzazione colori modelli all'avvio"); }

          // Inizializza sortOrder per modelli H24 che hanno tutti 0
          try {
            // Fix "una tantum": normalizza i sort_order duplicati ALL'INTERNO
            // DI OGNI SINGOLO CALENDARIO. Con più modelli che condividono lo
            // stesso sort_order (es. mai assegnato correttamente in passato,
            // o residuo di versioni precedenti dell'app), l'ordinamento
            // diventa ambiguo: la posizione calcolata di un modello può non
            // corrispondere a quella reale, con l'effetto pratico di frecce
            // che sembrano disabilitate o spostamenti che non hanno effetto
            // visibile. Il fix raggruppa i modelli per calendario e, solo
            // dove trova sort_order ripetuti, li rinumera in modo univoco
            // preservando l'ordine relativo con cui sono arrivati dal DB.
            const perCalendario = new Map();
            for(const m of (modelliDb||[])){
              const cid = m.calendar_id || "null";
              if(!perCalendario.has(cid)) perCalendario.set(cid, []);
              perCalendario.get(cid).push(m);
            }
            const daCorreggere = [];
            for(const [, gruppo] of perCalendario){
              const valori = gruppo.map(m=>m.sort_order||0);
              const haDuplicati = new Set(valori).size !== valori.length;
              if(haDuplicati){
                const ordinatoPerArrivo = [...gruppo].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
                ordinatoPerArrivo.forEach((m,i)=>{
                  const nuovoVal = i*10;
                  if(nuovoVal!==(m.sort_order||0)) daCorreggere.push({id:m.id, nuovoVal});
                });
              }
            }
            if(daCorreggere.length>0){
              await Promise.all(daCorreggere.map(({id,nuovoVal}) =>
                supabase.from("modelli").update({sort_order:nuovoVal}).eq("id",id).eq("user_id",userId)
              ));
              const {data:modelliDb2}=await supabase.from("modelli").select("*").eq("user_id",userId).order("sort_order").order("id");
              setModelli((modelliDb2||[]).map(m=>({
                id:m.id,titolo:m.titolo,label:m.label||"",tempo:m.tempo,
                inizio:m.inizio||"",fine:m.fine||"",
                colore:m.colore,coloreCustom:m.colore_custom||null,
                posizione:m.posizione||"",sortOrder:m.sort_order||0,
              })));
            }
          } catch(e){ segnalaErrore(e, "Correzione automatica ordine modelli all'avvio"); }

          // Fix "una tantum": unifica SOLO modelli realmente duplicati —
          // cioè identici in ogni campo rilevante (titolo, nome mostrato,
          // tipo tempo, e se non h24 anche inizio/fine). NON unifica più per
          // "somiglianza" del titolo (es. contiene "PROTRAZIONE" +
          // "RECUPERO"): quel criterio unificava per errore modelli
          // DIVERSI creati apposta con nomi simili (es. "PROTRAZIONE
          // RECUPERO" e "- PROTRAZIONE A RECUPERO" sono due modelli
          // distinti, non un refuso dello stesso), cancellando quello più
          // recente ad ogni avvio. Ora due modelli sono considerati
          // doppioni ESCLUSIVAMENTE se coincidono esattamente su tutti i
          // campi che li definiscono: una virgola, uno spazio o un minuto
          // di differenza bastano a considerarli modelli diversi e a non
          // toccarli.
          try {
            function normEsatta(t){
              return (t||"").trim().toUpperCase().replace(/\s+/g," ");
            }
            function chiaveDuplicato(m){
              const tempo = m.tempo||"";
              // Per h24 l'orario non ha senso/non è significativo: due h24
              // con stesso titolo/label sono duplicati a prescindere da
              // inizio/fine (che dovrebbero comunque essere vuoti).
              const inizio = tempo==="h24" ? "" : normEsatta(m.inizio);
              const fine = tempo==="h24" ? "" : normEsatta(m.fine);
              return [
                normEsatta(m.titolo),
                normEsatta(m.label),
                normEsatta(tempo),
                inizio,
                fine,
              ].join("\u0001");
            }
            const perCalendarioModelli = new Map();
            for(const m of (modelliDb||[])){
              const cid = m.calendar_id || "null";
              if(!perCalendarioModelli.has(cid)) perCalendarioModelli.set(cid, []);
              perCalendarioModelli.get(cid).push(m);
            }
            const modelliDaRimappare = new Map(); // vecchioId -> nuovoId (superstite)
            const modelliIdDaEliminare = [];
            for(const [cid, gruppo] of perCalendarioModelli){
              const perChiave = new Map();
              for(const m of gruppo){
                const k = chiaveDuplicato(m);
                if(!perChiave.has(k)) perChiave.set(k, []);
                perChiave.get(k).push(m);
              }
              for(const candidati of perChiave.values()){
                // Nessun doppione reale (0 o 1 solo modello identico in
                // tutto per questa chiave): non c'è nulla da unificare.
                if(candidati.length<=1) continue;
                const ordinatiPerId = [...candidati].sort((a,b)=>(a.id>b.id?1:-1));
                const superstite = ordinatiPerId[0];
                for(let i=1;i<ordinatiPerId.length;i++){
                  modelliDaRimappare.set(ordinatiPerId[i].id, superstite.id);
                  modelliIdDaEliminare.push(ordinatiPerId[i].id);
                }
              }
            }
            if(modelliDaRimappare.size>0){
              // Sposta ogni evento agganciato a un modello doppione sul modello superstite.
              for(const [vecchioId, nuovoId] of modelliDaRimappare){
                await supabase.from("events").update({modello_id:nuovoId}).eq("modello_id",vecchioId).eq("user_id",userId);
              }
            }
            if(modelliIdDaEliminare.length>0){
              await supabase.from("modelli").delete().in("id", modelliIdDaEliminare).eq("user_id", userId);
            }
            if(modelliIdDaEliminare.length>0){
              // Ricarico i modelli aggiornati (doppioni rimossi) e aggiorno
              // anche gli eventi in memoria/localStorage che puntavano ai
              // modelli doppioni, così sparisce subito dalla UI.
              const {data:modelliDbAggiornati}=await supabase.from("modelli").select("*").eq("user_id",userId).order("sort_order").order("id");
              setModelli((modelliDbAggiornati||[]).map(m=>({
                id:m.id,titolo:m.titolo,label:m.label||"",tempo:m.tempo,
                inizio:m.inizio||"",fine:m.fine||"",
                colore:m.colore,coloreCustom:m.colore_custom||null,
                calendarId:m.calendar_id||null,
                posizione:m.posizione||"",sortOrder:m.sort_order||0,
              })));
              if(modelliDaRimappare.size>0){
                setStore(prev=>{
                  const ns = JSON.parse(JSON.stringify(prev));
                  for(const dKey of Object.keys(ns.events||{})){
                    for(const cid of Object.keys(ns.events[dKey]||{})){
                      ns.events[dKey][cid] = (ns.events[dKey][cid]||[]).map(e=>
                        modelliDaRimappare.has(e.modelloId) ? {...e, modelloId: modelliDaRimappare.get(e.modelloId)} : e
                      );
                    }
                  }
                  saveToLocalStorage(ns.events, ns.calendars, modelli);
                  return ns;
                });
              }
            }
          } catch(e){ segnalaErrore(e, "Unificazione automatica modelli protrazione all'avvio"); }

          // Fix "una tantum": assegna il nome breve (label) ai modelli
          // PROTRAZIONE storici che ne sono privi. Senza un nome breve, il
          // riquadro calendario (stretto, CSS ellipsis) mostra il titolo
          // completo troncato a metà parola (es. "PROTRAZIONE RECUPERO" ->
          // "PROTRA..."). Questo fix riguarda SOLO i tre modelli
          // PROTRAZIONE (pagamento/recupero/-recupero), riconosciuti dalla
          // stessa radice usata altrove nel progetto; nessun altro modello
          // viene toccato, e un modello PROTRAZIONE con un nome breve già
          // impostato dall'utente (anche diverso da quello di default) non
          // viene sovrascritto.
          try {
            function normRadiceProtrazioneFix(t){
              return (t||"").trim().toUpperCase().replace(/\s+/g,"");
            }
            const labelDaAssegnare = [];
            for(const m of (modelliDb||[])){
              if((m.label||"").trim()) continue; // ha già un nome breve: non tocco
              const titoloRaw = (m.titolo||"").trim();
              const eMenoRecupero = titoloRaw.startsWith("-");
              const n = normRadiceProtrazioneFix(titoloRaw);
              const haRadice = n.includes("PROTRAZIONE") || n.includes("PROTAZIONE");
              if(!haRadice) continue;
              let labelBreve = null;
              if(eMenoRecupero && n.includes("RECUPERO")) labelBreve = "-PR RECUPERO";
              else if(n.includes("RECUPERO")) labelBreve = "PR RECUPERO";
              else if(n.includes("PAGAMENTO")) labelBreve = "PR PAGAMENTO";
              if(labelBreve) labelDaAssegnare.push({ id:m.id, label:labelBreve });
            }
            if(labelDaAssegnare.length>0){
              await Promise.all(labelDaAssegnare.map(({id,label})=>
                supabase.from("modelli").update({label}).eq("id",id).eq("user_id",userId)
              ));
              const {data:modelliDbConLabel}=await supabase.from("modelli").select("*").eq("user_id",userId).order("sort_order").order("id");
              const labelPerId = new Map(labelDaAssegnare.map(x=>[x.id,x.label]));
              setModelli((modelliDbConLabel||[]).map(m=>({
                id:m.id,titolo:m.titolo,label:m.label||"",tempo:m.tempo,
                inizio:m.inizio||"",fine:m.fine||"",
                colore:m.colore,coloreCustom:m.colore_custom||null,
                calendarId:m.calendar_id||null,
                posizione:m.posizione||"",sortOrder:m.sort_order||0,
              })));
              // Aggiorno anche la label sugli eventi già creati da questi
              // modelli, così il calendario mostra subito il nome breve
              // senza dover riaprire/risalvare ogni evento singolarmente.
              setStore(prev=>{
                const ns = JSON.parse(JSON.stringify(prev));
                for(const dKey of Object.keys(ns.events||{})){
                  for(const cid of Object.keys(ns.events[dKey]||{})){
                    ns.events[dKey][cid] = (ns.events[dKey][cid]||[]).map(e=>
                      e.modelloId && labelPerId.has(e.modelloId)
                        ? {...e, label: labelPerId.get(e.modelloId)}
                        : e
                    );
                  }
                }
                saveToLocalStorage(ns.events, ns.calendars, modelli);
                return ns;
              });
            }
          } catch(e){ segnalaErrore(e, "Assegnazione nome breve automatico modelli protrazione all'avvio"); }

          // Fix "una tantum" (eseguito una sola volta per utente, mai più
          // dopo — vedi flag in localStorage sotto): i modelli PROTRAZIONE
          // PAGAMENTO/RECUPERO creati da versioni precedenti avevano
          // tempo:"personalizzato" con un orario fittizio (es. 09:00-09:00)
          // invece di "h24", e un colore non allineato a quello scelto
          // dall'utente per PAGAMENTO (rosa). Corregge SOLO tempo/inizio/
          // fine, mai il colore se l'utente ne ha già impostato uno
          // (colore_custom valorizzato): dopo la prima esecuzione il flag
          // impedisce di rieseguirlo, così eventuali scelte successive
          // dell'utente su questi modelli non vengono più toccate.
          try {
            const FLAG_KEY = "fix_protrazione_h24_v1";
            const giaEseguito = (()=>{ try{ return localStorage.getItem(FLAG_KEY)==="1"; }catch(e){ return false; } })();
            if(!giaEseguito){
              function tipoModelloProtrazioneRaw(titolo){
                const n = (titolo||"").trim().toUpperCase().replace(/\s+/g,"").replace(/^-+/,"");
                const haRadice = n.includes("PROTRAZIONE") || n.includes("PROTAZIONE");
                if(!haRadice) return null;
                if(n.includes("RECUPERO")) return "recupero";
                if(n.includes("PAGAMENTO")) return "pagamento";
                return null;
              }
              const daCorreggere = [];
              for(const m of (modelliDb||[])){
                const tipo = tipoModelloProtrazioneRaw(m.titolo);
                if(!tipo) continue;
                if(m.tempo==="h24") continue; // già corretto, non tocco nulla
                const payloadFix = { tempo:"h24", inizio:null, fine:null };
                if(!m.colore_custom){
                  // Solo se l'utente non ha MAI scelto un colore custom:
                  // imposto un rosa di default (più chiaro per recupero, più
                  // acceso per pagamento), coerente con quanto richiesto.
                  payloadFix.colore_custom = tipo==="recupero" ? "#f9a8d4" : "#ec4899";
                  payloadFix.colore = payloadFix.colore_custom;
                }
                daCorreggere.push({ id:m.id, payloadFix });
              }
              if(daCorreggere.length>0){
                await Promise.all(daCorreggere.map(({id,payloadFix})=>
                  supabase.from("modelli").update(payloadFix).eq("id",id).eq("user_id",userId)
                ));
                const {data:modelliDbAggiornati2}=await supabase.from("modelli").select("*").eq("user_id",userId).order("sort_order").order("id");
                setModelli((modelliDbAggiornati2||[]).map(m=>({
                  id:m.id,titolo:m.titolo,label:m.label||"",tempo:m.tempo,
                  inizio:m.inizio||"",fine:m.fine||"",
                  colore:m.colore,coloreCustom:m.colore_custom||null,
                  calendarId:m.calendar_id||null,
                  posizione:m.posizione||"",sortOrder:m.sort_order||0,
                })));
              }
              try{ localStorage.setItem(FLAG_KEY, "1"); }catch(e){}
            }
          } catch(e){ segnalaErrore(e, "Correzione automatica modelli protrazione (h24/colore) all'avvio"); }

          // Fix "una tantum": elimina eventi PROTRAZIONE duplicati residui
          // (stesso turno base + stesso tipo pagamento/recupero, marcati con
          // lo stesso import_id "protrazione_di_<idBase>_<tipo>"), retaggio
          // del vecchio bug che poteva crearne più di uno per lo stesso
          // turno. Tiene sempre il più recente (created_at più alto, o id
          // più alto in mancanza di quel campo) e cancella gli altri, sia
          // da Supabase che dallo stato locale, così spariscono subito dal
          // calendario e dalla vista giorno senza bisogno di refresh.
          try {
            const perMarker = new Map();
            for(const e of (evts||[])){
              const marker = e.import_id;
              if(!marker || !/^protrazione_di_.+_(pagamento|meno_recupero_entrata|meno_recupero_uscita|meno_recupero|recupero)$/.test(marker)) continue;
              if(!perMarker.has(marker)) perMarker.set(marker, []);
              perMarker.get(marker).push(e);
            }
            const idsDaEliminare = [];
            for(const [, righe] of perMarker){
              if(righe.length<=1) continue;
              const ordinate = [...righe].sort((a,b)=>{
                const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                if(ta!==tb) return tb-ta;
                return (b.id>a.id?1:-1);
              });
              for(let i=1;i<ordinate.length;i++) idsDaEliminare.push(ordinate[i].id);
