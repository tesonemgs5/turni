# REGOLE INVARIABILI — non modificare senza ordine esplicito dell'utente

## 1. Identità del modello (collegamento evento ↔ modello)

Il report (primi/secondi turni, indennità, protrazioni) dipende dal modello dell'evento.
**Un evento non deve MAI perdere il collegamento al suo modello.**

L'identità di un modello è:

**NOME + TIPO DURATA (6h15 / 6h30 / H24 / personalizzato) + ORARIO DI INIZIO + ORARIO DI FINE**

- Stesso nome con orario diverso = modello diverso.
- H24 e personalizzato (anche senza orario) con lo stesso nome = modelli diversi.
- Cambia solo cambiando nome, tipo durata o orario del modello (riga in alto: titolo + orario + durata), o scegliendo "cambia modello" / "Libero".
- NON fanno parte dell'identità e non scollegano mai l'evento: ingresso/uscita effettivi, protrazioni, entrata/uscita effettiva, collega, auto, luogo, note, colore, categorie report.
- Per ritrovare il modello di un evento si usano gli orari **ufficiali** salvati nell'evento (`time_in`/`time_out`), mai quelli effettivi (`time_in_note`/`time_out_note`).
- Se il modello esiste ancora, il collegamento resta. Se è stato eliminato, si cerca per identità esatta; se non c'è un match unico l'evento resta senza modello e l'app mostra un avviso (non si sceglie mai "a intuito").

Codice: `src/31-identita-modello.js` (usato da `trovaModelloCorrispondente` in `src/06-Logica.jsx`).
Test che bloccano la regola: `tests/identita-modello.test.js`.
