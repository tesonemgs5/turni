import { useState, useEffect, useRef } from "react";
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

// ── COLORI AUTOMATICI PER FASCIA ORARIA ─────────────────────
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

// Fasce orarie per indennità
function getShiftBand(tIn){
  if(!tIn) return "diurno";
  const [h]=tIn.split(":").map(Number);
  if(h>=6 && h<22) return "diurno";
  return "notturno";
}
function isFestivo(dateKey){
  const d=new Date(dateKey);
  const dow=d.getDay(); // 0=dom, 6=sab
  return dow===0;
}

const DEFAULT_REPORT_TYPES = [
  { id:"conteggio_turni", label:"Conteggio turni", active:true },
  { id:"indennita", label:"Indennità di servizio", active:true },
  { id:"ore_turno", label:"Ore per turno", active:false },
  { id:"straordinari", label:"Straordinari", active:false },
  { id:"guadagni", label:"Guadagni", active:false },
];

const INIT = { calendars:[], events:{}, theme:"auto", extraHols:[], reports: DEFAULT_REPORT_TYPES, reportSettings:{} };

export default function App({ session }){
  const today = new Date();
  const [store, setStore] = useState(INIT);
  const [loading, setLoading] = useState(true);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calId, setCalId] = useState(null);
  // screen: "cal" | "report" | "modelli" | "settings"
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
  const [syncing,  setSyncing]  = useState(false);
  const [nhD,     setNhD]     = useState("");
  const [nhM,     setNhM]     = useState("");
  const [bgSyncing, setBgSyncing] = useState(false);
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [sheetsSecret, setSheetsSecret] = useState("");
  const [stats, setStats] = useState(null);
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbRawData, setDbRawData] = useState(null);
  const [dbCalsCount, setDbCalsCount] = useState(0);
  const [dbEvtsCount, setDbEvtsCount] = useState(0);

  // Modelli states
  const [modelliTab, setModelliTab] = useState("turni");
  const [modelli, setModelli] = useState([]);
  const [modelliSort, setModelliSort] = useState("orario");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);
  const [editModello, setEditModello] = useState(null);
  const [modelForm, setModelForm] = useState({ titolo:"", tempo:"personalizzato", inizio:"", fine:"", coloreCustom:null, posizione:"" });

  // Rotazioni states
  const [rotazioni, setRotazioni] = useState([]);
  const [showRotForm, setShowRotForm] = useState(false);
  const [editRotazione, setEditRotazione] = useState(null);
  const [rotForm, setRotForm] = useState({ tipo:"personalizzata", titolo:"", dataInizio:"", nSettimane:52, modellaLavoroId:null, modelloNLId:null, modelloRSId:null });
  const [showRotDetail, setShowRotDetail] = useState(null); // id rotazione griglia aperta
  const [showModelloPicker, setShowModelloPicker] = useState(false);

  // Report states
  const [reportInterval, setReportInterval] = useState("mese"); // "mese"|"anno"|"custom"
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [openReportConfig, setOpenReportConfig] = useState(null); // id del report aperto
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  // Impostazioni indennità (€ per fascia)
  const [indennita, setIndennita] = useState({
    diurno: "", notturno: "", festivo: "", notturno_festivo: ""
  });
  // Config conteggio turni
  const [conteggioConfig, setConteggioConfig] = useState({
    titolo: "Conteggio turni",
    turniSelezionati: "tutti", // "tutti" | array di ids
    mezziTurni: 0,
    giorni: { festivi:true, lun:true, mar:true, mer:true, gio:true, ven:true, sab:true, dom:true }
  });

  const userId = session?.user?.id;

  useEffect(()=>{
    if(!userId) return;
    (async()=>{
      try {
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
            auto: e.auto||"",
          });
        });

        const theme = settings?.theme||"auto";
        const extraHols = settings?.extra_hols||[];
        const sUrl = settings?.sheets_url || "";
        const sSec = settings?.sheets_secret || "";
        const savedReports = settings?.reports || DEFAULT_REPORT_TYPES;
        const savedReportSettings = settings?.report_settings || {};
        const savedIndennita = settings?.indennita || { diurno:"", notturno:"", festivo:"", notturno_festivo:"" };
        const savedConteggioConfig = settings?.conteggio_config || conteggioConfig;

        // Carica modelli
        const { data: modelliDb } = await supabase.from("modelli").select("*").eq("user_id", userId).order("sort_order");
        setModelli((modelliDb||[]).map(m=>({
          id:m.id, titolo:m.titolo, tempo:m.tempo,
          inizio:m.inizio||"", fine:m.fine||"",
          colore:m.colore, coloreCustom:m.colore_custom||null,
          posizione:m.posizione||"", sortOrder:m.sort_order||0,
        })));

        // Carica rotazioni
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
        setConteggioConfig(savedConteggioConfig);

        try {
          const { data: curStats } = await supabase.from("usage_stats").select("login_count").eq("user_id", userId).maybeSingle();
          const newCount = (curStats?.login_count || 0) + 1;
          await supabase.from("usage_stats").upsert({ user_id: userId, last_active: new Date().toISOString(), login_count: newCount });
        } catch(statErr) { console.warn("Stats error:", statErr); }

        setStore({ calendars, events, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings });
        setCalId(calendars[0]?.id||null);

        if (sUrl) {
          setTimeout(() => { saveToSheets(events, calendars, sUrl, sSec); }, 500);
        }
      } catch(e){ console.log("Errore startup:", e); }
      setLoading(false);
    })();
  },[userId]);

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
  async function updateCalendar(calId, fields){
    if(!userId) return;
    await supabase.from("calendars").update(fields).eq("id", calId).eq("user_id", userId);
  }
  async function deleteCalendar(calId){
    if(!userId) return;
    await supabase.from("calendars").delete().eq("id", calId).eq("user_id", userId);
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

    // Calcola protrazione se orario modificato rispetto al modello
    let extraNote = form.note||"";
    if(form.modelloId && tInFinal && tOutFinal && form.modelloId){
      const mod=modelli.find(m=>m.id===form.modelloId);
      if(mod&&mod.fine&&mod.inizio){
        const durPrevista=calcMinuti(mod.inizio,mod.fine);
        const durEffettiva=calcMinuti(tInFinal,tOutFinal);
        const diff=durEffettiva-durPrevista;
        if(diff>0) extraNote=(extraNote?extraNote+" | ":"")+`Protrazione: +${Math.floor(diff/60)}h${diff%60>0?diff%60+"m":""}`;
        if(diff<0) extraNote=(extraNote?extraNote+" | ":"")+`Anticipo: ${Math.floor(Math.abs(diff)/60)}h${Math.abs(diff)%60>0?Math.abs(diff)%60+"m":""}`;
      }
    }

    // Calcola straordinario/monte ore per turni fixed
    if(form.dur==="fixed" && tInFinal && form.tOut){
      const std=calcFine6h15(tInFinal);
      const [h1,m1]=std.split(":").map(Number);
      const [h2,m2]=form.tOut.split(":").map(Number);
      const diff=(h2*60+m2)-(h1*60+m1);
      if(diff>0) extraNote=(extraNote?extraNote+" | ":"")+`Straordinario: +${Math.floor(diff/60)}h${diff%60>0?diff%60+"m":""}`;
      if(diff<0) extraNote=(extraNote?extraNote+" | ":"")+`Monte ore: ${Math.floor(Math.abs(diff)/60)}h${Math.abs(diff)%60>0?Math.abs(diff)%60+"m":""}`;
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
    }).select().maybeSingle();
    if(error){ console.log(error); return; }
    const evt = {
      id: data.id, color, label, allDay: data.all_day,
      tIn: data.time_in||"", tOut: data.time_out||"",
      place: data.place||"", map: data.map_url||"",
      note: data.note||"", modelloId: data.modello_id||null,
      collega: data.collega||null, auto: data.auto||"",
    };
    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      if(!ns.events[dayKey]) ns.events[dayKey]={};
      if(!ns.events[dayKey][calId]) ns.events[dayKey][calId]=[];
      ns.events[dayKey][calId].push(evt);
      saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    if(form.dur==="fixed" && tInFinal && tOutFinal){
      await syncProtrazione(dayKey, calId, form, tInFinal, tOutFinal, data.id);
    }
    setForm(null); setDayKey(null);
  }

  async function syncProtrazione(dayKey, calId, form, tInFinal, tOutFinal, parentId){
    const cal = store.calendars.find(c=>c.id===calId);
    const std = calcFine6h15(tInFinal);
    let diff = 0;
    if(std && tOutFinal){
      const [h1,m1]=std.split(":").map(Number);
      const [h2,m2]=tOutFinal.split(":").map(Number);
      diff=(h2*60+m2)-(h1*60+m1);
    }

    const existingList = store.events[dayKey]?.[calId]||[];
    const existingProt = existingList.find(e=>e.parentId===parentId && e.label?.startsWith("PROTRAZIONE"));

    if(diff<=0){
      if(existingProt){
        await supabase.from("events").delete().eq("id", existingProt.id).eq("user_id", userId);
        setStore(prev=>{
          const ns=JSON.parse(JSON.stringify(prev));
          if(ns.events?.[dayKey]?.[calId])
            ns.events[dayKey][calId]=ns.events[dayKey][calId].filter(e=>e.id!==existingProt.id);
          return ns;
        });
      }
      return;
    }

    const tipo = form.straordinarioTipo||"pagamento";
    const label = tipo==="pagamento"?"PROTRAZIONE A PAGAMENTO":"PROTRAZIONE A RECUPERO";
    const color = tipo==="pagamento"?"#8b5cf6":"#64748b";

    const payload = {
      label, color, all_day:false,
      time_in: std, time_out: tOutFinal,
      place:"", map_url:"", note:"",
      modello_id:null, collega:"", auto:"",
      parent_id: parentId,
    };

    if(existingProt){
      await supabase.from("events").update(payload).eq("id", existingProt.id).eq("user_id", userId);
      setStore(prev=>{
        const ns=JSON.parse(JSON.stringify(prev));
        const list=ns.events[dayKey]?.[calId];
        if(list){
          const idx=list.findIndex(e=>e.id===existingProt.id);
          if(idx>-1) list[idx]={...list[idx], label, color, tIn:std, tOut:tOutFinal};
        }
        return ns;
      });
    } else {
      const {data:res}=await supabase.from("events").insert({
        user_id:userId, calendar_id:calId, date_key:dayKey, ...payload,
      }).select().maybeSingle();
      if(res){
        const evt={id:res.id, color, label, allDay:false, tIn:std, tOut:tOutFinal,
          place:"", map:"", note:"", modelloId:null, collega:"", auto:"", parentId:parentId};
        setStore(prev=>{
          const ns=JSON.parse(JSON.stringify(prev));
          if(!ns.events[dayKey]) ns.events[dayKey]={};
          if(!ns.events[dayKey][calId]) ns.events[dayKey][calId]=[];
          ns.events[dayKey][calId].push(evt);
          return ns;
        });
      }
    }
  }

  function calcMinuti(tIn, tOut){
    if(!tIn||!tOut) return 0;
    const [h1,m1]=tIn.split(":").map(Number);
    const [h2,m2]=tOut.split(":").map(Number);
    let mins=(h2*60+m2)-(h1*60+m1);
    if(mins<0) mins+=24*60;
    return mins;
  }

  async function delEvt(key,cid,eid){
    if(!userId) return;
    await supabase.from("events").delete().eq("id", eid).eq("user_id", userId);
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      if(ns.events?.[key]?.[cid])
        ns.events[key][cid]=ns.events[key][cid].filter(e=>e.id!==eid);
      saveToSheets(ns.events, ns.calendars);
      return ns;
    });
  }

  async function updateEvt(){
    if(!form||!dayKey||!calId||!userId||!form.editId) return;

    let color = form.colorOvr || (activeCal?.color||"#3b82f6");
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
      const cal = store.calendars.find(c=>c.id===calId);
      const sh = cal?.shifts?.find(s=>s.id===form.shiftId);
      if(sh){ color=form.colorOvr||sh.color; label=sh.label.toUpperCase(); }
    }

    if(form.dur==="fixed" && tInFinal && !form.modelloId){
      tOutFinal = form.tOut||calcFine6h15(tInFinal);
    }

    const updateData = {
      label, color, all_day: form.dur==="allday"&&!form.modelloId,
      time_in: tInFinal, time_out: tOutFinal,
      place: (form.place||"").toUpperCase(),
      map_url: form.map||"",
      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
    };

    const { error } = await supabase.from("events").update(updateData)
      .eq("id", form.editId).eq("user_id", userId);
    if(error){ console.log(error); return; }

    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      const list = ns.events[dayKey]?.[calId];
      if(list){
        const idx = list.findIndex(e=>e.id===form.editId);
        if(idx>-1){
          list[idx] = {
            ...list[idx],
            label: updateData.label, color: updateData.color, allDay: updateData.all_day,
            tIn: updateData.time_in, tOut: updateData.time_out,
            place: updateData.place, map: updateData.map_url, note: updateData.note,
            modelloId: updateData.modello_id, collega: updateData.collega, auto: updateData.auto,
          };
        }
      }
      saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }

  async function saveToSheets(events, calendars, customUrl = sheetsUrl, customSecret = sheetsSecret) {
    if (!customUrl) return "⚠️ Sheets non configurato";
    try {
      await fetch(customUrl, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ secret: customSecret, action: "save", events, calendars, userId }),
      });
      return "✅ Esportato su Sheets";
    } catch(e) { return "❌ Errore connessione Sheets"; }
  }

  async function loadFromSheets(customUrl = sheetsUrl, customSecret = sheetsSecret) {
    if (!customUrl) return null;
    try {
      const res = await fetch(`${customUrl}?secret=${customSecret}&action=load&userId=${userId}`);
      return await res.json() || null;
    } catch(e) { return null; }
  }

  async function syncFromSheets(cals = store.calendars, evts = store.events, customUrl = sheetsUrl, customSecret = sheetsSecret, isBackground = false) {
    if (!customUrl) return "⚠️ Sincronizzazione non configurata";
    if (isBackground) setBgSyncing(true); else setSyncing(true);
    try {
      const data = await loadFromSheets(customUrl, customSecret);
      if (!data || !data.data) return "❌ Nessun dato valido da Sheets";

      // Cancella tutti gli eventi esistenti su Supabase
      await supabase.from("events").delete().eq("user_id", userId);

      const existingNames = cals.map(c => c.name);
      const newCals = [...cals];
      for (const tabName of (data.tabs || Object.keys(data.data))) {
        if (!existingNames.includes(tabName)) {
          const dbCal = await addCalendar(tabName, PALETTE[newCals.length % PALETTE.length], newCals.length === 0);
          if (dbCal) newCals.push({ id: dbCal.id, name: dbCal.name, color: dbCal.color, isMain: dbCal.is_main, shifts: [] });
        }
      }

      const newEvents = {};
      for (const cal of newCals) {
        const calData = data.data[cal.name] || {};
        for (const [dateKey, sheetEvts] of Object.entries(calData)) {
          if (!newEvents[dateKey]) newEvents[dateKey] = {};
          if (!newEvents[dateKey][cal.id]) newEvents[dateKey][cal.id] = [];
          for (const e of sheetEvts) {
            const { data: dbEvt } = await supabase.from("events").insert({
              user_id: userId, calendar_id: cal.id, date_key: dateKey,
              label: e.label || "Evento", color: e.color || cal.color,
              all_day: e.allDay ?? true, time_in: e.tIn || "", time_out: e.tOut || "",
              place: e.place || "", map_url: e.map || "", note: e.note || "",
              modello_id: e.modelloId || null, collega: e.collega || "", auto: e.auto || "",
            }).select().maybeSingle();
            if (dbEvt) {
              newEvents[dateKey][cal.id].push({
                id: dbEvt.id, color: dbEvt.color, label: dbEvt.label,
                allDay: dbEvt.all_day, tIn: dbEvt.time_in || "", tOut: dbEvt.time_out || "",
                place: dbEvt.place || "", map: dbEvt.map_url || "", note: dbEvt.note || "",
                modelloId: dbEvt.modello_id || null, collega: dbEvt.collega || "", auto: dbEvt.auto || "",
              });
            }
          }
        }
      }
      setStore(s => ({ ...s, calendars: newCals, events: newEvents }));
      if (newCals.length > 0 && !calId) setCalId(newCals[0].id);
      return "✅ Importazione completata (Supabase sincronizzato)";
    } catch (e) {
      console.error(e);
      return "❌ Errore sincronizzazione Sheets";
    } finally {
      if (isBackground) setBgSyncing(false); else setSyncing(false);
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
  async function handleSaveSheetsConfig() {
    if(!userId) return;
    setSyncing(true); setSyncMsg("");
    try {
      const { error } = await supabase.from("user_settings").upsert({
        user_id: userId, sheets_url: sheetsUrl.trim(), sheets_secret: sheetsSecret.trim(),
        updated_at: new Date().toISOString(),
      });
      if(error) throw error;
      setSyncMsg("✅ Impostazioni Google Sheets salvate");
    } catch(err) {
      setSyncMsg("❌ Errore salvataggio: " + err.message);
    } finally { setSyncing(false); }
  }

  useEffect(() => {
    if (screen === "settings" && session?.user?.email === 'tesonemgs5@gmail.com') {
      (async () => {
        try {
          const { data, error } = await supabase.rpc('get_app_stats');
          if (!error && data && data.length > 0) setStats(data[0]);
        } catch(e) { console.error(e); }
      })();
    }
  }, [screen, session]);

  async function handleViewDbData() {
    setShowDbModal(true); setDbRawData(null);
    try {
      const { data: cals } = await supabase.from("calendars").select("*").eq("user_id", userId).order("created_at");
      const { data: evts } = await supabase.from("events").select("*").eq("user_id", userId).order("date_key", { ascending: false });
      setDbCalsCount(cals?.length || 0);
      setDbEvtsCount(evts?.length || 0);
      setDbRawData({ calendars: cals || [], events: evts || [] });
    } catch (e) { console.error(e); }
  }

  async function handleLogout(){ await supabase.auth.signOut(); }

  // ── MODELLI CRUD ─────────────────────────────────────────────
  function sortedModelli(){
    const withTime=modelli.filter(m=>m.tempo!=="h24"&&m.inizio);
    const noTime=modelli.filter(m=>m.tempo==="h24"||!m.inizio);
    if(modelliSort==="orario"){
      withTime.sort((a,b)=>a.inizio.localeCompare(b.inizio));
      return [...withTime,...noTime];
    }
    return [...modelli].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
  }

  async function saveModello(data){
    if(!userId) return;
    const coloreEff=data.coloreCustom||(data.tempo==="h24"?"#64748b":getColorByTime(data.inizio));
    const payload={
      user_id:userId,
      titolo:(data.titolo||"").toUpperCase(),
      tempo:data.tempo,
      inizio:data.inizio||null, fine:data.fine||null,
      colore:coloreEff, colore_custom:data.coloreCustom||null,
      posizione:(data.posizione||"").toUpperCase()||null,
      sort_order:data.sortOrder||modelli.length,
    };
    if(data.id){
      await supabase.from("modelli").update(payload).eq("id",data.id).eq("user_id",userId);
      setModelli(prev=>prev.map(m=>m.id===data.id?{...m,...data,colore:coloreEff}:m));
    } else {
      const {data:res}=await supabase.from("modelli").insert(payload).select().maybeSingle();
      if(res) setModelli(prev=>[...prev,{...data,id:res.id,colore:coloreEff}]);
    }
  }

  async function deleteModello(id){
    await supabase.from("modelli").delete().eq("id",id).eq("user_id",userId);
    setModelli(prev=>prev.filter(m=>m.id!==id));
  }

  // ── ROTAZIONI CRUD ───────────────────────────────────────────
  async function saveRotazione(data){
    if(!userId) return;
    const payload={
      user_id:userId, tipo:data.tipo,
      titolo:(data.titolo||"").toUpperCase(),
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

  // ── REPORT HELPERS ──────────────────────────────────────────
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
    return {from: reportDateFrom, to: reportDateTo, label: reportDateFrom+" → "+reportDateTo};
  }

  function computeConteggio(){
    const {from, to} = getReportRange();
    const result = { totale:0, mattina:0, pomeriggio:0, notte:0, terzo:0, h24:0, pianifInc:0, protrazioneRec:0, protrazionePag:0 };
    const perModello = {};
    for(const [dateKey, calMap] of Object.entries(store.events)){
      if(dateKey < from || dateKey > to) continue;
      for(const [, evts] of Object.entries(calMap)){
        for(const e of evts){
          result.totale++;
          if(e.modelloId){
            perModello[e.modelloId]=(perModello[e.modelloId]||0)+1;
          }
          if(e.allDay){ result.h24++; continue; }
          if(!e.tIn) continue;
          const [h,m]=e.tIn.split(":").map(Number);
          const mins=h*60+m;
          if(mins>=360&&mins<705) result.mattina++;
          else if(mins>=705&&mins<1035) result.pomeriggio++;
          else if(mins>=1035&&mins<1080) result.terzo++;
          else result.notte++;
          if(e.note&&e.note.includes("Protrazione:")) result.protrazioneRec++;
          if(e.note&&e.note.includes("Pagamento:")) result.protrazionePag++;
        }
      }
    }
    return {...result, perModello};
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

  // ── CALENDAR GRID ───────────────────────────────────────────
  const totalDays = daysInMonth(year,month);
  const fd = firstDay(year,month);
  const cells = [...Array(fd).fill(null), ...Array.from({length:totalDays},(_,i)=>i+1)];

  if(loading) return (
    <div style={{background:dark?"#090e1a":"#f1f5f9",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#64748b",fontSize:13}}>⏳ Caricamento...</div>
    </div>
  );

  // ── VIEWS ────────────────────────────────────────────────────

  const calView = (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{background:accent,display:"flex",alignItems:"center",
        gap:5,padding:"6px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0}}>
        <button onClick={()=>month===0?(setYear(y=>y-1),setMonth(11)):setMonth(m=>m-1)} style={NB}>‹</button>
        <span style={{color:"#fff",fontSize:13,fontWeight:900,flexShrink:0,fontFamily:"Georgia,serif"}}>
          {MONTHS[month].slice(0,3).toUpperCase()} {year} {bgSyncing&&" 🔄"}
        </span>
        <button onClick={()=>month===11?(setYear(y=>y+1),setMonth(0)):setMonth(m=>m+1)} style={NB}>›</button>
        <div style={{width:1,height:14,background:"rgba(255,255,255,0.3)",flexShrink:0,marginLeft:2}}/>
        {store.calendars.length===0
          ? <span style={{color:"rgba(255,255,255,0.6)",fontSize:10,fontStyle:"italic"}}>→ Impostazioni</span>
          : store.calendars.map(c=>(
            <button key={c.id} onClick={()=>setCalId(c.id)}
              style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,cursor:"pointer",
                background:calId===c.id?"rgba(255,255,255,0.28)":"rgba(255,255,255,0.1)",
                border:`1.5px solid ${calId===c.id?"rgba(255,255,255,0.85)":"transparent"}`,
                borderRadius:20,padding:"2px 8px 2px 5px"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:c.color,border:"1px solid rgba(255,255,255,0.5)"}}/>
              <span style={{color:"#fff",fontSize:10,fontWeight:700}}>{c.name}</span>
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
                {evts.slice(0,4).map((e,ei)=>(
                  <div key={e.id+ei} style={{background:e.color,borderRadius:3,padding:"2px 4px",
                    fontSize:9,fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",
                    whiteSpace:"nowrap",flex:1,display:"flex",alignItems:"center",flexShrink:1,
                    textShadow:"0 1px 2px rgba(0,0,0,0.35)"}}>
                    {e.label}
                  </div>
                ))}
                {evts.length>4&&<div style={{fontSize:8,color:T.sub,padding:"0 2px",flexShrink:0}}>+{evts.length-4}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── REPORT VIEW ──────────────────────────────────────────────
  const range = getReportRange();
  const conteggio = computeConteggio();
  const indennitaCalc = computeIndennita();

  const activeReports = (store.reports||[]).filter(r=>r.active);
  const inactiveReports = (store.reports||[]).filter(r=>!r.active);

  function toggleReport(id){
    const newRep = store.reports.map(r=>r.id===id?{...r,active:!r.active}:r);
    setStore(s=>({...s,reports:newRep}));
    saveSettings({ reports: newRep });
  }

  function renderReportCard(r){
    const isOpen = openReportConfig===r.id;
    return (
      <div key={r.id}>
        <div style={{display:"flex",alignItems:"center",padding:"12px 14px",
          borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}
          onClick={()=>setOpenReportConfig(isOpen?null:r.id)}>
          <button onClick={e=>{e.stopPropagation();toggleReport(r.id);}}
            style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
              background:"#ef4444",color:"#fff",fontSize:16,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
            –
          </button>
          <span style={{flex:1,fontSize:14,fontWeight:700,color:T.text}}>{r.id==="conteggio_turni"?conteggioConfig.titolo:r.label}</span>
          <span style={{color:T.sub,fontSize:12}}>›</span>
        </div>
        {isOpen && (
          <div style={{background:T.s2,padding:14,borderBottom:`1px solid ${T.border}`}}>
            {r.id==="conteggio_turni" && <ConteggioConfig T={T} cfg={conteggioConfig} setCfg={setConteggioConfig} data={conteggio} calendars={store.calendars} modelli={modelli}/>}
            {r.id==="indennita" && <IndennitaConfig T={T} values={indennita} setValues={setIndennita} calc={indennitaCalc} onSave={()=>saveSettings({indennita})}/>}
            {r.id==="ore_turno" && <OrePerTurnoView T={T} data={conteggio}/>}
            {r.id==="straordinari" && <StraordinariView T={T} data={conteggio}/>}
            {r.id==="guadagni" && <GuadagniView T={T} indennita={indennita} calc={indennitaCalc}/>}
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

      {inactiveReports.length>0 && (
        <div style={{margin:"16px 12px 0"}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6,paddingLeft:4}}>Altri report</div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            {inactiveReports.map(r=>(
              <div key={r.id} style={{display:"flex",alignItems:"center",padding:"12px 14px",
                borderBottom:`1px solid ${T.border}`}}>
                <button onClick={()=>toggleReport(r.id)}
                  style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
                    background:"#22c55e",color:"#fff",fontSize:18,fontWeight:700,
                    display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
                  +
                </button>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>{r.label}</div>
                  {r.id==="ore_turno"&&<div style={{fontSize:11,color:T.sub}}>es. Ore totali per turno</div>}
                  {r.id==="conteggio_turni"&&<div style={{fontSize:11,color:T.sub}}>es. Giorni di ferie</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            {reportInterval==="custom" && reportDateFrom && reportDateTo && (
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

  // ── MODELLI VIEW ─────────────────────────────────────────────
  const modelliView = (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 8px"}}>
        <div style={{fontSize:22,fontWeight:900,fontFamily:"Georgia,serif",color:T.text}}>Modelli</div>
        <div style={{display:"flex",gap:8,alignItems:"center",position:"relative"}}>
          <button onClick={()=>setShowSortMenu(s=>!s)}
            style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
              padding:"6px 10px",fontSize:18,cursor:"pointer",color:T.sub}}>↑↓</button>
          <button onClick={()=>{
            if(modelliTab==="turni"){
              setEditModello(null);
              setModelForm({titolo:"",tempo:"personalizzato",inizio:"",fine:"",coloreCustom:null,posizione:""});
              setShowModelForm(true);
            } else {
              setEditRotazione(null);
              setRotForm({tipo:"personalizzata",titolo:"",dataInizio:"",nSettimane:52,modellaLavoroId:null,modelloNLId:null,modelloRSId:null});
              setShowRotForm(true);
            }
          }}
            style={{background:accent,border:"none",borderRadius:8,padding:"6px 16px",
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

      <div style={{flex:1,overflowY:"auto",padding:"0 12px 80px"}}>
        {modelliTab==="turni"&&(
          sortedModelli().length===0?(
            <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
              <div style={{fontSize:36,marginBottom:10}}>📋</div>
              <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessun modello</div>
              <div style={{fontSize:13}}>Premi + per creare il tuo primo modello turno</div>
            </div>
          ):(
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
              {sortedModelli().map((m,i,arr)=>(
                <div key={m.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                  <ModelloCard m={m} T={T} accent={accent}
                    onEdit={()=>{ setEditModello(m); setModelForm(m); setShowModelForm(true); }}
                    onDelete={()=>deleteModello(m.id)}/>
                </div>
              ))}
            </div>
          )
        )}
        {modelliTab==="rotazioni"&&(
          <div style={{paddingBottom:80}}>
            {rotazioni.length===0?(
              <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                <div style={{fontSize:36,marginBottom:10}}>🔄</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessuna rotazione</div>
                <div style={{fontSize:13}}>Premi + per creare una rotazione</div>
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
          <div style={{position:"fixed",inset:0,background:T.bg,zIndex:400,
            display:"flex",flexDirection:"column"}}>
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
            </div>
          </div>
        );
      })()}
    </div>
  );

  // ── SETTINGS VIEW ────────────────────────────────────────────
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

      <Sec label="CALENDARI" T={T}>
        {store.calendars.map((c,ci)=>(
          <div key={c.id} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:T.s2,borderRadius:10,padding:"8px 10px"}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:c.color,
                  border:`2px solid ${T.border}`,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();setPal(pal===c.id?null:c.id);}}/>
                {pal===c.id&&<Pal T={T} cur={c.color} onPick={p=>{
                  const newCals = JSON.parse(JSON.stringify(store.calendars));
                  newCals[ci].color=p;
                  setStore(s=>({...s,calendars:newCals}));
                  updateCalendar(c.id,{color:p});
                  setPal(null);
                }}/>}
              </div>
              <input value={c.name}
                onChange={e=>{
                  const newCals=JSON.parse(JSON.stringify(store.calendars));
                  newCals[ci].name=e.target.value;
                  setStore(s=>({...s,calendars:newCals}));
                }}
                onBlur={e=>updateCalendar(c.id,{name:e.target.value})}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:13,fontWeight:700}}/>
              <button onClick={async()=>{
                const newCals=store.calendars.map((x,j)=>({...x,isMain:j===ci}));
                setStore(s=>({...s,calendars:newCals}));
                for(const cal of store.calendars){
                  await updateCalendar(cal.id,{is_main: cal.id===c.id});
                }
              }} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:c.isMain?"#f59e0b":T.sub}}>★</button>
              <button onClick={()=>setExCal(exCal===c.id?null:c.id)}
                style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12}}>
                {exCal===c.id?"▲":"▼"}</button>
              <button onClick={async()=>{
                await deleteCalendar(c.id);
                const newCals = store.calendars.filter(x=>x.id!==c.id);
                setStore(s=>({...s,calendars:newCals}));
                saveToSheets(store.events, newCals);
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
                      onChange={e=>{
                        const newCals=JSON.parse(JSON.stringify(store.calendars));
                        newCals[ci].shifts[si].label=e.target.value;
                        setStore(s=>({...s,calendars:newCals}));
                      }}
                      onBlur={()=>{ updateCalendar(c.id,{shifts:store.calendars[ci].shifts}); }}
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
                  <input value={nsName} onChange={e=>setNsName(e.target.value)}
                    placeholder="Nome turno..."
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
                  }} style={{background:"#3b82f6",border:"none",borderRadius:8,
                    color:"#fff",padding:"7px 12px",cursor:"pointer",fontWeight:800,fontSize:14}}>+</button>
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
          <input value={ncName} onChange={e=>setNcName(e.target.value)}
            placeholder="Nome calendario..."
            style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none"}}/>
          <button onClick={async()=>{
            if(!ncName.trim()) return;
            const isFirst=store.calendars.length===0;
            const dbCal = await addCalendar(ncName.trim(), ncColor, isFirst);
            if(dbCal){
              const newCals = [...store.calendars,
                {id:dbCal.id,name:dbCal.name,color:dbCal.color,isMain:dbCal.is_main,shifts:[]}];
              setStore(s=>({...s,calendars:newCals}));
              if(!calId) setCalId(dbCal.id);
              saveToSheets(store.events, newCals);
            }
            setNcName("");
          }} style={{background:"#3b82f6",border:"none",borderRadius:8,
            color:"#fff",padding:"8px 14px",cursor:"pointer",fontWeight:800,fontSize:14}}>+</button>
        </div>
      </Sec>

      <Sec label="ARCHIVIO GOOGLE SHEETS" T={T}>
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
        {sheetsUrl && (
          <a href="https://docs.google.com/spreadsheets/d/106C8GAh0Ka2WS8O8Ezx0nUnDgX0hyS7Crvixy84uDSA/edit" target="_blank" rel="noreferrer"
            style={{display:"block",textAlign:"center",fontSize:11,color:"#16a34a",fontWeight:700,
              textDecoration:"none",background:"#dcfce7",borderRadius:8,padding:"8px 0"}}>
            📊 Apri Google Sheets
          </a>
        )}
        {syncMsg&&<div style={{fontSize:11,color:T.text,padding:"8px 10px",
          background:T.s2,borderRadius:8,textAlign:"center",marginTop:8}}>{syncMsg}</div>}
      </Sec>

      <Sec label="DATABASE CLOUD SUPABASE" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Controlla lo stato dei dati memorizzati nel cloud Supabase per il tuo account.
        </div>
        <button onClick={handleViewDbData}
          style={{width:"100%",background:"#475569",border:"none",borderRadius:10,
            color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
          🔍 Visualizza Dati in Supabase
        </button>
      </Sec>

      {session?.user?.email === 'tesonemgs5@gmail.com' && (
        <Sec label="STATISTICHE DI UTILIZZO (ADMIN)" T={T}>
          {stats ? (
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
          ) : (
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
              saveSettings({theme:store.theme, extra_hols:newH});
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
            saveSettings({theme:store.theme, extra_hols:newH});
            setNhName(""); setNhD(""); setNhM("");
          }} style={{background:"#ef4444",border:"none",borderRadius:8,
            color:"#fff",padding:"7px 12px",cursor:"pointer",fontWeight:800}}>+</button>
        </div>
      </Sec>
    </div>
  );

  // ── DAY MODAL ─────────────────────────────────────────────────
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
        {curEvts.map(e=>(
          <div key={e.id} style={{background:e.color,borderRadius:10,
            padding:"10px 12px",marginBottom:8,
            display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontSize:14,fontWeight:800,
                textShadow:"0 1px 3px rgba(0,0,0,0.3)"}}>{e.label}</div>
              {!e.allDay&&e.tIn&&(
                <div style={{color:"rgba(255,255,255,0.85)",fontSize:11,marginTop:2}}>
                  🕐 {e.tIn}{e.tOut?` → ${e.tOut}`:""}
                </div>
              )}
              {e.note&&<div style={{color:"rgba(255,255,255,0.8)",fontSize:11,marginTop:3}}>{e.note}</div>}
              {e.auto&&<div style={{color:"rgba(255,255,255,0.8)",fontSize:11,marginTop:3}}>🚗 {e.auto}</div>}
              {e.collega&&<div style={{color:"rgba(255,255,255,0.8)",fontSize:11,marginTop:3}}>👮 {e.collega}</div>}
              {e.place&&(e.map
                ?<a href={e.map} target="_blank" rel="noreferrer"
                    style={{color:"#fff",fontSize:11,marginTop:3,display:"block"}}>📍 {e.place}</a>
                :<div style={{color:"rgba(255,255,255,0.8)",fontSize:11,marginTop:3}}>📍 {e.place}</div>
              )}
            </div>
            <button onClick={()=>delEvt(dayKey,calId,e.id)}
              style={{background:"rgba(0,0,0,0.2)",border:"none",borderRadius:6,
                color:"#fff",width:26,height:26,cursor:"pointer",fontSize:14,marginLeft:8,flexShrink:0}}>×</button>
          </div>
        ))}
        {form&&(
          <div style={{background:T.s2,borderRadius:12,padding:14,marginTop:8}}>
            <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:12}}>NUOVO EVENTO</div>

            {/* MODELLI */}
            {modelli.length>0&&(
              <>
                <div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600}}>MODELLO TURNO</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  {modelli.map(m=>{
                    const c=m.coloreCustom||getColorByTime(m.inizio);
                    return (
                      <button key={m.id}
                        onClick={()=>setForm(f=>({...f,modelloId:m.id,shiftId:null,
                          label:m.titolo,colorOvr:null,
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
                  <button onClick={()=>setForm(f=>({...f,modelloId:null}))}
                    style={{background:!form.modelloId?accent:T.surface,
                      border:`2px solid ${!form.modelloId?accent:T.border}`,
                      borderRadius:10,padding:"6px 10px",cursor:"pointer",
                      color:!form.modelloId?"#fff":T.sub,fontSize:11,fontWeight:700}}>
                    Libero
                  </button>
                </div>
              </>
            )}

            {(activeCal?.shifts||[]).length>0&&!form.modelloId&&(
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

            {!form.shiftId&&!form.modelloId&&(
              <input value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
                placeholder="NOME EVENTO..."
                style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:8,padding:"9px 10px",color:T.text,fontSize:13,
                  marginBottom:10,boxSizing:"border-box",outline:"none"}}/>
            )}

            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:10,color:T.sub,fontWeight:700}}>COLORE</span>
              <div style={{position:"relative"}}>
                <div style={{width:24,height:24,borderRadius:"50%",cursor:"pointer",
                  background:form.colorOvr||(form.modelloId
                    ?(modelli.find(m=>m.id===form.modelloId)?.coloreCustom||getColorByTime(modelli.find(m=>m.id===form.modelloId)?.inizio))
                    :form.shiftId?activeCal?.shifts?.find(s=>s.id===form.shiftId)?.color
                    :activeCal?.color)||"#94a3b8",
                  border:`2px solid ${T.border}`}}
                  onClick={e=>{e.stopPropagation();setPal(pal==="ec"?null:"ec");}}/>
                {pal==="ec"&&<Pal T={T} onPick={p=>{setForm(f=>({...f,colorOvr:p}));setPal(null);}} up/>}
              </div>
              {form.colorOvr&&(
                <button onClick={()=>setForm(f=>({...f,colorOvr:null}))}
                  style={{background:"none",border:"none",color:T.sub,fontSize:10,cursor:"pointer"}}>↩ auto</button>
              )}
            </div>

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
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:T.sub,marginBottom:3}}>INGRESSO</div>
                  <input type="time" value={form.tIn||""}
                    onChange={e=>setForm(f=>({...f,tIn:e.target.value,tOut:""}))}
                    style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
                </div>
                {form.dur==="custom"&&(
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:T.sub,marginBottom:3}}>USCITA</div>
                    <input type="time" value={form.tOut||""}
                      onChange={e=>setForm(f=>({...f,tOut:e.target.value}))}
                      style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                        borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
                  </div>
                )}
                {form.dur==="fixed"&&form.tIn&&(
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:T.sub,marginBottom:3}}>USCITA (modif.)</div>
                    <input type="time" value={form.tOut||calcFine6h15(form.tIn)}
                      onChange={e=>setForm(f=>({...f,tOut:e.target.value}))}
                      style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                        borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
                    {(()=>{
                      const tOut=form.tOut||calcFine6h15(form.tIn);
                      const std=calcFine6h15(form.tIn);
                      if(!tOut||!std) return null;
                      const [h1,m1]=std.split(":").map(Number);
                      const [h2,m2]=tOut.split(":").map(Number);
                      let diff=(h2*60+m2)-(h1*60+m1);
                      if(diff===0) return null;
                      const absDiff=Math.abs(diff);
                      const isExtra=diff>0;
                      return (
                        <>
                          <div style={{fontSize:10,color:isExtra?"#22c55e":"#f97316",
                            marginTop:3,fontWeight:700}}>
                            {isExtra?"+":"-"}{Math.floor(absDiff/60)}h{absDiff%60>0?absDiff%60+"m":""}
                            {" "}{isExtra?"straordinario":"monte ore"}
                          </div>
                          {isExtra&&(
                            <div style={{display:"flex",gap:6,marginTop:6}}>
                              {[["pagamento","Pagamento"],["recupero","Recupero"]].map(([v,l])=>(
                                <button key={v} type="button" onClick={()=>setForm(f=>({...f,straordinarioTipo:v}))}
                                  style={{flex:1,padding:"6px 4px",borderRadius:8,cursor:"pointer",fontSize:10,fontWeight:700,
                                    background:form.straordinarioTipo===v?(v==="pagamento"?"#8b5cf6":"#64748b"):T.surface,
                                    color:form.straordinarioTipo===v?"#fff":T.sub,
                                    border:`1.5px solid ${form.straordinarioTipo===v?(v==="pagamento"?"#8b5cf6":"#64748b"):T.border}`}}>{l}</button>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Numero auto */}
            <input value={form.auto||""} onChange={e=>setForm(f=>({...f,auto:e.target.value.toUpperCase()}))}
              placeholder="🚗 Numero auto/pattuglia (opzionale)..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none"}}/>

            {/* Collega di pattuglia */}
            <input value={form.collega||""} onChange={e=>setForm(f=>({...f,collega:e.target.value.toUpperCase()}))}
              placeholder="👮 COLLEGA DI PATTUGLIA (OPZIONALE)..."
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,
                marginBottom:6,boxSizing:"border-box",outline:"none"}}/>

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
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setForm(null);setPal(null);}}
                style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:10,color:T.sub,padding:"11px 0",cursor:"pointer",fontSize:13,fontWeight:700}}>
                Annulla
              </button>
              <button onClick={saveEvt}
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

  // ── DB MODAL ─────────────────────────────────────────────────
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
          {dbRawData ? (
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

  // ── MAIN RENDER ──────────────────────────────────────────────
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
      {showModelloPicker && (
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
            {modelli.length===0 && (
              <div style={{textAlign:"center",padding:"40px 24px",color:T.sub}}>
                <div style={{fontSize:36,marginBottom:10}}>📋</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Nessun modello</div>
                <div style={{fontSize:13}}>Crea il tuo primo modello turno</div>
              </div>
            )}
            {modelli.length>0 && (
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                {modelli.map((m,i,arr)=>{
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
                          <div style={{fontSize:14,fontWeight:800,color:T.text,overflow:"hidden",
                            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
                          <div style={{fontSize:12,color:T.sub,marginTop:1}}>{durata}</div>
                        </div>
                        <span style={{color:T.sub,fontSize:14}}>›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {(activeCal?.shifts||[]).length>0 && (
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

// ── REPORT SUB-COMPONENTS ────────────────────────────────────

function ConteggioConfig({T, cfg, setCfg, data, calendars, modelli}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div>
        <div style={{fontSize:10,color:T.sub,marginBottom:4}}>TITOLO</div>
        <input value={cfg.titolo} onChange={e=>setCfg(c=>({...c,titolo:e.target.value}))}
          style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
            borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>RIEPILOGO FASCE ORARIE</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {[
            ["Totale turni", data.totale],
            ["Mattina (06-11:45)", data.mattina],
            ["Pomeriggio (11:45-17:15)", data.pomeriggio],
            ["3° Turno (17:15-18)", data.terzo],
            ["Notte", data.notte],
            ["H24", data.h24],
          ].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",
              padding:"6px 8px",background:T.s2,borderRadius:6}}>
              <span style={{fontSize:11,color:T.sub}}>{l}</span>
              <span style={{fontSize:13,fontWeight:800,color:T.text}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {modelli.length>0&&data.perModello&&Object.keys(data.perModello).length>0&&(
        <div style={{background:T.surface,borderRadius:10,padding:12}}>
          <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>PER MODELLO</div>
          {Object.entries(data.perModello).map(([mid,cnt])=>{
            const m=modelli.find(x=>x.id===mid);
            if(!m) return null;
            const c=m.coloreCustom||getColorByTime(m.inizio);
            return (
              <div key={mid} style={{display:"flex",alignItems:"center",gap:8,
                padding:"6px 8px",background:T.s2,borderRadius:6,marginBottom:4}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                <span style={{flex:1,fontSize:12,color:T.text}}>{m.titolo}</span>
                <span style={{fontSize:14,fontWeight:800,color:T.text}}>{cnt}</span>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>INCLUDI GIORNI</div>
        <div style={{background:T.surface,borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`}}>
          {[["festivi","Festività"],["lun","Lunedì"],["mar","Martedì"],["mer","Mercoledì"],
            ["gio","Giovedì"],["ven","Venerdì"],["sab","Sabato"],["dom","Domenica"]].map(([k,l],i,arr)=>(
            <div key={k} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"12px 14px",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
              <span style={{fontSize:13,color:T.text}}>{l}</span>
              <div onClick={()=>setCfg(c=>({...c,giorni:{...c.giorni,[k]:!c.giorni[k]}}))}
                style={{width:44,height:26,borderRadius:13,cursor:"pointer",position:"relative",
                  background:cfg.giorni[k]?"#3b82f6":"#94a3b8",transition:"background 0.2s"}}>
                <div style={{position:"absolute",top:3,left:cfg.giorni[k]?20:3,width:20,height:20,
                  borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IndennitaConfig({T, values, setValues, calc, onSave}){
  const fasce = [
    { key:"diurno", label:"Diurno (06:00 - 22:00)", count: calc.diurno },
    { key:"notturno", label:"Notturno", count: calc.notturno },
    { key:"festivo", label:"Festivo", count: calc.festivo },
    { key:"notturno_festivo", label:"Notturno festivo", count: calc.notturno_festivo },
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
              onBlur={onSave}
              placeholder="0.00" step="0.01"
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
            return sum + v*f.count;
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
        <span style={{fontSize:12,color:T.sub}}>Turni 6h15m</span>
        <span style={{fontWeight:800,color:T.text}}>{(data.mattina+data.pomeriggio+data.terzo+data.notte)*6.25}h</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:12,color:T.sub}}>Totale stimato</span>
        <span style={{fontWeight:900,fontSize:15,color:"#3b82f6"}}>{(data.totale-data.h24)*6.25}h</span>
      </div>
    </div>
  );
}

function StraordinariView({T, data}){
  return (
    <div style={{background:T.surface,borderRadius:10,padding:12}}>
      <div style={{fontSize:11,color:T.sub,marginBottom:8}}>Protrazioni e straordinari</div>
      <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"12px 0"}}>
        I dati verranno calcolati quando gli eventi avranno orari dettagliati.
      </div>
    </div>
  );
}

function GuadagniView({T, indennita, calc}){
  const tot = ["diurno","notturno","festivo","notturno_festivo"].reduce((s,k)=>{
    return s + (parseFloat(indennita[k])||0)*calc[k];
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

// ── SHARED COMPONENTS ────────────────────────────────────────
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

function Sec({label,children,T}){
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,
      borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.8px",marginBottom:10}}>{label}</div>
      {children}
    </div>
  );
}

function ModelloCard({m, T, accent, onEdit, onDelete}){
  const colore=m.coloreCustom||(m.tempo==="h24"?"#64748b":getColorByTime(m.inizio));
  const durata=m.tempo==="h24"?"Tutto il giorno"
    :m.tempo==="6h15"&&m.inizio?`${m.inizio} - ${calcFine6h15(m.inizio)} • 6h 15m`
    :m.inizio&&m.fine?`${m.inizio} - ${m.fine} • ${calcDurata(m.inizio,m.fine)}`
    :m.inizio?m.inizio:"";
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onEdit}>
      <div style={{width:36,height:36,borderRadius:10,background:colore+"33",
        border:`2px solid ${colore}`,display:"flex",alignItems:"center",justifyContent:"center",
        flexShrink:0,marginRight:12}}>
        <div style={{width:14,height:14,borderRadius:"50%",background:colore}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
        <div style={{fontSize:12,color:T.sub,marginTop:1}}>{durata}</div>
      </div>
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
  const PALETTE_M=[
    "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
    "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6",
    "#a855f7","#ec4899","#64748b","#1e40af","#0f172a","#ffffff",
  ];
  return (
    <div style={{padding:"16px 14px 40px"}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,
        overflow:"hidden",marginBottom:16}}>
        <input value={form.titolo} onChange={e=>setForm(f=>({...f,titolo:e.target.value}))}
          placeholder="TITOLO"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>

      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>TIPO DI TURNO</div>
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
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,
          overflow:"hidden",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",padding:"14px 16px",
            borderBottom:`1px solid ${T.border}`}}>
            <span style={{flex:1,fontSize:15,color:T.text}}>Inizio</span>
            <input type="time" value={form.inizio} onChange={e=>setForm(f=>({...f,inizio:e.target.value}))}
              style={{background:"transparent",border:"none",outline:"none",
                color:T.text,fontSize:15,fontWeight:700}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",padding:"14px 16px"}}>
            <span style={{flex:1,fontSize:15,color:T.text}}>Fine</span>
            {form.tempo==="6h15"&&fineAuto?(
              <span style={{fontSize:15,fontWeight:700,color:T.sub}}>{fineAuto} (auto)</span>
            ):(
              <input type="time" value={form.fine} onChange={e=>setForm(f=>({...f,fine:e.target.value}))}
                style={{background:"transparent",border:"none",outline:"none",
                  color:T.text,fontSize:15,fontWeight:700}}/>
            )}
          </div>
        </div>
      )}

      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>COLORE</div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,
        padding:"12px 14px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:coloreVis,
            border:`3px solid ${T.border}`,cursor:"pointer",flexShrink:0}}
            onClick={()=>setShowPal(s=>!s)}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text}}>
              {form.coloreCustom?"Personalizzato":`Auto — ${form.tempo==="h24"?"H24":getColorLabel(form.inizio)||"imposta orario"}`}
            </div>
            {!form.coloreCustom&&form.tempo!=="h24"&&form.inizio&&(
              <div style={{fontSize:11,color:T.sub}}>{getColorLabel(form.inizio)}</div>
            )}
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

      <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>POSIZIONE</div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,
        overflow:"hidden",marginBottom:24}}>
        <input value={form.posizione||""} onChange={e=>setForm(f=>({...f,posizione:e.target.value.toUpperCase()}))}
          placeholder="LUOGO DI LAVORO (OPZIONALE)"
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:15,boxSizing:"border-box"}}/>
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

// ── ROTAZIONI COMPONENTS ─────────────────────────────────────

function RotazioneCard({r, T, accent, modelli, onOpen, onDelete}){
  const tipoLabel = r.tipo==="domeniche"?"🗓 Domeniche":r.tipo==="nlrs"?"🔄 NL / RS":"📋 Personalizzata";
  const modelloLav = modelli.find(m=>m.id===r.modellaLavoroId);
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onOpen}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:12,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
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
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["personalizzata","Personalizzata"],["domeniche","Domeniche"],["nlrs","NL / RS"]].map(([v,l])=>(
          <button key={v} onClick={()=>setForm(f=>({...f,tipo:v}))}
            style={{flex:1,padding:"10px 4px",borderRadius:10,border:"none",cursor:"pointer",
              fontWeight:700,fontSize:11,
              background:form.tipo===v?accent:T.s2,
              color:form.tipo===v?"#fff":T.sub}}>{l}</button>
        ))}
      </div>

      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <input value={form.titolo} onChange={e=>setForm(f=>({...f,titolo:e.target.value}))}
          placeholder={form.tipo==="domeniche"?"ES. ROTAZIONE DOMENICHE":form.tipo==="nlrs"?"ES. ROTAZIONE NL/RS":"TITOLO ROTAZIONE"}
          style={{width:"100%",padding:"14px 16px",background:"transparent",border:"none",
            outline:"none",color:T.text,fontSize:16,fontWeight:600,boxSizing:"border-box"}}/>
      </div>

      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
          <span style={{flex:1,fontSize:15,color:T.text}}>
            {form.tipo==="nlrs"?"Data primo NL":"Data inizio ciclo"}
          </span>
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
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ModelloSelector label="Domenica lavoro" value={form.modellaLavoroId}
              onChange={id=>setForm(f=>({...f,modellaLavoroId:id}))}
              modelli={modelli} T={T} required/>
            <ModelloSelector label="Domenica festa (opzionale)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))}
              modelli={modelli} T={T} last/>
          </div>
        </div>
      )}

      {form.tipo==="nlrs"&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8,paddingLeft:4}}>MODELLI</div>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))}
              modelli={modelli} T={T}/>
            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))}
              modelli={modelli} T={T} last/>
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

// Griglia 365 giorni per rotazione personalizzata
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

  const selM=modelli.find(m=>m.id===selModello);
  const selColore=selM?(selM.coloreCustom||getColorByTime(selM.inizio)):"#3b82f6";

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
                        background:c||( isDOM?(T.bg==="#f1f5f9"?"#fff5f5":"#2d0a0a"):T.s2),
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

// Vista rotazione Domeniche
function DomenicheView({rot, T, accent, modelli, onUpdate}){
  const griglia=rot.griglia||{};
  const modLav=modelli.find(m=>m.id===rot.modellaLavoroId);
  const modFesta=modelli.find(m=>m.id===rot.modelloNLId);

  function getDomeniche(){
    if(!rot.dataInizio) return [];
    const inizio=new Date(rot.dataInizio);
    let d=new Date(inizio);
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
          Imposta la data di inizio nella configurazione rotazione
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {domeniche.map((dom,i)=>{
          const isLavoro=i%4===0;
          const autoM=isLavoro?modLav:modFesta;
          const ovrM=modelli.find(m=>m.id===griglia[dom.key]);
          const effM=ovrM||autoM;
          const c=effM?(effM.coloreCustom||getColorByTime(effM.inizio)):(isLavoro?"#3b82f6":"#94a3b8");
          return (
            <div key={dom.key} style={{background:T.surface,border:`1px solid ${T.border}`,
              borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:c,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:T.sub}}>Dom {dom.date.toLocaleDateString("it-IT")}</div>
                <div style={{fontSize:13,fontWeight:700,color:T.text}}>
                  {isLavoro?"🔵 Lavoro":"⚪ Festa"} · {effM?.titolo||(isLavoro?"Nessun modello assegnato":"Riposo")}
                </div>
                {ovrM&&<div style={{fontSize:10,color:accent,marginTop:1}}>Personalizzato</div>}
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

// Vista rotazione NL/RS
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
            <span style={{fontWeight:700,color:"#3b82f6"}}>NL</span> — Modello: {modNL?.titolo||"Non assegnato"}
          </div>
          <div style={{fontSize:12,color:T.sub}}>
            <span style={{fontWeight:700,color:"#8b5cf6"}}>RS</span> — Modello: {modRS?.titolo||"Non assegnato"}
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