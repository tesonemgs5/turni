#!/usr/bin/env python3
"""
TROVA ERRORE SINTASSI - find_syntax_error.py
Analizza App.jsx carattere per carattere e trova il punto esatto dove
si squilibrano parentesi (), graffe {} o quadre [], ignorando quelle
dentro stringhe, commenti e template literal (`...`).

Non è un parser JS completo, ma per un errore di tipo
"Unexpected )" o "Unexpected }" individua quasi sempre il punto
esatto in cui il conteggio va in negativo o non si richiude più,
risalendo riga per riga.

Va eseguito dalla cartella src (dove si trova App.jsx).
Uso: python find_syntax_error.py
"""

import os
import sys

FILE_INPUT = "App.jsx"

def main():
    if not os.path.exists(FILE_INPUT):
        print(f"❌ ERRORE: {FILE_INPUT} non trovato in questa cartella!")
        sys.exit(1)

    with open(FILE_INPUT, "r", encoding="utf-8") as f:
        text = f.read()

    stack = []  # pila di (carattere, riga, colonna)
    pairs = {')': '(', '}': '{', ']': '['}
    openers = {'(': ')', '{': '}', '[': ']'}

    line = 1
    col = 0
    i = 0
    n = len(text)

    in_line_comment = False
    in_block_comment = False
    in_string = None  # None, "'", '"', '`'
    errors = []

    while i < n:
        ch = text[i]

        if ch == '\n':
            line += 1
            col = 0
            in_line_comment = False
            i += 1
            continue
        col += 1

        # Fine commento a blocco
        if in_block_comment:
            if ch == '*' and i+1 < n and text[i+1] == '/':
                in_block_comment = False
                i += 2
                col += 1
                continue
            i += 1
            continue

        if in_line_comment:
            i += 1
            continue

        # Dentro una stringa/template literal
        if in_string is not None:
            if ch == '\\':
                i += 2
                col += 1
                continue
            if ch == in_string:
                in_string = None
            i += 1
            continue

        # Inizio commenti
        if ch == '/' and i+1 < n and text[i+1] == '/':
            in_line_comment = True
            i += 2
            col += 1
            continue
        if ch == '/' and i+1 < n and text[i+1] == '*':
            in_block_comment = True
            i += 2
            col += 1
            continue

        # Inizio stringhe
        if ch in ("'", '"', '`'):
            in_string = ch
            i += 1
            continue

        # Parentesi/graffe/quadre
        if ch in openers:
            stack.append((ch, line, col))
        elif ch in pairs:
            if not stack:
                errors.append(
                    f"Riga {line}, colonna {col}: trovata '{ch}' di chiusura "
                    f"SENZA alcuna apertura corrispondente sullo stack."
                )
            else:
                top_ch, top_line, top_col = stack[-1]
                if openers[top_ch] != ch:
                    errors.append(
                        f"Riga {line}, colonna {col}: trovata '{ch}' ma l'ultima "
                        f"apertura non chiusa era '{top_ch}' alla riga {top_line}, "
                        f"colonna {top_col} (mi aspettavo '{openers[top_ch]}')."
                    )
                    # continuiamo comunque facendo pop per provare a recuperare
                    stack.pop()
                else:
                    stack.pop()

        i += 1

    print("=" * 70)
    print(" ANALISI BILANCIAMENTO PARENTESI / GRAFFE / QUADRE")
    print("=" * 70)

    if errors:
        print(f"\n⚠️  Trovate {len(errors)} anomalie (mostro le prime 10):\n")
        for e in errors[:10]:
            print(" - " + e)
    else:
        print("\n✓ Nessuna anomalia di chiusura immediata rilevata durante la scansione.")

    if stack:
        print(f"\n❌ Alla fine del file restano {len(stack)} aperture MAI chiuse:")
        print("   (queste sono le candidate più probabili per l'errore "
              "'Unexpected )' o simili che vedi in Vercel)\n")
        for ch, l, c in stack[-15:]:
            simbolo = openers[ch]
            print(f"   '{ch}' aperta alla riga {l}, colonna {c} (manca '{simbolo}' di chiusura)")
        print()
        print("   👉 Vai a queste righe nel tuo editor: con il cursore vicino alla")
        print("      parentesi/graffa indicata, VS Code di solito evidenzia in")
        print("      automatico la coppia corrispondente (o l'assenza di una coppia).")
    else:
        print("\n✓ Tutte le aperture risultano chiuse correttamente entro fine file.")

    if not errors and not stack:
        print("\n🤔 Il bilanciamento di ()/{}/[]risulta OK. Controllo anche i tag JSX...")

    # ═══════════════════════════════════════════════════════════
    # CONTROLLO 2: bilanciamento tag JSX (<div>...</div>, <span/>, ecc.)
    # Approccio semplice con regex: NON sostituisce un parser JSX vero,
    # ma su tag HTML/JSX standard (div, span, button, input...) individua
    # bene i casi di tag apertura/chiusura non bilanciati.
    # ═══════════════════════════════════════════════════════════
    import re
    tag_pattern = re.compile(r'<(/?)([A-Za-z][A-Za-z0-9.]*)([^>]*?)(/?)>')

    jsx_stack = []
    jsx_errors = []
    text_lines = text.split('\n')

    # Ricostruiamo line/col per ogni match scansionando l'intero testo
    line_starts = [0]
    for idx, c in enumerate(text):
        if c == '\n':
            line_starts.append(idx+1)

    def pos_to_line(pos):
        lo, hi = 0, len(line_starts)-1
        while lo < hi:
            mid = (lo+hi+1)//2
            if line_starts[mid] <= pos:
                lo = mid
            else:
                hi = mid-1
        return lo+1

    for m in tag_pattern.finditer(text):
        is_close = m.group(1) == '/'
        tag_name = m.group(2)
        self_closing = m.group(4) == '/'
        attrs = m.group(3)
        ln = pos_to_line(m.start())

        if self_closing:
            continue  # <Tag .../> non apre nulla da chiudere

        if not is_close:
            jsx_stack.append((tag_name, ln))
        else:
            if not jsx_stack:
                jsx_errors.append(f"Riga {ln}: tag di chiusura </{tag_name}> SENZA apertura corrispondente.")
                continue
            top_tag, top_ln = jsx_stack[-1]
            if top_tag != tag_name:
                # Cerca piu' in profondita' nello stack (capita con tag innestati scritti male)
                found = False
                for k in range(len(jsx_stack)-1, -1, -1):
                    if jsx_stack[k][0] == tag_name:
                        mismatched = jsx_stack[k+1:]
                        if mismatched:
                            jsx_errors.append(
                                f"Riga {ln}: chiudo </{tag_name}> ma ci sono tag apparentemente "
                                f"non chiusi prima: " + ", ".join(f"<{t}> (riga {l})" for t,l in mismatched)
                            )
                        jsx_stack = jsx_stack[:k]
                        found = True
                        break
                if not found:
                    jsx_errors.append(f"Riga {ln}: chiudo </{tag_name}> ma l'ultimo tag aperto era <{top_tag}> (riga {top_ln}).")
            else:
                jsx_stack.pop()

    print()
    print("=" * 70)
    print(" ANALISI BILANCIAMENTO TAG JSX (div, span, button, ecc.)")
    print("=" * 70)
    if jsx_errors:
        print(f"\n⚠️  Trovate {len(jsx_errors)} anomalie nei tag (mostro le prime 10):\n")
        for e in jsx_errors[:10]:
            print(" - " + e)
    else:
        print("\n✓ Nessuna anomalia di tag rilevata durante la scansione lineare.")
    if jsx_stack:
        print(f"\n❌ Alla fine restano {len(jsx_stack)} tag MAI chiusi:")
        for t, l in jsx_stack[-15:]:
            print(f"   <{t}> aperto alla riga {l}, mai chiuso con </{t}>")

if __name__ == "__main__":
    main()
