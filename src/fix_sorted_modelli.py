import sys
import shutil
from pathlib import Path

def fix(path: str):
    p = Path(path)
    if not p.exists():
        print(f"Errore: file non trovato → {path}")
        sys.exit(1)

    src = p.read_text(encoding="utf-8")

    # Parentesi graffa extra dopo il blocco sort di sortedModelli
    # (quella con 6 spazi di rientro prima di return)
    OLD = (
        "      return (a.sortOrder||0)-(b.sortOrder||0);\n"
        "    });\n"
        "  }\n"
        "\n"
        "  // Restituisce la fascia oraria"
    )
    NEW = (
        "      return (a.sortOrder||0)-(b.sortOrder||0);\n"
        "    });\n"
        "\n"
        "  // Restituisce la fascia oraria"
    )

    if OLD not in src:
        # Prova con 4 spazi (per sicurezza)
        OLD = (
            "    return (a.sortOrder||0)-(b.sortOrder||0);\n"
            "    });\n"
            "  }\n"
            "\n"
            "  // Restituisce la fascia oraria"
        )
        NEW = (
            "    return (a.sortOrder||0)-(b.sortOrder||0);\n"
            "    });\n"
            "\n"
            "  // Restituisce la fascia oraria"
        )

    if OLD not in src:
        print("❌ Pattern non trovato nel file. Controlla manualmente riga ~2669.")
        sys.exit(1)

    n = src.count(OLD)
    if n > 1:
        print(f"⚠️  Pattern trovato {n} volte — verrà corretto solo il primo.")

    out = src.replace(OLD, NEW, 1)

    bak = p.with_suffix(".jsx.bak")
    shutil.copy(p, bak)
    print(f"Backup → {bak}")

    p.write_text(out, encoding="utf-8")
    print(f"✅ Corretto: rimossa la '}}' extra in sortedModelli")
    print(f"File aggiornato: {p}")
    print("Ora esegui: npm run build")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python fix_sorted_modelli.py src/App.jsx")
        sys.exit(1)
    fix(sys.argv[1])
