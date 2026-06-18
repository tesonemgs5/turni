#!/usr/bin/env python3
"""
patch_app.py — Applica tutte le modifiche richieste ad App.jsx

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
    # PATCH 1 — Conferma prima di cancellare calendario
    # ══════════════════════════════════════════════════════════════
    OLD_DEL_CAL = '''\
              <button onClick={async()=>{
                await deleteCalendar(c.id);
                const newCals=store.calendars.filter(x=>x.id!==c.id);
                setStore(s=>({...s,calendars:newCals}));
                saveToSheets(store.events,newCals);
              }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18}}>×</button>'''

    NEW_DEL_CAL = '''\
              <button onClick={async()=>{
                if(!window.confirm(`Eliminare il calendario "${c.name}"? Tutti gli eventi associati verranno persi.`)) return;
                await deleteCalendar(c.id);
                const newCals=store.calendars.filter(x=>x.id!==c.id);
                setStore(s=>({...s,calendars:newCals}));
                saveToSheets(store.events,newCals);
              }} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18}}>×</button>'''

    if OLD_DEL_CAL not in src:
        errors.append("PATCH 1: pulsante elimina calendario non trovato")
    else:
        src = src.replace(OLD_DEL_CAL, NEW_DEL_CAL)

    # ══════════════════════════════════════════════════════════════
    # PATCH 2 — Header modelli: rimuovi Sposta/Blocca, ↑↓ diventa toggle
    # ══════════════════════════════════════════════════════════════
    OLD_HEADER_BTNS = '''\
              <button onClick={()=>setShowMoveMode(s=>!s)}
                style={{background:showMoveMode?accent:T.s2,
                  border:`1px solid ${showMoveMode?accent:T.border}`,borderRadius:8,
                  padding:"6px 10px",fontSize:13,fontWeight:700,cursor:"pointer",
                  color:showMoveMode?"#fff":T.sub}}>
                {showMoveMode?"🔒 Blocca":"↕️ Sposta"}
              </button>
              <button onClick={()=>setShowSortMenu(s=>!s)}
                style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:8,
                  padding:"6px 10px",fontSize:18,cursor:"pointer",color:T.sub}}>↑↓</button>'''

    NEW_HEADER_BTNS = '''\
              <button onClick={()=>setShowMoveMode(s=>!s)}
                title={showMoveMode?"Spostamento attivo — clicca per bloccare":"Attiva spostamento"}
                style={{background:showMoveMode?accent:T.s2,
                  border:`1px solid ${showMoveMode?accent:T.border}`,borderRadius:8,
                  padding:"6px 10px",fontSize:18,fontWeight:700,cursor:"pointer",
                  color:showMoveMode?"#fff":T.sub}}>↑↓</button>'''

    if OLD_HEADER_BTNS not in src:
        errors.append("PATCH 2: blocco pulsanti header (Sposta/Blocca + ↑↓) non trovato")
    else:
        src = src.replace(OLD_HEADER_BTNS, NEW_HEADER_BTNS)

    # ══════════════════════════════════════════════════════════════
    # PATCH 3 — Drag&drop e touch attivi SOLO se showMoveMode
    # ══════════════════════════════════════════════════════════════
    OLD_DRAG = '''\
                    onTouchStart={()=>{touchSrcId.current=m.id;}}
                    onTouchMove={(e)=>{
                      e.preventDefault();
                      const t=e.touches[0];
                      const el=document.elementFromPoint(t.clientX,t.clientY);
                      const card=el?.closest("[data-modello-id]");
                      if(card) touchTargetId.current=card.getAttribute("data-modello-id");
                    }}
                    onTouchEnd={async()=>{
                      if(!touchSrcId.current||!touchTargetId.current||touchSrcId.current===touchTargetId.current){touchSrcId.current=null;touchTargetId.current=null;return;}
                      const sorted=[...modelli].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
                      const srcIdx=sorted.findIndex(x=>x.id===touchSrcId.current);
                      const dstIdx=sorted.findIndex(x=>x.id===touchTargetId.current);
                      if(srcIdx===-1||dstIdx===-1){touchSrcId.current=null;touchTargetId.current=null;return;}
                      const reordered=[...sorted];
                      const [moved]=reordered.splice(srcIdx,1);
                      reordered.splice(dstIdx,0,moved);
                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder);
                      for(const x of withNewOrder){
                        await supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      touchSrcId.current=null;touchTargetId.current=null;
                    }}
                    onDragStart={()=>{dragSrcId.current=m.id;}}
                    onDragOver={(e)=>{e.preventDefault();}}
                    onDrop={async()=>{
                      if(!dragSrcId.current||dragSrcId.current===m.id) return;
                      const sorted=[...modelli].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
                      const srcIdx=sorted.findIndex(x=>x.id===dragSrcId.current);
                      const dstIdx=sorted.findIndex(x=>x.id===m.id);
                      if(srcIdx===-1||dstIdx===-1) return;
                      const reordered=[...sorted];
                      const [moved]=reordered.splice(srcIdx,1);
                      reordered.splice(dstIdx,0,moved);
                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder);
                      for(const x of withNewOrder){
                        await supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      dragSrcId.current=null;
                    }}/>'''

    NEW_DRAG = '''\
                    onTouchStart={showMoveMode?()=>{touchSrcId.current=m.id;}:null}
                    onTouchMove={showMoveMode?(e)=>{
                      e.preventDefault();
                      const t=e.touches[0];
                      const el=document.elementFromPoint(t.clientX,t.clientY);
                      const card=el?.closest("[data-modello-id]");
                      if(card) touchTargetId.current=card.getAttribute("data-modello-id");
                    }:null}
                    onTouchEnd={showMoveMode?async()=>{
                      if(!touchSrcId.current||!touchTargetId.current||touchSrcId.current===touchTargetId.current){touchSrcId.current=null;touchTargetId.current=null;return;}
                      const sorted=[...modelli].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
                      const srcIdx=sorted.findIndex(x=>x.id===touchSrcId.current);
                      const dstIdx=sorted.findIndex(x=>x.id===touchTargetId.current);
                      if(srcIdx===-1||dstIdx===-1){touchSrcId.current=null;touchTargetId.current=null;return;}
                      const reordered=[...sorted];
                      const [moved]=reordered.splice(srcIdx,1);
                      reordered.splice(dstIdx,0,moved);
                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder);
                      for(const x of withNewOrder){
                        await supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      touchSrcId.current=null;touchTargetId.current=null;
                    }:null}
                    onDragStart={showMoveMode?()=>{dragSrcId.current=m.id;}:null}
                    onDragOver={showMoveMode?(e)=>{e.preventDefault();}:null}
                    onDrop={showMoveMode?async()=>{
                      if(!dragSrcId.current||dragSrcId.current===m.id) return;
                      const sorted=[...modelli].sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
                      const srcIdx=sorted.findIndex(x=>x.id===dragSrcId.current);
                      const dstIdx=sorted.findIndex(x=>x.id===m.id);
                      if(srcIdx===-1||dstIdx===-1) return;
                      const reordered=[...sorted];
                      const [moved]=reordered.splice(srcIdx,1);
                      reordered.splice(dstIdx,0,moved);
                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder);
                      for(const x of withNewOrder){
                        await supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      dragSrcId.current=null;
                    }:null}/>'''

    if OLD_DRAG not in src:
        errors.append("PATCH 3: blocco drag&drop/touch in modelliView non trovato")
    else:
        src = src.replace(OLD_DRAG, NEW_DRAG)

    # ══════════════════════════════════════════════════════════════
    # PATCH 4 — ModelloCard: conferma prima di eliminare modello
    # ══════════════════════════════════════════════════════════════
    OLD_DEL_MOD = '''\
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questo modello?"))onDelete();}}'''

    if OLD_DEL_MOD not in src:
        OLD_DEL_MOD_OLD = '''\
      <button onClick={e=>{e.stopPropagation();onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,
          padding:"0 4px",marginRight:4}}>×</button>'''
        NEW_DEL_MOD_NEW = '''\
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questo modello?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,
          padding:"0 4px",marginRight:4}}>×</button>'''
        if OLD_DEL_MOD_OLD not in src:
            errors.append("PATCH 4: pulsante elimina modello in ModelloCard non trovato (né versione con né senza confirm)")
        else:
            src = src.replace(OLD_DEL_MOD_OLD, NEW_DEL_MOD_NEW)

    # ══════════════════════════════════════════════════════════════
    # PATCH 5 — RotazioneCard: conferma prima di eliminare rotazione
    # ══════════════════════════════════════════════════════════════
    OLD_DEL_ROT = '''\
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questa rotazione?"))onDelete();}}'''
    if OLD_DEL_ROT not in src:
        OLD_DEL_ROT_OLD = '''\
      <button onClick={e=>{e.stopPropagation();onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:4}}>×</button>'''
        NEW_DEL_ROT_NEW = '''\
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questa rotazione?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:4}}>×</button>'''
        if OLD_DEL_ROT_OLD not in src:
            errors.append("PATCH 5: pulsante elimina rotazione in RotazioneCard non trovato")
        else:
            src = src.replace(OLD_DEL_ROT_OLD, NEW_DEL_ROT_NEW)

    # ══════════════════════════════════════════════════════════════
    # PATCH 6 — Report: tendina "Aggiungi report" espandibile
    # ══════════════════════════════════════════════════════════════
    OLD_REPORT_ADD = '''\
      {/* Pannello aggiungi report */}
      <div style={{margin:"16px 12px 0"}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6,paddingLeft:4}}>Aggiungi report</div>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
          {REPORT_TEMPLATES.map((tmpl,i,arr)=>(
            <div key={tmpl.type} style={{display:"flex",alignItems:"center",padding:"12px 14px",
              borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
              <button onClick={()=>addReport(tmpl.type)}
                style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
                  background:"#22c55e",color:"#fff",fontSize:18,fontWeight:700,
                  display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
                +
              </button>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:T.text}}>{tmpl.label}</div>
                <div style={{fontSize:11,color:T.sub}}>{tmpl.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>'''

    NEW_REPORT_ADD = '''\
      {/* Pannello aggiungi report */}
      {(()=>{
        const [showAdd, setShowAdd] = (typeof useState !== "undefined" ? [false, ()=>{}] : [false, ()=>{}]);
        // Usiamo openReportConfig===\'__add__\' come flag per mostrare il pannello aggiungi
        const isAddOpen = openReportConfig===\'__add__\';
        return (
          <div style={{margin:"16px 12px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:6,paddingLeft:4,cursor:"pointer"}}
              onClick={()=>setOpenReportConfig(isAddOpen?null:\'__add__\')}>
              <div style={{fontSize:11,color:T.sub,fontWeight:700}}>Aggiungi report</div>
              <span style={{color:T.sub,fontSize:12}}>{isAddOpen?"▲":"▼"}</span>
            </div>
            {isAddOpen&&(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                {REPORT_TEMPLATES.map((tmpl,i,arr)=>(
                  <div key={tmpl.type} style={{display:"flex",alignItems:"center",padding:"12px 14px",
                    borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <button onClick={()=>{addReport(tmpl.type);setOpenReportConfig(null);}}
                      style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",
                        background:"#22c55e",color:"#fff",fontSize:18,fontWeight:700,
                        display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
                      +
                    </button>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:T.text}}>{tmpl.label}</div>
                      <div style={{fontSize:11,color:T.sub}}>{tmpl.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}'''

    if OLD_REPORT_ADD not in src:
        errors.append("PATCH 6: pannello 'Aggiungi report' non trovato")
    else:
        src = src.replace(OLD_REPORT_ADD, NEW_REPORT_ADD)

    # ══════════════════════════════════════════════════════════════
    # PATCH 7 — sortedModelli: intestazioni in cima al proprio gruppo
    # ══════════════════════════════════════════════════════════════
    OLD_SORT = '''\
    const INTESTAZIONI=["MATTINA","POMERIGGIO","3° TURNO","NOTTE"];
    return [...modelli].sort((a,b)=>{
      const minsA=getSortMins(a);
      const minsB=getSortMins(b);
      if(minsA!==minsB) return minsA-minsB;
      // stesso orario: intestazione viene prima
      const aInt=INTESTAZIONI.includes(a.titolo);
      const bInt=INTESTAZIONI.includes(b.titolo);
      if(aInt&&!bInt) return -1;
      if(!aInt&&bInt) return 1;
      return 0;
    });
  }'''

    NEW_SORT = '''\
    const INTESTAZIONI=["MATTINA","POMERIGGIO","3° TURNO","NOTTE"];

    // Ogni intestatario definisce l'inizio del proprio gruppo orario.
    const GRUPPO_RANGES=[
      {titolo:"MATTINA",    minStart:6*60,     minEnd:11*60+59},
      {titolo:"POMERIGGIO", minStart:12*60,    minEnd:16*60+29},
      {titolo:"3° TURNO",   minStart:16*60+30, minEnd:22*60+59},
      {titolo:"NOTTE",      minStart:23*60,    minEnd:5*60+59}, // wrap mezzanotte
    ];

    function isIntestatario(m){
      return INTESTAZIONI.includes(m.titolo)&&(m.tempo==="h24"||!m.inizio);
    }

    function getGruppoKey(m){
      if(isIntestatario(m)) return m.titolo;
      if(!m.inizio||m.tempo==="h24") return null;
      const[h,min]=m.inizio.split(":").map(Number);
      const t=h*60+min;
      for(const g of GRUPPO_RANGES){
        if(g.minStart<=g.minEnd){
          if(t>=g.minStart&&t<=g.minEnd) return g.titolo;
        } else {
          if(t>=g.minStart||t<=g.minEnd) return g.titolo;
        }
      }
      return null;
    }

    return [...modelli].sort((a,b)=>{
      const gA=getGruppoKey(a);
      const gB=getGruppoKey(b);

      if(gA&&gB&&gA===gB){
        const aInt=isIntestatario(a);
        const bInt=isIntestatario(b);
        if(aInt&&!bInt) return -1;
        if(!aInt&&bInt) return 1;
        const minsA=getSortMins(a);
        const minsB=getSortMins(b);
        if(minsA!==minsB) return minsA-minsB;
        return (a.sortOrder||0)-(b.sortOrder||0);
      }

      const minsA=getSortMins(a);
      const minsB=getSortMins(b);
      if(minsA!==minsB) return minsA-minsB;

      const aInt=isIntestatario(a);
      const bInt=isIntestatario(b);
      if(aInt&&!bInt) return -1;
      if(!aInt&&bInt) return 1;
      return (a.sortOrder||0)-(b.sortOrder||0);
    });
  }'''

    if OLD_SORT not in src:
        errors.append("PATCH 7: coda sortedModelli() non trovata")
    else:
        src = src.replace(OLD_SORT, NEW_SORT)

    # ══════════════════════════════════════════════════════════════
    if errors:
        raise PatchError("\n".join(f"  ❌ {e}" for e in errors))

    return src


def main():
    # Se viene passato un argomento usa quello, altrimenti cerca App.jsx nella cartella corrente
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
    print("  PATCH 1 ✓ — Conferma prima di eliminare calendario")
    print("  PATCH 2 ✓ — Header modelli: ↑↓ unico toggle spostamento")
    print("  PATCH 3 ✓ — Drag&drop/touch attivi solo con spostamento attivo")
    print("  PATCH 4 ✓ — Conferma prima di eliminare modello")
    print("  PATCH 5 ✓ — Conferma prima di eliminare rotazione")
    print("  PATCH 6 ✓ — Tendina 'Aggiungi report' espandibile")
    print("  PATCH 7 ✓ — Intestazioni in cima al proprio gruppo orario")
    print()
    print(f"📄 File salvato: {out_path}")


if __name__ == "__main__":
    main()
