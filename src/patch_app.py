#!/usr/bin/env python3
"""
patch_app.py — Aggiunge frecce ↑↓ per spostare i calendari nelle impostazioni

Uso: python patch_app.py
"""

import sys, os

class PatchError(Exception):
    pass

def patch(src):
    errors = []

    OLD = '''\
              <button onClick={()=>setExCal(exCal===c.id?null:c.id)}
                style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12}}>
                {exCal===c.id?"▲":"▼"}</button>
              <button onClick={async()=>{
                if(!window.confirm(`Eliminare il calendario "${c.name}"? Tutti gli eventi associati verranno persi.`)) return;'''

    NEW = '''\
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
              }} style={{background:"none",border:"none",color:ci===store.calendars.length-1?T.border:T.sub,cursor:ci===store.calendars.length-1?"default":"pointer",fontSize:12,padding:"0 2px"}}>↓</button>
              <button onClick={()=>setExCal(exCal===c.id?null:c.id)}
                style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:12}}>
                {exCal===c.id?"▲":"▼"}</button>
              <button onClick={async()=>{
                if(!window.confirm(`Eliminare il calendario "${c.name}"? Tutti gli eventi associati verranno persi.`)) return;'''

    if OLD not in src:
        if 'sort_order:i' in src and 'newCals[ci-1]' in src:
            print("  ℹ️  PATCH 1: già applicata, salto.")
        else:
            errors.append("PATCH 1: blocco pulsanti calendario non trovato")
    else:
        src = src.replace(OLD, NEW)

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
    print("✅ Patch applicata!")
    print("  PATCH 1 ✓ — Frecce ↑↓ per spostare calendari nelle impostazioni")
    print(f"📄 File salvato: {out}")

if __name__=="__main__":
    main()
