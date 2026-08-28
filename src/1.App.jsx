    import { useState, useRef, useMemo, Fragment } from "react";
import { useAppCore } from "./6.Logica";
import VistaCalendario from "./3.Calendario";
import VistaModelli from "./2.Modelli";
import { ModaleErroriMultipli } from "./5.Comuni";
import {
  getContrastTextColor, NOMI_MESI_IT, calcFine6h15, calcFine6h30, calcDurata,
  fmtDataIT, impostaSilenziamentoErrore,
  ModelForm, GrigliaRotazione, NLRSScalanteView, DomenicheView, NLRSView,
} from "./4.Rotazione";
import { ImportaTurniJsonDialog, ImportaFotoDialog } from "./7.Turni";

// ═══════════════════════════════════════════════════════════════
// BottomNav — barra di navigazione in basso, come componente React
// vero e proprio (non più un div statico in index.html). Riceve
// screen/setScreen/T/accent da App e si ridisegna da sola quando
// cambiano — niente più window.__navGo né getElementById.
// ═══════════════════════════════════════════════════════════════
function BottomNav({ screen, setScreen, T, accent }) {
  const NAV_ITEMS = [
    { id: "cal", icon: "▦", label: "Calendario" },
    { id: "report", icon: "📊", label: "Report" },
    { id: "modelli", icon: "📋", label: "Modelli" },
    { id: "settings", icon: "⚙", label: "Impostazioni" },
  ];
  return (
    <nav aria-label="Navigazione principale" style={{
      position: "fixed", left: 0, right: 0, bottom: 0, maxWidth: 480,
      margin: "0 auto", display: "flex", borderTop: `1px solid ${T.border}`,
      background: T.surface, zIndex: 100000,
    }}>
      {NAV_ITEMS.map(item => {
        const isActive = screen === item.id;
        return (
          <button key={item.id} onClick={() => setScreen(item.id)}
            aria-label={item.label} aria-current={isActive ? "page" : undefined}
            style={{
              flex: 1, background: "none", border: "none", padding: "5px 0",
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 1, fontFamily: "system-ui,sans-serif",
            }}>
            <span aria-hidden="true" style={{ fontSize: 16, color: isActive ? accent : T.sub }}>{item.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? accent : T.sub }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════
// App.jsx — INDICE dell'app.
//
// Chiama useAppCore() per avere tutto lo stato e la logica, poi
// monta Core1 (Calendario + Report) e Core2 (Modelli + Impostazioni
// + Day Modal + DB Modal), e assembla la shell (barra di
// navigazione in basso, banner di errore).
//
// Per modificare una vista specifica, apri core1.jsx o core2.jsx.
// Per aggiungere nuovo stato condiviso, apri useAppCore.js.
// ═══════════════════════════════════════════════════════════════

export default function App({ session }){
  const C = useAppCore(session);
  const { calView, reportView, goPrevMonth, goNextMonth } = VistaCalendario({ C });
  const { modelliView, settingsView, dayModal, dbModal } = VistaModelli({ C });

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
    setPrevGrid, REPORT_TEMPLATES, calcolaOrdineModelli, updateFascia,
  } = C;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",height:"100dvh",background:T.bg,
      fontFamily:"system-ui,sans-serif",maxWidth:480,margin:"0 auto",overflow:"hidden"}}
      onClick={()=>pal&&setPal(null)}>
      {codaErrori.length>0 && (()=>{
        if(codaErrori.length===1){
          // Un solo errore: schermata semplice, con la checkbox di
          // silenziamento diretta (comportamento invariato).
          const err = codaErrori[0];
          let nonMostrarePiu = false;
          return (
            <div style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.5)",
              display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
              onClick={e=>e.stopPropagation()}>
              <div style={{background:"#fff",borderRadius:14,padding:20,maxWidth:380,width:"100%",
                boxShadow:"0 10px 40px rgba(0,0,0,0.3)"}}>
                <div style={{fontSize:15,fontWeight:900,color:"#000",marginBottom:8}}>⚠️ {err.contesto}</div>
                <div style={{fontSize:13,color:"#000",marginBottom:14,lineHeight:1.4}}>{err.messaggio}</div>
                <div style={{fontSize:11,color:"#666",marginBottom:14}}>
                  Questo errore resta comunque salvato nel Log (Impostazioni → Log), riattivabile da lì in qualsiasi momento.
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,cursor:"pointer",fontSize:12,color:"#000"}}>
                  <input type="checkbox" defaultChecked={false}
                    onChange={e=>{ nonMostrarePiu = e.target.checked; }}
                    style={{width:16,height:16}}/>
                  Non mostrare più questo errore
                </label>
                <button onClick={()=>{
                    if(nonMostrarePiu) impostaSilenziamentoErrore(err.contesto, true);
                    setCodaErrori(prev=>prev.slice(1));
                  }}
                  style={{width:"100%",background:accent,border:"none",borderRadius:10,color:"#fff",
                    padding:"11px 0",fontWeight:800,fontSize:14,cursor:"pointer"}}>
                  OK
                </button>
              </div>
            </div>
          );
        }
        // Più errori accodati insieme (es. un ciclo con più righe fallite):
        // un'unica schermata con l'elenco, ciascuno espandibile per vedere
        // il dettaglio, un solo bottone OK per chiuderli tutti insieme —
        // invece di N popup identici da chiudere in sequenza.
        return <ModaleErroriMultipli errori={codaErrori} accent={accent}
          onChiudi={(contestiSilenziati)=>{
            contestiSilenziati.forEach(c=>impostaSilenziamentoErrore(c, true));
            setCodaErrori([]);
          }}/>;
      })()}
      <style>{`
        @keyframes calSlideOutLeft { from { transform:translateX(0); opacity:1; } to { transform:translateX(-100%); opacity:0; } }
        @keyframes calSlideOutRight { from { transform:translateX(0); opacity:1; } to { transform:translateX(100%); opacity:0; } }
        @keyframes calSlideInLeft { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
        @keyframes calSlideInRight { from { transform:translateX(-100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
        @keyframes calSlideOutUp { from { transform:translateY(0); opacity:1; } to { transform:translateY(-100%); opacity:0; } }
        @keyframes calSlideOutDown { from { transform:translateY(0); opacity:1; } to { transform:translateY(100%); opacity:0; } }
        @keyframes calSlideInUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @keyframes calSlideInDown { from { transform:translateY(-100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
        .calOuterArrow{display:flex}
        @media (hover:none), (max-width:640px) {
          .calOuterArrow{display:none}
          .calSlideOutLeft { animation-name:calSlideOutUp !important; }
          .calSlideOutRight { animation-name:calSlideOutDown !important; }
          .calSlideInLeft { animation-name:calSlideInUp !important; }
          .calSlideInRight { animation-name:calSlideInDown !important; }
        }
      `}</style>
      {screen==="cal" && (
        <>
          <button className="calOuterArrow" onClick={goPrevMonth}
            style={{position:"fixed",left:"calc(50% - 320px)",top:"50%",transform:"translateY(-50%)",
              zIndex:50,width:44,height:44,borderRadius:"50%",border:"1px solid #e2e8f0",
              background:"#fff",color:"#334155",fontSize:22,fontWeight:900,
              alignItems:"center",justifyContent:"center",cursor:"pointer",
              boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>‹</button>
          <button className="calOuterArrow" onClick={goNextMonth}
            style={{position:"fixed",right:"calc(50% - 320px)",top:"50%",transform:"translateY(-50%)",
              zIndex:50,width:44,height:44,borderRadius:"50%",border:"1px solid #e2e8f0",
              background:"#fff",color:"#334155",fontSize:22,fontWeight:900,
              alignItems:"center",justifyContent:"center",cursor:"pointer",
              boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>›</button>
        </>
      )}
      {dbError && (
        <div style={{position:"fixed",top:8,left:"50%",transform:"translateX(-50%)",zIndex:9999,
          maxWidth:440,width:"calc(100% - 24px)",background:"#ef4444",color:"#fff",
          padding:"10px 14px",borderRadius:10,fontSize:12,fontWeight:700,
          boxShadow:"0 4px 16px rgba(0,0,0,0.25)",display:"flex",alignItems:"center",gap:8}}
          onClick={()=>setDbError("")}>
          <span style={{flex:1}}>{dbError}</span>
          <span style={{cursor:"pointer",opacity:0.8}}>✕</span>
        </div>
      )}
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",paddingBottom:44}}>
        {screen==="cal"      && calView}
        {screen==="report"   && reportView}
        {screen==="modelli"  && modelliView}
        {screen==="settings" && settingsView}
      </div>
      <BottomNav screen={screen} setScreen={setScreen} T={T} accent={accent} />
      {banner&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
        background:"rgba(0,0,0,0.75)",color:"#fff",padding:"6px 16px",
        borderRadius:20,fontSize:12,zIndex:9999,pointerEvents:"none"}}>{banner}</div>}
      {dayModal}
      {dbModal}
      {showModelForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:600,
          display:"flex",alignItems:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowModelForm(false);}}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",maxHeight:"92vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 0"}}>
              <button onClick={()=>setShowModelForm(false)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer",padding:4}}>‹</button>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>
                {editModello?"Modifica modello":"Nuovo modello"}
              </div>
              <div style={{width:32}}/>
            </div>
            <ModelForm T={T} form={modelForm} setForm={setModelForm} accent={accent} dark={dark}
              fasceAutomatiche={fasceAutomatiche} modelli={modelli}
              reports={store.reports||[]} getConteggioConfig={getConteggioConfig} updateConteggioConfig={updateConteggioConfig}
              suggerimentiTitolo={autocompleteValori.titolo} suggerimentiNomeVis={autocompleteValori.nome_visualizzato}
              onRimuoviSuggerimento={rimuoviValoreAutocomplete}
              onSave={async()=>{
                const esito = await saveModello({...modelForm,id:editModello?.id});
                if(esito?.ok){
                  setShowModelForm(false);
                  // Torna da dove si era partiti: se il form era stato aperto dal
                  // picker "Scegli modello" (creazione al volo mentre si sceglieva
                  // un modello per un evento), si riapre il picker; se era stato
                  // aperto dalla lista Modelli, si resta semplicemente sulla lista
                  // (nessun picker da riaprire — prima si andava sempre al picker
                  // anche partendo dalla lista, comportamento non voluto).
                  if(origineModelForm==="picker") setShowModelloPicker(true);
                } else {
                  alert("Errore nel salvataggio del modello: "+(esito?.error||"errore sconosciuto")+"\n\nIl modello NON è stato salvato, controlla i dati e riprova.");
                }
              }}/>
          </div>
        </div>
      )}
      {showRotazionePicker&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,
          display:"flex",flexDirection:"column"}}>
          {!showRotDetail?(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
                <button onClick={()=>setShowRotazionePicker(false)}
                  style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>Scegli rotazione</div>
                <div style={{width:32}}/>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
                {rotazioni.length===0&&(
                  <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                    <div style={{fontSize:36,marginBottom:10}}>🔄</div>
                    <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessuna rotazione</div>
                  </div>
                )}
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                  {rotazioni.map((r,i,arr)=>{
                    const tipoLabel=r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL/RS":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":"✏️ Personalizzata";
                    return (
                      <div key={r.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                        <div onClick={()=>{
                          if(r.tipo==="domeniche"||r.tipo==="nlrs_scalante"){
                            setShowApplyRotDialog(r);
                          } else {
                            setShowRotDetail(r);
                          }
                        }}
                          style={{display:"flex",alignItems:"center",padding:"14px 16px",cursor:"pointer"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:16,fontWeight:800,color:T.text}}>{r.titolo||"Senza nome"}</div>
                            <div style={{fontSize:13,color:T.sub,marginTop:2}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
                          </div>
                          <span style={{color:T.sub,fontSize:14}}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ):(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
                <button onClick={()=>setShowRotDetail(null)}
                  style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>{showRotDetail.titolo||"Rotazione"}</div>
                <button onClick={()=>{
                  const r=showRotDetail;
                  let modelloScelto=null;
                  if(r.tipo==="personalizzata"){
                    modelloScelto=modelli.find(m=>m.id===r.griglia?.[dayKey])||null;
                  } else if(r.tipo==="domeniche"){
                    const [di,dm,dd]=r.dataInizio.split("-").map(Number);
                    const inizio=new Date(di,dm-1,dd);
                    let prima=new Date(inizio);
                    while(prima.getDay()!==0) prima.setDate(prima.getDate()+1);
                    const [ty,tm,td]=dayKey.split("-").map(Number);
                    const target=new Date(ty,tm-1,td);
                    const diffMs=target-prima;
                    const diffSett=Math.floor(diffMs/(7*24*60*60*1000));
                    if(diffSett>=0&&target.getDay()===0){
                      const isLav=(diffSett%4)===0;
                      modelloScelto=modelli.find(m=>m.id===(isLav?r.modellaLavoroId:r.modelloNLId))||null;
                    }
                  } else if(r.tipo==="nlrs"||r.tipo==="nlrs_scalante"){
                    modelloScelto=modelli.find(m=>m.id===(r.modelloNLId||r.modelloRSId))||null;
                  }
                  if(!modelloScelto){
                    alert("Nessun modello previsto per questo giorno dalla rotazione");
                    return;
                  }
                  setForm({
                    modelloId:modelloScelto.id,
                    rotazioneId:r.id,
                    shiftId:null,
                    label:modelloScelto.titolo,
                    note:"",
                    dur:modelloScelto.tempo==="h24"?"allday":modelloScelto.tempo==="6h15"?"fixed":modelloScelto.tempo==="6h30"?"fixed30":"custom",
                    tIn:modelloScelto.inizio||"",
                    tOut:modelloScelto.fine||"",
                    place:"",map:"",colorOvr:null,collega:"",auto:"",
                    protPagFine:"",protRecFine:"",
                    protMenoRecIn:"",protMenoRecOut:"",
                  });
                  setShowRotDetail(null);
                  setShowRotazionePicker(false);
                }} style={{background:accent,border:"none",borderRadius:8,
                  color:getContrastTextColor(accent),fontSize:13,fontWeight:800,padding:"6px 14px",cursor:"pointer"}}>
                  Fatto
                </button>
              </div>
              <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:T.bg,display:"flex",flexDirection:"column"}}>
                {(()=>{
                  const modelliDelCalRot2 = modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId);
                  return (<>
                {showRotDetail.tipo==="domeniche"&&(
                  <DomenicheView rot={showRotDetail} T={T} accent={accent} modelli={modelliDelCalRot2} fasceAutomatiche={fasceAutomatiche} onUpdate={()=>{}}/>
                )}
                {showRotDetail.tipo==="nlrs"&&(
                  <NLRSView rot={showRotDetail} T={T} accent={accent} modelli={modelliDelCalRot2}/>
                )}
                {showRotDetail.tipo==="nlrs_scalante"&&(
                  <NLRSScalanteView rot={showRotDetail} T={T} accent={accent} modelli={modelliDelCalRot2}/>
                )}
                {showRotDetail.tipo==="personalizzata"&&(
                  <div style={{flex:1,minHeight:500}}>
                    <GrigliaRotazione rot={showRotDetail} T={T} accent={accent} modelli={modelliDelCalRot2} fasceAutomatiche={fasceAutomatiche} sundayColor={sundayColor} onUpdate={()=>{}}/>
                  </div>
                )}
                  </>);
                })()}
              </div>
            </>
          )}
        </div>
      )}
      {showModelloPicker&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,
          display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
            <button onClick={()=>{setShowModelloPicker(false);setQuickModeModello(null);}}
              style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
            <div style={{fontSize:16,fontWeight:900,color:T.text}}>
              {showModelloPicker==="quick"?(quickModeModello?"Tocca i giorni da riempire":"Scegli modello da applicare"):"Scegli modello"}
            </div>
            {showModelloPicker==="quick"&&!quickModeModello?(
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setShowImportaFotoDialog(true)}
                  style={{background:"none",border:"none",color:accent,fontSize:20,cursor:"pointer",width:32}}>📷</button>
                <button onClick={()=>setShowImportaTurniJsonDialog(true)}
                  style={{background:"none",border:"none",color:accent,fontSize:20,cursor:"pointer",width:32}}>📋</button>
                <button onClick={()=>{
                    if(confirm(`Cancellare TUTTI gli eventi di ${NOMI_MESI_IT[month]} ${year} su questo calendario? L'azione non è reversibile.`)){
                      cancellaTuttiEventiMese(year, month, calId);
                    }
                  }}
                  style={{background:"none",border:"none",color:"#ef4444",fontSize:20,cursor:"pointer",width:32}}>🗑️</button>
              </div>
            ):(
              <div style={{width:32}}/>
            )}
          </div>
          {showModelloPicker==="quick"&&quickModeModello&&(
            <div style={{padding:"10px 16px",background:"#0f172a",color:"#fff",fontSize:13,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>Modello attivo: <strong>{modelli.find(m=>m.id===quickModeModello)?.titolo}</strong></span>
              <button onClick={()=>{setShowModelloPicker(false);}}
                style={{background:"#fff",border:"none",borderRadius:8,padding:"6px 12px",
                  fontWeight:800,fontSize:12,cursor:"pointer"}}>Fine</button>
            </div>
          )}
          <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
            {modelli.length===0&&(
              <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                <div style={{fontSize:36,marginBottom:10}}>📋</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessun modello</div>
                <div style={{fontSize:13}}>Crea il tuo primo modello turno</div>
              </div>
            )}
            {(()=>{
              const modelliPicker = modelliOrdinati.filter(m=>{
                const mcid = m.calendarId||mainCalId;
                return !calId || mcid===calId;
              });
              if(modelliPicker.length===0) return null;
              return (
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                {modelliPicker.map((m,i,arr)=>{
                  const c=m.coloreCustom||colByTime(m.inizio);
                  const durata=m.tempo==="h24"?"H24"
                    :m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)} • 6h 15m`:m.tempo==="6h30"&&m.inizio?`${m.inizio} - ${calcFine6h30(m.inizio)} • 6h 30m`
                    :m.inizio&&m.fine?`${m.inizio} - ${m.fine} • ${calcDurata(m.inizio,m.fine)}`
                    :m.inizio?m.inizio:"";
                  return (
                    <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <div onClick={()=>{
                        if(showModelloPicker==="quick"){
                          setQuickModeModello(m.id);
                          return;
                        }
                        setForm({modelloId:m.id,shiftId:null,label:m.titolo,note:"",
                          dur:m.tempo==="h24"?"allday":m.tempo==="6h15"?"fixed":m.tempo==="6h30"?"fixed30":"custom",
                          tIn:m.inizio||"",tOut:m.fine||"",place:"",map:"",colorOvr:null,collega:"",auto:""});
                        setShowModelloPicker(false);
                      }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                        <div style={{width:36,height:36,borderRadius:10,background:c+"33",
                          border:`2px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center",
                          flexShrink:0,marginRight:12}}>
                          <div style={{width:14,height:14,borderRadius:"50%",background:c}}/>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
                            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
                          <div style={{fontSize:16,color:T.sub,marginTop:1}}>{durata}</div>
                        </div>
                        <span style={{color:T.sub,fontSize:14}}>›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}
            {(activeCal?.shifts||[]).length>0&&(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                {activeCal.shifts.map((s,i,arr)=>(
                  <div key={s.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <div onClick={()=>{
                      setForm({modelloId:null,shiftId:s.id,label:s.label,note:"",dur:"allday",
                        tIn:"",tOut:"",place:"",map:"",colorOvr:null,collega:"",auto:""});
                      setShowModelloPicker(false);
                    }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                      <div style={{width:36,height:36,borderRadius:10,background:s.color+"33",
                        border:`2px solid ${s.color}`,display:"flex",alignItems:"center",justifyContent:"center",
                        flexShrink:0,marginRight:12}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:s.color}}/>
                      </div>
                      <div style={{flex:1,fontSize:14,fontWeight:800,color:T.text}}>{s.label}</div>
                      <span style={{color:T.sub,fontSize:14}}>›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showModelloPicker!=="quick"&&(
              <>
                <div onClick={()=>{
                  setForm({modelloId:null,shiftId:null,label:"",note:"",dur:"allday",
                    tIn:"",tOut:"",place:"",map:"",colorOvr:null,collega:"",auto:""});
                  setShowModelloPicker(false);
                }} style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"12px 14px",
                  background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,cursor:"pointer",
                  color:T.sub,fontSize:13,fontWeight:700,marginBottom:12}}>
                  Evento libero (senza modello)
                </div>
                <button onClick={()=>{
                  setEditModello(null);
                  setModelForm({titolo:"",tempo:"personalizzato",inizio:"",fine:"",coloreCustom:null,posizione:""});
                  setOrigineModelForm("picker");
                  setShowModelForm(true);
                  setShowModelloPicker(false);
                }} style={{width:"100%",background:accent,border:"none",borderRadius:14,
                  color:getContrastTextColor(accent),padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
                  + Nuovo modello
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {showDeleteRotEvtDialog && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:600,
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setShowDeleteRotEvtDialog(null)}>
          <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:360,
            padding:20,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:8}}>Eliminare evento</div>
            <div style={{fontSize:13,color:T.sub,marginBottom:16}}>
              Questo evento fa parte di una rotazione. Cosa vuoi eliminare?
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              <button onClick={async()=>{
                  const {evt,dKey,cId}=showDeleteRotEvtDialog;
                  setShowDeleteRotEvtDialog(null);
                  await delEvt(dKey,cId,evt.id);
                }}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                  color:T.text,padding:"10px 12px",cursor:"pointer",fontWeight:700,fontSize:13,textAlign:"left"}}>
                Solo questa giornata
              </button>
              <button onClick={async()=>{
                  const {evt,dKey,cId}=showDeleteRotEvtDialog;
                  const n = parseInt(window.prompt("Quante ripetizioni vuoi eliminare (da questa data in poi)?","1"))||0;
                  setShowDeleteRotEvtDialog(null);
                  if(n>0) await delEvtiRotazioneDaData(evt.rotazioneId, dKey, cId, n);
                }}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                  color:T.text,padding:"10px 12px",cursor:"pointer",fontWeight:700,fontSize:13,textAlign:"left"}}>
                Solo N ripetizioni da questa data
              </button>
              <button onClick={async()=>{
                  const {evt,cId}=showDeleteRotEvtDialog;
                  if(window.confirm("Eliminare TUTTI gli eventi di questa rotazione? L'azione non è reversibile.")){
                    setShowDeleteRotEvtDialog(null);
                    await delTutteEvtiRotazione(evt.rotazioneId, cId);
                  }
                }}
                style={{background:"#ef444422",border:"1px solid #ef4444",borderRadius:10,
                  color:"#ef4444",padding:"10px 12px",cursor:"pointer",fontWeight:700,fontSize:13,textAlign:"left"}}>
                Tutti gli eventi della rotazione
              </button>
            </div>
            <button onClick={()=>setShowDeleteRotEvtDialog(null)}
              style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                color:T.sub,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
              Annulla
            </button>
          </div>
        </div>
      )}
      {showImportaFotoDialog && (
        <ImportaFotoDialog T={T} accent={accent} dark={dark}
          modelli={modelliOrdinati.filter(m=>(m.calendarId||mainCalId)===calId)}
          year={year} month={month}
          onClose={()=>setShowImportaFotoDialog(false)}
          onConfirm={async(righeValide)=>{
            const n = await importaEventiSingoli(righeValide);
            return n;
          }}/>
      )}
      {showImportaTurniJsonDialog && (
        <ImportaTurniJsonDialog T={T} accent={accent} dark={dark}
          importsRecenti={importsRecenti}
          year={year} month={month}
          onClose={()=>setShowImportaTurniJsonDialog(false)}
          onConfirm={async(righeJson)=>{
            const esito = await importaTurniPdfJson(righeJson);
            return esito;
          }}
          onDeleteImport={async(importId)=>{
            await delTuttiEventiImport(importId, calId);
          }}/>
      )}
      {showApplyRotDialog && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:600,
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setShowApplyRotDialog(null)}>
          <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:360,
            padding:20,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:8}}>Applica Rotazione</div>
            <div style={{fontSize:13,color:T.sub,marginBottom:16}}>
              Stai applicando la rotazione <strong>{showApplyRotDialog.titolo||"Senza nome"}</strong> a partire dal {fmtDataIT(dayKey)}
              {showApplyRotDialog.tipo==="nlrs_scalante"?" (primo RS)":" (domenica)"}.
              <br/><br/>
              {showApplyRotDialog.tipo==="nlrs_scalante"
                ?"Il ciclo scalante è di 6 coppie RS/NL. Quante volte vuoi ripeterlo?"
                :"Il ciclo è di 4 domeniche. Quante volte vuoi ripeterlo?"}
            </div>

            {showApplyRotDialog.tipo==="nlrs_scalante"&&(
              <div style={{marginBottom:16}}>
                <span style={{fontSize:13,color:T.text,fontWeight:700,display:"block",marginBottom:8}}>
                  Con quale modello inizi?
                </span>
                <div style={{display:"flex",gap:8}}>
                  <button type="button" onClick={()=>document.getElementById("modello_partenza_rot").value="RS"}
                    id="btn_rs_partenza"
                    style={{flex:1,background:"#8b5cf622",border:"2px solid #8b5cf6",borderRadius:8,
                      color:"#8b5cf6",padding:"8px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
                    RS
                  </button>
                  <button type="button" onClick={()=>document.getElementById("modello_partenza_rot").value="NL"}
                    id="btn_nl_partenza"
                    style={{flex:1,background:T.s2,border:`2px solid ${T.border}`,borderRadius:8,
                      color:T.sub,padding:"8px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
                    NL
                  </button>
                </div>
                <input type="hidden" id="modello_partenza_rot" defaultValue="RS"/>
              </div>
            )}

            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <span style={{fontSize:13,color:T.text,fontWeight:700}}>Ripetizioni:</span>
              <input type="number" defaultValue={4} min={1} max={52} id="num_ripetizioni_rot"
                style={{width:70,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                  padding:"6px 8px",color:T.text,fontSize:14,fontWeight:700,outline:"none",textAlign:"center"}}/>
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowApplyRotDialog(null)}
                style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                  color:T.sub,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
                Annulla
              </button>
              <button onClick={async()=>{
                const inputVal = parseInt(document.getElementById("num_ripetizioni_rot")?.value) || 4;
                const modPartenza = document.getElementById("modello_partenza_rot")?.value || "RS";
                setShowApplyRotDialog(null);
                setShowRotazionePicker(false);
                setDayKey(null);
                await applyRotazione(showApplyRotDialog.id, dayKey, inputVal, modPartenza);
              }}
                style={{flex:2,background:accent,border:"none",borderRadius:10,
                  color:getContrastTextColor(accent),padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

    
