#!/usr/bin/env python3
"""
patch_app.py — Frecce più grandi in calendari e report + moveReport

PATCH 1: Frecce ↑↓ calendari più grandi (fontSize:18)
PATCH 2: Frecce ▲▼ report più grandi (fontSize:16) + moveReport funzionante

Uso: python patch_app.py
"""

import sys, os

class PatchError(Exception):
    pass

def patch(src):
    errors = []

    # ══════════════════════════════════════════════════════════════
    # PATCH 1 — Frecce calendari più grandi
    # ══════════════════════════════════════════════════════════════
    OLD_CAL_UP = '''\
              <button onClick={async()=>{
                if(ci===0) return;
                const newCals=[...store.calendars];
                [newCals[ci-1],newCals[ci]]=[newCals[ci],newCals[ci-1]];
                setStore(s=>({...s,calendars:newCals}));
                for(let i=0;i<newCals.length;i++) await updateCalendar(newCals[i].id,{sort_order:i});
              }} style={{background:"none",border:"none",color:ci===0?T.border:T.sub,cursor:ci===0?"default":"pointer",fontSize:12,padding:"0 2px"}}>↑</button>
              <button onClick={async()=>{
                if(ci===store.calendars.length-1) return;
                const newCals=[...store.calendars];
                [newCals[ci],newCals[ci+1]]=[newCals[ci+1],newCals[ci]];
                setStore(s=>({...s,calendars:newCals}));
                for(let i=0;i<newCals.length;i++) await updateCalendar(newCals[i].id,{sort_order:i});
              }} style={{background:"none",border:"none",color:ci===store.calendars.length-1?T.border:T.sub,cursor:ci===store.calendars.length-1?"default":"pointer",fontSize:12,padding:"0 2px"}}>↓</button>'''

    NEW_CAL_UP = '''\
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
              }} style={{background:"none",border:"none",color:ci===store.calendars.length-1?T.border:T.sub,cursor:ci===store.calendars.length-1?"default":"pointer",fontSize:20,padding:"0 4px"}}>↓</button>'''

    if OLD_CAL_UP not in src:
        errors.append("PATCH 1: frecce calendari non trovate")
    else:
        src = src.replace(OLD_CAL_UP, NEW_CAL_UP)

    # ══════════════════════════════════════════════════════════════
    # PATCH 2 — Frecce report più grandi + moveReport
    # ══════════════════════════════════════════════════════════════
    OLD_REP_ARROWS = '''\
          <div style={{display:"flex",flexDirection:"column",gap:2,marginRight:6}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"up");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12,padding:"0 4px",lineHeight:1}}>▲</button>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"down");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12,padding:"0 4px",lineHeight:1}}>▼</button>
          </div>'''

    NEW_REP_ARROWS = '''\
          <div style={{display:"flex",flexDirection:"column",gap:2,marginRight:6}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"up");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▲</button>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"down");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▼</button>
          </div>'''

    if OLD_REP_ARROWS not in src:
        errors.append("PATCH 2: frecce report non trovate")
    else:
        src = src.replace(OLD_REP_ARROWS, NEW_REP_ARROWS)

    # ══════════════════════════════════════════════════════════════
    # PATCH 3 — Aggiunge moveReport se mancante
    # ══════════════════════════════════════════════════════════════
    if 'function moveReport' in src:
        print("  ℹ️  PATCH 3: moveReport già presente, salto.")
    else:
        OLD_RENAME = '''\
  function renameReport(id, label){
    const newRep = (store.reports||[]).map(r=>r.id===id?{...r,label}:r);
    setStore(s=>({...s, reports:newRep}));
    saveSettings({reports:newRep});
  }'''

        NEW_RENAME = '''\
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
  }'''

        if OLD_RENAME not in src:
            errors.append("PATCH 3: funzione renameReport non trovata")
        else:
            src = src.replace(OLD_RENAME, NEW_RENAME)

    if errors:
        raise PatchError("\n".join(f"  ❌ {e}" for e in errors))
    return src

def main():
    path = sys.argv[1] if len(sys.argv)>=2 else "App.jsx"
    if not os.path.exists(path):
        print(f"❌ File non trovato: {path}"); sys.exit(1)

    print(f"📂 Leggo: {path}")
    with open(path,"r",encoding="utf-8") as f:
        src = f.read()

    try:
        patched = patch(src)
    except PatchError as e:
        print("\n❌ Patch NON applicata:\n"); print(str(e)); sys.exit(1)

    out = path.replace("App.jsx","App_updated.jsx")
    with open(out,"w",encoding="utf-8") as f:
        f.write(patched)

    print()
    print("✅ Patch applicate!")
    print("  PATCH 1 ✓ — Frecce ↑↓ calendari più grandi (fontSize:20)")
    print("  PATCH 2 ✓ — Frecce ▲▼ report più grandi (fontSize:18)")
    print("  PATCH 3 ✓ — moveReport aggiunto/verificato")
    print(f"📄 File salvato: {out}")

if __name__=="__main__":
    main()
