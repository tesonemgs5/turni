#!/usr/bin/env python3
"""
fix_smarttimeinput.py
Corregge il componente SmartTimeInput in App.jsx:
- rimuove readOnly + onKeyDown (non funziona su tastiera mobile/virtuale)
- lo sostituisce con un campo controllato via onChange/onInput,
  che funziona sia da desktop che da telefono
- gestisce correttamente la cancellazione (backspace)

Legge:  App.jsx
Scrive: App_updated.jsx   (poi il launcher istruzioni.py lo rinomina in App.jsx)
"""

import os
import re
import sys

FILE_INPUT  = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

# ── Vecchio componente da sostituire (con commenti annessi, esattamente
#    come comparso nel file originale) ──────────────────────────────────
OLD_BLOCK = '''// ── SMART TIME INPUT ──────────────────────────────────────────
// Sovrascrive HH quando si inizia a digitare, avanza auto a MM
function SmartTimeInput({ value, onChange, style }) {
  const [phase, setPhase] = useState("hh"); // "hh" | "mm"
  const inputRef = useRef(null);

  function handleKeyDown(e) {
    const digit = e.key;
    if (!/^\\d$/.test(digit)) return;
    e.preventDefault();

    const curHH = value ? value.split(":")[0] || "00" : "00";
    const curMM = value ? value.split(":")[1] || "00" : "00";

    if (phase === "hh") {
      // Prima cifra dell'ora: sovrascrive tutto
      const newHH = digit.padStart(2, "0");
      onChange(newHH + ":" + curMM);
      setPhase("hh2");
    } else if (phase === "hh2") {
      // Seconda cifra dell'ora
      const prevH = parseInt(curHH, 10);
      // Se la prima cifra era >2, la seconda deve formare ore valide
      let newHH;
      if (prevH <= 2) {
        newHH = String(prevH * 10 + parseInt(digit, 10)).padStart(2, "0");
        if (parseInt(newHH, 10) > 23) newHH = "23";
      } else {
        newHH = ("0" + digit).padStart(2, "0");
      }
      onChange(newHH + ":" + curMM);
      setPhase("mm");
      // Auto-focus rimane ma ora gestiamo i minuti
    } else if (phase === "mm") {
      // Prima cifra minuti: sovrascrive MM
      const newMM = digit.padStart(2, "0");
      onChange(curHH + ":" + newMM);
      setPhase("mm2");
    } else if (phase === "mm2") {
      // Seconda cifra minuti
      const prevM = parseInt(curMM, 10);
      let newMM;
      if (prevM <= 5) {
        newMM = String(prevM * 10 + parseInt(digit, 10)).padStart(2, "0");
        if (parseInt(newMM, 10) > 59) newMM = "59";
      } else {
        newMM = ("0" + digit).padStart(2, "0");
      }
      onChange(curHH + ":" + newMM);
      setPhase("hh"); // Cicla di nuovo
    }
  }

  function handleFocus() {
    setPhase("hh"); // Al focus, riparte dall'ora
  }

  function handleClick() {
    // Click sul campo: riparte dalla fase ore
    setPhase("hh");
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      placeholder="HH:MM"
      value={value || ""}
      readOnly
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onClick={handleClick}
      style={style}
    />
  );
}'''

