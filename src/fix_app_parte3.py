#!/usr/bin/env python3
"""
FIX APP - PARTE 3
Pulizia del codice: rimuove ridondanze concrete trovate in App.jsx
(setStore duplicato, IIFE morti/inutilizzati lasciati da refactoring precedenti).
Nessuna di queste modifiche cambia il comportamento dell'app, solo pulizia.

Va eseguito dalla cartella src (dove si trova App.jsx).
Uso: python fix_app_parte3.py
Crea App_updated.jsx (poi usa il tuo istruzioni.py per rename + git).
"""

import os
import sys

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

def main():
    if not os.path.exists(FILE_INPUT):
        print(f"❌ ERRORE: {FILE_INPUT} non trovato in questa cartella!")
        print("   Esegui questo script dalla cartella 'src' del progetto.")
        sys.exit(1)

    with open(FILE_INPUT, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content
    modifiche_ok = []
    modifiche_fallite = []

    def applica(descrizione, old, new, occorrenze_attese=1):
        nonlocal content
        count = content.count(old)
        if count == 0:
            modifiche_fallite.append(f"❌ NON TROVATO: {descrizione}")
            return
        if count != occorrenze_attese:
            modifiche_fallite.append(
                f"⚠️  ATTENZIONE: {descrizione} → trovate {count} occorrenze (attese {occorrenze_attese})."
            )
        content = content.replace(old, new)
        modifiche_ok.append(f"✓ {descrizione}")

    # ═══════════════════════════════════════════════════════════
    # PULIZIA 1: setStore chiamato due volte di fila con gli stessi
    # identici argomenti (Sezione 7, dopo il caricamento da Supabase).
    # ═══════════════════════════════════════════════════════════
    applica(
        "Rimuovo chiamata setStore duplicata (era chiamata identica 2 volte di fila)",
        '''        setStore({ calendars, events, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings });
        setStore({ calendars, events, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings });
        setCalId(calendars[0]?.id||null);''',
        '''        setStore({ calendars, events, theme, extraHols, reports: savedReports, reportSettings: savedReportSettings });
        setCalId(calendars[0]?.id||null);'''
    )

    # ═══════════════════════════════════════════════════════════
    # PULIZIA 2: IIFE morto dentro ConteggioConfigCard (Sezione 17),
    # dichiara uno useState che non viene mai usato/renderizzato.
    # ═══════════════════════════════════════════════════════════
    applica(
        "Rimuovo IIFE morto/inutilizzato in ConteggioConfigCard (openFascia non usato)",
        '''        {(()=>{
          const [openFascia, setOpenFascia] = [null, ()=>{}];
          // Usiamo un ref tramite dataset per gestire l'espansione senza useState annidato
          return null;
        })()}
        <FasceExpand data={data} pct1={pct1} pct2={pct2} T={T} modelli={modelli} accent={accent}/>''',
        '''        <FasceExpand data={data} pct1={pct1} pct2={pct2} T={T} modelli={modelli} accent={accent}/>'''
    )

    # ═══════════════════════════════════════════════════════════
    # PULIZIA 3: variabile showAdd dichiarata ma mai usata nel
    # pannello "Aggiungi report" (resto della IIFE usa solo isAddOpen).
    # ═══════════════════════════════════════════════════════════
    applica(
        "Rimuovo variabile showAdd inutilizzata nel pannello 'Aggiungi report'",
        '''      {(()=>{
        const [showAdd, setShowAdd] = (typeof useState !== "undefined" ? [false, ()=>{}] : [false, ()=>{}]);
        // Usiamo openReportConfig==='__add__' come flag per mostrare il pannello aggiungi
        const isAddOpen = openReportConfig==='__add__';''',
        '''      {(()=>{
        // openReportConfig==='__add__' funge da flag per mostrare il pannello aggiungi
        const isAddOpen = openReportConfig==='__add__';'''
    )

    # ═══════════════════════════════════════════════════════════
    # SALVATAGGIO
    # ═══════════════════════════════════════════════════════════
    print("=" * 70)
    print(" RISULTATO MODIFICHE - PARTE 3 (pulizia codice)")
    print("=" * 70)
    for m in modifiche_ok:
        print(m)
    if modifiche_fallite:
        print()
        print(" ⚠️  PROBLEMI:")
        for m in modifiche_fallite:
            print(" " + m)

    if content == original_content:
        print()
        print("❌ Nessuna modifica applicata (file identico). Non salvo nulla.")
        sys.exit(1)

    with open(FILE_OUTPUT, "w", encoding="utf-8") as f:
        f.write(content)

    print()
    print(f"✅ File salvato come: {FILE_OUTPUT}")
    print("   Ora esegui il tuo launcher (avvia_istruzioni.bat) per fare rename + git.")
    print()
    print("NOTA: queste sono pulizie di codice morto/duplicato individuate nel file.")
    print("Non cambiano alcun comportamento visibile dell'app.")

if __name__ == "__main__":
    main()
