# Piano sincronizzazione Supabase — turni

Regola: ogni punto viene scritto QUI **prima** di fare il push o la scrittura su Supabase.
Ogni passo è piccolo, non blocca l'app e ha una copia di sicurezza o è solo "aggiunta" (non toglie nulla).

## Stato dei passi

| # | Passo | Tocca | Stato |
|---|-------|-------|-------|
| 1 | Chiudere `get_user_data` (solo utenti loggati, solo i propri dati) | DB | ✅ fatto 14/10 |
| 2a | Aggiungere `updated_at` (automatico) e `deleted_at` a eventi, modelli, calendari, rotazioni, colori. Solo aggiunte | DB | ✅ fatto 15/10 |
| 2b | **Cambiato**: invece di cambiare tutte le cancellazioni dell'app, il DB registra da solo le righe eliminate (tabella `eliminati`) e offre la funzione `get_changes` (solo le differenze) | DB | ✅ fatto 15/10 |
| 2c | "Sincronizza ora": scarica solo le righe cambiate dall'ultima volta | App | ✅ pubblicato 15/10 (da provare sui telefoni) |
| 3a | Funzione `applica_modifiche`: molte modifiche in UNA richiesta, tutto-o-niente | DB | ✅ fatto 15/10 |
| 3b | L'app la usa per le raffiche (colori dei gruppi, riordino modelli) | App | ⏳ |
| 3c | Le altre raffiche (eventi in blocco, import) | App | ⏳ |
| 4 | Vincoli: ordine di invio, colori in inserisci-o-aggiorna, riferimenti che si azzerano | DB + App | ⏳ |
| 5 | Backup automatico giornaliero + copia fuori da Supabase + keep-alive | DB/App | ⏳ |

## Garanzie
- Prima di ogni modifica ai dati esiste una copia nella tabella `backups` (ultima completa: 14/10 20:07 UTC, 1416 eventi, 225 modelli).
- I passi su DB sono **solo aggiunte** finché l'app non è pronta a usarle: l'app attuale continua a funzionare.
- Se un passo va storto si torna indietro con il comando indicato nella riga "Annullamento".

## Registro (ordine cronologico, scritto prima di ogni azione)

### Passo 1 — Sicurezza `get_user_data` ✅
- Problema: la funzione era eseguibile anche senza login e non controllava l'id.
- Fatto: ora richiede login e `p_user_id = auth.uid()`; `anon` non può eseguirla.
- Verificato: `anon` non può eseguire, `authenticated` sì. L'app la chiama già così.
- Annullamento: ripristinare la definizione precedente (senza controllo) — sconsigliato.

### Passo 2a — Colonne `updated_at` e `deleted_at` ✅
- **Prima di scrivere su Supabase**, cosa farò:
  1. Funzione `imposta_updated_at()` che aggiorna `updated_at` a ogni modifica di una riga.
  2. Su `events`, `modelli`, `calendars`, `rotazioni`, `colori`: aggiungere `updated_at timestamptz not null default now()` e `deleted_at timestamptz null`, più il trigger.
  3. Indice `(user_id, updated_at)` su ciascuna, per scaricare solo le differenze.
- Effetto sull'app: nessuno. Le colonne nuove sono ignorate dall'app attuale; i dati non cambiano.
- Rischio: blocco di pochi millisecondi mentre si aggiunge la colonna.
- Annullamento: `alter table <t> drop column updated_at, drop column deleted_at;` e `drop function imposta_updated_at();`
- **Eseguito** (15/10, ~03:23 UTC): funzione + colonne + trigger + indici su tutte e 5 le tabelle.
- **Verificato**: 5/5 tabelle con `updated_at`, 5/5 con `deleted_at`, 5 trigger attivi. Dati invariati: 1417 eventi, 225 modelli, 5 calendari (tuoi), 29 colori. 0 righe cancellate logicamente.
- **Test del trigger** (annullato, nessuna modifica): `updated_at` passa da 03:23:13 a 03:23:25 a ogni aggiornamento.
- Nota: gli eventi sono 1417 e non 1416 (come nel backup delle 13:07): 1 evento è stato aggiunto dal telefono dopo il ripristino. Normale.
- Nessun push dell'app in questo passo (solo questo file, senza build).

