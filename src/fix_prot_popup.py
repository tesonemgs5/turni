INPUT  = "App.jsx"
OUTPUT = "App_updated.jsx"

with open(INPUT, "r", encoding="utf-8") as f:
    src = f.read()

old = """              {e.collega&&<div style={{color:"rgba(255,255,255,0.8)",fontSize:11,marginTop:3}}>👮 {e.collega}</div>}"""

new = """              {e.collega&&<div style={{color:"rgba(255,255,255,0.8)",fontSize:11,marginTop:3}}>👮 {e.collega}</div>}
              {(e.protPagFine||e.protRecFine)&&(()=>{
                function calcDurProt(tBase, oraFine){
                  if(!oraFine||!tBase) return "";
                  const [h1,m1]=tBase.split(":").map(Number);
                  const [h2,m2]=oraFine.split(":").map(Number);
                  let d=(h2*60+m2)-(h1*60+m1);
                  if(d<0) d+=24*60;
                  return d>0?Math.floor(d/60)+"h"+(d%60>0?" "+d%60+"m":""):"";
                }
                const tBase = e.tOut||calcFine6h15(e.tIn)||"";
                return (
                  <div style={{marginTop:4,display:"flex",flexDirection:"column",gap:2}}>
                    {e.protPagFine&&<div style={{color:"rgba(255,255,255,0.9)",fontSize:10}}>
                      💜 PAG → {e.protPagFine}{calcDurProt(tBase,e.protPagFine)?" ("+calcDurProt(tBase,e.protPagFine)+")":""}
                    </div>}
                    {e.protRecFine&&<div style={{color:"rgba(255,255,255,0.9)",fontSize:10}}>
                      ⚙️ REC → {e.protRecFine}{calcDurProt(tBase,e.protRecFine)?" ("+calcDurProt(tBase,e.protRecFine)+")":""}
                    </div>}
                  </div>
                );
              })()}"""

if old in src:
    src = src.replace(old, new)
    print("✓ Popup: protrazione visibile")
else:
    print("✗ Blocco NON trovato")

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(src)

print("✅ Fatto → " + OUTPUT)
