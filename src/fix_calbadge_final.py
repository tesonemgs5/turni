import sys
import shutil
from pathlib import Path

def fix(path: str):
    p = Path(path)
    if not p.exists():
        print(f"Errore: file non trovato → {path}")
        sys.exit(1)

    src = p.read_text(encoding="utf-8")

    # Il problema: nel return di CalBadge c'è una </div> di chiusura
    # prematura dopo il blocco showCalPal, e poi un'altra </div> finale
    # che non ha corrispondenza. La struttura errata è:
    #
    #   return (
    #     <div ...>          ← div esterna
    #       <div ...>        ← div palette
    #         ...
    #       </div>           ← chiude palette ✓
    #     </div>             ← chiude PREMATURAMENTE la div esterna ✗
    #     {/* Freccia... */}
    #     ...
    #     </div>             ← div extra senza apertura ✗
    #     );
    #
    # La struttura corretta è:
    #
    #   return (
    #     <div ...>          ← div esterna
    #       <div ...>        ← div palette
    #         ...
    #       </div>           ← chiude palette ✓
    #       {/* Freccia... */}
    #       ...
    #     </div>             ← chiude div esterna ✓
    #   );

    OLD = """  return (
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
    {/* Freccia cambio calendario */}
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
}"""

    NEW = """  return (
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
      {/* Freccia cambio calendario */}
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
}"""

    if OLD not in src:
        print("❌ Pattern non trovato.")
        sys.exit(1)

    out = src.replace(OLD, NEW, 1)
    bak = p.with_suffix(".jsx.bak")
    shutil.copy(p, bak)
    print(f"Backup → {bak}")
    p.write_text(out, encoding="utf-8")
    print("✅ CalBadge corretto: struttura JSX sistemata")
    print("Ora esegui: npm run build")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python fix_calbadge_final.py src/App.jsx")
        sys.exit(1)
    fix(sys.argv[1])
