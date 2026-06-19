"""
========================================================================
SCRIPT DI MODIFICA AUTOMATICA - App.jsx
========================================================================
Applica 2 modifiche:
  1) Report: frecce ▲▼ affiancate invece che impilate
  2) Calendari (Impostazioni): frecce ↑↓ sostituite con ▲▼ più distanziate

USO:
  1) Metti questo file (modifica_frecce.py) nella STESSA cartella di App.jsx
     (la cartella "src" del tuo progetto, in base agli screenshot precedenti)
  2) Apri un terminale in quella cartella
  3) Esegui: python modifica_frecce.py
  4) Lo script crea automaticamente un backup "App.jsx.bak" prima di toccare
     il file originale
  5) Se una modifica non viene trovata, lo script lo segnala e NON tocca
     il file (così non rischi di rovinarlo)
========================================================================
"""

import re
import shutil
import sys
from pathlib import Path

FILE_NAME = "App.jsx"


def main():
    path = Path(FILE_NAME)
    if not path.exists():
        print(f"❌ ERRORE: non trovo '{FILE_NAME}' in questa cartella.")
        print(f"   Cartella corrente: {Path.cwd()}")
        print("   Sposta questo script nella stessa cartella di App.jsx (di solito 'src') e riprova.")
        sys.exit(1)

    original = path.read_text(encoding="utf-8")
    content = original

    modifiche_applicate = []
    modifiche_fallite = []

    # ====================================================================
    # MODIFICA 1: Report — frecce ▲▼ affiancate
    # ====================================================================
    old_1 = '''<div style={{display:"flex",flexDirection:"column",gap:2,marginRight:6}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"up");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▲</button>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"down");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▼</button>
          </div>'''

    new_1 = '''<div style={{display:"flex",flexDirection:"row",gap:10,marginRight:10,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"up");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▲</button>
            <button onClick={e=>{e.stopPropagation();moveReport(r.id,"down");}}
              style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>▼</button>
          </div>'''

    if old_1 in content:
        content = content.replace(old_1, new_1)
        modifiche_applicate.append("1) Report: frecce affiancate")
    else:
        modifiche_fallite.append("1) Report: frecce affiancate (blocco non trovato — forse il file e' gia' stato modificato manualmente)")

    # ====================================================================
    # MODIFICA 2: Calendari (Impostazioni) — frecce ↑↓ più distanziate
    # ====================================================================
    old_2 = '''<button onClick={async()=>{
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

    new_2 = '''<div style={{display:"flex",alignItems:"center",gap:10}}>
                <button onClick={async()=>{
                  if(ci===0) return;
                  const newCals=[...store.calendars];
                  [newCals[ci-1],newCals[ci]]=[newCals[ci],newCals[ci-1]];
                  setStore(s=>({...s,calendars:newCals}));
                  for(let i=0;i<newCals.length;i++) await updateCalendar(newCals[i].id,{sort_order:i});
                }} style={{background:"none",border:"none",color:ci===0?T.border:T.sub,cursor:ci===0?"default":"pointer",fontSize:18,padding:"0 4px"}}>▲</button>
                <button onClick={async()=>{
                  if(ci===store.calendars.length-1) return;
                  const newCals=[...store.calendars];
                  [newCals[ci],newCals[ci+1]]=[newCals[ci+1],newCals[ci]];
                  setStore(s=>({...s,calendars:newCals}));
                  for(let i=0;i<newCals.length;i++) await updateCalendar(newCals[i].id,{sort_order:i});
                }} style={{background:"none",border:"none",color:ci===store.calendars.length-1?T.border:T.sub,cursor:ci===store.calendars.length-1?"default":"pointer",fontSize:18,padding:"0 4px"}}>▼</button>
              </div>'''

    if old_2 in content:
        content = content.replace(old_2, new_2)
        modifiche_applicate.append("2) Calendari: frecce piu' distanziate (↑↓ → ▲▼)")
    else:
        modifiche_fallite.append("2) Calendari: frecce piu' distanziate (blocco non trovato — forse il file e' gia' stato modificato manualmente)")

    # ====================================================================
    # RISULTATO
    # ====================================================================
    print("=" * 60)
    if modifiche_applicate:
        # backup solo se c'e' almeno una modifica da scrivere
        backup_path = path.with_suffix(path.suffix + ".bak")
        shutil.copy2(path, backup_path)
        path.write_text(content, encoding="utf-8")
        print(f"✅ Backup creato: {backup_path}")
        print(f"✅ {FILE_NAME} aggiornato con successo.\n")
        print("Modifiche applicate:")
        for m in modifiche_applicate:
            print(f"  ✔ {m}")
    else:
        print("⚠️  Nessuna modifica applicata (nessun blocco corrispondente trovato).")

    if modifiche_fallite:
        print("\nModifiche NON applicate:")
        for m in modifiche_fallite:
            print(f"  ✘ {m}")
        print("\n→ Se il codice e' stato cambiato a mano nel frattempo, mandami la")
        print("  sezione aggiornata e ti preparo uno script corretto.")
    print("=" * 60)


if __name__ == "__main__":
    main()
