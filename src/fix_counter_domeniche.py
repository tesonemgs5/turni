#!/usr/bin/env python3
"""
fix_counter_domeniche.py
Corregge il contatore "X giorni configurati" nel dettaglio rotazione:
per le rotazioni domeniche mostra il numero calcolato dinamicamente
invece di leggere solo la griglia (che è vuota finché non si preme Fatto).
"""

INPUT_FILE  = "../src/App.jsx"
OUTPUT_FILE = "App_updated.jsx"

def leggi(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def scrivi(path, contenuto):
    with open(path, "w", encoding="utf-8") as f:
        f.write(contenuto)
    print(f"  ✓ Scritto: {path}")

def fix_counter(src):
    vecchio = '                  {Object.values(rot.griglia||{}).filter(Boolean).length} giorni configurati'
    nuovo   = '                  {rot.tipo==="domeniche"&&rot.dataInizio?Math.ceil((rot.nSettimane||52)/4):Object.values(rot.griglia||{}).filter(Boolean).length} giorni configurati'
    if vecchio not in src:
        print("  ⚠  FIX: pattern non trovato, skip")
        return src
    print("  ✓ FIX: contatore giorni configurati corretto per rotazioni domeniche")
    return src.replace(vecchio, nuovo, 1)

def main():
    print(f"\n  Lettura: {INPUT_FILE}")
    src = leggi(INPUT_FILE)
    src = fix_counter(src)
    scrivi(OUTPUT_FILE, src)
    print(f"\n  File pronto: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
