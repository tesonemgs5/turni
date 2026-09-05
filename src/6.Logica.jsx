    import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./11.supabase";
import {
  FASCE_AUTOMATICHE_DEFAULT, FESTIVITA_DEFAULT_ATTIVE, MONTHS, NOMI_GIORNI_IT, PALETTE,
  calcFine6h15, calcFine6h30, calcFineModello, categoriaAppAutoAutomatica, categoriaTurnoAutomatica,
  daysInMonth, dkey, generaIdLocale, getColorByTime, getColorLabel,
  getContrastTextColor, getShiftBand, isFestivo, isModelloTurnazioneDefault, italianHols,
  leggiCodaSync, leggiErroriSilenziati, leggiLogErrori, loadFromLocalStorage, minsOf,
  minutiTurnoModello, normalizzaOraHHMM, oraInMinuti, registraListenerCodaErrori, registraProblemiImport,
  sameData, saveToLocalStorage, scriviCodaSync, segnalaErrore, segnalaErroreSoloLog,
  uid, withEventoAggiornato, withEventoAggiunto, withEventoRimosso,
} from "./4.Rotazione";

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
  const [syncMsg,  setSyncMsg]  = useState("");
  const [backupsList, setBackupsList] = useState([]);
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [showLocalDataModal, setShowLocalDataModal] = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [nhD,     setNhD]     = useState("");
  const [nhM,     setNhM]     = useState("");
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
    const msg = (e?.message||String(e)||"").toLowerCase();
    return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed")
      || msg.includes("network") || msg.includes("timeout") || msg.includes("connection")
      || msg.includes("name_not_resolved") || msg.includes("internet_disconnected")
      || e?.name==="TypeError";
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
      for(const k of Object.keys(payloadCorrente||{})){
        if(k==="id") continue;
        const inviato = payloadCorrente[k];
        const letto = data[k];
        // Confronto tollerante: null/undefined/"" sono equivalenti (Supabase
        // e il payload locale a volte differiscono solo su questo).
        const norm = v => (v===undefined||v===null) ? "" : v;
        if(JSON.stringify(norm(inviato))!==JSON.stringify(norm(letto))) campiDiversi.push(k);
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
        if(verifica.direte){
          segnalaErroreSoloLog(`Rete instabile durante il controllo post-salvataggio (il salvataggio stesso è andato a buon fine su Supabase). Dettaglio: ${verifica.motivo}`, `${contesto} (verifica offline)`);
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
  const [modelli, setModelli] = useState([]);
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

  const [rotazioni, setRotazioni] = useState([]);
  const [showRotForm, setShowRotForm] = useState(false);
  const [editRotazione, setEditRotazione] = useState(null);
  const [rotForm, setRotForm] = useState({ tipo:"personalizzata", titolo:"", dataInizio:"", nSettimane:52, modellaLavoroId:null, modelloNLId:null, modelloRSId:null });
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
          setStore(s=>({...s, calendars:cached.calendars, events:cached.events, ...(cached.impostazioni||{})}));
          setModelli(cached.modelli||[]);
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
        const calsOrdinati = [...cals].sort((a,b)=>{
          const sa = a.sort_order, sb = b.sort_order;
          if(sa==null && sb==null) return 0;
          if(sa==null) return 1;
          if(sb==null) return -1;
          return sa-sb;
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
        }));

        const rotazioniMappate = (rotazioniDb||[]).map(r=>({
          id:r.id, tipo:r.tipo, titolo:r.titolo,
          dataInizio:r.data_inizio||"", nSettimane:r.n_settimane||52,
          modellaLavoroId:r.modello_lavoro_id||null,
          modelloNLId:r.modello_nl_id||null,
          modelloRSId:r.modello_rs_id||null,
          griglia:r.griglia||{},
        }));

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
        setColoriExtra((coloriDb||[]).map(c=>({hex:c.hex, label:c.label||null})));
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
                nuoviColoriSalvati.forEach(hex => { if(!aggiornato.some(c=>c.hex===hex)) aggiornato.push({hex, label:null}); });
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
              if(!marker || !/^protrazione_di_.+_(pagamento|meno_recupero|recupero)$/.test(marker)) continue;
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
            }
            if(idsDaEliminare.length>0){
              const { error: delDupErr } = await supabase.from("events").delete().in("id", idsDaEliminare).eq("user_id", userId);
              if(delDupErr){
                segnalaErroreSoloLog(delDupErr, "Pulizia automatica protrazioni duplicate");
              } else {
                const idSet = new Set(idsDaEliminare);
                setStore(prev=>{
                  const ns = JSON.parse(JSON.stringify(prev));
                  for(const dKey of Object.keys(ns.events||{})){
                    for(const cid of Object.keys(ns.events[dKey]||{})){
                      ns.events[dKey][cid] = (ns.events[dKey][cid]||[]).filter(e=>!idSet.has(e.id));
                    }
                  }
                  saveToLocalStorage(ns.events, ns.calendars, modelli);
                  return ns;
                });
              }
            }
          } catch(e){ segnalaErrore(e, "Pulizia automatica protrazioni duplicate all'avvio"); }

          // Fix "una tantum": elimina eventi PROTRAZIONE "orfani" residui —
          // cioè un evento agganciato al modello PROTRAZIONE PAGAMENTO o
          // PROTRAZIONE RECUPERO (per marker import_id, o per modello+orario
          // quando il marker manca) il cui turno base collegato ha però il
          // campo prot_pag_fine/prot_rec_fine corrispondente VUOTO: significa
          // che l'utente ha svuotato/cambiato quel campo ma il vecchio
          // evento protrazione non era mai stato ripulito di conseguenza
          // (retaggio di versioni precedenti). Esempio tipico: campo
          // "PROTRAZIONE A PAGAMENTO" vuoto su AUTO, ma esiste ancora un
          // evento "PROTRAZIONE PAGAMENTO" nel calendario per quel giorno.
          try {
            function tipoDaModelloId(modId){
              if(!modId) return null;
              const mod = (modelliDb||[]).find(m=>m.id===modId);
              if(!mod) return null;
              const titoloRaw = (mod.titolo||"").trim();
              const eMenoRecupero = titoloRaw.startsWith("-");
              const n = titoloRaw.toUpperCase().replace(/\s+/g,"").replace(/^-+/,"");
              const haRadice = n.includes("PROTRAZIONE") || n.includes("PROTAZIONE");
              if(!haRadice) return null;
              if(eMenoRecupero && n.includes("RECUPERO")) return "meno_recupero";
              if(n.includes("RECUPERO")) return "recupero";
              if(n.includes("PAGAMENTO")) return "pagamento";
              return null;
            }
            const idsOrfaniDaEliminare = [];
            for(const e of (evts||[])){
              const decodifica = decodificaProtrazioneFiglio(e.import_id);
              const tipo = decodifica ? decodifica.tipo : tipoDaModelloId(e.modello_id);
              if(!tipo) continue;
              // "meno_recupero" non ha un campo prot_*_fine dedicato sul
              // padre (due campi indipendenti entrata/uscita, mai scritti
              // su Supabase): la pulizia automatica orfani non si applica a
              // questo tipo, altrimenti cancellerebbe eventi validi.
              if(tipo==="meno_recupero") continue;
              // Trova il turno base: per marker, l'id esplicito; altrimenti
              // stesso giorno/calendario con tOut base = tIn di questa riga.
              let base = null;
              if(decodifica){
                base = (evts||[]).find(b=>b.id===decodifica.idEventoBase);
              } else {
                base = (evts||[]).find(b=>
                  b.id!==e.id && b.date_key===e.date_key && b.calendar_id===e.calendar_id &&
                  !decodificaProtrazioneFiglio(b.import_id) && !tipoDaModelloId(b.modello_id) &&
                  b.time_out && b.time_out===e.time_in
                );
              }
              // Nessun base trovato, oppure base trovato ma col campo
              // prot*Fine corrispondente vuoto: la protrazione è orfana.
              const campoAtteso = tipo==="pagamento" ? "prot_pag_fine" : "prot_rec_fine";
              const orfana = !base || !base[campoAtteso];
              if(orfana) idsOrfaniDaEliminare.push(e.id);
            }
            if(idsOrfaniDaEliminare.length>0){
              const { error: delOrfErr } = await supabase.from("events").delete().in("id", idsOrfaniDaEliminare).eq("user_id", userId);
              if(delOrfErr){
                segnalaErroreSoloLog(delOrfErr, "Pulizia automatica protrazioni orfane");
              } else {
                const idSet = new Set(idsOrfaniDaEliminare);
                setStore(prev=>{
                  const ns = JSON.parse(JSON.stringify(prev));
                  for(const dKey of Object.keys(ns.events||{})){
                    for(const cid of Object.keys(ns.events[dKey]||{})){
                      ns.events[dKey][cid] = (ns.events[dKey][cid]||[]).filter(e=>!idSet.has(e.id));
                    }
                  }
                  saveToLocalStorage(ns.events, ns.calendars, modelli);
                  return ns;
                });
              }
            }
          } catch(e){ segnalaErrore(e, "Pulizia automatica protrazioni orfane all'avvio"); }
        })();
      } catch(e){ segnalaErrore(e, "Avvio applicazione (caricamento dati iniziale)"); setLoading(false); }
    })();
  },[userId]);
// #endregion

// #region SEZIONE 8: USEEFFECT OVERSCROLL + ONLINE/OFFLINE
// ═══════════════════════════════════════════════════════════════
  // Svuota la coda di sincronizzazione offline: prova ogni operazione in
  // ordine (crea/modifica/elimina), la toglie dalla coda solo se riesce.
  // Se un'operazione fallisce di nuovo (rete ancora instabile, o un errore
  // reale stavolta), resta in coda per il prossimo tentativo — tranne se
  // l'errore non è di rete, nel qual caso viene comunque segnalata
  // all'utente (stesso comportamento di sempre per gli errori "veri").
  async function processaCodaSync(){
    const coda = leggiCodaSync();
    if(coda.length===0) return;
    // Se il browser segnala che non c'è connessione, non si tenta nemmeno
    // di svuotare la coda: nessuna richiesta parte, quindi nessun errore
    // in F12. Si riproverà al prossimo giro (evento 'online' o timer
    // periodico più sotto) — la linea assente non è un errore, è uno
    // stato normale di attesa.
    if(typeof navigator!=="undefined" && navigator.onLine===false) return;
    // Le operazioni più vecchie (ts più basso) vanno riprovate per prime:
    // se due dispositivi hanno modificato la stessa riga mentre uno era
    // offline, applicarle in ordine cronologico fa sì che l'ultima
    // scrittura (quella con ts più recente) sia quella che resta valida.
    const ordinata = [...coda].sort((a,b)=>(a.ts||"").localeCompare(b.ts||""));
    const rimasti = [];
    for(const op of ordinata){
      async function provaSupabase(payloadCorrente, tentativi=0){
        if(tentativi>=10) return { error:{message:"Troppi tentativi di retry sullo schema"} };
        let q;
        if(op.tipo==="insert") q = supabase.from(op.table).insert(payloadCorrente);
        else if(op.tipo==="update") q = supabase.from(op.table).update(payloadCorrente).match(op.match);
        else q = supabase.from(op.table).delete().match(op.match);
        const { error } = await q;
        if(!error) return { error:null };
        const m = /Could not find the '([^']+)' column/.exec(error.message||"");
        if(m && payloadCorrente && m[1] in payloadCorrente){
          segnalaErroreSoloLog(`Colonna '${m[1]}' assente su Supabase: omessa e riprovato automaticamente.`, `${op.contesto} (schema database)`);
          const { [m[1]]: _omessa, ...resto } = payloadCorrente;
          return provaSupabase(resto, tentativi+1);
        }
        return { error };
      }
      try{
        const res = await provaSupabase(op.payload);
        if(res.error){
          if(eRoreDiRete(res.error)){
            // Rete ballerina: la richiesta è arrivata ma è caduta a metà,
            // senza generare un'eccezione JS. Stesso trattamento del
            // ramo catch sotto: si riaccoda in silenzio, nessun popup.
            rimasti.push(op);
          } else {
            // Errore vero (validazione, permessi...): non ha senso
            // ritentarlo all'infinito, si segnala e si scarta.
            segnalaErrore(res.error, `Sincronizzazione in sospeso — ${op.contesto}`);
          }
        } else {
          rimasti.push(null); // marcato come completato, verrà filtrato sotto
        }
      } catch(e){
        // Eccezione di rete (offline di nuovo, timeout...): resta in coda,
        // si ritenterà al prossimo giro. Nessun popup — è lo stato normale
        // "sto ancora aspettando la connessione", per quanto duri.
        rimasti.push(op);
      }
    }
    scriviCodaSync(rimasti.filter(Boolean));
    // Backup su Sheets con l'istantanea corrente (dopo aver smaltito la
    // coda Supabase): un solo invio per l'intero batch, invece di uno per
    // ogni operazione — Sheets riceve sempre lo stato completo, non un
    // incremento, quindi rimandarlo N volte non porterebbe beneficio.
    if(ordinata.length>0) syncSeAttivo(store.events, store.calendars, modelli);
  }
  useEffect(()=>{
    function goOnline(){ setIsOnline(true); processaCodaSync(); }
    function goOffline(){ setIsOnline(false); }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Anche all'avvio: se erano rimaste operazioni in coda da una sessione
    // precedente (es. l'app è stata chiusa mentre era offline), si prova
    // subito a smaltirle.
    if(navigator.onLine) processaCodaSync();
    // Timer periodico: la linea "ballerina" (navigator.onLine resta true
    // ma le richieste cadono comunque) non genera mai l'evento 'online' del
    // browser, quindi senza un timer la coda potrebbe restare in sospeso a
    // tempo indeterminato pur avendo la connessione tornata realmente
    // disponibile. Si riprova ogni 2 minuti, in silenzio — nessun popup,
    // nessun indicatore: è solo un nuovo tentativo di routine.
    const timerRetryCoda = setInterval(()=>{ processaCodaSync(); }, 2*60*1000);
    // Controllo diretto di navigator.onLine ogni pochi secondi: su Capacitor
    // Android gli eventi 'online'/'offline' del browser spesso non scattano
    // affatto quando si attiva/disattiva la modalità aereo (limite noto della
    // WebView nativa), lasciando l'indicatore 🟢 SYNC bloccato sul valore
    // letto all'avvio anche se nel frattempo si è passati offline. Questo
    // controllo periodico è indipendente dagli eventi ed è la fonte di
    // verità più affidabile: aggiorna isOnline solo quando il valore letto
    // è davvero diverso da quello già mostrato, per non causare re-render
    // inutili ad ogni giro.
    const timerCheckOnline = setInterval(()=>{
      setIsOnline(prev => {
        const reale = navigator.onLine;
        if(reale === prev) return prev;
        if(reale) processaCodaSync();
        return reale;
      });
    }, 3000);
    return ()=>{
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(timerRetryCoda);
      clearInterval(timerCheckOnline);
    };
  },[]);
// #endregion

// #region SEZIONE 9: THEME & COLORS
// ═══════════════════════════════════════════════════════════════
  const sysDark = window.matchMedia?.("(prefers-color-scheme:dark)").matches??false;
  const dark = store.theme==="auto"?sysDark:store.theme==="dark";
  const T = {
    bg:      dark?"#090e1a":"#f1f5f9",
    surface: dark?"#0f172a":"#ffffff",
    s2:      dark?"#1e293b":"#f1f5f9",
    border:  dark?"#334155":"#e2e8f0",
    text:    "#000000",
    sub:     "#000000",
    gap:     dark?"#1e293b":"#e2e8f0",
  };

  const activeCal = store.calendars.find(c=>c.id===calId)||null;
  const mainCal   = store.calendars.find(c=>c.isMain)||null;
  const mainCalId = mainCal?.id||null; // calendario principale: usato come fallback per i modelli/rotazioni senza calendarId esplicito

  // Default per il Report: se reportCalIds risulta vuoto (nessuna scelta
  // salvata, o per qualunque motivo la persistenza non ha ancora effetto)
  // e il calendario principale e' disponibile, seleziona SOLO quello
  // invece di lasciare "vuoto = tutti i calendari mischiati insieme".
  useEffect(()=>{
    if(reportCalIds.length===0 && mainCalId){
      setReportCalIdsPersistito([mainCalId]);
    }
  }, [mainCalId]);
  // Colore dell'interfaccia (pulsanti, badge, evidenziazioni di selezione): FISSO e indipendente
  // dal colore scelto per i calendari, così i colori dei calendari/modelli (es. giallo) restano
  // solo lì dove servono a identificarli, senza "colorare" tutti i menu dell'app.
  const accent    = "#2563eb";
  const accentText = getContrastTextColor(accent);
  const hols      = italianHols(year, store.nationalHolsEnabled);
  const fasceAutomatiche = store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT;
  const colByTime = (tIn)=>getColorByTime(tIn, fasceAutomatiche);
  const colLabel  = (tIn)=>getColorLabel(tIn, fasceAutomatiche);

  function isRed(d,m){
    return hols.some(h=>h.m===m&&h.d===d) ||
      (store.extraHols||[]).some(h=>+h.m-1===m&&+h.d===d);
  }
  const sundayColor = store.sundayColor || (dark?"#2d0a0a":"#fff5f5");
  const holidayColor = store.holidayColor || (dark?"#2d0a0a":"#fff5f5");
  function redBg(isSun,isH){
    if(isSun&&isH) return `linear-gradient(to bottom, ${sundayColor} 50%, ${holidayColor} 50%)`;
    return isSun?sundayColor:isH?holidayColor:null;
  }
  function getEvts(key,cid){ return store.events?.[key]?.[cid]||[]; }
  // Riconosce se un modelloId punta a un modello "PROTRAZIONE
  // PAGAMENTO"/"PROTRAZIONE RECUPERO" (in qualunque variante/refuso di
  // scrittura storica), guardando il titolo del modello stesso. Usata per
  // riconoscere una protrazione-figlia anche quando l'evento non ha (o ha
  // perso) il marker import_id "protrazione_di_...", tipico di eventi
  // creati a mano dal form invece che da un import PDF.
  function tipoModelloProtrazione(modelloId){
    if(!modelloId) return null;
    const mod = modelli.find(m=>m.id===modelloId);
    if(!mod) return null;
    const titoloRaw = (mod.titolo||"").trim();
    const eMenoRecupero = titoloRaw.startsWith("-");
    const n = titoloRaw.toUpperCase().replace(/\s+/g,"").replace(/^-+/,"");
    const haRadice = n.includes("PROTRAZIONE") || n.includes("PROTAZIONE");
    if(!haRadice) return null;
    if(eMenoRecupero && n.includes("RECUPERO")) return "meno_recupero";
    if(n.includes("RECUPERO")) return "recupero";
    if(n.includes("PAGAMENTO")) return "pagamento";
    return null;
  }
  // Gemella di tipoModelloProtrazione, stesso principio (riconoscimento per
  // titolo del modello, tollerante a refusi), applicata alla coppia
  // Piano Incentivante (il credito, maturato lavorando di domenica) /
  // RC PI - Recupero Compensativo PI (il consumo, un giorno di riposo).
  // A differenza della Protrazione qui non si lavora in minuti frazionabili:
  // ogni evento vale "1 giorno" intero, indivisibile.
  function tipoModelloPI(modelloId){
    if(!modelloId) return null;
    const mod = modelli.find(m=>m.id===modelloId);
    if(!mod) return null;
    const n = (mod.titolo||"").trim().toUpperCase().replace(/\s+/g,"");
    if(n.includes("RCPI") || (n.includes("RECUPERO") && n.includes("PI"))) return "rc_pi";
    if(n.includes("PIANOINCENTIVANTE") || n === "PI") return "piano_incentivante";
    return null;
  }
  // Vero se dateKey (formato YYYY-MM-DD) cade di domenica. Solo i Piani
  // Incentivanti di domenica maturano un giorno di riposo — quelli nei
  // festivi infrasettimanali (es. 19 settembre) non generano credito.
  function eDomenica(dateKey){
    const [y,m,d] = dateKey.split("-").map(Number);
    return new Date(y, m-1, d).getDay() === 0;
  }
  // Stesso principio di computeStornoRecupero (calcolo dinamico, mai
  // salvato, sempre ricoerente con lo stato attuale del calendario — così
  // aggiungere/spostare/cancellare un evento anche mesi dopo riallinea
  // tutto da solo al giro successivo), applicato alla coppia Piano
  // Incentivante/RC PI. Differenze rispetto alla Protrazione:
  // - il credito vale solo se il Piano Incentivante cade di domenica
  // - ogni credito/consumo vale "1", non è frazionabile in minuti
  // Ritorna { perEvento } dove perEvento[eventId] = { tipo, collegatoId,
  // collegatoDateKey } — un Piano Incentivante è collegato a UN SOLO RC PI
  // (quello più vecchio libero al momento del consumo) e viceversa.
  function computeStornoPI(){
    const eventiPI = [];    // { id, dateKey } - Piani Incentivanti di domenica
    const eventiRcPi = [];  // { id, dateKey } - giorni di RC PI presi
    for(const [dateKey, calMap] of Object.entries(store.events)){
      for(const [calId, evts] of Object.entries(calMap)){
        for(const e of evts){
          const tipo = tipoModelloPI(e.modelloId);
          if(tipo==="piano_incentivante" && eDomenica(dateKey)) eventiPI.push({ id:e.id, dateKey });
          else if(tipo==="rc_pi") eventiRcPi.push({ id:e.id, dateKey });
        }
      }
    }
    function cmp(a,b){
      if(a.dateKey!==b.dateKey) return a.dateKey<b.dateKey?-1:1;
      return a.id<b.id?-1:(a.id>b.id?1:0);
    }
    eventiPI.sort(cmp);
    eventiRcPi.sort(cmp);

    const perEvento = {};
    eventiPI.forEach(ev=>{ perEvento[ev.id] = { tipo:"piano_incentivante", collegatoId:null, collegatoDateKey:null }; });
    eventiRcPi.forEach(ev=>{ perEvento[ev.id] = { tipo:"rc_pi", collegatoId:null, collegatoDateKey:null }; });

    // FIFO: per ogni RC PI (in ordine cronologico), prendo il primo Piano
    // Incentivante di domenica non ancora assegnato a un altro RC PI.
    const piAssegnati = new Set();
    for(const consumo of eventiRcPi){
      const credito = eventiPI.find(p=>!piAssegnati.has(p.id));
      if(!credito) continue; // nessun Piano Incentivante libero da recuperare
      piAssegnati.add(credito.id);
      perEvento[consumo.id].collegatoId = credito.id;
      perEvento[consumo.id].collegatoDateKey = credito.dateKey;
      perEvento[credito.id].collegatoId = consumo.id;
      perEvento[credito.id].collegatoDateKey = consumo.dateKey;
    }
    return { perEvento };
  }
  function allEvts(key){
    const res=[];
    const soloCal = selectedCalIds.length>0 ? selectedCalIds : null; // visibilità eventi: sempre tutti i calendari selezionati, editMode o no
    if(mainCal && (!soloCal||soloCal.includes(mainCal.id))) getEvts(key,mainCal.id).forEach(e=>res.push({...e,_cid:mainCal.id}));
    store.calendars.filter(c=>!c.isMain && (!soloCal||soloCal.includes(c.id))).forEach(c=>
      getEvts(key,c.id).forEach(e=>res.push({...e,_cid:c.id})));
    // Ordine calendario: posizione dell'evento nell'elenco calendari configurato in Impostazioni
    const calOrderIdx = new Map(store.calendars.map((c,i)=>[c.id,i]));
    // Ordine modello: posizione del modello nella schermata Modelli
    const modOrderIdx = new Map(modelliOrdinati.map((m,i)=>[m.id,i]));
    const ordinati = res.sort((a,b)=>{
      const ca = calOrderIdx.has(a._cid) ? calOrderIdx.get(a._cid) : 999;
      const cb = calOrderIdx.has(b._cid) ? calOrderIdx.get(b._cid) : 999;
      if(ca!==cb) return ca-cb;
      const ma = a.modelloId && modOrderIdx.has(a.modelloId) ? modOrderIdx.get(a.modelloId) : 9999;
      const mb = b.modelloId && modOrderIdx.has(b.modelloId) ? modOrderIdx.get(b.modelloId) : 9999;
      return ma-mb;
    });
    // Una protrazione-figlia (PROTRAZIONE PAGAMENTO/RECUPERO agganciata a un
    // turno base) va SEMPRE mostrata subito dopo il proprio turno base,
    // indipendentemente da dove si trova il modello PROTRAZIONE nella lista
    // Modelli: senza questo passaggio, se il modello PROTRAZIONE è prima di
    // AUTO in quella lista, la card della protrazione appare sopra invece
    // che sotto il turno a cui è collegata.
    // Riconoscimento su DUE binari, perché non tutti gli eventi hanno il
    // marker import_id (quelli creati/modificati a mano dal form spesso non
    // ce l'hanno): 1) marker "protrazione_di_<id>_<tipo>" quando presente;
    // 2) altrimenti per modello+orario, cioè l'evento usa un modello
    // PROTRAZIONE e il suo orario di inizio coincide con l'uscita di un
    // turno base dello stesso giorno/calendario.
    function trovaBasePerModelloOrario(evt){
      if(evt.modelloId===null||evt.modelloId===undefined) return null;
      const tipo = tipoModelloProtrazione(evt.modelloId);
      if(!tipo || !evt.tIn) return null;
      const base = ordinati.find(b=>
        b.id!==evt.id && b._cid===evt._cid &&
        !decodificaProtrazioneFiglio(b.importId) && !tipoModelloProtrazione(b.modelloId) &&
        b.tOut && b.tOut===evt.tIn
      );
      return base ? base.id : null;
    }
    const idxById = new Map(ordinati.map((e,i)=>[e.id,i]));
    const basiGiaPiazzate = new Set();
    const risultatoFinale = [];
    for(const e of ordinati){
      const decodifica = decodificaProtrazioneFiglio(e.importId);
      const baseIdPerOrario = !decodifica ? trovaBasePerModelloOrario(e) : null;
      if(decodifica || baseIdPerOrario){
        // Salta qui: la protrazione-figlia viene inserita subito dopo il
        // suo turno base quando processiamo il base stesso (sotto). Se il
        // base non è (più) presente in questo elenco, la protrazione va
        // comunque mostrata, altrove non salterebbe fuori da nessuna parte.
        const idBaseRiferimento = decodifica ? decodifica.idEventoBase : baseIdPerOrario;
        if(idxById.has(idBaseRiferimento)) continue;
      }
      risultatoFinale.push(e);
      if(!decodifica && !baseIdPerOrario && !basiGiaPiazzate.has(e.id)){
        basiGiaPiazzate.add(e.id);
        const prefissoFigli = `protrazione_di_${e.id}_`;
        const figli = ordinati.filter(f=>{
          if((f.importId||"").startsWith(prefissoFigli)) return true;
          if(decodificaProtrazioneFiglio(f.importId)) return false; // già gestito dal marker
          return trovaBasePerModelloOrario(f)===e.id;
        });
        risultatoFinale.push(...figli);
      }
    }
    return risultatoFinale;
  }
  function dots(key){ return store.calendars.filter(c=>getEvts(key,c.id).length>0); }

  async function saveSettings(updates={}){
    if(!userId) return;
    const { error } = await supabase.from("user_settings").upsert({
      user_id: userId,
      theme: store.theme,
      extra_hols: store.extraHols,
      cal_event_rows: store.calEventRows,
      cal_row1_field: store.calRow1Field,
      cal_row2_field: store.calRow2Field,
      ...updates,
      updated_at: new Date().toISOString(),
    });
    if(error) segnalaErroreDb(error, "Salvataggio impostazioni");
  }

  // Spostata qui da SEZIONE 18 (Settings View) perché usata anche da
  // Modelli View: aggiorna una fascia oraria automatica (label/colore/orario).
  function updateFascia(key, updates){
    const nuove = fasceAutomatiche.map(f=>f.key===key?{...f,...updates}:f);
    setStore(s=>({...s, fasceAutomatiche:nuove}));
    saveSettings({fasce_automatiche:nuove});
  }
