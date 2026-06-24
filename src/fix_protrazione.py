import re

INPUT  = "App.jsx"
OUTPUT = "App_updated.jsx"

with open(INPUT, "r", encoding="utf-8") as f:
    src = f.read()

# ── 1. saveEvt: rimuovi tutto dal commento EVENTO FIGLIO fino a setStore ──────
old_saveEvt_figlio = r"""    // ── EVENTO FIGLIO PROTRAZIONE ─────────────────────────────
    // Se l'utente ha inserito una protrazione (a pagamento o a recupero),
    // crea un evento figlio separato collegato tramite parentId.
    // L'inizio della protrazione è l'uscita effettiva del turno (tOutFinal);
    // se manca, si usa la fine standard come fallback.
    let evtFiglio = null; // "pagamento" | "recupero" | null
    const tipoProtrazione = form.straordinarioTipo;
    const oraFineProtrazione = form.protrazioneOraFine || "";

    function calcMinutiProtrazione(t1, t2){
      if(!t1||!t2) return 0;
      const [h1,m1]=t1.split(":").map(Number);
      const [h2,m2]=t2.split(":").map(Number);
      let d=(h2*60+m2)-(h1*60+m1);
      if(d<0) d+=24*60;
      return d;
    }
    function formatDurataProtrazione(mins){
      const hh = Math.floor(mins/60);
      const mm = mins%60;
      return (hh>0?hh+"h":"") + (mm>0?(hh>0?" ":"")+mm+"m":"") || "0m";
    }

    console.log("protrazione check", {tipoProtrazione, oraFineProtrazione, tInFinal});
if(tipoProtrazione && oraFineProtrazione && tInFinal){
      const oraInizioProtrazione = tOutFinal || calcFine6h15(tInFinal);
      let minsEccedenza = calcMinutiProtrazione(oraInizioProtrazione, oraFineProtrazione);
      if(minsEccedenza <= 0) minsEccedenza = 1; // evita che il salvataggio venga bloccato silenziosamente

      {
        const durLabel = formatDurataProtrazione(minsEccedenza);
        const labelFiglio = tipoProtrazione==="pagamento"
          ? "PROTRAZIONE A PAGAMENTO"
          : "PROTRAZIONE A RECUPERO";
        const colorFiglio = tipoProtrazione==="pagamento" ? "#8b5cf6" : "#64748b";
        const noteFiglio = "+" + durLabel;
        const autoFiglio = tipoProtrazione==="pagamento" ? ":PAG" : ":REC";

        const { data: dbFiglio, error: errFiglio } = await supabase.from("events").insert({
          user_id: userId,
          calendar_id: calId,
          date_key: dayKey,
          label: labelFiglio,
          color: colorFiglio,
          all_day: false,
          time_in: oraInizioProtrazione,
          time_out: oraFineProtrazione,
          place: "",
          map_url: "",
          note: noteFiglio,
          modello_id: null,
          collega: null,
          auto: autoFiglio,
          parent_id: data.id,
      }).select().maybeSingle();

        if(errFiglio){ console.log("Errore creazione evento figlio protrazione:", errFiglio); }

        if(dbFiglio){
          evtFiglio = {
            id: dbFiglio.id,
            color: colorFiglio,
            label: labelFiglio,
            allDay: false,
            tIn: oraInizioProtrazione,
            tOut: oraFineProtrazione,
            place: "",
            map: "",
            note: noteFiglio,
            modelloId: null,
            collega: null,
            auto: autoFiglio,
            parentId: data.id,
          };
        }
      }
    }
    // ─────────────────────────────────────────────────────────

    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      if(!ns.events[dayKey]) ns.events[dayKey]={};
      if(!ns.events[dayKey][calId]) ns.events[dayKey][calId]=[];
      ns.events[dayKey][calId].push(evt);
      if(evtFiglio) ns.events[dayKey][calId].push(evtFiglio);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      if(syncMode==='on') saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }"""

new_saveEvt_figlio = """    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      if(!ns.events[dayKey]) ns.events[dayKey]={};
      if(!ns.events[dayKey][calId]) ns.events[dayKey][calId]=[];
      ns.events[dayKey][calId].push(evt);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      if(syncMode==='on') saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }"""

