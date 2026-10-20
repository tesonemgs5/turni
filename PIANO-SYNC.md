# Piano sincronizzazione Supabase — turni

Regola: ogni punto viene scritto QUI **prima** di fare il push o la scrittura su Supabase.

## REGOLA PERMANENTE — i backup seguono sempre lo schema di Supabase (17/10)
Il backup per modello (riga intera del modello, `to_jsonb`) e il backup del "resto" (`snapshot_resto`) devono restare **allineati alle tabelle di Supabase**. Un backup rimasto indietro è inutile proprio quando serve: non lo si scopre finché non si ripristina.
- **Colonne nuove** in tabelle già coperte (`modelli`, `events`, `calendars`, `rotazioni`, `colori`, `user_settings`): viaggiano da sole, perché si copia la riga intera. Va comunque controllato dopo il ripristino.
- **Tabelle nuove**: nello stesso passo in cui nascono vanno aggiunte a (1) `crea_backup_automatico` + `ripristina_backup` (backup completi), (2) `snapshot_resto` + `ripristina_resto` se non appartengono a un modello, (3) Esporta, Importa e backup locale dell'app, (4) "Verifica struttura Supabase". Le tabelle di servizio o temporanee si escludono **scrivendolo qui**.
- **Ogni passo del piano** che crea una tabella o cambia il formato di una riga deve avere una riga «Backup: …» con ciò che è stato fatto (o perché non serve).
- **Controllo da rilanciare dopo ogni cambio di schema** (confronta le tabelle con quelle presenti nei backup):
  `select c.relname, (pg_get_functiondef('public.snapshot_resto(uuid)'::regprocedure) ~ c.relname) in_resto, (pg_get_functiondef('public.crea_backup_automatico()'::regprocedure) ~ c.relname) in_completo from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1;`
