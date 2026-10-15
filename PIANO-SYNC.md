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
| 3b | L'app la usa per le raffiche (riordino modelli/rotazioni/colori, cambio colore dei gruppi) | App | ✅ pubblicato 15/10 (da provare sui telefoni) |
| 3c | Le altre raffiche (propagazione colori agli eventi, normalizzazioni, creazione modello, ripristino disposizione) | App | ✅ pubblicato 15/10 (da provare sui telefoni) |
| 4 | Vincoli e rifiuti del server: analisi + correzione del nome di colonna sbagliato | App (DB invariato) | ✅ pubblicato 15/10 |
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
