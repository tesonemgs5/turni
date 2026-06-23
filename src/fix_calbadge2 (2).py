import sys
import shutil
from pathlib import Path

def fix(path: str):
    p = Path(path)
    if not p.exists():
        print(f"Errore: file non trovato → {path}")
        sys.exit(1)

    src = p.read_text(encoding="utf-8")

    # Il </div> extra ha 3 spazi (anomalo) - tutti gli altri ne hanno 2, 4 o 8
    OLD = (
        "        </div>\n"
        "    )}\n"
        "        </div>\n"
        "   </div>\n"      # 3 spazi - QUESTO è quello extra
        "  );\n"
        "}\n"
        "\n"
        "// ── SMART TIME INPUT"
    )
    NEW = (
        "        </div>\n"
        "    )}\n"
        "        </div>\n"
        "  );\n"
        "}\n"
        "\n"
        "// ── SMART TIME INPUT"
    )

    if OLD not in src:
        print("❌ Pattern non trovato.")
        idx = src.find("// ── SMART TIME INPUT")
        if idx > 0:
            print("Contesto attuale nel file:")
            print(repr(src[idx-350:idx+60]))
        sys.exit(1)

    out = src.replace(OLD, NEW, 1)

    bak = p.with_suffix(".jsx.bak")
    shutil.copy(p, bak)
    print(f"Backup → {bak}")
    p.write_text(out, encoding="utf-8")
    print("✅ Rimosso </div> extra (3 spazi) in CalBadge")
    print(f"File aggiornato: {p}")
    print("Ora esegui: npm run build")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python fix_calbadge2.py src/App.jsx")
        sys.exit(1)
    fix(sys.argv[1])
