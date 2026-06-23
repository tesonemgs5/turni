#!/usr/bin/env python3
"""
FIX APP - PARTE 2
Applica la modifica: i turni senza orario o H24 possono essere
posizionati liberamente nella lista (nessun vincolo di fascia oraria),
mentre i turni con orario restano in ordine cronologico.

Va eseguito dalla cartella src (dove si trova App.jsx).
Uso: python fix_app_parte2.py
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
    # MODIFICA: turni senza orario / H24 liberi di stare ovunque.
    # getFasciaModello ora restituisce "libero" per i modelli H24
    # o senza orario, cosi' moveH24 non blocca piu' il loro spostamento
    # contro modelli con orario (il blocco resta solo tra fasce diverse
    # quando ENTRAMBI i modelli coinvolti hanno un orario impostato).
    # ═══════════════════════════════════════════════════════════
    applica(
        "getFasciaModello: i modelli H24/senza orario diventano 'liberi' (nessun vincolo fascia)",
        '''  function getFasciaModello(m){
    if(m.tempo==="h24") return "h24";
    if(!m.inizio) return "h24";
    const [h]=m.inizio.split(":").map(Number);
    if(h>=6&&h<12) return "mattina";
    if(h>=12&&h<16||(h===16&&parseInt((m.inizio.split(":")[1]||"0"))<30)) return "pomeriggio";
    if(h>=16&&h<23) return "terzo";
    return "notte";
  }''',
        '''  function getFasciaModello(m){
    // Turni H24 o senza orario: nessun vincolo, possono essere spostati ovunque
    if(m.tempo==="h24") return "libero";
    if(!m.inizio) return "libero";
    const [h]=m.inizio.split(":").map(Number);
    if(h>=6&&h<12) return "mattina";
    if(h>=12&&h<16||(h===16&&parseInt((m.inizio.split(":")[1]||"0"))<30)) return "pomeriggio";
    if(h>=16&&h<23) return "terzo";
    return "notte";
  }'''
    )

    applica(
        "moveH24: il blocco di fascia si applica solo se ENTRAMBI i modelli hanno un orario (i 'liberi' si spostano sempre)",
        '''    // ── Blocco: non può sforare in una fascia oraria diversa ──
    const fasciaCorrente = getFasciaModello(sorted[idx]);
    const fasciaTarget = getFasciaModello(sorted[swapIdx]);
    if(fasciaCorrente!==fasciaTarget) return; // bloccato''',
        '''    // ── Blocco fascia: si applica solo tra due turni con orario impostato.
    // I turni H24/senza orario ("liberi") possono sempre essere spostati.
    const fasciaCorrente = getFasciaModello(sorted[idx]);
    const fasciaTarget = getFasciaModello(sorted[swapIdx]);
    const entrambiConOrario = fasciaCorrente!=="libero" && fasciaTarget!=="libero";
    if(entrambiConOrario && fasciaCorrente!==fasciaTarget) return; // bloccato'''
    )

    # ═══════════════════════════════════════════════════════════
    # SALVATAGGIO
    # ═══════════════════════════════════════════════════════════
    print("=" * 70)
    print(" RISULTATO MODIFICHE - PARTE 2")
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
    print("NOTA: questa modifica riguarda solo lo spostamento con le frecce")
    print("(moveH24) e il drag/drop usa già lo stesso meccanismo di sortOrder,")
    print("quindi il comportamento è coerente anche lì.")

if __name__ == "__main__":
    main()
