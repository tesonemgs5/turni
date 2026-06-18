#!/usr/bin/env python3
"""
patch_app.py — Patch minimo sulla versione corrente di App.jsx

PATCH 1: Aggiunge funzione moveReport dopo renameReport
PATCH 2: Aggiunge UN SOLO pulsante ricarica accanto a TUTTI
         (controlla prima se già presente per evitare duplicati)

Uso:
  python patch_app.py            # cerca App.jsx nella cartella corrente
  python patch_app.py <percorso>
"""

import sys
import os

class PatchError(Exception):
    pass


def patch(src: str) -> str:
    errors = []

    # ══════════════════════════════════════════════════════════════
    # PATCH 1 — Aggiunge moveReport
    # ══════════════════════════════════════════════════════════════
    if 'function moveReport' in src:
        print("  ℹ️  PATCH 1: moveReport già presente, salto.")
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
            errors.append("PATCH 1: funzione renameReport non trovata")
        else:
            src = src.replace(OLD_RENAME, NEW_RENAME)

    # ══════════════════════════════════════════════════════════════
    # PATCH 2 — Pulsante ricarica accanto a TUTTI (solo se assente)
    # ══════════════════════════════════════════════════════════════
    if 'syncFromSheets()' in src and 'Ricarica dati' in src:
        # Controlla se ce ne sono due (duplicato)
        if src.count('Ricarica dati') > 1:
            # Rimuovi il duplicato tenendo solo il primo
            first = src.index('Ricarica dati')
            second = src.index('Ricarica dati', first + 1)
            # Trova inizio del blocco button duplicato (~80 chars prima)
            chunk_start = src.rfind('<button', 0, second)
            chunk_end = src.index('</button>', second) + len('</button>')
            src = src[:chunk_start] + src[chunk_end:]
            print("  ℹ️  PATCH 2: rimosso pulsante ricarica duplicato.")
        else:
            print("  ℹ️  PATCH 2: pulsante ricarica già presente, salto.")
    else:
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
            errors.append("PATCH 2: pulsante TUTTI non trovato")
        else:
            src = src.replace(OLD_TUTTI, NEW_TUTTI)

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
        sys.exit(1)

    print(f"📂 Leggo: {path}")
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    try:
        patched = patch(src)
    except PatchError as e:
        print("\n❌ Patch NON applicata — nessun file scritto. Errori trovati:\n")
        print(str(e))
        sys.exit(1)

    out_path = path.replace("App.jsx", "App_updated.jsx")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(patched)

    print()
    print("✅ Patch applicate con successo!")
    print()
    print("  PATCH 1 ✓ — Funzione moveReport aggiunta (frecce ▲▼ funzionanti)")
    print("  PATCH 2 ✓ — Pulsante 🔄 ricarica (senza duplicati)")
    print()
    print(f"📄 File salvato: {out_path}")


if __name__ == "__main__":
    main()
