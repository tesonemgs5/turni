"""
modifica_protrazione.py
-----------------------
Modifica saveEvt in App.jsx per:
1. Lasciare l'evento principale invariato (tOut non cambia)
2. Creare un evento figlio con:
   - label: "PROTRAZIONE A PAGAMENTO" o "PROTRAZIONE A RECUPERO"
   - tIn: ora fine turno principale (es. 14:45)
   - tOut: ora fine protrazione (es. 15:45)
   - note: "+1h" o "+45m" ecc.
   - parentId: id dell'evento principale
   - color: viola (#8b5cf6) per pagamento, grigio (#64748b) per recupero
"""

import os, sys

APP_PATH = os.path.join(os.path.dirname(__file__), "App.jsx")

# ── VECCHIO: fine di saveEvt dove si fa setStore ──────────────
OLD = """    const evt = {
      id: data.id, color, label, allDay: data.all_day,
      tIn: data.time_in||"", tOut: data.time_out||"",
      place: data.place||"", map: data.map_url||"",
      note: data.note||"", modelloId: data.modello_id||null,
      collega: data.collega||null, auto: data.auto||"",
    };
    setStore(prev=>{
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

NEW = """    const evt = {
      id: data.id, color, label, allDay: data.all_day,
      tIn: data.time_in||"", tOut: data.time_out||"",
      place: data.place||"", map: data.map_url||"",
      note: data.note||"", modelloId: data.modello_id||null,
      collega: data.collega||null, auto: data.auto||"",
    };

    // ── EVENTO FIGLIO PROTRAZIONE ─────────────────────────────
    // Se l'utente ha inserito una protrazione (a pagamento o a recupero),
    // crea un evento figlio separato collegato tramite parentId.
    let evtFiglio = null;
    const tipoProtrazione = form.straordinarioTipo; // "pagamento" | "recupero" | null
    const oraFineProtrazione = form.protrazioneOraFine || "";

    if(tipoProtrazione && oraFineProtrazione && tInFinal){
      // Calcola minuti di eccedenza rispetto alla fine standard del turno
      const oraInizioProtrazione = tOutFinal || calcFine6h15(tInFinal);
      const calcMinsStr = (t1, t2) => {
        if(!t1||!t2) return 0;
        const [h1,m1]=t1.split(":").map(Number);
        const [h2,m2]=t2.split(":").map(Number);
        let d=(h2*60+m2)-(h1*60+m1);
        if(d<0) d+=24*60;
        return d;
      };
      const minsEccedenza = calcMinsStr(oraInizioProtrazione, oraFineProtrazione);
      if(minsEccedenza > 0){
        const hh = Math.floor(minsEccedenza/60);
        const mm = minsEccedenza%60;
        const durLabel = (hh>0?hh+"h":"") + (mm>0?" "+mm+"m":"").trim();
        const labelFiglio = tipoProtrazione==="pagamento"
          ? "PROTRAZIONE A PAGAMENTO"
          : "PROTRAZIONE A RECUPERO";
        const colorFiglio = tipoProtrazione==="pagamento" ? "#8b5cf6" : "#64748b";
        const noteFiglio = "+" + durLabel;

        const { data: dbFiglio } = await supabase.from("events").insert({
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
          auto: tipoProtrazione==="pagamento" ? ":PAG" : ":REC",
          parent_id: data.id,
        }).select().maybeSingle();

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
            auto: tipoProtrazione==="pagamento" ? ":PAG" : ":REC",
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

# ── ESECUZIONE ────────────────────────────────────────────────
def main():
    if not os.path.exists(APP_PATH):
        print(f"ERRORE: file non trovato → {APP_PATH}")
        sys.exit(1)

    with open(APP_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    if OLD not in content:
        print("ERRORE: il blocco da sostituire non è stato trovato in App.jsx")
        print("Probabilmente saveEvt è già stata modificata in precedenza.")
        sys.exit(1)

    new_content = content.replace(OLD, NEW, 1)

    with open(APP_PATH, "w", encoding="utf-8") as f:
        f.write(new_content)

    print("✅ saveEvt modificata con successo in App.jsx")
    print()
    print("Cosa succede ora al salvataggio:")
    print("  Evento principale  → invariato (tOut non cambia)")
    print("  Evento figlio      → creato se c'è protrazione:")
    print("    - label: PROTRAZIONE A PAGAMENTO / PROTRAZIONE A RECUPERO")
    print("    - tIn:   ora fine turno (es. 14:45)")
    print("    - tOut:  ora fine protrazione (es. 15:45)")
    print("    - note:  +1h / +45m ecc.")
    print("    - auto:  :PAG o :REC (usato dal report Straordinari)")
    print("    - parentId: id evento principale")
    print()
    print("PROSSIMO PASSO: il report Straordinari leggerà :PAG e :REC")
    print("per calcolare totale pagamento e saldo recupero.")

if __name__ == "__main__":
    main()
