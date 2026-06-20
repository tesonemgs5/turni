# Mappa App.jsx — Calendario Turni

> Incolla questo file a inizio conversazione. Dimmi solo qual è il problema,
> indico io quali righe/sezioni mi servi mandare — non serve incollare le 3300 righe intere.

## Stack
- Frontend: React (Vite), file principale `App.jsx`
- Backend: Supabase (Postgres + Auth + RLS)
- Tabelle DB: `calendars`, `events`, `user_settings`, `usage_stats`
- Altri file rilevanti: `auth.jsx`, `supabase.js`, `main.jsx`, `vite.config.js`

## Indice sezioni App.jsx (da #region)

| # | Sezione | Righe (circa) |
|---|---------|----------------|
| 1 | IMPORTS + COSTANTI | 4–24 |
| 2 | LOCALSTORAGE CACHE | 26–47 |
| 3 | UTILITY FUNCTIONS | 49–71 |
| 4 | COLOR & TIME FUNCTIONS | 73–122 |
| 5 | REPORT TEMPLATES + INIT STATE | 124–140 |
| 6 | USESTATE HOOKS | 142–211 |
| 7 | USEEFFECT INIT + LOAD DA SUPABASE | 213–313 |
| 8 | USEEFFECT OVERSCROLL + ONLINE/OFFLINE | 315–326 |
| 9 | THEME & COLORS | 328–989 |
| 10 | CALENDAR VIEW | 991–1139 |
| 11 | REPORT VIEW | 1141–1322 |
| 12 | MODELLI VIEW | 1324–1593 |
| 13 | SETTINGS VIEW | 1595–1864 |
| 14 | DAY MODAL | 1866–2194 |
| 15 | DB MODAL + RENDER PRINCIPALE | 2196–2426 |
| 16 | COMPONENTS | 2428–2581 |
| 17 | REPORT SUBCOMPONENTS | 2583–2910 |
| 18 | MODELLO CARDS & FORMS | 2912–3088 |
| 19 | ROTAZIONE COMPONENTS | 3090–? |

## Note utili da ricordare
- **Bug aperto:** all'apertura app mostra prima cache locale "stale" (con calendari
  già eliminati) poi switcha alla versione corretta da Supabase → sdoppiamento
  visibile chiaro/scuro all'avvio. Sezioni coinvolte: 2 e 7.
- **Feature da fare:** bottoni "Importa da Supabase" / "Esporta su Supabase" in
  Settings, per forzare sync manuale. Sezione coinvolta: 13.
- Quando aggiorno questa mappa (nuove sezioni, righe cambiate), rigenero il file.
