#!/usr/bin/env python3
"""
Modifica App.jsx:
1. Aggiunge la funzione applyRotazioneADayKey(rotId, dayKey) — genera e
   salva su Supabase 52 settimane di eventi (1 domenica lavoro + 3 riposo,
   ciclico) partendo dalla domenica scelta come giorno 1.
2. Aggiunge la sezione "Rotazioni" nel modal "Scegli modello" (sotto Turni),
   cliccando una rotazione si applica al dayKey corrente.

Legge App.jsx nella cartella corrente, scrive App_updated.jsx.
"""

import re
import sys

SRC = "App.jsx"
DST = "App_updated.jsx"

def main():
    with open(SRC, "r", encoding="utf-8") as f:
        code = f.read()

    # ── 1. Inserisce applyRotazioneADayKey dopo updateGrigliaRotazione ──
    anchor1 = "  async function updateGrigliaRotazione(rotId, griglia){\n    await supabase.from(\"rotazioni\").update({griglia}).eq(\"id\",rotId).eq(\"user_id\",userId);\n    setRotazioni(prev=>prev.map(r=>r.id===rotId?{...r,griglia}:r));\n  }\n"
    if anchor1 not in code:
        print("❌ ERRORE: non trovo updateGrigliaRotazione. Nessuna modifica fatta.")
        sys.exit(1)

    nuova_funzione = anchor1 + '''
  // Applica una rotazione "domeniche" al calendario reale a partire da dayKey.
  // dayKey diventa il giorno 1 del ciclo (domenica di lavoro). Genera e salva
  // su Supabase gli eventi per le 52 settimane successive: 1 domenica lavoro
  // + 3 domeniche riposo, ciclico.
  async function applyRotazioneADayKey(rotId, startDayKey){
    if(!userId||!calId||!startDayKey) return;
    const rot = rotazioni.find(r=>r.id===rotId);
    if(!rot) return;
    const modLav = modelli.find(m=>m.id===rot.modellaLavoroId);
    const modRip = modelli.find(m=>m.id===rot.modelloNLId);
    const nSett = rot.nSettimane||52;

    const [y0,m0,d0] = startDayKey.split("-").map(Number);
    const start = new Date(y0, m0-1, d0);

    const nuoviEventiLocali = {};

    for(let i=0;i<nSett;i++){
      const d = new Date(start);
      d.setDate(d.getDate()+i*7);
      const dateKey = dkey(d.getFullYear(), d.getMonth(), d.getDate());
      const isLavoro = (i%4)===0;
      const mod = isLavoro?modLav:modRip;
      if(!mod) continue; // nessun modello assegnato per questa posizione: salta

      const color = mod.coloreCustom||(mod.tempo==="h24"?"#64748b":getColorByTime(mod.inizio));
      const label = (mod.label||mod.titolo||"").toUpperCase();
      const allDay = mod.tempo==="h24";
      const tIn = allDay?"":(mod.inizio||"");
      const tOut = allDay?"":(mod.tempo==="6h15"?calcFine6h15(mod.inizio):(mod.fine||""));

      const { data, error } = await supabase.from("events").insert({
        user_id: userId, calendar_id: calId, date_key: dateKey,
        label, color, all_day: allDay,
        time_in: tIn, time_out: tOut,
        place: "", map_url: "", note: "",
        modello_id: mod.id||null, collega: "", auto: "",
        prot_pag_fine: null, prot_rec_fine: null,
      }).select().maybeSingle();
      if(error){ console.log("Errore inserimento evento rotazione:", error); continue; }

      if(!nuoviEventiLocali[dateKey]) nuoviEventiLocali[dateKey]={};
      if(!nuoviEventiLocali[dateKey][calId]) nuoviEventiLocali[dateKey][calId]=[];
      nuoviEventiLocali[dateKey][calId].push({
        id: data.id, color, label, allDay: data.all_day,
        tIn: data.time_in||"", tOut: data.time_out||"",
        place: "", map: "", note: "", modelloId: data.modello_id||null,
        collega: "", auto: "",
      });
    }

    setStore(prev=>{
      const ns = JSON.parse(JSON.stringify(prev));
      for(const [dateKey, calMap] of Object.entries(nuoviEventiLocali)){
        if(!ns.events[dateKey]) ns.events[dateKey]={};
        for(const [cid, evts] of Object.entries(calMap)){
          if(!ns.events[dateKey][cid]) ns.events[dateKey][cid]=[];
          ns.events[dateKey][cid].push(...evts);
        }
      }
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      if(syncMode==="on") saveToSheets(ns.events, ns.calendars);
      return ns;
    });
  }
'''
    code = code.replace(anchor1, nuova_funzione, 1)

    # ── 2. Aggiunge sezione "Rotazioni" nel picker, dopo il blocco modelliPicker ──
    anchor2 = '''            {(activeCal?.shifts||[]).length>0&&(
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
    if anchor2 not in code:
        print("❌ ERRORE: non trovo il blocco shifts nel picker. Nessuna modifica fatta.")
        sys.exit(1)

    sezione_rotazioni = anchor2 + '''
            {rotazioni.length>0&&(
              <>
                <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:6,paddingLeft:4}}>ROTAZIONI</div>
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:12}}>
                  {rotazioni.map((r,i,arr)=>(
                    <div key={r.id} style={{borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <div onClick={async()=>{
                        if(!window.confirm(`Impostare "${dayKey}" come giorno 1 (domenica di lavoro) della rotazione "${r.titolo||"Rotazione"}"? Verranno generati gli eventi per le prossime ${r.nSettimane||52} settimane.`)) return;
                        setShowModelloPicker(false);
                        await applyRotazioneADayKey(r.id, dayKey);
                      }} style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}}>
                        <div style={{width:36,height:36,borderRadius:10,background:accent+"33",
                          border:`2px solid ${accent}`,display:"flex",alignItems:"center",justifyContent:"center",
                          flexShrink:0,marginRight:12}}>
                          <span style={{fontSize:16}}>🔄</span>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
                            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.titolo||"Rotazione"}</div>
                          <div style={{fontSize:13,color:T.sub,marginTop:1}}>Domeniche 1/4 · {r.nSettimane||52} settimane</div>
                        </div>
                        <span style={{color:T.sub,fontSize:14}}>›</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}'''
    code = code.replace(anchor2, sezione_rotazioni, 1)

    with open(DST, "w", encoding="utf-8") as f:
        f.write(code)

    print(f"✅ Creato {DST} con le modifiche applicate.")

if __name__ == "__main__":
    main()
