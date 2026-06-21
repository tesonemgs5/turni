#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_backup_cloud.py
--------------------
Sostituisce handleExportSupabase / handleImportSupabase per usare la tabella
"backups" su Supabase invece di file locali, e aggiunge uno stato + modale
per scegliere quale backup ripristinare.

PREREQUISITO: aver già eseguito create_backups_table.sql su Supabase.

USO:
    1. Copia questo file nella cartella del progetto (dove c'è src/App.jsx)
    2. python fix_backup_cloud.py
    3. Backup automatico creato prima di modificare.
"""

import sys
import shutil
import re
from pathlib import Path
from datetime import datetime

APP_PATH = Path("src/App.jsx")


def fail(msg):
    print(f"\n❌ ERRORE: {msg}")
    print("Nessuna modifica è stata salvata. Il file App.jsx è rimasto intatto.")
    sys.exit(1)


def main():
    if not APP_PATH.exists():
        fail(
            f"Non trovo il file '{APP_PATH}'.\n"
            f"Esegui questo script dalla cartella principale del progetto."
        )

    original = APP_PATH.read_text(encoding="utf-8")
    text = original
    applied = []

    # ─────────────────────────────────────────────────────────────
    # FIX 1: sostituisce handleExportSupabase + handleImportSupabase
    # ─────────────────────────────────────────────────────────────
    old_block = '''  async function handleExportSupabase(){
    setSyncMsg("⏳ Esportazione in corso...");
    try {
      const {data:cals} = await supabase.from("calendars").select("*").eq("user_id",userId);
      const {data:evts} = await supabase.from("events").select("*").eq("user_id",userId);
      const {data:mods} = await supabase.from("modelli").select("*").eq("user_id",userId);
      const {data:rots} = await supabase.from("rotazioni").select("*").eq("user_id",userId);
      const {data:sett} = await supabase.from("user_settings").select("*").eq("user_id",userId).maybeSingle();
      const backup = {
        exported_at: new Date().toISOString(),
        calendars: cals||[], events: evts||[], modelli: mods||[],
        rotazioni: rots||[], user_settings: sett||null,
      };
      const blob = new Blob([JSON.stringify(backup,null,2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_calendario_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSyncMsg("✅ Backup scaricato");
    } catch(e){ console.error(e); setSyncMsg("❌ Errore durante l'esportazione"); }
  }

  async function handleImportSupabase(file){
    if(!file) return;
    setSyncMsg("⏳ Importazione in corso...");
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if(!window.confirm("Questo SOVRASCRIVERÀ tutti i dati attuali con quelli del backup. Continuare?")) {
        setSyncMsg(""); return;
      }
      await supabase.from("events").delete().eq("user_id",userId);
      await supabase.from("calendars").delete().eq("user_id",userId);
      await supabase.from("modelli").delete().eq("user_id",userId);
      await supabase.from("rotazioni").delete().eq("user_id",userId);

      const calIdMap = {};
      for(const c of (backup.calendars||[])){
        const {data} = await supabase.from("calendars").insert({
          user_id:userId, name:c.name, color:c.color, is_main:c.is_main, shifts:c.shifts||[],
        }).select().maybeSingle();
        if(data) calIdMap[c.id] = data.id;
      }
      const modIdMap = {};
      for(const m of (backup.modelli||[])){
        const {data} = await supabase.from("modelli").insert({
          user_id:userId, titolo:m.titolo, tempo:m.tempo, inizio:m.inizio, fine:m.fine,
          colore:m.colore, colore_custom:m.colore_custom, posizione:m.posizione,
          sort_order:m.sort_order, calendar_id: calIdMap[m.calendar_id]||null,
        }).select().maybeSingle();
        if(data) modIdMap[m.id] = data.id;
      }
      for(const e of (backup.events||[])){
        await supabase.from("events").insert({
          user_id:userId, calendar_id: calIdMap[e.calendar_id]||e.calendar_id,
          date_key:e.date_key, label:e.label, color:e.color, all_day:e.all_day,
          time_in:e.time_in, time_out:e.time_out, place:e.place, map_url:e.map_url,
          note:e.note, modello_id: modIdMap[e.modello_id]||null,
          collega:e.collega, auto:e.auto,
        });
      }
      for(const r of (backup.rotazioni||[])){
        await supabase.from("rotazioni").insert({
          user_id:userId, tipo:r.tipo, titolo:r.titolo, data_inizio:r.data_inizio,
          n_settimane:r.n_settimane,
          modello_lavoro_id: modIdMap[r.modello_lavoro_id]||null,
          modello_nl_id: modIdMap[r.modello_nl_id]||null,
          modello_rs_id: modIdMap[r.modello_rs_id]||null,
          griglia:r.griglia||{},
        });
      }
      setSyncMsg("✅ Importazione completata — ricarico l'app...");
      setTimeout(()=>window.location.reload(), 1500);
    } catch(e){ console.error(e); setSyncMsg("❌ Errore durante l'importazione: "+e.message); }
  }'''

    new_block = '''  async function buildBackupPayload(){
    const {data:cals} = await supabase.from("calendars").select("*").eq("user_id",userId);
    const {data:evts} = await supabase.from("events").select("*").eq("user_id",userId);
    const {data:mods} = await supabase.from("modelli").select("*").eq("user_id",userId);
    const {data:rots} = await supabase.from("rotazioni").select("*").eq("user_id",userId);
    const {data:sett} = await supabase.from("user_settings").select("*").eq("user_id",userId).maybeSingle();
    return {
      exported_at: new Date().toISOString(),
      calendars: cals||[], events: evts||[], modelli: mods||[],
      rotazioni: rots||[], user_settings: sett||null,
    };
  }

  async function handleExportSupabase(){
    setSyncMsg("⏳ Esportazione in corso...");
    try {
      const backup = await buildBackupPayload();
      // Salva lo snapshot nel cloud (tabella "backups" su Supabase)
      const {error:insErr} = await supabase.from("backups").insert({
        user_id:userId, data:backup,
      });
      if(insErr) throw insErr;
      setSyncMsg("✅ Backup salvato su Supabase");
    } catch(e){ console.error(e); setSyncMsg("❌ Errore durante l'esportazione: "+e.message); }
  }

  async function handleOpenImportSupabase(){
    setSyncMsg("⏳ Carico elenco backup...");
    try {
      const {data, error} = await supabase.from("backups")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", {ascending:false})
        .limit(20);
      if(error) throw error;
      setBackupsList(data||[]);
      setShowBackupsModal(true);
      setSyncMsg("");
    } catch(e){ console.error(e); setSyncMsg("❌ Errore nel caricare i backup: "+e.message); }
  }

  async function handleRestoreBackup(backupId){
    if(!window.confirm("Questo SOVRASCRIVERÀ tutti i dati attuali con quelli del backup selezionato. Continuare?")) return;
    setSyncMsg("⏳ Importazione in corso...");
    setShowBackupsModal(false);
    try {
      const {data:row, error} = await supabase.from("backups").select("data").eq("id", backupId).eq("user_id", userId).maybeSingle();
      if(error) throw error;
      if(!row?.data) throw new Error("Backup non trovato");
      const backup = row.data;

      await supabase.from("events").delete().eq("user_id",userId);
      await supabase.from("calendars").delete().eq("user_id",userId);
      await supabase.from("modelli").delete().eq("user_id",userId);
      await supabase.from("rotazioni").delete().eq("user_id",userId);

      const calIdMap = {};
      for(const c of (backup.calendars||[])){
        const {data} = await supabase.from("calendars").insert({
          user_id:userId, name:c.name, color:c.color, is_main:c.is_main, shifts:c.shifts||[],
        }).select().maybeSingle();
        if(data) calIdMap[c.id] = data.id;
      }
      const modIdMap = {};
      for(const m of (backup.modelli||[])){
        const {data} = await supabase.from("modelli").insert({
          user_id:userId, titolo:m.titolo, tempo:m.tempo, inizio:m.inizio, fine:m.fine,
          colore:m.colore, colore_custom:m.colore_custom, posizione:m.posizione,
          sort_order:m.sort_order, calendar_id: calIdMap[m.calendar_id]||null,
        }).select().maybeSingle();
        if(data) modIdMap[m.id] = data.id;
      }
      for(const e of (backup.events||[])){
        await supabase.from("events").insert({
          user_id:userId, calendar_id: calIdMap[e.calendar_id]||e.calendar_id,
          date_key:e.date_key, label:e.label, color:e.color, all_day:e.all_day,
          time_in:e.time_in, time_out:e.time_out, place:e.place, map_url:e.map_url,
          note:e.note, modello_id: modIdMap[e.modello_id]||null,
          collega:e.collega, auto:e.auto,
        });
      }
      for(const r of (backup.rotazioni||[])){
        await supabase.from("rotazioni").insert({
          user_id:userId, tipo:r.tipo, titolo:r.titolo, data_inizio:r.data_inizio,
          n_settimane:r.n_settimane,
          modello_lavoro_id: modIdMap[r.modello_lavoro_id]||null,
          modello_nl_id: modIdMap[r.modello_nl_id]||null,
          modello_rs_id: modIdMap[r.modello_rs_id]||null,
          griglia:r.griglia||{},
        });
      }
      setSyncMsg("✅ Importazione completata — ricarico l'app...");
      setTimeout(()=>window.location.reload(), 1500);
    } catch(e){ console.error(e); setSyncMsg("❌ Errore durante l'importazione: "+e.message); }
  }'''

    count = text.count(old_block)
    if count == 1:
        text = text.replace(old_block, new_block)
        applied.append("handleExportSupabase / handleImportSupabase: ora usano la tabella backups su Supabase")
    elif count == 0:
        fail(
            "Non ho trovato il blocco esatto di handleExportSupabase/handleImportSupabase. "
            "Probabilmente il codice è già stato modificato o è leggermente diverso. "
            "Nessuna modifica applicata, controlla manualmente."
        )
    else:
        fail(f"Trovate {count} occorrenze impreviste del blocco. Per sicurezza non procedo.")

    # ─────────────────────────────────────────────────────────────
    # FIX 2: aggiunge gli stati React necessari (backupsList, showBackupsModal)
    # ─────────────────────────────────────────────────────────────
    pattern = re.compile(r'(const \[syncMsg,\s*setSyncMsg\]\s*=\s*useState\([^)]*\);)')
    match = pattern.search(text)
    if match:
        insertion = match.group(1) + "\n  const [backupsList, setBackupsList] = useState([]);\n  const [showBackupsModal, setShowBackupsModal] = useState(false);"
        text = text[:match.start()] + insertion + text[match.end():]
        applied.append("Aggiunti stati React: backupsList, showBackupsModal")
    else:
        print("\n⚠️  ATTENZIONE: non ho trovato 'const [syncMsg, setSyncMsg] = useState(...)'.")
        print("    Dovrai aggiungere manualmente queste due righe vicino agli altri useState:")
        print("    const [backupsList, setBackupsList] = useState([]);")
        print("    const [showBackupsModal, setShowBackupsModal] = useState(false);")

    # ─────────────────────────────────────────────────────────────
    # FIX 3: aggiorna il pulsante "Importa su Supabase" in Settings
    # ─────────────────────────────────────────────────────────────
    old_button = '''          <label style={{flex:1,background:"#2563eb",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12,
              textAlign:"center",display:"block"}}>
            📥 Importa su Supabase
            <input type="file" accept=".json" style={{display:"none"}}
              onChange={e=>handleImportSupabase(e.target.files[0])}/>
          </label>
        </div>
      </Sec>'''

    new_button = '''          <button onClick={handleOpenImportSupabase}
            style={{flex:1,background:"#2563eb",border:"none",borderRadius:10,
              color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
            📥 Importa su Supabase
          </button>
        </div>
      </Sec>

      {showBackupsModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,
          display:"flex",alignItems:"flex-end"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowBackupsModal(false);}}>
          <div style={{background:T.surface,borderRadius:"18px 18px 0 0",width:"100%",
            maxWidth:480,margin:"0 auto",maxHeight:"80vh",overflowY:"auto",padding:"16px"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:16,fontWeight:900,color:T.text}}>Backup disponibili</div>
              <button onClick={()=>setShowBackupsModal(false)}
                style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            {backupsList.length===0?(
              <div style={{textAlign:"center",padding:"24px",color:T.sub,fontSize:13}}>
                Nessun backup trovato. Usa "Esporta da Supabase" per crearne uno.
              </div>
            ):(
              backupsList.map(b=>(
                <button key={b.id} onClick={()=>handleRestoreBackup(b.id)}
                  style={{display:"block",width:"100%",textAlign:"left",background:T.s2,
                    border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",
                    marginBottom:8,cursor:"pointer",color:T.text,fontSize:13,fontWeight:700}}>
                  📦 {new Date(b.created_at).toLocaleString("it-IT")}
                </button>
              ))
            )}
          </div>
        </div>
      )}'''

    count2 = text.count(old_button)
    if count2 == 1:
        text = text.replace(old_button, new_button)
        applied.append("Pulsante 'Importa su Supabase': ora apre la lista backup dal cloud, niente file locali")
    elif count2 == 0:
        print("\n⚠️  ATTENZIONE: non ho trovato il blocco del pulsante 'Importa su Supabase' da sostituire.")
        print("    Le funzioni sono state aggiornate, ma il pulsante nell'interfaccia potrebbe")
        print("    ancora richiedere un file. Controlla manualmente in Sezione 13 (Settings View).")
    else:
        fail(f"Trovate {count2} occorrenze impreviste del blocco pulsante. Per sicurezza non procedo.")

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
