import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Auth from './auth.jsx'
import { supabase } from './supabase.js'
import { useState, useEffect } from 'react'

// Legge la sessione salvata in locale in modo SINCRONO, senza aspettare la rete.
// Il client Supabase salva sempre l'ultima sessione (token) nel localStorage,
// sotto una chiave tipo "sb-<project-ref>-auth-token". Se la troviamo, vuol
// dire che questo dispositivo ha già fatto login in passato: è un dispositivo
// "noto" e deve poter entrare subito, con o senza internet, senza restare
// bloccato ad aspettare una verifica online che offline non arriverebbe mai.
function leggiSessioneLocale() {
  try {
    const storageKey = Object.keys(localStorage).find(
      k => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Supabase-js v2 salva l'oggetto sessione direttamente; alcune versioni
    // più vecchie lo annidavano in { currentSession: {...} }. Copriamo entrambi i casi.
    const sess = parsed?.currentSession || parsed;
    if (sess?.access_token && sess?.user) return sess;
    return null;
  } catch {
    return null;
  }
}

function Root() {
  const sessioneLocale = leggiSessioneLocale();
  // Se c'è già una sessione salvata (dispositivo noto), la usiamo SUBITO:
  // niente schermata di caricamento, l'app parte anche offline.
  const [session, setSession] = useState(sessioneLocale)
  const [loading, setLoading] = useState(!sessioneLocale)

  useEffect(() => {
    let risolto = false;

    // Timeout di sicurezza: se supabase.auth.getSession() resta "appesa"
    // (succede quando il token è scaduto e il tentativo di rinnovo non
    // riceve risposta per mancanza di rete), non blocchiamo l'utente
    // per sempre sulla schermata nera/bianca.
    const timeoutId = setTimeout(() => {
      if (risolto) return;
      risolto = true;
      setLoading(false);
      // Se avevamo già una sessione locale (dispositivo noto) resta quella.
      // Altrimenti (dispositivo non noto, senza rete) si vedrà il login.
    }, 4000);

    supabase.auth.getSession().then(({ data: { session: sessioneOnline } }) => {
      if (risolto) {
        // Il timeout è già scattato prima che arrivasse la risposta:
        // se la rete è tornata in tempo, aggiorniamo comunque la sessione.
        if (sessioneOnline) setSession(sessioneOnline);
        return;
      }
      risolto = true;
      clearTimeout(timeoutId);
      setSession(sessioneOnline);
      setLoading(false);
    }).catch(() => {
      if (risolto) return;
      risolto = true;
      clearTimeout(timeoutId);
      setLoading(false);
      // Errore di rete: se avevamo una sessione locale la teniamo com'era
      // (già impostata sopra come stato iniziale), altrimenti niente sessione.
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sessioneOnline) => {
      setSession(sessioneOnline);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeoutId);
      listener?.subscription?.unsubscribe();
    };
  }, [])

  if (loading) {
    return (
      <div style={{background:"#0f172a",height:"100vh",display:"flex",
        alignItems:"center",justifyContent:"center",color:"#64748b",fontSize:13}}>
        Caricamento...
      </div>
    );
  }
  return session ? <App session={session} /> : <Auth />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)

