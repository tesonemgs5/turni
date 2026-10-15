# Riepilogo lavori — app "turni" (14–15 ottobre 2026)

Repo: `tesonemgs5/turni` (React + Vite + Capacitor Android + Supabase, progetto `yzhrhemoklvpglmrgald`, regione eu-central-1).
Ultimo commit pubblicato: **5950ea0** (build APK n. 97 riuscita). Locale e GitHub coincidono.
Dettaglio passo per passo, con i test: vedi `PIANO-SYNC.md`.

---

## 1. Il problema di partenza
- "Esporta su Supabase" **non esportava niente**: leggeva Supabase e ne salvava una copia nei backup, senza mai scrivere i dati del telefono.
- Il vecchio "Ripristino backup" aveva creato 3 serie di calendari doppi e lasciato Supabase con **402 eventi su 1416**.
- "Importa da Supabase" sembrava non fare nulla: la protezione scartava i dati incompleti e lo scriveva solo nel Log.
- Il salvataggio su Google Sheets non partiva nell'APK (usava un indirizzo che esiste solo sul sito web) e l'errore era silenzioso.
- Riordinare un modello poteva generare fino a ~225 richieste a Supabase; molte altre raffiche simili.

## 2. Cosa è stato fatto

### Dati recuperati
- Supabase ripristinato **dalla copia delle 13:07** dopo aver verificato con impronte che coincideva col backup locale: 1416 eventi, 225 modelli, 5 calendari, 4 rotazioni, 29 colori. I 16 calendari doppi sono spariti.

