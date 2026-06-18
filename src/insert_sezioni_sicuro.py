#!/usr/bin/env python3
"""
Script SICURO per inserire i 19 titoli nelle sezioni di App.jsx
Mostra anteprima e chiede CONSENSO prima di modificare qualsiasi file

Uso: python insert_sezioni_sicuro.py
"""

import os
import sys

# ═══════════════════════════════════════════════════════════════
# CONFIGURAZIONE
# ═══════════════════════════════════════════════════════════════

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"
FILE_BACKUP = "App_backup.jsx"

# I 19 titoli delle sezioni e i testi per trovarli
SEZIONI = [
    {
        "numero": 1,
        "titolo": "IMPORTS + COSTANTI",
        "cerca": "import { useState, useEffect, useRef }",
    },
    {
        "numero": 2,
        "titolo": "LOCALSTORAGE CACHE",
        "cerca": "function saveToLocalStorage",
    },
    {
        "numero": 3,
        "titolo": "UTILITY FUNCTIONS",
        "cerca": "function daysInMonth",
    },
    {
        "numero": 4,
        "titolo": "COLOR & TIME FUNCTIONS",
        "cerca": "function getColorByTime",
    },
    {
        "numero": 5,
        "titolo": "REPORT TEMPLATES + INIT STATE",
        "cerca": "const REPORT_TEMPLATES",
    },
    {
        "numero": 6,
        "titolo": "USESTATE HOOKS",
        "cerca": "const [store, setStore] = useState",
    },
    {
        "numero": 7,
        "titolo": "USEEFFECT INIT + LOAD DA SUPABASE",
        "cerca": "    if(!userId) return;",
    },
    {
        "numero": 8,
        "titolo": "USEEFFECT OVERSCROLL + ONLINE/OFFLINE",
        "cerca": "    function goOnline(){ setIsOnline(true); }",
    },
    {
        "numero": 9,
        "titolo": "THEME & COLORS (dark mode, T object)",
        "cerca": "const sysDark = window.matchMedia",
    },
    {
        "numero": 10,
        "titolo": "CALENDAR VIEW (calView - grid calendario)",
        "cerca": "const totalDays = daysInMonth",
    },
    {
        "numero": 11,
        "titolo": "REPORT VIEW (reportView - report e statistiche)",
        "cerca": "const range = getReportRange();",
    },
    {
        "numero": 12,
        "titolo": "MODELLI VIEW (modelliView - turni e rotazioni)",
        "cerca": "const modelliView = (",
    },
    {
        "numero": 13,
        "titolo": "SETTINGS VIEW (settingsView - impostazioni account)",
        "cerca": "const settingsView = (",
    },
    {
        "numero": 14,
        "titolo": "DAY MODAL (dayModal - form nuovo evento)",
        "cerca": "const curEvts = dayKey ? getEvts",
    },
    {
        "numero": 15,
        "titolo": "DB MODAL + RENDER PRINCIPALE",
        "cerca": "const dbModal = showDbModal &&",
    },
    {
        "numero": 16,
        "titolo": "COMPONENTS (CalBadge, SmartTimeInput, Pal, Sec)",
        "cerca": "function CalBadge({",
    },
    {
        "numero": 17,
        "titolo": "REPORT SUBCOMPONENTS",
        "cerca": "function ConteggioConfigCard",
    },
    {
        "numero": 18,
        "titolo": "MODELLO CARDS & FORMS",
        "cerca": "function Pal({T,",
    },
    {
        "numero": 19,
        "titolo": "ROTAZIONE COMPONENTS",
        "cerca": "function RotazioneCard",
    },
]

def genera_titolo(numero, titolo):
    """Genera il testo del titolo della sezione"""
    return f"// ═══════════════════════════════════════════════════════════════\n// SEZIONE {numero}: {titolo}\n// ═══════════════════════════════════════════════════════════════\n\n"

