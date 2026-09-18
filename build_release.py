#!/usr/bin/env python3
"""
Aggiorna la versione dell'app, genera la build release firmata
(sia AAB che APK) e salva le copie in una cartella di output
con nome e data, cosi' non si mischiano con le build precedenti.

Cosa fa, in ordine:
1. Legge android/app/build.gradle, incrementa versionCode di 1
   e chiede (o accetta da riga di comando) il nuovo versionName.
2. Lancia:
      ./gradlew bundleRelease   -> genera l'AAB (per Google Play)
      ./gradlew assembleRelease -> genera l'APK (da installare a mano)
3. Copia i due file in:
      <progetto>/release-builds/AAAAMMGG_HHMM_vX.Y/app-release.aab
      <progetto>/release-builds/AAAAMMGG_HHMM_vX.Y/app-release.apk
4. Controlla che l'APK non sia "unsigned" (cioe' che la firma abbia funzionato).

Richiede che android/keystore.properties esista gia' e che
android/app/build.gradle abbia gia' il blocco signingConfigs
(vedi le modifiche fatte in precedenza).

Uso:
    python build_release.py
    python build_release.py --version 1.1        (salta la domanda sul versionName)
    python build_release.py --progetto "C:\\Users\\franc\\Desktop\\calendario\\calendario"
"""

import os
import re
import sys
import shutil
import argparse
import subprocess
from datetime import datetime


def find_project_root(start_path):
    candidates = [start_path, os.path.join(start_path, "calendario")]
    for c in candidates:
        if os.path.isfile(os.path.join(c, "android", "app", "build.gradle")):
            return c
    return None


def bump_version(gradle_path, new_version_name=None):
    with open(gradle_path, "r", encoding="utf-8") as f:
        content = f.read()

    match_code = re.search(r"versionCode\s+(\d+)", content)
    match_name = re.search(r'versionName\s+"([^"]+)"', content)

    if not match_code or not match_name:
        print("ERRORE: non trovo 'versionCode' o 'versionName' in build.gradle.")
        sys.exit(1)

    old_code = int(match_code.group(1))
    old_name = match_name.group(1)
    new_code = old_code + 1

    if new_version_name is None:
        new_version_name = input(
            f"Nuovo versionName (attuale: {old_name}) [invio per lasciare uguale]: "
        ).strip()
        if not new_version_name:
            new_version_name = old_name

    content = content.replace(f"versionCode {old_code}", f"versionCode {new_code}", 1)
    content = content.replace(
        f'versionName "{old_name}"', f'versionName "{new_version_name}"', 1
    )

    with open(gradle_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Versione aggiornata: versionCode {old_code} -> {new_code}, "
          f"versionName {old_name} -> {new_version_name}")
    return new_code, new_version_name


def run_gradle_task(android_dir, task):
    is_windows = os.name == "nt"
    gradlew = "gradlew.bat" if is_windows else "./gradlew"
    gradlew_path = os.path.join(android_dir, gradlew)

    if not os.path.isfile(gradlew_path):
        print(f"ERRORE: non trovo '{gradlew_path}'.")
        sys.exit(1)

    print(f"\nEseguo: {gradlew} {task} (puo' richiedere qualche minuto)...\n")
    result = subprocess.run([gradlew_path, task], cwd=android_dir, shell=is_windows)
    if result.returncode != 0:
        print(f"\nERRORE: '{task}' e' fallito (BUILD FAILED). Controlla l'output sopra.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--progetto", default=os.getcwd(), help="Percorso della cartella del progetto")
    parser.add_argument("--version", default=None, help="Nuovo versionName, es. 1.1")
    args = parser.parse_args()

    project_root = find_project_root(args.progetto)
    if not project_root:
        print("ERRORE: non trovo 'android/app/build.gradle' partendo da:", args.progetto)
        sys.exit(1)

    android_dir = os.path.join(project_root, "android")
    app_gradle_path = os.path.join(android_dir, "app", "build.gradle")
    keystore_props_path = os.path.join(android_dir, "keystore.properties")

    print(f"Progetto: {project_root}\n")

    if not os.path.isfile(keystore_props_path):
        print("ERRORE: non trovo 'android/keystore.properties'.")
        print("Va creato prima (con storeFile, storePassword, keyAlias, keyPassword).")
        sys.exit(1)

    with open(app_gradle_path, "r", encoding="utf-8") as f:
        gradle_check = f.read()
    if "signingConfigs" not in gradle_check:
        print("ERRORE: 'android/app/build.gradle' non ha il blocco signingConfigs.")
        print("Va aggiornato prima di continuare (vedi versione fornita in precedenza).")
        sys.exit(1)

    # 1. Aggiorna versione
    new_code, new_name = bump_version(app_gradle_path, args.version)

    # 2. Build AAB + APK
    run_gradle_task(android_dir, "bundleRelease")
    run_gradle_task(android_dir, "assembleRelease")

    # 3. Percorsi sorgente
    aab_src = os.path.join(android_dir, "app", "build", "outputs", "bundle", "release", "app-release.aab")
    apk_src = os.path.join(android_dir, "app", "build", "outputs", "apk", "release", "app-release.apk")
    apk_unsigned_src = os.path.join(android_dir, "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk")

    if not os.path.isfile(aab_src):
        print(f"ATTENZIONE: non trovo l'AAB atteso in {aab_src}")
    if not os.path.isfile(apk_src):
        if os.path.isfile(apk_unsigned_src):
            print("\nATTENZIONE: l'APK generato NON e' firmato (app-release-unsigned.apk).")
            print("Controlla keystore.properties e il blocco signingConfigs in build.gradle.")
        else:
            print(f"ATTENZIONE: non trovo nessun APK in {os.path.dirname(apk_src)}")

    # 4. Copia in cartella di output con data e versione
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_dir_name = f"{timestamp}_v{new_name}"
    out_dir = os.path.join(project_root, "release-builds", out_dir_name)
    os.makedirs(out_dir, exist_ok=True)

    copied = []
    if os.path.isfile(aab_src):
        dest = os.path.join(out_dir, "app-release.aab")
        shutil.copyfile(aab_src, dest)
        copied.append(dest)
    if os.path.isfile(apk_src):
        dest = os.path.join(out_dir, "app-release.apk")
        shutil.copyfile(apk_src, dest)
        copied.append(dest)

    print("\n--- Fatto ---")
    print(f"Versione: versionCode {new_code}, versionName {new_name}")
    if copied:
        print("File salvati in:")
        for c in copied:
            print(f"  - {c}")
    else:
        print("Nessun file copiato: controlla gli errori sopra.")


if __name__ == "__main__":
    main()
