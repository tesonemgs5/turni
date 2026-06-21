#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_sync.py
-----------
Applica correzioni di sincronizzazione a App.jsx:
1. Corregge il bug "saveToLocalStorage(events, calendars, [])" all'avvio
   (salvava sempre modelli vuoti in cache).
2. Aggiunge saveToLocalStorage() dentro saveModello, deleteModello, delEvt,
   updateCalendar.
3. Forza sempre saveToSheets() (rimuove il controllo "if syncMode==='on'")
   dentro saveModello, deleteModello, delEvt.

USO:
    1. Copia questo file nella cartella del progetto (dove c'è src/App.jsx)
    2. Apri il terminale in quella cartella
    3. Esegui:  python fix_sync.py
    4. Lo script crea un backup automatico (App.jsx.bak_TIMESTAMP) prima di
       modificare il file.
    5. Se qualcosa va storto, ripristina il backup rinominandolo App.jsx.
"""

import re
import sys
import shutil
from pathlib import Path
from datetime import datetime

APP_PATH = Path("src/App.jsx")


def fail(msg):
    print(f"\n❌ ERRORE: {msg}")
    print("Nessuna modifica è stata salvata. Il file App.jsx è rimasto intatto.")
    sys.exit(1)


def main():
    if not APP_PATH.exists():
        fail(
            f"Non trovo il file '{APP_PATH}'.\n"
            f"Esegui questo script dalla cartella principale del progetto "
            f"(quella che contiene la cartella 'src')."
        )

    original = APP_PATH.read_text(encoding="utf-8")
    text = original
    applied = []
    skipped = []

    # ─────────────────────────────────────────────────────────────
    # FIX 1: bug all'avvio — saveToLocalStorage con modelli vuoti
    # ─────────────────────────────────────────────────────────────
    old1 = 'saveToLocalStorage(events, calendars, []);'
    new1 = 'saveToLocalStorage(events, calendars, modelliDb||[]);'
    count1 = text.count(old1)
    if count1 == 1:
        text = text.replace(old1, new1)
        applied.append("Fix bug avvio: localStorage non salvava più i modelli")
    elif count1 == 0:
        skipped.append("Fix bug avvio: stringa non trovata (forse già corretta)")
    else:
        fail(
            f"Trovate {count1} occorrenze di '{old1}' invece di 1. "
            f"Per sicurezza non procedo: controlla manualmente."
        )

    # ─────────────────────────────────────────────────────────────
    # FIX 2: saveModello — aggiunge localStorage + forza sempre Sheets
    # ─────────────────────────────────────────────────────────────
    old2 = '''      setModelli(prev=>{
        const updated=prev.map(m=>m.id===data.id?{...m,...data,colore:coloreEff,calendarId:targetCalId}:m);
        if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
        return updated;
      });'''
    new2 = '''      setModelli(prev=>{
        const updated=prev.map(m=>m.id===data.id?{...m,...data,colore:coloreEff,calendarId:targetCalId}:m);
        saveToLocalStorage(store.events, store.calendars, updated);
        if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
        return updated;
      });'''
    count2 = text.count(old2)
    if count2 == 1:
        text = text.replace(old2, new2)
        applied.append("saveModello (update): aggiunto salvataggio su localStorage")
    elif count2 == 0:
        skipped.append("saveModello (update): blocco non trovato (forse già modificato)")
    else:
        fail(f"Trovate {count2} occorrenze impreviste nel blocco saveModello (update).")

    old3 = '''        setModelli(prev=>{
          const updated=[...prev,{...data,id:res.id,colore:coloreEff,sortOrder:newSortOrder,calendarId:targetCalId}];
          if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
          return updated;
        });'''
    new3 = '''        setModelli(prev=>{
          const updated=[...prev,{...data,id:res.id,colore:coloreEff,sortOrder:newSortOrder,calendarId:targetCalId}];
          saveToLocalStorage(store.events, store.calendars, updated);
          if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
          return updated;
        });'''
    count3 = text.count(old3)
    if count3 == 1:
        text = text.replace(old3, new3)
        applied.append("saveModello (nuovo): aggiunto salvataggio su localStorage")
    elif count3 == 0:
        skipped.append("saveModello (nuovo): blocco non trovato (forse già modificato)")
    else:
        fail(f"Trovate {count3} occorrenze impreviste nel blocco saveModello (nuovo).")

    # ─────────────────────────────────────────────────────────────
    # FIX 3: deleteModello — aggiunge localStorage
    # ─────────────────────────────────────────────────────────────
    old4 = '''  async function deleteModello(id){
    await supabase.from("modelli").delete().eq("id",id).eq("user_id",userId);
    setModelli(prev=>{
      const updated=prev.filter(m=>m.id!==id);
      if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
      return updated;
    });
  }'''
    new4 = '''  async function deleteModello(id){
    await supabase.from("modelli").delete().eq("id",id).eq("user_id",userId);
    setModelli(prev=>{
      const updated=prev.filter(m=>m.id!==id);
      saveToLocalStorage(store.events, store.calendars, updated);
      if(sheetsUrl) saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, updated);
      return updated;
    });
  }'''
    count5 = text.count(old4)
    if count5 == 1:
        text = text.replace(old4, new4)
        applied.append("deleteModello: aggiunto salvataggio su localStorage")
    elif count5 == 0:
        skipped.append("deleteModello: blocco non trovato (forse già modificato)")
    else:
        fail(f"Trovate {count5} occorrenze impreviste nel blocco deleteModello.")

    # ─────────────────────────────────────────────────────────────
    # FIX 4: delEvt — aggiunge localStorage + forza sempre Sheets
    # ─────────────────────────────────────────────────────────────
    old6 = '''  async function delEvt(dKey, cId, evtId){
    await supabase.from("events").delete().eq("id", evtId).eq("user_id", userId);
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      if(ns.events?.[dKey]?.[cId])
        ns.events[dKey][cId]=ns.events[dKey][cId].filter(e=>e.id!==evtId);
      if(syncMode==='on' && sheetsUrl) saveToSheets(ns.events, ns.calendars);
      return ns;
    });
  }'''
    new6 = '''  async function delEvt(dKey, cId, evtId){
    await supabase.from("events").delete().eq("id", evtId).eq("user_id", userId);
    setStore(prev=>{
      const ns=JSON.parse(JSON.stringify(prev));
      if(ns.events?.[dKey]?.[cId])
        ns.events[dKey][cId]=ns.events[dKey][cId].filter(e=>e.id!==evtId);
      saveToLocalStorage(ns.events, ns.calendars, modelli);
      if(sheetsUrl) saveToSheets(ns.events, ns.calendars);
      return ns;
    });
  }'''
    count7 = text.count(old6)
    if count7 == 1:
        text = text.replace(old6, new6)
        applied.append("delEvt: aggiunto localStorage + Sheets sempre attivo")
    elif count7 == 0:
        skipped.append("delEvt: blocco non trovato (forse già modificato)")
    else:
        fail(f"Trovate {count7} occorrenze impreviste nel blocco delEvt.")

    # ─────────────────────────────────────────────────────────────
    # FIX 5: updateCalendar — aggiunge localStorage
    # ─────────────────────────────────────────────────────────────
    old8 = '''  async function updateCalendar(cId, fields){
    if(!userId) return;
    await supabase.from("calendars").update(fields).eq("id", cId).eq("user_id", userId);
  }'''
    new8 = '''  async function updateCalendar(cId, fields){
    if(!userId) return;
    await supabase.from("calendars").update(fields).eq("id", cId).eq("user_id", userId);
    saveToLocalStorage(store.events, store.calendars, modelli);
  }'''
    count9 = text.count(old8)
    if count9 == 1:
        text = text.replace(old8, new8)
        applied.append("updateCalendar: aggiunto salvataggio su localStorage")
    elif count9 == 0:
        skipped.append("updateCalendar: blocco non trovato (forse già modificato)")
    else:
        fail(f"Trovate {count9} occorrenze impreviste nel blocco updateCalendar.")

    # ─────────────────────────────────────────────────────────────
    # Se nessuna modifica è stata applicata, fermati senza toccare nulla
    # ─────────────────────────────────────────────────────────────
    if not applied:
        print("\n⚠️  Nessuna modifica applicata. Possibili motivi:")
        for s in skipped:
            print(f"   - {s}")
        print("\nIl file App.jsx NON è stato toccato.")
        sys.exit(0)

    # ─────────────────────────────────────────────────────────────
    # Backup + scrittura
    # ─────────────────────────────────────────────────────────────
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = APP_PATH.with_suffix(APP_PATH.suffix + f".bak_{timestamp}")
    shutil.copy2(APP_PATH, backup_path)

    APP_PATH.write_text(text, encoding="utf-8")

    print("\n✅ Modifiche applicate con successo:")
    for a in applied:
        print(f"   ✓ {a}")

    if skipped:
        print("\nℹ️  Saltate (probabilmente già corrette o struttura diversa):")
        for s in skipped:
            print(f"   - {s}")

    print(f"\n💾 Backup del file originale salvato in: {backup_path}")
    print("👉 Ora puoi controllare le modifiche in VS Code, testare l'app, e poi fare commit + push.")
    print("   Se qualcosa non va, ripristina il backup rinominandolo in App.jsx.")


if __name__ == "__main__":
    main()
