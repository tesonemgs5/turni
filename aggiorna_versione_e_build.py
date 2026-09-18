#!/usr/bin/env python3
"""
Aggiorna il formato versione a  A.GGG.HHMM  (es. 6.261.1854)
in ENTRAMBI i posti:
  - vite.config.js       (app web/Electron)
  - android/app/build.gradle (app Android, APK/AAB)

poi genera la build Android firmata (AAB + APK) con quella versione.

Formato:
  A    = ultima cifra dell'anno (2026 -> 6)
  GGG  = giorno dell'anno, 1-366, SENZA zeri iniziali (18 settembre -> 261)
  HHMM = ora e minuti attaccati, CON zero iniziale se serve (8:05 -> 0805)

Eseguibile con doppio click: alla fine aspetta un tasto prima di
chiudersi, cosi' si legge l'esito anche se la finestra si apre da sola.

Cosa fa, in ordine:
1. Corregge la funzione calcolaVersioneBuild() in vite.config.js
   per usare il nuovo formato (fa una copia di sicurezza .bak la
   prima volta che la modifica).
2. Calcola la versione attuale con quel formato.
3. Aggiorna versionCode (+1) e versionName in android/app/build.gradle.
4. Lancia gradlew bundleRelease e assembleRelease.
5. Copia AAB e APK in <progetto>/release-builds/<timestamp>_v<versione>/
6. Segnala chiaramente se l'APK risulta firmato o no.
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
    """Cerca la cartella progetto partendo da dove si trova questo script."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [here, os.path.join(here, "calendario")]
    for c in candidates:
        if os.path.isfile(os.path.join(c, "android", "app", "build.gradle")):
            return c
    return None


def calcola_versione():
    ora = datetime.now(ROMA) if ROMA else datetime.now()
    anno_cifra = str(ora.year)[-1]              # es. 2026 -> "6"
    giorno_anno = ora.timetuple().tm_yday        # 1-366, senza zeri iniziali
    ora_minuti = ora.strftime("%H%M")            # con zero iniziale se serve
    return f"{anno_cifra}.{giorno_anno}.{ora_minuti}"


def aggiorna_vite_config(vite_path):
    """
    Sostituisce il corpo di calcolaVersioneBuild() con la nuova formula.
    Se la funzione ha gia' il nuovo formato, non tocca nulla.
    """
    with open(vite_path, "r", encoding="utf-8") as f:
        content = f.read()

    if "GGG" in content or "anno_cifra" in content or "tm_yday" in content:
        pass  # non applicabile a JS, controllo sotto è quello vero

    nuova_funzione = '''function calcolaVersioneBuild() {
  const ora = new Date();
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(ora).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const inizioAnno = new Date(Date.UTC(parseInt(parti.year, 10), 0, 1));
  const oraRoma = new Date(Date.UTC(
    parseInt(parti.year, 10), parseInt(parti.month, 10) - 1, parseInt(parti.day, 10)
  ));
  const giornoAnno = Math.floor((oraRoma - inizioAnno) / 86400000) + 1;
  const cifraAnno = parti.year.slice(-1);
  return `${cifraAnno}.${giornoAnno}.${parti.hour}${parti.minute}`;
}'''

    # Trova la funzione esistente (dal "function calcolaVersioneBuild()" alla
    # sua chiusura "}" corrispondente) e la sostituisce.
    match = re.search(r"function calcolaVersioneBuild\s*\(\)\s*\{", content)
    if not match:
        print("ATTENZIONE: non trovo 'function calcolaVersioneBuild()' in vite.config.js.")
        print("Nessuna modifica applicata a vite.config.js.")
        return False

    start = match.start()
    # bilanciamento parentesi per trovare la fine della funzione
    i = match.end() - 1  # posizione della prima '{'
    depth = 0
    while i < len(content):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                break
        i += 1
    end = i + 1

    vecchia_funzione = content[start:end]
    if vecchia_funzione.strip() == nuova_funzione.strip():
        print("vite.config.js: formato versione gia' aggiornato, nessuna modifica necessaria.")
        return True

    backup_path = vite_path + ".bak"
    if not os.path.isfile(backup_path):
        shutil.copyfile(vite_path, backup_path)
        print(f"Backup creato: {backup_path}")

    nuovo_content = content[:start] + nuova_funzione + content[end:]
    with open(vite_path, "w", encoding="utf-8") as f:
        f.write(nuovo_content)

    print("vite.config.js: formato versione aggiornato a A.GGG.HHMM.")
    return True


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
    content = content.replace(
        f'versionName "{old_name}"', f'versionName "{nuova_versione}"', 1
    )

    with open(gradle_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"build.gradle: versionCode {old_code} -> {new_code}, "
          f"versionName {old_name} -> {nuova_versione}")
    return new_code


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
    project_root = find_project_root()
    if not project_root:
        print("ERRORE: non trovo 'android/app/build.gradle'.")
        print("Metti questo script nella cartella del progetto (quella con dentro 'android') e rilancialo.")
        pausa_finale()
        sys.exit(1)

    android_dir = os.path.join(project_root, "android")
    app_gradle_path = os.path.join(android_dir, "app", "build.gradle")
    keystore_props_path = os.path.join(android_dir, "keystore.properties")
    vite_config_path = os.path.join(project_root, "vite.config.js")

    print(f"Progetto: {project_root}\n")

    if not os.path.isfile(keystore_props_path):
        print("ERRORE: non trovo 'android/keystore.properties'.")
        print("Va creato prima (con storeFile, storePassword, keyAlias, keyPassword).")
        pausa_finale()
        sys.exit(1)

    with open(app_gradle_path, "r", encoding="utf-8") as f:
        gradle_check = f.read()
    if "signingConfigs" not in gradle_check:
        print("ERRORE: 'android/app/build.gradle' non ha il blocco signingConfigs.")
        pausa_finale()
        sys.exit(1)

    # 1. Aggiorna vite.config.js (app web) al nuovo formato
    if os.path.isfile(vite_config_path):
        aggiorna_vite_config(vite_config_path)
    else:
        print("ATTENZIONE: vite.config.js non trovato, salto l'aggiornamento web.")

    # 2. Calcola la versione col nuovo formato
    nuova_versione = calcola_versione()
    print(f"\nNuova versione calcolata: {nuova_versione}\n")

    # 3. Aggiorna build.gradle
    new_code = bump_version_gradle(app_gradle_path, nuova_versione)

    # 4. Build AAB + APK
    run_gradle_task(android_dir, "bundleRelease")
    run_gradle_task(android_dir, "assembleRelease")

    # 5. Percorsi sorgente
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

    # 6. Copia in cartella di output
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_dir_name = f"{timestamp}_v{nuova_versione}"
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
    print(f"Versione: versionCode {new_code}, versionName {nuova_versione}")
    if copied:
        print("File salvati in:")
        for c in copied:
            print(f"  - {c}")
    else:
        print("Nessun file copiato: controlla gli errori sopra.")

    pausa_finale()


if __name__ == "__main__":
    main()
