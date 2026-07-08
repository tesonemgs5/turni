# mappa.md — indice App.jsx

File unico (ex app.jsx + font.jsx accorpato). Navigazione tramite marker `#region`/`#endregion` (fold in VS Code). Righe aggiornate al 2026-07-07.

| # | Righe | Sezione | Contenuto | Simboli chiave |
|---|-------|---------|-----------|-----------------|
| 0 | 3–40 | FONT & COLORI (ex font.jsx) | Palette, fasce orarie default, helper colore/orario | `PALETTE`, `FASCE_AUTOMATICHE_DEFAULT`, `COLORE_H24`, `getColorByTime`, `getColorLabel` |
| 1 | 42–51 | Imports + costanti | Import React/supabase, mesi/giorni | `MONTHS`, `DAYS`, `uid` |
| 2 | 53–77 | Cache localStorage | Salva/carica/pulisci cache locale (fallback offline) | `saveToLocalStorage`, `loadFromLocalStorage`, `clearLocalStorageCache` |
| 3 | 79–97 | Utility date/festivi | Calendario, calcolo Pasqua, festivi IT | `daysInMonth`, `firstDay`, `dkey`, `easter`, `italianHols` |
| 4 | 99–126 | Colore & tempo turni | Fine turno 6h15, durata, fascia diurno/notturno | `calcFine6h15`, `calcDurata`, `getShiftBand`, `isFestivo` |
| 5 | 128–141 | Template report + stato iniziale | Elenco tipi report, stato default store | `REPORT_TEMPLATES`, `INIT` |
| 6 | 143–221 | useState hooks | **Tutti** gli stati del componente `App` (calendario, modelli, rotazioni, report, colori, sync, modali) | — |
| 7 | 223–333 | useEffect init + load da Supabase | Login → carica calendari/eventi/modelli/rotazioni/impostazioni, sync colori/sortOrder | (dentro `useEffect(...,[userId])`) |
| 8 | 335–343 | useEffect online/offline | Listener rete per badge sync | `goOnline`, `goOffline` |
| 9 | 345–417 | Tema & colori derivati | Calcolo tema dark/light, oggetto `T` (colori UI), helper eventi giorno | `T`, `activeCal`, `accent`, `isRed`, `getEvts`, `allEvts`, `dots`, `saveSettings` |
| 10 | 397–417 | CRUD calendari | Crea/aggiorna/elimina calendario | `addCalendar`, `updateCalendar`, `deleteCalendar` |
| 11 | 419–575 | CRUD eventi | Salva/aggiorna/elimina evento turno, calcolo protrazioni | `saveEvt`, `updateEvt`, `delEvt`, `calcMinuti` |
| 12 | 577–817 | Sync Google Sheets + backup Supabase | Export/import Sheets, backup/restore su Supabase, stats admin | `saveToSheets`, `loadFromSheets`, `syncFromSheets`, `handleSave/Load`, `buildBackupPayload`, `handleExportSupabase`, `handleOpenImportSupabase`, `handleRestoreBackup`, `handleLogout` |
| 13 | 819–1100 | CRUD modelli + colori + rotazioni (logica) | Ordinamento modelli, colore custom, palette condivisa, CRUD rotazioni, applica rotazione al calendario | `sortedModelli`, `getFasciaModello`, `moveH24`, `ensureColoreRegistrato`, `saveModello`, `deleteModello`, `addColoreExtra`, `removeColoreExtra`, `replaceColoreEverywhere`, `saveRotazione`, `deleteRotazione`, `updateGrigliaRotazione`, `applyRotazione` |
| 14 | 1101–1231 | Report: helper di calcolo | Range date report, conteggio turni/indennità, CRUD report utente | `getReportRange`, `computeConteggioForReport`, `computeConteggio`, `computeIndennita`, `addReport`, `removeReport`, `renameReport`, `moveReport`, `getConteggioConfig`, `updateConteggioConfig` |
| 15 | 1233–1391 | Vista Calendario (JSX) | Header mese/anno, selettore calendari, griglia giorni con eventi | `calView` |
| 16 | 1392–1649 | Vista Report (JSX) | Lista report attivi, aggiungi report, picker intervallo/modelli | `reportView`, `renderReportCard` |
| 17 | 1650–2126 | Vista Modelli (JSX) | Tab Turni/Rotazioni/Colori, popup assegnazione e modifica colore, form modello/rotazione | `modelliView` |
| 18 | 2127–2550 | Vista Impostazioni (JSX) | Account, tema, fasce orarie, calendari, Sheets, Supabase, festivi locali | `settingsView`, `updateFascia` |
| 19 | 2551–2888 | Modale giorno (JSX) | Apertura giorno, lista/eventi, form nuovo/modifica evento, input orari e protrazioni | `dayModal` |
| 20 | 2889–3271 | Modale DB + render principale | Modale dati Supabase, nav bar, picker modello/rotazione, dialog applica rotazione, `return` finale di `App` | `dbModal`, `NAV_ITEMS`, fine funzione `App` |
| 21 | 3272–3340 | CalBadge | Badge calendario attivo: cambio colore, switch calendario | `CalBadge` |
| 22 | 3342–3429 | SmartTimeInput | Input orario HH:MM con digitazione progressiva (mobile-friendly) | `SmartTimeInput` |
| 23 | 3431–3818 | Sottocomponenti Report | Espansione fasce, config conteggio, indennità, ore/turno, straordinari, guadagni | `FasceExpand`, `ConteggioConfigCard`, `IndennitaConfig`, `OrePerTurnoView`, `StraordinariView`, `GuadagniView` |
| 24 | 3819–4053 | UI condivisa | Conversioni colore RGB/HSV/HEX, color picker, palette popup, riga colore, box impostazioni | `hexToRgbObj`, `rgbToHex`, `hsvToRgb`, `rgbToHsv`, `HexColorPicker`, `Pal`, `ColorRow`, `SecCollapsible`, `Sec` |
| 25 | 4055–4189 | Card & Form modello | Card modello (drag/touch riordino), form crea/modifica modello con palette colore libera | `ModelloCard`, `ModelForm`, `NB` (stile bottone nav) |
| 26 | 4191–4679 | Componenti rotazione | Card/form rotazione, selettore modello, griglia personalizzata, viste NL/RS classico e scalante, vista Domeniche 1/4 | `RotazioneCard`, `RotazioneForm`, `ModelloSelector`, `GrigliaRotazione`, `NLRSScalanteView`, `DomenicheView`, `NLRSView` |

