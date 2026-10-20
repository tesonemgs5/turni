    import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { ElencoModelliTendine, PulsanteOrdineAB } from "./23-tendine-modelli";
import { GIORNI_FASCIA, fasceIndennitaDi, pulsantiFasciaDi, periodiDi } from "./24-fasce-indennita";
import { ordineAttivo, minutiInizio } from "./21-ordine";

// Ordina le voci di data.perModello:
// in ordine A (alfabetico) per nome A-Z; in ordine B (orario) per orario d'inizio crescente.
export function ordinaEntriesPerModello(entries, modelli){
  const o = ordineAttivo();
  return [...entries].sort(([a],[b])=>{
    const ma = (modelli||[]).find(x=>x.id===a);
    const mb = (modelli||[]).find(x=>x.id===b);
    if(!ma && !mb) return 0;
    if(!ma) return 1;
    if(!mb) return -1;
    if(o === "A"){
      const na = String(ma.label || ma.titolo || "").toUpperCase();
      const nb = String(mb.label || mb.titolo || "").toUpperCase();
      const diff = na.localeCompare(nb);
      if(diff !== 0) return diff;
      return (minutiInizio(ma) - minutiInizio(mb));
    } else {
      const ta = minutiInizio(ma);
      const tb = minutiInizio(mb);
      if(ta !== tb) return ta - tb;
      const na = String(ma.label || ma.titolo || "").toUpperCase();
      const nb = String(mb.label || mb.titolo || "").toUpperCase();
      return na.localeCompare(nb);
    }
  });
}
// NOTA: COLORE_H24, getColorByTime e getContrastTextColor sono copiate qui
// (invece di importate da 4.Rotazione) per evitare un import circolare
// 4.Rotazione <-> 5.Comuni. Se cambi la formula del contrasto o le fasce
// orarie in 4.Rotazione, aggiorna anche qui.
// Altezza fissa e certa della barra di navigazione in basso (bordo
// incluso). Ogni overlay/modale a schermo intero DEVE riservare questo
// spazio in basso (bottom: NAV_HEIGHT_CSS invece di inset:0), così il suo
// contenuto non passa mai sotto la nav: quello spazio non esiste per
// nessun menu/modale dell'app.
export const NAV_HEIGHT = 32;
export const NAV_HEIGHT_CSS = `${NAV_HEIGHT}px`;

// Un modello/evento è "visibile" in un calendario se quel calendario È il
// suo proprietario (calendarId, con fallback a mainCalId per i modelli
// storici senza calendarId esplicito) OPPURE se il calendario compare
// nell'array visibileAncheIn impostato dal pulsante "Visualizza". A
// differenza di "Copia" (che duplica fisicamente l'elemento su altri
// calendari, ciascuna copia indipendente), qui resta UN SOLO
// modello/evento, con un'unica fonte di verità (stesso colore/nome
// ovunque) semplicemente "taggato" come visibile anche altrove. Usare
// SOLO nei punti di VISUALIZZAZIONE (liste, filtri per calendario aperto);
// per riordino/spostamento/drag&drop resta corretto usare il confronto
// rigido sul solo proprietario, perché un elemento "vive" (si ordina, si
// sposta) in UN SOLO calendario, quello di appartenenza.
export function modelloVisibileInCalendario(m, calId, mainCalId){
  if(!m || !calId) return false;
  const proprietario = m.calendarId || mainCalId;
  if(proprietario === calId) return true;
  return Array.isArray(m.visibileAncheIn) && m.visibileAncheIn.includes(calId);
}

