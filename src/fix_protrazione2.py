#!/usr/bin/env python3
"""
fix_protrazione2.py
Corregge il salvataggio della protrazione in saveEvt():
- elimina il blocco silenzioso che impediva la creazione dell'evento
  figlio quando il calcolo dei minuti di eccedenza risultava <= 0
- forza minimo 1 minuto se l'orario inserito coincide con l'inizio
  (evita il blocco totale)

Legge:  App.jsx
Scrive: App_updated.jsx
"""

import os
import sys

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

OLD_BLOCK = '''      const minsEccedenza = calcMinutiProtrazione(oraInizioProtrazione, oraFineProtrazione);

      if(minsEccedenza > 0){'''

NEW_BLOCK = '''      let minsEccedenza = calcMinutiProtrazione(oraInizioProtrazione, oraFineProtrazione);
      if(minsEccedenza <= 0) minsEccedenza = 1; // evita che il salvataggio venga bloccato silenziosamente

      {'''

OLD_BLOCK_FALLBACK = '''      const minsEccedenza = calcMinsStr(oraInizioProtrazione, oraFineProtrazione);
      if(minsEccedenza > 0){'''

NEW_BLOCK_FALLBACK = '''      let minsEccedenza = calcMinsStr(oraInizioProtrazione, oraFineProtrazione);
      if(minsEccedenza <= 0) minsEccedenza = 1; // evita che il salvataggio venga bloccato silenziosamente

      {'''


def main():
    if not os.path.exists(FILE_INPUT):
        print(f"❌ Non trovo '{FILE_INPUT}' in questa cartella.")
        sys.exit(1)

    with open(FILE_INPUT, "r", encoding="utf-8") as f:
        content = f.read()

    if OLD_BLOCK in content:
        new_content = content.replace(OLD_BLOCK, NEW_BLOCK)
        print("✅ Corretto il blocco minsEccedenza in saveEvt().")
    elif OLD_BLOCK_FALLBACK in content:
        new_content = content.replace(OLD_BLOCK_FALLBACK, NEW_BLOCK_FALLBACK)
        print("✅ Corretto il blocco minsEccedenza (versione originaria) in saveEvt().")
    else:
        print("❌ Non ho trovato il blocco da correggere. Nessuna modifica effettuata.")
        sys.exit(1)

    with open(FILE_OUTPUT, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"   Letto:   {FILE_INPUT}")
    print(f"   Scritto: {FILE_OUTPUT}")


if __name__ == "__main__":
    main()
