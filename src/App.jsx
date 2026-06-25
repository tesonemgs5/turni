// ═══════════════════════════════════════════════════════════════


// #region SEZIONE 1: IMPORTS + COSTANTI
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, Fragment } from "react";
import { supabase } from "./supabase";

const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAYS = ["L","M","M","G","V","S","D"];
const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
  "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6",
  "#a855f7","#ec4899","#f43f5e","#64748b","#0f172a","#ffffff",
  "#fca5a5","#fed7aa","#fef08a","#bbf7d0","#bfdbfe","#ddd6fe",
];

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }

// ── LOCALSTORAGE CACHE ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 2: LOCALSTORAGE CACHE
// ═══════════════════════════════════════════════════════════════
function saveToLocalStorage(events, calendars, modelli){
  try {
    localStorage.setItem('cache_events', JSON.stringify(events));
    localStorage.setItem('cache_calendars', JSON.stringify(calendars));
    localStorage.setItem('cache_modelli', JSON.stringify(modelli));
    localStorage.setItem('cache_timestamp', new Date().toISOString());
  } catch(e){ console.warn('localStorage error:', e); }
}
function loadFromLocalStorage(){
  try {
    const events = JSON.parse(localStorage.getItem('cache_events')||'{}');
    const calendars = JSON.parse(localStorage.getItem('cache_calendars')||'[]');
    const modelli = JSON.parse(localStorage.getItem('cache_modelli')||'[]');
    const timestamp = localStorage.getItem('cache_timestamp')||null;
    return { events, calendars, modelli, timestamp };
  } catch(e){ return null; }
}
function clearLocalStorageCache(){
  localStorage.removeItem('cache_events');
  localStorage.removeItem('cache_calendars');
  localStorage.removeItem('cache_modelli');
  localStorage.removeItem('cache_timestamp');
}
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 3: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function firstDay(y,m){ const d=new Date(y,m,1).getDay(); return d===0?6:d-1; }
function dkey(y,m,d){ return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m2=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*m2+114)/31),da=((h+l-7*m2+114)%31)+1;
  return {m:mo-1,d:da};
}
function italianHols(y){
  const e=easter(y);
  return [{m:0,d:1},{m:0,d:6},{m:3,d:25},{m:4,d:1},{m:5,d:2},
    {m:7,d:15},{m:10,d:1},{m:11,d:8},{m:11,d:25},{m:11,d:26},
    {m:e.m,d:e.d},{m:e.m,d:e.d+1}];
}

// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 4: COLOR & TIME FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function getColorByTime(tIn){
  if(!tIn) return "#64748b";
  const [h,m]=tIn.split(":").map(Number);
  const mins=h*60+m;
  if(mins>=360&&mins<705) return "#f59e0b";
  if(mins>=705&&mins<1035) return "#f97316";
  if(mins>=1035&&mins<1080) return "#8b5cf6";
  return "#1e40af";
}
function getColorLabel(tIn){
  if(!tIn) return "";
  const [h,m]=tIn.split(":").map(Number);
  const mins=h*60+m;
  if(mins>=360&&mins<705) return "MATTINA";
  if(mins>=705&&mins<1035) return "POMERIGGIO";
  if(mins>=1035&&mins<1080) return "3° TURNO";
  return "NOTTE";
}
function calcFine6h15(tIn){
  if(!tIn) return "";
  const [h,m]=tIn.split(":").map(Number);
  const tot=h*60+m+375;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`;
}
function calcDurata(tIn,tOut){
  if(!tIn||!tOut) return "";
  const [h1,m1]=tIn.split(":").map(Number);
  const [h2,m2]=tOut.split(":").map(Number);
  let mins=(h2*60+m2)-(h1*60+m1);
  if(mins<0) mins+=24*60;
  const hh=Math.floor(mins/60),mm=mins%60;
  return `${hh}h${mm>0?` ${mm}m`:""}`;
}
function getShiftBand(tIn){
  if(!tIn) return "diurno";
  const [h]=tIn.split(":").map(Number);
  if(h>=6 && h<22) return "diurno";
  return "notturno";
}
function isFestivo(dateKey){
  const d=new Date(dateKey);
  return d.getDay()===0;
}

// ── TIPI DI REPORT DISPONIBILI ───────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 5: REPORT TEMPLATES + INIT STATE
// ═══════════════════════════════════════════════════════════════
const REPORT_TEMPLATES = [
  { type:"conteggio_turni", label:"Conteggio turni", desc:"Conta i turni per fascia oraria" },
  { type:"indennita",       label:"Indennità di servizio", desc:"Calcola le indennità per fascia" },
  { type:"ore_turno",       label:"Ore per turno", desc:"Stima ore lavorate" },
  { type:"straordinari",    label:"Straordinari", desc:"Protrazioni e straordinari" },
  { type:"guadagni",        label:"Guadagni", desc:"Stima guadagni da indennità" },
];

const INIT = { calendars:[], events:{}, theme:"auto", extraHols:[], reports:[], reportSettings:{} };

export default function App({ session }){
  const today = new Date();
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 6: USESTATE HOOKS
// ═══════════════════════════════════════════════════════════════
  const [store, setStore] = useState(INIT);
  const [loading, setLoading] = useState(true);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calId, setCalId] = useState(null);
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
  // modelli per-calendario: { [calendarId]: [array modelli] }
  // I modelli caricati da DB vengono smistati per calendar_id
  // Se calendar_id è null (legacy) vanno al calendario principale
  const [modelliSort, setModelliSort] = useState("orario");
  const [showMoveMode, setShowMoveMode] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);
  const [editModello, setEditModello] = useState(null);
  const [modelForm, setModelForm] = useState({ titolo:"", tempo:"personalizzato", inizio:"", fine:"", coloreCustom:null, posizione:"" });

  const [rotazioni, setRotazioni] = useState([]);
  const [showRotForm, setShowRotForm] = useState(false);
  const [editRotazione, setEditRotazione] = useState(null);
  const [rotForm, setRotForm] = useState({ tipo:"personalizzata", titolo:"", dataInizio:"", nSettimane:52, modellaLavoroId:null, modelloNLId:null, modelloRSId:null });
  const [showRotDetail, setShowRotDetail] = useState(null);
  const [showModelloPicker, setShowModelloPicker] = useState(false);
  const dragSrcId = useRef(null);
  const touchSrcId = useRef(null);
  const touchTargetId = useRef(null);

  const [reportInterval, setReportInterval] = useState("mese");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [openReportConfig, setOpenReportConfig] = useState(null);
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  const [indennita, setIndennita] = useState({ diurno:"", notturno:"", festivo:"", notturno_festivo:"" });
  const [conteggioConfigs, setConteggioConfigs] = useState({});

  const userId = session?.user?.id;
const isInitialized = useRef(false);

  useEffect(()=>{
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 7: USEEFFECT INIT + LOAD DA SUPABASE
// ═══════════════════════════════════════════════════════════════
    if(!userId) return;
    (async()=>{
      try {
        // Mostra subito i dati da localStorage
        const cached = loadFromLocalStorage();
        if(cached && cached.calendars.length > 0){
          setStore(s=>({...s, calendars:cached.calendars, events:cached.events}));
          setModelli(cached.modelli||[]);
          setCalId(cached.calendars[0]?.id||null);
          setLoading(false);
        }
        const { data: cals } = await supabase.from("calendars").select("*").eq("user_id", userId).order("created_at");
        const { data: evts } = await supabase.from("events").select("*").eq("user_id", userId);
        const { data: settings } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();

        const calendars = (cals||[]).map(c=>({
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
            modelloId: e.modello_id||null, collega: e.collega||null,
            auto: e.auto||"", parentId: e.parent_id||null,
            protPagFine: e.prot_pag_fine||"", protRecFine: e.prot_rec_fine||"",
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

        const { data: modelliDb } = await supabase.from("modelli").select("*").eq("user_id", userId).order("sort_order");
        setModelli((modelliDb||[]).map(m=>({
          id:m.id, titolo:m.titolo, label:m.label||"", tempo:m.tempo,
          inizio:m.inizio||"", fine:m.fine||"",
          colore:m.colore, coloreCustom:m.colore_custom||null,
          posizione:m.posizione||"", sortOrder:m.sort_order||0,
          calendarId:m.calendar_id||null,
        })));

        const { data: rotazioniDb } = await supabase.from("rotazioni").select("*").eq("user_id", userId).order("created_at");
        setRotazioni((rotazioniDb||[]).map(r=>({
          id:r.id, tipo:r.tipo, titolo:r.titolo,
          dataInizio:r.data_inizio||"", nSettimane:r.n_settimane||52,
          modellaLavoroId:r.modello_lavoro_id||null,
          modelloNLId:r.modello_nl_id||null,
          modelloRSId:r.modello_rs_id||null,
          griglia:r.griglia||{},
        })));

        setSheetsUrl(sUrl);
        setSheetsSecret(sSec);
        setIndennita(savedIndennita);
        setConteggioConfigs(savedConteggioConfigs);

        try {
          const { data: curStats } = await supabase.from("usage_stats").select("login_count").eq("user_id", userId).maybeSingle();
          const newCount = (curStats?.login_count || 0) + 1;
          await supabase.from("usage_stats").upsert({ user_id: userId, last_active: new Date().toISOString(), login_count: newCount });
        } catch(statErr) { console.warn("Stats error:", statErr); }

        setStore({ calendars, events, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings });
        setCalId(calendars[0]?.id||null);
        saveToLocalStorage(events, calendars, []);

        // Inizializza sortOrder per modelli H24 che hanno tutti 0
        const h24senza = (modelliDb||[]).filter(m=>(m.tempo==="h24"||!m.inizio)&&(m.sort_order||0)===0);
        if(h24senza.length>1){
          for(let i=0;i<h24senza.length;i++){
            await supabase.from("modelli").update({sort_order:i*10}).eq("id",h24senza[i].id).eq("user_id",userId);
          }
          const {data:modelliDb2}=await supabase.from("modelli").select("*").eq("user_id",userId).order("sort_order");
          setModelli((modelliDb2||[]).map(m=>({
            id:m.id,titolo:m.titolo,label:m.label||"",tempo:m.tempo,
            inizio:m.inizio||"",fine:m.fine||"",
            colore:m.colore,coloreCustom:m.colore_custom||null,
            posizione:m.posizione||"",sortOrder:m.sort_order||0,
          })));
        }
        isInitialized.current = true;
      } catch(e){ console.log("Errore startup:", e); }
      setLoading(false);
    })();
  },[userId]);



  useEffect(()=>{
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 8: USEEFFECT OVERSCROLL + ONLINE/OFFLINE
// ═══════════════════════════════════════════════════════════════
    function goOnline(){ setIsOnline(true); }
    function goOffline(){ setIsOnline(false); }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return ()=>{ window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  },[]);

// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 9: THEME & COLORS
// ═══════════════════════════════════════════════════════════════
  const sysDark = window.matchMedia?.("(prefers-color-scheme:dark)").matches??false;
  const dark = store.theme==="auto"?sysDark:store.theme==="dark";
  const T = {
    bg:      dark?"#090e1a":"#f1f5f9",
    surface: dark?"#0f172a":"#ffffff",
    s2:      dark?"#1e293b":"#f1f5f9",
    border:  dark?"#334155":"#e2e8f0",
    text:    dark?"#f1f5f9":"#0f172a",
    sub:     dark?"#64748b":"#94a3b8",
    gap:     dark?"#1e293b":"#e2e8f0",
  };

  const activeCal = store.calendars.find(c=>c.id===calId)||null;
  const mainCal   = store.calendars.find(c=>c.isMain)||null;
  const accent    = activeCal?.color||"#3b82f6";
  const hols      = italianHols(year);

  function isRed(d,m){
    return hols.some(h=>h.m===m&&h.d===d) ||
      (store.extraHols||[]).some(h=>+h.m-1===m&&+h.d===d);
  }
  function getEvts(key,cid){ return store.events?.[key]?.[cid]||[]; }
  function allEvts(key){
    const res=[];
    if(mainCal) getEvts(key,mainCal.id).forEach(e=>res.push({...e,_cid:mainCal.id}));
    store.calendars.filter(c=>!c.isMain).forEach(c=>
      getEvts(key,c.id).forEach(e=>res.push({...e,_cid:c.id})));
    return res.sort((a,b)=>{
      if(a.allDay && b.allDay) return 0;
      if(a.allDay) return -1; if(b.allDay) return 1;
      const ta=a.tIn||"", tb=b.tIn||"";
      if(ta===tb) return 0; if(!ta) return 1; if(!tb) return -1;
      return ta.localeCompare(tb);
    });
  }
  function dots(key){ return store.calendars.filter(c=>getEvts(key,c.id).length>0); }

  async function saveSettings(updates={}){
    if(!userId) return;
    await supabase.from("user_settings").upsert({
      user_id: userId,
      theme: store.theme,
      extra_hols: store.extraHols,
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }

  async function addCalendar(name, color, isFirst){
    if(!userId) return null;
    const { data, error } = await supabase.from("calendars").insert({
      user_id: userId, name, color, is_main: isFirst, shifts: [],
    }).select().maybeSingle();
    if(error){ console.log(error); return null; }
    return data;
  }
  async function updateCalendar(cId, fields){
    if(!userId) return;
    await supabase.from("calendars").update(fields).eq("id", cId).eq("user_id", userId);
  }
  async function deleteCalendar(cId){
    if(!userId) return;
    await supabase.from("calendars").delete().eq("id", cId).eq("user_id", userId);
    const newCals = store.calendars.filter(c=>c.id!==cId);
    saveToLocalStorage(store.events, newCals, modelli);
    if(syncMode==='on' && sheetsUrl) await saveToSheets(store.events, newCals);
  }

  async function saveEvt(){
    if(!form||!dayKey||!calId||!userId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;
    let color = form.colorOvr || cal.color;
    let label = (form.label||"Evento").toUpperCase();
    let tInFinal = form.dur==="allday"?"":form.tIn||"";
    let tOutFinal = form.dur==="allday"?"":form.tOut||"";
    if(form.modelloId){
      const mod = modelli.find(m=>m.id===form.modelloId);
      if(mod){
        color = form.colorOvr||(mod.coloreCustom||getColorByTime(mod.inizio));
        label = (mod.titolo||label).toUpperCase();
        if(mod.tempo==="h24"){ tInFinal=""; tOutFinal=""; }
        else if(mod.tempo==="6h15"){
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||calcFine6h15(tInFinal)||"";
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
    
    const { data, error } = await supabase.from("events").insert({
      user_id: userId, calendar_id: calId, date_key: dayKey,
      label, color, all_day: form.dur==="allday"&&!form.modelloId,
      time_in: tInFinal, time_out: tOutFinal,
      place: (form.place||"").toUpperCase(),
      map_url: form.map||"",
      note: (extraNote||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
      prot_pag_fine: form.protPagFine||null,
      prot_rec_fine: form.protRecFine||null,
    }).select().maybeSingle();
    if(error){ console.log(error); return; }
    const evt = {
      id: data.id, color, label, allDay: data.all_day,
      tIn: data.time_in||"", tOut: data.time_out||"",
      place: data.place||"", map: data.map_url||"",
      note: data.note||"", modelloId: data.modello_id||null,
      collega: data.collega||null, auto: data.auto||"",
      protPagFine: data.prot_pag_fine||"", protRecFine: data.prot_rec_fine||"",
    };

    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      if(!ns.events[dayKey]) ns.events[dayKey]={};
      if(!ns.events[dayKey][calId]) ns.events[dayKey][calId]=[];
      ns.events[dayKey][calId].push(evt);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      if(syncMode==='on') saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }

  async function updateEvt(){
    if(!form||!dayKey||!calId||!userId||!form.editId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;
    let color = form.colorOvr || cal.color;
    let label = (form.label||"Evento").toUpperCase();
    let tInFinal = form.dur==="allday"?"":form.tIn||"";
    let tOutFinal = form.dur==="allday"?"":form.tOut||"";
    if(form.modelloId){
      const mod = modelli.find(m=>m.id===form.modelloId);
      if(mod){
        color = form.colorOvr||(mod.coloreCustom||getColorByTime(mod.inizio));
        label = (mod.titolo||label).toUpperCase();
        if(mod.tempo==="h24"){ tInFinal=""; tOutFinal=""; }
        else if(mod.tempo==="6h15"){
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||calcFine6h15(tInFinal)||"";
        } else {
          tInFinal = form.tIn||mod.inizio||"";
          tOutFinal = form.tOut||mod.fine||"";
        }
      }
    } else if(form.dur==="fixed" && tInFinal && !form.modelloId){
      tOutFinal = form.tOut||calcFine6h15(tInFinal);
    }
    const { error } = await supabase.from("events").update({
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
    }).eq("id", form.editId).eq("user_id", userId);
    if(error){ console.log(error); return; }

    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      const list = ns.events?.[dayKey]?.[calId];
      if(list){
        const idx = list.findIndex(e=>e.id===form.editId);
        if(idx>-1) list[idx]={...list[idx], label, color,
          allDay: form.dur==="allday", tIn: tInFinal, tOut: tOutFinal,
          place: (form.place||"").toUpperCase(), map: form.map||"",
          note: (form.note||"").toUpperCase(), modelloId: form.modelloId||null,
          collega: (form.collega||"").toUpperCase(), auto: (form.auto||"").toUpperCase(),
          protPagFine: form.protPagFine||"", protRecFine: form.protRecFine||"",
        };
      }
      if(syncMode==='on' && sheetsUrl) saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }

  async function delEvt(dKey, cId, evtId){
    await supabase.from("events").delete().eq("id", evtId).eq("user_id", userId);
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      if(ns.events?.[dKey]?.[cId])
        ns.events[dKey][cId]=ns.events[dKey][cId].filter(e=>e.id!==evtId);
      if(syncMode==='on' && sheetsUrl) saveToSheets(ns.events, ns.calendars);
      return ns;
    });
  }

  function calcMinuti(tIn, tOut){
    if(!tIn||!tOut) return 0;
    const [h1,m1]=tIn.split(":").map(Number);
    const [h2,m2]=tOut.split(":").map(Number);
    let mins=(h2*60+m2)-(h1*60+m1);
    if(mins<0) mins+=24*60;
    return mins;
  }

  async function saveToSheets(events, calendars, customUrl=sheetsUrl, customSecret=sheetsSecret, modelliToSave=modelli){
    if(!customUrl) return "⚠️ Sheets non configurato";
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
          fine: (m.tempo==="6h15"||m.tempo==="6h 15m")&&m.inizio ? calcFine6h15(m.inizio) : m.fine||"",
        }))}),
      });
      return "✅ Esportato su Sheets";
    } catch(e){ return "❌ Errore connessione Sheets"; }
  }

  async function loadFromSheets(customUrl=sheetsUrl, customSecret=sheetsSecret){
    try {
      const res = await fetch(`/api/sheets?secret=${customSecret}&action=load&userId=${userId}`);
      return await res.json() || null;
    } catch(e){ return null; }
  }

  async function syncFromSheets(cals=store.calendars, evts=store.events, customUrl=sheetsUrl, customSecret=sheetsSecret, isBackground=false){
    if(!customUrl) return "⚠️ Sincronizzazione non configurata";
    if(isBackground) setBgSyncing(true); else setSyncing(true);
    try {
      const data = await loadFromSheets(customUrl, customSecret);
      if(!data||!data.data) return "❌ Nessun dato valido da Sheets";
      await supabase.from("events").delete().eq("user_id", userId);
      const existingNames = cals.map(c=>c.name);
      const newCals = [...cals];
      for(const tabName of (data.tabs||Object.keys(data.data))){
        if(!existingNames.includes(tabName)){
          const dbCal = await addCalendar(tabName, PALETTE[newCals.length%PALETTE.length], newCals.length===0);
          if(dbCal) newCals.push({id:dbCal.id,name:dbCal.name,color:dbCal.color,isMain:dbCal.is_main,shifts:[]});
        }
      }
      const newEvents={};
      for(const cal of newCals){
        const calData=data.data[cal.name]||{};
        for(const [dateKey,sheetEvts] of Object.entries(calData)){
          if(!newEvents[dateKey]) newEvents[dateKey]={};
          if(!newEvents[dateKey][cal.id]) newEvents[dateKey][cal.id]=[];
          for(const e of sheetEvts){
            const {data:dbEvt}=await supabase.from("events").insert({
              user_id:userId, calendar_id:cal.id, date_key:dateKey,
              label:e.label||"Evento", color:e.color||cal.color,
              all_day:e.allDay??true, time_in:e.tIn||"", time_out:e.tOut||"",
              place:e.place||"", map_url:e.map||"", note:e.note||"",
              modello_id:e.modelloId||null, collega:e.collega||"", auto:e.auto||"",
            }).select().maybeSingle();
            if(dbEvt) newEvents[dateKey][cal.id].push({
              id:dbEvt.id, color:dbEvt.color, label:dbEvt.label,
              allDay:dbEvt.all_day, tIn:dbEvt.time_in||"", tOut:dbEvt.time_out||"",
              place:dbEvt.place||"", map:dbEvt.map_url||"", note:dbEvt.note||"",
              modelloId:dbEvt.modello_id||null, collega:dbEvt.collega||"", auto:dbEvt.auto||"",
            });
          }
        }
      }
      setStore(s=>({...s, calendars:newCals, events:newEvents}));
      if(newCals.length>0&&!calId) setCalId(newCals[0].id);
      try {
        const resMod = await fetch(`${customUrl}?secret=${customSecret}&action=load_modelli`);
        const dataMod = await resMod.json();
        if(dataMod.modelli&&dataMod.modelli.length>0){
          await supabase.from("modelli").delete().eq("user_id",userId);
          const newModelli=[];
          for(const m of dataMod.modelli){
            const coloreEff=m.tempo==="h24"?"#64748b":getColorByTime(m.inizio);
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
      } catch(e){ console.error("Errore import modelli:",e); }
      return "✅ Importazione completata";
    } catch(e){
      console.error(e);
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
          if(!error&&data&&data.length>0) setStats(data[0]);
        } catch(e){ console.error(e); }
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
    } catch(e){ console.error(e); }
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
      // Salva lo snapshot nel cloud (tabella "backups" su Supabase)
      const {error:insErr} = await supabase.from("backups").insert({
        user_id:userId, data:backup,
      });
      if(insErr) throw insErr;
      setSyncMsg("✅ Backup salvato su Supabase");
    } catch(e){ console.error(e); setSyncMsg("❌ Errore durante l'esportazione: "+e.message); }
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
    } catch(e){ console.error(e); setSyncMsg("❌ Errore nel caricare i backup: "+e.message); }
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

      await supabase.from("events").delete().eq("user_id",userId);
      await supabase.from("calendars").delete().eq("user_id",userId);
      await supabase.from("modelli").delete().eq("user_id",userId);
      await supabase.from("rotazioni").delete().eq("user_id",userId);

      const calIdMap = {};
      for(const c of (backup.calendars||[])){
        const {data} = await supabase.from("calendars").insert({
          user_id:userId, name:c.name, color:c.color, is_main:c.is_main, shifts:c.shifts||[],
        }).select().maybeSingle();
        if(data) calIdMap[c.id] = data.id;
      }
      const modIdMap = {};
      for(const m of (backup.modelli||[])){
        const {data} = await supabase.from("modelli").insert({
          user_id:userId, titolo:m.titolo, tempo:m.tempo, inizio:m.inizio, fine:m.fine,
          colore:m.colore, colore_custom:m.colore_custom, posizione:m.posizione,
          sort_order:m.sort_order, calendar_id: calIdMap[m.calendar_id]||null,
        }).select().maybeSingle();
        if(data) modIdMap[m.id] = data.id;
      }
      for(const e of (backup.events||[])){
        await supabase.from("events").insert({
          user_id:userId, calendar_id: calIdMap[e.calendar_id]||e.calendar_id,
          date_key:e.date_key, label:e.label, color:e.color, all_day:e.all_day,
          time_in:e.time_in, time_out:e.time_out, place:e.place, map_url:e.map_url,
          note:e.note, modello_id: modIdMap[e.modello_id]||null,
          collega:e.collega, auto:e.auto,
        });
      }
      for(const r of (backup.rotazioni||[])){
        await supabase.from("rotazioni").insert({
          user_id:userId, tipo:r.tipo, titolo:r.titolo, data_inizio:r.data_inizio,
          n_settimane:r.n_settimane,
          modello_lavoro_id: modIdMap[r.modello_lavoro_id]||null,
          modello_nl_id: modIdMap[r.modello_nl_id]||null,
          modello_rs_id: modIdMap[r.modello_rs_id]||null,
          griglia:r.griglia||{},
        });
      }
      setSyncMsg("✅ Importazione completata — ricarico l'app...");
      setTimeout(()=>window.location.reload(), 1500);
    } catch(e){ console.error(e); setSyncMsg("❌ Errore durante l'importazione: "+e.message); }
  }

  async function handleLogout(){ await supabase.auth.signOut(); }

  // ── MODELLI CRUD ─────────────────────────────────────────────
function sortedModelli(){
  const toMins=t=>{
    if(!t) return null;
    const[h,m]=t.split(":").map(Number);
    return h*60+m;
  };
  // I 4 modelli intestazione H24 speciali hanno una posizione fissa
  const INTESTAZIONI={
    "NOTTE":     -1,   // prima di 00:00
    "MATTINA":   6*60-1,   // prima di 06:00
    "POMERIGGIO":12*60-1,  // prima di 12:00
    "3° TURNO":  16*60-1,  // prima di 16:00
  };
  function getSortValue(m){
    // Modello intestazione H24 speciale
    if((m.tempo==="h24"||!m.inizio) && INTESTAZIONI.hasOwnProperty(m.titolo)){
      return INTESTAZIONI[m.titolo];
    }
    // Modello con orario
    if(m.tempo!=="h24" && m.inizio){
      return toMins(m.inizio);
    }
    // H24/senza orario generico → in fondo
    return 99999;
  }
  return [...modelli].sort((a,b)=>{
    const vA=getSortValue(a);
    const vB=getSortValue(b);
    if(vA!==vB) return vA-vB;
    return (a.sortOrder||0)-(b.sortOrder||0);
  });
}

  // Restituisce la fascia oraria di un modello per il blocco dello spostamento
  function getFasciaModello(m){
    // Turni H24 o senza orario: nessun vincolo, possono essere spostati ovunque
    if(m.tempo==="h24") return "libero";
    if(!m.inizio) return "libero";
    const [h]=m.inizio.split(":").map(Number);
    if(h>=6&&h<12) return "mattina";
    if(h>=12&&h<16||(h===16&&parseInt((m.inizio.split(":")[1]||"0"))<30)) return "pomeriggio";
    if(h>=16&&h<23) return "terzo";
    return "notte";
  }

  async function moveH24(id, dir){
    const sorted=[...modelli].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
    const idx=sorted.findIndex(m=>m.id===id);
    if(idx===-1) return;
    const swapIdx=dir==="up"?idx-1:idx+1;
    if(swapIdx<0||swapIdx>=sorted.length) return;
    // ── Blocco fascia: si applica solo tra due turni con orario impostato
    // e che NON sono turni "liberi" (h24/senza orario). Un turno libero
    // può sempre essere scambiato con qualsiasi altro turno della lista.
    const liberoCorrente = sorted[idx].tempo==="h24"||!sorted[idx].inizio;
    const liberoTarget = sorted[swapIdx].tempo==="h24"||!sorted[swapIdx].inizio;
    if(!liberoCorrente && !liberoTarget){
      const fasciaCorrente = getFasciaModello(sorted[idx]);
      const fasciaTarget = getFasciaModello(sorted[swapIdx]);
      if(fasciaCorrente!==fasciaTarget) return; // bloccato
    }
    const reordered=[...sorted];
    const [moved]=reordered.splice(idx,1);
    reordered.splice(swapIdx,0,moved);
    const withNewOrder=reordered.map((m,i)=>({...m,sortOrder:i*10}));
    setModelli(withNewOrder); // aggiornamento UI immediato
    for(const m of withNewOrder){
      supabase.from("modelli").update({sort_order:m.sortOrder}).eq("id",m.id).eq("user_id",userId);
    }
  }

  async function saveModello(data){
    if(!userId) return;
    const coloreEff=data.coloreCustom||(data.tempo==="h24"?"#64748b":getColorByTime(data.inizio));
    const mainCalId2 = store.calendars.find(c=>c.isMain)?.id||null;
    const targetCalId = data.calendarId||calId||mainCalId2;
    const payload={
      user_id:userId, titolo:(data.titolo||"").toUpperCase(), tempo:data.tempo,
      inizio:data.inizio||null, fine:data.fine||null,
      colore:coloreEff, colore_custom:data.coloreCustom||null,
      posizione:(data.posizione||"").toUpperCase()||null,
      sort_order:data.sortOrder||modelli.length,
      calendar_id: targetCalId,
    };
    if(data.id){
      await supabase.from("modelli").update(payload).eq("id",data.id).eq("user_id",userId);
      setModelli(prev=>{
        const updated=prev.map(m=>m.id===data.id?{...m,...data,colore:coloreEff,calendarId:targetCalId}:m);
        if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
        return updated;
      });
    } else {
      const {data:res}=await supabase.from("modelli").insert(payload).select().maybeSingle();
      if(res){
        const newSortOrder=modelli.length*10;
        await supabase.from("modelli").update({sort_order:newSortOrder}).eq("id",res.id).eq("user_id",userId);
        setModelli(prev=>{
          const updated=[...prev,{...data,id:res.id,colore:coloreEff,sortOrder:newSortOrder,calendarId:targetCalId}];
          if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
          return updated;
        });
      }
    }
  }

  async function deleteModello(id){
    await supabase.from("modelli").delete().eq("id",id).eq("user_id",userId);
    setModelli(prev=>{
      const updated=prev.filter(m=>m.id!==id);
      if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
      return updated;
    });
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
      await supabase.from("rotazioni").update(payload).eq("id",data.id).eq("user_id",userId);
      setRotazioni(prev=>prev.map(r=>r.id===data.id?{...r,...data}:r));
    } else {
      const {data:res}=await supabase.from("rotazioni").insert(payload).select().maybeSingle();
      if(res) setRotazioni(prev=>[...prev,{...data,id:res.id,griglia:{}}]);
    }
  }

  async function deleteRotazione(id){
    await supabase.from("rotazioni").delete().eq("id",id).eq("user_id",userId);
    setRotazioni(prev=>prev.filter(r=>r.id!==id));
  }

  async function updateGrigliaRotazione(rotId, griglia){
    await supabase.from("rotazioni").update({griglia}).eq("id",rotId).eq("user_id",userId);
    setRotazioni(prev=>prev.map(r=>r.id===rotId?{...r,griglia}:r));
  }

  // ── REPORT HELPERS ───────────────────────────────────────────
  function getReportRange(){
    const now = new Date();
    if(reportInterval==="mese"){
      const y=now.getFullYear(), m=now.getMonth();
      const from=`${y}-${String(m+1).padStart(2,"0")}-01`;
      const to=`${y}-${String(m+1).padStart(2,"0")}-${String(daysInMonth(y,m)).padStart(2,"0")}`;
      return {from, to, label: MONTHS[m]+" "+y};
    }
    if(reportInterval==="anno"){
      return {from:`${now.getFullYear()}-01-01`, to:`${now.getFullYear()}-12-31`, label: now.getFullYear().toString()};
    }
    return {from:reportDateFrom, to:reportDateTo, label:reportDateFrom+" → "+reportDateTo};
  }

  // Calcola conteggio per un singolo report con le sue condizioni
  function computeConteggioForReport(cfg){
    const {from, to} = getReportRange();
    const result = { totale:0, mattina:0, pomeriggio:0, notte:0, terzo:0, h24:0, app:0, auto:0 };
    const perModello = {};
    const fasceFiltro = cfg?.fasceFiltro || []; // [] = tutte
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      for(const [, evts] of Object.entries(calMap)){
        for(const e of evts){
          if(e.allDay){
            if(fasceFiltro.length===0||fasceFiltro.includes("h24")){
              result.totale++; result.h24++;
              if(e.modelloId) perModello[e.modelloId]=(perModello[e.modelloId]||0)+1;
            }
            continue;
          }
          if(!e.tIn) continue;
          const [h,m]=e.tIn.split(":").map(Number);
          const mins=h*60+m;
          let fascia="";
          if(mins>=360&&mins<705) fascia="primo";
          else fascia="secondo";
          if(fasceFiltro.length>0 && !fasceFiltro.includes(fascia)) continue;
          result.totale++;
          result[fascia]=(result[fascia]||0)+1;
          if(e.modelloId) perModello[e.modelloId]=(perModello[e.modelloId]||0)+1;
          // Gruppo indipendente APP/AUTO basato sul titolo del modello collegato
          const modelloEvt = e.modelloId ? modelli.find(mm=>mm.id===e.modelloId) : null;
          const titoloEvt = (modelloEvt?.titolo||"").toUpperCase();
          if(titoloEvt.includes("APP")) result.app=(result.app||0)+1;
          else if(titoloEvt.includes("AUTO")) result.auto=(result.auto||0)+1;
        }
      }
    }
    return {...result, perModello};
  }

  function computeConteggio(){
    return computeConteggioForReport({fasceFiltro:[]});
  }

  function computeIndennita(){
    const {from, to} = getReportRange();
    const totals = { diurno:0, notturno:0, festivo:0, notturno_festivo:0 };
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      const fest = isFestivo(dateKey);
      for(const [, evts] of Object.entries(calMap)){
        for(const e of evts){
          if(e.allDay) continue;
          const band = getShiftBand(e.tIn);
          if(fest && band==="notturno") totals.notturno_festivo++;
          else if(fest) totals.festivo++;
          else if(band==="notturno") totals.notturno++;
          else totals.diurno++;
        }
      }
    }
    return totals;
  }

  // ── GESTIONE REPORTS ─────────────────────────────────────────
  // reports = array di { id, type, label, active }
  const activeReports = (store.reports||[]).filter(r=>r.active);
  const inactiveTypes = REPORT_TEMPLATES; // mostra sempre tutti nel pannello aggiungi

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

  function getConteggioConfig(reportId){
    return conteggioConfigs[reportId] || { fasceFiltro:[] };
  }

  function updateConteggioConfig(reportId, cfg){
    const newCfg = {...conteggioConfigs, [reportId]: cfg};
    setConteggioConfigs(newCfg);
    saveSettings({conteggio_configs: newCfg});
  }

  // Calcola totale globale per percentuali
  const totaleTurni = computeConteggio().totale;

  // ── CALENDAR GRID ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 10: CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════
  const totalDays = daysInMonth(year,month);
  const fd = firstDay(year,month);
  const cells = [...Array(fd).fill(null), ...Array.from({length:totalDays},(_,i)=>i+1)];

  if(loading) return (
    <div style={{background:dark?"#090e1a":"#f1f5f9",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#64748b",fontSize:13}}>⏳ Caricamento...</div>
    </div>
  );

  // ── VIEWS ─────────────────────────────────────────────────────
  const selectStyle = {
    background:"rgba(255,255,255,0.15)",
    border:"1px solid rgba(255,255,255,0.4)",
    borderRadius:8, color:"#fff", fontSize:12, fontWeight:900,
    fontFamily:"Georgia,serif", padding:"2px 0px", cursor:"pointer",
    outline:"none", flexShrink:0,
    appearance:"none", WebkitAppearance:"none",
  };

  const calView = (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{background:accent,display:"flex",alignItems:"center",
        gap:5,padding:"6px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0}}>
        <button onClick={()=>month===0?(setYear(y=>y-1),setMonth(11)):setMonth(m=>m-1)} style={NB}>‹</button>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))}
          style={{...selectStyle, maxWidth:80}}>
          {MONTHS.map((mn,i)=>(
            <option key={i} value={i} style={{background:"#1e293b",color:"#fff"}}>
              {mn.toUpperCase()}
            </option>
          ))}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))}
          style={{...selectStyle, maxWidth:50}}>
          {Array.from({length:21},(_,i)=>2023+i).map(y=>(
            <option key={y} value={y} style={{background:"#1e293b",color:"#fff"}}>{y}</option>
          ))}
        </select>
        {bgSyncing&&<span style={{color:"rgba(255,255,255,0.7)",fontSize:11}}>🔄</span>}
        <button onClick={()=>month===11?(setYear(y=>y+1),setMonth(0)):setMonth(m=>m+1)} style={NB}>›</button>
        <div style={{flex:1}}/>
        {/* TUTTI accanto a mese e anno */}
        <button onClick={()=>setCalId(null)}
          style={{background:calId===null?"rgba(255,255,255,0.28)":"rgba(255,255,255,0.1)",
            border:`1.5px solid ${calId===null?"rgba(255,255,255,0.85)":"transparent"}`,
            borderRadius:20,padding:"2px 10px",cursor:"pointer",flexShrink:0}}>
          <span style={{color:"#fff",fontSize:11,fontWeight:800}}>TUTTI</span>
        </button>
        <button onClick={async()=>{
          setBanner("⏳ Svuotamento cache...");
          clearLocalStorageCache();
          // Svuota tutte le cache del Service Worker (PWA), se presenti
          try {
            if("caches" in window){
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(name=>caches.delete(name)));
            }
          } catch(e){ console.warn("Errore pulizia cache SW:", e); }
          // Deregistra eventuali Service Worker registrati, cosi' al prossimo
          // reload il browser scarica per forza la versione più recente
          try {
            if("serviceWorker" in navigator){
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r=>r.unregister()));
            }
          } catch(e){ console.warn("Errore unregister Service Worker:", e); }
          // Reload REALE della pagina (non solo re-fetch dati): forza il
          // browser a richiedere di nuovo tutti i file invece di servirli
          // dalla cache locale del telefono/browser.
          window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }}
          title="Svuota cache e ricarica tutto"
          style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",
            borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,color:"#fff",flexShrink:0}}>
          🔄
        </button>
        
        <button onClick={()=>{
          const next = syncMode==='on'?'off':'on';
          setSyncMode(next);
          localStorage.setItem('syncMode', next);
        }} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",
          borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0}}>
          {syncMode==='on'?(isOnline?'🟢 SYNC':'🔴 OFFLINE'):'⏸️ SYNC OFF'}
        </button>
      </div>
      <div style={{background:accent,display:"flex",alignItems:"center",
        gap:5,padding:"4px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0,
        borderTop:"1px solid rgba(255,255,255,0.2)"}}>
        {store.calendars.length===0
          ? <span style={{color:"rgba(255,255,255,0.6)",fontSize:10,fontStyle:"italic"}}>→ Impostazioni</span>
          : store.calendars.map(c=>(
            <button key={c.id} onClick={()=>setCalId(c.id)}
              style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,cursor:"pointer",
                background:calId===c.id?"rgba(255,255,255,0.28)":"rgba(255,255,255,0.1)",
                border:`1.5px solid ${calId===c.id?"rgba(255,255,255,0.85)":"transparent"}`,
                borderRadius:20,padding:"2px 8px 2px 5px"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:c.color,border:"1px solid rgba(255,255,255,0.5)"}}/>
              <span style={{color:"#fff",fontSize:12,fontWeight:700}}>{c.name}</span>
              {c.isMain&&<span style={{color:"rgba(255,255,255,0.6)",fontSize:8}}>★</span>}
            </button>
          ))
        }
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
        background:T.s2,borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        {DAYS.map((d,i)=>(
          <div key={i} style={{textAlign:"center",fontSize:9,fontWeight:800,
            padding:"3px 0",color:i===6?"#ef4444":T.sub}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",
        gridAutoRows:"minmax(54px,1fr)",flex:1,overflow:"hidden",gap:"1px 0px",background:T.gap}}>
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
            <div key={i} onClick={()=>{ setDayKey(key); setForm(null); setPal(null); }}
              style={{background:isT?(dark?"#1a2f50":"#dbeafe"):red?(dark?"#2d0a0a":"#fff5f5"):T.surface,
                cursor:"pointer",display:"flex",flexDirection:"column",overflow:"hidden",
                borderTop:isT?`2px solid ${accent}`:red?"2px solid #ef444430":"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:2,padding:"2px 3px 0",flexShrink:0}}>
                <span style={{fontSize:10,fontWeight:isT?900:500,lineHeight:1,
                  color:isT?accent:red?"#ef4444":T.sub}}>{d}</span>
                {ds.map(c=><div key={c.id} style={{width:5,height:5,borderRadius:"50%",background:c.color}}/>)}
              </div>
              <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",gap:"1px",padding:"0 1px 1px"}}>
                {evts.slice(0,4).map((e,ei)=>{
                  const nodes = [];
                  if(e.protPagFine) nodes.push({label:"PR PAG",color:"#8b5cf6"});
                  if(e.protRecFine) nodes.push({label:"PR REC",color:"#64748b"});
                  return (
                    <Fragment key={e.id+ei}>
                      <div style={{background:e.color,borderRadius:3,padding:"2px 4px",
                        fontSize:14,fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",
                        whiteSpace:"nowrap",height:16,minHeight:16,display:"flex",alignItems:"center",flexShrink:0,
                        textShadow:"0 1px 2px rgba(0,0,0,0.35)"}}>
                        {e.label}
                      </div>
                      {nodes.map((n,ni)=>(
                        <div key={ni} style={{background:n.color,borderRadius:3,padding:"2px 4px",
                          fontSize:14,fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",
                          whiteSpace:"nowrap",height:16,minHeight:16,display:"flex",alignItems:"center",flexShrink:0,
                          textShadow:"0 1px 2px rgba(0,0,0,0.35)"}}>
                          {n.label}
                        </div>
                      ))}
                    </Fragment>
                  );
                })}
                {evts.length>4&&<div style={{fontSize:8,color:T.sub,padding:"0 2px",flexShrink:0}}>+{evts.length-4}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── REPORT VIEW ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 11: REPORT VIEW
// ═══════════════════════════════════════════════════════════════
  const range = getReportRange();
  const indennitaCalc = computeIndennita();

  function renderReportCard(r){
    const isOpen = openReportConfig===r.id;
    const cfg = getConteggioConfig(r.id);
    const data = r.type==="conteggio_turni" ? computeConteggioForReport(cfg) : computeConteggio();
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
              <div style={{fontSize:17,color:T.sub}}>
                {data.totale} turni
                {data.totale>0&&(()=>{
                  const pct1=Math.round(((data.primo||0)/data.totale)*100);
                  const pct2=Math.round(((data.secondo||0)/data.totale)*100);
                  return (
                    <span style={{marginLeft:4}}>
                      {data.primo>0&&<span style={{color:"#f59e0b",marginLeft:4}}>1°T {pct1}%</span>}
                      {data.secondo>0&&<span style={{color:"#f97316",marginLeft:4}}>2°T {pct2}%</span>}
                    </span>
                  );
                })()}
              </div>
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
            {r.type==="conteggio_turni" && (
              <ConteggioConfigCard T={T} r={r} cfg={cfg} data={data} totaleTurni={totaleTurni}
                modelli={modelli} accent={accent}
                onRename={label=>renameReport(r.id, label)}
                onUpdateCfg={newCfg=>updateConteggioConfig(r.id, newCfg)}
                onGoToModelli={()=>setScreen("modelli")}/>
            )}
            {r.type==="indennita" && (
              <IndennitaConfig T={T} values={indennita} setValues={setIndennita}
                calc={indennitaCalc} onSave={()=>saveSettings({indennita})}/>
            )}
            {r.type==="ore_turno" && <OrePerTurnoView T={T} data={data}/>}
            {r.type==="straordinari" && <StraordinariView T={T} data={data} store={store} reportRange={{from:range.from,to:range.to}}/>}
            {r.type==="guadagni" && (
              <GuadagniView T={T} indennita={indennita} calc={indennitaCalc}/>
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
            padding:"5px 14px",fontSize:12,fontWeight:700,color:T.sub,cursor:"pointer"}}>
          {range.label} ▾
        </button>
      </div>

      {activeReports.length>0 && (
        <div style={{margin:"8px 12px"}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6,paddingLeft:4}}>Report attivi</div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            {activeReports.map(r=>renderReportCard(r))}
          </div>
        </div>
      )}

      {/* Pannello aggiungi report */}
      {(()=>{
        // openReportConfig==='__add__' funge da flag per mostrare il pannello aggiungi
        const isAddOpen = openReportConfig==='__add__';
        return (
          <div style={{margin:"16px 12px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:6,paddingLeft:4,cursor:"pointer"}}
              onClick={()=>setOpenReportConfig(isAddOpen?null:'__add__')}>
              <div style={{fontSize:11,color:T.sub,fontWeight:700}}>Aggiungi report</div>
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
            {reportInterval==="custom" && (
              <div style={{display:"flex",gap:10,marginTop:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:T.sub,marginBottom:4}}>DA</div>
                  <input type="date" value={reportDateFrom} onChange={e=>setReportDateFrom(e.target.value)}
                    style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:T.sub,marginBottom:4}}>A</div>
                  <input type="date" value={reportDateTo} onChange={e=>setReportDateTo(e.target.value)}
                    style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                </div>
              </div>
            )}
            {reportInterval==="custom"&&reportDateFrom&&reportDateTo&&(
              <button onClick={()=>setShowIntervalPicker(false)}
                style={{width:"100%",marginTop:12,background:accent,border:"none",borderRadius:10,
                  color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:13}}>
                Conferma
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ── MODELLI VIEW ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 12: MODELLI VIEW
// ═══════════════════════════════════════════════════════════════
  const modelliView = (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      {/* Header modelli: mostra nome + colore del calendario selezionato */}
      {(()=>{
        const calAttivo = store.calendars.find(c=>c.id===calId);
        const nomeCal = calId===null ? "TUTTI" : (calAttivo?.name||"Calendario");
        const coloreCal = calAttivo?.color||accent;
        // Calcola colore testo con contrasto su sfondo colorato
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
            // bianco su scuro, nero su chiaro
            return lum < 0.35 ? "#ffffff" : "#0f172a";
          } catch(e){ return "#ffffff"; }
        }
        const testoContrasto = calId===null ? T.text : contrastColor(coloreCal);
        return (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 8px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:24,fontWeight:900,fontFamily:"Georgia,serif",color:T.text}}>Modelli</div>
              {/* Badge nome calendario con colore e possibilità di cambio colore */}
              <CalBadge calId={calId} calAttivo={calAttivo} coloreCal={coloreCal}
                testoContrasto={testoContrasto} T={T} store={store} setStore={setStore}
                updateCalendar={updateCalendar} accent={accent} setCalId={setCalId}/>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",position:"relative"}}>
              <button onClick={()=>setShowMoveMode(s=>!s)}
                title={showMoveMode?"Spostamento attivo — clicca per bloccare":"Attiva spostamento"}
                style={{background:showMoveMode?accent:T.s2,
                  border:`1px solid ${showMoveMode?accent:T.border}`,borderRadius:8,
                  padding:"6px 10px",fontSize:18,fontWeight:700,cursor:"pointer",
                  color:showMoveMode?"#fff":T.sub}}>↑↓</button>
              <button onClick={()=>{
                if(modelliTab==="turni"){
                  setEditModello(null);
                  setModelForm({titolo:"",tempo:"6h15",inizio:"",fine:"",coloreCustom:null,posizione:"",calendarId:calId});
                  setShowModelForm(true);
                } else {
                  setEditRotazione(null);
                  setRotForm({tipo:"personalizzata",titolo:"",dataInizio:"",nSettimane:52,modellaLavoroId:null,modelloNLId:null,modelloRSId:null});
                  setShowRotForm(true);
                }
              }} style={{background:accent,border:"none",borderRadius:8,padding:"6px 16px",
                fontSize:20,fontWeight:800,cursor:"pointer",color:"#fff"}}>+</button>
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
        {[["turni","Turni"],["rotazioni","Rotazioni"]].map(([v,l])=>(
          <button key={v} onClick={()=>setModelliTab(v)}
            style={{flex:1,padding:"9px 0",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:14,
              background:modelliTab===v?(dark?"#0f172a":"#fff"):"transparent",
              color:modelliTab===v?T.text:T.sub,
              boxShadow:modelliTab===v?"0 2px 8px rgba(0,0,0,0.12)":"none"}}>{l}</button>
        ))}
      </div>
      {/* Info calendario attivo — mostra nome, non avviso generico */}
      {store.calendars.length>0&&calId&&(
        <div style={{margin:"0 12px 10px",background:store.calendars.find(c=>c.id===calId)?.color+"22"||"#3b82f622",
          border:`1px solid ${store.calendars.find(c=>c.id===calId)?.color+"55"||"#3b82f655"}`,
          borderRadius:10,padding:"6px 12px",fontSize:12,
          color:store.calendars.find(c=>c.id===calId)?.color||accent,fontWeight:700}}>
           Modelli di: {store.calendars.find(c=>c.id===calId)?.name||""}
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",padding:"0 12px 80px"}}>
        {modelliTab==="turni"&&(()=>{
          // Filtra modelli per calendario attivo
          const mainCalId = store.calendars.find(c=>c.isMain)?.id||null;
          const modelliVisibili = calId===null
            ? sortedModelli()
            : sortedModelli().filter(m=>{
                const mcid = m.calendarId||mainCalId;
                return mcid===calId;
              });
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
                  <ModelloCard m={m} T={T} accent={accent}
                    onEdit={()=>{ if(!showMoveMode){ setEditModello(m); setModelForm(m); setShowModelForm(true); } }}
                    onDelete={()=>deleteModello(m.id)}
                    onMoveUp={showMoveMode?()=>moveH24(m.id,"up"):null}
                    onMoveDown={showMoveMode?()=>moveH24(m.id,"down"):null}
                    onTouchStart={showMoveMode?()=>{touchSrcId.current=m.id;}:null}
                    onTouchMove={showMoveMode?(e)=>{
                      e.preventDefault();
                      const t=e.touches[0];
                      const el=document.elementFromPoint(t.clientX,t.clientY);
                      const card=el?.closest("[data-modello-id]");
                      if(card) touchTargetId.current=card.getAttribute("data-modello-id");
                    }:null}
                    onTouchEnd={showMoveMode?async()=>{
                      if(!touchSrcId.current||!touchTargetId.current||touchSrcId.current===touchTargetId.current){touchSrcId.current=null;touchTargetId.current=null;return;}
                      const sorted=[...modelli].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
                      const srcIdx=sorted.findIndex(x=>x.id===touchSrcId.current);
                      const dstIdx=sorted.findIndex(x=>x.id===touchTargetId.current);
                      if(srcIdx===-1||dstIdx===-1){touchSrcId.current=null;touchTargetId.current=null;return;}
                      const reordered=[...sorted];
                      const [moved]=reordered.splice(srcIdx,1);
                      reordered.splice(dstIdx,0,moved);
                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder); // aggiornamento UI immediato
                      for(const x of withNewOrder){
                        supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      touchSrcId.current=null;touchTargetId.current=null;
                    }:null}
                    onDragStart={showMoveMode?()=>{dragSrcId.current=m.id;}:null}
                    onDragOver={showMoveMode?(e)=>{e.preventDefault();}:null}
                    onDrop={showMoveMode?async()=>{
                      if(!dragSrcId.current||dragSrcId.current===m.id) return;
                      const sorted=[...modelli].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
                      const srcIdx=sorted.findIndex(x=>x.id===dragSrcId.current);
                      const dstIdx=sorted.findIndex(x=>x.id===m.id);
                      if(srcIdx===-1||dstIdx===-1) return;
                      const reordered=[...sorted];
                      const [moved]=reordered.splice(srcIdx,1);
                      reordered.splice(dstIdx,0,moved);
                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder); // aggiornamento UI immediato
                      for(const x of withNewOrder){
                        supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      dragSrcId.current=null;
                    }:null}/>
                </div>
              ))}
            </div>
          );
        })()}
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
                    <RotazioneCard r={r} T={T} accent={accent} modelli={modelli}
                      onOpen={()=>setShowRotDetail(r.id)}
                      onDelete={()=>deleteRotazione(r.id)}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
            <RotazioneForm T={T} form={rotForm} setForm={setRotForm} accent={accent} modelli={modelli}
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
                  {Object.values(rot.griglia||{}).filter(Boolean).length} giorni configurati
                </div>
              </div>
              <button onClick={()=>{updateGrigliaRotazione(rot.id,rot.griglia);setShowRotDetail(null);}}
                style={{background:accent,border:"none",borderRadius:8,color:"#fff",
                  padding:"6px 14px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Fatto</button>
            </div>
            <div style={{flex:1,overflow:"hidden"}}>
              {rot.tipo==="personalizzata"&&(
                <GrigliaRotazione rot={rot} T={T} accent={accent} modelli={modelli}
                  onUpdate={griglia=>setRotazioni(prev=>prev.map(r=>r.id===rot.id?{...r,griglia}:r))}/>
              )}
              {rot.tipo==="domeniche"&&(
                <DomenicheView rot={rot} T={T} accent={accent} modelli={modelli}
                  onUpdate={griglia=>setRotazioni(prev=>prev.map(r=>r.id===rot.id?{...r,griglia}:r))}/>
              )}
              {rot.tipo==="nlrs"&&(
                <NLRSView rot={rot} T={T} accent={accent} modelli={modelli}/>
              )}
              {rot.tipo==="nlrs_scalante"&&(
                <NLRSScalanteView rot={rot} T={T} accent={accent} modelli={modelli}/>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );

  // ── SETTINGS VIEW ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 13: SETTINGS VIEW
// ═══════════════════════════════════════════════════════════════
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

      <SecCollapsible label="CALENDARI" T={T}>
        {store.calendars.map((c,ci)=>(
          <div key={c.id} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:T.s2,borderRadius:10,padding:"8px 10px"}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:c.color,
                  border:`2px solid ${T.border}`,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();setPal(pal===c.id?null:c.id);}}/>
                {pal===c.id&&<Pal T={T} cur={c.color} onPick={p=>{
                  const newCals=JSON.parse(JSON.stringify(store.calendars));
                  newCals[ci].color=p;
                  setStore(s=>({...s,calendars:newCals}));
                  updateCalendar(c.id,{color:p});
                  setPal(null);
                }}/>}
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
                if(syncMode==='on' && sheetsUrl) saveToSheets(store.events,newCals);
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
                      {pal===sh.id&&<Pal T={T} cur={sh.color} onPick={p=>{
                        const newCals=JSON.parse(JSON.stringify(store.calendars));
                        newCals[ci].shifts[si].color=p;
                        setStore(s=>({...s,calendars:newCals}));
                        updateCalendar(c.id,{shifts:newCals[ci].shifts});
                        setPal(null);
                      }}/>}
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
                    {pal==="ns"&&<Pal T={T} cur={nsColor} onPick={p=>{setNsColor(p);setPal(null);}}/>}
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
            {pal==="nc"&&<Pal T={T} cur={ncColor} onPick={p=>{setNcColor(p);setPal(null);}}/>}
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
              if(syncMode==='on' && sheetsUrl) saveToSheets(store.events,newCals);
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
            color:"#fff",padding:"9px 0",cursor:"pointer",fontWeight:800,fontSize:12,marginBottom:8}}>
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

      <Sec label="FESTIVI LOCALI" T={T}>
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
      </Sec>
    </div>
  );

  // ── DAY MODAL ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion




// #region SEZIONE 14: DAY MODAL
// ═══════════════════════════════════════════════════════════════
  const curEvts = dayKey ? getEvts(dayKey,calId) : [];
  const dayModal = dayKey&&(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,
      display:"flex",alignItems:"flex-end"}}
      onClick={e=>{if(e.target===e.currentTarget){setDayKey(null);setForm(null);setPal(null);}}}>
      <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
        maxWidth:480,margin:"0 auto",padding:"16px 14px 32px",maxHeight:"88vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{fontSize:16,fontWeight:900,color:T.text}}>{dayKey}</div>
            <div style={{fontSize:11,color:accent,fontWeight:700}}>{activeCal?.name||"Seleziona un calendario"}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {!form&&activeCal&&(
              <button onClick={()=>setShowModelloPicker(true)}
                style={{background:accent,border:"none",borderRadius:8,
                  color:"#fff",fontSize:13,fontWeight:800,padding:"7px 14px",cursor:"pointer"}}>
                + Aggiungi
              </button>
            )}
            <button onClick={()=>{setDayKey(null);setForm(null);}}
              style={{background:T.s2,border:"none",borderRadius:8,
                color:T.sub,width:32,height:32,cursor:"pointer",fontSize:18}}>×</button>
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
                  borderRadius:8,padding:"3px 10px"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:c.color}}/>
                <span style={{fontSize:11,color:T.text,fontWeight:600}}>
                  {c.name}{n>0?` (${n})`:""}</span>
              </button>
            );
          })}
        </div>
        {curEvts.length===0&&!form&&(
          <div style={{textAlign:"center",color:T.sub,padding:"24px 0",fontSize:13}}>
            Nessun evento — premi + Aggiungi
          </div>
        )}
        {curEvts.filter(e=>!form||form.editId!==e.id).map(e=>(
          <div key={e.id} onClick={()=>{
              if(form?.editId===e.id){ setForm(null); return; }
              setForm({ editId:e.id, modelloId:null, shiftId:null, label:e.label,
                colorOvr:e.color, dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":"custom", tIn:e.tIn||"", tOut:e.tOut||"",
                place:e.place||"", map:e.map||"", note:e.note||"", collega:e.collega||"", auto:e.auto||"",
                protPagFine:e.protPagFine||"", protRecFine:e.protRecFine||"" });
            }}
            style={{background:e.color,borderRadius:10,padding:"10px 12px",marginBottom:8,cursor:"pointer",
              display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontSize:20,fontWeight:800,textShadow:"0 1px 3px rgba(0,0,0,0.3)"}}>{e.label}</div>
              {!e.allDay&&e.tIn&&(
                <div style={{color:"rgba(255,255,255,0.85)",fontSize:17,marginTop:2}}>
                  🕐 {e.tIn}{e.tOut?` → ${e.tOut}`:""}
                </div>
              )}
              {e.collega&&<div style={{color:"rgba(255,255,255,0.8)",fontSize:17,marginTop:3}}>👮 {e.collega}</div>}
              {(e.protPagFine||e.protRecFine)&&(()=>{
                function calcDurProt(tBase, oraFine){
                  if(!oraFine||!tBase) return "";
                  const [h1,m1]=tBase.split(":").map(Number);
                  const [h2,m2]=oraFine.split(":").map(Number);
                  let d=(h2*60+m2)-(h1*60+m1);
                  if(d<0) d+=24*60;
                  return d>0?Math.floor(d/60)+"h"+(d%60>0?" "+d%60+"m":""):"";
                }
                const tBase = e.tOut||calcFine6h15(e.tIn)||"";
                return (
                  <div style={{marginTop:4,display:"flex",flexDirection:"column",gap:2}}>
                    {e.protPagFine&&<div style={{color:"rgba(255,255,255,0.9)",fontSize:16}}>
                      💜 PAG → {e.protPagFine}{calcDurProt(tBase,e.protPagFine)?" ("+calcDurProt(tBase,e.protPagFine)+")":""}
                    </div>}
                    {e.protRecFine&&<div style={{color:"rgba(255,255,255,0.9)",fontSize:16}}>
                      ⚙️ REC → {e.protRecFine}{calcDurProt(tBase,e.protRecFine)?" ("+calcDurProt(tBase,e.protRecFine)+")":""}
                    </div>}
                  </div>
                );
              })()}
              
            </div>
            <button onClick={e2=>{e2.stopPropagation();setForm({
                editId:e.id,modelloId:null,shiftId:null,label:e.label,colorOvr:e.color,
                dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":"custom",tIn:e.tIn||"",tOut:e.tOut||"",place:e.place||"",
                map:e.map||"",note:e.note||"",collega:e.collega||"",auto:e.auto||"",
                protPagFine:e.protPagFine||"",protRecFine:e.protRecFine||"",
              });}}
              style={{background:"rgba(0,0,0,0.2)",border:"none",borderRadius:6,
                color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,marginLeft:4,flexShrink:0}}>✏️</button>
            <button onClick={e2=>{e2.stopPropagation();delEvt(dayKey,calId,e.id);}}
              style={{background:"rgba(0,0,0,0.2)",border:"none",borderRadius:6,
                color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,marginLeft:4,flexShrink:0}}>×</button>
          </div>
        ))}
        {form&&(
          <div style={{background:T.s2,borderRadius:12,padding:14,marginTop:8}}>
            {!form.modelloId&&!form.editId&&(
              <div style={{fontSize:10,color:T.sub,fontWeight:900,marginBottom:12,letterSpacing:1}}>NUOVO EVENTO</div>
            )}
            {form.editId&&(
              <div style={{fontSize:24,color:T.text,fontWeight:900,marginBottom:12,letterSpacing:1}}>{(form.label||"EVENTO").toUpperCase()}</div>
            )}
            {modelli.length>0&&!form.editId&&(()=>{
              const mainCalId3 = store.calendars.find(c=>c.isMain)?.id||null;
              const modelliDelCal = modelli.filter(m=>{
                if(!calId) return true; // TUTTI → tutti i modelli
                const mcid = m.calendarId||mainCalId3;
                return mcid===calId;
              });
              if(modelliDelCal.length===0) return null;
              return (
              <>
                {!form.modelloId&&<div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600}}>MODELLO TURNO</div>}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  {(form.modelloId?modelliDelCal.filter(m=>m.id===form.modelloId):modelliDelCal).map(m=>{
                    const c=m.coloreCustom||getColorByTime(m.inizio);
                    return (
                      <button key={m.id}
                        onClick={()=>setForm(f=>({...f,modelloId:m.id,shiftId:null,label:m.label||m.titolo,colorOvr:null,
                          dur:m.tempo==="h24"?"allday":m.tempo==="6h15"?"fixed":"custom",
                          tIn:m.inizio||"",tOut:m.fine||""}))}
                        style={{background:form.modelloId===m.id?c:T.surface,
                          border:`2px solid ${form.modelloId===m.id?c:T.border}`,
                          borderRadius:10,padding:"6px 10px",cursor:"pointer",
                          color:form.modelloId===m.id?"#fff":T.sub,fontSize:11,fontWeight:700,
                          display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:c}}/>
                        {m.titolo}
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
              <input value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
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
                  {pal==="ec"&&<Pal T={T} onPick={p=>{setForm(f=>({...f,colorOvr:p}));setPal(null);}} up/>}
                </div>
                {form.colorOvr&&(
                  <button onClick={()=>setForm(f=>({...f,colorOvr:null}))}
                    style={{background:"none",border:"none",color:T.sub,fontSize:13,fontWeight:700,cursor:"pointer"}}>↩ auto</button>
                )}
              </div>
            )}
            <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>DURATA</div>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              {[["allday","Tutto il giorno"],["fixed","6h 15m"],["custom","Orario libero"]].map(([v,l])=>(
                <button key={v} onClick={()=>setForm(f=>({...f,dur:v}))}
                  style={{flex:1,padding:"7px 2px",borderRadius:8,cursor:"pointer",fontSize:10,fontWeight:700,
                    background:form.dur===v?accent:T.surface,
                    color:form.dur===v?"#fff":T.sub,
                    border:`1.5px solid ${form.dur===v?accent:T.border}`}}>{l}</button>
              ))}
            </div>
            {form.dur!=="allday"&&(
  <div style={{marginBottom:10}}>
    <div style={{display:"flex",gap:8,marginBottom:8}}>
      <div style={{flex:1}}>
        <div style={{fontSize:9,color:T.sub,marginBottom:3}}>INGRESSO</div>
        <SmartTimeInput value={form.tIn||""} onChange={v=>setForm(f=>({...f,tIn:v,tOut:""}))}
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
          <div style={{fontSize:9,color:T.sub,marginBottom:3}}>USCITA (modif.)</div>
          <SmartTimeInput value={form.tOut||calcFine6h15(form.tIn)} onChange={v=>setForm(f=>({...f,tOut:v}))}
            style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
        </div>
      )}
    </div>
    {(()=>{
      const tBase = form.tOut||calcFine6h15(form.tIn)||"";
      function calcDur(oraFine){
        if(!oraFine||!tBase) return "";
        const [h1,m1]=tBase.split(":").map(Number);
        const [h2,m2]=oraFine.split(":").map(Number);
        let d=(h2*60+m2)-(h1*60+m1);
        if(d<0) d+=24*60;
        return d>0?Math.floor(d/60)+"h"+(d%60>0?" "+d%60+"m":""):"";
      }
      const durPag = calcDur(form.protPagFine||"");
      const durRec = calcDur(form.protRecFine||"");
      return (
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
      );
    })()}
  </div>
)}
                    
            <input value={form.auto||""} onChange={e=>{
                const raw=e.target.value.toUpperCase();
                const stripped=raw.replace(/^(CH\s*)+/i,"").trim();
                setForm(f=>({...f,auto:stripped?"CH "+stripped:""}));
              }}
              placeholder="🚗 Numero auto/pattuglia (opzionale)..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none"}}/>
            <textarea value={form.collega||""} onChange={e=>{setForm(f=>({...f,collega:e.target.value.toUpperCase()}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
              placeholder="👮 Collega" rows={1}
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none",resize:"none",fontFamily:"inherit",
                overflow:"hidden",minHeight:36}}/>
            <input value={form.place||""} onChange={e=>setForm(f=>({...f,place:e.target.value.toUpperCase()}))}
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
                  borderRadius:10,color:T.sub,padding:"11px 0",cursor:"pointer",fontSize:13,fontWeight:700}}>
                Annulla
              </button>
              <button onClick={form.editId?updateEvt:saveEvt}
                style={{flex:2,background:accent,border:"none",borderRadius:10,
                  color:"#fff",padding:"11px 0",cursor:"pointer",fontSize:13,fontWeight:800}}>
                💾 Salva
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── DB MODAL ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 15: DB MODAL + RENDER PRINCIPALE
// ═══════════════════════════════════════════════════════════════
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
                        <span style={{fontSize:9,color:T.sub}}>{e.date_key}</span>
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
        <div style={{padding:12,borderTop:`1px solid ${T.border}`}}>
          <button onClick={()=>setShowDbModal(false)}
            style={{width:"100%",background:"#64748b",border:"none",borderRadius:10,color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );

  // ── MAIN RENDER ───────────────────────────────────────────────
  const NAV_ITEMS = [
    { id:"cal",      icon:"▦",  label:"Calendario" },
    { id:"report",   icon:"📊", label:"Report" },
    { id:"modelli",  icon:"📋", label:"Modelli" },
    { id:"settings", icon:"⚙", label:"Impostazioni" },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,
      fontFamily:"system-ui,sans-serif",maxWidth:480,margin:"0 auto",overflow:"hidden"}}
      onClick={()=>pal&&setPal(null)}>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {screen==="cal"      && calView}
        {screen==="report"   && reportView}
        {screen==="modelli"  && modelliView}
        {screen==="settings" && settingsView}
      </div>
      <div style={{display:"flex",borderTop:`1px solid ${T.border}`,background:T.surface,flexShrink:0}}>
        {NAV_ITEMS.map(({id,icon,label})=>(
          <button key={id} onClick={()=>setScreen(id)}
            style={{flex:1,background:"none",border:"none",padding:"8px 0",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <span style={{fontSize:18,color:screen===id?accent:T.sub}}>{icon}</span>
            <span style={{fontSize:9,fontWeight:700,color:screen===id?accent:T.sub}}>{label}</span>
          </button>
        ))}
      </div>
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
              onSave={async()=>{
                await saveModello({...modelForm,id:editModello?.id});
                setShowModelForm(false);
                setShowModelloPicker(true);
              }}/>
          </div>
        </div>
      )}
      {showModelloPicker&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,
          display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"16px 16px 8px",background:T.surface,borderBottom:`1px solid ${T.border}`}}>
            <button onClick={()=>setShowModelloPicker(false)}
              style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>‹</button>
            <div style={{fontSize:16,fontWeight:900,color:T.text}}>Scegli modello</div>
            <div style={{width:32}}/>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:12,background:T.bg}}>
            {modelli.length===0&&(
              <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                <div style={{fontSize:36,marginBottom:10}}>📋</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessun modello</div>
                <div style={{fontSize:13}}>Crea il tuo primo modello turno</div>
              </div>
            )}
            {(()=>{
              const mainCalId4 = store.calendars.find(c=>c.isMain)?.id||null;
              const modelliPicker = sortedModelli().filter(m=>{
                const mcid = m.calendarId||mainCalId4;
                return !calId || mcid===calId;
              });
              if(modelliPicker.length===0) return null;
              return (
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                {modelliPicker.map((m,i,arr)=>{
                  const c=m.coloreCustom||getColorByTime(m.inizio);
                  const durata=m.tempo==="h24"?"Tutto il giorno"
                    :m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)} • 6h 15m`
                    :m.inizio&&m.fine?`${m.inizio} - ${m.fine} • ${calcDurata(m.inizio,m.fine)}`
                    :m.inizio?m.inizio:"";
                  return (
                    <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <div onClick={()=>{
                        setForm({modelloId:m.id,shiftId:null,label:m.titolo,note:"",
                          dur:m.tempo==="h24"?"allday":m.tempo==="6h15"?"fixed":"custom",
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
              setShowModelForm(true);
              setShowModelloPicker(false);
            }} style={{width:"100%",background:accent,border:"none",borderRadius:14,
              color:"#fff",padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
              + Nuovo modello
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CAL BADGE ────────────────────────────────────────────────
// Badge cliccabile con nome calendario e palette colori
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 16: COMPONENTS
// ═══════════════════════════════════════════════════════════════
function CalBadge({ calId, calAttivo, coloreCal, testoContrasto, T, store, setStore, updateCalendar, accent, setCalId }){
  const [showCalPal, setShowCalPal] = useState(false);
  const [showCalSwitch, setShowCalSwitch] = useState(false);
  if(!calId||!calAttivo) return null;
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <div style={{position:"relative"}}>
        <div onClick={()=>{ setShowCalPal(s=>!s); setShowCalSwitch(false); }}
          style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",
            background:coloreCal,borderRadius:20,padding:"3px 12px 3px 8px"}}>
          <div style={{width:10,height:10,borderRadius:"50%",
            background:"rgba(255,255,255,0.4)",border:"1.5px solid rgba(255,255,255,0.8)"}}/>
          <span style={{fontSize:13,fontWeight:800,color:testoContrasto}}>{calAttivo.name}</span>
          <span style={{fontSize:10,color:testoContrasto,opacity:0.7}}>🎨</span>
        </div>
        {showCalPal&&(
          <div style={{position:"absolute",top:36,left:0,background:T.surface,
            border:`1px solid ${T.border}`,borderRadius:12,padding:10,zIndex:500,
            boxShadow:"0 8px 32px rgba(0,0,0,0.25)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
              {["#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
                "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6",
                "#a855f7","#ec4899","#f43f5e","#64748b","#0f172a","#1e40af"].map(p=>(
                <div key={p} onClick={()=>{
                  const newCals=JSON.parse(JSON.stringify(store.calendars));
                  const idx=newCals.findIndex(c=>c.id===calId);
                  if(idx>-1){ newCals[idx].color=p; setStore(s=>({...s,calendars:newCals})); updateCalendar(calId,{color:p}); }
                  setShowCalPal(false);
                }} style={{width:24,height:24,borderRadius:"50%",background:p,cursor:"pointer",
                  outline:coloreCal===p?"3px solid #64748b":"none",outlineOffset:2}}/>
              ))}
            </div>
          </div>
        )}
      </div>
      {store&&store.calendars&&store.calendars.length>1&&(
        <div style={{position:"relative"}}>
          <button onClick={()=>{ setShowCalSwitch(s=>!s); setShowCalPal(false); }}
            style={{background:coloreCal,border:"none",borderRadius:"50%",
              width:24,height:24,cursor:"pointer",display:"flex",alignItems:"center",
              justifyContent:"center",color:testoContrasto,fontSize:14,fontWeight:900}}>
            ▾
          </button>
          {showCalSwitch&&(
            <div style={{position:"absolute",top:28,left:0,background:T.surface,
              border:`1px solid ${T.border}`,borderRadius:12,padding:6,zIndex:500,
              boxShadow:"0 8px 32px rgba(0,0,0,0.25)",minWidth:140}}
              onClick={e=>e.stopPropagation()}>
              {(store.calendars||[]).map(c=>(
                <div key={c.id} onClick={()=>{ setCalId&&setCalId(c.id); setShowCalSwitch(false); }}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                    borderRadius:8,cursor:"pointer",
                    background:c.id===calId?accent+"18":"transparent"}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c.color}}/>
                  <span style={{fontSize:13,fontWeight:c.id===calId?700:400,
                    color:c.id===calId?accent:T.text}}>{c.name}</span>
                  {c.id===calId&&<span style={{color:accent,fontSize:11}}>✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── SMART TIME INPUT ──────────────────────────────────────────
// Campo orario HH:MM controllato via onChange (funziona anche su
// tastiera virtuale mobile, a differenza della vecchia versione
// basata su onKeyDown + readOnly che su telefono non riceveva input).
function SmartTimeInput({ value, onChange, style }) {
  // Buffer di sole cifre (max 4: HHMM), così l'utente può digitare
  // liberamente e noi formattiamo in tempo reale come "HH:MM".
  const [digits, setDigits] = useState(() => (value || "").replace(/\D/g, "").slice(0, 4));

  // Se il valore esterno cambia (es. selezione di un modello turno),
  // risincronizza il buffer di cifre.
  useEffect(() => {
    setDigits((value || "").replace(/\D/g, "").slice(0, 4));
  }, [value]);

  function clampAndEmit(rawDigits) {
    let d = rawDigits.replace(/\D/g, "").slice(0, 4);

    // Validazione progressiva ore/minuti mentre si digita
    if (d.length >= 1) {
      const h0 = parseInt(d[0], 10);
      if (h0 > 2) {
        // prima cifra ora troppo alta per essere ore valide a due cifre (>2X)
        // la trattiamo come "0" + cifra (es: digitando 9 → 09)
        d = "0" + d[0] + d.slice(1, 3);
        d = d.slice(0, 4);
      }
    }
    if (d.length >= 2) {
      let hh = parseInt(d.slice(0, 2), 10);
      if (hh > 23) hh = 23;
      d = String(hh).padStart(2, "0") + d.slice(2);
    }
    if (d.length >= 4) {
      let mm = parseInt(d.slice(2, 4), 10);
      if (mm > 59) mm = 59;
      d = d.slice(0, 2) + String(mm).padStart(2, "0");
    } else if (d.length === 3) {
      const m0 = parseInt(d[2], 10);
      if (m0 > 5) {
        // prima cifra minuti troppo alta (>5X) → tratta come 0X
        d = d.slice(0, 2) + "0" + d[2];
        d = d.slice(0, 4);
      }
    }

    setDigits(d);

    if (d.length === 4) {
      onChange(d.slice(0, 2) + ":" + d.slice(2, 4));
    } else if (d.length === 0) {
      onChange("");
    } else {
      // Valore parziale: non ancora un orario completo, non sovrascriviamo
      // il valore "salvato" finché non sono state digitate tutte le 4 cifre,
      // ma mostriamo comunque il progresso nel campo (vedi displayValue).
    }
  }

  function handleChange(e) {
    const typed = e.target.value;
    // Calcola le sole cifre digitate (gestisce anche cancellazioni)
    const onlyDigits = typed.replace(/\D/g, "");
    clampAndEmit(onlyDigits.slice(0, 4));
  }

  function handleKeyDown(e) {
    // Permette backspace/canc/freccie/tab di funzionare normalmente;
    // per i tasti numerici lasciamo fare a onChange.
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setDigits(d => {
        const next = d.slice(0, -1);
        if (next.length === 4) onChange(next.slice(0, 2) + ":" + next.slice(2, 4));
        else onChange("");
        return next;
      });
    }
  }

  function handleFocus(e) {
    // Seleziona tutto al focus per permettere di ridigitare da capo
    e.target.select();
  }

  // Valore mostrato nel campo: formatta progressivamente mentre si digita
  let displayValue = "";
  if (digits.length > 0) {
    const hh = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    displayValue = mm ? hh + ":" + mm : (digits.length >= 3 ? hh + ":" + mm : hh);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="HH:MM"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      style={style}
    />
  );
}

// ── REPORT SUB-COMPONENTS ─────────────────────────────────────

// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 17: REPORT SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════
function FasceExpand({data, pct1, pct2, T, modelli, accent}){
  const [openFascia, setOpenFascia] = useState(null);

  function turniDiFascia(fascia){
    return Object.entries(data.perModello||{}).filter(([mid])=>{
      const m=modelli.find(x=>x.id===mid);
      if(!m) return false;
      if(m.tempo==="h24") return false;
      if(!m.inizio) return false;
      const [h]=m.inizio.split(":").map(Number);
      const mins=h*60+(parseInt((m.inizio.split(":")||["0","0"])[1]||"0"));
      if(fascia==="primo") return mins>=360&&mins<705;
      return mins>=720;
    });
  }

  const fasce=[
    {key:"primo",  label:"1° TURNO (06:00-11:45)", color:"#f59e0b", count:data.primo||0,  pct:pct1},
    {key:"secondo",label:"2° TURNO (12:00-23:59)", color:"#f97316", count:data.secondo||0, pct:pct2},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {fasce.map(f=>(
        <div key={f.key}>
          <div onClick={()=>setOpenFascia(openFascia===f.key?null:f.key)}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 10px",background:f.color+"22",borderRadius:openFascia===f.key?"8px 8px 0 0":8,
              border:`1px solid ${f.color}44`,cursor:"pointer"}}>
            <span style={{fontSize:13,fontWeight:800,color:f.color}}>
              {f.label} {openFascia===f.key?"▲":"▼"}
            </span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:f.color,background:f.color+"22",
                borderRadius:6,padding:"2px 7px"}}>{f.pct}%</span>
              <span style={{fontSize:16,fontWeight:900,color:T.text}}>{f.count}</span>
            </div>
          </div>
          {openFascia===f.key&&(
            <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${f.color}44`,
              borderTop:"none",padding:"8px 10px"}}>
              {turniDiFascia(f.key).length===0?(
                <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun turno</div>
              ):turniDiFascia(f.key).map(([mid,cnt])=>{
                const m=modelli.find(x=>x.id===mid);
                if(!m) return null;
                const c=m.coloreCustom||f.color;
                return (
                  <div key={mid} style={{display:"flex",alignItems:"center",gap:8,
                    padding:"5px 6px",borderRadius:6,marginBottom:3,background:T.surface}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                    <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                    <span style={{fontSize:13,fontWeight:800,color:T.text}}>{cnt}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ConteggioConfigCard({T, r, cfg, data, totaleTurni, modelli, accent, onRename, onUpdateCfg, onGoToModelli}){
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r.label);
  const pct = totaleTurni>0 ? Math.round((data.totale/totaleTurni)*100) : 0;
  const [showTurniList, setShowTurniList] = useState(false);

  const FASCE = [
    {key:"primo",   label:"1° TURNO (06:00-11:45)", count:data.primo||0},
    {key:"secondo", label:"2° TURNO (12:00-23:59)", count:data.secondo||0},
    
  ];
  const pct1 = data.totale>0 ? Math.round(((data.primo||0)/data.totale)*100) : 0;
  const pct2 = data.totale>0 ? Math.round(((data.secondo||0)/data.totale)*100) : 0;

  function toggleFascia(key){
    const cur = cfg.fasceFiltro||[];
    const next = cur.includes(key) ? cur.filter(f=>f!==key) : [...cur, key];
    onUpdateCfg({...cfg, fasceFiltro: next});
  }

  const isFiltered = (cfg.fasceFiltro||[]).length>0;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {/* Nome report */}
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:10,color:T.sub,marginBottom:4}}>NOME REPORT</div>
        {editingName?(
          <div style={{display:"flex",gap:6}}>
            <input value={tmpName} onChange={e=>setTmpName(e.target.value)}
              style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"6px 10px",color:T.text,fontSize:13,outline:"none"}}/>
            <button onClick={()=>{onRename(tmpName);setEditingName(false);}}
              style={{background:accent,border:"none",borderRadius:8,color:"#fff",
                padding:"6px 12px",cursor:"pointer",fontWeight:800,fontSize:12}}>✓</button>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text,flex:1}}>{r.label}</span>
            <button onClick={()=>setEditingName(true)}
              style={{background:"none",border:"none",color:accent,cursor:"pointer",fontSize:16,padding:"0 4px"}}>✏️</button>
          </div>
        )}
      </div>

      {/* Statistiche */}
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div onClick={()=>setShowTurniList(s=>!s)}
  style={{fontSize:10,color:T.sub,fontWeight:700,cursor:"pointer",
    display:"flex",alignItems:"center",gap:4}}>
  TOTALE TURNI {showTurniList?"▲":"▼"}
</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20,fontWeight:900,color:T.text}}>{data.totale}</span>

          </div>
        </div>
        {showTurniList&&(
  <div style={{background:T.s2,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
    <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>
      Clicca per includere/escludere dal conteggio
    </div>
    {/* Voce "Tutti" */}
    <div onClick={()=>onUpdateCfg({...cfg,fasceFiltro:[]})}
      style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
        borderRadius:6,cursor:"pointer",marginBottom:4,
        background:(cfg.fasceFiltro||[]).length===0?accent+"22":"transparent",
        border:`1px solid ${(cfg.fasceFiltro||[]).length===0?accent:T.border}`}}>
      <span style={{fontSize:11,fontWeight:700,
        color:(cfg.fasceFiltro||[]).length===0?accent:T.text}}>✓ Tutti i turni</span>
      <span style={{fontSize:12,fontWeight:800,color:T.sub,marginLeft:"auto"}}>{data.totale}</span>
    </div>
    {Object.entries(data.perModello||{}).map(([mid,cnt])=>{
      const m=modelli.find(x=>x.id===mid);
      if(!m) return null;
      const c=m.coloreCustom||getColorByTime(m.inizio);
      // Determina fascia del modello per il filtro
      const getFascia=()=>{
        if(m.allDay||m.tempo==="h24") return "h24";
        if(!m.inizio) return null;
        const [h]=m.inizio.split(":").map(Number);
        const mins=h*60+(parseInt(m.inizio.split(":")[1]||"0"));
        if(mins>=360&&mins<705) return "primo";
        return "secondo";
      };
      const fascia=getFascia();
      const filtroAttivo=(cfg.fasceFiltro||[]).length>0;
      const selezionato=!filtroAttivo||(fascia&&(cfg.fasceFiltro||[]).includes(fascia));
      return (
        <div key={mid} onClick={()=>{
          if(!fascia) return;
          const cur=cfg.fasceFiltro||[];
          if(cur.length===0){
            // Passa da "tutti" a "solo questa fascia"
            onUpdateCfg({...cfg,fasceFiltro:[fascia]});
          } else if(cur.includes(fascia)){
            const next=cur.filter(f=>f!==fascia);
            onUpdateCfg({...cfg,fasceFiltro:next});
          } else {
            onUpdateCfg({...cfg,fasceFiltro:[...cur,fascia]});
          }
        }} style={{display:"flex",alignItems:"center",gap:8,
          padding:"6px 8px",borderRadius:6,cursor:"pointer",marginBottom:4,
          background:selezionato?c+"18":"transparent",
          border:`1px solid ${selezionato?c+"44":T.border}`}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
          <div style={{flex:1}}>
            <span style={{fontSize:12,fontWeight:selezionato?700:400,
              color:selezionato?T.text:T.sub}}>{m.titolo}</span>
            <span style={{fontSize:10,color:T.sub,marginLeft:6}}>
              {m.tempo==="h24"?"H24":m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)}`:m.inizio&&m.fine?`${m.inizio} - ${m.fine}`:m.inizio||""}
            </span>
          </div>
          <span style={{fontSize:13,fontWeight:800,color:selezionato?T.text:T.sub}}>{cnt}</span>
          {selezionato&&<span style={{fontSize:10,color:c}}>✓</span>}
        </div>
      );
    })}
  </div>
)}
        {totaleTurni>0&&(
          <div style={{height:6,background:T.s2,borderRadius:3,marginBottom:10,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",background:accent,borderRadius:3,transition:"width 0.3s"}}/>
          </div>
        )}
        <FasceExpand data={data} pct1={pct1} pct2={pct2} T={T} modelli={modelli} accent={accent}/>
      </div>

      {/* Gruppo indipendente APP/AUTO basato sul titolo del modello */}
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>APP / AUTO</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[
            {key:"app",  label:"APP",  color:"#3b82f6", count:data.app||0},
            {key:"auto", label:"AUTO", color:"#8b5cf6", count:data.auto||0},
          ].map(g=>(
            <div key={g.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 10px",background:g.color+"22",borderRadius:8,border:`1px solid ${g.color}44`}}>
              <span style={{fontSize:13,fontWeight:800,color:g.color}}>{g.label}</span>
              <span style={{fontSize:16,fontWeight:900,color:T.text}}>{g.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filtro per collega */}
      <div>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>FILTRA PER COLLEGA</div>
        <input
          type="text"
          value={cfg.filtraCollega||""}
          onChange={e=>onUpdateCfg({...cfg,filtraCollega:e.target.value})}
          placeholder="Nome collega..."
          style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:10,padding:"10px 14px",color:T.text,fontSize:13,
            outline:"none",boxSizing:"border-box"}}/>
      </div>

      {/* Per modello */}
      {modelli.length>0&&data.perModello&&Object.keys(data.perModello).length>0&&(
        <div style={{background:T.surface,borderRadius:10,padding:12}}>
          <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>PER MODELLO</div>
          {Object.entries(data.perModello).map(([mid,cnt])=>{
            const m=modelli.find(x=>x.id===mid);
            if(!m) return null;
            const c=m.coloreCustom||getColorByTime(m.inizio);
            const mp=data.totale>0?Math.round((cnt/data.totale)*100):0;
            return (
              <div key={mid} style={{display:"flex",alignItems:"center",gap:8,
                padding:"6px 8px",background:T.s2,borderRadius:6,marginBottom:4}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                <span style={{flex:1,fontSize:12,color:T.text}}>{m.titolo}</span>
                <span style={{fontSize:11,color:T.sub}}>{mp}%</span>
                <span style={{fontSize:14,fontWeight:800,color:T.text}}>{cnt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IndennitaConfig({T, values, setValues, calc, onSave}){
  const fasce = [
    { key:"diurno",          label:"Diurno (06:00 - 22:00)", count:calc.diurno },
    { key:"notturno",        label:"Notturno",                count:calc.notturno },
    { key:"festivo",         label:"Festivo",                 count:calc.festivo },
    { key:"notturno_festivo",label:"Notturno festivo",        count:calc.notturno_festivo },
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{fontSize:10,color:T.sub,marginBottom:2}}>Imposta il compenso per fascia oraria</div>
      {fasce.map(f=>(
        <div key={f.key} style={{background:T.surface,borderRadius:10,padding:"10px 12px",
          display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:T.text}}>{f.label}</div>
            <div style={{fontSize:11,color:T.sub}}>{f.count} turni nel periodo</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:13,color:T.sub}}>€</span>
            <input type="number" value={values[f.key]||""} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}
              onBlur={onSave} placeholder="0.00" step="0.01"
              style={{width:70,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                padding:"6px 8px",color:T.text,fontSize:13,outline:"none",textAlign:"right"}}/>
          </div>
        </div>
      ))}
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:800,color:T.text}}>Totale stimato</span>
        <span style={{fontSize:16,fontWeight:900,color:"#22c55e"}}>
          € {fasce.reduce((sum,f)=>{
            const v=parseFloat(values[f.key])||0;
            return sum+v*f.count;
          },0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function OrePerTurnoView({T, data}){
  return (
    <div style={{background:T.surface,borderRadius:10,padding:12}}>
      <div style={{fontSize:11,color:T.sub,marginBottom:8}}>Stima ore lavorate nel periodo</div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:T.sub}}>1° Turno</span>
        <span style={{fontWeight:800,color:T.text}}>{(data.primo||0)*6.25}h</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:T.sub}}>2° Turno</span>
        <span style={{fontWeight:800,color:T.text}}>{(data.secondo||0)*6.25}h</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:12,color:T.sub}}>Totale stimato</span>
        <span style={{fontWeight:900,fontSize:15,color:"#3b82f6"}}>{(data.totale-data.h24)*6.25}h</span>
      </div>
    </div>
  );
}

function StraordinariView({T, data, store, reportRange}){
  // Calcola protrazioni leggendo il campo `note` di ogni evento
  // App.jsx scrive già:
  //   "Protrazione: +Xh Ym"  per pagamento (straordinarioTipo==="pagamento")
  //   "Anticipo: Xh Ym"      per recupero  (straordinarioTipo==="recupero")
  // e salva straordinarioTipo nel campo auto come suffisso ":PAG" o ":REC"
  // Per ora leggiamo la nota e il campo auto per distinguerli.

  const {from, to} = reportRange || {from:"", to:""};

  let minPagamento = 0;
  let minRecupero  = 0;

  for(const [dateKey, calMap] of Object.entries(store?.events||{})){
    if(from && dateKey < from) continue;
    if(to   && dateKey > to  ) continue;
    for(const [, evts] of Object.entries(calMap)){
      for(const e of evts){
        const nota  = (e.note||"").toUpperCase();
        const auto  = (e.auto||"").toUpperCase();
        // Legge minuti dalla nota "PROTRAZIONE: +Xh Ym" o "ANTICIPO: Xh Ym"
        const matchProt = nota.match(/PROTRAZIONE[^+]*\+?(\d+)H(?:\s*(\d+)M)?/);
        const matchAnti = nota.match(/ANTICIPO[^0-9]*(\d+)H(?:\s*(\d+)M)?/);
        if(matchProt){
          const mins = parseInt(matchProt[1]||0)*60 + parseInt(matchProt[2]||0);
          // Distingue pagamento da recupero tramite campo auto
          if(auto.includes(":REC")) minRecupero  += mins;
          else                      minPagamento += mins;
        }
        if(matchAnti){
          const mins = parseInt(matchAnti[1]||0)*60 + parseInt(matchAnti[2]||0);
          minRecupero -= mins; // anticipo riduce il saldo recupero
        }
      }
    }
  }

  function fmtMins(m){
    const sign = m < 0 ? "-" : "+";
    const abs  = Math.abs(m);
    const h    = Math.floor(abs/60);
    const min  = abs%60;
    return sign + h + "h" + (min>0?" "+min+"m":"");
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {/* Protrazione a PAGAMENTO */}
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>
          PROTRAZIONE A PAGAMENTO
        </div>
        {minPagamento===0?(
          <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>
            Nessuna protrazione a pagamento nel periodo
          </div>
        ):(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"10px 12px",background:"#8b5cf622",borderRadius:8,border:"1px solid #8b5cf644"}}>
            <span style={{fontSize:13,fontWeight:700,color:"#8b5cf6"}}>Totale</span>
            <span style={{fontSize:20,fontWeight:900,color:"#8b5cf6"}}>{fmtMins(minPagamento)}</span>
          </div>
        )}
      </div>

      {/* Saldo RECUPERO */}
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>
          SALDO RECUPERO
        </div>
        {minRecupero===0?(
          <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>
            Nessuna protrazione a recupero nel periodo
          </div>
        ):(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"10px 12px",
            background:minRecupero>=0?"#22c55e22":"#ef444422",
            borderRadius:8,
            border:`1px solid ${minRecupero>=0?"#22c55e44":"#ef444444"}`}}>
            <span style={{fontSize:13,fontWeight:700,
              color:minRecupero>=0?"#22c55e":"#ef4444"}}>
              {minRecupero>=0?"Credito":"Debito"}
            </span>
            <span style={{fontSize:20,fontWeight:900,
              color:minRecupero>=0?"#22c55e":"#ef4444"}}>
              {fmtMins(minRecupero)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function GuadagniView({T, indennita, calc}){
  const tot = ["diurno","notturno","festivo","notturno_festivo"].reduce((s,k)=>{
    return s+(parseFloat(indennita[k])||0)*calc[k];
  },0);
  return (
    <div style={{background:T.surface,borderRadius:10,padding:12}}>
      <div style={{fontSize:11,color:T.sub,marginBottom:8}}>Stima guadagni da indennità</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:14,fontWeight:800,color:T.text}}>Totale periodo</span>
        <span style={{fontSize:20,fontWeight:900,color:"#22c55e"}}>€ {tot.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ── SHARED COMPONENTS ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 18: MODELLO CARDS & FORMS
// ═══════════════════════════════════════════════════════════════
function Pal({T, cur, onPick, up=false}){
  return (
    <div style={{position:"absolute",zIndex:500,
      ...(up?{bottom:30,left:0}:{top:30,left:0}),
      background:T.surface,border:`1px solid ${T.border}`,
      borderRadius:12,padding:10,boxShadow:"0 8px 32px rgba(0,0,0,0.25)"}}
      onClick={e=>e.stopPropagation()}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
        {PALETTE.map(p=>(
          <div key={p} onClick={()=>onPick(p)}
            style={{width:24,height:24,borderRadius:"50%",background:p,cursor:"pointer",
              outline:cur===p?`3px solid ${p==="#ffffff"?"#000":"#fff"}`:"none",
              outlineOffset:2}}/>
        ))}
      </div>
    </div>
  );
}

function SecCollapsible({label,children,T}){
  const [open,setOpen]=useState(false);
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,
      borderRadius:12,marginBottom:14,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"12px 14px",cursor:"pointer"}}>
        <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.8px"}}>{label}</div>
        <span style={{color:T.sub,fontSize:12}}>{open?"▲":"▼"}</span>
      </div>
      {open&&<div style={{padding:"0 14px 14px"}}>{children}</div>}
    </div>
  );
}

function Sec({label,children,T}){
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,
      borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.8px",marginBottom:10}}>{label}</div>
      {children}
    </div>
  );
}

function ModelloCard({m, T, accent, onEdit, onDelete, onMoveUp, onMoveDown, onDragStart, onDragOver, onDrop, onTouchStart, onTouchMove, onTouchEnd}){
  const colore=m.coloreCustom||(m.tempo==="h24"?"#64748b":getColorByTime(m.inizio));
  const durata=m.tempo==="h24"?"Tutto il giorno"
    :m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)} • 6h 15m`
    :m.inizio&&m.fine?`${m.inizio} - ${m.fine} • ${calcDurata(m.inizio,m.fine)}`
    :m.inizio?m.inizio:"";
  return (
    <div
      draggable={!!(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={e=>{e.preventDefault();if(onDragOver)onDragOver(e);}}
      onDrop={e=>{e.preventDefault();if(onDrop)onDrop(e);}}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      data-modello-id={m.id}
      style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:onDragStart?"grab":"pointer",touchAction:onTouchStart?"none":"auto"}}
      onClick={onEdit}>
      <div style={{width:36,height:36,borderRadius:10,background:colore+"33",
        border:`2px solid ${colore}`,display:"flex",alignItems:"center",justifyContent:"center",
        flexShrink:0,marginRight:12}}>
        <div style={{width:14,height:14,borderRadius:"50%",background:colore}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub,marginTop:1}}>{durata}</div>
      </div>
      {onMoveUp&&<button onClick={e=>{e.stopPropagation();onMoveUp();}}
        style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,color:"#475569",
          cursor:"pointer",fontSize:20,padding:"6px 10px",minWidth:36,minHeight:36,
          display:"flex",alignItems:"center",justifyContent:"center",marginRight:2}}>▲</button>}
      {onMoveDown&&<button onClick={e=>{e.stopPropagation();onMoveDown();}}
        style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,color:"#475569",
          cursor:"pointer",fontSize:20,padding:"6px 10px",minWidth:36,minHeight:36,
          display:"flex",alignItems:"center",justifyContent:"center",marginRight:4}}>▼</button>}
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questo modello?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,
          padding:"0 4px",marginRight:4}}>×</button>
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}

function ModelForm({T, form, setForm, accent, dark, onSave}){
  const autoColore=form.tempo==="h24"?"#64748b":getColorByTime(form.inizio);
  const coloreVis=form.coloreCustom||autoColore;
  const fineAuto=form.tempo==="6h15"&&form.inizio?calcFine6h15(form.inizio):null;
  const [showPal,setShowPal]=useState(false);
  const PALETTE_M=["#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
    "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6",
    "#a855f7","#ec4899","#64748b","#1e40af","#0f172a","#ffffff"];
  return (
    <div style={{padding:"16px 14px 40px"}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:8}}>
        <input value={form.titolo} onChange={e=>setForm(f=>({...f,titolo:e.target.value.toUpperCase()}))}
          placeholder="TITOLO / CODICE (es. 00-06)"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <input value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value.toUpperCase()}))}
          placeholder="NOME DA MOSTRARE NEL CALENDARIO (es. NOTTE)"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>DURATA TURNO</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["h24","H24"],["6h15","6h 15m"],["personalizzato","Personalizzato"]].map(([v,l])=>(
          <button key={v} onClick={()=>setForm(f=>({...f,tempo:v}))}
            style={{flex:1,padding:"10px 4px",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:12,
              background:form.tempo===v?accent:T.s2,
              color:form.tempo===v?"#fff":T.sub}}>{l}</button>
        ))}
      </div>
      {form.tempo!=="h24"&&(
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
            <span style={{flex:1,fontSize:15,color:T.text}}>Inizio</span>
            <input type="time" value={form.inizio} onChange={e=>setForm(f=>({...f,inizio:e.target.value}))}
              style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:15,fontWeight:700}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",padding:"14px 16px"}}>
            <span style={{flex:1,fontSize:15,color:T.text}}>Fine</span>
            {form.tempo==="6h15"&&fineAuto?(
              <span style={{fontSize:15,fontWeight:700,color:T.sub}}>{fineAuto} (auto)</span>
            ):(
              <input type="time" value={form.fine} onChange={e=>setForm(f=>({...f,fine:e.target.value}))}
                style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:15,fontWeight:700}}/>
            )}
          </div>
        </div>
      )}
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>COLORE</div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 14px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:coloreVis,
            border:`3px solid ${T.border}`,cursor:"pointer",flexShrink:0}}
            onClick={()=>setShowPal(s=>!s)}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text}}>
              {form.coloreCustom?"Personalizzato":`Auto — ${form.tempo==="h24"?"H24":getColorLabel(form.inizio)||"imposta orario"}`}
            </div>
          </div>
          {form.coloreCustom&&(
            <button onClick={()=>setForm(f=>({...f,coloreCustom:null}))}
              style={{background:"none",border:"none",color:T.sub,fontSize:11,cursor:"pointer"}}>↩ auto</button>
          )}
        </div>
        {showPal&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginTop:12}}>
            {PALETTE_M.map(p=>(
              <div key={p} onClick={()=>{setForm(f=>({...f,coloreCustom:p}));setShowPal(false);}}
                style={{width:32,height:32,borderRadius:"50%",background:p,cursor:"pointer",
                  outline:coloreVis===p?`3px solid #64748b`:"none",outlineOffset:2}}/>
            ))}
          </div>
        )}
      </div>
      
      <button onClick={onSave}
        style={{width:"100%",background:accent,border:"none",borderRadius:14,
          color:"#fff",padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
        💾 Salva modello
      </button>
    </div>
  );
}

const NB={background:"none",border:"none",fontSize:22,cursor:"pointer",
  padding:"0 4px",lineHeight:1,flexShrink:0,color:"rgba(255,255,255,0.8)"};

// ═══════════════════════════════════════════════════════════════

// #endregion

// #region SEZIONE 19: ROTAZIONE COMPONENTS
// ═══════════════════════════════════════════════════════════════
function RotazioneCard({r, T, accent, modelli, onOpen, onDelete}){
  const tipoLabel = r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL / RS classico":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":" Personalizzata";
  const modelloLav = modelli.find(m=>m.id===r.modellaLavoroId);
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onOpen}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
        {modelloLav&&<div style={{fontSize:11,color:T.sub,marginTop:1}}>Modello: {modelloLav.titolo}</div>}
      </div>
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questa rotazione?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:4}}>×</button>
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}

