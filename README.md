# Calendario Turni

Calendario Turni aiuta chi lavora su turni a organizzare il proprio orario di lavoro e gli impegni personali in un unico calendario. L'interfaccia e' in italiano; il progetto prevede versioni web, Android e Windows.

## Funzionalita'

- Piu' calendari, modelli di turno e schemi di rotazione.
- Eventi, report e impostazioni personali.
- Backup e importazione dei turni da immagini o PDF.
- Integrazione facoltativa con Google Sheets.
- Web app installabile e build per Android e Windows.

Prova la [demo web](https://turni-alpha.vercel.app).

## Avvio in locale

Requisiti: Node.js 22 o successivo e npm.

1. Copia `.env.example` in `.env`.
2. Imposta `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` con i valori del tuo progetto Supabase. La chiave anon/publishable e' destinata all'uso nel browser; non inserire mai una chiave `service_role` in una variabile `VITE_`.
3. Nell'SQL Editor di Supabase esegui `schema.sql` e `colori.sql`. Esegui gli altri script SQL solo se devi attivare la funzionalita' descritta.
4. Avvia l'app:

   ```sh
   npm ci
   npm run dev
   ```

Per eseguire i controlli e creare una build web:

```sh
npm test
npm run lint
npm run build
```

Le procedure di rilascio Android e Windows sono documentate negli script e nel workflow GitHub del repository.

## Dati e privacy

- Eventi, modelli di turno, rotazioni, impostazioni e backup sono salvati nel progetto Supabase configurato. Le policy RLS degli script SQL mirano a limitare ogni account ai propri record.
- `usage_stats` salva `user_id`, `last_active` e `login_count`: sono dati di utilizzo collegati all'account, non anonimi. La funzione `get_app_stats()` restituisce conteggi aggregati all'amministratore configurato.
- RLS non equivale a cifratura end-to-end. Il proprietario del progetto Supabase o un amministratore del database con accesso privilegiato puo' accedere ai dati. L'app non cifra i calendari in modo che solo i dispositivi dell'utente possano decifrarli.
- La sessione di autenticazione Supabase e' conservata nel local storage del browser; i dati mantenuti sul dispositivo possono essere accessibili a chi ha accesso al dispositivo o al relativo profilo.
- Quando si sceglie l'estrazione dei turni, l'immagine o il PDF selezionato viene inviato tramite l'API dell'app a Google Gemini per l'elaborazione.
- Se si configura la sincronizzazione con Google Sheets, i dati sincronizzati vengono inviati all'endpoint Apps Script configurato dall'utente.

Queste note descrivono il comportamento tecnico attuale; non sostituiscono un'informativa privacy completa su titolare del servizio, basi giuridiche, conservazione e diritti degli utenti.

## Verifiche RLS

La CI esegue un test statico sugli script SQL del repository: controlla che ogni tabella creata abiliti RLS e abbia policy per utenti autenticati, con verifiche di proprieta' anche sui riferimenti tra calendari, modelli, rotazioni ed eventi.

Il test statico non dimostra che il progetto Supabase online abbia lo stesso schema o le stesse policy. Prima di un rilascio, usa due account di prova in un progetto Supabase non di produzione:

1. Crea calendari e record diversi con ciascun account.
2. Verifica che ogni account possa leggere, modificare ed eliminare i propri record.
3. Con la sessione autenticata dell'account A, prova a leggere gli ID noti dei record dell'account B e a creare o modificare eventi, modelli e rotazioni che facciano riferimento ai record di B. Le letture non devono restituire record altrui e le scritture con riferimenti incrociati devono essere rifiutate.
4. Ripeti le prove per backup, impostazioni, statistiche di utilizzo e colori personalizzati.

Non usare l'SQL Editor di Supabase per verificare l'isolamento tra utenti: il suo ruolo amministrativo puo' bypassare RLS. Non usare account di produzione o dati reali del calendario per queste prove.
