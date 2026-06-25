#!/usr/bin/env python3
"""
Aggiunge il tasto modifica (✏️) alla RotazioneCard e collega l'apertura
del form di modifica (RotazioneForm) con i dati della rotazione esistente.

Legge App.jsx, scrive App_updated.jsx
"""

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

with open(FILE_INPUT, "r", encoding="utf-8") as f:
    content = f.read()

# ───────────────────────────────────────────────────────────────
# FIX 1: passare onEdit a RotazioneCard nella chiamata (sezione 12)
# ───────────────────────────────────────────────────────────────
old_1 = '''                    <RotazioneCard r={r} T={T} accent={accent} modelli={modelli}
                      onOpen={()=>setShowRotDetail(r.id)}
                      onDelete={()=>deleteRotazione(r.id)}/>'''

new_1 = '''                    <RotazioneCard r={r} T={T} accent={accent} modelli={modelli}
                      onOpen={()=>setShowRotDetail(r.id)}
                      onEdit={()=>{ setEditRotazione(r); setRotForm({
                        tipo:r.tipo, titolo:r.titolo||"", dataInizio:r.dataInizio||"",
                        nSettimane:r.nSettimane||52, modellaLavoroId:r.modellaLavoroId||null,
                        modelloNLId:r.modelloNLId||null, modelloRSId:r.modelloRSId||null,
                      }); setShowRotForm(true); }}
                      onDelete={()=>deleteRotazione(r.id)}/>'''

if old_1 not in content:
    raise SystemExit("ERRORE: blocco RotazioneCard (chiamata) non trovato — file diverso da quello previsto.")
content = content.replace(old_1, new_1, 1)

# ───────────────────────────────────────────────────────────────
# FIX 2: aggiornare il salvataggio per passare anche i campi extra
# (saveRotazione({...rotForm,id:editRotazione?.id}) già passa tutto
# rotForm quindi non serve toccarlo)
# ───────────────────────────────────────────────────────────────

# ───────────────────────────────────────────────────────────────
# FIX 3: aggiungere il bottone ✏️ dentro il componente RotazioneCard
# (sezione 19)
# ───────────────────────────────────────────────────────────────
old_2 = '''function RotazioneCard({r, T, accent, modelli, onOpen, onDelete}){
  const tipoLabel = r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL / RS classico":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":" Personalizzata";
  const modelloLav = modelli.find(m=>m.id===r.modellaLavoroId);
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onOpen}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
        {modelloLav&&<div style={{fontSize:11,color:T.sub,marginTop:1}}>Modello: {modelloLav.titolo}</div>}
      </div>
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questa rotazione?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:4}}>×</button>
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}'''

new_2 = '''function RotazioneCard({r, T, accent, modelli, onOpen, onEdit, onDelete}){
  const tipoLabel = r.tipo==="domeniche"?"🗓 Domeniche 1/4":r.tipo==="nlrs"?"🔄 NL / RS classico":r.tipo==="nlrs_scalante"?"📅 RS/NL Scalante":" Personalizzata";
  const modelloLav = modelli.find(m=>m.id===r.modellaLavoroId);
  return (
    <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer"}} onClick={onOpen}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
        {modelloLav&&<div style={{fontSize:11,color:T.sub,marginTop:1}}>Modello: {modelloLav.titolo}</div>}
      </div>
      {onEdit&&<button onClick={e=>{e.stopPropagation();onEdit();}}
        style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:16,padding:"0 8px",marginRight:2}}>✏️</button>}
      <button onClick={e=>{e.stopPropagation();if(window.confirm("Eliminare questa rotazione?"))onDelete();}}
        style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:18,padding:"0 4px",marginRight:4}}>×</button>
      <span style={{color:T.sub,fontSize:14}}>›</span>
    </div>
  );
}'''

if old_2 not in content:
    raise SystemExit("ERRORE: componente RotazioneCard (definizione) non trovato.")
content = content.replace(old_2, new_2, 1)

with open(FILE_OUTPUT, "w", encoding="utf-8") as f:
    f.write(content)

print(f"OK -> creato {FILE_OUTPUT}")
print("Modifiche applicate:")
print("  1. RotazioneCard ora riceve onEdit (sezione 12)")
print("  2. RotazioneCard mostra bottone ✏️ che apre il form precompilato (sezione 19)")
