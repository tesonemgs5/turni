import sys, shutil
from pathlib import Path

def fix(path):
    p = Path(path)
    src = p.read_text(encoding="utf-8")

    # PROBLEMA: la </div> che chiude <div position:relative> (palette)
    # sta PRIMA del blocco Freccia, lasciando la div esterna aperta.
    # Poi c'è un'altra </div> finale che Rollup non riesce a matchare.
    #
    # STRUTTURA ERRATA:
    #       )}          ← chiude showCalPal&&(...)
    #     </div>        ← chiude <div position:relative>  ← QUESTA è fuori posto
    #     {/* Freccia cambio calendario */}
    #     {store&&...&&(
    #       <div>...</div>
    #     )}
    #     </div>        ← div extra senza apertura
    #     );
    #
    # STRUTTURA CORRETTA:
    #       )}          ← chiude showCalPal&&(...)
    #       </div>      ← chiude <div position:relative> (dentro la div esterna)
    #       {/* Freccia... */}
    #       {store&&...&&(...)}
    #     </div>        ← chiude la div esterna
    #     );

    OLD = (
        "      )}\n"
        "    </div>\n"
        "    {/* Freccia cambio calendario */}\n"
        "    {store&&store.calendars&&store.calendars.length>1&&(\n"
        "      <div style={{position:\"relative\"}}>\n"
        "        <button onClick={()=>{ setShowCalSwitch(s=>!s); setShowCalPal(false); }}\n"
        "          style={{background:coloreCal,border:\"none\",borderRadius:\"50%\",\n"
        "            width:24,height:24,cursor:\"pointer\",display:\"flex\",alignItems:\"center\",\n"
        "            justifyContent:\"center\",color:testoContrasto,fontSize:14,fontWeight:900}}>\n"
        "          ▾\n"
        "        </button>\n"
        "        {showCalSwitch&&(\n"
        "          <div style={{position:\"absolute\",top:28,left:0,background:T.surface,\n"
        "            border:`1px solid ${T.border}`,borderRadius:12,padding:6,zIndex:500,\n"
        "            boxShadow:\"0 8px 32px rgba(0,0,0,0.25)\",minWidth:140}}\n"
        "            onClick={e=>e.stopPropagation()}>\n"
        "            {(store.calendars||[]).map(c=>(\n"
        "              <div key={c.id} onClick={()=>{ setCalId&&setCalId(c.id); setShowCalSwitch(false); }}\n"
        "                style={{display:\"flex\",alignItems:\"center\",gap:8,padding:\"8px 10px\",\n"
        "                  borderRadius:8,cursor:\"pointer\",\n"
        "                  background:c.id===calId?accent+\"18\":\"transparent\"}}>\n"
        "                <div style={{width:10,height:10,borderRadius:\"50%\",background:c.color}}/>\n"
        "                <span style={{fontSize:13,fontWeight:c.id===calId?700:400,\n"
        "                  color:c.id===calId?accent:T.text}}>{c.name}</span>\n"
        "                {c.id===calId&&<span style={{color:accent,fontSize:11}}>✓</span>}\n"
        "              </div>\n"
        "            ))}\n"
        "          </div>\n"
        "        )}\n"
        "      </div>\n"
        "    )}\n"
        "    </div>\n"
        "    );\n"
        "}"
    )

    NEW = (
        "      )}\n"
        "      </div>\n"
        "      {/* Freccia cambio calendario */}\n"
        "      {store&&store.calendars&&store.calendars.length>1&&(\n"
        "        <div style={{position:\"relative\"}}>\n"
        "          <button onClick={()=>{ setShowCalSwitch(s=>!s); setShowCalPal(false); }}\n"
        "            style={{background:coloreCal,border:\"none\",borderRadius:\"50%\",\n"
        "              width:24,height:24,cursor:\"pointer\",display:\"flex\",alignItems:\"center\",\n"
        "              justifyContent:\"center\",color:testoContrasto,fontSize:14,fontWeight:900}}>\n"
        "            ▾\n"
        "          </button>\n"
        "          {showCalSwitch&&(\n"
        "            <div style={{position:\"absolute\",top:28,left:0,background:T.surface,\n"
        "              border:`1px solid ${T.border}`,borderRadius:12,padding:6,zIndex:500,\n"
        "              boxShadow:\"0 8px 32px rgba(0,0,0,0.25)\",minWidth:140}}\n"
        "              onClick={e=>e.stopPropagation()}>\n"
        "              {(store.calendars||[]).map(c=>(\n"
        "                <div key={c.id} onClick={()=>{ setCalId&&setCalId(c.id); setShowCalSwitch(false); }}\n"
        "                  style={{display:\"flex\",alignItems:\"center\",gap:8,padding:\"8px 10px\",\n"
        "                    borderRadius:8,cursor:\"pointer\",\n"
        "                    background:c.id===calId?accent+\"18\":\"transparent\"}}>\n"
        "                  <div style={{width:10,height:10,borderRadius:\"50%\",background:c.color}}/>\n"
        "                  <span style={{fontSize:13,fontWeight:c.id===calId?700:400,\n"
        "                    color:c.id===calId?accent:T.text}}>{c.name}</span>\n"
        "                  {c.id===calId&&<span style={{color:accent,fontSize:11}}>✓</span>}\n"
        "                </div>\n"
        "              ))}\n"
        "            </div>\n"
        "          )}\n"
        "        </div>\n"
        "      )}\n"
        "    </div>\n"
        "  );\n"
        "}"
    )

    if OLD not in src:
        print("❌ Pattern non trovato.")
        idx = src.find("Freccia cambio calendario")
        if idx > 0:
            print("Contesto trovato:")
            print(repr(src[idx-200:idx+400]))
        sys.exit(1)

    out = src.replace(OLD, NEW, 1)
    bak = p.with_suffix(".jsx.bak")
    shutil.copy(p, bak)
    print(f"Backup → {bak}")
    p.write_text(out, encoding="utf-8")
    print("✅ CalBadge corretto!")
    print("Ora esegui: npm run build")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python fix_calbadge_final.py src/App.jsx")
        sys.exit(1)
    fix(sys.argv[1])
