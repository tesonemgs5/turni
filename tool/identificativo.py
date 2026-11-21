#!/usr/bin/env python3
"""Identificativo del prossimo commit: VERSIONE#BUILD, la stessa stringa che si vede in Impostazioni.

  VERSIONE = cifra dell'anno . giorno dell'anno . ora e minuti (Roma), presa dalla data dell'ultimo
             commit che cambia il codice (stessa regola di vite.config.js);
  BUILD    = numero della prossima esecuzione di "Build APK" su GitHub Actions.

Uso (dopo git add):
    eval "$(python3 tool/identificativo.py)"
    GIT_COMMITTER_DATE="$DATA" git commit -m "$ID — descrizione"

Cosi' commit, Actions, Vercel e app mostrano lo stesso numero. Stampa due righe: ID='...' e DATA='...'.
Il token si legge da GH_TOKEN o dall'indirizzo di "origin"; senza token il BUILD resta "?"."""
import json
import os
import re
import subprocess
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

# Identico a PERCORSI_CODICE di vite.config.js e del workflow Build APK.
PERCORSI_CODICE = "src public index.html package.json package-lock.json vite.config.js capacitor.config.ts android api electron vercel.json".split()
ROMA = ZoneInfo("Europe/Rome")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout.strip()


def tocca_codice(file):
    return any(file == p or file.startswith(p + "/") for p in PERCORSI_CODICE)


def versione(quando):
    q = quando.astimezone(ROMA)
    giorno = q.timetuple().tm_yday
    return f"{q.year % 10}.{giorno}.{q.hour:02d}{q.minute:02d}"


def token():
    t = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if t:
        return t
    m = re.search(r"//(?:[^:@/]+:)?([^@/]+)@github\.com", git("remote", "get-url", "origin"))
    return m.group(1) if m else None


def prossimo_build():
    m = re.search(r"github\.com[:/]+([^/]+/[^/.]+)", git("remote", "get-url", "origin").split("@")[-1])
    repo = m.group(1) if m else "tesonemgs5/turni"
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/actions/workflows/build-apk.yml/runs?per_page=1")
    t = token()
    if t:
        req.add_header("Authorization", f"Bearer {t}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            runs = json.load(r).get("workflow_runs", [])
        return str(runs[0]["run_number"] + 1) if runs else "?"
    except Exception:
        return "?"


def main():
    ora = datetime.now(ROMA).replace(microsecond=0)
    in_stage = [f for f in git("diff", "--cached", "--name-only").splitlines() if f]
    if any(tocca_codice(f) for f in in_stage):
        data_codice = ora
    else:
        iso = git("log", "-1", "--format=%cI", "--", *PERCORSI_CODICE)
        data_codice = datetime.fromisoformat(iso) if iso else ora
    print(f"ID='{versione(data_codice)}#{prossimo_build()}'")
    print(f"DATA='{ora.isoformat()}'")


if __name__ == "__main__":
    main()