- **Stato al 17/10**: coperte da tutti e due: `calendars`, `colori`, `events`, `rotazioni`, `user_settings`. **Solo nel backup completo**: `modelli` (e quindi nelle copie per modello, che copiano la riga), `gruppi_modelli`, `autocomplete_valori`. **FATTO il 17/10**: `gruppi_modelli` è anche nel backup del "resto" e in `ripristina_resto` (parte `gruppi`). **Verificate il 17/10, escluse di proposito perché sono già copie di sicurezza**: `disposizione_auto` (storico automatico delle disposizioni dei modelli: posizioni e gruppi, 20 righe, ~300 kB, scritto da «Salva disposizione») e `impostazioni_backup` (una riga di ~1 kB: fasce, colori extra, colori domeniche/festivi e gruppi, scritta dall'app per ripristinare le impostazioni; il contenuto è già in `user_settings` e `gruppi_modelli`, coperti dal backup del "resto"). **Escluse di proposito** (servizio/temporanee): `backup_config`, `backup_per_modello`, `backup_resto`, `backups`, `eliminati`, `log_attivita`, `usage_stats`, `bk_*`, `modelli_sortorder_backup`.

Ogni passo è piccolo, non blocca l'app e ha una copia di sicurezza o è solo "aggiunta" (non toglie nulla).

## Stato dei passi

| # | Passo | Tocca | Stato |
|---|-------|-------|-------|
| 1 | Chiudere `get_user_data` (solo utenti loggati, solo i propri dati) | DB | ✅ fatto 14/10 |
| 2a | Aggiungere `updated_at` (automatico) e `deleted_at` a eventi, modelli, calendari, rotazioni, colori. Solo aggiunte | DB | ✅ fatto 15/10 |
| 2b | **Cambiato**: invece di cambiare tutte le cancellazioni dell'app, il DB registra da solo le righe eliminate (tabella `eliminati`) e offre la funzione `get_changes` (solo le differenze) | DB | ✅ fatto 15/10 |
| 2c | "Sincronizza ora": scarica solo le righe cambiate dall'ultima volta | App | ✅ pubblicato 15/10 (da provare sui telefoni) |
| 3a | Funzione `applica_modifiche`: molte modifiche in UNA richiesta, tutto-o-niente | DB | ✅ fatto 15/10 |
| 3b | L'app la usa per le raffiche (riordino modelli/rotazioni/colori, cambio colore dei gruppi) | App | ✅ pubblicato 15/10 (da provare sui telefoni) |
| 3c | Le altre raffiche (propagazione colori agli eventi, normalizzazioni, creazione modello, ripristino disposizione) | App | ✅ pubblicato 15/10 (da provare sui telefoni) |
| 4 | Vincoli e rifiuti del server: analisi + correzione del nome di colonna sbagliato | App (DB invariato) | ✅ pubblicato 15/10 |
| 5a | **Sincronizzazione automatica** (prima del backup, come deciso): A modifica → B la trova da solo | App | ✅ pubblicato 15/10 (da provare su 2 telefoni) |
| 5b | Backup settimanale dentro Supabase + controllo anti-pausa del piano gratuito | DB | 🔄 |
| 5c | Copia fuori da Supabase (da decidere insieme) | — | ⏳ |

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

### Passo 3b — l'app usa `applica_modifiche` per le raffiche ✅
- **Punti a raffica trovati e che migro in questo push** (tutti scrivono su Supabase "una richiesta per riga"):
  1. `salvaModifichePosizioni` — riordino dei modelli (la causa principale: tutte le richieste partono insieme, ognuna con la sua lettura di controllo). Usato da trascinamento, frecce ▲▼ e assegnazione colori.
  2. `salvaModifichePosizioniRotazioni` — riordino rotazioni.
  3. `salvaModifichePosizioniColori` — riordino colori.
  4. `replaceColoreEverywhere` — cambio colore di un gruppo: N modelli + vecchio colore + gruppo nuovo, tutto in UNA richiesta.
  5. `assegnaColoreAModelli` — assegnare un colore a più modelli.
  6. Ricolorazione "una tantum" dei modelli per fascia oraria.
- **Come funziona**: nuova funzione dell'app `scriviBatchConBackup`. Manda le operazioni a `applica_modifiche` (max 500 per richiesta), tutto-o-niente.
  - **Senza linea / rete che cade**: le operazioni vanno nella coda offline una per una, esattamente come oggi (la coda non cambia).
  - **Errore vero del server** (non di rete): il blocco non viene applicato; l'app ripiega sulla scrittura una per una di oggi, così i messaggi e il comportamento restano quelli noti.
  - **Verifica**: al posto della lettura di controllo per ogni riga, si usa il numero di righe toccate restituito dal server; una modifica che tocca 0 righe viene segnalata nel Log.
  - Spunta ☁️ Supabase nel Log e Sheets: invariati.
- **Non cambia**: la scrittura delle singole modifiche (un evento, un modello), la coda offline, Esporta, Sincronizza ora.
- Limite dichiarato: non posso provarlo su un telefono reale. Lo verifico leggendo Supabase dopo il tuo test (riordina un modello e cambia un colore di gruppo).
- Annullamento: basta ripristinare il commit precedente; la funzione DB può restare.
- **Pubblicato** (push + nuova APK): la funzione `scriviBatchConBackup` e i 6 punti migrati, come da elenco qui sopra.
- **Verificato prima del push** (test annullati sul DB, con le stesse forme di richiesta che manderà l'app): cambio colore di un gruppo (modello + cancellazione vecchio colore con contenuto vuoto + nuovo gruppo con filtro vuoto) = 3 operazioni in una richiesta; ricolorazione con `colore_custom` nullo; posizione colore per `hex`. Dopo i test: 29 colori, 1417 eventi, 225 modelli, nessuna traccia.
- **Come provarlo**: (1) sposta un modello con le frecce o col trascinamento; (2) cambia il colore di un gruppo che ha molti modelli. Nel Log ogni operazione deve mostrare ☁️ Supabase ✓. Poi dimmelo e leggo Supabase.
- **Dopo il primo spostamento di modello** l'app rinumera una volta tutti i modelli (numerazione con buchi, commit 13b3403): prima era una raffica di circa 225 richieste, ora è **una richiesta sola**.
- Restano scritture "una per una" per le singole modifiche (un evento, un modello) e le raffiche sugli eventi (passo 3c).

### Passo 3c — altre raffiche ✅
- **Già a posto, non lo tocco**: l'inserimento e la cancellazione di MOLTI eventi (import, cancellazioni di massa) passano già dalla coda dell'app, che li spedisce a blocchi di 50-100 righe.
- **Punti a raffica trovati che migro in questo push** (tutti scrivono "una richiesta per riga", spesso in sequenza):
  1. `propagaColoreModelliAgliEventi` — ogni cambio colore di un modello ricolora i suoi eventi: una richiesta per modello, in sequenza, ognuna con la sua lettura di controllo. Qui una modifica può toccare 0 righe (modello senza eventi): è normale, non è un errore.
  2. Normalizza colori degli eventi (a gruppi di 20 in parallelo).
  3. "Visualizza eventi del modello" (a gruppi di 20 in parallelo).
  4. Creazione di un modello: rinumerazione degli altri modelli, una richiesta ciascuno in sequenza.
  5. Normalizzazione colore dei modelli (ciclo in sequenza).
  6. Ripristino disposizione 360° (ciclo in sequenza, più colonne per modello).
  7. Migrazione una tantum "colore esplicito sul modello" (parte all'avvio dopo un Importa).
  8. Riordino dei colori: registrazione dei colori nuovi.
- **Aggiunta alla funzione**: un'operazione può dichiarare "0 righe va bene" (`zeroOk`), così il controllo non segnala falsi errori.
- **Resta com'è, di proposito**: le singole modifiche (un evento, un modello, una rotazione), il "ripristino modello orfano" (caso raro, ogni riga ha il suo esito) e "Rimozione colore" (ciclo che passa da `saveModello`, rischio di cambiarlo > beneficio).
- **Prima del push**: provo sul DB le forme nuove (modifica di eventi per `modello_id` con 0 righe, modifica con `visibile_anche_in` a elenco, più colonne insieme), con test annullati.
- Annullamento: ripristinare il commit precedente.
- **Pubblicato** (push + nuova APK): gli 8 punti elencati ora usano `scriviBatchConBackup`; aggiunta l'opzione `zeroOk`.
- **Verificato prima del push** (test annullati sul DB, forme identiche a quelle dell'app):
  1. modifica di eventi per `modello_id`: 2 righe per un modello con eventi, **0 righe** per uno senza (normale: per questo serve `zeroOk`);
  2. colore + `modello_id` insieme su un evento: 1 riga;
  3. `visibile_anche_in` come elenco (salvato come elenco) e come `null` (salvato `NULL`);
  4. modello con 8 colonne insieme (ripristino disposizione 360°): 1 riga.
  Dopo i test: nessuna modifica rimasta.
- **Come provarlo**: cambia il colore di un modello che ha eventi nel calendario → gli eventi si ricolorano e nel Log compare ☁️ ✓ senza raffiche di richieste; poi dimmelo e leggo Supabase.
- **Riepilogo scrittura a blocchi (3a+3b+3c)**: ora le raffiche sono UNA richiesta; restano "una per una" solo le singole modifiche, il ripristino modello orfano e la rimozione colore.

### Passo 4 — Vincoli e rifiuti del server ✅
- **Analisi (solo lettura)** del Log di Supabase degli ultimi 5 giorni e dei vincoli del database:
  1. **72 eventi rifiutati (rotazione mancante), 21 colori duplicati, 3 calendari ancora usati dai modelli**: tutti del 14/10 tra le 13:08 e le 13:11, cioè del vecchio "Ripristino backup", **già corretto** nel commit d7d2cec (id originali, ordine di cancellazione giusto, stop se una cancellazione fallisce, colori duplicati ignorati). Dopo di allora: zero.
  2. **I 208 aggiornamenti "respinti"** (14/10 ~11:00 ora italiana): erano **104 eventi × 2 colonne con il nome sbagliato**. In `02-Modelli.jsx` (scheda override di report) l'app manda `turno_vuoto` e `app_auto_vuoto`, ma nel database le colonne si chiamano `categoria_turno_vuoto` e `categoria_app_auto_vuoto`. Il server le scartava, l'app riprovava senza, e quei due valori **non sono mai stati salvati su Supabase** per quegli eventi. È l'unico errore di colonna presente nel Log.
  3. **Vincoli del database**: già adatti. Eventi → calendario: si cancellano col calendario (CASCADE). Eventi → rotazione: se la rotazione sparisce l'evento resta e perde solo il collegamento (SET NULL). Modelli → calendario: blocca la cancellazione di un calendario che ha ancora modelli; lo lascio così perché "azzerare" farebbe finire i modelli, in silenzio, nel calendario principale. Colori: unico per utente+colore; i nuovi inserimenti in blocco ignorano i doppioni.
- **Decisione**: **nessuna modifica al database** in questo passo (i vincoli sono corretti; cambiarli darebbe più rischio che beneficio).
- **Cosa cambio nell'app**: i due nomi di colonna in `02-Modelli.jsx` (riga ~3203). Effetto: per le modifiche di massa nessuna richiesta ripetuta, e i due valori finalmente salvati.
- **Gli eventi già modificati** (le 104 QUARTINA) hanno il valore giusto sul telefono; su Supabase lo avranno al prossimo "Esporta su Supabase" (che riscrive tutti i campi).
- Annullamento: ripristinare il commit precedente.
- **Pubblicato** (push + nuova APK): corretti i due nomi di colonna. Database non toccato.
- **Come provarlo**: da un evento "QUARTINA" (o altro) imposta l'override di report su "tutti gli eventi di questo modello" e salva. Nel Log non devono più comparire gli avvisi "Colonna 'turno_vuoto' assente"; dopo la tua prova li cerco io in `log_attivita`.

### Passo 5a — Sincronizzazione automatica ✅
- **Obiettivo**: fai una modifica su A e la trovi su B **da solo**, senza premere nulla, e l'app si apre sempre SUBITO dal locale (nessuna schermata di attesa).
- **Progetto, scritto prima del codice** (un solo push, poi nuova APK):
  1. **Quando parte** (in background, in sola lettura da Supabase): 2,5 secondi dopo l'apertura; quando torni nell'app dopo averla lasciata in secondo piano; quando torna la linea; e ogni 60 secondi finché l'app è aperta e visibile. Ogni controllo è UNA richiesta piccola (`get_changes`). Mai più di una ogni 15 secondi.
  2. **Silenziosa**: nessuna finestra e nessun popup. Se arrivano novità compare un avviso breve in basso ("🔄 Aggiornato: 1 evento") e una riga nel Log (origine "remoto"). Se non c'è niente di nuovo, non succede nulla. Gli errori vanno solo nel Log.
  3. **Interruttore**: in Impostazioni, accanto a "Sincronizza ora", un pulsante "Sincronizzazione automatica: SÌ/NO" (di partenza SÌ). Se lo metti su NO l'app torna a leggere da Supabase solo quando premi tu.
  4. **Niente falsi aggiornamenti**: una riga ricevuta viene applicata solo se è **diversa** da quella che hai già. Così le tue stesse modifiche, che tornano indietro dal server, non generano avvisi e non cambiano l'ordine degli eventi dello stesso giorno (una riga già presente si sostituisce sul posto).
  5. **Protezioni** (le stesse di "Sincronizza ora", più due): si ferma se ci sono modifiche non ancora inviate (coda offline); si ferma se una scrittura di questo dispositivo è in corso; si ferma se Supabase segnala troppe eliminazioni (≥30% e almeno 5); non scrive MAI su Supabase.
  6. **Punto di partenza automatico**: se il dispositivo non ha ancora il cursore, l'app scarica una volta tutto e lo confronta con i dati locali. Se sono **identici** attiva da sola la sincronizzazione; se **non coincidono** non tocca nulla e ti dice cosa fare (Esporta o Importa). Così non serve più un'azione manuale sui dispositivi già allineati.
- **Non cambia**: l'avvio (parte sempre dal locale), la scrittura verso Supabase, Importa/Esporta, la regola "non sovrascrivere mai dati locali non inviati".
- **Limite dichiarato**: non posso provarlo su due telefoni reali. Lo verifico leggendo Supabase e il Log dopo il tuo test. Il tempo tra una modifica su A e la comparsa su B sarà al massimo ~60 secondi con l'app aperta su B (subito se riapri B o la riporti in primo piano). Per l'aggiornamento istantaneo (pochi millisecondi) serve Supabase Realtime: lo valutiamo dopo, se questo non basta.
- Annullamento: l'interruttore SÌ/NO, oppure ripristinare il commit.
- **Pubblicato** (push + nuova APK): tutto come da progetto qui sopra; interruttore "Sincronizzazione automatica: SÌ/NO" in Impostazioni → Database Cloud Supabase.
- **Verifica prima del push, sui dati reali** (il tuo backup locale delle 19:48): ho convertito ogni elemento nel formato Supabase (come fa "Esporta") e lo ho riconvertito con le stesse funzioni usate dalla sincronizzazione. Risultato: **1416 eventi, 225 modelli, 5 calendari, 4 rotazioni → 0 differenze**. Quindi, quando un dispositivo è allineato a Supabase, la sincronizzazione automatica non trova falsi aggiornamenti.
- **Come provarlo (A e B)**:
  1. Aggiorna l'APK su entrambi e aprili: se sono allineati a Supabase, nel Log compare "Questo dispositivo è identico a Supabase: sincronizzazione attivata" (se non coincidono, compare cosa fare, senza toccare nulla).
  2. Su A fai una modifica e aspetta ☁️ ✓ nel Log.
  3. Su B, con l'app aperta, entro ~60 secondi compare l'avviso "🔄 Aggiornato: 1 evento"; oppure riportala in primo piano e compare subito.
  4. Dimmelo e controllo il Log di Supabase.
- Tempo atteso: fino a ~60 s con l'app aperta su B; subito alla riapertura o al ritorno in primo piano. Per l'istantaneo vero (Realtime) si decide dopo.

### Correzione dati — flag mancanti sui 104 eventi QUARTINA
- **Problema**: il 14/10 (~09:48 UTC) "Tutti gli eventi di QUARTINA" mandava a Supabase due colonne che non esistono (`turno_vuoto`, `app_auto_vuoto`). L'app riprovava togliendo una colonna alla volta: `categoria_turno` e `categoria_app_auto` sono arrivate, i due flag no. Erano 104 eventi x 2 rifiuti = i "208 respinti". Il codice è già corretto (commit 1295eba, nomi `categoria_turno_vuoto` / `categoria_app_auto_vuoto`); nel file `02-Modelli.jsx` le due vecchie parole restano solo in un commento che racconta la correzione.
- **Stato verificato su Supabase prima di scrivere** (sola lettura, 15/10): 104 eventi con titolo QUARTINA, orari vuoti (H24), dal 23/07/2023 al 08/09/2030; tutti con `categoria_turno_vuoto = false` e `categoria_app_auto_vuoto = false`; `categoria_turno` e `categoria_app_auto` nulli.
- **Valori da scrivere** (dedotti dalle dimensioni delle richieste nei log: 50 / 69 / 92 byte = base + `"turno_vuoto":true` + `"app_auto_vuoto":false`; inoltre QUARTINA è H24 e per gli H24 la sezione APP/AUTO non c'è): `categoria_turno_vuoto = true`; `categoria_app_auto_vuoto` resta `false`.
- **Cosa farò (una sola scrittura)**: un `update` su `events` con filtro rigido (utente, titolo = QUARTINA, orari vuoti, flag ancora `false`, categorie nulle). Atteso: 104 righe.
- **Effetto**: il trigger aggiorna `updated_at`; i dispositivi che hanno ancora `false` ricevono il valore con la sincronizzazione; il dispositivo con i dati giusti coincide già, quindi non cambia nulla.
- **Annullamento**: stessa `update` con `categoria_turno_vuoto = false` (prima erano tutti `false`).
- **Limite dichiarato**: `true` è dedotto dai log, non letto dal telefono. Se sul telefono risultasse altro, un "Esporta su Supabase" dal dispositivo giusto lo riallinea.
- **Eseguito** (15/10): un solo `update`, 104 righe.
- **Verificato**: 104 su 104 eventi QUARTINA con `categoria_turno_vuoto = true` e `categoria_app_auto_vuoto = false`; gli eventi aggiornati negli ultimi 5 minuti sono solo quei 104 (nessun altro toccato); totali invariati: 1417 eventi, 225 modelli, registro eliminazioni vuoto. Altri 10 eventi avevano già un flag attivo dall'uso normale dell'app, e non sono stati toccati.

### Passo 5b — Backup settimanale dentro Supabase + anti-pausa 🔄
- **Obiettivo**: (1) ogni settimana una copia completa dei tuoi dati dentro Supabase, senza che serva aprire l'app; (2) evitare che il piano gratuito metta in pausa il progetto dopo 7 giorni senza richieste, e avere un avviso se Supabase non risponde.
- **Stato verificato prima di scrivere** (sola lettura, 15/10): tabella `backups` con colonne `id, user_id, created_at, data`; 12 backup, tutti manuali, ognuno ~150-300 kB (tabella intera ~2 MB); estensione `pg_cron` disponibile (versione 1.6.4) ma non installata; 1 solo utente con dati. Formato di un backup (identico a quello di "Esporta"): `exported_at`, `calendars`, `events`, `modelli`, `rotazioni`, `colori`, `autocomplete_valori` (elenchi di righe) e `user_settings` (la riga intera).
- **Parte 1 — database, solo aggiunte**:
  1. colonna `backups.tipo` (testo, predefinito `manuale`): i 12 backup esistenti restano `manuale` e **non vengono mai toccati**;
  2. funzione `crea_backup_automatico()`: per ogni utente con dati scrive UNA riga in `backups` con le stesse chiavi dell'esportazione manuale (quindi il "Ripristino backup" dell'app la legge come le altre) e `tipo = auto_settimanale`; poi tiene solo gli **ultimi 8 automatici** per utente. Guardie: salta chi non ha né eventi né modelli, e salta se gli eventi sono meno della metà dell'ultimo automatico (per non far uscire i buoni a favore di una copia danneggiata); le vecchie si cancellano **solo dopo** che la nuova è stata scritta;
  3. permessi: la funzione non è eseguibile da `anon` né da `authenticated`, solo dal sistema;
  4. `pg_cron`: lavoro `backup-automatico-settimanale` ogni domenica alle 03:00 UTC che chiama la funzione.
- **Parte 2 — anti-pausa, fuori dall'app**: file `.github/workflows/anti-pausa-supabase.yml`, ogni giorno alle 06:17 UTC (e a richiesta). Fa una richiesta all'API di Supabase con la chiave pubblica che l'app già usa (secrets già presenti); se la risposta non è 200 il lavoro **fallisce** e GitHub manda la mail di avviso al proprietario del repo. Non tocca l'app e non fa partire la build (`[skip ci]`).
- **Effetto sull'app**: nessuno, nessuna nuova APK. Il vecchio "Ripristino backup" elenca anche i nuovi automatici (stessa tabella).
- **Rischi e limiti**: (a) non so se il lavoro interno di `pg_cron` conti come "attività" per evitare la pausa: per questo l'anti-pausa è il controllo esterno di GitHub; (b) GitHub spegne i lavori programmati dopo 60 giorni senza attività nel repo (qui il repo è attivo); (c) questo **non** è ancora la copia fuori da Supabase (passo 5c).
- **Provo prima di dichiarare fatto**: eseguo `crea_backup_automatico()` una volta a mano e confronto i conteggi del nuovo backup con le tabelle (è un backup vero e resta); controllo che `anon` non possa eseguirla; lancio una volta il lavoro di GitHub e leggo l'esito.
- **Annullamento**: `select cron.unschedule('backup-automatico-settimanale'); drop function public.crea_backup_automatico(); alter table public.backups drop column tipo;` (prima `delete from public.backups where tipo='auto_settimanale';`) e cancellare il file del workflow.

### Recupero dei dati su Supabase (15/10, sera) ✅
- **Cosa è successo (dal Log e dai registri di Supabase, solo lettura)**:
  - 09:36–09:42 UTC: un "Ripristino backup" da un telefono Android è partito più volte e **si è interrotto a metà** (errori "Failed to fetch" e "duplicate key events_pkey"): il ripristino scrive riga per riga, ~1400 richieste una dopo l'altra, e basta una caduta di rete per lasciare Supabase mezzo vuoto;
  - 13:13 UTC: un altro ripristino ha rimesso una copia piccola (69 eventi, 30 modelli), quella lasciata dal tentativo fallito;
  - risultato: **Supabase ha 69 eventi e 30 modelli** invece di 1417 e 225. È per questo che Importa e Sincronizza "non funzionano": ricevono dati incompleti e la protezione dell'app li **rifiuta di proposito** (PC: "69 eventi contro 1415 in locale: NON applicata"). I dati locali del PC sono integri.
  - Esporta non andava a buon fine perché partiva da un dispositivo con dati incompleti oppure veniva fermato dalla protezione.
- **Copia scelta per il recupero**: backup `08f747a6` del 15/10 09:41:01 UTC. Verificata: 1417 eventi, 225 modelli, 5 calendari, 4 rotazioni, 29 colori, **104 QUARTINA con i flag corretti** (ieri erano 0). Rispetto al backup di ieri: 2 eventi nuovi e 1 in meno (tue modifiche).
- **Cosa farò su Supabase (una sola operazione tutto-o-niente, dentro il database, senza passare dalla rete del telefono)**: cancellare le righe del tuo utente in eventi, rotazioni, modelli, calendari, colori e autocomplete; reinserirle da quel backup con gli stessi id; `updated_at` riparte da adesso (così gli altri dispositivi vedono le righe come novità). Non tocco gli altri utenti.
- **Poi**: conteggi e impronte di controllo; il vecchio "Ripristino backup" dell'app resta da **non usare** finché non lo rendo atomico (è la causa del danno).
- Annullamento: i backup `d22626fe` (13:13) e `c927a543` (09:41:37) conservano lo stato precedente.

### Passo 5b — completamento (15/10, sera) ✅
- **Verificato in sola lettura**: la parte database del 5b dell'altra sessione è **completa**: colonna `backups.tipo`, funzione `crea_backup_automatico()` (stesso formato dell'esportazione manuale; protezione che non salva se gli eventi sono meno della metà dell'ultimo automatico; conserva gli ultimi 8 automatici; non tocca i manuali), permessi chiusi (né `anon` né utenti loggati possono eseguirla), lavoro `pg_cron` `backup-automatico-settimanale` ogni domenica 03:00 UTC. Esiste già 1 backup automatico (09:22, 1417 eventi, 225 modelli, buono).
- **Mancava**: il controllo anti-pausa su GitHub. Lo aggiungo ora: file `.github/workflows/anti-pausa-supabase.yml`, ogni giorno alle 06:17 UTC e a richiesta; fa una richiesta all'API di Supabase con la chiave pubblica già presente nei secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) e **fallisce con avviso se Supabase non risponde**. Nessun effetto sull'app, nessuna nuova APK (commit con `[skip ci]`). Lo lancio una volta a mano per provarlo.
- Limite: GitHub spegne i lavori programmati dopo 60 giorni senza attività nel repo; finché si lavora sul repo non succede.

### Ripristino backup ATOMICO (15/10, sera) ✅
- **Problema**: il "Ripristino backup" dell'app cancella e reinserisce ~1400 righe una alla volta. Se la rete cade a metà (è successo due volte oggi) Supabase resta mezzo vuoto, con duplicati. In più non c'era nessuna protezione contro il ripristino di una copia più piccola dei dati attuali (13:13: ripristinata una copia da 69 eventi).
- **Soluzione, in 2 parti** (prima DB, poi app con una nuova APK):
  1. **DB (solo aggiunta)**: funzione `ripristina_backup(p_backup_id, p_forza)`. Una sola richiesta, **tutto-o-niente** dentro il database: controlla login e che il backup sia tuo; **rifiuta** se il backup ha meno dell'80% degli eventi attuali (a meno di conferma esplicita `p_forza`); salva prima una copia dello stato attuale (`tipo='pre_ripristino'`); poi sostituisce calendari, rotazioni, modelli, eventi, colori, autocomplete con gli stessi id; `updated_at` riparte da adesso. Se qualcosa va storto non cambia niente.
  2. **App**: il pulsante di ripristino chiama quella funzione (una richiesta) al posto del ciclo; se risponde "backup più piccolo" mostra i numeri e chiede conferma esplicita; poi ricarica i dati.
- **Provo prima**: test annullati simulando il login (ripristino della copia buona = ok; copia da 69 eventi = rifiutata; senza login = rifiutata).
- Annullamento: `drop function public.ripristina_backup(uuid, boolean);` e ripristinare il commit dell'app.

### Esiti (15/10, sera)
- **Recupero eseguito e verificato**: Supabase riportato alla copia `08f747a6` (09:41:01). Conteggi e impronte identici: **1417 eventi, 225 modelli, 5 calendari, 4 rotazioni, 29 colori, 104 QUARTINA con flag**. Un primo tentativo è stato annullato dal database (mancava `updated_at`) senza modificare nulla; il secondo è riuscito.
- **5b completo**: parte DB già fatta dall'altra sessione e verificata; aggiunto il controllo anti-pausa (`.github/workflows/anti-pausa-supabase.yml`), **lanciato a mano: riuscito**, nessuna APK avviata.
- **Ripristino atomico — DB**: funzione `ripristina_backup` creata. Test annullati: copia buona → ok (1417/225/5/4/29) + 1 copia di sicurezza; copia da 69 eventi → **rifiutata**; senza login → rifiutata.
- **Ripristino atomico — app**: pulsante ora in UNA richiesta, con finestra di esito e conferma esplicita se il backup è molto più piccolo. Pubblicato con nuova APK.
- **Perché Importa/Sincronizza/Esporta "non funzionavano"**: Supabase era danneggiato (69 eventi) e le protezioni dell'app rifiutavano di proposito i dati incompleti. Ora Supabase è corretto: dopo l'aggiornamento APK, "Sincronizza ora" dovrebbe dire "identico a Supabase" o mostrare le differenze reali.
- **Da NON fare**: sul telefono con dati dubbi non premere "Importa" prima di aver controllato i numeri.

### Impostazioni backup: frequenza, quanti tenerne, cancellazione e spazio ✅
- **Stato prima (verificato)**: il backup automatico c'è ma è fisso: ogni domenica 03:00 UTC, si tengono gli ultimi 8 automatici. Nell'app non si poteva né scegliere né cancellare nulla.
- **Cosa aggiungo**:
  1. **DB (solo aggiunte)**: tabella `backup_config` (per utente: `frequenza` = disattivato / giornaliero / settimanale / mensile, `max_automatici` da 1 a 60; di partenza settimanale e 8); funzioni `backup_config_leggi`, `backup_config_salva` (applica subito anche la pulizia), `backup_elenco` (data, tipo, eventi, modelli e **peso in kB**, senza scaricare i dati), `backup_elimina(ids)` (mai tutti: ne resta sempre almeno 1) e `backup_tieni_ultimi(n)`. Tutte richiedono login e toccano solo i tuoi backup.
  2. **DB**: `crea_backup_automatico()` legge la configurazione di ogni utente (frequenza e quanti tenerne) e salta chi è "disattivato" o non è ancora il momento; il lavoro `pg_cron` passa da "ogni domenica" a "ogni giorno alle 03:00 UTC" (decide la funzione se è ora). Resta la protezione contro i backup danneggiati.
  3. **App** (nuova APK): in Impostazioni → Database Cloud Supabase un blocco "🗄️ Backup automatici" con frequenza e quanti tenerne; la finestra "Backup disponibili" mostra data, tipo e peso, ha il cestino per ogni backup, "Tieni solo gli ultimi N" e il totale dello spazio usato.
- **Regole di sicurezza**: nessun backup si cancella senza conferma; non si può cancellare l'ultimo rimasto; i backup manuali non vengono mai toccati dalla pulizia automatica (solo quando li cancelli tu o usi "Tieni solo gli ultimi N").
- **Provo prima**: test annullati (config, elenco, cancellazione, rifiuto di cancellare tutto, senza login).
- Annullamento: `drop function` delle 5 funzioni, `drop table backup_config`, ripristinare `crea_backup_automatico` e il lavoro cron settimanale, ripristinare il commit dell'app.
- **Eseguito** (15/10, sera): DB e app.
  - **DB**: tabella `backup_config` e 5 funzioni (`backup_config_leggi`, `backup_config_salva`, `backup_elenco`, `backup_elimina`, `backup_tieni_ultimi`), tutte solo per utenti loggati e solo sui propri backup. `crea_backup_automatico()` ora legge frequenza e numero da tenere di ogni utente. Il lavoro cron è passato da "ogni domenica" a **"ogni giorno alle 03:00 UTC"** (`backup-automatico`): la funzione decide se è il momento (giornaliero ≥20 h dall'ultimo, settimanale ≥6 giorni, mensile ≥27 giorni).
  - **Verificato con test annullati** (login simulato): configurazione di partenza (settimanale, 8); salvataggio e rilettura; frequenza non valida e "0 backup" **rifiutati**; elenco con tipo, eventi, modelli e kB; **cancellare tutti i backup rifiutato**; cancellazione di un backup manuale ok (15 kB liberati); "tieni gli ultimi 5": eliminati 21, liberati ~4 MB; senza login rifiutato. Dopo i test: 27 backup (circa 4,9 MB), nessuna configurazione salvata.
  - **App** (nuova APK): Impostazioni → Database Cloud Supabase → blocco **"🗄️ Backup automatici"** (Ogni quanto: Disattivato / giorno / settimana / mese; Quanti tenerne: 1–60). La finestra "Importa da Supabase" ora mostra per ogni backup data, tipo, eventi, modelli e peso, con 🗑️ per cancellarlo (con conferma) e, in alto, il totale dello spazio e **"Libera spazio: tieni solo gli ultimi N"**.
  - **Regole**: non si può cancellare l'ultimo backup rimasto; i manuali non vengono toccati dalla pulizia automatica; "tieni gli ultimi N" invece vale per tutti i tipi, con conferma.
- **Backup attuali**: 27, ~4,9 MB (circa 180 kB l'uno). Con il piano gratuito non è un problema, ma "tieni gli ultimi 10" porterebbe a ~2 MB.

### Passo 5c — Backup di emergenza per modello (solo DB, scritto prima) 🔄
- **Obiettivo**: oltre ai backup completi (che restano com'è), una copia **per modello**, ogni riga autonoma e leggibile da sola. Serve solo come emergenza.
- **Cosa contiene ogni riga** (tutte le colonne, copiate intere dalle righe, quindi nulla va perso): il modello (titolo, orari, colore e colore personalizzato, posizione/ordine, calendario, rotazione, flag e impostazioni) + **tutti i suoi eventi** (giorno, entrata e uscita, luogo, note, collega, auto, categorie, colore, protezioni) + la rotazione collegata.
- **DB (solo aggiunte)**:
  1. tabella `backup_per_modello` (utente, modello_id, titolo, `creato_il`, `batch_id`, `n_eventi`, `dati jsonb`). RLS attiva, nessun accesso diretto dall'app.
  2. funzione `crea_backup_per_modello()`: una riga per modello con tutti i suoi eventi. Guardie: salta chi non ha dati; non salva se i modelli o gli eventi totali sono meno dell'80% dell'ultima copia; tiene le ultime N copie per modello (N dalla configurazione, di partenza 4); cancella le vecchie solo dopo aver scritto le nuove. Permessi: né `anon` né `authenticated`, solo il sistema.
  3. `pg_cron`: parte insieme al backup automatico.
  4. funzione `ripristina_modello(p_modello_id, p_batch_id)`: per utenti loggati, tutto-o-niente, reinserisce modello ed eventi con gli stessi id; prima salva una copia di sicurezza.
- **App**: nessuna modifica in questo passo (la finestra unica backup viene dopo, con nuova APK).
- **Provo prima**: test annullati (creazione, conteggi eventi per modello, guardia 80%, ripristino, senza login).
- **Annullamento**: `drop function crea_backup_per_modello(); drop function ripristina_modello(uuid,uuid); drop table backup_per_modello;` e togliere il lavoro cron.
- **Eseguito** (16/10): tabella `backup_per_modello` (RLS attiva, nessun accesso diretto), funzioni `crea_backup_per_modello()` e `ripristina_modello(modello, copia)`, lavoro `pg_cron` `backup-per-modello` ogni domenica 03:10 UTC.
- **Scelte**: si tengono le ultime **4** copie per modello (fisso, non dalla configurazione); ogni copia contiene modello, calendario, rotazioni collegate ed **eventi intatti** (tutte le colonne: entrata/uscita, collega, auto, note, colori, categorie); i 6 eventi senza modello restano solo nei backup completi.
- **Verificato con test annullati** (login simulato): copia di tutti i 225 modelli con 1411 eventi (= eventi con modello); guardia 80% **scatta** (copia saltata se i dati calano); ripristino di QUARTINA: 104 eventi ripristinati = 104 attesi, con copia di sicurezza `pre_ripristino`; `anon` non può creare, `authenticated` può ripristinare, senza login **rifiutato**. Dopo i test: 0 righe in `backup_per_modello`, 1417 eventi, 225 modelli.
- **Non ancora fatto**: prima copia reale (parte domenica, o a mano); finestra unica nell'app.
- **Prima copia reale eseguita** (16/10): 225 modelli, 1411 eventi, ~356 kB. Dati invariati (1417 eventi, 225 modelli).

### Passo 5c — finestra backup con copie per modello (DB + app, scritto prima) 🔄
- **Cosa**: nella finestra "Backup disponibili" (già unica per backup completi, spazio, pulizia) aggiungo in fondo la sezione **"🧩 Copie per modello (emergenza)"**: ricerca per nome, per ogni modello data dell'ultima copia e numero di eventi, pulsanti **Ripristina** (solo quel modello con i suoi eventi, con conferma) e **Scarica** (file JSON del solo modello).
- **DB (solo aggiunte)**: `backup_modelli_elenco()` (ultima copia di ogni modello: id, titolo, data, n. eventi, batch) e `backup_modello_dati(modello, batch)` (il JSON di un modello). Solo utenti loggati, solo i propri dati; `anon` escluso. Test annullati prima.
- **App**: nuovo file `src/20-backup-modelli.jsx` (componente isolato) + una riga di inserimento in `02-Modelli.jsx`. Il ripristino usa `ripristina_modello`, poi ricarica i dati da Supabase come il ripristino completo. Nessun cambio a sincronizzazione, scrittura, backup esistenti.
- **Aggiornamento APK**: la build usa sempre la stessa chiave di firma dai secrets e un numero di versione crescente → si installa sopra la vecchia senza disinstallare e senza perdere dati.
- **Annullamento**: ripristinare il commit; `drop function backup_modelli_elenco(); drop function backup_modello_dati(uuid,uuid);`
- **Eseguito** (16/10): DB `backup_modelli_elenco()` e `backup_modello_dati()` (test annullati: 225 modelli in elenco, JSON di un modello con i suoi 7 eventi, senza login rifiutato, `anon` escluso). App: sezione "🧩 Copie per modello (emergenza)" in fondo alla finestra "Backup disponibili" (ricerca, ⬇️ scarica, Ripristina con conferma); nuovo file `src/20-backup-modelli.jsx`; build locale riuscita. Pubblicato con nuova APK.
- **Come provarlo**: Impostazioni → Importa da Supabase → in fondo la sezione copie per modello. Prova ⬇️ su un modello; il Ripristina solo su un modello di prova.

### Passo 5c — correzioni dopo la prova sul telefono (scritto prima) 🔄
- **Richieste**: (1) il pulsante delle copie per modello sta nel blocco Supabase delle Impostazioni (piace dove sta); (2) un modello è sempre **nome + orario**: nell'elenco il nome da solo non basta (4 modelli "AUTO" si distinguono solo dall'orario); (3) sotto "Sincronizza ora" si vede quante modifiche sono da sincronizzare, con una freccia che apre il dettaglio; se non c'è niente: ok.
- **DB (solo aggiunta)**: `backup_modelli_elenco()` restituisce anche `inizio` e `fine` del modello (dalla copia). Test annullato prima.
- **App**:
  1. Pulsante "🧩 Copie per modello (emergenza)" nel blocco "Backup automatici": apre una finestra con l'elenco; la sezione sparisce dalla finestra "Importa da Supabase". Ogni riga mostra **nome + orario** (es. "AUTO · 06:00–14:00"; se non ha orari: "senza orario"); la ricerca trova anche per orario; nome e orario compaiono anche nella conferma di ripristino e nel nome del file scaricato.
  2. Sotto "Sincronizza ora": riga di stato. **"✅ Ok"** se non c'è nulla; altrimenti **"🕓 N da sincronizzare ▾"**. La freccia apre il dettaglio: *da inviare* (modifiche di questo dispositivo in coda, raggruppate per tipo: eventi, modelli, ecc.) e *da ricevere* (novità presenti su Supabase, solo conteggio per tipo, letto con una richiesta di sola lettura quando apri il dettaglio). Il conteggio delle modifiche in coda si aggiorna da solo ogni pochi secondi.
- **Non cambia**: sincronizzazione, scrittura, backup. Solo lettura.
- Annullamento: ripristinare il commit; la funzione DB resta compatibile.
- **Eseguito** (16/10): DB `backup_modelli_elenco()` ora include `inizio`/`fine` (test annullato: 225 modelli, 46 senza orario, es. "AUTO 06:00-12:15 | AUTO 06:30-12:45 | AUTO 06:45-13:00"). App: pulsante "🧩 Copie per modello (emergenza)" dentro il blocco Backup automatici (tolto dalla finestra Importa); elenco con **nome + orario**, ricerca anche per orario; sotto "Sincronizza ora" la riga di stato (✅ Ok / 🕓 N da sincronizzare ▼) con dettaglio da inviare / da ricevere. Build locale riuscita; pubblicato con nuova APK.
- **Nota**: "da ricevere" può includere le tue ultime modifiche finché la prossima sincronizzazione non sposta il punto di partenza.

### Correzione grafica — orario mai spezzato su due righe (16/10) 🔄
- **Richiesta**: se nome + orario stanno su una riga, bene; se servono due righe, l'orario va **tutto** sulla seconda, non diviso a metà.
- **Cosa cambio**: nell'elenco "Copie per modello" l'orario diventa un blocco unico che non si spezza (`inline-block` + `nowrap`): se non ci sta accanto al nome, passa intero a capo. Solo grafica, nessun dato toccato.
- Annullamento: ripristinare il commit.

### Ripristino di PIÙ modelli insieme (16/10) 🔄
- **Richiesta**: ripristinare più modelli contemporaneamente, non uno alla volta.
- **DB (solo aggiunta)**: funzione `ripristina_modelli(p_ids uuid[])`: per utenti loggati, max 300 modelli, richiama `ripristina_modello` per ciascuno **dentro una sola transazione, tutto-o-niente** (se uno fallisce non cambia niente). Ogni modello usa la sua ultima copia e ne salva prima una di sicurezza (`pre_ripristino`). Test annullati: 3 modelli insieme, uno sbagliato fa fallire tutto, senza login rifiutata, `anon` escluso.
- **App**: nell'elenco "Copie per modello" una casella per riga, "Seleziona tutti (quelli filtrati)" / "Nessuno", e il pulsante "Ripristina selezionati (N)" con conferma che dice quanti modelli e quanti eventi. Una sola richiesta; poi ricarica i dati. Il ripristino singolo resta com'è.
- Annullamento: `drop function ripristina_modelli(uuid[]);` e ripristinare il commit.
- **Eseguito** (16/10): DB `ripristina_modelli(uuid[])` (test annullati: 3 modelli insieme = 214 eventi attesi e ripristinati; con un id sbagliato **rifiutata**; senza login rifiutata; `anon` escluso; eventi 1417 prima e dopo). App: caselle, "Seleziona tutti (filtrati)", "Nessuno", pulsante "Ripristina selezionati (N · eventi)" con conferma. Build locale riuscita; pubblicato con nuova APK.

### Tempo reale + regola 80% + pulizia (16/10) ✅
- **DB** (fatto prima del push): funzioni `rls_auto_enable` e `imposta_updated_at` non eseguibili da nessun utente; tabella `eliminati` pulita da sola dopo 15 giorni (`pulisci_eliminati`, ogni giorno 03:30 UTC); Realtime attivo su eventi, modelli, calendari, rotazioni, colori; calendario PROVA (vuoto) eliminato.
- **App**: via il controllo ogni 60 s. La sincronizzazione parte all'apertura, quando torna la linea, quando Supabase Realtime segnala una novità e dopo una riconnessione. Resta in sola lettura e applica solo righe diverse dal locale: le modifiche del dispositivo stesso non cambiano la schermata.
- **Dispositivi fermi da più di 14 giorni**: scarica l'elenco completo e considera eliminato ciò che su Supabase non c'è più.
- **Regola 80%**: se l'aggiornamento cambia più dell'80% dei dati del dispositivo, l'app chiede «continua o annulla» (sostituisce lo stop al 30%). Con «Annulla» non cambia niente; in automatico non richiede più nella stessa sessione.
- Annullamento: ripristinare il commit; Realtime si toglie con `alter publication supabase_realtime drop table ...`.

### Orario di fine dei modelli + pulsanti categoria evento (16/10) ✅
- **Problema**: su Supabase 7 modelli 6h15/6h30 (es. TRIBUNALE) avevano `fine` vuota (il telefono la calcola dalla durata), quindi nelle copie per modello comparivano come «09:30–?».
- **DB**: corrette le 7 righe (inizio + durata); trigger `modelli_completa_fine` completa la fine quando manca; `backup_modelli_elenco` calcola la fine anche per le copie vecchie. Il modello «RECUPERO COMPENSATIVO INTERA GIORNATA» non ha inizio: non toccato.
- **App**: la sincronizzazione non considera differenza una `fine` vuota in locale per i modelli 6h15/6h30 (niente falsi aggiornamenti). Nell'evento, i pulsanti categoria turno e APP/AUTO non hanno più «Automatica» evidenziato né il bordo: il pulsante scelto (anche dall'automatismo) è pieno; ritoccandolo si torna all'automatico.

### «Automatico» tolto + recupero compensativo intera giornata (16/10) ✅
- **Automatico**: tolto anche dal form del modello (turno e APP/AUTO). Se non c'è una scelta, il pulsante deciso dall'automatismo (fascia oraria / «APP» nel titolo) è pieno; ritoccando la scelta fatta si torna all'automatico.
- **RECUPERO COMPENSATIVO INTERA GIORNATA** (modello senza orario): ogni evento scala 6h15 (375 min) dal credito delle PROTRAZIONI A RECUPERO, dal giorno più vecchio (FIFO), anche da più giorni. Nell'evento compare il riquadro «Scalato da» con date e minuti (e «Non coperto» se il credito non basta). Nel report ore, se il modello è incluso, vale -6h15 come «-PROTRAZIONE A RECUPERO». Riconosciuto dal titolo (contiene «RECUPERO COMPENSATIVO» e «INTERA GIORNATA»).
- **Correzione (16/10)**: il pulsante pieno (scelto o deciso dall'automatismo), se ritoccato, passa a «Nessuna»; si può anche premere direttamente «Nessuna». Ripremendo «Nessuna» si torna all'automatico. Vale per evento e per modello (turno e APP/AUTO).

### Fasce orarie: NOTTE inizia alle 18:01 (16/10) 🔄
- **Problema**: 3° TURNO finiva alle 18:00 e NOTTE iniziava alle 18:00: un evento alle 18:00 stava in due fasce. In più `trovaFascia` trattava la fine come esclusa, mentre i valori salvati (360–705, 706–960, 961–1080) sono "fine inclusa": con la nuova regola un orario come 16:00 o 11:45 poteva non trovare nessuna fascia.
- **Cosa cambio**:
  1. Valori predefiniti (`04-Rotazione.jsx`): NOTTE da 1081 (18:01); 3° TURNO resta fino a 1080 (18:00).
  2. `trovaFascia`: la fine delle fasce è **inclusa** (coerente con i valori salvati); nessun buco: 00:00–05:59 notte, 06:00–11:45 mattina, 11:46–16:00 pomeriggio, 16:01–18:00 terzo turno, 18:01–23:59 notte.
  3. `classificaFasciaOrariaModello` (`06-Logica.jsx`): NOTTE da 18:01; 18:00 va nel 3° TURNO.
  4. Impostazioni già salvate: correzione una tantum all'avvio (solo se NOTTE parte alle 18:00 e il 3° TURNO finisce alle 18:00, cioè la sovrapposizione), più la stessa correzione su `user_settings.fasce_automatiche` in Supabase (una sola riga, solo il valore `from` della NOTTE).
- **Non cambia**: colori, nomi, orari delle altre fasce, eventi, modelli.
- **Annullamento**: ripristinare il commit; su Supabase rimettere `from: 1080` alla fascia `notte`.
- **Eseguito** (16/10): codice (default NOTTE 18:01, `trovaFascia` con fine inclusa, classificazione modelli, correzione una tantum all'avvio) e `user_settings.fasce_automatiche` su Supabase (test annullato prima: mattina 360–705 | pomeriggio 706–960 | terzo_turno 961–1080 | notte 1081–359; poi applicato sulla sola riga dell'utente). Build locale riuscita; pubblicato con nuova APK.
- **Nota**: l'ordine automatico per fasce dei modelli (`classificaFasciaOrariaModello`, con i modelli "etichetta" NOTTE/PRIMO/SECONDO/3°TURNO e gli H24 in coda) è scritto fisso nel codice e non legge le Impostazioni: da tenere presente nel doppio ordine A/B.

### Doppio ordine dei modelli A/B (16/10) 🔄
- **Obiettivo**: due ordini indipendenti dei modelli, uguali su tutti i dispositivi. **B = orario** (colonna `sort_order` di oggi, invariata). **A = alfabetico** (colonna NUOVA `sort_order_a`). Spostare un modello scrive solo la colonna dell'ordine attivo; passando da A a B e ritorno ogni ordine ritrova le sue posizioni. La scelta dell'ordine da vedere (A/B) vale **per dispositivo** (non sincronizzata).
- **Staccare le posizioni da impostazioni, colori e orari**: oggi creazione e modifica di un modello riordinano in base alle fasce scritte nel codice e **raggruppano per colore** (`raggruppaPerColore`). Una volta data una posizione non deve più dipendere da quelli. Nuove regole di inserimento (solo alla creazione, e alla modifica se cambia ciò che definisce quell'ordine), mai in fondo e senza toccare gli altri:
  - **A**: subito dopo l'ultimo modello con lo stesso nome; se il nome non esiste, nel punto alfabetico giusto.
  - **B**: subito dopo l'ultimo modello con lo stesso orario di inizio; se l'orario non esiste, fra gli orari vicini. H24 e personalizzati: blocco a sé (H24 dopo l'ultimo H24).
  - Il nuovo modello viene inserito in **entrambi** gli ordini.
  - Niente più raggruppamento per colore né fasce nella creazione/modifica. Il pulsante manuale "Riordina posizione modelli" resta com'è (azione esplicita) e agisce sull'ordine attivo.
- **DB (solo aggiunta)**: colonna `modelli.sort_order_a integer not null default 0`. Riempimento iniziale con **una sola istruzione**: per ogni calendario (blocchi come l'app: N×1.000.000 + posizione×1000), in ordine alfabetico del titolo e, a parità, per orario di inizio; H24 in fondo al calendario. Test annullato prima. Le funzioni di backup/ripristino/`get_changes`/`get_user_data` copiano la riga intera (`to_jsonb`/`json_agg(m)`): la nuova colonna viaggia da sola. Le copie vecchie non la contengono: si ricalcola alfabetica all'avvio se mancano.
- **App** (modo scelto per limitare i rischi): ogni modello in memoria ha `sortOrder` = posizione dell'ordine **attivo** e `sortOrderAltro` = posizione dell'altro ordine. Tutte le funzioni di spostamento/creazione continuano a lavorare su `sortOrder`. Nei punti dove la riga arriva dal database o va al database si usa un solo assistente (`src/21-ordine.js`): lettura → (attivo, altro) secondo la scelta; scrittura di una sola posizione → solo la colonna attiva; scrittura riga intera (Esporta, snapshot) → entrambe le colonne. Cambiando ordine si scambiano i due valori in memoria (nessuna scrittura sul database).
- **Interruttore A/B** in Modelli. **Gruppi a scomparsa**: B = Mattina, Pomeriggio, Terzo turno, Notte (solo 6h15/6h30, orari dalle Impostazioni: Mattina 06:00–11:45, Pomeriggio 11:46–16:00, Terzo turno 16:01–18:00, Notte 18:01–05:59), H24; personalizzati fuori. A = AUTO, APP, D (distaccati: nome che inizia per D). Solo visualizzazione.
- **Rischio**: un punto dimenticato che scrive la colonna sbagliata. Mitigazione: censimento di tutti i punti (`sort_order`/`sortOrder`, ~100), test annullati sul DB, prova sui dati reali.
- **Annullamento**: ripristinare il commit; `alter table modelli drop column sort_order_a;` (le colonne vecchie non vengono mai toccate).

## Giorni importanti (⭐) e festivi personali nella sincronizzazione
- Stanno in `user_settings.extra_hols`, non nelle tabelle controllate da `get_changes`: prima la sincronizzazione automatica non li rileggeva mai (si vedevano sugli altri dispositivi solo dopo un riavvio).
- `eseguiSync` ora rilegge da `user_settings`: `extra_hols`, colore domeniche e festivi, `report_settings` (quartine), colori fasce, festività attive. Applica solo le differenze; compare tra i «Cambiati» come «impostazioni/colori». I giorni importanti si fondono con le operazioni locali in coda.
- Nuovi momenti di controllo: tempo reale su `user_settings` (richiede `realtime-user-settings.sql`, da eseguire una volta) e rientro dell'app in primo piano (max una volta ogni 15 s).
- **Eseguito** (16/10): `user_settings` aggiunta alla pubblicazione `supabase_realtime` (migrazione `realtime_user_settings`). Ora il tempo reale copre calendars, colori, events, modelli, rotazioni e user_settings. Verificato su Supabase che il giorno importante del 20/10/2026 («DENTISTA») è salvato in `extra_hols`.
- Annullamento: ripristinare il commit; il realtime su user_settings si toglie con `alter publication supabase_realtime drop table public.user_settings;`.
- **Eseguito finora** (16/10): colonna `modelli.sort_order_a` creata e riempita (test annullato: 225 aggiornati, 225 valori distinti, min 1.001.000, max 5.001.000; poi applicato; verifica: 225 distinti, 0 a zero; eventi 1417 invariati). Assistente `src/21-ordine.js` e punti di lettura/scrittura in `06-Logica.jsx` in corso. Dopo l'integrazione dei commit 360b5f7/853c089/3c39515 (giorni importanti e colori da `user_settings`) il codice è stato riallineato (rebase pulito).

### Backup del "resto" (cose senza modello) (16/10) 🔄
- **Problema**: le copie per modello contengono solo il modello e i suoi eventi. Restano fuori: gli eventi senza modello (6), i **giorni importanti con stellina e motivo** (`user_settings.extra_hols`), i colori di domeniche/festivi/fasce/quartine e le altre impostazioni (tutto in `user_settings`, ~80 kB), più calendari, rotazioni e colori dei gruppi. I backup completi li contengono già, le copie per modello no.
- **DB (solo aggiunte)**: tabella `backup_resto` (utente, `batch_id` = quello delle copie per modello, data, `dati jsonb`: riga intera di `user_settings`, eventi senza modello, calendari, rotazioni, colori). RLS attiva, nessun accesso diretto. `crea_backup_per_modello()` scrive anche questa riga e tiene le ultime 4. Funzione `ripristina_resto(p_batch_id, p_parti)` (utenti loggati, tutto-o-niente, copia di sicurezza prima) per rimettere a scelta: impostazioni / eventi senza modello. Test annullati prima.
- **App**: nessun cambio finché non lo chiedi (si può aggiungere una riga "Impostazioni e giorni importanti" nella finestra Copie per modello).
- **Eseguito nell'app** (16/10): assistente `src/21-ordine.js`; lettura/scrittura delle posizioni su entrambe le colonne (Esporta, salvataggio posizioni, creazione, modifica, snapshot e ripristino disposizione 360°); regole di inserimento A/B in `06-Logica.jsx` senza colori né fasce (tolto `raggruppaPerColore` dall'assegnazione colori); interruttore A/B nel menu di ordinamento della schermata Modelli (per dispositivo); scambio in memoria cambiando ordine (nessuna scrittura sul database). **Provato con le funzioni vere del progetto** (nuovo modello AUTO 06:30: in B va dopo l'ultimo 06:30, in A dopo l'ultimo AUTO, con UNA sola scrittura e senza spostare gli altri; posizioni uniche in entrambi gli ordini; mappatura delle colonne corretta con ordine attivo A e B). Build locale riuscita.
- **Non ancora fatto**: gruppi a scomparsa (B: Mattina/Pomeriggio/Terzo turno/Notte/H24; A: AUTO/APP/D) e backup del "resto". Da provare sul telefono: cambio A↔B, creazione di un modello, spostamento in A e in B.
- **Backup del "resto" eseguito** (16/10): tabella `backup_resto` (RLS, nessun accesso diretto), `snapshot_resto()`, `crea_backup_per_modello()` ora scrive anche il "resto" (impostazioni intere con giorni importanti/stelline/motivi e colori, eventi senza modello, calendari, rotazioni, colori; ~66 kB per copia; ultime 4, allineate alle copie per modello), `ripristina_resto(copia, parti)` (parti: `impostazioni`, `eventi`; copia di sicurezza prima). **Test annullato** con login simulato: svuotate le impostazioni e cancellati i 6 eventi senza modello, poi ripristinati → giorni importanti uguali, 6 eventi tornati, 1 copia di sicurezza creata, senza login rifiutato, `anon` escluso. Poi creata la prima copia reale (1 riga "resto", 66 kB). Dati invariati: 1417 eventi, 225 modelli.
- **Ancora da fare**: pulsante nell'app per ripristinare il "resto"; gruppi a scomparsa A/B; prova sui telefoni del doppio ordine.

### Gruppi a scomparsa nell'elenco modelli (16/10) 🔄
- **Cosa**: nella scheda Turni della schermata Modelli, intestazioni a scomparsa (▼/▶ con numero di modelli) che nascondono o mostrano i modelli del gruppo. Solo grafica: nessun dato né posizione viene toccato; trascinamento e frecce restano come sono.
- **Ordine B (orario)**: MATTINA, POMERIGGIO, TERZO TURNO, NOTTE (solo modelli 6h15 e 6h30, orari letti dalle Impostazioni, fine inclusa) e H24 (tempo `h24`). I **personalizzati restano fuori** dai gruppi (sempre visibili, fra i turni).
- **Ordine A (alfabetico)**: DISTACCATI (nome che inizia per "D" o "DF" seguito da spazio: 59 modelli, anche se hanno etichetta app/auto), AUTO (etichetta auto), APPIEDATI (etichetta app), ALTRI (il resto, per ora).
- Un'intestazione compare all'inizio di ogni tratto consecutivo dello stesso gruppo; chiudere un gruppo nasconde tutti i suoi modelli. Con la ricerca attiva l'elenco è piatto. Lo stato aperto/chiuso resta salvato sul dispositivo (non sincronizzato).
- **Annullamento**: ripristinare il commit.
- **Eseguito** (16/10): intestazioni a scomparsa nella scheda Turni (B: MATTINA, POMERIGGIO, TERZO TURNO, NOTTE, H24; A: DISTACCATI, AUTO, APPIEDATI, ALTRI); personalizzati fuori dai gruppi; stato aperto/chiuso salvato sul dispositivo; ricerca attiva = elenco piatto; trascinamento e frecce invariati (le righe chiuse sono solo nascoste). Build locale riuscita; pubblicato con nuova APK. Da provare sul telefono.

### Tendine fasce: i modelli etichetta dentro la loro tendina (16/10) ✅
- **Richiesta**: nella scheda Turni, ordine B, la tendina di ogni fascia contiene tutti i 6h15/6h30 **più** il modello H24 etichetta (NOTTE, MATTINA, POMERIGGIO, 3°TURNO). La tendina H24 resta solo per gli altri H24 (QUARTINA, FESTIVO, MALATTIA, ecc.).
- **App**: `gruppoModello` (02-Modelli.jsx) riconosce i 4 titoli etichetta H24 e li mette nel gruppo della fascia.
- **Database**: il modello NOTTE (H24) spostato nell'ordine B da 1000999 a 1002499, cioè subito sotto NOTTE ELETTORALE (1001999). Ordine A (`sort_order_a`) non toccato. Annullamento: rimettere `sort_order = 1000999` al modello NOTTE H24 del calendario TURNI.

### Pulsante A/B e tendine senza modelli fuori (16/10) ✅
- **Pulsante A/B** nell'intestazione di Modelli (scheda Turni), a sinistra di ↑↓: mostra in colore la lettera attiva e con un tocco passa da ordine per orario (B) a ordine alfabetico (A). Prima il menu esisteva nel codice ma nessun pulsante lo apriva.
- **Tendine**: nell'ordine B i modelli senza gruppo (personalizzati, senza orario di inizio) restavano visibili a tendina chiusa. Ora prendono il gruppo del modello che li precede nell'elenco (o del primo che segue, se sono all'inizio): chiudendo una tendina spariscono tutti i suoi modelli. Solo visualizzazione, nessun dato toccato.

### Gruppi personalizzati a tendina (17/10) 🔄
- **Obiettivo**: rendere i gruppi a tendina gestibili dall'utente (creare, eliminare, rinominare, spostare gruppi; spostare modelli fra gruppi, anche in massa), senza dipendere dal codice. Piano completo nel file `PIANO-GRUPPI.md` approvato in chat. Funzionamento uguale in ordine A e B, ma **ogni ordine ha i propri gruppi**.
- **Regole**: «+ Aggiungi gruppo» sotto H24; elimina gruppo accanto al numero dei modelli (i modelli tornano senza gruppo e seguono il loro ordine: orario in B, alfabetico in A); tendina chiusa = le frecce spostano l'intero gruppo; modelli senza gruppo sempre sotto i gruppi. Stato aperto/chiuso per dispositivo (non sincronizzato).
- **Tappe**: 1) gruppi veri (DB + lettura + aggiungi/elimina/rinomina); 2) spostamenti (frecce al bordo, tendine chiuse, trascinamento fra gruppi); 3) selezione multipla (250 ms sposta, 500 ms seleziona, tocchi successivi aggiungono, 250 ms su un selezionato sposta tutti); 4) build APK e prova.
- **DB (solo aggiunte)**: tabella `gruppi_modelli` (`id`, `user_id`, `calendar_id`, `ordine` 'A'|'B', `nome`, `sort_order`, `created_at`, `updated_at`, `deleted_at`), stesse protezioni di `colori` (RLS 4 policy, trigger `updated_at` e registro eliminati, Realtime). Colonne `modelli.gruppo_a` e `modelli.gruppo_b` (uuid, nullabili, **senza vincolo di chiave esterna**: un gruppo mancante vale «senza gruppo» e il ripristino di un backup non può fallire). Funzioni adeguate: `get_user_data` e `get_changes` (chiave `gruppi`), `applica_modifiche` (tabella consentita), `crea_backup_automatico` e `ripristina_backup` (chiave `gruppi_modelli`, solo se presente nel backup). Le copie per modello portano già `gruppo_a`/`gruppo_b` (copiano la riga intera); i gruppi in sé non sono nelle copie per modello.
- **Riempimento iniziale** (una sola istruzione, **test annullato prima**, confronto dei conteggi con quelli visibili oggi): B = MATTINA, POMERIGGIO, TERZO TURNO, NOTTE (6h15/6h30 per fasce delle Impostazioni, più i 4 modelli etichetta H24) e H24; A = DISTACCATI (nome che inizia per D o DF + spazio), AUTO, APPIEDATI, ALTRI. Personalizzati/senza orario in B: senza gruppo (sotto i gruppi).
- **App tappa 1**: stato `gruppi` con cache locale, lettura da `get_user_data`/`get_changes`, Realtime su `gruppi_modelli`, Esporta/Importa/backup che li conoscono; tendine disegnate dai gruppi; «+ Aggiungi gruppo», elimina, rinomina; scritture sempre a blocchi (`applica_modifiche`).
- **Annullamento**: ripristinare il commit; `drop table gruppi_modelli; alter table modelli drop column gruppo_a, drop column gruppo_b;` e rimettere le funzioni com'erano (definizioni salvate in `gruppi-ripristino-funzioni.sql` prima della modifica). Le colonne e le tabelle esistenti non vengono mai toccate.

#### Tappa 1a — database ✅ (verificato 17/10)
- Tabella `gruppi_modelli` (19 gruppi) e colonne `modelli.gruppo_a`/`gruppo_b` (225/225 con gruppo A, 224/225 con gruppo B) presenti su Supabase.
- `get_user_data`, `get_changes`, `applica_modifiche`, `crea_backup_automatico`, `ripristina_backup` conoscono i gruppi.
- Da controllare: il modello senza gruppo B.

#### Tappa 1b-i — app legge e sincronizza i gruppi ✅ (17/10, solo codice, aspetto dell'app invariato)
- Stato `gruppi` (con cache locale), letto da `get_user_data`, sincronizzato da `get_changes` e Realtime su `gruppi_modelli`.
- `posDaRiga` porta in memoria `gruppoA`/`gruppoB` di ogni modello; nuovi helper `mapGruppoDb` e `colGruppo` in `21-ordine.js`.
- Backup Supabase e Esporta: includono i gruppi. Esporta scrive `gruppo_a`/`gruppo_b` e la tabella solo se il telefono conosce dei gruppi (altrimenti non tocca quelli di Supabase) e non elimina mai gruppi.
- Controllo struttura e backup locale conoscono la nuova tabella. Build di prova riuscita.
- Prossimo: **1b-ii** (tendine disegnate dai gruppi, «+ Aggiungi gruppo», elimina, rinomina).

#### Tappa 1b-ii — tendine disegnate dai gruppi veri ✅ (17/10)
- `02-Modelli.jsx`: le tendine arrivano da `gruppi_modelli` (per calendario e per ordine A/B), non più dal codice. Ordine: gruppi per `sort_order`; dentro ogni gruppo i modelli per posizione; **modelli senza gruppo in fondo, sotto tutti i gruppi**. Gruppi vuoti visibili con 0.
- «+ Aggiungi gruppo» in fondo alla lista (nome scritto nella riga, «Crea»/«Annulla»); ✏️ rinomina e 🗑️ elimina accanto al numero dei modelli (conferma prima di eliminare: i modelli NON vengono cancellati, tornano senza gruppo). Visibili solo con un calendario selezionato e senza ricerca; con «tutti i calendari» le tendine con lo stesso nome si uniscono in sola visualizzazione.
- `06-Logica.jsx`: `aggiungiGruppo`, `rinominaGruppo`, `eliminaGruppo`, `gruppiDelCalendario` (scritture a blocchi con `applica_modifiche`, locale aggiornato subito; nomi doppi nello stesso calendario/ordine rifiutati).
- Frecce ▲▼ e trascinamento: per ora solo **dentro lo stesso gruppo** (le frecce scambiano con il modello che si vede accanto). Il passaggio fra gruppi è la tappa 2.
- Controllo sui dati veri: ordine B = 5 tratti contigui = 5 gruppi (nello stesso ordine dei gruppi); ordine A del calendario principale ha i modelli alfabetici mescolati fra i 4 gruppi, quindi ora ogni gruppo si vede compatto (prima le intestazioni si ripetevano).
- Le tendine chiuse/aperte vanno ricordate per dispositivo con chiavi nuove: all'inizio saranno tutte aperte.
- Un nuovo modello nasce **senza gruppo** (in fondo), come da piano.
- Modello KATIA (calendario 6870d81c…) senza gruppo B: corretto, quel calendario non ha gruppi B.
- Build di prova riuscita; **non provata sul telefono** (serve la build della tappa 4).
- Prossimo: **tappa 2** (spostamenti: frecce al bordo che cambiano gruppo, frecce delle tendine chiuse, trascinamento fra gruppi).

#### Tappa 2 — spostamenti ✅ (17/10)
- **Frecce ▲▼ dei modelli** (modalità spostamento ↕): dentro il gruppo scambiano col modello vicino; al bordo il modello passa nel gruppo vicino (su: in fondo al gruppo sopra; giù: in cima al gruppo sotto). Dopo l'ultimo gruppo c'è il blocco «senza gruppo»; dal primo gruppo non si va più su.
- **Frecce ▲▼ delle tendine chiuse** (solo con tendina chiusa e modalità spostamento): spostano l'intero gruppo fra i gruppi dello stesso calendario/ordine (scambio dei `sort_order`, in una richiesta a blocchi).
- **Trascinamento**: su un modello di un altro gruppo = entra in quel gruppo davanti a quel modello; sull'intestazione di un gruppo (anche chiuso) = in fondo a quel gruppo; sulla zona «in fondo» = senza gruppo, in fondo. Con la ricerca attiva resta il vecchio riordino semplice.
- Funzione nuova `spostaModelloInGruppo` (06-Logica.jsx): inserisce il modello fra i vicini del gruppo di arrivo mantenendo fermi gli altri modelli (algoritmo «fermi» già in uso: di norma **1 sola scrittura**, che comprende anche `gruppo_a`/`gruppo_b`); gruppo di arrivo vuoto = cambia solo l'appartenenza. Funzione `spostaGruppo` per i gruppi.
- Provato in isolamento: 1 solo modello cambiato per spostamento, ordini nei gruppi corretti (anche verso «senza gruppo» e verso gruppi con più modelli). Build di prova riuscita. **Da provare sul telefono.**
- Annullamento: ripristinare il commit di questa tappa (nessuna modifica al database).
- Prossimo: **tappa 3** (selezione multipla: 500 ms seleziona, tocchi per aggiungere/togliere, 250 ms sposta tutti insieme).

#### Correzione tappa 1/2 — gruppi «spariti» sul telefono (17/10) ✅
- **Sintomo**: dopo l'installazione i modelli risultavano tutti «senza gruppo» (in fondo). Il database era integro (19 gruppi, 225 modelli assegnati, nessuna eliminazione).
- **Causa**: l'app parte dai dati locali e la sincronizzazione porta solo le righe cambiate dopo il punto di partenza del telefono; i gruppi erano nati su Supabase prima di quel punto, quindi un telefono con dati già salvati non li riceveva mai. Non l'avevo previsto.
- **Correzione**: `caricaGruppiUnaVolta` (06-Logica.jsx): una volta per dispositivo legge da Supabase tutti i gruppi e le colonne `gruppo_a`/`gruppo_b` dei modelli e applica solo ciò che è diverso. Solo lettura; non parte se ci sono modifiche locali non inviate; il flag `turnipm_gruppi_caricati_v1` si segna solo a lettura riuscita (altrimenti riprova ogni 20 s). Esito nel Log («Caricati N gruppi…»).
- Dati su Supabase mai toccati da questa correzione.

#### Tappa 3 — selezione multipla in modalità spostamento ✅ (17/10)
- **Gesti** (modalità spostamento ↕, con un calendario selezionato e senza ricerca): pressione **250 ms** = sposta il modello (come prima); se il dito resta **fermo fino a 500 ms** il trascinamento si annulla e il modello viene **selezionato** (vibrazione doppia, spunta ✓ e bordo colorato). Con una selezione attiva il **tocco** su un modello lo aggiunge o lo toglie; **250 ms su uno dei selezionati** e trascinamento = si spostano **tutti insieme** (badge ×N sul fantasma, gli altri selezionati semitrasparenti). Se il dito si muove prima dei 500 ms resta un trascinamento normale. Su computer: Ctrl/Maiusc + clic aggiunge alla selezione.
- **Arrivo**: i modelli entrano nel gruppo in cui vengono lasciati, come blocco, nello stesso ordine in cui si vedevano (prima i gruppi, poi senza gruppo): su un modello = davanti a quel modello; su un'intestazione di gruppo (anche chiusa) = in fondo al gruppo; sulla zona «in fondo» = senza gruppo. Rilasciati su uno dei selezionati = nessuno spostamento.
- **Uscita dalla selezione**: pulsante «Annulla selezione» (barra in basso) oppure uscire dalla modalità spostamento; si azzera anche cambiando calendario, ordine A/B o scrivendo nella ricerca. Dopo uno spostamento la selezione resta (si può spostare ancora).
- **Codice**: `spostaModelliInGruppo` (06-Logica.jsx), stessa logica «fermi» di `spostaModelloInGruppo`: UNA richiesta a blocchi (`applica_modifiche`) che porta posizioni e `gruppo_a`/`gruppo_b`; stato `selSpost` e `riordina` in 02-Modelli.jsx; timer dei 500 ms in `ModelloCard` (04-Rotazione.jsx). Frecce ▲▼ dei singoli modelli invariate.
- **Provato in isolamento** su dati con la stessa struttura del calendario principale (198 modelli, 5 gruppi): 3 modelli sparsi = 3 scritture; 5 contigui = 5; 20 modelli = 20; verso «senza gruppo» = solo appartenenza; ordine crescente sempre rispettato e ordine relativo mantenuto. Build di prova riuscita. **Nessuna modifica al database** (controllato: tabella `gruppi_modelli` con 19 gruppi presente su Supabase). **Da provare sul telefono.**
- **Annullamento**: ripristinare il commit di questa tappa (nessuna modifica al database).
- Prossimo: **tappa 4** (build APK e prova sui telefoni, lista di controllo in `PIANO-GRUPPI.md`).

#### Correzioni dopo la prova sul telefono (17/10) ✅
- **Telefono, selezione multipla**: tenendo premuto un modello GIA' selezionato oltre i 500 ms il trascinamento si annullava (si perdeva l'aggancio). Ora sui modelli gia' selezionati il passaggio «da sposta a seleziona» non c'e' piu': si tiene premuto quanto si vuole e si trascina. Resta valido per i modelli non ancora selezionati.
- **PC, mouse**: tenere premuto 500 ms SENZA muovere il mouse seleziona il modello (il tocco semplice poi aggiunge/toglie, Ctrl/Maiusc + clic come prima). Se il mouse si muove parte il trascinamento di sempre (col mouse non c'e' l'attesa dei 250 ms: si trascina subito). Trascinando un modello selezionato si spostano tutti.
- **Nuovo modello nel gruppo giusto** (`gruppoPerRegola`, 06-Logica.jsx): un modello nuovo non nasce piu' «senza gruppo» ma nel gruppo previsto dalle regole di sempre, **in fondo ai modelli simili** (stesso orario in B, stesso nome in A: la posizione e' quella gia' usata). Ordine B: H24 con nome NOTTE/MATTINA/POMERIGGIO/3 TURNO = quella fascia, altri H24 = H24; 6h15/6h30 = fascia dell'orario di inizio (MATTINA, POMERIGGIO, TERZO TURNO, NOTTE); personalizzati senza orario = senza gruppo. Ordine A: nome che inizia per D/DF + spazio = DISTACCATI; categoria AUTO = AUTO; categoria APP = APPIEDATI; altrimenti ALTRI. Il gruppo si cerca per NOME fra i gruppi del calendario: se il gruppo non esiste (o e' stato rinominato/eliminato) il modello resta senza gruppo. Gruppi creati a mano (es. ACCERTAMENTI) non ricevono modelli in automatico.
- **Modifica di un modello**: se cambia cio' che ne definisce il posto (orario/tipo in B, nome/tipo in A, calendario) viene rimesso anche nel gruppo giusto di quell'ordine, come gia' avveniva per la posizione. Se non cambia nulla il modello resta dove l'hai messo.
- Scrittura: il nuovo modello porta `gruppo_a`/`gruppo_b` gia' nell'insert; le modifiche vanno a blocchi con le posizioni (`salvaModificheModelliEGruppi`). Nessuna modifica al database. Regole provate in isolamento (9 casi) e nomi dei gruppi controllati su Supabase. **Da provare sul telefono.**
- **Piano B** (se la regola per nome desse problemi): tornare alla logica dei gruppi scritta dall'app (commit `87132f3`, ultimo prima della tappa 3), nessuna modifica al database da annullare.
- **PC, rilascio sulle cartelle** (17/10): le intestazioni dei gruppi ora accettano il rilascio col mouse e si evidenziano (sfondo e bordo colorato) quando ci passi sopra, come sul telefono. Il modello trascinato, o tutti i selezionati, entrano in fondo a quel gruppo, anche se la tendina e' chiusa. Prima col mouse si poteva rilasciare solo sopra le card dei modelli.

#### Ordine alfabetico (A): gruppi automatici per nome, niente gruppi in alto (17/10) 🔄
- **Decisione**: in ordine A i gruppi non stanno piu' sopra con i modelli «senza gruppo» sotto. L'elenco e' **un'unica lista in ordine alfabetico**: i modelli singoli stanno al loro posto e, dove ci sono **2 o piu' modelli consecutivi con lo stesso nome**, si forma in automatico un gruppo (tendina) con quel nome. Esempio: ALTO IMPATTO (singolo), AUTO (gruppo di 3), CONSIGLIO COMUNALE (singolo).
- **Come e' fatto**: solo visualizzazione (02-Modelli.jsx, `autoNome`): nessun dato nuovo nel database. Il gruppo e' una serie di modelli con lo stesso titolo uno dopo l'altro; un modello nuovo con lo stesso nome entra gia' dopo l'ultimo con quel nome (regola di inserimento di sempre), quindi finisce dentro il gruppo. Tendine aperte/chiuse per dispositivo, come prima.
- **In ordine A non ci sono piu'**: «+ Aggiungi gruppo», rinomina/elimina gruppo, frecce delle tendine, selezione multipla verso i gruppi (non c'e' un gruppo dove spostare). Frecce ▲▼ e trascinamento dei modelli: scambio semplice di posto, come prima della tappa 1. I gruppi personalizzati di ordine A (AUTO, APPIEDATI, ALTRI, DISTACCATI, ACCERTAMENTI…) restano nel database ma non si vedono.
- **Ordine B (orario)**: invariato (gruppi veri MATTINA/POMERIGGIO/…, poi i modelli senza gruppo). Da decidere se vale anche li' la lista unica.


#### Ordine A: tendine automatiche per regola (17/10) ✅
- **Regole** (solo visualizzazione, 02-Modelli.jsx, `classe`; nessun dato nel database; i gruppi veri di ordine A non si usano e restano nascosti): vale la prima che corrisponde. 1) APP: nome che inizia per APP · 2) AUTO: inizia per AUTO · 3) DISTACCATI: inizia per D · 4) FESTIVI: inizia per F · 5) PI: inizia per PI / P.I. · 6) H24: tipo h24 · 7) PERSONALIZZATO: tipo personalizzato · 8) altri: lettera iniziale (accenti ignorati; cifre/simboli = «#»). APP/AUTO alla FINE del nome non contano.
- **Nuovi inserimenti**: nessuna scelta del gruppo; il modello nuovo (o con nome/tipo cambiato) cade da solo nella tendina giusta, in ordine alfabetico (`gruppoPerRegola` in ordine A restituisce sempre «senza gruppo»).
- **Ordine B**: invariato (gruppi veri, «Sposta nel gruppo» per la selezione).
- **Spiegazione nell'app**: pulsante ℹ️ in Modelli (a sinistra di A/B) con queste regole.
- `sort_order_a` riordinato alfabetico per calendario (copia del vecchio ordine in `bk_ordine_a_modelli`; vecchi gruppi A in `bk_ordine_a_gruppi`).

### Backup: i gruppi (`gruppi_modelli`) nel backup del "resto" (17/10) 🔄
- **Perché**: regola permanente «i backup seguono lo schema». Le copie per modello ricordano `gruppo_a`/`gruppo_b` di ogni modello, ma non i gruppi veri (nome, ordine, posizione, calendario): se un gruppo viene eliminato, un modello ripristinato resta con un gruppo che non esiste più.
- **DB (solo modifica di due funzioni, nessuna tabella nuova)**: `snapshot_resto()` salva anche tutte le righe di `gruppi_modelli` dell'utente (chiave `gruppi_modelli`); `ripristina_resto(copia, parti)` accetta la parte `gruppi`: **non cancella nulla**, reinserisce o aggiorna per id (nome, ordine, calendario, posizione) e toglie `deleted_at`; i gruppi creati dopo la copia restano. Copia di sicurezza prima, come per le altre parti. Se la copia è vecchia (senza gruppi) la parte `gruppi` viene rifiutata con un messaggio chiaro. Non ci sono vincoli FK fra `modelli` e `gruppi_modelli` (verificato): nessun effetto collaterale sui modelli.
- **Provo prima** (test annullato, login simulato): copia → elimino i gruppi → ripristino `gruppi` → stessi gruppi e stesse posizioni; senza login rifiutato; `anon` escluso. Poi creo una copia reale che li contiene.
- **App**: nessun cambio.
- **Backup**: questo passo è esso stesso l'adeguamento del backup.
- **Annullamento**: rimettere le definizioni precedenti di `snapshot_resto` e `ripristina_resto` (nel piano 16/10, sezione «Backup del resto»).
- **Eseguito** (17/10): `snapshot_resto()` e `ripristina_resto()` aggiornate (migrazione `backup_resto_gruppi`). **Test annullato** (login simulato): 40 gruppi → cancellati tutti → ripristinati 40, identici per id, nome, ordine, posizione e calendario; assegnazioni dei modelli (`gruppo_a`/`gruppo_b`) invariate; copia vecchia (senza gruppi) **rifiutata** con messaggio chiaro; senza login rifiutato; `anon` escluso. Poi creata la copia reale (batch `c655d72c…`): contiene 40 gruppi come quelli attuali. Dati invariati: 225 modelli, 1418 eventi.
- **Backup**: adeguamento fatto. `disposizione_auto` e `impostazioni_backup` verificate: sono già copie di sicurezza (storico delle disposizioni e copia delle impostazioni), quindi escluse di proposito; nessuna modifica al database.

### Versione e numero di build uguali su telefono (APK) e PC (web) (17/10) 🔄
- **Problema**: giorno uguale, ma ora (HHMM) e `#` diversi. Cause: (1) la versione usa la data dell'**ultimo commit**, anche se è solo un documento: il sito web (Vercel) può partire da un commit più recente di quello da cui è stata fatta l'APK (i commit `[skip ci]` non avviano l'APK); (2) il `#` è un contatore diverso: l'APK usa il numero di esecuzione della build (es. 129), il web il numero totale di commit.
- **Cosa cambio** (stessa formula ovunque, dipende solo dal contenuto del codice):
  1. **Versione** = data dell'ultimo commit che ha toccato il codice (`src public index.html package.json package-lock.json vite.config.js capacitor.config.ts android api electron vercel.json`); i commit del piano e dei documenti non la cambiano.
  2. **Numero `#`** = quanti commit hanno toccato quei percorsi, uguale su web e APK. Nel workflow «Build APK» il numero passa da «numero di esecuzione» a questo conteggio (stesso valore per `__BUILD_NUM__` e per il titolo della release, così l'avviso di aggiornamento resta coerente).
  3. File toccati: `vite.config.js` (formula), `aggiorna_versione_e_build.py` (stesso elenco di percorsi per `versionName`/`versionCode`; non riscrive più `vite.config.js` se contiene `PERCORSI_CODICE`), `.github/workflows/build-apk.yml` (calcolo del numero).
- **Effetto atteso**: dopo questa modifica APK e web, compilati dallo stesso codice, mostrano **la stessa stringa** (es. `6.290.0512#NNN`). Il numero `#` cambierà una volta (da 129 al nuovo conteggio): è normale.
- **Rischi**: l'avviso di aggiornamento confronta solo la versione (`a.ggg.hhmm`), che continua a crescere a ogni commit di codice; `versionCode` cresce allo stesso modo. Se Vercel non riesce a recuperare lo storico completo si ripiega sulla data dell'ultimo commit e sul conteggio via API (può restare una differenza).
- **Annullamento**: ripristinare il commit.

### Numero `#` uguale su APK e PC: il sito legge il numero della build APK (17/10) 🔄
- **Richiesta**: il `#` deve essere lo stesso su telefono e PC. Vercel non fornisce al codice un numero progressivo (solo un id di deploy), quindi non si può usare «il numero di Vercel».
- **Cosa cambio**: l'APK torna a usare il numero di esecuzione della build (`github.run_number`, come prima, e come nel titolo della release). Il **sito web** alla compilazione chiede a GitHub quale build APK ha compilato lo stesso codice: cerca l'ultimo commit che ha toccato il codice, prende il numero della build APK di quel commit (la più recente non fallita) e lo mostra come `#`. Così APK e web mostrano lo stesso `#N`, anche dopo commit del solo piano. La versione `a.ggg.hhmm` resta quella del commit di codice (già uguale).
- **Se la richiesta a GitHub non riesce** (limite di richieste, rete) o per quel commit non c'è build APK (`[skip ci]`): si ripiega sul conteggio dei commit di codice (come adesso). In quel caso il `#` può differire.
- **File**: `vite.config.js` (nuova funzione), `.github/workflows/build-apk.yml` (rimesso `APK_BUILD_NUM` = numero di esecuzione).
- **Annullamento**: ripristinare il commit.
- **Eseguito** (17/10): `vite.config.js` chiede a GitHub la build APK dell'ultimo commit di codice; workflow con `APK_BUILD_NUM` = numero di esecuzione. **Provato in locale** sul commit 6c4792a: il sito produce `6.290.0556#130`, uguale alla release APK 130. Pubblicato con nuova APK.

### Pulsante nell'app per ripristinare il «resto» (17/10) 🔄 (scritto prima)
- **Cosa**: nella finestra «Copie per modello» (Impostazioni → Supabase) una sezione a scomparsa «⚙️ Il resto»: si sceglie una copia (data) e le parti da ripristinare: **Impostazioni** (giorni importanti, colori delle fasce, festività…), **Eventi senza modello**, **Gruppi dei modelli**. Nessuna parte è spuntata di default.
- **DB (solo aggiunta, sola lettura)**: funzione `backup_resto_elenco()` → elenco delle copie (data, n. eventi senza modello, se hanno impostazioni, n. gruppi); login richiesto, `anon` escluso. `ripristina_resto` esiste già e non cambia: prima salva una copia «pre_ripristino» dello stato attuale; impostazioni ed eventi senza modello vengono sostituiti, i gruppi non cancellano nulla.
- **App** (`20-backup-modelli.jsx`): conferma con l'elenco delle parti; si ferma se ci sono modifiche non ancora inviate; dopo il ripristino ricarica l'app con il pull da Supabase (stesso meccanismo del ripristino modelli).
- **Annullamento**: ripristinare il commit; la funzione `backup_resto_elenco` si può togliere con `drop function`.
- **Eseguito** (17/10): migrazione `backup_resto_elenco` (provata con login simulato, test annullato: 2 copie, la più recente con 6 eventi senza modello e 40 gruppi); sezione «⚙️ Il resto» in `20-backup-modelli.jsx`. **Da provare sul telefono** (non provato con un vero ripristino, per non toccare i dati).

### Controllo ordine modelli nelle liste collegate (17/10)
- **Problema trovato**: le frecce ▲▼ delle tendine (`spostaGruppo`) cambiano solo la posizione del gruppo, non quella dei modelli. La lista Modelli seguiva i gruppi, ma tutte le altre liste (`modelliOrdinati`) restavano sull'ordine puro dei modelli. In ordine A le tendine automatiche (APP, AUTO, … lettere) c'erano solo nella lista Modelli. In più: nella schermata Colori e nel selettore colore i modelli già assegnati finivano in cima; nel «Cancella per modello» l'ordine era alfabetico.
- **Correzione (solo lettura, nessun dato cambiato)**: nuova `calcolaOrdineVisuale` in `06-Logica.jsx` = stesso ordine della lista Modelli (tendine nell'ordine in cui si vedono, poi senza gruppo; in A le tendine automatiche). `modelliOrdinati` usa questa. Seguono la lista: colori (assegna colore e selettore), selettori modello nell'evento, rotazioni, report (elenchi modelli), ordine degli eventi nel giorno, cancella per modello. Le funzioni che riscrivono le posizioni restano su `calcolaOrdineModelli`.
- **Colori**: tolto «gli assegnati in cima» (restano visibili con la spunta). Provato con dati finti: spostando una tendina le liste la seguono.
- **Annullamento**: ripristinare il commit.
- **Correzione (17/10)**: rimesso «gli assegnati a quel colore in cima» (schermata assegna colore e selettore colore): era una funzione voluta e non andava tolta. Ora: assegnati in cima, poi gli altri; in entrambe le parti l'ordine è quello della lista Modelli.

### Cinque rifiniture facoltative (17/10) 🔄 (scritto prima)
**1. Finestra con l'esito di «Importa da Supabase».** Oggi, se la protezione scarta i dati, l'esito sta solo nel Log. Aggiungo una finestra grande (come quella di Esporta) con titolo, avanzamento ed esito: «Importato: N eventi, M modelli…» oppure «NON applicato» con il motivo e i numeri. Solo interfaccia; la logica di Importa non cambia.

**2. Frequenza e numero delle copie per modello, dall'app.** DB (solo aggiunte): colonne `backup_config.modelli_frequenza` (disattivato/giornaliero/settimanale/mensile, di partenza settimanale) e `modelli_max` (1–30, di partenza 4); funzioni `backup_modelli_config_leggi()` e `backup_modelli_config_salva(frequenza, max)` (login, solo i propri dati; non cambiano le funzioni già usate dall'app). `crea_backup_per_modello(p_forza boolean default false)` legge la configurazione (salta chi è disattivato o se non è ancora il momento: giornaliero ≥20 h, settimanale ≥6 giorni, mensile ≥27 giorni; con `p_forza` crea comunque), tiene le ultime `modelli_max` copie (anche per «il resto»). Il lavoro `pg_cron` passa da «domenica» a «ogni giorno 03:10 UTC» (decide la funzione). App: nel blocco «Backup automatici», una seconda coppia di scelte «Copie per modello: ogni quanto / quante tenerne».

**3. Data dell'ultimo backup riuscito + avviso.** DB: `backup_stato()` (login) restituisce data dell'ultimo backup completo, dell'ultima copia per modello e del «resto», e gli avvisi: se la frequenza non è «disattivato» e l'ultimo backup è più vecchio di 1,5 volte il periodo (+ 1 giorno), «⚠️ Il backup … non parte da N giorni». App: nel blocco «Backup automatici» due righe con data/ora e ✅ oppure ⚠️ in rosso.

**4. Singole modifiche a blocchi (i due cicli rimasti).** «Ripristino modello orfano» e «Rimozione colore» scrivono ancora una richiesta per riga in sequenza: passano a `scriviBatchConBackup` (una richiesta, tutto-o-niente, ripiego sulla scrittura una per una se il blocco è rifiutato). Le modifiche di un solo evento/modello restano singole: con una sola riga non c'è raffica e il comportamento noto resta.

**5. Togliere le colonne `deleted_at` inutilizzate.** Da `events`, `modelli`, `calendars`, `rotazioni`, `colori` (mai usate dall'app: nessun riferimento nel codice, in indici, viste o policy). Verificato che `ripristina_backup` toglie già la chiave `deleted_at` dalle righe (`x - 'deleted_at'`) e che le copie vecchie la contengono ma `jsonb_populate_*` ignora le chiavi sconosciute. **Resta** `gruppi_modelli.deleted_at` (parte del progetto gruppi, usata da `ripristina_resto`) e `bk_ordine_a_gruppi`. Test annullato prima (ripristino da una copia che contiene ancora la chiave).

- **Backup**: nessuna tabella nuova; le colonne di configurazione stanno in `backup_config` (esclusa di proposito: è configurazione, non dati).
- **Annullamento**: ripristinare il commit dell'app; `alter table <t> add column deleted_at timestamptz;` per le 5 tabelle; `drop function backup_modelli_config_leggi(), backup_modelli_config_salva(text,int), backup_stato();` rimettere `crea_backup_per_modello()` senza parametri e il lavoro cron di domenica; `alter table backup_config drop column modelli_frequenza, drop column modelli_max;`
- **Eseguito** (17/10) — DB: colonne `backup_config.modelli_frequenza`/`modelli_max`, funzioni `backup_modelli_config_leggi/salva`, `backup_stato`, `crea_backup_per_modello(p_forza)` che rispetta la configurazione, lavoro cron ogni giorno 03:10 UTC. **Test annullato** (login simulato): configurazione di partenza (settimanale, 4), salvataggio e rilettura, frequenza «boh», 0 e 31 copie **rifiutate**, copia saltata se recente o se disattivato, copia forzata che tiene solo 1, avviso «Il backup completo non parte da 30 giorni» con un backup finto di 30 giorni fa, senza login rifiutato, `anon` escluso. **`deleted_at` tolta** da `events`, `modelli`, `calendars`, `rotazioni`, `colori` (test annullato prima: ripristino modello da copia che contiene ancora la chiave, `get_changes`, `get_user_data` e `ripristina_backup` funzionano; dati invariati). Restano `gruppi_modelli.deleted_at` e `bk_ordine_a_gruppi`.
- **Difetto trovato dal test e corretto**: `ripristina_backup` falliva con i backup vecchi (fatti prima della colonna A) perché `modelli.sort_order_a` era NOT NULL e le copie vecchie non lo contengono. Ora la colonna ammette NULL (migrazione `modelli_sort_order_a_nullable`); l'app tratta NULL come 0. **Nota**: ripristinando un backup vecchio, le posizioni A tornano vuote (da riordinare); le copie nuove le contengono.
- **App**: blocco «Copie per modello» (frequenza e quante tenerne) e «Ultimo backup riuscito» (completo e per modello, ⚠️ + avviso in rosso se non parte) nelle Impostazioni → Backup automatici (`src/22-backup-stato.jsx`); finestra con l'esito di «Importa/ricaricamento da Supabase» (titolo, esito, numeri o motivo del rifiuto; compare anche offline e quando la protezione scarta i dati); «Rimozione colore» usa la scrittura a blocchi già esistente (`assegnaColoreAModelli`: modelli + eventi + posizioni in una richiesta); «Ripristino modelli mancanti» collega gli eventi in UNA richiesta tutto-o-niente. Restano singole, di proposito, le eliminazioni delle protrazioni figlie (1–3 righe) e le modifiche di un solo evento/modello. Build locale riuscita.
- **Backup**: nessuna tabella nuova.

### Tendine e pulsante A/B in tutte le liste che richiamano i modelli (17/10)
- **Richiesta**: stesso sistema della lista Modelli (tendine a scomparsa + scelta ordine A/B, senza matita/cestino) in «Scegli modello» e in tutti i menù che elencano i modelli.
- **Nuovo file `src/23-tendine-modelli.jsx`** (componente unico): `ElencoModelliTendine` (stessa regola delle tendine della lista Modelli: B = gruppi veri poi senza gruppo; A = classi automatiche APP/AUTO/DISTACCATI/FESTIVI/PI/H24/PERSONALIZZATO/lettere; tutti i calendari = gruppi con lo stesso nome uniti; con la ricerca elenco piatto; «Apri/Chiudi tutti»; ogni lista ricorda le tendine aperte con `turnipm_tendine_aperte_<lista>`), `PulsanteOrdineAB` (uguale a quello di Modelli) e `ContestoTendine` (ordine, gruppi, calendario principale forniti una volta da `01-App.jsx`).
- **Dove è applicato**: Scegli modello (con A/B accanto al +), schermata assegna colore (A/B in cima; in alto «✓ ASSEGNATI A QUESTO COLORE», sotto le tendine con gli altri), selettore colore con spunte (stesso schema + A/B), selettori modello delle rotazioni (`ModelloSelector`), liste modelli dei report (2 in `05-Comuni.jsx`, picker modelli report in `03-Calendario.jsx`), form evento «Cambia modello turno» e lista con «Libero» (`02-Modelli.jsx`).
- **Non toccato**: la lista Modelli (resta com'è), «Copie per modello», menu a tendina «Cancella per modello» (è un elenco a scelta, non una lista di righe).
- **Nessun dato cambiato** (solo visualizzazione). Provato con dati finti: B → NOTTE / MATTINA / senza gruppo; A → APP / H24 / L; ricerca piatta; nessun errore senza contesto.
- **Annullamento**: ripristinare il commit.

### Ordine A: dentro ogni tendina i modelli in ORDINE DI INIZIO (17/10)
- **Richiesta**: individuata la tendina (APP, AUTO, DISTACCATI, FESTIVI, PI, H24, PERSONALIZZATO, lettere) i modelli dentro vanno in ordine di orario d'inizio, non alfabetico.
- **Regola**: ora d'inizio crescente; senza orario (es. H24) in fondo; a parità resta l'ordine alfabetico già presente. Vale solo per l'ordine A (le tendine automatiche); l'ordine B non cambia.
- **Dove**: `21-ordine.js` (nuove `minutiInizio`, `ordinaPerInizio`), lista Modelli (`02-Modelli.jsx`), tutte le liste a tendine (`23-tendine-modelli.jsx`), ordine visuale per colori/selettori/ordine eventi del giorno (`calcolaOrdineVisuale` in `06-Logica.jsx`). Solo visualizzazione: nessun dato del database cambiato.
- **Provato** con dati finti: PI → 07:00, 07:00, 13:30, 15:30, senza orario in fondo.
- **Annullamento**: ripristinare il commit.
- **Correzione (17/10, build seguente alla 137)**: la 137 non cambiava nulla sul telefono perché per il calendario TURNI esistono nel database **17 gruppi veri dell'ordine A** (A, APP, AUTO, C, DISTACCATI, E, FESTIVI, H24, PERSONALIZZATO, PI, N, O, P, R, S, T, U, con i modelli assegnati): quando ci sono, l'app usa quelli e non le tendine automatiche, dove avevo messo l'ordine di inizio. Ora l'ordine di inizio vale anche per i gruppi veri dell'ordine A (lista Modelli, `23-tendine-modelli.jsx` sia per un calendario sia per tutti insieme, `calcolaOrdineVisuale`). Prima non l'avevo verificato sui dati reali: ho provato solo le tendine automatiche.
- **Effetto da sapere**: in ordine A il riordino a mano dei modelli dentro una tendina non ha più effetto visibile (l'ordine è per orario); resta possibile spostare un modello in un altro gruppo. Ordine B invariato.
- **Provato** con i modelli veri del gruppo C (11): 00:00 06:00 07:00 07:30 08:00 12:00 12:30 13:45 14:45 15:45 17:45, con calendario scelto e con tutti i calendari; ordine B invariato.

### Ordine A sbloccato + nuovo modello in coda al gruppo più numeroso (18/10) 🔄 (scritto prima)
- **Richiesta**: (1) l'ordine per orario d'inizio forzato dentro le tendine dell'ordine A (commit 3262117/c40bce6) ha **bloccato lo spostamento a mano**: i modelli si devono poter mettere dove si vuole, e l'app ricorda la posizione; (2) per un **modello nuovo** in ordine A: va in coda al gruppo (tendina) che ha **più modelli con lo stesso orario d'inizio**; (3) ovunque compaia un nome di modello va mostrato anche l'orario.
- **Esempio 1**: gruppi A(1 modello alle 7), B(1 alle 8), C(2 alle 7), D(1 alle 9); nuovo modello alle 7 → in coda a C (fra C e D). **Esempio 2**: A(1 alle 7), B(1 alle 8), C(1 alle 7), D(1 alle 9): parità fra A e C → in fondo all'elenco, in coda all'ultimo gruppo (dopo D). Stessa regola di parità se nessun gruppo ha quell'orario.
- **Cosa cambio**: (a) tolgo l'ordinamento forzato per inizio dentro le tendine A (lista Modelli, `23-tendine-modelli.jsx`, `calcolaOrdineVisuale`): dentro la tendina vale la posizione salvata, quindi frecce e trascinamento tornano ad avere effetto e l'ordine resta memorizzato su Supabase (`sort_order_a`); (b) creazione di un modello: nuova funzione che sceglie gruppo e posto come sopra (solo se esistono gruppi veri A; con le tendine automatiche resta la regola per nome); il gruppo A del modello è quello scelto; (c) testo «Come funzionano ordine e gruppi» aggiornato.
- **Non cambia**: ordine B, modifica di un modello esistente, database (nessuna scrittura nuova: stesse colonne).
- **Annullamento**: ripristinare il commit.
- **Eseguito** (18/10): tolto l'ordinamento forzato per inizio dentro le tendine A (lista Modelli, `23-tendine-modelli.jsx`, `calcolaOrdineVisuale`); nuova `postoNuovoModelloA` per la creazione (con gruppi veri A): gruppo con più modelli allo stesso orario, parità/nessuno → in coda all'ultimo gruppo; passata a `posizionaInOrdine` come indice forzato (una sola scrittura, nessun altro modello spostato). **Provata con i due esempi della richiesta**: esempio 1 → gruppo C, indice 4 (fra C e D); esempio 2 (parità) → gruppo D, indice 4 (dopo D, in fondo); nessun modello a quell'orario → in fondo. Il **Log** ora scrive sempre il nome con l'orario (es. «PI F APP 07:00–13:15»): `diffModelli` e `diffDisposizione` in `04-Rotazione.jsx`. Testo «Come funzionano ordine e gruppi» aggiornato. Build locale riuscita; pubblicato con nuova APK. Da provare sul telefono: spostare un modello dentro una tendina A (la posizione deve restare), creare un modello.

### Tutto MAIUSCOLO in ogni campo di testo (18/10) 🔄 (scritto prima)
- **Richiesta**: in qualsiasi punto dell'app, in qualsiasi campo dove si può digitare (ricerca, nomi, note…), quello che si scrive in minuscolo deve diventare MAIUSCOLO.
- **Come**: un solo modulo globale (`src/24-maiuscolo.js`, caricato all'avvio da `09-main.jsx`), senza toccare i singoli campi: (1) ascolta ogni digitazione e riscrive il testo in maiuscolo, mantenendo il cursore e facendo arrivare il valore già maiuscolo a React (quindi anche il valore salvato è maiuscolo); (2) durante la composizione della tastiera (suggerimenti Android) converte appena la parola è confermata; (3) imposta `autocapitalize="characters"` così la tastiera Android scrive già in maiuscolo; (4) stile `text-transform: uppercase` come rete di sicurezza visiva (non sui segnaposto).
- **Esclusi** (maiuscolo romperebbe il campo): password, email, indirizzi (URL Script Google Sheets), numeri, date, orari, file, colori, e qualsiasi campo con `data-no-upper`.
- **Non cambia**: i dati già salvati in minuscolo (cambia solo ciò che si digita da ora in poi); database nessuna modifica.
- **Annullamento**: ripristinare il commit.
- **Eseguito** (18/10): `src/24-maiuscolo.js` + attivazione in `09-main.jsx`. **Provato** in un ambiente simulato con React (campo controllato): scrivendo «pi avvocata» lo stato di React riceve «PI AVVOCATA», il cursore resta dov'era e il campo ha `autocapitalize="characters"`; il campo «URL Script Google Sheets» resta in minuscolo. Build locale riuscita; pubblicato con nuova APK. Da provare sul telefono con la tastiera vera (suggerimenti Android).

### Turnazione: in un giorno conta solo la prima riga (TURNI prima di FU) (18/10) 🔄 (scritto prima)
- **Regola già presente**: se il calendario TURNI ha, in un giorno, un evento che passa il filtro del report, gli eventi del calendario FU di quel giorno non vengono contati (`fuDaSaltare`).
- **Problema** (dagli screenshot di ottobre): se la prima riga del giorno è un articolo, una ferie, un RC recupero o un PI recupero (modelli che il report Turnazione non conta), il FU veniva contato lo stesso. Esempi: 03/10 «ART. 32 + FU SECONDO», 07/10 «ART. 40 + FU PRIMO», 19/10 «PI RC + FU SECONDO».
- **Cosa cambio**: nel solo report **Turnazione**, se il calendario TURNI ha **qualsiasi** evento nel giorno (non solo quelli che passano il filtro), i FU di quel giorno **non** vengono contati: conta solo la prima riga. `fuDaSaltare` riceve un parametro opzionale (`qualsiasiEvento`), usato solo da `computeTurnazioneForReport`.
- **Non cambia**: gli altri report (conteggio, ore, indennità, viabilità, ticket) restano con la regola di prima; nessun dato salvato.
- **Atteso sui dati di ottobre**: FU PRIMO da 6 a 5 giorni (via il 07/10), FU SECONDO da 5 a 3 (via il 03/10 e il 19/10).
- **Annullamento**: ripristinare il commit.
- **Eseguito** (18/10): `fuDaSaltare(calMap, passa, qualsiasiEvento)` e chiamata con `true` solo in `computeTurnazioneForReport`; gli altri 5 report invariati. Controllo sugli screenshot: il 01/10 «AUTO + FU SECONDO» già non contava il FU (il 01/10 non è nell'elenco FU SECONDO); con la modifica non contano più il 03/10 (ART. 32), il 07/10 (ART. 40) e il 19/10 (PI RC). Build locale riuscita; pubblicato con nuova APK. Da controllare sul telefono: FU PRIMO 5 giorni, FU SECONDO 3.

### «Filtra modelli»: in testa i modelli selezionati (18/10) 🔄 (scritto prima)
- **Richiesta**: aprendo «Filtra modelli» del report si devono vedere **in testa i modelli già selezionati**, nell'ordine attivo (A o B), e poi partono le tendine; i selezionati in una tendina «SELEZIONATI».
- **Cosa cambio**: `ElencoModelliTendine` (`23-tendine-modelli.jsx`) riceve un parametro opzionale `selezionati` (elenco di id). Se ci sono modelli selezionati e non si sta cercando, in cima a ogni calendario compare una tendina **✅ SELEZIONATI (n)**, aperta di partenza (lo stato aperto/chiuso si ricorda), con i modelli selezionati di quel calendario **nell'ordine attivo** (stesso ordine delle tendine sotto: gruppi A o B e posizioni salvate). Toccando un modello nella tendina lo si toglie dalla selezione (sparisce dalla tendina, resta con la sua casella nel gruppo). Le tendine sotto restano com'erano. Il parametro è usato solo da «Filtra modelli» (`03-Calendario.jsx`); gli altri elenchi non cambiano.
- **Non cambia**: dati, calcolo dei report, database.
- **Annullamento**: ripristinare il commit.
- **Eseguito** (18/10): `selezionati` in `ElencoModelliTendine` + uso in `03-Calendario.jsx` («Filtra modelli»). **Provato** con dati di esempio (rendering del componente): selezionati «DUE» e «AUTO» scelti in ordine inverso → la tendina SELEZIONATI li mostra nell'ordine attivo B (AUTO della MATTINA, poi DUE del POMERIGGIO); senza selezione e con la ricerca attiva la tendina non compare. Build locale riuscita; pubblicato con nuova APK.

### Tendine: freccia a destra e «seleziona tutto il gruppo» a sinistra (18/10) 🔄 (scritto prima)
- **Richiesta** (da «Filtra modelli»): nell'intestazione delle tendine la **freccia (▼/▶) va a destra**, e **a sinistra** una casella per **selezionare / deselezionare tutto il gruppo** in un colpo solo.
- **Cosa cambio**: nel componente unico `ElencoModelliTendine` (`23-tendine-modelli.jsx`): intestazione = `[casella gruppo] NOME ........ numero ▼`. La casella compare solo negli elenchi che la richiedono (parametro opzionale `onSelezionaGruppo`, usato da «Filtra modelli»): piena = tutti i modelli del gruppo selezionati, «–» = alcuni, vuota = nessuno; toccandola si selezionano tutti (se non lo erano) o si deselezionano tutti; non apre né chiude la tendina. La freccia a destra vale per **tutti** gli elenchi a tendine (stesso sistema ovunque).
- **In «Filtra modelli»** (`03-Calendario.jsx`): `toggleGruppo` aggiorna la configurazione del report in **una sola scrittura**: negli altri report i modelli del gruppo si aggiungono/tolgono da `modelliInclusi`; in **Turnazione** i modelli «di default» si tolgono/rimettono da `modelliEsclusi`, gli altri si aggiungono/tolgono da `modelliAggiunti` (come fa già il tocco su un singolo modello).
- **Non cambia**: il calcolo dei report, il database.
- **Annullamento**: ripristinare il commit.
- **Eseguito** (18/10): freccia a destra in tutte le tendine; casella «seleziona tutto il gruppo» a sinistra in «Filtra modelli» (`onSelezionaGruppo` → `toggleGruppo`, una sola scrittura; Turnazione gestita con `modelliEsclusi`/`modelliAggiunti`). **Provato** con dati di esempio: casella prima del nome e freccia dopo il numero; stati vuota / parziale («–») / piena («✓» e titolo «Deseleziona tutto il gruppo»); senza il parametro nessuna casella. Build locale riuscita; pubblicato con nuova APK. Da provare sul telefono: selezionare un gruppo intero in un report normale e in Turnazione.

### Report: numero accanto a «Filtra modelli», «nessun modello» e «Aggiungi sottomenu» semplificato (18/10)
- **Numero accanto a «Filtra modelli»**: quando non c'è filtro (= tutti i modelli) ora si vede quanti sono (modelli dei calendari del report, compresi quelli aggiunti dal filtro). Con filtro si vede il numero scelto; con nessun modello si vede 0. Prima con «tutti» non compariva nulla (`03-Calendario.jsx`).
- **Zero modelli selezionabili**: prima, togliendo tutti i modelli dal filtro, la lista tornava vuota = «tutti». Ora «nessun modello» è un valore a parte: nella lista `modelliInclusi` si salva `["__nessuno__"]` (nessun evento ha quell'id, quindi tutti i calcoli esistenti lo trattano come «nessun evento» senza toccarli). Vale per: tolta l'ultima spunta (anche per gruppo), tocco su «Tutti i modelli» quando è già attivo (passa a zero; toccato di nuovo torna a tutti), interruttore «incluso nel report» nella scheda modello (`02-Modelli.jsx`, `04-Rotazione.jsx`), report turnazione con tutti i modelli esclusi (`06-Logica.jsx`, `computeTurnazioneForReport`). Report già salvati: nessun cambio (lista vuota = tutti, come prima).
- **«+ Aggiungi sottomenu»** (`05-Comuni.jsx`, le due card con «Per collega / Per modello / Libero»): un tocco crea un solo sottomenu libero **senza nome e senza gruppi** (prima: scelta fra 3 tipi e due gruppi «Gruppo A/B» già pronti). I gruppi si creano dentro con «+ Aggiungi gruppo» (es. 1° e 2° turno, APP e AUTO). Nome vuoto: mostrato «SENZA NOME», campo con segnaposto «NOME (FACOLTATIVO)». I sottomenu «Per collega/Per modello» già creati restano e funzionano; la card Guadagni/Indennità (con Viabilità e Ticket) non è stata toccata.
- **Annullamento**: ripristinare il commit.
- **Correzione «Aggiungi sottomenu» (18/10)**: avevo tolto per errore la scelta del tipo (avevo letto «una sola fattispecie» come «un solo tipo»). Ripristinata la scelta **Per collega / Per modello / Sottomenu libero** nelle due card. Il sottomenu libero ora nasce **senza nome, con UN solo gruppo (senza nome, segnaposto «NOME GRUPPO») che contiene già i modelli scelti nel filtro del report principale** (se il filtro è «tutti», parte vuoto); altri gruppi con «+ Aggiungi gruppo». Resta da definire (domanda aperta all'utente): gruppi automatici 1° turno / 2° turno / APP / AUTO scelti da «Aggiungi gruppo», senza percentuali, e se un sottomenu può contenere modelli fuori dal filtro del report principale (oggi no: i sottomenu dividono solo gli eventi già inclusi dal filtro).
- **Sottomenu libero uguale ai gruppi della Turnazione (18/10)**: il sottomenu libero non ha più l'involucro «nome del sottomenu + gruppo dentro» (si apriva due volte). Ora è un blocco di righe come «1° TURNO ▼ 63% 52»: nome del gruppo scritto una sola volta nella riga (si apre già la tastiera sul nuovo gruppo), totale, freccia. La freccia apre **tutti i modelli del report**: in cima «✓ NEL GRUPPO» con quelli del gruppo (all'inizio i modelli scelti nel filtro del report principale), sotto tutti gli altri a tendine (stesso sistema della lista Modelli, A/B) con una spunta per aggiungerli; un modello già in un altro gruppo mostra «· in NOME» e la spunta lo sposta. «+ Aggiungi gruppo» aggiunge un altro gruppo collegato; la **percentuale compare solo quando i gruppi sono 2 o più**. Cestino sull'unico gruppo = elimina tutto il sottomenu. Componente `SottomenuLibero` in `05-Comuni.jsx` (fondo file), usato dalle due card (conteggio turni e ore).
- **Calcolo** (`06-Logica.jsx`, `computeConteggioForReport` e `computeMinutiForReport`): un evento il cui modello è assegnato a un gruppo di un sottomenu libero **conta in quel gruppo anche se il modello è fuori dal filtro del report principale**; in quel caso non entra nel totale generale, né nel «Per modello», né nel «Per collega». Gli altri tipi (per collega, per modello) e gli altri report non cambiano.
- **Da provare sul telefono** (non provato): crea sottomenu libero, scrivi 5€, apri la freccia, spunta modelli anche fuori dal filtro e controlla il totale del gruppo.
- **Riga del gruppo più compatta (18/10)**: tolto il pulsante tratteggiato «+ Aggiungi gruppo» sotto al blocco. Il **+** sta ora nella riga, fra il cestino e la freccia, così il cestino è lontano dalla freccia e dal + e non si preme per sbaglio (`SottomenuLibero` in `05-Comuni.jsx`). Il + aggiunge un altro gruppo collegato, come prima.

### Report — correzioni dalle foto del 18/10 ✅
- **Filtra modelli non sincronizzato (156 qui, 168 sul telefono)**: la configurazione dei report (`conteggio_configs`, dentro `user_settings`) veniva salvata su Supabase ma la sincronizzazione automatica non la rileggeva mai: ogni dispositivo teneva la propria. Ora `eseguiSync` la rilegge (anche col tempo reale) e la applica solo se il server ne ha una diversa da quella del dispositivo (confronto indipendente dall'ordine delle chiavi, mai sovrascritta con un valore vuoto; non parte se ci sono modifiche locali non inviate). Nessuna modifica al database.
- **Turnazione, regola «prima riga»**: se TURNI (calendario principale) fa parte dei calendari del report e quel giorno ha almeno un evento, conta solo la sua prima riga — la stessa che il calendario mostra per prima (ordine dei modelli, poi orario) — anche con più calendari selezionati; se la prima riga non passa i filtri quel giorno non conta nulla. Se quel giorno TURNI non ha eventi, o non è selezionato, si somma sui calendari del report. Sostituisce la vecchia regola «TURNI esclude solo i FU». Provata in isolamento (5 casi).
- **Filtra modelli, gruppi**: accanto al nome di ogni gruppo ora si vede «selezionati / totale» (es. 3/10) invece del solo totale.
- **Turnazione**: PER MODELLO e PER COLLEGA sono menu espandibili, chiusi di partenza, con il totale accanto al nome; aperto/chiuso ricordato per dispositivo.
- **Piano incentivante (sottomenu libero)**: accanto al nome di ogni tendina (APP, AUTO, H24…) c'è la casella «seleziona tutto il gruppo»: assegna in un colpo solo tutti i modelli della tendina al gruppo.
- Annullamento: ripristinare il commit.

### Report — seconda correzione dalle foto del 18/10 (sera) ✅
- **Turnazione, aggiungere calendari non deve cambiare il numero dei turni** (22 → 32 → 51 con PR e COT). Causa: la regola della prima riga valeva solo nei giorni in cui TURNI ha eventi; negli altri giorni si sommavano gli eventi degli altri calendari. Ora, se TURNI fa parte dei calendari del report, conta **solo la prima riga di TURNI di ogni giorno** e gli altri calendari non contano mai (nemmeno nei giorni senza eventi TURNI). Se la prima riga non passa i filtri, quel giorno non conta. Se TURNI **non** è tra i calendari del report: somma degli eventi dei calendari selezionati. Provata in isolamento (aggiungere PR/COT lascia il totale invariato).
- **Turnazione, «seleziona tutto il gruppo»**: dentro 1° TURNO, 2° TURNO, APP e AUTO i modelli non sono più un elenco piatto ma le tendine della lista Modelli (NOTTE, MATTINA, …) con la tendina SELEZIONATI in testa; accanto al nome di ogni tendina c'è la casella «seleziona / deseleziona tutto il gruppo» e il conteggio selezionati/totale. Una sola scrittura della configurazione per tutto il gruppo.
- Annullamento: ripristinare il commit.
#### Ordine A: nuova decisione IN SOSPESO (17/10) ⏸️
- **Richiesta**: in ordine alfabetico i gruppi devono essere la **prima lettera** (A, B, C…), non piu' i gruppi per nome uguale; tutti i modelli in ordine alfabetico, con controllo dell'appartenenza ai gruppi.
- **Stato**: lavori fermati su richiesta. **Nessuna modifica fatta** al database (solo letture di controllo: 225 modelli, 198 nel calendario principale con posizioni da rinumerare in ordine alfabetico) e **nessuna modifica al codice** oltre al commit `19749bd` (gruppi automatici per nome uguale).
- **Se si riprende**: (1) copia di sicurezza di `modelli.sort_order_a`; (2) rinumerare `sort_order_a` in ordine alfabetico per calendario (stesso confronto dell'app, passo 1000); (3) in ordine A tendine per prima lettera (# per cifre e simboli), modelli in ordine alfabetico dentro; (4) l'inserimento di un modello nuovo in A non separa piu' gli H24; (5) controllo finale dell'appartenenza.

#### Turnazione: ogni giorno conta la prima riga di qualsiasi calendario (18/10) ✅
- **Regola nuova** (`computeTurnazioneForReport`, 06-Logica.jsx): per ogni giorno si conta **una sola riga, la prima che si vede nel calendario fra i calendari del report**, di qualsiasi calendario e modello. I calendari sono nell'ordine in cui compaiono (TURNI per primo se ha eventi quel giorno, poi FU, poi gli altri); dentro un calendario vale l'ordine dei modelli e poi l'orario. Prima contava solo la prima riga di TURNI e i giorni senza eventi in TURNI (es. solo FU) restavano vuoti.
- **Giorno vuoto**: se la prima riga non e' conteggiabile (modello non selezionato in «Filtra modelli», escluso, collega o override «escluso») il giorno **resta vuoto**: non si passa alla riga successiva.
- **Filtra modelli invariato**: per contare ART 32, ART 40, PI RC, RS, NL o i FU (PRIMO, SECONDO, NOTTE, 3°TURNO) quando sono la prima riga, quei modelli devono essere selezionati nel filtro.
- Gli altri report (conteggi, per modello, per collega) non cambiano.
- Annullamento: ripristinare il commit.

#### Report: tendina SELEZIONATI in ordine di inizio turno (18/10) ✅
- In ordine A la tendina **SELEZIONATI** (Filtra modelli e gruppi della Turnazione) mostra i modelli scelti in **ordine di inizio turno** (ora d'inizio crescente, senza orario come gli H24 in fondo), non piu' per classe (prima APP, poi AUTO...): es. AUTO 06:00, AUTO 06:45, APP 07:00, AUTO 07:15, poi FU. A parita' di orario resta l'ordine delle tendine sotto. Le tendine di classe sotto non cambiano. In ordine B invariato (23-tendine-modelli.jsx).
- Annullamento: ripristinare il commit.

### Report: periodo personalizzato per report e fasce modificabili dell'Indennità di servizio (18/10) ✅
- **Repo aggiornato** prima di lavorare (pull dei commit dell'altra chat). La casella «seleziona tutto il gruppo» accanto alle tendine nel sottomenu libero (richiesta dalla prima foto) l'aveva già fatta l'altra chat (commit 66367d2 / b20e8dc): non rifatta.
- **Periodo personalizzato per report** (es. Piano incentivante): nuovo pulsante «📅 Periodo» a sinistra di «Filtra modelli». Si scelgono Dal / Al; vale solo per quel report e al posto del periodo scelto in alto; «Usa il periodo generale» lo toglie. Salvato in `cfg.intervallo` ({from,to}) dentro la configurazione del report (si sincronizza con le altre impostazioni dei report). `getReportRange(cfg)` in `06-Logica.jsx` lo applica a conteggio turni, ore turno, turnazione, indennità, viabilità, ticket e straordinari. Con periodo personalizzato il pulsante mostra le date.
- **Fasce dell'Indennità di servizio modificabili** (nuovo `src/24-fasce-indennita.js`): per ogni fascia si modificano **nome** (es. Festivo, Feriale, Domenica), **orario da → a** (anche a cavallo della mezzanotte), **giorni** (Lun, Mar, Mer, Gio, Ven, Sab, Dom, Festivi) con scorciatoie «Feriale / Sabato / Domenica / Festivo», e il compenso per ora; si possono aggiungere («+ Aggiungi fascia») ed eliminare fasce. Salvate in `cfg.fasceIndennita` del report. Senza modifiche valgono le 4 fasce di sempre (Diurno 06-22 e Notturno 22-06 dal lunedì al sabato; Festivo e Notturno festivo la domenica e nelle festività) e il risultato è identico a prima (provato su 4608 casi, 0 differenze, anche a cavallo della mezzanotte).
- **Regole**: una festività infrasettimanale usa le fasce con «Festivi» (se ce ne sono), altrimenti conta il giorno della settimana; se due fasce si sovrappongono vale la prima della lista; i minuti fuori da ogni fascia non vengono pagati. Il report «Guadagni» usa le fasce del primo report Indennità e somma ore × compenso di tutte le fasce.
- **Da provare sul telefono**: cambiare nome/orario/giorni di una fascia e controllare le ore e il totale stimato; impostare un periodo su un report e controllare che gli altri restino sul periodo generale.
- Annullamento: ripristinare il commit.
- **Fasce Indennità: spostare e scelte rapide (18/10, sera)**: ▲▼ su ogni fascia per cambiare l'ordine (conta anche per le sovrapposizioni: vale la prima), cestino distanziato dalle frecce; nuove scelte rapide per l'orario accanto a Feriale/Sabato/Domenica/Festivo: «Diurno 06–22» e «Notturno 22–06»; in fondo «Ripristina le 4 fasce di sempre» (compare solo se le fasce sono state modificate; i compensi restano). Dalla foto dell'utente: la fascia NOTTURNO aveva selezionata solo «Dom» (le ore notturne lun–sab non venivano contate): con «Feriale» si rimettono Lun–Sab.

### Indennità di servizio: fasce standard del CCNL, pulsanti, percentuali (19/10) ✅
- **Regole del CCNL Funzioni Locali (16/11/2022) applicate come fasce standard** (partenza, tutte modificabili): Festivo infrasettimanale (tutta la giornata, 100%), Notturno festivo (22–06, 50%), Festivo (06–22, 30%), Notturno (22–06, 30%), Diurno (06–22, 10%). Notturno-festivo = dalle 22 del prefestivo alle 6 del festivo e dalle 22 del festivo alle 6 del giorno dopo (quindi sabato 22–24, domenica 00–06, domenica 22–lunedì 06). Fonti: ARAN / CCNL, riepilogo FP CGIL e lentepubblica. Non verificato se il CCNL 2022-24 o il contratto decentrato del Comune cambiano questi valori: tutto modificabile.
- **Pulsanti per fascia** (`24-fasce-indennita.js`): giorni **L M M G V S D** (ne basta uno; nessuno = ogni giorno) + pulsanti **NOTTURNO / FESTIVO / INFRASETTIMANALE** che devono valere tutti quelli scelti; scorciatoie «L–D» (tutti i giorni) e «Tutti/Nessuno» (tutti i pulsanti insieme). I pulsanti si possono **aggiungere e togliere** («✎ Modifica» → ✕ per togliere, «+ Nuovo pulsante» = nome + data fissa ogni anno, es. SAN GENNARO 19/09). Tolti i pulsanti figurativi Feriale/Sabato/Domenica/Festivo e Diurno 06–22/Notturno 22–06.
- **Ogni minuto vale per il giorno in cui cade**; vale la prima fascia della lista che combacia (le frecce ▲▼ cambiano la priorità); i minuti fuori da ogni fascia non si pagano.
- **Importi**: per ogni fascia % e € per ora, entrambi modificabili; campo «Retribuzione oraria base» + «Applica %» calcola gli € di tutte le fasce (base × %). I compensi già inseriti restano (stesse chiavi diurno/notturno/festivo/notturno_festivo); «infrasettimanale» è nuovo.
- **Le fasce provvisorie salvate nei giorni scorsi** (senza i nuovi pulsanti) non valgono più: parte l'elenco standard. «Ripristina» è in fondo.
- **Provato** con 12 turni di esempio (sabato→domenica, domenica→lunedì, festività infrasettimanale e sua vigilia, pulsante personale): tutti come attesi.
- Annullamento: ripristinare il commit.

### Indennità: aumenti per data, percentuali per periodo e convenzione degli orari (19/10) ✅
- **Regole confermate dall'utente**: festivo infrasettimanale = **100% per tutta la giornata, senza altre maggiorazioni** (prima fascia, esclusiva); domenica 22:00 → lunedì 06:00 = notturno festivo; sabato 22–24 = notturno festivo (sera prima della domenica, dal CCNL); venerdì 22 → sabato 06 = notturno normale. Il lunedì 00–06 dopo una domenica è notturno festivo (vale anche per ogni giorno dopo una festività).
- **Convenzione orari**: **00:00 = inizio giornata** (minuto 0), **24:00 = fine giornata** (il minuto dopo le 23:59 = 1440). L'inizio è incluso, la fine è esclusa; fine prima dell'inizio (22:00 → 06:00) = oltre la mezzanotte. I campi orario ora sono testo HH:MM (accettano 24:00 nel campo «a»; il selettore di sistema non lo permette). La fascia infrasettimanale standard è **00:00 → 24:00**. Il vecchio «00:00 → 00:00» continua a valere tutta la giornata (compatibilità); inizio = fine in ogni altro caso = nessuna ora conteggiata (avviso rosso nella fascia).
- **Aumenti per data** (`24-fasce-indennita.js`: `periodiDi`, `tariffaOraria`; `06-Logica.jsx`: `computeIndennita`): nuova card «Retribuzione oraria e aumenti» con periodi «Dal [data] → € all'ora» e, aprendo «%», percentuali diverse per fascia in quel periodo (se vuote valgono quelle standard della fascia). Ogni turno usa il periodo in vigore **nel giorno in cui inizia**; gli arretrati si inseriscono con la data passata. € all'ora di una fascia = retribuzione × percentuale; prima del primo periodo, o senza periodi, vale il compenso fisso in € della fascia (campo «€ fisso»). Il report calcola gli importi giorno per giorno: mostra € per fascia e «Totale stimato»; il report Guadagni usa lo stesso totale (`calc.importi`). Le ore non cambiano.
- **Da provare sul telefono**: aggiungere due periodi (es. dal 01/01/2025 e dal 01/04/2026) e controllare che un report a cavallo usi i due importi; cambiare la percentuale di una fascia in un solo periodo.
- Annullamento: ripristinare il commit.
- **Correzione fasce (19/10, sera)**: dalla foto dell'utente in ogni fascia erano selezionati tutti i pulsanti (anche NOTTURNO + FESTIVO + INFRASETTIMANALE insieme): le condizioni valgono tutte insieme, quindi le fasce quasi non contavano nulla. Cause: il pulsante «Tutti» selezionava anche le condizioni. Ora: **«Tutti» tolto** (restano «L–D» per i giorni e «Nessuno»); sopra i pulsanti due didascalie («GIORNI · UNO QUALSIASI», «CONDIZIONI · DEVONO VALERE TUTTE INSIEME») e avviso rosso se sono selezionate tutte le condizioni; versione fasce portata a **v:3**: le fasce salvate prima vengono ignorate e riparte l'elenco standard pulito (retribuzioni, aumenti e percentuali dei periodi restano). Lunedì: 00–06 dopo la domenica = notturno festivo, 06–22 diurno, 22–24 notturno normale.
