#!/usr/bin/env python3
"""
FIX APP - PARTE 1
Applica automaticamente le modifiche richieste ad App.jsx.
Va eseguito dalla cartella src (dove si trova App.jsx).

Uso: python fix_app_parte1.py
Crea App_updated.jsx (poi usa il tuo istruzioni.py per fare il rename + git).
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
                f"⚠️  ATTENZIONE: {descrizione} → trovate {count} occorrenze (attese {occorrenze_attese}). "
                f"Applico comunque su TUTTE le occorrenze."
            )
        content = content.replace(old, new)
        modifiche_ok.append(f"✓ {descrizione}")

    # ═══════════════════════════════════════════════════════════
    # MODIFICA 1: Report - card compatte (lista "Report attivi")
    # Titolo grassetto 14 -> 22 (+8), riga sotto 11 -> 17 (+6)
    # ═══════════════════════════════════════════════════════════
    applica(
        "Report: titolo card compatta (es. 'Conteggio turni') 14px -> 22px",
        '''<div style={{fontSize:14,fontWeight:700,color:T.text,overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
            {r.type==="conteggio_turni"&&(
              <div style={{fontSize:11,color:T.sub}}>''',
        '''<div style={{fontSize:22,fontWeight:700,color:T.text,overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
            {r.type==="conteggio_turni"&&(
              <div style={{fontSize:17,color:T.sub}}>'''
    )

    # ═══════════════════════════════════════════════════════════
    # MODIFICA 2: Modelli -> Turni lista (ModelloCard)
    # Titolo grassetto 19 -> 17 (-2), riga sotto (durata) 14 -> 16 (+2)
    # ═══════════════════════════════════════════════════════════
    applica(
        "ModelloCard (lista Turni): titolo 19px -> 17px, riga durata 14px -> 16px",
        '''        <div style={{fontSize:19,fontWeight:800,color:T.text,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
        <div style={{fontSize:14,color:T.sub,marginTop:1}}>{durata}</div>''',
        '''        <div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub,marginTop:1}}>{durata}</div>'''
    )

    # ═══════════════════════════════════════════════════════════
    # MODIFICA 3: Rotazioni - stesso font/dimensione di Turni
    # RotazioneCard titolo 14 -> 17 (uniforme a ModelloCard)
    # ═══════════════════════════════════════════════════════════
    applica(
        "RotazioneCard: titolo 14px -> 17px (uniforme a ModelloCard)",
        '''        <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:12,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>''',
        '''        <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
        <div style={{fontSize:16,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>'''
    )

    # ═══════════════════════════════════════════════════════════
    # MODIFICA 4: Aggiungi modello -> Scegli modello
    # Stesso ordine di Modelli (sortedModelli invece di filter semplice)
    # e stesso font/dimensione (16/14 -> 17/16 uniforme a ModelloCard)
    # ═══════════════════════════════════════════════════════════
    applica(
        "Scegli modello (picker): usa sortedModelli() per stesso ordine di Modelli",
        '''            {(()=>{
              const mainCalId4 = store.calendars.find(c=>c.isMain)?.id||null;
              const modelliPicker = modelli.filter(m=>{
                const mcid = m.calendarId||mainCalId4;
                return !calId || mcid===calId;
              });
              if(modelliPicker.length===0) return null;''',
        '''            {(()=>{
              const mainCalId4 = store.calendars.find(c=>c.isMain)?.id||null;
              const modelliPicker = sortedModelli().filter(m=>{
                const mcid = m.calendarId||mainCalId4;
                return !calId || mcid===calId;
              });
              if(modelliPicker.length===0) return null;'''
    )
    applica(
        "Scegli modello (picker): font titolo/durata 16/14 -> 17/16 (uniforme a Modelli)",
        '''                          <div style={{fontSize:16,fontWeight:800,color:T.text,overflow:"hidden",
                            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
                          <div style={{fontSize:14,color:T.sub,marginTop:1}}>{durata}</div>''',
        '''                          <div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
                            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
                          <div style={{fontSize:16,color:T.sub,marginTop:1}}>{durata}</div>'''
    )

    # ═══════════════════════════════════════════════════════════
    # MODIFICA 5: Frecce di spostamento immediate (moveH24)
    # Aggiorna lo stato React PRIMA di salvare su Supabase,
    # cosi' il click sposta la card subito (salvataggio in background)
    # ═══════════════════════════════════════════════════════════
    applica(
        "moveH24: aggiornamento UI immediato, salvataggio Supabase in background",
        '''    const reordered=[...sorted];
    const [moved]=reordered.splice(idx,1);
    reordered.splice(swapIdx,0,moved);
    const withNewOrder=reordered.map((m,i)=>({...m,sortOrder:i*10}));
    for(const m of withNewOrder){
      await supabase.from("modelli").update({sort_order:m.sortOrder}).eq("id",m.id).eq("user_id",userId);
    }
    setModelli(withNewOrder);
  }''',
        '''    const reordered=[...sorted];
    const [moved]=reordered.splice(idx,1);
    reordered.splice(swapIdx,0,moved);
    const withNewOrder=reordered.map((m,i)=>({...m,sortOrder:i*10}));
    setModelli(withNewOrder); // aggiornamento UI immediato
    for(const m of withNewOrder){
      supabase.from("modelli").update({sort_order:m.sortOrder}).eq("id",m.id).eq("user_id",userId);
    }
  }'''
    )

    # Stessa logica anche per il drag/drop touch e mouse (onTouchEnd e onDrop nel render dei modelli)
    applica(
        "onTouchEnd riordino modelli: aggiornamento UI immediato",
        '''                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder);
                      for(const x of withNewOrder){
                        await supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      touchSrcId.current=null;touchTargetId.current=null;
                    }:null}''',
        '''                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder); // aggiornamento UI immediato
                      for(const x of withNewOrder){
                        supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      touchSrcId.current=null;touchTargetId.current=null;
                    }:null}'''
    )
    applica(
        "onDrop riordino modelli: aggiornamento UI immediato",
        '''                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder);
                      for(const x of withNewOrder){
                        await supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      dragSrcId.current=null;
                    }:null}/>''',
        '''                      const withNewOrder=reordered.map((x,i)=>({...x,sortOrder:i*10}));
                      setModelli(withNewOrder); // aggiornamento UI immediato
                      for(const x of withNewOrder){
                        supabase.from("modelli").update({sort_order:x.sortOrder}).eq("id",x.id).eq("user_id",userId);
                      }
                      dragSrcId.current=null;
                    }:null}/>'''
    )

    # ═══════════════════════════════════════════════════════════
    # MODIFICA 6: Impostazioni -> Database Cloud Supabase
    # Diventa una sezione collassabile (come Calendari/Sheets)
    # ═══════════════════════════════════════════════════════════
    applica(
        "Impostazioni: 'DATABASE CLOUD SUPABASE' diventa sezione collassabile (SecCollapsible)",
        '<Sec label="DATABASE CLOUD SUPABASE" T={T}>',
        '<SecCollapsible label="DATABASE CLOUD SUPABASE" T={T}>',
        occorrenze_attese=1
    )
    # Bisogna chiudere il tag corretto: troviamo il blocco specifico e cambiamo
    # anche il </Sec> di chiusura corrispondente (e' l'unico blocco che inizia
    # con "Controlla lo stato dei dati memorizzati nel cloud Supabase.")
    applica(
        "Impostazioni: chiusura tag sezione Supabase -> </SecCollapsible>",
        '''        <button onClick={()=>setShowLocalDataModal(true)}
          style={{width:"100%",background:"#7c3aed",border:"none",borderRadius:10,
            color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
          📱 Visualizza Dati Locali (Telefono)
        </button>
      </Sec>''',
        '''        <button onClick={()=>setShowLocalDataModal(true)}
          style={{width:"100%",background:"#7c3aed",border:"none",borderRadius:10,
            color:"#fff",padding:"11px 0",cursor:"pointer",fontWeight:800,fontSize:12}}>
          📱 Visualizza Dati Locali (Telefono)
        </button>
      </SecCollapsible>'''
    )

    # ═══════════════════════════════════════════════════════════
    # SALVATAGGIO
    # ═══════════════════════════════════════════════════════════
    print("=" * 70)
    print(" RISULTATO MODIFICHE")
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
    print("NOTE IMPORTANTI:")
    print(" - Punto 4 (ordine cronologico libero per turni senza orario/H24): la")
    print("   logica di sortedModelli() già permette posizionamento manuale tramite")
    print("   modelliSort='manuale' e sortOrder. Se vuoi che siano SEMPRE liberi anche")
    print("   in modalità 'orario', serve specificare meglio: dimmelo nella prossima")
    print("   richiesta così te lo implemento nel file_2.")
    print(" - Rotazioni: ho uniformato i fontSize delle RotazioneCard a quelli di")
    print("   ModelloCard. Se nella UI 'Rotazioni' ci sono ALTRI elementi con font")
    print("   diversi da armonizzare, mandami uno screenshot specifico.")

if __name__ == "__main__":
    main()
