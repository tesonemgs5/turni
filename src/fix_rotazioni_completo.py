#!/usr/bin/env python3
"""
Applica due modifiche ad App.jsx:
  1. Aggiunge tasto modifica (✏️) sulla card rotazione
  2. Aggiunge sezione "Rotazioni" nel modal "Scegli modello" (showModelloPicker):
     cliccando una rotazione, imposta dataInizio = giorno selezionato e apre la griglia

Legge App.jsx dalla cartella corrente, scrive App_updated.jsx.
Se un blocco non viene trovato, lo script si ferma e stampa esattamente quale.
"""

import os
import sys

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

print("="*70)
print(" Avvio script: fix_rotazioni_completo.py")
print("="*70)

if not os.path.exists(FILE_INPUT):
    print(f"\n❌ ERRORE: non trovo '{FILE_INPUT}' nella cartella corrente.")
    print(f"   Cartella corrente: {os.getcwd()}")
    print("   Verifica di aver lanciato istruzioni.py nella cartella giusta.")
    sys.exit(1)

with open(FILE_INPUT, "r", encoding="utf-8") as f:
    content = f.read()

print(f"\n✓ Letto {FILE_INPUT} ({len(content)} caratteri)")

errori = []

# ───────────────────────────────────────────────────────────────
# FIX 1a: passare onEdit a RotazioneCard nella chiamata (sezione 12)
# ───────────────────────────────────────────────────────────────
old_1 = '''                    <RotazioneCard r={r} T={T} accent={accent} modelli={modelli}
                      onOpen={()=>setShowRotDetail(r.id)}
                      onDelete={()=>deleteRotazione(r.id)}/>'''

new_1 = '''                    <RotazioneCard r={r} T={T} accent={accent} modelli={modelli}
                      onOpen={()=>setShowRotDetail(r.id)}
                      onEdit={()=>{ setEditRotazione(r); setRotForm({
                        tipo:r.tipo, titolo:r.titolo||"", dataInizio:r.dataInizio||"",
                        nSettimane:r.nSettimane||52, modellaLavoroId:r.modellaLavoroId||null,
                        modelloNLId:r.modelloNLId||null, modelloRSId:r.modelloRSId||null,
                      }); setShowRotForm(true); }}
                      onDelete={()=>deleteRotazione(r.id)}/>'''

if old_1 in content:
    content = content.replace(old_1, new_1, 1)
    print("✓ FIX 1a applicato (chiamata RotazioneCard con onEdit)")
else:
    errori.append("FIX 1a: blocco chiamata <RotazioneCard ... onOpen={()=>setShowRotDetail(r.id)} ... onDelete .../> non trovato")

# ───────────────────────────────────────────────────────────────
# FIX 1b: aggiungere il bottone ✏️ dentro il componente RotazioneCard
# ───────────────────────────────────────────────────────────────
old_2 = '''function RotazioneCard({r, T, accent, modelli, onOpen, onDelete}){
  const tipoLabel = r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL / RS classico":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":" Personalizzata";
  const modelloLav = modelli.find(m=>m.id===r.modellaLavoroId);
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onOpen}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
        {modelloLav&&<div style={{fontSize:11,color:T.sub,marginTop:1}}>Modello: {modelloLav.titolo}</div>}
      </div>
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questa rotazione?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:4}}>×</button>
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}'''

new_2 = '''function RotazioneCard({r, T, accent, modelli, onOpen, onEdit, onDelete}){
  const tipoLabel = r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL / RS classico":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":" Personalizzata";
  const modelloLav = modelli.find(m=>m.id===r.modellaLavoroId);
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onOpen}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
        {modelloLav&&<div style={{fontSize:11,color:T.sub,marginTop:1}}>Modello: {modelloLav.titolo}</div>}
      </div>
      {onEdit&&<button onClick={e=>{e.stopPropagation();onEdit();}}
        style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:16,padding:"0 8px",marginRight:2}}>✏️</button>}
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questa rotazione?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:4}}>×</button>
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}'''

if old_2 in content:
    content = content.replace(old_2, new_2, 1)
    print("✓ FIX 1b applicato (bottone ✏️ in RotazioneCard)")
else:
    errori.append("FIX 1b: definizione 'function RotazioneCard({r, T, accent, modelli, onOpen, onDelete}){' non trovata")

