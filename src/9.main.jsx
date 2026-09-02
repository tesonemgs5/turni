import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './1.App.jsx'
import Auth from './10.auth.jsx'
import { supabase } from './11.supabase.js'
import { useState, useEffect } from 'react'
import { registerSW } from 'virtual:pwa-register'

// Registra il service worker generato da vite-plugin-pwa: senza questa
// chiamata il plugin produce comunque sw.js in fase di build, ma nessuno
// lo installa mai nel browser — quindi l'app (HTML/JS/CSS) non finisce
// mai in cache e, aprendo/ricaricando la pagina senza connessione, il
// browser mostra la sua pagina di errore invece dell'app. Con questa
// chiamata, dopo la prima visita con linea l'app resta disponibile anche
// a freddo, senza connessione.
registerSW({ immediate: true })

function leggiSessioneLocale() {
  try {
    const storageKey = Object.keys(localStorage).find(
      k => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sess = parsed?.currentSession || parsed;
    if (sess?.access_token && sess?.user) return sess;
    return null;
  } catch {
    return null;
  }
}

function Root() {
  const sessioneLocale = leggiSessioneLocale();
  const [session, setSession] = useState(sessioneLocale)
  const [loading, setLoading] = useState(!sessioneLocale)

  useEffect(() => {
    let risolto = false;

    const timeoutId = setTimeout(() => {
      if (risolto) return;
      risolto = true;
      setLoading(false);
    }, 4000);

    supabase.auth.getSession().then(({ data: { session: sessioneOnline } }) => {
      // Non sovrascrivere MAI una sessione locale valida con null: se
      // avevamo già una sessioneLocale (da leggiSessioneLocale) e questa
      // chiamata torna senza sessione (latenza, token in fase di refresh,
      // blip di rete), non è un logout — è solo che il server non ha
      // ancora risposto. Buttare via la sessione qui smonterebbe <App/>
      // e rimonterebbe <Auth/>, azzerando userId e facendo ripartire da
      // capo il caricamento dati in useAppCore (con effetti a cascata:
      // eventi appena salvati in locale che sembrano "sparire").
      if (sessioneOnline || !sessioneLocale) {
        if (risolto) {
          if (sessioneOnline) setSession(sessioneOnline);
        } else {
          setSession(sessioneOnline);
        }
      }
      if (!risolto) {
        risolto = true;
        clearTimeout(timeoutId);
        setLoading(false);
      }
    }).catch(() => {
      if (risolto) return;
      risolto = true;
      clearTimeout(timeoutId);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sessioneOnline) => {
      // Stesso principio qui: onAuthStateChange può emettere eventi con
      // sessioneOnline null anche per motivi non di logout vero (es. un
      // TOKEN_REFRESHED fallito temporaneamente). Un vero logout arriva
      // sempre con _event === "SIGNED_OUT": solo in quel caso azzeriamo
      // davvero la sessione. Negli altri casi con sessione null, ignoriamo
      // l'aggiornamento e teniamo quella che avevamo.
      if (sessioneOnline || _event === "SIGNED_OUT") {
        setSession(sessioneOnline);
      }
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