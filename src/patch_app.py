#!/usr/bin/env python3
"""
patch_app.py — Fix: saveToSheets dopo deleteCalendar e deleteModello

PATCH 1: deleteCalendar chiama saveToSheets dopo la cancellazione
PATCH 2: deleteModello chiama saveToSheets dopo la cancellazione

Uso:
  python patch_app.py            # cerca App.jsx nella cartella corrente
  python patch_app.py <percorso>
"""

import sys
import os

class PatchError(Exception):
    pass


def patch(src: str) -> str:
    errors = []

    # ══════════════════════════════════════════════════════════════
    # PATCH 1 — deleteCalendar: chiama saveToSheets dopo delete
    # ══════════════════════════════════════════════════════════════
    OLD_DEL_CAL = '''\
  async function deleteCalendar(cId){
    if(!userId) return;
    await supabase.from("calendars").delete().eq("id", cId).eq("user_id", userId);
  }'''

    NEW_DEL_CAL = '''\
  async function deleteCalendar(cId){
    if(!userId) return;
    await supabase.from("calendars").delete().eq("id", cId).eq("user_id", userId);
    const newCals = store.calendars.filter(c=>c.id!==cId);
    await saveToSheets(store.events, newCals);
  }'''

    if OLD_DEL_CAL not in src:
        if 'await saveToSheets(store.events, newCals)' in src:
            print("  ℹ️  PATCH 1: già applicata, salto.")
        else:
            errors.append("PATCH 1: funzione deleteCalendar non trovata")
    else:
        src = src.replace(OLD_DEL_CAL, NEW_DEL_CAL)

    # ══════════════════════════════════════════════════════════════
    # PATCH 2 — deleteModello: cerca la funzione e aggiunge saveToSheets
    # ══════════════════════════════════════════════════════════════
    OLD_DEL_MOD = '''\
  async function deleteModello(id){
    await supabase.from("modelli").delete().eq("id",id).eq("user_id",userId);
    setModelli(prev=>prev.filter(m=>m.id!==id));
  }'''

    NEW_DEL_MOD = '''\
  async function deleteModello(id){
    await supabase.from("modelli").delete().eq("id",id).eq("user_id",userId);
    const newModelli = modelli.filter(m=>m.id!==id);
    setModelli(newModelli);
    await saveToSheets(store.events, store.calendars, sheetsUrl, sheetsSecret, newModelli);
  }'''

    if OLD_DEL_MOD not in src:
        if 'newModelli' in src and 'deleteModello' in src:
            print("  ℹ️  PATCH 2: già applicata, salto.")
        else:
            errors.append("PATCH 2: funzione deleteModello non trovata — incolla il codice esatto della funzione")
    else:
        src = src.replace(OLD_DEL_MOD, NEW_DEL_MOD)

    # ══════════════════════════════════════════════════════════════
    if errors:
        raise PatchError("\n".join(f"  ❌ {e}" for e in errors))

    return src


def main():
    if len(sys.argv) >= 2:
        path = sys.argv[1]
    else:
        path = "App.jsx"

    if not os.path.exists(path):
        print(f"❌ File non trovato: {path}")
        sys.exit(1)

    print(f"📂 Leggo: {path}")
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    try:
        patched = patch(src)
    except PatchError as e:
        print("\n❌ Patch NON applicata — nessun file scritto. Errori trovati:\n")
        print(str(e))
        print("\n  Cerca 'deleteModello' in App.jsx e incollami il codice esatto.")
        sys.exit(1)

    out_path = path.replace("App.jsx", "App_updated.jsx")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(patched)

    print()
    print("✅ Patch applicate con successo!")
    print()
    print("  PATCH 1 ✓ — deleteCalendar aggiorna Sheets dopo cancellazione")
    print("  PATCH 2 ✓ — deleteModello aggiorna Sheets dopo cancellazione")
    print()
    print(f"📄 File salvato: {out_path}")


if __name__ == "__main__":
    main()
