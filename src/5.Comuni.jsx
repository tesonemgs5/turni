    import { useState, useEffect, useRef, useMemo, Fragment } from "react";
// NOTA: COLORE_H24, getColorByTime e getContrastTextColor sono copiate qui
// (invece di importate da 4.Rotazione) per evitare un import circolare
// 4.Rotazione <-> 5.Comuni. Se cambi la formula del contrasto o le fasce
// orarie in 4.Rotazione, aggiorna anche qui.
const COLORE_H24 = "#64748b";
const FASCE_AUTOMATICHE_DEFAULT_LOCALE = [
  { key:"mattina",     label:"PRIMO",       color:"#f59e0b", from:360,  to:705  },
  { key:"pomeriggio",  label:"SECONDO",     color:"#f97316", from:705,  to:1035 },
  { key:"terzo_turno", label:"3° TURNO",    color:"#8b5cf6", from:1035, to:1080 },
  { key:"notte",       label:"NOTTE",       color:"#1e40af", from:1080, to:360  },
];
function minsOfLocale(tIn){
  if(!tIn) return 0;
  let s=String(tIn).trim().replace(/["']/g,"").trim();
  let m=s.match(/^(\d{1,2})[:.,](\d{1,2})/);
  if(!m){
    const digits=s.match(/^(\d{3,4})$/);
    if(digits){ const d=digits[1].padStart(4,"0"); m=[null,d.slice(0,2),d.slice(2,4)]; }
  }
  if(!m) return 0;
  const h=parseInt(m[1],10), mi=parseInt(m[2],10);
  if(!Number.isFinite(h)||!Number.isFinite(mi)) return 0;
  return h*60+mi;
}
function inRangeLocale(mins, from, to){ return from<=to ? (mins>=from && mins<to) : (mins>=from || mins<to); }
function getColorByTime(tIn, fasce=FASCE_AUTOMATICHE_DEFAULT_LOCALE){
  if(!tIn) return COLORE_H24;
  const mins=minsOfLocale(tIn);
  for(const f of fasce) if(inRangeLocale(mins, f.from, f.to)) return f.color;
  return fasce[fasce.length-1]?.color||COLORE_H24;
}
function getContrastTextColor(hex){
  if(!hex) return "#ffffff";
  try {
    const h=hex.replace("#","");
    const r=parseInt(h.substring(0,2),16), g=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16);
    const yiq = (r*299 + g*587 + b*114) / 1000;
    return yiq >= 140 ? "#0f172a" : "#ffffff";
  } catch(e){ return "#ffffff"; }
}

// ═══════════════════════════════════════════════════════════════
// uiComuni.jsx — Componenti UI condivisi: badge calendario, input
// intelligenti, subcomponenti report, color picker, modali comuni.
// Provenienza: App.jsx originale, sezioni 21-25.
// ═══════════════════════════════════════════════════════════════

// #region SEZIONE 21: CAL BADGE
// ═══════════════════════════════════════════════════════════════
export function CalBadge({ calId, calAttivo, coloreCal, testoContrasto, T, store, setStore, updateCalendar, accent, setCalId }){
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
          <ColorPickerModal T={T} cur={coloreCal} title={`Colore ${calAttivo.name||"calendario"}`}
            coloriUsati={[...new Set(store.calendars.map(cc=>cc.color).filter(Boolean))]}
            onPick={p=>{
              const newCals=JSON.parse(JSON.stringify(store.calendars));
              const idx=newCals.findIndex(c=>c.id===calId);
              if(idx>-1){ newCals[idx].color=p; setStore(s=>({...s,calendars:newCals})); updateCalendar(calId,{color:p}); }
            }}
            onClose={()=>setShowCalPal(false)}/>
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
// #endregion

// #region SEZIONE 22: SMART TIME INPUT
// ═══════════════════════════════════════════════════════════════
export function SmartTimeInput({ value, onChange, style }) {
  const [digits, setDigits] = useState(() => (value || "").replace(/\D/g, "").slice(0, 4));

  useEffect(() => {
    setDigits((value || "").replace(/\D/g, "").slice(0, 4));
  }, [value]);

  function clampAndEmit(rawDigits) {
    let d = rawDigits.replace(/\D/g, "").slice(0, 4);

    if (d.length >= 1) {
      const h0 = parseInt(d[0], 10);
      if (h0 > 2) {
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
        d = d.slice(0, 2) + "0" + d[2];
        d = d.slice(0, 4);
      }
    }

    setDigits(d);

    if (d.length === 4) {
      onChange(d.slice(0, 2) + ":" + d.slice(2, 4));
    } else if (d.length === 0) {
      onChange("");
    }
  }

  function handleChange(e) {
    const typed = e.target.value;
    const onlyDigits = typed.replace(/\D/g, "");
    clampAndEmit(onlyDigits.slice(0, 4));
  }

  function handleKeyDown(e) {
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
    e.target.select();
  }

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
// #endregion

// #region SEZIONE 23: AUTOCOMPLETE INPUT
// ═══════════════════════════════════════════════════════════════
// Componente riutilizzabile: mostra una tendina di suggerimenti cliccabili
// mentre l'utente digita, filtrando "suggestions" (array di stringhe uniche
// già raccolte dai dati storici) per corrispondenza parziale case-insensitive.
// Non altera in alcun modo la logica di onChange del chiamante: riceve lo
// stesso value/onChange che avrebbe un <input>/<textarea> normale, e si
// limita ad aggiungere la tendina sopra. Cliccando un suggerimento, invoca
// onChange con l'intero valore scelto (come se l'utente lo avesse digitato).
export function AutocompleteInput({ as="input", value, onChange, suggestions=[], style, textareaProps={}, onRemoveSuggestion, ...rest }){
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const wrapRef = useRef(null);
  const fieldRef = useRef(null);

  function aggiornaPosizione(){
    if(fieldRef.current) setRect(fieldRef.current.getBoundingClientRect());
  }

  useEffect(()=>{
    function onDocClick(e){
      if(wrapRef.current && wrapRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    return ()=>{
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, []);

  // Il campo può stare dentro un contenitore scrollabile (es. il modal del
  // giorno): mentre il menu è aperto, ricalcola la posizione a ogni scroll
  // (capture:true intercetta lo scroll di QUALSIASI antenato, non solo la
  // finestra), così il menu segue il campo invece di restare "staccato".
  useEffect(()=>{
    if(!open) return;
    aggiornaPosizione();
    window.addEventListener("scroll", aggiornaPosizione, true);
    window.addEventListener("resize", aggiornaPosizione);
    return ()=>{
      window.removeEventListener("scroll", aggiornaPosizione, true);
      window.removeEventListener("resize", aggiornaPosizione);
    };
  }, [open]);

  const rawValue = (value||"").toString();
  const righe = rawValue.split(/\r?\n/);
  const ultimaRiga = as==="textarea" ? righe[righe.length-1] : rawValue;
  const testo = ultimaRiga.trim().toLowerCase();
  const filtrati = testo.length===0 ? [] : suggestions
    .filter(s=>s && s.toLowerCase().startsWith(testo) && s.toLowerCase()!==testo)
    .slice(0, 8);

  const Tag = as==="textarea" ? "textarea" : "input";
  const menuAperto = open && filtrati.length>0 && rect;

  function scegli(s){
    if(as==="textarea"){
      const nuoveRighe = [...righe]; nuoveRighe[nuoveRighe.length-1] = s;
      onChange({ target:{ value: nuoveRighe.join("\n") } });
    } else {
      onChange({ target:{ value:s } });
    }
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{position:"relative"}}>
      <Tag
        ref={fieldRef}
        value={value}
        onChange={e=>{ onChange(e); setOpen(true); requestAnimationFrame(aggiornaPosizione); }}
        onFocus={()=>{ setOpen(true); requestAnimationFrame(aggiornaPosizione); }}
        style={style}
        {...(as==="textarea" ? textareaProps : {})}
        {...rest}
      />
      {menuAperto&&(
        <div style={{position:"fixed",top:rect.bottom+2,left:rect.left,width:rect.width,zIndex:950,
          background:"#fff",border:"1px solid #cbd5e1",borderRadius:8,
          boxShadow:"0 4px 16px rgba(0,0,0,0.15)",overflow:"hidden",maxHeight:180,overflowY:"auto"}}>
          {filtrati.map((s,i)=>(
            <div key={s+i}
              style={{display:"flex",alignItems:"center",gap:6,
                borderBottom:i<filtrati.length-1?"1px solid #f1f5f9":"none"}}>
              <div onMouseDown={ev=>{
                  ev.preventDefault();
                  scegli(s);
                }}
                style={{flex:1,padding:"9px 12px",fontSize:13,color:"#0f172a",cursor:"pointer"}}>
                {s}
              </div>
              {onRemoveSuggestion&&(
                <button onMouseDown={ev=>{
                    ev.preventDefault(); ev.stopPropagation();
                    onRemoveSuggestion(s);
                  }}
                  style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",
                    fontSize:16,padding:"6px 10px",flexShrink:0,lineHeight:1}}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// #endregion

// #region SEZIONE 24: REPORT SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════
export function FasceExpand({data, pct1, pct2, T, modelli, accent, cfg}){
  const [openFascia, setOpenFascia] = useState(null);
  const fasceManuali = cfg?.fasceManuali || {};

  function turniDiFascia(fascia){
    return Object.entries(data.perModello||{}).filter(([mid])=>{
      const m=modelli.find(x=>x.id===mid);
      if(!m) return false;
      const assegnata = fasceManuali[mid]||"";
      if(fascia==="h24") return assegnata==="";
      return assegnata===fascia;
    });
  }

  const pctH24 = data.totale>0 ? Math.round(((data.h24||0)/data.totale)*100) : 0;

  const fasce=[
    {key:"primo",  label:"1° TURNO (06:00-11:45)", color:"#f59e0b", count:data.primo||0,  pct:pct1},
    {key:"secondo",label:"2° TURNO",                color:"#f97316", count:data.secondo||0, pct:pct2},
    {key:"h24",    label:"NON ASSEGNATI",           color:COLORE_H24, count:data.h24||0,   pct:pctH24},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {fasce.map(f=>(
        <div key={f.key}>
          <div onClick={()=>setOpenFascia(openFascia===f.key?null:f.key)}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 10px",background:f.color+"22",borderRadius:openFascia===f.key?"8px 8px 0 0":8,
              border:`1px solid ${f.color}44`,cursor:"pointer"}}>
            <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>
              {f.label} {openFascia===f.key?"▲":"▼"}
            </span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:"#0f172a",background:f.color+"33",
                borderRadius:6,padding:"2px 7px"}}>{f.pct}%</span>
              <span style={{fontSize:16,fontWeight:900,color:"#0f172a"}}>{f.count}</span>
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

export function ConteggioConfigCard({T, r, cfg, data, totaleTurni, modelli, accent, fasceAutomatiche, onRename, onUpdateCfg, onGoToModelli}){
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r.label);
  const pct = totaleTurni>0 ? Math.round((data.totale/totaleTurni)*100) : 0;
  const [openSottomenu, setOpenSottomenu] = useState(null);
  const [openGruppoDentro, setOpenGruppoDentro] = useState(null); // `${sottomenuId}:${gruppoKey}`
  const [showAggiungiMenu, setShowAggiungiMenu] = useState(false);

  const sottomenu = cfg.sottomenu || [];

  function fmtData(dateKey){
    const [y,m,d] = dateKey.split("-");
    return `${d}/${m}/${y}`;
  }

  function aggiungiSottomenu(tipo){
    const id = "sm_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
    let nuovo;
    if(tipo==="collega"){
      nuovo = { id, tipo:"collega", nome:"Per collega" };
    } else if(tipo==="modello"){
      nuovo = { id, tipo:"modello", nome:"Per modello" };
    } else {
      // "libero": due gruppi di partenza modificabili, come punto di
      // partenza minimo utile — l'utente può rinominarli/aggiungerne altri.
      nuovo = { id, tipo:"libero", nome:"Nuovo sottomenu",
        gruppi:[{key:"a",label:"Gruppo A",color:"#3b82f6"},{key:"b",label:"Gruppo B",color:"#8b5cf6"}],
        assegnazioni:{} };
    }
    onUpdateCfg({...cfg, sottomenu:[...sottomenu, nuovo]});
    setShowAggiungiMenu(false);
    setOpenSottomenu(id);
  }
  function aggiornaSottomenu(id, patch){
    onUpdateCfg({...cfg, sottomenu: sottomenu.map(sm=>sm.id===id?{...sm,...patch}:sm)});
  }
  function rimuoviSottomenu(id){
    onUpdateCfg({...cfg, sottomenu: sottomenu.filter(sm=>sm.id!==id)});
    if(openSottomenu===id) setOpenSottomenu(null);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:12,color:"#0f172a",marginBottom:4}}>NOME REPORT</div>
        {editingName?(
          <div style={{display:"flex",gap:6}}>
            <input value={tmpName} onChange={e=>setTmpName(e.target.value)}
              style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"6px 10px",color:T.text,fontSize:13,outline:"none"}}/>
            <button onClick={()=>{onRename(tmpName);setEditingName(false);}}
              style={{background:accent,border:"none",borderRadius:8,color:getContrastTextColor(accent),
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

      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,color:"#0f172a",fontWeight:700}}>TOTALE TURNI</span>
          <span style={{fontSize:20,fontWeight:900,color:T.text}}>{data.totale}</span>
        </div>
        {totaleTurni>0&&(
          <div style={{height:6,background:T.s2,borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",background:accent,borderRadius:3,transition:"width 0.3s"}}/>
          </div>
        )}
      </div>

      {/* Sottomenu: 0, 1 o N, tutti a scelta dell'utente. Nessuno preimpostato.
          "Per collega" e "Per modello" sono scorciatoie predefinite (si
          auto-popolano dai dati); "Sottomenu libero" lascia definire gruppi
          a piacere con assegnazione manuale dei modelli, come 1°/2° Turno e
          APP/AUTO fanno in Turnazione. */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {sottomenu.map(sm=>{
          const isOpen = openSottomenu===sm.id;
          return (
            <div key={sm.id} style={{background:T.surface,borderRadius:10,overflow:"hidden"}}>
              <div onClick={()=>setOpenSottomenu(isOpen?null:sm.id)}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"10px 12px",cursor:"pointer"}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>{sm.nome}</span>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={e=>{e.stopPropagation();rimuoviSottomenu(sm.id);}}
                    style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:13,padding:"2px 4px"}}>🗑️</button>
                  <span style={{fontSize:12,color:T.sub}}>{isOpen?"▲":"▼"}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{padding:"0 12px 12px"}}>
                  {sm.tipo==="libero" && (
                    <div style={{marginBottom:8,display:"flex",gap:6}}>
                      <input value={sm.nome} onChange={e=>aggiornaSottomenu(sm.id,{nome:e.target.value})}
                        style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
                          borderRadius:8,padding:"6px 10px",color:T.text,fontSize:12,outline:"none"}}/>
                    </div>
                  )}

                  {/* Tipo "collega": elenco automatico di tutti i colleghi, come PER COLLEGA di Turnazione */}
                  {sm.tipo==="collega" && (
                    Object.keys(data.perCollega||{}).length===0 ? (
                      <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"10px 0"}}>Nessun collega nel periodo</div>
                    ) : Object.entries(data.perCollega).sort((a,b)=>b[1].count-a[1].count).map(([nome,info])=>{
                      const gk = sm.id+":"+nome;
                      const isOpenG = openGruppoDentro===gk;
                      return (
                        <div key={nome} style={{marginBottom:4}}>
                          <div onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                              background:T.s2,borderRadius:isOpenG?"6px 6px 0 0":6,cursor:"pointer"}}>
                            <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{nome}</span>
                            <span style={{fontSize:13,fontWeight:800,color:T.text}}>{info.count}</span>
                            <span style={{fontSize:11,color:T.sub}}>{isOpenG?"▲":"▼"}</span>
                          </div>
                          {isOpenG && (
                            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",
                              borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",flexWrap:"wrap",gap:6}}>
                              {info.dates.map(dk=>(
                                <span key={dk} style={{fontSize:11,fontWeight:600,color:T.text,
                                  background:accent+"18",border:`1px solid ${accent}44`,borderRadius:6,padding:"3px 7px"}}>
                                  {fmtData(dk)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Tipo "modello": elenco automatico dei modelli inclusi nel report, come PER MODELLO */}
                  {sm.tipo==="modello" && (
                    !data.perModello||Object.keys(data.perModello).length===0 ? (
                      <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"10px 0"}}>Nessun turno nel periodo</div>
                    ) : Object.entries(data.perModello).map(([mid,info])=>{
                      const m=modelli.find(x=>x.id===mid);
                      if(!m) return null;
                      const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                      const gk = sm.id+":"+mid;
                      const isOpenG = openGruppoDentro===gk;
                      return (
                        <div key={mid} style={{marginBottom:4}}>
                          <div onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                              background:T.s2,borderRadius:isOpenG?"6px 6px 0 0":6,cursor:"pointer"}}>
                            <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                            <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                            <span style={{fontSize:13,fontWeight:800,color:T.text}}>{info.count}</span>
                            <span style={{fontSize:11,color:T.sub}}>{isOpenG?"▲":"▼"}</span>
                          </div>
                          {isOpenG && (
                            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",
                              borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",flexWrap:"wrap",gap:6}}>
                              {info.dates.map(dk=>(
                                <span key={dk} style={{fontSize:11,fontWeight:600,color:T.text,
                                  background:c+"18",border:`1px solid ${c}44`,borderRadius:6,padding:"3px 7px"}}>
                                  {fmtData(dk)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Tipo "libero": gruppi definiti dall'utente, con assegnazione
                      manuale dei modelli a ciascun gruppo — stesso meccanismo di
                      1°/2° Turno e APP/AUTO in Turnazione, ma quanti gruppi vuole
                      l'utente, con nomi a scelta. */}
                  {sm.tipo==="libero" && (()=>{
                    const gruppi = sm.gruppi||[];
                    const assegnazioni = sm.assegnazioni||{};
                    const perGruppoSm = data.perSottomenu?.[sm.id] || {};
                    function setAssegnazione(mid, gruppoKey){
                      const next = {...assegnazioni};
                      if(next[mid]===gruppoKey) delete next[mid]; else next[mid]=gruppoKey;
                      aggiornaSottomenu(sm.id, {assegnazioni:next});
                    }
                    function aggiungiGruppo(){
                      const key = "g"+Date.now().toString(36);
                      aggiornaSottomenu(sm.id, {gruppi:[...gruppi, {key,label:"Nuovo gruppo",color:"#10b981"}]});
                    }
                    function rinominaGruppo(key, label){
                      aggiornaSottomenu(sm.id, {gruppi:gruppi.map(g=>g.key===key?{...g,label}:g)});
                    }
                    function rimuoviGruppo(key){
                      const nextAsseg = {...assegnazioni};
                      Object.keys(nextAsseg).forEach(mid=>{ if(nextAsseg[mid]===key) delete nextAsseg[mid]; });
                      aggiornaSottomenu(sm.id, {gruppi:gruppi.filter(g=>g.key!==key), assegnazioni:nextAsseg});
                    }
                    return (
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {gruppi.map(g=>{
                          const gk = sm.id+":"+g.key;
                          const isOpenG = openGruppoDentro===gk;
                          const count = Object.values(perGruppoSm[g.key]||{}).reduce((s,v)=>s+v.count,0);
                          return (
                            <div key={g.key}>
                              <div style={{display:"flex",alignItems:"center",gap:6,
                                padding:"8px 10px",background:g.color+"22",borderRadius:isOpenG?"8px 8px 0 0":8,
                                border:`1px solid ${g.color}44`}}>
                                <input value={g.label} onChange={e=>rinominaGruppo(g.key,e.target.value)}
                                  style={{flex:1,background:"transparent",border:"none",outline:"none",
                                    fontSize:13,fontWeight:800,color:"#0f172a"}}/>
                                <span style={{fontSize:14,fontWeight:900,color:"#0f172a"}}>{count}</span>
                                <span onClick={()=>rimuoviGruppo(g.key)} style={{cursor:"pointer",fontSize:12,color:"#ef4444"}}>🗑️</span>
                                <span onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)} style={{cursor:"pointer",fontSize:12,color:"#0f172a"}}>{isOpenG?"▲":"▼"}</span>
                              </div>
                              {isOpenG && (
                                <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${g.color}44`,
                                  borderTop:"none",padding:"8px 10px"}}>
                                  {modelli.length===0?(
                                    <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun modello</div>
                                  ):modelli.map(m=>{
                                    const attivo = assegnazioni[m.id]===g.key;
                                    const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                                    const info = perGruppoSm[g.key]?.[m.id];
                                    return (
                                      <div key={m.id} style={{display:"flex",flexDirection:"column",marginBottom:3}}>
                                        <div style={{display:"flex",alignItems:"center",gap:8,
                                          padding:"5px 6px",borderRadius:6,background:T.surface}}>
                                          <input type="checkbox" checked={attivo}
                                            onChange={()=>setAssegnazione(m.id,g.key)}
                                            style={{cursor:"pointer",flexShrink:0}}/>
                                          <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                                          <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                                          <span style={{fontSize:13,fontWeight:800,color:T.text}}>{info?.count||0}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={aggiungiGruppo}
                          style={{padding:"8px 0",borderRadius:8,border:`1px dashed ${T.border}`,
                            background:"transparent",color:accent,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                          + Aggiungi gruppo
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {/* + Aggiungi sottomenu: apre la scelta fra i tre tipi. Nessun limite
            al numero di sottomenu: 0 se non servono, quanti se ne vogliono
            se servono. */}
        <div style={{background:T.surface,borderRadius:10,overflow:"hidden"}}>
          <div onClick={()=>setShowAggiungiMenu(s=>!s)}
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,
              padding:"10px 12px",cursor:"pointer",color:accent,fontWeight:700,fontSize:13}}>
            + Aggiungi sottomenu {showAggiungiMenu?"▲":"▼"}
          </div>
          {showAggiungiMenu && (
            <div style={{padding:"0 12px 12px",display:"flex",flexDirection:"column",gap:6}}>
              <button onClick={()=>aggiungiSottomenu("collega")}
                style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
                  background:T.s2,color:T.text,textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Per collega <span style={{fontWeight:400,color:T.sub}}>— elenco automatico, con date</span>
              </button>
              <button onClick={()=>aggiungiSottomenu("modello")}
                style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
                  background:T.s2,color:T.text,textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Per modello <span style={{fontWeight:400,color:T.sub}}>— elenco automatico, con date</span>
              </button>
              <button onClick={()=>aggiungiSottomenu("libero")}
                style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
                  background:T.s2,color:T.text,textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Sottomenu libero <span style={{fontWeight:400,color:T.sub}}>— gruppi a scelta, assegnazione manuale</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Formatta un totale di minuti come "Xh" o "Xh Ym" (mai "NaN": minuti non
// numerici o negativi diventano 0h). Usato da OreTurnoConfigCard, che
// sostituisce la vecchia OrePerTurnoView (assumeva sempre 6h15 fisse a
// turno, sbagliato per modelli come le protrazioni con durata variabile).
export function fmtOreMin(mins){
  const raw = Number.isFinite(mins) ? Math.round(mins) : 0;
  const negativo = raw<0;
  const m = Math.abs(raw);
  const h = Math.floor(m/60), rest = m%60;
  return (negativo?"-":"")+h+"h"+(rest>0?" "+rest+"m":"");
}

// Gemella di ConteggioConfigCard: stessa struttura (nome modificabile,
// sottomenu liberi/per collega/per modello, filtro modelli), ma al posto di
// contare eventi mostra ore/minuti sommati (data viene da
// computeMinutiForReport, non computeConteggioForReport). Sostituisce la
// vecchia "Ore per turno" (OrePerTurnoView), che era fissa su 1Â°/2Â° Turno a
// 6h15 ciascuno, non rinominabile, senza sottomenu e senza modo di togliere
// le due righe 1Â°/2Â° Turno che non servono per tutti i report.
export function OreTurnoConfigCard({T, r, cfg, data, totaleMinPeriodo, modelli, accent, fasceAutomatiche, onRename, onUpdateCfg}){
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r.label);
  const pct = totaleMinPeriodo>0 ? Math.max(0, Math.min(100, Math.round((data.totaleMin/totaleMinPeriodo)*100))) : 0;
  const [openSottomenu, setOpenSottomenu] = useState(null);
  const [openGruppoDentro, setOpenGruppoDentro] = useState(null);
  const [showAggiungiMenu, setShowAggiungiMenu] = useState(false);

  const sottomenu = cfg.sottomenu || [];

  function fmtData(dateKey){
    const [y,m,d] = dateKey.split("-");
    return `${d}/${m}/${y}`;
  }

  function aggiungiSottomenu(tipo){
    const id = "sm_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
    let nuovo;
    if(tipo==="collega"){
      nuovo = { id, tipo:"collega", nome:"Per collega" };
    } else if(tipo==="modello"){
      nuovo = { id, tipo:"modello", nome:"Per modello" };
    } else {
      nuovo = { id, tipo:"libero", nome:"Nuovo sottomenu",
        gruppi:[{key:"a",label:"Gruppo A",color:"#3b82f6"},{key:"b",label:"Gruppo B",color:"#8b5cf6"}],
        assegnazioni:{} };
    }
    onUpdateCfg({...cfg, sottomenu:[...sottomenu, nuovo]});
    setShowAggiungiMenu(false);
    setOpenSottomenu(id);
  }
  function aggiornaSottomenu(id, patch){
    onUpdateCfg({...cfg, sottomenu: sottomenu.map(sm=>sm.id===id?{...sm,...patch}:sm)});
  }
  function rimuoviSottomenu(id){
    onUpdateCfg({...cfg, sottomenu: sottomenu.filter(sm=>sm.id!==id)});
    if(openSottomenu===id) setOpenSottomenu(null);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:12,color:"#0f172a",marginBottom:4}}>NOME REPORT</div>
        {editingName?(
          <div style={{display:"flex",gap:6}}>
            <input value={tmpName} onChange={e=>setTmpName(e.target.value)}
              style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"6px 10px",color:T.text,fontSize:13,outline:"none"}}/>
            <button onClick={()=>{onRename(tmpName);setEditingName(false);}}
              style={{background:accent,border:"none",borderRadius:8,color:getContrastTextColor(accent),
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

      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,color:"#0f172a",fontWeight:700}}>TOTALE ORE</span>
          <span style={{fontSize:20,fontWeight:900,color:data.totaleMin<0?"#dc2626":T.text}}>{fmtOreMin(data.totaleMin)}</span>
        </div>
        {totaleMinPeriodo>0&&(
          <div style={{height:6,background:T.s2,borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",background:accent,borderRadius:3,transition:"width 0.3s"}}/>
          </div>
        )}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {sottomenu.map(sm=>{
          const isOpen = openSottomenu===sm.id;
          return (
            <div key={sm.id} style={{background:T.surface,borderRadius:10,overflow:"hidden"}}>
              <div onClick={()=>setOpenSottomenu(isOpen?null:sm.id)}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"10px 12px",cursor:"pointer"}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>{sm.nome}</span>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={e=>{e.stopPropagation();rimuoviSottomenu(sm.id);}}
                    style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:13,padding:"2px 4px"}}>🗑️</button>
                  <span style={{fontSize:12,color:T.sub}}>{isOpen?"▲":"▼"}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{padding:"0 12px 12px"}}>
                  {sm.tipo==="libero" && (
                    <div style={{marginBottom:8,display:"flex",gap:6}}>
                      <input value={sm.nome} onChange={e=>aggiornaSottomenu(sm.id,{nome:e.target.value})}
                        style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
                          borderRadius:8,padding:"6px 10px",color:T.text,fontSize:12,outline:"none"}}/>
                    </div>
                  )}

                  {sm.tipo==="collega" && (
                    Object.keys(data.perCollega||{}).length===0 ? (
                      <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"10px 0"}}>Nessun collega nel periodo</div>
                    ) : Object.entries(data.perCollega).sort((a,b)=>b[1].minuti-a[1].minuti).map(([nome,info])=>{
                      const gk = sm.id+":"+nome;
                      const isOpenG = openGruppoDentro===gk;
                      return (
                        <div key={nome} style={{marginBottom:4}}>
                          <div onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                              background:T.s2,borderRadius:isOpenG?"6px 6px 0 0":6,cursor:"pointer"}}>
                            <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{nome}</span>
                            <span style={{fontSize:13,fontWeight:800,color:T.text}}>{fmtOreMin(info.minuti)}</span>
                            <span style={{fontSize:11,color:T.sub}}>{isOpenG?"▲":"▼"}</span>
                          </div>
                          {isOpenG && (
                            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",
                              borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",flexWrap:"wrap",gap:6}}>
                              {info.dates.map(dk=>(
                                <span key={dk} style={{fontSize:11,fontWeight:600,color:T.text,
                                  background:accent+"18",border:`1px solid ${accent}44`,borderRadius:6,padding:"3px 7px"}}>
                                  {fmtData(dk)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {sm.tipo==="modello" && (
                    !data.perModello||Object.keys(data.perModello).length===0 ? (
                      <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"10px 0"}}>Nessun turno nel periodo</div>
                    ) : Object.entries(data.perModello).map(([mid,info])=>{
                      const m=modelli.find(x=>x.id===mid);
                      if(!m) return null;
                      const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                      const gk = sm.id+":"+mid;
                      const isOpenG = openGruppoDentro===gk;
                      return (
                        <div key={mid} style={{marginBottom:4}}>
                          <div onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                              background:T.s2,borderRadius:isOpenG?"6px 6px 0 0":6,cursor:"pointer"}}>
                            <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                            <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                            <span style={{fontSize:13,fontWeight:800,color:T.text}}>{fmtOreMin(info.minuti)}</span>
                            <span style={{fontSize:11,color:T.sub}}>{isOpenG?"▲":"▼"}</span>
                          </div>
                          {isOpenG && (
                            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",
                              borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",flexWrap:"wrap",gap:6}}>
                              {info.dates.map(dk=>(
                                <span key={dk} style={{fontSize:11,fontWeight:600,color:T.text,
                                  background:c+"18",border:`1px solid ${c}44`,borderRadius:6,padding:"3px 7px"}}>
                                  {fmtData(dk)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {sm.tipo==="libero" && (()=>{
                    const gruppi = sm.gruppi||[];
                    const assegnazioni = sm.assegnazioni||{};
                    const perGruppoSm = data.perSottomenu?.[sm.id] || {};
                    function setAssegnazione(mid, gruppoKey){
                      const next = {...assegnazioni};
                      if(next[mid]===gruppoKey) delete next[mid]; else next[mid]=gruppoKey;
                      aggiornaSottomenu(sm.id, {assegnazioni:next});
                    }
                    function aggiungiGruppo(){
                      const key = "g"+Date.now().toString(36);
                      aggiornaSottomenu(sm.id, {gruppi:[...gruppi, {key,label:"Nuovo gruppo",color:"#10b981"}]});
                    }
                    function rinominaGruppo(key, label){
                      aggiornaSottomenu(sm.id, {gruppi:gruppi.map(g=>g.key===key?{...g,label}:g)});
                    }
                    function rimuoviGruppo(key){
                      const nextAsseg = {...assegnazioni};
                      Object.keys(nextAsseg).forEach(mid=>{ if(nextAsseg[mid]===key) delete nextAsseg[mid]; });
                      aggiornaSottomenu(sm.id, {gruppi:gruppi.filter(g=>g.key!==key), assegnazioni:nextAsseg});
                    }
                    return (
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {gruppi.map(g=>{
                          const gk = sm.id+":"+g.key;
                          const isOpenG = openGruppoDentro===gk;
                          const minutiGruppo = Object.values(perGruppoSm[g.key]||{}).reduce((s,v)=>s+v.minuti,0);
                          return (
                            <div key={g.key}>
                              <div style={{display:"flex",alignItems:"center",gap:6,
                                padding:"8px 10px",background:g.color+"22",borderRadius:isOpenG?"8px 8px 0 0":8,
                                border:`1px solid ${g.color}44`}}>
                                <input value={g.label} onChange={e=>rinominaGruppo(g.key,e.target.value)}
                                  style={{flex:1,background:"transparent",border:"none",outline:"none",
                                    fontSize:13,fontWeight:800,color:"#0f172a"}}/>
                                <span style={{fontSize:14,fontWeight:900,color:"#0f172a"}}>{fmtOreMin(minutiGruppo)}</span>
                                <span onClick={()=>rimuoviGruppo(g.key)} style={{cursor:"pointer",fontSize:12,color:"#ef4444"}}>🗑️</span>
                                <span onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)} style={{cursor:"pointer",fontSize:12,color:"#0f172a"}}>{isOpenG?"▲":"▼"}</span>
                              </div>
                              {isOpenG && (
                                <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${g.color}44`,
                                  borderTop:"none",padding:"8px 10px"}}>
                                  {modelli.length===0?(
                                    <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun modello</div>
                                  ):modelli.map(m=>{
                                    const attivo = assegnazioni[m.id]===g.key;
                                    const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                                    const info = perGruppoSm[g.key]?.[m.id];
                                    return (
                                      <div key={m.id} style={{display:"flex",flexDirection:"column",marginBottom:3}}>
                                        <div style={{display:"flex",alignItems:"center",gap:8,
                                          padding:"5px 6px",borderRadius:6,background:T.surface}}>
                                          <input type="checkbox" checked={attivo}
                                            onChange={()=>setAssegnazione(m.id,g.key)}
                                            style={{cursor:"pointer",flexShrink:0}}/>
                                          <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                                          <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                                          <span style={{fontSize:13,fontWeight:800,color:T.text}}>{fmtOreMin(info?.minuti||0)}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={aggiungiGruppo}
                          style={{padding:"8px 0",borderRadius:8,border:`1px dashed ${T.border}`,
                            background:"transparent",color:accent,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                          + Aggiungi gruppo
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        <div style={{background:T.surface,borderRadius:10,overflow:"hidden"}}>
          <div onClick={()=>setShowAggiungiMenu(s=>!s)}
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,
              padding:"10px 12px",cursor:"pointer",color:accent,fontWeight:700,fontSize:13}}>
            + Aggiungi sottomenu {showAggiungiMenu?"▲":"▼"}
          </div>
          {showAggiungiMenu && (
            <div style={{padding:"0 12px 12px",display:"flex",flexDirection:"column",gap:6}}>
              <button onClick={()=>aggiungiSottomenu("collega")}
                style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
                  background:T.s2,color:T.text,textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Per collega <span style={{fontWeight:400,color:T.sub}}>— elenco automatico, con date</span>
              </button>
              <button onClick={()=>aggiungiSottomenu("modello")}
                style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
                  background:T.s2,color:T.text,textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Per modello <span style={{fontWeight:400,color:T.sub}}>— elenco automatico, con date</span>
              </button>
              <button onClick={()=>aggiungiSottomenu("libero")}
                style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
                  background:T.s2,color:T.text,textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Sottomenu libero <span style={{fontWeight:400,color:T.sub}}>— gruppi a scelta, assegnazione manuale</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TurnazioneConfigCard({T, r, cfg, data, modelli, modelliOrdinati, accent, fasceAutomatiche, onRename, onUpdateCfg}){
  const modelliPerLista = modelliOrdinati || modelli;
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r.label);
  const [openModello, setOpenModello] = useState(null);
  const [openCollega, setOpenCollega] = useState(null);
  const [openGruppo, setOpenGruppo] = useState(null);
  const pct1 = data.totale>0 ? Math.round(((data.primo||0)/data.totale)*100) : 0;
  const pct2 = data.totale>0 ? Math.round(((data.secondo||0)/data.totale)*100) : 0;
  const pctApp = data.totale>0 ? Math.round(((data.app||0)/data.totale)*100) : 0;
  const pctAuto = data.totale>0 ? Math.round(((data.auto||0)/data.totale)*100) : 0;

  function fmtData(dateKey){
    const [y,m,d] = dateKey.split("-");
    return `${d}/${m}/${y}`;
  }

  const gruppiManuali = cfg.gruppiManuali || {};
  function setGruppoModello(mid, gruppo){
    const next = {...gruppiManuali};
    if(!gruppo) delete next[mid];
    else next[mid] = gruppo;
    onUpdateCfg({...cfg, gruppiManuali:next});
  }

  const GRUPPI = [
    {key:"primo",  label:"1° TURNO", color:"#f59e0b", count:data.primo||0,  pct:pct1},
    {key:"secondo",label:"2° TURNO", color:"#f97316", count:data.secondo||0,pct:pct2},
    {key:"app",    label:"APP",      color:"#3b82f6", count:data.app||0,    pct:pctApp},
    {key:"auto",   label:"AUTO",     color:"#8b5cf6", count:data.auto||0,   pct:pctAuto},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:12,color:"#0f172a",marginBottom:4}}>NOME REPORT</div>
        {editingName?(
          <div style={{display:"flex",gap:6}}>
            <input value={tmpName} onChange={e=>setTmpName(e.target.value)}
              style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"6px 10px",color:T.text,fontSize:13,outline:"none"}}/>
            <button onClick={()=>{onRename(tmpName);setEditingName(false);}}
              style={{background:accent,border:"none",borderRadius:8,color:getContrastTextColor(accent),
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

      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:"#0f172a",fontWeight:700}}>TOTALE TURNI</span>
        <span style={{fontSize:20,fontWeight:900,color:T.text}}>{data.totale}</span>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {GRUPPI.map(f=>{
          const isOpen = openGruppo===f.key;
          return (
          <div key={f.key}>
            <div onClick={()=>setOpenGruppo(isOpen?null:f.key)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",
                padding:"8px 10px",background:f.color+"22",borderRadius:isOpen?"8px 8px 0 0":8,
                border:`1px solid ${f.color}44`}}>
              <span style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>{f.label} {isOpen?"▲":"▼"}</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:700,color:"#0f172a",background:f.color+"33",
                  borderRadius:6,padding:"2px 7px"}}>{f.pct}%</span>
                <span style={{fontSize:16,fontWeight:900,color:"#0f172a"}}>{f.count}</span>
              </div>
            </div>
            {isOpen&&(
              <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${f.color}44`,
                borderTop:"none",padding:"8px 10px"}}>
                {modelliPerLista.length===0?(
                  <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun modello</div>
                ):[...modelliPerLista].sort((a,b)=>{
                  const attA = gruppiManuali[a.id] ? gruppiManuali[a.id]===f.key : (data.perGruppo?.[f.key]?.[a.id]!==undefined);
                  const attB = gruppiManuali[b.id] ? gruppiManuali[b.id]===f.key : (data.perGruppo?.[f.key]?.[b.id]!==undefined);
                  if(attA!==attB) return attA?-1:1;
                  return 0;
                }).map(m=>{
                  const attivo = gruppiManuali[m.id]
                    ? gruppiManuali[m.id]===f.key
                    : (data.perGruppo?.[f.key]?.[m.id]!==undefined);
                  const info = data.perGruppo?.[f.key]?.[m.id];
                  const c = m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                  return (
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,
                      padding:"7px 8px",borderRadius:8,marginBottom:4,background:T.surface}}>
                      <input type="checkbox" checked={attivo}
                        onChange={()=>setGruppoModello(m.id, attivo?"":f.key)}
                        style={{cursor:"pointer",flexShrink:0,width:17,height:17}}/>
                      <div style={{width:10,height:10,borderRadius:"50%",background:c,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:16,color:T.text,fontWeight:600}}>{m.titolo}</div>
                        <div style={{fontSize:13,color:T.sub}}>
                          {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.fine?` - ${m.fine}`:""}`:""}
                        </div>
                      </div>
                      <span style={{fontSize:17,fontWeight:800,color:T.text}}>{info?.count||0}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
      </div>

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

      {modelli.length>0&&data.perModello&&Object.keys(data.perModello).length>0&&(
        <div style={{background:T.surface,borderRadius:10,padding:12}}>
          <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>PER MODELLO</div>
          {Object.entries(data.perModello).map(([mid,info])=>{
            const m=modelli.find(x=>x.id===mid);
            if(!m) return null;
            const c=m.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
            const isOpen = openModello===mid;
            return (
              <div key={mid} style={{marginBottom:4}}>
                <div onClick={()=>setOpenModello(isOpen?null:mid)}
                  style={{display:"flex",alignItems:"center",gap:8,
                    padding:"6px 8px",background:T.s2,borderRadius:isOpen?"6px 6px 0 0":6,cursor:"pointer"}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                  <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{m.titolo}</span>
                  <span style={{fontSize:14,fontWeight:800,color:T.text}}>{info.count}</span>
                  <span style={{fontSize:11,color:T.sub}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&(
                  <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",
                    borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",flexWrap:"wrap",gap:6}}>
                    {info.dates.map(dk=>(
                      <span key={dk} style={{fontSize:11,fontWeight:600,color:T.text,
                        background:c+"18",border:`1px solid ${c}44`,borderRadius:6,padding:"3px 7px"}}>
                        {fmtData(dk)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PER COLLEGA: elenco di tutti i colleghi con cui si è lavorato nel
          periodo, con espansione date come "PER MODELLO" sopra. Prima questo
          blocco non esisteva affatto in Turnazione: "FILTRA PER COLLEGA" era
          solo un campo di testo senza nessun elenco sotto da consultare. */}
      {data.perCollega&&Object.keys(data.perCollega).length>0&&(
        <div style={{background:T.surface,borderRadius:10,padding:12}}>
          <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>PER COLLEGA</div>
          {Object.entries(data.perCollega).sort((a,b)=>b[1].count-a[1].count).map(([nome,info])=>{
            const isOpen = openCollega===nome;
            return (
              <div key={nome} style={{marginBottom:4}}>
                <div onClick={()=>setOpenCollega(isOpen?null:nome)}
                  style={{display:"flex",alignItems:"center",gap:8,
                    padding:"6px 8px",background:T.s2,borderRadius:isOpen?"6px 6px 0 0":6,cursor:"pointer"}}>
                  <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>{nome}</span>
                  <span style={{fontSize:14,fontWeight:800,color:T.text}}>{info.count}</span>
                  <span style={{fontSize:11,color:T.sub}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&(
                  <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",
                    borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",flexWrap:"wrap",gap:6}}>
                    {info.dates.map(dk=>(
                      <span key={dk} style={{fontSize:11,fontWeight:600,color:T.text,
                        background:accent+"18",border:`1px solid ${accent}44`,borderRadius:6,padding:"3px 7px"}}>
                        {fmtData(dk)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function IndennitaConfig({T, values, setValues, calc, onSave}){
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

export function OrePerTurnoView({T, data}){
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

export function StraordinariView({T, data, store, reportRange, modelliInclusi=[], reportCalIds=[]}){
  const {from, to} = reportRange || {from:"", to:""};

  let minPagamento = 0;
  let minRecupero  = 0;

  for(const [dateKey, calMap] of Object.entries(store?.events||{})){
    if(from && dateKey < from) continue;
    if(to   && dateKey > to  ) continue;
    for(const [cid, evts] of Object.entries(calMap)){
      if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
      for(const e of evts){
        if(modelliInclusi.length>0 && !modelliInclusi.includes(e.modelloId)) continue;
        const nota  = (e.note||"").toUpperCase();
        const auto  = (e.auto||"").toUpperCase();
        const matchProt = nota.match(/PROTRAZIONE[^+]*\+?(\d+)H(?:\s*(\d+)M)?/);
        const matchAnti = nota.match(/ANTICIPO[^0-9]*(\d+)H(?:\s*(\d+)M)?/);
        if(matchProt){
          const mins = parseInt(matchProt[1]||0)*60 + parseInt(matchProt[2]||0);
          if(auto.includes(":REC")) minRecupero  += mins;
          else                      minPagamento += mins;
        }
        if(matchAnti){
          const mins = parseInt(matchAnti[1]||0)*60 + parseInt(matchAnti[2]||0);
          minRecupero -= mins;
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

// Report dedicato allo storno PROTRAZIONE A RECUPERO / -PROTRAZIONE A
// RECUPERO: mostra il credito totale ancora disponibile e, evento per
// evento, quali date sono state usate per compensare cosa (con minuti e
// ore), esattamente come richiesto: "nella statistica deve risultare 30m
// con le date e i minuti e ore". "storno" viene giÃ  calcolato da
// computeStornoRecupero() e passato qui come prop "storno".
export function StornoRecuperoView({T, storno, store, modelli}){
  const { perEvento, creditoResiduoTotale } = storno;

  function fmtMin(m){
    if(m<=0) return "0m";
    return Math.floor(m/60)+"h"+(m%60>0?" "+(m%60)+"m":"");
  }
  function fmtData(dateKey){
    const [y,mm,d] = dateKey.split("-");
    return `${d}/${mm}/${y}`;
  }
  // Ricostruisco l'elenco date/calId per ogni evento coinvolto, leggendo
  // store.events (perEvento non porta la dateKey dell'evento stesso, solo
  // quella degli storni collegati).
  const infoDateEvento = {};
  for(const [dateKey, calMap] of Object.entries(store?.events||{})){
    for(const evts of Object.values(calMap)){
      for(const e of evts){
        if(perEvento[e.id]) infoDateEvento[e.id] = dateKey;
      }
    }
  }
  const idsRecupero = Object.keys(perEvento).filter(id=>perEvento[id].tipo==="recupero")
    .sort((a,b)=>(infoDateEvento[a]||"").localeCompare(infoDateEvento[b]||""));
  const idsConsumo = Object.keys(perEvento).filter(id=>perEvento[id].tipo==="meno_recupero")
    .sort((a,b)=>(infoDateEvento[a]||"").localeCompare(infoDateEvento[b]||""));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:12,color:T.sub,fontWeight:700}}>CREDITO RESIDUO TOTALE</span>
          <span style={{fontSize:20,fontWeight:900,color:creditoResiduoTotale>0?"#16a34a":T.text}}>
            {fmtMin(creditoResiduoTotale)}
          </span>
        </div>
      </div>

      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>PROTRAZIONE A RECUPERO (credito)</div>
        {idsRecupero.length===0?(
          <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>Nessun evento nel periodo</div>
        ):idsRecupero.map(id=>{
          const info = perEvento[id];
          return (
            <div key={id} style={{marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:info.storni.length>0?4:0}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>{fmtData(infoDateEvento[id]||"")}</span>
                <span style={{fontSize:12,color:T.sub}}>
                  {fmtMin(info.minutiTotali)} totali ·{" "}
                  <span style={{fontWeight:800,color:info.minutiResidui>0?"#16a34a":T.sub}}>
                    {fmtMin(info.minutiResidui)} residui
                  </span>
                </span>
              </div>
              {info.storni.map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,paddingLeft:8,color:T.sub}}>
                  <span>↳ usato da {fmtData(s.dateKey)}</span>
                  <span style={{fontWeight:700,color:"#dc2626"}}>{fmtMin(s.minuti)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>-PROTRAZIONE A RECUPERO (consumo)</div>
        {idsConsumo.length===0?(
          <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>Nessun evento nel periodo</div>
        ):idsConsumo.map(id=>{
          const info = perEvento[id];
          return (
            <div key={id} style={{marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:info.storni.length>0?4:0}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>{fmtData(infoDateEvento[id]||"")}</span>
                <span style={{fontSize:12,color:T.sub}}>
                  {fmtMin(info.minutiTotali)} totali ·{" "}
                  <span style={{fontWeight:800,color:info.minutiResidui>0?"#dc2626":T.sub}}>
                    {info.minutiResidui>0?fmtMin(info.minutiResidui)+" non coperti":"coperto"}
                  </span>
                </span>
              </div>
              {info.storni.map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,paddingLeft:8,color:T.sub}}>
                  <span>↳ coperto da {fmtData(s.dateKey)}</span>
                  <span style={{fontWeight:700,color:"#16a34a"}}>{fmtMin(s.minuti)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GuadagniView({T, indennita, calc}){
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
// #endregion

// #region SEZIONE 25: SHARED UI COMPONENTS (Pal, ColorRow, Sec)
// ═══════════════════════════════════════════════════════════════
function hexToRgbObj(hex){
  const h=hex.replace("#","");
  return {
    r: parseInt(h.substring(0,2),16)||0,
    g: parseInt(h.substring(2,4),16)||0,
    b: parseInt(h.substring(4,6),16)||0,
  };
}
function rgbToHex(r,g,b){
  const clamp=v=>Math.max(0,Math.min(255,Math.round(v||0)));
  return "#"+[clamp(r),clamp(g),clamp(b)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function hsvToRgb(h,s,v){
  h=h/360; s=s/100; v=v/100;
  let r,g,b;
  const i=Math.floor(h*6);
  const f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  switch(i%6){
    case 0: r=v;g=t;b=p; break;
    case 1: r=q;g=v;b=p; break;
    case 2: r=p;g=v;b=t; break;
    case 3: r=p;g=q;b=v; break;
    case 4: r=t;g=p;b=v; break;
    default:r=v;g=p;b=q;
  }
  return {r:r*255,g:g*255,b:b*255};
}
function rgbToHsv(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  const d=max-min;
  let h=0;
  if(d!==0){
    if(max===r) h=((g-b)/d)%6;
    else if(max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60; if(h<0) h+=360;
  }
  const s=max===0?0:d/max;
  return {h, s:s*100, v:max*100};
}

export function HexColorPicker({T, value, onChange}){
  const rgb0=hexToRgbObj(value||"#3b82f6");
  const hsv0=rgbToHsv(rgb0.r,rgb0.g,rgb0.b);
  const [hue, setHue] = useState(hsv0.h);
  const [sv, setSv] = useState({s:hsv0.s, v:hsv0.v});
  const [hexInput, setHexInput] = useState((value||"#3b82f6").toUpperCase());
  const svRef = useRef(null);
  const dragging = useRef(false);

  useEffect(()=>{
    const rgb=hexToRgbObj(value||"#3b82f6");
    const hsv=rgbToHsv(rgb.r,rgb.g,rgb.b);
    setHue(hsv.h); setSv({s:hsv.s, v:hsv.v});
    setHexInput((value||"#3b82f6").toUpperCase());
  }, [value]);

  function emit(newHue, newS, newV){
    const rgb=hsvToRgb(newHue,newS,newV);
    const hex=rgbToHex(rgb.r,rgb.g,rgb.b);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  }

  function handleSvPointer(e){
    const rect=svRef.current.getBoundingClientRect();
    const clientX = e.touches?e.touches[0].clientX:e.clientX;
    const clientY = e.touches?e.touches[0].clientY:e.clientY;
    let x=(clientX-rect.left)/rect.width;
    let y=(clientY-rect.top)/rect.height;
    x=Math.max(0,Math.min(1,x));
    y=Math.max(0,Math.min(1,y));
    const newS=x*100, newV=(1-y)*100;
    setSv({s:newS, v:newV});
    emit(hue, newS, newV);
  }

  const rgbNow = hsvToRgb(hue, sv.s, sv.v);
  const hueColor = rgbToHex(...Object.values(hsvToRgb(hue,100,100)));

  function updateRgbField(field, val){
    const n = Math.max(0, Math.min(255, parseInt(val)||0));
    const cur = hsvToRgb(hue, sv.s, sv.v);
    const newRgb = {r:cur.r, g:cur.g, b:cur.b, [field]:n};
    const hsv = rgbToHsv(newRgb.r, newRgb.g, newRgb.b);
    setHue(hsv.h); setSv({s:hsv.s, v:hsv.v});
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  }

  function commitHexInput(val){
    let h = val.trim();
    if(!h.startsWith("#")) h = "#"+h;
    if(/^#[0-9A-Fa-f]{6}$/.test(h)){
      const rgb = hexToRgbObj(h);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      setHue(hsv.h); setSv({s:hsv.s, v:hsv.v});
      onChange(h);
    }
    setHexInput(h.toUpperCase());
  }

  return (
    <div>
      <div ref={svRef}
        onMouseDown={e=>{dragging.current=true; handleSvPointer(e);}}
        onMouseMove={e=>{if(dragging.current) handleSvPointer(e);}}
        onMouseUp={()=>{dragging.current=false;}}
        onMouseLeave={()=>{dragging.current=false;}}
        onTouchStart={e=>{dragging.current=true; handleSvPointer(e);}}
        onTouchMove={e=>{e.preventDefault(); handleSvPointer(e);}}
        onTouchEnd={()=>{dragging.current=false;}}
        style={{
          position:"relative", width:"100%", height:140, borderRadius:10,
          background:`linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          cursor:"crosshair", touchAction:"none", marginBottom:12,
        }}>
        <div style={{
          position:"absolute",
          left:`${sv.s}%`, top:`${100-sv.v}%`,
          width:16, height:16, borderRadius:"50%",
          border:"2px solid #fff", boxShadow:"0 0 0 1px rgba(0,0,0,0.4)",
          transform:"translate(-50%,-50%)", pointerEvents:"none",
          background:rgbToHex(rgbNow.r,rgbNow.g,rgbNow.b),
        }}/>
      </div>

      <input type="range" min="0" max="360" value={hue}
        onChange={e=>{ const h=Number(e.target.value); setHue(h); emit(h, sv.s, sv.v); }}
        style={{
          width:"100%", height:14, marginBottom:14, borderRadius:7, appearance:"none",
          background:"linear-gradient(to right, #f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
          cursor:"pointer",
        }}/>

      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:36,height:36,borderRadius:8,flexShrink:0,
          background:rgbToHex(rgbNow.r,rgbNow.g,rgbNow.b),
          border:`2px solid ${T.border}`}}/>
        <input value={hexInput}
          onChange={e=>setHexInput(e.target.value.toUpperCase())}
          onBlur={e=>commitHexInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter") commitHexInput(e.target.value); }}
          placeholder="#RRGGBB"
          style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
            padding:"8px 10px",color:T.text,fontSize:14,fontWeight:700,
            outline:"none",boxSizing:"border-box",fontFamily:"monospace"}}/>
      </div>

      <div style={{display:"flex",gap:8}}>
        {[["r","R"],["g","G"],["b","B"]].map(([field,label])=>(
          <div key={field} style={{flex:1}}>
            <div style={{fontSize:9,color:T.sub,fontWeight:700,marginBottom:3,textAlign:"center"}}>{label}</div>
            <input type="number" min="0" max="255"
              value={Math.round(rgbNow[field])}
              onChange={e=>updateRgbField(field, e.target.value)}
              style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                padding:"6px 4px",color:T.text,fontSize:13,textAlign:"center",
                outline:"none",boxSizing:"border-box"}}/>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ColorPickerModal({T, cur, onPick, onClose, coloriUsati=null, title="Scegli colore"}){
  const [pos,setPos]=useState(null); // null = centrato di default
  const [previewColor,setPreviewColor]=useState(cur);
  const dragState = useRef(null);
  const boxRef = useRef(null);

  function startDrag(e){
    const clientX = e.touches?e.touches[0].clientX:e.clientX;
    const clientY = e.touches?e.touches[0].clientY:e.clientY;
    const rect = boxRef.current.getBoundingClientRect();
    dragState.current = { offX: clientX-rect.left, offY: clientY-rect.top };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", onDrag, {passive:false});
    window.addEventListener("touchend", stopDrag);
  }
  function onDrag(e){
    if(!dragState.current) return;
    if(e.touches) e.preventDefault();
    const clientX = e.touches?e.touches[0].clientX:e.clientX;
    const clientY = e.touches?e.touches[0].clientY:e.clientY;
    setPos({ left: clientX-dragState.current.offX, top: clientY-dragState.current.offY });
  }
  function stopDrag(){
    dragState.current = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("touchmove", onDrag);
    window.removeEventListener("touchend", stopDrag);
  }
  useEffect(()=>()=>stopDrag(), []);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:900,
      display:pos?"block":"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div ref={boxRef}
        style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:340,
          maxHeight:"88vh",overflowY:"auto",padding:18,
          ...(pos?{position:"fixed",left:pos.left,top:pos.top,margin:0}:{})}}
        onClick={e=>e.stopPropagation()}>
        <div onMouseDown={startDrag} onTouchStart={startDrag}
          style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,cursor:"grab",userSelect:"none"}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:previewColor,border:`2px solid ${T.border}`,flexShrink:0}}/>
          <div style={{fontSize:16,fontWeight:900,color:T.text,flex:1}}>{title}</div>
          <button onClick={onClose}
            style={{background:"none",border:"none",fontSize:18,color:T.sub,cursor:"pointer",padding:4,lineHeight:1}}>✕</button>
        </div>

        {coloriUsati&&coloriUsati.length>0&&(
          <>
            <div style={{fontSize:12,color:T.sub,fontWeight:700,marginBottom:8}}>USATI</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:16}}>
              {coloriUsati.map(p=>(
                <div key={p} onClick={()=>setPreviewColor(p)}
                  style={{width:32,height:32,borderRadius:"50%",background:p,cursor:"pointer",
                    outline:previewColor===p?`3px solid ${T.text}`:"none",outlineOffset:2,flexShrink:0}}/>
              ))}
              <div onClick={()=>{
                  const hexBox = boxRef.current?.querySelector("[data-hex-picker]");
                  hexBox?.scrollIntoView({behavior:"smooth", block:"center"});
                }}
                title="Aggiungi un colore nuovo"
                style={{width:32,height:32,borderRadius:"50%",background:T.s2,cursor:"pointer",
                  border:`1.5px dashed ${T.sub}`,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:18,fontWeight:800,color:T.sub,lineHeight:1,flexShrink:0}}>+</div>
            </div>
          </>
        )}

        <div data-hex-picker style={{fontSize:12,color:T.sub,fontWeight:700,marginBottom:8}}>Colore personalizzato (HEX)</div>
        <HexColorPicker T={T} value={previewColor} onChange={setPreviewColor}/>

        <div style={{display:"flex",gap:8,marginTop:16}}>
          <button onClick={onClose}
            style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
              color:T.text,padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:13}}>
            Annulla
          </button>
          <button onClick={()=>{onPick(previewColor);onClose();}}
            style={{flex:1,background:previewColor,border:"none",borderRadius:10,
              color:getContrastTextColor(previewColor),padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:13}}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function ColorRow({T, hex, label, sub, count, onClick, onRemove}){
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onClick}>
      <div style={{width:32,height:32,borderRadius:"50%",background:hex,
        border:`2px solid ${T.border}`,flexShrink:0,marginRight:12}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text}}>{label}</div>
        <div style={{fontSize:11,color:T.sub}}>{sub}</div>
      </div>
      <div style={{fontSize:12,fontWeight:700,color:T.sub,marginRight:8}}>
        {count} {count===1?"modello":"modelli"}
      </div>
      {onRemove&&(
        <button onClick={e=>{e.stopPropagation();onRemove();}}
          style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:2}}>×</button>
      )}
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}

// Mostra più errori accodati insieme come un'unica lista, invece di N popup
// identici in sequenza. Ogni riga è espandibile (mostra/nasconde il
// messaggio tecnico) e ha una checkbox propria per silenziare quello
// specifico contesto. Un solo bottone OK chiude tutto e applica i
// silenziamenti scelti.
export function ModaleErroriMultipli({errori, accent, onChiudi}){
  const [espansi, setEspansi] = useState(()=>new Set());
  const [daSilenziare, setDaSilenziare] = useState(()=>new Set());
  // Un contesto può comparire più volte nella coda (es. stesso errore
  // ripetuto su più righe di un ciclo non protetto): raggruppiamo per
  // contesto e contiamo le occorrenze, così la lista resta leggibile anche
  // con molte righe fallite invece di ripetere la stessa voce N volte.
  const raggruppati = [];
  const indicePerContesto = new Map();
  for(const e of errori){
    if(indicePerContesto.has(e.contesto)){
      raggruppati[indicePerContesto.get(e.contesto)].count++;
    } else {
      indicePerContesto.set(e.contesto, raggruppati.length);
      raggruppati.push({ contesto:e.contesto, messaggio:e.messaggio, count:1 });
    }
  }
  return (
    <div style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.5)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>e.stopPropagation()}>
      <div style={{background:"#fff",borderRadius:14,padding:20,maxWidth:420,width:"100%",
        maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 10px 40px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:15,fontWeight:900,color:"#000",marginBottom:4}}>
          ⚠️ {raggruppati.length} problem{raggruppati.length===1?"a":"i"} riscontrat{raggruppati.length===1?"o":"i"}
        </div>
        <div style={{fontSize:11,color:"#666",marginBottom:12}}>
          Tocca una riga per vedere il dettaglio. Tutto resta comunque salvato nel Log (Impostazioni → Log).
        </div>
        <div style={{overflowY:"auto",flex:1,marginBottom:14}}>
          {raggruppati.map((g,i)=>{
            const aperto = espansi.has(g.contesto);
            const silenziato = daSilenziare.has(g.contesto);
            return (
              <div key={g.contesto} style={{border:"1px solid #ddd",borderRadius:10,marginBottom:8,overflow:"hidden"}}>
                <div onClick={()=>setEspansi(prev=>{
                    const n=new Set(prev);
                    if(n.has(g.contesto)) n.delete(g.contesto); else n.add(g.contesto);
                    return n;
                  })}
                  style={{padding:"10px 12px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#000",flex:1}}>
                    {g.contesto}{g.count>1?` (×${g.count})`:""}
                  </div>
                  <span style={{color:"#666",fontSize:11,flexShrink:0}}>{aperto?"▲":"▼"}</span>
                </div>
                {aperto && (
                  <div style={{padding:"0 12px 12px"}}>
                    <div style={{fontSize:12,color:"#000",marginBottom:10,lineHeight:1.4}}>{g.messaggio}</div>
                    <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"#000"}}>
                      <input type="checkbox" checked={silenziato}
                        onChange={e=>setDaSilenziare(prev=>{
                          const n=new Set(prev);
                          if(e.target.checked) n.add(g.contesto); else n.delete(g.contesto);
                          return n;
                        })}
                        style={{width:16,height:16}}/>
                      Non mostrare più questo errore
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={()=>onChiudi([...daSilenziare])}
          style={{width:"100%",background:accent,border:"none",borderRadius:10,color:"#fff",
            padding:"11px 0",fontWeight:800,fontSize:14,cursor:"pointer",flexShrink:0}}>
          OK
        </button>
      </div>
    </div>
  );
}

export function SecCollapsible({label,children,T,onToggle}){
  const [open,setOpen]=useState(false);
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,
      borderRadius:12,marginBottom:14}}>
      <div onClick={()=>setOpen(o=>{ const n=!o; if(onToggle) onToggle(n); return n; })}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"12px 14px",cursor:"pointer"}}>
        <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.8px"}}>{label}</div>
        <span style={{color:T.sub,fontSize:12}}>{open?"▲":"▼"}</span>
      </div>
      {open&&<div style={{padding:"0 14px 14px"}}>{children}</div>}
    </div>
  );
}

export function Sec({label,children,T}){
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,
      borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:"0.8px",marginBottom:10}}>{label}</div>
      {children}
    </div>
  );
}
// #endregion

    
