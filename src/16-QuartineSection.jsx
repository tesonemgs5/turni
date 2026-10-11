// ═══════════════════════════════════════════════════════════════
// 16-QuartineSection.jsx — Menu "QUARTINE" nelle Impostazioni:
// colore + "Visualizza" per ogni quartina (I-IV), 📷 per acquisire PDF/foto,
// elenco dei giorni diviso per anno con giorno della settimana e Modifica.
// ═══════════════════════════════════════════════════════════════
import { useState, useRef } from "react";
import { SecCollapsible, ColorPickerModal, nomeDelColore } from "./05-Comuni";
import { QUARTINE, quartineVuote, applicaImportQuartine, leggiPdfQuartine, leggiFotoQuartine } from "./15-quartine";

const GIORNI = ["dom","lun","mar","mer","gio","ven","sab"];
const pad = (n)=>String(n).padStart(2,"0");
function etichettaData(k){
  const [y,m,d] = k.split("-").map(Number);
  return `${GIORNI[new Date(y,m-1,d).getDay()]} ${pad(d)}/${pad(m)}/${y}`;
}

export function QuartineSection({ T, accent, dark, store, salvaQuartine, fasceAutomatiche=[], coloriExtra=[], coloriUsati=[] }){
  const base = quartineVuote(dark);
  const salvata = store.reportSettings?.quartine || {};
  const cfg = {
    visibili: { ...base.visibili, ...(salvata.visibili||{}) },
    colori:   { ...base.colori,   ...(salvata.colori||{}) },
    date:     { ...(salvata.date||{}) },
  };
  const [pal, setPal] = useState(null);
  const [modifica, setModifica] = useState(null); // { chiave|null, data, q }
  const [imp, setImp] = useState(null);           // { stato, progresso, ris, anno, motivo }
  const fileRef = useRef(null);

  const anni = [...new Set(Object.keys(cfg.date).map(k=>parseInt(k.slice(0,4),10)))].sort();
  const nVisibili = QUARTINE.filter(q=>cfg.visibili[q]).length;

  async function leggiFile(file){
    if(!file) return;
    setImp({ stato:"lettura", progresso:null });
    try{
      const isPdf = file.type==="application/pdf" || /\.pdf$/i.test(file.name||"");
      const ris = isPdf ? await leggiPdfQuartine(file)
                        : await leggiFotoQuartine(file, p=>setImp(s=>s?({...s,progresso:p}):s));
      if(!ris.ok){ setImp({ stato:"errore", motivo:ris.motivo }); return; }
      setImp({ stato:"anteprima", ris, anno: ris.anno || new Date().getFullYear() });
    }catch(e){
      setImp({ stato:"errore", motivo:"Lettura non riuscita: "+(e?.message||e) });
    }
  }

  function confermaImport(){
    if(!imp?.ris) return;
    salvaQuartine(applicaImportQuartine(cfg, imp.anno, imp.ris.entries));
    setImp(null);
  }

  function salvaModifica(){
    if(!modifica?.data) return;
    const date = { ...cfg.date };
    if(modifica.chiave) delete date[modifica.chiave];
    date[modifica.data] = modifica.q;
    salvaQuartine({ ...cfg, date });
    setModifica(null);
  }
  function eliminaGiorno(){
    if(!modifica?.chiave) return;
    const date = { ...cfg.date }; delete date[modifica.chiave];
    salvaQuartine({ ...cfg, date });
    setModifica(null);
  }

  const bottone = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, color:accent,
    padding:"5px 10px", fontSize:11, fontWeight:800, cursor:"pointer" };

  function editorRiga(){
    return (
      <div style={{background:T.s2,borderRadius:8,padding:10,marginBottom:6,border:`1px solid ${accent}`}}>
        <input type="date" value={modifica.data} onChange={e=>setModifica(m=>({...m,data:e.target.value}))}
          style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:8,border:`1px solid ${T.border}`,
            background:T.surface,color:T.text,fontSize:14,marginBottom:8}}/>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {QUARTINE.map(q=>(
            <button key={q} onClick={()=>setModifica(m=>({...m,q}))}
              style={{flex:1,padding:"7px 0",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:12,
                background:modifica.q===q?cfg.colori[q]:T.surface,color:T.text,
                border:`2px solid ${modifica.q===q?accent:T.border}`}}>{q}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={salvaModifica} style={{...bottone,flex:1,background:accent,color:"#fff",border:"none"}}>Salva</button>
          {modifica.chiave && <button onClick={eliminaGiorno} style={{...bottone,color:"#ef4444"}}>Elimina</button>}
          <button onClick={()=>setModifica(null)} style={{...bottone,color:T.sub}}>Annulla</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <SecCollapsible T={T} label={
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span>QUARTINE</span>
          <span title="Acquisisci PDF o foto" style={{fontSize:16,cursor:"pointer",lineHeight:1}}
            onClick={e=>{ e.stopPropagation(); fileRef.current?.click(); }}>{"\uD83D\uDCF7"}</span>
        </div>}>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{display:"none"}}
          onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; leggiFile(f); }}/>
        <div style={{fontSize:11,color:T.sub,marginBottom:10,lineHeight:1.45}}>
          Scegli quali quartine vedere nel calendario e il colore di sfondo dei loro giorni (domeniche e festivi insieme).
          Con la fotocamera carichi il PDF (o una foto) delle quartine dell'anno.
        </div>

        {QUARTINE.map(q=>(
          <div key={q} style={{display:"flex",alignItems:"center",gap:10,background:T.s2,borderRadius:10,
            padding:"10px 12px",marginBottom:6}}>
            <div style={{position:"relative",flexShrink:0}}>
              <div onClick={e=>{e.stopPropagation(); setPal(pal===q?null:q);}}
                style={{width:26,height:26,borderRadius:"50%",background:cfg.colori[q],border:`2px solid ${T.border}`,cursor:"pointer"}}/>
              {pal===q && <ColorPickerModal T={T} cur={cfg.colori[q]} title={`Colore quartina ${q}`}
                coloriUsati={(()=>{ const v=new Set(); return [...coloriUsati, ...QUARTINE.map(x=>cfg.colori[x])].filter(h=>{ const k=String(h).toLowerCase(); if(!h||v.has(k)) return false; v.add(k); return true; }); })()}
                getNomeColore={p=>nomeDelColore(p,{fasceAutomatiche,coloriExtra})}
                onPick={p=>salvaQuartine({...cfg, colori:{...cfg.colori,[q]:p}})}
                onClose={()=>setPal(null)}/>}
            </div>
            <div style={{flex:1,fontSize:13,fontWeight:800,color:T.text}}>
              Quartina {q}
              <span style={{fontWeight:600,color:T.sub,fontSize:11}}> · {Object.values(cfg.date).filter(v=>v===q).length} giorni</span>
            </div>
            <span style={{fontSize:11,color:T.sub}}>Visualizza</span>
            <div onClick={()=>salvaQuartine({...cfg, visibili:{...cfg.visibili,[q]:!cfg.visibili[q]}})}
              style={{width:38,height:22,borderRadius:11,cursor:"pointer",position:"relative",flexShrink:0,
                background:cfg.visibili[q]?accent:T.border,transition:"background .15s"}}>
              <div style={{position:"absolute",top:2,left:cfg.visibili[q]?18:2,width:18,height:18,borderRadius:"50%",
                background:"#fff",transition:"left .15s"}}/>
            </div>
          </div>
        ))}

        {anni.length===0 && (
          <div style={{textAlign:"center",color:T.sub,fontSize:12,padding:"12px 0"}}>
            Nessun giorno caricato. Tocca la fotocamera per acquisire il PDF delle quartine.
          </div>
        )}

        {anni.map(anno=>{
          const tutti = Object.keys(cfg.date).filter(k=>k.startsWith(anno+"-")).sort();
          const visibili = tutti.filter(k=>cfg.visibili[cfg.date[k]]);
          return (
            <SecCollapsible key={anno} T={T} label={`${anno} · ${tutti.length} GIORNI`}>
              {nVisibili===0 && (
                <div style={{fontSize:11,color:T.sub,marginBottom:8}}>Accendi "Visualizza" su una quartina per vedere i suoi giorni.</div>
              )}
              {visibili.map(k=>(
                modifica && modifica.chiave===k ? <div key={k}>{editorRiga()}</div> : (
                  <div key={k} style={{display:"flex",alignItems:"center",gap:8,background:T.s2,borderRadius:8,
                    padding:"6px 10px",marginBottom:6}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:cfg.colori[cfg.date[k]],
                      border:`1px solid ${T.border}`,flexShrink:0}}/>
                    <div style={{flex:1,fontSize:13,color:T.text}}>{etichettaData(k)}</div>
                    <div style={{fontSize:11,fontWeight:800,color:T.sub}}>{cfg.date[k]}</div>
                    <button onClick={()=>setModifica({chiave:k,data:k,q:cfg.date[k]})} style={bottone}>Modifica</button>
                  </div>
                )
              ))}
              {modifica && !modifica.chiave && modifica.data.startsWith(anno+"-") && editorRiga()}
              <button onClick={()=>setModifica({chiave:null,data:`${anno}-01-01`,q:QUARTINE.find(q=>cfg.visibili[q])||"I"})}
                style={{...bottone,width:"100%",marginTop:2}}>+ Aggiungi giorno</button>
            </SecCollapsible>
          );
        })}
      </SecCollapsible>

      {imp && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100002,display:"flex",
          alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>{ if(imp.stato!=="lettura") setImp(null); }}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:400,
            padding:18,maxHeight:"85vh",overflowY:"auto"}}>
            {imp.stato==="lettura" && (
              <div style={{textAlign:"center",color:T.text,fontSize:14,padding:"20px 0"}}>
                Lettura in corso…{imp.progresso!=null?` ${imp.progresso}%`:""}
              </div>
            )}
            {imp.stato==="errore" && (
              <>
                <div style={{fontSize:15,fontWeight:900,color:T.text,marginBottom:8}}>Lettura non riuscita</div>
                <div style={{fontSize:12,color:T.sub,marginBottom:14,lineHeight:1.45}}>{imp.motivo}</div>
                <button onClick={()=>setImp(null)} style={{...bottone,width:"100%",padding:"10px 0",fontSize:13}}>Chiudi</button>
              </>
            )}
            {imp.stato==="anteprima" && (()=>{
              const { ris, anno } = imp;
              return (
                <>
                  <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:4,textAlign:"center"}}>Quartine lette</div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:10}}>
                    <span style={{fontSize:12,color:T.sub}}>Anno</span>
                    <input type="number" value={anno} onChange={e=>setImp(s=>({...s,anno:parseInt(e.target.value,10)||s.anno}))}
                      style={{width:80,padding:"6px 8px",borderRadius:8,border:`1px solid ${T.border}`,background:T.s2,
                        color:T.text,fontSize:14,textAlign:"center"}}/>
                    <span style={{fontSize:11,color:T.sub}}>({ris.entries.length} giorni)</span>
                  </div>
                  {QUARTINE.map(q=>{
                    const es = ris.entries.filter(e=>e.q===q);
                    return (
                      <div key={q} style={{background:T.s2,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                        <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:3}}>
                          <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:cfg.colori[q],
                            marginRight:6,border:`1px solid ${T.border}`}}/>
                          Quartina {q} · {es.length} giorni
                        </div>
                        <div style={{fontSize:11,color:T.sub,lineHeight:1.6}}>
                          {es.map(e=>{
                            const a = e.mese>12?anno+1:anno, m = e.mese>12?e.mese-12:e.mese;
                            const feriale = new Date(a,m-1,e.giorno).getDay()!==0;
                            return `${pad(e.giorno)}/${pad(m)}${a!==anno?"/"+String(a).slice(2):""}${feriale?"*":""}`;
                          }).join("  ")}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{fontSize:10,color:T.sub,marginBottom:8}}>* = giorno infrasettimanale (festivo). Salvando, sostituisco i giorni già presenti per questo anno.</div>
                  {ris.avvisi.length>0 && (
                    <div style={{background:dark?"#3a2a05":"#fffbeb",border:"1px solid #f59e0b",borderRadius:8,padding:"8px 10px",marginBottom:10}}>
                      {ris.avvisi.map((a,i)=><div key={i} style={{fontSize:11,color:dark?"#fcd34d":"#92400e",lineHeight:1.45,marginBottom:2}}>⚠ {a}</div>)}
                    </div>
                  )}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={confermaImport} style={{...bottone,flex:1,background:accent,color:"#fff",border:"none",padding:"10px 0",fontSize:13}}>Conferma e salva</button>
                    <button onClick={()=>setImp(null)} style={{...bottone,color:T.sub,padding:"10px 14px",fontSize:13}}>Annulla</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
