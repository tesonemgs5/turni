"""
modifica_straordinari.py
------------------------
Sostituisce la funzione StraordinariView in App.jsx con una versione
che mostra:
  - Totale minuti/ore di protrazione a PAGAMENTO
  - Totale minuti/ore di protrazione a RECUPERO (saldo)
I dati vengono letti dal campo `note` degli eventi, dove App.jsx
scrive già "Protrazione: +Xh Ym" o "Anticipo: Xh Ym".
"""

import re, sys, os

APP_PATH = os.path.join(os.path.dirname(__file__), "App.jsx")

# ── VECCHIO (placeholder) ─────────────────────────────────────
OLD = """function StraordinariView({T, data}){
  return (
    <div style={{background:T.surface,borderRadius:10,padding:12}}>
      <div style={{fontSize:11,color:T.sub,marginBottom:8}}>Protrazioni e straordinari</div>
      <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"12px 0"}}>
        I dati verranno calcolati quando gli eventi avranno orari dettagliati.
      </div>
    </div>
  );
}"""

# ── NUOVO ─────────────────────────────────────────────────────
NEW = """function StraordinariView({T, data, store, reportRange}){
  // Calcola protrazioni leggendo il campo `note` di ogni evento
  // App.jsx scrive già:
  //   "Protrazione: +Xh Ym"  per pagamento (straordinarioTipo==="pagamento")
  //   "Anticipo: Xh Ym"      per recupero  (straordinarioTipo==="recupero")
  // e salva straordinarioTipo nel campo auto come suffisso ":PAG" o ":REC"
  // Per ora leggiamo la nota e il campo auto per distinguerli.

  const {from, to} = reportRange || {from:"", to:""};

  let minPagamento = 0;
  let minRecupero  = 0;

  for(const [dateKey, calMap] of Object.entries(store?.events||{})){
    if(from && dateKey < from) continue;
    if(to   && dateKey > to  ) continue;
    for(const [, evts] of Object.entries(calMap)){
      for(const e of evts){
        const nota  = (e.note||"").toUpperCase();
        const auto  = (e.auto||"").toUpperCase();
        // Legge minuti dalla nota "PROTRAZIONE: +Xh Ym" o "ANTICIPO: Xh Ym"
        const matchProt = nota.match(/PROTRAZIONE[^+]*\\+?(\\d+)H(?:\\s*(\\d+)M)?/);
        const matchAnti = nota.match(/ANTICIPO[^0-9]*(\\d+)H(?:\\s*(\\d+)M)?/);
        if(matchProt){
          const mins = parseInt(matchProt[1]||0)*60 + parseInt(matchProt[2]||0);
          // Distingue pagamento da recupero tramite campo auto
          if(auto.includes(":REC")) minRecupero  += mins;
          else                      minPagamento += mins;
        }
        if(matchAnti){
          const mins = parseInt(matchAnti[1]||0)*60 + parseInt(matchAnti[2]||0);
          minRecupero -= mins; // anticipo riduce il saldo recupero
        }
      }
    }
  }

  function fmtMins(m){
    const sign = m < 0 ? "-" : "+";
    const abs  = Math.abs(m);
    const h    = Math.floor(abs/60);
    const min  = abs%60;
    return sign + h + "h" + (min>0?" "+min+"m":"");
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {/* Protrazione a PAGAMENTO */}
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>
          PROTRAZIONE A PAGAMENTO
        </div>
        {minPagamento===0?(
          <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>
            Nessuna protrazione a pagamento nel periodo
          </div>
        ):(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"10px 12px",background:"#8b5cf622",borderRadius:8,border:"1px solid #8b5cf644"}}>
            <span style={{fontSize:13,fontWeight:700,color:"#8b5cf6"}}>Totale</span>
            <span style={{fontSize:20,fontWeight:900,color:"#8b5cf6"}}>{fmtMins(minPagamento)}</span>
          </div>
        )}
      </div>

      {/* Saldo RECUPERO */}
      <div style={{background:T.surface,borderRadius:10,padding:12}}>
        <div style={{fontSize:11,color:T.sub,fontWeight:700,marginBottom:8}}>
          SALDO RECUPERO
        </div>
        {minRecupero===0?(
          <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>
            Nessuna protrazione a recupero nel periodo
          </div>
        ):(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"10px 12px",
            background:minRecupero>=0?"#22c55e22":"#ef444422",
            borderRadius:8,
            border:`1px solid ${minRecupero>=0?"#22c55e44":"#ef444444"}`}}>
            <span style={{fontSize:13,fontWeight:700,
              color:minRecupero>=0?"#22c55e":"#ef4444"}}>
              {minRecupero>=0?"Credito":"Debito"}
            </span>
            <span style={{fontSize:20,fontWeight:900,
              color:minRecupero>=0?"#22c55e":"#ef4444"}}>
              {fmtMins(minRecupero)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}"""

# ── ESECUZIONE ────────────────────────────────────────────────
def main():
    if not os.path.exists(APP_PATH):
        print(f"ERRORE: file non trovato → {APP_PATH}")
        sys.exit(1)

    with open(APP_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    if OLD not in content:
        print("ERRORE: il blocco da sostituire non è stato trovato in App.jsx")
        print("Controlla che StraordinariView non sia già stata modificata.")
        sys.exit(1)

    new_content = content.replace(OLD, NEW, 1)

    # Ora aggiorna anche il punto dove StraordinariView viene chiamata,
    # passando store e reportRange come props
    OLD_CALL = "{r.type===\"straordinari\" && <StraordinariView T={T} data={data}/>}"
    NEW_CALL  = "{r.type===\"straordinari\" && <StraordinariView T={T} data={data} store={store} reportRange={{from:range.from,to:range.to}}/>}"

    if OLD_CALL in new_content:
        new_content = new_content.replace(OLD_CALL, NEW_CALL, 1)
        print("✅ Chiamata StraordinariView aggiornata con store e reportRange")
    else:
        print("⚠️  Chiamata StraordinariView non trovata — aggiornala manualmente passando store e reportRange")

    with open(APP_PATH, "w", encoding="utf-8") as f:
        f.write(new_content)

    print("✅ StraordinariView sostituita con successo in App.jsx")
    print("   → Mostra: Protrazione a PAGAMENTO (totale ore) + Saldo RECUPERO (+/-)")
    print()
    print("PROSSIMO PASSO: distinguere pagamento da recupero al salvataggio evento.")
    print("Quando sei pronto dimmelo e aggiungo il suffisso :PAG/:REC nel campo auto.")

if __name__ == "__main__":
    main()