def trova_sezioni(contenuto):
    """Trova le posizioni dove inserire i titoli"""
    
    linee = contenuto.split("\n")
    trovate = []
    non_trovate = []
    
    for sezione in SEZIONI:
        trovata = False
        for i, linea in enumerate(linee):
            if sezione["cerca"] in linea:
                trovate.append({
                    "numero": sezione["numero"],
                    "titolo": sezione["titolo"],
                    "linea": i,
                    "testo_trovato": linea[:60] + "..." if len(linea) > 60 else linea,
                    "cerca": sezione["cerca"]
                })
                trovata = True
                break
        
        if not trovata:
            non_trovate.append({
                "numero": sezione["numero"],
                "titolo": sezione["titolo"],
                "cerca": sezione["cerca"]
            })
    
    return trovate, non_trovate

def inserisci_sezioni(contenuto, sezioni_trovate):
    """Inserisce i titoli nelle posizioni identificate"""
    
    linee = contenuto.split("\n")
    
    # Ordina per numero di riga (dal basso verso l'alto, così gli indici non cambiano)
    sezioni_ordinate = sorted(sezioni_trovate, key=lambda x: x["linea"], reverse=True)
    
    for sezione in sezioni_ordinate:
        titolo = genera_titolo(sezione["numero"], sezione["titolo"])
        # Inserisci il titolo PRIMA della linea trovata
        linee.insert(sezione["linea"], titolo.rstrip("\n"))
    
    return "\n".join(linee)

def mostra_anteprima(sezioni_trovate, non_trovate):
    """Mostra un'anteprima di quello che farà"""
    
    print()
    print("=" * 80)
    print(" 📋 ANTEPRIMA MODIFICHE")
    print("=" * 80)
    print()
    
    print(f"✓ SEZIONI TROVATE E PRONTE DA INSERIRE: {len(sezioni_trovate)}/19")
    print()
    
    for s in sorted(sezioni_trovate, key=lambda x: x["numero"]):
        print(f"  ✓ SEZIONE {s['numero']:2d} - {s['titolo']:50s} (riga {s['linea']})")
    
    if non_trovate:
        print()
        print(f"❌ SEZIONI NON TROVATE: {len(non_trovate)}")
        print()
        for s in non_trovate:
            print(f"  ❌ SEZIONE {s['numero']:2d} - {s['titolo']:50s}")
            print(f"     Cercava: {s['cerca']}")
    
    print()
    print("=" * 80)
    print(" 📁 FILE CHE VERRANNO CREATI/MODIFICATI")
    print("=" * 80)
    print()
    print(f"  📄 {FILE_INPUT:30s} (file originale - NON modificato)")
    print(f"  📄 {FILE_BACKUP:30s} (backup - copia di sicurezza)")
    print(f"  📄 {FILE_OUTPUT:30s} (NEW - con i titoli inseriti)")
    print()

def chiedi_conferma():
    """Chiede all'utente se vuole procedere"""
    
    while True:
        print("❓ VUOI PROCEDERE CON L'INSERIMENTO?")
        print()
        print("  [S] SÌ - Inserisci i titoli (crea backup e file nuovo)")
        print("  [N] NO - Annulla tutto")
        print()
        
        risposta = input("Scegli (S/N): ").strip().upper()
        
        if risposta == "S":
            return True
        elif risposta == "N":
            return False
        else:
            print("❌ Risposta non valida. Scrivi S o N")
            print()