# ── 2. saveEvt: rimuovi console.log saveEvt called ───────────────────────────
src = src.replace(
    '    console.log("saveEvt called", {form, dayKey, calId, userId});\n',
    ''
)

# ── 3. Applica sostituzione saveEvt figlio ────────────────────────────────────
if old_saveEvt_figlio in src:
    src = src.replace(old_saveEvt_figlio, new_saveEvt_figlio)
    print("✓ saveEvt: logica figlio rimossa")
else:
    print("✗ saveEvt: blocco figlio NON trovato — controlla manualmente")

# ── 4. updateEvt: rimuovi tutto il blocco figlio e semplifica ─────────────────
old_updateEvt_figlio = r"""    // ── EVENTO FIGLIO PROTRAZIONE (anche in modifica) ───────────
    // Se è impostata una protrazione, crea o aggiorna l'evento figlio.
    // Se il figlio esisteva e la protrazione viene rimossa/azzerata,
    // il figlio viene eliminato.
    let evtFiglio = null;
    let figlioDaRimuovereId = null;
    const tipoProtrazione = form.straordinarioTipo;
    const oraFineProtrazione = form.protrazioneOraFine || "";

    function calcMinutiProtrazione(t1, t2){
      if(!t1||!t2) return 0;
      const [h1,m1]=t1.split(":").map(Number);
      const [h2,m2]=t2.split(":").map(Number);
      let d=(h2*60+m2)-(h1*60+m1);
      if(d<0) d+=24*60;
      return d;
    }
    function formatDurataProtrazione(mins){
      const hh = Math.floor(mins/60);
      const mm = mins%60;
      return (hh>0?hh+"h":"") + (mm>0?(hh>0?" ":"")+mm+"m":"") || "0m";
    }

    const listaCorrente = store.events?.[dayKey]?.[calId] || [];
    const figlioEsistente = listaCorrente.find(e=>e.parentId===form.editId);

    if(tipoProtrazione && oraFineProtrazione && tInFinal){
      const oraInizioProtrazione = tOutFinal || calcFine6h15(tInFinal);
      let minsEccedenza = calcMinutiProtrazione(oraInizioProtrazione, oraFineProtrazione);
      if(minsEccedenza <= 0) minsEccedenza = 1; // evita che il salvataggio venga bloccato silenziosamente

      {
        const durLabel = formatDurataProtrazione(minsEccedenza);
        const labelFiglio = tipoProtrazione==="pagamento"
          ? "PROTRAZIONE A PAGAMENTO"
          : "PROTRAZIONE A RECUPERO";
        const colorFiglio = tipoProtrazione==="pagamento" ? "#8b5cf6" : "#64748b";
        const noteFiglio = "+" + durLabel;
        const autoFiglio = tipoProtrazione==="pagamento" ? ":PAG" : ":REC";

        if(figlioEsistente){
          const { error: errUpdFiglio } = await supabase.from("events").update({
            label: labelFiglio, color: colorFiglio, all_day: false,
            time_in: oraInizioProtrazione, time_out: oraFineProtrazione,
            note: noteFiglio, auto: autoFiglio,
          }).eq("id", figlioEsistente.id).eq("user_id", userId);
          if(errUpdFiglio){ console.log("Errore aggiornamento evento figlio protrazione:", errUpdFiglio); }
          else {
            evtFiglio = { ...figlioEsistente, label: labelFiglio, color: colorFiglio,
              tIn: oraInizioProtrazione, tOut: oraFineProtrazione, note: noteFiglio, auto: autoFiglio };
          }
        } else {
          const { data: dbFiglio, error: errFiglio } = await supabase.from("events").insert({
            user_id: userId, calendar_id: calId, date_key: dayKey,
            label: labelFiglio, color: colorFiglio, all_day: false,
            time_in: oraInizioProtrazione, time_out: oraFineProtrazione,
            place: "", map_url: "", note: noteFiglio,
            modello_id: null, collega: null, auto: autoFiglio,
            parent_id: form.editId,
          }).select().maybeSingle();
          if(errFiglio){ console.log("Errore creazione evento figlio protrazione:", errFiglio); }
          if(dbFiglio){
            evtFiglio = {
              id: dbFiglio.id, color: colorFiglio, label: labelFiglio, allDay: false,
              tIn: oraInizioProtrazione, tOut: oraFineProtrazione, place: "", map: "",
              note: noteFiglio, modelloId: null, collega: null, auto: autoFiglio,
              parentId: form.editId,
            };
          }
        }
      }
    } else if(figlioEsistente){
      figlioDaRimuovereId = figlioEsistente.id;
    }

    if(figlioDaRimuovereId){
      await supabase.from("events").delete().eq("id", figlioDaRimuovereId).eq("user_id", userId);
    }
    // ─────────────────────────────────────────────────────────

    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      const list = ns.events?.[dayKey]?.[calId];
      if(list){
        const idx = list.findIndex(e=>e.id===form.editId);
        if(idx>-1) list[idx]={...list[idx], label, color,
          allDay: form.dur==="allday", tIn: tInFinal, tOut: tOutFinal,
          place: (form.place||"").toUpperCase(), map: form.map||"",
          note: (form.note||"").toUpperCase(), modelloId: form.modelloId||null,
          collega: (form.collega||"").toUpperCase(), auto: (form.auto||"").toUpperCase(),
        };
        if(figlioDaRimuovereId){
          ns.events[dayKey][calId] = list.filter(e=>e.id!==figlioDaRimuovereId);
        } else if(evtFiglio){
          const fIdx = ns.events[dayKey][calId].findIndex(e=>e.id===evtFiglio.id);
          if(fIdx>-1) ns.events[dayKey][calId][fIdx] = evtFiglio;
          else ns.events[dayKey][calId].push(evtFiglio);
        }
      }
      if(syncMode==='on' && sheetsUrl) saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    console.log("updateEvt fine", {dayKey, form});
    setForm(null); setDayKey(null);
  }"""

