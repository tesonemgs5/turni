#!/usr/bin/env python3
"""
patch_app.py — Fix pulsante ricarica: usa Supabase invece di Sheets

PATCH 1: Pulsante 🔄 ricarica da Supabase (non da Sheets)

Uso:
  python patch_app.py
"""

import sys, os

class PatchError(Exception):
    pass

def patch(src):
    errors = []

    OLD = '''\
        <button onClick={()=>syncFromSheets()}
          title="Ricarica dati"
          style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",
            borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,color:"#fff",flexShrink:0}}>
          🔄
        </button>'''

    NEW = '''\
        <button onClick={async()=>{
          const {data:cals}=await supabase.from("calendars").select("*").eq("user_id",userId).order("created_at");
          const {data:evts}=await supabase.from("events").select("*").eq("user_id",userId);
          const {data:mods}=await supabase.from("modelli").select("*").eq("user_id",userId).order("sort_order");
          const calendars=(cals||[]).map(c=>({id:c.id,name:c.name,color:c.color,isMain:c.is_main,shifts:c.shifts||[]}));
          const events={};
          (evts||[]).forEach(e=>{
            if(!events[e.date_key]) events[e.date_key]={};
            if(!events[e.date_key][e.calendar_id]) events[e.date_key][e.calendar_id]=[];
            events[e.date_key][e.calendar_id].push({id:e.id,label:e.label,color:e.color,allDay:e.all_day,tIn:e.time_in||"",tOut:e.time_out||"",place:e.place||"",map:e.map_url||"",note:e.note||"",modelloId:e.modello_id||null,collega:e.collega||null,auto:e.auto||""});
          });
          setStore(s=>({...s,calendars,events}));
          setModelli((mods||[]).map(m=>({id:m.id,titolo:m.titolo,tempo:m.tempo,inizio:m.inizio||"",fine:m.fine||"",colore:m.colore,coloreCustom:m.colore_custom||null,posizione:m.posizione||"",sortOrder:m.sort_order||0,calendarId:m.calendar_id||null})));
          setCalId(calendars[0]?.id||null);
        }}
          title="Ricarica dati"
          style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.4)",
            borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:14,color:"#fff",flexShrink:0}}>
          🔄
        </button>'''

    if OLD not in src:
        if 'supabase.from("calendars").select' in src and 'Ricarica dati' in src:
            print("  ℹ️  PATCH 1: già applicata, salto.")
        else:
            errors.append("PATCH 1: pulsante ricarica non trovato")
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
    print("  PATCH 1 ✓ — Pulsante 🔄 ricarica da Supabase (non da Sheets)")
    print(f"📄 File salvato: {out}")

if __name__=="__main__":
    main()
