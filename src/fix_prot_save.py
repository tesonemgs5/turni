INPUT  = "App.jsx"
OUTPUT = "App_updated.jsx"

with open(INPUT, "r", encoding="utf-8") as f:
    src = f.read()

errors = []

# ── 1. Sezione 7: mapping eventi dal DB — aggiungi protPagFine e protRecFine ──
old1 = """            modelloId: e.modello_id||null, collega: e.collega||null,
            auto: e.auto||"", parentId: e.parent_id||null,"""
new1 = """            modelloId: e.modello_id||null, collega: e.collega||null,
            auto: e.auto||"", parentId: e.parent_id||null,
            protPagFine: e.prot_pag_fine||"", protRecFine: e.prot_rec_fine||"","""
if old1 in src:
    src = src.replace(old1, new1)
    print("✓ Sezione 7: mapping eventi aggiornato")
else:
    errors.append("✗ Sezione 7: mapping eventi NON trovato")

# ── 2. saveEvt: aggiungi prot_pag_fine e prot_rec_fine nell'insert ────────────
old2 = """      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
    }).select().maybeSingle();
    if(error){ console.log(error); return; }
    const evt = {
      id: data.id, color, label, allDay: data.all_day,
      tIn: data.time_in||"", tOut: data.time_out||"",
      place: data.place||"", map: data.map_url||"",
      note: data.note||"", modelloId: data.modello_id||null,
      collega: data.collega||null, auto: data.auto||"",
    };

    setStore(prev=>{"""
new2 = """      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
      prot_pag_fine: form.protPagFine||null,
      prot_rec_fine: form.protRecFine||null,
    }).select().maybeSingle();
    if(error){ console.log(error); return; }
    const evt = {
      id: data.id, color, label, allDay: data.all_day,
      tIn: data.time_in||"", tOut: data.time_out||"",
      place: data.place||"", map: data.map_url||"",
      note: data.note||"", modelloId: data.modello_id||null,
      collega: data.collega||null, auto: data.auto||"",
      protPagFine: data.prot_pag_fine||"", protRecFine: data.prot_rec_fine||"",
    };

    setStore(prev=>{"""
if old2 in src:
    src = src.replace(old2, new2)
    print("✓ saveEvt: prot_pag_fine e prot_rec_fine aggiunti")
else:
    errors.append("✗ saveEvt: blocco insert NON trovato")

# ── 3. updateEvt: aggiungi prot_pag_fine e prot_rec_fine nell'update ──────────
old3 = """      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
    }).eq("id", form.editId).eq("user_id", userId);
    if(error){ console.log(error); return; }

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
      }"""
new3 = """      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
      prot_pag_fine: form.protPagFine||null,
      prot_rec_fine: form.protRecFine||null,
    }).eq("id", form.editId).eq("user_id", userId);
    if(error){ console.log(error); return; }

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
          protPagFine: form.protPagFine||"", protRecFine: form.protRecFine||"",
        };
      }"""
if old3 in src:
    src = src.replace(old3, new3)
    print("✓ updateEvt: prot_pag_fine e prot_rec_fine aggiunti")
else:
    errors.append("✗ updateEvt: blocco update NON trovato")

# ── 4. setForm click div evento — aggiungi protPagFine e protRecFine ──────────
old4 = """              setForm({ editId:e.id, modelloId:null, shiftId:null, label:e.label,
                colorOvr:e.color, dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":"custom", tIn:e.tIn||"", tOut:e.tOut||"",
                place:e.place||"", map:e.map||"", note:e.note||"", collega:e.collega||"", auto:e.auto||"",
straordinarioTipo:null, protrazioneOraFine:"" });"""
new4 = """              setForm({ editId:e.id, modelloId:null, shiftId:null, label:e.label,
                colorOvr:e.color, dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":"custom", tIn:e.tIn||"", tOut:e.tOut||"",
                place:e.place||"", map:e.map||"", note:e.note||"", collega:e.collega||"", auto:e.auto||"",
                protPagFine:e.protPagFine||"", protRecFine:e.protRecFine||"" });"""
if old4 in src:
    src = src.replace(old4, new4)
    print("✓ setForm click div: protPagFine/protRecFine aggiunti")
else:
    errors.append("✗ setForm click div NON trovato")

# ── 5. setForm click bottone ✏️ — aggiungi protPagFine e protRecFine ──────────
old5 = """                editId:e.id,modelloId:null,shiftId:null,label:e.label,colorOvr:e.color,
                dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":"custom",tIn:e.tIn||"",tOut:e.tOut||"",place:e.place||"",
                map:e.map||"",note:e.note||"",collega:e.collega||"",auto:e.auto||"",
straordinarioTipo:null,protrazioneOraFine:"","""
new5 = """                editId:e.id,modelloId:null,shiftId:null,label:e.label,colorOvr:e.color,
                dur:e.allDay?"allday":(e.tIn&&e.tOut&&e.tOut===calcFine6h15(e.tIn))?"fixed":"custom",tIn:e.tIn||"",tOut:e.tOut||"",place:e.place||"",
                map:e.map||"",note:e.note||"",collega:e.collega||"",auto:e.auto||"",
                protPagFine:e.protPagFine||"",protRecFine:e.protRecFine||"","""
if old5 in src:
    src = src.replace(old5, new5)
    print("✓ setForm bottone ✏️: protPagFine/protRecFine aggiunti")
else:
    errors.append("✗ setForm bottone ✏️ NON trovato")

# ── 6. UI: sostituisci protrazioneOraFinePag/Rec con protPagFine/protRecFine ──
src = src.replace("form.protrazioneOraFinePag||\"\"", "form.protPagFine||\"\"")\
         .replace("form.protrazioneOraFineRec||\"\"", "form.protRecFine||\"\"")\
         .replace("protrazioneOraFinePag:v", "protPagFine:v")\
         .replace("protrazioneOraFineRec:v", "protRecFine:v")
print("✓ UI: nomi campi allineati")

for e in errors:
    print(e)

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(src)

print(f"\n✅ Fatto → {OUTPUT}")
