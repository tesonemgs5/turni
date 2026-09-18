#!/usr/bin/env python3
"""
Aggiorna il formato versione a  A.GGG.HHMM  (es. 6.261.1854)
in ENTRAMBI i posti:
  - vite.config.js       (app web/Electron)
  - android/app/build.gradle (app Android, APK/AAB)

poi RICOSTRUISCE il contenuto web, lo RISINCRONIZZA su Android e infine
genera la build Android firmata (AAB + APK) con quella versione.

Eseguibile con doppio click: alla fine aspetta un tasto prima di
chiudersi, cosi' si legge l'esito anche se la finestra si apre da sola.

Cosa fa, in ordine:
1. Corregge la funzione calcolaVersioneBuild() in vite.config.js
   per usare il nuovo formato (fa una copia di sicurezza .bak la
   prima volta che la modifica).
2. Calcola la versione attuale con quel formato.
3. Esegue "npm run build": ricompila TUTTO il codice React (01-App.jsx,
   06-Logica.jsx, ecc.) in dist/, incluso il numero di versione che
   vedi in Impostazioni (__APP_VERSION__, calcolato al momento di
   QUESTA build, non di una build precedente).
   ── SENZA QUESTO PASSAGGIO — che nella versione precedente dello
   script mancava — la build Android impacchettava sempre il codice
   web VECCHIO: solo il numero di versione nativo Android (visibile
   nello store/nel package) veniva aggiornato, mentre l'app dentro
   restava quella dell'ultima volta che avevi lanciato "npm run build"
   + "npx cap sync android" a mano. Era questo a far sembrare l'APK
   "vecchio" anche con versionCode/versionName aggiornati. ──
4. Esegue "npx cap sync android": copia dist/ dentro
   android/app/src/main/assets/public (dove la WebView la legge
   davvero) e sincronizza la configurazione Capacitor/plugin nativi.
5. Aggiorna versionCode (+1) e versionName in android/app/build.gradle.
6. Ferma eventuali demoni Gradle rimasti bloccati da un tentativo
   precedente ("gradlew --stop"): un demone incastrato e' la causa
   piu' comune del TimeoutException a fine build su Windows.
7. Lancia gradlew bundleRelease e assembleRelease.
8. Copia AAB e APK in <progetto>/release-builds/<timestamp>_v<versione>/
9. Segnala chiaramente se l'APK risulta firmato o no.
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

    match = re.search(r"function calcolaVersioneBuild\s*\(\)\s*\{", content)
    if not match:
        print("ATTENZIONE: non trovo 'function calcolaVersioneBuild()' in vite.config.js.")
        print("Nessuna modifica applicata a vite.config.js.")
        return False

    start = match.start()
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


def run_npm_o_npx(project_root, comando, descrizione):
    """
    Esegue un comando npm/npx nella cartella del progetto. Su Windows serve
    shell=True perche' npm/npx sono script .cmd, non eseguibili diretti.
    """
    is_windows = os.name == "nt"
    print(f"\nEseguo: {comando} ({descrizione})...\n")
    result = subprocess.run(comando, cwd=project_root, shell=is_windows)
    if result.returncode != 0:
        print(f"\nERRORE: '{comando}' e' fallito. Controlla l'output sopra.")
        print("La build Android NON verra' avviata: rifarla ora produrrebbe")
        print("comunque un pacchetto con lo stesso contenuto web di prima.")
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
    content = content.replace(
        f'versionName "{old_name}"', f'versionName "{nuova_versione}"', 1
    )

    with open(gradle_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"build.gradle: versionCode {old_code} -> {new_code}, "
          f"versionName {old_name} -> {nuova_versione}")
    return new_code


def gradlew_path_per(android_dir):
    is_windows = os.name == "nt"
    gradlew = "gradlew.bat" if is_windows else "./gradlew"
    return os.path.join(android_dir, gradlew), is_windows


def ferma_demoni_gradle(android_dir):
    """
    Ferma eventuali demoni Gradle rimasti bloccati da un tentativo
    precedente. Un demone incastrato e' la causa piu' comune del
    TimeoutException "muto" a fine build osservato su Windows
    (tipicamente proprio mentre scrive il report dei problemi/warning).
    Se fallisce non e' grave: si prova comunque a proseguire con la build.
    """
    gradlew_p, is_windows = gradlew_path_per(android_dir)
    if not os.path.isfile(gradlew_p):
        return
    print("\nFermo eventuali demoni Gradle residui (gradlew --stop)...\n")
    subprocess.run([gradlew_p, "--stop"], cwd=android_dir, shell=is_windows)


def run_gradle_task(android_dir, task):
    gradlew_p, is_windows = gradlew_path_per(android_dir)

    if not os.path.isfile(gradlew_p):
        print(f"ERRORE: non trovo '{gradlew_p}'.")
        sys.exit(1)

    print(f"\nEseguo: {os.path.basename(gradlew_p)} {task} (puo' richiedere qualche minuto)...\n")
    result = subprocess.run([gradlew_p, task], cwd=android_dir, shell=is_windows)
    if result.returncode != 0:
        print(f"\nERRORE: '{task}' e' fallito (BUILD FAILED). Controlla l'output sopra.")
        print("Se l'errore e' un TimeoutException senza messaggio, prova a rilanciare")
        print("questo script: il passaggio 'gradlew --stop' qui sopra ferma i demoni")
        print("incastrati, ma se il PC era gia' molto carico puo' servire un secondo giro.")
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
    env_path = os.path.join(project_root, ".env")

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

    if not os.path.isfile(env_path):
        print("ATTENZIONE: non trovo '.env' nella cartella del progetto.")
        print("Se contiene VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, 'npm run build'")
        print("potrebbe produrre un'app che non riesce a collegarsi a Supabase.")
        print("(Proseguo comunque: magari le variabili sono impostate diversamente.)\n")

    # 1. Aggiorna vite.config.js (app web) al nuovo formato, PRIMA di buildare
    if os.path.isfile(vite_config_path):
        aggiorna_vite_config(vite_config_path)
    else:
        print("ATTENZIONE: vite.config.js non trovato, salto l'aggiornamento web.")

    # 2. Ricompila il codice React/web: e' QUESTO che genera il numero di
    #    versione che l'app mostra in Impostazioni, e tutto il resto del
    #    codice aggiornato (01-App.jsx, 06-Logica.jsx, ecc.).
    run_npm_o_npx(project_root, "npm run build", "ricompilo il codice web in dist/")

    # 3. Sincronizza il risultato dentro il progetto Android: senza questo
    #    passaggio, android/app/src/main/assets/public resta quello
    #    dell'ultima sincronizzazione manuale, e la build Android
    #    impacchetterebbe di nuovo il contenuto vecchio.
    run_npm_o_npx(project_root, "npx cap sync android", "sincronizzo dist/ dentro il progetto Android")

    # 4. Calcola la versione col nuovo formato (per il numero mostrato
    #    nel gradle/versionName; quello embedded nel bundle web e' stato
    #    gia' calcolato un istante fa da "npm run build" qui sopra, con
    #    lo stesso orologio: coincidono a meno di qualche secondo).
    nuova_versione = calcola_versione()
    print(f"\nNuova versione calcolata: {nuova_versione}\n")

    # 5. Aggiorna build.gradle
    new_code = bump_version_gradle(app_gradle_path, nuova_versione)

    # 6. Ferma eventuali demoni Gradle incastrati da un tentativo precedente
    ferma_demoni_gradle(android_dir)

    # 7. Build AAB + APK
    run_gradle_task(android_dir, "bundleRelease")
    run_gradle_task(android_dir, "assembleRelease")

    # 8. Percorsi sorgente
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

    # 9. Copia in cartella di output
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
    print("Questa build include il codice web ricompilato ORA (npm run build")
    print("+ npx cap sync android eseguiti sopra), non una copia precedente.")
    if copied:
        print("File salvati in:")
        for c in copied:
            print(f"  - {c}")
    else:
        print("Nessun file copiato: controlla gli errori sopra.")

    pausa_finale()


if __name__ == "__main__":
    main()
