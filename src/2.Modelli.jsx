    import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import {
  MONTHS, DAYS, PALETTE, FONT_SIZE, NB, COLORE_H24, NOMI_MESI_IT,
  FASCE_AUTOMATICHE_DEFAULT, FESTIVITA_DEFAULT_ATTIVE,
  getContrastTextColor, daysInMonth, firstDay, fmtDataIT, dkey, uid,
  oraInMinuti, calcFine6h15, calcFine6h30, calcFineModello, calcDurata,
  isModelloTurnazioneDefault, withEventoAggiunto, saveToLocalStorage,
  loadFromLocalStorage, clearLocalStorageCache, resolveFestivitaCatalogo,
  leggiLogErrori, leggiErroriSilenziati, impostaSilenziamentoErrore,
  cancellaLogErrori, segnalaErrore,
} from "./4.Rotazione";
import { CalBadge, SmartTimeInput, AutocompleteInput, ColorPickerModal,
  ModaleErroriMultipli, FasceExpand, ConteggioConfigCard, TurnazioneConfigCard,
  IndennitaConfig, OrePerTurnoView, StraordinariView, GuadagniView, Sec, SecCollapsible } from "./5.Comuni";
import { ModelloCard, ModelForm, RotazioneCard, RotazioneForm, ModelloSelector,
  GrigliaRotazione, NLRSScalanteView, DomenicheView, NLRSView } from "./4.Rotazione";
import { ImportaTurniJsonDialog, ImportaFotoDialog } from "./7.Turni";