// #endregion

// #region SEZIONE 10: CRUD CALENDARI
// ═══════════════════════════════════════════════════════════════
  // Genera subito l'id lato client e lo ritorna insieme all'oggetto
  // calendario completo: il chiamante può aggiornare lo stato locale
  // all'istante, senza aspettare Supabase. Il backup remoto (con retry
  // colonna) + Sheets avviene in background, con fallback in coda se offline.
  async function addCalendar(name, color, isFirst){
    if(!userId) return null;
    const idLocale = generaIdLocale();
    const payload = { id:idLocale, user_id: userId, name, color, is_main: isFirst, shifts: [] };
    scriviConBackup({
      tipo:"insert", table:"calendars", payload, matchObj:null,
      contesto:"Creazione calendario", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: [...store.calendars, {id:idLocale,name,color,isMain:isFirst,shifts:[]}], modelliPerSheets: modelli,
    });
    return { id:idLocale, name, color, is_main:isFirst };
  }
  async function updateCalendar(cId, fields){
    if(!userId) return;
    const match = { id: cId, user_id: userId };
    await scriviConBackup({
      tipo:"update", table:"calendars", payload:fields, matchObj:match,
      contesto:"Aggiornamento calendario", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
    });
  }
  async function deleteCalendar(cId){
    if(!userId) return;
    const newCals = store.calendars.filter(c=>c.id!==cId);
    saveToLocalStorage(store.events, newCals, modelli);
    setStore(s=>({...s, calendars:newCals}));
    const match = { id: cId, user_id: userId };
    await scriviConBackup({
      tipo:"delete", table:"calendars", payload:null, matchObj:match,
      contesto:"Eliminazione calendario", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: newCals, modelliPerSheets: modelli,
    });
  }
// #endregion

