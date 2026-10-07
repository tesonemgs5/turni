#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
applica_tutto.py - fa TUTTO in automatico nel progetto Turni:
  1. crea/aggiorna .gitignore, .env.example, workflow GitHub, avviso aggiornamento
  2. modifica aggiorna_versione_e_build.py (pulizia APK, versionCode, cloud)
  3. modifica src/09-main.jsx (banner aggiornamento)
  4. toglie dal repo .env, release-builds, __pycache__, *.bak (restano sul PC)
  5. carica i 6 segreti su GitHub (con GitHub CLI "gh")
  6. commit + push

Uso: copia questo file nella cartella del progetto (accanto a package.json)
e lancia:   python applica_tutto.py
Prima di toccare qualcosa salva una copia in _backup_prima_applica/.
Si puo' rilanciare senza problemi: salta cio' che e' gia' fatto.
Opzioni: --si (non chiede conferme)  --senza-push  --senza-segreti
"""
import os, re, sys, shutil, subprocess, base64
from datetime import datetime

ARGS = set(sys.argv[1:])
SI = "--si" in ARGS

GITIGNORE = r'''node_modules/
dist/
android/app/build/
android/.gradle/
android/build/
android/local.properties
android/keystore.properties
android/release.jks
*.jks
*.keystore
release/
release-builds/
.idea/
*.iml
.env
.env.*
!.env.example
__pycache__/
*.pyc
*.bak
build-auto.log
.build-apk.lock
'''
ENV_EXAMPLE = r'''# Copia questo file in ".env" (che NON va committato) e inserisci i valori veri.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# La chiave Gemini NON va qui: va solo su Vercel come GEMINI_API_KEY
'''
WORKFLOW = r'''name: Build APK

on:
  push:
    branches: [master]
  workflow_dispatch:

concurrency:
  group: build-apk
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  apk:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21

      - name: Crea .env per la build (solo nel cloud)
        env:
          SUPA_URL: ${{ secrets.VITE_SUPABASE_URL }}
          SUPA_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: |
          printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' "$SUPA_URL" "$SUPA_KEY" > .env

      - name: Prepara keystore e firma
        env:
          KS_B64: ${{ secrets.KEYSTORE_BASE64 }}
          KS_PASS: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASS: ${{ secrets.KEY_PASSWORD }}
        run: |
          echo "$KS_B64" | base64 -d > "$GITHUB_WORKSPACE/android/release.jks"
          printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=%s\nkeyPassword=%s\n' \
            "$GITHUB_WORKSPACE/android/release.jks" "$KS_PASS" "$KEY_ALIAS" "$KEY_PASS" \
            > android/keystore.properties

      - run: npm ci

      - name: Build APK (stesso script che usi sul PC)
        run: |
          chmod +x android/gradlew
          python3 aggiorna_versione_e_build.py --auto

      - name: Pubblica su Releases (tiene le ultime 2)
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          APK=$(ls release-builds/*/*.apk | tail -1)
          VERSION=$(grep -oP 'versionName "\K[^"]+' android/app/build.gradle)
          TAG="v$VERSION"
          cp "$APK" turni.apk
          gh release delete "$TAG" --yes --cleanup-tag 2>/dev/null || true
          gh release create "$TAG" turni.apk \
            --target "$GITHUB_SHA" \
            --title "Turni $VERSION" \
            --notes "Build automatica dal commit ${GITHUB_SHA::7}" \
            --latest
          gh release list --limit 100 --json tagName,createdAt \
            --jq 'sort_by(.createdAt) | reverse | .[2:] | .[].tagName' \
          | while read -r OLD; do gh release delete "$OLD" --yes --cleanup-tag; done
'''
AVVISO = r'''import { useEffect, useState } from "react"

// Avviso "nuova versione disponibile" per l'APK. Controlla l'ultima release
// su GitHub; se e' piu' nuova di quella installata mostra un banner con il
// pulsante per scaricare l'APK. Non fa nulla su web/PWA/Electron.
const REPO = "tesonemgs5/turni"
const APK_URL = `https://github.com/${REPO}/releases/latest/download/turni.apk`
const INTERVALLO_MS = 30 * 60 * 1000

function inApk() {
  try {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform())
  } catch { return false }
}
function parti(v) { return String(v || "").replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0) }
function piuNuova(a, b) { // true se a > b
  const x = parti(a), y = parti(b)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

export default function AvvisoAggiornamento() {
  const [nuova, setNuova] = useState(null)

  useEffect(() => {
    if (!inApk()) return
    const corrente = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null
    if (!corrente) return

    async function controlla(forza) {
      try {
        const ultimo = Number(localStorage.getItem("turnipm_upd_check") || 0)
        if (!forza && Date.now() - ultimo < INTERVALLO_MS) return
        const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: "application/vnd.github+json" },
        })
        if (!r.ok) return
        const dati = await r.json()
        localStorage.setItem("turnipm_upd_check", String(Date.now()))
        const versione = String(dati.tag_name || "").replace(/^v/, "")
        if (!versione || !piuNuova(versione, corrente)) return
        if (localStorage.getItem("turnipm_upd_ignora") === versione) return
        setNuova(versione)
      } catch { /* offline: nessun avviso */ }
    }

    controlla(true)
    const onVis = () => { if (document.visibilityState === "visible") controlla(false) }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  if (!nuova) return null
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:"#1e293b",
      borderBottom:"1px solid #3b82f6",color:"#f1f5f9",fontSize:13,
      padding:"calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
      display:"flex",alignItems:"center",gap:10}}>
      <div style={{flex:1}}>🔔 Nuova versione disponibile: <b>{nuova}</b></div>
      <button onClick={() => { window.location.href = APK_URL }}
        style={{background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",
          padding:"8px 12px",fontWeight:800,fontSize:12}}>Scarica</button>
      <button onClick={() => { try { localStorage.setItem("turnipm_upd_ignora", nuova) } catch {} setNuova(null) }}
        style={{background:"none",border:"none",color:"#94a3b8",fontSize:12}}>Dopo</button>
    </div>
  )
}
'''

# Patch allo script di build: (descrizione, testo_da_cercare, testo_nuovo, segno_gia_applicato)
PATCH_BUILD = [
 ("modalita' --auto + pulizia vecchi APK",
  "def pausa_finale():\n    try:",
  r'''AUTO = ("--auto" in sys.argv) or os.environ.get("AUTO_BUILD") == "1"


def pulisci_vecchie_build(project_root, tieni=1):
    """
    Prima di una nuova build lascia solo le ultime `tieni` cartelle APK
    (default 1): a build finita ne restano 2 (la precedente + la nuova),
    cosi' se la nuova non parte c'e' sempre un APK di backup.
    Le cartelle si chiamano AAAAMMGG_HHMM_vX.Y.Z, quindi l'ordine
    alfabetico coincide con quello cronologico. Tocca SOLO cartelle
    con quel nome dentro release-builds.
    """
    base = os.path.join(project_root, "release-builds")
    if not os.path.isdir(base):
        return
    cartelle = sorted(
        d for d in os.listdir(base)
        if re.match(r"^\d{8}_\d{4}_v", d) and os.path.isdir(os.path.join(base, d))
    )
    da_cancellare = cartelle[:-tieni] if tieni > 0 else cartelle
    for d in da_cancellare:
        try:
            shutil.rmtree(os.path.join(base, d))
            print(f"Rimossa vecchia build: {d}")
        except Exception as e:
            print(f"ATTENZIONE: non riesco a rimuovere {d}: {e}")


def pausa_finale():
    if AUTO:
        return
    try:''',
  "def pulisci_vecchie_build"),
 ("chiamata pulizia prima della build",
  "    # 6. Build APK velocizzata",
  "    # 5b. Pulizia: tieni solo l'ultimo APK precedente (backup) prima di crearne uno nuovo\n    pulisci_vecchie_build(project_root, tieni=1)\n\n    # 6. Build APK velocizzata",
  "# 5b. Pulizia"),
 ("npm/npx compatibili anche col cloud (Linux)",
  "result = subprocess.run(comando, cwd=project_root, shell=is_windows)",
  "result = subprocess.run(comando, cwd=project_root, shell=True)",
  "cwd=project_root, shell=True"),
 ("versionCode calcolato dalla data del commit",
  "def bump_version_gradle(gradle_path, nuova_versione):",
  r'''def calcola_version_code(project_root):
    """
    versionCode = minuti trascorsi dal 1/1/2026 (UTC) alla data dell'ultimo
    commit. Cresce sempre ed e' IDENTICO su PC e su GitHub Actions: cosi'
    non serve piu' salvare nulla in build.gradle per "contare" le build.
    """
    from datetime import timezone
    ora = ultima_data_commit(project_root).astimezone(timezone.utc)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return int((ora - base).total_seconds() // 60)


def bump_version_gradle(gradle_path, nuova_versione, version_code=None):''',
  "def calcola_version_code"),
 ("versionCode: usa il valore calcolato",
  "    new_code = old_code + 1\n",
  "    new_code = max(old_code + 1, version_code or 0)\n",
  "max(old_code + 1"),
 ("chiamata a bump_version_gradle",
  "new_code = bump_version_gradle(app_gradle_path, nuova_versione)",
  "new_code = bump_version_gradle(app_gradle_path, nuova_versione, calcola_version_code(project_root))",
  "calcola_version_code(project_root))"),
]

PATCH_MAIN = [
 ("import del banner",
  "import { registerSW } from 'virtual:pwa-register'\n",
  "import { registerSW } from 'virtual:pwa-register'\nimport AvvisoAggiornamento from './12-avviso-aggiornamento.jsx'\n",
  "AvvisoAggiornamento from"),
 ("banner nella schermata principale",
  "return session ? <App session={session} /> : <Auth />",
  "return session ? <><AvvisoAggiornamento /><App session={session} /></> : <Auth />",
  "<AvvisoAggiornamento />"),
]

# ---------------------------------------------------------------- utilita'
def say(t=""): print(t, flush=True)
def ok(t): say("  [OK] " + t)
def skip(t): say("  [--] " + t)
def warn(t): say("  [!!] " + t)

def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)

def chiedi(domanda):
    if SI: return True
    return input(domanda + " (s/n): ").strip().lower() in ("s", "si", "y", "yes")

def leggi(path):
    with open(path, "r", encoding="utf-8", newline="") as f: raw = f.read()
    eol = "\r\n" if "\r\n" in raw else "\n"
    return raw.replace("\r\n", "\n"), eol

def scrivi(path, testo, eol="\n"):
    d = os.path.dirname(path)
    if d: os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f: f.write(testo.replace("\n", eol))

def backup(root, rel):
    src = os.path.join(root, rel)
    if os.path.isfile(src):
        dst = os.path.join(root, "_backup_prima_applica", rel)
        if not os.path.exists(dst):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)

def crea_file(root, rel, contenuto):
    p = os.path.join(root, rel)
    if os.path.isfile(p) and leggi(p)[0] == contenuto:
        skip(f"{rel} gia' aggiornato"); return
    backup(root, rel)
    scrivi(p, contenuto)
    ok(f"scritto {rel}")

def applica_patch(root, rel, patch):
    p = os.path.join(root, rel)
    testo, eol = leggi(p)
    backup(root, rel)
    cambiato = False
    for desc, cerca, nuovo, segno in patch:
        if segno in testo:
            skip(f"{rel}: {desc} (gia' fatto)"); continue
        if testo.count(cerca) != 1:
            warn(f"{rel}: NON trovo il punto per '{desc}' (file diverso dal previsto). Non lo tocco.")
            return False
        testo = testo.replace(cerca, nuovo, 1); cambiato = True
        ok(f"{rel}: {desc}")
    if cambiato: scrivi(p, testo, eol)
    return True

def leggi_properties(path):
    d = {}
    with open(path, "r", encoding="utf-8") as f:
        for riga in f:
            riga = riga.strip()
            if not riga or riga.startswith("#") or "=" not in riga: continue
            k, v = riga.split("=", 1)
            d[k.strip()] = re.sub(r"\\(.)", r"\1", v.strip())
    return d

def leggi_env(path):
    d = {}
    with open(path, "r", encoding="utf-8") as f:
        for riga in f:
            riga = riga.strip()
            if not riga or riga.startswith("#") or "=" not in riga: continue
            k, v = riga.split("=", 1)
            d[k.strip()] = v.strip().strip('"').strip("'")
    return d

# ---------------------------------------------------------------- passi
def trova_keystore(root, store_file):
    for base in (os.path.join(root, "android", "app"), os.path.join(root, "android"), root, ""):
        p = store_file if os.path.isabs(store_file) else os.path.join(base, store_file)
        if os.path.isfile(p): return p
    return None

def carica_segreti(root, slug):
    say("\n[5] Segreti GitHub")
    gh = shutil.which("gh")
    if not gh:
        warn("GitHub CLI ('gh') non installato.")
        say("      Installalo con:  winget install GitHub.cli")
        say("      poi:             gh auth login      (scegli GitHub.com > HTTPS > browser)")
        say("      poi rilancia questo script: salta quello gia' fatto.")
        return False
    if run([gh, "auth", "status"]).returncode != 0:
        warn("Non sei collegato a GitHub. Esegui:  gh auth login   e rilancia lo script.")
        return False
    kp = os.path.join(root, "android", "keystore.properties")
    envp = os.path.join(root, ".env")
    if not os.path.isfile(kp):
        warn("Manca android/keystore.properties (dati del keystore). Non posso caricare i segreti.")
        return False
    if not os.path.isfile(envp):
        warn("Manca il file .env (Supabase). Non posso caricare i segreti.")
        return False
    props, env = leggi_properties(kp), leggi_env(envp)
    ks = trova_keystore(root, props.get("storeFile", ""))
    if not ks:
        warn(f"Non trovo il file keystore indicato: {props.get('storeFile')}")
        return False
    with open(ks, "rb") as f: b64 = base64.b64encode(f.read()).decode("ascii")
    segreti = {
        "KEYSTORE_BASE64": b64,
        "KEYSTORE_PASSWORD": props.get("storePassword", ""),
        "KEY_ALIAS": props.get("keyAlias", ""),
        "KEY_PASSWORD": props.get("keyPassword", ""),
        "VITE_SUPABASE_URL": env.get("VITE_SUPABASE_URL", ""),
        "VITE_SUPABASE_ANON_KEY": env.get("VITE_SUPABASE_ANON_KEY", ""),
    }
    tutto = True
    for nome, valore in segreti.items():
        if not valore:
            warn(f"{nome}: valore vuoto, non caricato"); tutto = False; continue
        r = subprocess.run([gh, "secret", "set", nome, "-R", slug], input=valore,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode == 0: ok(f"{nome} caricato")
        else: warn(f"{nome}: errore -> {r.stderr.strip()[:150]}"); tutto = False
    return tutto

def main():
    root = os.getcwd()
    say("=" * 60); say("  APPLICA TUTTO - progetto Turni"); say("=" * 60)
    for need in ("package.json", "android", os.path.join("src", "09-main.jsx"), "aggiorna_versione_e_build.py"):
        if not os.path.exists(os.path.join(root, need)):
            say(f"\nERRORE: non trovo '{need}'. Metti questo file nella cartella del progetto e rilancia."); sys.exit(1)
    if run(["git", "rev-parse", "--is-inside-work-tree"], cwd=root).returncode != 0:
        say("\nERRORE: questa cartella non e' un repository git."); sys.exit(1)
    branch = run(["git", "branch", "--show-current"], cwd=root).stdout.strip() or "master"
    url = run(["git", "remote", "get-url", "origin"], cwd=root).stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/\s]+?)(?:\.git)?$", url)
    if not m:
        say(f"\nERRORE: remote 'origin' non riconosciuto come GitHub: {url}"); sys.exit(1)
    slug = m.group(1)
    say(f"\nRepo: {slug}   Branch: {branch}")
    say("\nFaro': file nuovi, modifiche a 2 file, repo ripulito, segreti, commit e push.")
    say("Copia di sicurezza dei file modificati in: _backup_prima_applica/")
    if not chiedi("\nProcedo?"): say("Annullato."); return

    say("\n[1] File nuovi")
    crea_file(root, ".env.example", ENV_EXAMPLE)
    crea_file(root, os.path.join(".github", "workflows", "build-apk.yml"),
              WORKFLOW.replace("branches: [master]", f"branches: [{branch}]"))
    crea_file(root, os.path.join("src", "12-avviso-aggiornamento.jsx"),
              AVVISO.replace("tesonemgs5/turni", slug))

    say("\n[2] .gitignore")
    gi = os.path.join(root, ".gitignore")
    vecchio, eol = (leggi(gi) if os.path.isfile(gi) else ("", "\n"))
    righe = vecchio.split("\n")
    nuove = [r for r in (GITIGNORE.split("\n") + ["_backup_prima_applica/"]) if r.strip() and r not in righe]
    if nuove:
        backup(root, ".gitignore")
        testo = vecchio.rstrip("\n") + ("\n" if vecchio.strip() else "") + "\n".join(nuove) + "\n"
        scrivi(gi, testo, eol); ok(f".gitignore: aggiunte {len(nuove)} righe")
    else: skip(".gitignore gia' completo")

    say("\n[3] Modifica script di build e main.jsx")
    a = applica_patch(root, "aggiorna_versione_e_build.py", PATCH_BUILD)
    b = applica_patch(root, os.path.join("src", "09-main.jsx"), PATCH_MAIN)
    if not (a and b):
        say("\nMi fermo: uno dei file non e' come previsto. Nulla e' stato committato.")
        say("Mandami il messaggio di errore qui sopra."); sys.exit(1)

    say("\n[4] Pulizia repo (i file restano sul PC)")
    tracciati = set(run(["git", "ls-files"], cwd=root).stdout.splitlines())
    for target in (".env", "vite.config.js.bak"):
        if target in tracciati:
            run(["git", "rm", "--cached", "-q", target], cwd=root); ok(f"{target} tolto dal repo")
        else: skip(f"{target} non era nel repo")
    for cart in ("release-builds", "__pycache__"):
        if any(t.startswith(cart + "/") for t in tracciati):
            run(["git", "rm", "-r", "--cached", "-q", cart], cwd=root); ok(f"{cart}/ tolta dal repo")
        else: skip(f"{cart}/ non era nel repo")
    hp = run(["git", "config", "--get", "core.hooksPath"], cwd=root).stdout.strip()
    if hp == ".githooks":
        run(["git", "config", "--unset", "core.hooksPath"], cwd=root); ok("disattivato il vecchio hook pre-push")

    add = [".gitignore", ".env.example", ".github", os.path.join("src", "12-avviso-aggiornamento.jsx"),
           os.path.join("src", "09-main.jsx"), "aggiorna_versione_e_build.py"]
    run(["git", "add", "--"] + add, cwd=root)
    if run(["git", "diff", "--cached", "--quiet"], cwd=root).returncode != 0:
        r = run(["git", "commit", "-q", "-m", "Build APK automatica su GitHub, avviso aggiornamento, pulizia repo"], cwd=root)
        if r.returncode == 0: ok("commit creato")
        else: warn("commit non riuscito: " + (r.stderr or r.stdout).strip()[:200]); sys.exit(1)
    else: skip("niente da committare")

    segreti_ok = True if "--senza-segreti" in ARGS else carica_segreti(root, slug)

    say("\n[6] Push")
    if "--senza-push" in ARGS: skip("push saltato (--senza-push)"); return
    if not segreti_ok:
        warn("Push NON fatto: senza i segreti la build nel cloud fallirebbe.")
        say("      Sistema quanto indicato sopra e rilancia: python applica_tutto.py"); return
    if not chiedi("Faccio il push ora?"): say("Ok, push non fatto. Lo farai tu con: git push"); return
    pr = run(["git", "pull", "--rebase", "--autostash", "-q"], cwd=root)
    if pr.returncode != 0:
        warn("git pull --rebase non riuscito: " + (pr.stderr or pr.stdout).strip()[:300]); return
    r = run(["git", "push"], cwd=root)
    if r.returncode == 0:
        ok("push fatto")
        say(f"\nFINE. Segui la build qui:  https://github.com/{slug}/actions")
        say(f"APK (tra 5-10 minuti):     https://github.com/{slug}/releases/latest/download/turni.apk")
    else: warn("push non riuscito: " + (r.stderr or r.stdout).strip()[:300])

if __name__ == "__main__":
    main()
