import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './1.App.jsx'
import Auth from './10.auth.jsx'
import { supabase } from './11.supabase.js'
import { useState, useEffect } from 'react'

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
      if (risolto) {
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