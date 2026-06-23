#!/usr/bin/env python3
"""
FIX APP - PARTE 5
1) Titolo "Modelli" ingrandito di 2 punti
2) Fix vero dello spostamento libero dei turni H24/senza orario:
   sortedModelli() ora li lascia in QUALSIASI posizione decisa dal
   loro sortOrder, senza raggrupparli forzatamente in fondo o per fascia
   (restano raggruppati SOLO i 4 modelli "intestazione" MATTINA/
   POMERIGGIO/3° TURNO/NOTTE, che servono da ancoraggio per i turni
   con orario).

Va eseguito dalla cartella src (dove si trova App.jsx).
Uso: python fix_app_parte5.py
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
    # MODIFICA 1: titolo "Modelli" +2 (22 -> 24)
    # ═══════════════════════════════════════════════════════════
    applica(
        "Titolo 'Modelli': fontSize 22px -> 24px (+2)",
        '<div style={{fontSize:22,fontWeight:900,fontFamily:"Georgia,serif",color:T.text}}>Modelli</div>',
        '<div style={{fontSize:24,fontWeight:900,fontFamily:"Georgia,serif",color:T.text}}>Modelli</div>'
    )

    # ═══════════════════════════════════════════════════════════
    # MODIFICA 2: sortedModelli - i turni VERAMENTE liberi (h24 o
    # senza inizio, NON le 4 intestazioni di fascia) si ordinano
    # solo in base al loro sortOrder assoluto, senza essere spinti
    # in fondo (99999) né raggruppati per fascia.
    # ═══════════════════════════════════════════════════════════
    applica(
        "sortedModelli: i turni liberi (h24/senza orario, non intestazioni) si ordinano per sortOrder assoluto",
        '''    return [...modelli].sort((a,b)=>{
      const gA=getGruppoKey(a);
      const gB=getGruppoKey(b);

      if(gA&&gB&&gA===gB){
        const aInt=isIntestatario(a);
        const bInt=isIntestatario(b);
        if(aInt&&!bInt) return -1;
        if(!aInt&&bInt) return 1;
        const minsA=getSortMins(a);
        const minsB=getSortMins(b);
        if(minsA!==minsB) return minsA-minsB;
        return (a.sortOrder||0)-(b.sortOrder||0);
      }

      const minsA=getSortMins(a);
      const minsB=getSortMins(b);
      if(minsA!==minsB) return minsA-minsB;

      const aInt=isIntestatario(a);
      const bInt=isIntestatario(b);
      if(aInt&&!bInt) return -1;
      if(!aInt&&bInt) return 1;
      return (a.sortOrder||0)-(b.sortOrder||0);
    });
  }''',
        '''    // Un turno e' "libero" se e' h24/senza orario e NON e' una delle
    // 4 intestazioni di fascia (MATTINA/POMERIGGIO/3° TURNO/NOTTE).
    // I turni liberi non vengono raggruppati né spinti in fondo:
    // restano ordinati solo in base al sortOrder assoluto tra tutti
    // i modelli, cosi' possono stare ovunque l'utente li sposti.
    function isLibero(m){
      return (m.tempo==="h24"||!m.inizio) && !isIntestatario(m);
    }

    return [...modelli].sort((a,b)=>{
      const aLib=isLibero(a);
      const bLib=isLibero(b);

      // Due turni liberi tra loro: solo sortOrder assoluto
      if(aLib&&bLib) return (a.sortOrder||0)-(b.sortOrder||0);

      // Un libero contro uno con orario/intestazione: decide il sortOrder
      // assoluto rispetto a TUTTI i modelli, non il raggruppamento per fascia.
      if(aLib!==bLib) return (a.sortOrder||0)-(b.sortOrder||0);

      const gA=getGruppoKey(a);
      const gB=getGruppoKey(b);

      if(gA&&gB&&gA===gB){
        const aInt=isIntestatario(a);
        const bInt=isIntestatario(b);
        if(aInt&&!bInt) return -1;
        if(!aInt&&bInt) return 1;
        const minsA=getSortMins(a);
        const minsB=getSortMins(b);
        if(minsA!==minsB) return minsA-minsB;
        return (a.sortOrder||0)-(b.sortOrder||0);
      }

      const minsA=getSortMins(a);
      const minsB=getSortMins(b);
      if(minsA!==minsB) return minsA-minsB;

      const aInt=isIntestatario(a);
      const bInt=isIntestatario(b);
      if(aInt&&!bInt) return -1;
      if(!aInt&&bInt) return 1;
      return (a.sortOrder||0)-(b.sortOrder||0);
    });
  }'''
    )

    # ═══════════════════════════════════════════════════════════
    # MODIFICA 3: moveH24 - rimuovo del tutto il blocco "fascia"
    # quando uno dei due e' un turno libero, dato che ora
    # sortedModelli rispetta sempre il loro sortOrder assoluto.
    # (questo allinea moveH24 alla nuova sortedModelli sopra)
    # ═══════════════════════════════════════════════════════════
    applica(
        "moveH24: nessun blocco se almeno uno dei due turni è 'libero' (coerente con la nuova sortedModelli)",
        '''    // ── Blocco fascia: si applica solo tra due turni con orario impostato.
    // I turni H24/senza orario ("liberi") possono sempre essere spostati.
    const fasciaCorrente = getFasciaModello(sorted[idx]);
    const fasciaTarget = getFasciaModello(sorted[swapIdx]);
    const entrambiConOrario = fasciaCorrente!=="libero" && fasciaTarget!=="libero";
    if(entrambiConOrario && fasciaCorrente!==fasciaTarget) return; // bloccato''',
        '''    // ── Blocco fascia: si applica solo tra due turni con orario impostato
    // e che NON sono turni "liberi" (h24/senza orario). Un turno libero
    // può sempre essere scambiato con qualsiasi altro turno della lista.
    const liberoCorrente = sorted[idx].tempo==="h24"||!sorted[idx].inizio;
    const liberoTarget = sorted[swapIdx].tempo==="h24"||!sorted[swapIdx].inizio;
    if(!liberoCorrente && !liberoTarget){
      const fasciaCorrente = getFasciaModello(sorted[idx]);
      const fasciaTarget = getFasciaModello(sorted[swapIdx]);
      if(fasciaCorrente!==fasciaTarget) return; // bloccato
    }'''
    )

    # ═══════════════════════════════════════════════════════════
    # SALVATAGGIO
    # ═══════════════════════════════════════════════════════════
    print("=" * 70)
    print(" RISULTATO MODIFICHE - PARTE 5")
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
    print("NOTA SULLA CACHE (problema 'il tasto ricarica non svuota la cache'):")
    print("Questo NON è in questo script — è un problema diverso (Service Worker /")
    print("PWA cache lato browser/telefono), non un bug di sortOrder. Te lo risolvo")
    print("in una prossima parte appena confermi che vuoi procedere anche su questo.")

if __name__ == "__main__":
    main()
