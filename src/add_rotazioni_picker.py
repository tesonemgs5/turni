#!/usr/bin/env python3
"""
Aggiunge una sezione "Rotazioni" nel modal "Scegli modello" (showModelloPicker).
Cliccando una rotazione, imposta dataInizio = giorno selezionato (dayKey),
salva su Supabase e apre la griglia (showRotDetail) per vedere il ciclo.

Legge App.jsx, scrive App_updated.jsx
"""

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

with open(FILE_INPUT, "r", encoding="utf-8") as f:
    content = f.read()

old = '''            {(activeCal?.shifts||[]).length>0&&(
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
            )}'''

new = '''            {(activeCal?.shifts||[]).length>0&&(
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
            )}'''

if old not in content:
    raise SystemExit("ERRORE: blocco 'activeCal?.shifts' nel modal showModelloPicker non trovato.")
content = content.replace(old, new, 1)

with open(FILE_OUTPUT, "w", encoding="utf-8") as f:
    f.write(content)

print(f"OK -> creato {FILE_OUTPUT}")
print("Aggiunta sezione Rotazioni nel modal 'Scegli modello':")
print("  - click su rotazione -> dataInizio = giorno selezionato, salva, apre griglia ciclo")
