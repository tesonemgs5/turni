import { useState } from "react"
import { supabase } from "./supabase"

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState("login") // login | register
  const [msg, setMsg] = useState("")
  const [loading, setLoading] = useState(false)

  async function handle() {
    if (!email.trim() || !password.trim()) {
      setMsg("❌ Per favore compila tutti i campi.");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setMsg("❌ Errore di accesso: " + error.message);
        }
      } else {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) {
          setMsg("❌ Errore di registrazione: " + error.message);
        } else {
          setMsg("✅ Registrazione avviata! Se richiesto, controlla la tua email per confermare l'account, altrimenti prova subito ad accedere.");
        }
      }
    } catch (err) {
      setMsg("❌ Si è verificato un errore imprevisto.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",height:"100vh",background:"#0f172a",padding:24}}>
      <div style={{fontSize:28,fontWeight:900,color:"#fff",marginBottom:8,fontFamily:"Georgia"}}>
        📅 Turni
      </div>
      <div style={{fontSize:13,color:"#64748b",marginBottom:32}}>
        {mode==="login"?"Accedi al tuo account":"Crea un account"}
      </div>
      <div style={{width:"100%",maxWidth:360}}>
        <input value={email} onChange={e=>setEmail(e.target.value)}
          placeholder="Email" type="email"
          style={{width:"100%",background:"#1e293b",border:"1px solid #334155",
            borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:14,
            marginBottom:10,boxSizing:"border-box",outline:"none"}}/>
        <input value={password} onChange={e=>setPassword(e.target.value)}
          placeholder="Password" type="password"
          style={{width:"100%",background:"#1e293b",border:"1px solid #334155",
            borderRadius:10,padding:"12px 14px",color:"#f1f5f9",fontSize:14,
            marginBottom:16,boxSizing:"border-box",outline:"none"}}/>
        <button onClick={handle} disabled={loading}
          style={{width:"100%",background:"#3b82f6",border:"none",borderRadius:10,
            color:"#fff",padding:"13px 0",fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:12}}>
          {loading?"⏳ ...":mode==="login"?"Accedi":"Registrati"}
        </button>
        <button onClick={()=>setMode(m=>m==="login"?"register":"login")}
          style={{width:"100%",background:"none",border:"none",color:"#64748b",
            fontSize:12,cursor:"pointer"}}>
          {mode==="login"?"Non hai un account? Registrati":"Hai già un account? Accedi"}
        </button>
        {msg&&<div style={{marginTop:12,textAlign:"center",fontSize:12,color:"#94a3b8"}}>{msg}</div>}
      </div>
    </div>
  )
}