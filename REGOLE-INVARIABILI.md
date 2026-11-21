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

## 2. Identificativo unico: VERSIONE#BUILD

L'identificativo è la stringa che si vede in Impostazioni, per esempio `6.325.1227#272`: cifra dell'anno, giorno dell'anno, ora e minuti (Roma), poi `#` e il numero della build su Actions.

- È lo **stesso** per tutto quello che parte da quel push: commit, build APK su Actions, release, CI, Secret scan, Vercel e app. Il numero del commit (`b2b5091`) e il numero di build da soli non si usano mai per indicare una build.
- Ogni commit comincia con l'identificativo: `6.325.1245#273 — descrizione`. Si calcola prima di committare con `tool/identificativo.py` (la versione dall'ora impostata sul commit, il `#` come prossimo numero di Build APK):
  `eval "$(python3 tool/identificativo.py)"` poi `GIT_COMMITTER_DATE="$DATA" git commit -m "$ID — descrizione"`.
- A fine lavoro si scrive solo l'identificativo, dopo aver controllato su Actions che il `#` sia quello vero della build.
- Un push che cambia solo file non di codice (`.md`, `tool/`) non cambia la versione, ma il `#` cresce: l'identificativo resta unico.
- **Tre processi separati** partono a ogni push, ognuno con il suo workflow ma con lo stesso identificativo: **Build APK** (`build-apk.yml`), **Build Windows** (`build-windows.yml`, `turni-windows.exe` allegato alla release dell'APK) e **Build Web** (`build-web.yml`, la web app che pubblica anche Vercel). CI (`ci.yml`) fa solo test e lint. Windows e Web prendono il `#` dalla Build APK dello stesso codice (`tool/identificativo.py --attuale`), come fa il sito. Un push senza modifiche al codice non ricompila Windows.
