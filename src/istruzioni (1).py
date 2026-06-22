#!/usr/bin/env python3
"""
LAUNCHER - istruzioni.py
Esegue uno script Python, poi gestisce rename file e git automaticamente.
Tutto si ferma finché non premi S.

Uso: python istruzioni.py
"""

import os
import sys
import subprocess

# ═══════════════════════════════════════════════════════════════
# CONFIGURAZIONE - modifica qui se necessario
# ═══════════════════════════════════════════════════════════════

# File da rinominare dopo l'esecuzione dello script
# (lascia vuoto "" se non serve rinominare)
FILE_OUTPUT  = "App_updated.jsx"   # file creato dallo script
FILE_FINALE  = "App.jsx"           # nome finale che deve avere

# ═══════════════════════════════════════════════════════════════

def separatore():
    print("=" * 70)

def run_git(cmd, descrizione):
    """Esegue un comando git e riporta errori"""
    print(f"\n  ▶ {descrizione}...")
    result = subprocess.run(cmd, capture_output=True, text=True, shell=True, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if result.stdout.strip():
        print(f"    {result.stdout.strip()}")
    if result.returncode != 0:
        print(f"\n  ❌ ERRORE git: {result.stderr.strip()}")
        return False
    print(f"  ✓ OK")
    return True

def scegli_script():
    """Mostra gli script .py disponibili e chiede quale eseguire"""
    scripts = [f for f in os.listdir(".") if f.endswith(".py") and f != "istruzioni.py"]
    
    if not scripts:
        print("❌ Nessuno script .py trovato in questa cartella!")
        sys.exit(1)
    
    print("\n📋 SCRIPT DISPONIBILI:")
    print()
    for i, s in enumerate(scripts):
        print(f"  [{i+1}] {s}")
    print()
    
    while True:
        scelta = input("Scegli il numero dello script da eseguire: ").strip()
        if scelta.isdigit() and 1 <= int(scelta) <= len(scripts):
            return scripts[int(scelta) - 1]
        print("  ❌ Numero non valido, riprova.")

def esegui_script(nome_script):
    """Esegue lo script scelto come subprocess"""
    print(f"\n▶ Esecuzione di: {nome_script}")
    separatore()
    
    result = subprocess.run(
        [sys.executable, nome_script],
        text=True
    )
    
    separatore()
    return result.returncode == 0

def chiedi_messaggio_commit():
    """Chiede all'utente il messaggio di commit da usare"""
    print()
    separatore()
    print(" ✏️  MESSAGGIO COMMIT")
    separatore()
    print()
    while True:
        msg = input("Scrivi il messaggio di commit: ").strip()
        if msg:
            return msg
        print("  ❌ Il messaggio non può essere vuoto, riprova.")

def chiedi_conferma_finale(commit_msg):
    """Chiede se procedere con rename e git"""
    print()
    separatore()
    print(" 🔐 CONFERMA OPERAZIONI FINALI")
    separatore()
    print()
    print("  Dopo aver premuto S verranno eseguite queste operazioni:")
    print()
    if FILE_OUTPUT and os.path.exists(FILE_OUTPUT):
        print(f"  1. Rename:  {FILE_OUTPUT}  →  {FILE_FINALE}  (sovrascrive il file attuale, nessun backup locale)")
    else:
        print(f"  (nessun rename — {FILE_OUTPUT} non trovato)")
    print(f"  2. git add .")
    print(f"  3. git commit -m \"{commit_msg}\"")
    print(f"  4. git push")
    print()
    
    while True:
        risposta = input("Scegli (S/N): ").strip().upper()
        if risposta == "S":
            return True
        elif risposta == "N":
            print("\n❌ Operazioni finali annullate. File NON modificati, nessun git.")
            return False
        else:
            print("  ❌ Scrivi S o N")

def fai_rename():
    """Rinomina il file di output nel file finale, senza backup locale
    (il backup è già garantito da Git/Vercel)."""
    if not FILE_OUTPUT or not os.path.exists(FILE_OUTPUT):
        print(f"  ⚠️  {FILE_OUTPUT} non trovato, skip rename.")
        return True
    
    print("\n📁 RENAME FILE:")
    
    if os.path.exists(FILE_FINALE):
        os.remove(FILE_FINALE)
    os.rename(FILE_OUTPUT, FILE_FINALE)
    print(f"  ✓ {FILE_OUTPUT} → {FILE_FINALE}")
    
    return True

def fai_git(commit_msg):
    """Esegue git add, commit, push con gestione errori"""
    print("\n🔧 GIT:")
    
    ok = run_git("git add .", "git add .")
    if not ok:
        print("\n  ⚠️  git add fallito. Continuo comunque...")
    
    ok = run_git(f'git commit -m "{commit_msg}"', f'git commit -m "{commit_msg}"')
    if not ok:
        print("\n  ⚠️  git commit fallito (forse niente da committare?)")
        return False
    
    ok = run_git("git push", "git push")
    if not ok:
        print()
        print("  ❌ git push fallito. NON verrà eseguito --force automatico.")
        print("  Controlla la connessione o fai 'git pull' prima di riprovare.")
        print("  Poi esegui manualmente:  git push")
        return False
    
    return True

def main():
    print()
    print("╔" + "═" * 68 + "╗")
    print("║" + " " * 22 + "🚀 LAUNCHER SCRIPT" + " " * 28 + "║")
    print("╚" + "═" * 68 + "╝")
    
    # STEP 1: scegli script
    separatore()
    print(" STEP 1: Scegli lo script da eseguire")
    separatore()
    nome_script = scegli_script()
    
    # STEP 2: esegui script
    separatore()
    print(f" STEP 2: Esecuzione {nome_script}")
    separatore()
    successo = esegui_script(nome_script)
    
    if not successo:
        print(f"\n⚠️  Lo script {nome_script} è uscito con errore.")
        print("   Vuoi procedere comunque con rename e git? (S/N): ", end="")
        r = input().strip().upper()
        if r != "S":
            print("❌ Operazioni annullate.")
            sys.exit(0)
    
    # STEP 3: chiedi il messaggio di commit
    commit_msg = chiedi_messaggio_commit()
    
    # STEP 4: conferma rename + git
    separatore()
    print(" STEP 4: Conferma operazioni finali")
    separatore()
    
    if not chiedi_conferma_finale(commit_msg):
        sys.exit(0)
    
    # STEP 5: rename
    fai_rename()
    
    # STEP 6: git
    fai_git(commit_msg)
    
    # FINE
    print()
    separatore()
    print(" ✅ TUTTO COMPLETATO!")
    separatore()
    print()
    print(f"  ✓ Script eseguito:  {nome_script}")
    if os.path.exists(FILE_FINALE):
        print(f"  ✓ File aggiornato:  {FILE_FINALE}")
    print(f"  ✓ Commit:           \"{commit_msg}\"")
    print(f"  ✓ Git push:         fatto")
    print()

if __name__ == "__main__":
    main()
