#!/usr/bin/env python3
"""
fix_domeniche_fatto.py
Corregge il pulsante "Fatto" nelle rotazioni domeniche:
popola automaticamente la griglia con le domeniche di lavoro (1 su 4).
"""

INPUT_FILE  = "../src/App.jsx"
OUTPUT_FILE = "App_updated.jsx"

def leggi(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def scrivi(path, contenuto):
    with open(path, "w", encoding="utf-8") as f:
        f.write(contenuto)
    print(f"  ✓ Scritto: {path}")

def fix_domeniche_fatto(src):
    vecchio = '              <button onClick={()=>{updateGrigliaRotazione(rot.id,rot.griglia);setShowRotDetail(null);}}'
    nuovo = """              <button onClick={()=>{
                let grigliaFinale = {...(rot.griglia||{})};
                if(rot.tipo==="domeniche" && rot.dataInizio && rot.modellaLavoroId){
                  const inizio = new Date(rot.dataInizio);
                  let d = new Date(inizio);
                  while(d.getDay()!==0) d.setDate(d.getDate()+1);
                  for(let i=0;i<(rot.nSettimane||52);i++){
                    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                    if(i%4===0) grigliaFinale[k]=rot.modellaLavoroId;
                    d.setDate(d.getDate()+7);
                  }
                }
                updateGrigliaRotazione(rot.id, grigliaFinale);
                setShowRotDetail(null);
              }}"""
    if vecchio not in src:
        print("  ⚠  FIX: pattern non trovato, skip")
        return src
    print("  ✓ FIX: pulsante Fatto domeniche corretto (griglia popolata automaticamente)")
    return src.replace(vecchio, nuovo, 1)

def main():
    print(f"\n  Lettura: {INPUT_FILE}")
    src = leggi(INPUT_FILE)
    src = fix_domeniche_fatto(src)
    scrivi(OUTPUT_FILE, src)
    print(f"\n  File pronto: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