### Passo 2b — Registro eliminazioni + `get_changes` (solo DB) ✅
- **Perché ho cambiato metodo**: la cancellazione logica (`deleted_at`) obbligherebbe a cambiare ogni punto dell'app che cancella e ogni punto che legge, e un colore cancellato "logicamente" bloccherebbe il rinserimento dello stesso colore (vincolo di unicità). Rischio alto di rompere l'app. Soluzione più sicura: **l'app continua a cancellare come ora**, e il database annota da solo ogni riga eliminata. Le colonne `deleted_at` restano, inutilizzate (si possono togliere più avanti).
- **Prima di scrivere su Supabase, cosa farò (solo aggiunte):**
  1. Tabella `eliminati` (utente, tabella, id riga, quando). Nessun accesso diretto dall'app (RLS attiva, nessuna regola): la legge solo la funzione.
  2. Trigger "dopo cancellazione" su `events`, `modelli`, `calendars`, `rotazioni`, `colori`: scrive in `eliminati`.
  3. Funzione `get_changes(p_user_id, p_since)`: restituisce, per l'utente che chiama, solo righe con `updated_at > p_since` + le eliminazioni successive. Controlla login e `auth.uid()`, come `get_user_data`. Se una riga è stata eliminata e poi ricreata (es. ripristino backup) l'eliminazione viene ignorata.
  4. Il "cursore" è l'orario del server restituito dalla funzione (non quello del telefono); l'app lo userà con 5 secondi di sovrapposizione per non perdere righe (le scritture ripetute sono innocue).
