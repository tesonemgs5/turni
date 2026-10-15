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
