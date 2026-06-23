#!/usr/bin/env python3
"""
FIX APP - PARTE 4 (correzione bug di sintassi)
Corregge l'errore di build "Unexpected )" causato da una parentesi
di apertura mancante dopo "showDbModal &&".

Errore originale (riga ~2471 in Vercel):
    const dbModal = showDbModal &&
      <div ...>
        ...
      </div>
    );                      <-- questa ")" non ha una "(" corrispondente

JSX multi-riga dopo "&&" deve essere racchiuso tra parentesi.

Va eseguito dalla cartella src (dove si trova App.jsx).
Uso: python fix_app_parte4.py
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
    # FIX: aggiunge la "(" mancante dopo "showDbModal &&" e la ")"
    # di chiusura corrispondente prima del ";" finale.
    # ═══════════════════════════════════════════════════════════
    applica(
        "dbModal: aggiungo parentesi mancante dopo 'showDbModal &&' (causa dell'errore di build)",
        '''  const dbModal = showDbModal && 
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center",padding:12}}
      onClick={()=>setShowDbModal(false)}>''',
        '''  const dbModal = showDbModal && (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center",padding:12}}
      onClick={()=>setShowDbModal(false)}>'''
    )

    applica(
        "dbModal: chiudo la parentesi aperta, subito prima del ');' finale del blocco",
        '''        <div style={{padding:12,borderTop:`1px solid ${T.border}`}}>
          <button onClick={()=>setShowDbModal(false)}
            style={{width:"100%",background:"#64748b",border:"none",borderRadius:10,color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );''',
        '''        <div style={{padding:12,borderTop:`1px solid ${T.border}`}}>
          <button onClick={()=>setShowDbModal(false)}
            style={{width:"100%",background:"#64748b",border:"none",borderRadius:10,color:"#fff",padding:"10px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );'''
    )

    # La seconda "applica" sopra non cambia nulla di per se' (old==new) perche'
    # la parte da modificare e' SOLO l'aggiunta della "(" iniziale: una volta
    # aperta la parentesi dopo "&&", la ")" che gia' esiste alla fine del blocco
    # (quella che dava errore "Unexpected )") diventa automaticamente quella
    # giusta di chiusura. Non serve aggiungerne una seconda.
    # Rimuoviamo quindi questo secondo controllo "fittizio" dal conteggio:
    if modifiche_ok and modifiche_ok[-1].startswith("✓ dbModal: chiudo"):
        modifiche_ok.pop()

    # ═══════════════════════════════════════════════════════════
    # SALVATAGGIO
    # ═══════════════════════════════════════════════════════════
    print("=" * 70)
    print(" RISULTATO MODIFICHE - PARTE 4 (fix bug sintassi)")
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
    print("Questo era il bug che causava 'Unexpected )' nel build su Vercel.")
    print("Mancava la parentesi di apertura dopo 'showDbModal &&' prima del JSX")
    print("multi-riga. Dopo questo fix il deploy dovrebbe completarsi.")

if __name__ == "__main__":
    main()
