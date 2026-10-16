# Piano — Gruppi personalizzati a tendina (app "turni")

Stato: **DA APPROVARE** · Repo `tesonemgs5/turni` (master, ultimo commit noto `db831de`) · Supabase `yzhrhemoklvpglmrgald`
Questo file, una volta approvato, va riportato in `PIANO-SYNC.md` **prima** di ogni push o scrittura su Supabase.

---

## 1. Obiettivo

Rendere i gruppi a tendina (oggi decisi dal codice: MATTINA, POMERIGGIO, AUTO, DISTACCATI…) **gestibili dall'utente**, senza dipendere dalla programmazione: creare, eliminare, spostare gruppi e spostare modelli fra i gruppi, anche in massa.

## 2. Regole di funzionamento (uguali in ordine A e in ordine B)

1. **Aggiungi gruppo**: sotto l'ultimo modello (sotto H24) c'è il pulsante «+ Aggiungi gruppo». Si sceglie il nome e nasce una tendina vuota.
2. **Elimina gruppo**: pulsante accanto al numero dei modelli. I modelli del gruppo tornano **senza gruppo** e seguono il loro ordine di sempre (per orario in B, alfabetico in A). Nessun modello viene cancellato.
3. **Sposta gruppo**: con la tendina **chiusa**, le frecce ↑↓ spostano l'intero gruppo con i modelli dentro.
4. **Sposta modelli**:
   - le frecce ↑↓ spostano il modello dentro il gruppo; arrivato al bordo, passa nel gruppo vicino;
   - il trascinamento su un altro gruppo cambia il gruppo del modello.
5. **Modelli senza gruppo**: stanno sempre **sotto tutti i gruppi**, nel loro ordine.
6. **Ogni ordine (A e B) ha i propri gruppi**, con lo stesso funzionamento. Le posizioni dei gruppi e l'appartenenza dei modelli sono **sincronizzate** su tutti i dispositivi. Lo stato aperto/chiuso di una tendina resta **per dispositivo** (come oggi).
7. **Primo avvio**: i gruppi di oggi diventano gruppi veri, creati **una sola volta** con i loro modelli dentro. Da lì in poi si possono spostare ed eliminare come gli altri.

## 3. Selezione multipla (modalità spostamento)

- Pressione **250 ms** su un modello: lo si sposta (come ora, con frecce/trascinamento).
- Pressione **500 ms**: il modello viene **selezionato**.
- A selezione attiva, ogni modello toccato si **aggiunge** alla selezione; toccando di nuovo un modello selezionato lo si **toglie**.
- Pressione **250 ms** su uno dei selezionati: si spostano **tutti insieme**; il gruppo di arrivo è quello in cui vengono lasciati.
- Si esce dalla selezione con un pulsante «Annulla selezione» o uscendo dalla modalità spostamento.

## 4. Modello dati (solo AGGIUNTE, mai toccate le colonne esistenti)

**Nuova tabella `gruppi_modelli`**
- `id` (uuid), `user_id`, `calendar_id`, `ordine` (`'A'` o `'B'`), `nome`, `sort_order`, `updated_at` (trigger come le altre tabelle).
- RLS attiva, stesse regole delle altre tabelle; Realtime attivo.

**Nuove colonne in `modelli`** (nullabili)
- `gruppo_a` e `gruppo_b` (id del gruppo nell'ordine A e nell'ordine B; vuoto = senza gruppo).
- Sono **due colonne**, una per ordine, perché ogni ordine ha i propri gruppi.

**Da verificare e adeguare** (devono conoscere tabella e colonne): `get_user_data`, `get_changes`, registro `eliminati`, `applica_modifiche`, backup completi, copie per modello, `ripristina_modello/i`, `backup_resto`, Esporta/Importa.

**Visualizzazione**: gruppi in ordine di `sort_order`; dentro ogni gruppo i modelli per la loro posizione (`sort_order` per B, `sort_order_a` per A); in fondo i modelli senza gruppo. Spostare un modello fra gruppi cambia il suo gruppo e dà una posizione fra i vicini con **una sola scrittura** (passo 1000, come oggi). Le scritture vanno sempre a blocchi (`applica_modifiche`, una richiesta).

**Riempimento iniziale**: una sola istruzione nel database, con le stesse regole dei gruppi attuali (B: MATTINA/POMERIGGIO/TERZO TURNO/NOTTE da fasce 6h15 e 6h30 + H24; A: DISTACCATI/AUTO/APPIEDATI/ALTRI). **Test annullato prima**, poi confronto dei conteggi con quelli visibili oggi nell'app (es. DISTACCATI 59). Non lo fanno i telefoni.

## 5. Tappe (ognuna: completa, provata, commit + push, piano aggiornato)

### Tappa 1 — Gruppi veri
- Piano in `PIANO-SYNC.md`.
- Database: tabella `gruppi_modelli` + colonne `gruppo_a`/`gruppo_b`, riempimento iniziale, funzioni aggiornate, **test annullati** prima di ogni scrittura reale.
- App: lettura dei gruppi dal database, tendine disegnate dai gruppi, «+ Aggiungi gruppo», elimina gruppo, rinomina.
- Fine tappa: l'app funziona come oggi, ma con gruppi veri.

### Tappa 2 — Spostamenti
- Frecce dei modelli che cambiano gruppo al bordo.
- Frecce delle tendine chiuse che spostano l'intero gruppo.
- Trascinamento di un modello su un altro gruppo.

### Tappa 3 — Selezione multipla
- Come descritta al punto 3; spostamento di più modelli con una sola scrittura a blocchi.

### Tappa 4 — Build e prova
- Build della nuova APK (si installa sopra, senza disinstallare), prova sui telefoni.

## 6. Rischi e protezioni

- **Posizioni dei modelli**: spostare un modello fra gruppi non deve alterare le posizioni degli altri → inserimento fra due vicini con una sola scrittura; test su dati veri.
- **Colonna sbagliata**: i punti che scrivono `sort_order` / `sort_order_a` / `gruppo_a` / `gruppo_b` vanno censiti tutti prima di scrivere codice.
- **Dispositivi non aggiornati**: i vecchi ignorano gruppi e colonne nuove (solo aggiunte), quindi non si rompono; si aggiornano all'installazione dell'APK.
- **Eliminazione gruppo**: mai elimina modelli; tutti i modelli tornano senza gruppo.
- **Dati**: nessuna tappa cancella o modifica modelli, eventi, rotazioni o colori esistenti.

## 7. Annullamento

- App: ripristinare il commit della tappa.
- Database: `drop table gruppi_modelli;` e `alter table modelli drop column gruppo_a, drop column gruppo_b;` (le colonne vecchie non vengono mai toccate).

## 8. Da provare sui telefoni (a fine lavori)

- [ ] Creare un gruppo, rinominarlo, eliminarlo: i modelli tornano senza gruppo nel loro ordine.
- [ ] Spostare una tendina chiusa con le frecce.
- [ ] Spostare un modello al bordo di un gruppo e fra gruppi diversi.
- [ ] Selezione multipla: 500 ms, aggiunta di altri modelli, spostamento insieme.
- [ ] Gruppi uguali su due dispositivi (modifica su A, B si aggiorna).
- [ ] Gruppi separati in ordine A e in ordine B.
- [ ] Nuovo modello: finisce nel punto giusto e senza gruppo (sotto i gruppi).
