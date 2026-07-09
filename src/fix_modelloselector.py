# -*- coding: utf-8 -*-
"""
Script di fix per ModelloSelector / RotazioneForm.
Ordina i modelli nei popup di assegnazione (Domenica LAVORO, NL, RS, ecc.)
usando sortedModelli() invece dell'ordine grezzo dell'array modelli.

Uso:
    python fix_modelloselector.py <percorso_App.jsx>

Se non passi un argomento, cerca "App.jsx" nella cartella corrente.
"""

import sys
import os
import shutil
import datetime

REPLACEMENTS = [
    # 1) Firma ModelloSelector: aggiunge il parametro sortedModelli
    (
"""function ModelloSelector({label, value, onChange, modelli, T, required=false, last=false}){
  const sel = modelli.find(m=>m.id===value);
  const [open, setOpen] = useState(false);
  const colore = sel?(sel.coloreCustom||getColorByTime(sel.inizio)):"#94a3b8";""",
"""function ModelloSelector({label, value, onChange, modelli, T, required=false, last=false, sortedModelli}){
  const sel = modelli.find(m=>m.id===value);
  const [open, setOpen] = useState(false);
  const colore = sel?(sel.coloreCustom||getColorByTime(sel.inizio)):"#94a3b8";
  const listaOrdinata = sortedModelli ? sortedModelli() : modelli;"""
    ),
    # 2) Uso di modelli.map -> listaOrdinata.map nel dropdown
    (
"""          {modelli.map(m=>{
            const c=m.coloreCustom||getColorByTime(m.inizio);
            return (
              <div key={m.id} onClick={()=>{onChange(m.id);setOpen(false);}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
                  cursor:"pointer",background:value===m.id?"rgba(0,0,0,0.05)":"transparent"}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:c,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>{m.titolo}</div>
                  <div style={{fontSize:11,color:T.sub}}>
                    {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.tempo==="6h15"?` - ${calcFine6h15(m.inizio)}`:m.fine?` - ${m.fine}`:""}`:m.tempo}
                  </div>
                </div>
                {value===m.id&&<span style={{color:"#3b82f6"}}>✓</span>}
              </div>
            );
          })}""",
"""          {listaOrdinata.map(m=>{
            const c=m.coloreCustom||getColorByTime(m.inizio);
            return (
              <div key={m.id} onClick={()=>{onChange(m.id);setOpen(false);}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
                  cursor:"pointer",background:value===m.id?"rgba(0,0,0,0.05)":"transparent"}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:c,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>{m.titolo}</div>
                  <div style={{fontSize:11,color:T.sub}}>
                    {m.tempo==="h24"?"H24":m.inizio?`${m.inizio}${m.tempo==="6h15"?` - ${calcFine6h15(m.inizio)}`:m.fine?` - ${m.fine}`:""}`:m.tempo}
                  </div>
                </div>
                {value===m.id&&<span style={{color:"#3b82f6"}}>✓</span>}
              </div>
            );
          })}"""
    ),
    # 3) Firma RotazioneForm: aggiunge sortedModelli
    (
"""function RotazioneForm({T, form, setForm, accent, modelli, onSave}){""",
"""function RotazioneForm({T, form, setForm, accent, modelli, onSave, sortedModelli}){"""
    ),
    # 4) Uso ModelloSelector - blocco "domeniche"
    (
"""            <ModelloSelector label="Domenica LAVORO (festivo)" value={form.modellaLavoroId}
              onChange={id=>setForm(f=>({...f,modellaLavoroId:id}))} modelli={modelli} T={T} required/>
            <ModelloSelector label="Domenica riposo (opzionale)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} last/>""",
"""            <ModelloSelector label="Domenica LAVORO (festivo)" value={form.modellaLavoroId}
              onChange={id=>setForm(f=>({...f,modellaLavoroId:id}))} modelli={modelli} T={T} required sortedModelli={sortedModelli}/>
            <ModelloSelector label="Domenica riposo (opzionale)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} last sortedModelli={sortedModelli}/>"""
    ),
    # 5) Uso ModelloSelector - blocco "nlrs"
    (
"""            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T}/>
            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))} modelli={modelli} T={T} last/>
          </div>
        </div>
      )}
      {form.tipo==="nlrs_scalante"&&(""",
"""            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} sortedModelli={sortedModelli}/>
            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))} modelli={modelli} T={T} last sortedModelli={sortedModelli}/>
          </div>
        </div>
      )}
      {form.tipo==="nlrs_scalante"&&("""
    ),
    # 6) Uso ModelloSelector - blocco "nlrs_scalante"
    (
"""            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))} modelli={modelli} T={T}/>
            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} last/>""",
"""            <ModelloSelector label="RS (Riposo Settimanale)" value={form.modelloRSId}
              onChange={id=>setForm(f=>({...f,modelloRSId:id}))} modelli={modelli} T={T} sortedModelli={sortedModelli}/>
            <ModelloSelector label="NL (Non Lavoro)" value={form.modelloNLId}
              onChange={id=>setForm(f=>({...f,modelloNLId:id}))} modelli={modelli} T={T} last sortedModelli={sortedModelli}/>"""
    ),
    # 7) Render di RotazioneForm: passa sortedModelli
    (
"""            <RotazioneForm T={T} form={rotForm} setForm={setRotForm} accent={accent} modelli={modelli}
              onSave={()=>{ saveRotazione({...rotForm,id:editRotazione?.id}); setShowRotForm(false); }}/>""",
"""            <RotazioneForm T={T} form={rotForm} setForm={setRotForm} accent={accent} modelli={modelli}
              sortedModelli={sortedModelli}
              onSave={()=>{ saveRotazione({...rotForm,id:editRotazione?.id}); setShowRotForm(false); }}/>"""
    ),
]


def main():
    if len(sys.argv) >= 2:
        path = sys.argv[1]
    else:
        path = "App.jsx"

    if not os.path.isfile(path):
        print(f"[ERRORE] File non trovato: {path}")
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Backup
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{path}.backup_{ts}"
    shutil.copy2(path, backup_path)
    print(f"[OK] Backup creato: {backup_path}")

    results = []
    new_content = content
    for i, (old, new) in enumerate(REPLACEMENTS, start=1):
        count = new_content.count(old)
        if count == 0:
            results.append((i, "FALLITO", "testo da cercare non trovato (0 occorrenze)"))
        elif count > 1:
            results.append((i, "FALLITO", f"testo da cercare trovato {count} volte (deve essere unico)"))
        else:
            new_content = new_content.replace(old, new, 1)
            results.append((i, "OK", "sostituito con successo"))

    print("\n=== RISULTATO MODIFICHE ===")
    all_ok = True
    for i, status, msg in results:
        print(f"  Modifica {i}: {status} - {msg}")
        if status != "OK":
            all_ok = False

    if not all_ok:
        print("\n[STOP] Una o più modifiche sono FALLITE. Il file NON è stato toccato.")
        print(f"       Il backup {backup_path} può essere eliminato, non serve.")
        sys.exit(2)

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"\n[OK] Tutte le {len(REPLACEMENTS)} modifiche sono state applicate con successo a {path}")
    print(f"[OK] Backup di sicurezza salvato in: {backup_path}")
    print("\nOra puoi committare le modifiche.")


if __name__ == "__main__":
    main()
