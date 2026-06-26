#!/usr/bin/env python3
"""
fix_app.py
Applica le correzioni ai bug trovati in App.jsx e produce App_updated.jsx
"""

import re

INPUT_FILE  = "../src/App.jsx"
OUTPUT_FILE = "App_updated.jsx"

# ─────────────────────────────────────────────────────────────

def leggi(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def scrivi(path, contenuto):
    with open(path, "w", encoding="utf-8") as f:
        f.write(contenuto)
    print(f"  ✓ Scritto: {path}")

# ── FIX 1 ────────────────────────────────────────────────────
# computeConteggioForReport: result manca di primo e secondo
# ─────────────────────────────────────────────────────────────
def fix_result_init(src):
    vecchio = "const result = { totale:0, mattina:0, pomeriggio:0, notte:0, terzo:0, h24:0, app:0, auto:0 };"
    nuovo   = "const result = { totale:0, primo:0, secondo:0, h24:0, app:0, auto:0 };"
    if vecchio not in src:
        print("  ⚠  FIX 1: pattern non trovato, skip")
        return src
    print("  ✓ FIX 1: result init corretto (aggiunto primo/secondo, rimosso mattina/pomeriggio/notte/terzo)")
    return src.replace(vecchio, nuovo, 1)

# ── FIX 2 ────────────────────────────────────────────────────
# FasceExpand.turniDiFascia: soglia secondo turno 720 → 705
# ─────────────────────────────────────────────────────────────
def fix_soglia_secondo(src):
    vecchio = "      return mins>=720;"
    nuovo   = "      return mins>=705;"
    if vecchio not in src:
        print("  ⚠  FIX 2: pattern non trovato, skip")
        return src
    print("  ✓ FIX 2: soglia secondo turno corretta (720 → 705)")
    return src.replace(vecchio, nuovo, 1)

# ── FIX 3 ────────────────────────────────────────────────────
# DomenicheView: etichetta ordinal sempre vuota per concatenazione errata
# ─────────────────────────────────────────────────────────────
def fix_domeniche_label(src):
    vecchio = r'<span style={{fontSize:10,color:T.sub}}>({i%4===0?"1":"" + (i%4===1?"2":"") + (i%4===2?"3":"") + (i%4===3?"4":"")}ª/{4})</span>'
    nuovo   = r'<span style={{fontSize:10,color:T.sub}}>({`${i%4+1}ª/4`})</span>'
    if vecchio not in src:
        print("  ⚠  FIX 3: pattern non trovato, skip")
        return src
    print("  ✓ FIX 3: etichetta ordinal domenica corretta")
    return src.replace(vecchio, nuovo, 1)

# ── FIX 4 ────────────────────────────────────────────────────
# NLRSScalanteView: ricerca prossimoDow va indietro invece che avanti
# ─────────────────────────────────────────────────────────────
def fix_nlrs_scalante_dir(src):
    vecchio = (
        "      let tentativo = new Date(base);\n"
        "      let iter = 0;\n"
        "      while(tentativo.getDay() !== prossimoDow && iter < 14){\n"
        "        tentativo.setDate(tentativo.getDate() - 1);\n"
        "        iter++;\n"
        "      }"
    )
    nuovo = (
        "      let tentativo = new Date(base);\n"
        "      let iter = 0;\n"
        "      while(tentativo.getDay() !== prossimoDow && iter < 14){\n"
        "        tentativo.setDate(tentativo.getDate() + 1);\n"
        "        iter++;\n"
        "      }"
    )
    if vecchio not in src:
        print("  ⚠  FIX 4: pattern non trovato, skip")
        return src
    print("  ✓ FIX 4: direzione ricerca prossimoDow corretta (- → +)")
    return src.replace(vecchio, nuovo, 1)

# ─────────────────────────────────────────────────────────────

def main():
    print(f"\n  Lettura: {INPUT_FILE}")
    src = leggi(INPUT_FILE)

    src = fix_result_init(src)
    src = fix_soglia_secondo(src)
    src = fix_domeniche_label(src)
    src = fix_nlrs_scalante_dir(src)

    scrivi(OUTPUT_FILE, src)
    print(f"\n  File pronto: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
