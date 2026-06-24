INPUT  = "App.jsx"
OUTPUT = "App_updated.jsx"

with open(INPUT, "r", encoding="utf-8") as f:
    src = f.read()

old = """                  <SmartTimeInput value={form.tIn||""} onChange={v=>setForm(f=>({...f,tIn:v,tOut:""}))}
                    style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>

                </div>"""

new = """                  <SmartTimeInput value={form.tIn||""} onChange={v=>setForm(f=>({...f,tIn:v,tOut:""}))}
                    style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
                  <div style={{display:"flex",gap:4,marginTop:5}}>
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

if old in src:
    src = src.replace(old, new)
    print("✓ Bottoni protrazione aggiunti")
else:
    print("✗ Blocco NON trovato")

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(src)

print(f"✅ Fatto → {OUTPUT}")
