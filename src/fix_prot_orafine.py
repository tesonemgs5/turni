INPUT  = "App.jsx"
OUTPUT = "App_updated.jsx"

with open(INPUT, "r", encoding="utf-8") as f:
    src = f.read()

old = """                  <div style={{display:"flex",gap:4,marginTop:5}}>
                    <button type="button" onClick={()=>setForm(f=>({...f,straordinarioTipo:f.straordinarioTipo==="pagamento"?null:"pagamento"}))}
                      style={{flex:1,padding:"5px 2px",borderRadius:8,cursor:"pointer",
                        fontSize:9,fontWeight:800,lineHeight:1.2,textAlign:"center",
                        background:form.straordinarioTipo==="pagamento"?"#8b5cf6":T.surface,
                        color:form.straordinarioTipo==="pagamento"?"#fff":T.sub,
                        border:`1.5px solid ${form.straordinarioTipo==="pagamento"?"#8b5cf6":T.border}`}}>
                      PROTRAZIONE A PAGAMENTO
                    </button>
                    <button type="button" onClick={()=>setForm(f=>({...f,straordinarioTipo:f.straordinarioTipo==="recupero"?null:"recupero"}))}
                      style={{flex:1,padding:"5px 2px",borderRadius:8,cursor:"pointer",
                        fontSize:9,fontWeight:800,lineHeight:1.2,textAlign:"center",
                        background:form.straordinarioTipo==="recupero"?"#64748b":T.surface,
                        color:form.straordinarioTipo==="recupero"?"#fff":T.sub,
                        border:`1.5px solid ${form.straordinarioTipo==="recupero"?"#64748b":T.border}`}}>
                      PROTRAZIONE A RECUPERO
                    </button>
                  </div>
                </div>"""

new = """                  <div style={{display:"flex",gap:4,marginTop:5}}>
                    <button type="button" onClick={()=>setForm(f=>({...f,straordinarioTipo:f.straordinarioTipo==="pagamento"?null:"pagamento",protrazioneOraFine:""}))}
                      style={{flex:1,padding:"5px 2px",borderRadius:8,cursor:"pointer",
                        fontSize:9,fontWeight:800,lineHeight:1.2,textAlign:"center",
                        background:form.straordinarioTipo==="pagamento"?"#8b5cf6":T.surface,
                        color:form.straordinarioTipo==="pagamento"?"#fff":T.sub,
                        border:`1.5px solid ${form.straordinarioTipo==="pagamento"?"#8b5cf6":T.border}`}}>
                      PROTRAZIONE A PAGAMENTO
                    </button>
                    <button type="button" onClick={()=>setForm(f=>({...f,straordinarioTipo:f.straordinarioTipo==="recupero"?null:"recupero",protrazioneOraFine:""}))}
                      style={{flex:1,padding:"5px 2px",borderRadius:8,cursor:"pointer",
                        fontSize:9,fontWeight:800,lineHeight:1.2,textAlign:"center",
                        background:form.straordinarioTipo==="recupero"?"#64748b":T.surface,
                        color:form.straordinarioTipo==="recupero"?"#fff":T.sub,
                        border:`1.5px solid ${form.straordinarioTipo==="recupero"?"#64748b":T.border}`}}>
                      PROTRAZIONE A RECUPERO
                    </button>
                  </div>
                  {form.straordinarioTipo&&(()=>{
                    const colProt = form.straordinarioTipo==="pagamento"?"#8b5cf6":"#64748b";
                    const oraFine = form.protrazioneOraFine||"";
                    const tBase = form.tOut||calcFine6h15(form.tIn)||"";
                    let durProt="";
                    if(oraFine&&tBase){
                      const [h1,m1]=tBase.split(":").map(Number);
                      const [h2,m2]=oraFine.split(":").map(Number);
                      let d=(h2*60+m2)-(h1*60+m1);
                      if(d<0) d+=24*60;
                      if(d>0) durProt=Math.floor(d/60)+"h"+(d%60>0?" "+d%60+"m":"");
                    }
                    return (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                        <div style={{background:T.surface,border:`1.5px solid ${colProt}`,borderRadius:8,
                          padding:"4px 8px",minWidth:48,textAlign:"center",flexShrink:0}}>
                          <div style={{fontSize:8,color:T.sub,fontWeight:700}}>DURATA</div>
                          <div style={{fontSize:12,fontWeight:900,color:colProt}}>{durProt||"—"}</div>
                        </div>
                        <SmartTimeInput value={oraFine} onChange={v=>setForm(f=>({...f,protrazioneOraFine:v}))}
                          style={{flex:1,background:T.surface,border:`1.5px solid ${colProt}`,
                            borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
                      </div>
                    );
                  })()}
                </div>"""

if old in src:
    src = src.replace(old, new)
    print("✓ Campo ora fine protrazione aggiunto")
else:
    print("✗ Blocco NON trovato")

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(src)

print(f"✅ Fatto → {OUTPUT}")
