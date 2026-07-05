#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════
# script.py — Richiamato da avvia.bat
#
# Cosa fa, in ordine:
#   1. Controlla che i file del progetto siano presenti e leggibili
#   2. Mostra un riepilogo di cosa risulta modificato/nuovo secondo git
#   3. Chiede il nome del commit da tastiera
#      - invio vuoto  -> NESSUNA modifica, esce senza fare nulla
#      - nome scritto -> git add, commit, push (Vercel fa il deploy
#        automatico se il repo è collegato al progetto Vercel)
# ═══════════════════════════════════════════════════════════════

import subprocess
import sys
import os

REPO_DIR = os.path.dirname(os.path.abspath(__file__))

FILE_DA_CONTROLLARE = [
    "app.jsx",
    "font.jsx",
]


def run(cmd, cwd=REPO_DIR, check=True):
    """Esegue un comando e ritorna (returncode, stdout, stderr)."""
    result = subprocess.run(
        cmd, cwd=cwd, shell=False,
        capture_output=True, text=True
    )
    if check and result.returncode != 0:
        print(f"\n❌ Errore eseguendo: {' '.join(cmd)}")
        print(result.stderr.strip())
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def controlla_file():
    print("── Controllo file del progetto ──────────────────────────")
    tutti_ok = True
    for nome in FILE_DA_CONTROLLARE:
        path = os.path.join(REPO_DIR, nome)
        if not os.path.exists(path):
            print(f"❌ Manca: {nome}")
            tutti_ok = False
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                contenuto = f.read()
            if len(contenuto.strip()) == 0:
                print(f"⚠️  Vuoto: {nome}")
                tutti_ok = False
            else:
                print(f"✅ OK: {nome} ({len(contenuto.splitlines())} righe)")
        except Exception as e:
            print(f"❌ Errore leggendo {nome}: {e}")
            tutti_ok = False
    return tutti_ok


def verifica_git_repo():
    codice, _, _ = run(["git", "rev-parse", "--is-inside-work-tree"], check=False)
    return codice == 0


def mostra_stato_git():
    print("\n── Stato Git (file modificati/nuovi) ────────────────────")
    codice, out, _ = run(["git", "status", "--short"], check=False)
    if codice != 0:
        print("⚠️  Impossibile leggere lo stato git.")
        return False
    if not out:
        print("Nessuna modifica rilevata rispetto all'ultimo commit.")
        return False
    print(out)
    return True


def main():
    print("═══════════════════════════════════════════════════════")
    print("  VERIFICA MODIFICHE — Turni App")
    print("═══════════════════════════════════════════════════════\n")

    if not controlla_file():
        print("\n❌ Alcuni file hanno problemi. Correggi prima di continuare.")
        input("\nPremi INVIO per chiudere...")
        sys.exit(1)

    if not verifica_git_repo():
        print("\n❌ Questa cartella non è un repository git.")
        print("   Esegui 'git init' e collega il remote prima di usare questo script.")
        input("\nPremi INVIO per chiudere...")
        sys.exit(1)

    ci_sono_modifiche = mostra_stato_git()

    if not ci_sono_modifiche:
        print("\nNiente da pubblicare.")
        input("\nPremi INVIO per chiudere...")
        sys.exit(0)

    print("\n✅ Controlli completati. I file sono pronti per essere pubblicati.")
    print("─────────────────────────────────────────────────────────")
    nome_commit = input("Nome del commit (INVIO vuoto = annulla, nessuna modifica): ").strip()

    if not nome_commit:
        print("\n🚫 Annullato. Nessuna modifica è stata salvata o inviata.")
        input("\nPremi INVIO per chiudere...")
        sys.exit(0)

    print(f"\n── Pubblico con messaggio: \"{nome_commit}\" ─────────────")

    codice, _, err = run(["git", "add", "."])
    if codice != 0:
        input("\nPremi INVIO per chiudere...")
        sys.exit(1)

    codice, out, err = run(["git", "commit", "-m", nome_commit], check=False)
    if codice != 0:
        # Può fallire se non ci sono modifiche indicizzate: lo segnaliamo e usciamo
        print(out)
        print(err)
        print("\n⚠️  Commit non creato (probabilmente nessuna modifica da salvare).")
        input("\nPremi INVIO per chiudere...")
        sys.exit(1)
    print(out)
    print("✅ Commit creato.")

    print("\n── Push su remote (triggera il deploy Vercel) ───────────")
    codice, out, err = run(["git", "push"])
    if codice != 0:
        print("\n❌ Push fallito. Il commit è stato creato in locale ma NON inviato.")
        print("   Controlla la connessione o le credenziali git e riprova con 'git push' a mano.")
        input("\nPremi INVIO per chiudere...")
        sys.exit(1)
    print(out)
    print("\n✅ Push completato. Se il repository è collegato a Vercel,")
    print("   il deploy automatico partirà a breve.")
    input("\nPremi INVIO per chiudere...")


if __name__ == "__main__":
    main()