// #region SEZIONE 11: CRUD EVENTI
// ═══════════════════════════════════════════════════════════════
  // Calcola color/label/orari/shiftId/extraNote a partire dal form corrente.
  // Funzione condivisa (superset) usata sia da saveEvt che da updateEvt: contiene
  // TUTTI i rami di entrambe (gestione modelloId, shiftId, fixed/fixed30, extraNote),
  // così nessuna delle due perde comportamento. Ogni chiamante decide se usare
  // extraNote o ignorarlo, ma il calcolo avviene sempre allo stesso modo per entrambi.
  function computeEventFields(form, cal, modelli){
    let color = form.colorOvr || cal.color;
    let label = (form.label||"Evento").toUpperCase();
    let tInFinal = form.dur==="allday"?"":form.tIn||"";
    let tOutFinal = form.dur==="allday"?"":form.tOut||"";
    // In creazione il modello scelto sta in form.modelloId; in modifica di un
    // evento esistente sta invece in form.evtModelloId (form.modelloId resta
    // null finché non si passa esplicitamente dal picker "cambia modello").
    // Serve leggere entrambi, altrimenti gli eventi modificati (non ricreati
    // da zero) non hanno mai gli orari del modello ricalcolati qui sotto.
    const idModelloForm = form.modelloId || form.evtModelloId;
    if(idModelloForm){
      const mod = modelli.find(m=>m.id===idModelloForm);
      if(mod){
        color = form.colorOvr||(mod.coloreCustom||colByTime(mod.inizio));
        label = (mod.label||mod.titolo||label).toUpperCase();
        // Orari SEMPRE quelli ufficiali del modello quando un modello è
        // selezionato: il campo Ingresso/Uscita in alto NON deve più poter
        // spostare l'identità/conteggio del turno (es. arrivare in ritardo
        // e recuperare a fine turno non deve trasformare "AUTO 13:45-20:00"
        // in un evento diverso "AUTO 13:51-20:06"). Chi vuole tracciare uno
        // scostamento reale usa i campi dedicati "Entrata/Uscita effettiva"
        // sotto PROTRAZIONE A RECUPERO, pensati apposta per questo.
        if(mod.tempo==="h24"){ tInFinal=""; tOutFinal=""; }
        else { tInFinal = mod.inizio||""; tOutFinal = mod.fine||""; }
      }
    } else if(form.shiftId){
      const sh = cal.shifts?.find(s=>s.id===form.shiftId);
      if(sh){ color=form.colorOvr||sh.color; label=sh.label.toUpperCase(); }
    }
    if(form.dur==="fixed" && tInFinal && !idModelloForm){
      tOutFinal = form.tOut||calcFine6h15(tInFinal);
    }
    if(form.dur==="fixed30" && tInFinal && !idModelloForm){
      tOutFinal = form.tOut||calcFine6h30(tInFinal);
    }
    let extraNote = form.note||"";
    if(idModelloForm && tInFinal && tOutFinal){
      const mod=modelli.find(m=>m.id===idModelloForm);
      if(mod&&mod.fine&&mod.inizio){
        const durPrevista=calcMinuti(mod.inizio,mod.fine);
        const durEffettiva=calcMinuti(tInFinal,tOutFinal);
        const diff=durEffettiva-durPrevista;
        if(diff>0) extraNote=(extraNote?extraNote+" | ":"")+`Protrazione: +${Math.floor(diff/60)}h${diff%60>0?diff%60+"m":""}`;
        if(diff<0) extraNote=(extraNote?extraNote+" | ":"")+`Anticipo: ${Math.floor(Math.abs(diff)/60)}h${Math.abs(diff)%60>0?Math.abs(diff)%60+"m":""}`;
      }
    }
    return { color, label, tInFinal, tOutFinal, extraNote };
  }

  // Marcatore usato per ritrovare l'evento "figlio" di protrazione
  // agganciato a un turno base, riusando la colonna import_id (già
  // esistente su Supabase) invece di aggiungere una colonna nuova.
  function idProtrazioneFiglio(idEventoBase, tipo){
    return `protrazione_di_${idEventoBase}_${tipo}`;
  }

  // Decodifica il marker import_id di un evento: se l'evento È esso stesso
  // una protrazione-figlia (creata da sincronizzaEventiProtrazione), restituisce
  // { idEventoBase, tipo }, altrimenti null. Serve per la sincronizzazione
  // inversa: quando l'utente modifica/elimina la protrazione direttamente
  // dal calendario, dobbiamo risalire al turno AUTO padre e aggiornarlo.
  function decodificaProtrazioneFiglio(importId){
    if(!importId) return null;
    // FIX BUG DOPPIONE "- PR RECUPERO": con (.+) greedy e le alternative
    // nell'ordine "pagamento|recupero|meno_recupero", su un importId tipo
    // "protrazione_di_<uuid>_meno_recupero" il motore regex risaliva da
    // destra e si accontentava di "recupero" come suffisso (che è anche
    // suffisso di "meno_recupero"), catturando erroneamente "<uuid>_meno"
    // come idEventoBase invece di "<uuid>". Quell'id sbagliato non esiste
    // in nessun elenco di eventi, quindi allEvts() non riusciva mai a
    // riconoscere il figlio come "già gestito dal turno base" e lo
    // mostrava DUE volte: una nella sua posizione naturale (ordinamento
    // per modello) e una seconda volta quando il turno base veniva
    // processato (lì l'aggancio riuscito, perché lì si usa un semplice
    // startsWith sul prefisso, non questa regex). Il gruppo (.+?) reso
    // non-greedy risolve, catturando il minimo necessario e lasciando il
    // resto al gruppo tipo, che prova "meno_recupero" correttamente.
    const m = /^protrazione_di_(.+?)_(pagamento|meno_recupero|recupero)$/.exec(importId);
    if(!m) return null;
    return { idEventoBase: m[1], tipo: m[2] };
  }

  // Crea/aggiorna/rimuove gli eventi "figli" di protrazione (a pagamento
  // e/o a recupero) agganciati a un turno base. Ogni figlio è un evento
  // reale collegato al modello dedicato "PROTRAZIONE PAGAMENTO"/
  // "PROTRAZIONE RECUPERO" (trovato o creato al volo), con orario
  // inizio = uscita del turno base e orario fine = protPagFine/protRecFine:
  // questo lo fa entrare nei report che raggruppano per modelloId, esattamente
  // come già avviene per le protrazioni importate da PDF.
  async function sincronizzaEventiProtrazione({ idEventoBase, dayKey, calId, tInBase, tOutBase, protPagFine, protRecFine, menoRecIn, menoRecOut }){
    if(!idEventoBase||!dayKey||!calId||!userId) return;
    // Il terzo tipo (-PROTRAZIONE A RECUPERO, consumo del credito) non ha un
    // singolo range "da->a" come gli altri due: si sommano due scostamenti
    // indipendenti rispetto al turno base — ritardo in entrata (menoRecIn
    // dopo tInBase) e anticipo in uscita (menoRecOut prima di tOutBase).
    // L'evento risultante viene comunque rappresentato con un orario
    // inizio/fine coerente con la durata totale calcolata (a partire da
    // tOutBase, solo per farlo comparire/durare visivamente in modo
    // corretto sul calendario), ma il dato che conta è la durata in minuti.
    function minutiRitardoEntrata(){
      const previsto = oraInMinuti(tInBase||""), effettivo = oraInMinuti(menoRecIn||"");
      if(previsto===null||effettivo===null) return 0;
      let d = effettivo-previsto;
      if(d<0) d+=24*60;
      return Math.max(0,d);
    }
    function minutiAnticipoUscita(){
      const previsto = oraInMinuti(tOutBase||""), effettivo = oraInMinuti(menoRecOut||"");
      if(previsto===null||effettivo===null) return 0;
      let d = previsto-effettivo;
      if(d<0) d+=24*60;
      return Math.max(0,d);
    }
    const minutiMenoRec = minutiRitardoEntrata() + minutiAnticipoUscita();
    // Uso un orario fine "virtuale" = tOutBase + minutiMenoRec, solo per dare
    // all'evento una durata coerente sul calendario (tIn=tOutBase,
    // tOut=quell'orario virtuale): la lettura corretta per i report resta
    // sempre la DURATA (differenza tIn/tOut), non l'orario in sé.
    let oraFineVirtualeMenoRec = "";
    if(minutiMenoRec>0 && tOutBase){
      const m1 = oraInMinuti(tOutBase);
      if(m1!==null){
        const m2 = (m1 + minutiMenoRec) % (24*60);
        oraFineVirtualeMenoRec = String(Math.floor(m2/60)).padStart(2,"0")+":"+String(m2%60).padStart(2,"0");
      }
    }

    const richieste = [
      { tipo:"pagamento", oraFine: protPagFine },
      { tipo:"recupero",  oraFine: protRecFine },
      { tipo:"meno_recupero", oraFine: minutiMenoRec>0 ? oraFineVirtualeMenoRec : "", durataOverride: minutiMenoRec },
    ];
    // Leggo SEMPRE da storeRef.current, non dalla "store" chiusa nella
    // closure di questa funzione: quest'ultima può essere ancora la
    // fotografia del render precedente quando saveEvt/updateEvt chiamano
    // sincronizzaEventiProtrazione subito dopo il proprio setStore, prima
    // che React abbia ri-renderizzato. Se così fosse, un figlio di
    // protrazione già creato in una modifica precedente non verrebbe
    // trovato qui sotto (find fallirebbe), e verrebbe creato un secondo
    // evento doppione invece di aggiornare quello esistente.
    const evtiGiorno = storeRef.current.events?.[dayKey]?.[calId]||[];

    for(const { tipo, oraFine, durataOverride } of richieste){
      const marker = idProtrazioneFiglio(idEventoBase, tipo);
      // Auto-riparazione: se per lo stesso marker esistono già più eventi
      // figli (retaggio del bug di race condition risolto sopra, quando la
      // ricerca leggeva uno store non ancora aggiornato e ne creava un
      // secondo invece di trovare il primo), tengo solo il più vecchio e
      // cancello gli altri, così il doppione sparisce automaticamente alla
      // prossima modifica del turno invece di restare per sempre in giro.
      const candidatiEsistenti = evtiGiorno.filter(e=>e.importId===marker);
      const esistente = candidatiEsistenti[0]||null;
      if(candidatiEsistenti.length>1){
        for(const doppione of candidatiEsistenti.slice(1)){
          await delEvt(dayKey, calId, doppione.id);
        }
      }

      // Campo vuoto o orario non valido/non successivo alla base: se
      // esisteva un figlio da una modifica precedente, lo rimuovo.
      // Per "meno_recupero" la durata è già quella calcolata sopra
      // (durataOverride), non va ricalcolata da tOutBase->oraFine.
      const durataMin = durataOverride!==undefined ? durataOverride : calcMinuti(tOutBase, oraFine);
      if(!oraFine || durataMin<=0){
        if(esistente) await delEvt(dayKey, calId, esistente.id);
        continue;
      }

      const mod = await trovaOCreaModelloProtrazione(tipo, calId);
      if(!mod) continue;
      const color = mod.coloreCustom || (tipo==="recupero" ? "#f9a8d4" : tipo==="meno_recupero" ? "#dc2626" : "#ec4899");
      // Il "nome da mostrare nel calendario" (mod.label) ha PRIORITÀ sul
      // titolo/codice (mod.titolo): stessa convenzione già usata altrove
      // (vedi computeEventFields più sopra). Con la vecchia priorità
      // invertita, un modello con titolo "PROTRAZIONE RECUPERO" e nome da
      // mostrare "PR RECUPERO" finiva comunque per etichettare l'evento
      // col titolo lungo, ignorando il nome scelto dall'utente.
      const label = (mod.label||mod.titolo||"").toUpperCase();

      if(esistente){
        // Aggiorno l'evento figlio esistente (stesso pattern di updateEvt).
        const payload = {
          label, color, all_day:false,
          time_in: tOutBase||"", time_out: oraFine,
          modello_id: mod.id||null,
        };
        setStore(prev=>{
          const patch = { label, color, allDay:false, tIn: tOutBase||"", tOut: oraFine, modelloId: mod.id||null };
          const ns = withEventoAggiornato(prev, dayKey, calId, esistente.id, patch);
          saveToLocalStorage(ns.events, ns.calendars, modelli);
          storeRef.current = ns;
          return ns;
        });
        const match = { id: esistente.id, user_id: userId };
        // storeRef.current, non "store": setStore è asincrono, quindi lo
        // stato React "store" qui sopra può essere ancora quello vecchio
        // (senza la modifica appena fatta). storeRef.current viene invece
        // aggiornato in modo sincrono dentro l'updater qui sopra.
        await scriviConBackup({
          tipo:"update", table:"events", payload, matchObj:match,
          contesto:`Aggiornamento protrazione ${tipo}`, ts:new Date().toISOString(),
          eventsPerSheets: storeRef.current.events, calendarsPerSheets: storeRef.current.calendars,
          opzioni:{ soloLog:true },
        });
      } else {
        // Creo il nuovo evento figlio.
        const idLocale = generaIdLocale();
        const payload = {
          id: idLocale,
          user_id: userId, calendar_id: calId, date_key: dayKey,
          label, color, all_day:false,
          time_in: tOutBase||"", time_out: oraFine,
          place:"", map_url:"", note:"",
          modello_id: mod.id||null, rotazione_id:null,
          collega:"", auto:"",
          prot_pag_fine:null, prot_rec_fine:null,
          import_id: marker,
        };
        const evt = {
          id: idLocale, color, label, allDay:false,
          tIn: tOutBase||"", tOut: oraFine,
          place:"", map:"", note:"", modelloId: mod.id||null, rotazioneId:null,
          collega:"", auto:"", importId: marker,
        };
        setStore(prev=>{
          const ns = withEventoAggiunto(prev, dayKey, calId, evt);
          saveToLocalStorage(ns.events, ns.calendars, modelli);
          storeRef.current = ns;
          return ns;
        });
        // storeRef.current, non "store": vedi nota sull'altro scriviConBackup
        // poco sopra in questa stessa funzione.
        await scriviConBackup({
          tipo:"insert", table:"events", payload, matchObj:null,
          contesto:`Creazione protrazione ${tipo}`, ts:new Date().toISOString(),
          eventsPerSheets: storeRef.current.events, calendarsPerSheets: storeRef.current.calendars,
          opzioni:{ soloLog:true },
        });
      }
    }
  }

  // ── Auto-collegamento evento→modello: se l'utente salva un evento senza
  // passare dal picker "Scegli modello" (scrivendo a mano titolo/orario),
  // form.modelloId resta vuoto e l'evento diventa "orfano" — invisibile ai
  // report, che contano sempre per modelloId, mai per il solo testo/label.
  // Qui cerchiamo un modello dello stesso calendario con titolo (o label) e
  // orari IDENTICI: se lo troviamo, colleghiamo l'evento in automatico,
  // silenziosamente, così il problema non si presenta più al salvataggio.
  // Match volutamente RIGOROSO (stesso calendario, stesso testo, stessi
  // orari): meglio lasciare un evento orfano isolato che agganciarlo al
  // modello sbagliato.
  function trovaModelloCorrispondente(calId, label, tIn, tOut){
    if(!label) return null;
    const norm = s => (s||"").trim().toUpperCase();
    const target = norm(label);
    return modelli.find(m=>
      m.calendarId===calId &&
      (norm(m.titolo)===target || norm(m.label)===target) &&
      (m.inizio||"")===(tIn||"") &&
      (m.fine||"")===(tOut||"")
    ) || null;
  }

  async function saveEvt(){
    try{
      return await saveEvtInterno();
    }catch(e){
      // Il locale è già stato scritto dentro saveEvtInterno prima di
      // arrivare a scriviConBackup, quindi un'eccezione di rete qui è solo
      // il backup remoto non riuscito — niente popup, silenziosamente
      // riprovato più avanti (coda). Solo un errore "vero" merita l'alert.
      if(eRoreDiRete(e)) return;
      segnalaErrore(e, "Salvataggio turno (errore imprevisto)");
      alert("Si è verificato un errore imprevisto salvando il turno. L'errore è stato registrato nel Log (Impostazioni → Log). Controlla il calendario: il turno potrebbe non essere stato salvato.");
    }
  }
  async function saveEvtInterno(){
    if(!form||!dayKey||!calId||!userId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;
    const { color, label, tInFinal, tOutFinal, extraNote } = computeEventFields(form, cal, modelli);

    // Fallback: se il form non ha un modello selezionato ma il testo/orario
    // combaciano esattamente con un modello esistente, colleghiamolo ora,
    // prima di scrivere su Supabase — invece di scoprirlo dopo dal report.
    // NB: `form` proviene dallo stato React (const), quindi non va mai
    // riassegnato con `=`: usiamo una variabile locale derivata.
    let formEffettivo = form;
    if(!form.modelloId){
      const matchAuto = trovaModelloCorrispondente(calId, label, tInFinal, tOutFinal);
      if(matchAuto) formEffettivo = {...form, modelloId: matchAuto.id};
    }

    // L'id viene generato QUI, non più dal database: così l'evento locale
    // e quello su Supabase condividono lo stesso id fin dal primo istante,
    // nessuna riconciliazione necessaria dopo che il server risponde.
    const idLocale = generaIdLocale();
    const payload = {
      id: idLocale,
      user_id: userId, calendar_id: calId, date_key: dayKey,
      label, color, all_day: formEffettivo.dur==="allday"&&!formEffettivo.modelloId,
      time_in: tInFinal, time_out: tOutFinal,
      place: up(formEffettivo.place), map_url: formEffettivo.map||"", note: up(extraNote),
      modello_id: formEffettivo.modelloId||null, rotazione_id: formEffettivo.rotazioneId||null,
      collega: up(formEffettivo.collega), auto: up(formEffettivo.auto),
      prot_pag_fine: formEffettivo.protPagFine||null, prot_rec_fine: formEffettivo.protRecFine||null,
      prot_meno_rec_in: formEffettivo.protMenoRecIn||null, prot_meno_rec_out: formEffettivo.protMenoRecOut||null,
      categoria_turno: formEffettivo.categoriaTurno||null, categoria_app_auto: formEffettivo.categoriaAppAuto||null,
      // Promemoria di ingresso/uscita realmente digitato dall'utente, separato
      // dagli orari ufficiali dell'evento (time_in/time_out, sempre uguali al
      // modello quando c'è un modello collegato). Serve solo per essere
      // rimostrato nel form al riapertura, non incide su report/conteggi.
      time_in_note: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tIn||null) : null,
      time_out_note: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tOut||null) : null,
    };

    // 1) SUBITO in locale: l'utente vede il turno all'istante, online o offline.
    const evt = {
      id: idLocale, color, label, allDay: payload.all_day,
      tIn: tInFinal||"", tOut: tOutFinal||"",
      tInNote: payload.time_in_note||"", tOutNote: payload.time_out_note||"",
      place: payload.place||"", map: payload.map_url||"",
      note: payload.note||"", modelloId: payload.modello_id,
      rotazioneId: payload.rotazione_id,
      collega: payload.collega||null, auto: payload.auto||"",
      protPagFine: payload.prot_pag_fine||"", protRecFine: payload.prot_rec_fine||"",
      protMenoRecIn: payload.prot_meno_rec_in||"", protMenoRecOut: payload.prot_meno_rec_out||"",
      categoriaTurno: payload.categoria_turno||"", categoriaAppAuto: payload.categoria_app_auto||"",
    };
    if(!formEffettivo.modelloId && formEffettivo.label) registraValoreAutocomplete("titolo", label);
    if(formEffettivo.auto) registraValoreAutocomplete("auto", formEffettivo.auto);
    if(formEffettivo.place) registraValoreAutocomplete("luogo", formEffettivo.place);
    if(formEffettivo.collega) registraValoriAutocomplete("collega", formEffettivo.collega.split(/\r?\n/));
    const nuovoStore = withEventoAggiunto(store, dayKey, calId, evt);
    saveToLocalStorage(nuovoStore.events, nuovoStore.calendars, modelli);
    setStore(nuovoStore);
    // Aggiorno anche il ref SUBITO (sincrono): sincronizzaEventiProtrazione
    // viene chiamata poche righe sotto, prima che React possa aver
    // ri-renderizzato e propagato nuovoStore dentro storeRef via useEffect.
    storeRef.current = nuovoStore;
    setForm(null); setDayKey(null);

    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    // Se offline, va in coda con il timestamp di adesso e riparte da sola.
    await scriviConBackup({
      tipo:"insert", table:"events", payload, matchObj:null,
      contesto:"Creazione turno", ts:new Date().toISOString(),
      eventsPerSheets: nuovoStore.events, calendarsPerSheets: nuovoStore.calendars,
    });

    // 3) Se il turno porta una protrazione (a pagamento e/o a recupero),
    // genero/aggiorno anche i rispettivi eventi "figli" agganciati ai
    // modelli dedicati PROTRAZIONE PAGAMENTO/RECUPERO, così le ore di
    // protrazione entrano nei report (che raggruppano per modelloId).
    await sincronizzaEventiProtrazione({
      idEventoBase: idLocale, dayKey, calId,
      tInBase: tInFinal, tOutBase: tOutFinal,
      protPagFine: formEffettivo.protPagFine||"", protRecFine: formEffettivo.protRecFine||"",
      menoRecIn: formEffettivo.protMenoRecIn||"", menoRecOut: formEffettivo.protMenoRecOut||"",
    });
  }

  async function updateEvt(){
    try{
      return await updateEvtInterno();
    }catch(e){
      // Stesso ragionamento di saveEvt: rete instabile qui non è un errore
      // vero, il locale è già a posto. Silenzioso, non un doppio popup.
      if(eRoreDiRete(e)) return;
      segnalaErrore(e, "Modifica turno (errore imprevisto)");
      alert("Si è verificato un errore imprevisto modificando il turno. L'errore è stato registrato nel Log (Impostazioni → Log). Controlla il calendario: la modifica potrebbe non essere stata salvata.");
    }
  }
  async function updateEvtInterno(){
    const editCalId = form?.editCid || calId;
    if(!form||!dayKey||!editCalId||!userId||!form.editId) return;
    const cal = store.calendars.find(c=>c.id===editCalId);
    if(!cal) return;
    const { color, label, tInFinal, tOutFinal } = computeEventFields(form, cal, modelli);

    // Stesso fallback di saveEvt: se manca modelloId ma testo/orario
    // combaciano esattamente con un modello esistente, colleghiamolo ora.
    // NB: `form` proviene dallo stato React (const), quindi non va mai
    // riassegnato con `=`: usiamo una variabile locale derivata.
    let formEffettivo = form;
    if(!form.modelloId){
      const matchAuto = trovaModelloCorrispondente(editCalId, label, tInFinal, tOutFinal);
      if(matchAuto) formEffettivo = {...form, modelloId: matchAuto.id};
    }

    // Sincronizzazione inversa: se l'evento che sto modificando È esso
    // stesso una protrazione-figlia (l'utente ha cambiato l'orario
    // direttamente sulla card PROTRAZIONE nel calendario, non sul campo
    // dentro AUTO), propago il nuovo orario di fine al campo
    // protPagFine/protRecFine del turno AUTO padre, così restano sempre
    // allineati indipendentemente da dove viene fatta la modifica.
    const evtiGiornoCorrente = store.events?.[dayKey]?.[editCalId]||[];
    const evtCorrente = evtiGiornoCorrente.find(e=>e.id===formEffettivo.editId);
    const decodificaMod = decodificaProtrazioneFiglio(evtCorrente?.importId);
    if(decodificaMod && decodificaMod.tipo!=="meno_recupero"){
      const { idEventoBase, tipo } = decodificaMod;
      const campoDaAggiornare = tipo==="pagamento" ? "protPagFine" : "protRecFine";
      const campoDbDaAggiornare = tipo==="pagamento" ? "prot_pag_fine" : "prot_rec_fine";
      const padreEsiste = evtiGiornoCorrente.some(e=>e.id===idEventoBase);
      if(padreEsiste){
        setStore(prev=>{
          const ns = withEventoAggiornato(prev, dayKey, editCalId, idEventoBase, { [campoDaAggiornare]: tOutFinal||"" });
          saveToLocalStorage(ns.events, ns.calendars, modelli);
          return ns;
        });
        await scriviConBackup({
          tipo:"update", table:"events", payload:{ [campoDbDaAggiornare]: tOutFinal||null },
          matchObj:{ id: idEventoBase, user_id: userId },
          contesto:`Propagazione orario protrazione ${tipo} sul turno base`, ts:new Date().toISOString(),
          eventsPerSheets: store.events, calendarsPerSheets: store.calendars,
          opzioni:{ soloLog:true },
        });
      }
    }

    const payload = {
      label, color, all_day: formEffettivo.dur==="allday",
      time_in: tInFinal, time_out: tOutFinal,
      place: (formEffettivo.place||"").toUpperCase(),
      map_url: formEffettivo.map||"",
      note: (formEffettivo.note||"").toUpperCase(),
      modello_id: formEffettivo.modelloId||null,
      collega: (formEffettivo.collega||"").toUpperCase(),
      auto: (formEffettivo.auto||"").toUpperCase(),
      prot_pag_fine: formEffettivo.protPagFine||null,
      prot_rec_fine: formEffettivo.protRecFine||null,
      prot_meno_rec_in: formEffettivo.protMenoRecIn||null,
      prot_meno_rec_out: formEffettivo.protMenoRecOut||null,
      categoria_turno: formEffettivo.categoriaTurno||null,
      categoria_app_auto: formEffettivo.categoriaAppAuto||null,
      // Vedi commento gemello in saveEvt: promemoria separato dagli orari
      // ufficiali, per sopravvivere al refresh senza alterare il turno.
      time_in_note: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tIn||null) : null,
      time_out_note: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tOut||null) : null,
    };
    const match = { id: formEffettivo.editId, user_id: userId };

    if(!formEffettivo.modelloId && formEffettivo.label) registraValoreAutocomplete("titolo", label);
    if(formEffettivo.auto) registraValoreAutocomplete("auto", (formEffettivo.auto||"").toUpperCase());
    if(formEffettivo.place) registraValoreAutocomplete("luogo", (formEffettivo.place||"").toUpperCase());
    if(formEffettivo.collega) registraValoriAutocomplete("collega", (formEffettivo.collega||"").toUpperCase().split(/\r?\n/));

    // 1) SUBITO in locale.
    const patch = {label, color,
      allDay: formEffettivo.dur==="allday", tIn: tInFinal, tOut: tOutFinal,
      tInNote: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tIn||"") : "",
      tOutNote: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tOut||"") : "",
      place: (formEffettivo.place||"").toUpperCase(), map: formEffettivo.map||"",
      note: (formEffettivo.note||"").toUpperCase(), modelloId: formEffettivo.modelloId||null,
      collega: (formEffettivo.collega||"").toUpperCase(), auto: (formEffettivo.auto||"").toUpperCase(),
      protPagFine: formEffettivo.protPagFine||"", protRecFine: formEffettivo.protRecFine||"",
      protMenoRecIn: formEffettivo.protMenoRecIn||"", protMenoRecOut: formEffettivo.protMenoRecOut||"",
      categoriaTurno: formEffettivo.categoriaTurno||"", categoriaAppAuto: formEffettivo.categoriaAppAuto||"",
    };
    const nuovoStore = withEventoAggiornato(store, dayKey, editCalId, formEffettivo.editId, patch);
    saveToLocalStorage(nuovoStore.events, nuovoStore.calendars, modelli);
    setStore(nuovoStore);
    // Aggiorno anche il ref SUBITO (sincrono): la chiamata a
    // sincronizzaEventiProtrazione poco sotto deve vedere questo turno
    // già aggiornato E, soprattutto, l'eventuale figlio "-PROTRAZIONE A
    // RECUPERO" creato in un salvataggio precedente, che altrimenti (con
    // la "store" chiusa nella closure, ferma al render precedente) può
    // risultare non trovato e causare la creazione di un secondo
    // evento doppione invece di aggiornare quello già esistente.
    storeRef.current = nuovoStore;
    setForm(null); setDayKey(null);

    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    await scriviConBackup({
      tipo:"update", table:"events", payload, matchObj:match,
      contesto:"Modifica turno", ts:new Date().toISOString(),
      eventsPerSheets: nuovoStore.events, calendarsPerSheets: nuovoStore.calendars,
    });

    // 3) Sincronizzo (crea/aggiorna/rimuove) gli eventi "figli" di
    // protrazione, allo stesso modo di saveEvt — solo se l'evento
    // modificato è un turno base e non una protrazione-figlia (nel
    // secondo caso l'aggiornamento è già stato propagato sopra, punto 3bis).
    if(!decodificaMod){
      await sincronizzaEventiProtrazione({
        idEventoBase: formEffettivo.editId, dayKey, calId: editCalId,
        tInBase: tInFinal, tOutBase: tOutFinal,
        protPagFine: formEffettivo.protPagFine||"", protRecFine: formEffettivo.protRecFine||"",
        menoRecIn: formEffettivo.protMenoRecIn||"", menoRecOut: formEffettivo.protMenoRecOut||"",
      });
    }
  }

  async function delEvt(dKey, cId, evtId){
    // Se il turno che sto eliminando ha figli di protrazione agganciati
    // (import_id "protrazione_di_<evtId>_pagamento/recupero"), li elimino
    // a cascata: altrimenti resterebbero orfani nel calendario e nei report.
    const evtiGiorno = store.events?.[dKey]?.[cId]||[];
    const prefissoFigli = `protrazione_di_${evtId}_`;
    const figli = evtiGiorno.filter(e=>(e.importId||"").startsWith(prefissoFigli));

    // Sincronizzazione inversa: se l'evento che sto eliminando È esso
    // stesso una protrazione-figlia (l'utente l'ha cancellata direttamente
    // dal calendario, non svuotando il campo su AUTO), risalgo al turno
    // AUTO padre e pulisco il campo protPagFine/protRecFine corrispondente,
    // altrimenti il padre resterebbe con un riferimento a un orario
    // di protrazione che in calendario non esiste più.
    const evtCorrente = evtiGiorno.find(e=>e.id===evtId);
    const decodifica = decodificaProtrazioneFiglio(evtCorrente?.importId);
    let idEventoBasePulito = null, campoDbDaPulire = null;
    if(decodifica && decodifica.tipo!=="meno_recupero"){
      const { idEventoBase, tipo } = decodifica;
      const campoDaPulire = tipo==="pagamento" ? "protPagFine" : "protRecFine";
      campoDbDaPulire = tipo==="pagamento" ? "prot_pag_fine" : "prot_rec_fine";
      const padreEsiste = evtiGiorno.some(e=>e.id===idEventoBase);
      if(padreEsiste){
        idEventoBasePulito = idEventoBase;
      }
    }

    // 1) SUBITO in locale: pulizia campo sul padre (se serve) + rimozione
    // dell'evento (+ eventuali figli), tutto a partire dallo STESSO stato
    // "prev" in un'unica pipeline, così nessuna delle due modifiche
    // sovrascrive l'altra (bug precedente: due setStore separati, il
    // secondo costruito dalla variabile "store" non aggiornata, annullava
    // silenziosamente la pulizia del campo fatta dal primo).
    setStore(prev=>{
      let ns = prev;
      if(idEventoBasePulito){
        const campoDaPulire = decodifica.tipo==="pagamento" ? "protPagFine" : "protRecFine";
        ns = withEventoAggiornato(ns, dKey, cId, idEventoBasePulito, { [campoDaPulire]: "" });
      }
      ns = withEventoRimosso(ns, dKey, cId, evtId);
      for(const f of figli) ns = withEventoRimosso(ns, dKey, cId, f.id);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      storeRef.current = ns;
      return ns;
    });
    if(idEventoBasePulito){
      await scriviConBackup({
        tipo:"update", table:"events", payload:{ [campoDbDaPulire]: null },
        matchObj:{ id: idEventoBasePulito, user_id: userId },
        contesto:`Pulizia campo protrazione sul turno base`, ts:new Date().toISOString(),
        eventsPerSheets: store.events, calendarsPerSheets: store.calendars,
        opzioni:{ soloLog:true },
      });
    }

    // 1b) Valore locale (non tocca lo stato React, già aggiornato sopra):
    // serve solo come payload per i backup Sheets/Supabase qui sotto.
    let nuovoStore = idEventoBasePulito
      ? withEventoAggiornato(store, dKey, cId, idEventoBasePulito, { [decodifica.tipo==="pagamento"?"protPagFine":"protRecFine"]: "" })
      : store;
    nuovoStore = withEventoRimosso(nuovoStore, dKey, cId, evtId);
    for(const f of figli) nuovoStore = withEventoRimosso(nuovoStore, dKey, cId, f.id);
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    const match = { id: evtId, user_id: userId };
    await scriviConBackup({
      tipo:"delete", table:"events", payload:null, matchObj:match,
      contesto:"Eliminazione turno", ts:new Date().toISOString(),
      eventsPerSheets: nuovoStore.events, calendarsPerSheets: nuovoStore.calendars,
    });
    for(const f of figli){
      await scriviConBackup({
        tipo:"delete", table:"events", payload:null, matchObj:{ id:f.id, user_id:userId },
        contesto:"Eliminazione protrazione figlia", ts:new Date().toISOString(),
        eventsPerSheets: nuovoStore.events, calendarsPerSheets: nuovoStore.calendars,
        opzioni:{ soloLog:true },
      });
    }
  }

  async function delEvtiRotazioneDaData(rotazioneId, fromDateKey, cId, limit=null){
    let query = supabase.from("events").select("id,date_key")
      .eq("rotazione_id", rotazioneId).eq("user_id", userId)
      .gte("date_key", fromDateKey).order("date_key",{ascending:true});
    const { data: rows, error } = await query;
    if(error){ segnalaErroreDb(error, "Eliminazione eventi rotazione da data"); return; }
    if(!rows) return;
    const toDelete = limit ? rows.slice(0, limit) : rows;
    const ids = toDelete.map(r=>r.id);
    if(ids.length===0) return;
    const { error: delErr } = await supabase.from("events").delete().in("id", ids).eq("user_id", userId);
    if(delErr){ segnalaErroreDb(delErr, "Eliminazione eventi rotazione da data"); return; }
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      const idSet = new Set(ids);
      for(const dKey of Object.keys(ns.events||{})){
        if(ns.events[dKey]?.[cId]){
          ns.events[dKey][cId] = ns.events[dKey][cId].filter(e=>!idSet.has(e.id));
        }
      }
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  async function delTutteEvtiRotazione(rotazioneId, cId){
    const { data: rows, error } = await supabase.from("events").select("id")
      .eq("rotazione_id", rotazioneId).eq("user_id", userId);
    if(error){ segnalaErroreDb(error, "Eliminazione eventi rotazione"); return; }
    if(!rows) return;
    const ids = rows.map(r=>r.id);
    if(ids.length===0) return;
    const { error: delErr } = await supabase.from("events").delete().in("id", ids).eq("user_id", userId);
    if(delErr){ segnalaErroreDb(delErr, "Eliminazione eventi rotazione"); return; }
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      const idSet = new Set(ids);
      for(const dKey of Object.keys(ns.events||{})){
        if(ns.events[dKey]?.[cId]){
          ns.events[dKey][cId] = ns.events[dKey][cId].filter(e=>!idSet.has(e.id));
        }
      }
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  async function cancellaTuttiEventiMese(y, m, cId){
    // Cancella tutti gli eventi del mese (y=anno, m=mese 0-based) sul calendario cId
    const mm = String(m+1).padStart(2,"0");
    const ultimoGiorno = new Date(y, m+1, 0).getDate();
    const fromKey = `${y}-${mm}-01`;
    const toKey = `${y}-${mm}-${String(ultimoGiorno).padStart(2,"0")}`;
    const { data: rows, error } = await supabase.from("events").select("id")
      .eq("user_id", userId).eq("calendar_id", cId)
      .gte("date_key", fromKey).lte("date_key", toKey);
    if(error){ segnalaErroreDb(error, "Eliminazione eventi del mese"); return; }
    if(!rows) return;
    const ids = rows.map(r=>r.id);
    if(ids.length===0) return;
    const { error: delErr } = await supabase.from("events").delete().in("id", ids).eq("user_id", userId);
    if(delErr){ segnalaErroreDb(delErr, "Eliminazione eventi del mese"); return; }
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      for(const dKey of Object.keys(ns.events||{})){
        if(dKey>=fromKey && dKey<=toKey && ns.events[dKey]?.[cId]){
          delete ns.events[dKey][cId];
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  function calcMinuti(tIn, tOut){
    const m1=oraInMinuti(tIn), m2=oraInMinuti(tOut);
    if(m1===null||m2===null) return 0;
    let mins=m2-m1;
    if(mins<0) mins+=24*60;
    return mins;
  }
// #endregion

// #region SEZIONE 12: SYNC GOOGLE SHEETS + SUPABASE BACKUP
// ═══════════════════════════════════════════════════════════════
  async function saveToSheets(events, calendars, customUrl=sheetsUrl, customSecret=sheetsSecret, modelliToSave=modelli){
    if(!customUrl) return "⚠️ Sheets non configurato";
    if(!isInitialized.current) return;
    try {
      await fetch("/api/sheets", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ secret: customSecret, action:"save", events, calendars, userId }),
      });
      await fetch("/api/sheets", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ secret: customSecret, action:"save_modelli", modelli: modelliToSave.map(m=>({
          ...m,
          fine: (m.tempo==="6h15"||m.tempo==="6h 15m")&&m.inizio ? calcFine6h15(m.inizio) : (m.tempo==="6h30"||m.tempo==="6h 30m")&&m.inizio ? calcFine6h30(m.inizio) : m.fine||"",
        }))}),
      });
      return "✅ Esportato su Sheets";
    } catch(e){ return "❌ Errore connessione Sheets"; }
  }

  // Wrapper unico per il sync "automatico" dopo un CRUD: prima erano 15 punti
  // diversi nel file, ciascuno con una condizione leggermente diversa
  // (chi controllava solo syncMode, chi solo sheetsUrl, chi entrambi).
  // Il salvataggio esplicito da pulsante ("Esporta su Sheets") continua a
  // chiamare saveToSheets(...) direttamente, senza passare da qui.
  async function syncSeAttivo(events, calendars, modelliOverride=modelli){
    if(syncMode!=='on' || !sheetsUrl) return;
    return saveToSheets(events, calendars, sheetsUrl, sheetsSecret, modelliOverride);
  }

  async function loadFromSheets(customUrl=sheetsUrl, customSecret=sheetsSecret){
    try {
      // Il segreto va nel body (POST), non in query string: la query string
      // può finire nei log del server o in eventuali proxy/CDN intermedi,
      // il body no. Coerente con saveToSheets, che già usa POST+body.
      const res = await fetch(`/api/sheets`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ secret: customSecret, action:"load", userId }),
      });
      return await res.json() || null;
    } catch(e){ return null; }
  }

  async function syncFromSheets(cals=store.calendars, evts=store.events, customUrl=sheetsUrl, customSecret=sheetsSecret, isBackground=false){
    if(!customUrl) return "⚠️ Sincronizzazione non configurata";
    if(isBackground) setBgSyncing(true); else setSyncing(true);
    try {
      const data = await loadFromSheets(customUrl, customSecret);
      if(!data||!data.data) return "❌ Nessun dato valido da Sheets";
      const { error: delEvtsErr } = await dbDelete("events", {user_id:userId}, "Sincronizzazione da Sheets — pulizia eventi esistenti", {soloLog:true});
      if(delEvtsErr){ segnalaErrore("Non sono riuscito a pulire gli eventi esistenti prima di importare da Sheets: l'importazione è stata annullata per evitare duplicati.", "Sincronizzazione da Sheets"); return "❌ Errore durante la sincronizzazione"; }
      const existingNames = cals.map(c=>c.name);
      const newCals = [...cals];
      for(const tabName of (data.tabs||Object.keys(data.data))){
        if(!existingNames.includes(tabName)){
          const dbCal = await addCalendar(tabName, PALETTE[newCals.length%PALETTE.length], newCals.length===0);
          if(dbCal) newCals.push({id:dbCal.id,name:dbCal.name,color:dbCal.color,isMain:dbCal.is_main,shifts:[]});
        }
      }
      const newEvents={};
      const rowsToInsert = [];
      for(const cal of newCals){
        const calData=data.data[cal.name]||{};
        for(const [dateKey,sheetEvts] of Object.entries(calData)){
          for(const e of sheetEvts){
            rowsToInsert.push({
              user_id:userId, calendar_id:cal.id, date_key:dateKey,
              label:e.label||"Evento", color:e.color||cal.color,
              all_day:e.allDay??true, time_in:e.tIn||"", time_out:e.tOut||"",
              place:e.place||"", map_url:e.map||"", note:e.note||"",
              modello_id:e.modelloId||null, collega:e.collega||"", auto:e.auto||"",
            });
          }
        }
      }

      if(rowsToInsert.length > 0) {
        const { data: insertedEvts, error: insertErr } = await supabase.from("events").insert(rowsToInsert).select();
        if(insertErr){
          segnalaErroreDb(insertErr, `Importazione turni (${rowsToInsert.length} eventi)`);
        }
        if(!insertErr && insertedEvts) {
          insertedEvts.forEach(dbEvt => {
            const dK = dbEvt.date_key;
            const cI = dbEvt.calendar_id;
            if(!newEvents[dK]) newEvents[dK]={};
            if(!newEvents[dK][cI]) newEvents[dK][cI]=[];
            newEvents[dK][cI].push({
              id:dbEvt.id, color:dbEvt.color, label:dbEvt.label,
              allDay:dbEvt.all_day, tIn:dbEvt.time_in||"", tOut:dbEvt.time_out||"",
              place:dbEvt.place||"", map:dbEvt.map_url||"", note:dbEvt.note||"",
              modelloId:dbEvt.modello_id||null, collega:dbEvt.collega||"", auto:dbEvt.auto||"",
            });
          });
        }
      }
      setStore(s=>({...s, calendars:newCals, events:newEvents}));
      if(newCals.length>0&&!calId) setCalId(newCals[0].id);
      try {
        const resMod = await fetch(`${customUrl}?secret=${customSecret}&action=load_modelli`);
        const dataMod = await resMod.json();
        if(dataMod.modelli&&dataMod.modelli.length>0){
          const { error: delModErr } = await dbDelete("modelli", {user_id:userId}, "Sincronizzazione da Sheets — pulizia modelli esistenti", {soloLog:true});
          if(delModErr){ segnalaErrore("Non sono riuscito a pulire i modelli esistenti prima di importare da Sheets: l'importazione dei modelli è stata saltata.", "Sincronizzazione da Sheets"); return "✅ Turni importati (modelli non aggiornati, vedi Log)"; }
          const newModelli=[];
          for(const m of dataMod.modelli){
            const coloreEff=m.tempo==="h24"?"#64748b":colByTime(m.inizio);
            const {data:res2}=await supabase.from("modelli").insert({
              user_id:userId, titolo:m.titolo.toUpperCase(), tempo:m.tempo,
              inizio:m.inizio||null, fine:m.fine||null,
              colore:coloreEff, sort_order:newModelli.length,
            }).select().maybeSingle();
            if(res2) newModelli.push({id:res2.id,titolo:res2.titolo,tempo:res2.tempo,
              inizio:res2.inizio||"",fine:res2.fine||"",colore:coloreEff,
              coloreCustom:null,posizione:"",sortOrder:res2.sort_order||0});
          }
          setModelli(newModelli);
        }
      } catch(e){ segnalaErrore(e, "Import modelli da Google Sheets"); }
      return "✅ Importazione completata";
    } catch(e){
      segnalaErrore(e, "Sincronizzazione con Google Sheets");
      return "❌ Errore sincronizzazione Sheets";
    } finally {
      if(isBackground) setBgSyncing(false); else setSyncing(false);
    }
  }

  async function handleSave(){
    setSyncing(true); setSyncMsg("");
    const msg = await saveToSheets(store.events, store.calendars);
    setSyncMsg(msg); setSyncing(false);
  }
  async function handleLoad(){
    setSyncMsg("");
    const msg = await syncFromSheets(store.calendars, store.events, sheetsUrl, sheetsSecret, false);
    setSyncMsg(msg);
  }
  async function handleSaveSheetsConfig(){
    if(!userId) return;
    setSyncing(true); setSyncMsg("");
    try {
      const {error} = await supabase.from("user_settings").upsert({
        user_id:userId, sheets_url:sheetsUrl.trim(), sheets_secret:sheetsSecret.trim(),
        updated_at:new Date().toISOString(),
      });
      if(error) throw error;
      setSyncMsg("✅ Impostazioni Google Sheets salvate");
    } catch(err){ setSyncMsg("❌ Errore salvataggio: "+err.message); }
    finally { setSyncing(false); }
  }

  useEffect(()=>{
    if(screen==="settings" && session?.user?.email==='tesonemgs5@gmail.com'){
      (async()=>{
        try {
          const {data,error}=await supabase.rpc('get_app_stats');
          if(error){ segnalaErrore(error, "Caricamento statistiche amministratore"); }
          if(!error&&data&&data.length>0) setStats(data[0]);
        } catch(e){ segnalaErrore(e, "Caricamento statistiche amministratore"); }
      })();
    }
  },[screen, session]);

  async function handleViewDbData(){
    setShowDbModal(true); setDbRawData(null);
    try {
      const {data:cals}=await supabase.from("calendars").select("*").eq("user_id",userId).order("created_at");
      const {data:evts}=await supabase.from("events").select("*").eq("user_id",userId).order("date_key",{ascending:false});
      setDbCalsCount(cals?.length||0);
      setDbEvtsCount(evts?.length||0);
      setDbRawData({calendars:cals||[],events:evts||[]});
    } catch(e){ segnalaErrore(e, "Visualizzazione dati database (pannello admin)"); }
  }

  async function buildBackupPayload(){
    const {data:cals} = await supabase.from("calendars").select("*").eq("user_id",userId);
    const {data:evts} = await supabase.from("events").select("*").eq("user_id",userId);
    const {data:mods} = await supabase.from("modelli").select("*").eq("user_id",userId);
    const {data:rots} = await supabase.from("rotazioni").select("*").eq("user_id",userId);
    const {data:sett} = await supabase.from("user_settings").select("*").eq("user_id",userId).maybeSingle();
    return {
      exported_at: new Date().toISOString(),
      calendars: cals||[], events: evts||[], modelli: mods||[],
      rotazioni: rots||[], user_settings: sett||null,
    };
  }

  async function handleExportSupabase(){
    setSyncMsg("⏳ Esportazione in corso...");
    try {
      const backup = await buildBackupPayload();
      const {error:insErr} = await supabase.from("backups").insert({
        user_id:userId, data:backup,
      });
      if(insErr) throw insErr;
      setSyncMsg("✅ Backup salvato su Supabase");
    } catch(e){ segnalaErrore(e, "Esportazione backup su Supabase"); setSyncMsg("❌ Errore durante l'esportazione: "+e.message); }
  }

  async function handleOpenImportSupabase(){
    setSyncMsg("⏳ Carico elenco backup...");
    try {
      const {data, error} = await supabase.from("backups")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", {ascending:false})
        .limit(20);
      if(error) throw error;
      setBackupsList(data||[]);
      setShowBackupsModal(true);
      setSyncMsg("");
    } catch(e){ segnalaErrore(e, "Caricamento elenco backup"); setSyncMsg("❌ Errore nel caricare i backup: "+e.message); }
  }

  async function handleRestoreBackup(backupId){
    if(!window.confirm("Questo SOVRASCRIVERÀ tutti i dati attuali con quelli del backup selezionato. Continuare?")) return;
    setSyncMsg("⏳ Importazione in corso...");
    setShowBackupsModal(false);
    try {
      const {data:row, error} = await supabase.from("backups").select("data").eq("id", backupId).eq("user_id", userId).maybeSingle();
      if(error) throw error;
      if(!row?.data) throw new Error("Backup non trovato");
      const backup = row.data;

      // Ogni fallimento qui sotto viene contato (prima erano ignorati in
      // silenzio): se qualcosa non si cancella o non si inserisce, l'utente
      // lo sa a fine ripristino invece di scoprire dati incoerenti dopo.
      let erroriRiscontrati = 0;
      const contaErrore = ({error}) => { if(error) erroriRiscontrati++; };

      contaErrore(await dbDelete("events", {user_id:userId}, "Ripristino backup — pulizia eventi esistenti", {soloLog:true}));
      contaErrore(await dbDelete("calendars", {user_id:userId}, "Ripristino backup — pulizia calendari esistenti", {soloLog:true}));
      contaErrore(await dbDelete("modelli", {user_id:userId}, "Ripristino backup — pulizia modelli esistenti", {soloLog:true}));
      contaErrore(await dbDelete("rotazioni", {user_id:userId}, "Ripristino backup — pulizia rotazioni esistenti", {soloLog:true}));

      const calIdMap = {};
      for(const c of (backup.calendars||[])){
        const {data, error:errC} = await dbInsert("calendars", {
          user_id:userId, name:c.name, color:c.color, is_main:c.is_main, shifts:c.shifts||[],
        }, `Ripristino backup — calendario "${c.name}"`, {soloLog:true});
        if(errC) erroriRiscontrati++;
        if(data?.[0]) calIdMap[c.id] = data[0].id;
      }
      const modIdMap = {};
      for(const m of (backup.modelli||[])){
        const {data, error:errM} = await dbInsert("modelli", {
          user_id:userId, titolo:m.titolo, tempo:m.tempo, inizio:m.inizio, fine:m.fine,
          colore:m.colore, colore_custom:m.colore_custom, posizione:m.posizione||"", // flag "manuale"/vuoto, non un id: nessun rimapping necessario
          sort_order:m.sort_order, calendar_id: calIdMap[m.calendar_id]||null,
        }, `Ripristino backup — modello "${m.titolo}"`, {soloLog:true});
        if(errM) erroriRiscontrati++;
        if(data?.[0]) modIdMap[m.id] = data[0].id;
      }
      for(const e of (backup.events||[])){
        const {error:errE} = await dbInsert("events", {
          user_id:userId, calendar_id: calIdMap[e.calendar_id]||e.calendar_id,
          date_key:e.date_key, label:e.label, color:e.color, all_day:e.all_day,
          time_in:e.time_in, time_out:e.time_out, place:e.place, map_url:e.map_url,
          note:e.note, modello_id: modIdMap[e.modello_id]||null,
          collega:e.collega, auto:e.auto,
        }, `Ripristino backup — evento "${e.label}" (${e.date_key})`, {soloLog:true});
        if(errE) erroriRiscontrati++;
      }
      for(const r of (backup.rotazioni||[])){
        const {error:errR} = await dbInsert("rotazioni", {
          user_id:userId, tipo:r.tipo, titolo:r.titolo, data_inizio:r.data_inizio,
          n_settimane:r.n_settimane,
          modello_lavoro_id: modIdMap[r.modello_lavoro_id]||null,
          modello_nl_id: modIdMap[r.modello_nl_id]||null,
          modello_rs_id: modIdMap[r.modello_rs_id]||null,
          griglia:r.griglia||{},
        }, `Ripristino backup — rotazione "${r.titolo}"`, {soloLog:true});
        if(errR) erroriRiscontrati++;
      }
      if(erroriRiscontrati>0){
        segnalaErrore(`${erroriRiscontrati} elementi non sono stati ripristinati correttamente (dettaglio nel Log). Il resto del backup è stato importato.`, "Ripristino backup");
      }
      setSyncMsg("✅ Importazione completata — ricarico l'app...");
      setTimeout(()=>window.location.reload(), 1500);
    } catch(e){ segnalaErrore(e, "Ripristino backup (sovrascrittura dati)"); setSyncMsg("❌ Errore durante l'importazione: "+e.message); }
  }

  async function handleLogout(){ await supabase.auth.signOut(); }

  // ─── Scheletro condiviso per gli script di manutenzione "una tantum" ───
  // Entrambe le normalizzazioni (modelli e eventi) seguono sempre la stessa
  // sequenza: calcola cosa andrebbe cambiato -> se dryRun, mostra l'anteprima
  // e si ferma -> altrimenti scrive su Supabase riga per riga, contando
  // successi/errori -> stampa il messaggio finale. Questa sequenza è scritta
  // UNA sola volta qui: se in futuro cambia (es. il formato dei log, o si
  // vuole scrivere in batch invece che riga per riga), la si cambia in un
  // solo posto e sia normalizzaModelliTempo che normalizzaEventiTempo la
  // seguono automaticamente — non esiste una seconda copia da dimenticare.
  //
  // Parametri:
  //   nomeOperazione: stringa per i messaggi di log (es. "modelli", "eventi")
  //   trovaDaSistemare: () => [{...}] — calcola l'elenco delle righe da
  //     cambiare, ciascuna deve avere almeno {id} più i campi target
  //   formatoTabella: (item) => oggetto per console.table (colonne attuale/nuovo)
  //   applicaSuDb: (item) => Promise — esegue l'update Supabase per un item
  //   applicaSuStatoLocale: (itemsSistemati) => void — aggiorna lo state React
  //     (facoltativo: se assente, serve un refresh manuale per vedere i dati)
  async function eseguiNormalizzazione({ nomeOperazione, trovaDaSistemare, formatoTabella, applicaSuDb, applicaSuStatoLocale, dryRun }){
    const daSistemare = trovaDaSistemare();
    if(daSistemare.length===0){ console.log(`✅ Nessun elemento (${nomeOperazione}) da normalizzare, sono già tutti in formato standard.`); return; }
    console.table(daSistemare.map(formatoTabella));
    if(dryRun){
      console.log(`ℹ️ Anteprima (${nomeOperazione}): ${daSistemare.length} elementi verrebbero normalizzati. Richiama con {dryRun:false} per applicare davvero su Supabase.`);
      return daSistemare;
    }
    let ok=0, ko=0;
    const sistematiConSuccesso = [];
    for(const item of daSistemare){
      try{
        const { error } = await applicaSuDb(item);
        // Ogni singolo fallimento va comunque nel Log (per tracciare quale
        // riga esatta non è passata), ma qui NON si accoda un modale per
        // ognuno: in un ciclo con più righe sarebbe una sequenza di N popup
        // da chiudere uno a uno. Un solo alert riassuntivo compare alla fine.
        if(error){ segnalaErroreSoloLog(error, `Normalizzazione ${nomeOperazione} — elemento "${item.id}"`); ko++; }
        else { ok++; sistematiConSuccesso.push(item); }
      } catch(err){ segnalaErroreSoloLog(err, `Normalizzazione ${nomeOperazione} — elemento "${item.id}"`); ko++; }
    }
    console.log(`✅ Normalizzati ${ok} elementi (${nomeOperazione}) su Supabase${ko>0?`, ${ko} da controllare a mano`:""}. Ricarica la pagina per vedere i dati aggiornati.`);
    if(ko>0) segnalaErrore(`${ko} elementi su ${daSistemare.length} non sono stati normalizzati (dettaglio nel Log). ${ok} completati con successo.`, `Normalizzazione ${nomeOperazione}`);
    if(applicaSuStatoLocale) applicaSuStatoLocale(sistematiConSuccesso);
  }

  // ─── Manutenzione: standardizza tempo/inizio/fine di tutti i modelli ───
  // Riscrive su Supabase, per ogni modello con formato "sporco", i campi:
  //   - tempo: "6h15" quando la durata è 6h15/6h30 (qualunque fosse la scrittura originale)
  //   - inizio: sempre in "HH:MM" pulito (es. "6.15" -> "06:15")
  //   - fine: ricalcolata da inizio via calcFine6h15 per i modelli 6h15/6h30,
  //           altrimenti solo normalizzata in "HH:MM" per i modelli personalizzati
  // Va lanciata una tantum (es. da console: window.normalizzaModelliTempo())
  // dopo aver verificato in anteprima l'elenco che stampa.
  async function normalizzaModelliTempo({dryRun=true}={}){
    if(!userId){ segnalaErrore("Utente non loggato", "Normalizzazione modelli (manutenzione)"); return; }
    function calcolaTarget(m){
      if(m.tempo==="h24") return null; // H24 non ha inizio/fine, niente da normalizzare
      const inizioNorm=normalizzaOraHHMM(m.inizio);
      const mins=minutiTurnoModello(m);
      const isDefault = mins===375 || mins===390;
      const target = isDefault
        ? { tempo:"6h15", inizio:inizioNorm, fine: inizioNorm?calcFine6h15(inizioNorm):(m.fine||"") }
        : { tempo:"personalizzato", inizio:inizioNorm, fine: normalizzaOraHHMM(m.fine) };
      const cambiato = target.tempo!==m.tempo || target.inizio!==(m.inizio||"") || target.fine!==(m.fine||"");
      return cambiato ? target : null;
    }
    return eseguiNormalizzazione({
      nomeOperazione: "modelli",
      dryRun,
      trovaDaSistemare: () => (modelli||[])
        .map(m=>({ id:m.id, m, target: calcolaTarget(m) }))
        .filter(x=>x.target!==null),
      formatoTabella: ({m,target}) => ({
        id:m.id, titolo:m.titolo,
        tempo_attuale:m.tempo, tempo_nuovo:target.tempo,
        inizio_attuale:m.inizio, inizio_nuovo:target.inizio,
        fine_attuale:m.fine, fine_nuovo:target.fine,
      }),
      applicaSuDb: async ({m,target}) => {
        // Caso speciale: durata 6h15/6h30 ma nessun orario di inizio leggibile
        // -> non scrivibile in automatico, va segnalato come errore invece di
        // essere silenziosamente scartato (comportamento invariato rispetto
        // a prima, solo ora passa dallo stesso canale ok/ko dello scheletro).
        if(target.tempo==="6h15" && !target.inizio){
          return { error: { message:`Modello "${m.titolo}" (${m.id}) ha durata 6h15/6h30 ma nessun orario di inizio leggibile: sistemalo a mano.` } };
        }
        return await supabase.from("modelli")
          .update({ tempo:target.tempo, inizio:target.inizio, fine:target.fine })
          .eq("id", m.id).eq("user_id", userId);
      },
      applicaSuStatoLocale: (sistemati) => {
        setModelli(prev=>prev.map(m=>{
          const hit=sistemati.find(d=>d.m.id===m.id);
          return hit ? {...m, ...hit.target} : m;
        }));
      },
    });
  }
  // Non più esposta su window: era uno script di migrazione una tantum,
  // già eseguito. La funzione resta definita sopra se dovesse servire ancora
  // (richiamabile riattivando temporaneamente l'useEffect qui sotto),
  // ma non è più raggiungibile dalla console di chiunque apra l'app pubblica.
  // useEffect(()=>{
  //   if(typeof window!=="undefined") window.normalizzaModelliTempo = normalizzaModelliTempo;
  // }, [modelli, userId]);

  // ─── Manutenzione: sistema eventi storici con orario di uscita mancante ───
  // Prima del fix, un evento con modello 6h15/6h30 (o INGRESSO digitato a mano)
  // poteva salvare time_out vuoto pur mostrandolo calcolato in UI.
  // Per ogni evento con time_in valorizzato e time_out vuoto:
  //   - se ha un modello collegato con tempo "6h15" -> fine = calcFine6h15(time_in)
  //   - se ha un modello collegato "personalizzato" con fine propria -> fine = mod.fine
  //   - altrimenti (nessun modello o non determinabile) -> calcFine6h15(time_in) come fallback standard
  // Va lanciata una tantum da console: window.normalizzaEventiTempo({dryRun:false})
  async function normalizzaEventiTempo({dryRun=true}={}){
    if(!userId){ segnalaErrore("Utente non loggato", "Normalizzazione eventi (manutenzione)"); return; }
    const { data: evts, error: fetchErr } = await supabase.from("events")
      .select("id,date_key,time_in,time_out,modello_id,label").eq("user_id", userId);
    if(fetchErr){ segnalaErrore(fetchErr, "Normalizzazione eventi — lettura dati"); return; }
    // Il fetch iniziale è asincrono e serve prima di poter calcolare
    // daSistemare: lo scheletro condiviso assume la lista già pronta, quindi
    // il fetch resta qui fuori (unica differenza reale tra le due periferiche)
    // e si passa allo scheletro solo il calcolo che segue.
    const daSistemare = (evts||[])
      .filter(e=>e.time_in && !e.time_out)
      .map(e=>{
        const mod = modelli.find(m=>m.id===e.modello_id);
        let fineCalcolata = "";
        if(mod && mod.tempo==="6h15") fineCalcolata = calcFine6h15(e.time_in);
        else if(mod && mod.fine) fineCalcolata = normalizzaOraHHMM(mod.fine);
        else fineCalcolata = calcFine6h15(e.time_in); // fallback standard 6h15
        return { id:e.id, e, fineCalcolata };
      })
      .filter(x=>x.fineCalcolata);
    return eseguiNormalizzazione({
      nomeOperazione: "eventi",
      dryRun,
      trovaDaSistemare: () => daSistemare,
      formatoTabella: ({e,fineCalcolata}) => ({
        id:e.id, data:e.date_key, label:e.label,
        time_in:e.time_in, time_out_attuale:e.time_out||"(vuoto)", time_out_nuovo:fineCalcolata,
      }),
      applicaSuDb: async ({e,fineCalcolata}) =>
        await supabase.from("events").update({ time_out: fineCalcolata }).eq("id", e.id).eq("user_id", userId),
      // Nessun applicaSuStatoLocale qui: comportamento invariato rispetto a
      // prima (lo stato locale degli eventi non veniva aggiornato in memoria,
      // serviva ricaricare la pagina — lo dice già il messaggio finale).
    });
  }
  // Stesso discorso: script di migrazione una tantum, non più esposto su window.
  // useEffect(()=>{
  //   if(typeof window!=="undefined") window.normalizzaEventiTempo = normalizzaEventiTempo;
  // }, [modelli, userId]);