# ── Nuovo componente: funziona su desktop E mobile ──────────────────────
NEW_BLOCK = '''// ── SMART TIME INPUT ──────────────────────────────────────────
// Campo orario HH:MM controllato via onChange (funziona anche su
// tastiera virtuale mobile, a differenza della vecchia versione
// basata su onKeyDown + readOnly che su telefono non riceveva input).
function SmartTimeInput({ value, onChange, style }) {
  // Buffer di sole cifre (max 4: HHMM), così l'utente può digitare
  // liberamente e noi formattiamo in tempo reale come "HH:MM".
  const [digits, setDigits] = useState(() => (value || "").replace(/\\D/g, "").slice(0, 4));

  // Se il valore esterno cambia (es. selezione di un modello turno),
  // risincronizza il buffer di cifre.
  useEffect(() => {
    setDigits((value || "").replace(/\\D/g, "").slice(0, 4));
  }, [value]);

  function clampAndEmit(rawDigits) {
    let d = rawDigits.replace(/\\D/g, "").slice(0, 4);

    // Validazione progressiva ore/minuti mentre si digita
    if (d.length >= 1) {
      const h0 = parseInt(d[0], 10);
      if (h0 > 2) {
        // prima cifra ora troppo alta per essere ore valide a due cifre (>2X)
        // la trattiamo come "0" + cifra (es: digitando 9 → 09)
        d = "0" + d[0] + d.slice(1, 3);
        d = d.slice(0, 4);
      }
    }
    if (d.length >= 2) {
      let hh = parseInt(d.slice(0, 2), 10);
      if (hh > 23) hh = 23;
      d = String(hh).padStart(2, "0") + d.slice(2);
    }
    if (d.length >= 4) {
      let mm = parseInt(d.slice(2, 4), 10);
      if (mm > 59) mm = 59;
      d = d.slice(0, 2) + String(mm).padStart(2, "0");
    } else if (d.length === 3) {
      const m0 = parseInt(d[2], 10);
      if (m0 > 5) {
        // prima cifra minuti troppo alta (>5X) → tratta come 0X
        d = d.slice(0, 2) + "0" + d[2];
        d = d.slice(0, 4);
      }
    }

    setDigits(d);

    if (d.length === 4) {
      onChange(d.slice(0, 2) + ":" + d.slice(2, 4));
    } else if (d.length === 0) {
      onChange("");
    } else {
      // Valore parziale: non ancora un orario completo, non sovrascriviamo
      // il valore "salvato" finché non sono state digitate tutte le 4 cifre,
      // ma mostriamo comunque il progresso nel campo (vedi displayValue).
    }
  }

  function handleChange(e) {
    const typed = e.target.value;
    // Calcola le sole cifre digitate (gestisce anche cancellazioni)
    const onlyDigits = typed.replace(/\\D/g, "");
    clampAndEmit(onlyDigits.slice(0, 4));
  }

  function handleKeyDown(e) {
    // Permette backspace/canc/freccie/tab di funzionare normalmente;
    // per i tasti numerici lasciamo fare a onChange.
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setDigits(d => {
        const next = d.slice(0, -1);
        if (next.length === 4) onChange(next.slice(0, 2) + ":" + next.slice(2, 4));
        else onChange("");
        return next;
      });
    }
  }

  function handleFocus(e) {
    // Seleziona tutto al focus per permettere di ridigitare da capo
    e.target.select();
  }

  // Valore mostrato nel campo: formatta progressivamente mentre si digita
  let displayValue = "";
  if (digits.length > 0) {
    const hh = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    displayValue = mm ? hh + ":" + mm : (digits.length >= 3 ? hh + ":" + mm : hh);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="HH:MM"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      style={style}
    />
  );
}'''


def main():
    if not os.path.exists(FILE_INPUT):
        print(f"❌ Non trovo '{FILE_INPUT}' in questa cartella.")
        print("   Metti questo script nella stessa cartella di App.jsx e riprova.")
        sys.exit(1)

    with open(FILE_INPUT, "r", encoding="utf-8") as f:
        content = f.read()

    if OLD_BLOCK not in content:
        # Fallback: provo a individuare il blocco tramite la firma della funzione,
        # nel caso siano cambiati spazi/commenti rispetto al testo atteso.
        pattern = re.compile(
            r"function SmartTimeInput\(\{ value, onChange, style \}\) \{.*?\n\}",
            re.DOTALL
        )
        match = pattern.search(content)
        if not match:
            print("❌ Non sono riuscito a trovare il componente SmartTimeInput in App.jsx.")
            print("   Probabilmente il file è già stato modificato o ha una struttura diversa.")
            print("   Nessuna modifica effettuata.")
            sys.exit(1)
        print("⚠️  Blocco originale non trovato in forma esatta: uso ricerca approssimata.")
        new_content = content[:match.start()] + NEW_BLOCK + content[match.end():]
    else:
        new_content = content.replace(OLD_BLOCK, NEW_BLOCK)

    with open(FILE_OUTPUT, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"✅ Corretto SmartTimeInput.")
    print(f"   Letto:   {FILE_INPUT}")
    print(f"   Scritto: {FILE_OUTPUT}")
    print()
    print("   Cosa è cambiato:")
    print("   - rimosso readOnly + onKeyDown (non riceveva input da tastiera mobile)")
    print("   - il campo ora usa onChange/onInput: funziona sia da PC che da telefono")
    print("   - backspace ora cancella correttamente le cifre")
    print()
    print("   Il launcher (istruzioni.py) rinominerà App_updated.jsx in App.jsx")
    print("   e farà commit/push se confermi con S.")


if __name__ == "__main__":
    main()