function RotazioneForm({T, form, setForm, accent, modelli, onSave}){
  return (
    <div style={{padding:"16px 14px 40px"}}>
      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>TIPO DI ROTAZIONE</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {[
          ["personalizzata"," Personalizzata"],
          ["domeniche","🗓 Domeniche 1/4"],
          ["nlrs","🔄 NL/RS classico"],
          ["nlrs_scalante","📅 RS/NL scalante"],
        ].map(([v,l])=>(
          <button key={v} onClick={()=>setForm(f=>({...f,tipo:v}))}
            style={{flex:"1 1 40%",padding:"10px 4px",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:11,
              background:form.tipo===v?accent:T.s2,
              color:form.tipo===v?"#fff":T.sub}}>{l}</button>
        ))}
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <input value={form.titolo} onChange={e=>setForm(f=>({...f,titolo:e.target.value}))}
          placeholder="TITOLO ROTAZIONE"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
          <span style={{flex:1,fontSize:15,color:T.text}}>Data inizio ciclo</span>
          <input type="date" value={form.dataInizio} onChange={e=>setForm(f=>({...f,dataInizio:e.target.value}))}
            style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:14,fontWeight:700}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",padding:"14px 16px"}}>
          <span style={{flex:1,fontSize:15,color:T.text}}>Numero di settimane</span>
          <input type="number" value={form.nSettimane} min={1} max={260}
            onChange={e=>setForm(f=>({...f,nSettimane:parseInt(e.target.value)||52}))}
            style={{width:70,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
              padding:"6px 8px",color:T.text,fontSize:14,fontWeight:700,outline:"none",textAlign:"center"}}/>
        </div>
      </div>
      {form.tipo==="domeniche"&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>MODELLI</div>
          <div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:10,
            padding:"10px 12px",marginBottom:10,fontSize:12,color:T.sub}}>
            🗓 Ciclo 4 domeniche: 1ª = LAVORO (festivo), 2ª 3ª 4ª = Riposo (colore libero sul calendario)
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ModelloSelector label="Domenica LAVORO (festivo)" value={form.modellaLavoroId}
              onChange={id=>setForm(f=>({...f,modellaLavoroId:id}))} modelli={modelli} T={T} required/>
            <ModelloSelector label="Domenica riposo (opzionale)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} last/>
          </div>
        </div>
      )}
      {form.tipo==="nlrs"&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>MODELLI</div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T}/>
            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))} modelli={modelli} T={T} last/>
          </div>
        </div>
      )}
      {form.tipo==="nlrs_scalante"&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>
            MODELLI RS / NL SCALANTE
          </div>
          <div style={{background:"#3b82f611",border:"1px solid #3b82f633",borderRadius:10,
            padding:"10px 12px",marginBottom:10,fontSize:12,color:T.sub}}>
            📅 Ciclo: RS venerdì → NL venerdì+7gg → 2 sett. pausa → RS giovedì → NL giovedì+7gg → 2 sett. pausa → RS mercoledì → ... (salta domenica)
          </div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))} modelli={modelli} T={T}/>
            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} last/>
          </div>
        </div>
      )}
      <button onClick={onSave}
        style={{width:"100%",background:accent,border:"none",borderRadius:14,
          color:"#fff",padding:"14px 0",cursor:"pointer",fontWeight:800,fontSize:15}}>
        💾 Salva rotazione
      </button>
    </div>
  );
}