new_updateEvt_figlio = """    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      const list = ns.events?.[dayKey]?.[calId];
      if(list){
        const idx = list.findIndex(e=>e.id===form.editId);
        if(idx>-1) list[idx]={...list[idx], label, color,
          allDay: form.dur==="allday", tIn: tInFinal, tOut: tOutFinal,
          place: (form.place||"").toUpperCase(), map: form.map||"",
          note: (form.note||"").toUpperCase(), modelloId: form.modelloId||null,
          collega: (form.collega||"").toUpperCase(), auto: (form.auto||"").toUpperCase(),
        };
      }
      if(syncMode==='on' && sheetsUrl) saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }"""

# ── 5. Rimuovi anche console.log updateEvt start/fine ────────────────────────
src = src.replace(
    '    console.log("updateEvt start", {form, dayKey, calId, userId, editId: form?.editId});\n',
    ''
)

if old_updateEvt_figlio in src:
    src = src.replace(old_updateEvt_figlio, new_updateEvt_figlio)
    print("✓ updateEvt: logica figlio rimossa")
else:
    print("✗ updateEvt: blocco figlio NON trovato — controlla manualmente")

# ── 6. Sezione 14: rimuovi i bottoni PROTRAZIONE A PAGAMENTO e RECUPERO ──────
# Rimuovi il blocco bottone PROTRAZIONE A PAGAMENTO (sotto INGRESSO)
old_pag_btn = """                  <button type="button" onClick={()=>setForm(f=>({...f,straordinarioTipo:f.straordinarioTipo==="pagamento"?null:"pagamento"}))}
                    style={{width:"100%",marginTop:5,padding:"5px 2px",borderRadius:8,cursor:"pointer",
                      fontSize:9,fontWeight:800,lineHeight:1.2,textAlign:"center",
                      background:form.straordinarioTipo==="pagamento"?"#8b5cf6":T.surface,
                      color:form.straordinarioTipo==="pagamento"?"#fff":T.sub,
                      border:`1.5px solid ${form.straordinarioTipo==="pagamento"?"#8b5cf6":T.border}`}}>
                    PROTRAZIONE A PAGAMENTO
                  </button>
                  {form.straordinarioTipo==="pagamento"&&(()=>{
                    const oraFineP=form.protrazioneOraFine||"";
                    let durProt="";
                    if(oraFineP&&form.tIn){
                      const std=calcFine6h15(form.tIn);
                      const [h1,m1]=std.split(":").map(Number);
                      const [h2,m2]=oraFineP.split(":").map(Number);
                      let d2=(h2*60+m2)-(h1*60+m1);
                      if(d2<0) d2+=24*60;
                      if(d2>0) durProt=`${Math.floor(d2/60)}h${d2%60>0?" "+d2%60+"m":""}`;
                    }
                    return (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                        <div style={{background:T.s2,borderRadius:8,padding:"5px 8px",
                          minWidth:44,textAlign:"center",flexShrink:0}}>
                          <div style={{fontSize:8,color:T.sub,fontWeight:700}}>DURATA</div>
                          <div style={{fontSize:12,fontWeight:900,color:"#8b5cf6"}}>{durProt||"—"}</div>
                        </div>
                        <SmartTimeInput value={oraFineP} onChange={v=>setForm(f=>({...f,protrazioneOraFine:v}))}
                          style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,
                            borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
                      </div>
                    );
                  })()}"""