def main():
    """Funzione principale"""
    
    print()
    print("╔" + "═" * 78 + "╗")
    print("║" + " " * 20 + "SCRIPT SICURO DI INSERIMENTO SEZIONI" + " " * 24 + "║")
    print("║" + " " * 25 + "(Chiede consenso prima di modificare)" + " " * 18 + "║")
    print("╚" + "═" * 78 + "╝")
    print()
    
    # STEP 1: Verifica file
    print("📖 STEP 1: Verifica file...")
    print()
    
    if not os.path.exists(FILE_INPUT):
        print(f"❌ ERRORE: File '{FILE_INPUT}' non trovato!")
        print()
        print(f"   Assicurati che '{FILE_INPUT}' sia nella stessa cartella dello script")
        print()
        print(f"   Posizionamento:")
        print(f"     📁 cartella/")
        print(f"        ├── insert_sezioni_sicuro.py  (questo script)")
        print(f"        └── App.jsx  (il tuo file)")
        print()
        sys.exit(1)
    
    print(f"✓ Trovato: {FILE_INPUT}")
    print()
    
    # STEP 2: Leggi il file
    print("📖 STEP 2: Lettura del file...")
    print()
    
    try:
        with open(FILE_INPUT, 'r', encoding='utf-8') as f:
            contenuto_originale = f.read()
        
        num_righe = len(contenuto_originale.split("\n"))
        print(f"✓ Letto con successo ({num_righe} righe, {len(contenuto_originale)} caratteri)")
    except Exception as e:
        print(f"❌ ERRORE nella lettura: {e}")
        sys.exit(1)
    
    print()
    
    # STEP 3: Cerca le sezioni
    print("🔍 STEP 3: Ricerca delle sezioni...")
    print()
    
    sezioni_trovate, non_trovate = trova_sezioni(contenuto_originale)
    
    print(f"✓ Trovate {len(sezioni_trovate)}/19 sezioni")
    if non_trovate:
        print(f"⚠️  Non trovate {len(non_trovate)} sezioni")
    print()
    
    # STEP 4: Mostra anteprima
    print("🔍 STEP 4: Anteprima delle modifiche...")
    
    mostra_anteprima(sezioni_trovate, non_trovate)
    
    # STEP 5: Chiedi consenso
    print("🔐 STEP 5: Richiesta di consenso...")
    print()
    
    if not chiedi_conferma():
        print()
        print("❌ Operazione annullata. Nessun file è stato modificato.")
        print()
        sys.exit(0)
    
    print()
    print("✓ Consenso ricevuto - Procedere...")
    print()
    
    # STEP 6: Crea backup
    print("💾 STEP 6: Creazione backup...")
    print()
    
    try:
        with open(FILE_BACKUP, 'w', encoding='utf-8') as f:
            f.write(contenuto_originale)
        print(f"✓ Backup creato: {FILE_BACKUP}")
    except Exception as e:
        print(f"❌ ERRORE nel backup: {e}")
        sys.exit(1)
    
    print()
    
    # STEP 7: Inserisci sezioni
    print("🔧 STEP 7: Inserimento dei titoli...")
    print()
    
    try:
        contenuto_aggiornato = inserisci_sezioni(contenuto_originale, sezioni_trovate)
        print(f"✓ Titoli inseriti con successo")
    except Exception as e:
        print(f"❌ ERRORE nell'inserimento: {e}")
        sys.exit(1)
    
    print()
    
    # STEP 8: Salva il file
    print("💾 STEP 8: Salvataggio file aggiornato...")
    print()
    
    try:
        with open(FILE_OUTPUT, 'w', encoding='utf-8') as f:
            f.write(contenuto_aggiornato)
        
        num_righe_new = len(contenuto_aggiornato.split("\n"))
        print(f"✓ File salvato: {FILE_OUTPUT}")
        print(f"  ({num_righe_new} righe, {len(contenuto_aggiornato)} caratteri)")
    except Exception as e:
        print(f"❌ ERRORE nel salvataggio: {e}")
        sys.exit(1)
    
    print()
    print()
    print("╔" + "═" * 78 + "╗")
    print("║" + " " * 30 + "✅ COMPLETATO CON SUCCESSO!" + " " * 21 + "║")
    print("╚" + "═" * 78 + "╝")
    print()
    
    print("📋 RIEPILOGO OPERAZIONI:")
    print()
    print(f"  ✓ File originale:    {FILE_INPUT} (NON modificato)")
    print(f"  ✓ Backup creato:     {FILE_BACKUP} (copia di sicurezza)")
    print(f"  ✓ File aggiornato:   {FILE_OUTPUT} (con 19 titoli)")
    print()
    
    print("📝 PROSSIMI PASSI:")
    print()
    print(f"  1. Apri {FILE_OUTPUT} nel tuo editor")
    print(f"  2. Verifica che i titoli siano corretti")
    print(f"  3. Se tutto OK, sostituisci {FILE_INPUT} con {FILE_OUTPUT}")
    print(f"  4. Commit su GitHub!")
    print()
    print("💡 Se c'è un errore:")
    print(f"  - Il file originale {FILE_INPUT} è intatto")
    print(f"  - Hai il backup in {FILE_BACKUP}")
    print(f"  - Puoi eliminare {FILE_OUTPUT} e ricominciare")
    print()

if __name__ == "__main__":
    main()