## Note operative
- **Fonte unica colori**: `PALETTE` e `FASCE_AUTOMATICHE_DEFAULT` sono in SEZIONE 0; ogni colore mostrato in UI passa da `colByTime`/`colLabel` (wrapper in SEZIONE 9 attorno a `getColorByTime`/`getColorLabel`) usando `store.fasceAutomatiche` (personalizzabile in Impostazioni, SEZIONE 18).
- **Colore modello**: priorità `coloreCustom` → colore automatico per fascia (`colByTime`). Cambiare un colore di fascia/personalizzato con `replaceColoreEverywhere` (SEZIONE 13) lo propaga a tutti i modelli + registro colori.
- **Sync dati**: localStorage (cache offline, SEZIONE 2) → Supabase (fonte verità) → Google Sheets (archivio opzionale, SEZIONE 12) → backup manuale Supabase (SEZIONE 12/18).
- **Rotazioni**: 4 tipi in `rot.tipo` — `personalizzata` (griglia libera), `domeniche` (1 lavoro/4 riposo), `nlrs` (classico), `nlrs_scalante` (scalante venerdì→sabato). Logica in SEZIONE 13 (`applyRotazione`), viste in SEZIONE 26.
- **Eventi**: struttura `store.events[dateKey][calendarId] = [evento,...]`. Ogni evento può derivare da modello (`modelloId`), turno predefinito calendario (`shiftId`) o essere libero.

## Cronologia modifiche
- 2026-07-07: accorpati `app.jsx` + `font.jsx` in un unico `App.jsx` (SEZIONE 0 = ex font.jsx). Rimossi separatori decorativi `═` e uniti blocchi di commenti multi-riga in singole righe (nessuna modifica al codice eseguibile, verificato byte-per-byte). Righe totali: 4679 (da ~4760 originali).
