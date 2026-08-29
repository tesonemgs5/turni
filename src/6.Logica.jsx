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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// useAppCore.js â€” Custom hook che concentra tutto lo stato e la
// logica dell'app: init, CRUD calendari/eventi, sync Google Sheets
// + Supabase, CRUD modelli/colori/rotazioni, report helpers.
// Provenienza: App.jsx originale, sezioni 5-14.
//
// Uso: nel componente App, `const C = useAppCore(session);` poi si
// passa C (o le chiavi che servono) alle viste.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// #region SEZIONE 5: REPORT TEMPLATES + INIT STATE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const REPORT_TEMPLATES = [
  { type:"conteggio_turni", label:"Conteggio turni", desc:"Conta i turni per fascia oraria" },
  { type:"turnazione",      label:"Turnazione", desc:"Turni per modello con date, 1Â°/2Â° turno automatico" },
  { type:"indennita",       label:"IndennitÃ  di servizio", desc:"Calcola le indennitÃ  per fascia" },
  { type:"ore_turno",       label:"Ore per turno", desc:"Stima ore lavorate" },
  { type:"straordinari",    label:"Straordinari", desc:"Protrazioni e straordinari" },
  { type:"guadagni",        label:"Guadagni", desc:"Stima guadagni da indennitÃ " },
  { type:"storno_recupero", label:"Storno PROTRAZIONE A RECUPERO", desc:"Credito PROTRAZIONE A RECUPERO e consumo -PROTRAZIONE A RECUPERO, con date e minuti" },
];

const INIT = { calendars:[], events:{}, theme:"auto", extraHols:[], reports:[], reportSettings:{}, fasceAutomatiche: FASCE_AUTOMATICHE_DEFAULT, sundayColor:"", holidayColor:"", nationalHolsEnabled:FESTIVITA_DEFAULT_ATTIVE };