# ───────────────────────────────────────────────────────────────
# FIX 2: sezione Rotazioni nel modal showModelloPicker
# ───────────────────────────────────────────────────────────────
old_3 = '''            {(activeCal?.shifts||[]).length>0&&(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                {activeCal.shifts.map((s,i,arr)=>(
                  <div key={s.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <div onClick={()=>{
                      setForm({modelloId:null,shiftId:s.id,label:s.label,note:"",dur:"allday",
                        tIn:"",tOut:"",place:"",map:"",colorOvr:null,collega:"",auto:""});
                      setShowModelloPicker(false);
                    }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                      <div style={{width:36,height:36,borderRadius:10,background:s.color+"33",
                        border:`2px solid ${s.color}`,display:"flex",alignItems:"center",justifyContent:"center",
                        flexShrink:0,marginRight:12}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:s.color}}/>
                      </div>
                      <div style={{flex:1,fontSize:14,fontWeight:800,color:T.text}}>{s.label}</div>
                      <span style={{color:T.sub,fontSize:14}}>›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div onClick={()=>{
              setForm({modelloId:null,shiftId:null,label:"",note:"",dur:"allday",
                tIn:"",tOut:"",place:"",map:"",colorOvr:null,collega:"",auto:""});
              setShowModelloPicker(false);
            }} style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"12px 14px",
              background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,cursor:"pointer",
              color:T.sub,fontSize:13,fontWeight:700,marginBottom:12}}>
              Evento libero (senza modello)
            </div>'''

new_3 = '''            {(activeCal?.shifts||[]).length>0&&(
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                {activeCal.shifts.map((s,i,arr)=>(
                  <div key={s.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                    <div onClick={()=>{
                      setForm({modelloId:null,shiftId:s.id,label:s.label,note:"",dur:"allday",
                        tIn:"",tOut:"",place:"",map:"",colorOvr:null,collega:"",auto:""});
                      setShowModelloPicker(false);
                    }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                      <div style={{width:36,height:36,borderRadius:10,background:s.color+"33",
                        border:`2px solid ${s.color}`,display:"flex",alignItems:"center",justifyContent:"center",
                        flexShrink:0,marginRight:12}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:s.color}}/>
                      </div>
                      <div style={{flex:1,fontSize:14,fontWeight:800,color:T.text}}>{s.label}</div>
                      <span style={{color:T.sub,fontSize:14}}>›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {rotazioni.length>0&&(
              <>
                <div style={{fontSize:10,color:T.sub,marginBottom:6,fontWeight:600,paddingLeft:2}}>ROTAZIONI — inizia ciclo da questo giorno</div>
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                  {rotazioni.map((r,i,arr)=>{
                    const tipoLabel = r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL / RS classico":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":"📋 Personalizzata";
                    return (
                      <div key={r.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                        <div onClick={async()=>{
                          await saveRotazione({...r, dataInizio: dayKey});
                          setShowModelloPicker(false);
                          setDayKey(null);
                          setShowRotDetail(r.id);
                        }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:15,fontWeight:800,color:T.text,overflow:"hidden",
                              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.titolo||"Senza nome"}</div>
                            <div style={{fontSize:12,color:T.sub,marginTop:1}}>{tipoLabel}</div>
                          </div>
                          <span style={{color:T.sub,fontSize:14}}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div onClick={()=>{
              setForm({modelloId:null,shiftId:null,label:"",note:"",dur:"allday",
                tIn:"",tOut:"",place:"",map:"",colorOvr:null,collega:"",auto:""});
              setShowModelloPicker(false);
            }} style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"12px 14px",
              background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,cursor:"pointer",
              color:T.sub,fontSize:13,fontWeight:700,marginBottom:12}}>
              Evento libero (senza modello)
            </div>'''

if old_3 in content:
    content = content.replace(old_3, new_3, 1)
    print("✓ FIX 2 applicato (sezione Rotazioni nel modal Scegli modello)")
else:
    errori.append("FIX 2: blocco modal showModelloPicker (shifts + evento libero) non trovato")

# ───────────────────────────────────────────────────────────────
if errori:
    print("\n" + "="*70)
    print(" ❌ ATTENZIONE: alcuni blocchi non sono stati trovati/modificati")
    print("="*70)
    for e in errori:
        print(f"  - {e}")
    print("\nQuesto significa che App.jsx in questa cartella è diverso da")
    print("quello previsto (forse non aggiornato, o modificato a mano).")
    print("NESSUN file App_updated.jsx è stato creato.")
    sys.exit(1)

with open(FILE_OUTPUT, "w", encoding="utf-8") as f:
    f.write(content)

print("\n" + "="*70)
print(f" ✅ OK -> creato {FILE_OUTPUT}")
print("="*70)
print("\nModifiche applicate:")
print("  1. RotazioneCard ora ha bottone ✏️ che apre il form di modifica precompilato")
print("  2. Modal 'Scegli modello' ha sezione Rotazioni: click -> imposta inizio ciclo")