// #endregion

// #region SEZIONE 13: CRUD MODELLI + COLORI
// ═══════════════════════════════════════════════════════════════
// Memoizzato: prima veniva ricalcolato (sort completo) ad ogni singolo
// render dell'app, anche quando i modelli non erano cambiati.
// Flag salvato nel campo "posizione" (riusato come semplice stringa, niente
// nuove colonne Supabase): "manuale" se il modello è stato spostato almeno
// una volta dall'utente (freccia o drag), stringa vuota se è ancora nella
// lista automatica per orario. Sostituisce il vecchio sistema di riferimenti
// a catena (un modello agganciato "sopra" un altro id), che era la causa
// architetturale dell'instabilità: un riferimento relativo può creare cicli,
// asimmetrie tra "su" e "giù", casi limite in testa/coda alla lista. Con un
// flag + una posizione numerica scoped per calendario, ogni operazione è un
// semplice shift di interi, sempre reversibile, senza casi speciali nascosti.
const FLAG_MANUALE = "manuale";

// ── Calcola l'ordine dei modelli PER UN DATO SOTTOINSIEME (già filtrato per
// calendario dal chiamante — mai calcolato sull'insieme completo di più
// calendari insieme, altrimenti un modello potrebbe confrontarsi con
// "vicini" che nella vista reale non esistono).
//
// Architettura a 3 fasi, come da richiesta esplicita:
// 1) Lista AUTOMATICA per orario: tutti i modelli con flag!==FLAG_MANUALE,
//    ordinati per orario di inizio (h24/senza orario sempre in cima).
// 2) Lista MANUALE/libera: tutti i modelli con flag===FLAG_MANUALE, ordinati
//    semplicemente per sort_order crescente — un numero intero, niente
//    riferimenti relativi tra modelli.
// 3) Le due liste si "intrecciano" leggendo sort_order come UNA POSIZIONE
//    ASSOLUTA CONDIVISA: ogni modello (automatico o manuale) occupa lo slot
//    sort_order nell'elenco finale. Un nuovo modello automatico si inserisce
//    calcolando il suo sort_order in base all'orario rispetto agli altri
//    automatici, e chi viene dopo (automatico O manuale) scala di uno.
function calcolaOrdineModelli(sottoinsieme){
  // sort_order è semplicemente la posizione finale: ordino tutto insieme,
  // un solo criterio, nessuna eccezione — la stabilità viene proprio dal
  // non avere più casi speciali da conciliare tra loro.
  return [...sottoinsieme].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
}

// Elenco completo (tutti i calendari insieme), usato dove serve una vista
// globale — es. il ripristino da backup, o quando calId===null ("tutti").
const modelliOrdinati = useMemo(()=>calcolaOrdineModelli(modelli), [modelli]);

