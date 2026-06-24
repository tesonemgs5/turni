import re

INPUT_FILE = "App.jsx"
OUTPUT_FILE = "App_updated.jsx"

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    content = f.read()

# ── FIX 1: saveEvt ──────────────────────────────────────────────────────────
# Aggiunge straordinario_tipo e protrazione_ora_fine nell'insert del parent
OLD_1 = """      modello_id: form.modelloId||null,
      collega: null,
      auto: autoFiglio,
      parent_id: data.id,
  }).select().maybeSingle();"""

NEW_1 = """      modello_id: form.modelloId||null,
      collega: null,
      auto: autoFiglio,
      parent_id: data.id,
  }).select().maybeSingle();"""

# Il vero fix è nell'insert del PARENT (saveEvt) - cerchiamo il blocco insert principale
OLD_INSERT_PARENT_SAVE = """      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
    }).select().maybeSingle();"""

NEW_INSERT_PARENT_SAVE = """      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
      straordinario_tipo: form.straordinarioTipo||null,
      protrazione_ora_fine: form.protrazioneOraFine||null,
    }).select().maybeSingle();"""

# ── FIX 2: updateEvt ────────────────────────────────────────────────────────
OLD_UPDATE_PARENT = """      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
    }).eq("id", form.editId).eq("user_id", userId);"""

NEW_UPDATE_PARENT = """      note: (form.note||"").toUpperCase(),
      modello_id: form.modelloId||null,
      collega: (form.collega||"").toUpperCase(),
      auto: (form.auto||"").toUpperCase(),
      straordinario_tipo: form.straordinarioTipo||null,
      protrazione_ora_fine: form.protrazioneOraFine||null,
    }).eq("id", form.editId).eq("user_id", userId);"""

fixes = [
    ("INSERT parent (saveEvt)", OLD_INSERT_PARENT_SAVE, NEW_INSERT_PARENT_SAVE),
    ("UPDATE parent (updateEvt)", OLD_UPDATE_PARENT, NEW_UPDATE_PARENT),
]

errors = 0
for label, old, new in fixes:
    count = content.count(old)
    if count == 0:
        print(f"❌ NON TROVATO: {label}")
        errors += 1
    elif count > 1:
        print(f"⚠️  TROVATO {count} VOLTE (ambiguo): {label}")
        errors += 1
    else:
        content = content.replace(old, new)
        print(f"✓ OK: {label}")

if errors == 0:
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\n✅ File scritto: {OUTPUT_FILE}")
else:
    print(f"\n❌ {errors} errori — file NON scritto")
