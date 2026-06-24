with open("App.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# FIX 1: saveEvt — aggiunge tipoProtrazione mancante
old1 = """    let evtFiglio = null; // "pagamento" | "recupero" | null
    const oraFineProtrazione = form.protrazioneOraFine || "";

    function calcMinutiProtrazione(t1, t2){
      if(!t1||!t2) return 0;
      const [h1,m1]=t1.split(":").map(Number);
      const [h2,m2]=t2.split(":").map(Number);
      let d=(h2*60+m2)-(h1*60+m1);
      if(d<0) d+=24*60;
      return d;
    }
    function formatDurataProtrazione(mins){
      const hh = Math.floor(mins/60);
      const mm = mins%60;
      return (hh>0?hh+"h":"") + (mm>0?(hh>0?" ":"")+mm+"m":"") || "0m";
    }

    if(tipoProtrazione && oraFineProtrazione && tInFinal){"""

new1 = """    let evtFiglio = null; // "pagamento" | "recupero" | null
    const tipoProtrazione = form.straordinarioTipo;
    const oraFineProtrazione = form.protrazioneOraFine || "";

    function calcMinutiProtrazione(t1, t2){
      if(!t1||!t2) return 0;
      const [h1,m1]=t1.split(":").map(Number);
      const [h2,m2]=t2.split(":").map(Number);
      let d=(h2*60+m2)-(h1*60+m1);
      if(d<0) d+=24*60;
      return d;
    }
    function formatDurataProtrazione(mins){
      const hh = Math.floor(mins/60);
      const mm = mins%60;
      return (hh>0?hh+"h":"") + (mm>0?(hh>0?" ":"")+mm+"m":"") || "0m";
    }

    if(tipoProtrazione && oraFineProtrazione && tInFinal){"""

count = 0
if old1 in content:
    content = content.replace(old1, new1, 1)
    count += 1
    print("✅ Fix 1 applicato: saveEvt")
else:
    print("❌ Fix 1 NON trovato: saveEvt")

# FIX 2: updateEvt — stessa aggiunta
old2 = """    let evtFiglio = null;
    let figlioDaRimuovereId = null;
    const oraFineProtrazione = form.protrazioneOraFine || "";

    function calcMinutiProtrazione(t1, t2){
      if(!t1||!t2) return 0;
      const [h1,m1]=t1.split(":").map(Number);
      const [h2,m2]=t2.split(":").map(Number);
      let d=(h2*60+m2)-(h1*60+m1);
      if(d<0) d+=24*60;
      return d;
    }
    function formatDurataProtrazione(mins){
      const hh = Math.floor(mins/60);
      const mm = mins%60;
      return (hh>0?hh+"h":"") + (mm>0?(hh>0?" ":"")+mm+"m":"") || "0m";
    }

    const listaCorrente"""

new2 = """    let evtFiglio = null;
    let figlioDaRimuovereId = null;
    const tipoProtrazione = form.straordinarioTipo;
    const oraFineProtrazione = form.protrazioneOraFine || "";

    function calcMinutiProtrazione(t1, t2){
      if(!t1||!t2) return 0;
      const [h1,m1]=t1.split(":").map(Number);
      const [h2,m2]=t2.split(":").map(Number);
      let d=(h2*60+m2)-(h1*60+m1);
      if(d<0) d+=24*60;
      return d;
    }
    function formatDurataProtrazione(mins){
      const hh = Math.floor(mins/60);
      const mm = mins%60;
      return (hh>0?hh+"h":"") + (mm>0?(hh>0?" ":"")+mm+"m":"") || "0m";
    }

    const listaCorrente"""

if old2 in content:
    content = content.replace(old2, new2, 1)
    count += 1
    print("✅ Fix 2 applicato: updateEvt")
else:
    print("❌ Fix 2 NON trovato: updateEvt")

if count > 0:
    with open("App_updated.jsx", "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\n✅ App_updated.jsx salvato ({count} fix applicati)")
else:
    print("\n❌ Nessun fix applicato")