### App (commit pubblicati)
| Commit | Cosa |
|---|---|
| 13b3403 | Posizioni dei modelli con **buchi** (passo 1000, blocco 1.000.000 per calendario): spostare un modello = 1 sola scrittura |
| 3ffed72 | **Google Sheets**: salvataggio automatico dopo ogni modifica (anche modelli/posizioni), funziona nell'APK, errori nel Log; terza spunta 📊 nel Log |
| 87c8ad0 | **Esporta su Supabase** ora scrive davvero i dati del telefono, toglie i doppioni, salva prima una copia di sicurezza e verifica i conteggi |
| d7d2cec | **Ripristino backup** corretto: copia di sicurezza prima, ordine di cancellazione giusto, si ferma se una cancellazione fallisce, id originali |
| 07bdc9d | **Backup locale**: controllo automatico (conta i dati nel file e li confronta con l'app) |
| df7d328 | Esporta: **finestra grande** con avanzamento ed esito |
| 0ea94d9 | Esporta: **protezione** — si ferma se il dispositivo ha meno dell'80% dei dati di Supabase |
| 268fe57 | **Sincronizza ora**: scarica solo le novità (`get_changes`), con cursore e protezioni |
| 7bc2d04 | **Scrittura a blocchi** (riordino modelli/rotazioni/colori, cambio colore gruppi) in 1 richiesta |
| fd35c98 | Scrittura a blocchi, altri 8 punti (propagazione colori agli eventi, normalizzazioni, creazione modello, ecc.) |
| 1295eba | Corretti i nomi di colonna sbagliati `turno_vuoto`/`app_auto_vuoto` (causa dei "208 respinti") |
| 5950ea0 | **Sincronizzazione automatica**: le novità arrivano da sole (apertura, ritorno nell'app, linea, ogni 60 s); interruttore SÌ/NO; punto di partenza automatico |

### Supabase (modifiche al database, tutte solo aggiunte o correzioni di sicurezza)
1. `get_user_data` **chiusa** a chi non ha fatto login e controlla che l'id sia quello di chi chiama (prima chiunque con la chiave pubblica e l'UUID poteva scaricare tutto).
2. Colonne `updated_at` (automatico, con trigger) e `deleted_at` (**non usata**) su eventi, modelli, calendari, rotazioni, colori + indici.
3. Tabella `eliminati` + trigger "dopo cancellazione" + funzione `get_changes(utente, da_quando)`.
4. Funzione `applica_modifiche(operazioni)`: fino a 500 modifiche in una transazione, tutto-o-niente, utente sempre forzato a chi ha fatto login.
5. Vincoli già corretti: **nessuna modifica** (analisi nel passo 4 di `PIANO-SYNC.md`).

### Perché è stato fatto così
- L'app **parte sempre dal locale**, senza attese. Supabase è la copia condivisa tra dispositivi e il backup.
- La sincronizzazione automatica è **solo lettura** da Supabase, applica solo righe **diverse** da quelle locali, e si ferma se ci sono modifiche non ancora inviate.
- Scelta tecnica: invece della cancellazione logica (`deleted_at`) ho usato un registro delle eliminazioni (`eliminati`), che non obbliga a cambiare ogni punto dell'app che cancella.

---

## 3. Cosa manca

### Da fare (nell'ordine deciso)
1. **Passo 5b — Backup settimanale dentro Supabase** (tabella `backups` già esistente; da definire: quanti tenerne, es. ultimi N) + **controllo anti-pausa del piano gratuito** (Supabase mette in pausa i progetti inattivi).
2. **Passo 5c — Copia di sicurezza fuori da Supabase** (es. Drive o GitHub): da decidere insieme.

### Da fare da te (non posso provarlo su telefoni reali)
- Installare l'APK **n. 97** (o più recente) su **entrambi** i dispositivi, **sopra** quella esistente, senza disinstallare.
- Test sincronizzazione automatica: su A modifica un turno e aspetta ☁️ ✓ nel Log; su B entro ~60 s compare "🔄 Aggiornato: 1 evento".
- Test scrittura a blocchi: sposta un modello; cambia il colore di un gruppo con molti modelli → nel Log ☁️ ✓.
- Poi scrivermi com'è andata: leggo Supabase e il Log per confermare.
- **Esporta su Supabase** una volta, dal dispositivo con i dati giusti, per portare su Supabase le 104 QUARTINA con i flag corretti.

### Da valutare
- **Aggiornamento istantaneo** (pochi millisecondi) con Supabase **Realtime**: oggi fino a ~60 s con l'app aperta.
- Sincronizzazione delle **impostazioni generali** (`user_settings`, una riga da ~1,2 MB riscritta spesso): non è inclusa in `get_changes`.
- Dare la **finestra di esito** anche a "Importa da Supabase" (oggi la protezione scrive solo nel Log).
- Le singole modifiche (un evento, un modello) sono ancora "una richiesta per volta" e il "ripristino modello orfano" e la "rimozione colore" non sono a blocchi (scelta fatta di proposito).
- Colonne `deleted_at`: inutilizzate, si possono togliere.
- Avviso di sicurezza residuo: la funzione `rls_auto_enable` risulta eseguibile da `anon`/`authenticated` (da controllare).
- **Google Sheets**: non verificato che lo script risponda come atteso; il Log mostrerà 📊 ✓ oppure ⚠️ con il motivo.

---

## 4. Sicurezza — da fare subito
- Il **token GitHub** è stato scritto in chat: **revocalo e creane uno nuovo** (GitHub → Settings → Developer settings → Fine-grained tokens). Per riprendere i lavori in una nuova chat servirà darne uno nuovo.
- Il connettore **Supabase** ha permessi di scrittura: se non serve più, puoi toglierlo dalle impostazioni dei connettori.
- Il "Ripristino backup" ora è sicuro, ma **non usarlo** su un dispositivo con dati dubbi senza prima controllare i numeri.

## 5. Come riprendere in una nuova chat
- Repo: `https://github.com/tesonemgs5/turni`, branch `master`. Ogni push su master avvia la build dell'APK (~2,5 min). I commit con `[skip ci]` non la avviano.
- Flusso usato: modifica in `src/*.jsx` → `npx vite build` → commit → push → controllo GitHub Actions.
- Registro dettagliato dei passi, con i test: `PIANO-SYNC.md`. Questo file è il riassunto.
- Regola concordata: **ogni punto si scrive nel file prima di fare il push o la scrittura su Supabase**.
- Preferenze: risposte brevi, nessun popup, nessuna iniziativa non richiesta.