new_pag_btn = ""

old_rec_btn = """                    <button type="button" onClick={()=>setForm(f=>({...f,straordinarioTipo:f.straordinarioTipo==="recupero"?null:"recupero"}))}
                      style={{width:"100%",marginTop:5,padding:"5px 2px",borderRadius:8,cursor:"pointer",
                        fontSize:9,fontWeight:800,lineHeight:1.2,textAlign:"center",
                        background:form.straordinarioTipo==="recupero"?"#64748b":T.surface,
                        color:form.straordinarioTipo==="recupero"?"#fff":T.sub,
                        border:`1.5px solid ${form.straordinarioTipo==="recupero"?"#64748b":T.border}`}}>
                      PROTRAZIONE A RECUPERO
                    </button>
                    {form.straordinarioTipo==="recupero"&&(()=>{
                      const oraFineR=form.protrazioneOraFine||"";
                      let durProt="";
                      if(oraFineR&&form.tIn){
                        const std=calcFine6h15(form.tIn);
                        const [h1,m1]=std.split(":").map(Number);
                        const [h2,m2]=oraFineR.split(":").map(Number);
                        let d2=(h2*60+m2)-(h1*60+m1);
                        if(d2<0) d2+=24*60;
                        if(d2>0) durProt=`${Math.floor(d2/60)}h${d2%60>0?" "+d2%60+"m":""}`;
                      }
                      return (
                        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                          <div style={{background:T.s2,borderRadius:8,padding:"5px 8px",
                            minWidth:44,textAlign:"center",flexShrink:0}}>
                            <div style={{fontSize:8,color:T.sub,fontWeight:700}}>DURATA</div>
                            <div style={{fontSize:12,fontWeight:900,color:"#64748b"}}>{durProt||"—"}</div>
                          </div>
                          <SmartTimeInput value={oraFineR} onChange={v=>setForm(f=>({...f,protrazioneOraFine:v}))}
                            style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,
                              borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"}}/>
                        </div>
                      );
                    })()}"""

new_rec_btn = ""

if old_pag_btn in src:
    src = src.replace(old_pag_btn, new_pag_btn)
    print("✓ UI: bottone PROTRAZIONE A PAGAMENTO rimosso")
else:
    print("✗ UI: bottone PAGAMENTO NON trovato")

if old_rec_btn in src:
    src = src.replace(old_rec_btn, new_rec_btn)
    print("✓ UI: bottone PROTRAZIONE A RECUPERO rimosso")
else:
    print("✗ UI: bottone RECUPERO NON trovato")

# ── 7. Rimuovi filtro .filter(e=>!(e.label||"").toUpperCase().startsWith("PROTRAZIONE")) ──
old_filter = '.filter(e=>!(e.label||"").toUpperCase().startsWith("PROTRAZIONE"))'
if old_filter in src:
    src = src.replace(old_filter, '')
    print("✓ Filtro PROTRAZIONE nella lista eventi rimosso")
else:
    print("✗ Filtro PROTRAZIONE NON trovato")

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(src)

print(f"\n✅ Fatto → {OUTPUT}")