// Riga della lista Colori: mostra il pallino colore, etichetta, sottotitolo,
// contatore di modelli che lo usano e (se applicabile) un pulsante per rimuoverlo.
function ColorRow({ T, hex, label, sub, count, onClick, onRemove }) {
  return (
    <div onClick={onClick}
      style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",cursor:"pointer"}}>
      <div style={{width:26,height:26,borderRadius:"50%",background:hex,
        border:`2px solid ${T.border}`,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:T.text,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:T.sub,marginTop:1}}>{sub}</div>}
      </div>
      {typeof count==="number"&&count>0&&(
        <span style={{fontSize:11,fontWeight:700,color:T.sub,background:T.s2,
          borderRadius:10,padding:"2px 8px",flexShrink:0}}>{count}</span>
      )}
      {onRemove&&(
        <button onClick={(e)=>{e.stopPropagation();onRemove();}}
          style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",
            fontSize:18,padding:"0 4px",flexShrink:0}}>×</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// core2.jsx — Modelli, Rotazioni e Impostazioni: qui dentro trovi
// tutto quello che riguarda la VISTA MODELLI (turni, rotazioni),
// la VISTA IMPOSTAZIONI, il popup del singolo giorno (Day Modal)
// e il popup dei dati salvati su Supabase (DB Modal).
//
// Riceve tutto lo stato/logica dell'app tramite la prop C
// (l'oggetto restituito da useAppCore, in useAppCore.js).
//
// Per modificare: modelli di turno, rotazioni, impostazioni, il
// popup del giorno o il popup dati Supabase → qui.
// Per aggiungere nuovo stato condiviso → useAppCore.js.
// ═══════════════════════════════════════════════════════════════

export default function VistaModelli({ C }){
  const {
    today, tipoModelloProtrazione, computeStornoRecupero, store, setStore, loading, setLoading, year,
    ripristinaModelliMancanti, ripristinoInCorso, setRipristinoInCorso, ripristinoEsito, setRipristinoEsito,
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
    setReportDateFrom, reportDateTo, setReportDateTo, openReportConfig, setOpenReportConfig, showIntervalPicker,
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
    computeTurnazioneForReport, computeConteggio, computeIndennita, activeReports, inactiveTypes, addReport,
    removeReport, renameReport, moveReport, getConteggioConfig, updateConteggioConfig, totaleTurni,
    setPrevGrid, REPORT_TEMPLATES, calcolaOrdineModelli, updateFascia, session,
  } = C;

  const modelliView = (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      {(()=>{
        const calAttivo = store.calendars.find(c=>c.id===calId);
        const nomeCal = calId===null ? "TUTTI" : (calAttivo?.name||"Calendario");
        const coloreCal = calAttivo?.color||accent;
        function hexToRgb(hex){
          const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
          return {r,g,b};
        }
        function luminance({r,g,b}){
          const a=[r,g,b].map(v=>{ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); });
          return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
        }
        function contrastColor(hex){
          try {
            const rgb=hexToRgb(hex);
            const lum=luminance(rgb);
            return lum < 0.35 ? "#ffffff" : "#0f172a";
          } catch(e){ return "#ffffff"; }
        }
        const testoContrasto = calId===null ? T.text : contrastColor(coloreCal);
        return (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 8px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:24,fontWeight:900,fontFamily:"Georgia,serif",color:T.text}}>Modelli</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",position:"relative"}}>
              {modelliTab==="turni"&&(
              <button onClick={()=>{ setModalitaSpostamento(s=>!s); setSelectedModelloIds([]); }}
                title={modalitaSpostamento?"Spostamento attivo — tocca per tornare a scorrere normalmente":"Attiva per trascinare e riordinare i modelli col dito"}
                style={{background:modalitaSpostamento?accent:T.s2,
                  border:`1.5px solid ${modalitaSpostamento?accent:T.border}`,borderRadius:8,
                  padding:"6px 10px",fontSize:18,fontWeight:700,cursor:"pointer",
                  color:modalitaSpostamento?"#fff":T.sub,
                  transition:"background 0.12s ease, border-color 0.12s ease"}}>↑↓</button>
              )}
              <button onClick={()=>{
                let dati, nomeFile;
                if(modelliTab==="turni"){
                  dati = modelli;
                  nomeFile = "modelli_turni.json";
                } else if(modelliTab==="rotazioni"){
                  dati = rotazioni;
                  nomeFile = "modelli_rotazioni.json";
                } else {
                  dati = coloriExtra;
                  nomeFile = "modelli_colori.json";
                }
                const blob = new Blob([JSON.stringify(dati,null,2)], {type:"application/json"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = nomeFile;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
                title="Scarica i dati di questa pagina"
                style={{background:T.s2,border:`1.5px solid ${T.border}`,borderRadius:8,
                  padding:"6px 10px",fontSize:16,fontWeight:700,cursor:"pointer",
                  color:T.sub}}>⬇</button>
              {modelliTab!=="colori"&&(
              <button onClick={()=>{
                if(modelliTab==="turni"){
                  setEditModello(null);
                  setModelForm({titolo:"",tempo:"6h15",inizio:"",fine:"",coloreCustom:null,posizione:"",calendarId:calId});
                  setOrigineModelForm("lista");
                  setShowModelForm(true);
                } else {
                  setEditRotazione(null);
                  setRotForm({tipo:"personalizzata",titolo:"",dataInizio:"",nSettimane:52,modellaLavoroId:null,modelloNLId:null,modelloRSId:null});
                  setShowRotForm(true);
                }
              }} style={{background:accent,border:"none",borderRadius:8,padding:"6px 16px",
                fontSize:20,fontWeight:800,cursor:"pointer",color:"#1a1a1a"}}>+</button>
              )}
              {showSortMenu&&(
                <div style={{position:"absolute",top:40,right:0,background:T.surface,
                  border:`1px solid ${T.border}`,borderRadius:12,padding:8,zIndex:200,
                  minWidth:190,boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}
                  onClick={e=>e.stopPropagation()}>
                  {[["orario","Ordina per orario"],["manuale","Ordine manuale"]].map(([v,l])=>(
                    <div key={v} onClick={()=>{setModelliSort(v);setShowSortMenu(false);}}
                      style={{padding:"10px 12px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,
                        background:modelliSort===v?accent+"22":"transparent",
                        color:modelliSort===v?accent:T.text}}>
                      {modelliSort===v?"✓  ":"    "}{l}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div style={{display:"flex",margin:"0 12px 12px",background:T.s2,borderRadius:14,padding:4,gap:4}}>
        {[["turni","Turni"],["rotazioni","Rotazioni"],["colori","Colori"]].map(([v,l])=>(
          <button key={v} onClick={()=>setModelliTab(v)}
            style={{flex:1,padding:"9px 0",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:14,
              background:modelliTab===v?(dark?"#0f172a":"#fff"):"transparent",
              color:modelliTab===v?T.text:T.sub,
              boxShadow:modelliTab===v?"0 2px 8px rgba(0,0,0,0.12)":"none"}}>{l}</button>
        ))}
      </div>
      {calId&&(()=>{
        const calAttivo2 = store.calendars.find(c=>c.id===calId);
        const coloreCal2 = calAttivo2?.color||accent;
        function hexToRgb2(hex){
          const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
          return {r,g,b};
        }
        function luminance2({r,g,b}){
          const a=[r,g,b].map(v=>{ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); });
          return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
        }
        function contrastColor2(hex){
          try { return luminance2(hexToRgb2(hex)) < 0.35 ? "#ffffff" : "#0f172a"; }
          catch(e){ return "#ffffff"; }
        }
        const testoContrasto2 = contrastColor2(coloreCal2);
        return (
          <div style={{margin:"0 12px 10px",display:"flex"}}>
            <CalBadge calId={calId} calAttivo={calAttivo2} coloreCal={coloreCal2}
              testoContrasto={testoContrasto2} T={T} store={store} setStore={setStore}
              updateCalendar={updateCalendar} accent={accent} setCalId={setCalId}/>
          </div>
        );
      })()}

      <div ref={modelliScrollRef} style={{flex:1,overflowY:"auto",padding:"0 12px 80px"}}>
        {modelliTab==="turni"&&(()=>{
          const modelliVisibili = calId===null
            ? modelliOrdinati
            : calcolaOrdineModelli(modelli.filter(m=>{
                const mcid = m.calendarId||mainCalId;
                return mcid===calId;
              }));
          return modelliVisibili.length===0?(
            <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
              <div style={{fontSize:36,marginBottom:10}}>📋</div>
              <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessun modello</div>
              <div style={{fontSize:13}}>Premi + per creare il tuo primo modello turno</div>
            </div>
          ):(
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              {modelliVisibili.map((m,i,arr)=>(
                <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                  <ModelloCard m={m} T={T} accent={accent} fasceAutomatiche={fasceAutomatiche}
                    // La modalità selezione multipla (checkbox) resta legata a editMode
                    // (serve per azioni di gruppo, es. eliminazione multipla), ma le
                    // frecce ▲▼ e il drag & drop per il riordino devono essere SEMPRE
                    // disponibili nella lista Modelli, indipendentemente da editMode:
                    // prima erano condizionate allo stesso flag e sparivano di default.
                    selectMode={!editMode&&!modalitaSpostamento}
                    selected={selectedModelloIds.includes(m.id)}
                    onToggleSelect={()=>setSelectedModelloIds(prev=>prev.includes(m.id)?prev.filter(id=>id!==m.id):[...prev,m.id])}
                    onEdit={modalitaSpostamento?(()=>{}):(()=>{ setEditModello(m); setModelForm({
                      ...m,
                      // FIX: prima qui si leggevano m.categoria_app_auto /
                      // m.categoria_turno_vuoto / m.categoria_app_auto_vuoto,
                      // campi snake_case che esistono solo nella riga grezza
                      // di Supabase — sull'oggetto "m" (già mappato in JS,
                      // vedi il mapping più in alto nel file) queste chiavi
                      // sono sempre undefined. Il risultato era che ad ogni
                      // apertura di "Modifica" i tre valori venivano azzerati
                      // subito dopo che "...m" li aveva già portati corretti,
                      // facendo sembrare impossibile selezionare o mantenere
                      // una categoria APP/AUTO o TURNO. "...m" da solo porta
                      // già m.categoria, m.categoriaAppAuto, m.turnoVuoto e
                      // m.appAutoVuoto nel formato giusto: non serve altro.
                    }); setOrigineModelForm("lista"); setShowModelForm(true); })}
                    onDelete={()=>deleteModello(m.id)}
                    // Frecce ▲▼: sempre disponibili, spostano di UNA posizione
                    // nell'elenco realmente visibile (modelliVisibili, filtrato
                    // per calendario se un calendario specifico è selezionato).
                    onMoveUp={modalitaSpostamento&&i>0?()=>moveH24(m.id,"up",calId):null}
                    onMoveDown={modalitaSpostamento&&i<arr.length-1?()=>moveH24(m.id,"down",calId):null}
                    // Drag & drop: sempre disponibile, per spostamenti più ampi.
                    isDragging={draggingId===m.id}
                    isDropTarget={dragOverId===m.id && draggingId!==m.id}
                    onTouchStart={modalitaSpostamento?()=>{ touchSrcId.current=m.id; setDraggingId(m.id); }:null}
                    onTouchMove={modalitaSpostamento?(e)=>{
                      e.preventDefault();
                      const t=e.touches[0];
                      updateAutoScroll(t.clientY);
                      const el=document.elementFromPoint(t.clientX,t.clientY);
                      const card=el?.closest("[data-modello-id]");
                      if(card){
                        const id=card.getAttribute("data-modello-id");
                        touchTargetId.current=id;
                        if(dragOverId!==id) setDragOverId(id);
                      }
                    }:null}
                    onTouchEnd={modalitaSpostamento?async()=>{
                      stopAutoScroll();
                      await reorderModelli(touchSrcId.current, touchTargetId.current, calId);
                      touchSrcId.current=null; touchTargetId.current=null;
                      setDraggingId(null); setDragOverId(null);
                    }:null}
                    // Il drag col mouse (HTML5 drag&drop nativo) è notoriamente
                    // inaffidabile nel calcolare "su quale card sto passando" quando
                    // si aggiorna lo state ad ogni dragover su liste con molte righe:
                    // gli eventi possono arrivare fuori ordine o essere persi durante
                    // i re-render, causando drop sulla card sbagliata ("a casaccio").
                    // Soluzione: uso la stessa tecnica del touch — leggo le coordinate
                    // del cursore e trovo la card realmente sotto il puntatore con
                    // elementFromPoint, invece di fidarmi di quale card ha generato
                    // l'evento onDragOver/onDrop. Così mouse e touch condividono
                    // esattamente la stessa logica di targeting, niente più divergenze.
                    onDragStart={(e)=>{
                      dragSrcId.current=m.id;
                      dragTargetId.current=m.id;
                      setDraggingId(m.id);
                      if(e?.dataTransfer){ e.dataTransfer.effectAllowed="move"; try{e.dataTransfer.setData("text/plain",m.id);}catch(_){} }
                    }}
                    onDragOver={(e)=>{
                      e.preventDefault();
                      updateAutoScroll(e.clientY);
                      const el=document.elementFromPoint(e.clientX,e.clientY);
                      const card=el?.closest("[data-modello-id]");
                      const id=card?card.getAttribute("data-modello-id"):m.id;
                      dragTargetId.current=id;
                      if(dragOverId!==id) setDragOverId(id);
                    }}
                    onDrop={async(e)=>{
                      stopAutoScroll();
                      // Uso sempre dragTargetId (calcolato via elementFromPoint),
                      // MAI l'id della card che ha ricevuto l'evento onDrop: quella
                      // può non coincidere con la posizione reale del cursore quando
                      // il drag nativo perde precisione su liste lunghe.
                      await reorderModelli(dragSrcId.current, dragTargetId.current, calId);
                      dragSrcId.current=null; dragTargetId.current=null;
                      setDraggingId(null); setDragOverId(null);
                    }}
                    onDragEnd={()=>{
                      // Copre il caso di drag rilasciato fuori da una card valida
                      // (es. fuori dalla lista): ripulisce comunque lo stato visivo.
                      stopAutoScroll();
                      dragSrcId.current=null; dragTargetId.current=null;
                      setDraggingId(null); setDragOverId(null);
                    }}/>
                </div>
              ))}
            </div>
          );
        })()}
        {modelliTab==="turni"&&!editMode&&!modalitaSpostamento&&selectedModelloIds.length>0&&(
          <div style={{position:"sticky",bottom:0,background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:14,padding:"10px 14px",marginTop:10,display:"flex",alignItems:"center",
            justifyContent:"space-between",boxShadow:"0 -4px 16px rgba(0,0,0,0.08)"}}>
            <span style={{fontSize:13,fontWeight:700,color:T.text}}>{selectedModelloIds.length} selezionati</span>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setSelectedModelloIds([])}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                  color:T.sub,padding:"7px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                Annulla
              </button>
              {selectedModelloIds.length===1&&(
                <button onClick={()=>{
                    const m=modelli.find(x=>x.id===selectedModelloIds[0]);
                    if(m){ setEditModello(m); setModelForm({
                      ...m,
                      // Stesso fix del punto gemello sopra: "...m" porta già
                      // i campi corretti in camelCase, non serve rileggerli
                      // da chiavi snake_case che qui non esistono.
                    }); setOrigineModelForm("lista"); setShowModelForm(true); setSelectedModelloIds([]); }
                  }}
                  style={{background:accent,border:"none",borderRadius:8,
                    color:getContrastTextColor(accent),padding:"7px 14px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                  ✏️ Modifica
                </button>
              )}
              <button onClick={async()=>{
                  if(!window.confirm(`Eliminare ${selectedModelloIds.length} modelli selezionati?`)) return;
                  for(const id of selectedModelloIds) await deleteModello(id);
                  setSelectedModelloIds([]);
                }}
                style={{background:"#ef4444",border:"none",borderRadius:8,
                  color:"#fff",padding:"7px 14px",cursor:"pointer",fontWeight:800,fontSize:12}}>
                🗑️ Elimina
              </button>
            </div>
          </div>
        )}
        {modelliTab==="rotazioni"&&(
          <div style={{paddingBottom:80}}>
            {rotazioni.length===0?(
              <div style={{textAlign:"center",padding:"32px 24px",color:T.sub}}>
                <div style={{fontSize:36,marginBottom:10}}>🔄</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessuna rotazione</div>
                <div style={{fontSize:12,marginBottom:12}}>Premi + per creare una rotazione</div>
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:12,textAlign:"left"}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.sub,marginBottom:8}}>TIPI DISPONIBILI</div>
                  {[
                    ["🗓 Domeniche 1/4","1 domenica lavoro (festivo) + 3 riposo ogni 4 settimane"],
                    ["📅 RS/NL Scalante","RS venerdì→NL+7gg, poi giovedì, poi mercoledì... (salta domenica)"],
                    ["🔄 NL/RS classico","NL e RS a rotazione settimanale scalante"],
                    ["📋 Personalizzata","Griglia libera giorno per giorno"],
                  ].map(([t,d])=>(
                    <div key={t} style={{marginBottom:8}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.text}}>{t}</div>
                      <div style={{fontSize:11,color:T.sub}}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            ):(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                {rotazioni.map((r,i,arr)=>(
                  <div key={r.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <RotazioneCard r={r} T={T} accent={accent} modelli={
                        modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId)
                      }
                      onOpen={()=>setShowRotDetail(r.id)}
                      onEdit={()=>{ setEditRotazione(r); setRotForm({
                        tipo:r.tipo, titolo:r.titolo||"", dataInizio:r.dataInizio||"",
                        nSettimane:r.nSettimane||52, modellaLavoroId:r.modellaLavoroId||null,
                        modelloNLId:r.modelloNLId||null, modelloRSId:r.modelloRSId||null,
                      }); setShowRotForm(true); }}
                      onDelete={()=>deleteRotazione(r.id)}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {modelliTab==="colori"&&(()=>{
          const fasceColorSet = new Set([...fasceAutomatiche.map(f=>f.color), COLORE_H24]);
          const coloriExtraFiltrati = coloriExtra.filter(c=>!fasceColorSet.has(c.hex));
          const coloriUsatiDaModelli = [...new Set(modelli.map(m=>m.coloreCustom).filter(Boolean))]
            .filter(h=>!fasceColorSet.has(h));
          const hexUsatiDaExtra = new Set(coloriExtraFiltrati.map(c=>c.hex));
          const coloriManualiOggetti = [
            ...coloriExtraFiltrati,
            ...coloriUsatiDaModelli.filter(h=>!hexUsatiDaExtra.has(h)).map(h=>({hex:h,label:null})),
          ];
          function contaModelli(hex){ return modelli.filter(m=>m.coloreCustom===hex).length; }
          function contaModelliFascia(fascia){
            return modelli.filter(m=>{
              if(m.coloreCustom) return m.coloreCustom===fascia.color;
              if(fascia.key==="notte") return m.tempo==="h24"?false:(!m.inizio?false:colByTime(m.inizio)===fascia.color);
              return m.tempo!=="h24" && m.inizio && colByTime(m.inizio)===fascia.color;
            }).length;
          }
          const contaH24 = modelli.filter(m=>m.coloreCustom ? m.coloreCustom===COLORE_H24 : m.tempo==="h24").length;
          // Un'unica lista con tutti i colori (fasce automatiche + H24 + personalizzati),
          // nessuna sezione separata: tocca un colore per rinominarlo/gestirlo.
          const righeTutteFasce = fasceAutomatiche.map(f=>({
            key:f.key, hex:f.color, label:f.label, sub:"Automatico per orario",
            count:contaModelliFascia(f), isFascia:true, fasciaKey:f.key,
          }));
          const rigaH24 = { key:"__h24", hex:COLORE_H24, label:"H24", sub:"Standard turni H24",
            count:contaH24, isFascia:true, fasciaKey:null };
          const righeExtra = coloriManualiOggetti.map(c=>({
            key:c.hex, hex:c.hex, label:c.label||c.hex.toUpperCase(), sub:"Personalizzato",
            count:contaModelli(c.hex), isFascia:false,
          }));
          const righeTutte = [...righeTutteFasce, rigaH24, ...righeExtra];
          return (
            <div style={{paddingBottom:80}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,paddingLeft:4}}>
                <div style={{fontSize:11,color:T.sub,fontWeight:700}}>COLORI</div>
                <button onClick={()=>setShowAddColorPicker(true)}
                  style={{background:accent,border:"none",borderRadius:8,padding:"4px 12px",
                    fontSize:16,fontWeight:800,cursor:"pointer",color:getContrastTextColor(accent)}}>+</button>
              </div>
              <div style={{fontSize:11,color:T.sub,marginBottom:8,paddingLeft:4}}>
                Tocca un colore per rinominarlo o per riassegnarlo ai modelli.
              </div>
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                {righeTutte.map((r,i,arr)=>(
                  <div key={r.key} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <ColorRow T={T} hex={r.hex} label={r.label} sub={r.sub}
                      count={r.count} onClick={()=>setShowColorAssignPicker(r.hex)}
                      onRemove={(!r.isFascia && r.count===0)?()=>removeColoreExtra(r.hex):null}/>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {showAddColorPicker&&(
        <ColorPickerModal T={T} cur="#3b82f6" title="Aggiungi colore"
          onPick={p=>{addColoreExtra(p);setShowAddColorPicker(false);}}
          onClose={()=>setShowAddColorPicker(false)}/>
      )}

      {showColorAssignPicker&&(()=>{
        const hex = showColorAssignPicker;
        const fasciaCorrente = fasceAutomatiche.find(f=>f.color===hex);
        const isH24 = hex===COLORE_H24;
        const isFascia = !!fasciaCorrente || isH24;
        const coloreExtraCorrente = coloriExtra.find(c=>c.hex===hex);
        const nomeAttuale = fasciaCorrente ? fasciaCorrente.label : isH24 ? "H24" : (coloreExtraCorrente?.label || "");
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:600,
            display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
              <button onClick={()=>{setShowColorAssignPicker(null);setColorAssignCalFiltro(null);}}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:18,height:18,borderRadius:"50%",background:hex,border:`1px solid ${T.border}`,flexShrink:0}}/>
                <div style={{fontSize:11,color:T.sub}}>{hex.toUpperCase()}</div>
              </div>
              <div style={{width:32}}/>
            </div>
            {isH24?(
              <div style={{padding:"10px 16px",fontSize:16,fontWeight:900,color:T.text,background:T.surface,borderBottom:`1px solid ${T.border}`}}>
                H24
              </div>
            ):(
              <div style={{padding:"10px 16px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
                <input value={nomeAttuale}
                  onChange={e=>{
                    const v = e.target.value.toUpperCase();
                    if(fasciaCorrente) updateFascia(fasciaCorrente.key, {label:v});
                    else updateColoreExtraLabel(hex, v);
                  }}
                  placeholder="Nome di questo colore"
                  style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                    padding:"9px 12px",color:T.text,fontSize:16,fontWeight:900,outline:"none",boxSizing:"border-box"}}/>
              </div>
            )}
            {isFascia&&(
              <div style={{padding:"10px 16px",fontSize:12,color:T.sub,background:T.s2}}>
                Colore automatico. Assegnando qui un modello, quel modello userà sempre questo colore.
                {fasciaCorrente&&" L'orario della fascia si modifica da Impostazioni."}
              </div>
            )}
            {store.calendars.length>1&&(()=>{
              const calSelezionati = colorAssignCalFiltro===null ? store.calendars.map(c=>c.id) : colorAssignCalFiltro;
              function toggleCal(cid){
                setColorAssignCalFiltro(prev=>{
                  const base = prev===null ? store.calendars.map(c=>c.id) : prev;
                  const next = base.includes(cid) ? base.filter(id=>id!==cid) : [...base, cid];
                  return next;
                });
              }
              return (
                <div style={{padding:"10px 16px",background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>
                    CALENDARI DA MOSTRARE
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {store.calendars.map(c=>{
                      const attivo = calSelezionati.includes(c.id);
                      return (
                        <button key={c.id} onClick={()=>toggleCal(c.id)}
                          style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",
                            background:attivo?"#eab308":T.s2,
                            border:`1.5px solid ${attivo?"#eab308":T.border}`,
                            borderRadius:20,padding:"4px 10px 4px 6px"}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:c.color}}/>
                          <span style={{color:attivo?"#0f172a":T.text,fontSize:12,fontWeight:700}}>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
              {modelli.length===0?(
                <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                  Nessun modello creato ancora.
                </div>
              ):(()=>{
                const calSelezionati = colorAssignCalFiltro===null ? store.calendars.map(c=>c.id) : colorAssignCalFiltro;
                const gruppiColorePerCalendario = store.calendars
                  .filter(c=>calSelezionati.includes(c.id))
                  .map(c=>({
                    cal: c,
                    modelli: modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===c.id),
                  }))
                  .filter(g=>g.modelli.length>0);
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    {gruppiColorePerCalendario.map(({cal, modelli:modelliCal})=>(
                      <div key={cal.id}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,paddingLeft:2}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:cal.color}}/>
                          <span style={{fontSize:12,fontWeight:800,color:T.sub,textTransform:"uppercase"}}>{cal.name}</span>
                        </div>
                        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                          {modelliCal.map((m,i,arr)=>{
                            const matchAuto = !m.coloreCustom && (
                              (m.tempo==="h24" && hex===COLORE_H24) ||
                              (m.tempo!=="h24" && m.inizio && colByTime(m.inizio)===hex)
                            );
                            const selezionato = m.coloreCustom===hex || matchAuto;
                            const coloreAttuale = m.coloreCustom||colByTime(m.inizio);
                            return (
                              <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                                <div onClick={()=>{
                                  saveModello({...m, coloreCustom: selezionato ? null : hex});
                                }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                                  <div style={{width:20,height:20,borderRadius:6,marginRight:12,flexShrink:0,
                                    border:`2px solid ${selezionato?hex:T.border}`,
                                    background:selezionato?hex:"transparent",
                                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                                    {selezionato&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
                                  </div>
                                  <div style={{width:10,height:10,borderRadius:"50%",background:coloreAttuale,marginRight:10,flexShrink:0}}/>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:15,fontWeight:700,color:T.text}}>{m.titolo||"Senza nome"}</div>
                                    <div style={{fontSize:11,color:T.sub}}>
                                      {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.fine?` - ${m.fine}`:""}`:""}
                                      {m.coloreCustom&&!selezionato?" · colore personalizzato diverso":""}
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
                );
              })()}
            </div>
            <div style={{padding:12,borderTop:`1px solid ${T.border}`,background:T.surface}}>
              <button onClick={()=>{setShowColorAssignPicker(null);setColorAssignCalFiltro(null);}}
                style={{width:"100%",background:accent,border:"none",borderRadius:10,
                  color:getContrastTextColor(accent),padding:"12px 0",cursor:"pointer",fontWeight:800,fontSize:14}}>
                Fatto
              </button>
            </div>
          </div>
        );
      })()}

      {showEditFasciaColor&&(
        <ColorPickerModal T={T} cur={showEditFasciaColor} title="Cambia colore"
          coloriUsati={[...new Set(modelli.map(m=>m.coloreCustom||(m.tempo==="h24"?COLORE_H24:colByTime(m.inizio))).filter(Boolean))].filter(h=>h!==showEditFasciaColor)}
          onPick={async(p)=>{
            const old = showEditFasciaColor;
            setShowColorAssignPicker(p);
            await replaceColoreEverywhere(old, p);
          }}
          onClose={()=>setShowEditFasciaColor(null)}/>
      )}

      {showRotForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,
          display:"flex",alignItems:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowRotForm(false);}}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",maxHeight:"92vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 0"}}>
              <button onClick={()=>setShowRotForm(false)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer",padding:4}}>‹</button>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>
                {editRotazione?"Modifica rotazione":"Nuova rotazione"}
              </div>
              <div style={{width:32}}/>
            </div>
            <RotazioneForm T={T} form={rotForm} setForm={setRotForm} accent={accent} modelli={
                modelli.filter(m=>(m.calendarId||mainCalId)===calId)
              }
              sortedModelli={
                modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId)
              }
              onSave={()=>{ saveRotazione({...rotForm,id:editRotazione?.id}); setShowRotForm(false); }}/>
          </div>
        </div>
      )}

      {showRotDetail&&(()=>{
        const rot=rotazioni.find(r=>r.id===showRotDetail);
        if(!rot) return null;
        return (
          <div style={{position:"fixed",inset:0,background:T.bg,zIndex:400,display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"16px 16px 8px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
              <button onClick={()=>setShowRotDetail(null)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>{rot.titolo||"Rotazione"}</div>
                <div style={{fontSize:12,color:T.sub}}>
                  {rot.tipo==="domeniche" && rot.dataInizio
                    ? `${rot.nSettimane || 52} settimane (${Math.ceil((rot.nSettimane || 52)/4)} domeniche di lavoro)`
                    : `${Object.values(rot.griglia||{}).filter(Boolean).length} giorni configurati`}
                </div>
              </div>
              <button onClick={()=>{
                let grigliaFinale = {...(rot.griglia||{})};
                if(rot.tipo==="domeniche" && rot.dataInizio && rot.modellaLavoroId){
                  const inizio = new Date(rot.dataInizio);
                  let d = new Date(inizio);
                  while(d.getDay()!==0) d.setDate(d.getDate()+1);
                  for(let i=0;i<(rot.nSettimane||52);i++){
                    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                    if(i%4===0) grigliaFinale[k]=rot.modellaLavoroId;
                    d.setDate(d.getDate()+7);
                  }
                }
                updateGrigliaRotazione(rot.id, grigliaFinale);
                setShowRotDetail(null);
              }}
                style={{background:accent,border:"none",borderRadius:8,color:accentText,
                  padding:"6px 14px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Fatto</button>
            </div>
            <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
              {(()=>{
                const modelliDelCalRot = modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId);
                return (<>
              {rot.tipo==="personalizzata"&&(
                <GrigliaRotazione rot={rot} T={T} accent={accent} modelli={modelliDelCalRot} fasceAutomatiche={fasceAutomatiche} sundayColor={sundayColor}
                  onUpdate={griglia=>setRotazioni(prev=>prev.map(r=>r.id===rot.id?{...r,griglia}:r))}/>
              )}
              {rot.tipo==="domeniche"&&(
                <DomenicheView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot} fasceAutomatiche={fasceAutomatiche}
                  onUpdate={griglia=>setRotazioni(prev=>prev.map(r=>r.id===rot.id?{...r,griglia}:r))}/>
              )}
              {rot.tipo==="nlrs"&&(
                <NLRSView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot}/>
              )}
              {rot.tipo==="nlrs_scalante"&&(
                <NLRSScalanteView rot={rot} T={T} accent={accent} modelli={modelliDelCalRot}/>
              )}
                </>);
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );

  function timeToMins(t){ const mins=oraInMinuti(t); return mins===null?0:mins; }
  function minsToTime(m){ m=((m%1440)+1440)%1440; return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

  const settingsView = (
    <div style={{flex:1,overflowY:"auto",padding:"12px 12px 80px",color:T.text}}>
      <div style={{fontSize:18,fontWeight:900,fontFamily:"Georgia,serif",marginBottom:14}}>Impostazioni</div>
      <Sec label="ACCOUNT" T={T}>
        <div style={{fontSize:12,color:T.sub,marginBottom:10}}>{session?.user?.email}</div>
        <button onClick={handleLogout}
          style={{width:"100%",background:"#ef4444",border:"none",borderRadius:10,
            color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
          🚪 Logout
        </button>
      </Sec>

      <SecCollapsible label="LOG ERRORI" T={T}
        onToggle={(aperta)=>{
          if(aperta){
            setLogErroriVisibile(leggiLogErrori());
            setErroriSilenziatiVisibile(leggiErroriSilenziati());
          }
        }}>
        <div style={{fontSize:11,color:T.sub,marginBottom:12}}>
          Ogni errore dell'app finisce qui, anche quelli minori: quando è successo, in quale
          punto dell'app (contesto), e il dettaglio tecnico. Utile per capire cosa sistemare
          e dove, anche se hai scelto di non vederlo più come avviso.
        </div>

        {erroriSilenziatiVisibile && Object.keys(erroriSilenziatiVisibile).length>0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:800,color:T.sub,marginBottom:8}}>ERRORI SILENZIATI</div>
            <div style={{background:T.s2,borderRadius:10,padding:10}}>
              {Object.keys(erroriSilenziatiVisibile).map((contesto,i,arr)=>(
                <div key={contesto} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"7px 0",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                  <div style={{fontSize:12,color:T.text,flex:1,paddingRight:8}}>{contesto}</div>
                  <button onClick={()=>{
                      impostaSilenziamentoErrore(contesto, false);
                      setErroriSilenziatiVisibile(leggiErroriSilenziati());
                    }}
                    style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,
                      color:T.sub,padding:"5px 10px",cursor:"pointer",fontWeight:700,fontSize:11,flexShrink:0}}>
                    Riattiva
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{fontSize:11,fontWeight:800,color:T.sub,marginBottom:8}}>
          CRONOLOGIA {logErroriVisibile?.length>0 ? `(${logErroriVisibile.length})` : ""}
        </div>
        {(!logErroriVisibile || logErroriVisibile.length===0) ? (
          <div style={{fontSize:12,color:T.sub}}>Nessun errore registrato finora.</div>
        ) : (
          <div style={{maxHeight:340,overflowY:"auto",background:T.s2,borderRadius:10,padding:10,marginBottom:12}}>
            {logErroriVisibile.slice().reverse().map((voce,i)=>(
              <div key={i} style={{padding:"7px 0",borderBottom:i<logErroriVisibile.length-1?`1px solid ${T.border}`:"none"}}>
                <div style={{fontSize:10,color:T.sub,marginBottom:2}}>
                  {new Date(voce.ts).toLocaleString("it-IT")} — <strong>{voce.contesto}</strong>
                </div>
                <div style={{fontSize:12,color:T.text}}>{voce.messaggio}</div>
              </div>
            ))}
          </div>
        )}
        {logErroriVisibile?.length>0 && (
          <button onClick={()=>{
              if(confirm("Cancellare tutto il log degli errori? L'azione non è reversibile.")){
                cancellaLogErrori();
                setLogErroriVisibile([]);
              }
            }}
            style={{width:"100%",background:"none",border:"1px solid #ef4444",borderRadius:10,color:"#ef4444",
              padding:"10px 0",fontWeight:800,fontSize:12,cursor:"pointer"}}>
            Cancella log
          </button>
        )}
      </SecCollapsible>
      <Sec label="TEMA" T={T}>
        <div style={{display:"flex",gap:6}}>
          {[["auto","Auto"],["light","Chiaro"],["dark","Scuro"]].map(([v,l])=>(
            <button key={v} onClick={()=>{
              setStore(s=>({...s,theme:v}));
              saveSettings({theme:v, extra_hols:store.extraHols});
            }}
              style={{flex:1,padding:"9px 4px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:11,
                background:store.theme===v?(v==="light"?"#f8fafc":v==="dark"?"#0f172a":"#6366f1"):T.s2,
                color:store.theme===v?(v==="light"?"#0f172a":"#fff"):T.sub,
                border:`2px solid ${store.theme===v?"#6366f1":T.border}`}}>{l}</button>
          ))}
        </div>
      </Sec>

      <SecCollapsible label="FASCE ORARIE AUTOMATICHE" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Personalizza nome, orario e colore delle 4 fasce usate per colorare automaticamente i modelli.
        </div>
        {fasceAutomatiche.map((f,fi)=>(
          <div key={f.key} style={{background:T.s2,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:f.color,
                  border:`2px solid ${T.border}`,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();setPal(pal===("fascia-"+f.key)?null:("fascia-"+f.key));}}/>
                {pal===("fascia-"+f.key)&&<ColorPickerModal T={T} cur={f.color} title={`Colore ${f.label||"fascia"}`}
                  coloriUsati={[...new Set(fasceAutomatiche.map(ff=>ff.color).filter(Boolean))]}
                  onPick={p=>{
                    updateFascia(f.key,{color:p});
                    saveSettings({fasce_automatiche:fasceAutomatiche.map(ff=>ff.key===f.key?{...ff,color:p}:ff)});
                  }}
                  onClose={()=>setPal(null)}/>}
              </div>
              <input value={f.label}
                onChange={e=>updateFascia(f.key,{label:e.target.value})}
                onBlur={e=>saveSettings({fasce_automatiche:fasceAutomatiche.map(ff=>ff.key===f.key?{...ff,label:e.target.value}:ff)})}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:13,fontWeight:700}}/>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:9,color:T.sub,marginBottom:3}}>DALLE</div>
                <input type="time" value={minsToTime(f.from)}
                  onChange={e=>updateFascia(f.key,{from:timeToMins(e.target.value)})}
                  style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,
                    padding:"6px 8px",color:T.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:9,color:T.sub,marginBottom:3}}>ALLE</div>
                <input type="time" value={minsToTime(f.to)}
                  onChange={e=>updateFascia(f.key,{to:timeToMins(e.target.value)})}
                  style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,
                    padding:"6px 8px",color:T.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>
        ))}
        <button onClick={()=>{
          setStore(s=>({...s, fasceAutomatiche:FASCE_AUTOMATICHE_DEFAULT}));
          saveSettings({fasce_automatiche:FASCE_AUTOMATICHE_DEFAULT});
        }} style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,
          color:T.sub,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
          ↩ Ripristina fasce predefinite
        </button>
      </SecCollapsible>

      <SecCollapsible label="DOMENICHE E FESTIVI" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Colore di sfondo usato nel calendario per le domeniche e i giorni festivi.
        </div>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1,background:T.s2,borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:sundayColor,
                  border:`2px solid ${T.border}`,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();setPal(pal==="sunday-color"?null:"sunday-color");}}/>
                {pal==="sunday-color"&&<ColorPickerModal T={T} cur={sundayColor} title="Colore domeniche"
                  coloriUsati={[sundayColor,holidayColor].filter(Boolean)}
                  onPick={p=>{
                    setStore(s=>({...s,sundayColor:p}));
                    saveSettings({sunday_color:p});
                  }}
                  onClose={()=>setPal(null)}/>}
              </div>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>Domeniche</div>
            </div>
          </div>
          <div style={{flex:1,background:T.s2,borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:holidayColor,
                  border:`2px solid ${T.border}`,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();setPal(pal==="holiday-color"?null:"holiday-color");}}/>
                {pal==="holiday-color"&&<ColorPickerModal T={T} cur={holidayColor} title="Colore festivi"
                  coloriUsati={[sundayColor,holidayColor].filter(Boolean)}
                  onPick={p=>{
                    setStore(s=>({...s,holidayColor:p}));
                    saveSettings({holiday_color:p});
                  }}
                  onClose={()=>setPal(null)}/>}
              </div>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>Festivi</div>
            </div>
          </div>
        </div>
        <button onClick={()=>{
          const def = dark?"#2d0a0a":"#fff5f5";
          setStore(s=>({...s, sundayColor:def, holidayColor:def}));
          saveSettings({sunday_color:def, holiday_color:def});
        }} style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,
          color:T.sub,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12,marginTop:8}}>
          ↩ Ripristina colore predefinito
        </button>
      </SecCollapsible>

      <SecCollapsible label="OPZIONI DI VISUALIZZAZIONE" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Quante righe di dettaglio mostrare per ogni evento nella griglia mensile del Calendario.
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[[1,"1 riga"],[2,"2 righe"]].map(([v,l])=>(
            <button key={v} onClick={()=>{
              setStore(s=>({...s,calEventRows:v}));
              saveSettings({cal_event_rows:v});
            }}
              style={{flex:1,padding:"9px 4px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:12,
                background:store.calEventRows===v?"#6366f1":T.s2,
                color:store.calEventRows===v?"#fff":T.sub,
                border:`2px solid ${store.calEventRows===v?"#6366f1":T.border}`}}>{l}</button>
          ))}
        </div>

        {store.calEventRows===2 && (
          <>
            <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.5px",marginBottom:8}}>RIGA 1</div>
            <div style={{background:T.s2,borderRadius:10,marginBottom:14,overflow:"hidden"}}>
              {[["titolo","Titolo"],["inizio","Inizio"],["fine","Fine"],["durata","Durata"],["icona","Icona"]].map(([v,l],i,arr)=>(
                <div key={v} onClick={()=>{
                    setStore(s=>({...s,calRow1Field:v}));
                    saveSettings({cal_row1_field:v});
                  }}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"11px 12px",cursor:"pointer",
                    borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                  <span style={{fontSize:13,color:T.text}}>{l}</span>
                  <div style={{width:18,height:18,borderRadius:"50%",flexShrink:0,
                    border:`2px solid ${store.calRow1Field===v?"#6366f1":T.border}`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {store.calRow1Field===v && <div style={{width:9,height:9,borderRadius:"50%",background:"#6366f1"}}/>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.5px",marginBottom:8}}>RIGA 2</div>
            <div style={{background:T.s2,borderRadius:10,overflow:"hidden"}}>
              {[["---","---"],["inizio","Inizio"],["fine","Fine"],["durata","Durata"],["note","Note"]].map(([v,l],i,arr)=>(
                <div key={v} onClick={()=>{
                    setStore(s=>({...s,calRow2Field:v}));
                    saveSettings({cal_row2_field:v});
                  }}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"11px 12px",cursor:"pointer",
                    borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                  <span style={{fontSize:13,color:T.text}}>{l}</span>
                  <div style={{width:18,height:18,borderRadius:"50%",flexShrink:0,
                    border:`2px solid ${store.calRow2Field===v?"#6366f1":T.border}`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {store.calRow2Field===v && <div style={{width:9,height:9,borderRadius:"50%",background:"#6366f1"}}/>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SecCollapsible>


      <SecCollapsible label="CALENDARI" T={T}>
        {store.calendars.map((c,ci)=>(
          <div key={c.id} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:T.s2,borderRadius:10,padding:"8px 10px"}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:c.color,
                  border:`2px solid ${T.border}`,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();setPal(pal===c.id?null:c.id);}}/>
                {pal===c.id&&<ColorPickerModal T={T} cur={c.color} title={`Colore ${c.name||"calendario"}`}
                  coloriUsati={[...new Set(store.calendars.map(cc=>cc.color).filter(Boolean))]}
                  onPick={p=>{
                  const newCals=JSON.parse(JSON.stringify(store.calendars));
                  newCals[ci].color=p;
                  setStore(s=>({...s,calendars:newCals}));
                  updateCalendar(c.id,{color:p});
                }}
                  onClose={()=>setPal(null)}/>}
              </div>
              <input value={c.name}
                onChange={e=>{const newCals=JSON.parse(JSON.stringify(store.calendars));newCals[ci].name=e.target.value;setStore(s=>({...s,calendars:newCals}));}}
                onBlur={e=>updateCalendar(c.id,{name:e.target.value})}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:13,fontWeight:700}}/>
              <button onClick={async()=>{
                const newCals=store.calendars.map((x,j)=>({...x,isMain:j===ci}));
                setStore(s=>({...s,calendars:newCals}));
                for(const cal of store.calendars) await updateCalendar(cal.id,{is_main:cal.id===c.id});
              }} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:c.isMain?"#f59e0b":T.sub}}>★</button>
              <button onClick={async()=>{
                if(ci===0) return;
                const newCals=[...store.calendars];
                [newCals[ci-1],newCals[ci]]=[newCals[ci],newCals[ci-1]];
                setStore(s=>({...s,calendars:newCals}));
                for(let i=0;i<newCals.length;i++) await updateCalendar(newCals[i].id,{sort_order:i});
              }} style={{background:"none",border:"none",color:ci===0?T.border:T.sub,cursor:ci===0?"default":"pointer",fontSize:20,padding:"0 4px"}}>↑</button>
              <button onClick={async()=>{
                if(ci===store.calendars.length-1) return;
                const newCals=[...store.calendars];
                [newCals[ci],newCals[ci+1]]=[newCals[ci+1],newCals[ci]];
                setStore(s=>({...s,calendars:newCals}));
                for(let i=0;i<newCals.length;i++) await updateCalendar(newCals[i].id,{sort_order:i});
              }} style={{background:"none",border:"none",color:ci===store.calendars.length-1?T.border:T.sub,cursor:ci===store.calendars.length-1?"default":"pointer",fontSize:20,padding:"0 4px"}}>↓</button>
              <button onClick={()=>setExCal(exCal===c.id?null:c.id)}
                style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12}}>
                {exCal===c.id?"▲":"▼"}</button>
              <button onClick={async()=>{
                if(!window.confirm(`Eliminare il calendario "${c.name}"? Tutti gli eventi associati verranno persi.`)) return;
                await deleteCalendar(c.id);
                const newCals=store.calendars.filter(x=>x.id!==c.id);
                setStore(s=>({...s,calendars:newCals}));
                syncSeAttivo(store.events,newCals);
              }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18}}>×</button>
            </div>
            {exCal===c.id&&(
              <div style={{background:T.s2,borderRadius:"0 0 10px 10px",padding:"10px",borderTop:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,color:T.sub,fontWeight:700,marginBottom:8}}>TURNI PREDEFINITI</div>
                {(c.shifts||[]).map((sh,si)=>(
                  <div key={sh.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <div style={{position:"relative",flexShrink:0}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:sh.color,cursor:"pointer"}}
                        onClick={e=>{e.stopPropagation();setPal(pal===sh.id?null:sh.id);}}/>
                      {pal===sh.id&&<ColorPickerModal T={T} cur={sh.color} title={`Colore ${sh.label||"turno"}`}
                        coloriUsati={[...new Set((c.shifts||[]).map(s2=>s2.color).filter(Boolean))]}
                        onPick={p=>{
                        const newCals=JSON.parse(JSON.stringify(store.calendars));
                        newCals[ci].shifts[si].color=p;
                        setStore(s=>({...s,calendars:newCals}));
                        updateCalendar(c.id,{shifts:newCals[ci].shifts});
                      }}
                        onClose={()=>setPal(null)}/>}
                    </div>
                    <input value={sh.label}
                      onChange={e=>{const newCals=JSON.parse(JSON.stringify(store.calendars));newCals[ci].shifts[si].label=e.target.value;setStore(s=>({...s,calendars:newCals}));}}
                      onBlur={()=>updateCalendar(c.id,{shifts:store.calendars[ci].shifts})}
                      style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:12}}/>
                    <button onClick={()=>{
                      const newCals=JSON.parse(JSON.stringify(store.calendars));
                      newCals[ci].shifts=newCals[ci].shifts.filter((_,k)=>k!==si);
                      setStore(s=>({...s,calendars:newCals}));
                      updateCalendar(c.id,{shifts:newCals[ci].shifts});
                    }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16}}>×</button>
                  </div>
                ))}
                <div style={{display:"flex",gap:6,alignItems:"center",marginTop:6}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:nsColor,
                      border:`2px solid ${T.border}`,cursor:"pointer"}}
                      onClick={e=>{e.stopPropagation();setPal(pal==="ns"?null:"ns");}}/>
                    {pal==="ns"&&<ColorPickerModal T={T} cur={nsColor} title="Colore nuovo turno"
                      coloriUsati={[...new Set((c.shifts||[]).map(s2=>s2.color).filter(Boolean))]}
                      onPick={p=>setNsColor(p)}
                      onClose={()=>setPal(null)}/>}
                  </div>
                  <input value={nsName} onChange={e=>setNsName(e.target.value)} placeholder="Nome turno..."
                    style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,outline:"none"}}/>
                  <button onClick={()=>{
                    if(!nsName.trim()) return;
                    const newCals=JSON.parse(JSON.stringify(store.calendars));
                    if(!newCals[ci].shifts) newCals[ci].shifts=[];
                    newCals[ci].shifts.push({id:uid(),label:nsName.trim(),color:nsColor});
                    setStore(s=>({...s,calendars:newCals}));
                    updateCalendar(c.id,{shifts:newCals[ci].shifts});
                    setNsName("");
                  }} style={{background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",padding:"7px 12px",cursor:"pointer",fontWeight:800,fontSize:14}}>+</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4}}>
          <div style={{position:"relative",flexShrink:0}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:ncColor,
              border:`2px solid ${T.border}`,cursor:"pointer"}}
              onClick={e=>{e.stopPropagation();setPal(pal==="nc"?null:"nc");}}/>
            {pal==="nc"&&<ColorPickerModal T={T} cur={ncColor} title="Colore nuovo calendario"
              coloriUsati={[...new Set(store.calendars.map(cc=>cc.color).filter(Boolean))]}
              onPick={p=>setNcColor(p)}
              onClose={()=>setPal(null)}/>}
          </div>
          <input value={ncName} onChange={e=>setNcName(e.target.value)} placeholder="Nome calendario..."
            style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none"}}/>
          <button onClick={async()=>{
            if(!ncName.trim()) return;
            const isFirst=store.calendars.length===0;
            const dbCal=await addCalendar(ncName.trim(),ncColor,isFirst);
            if(dbCal){
              const newCals=[...store.calendars,{id:dbCal.id,name:dbCal.name,color:dbCal.color,isMain:dbCal.is_main,shifts:[]}];
              setStore(s=>({...s,calendars:newCals}));
              if(!calId) setCalId(dbCal.id);
              syncSeAttivo(store.events,newCals);
            }
            setNcName("");
          }} style={{background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",padding:"8px 14px",cursor:"pointer",fontWeight:800,fontSize:14}}>+</button>
        </div>
      </SecCollapsible>

      <SecCollapsible label="ARCHIVIO GOOGLE SHEETS" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Configura il tuo script Google Sheets per importare ed esportare i dati.
        </div>
        <input value={sheetsUrl} onChange={e=>setSheetsUrl(e.target.value)}
          placeholder="URL Script Google Sheets..."
          style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
            borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none",marginBottom:6,boxSizing:"border-box"}}/>
        <input value={sheetsSecret} onChange={e=>setSheetsSecret(e.target.value)}
          placeholder="Secret Google Sheets..." type="password"
          style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
            borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
        <button onClick={handleSaveSheetsConfig} disabled={syncing}
          style={{width:"100%",background:accent,border:"none",borderRadius:10,
            color:getContrastTextColor(accent),padding:"9px 0",cursor:"pointer",fontWeight:800,fontSize:12,marginBottom:8}}>
          {syncing?"⏳ Salvataggio...":"💾 Salva Configurazione Sheets"}
        </button>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={handleSave} disabled={syncing||!sheetsUrl}
            style={{flex:1,background:sheetsUrl?"#16a34a":"#94a3b8",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:sheetsUrl?"pointer":"not-allowed",fontWeight:800,fontSize:12}}>
            {syncing?"⏳ ...":"📤 Esporta su Sheets"}
          </button>
          <button onClick={handleLoad} disabled={syncing||!sheetsUrl}
            style={{flex:1,background:sheetsUrl?"#2563eb":"#94a3b8",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:sheetsUrl?"pointer":"not-allowed",fontWeight:800,fontSize:12}}>
            {syncing?"⏳ ...":"📥 Importa da Sheets"}
          </button>
        </div>
        {sheetsUrl&&(
          <a href="https://docs.google.com/spreadsheets/d/106C8GAh0Ka2WS8O8Ezx0nUnDgX0hyS7Crvixy84uDSA/edit"
            target="_blank" rel="noreferrer"
            style={{display:"block",textAlign:"center",fontSize:11,color:"#16a34a",fontWeight:700,
              textDecoration:"none",background:"#dcfce7",borderRadius:8,padding:"8px 0"}}>
            📊 Apri Google Sheets
          </a>
        )}
        {syncMsg&&<div style={{fontSize:11,color:T.text,padding:"8px 10px",
          background:T.s2,borderRadius:8,textAlign:"center",marginTop:8}}>{syncMsg}</div>}
      </SecCollapsible>

      <SecCollapsible label="DATABASE CLOUD SUPABASE" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Controlla lo stato dei dati memorizzati nel cloud Supabase.
        </div>
        <button onClick={handleViewDbData}
          style={{width:"100%",background:"#475569",border:"none",borderRadius:10,
            color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12,marginBottom:8}}>
          🔍 Visualizza Dati in Supabase
        </button>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={handleExportSupabase}
            style={{flex:1,background:"#16a34a",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📤 Esporta da Supabase
          </button>
          <button onClick={handleOpenImportSupabase}
            style={{flex:1,background:"#2563eb",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📥 Importa su Supabase
          </button>
        </div>
        <button onClick={()=>setShowLocalDataModal(true)}
          style={{width:"100%",background:"#7c3aed",border:"none",borderRadius:10,
            color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
          📱 Visualizza Dati Locali (Telefono)
        </button>
      </SecCollapsible>

      {showLocalDataModal&&(()=>{
        const cached = loadFromLocalStorage();
        const nEvents = cached ? Object.values(cached.events||{}).reduce((sum,calMap)=>
          sum + Object.values(calMap||{}).reduce((s2,arr)=>s2+(arr?.length||0), 0), 0) : 0;
        const nCalendars = cached?.calendars?.length || 0;
        const nModelli = cached?.modelli?.length || 0;
        const ts = cached?.timestamp ? new Date(cached.timestamp).toLocaleString("it-IT") : "Mai";
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,
            display:"flex",alignItems:"flex-end"}}
            onClick={e=>{if(e.target===e.currentTarget)setShowLocalDataModal(false);}}>
            <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
              maxWidth:480,margin:"0 auto",padding:"16px"}}
              onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>Dati salvati su questo dispositivo</div>
                <button onClick={()=>setShowLocalDataModal(false)}
                  style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>×</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,background:T.s2,borderRadius:10,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Eventi/turni salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nEvents}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Calendari salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nCalendars}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Modelli salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nModelli}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Ultimo salvataggio:</span>
                  <span style={{fontWeight:800,color:T.text}}>{ts}</span>
                </div>
              </div>
              <div style={{fontSize:11,color:T.sub,marginTop:10,textAlign:"center"}}>
                Questa è solo una cache locale di sicurezza. I dati reali e definitivi sono su Supabase.
              </div>
            </div>
          </div>
        );
      })()}

      {showBackupsModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,
          display:"flex",alignItems:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowBackupsModal(false);}}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",maxHeight:"80vh",overflowY:"auto",padding:"16px"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>Backup disponibili</div>
              <button onClick={()=>setShowBackupsModal(false)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            {backupsList.length===0?(
              <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
                Nessun backup trovato. Usa "Esporta da Supabase" per crearne uno.
              </div>
            ):(
              backupsList.map(b=>(
                <button key={b.id} onClick={()=>handleRestoreBackup(b.id)}
                  style={{display:"block",width:"100%",textAlign:"left",background:T.s2,
                    border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",
                    marginBottom:8,cursor:"pointer",color:T.text,fontSize:13,fontWeight:700}}>
                  📦 {new Date(b.created_at).toLocaleString("it-IT")}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {session?.user?.email==='tesonemgs5@gmail.com'&&(
        <Sec label="STATISTICHE DI UTILIZZO (ADMIN)" T={T}>
          {stats?(
            <div style={{display:"flex",flexDirection:"column",gap:6,background:T.s2,borderRadius:10,padding:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                <span style={{color:T.sub}}>Utenti Registrati Totali:</span>
                <span style={{fontWeight:800,color:T.text}}>{stats.total_users}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                <span style={{color:T.sub}}>Utenti Attivi (ultimi 7 giorni):</span>
                <span style={{fontWeight:800,color:"#22c55e"}}>{stats.active_users_7d}</span>
              </div>
            </div>
          ):(
            <div style={{fontSize:11,color:T.sub,textAlign:"center",padding:6}}>⏳ Caricamento statistiche...</div>
          )}
        </Sec>
      )}

      <SecCollapsible label="FESTIVI" T={T}>
      <SecCollapsible label="FESTIVITÀ NAZIONALI" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Scegli quali festività colorare automaticamente come festivo nel calendario.
        </div>
        {resolveFestivitaCatalogo(year).map(f=>{
          const enabled = (store.nationalHolsEnabled||FESTIVITA_DEFAULT_ATTIVE).includes(f.key);
          return (
            <div key={f.key} onClick={()=>{
                const cur = store.nationalHolsEnabled||FESTIVITA_DEFAULT_ATTIVE;
                const next = enabled ? cur.filter(k=>k!==f.key) : [...cur, f.key];
                setStore(s=>({...s, nationalHolsEnabled:next}));
                saveSettings({national_hols_enabled:next});
              }}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"10px 4px",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:T.text}}>{f.name}</div>
                <div style={{fontSize:10,color:T.sub,marginTop:1}}>
                  (es. {String(f.d).padStart(2,"0")}/{String(f.m+1).padStart(2,"0")}/{year})
                </div>
              </div>
              <div style={{width:24,height:24,borderRadius:6,flexShrink:0,
                border:`2px solid ${enabled?accent:T.border}`,background:enabled?accent:T.s2,
                display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:15,fontWeight:900}}>
                {enabled?"✓":""}
              </div>
            </div>
          );
        })}
        <button onClick={()=>{
          setStore(s=>({...s, nationalHolsEnabled:FESTIVITA_DEFAULT_ATTIVE}));
          saveSettings({national_hols_enabled:FESTIVITA_DEFAULT_ATTIVE});
        }} style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,
          color:T.sub,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12,marginTop:10}}>
          ↩ Ripristina selezione predefinita
        </button>
      </SecCollapsible>

      <SecCollapsible label="FESTIVI LOCALI" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:8}}>
          Domeniche e festivi nazionali italiani sono già in rosso automaticamente.
        </div>
        {(store.extraHols||[]).map((h,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,
            background:T.s2,borderRadius:8,padding:"6px 10px",marginBottom:6}}>
            <span style={{flex:1,fontSize:12,color:T.text}}>🎉 {h.name} — {h.d}/{h.m}</span>
            <button onClick={()=>{
              const newH=(store.extraHols||[]).filter((_,j)=>j!==i);
              setStore(s=>({...s,extraHols:newH}));
              saveSettings({theme:store.theme,extra_hols:newH});
            }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16}}>×</button>
          </div>
        ))}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <input value={nhName} onChange={e=>setNhName(e.target.value)} placeholder="Nome..."
            style={{flex:2,minWidth:100,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,outline:"none"}}/>
          <input value={nhD} onChange={e=>setNhD(e.target.value)} placeholder="GG" type="number"
            style={{width:50,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 6px",color:T.text,fontSize:12,outline:"none",textAlign:"center"}}/>
          <input value={nhM} onChange={e=>setNhM(e.target.value)} placeholder="MM" type="number"
            style={{width:50,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 6px",color:T.text,fontSize:12,outline:"none",textAlign:"center"}}/>
          <button onClick={()=>{
            if(!nhName.trim()||!nhD||!nhM) return;
            const newH=[...(store.extraHols||[]),{name:nhName.trim(),d:nhD,m:nhM}];
            setStore(s=>({...s,extraHols:newH}));
            saveSettings({theme:store.theme,extra_hols:newH});
            setNhName(""); setNhD(""); setNhM("");
          }} style={{background:"#ef4444",border:"none",borderRadius:8,
            color:"#fff",padding:"7px 12px",cursor:"pointer",fontWeight:800}}>+</button>
        </div>
      </SecCollapsible>
      </SecCollapsible>
    </div>
  );

  // Nella finestra del giorno i controlli di modifica (+Modello, Rotazioni,
  // matite, ×) restano SEMPRE attivi, indipendentemente da "M" e da quanti
  // calendari sono selezionati insieme: la scelta del calendario a cui
  // applicare la modifica avviene già tramite il selettore dentro la
  // finestra stessa (il pallino con bordo giallo), quindi non serve più
  // bloccare l'editing qui. "M" mantiene invece invariata la sua funzione
  // sul calendario mensile esterno (filtro multi-visualizzazione vs scelta
  // del calendario attivo per la modifica).
  const soloConsultazione = false;
  const curEvts = dayKey ? (selectedCalIds.length>1 ? allEvts(dayKey).filter(e=>selectedCalIds.includes(e._cid)) : getEvts(dayKey,calId)) : [];
  const dayModal = dayKey&&(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,
      display:"flex",alignItems:"center"}}
      onClick={e=>{if(e.target===e.currentTarget){setDayKey(null);setForm(null);setPal(null);}}}>
      <div style={{background:T.surface,borderRadius:18,width:"100%",
        maxWidth:480,margin:"auto",padding:"19.2px 16.8px 38.4px",maxHeight:"88vh",overflowY:"auto",fontSize:"1.2em"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>{
                  const [y,m,d]=dayKey.split("-").map(Number);
                  const prev=new Date(y,m-1,d-1);
                  setDayKey(dkey(prev.getFullYear(),prev.getMonth(),prev.getDate()));
                  setForm(null); setPal(null);
                }}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                  color:T.text,width:28,height:28,cursor:"pointer",fontSize:15,
                  display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>‹</button>
              <div style={{fontSize:19,fontWeight:900,color:T.text}}>{fmtDataIT(dayKey)}</div>
              <button onClick={()=>{
                  const [y,m,d]=dayKey.split("-").map(Number);
                  const next=new Date(y,m-1,d+1);
                  setDayKey(dkey(next.getFullYear(),next.getMonth(),next.getDate()));
                  setForm(null); setPal(null);
                }}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                  color:T.text,width:28,height:28,cursor:"pointer",fontSize:15,
                  display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>›</button>
            </div>
            <div style={{fontSize:13,color:accent,fontWeight:700}}>{activeCal?.name||"Seleziona un calendario"}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {!form&&activeCal&&!soloConsultazione&&(
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setShowModelloPicker(true)}
                  style={{background:accent,border:"none",borderRadius:8,
                    color:getContrastTextColor(accent),fontSize:16,fontWeight:800,padding:"8px 17px",cursor:"pointer"}}>
                  + Modello
                </button>
                <button onClick={()=>setShowRotazionePicker(true)}
                  style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                    color:T.text,fontSize:16,fontWeight:800,padding:"8px 17px",cursor:"pointer"}}>
                  🔄 Rotazioni
                </button>
              </div>
            )}
            <button onClick={()=>{setDayKey(null);setForm(null);}}
              style={{background:T.s2,border:"none",borderRadius:8,
                color:T.sub,width:38,height:38,cursor:"pointer",fontSize:22}}>×</button>
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {store.calendars.map(c=>{
            const n=getEvts(dayKey,c.id).length;
            return (
              <button key={c.id} onClick={()=>setCalId(c.id)}
                style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",
                  background:calId===c.id?c.color+"33":T.s2,
                  border:`1.5px solid ${calId===c.id?c.color:T.border}`,
                  borderRadius:8,padding:"4px 12px"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:c.color}}/>
                <span style={{fontSize:13,color:T.text,fontWeight:600}}>
                  {c.name}{n>0?` (${n})`:""}</span>
              </button>
            );
          })}
        </div>
        {curEvts.length===0&&!form&&(
          <div style={{textAlign:"center",color:T.sub,padding:"29px 0",fontSize:16}}>
            Nessun evento — premi + Aggiungi
          </div>
        )}
        {curEvts.filter(e=>!form||form.editId!==e.id).map(e=>(
          <div key={e.id} onClick={()=>{
              if(soloConsultazione) return;
              if(form?.editId===e.id){ setForm(null); return; }
              setForm({ editId:e.id, editCid:e._cid||calId, modelloId:null, evtModelloId:e.modelloId||null, shiftId:null, label:e.label,
                colorOvr:e.color, dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":(e.tIn&&e.tOut&&e.tOut===calcFine6h30(e.tIn))?"fixed30":"custom",
                tIn:(e.tInNote??e.tIn)||"", tOut:(e.tOutNote??e.tOut)||"",
                place:e.place||"", map:e.map||"", note:e.note||"", collega:e.collega||"", auto:e.auto||"",
                protPagFine:e.protPagFine||"", protRecFine:e.protRecFine||"",
                protMenoRecIn:e.protMenoRecIn||"", protMenoRecOut:e.protMenoRecOut||"",
                categoriaTurno:e.categoriaTurno||"", categoriaAppAuto:e.categoriaAppAuto||"" });
            }}
            style={{background:e.color,borderRadius:10,padding:"10px 12px",marginBottom:8,cursor:"pointer",
              display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            {(()=>{
              const cardTextColor=getContrastTextColor(e.color);
              const cardSubColor=cardTextColor==="#ffffff"?"rgba(255,255,255,0.85)":"rgba(15,23,42,0.75)";
              const cardShadow=cardTextColor==="#ffffff"?"0 1px 3px rgba(0,0,0,0.3)":"none";
              const durataEvt=(!e.allDay&&e.tIn&&e.tOut)?calcDurata(e.tIn,e.tOut):"";
              // Le protrazioni sono eventi generati automaticamente dal
              // sistema: il loro titolo visualizzato deve sempre riflettere
              // il nome ATTUALE del modello collegato, non quello salvato
              // sull'evento al momento della creazione (che altrimenti
              // resta "congelato" alla vecchia label se l'utente rinomina
              // il modello PROTRAZIONE in un secondo momento).
              const tipoProtQuestoEvento = tipoModelloProtrazione(e.modelloId);
              const modelloCollegato = tipoProtQuestoEvento ? modelli.find(m=>m.id===e.modelloId) : null;
              const labelDaMostrare = (modelloCollegato ? (modelloCollegato.label||modelloCollegato.titolo||e.label) : e.label);
              const modelloDiQuestoEvento = e.modelloId ? modelli.find(m=>m.id===e.modelloId) : null;
              const orarioModello = (modelloDiQuestoEvento && modelloDiQuestoEvento.tempo!=="h24" && modelloDiQuestoEvento.inizio)
                ? `${modelloDiQuestoEvento.inizio}→${modelloDiQuestoEvento.fine||""}` : null;
              return (
              <>
            <div style={{flex:1}}>
              <div style={{color:cardTextColor,fontSize:20,fontWeight:800,textShadow:cardShadow,display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
                {labelDaMostrare}
                {orarioModello&&<span style={{fontSize:13,fontWeight:700,opacity:0.85}}>{orarioModello}</span>}
              </div>
              {!e.allDay&&e.tIn&&(
                <div style={{color:cardSubColor,fontSize:17,marginTop:2}}>
                  🕐 {e.tIn}{e.tOut?` → ${e.tOut}`:""}{durataEvt?` · ${durataEvt}`:""}
                </div>
              )}
              {(e.auto||e.collega)&&<div style={{color:cardSubColor,fontSize:17,marginTop:3}}>
                {e.auto&&<>🚗 {e.auto}</>}{e.collega&&e.auto?"  ·  ":""}{e.collega&&<>👮 {e.collega}</>}
              </div>}

            </div>
            <button onClick={e2=>{e2.stopPropagation();setForm({
                editId:e.id,editCid:e._cid||calId,modelloId:null,evtModelloId:e.modelloId||null,shiftId:null,label:e.label,colorOvr:e.color,
                dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":(e.tIn&&e.tOut&&e.tOut===calcFine6h30(e.tIn))?"fixed30":"custom",
                tIn:(e.tInNote??e.tIn)||"",tOut:(e.tOutNote??e.tOut)||"",place:e.place||"",
                map:e.map||"",note:e.note||"",collega:e.collega||"",auto:e.auto||"",
                protPagFine:e.protPagFine||"",protRecFine:e.protRecFine||"",
                protMenoRecIn:e.protMenoRecIn||"",protMenoRecOut:e.protMenoRecOut||"",
                categoriaTurno:e.categoriaTurno||"",categoriaAppAuto:e.categoriaAppAuto||"",
              });}}
              style={{background:cardTextColor==="#ffffff"?"rgba(0,0,0,0.2)":"rgba(255,255,255,0.35)",border:"none",borderRadius:6,
                color:cardTextColor,width:26,height:26,cursor:"pointer",fontSize:14,marginLeft:4,flexShrink:0,
                display:soloConsultazione?"none":undefined}}>✏️</button>
            <button onClick={e2=>{e2.stopPropagation();
                if(e.rotazioneId){ setShowDeleteRotEvtDialog({evt:e, dKey:dayKey, cId:e._cid||calId}); }
                else if(window.confirm("Eliminare questo evento?")){ delEvt(dayKey,e._cid||calId,e.id); }
              }}
              style={{background:cardTextColor==="#ffffff"?"rgba(0,0,0,0.2)":"rgba(255,255,255,0.35)",border:"none",borderRadius:6,
                color:cardTextColor,width:26,height:26,cursor:"pointer",fontSize:14,marginLeft:4,flexShrink:0,
                display:soloConsultazione?"none":undefined}}>×</button>
              </>
              );
            })()}
          </div>
        ))}
        {form&&(
          <div style={{background:T.s2,borderRadius:12,padding:14,marginTop:8}}>
            {form.editId&&(
              <div onClick={()=>setForm(f=>({...f,_showModPicker:!f._showModPicker}))}
                style={{fontSize:24,color:T.text,fontWeight:900,marginBottom:12,letterSpacing:1,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {(form.label||"EVENTO").toUpperCase()}
                {(()=>{
                  const idModelloAttuale = form.modelloId || form.evtModelloId;
                  const modSel = idModelloAttuale && modelli.find(m=>m.id===idModelloAttuale);
                  if(!modSel || modSel.tempo==="h24" || !modSel.inizio) return null;
                  return <span style={{fontSize:14,color:T.sub,fontWeight:700}}>{modSel.inizio}→{modSel.fine||""}</span>;
                })()}
                <span style={{fontSize:12,color:T.sub,fontWeight:700}}>✎ cambia modello</span>
              </div>
            )}
            {modelli.length>0&&form.editId&&form._showModPicker&&(()=>{
              const modelliDelCal = modelliOrdinati.filter(m=>{
                if(!calId) return true;
                const mcid = m.calendarId||mainCalId;
                return mcid===calId;
              });
              if(modelliDelCal.length===0) return null;
              return (
              <>
                <div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600}}>CAMBIA MODELLO TURNO</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  {modelliDelCal.map(m=>{
                    const c=m.coloreCustom||colByTime(m.inizio);
                    return (
                      <button key={m.id}
                        onClick={()=>setForm(f=>({...f,modelloId:m.id,shiftId:null,label:m.label||m.titolo,colorOvr:null,
                          dur:m.tempo==="h24"?"allday":m.tempo==="6h15"?"fixed":m.tempo==="6h30"?"fixed30":"custom",
                          tIn:m.inizio||"",
                          tOut:m.tempo==="6h15"&&m.inizio?calcFine6h15(m.inizio):m.tempo==="6h30"&&m.inizio?calcFine6h30(m.inizio):(m.fine||""),
                          protPagFine:"",protRecFine:"",protMenoRecIn:"",protMenoRecOut:"",
                          _showModPicker:false}))}
                        style={{background:form.modelloId===m.id?c:T.surface,
                          border:`2px solid ${form.modelloId===m.id?c:T.border}`,
                          borderRadius:10,padding:"6px 10px",cursor:"pointer",
                          color:form.modelloId===m.id?"#fff":T.sub,fontSize:11,fontWeight:700,
                          display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:c}}/>
                        {m.titolo}
                        {m.tempo!=="h24"&&m.inizio&&(
                          <span style={{opacity:0.75,fontWeight:600}}>{m.inizio}→{m.fine||""}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
              );
            })()}
            {!form.modelloId&&!form.editId&&(
              <div style={{fontSize:10,color:T.sub,fontWeight:900,marginBottom:12,letterSpacing:1}}>NUOVO EVENTO</div>
            )}
            {modelli.length>0&&!form.editId&&(()=>{
              const modelliDelCal = modelliOrdinati.filter(m=>{
                if(!calId) return true;
                const mcid = m.calendarId||mainCalId;
                return mcid===calId;
              });
              if(modelliDelCal.length===0) return null;
              return (
              <>
                {!form.modelloId&&<div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600}}>MODELLO TURNO</div>}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  {(form.modelloId?modelliDelCal.filter(m=>m.id===form.modelloId):modelliDelCal).map(m=>{
                    const c=m.coloreCustom||colByTime(m.inizio);
                    return (
                      <button key={m.id}
                        onClick={()=>setForm(f=>({...f,modelloId:m.id,shiftId:null,label:m.label||m.titolo,colorOvr:null,
                          dur:m.tempo==="h24"?"allday":m.tempo==="6h15"?"fixed":m.tempo==="6h30"?"fixed30":"custom",
                          tIn:m.inizio||"",
                          tOut:m.tempo==="6h15"&&m.inizio?calcFine6h15(m.inizio):m.tempo==="6h30"&&m.inizio?calcFine6h30(m.inizio):(m.fine||"")}))}
                        style={{background:form.modelloId===m.id?c:T.surface,
                          border:`2px solid ${form.modelloId===m.id?c:T.border}`,
                          borderRadius:10,padding:"6px 10px",cursor:"pointer",
                          color:form.modelloId===m.id?"#fff":T.sub,fontSize:11,fontWeight:700,
                          display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:c}}/>
                        {m.titolo}
                        {m.tempo!=="h24"&&m.inizio&&(
                          <span style={{opacity:0.75,fontWeight:600}}>{m.inizio}→{m.fine||""}</span>
                        )}
                      </button>
                    );
                  })}
                  {!form.modelloId&&(
                    <button onClick={()=>setForm(f=>({...f,modelloId:null}))}
                      style={{background:!form.modelloId?accent:T.surface,
                        border:`2px solid ${!form.modelloId?accent:T.border}`,
                        borderRadius:10,padding:"6px 10px",cursor:"pointer",
                        color:!form.modelloId?"#fff":T.sub,fontSize:11,fontWeight:700}}>
                      Libero
                    </button>
                  )}
                </div>
              </>
              );
            })()}
            {(activeCal?.shifts||[]).length>0&&!form.modelloId&&!form.editId&&(
              <>
                <div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600}}>TURNO CALENDARIO</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
                  {activeCal.shifts.map(s=>(
                    <button key={s.id}
                      onClick={()=>setForm(f=>({...f,shiftId:s.id,label:s.label,colorOvr:null}))}
                      style={{background:form.shiftId===s.id?s.color:T.surface,
                        border:`2px solid ${form.shiftId===s.id?s.color:T.border}`,
                        borderRadius:10,padding:"8px 4px",cursor:"pointer",
                        color:form.shiftId===s.id?"#fff":T.sub,fontSize:11,fontWeight:700}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color,margin:"0 auto 4px"}}/>
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {!form.shiftId&&!form.modelloId&&!form.editId&&(
              <AutocompleteInput value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
                suggestions={autocompleteValori.titolo}
                onRemoveSuggestion={s=>rimuoviValoreAutocomplete("titolo", s)}
                placeholder="NOME EVENTO..."
                style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:8,padding:"9px 10px",color:T.text,fontSize:13,
                  marginBottom:10,boxSizing:"border-box",outline:"none"}}/>
            )}
            {!form.modelloId&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:14,color:T.sub,fontWeight:700}}>COLORE</span>
                <div style={{position:"relative"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",cursor:"pointer",
                    background:form.colorOvr||(form.shiftId?activeCal?.shifts?.find(s=>s.id===form.shiftId)?.color:activeCal?.color)||"#94a3b8",
                    border:`2px solid ${T.border}`}}
                    onClick={e=>{e.stopPropagation();setPal(pal==="ec"?null:"ec");}}/>
                  {pal==="ec"&&<ColorPickerModal T={T}
                    cur={form.colorOvr||(form.shiftId?activeCal?.shifts?.find(s=>s.id===form.shiftId)?.color:activeCal?.color)||"#94a3b8"}
                    title="Colore evento"
                    onPick={p=>setForm(f=>({...f,colorOvr:p}))}
                    onClose={()=>setPal(null)}
                    coloriUsati={[...new Set(modelli.map(m=>m.coloreCustom||(m.tempo==="h24"?COLORE_H24:colByTime(m.inizio))).filter(Boolean))]}/>}
                </div>
                {form.colorOvr&&(
                  <button onClick={()=>setForm(f=>({...f,colorOvr:null}))}
                    style={{background:"none",border:"none",color:T.sub,fontSize:13,fontWeight:700,cursor:"pointer"}}>↩ auto</button>
                )}
              </div>
            )}
            <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>DURATA</div>
            <div style={{display:"flex",gap:4,marginBottom:10}}>
              {[["allday","H24"],["fixed","6h 15m"],["fixed30","6h 30m"],["custom","PERSONALIZZATO"]].map(([v,l])=>(
                <button key={v} onClick={()=>setForm(f=>({...f,dur:v}))}
                  style={{flex:1,padding:"7px 1px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700,
                    background:form.dur===v?accent:T.surface,
                    color:form.dur===v?"#fff":T.sub,
                    border:`1.5px solid ${form.dur===v?accent:T.border}`}}>{l}</button>
              ))}
            </div>
            {form.dur!=="allday"&&(
  <div style={{marginBottom:10}}>
    <div style={{display:"flex",gap:8,marginBottom:8}}>
      <div style={{flex:1}}>
        <div style={{fontSize:9,color:T.sub,marginBottom:3}}>
          {form.modelloId ? "INGRESSO (promemoria, non modifica il modello)" : "INGRESSO"}
        </div>
        <SmartTimeInput value={form.tIn||""} onChange={v=>setForm(f=>({...f,tIn:v,
          tOut: f.dur==="fixed"&&v ? calcFine6h15(v) : f.dur==="fixed30"&&v ? calcFine6h30(v) : ""}))}
          style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
      </div>
      {form.dur==="custom"&&(
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:T.sub,marginBottom:3}}>USCITA</div>
          <SmartTimeInput value={form.tOut||""} onChange={v=>setForm(f=>({...f,tOut:v}))}
            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
        </div>
      )}
      {form.dur==="fixed"&&form.tIn&&(
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:T.sub,marginBottom:3}}>{form.modelloId ? "USCITA (promemoria)" : "USCITA (modif.)"}</div>
          <SmartTimeInput value={form.tOut||calcFine6h15(form.tIn)} onChange={v=>setForm(f=>({...f,tOut:v}))}
            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
        </div>
      )}
      {form.dur==="fixed30"&&form.tIn&&(
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:T.sub,marginBottom:3}}>USCITA (modif.)</div>
          <SmartTimeInput value={form.tOut||calcFine6h30(form.tIn)} onChange={v=>setForm(f=>({...f,tOut:v}))}
            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
        </div>
      )}
    </div>
    {(()=>{
      const tBase = form.tOut||calcFine6h15(form.tIn)||"";
      function calcDur(oraFine){
        const m1=oraInMinuti(tBase), m2=oraInMinuti(oraFine);
        if(m1===null||m2===null) return "";
        let d=m2-m1;
        if(d<0) d+=24*60;
        return d>0?Math.floor(d/60)+"h"+(d%60>0?" "+d%60+"m":""):"";
      }
      // Se l'evento in modifica Ã¨ esso stesso un evento di protrazione
      // (creato a partire dai campi PROTRAZIONE A PAGAMENTO/RECUPERO di un
      // turno base), non ha senso mostrargli di nuovo quegli stessi campi:
      // qui mostriamo solo la durata effettiva (ingresso/uscita di questo
      // evento), che Ã¨ l'unica informazione rilevante per lui.
      const tipoQuestoEvento = form.editId ? tipoModelloProtrazione(form.evtModelloId) : null;
      if(tipoQuestoEvento){
        const m1=oraInMinuti(form.tIn), m2=oraInMinuti(form.tOut);
        let durataEvento = "";
        if(m1!==null&&m2!==null){
          let d=m2-m1; if(d<0) d+=24*60;
          durataEvento = d>0?Math.floor(d/60)+"h"+(d%60>0?" "+d%60+"m":""):"";
        }
        const colore = tipoQuestoEvento==="recupero" ? "#64748b" : tipoQuestoEvento==="meno_recupero" ? "#dc2626" : "#8b5cf6";
        const etichetta = tipoQuestoEvento==="recupero" ? "PROTRAZIONE A RECUPERO" : tipoQuestoEvento==="meno_recupero" ? "-PROTRAZIONE A RECUPERO" : "PROTRAZIONE A PAGAMENTO";

        // Sezione storni: solo per RECUPERO e MENO_RECUPERO (il PAGAMENTO
        // non entra nel meccanismo di credito/consumo). Ricalcolo dinamico
        // ogni volta che il form Ã¨ aperto, cosÃ¬ riflette sempre lo stato
        // corrente del calendario.
        let sezioneStorni = null;
        if((tipoQuestoEvento==="recupero" || tipoQuestoEvento==="meno_recupero") && form.editId){
          const { perEvento } = computeStornoRecupero();
          const info = perEvento[form.editId];
          function fmtData(dateKey){
            const [y,mm,d] = dateKey.split("-");
            return `${d}/${mm}/${y}`;
          }
          function fmtMin(m){
            if(m<=0) return "0m";
            return Math.floor(m/60)+"h"+(m%60>0?" "+(m%60)+"m":"");
          }
          if(info){
            const etichettaResiduo = tipoQuestoEvento==="recupero" ? "Credito residuo" : "Non coperto";
            const etichettaLista = tipoQuestoEvento==="recupero" ? "Usato da" : "Coperto da";
            sezioneStorni = (
              <div style={{marginTop:6,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:info.storni.length>0?6:0}}>
                  <span style={{fontSize:11,color:T.sub,fontWeight:700}}>{etichettaResiduo}</span>
                  <span style={{fontSize:12,fontWeight:900,
                    color:info.minutiResidui>0?(tipoQuestoEvento==="recupero"?"#16a34a":"#dc2626"):T.sub}}>
                    {fmtMin(info.minutiResidui)}
                  </span>
                </div>
                {info.storni.length>0 && (
                  <div>
                    <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:4}}>{etichettaLista}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      {info.storni.map((s,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                          <span style={{color:T.text,fontWeight:600}}>{fmtData(s.dateKey)}</span>
                          <span style={{color:colore,fontWeight:800}}>{fmtMin(s.minuti)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }
        }

        return (
          <div style={{marginBottom:4}}>
            <div style={{width:"100%",padding:"5px 8px",borderRadius:8,
              fontSize:9,fontWeight:800,textAlign:"center",
              background:colore,color:"#fff",marginBottom:4}}>
              {etichetta}
            </div>
            <div style={{background:T.surface,border:`1.5px solid ${colore}`,borderRadius:8,
              padding:"8px 8px",textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:900,color:colore}}>{durataEvento||"—"}</div>
            </div>
            {sezioneStorni}
          </div>
        );
      }
      const durPag = calcDur(form.protPagFine||"");
      const durRec = calcDur(form.protRecFine||"");
      // -PROTRAZIONE A RECUPERO: consumo del credito, calcolato come
      // ritardo in entrata (Entrata effettiva dopo l'ingresso previsto)
      // + anticipo in uscita (Uscita effettiva prima dell'uscita prevista),
      // esattamente come in sincronizzaEventiProtrazione. Mostro la durata
      // totale risultante come riscontro visivo.
      function calcDurMenoRec(){
        const tInBase = form.tIn||"", tOutBase = form.tOut||calcFine6h15(form.tIn)||calcFine6h30(form.tIn)||"";
        const mIn1=oraInMinuti(tInBase), mIn2=oraInMinuti(form.protMenoRecIn||"");
        const mOut1=oraInMinuti(tOutBase), mOut2=oraInMinuti(form.protMenoRecOut||"");
        let ritardoEntrata=0, anticipoUscita=0;
        if(mIn1!==null&&mIn2!==null){ let d=mIn2-mIn1; if(d<0) d+=24*60; ritardoEntrata=Math.max(0,d); }
        if(mOut1!==null&&mOut2!==null){ let d=mOut1-mOut2; if(d<0) d+=24*60; anticipoUscita=Math.max(0,d); }
        const tot = ritardoEntrata+anticipoUscita;
        return tot>0 ? Math.floor(tot/60)+"h"+(tot%60>0?" "+tot%60+"m":"") : "";
      }
      const durMenoRec = calcDurMenoRec();
      return (
        <>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}>
            <div style={{width:"100%",padding:"5px 8px",borderRadius:8,
              fontSize:9,fontWeight:800,textAlign:"center",
              background:"#8b5cf6",color:"#fff",marginBottom:4}}>
              PROTRAZIONE A PAGAMENTO
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <SmartTimeInput value={form.protPagFine||""} onChange={v=>setForm(f=>({...f,protPagFine:v}))}
                style={{width:64,background:T.surface,border:`1.5px solid #8b5cf6`,
                  borderRadius:8,padding:"5px 6px",color:T.text,fontSize:12,outline:"none"}}/>
              <div style={{background:T.surface,border:"1.5px solid #8b5cf6",borderRadius:8,
                padding:"5px 8px",flex:1,textAlign:"center"}}>
                <div style={{fontSize:12,fontWeight:900,color:"#8b5cf6"}}>{durPag||"—"}</div>
              </div>
            </div>
          </div>
          <div style={{flex:1}}>
            <div style={{width:"100%",padding:"5px 8px",borderRadius:8,
              fontSize:9,fontWeight:800,textAlign:"center",
              background:"#64748b",color:"#fff",marginBottom:4}}>
              PROTRAZIONE A RECUPERO
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <SmartTimeInput value={form.protRecFine||""} onChange={v=>setForm(f=>({...f,protRecFine:v}))}
                style={{width:64,background:T.surface,border:`1.5px solid #64748b`,
                  borderRadius:8,padding:"5px 6px",color:T.text,fontSize:12,outline:"none"}}/>
                <div style={{background:T.surface,border:"1.5px solid #64748b",borderRadius:8,
                  padding:"5px 8px",flex:1,textAlign:"center"}}>
                  <div style={{fontSize:12,fontWeight:900,color:"#64748b"}}>{durRec||"—"}</div>
                </div>
            </div>
          </div>
        </div>
        <div style={{marginTop:8}}>
          <div style={{width:"100%",padding:"5px 8px",borderRadius:8,
            fontSize:9,fontWeight:800,textAlign:"center",
            background:"#dc2626",color:"#fff",marginBottom:4}}>
            -PROTRAZIONE A RECUPERO
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:T.sub,marginBottom:3}}>Entrata effettiva</div>
              <SmartTimeInput value={form.protMenoRecIn||""} onChange={v=>setForm(f=>({...f,protMenoRecIn:v}))}
                style={{width:"100%",background:T.surface,border:"1.5px solid #dc2626",
                  borderRadius:8,padding:"5px 6px",color:T.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:T.sub,marginBottom:3}}>Uscita effettiva</div>
              <SmartTimeInput value={form.protMenoRecOut||""} onChange={v=>setForm(f=>({...f,protMenoRecOut:v}))}
                style={{width:"100%",background:T.surface,border:"1.5px solid #dc2626",
                  borderRadius:8,padding:"5px 6px",color:T.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{background:T.surface,border:"1.5px solid #dc2626",borderRadius:8,
              padding:"5px 8px",minWidth:56,textAlign:"center",alignSelf:"flex-end"}}>
              <div style={{fontSize:12,fontWeight:900,color:"#dc2626"}}>{durMenoRec?"-"+durMenoRec:"—"}</div>
            </div>
          </div>
        </div>
        </>
      );
    })()}
  </div>
)}

{(()=>{
  // Selettore gruppo report per il SINGOLO EVENTO: escluso per i tre
  // modelli PROTRAZIONE (pagamento/recupero/-recupero), per tutti gli
  // altri modelli mostra la possibilitÃ  di forzare manualmente il gruppo
  // (1Â° Turno/2Â° Turno/APP/AUTO) per questo evento, con scelta inline
  // (niente popup/modale) se applicare solo a questo evento o a tutti gli
  // eventi di quel modello.
  const modelloIdCorrente = form.modelloId || form.evtModelloId || null;
  if(!modelloIdCorrente) return null;
  if(tipoModelloProtrazione(modelloIdCorrente)) return null;
  const modelloCorrente = modelli.find(m=>m.id===modelloIdCorrente);
  if(!modelloCorrente) return null;

  const GRUPPI_EVENTO = [
    { key:"", label:"Automatico" },
    { key:"primo", label:"1° Turno" },
    { key:"secondo", label:"2° Turno" },
    { key:"app", label:"APP" },
    { key:"auto", label:"AUTO" },
  ];
  const categoriaTurnoAttuale = form.categoriaTurno||"";
  const categoriaAppAutoAttuale = form.categoriaAppAuto||"";
  const haOverrideAttivo = !!(categoriaTurnoAttuale || categoriaAppAutoAttuale);

  function selezionaGruppo(key){
    if(key==="primo"||key==="secondo"){
      setForm(f=>({...f, categoriaTurno:key}));
    } else if(key==="app"||key==="auto"){
      setForm(f=>({...f, categoriaAppAuto:key}));
    } else {
      setForm(f=>({...f, categoriaTurno:"", categoriaAppAuto:""}));
    }
  }
  function applicaATuttiGliEventi(){
    // "Tutti gli eventi di questo modello": stessa cosa che giÃ  fa il form
    // Modello (categoria/categoriaAppAuto sul modello), non un override sul
    // singolo evento. Qui puliamo l'override locale (che avrebbe comunque
    // prioritÃ  su questo) e mandiamo l'utente a modificare il modello.
    setForm(f=>({...f, categoriaTurno:"", categoriaAppAuto:""}));
    setScreen("modelli");
  }

  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6}}>GRUPPO REPORT (per questo evento)</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {GRUPPI_EVENTO.map(g=>{
          const attivo = g.key===""
            ? !haOverrideAttivo
            : (categoriaTurnoAttuale===g.key || categoriaAppAutoAttuale===g.key);
          return (
            <button key={g.key} onClick={()=>selezionaGruppo(g.key)}
              style={{padding:"7px 12px",borderRadius:10,cursor:"pointer",
                fontWeight:700,fontSize:12,border:"2px solid transparent",
                background:attivo?accent:T.s2,
                color:attivo?"#fff":T.sub}}>{g.label}</button>
          );
        })}
      </div>
      {haOverrideAttivo && (
        <div style={{marginTop:8,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:T.sub}}>Applica a:</span>
          <span style={{fontSize:11,fontWeight:800,color:accent,
            background:accent+"22",borderRadius:8,padding:"4px 8px"}}>
            Solo questo evento (attivo)
          </span>
          <button onClick={applicaATuttiGliEventi}
            style={{fontSize:11,fontWeight:700,color:T.sub,background:"none",
              border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 8px",cursor:"pointer"}}>
            Tutti gli eventi di "{modelloCorrente.titolo}" →
          </button>
        </div>
      )}
    </div>
  );
})()}

            <AutocompleteInput value={form.auto||""} onChange={e=>{
                const raw=e.target.value.toUpperCase();
                const stripped=raw.replace(/^(CH\s*)+/i,"").trim();
                setForm(f=>({...f,auto:stripped?"CH "+stripped:""}));
              }}
              suggestions={autocompleteValori.auto}
              onRemoveSuggestion={s=>rimuoviValoreAutocomplete("auto", s)}
              placeholder="🚗 Numero auto/pattuglia (opzionale)..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none"}}/>
            <AutocompleteInput as="textarea" value={form.collega||""} onChange={e=>{setForm(f=>({...f,collega:e.target.value.toUpperCase()}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
              suggestions={autocompleteValori.collega}
              onRemoveSuggestion={s=>rimuoviValoreAutocomplete("collega", s)}
              textareaProps={{rows:1}}
              placeholder="👮 Collega" rows={1}
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none",resize:"none",fontFamily:"inherit",
                overflow:"hidden",minHeight:36}}/>
            <AutocompleteInput value={form.place||""} onChange={e=>setForm(f=>({...f,place:e.target.value.toUpperCase()}))}
              suggestions={autocompleteValori.luogo}
              onRemoveSuggestion={s=>rimuoviValoreAutocomplete("luogo", s)}
              placeholder="📍 LUOGO (OPZIONALE)..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none"}}/>
            {form.place&&(
              <input value={form.map||""} onChange={e=>setForm(f=>({...f,map:e.target.value}))}
                placeholder="🗺️ Link Google Maps..."
                style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                  marginBottom:6,boxSizing:"border-box",outline:"none"}}/>
            )}
            <input value={form.note||""} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
              placeholder="Note..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:12,boxSizing:"border-box",outline:"none"}}/>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>{setForm(null);setPal(null);}}
                style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:10,color:T.sub,padding:"13px 0",cursor:"pointer",fontSize:16,fontWeight:700}}>
                Annulla
              </button>
              <button onClick={form.editId?updateEvt:saveEvt}
                style={{flex:2,background:accent,border:"none",borderRadius:10,
                  color:getContrastTextColor(accent),padding:"13px 0",cursor:"pointer",fontSize:16,fontWeight:800}}>
                💾 Salva
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const dbModal = showDbModal && (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center",padding:12}}
      onClick={()=>setShowDbModal(false)}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:440,
        maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
          <span style={{fontSize:14,fontWeight:900,color:T.text}}>☁️ Dati Salvati in Supabase</span>
          <button onClick={()=>setShowDbModal(false)}
            style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18}}>×</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <div style={{background:T.s2,borderRadius:10,padding:12,textAlign:"center"}}>
              <div style={{fontSize:10,color:T.sub,fontWeight:800}}>CALENDARI</div>
              <div style={{fontSize:22,fontWeight:900,color:accent}}>{dbCalsCount}</div>
            </div>
            <div style={{background:T.s2,borderRadius:10,padding:12,textAlign:"center"}}>
              <div style={{fontSize:10,color:T.sub,fontWeight:800}}>EVENTI TOTALI</div>
              <div style={{fontSize:22,fontWeight:900,color:"#10b981"}}>{dbEvtsCount}</div>
            </div>
          </div>
          {dbRawData?(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:T.sub,marginBottom:6}}>I TUOI CALENDARI ({dbRawData.calendars.length})</div>
                {dbRawData.calendars.map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,background:T.s2,borderRadius:8,padding:"8px 10px",marginBottom:4}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:c.color}}/>
                    <span style={{fontSize:12,fontWeight:700,color:T.text,flex:1}}>{c.name}</span>
                    {c.is_main&&<span style={{fontSize:9,background:accent+"33",color:accent,padding:"2px 6px",borderRadius:10,fontWeight:800}}>Principale</span>}
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:T.sub,marginBottom:6}}>RECENTI EVENTI ({dbRawData.events.length})</div>
                {dbRawData.events.slice(0,50).map(e=>{
                  const cal=dbRawData.calendars.find(c=>c.id===e.calendar_id);
                  return (
                    <div key={e.id} style={{background:T.s2,borderRadius:8,padding:"8px 10px",marginBottom:4}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,fontWeight:800,color:e.color}}>{e.label}</span>
                        <span style={{fontSize:9,color:T.sub}}>{fmtDataIT(e.date_key)}</span>
                      </div>
                      <div style={{fontSize:9,color:T.sub}}>Cal: {cal?.name||"?"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ):(
            <div style={{textAlign:"center",padding:24,color:T.sub,fontSize:12}}>⏳ Caricamento...</div>
          )}
        </div>
        <div style={{padding:12,borderTop:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={async()=>{
              setRipristinoInCorso(true);
              const ris = await ripristinaModelliMancanti();
              setRipristinoInCorso(false);
              setRipristinoEsito(ris);
            }}
            disabled={ripristinoInCorso}
            style={{width:"100%",background:accent,border:"none",borderRadius:10,color:"#fff",padding:"10px 0",cursor:ripristinoInCorso?"default":"pointer",fontWeight:800,fontSize:12,opacity:ripristinoInCorso?0.6:1}}>
            {ripristinoInCorso?"⏳ Controllo in corso...":"🔗 Controlla eventi senza modello"}
          </button>
          {ripristinoEsito&&(
            <div style={{background:T.s2,borderRadius:8,padding:"8px 10px",fontSize:11,color:T.text}}>
              {ripristinoEsito.totale===0
                ? "Nessun evento senza modello trovato ✅"
                : `${ripristinoEsito.risolti.length} di ${ripristinoEsito.totale} eventi ricollegati automaticamente.${ripristinoEsito.nonRisolti.length?` ${ripristinoEsito.nonRisolti.length} da controllare a mano (nessun modello corrispondente trovato).`:""}`}
            </div>
          )}
          <button onClick={()=>setShowDbModal(false)}
            style={{width:"100%",background:"#64748b",border:"none",borderRadius:10,color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );

  return { modelliView, settingsView, dayModal, dbModal };
}

    
