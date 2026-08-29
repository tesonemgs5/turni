    import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import {
  MONTHS, DAYS, PALETTE, FONT_SIZE, NB, COLORE_H24, NOMI_MESI_IT,
  FASCE_AUTOMATICHE_DEFAULT, FESTIVITA_DEFAULT_ATTIVE,
  getContrastTextColor, daysInMonth, firstDay, fmtDataIT, dkey, uid,
  oraInMinuti, calcFine6h15, calcFine6h30, calcFineModello, calcDurata,
  isModelloTurnazioneDefault, withEventoAggiunto, saveToLocalStorage, generaIdLocale,
  loadFromLocalStorage, clearLocalStorageCache, resolveFestivitaCatalogo,
  leggiLogErrori, leggiErroriSilenziati, impostaSilenziamentoErrore,
  cancellaLogErrori, segnalaErrore,
} from "./4.Rotazione";
import { CalBadge, SmartTimeInput, AutocompleteInput, ColorPickerModal,
  ModaleErroriMultipli, FasceExpand, ConteggioConfigCard, TurnazioneConfigCard, OreTurnoConfigCard, fmtOreMin,
  IndennitaConfig, OrePerTurnoView, StraordinariView, StornoRecuperoView, GuadagniView } from "./5.Comuni";
import { ModelloCard, ModelForm, RotazioneCard, RotazioneForm, ModelloSelector,
  GrigliaRotazione, NLRSScalanteView, DomenicheView, NLRSView } from "./4.Rotazione";
import { ImportaTurniJsonDialog, ImportaFotoDialog } from "./7.Turni";

// ═══════════════════════════════════════════════════════════════
// core1.jsx — Calendario ed Eventi: qui dentro trovi tutto quello
// che riguarda la VISTA CALENDARIO e la VISTA REPORT (mesi, giorni,
// eventi sul calendario, calcolo e visualizzazione dei report).
//
// Riceve tutto lo stato/logica dell'app tramite la prop C
// (l'oggetto restituito da useAppCore, in useAppCore.js).
//
// Per modificare: l'aspetto o il comportamento del calendario o del
// report → qui. Per aggiungere nuovo stato condiviso → useAppCore.js.
// ═══════════════════════════════════════════════════════════════

