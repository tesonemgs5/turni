import { useState, useEffect } from "react";

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

const SK = "cal_v4";
const INIT = { calendars:[], events:{}, theme:"auto", extraHols:[] };

export default function App(){
  const today = new Date();
  const [store, setStore] = useState(INIT);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calId, setCalId] = useState(null);
  const [screen, setScreen] = useState("cal");
  const [dayKey, setDayKey] = useState(null);
  const [form,   setForm]   = useState(null);
  const [pal,    setPal]    = useState(null);
  // settings inputs
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

  // Load once
  useEffect(()=>{
    (async()=>{
      try{
        const r = await window.storage?.get(SK);
        if(r?.value){
          const s = JSON.parse(r.value);
          setStore(s);
          setCalId(s.calendars[0]?.id||null);
        }
      }catch(e){ console.log(e); }
    })();
  },[]);

  // Save whenever store changes
  useEffect(()=>{
    if(store===INIT) return;
    (async()=>{
      try{ await window.storage?.set(SK, JSON.stringify(store)); }catch(e){ console.log(e); }
    })();
  },[store]);

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
    // Ordina: tutto il giorno prima, poi per orario crescente, a parità mantieni ordine inserimento
    return res.sort((a,b)=>{
      if(a.allDay && b.allDay) return 0;
      if(a.allDay) return -1;
      if(b.allDay) return 1;
      const ta = a.tIn||"";
      const tb = b.tIn||"";
      if(ta===tb) return 0;
      if(!ta) return 1;
      if(!tb) return -1;
      return ta.localeCompare(tb);
    });
  }

  function dots(key){ return store.calendars.filter(c=>getEvts(key,c.id).length>0); }

  // ── SAVE EVENT ───────────────────────────────────────────────
  function saveEvt(){
    if(!form||!dayKey||!calId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;

    let color = form.colorOvr || cal.color;
    let label = form.label||"Evento";

    if(form.shiftId){
      const sh = cal.shifts?.find(s=>s.id===form.shiftId);
      if(sh){ color=form.colorOvr||sh.color; label=sh.label; }
    }

    let tOut = form.tOut||"";
    if(form.dur==="fixed" && form.tIn){
      const [h,m]=form.tIn.split(":").map(Number);
      const tot=h*60+m+375;
      tOut=`${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot%60).padStart(2,"0")}`;
    }

    const evt = {
      id:uid(), color, label, note:form.note||"",
      allDay: form.dur==="allday",
      tIn:  form.dur==="allday"?"":form.tIn||"",
      tOut: form.dur==="allday"?"":tOut,
      place:form.place||"", map:form.map||"",
    };

    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      if(!ns.events[dayKey]) ns.events[dayKey]={};
      if(!ns.events[dayKey][calId]) ns.events[dayKey][calId]=[];
      ns.events[dayKey][calId].push(evt);
      return ns;
    });
    setForm(null);
    setDayKey(null);
    // Auto-salva su Sheets
    saveToSheets(ns.events, store.calendars);
  }

  function delEvt(key,cid,eid){
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      if(ns.events?.[key]?.[cid])
        ns.events[key][cid]=ns.events[key][cid].filter(e=>e.id!==eid);
      return ns;
    });
  }

  const SHEETS_URL = "https://script.google.com/macros/s/AKfycby84d3usTshqIPnMnuQzlKXDWvXQdPECY8dgDUX-uhmjqZ2UMWuu57IsgrRZ8B4MsBreA/exec";
  const SHEETS_SECRET = "turnipm2024";

  async function saveToSheets(events, calendars) {
    try {
      const res = await fetch(SHEETS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ secret: SHEETS_SECRET, action: "save", events, calendars }),
      });
      return "✅ Eventi inviati a Sheets";
    } catch(e) { return "❌ Errore connessione"; }
  }

  async function loadFromSheets() {
    try {
      const res = await fetch(`${SHEETS_URL}?secret=${SHEETS_SECRET}&action=load`);
      const data = await res.json();
      return data || null;
    } catch(e) { return null; }
  }

  async function handleSave(){
    setSyncing(true); setSyncMsg("");
    const msg = await saveToSheets(store.events, store.calendars);
    setSyncMsg(msg); setSyncing(false);
  }

  async function handleLoad(){
    setSyncing(true); setSyncMsg("");
    const data = await loadFromSheets();
    if(data && data.data){
      const newEvents = {};
      store.calendars.forEach(cal => {
        const calData = data.data[cal.name] || {};
        Object.entries(calData).forEach(([dateKey, evts]) => {
          if(!newEvents[dateKey]) newEvents[dateKey] = {};
          newEvents[dateKey][cal.id] = evts;
        });
      });
      setStore(s=>({...s,events:newEvents}));
      setSyncMsg("✅ Dati caricati da Sheets");
    }
    else setSyncMsg("❌ Nessun dato trovato");
    setSyncing(false);
  }

  // ── CALENDAR GRID ────────────────────────────────────────────
  const totalDays = daysInMonth(year,month);
  const fd = firstDay(year,month);
  const cells = [...Array(fd).fill(null), ...Array.from({length:totalDays},(_,i)=>i+1)];

  const calView = (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      {/* Topbar */}
      <div style={{background:accent,display:"flex",alignItems:"center",
        gap:5,padding:"6px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0}}>
        <button onClick={()=>month===0?(setYear(y=>y-1),setMonth(11)):setMonth(m=>m-1)}
          style={NB}>‹</button>
        <span style={{color:"#fff",fontSize:13,fontWeight:900,flexShrink:0,
          fontFamily:"Georgia,serif"}}>{MONTHS[month].slice(0,3).toUpperCase()} {year}</span>
        <button onClick={()=>month===11?(setYear(y=>y+1),setMonth(0)):setMonth(m=>m+1)}
          style={NB}>›</button>
        <div style={{width:1,height:14,background:"rgba(255,255,255,0.3)",flexShrink:0,marginLeft:2}}/>
        {store.calendars.length===0
          ? <span style={{color:"rgba(255,255,255,0.6)",fontSize:10,fontStyle:"italic"}}>→ Impostazioni</span>
          : store.calendars.map(c=>(
            <button key={c.id} onClick={()=>setCalId(c.id)}
              style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,cursor:"pointer",
                background:calId===c.id?"rgba(255,255,255,0.28)":"rgba(255,255,255,0.1)",
                border:`1.5px solid ${calId===c.id?"rgba(255,255,255,0.85)":"transparent"}`,
                borderRadius:20,padding:"2px 8px 2px 5px"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:c.color,
                border:"1px solid rgba(255,255,255,0.5)"}}/>
              <span style={{color:"#fff",fontSize:10,fontWeight:700}}>{c.name}</span>
              {c.isMain&&<span style={{color:"rgba(255,255,255,0.6)",fontSize:8}}>★</span>}
            </button>
          ))
        }
      </div>
      {/* Day headers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",
        background:T.s2,borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        {DAYS.map((d,i)=>(
          <div key={i} style={{textAlign:"center",fontSize:9,fontWeight:800,
            padding:"3px 0",color:i===6?"#ef4444":T.sub}}>{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",
        gridAutoRows:"minmax(54px,1fr)",flex:1,overflow:"hidden",gap:"1px",background:T.gap}}>
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

  // ── SETTINGS ─────────────────────────────────────────────────
  const settingsView = (
    <div style={{flex:1,overflowY:"auto",padding:"12px 12px 80px",color:T.text}}>
      <div style={{fontSize:18,fontWeight:900,fontFamily:"Georgia,serif",marginBottom:14}}>Impostazioni</div>

      {/* Tema */}
      <Sec label="TEMA" T={T}>
        <div style={{display:"flex",gap:6}}>
          {[["auto","Auto"],["light","Chiaro"],["dark","Scuro"]].map(([v,l])=>(
            <button key={v} onClick={()=>setStore(s=>({...s,theme:v}))}
              style={{flex:1,padding:"9px 4px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:11,
                background:store.theme===v?(v==="light"?"#f8fafc":v==="dark"?"#0f172a":"#6366f1"):T.s2,
                color:store.theme===v?(v==="light"?"#0f172a":"#fff"):T.sub,
                border:`2px solid ${store.theme===v?"#6366f1":T.border}`}}>{l}</button>
          ))}
        </div>
      </Sec>

      {/* Calendari */}
      <Sec label="CALENDARI" T={T}>
        {store.calendars.map((c,ci)=>(
          <div key={c.id} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,
              background:T.s2,borderRadius:10,padding:"8px 10px"}}>
              {/* Colore */}
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:c.color,
                  border:`2px solid ${T.border}`,cursor:"pointer"}}
                  onClick={e=>{e.stopPropagation();setPal(pal===c.id?null:c.id);}}/>
                {pal===c.id&&<Pal T={T} cur={c.color} onPick={p=>{
                  setStore(s=>{const n=JSON.parse(JSON.stringify(s));n.calendars[ci].color=p;return n;});
                  setPal(null);
                }}/>}
              </div>
              <input value={c.name}
                onChange={e=>setStore(s=>{const n=JSON.parse(JSON.stringify(s));n.calendars[ci].name=e.target.value;return n;})}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:13,fontWeight:700}}/>
              <button onClick={()=>setStore(s=>{const n=JSON.parse(JSON.stringify(s));
                n.calendars=n.calendars.map((x,j)=>({...x,isMain:j===ci}));return n;})}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:c.isMain?"#f59e0b":T.sub}}>★</button>
              <button onClick={()=>setExCal(exCal===c.id?null:c.id)}
                style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12}}>
                {exCal===c.id?"▲":"▼"}</button>
              <button onClick={()=>setStore(s=>{const n=JSON.parse(JSON.stringify(s));
                n.calendars=n.calendars.filter(x=>x.id!==c.id);return n;})}
                style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18}}>×</button>
            </div>
            {/* Turni */}
            {exCal===c.id&&(
              <div style={{background:T.s2,borderRadius:"0 0 10px 10px",padding:"10px",borderTop:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,color:T.sub,fontWeight:700,marginBottom:8}}>TURNI PREDEFINITI</div>
                {(c.shifts||[]).map((sh,si)=>(
                  <div key={sh.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <div style={{position:"relative",flexShrink:0}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:sh.color,cursor:"pointer"}}
                        onClick={e=>{e.stopPropagation();setPal(pal===sh.id?null:sh.id);}}/>
                      {pal===sh.id&&<Pal T={T} cur={sh.color} onPick={p=>{
                        setStore(s=>{const n=JSON.parse(JSON.stringify(s));n.calendars[ci].shifts[si].color=p;return n;});
                        setPal(null);
                      }}/>}
                    </div>
                    <input value={sh.label}
                      onChange={e=>setStore(s=>{const n=JSON.parse(JSON.stringify(s));
                        n.calendars[ci].shifts[si].label=e.target.value;return n;})}
                      style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:12}}/>
                    <button onClick={()=>setStore(s=>{const n=JSON.parse(JSON.stringify(s));
                      n.calendars[ci].shifts=n.calendars[ci].shifts.filter((_,k)=>k!==si);return n;})}
                      style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16}}>×</button>
                  </div>
                ))}
                {/* Nuovo turno */}
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
                    setStore(s=>{const n=JSON.parse(JSON.stringify(s));
                      if(!n.calendars[ci].shifts) n.calendars[ci].shifts=[];
                      n.calendars[ci].shifts.push({id:uid(),label:nsName.trim(),color:nsColor});
                      return n;});
                    setNsName("");
                  }} style={{background:"#3b82f6",border:"none",borderRadius:8,
                    color:"#fff",padding:"7px 12px",cursor:"pointer",fontWeight:800,fontSize:14}}>+</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {/* Nuovo calendario */}
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
          <button onClick={()=>{
            if(!ncName.trim()) return;
            const isFirst=store.calendars.length===0;
            setStore(s=>({...s,calendars:[...s.calendars,
              {id:uid(),name:ncName.trim(),color:ncColor,isMain:isFirst,shifts:[]}]}));
            setNcName("");
          }} style={{background:"#3b82f6",border:"none",borderRadius:8,
            color:"#fff",padding:"8px 14px",cursor:"pointer",fontWeight:800,fontSize:14}}>+</button>
        </div>
      </Sec>

      {/* Sync Sheets */}
      <Sec label="ARCHIVIO GOOGLE SHEETS" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:10}}>
          Salva o carica tutti gli eventi dal foglio Google.
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <button onClick={handleSave} disabled={syncing}
            style={{flex:1,background:"#16a34a",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            {syncing?"⏳ ...":"📤 Salva su Sheets"}
          </button>
          <button onClick={handleLoad} disabled={syncing}
            style={{flex:1,background:"#2563eb",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            {syncing?"⏳ ...":"📥 Carica da Sheets"}
          </button>
        </div>
        {syncMsg&&<div style={{fontSize:12,color:T.text,padding:"8px 10px",
          background:T.s2,borderRadius:8,textAlign:"center"}}>{syncMsg}</div>}
        <a href="https://docs.google.com/spreadsheets/d/106C8GAh0Ka2WS8O8Ezx0nUnDgX0hyS7Crvixy84uDSA/edit"
          target="_blank" rel="noreferrer"
          style={{display:"block",marginTop:8,textAlign:"center",fontSize:11,
            color:"#16a34a",fontWeight:700,textDecoration:"none",
            background:"#dcfce7",borderRadius:8,padding:"8px 0"}}>
          📊 Apri Google Sheets
        </a>
      </Sec>

      {/* Festivi locali */}
      <Sec label="FESTIVI LOCALI" T={T}>
        <div style={{fontSize:11,color:T.sub,marginBottom:8}}>
          Domeniche e festivi nazionali italiani sono già in rosso automaticamente.
        </div>
        {(store.extraHols||[]).map((h,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,
            background:T.s2,borderRadius:8,padding:"6px 10px",marginBottom:6}}>
            <span style={{flex:1,fontSize:12,color:T.text}}>🎉 {h.name} — {h.d}/{h.m}</span>
            <button onClick={()=>setStore(s=>({...s,extraHols:(s.extraHols||[]).filter((_,j)=>j!==i)}))}
              style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16}}>×</button>
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
            setStore(s=>({...s,extraHols:[...(s.extraHols||[]),{name:nhName.trim(),d:nhD,m:nhM}]}));
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

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{fontSize:16,fontWeight:900,color:T.text}}>{dayKey}</div>
            <div style={{fontSize:11,color:accent,fontWeight:700}}>{activeCal?.name||"Seleziona un calendario"}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {!form&&activeCal&&(
              <button onClick={()=>setForm({shiftId:null,label:"",note:"",dur:"allday",
                tIn:"",tOut:"",place:"",map:"",colorOvr:null})}
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

        {/* Cambio calendario */}
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

        {/* Evento list */}
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

        {/* FORM */}
        {form&&(
          <div style={{background:T.s2,borderRadius:12,padding:14,marginTop:8}}>
            <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:12}}>NUOVO EVENTO</div>

            {/* Turni predefiniti */}
            {(activeCal?.shifts||[]).length>0&&(
              <>
                <div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600}}>TURNO</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
                  {activeCal.shifts.map(s=>(
                    <button key={s.id}
                      onClick={()=>setForm(f=>({...f,shiftId:s.id,label:s.label,colorOvr:null}))}
                      style={{background:form.shiftId===s.id?s.color:T.surface,
                        border:`2px solid ${form.shiftId===s.id?s.color:T.border}`,
                        borderRadius:10,padding:"8px 4px",cursor:"pointer",
                        color:form.shiftId===s.id?"#fff":T.sub,fontSize:11,fontWeight:700}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.color,
                        margin:"0 auto 4px"}}/>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div style={{textAlign:"center",fontSize:10,color:T.sub,marginBottom:10}}>— o evento libero —</div>
              </>
            )}

            {/* Label libero */}
            {!form.shiftId&&(
              <input value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value}))}
                placeholder="Nome evento..."
                style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                  borderRadius:8,padding:"9px 10px",color:T.text,fontSize:13,
                  marginBottom:10,boxSizing:"border-box",outline:"none"}}/>
            )}

            {/* Colore */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:10,color:T.sub,fontWeight:700}}>COLORE</span>
              <div style={{position:"relative"}}>
                <div style={{width:24,height:24,borderRadius:"50%",cursor:"pointer",
                  background:form.colorOvr||(form.shiftId
                    ?activeCal?.shifts?.find(s=>s.id===form.shiftId)?.color
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

            {/* Durata */}
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
                    onChange={e=>setForm(f=>({...f,tIn:e.target.value}))}
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
                    <div style={{fontSize:9,color:T.sub,marginBottom:3}}>USCITA AUTO</div>
                    <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                      padding:"7px 8px",fontSize:13,color:T.sub}}>
                      {(()=>{const [h,m]=form.tIn.split(":").map(Number);
                        const t=h*60+m+375;
                        return `${String(Math.floor(t/60)%24).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;})()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Luogo */}
            <input value={form.place||""} onChange={e=>setForm(f=>({...f,place:e.target.value}))}
              placeholder="📍 Luogo (opzionale)..."
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

            {/* Note */}
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

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,
      fontFamily:"system-ui,sans-serif",maxWidth:480,margin:"0 auto",overflow:"hidden"}}
      onClick={()=>pal&&setPal(null)}>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {screen==="cal" ? calView : settingsView}
      </div>
      <div style={{display:"flex",borderTop:`1px solid ${T.border}`,background:T.surface,flexShrink:0}}>
        {[["cal","▦","Mese"],["settings","⚙","Impostazioni"]].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setScreen(id)}
            style={{flex:1,background:"none",border:"none",padding:"8px 0",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <span style={{fontSize:18,color:screen===id?accent:T.sub}}>{icon}</span>
            <span style={{fontSize:9,fontWeight:700,color:screen===id?accent:T.sub}}>{label}</span>
          </button>
        ))}
      </div>
      {dayModal}
    </div>
  );
}

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

const NB={background:"none",border:"none",fontSize:22,cursor:"pointer",
  padding:"0 4px",lineHeight:1,flexShrink:0,color:"rgba(255,255,255,0.8)"};
