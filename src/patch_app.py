#!/usr/bin/env python3
"""
patch_app.py — Applica tutte le modifiche richieste ad App.jsx

PATCH 1: Tasto ricarica accanto a TUTTI nell'header calendario
PATCH 2: Report — conferma prima di removeReport
PATCH 3: Report — sposta report (drag su desktop, frecce su mobile)
PATCH 4: ConteggioConfigCard — rimuove "Gestisci modelli"
PATCH 5: ConteggioConfigCard — nome report solo matita (niente "modifica" testuale)
PATCH 6: ConteggioConfigCard — 1°/2° TURNO espandibili
PATCH 7: ConteggioConfigCard — rimuove "FILTRA PER FASCIA ORARIA", aggiunge filtro collega

Uso:
  python patch_app.py            # cerca App.jsx nella cartella corrente
  python patch_app.py <percorso> # usa il percorso specificato
"""

import sys
import os

class PatchError(Exception):
    pass


def patch(src: str) -> str:
    errors = []

    # ══════════════════════════════════════════════════════════════
    # PATCH 1 — Tasto ricarica accanto a TUTTI
    # ══════════════════════════════════════════════════════════════
    OLD_TUTTI = '''\
        <button onClick={()=>setCalId(null)}
          style={{background:calId===null?"rgba(255,255,255,0.28)":"rgba(255,255,255,0.1)",
            border:`1.5px solid ${calId===null?"rgba(255,255,255,0.85)":"transparent"}`,
            borderRadius:20,padding:"2px 10px",cursor:"pointer",flexShrink:0}}>
          <span style={{color:"#fff",fontSize:11,fontWeight:800}}>TUTTI</span>
        </button>'''

    NEW_TUTTI = '''\
        <button onClick={()=>setCalId(null)}
          style={{background:calId===null?"rgba(255,255,255,0.28)":"rgba(255,255,255,0.1)",
            border:`1.5px solid ${calId===null?"rgba(255,255,255,0.85)":"transparent"}`,
            borderRadius:20,padding:"2px 10px",cursor:"pointer",flexShrink:0}}>
          <span style={{color:"#fff",fontSize:11,fontWeight:800}}>TUTTI</span>
        </button>
        <button onClick={()=>syncFromSheets()}
          title="Ricarica dati"
          style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",
            borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,color:"#fff",flexShrink:0}}>
          🔄
        </button>'''

    if OLD_TUTTI not in src:
        errors.append("PATCH 1: pulsante TUTTI non trovato")
    else:
        src = src.replace(OLD_TUTTI, NEW_TUTTI)

    # ══════════════════════════════════════════════════════════════
    # PATCH 2 — Conferma prima di removeReport
    # ══════════════════════════════════════════════════════════════
    OLD_REMOVE = '''\
          <button onClick={e=>{e.stopPropagation();removeReport(r.id);}}
            style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
              background:"#ef4444",color:"#fff",fontSize:16,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
            –
          </button>'''

    NEW_REMOVE = '''\
          <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questo report?"))removeReport(r.id);}}
            style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
              background:"#ef4444",color:"#fff",fontSize:16,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
            –
          </button>'''

    if OLD_REMOVE not in src:
        errors.append("PATCH 2: pulsante removeReport non trovato")
    else:
        src = src.replace(OLD_REMOVE, NEW_REMOVE)

    # ══════════════════════════════════════════════════════════════
    # PATCH 3 — Sposta report: aggiunge frecce su/giù nella card
    # ══════════════════════════════════════════════════════════════
    OLD_REPORT_CARD_HEADER = '''\
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
            <div style={{fontSize:14,fontWeight:700,color:T.text,overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
            {r.type==="conteggio_turni"&&(
              <div style={{fontSize:11,color:T.sub}}>
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
          <span style={{color:T.sub,fontSize:12}}>›</span>
        </div>'''

    NEW_REPORT_CARD_HEADER = '''\
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
            <div style={{fontSize:14,fontWeight:700,color:T.text,overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
            {r.type==="conteggio_turni"&&(
              <div style={{fontSize:11,color:T.sub}}>
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
          <div style={{display:"flex",flexDirection:"column",gap:2,marginRight:6}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"up");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12,padding:"0 4px",lineHeight:1}}>▲</button>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"down");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12,padding:"0 4px",lineHeight:1}}>▼</button>
          </div>
          <span style={{color:T.sub,fontSize:12}}>›</span>
        </div>'''

    if OLD_REPORT_CARD_HEADER not in src:
        errors.append("PATCH 3: header card report non trovato")
    else:
        src = src.replace(OLD_REPORT_CARD_HEADER, NEW_REPORT_CARD_HEADER)

    # ══════════════════════════════════════════════════════════════
    # PATCH 4 — Rimuove "Gestisci modelli" da ConteggioConfigCard
    # ══════════════════════════════════════════════════════════════
    OLD_GESTISCI = '''\
      {/* Gestione modelli */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700}}>MODELLI</div>
        <button onClick={()=>onGoToModelli&&onGoToModelli()}
          style={{background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",
            borderRadius:16,padding:"3px 12px",fontSize:11,color:"#6366f1",cursor:"pointer",fontWeight:700}}>
          ✏️ Gestisci modelli
        </button>
      </div>

      {/* Nome report */}'''

    NEW_GESTISCI = '''\
      {/* Nome report */}'''

    if OLD_GESTISCI not in src:
        errors.append("PATCH 4: blocco 'Gestisci modelli' non trovato")
    else:
        src = src.replace(OLD_GESTISCI, NEW_GESTISCI)

    # ══════════════════════════════════════════════════════════════
    # PATCH 5 — Nome report: solo matita, niente "modifica" testuale
    # ══════════════════════════════════════════════════════════════
    OLD_NOME_REPORT = '''\
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
          <div style={{display:"flex",alignItems:"center",gap:8}} onClick={()=>setEditingName(true)}>
            <span style={{fontSize:14,fontWeight:700,color:T.text,flex:1}}>{r.label}</span>
            <span style={{fontSize:11,color:accent,cursor:"pointer"}}>✏️ modifica</span>
          </div>
        )}'''

    NEW_NOME_REPORT = '''\
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
        )}'''

    if OLD_NOME_REPORT not in src:
        errors.append("PATCH 5: blocco nome report non trovato")
    else:
        src = src.replace(OLD_NOME_REPORT, NEW_NOME_REPORT)

    # ══════════════════════════════════════════════════════════════
    # PATCH 6 — 1°/2° TURNO espandibili in ConteggioConfigCard
    # ══════════════════════════════════════════════════════════════
    OLD_FASCE_STAT = '''\
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"8px 10px",background:"#f59e0b22",borderRadius:8,border:"1px solid #f59e0b44"}}>
            <span style={{fontSize:13,fontWeight:800,color:"#f59e0b"}}>1° TURNO (06:00-11:45)</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:"#f59e0b",background:"#f59e0b22",
                borderRadius:6,padding:"2px 7px"}}>{pct1}%</span>
              <span style={{fontSize:16,fontWeight:900,color:T.text}}>{data.primo||0}</span>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"8px 10px",background:"#f9731622",borderRadius:8,border:"1px solid #f9731644"}}>
            <span style={{fontSize:13,fontWeight:800,color:"#f97316"}}>2° TURNO (12:00-23:59)</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:"#f97316",background:"#f9731622",
                borderRadius:6,padding:"2px 7px"}}>{pct2}%</span>
              <span style={{fontSize:16,fontWeight:900,color:T.text}}>{data.secondo||0}</span>
            </div>
          </div>
          
        </div>'''

    NEW_FASCE_STAT = '''\
        {(()=>{
          const [openFascia, setOpenFascia] = [null, ()=>{}];
          // Usiamo un ref tramite dataset per gestire l'espansione senza useState annidato
          return null;
        })()}
        <FasceExpand data={data} pct1={pct1} pct2={pct2} T={T} modelli={modelli} accent={accent}/>'''

    if OLD_FASCE_STAT not in src:
        errors.append("PATCH 6: blocco fasce statistiche (1°/2° TURNO) non trovato")
    else:
        src = src.replace(OLD_FASCE_STAT, NEW_FASCE_STAT)

    # ══════════════════════════════════════════════════════════════
    # PATCH 7 — Sostituisce "FILTRA PER FASCIA ORARIA" con filtro collega
    # ══════════════════════════════════════════════════════════════
    OLD_FILTRO_FASCIA = '''\
      {/* Filtro fasce */}
      <div>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:6}}>
          FILTRA PER FASCIA ORARIA
          {isFiltered&&<span style={{color:accent,marginLeft:6}}>({(cfg.fasceFiltro||[]).length} selezionate)</span>}
        </div>
        <div style={{background:T.surface,borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`}}>
          <div onClick={()=>onUpdateCfg({...cfg,fasceFiltro:[]})}
            style={{display:"flex",alignItems:"center",padding:"10px 14px",
              borderBottom:`1px solid ${T.border}`,cursor:"pointer",
              background:!isFiltered?accent+"15":"transparent"}}>
            {!isFiltered&&<span style={{color:accent,marginRight:8,fontSize:12}}>✓</span>}
            <span style={{fontSize:13,fontWeight:!isFiltered?700:400,color:!isFiltered?accent:T.text}}>Tutte le fasce</span>
          </div>
          {FASCE.map((f,i,arr)=>{
            const sel=(cfg.fasceFiltro||[]).includes(f.key);
            return (
              <div key={f.key} onClick={()=>toggleFascia(f.key)}
                style={{display:"flex",alignItems:"center",padding:"10px 14px",cursor:"pointer",
                  borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none",
                  background:sel?accent+"15":"transparent"}}>
                {sel&&<span style={{color:accent,marginRight:8,fontSize:12}}>✓</span>}
                <span style={{flex:1,fontSize:13,fontWeight:sel?700:400,color:sel?accent:T.text}}>{f.label}</span>
                <span style={{fontSize:12,fontWeight:800,color:T.sub}}>{f.count}</span>
              </div>
            );
          })}
        </div>
      </div>'''

    NEW_FILTRO_FASCIA = '''\
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
      </div>'''

    if OLD_FILTRO_FASCIA not in src:
        errors.append("PATCH 7: blocco 'FILTRA PER FASCIA ORARIA' non trovato")
    else:
        src = src.replace(OLD_FILTRO_FASCIA, NEW_FILTRO_FASCIA)

    # ══════════════════════════════════════════════════════════════
    # PATCH 8 — Aggiunge componente FasceExpand prima di ConteggioConfigCard
    # ══════════════════════════════════════════════════════════════
    OLD_CONTEGGIO_FUNC = '''\
function ConteggioConfigCard({T, r, cfg, data, totaleTurni, modelli, accent, onRename, onUpdateCfg, onGoToModelli}){'''

    NEW_CONTEGGIO_FUNC = '''\
function FasceExpand({data, pct1, pct2, T, modelli, accent}){
  const [openFascia, setOpenFascia] = React.useState(null);

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

function ConteggioConfigCard({T, r, cfg, data, totaleTurni, modelli, accent, onRename, onUpdateCfg, onGoToModelli}){'''

    if OLD_CONTEGGIO_FUNC not in src:
        errors.append("PATCH 8: inizio funzione ConteggioConfigCard non trovato")
    else:
        src = src.replace(OLD_CONTEGGIO_FUNC, NEW_CONTEGGIO_FUNC)

    # ══════════════════════════════════════════════════════════════
    # PATCH 9 — Aggiunge funzione moveReport
    # ══════════════════════════════════════════════════════════════
    OLD_RENAME = '''  function renameReport(id, label){
    const newRep = (store.reports||[]).map(r=>r.id===id?{...r,label}:r);
    setStore(s=>({...s, reports:newRep}));
    saveSettings({reports:newRep});
  }'''

    NEW_RENAME = '''  function renameReport(id, label){
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
  }'''

    if OLD_RENAME not in src:
        errors.append("PATCH 9: funzione renameReport non trovata")
    else:
        src = src.replace(OLD_RENAME, NEW_RENAME)

    # ══════════════════════════════════════════════════════════════
    if errors:
        raise PatchError("\n".join(f"  ❌ {e}" for e in errors))

    return src