export default function VistaCalendario({ C }){
  const {
    today, store, setStore, loading, setLoading, year,
    setYear, month, setMonth, calId, setCalId, editMode,
    setEditMode, selectedCalIds, setSelectedCalIds, reportCalIds, setReportCalIds, selectedModelloIds,
    setSelectedModelloIds, screen, setScreen, dayKey, setDayKey, form,
    setForm, pal, setPal, ncName, setNcName, ncColor,
    setNcColor, nsName, setNsName, nsColor, setNsColor, exCal,
    setExCal, nhName, setNhName, syncMsg, setSyncMsg, backupsList,
    setBackupsList, showBackupsModal, setShowBackupsModal, showLocalDataModal, setShowLocalDataModal, syncing,
    setSyncing, nhD, setNhD, nhM, setNhM, bgSyncing,
    setBgSyncing, dbError, setDbError, isWideScreen, setIsWideScreen, evtFontSize,
    dbErrorTimer, codaErrori, setCodaErrori, logErroriVisibile, setLogErroriVisibile, erroriSilenziatiVisibile,
    setErroriSilenziatiVisibile, segnalaErroreDb, dbUpdate, dbDelete, dbInsert, scriviConBackup,
    up, creaEventoSupabase, sheetsUrl, setSheetsUrl, sheetsSecret, setSheetsSecret,
    stats, setStats, showDbModal, setShowDbModal, showModelloEditor, setShowModelloEditor,
    isOnline, setIsOnline, banner, setBanner, syncMode, setSyncMode,
    dbRawData, setDbRawData, dbCalsCount, setDbCalsCount, dbEvtsCount, setDbEvtsCount,
    modelliTab, setModelliTab, modelli, setModelli, modelliSort, setModelliSort,
    showSortMenu, setShowSortMenu, showModelForm, setShowModelForm, origineModelForm, setOrigineModelForm,
    editModello, setEditModello, modelForm, setModelForm, showColorAssignPicker, setShowColorAssignPicker,
    colorAssignCalFiltro, setColorAssignCalFiltro, showAddColorPicker, setShowAddColorPicker, coloriExtra, setColoriExtra,
    autocompleteValori, setAutocompleteValori, showEditFasciaColor, setShowEditFasciaColor, rotazioni, setRotazioni,
    showRotForm, setShowRotForm, editRotazione, setEditRotazione, rotForm, setRotForm,
    showRotDetail, setShowRotDetail, showApplyRotDialog, setShowApplyRotDialog, showDeleteRotEvtDialog, setShowDeleteRotEvtDialog,
    showImportaFotoDialog, setShowImportaFotoDialog, showImportaTurniJsonDialog, setShowImportaTurniJsonDialog, showModelloPicker, setShowModelloPicker,
    quickModeModello, setQuickModeModello, showRotazionePicker, setShowRotazionePicker, dragSrcId, dragTargetId,
    touchSrcId, touchTargetId, touchStartX, touchStartY, prevGrid, modelliScrollRef,
    autoScrollRAF, autoScrollSpeed, dragOverId, setDragOverId, draggingId, setDraggingId,
    modalitaSpostamento, setModalitaSpostamento, updateAutoScroll, stopAutoScroll, reportInterval, setReportInterval,
    reportMeseSel, setReportMeseSel, selezionaReportMese, showMeseReportPicker, setShowMeseReportPicker, reportDateFrom,
    setReportDateFrom, reportDateTo, setReportDateTo, intervalliSalvati, salvaIntervalloCorrente,
    applicaIntervalloSalvato, rimuoviIntervalloSalvato, openReportConfig, setOpenReportConfig, showIntervalPicker,
    setShowIntervalPicker, indennita, setIndennita, conteggioConfigs, setConteggioConfigs, showReportModelliPicker,
    setShowReportModelliPicker, editFascia, setEditFascia, showFasciaColorPicker, setShowFasciaColorPicker, userId,
    isInitialized, processaCodaSync, sysDark, dark, T, activeCal,
    mainCal, mainCalId, accent, accentText, hols, fasceAutomatiche,
    colByTime, colLabel, isRed, sundayColor, holidayColor, redBg,
    getEvts, allEvts, dots, saveSettings, addCalendar, updateCalendar,
    deleteCalendar, computeEventFields, saveEvt, updateEvt, delEvt, delEvtiRotazioneDaData,
    delTutteEvtiRotazione, cancellaTuttiEventiMese, calcMinuti, saveToSheets, syncSeAttivo, loadFromSheets,
    syncFromSheets, handleSave, handleLoad, handleSaveSheetsConfig, handleViewDbData, buildBackupPayload,
    handleExportSupabase, handleOpenImportSupabase, handleRestoreBackup, handleLogout, eseguiNormalizzazione, normalizzaModelliTempo,
    normalizzaEventiTempo, modelliOrdinati, importsRecenti, modelliDelCalendario, rinumeraSottoinsieme, spostaModelloPuro,
    trascinaModelloPuro, salvaModifichePosizioni, moveH24, reorderModelli, ensureColoreRegistrato, registraValoreAutocomplete,
    registraValoriAutocomplete, rimuoviValoreAutocomplete, supabaseUpsertConRetry, saveModello, deleteModello, addColoreExtra,
    removeColoreExtra, updateColoreExtraLabel, replaceColoreEverywhere, saveRotazione, deleteRotazione, updateGrigliaRotazione,
    inserisciEventoGenerico, normOrarioImport, trovaModelloPerTitoloOrario, isRigaProtrazione, tipoProtrazione, importaTurniPdfJson,
    delTuttiEventiImport, importaEventiSingoli, applyRotazione, getReportRange, splitColleghi, computeConteggioForReport,
    computeMinutiForReport, computeStornoRecupero, computeTurnazioneForReport, computeConteggio, computeIndennita, activeReports, inactiveTypes, addReport,
    removeReport, renameReport, moveReport, getConteggioConfig, updateConteggioConfig, totaleTurni, totaleMinTurni,
    setPrevGrid, REPORT_TEMPLATES, calcolaOrdineModelli, updateFascia, session,
  } = C;

  async function applyQuickModello(key){
    if(!quickModeModello||!calId||!userId) return;
    const mod = modelli.find(m=>m.id===quickModeModello);
    if(!mod) return;
    const color = mod.coloreCustom||(mod.tempo==="h24"?"#64748b":colByTime(mod.inizio));
    const label = (mod.label||mod.titolo||"").toUpperCase();
    const allDay = mod.tempo==="h24";
    const tIn = allDay?"":(mod.inizio||"");
    const tOut = allDay?"":calcFineModello(mod);

    // Stesso pattern di saveEvt: l'id viene generato QUI, in locale, non
    // dal database. Così l'evento locale e quello su Supabase condividono
    // lo stesso id fin dal primo istante, e la scrittura locale (fonte di
    // verità immediata) non dipende dalla riuscita della chiamata remota.
    const idLocale = generaIdLocale();
    const payload = {
      id: idLocale,
      user_id: userId, calendar_id: calId, date_key: key,
      label, color, all_day: allDay,
      time_in: tIn, time_out: tOut,
      place:"", map_url:"", note:"",
      modello_id: mod.id||null, rotazione_id:null,
      collega:"", auto:"",
      prot_pag_fine:null, prot_rec_fine:null, import_id:null,
    };

    // 1) SUBITO in locale: l'utente vede il turno all'istante, online o offline.
    const evt = { id:idLocale, color, label, allDay, tIn, tOut, place:"", map:"", note:"",
      modelloId:mod.id, collega:"", auto:"" };
    let nuovoStore;
    setStore(prev=>{
      const ns = withEventoAggiunto(prev, key, calId, evt);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      nuovoStore = ns;
      return ns;
    });

    // 2) Backup su Supabase (con retry colonna) + Sheets in parallelo.
    // Se offline, o se la scrittura fallisce per un motivo di rete, va in
    // coda e riparte da sola al ritorno online — l'evento locale, già
    // scritto sopra, non viene perso né rimosso in caso di errore remoto.
    await scriviConBackup({
      tipo:"insert", table:"events", payload, matchObj:null,
      contesto:"Inserimento rapido turno", ts:new Date().toISOString(),
      eventsPerSheets: nuovoStore.events, calendarsPerSheets: nuovoStore.calendars,
    });
  }

  const totalDays = daysInMonth(year,month);
  const fd = firstDay(year,month);
  const cells = [...Array(fd).fill(null), ...Array.from({length:totalDays},(_,i)=>i+1)];

  if(loading) return (
    <div style={{background:dark?"#090e1a":"#f1f5f9",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#64748b",fontSize:13}}>⏳ Caricamento...</div>
    </div>
  );

  const selectStyle = {
    background:"rgba(255,255,255,0.15)",
    border:`1px solid ${accentText==="#ffffff"?"rgba(255,255,255,0.4)":"rgba(15,23,42,0.35)"}`,
    borderRadius:8, color:accentText, fontSize:12, fontWeight:900,
    fontFamily:"Georgia,serif", padding:"2px 0px", cursor:"pointer",
    outline:"none", flexShrink:0,
    appearance:"none", WebkitAppearance:"none",
  };

  const goPrevMonth = ()=>{
    setPrevGrid({year, month, dir:"prev"});
    setTimeout(()=>setPrevGrid(null), 350);
    month===0?(setYear(y=>y-1),setMonth(11)):setMonth(m=>m-1);
  };
  const goNextMonth = ()=>{
    setPrevGrid({year, month, dir:"next"});
    setTimeout(()=>setPrevGrid(null), 350);
    month===11?(setYear(y=>y+1),setMonth(0)):setMonth(m=>m+1);
  };

  const calView = (
    <div
      onTouchStart={(e)=>{ touchStartX.current=e.touches[0].clientX; touchStartY.current=e.touches[0].clientY; }}
      onTouchEnd={(e)=>{
        if(touchStartX.current===null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        // Su mobile lo swipe è verticale (su=mese succ., giù=mese prec.);
        // da desktop restano le frecce ‹ › (stesso metodo, solo asse cambiato).
        if(Math.abs(dy)>50 && Math.abs(dy)>Math.abs(dx)){
          if(dy<0) goNextMonth(); else goPrevMonth();
        }
        touchStartX.current=null; touchStartY.current=null;
      }}
      style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",position:"relative"}}>
      <div style={{background:"#ffffff",display:"flex",alignItems:"center",
        gap:5,padding:"6px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0,
        borderBottom:"1px solid #e2e8f0"}}>
        <button onClick={()=>month===0?(setYear(y=>y-1),setMonth(11)):setMonth(m=>m-1)}
          style={{...NB, color:"rgba(15,23,42,0.8)"}}>‹</button>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))}
          style={{...selectStyle, maxWidth:80, background:"#f1f5f9", color:"#0f172a", border:"1px solid #e2e8f0"}}>
          {MONTHS.map((mn,i)=>(
            <option key={i} value={i} style={{background:"#1e293b",color:"#fff"}}>
              {mn.toUpperCase()}
            </option>
          ))}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))}
          style={{...selectStyle, maxWidth:50, background:"#f1f5f9", color:"#0f172a", border:"1px solid #e2e8f0"}}>
          {Array.from({length:21},(_,i)=>2023+i).map(y=>(
            <option key={y} value={y} style={{background:"#1e293b",color:"#fff"}}>{y}</option>
          ))}
        </select>
        {bgSyncing&&<span style={{color:"rgba(15,23,42,0.7)",fontSize:11}}>🔄</span>}
        <button onClick={()=>month===11?(setYear(y=>y+1),setMonth(0)):setMonth(m=>m+1)}
          style={{...NB, color:"rgba(15,23,42,0.8)"}}>›</button>
        <div style={{flex:1}}/>
        <button onClick={()=>setShowModelloPicker("quick")}
          title="Applica un modello a più giorni"
          style={{background:"#f1f5f9",border:"1px solid #e2e8f0",
            borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,color:"#0f172a",flexShrink:0}}>
          ✏️
        </button>

        <button onClick={()=>{
            setEditMode(em=>{
              const next=!em;
              if(next){ // entro in modifica: tutti i calendari selezionati restano visibili,
                        // scelgo come "attivo per l'editing" quello già attivo se è tra i selezionati, altrimenti il primo
                const attivoValido = calId && selectedCalIds.includes(calId);
                const scelto = attivoValido ? calId : (selectedCalIds[0]||calId||null);
                setCalId(scelto);
                if(scelto && !selectedCalIds.includes(scelto)) setSelectedCalIds(prev=>[...prev, scelto]);
              }
              return next;
            });
          }}
          title={editMode?"Modifica attiva — tocca per tornare alla sola consultazione":"Consultazione multipla — tocca per modificare (gli altri calendari restano visibili)"}
          style={{background:editMode?"#0f172a":"#f1f5f9",
            border:`1.5px solid ${editMode?"#0f172a":"#e2e8f0"}`,
            borderRadius:20,padding:"2px 10px",cursor:"pointer",flexShrink:0}}>
          <span style={{color:editMode?"#ffffff":"#0f172a",fontSize:11,fontWeight:800}}>M</span>
        </button>
        <button onClick={async()=>{
          setBanner("⏳ Svuotamento cache...");
          clearLocalStorageCache();
          try {
            if("caches" in window){
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(name=>caches.delete(name)));
            }
          } catch(e){ segnalaErrore(e, "Svuotamento cache (Service Worker)"); }
          try {
            if("serviceWorker" in navigator){
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r=>r.unregister()));
            }
          } catch(e){ segnalaErrore(e, "Disattivazione Service Worker"); }
          window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }}
          title="Svuota cache e ricarica tutto"
          style={{background:"#f1f5f9",border:"1px solid #e2e8f0",
            borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,color:"#0f172a",flexShrink:0}}>
          🔄
        </button>

        <button onClick={()=>{
          const next = syncMode==='on'?'off':'on';
          setSyncMode(next);
          localStorage.setItem('syncMode', next);
        }} style={{background:"#f1f5f9",border:"1px solid #e2e8f0",
          borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:800,color:"#0f172a",flexShrink:0}}>
          {syncMode==='on'?(isOnline?'🟢 SYNC':'🔴 OFFLINE'):'⏸️ SYNC OFF'}
        </button>
      </div>
      <div style={{background:"#ffffff",display:"flex",alignItems:"center",
        gap:5,padding:"4px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0,
        borderBottom:"1px solid #e2e8f0"}}>
        {store.calendars.length===0
          ? <span style={{color:"rgba(15,23,42,0.6)",fontSize:10,fontStyle:"italic"}}>→ Impostazioni</span>
          : store.calendars.map(c=>{
            const visibile = selectedCalIds.includes(c.id);
            const attivoEdit = editMode && calId===c.id;
            return (
            <button key={c.id} onClick={()=>{
                if(editMode){
                  setCalId(c.id);
                  setSelectedCalIds(prev=> prev.includes(c.id) ? prev : [...prev, c.id]); // resta visibile, non toglie gli altri
                  return;
                }
                setSelectedCalIds(prev=> prev.includes(c.id) ? prev.filter(id=>id!==c.id) : [...prev, c.id]);
              }}
              title={editMode?`Tocca per rendere "${c.name}" il calendario attivo per la modifica`:undefined}
              style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,cursor:"pointer",
                background:visibile?"#f1f5f9":"#ffffff",
                border:`1.5px solid ${attivoEdit?"#0f172a":(visibile?"#94a3b8":"#e2e8f0")}`,
                boxShadow:attivoEdit?"0 0 0 2px rgba(15,23,42,0.15)":"none",
                borderRadius:20,padding:"2px 8px 2px 5px"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:c.color,border:"1px solid rgba(15,23,42,0.15)"}}/>
              <span style={{color:"#0f172a",fontSize:12,fontWeight:attivoEdit?900:700}}>{c.name}</span>
              {attivoEdit&&<span style={{color:"#0f172a",fontSize:9}}>✏️</span>}
              {c.isMain&&<span style={{color:"rgba(15,23,42,0.6)",fontSize:8}}>★</span>}
            </button>
            );})
        }
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
        background: !isOnline ? "#ef4444" : (editMode?T.s2:"#ffffff"),
        borderBottom:`1px solid ${!isOnline ? "#b91c1c" : (editMode?T.border:"#000000")}`,flexShrink:0}}>
        {DAYS.map((d,i)=>(
          <div key={i} style={{textAlign:"center",fontSize:9,fontWeight:800,
            padding:"3px 0",color: !isOnline ? "#ffffff" : (i===6?"#ef4444":(editMode?T.sub:"#0f172a"))}}>{d}</div>
        ))}
      </div>
      {!isOnline && (
        <div style={{textAlign:"center",fontSize:9,fontWeight:800,color:"#ffffff",background:"#b91c1c",padding:"2px 0",flexShrink:0}}>
          📴 OFFLINE — le modifiche verranno sincronizzate al ritorno della connessione
        </div>
      )}
      <div style={{position:"relative",flex:1,overflow:"hidden",minHeight:0}}>
      {prevGrid&&(()=>{
        const pTotalDays=daysInMonth(prevGrid.year,prevGrid.month);
        const pFd=firstDay(prevGrid.year,prevGrid.month);
        const pCells=[...Array(pFd).fill(null), ...Array.from({length:pTotalDays},(_,i)=>i+1)];
        return (
          <div key={"prev-"+prevGrid.month+"-"+prevGrid.year}
            className={`calSlideOut${prevGrid.dir==="next"?"Left":"Right"}`}
            style={{position:"absolute",inset:0,display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
              gridAutoRows:"minmax(54px,1fr)",gap:"1px 0px",background:T.gap,
              animation:`calSlideOut${prevGrid.dir==="next"?"Left":"Right"} 0.35s ease forwards`}}>
            {pCells.map((d,i)=>{
              if(!d) return <div key={i} style={{background:T.bg}}/>;
              const key=dkey(prevGrid.year,prevGrid.month,d);
              const evts=allEvts(key);
              const ds=dots(key);
              const isSun=(i%7)===6;
              const isH=isRed(d,prevGrid.month);
              const red=isSun||isH;
              return (
                <div key={i} style={{background:redBg(isSun,isH)||T.surface,
                  display:"flex",flexDirection:"column",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:2,padding:"2px 3px 0",flexShrink:0}}>
                    <span style={{fontSize:20,fontWeight:500,lineHeight:1,color:red?"#ef4444":T.sub}}>{d}</span>
                    <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                      {evts.length>5&&<span style={{fontSize:11,fontWeight:800,color:T.sub}}>+{evts.length-5}</span>}
                    </div>
                  </div>
                  <div style={{flex:1,overflow:"hidden",display:"grid",gridTemplateRows:"repeat(5,1fr)",gap:"1px",padding:"0 1px 1px"}}>
                    {evts.slice(0,5).map((e,ei)=>(
                      <div key={e.id+ei} style={{background:e.color,borderRadius:3,padding:"0 4px",
                        fontSize:evtFontSize,fontWeight:800,color:getContrastTextColor(e.color),overflow:"hidden",textOverflow:"ellipsis",
                        whiteSpace:"nowrap",display:"flex",alignItems:"center",lineHeight:1,
                        textShadow:getContrastTextColor(e.color)==="#ffffff"?"0 1px 2px rgba(0,0,0,0.35)":"none"}}>{e.label}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
      <div key={month+"-"+year}
        className={prevGrid?`calSlideIn${prevGrid.dir==="next"?"Left":"Right"}`:""}
        style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
        gridAutoRows:"minmax(54px,1fr)",gap:"1px 0px",background:T.gap,
        position:prevGrid?"absolute":"relative",inset:0,height:"100%",
        animation:prevGrid?`calSlideIn${prevGrid.dir==="next"?"Left":"Right"} 0.35s ease forwards`:"none"}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={i} style={{background:T.bg}}/>;
          const key=dkey(year,month,d);
          const evts=allEvts(key);
          const ds=dots(key);
          const isT=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
          const isSun=(i%7)===6;
          const isH=isRed(d,month);
          const red=isSun||isH;
          return (
            <div key={i} onClick={()=>{
                if(!editMode && selectedCalIds.length>1){ setDayKey(key); setForm(null); setPal(null); return; } // sola consultazione, niente form
                if(quickModeModello){ applyQuickModello(key); return; }
                setDayKey(key); setForm(null); setPal(null);
              }}
              style={{background:isT?(dark?"#1a2f50":"#dbeafe"):(redBg(isSun,isH)||T.surface),
                cursor:"pointer",display:"flex",flexDirection:"column",overflow:"hidden",
                borderTop:"none"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:2,padding:"2px 3px 0",flexShrink:0}}>
                <span style={{fontSize:20,fontWeight:isT?900:500,lineHeight:1,
                  color:isT?accent:red?"#ef4444":T.sub}}>{d}</span>
                <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                  {evts.length>5&&<span style={{fontSize:11,fontWeight:800,color:T.sub}}>+{evts.length-5}</span>}
                </div>
              </div>
              <div style={{flex:1,overflow:"hidden",display:"grid",
                gridTemplateRows:`repeat(5,1fr)`,
                gap:"1px",padding:"0 1px 1px"}}>
                {evts.slice(0,5).map((e,ei)=>{
                  return (
                    <Fragment key={e.id+ei}>
                      <div style={{background:e.color,borderRadius:3,padding:"0 4px",
                        fontSize:evtFontSize,fontWeight:800,color:getContrastTextColor(e.color),overflow:"hidden",textOverflow:"ellipsis",
                        whiteSpace:"nowrap",display:"flex",alignItems:"center",lineHeight:1,
                        textShadow:getContrastTextColor(e.color)==="#ffffff"?"0 1px 2px rgba(0,0,0,0.35)":"none"}}>
                        {e.label}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );

  const range = getReportRange();
  const indennitaCalc = computeIndennita();

  function renderReportCard(r){
    const isOpen = openReportConfig===r.id;
    const cfg = getConteggioConfig(r.id, r.type);
    // "ore_turno" somma minuti (computeMinutiForReport), tutti gli altri
    // tipi contano eventi (computeConteggioForReport) come prima.
    const data = r.type==="ore_turno" ? computeMinutiForReport(cfg) : computeConteggioForReport(cfg);
    const pct = totaleTurni>0 ? Math.round((data.totale/totaleTurni)*100) : 0;

    return (
      <div key={r.id}>
        <div style={{display:"flex",alignItems:"center",padding:"12px 14px",
          borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}
          onClick={()=>setOpenReportConfig(isOpen?null:r.id)}>
          <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questo report?"))removeReport(r.id);}}
            style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
              background:"#ef4444",color:"#fff",fontSize:16,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
            –
          </button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:22,fontWeight:700,color:T.text,overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
            {r.type==="conteggio_turni"&&(
              <div style={{fontSize:17,color:T.sub}}>{data.totale} turni</div>
            )}
            {r.type==="ore_turno"&&(
              <div style={{fontSize:17,color:T.sub}}>{fmtOreMin(data.totaleMin)}</div>
            )}
            {r.type==="storno_recupero"&&(
              <div style={{fontSize:17,color:T.sub}}>{fmtOreMin(computeStornoRecupero().creditoResiduoTotale)} credito residuo</div>
            )}
          </div>
          <div style={{display:"flex",flexDirection:"row",gap:10,marginRight:10,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"up");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▲</button>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"down");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▼</button>
          </div>
          <span style={{color:T.sub,fontSize:12}}>›</span>
        </div>
        {isOpen && (
          <div style={{background:T.s2,padding:14,borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
              <button onClick={()=>setShowReportModelliPicker(r.id)}
                style={{display:"flex",alignItems:"center",gap:6,background:"#ffffff",
                  border:`1px solid ${T.border}`,borderRadius:20,padding:"6px 12px",
                  fontSize:14,fontWeight:700,color:"#0f172a",cursor:"pointer"}}>
                📋 Filtra modelli
                {(()=>{
                  const count = r.type==="turnazione"
                    ? [...modelli.filter(m=>isModelloTurnazioneDefault(m)&&!(cfg.modelliEsclusi||[]).includes(m.id)).map(m=>m.id), ...(cfg.modelliAggiunti||[])].length
                    : (cfg.modelliInclusi||[]).length;
                  return count>0&&(
                    <span style={{background:"#ffffff",color:"#0f172a",border:"1px solid #cbd5e1",borderRadius:10,
                      padding:"1px 7px",fontSize:13,fontWeight:800}}>{count}</span>
                  );
                })()}
              </button>
            </div>
            {r.type==="conteggio_turni" && (
              <ConteggioConfigCard T={T} r={r} cfg={cfg} data={data} totaleTurni={totaleTurni}
                modelli={modelli} accent={accent} fasceAutomatiche={fasceAutomatiche}
                onRename={label=>renameReport(r.id, label)}
                onUpdateCfg={newCfg=>updateConteggioConfig(r.id, newCfg)}
                onGoToModelli={()=>setScreen("modelli")}/>
            )}
            {r.type==="turnazione" && (()=>{
              const modelliFiltratiPerCal = reportCalIds.length>0
                ? modelli.filter(m=>!m.calendarId || reportCalIds.includes(m.calendarId))
                : modelli;
              const modelliOrdinatiFiltratiPerCal = reportCalIds.length>0
                ? modelliOrdinati.filter(m=>!m.calendarId || reportCalIds.includes(m.calendarId))
                : modelliOrdinati;
              return (
                <TurnazioneConfigCard T={T} r={r} cfg={cfg} data={computeTurnazioneForReport(cfg)}
                  modelli={modelliFiltratiPerCal} modelliOrdinati={modelliOrdinatiFiltratiPerCal} accent={accent} fasceAutomatiche={fasceAutomatiche}
                  onRename={label=>renameReport(r.id, label)}
                  onUpdateCfg={newCfg=>updateConteggioConfig(r.id, newCfg)}/>
              );
            })()}
            {r.type==="indennita" && (
              <IndennitaConfig T={T} values={indennita} setValues={setIndennita}
                calc={computeIndennita(cfg.modelliInclusi||[])} onSave={()=>saveSettings({indennita})}/>
            )}
            {r.type==="ore_turno" && (
              <OreTurnoConfigCard T={T} r={r} cfg={cfg} data={data} totaleMinPeriodo={totaleMinTurni}
                modelli={modelli} accent={accent} fasceAutomatiche={fasceAutomatiche}
                onRename={label=>renameReport(r.id, label)}
                onUpdateCfg={newCfg=>updateConteggioConfig(r.id, newCfg)}/>
            )}
            {r.type==="straordinari" && <StraordinariView T={T} data={data} store={store} reportRange={{from:range.from,to:range.to}} modelliInclusi={cfg.modelliInclusi||[]} reportCalIds={reportCalIds}/>}
            {r.type==="storno_recupero" && <StornoRecuperoView T={T} storno={computeStornoRecupero()} store={store} modelli={modelli}/>}
            {r.type==="guadagni" && (
              <GuadagniView T={T} indennita={indennita} calc={computeIndennita(cfg.modelliInclusi||[])}/>
            )}
          </div>
        )}
      </div>
    );
  }

  const reportView = (
    <div style={{flex:1,overflowY:"auto",padding:"0 0 80px",color:T.text}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"16px 16px 8px"}}>
        <div style={{fontSize:22,fontWeight:900,fontFamily:"Georgia,serif"}}>Report</div>
        <button onClick={()=>setShowIntervalPicker(true)}
          style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:20,
            padding:"5px 14px",fontSize:14,fontWeight:700,color:"#0f172a",cursor:"pointer"}}>
          {range.label} ▾
        </button>
      </div>

      {store.calendars.length>0 && (
        <div style={{display:"flex",alignItems:"center",gap:5,padding:"0 12px 10px",
          overflowX:"auto",scrollbarWidth:"none"}}>
          {store.calendars.map(c=>{
            const attivo = reportCalIds.length===0 || reportCalIds.includes(c.id);
            return (
              <button key={c.id} onClick={()=>{
                  setReportCalIds(prev=>{
                    if(prev.length===0) return [c.id];
                    const next = prev.includes(c.id) ? prev.filter(id=>id!==c.id) : [...prev, c.id];
                    return next.length===store.calendars.length ? [] : next;
                  });
                }}
                style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,cursor:"pointer",
                  background:attivo?(T.dark?"rgba(255,255,255,0.15)":T.s2):"transparent",
                  border:`1.5px solid ${attivo?accent:T.border}`,
                  borderRadius:20,padding:"3px 9px 3px 6px"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:c.color}}/>
                <span style={{color:attivo?T.text:T.sub,fontSize:12,fontWeight:700}}>{c.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {activeReports.length>0 && (
        <div style={{margin:"8px 12px"}}>
          <div style={{fontSize:13,color:"#0f172a",fontWeight:700,marginBottom:6,paddingLeft:4}}>Report attivi</div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            {activeReports.map(r=>renderReportCard(r))}
          </div>
        </div>
      )}

      {(()=>{
        const isAddOpen = openReportConfig==='__add__';
        return (
          <div style={{margin:"16px 12px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:6,paddingLeft:4,cursor:"pointer"}}
              onClick={()=>setOpenReportConfig(isAddOpen?null:'__add__')}>
              <div style={{fontSize:13,color:"#0f172a",fontWeight:700}}>Aggiungi report</div>
              <span style={{color:T.sub,fontSize:12}}>{isAddOpen?"▲":"▼"}</span>
            </div>
            {isAddOpen&&(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                {REPORT_TEMPLATES.map((tmpl,i,arr)=>(
                  <div key={tmpl.type} style={{display:"flex",alignItems:"center",padding:"12px 14px",
                    borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <button onClick={()=>{addReport(tmpl.type);setOpenReportConfig(null);}}
                      style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
                        background:"#22c55e",color:"#fff",fontSize:18,fontWeight:700,
                        display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
                      +
                    </button>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:T.text}}>{tmpl.label}</div>
                      <div style={{fontSize:11,color:T.sub}}>{tmpl.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {showMeseReportPicker && (()=>{
        // Picker rapido mese/anno: un tap sceglie il mese direttamente,
        // invece di scorrere un mese alla volta con le frecce. L'anno si
        // cambia con ‹ › sopra la griglia dei 12 mesi.
        const annoTmp = reportMeseSel.anno;
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:410,
            display:"flex",alignItems:"flex-end"}} onClick={()=>setShowMeseReportPicker(false)}>
            <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
              maxWidth:480,margin:"0 auto",padding:"16px 14px 30px"}}
              onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <button onClick={()=>selezionaReportMese(annoTmp-1, reportMeseSel.mese)}
                  style={{width:34,height:34,borderRadius:8,border:`1px solid ${T.border}`,
                    background:T.s2,color:T.text,fontSize:15,fontWeight:800,cursor:"pointer"}}>‹</button>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>{annoTmp}</div>
                <button onClick={()=>selezionaReportMese(annoTmp+1, reportMeseSel.mese)}
                  style={{width:34,height:34,borderRadius:8,border:`1px solid ${T.border}`,
                    background:T.s2,color:T.text,fontSize:15,fontWeight:800,cursor:"pointer"}}>›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {MONTHS.map((nomeMese,idx)=>{
                  const meseNum = idx+1;
                  const selezionato = reportMeseSel.mese===meseNum && reportMeseSel.anno===annoTmp;
                  return (
                    <button key={nomeMese}
                      onClick={()=>{ selezionaReportMese(annoTmp, meseNum); setShowMeseReportPicker(false); }}
                      style={{padding:"12px 0",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:800,
                        border:`1px solid ${selezionato?accent:T.border}`,
                        background:selezionato?accent:T.s2,
                        color:selezionato?getContrastTextColor(accent):T.text}}>
                      {nomeMese.slice(0,3)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {showIntervalPicker && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:400,
          display:"flex",alignItems:"flex-end"}} onClick={()=>setShowIntervalPicker(false)}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",padding:"16px 14px 40px"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:900,marginBottom:14,color:T.text}}>Intervallo</div>
            <div style={{background:T.s2,borderRadius:14,overflow:"hidden",border:`1px solid ${T.border}`}}>
              {[["mese","1 mese"],["anno","1 anno"],["custom","Intervallo personalizzato"]].map(([v,l])=>(
                <div key={v} onClick={()=>{setReportInterval(v);if(v!=="custom")setShowIntervalPicker(false);}}
                  style={{display:"flex",alignItems:"center",padding:"14px 16px",
                    borderBottom:`1px solid ${T.border}`,cursor:"pointer",
                    background:reportInterval===v?accent+"15":"transparent"}}>
                  {reportInterval===v&&<span style={{color:accent,marginRight:10,fontSize:14}}>✓</span>}
                  <span style={{flex:1,fontSize:14,fontWeight:reportInterval===v?700:400,
                    color:reportInterval===v?accent:T.text}}>{l}</span>
                </div>
              ))}
            </div>
            {reportInterval==="mese" && (
              <div style={{marginTop:12}}>
                <div style={{fontSize:12,color:"#0f172a",marginBottom:6}}>MESE SELEZIONATO</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>{
                      let {anno,mese}=reportMeseSel; mese--; if(mese<1){mese=12;anno--;}
                      selezionaReportMese(anno,mese);
                    }}
                    style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,
                      background:T.s2,color:T.text,fontSize:16,fontWeight:800,cursor:"pointer",flexShrink:0}}>‹</button>
                  <button onClick={()=>setShowMeseReportPicker(true)}
                    style={{flex:1,background:accent+"18",border:`1px solid ${accent}55`,borderRadius:8,
                      padding:"9px 0",color:accent,fontSize:14,fontWeight:800,cursor:"pointer"}}>
                    {MONTHS[reportMeseSel.mese-1]} {reportMeseSel.anno}
                  </button>
                  <button onClick={()=>{
                      let {anno,mese}=reportMeseSel; mese++; if(mese>12){mese=1;anno++;}
                      selezionaReportMese(anno,mese);
                    }}
                    style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,
                      background:T.s2,color:T.text,fontSize:16,fontWeight:800,cursor:"pointer",flexShrink:0}}>›</button>
                </div>
              </div>
            )}
            {reportInterval==="anno" && (
              <div style={{marginTop:12}}>
                <div style={{fontSize:12,color:"#0f172a",marginBottom:6}}>ANNO SELEZIONATO</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>selezionaReportMese(reportMeseSel.anno-1, reportMeseSel.mese)}
                    style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,
                      background:T.s2,color:T.text,fontSize:16,fontWeight:800,cursor:"pointer",flexShrink:0}}>‹</button>
                  <div style={{flex:1,background:accent+"18",border:`1px solid ${accent}55`,borderRadius:8,
                    padding:"9px 0",color:accent,fontSize:14,fontWeight:800,textAlign:"center"}}>
                    {reportMeseSel.anno}
                  </div>
                  <button onClick={()=>selezionaReportMese(reportMeseSel.anno+1, reportMeseSel.mese)}
                    style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,
                      background:T.s2,color:T.text,fontSize:16,fontWeight:800,cursor:"pointer",flexShrink:0}}>›</button>
                </div>
              </div>
            )}
            {reportInterval==="custom" && (
              <div style={{marginTop:12}}>
                <div style={{display:"flex",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,color:"#0f172a",marginBottom:4}}>DA</div>
                    <input type="date" value={reportDateFrom} onChange={e=>setReportDateFrom(e.target.value)}
                      style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
                        borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,color:"#0f172a",marginBottom:4}}>A</div>
                    <input type="date" value={reportDateTo} onChange={e=>setReportDateTo(e.target.value)}
                      style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
                        borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                </div>
                {reportDateFrom&&reportDateTo&&!intervalliSalvati.some(iv=>iv.from===reportDateFrom&&iv.to===reportDateTo)&&(
                  <button onClick={salvaIntervalloCorrente}
                    style={{marginTop:8,background:"none",border:`1px dashed ${T.border}`,borderRadius:8,
                      padding:"6px 10px",color:T.sub,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    ★ Memorizza questo intervallo
                  </button>
                )}
                {intervalliSalvati.length>0 && (()=>{
                  function fmtBreve(d){ if(!d) return ""; const [,m,g]=d.split("-"); return `${g}/${m}`; }
                  return (
                    <div style={{marginTop:10}}>
                      <div style={{fontSize:11,color:"#0f172a",marginBottom:6}}>INTERVALLI SALVATI</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {intervalliSalvati.map(iv=>(
                          <button key={iv.id}
                            onClick={()=>{applicaIntervalloSalvato(iv);setShowIntervalPicker(false);}}
                            style={{display:"flex",alignItems:"center",gap:6,background:T.s2,
                              border:`1px solid ${T.border}`,borderRadius:20,padding:"6px 6px 6px 12px",
                              color:T.text,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                            {fmtBreve(iv.from)} → {fmtBreve(iv.to)}
                            <span onClick={e=>{e.stopPropagation();rimuoviIntervalloSalvato(iv.id);}}
                              style={{color:T.sub,fontSize:13,fontWeight:900,padding:"0 3px"}}>×</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {reportInterval==="custom"&&reportDateFrom&&reportDateTo&&(
              <button onClick={()=>setShowIntervalPicker(false)}
                style={{width:"100%",marginTop:12,background:accent,border:"none",borderRadius:10,
                  color:getContrastTextColor(accent),padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:13}}>
                Conferma
              </button>
            )}
          </div>
        </div>
      )}
      {showReportModelliPicker&&(()=>{
        const reportId = showReportModelliPicker;
        const reportType = (store.reports||[]).find(rr=>rr.id===reportId)?.type;
        const cfg = getConteggioConfig(reportId, reportType);
        const isTurnazione = reportType==="turnazione";
        const esclusi = cfg.modelliEsclusi||[];
        const aggiunti = cfg.modelliAggiunti||[];
        const inclusi = isTurnazione
          ? [...modelli.filter(m=>isModelloTurnazioneDefault(m)&&!esclusi.includes(m.id)).map(m=>m.id), ...aggiunti]
          : (cfg.modelliInclusi||[]);
        // Calendari da mostrare nel picker: quelli già selezionati per il report,
        // più eventuali calendari extra scelti manualmente qui (cfg.calendariExtra)
        const calendariExtra = cfg.calendariExtra||[];
        const calendariBase = reportCalIds.length>0 ? reportCalIds : store.calendars.map(c=>c.id);
        const calendariAttivi = [...new Set([...calendariBase, ...calendariExtra])];
        function toggleCalendarioExtra(cid){
          const inBase = calendariBase.includes(cid);
          if(inBase){
            // è già incluso dal filtro report principale: non si può togliere da qui
            return;
          }
          const next = calendariExtra.includes(cid)
            ? calendariExtra.filter(id=>id!==cid)
            : [...calendariExtra, cid];
          updateConteggioConfig(reportId, {...cfg, calendariExtra: next});
        }
        const gruppiPerCalendario = store.calendars
          .filter(c=>calendariAttivi.includes(c.id))
          .map(c=>({
            cal: c,
            modelli: modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===c.id),
          }))
          .filter(g=>g.modelli.length>0);
        function toggleModello(m){
          if(!isTurnazione){
            const selezionato = (cfg.modelliInclusi||[]).includes(m.id);
            const next = selezionato ? (cfg.modelliInclusi||[]).filter(id=>id!==m.id) : [...(cfg.modelliInclusi||[]), m.id];
            updateConteggioConfig(reportId, {...cfg, modelliInclusi: next});
            return;
          }
          if(isModelloTurnazioneDefault(m)){
            const attualmenteIncluso = !esclusi.includes(m.id);
            const nextEsclusi = attualmenteIncluso ? [...esclusi, m.id] : esclusi.filter(id=>id!==m.id);
            updateConteggioConfig(reportId, {...cfg, modelliEsclusi: nextEsclusi});
          } else {
            const attualmenteIncluso = aggiunti.includes(m.id);
            const nextAggiunti = attualmenteIncluso ? aggiunti.filter(id=>id!==m.id) : [...aggiunti, m.id];
            updateConteggioConfig(reportId, {...cfg, modelliAggiunti: nextAggiunti});
          }
        }
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:600,
            display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
              <button onClick={()=>setShowReportModelliPicker(null)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>Filtra modelli</div>
              <div style={{width:32}}/>
            </div>
            <div style={{padding:"10px 16px",fontSize:12,color:T.sub,background:T.s2}}>
              Nessuna selezione = tutti i modelli inclusi nel calcolo di questo report.
            </div>
            {store.calendars.length>1&&(
              <div style={{padding:"10px 16px",background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>
                  CALENDARI INCLUSI (aggiungine altri oltre a quelli già selezionati nel Report)
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {store.calendars.map(c=>{
                    const inBase = calendariBase.includes(c.id);
                    const attivo = calendariAttivi.includes(c.id);
                    return (
                      <button key={c.id} onClick={()=>toggleCalendarioExtra(c.id)}
                        title={inBase?"Già incluso dal filtro calendari del Report":"Tocca per includere/escludere solo in questo filtro"}
                        style={{display:"flex",alignItems:"center",gap:5,cursor:inBase?"default":"pointer",
                          background:attivo?"#eab308":T.s2,
                          border:`1.5px solid ${attivo?"#eab308":T.border}`,
                          borderRadius:20,padding:"4px 10px 4px 6px",opacity:inBase?0.85:1}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:c.color}}/>
                        <span style={{color:attivo?"#0f172a":T.text,fontSize:12,fontWeight:700}}>{c.name}</span>
                        {inBase&&<span style={{color:"#0f172a",fontSize:9}}>★</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
              {modelli.length===0?(
                <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>Nessun modello creato ancora.</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {!isTurnazione&&(
                    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                      <div onClick={()=>updateConteggioConfig(reportId, {...cfg, modelliInclusi:[]})}
                        style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                        <div style={{width:20,height:20,borderRadius:6,marginRight:12,flexShrink:0,
                          border:`2px solid ${inclusi.length===0?accent:T.border}`,
                          background:inclusi.length===0?accent:"transparent",
                          display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {inclusi.length===0&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
                        </div>
                        <span style={{fontSize:15,fontWeight:700,color:T.text}}>Tutti i modelli</span>
                      </div>
                    </div>
                  )}
                  {gruppiPerCalendario.map(({cal, modelli:modelliCal})=>(
                    <div key={cal.id}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,paddingLeft:2}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:cal.color}}/>
                        <span style={{fontSize:12,fontWeight:800,color:T.sub,textTransform:"uppercase"}}>{cal.name}</span>
                      </div>
                      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                        {modelliCal.map((m,i,arr)=>{
                          const selezionato = inclusi.includes(m.id);
                          const colore = m.coloreCustom||colByTime(m.inizio);
                          return (
                            <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                              <div onClick={()=>toggleModello(m)}
                                style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                                <div style={{width:20,height:20,borderRadius:6,marginRight:12,flexShrink:0,
                                  border:`2px solid ${selezionato?colore:T.border}`,
                                  background:selezionato?colore:"transparent",
                                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  {selezionato&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
                                </div>
                                <div style={{width:10,height:10,borderRadius:"50%",background:colore,marginRight:10,flexShrink:0}}/>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:15,fontWeight:700,color:T.text}}>{m.titolo||"Senza nome"}</div>
                                  <div style={{fontSize:11,color:T.sub}}>
                                    {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.fine?` - ${m.fine}`:""}`:""}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{padding:12,borderTop:`1px solid ${T.border}`,background:T.surface}}>
              <button onClick={()=>setShowReportModelliPicker(null)}
                style={{width:"100%",background:accent,border:"none",borderRadius:10,
                  color:getContrastTextColor(accent),padding:"12px 0",cursor:"pointer",fontWeight:800,fontSize:14}}>
                Fatto
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );

  return { calView, reportView, goPrevMonth, goNextMonth };
}

    
