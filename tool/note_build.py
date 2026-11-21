#!/usr/bin/env python3
"""Tiene note.json nel canale aggiornamenti: le novita' di ogni build (le ultime 40).

L'app lo legge per mostrare le novita' di TUTTE le build tra quella installata e quella
nuova, anche quelle saltate. Se il file non esiste ancora (--semina) parte dalle release
gia' pubblicate."""
import argparse
import json
import os
import re
import subprocess

TENUTE = 40


def carica(path):
    try:
        with open(path, encoding="utf-8") as f:
            dati = json.load(f)
        return dati if isinstance(dati, list) else []
    except (OSError, ValueError):
        return []


def pulisci_body(body):
    """Novita' di una release: senza marcatori e senza la riga \"Aggiornamento: ...\"."""
    testo = re.sub(r"<!--.*?-->", "", body or "", flags=re.S)
    righe = [r.rstrip() for r in testo.split("\n") if r.strip() and not r.strip().startswith("Aggiornamento:")]
    return "\n".join(righe)


def semina():
    voci = []
    try:
        tags = json.loads(subprocess.run(
            ["gh", "release", "list", "--limit", "20", "--json", "tagName"],
            capture_output=True, text=True, check=True).stdout)
    except Exception:
        return voci
    for t in tags:
        tag = t.get("tagName", "")
        if not tag or tag == "canale-aggiornamenti":
            continue
        try:
            body = json.loads(subprocess.run(
                ["gh", "release", "view", tag, "--json", "body"],
                capture_output=True, text=True, check=True).stdout).get("body", "")
        except Exception:
            continue
        m = re.search(r"<!--\s*app-build:\s*(\d+)\s*-->", body or "")
        if m:
            voci.append({"build": int(m.group(1)), "note": pulisci_body(body)})
    return voci


def aggiungi(voci, build, note):
    voci = [v for v in voci if int(v.get("build", 0)) != build]
    if note.strip():
        voci.append({"build": build, "note": note.strip()})
    voci.sort(key=lambda v: int(v["build"]))
    return voci[-TENUTE:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--build", type=int, required=True)
    ap.add_argument("--note-file", required=True)
    ap.add_argument("--semina", action="store_true")
    a = ap.parse_args()
    voci = carica(a.file)
    if not voci and a.semina:
        voci = semina()
    with open(a.note_file, encoding="utf-8") as f:
        note = f.read()
    voci = aggiungi(voci, a.build, note)
    with open(a.file, "w", encoding="utf-8") as f:
        json.dump(voci, f, ensure_ascii=False, indent=1)
    print(f"note.json: {len(voci)} build, ultima #{a.build}")


if __name__ == "__main__":
    main()
