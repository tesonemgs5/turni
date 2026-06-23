#!/usr/bin/env python3
"""
FIX APP - PARTE 6
Il tasto "🔄 Ricarica dati" finora ricaricava solo i dati da Supabase
(calendari/eventi/modelli) dentro lo stato React, ma se l'app è
installata come PWA sul telefono, la pagina HTML/JS stessa può restare
servita dalla cache del Service Worker / cache del browser, quindi
sembra "non cambiare mai" anche dopo il tasto ricarica.

Questa modifica fa sì che il tasto:
1) cancelli la cache locale (già lo faceva)
2) cancelli anche le cache del Service Worker (se presente)
3) deregistri eventuali Service Worker registrati
4) forzi un reload REALE della pagina (non solo un re-fetch dei dati),
   così il browser è costretto a scaricare la versione più recente
   di App.jsx/bundle invece di servire quella vecchia in cache.

Va eseguito dalla cartella src (dove si trova App.jsx).
Uso: python fix_app_parte6.py
Crea App_updated.jsx (poi usa il tuo istruzioni.py per rename + git).
"""

import os
import sys

FILE_INPUT = "App.jsx"
FILE_OUTPUT = "App_updated.jsx"

def main():
    if not os.path.exists(FILE_INPUT):
        print(f"❌ ERRORE: {FILE_INPUT} non trovato in questa cartella!")
        print("   Esegui questo script dalla cartella 'src' del progetto.")
        sys.exit(1)

    with open(FILE_INPUT, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content
    modifiche_ok = []
    modifiche_fallite = []

    def applica(descrizione, old, new, occorrenze_attese=1):
        nonlocal content
        count = content.count(old)
        if count == 0:
            modifiche_fallite.append(f"❌ NON TROVATO: {descrizione}")
            return
        if count != occorrenze_attese:
            modifiche_fallite.append(
                f"⚠️  ATTENZIONE: {descrizione} → trovate {count} occorrenze (attese {occorrenze_attese})."
            )
        content = content.replace(old, new)
        modifiche_ok.append(f"✓ {descrizione}")

    # ═══════════════════════════════════════════════════════════
    # MODIFICA: bottone 🔄 ricarica anche cache PWA/Service Worker
    # e forza un reload reale della pagina, non solo il re-fetch dati.
    # ═══════════════════════════════════════════════════════════
    applica(
        "Bottone 🔄 Ricarica: aggiungo pulizia cache Service Worker + reload reale della pagina",
        '''        <button onClick={async()=>{
          clearLocalStorageCache();
          const {data:cals}=await supabase.from("calendars").select("*").eq("user_id",userId).order("created_at");
          const {data:evts}=await supabase.from("events").select("*").eq("user_id",userId);
          const {data:mods}=await supabase.from("modelli").select("*").eq("user_id",userId).order("sort_order");
          const calendars=(cals||[]).map(c=>({id:c.id,name:c.name,color:c.color,isMain:c.is_main,shifts:c.shifts||[]}));
          const events={};
          (evts||[]).forEach(e=>{
            if(!events[e.date_key]) events[e.date_key]={};
            if(!events[e.date_key][e.calendar_id]) events[e.date_key][e.calendar_id]=[];
            events[e.date_key][e.calendar_id].push({id:e.id,label:e.label,color:e.color,allDay:e.all_day,tIn:e.time_in||"",tOut:e.time_out||"",place:e.place||"",map:e.map_url||"",note:e.note||"",modelloId:e.modello_id||null,collega:e.collega||null,auto:e.auto||""});
          });
          setStore(s=>({...s,calendars,events}));
          setModelli((mods||[]).map(m=>({id:m.id,titolo:m.titolo,tempo:m.tempo,inizio:m.inizio||"",fine:m.fine||"",colore:m.colore,coloreCustom:m.colore_custom||null,posizione:m.posizione||"",sortOrder:m.sort_order||0,calendarId:m.calendar_id||null})));
          setCalId(calendars[0]?.id||null);
          setBanner("✅ Dati ricaricati!");
          setTimeout(()=>setBanner(null),500);
        }}
          title="Ricarica dati"''',
        '''        <button onClick={async()=>{
          setBanner("⏳ Svuotamento cache...");
          clearLocalStorageCache();
          // Svuota tutte le cache del Service Worker (PWA), se presenti
          try {
            if("caches" in window){
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(name=>caches.delete(name)));
            }
          } catch(e){ console.warn("Errore pulizia cache SW:", e); }
          // Deregistra eventuali Service Worker registrati, cosi' al prossimo
          // reload il browser scarica per forza la versione più recente
          try {
            if("serviceWorker" in navigator){
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r=>r.unregister()));
            }
          } catch(e){ console.warn("Errore unregister Service Worker:", e); }
          // Reload REALE della pagina (non solo re-fetch dati): forza il
          // browser a richiedere di nuovo tutti i file invece di servirli
          // dalla cache locale del telefono/browser.
          window.location.reload(true);
        }}
          title="Svuota cache e ricarica tutto"''',
    )

    # ═══════════════════════════════════════════════════════════
    # SALVATAGGIO
    # ═══════════════════════════════════════════════════════════
    print("=" * 70)
    print(" RISULTATO MODIFICHE - PARTE 6 (fix cache/ricarica)")
    print("=" * 70)
    for m in modifiche_ok:
        print(m)
    if modifiche_fallite:
        print()
        print(" ⚠️  PROBLEMI:")
        for m in modifiche_fallite:
            print(" " + m)

    if content == original_content:
        print()
        print("❌ Nessuna modifica applicata (file identico). Non salvo nulla.")
        sys.exit(1)

    with open(FILE_OUTPUT, "w", encoding="utf-8") as f:
        f.write(content)

    print()
    print(f"✅ File salvato come: {FILE_OUTPUT}")
    print("   Ora esegui il tuo launcher (avvia_istruzioni.bat) per fare rename + git.")
    print()
    print("IMPORTANTE: dato che ora il bottone fa un window.location.reload(),")
    print("il codice che ricaricava manualmente i dati (calendari/eventi/modelli)")
    print("non serve più qui: dopo il reload della pagina, l'app li ricarica già")
    print("da sola al boot (vedi SEZIONE 7 — useEffect init). Se vuoi mantenere")
    print("ANCHE il vecchio comportamento di re-fetch senza reload completo come")
    print("opzione separata, fammelo sapere e te lo aggiungo come bottone extra.")

if __name__ == "__main__":
    main()
