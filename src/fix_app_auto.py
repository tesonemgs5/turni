#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_app_auto.py
----------------
Aggiunge il conteggio "APP" e "AUTO" (basato sulla parola contenuta nel
titolo del modello) come gruppo indipendente, sotto i gruppi 1° TURNO /
2° TURNO esistenti, nella vista Report > Conteggio turni.

USO:
    1. Copia questo file nella cartella del progetto (dove c'è src/App.jsx)
    2. python fix_app_auto.py
    3. Backup automatico creato prima di modificare.
"""

import sys
import shutil
from pathlib import Path
from datetime import datetime

APP_PATH = Path("src/App.jsx")


def fail(msg):
    print(f"\n❌ ERRORE: {msg}")
    print("Nessuna modifica è stata salvata. Il file App.jsx è rimasto intatto.")
    sys.exit(1)


def main():
    if not APP_PATH.exists():
        fail(f"Non trovo il file '{APP_PATH}'. Esegui dalla cartella principale del progetto.")

    original = APP_PATH.read_text(encoding="utf-8")
    text = original
    applied = []

    # ─────────────────────────────────────────────────────────────
    # FIX 1: computeConteggioForReport — aggiunge conteggio app/auto
    # basato sul titolo del modello collegato all'evento
    # ─────────────────────────────────────────────────────────────
    old1 = '''          if(!e.tIn) continue;
          const [h,m]=e.tIn.split(":").map(Number);
          const mins=h*60+m;
          let fascia="";
          if(mins>=360&&mins<705) fascia="primo";
          else fascia="secondo";
          if(fasceFiltro.length>0 && !fasceFiltro.includes(fascia)) continue;
          result.totale++;
          result[fascia]=(result[fascia]||0)+1;
          if(e.modelloId) perModello[e.modelloId]=(perModello[e.modelloId]||0)+1;'''

    new1 = '''          if(!e.tIn) continue;
          const [h,m]=e.tIn.split(":").map(Number);
          const mins=h*60+m;
          let fascia="";
          if(mins>=360&&mins<705) fascia="primo";
          else fascia="secondo";
          if(fasceFiltro.length>0 && !fasceFiltro.includes(fascia)) continue;
          result.totale++;
          result[fascia]=(result[fascia]||0)+1;
          if(e.modelloId) perModello[e.modelloId]=(perModello[e.modelloId]||0)+1;
          // Gruppo indipendente APP/AUTO basato sul titolo del modello collegato
          const modelloEvt = e.modelloId ? modelli.find(mm=>mm.id===e.modelloId) : null;
          const titoloEvt = (modelloEvt?.titolo||"").toUpperCase();
          if(titoloEvt.includes("APP")) result.app=(result.app||0)+1;
          else if(titoloEvt.includes("AUTO")) result.auto=(result.auto||0)+1;'''

    count1 = text.count(old1)
    if count1 == 1:
        text = text.replace(old1, new1)
        applied.append("computeConteggioForReport: aggiunto conteggio app/auto basato sul titolo modello")
    elif count1 == 0:
        fail("Blocco computeConteggioForReport non trovato esattamente. Nessuna modifica applicata.")
    else:
        fail(f"Trovate {count1} occorrenze impreviste. Per sicurezza non procedo.")

    # ─────────────────────────────────────────────────────────────
    # FIX 2: inizializza anche app/auto nell'oggetto result iniziale
    # ─────────────────────────────────────────────────────────────
    old2 = '    const result = { totale:0, mattina:0, pomeriggio:0, notte:0, terzo:0, h24:0 };'
    new2 = '    const result = { totale:0, mattina:0, pomeriggio:0, notte:0, terzo:0, h24:0, app:0, auto:0 };'
    count2 = text.count(old2)
    if count2 == 1:
        text = text.replace(old2, new2)
        applied.append("Inizializzati result.app e result.auto a 0")
    elif count2 == 0:
        print("\n⚠️  Riga di inizializzazione 'result' non trovata: app/auto partiranno da undefined invece di 0 (non bloccante, ma meno pulito).")
    else:
        fail(f"Trovate {count2} occorrenze impreviste nella riga di inizializzazione result.")

    # ─────────────────────────────────────────────────────────────
    # FIX 3: aggiunge il blocco visivo APP/AUTO sotto FasceExpand
    # nel componente ConteggioConfigCard
    # ─────────────────────────────────────────────────────────────
    old3 = '''        <FasceExpand data={data} pct1={pct1} pct2={pct2} T={T} modelli={modelli} accent={accent}/>
      </div>'''

    new3 = '''        <FasceExpand data={data} pct1={pct1} pct2={pct2} T={T} modelli={modelli} accent={accent}/>
      </div>

      {/* Gruppo indipendente APP/AUTO basato sul titolo del modello */}
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:8}}>APP / AUTO</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[
            {key:"app",  label:"APP",  color:"#3b82f6", count:data.app||0},
            {key:"auto", label:"AUTO", color:"#8b5cf6", count:data.auto||0},
          ].map(g=>(
            <div key={g.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 10px",background:g.color+"22",borderRadius:8,border:`1px solid ${g.color}44`}}>
              <span style={{fontSize:13,fontWeight:800,color:g.color}}>{g.label}</span>
              <span style={{fontSize:16,fontWeight:900,color:T.text}}>{g.count}</span>
            </div>
          ))}
        </div>
      </div>'''

    count3 = text.count(old3)
    if count3 == 1:
        text = text.replace(old3, new3)
        applied.append("Aggiunto blocco visivo APP/AUTO sotto 1°/2° turno in ConteggioConfigCard")
    elif count3 == 0:
        fail("Blocco <FasceExpand .../> non trovato esattamente. Nessuna modifica applicata.")
    else:
        fail(f"Trovate {count3} occorrenze impreviste del blocco FasceExpand. Per sicurezza non procedo.")

    # ─────────────────────────────────────────────────────────────
    if not applied:
        print("\n⚠️  Nessuna modifica applicata. Il file App.jsx NON è stato toccato.")
        sys.exit(0)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = APP_PATH.with_suffix(APP_PATH.suffix + f".bak_{timestamp}")
    shutil.copy2(APP_PATH, backup_path)

    APP_PATH.write_text(text, encoding="utf-8")

    print("\n✅ Modifiche applicate con successo:")
    for a in applied:
        print(f"   ✓ {a}")

    print(f"\n💾 Backup del file originale salvato in: {backup_path}")
    print("👉 Ora controlla le modifiche in VS Code, testa l'app, poi fai commit + push.")


if __name__ == "__main__":
    main()
