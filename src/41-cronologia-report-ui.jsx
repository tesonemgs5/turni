// Pulsante «Cronologia modifiche» di un report: elenco delle versioni salvate prima di ogni modifica,
// con «Torna qui» (con conferma, per non sbagliare con un dito).
import { useState } from "react";
import { leggiCronologiaReport } from "./40-cronologia-report";

// onRipristina(cfg, riepilogo): applica la versione scelta al report.
export function CronologiaReport({ T, accent, reportId, onRipristina }) {
  const [aperto, setAperto] = useState(false);
  const [conferma, setConferma] = useState(null);
  const voci = leggiCronologiaReport(reportId).slice().reverse();
  const quando = (ts) => new Date(ts).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const piccolo = {
    background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
    padding: "6px 10px", fontWeight: 800, fontSize: 12, cursor: "pointer",
  };
  return (
    <>
      <button type="button" onClick={() => setAperto((a) => !a)} style={{
        display: "flex", alignItems: "center", gap: 6, background: "#ffffff", border: `1px solid ${T.border}`,
        borderRadius: 20, padding: "6px 12px", fontSize: 14, fontWeight: 700, color: "#0f172a", cursor: "pointer",
      }}>🕘 Cronologia{voci.length > 0 ? ` (${voci.length})` : ""}</button>
      {aperto && (
        <div style={{ flexBasis: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10 }}>
          {voci.length === 0 ? (
            <div style={{ fontSize: 12, color: T.sub }}>Nessuna modifica da annullare per questo report.</div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: T.sub, marginBottom: 8 }}>
                Ogni riga è il report com'era PRIMA di una modifica. «Torna qui» lo ripristina; la modifica annullata resta in cronologia.
              </div>
              {voci.map((v) => (
                <div key={v.id} style={{ padding: "6px 0", borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 700, wordBreak: "break-word" }}>
                    {quando(v.ts)} — prima di: {v.riepilogo || "modifica"}
                  </div>
                  {conferma === v.id ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button type="button" onClick={() => { setConferma(null); onRipristina(v.cfg, v.riepilogo); }} style={{ ...piccolo, background: accent, color: "#fff", border: "none" }}>Sì, ripristina</button>
                      <button type="button" onClick={() => setConferma(null)} style={piccolo}>Annulla</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConferma(v.id)} style={{ ...piccolo, marginTop: 6 }}>↩ Torna qui</button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
