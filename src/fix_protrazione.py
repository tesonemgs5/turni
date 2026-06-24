#!/usr/bin/env python3
"""
fix_protrazione.py
Corregge la creazione/gestione dell'evento figlio di Protrazione
(a pagamento / a recupero) in App.jsx:

- in saveEvt(): rende il calcolo di ore/minuti/note dell'evento figlio
  più robusto e leggibile.
- aggiunge la STESSA logica anche in updateEvt(), che oggi non crea
  né aggiorna l'evento figlio quando modifichi un evento esistente.

Legge:  App.jsx
Scrive: App_updated.jsx
"""

import os
import sys

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

OLD_SAVEEVT_BLOCK = '''    // ── EVENTO FIGLIO PROTRAZIONE ─────────────────────────────
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
    // ─────────────────────────────────────────────────────────'''

NEW_SAVEEVT_BLOCK = '''    // ── EVENTO FIGLIO PROTRAZIONE ─────────────────────────────
    // Se l'utente ha inserito una protrazione (a pagamento o a recupero),
    // crea un evento figlio separato collegato tramite parentId.
    // L'inizio della protrazione è l'uscita effettiva del turno (tOutFinal);
    // se manca, si usa la fine standard come fallback.
    let evtFiglio = null;
    const tipoProtrazione = form.straordinarioTipo; // "pagamento" | "recupero" | null
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

    if(tipoProtrazione && oraFineProtrazione && tInFinal){
      const oraInizioProtrazione = tOutFinal || calcFine6h15(tInFinal);
      const minsEccedenza = calcMinutiProtrazione(oraInizioProtrazione, oraFineProtrazione);

      if(minsEccedenza > 0){
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
    // ─────────────────────────────────────────────────────────'''

OLD_UPDATEEVT_FUNC = '''  async function updateEvt(){
    if(!form||!dayKey||!calId||!userId||!form.editId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;
    let color = form.colorOvr || cal.color;
    let label = (form.label||"Evento").toUpperCase();
    let tInFinal = form.dur==="allday"?"":form.tIn||"";
    let tOutFinal = form.dur==="allday"?"":form.tOut||"";
    if(form.modelloId){
      const mod = modelli.find(m=>m.id===form.modelloId);
      if(mod){ color = form.colorOvr||(mod.coloreCustom||getColorByTime(mod.inizio)); }
    }
    const { error } = await supabase.from("events").update({
      label, color, all_day: form.dur==="allday",
      time_in: tInFinal, time_out: tOutFinal,
      place: (form.place||"").toUpperCase(),
      map_url: form.map||"",
      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
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
      }
      if(syncMode==='on' && sheetsUrl) saveToSheets(ns.events, ns.calendars);
      return ns;
    });
    setForm(null); setDayKey(null);
  }'''

NEW_UPDATEEVT_FUNC = '''  async function updateEvt(){
    if(!form||!dayKey||!calId||!userId||!form.editId) return;
    const cal = store.calendars.find(c=>c.id===calId);
    if(!cal) return;
    let color = form.colorOvr || cal.color;
    let label = (form.label||"Evento").toUpperCase();
    let tInFinal = form.dur==="allday"?"":form.tIn||"";
    let tOutFinal = form.dur==="allday"?"":form.tOut||"";
    if(form.modelloId){
      const mod = modelli.find(m=>m.id===form.modelloId);
      if(mod){ color = form.colorOvr||(mod.coloreCustom||getColorByTime(mod.inizio)); }
    }
    const { error } = await supabase.from("events").update({
      label, color, all_day: form.dur==="allday",
      time_in: tInFinal, time_out: tOutFinal,
      place: (form.place||"").toUpperCase(),
      map_url: form.map||"",
      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
    }).eq("id", form.editId).eq("user_id", userId);
    if(error){ console.log(error); return; }

    // ── EVENTO FIGLIO PROTRAZIONE (anche in modifica) ───────────
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
      const minsEccedenza = calcMinutiProtrazione(oraInizioProtrazione, oraFineProtrazione);

      if(minsEccedenza > 0){
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
      } else if(figlioEsistente){
        figlioDaRimuovereId = figlioEsistente.id;
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
    setForm(null); setDayKey(null);
  }'''


def main():
    if not os.path.exists(FILE_INPUT):
        print(f"❌ Non trovo '{FILE_INPUT}' in questa cartella.")
        sys.exit(1)

    with open(FILE_INPUT, "r", encoding="utf-8") as f:
        content = f.read()

    ok1 = OLD_SAVEEVT_BLOCK in content
    ok2 = OLD_UPDATEEVT_FUNC in content

    if not ok1 and not ok2:
        print("❌ Non ho trovato né il blocco di saveEvt() né la funzione updateEvt() nella forma esatta attesa.")
        print("   Probabilmente il file è già stato modificato rispetto all'originale.")
        print("   Nessuna modifica effettuata.")
        sys.exit(1)

    new_content = content
    if ok1:
        new_content = new_content.replace(OLD_SAVEEVT_BLOCK, NEW_SAVEEVT_BLOCK)
        print("✅ Blocco evento figlio in saveEvt() corretto.")
    else:
        print("⚠️  Blocco di saveEvt() non trovato in forma esatta: NON modificato (per sicurezza).")

    if ok2:
        new_content = new_content.replace(OLD_UPDATEEVT_FUNC, NEW_UPDATEEVT_FUNC)
        print("✅ updateEvt() aggiornata per gestire anche la protrazione (creazione/aggiornamento/rimozione figlio).")
    else:
        print("⚠️  Funzione updateEvt() non trovata in forma esatta: NON modificata (per sicurezza).")

    with open(FILE_OUTPUT, "w", encoding="utf-8") as f:
        f.write(new_content)

    print()
    print(f"   Letto:   {FILE_INPUT}")
    print(f"   Scritto: {FILE_OUTPUT}")
    print()
    print("   Il launcher (istruzioni.py) rinominerà App_updated.jsx in App.jsx")
    print("   e farà commit/push se confermi con S.")


if __name__ == "__main__":
    main()
