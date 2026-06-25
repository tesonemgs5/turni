#!/usr/bin/env python3
"""
DIAGNOSTICA - non modifica nulla.
Cerca i 3 blocchi target in App.jsx e, se non li trova esatti,
mostra dove inizia la prima differenza (carattere per carattere)
contro la riga più simile presente nel file.

Uso: metti questo file nella cartella con App.jsx e lancialo da istruzioni.py
"""

import os, sys, difflib

FILE_INPUT = "App.jsx"

print("="*70)
print(" DIAGNOSTICA fix_rotazioni — non scrive nessun file")
print("="*70)

if not os.path.exists(FILE_INPUT):
    print(f"\n❌ Non trovo {FILE_INPUT} qui: {os.getcwd()}")
    sys.exit(1)

with open(FILE_INPUT, "rb") as f:
    raw = f.read()

ha_crlf = b"\r\n" in raw
ha_bom = raw.startswith(b"\xef\xbb\xbf")
print("")
print("Dimensione file: " + str(len(raw)) + " bytes")
print("Contiene CRLF (\\r\\n)?  " + ("SI" if ha_crlf else "NO"))
print("Encoding BOM UTF-8?    " + ("SI" if ha_bom else "NO"))

content = raw.decode("utf-8", errors="replace")

targets = {
    "FIX_1a (chiamata RotazioneCard)": '<RotazioneCard r={r} T={T} accent={accent} modelli={modelli}',
    "FIX_1b (def RotazioneCard)": 'function RotazioneCard({r, T, accent, modelli, onOpen, onDelete}){',
    "FIX_2 (modal shifts vuoto)": '{(activeCal?.shifts||[]).length>0&&(',
}

for name, needle in targets.items():
    print("\n" + "-"*70)
    print(f" {name}")
    print("-"*70)
    idx = content.find(needle)
    if idx == -1:
        print(f"  ❌ Stringa-ancora NON trovata nel file: {needle!r}")
        # Cerca la riga più simile usando difflib
        lines = content.split("\n")
        best = difflib.get_close_matches(needle, lines, n=1, cutoff=0.3)
        if best:
            print(f"  Riga più simile trovata nel file:")
            print(f"  {best[0]!r}")
        else:
            print("  Nessuna riga simile trovata.")
    else:
        line_no = content.count("\n", 0, idx) + 1
        print(f"  ✓ Trovata alla riga {line_no}")
        # Mostra contesto: 200 caratteri da quel punto, con repr per vedere
        # spazi/caratteri invisibili esatti
        snippet = content[idx:idx+250]
        print(f"  Contenuto esatto (repr) da quel punto:")
        print(f"  {snippet!r}")

print("\n" + "="*70)
print(" Fine diagnostica. Copia tutto questo output e mandalo a Claude.")
print("="*70)
