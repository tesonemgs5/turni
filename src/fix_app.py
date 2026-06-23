#!/usr/bin/env python3
"""
Uso: python fix_app.py src/App.jsx

Aggiunge il tag </div> mancante alla fine del componente CalBadge:
manca la chiusura del <div> contenitore esterno
(<div style={{display:"flex",alignItems:"center",gap:4}}>).
"""

import sys

OLD = """      </div>
    )}
    </div>
  );
}

// ── SMART TIME INPUT"""

NEW = """      </div>
    )}
    </div>
    </div>
  );
}

// ── SMART TIME INPUT"""


def main():
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if OLD not in content:
        print("Pattern non trovato.")
        sys.exit(1)

    content = content.replace(OLD, NEW, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

    print("Fatto: aggiunto </div> mancante in CalBadge.")


if __name__ == "__main__":
    main()
