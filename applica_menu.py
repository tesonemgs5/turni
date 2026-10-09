#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
applica_menu.py - progetto Turni. SOLO queste modifiche al form "modifica evento" (src/02-Modelli.jsx):

  1) Titolo visualizzato e nome del modello NON sono piu' sempre visibili: escono da una freccia
     accanto al titolo (es. AUTO).
  2) Accanto all'orario del turno (es. 07:15->13:30) c'e' una freccia che apre i campi HH:MM modificabili.
  3) Il pop-up "Solo questo evento / Tutti gli eventi / Da questo evento in poi" compare SOLO se cambi:
     titolo visualizzato, nome del modello, colore oppure l'orario del turno (quello accanto al titolo).
     Per tutto il resto (ingresso/uscita effettiva, luogo, note...) si salva direttamente sul singolo evento.
  4) "Per tutti" e "Da questo evento in poi" usano l'orario del turno, non piu' l'ingresso effettivo.

Non tocca altri file. Uso (dalla cartella del progetto, dopo git pull):  python applica_menu.py
Opzioni: --si (non chiede conferme)  --senza-push
"""
import os, sys, shutil, subprocess

ARGS = set(sys.argv[1:])
SI = "--si" in ARGS


def say(t): print(t, flush=True)

def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")

def chiedi(domanda):
    if SI: return True
    r = input(domanda + " (s/n) ").strip().lower()
    return r in ("s", "si", "y", "yes")

def _applica(t, ops):
    for op in ops:
        k = op[0]
        if k == "tra":
            _, a, b, nuovo = op
            if t.count(a) != 1 or t.count(b) != 1:
                return None, "punto di partenza o di arrivo non trovato: " + a.strip()[:60]
            i = t.find(a); j = t.find(b, i)
            if j <= i: return None, "punti in ordine inatteso: " + a.strip()[:60]
            t = t[:i] + nuovo + t[j:]
            continue
        _, a, nuovo = op
        if t.count(a) != 1:
            return None, "punto non trovato o non unico: " + a.strip()[:70]
        if k == "dopo": t = t.replace(a, a + nuovo)
        elif k == "prima": t = t.replace(a, nuovo + a)
        elif k == "sost": t = t.replace(a, nuovo)
    return t, None

def patch_file(root, rel, segno, ops):
    p = os.path.join(root, rel)
    if not os.path.isfile(p):
        say("  [!!] non trovo " + rel); return False
    with open(p, "r", encoding="utf-8", newline="") as f: orig = f.read()
    if segno in orig:
        say("  [--] gia' presente in " + rel); return True
    eol = "\r\n" if "\r\n" in orig else "\n"
    t, err = _applica(orig.replace("\r\n", "\n"), ops)
    if err:
        say("  [!!] " + rel + " e' diverso dal previsto (" + err + "): non lo tocco"); return False
    b = os.path.join(root, "_backup_prima_applica", rel)
    if not os.path.exists(b):
        os.makedirs(os.path.dirname(b), exist_ok=True); shutil.copy2(p, b)
    with open(p, "w", encoding="utf-8", newline="") as f: f.write(t.replace("\n", eol))
    say("  [OK] modificato " + rel); return True

def scrivi_file(root, rel, contenuto):
    dst = os.path.join(root, rel)
    vecchio = ""
    if os.path.isfile(dst):
        with open(dst, "r", encoding="utf-8", newline="") as f: vecchio = f.read()
    eol = "\r\n" if "\r\n" in vecchio else "\n"
    if vecchio.replace("\r\n", "\n") == contenuto:
        say("  [--] " + rel + " gia' aggiornato"); return
    with open(dst, "w", encoding="utf-8", newline="") as f: f.write(contenuto.replace("\n", eol))
    say("  [OK] scritto " + rel)


# ---- intestazione: titolo + freccia, orario + freccia, ed eventuale campo orario
H_A = "            {form.editId&&(\n              <div onClick={()=>setForm(f=>({...f,_showModPicker:!f._showModPicker}))}"
H_B = "            {modelli.length>0&&form.editId&&form._showModPicker&&(()=>{\n"
H_N = r"""            {form.editId&&(
              <div onClick={()=>setForm(f=>({...f,_showModPicker:!f._showModPicker}))}
                style={{fontSize:24,color:T.text,fontWeight:900,marginBottom:12,letterSpacing:1,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {(form.label||"EVENTO").toUpperCase()}
                <span onClick={e=>{e.stopPropagation();setForm(f=>({...f,_apriTitoli:!f._apriTitoli}));}}
                  style={{fontSize:16,color:T.sub,cursor:"pointer",padding:"2px 6px"}}>{form._apriTitoli?"\u25B2":"\u25BC"}</span>
                {(()=>{
                  const idModelloAttuale = form.modelloId || form.evtModelloId;
                  const modSel = idModelloAttuale && modelli.find(m=>m.id===idModelloAttuale);
                  if(!modSel || modSel.tempo==="h24" || !modSel.inizio) return null;
                  return (
                    <>
                      <span style={{fontSize:14,color:T.sub,fontWeight:700}}>{modSel.inizio}{"\u2192"}{calcFineModello(modSel)||modSel.fine||""}</span>
                      <span onClick={e=>{e.stopPropagation();setForm(f=>({...f,_apriOrario:!f._apriOrario}));}}
                        style={{fontSize:16,color:T.sub,cursor:"pointer",padding:"2px 6px"}}>{form._apriOrario?"\u25B2":"\u25BC"}</span>
                    </>
                  );
                })()}
                <span style={{fontSize:12,color:T.sub,fontWeight:700}}>{"\u270E"} cambia modello</span>
              </div>
            )}
            {form.editId&&form._apriOrario&&(()=>{
              const idm = form.modelloId || form.evtModelloId;
              const ms = idm && modelli.find(m=>m.id===idm);
              if(!ms || ms.tempo==="h24") return null;
              const inV = form.offIn!==undefined ? form.offIn : (ms.inizio||"");
              const outV = form.offOut!==undefined ? form.offOut : (calcFineModello(ms)||ms.fine||"");
              const stile = {width:"100%",background:T.surface,border:`1px solid ${T.border}`,
                borderRadius:8,padding:"7px 8px",color:T.text,fontSize:13,outline:"none"};
              return (
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:3}}>ORARIO DEL TURNO (cambia il turno, non l'ingresso effettivo)</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <SmartTimeInput value={inV} style={stile}
                        onChange={v=>setForm(f=>({...f,offIn:v,
                          offOut: ms.tempo==="6h15"&&v ? calcFine6h15(v) : ms.tempo==="6h30"&&v ? calcFine6h30(v) : (f.offOut!==undefined ? f.offOut : outV)}))}/>
                    </div>
                    <span style={{color:T.sub,fontWeight:700}}>{"\u2192"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <SmartTimeInput value={outV} style={stile}
                        onChange={v=>setForm(f=>({...f,offOut:v,offIn:f.offIn!==undefined?f.offIn:inV}))}/>
                    </div>
                  </div>
                </div>
              );
            })()}
"""

# ---- i due campi diventano visibili in modifica solo se la freccia e' aperta
T_A = "            {!form.shiftId && (\n              <div style={{marginBottom:10}}>\n                <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:3}}>TITOLO VISUALIZZATO (LABEL)</div>"
T_N = "            {!form.shiftId && (!form.editId || form._apriTitoli) && (\n              <div style={{marginBottom:10}}>\n                <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:3}}>TITOLO VISUALIZZATO (LABEL)</div>"
N_A = "            {(form.modelloId || form.evtModelloId) && (\n              <div style={{marginBottom:10}}>\n                <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:3}}>NOME DEL MODELLO (TITOLO)</div>"
N_N = "            {(form.modelloId || form.evtModelloId) && (!form.editId || form._apriTitoli) && (\n              <div style={{marginBottom:10}}>\n                <div style={{fontSize:10,color:T.sub,fontWeight:700,marginBottom:3}}>NOME DEL MODELLO (TITOLO)</div>"

# ---- quando compare il pop-up: solo per le 4 cose richieste
S_A = '''                  const modId = form.modelloId || form.evtModelloId;
                  const modCollegato = modId ? modelli.find(m=>m.id===modId) : null;
                  if(modCollegato){
'''
S_B = '                  const nuovaVis = [...(form.visibileAncheIn||[])].sort().join("|");\n'
S_N = r"""                  const modId = form.modelloId || form.evtModelloId;
                  const modCollegato = modId ? modelli.find(m=>m.id===modId) : null;
                  // La richiesta "solo questo / da qui in poi / tutti" compare SOLO se cambia: titolo visualizzato,
                  // nome del modello, colore oppure orario del turno. Tutto il resto si salva sul singolo evento.
                  if(modCollegato){
                    const uguali = (a,b)=>String(a||"").trim().toUpperCase()===String(b||"").trim().toUpperCase();
                    const evOrig = (curEvts||[]).find(x=>x.id===form.editId);
                    const labelPrima = evOrig ? evOrig.label : (modCollegato.label || modCollegato.titolo);
                    const colorePrima = evOrig ? evOrig.color : (modCollegato.coloreCustom || modCollegato.colore);
                    const finePrima = calcFineModello(modCollegato) || modCollegato.fine || "";
                    const cambiaTitolo = !uguali(form.label, labelPrima);
                    const cambiaNomeModello = form.modelloTitolo!==undefined && !uguali(form.modelloTitolo, modCollegato.titolo);
                    const cambiaColore = !!form.colorOvr && String(form.colorOvr).toLowerCase()!==String(colorePrima||"").toLowerCase();
                    const cambiaOrario = modCollegato.tempo!=="h24" &&
                      ((form.offIn!==undefined && form.offIn!==(modCollegato.inizio||"")) || (form.offOut!==undefined && form.offOut!==finePrima));
                    if(cambiaTitolo || cambiaNomeModello || cambiaColore || cambiaOrario){
                      setChiediAmbitoModifica(true);
                      return;
                    }
                  }

"""

# ---- "per tutti" e "da questo evento in poi": usano l'orario del turno (non l'ingresso effettivo)
def righe(sp):
    p = "\n" + " " * sp
    return (
      (p + 'const nIn = form.dur === "allday" ? "" : (form.tIn || "");',
       p + 'const nIn = (mod?.tempo==="h24") ? "" : (form.offIn!==undefined ? form.offIn : (mod?.inizio || ""));'),
      (p + 'const nOut = form.dur === "allday" ? "" : (form.tOut || calcFine6h15(form.tIn) || calcFine6h30(form.tIn) || "");',
       p + 'const nOut = (mod?.tempo==="h24") ? "" : (form.offOut!==undefined ? form.offOut : ((mod ? calcFineModello(mod) : "") || mod?.fine || ""));'),
      (p + 'const nTempo = form.dur === "allday" ? "h24" : form.dur === "fixed" ? "6h15" : form.dur === "fixed30" ? "6h30" : "custom";',
       p + 'const nTempo = mod?.tempo || "custom";'),
    )
HANDLER_OPS = []
for sp in (22, 20):
    for vecchio, nuovo in righe(sp):
        HANDLER_OPS.append(("sost", vecchio, nuovo))

MODELLI_OPS = [
    ("tra", H_A, H_B, H_N),
    ("sost", T_A, T_N),
    ("sost", N_A, N_N),
    ("tra", S_A, S_B, S_N),
] + HANDLER_OPS

def main():
    root = os.getcwd()
    say("=" * 60); say("  MENU A FRECCIA E POP-UP EVENTI - progetto Turni"); say("=" * 60)
    m02 = os.path.join(root, "src", "02-Modelli.jsx")
    if not os.path.isfile(m02):
        say("\nERRORE: non trovo src/02-Modelli.jsx. Lancia lo script dalla cartella del progetto."); sys.exit(1)
    if not chiedi("\nModifico solo src/02-Modelli.jsx (menu a freccia e quando compare il pop-up). Procedo?"):
        say("Annullato."); return
    if not patch_file(root, os.path.join("src", "02-Modelli.jsx"), "_apriTitoli", MODELLI_OPS):
        say("\nFermo qui: nessun commit fatto. Mandami cosa e' comparso sopra."); sys.exit(1)
    run(["git", "add", "--", os.path.join("src", "02-Modelli.jsx")], cwd=root)
    if run(["git", "diff", "--cached", "--quiet"], cwd=root).returncode != 0:
        r = run(["git", "commit", "-q", "-m", "Modifica evento: menu a freccia e pop-up solo per titolo, nome modello, colore, orario"], cwd=root)
        if r.returncode != 0:
            say("  [!!] commit non riuscito: " + (r.stderr or r.stdout).strip()[:200]); sys.exit(1)
        say("  [OK] commit creato")
    else:
        say("  [--] niente da committare")
    if "--senza-push" in ARGS: say("  [--] push saltato"); return
    if not chiedi("Faccio il push ora?"): say("Ok. Lo farai tu con: git push"); return
    p = run(["git", "pull", "--rebase", "--autostash", "-q"], cwd=root)
    if p.returncode != 0:
        say("  [!!] git pull non riuscito: " + (p.stderr or p.stdout).strip()[:300]); return
    r = run(["git", "push"], cwd=root)
    if r.returncode == 0:
        say("  [OK] push fatto")
        say("\nFINE. La build parte da sola: https://github.com/tesonemgs5/turni/actions")
    else:
        say("  [!!] push non riuscito: " + (r.stderr or r.stdout).strip()[:300])

if __name__ == "__main__":
    main()