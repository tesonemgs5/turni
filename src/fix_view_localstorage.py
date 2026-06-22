#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_view_localstorage.py
--------------------------
Aggiunge in Impostazioni un pulsante "Visualizza Dati Locali (Telefono)"
che mostra, dentro l'app, un riepilogo di cosa c'è salvato in localStorage:
numero di eventi, calendari, modelli e data/ora dell'ultimo salvataggio.

PUOI METTERE QUESTO FILE OVUNQUE: dentro "src", dentro la cartella
principale del progetto, o altrove. Lo script trova App.jsx da solo,
cercando prima nella propria cartella, poi nelle cartelle vicine.

COME FUNZIONA:
    1. Calcola le modifiche, ma NON le scrive subito.
    2. Mostra un'anteprima chiara di cosa cambierà.
    3. Chiede conferma: scrivi "si" per applicare, altro annulla.
    4. Solo dopo la conferma crea un backup e scrive il file.

USO:
    python fix_view_localstorage.py
"""

import sys
import shutil
from pathlib import Path
from datetime import datetime


def find_app_jsx():
    """Cerca App.jsx partendo dalla cartella di questo script, poi nelle
    cartelle vicine (sé stessa, sottocartella src, cartella superiore,
    sottocartella src della cartella superiore)."""
    here = Path(__file__).resolve().parent
    candidates = [
        here / "App.jsx",
        here / "src" / "App.jsx",
        here.parent / "App.jsx",
        here.parent / "src" / "App.jsx",
        here.parent.parent / "src" / "App.jsx",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def fail(msg):
    print(f"\n❌ ERRORE: {msg}")
    print("Nessuna modifica è stata salvata.")
    sys.exit(1)


def show_preview(label, old, new):
    print(f"\n{'─'*60}")
    print(f"MODIFICA: {label}")
    print(f"{'─'*60}")
    print("PRIMA (verrà tolto):")
    old_lines = old.strip().split("\n")
    print("  " + "\n  ".join(old_lines[:6]) + ("\n  ..." if len(old_lines) > 6 else ""))
    print("\nDOPO (verrà aggiunto):")
    new_lines = new.strip().split("\n")
    print("  " + "\n  ".join(new_lines[:10]) + ("\n  ..." if len(new_lines) > 10 else ""))


def main():
    app_path = find_app_jsx()
    if not app_path:
        fail(
            "Non trovo 'App.jsx' né in questa cartella né in quelle vicine.\n"
            "Metti questo script dentro 'src' (a fianco di App.jsx) oppure "
            "nella cartella principale del progetto."
        )

    print(f"📂 File trovato: {app_path}")

    original = app_path.read_text(encoding="utf-8")
    text = original
    planned = []

    # ─────────────────────────────────────────────────────────────
    # MODIFICA 1: aggiunge stato per il modal localStorage
    # ─────────────────────────────────────────────────────────────
    old1 = '  const [showBackupsModal, setShowBackupsModal] = useState(false);'
    new1 = '''  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [showLocalDataModal, setShowLocalDataModal] = useState(false);'''
    if text.count(old1) == 1:
        planned.append(("Aggiunge stato React showLocalDataModal", old1, new1))
    elif text.count(old1) == 0:
        fail("Non trovo la riga di showBackupsModal. Hai già eseguito fix_backup_cloud.py? Controllo manuale necessario.")
    else:
        fail("Trovate occorrenze multiple impreviste per la riga showBackupsModal.")

    # ─────────────────────────────────────────────────────────────
    # MODIFICA 2: aggiunge il pulsante in Settings + il modal di visualizzazione
    # ─────────────────────────────────────────────────────────────
    old2 = '''        <div style={{display:"flex",gap:8}}>
          <button onClick={handleExportSupabase}
            style={{flex:1,background:"#16a34a",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📤 Esporta da Supabase
          </button>
          <button onClick={handleOpenImportSupabase}
            style={{flex:1,background:"#2563eb",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📥 Importa su Supabase
          </button>
        </div>
      </Sec>'''

    new2 = '''        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={handleExportSupabase}
            style={{flex:1,background:"#16a34a",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📤 Esporta da Supabase
          </button>
          <button onClick={handleOpenImportSupabase}
            style={{flex:1,background:"#2563eb",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📥 Importa su Supabase
          </button>
        </div>
        <button onClick={()=>setShowLocalDataModal(true)}
          style={{width:"100%",background:"#7c3aed",border:"none",borderRadius:10,
            color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
          📱 Visualizza Dati Locali (Telefono)
        </button>
      </Sec>

      {showLocalDataModal&&(()=>{
        const cached = loadFromLocalStorage();
        const nEvents = cached ? Object.values(cached.events||{}).reduce((sum,calMap)=>
          sum + Object.values(calMap||{}).reduce((s2,arr)=>s2+(arr?.length||0), 0), 0) : 0;
        const nCalendars = cached?.calendars?.length || 0;
        const nModelli = cached?.modelli?.length || 0;
        const ts = cached?.timestamp ? new Date(cached.timestamp).toLocaleString("it-IT") : "Mai";
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,
            display:"flex",alignItems:"flex-end"}}
            onClick={e=>{if(e.target===e.currentTarget)setShowLocalDataModal(false);}}>
            <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
              maxWidth:480,margin:"0 auto",padding:"16px"}}
              onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:16,fontWeight:900,color:T.text}}>Dati salvati su questo dispositivo</div>
                <button onClick={()=>setShowLocalDataModal(false)}
                  style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>×</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,background:T.s2,borderRadius:10,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Eventi/turni salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nEvents}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Calendari salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nCalendars}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Modelli salvati:</span>
                  <span style={{fontWeight:800,color:T.text}}>{nModelli}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:T.sub}}>Ultimo salvataggio:</span>
                  <span style={{fontWeight:800,color:T.text}}>{ts}</span>
                </div>
              </div>
              <div style={{fontSize:11,color:T.sub,marginTop:10,textAlign:"center"}}>
                Questa è solo una cache locale di sicurezza. I dati reali e definitivi sono su Supabase.
              </div>
            </div>
          </div>
        );
      })()}'''

    if text.count(old2) == 1:
        planned.append(("Aggiunge pulsante 'Visualizza Dati Locali' + modal riepilogo", old2, new2))
    elif text.count(old2) == 0:
        fail("Non trovo il blocco dei pulsanti Esporta/Importa Supabase. Hai già eseguito fix_backup_cloud.py?")
    else:
        fail("Trovate occorrenze multiple impreviste per il blocco pulsanti Supabase.")

    # ─────────────────────────────────────────────────────────────
    # ANTEPRIMA + CONFERMA
    # ─────────────────────────────────────────────────────────────
    print("\n" + "="*60)
    print(f"Sono pronte {len(planned)} modifiche per: {app_path}")
    print("="*60)
    for label, old, new in planned:
        show_preview(label, old, new)

    print("\n" + "="*60)
    risposta = input("Applico queste modifiche a App.jsx? Scrivi 'si' per confermare: ").strip().lower()
    if risposta != "si":
        print("\n🛑 Operazione annullata. Nessuna modifica è stata scritta su App.jsx.")
        sys.exit(0)

    # ─────────────────────────────────────────────────────────────
    # APPLICA + BACKUP
    # ─────────────────────────────────────────────────────────────
    for label, old, new in planned:
        text = text.replace(old, new, 1)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = app_path.with_suffix(app_path.suffix + f".bak_{timestamp}")
    shutil.copy2(app_path, backup_path)

    app_path.write_text(text, encoding="utf-8")

    print("\n✅ Modifiche applicate con successo:")
    for label, _, _ in planned:
        print(f"   ✓ {label}")
    print(f"\n💾 Backup del file originale salvato in: {backup_path}")
    print("👉 Ora controlla il file in VS Code (git diff), testa l'app, poi fai commit + push su master.")


if __name__ == "__main__":
    main()