export function useAppCore(session){
  const today = new Date();
  // â† AGGANCIO: qui aggiungo un <style> globale con @keyframes calFadeIn, iniettato una sola volta nel render finale
// #endregion

// #region SEZIONE 6: USESTATE HOOKS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const [store, setStore] = useState(INIT);
  // Ref sincrono per leggere l'ultimo valore di store dentro funzioni
  // async (es. sincronizzaEventiProtrazione chiamata subito dopo un
  // setStore, prima che il re-render abbia aggiornato la closure di
  // updateEvt/saveEvt): senza questo ref, la ricerca del figlio di
  // protrazione esistente puÃ² leggere uno snapshot di store "vecchio"
  // di un giro, non trovare il figlio giÃ  creato in una modifica
  // precedente e crearne un secondo doppione invece di aggiornare quello
  // giÃ  presente. Stesso pattern giÃ  usato per modelliRef qui sotto.
  const storeRef = useRef(INIT);
  useEffect(()=>{ storeRef.current = store; }, [store]);
  const [loading, setLoading] = useState(true);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calId, setCalId] = useState(null);
  useEffect(()=>{
    if(calId){ try{ localStorage.setItem('cache_calId', calId); }catch(e){} }
  }, [calId]);
  const [editMode, setEditMode] = useState(false); // "M" â€” ON = modifica singola, OFF = selezione multipla
  const [selectedCalIds, setSelectedCalIds] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('cache_selectedCalIds')||'[]'); }catch(e){ return []; }
  }); // selezione multipla calendari â€” determina anche cosa resta visibile in editMode. Persistita: al refresh/riavvio resta quella scelta dall'utente, non torna a "tutti".
  useEffect(()=>{
    try{ localStorage.setItem('cache_selectedCalIds', JSON.stringify(selectedCalIds)); }catch(e){}
  }, [selectedCalIds]);
  const [reportCalIds, setReportCalIds] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem('cache_reportCalIds')||'[]'); }catch(e){ return []; }
  }); // selezione calendari per il Report (vuoto = tutti). Persistita: al refresh/riavvio resta quella scelta dall'utente, non torna a "tutti".
  useEffect(()=>{
    try{ localStorage.setItem('cache_reportCalIds', JSON.stringify(reportCalIds)); }catch(e){}
  }, [reportCalIds]);
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
  // un solo bottone OK (chiude sempre) + checkbox "non mostrare piÃ¹" per
  // quel contesto specifico (silenziamento persistente, riattivabile da
  // Impostazioni â†’ Log).
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
  function segnalaErroreDb(error, contesto){
    segnalaErrore(error, contesto);
    const msg = error?.message || "Errore sconosciuto";
    setDbError(`âš ï¸ ${contesto}: ${msg}`);
    if(dbErrorTimer.current) clearTimeout(dbErrorTimer.current);
    dbErrorTimer.current = setTimeout(()=>setDbError(""), 6000);
  }
  // â”€â”€â”€ Wrapper per il pattern Supabase+gestione errore, ripetuto in tutto
  // il file: query, controlla error, segnala se fallisce. Un solo posto da
  // toccare se cambia come viene gestito un errore di scrittura; e soprattutto
  // impossibile dimenticare il controllo dell'errore, perchÃ© Ã¨ giÃ  dentro
  // il wrapper stesso invece di doverlo scrivere ogni volta a mano.
  // matchObj: oggetto di filtri applicati con .match() (es. {id, user_id}).
  // opzioni.soloLog: se true, l'errore va solo nel Log senza aprire il
  // modale â€” per i casi dentro un ciclo dove un riepilogo unico basta
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

  // â”€â”€â”€ Wrapper unico per OGNI operazione di scrittura CRUD (turni, modelli,
  // rotazioni, calendari...). Il locale Ã¨ la fonte di veritÃ : il chiamante
  // aggiorna SEMPRE lo stato React + localStorage PRIMA di chiamare questa
  // funzione (quella parte resta specifica di ogni CRUD, cambia da caso a
  // caso). Da qui in poi, il comportamento Ã¨ identico per tutti:
  //
  //   1) Prova Supabase. Se la tabella rifiuta una colonna che non esiste
  //      ancora (schema non ancora allineato al codice), la toglie dal
  //      payload e riprova in automatico (fino a 10 volte) â€” stesso
  //      comportamento che aveva supabaseUpsertConRetry, riportato qui.
  //   2) In PARALLELO (non in sequenza), backup su Sheets con la stessa
  //      istantanea di dati passata dal chiamante.
  //   3) Se Supabase fallisce per un'eccezione di rete (offline), l'intera
  //      operazione (con il suo timestamp) va in coda: verrÃ  ritentata
  //      identica al ritorno della connessione. Se invece Supabase risponde
  //      con un errore "vero" (non di rete: validazione, permessi...), non
  //      va in coda â€” si segnala e basta, ritentarla non la farebbe passare.
  //
  // ts: timestamp ISO dell'istante in cui l'utente ha fatto la modifica
  // (non di quando questa funzione viene eseguita) â€” usato per decidere la
  // precedenza se due dispositivi modificano la stessa riga mentre uno era
  // offline: vince sempre la modifica con ts piÃ¹ recente.
  async function scriviConBackup({ tipo, table, payload, matchObj, contesto, ts, eventsPerSheets, calendarsPerSheets, modelliPerSheets, opzioni={} }){
    async function provaSupabase(payloadCorrente, tentativi=0){
      if(tentativi>=10) return { error:{message:"Troppi tentativi di retry sullo schema"} };
      let q;
      if(tipo==="insert") q = supabase.from(table).insert(payloadCorrente);
      else if(tipo==="update") q = supabase.from(table).update(payloadCorrente).match(matchObj);
      else q = supabase.from(table).delete().match(matchObj);
      const { error } = await q;
      if(!error) return { error:null };
      const m = /Could not find the '([^']+)' column/.exec(error.message||"");
      if(m && payloadCorrente && m[1] in payloadCorrente){
        segnalaErroreSoloLog(`Colonna '${m[1]}' assente su Supabase: omessa e riprovato automaticamente. Esegui l'ALTER TABLE per abilitarla stabilmente.`, `${contesto} (schema database)`);
        const { [m[1]]: _omessa, ...resto } = payloadCorrente;
        return provaSupabase(resto, tentativi+1);
      }
      return { error };
    }
    try{
      const [risSupabase] = await Promise.all([
        provaSupabase(payload),
        (eventsPerSheets!==undefined) ? syncSeAttivo(eventsPerSheets, calendarsPerSheets, modelliPerSheets) : Promise.resolve(),
      ]);
      if(risSupabase.error){
        // soloLog: il locale Ã¨ comunque giÃ  scritto dal chiamante prima di
        // arrivare qui, quindi un modale bloccante per un errore di solo
        // backup remoto non aggiunge nulla â€” resta nel log tecnico e basta.
        // Il chiamante che ha bisogno di un riepilogo (es. piÃ¹ scritture
        // della stessa azione utente) lo mostra lui stesso, una volta sola.
        if(opzioni.soloLog) segnalaErroreSoloLog(risSupabase.error, `${contesto} (backup su Supabase)`);
        else segnalaErroreDb(risSupabase.error, `${contesto} (backup su Supabase)`);
      }
      return { ok: !risSupabase.error, errore: risSupabase.error||null };
    }catch(e){
      // Eccezione di rete: l'intera operazione (con il suo timestamp
      // originale) resta in coda, riparte identica al ritorno online.
      const coda = leggiCodaSync();
      coda.push({ id: generaIdLocale(), ts: ts||new Date().toISOString(), tipo, table, payload, match: matchObj, contesto });
      scriviCodaSync(coda);
      return { ok:true, accodato:true, errore:null }; // ok:true perchÃ© il locale Ã¨ comunque salvato, Ã¨ solo il backup remoto in sospeso
    }
  }
  // Normalizza un campo testo in maiuscolo, gestendo null/undefined.
  // Usata al posto di ripetere ovunque (campo||"").toUpperCase().
  const up = (v) => (v||"").toUpperCase();

  // Crea un evento su Supabase con i 13 campi standard della tabella
  // "events" e ne restituisce { data, error }, senza toccare lo stato
  // locale (quello resta a carico del chiamante, che sa giÃ  come
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
  // Da dove Ã¨ stato aperto il form "Nuovo/Modifica modello": determina dove
  // tornare dopo il salvataggio (lista Modelli, o il picker "Scegli modello"
  // se si stava scegliendo un modello per un evento). Senza questo, il
  // salvataggio riportava sempre al picker anche partendo dalla lista.
  const [origineModelForm, setOrigineModelForm] = useState("lista");
  const [editModello, setEditModello] = useState(null);
  const [modelForm, setModelForm] = useState({ titolo:"", tempo:"personalizzato", inizio:"", fine:"", coloreCustom:null, posizione:"" });

  // â”€â”€ Colori: popup assegnazione modelli + palette colori extra creati dall'utente
  const [showColorAssignPicker, setShowColorAssignPicker] = useState(null); // colore hex attualmente aperto nel popup
  const [colorAssignCalFiltro, setColorAssignCalFiltro] = useState(null); // calendari selezionati per filtrare la lista modelli nel popup colore (null = tutti)
  const [showAddColorPicker, setShowAddColorPicker] = useState(false); // popup "+" per aggiungere un colore alla sezione
  const [coloriExtra, setColoriExtra] = useState([]); // colori aggiunti manualmente o generati da modelli: array di {hex, label}
  // â”€â”€ Autocomplete: 5 liste dedicate, sincronizzate su Supabase (tabella
  // autocomplete_valori), una per campo. Caricate una volta all'avvio;
  // l'autocomplete legge SOLO da qui, mai scansionando eventi/modelli â€”
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

  // â”€â”€ Drag & drop modelli: scroll container + autoscroll a velocitÃ  variabile + preview ordine live
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
  // scrollabile, la lista scorre automaticamente, a velocitÃ  proporzionale
  // alla vicinanza al bordo. clientY Ã¨ la coordinata verticale del dito/mouse
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
  useEffect(()=>{ try{ localStorage.setItem('reportInterval', reportInterval); }catch(e){} }, [reportInterval]);
  // Mese selezionato per il report (persistente su localStorage, come
  // syncMode sopra): prima "1 mese" usava sempre new Date(), quindi il
  // report mostrava sempre il mese corrente e "dimenticava" la scelta ad
  // ogni uscita dall'app. Ora resta fissato al mese scelto finchÃ© l'utente
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
  useEffect(()=>{ try{ localStorage.setItem('reportDateFrom', reportDateFrom||""); }catch(e){} }, [reportDateFrom]);
  useEffect(()=>{ try{ localStorage.setItem('reportDateTo', reportDateTo||""); }catch(e){} }, [reportDateTo]);
  // Intervalli personalizzati memorizzati: {id,from,to} salvati dall'utente
  // per riselezionare con un tap un periodo ricorrente, invece di reimpostare
  // le due date da capo ogni volta (selezione piÃ¹ veloce).
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
    setReportDateFrom(iv.from);
    setReportDateTo(iv.to);
  }
  function rimuoviIntervalloSalvato(id){
    persistIntervalliSalvati(intervalliSalvati.filter(iv=>iv.id!==id));
  }
  const [openReportConfig, setOpenReportConfig] = useState(null);
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  const [indennita, setIndennita] = useState({ diurno:"", notturno:"", festivo:"", notturno_festivo:"" });
  const [conteggioConfigs, setConteggioConfigs] = useState({});
  const [showReportModelliPicker, setShowReportModelliPicker] = useState(null); // reportId aperto
  const [editFascia, setEditFascia] = useState(null); // key fascia in editing (nome/orario)
  const [showFasciaColorPicker, setShowFasciaColorPicker] = useState(null); // key fascia per cambio colore rapido

  const userId = session?.user?.id;
  const isInitialized = useRef(false);

  useEffect(()=>{
// #endregion

// #region SEZIONE 7: USEEFFECT INIT + LOAD DA SUPABASE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if(!userId) return;
    (async()=>{
      try {
        // Mostra subito i dati da localStorage, incluse le impostazioni
        // visive (colori, tema, fasce): senza queste, il calendario partiva
        // con i colori di default e "scattava" al colore vero dopo che
        // Supabase rispondeva â€” il flash visibile ad ogni apertura dell'app.
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
        // prima si prova un piccolo numero di retry, perchÃ© un fallimento
        // silenzioso qui lasciava l'utente con la cache locale mostrata in
        // precedenza â€” che puÃ² essere vuota (es. subito dopo "svuota cache")
        // dando la falsa impressione che i modelli/dati siano stati persi,
        // quando in realtÃ  sono ancora sul server e il problema era solo di
        // rete/caricamento.
        let all, rpcErr;
        for(let tentativo=0; tentativo<3; tentativo++){
          const risultato = await supabase.rpc("get_user_data", { p_user_id: userId });
          all = risultato.data; rpcErr = risultato.error;
          if(!rpcErr) break;
          if(tentativo<2) await new Promise(r=>setTimeout(r, 800*(tentativo+1)));
        }
        if(rpcErr){
          // Tutti i tentativi falliti: avviso VISIBILE invece di lasciare la
          // UI silenziosamente con la cache (che potrebbe sembrare "dati
          // spariti" mentre sono solo non ancora ricaricati).
          setBanner("âš ï¸ Impossibile caricare i dati dal server. Controlla la connessione e riprova (i tuoi dati sono al sicuro, non sono stati toccati).");
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

        // Ordino i calendari secondo sort_order (posizione scelta in Impostazioni con â†‘â†“),
        // cosÃ¬ l'ordine con cui vengono mostrati gli eventi resta coerente anche dopo un refresh.
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
        const savedConteggioConfigs = settings?.conteggio_configs || {};
        const savedFasce = settings?.fasce_automatiche || FASCE_AUTOMATICHE_DEFAULT;
        const savedSundayColor = settings?.sunday_color || "";
        const savedHolidayColor = settings?.holiday_color || "";
        const savedNationalHolsEnabled = settings?.national_hols_enabled || FESTIVITA_DEFAULT_ATTIVE;

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

        // Applico TUTTO insieme, in un solo giro di render: niente piÃ¹
        // calendario che appare prima e modelli/colori che arrivano dopo.
        const calendariUguali = cached && sameData(cached.calendars, calendars);
        const eventiUguali = cached && sameData(cached.events, events);
        const modelliUguali = cached && sameData(cached.modelli, modelliMappati);

        if(!(calendariUguali && eventiUguali)){
          setStore(s=>({ ...s, calendars, events, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings, fasceAutomatiche: savedFasce, sundayColor: savedSundayColor, holidayColor: savedHolidayColor, nationalHolsEnabled: savedNationalHolsEnabled }));
        } else {
          setStore(s=>({ ...s, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings, fasceAutomatiche: savedFasce, sundayColor: savedSundayColor, holidayColor: savedHolidayColor, nationalHolsEnabled: savedNationalHolsEnabled }));
        }
        // Aggiorno anche la cache delle impostazioni visive, cosÃ¬ il
        // prossimo avvio dell'app parte giÃ  col colore giusto, senza flash.
        saveToLocalStorage(events, calendars, modelliMappati, calId, {
          theme, extraHols, sundayColor: savedSundayColor, holidayColor: savedHolidayColor,
          fasceAutomatiche: savedFasce, nationalHolsEnabled: savedNationalHolsEnabled,
        });
        if(!modelliUguali){
          setModelli(modelliMappati);
        }
        setColoriExtra((coloriDb||[]).map(c=>({hex:c.hex, label:c.label||null})));
        setRotazioni(rotazioniMappate);
        setSheetsUrl(sUrl);
        setSheetsSecret(sSec);
        setIndennita(savedIndennita);
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

        // â”€â”€ Da qui in giÃ¹: sola manutenzione in background. Non serve per
        // mostrare il calendario, quindi non blocca nÃ© ridisegna la UI a meno
        // che trovi davvero qualcosa da correggere (casi rari).
        (async()=>{
          try {
            const { data: curStats } = await supabase.from("usage_stats").select("login_count").eq("user_id", userId).maybeSingle();
            const newCount = (curStats?.login_count || 0) + 1;
            await supabase.from("usage_stats").upsert({ user_id: userId, last_active: new Date().toISOString(), login_count: newCount });
          } catch(statErr) { segnalaErrore(statErr, "Aggiornamento statistiche di utilizzo"); }

          // Sincronizza i colori custom giÃ  presenti sui modelli con la tabella "colori"
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
            // DI OGNI SINGOLO CALENDARIO. Con piÃ¹ modelli che condividono lo
            // stesso sort_order (es. mai assegnato correttamente in passato,
            // o residuo di versioni precedenti dell'app), l'ordinamento
            // diventa ambiguo: la posizione calcolata di un modello puÃ² non
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

          // Fix "una tantum": unifica SOLO modelli realmente duplicati â€”
          // cioÃ¨ identici in ogni campo rilevante (titolo, nome mostrato,
          // tipo tempo, e se non h24 anche inizio/fine). NON unifica piÃ¹ per
          // "somiglianza" del titolo (es. contiene "PROTRAZIONE" +
          // "RECUPERO"): quel criterio unificava per errore modelli
          // DIVERSI creati apposta con nomi simili (es. "PROTRAZIONE
          // RECUPERO" e "- PROTRAZIONE A RECUPERO" sono due modelli
          // distinti, non un refuso dello stesso), cancellando quello piÃ¹
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
              // Per h24 l'orario non ha senso/non Ã¨ significativo: due h24
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
                // tutto per questa chiave): non c'Ã¨ nulla da unificare.
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
              // modelli doppioni, cosÃ¬ sparisce subito dalla UI.
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
          // completo troncato a metÃ  parola (es. "PROTRAZIONE RECUPERO" ->
          // "PROTRA..."). Questo fix riguarda SOLO i tre modelli
          // PROTRAZIONE (pagamento/recupero/-recupero), riconosciuti dalla
          // stessa radice usata altrove nel progetto; nessun altro modello
          // viene toccato, e un modello PROTRAZIONE con un nome breve giÃ 
          // impostato dall'utente (anche diverso da quello di default) non
          // viene sovrascritto.
          try {
            function normRadiceProtrazioneFix(t){
              return (t||"").trim().toUpperCase().replace(/\s+/g,"");
            }
            const labelDaAssegnare = [];
            for(const m of (modelliDb||[])){
              if((m.label||"").trim()) continue; // ha giÃ  un nome breve: non tocco
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
              // Aggiorno anche la label sugli eventi giÃ  creati da questi
              // modelli, cosÃ¬ il calendario mostra subito il nome breve
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

          // Fix "una tantum" (eseguito una sola volta per utente, mai piÃ¹
          // dopo â€” vedi flag in localStorage sotto): i modelli PROTRAZIONE
          // PAGAMENTO/RECUPERO creati da versioni precedenti avevano
          // tempo:"personalizzato" con un orario fittizio (es. 09:00-09:00)
          // invece di "h24", e un colore non allineato a quello scelto
          // dall'utente per PAGAMENTO (rosa). Corregge SOLO tempo/inizio/
          // fine, mai il colore se l'utente ne ha giÃ  impostato uno
          // (colore_custom valorizzato): dopo la prima esecuzione il flag
          // impedisce di rieseguirlo, cosÃ¬ eventuali scelte successive
          // dell'utente su questi modelli non vengono piÃ¹ toccate.
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
                if(m.tempo==="h24") continue; // giÃ  corretto, non tocco nulla
                const payloadFix = { tempo:"h24", inizio:null, fine:null };
                if(!m.colore_custom){
                  // Solo se l'utente non ha MAI scelto un colore custom:
                  // imposto un rosa di default (piÃ¹ chiaro per recupero, piÃ¹
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
          // del vecchio bug che poteva crearne piÃ¹ di uno per lo stesso
          // turno. Tiene sempre il piÃ¹ recente (created_at piÃ¹ alto, o id
          // piÃ¹ alto in mancanza di quel campo) e cancella gli altri, sia
          // da Supabase che dallo stato locale, cosÃ¬ spariscono subito dal
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

          // Fix "una tantum": elimina eventi PROTRAZIONE "orfani" residui â€”
          // cioÃ¨ un evento agganciato al modello PROTRAZIONE PAGAMENTO o
          // PROTRAZIONE RECUPERO (per marker import_id, o per modello+orario
          // quando il marker manca) il cui turno base collegato ha perÃ² il
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
              // prot*Fine corrispondente vuoto: la protrazione Ã¨ orfana.
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
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Svuota la coda di sincronizzazione offline: prova ogni operazione in
  // ordine (crea/modifica/elimina), la toglie dalla coda solo se riesce.
  // Se un'operazione fallisce di nuovo (rete ancora instabile, o un errore
  // reale stavolta), resta in coda per il prossimo tentativo â€” tranne se
  // l'errore non Ã¨ di rete, nel qual caso viene comunque segnalata
  // all'utente (stesso comportamento di sempre per gli errori "veri").
  async function processaCodaSync(){
    const coda = leggiCodaSync();
    if(coda.length===0) return;
    // Le operazioni piÃ¹ vecchie (ts piÃ¹ basso) vanno riprovate per prime:
    // se due dispositivi hanno modificato la stessa riga mentre uno era
    // offline, applicarle in ordine cronologico fa sÃ¬ che l'ultima
    // scrittura (quella con ts piÃ¹ recente) sia quella che resta valida.
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
          // Errore non di connessione (es. validazione, permessi): non ha
          // senso ritentarlo all'infinito, si segnala e si scarta.
          segnalaErrore(res.error, `Sincronizzazione in sospeso â€” ${op.contesto}`);
        } else {
          rimasti.push(null); // marcato come completato, verrÃ  filtrato sotto
        }
      } catch(e){
        // Eccezione di rete (offline di nuovo, timeout...): resta in coda,
        // si ritenterÃ  al prossimo giro. Nessun alert per questo caso â€”
        // Ã¨ lo scenario normale "sto ancora aspettando la connessione".
        rimasti.push(op);
      }
    }
    scriviCodaSync(rimasti.filter(Boolean));
    // Backup su Sheets con l'istantanea corrente (dopo aver smaltito la
    // coda Supabase): un solo invio per l'intero batch, invece di uno per
    // ogni operazione â€” Sheets riceve sempre lo stato completo, non un
    // incremento, quindi rimandarlo N volte non porterebbe beneficio.
    if(ordinata.length>0) syncSeAttivo(store.events, store.calendars, modelli);
  }
  useEffect(()=>{
    function goOnline(){ setIsOnline(true); processaCodaSync(); }
    function goOffline(){ setIsOnline(false); }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Anche all'avvio: se erano rimaste operazioni in coda da una sessione
    // precedente (es. l'app Ã¨ stata chiusa mentre era offline), si prova
    // subito a smaltirle.
    if(navigator.onLine) processaCodaSync();
    return ()=>{ window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  },[]);
// #endregion

// #region SEZIONE 9: THEME & COLORS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  // Colore dell'interfaccia (pulsanti, badge, evidenziazioni di selezione): FISSO e indipendente
  // dal colore scelto per i calendari, cosÃ¬ i colori dei calendari/modelli (es. giallo) restano
  // solo lÃ¬ dove servono a identificarli, senza "colorare" tutti i menu dell'app.
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
  function allEvts(key){
    const res=[];
    const soloCal = selectedCalIds.length>0 ? selectedCalIds : null; // visibilitÃ  eventi: sempre tutti i calendari selezionati, editMode o no
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
    // Modelli: senza questo passaggio, se il modello PROTRAZIONE Ã¨ prima di
    // AUTO in quella lista, la card della protrazione appare sopra invece
    // che sotto il turno a cui Ã¨ collegata.
    // Riconoscimento su DUE binari, perchÃ© non tutti gli eventi hanno il
    // marker import_id (quelli creati/modificati a mano dal form spesso non
    // ce l'hanno): 1) marker "protrazione_di_<id>_<tipo>" quando presente;
    // 2) altrimenti per modello+orario, cioÃ¨ l'evento usa un modello
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
        // base non Ã¨ (piÃ¹) presente in questo elenco, la protrazione va
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
          if(decodificaProtrazioneFiglio(f.importId)) return false; // giÃ  gestito dal marker
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
      ...updates,
      updated_at: new Date().toISOString(),
    });
    if(error) segnalaErroreDb(error, "Salvataggio impostazioni");
  }

  // Spostata qui da SEZIONE 18 (Settings View) perchÃ© usata anche da
  // Modelli View: aggiorna una fascia oraria automatica (label/colore/orario).
  function updateFascia(key, updates){
    const nuove = fasceAutomatiche.map(f=>f.key===key?{...f,...updates}:f);
    setStore(s=>({...s, fasceAutomatiche:nuove}));
    saveSettings({fasce_automatiche:nuove});
  }
// #endregion

// #region SEZIONE 10: CRUD CALENDARI
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Genera subito l'id lato client e lo ritorna insieme all'oggetto
  // calendario completo: il chiamante puÃ² aggiornare lo stato locale
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
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Calcola color/label/orari/shiftId/extraNote a partire dal form corrente.
  // Funzione condivisa (superset) usata sia da saveEvt che da updateEvt: contiene
  // TUTTI i rami di entrambe (gestione modelloId, shiftId, fixed/fixed30, extraNote),
  // cosÃ¬ nessuna delle due perde comportamento. Ogni chiamante decide se usare
  // extraNote o ignorarlo, ma il calcolo avviene sempre allo stesso modo per entrambi.
  function computeEventFields(form, cal, modelli){
    let color = form.colorOvr || cal.color;
    let label = (form.label||"Evento").toUpperCase();
    let tInFinal = form.dur==="allday"?"":form.tIn||"";
    let tOutFinal = form.dur==="allday"?"":form.tOut||"";
    if(form.modelloId){
      const mod = modelli.find(m=>m.id===form.modelloId);
      if(mod){
        color = form.colorOvr||(mod.coloreCustom||colByTime(mod.inizio));
        label = (mod.label||mod.titolo||label).toUpperCase();
        if(mod.tempo==="h24"){ tInFinal=""; tOutFinal=""; }
        else if(mod.tempo==="6h15"){
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||calcFine6h15(tInFinal)||"";
        } else if(mod.tempo==="6h30"){
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||calcFine6h30(tInFinal)||"";
        } else {
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||mod.fine||"";
        }
      }
    } else if(form.shiftId){
      const sh = cal.shifts?.find(s=>s.id===form.shiftId);
      if(sh){ color=form.colorOvr||sh.color; label=sh.label.toUpperCase(); }
    }
    if(form.dur==="fixed" && tInFinal && !form.modelloId){
      tOutFinal = form.tOut||calcFine6h15(tInFinal);
    }
    if(form.dur==="fixed30" && tInFinal && !form.modelloId){
      tOutFinal = form.tOut||calcFine6h30(tInFinal);
    }
    let extraNote = form.note||"";
    if(form.modelloId && tInFinal && tOutFinal){
      const mod=modelli.find(m=>m.id===form.modelloId);
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
  // agganciato a un turno base, riusando la colonna import_id (giÃ 
  // esistente su Supabase) invece di aggiungere una colonna nuova.
  function idProtrazioneFiglio(idEventoBase, tipo){
    return `protrazione_di_${idEventoBase}_${tipo}`;
  }

  // Decodifica il marker import_id di un evento: se l'evento Ãˆ esso stesso
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
  // e/o a recupero) agganciati a un turno base. Ogni figlio Ã¨ un evento
  // reale collegato al modello dedicato "PROTRAZIONE PAGAMENTO"/
  // "PROTRAZIONE RECUPERO" (trovato o creato al volo), con orario
  // inizio = uscita del turno base e orario fine = protPagFine/protRecFine:
  // questo lo fa entrare nei report che raggruppano per modelloId, esattamente
  // come giÃ  avviene per le protrazioni importate da PDF.
  async function sincronizzaEventiProtrazione({ idEventoBase, dayKey, calId, tInBase, tOutBase, protPagFine, protRecFine, menoRecIn, menoRecOut }){
    if(!idEventoBase||!dayKey||!calId||!userId) return;
    // Il terzo tipo (-PROTRAZIONE A RECUPERO, consumo del credito) non ha un
    // singolo range "da->a" come gli altri due: si sommano due scostamenti
    // indipendenti rispetto al turno base â€” ritardo in entrata (menoRecIn
    // dopo tInBase) e anticipo in uscita (menoRecOut prima di tOutBase).
    // L'evento risultante viene comunque rappresentato con un orario
    // inizio/fine coerente con la durata totale calcolata (a partire da
    // tOutBase, solo per farlo comparire/durare visivamente in modo
    // corretto sul calendario), ma il dato che conta Ã¨ la durata in minuti.
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
    // sempre la DURATA (differenza tIn/tOut), non l'orario in sÃ©.
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
    // closure di questa funzione: quest'ultima puÃ² essere ancora la
    // fotografia del render precedente quando saveEvt/updateEvt chiamano
    // sincronizzaEventiProtrazione subito dopo il proprio setStore, prima
    // che React abbia ri-renderizzato. Se cosÃ¬ fosse, un figlio di
    // protrazione giÃ  creato in una modifica precedente non verrebbe
    // trovato qui sotto (find fallirebbe), e verrebbe creato un secondo
    // evento doppione invece di aggiornare quello esistente.
    const evtiGiorno = storeRef.current.events?.[dayKey]?.[calId]||[];

    for(const { tipo, oraFine, durataOverride } of richieste){
      const marker = idProtrazioneFiglio(idEventoBase, tipo);
      // Auto-riparazione: se per lo stesso marker esistono giÃ  piÃ¹ eventi
      // figli (retaggio del bug di race condition risolto sopra, quando la
      // ricerca leggeva uno store non ancora aggiornato e ne creava un
      // secondo invece di trovare il primo), tengo solo il piÃ¹ vecchio e
      // cancello gli altri, cosÃ¬ il doppione sparisce automaticamente alla
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
      // Per "meno_recupero" la durata Ã¨ giÃ  quella calcolata sopra
      // (durataOverride), non va ricalcolata da tOutBase->oraFine.
      const durataMin = durataOverride!==undefined ? durataOverride : calcMinuti(tOutBase, oraFine);
      if(!oraFine || durataMin<=0){
        if(esistente) await delEvt(dayKey, calId, esistente.id);
        continue;
      }

      const mod = await trovaOCreaModelloProtrazione(tipo, calId);
      if(!mod) continue;
      const color = mod.coloreCustom || (tipo==="recupero" ? "#f9a8d4" : tipo==="meno_recupero" ? "#dc2626" : "#ec4899");
      // Il "nome da mostrare nel calendario" (mod.label) ha PRIORITÃ€ sul
      // titolo/codice (mod.titolo): stessa convenzione giÃ  usata altrove
      // (vedi computeEventFields piÃ¹ sopra). Con la vecchia priorità
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
        await scriviConBackup({
          tipo:"update", table:"events", payload, matchObj:match,
          contesto:`Aggiornamento protrazione ${tipo}`, ts:new Date().toISOString(),
          eventsPerSheets: store.events, calendarsPerSheets: store.calendars,
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
        await scriviConBackup({
          tipo:"insert", table:"events", payload, matchObj:null,
          contesto:`Creazione protrazione ${tipo}`, ts:new Date().toISOString(),
          eventsPerSheets: store.events, calendarsPerSheets: store.calendars,
          opzioni:{ soloLog:true },
        });
      }
    }
  }

  async function saveEvt(){
    if(!form||!dayKey||!calId||!userId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;
    const { color, label, tInFinal, tOutFinal, extraNote } = computeEventFields(form, cal, modelli);

    // L'id viene generato QUI, non piÃ¹ dal database: cosÃ¬ l'evento locale
    // e quello su Supabase condividono lo stesso id fin dal primo istante,
    // nessuna riconciliazione necessaria dopo che il server risponde.
    const idLocale = generaIdLocale();
    const payload = {
      id: idLocale,
      user_id: userId, calendar_id: calId, date_key: dayKey,
      label, color, all_day: form.dur==="allday"&&!form.modelloId,
      time_in: tInFinal, time_out: tOutFinal,
      place: up(form.place), map_url: form.map||"", note: up(extraNote),
      modello_id: form.modelloId||null, rotazione_id: form.rotazioneId||null,
      collega: up(form.collega), auto: up(form.auto),
      prot_pag_fine: form.protPagFine||null, prot_rec_fine: form.protRecFine||null,
      prot_meno_rec_in: form.protMenoRecIn||null, prot_meno_rec_out: form.protMenoRecOut||null,
      categoria_turno: form.categoriaTurno||null, categoria_app_auto: form.categoriaAppAuto||null,
    };

    // 1) SUBITO in locale: l'utente vede il turno all'istante, online o offline.
    const evt = {
      id: idLocale, color, label, allDay: payload.all_day,
      tIn: tInFinal||"", tOut: tOutFinal||"",
      place: payload.place||"", map: payload.map_url||"",
      note: payload.note||"", modelloId: payload.modello_id,
      rotazioneId: payload.rotazione_id,
      collega: payload.collega||null, auto: payload.auto||"",
      protPagFine: payload.prot_pag_fine||"", protRecFine: payload.prot_rec_fine||"",
      protMenoRecIn: payload.prot_meno_rec_in||"", protMenoRecOut: payload.prot_meno_rec_out||"",
      categoriaTurno: payload.categoria_turno||"", categoriaAppAuto: payload.categoria_app_auto||"",
    };
    if(!form.modelloId && form.label) registraValoreAutocomplete("titolo", label);
    if(form.auto) registraValoreAutocomplete("auto", form.auto);
    if(form.place) registraValoreAutocomplete("luogo", form.place);
    if(form.collega) registraValoriAutocomplete("collega", form.collega.split(/\r?\n/));
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
    // modelli dedicati PROTRAZIONE PAGAMENTO/RECUPERO, cosÃ¬ le ore di
    // protrazione entrano nei report (che raggruppano per modelloId).
    await sincronizzaEventiProtrazione({
      idEventoBase: idLocale, dayKey, calId,
      tInBase: tInFinal, tOutBase: tOutFinal,
      protPagFine: form.protPagFine||"", protRecFine: form.protRecFine||"",
      menoRecIn: form.protMenoRecIn||"", menoRecOut: form.protMenoRecOut||"",
    });
  }

  async function updateEvt(){
    const editCalId = form?.editCid || calId;
    if(!form||!dayKey||!editCalId||!userId||!form.editId) return;
    const cal = store.calendars.find(c=>c.id===editCalId);
    if(!cal) return;
    const { color, label, tInFinal, tOutFinal } = computeEventFields(form, cal, modelli);

    // Sincronizzazione inversa: se l'evento che sto modificando Ãˆ esso
    // stesso una protrazione-figlia (l'utente ha cambiato l'orario
    // direttamente sulla card PROTRAZIONE nel calendario, non sul campo
    // dentro AUTO), propago il nuovo orario di fine al campo
    // protPagFine/protRecFine del turno AUTO padre, cosÃ¬ restano sempre
    // allineati indipendentemente da dove viene fatta la modifica.
    const evtiGiornoCorrente = store.events?.[dayKey]?.[editCalId]||[];
    const evtCorrente = evtiGiornoCorrente.find(e=>e.id===form.editId);
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
      label, color, all_day: form.dur==="allday",
      time_in: tInFinal, time_out: tOutFinal,
      place: (form.place||"").toUpperCase(),
      map_url: form.map||"",
      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
      prot_pag_fine: form.protPagFine||null,
      prot_rec_fine: form.protRecFine||null,
      prot_meno_rec_in: form.protMenoRecIn||null,
      prot_meno_rec_out: form.protMenoRecOut||null,
      categoria_turno: form.categoriaTurno||null,
      categoria_app_auto: form.categoriaAppAuto||null,
    };
    const match = { id: form.editId, user_id: userId };

    if(!form.modelloId && form.label) registraValoreAutocomplete("titolo", label);
    if(form.auto) registraValoreAutocomplete("auto", (form.auto||"").toUpperCase());
    if(form.place) registraValoreAutocomplete("luogo", (form.place||"").toUpperCase());
    if(form.collega) registraValoriAutocomplete("collega", (form.collega||"").toUpperCase().split(/\r?\n/));

    // 1) SUBITO in locale.
    const patch = {label, color,
      allDay: form.dur==="allday", tIn: tInFinal, tOut: tOutFinal,
      place: (form.place||"").toUpperCase(), map: form.map||"",
      note: (form.note||"").toUpperCase(), modelloId: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(), auto: (form.auto||"").toUpperCase(),
      protPagFine: form.protPagFine||"", protRecFine: form.protRecFine||"",
      protMenoRecIn: form.protMenoRecIn||"", protMenoRecOut: form.protMenoRecOut||"",
      categoriaTurno: form.categoriaTurno||"", categoriaAppAuto: form.categoriaAppAuto||"",
    };
    const nuovoStore = withEventoAggiornato(store, dayKey, editCalId, form.editId, patch);
    saveToLocalStorage(nuovoStore.events, nuovoStore.calendars, modelli);
    setStore(nuovoStore);
    // Aggiorno anche il ref SUBITO (sincrono): la chiamata a
    // sincronizzaEventiProtrazione poco sotto deve vedere questo turno
    // giÃ  aggiornato E, soprattutto, l'eventuale figlio "-PROTRAZIONE A
    // RECUPERO" creato in un salvataggio precedente, che altrimenti (con
    // la "store" chiusa nella closure, ferma al render precedente) puÃ²
    // risultare non trovato e causare la creazione di un secondo
    // evento doppione invece di aggiornare quello giÃ  esistente.
    storeRef.current = nuovoStore;
    setForm(null); setDayKey(null);

    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    await scriviConBackup({
      tipo:"update", table:"events", payload, matchObj:match,
      contesto:"Modifica turno", ts:new Date().toISOString(),
      eventsPerSheets: nuovoStore.events, calendarsPerSheets: nuovoStore.calendars,
    });

    // 3) Sincronizzo (crea/aggiorna/rimuove) gli eventi "figli" di
    // protrazione, allo stesso modo di saveEvt â€” solo se l'evento
    // modificato Ã¨ un turno base e non una protrazione-figlia (nel
    // secondo caso l'aggiornamento Ã¨ giÃ  stato propagato sopra, punto 3bis).
    if(!decodificaMod){
      await sincronizzaEventiProtrazione({
        idEventoBase: form.editId, dayKey, calId: editCalId,
        tInBase: tInFinal, tOutBase: tOutFinal,
        protPagFine: form.protPagFine||"", protRecFine: form.protRecFine||"",
        menoRecIn: form.protMenoRecIn||"", menoRecOut: form.protMenoRecOut||"",
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

    // Sincronizzazione inversa: se l'evento che sto eliminando Ãˆ esso
    // stesso una protrazione-figlia (l'utente l'ha cancellata direttamente
    // dal calendario, non svuotando il campo su AUTO), risalgo al turno
    // AUTO padre e pulisco il campo protPagFine/protRecFine corrispondente,
    // altrimenti il padre resterebbe con un riferimento a un orario
    // di protrazione che in calendario non esiste piÃ¹.
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
    // "prev" in un'unica pipeline, cosÃ¬ nessuna delle due modifiche
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

    // 1b) Valore locale (non tocca lo stato React, giÃ  aggiornato sopra):
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
    if(delErr){ segnalaErroreDb(delErr, "Eliminazione eventi rotazione da d