const importsRecenti = useMemo(()=>{
  const gruppi = {};
  for(const [dateKey, calMap] of Object.entries(store.events||{})){
    const lista = calMap?.[calId] || [];
    for(const ev of lista){
      if(!ev.importId) continue;
      if(!gruppi[ev.importId]) gruppi[ev.importId] = { importId: ev.importId, count:0, minDate:dateKey, maxDate:dateKey };
      gruppi[ev.importId].count++;
      if(dateKey < gruppi[ev.importId].minDate) gruppi[ev.importId].minDate = dateKey;
      if(dateKey > gruppi[ev.importId].maxDate) gruppi[ev.importId].maxDate = dateKey;
    }
  }
  return Object.values(gruppi).sort((a,b)=> (b.importId||"").localeCompare(a.importId||""));
}, [store.events, calId]);


  // Pinna un modello: lo aggancia "sopra" il modello che si trova alla
  // posizione newIdx nell'elenco visivo corrente (già senza il modello
  // stesso). Se newIdx è oltre la fine della lista (va portato in fondo),
  // lo spinna senza riferimento (torna automatico, va in fondo per orario
  // di default 99999 se non ha inizio, altrimenti resta comunque ultimo tra
  // i pari-orario) — nel nostro caso pratico c'è sempre un vicino di sotto
  // perché non permettiamo di superare i confini della lista.
  // ── pinnaSoprapPuro: funzione PURA (nessuna lettura di state esterno, nessun
  // side-effect) che calcola il nuovo elenco modelli dato lo stato attuale
  // (prev). Prima questa logica leggeva "modelli" (lo state catturato al
  // momento della creazione della funzione) invece di "prev": con click
  // ravvicinati sulle frecce, la seconda chiamata poteva ancora vedere lo
  // stato PRIMA del primo spostamento, calcolando sortOrder e controllo
  // anti-ciclo su dati superati — causa architetturale dei blocchi e salti
  // imprevedibili. Ora tutto il calcolo avviene sullo stato più recente,
  // dentro un'unica operazione atomica di setModelli.
  // ── Sottoinsieme dei modelli appartenenti a un dato calendario (o tutti,
  // se calIdFiltro è null). Sempre calcolato da "prev" (lo stato più
  // recente), mai da uno snapshot esterno del render, per evitare le
  // desincronizzazioni con click ravvicinati viste nell'architettura precedente.
  function modelliDelCalendario(prev, calIdFiltro){
    if(calIdFiltro==null) return prev;
    return prev.filter(m=>(m.calendarId||mainCalId)===calIdFiltro);
  }

  // ── Sposta un modello di UNA posizione (freccia ▲▼) all'interno del suo
  // calendario. Operazione: scambio diretto del sort_order con il vicino
  // immediato nella direzione scelta — un semplice swap fra due interi,
  // sempre reversibile e senza casi limite nascosti (a differenza del vecchio
  // sistema a riferimenti relativi, che poteva creare cicli e asimmetrie tra
  // "su" e "giù"). Il modello spostato viene marcato FLAG_MANUALE: da questo
  // momento appartiene alla lista libera e non torna più a riordinarsi da
  // solo per orario.
  // Riassegna sort_order 0,10,20... a un sottoinsieme già riordinato,
  // aggiornando solo i modelli coinvolti sull'elenco completo "prev".
  // idsManuali: quali di questi modelli diventano FLAG_MANUALE (gli altri
  // vengono solo rinumerati, restando automatici se non toccati direttamente).
  // Funzione condivisa da spostaModelloPuro (frecce) e trascinaModelloPuro
  // (drag & drop): stessa identica logica di rinumerazione in entrambi i casi.
  function rinumeraSottoinsieme(prev, riordinato, idsManuali){
    const nuoviValori = new Map(riordinato.map((m,i)=>[m.id, i*10]));
    return prev.map(m=>{
      if(!nuoviValori.has(m.id)) return m;
      const nuovoSort = nuoviValori.get(m.id);
      const diventaManuale = idsManuali.has(m.id);
      return {...m, sortOrder:nuovoSort, posizione: diventaManuale ? FLAG_MANUALE : m.posizione};
    });
  }

  function spostaModelloPuro(prev, id, dir, calIdFiltro){
    const sottoinsieme = calcolaOrdineModelli(modelliDelCalendario(prev, calIdFiltro));
    const idx = sottoinsieme.findIndex(m=>m.id===id);
    if(idx===-1) return prev;
    const vicinoIdx = dir==="up" ? idx-1 : idx+1;
    if(vicinoIdx<0 || vicinoIdx>=sottoinsieme.length) return prev; // già al limite, nessun movimento
    // Scambio le POSIZIONI nell'array ordinato (non i valori di sortOrder:
    // se due o più modelli del sottoinsieme condividessero già lo stesso
    // sortOrder — es. modelli automatici mai "toccati" prima, o dati
    // storici da uno schema precedente — uno swap puntuale dei soli due
    // valori coinvolti può lasciare duplicati residui altrove nella lista.
    // Con duplicati, l'ordine risulta corretto solo finché resta in
    // memoria: dopo un refresh, la query dal server (senza ORDER BY
    // secondario) può restituire le righe pari-valore in un ordine diverso,
    // facendo "saltare" il modello in una posizione inattesa. Rinumerando
    // l'intero sottoinsieme con passo fisso ad ogni spostamento, come già
    // fa trascinaModelloPuro, eliminiamo qui i duplicati alla fonte invece
    // di limitarci a scambiare due numeri potenzialmente ambigui.
    const riordinato = [...sottoinsieme];
    [riordinato[idx], riordinato[vicinoIdx]] = [riordinato[vicinoIdx], riordinato[idx]];
    // Solo i due modelli effettivamente spostati dall'utente diventano
    // "manuali": gli altri vengono solo rinumerati (stesso ordine relativo)
    // per restare univoci, senza uscire dalla lista automatica per orario
    // se non sono mai stati toccati direttamente.
    const idsManuali = new Set([sottoinsieme[idx].id, sottoinsieme[vicinoIdx].id]);
    return rinumeraSottoinsieme(prev, riordinato, idsManuali);
  }

  // ── Trascina un modello (drag & drop) fino alla posizione esatta di
  // dstId, all'interno dello stesso calendario. Operazione: rimuovo il
  // modello dalla sua posizione, lo reinserisco nell'indice di destinazione,
  // e riassegno sort_order 0,1,2... a tutto il sottoinsieme in ordine —
  // uno shift completo ma su un insieme piccolo (i modelli di un calendario),
  // quindi economico, e soprattutto sempre corretto per costruzione: non
  // c'è modo che questo produca cicli o incoerenze, perché non uso mai
  // riferimenti tra modelli, solo una rinumerazione sequenziale.
  function trascinaModelloPuro(prev, srcId, dstId, calIdFiltro){
    if(!srcId || !dstId || srcId===dstId){
      return prev;
    }
    const sottoinsiemeIds = new Set(modelliDelCalendario(prev, calIdFiltro).map(m=>m.id));
    if(!sottoinsiemeIds.has(srcId) || !sottoinsiemeIds.has(dstId)){
      return prev;
    }
    const ordinato = calcolaOrdineModelli(modelliDelCalendario(prev, calIdFiltro));
    const srcIdx = ordinato.findIndex(m=>m.id===srcId);
    const dstIdx = ordinato.findIndex(m=>m.id===dstId);
    if(srcIdx===-1 || dstIdx===-1){
      return prev;
    }
    const riordinato = [...ordinato];
    const [tolto] = riordinato.splice(srcIdx,1);
    riordinato.splice(dstIdx,0,tolto);
    // Rinumerazione sequenziale: tutti i modelli toccati da un drag esplicito
    // diventano manuali (comportamento invariato rispetto a prima).
    const idsManuali = new Set(riordinato.map(m=>m.id));
    return rinumeraSottoinsieme(prev, riordinato, idsManuali);
  }

  // Salva su Supabase i modelli effettivamente cambiati (confronto tra stato
  // precedente e nuovo), scoperti passando entrambi gli elenchi.
  async function salvaModifichePosizioni(prevElenco, nuovoElenco){
    const prevById = new Map(prevElenco.map(m=>[m.id,m]));
    const daSalvare = nuovoElenco.filter(m=>{
      const prima = prevById.get(m.id);
      return !prima || prima.sortOrder!==m.sortOrder || prima.posizione!==m.posizione;
    });
    let primoErrore = null;
    let bloccatoDaPolicy = false;
    for(const m of daSalvare){
      // .select() dopo l'update: se Supabase risponde error:null ma restituisce
      // un array VUOTO, significa che l'update ha toccato zero righe pur senza
      // segnalare un errore esplicito — il sintomo tipico di una riga esclusa
      // da una policy RLS di UPDATE (o USING/WITH CHECK troppo restrittiva).
      // In quel caso l'ordine sembra salvato lato client, ma il server non ha
      // scritto nulla: al refresh torna quello vecchio. Senza questo controllo
      // il caso passava inosservato perché `error` da solo non lo rileva.
      const { data, error } = await supabase.from("modelli")
        .update({sort_order:m.sortOrder, posizione:m.posizione||""})
        .eq("id",m.id).eq("user_id",userId)
        .select();
      if(error && !primoErrore) primoErrore = error;
      else if(!error && (!data || data.length===0)) bloccatoDaPolicy = true;
    }
    if(primoErrore){
      // Il salvataggio su Supabase è fallito: lo stato locale mostra il nuovo
      // ordine, ma al prossimo caricamento dati tornerebbe quello vecchio
      // (sort_order non aggiornato sul server). Avviso subito invece di
      // lasciare che l'utente scopra il problema solo dopo un refresh.
      segnalaErroreDb(primoErrore, "Salvataggio posizione modello");
    } else if(bloccatoDaPolicy){
      segnalaErroreDb(
        {message:"nessuna riga aggiornata sul server (probabile permesso RLS mancante sulla tabella modelli)"},
        "Salvataggio posizione modello"
      );
    }
  }

  async function moveH24(id, dir, calIdFiltro){
    // Tutto il calcolo avviene dentro il callback funzionale di setModelli,
    // sempre sullo stato più recente anche con click ravvicinati.
    let prevSnapshot = null, nuovoElenco = null;
    setModelli(prev=>{
      prevSnapshot = prev;
      nuovoElenco = spostaModelloPuro(prev, id, dir, calIdFiltro);
      return nuovoElenco;
    });
    if(prevSnapshot && nuovoElenco) await salvaModifichePosizioni(prevSnapshot, nuovoElenco);
  }

  async function reorderModelli(srcId, dstId, calIdFiltro){
    let prevSnapshot = null, nuovoElenco = null;
    setModelli(prev=>{
      prevSnapshot = prev;
      nuovoElenco = trascinaModelloPuro(prev, srcId, dstId, calIdFiltro);
      return nuovoElenco;
    });
    if(prevSnapshot && nuovoElenco){
      await salvaModifichePosizioni(prevSnapshot, nuovoElenco);
    }
  }


  // ── FIX: quando un modello riceve un coloreCustom, quel colore viene
  // salvato subito nella tabella "colori" (se non già presente), così
  // compare istantaneamente nella tab Modelli -> Colori senza dover
  // ricaricare l'app, e può essere associato ad altri modelli da lì.
  async function ensureColoreRegistrato(hex){
    if(!userId || !hex) return;
    if(coloriExtra.some(c=>c.hex===hex)) return;
    // 1) SUBITO in locale: visibile in Modelli -> Colori all'istante.
    setColoriExtra(prev=>prev.some(c=>c.hex===hex)?prev:[...prev, {hex, label:null}]);
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    scriviConBackup({
      tipo:"insert", table:"colori", payload:{ user_id:userId, hex }, matchObj:null,
      contesto:"Registrazione nuovo colore", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
    });
  }

  // ── Autocomplete: registra un valore nuovo in una delle 5 liste dedicate
  // (titolo, nome_visualizzato, auto, luogo, collega), sincronizzata su
  // Supabase e condivisa fra tutti i dispositivi dell'utente. Chiamata al
  // salvataggio di eventi/modelli — mai durante la digitazione, solo a
  // conferma, per non riempire la lista di valori a metà scritti.
  async function registraValoreAutocomplete(campo, valore){
    if(!userId || !valore) return;
    const v = valore.trim();
    if(!v) return;
    if((autocompleteValori[campo]||[]).includes(v)) return;
    try {
      const { error } = await supabase.from("autocomplete_valori")
        .insert({ user_id:userId, campo, valore:v });
      // Violazione unique (valore già presente per un altro motivo, es. race
      // condition fra dispositivi) non è un errore reale: il valore è comunque lì.
      if(error && error.code!=="23505") { segnalaErroreSoloLog(error.message||String(error), `Registrazione valore autocomplete (${campo})`); return; }
      setAutocompleteValori(prev=>({
        ...prev,
        [campo]: prev[campo].includes(v) ? prev[campo] : [...prev[campo], v].sort((a,b)=>a.localeCompare(b)),
      }));
    } catch(e){ segnalaErroreSoloLog(e?.message||String(e), `Registrazione valore autocomplete (${campo})`); }
  }

  // Registra più valori insieme (es. il campo collega, multi-riga: ogni riga
  // è un nome a sé che deve entrare nella lista come voce indipendente).
  async function registraValoriAutocomplete(campo, valori){
    for(const v of (valori||[])) await registraValoreAutocomplete(campo, v);
  }

  // Rimuove un valore da una lista autocomplete — SOLO dalla lista dei
  // suggerimenti: non tocca in alcun modo eventi o modelli già salvati con
  // quel valore, che restano intatti. Serve a ripulire refusi o valori che
  // non si vogliono più vedere proposti in digitazione.
  async function rimuoviValoreAutocomplete(campo, valore){
    if(!userId) return;
    try {
      const { error } = await supabase.from("autocomplete_valori")
        .delete().eq("user_id", userId).eq("campo", campo).eq("valore", valore);
      if(error){ segnalaErrore(error, `Rimozione valore autocomplete (${campo})`); return; }
      setAutocompleteValori(prev=>({ ...prev, [campo]: prev[campo].filter(v=>v!==valore) }));
    } catch(e){ segnalaErrore(e, `Rimozione valore autocomplete (${campo})`); }
  }

  // Prova a salvare; se Supabase segnala una colonna mancante nello schema,
  // la rimuove dal payload e riprova, finché va a buon fine o non c'è più nulla da togliere.
  // Così l'app resta funzionante anche se lo schema del DB non è ancora aggiornato.
  async function supabaseUpsertConRetry(query, payloadIniziale, isInsert){
    let payload = {...payloadIniziale};
    for(let tentativi=0; tentativi<10; tentativi++){
      const q = isInsert
        ? supabase.from("modelli").insert(payload).select().maybeSingle()
        : query(payload);
      const { data, error } = await q;
      if(!error) return { data, error:null, payloadUsato:payload };
      const match = /Could not find the '([^']+)' column/.exec(error.message||"");
      if(match && match[1] in payload){
        segnalaErroreSoloLog(`Colonna '${match[1]}' assente su Supabase: omessa e riprovato automaticamente. Esegui l'ALTER TABLE per abilitarla stabilmente.`, "Salvataggio modello (schema database)");
        const { [match[1]]: _omessa, ...resto } = payload;
        payload = resto;
        continue;
      }
      return { data:null, error, payloadUsato:payload };
    }
    return { data:null, error:{message:"Troppi tentativi di retry sullo schema"}, payloadUsato:payload };
  }

  async function saveModello(data){
    try{
      return await saveModelloInterno(data);
    }catch(e){
      segnalaErrore(e, "Salvataggio modello (errore imprevisto)");
      return { ok:false, errore:{message:e?.message||String(e)} };
    }
  }
  async function saveModelloInterno(data){
    if(!userId) return;
    const coloreEff=data.coloreCustom||(data.tempo==="h24"?"#64748b":colByTime(data.inizio));
    const targetCalId = data.calendarId||calId||mainCalId;
    // GUARDIA: senza un calendario di destinazione valido, il modello
    // finirebbe "orfano" (calendar_id nullo o sbagliato) e sparirebbe dai
    // filtri per calendario, dando l'impressione di "non essere stato
    // salvato" anche se una riga sul DB in realtà esisteva. Meglio
    // bloccare subito con un errore chiaro che salvare dati incompleti.
    if(!targetCalId){
      const erroreCalendario = { message: "Nessun calendario di destinazione valido: il modello non è stato salvato. Riprova selezionando prima un calendario (es. tocca 'M' e scegli un calendario, oppure apri il form da Modelli)." };
      segnalaErrore(erroreCalendario, "Salvataggio modello (calendario mancante)");
      return { ok:false, errore: erroreCalendario };
    }
    const payload={
      user_id:userId, titolo:(data.titolo||"").toUpperCase(), label:(data.label||"").toUpperCase(), tempo:data.tempo,
      inizio:data.inizio||null, fine:data.fine||null,
      colore:coloreEff, colore_custom:data.coloreCustom||null,
      posizione:data.posizione||null,
      sort_order:data.sortOrder||modelli.length,
      calendar_id: targetCalId,
      categoria: (data.categoria==="primo"||data.categoria==="secondo") ? data.categoria : null,
      categoria_app_auto: (data.categoriaAppAuto==="app"||data.categoriaAppAuto==="auto") ? data.categoriaAppAuto : null,
      categoria_turno_vuoto: !!data.turnoVuoto,
      categoria_app_auto_vuoto: !!data.appAutoVuoto,
    };
    if(data.coloreCustom) ensureColoreRegistrato(data.coloreCustom); // non bloccante: colore già visibile localmente comunque
    if(data.titolo) registraValoreAutocomplete("titolo", (data.titolo||"").toUpperCase());
    if(data.label) registraValoreAutocomplete("nome_visualizzato", (data.label||"").toUpperCase());
    const ts = new Date().toISOString();
    if(data.id){
      // UPDATE: subito in locale (propagazione agli eventi collegati inclusa),
      // poi backup su Supabase+Sheets in parallelo.
      const labelNuova = (data.label||data.titolo||"").toUpperCase();
      const tInNuovo = data.tempo==="h24" ? "" : (data.inizio||"");
      const tOutNuovo = calcFineModello(data);
      const nuovoStore = JSON.parse(JSON.stringify(store));
      Object.keys(nuovoStore.events||{}).forEach(dk=>{
        Object.keys(nuovoStore.events[dk]||{}).forEach(cid=>{
          nuovoStore.events[dk][cid] = (nuovoStore.events[dk][cid]||[]).map(e=>
            e.modelloId===data.id
              ? {...e, label:labelNuova, color:coloreEff, tIn:tInNuovo, tOut:tOutNuovo}
              : e
          );
        });
      });
      const { silenzioso: _silenziosoUpd, ...datiUpdatePuliti } = data;
      let modelloAggiornato;
      const modelliAggiornati = modelli.map(m=>{
        if(m.id!==data.id) return m;
        const nuovo = {...m,...datiUpdatePuliti,colore:coloreEff,calendarId:targetCalId};
        modelloAggiornato = nuovo;
        return nuovo;
      });
      saveToLocalStorage(nuovoStore.events, nuovoStore.calendars, modelliAggiornati);
      setStore(nuovoStore);
      setModelli(modelliAggiornati);

      // Il form aspetta questa funzione per chiudersi (await saveModello in
      // onSave): il locale è già scritto sopra, quindi da qui si ritorna
      // SUBITO. Il backup su Supabase/Sheets parte in background (senza
      // await) — se resta appeso per rete lenta o altro, non blocca più il
      // form sulla schermata di salvataggio senza via d'uscita.
      (async()=>{
        const risModello = await scriviConBackup({
          tipo:"update", table:"modelli", payload, matchObj:{id:data.id, user_id:userId},
          contesto:"Salvataggio modello", ts,
          eventsPerSheets: nuovoStore.events, calendarsPerSheets: nuovoStore.calendars, modelliPerSheets: modelliAggiornati,
          opzioni:{soloLog:true},
        });
        // Propagazione agli eventi collegati: stessa logica, operazione separata
        // (tabella diversa) ma stesso timestamp, così in coda mantiene l'ordine
        // corretto rispetto all'update del modello.
        const risEventi = await scriviConBackup({
          tipo:"update", table:"events",
          payload:{ label: labelNuova, color: coloreEff, time_in: tInNuovo, time_out: tOutNuovo },
          matchObj:{modello_id:data.id, user_id:userId},
          contesto:"Aggiornamento modello — propagazione agli eventi già in calendario", ts,
          eventsPerSheets: nuovoStore.events, calendarsPerSheets: nuovoStore.calendars, modelliPerSheets: modelliAggiornati,
          opzioni:{soloLog:true},
        });
        // Un solo popup per l'intero salvataggio invece di uno per ogni tabella
        // toccata: il locale è comunque già scritto in entrambi i casi, quindi
        // due modali di fila per la stessa azione utente erano solo fastidiosi,
        // non un'informazione in più.
        if(risModello?.errore || risEventi?.errore){
          segnalaErroreDb(risModello?.errore || risEventi?.errore, "Salvataggio modello");
        }
      })();
      return { ok:true, modello: modelloAggiornato };
    } else {
      // INSERT: il calcolo del posizionamento usa solo dati già in memoria
      // (modelli, calcolaOrdineModelli) — non serve aspettare Supabase per
      // deciderlo. L'id è generato qui, subito, come per gli eventi.
      const idLocale = generaIdLocale();
      const calendarioModelli = modelli.filter(m=>(m.calendarId||mainCalId)===targetCalId);
      const tutti = calcolaOrdineModelli(calendarioModelli);

      const rinumerazioniApplicate = []; // {id, nuovoVal} per ogni modello il cui sort_order cambia
      function rinumeraEInserisci(idxInserimento){
        for(let i=0;i<tutti.length;i++){
          const nuovoVal = i>=idxInserimento ? (i+1)*10 : i*10;
          if(nuovoVal!==tutti[i].sortOrder){
            rinumerazioniApplicate.push({id:tutti[i].id, nuovoVal});
          }
        }
        return idxInserimento*10 + 5;
      }

      let nuovoSortOrder;
      if(data.tempo==="h24"){
        // Regola 1: h24 sempre in fondo a tutto, senza eccezioni.
        nuovoSortOrder = rinumeraEInserisci(tutti.length);
      } else {
        const nuovoOrarioKey = data.inizio||"";
        const indiciStessoOrario = [];
        tutti.forEach((m,i)=>{
          const k = m.tempo==="h24" ? "h24" : (m.inizio||"");
          if(k===nuovoOrarioKey) indiciStessoOrario.push(i);
        });
        const coeso = indiciStessoOrario.length>0 &&
          indiciStessoOrario.every((v,i)=>i===0 || v===indiciStessoOrario[i-1]+1);
        if(coeso){
          const ultimoIdx = indiciStessoOrario[indiciStessoOrario.length-1];
          nuovoSortOrder = rinumeraEInserisci(ultimoIdx+1);
        } else {
          const esistonoAltriModelliConOrario = tutti.some(m=>m.tempo!=="h24" && m.inizio);
          nuovoSortOrder = rinumeraEInserisci(tutti.length);
          if(esistonoAltriModelliConOrario){
            const messaggio = indiciStessoOrario.length===0
              ? `Non ci sono altri modelli con l'orario ${nuovoOrarioKey} in questo calendario, quindi non ho un riferimento per posizionarlo: ho messo "${(data.titolo||"il nuovo modello").toUpperCase()}" in fondo alla lista. Spostalo manualmente quando vuoi.`
              : `Ci sono già più modelli con l'orario ${nuovoOrarioKey} ma in posizioni diverse della lista, quindi non posso capire automaticamente dove raggrupparlo: ho messo "${(data.titolo||"il nuovo modello").toUpperCase()}" in fondo alla lista. Spostalo manualmente quando vuoi.`;
            // Le creazioni automatiche (es. modello di protrazione generato
            // al volo da trovaOCreaModelloProtrazione) non devono mai
            // interrompere l'utente con un popup bloccante: non è
            // un'azione manuale sua, quindi finisce solo nei log.
            if(data.silenzioso) segnalaErroreSoloLog(messaggio, "Creazione automatica modello");
            else window.alert(messaggio);
          }
        }
      }

      // Subito in locale: nuovo modello + rinumerazioni già visibili all'istante.
      // (silenzioso è solo un flag interno per sopprimere l'alert sopra:
      // non deve restare agganciato all'oggetto modello salvato in stato.)
      const { silenzioso: _silenzioso, ...datiModelloPuliti } = data;
      const modelloCreato = {...datiModelloPuliti,id:idLocale,colore:coloreEff,sortOrder:nuovoSortOrder,posizione:"",calendarId:targetCalId};
      let modelliAggiornati;
      setModelli(prev=>{
        const rinumerazioniMap = new Map(rinumerazioniApplicate.map(r=>[r.id, r.nuovoVal]));
        const conRinumerazioni = prev.map(m=>
          rinumerazioniMap.has(m.id) ? {...m, sortOrder:rinumerazioniMap.get(m.id)} : m
        );
        const updated=[...conRinumerazioni, modelloCreato];
        modelliAggiornati = updated;
        return updated;
      });
      // FIX: a differenza del ramo UPDATE, qui la cache locale non veniva
      // mai riscritta con il nuovo modello. Risultato: il modello compariva
      // subito in UI (setModelli) e veniva salvato su Supabase, ma al
      // refresh l'app ripartiva da loadFromLocalStorage() leggendo ancora
      // la vecchia cache_modelli senza il nuovo modello, facendolo
      // "sparire" finché Supabase non rispondeva (o restava invisibile se
      // nel frattempo la risposta Supabase veniva considerata "uguale" alla
      // cache). Ora la cache viene aggiornata subito, come per l'update.
      saveToLocalStorage(store.events, store.calendars, modelliAggiornati, calId);

      // Come per l'update: locale già scritto sopra, si ritorna subito e il
      // backup Supabase/Sheets parte in background senza bloccare il form.
      (async()=>{
        await scriviConBackup({
          tipo:"insert", table:"modelli", payload:{...payload, id:idLocale}, matchObj:null,
          contesto:"Creazione modello", ts,
          eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelliAggiornati,
          opzioni:{soloLog:true},
        });
        // Rinumerazioni: stesso timestamp, così restano in ordine in coda
        // rispetto all'insert del nuovo modello se si finisce offline.
        for(const {id,nuovoVal} of rinumerazioniApplicate){
          await scriviConBackup({
            tipo:"update", table:"modelli", payload:{sort_order:nuovoVal}, matchObj:{id, user_id:userId},
            contesto:"Creazione modello — rinumerazione posizioni esistenti", ts,
            eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelliAggiornati,
            opzioni:{soloLog:true},
          });
        }
      })();
      return { ok:true, modello: modelloCreato };
    }
  }

  async function deleteModello(id){
    try{
      return await deleteModelloInterno(id);
    }catch(e){
      segnalaErrore(e, "Eliminazione modello (errore imprevisto)");
      return { ok:false, errore:{message:e?.message||String(e)} };
    }
  }
  async function deleteModelloInterno(id){
    // Con la nuova architettura (posizioni assolute, non riferimenti tra
    // modelli) l'eliminazione è semplice: nessun altro modello punta a
    // questo tramite id, quindi non serve "riparare" nessun riferimento.
    // 1) SUBITO in locale.
    let modelliAggiornati;
    setModelli(prev=>{
      const updated=prev.filter(m=>m.id!==id);
      modelliAggiornati = updated;
      return updated;
    });
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo,
    // CON verifica post-scrittura (vedi scriviConBackup): se la riga
    // risultasse ancora presente su Supabase dopo la cancellazione,
    // viene segnalato invece di considerarsi "andata a buon fine" solo
    // perché la chiamata non ha restituito errore.
    const match = { id, user_id: userId };
    const esito = await scriviConBackup({
      tipo:"delete", table:"modelli", payload:null, matchObj:match,
      contesto:"Eliminazione modello", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelliAggiornati,
    });
    return esito;
  }

  // ── COLORI: aggiunta/rimozione dalla sezione + assegnazione esclusiva ai modelli
  async function addColoreExtra(hex){
    if(!userId || coloriExtra.some(c=>c.hex===hex)) return;
    // 1) SUBITO in locale.
    setColoriExtra(prev=>[...prev, {hex, label:null}]);
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    scriviConBackup({
      tipo:"insert", table:"colori", payload:{ user_id: userId, hex }, matchObj:null,
      contesto:"Aggiunta colore", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
    });
  }

  async function removeColoreExtra(hex){
    if(!userId) return;
    // 1) SUBITO in locale.
    setColoriExtra(prev=>prev.filter(c=>c.hex!==hex));
    const daResettare = modelli.filter(m=>m.coloreCustom===hex);
    for(const m of daResettare){
      await saveModello({...m, coloreCustom:null});
    }
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    scriviConBackup({
      tipo:"delete", table:"colori", payload:null, matchObj:{user_id:userId, hex},
      contesto:"Rimozione colore", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
    });
  }

  // Salva/aggiorna il nome (label) di un colore extra. Prova ad aggiornare la
  // colonna "label" su Supabase; se la colonna non esiste ancora sullo schema
  // (serve un ALTER TABLE colori ADD COLUMN label text;), fallisce in modo
  // silenzioso lato server ma aggiorna comunque lo stato locale, così l'app
  // resta utilizzabile nel frattempo.
  async function updateColoreExtraLabel(hex, label){
    setColoriExtra(prev=>prev.map(c=>c.hex===hex?{...c,label}:c));
    if(!userId) return;
    scriviConBackup({
      tipo:"update", table:"colori", payload:{label}, matchObj:{user_id:userId, hex},
      contesto:"Aggiornamento etichetta colore", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
    });
  }

  // ── FIX: sostituisce l'hex di un colore ovunque sia usato (modelli +
  // registro colori), permettendo di editare liberamente anche i colori
  // delle fasce automatiche (es. #F59E0B "mattina") con la palette
  // condivisa, invece di lasciarli fissi.
  async function replaceColoreEverywhere(oldHex, newHex){
    if(!userId || !newHex || oldHex===newHex) return;
    // 1) SUBITO in locale: modelli + registro colori aggiornati all'istante.
    const daAggiornare = modelli.filter(m=>m.coloreCustom===oldHex);
    let modelliAggiornati;
    setModelli(prev=>{
      modelliAggiornati = prev.map(m=>m.coloreCustom===oldHex?{...m,coloreCustom:newHex,colore:newHex}:m);
      return modelliAggiornati;
    });
    const eraRegistrato = coloriExtra.some(c=>c.hex===oldHex);
    const vecchiaLabel = eraRegistrato ? (coloriExtra.find(c=>c.hex===oldHex)?.label||null) : null;
    if(eraRegistrato){
      setColoriExtra(prev=>[...prev.filter(c=>c.hex!==oldHex), {hex:newHex, label:vecchiaLabel}]);
    }
    // 2) Backup su Supabase (con retry colonna) + Sheets, per ogni modello coinvolto.
    for(const m of daAggiornare){
      scriviConBackup({
        tipo:"update", table:"modelli", payload:{ colore_custom:newHex, colore:newHex }, matchObj:{id:m.id, user_id:userId},
        contesto:`Sostituzione colore su modello "${m.titolo||m.id}"`, ts:new Date().toISOString(),
        eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelliAggiornati,
      });
    }
    if(eraRegistrato){
      scriviConBackup({
        tipo:"delete", table:"colori", payload:null, matchObj:{user_id:userId, hex:oldHex},
        contesto:"Sostituzione colore ovunque (rimozione vecchio)", ts:new Date().toISOString(),
        eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelliAggiornati,
      });
      scriviConBackup({
        tipo:"insert", table:"colori", payload:{ user_id:userId, hex:newHex, label:vecchiaLabel }, matchObj:null,
        contesto:"Sostituzione colore ovunque (inserimento nuovo)", ts:new Date().toISOString(),
        eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelliAggiornati,
      });
    } else {
      await ensureColoreRegistrato(newHex);
    }
    // Se oldHex era il colore di una fascia automatica, aggiorna anche quella
    const fasciaIdx = (store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT).findIndex(f=>f.color===oldHex);
    if(fasciaIdx>-1){
      const nuoveFasce = (store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT).map((f,i)=>i===fasciaIdx?{...f,color:newHex}:f);
      setStore(s=>({...s, fasceAutomatiche:nuoveFasce}));
      saveSettings({fasce_automatiche:nuoveFasce});
    }
    syncSeAttivo(store.events, store.calendars, modelli);
  }

  async function saveRotazione(data){
    if(!userId) return;
    const payload={
      user_id:userId, tipo:data.tipo, titolo:data.titolo||"",
      data_inizio:data.dataInizio||null, n_settimane:data.nSettimane||52,
      modello_lavoro_id:data.modellaLavoroId||null,
      modello_nl_id:data.modelloNLId||null,
      modello_rs_id:data.modelloRSId||null,
      griglia:data.griglia||{},
    };
    if(data.id){
      // 1) SUBITO in locale.
      setRotazioni(prev=>prev.map(r=>r.id===data.id?{...r,...data}:r));
      // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
      await scriviConBackup({
        tipo:"update", table:"rotazioni", payload, matchObj:{id:data.id, user_id:userId},
        contesto:"Salvataggio rotazione", ts:new Date().toISOString(),
        eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
      });
    } else {
      const idLocale = generaIdLocale();
      // 1) SUBITO in locale.
      setRotazioni(prev=>[...prev,{...data,id:idLocale,griglia:{}}]);
      // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
      await scriviConBackup({
        tipo:"insert", table:"rotazioni", payload:{...payload, id:idLocale}, matchObj:null,
        contesto:"Creazione rotazione", ts:new Date().toISOString(),
        eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
      });
    }
  }

  async function deleteRotazione(id){
    // 1) SUBITO in locale.
    setRotazioni(prev=>prev.filter(r=>r.id!==id));
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    const match = {id, user_id:userId};
    await scriviConBackup({
      tipo:"delete", table:"rotazioni", payload:null, matchObj:match,
      contesto:"Eliminazione rotazione", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
    });
  }

  async function updateGrigliaRotazione(rotId, griglia){
    // 1) SUBITO in locale.
    setRotazioni(prev=>prev.map(r=>r.id===rotId?{...r,griglia}:r));
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    const match = {id:rotId, user_id:userId};
    await scriviConBackup({
      tipo:"update", table:"rotazioni", payload:{griglia}, matchObj:match,
      contesto:"Aggiornamento griglia rotazione", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
    });
  }

  async function inserisciEventoGenerico(mod, dataEv, rotazioneId, nuoviEventiLocali, labelOverride=null, extra={}){
    if(!mod && !labelOverride) return;
    const {
      note="", collega="", auto="", importId=null, protPagFine=null, protRecFine=null,
      oraInizioOverride=null, oraFineOverride=null,
    } = extra;
    const dateKey = dkey(dataEv.getFullYear(), dataEv.getMonth(), dataEv.getDate());
    const color = mod ? (mod.coloreCustom || (mod.tempo==="h24" ? "#64748b" : colByTime(mod.inizio))) : "#94a3b8";
    const label = (labelOverride || mod?.label || mod?.titolo || "").toUpperCase();
    const allDay = mod ? mod.tempo==="h24" : true;
    // oraInizioOverride/oraFineOverride: usati per eventi come la
    // protrazione, dove l'orario è specifico di quel giorno e non quello
    // fisso del modello (il modello "PROTRAZIONE PAGAMENTO" è riusato
    // sempre, ma l'orario cambia turno per turno).
    const tIn = oraInizioOverride!=null ? oraInizioOverride : ((!mod || allDay) ? "" : (mod.inizio || ""));
    const tOut = oraFineOverride!=null ? oraFineOverride : ((!mod || allDay) ? "" : calcFineModello(mod));

    const { data, error } = await creaEventoSupabase({
      userId, calId, dateKey, label, color, allDay,
      tIn, tOut, modelloId: mod?.id || null, rotazioneId,
      note, collega, auto, importId, protPagFine, protRecFine,
    });

    if(error) {
      segnalaErroreDb(error, "Inserimento turno da modello");
      return;
    }

    if(!nuoviEventiLocali[dateKey]) nuoviEventiLocali[dateKey] = {};
    if(!nuoviEventiLocali[dateKey][calId]) nuoviEventiLocali[dateKey][calId] = [];
    nuoviEventiLocali[dateKey][calId].push({
      id: data.id,
      color,
      label,
      allDay: data.all_day,
      tIn: data.time_in || "",
      tOut: data.time_out || "",
      place: "",
      map: "",
      note: data.note || "",
      modelloId: data.modello_id || null,
      rotazioneId: data.rotazione_id || null,
      collega: data.collega || "",
      auto: data.auto || "",
      importId: data.import_id || null,
      protPagFine: data.prot_pag_fine || "",
      protRecFine: data.prot_rec_fine || "",
    });
  }

  function normOrarioImport(t){
    return (t||"").trim();
  }

  function trovaModelloPerTitoloOrario(titoloRaw, oraInizioRaw, oraFineRaw){
    const titolo = (titoloRaw||"").trim().toLowerCase();
    if(!titolo) return { mod:null, esito:"vuoto" };
    const oraInizioTxt = normOrarioImport(oraInizioRaw);
    const oraFineTxt = normOrarioImport(oraFineRaw);
    // FIX: solo modelli di QUESTO calendario. Prima si cercava fra i
    // modelli di TUTTI i calendari (FURERIA, PROGRAMMAZIONE, COT, MARY
    // inclusi): un modello omonimo H24 in un altro calendario vinceva il
    // confronto su quello giusto in TURNI ogni volta che l'orario
    // importato era vuoto (oraInizio/oraFine vuoti combaciano solo con un
    // modello che ha anch'esso inizio/fine vuoti, cioè un H24).
    const candidati = modelli.filter(m=>
      (m.titolo||"").trim().toLowerCase()===titolo &&
      (m.calendarId||mainCalId)===calId
    );
    if(candidati.length===0) return { mod:null, esito:"assente" };

    const orarioFornito = !!(oraInizioTxt || oraFineTxt);
    if(orarioFornito){
      // minsOf tollera "6:15"/"06:15"/"6.15" invece del confronto rigido su stringa.
      const esatto = candidati.find(m=>minsOf(m.inizio)===minsOf(oraInizioRaw) && minsOf(m.fine)===minsOf(oraFineRaw));
      if(esatto) return { mod:esatto, esito:"esatto" };
      // Titolo trovato in questo calendario ma con un orario diverso da
      // quello nel file importato: è una discordanza da segnalare, non un
      // modello mancante.
      return { mod:null, esito:"orario_diverso" };
    }
    // Il file non porta un orario per questa riga (tipico se il PDF di
    // origine indicava solo il codice turno). Se il titolo individua UN
    // SOLO modello in questo calendario ci fidiamo del titolo; se ne
    // individua più di uno non possiamo scegliere da soli.
    if(candidati.length===1) return { mod:candidati[0], esito:"solo_titolo" };
    return { mod:null, esito:"ambiguo" };
  }

  // Una riga JSON è una "protrazione" (non un turno a sé) se il titolo
  // contiene PROTAZIONE/PROTRAZIONE (copre anche il refuso comune) e porta
  // sia ora_inizio che ora_fine: verrà agganciata al turno base dello
  // stesso giorno il cui orario di uscita coincide con l'inizio di questa
  // riga, invece di generare un evento "mancante" a sé stante.
  function isRigaProtrazione(r){
    const t = (r.titolo||"").toUpperCase();
    return (t.includes("PROTAZIONE") || t.includes("PROTRAZIONE")) && !!(r.oraInizio && r.oraFine);
  }
  function tipoProtrazione(r){
    const t = (r.titolo||"").toUpperCase() + " " + (r.note||"").toUpperCase();
    if(t.includes("RECUPERO")) return "recupero";
    if(t.includes("PAGAMENTO")) return "pagamento";
    return "pagamento"; // default: le protrazioni straordinarie/elettuali sono tipicamente a pagamento
  }

  // Trova (o crea al volo) il modello dedicato "PROTRAZIONE PAGAMENTO" /
  // "PROTRAZIONE RECUPERO" nel calendario indicato. Serve perché la
  // protrazione, oltre a comparire come campo prot*Fine sull'evento del
  // turno base, deve anche generare un evento reale agganciato a un
  // modelloId: solo così entra nei report (che raggruppano tutto per
  // e.modelloId, vedi computeConteggioForReport/computeTurnazioneForReport).
  // Un solo modello per tipo, riusato sempre: l'orario resta specifico
  // dell'evento (tIn/tOut), non del modello.
  const modelloProtrazioneCacheRef = useRef({});
  // Normalizza un titolo per il confronto "fuzzy" dei modelli PROTRAZIONE:
  // maiuscolo, spazi collassati, così "PP ROTAZIONE PAGAMENTO", "PR
  // PROTAZIONE RECUPERO" o qualunque altra variante con spazio spostato
  // vengono trattate come lo stesso testo.
  function normTitoloProtrazione(t){
    return (t||"").trim().toUpperCase().replace(/\s+/g,"");
  }
  async function trovaOCreaModelloProtrazione(tipo, targetCalId){
    const titolo = tipo==="recupero" ? "PROTRAZIONE RECUPERO"
      : tipo==="meno_recupero" ? "-PROTRAZIONE A RECUPERO"
      : "PROTRAZIONE PAGAMENTO";
    // Nome breve mostrato nel calendario (riquadro stretto: senza questo,
    // il CSS ellipsis tronca il titolo completo a metà parola, es.
    // "PROTRA..."). Il titolo resta comunque quello per esteso ovunque
    // altro (form Modelli, report); questo è solo il "nome da mostrare".
    const labelBreve = tipo==="recupero" ? "PR RECUPERO"
      : tipo==="meno_recupero" ? "-PR RECUPERO"
      : "PR PAGAMENTO";
    // Riconoscimento per PAROLE CHIAVE anziché lista fissa di refusi: un
    // titolo storico è considerato lo stesso modello PROTRAZIONE se, una
    // volta normalizzato (spazi collassati), contiene sia la radice
    // "PROT(R)AZIONE" (copre anche il refuso comune) sia "PAGAMENTO" o
    // "RECUPERO" a seconda del tipo. Così qualunque variante con spazio
    // spostato o refuso di battitura viene riconosciuta come lo stesso
    // modello, e non se ne crea mai un doppione.
    // "meno_recupero" (consumo del credito, evento -PROTRAZIONE A RECUPERO)
    // è riconosciuto SOLO dal titolo che inizia con "-": altrimenti
    // coinciderebbe con la stessa radice/parola chiave di "recupero" e li
    // farebbe considerare lo stesso modello (esattamente il bug già visto
    // con l'unificazione "per somiglianza" dei titoli).
    const parolaChiaveTipo = tipo==="pagamento" ? "PAGAMENTO" : "RECUPERO";
    function eStessoModelloProtrazione(titoloModello){
      const nRaw = (titoloModello||"").trim();
      const eMenoRecupero = nRaw.startsWith("-");
      if(tipo==="meno_recupero" && !eMenoRecupero) return false;
      if(tipo!=="meno_recupero" && eMenoRecupero) return false;
      const n = normTitoloProtrazione(titoloModello);
      const haRadiceProtrazione = n.includes("PROTRAZIONE") || n.includes("PROTAZIONE");
      return haRadiceProtrazione && n.includes(parolaChiaveTipo);
    }
    const cacheKey = `${targetCalId}::${titolo}`;

    // IMPORTANTE: uso modelliRef.current, non la variabile "modelli" chiusa
    // nella closure di questo render. Se questa funzione viene invocata da
    // un callback async subito dopo un altro salvataggio (es. due protrazioni
    // di seguito, o saveEvt+sincronizzaEventiProtrazione in rapida
    // successione), "modelli" può ancora essere la fotografia di un render
    // precedente e non contenere il modello appena creato/esistente:
    // la find fallirebbe e ne creerebbe un doppione anche col titolo giusto.
    // Se esistono più modelli storici duplicati per lo stesso tipo/calendario
    // (retaggio del vecchio bug), si prende sempre il PRIMO trovato, così
    // tutti i punti del codice convergono sullo stesso modello invece di
    // sceglierne uno diverso ogni volta.
    const candidatiEsistenti = modelliRef.current.filter(m=>
      eStessoModelloProtrazione(m.titolo) && (m.calendarId||mainCalId)===targetCalId
    );
    const esistente = candidatiEsistenti[0] || null;
    if(esistente){
      // Aggiorno SEMPRE la cache con l'ultima versione letta da
      // modelliRef.current (mai un vecchio snapshot): se il colore o il
      // tempo del modello sono cambiati nel frattempo — es. per una
      // modifica manuale dell'utente in Modelli, o per il fix automatico
      // una-tantum che corregge tempo/colore all'avvio — la prossima
      // protrazione creata/aggiornata userà subito il valore corrente,
      // senza restare bloccata sul colore preso al primo utilizzo di
      // questa sessione.
      modelloProtrazioneCacheRef.current[cacheKey] = esistente;
      return esistente;
    }
    if(modelloProtrazioneCacheRef.current[cacheKey]) return modelloProtrazioneCacheRef.current[cacheKey];

    const esito = await saveModello({
      titolo, label: labelBreve, tempo:"h24",
      coloreCustom: tipo==="recupero" ? "#f9a8d4" : "#ec4899",
      calendarId: targetCalId,
      silenzioso: true,
    });
    // saveModello ora ritorna direttamente l'oggetto appena creato: niente
    // più bisogno di rileggere modelliRef.current dopo un setTimeout(0),
    // che non garantiva l'ordine rispetto agli effect di React (race
    // condition: il modello poteva risultare "non trovato" e la
    // protrazione restava senza modello agganciato).
    const creato = esito?.modello || null;
    if(creato) modelloProtrazioneCacheRef.current[cacheKey] = creato;
    else {
      segnalaErroreSoloLog(`Impossibile creare/recuperare il modello "${titolo}" per il calendario ${targetCalId}: saveModello non ha ritornato l'oggetto atteso.`, "trovaOCreaModelloProtrazione");
    }
    return creato;
  }

  async function importaTurniPdfJson(righeJson){
    const risultatoVuoto = { nAggiunti:0, nSostituiti:0, nInvariati:0, mancanti:[], sospetti:[], importId:null, sostituzioni:[] };
    if(!userId || !calId || !righeJson?.length) return risultatoVuoto;

    const importId = `imp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const nuoviEventiLocali = {};
    const idsDaCancellare = [];
    const mancanti = [];
    const sospetti = [];
    let nAggiunti=0, nSostituiti=0, nInvariati=0;
    const sostituzioni = [];

    // Separo le righe di protrazione dalle righe di turno normali: le
    // prime non generano un evento proprio, vengono agganciate al turno
    // base con stesso giorno e orario di uscita coincidente.
    const righeProtrazione = righeJson.filter(isRigaProtrazione);
    const righeNormali = righeJson.filter(r=>!isRigaProtrazione(r));

    function trovaProtrazionePerRigaBase(r){
      const dateKey = (r.data||"").trim();
      const idx = righeProtrazione.findIndex(p=>{
        if((p.data||"").trim()!==dateKey) return false;
        // L'orario di uscita del turno base deve coincidere con l'inizio
        // della protrazione (tolleranza sul formato tramite minsOf).
        return minsOf(r.oraFine)!==null && minsOf(p.oraInizio)!==null && minsOf(r.oraFine)===minsOf(p.oraInizio);
      });
      if(idx===-1) return null;
      const [p] = righeProtrazione.splice(idx,1);
      return p;
    }

    for(const r of righeNormali){
      const dateKey = (r.data||"").trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
      const { mod, esito } = trovaModelloPerTitoloOrario(r.titolo, r.oraInizio, r.oraFine);
      if(!mod){
        const riga = { data: dateKey, titolo: r.titolo||"", oraInizio: r.oraInizio||"", oraFine: r.oraFine||"" };
        if(esito==="orario_diverso" || esito==="ambiguo") sospetti.push({ ...riga, motivo:esito });
        else mancanti.push(riga);
        continue;
      }
      const note = (r.note||"").trim();
      const collega = (r.collega||"").trim();
      const auto = (r.auto||"").trim();

      // Se esiste una riga di protrazione agganciata a questo turno base
      // (stesso giorno, orario di inizio = orario di uscita del turno),
      // la fondo qui invece di farla comparire come evento a sé o come
      // riga "mancante".
      const prot = trovaProtrazionePerRigaBase(r);
      const protPagFine = prot && tipoProtrazione(prot)==="pagamento" ? prot.oraFine : null;
      const protRecFine = prot && tipoProtrazione(prot)==="recupero" ? prot.oraFine : null;

      const eventiEsistenti = store.events?.[dateKey]?.[calId] || [];
      const esistente = eventiEsistenti.find(ev=>ev.modelloId===mod.id);

      if(esistente){
        const invariato = up(esistente.note)===up(note) && up(esistente.collega)===up(collega) && up(esistente.auto)===up(auto)
          && up(esistente.protPagFine)===up(protPagFine||"") && up(esistente.protRecFine)===up(protRecFine||"");
        if(invariato){ nInvariati++; continue; }
        const [yy,mm,dd] = dateKey.split("-").map(Number);
        const giornoSett = NOMI_GIORNI_IT[new Date(yy,mm-1,dd).getDay()];
        // Niente più alert() per ogni singola riga: si accoda il dettaglio
        // (titolo vecchio -> nuovo, e stesso per orario/auto/collega/note se
        // cambiati) e si mostra tutto insieme nel riepilogo finale, un solo
        // popup con l'elenco completo invece di un click per ogni turno.
        sostituzioni.push({
          data: dateKey, giornoSett,
          vecchio: {
            titolo: esistente.titolo || esistente.modelloTitolo || "",
            oraInizio: esistente.oraInizio || "", oraFine: esistente.oraFine || "",
            note: esistente.note || "", collega: esistente.collega || "", auto: esistente.auto || "",
          },
          nuovo: {
            titolo: mod.titolo || "",
            oraInizio: mod.inizio || "", oraFine: mod.fine || "",
            note, collega, auto,
          },
        });
        idsDaCancellare.push(esistente.id);
        nSostituiti++;
      } else {
        nAggiunti++;
      }

      const [yy,mm,dd] = dateKey.split("-").map(Number);
      const dataEv = new Date(yy, mm-1, dd);
      await inserisciEventoGenerico(mod, dataEv, null, nuoviEventiLocali, null, { note, collega, auto, importId, protPagFine, protRecFine });

      // Oltre al campo prot*Fine sull'evento del turno base (sopra), genero
      // anche un evento reale agganciato al modello dedicato "PROTRAZIONE
      // PAGAMENTO/RECUPERO": è l'unico modo perché la protrazione entri nei
      // report, che contano tutto per e.modelloId.
      if(prot){
        const tipoProt = tipoProtrazione(prot);
        const modProtrazione = await trovaOCreaModelloProtrazione(tipoProt, mod.calendarId||calId);
        if(modProtrazione){
          const oraInizioProt = r.oraFine; // uscita del turno base = inizio protrazione
          const oraFineProt = tipoProt==="recupero" ? protRecFine : protPagFine;
          await inserisciEventoGenerico(modProtrazione, dataEv, null, nuoviEventiLocali, null, {
            note, collega, auto, importId,
            oraInizioOverride: oraInizioProt, oraFineOverride: oraFineProt,
          });
        }
      }
    }

    // Righe di protrazione che non hanno trovato un turno base con
    // orario di uscita coincidente restano "mancanti" come prima,
    // nessuna invenzione di eventi a sé stanti.
    for(const p of righeProtrazione){
      mancanti.push({ data:(p.data||"").trim(), titolo: p.titolo||"", oraInizio: p.oraInizio||"", oraFine: p.oraFine||"" });
    }

    // I turni base sostituiti (idsDaCancellare) possono avere figli
    // "-PROTRAZIONE A RECUPERO" agganciati (marker
    // "protrazione_di_<vecchioId>_meno_recupero", creati manualmente
    // dall'utente compilando Entrata/Uscita effettiva): questi NON
    // vengono mai toccati dalla logica sopra (che gestisce solo
    // protPagFine/protRecFine letti dal PDF), quindi senza questa pulizia
    // resterebbero orfani per sempre quando il turno base viene
    // ricreato con un nuovo id, e il prossimo salvataggio manuale ne
    // genererebbe un secondo agganciato al nuovo id: risultato, due
    // eventi "-PROTRAZIONE" nello stesso giorno invece di uno solo.
    if(idsDaCancellare.length){
      const idSetBase = new Set(idsDaCancellare);
      const idsFigliOrfani = [];
      for(const calMap of Object.values(store.events||{})){
        for(const evts of Object.values(calMap||{})){
          for(const e of (evts||[])){
            const decodifica = decodificaProtrazioneFiglio(e.importId);
            if(decodifica && idSetBase.has(decodifica.idEventoBase)) idsFigliOrfani.push(e.id);
          }
        }
      }
      if(idsFigliOrfani.length) idsDaCancellare.push(...idsFigliOrfani);
    }

    if(idsDaCancellare.length){
      const { error: delErr } = await supabase.from("events").delete().in("id", idsDaCancellare).eq("user_id", userId);
      if(delErr) segnalaErroreDb(delErr, "Sostituzione turni import");
    }

    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      if(idsDaCancellare.length){
        const idSet = new Set(idsDaCancellare);
        for(const dKey of Object.keys(ns.events||{})){
          if(ns.events[dKey]?.[calId]){
            ns.events[dKey][calId] = ns.events[dKey][calId].filter(e=>!idSet.has(e.id));
          }
        }
      }
      for(const [dateKey, calMap] of Object.entries(nuoviEventiLocali)){
        if(!ns.events[dateKey]) ns.events[dateKey] = {};
        for(const [cid, evts] of Object.entries(calMap)){
          if(!ns.events[dateKey][cid]) ns.events[dateKey][cid] = [];
          ns.events[dateKey][cid].push(...evts);
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });

    registraProblemiImport(mancanti, sospetti);
    return { nAggiunti, nSostituiti, nInvariati, mancanti, sospetti, importId, sostituzioni };
  }

  async function delTuttiEventiImport(importId, cId){
    const { data: rows, error } = await supabase.from("events").select("id")
      .eq("import_id", importId).eq("user_id", userId);
    if(error){ segnalaErroreDb(error, "Eliminazione eventi importati"); return; }
    if(!rows) return;
    const ids = rows.map(r=>r.id);
    if(ids.length===0) return;
    const { error: delErr } = await supabase.from("events").delete().in("id", ids).eq("user_id", userId);
    if(delErr){ segnalaErroreDb(delErr, "Eliminazione eventi importati"); return; }
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      const idSet = new Set(ids);
      for(const dKey of Object.keys(ns.events||{})){
        if(ns.events[dKey]?.[cId]){
          ns.events[dKey][cId] = ns.events[dKey][cId].filter(e=>!idSet.has(e.id));
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }

  async function importaEventiSingoli(righe){
    // righe: [{ dateKey, modelloId }] -- righe senza modelloId vengono ignorate
    // Restituisce il numero di righe EFFETTIVAMENTE scritte (esclude modelloId
    // mancante, modello inesistente, e duplicati già presenti sullo stesso giorno).
    if(!userId || !calId || !righe?.length) return 0;
    const nuoviEventiLocali = {};
    let nScritte = 0;
    for(const r of righe){
      if(!r.modelloId) continue;
      const mod = modelli.find(m=>m.id===r.modelloId);
      if(!mod) continue;
      // Se il giorno ha già un evento con lo stesso modello, non duplicare.
      // Se ha eventi con modelli diversi, aggiungi sotto (non sovrascrivere).
      // Se non ha eventi, aggiungi normalmente.
      const eventiEsistenti = store.events?.[r.dateKey]?.[calId] || [];
      const giaPresente = eventiEsistenti.some(ev => ev.modelloId === r.modelloId);
      if(giaPresente) continue;
      const [y,m,d] = r.dateKey.split("-").map(Number);
      const dataEv = new Date(y, m-1, d);
      await inserisciEventoGenerico(mod, dataEv, null, nuoviEventiLocali);
      nScritte++;
    }
    setStore(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      for(const [dateKey, calMap] of Object.entries(nuoviEventiLocali)) {
        if(!ns.events[dateKey]) ns.events[dateKey] = {};
        for(const [cid, evts] of Object.entries(calMap)) {
          if(!ns.events[dateKey][cid]) ns.events[dateKey][cid] = [];
          ns.events[dateKey][cid].push(...evts);
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
    return nScritte;
  }

  async function applyRotazione(rotId, startDayKey, numRipetizioni, modPartenza="RS") {
    if(!userId || !calId || !startDayKey || !numRipetizioni) return;
    const rot = rotazioni.find(r=>r.id===rotId);
    if(!rot) return;

    const { error } = await dbUpdate("rotazioni", {dataInizio:startDayKey, nSettimane:numRipetizioni}, {id:rotId, user_id:userId}, "Applicazione rotazione", {soloLog:true});
    if(error) segnalaErrore("La rotazione è stata applicata al calendario ma il salvataggio della configurazione potrebbe non essere andato a buon fine.", "Applicazione rotazione");
    setRotazioni(prev=>prev.map(r=>r.id===rotId?{...r,dataInizio:startDayKey,nSettimane:numRipetizioni}:r));

    const nuoviEventiLocali = {};

    async function inserisciEvento(mod, dataEv){
      await inserisciEventoGenerico(mod, dataEv, rot.id, nuoviEventiLocali);
    }

    if(rot.tipo === "nlrs_scalante") {
      const modRS = modelli.find(m=>m.id===rot.modelloRSId);
      const modNL = modelli.find(m=>m.id===rot.modelloNLId);
      const primoModello = modPartenza==="NL" ? modNL : modRS;
      const secondoModello = modPartenza==="NL" ? modRS : modNL;
      const GIORNI_CICLO = [5, 4, 3, 2, 1, 6];
      const [y0, m0, d0] = startDayKey.split("-").map(Number);
      let dataCorrRS = new Date(y0, m0-1, d0);
      let giornoCicloIdx = 0;
      const totalCicli = numRipetizioni * GIORNI_CICLO.length;

      for(let i=0; i<totalCicli; i++) {
        const dataRS = new Date(dataCorrRS);
        const dataNL = new Date(dataCorrRS);
        dataNL.setDate(dataNL.getDate() + 7);

        await inserisciEvento(primoModello, dataRS);
        await inserisciEvento(secondoModello, dataNL);

        giornoCicloIdx = (giornoCicloIdx + 1) % GIORNI_CICLO.length;
        const prossimoDow = GIORNI_CICLO[giornoCicloIdx];
        const base = new Date(dataCorrRS);
        base.setDate(base.getDate() + 21);
        let tentativo = new Date(base);
        let iter = 0;
        while(tentativo.getDay() !== prossimoDow && iter < 14) {
          tentativo.setDate(tentativo.getDate() + 1);
          iter++;
        }
        dataCorrRS = tentativo;
      }
    } else {
      const modLav = modelli.find(m=>m.id===rot.modellaLavoroId);
      const modRip = modelli.find(m=>m.id===rot.modelloNLId);
      const totalWeeks = numRipetizioni * 4;

      const [y0, m0, d0] = startDayKey.split("-").map(Number);
      const start = new Date(y0, m0-1, d0);

      for(let i=0; i<totalWeeks; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        const isLavoro = (i % 4) === 0;
        const mod = isLavoro ? modLav : modRip;
        await inserisciEvento(mod, d);
      }
    }

    setStore(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      for(const [dateKey, calMap] of Object.entries(nuoviEventiLocali)) {
        if(!ns.events[dateKey]) ns.events[dateKey] = {};
        for(const [cid, evts] of Object.entries(calMap)) {
          if(!ns.events[dateKey][cid]) ns.events[dateKey][cid] = [];
          ns.events[dateKey][cid].push(...evts);
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      syncSeAttivo(ns.events, ns.calendars);
      return ns;
    });
  }
// #endregion

// #region SEZIONE 14: REPORT HELPERS
// ═══════════════════════════════════════════════════════════════
  function getReportRange(){
    if(reportInterval==="mese"){
      const y=reportMeseSel.anno, mIdx=reportMeseSel.mese-1; // mIdx 0-based per daysInMonth/MONTHS
      const from=`${y}-${String(mIdx+1).padStart(2,"0")}-01`;
      const to=`${y}-${String(mIdx+1).padStart(2,"0")}-${String(daysInMonth(y,mIdx)).padStart(2,"0")}`;
      return {from, to, label: MONTHS[mIdx]+" "+y};
    }
    if(reportInterval==="anno"){
      return {from:`${reportMeseSel.anno}-01-01`, to:`${reportMeseSel.anno}-12-31`, label: reportMeseSel.anno.toString()};
    }
    return {from:reportDateFrom, to:reportDateTo, label:reportDateFrom+" - "+reportDateTo};
  }

  // Splitta il campo libero "collega" (testo multilinea, spesso con
  // "NOME1, NOME2" sulla stessa riga) in singoli nomi puliti.
  function splitColleghi(testo){
    if(!testo) return [];
    return testo.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
  }

  function computeConteggioForReport(cfg){
    const {from, to} = getReportRange();
    const result = { totale:0 };
    const perModello = {};
    const perCollega = {};
    const modelliInclusi = cfg?.modelliInclusi || [];
    const filtraCollega = (cfg?.filtraCollega||"").trim().toUpperCase();
    const sottomenu = cfg?.sottomenu || [];
    // perSottomenu[sottomenuId][gruppoKey][modelloId] = {count, dates}
    const perSottomenu = {};
    sottomenu.forEach(sm=>{ perSottomenu[sm.id] = {}; });

    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          const collegList = splitColleghi(e.collega);
          if(filtraCollega && !collegList.some(c=>c.toUpperCase().includes(filtraCollega))) continue;

          result.totale++;
          if(e.modelloId){
            if(!perModello[e.modelloId]) perModello[e.modelloId] = { count:0, dates:[] };
            perModello[e.modelloId].count++;
            perModello[e.modelloId].dates.push(dateKey);
          }
          collegList.forEach(c=>{
            if(!perCollega[c]) perCollega[c] = { count:0, dates:[] };
            perCollega[c].count++;
            perCollega[c].dates.push(dateKey);
          });

          // Ogni sottomenu libero è un asse indipendente: raggruppa i modelli
          // secondo l'assegnazione manuale salvata su quel sottomenu
          // (cfg.sottomenu[i].assegnazioni: {modelloId: gruppoKey}). Un
          // modello senza assegnazione in quel sottomenu semplicemente non
          // compare in nessun gruppo di quell'asse (comportamento identico a
          // "escluso" nei report esistenti: niente auto-classificazione).
          sottomenu.forEach(sm=>{
            if(sm.tipo!=="libero" || !e.modelloId) return;
            const gruppoKey = (sm.assegnazioni||{})[e.modelloId];
            if(!gruppoKey) return;
            if(!perSottomenu[sm.id][gruppoKey]) perSottomenu[sm.id][gruppoKey] = {};
            if(!perSottomenu[sm.id][gruppoKey][e.modelloId]) perSottomenu[sm.id][gruppoKey][e.modelloId] = { count:0, dates:[] };
            perSottomenu[sm.id][gruppoKey][e.modelloId].count++;
            perSottomenu[sm.id][gruppoKey][e.modelloId].dates.push(dateKey);
          });
        }
      }
    }
    Object.values(perModello).forEach(v=>v.dates.sort());
    Object.values(perCollega).forEach(v=>v.dates.sort());
    Object.values(perSottomenu).forEach(gruppi=>
      Object.values(gruppi).forEach(perMod=>
        Object.values(perMod).forEach(v=>v.dates.sort())));
    return {...result, perModello, perCollega, perSottomenu};
  }

  // Gemella di computeConteggioForReport, stessa struttura (stesso cfg,
  // stessi filtri, stessi sottomenu liberi/per collega/per modello), ma
  // invece di CONTARE quanti eventi ci sono (result.totale++, count++) SOMMA
  // i minuti reali di ciascun evento (ingresso/uscita). Usata dal report
  // "Ore per turno" riscritto: prima quella vista assumeva sempre 6h15 fisse
  // per ogni turno classificato 1°/2°, sbagliato per modelli come le
  // protrazioni la cui durata varia evento per evento. Qui la durata di ogni
  // singolo evento viene letta così com'è (e.tIn/e.tOut, già calcolati a
  // monte quando l'evento è stato creato/salvato) e sommata: non viene
  // ricalcolata "quanto dura la giornata di lavoro", solo sommati i minuti
  // che risultano già sull'evento.
  function computeMinutiForReport(cfg){
    const {from, to} = getReportRange();
    const result = { totaleMin:0 };
    const perModello = {};
    const perCollega = {};
    const modelliInclusi = cfg?.modelliInclusi || [];
    const filtraCollega = (cfg?.filtraCollega||"").trim().toUpperCase();
    const sottomenu = cfg?.sottomenu || [];
    const perSottomenu = {};
    sottomenu.forEach(sm=>{ perSottomenu[sm.id] = {}; });

    function minutiEvento(e){
      if(e.allDay) return 24*60; // H24: durata fissa, non ha senso/tIn/tOut
      return calcMinuti(e.tIn||"", e.tOut||"");
    }

    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          const collegList = splitColleghi(e.collega);
          if(filtraCollega && !collegList.some(c=>c.toUpperCase().includes(filtraCollega))) continue;

          let mins = minutiEvento(e);
          if(mins<=0) continue; // niente da sommare (evento senza orario valido)
          // "-PROTRAZIONE A RECUPERO" è un CONSUMO di credito, non un altro
          // turno lavorato: nel totale ore va sottratto, non sommato.
          if(tipoModelloProtrazione(e.modelloId)==="meno_recupero") mins = -mins;

          result.totaleMin += mins;
          if(e.modelloId){
            if(!perModello[e.modelloId]) perModello[e.modelloId] = { minuti:0, dates:[] };
            perModello[e.modelloId].minuti += mins;
            perModello[e.modelloId].dates.push(dateKey);
          }
          collegList.forEach(c=>{
            if(!perCollega[c]) perCollega[c] = { minuti:0, dates:[] };
            perCollega[c].minuti += mins;
            perCollega[c].dates.push(dateKey);
          });

          sottomenu.forEach(sm=>{
            if(sm.tipo!=="libero" || !e.modelloId) return;
            const gruppoKey = (sm.assegnazioni||{})[e.modelloId];
            if(!gruppoKey) return;
            if(!perSottomenu[sm.id][gruppoKey]) perSottomenu[sm.id][gruppoKey] = {};
            if(!perSottomenu[sm.id][gruppoKey][e.modelloId]) perSottomenu[sm.id][gruppoKey][e.modelloId] = { minuti:0, dates:[] };
            perSottomenu[sm.id][gruppoKey][e.modelloId].minuti += mins;
            perSottomenu[sm.id][gruppoKey][e.modelloId].dates.push(dateKey);
          });
        }
      }
    }
    Object.values(perModello).forEach(v=>v.dates.sort());
    Object.values(perCollega).forEach(v=>v.dates.sort());
    Object.values(perSottomenu).forEach(gruppi=>
      Object.values(gruppi).forEach(perMod=>
        Object.values(perMod).forEach(v=>v.dates.sort())));
    return {...result, perModello, perCollega, perSottomenu};
  }


  // Calcola, su TUTTA la storia degli eventi (non solo il periodo del
  // report corrente: uno storno puo' collegare date lontane fra loro), come
  // i minuti di ogni evento -PROTRAZIONE A RECUPERO (consumo) vengono
  // stornati dal credito accumulato dagli eventi PROTRAZIONE RECUPERO
  // (guadagno), in ordine cronologico e a partire dal credito piu' vecchio
  // (FIFO), esattamente come nell'esempio: 10/11/12 agosto +20m ciascuno,
  // 13 agosto -30m consuma tutti i 20m del 10 e 10m dei 20m dell'11,
  // lasciando 10m residui sull'11 e i 20m del 12 intatti.
  //
  // è un calcolo dinamico (non salvato da nessuna parte): va rifatto ogni
  // volta che cambia un evento recupero/meno_recupero, così resta sempre
  // coerente con lo stato attuale del calendario.
  //
  // Ritorna { perEvento, creditoResiduoTotale } dove perEvento[eventId] =
  // { tipo: "recupero"|"meno_recupero", minutiTotali, minutiStornati,
  //   minutiResidui, storni: [{dateKey, altroEventId, minuti}] }
  // - per un evento "recupero": minutiResidui = credito non ancora
  //   consumato; storni = elenco di chi (che data, quanti minuti) ha
  //   consumato parte del suo credito.
  // - per un evento "meno_recupero": minutiResidui = consumo non ancora
  //   coperto da credito disponibile (dovrebbe restare 0 se c'e' sempre
  //   credito a sufficienza); storni = elenco di quali date/eventi
  //   "recupero" hanno coperto il suo consumo.
  function computeStornoRecupero(){
    const eventiRecupero = []; // { id, dateKey, calId, minuti }
    const eventiConsumo = [];  // { id, dateKey, calId, minuti }
    for(const [dateKey, calMap] of Object.entries(store.events)){
      for(const [calId, evts] of Object.entries(calMap)){
        for(const e of evts){
          const tipo = tipoModelloProtrazione(e.modelloId);
          if(tipo==="recupero"){
            const mins = e.allDay ? 0 : calcMinuti(e.tIn||"", e.tOut||"");
            if(mins>0) eventiRecupero.push({ id:e.id, dateKey, calId, minuti:mins });
          } else if(tipo==="meno_recupero"){
            const mins = e.allDay ? 0 : calcMinuti(e.tIn||"", e.tOut||"");
            if(mins>0) eventiConsumo.push({ id:e.id, dateKey, calId, minuti:mins });
          }
        }
      }
    }
    // Ordine cronologico: prima per data, poi per id (stabile) a parità di
    // data, così il risultato non dipende dall'ordine di iterazione di
    // store.events (che non è garantito).
    function cmp(a,b){
      if(a.dateKey!==b.dateKey) return a.dateKey<b.dateKey?-1:1;
      return a.id<b.id?-1:(a.id>b.id?1:0);
    }
    eventiRecupero.sort(cmp);
    eventiConsumo.sort(cmp);

    const perEvento = {};
    eventiRecupero.forEach(ev=>{ perEvento[ev.id] = { tipo:"recupero", minutiTotali:ev.minuti, minutiStornati:0, minutiResidui:ev.minuti, storni:[] }; });
    eventiConsumo.forEach(ev=>{ perEvento[ev.id] = { tipo:"meno_recupero", minutiTotali:ev.minuti, minutiStornati:0, minutiResidui:ev.minuti, storni:[] }; });

    // Puntatore FIFO sul credito: scorro i consumi in ordine cronologico e,
    // per ciascuno, consumo il credito più vecchio ancora disponibile
    // (indipendentemente da quando il credito è stato generato rispetto al
    // consumo: anche credito futuro rispetto al consumo può coprirlo, così
    // come nell'esempio le date sono tutte consecutive ma l'algoritmo non
    // richiede che il credito preceda il consumo).
    let idxCredito = 0;
    for(const consumo of eventiConsumo){
      let daConsumare = consumo.minuti;
      while(daConsumare>0 && idxCredito<eventiRecupero.length){
        const credito = eventiRecupero[idxCredito];
        const infoCredito = perEvento[credito.id];
        if(infoCredito.minutiResidui<=0){ idxCredito++; continue; }
        const preso = Math.min(daConsumare, infoCredito.minutiResidui);
        infoCredito.minutiResidui -= preso;
        infoCredito.minutiStornati += preso;
        infoCredito.storni.push({ dateKey:consumo.dateKey, altroEventId:consumo.id, minuti:preso });
        const infoConsumo = perEvento[consumo.id];
        infoConsumo.minutiStornati += preso;
        infoConsumo.minutiResidui -= preso;
        infoConsumo.storni.push({ dateKey:credito.dateKey, altroEventId:credito.id, minuti:preso });
        daConsumare -= preso;
        if(infoCredito.minutiResidui<=0) idxCredito++;
      }
      // Se daConsumare>0 qui, non c'era abbastanza credito accumulato: il
      // consumo resta parzialmente "scoperto" (minutiResidui>0 sul
      // consumo), che segnala uno squilibrio da mostrare all'utente
      // piuttosto che nasconderlo.
    }

    const creditoResiduoTotale = eventiRecupero.reduce((s,ev)=>s+perEvento[ev.id].minutiResidui, 0);
    return { perEvento, creditoResiduoTotale };
  }

  function computeTurnazioneForReport(cfg){
    const {from, to} = getReportRange();
    const esclusi = cfg?.modelliEsclusi || [];
    const aggiunti = cfg?.modelliAggiunti || [];
    const default6h15 = modelli.filter(m=>isModelloTurnazioneDefault(m) && !esclusi.includes(m.id)).map(m=>m.id);
    const modelliInclusi = [...new Set([...default6h15, ...aggiunti])];
    const gruppiManuali = cfg?.gruppiManuali || {}; // { modelloId: "primo"|"secondo", "modelloId_appauto": "app"|"auto" }
    const filtraCollega = (cfg?.filtraCollega||"").trim().toUpperCase();
    const result = { totale:0, primo:0, secondo:0, app:0, auto:0 };
    const perModello = {};
    const perCollega = {};
    const perGruppo = { primo:{}, secondo:{}, app:{}, auto:{} };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          const collegList = splitColleghi(e.collega);
          if(filtraCollega && !collegList.some(c=>c.toUpperCase().includes(filtraCollega))) continue;
          result.totale++;
          const modelloEvt = e.modelloId ? modelli.find(mm=>mm.id===e.modelloId) : null;
          const overrideTurnoRaw = e.modelloId ? gruppiManuali[e.modelloId] : null;
          const escludiTurno = overrideTurnoRaw==="escluso";
          const overrideTurno = (overrideTurnoRaw==="primo"||overrideTurnoRaw==="secondo") ? overrideTurnoRaw : null;
          const overrideAppAutoRaw = e.modelloId ? gruppiManuali[e.modelloId+"_appauto"] : null;
          const escludiAppAuto = overrideAppAutoRaw==="escluso";
          const overrideAppAuto = (overrideAppAutoRaw==="app"||overrideAppAutoRaw==="auto") ? overrideAppAutoRaw : null;
          // Override a livello di SINGOLO EVENTO (scelto dall'utente nel form
          // di modifica evento, opzione "solo questo evento"): ha PRIORITÀ
          // MASSIMA, sopra la categoria del modello e sopra l'override del
          // report, perché è la scelta più specifica possibile.
          const overrideEventoTurno = (e.categoriaTurno==="primo"||e.categoriaTurno==="secondo") ? e.categoriaTurno : null;
          const overrideEventoAppAuto = (e.categoriaAppAuto==="app"||e.categoriaAppAuto==="auto") ? e.categoriaAppAuto : null;

          // ── Asse 1: TURNO (1°/2°) — indipendente, decide su override evento,
          // poi categoria manuale del modello, poi override di questo
          // report, poi automatico per orario.
          // Se l'utente ha esplicitamente deselezionato questo asse (modello o report), niente auto: nessun gruppo.
          const gruppoTurno = overrideEventoTurno || ((modelloEvt?.turnoVuoto || escludiTurno)
            ? null
            : ((modelloEvt?.categoria==="primo"||modelloEvt?.categoria==="secondo")
              ? modelloEvt.categoria
              : (overrideTurno || categoriaTurnoAutomatica(modelloEvt))));

          // ── Asse 2: APP/AUTO — indipendente, stessa priorità ma decide su titolo.
          // Se l'utente ha esplicitamente deselezionato questo asse (modello o report), niente auto: nessun gruppo.
          const gruppoAppAuto = overrideEventoAppAuto || ((modelloEvt?.appAutoVuoto || escludiAppAuto)
            ? null
            : ((modelloEvt?.categoriaAppAuto==="app"||modelloEvt?.categoriaAppAuto==="auto")
              ? modelloEvt.categoriaAppAuto
              : (overrideAppAuto || categoriaAppAutoAutomatica(modelloEvt) || "auto")));

          if(e.modelloId){
            if(!perModello[e.modelloId]) perModello[e.modelloId] = { count:0, dates:[] };
            perModello[e.modelloId].count++;
            perModello[e.modelloId].dates.push(dateKey);
          }
          collegList.forEach(c=>{
            if(!perCollega[c]) perCollega[c] = { count:0, dates:[] };
            perCollega[c].count++;
            perCollega[c].dates.push(dateKey);
          });
          if(gruppoTurno){
            result[gruppoTurno] = (result[gruppoTurno]||0)+1;
            if(e.modelloId){
              if(!perGruppo[gruppoTurno][e.modelloId]) perGruppo[gruppoTurno][e.modelloId] = { count:0, dates:[] };
              perGruppo[gruppoTurno][e.modelloId].count++;
              perGruppo[gruppoTurno][e.modelloId].dates.push(dateKey);
            }
          }
          if(gruppoAppAuto){
            result[gruppoAppAuto] = (result[gruppoAppAuto]||0)+1;
            if(e.modelloId){
              if(!perGruppo[gruppoAppAuto][e.modelloId]) perGruppo[gruppoAppAuto][e.modelloId] = { count:0, dates:[] };
              perGruppo[gruppoAppAuto][e.modelloId].count++;
              perGruppo[gruppoAppAuto][e.modelloId].dates.push(dateKey);
            }
          }
        }
      }
    }
    Object.values(perModello).forEach(v=>v.dates.sort());
    Object.values(perCollega).forEach(v=>v.dates.sort());
    Object.values(perGruppo).forEach(g=>Object.values(g).forEach(v=>v.dates.sort()));
    return {...result, perModello, perCollega, perGruppo, modelliInclusiEffettivi:modelliInclusi};
  }

  function computeConteggio(){
    return computeConteggioForReport({fasceFiltro:[]});
  }

  // Spezza un intervallo [tIn,tOut) (in minuti dalla mezzanotte, tOut può
  // essere "il giorno dopo" cioè < tIn) in due quantità: minuti che cadono
  // in fascia diurna (06:00-22:00) e minuti che cadono in fascia notturna
  // (22:00-06:00). Gestisce anche i turni che attraversano la mezzanotte.
  function spezzaDiurnoNotturno(tIn, tOut){
    const m1 = oraInMinuti(tIn), m2raw = oraInMinuti(tOut);
    if(m1===null||m2raw===null) return {diurno:0, notturno:0};
    let m2 = m2raw;
    if(m2<=m1) m2 += 24*60; // turno che passa la mezzanotte
    let diurno=0, notturno=0;
    for(let t=m1; t<m2; t++){
      const h = Math.floor((t%(24*60))/60);
      if(h>=6 && h<22) diurno++; else notturno++;
    }
    return {diurno, notturno};
  }

  // Indennità di servizio: ore effettive (non turni interi) per ciascuna
  // delle 4 fasce, spezzando ogni turno tra diurno e notturno quando
  // attraversa le 06:00 o le 22:00. "Festivo" e "Festivo notturno" sono le
  // stesse fasce orarie ma applicate nei giorni festivi (isFestivo).
  function computeIndennita(modelliInclusi=[]){
    const {from, to} = getReportRange();
    const totaliMin = { diurno:0, notturno:0, festivo:0, notturno_festivo:0 };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fest = isFestivo(dateKey);
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          if(e.allDay) continue;
          if(!e.tIn||!e.tOut) continue;
          const {diurno, notturno} = spezzaDiurnoNotturno(e.tIn, e.tOut);
          if(fest){ totaliMin.festivo += diurno; totaliMin.notturno_festivo += notturno; }
          else    { totaliMin.diurno  += diurno; totaliMin.notturno         += notturno; }
        }
      }
    }
    // Restituite in ORE (decimali), non in minuti: chi consuma questo
    // oggetto (IndennitaConfig) moltiplica direttamente ore*tariffa_oraria.
    return {
      diurno: totaliMin.diurno/60,
      notturno: totaliMin.notturno/60,
      festivo: totaliMin.festivo/60,
      notturno_festivo: totaliMin.notturno_festivo/60,
    };
  }

  // Durata PREVISTA di un evento in minuti, basata sul modello collegato
  // (6h15=375, 6h30=390, personalizzato=differenza inizio/fine del modello).
  // Se non c'è modello, usa la durata dell'evento stesso come previsione
  // (nessuno scostamento calcolabile in quel caso).
  function minutiPrevistiEvento(e){
    const mod = e.modelloId ? modelli.find(m=>m.id===e.modelloId) : null;
    if(mod){
      if(mod.tempo==="6h15") return 375;
      if(mod.tempo==="6h30") return 390;
      if(mod.tempo==="personalizzato" && mod.inizio && mod.fine) return calcMinuti(mod.inizio, mod.fine);
    }
    if(e.tIn&&e.tOut) return calcMinuti(e.tIn, e.tOut);
    return 0;
  }

  // Minuti EFFETTIVAMENTE lavorati in un evento: parte dalla durata
  // prevista e applica gli scostamenti reali già tracciati altrove nel
  // progetto (stessi campi usati da sincronizzaEventiProtrazione):
  //  - Entrata/Uscita effettiva (protMenoRecIn/protMenoRecOut): ritardo in
  //    entrata + anticipo in uscita, sottratti dalla durata prevista;
  //  - PROTRAZIONE A PAGAMENTO / A RECUPERO (protPagFine/protRecFine): ore
  //    lavorate IN PIÙ oltre l'uscita prevista, sommate.
  function minutiEffettiviEvento(e){
    const previsti = minutiPrevistiEvento(e);
    let effettivi = previsti;
    if(e.protMenoRecIn||e.protMenoRecOut){
      const previstoIn = oraInMinuti(e.tIn||""), effettivoIn = oraInMinuti(e.protMenoRecIn||"");
      const previstoOut = oraInMinuti(e.tOut||""), effettivoOut = oraInMinuti(e.protMenoRecOut||"");
      let ritardoEntrata=0, anticipoUscita=0;
      if(previstoIn!==null&&effettivoIn!==null){ let d=effettivoIn-previstoIn; if(d<0) d+=24*60; ritardoEntrata=Math.max(0,d); }
      if(previstoOut!==null&&effettivoOut!==null){ let d=previstoOut-effettivoOut; if(d<0) d+=24*60; anticipoUscita=Math.max(0,d); }
      effettivi -= (ritardoEntrata+anticipoUscita);
    }
    if(e.protPagFine){
      const uscitaPrevista = oraInMinuti(e.tOut||""), finePag = oraInMinuti(e.protPagFine||"");
      if(uscitaPrevista!==null&&finePag!==null){ let d=finePag-uscitaPrevista; if(d<0) d+=24*60; effettivi += Math.max(0,d); }
    }
    if(e.protRecFine){
      const uscitaPrevista = oraInMinuti(e.tOut||""), fineRec = oraInMinuti(e.protRecFine||"");
      if(uscitaPrevista!==null&&fineRec!==null){ let d=fineRec-uscitaPrevista; if(d<0) d+=24*60; effettivi += Math.max(0,d); }
    }
    return Math.max(0, effettivi);
  }

  // Un evento "conta" per viabilità/ticket solo se collegato a un modello
  // di durata 6h15, 6h30, oppure personalizzato impostato esattamente a
  // 6h01 (361 minuti) — come richiesto: sono le tre durate-turno valide.
  function eModelloViabile(e){
    const mod = e.modelloId ? modelli.find(m=>m.id===e.modelloId) : null;
    if(!mod) return false;
    if(mod.tempo==="6h15"||mod.tempo==="6h30") return true;
    if(mod.tempo==="personalizzato"&&mod.inizio&&mod.fine){
      return calcMinuti(mod.inizio, mod.fine)===361; // 6h01
    }
    return false;
  }

  // Viabilità: 15€ per ogni giorno con un turno valido (6h15/6h30/6h01),
  // scalata di 2,4€ per ogni ora (proporzionale) di lavoro effettivo IN
  // MENO rispetto alle ore previste dal modello di quel turno.
  const TARIFFA_VIABILITA = 15;
  const PENALE_VIABILITA_ORA = 2.4;
  function computeViabilita(modelliInclusi=[]){
    const {from, to} = getReportRange();
    let giorni=0, totale=0, oreMancantiTot=0;
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          if(e.allDay) continue;
          if(!eModelloViabile(e)) continue;
          const previsti = minutiPrevistiEvento(e);
          const effettivi = minutiEffettiviEvento(e);
          const minutiMancanti = Math.max(0, previsti-effettivi);
          const oreMancanti = minutiMancanti/60;
          const importo = Math.max(0, TARIFFA_VIABILITA - oreMancanti*PENALE_VIABILITA_ORA);
          giorni++;
          totale += importo;
          oreMancantiTot += oreMancanti;
        }
      }
    }
    return { giorni, totale, oreMancanti:oreMancantiTot };
  }

  // Ticket: un ticket per ogni GIORNO in cui le ore effettivamente
  // lavorate (sommando tutti i turni validi di quel giorno) raggiungono
  // almeno 6h15 (375 minuti).
  const SOGLIA_TICKET_MIN = 375; // 6h15
  function computeTicket(modelliInclusi=[], valoreTicket=0){
    const {from, to} = getReportRange();
    let giorniConDiritto=0;
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      let minutiGiorno = 0;
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        for(const e of evts){
          if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          if(e.allDay) continue;
          if(!eModelloViabile(e)) continue;
          minutiGiorno += minutiEffettiviEvento(e);
        }
      }
      if(minutiGiorno>=SOGLIA_TICKET_MIN) giorniConDiritto++;
    }
    return { giorni:giorniConDiritto, totale:giorniConDiritto*(parseFloat(valoreTicket)||0) };
  }

  const activeReports = (store.reports||[]).filter(r=>r.active);
  const inactiveTypes = REPORT_TEMPLATES;

  function addReport(type){
    const tmpl = REPORT_TEMPLATES.find(t=>t.type===type);
    if(!tmpl) return;
    const newReport = {
      id: uid(),
      type,
      label: tmpl.label,
      active: true,
    };
    const newRep = [...(store.reports||[]), newReport];
    setStore(s=>({...s, reports:newRep}));
    saveSettings({reports:newRep});
    if(type==="turnazione"){
      const default6h15 = modelli.filter(m=>isModelloTurnazioneDefault(m)).map(m=>m.id);
      if(default6h15.length>0){
        const newCfg = {...conteggioConfigs, [newReport.id]: {fasceFiltro:[], modelliInclusi:default6h15}};
        setConteggioConfigs(newCfg);
        saveSettings({conteggio_configs: newCfg});
      }
    }
  }

  function removeReport(id){
    const newRep = (store.reports||[]).filter(r=>r.id!==id);
    setStore(s=>({...s, reports:newRep}));
    saveSettings({reports:newRep});
  }

  function renameReport(id, label){
    const newRep = (store.reports||[]).map(r=>r.id===id?{...r,label}:r);
    setStore(s=>({...s, reports:newRep}));
    saveSettings({reports:newRep});
  }

  function moveReport(id, dir){
    const reps = [...(store.reports||[])];
    const idx = reps.findIndex(r=>r.id===id);
    if(idx===-1) return;
    const newIdx = dir==="up" ? idx-1 : idx+1;
    if(newIdx<0||newIdx>=reps.length) return;
    const [moved] = reps.splice(idx,1);
    reps.splice(newIdx,0,moved);
    setStore(s=>({...s, reports:reps}));
    saveSettings({reports:reps});
  }

  function getConteggioConfig(reportId, reportType){
    const saved = conteggioConfigs[reportId];
    if(saved) return saved;
    if(reportType==="turnazione"){
      return { fasceFiltro:[], modelliEsclusi:[], modelliAggiunti:[] };
    }
    return { fasceFiltro:[], modelliInclusi:[], sottomenu:[] };
  }

  function updateConteggioConfig(reportId, cfg){
    const newCfg = {...conteggioConfigs, [reportId]: cfg};
    setConteggioConfigs(newCfg);
    saveSettings({conteggio_configs: newCfg});
  }

  const totaleTurni = computeConteggio().totale;
  const totaleMinTurni = computeMinutiForReport({fasceFiltro:[]}).totaleMin;
// #endregion


  // ── Manutenzione: ricollega gli eventi "orfani" (modello_id nullo) ai
  // modelli esistenti, quando testo e orari combaciano esattamente.
  // Richiamabile da un pulsante in Impostazioni. Match rigoroso (stesso
  // calendario, stesso titolo/label, stessi orari): quello che non trova
  // un match sicuro resta orfano e va controllato a mano, elencato nel
  // riepilogo restituito.
  async function ripristinaModelliMancanti(){
    const orfani = [];
    for(const dayKey in store.events){
      for(const cId in store.events[dayKey]){
        for(const e of store.events[dayKey][cId]){
          if(!e.modelloId) orfani.push({ dayKey, calId:cId, evt:e });
        }
      }
    }
    const risolti = [];
    const nonRisolti = [];
    for(const { dayKey, calId:cId, evt } of orfani){
      const match = trovaModelloCorrispondente(cId, evt.label, evt.tIn, evt.tOut);
      if(match){
        const { error } = await scriviConBackup({
          tipo:"update", table:"events",
          payload:{ modello_id: match.id },
          matchObj:{ id: evt.id },
          contesto:"Ripristino automatico modello mancante",
          ts:new Date().toISOString(),
          opzioni:{ soloLog:true },
        });
        if(!error){
          const nuovoStore = withEventoAggiornato(store, dayKey, cId, evt.id, { modelloId: match.id });
          setStore(nuovoStore);
          storeRef.current = nuovoStore;
          risolti.push({ dayKey, label: evt.label, modello: match.titolo||match.label });
        } else {
          nonRisolti.push({ dayKey, label: evt.label, motivo: "errore di scrittura" });
        }
      } else {
        nonRisolti.push({ dayKey, label: evt.label, motivo: "nessun modello corrispondente trovato" });
      }
    }
    return { totale: orfani.length, risolti, nonRisolti };
  }

  return {
    today,
    tipoModelloProtrazione,
    store,
    setStore,
    ripristinaModelliMancanti,
    ripristinoInCorso, setRipristinoInCorso,
    ripristinoEsito, setRipristinoEsito,
    loading,
    setLoading,
    year,
    setYear,
    month,
    setMonth,
    calId,
    setCalId,
    editMode,
    setEditMode,
    selectedCalIds,
    setSelectedCalIds,
    reportCalIds,
    setReportCalIds,
    setReportCalIdsPersistito,
    selectedModelloIds,
    setSelectedModelloIds,
    screen,
    setScreen,
    dayKey,
    setDayKey,
    form,
    setForm,
    pal,
    setPal,
    ncName,
    setNcName,
    ncColor,
    setNcColor,
    nsName,
    setNsName,
    nsColor,
    setNsColor,
    exCal,
    setExCal,
    nhName,
    setNhName,
    syncMsg,
    setSyncMsg,
    backupsList,
    setBackupsList,
    showBackupsModal,
    setShowBackupsModal,
    showLocalDataModal,
    setShowLocalDataModal,
    syncing,
    setSyncing,
    nhD,
    setNhD,
    nhM,
    setNhM,
    bgSyncing,
    setBgSyncing,
    dbError,
    setDbError,
    isWideScreen,
    setIsWideScreen,
    evtFontSize,
    dbErrorTimer,
    codaErrori,
    setCodaErrori,
    logErroriVisibile,
    setLogErroriVisibile,
    erroriSilenziatiVisibile,
    setErroriSilenziatiVisibile,
    segnalaErroreDb,
    dbUpdate,
    dbDelete,
    dbInsert,
    scriviConBackup,
    up,
    creaEventoSupabase,
    sheetsUrl,
    setSheetsUrl,
    sheetsSecret,
    setSheetsSecret,
    stats,
    setStats,
    showDbModal,
    setShowDbModal,
    showModelloEditor,
    setShowModelloEditor,
    isOnline,
    setIsOnline,
    banner,
    setBanner,
    syncMode,
    setSyncMode,
    dbRawData,
    setDbRawData,
    dbCalsCount,
    setDbCalsCount,
    dbEvtsCount,
    setDbEvtsCount,
    modelliTab,
    setModelliTab,
    modelli,
    setModelli,
    modelliSort,
    setModelliSort,
    showSortMenu,
    setShowSortMenu,
    showModelForm,
    setShowModelForm,
    origineModelForm,
    setOrigineModelForm,
    editModello,
    setEditModello,
    modelForm,
    setModelForm,
    showColorAssignPicker,
    setShowColorAssignPicker,
    colorAssignCalFiltro,
    setColorAssignCalFiltro,
    showAddColorPicker,
    setShowAddColorPicker,
    coloriExtra,
    setColoriExtra,
    autocompleteValori,
    setAutocompleteValori,
    showEditFasciaColor,
    setShowEditFasciaColor,
    rotazioni,
    setRotazioni,
    showRotForm,
    setShowRotForm,
    editRotazione,
    setEditRotazione,
    rotForm,
    setRotForm,
    showRotDetail,
    setShowRotDetail,
    showApplyRotDialog,
    setShowApplyRotDialog,
    showDeleteRotEvtDialog,
    setShowDeleteRotEvtDialog,
    showImportaFotoDialog,
    setShowImportaFotoDialog,
    showImportaTurniJsonDialog,
    setShowImportaTurniJsonDialog,
    showModelloPicker,
    setShowModelloPicker,
    quickModeModello,
    setQuickModeModello,
    showRotazionePicker,
    setShowRotazionePicker,
    dragSrcId,
    dragTargetId,
    touchSrcId,
    touchTargetId,
    touchStartX,
    touchStartY,
    prevGrid,
    modelliScrollRef,
    autoScrollRAF,
    autoScrollSpeed,
    dragOverId,
    setDragOverId,
    draggingId,
    setDraggingId,
    modalitaSpostamento,
    setModalitaSpostamento,
    updateAutoScroll,
    stopAutoScroll,
    reportInterval,
    setReportInterval,
    setReportIntervalPersistito,
    reportMeseSel,
    setReportMeseSel,
    selezionaReportMese,
    showMeseReportPicker,
    setShowMeseReportPicker,
    reportDateFrom,
    setReportDateFrom,
    setReportDateFromPersistito,
    reportDateTo,
    setReportDateTo,
    setReportDateToPersistito,
    intervalliSalvati,
    salvaIntervalloCorrente,
    applicaIntervalloSalvato,
    rimuoviIntervalloSalvato,
    openReportConfig,
    setOpenReportConfig,
    showIntervalPicker,
    setShowIntervalPicker,
    indennita,
    setIndennita,
    valoreTicket,
    setValoreTicket,
    conteggioConfigs,
    setConteggioConfigs,
    showReportModelliPicker,
    setShowReportModelliPicker,
    editFascia,
    setEditFascia,
    showFasciaColorPicker,
    setShowFasciaColorPicker,
    userId,
    isInitialized,
    processaCodaSync,
    sysDark,
    dark,
    T,
    activeCal,
    mainCal,
    mainCalId,
    accent,
    accentText,
    hols,
    fasceAutomatiche,
    colByTime,
    colLabel,
    isRed,
    sundayColor,
    holidayColor,
    redBg,
    getEvts,
    allEvts,
    dots,
    saveSettings,
    addCalendar,
    updateCalendar,
    deleteCalendar,
    computeEventFields,
    saveEvt,
    updateEvt,
    delEvt,
    delEvtiRotazioneDaData,
    delTutteEvtiRotazione,
    cancellaTuttiEventiMese,
    calcMinuti,
    saveToSheets,
    syncSeAttivo,
    loadFromSheets,
    syncFromSheets,
    handleSave,
    handleLoad,
    handleSaveSheetsConfig,
    handleViewDbData,
    buildBackupPayload,
    handleExportSupabase,
    handleOpenImportSupabase,
    handleRestoreBackup,
    handleLogout,
    eseguiNormalizzazione,
    normalizzaModelliTempo,
    normalizzaEventiTempo,
    modelliOrdinati,
    importsRecenti,
    modelliDelCalendario,
    rinumeraSottoinsieme,
    spostaModelloPuro,
    trascinaModelloPuro,
    salvaModifichePosizioni,
    moveH24,
    reorderModelli,
    ensureColoreRegistrato,
    registraValoreAutocomplete,
    registraValoriAutocomplete,
    rimuoviValoreAutocomplete,
    supabaseUpsertConRetry,
    saveModello,
    deleteModello,
    addColoreExtra,
    removeColoreExtra,
    updateColoreExtraLabel,
    replaceColoreEverywhere,
    saveRotazione,
    deleteRotazione,
    updateGrigliaRotazione,
    inserisciEventoGenerico,
    normOrarioImport,
    trovaModelloPerTitoloOrario,
    isRigaProtrazione,
    tipoProtrazione,
    sincronizzaEventiProtrazione,
    importaTurniPdfJson,
    delTuttiEventiImport,
    importaEventiSingoli,
    applyRotazione,
    getReportRange,
    splitColleghi,
    computeConteggioForReport,
    computeMinutiForReport,
    computeStornoRecupero,
    computeStornoPI,
    tipoModelloPI,
    computeTurnazioneForReport,
    computeConteggio,
    computeIndennita,
    computeViabilita,
    computeTicket,
    activeReports,
    inactiveTypes,
    addReport,
    removeReport,
    renameReport,
    moveReport,
    getConteggioConfig,
    updateConteggioConfig,
    totaleTurni,
    totaleMinTurni,
    setPrevGrid,
    REPORT_TEMPLATES,
    calcolaOrdineModelli,
    updateFascia,
    session
  };
}
    
