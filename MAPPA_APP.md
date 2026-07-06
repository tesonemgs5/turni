# mappa.md — Indice delle region di `app.jsx`

Ogni sezione è delimitata da `// #region SEZIONE N: ...` / `// #endregion`.
Usa la ricerca "SEZIONE N" nell'editor per saltare direttamente al blocco.

| # | Nome sezione | Contenuto |
|---|---|---|
| 1 | IMPORTS + COSTANTI | import React/supabase/font, costanti MONTHS/DAYS, `uid()` |
| 2 | LOCALSTORAGE CACHE | `saveToLocalStorage`, `loadFromLocalStorage`, `clearLocalStorageCache` |
| 3 | UTILITY FUNCTIONS | date/festivi: `daysInMonth`, `firstDay`, `dkey`, `easter`, `italianHols` |
| 4 | COLOR & TIME FUNCTIONS | `calcFine6h15`, `calcDurata`, `getShiftBand`, `isFestivo` (nota: `getColorByTime`/`getColorLabel` vivono in `font.jsx` e accettano ora le fasce personalizzate) |
| 5 | REPORT TEMPLATES + INIT STATE | `REPORT_TEMPLATES`, stato iniziale `INIT` (ora include `fasceAutomatiche`), inizio `export default function App` |
| 6 | USESTATE HOOKS | tutti gli `useState`/`useRef` del componente `App` |
| 7 | USEEFFECT INIT + LOAD DA SUPABASE | caricamento cache locale, fetch da Supabase (calendari, eventi, settings, modelli, colori, rotazioni), **sync automatica dei colori custom già esistenti nella tabella `colori`** |
| 8 | USEEFFECT OVERSCROLL + ONLINE/OFFLINE | listener online/offline |
| 9 | THEME & COLORS | calcolo tema chiaro/scuro, `T` (palette tema), `accent`, helper `colByTime`/`colLabel` (wrapper che passano `store.fasceAutomatiche`), `getEvts`, `allEvts`, `dots`, `saveSettings` |
| 10 | CRUD CALENDARI | `addCalendar`, `updateCalendar`, `deleteCalendar` |
| 11 | CRUD EVENTI | `saveEvt`, `updateEvt`, `delEvt`, `calcMinuti` |
| 12 | SYNC GOOGLE SHEETS + SUPABASE BACKUP | `saveToSheets`, `loadFromSheets`, `syncFromSheets`, handler UI di sync, backup/restore Supabase, `handleLogout` |
| 13 | CRUD MODELLI + COLORI | `sortedModelli`, `getFasciaModello`, `moveH24`, **`ensureColoreRegistrato` (FIX: registra subito il colore custom di un modello in tabella `colori`)**, `saveModello`, `deleteModello`, `addColoreExtra`, `removeColoreExtra`, **`replaceColoreEverywhere` (FIX: cambia un colore hex ovunque sia usato — modelli, registro colori, fasce automatiche)**, CRUD rotazioni, `applyRotazione` |
| 14 | REPORT HELPERS | `getReportRange`, `computeConteggioForReport`, `computeConteggio`, `computeIndennita`, gestione report attivi (`addReport`/`removeReport`/`renameReport`/`moveReport`), config conteggio |
| 15 | CALENDAR VIEW | vista calendario mensile (`calView`) |
| 16 | REPORT VIEW | vista Report (`reportView`), picker intervallo, picker filtro modelli per report |
| 17 | MODELLI VIEW | vista Modelli con tab Turni/Rotazioni/**Colori** — **FIX principale qui**: fasce automatiche ora lette da `store.fasceAutomatiche`, popup assegnazione colore con nuovo tasto 🎨 per aprire `showEditFasciaColor` |
| 18 | SETTINGS VIEW | vista Impostazioni — **nuova sezione "FASCE ORARIE AUTOMATICHE"** (nome/orario/colore editabili con palette condivisa), account, tema, calendari, Google Sheets, Supabase, festivi locali |
| 19 | DAY MODAL | modale del singolo giorno (creazione/modifica evento) |
| 20 | DB MODAL + RENDER PRINCIPALE | modale dati Supabase, render principale `App`, tutti i modali globali (ModelForm, RotazionePicker, ModelloPicker, ApplyRotDialog) |
| 21 | CAL BADGE | componente `CalBadge` (badge nome+colore calendario in Modelli) |
| 22 | SMART TIME INPUT | componente `SmartTimeInput` (input orario HH:MM touch-friendly) |
| 23 | REPORT SUBCOMPONENTS | `FasceExpand`, `ConteggioConfigCard`, `IndennitaConfig`, `OrePerTurnoView`, `StraordinariView`, `GuadagniView` |
| 24 | SHARED UI COMPONENTS | `Pal` (color picker), `ColorRow`, `SecCollapsible`, `Sec` |
| 25 | MODELLO CARD & FORM | `ModelloCard`, **`ModelForm` (FIX: colore libero tramite `PALETTE` condivisa invece di lista fissa `PALETTE_M`, con nota esplicativa nel form)** |
| 26 | ROTAZIONE COMPONENTS | `RotazioneCard`, `RotazioneForm`, `ModelloSelector`, `GrigliaRotazione`, `NLRSScalanteView`, `DomenicheView`, `NLRSView` |

---

## Cosa è cambiato in questa versione

### 1. Fix: colore di un modello sempre riassegnabile e sempre visibile in Colori
- **Prima**: se creavi un modello con un colore custom, quel colore non veniva salvato nel registro `colori` finché non ricaricavi l'app (o mai, se il flusso non passava da lì). Inoltre nel form del modello la palette colori era una lista fissa (`PALETTE_M`) diversa da quella usata altrove.
- **Ora**:
  - `ModelForm` usa la stessa `PALETTE` condivisa di tutta l'app (Impostazioni, tab Colori, ecc.).
  - Ogni volta che si salva un modello con un `coloreCustom`, `ensureColoreRegistrato()` lo inserisce subito nella tabella `colori` (se non già presente) — compare istantaneamente nella tab **Modelli → Colori**.
  - Da lì puoi vedere quanti modelli usano quel colore e assegnarlo/rimuoverlo da altri modelli con un tap, come già accadeva per i colori aggiunti manualmente.
  - Nuova funzione `replaceColoreEverywhere(oldHex, newHex)`: permette di **cambiare l'hex di un colore già in uso** (sia esso un colore personalizzato sia uno dei colori automatici di fascia) e propaga il cambio a tutti i modelli che lo usano, al registro colori, e alle fasce automatiche se coincide con una di esse. Accessibile tramite il tasto 🎨 nell'header del popup "assegna colore" in Modelli → Colori.

### 2. Nuova sezione: Fasce orarie automatiche personalizzabili
- In **Impostazioni → Fasce orarie automatiche** ora puoi rinominare, cambiare orario (dalle/alle) e colore di ciascuna delle 4 fasce (Mattina, Pomeriggio, 3° Turno, Notte) usate per colorare automaticamente i modelli in base all'orario di inizio.
- Sono salvate in `user_settings.fasce_automatiche` (nuova colonna JSON da aggiungere lato Supabase, vedi sotto).
- `font.jsx` espone ora `FASCE_AUTOMATICHE_DEFAULT` come fallback e le funzioni `getColorByTime(tIn, fasce)` / `getColorLabel(tIn, fasce)` accettano le fasce personalizzate come secondo parametro opzionale (retro-compatibili: se omesso, usano i default).
- Un pulsante "↩ Ripristina fasce predefinite" riporta ai valori originali.

## Migrazione database richiesta
Aggiungere alla tabella `user_settings` la colonna:
```sql
alter table user_settings add column if not exists fasce_automatiche jsonb;
```
Se assente, l'app usa automaticamente `FASCE_AUTOMATICHE_DEFAULT` come fallback (nessun crash).

La tabella `colori` non necessita modifiche: era già presente e usata; ora viene semplicemente scritta in un punto in più (alla creazione/modifica di un modello con colore custom).
