    import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./11-supabase";
import { scriviEsitoImport } from "./22-backup-stato";
import { ordineAttivo, impostaOrdineAttivo, posDaRiga, colonnePosizione, payloadPosCambiate, scambiaOrdini, mapGruppoDb, colGruppo, BANDA_A, classeModelloA, ordinaClassiA, minutiInizio } from "./21-ordine";
import { calcolaAllineamentoColori } from "./13-allinea-colori";
import { widgetDisponibile, inviaAlWidget, descriviStatoWidget } from "./17-widget";
import { scaricaFileTesto } from "./18-scarica-file";
import {
  FASCE_AUTOMATICHE_DEFAULT, FESTIVITA_DEFAULT_ATTIVE, MONTHS, NOMI_GIORNI_IT, PALETTE, COLORE_H24,
  calcFine6h15, calcFine6h30, calcFineModello, categoriaAppAutoAutomatica, categoriaTurnoAutomatica,
  daysInMonth, dkey, generaIdLocale, getColorByTime, getColorLabel,
  getContrastTextColor, getShiftBand, isFestivo, isModelloTurnazioneDefault, italianHols,
  leggiCodaSync, leggiErroriSilenziati, leggiLogErrori, loadFromLocalStorage, clearLocalStorageCache, minsOf,
  minutiTurnoModello, normalizzaOraHHMM, oraInMinuti, registraListenerCodaErrori, registraProblemiImport,
  registraAttivita, confermaSupabase, segnaInCodaSupabase, segnaEsitoSheets, aggiornaEsitoVoceLog, segnaContestoLog, impostaSorgenteLog,
  registraListenerLogSync, leggiLogDaSincronizzare, segnaLogSincronizzato, voceLogPerSupabase, diffDisposizione, impostaDettaglioImport,
  sameData, saveDatiSessioneLocale, saveToLocalStorage, scriviCodaSync, segnalaErrore, segnalaErroreSoloLog,
  verificaStrutturaSupabase,
  uid, withEventoAggiornato, withEventoAggiunto, withEventoRimosso,
  esportaBackupLocaleCompleto, importaBackupLocaleCompleto, CATEGORIE_BACKUP_LOCALE,
  applicaOpExtraHols, diffExtraHolsInOps, leggiOpExtraHols, scriviOpExtraHols, saveExtraHolsLocale,
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

// Calendari di destinazione degli import da foto. Se rinomini il calendario
// nell'app, cambia solo il nome qui sotto (confronto senza maiuscole/spazi).
const NOME_CAL_TURNI_PERSONALI = "FU";
const NOME_CAL_TURNI_STELLA = "COT";

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
  const flushExtraHolsRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [riordinaDopoCache, setRiordinaDopoCache] = useState(false);
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
    else confermaSupabase((data||[]).map(r=>r?.id));
    return { data, error };
  }
  async function dbDelete(table, matchObj, contesto, opzioni={}){
    const { data, error } = await supabase.from(table).delete().match(matchObj).select();
    if(error){
      if(opzioni.soloLog) segnalaErroreSoloLog(error, contesto);
      else segnalaErroreDb(error, contesto);
    }
    else confermaSupabase((data||[]).map(r=>r?.id));
    return { data, error };
  }
  async function dbInsert(table, payload, contesto, opzioni={}){
    const { data, error } = await supabase.from(table).insert(payload).select();
    if(error){
      if(opzioni.soloLog) segnalaErroreSoloLog(error, contesto);
      else segnalaErroreDb(error, contesto);
    }
    else confermaSupabase((data||[]).map(r=>r?.id));
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

  // Aggiornamenti "di massa" su events (es. cambio colore di un modello: tutti i turni di
  // quel modello): la conferma di Supabase vale per tutti i turni coinvolti.
  function idsConfermaPerMatch(table, match){
    if(table!=="events" || !match) return [];
    const campi = { modello_id:"modelloId", import_id:"importId", rotazione_id:"rotazioneId" };
    const chiavi = Object.keys(campi).filter(k=>match[k]!==undefined && match[k]!==null);
    if(chiavi.length===0) return [];
    const out = [];
    for(const calMap of Object.values(store.events||{}))
      for(const lista of Object.values(calMap||{}))
        for(const e of (lista||[])) if(chiavi.every(k=>e[campi[k]]===match[k])) out.push(e.id);
    return out;
  }

  async function scriviConBackupInterno({ tipo, table, payload, matchObj, contesto, ts, eventsPerSheets, calendarsPerSheets, modelliPerSheets, opzioni={} }){
    const idsOp = [ (payload && !Array.isArray(payload)) ? payload.id : null, matchObj?.id, ...idsConfermaPerMatch(table, matchObj) ].filter(Boolean);
    function accodaSilenziosamente(){
      // Locale è già scritto dal chiamante prima di arrivare qui: qui si
      // accoda solo il backup remoto, senza disturbare l'utente. Nessun
      // popup, nemmeno un banner — è lo stato normale "sto aspettando
      // che torni la linea", non un errore da segnalare.
      const coda = leggiCodaSync();
      coda.push({ id: generaIdLocale(), ts: ts||new Date().toISOString(), tipo, table, payload, match: matchObj, contesto });
      scriviCodaSync(coda);
      segnaInCodaSupabase(idsOp);
      return { ok:true, accodato:true, errore:null };
    }
    // ─── Se il browser segnala che non c'è connessione, non si tenta
    // nemmeno la scrittura: si accoda direttamente. Provare e fallire non
    // aggiunge informazione, aggiunge solo un giro a vuoto e rischio di
    // popup.
    programmaSheets(); // Sheets riceve SEMPRE l'ultimo stato (anche per modelli/posizioni/colori), in background
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
      const risSupabase = await provaSupabase(payload);
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
          confermaSupabase(idsOp);
          return { ok:true, verificaSaltata:true, errore:null };
        }
        const erroreVerifica = { message: verifica.motivo };
        segnalaErroreDb(erroreVerifica, `${contesto} (controllo dopo il salvataggio)`);
        return { ok:false, errore: erroreVerifica };
      }
      confermaSupabase(idsOp);
      return { ok:true, errore:null };
    }catch(e){
      // Eccezione di rete (offline, DNS non risolto, timeout...): l'intera
      // operazione (con il suo timestamp originale) resta in coda, riparte
      // identica al ritorno online. Nessun popup: è lo stato normale
      // "sto aspettando che torni la linea", non un errore dell'utente.
      return accodaSilenziosamente();
    }
  }
  // Conta le scritture verso Supabase ancora in corso: la sincronizzazione automatica aspetta che finiscano.
  async function scriviConBackup(arg){
    scrittureInVoloRef.current++;
    try{ return await scriviConBackupInterno(arg); }
    finally{ scrittureInVoloRef.current = Math.max(0, scrittureInVoloRef.current-1); }
  }
  // Scrive MOLTE modifiche in UNA sola richiesta (funzione DB applica_modifiche: tutto-o-niente).
  // ops = [{ tipo:"insert"|"update"|"delete", table, payload, matchObj, contesto }]
  // - senza linea / rete che cade: ogni operazione va nella coda offline, come in scriviConBackup;
  // - errore vero del server: il blocco non è applicato e si ripiega sulla scrittura una per una;
  // - verifica: usa il numero di righe toccate (una modifica che tocca 0 righe finisce nel Log).
  async function scriviBatchConBackup(arg){
    scrittureInVoloRef.current++;
    try{ return await scriviBatchConBackupInterno(arg); }
    finally{ scrittureInVoloRef.current = Math.max(0, scrittureInVoloRef.current-1); }
  }
  async function scriviBatchConBackupInterno({ ops, contesto, ts, opzioni={} }){
    const lista = (ops||[]).filter(Boolean);
    if(lista.length===0) return { ok:true, errore:null, errori:0 };
    const tsOp = ts || new Date().toISOString();
    const idsDi = o => [ (o.payload && !Array.isArray(o.payload)) ? o.payload.id : null, o.matchObj?.id, ...idsConfermaPerMatch(o.table, o.matchObj) ].filter(Boolean);
    const accoda = (elenco)=>{
      const coda = leggiCodaSync();
      elenco.forEach(o=>coda.push({ id: generaIdLocale(), ts: tsOp, tipo:o.tipo, table:o.table, payload:o.payload??null, match:o.matchObj??null, contesto:o.contesto||contesto }));
      scriviCodaSync(coda);
      segnaInCodaSupabase(elenco.flatMap(idsDi));
    };
    programmaSheets();
    if(typeof navigator!=="undefined" && navigator.onLine===false){
      accoda(lista);
      return { ok:true, accodato:true, errore:null, errori:0 };
    }
    let errori = 0;
    for(let i=0; i<lista.length; i+=500){
      const blocco = lista.slice(i, i+500);
      let risposta;
      try{
        risposta = await supabase.rpc("applica_modifiche", {
          p_ops: blocco.map(o=>({ tipo:o.tipo, table:o.table, payload:o.payload??null, match:o.matchObj??null })),
        });
      }catch(e){
        accoda(lista.slice(i));
        return { ok:true, accodato:true, errore:null, errori };
      }
      const { data, error } = risposta;
      if(error){
        if(eRoreDiRete(error)){
          accoda(lista.slice(i));
          return { ok:true, accodato:true, errore:null, errori };
        }
        segnalaErroreSoloLog(`Scrittura a blocchi non riuscita (${error.message||error.code||"errore"}): riprovo una modifica alla volta.`, `${contesto} (scrittura a blocchi)`);
        for(const o of blocco){
          const ris = await scriviConBackup({ tipo:o.tipo, table:o.table, payload:o.payload, matchObj:o.matchObj, contesto:o.contesto||contesto, ts:tsOp, opzioni });
          if(ris?.errore) errori++;
        }
        continue;
      }
      blocco.forEach((o,k)=>{
        if(o.tipo==="update" && !o.zeroOk && data?.[k]?.righe===0){
          errori++;
          segnalaErroreSoloLog(`Modifica su ${o.table} non trovata su Supabase (0 righe toccate)`, `${o.contesto||contesto} (controllo dopo il salvataggio)`);
        }
      });
      confermaSupabase(blocco.flatMap(idsDi));
    }
    return { ok: errori===0, errore: errori>0 ? { message:`${errori} operazioni non confermate` } : null, errori };
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
  const sheetsTimerRef = useRef(null);
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
  const materializzandoA = useRef(new Set());
  useEffect(()=>{ modelliRef.current = modelli; }, [modelli]);
  const [modelliSort, setModelliSort] = useState("orario");
  // Ordine dei modelli da vedere: "B" = orario, "A" = alfabetico. Vale per questo dispositivo; le posizioni sono nel database.
  const [ordineModelli, setOrdineModelliStato] = useState(()=>ordineAttivo());
  function cambiaOrdineModelli(nuovo){
    const n = nuovo==="A" ? "A" : "B";
    if(n===ordineAttivo()) return;
    impostaOrdineAttivo(n);
    const scambiati = (modelliRef.current||[]).map(scambiaOrdini);
    setModelli(scambiati);
    try{ saveToLocalStorage(store.events, store.calendars, scambiati, calId); }catch(e){}
    setOrdineModelliStato(n);
  }
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
  const [gruppi, setGruppi] = useState([]); // gruppi a tendina dei modelli: {id, calendarId, ordine:"A"|"B", nome, sortOrder}
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
    saveDatiSessioneLocale({ rotazioni, coloriExtra, gruppi, autocompleteValori, indennita, valoreTicket, conteggioConfigs });
  }, [rotazioni, coloriExtra, gruppi, autocompleteValori, indennita, valoreTicket, conteggioConfigs]);

  const [showReportModelliPicker, setShowReportModelliPicker] = useState(null); // reportId aperto
  const [editFascia, setEditFascia] = useState(null); // key fascia in editing (nome/orario)
  const [showFasciaColorPicker, setShowFasciaColorPicker] = useState(null); // key fascia per cambio colore rapido

  const userId = session?.user?.id;
  const isInitialized = useRef(false);
  // I dati dell'app sono quelli LOCALI (Supabase e' solo backup). Ogni cambio dei modelli
  // (riordino, colori, spostamenti...) viene scritto nel salvataggio locale: prima il riordino
  // restava solo in memoria + Supabase e al riavvio tornava alla posizione precedente.
  const primaPersistenzaModelli = useRef(true);
  useEffect(()=>{
    if(primaPersistenzaModelli.current){ primaPersistenzaModelli.current = false; return; }
    if(!isInitialized.current || !Array.isArray(modelli) || modelli.length===0) return;
    const t = setTimeout(()=>{ try{ saveToLocalStorage(undefined, undefined, modelli); }catch(e){} }, 300);
    return ()=>clearTimeout(t);
  }, [modelli]);

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
        // NUOVA VERSIONE INSTALLATA (APK o web): svuota UNA sola volta la cache
        // locale, come farebbe "Svuota cache e ricarica tutto" in Impostazioni,
        // cosi' non serve piu' premere il pulsante a mano dopo ogni installazione.
        // La versione corrente e' salvata solo a operazione riuscita: se non c'e'
        // linea, o ci sono modifiche in coda non ancora inviate, o l'app e' in
        // modalita' solo-locale (syncMode "off", es. dopo import backup), NON si
        // tocca nulla e si riprova al prossimo avvio, per non perdere dati.
        try {
          const versioneCorrente = typeof __APP_VERSION__!=="undefined" ? __APP_VERSION__ : null;
          const versioneSalvata = localStorage.getItem("turnipm_app_version");
          if(versioneCorrente && versioneSalvata!==versioneCorrente){
            // Non cancellare MAI la cache locale al cambio versione APK:
            // la cache locale garantisce il funzionamento offline dell'app.
            // Aggiorna semplicemente il marcatore di versione.
            localStorage.setItem("turnipm_app_version", versioneCorrente);
          }
        } catch(e){ segnalaErroreSoloLog(e, "Controllo versione app all'avvio"); }

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
          if(cached.gruppi !== undefined) setGruppi(cached.gruppi||[]);
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
        // REGOLA: i dati dell'app sono SOLO quelli locali. Supabase e' solo un backup e scrive nell'app
        // esclusivamente dopo Impostazioni -> "Importa da Supabase" (che imposta questo flag prima di ricaricare).
        let importaDaSupabase = false;
        try{ importaDaSupabase = localStorage.getItem("turnipm_pull_da_supabase")==="1"; localStorage.removeItem("turnipm_pull_da_supabase"); }catch(e){}
        if(!importaDaSupabase){
          isInitialized.current = true;
          setLoading(false);
          return;
        }
        if(typeof navigator!=="undefined" && navigator.onLine===false){
          scriviEsitoImport({ ok:false, titolo:"Importa da Supabase", messaggio:"Sei offline: nulla è stato importato. I dati del telefono non sono stati toccati." });
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
        const gruppiDb = all?.gruppi || [];
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
            visibileAncheIn: e.visibile_anche_in||[],
          });
        });

        const theme = settings?.theme||"auto";
        // Le modifiche ai giorni importanti fatte qui e non ancora arrivate sul server
        // (es. fatte senza linea) si rimettono sopra l'elenco del server: non scompaiono.
        const extraHols = applicaOpExtraHols(settings?.extra_hols||[], leggiOpExtraHols());
        const sUrl = settings?.sheets_url || "";
        const sSec = settings?.sheets_secret || "";
        const savedReports = settings?.reports || [];
        const savedReportSettings = settings?.report_settings || {};
        const savedIndennita = settings?.indennita || { diurno:"", notturno:"", festivo:"", notturno_festivo:"" };
        const savedValoreTicket = settings?.valore_ticket || "";
        const savedConteggioConfigs = settings?.conteggio_configs || {};
        let savedFasce = settings?.fasce_automatiche || FASCE_AUTOMATICHE_DEFAULT;
        // Correzione una tantum: la NOTTE inizia alle 18:01 (prima si sovrapponeva al 3° TURNO che finisce alle 18:00).
        try{
          const ntF = savedFasce.find(f=>f.key==="notte"), t3F = savedFasce.find(f=>f.key==="terzo_turno");
          if(ntF && t3F && ntF.from===1080 && t3F.to===1080){
            savedFasce = savedFasce.map(f=>f.key==="notte" ? {...f, from:1081} : f);
          }
        }catch(e){}
        const savedSundayColor = settings?.sunday_color || "";
        const savedHolidayColor = settings?.holiday_color || "";
        const savedNationalHolsEnabled = settings?.national_hols_enabled || FESTIVITA_DEFAULT_ATTIVE;
        const savedCalEventRows = settings?.cal_event_rows || 1;
        const savedCalRow1Field = settings?.cal_row1_field || "titolo";
        const savedCalRow2Field = settings?.cal_row2_field || "---";

        const modelliMappati = (modelliDb||[]).map(m=>({
          id:m.id, titolo:m.titolo, label:m.label||"", tempo:m.tempo,
          inizio:m.inizio||"", fine:m.fine||"",
          // Colore SEMPRE esplicito: se il modello non ha un colore salvato
          // (vecchio "automatico per orario") gli si assegna ora quello della
          // fascia corrente, e da qui in poi non cambia più da solo.
          colore:m.colore,
          coloreCustom:m.colore_custom || (m.tempo==="h24" ? COLORE_H24 : getColorByTime(m.inizio||"", savedFasce)),
          posizione:m.posizione||"", ...posDaRiga(m),
          calendarId:m.calendar_id||null,
          categoria:(m.categoria==="primo"||m.categoria==="secondo")?m.categoria:"",
          categoriaAppAuto:(m.categoria_app_auto==="app"||m.categoria_app_auto==="auto")?m.categoria_app_auto:((m.categoria==="app"||m.categoria==="auto")?m.categoria:""),
          turnoVuoto: !!m.categoria_turno_vuoto,
          appAutoVuoto: !!m.categoria_app_auto_vuoto,
          visibileAncheIn: m.visibile_anche_in||[],
        // La RPC get_user_data non garantisce l'ordine delle righe (nessun
        // ORDER BY lato server): senza un sort esplicito qui, l'ordine
        // visualizzato dipende dall'ordine fisico di Postgres, che può
        // cambiare dopo un update (es. dopo un drag&drop + refresh
        // ravvicinato) finché non si "ristabilizza" da solo. Ordiniamo
        // sempre per sortOrder (poi per id come spareggio stabile) così
        // il risultato è deterministico ad ogni caricamento.
        })).sort((a,b)=>{
          const sa = a.sortOrder || 0, sb = b.sortOrder || 0;
          if(sa!==sb) return sa-sb;
          const fa = classificaFasciaOrariaModello(a);
          const fb = classificaFasciaOrariaModello(b);
          if(fa!==fb) return fa-fb;
          const ma = a.tempo==="h24" ? 99999 : (oraInMinuti(a.inizio||"") ?? 99999);
          const mb = b.tempo==="h24" ? 99999 : (oraInMinuti(b.inizio||"") ?? 99999);
          if(ma!==mb) return ma-mb;
          return (a.titolo||"").localeCompare(b.titolo||"");
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
          scriviEsitoImport({ ok:false, titolo:"Importa da Supabase", messaggio:`NON applicato: Supabase ha ${nEventiNuovi} eventi contro i ${nEventiCache} già presenti sul telefono. Per sicurezza non ho toccato i dati del telefono, per evitare di cancellare turni per errore.` });
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
        scriviEsitoImport({ ok:true, titolo:"Dati aggiornati da Supabase", messaggio:`Importati: ${nEventiNuovi} eventi, ${modelliMappati.length} modelli, ${calendars.length} calendari.` + (nEventiCache ? ` Prima sul telefono: ${nEventiCache} eventi.` : "") });
        // Aggiorno anche la cache delle impostazioni visive, così il
        // prossimo avvio dell'app parte già col colore giusto, senza flash.
        impostaSorgenteLog("remoto");
        saveToLocalStorage(events, calendars, modelliMappati, calId, {
          theme, extraHols, sundayColor: savedSundayColor, holidayColor: savedHolidayColor,
          fasceAutomatiche: savedFasce, nationalHolsEnabled: savedNationalHolsEnabled,
          calEventRows: savedCalEventRows, calRow1Field: savedCalRow1Field, calRow2Field: savedCalRow2Field,
          reports: savedReports, reportSettings: savedReportSettings,
        });
        sincronizzaExtraHols();
        if(!modelliUguali){
          setModelli(modelliMappati);
        }
        // MIGRAZIONE una tantum: scrive su Supabase il colore esplicito dei
        // modelli che sul DB non avevano colore_custom (ex "automatici").
        try{
          const tsMig = new Date().toISOString();
          const righeSenzaColore = new Map((modelliDb||[]).filter(r=>!r.colore_custom).map(r=>[r.id,r]));
          const daMigrare = modelliMappati.filter(m=>righeSenzaColore.has(m.id));
          if(daMigrare.length>0){
            scriviBatchConBackup({
              ops: daMigrare.map(m=>({
                tipo:"update", table:"modelli",
                payload:{ colore:m.coloreCustom, colore_custom:m.coloreCustom },
                matchObj:{ id:m.id, user_id:userId },
                contesto:"Migrazione: colore esplicito sul modello",
              })),
              contesto:"Migrazione: colore esplicito sul modello", ts:tsMig, opzioni:{ soloLog:true },
            });
          }
        }catch(eMig){ segnalaErroreSoloLog(eMig?.message||String(eMig), "Migrazione colore esplicito modelli"); }
        setGruppi((gruppiDb||[]).map(mapGruppoDb));
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
        impostaSorgenteLog("remoto");
        saveToLocalStorage(events, calendars, modelliMappati, cached?.calId);
        isInitialized.current = true;
        setLoading(false);
        aggiornaCursoreSync(); // dopo Importa: dispositivo e Supabase sono allineati
        try{ if(localStorage.getItem("turnipm_riordina_dopo_cache")==="1") setRiordinaDopoCache(true); }catch(e){}

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
                colore:m.colore,coloreCustom:m.colore_custom||m.colore||null,
                posizione:m.posizione||"",...posDaRiga(m),
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
                colore:m.colore,coloreCustom:m.colore_custom||m.colore||null,
                calendarId:m.calendar_id||null,
                posizione:m.posizione||"",...posDaRiga(m),
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
                colore:m.colore,coloreCustom:m.colore_custom||m.colore||null,
                calendarId:m.calendar_id||null,
                posizione:m.posizione||"",...posDaRiga(m),
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
                  colore:m.colore,coloreCustom:m.colore_custom||m.colore||null,
                  calendarId:m.calendar_id||null,
                  posizione:m.posizione||"",...posDaRiga(m),
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
              if(tipo==="meno_recupero" || tipo==="meno_recupero_entrata" || tipo==="meno_recupero_uscita") continue;
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
  // ── Scrittura remota "write-ahead" ────────────────────────────────────
  // Ogni modifica viene PRIMA scritta in locale (stato + cache del dispositivo) e
  // messa nella coda persistente del dispositivo (sopravvive anche alla chiusura
  // dell'app); POI viene inviata a Supabase in background, con retry automatico e
  // conferma nel Log. Supabase è solo il backup: l'app non aspetta mai la sua risposta.
  const codaInCorsoRef = useRef(false);
  const codaRiprovaRef = useRef(false);
  const codaTimerRef = useRef(null);

  function programmaFlushCoda(ritardoMs=1200){
    if(codaTimerRef.current) clearTimeout(codaTimerRef.current);
    codaTimerRef.current = setTimeout(()=>{ codaTimerRef.current = null; processaCodaSync(); }, ritardoMs);
  }
  function accodaScrittureRemote(ops){
    if(!ops?.length) return;
    const coda = leggiCodaSync();
    const ts = new Date().toISOString();
    for(const o of ops) coda.push({ id: generaIdLocale(), ts, match:null, payload:null, onConflict:null, ...o });
    scriviCodaSync(coda);
    if(typeof navigator!=="undefined" && navigator.onLine===false){
      segnaInCodaSupabase(ops.flatMap(o=>[o.payload?.id, o.match?.id]).filter(Boolean));
    }
    programmaFlushCoda();
  }
  function accodaScritturaRemota(op){ accodaScrittureRemote([op]); }

  // Un solo svuotamento alla volta: se ne arriva un altro mentre il primo lavora,
  // viene rieseguito subito dopo (evita invii doppi e perdita di operazioni).
  async function processaCodaSync(){
    if(codaInCorsoRef.current){ codaRiprovaRef.current = true; return; }
    codaInCorsoRef.current = true;
    try{
      do{
        codaRiprovaRef.current = false;
        await processaCodaSyncInterno();
      }while(codaRiprovaRef.current);
    } finally { codaInCorsoRef.current = false; }
  }

  async function processaCodaSyncInterno(){
    sincronizzaExtraHols();
    const coda = leggiCodaSync();
    if(coda.length===0) return;
    // Se il browser segnala che non c'è connessione, non si tenta nemmeno
    // di svuotare la coda: nessuna richiesta parte, quindi nessun errore
    // in F12. Si riproverà al prossimo giro (evento 'online' o timer
    // periodico più sotto) — la linea assente non è un errore, è uno
    // stato normale di attesa.
    if(typeof navigator!=="undefined" && navigator.onLine===false) return;

    // Deduplica le operazioni di inserimento eventi in coda per evitare di
    // inserire duplicati se l'utente ha premuto più volte import o sync offline.
    const chiaviViste = new Set();
    const codaDeduplicata = [];
    for(const op of coda){
      if(op.tipo === "insert" && op.table === "events" && op.payload){
        const key = `${op.payload.calendar_id}_${op.payload.date_key}_${op.payload.label}_${op.payload.time_in}_${op.payload.time_out}`;
        if(chiaviViste.has(key)) continue;
        chiaviViste.add(key);
      }
      codaDeduplicata.push(op);
    }

    // Le operazioni più vecchie (ts più basso) vanno riprovate per prime:
    // se due dispositivi hanno modificato la stessa riga mentre uno era
    // offline, applicarle in ordine cronologico fa sì che l'ultima
    // scrittura (quella con ts più recente) sia quella che resta valida.
    const ordinata = [...codaDeduplicata].sort((a,b)=>(a.ts||"").localeCompare(b.ts||""));
    const rimasti = [];
    // Pre-passaggio: inserimenti e cancellazioni di eventi consecutivi, spediti a
    // blocchi (una richiesta ogni 50-100 righe invece di una per riga).
    const daElaborare = [];
    {
      const eIns = o => o.tipo==="insert" && o.table==="events" && o.payload;
      const eDel = o => o.tipo==="delete" && o.table==="events" && o.match?.id;
      let reteGiu = false;
      let i = 0;
      while(i<ordinata.length){
        const op = ordinata[i];
        if(eIns(op) || eDel(op)){
          const insieme = eIns(op) ? eIns : eDel;
          const max = eIns(op) ? 50 : 100;
          const blocco = [];
          let j = i;
          while(j<ordinata.length && blocco.length<max && insieme(ordinata[j])){ blocco.push(ordinata[j]); j++; }
          if(reteGiu){ rimasti.push(...blocco); i = j; continue; } // rete già caduta in questo giro: non si insiste
          let errBlocco = null;
          try{
            if(eIns(op)){
              const { error } = await supabase.from("events").insert(blocco.map(o=>o.payload));
              errBlocco = error || null;
            } else {
              const { error } = await supabase.from("events").delete().in("id", blocco.map(o=>o.match.id)).eq("user_id", userId);
              errBlocco = error || null;
            }
          }catch(e){ errBlocco = { message:String(e?.message||e), rete:true }; }
          if(!errBlocco){
            confermaSupabase(blocco.map(o=>o.payload?.id || o.match?.id).filter(Boolean));
          } else if(errBlocco.rete || eRoreDiRete(errBlocco)){
            reteGiu = true;
            rimasti.push(...blocco);
          } else {
            daElaborare.push(...blocco); // errore non di rete: si riprova una riga alla volta per isolare quella colpevole
          }
          i = j; continue;
        }
        daElaborare.push(op); i++;
      }
    }
    for(const op of daElaborare){
      async function provaSupabase(payloadCorrente, tentativi=0){
        if(tentativi>=10) return { error:{message:"Troppi tentativi di retry sullo schema"} };
        let q;
        if(op.tipo==="insert") q = supabase.from(op.table).insert(payloadCorrente);
        else if(op.tipo==="upsert") q = supabase.from(op.table).upsert(payloadCorrente, op.onConflict ? { onConflict: op.onConflict } : undefined);
        else if(op.tipo==="update") q = supabase.from(op.table).update(payloadCorrente).match(op.match);
        else q = supabase.from(op.table).delete().match(op.match);
        const { error } = await q;
        if(!error) return { error:null };
        const m = /Could not find the '([^']+)' column/.exec(error.message||"");
        if(m && Array.isArray(payloadCorrente) && payloadCorrente.some(r=>r && m[1] in r)){
          // invio a blocchi (array di righe): la colonna mancante si toglie da ogni riga
          segnalaErroreSoloLog(`Colonna '${m[1]}' assente su Supabase: omessa e riprovato automaticamente.`, `${op.contesto} (schema database)`);
          return provaSupabase(payloadCorrente.map(r=>{ if(!r) return r; const { [m[1]]: _omessa, ...resto } = r; return resto; }), tentativi+1);
        }
        if(m && payloadCorrente && !Array.isArray(payloadCorrente) && m[1] in payloadCorrente){
          segnalaErroreSoloLog(`Colonna '${m[1]}' assente su Supabase: omessa e riprovato automaticamente.`, `${op.contesto} (schema database)`);
          const { [m[1]]: _omessa, ...resto } = payloadCorrente;
          return provaSupabase(resto, tentativi+1);
        }
        return { error };
      }
      // Da quanto tempo questa operazione è ferma in coda, per decidere se
      // è ancora "sto aspettando la linea" o se è il caso di avvisare
      // l'utente che qualcosa non sta arrivando su Supabase da un pezzo.
      const etaMs = Date.now() - new Date(op.ts||Date.now()).getTime();
      const SOGLIA_AVVISO_MS = 15*60*1000; // 15 minuti
      try{
        const res = await provaSupabase(op.payload);
        if(res.error && op.tipo==="insert" && (res.error.code==="23505" || /duplicate key/i.test(res.error.message||""))){
          // Già presente su Supabase (invio precedente riuscito ma risposta persa): è fatto.
          rimasti.push(null);
          confermaSupabase([op.payload?.id].filter(Boolean));
          continue;
        }
        if(res.error){
          if(eRoreDiRete(res.error)){
            // Rete ballerina: la richiesta è arrivata ma è caduta a metà,
            // senza generare un'eccezione JS. Stesso trattamento del
            // ramo catch sotto: si riaccoda, ma se è lì da troppo tempo
            // l'utente va avvisato — non basta più dire "sto aspettando".
            rimasti.push(op);
            if(etaMs>SOGLIA_AVVISO_MS && !op._avvisato){
              op._avvisato = true;
              segnalaErrore(
                { message:`Questa modifica è in attesa di sincronizzarsi da più di ${Math.round(etaMs/60000)} minuti (rete instabile). È salvata solo su questo dispositivo finché la connessione non torna stabile.` },
                `Sincronizzazione in sospeso — ${op.contesto}`
              );
            }
          } else {
            // Errore vero (validazione, permessi...): non ha senso
            // ritentarlo all'infinito, si segnala e si scarta.
            segnalaErrore(res.error, `Sincronizzazione in sospeso — ${op.contesto}`);
            if(op.voceLogId) aggiornaEsitoVoceLog(op.voceLogId, "errore");
          }
        } else {
          rimasti.push(null); // marcato come completato, verrà filtrato sotto
          confermaSupabase([op.match?.id, op.payload?.id, ...idsConfermaPerMatch(op.table, op.match)].filter(Boolean));
          if(op.voceLogId) aggiornaEsitoVoceLog(op.voceLogId, "ok");
          if(op.marcaSnapshotOk){
            try{
              const raw = localStorage.getItem("disposizioneModelliBackup");
              if(raw){ const pp = JSON.parse(raw); pp.supabaseOk = true; localStorage.setItem("disposizioneModelliBackup", JSON.stringify(pp)); }
            }catch{}
          }
        }
      } catch(e){
        // Eccezione di rete (offline di nuovo, timeout...): resta in coda,
        // si ritenterà al prossimo giro. Stesso avviso-se-troppo-lunga di
        // sopra, per non lasciare l'utente all'oscuro a tempo indeterminato.
        rimasti.push(op);
        if(etaMs>SOGLIA_AVVISO_MS && !op._avvisato){
          op._avvisato = true;
          segnalaErrore(
            { message:`Questa modifica è in attesa di sincronizzarsi da più di ${Math.round(etaMs/60000)} minuti (rete instabile). È salvata solo su questo dispositivo finché la connessione non torna stabile.` },
            `Sincronizzazione in sospeso — ${op.contesto}`
          );
        }
      }
    }
    {
      // Operazioni accodate MENTRE si svuotava la coda (nuove modifiche dell'utente): vanno conservate.
      const idIniziali = new Set(coda.map(o=>o.id));
      const aggiuntiNelFrattempo = leggiCodaSync().filter(o=>!idIniziali.has(o.id));
      scriviCodaSync([...rimasti.filter(Boolean), ...aggiuntiNelFrattempo]);
    }
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
    text:    dark?"#f1f5f9":"#000000",
    sub:     dark?"#cbd5e1":"#000000",
    gap:     dark?"#1e293b":"#e2e8f0",
  };

  useEffect(()=>{ document.documentElement.style.background=T.bg; document.body.style.background=T.bg; document.documentElement.style.colorScheme=dark?"dark":"light"; },[dark]);

  const activeCal = store.calendars.find(c=>c.id===calId)||null;
  const mainCal   = store.calendars.find(c=>c.isMain)||null;
  const trovaCalIdPerNome = (nome)=> store.calendars.find(c=>(c.name||"").trim().toUpperCase()===nome.trim().toUpperCase())?.id || null;
  const calPersonaleId = trovaCalIdPerNome(NOME_CAL_TURNI_PERSONALI); // destinazione import foto "Turni personali"
  const calStellaId = trovaCalIdPerNome(NOME_CAL_TURNI_STELLA);       // destinazione import foto "Turni Stella"
  const calFuSalvatoId = store.reportSettings?.calFuId || null;
  // Calendario FU: collegato per ID (salvato in report_settings), quindi resta valido anche se rinominato.
  // Fallback sul nome "FU" solo finché il collegamento non è stato ancora creato.
  const calFuId = (calFuSalvatoId && store.calendars.some(c=>c.id===calFuSalvatoId)) ? calFuSalvatoId : trovaCalIdPerNome("FU");
  const mainCalId = mainCal?.id||null; // calendario principale: usato come fallback per i modelli/rotazioni senza calendarId esplicito

  // Collegamento automatico del calendario FU: la prima volta salva l'id del calendario
  // che oggi si chiama "FU" in report_settings (sincronizzato). Da lì in poi vale l'id, non il nome.
  useEffect(()=>{
    if(loading || !userId || !isInitialized.current || store.calendars.length===0) return;
    if(calFuSalvatoId && store.calendars.some(c=>c.id===calFuSalvatoId)) return;
    const idPerNome = trovaCalIdPerNome("FU");
    if(!idPerNome) return;
    const nuove = {...(store.reportSettings||{}), calFuId: idPerNome};
    setStore(s=>({...s, reportSettings: nuove}));
    saveSettings({report_settings: nuove});
  }, [loading, userId, store.calendars, calFuSalvatoId]);

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

  // "m" qui arriva dal calendario (03-Calendario.jsx) come month 0-based
  // (gennaio=0, es. month===today.getMonth()), esattamente come
  // Date.getMonth() in JavaScript. FESTIVITA_FISSE invece usa mesi
  // 1-based e leggibili (es. Natale m:12), stesso formato in cui l'utente
  // inserisce i Festivi Locali (extraHols, es. "9" per settembre). Va
  // quindi sommato 1 a "m" per confrontarlo correttamente con h.m in
  // entrambi i casi — la versione precedente confrontava 1-based con
  // 0-based direttamente e non trovava mai corrispondenza.
  function isRed(d,m){
    const meseUmano = m+1;
    return hols.some(h=>h.m===meseUmano&&h.d===d) ||
      (store.extraHols||[]).some(h=>!h.importante&&+h.m===meseUmano&&+h.d===d&&(h.y==null||+h.y===year));
  }
  const sundayColor = store.sundayColor || (dark?"#2d0a0a":"#fff5f5");
  const holidayColor = store.holidayColor || (dark?"#2d0a0a":"#fff5f5");
  function redBg(isSun,isH){
    if(isSun&&isH) return `linear-gradient(to bottom, ${sundayColor} 50%, ${holidayColor} 50%)`;
    return isSun?sundayColor:isH?holidayColor:null;
  }
  function getEvts(key,cid){
    const propri = store.events?.[key]?.[cid]||[];
    // Eventi "specchiati": appartengono ad ALTRI calendari ma sono stati
    // marcati (tramite il pulsante "Visualizza" nel form) come visibili
    // anche su questo calendario `cid`. Restano un'unica fonte di verità
    // (stesso colore/dati ovunque) — qui vengono solo aggiunti in lettura,
    // non duplicati come entità separate come fa invece "Copia".
    const giorno = store.events?.[key]||{};
    const specchiati = [];
    for(const altroCalId in giorno){
      if(altroCalId===cid) continue;
      const lista = giorno[altroCalId]||[];
      for(const e of lista){
        if(Array.isArray(e.visibileAncheIn) && e.visibileAncheIn.includes(cid)){
          specchiati.push(e);
        }
      }
    }
    return specchiati.length>0 ? [...propri, ...specchiati] : propri;
  }
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
  // "RECUPERO COMPENSATIVO INTERA GIORNATA": un giorno senza orario che CONSUMA 6h15 (375 min) dal credito
  // delle PROTRAZIONI A RECUPERO accumulato in giorni diversi (dal più vecchio, FIFO), come un "-PROTRAZIONE A RECUPERO".
  const MIN_RECUPERO_GIORNATA = 375;
  function eRecuperoGiornata(modelloId){
    if(!modelloId) return false;
    const mod = modelli.find(m=>m.id===modelloId);
    if(!mod) return false;
    const n = (mod.titolo||"").trim().toUpperCase().replace(/\s+/g,"");
    return n.includes("RECUPEROCOMPENSATIVO") && n.includes("INTERAGIORNATA") && tipoModelloPI(modelloId)!=="rc_pi";
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
    if(!selectedCalIds || selectedCalIds.length===0) return [];
    const res=[];
    // Un evento "specchiato" (visibileAncheIn) resta UN SOLO evento: quando
    // più calendari che lo vedono sono selezionati insieme (es. TURNI + FU +
    // PR), getEvts lo restituisce una volta per ciascun calendario e prima
    // finiva in `res` più volte, mostrando la stessa card ripetuta nella
    // cella del giorno. Qui si tiene solo la prima occorrenza per id,
    // assegnata al calendario "proprietario" (quello dove l'evento è stato
    // creato) quando è fra i selezionati, altrimenti al primo calendario
    // specchio incontrato — così l'evento compare una volta sola, coerente
    // con "non è una copia, è lo stesso evento visto da più calendari".
    const vistiIds = new Set();
    function pushUnico(e, cid){
      if(vistiIds.has(e.id)) return;
      vistiIds.add(e.id);
      res.push({...e,_cid:cid});
    }
    if(mainCal && selectedCalIds.includes(mainCal.id)) getEvts(key,mainCal.id).forEach(e=>pushUnico(e,mainCal.id));
    store.calendars.filter(c=>!c.isMain && selectedCalIds.includes(c.id)).forEach(c=>
      getEvts(key,c.id).forEach(e=>pushUnico(e,c.id)));
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
      if(ma!==mb) return ma-mb;
      // Stesso modello (o entrambi senza modello): a parità di modello
      // l'ordine non deve dipendere da COME/QUANDO l'evento è stato creato
      // (dal picker "Scegli modello" vs. altrove), che è arbitrario e
      // imprevedibile per l'utente. Criterio deterministico: prima per
      // orario di inizio crescente (un evento allDay/senza tIn va in coda
      // fra quelli con lo stesso modello), poi per id come ultima risorsa
      // stabile, così due eventi identici restano comunque in un ordine
      // fisso e riproducibile invece che "a caso".
      const tinA = a.tIn ? oraInMinuti(a.tIn) : null;
      const tinB = b.tIn ? oraInMinuti(b.tIn) : null;
      if(tinA==null && tinB!=null) return 1;
      if(tinA!=null && tinB==null) return -1;
      if(tinA!=null && tinB!=null && tinA!==tinB) return tinA-tinB;
      return String(a.id).localeCompare(String(b.id));
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

  // Invia al server le modifiche in coda a giorni importanti / festivi personali.
  // Legge l'elenco che c'e' ORA sul server, ci applica le sole operazioni in coda (per giorno)
  // e riscrive: cosi' telefono e PC si sommano, chi arriva prima arriva prima, e nulla si perde.
  async function sincronizzaExtraHols(){
    if(flushExtraHolsRef.current) return;
    if(!userId) return;
    if(typeof navigator!=="undefined" && navigator.onLine===false) return;
    const ops = leggiOpExtraHols();
    if(ops.length===0) return;
    flushExtraHolsRef.current = true;
    try{
      const { data, error:errLettura } = await supabase.from("user_settings").select("extra_hols").eq("user_id", userId).maybeSingle();
      if(errLettura) return;                       // resta in coda, si riprova
      const unito = applicaOpExtraHols(data?.extra_hols||[], ops);
      const { error } = await supabase.from("user_settings").upsert({ user_id:userId, extra_hols:unito, updated_at:new Date().toISOString() });
      if(error){ segnalaErroreSoloLog(error, "Salvataggio giorni importanti (riprovo piu' tardi)"); return; }
      const inviate = new Set(ops.map(o=>o.id));
      const restanti = leggiOpExtraHols().filter(o=>!inviate.has(o.id));
      scriviOpExtraHols(restanti);
      const finale = applicaOpExtraHols(unito, restanti);
      saveExtraHolsLocale(finale);
      setStore(s=>({...s, extraHols: finale}));
    }catch(e){
      // rete caduta: le operazioni restano in coda e si riprova al prossimo giro
    }finally{
      flushExtraHolsRef.current = false;
    }
  }

  async function saveSettings(updates={}){
    // Giorni importanti / festivi personali: PRIMA in locale, poi in coda verso Supabase (vedi sopra).
    const { extra_hols: nuovaExtraHols, ...altri } = updates;
    if(nuovaExtraHols!==undefined){
      const ops = diffExtraHolsInOps(store.extraHols||[], nuovaExtraHols);
      if(ops.length>0){
        scriviOpExtraHols([...leggiOpExtraHols(), ...ops]);
        saveExtraHolsLocale(nuovaExtraHols);
        sincronizzaExtraHols();
      }
    }
    if(!userId) return;
    if(Object.keys(altri).length===0) return;
    // NB: qui NON si manda piu' extra_hols: un dispositivo non aggiornato non puo' piu'
    // sovrascrivere i giorni importanti salvati da un altro.
    // Locale già aggiornato dal chiamante; l'invio a Supabase è accodato (con retry automatico).
    accodaScritturaRemota({
      tipo:"upsert", table:"user_settings",
      payload:{
        user_id: userId,
        theme: store.theme,
        cal_event_rows: store.calEventRows,
        cal_row1_field: store.calRow1Field,
        cal_row2_field: store.calRow2Field,
        ...altri,
        updated_at: new Date().toISOString(),
      },
      contesto:"Salvataggio impostazioni",
    });
  }

  // ── Quartine (I-IV): salvate dentro report_settings.quartine (colonna già esistente, nessuna modifica al DB).
  // coloreQuartina(key): colore di sfondo del giorno se appartiene a una quartina con "Visualizza" acceso.
  function coloreQuartina(key){
    const q = store.reportSettings?.quartine;
    if(!q || !q.date) return null;
    const n = q.date[key];
    if(!n || !q.visibili?.[n]) return null;
    return q.colori?.[n] || null;
  }
  // Elenco unico di TUTTI i colori usati dall'app (per la sezione "USATI" di ogni selettore colore):
  // colori con nome, fasce orarie, modelli, domeniche/festivi, calendari e turni, quartine. Senza doppioni.
  function coloriUsatiTutti(){
    // Solo colori che hanno un gruppo in Modelli > Colori: usati da almeno un modello (i colori registrati ma vuoti non compaiono).
    // Colori di calendari, turni, fasce, domeniche e quartine senza modelli NON compaiono (né in "USATI" né sottolineati).
    const visti = new Set(); const out = [];
    const add = (h)=>{ if(!h) return; const k=String(h).toLowerCase(); if(visti.has(k)) return; visti.add(k); out.push(h); };
    (modelliOrdinati||modelli||[]).forEach(m=>add(m.coloreCustom||m.colore));
    // Stesso ordine dei gruppi in Modelli > Colori: prima i colori registrati (per posizione),
    // poi gli altri nell'ordine dei modelli.
    const eq = (a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
    return out.map((h,i)=>({h,i,r:(coloriExtra||[]).find(c=>eq(c.hex,h))})).sort((a,b)=>{
      if(a.r&&b.r) return (a.r.sortOrder||0)-(b.r.sortOrder||0);
      if(a.r) return -1;
      if(b.r) return 1;
      return a.i-b.i;
    }).map(x=>x.h);
  }
  // Riordino dei colori dal selettore (tieni premuto e trascina): salva la posizione dei gruppi
  // di Modelli > Colori (coloriExtra.sortOrder), cosi' USATI e lista Colori hanno lo stesso ordine.
  // Accetta anche un elenco parziale: gli altri colori restano dove sono.
  async function riordinaColoriUsati(nuovoOrdine){
    if(!userId || !Array.isArray(nuovoOrdine) || nuovoOrdine.length===0) return;
    const eq = (a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
    const attuale = coloriUsatiTutti();
    const insieme = new Set(nuovoOrdine.map(h=>String(h).toLowerCase()));
    let k = 0;
    const completo = attuale.map(h=> insieme.has(String(h).toLowerCase()) && k<nuovoOrdine.length ? nuovoOrdine[k++] : h);
    const prev = coloriExtra||[];
    const nuovi = []; const daInserire = [];
    completo.forEach((h,i)=>{
      const r = prev.find(c=>eq(c.hex,h));
      if(r) nuovi.push({...r, sortOrder:i});
      else { const n = {hex:h, label:null, sortOrder:i}; nuovi.push(n); daInserire.push(n); }
    });
    prev.filter(c=>!completo.some(h=>eq(h,c.hex))).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0))
      .forEach((c,j)=>nuovi.push({...c, sortOrder:completo.length+j}));
    setColoriExtra(nuovi);
    const ts = new Date().toISOString();
    await scriviBatchConBackup({
      ops: daInserire.map(n=>({
        tipo:"insert", table:"colori", payload:{ user_id:userId, hex:n.hex, sort_order:n.sortOrder }, matchObj:null,
        contesto:"Riordino colori (registrazione colore)",
      })),
      contesto:"Riordino colori (registrazione colore)", ts, opzioni:{ soloLog:true },
    });
    await salvaModifichePosizioniColori(prev, nuovi.filter(c=>!daInserire.includes(c)));
  }
  function salvaQuartine(nuova){
    const nuove = {...(store.reportSettings||{}), quartine: nuova};
    setStore(s=>({...s, reportSettings: {...(s.reportSettings||{}), quartine: nuova}}));
    saveSettings({report_settings: nuove});
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
        color = form.colorOvr||(mod?.coloreCustom||colByTime(mod.inizio));
        label = (mod.label||mod.titolo||label).toUpperCase();
        // Orari SEMPRE quelli ufficiali del modello quando un modello è
        // selezionato: il campo Ingresso/Uscita in alto NON deve più poter
        // spostare l'identità/conteggio del turno (es. arrivare in ritardo
        // e recuperare a fine turno non deve trasformare "AUTO 13:45-20:00"
        // in un evento diverso "AUTO 13:51-20:06"). Chi vuole tracciare uno
        // scostamento reale usa i campi dedicati "Entrata/Uscita effettiva"
        // sotto PROTRAZIONE A RECUPERO, pensati apposta per questo.
        if(mod.tempo==="h24"){ tInFinal=form.offIn||"00:00"; tOutFinal=form.offOut||"24:00"; } // H24 = 00:00-24:00 (modificabile); l'evento resta allDay, i report non cambiano
        else {
          tInFinal = mod.inizio||"";
          // Se il modello ha una fine propria, quella resta "ufficiale" e
          // non modificabile dal campo Uscita in alto (comportamento
          // voluto, vedi commento sopra). Ma se il modello NON ha una fine
          // fissa (es. "PERSONALIZZATO" con solo l'ingresso definito),
          // non esiste alcun valore "ufficiale" da imporre: in quel caso
          // l'uscita inserita a mano in form.tOut è l'unica fonte, quindi
          // va rispettata invece di essere azzerata a "".
          tOutFinal = mod.fine || form.tOut || "";
          // Orario del turno cambiato per QUESTO evento (freccia accanto all'orario):
          // vale per l'evento, il modello non cambia.
          if(form.offIn) tInFinal = form.offIn;
          if(form.offOut) tOutFinal = form.offOut;
        }
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
    // "meno_recupero" (tipo singolo, storico) è stato sostituito da due
    // marker distinti — "meno_recupero_entrata" e "meno_recupero_uscita" —
    // per rappresentare separatamente il ritardo in entrata e l'anticipo
    // in uscita come due eventi indipendenti quando compresenti. La regex
    // riconosce entrambi i nuovi marker E il vecchio "meno_recupero" (per
    // compatibilità con eventi già esistenti creati prima di questo fix,
    // che restano validi finché non vengono risincronizzati).
    const m = /^protrazione_di_(.+?)_(pagamento|meno_recupero_entrata|meno_recupero_uscita|meno_recupero|recupero)$/.exec(importId);
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
    // Il terzo tipo (-PROTRAZIONE A RECUPERO, consumo del credito) NON è un
    // singolo range "da->a" come gli altri due, ed EVENT non deve essere
    // rappresentato con un orario virtuale spostato dopo la fine del turno:
    // deve invece mostrare l'INTERVALLO REALE in cui il ritardo/anticipo si
    // accavalla al turno stesso. Ci sono due scostamenti indipendenti,
    // ciascuno con il proprio intervallo reale:
    //  - ritardo in entrata: da tInBase (inizio previsto) a menoRecIn
    //    (arrivo effettivo) — es. turno 07:30-13:45, arrivo alle 08:00:
    //    intervallo 07:30-08:00.
    //  - anticipo in uscita: da menoRecOut (uscita effettiva) a tOutBase
    //    (fine prevista) — es. turno 07:30-13:45, esco alle 13:15:
    //    intervallo 13:15-13:45.
    // Se sono presenti ENTRAMBI insieme, non è rappresentabile con un solo
    // evento (i due intervalli non sono contigui, si accavallano a parti
    // diverse e lontane del turno): servono due eventi figli separati,
    // ciascuno con il proprio marker, indipendenti l'uno dall'altro.
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
    const minRitardo = minutiRitardoEntrata();
    const minAnticipo = minutiAnticipoUscita();

    const richieste = [
      { tipo:"pagamento", oraFine: protPagFine },
      { tipo:"recupero",  oraFine: protRecFine },
      // Ritardo in entrata: intervallo reale tInBase -> menoRecIn.
      { tipo:"meno_recupero_entrata", oraInizio: minRitardo>0 ? tInBase : "", oraFine: minRitardo>0 ? menoRecIn : "", durataOverride: minRitardo },
      // Anticipo in uscita: intervallo reale menoRecOut -> tOutBase.
      { tipo:"meno_recupero_uscita", oraInizio: minAnticipo>0 ? menoRecOut : "", oraFine: minAnticipo>0 ? tOutBase : "", durataOverride: minAnticipo },
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

    // MIGRAZIONE: rimuove l'eventuale evento "-PR RECUPERO" creato dalla
    // vecchia logica (marker singolo "protrazione_di_<id>_meno_recupero",
    // senza suffisso _entrata/_uscita). Quella versione posizionava
    // l'evento SEMPRE subito dopo la fine turno (tOutBase -> tOutBase+durata),
    // anche per un anticipo in uscita, invece di sovrapporlo alla porzione
    // reale del turno. Il codice attuale non lo trova più (cerca solo i
    // marker con suffisso) e quindi non lo aggiorna né lo sostituisce mai:
    // resta in giro per sempre con l'orario vecchio e sbagliato. Lo
    // eliminiamo qui esplicitamente a ogni sincronizzazione del turno base,
    // così i due eventi corretti (creati subito sotto) prendono il suo posto.
    const markerLegacy = idProtrazioneFiglio(idEventoBase, "meno_recupero");
    const legacyEsistenti = evtiGiorno.filter(e=>e.importId===markerLegacy);
    for(const legacy of legacyEsistenti){
      await delEvt(dayKey, calId, legacy.id);
    }

    for(const { tipo, oraInizio, oraFine, durataOverride } of richieste){
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
      // Per i due tipi meno_recupero_* la durata è già quella calcolata
      // sopra (durataOverride), non va ricalcolata da tOutBase->oraFine —
      // e per questi due tipi anche oraInizio deve essere valorizzato,
      // altrimenti l'intervallo reale non è determinabile.
      const eMenoRecupero = tipo==="meno_recupero_entrata" || tipo==="meno_recupero_uscita";
      const durataMin = durataOverride!==undefined ? durataOverride : calcMinuti(tOutBase, oraFine);
      if(!oraFine || (eMenoRecupero && !oraInizio) || durataMin<=0){
        if(esistente) await delEvt(dayKey, calId, esistente.id);
        continue;
      }

      const tipoModello = eMenoRecupero ? "meno_recupero" : tipo;
      const mod = await trovaOCreaModelloProtrazione(tipoModello, calId);
      if(!mod) continue;
      const color = mod?.coloreCustom || (tipoModello==="recupero" ? "#f9a8d4" : tipoModello==="meno_recupero" ? "#dc2626" : "#ec4899");
      // Il "nome da mostrare nel calendario" (mod.label) ha PRIORITÀ sul
      // titolo/codice (mod.titolo): stessa convenzione già usata altrove
      // (vedi computeEventFields più sopra). Con la vecchia priorità
      // invertita, un modello con titolo "PROTRAZIONE RECUPERO" e nome da
      // mostrare "PR RECUPERO" finiva comunque per etichettare l'evento
      // col titolo lungo, ignorando il nome scelto dall'utente.
      const label = (mod.label||mod.titolo||"").toUpperCase();
      // Intervallo reale dell'evento figlio: per pagamento/recupero resta
      // tOutBase->oraFine come sempre; per i due tipi meno_recupero_* è
      // invece l'intervallo reale calcolato sopra (oraInizio->oraFine),
      // che si accavalla a una porzione del turno base invece di stare
      // dopo la sua fine.
      const tInEvento = eMenoRecupero ? oraInizio : (tOutBase||"");
      const tOutEvento = oraFine;

      if(esistente){
        // Aggiorno l'evento figlio esistente (stesso pattern di updateEvt).
        const payload = {
          label, color, all_day:false,
          time_in: tInEvento, time_out: tOutEvento,
          modello_id: mod.id||null,
        };
        setStore(prev=>{
          const patch = { label, color, allDay:false, tIn: tInEvento, tOut: tOutEvento, modelloId: mod.id||null };
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
          time_in: tInEvento, time_out: tOutEvento,
          place:"", map_url:"", note:"",
          modello_id: mod.id||null, rotazione_id:null,
          collega:"", auto:"",
          prot_pag_fine:null, prot_rec_fine:null,
          import_id: marker,
        };
        const evt = {
          id: idLocale, color, label, allDay:false,
          tIn: tInEvento, tOut: tOutEvento,
          place:"", map:"", note:"", modelloId: mod.id||null, rotazioneId:null,
          collega:"", auto:"", importId: marker,
        };
        setStore(prev=>{
          const ns = withEventoAggiunto(prev, dayKey, calId, evt);
          saveToLocalStorage(ns.events, ns.calendars, modelli);
          storeRef.current = ns;
          return ns;
        });
        // Stesso bugfix del caso "Creazione turno": il calendario dell'evento
        // figlio (protrazione) deve restare visibile dopo il refresh.
        setSelectedCalIds(prev => prev.length===0 || prev.includes(calId) ? prev : [...prev, calId]);
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
      // "Nessuna categoria" scelto esplicitamente per questo asse su questo
      // singolo evento (disattiva l'automatismo, priorità massima).
      categoria_turno_vuoto: !!formEffettivo.turnoVuoto, categoria_app_auto_vuoto: !!formEffettivo.appAutoVuoto,
      // Override "solo questo evento" per l'inclusione/esclusione dai report
      // CATEGORIA REPORT (Turnazione, Piano Incentivante, Indennità, ecc.):
      // { [reportId]: "incluso"|"escluso" }. Ha priorità massima, sopra la
      // configurazione del modello nel report.
      report_overrides: (formEffettivo.reportOverrides && Object.keys(formEffettivo.reportOverrides).length>0) ? formEffettivo.reportOverrides : null,
      // Promemoria di ingresso/uscita realmente digitato dall'utente, separato
      // dagli orari ufficiali dell'evento (time_in/time_out, sempre uguali al
      // modello quando c'è un modello collegato). Serve solo per essere
      // rimostrato nel form al riapertura, non incide su report/conteggi.
      time_in_note: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tIn||null) : null,
      time_out_note: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tOut||null) : null,
      // Calendari aggiuntivi (oltre a quello di appartenenza calendar_id) su
      // cui questo evento deve comparire anche in sola visualizzazione,
      // impostati dal pulsante "Visualizza" nel form.
      visibile_anche_in: (formEffettivo.visibileAncheIn && formEffettivo.visibileAncheIn.length>0) ? formEffettivo.visibileAncheIn : null,
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
      turnoVuoto: !!payload.categoria_turno_vuoto, appAutoVuoto: !!payload.categoria_app_auto_vuoto,
      reportOverrides: payload.report_overrides||{},
      visibileAncheIn: payload.visibile_anche_in||[],
    };
    if(!formEffettivo.modelloId && formEffettivo.label) registraValoreAutocomplete("titolo", label);
    if(formEffettivo.auto) registraValoreAutocomplete("auto", formEffettivo.auto);
    if(formEffettivo.place) registraValoreAutocomplete("luogo", formEffettivo.place);
    if(formEffettivo.collega) registraValoriAutocomplete("collega", formEffettivo.collega.split(/\r?\n/));
    const nuovoStore = withEventoAggiunto(store, dayKey, calId, evt);
    saveToLocalStorage(nuovoStore.events, nuovoStore.calendars, modelli);
    setStore(nuovoStore);
    // BUGFIX: il calendario dell'evento appena creato deve restare visibile
    // anche dopo un refresh. selectedCalIds è persistito in localStorage e
    // filtra allEvts() quando non è vuoto (vedi 06-Logica.jsx allEvts): se
    // l'utente aveva già selezionato manualmente ALCUNI calendari (lista non
    // vuota) senza includere calId, l'evento veniva salvato correttamente
    // ma spariva dalla griglia mensile al primo reload, perché filtrato via
    // da un selectedCalIds che non lo conteneva — pur non essendoci alcun
    // errore di salvataggio (il dato era sempre presente su Supabase/locale).
    setSelectedCalIds(prev => prev.length===0 || prev.includes(calId) ? prev : [...prev, calId]);
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

  async function updateEvt(ambito){
    try{
      return await updateEvtInterno(ambito);
    }catch(e){
      // Stesso ragionamento di saveEvt: rete instabile qui non è un errore
      // vero, il locale è già a posto. Silenzioso, non un doppio popup.
      if(eRoreDiRete(e)) return;
      segnalaErrore(e, "Modifica turno (errore imprevisto)");
      alert("Si è verificato un errore imprevisto modificando il turno. L'errore è stato registrato nel Log (Impostazioni → Log). Controlla il calendario: la modifica potrebbe non essere stata salvata.");
    }
  }
  async function updateEvtInterno(ambito){
    // Ambito della modifica a "Visualizza": "questo" (solo questo evento),
    // "modello" (modello + tutti i suoi eventi) o "seguenti" (questo evento
    // e tutti i successivi dello stesso modello).
    const amb = (ambito==="modello"||ambito==="seguenti") ? ambito : "questo";
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
    if(decodificaMod){
      const { idEventoBase, tipo } = decodificaMod;
      const padreEsiste = evtiGiornoCorrente.some(e=>e.id===idEventoBase);
      if(padreEsiste){
        let patchLocale = null, patchDb = null;
        if(tipo==="pagamento"){
          patchLocale = { protPagFine: tOutFinal||"" };
          patchDb = { prot_pag_fine: tOutFinal||null };
        } else if(tipo==="recupero"){
          patchLocale = { protRecFine: tOutFinal||"" };
          patchDb = { prot_rec_fine: tOutFinal||null };
        } else if(tipo==="meno_recupero_entrata"){
          patchLocale = { protMenoRecIn: tOutFinal||"" };
          patchDb = { prot_meno_rec_in: tOutFinal||null };
        } else if(tipo==="meno_recupero_uscita"){
          patchLocale = { protMenoRecOut: tInFinal||"" };
          patchDb = { prot_meno_rec_out: tInFinal||null };
        }
        if(patchLocale && patchDb){
          setStore(prev=>{
            const ns = withEventoAggiornato(prev, dayKey, editCalId, idEventoBase, patchLocale);
            saveToLocalStorage(ns.events, ns.calendars, modelli);
            return ns;
          });
          await scriviConBackup({
            tipo:"update", table:"events", payload:patchDb,
            matchObj:{ id: idEventoBase, user_id: userId },
            contesto:`Propagazione orario protrazione ${tipo} sul turno base`, ts:new Date().toISOString(),
            eventsPerSheets: store.events, calendarsPerSheets: store.calendars,
            opzioni:{ soloLog:true },
          });
        }
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
      categoria_turno_vuoto: !!formEffettivo.turnoVuoto,
      categoria_app_auto_vuoto: !!formEffettivo.appAutoVuoto,
      // Vedi commento gemello in saveEvt: override "solo questo evento" per
      // CATEGORIA REPORT.
      report_overrides: (formEffettivo.reportOverrides && Object.keys(formEffettivo.reportOverrides).length>0) ? formEffettivo.reportOverrides : null,
      // Vedi commento gemello in saveEvt: promemoria separato dagli orari
      // ufficiali, per sopravvivere al refresh senza alterare il turno.
      time_in_note: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tIn||null) : null,
      time_out_note: formEffettivo.modelloId||formEffettivo.evtModelloId ? (formEffettivo.tOut||null) : null,
      // Vedi commento gemello in saveEvt: calendari aggiuntivi dove l'evento
      // è visibile in sola lettura tramite "Visualizza".
      visibile_anche_in: (formEffettivo.visibileAncheIn && formEffettivo.visibileAncheIn.length>0) ? formEffettivo.visibileAncheIn : null,
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
      turnoVuoto: !!formEffettivo.turnoVuoto, appAutoVuoto: !!formEffettivo.appAutoVuoto,
      reportOverrides: formEffettivo.reportOverrides||{},
      visibileAncheIn: formEffettivo.visibileAncheIn||[],
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

    // 2bis) Estensione della visibilità ("Visualizza") agli altri eventi
    // dello stesso modello, se scelto dall'utente.
    if(amb!=="questo" && formEffettivo.modelloId){
      const modId = formEffettivo.modelloId;
      const nuoveVis = formEffettivo.visibileAncheIn||[];
      const idsAltri = [];
      const ns2 = JSON.parse(JSON.stringify(nuovoStore));
      Object.keys(ns2.events||{}).forEach(dk=>{
        if(amb==="seguenti" && dk<dayKey) return;
        const lista = ns2.events[dk]?.[editCalId];
        if(!Array.isArray(lista)) return;
        ns2.events[dk][editCalId] = lista.map(e=>{
          if(e.modelloId!==modId || e.id===formEffettivo.editId) return e;
          idsAltri.push(e.id);
          return {...e, visibileAncheIn: nuoveVis};
        });
      });
      let modelliAgg = modelli;
      if(amb==="modello"){
        modelliAgg = modelli.map(m=>m.id===modId ? {...m, visibileAncheIn: nuoveVis} : m);
        setModelli(modelliAgg);
      }
      saveToLocalStorage(ns2.events, ns2.calendars, modelliAgg);
      setStore(ns2);
      storeRef.current = ns2;
      const ts2 = new Date().toISOString();
      const valoreDb = nuoveVis.length>0 ? nuoveVis : null;
      if(amb==="modello"){
        await scriviConBackup({
          tipo:"update", table:"modelli", payload:{ visibile_anche_in: valoreDb },
          matchObj:{ id: modId, user_id: userId },
          contesto:"Visualizza modello (da evento)", ts:ts2,
          opzioni:{ soloLog:true },
        });
      }
      await scriviBatchConBackup({
        ops: idsAltri.map(idEv=>({
          tipo:"update", table:"events", payload:{ visibile_anche_in: valoreDb },
          matchObj:{ id: idEv, user_id: userId },
          contesto:"Visualizza eventi del modello",
        })),
        contesto:"Visualizza eventi del modello", ts:ts2, opzioni:{ soloLog:true },
      });
    }

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
    let idEventoBasePulito = null, patchLocalePadre = {}, patchDbPadre = {};
    if(decodifica){
      const { idEventoBase, tipo } = decodifica;
      const padreEsiste = evtiGiorno.some(e=>e.id===idEventoBase);
      if(padreEsiste){
        idEventoBasePulito = idEventoBase;
        if(tipo==="pagamento"){
          patchLocalePadre = { protPagFine: "" };
          patchDbPadre = { prot_pag_fine: null };
        } else if(tipo==="recupero"){
          patchLocalePadre = { protRecFine: "" };
          patchDbPadre = { prot_rec_fine: null };
        } else if(tipo==="meno_recupero_entrata"){
          patchLocalePadre = { protMenoRecIn: "" };
          patchDbPadre = { prot_meno_rec_in: null };
        } else if(tipo==="meno_recupero_uscita"){
          patchLocalePadre = { protMenoRecOut: "" };
          patchDbPadre = { prot_meno_rec_out: null };
        } else if(tipo==="meno_recupero"){
          patchLocalePadre = { protMenoRecIn: "", protMenoRecOut: "" };
          patchDbPadre = { prot_meno_rec_in: null, prot_meno_rec_out: null };
        }
      }
    }

    setStore(prev=>{
      let ns = prev;
      if(idEventoBasePulito && Object.keys(patchLocalePadre).length>0){
        ns = withEventoAggiornato(ns, dKey, cId, idEventoBasePulito, patchLocalePadre);
      }
      ns = withEventoRimosso(ns, dKey, cId, evtId);
      for(const f of figli) ns = withEventoRimosso(ns, dKey, cId, f.id);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      storeRef.current = ns;
      return ns;
    });
    if(idEventoBasePulito && Object.keys(patchDbPadre).length>0){
      await scriviConBackup({
        tipo:"update", table:"events", payload:patchDbPadre,
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

  // ── Cancellazioni di massa: PRIMA in locale, POI su Supabase ─────────────
  // 1) stato dell'app + cache del dispositivo (il Log lo registra da qui, con l'elenco
  //    preciso dei turni); 2) cancellazione su Supabase a blocchi; se manca la rete
  //    le cancellazioni restano in coda e partono appena torna la linea.
  function accodaCancellazioniEventi(ids, contesto){
    accodaScrittureRemote(ids.map(id=>({ tipo:"delete", table:"events", match:{ id, user_id:userId }, contesto })));
  }

  async function eliminaEventiLocalFirst({ contesto, idsLocali, aggiorna, queryServer }){
    segnaContestoLog(contesto);
    if(idsLocali.length>0){
      setStore(prev=>{
        const ns = aggiorna(prev);
        saveToLocalStorage(ns.events, ns.calendars, modelli);
        syncSeAttivo(ns.events, ns.calendars);
        return ns;
      });
    }
    let idsServer = [];
    let reteOk = !(typeof navigator!=="undefined" && navigator.onLine===false);
    if(reteOk){
      try{
        const r = await queryServer();
        if(r?.error){
          if(eRoreDiRete(r.error)) reteOk = false;
          else segnalaErroreDb(r.error, contesto);
        } else idsServer = r?.ids || [];
      }catch{ reteOk = false; }
    }
    const tutti = [...new Set([...idsLocali, ...idsServer].map(String))];
    if(tutti.length===0) return;
    if(!reteOk){ accodaCancellazioniEventi(tutti, contesto); return; }
    for(let k=0; k<tutti.length; k+=100){
      const blocco = tutti.slice(k, k+100);
      try{
        const { error } = await supabase.from("events").delete().in("id", blocco).eq("user_id", userId);
        if(error){
          if(eRoreDiRete(error)){ accodaCancellazioniEventi(tutti.slice(k), contesto); return; }
          segnalaErroreDb(error, contesto);
          return;
        }
        confermaSupabase(blocco);
      }catch{ accodaCancellazioniEventi(tutti.slice(k), contesto); return; }
    }
  }

  async function delEvtiRotazioneDaData(rotazioneId, fromDateKey, cId, limit=null){
    let locali = [];
    for(const [dKey, calMap] of Object.entries(store.events||{})){
      if(dKey < fromDateKey) continue;
      for(const e of (calMap?.[cId]||[])) if(e.rotazioneId===rotazioneId) locali.push({ id:e.id, dKey });
    }
    locali.sort((a,b)=>a.dKey.localeCompare(b.dKey));
    if(limit) locali = locali.slice(0, limit);
    const idsLocali = locali.map(x=>x.id);
    await eliminaEventiLocalFirst({
      contesto:"Eliminazione eventi rotazione da data", idsLocali,
      aggiorna: prev=>{
        const ns = JSON.parse(JSON.stringify(prev));
        const idSet = new Set(idsLocali.map(String));
        for(const dKey of Object.keys(ns.events||{})){
          if(ns.events[dKey]?.[cId]) ns.events[dKey][cId] = ns.events[dKey][cId].filter(e=>!idSet.has(String(e.id)));
        }
        return ns;
      },
      queryServer: async()=>{
        if(limit) return { ids:[] }; // con limite fa fede l'elenco locale (stesso ordine per data)
        const { data, error } = await supabase.from("events").select("id")
          .eq("rotazione_id", rotazioneId).eq("user_id", userId).gte("date_key", fromDateKey);
        return { ids:(data||[]).map(r=>r.id), error };
      },
    });
  }

  async function delTutteEvtiRotazione(rotazioneId, cId){
    const idsLocali = [];
    for(const calMap of Object.values(store.events||{}))
      for(const e of (calMap?.[cId]||[])) if(e.rotazioneId===rotazioneId) idsLocali.push(e.id);
    await eliminaEventiLocalFirst({
      contesto:"Eliminazione eventi rotazione", idsLocali,
      aggiorna: prev=>{
        const ns = JSON.parse(JSON.stringify(prev));
        const idSet = new Set(idsLocali.map(String));
        for(const dKey of Object.keys(ns.events||{})){
          if(ns.events[dKey]?.[cId]) ns.events[dKey][cId] = ns.events[dKey][cId].filter(e=>!idSet.has(String(e.id)));
        }
        return ns;
      },
      queryServer: async()=>{
        const { data, error } = await supabase.from("events").select("id")
          .eq("rotazione_id", rotazioneId).eq("user_id", userId);
        return { ids:(data||[]).map(r=>r.id), error };
      },
    });
  }

  async function cancellaTuttiEventiMese(y, m, cId){
    // Cancella tutti gli eventi del mese (y=anno, m=mese 0-based) sul calendario cId
    const mm = String(m+1).padStart(2,"0");
    const ultimoGiorno = new Date(y, m+1, 0).getDate();
    const fromKey = `${y}-${mm}-01`;
    const toKey = `${y}-${mm}-${String(ultimoGiorno).padStart(2,"0")}`;
    const idsLocali = [];
    for(const [dKey, calMap] of Object.entries(store.events||{})){
      if(dKey>=fromKey && dKey<=toKey) for(const e of (calMap?.[cId]||[])) idsLocali.push(e.id);
    }
    await eliminaEventiLocalFirst({
      contesto:"Eliminazione eventi del mese", idsLocali,
      aggiorna: prev=>{
        const ns = JSON.parse(JSON.stringify(prev));
        for(const dKey of Object.keys(ns.events||{})){
          if(dKey>=fromKey && dKey<=toKey && ns.events[dKey]?.[cId]){
            delete ns.events[dKey][cId];
          }
        }
        return ns;
      },
      queryServer: async()=>{
        const { data, error } = await supabase.from("events").select("id")
          .eq("user_id", userId).eq("calendar_id", cId)
          .gte("date_key", fromKey).lte("date_key", toKey);
        return { ids:(data||[]).map(r=>r.id), error };
      },
    });
  }

  async function cancellaEventiMeseSelezione(y, m, calIds, modelloIds){
    // Cancella nel mese (y=anno, m=mese 0-based) gli eventi dei modelli scelti
    // sui calendari scelti (selezione multipla). "__nessuno__" indica gli
    // eventi senza modello. Tutto il resto del mese resta intatto.
    if(!calIds?.length || !modelloIds?.length) return;
    const VUOTO = "__nessuno__";
    const scelti = new Set(modelloIds);
    const mm = String(m+1).padStart(2,"0");
    const ultimoGiorno = new Date(y, m+1, 0).getDate();
    const fromKey = `${y}-${mm}-01`;
    const toKey = `${y}-${mm}-${String(ultimoGiorno).padStart(2,"0")}`;
    const idsLocali = [];
    for(const [dKey, calMap] of Object.entries(store.events||{})){
      if(dKey<fromKey || dKey>toKey) continue;
      for(const cId of calIds)
        for(const e of (calMap?.[cId]||[])) if(scelti.has(e.modelloId||VUOTO)) idsLocali.push(e.id);
    }
    await eliminaEventiLocalFirst({
      contesto:"Eliminazione eventi selezionati del mese", idsLocali,
      aggiorna: prev=>{
        const ns = JSON.parse(JSON.stringify(prev));
        for(const dKey of Object.keys(ns.events||{})){
          if(dKey<fromKey || dKey>toKey) continue;
          for(const cId of calIds){
            if(!ns.events[dKey]?.[cId]) continue;
            ns.events[dKey][cId] = ns.events[dKey][cId].filter(e=>!scelti.has(e.modelloId||VUOTO));
            if(ns.events[dKey][cId].length===0) delete ns.events[dKey][cId];
          }
        }
        return ns;
      },
      queryServer: async()=>{
        const { data, error } = await supabase.from("events").select("id, modello_id")
          .eq("user_id", userId).in("calendar_id", calIds)
          .gte("date_key", fromKey).lte("date_key", toKey);
        return { ids:(data||[]).filter(r=>scelti.has(r.modello_id||VUOTO)).map(r=>r.id), error };
      },
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
  // Nell'APK "/api/sheets" NON esiste (è una funzione del sito web): lì si chiama
  // direttamente lo script Google. Sul sito web resta il proxy.
  function inApk(){
    try{ return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform==="function" && window.Capacitor.isNativePlatform()); }catch(e){ return false; }
  }
  async function postSheets(customUrl, body){
    const res = inApk()
      ? await fetch(customUrl, { method:"POST", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(body) })
      : await fetch("/api/sheets", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    if(!res.ok) throw new Error(`Risposta ${res.status} da Sheets`);
    let j=null; try{ j = await res.json(); }catch(e){}
    if(j && (j.error || j.ok===false || j.success===false)) throw new Error(String(j.error||j.message||"Sheets ha risposto con un errore"));
    return j;
  }
  async function saveToSheets(events, calendars, customUrl=sheetsUrl, customSecret=sheetsSecret, modelliToSave=modelli){
    if(!customUrl) return "⚠️ Sheets non configurato";
    if(!isInitialized.current) return;
    try {
      await postSheets(customUrl, { secret: customSecret, action:"save", events, calendars, userId });
      await postSheets(customUrl, { secret: customSecret, action:"save_modelli", modelli: modelliToSave.map(m=>({
        ...m,
        fine: (m.tempo==="6h15"||m.tempo==="6h 15m")&&m.inizio ? calcFine6h15(m.inizio) : (m.tempo==="6h30"||m.tempo==="6h 30m")&&m.inizio ? calcFine6h30(m.inizio) : m.fine||"",
      }))});
      return "✅ Esportato su Sheets";
    } catch(e){
      segnalaErroreSoloLog(e?.message||String(e), "Salvataggio su Google Sheets");
      return "❌ Errore connessione Sheets";
    }
  }

  // Salvataggio automatico su Sheets: raggruppa le modifiche ravvicinate (3 s) e
  // invia l'ultimo stato completo. Segna l'esito (✓ / errore / in coda) nel Log.
  function programmaSheets(){
    if(syncMode!=='on' || !sheetsUrl) return;
    clearTimeout(sheetsTimerRef.current);
    sheetsTimerRef.current = setTimeout(eseguiSheetsInAttesa, 3000);
  }
  async function eseguiSheetsInAttesa(){
    if(typeof navigator!=="undefined" && navigator.onLine===false){
      segnaEsitoSheets("coda");
      const ripr = ()=>{ window.removeEventListener("online", ripr); eseguiSheetsInAttesa(); };
      window.addEventListener("online", ripr);
      return;
    }
    const esito = await saveToSheets(storeRef.current.events, storeRef.current.calendars, sheetsUrl, sheetsSecret, modelliRef.current);
    if(esito===undefined) return;
    segnaEsitoSheets(String(esito).startsWith("✅") ? "ok" : "errore");
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
      // Fetch paginato (dbSelectTutto): senza questo, oltre le 1000 righe
      // il pannello mostrava un conteggio troncato al limite del server
      // invece del totale reale (vedi commento su dbSelectTutto).
      const {data:cals}=await dbSelectTutto("calendars", {matchObj:{user_id:userId}, orderBy:"created_at", contesto:"Visualizzazione dati database (pannello admin) — calendari"});
      const {data:evts}=await dbSelectTutto("events", {matchObj:{user_id:userId}, orderBy:"date_key", ascending:false, contesto:"Visualizzazione dati database (pannello admin) — eventi"});
      setDbCalsCount(cals?.length||0);
      setDbEvtsCount(evts?.length||0);
      setDbRawData({calendars:cals||[],events:evts||[]});
    } catch(e){ segnalaErrore(e, "Visualizzazione dati database (pannello admin)"); }
  }

  async function buildBackupPayload(){
    // Stesso motivo: fetch paginato per garantire che il backup su Supabase
    // contenga DAVVERO tutto, non solo le prime 1000 righe di ogni tabella.
    const {data:cals} = await dbSelectTutto("calendars", {matchObj:{user_id:userId}, contesto:"Esportazione backup — calendari"});
    const {data:evts} = await dbSelectTutto("events", {matchObj:{user_id:userId}, contesto:"Esportazione backup — eventi"});
    const {data:mods} = await dbSelectTutto("modelli", {matchObj:{user_id:userId}, contesto:"Esportazione backup — modelli"});
    const {data:rots} = await dbSelectTutto("rotazioni", {matchObj:{user_id:userId}, contesto:"Esportazione backup — rotazioni"});
    const {data:colori} = await dbSelectTutto("colori", {matchObj:{user_id:userId}, contesto:"Esportazione backup — colori"});
    const {data:autocomplete} = await dbSelectTutto("autocomplete_valori", {matchObj:{user_id:userId}, contesto:"Esportazione backup — autocomplete"});
    const {data:gruppiBk} = await dbSelectTutto("gruppi_modelli", {matchObj:{user_id:userId}, contesto:"Esportazione backup — gruppi"});
    const {data:sett} = await supabase.from("user_settings").select("*").eq("user_id",userId).maybeSingle();
    return {
      exported_at: new Date().toISOString(),
      calendars: cals||[], events: evts||[], modelli: mods||[],
      rotazioni: rots||[], colori: colori||[], gruppi_modelli: gruppiBk||[], autocomplete_valori: autocomplete||[],
      user_settings: sett||null,
    };
  }

  // ─── BACKUP LOCALE (indipendente da Supabase) ───────────────────────
  // Esporta TUTTO il localStorage dell'app in un file .json che l'utente
  // scarica sul proprio dispositivo. A differenza del backup su Supabase
  // (handleExportSupabase sotto), questo non fa nessuna chiamata di rete:
  // legge solo ciò che è già salvato sul dispositivo in quel momento.
  async function handleEsportaBackupLocale(categorieSelezionate){
    try {
      // categorieSelezionate: array di id (vedi CATEGORIE_BACKUP_LOCALE in
      // 04-Rotazione.jsx) scelto nell'interfaccia (02-Modelli.jsx). Se
      // omesso, o se contiene TUTTE le categorie note, non passiamo alcun
      // filtro: esportaBackupLocaleCompleto tratta "categorie: null" come
      // "nessuna restrizione", comportamento identico a prima
      // dell'introduzione dei checkbox.
      const filtroCategorieDaPassare =
        Array.isArray(categorieSelezionate) && categorieSelezionate.length < CATEGORIE_BACKUP_LOCALE.length
          ? categorieSelezionate
          : null;
      const backup = esportaBackupLocaleCompleto({ dataInizio: backupPeriodoDa, dataFine: backupPeriodoA, categorie: filtroCategorieDaPassare });
      const bollino = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
      const esitoFile = await scaricaFileTesto(`turnipm_backup_locale_${bollino}.json`, JSON.stringify(backup, null, 2));
      if(!esitoFile.ok){ segnalaErrore(esitoFile.errore, "Backup locale (salvataggio file)"); return; }
      if(esitoFile.annullato) return; // dialogo chiuso senza salvare
      // "_numeroChiavi" conta le CATEGORIE di dati in localStorage (cache
      // principale, log errori, coda sync, impostazioni...), non i singoli
      // eventi: con tutto dentro poche chiavi (es. tutti gli eventi in
      // turnipm_cache_v1) il numero resta piccolo anche con un archivio
      // enorme, e da solo può sembrare un backup incompleto quando non lo
      // è. Per questo il messaggio mostra ANCHE i conteggi veri.
      // Con un filtro (periodo O categorie) attivo, il conteggio va letto
      // DAL BACKUP stesso (già filtrato), non dallo stato in memoria
      // (store.events), altrimenti il messaggio mostrerebbe il totale non
      // filtrato anche quando il file scaricato ne contiene di meno.
      const filtroAttivo = !!(backup._filtroPeriodo || backup._filtroCategorie);
      // CONTROLLO AUTOMATICO: i numeri vengono letti DAL FILE appena creato
      // e (senza filtri) confrontati con ciò che c'è ora nell'app.
      const cacheFile = backup.localStorage?.["turnipm_cache_v1"]?.json || {};
      const contaEv = ev => Object.values(ev||{}).reduce((sum,calMap)=>
        sum + Object.values(calMap||{}).reduce((s2,arr)=>s2+(arr?.length||0), 0), 0);
      const nelFile = { E:contaEv(cacheFile.events), C:(cacheFile.calendars||[]).length, M:(cacheFile.modelli||[]).length, R:(cacheFile.rotazioni||[]).length };
      const nellApp = { E:contaEv(storeRef.current?.events||store.events), C:(storeRef.current?.calendars||store.calendars||[]).length,
                        M:(modelliRef.current?.length ? modelliRef.current.length : (modelli?.length||0)), R:(rotazioni?.length||0) };
      const coincide = nelFile.E===nellApp.E && nelFile.C===nellApp.C && nelFile.M===nellApp.M && nelFile.R===nellApp.R;
      const etichettaPeriodo = backup._filtroPeriodo
        ? ` — periodo ${backup._filtroPeriodo.dataInizio||"inizio"} → ${backup._filtroPeriodo.dataFine||"oggi"}`
        : "";
      const riga = `${nelFile.E} eventi, ${nelFile.C} calendari, ${nelFile.M} modelli, ${nelFile.R} rotazioni`;
      let messaggio, tipo="ok";
      if(filtroAttivo){
        messaggio = `Backup locale scaricato${etichettaPeriodo} (con filtro) — il file contiene ${riga}.`;
      } else if(coincide){
        messaggio = `✅ Backup locale scaricato e VERIFICATO: il file contiene ${riga}, gli stessi dati dell'app.`;
      } else {
        tipo = "errore";
        messaggio = `⚠️ Backup locale scaricato ma NON coincide con l'app. File: ${riga}. App: ${nellApp.E} eventi, ${nellApp.C} calendari, ${nellApp.M} modelli, ${nellApp.R} rotazioni.`;
      }
      registraAttivita("Backup locale", messaggio, { chiave:"backup-locale", supabase:"n/a" });
      setEsitoBackupLocale({tipo, messaggio});
    } catch(e){
      segnalaErrore(e, "Esportazione backup locale");
      setEsitoBackupLocale({tipo:"errore", messaggio:"Errore durante l'esportazione: "+(e?.message||e)});
    }
  }

  // Legge il file scelto dall'utente e lo tiene in attesa di conferma
  // (confermaImportLocale) prima di scrivere qualunque cosa: l'import
  // sovrascrive tutto il localStorage esistente, quindi serve una
  // conferma esplicita mostrata nell'interfaccia, non un window.confirm
  // silenzioso facile da cliccare via per sbaglio.
  function handleFileSelezionatoImportLocale(file){
    if(!file) return;
    setEsitoBackupLocale(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const backup = JSON.parse(ev.target.result);
        if(!backup || backup._tipo !== "turnipm_backup_locale" || !backup.localStorage){
          setEsitoBackupLocale({tipo:"errore", messaggio:"Il file selezionato non è un backup locale valido di questa app."});
          return;
        }
        setConfermaImportLocale(backup);
      } catch(e){
        setEsitoBackupLocale({tipo:"errore", messaggio:"Il file selezionato non è un JSON valido."});
      }
    };
    reader.onerror = () => setEsitoBackupLocale({tipo:"errore", messaggio:"Impossibile leggere il file selezionato."});
    reader.readAsText(file);
  }

  // Eseguita solo dopo la conferma esplicita dell'utente nel modale.
  function confermaEsegueImportBackupLocale(){
    if(!confermaImportLocale) return;
    const risultato = importaBackupLocaleCompleto(confermaImportLocale);
    setConfermaImportLocale(null);
    if(risultato.ok){
      setEsitoBackupLocale({tipo:"ok", messaggio:risultato.messaggio+" Ricarico l'app…"});
      setTimeout(()=>window.location.reload(), 1800);
    } else {
      segnalaErrore({message:`Import backup locale: ${risultato.errori.length} chiavi non scritte (${risultato.errori.map(e=>e.chiave).join(", ")})`}, "Importazione backup locale");
      setEsitoBackupLocale({tipo:"errore", messaggio:risultato.messaggio});
    }
  }

  // ESPORTA SU SUPABASE = copia esatta di ciò che c'è SUL TELEFONO dentro Supabase.
  // (Prima salvava solo una copia di quello che Supabase conteneva già: per questo non cambiava nulla.)
  // 1) paracadute: salva in "backups" lo stato attuale di Supabase;
  // 2) scrive (upsert per id) calendari, rotazioni, modelli, eventi, colori dal locale;
  // 3) toglie da Supabase le righe che sul telefono non esistono (doppioni);
  // 4) rilegge i conteggi e li confronta col locale.
  const [esitoExportSupabase, setEsitoExportSupabase] = useState(null); // null | {titolo, stato:"corso"|"fine", ok, messaggio}

  // ───────── SINCRONIZZA ORA (solo differenze, in sola lettura da Supabase) ─────────
  const CURSORE_SYNC_KEY = "turnipm_sync_cursore";
  async function leggiOrarioServer(){
    try{
      const {data,error} = await supabase.rpc("get_changes", { p_user_id:userId, p_since:"2999-01-01T00:00:00Z" });
      if(error) return null;
      return data?.server_now || null;
    }catch(e){ return null; }
  }
  // Imposta il "punto di partenza" = orario del SERVER ora. Va chiamato solo quando questo
  // dispositivo e Supabase contengono gli stessi dati (dopo Esporta o dopo Importa riusciti).
  async function aggiornaCursoreSync(){
    const t = await leggiOrarioServer();
    if(t){ try{ localStorage.setItem(CURSORE_SYNC_KEY, t); }catch(e){} }
  }
  // ── confronto/mappature riga-Supabase → dato locale (usate da Sincronizza ora e dall'automatica) ──
  const SYNC_AUTO_KEY = "turnipm_sync_auto";
  const [syncAuto, setSyncAutoState] = useState(()=>{ try{ return localStorage.getItem(SYNC_AUTO_KEY)!=="0"; }catch(e){ return true; } });
  function impostaSyncAuto(v){ setSyncAutoState(!!v); try{ localStorage.setItem(SYNC_AUTO_KEY, v?"1":"0"); }catch(e){} }
  const sincInCorsoRef = useRef(false);
  const ultimaSyncAutoRef = useRef(0);
  const scrittureInVoloRef = useRef(0);
  const syncAutoFnRef = useRef(null);
  const sincRifiutataRef = useRef(false); // l'utente ha annullato un aggiornamento >80%: in automatico non lo richiedo piu' in questa sessione

  const normSync = v=>{
    if(v==null || v===false || v==="") return "";
    if(Array.isArray(v)) return v.length ? JSON.stringify(v) : "";
    if(typeof v==="object") return Object.keys(v).length ? JSON.stringify(v) : "";
    return String(v);
  };
  // true se il dato locale "a" contiene gli stessi valori di "b" su tutti i campi di "b"
  const ugualiSync = (a,b)=> !!a && Object.keys(b).every(k=>{
    // la fine dei modelli 6h15/6h30 si calcola dalla durata: se qui è vuota e su Supabase l'ha completata il database, non è una differenza
    if(k==="fine" && (b.tempo==="6h15"||b.tempo==="6h30") && !normSync(a.fine)) return true;
    return normSync(a[k])===normSync(b[k]);
  });
  const mapEvSync = e=>({
    id:e.id, label:e.label, color:e.color, allDay:e.all_day,
    tIn:e.time_in||"", tOut:e.time_out||"", place:e.place||"",
    tInNote:e.time_in_note||"", tOutNote:e.time_out_note||"",
    map:e.map_url||"", note:e.note||"",
    modelloId:e.modello_id||null, rotazioneId:e.rotazione_id||null, collega:e.collega||null,
    auto:e.auto||"", parentId:e.parent_id||null,
    protPagFine:e.prot_pag_fine||"", protRecFine:e.prot_rec_fine||"",
    protMenoRecIn:e.prot_meno_rec_in||"", protMenoRecOut:e.prot_meno_rec_out||"",
    categoriaTurno:e.categoria_turno||"", categoriaAppAuto:e.categoria_app_auto||"",
    turnoVuoto:!!e.categoria_turno_vuoto, appAutoVuoto:!!e.categoria_app_auto_vuoto,
    reportOverrides:e.report_overrides||{}, importId:e.import_id||null,
    visibileAncheIn:e.visibile_anche_in||[],
  });
  const mapCalSync = c=>({ id:c.id, name:c.name, color:c.color, isMain:c.is_main, shifts:c.shifts||[] });
  const mapModSync = (m,fasce)=>({
    id:m.id, titolo:m.titolo, label:m.label||"", tempo:m.tempo,
    inizio:m.inizio||"", fine:m.fine||"", colore:m.colore,
    coloreCustom:m.colore_custom || (m.tempo==="h24" ? COLORE_H24 : getColorByTime(m.inizio||"", fasce)),
    posizione:m.posizione||"", ...posDaRiga(m), calendarId:m.calendar_id||null,
    categoria:(m.categoria==="primo"||m.categoria==="secondo")?m.categoria:"",
    categoriaAppAuto:(m.categoria_app_auto==="app"||m.categoria_app_auto==="auto")?m.categoria_app_auto:((m.categoria==="app"||m.categoria==="auto")?m.categoria:""),
    turnoVuoto:!!m.categoria_turno_vuoto, appAutoVuoto:!!m.categoria_app_auto_vuoto,
    visibileAncheIn:m.visibile_anche_in||[],
  });
  const mapRotSync = r=>({
    id:r.id, tipo:r.tipo, titolo:r.titolo, dataInizio:r.data_inizio||"", nSettimane:r.n_settimane||52,
    modellaLavoroId:r.modello_lavoro_id||null, modelloNLId:r.modello_nl_id||null, modelloRSId:r.modello_rs_id||null,
    modelloG3Id:(r.griglia||{}).__modelloG3Id||null, modelloG4Id:(r.griglia||{}).__modelloG4Id||null,
    griglia:r.griglia||{}, reperibilitaTurnoPartenza:(r.griglia||{}).__reperibilitaTurnoPartenza||"14-24",
    sortOrder:r.sort_order||0,
  });

  // Confronto completo (solo per il "punto di partenza automatico"): quante righe differiscono?
  function contaDifferenzeSync(full, loc, modelliCor, rotCor, colCor, fasce){
    const out = { eventi:0, modelli:0, calendari:0, rotazioni:0, colori:0 };
    const locEv = new Map();
    Object.entries(loc.events||{}).forEach(([dk,byc])=>Object.entries(byc||{}).forEach(([cid,lst])=>(lst||[]).forEach(e=>locEv.set(e.id,{dk,cid,e}))));
    const srvEv = new Set();
    (full.events||[]).forEach(r=>{
      srvEv.add(r.id);
      const l = locEv.get(r.id);
      if(!l || l.dk!==r.date_key || l.cid!==r.calendar_id || !ugualiSync(l.e, mapEvSync(r))) out.eventi++;
    });
    locEv.forEach((v,id)=>{ if(!srvEv.has(id)) out.eventi++; });
    const confrontaLista = (srv, locale, mappa, chiave)=>{
      let n=0; const visti=new Set(); const idx=new Map((locale||[]).map(x=>[x[chiave],x]));
      (srv||[]).forEach(r=>{ const m=mappa(r); visti.add(m[chiave]); if(!ugualiSync(idx.get(m[chiave]), m)) n++; });
      (locale||[]).forEach(x=>{ if(!visti.has(x[chiave])) n++; });
      return n;
    };
    out.modelli = confrontaLista(full.modelli, modelliCor, m=>mapModSync(m,fasce), "id");
    out.calendari = confrontaLista(full.calendars, loc.calendars, mapCalSync, "id");
    out.rotazioni = confrontaLista(full.rotazioni, rotCor, mapRotSync, "id");
    out.colori = confrontaLista(full.colori, colCor, c=>({hex:c.hex, label:c.label||null, sortOrder:c.sort_order||0}), "hex");
    out.totale = out.eventi+out.modelli+out.calendari+out.rotazioni+out.colori;
    return out;
  }

  // Cuore della sincronizzazione (sola lettura da Supabase). Ritorna { tipo, msg, cambiati }.
  // tipo: "ok" (applicate novità) | "nessuna" | "occupato" | "coda" | "offline" | "manca_cursore" | "fermato" | "errore"
  async function eseguiSync(opz={}){
    if(!userId) return { tipo:"errore", msg:"❌ Accedi per sincronizzare" };
    if(typeof navigator!=="undefined" && navigator.onLine===false) return { tipo:"offline", msg:"❌ Sei offline: impossibile sincronizzare. I tuoi dati locali non sono stati toccati." };
    if(sincInCorsoRef.current || scrittureInVoloRef.current>0) return { tipo:"occupato", msg:"⏳ C'è già un salvataggio o una sincronizzazione in corso: riprova tra poco." };
    let inCoda=0; try{ inCoda=(leggiCodaSync()||[]).length; }catch(e){}
    if(inCoda>0) return { tipo:"coda", msg:`🕓 Ci sono ${inCoda} modifiche di questo dispositivo non ancora inviate a Supabase. Aspetta che partano (serve linea) e riprova: così non si rischia di perderle.` };
    sincInCorsoRef.current = true;
    try{
      let cursore=null; try{ cursore=localStorage.getItem(CURSORE_SYNC_KEY); }catch(e){}
      const loc = storeRef.current || store;
      const modelliCor = modelliRef.current && modelliRef.current.length ? modelliRef.current : modelli;
      const fasce = loc.fasceAutomatiche || FASCE_AUTOMATICHE_DEFAULT;

      // ── punto di partenza automatico ──
      if(!cursore){
        const {data:full, error:errFull} = await supabase.rpc("get_changes", { p_user_id:userId, p_since:null });
        if(errFull) throw errFull;
        if(!full?.server_now) throw new Error("Risposta del server non valida");
        const d = contaDifferenzeSync(full, loc, modelliCor, rotazioni||[], coloriExtra||[], fasce);
        if(d.totale===0){
          try{ localStorage.setItem(CURSORE_SYNC_KEY, full.server_now); }catch(e){}
          return { tipo:"nessuna", msg:"✅ Questo dispositivo è identico a Supabase: sincronizzazione attivata. Da ora le novità arrivano da sole." };
        }
        const parti=[]; if(d.eventi) parti.push(`${d.eventi} eventi`); if(d.modelli) parti.push(`${d.modelli} modelli`); if(d.calendari) parti.push(`${d.calendari} calendari`); if(d.rotazioni) parti.push(`${d.rotazioni} rotazioni`); if(d.colori) parti.push(`${d.colori} colori`);
        return { tipo:"manca_cursore", msg:`ℹ️ Questo dispositivo non coincide con Supabase (differenze: ${parti.join(", ")}). Non ho toccato nulla. Se ha i dati giusti premi «Esporta su Supabase»; se ha dati vecchi premi «Importa da Supabase». Poi la sincronizzazione sarà automatica.` };
      }

      // Il registro delle eliminazioni si cancella dopo 15 giorni: se il punto di partenza e' piu' vecchio di 14 giorni
      // scarico l'elenco completo e considero eliminato cio' che qui c'e' e su Supabase non c'e' piu'.
      const vecchio = (Date.now()-new Date(cursore).getTime()) > 14*86400000;
      const da = vecchio ? null : new Date(new Date(cursore).getTime()-5000).toISOString(); // 5 s di sovrapposizione
      const {data:ch, error:errCh} = await supabase.rpc("get_changes", { p_user_id:userId, p_since:da });
      if(errCh) throw errCh;
      if(!ch?.server_now) throw new Error("Risposta del server non valida");
      let elim = ch.eliminati||[];
      if(vecchio){
        const srv = t=>new Set((ch[t]||[]).map(r=>String(r.id)));
        const sE=srv("events"), sC=srv("calendars"), sM=srv("modelli"), sR=srv("rotazioni"), sG=srv("gruppi");
        elim = [];
        Object.values(loc.events||{}).forEach(byc=>Object.values(byc||{}).forEach(lst=>(lst||[]).forEach(e=>{ if(e && !sE.has(String(e.id))) elim.push({tabella:"events", id:String(e.id)}); })));
        (loc.calendars||[]).forEach(c=>{ if(!sC.has(String(c.id))) elim.push({tabella:"calendars", id:String(c.id)}); });
        modelliCor.forEach(m=>{ if(!sM.has(String(m.id))) elim.push({tabella:"modelli", id:String(m.id)}); });
        (rotazioni||[]).forEach(r=>{ if(!sR.has(String(r.id))) elim.push({tabella:"rotazioni", id:String(r.id)}); });
        (gruppi||[]).forEach(g=>{ if(!sG.has(String(g.id))) elim.push({tabella:"gruppi_modelli", id:String(g.id)}); });
      }
      const elimDi = t=>elim.filter(x=>x.tabella===t).map(x=>String(x.id));

      // ── EVENTI (si applica solo ciò che è DIVERSO da quello che c'è già) ──
      let events = {...(loc.events||{})};
      const idx = new Map();
      Object.entries(events).forEach(([dk,byc])=>Object.entries(byc||{}).forEach(([cid,lst])=>(lst||[]).forEach(e=>idx.set(e.id,{dk,cid}))));
      const nEvLocali = idx.size;
      const elimEv = elimDi("events").filter(id=>idx.has(id));
      const togli = id=>{
        const pos=idx.get(id); if(!pos) return;
        const byc={...(events[pos.dk]||{})};
        byc[pos.cid]=(byc[pos.cid]||[]).filter(e=>e.id!==id);
        if(!byc[pos.cid].length) delete byc[pos.cid];
        if(Object.keys(byc).length) events[pos.dk]=byc; else delete events[pos.dk];
        idx.delete(id);
      };
      const metti = (dk,cid,ev)=>{
        const byc={...(events[dk]||{})};
        byc[cid]=[...(byc[cid]||[]),ev];
        events[dk]=byc; idx.set(ev.id,{dk,cid});
      };
      const sostituisciSulPosto = (dk,cid,ev)=>{
        const byc={...(events[dk]||{})};
        byc[cid]=(byc[cid]||[]).map(x=>x.id===ev.id?ev:x);
        events[dk]=byc;
      };
      const evCambiati = (ch.events||[]).filter(r=>{
        const pos=idx.get(r.id);
        if(!pos || pos.dk!==r.date_key || pos.cid!==r.calendar_id) return true;
        const cur=(events[pos.dk]?.[pos.cid]||[]).find(x=>x.id===r.id);
        return !ugualiSync(cur, mapEvSync(r));
      });
      elimEv.forEach(togli);
      evCambiati.forEach(r=>{
        const nuovo = mapEvSync(r);
        const pos = idx.get(r.id);
        if(pos && pos.dk===r.date_key && pos.cid===r.calendar_id) sostituisciSulPosto(r.date_key, r.calendar_id, nuovo);
        else { togli(r.id); metti(r.date_key, r.calendar_id, nuovo); }
      });

      // ── CALENDARI ──
      let calendars = loc.calendars||[];
      const elimCal = new Set(elimDi("calendars").filter(id=>calendars.some(c=>String(c.id)===id)));
      const calCambiati = (ch.calendars||[]).filter(c=>!ugualiSync(calendars.find(x=>x.id===c.id), mapCalSync(c)));
      if(calCambiati.length>0 || elimCal.size>0){
        calendars = calendars.filter(c=>!elimCal.has(String(c.id)));
        calCambiati.forEach(c=>{
          const nuovo = mapCalSync(c);
          const i = calendars.findIndex(x=>x.id===c.id);
          if(i>=0) calendars[i]=nuovo; else calendars=[...calendars, nuovo];
        });
        const {data:ordRows, error:errOrd} = await supabase.from("calendars").select("id,sort_order").eq("user_id",userId);
        if(errOrd) throw errOrd;
        const ord = new Map((ordRows||[]).map(r=>[r.id, r.sort_order==null?1e9:r.sort_order]));
        calendars = [...calendars].sort((a,b)=>{ const d=(ord.get(a.id)??1e9)-(ord.get(b.id)??1e9); return d!==0 ? d : String(a.id).localeCompare(String(b.id)); });
      }

      // ── MODELLI ──
      let modelliNuovi = modelliCor;
      const elimMod = new Set(elimDi("modelli").filter(id=>modelliNuovi.some(m=>String(m.id)===id)));
      const modCambiati = (ch.modelli||[]).filter(m=>!ugualiSync(modelliNuovi.find(x=>x.id===m.id), mapModSync(m,fasce)));
      if(modCambiati.length>0 || elimMod.size>0){
        modelliNuovi = modelliNuovi.filter(m=>!elimMod.has(String(m.id)));
        modCambiati.forEach(m=>{
          const nuovo = mapModSync(m,fasce);
          const i = modelliNuovi.findIndex(x=>x.id===m.id);
          if(i>=0){ modelliNuovi=[...modelliNuovi]; modelliNuovi[i]=nuovo; } else modelliNuovi=[...modelliNuovi, nuovo];
        });
        modelliNuovi = [...modelliNuovi].sort((a,b)=>{
          const sa=a.sortOrder||0, sb=b.sortOrder||0;
          if(sa!==sb) return sa-sb;
          const fa=classificaFasciaOrariaModello(a), fb=classificaFasciaOrariaModello(b);
          if(fa!==fb) return fa-fb;
          const ma=a.tempo==="h24"?99999:(oraInMinuti(a.inizio||"")??99999);
          const mb=b.tempo==="h24"?99999:(oraInMinuti(b.inizio||"")??99999);
          if(ma!==mb) return ma-mb;
          return (a.titolo||"").localeCompare(b.titolo||"");
        });
      }

      // ── ROTAZIONI ──
      let rotNuove = rotazioni||[];
      const elimRot = new Set(elimDi("rotazioni").filter(id=>rotNuove.some(r=>String(r.id)===id)));
      const rotCambiate = (ch.rotazioni||[]).filter(r=>!ugualiSync(rotNuove.find(x=>x.id===r.id), mapRotSync(r)));
      if(rotCambiate.length>0 || elimRot.size>0){
        rotNuove = rotNuove.filter(r=>!elimRot.has(String(r.id)));
        rotCambiate.forEach(r=>{
          const nuova = mapRotSync(r);
          const i = rotNuove.findIndex(x=>x.id===r.id);
          if(i>=0){ rotNuove=[...rotNuove]; rotNuove[i]=nuova; } else rotNuove=[...rotNuove, nuova];
        });
        rotNuove = [...rotNuove].sort((a,b)=> a.sortOrder!==b.sortOrder ? a.sortOrder-b.sortOrder : String(a.id).localeCompare(String(b.id)));
      }

      // ── COLORI (nell'app non hanno id: se ci sono novità rileggo l'elenco e confronto) ──
      let coloriNuovi = null; let nCol = 0;
      if((ch.colori||[]).length>0 || elimDi("colori").length>0){
        const {data:colRows, error:errCol} = await supabase.from("colori").select("hex,label,sort_order").eq("user_id",userId);
        if(errCol) throw errCol;
        const lista = (colRows||[]).map(c=>({hex:c.hex, label:c.label||null, sortOrder:c.sort_order||0}))
          .sort((a,b)=> a.sortOrder!==b.sortOrder ? a.sortOrder-b.sortOrder : String(a.hex).localeCompare(String(b.hex)));
        const attuali = coloriExtra||[];
        const diversi = lista.length!==attuali.length || lista.some(c=>!ugualiSync(attuali.find(x=>x.hex===c.hex), c));
        if(diversi){ coloriNuovi = lista; nCol = Math.max(1, Math.abs(lista.length-attuali.length)); }
      }

      // ── GRUPPI (tendine dei modelli): applico solo cio' che e' DIVERSO ──
      let gruppiNuovi = null; let nGru = 0;
      {
        const gAttuali = gruppi||[];
        const elimGru = new Set(elimDi("gruppi_modelli"));
        const grCambiati = (ch.gruppi||[]).filter(r=>!ugualiSync(gAttuali.find(x=>x.id===r.id), mapGruppoDb(r)));
        const grEliminati = gAttuali.filter(g=>elimGru.has(String(g.id)));
        if(grCambiati.length>0 || grEliminati.length>0){
          let lista = gAttuali.filter(g=>!elimGru.has(String(g.id)));
          grCambiati.forEach(r=>{ const n=mapGruppoDb(r); const i=lista.findIndex(x=>x.id===r.id); if(i>=0){ lista=[...lista]; lista[i]=n; } else lista=[...lista, n]; });
          gruppiNuovi = [...lista].sort((a,b)=> a.sortOrder!==b.sortOrder ? a.sortOrder-b.sortOrder : String(a.id).localeCompare(String(b.id)));
          nGru = grCambiati.length + grEliminati.length;
        }
      }

      // ── IMPOSTAZIONI (user_settings): giorni importanti/festivi personali, colore domeniche e festivi,
      // quartine (dentro report_settings), colori delle fasce, festività attive. Non stanno nelle tabelle di get_changes.
      // Si rilegge la riga dal server e si applica solo ciò che è DIVERSO; i giorni importanti si fondono con le modifiche locali in coda.
      let extraHolsNuovi = null; let impostazioniNuove = null; let nExtra = 0;
      try{
        const {data:rigaSett, error:errSett} = await supabase.from("user_settings")
          .select("extra_hols,sunday_color,holiday_color,report_settings,fasce_automatiche,national_hols_enabled").eq("user_id",userId).maybeSingle();
        if(errSett) throw errSett;
        if(rigaSett){
          const dalServer = applicaOpExtraHols(rigaSett.extra_hols||[], leggiOpExtraHols());
          const diff = diffExtraHolsInOps(loc.extraHols||[], dalServer);
          if(diff.length>0){ extraHolsNuovi = dalServer; nExtra += diff.length; }
          let fasceSrv = rigaSett.fasce_automatiche || FASCE_AUTOMATICHE_DEFAULT;
          try{
            const ntF = fasceSrv.find(f=>f.key==="notte"), t3F = fasceSrv.find(f=>f.key==="terzo_turno");
            if(ntF && t3F && ntF.from===1080 && t3F.to===1080) fasceSrv = fasceSrv.map(f=>f.key==="notte" ? {...f, from:1081} : f);
          }catch(e){}
          const campi = {
            sundayColor: rigaSett.sunday_color || "",
            holidayColor: rigaSett.holiday_color || "",
            reportSettings: rigaSett.report_settings || {},
            fasceAutomatiche: fasceSrv,
            nationalHolsEnabled: rigaSett.national_hols_enabled || FESTIVITA_DEFAULT_ATTIVE,
          };
          const cambiati = {};
          Object.entries(campi).forEach(([k,v])=>{
            if(JSON.stringify(loc[k] ?? null) !== JSON.stringify(v)) cambiati[k] = v;
          });
          if(Object.keys(cambiati).length>0){ impostazioniNuove = cambiati; nExtra += Object.keys(cambiati).length; }
        }
      }catch(e){ segnalaErroreSoloLog(e?.message||String(e), "Sincronizzazione impostazioni e giorni importanti"); }

      const nEv=evCambiati.length, nMod=modCambiati.length, nCal=calCambiati.length, nRot=rotCambiate.length;
      const totElim = elimEv.length + elimCal.size + elimMod.size + elimRot.size;
      const nessunaNovita = nEv+nMod+nCal+nRot+nCol+nGru+nExtra===0 && totElim===0;
      // Regola dell'80%: se l'aggiornamento cambia piu' dell'80% dei dati di questo dispositivo, chiedo se continuare o annullare.
      const totLocale = nEvLocali + modelliCor.length + (loc.calendars||[]).length + (rotazioni||[]).length;
      const totCambi = nEv+nMod+nCal+nRot+totElim;
      if(!nessunaNovita && totLocale>=5 && totCambi > totLocale*0.8){
        if(opz.auto && sincRifiutataRef.current) return { tipo:"annullata", msg:"↩️ Aggiornamento già annullato in questa sessione." };
        const det=[]; if(nEv||elimEv.length) det.push(`eventi: ${nEv} da aggiornare, ${elimEv.length} da eliminare`); if(nMod||elimMod.size) det.push(`modelli: ${nMod} da aggiornare, ${elimMod.size} da eliminare`); if(nCal||elimCal.size) det.push(`calendari: ${nCal} / ${elimCal.size}`); if(nRot||elimRot.size) det.push(`rotazioni: ${nRot} / ${elimRot.size}`);
        const ok = window.confirm(`Questo aggiornamento da Supabase cambia più dell'80% dei dati di questo dispositivo (${totCambi} su ${totLocale}).\n\n${det.join("\n")}\n\nOK = continua e sostituisci\nAnnulla = non cambiare niente`);
        if(!ok){
          if(opz.auto) sincRifiutataRef.current = true;
          return { tipo:"annullata", msg:"↩️ Aggiornamento annullato: non è stato modificato nulla su questo dispositivo." };
        }
      }
      if(!nessunaNovita){
        impostaSorgenteLog("remoto");
        setStore(s=>({ ...s, calendars, events, ...(extraHolsNuovi ? { extraHols: extraHolsNuovi } : {}), ...(impostazioniNuove||{}) }));
        if(extraHolsNuovi) saveExtraHolsLocale(extraHolsNuovi);
        if(nMod>0 || elimMod.size>0) setModelli(modelliNuovi);
        if(nRot>0 || elimRot.size>0) setRotazioni(rotNuove);
        if(coloriNuovi) setColoriExtra(coloriNuovi);
        if(gruppiNuovi) setGruppi(gruppiNuovi);
        saveToLocalStorage(events, calendars, modelliNuovi, calId, impostazioniNuove||{});
        setTimeout(()=>impostaSorgenteLog("locale"), 1500);
      }
      try{ localStorage.setItem(CURSORE_SYNC_KEY, ch.server_now); }catch(e){}

      const parti=[];
      if(nEv) parti.push(`${nEv} ${nEv===1?"evento":"eventi"}`);
      if(nMod) parti.push(`${nMod} ${nMod===1?"modello":"modelli"}`);
      if(nCal) parti.push(`${nCal} ${nCal===1?"calendario":"calendari"}`);
      if(nRot) parti.push(`${nRot} ${nRot===1?"rotazione":"rotazioni"}`);
      if(nCol) parti.push(`colori`);
      if(nGru) parti.push(`gruppi`);
      if(nExtra) parti.push(`impostazioni/colori`);
      if(nessunaNovita) return { tipo:"nessuna", msg:"✅ Già aggiornato: nessuna novità su Supabase." };
      return { tipo:"ok", cambiati:parti.join(", "), msg:`✅ Aggiornato. Cambiati: ${parti.join(", ")||"nessuno"}${totElim?` · eliminati: ${totElim}`:""}.` };
    }catch(e){
      segnalaErroreSoloLog(e?.message||String(e), "Sincronizzazione da Supabase");
      return { tipo:"errore", msg:"❌ Sincronizzazione non riuscita: "+(e?.message||e)+". Nessun dato di questo dispositivo è stato modificato." };
    } finally { sincInCorsoRef.current = false; }
  }

  // ── Primo caricamento dei GRUPPI (una volta per dispositivo) ──
  // I gruppi sono nati su Supabase dopo il punto di partenza di questo telefono, quindi get_changes non li porterebbe mai:
  // senza questo passo i modelli sembrano "senza gruppo". Qui si leggono interi (gruppi + colonne gruppo_a/gruppo_b dei modelli)
  // e si applicano solo se diversi. Solo lettura da Supabase; non parte se ci sono modifiche locali non ancora inviate.
  // Il flag si segna solo a lettura riuscita: finche' non riesce, riprova.
  const gruppiInCaricamentoRef = useRef(false);
  async function caricaGruppiUnaVolta(){
    if(!userId || gruppiInCaricamentoRef.current || sincInCorsoRef.current || scrittureInVoloRef.current>0) return;
    try{ if(localStorage.getItem("turnipm_gruppi_caricati_v1")==="1") return; }catch(e){}
    if(typeof navigator!=="undefined" && navigator.onLine===false) return;
    let inCoda=0; try{ inCoda=(leggiCodaSync()||[]).length; }catch(e){}
    if(inCoda>0) return;
    gruppiInCaricamentoRef.current = true;
    try{
      const {data:gRows, error:eG} = await dbSelectTutto("gruppi_modelli", {matchObj:{user_id:userId}, contesto:"Primo caricamento gruppi"});
      if(eG) throw eG;
      const {data:mRows, error:eM} = await dbSelectTutto("modelli", {matchObj:{user_id:userId}, contesto:"Primo caricamento gruppi \u2014 modelli", colonne:"id,gruppo_a,gruppo_b"});
      if(eM) throw eM;
      let inCoda2=0; try{ inCoda2=(leggiCodaSync()||[]).length; }catch(e){}
      if(inCoda2>0) return; // nel frattempo e' nata una modifica locale: riprovo piu' tardi
      const nuoviGruppi = (gRows||[]).map(mapGruppoDb)
        .sort((a,b)=> a.sortOrder!==b.sortOrder ? a.sortOrder-b.sortOrder : String(a.id).localeCompare(String(b.id)));
      const perId = new Map((mRows||[]).map(r=>[r.id, r]));
      const cur = (modelliRef.current && modelliRef.current.length) ? modelliRef.current : modelli;
      let cambiati = 0;
      const nuoviModelli = (cur||[]).map(m=>{
        if(!m) return m;
        const r = perId.get(m.id); if(!r) return m;
        const a = r.gruppo_a||null, b = r.gruppo_b||null;
        if((m.gruppoA||null)===a && (m.gruppoB||null)===b) return m;
        cambiati++; return { ...m, gruppoA:a, gruppoB:b };
      });
      setGruppi(nuoviGruppi);
      if(cambiati>0){
        modelliRef.current = nuoviModelli;
        setModelli(nuoviModelli);
        saveToLocalStorage(undefined, undefined, nuoviModelli);
      }
      try{ localStorage.setItem("turnipm_gruppi_caricati_v1","1"); }catch(e){}
      registraAttivita("Gruppi", `Caricati ${nuoviGruppi.length} gruppi da Supabase (${cambiati} modelli aggiornati).`, { chiave:"gruppi-primo-caricamento", supabase:"ok" });
    }catch(e){
      segnalaErroreSoloLog(e?.message||String(e), "Primo caricamento gruppi");
    } finally { gruppiInCaricamentoRef.current = false; }
  }
  useEffect(()=>{
    if(!userId || loading) return;
    caricaGruppiUnaVolta();
    const t = setInterval(caricaGruppiUnaVolta, 20000); // riprova finche' non riesce (poi esce subito)
    return ()=>clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loading]);

  // Pulsante "Sincronizza ora": mostra sempre l'esito in una finestra.
  async function sincronizzaOra(){
    const avvisa = (msg, stato="corso", ok=true)=>setEsitoExportSupabase({ titolo:"Sincronizza ora", stato, ok, messaggio:msg });
    avvisa("⏳ Controllo le novità su Supabase...");
    sincRifiutataRef.current = false;
    const r = await eseguiSync();
    if(r.tipo==="ok" || r.tipo==="nessuna") registraAttivita("Sincronizza ora", r.msg, { chiave:"sync-ora", supabase:"n/a" });
    avvisa(r.msg, "fine", r.tipo==="ok" || r.tipo==="nessuna" || r.tipo==="annullata");
  }

  // Sincronizzazione AUTOMATICA: silenziosa, in background, solo lettura.
  async function sincronizzaAuto(motivo){
    if(!userId || !syncAuto || !isInitialized.current) return;
    if(typeof document!=="undefined" && document.visibilityState==="hidden") return;
    const ora = Date.now();
    if(ora - ultimaSyncAutoRef.current < (motivo==="tempo reale" ? 2000 : 15000)) return { tipo:"saltata" }; // aperture/riconnessioni: mai più di una ogni 15 s
    ultimaSyncAutoRef.current = ora;
    const r = await eseguiSync({ auto:true });
    if(r.tipo==="ok"){
      registraAttivita("Sincronizzazione automatica", `🔄 ${r.msg} (${motivo})`, { chiave:"sync-auto", supabase:"n/a" });
      setBanner(`🔄 Aggiornato: ${r.cambiati}`);
      setTimeout(()=>setBanner(b=>String(b||"").startsWith("🔄 Aggiornato")?null:b), 3000);
    } else if(r.tipo==="fermato" || r.tipo==="manca_cursore"){
      // niente popup: una riga nel Log, una sola volta per sessione per tipo
      const k=`_syncAutoLog_${r.tipo}`; if(!window[k]){ window[k]=true; registraAttivita("Sincronizzazione automatica", r.msg, { chiave:"sync-auto-"+r.tipo, supabase:"n/a" }); }
    } else if(r.tipo==="nessuna" && /attivata/.test(r.msg||"")){
      registraAttivita("Sincronizzazione automatica", r.msg, { chiave:"sync-auto-attiva", supabase:"n/a" });
    }
    return r;
  }
  syncAutoFnRef.current = sincronizzaAuto;
  useEffect(()=>{
    if(!userId) return;
    const lancia = async motivo=>{
      try{
        const r = syncAutoFnRef.current ? await syncAutoFnRef.current(motivo) : null;
        // se era occupata (scrittura in corso) ritento una sola volta dopo 3 s
        if(r && r.tipo==="occupato" && !String(motivo).includes("riprova")) setTimeout(()=>lancia(motivo+" (riprova)"), 3000);
      }catch(e){}
    };
    // Nessun controllo ogni 60 s: un controllo all'apertura, uno quando torna la linea, e poi solo le novità in tempo reale.
    const t0 = setTimeout(()=>lancia("apertura"), 2500);
    const onOnline = ()=>lancia("linea tornata");
    window.addEventListener("online", onOnline);
    // Quando l'app torna in primo piano controllo le novità (anche se il tempo reale non è attivo): max una ogni 15 s
    const onVisibile = ()=>{ if(document.visibilityState==="visible") lancia("ritorno in primo piano"); };
    document.addEventListener("visibilitychange", onVisibile);
    // Tempo reale (Supabase Realtime): quando un altro dispositivo cambia qualcosa, qui parte la stessa sincronizzazione di sempre
    // (sola lettura, applica solo le righe diverse da quelle locali, con le stesse protezioni).
    let timerRt = null, primoCollegamento = true, canale = null;
    try{
      const quandoCambia = ()=>{ clearTimeout(timerRt); timerRt = setTimeout(()=>lancia("tempo reale"), 1200); };
      canale = supabase.channel("turni-sync-"+userId);
      ["events","modelli","calendars","rotazioni","colori","gruppi_modelli"].forEach(t=>canale.on("postgres_changes", { event:"*", schema:"public", table:t }, quandoCambia));
      // impostazioni (giorni importanti / festivi personali): serve user_settings nella pubblicazione realtime (vedi realtime-user-settings.sql)
      canale.on("postgres_changes", { event:"*", schema:"public", table:"user_settings" }, quandoCambia);
      canale.subscribe(stato=>{
        if(stato==="SUBSCRIBED"){
          // dopo una caduta di linea o un ritorno dallo sfondo recupero quello che è arrivato nel frattempo
          if(!primoCollegamento) lancia("tempo reale ricollegato");
          primoCollegamento = false;
        }
      });
    }catch(e){}
    return ()=>{ clearTimeout(t0); clearTimeout(timerRt); window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVisibile); try{ canale && supabase.removeChannel(canale); }catch(e){} };
  }, [userId]);

  async function handleExportSupabase(){
    // Ogni passaggio e l'esito finale compaiono in una FINESTRA grande (non solo in una scritta piccola).
    const avvisa = (msg, stato="corso", ok=true)=>{ setSyncMsg(msg); setEsitoExportSupabase({titolo:"Esportazione su Supabase", stato, ok, messaggio:msg}); };
    if(!userId){ avvisa("❌ Accedi per esportare","fine",false); return; }
    if(typeof navigator!=="undefined" && navigator.onLine===false){ avvisa("❌ Sei offline: impossibile esportare","fine",false); return; }
    avvisa("⏳ Esportazione in corso...");
    try {
      const loc = storeRef.current || store;
      const cals = loc.calendars||[];
      const evLocali = [];
      Object.entries(loc.events||{}).forEach(([dateKey,byCal])=>{
        Object.entries(byCal||{}).forEach(([cId,lst])=>{
          (Array.isArray(lst)?lst:[]).forEach(e=>{ if(e && e.id) evLocali.push({e, dateKey, cId}); });
        });
      });
      const mods = modelliRef.current && modelliRef.current.length ? modelliRef.current : modelli;
      const rots = rotazioni||[];
      // Protezione: se sul telefono non c'è nulla, non tocco Supabase.
      if(cals.length===0 || (evLocali.length===0 && mods.length===0)){
        avvisa("❌ Esportazione annullata: sul telefono non ci sono dati da esportare","fine",false);
        return;
      }

      // PROTEZIONE: se il telefono ha MOLTO meno dati di Supabase (meno dell'80%),
      // probabilmente è un dispositivo con dati vecchi/incompleti: mi fermo senza toccare nulla,
      // perché l'esportazione toglierebbe da Supabase ciò che sul telefono non c'è.
      avvisa("⏳ Controllo i dati prima di esportare...");
      const contaSrv = async t=>{ const {count,error}=await supabase.from(t).select("id",{count:"exact",head:true}).eq("user_id",userId); if(error) throw error; return count||0; };
      const [sE,sM,sC] = await Promise.all([contaSrv("events"),contaSrv("modelli"),contaSrv("calendars")]);
      const troppoPoco = (loc, srv)=> srv>=10 && loc < srv*0.8;
      if(troppoPoco(evLocali.length,sE) || troppoPoco(mods.length,sM) || troppoPoco(cals.length,sC)){
        const msg = `🛑 Esportazione FERMATA per proteggere i dati. Questo dispositivo ha meno dati di Supabase: telefono ${evLocali.length} eventi, ${mods.length} modelli, ${cals.length} calendari; Supabase ${sE} eventi, ${sM} modelli, ${sC} calendari. Non è stato modificato nulla. Se il telefono giusto è un altro, esporta da quello.`;
        registraAttivita("Esporta su Supabase", msg, { chiave:"esporta-supabase", supabase:"errore" });
        avvisa(msg, "fine", false);
        return;
      }

      // 1) paracadute
      avvisa("⏳ 1/4 Salvo copia di sicurezza di Supabase...");
      const backup = await buildBackupPayload();
      const {error:insErr} = await supabase.from("backups").insert({ user_id:userId, data:backup });
      if(insErr) throw insErr;

      const blocchi = (arr, n)=>{ const r=[]; for(let i=0;i<arr.length;i+=n) r.push(arr.slice(i,i+n)); return r; };
      const scrivi = async (tabella, righe, onConflict)=>{
        for(const bl of blocchi(righe, 200)){
          const {error} = await supabase.from(tabella).upsert(bl, {onConflict: onConflict||"id"});
          if(error) throw new Error(`${tabella}: ${error.message}`);
        }
      };
      const nn = v => (v===""||v===undefined) ? null : v;

      // 2) scrittura dal locale (ordine: prima ciò da cui gli altri dipendono)
      avvisa("⏳ 2/4 Scrivo i dati del telefono su Supabase...");
      await scrivi("calendars", cals.map((c,i)=>({
        id:c.id, user_id:userId, name:c.name||"", color:c.color||null,
        is_main:!!c.isMain, shifts:c.shifts||[], sort_order:i,
      })));
      await scrivi("rotazioni", rots.map((r,i)=>({
        id:r.id, user_id:userId, tipo:r.tipo||"personalizzata", titolo:r.titolo||"",
        data_inizio:nn(r.dataInizio), n_settimane:r.nSettimane??52,
        modello_lavoro_id:nn(r.modellaLavoroId), modello_nl_id:nn(r.modelloNLId), modello_rs_id:nn(r.modelloRSId),
        griglia:r.griglia||{}, sort_order:r.sortOrder??i,
      })));
      await scrivi("modelli", mods.map(m=>({
        id:m.id, user_id:userId, titolo:m.titolo||"", tempo:m.tempo||"personalizzato",
        inizio:nn(m.inizio), fine:nn(m.fine), colore:m.colore||"#64748b", colore_custom:nn(m.coloreCustom),
        posizione:nn(m.posizione), ...colonnePosizione(m), calendar_id:nn(m.calendarId),
        label:m.label||"", categoria:nn(m.categoria), categoria_app_auto:nn(m.categoriaAppAuto),
        categoria_turno_vuoto:!!m.turnoVuoto, categoria_app_auto_vuoto:!!m.appAutoVuoto,
        visibile_anche_in:m.visibileAncheIn||[],
        ...((gruppi||[]).length>0 ? { gruppo_a:nn(m.gruppoA), gruppo_b:nn(m.gruppoB) } : {}), // se il telefono non conosce i gruppi NON tocco quelli di Supabase
      })));
      if((gruppi||[]).length>0){
        await scrivi("gruppi_modelli", gruppi.map(g=>({
          id:g.id, user_id:userId, calendar_id:nn(g.calendarId), ordine:g.ordine, nome:g.nome||"", sort_order:g.sortOrder||0,
        })));
      }
      await scrivi("events", evLocali.map(({e,dateKey,cId})=>({
        id:e.id, user_id:userId, calendar_id:cId, date_key:dateKey,
        label:e.label||"", color:nn(e.color), all_day:e.allDay??true,
        time_in:e.tIn||"", time_out:e.tOut||"", place:e.place||"", map_url:e.map||"", note:e.note||"",
        auto:e.auto||"", collega:nn(e.collega), modello_id:nn(e.modelloId), parent_id:nn(e.parentId),
        rotazione_id:nn(e.rotazioneId), import_id:nn(e.importId),
        prot_pag_fine:nn(e.protPagFine), prot_rec_fine:nn(e.protRecFine),
        prot_meno_rec_in:nn(e.protMenoRecIn), prot_meno_rec_out:nn(e.protMenoRecOut),
        categoria_turno:nn(e.categoriaTurno), categoria_app_auto:nn(e.categoriaAppAuto),
        time_in_note:nn(e.tInNote), time_out_note:nn(e.tOutNote),
        report_overrides:e.reportOverrides||null,
        categoria_turno_vuoto:!!e.turnoVuoto, categoria_app_auto_vuoto:!!e.appAutoVuoto,
        visibile_anche_in:e.visibileAncheIn||[],
      })));
      const visti = new Set();
      const colLocali = (coloriExtra||[]).filter(c=>{
        if(!c || !/^#[0-9a-f]{6}$/i.test(c.hex||"")) return false;
        const k = c.hex.toUpperCase(); if(visti.has(k)) return false; visti.add(k); return true;
      });
      if(colLocali.length){
        await scrivi("colori", colLocali.map((c,i)=>({ user_id:userId, hex:c.hex, label:nn(c.label), sort_order:c.sortOrder??i })), "user_id,hex");
      }

      // 3) tolgo da Supabase ciò che sul telefono non esiste (prima figli, poi padri)
      avvisa("⏳ 3/4 Elimino da Supabase i doppioni...");
      const idsLocali = {
        events:new Set(evLocali.map(x=>x.e.id)), modelli:new Set(mods.map(m=>m.id)),
        rotazioni:new Set(rots.map(r=>r.id)), calendars:new Set(cals.map(c=>c.id)),
      };
      let eliminati = 0;
      for(const t of ["events","modelli","rotazioni","calendars"]){
        const {data:esistenti, error:eSel} = await dbSelectTutto(t, {matchObj:{user_id:userId}, contesto:`Esporta — ${t}`, colonne:"id"});
        if(eSel) throw new Error(`${t}: ${eSel.message||eSel}`);
        const daTogliere = (esistenti||[]).map(r=>r.id).filter(id=>!idsLocali[t].has(id));
        for(const bl of blocchi(daTogliere, 100)){
          const {error} = await supabase.from(t).delete().eq("user_id",userId).in("id", bl);
          if(error) throw new Error(`${t} (eliminazione): ${error.message}`);
        }
        eliminati += daTogliere.length;
      }

      // 4) verifica: conteggi su Supabase = conteggi sul telefono?
      avvisa("⏳ 4/4 Verifico...");
      const conta = async t=>{ const {count,error}=await supabase.from(t).select("id",{count:"exact",head:true}).eq("user_id",userId); if(error) throw error; return count; };
      const [nE,nM,nC,nR] = await Promise.all([conta("events"),conta("modelli"),conta("calendars"),conta("rotazioni")]);
      const attesi = {E:evLocali.length, M:mods.length, C:cals.length, R:rots.length};
      const ok = nE===attesi.E && nM===attesi.M && nC===attesi.C && nR===attesi.R;
      const riga = `Supabase: ${nE} eventi, ${nM} modelli, ${nC} calendari, ${nR} rotazioni (telefono: ${attesi.E}, ${attesi.M}, ${attesi.C}, ${attesi.R})`;
      if(ok) await aggiornaCursoreSync();
      registraAttivita("Esporta su Supabase", (ok?"✅ ":"⚠️ ")+riga+(eliminati?` — rimossi ${eliminati} doppioni`:""), { chiave:"esporta-supabase", supabase: ok?"ok":"errore" });
      avvisa(ok ? `✅ Esportato e verificato: ${riga}` : `⚠️ Esportazione incompleta. ${riga}`,"fine",ok);
    } catch(e){ segnalaErrore(e, "Esportazione su Supabase"); avvisa("❌ Errore durante l'esportazione: "+(e?.message||e),"fine",false); }
  }

  // Controllo struttura Supabase (tabelle/funzione mancanti). Manuale da Impostazioni; automatico 1 volta a settimana.
  const [esitoVerificaSupabase, setEsitoVerificaSupabase] = useState(null); // null | {stato:"corso"} | {stato:"fine", ok, problemi}
  async function handleVerificaSupabase(){
    if(!userId){ setEsitoVerificaSupabase({stato:"fine", ok:false, problemi:[{nome:"Accesso", tipo:"errore", dettaglio:"Accedi per verificare Supabase."}]}); return; }
    if(typeof navigator!=="undefined" && navigator.onLine===false){ setEsitoVerificaSupabase({stato:"fine", ok:false, problemi:[{nome:"Connessione", tipo:"errore", dettaglio:"Sei offline: impossibile verificare Supabase."}]}); return; }
    setEsitoVerificaSupabase({stato:"corso"});
    try{
      const r = await verificaStrutturaSupabase(supabase, userId, { popup:false });
      setEsitoVerificaSupabase({stato:"fine", ok:r.ok, problemi:r.problemi});
    }catch(e){
      setEsitoVerificaSupabase({stato:"fine", ok:false, problemi:[{nome:"Controllo", tipo:"errore", dettaglio:e?.message||String(e)}]});
    }
  }
  useEffect(()=>{
    if(!userId) return;
    let ultimo = 0;
    try{ ultimo = Number(localStorage.getItem("turnipm_check_struttura_ts")||0); }catch(e){}
    if(Date.now()-ultimo < 7*24*3600*1000) return;
    const t = setTimeout(()=>{
      if(typeof navigator!=="undefined" && navigator.onLine===false) return;
      verificaStrutturaSupabase(supabase, userId, { popup:true }).catch(()=>{});
    }, 10000);
    return ()=>clearTimeout(t);
  },[userId]);

  // ── Backup: configurazione, elenco con peso, cancellazione ──
  const [backupConfig, setBackupConfig] = useState({ frequenza:"settimanale", max_automatici:8 });
  const [backupTieniN, setBackupTieniN] = useState(10);
  async function caricaBackupConfig(){
    try{
      const { data, error } = await supabase.rpc("backup_config_leggi");
      if(!error && data) setBackupConfig({ frequenza:data.frequenza, max_automatici:data.max_automatici });
    }catch(e){}
  }
  useEffect(()=>{ if(userId) caricaBackupConfig(); }, [userId]);
  const avvisoBreve = (testo)=>{ setBanner(testo); setTimeout(()=>setBanner(b=>b===testo?null:b), 3500); };
  async function salvaBackupConfig(frequenza, max){
    const prima = backupConfig;
    setBackupConfig({ frequenza, max_automatici:max });
    try{
      const { data, error } = await supabase.rpc("backup_config_salva", { p_frequenza:frequenza, p_max:max });
      if(error) throw error;
      const tolti = data?.automatici_eliminati||0;
      avvisoBreve(`✅ Backup: ${frequenza==="disattivato"?"disattivati":"ogni "+({giornaliero:"giorno",settimanale:"settimana",mensile:"mese"}[frequenza])}, ne tengo ${max}${tolti?` (eliminati ${tolti} in eccesso)`:""}`);
    }catch(e){
      setBackupConfig(prima);
      segnalaErroreSoloLog(e?.message||String(e), "Salvataggio impostazioni backup");
      avvisoBreve("❌ Impostazioni backup non salvate: "+(e?.message||e));
    }
  }
  async function handleOpenImportSupabase(){
    setSyncMsg("⏳ Carico elenco backup...");
    try {
      let elenco = null;
      const { data:viaRpc, error:errRpc } = await supabase.rpc("backup_elenco");
      if(!errRpc && Array.isArray(viaRpc)) elenco = viaRpc;
      else {
        // ripiego: elenco semplice (senza peso)
        const {data, error} = await supabase.from("backups").select("id, created_at").eq("user_id", userId).order("created_at", {ascending:false}).limit(100);
        if(error) throw error;
        elenco = data||[];
      }
      setBackupsList(elenco);
      setShowBackupsModal(true);
      setSyncMsg("");
    } catch(e){ segnalaErrore(e, "Caricamento elenco backup"); setSyncMsg("❌ Errore nel caricare i backup: "+e.message); }
  }
  async function eliminaBackup(id){
    if(!window.confirm("Eliminare questo backup? L'operazione non si può annullare.")) return;
    try{
      const { data, error } = await supabase.rpc("backup_elimina", { p_ids:[id] });
      if(error) throw error;
      if(data?.ok===false && data?.motivo==="ultimo_backup"){ avvisoBreve("🛑 Non posso eliminare l'unico backup rimasto."); return; }
      avvisoBreve(`🗑️ Backup eliminato (liberati ${data?.kb_liberati||0} kB)`);
      const { data:el } = await supabase.rpc("backup_elenco"); if(Array.isArray(el)) setBackupsList(el);
    }catch(e){ segnalaErroreSoloLog(e?.message||String(e), "Eliminazione backup"); avvisoBreve("❌ Backup non eliminato: "+(e?.message||e)); }
  }
  async function tieniUltimiBackup(n){
    const tot = (backupsList||[]).length;
    if(tot<=n){ avvisoBreve(`Hai già solo ${tot} backup: niente da eliminare.`); return; }
    if(!window.confirm(`Eliminare i ${tot-n} backup più vecchi e tenere solo gli ultimi ${n}? Vale anche per quelli manuali. Non si può annullare.`)) return;
    try{
      const { data, error } = await supabase.rpc("backup_tieni_ultimi", { p_n:n });
      if(error) throw error;
      avvisoBreve(`🗑️ Eliminati ${data?.eliminati||0} backup (liberati ${Math.round((data?.kb_liberati||0)/1024*10)/10} MB)`);
      const { data:el } = await supabase.rpc("backup_elenco"); if(Array.isArray(el)) setBackupsList(el);
    }catch(e){ segnalaErroreSoloLog(e?.message||String(e), "Pulizia backup"); avvisoBreve("❌ Pulizia non riuscita: "+(e?.message||e)); }
  }

  // RIPRISTINO BACKUP — una sola richiesta, TUTTO-O-NIENTE, dentro il database (funzione ripristina_backup).
  // Prima il ripristino scriveva ~1400 righe una alla volta: una caduta di rete lasciava Supabase a metà.
  // Ora: la funzione salva lo stato attuale come copia di sicurezza, poi sostituisce i dati; se qualcosa
  // va storto non cambia nulla. Rifiuta una copia con molti meno eventi di quelli attuali (salvo conferma).
  async function handleRestoreBackup(backupId, forza=false){
    const avvisa = (msg, stato="corso", ok=true)=>{ setSyncMsg(msg); setEsitoExportSupabase({ titolo:"Ripristino backup", stato, ok, messaggio:msg }); };
    if(!forza && !window.confirm("Questo SOSTITUIRÀ tutti i dati attuali su Supabase con quelli del backup selezionato. Prima viene salvata una copia dello stato attuale. Continuare?")) return;
    setShowBackupsModal(false);
    if(typeof navigator!=="undefined" && navigator.onLine===false){ avvisa("❌ Sei offline: impossibile ripristinare. Nulla è stato modificato.","fine",false); return; }
    avvisa("⏳ Ripristino in corso (una sola operazione, tutto-o-niente)...");
    try {
      const { data, error } = await supabase.rpc("ripristina_backup", { p_backup_id: backupId, p_forza: !!forza });
      if(error) throw error;
      if(data && data.ok===false && data.motivo==="backup_piu_piccolo"){
        avvisa(`🛑 Ripristino FERMATO: questo backup ha ${data.eventi_backup} eventi, ma ora su Supabase ne hai ${data.eventi_attuali}. Ripristinarlo ti farebbe perdere dati. Non è stato modificato nulla.`,"fine",false);
        if(window.confirm(`Questo backup ha MOLTI MENO eventi (${data.eventi_backup}) di quelli attuali (${data.eventi_attuali}). Vuoi ripristinarlo lo stesso? I dati attuali verranno prima salvati in una copia di sicurezza.`)){
          return handleRestoreBackup(backupId, true);
        }
        return;
      }
      if(!data || data.ok!==true) throw new Error("Risposta inattesa dal server");
      const riga = `${data.eventi} eventi, ${data.modelli} modelli, ${data.calendari} calendari, ${data.rotazioni} rotazioni, ${data.colori} colori`;
      registraAttivita("Ripristino backup", `✅ Ripristinato su Supabase: ${riga}`, { chiave:"ripristino-backup", supabase:"ok" });
      avvisa(`✅ Ripristino completato su Supabase: ${riga}. Ricarico l'app...`,"fine",true);
      try{ localStorage.setItem("turnipm_pull_da_supabase","1"); }catch(e){}
      setTimeout(()=>window.location.reload(), 2500);
    } catch(e){
      segnalaErrore(e, "Ripristino backup");
      avvisa("❌ Ripristino non riuscito: "+(e?.message||e)+". Su Supabase non è cambiato nulla (operazione tutto-o-niente).","fine",false);
    }
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
        setModelli(prev=>(prev||[]).filter(Boolean).map(m=>{
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
// ═══════════════════════════════════════════════════════════════
// Sistema di ordinamento a BLOCCHI CONTIGUI GLOBALI: ogni calendario occupa
// un intervallo continuo di numeri (es. Turni 1-150, B 151-190, C 191-250),
// nell'ordine in cui i calendari sono elencati in Impostazioni (store.calendars,
// già ordinato per sort_order). Il sortOrder di un modello è quindi univoco
// su TUTTA l'app, non solo dentro il suo calendario: inserire un modello in
// mezzo al blocco di un calendario fa scalare di +1 anche tutti i modelli
// dei calendari successivi, per mantenere i blocchi sempre contigui e senza
// sovrapposizioni. Le frecce ↑↓ restano vincolate a muovere un modello solo
// dentro il blocco del proprio calendario (non lo fanno mai "sconfinare" nel
// blocco di un altro), ma il numero assoluto risultante riflette lo shift
// globale se necessario.
// Chiave di raggruppamento colore (confronto case-insensitive: "#FFEB3C" e
// "#ffeb3c" sono lo stesso colore).
function stessoHexColore(a,b){
  return String(a||"").toLowerCase()===String(b||"").toLowerCase();
}
function chiaveColoreModello(m){
  return String((m && (m.coloreCustom||m.colore)) || "").toLowerCase();
}
// Raggruppa una lista GIÀ ordinata in blocchi contigui per colore: i blocchi
// seguono l'ordine di prima comparsa del colore, dentro ogni blocco i modelli
// "etichetta" (NOTTE/MATTINA/POMERIGGIO/3 TURNO) vanno in testa e gli altri
// mantengono l'ordine relativo che avevano.
function raggruppaPerColore(lista){
  const blocchi = new Map();
  (lista||[]).filter(Boolean).forEach(m=>{
    const k = chiaveColoreModello(m);
    if(!blocchi.has(k)) blocchi.set(k, []);
    blocchi.get(k).push(m);
  });
  const out = [];
  blocchi.forEach(arr=>{
    out.push(...arr.filter(m=>fasciaModelloEtichetta(m)!=null));
    out.push(...arr.filter(m=>fasciaModelloEtichetta(m)==null));
  });
  return out;
}
function calcolaOrdineModelli(sottoinsieme){
  return [...(sottoinsieme||[])].filter(Boolean).sort((a,b)=>{
    const sa = a.sortOrder || 0, sb = b.sortOrder || 0;
    if(sa!==sb) return sa-sb;
    const fa = classificaFasciaOrariaModello(a);
    const fb = classificaFasciaOrariaModello(b);
    if(fa!==fb) return fa-fb;
    const ma = a.tempo==="h24" ? 99999 : (oraInMinuti(a.inizio||"") ?? 99999);
    const mb = b.tempo==="h24" ? 99999 : (oraInMinuti(b.inizio||"") ?? 99999);
    if(ma!==mb) return ma-mb;
    return (a.titolo||"").localeCompare(b.titolo||"");
  });
}

// ── ORDINE VISUALE: identico a quello della lista Modelli > Turni.
// Le tendine (gruppi) nell'ordine in cui si vedono, poi i modelli senza gruppo; dentro ogni tendina vale la posizione del modello.
// Ordine A senza gruppi veri: tendine automatiche per classe (APP, AUTO, DISTACCATI, ... lettere), come nella lista.
// Serve a tutte le liste che mostrano i modelli (colori, selettori, report, ordine eventi del giorno) cosi' seguono la lista.
// Le funzioni che RISCRIVONO le posizioni continuano a usare calcolaOrdineModelli (posizione pura).
function calcolaOrdineVisuale(modelli, gruppi, mainCalId){
  const base = calcolaOrdineModelli(modelli);
  const ordine = ordineAttivo();
  const perCal = new Map();
  base.forEach(m=>{ const c = m.calendarId||mainCalId||"__"; if(!perCal.has(c)) perCal.set(c,[]); perCal.get(c).push(m); });
  const rank = new Map();
  const iniz = new Map(); // solo ordine A con tendine automatiche: dentro la tendina vale l'ora d'inizio
  perCal.forEach((lista,c)=>{
    const gl = (gruppi||[]).filter(g=>g.ordine===ordine && (g.calendarId||mainCalId||"__")===c && (ordine!=="A" || (g.sortOrder||0)>=BANDA_A))
      .sort((a,b)=> a.sortOrder!==b.sortOrder ? a.sortOrder-b.sortOrder : String(a.id).localeCompare(String(b.id)));
    if(ordine==="A" && gl.length===0){
      const classi = ordinaClassiA([...new Set(lista.map(classeModelloA))]);
      lista.forEach(m=>{ rank.set(m.id, classi.indexOf(classeModelloA(m))); });
    } else {
      const pos = new Map(gl.map((g,i)=>[g.id,i]));
      lista.forEach(m=>{ const gid = ordine==="A" ? m.gruppoA : m.gruppoB; rank.set(m.id, pos.has(gid) ? pos.get(gid) : gl.length); });
    }
  });
  return base.map((m,i)=>({m,i})).sort((a,b)=> ((rank.get(a.m.id)||0)-(rank.get(b.m.id)||0)) || ((iniz.get(a.m.id)||0)-(iniz.get(b.m.id)||0)) || (a.i-b.i)).map(x=>x.m);
}

// ── Ordinamento per FASCIA ORARIA D'INIZIO, usato SOLO dal pulsante
// "Riordina posizione modelli" (non tocca il comportamento normale di
// calcolaOrdineModelli, usato ovunque altrove). Dentro ogni calendario i
// modelli vengono raggruppati in blocchi, nell'ordine:
//   1) NOTTE        — inizio esattamente 00:00
//   2) MATTINA       — inizio da 06:00 a 11:45
//   3) POMERIGGIO    — inizio da 12:00 a 17:15
//   4) 3° TURNO      — inizio da 17:15 a 18:00
//   5) tutti gli altri (H24 e qualsiasi orario fuori dalle fasce sopra),
//      lasciati in coda, ordinati anch'essi per orario di inizio crescente.
// All'interno di ciascun blocco l'ordine è per orario di inizio crescente.
function classificaFasciaOrariaModello(m){
  // Fasce: 0=NOTTE (18:01–05:59), 1=PRIMO (06:00–11:45), 2=SECONDO (11:46–16:00),
  // 3=3° TURNO (16:01–18:00), 4=altri (H24 e senza orario valido, sempre in coda).
  // I 4 modelli "etichetta" (titolo NOTTE/PRIMO/SECONDO/3°TURNO) vanno nella
  // fascia che rappresentano, in testa al loro blocco.
  const fasciaEtichetta = fasciaModelloEtichetta(m);
  if(fasciaEtichetta!=null) return fasciaEtichetta;
  if(m.tempo==="h24") return 4; // H24 sempre in coda, anche con inizio residuo
  const mins = oraInMinuti(m.inizio||"");
  if(mins==null) return 4;
  if(mins>=1081 || mins<=359) return 0; // NOTTE    18:01–05:59
  if(mins>=360  && mins<=705) return 1; // PRIMO    06:00–11:45
  if(mins>=706  && mins<=960) return 2; // SECONDO  11:46–16:00
  return 3;                             // 3° TURNO 16:01–18:00
}
// Riconosce i 4 modelli "etichetta di fascia" dal titolo (case-insensitive,
// tollerante a spazi e simbolo gradi): restituisce il numero di fascia
// (0=NOTTE,1=MATTINA,2=POMERIGGIO,3=3 TURNO) se il titolo corrisponde,
// altrimenti null (modello normale, classificato per orario come sempre).
function fasciaModelloEtichetta(m){
  const t = (m.titolo||"").toUpperCase().replace(/[°.\s]/g,"");
  if(t==="NOTTE") return 0;
  if(t==="PRIMO"||t==="MATTINA") return 1;
  if(t==="SECONDO"||t==="POMERIGGIO") return 2;
  if(t==="3TURNO"||t==="3ETURNO"||t==="TERZOTURNO") return 3;
  return null;
}
function calcolaOrdinePerFasciaOraria(sottoinsieme){
  return [...sottoinsieme].sort((a,b)=>{
    const fa = classificaFasciaOrariaModello(a);
    const fb = classificaFasciaOrariaModello(b);
    if(fa!==fb) return fa-fb;
    // I 4 modelli "etichetta di fascia" vanno sempre per primi dentro il
    // loro blocco, prima di qualunque altro modello della stessa fascia
    // (anche se quell'altro modello ha un orario di inizio più basso).
    const etichettaA = fasciaModelloEtichetta(a)!=null;
    const etichettaB = fasciaModelloEtichetta(b)!=null;
    if(etichettaA!==etichettaB) return etichettaA ? -1 : 1;
    // Per gli H24 (fascia 4) l'orario di inizio non è significativo anche se
    // il campo contiene ancora un valore residuo: si ignora e si passa
    // direttamente allo spareggio per sortOrder, così due H24 non vengono
    // riordinati tra loro in base a un orario che per loro non ha senso.
    const ma = a.tempo==="h24" ? 0 : (oraInMinuti(a.inizio||"") ?? 0);
    const mb = b.tempo==="h24" ? 0 : (oraInMinuti(b.inizio||"") ?? 0);
    if(ma!==mb) return ma-mb;
    return (a.sortOrder||0)-(b.sortOrder||0); // spareggio stabile, non tocca H24 tra loro
  });
}

// Riordino per fascia usato dal pulsante "Riordina posizione modelli".
// Parte dall'ordine esistente e NON ordina per orario: divide i modelli nelle
// fasce e dentro ogni fascia mette prima l'etichetta (NOTTE/PRIMO/SECONDO/
// 3°TURNO) e poi gli altri modelli nello stesso ordine che avevano.
// H24 e modelli senza orario restano in coda, nel loro ordine invariato.
function calcolaOrdineRiordinoFasce(sottoinsieme){
  const attuale = calcolaOrdineModelli(sottoinsieme);
  const blocchi = [[],[],[],[],[]];
  attuale.forEach(m=>{ blocchi[classificaFasciaOrariaModello(m)].push(m); });
  const out = [];
  for(let f=0; f<4; f++){
    out.push(...blocchi[f].filter(m=>fasciaModelloEtichetta(m)!=null));
    out.push(...blocchi[f].filter(m=>fasciaModelloEtichetta(m)==null));
  }
  out.push(...blocchi[4]);
  return out;
}

// ── Rinumerazione GLOBALE a blocchi contigui. "ordiniPerCalendario" è una
// Map calendarId -> array di modelli di quel calendario, già nell'ordine
// interno desiderato dal chiamante (per orario in caso di inserimento/
// modifica, o l'ordine con cui erano già visti in caso di riordino "silenzioso").
// "calendarsOrdinati" è l'elenco dei calendarId nell'ordine di Impostazioni:
// determina QUALE blocco viene prima. I calendari non presenti in
// ordiniPerCalendario (non toccati da questa operazione) mantengono il loro
// ordine interno attuale, letto da "prev".
// Dimensione del blocco riservato a ciascun calendario nella numerazione
// globale dei modelli. Il PRIMO calendario in Impostazioni è il numero 1
// (non 0), il secondo è il 2, ecc. Ogni calendario N riceve il blocco
// N*1000+1 .. N*1000+999:
//   calendario 1 (es. TURNI)       -> 1001-1999
//   calendario 2 (es. FURERIA)     -> 2001-2999
//   calendario 3 (es. PROGRAMMAZIONE) -> 3001-3999
//   calendario 4 (es. COT)         -> 4001-4999
//   calendario 5 (es. MARY)        -> 5001-5999
//   calendario 6                   -> 6001-6999
// e così via. 999 posizioni utili per calendario: margine ampio per
// crescere senza mai far sconfinare un blocco nell'altro.
const BLOCCO_POSIZIONI_CALENDARIO = 1000000;
// Distanza "normale" tra due modelli vicini: lascia buchi per inserire in mezzo.
const PASSO_POSIZIONI = 1000;

// ── Inserimento di un modello negli ordini A (alfabetico) e B (orario). Indipendente da colori, fasce e Impostazioni.
function titoloChiaveOrdine(m){ return String((m&&m.titolo)||"").trim().toUpperCase(); }
function minutiOrdineB(m){ if(!m || m.tempo==="h24") return null; const x = oraInMinuti(m.inizio||""); return x==null ? null : x; }
// "lista" = modelli del calendario nell'ordine da usare, SENZA il modello nuovo. Ritorna l'indice dove inserirlo.
function indiceInserimentoB(lista, nuovo){
  const k = minutiOrdineB(nuovo);
  if(k==null){ let ultimo=-1; lista.forEach((m,i)=>{ if(minutiOrdineB(m)==null) ultimo=i; }); return ultimo>=0 ? ultimo+1 : lista.length; }
  let ultimoUguale=-1, migliorMinore=-1, valMinore=-1, primoMaggiore=-1, valMaggiore=Infinity;
  lista.forEach((m,i)=>{
    const v = minutiOrdineB(m); if(v==null) return;
    if(v===k) ultimoUguale=i;
    else if(v<k){ if(v>=valMinore){ valMinore=v; migliorMinore=i; } }
    else if(v<valMaggiore){ valMaggiore=v; primoMaggiore=i; }
  });
  if(ultimoUguale>=0) return ultimoUguale+1;
  if(migliorMinore>=0) return migliorMinore+1;
  if(primoMaggiore>=0) return primoMaggiore;
  return 0;
}
function indiceInserimentoA(lista, nuovo){
  const t = titoloChiaveOrdine(nuovo), h24 = nuovo.tempo==="h24";
  let ultimoUguale=-1, migliorMinore=-1, tMinore=null, primoMaggiore=-1, tMaggiore=null, trovati=0;
  lista.forEach((m,i)=>{
    if((m.tempo==="h24")!==h24) return;
    trovati++;
    const tm = titoloChiaveOrdine(m), c = tm.localeCompare(t,"it");
    if(c===0) ultimoUguale=i;
    else if(c<0){ if(tMinore===null || tm.localeCompare(tMinore,"it")>=0){ tMinore=tm; migliorMinore=i; } }
    else if(tMaggiore===null || tm.localeCompare(tMaggiore,"it")<0){ tMaggiore=tm; primoMaggiore=i; }
  });
  if(!trovati) return h24 ? lista.length : 0;
  if(ultimoUguale>=0) return ultimoUguale+1;
  if(migliorMinore>=0) return migliorMinore+1;
  if(primoMaggiore>=0) return primoMaggiore;
  return h24 ? lista.length : 0;
}
// Mette "nuovo" (nuovo o spostato) nel punto giusto di UN ordine. usaAltro=true lavora sull'altro ordine
// (si scambiano le due posizioni, si ricalcola, si rimettono a posto).
function posizionaInOrdine(modelliAll, nuovo, targetCalId, calendarsOrdinati, mainCalId, lettera, usaAltro, idxForzato){
  const vista = usaAltro ? modelliAll.map(scambiaOrdini) : modelliAll;
  const nuovoV = vista.find(m=>m.id===nuovo.id) || (usaAltro ? scambiaOrdini(nuovo) : nuovo);
  const delCal = calcolaOrdineModelli(vista.filter(m=>(m.calendarId||mainCalId)===targetCalId && m.id!==nuovo.id));
  const idx = (idxForzato!=null && lettera==="A") ? Math.max(0, Math.min(idxForzato, delCal.length)) : (lettera==="A" ? indiceInserimentoA(delCal, nuovoV) : indiceInserimentoB(delCal, nuovoV));
  const riord = [...delCal]; riord.splice(idx, 0, nuovoV);
  const base = vista.some(m=>m.id===nuovo.id) ? vista : [...vista, nuovoV];
  const ris = ricalcolaPosizioniGlobali(base, calendarsOrdinati, new Map([[targetCalId, riord]]), mainCalId);
  return usaAltro ? ris.map(scambiaOrdini) : ris;
}

// Assegna le posizioni a un calendario lasciando dei BUCHI tra i numeri.
// "ordine" = modelli del calendario nell'ordine desiderato. I modelli che
// hanno già un numero valido e coerente con l'ordine NON vengono toccati;
// solo quelli spostati/nuovi ricevono un numero a metà tra i vicini
// (spostare un modello = 1 sola modifica). Se i buchi finiscono in un punto,
// si rinumera solo quel calendario con il passo normale.
function assegnaPosizioniConBuchi(ordine, base){
  const n = ordine.length;
  const fine = base + BLOCCO_POSIZIONI_CALENDARIO - 1;
  const valido = v => Number.isInteger(v) && v>=base && v<=fine;
  const vals = ordine.map(m=>m.sortOrder);
  // sottosequenza crescente più lunga tra i valori validi (i "fermi")
  const len = new Array(n).fill(0), pre = new Array(n).fill(-1);
  let best=-1;
  for(let i=0;i<n;i++){
    if(!valido(vals[i])) continue;
    len[i]=1;
    for(let j=0;j<i;j++){
      if(valido(vals[j]) && vals[j]<vals[i] && len[j]+1>len[i]){ len[i]=len[j]+1; pre[i]=j; }
    }
    if(best===-1 || len[i]>len[best]) best=i;
  }
  const fermo = new Array(n).fill(false);
  for(let i=best;i>=0;i=pre[i]) fermo[i]=true;
  const out = new Array(n);
  const rinumeraTutto = ()=>{
    const passo = Math.max(1, Math.min(PASSO_POSIZIONI, Math.floor((BLOCCO_POSIZIONI_CALENDARIO-1)/(n+1))));
    return ordine.map((m,i)=>base + passo*(i+1));
  };
  let i=0;
  while(i<n){
    if(fermo[i]){ out[i]=vals[i]; i++; continue; }
    let j=i; while(j<n && !fermo[j]) j++;           // blocco i..j-1 da assegnare
    const k=j-i;
    const loBound = i===0, hiBound = j===n;
    const lo = loBound ? base-1 : out[i-1];
    const hi = hiBound ? fine+1 : vals[j];
    let passo = Math.floor((hi-lo)/(k+1));
    if((loBound||hiBound) && passo>PASSO_POSIZIONI) passo=PASSO_POSIZIONI;
    if(passo<1) return rinumeraTutto();
    for(let x=0;x<k;x++){
      out[i+x] = loBound && !hiBound ? hi - passo*(k-x) : lo + passo*(x+1);
    }
    i=j;
  }
  return out;
}

function ricalcolaPosizioniGlobali(prev, calendarsOrdinati, ordiniPerCalendario, mainCalId){
  const idsTutti = new Set(calendarsOrdinati);
  // Aggiungo in coda eventuali calendari presenti nei modelli ma assenti
  // dall'elenco Impostazioni (caso limite), così nessun modello resta senza posizione.
  prev.forEach(m=>{
    const cId = m.calendarId||mainCalId;
    if(!idsTutti.has(cId)){ idsTutti.add(cId); calendarsOrdinati = [...calendarsOrdinati, cId]; }
  });
  const nuoviValori = new Map();
  for(let i=0; i<calendarsOrdinati.length; i++){
    const numeroCalendario = i+1; // il primo calendario è il numero 1
    const cId = calendarsOrdinati[i];
    const ordineBlocco = ordiniPerCalendario.has(cId)
      ? ordiniPerCalendario.get(cId)
      : calcolaOrdineModelli(prev.filter(m=>(m.calendarId||mainCalId)===cId));
    const base = numeroCalendario*BLOCCO_POSIZIONI_CALENDARIO;
    const valori = assegnaPosizioniConBuchi(ordineBlocco, base);
    ordineBlocco.forEach((m, idx)=>{ nuoviValori.set(m.id, valori[idx]); });
  }
  return prev.map(m=> nuoviValori.has(m.id) ? {...m, sortOrder:nuoviValori.get(m.id)} : m);
}

// Elenco completo (tutti i calendari insieme), usato dove serve una vista
// globale — es. il ripristino da backup, o quando calId===null ("tutti").
const modelliOrdinati = useMemo(()=>calcolaOrdineVisuale(modelli, gruppi, mainCalId), [modelli, gruppi, mainCalId]);

const importsRecenti = useMemo(()=>{
  // Raggruppa per (calendario, importId): serve a tutti e 3 i dialog di import.
  const gruppi = {};
  for(const [dateKey, calMap] of Object.entries(store.events||{})){
    for(const [cid, lista] of Object.entries(calMap||{})){
      for(const ev of (lista||[])){
        if(!ev.importId) continue;
        const k = cid+"|"+ev.importId;
        if(!gruppi[k]) gruppi[k] = { importId: ev.importId, calendarId: cid, count:0, minDate:dateKey, maxDate:dateKey, eventi:[] };
        gruppi[k].count++;
        gruppi[k].eventi.push({ d: dateKey, l: ev.label||"" });
        if(dateKey < gruppi[k].minDate) gruppi[k].minDate = dateKey;
        if(dateKey > gruppi[k].maxDate) gruppi[k].maxDate = dateKey;
      }
    }
  }
  for(const g of Object.values(gruppi)) g.eventi.sort((a,b)=> a.d.localeCompare(b.d));
  return Object.values(gruppi).sort((a,b)=> (b.importId||"").localeCompare(a.importId||""));
}, [store.events]);


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
    const puliti = (prev||[]).filter(Boolean);
    if(calIdFiltro==null) return puliti;
    return puliti.filter(m=>(m.calendarId||mainCalId)===calIdFiltro);
  }

  // -- Sposta un modello di UNA posizione (freccia ^) all'interno del suo
  // calendario: lo scambia con il vicino immediato nella direzione scelta,
  // poi rinumera tutta l'app a blocchi globali (vedi ricalcolaPosizioniGlobali)
  // cosi' il blocco di questo calendario resta contiguo e ordinato, e gli
  // altri calendari mantengono la loro posizione relativa.
  function spostaModelloPuro(prev, id, dir, calIdFiltro, idVicino){
    const sottoinsieme = calcolaOrdineModelli(modelliDelCalendario(prev, calIdFiltro));
    const idx = sottoinsieme.findIndex(m=>m.id===id);
    if(idx===-1) return prev;
    // idVicino (opzionale): scambio con quel modello preciso, quello che si vede accanto nella tendina
    const vicinoIdx = idVicino ? sottoinsieme.findIndex(m=>m.id===idVicino) : (dir==="up" ? idx-1 : idx+1);
    if(vicinoIdx<0 || vicinoIdx>=sottoinsieme.length) return prev; // gia' al limite, nessun movimento
    const riordinato = [...sottoinsieme];
    [riordinato[idx], riordinato[vicinoIdx]] = [riordinato[vicinoIdx], riordinato[idx]];
    const calendarsOrdinati = store.calendars.map(c=>c.id);
    const ordiniPerCalendario = new Map([[calIdFiltro, riordinato]]);
    return ricalcolaPosizioniGlobali(prev, calendarsOrdinati, ordiniPerCalendario, mainCalId);
  }

  // -- Trascina un modello (drag & drop) fino alla posizione esatta di
  // dstId, all'interno dello stesso calendario: lo rimuove dalla sua
  // posizione, lo reinserisce nell'indice di destinazione, poi rinumera
  // tutta l'app a blocchi globali, mantenendo il blocco di questo
  // calendario contiguo e gli altri calendari invariati.
  function trascinaModelloPuro(prev, srcId, dstId, calIdFiltro){
    if(!srcId || !dstId || srcId===dstId){
      return prev;
    }
    // dstId speciale "__FONDO__": la zona "sposta in fondo" sotto l'ultima
    // card. Senza questo caso l'ultimo posto era irraggiungibile, perche' il
    // modello viene sempre inserito PRIMA della card di destinazione.
    const inFondo = dstId==="__FONDO__";
    const sottoinsiemeIds = new Set(modelliDelCalendario(prev, calIdFiltro).map(m=>m.id));
    if(!sottoinsiemeIds.has(srcId) || (!inFondo && !sottoinsiemeIds.has(dstId))){
      return prev;
    }
    const ordinato = calcolaOrdineModelli(modelliDelCalendario(prev, calIdFiltro));
    const srcIdx = ordinato.findIndex(m=>m.id===srcId);
    const dstIdx = inFondo ? ordinato.length : ordinato.findIndex(m=>m.id===dstId);
    if(srcIdx===-1 || dstIdx===-1){
      return prev;
    }
    if(inFondo && srcIdx===ordinato.length-1) return prev; // gia' ultimo
    const riordinato = [...ordinato];
    const [tolto] = riordinato.splice(srcIdx,1);
    // Quando la riga azzurra è sopra la card bersaglio (dstId), l'utente
    // intende inserire il modello PRIMA di dstId.
    // Se stiamo trascinando verso il basso (srcIdx < dstIdx), la rimozione di
    // srcIdx ha già fatto scalare l'indice di dstId di -1. Quindi l'indice di
    // inserimento per trovarsi prima di dstId diventa (dstIdx - 1).
    // Se stiamo trascinando verso l'alto (srcIdx > dstIdx), l'indice di
    // dstId non è cambiato, quindi l'inserimento avviene a dstIdx.
    const targetIdx = srcIdx < dstIdx ? dstIdx - 1 : dstIdx;
    riordinato.splice(targetIdx, 0, tolto);
    const calendarsOrdinati = store.calendars.map(c=>c.id);
    const ordiniPerCalendario = new Map([[calIdFiltro, riordinato]]);
    return ricalcolaPosizioniGlobali(prev, calendarsOrdinati, ordiniPerCalendario, mainCalId);
  }

  // Salva su Supabase i modelli effettivamente cambiati (confronto tra stato
  // precedente e nuovo), scoperti passando entrambi gli elenchi.
  //
  // Lo stato locale (React + eventuale cache) è GIÀ aggiornato dal chiamante
  // prima di arrivare qui: il nuovo ordine è quindi visibile e utilizzabile
  // da subito, a prescindere da Supabase. Da qui in poi si usa
  // scriviConBackup (lo stesso meccanismo usato per turni/eventi) così che:
  //   - se la rete è instabile o assente, il salvataggio va in coda silenziosa
  //     e riparte da solo alla riconnessione — nessun popup, nessun blocco;
  //   - solo un errore "vero" (permessi, RLS, validazione — qualcosa che una
  //     nuova connessione non risolverebbe da sola) resta nel log tecnico.
  // In nessun caso l'utente resta bloccato in attesa che Supabase risponda.
  async function salvaModifichePosizioni(prevElenco, nuovoElenco){
    const prevById = new Map(prevElenco.map(m=>[m.id,m]));
    const daSalvare = nuovoElenco.filter(m=>{
      const prima = prevById.get(m.id);
      return !prima || prima.sortOrder!==m.sortOrder || (prima.sortOrderAltro||0)!==(m.sortOrderAltro||0);
    }).filter(m=>Object.keys(payloadPosCambiate(prevById.get(m.id), m)).length>0);
    const ts = new Date().toISOString();
    await scriviBatchConBackup({
      ops: daSalvare.map(m=>({
        tipo: "update", table: "modelli",
        payload: payloadPosCambiate(prevById.get(m.id), m),
        matchObj: { id: m.id, user_id: userId },
        contesto: "Salvataggio posizione modello",
      })),
      contesto: "Salvataggio posizione modello", ts, opzioni: { soloLog: true },
    });
  }

  async function moveH24(id, dir, calIdFiltro, idVicino){
    const prev = modelliRef.current;
    const nuovo = spostaModelloPuro(prev, id, dir, calIdFiltro, idVicino);
    if(nuovo===prev) return;
    modelliRef.current = nuovo;
    setModelli(nuovo);
    saveToLocalStorage(undefined, undefined, nuovo); // il riordino deve restare dopo il riavvio
    segnalaModificaOrdineModelli();
    await salvaModifichePosizioni(prev, nuovo);
  }

  async function reorderModelli(srcId, dstId, calIdFiltro){
    const prev = modelliRef.current;
    const nuovo = trascinaModelloPuro(prev, srcId, dstId, calIdFiltro);
    if(nuovo===prev) return;
    modelliRef.current = nuovo;
    setModelli(nuovo);
    saveToLocalStorage(undefined, undefined, nuovo); // il riordino deve restare dopo il riavvio
    segnalaModificaOrdineModelli();
    await salvaModifichePosizioni(prev, nuovo);
  }

  // ═══════════════════════════════════════════════════════════════
  // GRUPPI A TENDINA dei modelli. Ogni ordine (A alfabetico, B orario) ha i propri gruppi,
  // per calendario. Un modello senza gruppo sta sotto tutti i gruppi, nel suo ordine di sempre.
  // Scritture sempre a blocchi (una richiesta); il locale si aggiorna subito.
  // ═══════════════════════════════════════════════════════════════
  function gruppiDelCalendario(calIdX, ordine){
    const ord = ordine || ordineAttivo();
    // Ordine A: contano solo i gruppi "gestiti" (sort_order dalla BANDA_A in su); i vecchi gruppi A restano nascosti.
    return (gruppi||[]).filter(g=>g.ordine===ord && (g.calendarId||mainCalId)===calIdX && (ord!=="A" || (g.sortOrder||0)>=BANDA_A))
      .sort((a,b)=> a.sortOrder!==b.sortOrder ? a.sortOrder-b.sortOrder : String(a.id).localeCompare(String(b.id)));
  }
  // Gruppo in cui mettere un modello NUOVO o MODIFICATO, con le regole di sempre (le stesse del riempimento iniziale):
  //   ordine A: nome che inizia per D/DF + spazio = DISTACCATI; categoria AUTO = AUTO; categoria APP = APPIEDATI; altrimenti ALTRI.
  //   ordine B: H24 con nome NOTTE/MATTINA/POMERIGGIO/3 TURNO = quella fascia, altri H24 = H24; 6h15/6h30 = fascia dell'orario di inizio
  //             (MATTINA, POMERIGGIO, TERZO TURNO, NOTTE); personalizzati senza orario = nessun gruppo.
  // Si cerca fra i gruppi veri del calendario quello con lo STESSO NOME (maiuscole ininfluenti); se non c'e' = senza gruppo (null).
  function gruppoPerRegola(m, ordine, calIdX){
    if(!m) return null;
    let nome = null;
    if(ordine==="A"){
      // Ordine A: il modello nuovo/modificato va nel gruppo della sua classe (APP, AUTO, DISTACCATI, FESTIVI, PI, H24,
      // PERSONALIZZATO o lettera iniziale), se quel gruppo esiste; altrimenti resta senza gruppo (in fondo, in ordine alfabetico).
      nome = classeModelloA(m);
    } else {
      const NOMI = { mattina:"MATTINA", pomeriggio:"POMERIGGIO", terzo_turno:"TERZO TURNO", notte:"NOTTE" };
      if(m.tempo==="h24"){
        const t = String(m.titolo||"").toUpperCase().replace(/[\s°]/g,"");
        const fk = { NOTTE:"notte", MATTINA:"mattina", POMERIGGIO:"pomeriggio", "3TURNO":"terzo_turno", TERZOTURNO:"terzo_turno" }[t];
        nome = fk ? NOMI[fk] : "H24";
      } else if(m.tempo==="6h15" || m.tempo==="6h30"){
        const mm = oraInMinuti(m.inizio||"");
        if(mm!=null){
          const f = (fasceAutomatiche||[]).find(f=> f.from<=f.to ? (mm>=f.from && mm<=f.to) : (mm>=f.from || mm<=f.to));
          if(f) nome = NOMI[f.key] || String(f.label||"").toUpperCase();
        }
      }
    }
    if(!nome) return null;
    const g = gruppiDelCalendario(calIdX, ordine).find(x=>String(x.nome||"").trim().toUpperCase()===nome);
    return g ? g.id : null;
  }
  // Ordine A, CREAZIONE di un modello: va in coda al gruppo (tendina) che ha PIU' modelli con lo stesso orario d'inizio.
  // In caso di parita' (o se nessun gruppo ha quell'orario): in fondo all'elenco, in coda all'ultimo gruppo.
  // Vale solo con gruppi veri; con le tendine automatiche resta la regola per nome (ritorna null).
  function postoNuovoModelloA(modelliAll, nuovo, calIdX){
    const gl = gruppiDelCalendario(calIdX, "A");
    if(!gl.length) return null;
    const vista = ordineAttivo()==="A" ? modelliAll : modelliAll.map(scambiaOrdini);
    const lista = calcolaOrdineModelli(vista.filter(m=>m && (m.calendarId||mainCalId)===calIdX && m.id!==nuovo.id));
    if(!lista.length) return { gruppoId:null, indice:0 };
    const k = minutiInizio(nuovo);
    const conta = new Map();
    lista.forEach(m=>{ if(minutiInizio(m)===k){ const g = m.gruppoA||"__senza__"; conta.set(g, (conta.get(g)||0)+1); } });
    let migliore = null, max = 0, parita = false;
    conta.forEach((n,g)=>{ if(n>max){ max=n; migliore=g; parita=false; } else if(n===max){ parita=true; } });
    let chiave, indice;
    if(migliore && !parita){
      chiave = migliore;
      let ultimo = -1; lista.forEach((m,i)=>{ if((m.gruppoA||"__senza__")===chiave) ultimo = i; });
      indice = ultimo+1;
    } else {
      chiave = lista[lista.length-1].gruppoA||"__senza__";
      indice = lista.length;
    }
    return { gruppoId: chiave==="__senza__" ? null : chiave, indice };
  }
  async function aggiungiGruppo(nome, calIdX){
    if(!userId) return { ok:false };
    const n = String(nome||"").trim().toUpperCase();
    const cal = calIdX || mainCalId;
    if(!n || !cal) return { ok:false };
    const ordine = ordineAttivo();
    const esistenti = gruppiDelCalendario(cal, ordine);
    if(esistenti.some(g=>String(g.nome||"").toUpperCase()===n)) return { ok:false, motivo:"esiste" };
    // Ordine A: prima di aggiungere, le tendine automatiche diventano gruppi veri (una sola volta).
    if(ordine==="A" && esistenti.length===0){
      await materializzaGruppiA(cal);
      return aggiungiGruppo(nome, calIdX);
    }
    const ultimo = esistenti.reduce((mx,g)=>Math.max(mx, g.sortOrder||0), ordine==="A" ? BANDA_A : 0);
    const nuovo = { id:generaIdLocale(), calendarId:cal, ordine, nome:n, sortOrder:ultimo+1000 };
    setGruppi(prev=>[...prev, nuovo]);
    await scriviBatchConBackup({
      ops:[{ tipo:"insert", table:"gruppi_modelli",
        payload:{ id:nuovo.id, user_id:userId, calendar_id:cal, ordine, nome:n, sort_order:nuovo.sortOrder },
        matchObj:null, contesto:"Nuovo gruppo" }],
      contesto:"Nuovo gruppo", ts:new Date().toISOString(), opzioni:{ soloLog:true },
    });
    return { ok:true, gruppo:nuovo };
  }
  // Ordine A: le tendine automatiche (classi per nome/tipo) diventano gruppi veri del calendario, UNA sola volta:
  // da quel momento si possono spostare, rinominare, eliminare e i modelli si spostano fra le tendine.
  // Posizioni dei modelli invariate; cambiano solo gruppo_a dei modelli. Scrittura a blocchi con backup.
  async function materializzaGruppiA(calIdX){
    if(!userId || !calIdX) return { ok:false };
    if(gruppiDelCalendario(calIdX, "A").length>0) return { ok:true, gia:true };
    if(materializzandoA.current.has(calIdX)) return { ok:false };
    materializzandoA.current.add(calIdX);
    try{
      const prev = modelliRef.current||[];
      const miei = prev.filter(m=>m && (m.calendarId||mainCalId)===calIdX);
      if(miei.length===0) return { ok:false };
      const chiavi = ordinaClassiA([...new Set(miei.map(classeModelloA))]);
      const nuoviGruppi = chiavi.map((k,i)=>({ id:generaIdLocale(), calendarId:calIdX, ordine:"A", nome:k, sortOrder:BANDA_A+(i+1)*1000 }));
      const idPerClasse = new Map(chiavi.map((k,i)=>[k, nuoviGruppi[i].id]));
      const nuovi = prev.map(m=> (m && (m.calendarId||mainCalId)===calIdX) ? { ...m, gruppoA:idPerClasse.get(classeModelloA(m)) } : m);
      setGruppi(p=>[...p, ...nuoviGruppi]);
      modelliRef.current = nuovi;
      setModelli(nuovi);
      saveToLocalStorage(undefined, undefined, nuovi);
      const ops = [
        ...nuoviGruppi.map(g=>({ tipo:"insert", table:"gruppi_modelli",
          payload:{ id:g.id, user_id:userId, calendar_id:calIdX, ordine:"A", nome:g.nome, sort_order:g.sortOrder },
          matchObj:null, contesto:"Gruppi ordine A" })),
        ...miei.filter(m=>(m.gruppoA||null)!==idPerClasse.get(classeModelloA(m))).map(m=>({ tipo:"update", table:"modelli",
          payload:{ gruppo_a:idPerClasse.get(classeModelloA(m)) }, matchObj:{ id:m.id, user_id:userId }, contesto:"Gruppi ordine A" })),
      ];
      await scriviBatchConBackup({ ops, contesto:"Gruppi ordine A (prima gestione)", ts:new Date().toISOString(), opzioni:{ soloLog:true } });
      return { ok:true, gruppi:nuoviGruppi.length };
    } finally {
      materializzandoA.current.delete(calIdX);
    }
  }
  async function rinominaGruppo(id, nome){
    const n = String(nome||"").trim().toUpperCase();
    const g = (gruppi||[]).find(x=>x.id===id);
    if(!userId || !n || !g) return { ok:false };
    if(n===g.nome) return { ok:true };
    if(gruppiDelCalendario(g.calendarId||mainCalId, g.ordine).some(x=>x.id!==id && String(x.nome||"").toUpperCase()===n)) return { ok:false, motivo:"esiste" };
    setGruppi(prev=>prev.map(x=>x.id===id ? {...x, nome:n} : x));
    await scriviBatchConBackup({
      ops:[{ tipo:"update", table:"gruppi_modelli", payload:{ nome:n }, matchObj:{ id, user_id:userId }, contesto:"Rinomina gruppo" }],
      contesto:"Rinomina gruppo", ts:new Date().toISOString(), opzioni:{ soloLog:true },
    });
    return { ok:true };
  }
  // Elimina il gruppo: i suoi modelli NON vengono toccati, tornano senza gruppo (e seguono il loro ordine).
  async function eliminaGruppo(id){
    const g = (gruppi||[]).find(x=>x.id===id);
    if(!userId || !g) return { ok:false };
    const campo = g.ordine==="A" ? "gruppoA" : "gruppoB";
    const col = colGruppo(g.ordine);
    const membri = (modelliRef.current||[]).filter(m=>m && m[campo]===id);
    setGruppi(prev=>prev.filter(x=>x.id!==id));
    if(membri.length>0){
      const nuovi = (modelliRef.current||[]).map(m=> (m && m[campo]===id) ? {...m, [campo]:null} : m);
      modelliRef.current = nuovi;
      setModelli(nuovi);
      saveToLocalStorage(undefined, undefined, nuovi);
    }
    await scriviBatchConBackup({
      ops:[
        ...membri.map(m=>({ tipo:"update", table:"modelli", payload:{ [col]:null }, matchObj:{ id:m.id, user_id:userId }, contesto:"Elimina gruppo \u2014 modelli senza gruppo" })),
        { tipo:"delete", table:"gruppi_modelli", payload:null, matchObj:{ id, user_id:userId }, contesto:"Elimina gruppo" },
      ],
      contesto:"Elimina gruppo", ts:new Date().toISOString(), opzioni:{ soloLog:true },
    });
    return { ok:true, modelliLiberati:membri.length };
  }

  // Salva i modelli cambiati: posizioni (colonne dell'ordine A/B) e appartenenza ai gruppi (gruppo_a / gruppo_b), a blocchi.
  async function salvaModificheModelliEGruppi(prevElenco, nuovoElenco, contesto){
    const prevById = new Map(prevElenco.map(m=>[m.id,m]));
    const ops = [];
    nuovoElenco.forEach(m=>{
      const prima = prevById.get(m.id); if(!prima) return;
      const payload = { ...payloadPosCambiate(prima, m) };
      if((prima.gruppoA||null)!==(m.gruppoA||null)) payload.gruppo_a = m.gruppoA||null;
      if((prima.gruppoB||null)!==(m.gruppoB||null)) payload.gruppo_b = m.gruppoB||null;
      if(Object.keys(payload).length===0) return;
      ops.push({ tipo:"update", table:"modelli", payload, matchObj:{ id:m.id, user_id:userId }, contesto });
    });
    await scriviBatchConBackup({ ops, contesto, ts:new Date().toISOString(), opzioni:{ soloLog:true } });
  }
  // Sposta un modello in un gruppo (destGruppoId = null: senza gruppo) del suo calendario, nella posizione scelta:
  // primaDiId = modello davanti al quale inserirlo (null = in fondo al gruppo). Le posizioni degli altri modelli
  // restano ferme (di solito UNA sola scrittura); i gruppi di arrivo vuoti cambiano solo l'appartenenza.
  async function spostaModelloInGruppo(id, destGruppoId, primaDiId, calIdX){
    if(!userId) return;
    const prev = modelliRef.current;
    const corrente = (prev||[]).find(x=>x && x.id===id);
    if(!corrente || (corrente.calendarId||mainCalId)!==calIdX) return;
    const ordine = ordineAttivo();
    const campo = ordine==="A" ? "gruppoA" : "gruppoB";
    const gl = gruppiDelCalendario(calIdX, ordine);
    const dest = destGruppoId || null;
    if(dest && !gl.some(g=>g.id===dest)) return;
    const eff = x => { const g = x[campo]; return (g && gl.some(y=>y.id===g)) ? g : null; };
    const flat = calcolaOrdineModelli(modelliDelCalendario(prev, calIdX));
    const membri = flat.filter(x=>x.id!==id && eff(x)===dest);
    const mm = { ...corrente, [campo]: dest };
    let nuovoFlat;
    if(membri.length>0){
      const ix = primaDiId ? membri.findIndex(x=>x.id===primaDiId) : -1;
      nuovoFlat = flat.filter(x=>x.id!==id);
      const rif = ix>=0 ? membri[ix].id : membri[membri.length-1].id;
      const p = nuovoFlat.findIndex(x=>x.id===rif);
      nuovoFlat.splice(ix>=0 ? p : p+1, 0, mm);
    } else {
      nuovoFlat = flat.map(x=>x.id===id ? mm : x); // gruppo vuoto: la posizione non cambia
    }
    const ricalcolato = ricalcolaPosizioniGlobali(prev, store.calendars.map(c=>c.id), new Map([[calIdX, nuovoFlat]]), mainCalId);
    const nuovo = ricalcolato.map(x=> (x && x.id===id) ? { ...x, [campo]: dest } : x);
    modelliRef.current = nuovo;
    setModelli(nuovo);
    saveToLocalStorage(undefined, undefined, nuovo);
    segnalaModificaOrdineModelli();
    await salvaModificheModelliEGruppi(prev, nuovo, "Spostamento modello fra gruppi");
  }
  // Sposta PIU' modelli insieme (selezione multipla, tappa 3) in un gruppo del calendario (destGruppoId = null: senza gruppo).
  // Arrivano come blocco, nello stesso ordine relativo con cui si vedono nell'elenco (prima i gruppi, poi senza gruppo).
  // primaDiId = modello (non selezionato) davanti al quale inserirli; null = in fondo al gruppo.
  // Le posizioni degli altri modelli restano ferme; tutto in UNA richiesta a blocchi (applica_modifiche).
  async function spostaModelliInGruppo(ids, destGruppoId, primaDiId, calIdX){
    if(!userId || !Array.isArray(ids) || ids.length===0) return;
    const prev = modelliRef.current;
    const ordine = ordineAttivo();
    const campo = ordine==="A" ? "gruppoA" : "gruppoB";
    const gl = gruppiDelCalendario(calIdX, ordine);
    const dest = destGruppoId || null;
    if(dest && !gl.some(g=>g.id===dest)) return;
    const eff = x => { const g = x[campo]; return (g && gl.some(y=>y.id===g)) ? g : null; };
    const flat = calcolaOrdineModelli(modelliDelCalendario(prev, calIdX));
    const idSet = new Set(ids);
    const posFlat = new Map(flat.map((x,k)=>[x.id,k]));
    const indiceGruppo = x => { const g = eff(x); if(!g) return gl.length; const k = gl.findIndex(y=>y.id===g); return k<0 ? gl.length : k; };
    // Solo modelli di questo calendario; ordine di arrivo = ordine visibile (gruppo, poi posizione).
    const sel = flat.filter(x=>idSet.has(x.id)).sort((a,b)=> (indiceGruppo(a)-indiceGruppo(b)) || (posFlat.get(a.id)-posFlat.get(b.id)));
    if(sel.length===0) return;
    const selSet = new Set(sel.map(x=>x.id));
    const membri = flat.filter(x=>!selSet.has(x.id) && eff(x)===dest);
    const mms = sel.map(x=>({ ...x, [campo]: dest }));
    let nuovoFlat;
    if(membri.length>0){
      const rifId = (primaDiId && membri.some(x=>x.id===primaDiId)) ? primaDiId : null;
      nuovoFlat = flat.filter(x=>!selSet.has(x.id));
      if(rifId){
        const p = nuovoFlat.findIndex(x=>x.id===rifId);
        nuovoFlat.splice(p, 0, ...mms);
      } else {
        const p = nuovoFlat.findIndex(x=>x.id===membri[membri.length-1].id);
        nuovoFlat.splice(p+1, 0, ...mms);
      }
    } else {
      nuovoFlat = flat.map(x=> selSet.has(x.id) ? { ...x, [campo]: dest } : x); // gruppo vuoto: le posizioni non cambiano
    }
    const ricalcolato = ricalcolaPosizioniGlobali(prev, store.calendars.map(c=>c.id), new Map([[calIdX, nuovoFlat]]), mainCalId);
    const nuovo = ricalcolato.map(x=> (x && selSet.has(x.id)) ? { ...x, [campo]: dest } : x);
    modelliRef.current = nuovo;
    setModelli(nuovo);
    saveToLocalStorage(undefined, undefined, nuovo);
    segnalaModificaOrdineModelli();
    await salvaModificheModelliEGruppi(prev, nuovo, "Spostamento di "+sel.length+" modelli fra gruppi");
  }
  // Sposta un gruppo (con i suoi modelli) su o giu' di un posto fra i gruppi dello stesso calendario e ordine.
  async function spostaGruppo(id, dir){
    const g = (gruppi||[]).find(x=>x.id===id); if(!userId || !g) return;
    const gl = gruppiDelCalendario(g.calendarId||mainCalId, g.ordine);
    const i = gl.findIndex(x=>x.id===id); const j = dir==="up" ? i-1 : i+1;
    if(i<0 || j<0 || j>=gl.length) return;
    const nuovaLista = [...gl]; [nuovaLista[i], nuovaLista[j]] = [nuovaLista[j], nuovaLista[i]];
    const valori = gl.map(x=>x.sortOrder||0);
    const distinti = valori.every((v,k)=> k===0 || v>valori[k-1]);
    const baseSort = g.ordine==="A" ? BANDA_A : 0;
    const sortNuovi = new Map(nuovaLista.map((x,k)=>[x.id, distinti ? valori[k] : baseSort+(k+1)*1000]));
    const cambiati = nuovaLista.filter(x=>(x.sortOrder||0)!==sortNuovi.get(x.id));
    setGruppi(prev=>prev.map(x=> sortNuovi.has(x.id) ? { ...x, sortOrder:sortNuovi.get(x.id) } : x));
    await scriviBatchConBackup({
      ops: cambiati.map(x=>({ tipo:"update", table:"gruppi_modelli", payload:{ sort_order:sortNuovi.get(x.id) }, matchObj:{ id:x.id, user_id:userId }, contesto:"Sposta gruppo" })),
      contesto:"Sposta gruppo", ts:new Date().toISOString(), opzioni:{ soloLog:true },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Spostamento e riordino per ROTAZIONI e COLORI — stessa logica di
  // spostaModelloPuro/salvaModifichePosizioni sopra, ma senza il concetto
  // di "calendario filtro" (rotazioni e colori non sono legati a un
  // calendario specifico): qui si riordina semplicemente l'intero array.
  // ═══════════════════════════════════════════════════════════════

  function spostaRotazionePura(prev, id, dir){
    const ordinato = [...prev].sort((a,b)=>{
      const sa=a.sortOrder||0, sb=b.sortOrder||0;
      if(sa!==sb) return sa-sb;
      return String(a.id).localeCompare(String(b.id));
    });
    const idx = ordinato.findIndex(r=>r.id===id);
    if(idx===-1) return prev;
    const vicinoIdx = dir==="up" ? idx-1 : idx+1;
    if(vicinoIdx<0 || vicinoIdx>=ordinato.length) return prev;
    [ordinato[idx], ordinato[vicinoIdx]] = [ordinato[vicinoIdx], ordinato[idx]];
    return ordinato.map((r,i)=>({...r, sortOrder:i}));
  }

  async function salvaModifichePosizioniRotazioni(prevElenco, nuovoElenco){
    const prevById = new Map(prevElenco.map(r=>[r.id,r]));
    const daSalvare = nuovoElenco.filter(r=>{
      const prima = prevById.get(r.id);
      return !prima || prima.sortOrder!==r.sortOrder;
    });
    const ts = new Date().toISOString();
    await scriviBatchConBackup({
      ops: daSalvare.map(r=>({
        tipo: "update", table: "rotazioni",
        payload: { sort_order: r.sortOrder },
        matchObj: { id: r.id, user_id: userId },
        contesto: "Salvataggio posizione rotazione",
      })),
      contesto: "Salvataggio posizione rotazione", ts, opzioni: { soloLog: true },
    });
  }

  async function moveRotazione(id, dir){
    // Calcolo SUBITO dai valori correnti (non dentro l'updater di React, che non è
    // garantito venga eseguito prima delle righe successive).
    const prevSnapshot = rotazioni;
    const nuovoElenco = spostaRotazionePura(prevSnapshot, id, dir);
    setRotazioni(nuovoElenco);
    if(prevSnapshot && nuovoElenco) await salvaModifichePosizioniRotazioni(prevSnapshot, nuovoElenco);
  }

  function spostaColoreExtraPuro(prev, hex, dir, ordineVisibile){
    const ordinato = [...prev].sort((a,b)=>{
      const sa=a.sortOrder||0, sb=b.sortOrder||0;
      if(sa!==sb) return sa-sb;
      return String(a.hex).localeCompare(String(b.hex));
    });
    const idx = ordinato.findIndex(c=>stessoHexColore(c.hex,hex));
    if(idx===-1) return prev;
    let vicinoIdx;
    if(Array.isArray(ordineVisibile) && ordineVisibile.length>0){
      // Il vicino è quello che si vede in lista (può essere filtrata per calendario).
      const iv = ordineVisibile.findIndex(h=>stessoHexColore(h,hex));
      const nh = iv===-1 ? null : ordineVisibile[dir==="up" ? iv-1 : iv+1];
      if(!nh) return prev;
      vicinoIdx = ordinato.findIndex(c=>stessoHexColore(c.hex,nh));
    } else {
      vicinoIdx = dir==="up" ? idx-1 : idx+1;
    }
    if(vicinoIdx<0 || vicinoIdx>=ordinato.length) return prev;
    [ordinato[idx], ordinato[vicinoIdx]] = [ordinato[vicinoIdx], ordinato[idx]];
    return ordinato.map((c,i)=>({...c, sortOrder:i}));
  }

  async function salvaModifichePosizioniColori(prevElenco, nuovoElenco){
    const prevByHex = new Map(prevElenco.map(c=>[c.hex,c]));
    const daSalvare = nuovoElenco.filter(c=>{
      const prima = prevByHex.get(c.hex);
      return !prima || prima.sortOrder!==c.sortOrder;
    });
    const ts = new Date().toISOString();
    await scriviBatchConBackup({
      ops: daSalvare.map(c=>({
        tipo: "update", table: "colori",
        payload: { sort_order: c.sortOrder },
        matchObj: { hex: c.hex, user_id: userId },
        contesto: "Salvataggio posizione colore",
      })),
      contesto: "Salvataggio posizione colore", ts, opzioni: { soloLog: true },
    });
  }

  async function moveColoreExtra(hex, dir, ordineVisibile){
    let prevSnapshot = null, nuovoElenco = null;
    setColoriExtra(prev=>{
      prevSnapshot = prev;
      nuovoElenco = spostaColoreExtraPuro(prev, hex, dir, ordineVisibile);
      return nuovoElenco;
    });
    if(prevSnapshot && nuovoElenco) await salvaModifichePosizioniColori(prevSnapshot, nuovoElenco);
  }

  // ── Operazione UNA TANTUM: ricalcola il colore di ogni modello CON
  // ORARIO (tempo !== "h24") in base alla fascia oraria corrente
  // (fasceAutomatiche), forzando anche i modelli che avevano un colore
  // scelto a mano (coloreCustom) a diventare "automatico per fascia".
  // I modelli H24 non vengono toccati: restano col colore che avevano
  // (custom o automatico H24), su richiesta esplicita.
  //
  // Non usa saveModello/saveModelloInterno (che ricalcolano anche ordine
  // ed eventi collegati, effetti collaterali non voluti qui): aggiorna
  // solo colore/colore_custom, subito in locale, poi in coda offline-friendly
  // via scriviConBackup — stesso meccanismo di salvaModifichePosizioni.
  // ── Propagazione del COLORE di un modello agli eventi già in calendario.
  // Stessa logica che saveModelloInterno applica a nome/orario/colore quando
  // si salva un modello dal form, ma riusabile dai percorsi che cambiano il
  // colore SENZA passare dal form (cambio hex in Modelli->Colori, ricolorazione
  // per fascia, normalizzazione). Riceve una mappa { modelloId: nuovoColore }.
  // Aggiorna store locale + localStorage subito, poi Supabase (events) e Sheets
  // in background. Ritorna il nuovo events da usare per sync/backup.
  async function propagaColoreModelliAgliEventi(mappaColori){
    const ids = Object.keys(mappaColori||{});
    if(ids.length===0 || !userId) return null;
    const nuovoStore = JSON.parse(JSON.stringify(store));
    Object.keys(nuovoStore.events||{}).forEach(dk=>{
      Object.keys(nuovoStore.events[dk]||{}).forEach(cid=>{
        nuovoStore.events[dk][cid] = (nuovoStore.events[dk][cid]||[]).map(e=>
          (e.modelloId && mappaColori[e.modelloId]) ? {...e, color:mappaColori[e.modelloId]} : e
        );
      });
    });
    saveToLocalStorage(nuovoStore.events, nuovoStore.calendars, modelli);
    setStore(s=>({...s, events:nuovoStore.events})); // solo gli eventi: non riporta indietro fasce e altro
    const ts = new Date().toISOString();
    (async()=>{
      // UNA sola richiesta per tutti i modelli (0 righe = modello senza eventi: normale).
      const risB = await scriviBatchConBackup({
        ops: ids.map(idMod=>({
          tipo:"update", table:"events", payload:{ color: mappaColori[idMod] },
          matchObj:{ modello_id:idMod, user_id:userId },
          contesto:"Cambio colore modello — propagazione agli eventi già in calendario", zeroOk:true,
        })),
        contesto:"Cambio colore modello — propagazione agli eventi", ts, opzioni:{soloLog:true},
      });
      if(risB?.errori>0) segnalaErroreSoloLog(`${risB.errori} modifiche non confermate durante la propagazione del colore agli eventi`, "Propagazione colore agli eventi");
    })();
    return nuovoStore.events;
  }

  // -- Ricolora gli eventi gia' in calendario (anche quelli scritti a mano) come il loro
  // modello. Cambia solo il colore (e il collegamento al modello se nome+orari coincidono).
  // Aggiorna SOLO gli eventi nello store: fasce, calendari e il resto restano come sono.
  async function applicaAllineamentoEventi(lista){
    if(!lista || lista.length===0 || !userId) return null;
    const perId = new Map(lista.map(x=>[x.id,x]));
    const mappa = ev => {
      const out = JSON.parse(JSON.stringify(ev||{}));
      Object.keys(out).forEach(dk=>{
        Object.keys(out[dk]||{}).forEach(cid=>{
          out[dk][cid] = (out[dk][cid]||[]).map(e=>{
            const x = e && perId.get(e.id);
            return x ? {...e, color:x.coloreNuovo, ...(x.collega?{modelloId:x.collega}:{})} : e;
          });
        });
      });
      return out;
    };
    const eventiNuovi = mappa((storeRef.current||store).events);
    setStore(s=>({...s, events: mappa(s.events)}));
    if(storeRef.current) storeRef.current = {...storeRef.current, events:eventiNuovi};
    const ts = new Date().toISOString();
    (async()=>{
      const risB = await scriviBatchConBackup({
        ops: lista.map(x=>({
          tipo:"update", table:"events",
          payload: x.collega ? { color:x.coloreNuovo, modello_id:x.collega } : { color:x.coloreNuovo },
          matchObj:{ id:x.id, user_id:userId },
          contesto:"Normalizza colori: allineo evento al suo modello",
        })),
        contesto:"Normalizza colori: allineo evento al suo modello", ts, opzioni:{ soloLog:true },
      });
      const errori = risB?.errori||0;
      if(errori>0) segnalaErroreSoloLog(`${errori} eventi non salvati su Supabase durante la normalizzazione colori`, "Normalizzazione colori");
    })();
    return eventiNuovi;
  }

  async function ricoloraModelliPerFasciaOraria(){
    // Calcolo SUBITO dai valori correnti (non dentro l'updater di React).
    const prevSnapshot = modelli;
    const modelliDaSalvare = [];
    const aggiornatiRicolorati = prevSnapshot.map(m=>{
      if(m.tempo==="h24") return m; // esplicitamente esclusi
      const nuovoColore = colByTime(m.inizio);
      if(m.coloreCustom===null && m.colore===nuovoColore) return m; // già a posto
      modelliDaSalvare.push({ ...m, colore:nuovoColore, coloreCustom:null });
      return { ...m, colore:nuovoColore, coloreCustom:null };
    });
    setModelli(aggiornatiRicolorati);
    if(modelliDaSalvare.length>0) saveToLocalStorage(store.events, store.calendars, aggiornatiRicolorati, calId);
    const ts = new Date().toISOString();
    await scriviBatchConBackup({
      ops: modelliDaSalvare.map(m=>({
        tipo: "update", table: "modelli",
        payload: { colore: m.colore, colore_custom: null },
        matchObj: { id: m.id, user_id: userId },
        contesto: "Ricolorazione modelli per fascia oraria (una tantum)",
      })),
      contesto: "Ricolorazione modelli per fascia oraria (una tantum)", ts, opzioni: { soloLog: true },
    });
    // Gli eventi già inseriti seguono il nuovo colore del modello.
    const mappaColori = {};
    modelliDaSalvare.forEach(m=>{ mappaColori[m.id] = m.colore; });
    await propagaColoreModelliAgliEventi(mappaColori);
    return { totale: modelliDaSalvare.length };
  }


  // ── FIX: quando un modello riceve un coloreCustom, quel colore viene
  // salvato subito nella tabella "colori" (se non già presente), così
  // compare istantaneamente nella tab Modelli -> Colori senza dover
  // ricaricare l'app, e può essere associato ad altri modelli da lì.
  // Nome di partenza di un gruppo-colore nuovo: quello della fascia che ha
  // questo colore (o H24). Serve SOLO al momento della registrazione: dopo,
  // il nome vive in Colori ed e' indipendente dalle fasce.
  function nomePredefinitoColore(hex){
    if(!hex) return null;
    const fascia = (store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT).find(f=>stessoHexColore(f.color,hex));
    if(fascia) return fascia.label||null;
    if(stessoHexColore(hex,COLORE_H24)) return "H24";
    return null;
  }
  async function ensureColoreRegistrato(hex, label=null){
    if(!userId || !hex) return;
    if(coloriExtra.some(c=>stessoHexColore(c.hex,hex))) return;
    // 1) SUBITO in locale: visibile in Modelli -> Colori all'istante.
    setColoriExtra(prev=>prev.some(c=>stessoHexColore(c.hex,hex))?prev:[...prev, {hex, label:label||null, sortOrder:prev.length}]);
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    scriviConBackup({
      tipo:"insert", table:"colori", payload: label ? { user_id:userId, hex, label } : { user_id:userId, hex }, matchObj:null,
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
    // LOCALE PER PRIMO: il suggerimento compare subito; l'invio a Supabase è in coda
    // (un valore già presente su Supabase è trattato come fatto, vedi svuotamento coda).
    setAutocompleteValori(prev=>({
      ...prev,
      [campo]: (prev[campo]||[]).includes(v) ? (prev[campo]||[]) : [...(prev[campo]||[]), v].sort((a,b)=>a.localeCompare(b)),
    }));
    accodaScritturaRemota({
      tipo:"insert", table:"autocomplete_valori",
      payload:{ user_id:userId, campo, valore:v },
      contesto:`Registrazione valore autocomplete (${campo})`,
    });
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
      const esito = await saveModelloInterno(data);
      segnalaModificaOrdineModelli();
      return esito;
    }catch(e){
      segnalaErrore(e, "Salvataggio modello (errore imprevisto)");
      return { ok:false, errore:{message:e?.message||String(e)} };
    }
  }
  async function saveModelloInterno(data){
    if(!userId) return;
    const coloreEff=data.coloreCustom||(data.tempo==="h24"?"#64748b":colByTime(data.inizio));
    // Se il form non porta un calendarId, si conserva quello già salvato sul
    // modello (prima si ripiegava sul calendario aperto o su quello principale,
    // spostando di fatto il modello senza che l'utente lo volesse).
    const calEsistente = data.id ? (modelli.find(m=>m.id===data.id)?.calendarId||null) : null;
    const targetCalId = data.calendarId||calEsistente||calId||mainCalId;
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
      colore:coloreEff, colore_custom:coloreEff, // colore sempre esplicito
      calendar_id: targetCalId,
      categoria: (data.categoria==="primo"||data.categoria==="secondo") ? data.categoria : null,
      categoria_app_auto: (data.categoriaAppAuto==="app"||data.categoriaAppAuto==="auto") ? data.categoriaAppAuto : null,
      categoria_turno_vuoto: !!data.turnoVuoto,
      categoria_app_auto_vuoto: !!data.appAutoVuoto,
      // Calendari aggiuntivi dove il modello è visibile in sola lettura
      // (pulsante "Visualizza"): unica fonte di verità, stesso colore/nome
      // ovunque, a differenza di "Copia" che duplica fisicamente il modello.
      visibile_anche_in: (data.visibileAncheIn && data.visibileAncheIn.length>0) ? data.visibileAncheIn : null,
    };
    ensureColoreRegistrato(coloreEff, nomePredefinitoColore(coloreEff)); // il gruppo-colore entra in Colori col nome della fascia; poi e' indipendente
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
      let modelliAggiornati = modelli.map(m=>{
        if(m.id!==data.id) return m;
        const nuovo = {...m,...datiUpdatePuliti,colore:coloreEff,coloreCustom:coloreEff,calendarId:targetCalId};
        modelloAggiornato = nuovo;
        return nuovo;
      });
      // Posizioni: solo se cambia ciò che definisce l'ordine (B = orario di inizio/tipo, A = nome/tipo, o il calendario).
      // Nessun legame con colori, fasce o Impostazioni: il modello resta dov'è, a meno che non cambi il suo posto.
      const modelloPrimaModifica = modelli.find(m=>m.id===data.id);
      if(modelloPrimaModifica){
        const cambioCal = (modelloPrimaModifica.calendarId||mainCalId)!==targetCalId;
        const cambioB = cambioCal || modelloPrimaModifica.inizio!==modelloAggiornato.inizio || modelloPrimaModifica.tempo!==modelloAggiornato.tempo;
        const cambioA = cambioCal || modelloPrimaModifica.titolo!==modelloAggiornato.titolo || modelloPrimaModifica.tempo!==modelloAggiornato.tempo;
        const lettera = ordineAttivo(), altra = lettera==="A" ? "B" : "A";
        const passi = lettera==="B"
          ? [[cambioB,"B",false],[cambioA,"A",true]]
          : [[cambioA,"A",false],[cambioB,"B",true]];
        const calendarsOrdinati = nuovoStore.calendars.map(c=>c.id);
        passi.forEach(([serve,let_,altro])=>{
          if(!serve) return;
          const corrente = modelliAggiornati.find(m=>m.id===data.id);
          modelliAggiornati = posizionaInOrdine(modelliAggiornati, corrente, targetCalId, calendarsOrdinati, mainCalId, let_, altro);
          const campoG = let_==="A" ? "gruppoA" : "gruppoB";
          const gNuovo = gruppoPerRegola(modelliAggiornati.find(m=>m.id===data.id), let_, targetCalId);
          modelliAggiornati = modelliAggiornati.map(m=> m.id===data.id ? { ...m, [campoG]: gNuovo } : m);
          modelloAggiornato = modelliAggiornati.find(m=>m.id===data.id) || modelloAggiornato;
        });
      }
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
        // Posizioni cambiate (solo le colonne diverse, una sola richiesta)
        try{ await salvaModificheModelliEGruppi(modelli, modelliAggiornati, "Salvataggio posizioni modello"); }catch(e){ segnalaErroreSoloLog(e?.message||String(e), "Salvataggio posizioni modello"); }
      })();
      return { ok:true, modello: modelloAggiornato };
    } else {
      // INSERT: il calcolo del posizionamento usa solo dati gia' in memoria
      // (modelli, calcolaOrdineModelli) -- non serve aspettare Supabase per
      // deciderlo. L'id e' generato qui, subito, come per gli eventi.
      const idLocale = generaIdLocale();
      // Il nuovo modello entra in ENTRAMBI gli ordini, mai in fondo: A = dopo l'ultimo con lo stesso nome (o nel punto
      // alfabetico), B = dopo l'ultimo con lo stesso orario di inizio (o fra gli orari vicini). Nessun legame con
      // colori, fasce o Impostazioni. Il calcolo usa solo dati in memoria (nessuna attesa di Supabase).
      const postoA = postoNuovoModelloA(modelli, { id:idLocale, inizio:data.inizio }, targetCalId);
      const modelloCreato = {...(({silenzioso,...rest})=>rest)(data),id:idLocale,colore:coloreEff,coloreCustom:coloreEff,sortOrder:0,sortOrderAltro:0,calendarId:targetCalId,
        gruppoA:postoA ? postoA.gruppoId : gruppoPerRegola(data,"A",targetCalId), gruppoB:gruppoPerRegola(data,"B",targetCalId)};
      const calendarsOrdinati = store.calendars.map(c=>c.id);
      const letteraAttiva = ordineAttivo(), letteraAltra = letteraAttiva==="A" ? "B" : "A";
      let modelliAggiornati = [...modelli, modelloCreato];
      modelliAggiornati = posizionaInOrdine(modelliAggiornati, modelloCreato, targetCalId, calendarsOrdinati, mainCalId, letteraAttiva, false, (letteraAttiva==="A" && postoA) ? postoA.indice : null);
      modelliAggiornati = posizionaInOrdine(modelliAggiornati, modelliAggiornati.find(m=>m.id===idLocale), targetCalId, calendarsOrdinati, mainCalId, letteraAltra, true, (letteraAltra==="A" && postoA) ? postoA.indice : null);
      const creatoFinale = modelliAggiornati.find(m=>m.id===idLocale) || modelloCreato;
      setModelli(modelliAggiornati);
      // FIX: a differenza del ramo UPDATE, qui la cache locale non veniva
      // mai riscritta con il nuovo modello. Risultato: il modello compariva
      // subito in UI (setModelli) e veniva salvato su Supabase, ma al
      // refresh l'app ripartiva da loadFromLocalStorage() leggendo ancora
      // la vecchia cache_modelli senza il nuovo modello, facendolo
      // "sparire" finché Supabase non rispondeva (o restava invisibile se
      // nel frattempo la risposta Supabase veniva considerata "uguale" alla
      // cache). Ora la cache viene aggiornata subito, come per l'update.
      saveToLocalStorage(store.events, store.calendars, modelliAggiornati, calId);

      // Backup su Supabase + eventuali rinumerazioni: estratto in una
      // funzione a parte perché, a differenza di prima, non SEMPRE deve
      // partire "fire and forget" in background.
      async function backupInsertModello(){
        const risInsert = await scriviConBackup({
          tipo:"insert", table:"modelli", payload:{...payload, id:idLocale, ...colonnePosizione(creatoFinale), gruppo_a:creatoFinale.gruppoA||null, gruppo_b:creatoFinale.gruppoB||null}, matchObj:null,
          contesto:"Creazione modello", ts,
          eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelliAggiornati,
          opzioni:{soloLog:true},
        });
        // Rinumerazioni: stesso timestamp, così restano in ordine in coda
        // rispetto all'insert del nuovo modello se si finisce offline.
        // Fonte dati: il diff di sortOrder tra lo stato prima dell'insert
        // ("modelli") e dopo ricalcolaPosizioniGlobali ("modelliAggiornati")
        // — stesso principio già usato in salvaModifichePosizioni per
        // drag&drop e frecce. Si esclude il modello appena creato
        // (idLocale), che ha già il proprio insert sopra: qui vanno solo le
        // rinumerazioni degli ALTRI modelli del blocco.
        const prevById = new Map(modelli.map(m=>[m.id,m]));
        const rinumerazioniApplicate = modelliAggiornati
          .filter(m=>m.id!==idLocale)
          .filter(m=>{
            const prima = prevById.get(m.id);
            return prima && (prima.sortOrder!==m.sortOrder || (prima.sortOrderAltro||0)!==(m.sortOrderAltro||0));
          })
          .map(m=>({id:m.id, pos:payloadPosCambiate(prevById.get(m.id), m)}))
          .filter(x=>Object.keys(x.pos).length>0);
        await scriviBatchConBackup({
          ops: rinumerazioniApplicate.map(({id,pos})=>({
            tipo:"update", table:"modelli", payload:pos, matchObj:{id, user_id:userId},
            contesto:"Creazione modello — rinumerazione posizioni esistenti",
          })),
          contesto:"Creazione modello — rinumerazione posizioni esistenti", ts, opzioni:{soloLog:true},
        });
        return risInsert;
      }

      // Il modello locale (modelloCreato, con idLocale) è già pronto e
      // usabile subito da chi lo ha chiesto (form Modelli, o
      // trovaOCreaModelloProtrazione per gli eventi figli di protrazione):
      // si parte sempre in background senza bloccare l'utente, così tutto
      // funziona anche offline. Se il backup fallisce o è in coda,
      // processaCodaSync lo ritenterà in automatico appena torna la rete.
      if(data.attendiBackup){
        const risInsert = await backupInsertModello();
        if(risInsert?.errore){
          return { ok:false, errore: risInsert.errore, modello: null };
        }
        return { ok:true, modello: creatoFinale };
      }
      backupInsertModello();
      return { ok:true, modello: creatoFinale };
    }
  }

  async function deleteModello(id){
    try{
      const esito = await deleteModelloInterno(id);
      segnalaModificaOrdineModelli();
      return esito;
    }catch(e){
      segnalaErrore(e, "Eliminazione modello (errore imprevisto)");
      return { ok:false, errore:{message:e?.message||String(e)} };
    }
  }
  async function deleteModelloInterno(id){
    // 1) SUBITO in locale: rimozione + rinumerazione GLOBALE a blocchi
    // contigui, per chiudere il buco lasciato dal modello eliminato nel
    // suo blocco/calendario (gli altri calendari restano invariati).
    const modelloEliminato = modelli.find(m=>m.id===id);
    const calDelModello = modelloEliminato ? (modelloEliminato.calendarId||mainCalId) : null;
    // Calcolo SUBITO dai valori correnti (non dentro l'updater di React).
    const updatedSenza = modelli.filter(m=>m.id!==id);
    let modelliAggiornati;
    if(!calDelModello){ modelliAggiornati = updatedSenza; }
    else {
      const ordineCalendario = calcolaOrdineModelli(updatedSenza.filter(m=>(m.calendarId||mainCalId)===calDelModello));
      const calendarsOrdinati = store.calendars.map(c=>c.id);
      const ordiniPerCalendario = new Map([[calDelModello, ordineCalendario]]);
      modelliAggiornati = ricalcolaPosizioniGlobali(updatedSenza, calendarsOrdinati, ordiniPerCalendario, mainCalId);
    }
    setModelli(modelliAggiornati);
    saveToLocalStorage(store.events, store.calendars, modelliAggiornati, calId);
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

  // ── Riordino UNA TANTUM di TUTTI i calendari: dentro ogni calendario i
  // modelli vengono ora raggruppati per FASCIA ORARIA D'INIZIO (NOTTE 00:00,
  // MATTINA 06:00–11:45, POMERIGGIO 12:00–17:15, 3° TURNO 17:15–18:00, poi
  // tutti gli altri/H24 in coda), ordinati per orario crescente dentro
  // ciascun blocco — vedi calcolaOrdinePerFasciaOraria. I blocchi vengono
  // poi disposti a blocchi contigui globali, nell'ordine dei calendari in
  // Impostazioni, rinumerando tutto in sequenza pulita 1,2,3... senza buchi
  // né duplicati. Dopo averla lanciata una volta, ogni creazione/modifica/
  // eliminazione/spostamento futuro mantiene da solo l'ordine così ottenuto
  // (le operazioni successive usano calcolaOrdineModelli, non questa).
  async function ripulisciTutteLePosizioniModelli(){
    const calendarsOrdinati = store.calendars.map(c=>c.id);
    const ordiniPerCalendario = new Map();
    for(const cId of calendarsOrdinati){
      const delCalendario = calcolaOrdineRiordinoFasce(modelli.filter(m=>(m.calendarId||mainCalId)===cId));
      ordiniPerCalendario.set(cId, delCalendario);
    }
    const modelliRicalcolati = ricalcolaPosizioniGlobali(modelli, calendarsOrdinati, ordiniPerCalendario, mainCalId);
    setModelli(modelliRicalcolati);
    saveToLocalStorage(store.events, store.calendars, modelliRicalcolati);
    await salvaModifichePosizioni(modelli, modelliRicalcolati);
    return { ok:true, totaleModelli: modelliRicalcolati.length, totaleCalendari: calendarsOrdinati.length };
  }

  // Dopo "Svuota cache e ricarica tutto": riordino automatico una sola volta,
  // appena i modelli sono stati ricaricati dal server.
  useEffect(()=>{
    if(!riordinaDopoCache || loading || !modelli.length) return;
    setRiordinaDopoCache(false);
    try{ localStorage.removeItem("turnipm_riordina_dopo_cache"); }catch(e){}
    ripulisciTutteLePosizioniModelli().catch(e=>segnalaErrore(e, "Riordino automatico dopo svuota cache"));
  }, [riordinaDopoCache, loading, modelli]);

  // Una tantum per sessione, a dati del server caricati: i colori in uso che
  // coincidono con una fascia (o H24) ma non hanno ancora un gruppo registrato
  // in Colori vengono registrati col nome della fascia. Da quel momento il
  // gruppo e' indipendente dalle Impostazioni.
  // ══════════════════════════════════════════════════════════════════════
  // SALVATAGGIO AUTOMATICO DELLA DISPOSIZIONE (storico ultime 20 versioni)
  // ══════════════════════════════════════════════════════════════════════
  // Copia SEPARATA da "Salva disposizione" (che resta manuale e non viene mai
  // toccata). Salva colore/ordine/calendario di ogni modello, fasce e gruppi
  // colore con i loro nomi, ~10 secondi dopo ogni cambio. Ogni versione resta
  // nello storico (tabella disposizione_auto), cosi' anche se uno stato
  // sbagliato viene salvato, quelle precedenti restano disponibili per
  // Normalizza e Ripristina.
  const MAX_VERSIONI_AUTO = 20;
  const [versioniAutomatiche, setVersioniAutomatiche] = useState([]);
  const [sorgenteDisposizione, setSorgenteDisposizione] = useState("manuale");
  const ultimaAutoRef = useRef({ firma:null, n:0, pronto:false });
  const timerAutoRef = useRef(null);

  function firmaStabile(v){
    if(Array.isArray(v)) return "["+v.map(firmaStabile).join(",")+"]";
    if(v && typeof v==="object") return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+firmaStabile(v[k])).join(",")+"}";
    return JSON.stringify(v===undefined?null:v);
  }
  function firmaDisposizione(d){
    const voci = (d.voci||[]).map(v=>[String(v.modello_id), v.sort_order||0, v.sort_order_a||0, v.colore||null, v.colore_custom||null, v.calendar_id||null])
      .sort((a,b)=>a[0].localeCompare(b[0]));
    const extra = (d.coloriExtra||[]).map(c=>[String(c.hex).toLowerCase(), c.label||null]).sort((a,b)=>a[0].localeCompare(b[0]));
    return firmaStabile({ voci, fasce:d.fasce||[], extra });
  }
  function costruisciDisposizioneCorrente(){
    return {
      voci: modelli.filter(Boolean).map(m=>({
        modello_id:m.id, titolo:m.titolo||"", calendar_id:m.calendarId||null, ...colonnePosizione(m),
        colore:m.colore||null, colore_custom:m.coloreCustom||null,
      })),
      fasce: (store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT).map(f=>({...f})),
      coloriExtra: (coloriExtra||[]).map(c=>({hex:c.hex, label:c.label||null, sortOrder:c.sortOrder||0})),
    };
  }
  async function salvaVersioneAutomatica(){
    if(!userId) return;
    const d = costruisciDisposizioneCorrente();
    if(d.voci.length===0) return;
    const firma = firmaDisposizione(d);
    const u = ultimaAutoRef.current;
    if(firma===u.firma) return; // nessun cambiamento rispetto all'ultima versione
    // Guardia: un calo improvviso dei modelli e' quasi sempre dato parziale, non si salva.
    if(u.n>=5 && d.voci.length < u.n*0.7){
      segnalaErroreSoloLog(`Salvataggio automatico saltato: modelli scesi da ${u.n} a ${d.voci.length}`, "Salvataggio automatico disposizione");
      return;
    }
    try{
      const { error } = await supabase.from("disposizione_auto").insert({ user_id:userId, n_modelli:d.voci.length, dati:d });
      if(error){ segnalaErroreSoloLog(error, "Salvataggio automatico disposizione"); return; }
      ultimaAutoRef.current = { firma, n:d.voci.length, pronto:true };
      // Potatura: si tengono solo le ultime MAX_VERSIONI_AUTO versioni.
      const { data: vecchie } = await supabase.from("disposizione_auto").select("id")
        .eq("user_id",userId).order("salvato_il",{ascending:false}).range(MAX_VERSIONI_AUTO, MAX_VERSIONI_AUTO+200);
      if(vecchie && vecchie.length>0){
        await supabase.from("disposizione_auto").delete().eq("user_id",userId).in("id", vecchie.map(r=>r.id));
      }
    }catch(e){ segnalaErroreSoloLog(e?.message||String(e), "Salvataggio automatico disposizione"); }
  }
  async function aggiornaVersioniAutomatiche(){
    if(!userId) return [];
    try{
      const { data, error } = await supabase.from("disposizione_auto").select("id,salvato_il,n_modelli")
        .eq("user_id",userId).order("salvato_il",{ascending:false}).limit(MAX_VERSIONI_AUTO);
      if(error){ segnalaErroreSoloLog(error, "Elenco versioni automatiche"); return []; }
      setVersioniAutomatiche(data||[]);
      return data||[];
    }catch(e){ segnalaErroreSoloLog(e?.message||String(e), "Elenco versioni automatiche"); return []; }
  }
  // Ritorna una disposizione {voci,fasce,coloriExtra,salvato_il} pronta per
  // Normalizza / Ripristina, oppure null se non trovata.
  async function caricaVersioneAutomatica(id){
    if(!userId || !id) return null;
    try{
      const { data, error } = await supabase.from("disposizione_auto").select("id,salvato_il,dati")
        .eq("user_id",userId).eq("id",id).maybeSingle();
      if(error || !data || !data.dati) return null;
      return { ...data.dati, salvato_il:data.salvato_il };
    }catch{ return null; }
  }
  useEffect(()=>{
    if(loading || !userId || !isInitialized.current || modelli.length===0) return;
    if(timerAutoRef.current) clearTimeout(timerAutoRef.current);
    timerAutoRef.current = setTimeout(async()=>{
      if(!ultimaAutoRef.current.pronto){
        // Prima volta nella sessione: si legge l'ultima versione per confrontarsi.
        try{
          const { data, error } = await supabase.from("disposizione_auto").select("n_modelli,dati")
            .eq("user_id",userId).order("salvato_il",{ascending:false}).limit(1);
          if(error){ segnalaErroreSoloLog(error, "Salvataggio automatico disposizione (lettura ultima versione)"); return; }
          ultimaAutoRef.current = data && data[0]
            ? { firma:firmaDisposizione(data[0].dati||{}), n:data[0].n_modelli||0, pronto:true }
            : { firma:null, n:0, pronto:true };
        }catch{ return; }
      }
      salvaVersioneAutomatica();
    }, 10000);
    return ()=>{ if(timerAutoRef.current) clearTimeout(timerAutoRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelli, coloriExtra, store.fasceAutomatiche, loading, userId]);

  const nomiGruppiMigrati = useRef(false);
  useEffect(()=>{
    if(loading || !userId || !isInitialized.current || nomiGruppiMigrati.current || modelli.length===0) return;
    nomiGruppiMigrati.current = true;
    const visti = new Set((coloriExtra||[]).map(c=>String(c.hex).toLowerCase()));
    modelli.forEach(m=>{
      const h = m?.coloreCustom||m?.colore;
      if(!h) return;
      const k = String(h).toLowerCase();
      if(visti.has(k)) return;
      visti.add(k);
      const nome = nomePredefinitoColore(h);
      if(nome) ensureColoreRegistrato(h, nome);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId, modelli, coloriExtra]);

  // ══════════════════════════════════════════════════════════════════════
  // NORMALIZZAZIONE COLORI "CONGELATI" (drift fascia oraria / coloreCustom)
  // ══════════════════════════════════════════════════════════════════════
  // Un modello poteva, in passato, scegliere come coloreCustom proprio il
  // colore allora in uso da una fascia automatica (es. cliccando la pillola
  // "3° TURNO" nella palette). Se in seguito quella fascia viene ricolorata
  // da Impostazioni, il coloreCustom del modello NON si aggiorna da solo
  // (è un valore indipendente, per design): resta congelato al vecchio hex,
  // mostrando una sfumatura diversa da tutti gli altri modelli della stessa
  // fascia pur dovendo apparire identico. Da quando sceltaColore() salva
  // coloreCustom:null per i click futuri su una pillola-fascia (vedi
  // ModelForm in 04-Rotazione.jsx), il problema non si crea più per le
  // nuove scelte; questa funzione ripara una tantum i modelli già congelati
  // prima di quella correzione.
  //
  // Un colore è considerato "orfano" (candidato alla normalizzazione) se:
  //  - non coincide con l'hex di NESSUNA fascia automatica attuale né con H24
  //    (altrimenti sceltaColore lo avrebbe già salvato come null)
  //  - non ha un nome proprio assegnato nella schermata Colori (coloriExtra
  //    con label non vuota): un colore rinominato è quasi certamente una
  //    scelta consapevole dell'utente, non un residuo dimenticato
  //  - il modello ha un orario (o è H24) che permette comunque di calcolare
  //    una fascia valida da assegnargli al posto del colore orfano
  // Ritorna un riepilogo SENZA applicare nulla: la conferma e l'esecuzione
  // vera sono un secondo passo esplicito (applicaNormalizzazioneColori),
  // così l'utente vede sempre cosa sta per cambiare prima che avvenga.
  // Legge (in modo sincrono) i colori dei modelli dall'ultimo "Salva" fatto
  // dall'utente. Ritorna una Map modello_id -> voce, oppure null se lo
  // snapshot non esiste o è vecchio (senza colori).
  function leggiSnapshotColoriLocale(){
    const raw = leggiSnapshotLocaleCompleto();
    if(!raw) return null;
    const mappa = new Map();
    raw.voci.forEach(v=>{ if(v && "colore" in v) mappa.set(v.modello_id, v); });
    return mappa.size>0 ? mappa : null;
  }
  function leggiSnapshotLocaleCompleto(){
    try{
      const raw = localStorage.getItem("disposizioneModelliBackup");
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(parsed?.userId!==userId || !Array.isArray(parsed.voci)) return null;
      return parsed;
    }catch{ return null; }
  }

  // NORMALIZZA: riporta COLORI e GRUPPI a come erano nell'ultimo "Salva
  // disposizione". Ogni modello riprende il colore salvato (quindi rientra nel
  // suo gruppo), le fasce orarie riadottano il colore salvato e i gruppi
  // ritrovano il nome salvato. Non tocca ordine, orari, titoli.
  // "sorgente" opzionale: una disposizione {voci,fasce,coloriExtra} (es. una
  // versione automatica); senza, si usa l'ultima disposizione salvata a mano.
  function analizzaColoriDaNormalizzare(sorgente=null){
    const snapRaw = sorgente || leggiSnapshotLocaleCompleto();
    const snap = (()=>{
      if(!snapRaw || !Array.isArray(snapRaw.voci)) return null;
      const mappa = new Map();
      snapRaw.voci.forEach(v=>{ if(v && "colore" in v) mappa.set(v.modello_id, v); });
      return mappa.size>0 ? mappa : null;
    })();
    if(!snapRaw || !snap){
      const soloEv = calcolaAllineamentoColori({ events:store.events, modelli, mainCalId, coloreDelModello:m => m.coloreCustom||m.colore||(m.tempo==="h24"?COLORE_H24:colByTime(m.inizio)) });
      return { totale:soloEv.totale, modelli:[], fasce:[], eventi:soloEv.eventi, perModelloEventi:soloEv.perModello, collegati:soloEv.collegati, nessunaDisposizione:soloEv.totale===0 };
    }
    const fasceAttuali = store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT;
    const candidati = [];
    modelli.forEach(m=>{
      if(!m) return;
      const v = snap.get(m.id);
      if(!v) return;
      const target = v.colore_custom || v.colore;
      if(!target) return;
      if(!stessoHexColore(m.coloreCustom||m.colore, target)){
        candidati.push({ id:m.id, titolo:m.titolo, coloreVecchio:m.coloreCustom||m.colore, coloreNuovo:target });
      }
    });
    const fasceDaRipristinare = [];
    (Array.isArray(snapRaw.fasce)?snapRaw.fasce:[]).forEach(sf=>{
      const cur = fasceAttuali.find(f=>f.key===sf.key);
      if(cur && sf.color && !stessoHexColore(cur.color, sf.color)){
        fasceDaRipristinare.push({ key:cur.key, label:cur.label, coloreVecchio:cur.color, coloreNuovo:sf.color });
      }
    });
    // Eventi gia' in calendario: devono avere il colore del loro modello (come sara' dopo la normalizzazione).
    const nuoviCol = new Map(candidati.map(c=>[c.id, c.coloreNuovo]));
    const modelliFuturi = modelli.map(m=>(m && nuoviCol.has(m.id)) ? {...m, coloreCustom:nuoviCol.get(m.id), colore:nuoviCol.get(m.id)} : m);
    const ev = calcolaAllineamentoColori({ events:store.events, modelli:modelliFuturi, mainCalId, coloreDelModello:m => m.coloreCustom||m.colore||(m.tempo==="h24"?COLORE_H24:colByTime(m.inizio)) });
    return { totale: candidati.length + fasceDaRipristinare.length + ev.totale, modelli:candidati, fasce:fasceDaRipristinare, eventi:ev.eventi, perModelloEventi:ev.perModello, collegati:ev.collegati };
  }

  async function applicaNormalizzazioneColori(sorgente=null){
    const analisi = analizzaColoriDaNormalizzare(sorgente);
    const candidati = analisi.modelli;
    const fasceR = analisi.fasce;
    if(analisi.totale===0) return { ok:true, totale:0, totaleFasce:0 };
    const snapRaw = sorgente || leggiSnapshotLocaleCompleto();
    const perId = new Map(candidati.map(c=>[c.id, c]));
    const modelliAggiornati = modelli.map(m=>{
      const c = perId.get(m?.id);
      return c ? {...m, coloreCustom:c.coloreNuovo, colore:c.coloreNuovo} : m;
    });
    setModelli(modelliAggiornati);

    // Fasce: adottano il colore salvato.
    if(fasceR.length>0){
      const nuoveFasce = (store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT).map(f=>{
        const r = fasceR.find(x=>x.key===f.key);
        return r ? {...f, color:r.coloreNuovo} : f;
      });
      setStore(s=>({...s, fasceAutomatiche:nuoveFasce}));
      await saveSettings({fasce_automatiche:nuoveFasce});
    }

    // Nomi dei gruppi: dallo snapshot (colori extra) oppure dal nome della
    // fascia salvata con quel colore; registra i gruppi mancanti.
    const nomiSnap = new Map();
    (snapRaw?.coloriExtra||[]).forEach(c=>{ if(c?.hex && c.label) nomiSnap.set(String(c.hex).toLowerCase(), c.label); });
    (snapRaw?.fasce||[]).forEach(f=>{ if(f?.color && f.label && !nomiSnap.has(String(f.color).toLowerCase())) nomiSnap.set(String(f.color).toLowerCase(), f.label); });
    const coloriRipristinati = new Set([...candidati.map(c=>c.coloreNuovo), ...fasceR.map(f=>f.coloreNuovo)]);
    coloriRipristinati.forEach(hex=>{
      const nome = nomiSnap.get(String(hex).toLowerCase()) || nomePredefinitoColore(hex);
      const reg = coloriExtra.find(c=>stessoHexColore(c.hex,hex));
      if(!reg) ensureColoreRegistrato(hex, nome);
      else if(!reg.label && nome) updateColoreExtraLabel(reg.hex, nome);
    });

    // Eventi gia' in calendario (anche quelli scritti a mano): prendono il colore del loro modello.
    const eventiAggiornati = await applicaAllineamentoEventi(analisi.eventi);
    saveToLocalStorage(eventiAggiornati||store.events, store.calendars, modelliAggiornati);

    // Backup remoto: una scrittura alla volta, solo log (niente raffica di popup).
    const ts = new Date().toISOString();
    (async()=>{
      const risB = await scriviBatchConBackup({
        ops: candidati.map(c=>({
          tipo:"update", table:"modelli",
          payload:{ colore_custom:c.coloreNuovo, colore:c.coloreNuovo },
          matchObj:{id:c.id, user_id:userId},
          contesto:`Normalizzazione colore su modello "${c.titolo||c.id}"`,
        })),
        contesto:"Normalizzazione colore modelli", ts, opzioni:{ soloLog:true },
      });
      const errori = risB?.errori||0;
      if(errori>0) segnalaErroreSoloLog(`${errori} modelli non salvati su Supabase durante la normalizzazione`, "Normalizzazione colori");
      syncSeAttivo(eventiAggiornati||store.events, store.calendars, modelliAggiornati);
    })();
    return { ok:true, totale: candidati.length, totaleFasce: fasceR.length, totaleEventi: (analisi.eventi||[]).length };
  }

  // ══════════════════════════════════════════════════════════════════════
  // SNAPSHOT MANUALE DELL'ORDINE MODELLI (protezione dal bug di rimescolamento)
  // ══════════════════════════════════════════════════════════════════════
  // Tabella dedicata e completamente isolata da "modelli": salvataggio SOLO
  // su azione esplicita della persona, mai automatico. Un upsert per riga
  // (vincolo unique su user_id+modello_id) così ogni "Salva disposizione"
  // sovrascrive pulito il backup precedente, senza accumulare storico.
  // ── Invio del Log a Supabase (tabella log_attivita) ──────────────────
  // Parte da solo, qualche secondo dopo ogni nuova voce o spunta. Se la tabella
  // non esiste ancora o manca la rete, riprova più tardi (senza disturbare).
  useEffect(()=>{
    if(!userId) return;
    let timer = null, inCorso = false, attesa = 0;
    async function invia(){
      if(inCorso) return;
      inCorso = true;
      try{
        for(let giro=0; giro<20; giro++){
          const daInviare = leggiLogDaSincronizzare(100);
          if(daInviare.length===0){ attesa = 0; break; }
          const righe = daInviare.map(v=>voceLogPerSupabase(v, userId));
          const { error } = await supabase.from("log_attivita").upsert(righe, { onConflict:"id" });
          if(error){
            console.warn("Log non inviato a Supabase:", error.message);
            attesa = Math.min((attesa||15000)*2, 300000);
            timer = setTimeout(invia, attesa);
            break;
          }
          segnaLogSincronizzato(daInviare.map(v=>({ id:v.id, rev:v._rev||0 })));
        }
      }catch(e){
        console.warn("Invio log fallito:", e);
        attesa = Math.min((attesa||15000)*2, 300000);
        timer = setTimeout(invia, attesa);
      }finally{ inCorso = false; }
    }
    const pianifica = ()=>{ if(timer) clearTimeout(timer); timer = setTimeout(invia, 2500); };
    registraListenerLogSync(pianifica);
    window.addEventListener("online", pianifica);
    pianifica();
    return ()=>{
      registraListenerLogSync(null);
      window.removeEventListener("online", pianifica);
      if(timer) clearTimeout(timer);
    };
  }, [userId]);

  async function salvaDisposizioneModelli(){
    if(!userId) return { ok:false, errore:"Utente non autenticato" };
    const adesso = new Date().toISOString();
    // Snapshot a 360 gradi di ogni modello (ordine, colori, nome, titolo, orari, calendario, etc.).
    const righe = modelli.map(m=>({
      user_id:userId, modello_id:m.id, ...colonnePosizione(m),
      colore:m.colore||null, colore_custom:m.coloreCustom||null,
      titolo:m.titolo||"", label:m.label||"", inizio:m.inizio||null, fine:m.fine||null, tempo:m.tempo||"custom",
      calendar_id:m.calendarId||null,
      gruppo_a:m.gruppoA||null, gruppo_b:m.gruppoB||null,
      salvato_il:adesso
    }));
    // Menu (gruppi a tendina): nome, ordine A/B, calendario e POSIZIONE di ogni menu.
    const gruppiSnap = (gruppi||[]).map(g=>({ id:g.id, calendar_id:g.calendarId||null, ordine:g.ordine, nome:g.nome||"", sort_order:g.sortOrder||0 }));
    // Fasce automatiche, colori extra, sundayColor e holidayColor
    const fasce = (store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT).map(f=>({...f}));
    const coloriExtraSnap = (coloriExtra||[]).map(c=>({...c}));
    const sundayCol = store.sundayColor || "";
    const holidayCol = store.holidayColor || "";

    // Ultimo salvataggio fatto (in locale): serve a capire cosa è DAVVERO cambiato.
    let prec = null;
    try{
      const raw = localStorage.getItem("disposizioneModelliBackup");
      if(raw){ const p = JSON.parse(raw); if(p?.userId===userId && Array.isArray(p.voci)) prec = p; }
    }catch{}
    const cambi = diffDisposizione(prec, righe, fasce, coloriExtraSnap, sundayCol, holidayCol, gruppiSnap);
    const daRiprovare = !!prec && prec.supabaseOk===false; // l'ultimo invio a Supabase non era andato a buon fine

    if(cambi.nessunaModifica && !daRiprovare){
      registraAttivita("Salva disposizione modelli", "Nessuna modifica rispetto all'ultimo salvataggio", { chiave:"salva-disp-nessuna", supabase:"n/a" });
      annullaTimerSalvaDisposizione();
      return { ok:true, nessunaModifica:true, totale:0, riepilogo:"nessuna modifica" };
    }

    const tutte = !prec || daRiprovare;
    const riepilogo = tutte
      ? (prec ? `riprovo l'invio completo (${righe.length} modelli)` : `prima copia completa (${righe.length} modelli)`)
      : cambi.riepilogo;

    // 1) PRIMA IN LOCALE
    const snapshot = {
      userId, salvato_il:adesso, supabaseOk:false,
      voci: modelli.map(m=>({
        ...m, modello_id:m.id, ...colonnePosizione(m),
        colore:m.colore||null, colore_custom:m.coloreCustom||null
      })),
      fasce, coloriExtra: coloriExtraSnap, sundayColor: sundayCol, holidayColor: holidayCol,
      gruppi: gruppiSnap
    };
    try{ localStorage.setItem("disposizioneModelliBackup", JSON.stringify(snapshot)); }catch{}
    const idVoce = registraAttivita("Salva disposizione modelli", `Salvata disposizione: ${riepilogo}`, {
      chiave:`salva-disp|${adesso}`, dettagli: cambi.dettagli, esito:"attesa",
    });

    // 2) POI SU SUPABASE, in coda (con retry automatico): solo le righe cambiate
    //    (tutte alla prima copia o se l'invio precedente era fallito).
    const righeDaInviare = tutte ? righe : righe.filter(r=>cambi.idsCambiati.has(String(r.modello_id)));
    const ops = [];
    for(let k=0; k<righeDaInviare.length; k+=100){
      ops.push({ tipo:"upsert", table:"modelli_sortorder_backup", payload:righeDaInviare.slice(k,k+100),
        onConflict:"user_id,modello_id", contesto:"Salva disposizione modelli" });
    }
    if(tutte || cambi.impostazioniCambiate || cambi.gruppiCambiati){
      ops.push({ tipo:"upsert", table:"impostazioni_backup",
        payload:{ user_id:userId, fasce_automatiche:fasce, colori_extra:coloriExtraSnap, sunday_color:sundayCol, holiday_color:holidayCol, gruppi_modelli:gruppiSnap, salvato_il:adesso },
        onConflict:"user_id", contesto:"Salva disposizione modelli" });
    }
    if(ops.length===0){
      // niente da inviare (es. solo modelli non più presenti): la copia locale è già completa
      try{ localStorage.setItem("disposizioneModelliBackup", JSON.stringify({ ...snapshot, supabaseOk:true })); }catch{}
      aggiornaEsitoVoceLog(idVoce, "ok");
    } else {
      // L'ultima operazione, quando va a buon fine, completa la spunta ☁️ del Log
      // e segna la copia locale come "inviata".
      ops[ops.length-1].voceLogId = idVoce;
      ops[ops.length-1].marcaSnapshotOk = true;
      accodaScrittureRemote(ops);
      aggiornaEsitoVoceLog(idVoce, (typeof navigator!=="undefined" && navigator.onLine===false) ? "coda" : "attesa");
    }
    annullaTimerSalvaDisposizione();
    return { ok:true, totale: righeDaInviare.length, riepilogo };
  }

  async function ripristinaDisposizioneModelli(sorgente=null){
    if(!userId) return { ok:false, errore:"Utente non autenticato" };
    let vociBackup = null, fasceBackup = null, coloriExtraBackup = null, sundayColBackup = null, holidayColBackup = null, gruppiBackup = null;
    if(sorgente){
      gruppiBackup = Array.isArray(sorgente.gruppi) ? sorgente.gruppi : null;
      vociBackup = Array.isArray(sorgente.voci) ? sorgente.voci : null;
      fasceBackup = sorgente.fasce || null;
      coloriExtraBackup = sorgente.coloriExtra || null;
      sundayColBackup = sorgente.sundayColor || null;
      holidayColBackup = sorgente.holidayColor || null;
    }
    if(!sorgente) try{
      const { data, error } = await supabase.from("modelli_sortorder_backup")
        .select("*").eq("user_id", userId);
      if(error) throw error;
      if(data && data.length>0) vociBackup = data.map(r=>({
        ...r, modello_id:r.modello_id, sort_order:r.sort_order, colore:r.colore, colore_custom:r.colore_custom, calendarId:r.calendar_id
      }));
      const { data:imp } = await supabase.from("impostazioni_backup")
        .select("*").eq("user_id", userId).maybeSingle();
      if(imp){
        gruppiBackup = Array.isArray(imp.gruppi_modelli) ? imp.gruppi_modelli : null;
        fasceBackup = imp.fasce_automatiche||null;
        coloriExtraBackup = imp.colori_extra||null;
        sundayColBackup = imp.sunday_color||null;
        holidayColBackup = imp.holiday_color||null;
      }
    }catch(e){
      try{
        const raw = localStorage.getItem("disposizioneModelliBackup");
        if(raw){
          const parsed = JSON.parse(raw);
          if(parsed?.userId===userId && Array.isArray(parsed.voci)){
            vociBackup = parsed.voci;
            fasceBackup = parsed.fasce||null;
            coloriExtraBackup = parsed.coloriExtra||null;
            sundayColBackup = parsed.sundayColor||null;
            holidayColBackup = parsed.holidayColor||null;
            gruppiBackup = Array.isArray(parsed.gruppi) ? parsed.gruppi : null;
          }
        }
      }catch{}
    }
    if(!vociBackup || vociBackup.length===0){
      return { ok:false, errore:"Nessuna disposizione salvata trovata" };
    }
    const vociById = new Map(vociBackup.map(v=>[v.modello_id || v.id, v]));

    // 1) Fasce automatiche e Colori Domeniche/Festivi
    const patchStore = {};
    const patchSettings = {};
    if(Array.isArray(fasceBackup) && fasceBackup.length>0){
      patchStore.fasceAutomatiche = fasceBackup;
      patchSettings.fasce_automatiche = fasceBackup;
    }
    if(sundayColBackup){ patchStore.sundayColor = sundayColBackup; patchSettings.sunday_color = sundayColBackup; }
    if(holidayColBackup){ patchStore.holidayColor = holidayColBackup; patchSettings.holiday_color = holidayColBackup; }
    if(Object.keys(patchStore).length>0){
      setStore(s=>({...s, ...patchStore}));
      await saveSettings(patchSettings);
    }

    // 2) Colori extra
    if(Array.isArray(coloriExtraBackup)){
      for(const c of coloriExtraBackup){
        if(c?.hex) { try{ await ensureColoreRegistrato(c.hex, c.label||null); }catch{} }
      }
    }

    // 2b) Menu (gruppi a tendina): nomi e posizione come nella copia. Solo se la copia li contiene.
    //     I menu creati dopo la copia vengono tolti (i loro modelli tornano nel gruppo che avevano).
    let gruppiRipristinati = false;
    if(Array.isArray(gruppiBackup) && gruppiBackup.length>0){
      const opsG = [];
      const attuali = new Map((gruppi||[]).map(g=>[g.id,g]));
      const salvati = new Map(gruppiBackup.map(g=>[g.id,g]));
      gruppiBackup.forEach(g=>{
        const cur = attuali.get(g.id);
        if(!cur) opsG.push({ tipo:"insert", table:"gruppi_modelli", payload:{ id:g.id, user_id:userId, calendar_id:g.calendar_id||null, ordine:g.ordine, nome:g.nome, sort_order:g.sort_order||0 }, matchObj:null, contesto:"Ripristino menu" });
        else if(cur.nome!==g.nome || (cur.sortOrder||0)!==(g.sort_order||0)) opsG.push({ tipo:"update", table:"gruppi_modelli", payload:{ nome:g.nome, sort_order:g.sort_order||0 }, matchObj:{ id:g.id, user_id:userId }, contesto:"Ripristino menu" });
      });
      (gruppi||[]).forEach(g=>{ if(!salvati.has(g.id)) opsG.push({ tipo:"delete", table:"gruppi_modelli", payload:null, matchObj:{ id:g.id, user_id:userId }, contesto:"Ripristino menu" }); });
      setGruppi(gruppiBackup.map(g=>({ id:g.id, calendarId:g.calendar_id||null, ordine:g.ordine==="A"?"A":"B", nome:g.nome||"", sortOrder:g.sort_order||0 })));
      if(opsG.length>0) await scriviBatchConBackup({ ops:opsG, contesto:"Ripristino menu", ts:new Date().toISOString(), opzioni:{ soloLog:true } });
      gruppiRipristinati = true;
    }

    // 3) Modelli: ripristino 360 gradi (ordine, nomi, titoli, orari, colori)
    const prevModelli = modelliRef.current;
    const daRiscrivere = [];
    const modelliRicalcolati = prevModelli.map(m=>{
      const v = vociById.get(m.id);
      if(!v) return m;
      const nuovo = {...m};
      if(v.sort_order!==undefined){
        const attA = ordineAttivo()==="A";
        const vB = v.sort_order, vA = (v.sort_order_a!==undefined && v.sort_order_a!==null) ? v.sort_order_a : (attA ? m.sortOrder : m.sortOrderAltro);
        nuovo.sortOrder = attA ? vA : vB; nuovo.sortOrderAltro = attA ? vB : vA;
      }
      if(v.titolo) nuovo.titolo = v.titolo;
      if(v.label) nuovo.label = v.label;
      if(v.inizio!==undefined) nuovo.inizio = v.inizio;
      if(v.fine!==undefined) nuovo.fine = v.fine;
      if(v.tempo) nuovo.tempo = v.tempo;
      if(v.colore!==undefined && v.colore!==null) nuovo.colore = v.colore;
      if(v.colore_custom!==undefined) nuovo.coloreCustom = v.colore_custom||v.colore||m.coloreCustom||null;
      if(gruppiRipristinati){
        const ga = v.gruppo_a!==undefined ? v.gruppo_a : v.gruppoA;
        const gb = v.gruppo_b!==undefined ? v.gruppo_b : v.gruppoB;
        if(ga!==undefined) nuovo.gruppoA = ga||null;
        if(gb!==undefined) nuovo.gruppoB = gb||null;
      }
      const cambiato = ["sortOrder","sortOrderAltro","titolo","label","inizio","fine","tempo","colore","coloreCustom","gruppoA","gruppoB"]
        .some(k=>(nuovo[k]??null)!==(m[k]??null));
      if(!cambiato) return m;
      daRiscrivere.push(nuovo);
      return nuovo;
    });
    modelliRef.current = modelliRicalcolati;
    setModelli(modelliRicalcolati);
    saveToLocalStorage(store.events, store.calendars, modelliRicalcolati);
    await salvaModifichePosizioni(prevModelli, modelliRicalcolati);

    // 4) Backup su Supabase
    const ts = new Date().toISOString();
    const risB = await scriviBatchConBackup({
      ops: daRiscrivere.map(m=>({
        tipo:"update", table:"modelli",
        payload:{ colore:m.colore, colore_custom:m.coloreCustom||null, titolo:m.titolo, label:m.label, inizio:m.inizio, fine:m.fine, tempo:m.tempo, ...colonnePosizione(m),
          ...(gruppiRipristinati ? { gruppo_a:m.gruppoA||null, gruppo_b:m.gruppoB||null } : {}) },
        matchObj:{ id:m.id, user_id:userId },
        contesto:"Ripristino disposizione 360°",
      })),
      contesto:"Ripristino disposizione 360°", ts, opzioni:{soloLog:true},
    });
    if(risB?.errori>0) segnalaErroreSoloLog(`${risB.errori} modelli non confermati su Supabase durante il ripristino`, "Ripristino modelli");

    // 5) Allinea gli eventi già in calendario al colore effettivo del modello
    const mappaColori = {};
    daRiscrivere.forEach(m=>{ mappaColori[m.id] = m.coloreCustom || m.colore; });
    await propagaColoreModelliAgliEventi(mappaColori);

    annullaTimerSalvaDisposizione();
    return { ok:true, totale: vociBackup.length };
  }

  // ── Gestione del timer "modifiche non salvate": persistito su localStorage
  // (non solo stato React) così l'avviso sopravvive alla chiusura dell'app.
  function segnalaModificaOrdineModelli(){
    // Popup "Salvare questa disposizione?" rimosso: non parte nessun timer.
  }
  function annullaTimerSalvaDisposizione(){
    if(timerSalvaDisposizioneRef.current){ clearTimeout(timerSalvaDisposizioneRef.current); timerSalvaDisposizioneRef.current=null; }
    try{ localStorage.removeItem(ULTIMA_MODIFICA_MODELLI_KEY); }catch{}
    setShowSalvaDisposizionePopup(false);
  }
  // Al mount: se c'era una modifica pendente da prima che l'app si chiudesse
  // (schermo spento, app terminata), ripristina il timer residuo — se sono
  // già passati 30s o più, il popup esce subito; altrimenti riparte per il
  // tempo restante, cosi' la persona ha comunque la finestra di 30s intera
  // dal momento della modifica per salvare manualmente prima dell'avviso.
  useEffect(()=>{
    try{ localStorage.removeItem(ULTIMA_MODIFICA_MODELLI_KEY); }catch{}
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── COLORI: aggiunta/rimozione dalla sezione + assegnazione esclusiva ai modelli
  async function addColoreExtra(hex, label=null){
    if(!userId || coloriExtra.some(c=>c.hex===hex)) return;
    // 1) SUBITO in locale.
    setColoriExtra(prev=>[...prev, {hex, label, sortOrder:prev.length}]);
    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    scriviConBackup({
      tipo:"insert", table:"colori", payload: label ? { user_id: userId, hex, label } : { user_id: userId, hex }, matchObj:null,
      contesto:"Aggiunta colore", ts:new Date().toISOString(),
      eventsPerSheets: store.events, calendarsPerSheets: store.calendars, modelliPerSheets: modelli,
    });
  }

  async function removeColoreExtra(hex){
    if(!userId) return;
    // 1) SUBITO in locale.
    setColoriExtra(prev=>prev.filter(c=>c.hex!==hex));
    // I modelli con questo colore tornano al colore automatico per orario: UNA sola operazione a blocchi
    // (modelli + eventi + posizioni), al posto di un salvataggio completo per ogni modello.
    const daResettare = modelli.filter(m=>m?.coloreCustom===hex);
    if(daResettare.length>0){
      await assegnaColoreAModelli([], daResettare.map(m=>m.id), hex);
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
    const gia = coloriExtra.find(c=>stessoHexColore(c.hex,hex));
    if(!gia){
      // Colore usato dai modelli ma non ancora registrato: lo si registra col nome.
      setColoriExtra(prev=>[...prev, {hex, label, sortOrder:prev.length}]);
      if(!userId) return;
      scriviConBackup({
        tipo:"insert", table:"colori", payload:{ user_id:userId, hex, label }, matchObj:null,
        contesto:"Registrazione nome colore", ts:new Date().toISOString(),
        opzioni:{ soloLog:true },
      });
      return;
    }
    const hexReale = gia.hex;
    setColoriExtra(prev=>prev.map(c=>c.hex===hexReale?{...c,label}:c));
    if(!userId) return;
    scriviConBackup({
      tipo:"update", table:"colori", payload:{label}, matchObj:{user_id:userId, hex:hexReale},
      contesto:"Aggiornamento etichetta colore", ts:new Date().toISOString(),
      opzioni:{ soloLog:true },
    });
  }

  // ── FIX: sostituisce l'hex di un colore ovunque sia usato (modelli +
  // registro colori), permettendo di editare liberamente anche i colori
  // delle fasce automatiche (es. #F59E0B "mattina") con la palette
  // condivisa, invece di lasciarli fissi.
  // idsModelli (facoltativo): se presente cambia colore SOLO a quei modelli (es. quelli del
  // calendario aperto); gli altri modelli con lo stesso colore restano come sono.
  async function replaceColoreEverywhere(oldHex, newHex, nuovoNome=null, idsModelli=null){
    if(!userId || !newHex || !oldHex || stessoHexColore(oldHex,newHex)) return;
    segnalaModificaOrdineModelli(); // anche un cambio colore e' una modifica da salvare
    // Tutti i modelli del gruppo (stesso colore, confronto case-insensitive).
    const soloQuesti = Array.isArray(idsModelli) ? new Set(idsModelli) : null;
    const daAggiornare = modelli.filter(m=>m && stessoHexColore(m.coloreCustom||m.colore, oldHex) && (!soloQuesti || soloQuesti.has(m.id)));
    const idsDaAgg = new Set(daAggiornare.map(m=>m.id));
    // Cambio parziale: altri modelli (fuori selezione) usano ancora il vecchio colore.
    const parziale = !!soloQuesti && modelli.some(m=>m && !idsDaAgg.has(m.id) && stessoHexColore(m.coloreCustom||m.colore, oldHex));
    const modelliAggiornati = modelli.map(m=>idsDaAgg.has(m?.id) ? {...m, coloreCustom:newHex, colore:newHex} : m);
    setModelli(modelliAggiornati);

    // Registro colori (nome del gruppo): il gruppo vecchio confluisce nel
    // nuovo; se il nuovo esisteva gia' (unione di due gruppi) tiene il suo nome.
    const regVecchio = coloriExtra.find(c=>stessoHexColore(c.hex,oldHex));
    const regNuovo = coloriExtra.find(c=>stessoHexColore(c.hex,newHex));
    const nomeGruppo = parziale
      ? (nuovoNome || (regNuovo&&regNuovo.label) || nomePredefinitoColore(newHex) || null)
      : (nuovoNome || (regNuovo&&regNuovo.label) || (regVecchio&&regVecchio.label) || nomePredefinitoColore(oldHex) || null);
    const sortVecchio = regVecchio ? (regVecchio.sortOrder||0) : coloriExtra.length;
    setColoriExtra(prev=>{
      const senzaVecchio = parziale ? prev : prev.filter(c=>!stessoHexColore(c.hex,oldHex));
      if(senzaVecchio.some(c=>stessoHexColore(c.hex,newHex))) return senzaVecchio.map(c=>stessoHexColore(c.hex,newHex)?{...c,label:nomeGruppo}:c);
      return [...senzaVecchio, {hex:newHex, label:nomeGruppo, sortOrder:sortVecchio}];
    });

    // Cambio colore = cambio anche in Impostazioni: ogni fascia con il vecchio colore lo segue.
    const fasceAttuali = store.fasceAutomatiche||FASCE_AUTOMATICHE_DEFAULT;
    if(!parziale && fasceAttuali.some(f=>stessoHexColore(f.color,oldHex))){
      const me = fasceAttuali.map(f=>stessoHexColore(f.color,oldHex)?{...f,color:newHex}:f);
      setStore(s=>({...s, fasceAutomatiche:me}));
      saveSettings({fasce_automatiche:me});
    }
    if(!parziale && stessoHexColore(store.sundayColor, oldHex)){
      setStore(s=>({...s, sundayColor:newHex}));
      saveSettings({sunday_color:newHex});
    }
    if(!parziale && stessoHexColore(store.holidayColor, oldHex)){
      setStore(s=>({...s, holidayColor:newHex}));
      saveSettings({holiday_color:newHex});
    }

    // Eventi gia' in calendario dei modelli del gruppo.
    const mappaColori = {};
    daAggiornare.forEach(m=>{ mappaColori[m.id] = newHex; });
    const eventiAggiornati = await propagaColoreModelliAgliEventi(mappaColori);
    saveToLocalStorage(eventiAggiornati||store.events, store.calendars, modelliAggiornati);

    // Backup remoto: UNA scrittura alla volta e solo nel log (niente raffica
    // di scritture parallele + sync Sheets per ogni modello, che generava
    // decine di errori "controllo dopo il salvataggio").
    const ts = new Date().toISOString();
    (async()=>{
      // UNA sola richiesta (tutto-o-niente): modelli + vecchio colore + gruppo nuovo.
      const ops = daAggiornare.map(m=>({
        tipo:"update", table:"modelli", payload:{ colore_custom:newHex, colore:newHex },
        matchObj:{id:m.id, user_id:userId},
        contesto:`Sostituzione colore su modello "${m.titolo||m.id}"`,
      }));
      if(regVecchio && !parziale){
        ops.push({ tipo:"delete", table:"colori", payload:null, matchObj:{user_id:userId, hex:regVecchio.hex},
          contesto:"Sostituzione colore (rimozione vecchio)" });
      }
      if(regNuovo){
        ops.push({ tipo:"update", table:"colori", payload:{label:nomeGruppo||null}, matchObj:{user_id:userId, hex:regNuovo.hex},
          contesto:"Sostituzione colore (nome gruppo)" });
      } else {
        ops.push({ tipo:"insert", table:"colori", payload: nomeGruppo ? { user_id:userId, hex:newHex, label:nomeGruppo } : { user_id:userId, hex:newHex }, matchObj:null,
          contesto:"Sostituzione colore (nuovo gruppo)" });
      }
      const risB = await scriviBatchConBackup({ ops, contesto:"Sostituzione colore", ts, opzioni:{ soloLog:true } });
      if(risB.errori>0) segnalaErroreSoloLog(`${risB.errori} modifiche non salvate su Supabase durante il cambio colore`, "Sostituzione colore");
      syncSeAttivo(eventiAggiornati||store.events, store.calendars, modelliAggiornati);
    })();
  }

  // Assegna un colore a PIU' modelli in un colpo solo (e toglie il colore ad altri,
  // che tornano al colore automatico per orario). Prima "Aggiungi colore" salvava un
  // modello alla volta in un ciclo: ogni salvataggio partiva dalla lista non ancora
  // aggiornata dal precedente, quindi ne cambiava visibilmente uno solo.
  // Come replaceColoreEverywhere: una sola scrittura locale, una sola propagazione agli
  // eventi, scritture su Supabase in background. Poi ricompatta i modelli dello stesso
  // colore (stessa regola del salvataggio dal form). Ritorna { ok, n }.
  async function assegnaColoreAModelli(idsAggiungi, idsRimuovi, hex){
    if(!userId || !hex) return { ok:false, n:0 };
    const aggiungi = new Set(idsAggiungi||[]);
    const rimuovi = new Set((idsRimuovi||[]).filter(id=>!aggiungi.has(id)));
    if(aggiungi.size===0 && rimuovi.size===0) return { ok:true, n:0 };
    segnalaModificaOrdineModelli();
    const mappaColori = {};
    const modificati = [];
    let modelliAggiornati = modelli.map(m=>{
      if(!m) return m;
      let nuovo = null;
      if(aggiungi.has(m.id)) nuovo = hex;
      else if(rimuovi.has(m.id)) nuovo = (m.tempo==="h24" ? COLORE_H24 : colByTime(m.inizio));
      if(!nuovo || stessoHexColore(m.coloreCustom||m.colore, nuovo)) return m;
      mappaColori[m.id] = nuovo;
      modificati.push({ id:m.id, titolo:m.titolo, colore:nuovo });
      return { ...m, coloreCustom:nuovo, colore:nuovo };
    });
    if(modificati.length===0) return { ok:true, n:0 };
    const prima = modelli;
    try{
      const calAffetti = new Set(modelliAggiornati.filter(m=>m && mappaColori[m.id]).map(m=>m.calendarId||mainCalId));
      const calendarsOrdinati = (store.calendars||[]).map(c=>c.id);
      const ordini = new Map();
      calAffetti.forEach(cid=>{
        ordini.set(cid, calcolaOrdineModelli(modelliAggiornati.filter(m=>m && (m.calendarId||mainCalId)===cid)));
      });
      modelliAggiornati = ricalcolaPosizioniGlobali(modelliAggiornati, calendarsOrdinati, ordini, mainCalId);
    }catch(e){ segnalaErroreSoloLog(e?.message||String(e), "Assegnazione colore (riordino)"); }
    modelliRef.current = modelliAggiornati;
    setModelli(modelliAggiornati);
    const eventiAggiornati = await propagaColoreModelliAgliEventi(mappaColori);
    saveToLocalStorage(eventiAggiornati||store.events, store.calendars, modelliAggiornati);
    try{ await salvaModifichePosizioni(prima, modelliAggiornati); }catch(e){ segnalaErroreSoloLog(e?.message||String(e), "Assegnazione colore (posizioni)"); }
    const ts = new Date().toISOString();
    (async()=>{
      const risB = await scriviBatchConBackup({
        ops: modificati.map(x=>({
          tipo:"update", table:"modelli", payload:{ colore_custom:x.colore, colore:x.colore },
          matchObj:{ id:x.id, user_id:userId },
          contesto:`Assegnazione colore su modello "${x.titolo||x.id}"`,
        })),
        contesto:"Assegnazione colore", ts, opzioni:{ soloLog:true },
      });
      if(risB.errori>0) segnalaErroreSoloLog(`${risB.errori} modelli non salvati su Supabase durante l'assegnazione del colore`, "Assegnazione colore");
      syncSeAttivo(eventiAggiornati||store.events, store.calendars, modelliAggiornati);
    })();
    return { ok:true, n:modificati.length };
  }

  async function saveRotazione(data){
    if(!userId) return;
    // reperibilitaTurnoPartenza non ha una colonna dedicata su Supabase:
    // lo teniamo dentro "griglia" (già un JSON libero) sotto una chiave
    // riservata, così sopravvive al salvataggio/ricaricamento invece di
    // sparire silenziosamente (prima si perdeva subito dopo il primo giro
    // di sync, e la rotazione "reperibilità" tornava sempre al turno A
    // di default).
    // modelloG3Id/modelloG4Id (Giorno 3 e Giorno 4 del ciclo reperibilità)
    // non hanno colonna dedicata: stesso trattamento di
    // reperibilitaTurnoPartenza qui sopra, dentro "griglia".
    const grigliaConMeta = data.tipo==="reperibilita"
      ? {...(data.griglia||{}),
          __reperibilitaTurnoPartenza: data.reperibilitaTurnoPartenza||"14-24",
          __modelloG3Id: data.modelloG3Id||null,
          __modelloG4Id: data.modelloG4Id||null,
        }
      : (data.griglia||{});
    const payload={
      user_id:userId, tipo:data.tipo, titolo:data.titolo||"",
      data_inizio:data.dataInizio||null, n_settimane:data.nSettimane||52,
      modello_lavoro_id:data.modellaLavoroId||null,
      modello_nl_id:data.modelloNLId||null,
      modello_rs_id:data.modelloRSId||null,
      griglia:grigliaConMeta,
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
      oraInizioOverride=null, oraFineOverride=null, calIdOverride=null,
    } = extra;
    const calDest = calIdOverride || calId; // calendario di destinazione (default: quello attivo)
    const dateKey = dkey(dataEv.getFullYear(), dataEv.getMonth(), dataEv.getDate());
    const color = mod ? (mod?.coloreCustom || (mod.tempo==="h24" ? "#64748b" : colByTime(mod.inizio))) : "#94a3b8";
    const label = (labelOverride || mod?.label || mod?.titolo || "").toUpperCase();
    const allDay = mod ? mod.tempo==="h24" : true;
    // oraInizioOverride/oraFineOverride: usati per eventi come la
    // protrazione, dove l'orario è specifico di quel giorno e non quello
    // fisso del modello (il modello "PROTRAZIONE PAGAMENTO" è riusato
    // sempre, ma l'orario cambia turno per turno).
    const tIn = oraInizioOverride!=null ? oraInizioOverride : ((!mod || allDay) ? "" : (mod.inizio || ""));
    const tOut = oraFineOverride!=null ? oraFineOverride : ((!mod || allDay) ? "" : calcFineModello(mod));

    // LOCALE PER PRIMO: l'evento nasce subito qui, con un id valido (UUID) generato
    // in locale; l'invio a Supabase viene accodato e parte subito dopo (o appena
    // torna la rete). Nessuna attesa della risposta del database.
    const nuovoId = generaIdLocale();
    const noteUp = up(note), collegaUp = up(collega), autoUp = up(auto);
    if(!nuoviEventiLocali[dateKey]) nuoviEventiLocali[dateKey] = {};
    if(!nuoviEventiLocali[dateKey][calDest]) nuoviEventiLocali[dateKey][calDest] = [];
    nuoviEventiLocali[dateKey][calDest].push({
      id: nuovoId,
      color,
      label,
      allDay,
      tIn: tIn || "",
      tOut: tOut || "",
      place: "",
      map: "",
      note: noteUp,
      modelloId: mod?.id || null,
      rotazioneId: rotazioneId || null,
      collega: collegaUp,
      auto: autoUp,
      importId: importId || null,
      protPagFine: protPagFine || "",
      protRecFine: protRecFine || "",
    });
    accodaScritturaRemota({
      tipo:"insert", table:"events",
      payload:{
        id: nuovoId, user_id: userId, calendar_id: calDest, date_key: dateKey,
        label, color, all_day: allDay, time_in: tIn, time_out: tOut,
        place: "", map_url: "", note: noteUp,
        modello_id: mod?.id || null, rotazione_id: rotazioneId,
        collega: collegaUp, auto: autoUp,
        prot_pag_fine: protPagFine, prot_rec_fine: protRecFine,
        import_id: importId,
      },
      contesto: importId ? "Importazione turni" : "Inserimento turno da modello",
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
    const MAPPING_RADICI = [
      { r: "prim", t: ["prim", "mattin"] },
      { r: "second", t: ["second", "pomerigg"] },
      { r: "terz", t: ["terz", "3°"] },
      { r: "nott", t: ["nott"] },
    ];
    let candidati = modelli.filter(m=>{
      if((m.calendarId||mainCalId)!==calId) return false;
      const tm = (m.titolo||"").trim().toLowerCase();
      const lm = (m.label||"").trim().toLowerCase();
      return tm === titolo || lm === titolo;
    });
    if(candidati.length===0){
      candidati = modelli.filter(m=>{
        if((m.calendarId||mainCalId)!==calId) return false;
        const tm = (m.titolo||"").trim().toLowerCase();
        const lm = (m.label||"").trim().toLowerCase();
        if(tm && (titolo.includes(tm) || tm.includes(titolo))) return true;
        if(lm && (titolo.includes(lm) || lm.includes(titolo))) return true;
        for(const mapItem of MAPPING_RADICI){
          if(titolo.includes(mapItem.r) && mapItem.t.some(k => tm.includes(k) || lm.includes(k))) return true;
        }
        return false;
      });
    }
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

    // Il modello viene creato SUBITO in locale (id locale valido, vedi
    // sopra: setModelli/saveToLocalStorage avvengono prima di questo
    // punto), esattamente come per eventi e rotazioni altrove nell'app.
    // In precedenza qui si passava attendiBackup:true e si aspettava la
    // vera conferma di Supabase prima di procedere, per evitare eventi
    // figli "orfani" in caso di fallimento silenzioso dell'insert in
    // background. Il prezzo di quell'attesa era però che, offline (o con
    // rete lenta/instabile), la creazione dell'evento PROTRAZIONE non
    // avveniva affatto o restava sospesa a lungo: l'app perdeva la
    // garanzia "tutto funziona offline, il backup arriva quando può" che
    // vale per il resto delle funzionalità.
    // Il modello locale appena creato ha già un id stabile e valido (non
    // cambia quando arriva la risposta di Supabase: l'insert usa lo
    // stesso idLocale), quindi l'evento figlio può agganciarsi subito ad
    // esso senza aspettare nulla: se il backup fallisce o è in coda,
    // processaCodaSync lo ritenterà in automatico appena torna la rete,
    // esattamente come già avviene per gli eventi normali.
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
      // Non solo log: se il modello non è stato davvero salvato su
      // Supabase, meglio NON creare l'evento figlio (che risulterebbe
      // orfano e sparirebbe al prossimo refresh) piuttosto che crearlo
      // comunque senza modello agganciato. Il chiamante
      // (sincronizzaEventiProtrazione) già gestisce "creato===null"
      // saltando la creazione di questo evento figlio (continue).
      segnalaErroreSoloLog(`Impossibile creare/recuperare il modello "${titolo}" per il calendario ${targetCalId}: ${esito?.errore?.message||"saveModello non ha ritornato l'oggetto atteso"}.`, "trovaOCreaModelloProtrazione");
    }
    return creato;
  }

  async function importaTurniPdfJson(righeJson){
    segnaContestoLog("Importazione turni");
    const risultatoVuoto = { nAggiunti:0, nSostituiti:0, nInvariati:0, mancanti:[], sospetti:[], importId:null, sostituzioni:[] };
    if(!userId || !calId || !righeJson?.length) return risultatoVuoto;

    const importId = `imp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const nuoviEventiLocali = {};
    const idsDaCancellare = [];
    const mancanti = [];
    const sospetti = [];
    let nAggiunti=0, nSostituiti=0, nInvariati=0;
    const sostituzioni = [];
    const elencoAggiunti = [], elencoInvariati = [];

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
        if(invariato){ nInvariati++; elencoInvariati.push({ data: dateKey, titolo: mod.titolo||"" }); continue; }
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
        elencoAggiunti.push({ data: dateKey, titolo: mod.titolo||"" });
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

    // Cancellazione dei turni sostituiti: DOPO il salvataggio locale, in coda verso Supabase.
    if(idsDaCancellare.length) accodaCancellazioniEventi(idsDaCancellare, "Sostituzione turni (importazione)");

    // Stesso bugfix del caso "Creazione turno": il calendario su cui è stato
    // fatto l'import deve restare visibile dopo il refresh.
    if((nAggiunti||0)>0 || (nSostituiti||0)>0) setSelectedCalIds(prev => prev.length===0 || prev.includes(calId) ? prev : [...prev, calId]);

    registraProblemiImport(mancanti, sospetti);
    registraAttivita("Importazione turni",
      `Importazione completata: ${nAggiunti} aggiunti, ${nSostituiti} sostituiti, ${nInvariati} invariati` +
      (((mancanti?.length||0)+(sospetti?.length||0))>0 ? `, ${mancanti?.length||0} mancanti, ${sospetti?.length||0} sospetti` : ""),
      { chiave:`riepilogo-${importId}`, supabase:"n/a" });
    return { nAggiunti, nSostituiti, nInvariati, mancanti, sospetti, importId, sostituzioni, elencoAggiunti, elencoInvariati };
  }

  async function delTuttiEventiImport(importId, cId){
    const idsLocali = [];
    for(const calMap of Object.values(store.events||{}))
      for(const lista of Object.values(calMap||{}))
        for(const e of (lista||[])) if(e.importId===importId) idsLocali.push(e.id);
    await eliminaEventiLocalFirst({
      contesto:"Eliminazione eventi importati", idsLocali,
      aggiorna: prev=>{
        const ns = JSON.parse(JSON.stringify(prev));
        const idSet = new Set(idsLocali.map(String));
        for(const dKey of Object.keys(ns.events||{})){
          for(const cid of Object.keys(ns.events[dKey]||{})){
            ns.events[dKey][cid] = (ns.events[dKey][cid]||[]).filter(e=>!idSet.has(String(e.id)));
          }
        }
        return ns;
      },
      queryServer: async()=>{
        const { data, error } = await supabase.from("events").select("id")
          .eq("import_id", importId).eq("user_id", userId);
        return { ids:(data||[]).map(r=>r.id), error };
      },
    });
  }

  async function importaEventiSingoli(righe, tipoTabella=null){
    segnaContestoLog("Importazione turni");
    // righe: [{ dateKey, modelloId }] -- righe senza modelloId finiscono tra i "non riconosciuti"
    // tipoTabella: "personale" -> calendario FU, "stella" -> calendario COT
    // (nomi in cima al file); altrimenti il calendario attivo.
    // Restituisce il numero di turni EFFETTIVAMENTE scritti (aggiunti + modificati).
    // Il dettaglio (aggiunti / modificati / non modificati / non riconosciuti) viene
    // pubblicato con impostaDettaglioImport e mostrato nel riepilogo del dialog.
    const dettaglio = { aggiunti:[], modificati:[], invariati:[], errori:[], importId:null };
    impostaDettaglioImport(dettaglio);
    if(!userId || !righe?.length) return 0;
    const calDest = tipoTabella==="stella" ? calStellaId : tipoTabella==="personale" ? calPersonaleId : calId;
    if(!calDest){
      const nome = tipoTabella==="stella" ? NOME_CAL_TURNI_STELLA : NOME_CAL_TURNI_PERSONALI;
      segnalaErrore(`Calendario "${nome}" non trovato: importazione annullata. Se l'hai rinominato, aggiorna il nome in cima a 06-Logica.jsx.`, "Importa da foto");
      return 0;
    }
    const importId = `imp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    dettaglio.importId = importId;
    const nuoviEventiLocali = {};
    const idsDaSostituire = [];
    const modelliInGioco = new Set(righe.filter(r=>r.modelloId).map(r=>r.modelloId));
    const nomeMod = (id) => { const m = modelli.find(x=>x.id===id); return m ? (m.titolo||m.label||"") : ""; };
    let nScritte = 0;
    for(const r of righe){
      if(!r.modelloId){ dettaglio.errori.push({ data:r.dateKey, titolo:"turno non riconosciuto (nessun modello associato)" }); continue; }
      const mod = modelli.find(m=>m.id===r.modelloId);
      if(!mod){ dettaglio.errori.push({ data:r.dateKey, titolo:"modello non trovato" }); continue; }
      // Se il giorno ha già un evento con lo stesso modello: non modificato.
      const eventiEsistenti = store.events?.[r.dateKey]?.[calDest] || [];
      if(eventiEsistenti.some(ev => ev.modelloId === r.modelloId)){
        dettaglio.invariati.push({ data:r.dateKey, titolo: mod.titolo||mod.label||"" });
        continue;
      }
      // Turni personali: se quel giorno c'è già un ALTRO dei turni importati (es. Primo al
      // posto di Secondo) il turno è cambiato: il vecchio viene sostituito dal nuovo.
      const daSostituire = tipoTabella==="personale"
        ? eventiEsistenti.filter(ev=>ev.modelloId && modelliInGioco.has(ev.modelloId)) : [];
      if(daSostituire.length){
        for(const ev of daSostituire) idsDaSostituire.push(ev.id);
        dettaglio.modificati.push({
          data:r.dateKey,
          vecchio: daSostituire.map(ev=>nomeMod(ev.modelloId)||ev.label||"?").join(" + "),
          nuovo: mod.titolo||mod.label||"",
        });
      } else {
        dettaglio.aggiunti.push({ data:r.dateKey, titolo: mod.titolo||mod.label||"" });
      }
      const [y,m,d] = r.dateKey.split("-").map(Number);
      const dataEv = new Date(y, m-1, d);
      await inserisciEventoGenerico(mod, dataEv, null, nuoviEventiLocali, null, { importId, calIdOverride: calDest });
      nScritte++;
    }
    // LOCALE PER PRIMO: stato dell'app + cache del dispositivo (qui nasce la voce nel Log).
    setStore(prev => {
      const ns = JSON.parse(JSON.stringify(prev));
      if(idsDaSostituire.length){
        const idSet = new Set(idsDaSostituire.map(String));
        for(const dKey of Object.keys(ns.events||{})){
          if(ns.events[dKey]?.[calDest]) ns.events[dKey][calDest] = ns.events[dKey][calDest].filter(e=>!idSet.has(String(e.id)));
        }
      }
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
    // POI Supabase: cancellazione dei turni sostituiti in coda (gli inserimenti sono già in coda).
    if(idsDaSostituire.length) accodaCancellazioniEventi(idsDaSostituire, "Sostituzione turni (importazione)");
    // Il calendario di destinazione deve restare visibile dopo il refresh.
    if(nScritte>0) setSelectedCalIds(prev => prev.length===0 || prev.includes(calDest) ? prev : [...prev, calDest]);
    registraAttivita("Importazione turni",
      `Importazione completata (${store.calendars.find(c=>c.id===calDest)?.name||"calendario"}): ` +
      `${dettaglio.aggiunti.length} aggiunti, ${dettaglio.modificati.length} modificati, ${dettaglio.invariati.length} non modificati` +
      (dettaglio.errori.length ? `, ${dettaglio.errori.length} non riconosciuti` : ""),
      {
        chiave:`riepilogo-${importId}`, supabase:"n/a",
        dettagli: [
          ...dettaglio.modificati.map(x=>`~ ${x.data}: ${x.vecchio} → ${x.nuovo}`),
          ...dettaglio.invariati.map(x=>`= ${x.data} · ${x.titolo} (non modificato)`),
          ...dettaglio.errori.map(x=>`✗ ${x.data}: ${x.titolo}`),
        ],
      });
    return nScritte;
  }

  async function applyRotazione(rotId, startDayKey, numRipetizioni, modPartenza="RS", giornoPartenza=0) {
    if(!userId || !calId || !startDayKey || !numRipetizioni) return;
    const rot = rotazioni.find(r=>r.id===rotId);
    if(!rot) return;

    // LOCALE PER PRIMO: la rotazione risulta subito applicata; la configurazione
    // (data inizio e numero settimane) va a Supabase in coda, con retry automatico.
    setRotazioni(prev=>prev.map(r=>r.id===rotId?{...r,dataInizio:startDayKey,nSettimane:numRipetizioni}:r));
    accodaScritturaRemota({
      tipo:"update", table:"rotazioni",
      payload:{ data_inizio:startDayKey, n_settimane:numRipetizioni },
      match:{ id:rotId, user_id:userId },
      contesto:"Applicazione rotazione",
    });

    const nuoviEventiLocali = {};

    async function inserisciEvento(mod, dataEv){
      if(!mod) return;
      await inserisciEventoGenerico(mod, dataEv, rot.id, nuoviEventiLocali);
    }

    if(rot.tipo === "nlrs_scalante") {
      const modRS = modelli.find(m=>m.id===rot.modelloRSId);
      const modNL = modelli.find(m=>m.id===rot.modelloNLId);
      const rotDomeniche = rotazioni.find(r=>r.tipo==="domeniche");
      const modQuartina = modelli.find(m=>m.id===rotDomeniche?.modellaLavoroId);
      const primoModello = modPartenza==="NL" ? modNL : modRS;
      const secondoModello = modPartenza==="NL" ? modRS : modNL;
      // Sequenza dei giorni RS che scala ad ogni quartina: Ven, Gio, Mer,
      // Mar, Lun, Sab (salta Domenica), poi ricomincia da Ven. Valori come
      // da Date.getDay(): Dom=0, Lun=1, Mar=2, Mer=3, Gio=4, Ven=5, Sab=6.
      const SEQ_GIORNI_RS = [5, 4, 3, 2, 1, 6];

      if(modQuartina){
        // Le quartine sono lette dagli eventi già presenti a calendario con
        // il modello Quartina, in ordine cronologico a partire da
        // startDayKey — qualunque sia la cadenza tra una e l'altra (4, 3, 5,
        // 8 settimane...), senza nessun passo fisso calcolato qui. Una volta
        // inseriti, RS e NL restano fissi anche se in futuro si sposta la
        // quartina: questa funzione li scrive una sola volta, non li tiene
        // agganciati "in diretta".
        const dateQuartine = [];
        for(const [dateKey, calMap] of Object.entries(store.events||{})){
          if(dateKey < startDayKey) continue;
          const evts = calMap?.[calId] || [];
          if(evts.some(ev => ev.modelloId === modQuartina.id)) dateQuartine.push(dateKey);
        }
        dateQuartine.sort();

        const [y0, m0, d0] = startDayKey.split("-").map(Number);
        const primoRS = new Date(y0, m0-1, d0);
        let idx = SEQ_GIORNI_RS.indexOf(primoRS.getDay());
        if(idx === -1) idx = 0;

        for(let i=0; i<numRipetizioni && i<dateQuartine.length; i++){
          const [qy, qm, qd] = dateQuartine[i].split("-").map(Number);
          const quartina = new Date(qy, qm-1, qd);
          const lunediSettimana = new Date(quartina);
          lunediSettimana.setDate(lunediSettimana.getDate() - 6);

          const giornoAtteso = SEQ_GIORNI_RS[idx];
          const offset = giornoAtteso === 0 ? 6 : giornoAtteso - 1; // giorni dopo il Lunedì
          const dataRS = new Date(lunediSettimana);
          dataRS.setDate(dataRS.getDate() + offset);
          const dataNL = new Date(dataRS);
          dataNL.setDate(dataNL.getDate() + 7);

          await inserisciEvento(primoModello, dataRS);
          await inserisciEvento(secondoModello, dataNL);

          idx = (idx + 1) % SEQ_GIORNI_RS.length;
        }
      }
    } else if(rot.tipo === "reperibilita") {
      // Ciclo di 4 giorni. La catena dei passi, a partire dal Giorno 1, è:
      //   Giorno 1 -> Giorno 2 : +1
      //   Giorno 2 -> Giorno 3 : +7
      //   Giorno 3 -> Giorno 4 : +1
      //   Giorno 4 -> Giorno 1 del ciclo successivo : +7
      // In assoluto rispetto al Giorno 1: +0, +1, +8, +9, poi il ciclo dopo
      // riparte a +16. I passi quindi si alternano SEMPRE +1/+7: dopo un
      // giorno di indice pari (Giorno 1, Giorno 3) si aggiunge 1, dopo uno
      // di indice dispari (Giorno 2, Giorno 4) si aggiunge 7. Generando la
      // sequenza in questo modo — un passo alla volta invece che a blocchi
      // — la rotazione può partire da un giorno QUALSIASI del ciclo
      // (giornoPartenza 0..3), cosa impossibile con il calcolo a blocchi
      // fissi ancorato al Giorno 1.
      const MODELLI_CICLO = [
        modelli.find(m=>m.id===rot.modelloRSId),
        modelli.find(m=>m.id===rot.modelloNLId),
        modelli.find(m=>m.id===rot.modelloG3Id),
        modelli.find(m=>m.id===rot.modelloG4Id),
      ];

      const [y0, m0, d0] = startDayKey.split("-").map(Number);
      const cursore = new Date(y0, m0-1, d0);
      // numRipetizioni = numero di cicli da 4 giorni: ogni ciclo scrive
      // esattamente 4 eventi, quindi in totale numRipetizioni*4 eventi.
      const nEventi = numRipetizioni * 4;
      let idx = ((giornoPartenza % 4) + 4) % 4;

      for(let k=0; k<nEventi; k++){
        const mod = MODELLI_CICLO[idx];
        if(mod) await inserisciEvento(mod, new Date(cursore));
        // Passo verso l'evento successivo: +1 dopo Giorno 1/Giorno 3,
        // +7 dopo Giorno 2/Giorno 4.
        cursore.setDate(cursore.getDate() + (idx % 2 === 0 ? 1 : 7));
        idx = (idx + 1) % 4;
      }
    } else if(rot.tipo === "domeniche") {
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
        if(mod) await inserisciEvento(mod, d);
      }
    } else if(rot.tipo === "personalizzata") {
      const griglia = rot.griglia || {};
      const [y0, m0, d0] = startDayKey.split("-").map(Number);
      const rotInizio = rot.dataInizio ? new Date(rot.dataInizio) : new Date(y0, m0-1, d0);
      const diffDays = Math.floor((new Date(y0, m0-1, d0).getTime() - rotInizio.getTime()) / (1000 * 3600 * 24));
      const nDays = (rot.nSettimane || 52) * 7;

      for(let rep=0; rep<numRipetizioni; rep++) {
        for(const [dateKey, modId] of Object.entries(griglia)) {
          if(!modId) continue;
          const mod = modelli.find(m=>m.id===modId);
          if(!mod) continue;
          const [gy, gm, gd] = dateKey.split("-").map(Number);
          const targetDate = new Date(gy, gm-1, gd);
          targetDate.setDate(targetDate.getDate() + diffDays + rep * nDays);
          await inserisciEvento(mod, targetDate);
        }
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
    // Stesso bugfix del caso "Creazione turno": il calendario su cui è stata
    // applicata la rotazione deve restare visibile dopo il refresh.
    setSelectedCalIds(prev => prev.length===0 || prev.includes(calId) ? prev : [...prev, calId]);
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

  // Regola giorno TURNI/FU: se in un giorno il calendario TURNI (principale) ha almeno un
  // evento utile per il report (cioè che passa i filtri del report), gli eventi del
  // calendario FU di quel giorno NON vengono contati. Se TURNI non ha eventi utili
  // quel giorno, o non è tra i calendari del report, i FU contano normalmente.
  // Restituisce l'id del calendario FU da saltare per quel giorno (o null).
  function fuDaSaltare(calMap, passa){
    const fuId = calFuId;
    if(!fuId || !mainCalId || fuId===mainCalId || !calMap[fuId]) return null;
    if(reportCalIds.length>0 && !reportCalIds.includes(mainCalId)) return null;
    return (calMap[mainCalId]||[]).some(passa) ? fuId : null;
  }

  function computeConteggioForReport(cfg, reportId){
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

    const passaEv = (e)=>{
      const ov = (reportId ? (e.reportOverrides||{})[reportId] : null)?.stato || null;
      if(ov==="escluso") return false;
      if(ov!=="incluso" && modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) return false;
      if(filtraCollega && !splitColleghi(e.collega).some(c=>c.toUpperCase().includes(filtraCollega))) return false;
      return true;
    };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fuSalta = fuDaSaltare(calMap, passaEv);
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        if(cid===fuSalta) continue;
        for(const e of evts){
          // Override "solo questo evento" su CATEGORIA REPORT: priorità massima,
          // sopra la whitelist modelliInclusi decisa a livello di modello.
          const overrideReportRaw = reportId ? (e.reportOverrides||{})[reportId] : null;
          const overrideReportEvento = overrideReportRaw?.stato || null;
          if(overrideReportEvento==="escluso") continue;
          if(overrideReportEvento!=="incluso" && modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
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
          // (cfg.sottomenu[i].assegnazioni: {modelloId: gruppoKey}), a meno
          // che questo SINGOLO EVENTO non abbia un override esplicito per
          // quel sottomenu (priorità massima, stessa logica di stato/escluso
          // qui sopra). Un modello senza assegnazione in quel sottomenu
          // semplicemente non compare in nessun gruppo di quell'asse
          // (comportamento identico a "escluso" nei report esistenti: niente
          // auto-classificazione).
          sottomenu.forEach(sm=>{
            if(sm.tipo!=="libero") return;
            const gruppoKeyEvento = (overrideReportRaw?.sottomenu||{})[sm.id];
            const gruppoKey = gruppoKeyEvento || (e.modelloId ? (sm.assegnazioni||{})[e.modelloId] : null);
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
  function computeMinutiForReport(cfg, reportId){
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

    const passaEv = (e)=>{
      const ov = (reportId ? (e.reportOverrides||{})[reportId] : null)?.stato || null;
      if(ov==="escluso") return false;
      if(ov!=="incluso" && modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) return false;
      if(filtraCollega && !splitColleghi(e.collega).some(c=>c.toUpperCase().includes(filtraCollega))) return false;
      return true;
    };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fuSalta = fuDaSaltare(calMap, passaEv);
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        if(cid===fuSalta) continue;
        for(const e of evts){
          // Override "solo questo evento" su CATEGORIA REPORT: priorità massima,
          // stessa logica di computeConteggioForReport.
          const overrideReportRaw = reportId ? (e.reportOverrides||{})[reportId] : null;
          const overrideReportEvento = overrideReportRaw?.stato || null;
          if(overrideReportEvento==="escluso") continue;
          if(overrideReportEvento!=="incluso" && modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
          const collegList = splitColleghi(e.collega);
          if(filtraCollega && !collegList.some(c=>c.toUpperCase().includes(filtraCollega))) continue;

          const rcGiornata = eRecuperoGiornata(e.modelloId);
          let mins = rcGiornata ? MIN_RECUPERO_GIORNATA : minutiEvento(e);
          if(mins<=0) continue; // niente da sommare (evento senza orario valido)
          // "-PROTRAZIONE A RECUPERO" è un CONSUMO di credito, non un altro
          // turno lavorato: nel totale ore va sottratto, non sommato.
          if(rcGiornata || tipoModelloProtrazione(e.modelloId)==="meno_recupero") mins = -mins;

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
            const gruppoKeyEvento = (overrideReportRaw?.sottomenu||{})[sm.id];
            const gruppoKey = gruppoKeyEvento || (sm.assegnazioni||{})[e.modelloId];
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
          if(eRecuperoGiornata(e.modelloId)){ eventiConsumo.push({ id:e.id, dateKey, calId, minuti:MIN_RECUPERO_GIORNATA }); continue; }
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

  function computeTurnazioneForReport(cfg, reportId){
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
    const passaEv = (e)=>{
      const ov = (reportId ? (e.reportOverrides||{})[reportId] : null)?.stato || null;
      if(ov==="escluso") return false;
      if(ov!=="incluso" && modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) return false;
      if(filtraCollega && !splitColleghi(e.collega).some(c=>c.toUpperCase().includes(filtraCollega))) return false;
      return true;
    };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fuSalta = fuDaSaltare(calMap, passaEv);
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        if(cid===fuSalta) continue;
        for(const e of evts){
          // Override "solo questo evento" su CATEGORIA REPORT: priorità massima,
          // sopra l'inclusione/esclusione decisa a livello di modello.
          const overrideReportEvento = (reportId ? (e.reportOverrides||{})[reportId] : null)?.stato || null;
          if(overrideReportEvento==="escluso") continue;
          if(overrideReportEvento!=="incluso" && modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
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
          // "Nessuna categoria" scelto esplicitamente sul singolo evento: come
          // sopra, priorità massima — nessun asse anche se modello/report
          // avrebbero altrimenti un automatismo.
          const eventoTurnoVuoto = !!e.turnoVuoto;
          const eventoAppAutoVuoto = !!e.appAutoVuoto;

          // ── Asse 1: TURNO (1°/2°) — indipendente, decide su override evento,
          // poi categoria manuale del modello, poi override di questo
          // report, poi automatico per orario.
          // Se l'utente ha esplicitamente deselezionato questo asse (modello o report), niente auto: nessun gruppo.
          const gruppoTurno = eventoTurnoVuoto ? null : (overrideEventoTurno || ((modelloEvt?.turnoVuoto || escludiTurno)
            ? null
            : ((modelloEvt?.categoria==="primo"||modelloEvt?.categoria==="secondo")
              ? modelloEvt.categoria
              : (overrideTurno || categoriaTurnoAutomatica(modelloEvt)))));

          // ── Asse 2: APP/AUTO — indipendente, stessa priorità ma decide su titolo.
          // Se l'utente ha esplicitamente deselezionato questo asse (modello o report), niente auto: nessun gruppo.
          const gruppoAppAuto = eventoAppAutoVuoto ? null : (overrideEventoAppAuto || ((modelloEvt?.appAutoVuoto || escludiAppAuto)
            ? null
            : ((modelloEvt?.categoriaAppAuto==="app"||modelloEvt?.categoriaAppAuto==="auto")
              ? modelloEvt.categoriaAppAuto
              : (overrideAppAuto || categoriaAppAutoAutomatica(modelloEvt) || "auto"))));

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
  function computeIndennita(modelliInclusi=[], reportId=null){
    const {from, to} = getReportRange();
    const totaliMin = { diurno:0, notturno:0, festivo:0, notturno_festivo:0 };
    const passaEv = (e)=>{
      const ov = (reportId ? (e.reportOverrides||{})[reportId] : null)?.stato || null;
      if(ov==="escluso") return false;
      if(ov!=="incluso" && modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) return false;
      return !e.allDay && !!e.tIn && !!e.tOut;
    };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fuSalta = fuDaSaltare(calMap, passaEv);
      const fest = isFestivo(dateKey, store.nationalHolsEnabled, store.extraHols);
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        if(cid===fuSalta) continue;
        for(const e of evts){
          // Override "solo questo evento" su CATEGORIA REPORT: priorità massima.
          const overrideReportEvento = (reportId ? (e.reportOverrides||{})[reportId] : null)?.stato || null;
          if(overrideReportEvento==="escluso") continue;
          if(overrideReportEvento!=="incluso" && modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
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
    const passaEv = (e)=>{
      if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) return false;
      return !e.allDay && eModelloViabile(e);
    };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fuSalta = fuDaSaltare(calMap, passaEv);
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        if(cid===fuSalta) continue;
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
    const passaEv = (e)=>{
      if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) return false;
      return !e.allDay && eModelloViabile(e);
    };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fuSalta = fuDaSaltare(calMap, passaEv);
      let minutiGiorno = 0;
      for(const [cid, evts] of Object.entries(calMap)){
        if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
        if(cid===fuSalta) continue;
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
    // Prima si cercano tutti i collegamenti sicuri, poi si scrive TUTTO in una richiesta (tutto-o-niente),
    // al posto di una richiesta per ogni evento.
    const daCollegare = [];
    for(const { dayKey, calId:cId, evt } of orfani){
      const match = trovaModelloCorrispondente(cId, evt.label, evt.tIn, evt.tOut);
      if(match) daCollegare.push({ dayKey, cId, evt, match });
      else nonRisolti.push({ dayKey, label: evt.label, motivo: "nessun modello corrispondente trovato" });
    }
    if(daCollegare.length>0){
      const risB = await scriviBatchConBackup({
        ops: daCollegare.map(x=>({
          tipo:"update", table:"events", payload:{ modello_id: x.match.id }, matchObj:{ id: x.evt.id, user_id:userId },
          contesto:"Ripristino automatico modello mancante",
        })),
        contesto:"Ripristino automatico modello mancante", ts:new Date().toISOString(), opzioni:{ soloLog:true },
      });
      if(risB && risB.errori>0){
        daCollegare.forEach(x=>nonRisolti.push({ dayKey:x.dayKey, label:x.evt.label, motivo:"errore di scrittura" }));
      } else {
        let nuovoStore = store;
        daCollegare.forEach(x=>{
          nuovoStore = withEventoAggiornato(nuovoStore, x.dayKey, x.cId, x.evt.id, { modelloId: x.match.id });
          risolti.push({ dayKey:x.dayKey, label:x.evt.label, modello:x.match.titolo||x.match.label });
        });
        setStore(nuovoStore);
        storeRef.current = nuovoStore;
      }
    }
    return { totale: orfani.length, risolti, nonRisolti };
  }

  // ─── "Tutti gli eventi di stesso nome+orario" per CATEGORIA TURNO /
  // CATEGORIA APP-AUTO / CATEGORIA REPORT del singolo evento ───
  // Richiesta esplicita: il "match" per capire quali eventi coinvolgere in
  // un aggiornamento di massa è nome (label) + orario (tIn/tOut) identici,
  // non semplicemente "stesso modello collegato" — due eventi con lo stesso
  // modello ma orario diverso NON devono essere toccati, e viceversa un
  // evento con lo stesso nome+orario ma senza modello collegato (o con un
  // modello diverso per qualche motivo storico) DEVE esserlo. Aggiorna:
  //  1) subito lo stato locale (store), su tutte le date/calendari;
  //  2) Supabase in blocco (un unico UPDATE con .in("id", [...])).
  // patchEvento: oggetto di patch in formato "locale" (es. {categoriaTurno,
  // turnoVuoto,...}), fuso sopra ai campi esistenti di ogni evento trovato;
  // oppure una FUNZIONE (eventoEsistente => patchParziale) quando la patch
  // dipende da cosa l'evento aveva già (es. rimuovere solo la chiave di UN
  // report da reportOverrides senza cancellare gli override degli altri
  // report già presenti su quell'evento). patchDb: stesso concetto, in
  // nomi colonna Supabase — se è una funzione riceve lo stesso evento
  // "nuovo" (già con patchEvento applicata) per costruire il payload.
  async function applicaReportOverrideATuttiGliEventi(nomeLabel, tInMatch, tOutMatch, patchEvento, patchDb){
    if(!userId) return { idsAggiornati: [] };
    const idsAggiornati = [];
    const dbPayloadPerId = {};
    // Calcolo SUBITO dai valori correnti (non dentro l'updater di React: l'elenco degli
    // id veniva letto subito dopo, ma l'updater non è garantito venga eseguito in tempo,
    // e in quel caso gli aggiornamenti verso Supabase venivano saltati in silenzio).
    const eventsBase = store?.events||{};
    const nextEvents = {};
    for(const [dk, calMap] of Object.entries(eventsBase)){
      const nextCalMap = {};
      for(const [cid, evts] of Object.entries(calMap)){
        nextCalMap[cid] = evts.map(e=>{
          if(e.label===nomeLabel && (e.tIn||"")===(tInMatch||"") && (e.tOut||"")===(tOutMatch||"")){
            idsAggiornati.push(e.id);
            const patch = typeof patchEvento==="function" ? patchEvento(e) : patchEvento;
            const nuovoEvt = {...e, ...patch};
            dbPayloadPerId[e.id] = typeof patchDb==="function" ? patchDb(nuovoEvt) : patchDb;
            return nuovoEvt;
          }
          return e;
        });
      }
      nextEvents[dk] = nextCalMap;
    }
    setStore(prev=>({...prev, events: nextEvents}));
    saveToLocalStorage(nextEvents, store.calendars, modelli);
    if(idsAggiornati.length>0){
      // Locale già salvato sopra; l'invio a Supabase è accodato (con retry automatico).
      accodaScrittureRemote(idsAggiornati.map(id=>({
        tipo:"update", table:"events",
        payload: typeof patchDb==="function" ? dbPayloadPerId[id] : patchDb,
        match:{ id, user_id:userId },
        contesto:`Aggiornamento di massa (${nomeLabel} ${tInMatch}-${tOutMatch})`,
      })));
    }
    return { idsAggiornati };
  }

  // ── Widget Android (2 settimane) ──
  // widgetTick sale ogni volta che l'app torna visibile: cosi' il widget si aggiorna APPENA APRI L'APP,
  // non solo quando cambia qualcosa nei dati.
  const [widgetTick, setWidgetTick] = useState(0);
  const widgetErroreSegnalatoRef = useRef(false);
  const widgetStatoLoggatoRef = useRef(false);
  useEffect(()=>{
    const quandoVisibile = ()=>{ if(document.visibilityState==="visible") setWidgetTick(t=>t+1); };
    document.addEventListener("visibilitychange", quandoVisibile);
    return ()=>document.removeEventListener("visibilitychange", quandoVisibile);
  }, []);
  // Prepara i dati dei prossimi giorni (turni, quartine, festivi) e li passa al widget nativo.
  // Vale solo dentro l'APK; sul sito/PC non fa nulla. Invio ritardato di 1,5 s per non ripeterlo a ogni modifica.
  useEffect(()=>{
    // Diagnosi (una sola riga per sessione nel Log): dice perche' il widget viene saltato.
    if(!widgetDisponibile()){
      if(!widgetStatoLoggatoRef.current){
        widgetStatoLoggatoRef.current = true;
        registraAttivita("Widget Android", `Widget NON attivo in questa app: ${descriviStatoWidget()}`, { chiave:"widget-stato", supabase:"n/a" });
      }
      return;
    }
    if(!store.calendars || store.calendars.length===0) return;   // dati non ancora caricati
    if(!widgetStatoLoggatoRef.current){
      widgetStatoLoggatoRef.current = true;
      registraAttivita("Widget Android", `Widget attivo, preparo i dati: ${descriviStatoWidget()}`, { chiave:"widget-stato", supabase:"n/a" });
    }
    const timer = setTimeout(()=>{
      try{
        const giorni = {};
        const cacheFest = {};
        const festiviAnno = (y)=> cacheFest[y] || (cacheFest[y] = italianHols(y, store.nationalHolsEnabled));
        const campo2 = store.calEventRows===2 ? (store.calRow2Field||"---") : "---";
        const riga2 = (e)=>{
          switch(campo2){
            case "titolo": return e.label||"";
            case "inizio": return e.tIn||"";
            case "fine":   return e.tOut||"";
            case "note":   return e.note||"";
            default: return "";
          }
        };
        const oggi = new Date(); oggi.setHours(12,0,0,0);
        for(let i=-7;i<=60;i++){
          const dt = new Date(oggi); dt.setDate(dt.getDate()+i);
          const y = dt.getFullYear(), m = dt.getMonth()+1, dd = dt.getDate();
          const key = dkey(y, m-1, dd);
          const festivo = festiviAnno(y).some(h=>h.m===m && h.d===dd) ||
            (store.extraHols||[]).some(h=>!h.importante && +h.m===m && +h.d===dd && (h.y==null || +h.y===y));
          const g = {};
          const ev = allEvts(key).map(e=>({ a:e.label||"", b:riga2(e), c:e.color||"" }));
          if(ev.length) g.e = ev;
          const qc = coloreQuartina(key);
          if(qc){ g.q = store.reportSettings?.quartine?.date?.[key] || ""; g.qc = qc; }
          if(festivo) g.h = 1;
          if(Object.keys(g).length) giorni[key] = g;
        }
        inviaAlWidget({ v:1, dark: !!dark, sunday: sundayColor, holiday: holidayColor, giorni }).then(esito=>{
          // L'esito finisce nel Log dell'app (Impostazioni): cosi' si vede cosa succede sul telefono.
          if(esito.ok){
            registraAttivita("Widget Android", `Widget aggiornato: ${Object.keys(giorni).length} giorni con dati`, { chiave:"widget", supabase:"n/a" });
          } else if(!esito.saltato && !widgetErroreSegnalatoRef.current){
            widgetErroreSegnalatoRef.current = true;
            segnalaErroreSoloLog({ message:`${esito.errore} (${esito.stato})` }, "Widget Android: invio dei dati non riuscito");
          }
        });
      }catch(err){
        if(!widgetErroreSegnalatoRef.current){
          widgetErroreSegnalatoRef.current = true;
          segnalaErroreSoloLog(err, `Widget Android: preparazione dei dati non riuscita (${descriviStatoWidget()})`);
        }
      }
    }, 300);
    return ()=>clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetTick, store.events, store.reportSettings, store.sundayColor, store.holidayColor,
      store.calEventRows, store.calRow2Field, store.calendars, store.extraHols, store.nationalHolsEnabled,
      dark, selectedCalIds]);

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
    patronoCittaSel,
    setPatronoCittaSel,
    syncMsg,
    setSyncMsg,
    backupsList,
    setBackupsList, backupConfig, salvaBackupConfig, eliminaBackup, tieniUltimiBackup, backupTieniN, setBackupTieniN,
    showBackupsModal,
    setShowBackupsModal,
    showLocalDataModal,
    setShowLocalDataModal,
    esitoBackupLocale,
    setEsitoBackupLocale,
    confermaImportLocale,
    setConfermaImportLocale,
    backupPeriodoDa,
    setBackupPeriodoDa,
    backupPeriodoA,
    setBackupPeriodoA,
    syncing,
    setSyncing,
    nhD,
    setNhD,
    nhM,
    setNhY,
    nhY,
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
    ordineModelli, cambiaOrdineModelli,
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
    gruppi, setGruppi, gruppiDelCalendario, materializzaGruppiA, aggiungiGruppo, rinominaGruppo, eliminaGruppo, spostaModelloInGruppo, spostaModelliInGruppo, spostaGruppo,
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
    calFuId,
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
    coloreQuartina,
    salvaQuartine,
    coloriUsatiTutti,
    riordinaColoriUsati,
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
    cancellaEventiMeseSelezione,
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
    handleVerificaSupabase,
    esitoVerificaSupabase, setEsitoVerificaSupabase, esitoExportSupabase, setEsitoExportSupabase, sincronizzaOra, syncAuto, impostaSyncAuto,
    handleRestoreBackup,
    handleEsportaBackupLocale,
    handleFileSelezionatoImportLocale,
    confermaEsegueImportBackupLocale,
    handleLogout,
    eseguiNormalizzazione,
    normalizzaModelliTempo,
    normalizzaEventiTempo,
    modelliOrdinati,
    importsRecenti, calPersonaleId, calStellaId,
    modelliDelCalendario,
    spostaModelloPuro,
    moveRotazione, moveColoreExtra, ricoloraModelliPerFasciaOraria,
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
    ripulisciTutteLePosizioniModelli,
    analizzaColoriDaNormalizzare, applicaNormalizzazioneColori,
    versioniAutomatiche, sorgenteDisposizione, setSorgenteDisposizione, aggiornaVersioniAutomatiche, caricaVersioneAutomatica,
    salvaDisposizioneModelli,
    ripristinaDisposizioneModelli,
    showSalvaDisposizionePopup,
    setShowSalvaDisposizionePopup,
    annullaTimerSalvaDisposizione,
    addColoreExtra,
    removeColoreExtra,
    updateColoreExtraLabel,
    replaceColoreEverywhere,
    assegnaColoreAModelli,
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
    tipoModelloPI, eRecuperoGiornata,
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
    applicaReportOverrideATuttiGliEventi,
    totaleTurni,
    totaleMinTurni,
    setPrevGrid,
    REPORT_TEMPLATES,
    calcolaOrdineModelli,
    updateFascia,
    session
  };
}
    