function ModelloSelector({label, value, onChange, modelli, T, required=false, last=false}){
  const sel = modelli.find(m=>m.id===value);
  const [open, setOpen] = useState(false);
  const colore = sel?(sel.coloreCustom||getColorByTime(sel.inizio)):"#94a3b8";
  return (
    <div style={{borderBottom:last?"none":`1px solid ${T.border}`}}>
      <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}
        onClick={()=>setOpen(o=>!o)}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,color:T.sub,marginBottom:2}}>{label}</div>
          {sel?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:colore}}/>
              <span style={{fontSize:14,fontWeight:700,color:T.text}}>{sel.titolo}</span>
            </div>
          ):(
            <span style={{fontSize:13,color:T.sub,fontStyle:"italic"}}>{required?"Seleziona...":"Nessuno (opzionale)"}</span>
          )}
        </div>
        <span style={{color:T.sub,fontSize:12}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{background:T.s2,padding:"6px 0"}}>
          {!required&&(
            <div onClick={()=>{onChange(null);setOpen(false);}}
              style={{padding:"10px 16px",fontSize:13,color:T.sub,cursor:"pointer",
                background:!value?"rgba(0,0,0,0.05)":"transparent"}}>
              — Nessuno
            </div>
          )}
          {modelli.map(m=>{
            const c=m.coloreCustom||getColorByTime(m.inizio);
            return (
              <div key={m.id} onClick={()=>{onChange(m.id);setOpen(false);}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
                  cursor:"pointer",background:value===m.id?"rgba(0,0,0,0.05)":"transparent"}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:c,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>{m.titolo}</div>
                  <div style={{fontSize:11,color:T.sub}}>
                    {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.tempo==="6h15"?` - ${calcFine6h15(m.inizio)}`:m.fine?` - ${m.fine}`:""}`:m.tempo}
                  </div>
                </div>
                {value===m.id&&<span style={{color:"#3b82f6"}}>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GrigliaRotazione({rot, T, accent, modelli, onUpdate}){
  const [selModello, setSelModello] = useState(modelli[0]?.id||null);
  const griglia = rot.griglia||{};
  function getDays(){
    const days=[];
    const inizio=rot.dataInizio?new Date(rot.dataInizio):new Date(new Date().getFullYear(),0,1);
    const nDays=(rot.nSettimane||52)*7;
    for(let i=0;i<nDays;i++){
      const d=new Date(inizio); d.setDate(d.getDate()+i);
      const key=dkey(d.getFullYear(),d.getMonth(),d.getDate());
      days.push({key, date:d, dow:d.getDay()});
    }
    return days;
  }
  const days=getDays();
  const weeks=[];
  for(let i=0;i<days.length;i+=7) weeks.push(days.slice(i,i+7));
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{flex:1,overflowY:"auto",padding:"8px 8px 0"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:2}}>
          <div style={{gridColumn:"1",display:"flex",flexDirection:"column",gap:2,paddingTop:20}}>
            {weeks.map((_,wi)=>(
              <div key={wi} style={{height:32,display:"flex",alignItems:"center",
                fontSize:9,color:T.sub,fontWeight:700,justifyContent:"center"}}>{wi+1}</div>
            ))}
          </div>
          <div style={{gridColumn:"2/9",display:"flex",flexDirection:"column",gap:2}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
              {["L","M","M","G","V","S","D"].map((d,i)=>(
                <div key={i} style={{textAlign:"center",fontSize:9,fontWeight:800,
                  color:i===6?"#ef4444":T.sub,padding:"2px 0"}}>{d}</div>
              ))}
            </div>
            {weeks.map((week,wi)=>(
              <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                {week.map(day=>{
                  const m=modelli.find(m=>m.id===griglia[day.key]);
                  const c=m?(m.coloreCustom||getColorByTime(m.inizio)):null;
                  const isDOM=day.dow===0;
                  return (
                    <div key={day.key}
                      onClick={()=>{
                        const newG={...griglia};
                        if(newG[day.key]===selModello) delete newG[day.key];
                        else newG[day.key]=selModello;
                        onUpdate(newG);
                      }}
                      style={{height:32,borderRadius:6,cursor:"pointer",
                        background:c||(isDOM?(T.bg==="#f1f5f9"?"#fff5f5":"#2d0a0a"):T.s2),
                        border:`1px solid ${c?c+"88":T.border}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:9,fontWeight:700,color:c?"#fff":T.sub}}>
                      {m?m.titolo.slice(0,3):day.date.getDate()}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{borderTop:`1px solid ${T.border}`,background:T.surface,
        padding:"8px 8px",overflowX:"auto",display:"flex",gap:8,flexShrink:0}}>
        {modelli.map(m=>{
          const c=m.coloreCustom||getColorByTime(m.inizio);
          return (
            <button key={m.id} onClick={()=>setSelModello(m.id)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                background:selModello===m.id?c+"22":"transparent",
                border:`2px solid ${selModello===m.id?c:T.border}`,
                borderRadius:10,padding:"6px 10px",cursor:"pointer",flexShrink:0,minWidth:60}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:c}}/>
              <span style={{fontSize:9,fontWeight:700,color:selModello===m.id?c:T.sub,
                textAlign:"center",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {m.titolo}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NLRSScalanteView({rot, T, accent, modelli}){
  const modRS=modelli.find(m=>m.id===rot.modelloRSId);
  const modNL=modelli.find(m=>m.id===rot.modelloNLId);

  // Giorni della settimana disponibili (no domenica=0), scalanti da venerdì
  // 5=venerdì, 4=giovedì, 3=mercoledì, 2=martedì, 1=lunedì, 6=sabato (poi ricomincia)
  const GIORNI_CICLO = [5, 4, 3, 2, 1, 6]; // venerdì→giovedì→mercoledì→martedì→lunedì→sabato

  function getCoppie(){
    if(!rot.dataInizio) return [];
    // La data inizio è il primo RS
    const primoRS = new Date(rot.dataInizio);
    const coppie = [];
    let giornoCicloIdx = 0;
    let dataCorrRS = new Date(primoRS);

    const maxSettimane = rot.nSettimane || 52;
    const dataFine = new Date(primoRS);
    dataFine.setDate(dataFine.getDate() + maxSettimane * 7);

    while(dataCorrRS < dataFine){
      const dataRS = new Date(dataCorrRS);
      const dataNL = new Date(dataCorrRS);
      dataNL.setDate(dataNL.getDate() + 7);

      coppie.push({
        rs: { date: dataRS, key: dkey(dataRS.getFullYear(), dataRS.getMonth(), dataRS.getDate()) },
        nl: { date: dataNL, key: dkey(dataNL.getFullYear(), dataNL.getMonth(), dataNL.getDate()) },
        giorno: GIORNI_CICLO[giornoCicloIdx],
        cicloN: giornoCicloIdx + 1,
      });

      // Avanza: 2 settimane di pausa + scalo al giorno precedente
      giornoCicloIdx = (giornoCicloIdx + 1) % GIORNI_CICLO.length;
      const prossimoDow = GIORNI_CICLO[giornoCicloIdx];

      // Calcola prossimo RS: 3 settimane dopo il corrente RS (2 pausa + 1 per arrivare al nuovo giorno)
      const base = new Date(dataCorrRS);
      base.setDate(base.getDate() + 21); // +3 settimane
      // Trova il prossimoDow più vicino da base
      let tentativo = new Date(base);
      let iter = 0;
      while(tentativo.getDay() !== prossimoDow && iter < 14){
        tentativo.setDate(tentativo.getDate() - 1);
        iter++;
      }
      dataCorrRS = tentativo;
    }
    return coppie;
  }

  const coppie = getCoppie();
  const NOMI_GG = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];

  return (
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {!rot.dataInizio&&(
        <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
          Imposta la data del primo RS nella configurazione rotazione
        </div>
      )}
      {coppie.length>0&&(
        <div style={{marginBottom:10,background:T.surface,borderRadius:10,padding:"10px 14px",
          display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#8b5cf6"}}>RS</span> — {modRS?.titolo||"Non assegnato"}
          </div>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#3b82f6"}}>NL</span> — {modNL?.titolo||"Non assegnato"}
          </div>
          <div style={{fontSize:11,color:T.sub,width:"100%"}}>
            Ciclo scalante: Ven → Gio → Mer → Mar → Lun → Sab → ...
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {coppie.map((cp,i)=>{
          const cRS="#8b5cf6", cNL="#3b82f6";
          const nomeGg=NOMI_GG[cp.giorno]||"";
          return (
            <div key={i} style={{background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:12,overflow:"hidden"}}>
              <div style={{background:`linear-gradient(135deg,${cRS}22,${cNL}22)`,
                padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",
                borderBottom:`1px solid ${T.border}`}}>
                <span style={{fontSize:11,fontWeight:800,color:T.sub}}>Ciclo {i+1} — {nomeGg}</span>
              </div>
              <div style={{display:"flex",gap:0}}>
                <div style={{flex:1,padding:"10px 12px",borderRight:`1px solid ${T.border}`}}>
                  <div style={{fontSize:10,fontWeight:800,color:cRS,marginBottom:3}}>RS</div>
                  <div style={{fontSize:12,fontWeight:700,color:T.text}}>
                    {cp.rs.date.toLocaleDateString("it-IT",{weekday:"short",day:"numeric",month:"short"})}
                  </div>
                  <div style={{fontSize:11,color:T.sub,marginTop:2}}>{modRS?.titolo||"—"}</div>
                </div>
                <div style={{flex:1,padding:"10px 12px"}}>
                  <div style={{fontSize:10,fontWeight:800,color:cNL,marginBottom:3}}>NL (+7gg)</div>
                  <div style={{fontSize:12,fontWeight:700,color:T.text}}>
                    {cp.nl.date.toLocaleDateString("it-IT",{weekday:"short",day:"numeric",month:"short"})}
                  </div>
                  <div style={{fontSize:11,color:T.sub,marginTop:2}}>{modNL?.titolo||"—"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DomenicheView({rot, T, accent, modelli, onUpdate}){
  const griglia=rot.griglia||{};
  const modLav=modelli.find(m=>m.id===rot.modellaLavoroId);
  const modFesta=modelli.find(m=>m.id===rot.modelloNLId);
  function getDomeniche(){
    if(!rot.dataInizio) return [];
    const inizio=new Date(rot.dataInizio);
    let d=new Date(inizio);
    // Trova la prima domenica dalla data inizio
    while(d.getDay()!==0) d.setDate(d.getDate()+1);
    const domeniche=[];
    for(let i=0;i<(rot.nSettimane||52);i++){
      const k=dkey(d.getFullYear(),d.getMonth(),d.getDate());
      domeniche.push({key:k,date:new Date(d),idx:i});
      d.setDate(d.getDate()+7);
    }
    return domeniche;
  }
  const domeniche=getDomeniche();
  return (
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {!rot.dataInizio&&(
        <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
          Imposta la data della prima domenica nella configurazione rotazione
        </div>
      )}
      {domeniche.length>0&&(
        <div style={{marginBottom:10,background:T.surface,borderRadius:10,padding:"10px 14px",fontSize:12,color:T.sub}}>
          <span style={{fontWeight:700,color:"#22c55e"}}>🔵 FESTIVO</span> = domenica di lavoro (1 su 4)&nbsp;&nbsp;
          <span style={{fontWeight:700,color:"#64748b"}}>⚪ Riposo</span> = le altre 3 (colore libero)
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {domeniche.map((dom,i)=>{
          // 1 su 4: indice 0 = lavoro (festivo), 1,2,3 = riposo
          const isLavoro=(i%4)===0;
          const autoM=isLavoro?modLav:modFesta;
          const ovrM=modelli.find(m=>m.id===griglia[dom.key]);
          const effM=ovrM||autoM;
          const c=effM?(effM.coloreCustom||getColorByTime(effM.inizio)):(isLavoro?"#22c55e":"#94a3b8");
          return (
            <div key={dom.key} style={{background:T.surface,
              border:`2px solid ${isLavoro?"#22c55e44":"#94a3b822"}`,
              borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:c,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,fontWeight:800,
                    color:isLavoro?"#22c55e":"#64748b"}}>
                    {isLavoro?"🔵 FESTIVO (lavoro)":"⚪ Riposo"}
                  </span>
                  <span style={{fontSize:10,color:T.sub}}>({i%4===0?"1":"" + (i%4===1?"2":"") + (i%4===2?"3":"") + (i%4===3?"4":"")}ª/{4})</span>
                </div>
                <div style={{fontSize:12,color:T.sub,marginTop:1}}>
                  {dom.date.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                </div>
                {effM&&<div style={{fontSize:11,fontWeight:700,color:c,marginTop:2}}>{effM.titolo}</div>}
              </div>
              {ovrM&&(
                <button onClick={()=>{const g={...griglia};delete g[dom.key];onUpdate(g);}}
                  style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14}}>↩</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NLRSView({rot, T, accent, modelli}){
  const modNL=modelli.find(m=>m.id===rot.modelloNLId);
  const modRS=modelli.find(m=>m.id===rot.modelloRSId);
  function getCiclo(){
    if(!rot.dataInizio) return [];
    const inizio=new Date(rot.dataInizio);
    const ciclo=[];
    let giornoCiclo=inizio.getDay()===0?6:inizio.getDay()-1;
    let settCiclo=0;
    for(let s=0;s<(rot.nSettimane||52);s++){
      const posNelCiclo=settCiclo%4;
      const d=new Date(inizio);
      d.setDate(d.getDate()+s*7);
      const lunedi=new Date(d);
      while(lunedi.getDay()!==1) lunedi.setDate(lunedi.getDate()-1);
      const target=new Date(lunedi);
      target.setDate(target.getDate()+giornoCiclo);
      const k=dkey(target.getFullYear(),target.getMonth(),target.getDate());
      if(posNelCiclo===0) ciclo.push({key:k,date:target,tipo:"NL",sett:s+1});
      else if(posNelCiclo===1) ciclo.push({key:k,date:target,tipo:"RS",sett:s+1});
      settCiclo++;
      if(settCiclo%4===0) giornoCiclo=((giornoCiclo-1)+7)%7;
    }
    return ciclo;
  }
  const ciclo=getCiclo();
  return (
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      {!rot.dataInizio&&(
        <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
          Imposta la data del primo NL nella configurazione rotazione
        </div>
      )}
      {ciclo.length>0&&(
        <div style={{marginBottom:10,background:T.surface,borderRadius:10,padding:"10px 14px",
          display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#3b82f6"}}>NL</span> — {modNL?.titolo||"Non assegnato"}
          </div>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#8b5cf6"}}>RS</span> — {modRS?.titolo||"Non assegnato"}
          </div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {ciclo.map(ev=>{
          const isNL=ev.tipo==="NL";
          const m=isNL?modNL:modRS;
          const c=isNL?"#3b82f6":"#8b5cf6";
          return (
            <div key={ev.key} style={{background:T.surface,border:`2px solid ${c}22`,
              borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:8,background:c+"22",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:900,color:c}}>{ev.tipo}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:T.sub}}>Sett. {ev.sett} · {ev.date.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"short"})}</div>
                <div style={{fontSize:13,fontWeight:700,color:T.text}}>{m?.titolo||"Nessun modello"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// #endregion