- Effetto sull'app attuale: nessuno (sola aggiunta). Dati invariati.
- Annullamento: `drop function get_changes(uuid,timestamptz); drop trigger trg_registra_eliminazione on <t>; drop function registra_eliminazione(); drop table eliminati;`
- **Eseguito** (15/10): tabella `eliminati` (RLS attiva, nessun accesso diretto), 5 trigger "dopo cancellazione", funzione `get_changes`.
- **Verificato con test annullati** (simulando il tuo login):
  - senza cursore restituisce tutto: 1417 eventi, 225 modelli, 5 calendari;
  - subito dopo il cursore: 0 differenze;
  - dopo 1 cancellazione + 1 modifica: 1 eliminazione (l'id coincide con quello cancellato) + 1 modello cambiato;
  - senza login: rifiutata. `anon` non può eseguirla, `authenticated` sì.
- **Dopo i test**: dati invariati (1417 eventi, 225 modelli) e registro `eliminati` vuoto: i test non hanno lasciato tracce.
- Limite noto del test: dentro un'unica transazione l'orologio del DB è fermo; nell'uso reale ogni scrittura è una transazione separata, quindi nessun problema.
- Nessun push dell'app in questo passo.

### Passo 2c — "Sincronizza ora" nell'app (solo differenze) ✅
- **Progetto, scritto prima di toccare il codice** (un solo push, poi nuova APK):
  1. **Pulsante nuovo** "🔄 Sincronizza ora" in Impostazioni → Database Cloud Supabase. Nessun avvio automatico: parte solo se lo premi. Nessun popup di conferma; l'esito compare nella finestra grande (come Esporta).
  2. **Cursore**: orario del SERVER dell'ultima sincronizzazione, salvato sul dispositivo (`turnipm_sync_cursore`). Si imposta (a) a fine "Esporta su Supabase" riuscito, (b) dopo un "Importa da Supabase" riuscito. Senza cursore il pulsante non fa nulla di rischioso: dice di fare prima Esporta (se questo è il dispositivo giusto) o Importa.
  3. **Cosa chiede al server**: `get_changes(utente, cursore − 5 secondi)`. La sovrapposizione di 5 s serve a non perdere righe; riapplicare una riga uguale è innocuo.
  4. **Come si fonde con i dati del telefono**:
     - le righe arrivate sostituiscono quelle con lo stesso id (calendari, modelli, rotazioni, colori) o vengono aggiunte; gli eventi si spostano se è cambiata data o calendario;
     - le eliminazioni tolgono la riga con quell'id;
     - **non scrive NULLA su Supabase** (solo lettura, niente effetto rimbalzo);
     - le righe che non sono nell'elenco ricevuto **non vengono toccate**: non cancella mai "per differenza".
  5. **Protezioni**:
     - se ci sono modifiche del telefono non ancora inviate (coda offline non vuota) si ferma e lo dice: prima devono arrivare su Supabase;
     - se le eliminazioni ricevute sono più del 30% degli eventi locali (e almeno 5) si ferma e lo dice;
     - se manca la linea o il server risponde con errore: nessuna modifica locale e messaggio chiaro.
  6. **Esito**: finestra grande con "Aggiornato: N eventi, M modelli… cambiati, K eliminati" oppure "Già aggiornato". Registrato nel Log.
- Non cambia: l'avvio dell'app (parte sempre dal locale), Importa/Esporta, la scrittura verso Supabase.
- Limite dichiarato: non posso provarlo su un telefono reale; lo verifico leggendo Supabase dopo i tuoi test.
- Annullamento: il pulsante si può togliere senza effetti sui dati; il cursore è solo un valore salvato sul dispositivo.
- **Pubblicato** (push + nuova APK): pulsante "🔄 Sincronizza ora (solo novità)" in Impostazioni → Database Cloud Supabase, come da progetto qui sopra.
- **Dettagli di realizzazione**: il cursore viene impostato a fine "Esporta su Supabase" riuscito e dopo "Importa da Supabase"; i calendari ricevono anche il loro ordine (si rilegge `sort_order`); i colori, che nell'app non hanno id, si rileggono per intero se cambiano.
- **Come provarlo (2 telefoni, A e B)**:
  1. Su A: "Esporta su Supabase" (imposta il punto di partenza). Su B: "Importa da Supabase" (imposta il punto di partenza).
  2. Su A fai una modifica (es. un turno) e aspetta che la spunta ☁️ Supabase sia ✓ nel Log.
  3. Su B premi "Sincronizza ora": deve dire "Aggiornato. Cambiati: 1 evento".
  4. Ripremi: deve dire "Già aggiornato".
  5. Su A elimina quel turno; su B "Sincronizza ora": "eliminati: 1".
- **Dopo la tua prova** leggo Supabase e ti dico se coincide.
- Non fatto di proposito: avvio automatico all'apertura (si decide dopo averlo provato), sincronizzazione delle impostazioni generali (`user_settings`).

### Passo 3 — Scrittura a blocchi 🔄
- **Cosa ho visto nel codice**: ogni modifica è una richiesta a sé + una lettura di controllo (+ 2 richieste "CORS" del browser). Ci sono 43 punti che scrivono; molti sono in un ciclo (un colore di gruppo cambiato su 9 modelli = 9 scritture; un riordino = fino a 200). Per questo le raffiche da 200-430 richieste all'ora e i "Failed to fetch".
- **Scelta**: NON cambio in blocco tutti i 43 punti. Prima la funzione sul DB (3a), poi migro i punti a raffica uno alla volta (3b, 3c). Le singole modifiche restano come ora.

### Passo 3a — `applica_modifiche` (solo DB) ✅
- **Prima di scrivere su Supabase, cosa farò (solo aggiunta):** funzione `applica_modifiche(p_ops jsonb)`:
  - riceve un elenco (max 500) di operazioni `{tipo: insert|update|delete, table, payload, match}`;
  - le applica **tutte in una sola transazione**: se una fallisce, **nessuna** viene applicata (tutto-o-niente) e torna l'errore;
  - ripetibile senza effetti doppi: gli inserimenti con id già presente non duplicano;
  - **sicurezza**: richiede login; il `user_id` è sempre forzato a quello di chi chiama (non si può toccare dati di altri); solo le 5 tabelle dei dati; nel filtro `match` una colonna inesistente dà errore (così un filtro non si "allarga" per sbaglio); nel `payload` una colonna inesistente viene ignorata, come fa già l'app;
  - restituisce per ogni operazione quante righe ha toccato (serve all'app per verificare, al posto della lettura di controllo).
- Effetto sull'app attuale: nessuno (non la usa ancora). Dati invariati.
- Provo con test **annullati** (simulando il login): inserimento, modifica, cancellazione, tutto-o-niente, utente forzato, colonna sbagliata.
- Annullamento: `drop function public.applica_modifiche(jsonb);`
- **Eseguito** (15/10): funzione creata; `anon` non può eseguirla, `authenticated` sì.
- **Verificato con test annullati** (simulando il login):
  1. insert + update in una sola richiesta: 1 riga + 1 riga; la colonna inesistente nel contenuto viene ignorata;
  2. ripetibile: lo stesso insert una seconda volta tocca 0 righe, nessun doppione;
  3. `user_id` forzato: puntando a un altro utente agisce solo sul mio;
  4. modifica del `sort_order` di un modello: 1 riga;
  5. tutto-o-niente: con la seconda operazione sbagliata la prima non resta (colori 29 prima, 29 dopo);
  6. senza login: rifiutata.
- **Dopo i test**: nessuna traccia (29 colori, 0 colori di test, 1417 eventi, 225 modelli, registro eliminazioni vuoto).
- Nessun push dell'app in questo passo.

### Passo 3b — l'app usa `applica_modifiche` per le raffiche
- **Da fare, non ancora iniziato.** Prima di toccare il codice scrivo qui: l'elenco dei punti a raffica, quale migrare per primo, e come si comporta senza linea (le operazioni finiscono nella coda offline una per una, come ora) e in caso di errore (si torna alla scrittura una per una, così i messaggi restano quelli di oggi).