// Regola generale per TUTTI i campi di inserimento testo dell'app: il
// cursore deve restare esattamente a destra dell'ultimo carattere digitato,
// come in qualunque campo di testo normale — mai saltare a inizio o fine
// testo. Questo vale anche quando l'onChange trasforma il valore in
// maiuscolo (.toUpperCase()): la trasformazione non cambia la lunghezza del
// testo né la posizione dei caratteri, quindi la posizione del cursore letta
// PRIMA della trasformazione resta valida anche dopo.
// Da usare così dentro l'onChange di un <input>/<textarea> controllato:
//   onChange={e=>{ const fix=preparaFixCursore(e); setValore(e.target.value.toUpperCase()); fix(); }}
// NON usare per campi che riscrivono il testo con prefissi/formattazioni
// fisse (es. "CH "+numero): in quei casi la posizione va ricalcolata in base
// alla nuova struttura del testo, non solo ripristinata.
export function preparaFixCursore(e){
  const el = e.target;
  const start = el && typeof el.selectionStart === "number" ? el.selectionStart : null;
  const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : null;
  return function applicaFixCursore(){
    if(!el || start===null || end===null) return;
    requestAnimationFrame(()=>{
      try{ el.setSelectionRange(start, end); }catch(err){}
    });
  };
}

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
export function CalBadge({ calId, calAttivo, coloreCal, testoContrasto, T, store, setStore, updateCalendar, accent, setCalId, fasceAutomatiche=[], coloriExtra=[], coloriUsatiTutti=null }){
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
            coloriUsati={coloriUsatiTutti || [...new Set(store.calendars.map(cc=>cc.color).filter(Boolean))]}
            getNomeColore={p=>nomeDelColore(p,{fasceAutomatiche,coloriExtra})}
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
// consenti24: permette 24:00 (fine giornata), usato per l'orario di fine di un modello.
export function SmartTimeInput({ value, onChange, style, consenti24 = false }) {
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
      if (hh > (consenti24 ? 24 : 23)) hh = consenti24 ? 24 : 23;
      d = String(hh).padStart(2, "0") + d.slice(2);
      if (consenti24 && hh === 24 && d.length >= 3) d = "2400";
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
export function AutocompleteInput({ as="input", value, onChange, suggestions=[], style, textareaProps={}, onRemoveSuggestion, gestisceCursorePropria=false, ...rest }){
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

  // Quando il valore arriva già pronto (es. apertura di un evento in
  // modifica, con "collega" già compilato) l'altezza della textarea resta
  // quella di default: l'auto-resize nel suo onChange scatta solo quando
  // l'utente digita, non al mount/aggiornamento programmatico del value.
  // Risultato visibile: il testo lungo si legge "a metà", tagliato dalla
  // textarea troppo bassa. Ricalcoliamo qui ad ogni cambio di value.
  useEffect(()=>{
    if(as==="textarea" && fieldRef.current){
      fieldRef.current.style.height = "auto";
      fieldRef.current.style.height = fieldRef.current.scrollHeight + "px";
    }
  }, [as, value]);

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
        onChange={e=>{
          // Se il chiamante ricostruisce il testo da sé (es. aggiunge un
          // prefisso fisso) gestisce già lui il cursore: non dobbiamo
          // sovrascriverlo con una posizione calcolata sul vecchio valore,
          // altrimenti vince l'ultimo requestAnimationFrame schedulato e il
          // cursore finisce nel punto sbagliato.
          const fix = gestisceCursorePropria ? null : preparaFixCursore(e);
          onChange(e);
          setOpen(true);
          if(fix) fix();
          requestAnimationFrame(aggiornaPosizione);
        }}
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
                const c=m?.coloreCustom||f.color;
                return (
                  <div key={mid} style={{display:"flex",alignItems:"center",gap:8,
                    padding:"5px 6px",borderRadius:6,marginBottom:3,background:T.surface}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                    <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>
                    {m.label||m.titolo}
                    {m.tempo!=="h24"&&m.inizio&&(
                      <span style={{opacity:0.7,fontWeight:500,marginLeft:5}}>{m.inizio}→{m.fine||""}</span>
                    )}
                  </span>
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

export function ConteggioConfigCard({T, r, cfg, data, totaleTurni, modelli, modelliOrdinati, accent, fasceAutomatiche, onRename, onUpdateCfg, onGoToModelli}){
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r.label);
  const pct = totaleTurni>0 ? Math.round((data.totale/totaleTurni)*100) : 0;
  const [openSottomenu, setOpenSottomenu] = useState(null);
  const [openGruppoDentro, setOpenGruppoDentro] = useState(null); // `${sottomenuId}:${gruppoKey}`
  const [confermaEliminaGruppo, setConfermaEliminaGruppo] = useState(null); // `${sottomenuId}:${gruppoKey}`
  const [showAggiungiMenu, setShowAggiungiMenu] = useState(false);
  const [confermaEliminaSottomenu, setConfermaEliminaSottomenu] = useState(null);

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
      // Sottomenu libero: senza nome, con UN solo gruppo (senza nome) che contiene già i modelli scelti
      // nel report principale. Altri gruppi si aggiungono dentro con «+ Aggiungi gruppo».
      const gk = "g"+Date.now().toString(36);
      const scelti = (cfg.modelliInclusi||[]).filter(i=>i!=="__nessuno__");
      nuovo = { id, tipo:"libero", nome:"",
        gruppi:[{key:gk,label:"",color:"#3b82f6"}],
        assegnazioni:Object.fromEntries(scelti.map(mid=>[mid,gk])) };
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
            <input value={tmpName} onChange={e=>{const fix=preparaFixCursore(e);setTmpName(e.target.value.toUpperCase());fix();}}
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
          if(sm.tipo==="libero") return (
            <SottomenuLibero key={sm.id} T={T} accent={accent} sm={sm} perGruppoSm={data.perSottomenu?.[sm.id]||{}}
              valore={v=>v.count||0} formatta={n=>String(n)} modelli={modelliOrdinati||modelli} fasceAutomatiche={fasceAutomatiche}
              onPatch={patch=>aggiornaSottomenu(sm.id,patch)} onRemove={()=>rimuoviSottomenu(sm.id)}/>
          );
          return (
            <div key={sm.id} style={{background:T.surface,borderRadius:10,overflow:"hidden"}}>
              <div onClick={()=>setOpenSottomenu(isOpen?null:sm.id)}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"10px 12px",cursor:"pointer"}}>
                <span style={{fontSize:12,fontWeight:700,color:sm.nome?T.text:T.sub}}>{sm.nome||"SENZA NOME"}</span>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={e=>{e.stopPropagation();setConfermaEliminaSottomenu(sm.id);}}
                    style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:13,padding:"2px 4px"}}>🗑️</button>
                  <span style={{fontSize:12,color:T.sub}}>{isOpen?"▲":"▼"}</span>
                </div>
              </div>
              {confermaEliminaSottomenu===sm.id&&(
                <ConfermaEliminazione T={T} testo={`Vuoi eliminare "${sm.nome||"sottomenu senza nome"}"?`}
                  onConferma={()=>{setConfermaEliminaSottomenu(null);rimuoviSottomenu(sm.id);}}
                  onAnnulla={()=>setConfermaEliminaSottomenu(null)}/>
              )}
              {isOpen && (
                <div style={{padding:"0 12px 12px"}}>
                  {sm.tipo==="libero" && (
                    <div style={{marginBottom:8,display:"flex",gap:6}}>
                      <input value={sm.nome} placeholder="NOME (FACOLTATIVO)" onChange={e=>{const fix=preparaFixCursore(e);aggiornaSottomenu(sm.id,{nome:e.target.value.toUpperCase()});fix();}}
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
                    ) : ordinaEntriesPerModello(Object.entries(data.perModello), modelli).map(([mid,info])=>{
                      const m=modelli.find(x=>x.id===mid);
                      if(!m) return null;
                      const c=m?.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                      const gk = sm.id+":"+mid;
                      const isOpenG = openGruppoDentro===gk;
                      return (
                        <div key={mid} style={{marginBottom:4}}>
                          <div onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                              background:T.s2,borderRadius:isOpenG?"6px 6px 0 0":6,cursor:"pointer"}}>
                            <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                            <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>
                    {m.label||m.titolo}
                    {m.tempo!=="h24"&&m.inizio&&(
                      <span style={{opacity:0.7,fontWeight:500,marginLeft:5}}>{m.inizio}→{m.fine||""}</span>
                    )}
                  </span>
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
                                <input value={g.label} placeholder="NOME GRUPPO" onChange={e=>{const fix=preparaFixCursore(e);rinominaGruppo(g.key,e.target.value.toUpperCase());fix();}}
                                  style={{flex:1,background:"transparent",border:"none",outline:"none",
                                    fontSize:13,fontWeight:800,color:"#0f172a"}}/>
                                <span style={{fontSize:14,fontWeight:900,color:"#0f172a"}}>{count}</span>
                                <span onClick={()=>setConfermaEliminaGruppo(gk)} style={{cursor:"pointer",fontSize:12,color:"#ef4444"}}>🗑️</span>
                                <span onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)} style={{cursor:"pointer",fontSize:12,color:"#0f172a"}}>{isOpenG?"▲":"▼"}</span>
                              </div>
                              {confermaEliminaGruppo===gk&&(
                                <ConfermaEliminazione T={T} testo={`Vuoi eliminare il gruppo "${g.label}"?`}
                                  onConferma={()=>{setConfermaEliminaGruppo(null);rimuoviGruppo(g.key);}}
                                  onAnnulla={()=>setConfermaEliminaGruppo(null)}/>
                              )}
                              {isOpenG && (
                                <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${g.color}44`,
                                  borderTop:"none",padding:"8px 10px"}}>
                                  {(cfg.modelliInclusi?.length>0 ? (modelliOrdinati||modelli).filter(m=>cfg.modelliInclusi.includes(m.id)) : (modelliOrdinati||modelli)).length===0?(
                                    <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun modello incluso nel filtro del report</div>
                                  ):(<ElencoModelliTendine chiave={"report_"+String(g.key||"x")} modelli={(cfg.modelliInclusi?.length>0 ? (modelliOrdinati||modelli).filter(m=>cfg.modelliInclusi.includes(m.id)) : (modelliOrdinati||modelli))} cercando={false}
                                    stileContenitore={{border:"none",borderRadius:6,marginBottom:0}} renderRiga={(m)=>{
                                    const attivo = assegnazioni[m.id]===g.key;
                                    const c=m?.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                                    const info = perGruppoSm[g.key]?.[m.id];
                                    return (
                                      <div key={m.id} style={{display:"flex",flexDirection:"column",marginBottom:3}}>
                                        <div style={{display:"flex",alignItems:"center",gap:8,
                                          padding:"5px 6px",borderRadius:6,background:T.surface}}>
                                          <input type="checkbox" checked={attivo}
                                            onChange={()=>setAssegnazione(m.id,g.key)}
                                            style={{cursor:"pointer",flexShrink:0}}/>
                                          <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                                          <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>
                    {m.label||m.titolo}
                    {m.tempo!=="h24"&&m.inizio&&(
                      <span style={{opacity:0.7,fontWeight:500,marginLeft:5}}>{m.inizio}→{m.fine||""}</span>
                    )}
                  </span>
                                          <span style={{fontSize:13,fontWeight:800,color:T.text}}>{info?.count||0}</span>
                                        </div>
                                      </div>
                                    );
                                  }}/>)}
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
export function OreTurnoConfigCard({T, r, cfg, data, totaleMinPeriodo, modelli, modelliOrdinati, accent, fasceAutomatiche, onRename, onUpdateCfg}){
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r.label);
  const pct = totaleMinPeriodo>0 ? Math.max(0, Math.min(100, Math.round((data.totaleMin/totaleMinPeriodo)*100))) : 0;
  const [openSottomenu, setOpenSottomenu] = useState(null);
  const [openGruppoDentro, setOpenGruppoDentro] = useState(null);
  const [confermaEliminaGruppo, setConfermaEliminaGruppo] = useState(null); // `${sottomenuId}:${gruppoKey}`
  const [showAggiungiMenu, setShowAggiungiMenu] = useState(false);
  const [confermaEliminaSottomenu, setConfermaEliminaSottomenu] = useState(null);

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
      const gk = "g"+Date.now().toString(36);
      const scelti = (cfg.modelliInclusi||[]).filter(i=>i!=="__nessuno__");
      nuovo = { id, tipo:"libero", nome:"",
        gruppi:[{key:gk,label:"",color:"#3b82f6"}],
        assegnazioni:Object.fromEntries(scelti.map(mid=>[mid,gk])) };
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
            <input value={tmpName} onChange={e=>{const fix=preparaFixCursore(e);setTmpName(e.target.value.toUpperCase());fix();}}
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
          if(sm.tipo==="libero") return (
            <SottomenuLibero key={sm.id} T={T} accent={accent} sm={sm} perGruppoSm={data.perSottomenu?.[sm.id]||{}}
              valore={v=>v.minuti||0} formatta={fmtOreMin} modelli={modelliOrdinati||modelli} fasceAutomatiche={fasceAutomatiche}
              onPatch={patch=>aggiornaSottomenu(sm.id,patch)} onRemove={()=>rimuoviSottomenu(sm.id)}/>
          );
          return (
            <div key={sm.id} style={{background:T.surface,borderRadius:10,overflow:"hidden"}}>
              <div onClick={()=>setOpenSottomenu(isOpen?null:sm.id)}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"10px 12px",cursor:"pointer"}}>
                <span style={{fontSize:12,fontWeight:700,color:sm.nome?T.text:T.sub}}>{sm.nome||"SENZA NOME"}</span>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={e=>{e.stopPropagation();setConfermaEliminaSottomenu(sm.id);}}
                    style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:13,padding:"2px 4px"}}>🗑️</button>
                  <span style={{fontSize:12,color:T.sub}}>{isOpen?"▲":"▼"}</span>
                </div>
              </div>
              {confermaEliminaSottomenu===sm.id&&(
                <ConfermaEliminazione T={T} testo={`Vuoi eliminare "${sm.nome||"sottomenu senza nome"}"?`}
                  onConferma={()=>{setConfermaEliminaSottomenu(null);rimuoviSottomenu(sm.id);}}
                  onAnnulla={()=>setConfermaEliminaSottomenu(null)}/>
              )}
              {isOpen && (
                <div style={{padding:"0 12px 12px"}}>
                  {sm.tipo==="libero" && (
                    <div style={{marginBottom:8,display:"flex",gap:6}}>
                      <input value={sm.nome} placeholder="NOME (FACOLTATIVO)" onChange={e=>{const fix=preparaFixCursore(e);aggiornaSottomenu(sm.id,{nome:e.target.value.toUpperCase()});fix();}}
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
                    ) : ordinaEntriesPerModello(Object.entries(data.perModello), modelli).map(([mid,info])=>{
                      const m=modelli.find(x=>x.id===mid);
                      if(!m) return null;
                      const c=m?.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                      const gk = sm.id+":"+mid;
                      const isOpenG = openGruppoDentro===gk;
                      return (
                        <div key={mid} style={{marginBottom:4}}>
                          <div onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                              background:T.s2,borderRadius:isOpenG?"6px 6px 0 0":6,cursor:"pointer"}}>
                            <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                            <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>
                    {m.label||m.titolo}
                    {m.tempo!=="h24"&&m.inizio&&(
                      <span style={{opacity:0.7,fontWeight:500,marginLeft:5}}>{m.inizio}→{m.fine||""}</span>
                    )}
                  </span>
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
                                <input value={g.label} placeholder="NOME GRUPPO" onChange={e=>{const fix=preparaFixCursore(e);rinominaGruppo(g.key,e.target.value.toUpperCase());fix();}}
                                  style={{flex:1,background:"transparent",border:"none",outline:"none",
                                    fontSize:13,fontWeight:800,color:"#0f172a"}}/>
                                <span style={{fontSize:14,fontWeight:900,color:"#0f172a"}}>{fmtOreMin(minutiGruppo)}</span>
                                <span onClick={()=>setConfermaEliminaGruppo(gk)} style={{cursor:"pointer",fontSize:12,color:"#ef4444"}}>🗑️</span>
                                <span onClick={()=>setOpenGruppoDentro(isOpenG?null:gk)} style={{cursor:"pointer",fontSize:12,color:"#0f172a"}}>{isOpenG?"▲":"▼"}</span>
                              </div>
                              {confermaEliminaGruppo===gk&&(
                                <ConfermaEliminazione T={T} testo={`Vuoi eliminare il gruppo "${g.label}"?`}
                                  onConferma={()=>{setConfermaEliminaGruppo(null);rimuoviGruppo(g.key);}}
                                  onAnnulla={()=>setConfermaEliminaGruppo(null)}/>
                              )}
                              {isOpenG && (
                                <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${g.color}44`,
                                  borderTop:"none",padding:"8px 10px"}}>
                                  {(cfg.modelliInclusi?.length>0 ? (modelliOrdinati||modelli).filter(m=>cfg.modelliInclusi.includes(m.id)) : (modelliOrdinati||modelli)).length===0?(
                                    <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun modello incluso nel filtro del report</div>
                                  ):(<ElencoModelliTendine chiave={"report_"+String(g.key||"x")} modelli={(cfg.modelliInclusi?.length>0 ? (modelliOrdinati||modelli).filter(m=>cfg.modelliInclusi.includes(m.id)) : (modelliOrdinati||modelli))} cercando={false}
                                    stileContenitore={{border:"none",borderRadius:6,marginBottom:0}} renderRiga={(m)=>{
                                    const attivo = assegnazioni[m.id]===g.key;
                                    const c=m?.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                                    const info = perGruppoSm[g.key]?.[m.id];
                                    return (
                                      <div key={m.id} style={{display:"flex",flexDirection:"column",marginBottom:3}}>
                                        <div style={{display:"flex",alignItems:"center",gap:8,
                                          padding:"5px 6px",borderRadius:6,background:T.surface}}>
                                          <input type="checkbox" checked={attivo}
                                            onChange={()=>setAssegnazione(m.id,g.key)}
                                            style={{cursor:"pointer",flexShrink:0}}/>
                                          <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
                                          <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>
                    {m.label||m.titolo}
                    {m.tempo!=="h24"&&m.inizio&&(
                      <span style={{opacity:0.7,fontWeight:500,marginLeft:5}}>{m.inizio}→{m.fine||""}</span>
                    )}
                  </span>
                                          <span style={{fontSize:13,fontWeight:800,color:T.text}}>{fmtOreMin(info?.minuti||0)}</span>
                                        </div>
                                      </div>
                                    );
                                  }}/>)}
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
  // PER MODELLO e PER COLLEGA sono menu espandibili (chiusi di partenza); aperto/chiuso vale per dispositivo.
  const leggiAperto = (k)=>{ try{ return localStorage.getItem(k)==="1"; }catch(e){ return false; } };
  const [perModelloAperto, setPerModelloAperto] = useState(()=>leggiAperto("turnipm_turnazione_permodello_aperto"));
  const [perCollegaAperto, setPerCollegaAperto] = useState(()=>leggiAperto("turnipm_turnazione_percollega_aperto"));
  const alternaAperto = (k, corrente, setter)=>{ const n=!corrente; setter(n); try{ localStorage.setItem(k, n?"1":"0"); }catch(e){} };
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
  function setGruppoModello(mid, gruppo, asseKey){
    const isAppAuto = asseKey === "app" || asseKey === "auto";
    const k = isAppAuto ? (mid + "_appauto") : mid;
    const next = {...gruppiManuali};
    if(!gruppo) next[k] = "escluso";
    else next[k] = gruppo;
    onUpdateCfg({...cfg, gruppiManuali:next});
  }
  // Come sopra ma per tanti modelli insieme (casella «seleziona tutto il gruppo» accanto al nome della tendina): una sola scrittura.
  function setGruppoModelli(ids, gruppo, asseKey){
    const isAppAuto = asseKey === "app" || asseKey === "auto";
    const next = {...gruppiManuali};
    ids.forEach(mid=>{
      const k = isAppAuto ? (mid + "_appauto") : mid;
      if(!gruppo) next[k] = "escluso";
      else next[k] = gruppo;
    });
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
            <input value={tmpName} onChange={e=>{const fix=preparaFixCursore(e);setTmpName(e.target.value.toUpperCase());fix();}}
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
                ):(()=>{
                  const isAppAuto = f.key === "app" || f.key === "auto";
                  const manualKey = (m) => isAppAuto ? (m.id + "_appauto") : m.id;
                  const attivoDi = (m)=> {
                    const mk = manualKey(m);
                    if(gruppiManuali[mk]) return gruppiManuali[mk] === f.key;
                    if(isAppAuto && (gruppiManuali[m.id]==="app" || gruppiManuali[m.id]==="auto")) return gruppiManuali[m.id] === f.key;
                    return (data.perGruppo?.[f.key]?.[m.id]!==undefined);
                  };
                  const attiviIds = modelliPerLista.filter(attivoDi).map(m=>m.id);
                  // Modelli a TENDINE come nella lista Modelli (NOTTE, MATTINA, ...): accanto al nome di ogni tendina la casella
                  // «seleziona / deseleziona tutto il gruppo» e il conteggio selezionati/totale; in testa la tendina SELEZIONATI.
                  return (
                    <ElencoModelliTendine chiave={"turnazione_"+r.id+"_"+f.key} modelli={modelliPerLista} selezionati={attiviIds}
                      onSelezionaGruppo={(ms, seleziona)=>setGruppoModelli(ms.map(x=>x.id), seleziona ? f.key : "", f.key)}
                      stileContenitore={{border:"none",borderRadius:6,marginBottom:0}}
                      renderRiga={(m)=>{
                        const attivo = attivoDi(m);
                        const info = data.perGruppo?.[f.key]?.[m.id];
                        const c = m?.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
                        return (
                          <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,
                            padding:"7px 8px",borderRadius:8,marginBottom:4,background:T.surface}}>
                            <input type="checkbox" checked={attivo}
                              onChange={()=>setGruppoModello(m.id, attivo?"":f.key, f.key)}
                              style={{cursor:"pointer",flexShrink:0,width:17,height:17}}/>
                            <div style={{width:10,height:10,borderRadius:"50%",background:c,flexShrink:0}}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:16,color:T.text,fontWeight:600}}>{m.label||m.titolo}</div>
                              <div style={{fontSize:13,color:T.sub}}>
                                {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.fine?` - ${m.fine}`:""}`:""}
                              </div>
                            </div>
                            <span style={{fontSize:17,fontWeight:800,color:T.text}}>{info?.count||0}</span>
                          </div>
                        );
                      }}/>
                  );
                })()}
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
          <div onClick={()=>alternaAperto("turnipm_turnazione_permodello_aperto", perModelloAperto, setPerModelloAperto)}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontSize:10,color:T.sub,fontWeight:700,marginBottom:perModelloAperto?8:0}}>
            <span>PER MODELLO · {Object.values(data.perModello).reduce((a,v)=>a+(v.count||0),0)}</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <PulsanteOrdineAB/>
              <span style={{fontSize:12}}>{perModelloAperto?"▼":"▶"}</span>
            </div>
          </div>
          {perModelloAperto&&ordinaEntriesPerModello(Object.entries(data.perModello), modelli).map(([mid,info])=>{
            const m=modelli.find(x=>x.id===mid);
            if(!m) return null;
            const c=m?.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
            const isOpen = openModello===mid;
            return (
              <div key={mid} style={{marginBottom:4}}>
                <div onClick={()=>setOpenModello(isOpen?null:mid)}
                  style={{display:"flex",alignItems:"center",gap:8,
                    padding:"6px 8px",background:T.s2,borderRadius:isOpen?"6px 6px 0 0":6,cursor:"pointer"}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                  <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>
                    {m.label||m.titolo}
                    {m.tempo!=="h24"&&m.inizio&&(
                      <span style={{opacity:0.7,fontWeight:500,marginLeft:5}}>{m.inizio}→{m.fine||""}</span>
                    )}
                  </span>
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
          <div onClick={()=>alternaAperto("turnipm_turnazione_percollega_aperto", perCollegaAperto, setPerCollegaAperto)}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontSize:10,color:T.sub,fontWeight:700,marginBottom:perCollegaAperto?8:0}}>
            <span>PER COLLEGA · {Object.values(data.perCollega).reduce((a,v)=>a+(v.count||0),0)}</span>
            <span style={{fontSize:12}}>{perCollegaAperto?"▼":"▶"}</span>
          </div>
          {perCollegaAperto&&Object.entries(data.perCollega).sort((a,b)=>b[1].count-a[1].count).map(([nome,info])=>{
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

function fmtOreDecimali(ore){
  const totMin = Math.round((ore||0)*60);
  const h = Math.floor(totMin/60), m = totMin%60;
  return `${h}h${m>0?` ${m}m`:""}`;
}

// Indennità di servizio: le 4 fasce restano fisse in cima (compenso a
// ore, non a turni). Sotto, stesso meccanismo "+ Aggiungi sottomenu" di
// ConteggioConfigCard/OreTurnoConfigCard, con in più due sottomenu
// speciali non ripetibili: Viabilità e Ticket, ciascuno con la propria
// logica di calcolo (computeViabilita/computeTicket, passate come prop).
export function IndennitaConfig({T, r, values, setValues, calc, onSave, onRename,
  cfg, onUpdateCfg, accent, viabilitaCalc, ticketCalc, valoreTicket, setValoreTicket, onSaveValoreTicket}){
  const [editingName, setEditingName] = useState(false);
  const [tmpName, setTmpName] = useState(r?.label||"Indennità di servizio");
  const [openSottomenu, setOpenSottomenu] = useState(null);
  const [showAggiungiMenu, setShowAggiungiMenu] = useState(false);
  const [confermaEliminaSottomenu, setConfermaEliminaSottomenu] = useState(null);

  const sottomenu = cfg?.sottomenu || [];
  const haViabilita = sottomenu.some(sm=>sm.tipo==="viabilita");
  const haTicket = sottomenu.some(sm=>sm.tipo==="ticket");

  function aggiungiSottomenu(tipo){
    const id = "sm_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
    let nuovo;
    if(tipo==="collega") nuovo = { id, tipo:"collega", nome:"Per collega" };
    else if(tipo==="modello") nuovo = { id, tipo:"modello", nome:"Per modello" };
    else if(tipo==="viabilita") nuovo = { id, tipo:"viabilita", nome:"Viabilità" };
    else if(tipo==="ticket") nuovo = { id, tipo:"ticket", nome:"Ticket" };
    else nuovo = { id, tipo:"libero", nome:"Nuovo sottomenu",
      gruppi:[{key:"a",label:"Gruppo A",color:"#3b82f6"},{key:"b",label:"Gruppo B",color:"#8b5cf6"}],
      assegnazioni:{} };
    onUpdateCfg({...(cfg||{}), sottomenu:[...sottomenu, nuovo]});
    setShowAggiungiMenu(false);
    setOpenSottomenu(id);
  }
  function rimuoviSottomenu(id){
    onUpdateCfg({...(cfg||{}), sottomenu: sottomenu.filter(sm=>sm.id!==id)});
    if(openSottomenu===id) setOpenSottomenu(null);
  }

  // Fasce modificabili (nome, orario, giorni, pulsanti, % e compenso). Senza modifiche valgono le fasce standard del CCNL.
  const fasceCfg = fasceIndennitaDi(cfg);
  const pulsanti = pulsantiFasciaDi(cfg);
  const periodi = periodiDi(cfg);
  const importiFascia = (calc && calc.importi && calc.importi.perFascia) || {};
  const [percAperto, setPercAperto] = useState(null);
  const fasce = fasceCfg.map(f=>({...f, count:calc[f.key]||0}));
  const [modPulsanti, setModPulsanti] = useState(false);
  const [nuovoP, setNuovoP] = useState(null);
  const GIORNI_COD = GIORNI_FASCIA.map(g=>g[0]);
  const TUTTI_COD = [...GIORNI_COD, ...pulsanti.map(p=>p.cod)];
  const salvaFasce = (nuove)=>onUpdateCfg({...(cfg||{}), fasceIndennita:nuove});
  const patchFascia = (key, patch)=>salvaFasce(fasceCfg.map(f=>f.key===key?{...f,...patch}:f));
  const toggleCod = (key, cod)=>{
    const f = fasceCfg.find(x=>x.key===key); if(!f) return;
    patchFascia(key, {giorni: f.giorni.includes(cod) ? f.giorni.filter(c=>c!==cod) : [...f.giorni, cod]});
  };
  const aggiungiFascia = ()=>salvaFasce([...fasceCfg, {key:"f_"+Date.now().toString(36), label:"", da:"06:00", a:"22:00", giorni:[], modo:"e", perc:"", v:4}]);
  const eliminaFascia = (key)=>{ if(fasceCfg.length>1) salvaFasce(fasceCfg.filter(f=>f.key!==key)); };
  const spostaFascia = (key, dir)=>{
    const i = fasceCfg.findIndex(f=>f.key===key), j = i+dir;
    if(i<0 || j<0 || j>=fasceCfg.length) return;
    const n = [...fasceCfg]; [n[i], n[j]] = [n[j], n[i]];
    salvaFasce(n);
  };
  const ripristinaFasce = ()=>{ const {fasceIndennita:_a, pulsantiFascia:_b, ...resto} = (cfg||{}); onUpdateCfg(resto); };
  const salvaPeriodi = (nuovi)=>onUpdateCfg({...(cfg||{}), fasceIndennita:fasceCfg, periodiRetribuzione:nuovi});
  const patchPeriodo = (id, patch)=>salvaPeriodi(periodi.map(p=>p.id===id?{...p,...patch}:p));
  const eliminaPeriodo = (id)=>salvaPeriodi(periodi.filter(p=>p.id!==id));
  const aggiungiAumento = ()=>{
    const ult = periodi[periodi.length-1];
    const oggi = new Date();
    const da = `${oggi.getFullYear()}-${String(oggi.getMonth()+1).padStart(2,"0")}-01`;
    salvaPeriodi([...periodi, {id:"p_"+Date.now().toString(36), da, base:ult?ult.base:"", perc:{...((ult&&ult.perc)||{})}}]);
  };
  const aggiungiPulsante = ()=>{
    if(!nuovoP || !nuovoP.nome.trim() || !nuovoP.data) return;
    const p = {cod:"c_"+Date.now().toString(36), label:nuovoP.nome.trim().toUpperCase(), mmdd:[nuovoP.data.slice(5)], v:4};
    onUpdateCfg({...(cfg||{}), fasceIndennita:fasceCfg, pulsantiFascia:[...pulsanti, p]});
    setNuovoP(null);
  };
  const cambiaNotte = (campo, v)=>onUpdateCfg({...(cfg||{}), fasceIndennita:fasceCfg, pulsantiFascia:pulsanti.map(x=>x.cod==="not"?{...x,[campo]:v}:x)});
  const cambiaFes = (campo, val)=>onUpdateCfg({...(cfg||{}), fasceIndennita:fasceCfg, pulsantiFascia:pulsanti.map(x=>x.cod==="fes"?{...x,[campo]:val}:x)});
  const togliPulsante = (cod)=>onUpdateCfg({...(cfg||{}), pulsantiFascia:pulsanti.filter(p=>p.cod!==cod),
    fasceIndennita:fasceCfg.map(f=>({...f, giorni:f.giorni.filter(c=>c!==cod)}))});

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {r&&onRename&&(
        <div style={{background:T.surface,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:12,color:"#0f172a",marginBottom:4}}>NOME REPORT</div>
          {editingName?(
            <div style={{display:"flex",gap:6}}>
              <input value={tmpName} onChange={e=>{const fix=preparaFixCursore(e);setTmpName(e.target.value.toUpperCase());fix();}}
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
      )}

      <div style={{fontSize:10,color:T.sub,marginBottom:-4}}>Imposta il compenso per ora</div>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{fontSize:12,fontWeight:800,color:T.text}}>Retribuzione oraria e aumenti</div>
        <div style={{fontSize:10,color:T.sub}}>Ogni turno usa la retribuzione in vigore nel giorno in cui inizia; l'importo di una fascia = retribuzione × percentuale. Per un aumento retroattivo inserisci la data passata. Senza retribuzione valgono gli € fissi di ogni fascia.</div>
        {periodi.map(p=>(
          <div key={p.id} style={{border:`1px solid ${T.border}`,borderRadius:10,padding:8,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:T.sub}}>Dal</span>
              <input type="date" value={p.da} onChange={e=>patchPeriodo(p.id,{da:e.target.value})}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 6px",color:T.text,fontSize:12,outline:"none"}}/>
              <span style={{flex:1}}/>
              <span style={{fontSize:12,color:T.sub}}>€/h</span>
              <input type="number" value={p.base} placeholder="0.00" step="0.01" onChange={e=>patchPeriodo(p.id,{base:e.target.value})}
                style={{width:72,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 6px",color:T.text,fontSize:13,outline:"none",textAlign:"right"}}/>
              <span onClick={()=>setPercAperto(percAperto===p.id?null:p.id)} style={{cursor:"pointer",fontSize:11,fontWeight:800,color:accent,padding:"4px 8px",border:`1px dashed ${T.border}`,borderRadius:10}}>% {percAperto===p.id?"▲":"▼"}</span>
              <span onClick={()=>eliminaPeriodo(p.id)} style={{cursor:"pointer",fontSize:13,color:"#ef4444",padding:"2px 6px",marginLeft:10}}>🗑️</span>
            </div>
            {percAperto===p.id&&fasceCfg.map(f=>{
              const pc = parseFloat((p.perc&&p.perc[f.key]!==undefined&&p.perc[f.key]!=="") ? p.perc[f.key] : f.perc);
              const b = parseFloat(p.base);
              return (
                <div key={f.key} style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{flex:1,fontSize:12,color:T.text}}>{f.label||"Senza nome"}</span>
                  <input type="number" value={(p.perc&&p.perc[f.key])??""} placeholder={String(f.perc??"")}
                    onChange={e=>patchPeriodo(p.id,{perc:{...(p.perc||{}),[f.key]:e.target.value}})}
                    style={{width:56,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 6px",color:T.text,fontSize:13,outline:"none",textAlign:"right"}}/>
                  <span style={{fontSize:12,color:T.sub}}>%</span>
                  <span style={{fontSize:11,color:T.sub,width:70,textAlign:"right"}}>{(b>0&&!isNaN(pc))?`€ ${(b*pc/100).toFixed(2)}/h`:""}</span>
                </div>
              );
            })}
          </div>
        ))}
        <button onClick={aggiungiAumento}
          style={{padding:"8px 0",borderRadius:10,border:`1px dashed ${T.border}`,background:"transparent",color:accent,fontWeight:700,fontSize:12,cursor:"pointer"}}>
          + Aggiungi retribuzione / aumento
        </button>
      </div>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,fontWeight:800,color:T.sub}}>PULSANTI</span>
          {pulsanti.map(p=>(
            <span key={p.cod} style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:12,background:T.s2,border:`1px solid ${T.border}`,color:T.text}}>
              {p.label}{p.mmdd?` · ${p.mmdd[0].split("-").reverse().join("/")}`:""}
              {p.cod==="fes"&&(modPulsanti ? (
                <span style={{display:"inline-flex",flexWrap:"wrap",alignItems:"center",gap:4,marginLeft:6}}>
                  {[["dom","Domenica",p.dom!==false],["fest","Festività",p.fest!==false],["sab","Sabato",p.sab===true],["vigilia","Sera prima (notte)",p.vigilia!==false],["dopo","Mattina dopo (notte)",p.dopo!==false]].map(([c,lab,on])=>(
                    <span key={c} onClick={()=>cambiaFes(c,!on)}
                      style={{cursor:"pointer",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:on?accent:"transparent",color:on?getContrastTextColor(accent):T.sub,border:`1px solid ${on?accent:T.border}`}}>{lab}</span>
                  ))}
                </span>
              ) : (<span style={{marginLeft:6,fontWeight:500,color:T.sub}}>{[p.dom!==false&&"dom",p.fest!==false&&"festività",p.sab===true&&"sab",p.vigilia!==false&&"sera prima",p.dopo!==false&&"mattina dopo"].filter(Boolean).join(" · ")}</span>))}
              {p.cod==="not"&&(modPulsanti ? (
                <span style={{display:"inline-flex",alignItems:"center",gap:4,marginLeft:6}}>
                  <OraInput T={T} value={p.da||"22:00"} onChange={v=>cambiaNotte("da",v)}/>→<OraInput T={T} value={p.a||"06:00"} onChange={v=>cambiaNotte("a",v)}/>
                </span>
              ) : (<span style={{marginLeft:6,fontWeight:500,color:T.sub}}>{p.da||"22:00"}→{p.a||"06:00"}</span>))}
              {modPulsanti&&(<span onClick={()=>togliPulsante(p.cod)} style={{cursor:"pointer",marginLeft:6,color:"#ef4444",fontWeight:900}}>✕</span>)}
            </span>
          ))}
          <span onClick={()=>{setModPulsanti(v=>!v);setNuovoP(null);}} style={{cursor:"pointer",fontSize:11,fontWeight:800,color:accent,padding:"3px 8px",border:`1px dashed ${T.border}`,borderRadius:12}}>{modPulsanti?"Fatto":"✎ Modifica"}</span>
          {modPulsanti&&!nuovoP&&(<span onClick={()=>setNuovoP({nome:"",data:""})} style={{cursor:"pointer",fontSize:11,fontWeight:800,color:accent,padding:"3px 8px",border:`1px dashed ${T.border}`,borderRadius:12}}>+ Nuovo pulsante</span>)}
        </div>
        {modPulsanti&&nuovoP&&(
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6}}>
            <input value={nuovoP.nome} placeholder="NOME (es. SAN GENNARO)" onChange={e=>setNuovoP({...nuovoP,nome:e.target.value})}
              style={{flex:1,minWidth:120,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 8px",color:T.text,fontSize:12,outline:"none"}}/>
            <input type="date" value={nuovoP.data} onChange={e=>setNuovoP({...nuovoP,data:e.target.value})}
              style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 8px",color:T.text,fontSize:12,outline:"none"}}/>
            <span onClick={aggiungiPulsante} style={{cursor:"pointer",fontSize:11,fontWeight:800,color:getContrastTextColor(accent),background:accent,padding:"6px 10px",borderRadius:10}}>Aggiungi</span>
            <span style={{fontSize:10,color:T.sub,flexBasis:"100%"}}>Il pulsante personale vale per quel giorno e mese, ogni anno.</span>
          </div>
        )}
        <div style={{fontSize:10,color:T.sub}}>Ogni fascia ha le sue condizioni: «E» = devono valere tutte, «O» = ne basta una. Vale la prima fascia dall'alto che combacia (frecce ▲▼). Orari: 00:00 = inizio giornata, 24:00 = fine giornata (dopo le 23:59); In ✎ puoi configurare i pulsanti: NOTTURNO (orario) e FESTIVO (domenica, festività, sabato e, di notte, se contano la sera prima, es. sabato 22–24, e la mattina dopo, es. lunedì 00–06).</div>
      </div>
      {fasce.map(f=>{
        const on = (cod)=>f.giorni.includes(cod);
        const giorniTutti = GIORNI_COD.every(c=>on(c));
        const tuttiSel = TUTTI_COD.every(c=>on(c));
        const chip = (cod,lab)=>(
          <span key={cod} onClick={()=>toggleCod(f.key,cod)} style={{cursor:"pointer",fontSize:12,fontWeight:700,padding:"5px 10px",borderRadius:14,background:on(cod)?accent:T.s2,color:on(cod)?getContrastTextColor(accent):T.text,border:`1px solid ${on(cod)?accent:T.border}`}}>{lab}</span>
        );
        return (
        <div key={f.key} style={{background:T.surface,borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input value={f.label} placeholder="NOME FASCIA" onChange={e=>patchFascia(f.key,{label:e.target.value})}
              style={{flex:1,minWidth:0,background:"transparent",border:"none",outline:"none",fontSize:13,fontWeight:800,color:T.text}}/>
            {fasceCfg.length>1&&(
              <>
                <span onClick={()=>spostaFascia(f.key,-1)} style={{cursor:fasceCfg[0].key===f.key?"default":"pointer",fontSize:15,padding:"4px 8px",color:T.text,opacity:fasceCfg[0].key===f.key?0.25:1}}>▲</span>
                <span onClick={()=>spostaFascia(f.key,1)} style={{cursor:fasceCfg[fasceCfg.length-1].key===f.key?"default":"pointer",fontSize:15,padding:"4px 8px",color:T.text,opacity:fasceCfg[fasceCfg.length-1].key===f.key?0.25:1}}>▼</span>
                <span onClick={()=>eliminaFascia(f.key)} style={{cursor:"pointer",fontSize:13,color:"#ef4444",padding:"2px 6px",marginLeft:16}}>🗑️</span>
              </>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <OraInput T={T} value={f.da} onChange={v=>patchFascia(f.key,{da:v})}/>
            <span style={{color:T.sub}}>→</span>
            <OraInput T={T} fine value={f.a} onChange={v=>patchFascia(f.key,{a:v})}/>
            <span style={{fontSize:11,color:T.sub,flex:1,textAlign:"right"}}>{fmtOreDecimali(f.count)} nel periodo{importiFascia[f.key]>0?` · € ${importiFascia[f.key].toFixed(2)}`:""}</span>
          </div>
          {f.da===f.a&&(<div style={{fontSize:11,color:"#dc2626"}}>Inizio e fine uguali: nessuna ora conteggiata. Per tutta la giornata usa 00:00 → 24:00.</div>)}
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:800,color:T.sub,letterSpacing:0.4}}>CONDIZIONI · VALGONO</span>
            {[["e","TUTTE (E)"],["o","UNA QUALSIASI (O)"]].map(([md,lab])=>{
              const sel = (f.modo||"e")===md;
              return (<span key={md} onClick={()=>patchFascia(f.key,{modo:md})}
                style={{cursor:"pointer",fontSize:10,fontWeight:800,padding:"3px 8px",borderRadius:10,
                  background:sel?T.text:"transparent",color:sel?T.surface:T.sub,border:`1px solid ${sel?T.text:T.border}`}}>{lab}</span>);
            })}
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {pulsanti.map(p=>chip(p.cod,p.label))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{flex:1}}/>
            <input type="number" value={f.perc??""} placeholder="%" onChange={e=>patchFascia(f.key,{perc:e.target.value})}
              style={{width:52,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 6px",color:T.text,fontSize:13,outline:"none",textAlign:"right"}}/>
            <span style={{fontSize:12,color:T.sub}}>%</span>
            <span style={{fontSize:13,color:T.sub}}>€</span>
            <input type="number" value={values[f.key]||""} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}
              onBlur={onSave} placeholder="€ fisso" step="0.01"
              style={{width:70,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                padding:"6px 8px",color:T.text,fontSize:13,outline:"none",textAlign:"right"}}/>
          </div>
        </div>
        );
      })}
      <button onClick={aggiungiFascia}
        style={{padding:"9px 0",borderRadius:10,border:`1px dashed ${T.border}`,background:"transparent",color:accent,fontWeight:700,fontSize:12,cursor:"pointer"}}>
        + Aggiungi fascia
      </button>
      {cfg&&Array.isArray(cfg.fasceIndennita)&&cfg.fasceIndennita.length>0&&(
        <div onClick={ripristinaFasce} style={{textAlign:"center",fontSize:11,color:T.sub,cursor:"pointer",textDecoration:"underline",padding:"2px 0"}}>
          Ripristina le fasce standard del CCNL (i compensi restano)
        </div>
      )}
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:800,color:T.text}}>Totale stimato</span>
        <span style={{fontSize:16,fontWeight:900,color:"#22c55e"}}>
          € {((calc&&calc.importi&&calc.importi.totale)||0).toFixed(2)}
        </span>
      </div>

      {/* Sottomenu: Per collega / Per modello / Sottomenu libero (già
          esistenti altrove) più Viabilità e Ticket, specifici di questa
          card. Viabilità e Ticket non sono ripetibili: una volta
          aggiunti, spariscono dalla scelta successiva. */}
      {onUpdateCfg&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {sottomenu.map(sm=>{
            const isOpen = openSottomenu===sm.id;
            return (
              <div key={sm.id} style={{background:T.surface,borderRadius:10,overflow:"hidden"}}>
                <div onClick={()=>setOpenSottomenu(isOpen?null:sm.id)}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"10px 12px",cursor:"pointer"}}>
                  <span style={{fontSize:13,fontWeight:700,color:T.text}}>{sm.nome}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={e=>{e.stopPropagation();setConfermaEliminaSottomenu(sm.id);}}
                      style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:14}}>🗑</button>
                    <span style={{color:T.sub,fontSize:12}}>{isOpen?"▲":"▼"}</span>
                  </div>
                </div>
              {confermaEliminaSottomenu===sm.id&&(
                <ConfermaEliminazione T={T} testo={`Vuoi eliminare "${sm.nome||"sottomenu senza nome"}"?`}
                  onConferma={()=>{setConfermaEliminaSottomenu(null);rimuoviSottomenu(sm.id);}}
                  onAnnulla={()=>setConfermaEliminaSottomenu(null)}/>
              )}
                {isOpen && sm.tipo==="viabilita" && (
                  <div style={{padding:"0 12px 12px"}}>
                    <ViabilitaView T={T} calc={viabilitaCalc}/>
                  </div>
                )}
                {isOpen && sm.tipo==="ticket" && (
                  <div style={{padding:"0 12px 12px"}}>
                    <TicketConfig T={T} valoreTicket={valoreTicket} setValoreTicket={setValoreTicket}
                      calc={ticketCalc} onSave={onSaveValoreTicket}/>
                  </div>
                )}
                {isOpen && (sm.tipo==="collega"||sm.tipo==="modello"||sm.tipo==="libero") && (
                  <div style={{padding:"0 12px 12px",fontSize:12,color:T.sub}}>
                    Disponibile anche per Indennità: elenco {sm.tipo==="collega"?"per collega":sm.tipo==="modello"?"per modello":"libero"} basato sugli stessi eventi del periodo.
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
                {!haViabilita&&(
                  <button onClick={()=>aggiungiSottomenu("viabilita")}
                    style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
                      background:T.s2,color:T.text,textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700}}>
                    Viabilità <span style={{fontWeight:400,color:T.sub}}>— 15€/giorno turno 6h15/6h30/6h01, scalata per ore mancanti</span>
                  </button>
                )}
                {!haTicket&&(
                  <button onClick={()=>aggiungiSottomenu("ticket")}
                    style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
                      background:T.s2,color:T.text,textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700}}>
                    Ticket <span style={{fontWeight:400,color:T.sub}}>— un ticket per giorno con almeno 6h15 lavorate</span>
                  </button>
                )}
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
      )}
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

export function StraordinariView({T, data, store, reportRange, modelliInclusi=[], reportCalIds=[], calTurniId=null, calFuId=null}){
  const {from, to} = reportRange || {from:"", to:""};

  let minPagamento = 0;
  let minRecupero  = 0;

  for(const [dateKey, calMap] of Object.entries(store?.events||{})){
    if(from && dateKey < from) continue;
    if(to   && dateKey > to  ) continue;
    // Regola giorno TURNI/FU: se TURNI ha eventi utili quel giorno, i FU non contano.
    const fuSalta = (calTurniId && calFuId && calTurniId!==calFuId && calMap[calFuId]
      && (reportCalIds.length===0 || reportCalIds.includes(calTurniId))
      && (calMap[calTurniId]||[]).some(ev=>modelliInclusi.length===0 || modelliInclusi.includes(ev.modelloId))) ? calFuId : null;
    for(const [cid, evts] of Object.entries(calMap)){
      if(reportCalIds.length>0 && !reportCalIds.includes(cid)) continue;
      if(cid===fuSalta) continue;
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

export function GuadagniView({T, indennita, calc}){
  const tot = (calc && calc.importi) ? calc.importi.totale : Object.keys(calc||{}).reduce((s,k)=>{
    return s+(parseFloat(indennita[k])||0)*(calc[k]||0);
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

// Viabilità: 15€ per giorno con turno 6h15/6h30/6h01, scalata di 2,4€
// per ogni ora di lavoro effettivo mancante rispetto al previsto.
export function ViabilitaView({T, calc}){
  return (
    <div style={{background:T.surface,borderRadius:10,padding:12}}>
      <div style={{fontSize:11,color:T.sub,marginBottom:8}}>Viabilità (15€/giorno, -2,4€ per ora mancante)</div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:T.sub}}>Giorni con turno valido</span>
        <span style={{fontWeight:800,color:T.text}}>{calc.giorni}</span>
      </div>
      {calc.oreMancanti>0&&(
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:12,color:T.sub}}>Ore mancanti totali</span>
          <span style={{fontWeight:700,color:"#dc2626"}}>{calc.oreMancanti.toFixed(2)}h</span>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:14,fontWeight:800,color:T.text}}>Totale periodo</span>
        <span style={{fontSize:20,fontWeight:900,color:"#22c55e"}}>€ {calc.totale.toFixed(2)}</span>
      </div>
    </div>
  );
}

// Ticket: un ticket per ogni giorno con almeno 6h15 di lavoro effettivo
// (sommando i turni validi del giorno). Il valore del singolo ticket è
// impostabile dall'utente, salvato in settings come le altre indennità.
export function TicketConfig({T, valoreTicket, setValoreTicket, calc, onSave}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",
        display:"flex",alignItems:"center",gap:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:T.text}}>Valore ticket</div>
          <div style={{fontSize:11,color:T.sub}}>Per ogni giorno con almeno 6h15 lavorate</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:13,color:T.sub}}>€</span>
          <input type="number" value={valoreTicket||""} onChange={e=>setValoreTicket(e.target.value)}
            onBlur={onSave} placeholder="0.00" step="0.01"
            style={{width:70,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
              padding:"6px 8px",color:T.text,fontSize:13,outline:"none",textAlign:"right"}}/>
        </div>
      </div>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:800,color:T.text}}>Ticket maturati</span>
        <span style={{fontSize:14,fontWeight:800,color:T.text}}>{calc.giorni}</span>
      </div>
      <div style={{background:T.surface,borderRadius:10,padding:"10px 12px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:800,color:T.text}}>Totale stimato</span>
        <span style={{fontSize:16,fontWeight:900,color:"#22c55e"}}>€ {calc.totale.toFixed(2)}</span>
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

      <div style={{marginBottom:10}}>
        <div style={{fontSize:9,color:T.sub,fontWeight:700,marginBottom:3,textAlign:"center"}}>Tonalità (H)</div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <button type="button"
            onClick={()=>{ const next=(Math.round(hue)-1+360)%360; setHue(next); emit(next, sv.s, sv.v); }}
            style={{width:26,height:30,flexShrink:0,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:6,color:T.text,fontSize:16,fontWeight:700,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>−</button>
          <input type="number" min="0" max="360"
            value={Math.round(hue)}
            onChange={e=>{
              const n = Math.max(0, Math.min(360, parseInt(e.target.value)||0));
              setHue(n); emit(n, sv.s, sv.v);
            }}
            style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,borderRadius:6,
              padding:"6px 2px",color:T.text,fontSize:13,textAlign:"center",
              outline:"none",boxSizing:"border-box"}}/>
          <button type="button"
            onClick={()=>{ const next=(Math.round(hue)+1)%360; setHue(next); emit(next, sv.s, sv.v); }}
            style={{width:26,height:30,flexShrink:0,background:T.s2,border:`1px solid ${T.border}`,
              borderRadius:6,color:T.text,fontSize:16,fontWeight:700,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>+</button>
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {[["s","Saturazione"],["v","Luminosità"]].map(([field,label])=>(
          <div key={field} style={{flex:1}}>
            <div style={{fontSize:9,color:T.sub,fontWeight:700,marginBottom:3,textAlign:"center"}}>{label}</div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <button type="button"
                onClick={()=>{
                  const cur = field==="s"?sv.s:sv.v;
                  const next = Math.max(0, Math.round(cur)-1);
                  const newSv = field==="s"?{...sv,s:next}:{...sv,v:next};
                  setSv(newSv); emit(hue, newSv.s, newSv.v);
                }}
                style={{width:26,height:30,flexShrink:0,background:T.s2,border:`1px solid ${T.border}`,
                  borderRadius:6,color:T.text,fontSize:16,fontWeight:700,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>−</button>
              <input type="number" min="0" max="100"
                value={Math.round(field==="s"?sv.s:sv.v)}
                onChange={e=>{
                  const n = Math.max(0, Math.min(100, parseInt(e.target.value)||0));
                  const newSv = field==="s"?{...sv,s:n}:{...sv,v:n};
                  setSv(newSv); emit(hue, newSv.s, newSv.v);
                }}
                style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,borderRadius:6,
                  padding:"6px 2px",color:T.text,fontSize:13,textAlign:"center",
                  outline:"none",boxSizing:"border-box"}}/>
              <button type="button"
                onClick={()=>{
                  const cur = field==="s"?sv.s:sv.v;
                  const next = Math.min(100, Math.round(cur)+1);
                  const newSv = field==="s"?{...sv,s:next}:{...sv,v:next};
                  setSv(newSv); emit(hue, newSv.s, newSv.v);
                }}
                style={{width:26,height:30,flexShrink:0,background:T.s2,border:`1px solid ${T.border}`,
                  borderRadius:6,color:T.text,fontSize:16,fontWeight:700,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>+</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:36,height:36,borderRadius:8,flexShrink:0,
          background:rgbToHex(rgbNow.r,rgbNow.g,rgbNow.b),
          border:`2px solid ${T.border}`}}/>
        <input value={hexInput}
          onChange={e=>{const fix=preparaFixCursore(e);setHexInput(e.target.value.toUpperCase());fix();}}
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

// GRIGLIA STATICA E FISSA: 9 colonne. Ogni riga ha UN SOLO HUE (tonalità):
// cambiano solo saturazione e luminosità, quindi il colore non scivola mai
// verso quello vicino. Colonne 1-4: pastello (sat 35-80, lum 97-94);
// colonna 5: colore pieno (sat 100, lum 90); colonne 6-9: sempre più scuro
// (lum 84 -> 64). Distanza minima tra due righe: 15° di HUE.
// Le righe con nome semplice (Rosso, Arancio, Giallo, Blu...) sono i colori
// "assoluti"; quelle composte (Rosso-Vermiglio...) sono di transizione.
// Riga 0 = Neutri (chiaro->scuro). Ultime 2 righe = Marrone (curva propria:
// sat/lum più basse, perché il marrone è un arancio scuro).
const GRID_PALETTE = [
  ["#FAFAFA","#F5F5F5","#D9D9D9","#BFBFBF","#A3A3A3","#878787","#6E6E6E","#525252","#363636","#1C1C1C","#000000"], // Neutri
  ["#F9BDBD","#F7A1A1","#F77C7C","#F55656","#F03030","#E60000","#D60000","#C40A0A","#B21212","#A31010","#7A0C0C"], // Rosso (0°)
  ["#F9CCBD","#F7B6A1","#F79B7C","#F57D56","#F06030","#E63900","#D63600","#C4380A","#B23A12","#A33510","#7A280C"], // Vermiglio (15°)
  ["#F9DBBD","#F7CCA1","#F7BA7C","#F5A556","#F09030","#E67300","#D66B00","#C4670A","#B26212","#A35A10","#7A440C"], // Arancio (30°)
  ["#F9EBBD","#F7E2A1","#F7D87C","#F5CD56","#F0C030","#E6AC00","#D6A100","#C4960A","#B28A12","#A37E10","#7A5E0C"], // Ambra (45°)
  ["#FFFBD6","#FFF8B8","#FFF599","#FFF27A","#FFEF5C","#FFEB3C","#FFE91F","#FFE605","#F0D800","#E0CA00","#D1BC00"], // Giallo puro (54°)
  ["#F9F9BD","#F7F7A1","#F7F77C","#F5F556","#F0F030","#E6E600","#D6D600","#C4C40A","#B2B212","#A3A310","#7A7A0C"], // Giallo (60°)
  ["#DBF9BD","#CCF7A1","#BAF77C","#A5F556","#90F030","#73E600","#6BD600","#67C40A","#62B212","#5AA310","#447A0C"], // Chartreuse (90°)
  ["#CCF9BD","#B6F7A1","#9BF77C","#7DF556","#60F030","#39E600","#36D600","#38C40A","#3AB212","#35A310","#287A0C"], // Chartreuse-Verde (105°)
  ["#BDF9BD","#A1F7A1","#7CF77C","#56F556","#30F030","#00E600","#00D600","#0AC40A","#12B212","#10A310","#0C7A0C"], // Verde (120°)
  ["#BDF9DB","#A1F7CC","#7CF7BA","#56F5A5","#30F090","#00E673","#00D66B","#0AC467","#12B262","#10A35A","#0C7A44"], // Verde-Teal (150°)
  ["#BDF9F9","#A1F7F7","#7CF7F7","#56F5F5","#30F0F0","#00E6E6","#00D6D6","#0AC4C4","#12B2B2","#10A3A3","#0C7A7A"], // Teal (180°)
  ["#BDEBF9","#A1E2F7","#7CD8F7","#56CDF5","#30C0F0","#00ACE6","#00A1D6","#0A96C4","#128AB2","#107EA3","#0C5E7A"], // Teal-Azzurro (195°)
  ["#BDDBF9","#A1CCF7","#7CBAF7","#56A5F5","#3090F0","#0073E6","#006BD6","#0A67C4","#1262B2","#105AA3","#0C447A"], // Teal-Blu (210°)
  ["#BDCCF9","#A1B6F7","#7C9BF7","#567DF5","#3060F0","#0039E6","#0036D6","#0A38C4","#123AB2","#1035A3","#0C287A"], // Azzurro-Blu (225°)
  ["#BDBDF9","#A1A1F7","#7C7CF7","#5656F5","#3030F0","#0000E6","#0000D6","#0A0AC4","#1212B2","#1010A3","#0C0C7A"], // Blu (240°)
  ["#CCBDF9","#B6A1F7","#9B7CF7","#7D56F5","#6030F0","#3900E6","#3600D6","#380AC4","#3A12B2","#3510A3","#280C7A"], // Indaco (255°)
  ["#DBBDF9","#CCA1F7","#BA7CF7","#A556F5","#9030F0","#7300E6","#6B00D6","#670AC4","#6212B2","#5A10A3","#440C7A"], // Viola (270°)
  ["#EBBDF9","#E2A1F7","#D87CF7","#CD56F5","#C030F0","#AC00E6","#A100D6","#960AC4","#8A12B2","#7E10A3","#5E0C7A"], // Viola-Magenta (285°)
  ["#F9BDF9","#F7A1F7","#F77CF7","#F556F5","#F030F0","#E600E6","#D600D6","#C40AC4","#B212B2","#A310A3","#7A0C7A"], // Magenta (300°)
  ["#F9BDEB","#F7A1E2","#F77CD8","#F556CD","#F030C0","#E600AC","#D600A1","#C40A96","#B2128A","#A3107E","#7A0C5E"], // Magenta-Rosa (315°)
  ["#F9BDD6","#F7A1C5","#F77CAF","#F55698","#F03080","#E60060","#D60059","#C40A58","#B21255","#A3104E","#7A0C3A"], // Rosa (335°)
  ["#EED3C0","#E6C0A5","#D1A07D","#BD835B","#A8693D","#945426","#824417","#70370D","#612E0A","#522607","#3E1C05"], // Marrone (25°)
  ["#EEDDC0","#E6CEA5","#D1B27D","#BD995B","#A8813D","#946C26","#825B17","#704C0D","#61410A","#523607","#3E2805"], // Marrone-Ocra (38°)
];
const GRID_COLS = GRID_PALETTE[0].length;

// Pulizia una tantum: le vecchie sostituzioni salvate ("Normalizza", ora
// disattivata) non vanno più applicate alla griglia.
try{ localStorage.removeItem('gridColorOverrides'); }catch(e){}

function GridColorPicker({T, value, onChange, coloriUsati=[], aperta=true, onToggle=null}){
  const righe = GRID_PALETTE;
  const selRef = useRef(null);

  const setUsati = new Set((coloriUsati||[]).filter(Boolean).map(c=>c.toUpperCase()));

  // Cella da evidenziare: quella esatta; se il colore corrente non è in
  // griglia (es. colore vecchio), il pallino più vicino.
  let cellaSel = null;
  if(value){
    let dMin = Infinity;
    const v = hexToRgbObj(value);
    righe.forEach((riga,ri)=>riga.forEach((h,ci)=>{
      if(!h) return;
      const c = hexToRgbObj(h);
      const d = (c.r-v.r)**2 + (c.g-v.g)**2 + (c.b-v.b)**2;
      if(d<dMin){ dMin=d; cellaSel=`${ri}-${ci}`; }
    }));
  }

  // Colori già usati: ogni colore usato marca la sua cella esatta, oppure
  // (se non è in griglia) la cella più vicina.
  const celleUsate = new Set();
  [...setUsati].forEach(u=>{
    const v = hexToRgbObj(u);
    let dMin = Infinity, best = null;
    righe.forEach((riga,ri)=>riga.forEach((h,ci)=>{
      if(!h) return;
      const k = hexToRgbObj(h);
      const d = (k.r-v.r)**2 + (k.g-v.g)**2 + (k.b-v.b)**2;
      if(d<dMin){ dMin=d; best=`${ri}-${ci}`; }
    }));
    if(best) celleUsate.add(best);
  });

  const coloreCella = (hex, chiave)=>{
    const selezionato = cellaSel===chiave;
    const usato = celleUsate.has(chiave);
    const c = hexToRgbObj(hex);
    const bianco = c.r>=240 && c.g>=240 && c.b>=240;
    return (
      <button key={hex} type="button" onClick={()=>onChange(hex)}
        ref={selezionato?selRef:null}
        title={hex}
        style={{position:"relative",aspectRatio:"1",borderRadius:"50%",background:hex,cursor:"pointer",padding:0,
          minWidth:24,minHeight:24,
          border:selezionato?"3px solid #000":(bianco?"1px solid #9ca3af":"none"),
          outline:selezionato?`2px solid ${T.surface}`:"none",outlineOffset:selezionato?1:0,
          boxShadow:"none"}}>{usato&&<span style={{position:"absolute",left:"20%",right:"20%",bottom:-5,height:3,borderRadius:2,background:"#9CA3AF",pointerEvents:"none"}}/>}</button>
    );
  };

  // Porta in vista il pallino selezionato (anche quando il colore viene
  // digitato nel campo esadecimale).
  useEffect(()=>{
    try{ selRef.current?.scrollIntoView({block:"nearest", inline:"nearest"}); }catch(e){}
  }, [cellaSel]);

  return (
    <div>
      <div onClick={onToggle||undefined}
        style={{display:"flex",justifyContent:"flex-start",alignItems:"center",gap:8,marginBottom:aperta?8:0,
          cursor:onToggle?"pointer":"default",userSelect:"none",padding:onToggle?"4px 0":0}}>
        <div style={{fontSize:10,color:T.sub}}>{GRID_PALETTE.length-1} tonalità + neutri × {GRID_COLS} sfumature</div>
        {onToggle&&<span style={{color:T.sub,fontSize:13,fontWeight:800}}>{aperta?"▲":"▼"}</span>}
      </div>
      {aperta&&(
      <div>
        {righe.map((riga,ri)=>(
          <div key={ri} style={{display:"grid",gridTemplateColumns:`repeat(${GRID_COLS},1fr)`,gap:5,marginBottom:5}}>
            {riga.map((hex,ci)=> hex===null ? <div key={ci}/> : coloreCella(hex, `${ri}-${ci}`))}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// Nome leggibile di un colore: cerca prima tra le fasce automatiche
// (PRIMO/SECONDO/3° TURNO/NOTTE...), poi H24, poi tra i colori extra con
// nome assegnato manualmente nella schermata Modelli->Colori. Se il colore
// non ha ancora un nome da nessuna parte, ricade sul codice esadecimale:
// appena viene rinominato in Colori, ogni punto che chiama questa funzione
// mostra subito il nome nuovo, perché il nome non viene mai salvato altrove.
export function nomeDelColore(hex, {fasceAutomatiche=[], coloriExtra=[]}={}){
  if(!hex) return null;
  const h = String(hex).toLowerCase();
  // Il nome del gruppo e' quello salvato in Colori (indipendente dalle fasce).
  // Solo se il colore non e' ancora registrato si usa, come ripiego, il nome
  // della fascia con lo stesso colore (o H24).
  const extra = (coloriExtra||[]).find(c=>String(c.hex).toLowerCase()===h);
  if(extra&&extra.label) return extra.label;
  const fascia = (fasceAutomatiche||[]).find(f=>String(f.color).toLowerCase()===h);
  if(fascia) return fascia.label;
  if(h===String(COLORE_H24).toLowerCase()) return "H24";
  return hex.toUpperCase();
}

export function ColorPickerModal({T, cur, onPick, onClose, coloriUsati=null, title="Scegli colore", getNomeColore=null, modelliColore=null, modelliAssegnabili=null, calendariPicker=null, onRiordinaUsati=null}){
  const [pos,setPos]=useState(null); // null = centrato di default
  // modelliColore: [{id,label,sub,hex,cal}] di TUTTI i modelli → sotto la griglia compare
  // l'elenco dei modelli che usano il colore toccato. modelliAssegnabili: [{id,label,sub,cal}]
  // → sezione con spunte per associare modelli al colore scelto (onPick riceve gli id come 3° argomento).
  const [selIds,setSelIds]=useState(()=>new Set());
  const [mostraAssegna,setMostraAssegna]=useState(true);
  const [qAssegna,setQAssegna]=useState("");
  const [calEsclusi,setCalEsclusi]=useState(()=>new Set()); // calendari nascosti dal filtro
  const stessoHex=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
  const [nomeColoreInput, setNomeColoreInput] = useState("");
  // Modalità del selettore ("preciso" = riquadro 2D+hue+numeri esistente,
  // "griglia" = pallini precalcolati): PERSISTENTE e GLOBALE in localStorage,
  // condivisa da ogni ColorPickerModal dell'app. Resta sulla modalità scelta
  // finché l'utente non ne seleziona manualmente un'altra, anche aprendo un
  // color picker diverso o riavviando l'app.
  // MOSTRA_PRECISO=false: solo Griglia. Per rimettere il pannello Preciso
  // basta portarlo a true.
  const MOSTRA_PRECISO = false;
  const [modalitaPicker, setModalitaPicker] = useState(()=>{
    if(!MOSTRA_PRECISO) return 'griglia';
    try{ return localStorage.getItem('colorPickerModalita')==='griglia'?'griglia':'preciso'; }catch(e){ return 'preciso'; }
  });
  function selezionaModalita(m){
    setModalitaPicker(m);
    try{ localStorage.setItem('colorPickerModalita', m); }catch(e){}
  }
  // Griglia colori espandibile (la scelta resta memorizzata).
  const [grigliaAperta,setGrigliaAperta]=useState(()=>{ try{ return localStorage.getItem('colorPickerGrigliaAperta')!=='0'; }catch(e){ return true; } });
  function toggleGriglia(){ setGrigliaAperta(v=>{ const n=!v; try{ localStorage.setItem('colorPickerGrigliaAperta', n?'1':'0'); }catch(e){} return n; }); }

  // Riordino dei colori USATI: tieni premuto 250 ms su un colore e trascinalo.
  const MS_PRESSIONE_RIORDINO = 250;
  const [ordineUsati,setOrdineUsati]=useState(null);   // ordine provvisorio durante il trascinamento
  const [trascinato,setTrascinato]=useState(null);     // colore che si sta trascinando
  const [fantasma,setFantasma]=useState(null);         // posizione del dito
  const usatiRefs = useRef({});
  const pressRef = useRef(null);
  const dragAttivo = useRef(false);
  const ordineRef = useRef(null);
  const originaleRef = useRef([]);
  const trascinatoRef = useRef(null);
  const clickBloccato = useRef(false);
  const onRiordinaRef = useRef(null);
  onRiordinaRef.current = onRiordinaUsati;
  function annullaPressione(){ if(pressRef.current){ clearTimeout(pressRef.current.timer); pressRef.current=null; } }
  function inizioPressione(e, hex){
    if(!onRiordinaUsati || (e.pointerType==="mouse" && e.button!==0)) return;
    annullaPressione();
    const x=e.clientX, y=e.clientY;
    const lista=[...(coloriUsati||[])];
    pressRef.current = { x, y, timer: setTimeout(()=>{
      pressRef.current = null;
      dragAttivo.current = true; clickBloccato.current = true;
      trascinatoRef.current = hex; originaleRef.current = lista; ordineRef.current = [...lista];
      setOrdineUsati([...lista]); setTrascinato(hex); setFantasma({x,y});
      try{ if(navigator.vibrate) navigator.vibrate(20); }catch(_){}
    }, MS_PRESSIONE_RIORDINO) };
  }
  useEffect(()=>{
    function muovi(e){
      if(!dragAttivo.current){
        const p = pressRef.current;
        // dito spostato prima dei 250 ms: e' uno scorrimento, non un riordino
        if(p && Math.hypot(e.clientX-p.x, e.clientY-p.y) > 10) annullaPressione();
        return;
      }
      setFantasma({x:e.clientX, y:e.clientY});
      const ord = ordineRef.current || [];
      let bersaglio=null, dMin=Infinity;
      ord.forEach(h=>{
        const el = usatiRefs.current[h]; if(!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.hypot(e.clientX-(r.left+r.width/2), e.clientY-(r.top+r.height/2));
        if(d<dMin){ dMin=d; bersaglio=h; }
      });
      const dragH = trascinatoRef.current;
      if(bersaglio && bersaglio!==dragH && dMin<70){
        const da = ord.indexOf(dragH), a = ord.indexOf(bersaglio);
        if(da>=0 && a>=0){ const n=[...ord]; n.splice(da,1); n.splice(a,0,dragH); ordineRef.current=n; setOrdineUsati(n); }
      }
    }
    function fine(){
      annullaPressione();
      if(!dragAttivo.current) return;
      dragAttivo.current = false;
      const nuovo = ordineRef.current, orig = originaleRef.current || [];
      setTrascinato(null); setFantasma(null);
      if(nuovo && onRiordinaRef.current && nuovo.join("|")!==orig.join("|")) onRiordinaRef.current(nuovo);
      setOrdineUsati(null);
      setTimeout(()=>{ clickBloccato.current=false; }, 350);
    }
    function blocca(e){ if(dragAttivo.current && e.cancelable) e.preventDefault(); } // niente scorrimento mentre si trascina
    window.addEventListener("pointermove", muovi);
    window.addEventListener("pointerup", fine);
    window.addEventListener("pointercancel", fine);
    window.addEventListener("touchmove", blocca, {passive:false});
    return ()=>{
      window.removeEventListener("pointermove", muovi);
      window.removeEventListener("pointerup", fine);
      window.removeEventListener("pointercancel", fine);
      window.removeEventListener("touchmove", blocca);
      annullaPressione();
    };
  }, []);

  const [previewColor,setPreviewColor]=useState(cur);
  // Modelli che hanno GIÀ il colore toccato: partono selezionati e restano in cima.
  const giaAssegnati = Array.isArray(modelliAssegnabili)
    ? new Set(modelliAssegnabili.filter(m=>stessoHex(m.hex,previewColor)).map(m=>m.id))
    : new Set();
  const giaKey = Array.from(giaAssegnati).join("|");
  useEffect(()=>{ if(Array.isArray(modelliAssegnabili)) setSelIds(new Set(giaAssegnati)); }, [previewColor, giaKey]);
  // Testo del campo esadecimale: modificabile a mano; se il codice è valido
  // (6 cifre) il colore e il pallino in griglia si aggiornano subito.
  const [hexTesto,setHexTesto]=useState((cur||"").toUpperCase());
  useEffect(()=>{ setHexTesto((previewColor||"").toUpperCase()); }, [previewColor]);
  function digitaHex(v){
    const t = String(v||"").toUpperCase().replace(/[^#0-9A-F]/g,"");
    setHexTesto(t);
    const norm = t.startsWith("#")?t:"#"+t;
    if(/^#[0-9A-F]{6}$/.test(norm)) setPreviewColor(norm);
  }
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:900,boxSizing:"border-box",
      display:pos?"block":"flex",alignItems:"center",justifyContent:"center",
      padding:"16px 16px calc(84px + env(safe-area-inset-bottom, 0px))"}}
      onClick={()=>{ if(clickBloccato.current) return; onClose(); }}>
      {trascinato&&fantasma&&(
        <div style={{position:"fixed",left:fantasma.x-24,top:fantasma.y-24,width:48,height:48,borderRadius:"50%",
          background:trascinato,border:"3px solid #fff",boxShadow:"0 6px 18px rgba(0,0,0,0.45)",
          pointerEvents:"none",zIndex:100003}}/>
      )}
      <div ref={boxRef}
        style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:340,
          maxHeight:"calc(100vh - 100px - env(safe-area-inset-bottom, 0px))",display:"flex",flexDirection:"column",
          overflow:"hidden",padding:14,
          ...(pos?{position:"fixed",left:pos.left,top:pos.top,margin:0}:{})}}
        onClick={e=>e.stopPropagation()}>
        <div onMouseDown={startDrag} onTouchStart={startDrag}
          style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,cursor:"grab",userSelect:"none",flexShrink:0}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:previewColor,border:`2px solid ${T.border}`,flexShrink:0}}/>
          <div style={{fontSize:16,fontWeight:900,color:T.text,flex:1}}>{title}</div>
          <button onClick={onClose}
            style={{background:"none",border:"none",fontSize:18,color:T.sub,cursor:"pointer",padding:4,lineHeight:1}}>✕</button>
        </div>

        <div style={{flex:1,minHeight:0,overflowY:"auto",paddingRight:2}}>
        {coloriUsati&&coloriUsati.length>0&&(
          <>
            <div style={{fontSize:12,color:T.sub,fontWeight:700,marginBottom:onRiordinaUsati?2:8}}>USATI</div>
            {onRiordinaUsati&&<div style={{fontSize:10,color:T.sub,marginBottom:8}}>Tieni premuto un colore per spostarlo</div>}
            <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:16}}>
              {(ordineUsati||coloriUsati).map(p=>(
                <div key={p} ref={el=>{ if(el) usatiRefs.current[p]=el; }}
                  onPointerDown={e=>inizioPressione(e,p)}
                  onClick={()=>{ if(clickBloccato.current) return; setPreviewColor(p); }}
                  onContextMenu={e=>{ if(onRiordinaUsati) e.preventDefault(); }}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:onRiordinaUsati?"grab":"pointer",width:52,
                    userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none",
                    opacity:trascinato===p?0.3:1,transition:"opacity 0.1s"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:p,
                    outline:previewColor===p?`3px solid ${T.text}`:"none",outlineOffset:2,flexShrink:0}}/>
                  {getNomeColore&&(
                    <div style={{fontSize:9,color:T.sub,fontWeight:700,textAlign:"center",
                      maxWidth:52,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {getNomeColore(p)}
                    </div>
                  )}
                </div>
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

        {MOSTRA_PRECISO&&(
          <div style={{display:"flex",gap:6,marginBottom:14,background:T.s2,borderRadius:10,padding:4}}>
            <button type="button" onClick={()=>selezionaModalita('preciso')}
              style={{flex:1,border:"none",borderRadius:8,padding:"7px 0",cursor:"pointer",
                fontWeight:800,fontSize:12,
                background:modalitaPicker==='preciso'?T.surface:"transparent",
                color:modalitaPicker==='preciso'?T.text:T.sub}}>
              Preciso
            </button>
            <button type="button" onClick={()=>selezionaModalita('griglia')}
              style={{flex:1,border:"none",borderRadius:8,padding:"7px 0",cursor:"pointer",
                fontWeight:800,fontSize:12,
                background:modalitaPicker==='griglia'?T.surface:"transparent",
                color:modalitaPicker==='griglia'?T.text:T.sub}}>
              Griglia
            </button>
          </div>
        )}

        {modalitaPicker==='preciso'?(
          <>
            <div data-hex-picker style={{fontSize:12,color:T.sub,fontWeight:700,marginBottom:8}}>Colore personalizzato (HEX)</div>
            <HexColorPicker T={T} value={previewColor} onChange={setPreviewColor}/>
          </>
        ):(
          <div data-hex-picker>
            <GridColorPicker T={T} value={previewColor} onChange={setPreviewColor} coloriUsati={coloriUsati||[]} aperta={grigliaAperta} onToggle={toggleGriglia}/>
          </div>
        )}

        {Array.isArray(modelliAssegnabili)&&modelliAssegnabili.length>0&&(
          <div style={{marginTop:12,borderTop:`1px solid ${T.border}`,paddingTop:8}}>
            <div onClick={()=>setMostraAssegna(v=>!v)}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",marginBottom:6}}>
              <div style={{fontSize:11,fontWeight:800,color:T.sub}}>
                MODELLI DI QUESTO COLORE{selIds.size>0?` (${selIds.size})`:""}
              </div>
              <span style={{color:T.sub,fontSize:12}}>{mostraAssegna?"▲":"▼"}</span>
            </div>
            {mostraAssegna&&(()=>{
              const cals = Array.isArray(calendariPicker)?calendariPicker:[];
              const visibili = modelliAssegnabili.filter(m=>
                !calEsclusi.has(m.calId) && (qAssegna.trim()==="" || (m.m ? modelloCorrispondeRicerca(m.m,qAssegna) : String(m.label||"").toLowerCase().includes(qAssegna.trim().toLowerCase()))));
              const gruppi = [];
              // Ordine della lista Modelli > Turni, ma in cima i modelli che hanno GIÀ il colore selezionato (stabile: non si muovono toccando le spunte).
              const visibiliOrd = [...visibili.filter(m=>giaAssegnati.has(m.id)), ...visibili.filter(m=>!giaAssegnati.has(m.id))]; // assegnati in cima (voluto), poi gli altri, ciascuna parte nell'ordine della lista Modelli
              visibiliOrd.forEach(m=>{
                let g = gruppi.find(x=>x.calId===m.calId);
                if(!g){ g={calId:m.calId, nome:m.cal||"Senza calendario", colore:(cals.find(c=>c.id===m.calId)||{}).color||"#94a3b8", lista:[]}; gruppi.push(g); }
                g.lista.push(m);
              });
              const riga = (m)=>{
                const sel=selIds.has(m.id);
                return (
                  <div key={m.id}
                    onClick={()=>setSelIds(prev=>{const n=new Set(prev); if(n.has(m.id)) n.delete(m.id); else n.add(m.id); return n;})}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"6px 2px",cursor:"pointer",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{width:18,height:18,borderRadius:5,flexShrink:0,
                      border:`2px solid ${sel?T.text:T.border}`,background:sel?previewColor:"transparent",
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {sel&&<span style={{color:getContrastTextColor(previewColor),fontSize:12,fontWeight:900}}>✓</span>}
                    </div>
                    <div style={{width:10,height:10,borderRadius:"50%",background:m.hex||T.border,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.label}</div>
                      {m.orario&&<div style={{fontSize:10,color:T.sub}}>{m.orario}</div>}
                    </div>
                  </div>
                );
              };
              return (
                <>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
                    <input value={qAssegna} onChange={e=>setQAssegna(e.target.value)}
                      placeholder="🔎 Cerca modello o orario..."
                      style={{flex:1,minWidth:0,boxSizing:"border-box",fontSize:12,color:T.text,background:T.s2,
                        border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 9px",outline:"none"}}/>
                    <PulsanteOrdineAB/>
                  </div>
                  {cals.length>1&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>
                      {cals.map(c=>{
                        const attivo=!calEsclusi.has(c.id);
                        return (
                          <button key={c.id} type="button"
                            onClick={()=>setCalEsclusi(prev=>{const n=new Set(prev); if(n.has(c.id)) n.delete(c.id); else n.add(c.id); return n;})}
                            style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",
                              background:attivo?"#eab308":T.s2,border:`1.5px solid ${attivo?"#eab308":T.border}`,
                              borderRadius:16,padding:"3px 9px 3px 6px"}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:c.color}}/>
                            <span style={{color:attivo?"#0f172a":T.text,fontSize:11,fontWeight:700}}>{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {gruppi.length===0&&<div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"10px 0"}}>Nessun modello</div>}
                  {gruppi.map(g=>(
                    <div key={g.calId||"__"} style={{marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,margin:"4px 0 2px"}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:g.colore}}/>
                        <span style={{fontSize:11,fontWeight:800,color:T.sub,textTransform:"uppercase"}}>{g.nome}</span>
                      </div>
                      {g.lista.some(x=>giaAssegnati.has(x.id)) && (
                        <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",marginBottom:6}}>
                          <div style={{padding:"6px 8px",background:T.s2,fontSize:10,fontWeight:900,color:T.text,letterSpacing:0.5}}>✓ ASSEGNATI A QUESTO COLORE</div>
                          {g.lista.filter(x=>giaAssegnati.has(x.id)).map(riga)}
                        </div>
                      )}
                      <ElencoModelliTendine chiave={"colorepicker_"+(g.calId||"x")} modelli={g.lista.filter(x=>!giaAssegnati.has(x.id))}
                        calId={g.calId||null} cercando={qAssegna.trim()!==""} estrai={x=>x.m||x}
                        stileContenitore={{borderRadius:10,marginBottom:6}} renderRiga={(x)=>riga(x)}/>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        )}

        </div>

        {(()=>{
          const usano=(Array.isArray(modelliColore)&&!Array.isArray(modelliAssegnabili))?modelliColore.filter(x=>stessoHex(x.hex,previewColor)):[];
          if(usano.length===0) return null;
          return (
            <div style={{marginTop:8,paddingTop:6,borderTop:`1px solid ${T.border}`,flexShrink:0}}>
              <div style={{fontSize:10,fontWeight:800,color:T.sub,marginBottom:3}}>MODELLI CON QUESTO COLORE ({usano.length})</div>
              <div style={{maxHeight:84,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:4}}>
                {usano.map(x=>(
                  <span key={x.id} style={{fontSize:11,fontWeight:700,color:T.text,background:T.s2,
                    border:`1px solid ${T.border}`,borderRadius:8,padding:"2px 7px"}}>
                    {x.label}{x.cal?<span style={{color:T.sub,fontWeight:600}}> · {x.cal}</span>:null}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {modalitaPicker==='griglia'&&(()=>{
          const c=hexToRgbObj(previewColor||"#000000");
          const colonne=[["Esadecimale",(previewColor||"").toUpperCase()],["Rosso",Math.round(c.r)],["Verde",Math.round(c.g)],["Blu",Math.round(c.b)]];
          return (
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`,flexShrink:0}}>
              <div style={{display:"flex",width:64,height:32,borderRadius:10,overflow:"hidden",border:`2px solid ${T.border}`,flexShrink:0}}>
                <div style={{flex:1,background:cur}}/>
                <div style={{flex:1,background:previewColor}}/>
              </div>
              <div style={{flex:1,display:"grid",gridTemplateColumns:"1.9fr 1fr 1fr 1fr",textAlign:"center",gap:2}}>
                {colonne.map(([et,val])=>(
                  <div key={et}>
                    <div style={{fontSize:9,fontWeight:800,color:T.sub}}>{et}</div>
                    {et==="Esadecimale"?(
                      <input value={hexTesto} onChange={e=>digitaHex(e.target.value)}
                        maxLength={7} spellCheck={false} autoCapitalize="characters"
                        onBlur={()=>setHexTesto((previewColor||"").toUpperCase())}
                        style={{width:"100%",boxSizing:"border-box",marginTop:2,textAlign:"center",
                          fontSize:12,fontWeight:700,color:T.text,background:T.s2,
                          border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 0",outline:"none"}}/>
                    ):(
                      <div style={{fontSize:12,fontWeight:700,color:T.text,marginTop:3}}>{val}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontSize:10,fontWeight:800,color:T.sub,marginBottom:3}}>NOME COLORE / GRUPPO (OPZIONALE)</div>
          <input value={nomeColoreInput} onChange={e=>setNomeColoreInput(e.target.value.toUpperCase())}
            placeholder="Es. FERIE, RIPOSO, PERMESSI..."
            style={{width:"100%",boxSizing:"border-box",fontSize:12,fontWeight:700,color:T.text,
              background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 8px",outline:"none",textTransform:"uppercase"}}/>
        </div>

        <div style={{display:"flex",gap:8,marginTop:10,flexShrink:0}}>
          <button onClick={onClose}
            style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
              color:T.text,padding:"8px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            Annulla
          </button>
          <button onClick={()=>{
              onPick(previewColor, nomeColoreInput.trim() ? nomeColoreInput.trim().toUpperCase() : null, Array.isArray(modelliAssegnabili)?{aggiungi:Array.from(selIds).filter(id=>!giaAssegnati.has(id)), rimuovi:Array.from(giaAssegnati).filter(id=>!selIds.has(id))}:null);
              onClose();
            }}
            style={{flex:1,background:previewColor,border:`1px solid ${T.border}`,borderRadius:10,
              color:getContrastTextColor(previewColor),padding:"8px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfermaEliminazione({T, testo="Vuoi eliminare questo elemento?", onConferma, onAnnulla}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100001,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>{e.stopPropagation();onAnnulla();}}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:320,padding:20}}
        onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:18,textAlign:"center"}}>{testo}</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={e=>{e.stopPropagation();onAnnulla();}}
            style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
              color:T.text,padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:13}}>
            Annulla
          </button>
          <button onClick={e=>{e.stopPropagation();onConferma();}}
            style={{flex:1,background:"#ef4444",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:13}}>
            Elimina
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ricerca nei menu di scelta modello ─────────────────────────────────
// Nessuna distinzione maiuscole/minuscole né accenti. Più parole = devono
// valere tutte. Cerca in titolo, etichetta, orari di inizio/fine ("06",
// "06:00", "6:00", "12:15") e "h24".
function normRicerca(s){
  return String(s==null?"":s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function fineModelloRicerca(m){
  if(m.fine) return m.fine;
  const add = m.tempo==="6h15"?375:m.tempo==="6h30"?390:0;
  if(!add||!m.inizio) return "";
  const mt = /^(\d{1,2}):(\d{2})$/.exec(String(m.inizio).trim());
  if(!mt) return "";
  const t = (parseInt(mt[1],10)*60+parseInt(mt[2],10)+add)%1440;
  return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");
}
export function modelloCorrispondeRicerca(m, query){
  const tokens = normRicerca(query).split(/\s+/).filter(Boolean);
  if(tokens.length===0) return true;
  const orari = [m.inizio, fineModelloRicerca(m)].filter(Boolean).map(String);
  const varianti = [];
  orari.forEach(o=>{
    varianti.push(o);
    const mt = /^(\d{1,2}):(\d{2})$/.exec(o.trim());
    if(mt){
      const hh = String(parseInt(mt[1],10)).padStart(2,"0");
      varianti.push(hh+":"+mt[2], String(parseInt(mt[1],10))+":"+mt[2], hh);
    }
  });
  const hay = normRicerca([m.titolo, m.label, m.tempo==="h24"?"h24":"", ...varianti].join(" "));
  return tokens.every(t=>hay.includes(t));
}
export function NessunModello({T}){
  return <div style={{textAlign:"center",padding:"24px 16px",color:T.sub,fontSize:14,fontWeight:700}}>Nessun modello</div>;
}
// Campo di ricerca + filtro. children(filtra, cercando): "filtra" applica la
// ricerca a una lista di modelli (anche per gruppo/calendario). Il testo si
// azzera da solo quando il menu si chiude (il componente si smonta).
export function CercaModelli({T, children, stile}){
  const [q,setQ] = useState("");
  const cercando = q.trim()!=="";
  const filtra = (lista)=> cercando ? (lista||[]).filter(m=>modelloCorrispondeRicerca(m,q)) : lista;
  return (
    <>
      <input value={q} onChange={e=>setQ(e.target.value)}
        placeholder="🔎 Cerca modello o orario..."
        style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
          borderRadius:10,padding:"10px 12px",color:T.text,fontSize:14,
          boxSizing:"border-box",outline:"none",marginBottom:10,...(stile||{})}}/>
      {children(filtra, cercando)}
    </>
  );
}

export function ColorRow({T, hex, label, sub, count, onClick, onRemove}){
  const [confermaVisibile, setConfermaVisibile] = useState(false);
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
        <button onClick={e=>{e.stopPropagation();setConfermaVisibile(true);}}
          style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:2}}>×</button>
      )}
      <span style={{color:T.sub,fontSize:14}}>›</span>
      {confermaVisibile&&(
        <ConfermaEliminazione T={T} testo="Vuoi eliminare questo colore?"
          onConferma={()=>{setConfermaVisibile(false);onRemove();}}
          onAnnulla={()=>setConfermaVisibile(false)}/>
      )}
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

    


// ── Sottomenu LIBERO, come i gruppi della Turnazione (1° TURNO ▼ …): nessun involucro con nome, ogni gruppo è una riga
// con nome, (percentuale se i gruppi sono 2 o più), totale e freccia. La freccia apre TUTTI i modelli del report:
// prima quelli già nel gruppo, sotto tutti gli altri (a tendine, come la lista Modelli) da aggiungere con una spunta.
// «+ Aggiungi gruppo» aggiunge un altro gruppo collegato (liberi, senza percentuali obbligatorie).
function SottomenuLibero({T, accent, sm, perGruppoSm, valore, formatta, modelli, fasceAutomatiche, onPatch, onRemove}){
  const gruppi = sm.gruppi||[];
  const asseg = sm.assegnazioni||{};
  const [nuovoKey, setNuovoKey] = useState(()=> (gruppi.length===1 && !gruppi[0].label) ? gruppi[0].key : null);
  const [aperto, setAperto] = useState(()=> (gruppi.length===1 && !gruppi[0].label) ? gruppi[0].key : null);
  const [confElimina, setConfElimina] = useState(null);
  const COLORI = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4"];
  const totGruppo = (g)=>Object.values(perGruppoSm[g.key]||{}).reduce((a,v)=>a+valore(v),0);
  const tot = gruppi.reduce((a,g)=>a+Math.max(0,totGruppo(g)),0);
  function setAss(mid, key){
    const next = {...asseg};
    if(next[mid]===key) delete next[mid]; else next[mid]=key;
    onPatch({assegnazioni:next});
  }
  // Assegna in un colpo solo tutti i modelli di una tendina (APP, AUTO, H24...) a questo gruppo: casella accanto al nome della tendina.
  function assegnaMolti(ids, key){
    const next = {...asseg};
    ids.forEach(mid=>{ next[mid]=key; });
    onPatch({assegnazioni:next});
  }
  function aggiungiGruppo(){
    const key = "g"+Date.now().toString(36);
    onPatch({gruppi:[...gruppi, {key,label:"",color:COLORI[gruppi.length%COLORI.length]}]});
    setNuovoKey(key); setAperto(key);
  }
  function rinomina(key,label){ onPatch({gruppi:gruppi.map(g=>g.key===key?{...g,label}:g)}); }
  function elimina(key){
    if(gruppi.length<=1){ onRemove(); return; } // era l'unico gruppo: sparisce tutto il sottomenu
    const na = {...asseg};
    Object.keys(na).forEach(mid=>{ if(na[mid]===key) delete na[mid]; });
    onPatch({gruppi:gruppi.filter(g=>g.key!==key), assegnazioni:na});
    if(aperto===key) setAperto(null);
  }
  const nomeGruppo = (key)=>{ const g = gruppi.find(x=>x.key===key); return g ? (g.label||"SENZA NOME") : ""; };
  return (
    <div style={{background:T.surface,borderRadius:10,padding:8,display:"flex",flexDirection:"column",gap:6}}>
      {gruppi.map(g=>{
        const isOpen = aperto===g.key;
        const val = totGruppo(g);
        const pct = (gruppi.length>=2 && tot>0) ? Math.round(100*Math.max(0,val)/tot) : null;
        const riga = (m)=>{
          const attivo = asseg[m.id]===g.key;
          const altroGruppo = asseg[m.id] && asseg[m.id]!==g.key ? nomeGruppo(asseg[m.id]) : "";
          const c = m?.coloreCustom||getColorByTime(m.inizio, fasceAutomatiche);
          const info = perGruppoSm[g.key]?.[m.id];
          return (
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 6px",borderRadius:6,background:T.surface,marginBottom:3}}>
              <input type="checkbox" checked={attivo} onChange={()=>setAss(m.id,g.key)} style={{cursor:"pointer",flexShrink:0}}/>
              <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/>
              <span style={{flex:1,fontSize:12,color:T.text,fontWeight:600}}>
                {m.label||m.titolo}
                {m.tempo!=="h24"&&m.inizio&&(<span style={{opacity:0.7,fontWeight:500,marginLeft:5}}>{m.inizio}→{m.fine||""}</span>)}
                {altroGruppo&&(<span style={{opacity:0.6,fontWeight:500,marginLeft:5,fontSize:11}}>· in {altroGruppo}</span>)}
              </span>
              <span style={{fontSize:13,fontWeight:800,color:T.text}}>{info?formatta(valore(info)):formatta(0)}</span>
            </div>
          );
        };
        const assegnati = modelli.filter(m=>asseg[m.id]===g.key);
        const altri = modelli.filter(m=>asseg[m.id]!==g.key);
        return (
          <div key={g.key}>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:g.color+"22",
              borderRadius:isOpen?"8px 8px 0 0":8,border:`1px solid ${g.color}44`}}>
              <input value={g.label} placeholder="NOME GRUPPO" autoFocus={nuovoKey===g.key}
                onChange={e=>{const fix=preparaFixCursore(e);rinomina(g.key,e.target.value.toUpperCase());fix();}}
                style={{flex:1,minWidth:0,background:"transparent",border:"none",outline:"none",fontSize:13,fontWeight:800,color:"#0f172a"}}/>
              {pct!==null&&(<span style={{fontSize:11,fontWeight:800,color:"#0f172a",background:g.color+"33",borderRadius:8,padding:"1px 6px"}}>{pct}%</span>)}
              <span style={{fontSize:14,fontWeight:900,color:"#0f172a"}}>{formatta(val)}</span>
              <span onClick={()=>setConfElimina(g.key)} style={{cursor:"pointer",fontSize:13,color:"#ef4444",marginLeft:8,padding:"2px 2px"}}>🗑️</span>
              <span onClick={aggiungiGruppo} title="Aggiungi gruppo"
                style={{cursor:"pointer",fontSize:20,fontWeight:900,lineHeight:1,color:accent,margin:"0 14px",padding:"0 4px"}}>+</span>
              <span onClick={()=>setAperto(isOpen?null:g.key)} style={{cursor:"pointer",fontSize:12,color:"#0f172a",padding:"4px 2px"}}>{isOpen?"▲":"▼"}</span>
            </div>
            {confElimina===g.key&&(
              <ConfermaEliminazione T={T} testo={gruppi.length<=1?`Vuoi eliminare "${g.label||"sottomenu senza nome"}"?`:`Vuoi eliminare il gruppo "${g.label||"senza nome"}"?`}
                onConferma={()=>{setConfElimina(null);elimina(g.key);}} onAnnulla={()=>setConfElimina(null)}/>
            )}
            {isOpen&&(
              <div style={{background:T.s2,borderRadius:"0 0 8px 8px",border:`1px solid ${g.color}44`,borderTop:"none",padding:"8px 10px"}}>
                {assegnati.length>0&&(
                  <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",marginBottom:8}}>
                    <div style={{padding:"6px 8px",background:T.surface,fontSize:10,fontWeight:900,color:T.text,letterSpacing:0.5}}>✓ NEL GRUPPO · {assegnati.length}</div>
                    {assegnati.map(riga)}
                  </div>
                )}
                {altri.length>0&&(
                  <ElencoModelliTendine chiave={"libero_"+sm.id+"_"+g.key} modelli={altri} renderRiga={riga}
                    onSelezionaGruppo={(ms)=>assegnaMolti(ms.map(x=>x.id), g.key)}
                    stileContenitore={{border:"none",borderRadius:6,marginBottom:0}}/>
                )}
                {modelli.length===0&&(<div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"6px 0"}}>Nessun modello</div>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// Periodo PERSONALIZZATO di un singolo report (es. Piano incentivante): da / a. Senza periodo vale quello scelto in alto.
export function PeriodoReportButton({T, accent, intervallo, labelGlobale, onChange}){
  const [aperto, setAperto] = useState(false);
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const fmt = (d)=>d ? d.split("-").reverse().join("/") : "";
  const attivo = !!(intervallo && intervallo.from && intervallo.to);
  const valido = !!da && !!a && da<=a;
  return (
    <>
      <button onClick={()=>{setDa(intervallo?.from||"");setA(intervallo?.to||"");setAperto(true);}}
        style={{display:"flex",alignItems:"center",gap:6,background:"#ffffff",border:`1px solid ${attivo?accent:T.border}`,
          borderRadius:20,padding:"6px 12px",fontSize:14,fontWeight:700,color:"#0f172a",cursor:"pointer"}}>
        📅 {attivo ? `${fmt(intervallo.from)} – ${fmt(intervallo.to)}` : "Periodo"}
      </button>
      {aperto&&(
        <div onClick={()=>setAperto(false)} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,padding:18,width:"100%",maxWidth:380,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontSize:16,fontWeight:900,color:T.text}}>Periodo di questo report</div>
            <div style={{fontSize:12,color:T.sub}}>Vale solo per questo report. Senza periodo vale quello scelto in alto{labelGlobale?` (${labelGlobale})`:""}.</div>
            <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:12,fontWeight:700,color:T.text}}>Dal
              <input type="date" value={da} onChange={e=>setDa(e.target.value)} style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,fontSize:14,outline:"none"}}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:12,fontWeight:700,color:T.text}}>Al
              <input type="date" value={a} onChange={e=>setA(e.target.value)} style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,fontSize:14,outline:"none"}}/>
            </label>
            {da&&a&&da>a&&(<div style={{fontSize:12,color:"#dc2626"}}>La data iniziale è dopo quella finale.</div>)}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{onChange(null);setAperto(false);}} style={{flex:1,padding:"10px 0",borderRadius:10,border:`1px solid ${T.border}`,background:T.s2,color:T.text,fontWeight:700,fontSize:12,cursor:"pointer"}}>Usa il periodo generale</button>
              <button disabled={!valido} onClick={()=>{onChange({from:da,to:a});setAperto(false);}}
                style={{flex:1,padding:"10px 0",borderRadius:10,border:"none",background:valido?accent:T.s2,color:valido?getContrastTextColor(accent):T.sub,fontWeight:800,fontSize:13,cursor:valido?"pointer":"default"}}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// Campo orario HH:MM scritto a mano. 00:00 = inizio giornata; 24:00 (solo nel campo «a») = fine giornata, dopo le 23:59.
function OraInput({T, value, onChange, fine}){
  const [txt, setTxt] = useState(value||"");
  useEffect(()=>{ setTxt(value||""); }, [value]);
  const valido = (v)=>{
    const m = /^(\d{2}):(\d{2})$/.exec(v); if(!m) return false;
    const h = +m[1], mi = +m[2];
    if(mi>59) return false;
    return fine ? (h<24 || (h===24 && mi===0)) : h<24;
  };
  return (
    <input value={txt} inputMode="numeric" maxLength={5} placeholder="HH:MM"
      onChange={e=>{
        let d = e.target.value.replace(/\D/g,"").slice(0,4);
        if(d.length>=3) d = d.slice(0,2)+":"+d.slice(2);
        setTxt(d);
        if(valido(d)) onChange(d);
      }}
      onBlur={()=>{ if(!valido(txt)) setTxt(value||""); }}
      style={{width:64,background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 8px",color:T.text,fontSize:14,outline:"none",textAlign:"center"}}/>
  );
}
