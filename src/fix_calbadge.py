#!/usr/bin/env python3
"""
Corregge l'errore di sintassi in App.jsx: nel componente CalBadge
c'e' un </div> di chiusura in eccesso, subito prima di `);` e `}`
che chiudono il componente. Questo causa il "RollupError: Unexpected '}'"
riportato da Vercel/Rollup durante la build.

Uso:
    python fix_calbadge.py /percorso/App.jsx
"""

import sys
import re


def fix_calbadge(content: str) -> tuple[str, int]:
    """
    Cerca il blocco finale di CalBadge:

        )}
        </div>
      );
    }

    e lo trasforma in:

        )}
      </div>
      );
    }

    rimuovendo il </div> in eccesso (quello senza apertura corrispondente)
    che precede `);` `}` alla fine del componente CalBadge.
    """
    pattern = re.compile(
        r"(\)\}\s*\n\s*)</div>(\s*\n\s*\)\}\s*\n\s*\)\s*;\s*\n\s*\}\s*\n)",
    )

    new_content, n = pattern.subn(r"\1\2", content, count=1)
    return new_content, n


def main():
    if len(sys.argv) != 2:
        print("Uso: python fix_calbadge.py /percorso/App.jsx")
        sys.exit(1)

    path = sys.argv[1]

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    new_content, n = fix_calbadge(content)

    if n == 0:
        print("Pattern non trovato: nessuna modifica effettuata.")
        sys.exit(1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"Corretto: rimosso 1 tag </div> in eccesso in {path}")


if __name__ == "__main__":
    main()
