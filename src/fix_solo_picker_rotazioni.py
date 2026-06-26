#!/usr/bin/env python3
"""
Aggiunge solo la sezione "Rotazioni" nel modal "Scegli modello" (showModelloPicker).
Il fix del bottone modifica (✏️) sulla RotazioneCard è già presente in App.jsx,
quindi questo script tocca solo il blocco del picker.

Legge App.jsx, scrive App_updated.jsx
"""

import os, sys

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

print("="*70)
print(" Avvio script: fix_solo_picker_rotazioni.py")
print("="*70)

if not os.path.exists(FILE_INPUT):
    print(f"\n❌ ERRORE: non trovo '{FILE_INPUT}' nella cartella corrente.")
    sys.exit(1)

with open(FILE_INPUT, "rb") as f:
    raw = f.read()

# Normalizza i fine riga: il file potrebbe avere CRLF (\r\n) per essere
# stato salvato/modificato su Windows, mentre i blocchi target sotto
# sono scritti con solo \n. Senza questa normalizzazione il confronto
# esatto fallisce anche se il testo è identico.
content = raw.decode("utf-8", errors="replace").replace("\r\n", "\n")
usava_crlf = b"\r\n" in raw
print(f"\n✓ Letto {FILE_INPUT} ({len(content)} caratteri, CRLF normalizzato: {'si' if usava_crlf else 'non serviva'})")

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

if old not in content:
    print("\n❌ ERRORE: blocco modal showModelloPicker non trovato.")
    print("   Nessun file App_updated.jsx creato.")
    sys.exit(1)

content = content.replace(old, new, 1)

if usava_crlf:
    content = content.replace("\n", "\r\n")

with open(FILE_OUTPUT, "w", encoding="utf-8", newline="") as f:
    f.write(content)

print(f"\n✅ OK -> creato {FILE_OUTPUT}")
print("Aggiunta sezione Rotazioni nel modal 'Scegli modello'.")
