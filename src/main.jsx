import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Auth from './auth.jsx'
import { supabase } from './supabase.js'
import { useState, useEffect } from 'react'

function Root() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  if (loading) return <div style={{background:"#0f172a",height:"100vh"}}/>
  return session ? <App session={session} /> : <Auth />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
