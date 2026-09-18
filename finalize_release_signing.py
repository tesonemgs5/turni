#!/usr/bin/env python3
"""
Completa la configurazione della firma release e lancia la build.

Cosa fa:
1. Crea android/keystore.properties con i dati che inserisci
2. Aggiunge keystore.properties e *.jks a android/.gitignore
3. Lancia ./gradlew assembleRelease (o gradlew.bat su Windows)
4. Controlla che il file finale sia app-release.apk (firmato) e non
   app-release-unsigned.apk

NOTA: presuppone che tu abbia gia' sostituito android/app/build.gradle
con la versione che collega signingConfigs.release (quella fornita a parte).

Uso:
    python finalize_release_signing.py
oppure, se lo lanci da una cartella diversa dal progetto:
    python finalize_release_signing.py "C:\\Users\\franc\\Desktop\\calendario\\calendario"
"""

import os
import sys
import subprocess
import getpass


def find_project_root(start_path):
    candidates = [start_path, os.path.join(start_path, "calendario")]
    for c in candidates:
        if os.path.isfile(os.path.join(c, "android", "app", "build.gradle")):
            return c
    return None


def main():
    start_path = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    project_root = find_project_root(start_path)

    if not project_root:
        print("ERRORE: non trovo 'android/app/build.gradle' partendo da:", start_path)
        print("Lancia lo script dalla cartella del progetto (quella con dentro 'android'),")
        print("oppure passala come argomento tra virgolette.")
        sys.exit(1)

    android_dir = os.path.join(project_root, "android")
    keystore_props_path = os.path.join(android_dir, "keystore.properties")
    gitignore_path = os.path.join(android_dir, ".gitignore")
    app_gradle_path = os.path.join(android_dir, "app", "build.gradle")

    print(f"Progetto trovato in: {project_root}\n")

    # Controllo che build.gradle sia gia' stato aggiornato
    with open(app_gradle_path, "r", encoding="utf-8") as f:
        gradle_content = f.read()
    if "signingConfigs" not in gradle_content or "keystoreProperties" not in gradle_content:
        print("ATTENZIONE: 'android/app/build.gradle' non sembra ancora aggiornato")
        print("con il blocco signingConfigs / keystoreProperties.")
        print("Sostituiscilo prima con il file fornito, poi rilancia questo script.")
        sys.exit(1)

    # ---- 1. keystore.properties ----
    if os.path.isfile(keystore_props_path):
        print(f"'{keystore_props_path}' esiste gia'. Non lo tocco.")
    else:
        print("Inserisci i dati del keystore creato con Android Studio.")
        default_store = os.path.join(project_root, "turni-release.jks")
        store_file = input(f"Percorso completo del file .jks [{default_store}]: ").strip()
        if not store_file:
            store_file = default_store
        if not os.path.isfile(store_file):
            print(f"ATTENZIONE: non trovo il file '{store_file}'. Controlla il percorso e rilancia lo script.")
            sys.exit(1)

        store_password = getpass.getpass("Key store password: ")
        key_alias = input("Key alias (es. turni): ").strip()
        key_password = getpass.getpass("Key password: ")

        store_file_escaped = store_file.replace("\\", "\\\\")
        content = (
            f"storeFile={store_file_escaped}\n"
            f"storePassword={store_password}\n"
            f"keyAlias={key_alias}\n"
            f"keyPassword={key_password}\n"
        )
        with open(keystore_props_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Creato: {keystore_props_path}\n")

    # ---- 2. .gitignore ----
    lines_to_add = ["keystore.properties", "*.jks"]
    existing = ""
    if os.path.isfile(gitignore_path):
        with open(gitignore_path, "r", encoding="utf-8") as f:
            existing = f.read()

    missing = [l for l in lines_to_add if l not in existing]
    if missing:
        with open(gitignore_path, "a", encoding="utf-8") as f:
            if existing and not existing.endswith("\n"):
                f.write("\n")
            for l in missing:
                f.write(l + "\n")
        print(f"Aggiunto a .gitignore: {', '.join(missing)}")
    else:
        print(".gitignore gia' a posto.")

    # ---- 3. Lancia la build ----
    print("\nLancio la build release (puo' richiedere qualche minuto)...\n")
    is_windows = os.name == "nt"
    gradlew = "gradlew.bat" if is_windows else "./gradlew"
    gradlew_path = os.path.join(android_dir, gradlew)

    if not os.path.isfile(gradlew_path):
        print(f"ERRORE: non trovo '{gradlew_path}'.")
        sys.exit(1)

    try:
        result = subprocess.run(
            [gradlew_path, "assembleRelease"],
            cwd=android_dir,
            shell=is_windows,
        )
    except Exception as e:
        print(f"Errore nell'eseguire gradlew: {e}")
        sys.exit(1)

    if result.returncode != 0:
        print("\nLa build e' fallita (BUILD FAILED). Controlla l'output sopra per l'errore.")
        sys.exit(1)

    # ---- 4. Verifica risultato ----
    release_dir = os.path.join(android_dir, "app", "build", "outputs", "apk", "release")
    signed_path = os.path.join(release_dir, "app-release.apk")
    unsigned_path = os.path.join(release_dir, "app-release-unsigned.apk")

    print("\n--- Risultato ---")
    if os.path.isfile(signed_path):
        print(f"OK: trovato APK firmato -> {signed_path}")
    elif os.path.isfile(unsigned_path):
        print(f"ATTENZIONE: trovato solo l'APK NON firmato -> {unsigned_path}")
        print("Il signingConfig potrebbe non essere collegato correttamente. Controlla keystore.properties e build.gradle.")
    else:
        print(f"Non trovo nessun .apk in {release_dir}. Controlla l'output della build sopra.")


if __name__ == "__main__":
    main()