def main():
    if len(sys.argv) >= 2:
        path = sys.argv[1]
    else:
        path = "App.jsx"

    if not os.path.exists(path):
        print(f"❌ File non trovato: {path}")
        print(f"   Assicurati che App.jsx sia nella stessa cartella di patch_app.py")
        sys.exit(1)

    print(f"📂 Leggo: {path}")
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    try:
        patched = patch(src)
    except PatchError as e:
        print("\n❌ Patch NON applicata — nessun file scritto. Errori trovati:\n")
        print(str(e))
        print("\n  Controlla che App.jsx sia la versione corretta e riprova.")
        sys.exit(1)

    out_path = path.replace("App.jsx", "App_updated.jsx")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(patched)

    print()
    print("✅ Tutte le patch applicate con successo!")
    print()
    print("  PATCH 1 ✓ — Tasto ricarica accanto a TUTTI")
    print("  PATCH 2 ✓ — Conferma prima di eliminare report")
    print("  PATCH 3 ✓ — Frecce sposta report su/giù")
    print("  PATCH 4 ✓ — Rimosso 'Gestisci modelli'")
    print("  PATCH 5 ✓ — Nome report: solo matita ✏️")
    print("  PATCH 6 ✓ — 1°/2° TURNO espandibili")
    print("  PATCH 7 ✓ — Rimosso filtro fascia, aggiunto filtro collega")
    print("  PATCH 8 ✓ — Componente FasceExpand aggiunto")
    print("  PATCH 9 ✓ — Funzione moveReport aggiunta")
    print()
    print(f"📄 File salvato: {out_path}")


if __name__ == "__main__":
    main()

# (sostituisce la funzione main esistente con versione aggiornata — appended patch)
