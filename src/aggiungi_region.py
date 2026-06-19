import re

FILE = "App.jsx"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

# Mappa: testo da cercare (inizio sezione) -> testo #region da sostituire
REGIONS = [
    ("// SEZIONE 1: IMPORTS + COSTANTI", "// #region SEZIONE 1: IMPORTS + COSTANTI"),
    ("// SEZIONE 2: LOCALSTORAGE CACHE", "// #region SEZIONE 2: LOCALSTORAGE CACHE"),
    ("// SEZIONE 3: UTILITY FUNCTIONS",  "// #region SEZIONE 3: UTILITY FUNCTIONS"),
    ("// SEZIONE 4: COLOR & TIME FUNCTIONS", "// #region SEZIONE 4: COLOR & TIME FUNCTIONS"),
    ("// SEZIONE 5: REPORT TEMPLATES + INIT STATE", "// #region SEZIONE 5: REPORT TEMPLATES + INIT STATE"),
    ("// SEZIONE 6: USESTATE HOOKS",     "// #region SEZIONE 6: USESTATE HOOKS"),
    ("// SEZIONE 7: USEEFFECT INIT + LOAD DA SUPABASE", "// #region SEZIONE 7: USEEFFECT INIT + LOAD DA SUPABASE"),
    ("// SEZIONE 8: USEEFFECT OVERSCROLL + ONLINE/OFFLINE", "// #region SEZIONE 8: USEEFFECT OVERSCROLL + ONLINE/OFFLINE"),
    ("// SEZIONE 9: THEME & COLORS (dark mode, T object)", "// #region SEZIONE 9: THEME & COLORS"),
    ("// SEZIONE 10: CALENDAR VIEW (calView - grid calendario)", "// #region SEZIONE 10: CALENDAR VIEW"),
    ("// SEZIONE 11: REPORT VIEW (reportView - report e statistiche)", "// #region SEZIONE 11: REPORT VIEW"),
    ("// SEZIONE 12: MODELLI VIEW (modelliView - turni e rotazioni)", "// #region SEZIONE 12: MODELLI VIEW"),
    ("// SEZIONE 13: SETTINGS VIEW (settingsView - impostazioni account)", "// #region SEZIONE 13: SETTINGS VIEW"),
    ("// SEZIONE 14: DAY MODAL (dayModal - form nuovo evento)", "// #region SEZIONE 14: DAY MODAL"),
    ("// SEZIONE 15: DB MODAL + RENDER PRINCIPALE", "// #region SEZIONE 15: DB MODAL + RENDER PRINCIPALE"),
    ("// SEZIONE 16: COMPONENTS (CalBadge, SmartTimeInput, Pal, Sec)", "// #region SEZIONE 16: COMPONENTS"),
    ("// SEZIONE 17: REPORT SUBCOMPONENTS", "// #region SEZIONE 17: REPORT SUBCOMPONENTS"),
    ("// SEZIONE 18: MODELLO CARDS & FORMS", "// #region SEZIONE 18: MODELLO CARDS & FORMS"),
    ("// SEZIONE 19: ROTAZIONE COMPONENTS", "// #region SEZIONE 19: ROTAZIONE COMPONENTS"),
]

# Sostituisce i titoli sezione con #region
for old, new in REGIONS:
    content = content.replace(old, new)

# Aggiunge #endregion prima di ogni #region (tranne il primo)
# e alla fine del file
lines = content.split("\n")
result = []
for i, line in enumerate(lines):
    stripped = line.strip()
    # Se la riga è un #region (non il primo) aggiungi #endregion prima
    if stripped.startswith("// #region SEZIONE") and i > 0:
        result.append("")
        result.append("// #endregion")
        result.append("")
    result.append(line)

# Aggiungi #endregion finale
result.append("")
result.append("// #endregion")

final = "\n".join(result)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(final)

print("✅ Fatto! Apri App.jsx in VS Code e usa Ctrl+K, Ctrl+0 per chiudere tutto.")
