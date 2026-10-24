// ═══════════════════════════════════════════════════════════════
// 31-spiega-errore.js — Spiegazione in italiano semplice di un errore.
// Dato il messaggio tecnico (es. "Failed to fetch", "storeRef is not
// defined") e il contesto (es. "Salvataggio modello"), restituisce:
//   cosaSuccede : che cosa è andato storto, in parole semplici
//   perIDati    : cosa significa per i dati (cosa è salvato e cosa no)
//   cosaFare    : cosa fare adesso
//   tecnico     : il testo tecnico originale (da mandare a chi sistema l'app)
// ═══════════════════════════════════════════════════════════════

const REGOLE = [
  {
    // Rete assente o instabile
    test: /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|abort|offline|err_internet|econn/i,
    cosaSuccede:
      "L'app non è riuscita a collegarsi a internet o al server (Supabase). Succede con poco segnale, " +
      "con la linea che cade a metà operazione o quando il server non risponde in tempo.",
    perIDati:
      "Quello che hai fatto resta salvato sul telefono (💾). L'invio al database online può restare " +
      "«in coda» (🕓) finché torna la connessione. Nel Log vedi se la voce ha ☁️ ✓ salvato o 🕓 in coda.",
    cosaFare:
      "Controlla la connessione e aspetta un attimo. Non serve rifare le modifiche: se dopo un po' " +
      "nel Log resta «non confermato» (⚠️), usa «Sincronizza ora».",
  },
  {
    // Errore del programma (bug)
    test: /is not defined|is not a function|cannot read propert|cannot set propert|undefined is not|null is not|is not iterable|before initialization|is not a constructor|read-only|maximum call stack/i,
    cosaSuccede:
      "Si è verificato un errore interno dell'app, cioè un difetto nel programma. Non dipende da te e " +
      "non dipende dalla connessione. L'operazione si è fermata a metà strada, nel punto in cui il " +
      "codice ha cercato qualcosa che non era disponibile.",
    perIDati:
      "I passaggi eseguiti PRIMA dell'errore possono essere già avvenuti (per esempio un modello già " +
      "creato o un orario già cambiato sullo schermo), mentre quelli DOPO non sono stati fatti " +
      "(per esempio il salvataggio sul database online). Il risultato può quindi essere a metà.",
    cosaFare:
      "Controlla com'è rimasto il risultato (modelli duplicati, eventi non aggiornati) prima di " +
      "ripetere l'operazione, per non crearne altri. Manda a Claude il «Dettaglio tecnico» qui sotto: " +
      "con quel testo il difetto si trova e si corregge.",
  },
  {
    // Risposta non valida dal server / servizio AI
    test: /not valid json|unexpected token|unexpected end of json|json\.parse|<!doctype/i,
    cosaSuccede:
      "L'app si aspettava una risposta in un certo formato, ma dal server è arrivata una pagina o un " +
      "testo diverso (di solito una pagina di errore). Succede quando il servizio contattato non è " +
      "raggiungibile o non è configurato (per esempio manca la chiave API dell'AI sul server).",
    perIDati:
      "Non è stato salvato né importato nulla da questa operazione: i tuoi dati esistenti non sono stati toccati.",
    cosaFare:
      "Riprova tra poco. Se si ripete sempre, il servizio va configurato o sostituito: manda il " +
      "«Dettaglio tecnico» a Claude.",
  },
  {
    // Permessi / sessione scaduta
    test: /row-level security|permission denied|42501|jwt|invalid.*token|not authorized|unauthorized|\b401\b|\b403\b|session.*(expired|missing)|refresh token/i,
    cosaSuccede:
      "Il server ha rifiutato l'operazione perché non ti riconosce o non ti dà il permesso: di solito " +
      "la sessione di accesso è scaduta.",
    perIDati:
      "L'operazione non è stata scritta sul database online. Quello che hai fatto resta sul telefono, " +
      "ma non è ancora al sicuro nel cloud.",
    cosaFare:
      "Esci e rientra (Impostazioni → Logout, poi accedi di nuovo), poi premi «Sincronizza ora».",
  },
  {
    // Elemento già esistente
    test: /duplicate key|23505|already exists|unique constraint/i,
    cosaSuccede:
      "Il database ha rifiutato il salvataggio perché esiste già un elemento identico " +
      "(stesso codice o stessa chiave).",
    perIDati:
      "L'elemento già presente non è stato modificato; quello nuovo non è stato aggiunto una seconda volta.",
    cosaFare:
      "Di solito non serve fare nulla. Se ti aspettavi una modifica, controlla che l'elemento esistente sia quello giusto.",
  },
  {
    // Memoria piena
    test: /quota|storage.*full|no space|disk full/i,
    cosaSuccede: "La memoria disponibile per l'app (o del telefono) è piena e non c'è spazio per salvare.",
    perIDati: "Le ultime modifiche potrebbero non essere state salvate sul telefono.",
    cosaFare: "Libera spazio sul telefono e riprova. Se serve, fai un backup dalle Impostazioni.",
  },
  {
    // Struttura del database
    test: /does not exist|42p01|pgrst20[25]|could not find the (table|column|function)|schema cache/i,
    cosaSuccede:
      "Sul database online manca una tabella o una colonna che l'app si aspetta " +
      "(il database non è allineato con questa versione dell'app).",
    perIDati: "Le modifiche restano sul telefono ma non possono essere inviate al database finché non viene sistemato.",
    cosaFare: "Manda il «Dettaglio tecnico» a Claude: serve aggiornare la struttura del database.",
  },
];

export function spiegaErrore(messaggio, contesto) {
  const testo = String(messaggio || "");
  const regola = REGOLE.find((r) => r.test.test(testo));
  if (regola) {
    return {
      cosaSuccede: regola.cosaSuccede,
      perIDati: regola.perIDati,
      cosaFare: regola.cosaFare,
      tecnico: testo,
    };
  }
  const quando = contesto ? `durante «${contesto}»` : "durante un'operazione";
  return {
    cosaSuccede:
      `L'app ha avuto un problema inatteso ${quando} e l'operazione potrebbe non essersi completata. ` +
      "Questo tipo di errore non ha una spiegazione preconfezionata.",
    perIDati:
      "Non è possibile dire con certezza cosa sia stato salvato: controlla il risultato sullo schermo " +
      "e nel Log (💾 locale, ☁️ Supabase).",
    cosaFare:
      "Controlla se l'operazione è andata a buon fine prima di ripeterla. Se l'errore si ripresenta, " +
      "manda il «Dettaglio tecnico» a Claude.",
    tecnico: testo,
  };
}
