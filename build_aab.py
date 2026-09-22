#!/usr/bin/env python3
"""
Build AAB dedicato per Google Play Store (senza generare APK).
"""

import os
import re
import sys
import shutil
import subprocess
from datetime import datetime

try:
    from zoneinfo import ZoneInfo
    ROMA = ZoneInfo("Europe/Rome")
except Exception:
    ROMA = None


def pausa_finale():
    try:
        input("\nPremi INVIO per chiudere...")
    except Exception:
        pass


def find_project_root():
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [here, os.path.join(here, "calendario")]
    for c in candidates:
        if os.path.isfile(os.path.join(c, "android", "app", "build.gradle")):
            return c
    return None


def ultima_data_commit(project_root):
    try:
        iso = subprocess.check_output(
            ["git", "log", "-1", "--format=%cI"], cwd=project_root, text=True
        ).strip()
        return datetime.fromisoformat(iso)
    except Exception:
        return datetime.now(ROMA) if ROMA else datetime.now()


def calcola_versione(project_root):
    ora = ultima_data_commit(project_root)
    if ROMA:
        try:
            ora = ora.astimezone(ROMA)
        except Exception:
            pass
    anno_cifra = str(ora.year)[-1]
    giorno_anno = ora.timetuple().tm_yday
    ora_minuti = ora.strftime("%H%M")
    return f"{anno_cifra}.{giorno_anno}.{ora_minuti}"


def run_npm_o_npx(project_root, comando, descrizione):
    is_windows = os.name == "nt"
    print(f"\nEseguo: {comando} ({descrizione})...\n")
    result = subprocess.run(comando, cwd=project_root, shell=is_windows)
    if result.returncode != 0:
        print(f"\nERRORE: '{comando}' e' fallito.")
        pausa_finale()
        sys.exit(1)


def bump_version_gradle(gradle_path, nuova_versione):
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
    content = content.replace(f"versionCode {old_code}", f"versionCode {new_code}", 1)
    content = content.replace(f'versionName "{old_name}"', f'versionName "{nuova_versione}"', 1)
    with open(gradle_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"build.gradle: versionCode {old_code} -> {new_code}, versionName {old_name} -> {nuova_versione}")
    return new_code


def main():
    project_root = find_project_root()
    if not project_root:
        print("ERRORE: non trovo 'android/app/build.gradle'.")
        pausa_finale()
        sys.exit(1)

    android_dir = os.path.join(project_root, "android")
    app_gradle_path = os.path.join(android_dir, "app", "build.gradle")
    
    run_npm_o_npx(project_root, "npm run build", "ricompilo il codice web in dist/")
    run_npm_o_npx(project_root, "npx cap copy android", "copio dist/ nelle risorse Android")

    nuova_versione = calcola_versione(project_root)
    new_code = bump_version_gradle(app_gradle_path, nuova_versione)

    is_windows = os.name == "nt"
    gradlew = "gradlew.bat" if is_windows else "./gradlew"
    gradlew_p = os.path.join(android_dir, gradlew)

    print(f"\nEseguo: {gradlew} bundleRelease --parallel (generazione AAB per Play Store)...\n")
    subprocess.run([gradlew_p, "bundleRelease", "--parallel"], cwd=android_dir, shell=is_windows)

    aab_src = os.path.join(android_dir, "app", "build", "outputs", "bundle", "release", "app-release.aab")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_dir = os.path.join(project_root, "release-builds", f"{timestamp}_v{nuova_versione}")
    os.makedirs(out_dir, exist_ok=True)

    if os.path.isfile(aab_src):
        dest = os.path.join(out_dir, "app-release.aab")
        shutil.copyfile(aab_src, dest)
        print(f"\n✅ File AAB (Play Store) salvato in:\n  - {dest}")
    else:
        print("\n❌ ERRORE: File AAB non trovato.")

    pausa_finale()

if __name__ == "__main__":
    main()
