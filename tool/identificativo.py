#!/usr/bin/env python3
"""Identificativo VERSIONE#BUILD, la stessa stringa che si vede in Impostazioni.

  VERSIONE = cifra dell'anno . giorno dell'anno . ora e minuti (Roma), presa dalla data dell'ultimo
             commit che cambia il codice (stessa regola di vite.config.js);
  BUILD    = numero della Build APK su GitHub Actions.

Due modi:
  1) prima di un commit (dopo git add):
         eval "$(python3 tool/identificativo.py)"
         GIT_COMMITTER_DATE="$DATA" git commit -m "$ID — descrizione"
     BUILD = prossimo numero di Build APK. Stampa ID='...' e DATA='...'.
  2) nei workflow (Build Windows, Build Web): --attuale
         python tool/identificativo.py --attuale >> "$GITHUB_OUTPUT"
     BUILD = numero della Build APK che compila lo STESSO codice (come fa vite.config.js per il sito).
     Stampa version=..., build=..., id=...

Il token si legge da GH_TOKEN o dall'indirizzo di "origin"; senza token il BUILD resta vuoto o "?"."""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

# Identico a PERCORSI_CODICE di vite.config.js e del workflow Build APK.
PERCORSI_CODICE = "src public index.html package.json package-lock.json vite.config.js capacitor.config.ts android api electron vercel.json".split()


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout.strip()


def tocca_codice(file):
    return any(file == p or file.startswith(p + "/") for p in PERCORSI_CODICE)


def _ultima_domenica(anno, mese):
    d = datetime(anno, mese, 31 if mese in (3, 10) else 30, 1, tzinfo=timezone.utc)
    return d - timedelta(days=(d.weekday() + 1) % 7)


def a_roma(quando):
    """Ora di Roma. Se il sistema non ha il database dei fusi (Windows) usa la regola europea dell'ora legale."""
    try:
        from zoneinfo import ZoneInfo
        return quando.astimezone(ZoneInfo("Europe/Rome"))
    except Exception:
        u = quando.astimezone(timezone.utc)
        legale = _ultima_domenica(u.year, 3) <= u < _ultima_domenica(u.year, 10)
        return u.astimezone(timezone(timedelta(hours=2 if legale else 1)))


def versione(quando):
    q = a_roma(quando)
    return f"{q.year % 10}.{q.timetuple().tm_yday}.{q.hour:02d}{q.minute:02d}"


def token():
    t = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if t:
        return t
    m = re.search(r"//(?:[^:@/]+:)?([^@/]+)@github\.com", git("remote", "get-url", "origin"))
    return m.group(1) if m else None


def repo():
    r = os.environ.get("GITHUB_REPOSITORY")
    if r:
        return r
    m = re.search(r"github\.com[:/]+([^/]+/[^/.]+)", git("remote", "get-url", "origin").split("@")[-1])
    return m.group(1) if m else "tesonemgs5/turni"


def api(percorso):
    req = urllib.request.Request("https://api.github.com/repos/" + repo() + percorso)
    t = token()
    if t:
        req.add_header("Authorization", f"Bearer {t}")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def prossimo_build():
    try:
        runs = api("/actions/workflows/build-apk.yml/runs?per_page=1").get("workflow_runs", [])
        return str(runs[0]["run_number"] + 1) if runs else "?"
    except Exception:
        return "?"


def build_del_codice():
    """Numero della Build APK dell'ultimo commit di codice (stessa scelta di vite.config.js)."""
    sha = git("log", "-1", "--format=%H", "--", *PERCORSI_CODICE) or git("rev-parse", "HEAD")
    for tentativo in range(8):
        try:
            runs = api(f"/actions/workflows/build-apk.yml/runs?head_sha={sha}&per_page=20").get("workflow_runs", [])
            buone = [r["run_number"] for r in runs if r.get("conclusion") not in ("failure", "cancelled")]
            tutte = [r["run_number"] for r in runs]
            scelte = buone or tutte
            if scelte:
                return str(max(scelte))
        except Exception:
            pass
        time.sleep(15)  # la Build APK del push puo' non essere ancora comparsa
    return ""


def modo_attuale():
    iso = git("log", "-1", "--format=%cI", "--", *PERCORSI_CODICE) or git("log", "-1", "--format=%cI")
    v = versione(datetime.fromisoformat(iso))
    b = build_del_codice()
    print(f"version={v}")
    print(f"build={b}")
    print(f"id={v}#{b}")
    return 0 if b else 1


def modo_commit():
    ora = a_roma(datetime.now(timezone.utc)).replace(microsecond=0)
    in_stage = [f for f in git("diff", "--cached", "--name-only").splitlines() if f]
    if any(tocca_codice(f) for f in in_stage):
        data_codice = ora
    else:
        iso = git("log", "-1", "--format=%cI", "--", *PERCORSI_CODICE)
        data_codice = datetime.fromisoformat(iso) if iso else ora
    print(f"ID='{versione(data_codice)}#{prossimo_build()}'")
    print(f"DATA='{ora.isoformat()}'")
    return 0


if __name__ == "__main__":
    sys.exit(modo_attuale() if "--attuale" in sys.argv else modo_commit())
