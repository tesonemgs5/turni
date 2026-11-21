import { useState } from "react"

// Simulatore del numero dei turni (report TURNAZIONE): parte dai numeri reali e si puo' cambiare con + e -.
// Non salva nulla: e' solo un calcolo.
export function percentualeSim(n, totale) {
  return totale > 0 ? Math.round((n / totale) * 100) : 0
}

export function SimulatoreTurni({ totale, primo, secondo, T, accent, onClose }) {
  const [tot, setTot] = useState(totale || 0)
  const [p, setP] = useState(primo || 0)
  const [s, setS] = useState(secondo || 0)
  const cambia = (set, v, d) => set(Math.max(0, v + d))
  // Il totale e' la somma automatica di 1° e 2° turno; il + e - sul totale resta per ritocchi a mano.
  const cambiaPrimo = d => { const n = Math.max(0, p + d); setP(n); setTot(n + s) }
  const cambiaSecondo = d => { const n = Math.max(0, s + d); setS(n); setTot(p + n) }

  const btn = {
    width: 40, height: 40, borderRadius: 10, border: "none", cursor: "pointer",
    background: accent, color: "#fff", fontSize: 22, fontWeight: 900, lineHeight: 1,
  }
  const riga = (etichetta, valore, cambiaFn, pct) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.s2, borderRadius: 10, padding: "8px 10px" }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{etichetta}</span>
      {pct !== undefined && (
        <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", background: accent + "33", borderRadius: 6, padding: "2px 7px" }}>{pct}%</span>
      )}
      <button style={btn} onClick={() => cambiaFn(-1)}>−</button>
      <span style={{ minWidth: 32, textAlign: "center", fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{valore}</span>
      <button style={btn} onClick={() => cambiaFn(1)}>+</button>
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: 16, width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>SIMULATORE TURNI</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#0f172a" }}>✕</button>
        </div>
        {riga("TURNI TOTALI", tot, d => cambia(setTot, tot, d))}
        {riga("1° TURNO", p, cambiaPrimo, percentualeSim(p, tot))}
        {riga("2° TURNO", s, cambiaSecondo, percentualeSim(s, tot))}
      </div>
    </div>
  )
}
