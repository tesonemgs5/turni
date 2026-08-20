import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import {
  NOMI_MESI_IT, cancellaRegistroImportProblemi, estraiJsonDaTesto, fmtDataIT,
  getContrastTextColor, leggiRegistroImportProblemi, normalizzaRigheImportGrezzo,
  normalizzaTestoGrezzoTurni, oraInMinuti, registraProblemiImport, segnalaErroreSoloLog
} from "./utilsRotazione";

// ═══════════════════════════════════════════════════════════════
// importTurni.jsx — Dialog di importazione turni: da JSON e da
// foto/OCR.
// Provenienza: App.jsx originale, sezioni 28-29.
// ═══════════════════════════════════════════════════════════════

// #region SEZIONE 28: IMPORT TURNI DA JSON
// ═══════════════════════════════════════════════════════════════
export function ImportaTurniJsonDialog({T, accent, dark, importsRecenti, year, month, onClose, onConfirm, onDeleteImport}){
  const [step, setStep] = useState("menu"); // menu | incolla | riepilogo | registro
  const [testoJson, setTestoJson] = useState("");
  const [importando, setImportando] = useState(false);
  const [incollando, setIncollando] = useState(false);
  const [errore, setErrore] = useState("");
  const [risultato, setRisultato] = useState(null);
  const [registro, setRegistro] = useState(null);
  const fileInputRef = useRef(null);
  const testoJsonRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  async function elabora(testo){
    if(importando) return;
    setImportando(true); setErrore("");
    // Il parsing vero (estraiJsonDaTesto + normalizzazione ricorsiva riga per
    // riga) è sincrono e su un JSON grande può durare secoli: se lo lanciamo
    // subito dopo setImportando, il browser non fa in tempo a dipingere lo
    // spinner prima di restare bloccato sul calcolo, e sembra tutto fermo.
    // Un doppio giro di rAF+setTimeout(0) garantisce che il frame con lo
    // spinner venga effettivamente disegnato prima di iniziare il lavoro pesante.
    await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
    let parsed = null, righeDaTesto = null;
    try{
      // estraiJsonDaTesto toglie fence markdown e artefatti OCR appiccicati
      // prima/dopo le parentesi, che altrimenti fanno fallire JSON.parse
      // anche quando il JSON dentro è valido.
      parsed = JSON.parse(estraiJsonDaTesto((testo||"").trim()));
    }catch(err){
      // Non è JSON: prova a riconoscerlo come testo "a blocchi" tipo export
      // turnario (righe "NomeGiorno GG/MM/AAAA" seguite da "Campo: valore").
      // Solo se anche questo fallisce (nessuna riga riconosciuta) si mostra
      // l'errore di JSON non valido.
      righeDaTesto = normalizzaTestoGrezzoTurni(testo);
      if(righeDaTesto.length===0){
        setErrore("Il contenuto non è un JSON valido né un testo turni riconoscibile. Controlla di aver incluso tutte le parentesi [ ] o { } (per JSON) oppure che ogni turno abbia una riga data e un campo Turno (per il testo).");
        setImportando(false);
        return;
      }
    }
    // Il formato "canonico" è un array piatto [{data, titolo, oraInizio,
    // oraFine, auto, collega, note}], ma qui arriva spesso l'output libero
    // di un OCR/AI esterno all'app (foto -> JSON fatto fuori da qui), che
    // cambia struttura a ogni tentativo: annidato sotto chiavi diverse,
    // "giorno" numerico invece di "data", "orario" come intervallo unico,
    // a volte un solo giorno come oggetto invece di un array. Si prova a
    // interpretare tutte queste varianti; il modello associato al titolo
    // resta comunque cercato e validato dopo (in importaTurniPdfJson): un
    // titolo non riconosciuto in questo calendario finisce comunque tra i
    // "mancanti"/"sospetti" nel riepilogo, non viene importato a caso.
    const righeValide = righeDaTesto ? righeDaTesto : normalizzaRigheImportGrezzo(parsed, year, month+1);
    if(righeValide.length===0){
      setErrore("Nessuna riga turno riconosciuta in questo JSON, neanche provando formati alternativi (giorno numerico, orario unico, struttura annidata sotto un'altra chiave...). Controlla che ci sia almeno una data (o un numero di giorno) e un titolo per ogni turno.");
      setImportando(false);
      return;
    }
    const esito = await onConfirm(righeValide);
    setRisultato(esito);
    setImportando(false);
    setStep("riepilogo");
  }

  function handleFileChange(e){
    const file = e.target.files?.[0];
    e.target.value = "";
    if(!file) return;
    if(!/\.(json|txt)$/i.test(file.name)){
      setErrore("Seleziona un file .json o .txt.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev)=> elabora(String(ev.target?.result||""));
    reader.onerror = ()=> setErrore("Impossibile leggere il file selezionato.");
    reader.readAsText(file);
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:600,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:400,
        maxHeight:"85vh",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}
        onClick={e=>e.stopPropagation()}>

        {step==="menu" && (
          <div style={{padding:20}}>
            <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:14}}>Importa turni da JSON</div>

            <input ref={fileInputRef} type="file" accept=".json,application/json,.txt,text/plain"
              onChange={handleFileChange} style={{display:"none"}}/>
            <button onClick={()=>{setErrore("");fileInputRef.current?.click();}}
              style={{width:"100%",background:accent,border:"none",borderRadius:10,color:"#fff",
                padding:"12px 0",fontWeight:800,fontSize:14,cursor:"pointer",marginBottom:10}}>
              📄 Carica file .json o .txt
            </button>
            <button onClick={()=>{setErrore("");setStep("incolla");}}
              style={{width:"100%",background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,
                padding:"12px 0",fontWeight:800,fontSize:14,cursor:"pointer",marginBottom:16}}>
              📋 Incolla testo (JSON o turni)
            </button>

            {errore && <div style={{color:"#ef4444",fontSize:12,marginBottom:14}}>{errore}</div>}

            <button onClick={()=>{setRegistro(leggiRegistroImportProblemi());setStep("registro");}}
              style={{width:"100%",background:"none",border:`1px solid ${T.border}`,borderRadius:10,color:T.text,
                padding:"10px 0",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:16}}>
              📋 Registro problemi import
            </button>

            {importsRecenti?.length>0 && (
              <div>
                <div style={{fontSize:11,fontWeight:800,color:T.sub,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>
                  Importazioni recenti
                </div>
                {importsRecenti.map(imp=>(
                  <div key={imp.importId} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                    <div>
                      <div style={{fontSize:13,color:T.text,fontWeight:700}}>{imp.count} eventi</div>
                      <div style={{fontSize:11,color:T.sub}}>{fmtDataIT(imp.minDate)} → {fmtDataIT(imp.maxDate)}</div>
                    </div>
                    <button onClick={()=>{
                        if(confirm(`Eliminare tutti i ${imp.count} eventi di questa importazione (dal ${fmtDataIT(imp.minDate)} al ${fmtDataIT(imp.maxDate)})? L'azione non è reversibile.`)){
                          onDeleteImport(imp.importId);
                        }
                      }}
                      style={{background:"none",border:"none",color:"#ef4444",fontSize:18,cursor:"pointer",padding:4}}>🗑️</button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={onClose}
              style={{width:"100%",background:"none",border:"none",color:T.sub,
                padding:"14px 0 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>Chiudi</button>
          </div>
        )}

        {step==="incolla" && (
          <div style={{padding:20}}>
            <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:14}}>Incolla JSON o testo turni</div>
            <div style={{fontSize:11,color:T.sub,marginBottom:8}}>
              Va bene anche l'output "grezzo" di un OCR/AI esterno, o un testo semplice tipo:
              "Giovedi 01/01/2026" seguito da righe "Turno:", "Orario:", "Auto:", "Collega:", "Note:".
              Basta che ogni turno abbia una data e un titolo (campo Turno).
            </div>
            <div style={{position:"relative"}}>
              <textarea ref={testoJsonRef} defaultValue={testoJson}
                onFocus={()=>{
                  // Si accende appena il box riceve il focus (primo tap), non solo quando il
                  // testo cambia: su Android il blocco reale avviene a livello di sistema
                  // mentre il testo enorme viene scritto nel campo nativo, prima che qualunque
                  // evento JS possa scattare — quindi l'unico momento affidabile per accendere
                  // lo spinner è PRIMA, appena l'utente entra nel campo per incollare. Se è solo
                  // un tap per scrivere a mano, lo spegne subito dopo (nessun testo arriva).
                  setIncollando(true);
                  if(syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
                  syncTimeoutRef.current = setTimeout(()=>setIncollando(false), 600);
                }}
                onInput={e=>{
                  const lunghezzaAttuale = e.target.value.length;
                  if(testoJsonRef.current) testoJsonRef.current.__ultimaLunghezza = lunghezzaAttuale;
                  // Spegne lo spinner solo quando il testo si è stabilizzato (nessuna modifica
                  // per 400ms): se il thread era bloccato a scrivere un testo enorme, l'evento
                  // input arriva tutto insieme alla fine, quindi questo timeout scade subito
                  // dopo — lo spinner resta visibile per l'intera durata del blocco reale.
                  setIncollando(true);
                  if(syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
                  syncTimeoutRef.current = setTimeout(()=>{
                    setTestoJson(testoJsonRef.current?.value || "");
                    setIncollando(false);
                  }, 400);
                }}
                placeholder='[{"data":"2024-01-02","titolo":"T S","oraInizio":"07:45","oraFine":"14:00","auto":"","collega":"","note":""}]'
                style={{width:"100%",minHeight:220,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                  color:T.text,padding:10,fontSize:12,fontFamily:"monospace",boxSizing:"border-box",marginBottom:4}}/>
              {incollando && (
                <div style={{position:"absolute",inset:0,background:"rgba(255,255,255,0.85)",
                  borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{width:48,height:48,border:"5px solid #ddd",borderTopColor:"#000",
                    borderRadius:"50%",display:"inline-block",animation:"spin 0.6s linear infinite"}}/>
                </div>
              )}
            </div>
            <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
            <div style={{fontSize:11,color:T.sub,marginBottom:8,textAlign:"right"}}>
              {testoJson ? `${testoJson.length.toLocaleString("it-IT")} caratteri incollati` : ""}
            </div>
            {errore && <div style={{color:"#ef4444",fontSize:12,marginBottom:12}}>{errore}</div>}
            <button disabled={importando} onClick={()=>elabora(testoJsonRef.current?.value ?? testoJson)}
              style={{width:"100%",background:accent,border:"none",borderRadius:10,color:"#fff",
                padding:"12px 0",fontWeight:800,fontSize:14,cursor:importando?"default":"pointer",
                opacity:importando?0.6:1,marginBottom:10,display:"flex",alignItems:"center",
                justifyContent:"center",gap:8}}>
              {importando && (
                <span style={{width:14,height:14,border:"2px solid rgba(255,255,255,0.4)",
                  borderTopColor:"#fff",borderRadius:"50%",display:"inline-block",
                  animation:"spin 0.7s linear infinite"}}/>
              )}
              {importando?"Importazione in corso...":"Importa"}
            </button>
            <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
            <button onClick={()=>{setStep("menu");setErrore("");}}
              style={{width:"100%",background:"none",border:"none",color:T.sub,
                padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>‹ Indietro</button>
          </div>
        )}

        {step==="riepilogo" && risultato && (
          <div style={{padding:20}}>
            <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:14}}>Importazione completata</div>
            <div style={{fontSize:13,color:T.text,marginBottom:4}}>✅ Aggiunti: <strong>{risultato.nAggiunti}</strong></div>
            <div style={{fontSize:13,color:T.text,marginBottom:4}}>♻️ Sostituiti: <strong>{risultato.nSostituiti}</strong></div>
            <div style={{fontSize:13,color:T.text,marginBottom:14}}>⏸️ Invariati: <strong>{risultato.nInvariati}</strong></div>

            {risultato.mancanti?.length>0 && (
              <div>
                <div style={{fontSize:12,fontWeight:800,color:"#ef4444",marginBottom:8}}>
                  ⚠️ {risultato.mancanti.length} righe senza modello corrispondente:
                </div>
                <div style={{maxHeight:260,overflowY:"auto",background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10,marginBottom:14}}>
                  {risultato.mancanti.map((m,i)=>(
                    <div key={i} style={{fontSize:17,color:"#000",padding:"5px 0",
                      borderBottom: i<risultato.mancanti.length-1?"1px solid #ddd":"none"}}>
                      {fmtDataIT(m.data)} — {m.titolo} {m.oraInizio?`(${m.oraInizio}-${m.oraFine})`:"(tutto il giorno)"}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {risultato.sospetti?.length>0 && (
              <div>
                <div style={{fontSize:12,fontWeight:800,color:"#f59e0b",marginBottom:8}}>
                  🔶 {risultato.sospetti.length} righe con titolo trovato ma orario non corrispondente:
                </div>
                <div style={{maxHeight:260,overflowY:"auto",background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10,marginBottom:14}}>
                  {risultato.sospetti.map((m,i)=>(
                    <div key={i} style={{fontSize:17,color:"#000",padding:"5px 0",
                      borderBottom: i<risultato.sospetti.length-1?"1px solid #ddd":"none"}}>
                      {fmtDataIT(m.data)} — {m.titolo} {m.oraInizio?`(${m.oraInizio}-${m.oraFine})`:"(nessun orario nel file)"}
                      {" — "}{m.motivo==="ambiguo"?"più modelli con questo titolo":"orario diverso dal modello salvato"}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {risultato.sostituzioni?.length>0 && (
              <div>
                <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:8}}>
                  ♻️ Dettaglio {risultato.sostituzioni.length} sostituzioni:
                </div>
                <div style={{maxHeight:280,overflowY:"auto",background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10,marginBottom:14}}>
                  {risultato.sostituzioni.map((s,i)=>(
                    <div key={i} style={{fontSize:13,color:"#000",padding:"8px 0",
                      borderBottom: i<risultato.sostituzioni.length-1?"1px solid #ddd":"none"}}>
                      <div style={{fontWeight:800,marginBottom:3}}>{s.giornoSett} {fmtDataIT(s.data)}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{color:"#888"}}>{s.vecchio.titolo||"—"}</span>
                        <span>→</span>
                        <span style={{fontWeight:700}}>{s.nuovo.titolo||"—"}</span>
                      </div>
                      {(s.vecchio.oraInizio||s.nuovo.oraInizio) && (
                        <div style={{fontSize:12,color:"#555",marginTop:2}}>
                          {s.vecchio.oraInizio?`${s.vecchio.oraInizio}-${s.vecchio.oraFine}`:"tutto il giorno"}
                          {" → "}
                          {s.nuovo.oraInizio?`${s.nuovo.oraInizio}-${s.nuovo.oraFine}`:"tutto il giorno"}
                        </div>
                      )}
                      {(s.vecchio.auto||s.nuovo.auto) && s.vecchio.auto!==s.nuovo.auto && (
                        <div style={{fontSize:12,color:"#555",marginTop:2}}>Auto: {s.vecchio.auto||"—"} → {s.nuovo.auto||"—"}</div>
                      )}
                      {(s.vecchio.collega||s.nuovo.collega) && s.vecchio.collega!==s.nuovo.collega && (
                        <div style={{fontSize:12,color:"#555",marginTop:2}}>Collega: {s.vecchio.collega||"—"} → {s.nuovo.collega||"—"}</div>
                      )}
                      {(s.vecchio.note||s.nuovo.note) && s.vecchio.note!==s.nuovo.note && (
                        <div style={{fontSize:12,color:"#555",marginTop:2}}>Note: {s.vecchio.note||"—"} → {s.nuovo.note||"—"}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={onClose}
              style={{width:"100%",background:accent,border:"none",borderRadius:10,color:"#fff",
                padding:"12px 0",fontWeight:800,fontSize:14,cursor:"pointer"}}>Chiudi</button>
          </div>
        )}

        {step==="registro" && (
          <div style={{padding:20}}>
            <div style={{fontSize:16,fontWeight:900,color:T.text,marginBottom:14}}>Registro problemi import</div>
            {(!registro || registro.length===0) ? (
              <div style={{fontSize:13,color:T.sub,marginBottom:16}}>Nessun problema registrato finora.</div>
            ) : (
              <div style={{maxHeight:440,overflowY:"auto",marginBottom:14}}>
                {registro.slice().reverse().map((sess,si)=>(
                  <div key={si} style={{marginBottom:16}}>
                    <div style={{fontSize:11,fontWeight:800,color:T.sub,marginBottom:6}}>
                      {new Date(sess.ts).toLocaleString("it-IT")}
                    </div>
                    {sess.mancanti?.length>0 && (
                      <div style={{background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10,marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:800,color:"#ef4444",marginBottom:6}}>
                          ⚠️ {sess.mancanti.length} senza modello corrispondente
                        </div>
                        {sess.mancanti.map((m,i)=>(
                          <div key={i} style={{fontSize:17,color:"#000",padding:"5px 0",
                            borderBottom: i<sess.mancanti.length-1?"1px solid #ddd":"none"}}>
                            {fmtDataIT(m.data)} — {m.titolo} {m.oraInizio?`(${m.oraInizio}-${m.oraFine})`:"(tutto il giorno)"}
                          </div>
                        ))}
                      </div>
                    )}
                    {sess.sospetti?.length>0 && (
                      <div style={{background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10}}>
                        <div style={{fontSize:12,fontWeight:800,color:"#f59e0b",marginBottom:6}}>
                          🔶 {sess.sospetti.length} con titolo trovato ma orario non corrispondente
                        </div>
                        {sess.sospetti.map((m,i)=>(
                          <div key={i} style={{fontSize:17,color:"#000",padding:"5px 0",
                            borderBottom: i<sess.sospetti.length-1?"1px solid #ddd":"none"}}>
                            {fmtDataIT(m.data)} — {m.titolo} {m.oraInizio?`(${m.oraInizio}-${m.oraFine})`:"(nessun orario nel file)"}
                            {" — "}{m.motivo==="ambiguo"?"più modelli con questo titolo":"orario diverso dal modello salvato"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {registro?.length>0 && (
              <button onClick={()=>{
                  if(confirm("Cancellare tutto il registro dei problemi di import? L'azione non è reversibile.")){
                    cancellaRegistroImportProblemi();
                    setRegistro([]);
                  }
                }}
                style={{width:"100%",background:"none",border:"1px solid #ef4444",borderRadius:10,color:"#ef4444",
                  padding:"10px 0",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:10}}>
                Cancella registro
              </button>
            )}
            <button onClick={()=>setStep("menu")}
              style={{width:"100%",background:"none",border:"none",color:T.sub,
                padding:"6px 0 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>‹ Indietro</button>
          </div>
        )}

      </div>
    </div>
  );
}
// #endregion

// #region SEZIONE 29: IMPORT TURNI DA OCR FOTO
// ═══════════════════════════════════════════════════════════════
// Preprocessing immagine per migliorare la lettura OCR: upscaling, scala di grigi
// pesata, binarizzazione ad alto contrasto (bianco/nero netto). Restituisce un
// nuovo File (stesso nome, tipo image/png) pronto per Tesseract.
async function preprocessaImmagine(file){
  const bitmap = await createImageBitmap(file);
  const SCALA = 2; // upscaling 2x per migliorare la lettura di caratteri piccoli
  const w = bitmap.width * SCALA;
  const h = bitmap.height * SCALA;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  // Scala di grigi pesata (luminanza percettiva) + soglia di binarizzazione fissa.
  // La soglia 150 è un compromesso ragionevole per foto di tabelle stampate
  // scattate con smartphone in condizioni di luce normali.
  const SOGLIA = 150;
  for(let i=0; i<px.length; i+=4){
    const grigio = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2];
    const bn = grigio >= SOGLIA ? 255 : 0;
    px[i] = bn; px[i+1] = bn; px[i+2] = bn;
  }
  ctx.putImageData(imgData, 0, 0);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  return new File([blob], (file.name||"foto") + "-preproc.png", { type: "image/png" });
}

export function ImportaFotoDialog({T, accent, dark, modelli, year, month, onClose, onConfirm}){
  const [step, setStep] = useState("scegli-tipo"); // scegli-tipo | upload | ocr | chiedi-gemini | gemini-ocr | incolla-json | riepilogo
  const [tipoTabella, setTipoTabella] = useState(null); // "personale" | "stella"
  const [imgPreviewUrl, setImgPreviewUrl] = useState(null);
  const [progresso, setProgresso] = useState(0);
  const [errore, setErrore] = useState("");
  const [confidenzaRaggiunta, setConfidenzaRaggiunta] = useState(null); // ultima confidenza OCR calcolata (0-100)
  const [nessunTurnoRilevato, setNessunTurnoRilevato] = useState(false); // true se l'OCR non ha trovato nessuna parola simile a un turno noto
  const [testoJsonIncollato, setTestoJsonIncollato] = useState("");
  const [nRigheAggiunte, setNRigheAggiunte] = useState(0);
  // Dettaglio {mancanti, sospetti} dell'ultima importazione (OCR o JSON
  // incollato), mostrato nello step "riepilogo" con lo stesso stile già
  // usato in ImportaTurniJsonDialog. Sempre registrato anche nel registro
  // persistente condiviso (registraProblemiImport), consultabile in un
  // secondo momento indipendentemente da questa sessione.
  const [risultatoImportOcr, setRisultatoImportOcr] = useState(null);
  const [registroOcr, setRegistroOcr] = useState(null);
  const [importando, setImportando] = useState(false); // true durante l'elaborazione del JSON incollato, per disabilitare il pulsante e mostrare feedback visivo
  // --- Verifica incrociata OCR (backend Render) sul JSON incollato ---
  const [fotoVerifica, setFotoVerifica] = useState(null); // File della foto per il doppio controllo
  const [verificandoOcr, setVerificandoOcr] = useState(false);
  const [risultatoVerifica, setRisultatoVerifica] = useState(null); // {totale_controllati, numero_gruppi_rilevati, disaccordi[]} oppure null
  const [erroreVerifica, setErroreVerifica] = useState("");
  const [indiceGruppoVerifica, setIndiceGruppoVerifica] = useState(0); // quale fascia oraria (0-based) si sta controllando ora
  const pendingFile = useRef(null);

  // Radici testo-foto -> titolo modello reale. Basta trovare la radice (2-3 lettere)
  // dentro il testo letto dall'OCR, anche con rumore/orari/spazi attorno.
  const MAPPING_TURNI = [
    { radice: "prim", titoli: ["PRIMO","MATTINA"] },
    { radice: "second", titoli: ["SECONDO","POMERIGGIO"] },
    { radice: "terz", titoli: ["3°TURNO","3° TURNO"] },
    { radice: "nott", titoli: ["NOTTE"] },
  ];

  const GIORNI_ABBR = "lun|mar|mer|gio|ven|sab|dom";
  // Riconosce l'inizio di una riga tabella: "mer 01", "mer. 01", "01 mer", ecc.
  // Tollerante a icone/simboli spuri prima del giorno (es. emoji di ferie/riposo
  // lette da Tesseract come caratteri strani), non solo spazi bianchi.
  const INIZIO_RIGA_REGEX = new RegExp(`^[^a-zA-Z0-9]{0,6}(?:(${GIORNI_ABBR})\\.?\\s*(\\d{1,2})|(\\d{1,2})\\s*(${GIORNI_ABBR})\\.?)`, "i");
  // Fallback: cerca ovunque nel testo, usato solo per completare i giorni mancanti
  const RIGA_REGEX_GLOBALE = new RegExp(`(${GIORNI_ABBR})\\.?\\s*(\\d{1,2})[^\\wàèéìòù]*([a-zA-Zàèéìòù°'\\s]+)`, "gi");

  function trovaModelloPerTesto(testoLetto){
    const t = (testoLetto||"").toLowerCase();
    const match = MAPPING_TURNI.find(m=>t.includes(m.radice));
    if(!match) return null; // nessuna radice riconosciuta -> lasciato vuoto
    const titoloMod = (m)=>(m.titolo||"").toUpperCase();
    const mod = modelli.find(m=>match.titoli.some(tit=>titoloMod(m).includes(tit)));
    return mod || null;
  }

  // Confidenza media Tesseract, calcolata solo sulle parole i cui caratteri
  // corrispondono a una radice di turno riconosciuta (non su tutto il testo
  // della pagina, che includerebbe intestazioni, icone lette come testo, ecc.).
  // Restituisce un oggetto (non un numero nudo) per distinguere due casi molto
  // diversi che altrimenti finirebbero entrambi a "0%":
  //  - nessunaParolaRilevante: l'OCR non ha trovato NESSUNA parola che somigli
  //    a un turno noto (foto di tutt'altro, o lettura totalmente fallita) ->
  //    lo 0% qui non è una misura di qualità, è "non applicabile".
  //  - altrimenti: confidenza reale calcolata sulle parole trovate, che può
  //    legittimamente essere bassa (es. 12%) se l'OCR le ha lette male.
  function calcolaConfidenzaTurni(ocrWords, radiciTrovate){
    if(!ocrWords || ocrWords.length===0 || radiciTrovate.length===0){
      return { confidenza: 0, nessunaParolaRilevante: true };
    }
    const paroleRilevanti = ocrWords.filter(w=>{
      const testo = (w.text||"").toLowerCase();
      return radiciTrovate.some(r=>testo.includes(r) || r.includes(testo));
    });
    if(paroleRilevanti.length===0){
      return { confidenza: 0, nessunaParolaRilevante: true };
    }
    const somma = paroleRilevanti.reduce((acc,w)=>acc+(w.confidence||0), 0);
    return { confidenza: somma / paroleRilevanti.length, nessunaParolaRilevante: false };
  }

  // Passaggio 1: parsing riga-per-riga (split su \n).
  // Molto più robusto del regex globale quando ci sono turni uguali consecutivi,
  // perché ogni riga viene analizzata da sola e non può "fondersi" con la successiva.
  function parseRigaPerRiga(testo){
    const risultato = new Map(); // numGiorno -> testoTurno
    const linee = testo.split(/\r?\n/);
    for(let i=0;i<linee.length;i++){
      const linea = linee[i];
      const mtc = INIZIO_RIGA_REGEX.exec(linea);
      if(!mtc) continue;
      const numGiorno = parseInt(mtc[2] || mtc[3], 10);
      if(!numGiorno || numGiorno<1 || numGiorno>31) continue;
      // il testo del turno è quello che resta sulla stessa riga dopo il match iniziale
      let restoRiga = linea.slice(mtc.index + mtc[0].length).trim();
      // se sulla riga non resta nulla di utile (es. il turno è andato a capo),
      // guarda anche la riga successiva come possibile continuazione
      if(restoRiga.length < 2 && linee[i+1]){
        restoRiga = (restoRiga + " " + linee[i+1]).trim();
      }
      if(restoRiga){
        risultato.set(numGiorno, restoRiga);
      }
    }
    return risultato;
  }

  // Passaggio 2: regex globale su tutto il testo, usato solo per riempire i buchi
  // lasciati dal passaggio 1 (es. quando l'OCR non mette a capo correttamente).
  function parseGlobale(testo){
    const risultato = new Map();
    let mtc;
    RIGA_REGEX_GLOBALE.lastIndex = 0;
    while((mtc = RIGA_REGEX_GLOBALE.exec(testo)) !== null){
      const numGiorno = parseInt(mtc[2],10);
      if(!numGiorno || numGiorno<1 || numGiorno>31) continue;
      if(!risultato.has(numGiorno)){
        risultato.set(numGiorno, mtc[3].trim());
      }
    }
    return risultato;
  }

  // Esegue un singolo tentativo di lettura OCR su un file (già grezzo o già
  // preprocessato) e restituisce sia le righe elaborate sia la confidenza
  // media raggiunta sulle sole parole rilevanti per i turni.
  // tipoTabella: "personale" (Primo/Secondo/Terzo/Notte, un modello per giorno)
  //           o "stella" (ricerca "stella" per fascia oraria, più modelli per giorno).
  async function tentativoOCR(file, onProgress, tipoTabella){
    const Tesseract = (await import("tesseract.js")).default;
    let data;
    try{
      const risultato = await Tesseract.recognize(file, "ita", {
        logger: m => { if(m.status==="recognizing text" && onProgress) onProgress(Math.round((m.progress||0)*100)); }
      });
      data = risultato.data;
    }catch(errTess){
      // Tesseract scarica il modello linguistico italiano da un CDN esterno al
      // primo uso; se la rete non lo raggiunge, l'errore arriva qui invece che
      // come "zero parole lette" -> lo segnaliamo in modo esplicito e distinto.
      segnalaErroreSoloLog(errTess, "OCR Tesseract (download modello linguistico)");
      const erroreRete = new Error("Impossibile caricare il modulo di lettura offline (problema di connessione). Riprova o usa l'AI.");
      erroreRete.isErroreRete = true;
      throw erroreRete;
    }
    const testo = data.text || "";
    const parole = data.words || [];

    const daRigaPerRiga = parseRigaPerRiga(testo);
    const daGlobale = parseGlobale(testo);
    const numeriGiorno = new Set([...daRigaPerRiga.keys(), ...daGlobale.keys()]);

    const mm = String(month+1).padStart(2,"0");
    const righeElaborate = [];
    const radiciTrovate = [];
    // Giorni riconosciuti dall'OCR ma senza un modello corrispondente: prima
    // scartati silenziosamente con "continue", ora tracciati con lo stesso
    // schema {data,titolo,oraInizio,oraFine} usato dall'import JSON, per
    // finire nello stesso registro persistente e nel riepilogo finale.
    const mancanti = [];

    if(tipoTabella==="stella"){
      // Percorso per posizione: serve la Y di ogni riga-data nota, dedotta
      // dalle parole che compongono il numero di giorno riconosciuto da
      // INIZIO_RIGA_REGEX (stesso regex del parsing testuale, ma qui si cerca
      // la parola-numero corrispondente dentro `parole` per prenderne la Y).
      const numeroGiorniRigheData = [];
      for(const numGiorno of numeriGiorno){
        const paroleNumero = parole.find(w=>{
          const t=(w.text||"").replace(/\D/g,"");
          return t && parseInt(t,10)===numGiorno;
        });
        if(paroleNumero){
          const yCentro = (paroleNumero.bbox.y0+paroleNumero.bbox.y1)/2;
          numeroGiorniRigheData.push([numGiorno, yCentro]);
        }
      }
      const { righeStella: trovati, mancantiStella } = trovaRigheStellaPerPosizione(parole, numeroGiorniRigheData);
      for(const r of trovati){
        const dd = String(r.numGiorno).padStart(2,"0");
        righeElaborate.push({ dateKey: `${year}-${mm}-${dd}`, modelloId: r.modelloId });
      }
      mancanti.push(...mancantiStella);
      if(trovati.length>0) radiciTrovate.push("stella");
    }else{
      for(const numGiorno of numeriGiorno){
        const testoTurno = daRigaPerRiga.get(numGiorno) || daGlobale.get(numGiorno);
        const dd = String(numGiorno).padStart(2,"0");
        const dateKey = `${year}-${mm}-${dd}`;
        const mod = trovaModelloPerTesto(testoTurno);
        if(!mod){
          mancanti.push({ data:dateKey, titolo: testoTurno||"(testo non riconosciuto)", oraInizio:"", oraFine:"" });
          continue;
        }
        righeElaborate.push({ dateKey, modelloId: mod.id });
        const radice = MAPPING_TURNI.find(m=>(testoTurno||"").toLowerCase().includes(m.radice));
        if(radice) radiciTrovate.push(radice.radice);
      }
    }

    // data.words è disponibile nell'output di Tesseract.js v5+; se assente
    // per qualche motivo, si tratta come se nessuna parola rilevante fosse
    // stata trovata (forza il tentativo successivo, con messaggio corretto).
    const { confidenza, nessunaParolaRilevante } = calcolaConfidenzaTurni(parole, radiciTrovate);

    return { righeElaborate, confidenza, nessunaParolaRilevante, mancanti };
  }

  async function handleFile(file){
    pendingFile.current = file;
    setImgPreviewUrl(URL.createObjectURL(file));
    setErrore("");
    setStep("ocr");
    setProgresso(0);
    setConfidenzaRaggiunta(null);
    setNessunTurnoRilevato(false);
    setRisultatoImportOcr(null);
    try{
      // Preprocessing sempre applicato (contrasto, bianco/nero, upscaling) per
      // dare a Tesseract la miglior immagine possibile fin dal primo tentativo.
      const filePreproc = await preprocessaImmagine(file);
      const risultato = await tentativoOCR(filePreproc, setProgresso, tipoTabella);

      setNessunTurnoRilevato(risultato.nessunaParolaRilevante);
      if(!risultato.nessunaParolaRilevante) setConfidenzaRaggiunta(risultato.confidenza);

      // Nessuna soglia di confidenza bloccante: se sono stati riconosciuti
      // turni, si accettano. La confidenza resta visibile solo come
      // informazione, non come filtro che scarta risultati validi.
      if(risultato.righeElaborate.length>0){
        const n = await onConfirm(risultato.righeElaborate);
        setNRigheAggiunte(n||0);
        registraProblemiImport(risultato.mancanti, []);
        setRisultatoImportOcr({ mancanti: risultato.mancanti||[], sospetti: [] });
        setStep("riepilogo");
        return;
      }

      if(risultato.nessunaParolaRilevante){
        setErrore(tipoTabella==="stella"
          ? "Non ho trovato nella foto nessuna occorrenza di \"Stella\"."
          : "Non ho trovato nella foto nessuna parola simile a un turno conosciuto (Primo, Secondo, Terzo, Notte).");
      }else{
        setErrore("Non sono riuscito a riconoscere nessun turno dalla foto in locale.");
      }
      setStep("chiedi-gemini");
    }catch(err){
      segnalaErroreSoloLog(err, "OCR lettura foto (locale)");
      setErrore(err && err.isErroreRete ? err.message : "Errore durante la lettura della foto in locale.");
      setStep("chiedi-gemini");
    }
  }

  async function handleFileConGemini(file){
    setErrore("");
    setStep("gemini-ocr");
    try{
      const base64 = await new Promise((res, rej)=>{
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Lettura file fallita"));
        r.readAsDataURL(file);
      });
      const resp = await fetch("/api/estrai-turni", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type })
      });
      if(!resp.ok) throw new Error("Chiamata AI fallita");
      const turniTrovati = await resp.json(); // [{data:"YYYY-MM-DD", turno:"..."}]

      const righeElaborate = [];
      for(const t of (turniTrovati||[])){
        const mod = trovaModelloPerTesto(t.turno);
        if(!mod) continue;
        righeElaborate.push({ dateKey: t.data, modelloId: mod.id });
      }

      if(righeElaborate.length===0){
        setErrore("Anche l'AI non è riuscita a riconoscere turni in questo file.");
        setStep("upload");
        return;
      }
      await onConfirm(righeElaborate);
    }catch(err){
      segnalaErroreSoloLog(err, "OCR/interpretazione con AI (Gemini)");
      setErrore("Errore durante la lettura con l'AI. Riprova.");
      setStep("upload");
    }
  }

  // Converte "1 agosto 2026" -> "2026-08-01". Tollerante a maiuscole/minuscole
  // e a piccole variazioni di spaziatura. Restituisce null se non riconosciuta.
  function dataItalianaToISO(testo){
    const MESI_IT = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
      "luglio","agosto","settembre","ottobre","novembre","dicembre"];
    const m = /^(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{4})$/i.exec((testo||"").trim());
    if(!m) return null;
    const giorno = parseInt(m[1], 10);
    const indiceMese = MESI_IT.indexOf(m[2].toLowerCase());
    if(indiceMese<0) return null;
    const anno = m[3];
    return `${anno}-${String(indiceMese+1).padStart(2,"0")}-${String(giorno).padStart(2,"0")}`;
  }

  // Estrae l'orario di inizio (in minuti) dalla chiave di una fascia oraria,
  // es. "00.00_06.30" o "6.00-12.15" o "06:00_12:30" -> minuti dall'inizio inizio fascia.
  // Tollerante a "." ":" o "-" come separatore ore/minuti, e a "_" "-" tra inizio e fine.
  function estraiMinutiInizioFascia(chiave){
    const primaParte = (chiave||"").split(/[_]/)[0].trim();
    const m = /^(\d{1,2})[.:h]?(\d{2})?/.exec(primaParte);
    if(!m) return null;
    const ore = parseInt(m[1], 10);
    const minuti = m[2] ? parseInt(m[2], 10) : 0;
    return ore*60 + minuti;
  }

  // Trova, tra i modelli del calendario corrente, quello il cui orario di
  // inizio (m.inizio, già in formato HH:MM) è più vicino ai minuti richiesti,
  // entro la tolleranza data (default 30 minuti, come da fasce indicative).
  // Trova, tra i modelli del calendario corrente, quello il cui orario di
  // inizio (m.inizio, già in formato HH:MM) è più vicino ai minuti richiesti,
  // entro la tolleranza data (default 30 minuti, come da fasce indicative).
  function trovaModelloPerOrarioInizio(minutiRichiesti, tolleranzaMinuti=30){
    if(minutiRichiesti==null) return null;
    let migliore = null, distanzaMigliore = Infinity;
    for(const mod of modelli){
      if(!mod.inizio) continue;
      const minMod = oraInMinuti(mod.inizio);
      if(minMod==null) continue;
      const distanza = Math.min(Math.abs(minMod-minutiRichiesti), 1440-Math.abs(minMod-minutiRichiesti));
      if(distanza < distanzaMigliore){
        distanzaMigliore = distanza;
        migliore = mod;
      }
    }
    return distanzaMigliore<=tolleranzaMinuti ? migliore : null;
  }

  // Analizza le parole OCR (con coordinate) per trovare, per ogni occorrenza di
  // "stella", a quale COLONNA della tabella appartiene in base alla posizione X,
  // e a quale GIORNO appartiene in base alla posizione Y (riga più vicina che
  // contiene una data riconosciuta). Le colonne vengono dedotte clusterizzando
  // le X di TUTTE le parole della pagina (non solo "stella"): si assume che le
  // colonne siano bande verticali con poco spazio vuoto tra il testo di una
  // banda e l'altra, separate da vuoti più ampi (i bordi della tabella).
  // Le colonne trovate vengono poi assegnate ai modelli del calendario in
  // ordine di posizione sinistra->destra = ordine di orario di inizio crescente
  // (assunzione: nelle tabelle Stella le fasce orarie procedono così, come
  // osservato negli screenshot forniti).
  // LIMITE NOTO: dipende dalla qualità delle coordinate restituite da Tesseract,
  // che su foto storte/sfocate/a bassa risoluzione possono essere imprecise.
  // Verificare sempre il risultato dopo l'import su foto nuove.
  function trovaRigheStellaPerPosizione(words, numeroGiorniRigheData){
    if(!words || words.length===0) return [];

    // 1) Clusterizza le X di tutte le parole per dedurre i confini delle colonne.
    //    Ordina i centri X, poi taglia dove c'è un salto ampio rispetto alla
    //    larghezza media delle parole (gap = probabile bordo di colonna).
    const centriX = words.map(w=>(w.bbox.x0+w.bbox.x1)/2).sort((a,b)=>a-b);
    const larghezzaMediaParola = words.reduce((acc,w)=>acc+(w.bbox.x1-w.bbox.x0),0)/words.length;
    const sogliaSalto = larghezzaMediaParola*3; // gap oltre 3x la larghezza media parola = nuova colonna
    const confiniColonne = [];
    for(let i=1;i<centriX.length;i++){
      if(centriX[i]-centriX[i-1] > sogliaSalto){
        confiniColonne.push((centriX[i]+centriX[i-1])/2);
      }
    }
    // Le colonne sono gli intervalli tra i confini trovati (+ i due estremi).
    const bordi = [-Infinity, ...confiniColonne, Infinity];
    const numColonne = bordi.length-1;
    const colonnaDiX = (x)=>{
      for(let c=0;c<numColonne;c++){ if(x>=bordi[c] && x<bordi[c+1]) return c; }
      return numColonne-1;
    };

    // 2) Modelli ordinati per orario di inizio crescente, assunti corrispondere
    //    da sinistra a destra alle colonne trovate.
    const modelliOrdinati = [...modelli]
      .filter(m=>m.inizio)
      .sort((a,b)=>(oraInMinuti(a.inizio)??0) - (oraInMinuti(b.inizio)??0));

    // 3) Per ogni parola "stella" trovata, determina colonna (-> modello) e riga
    //    (-> giorno, tramite la Y della parola più vicina a una riga-data nota).
    const risultati = [];
    const mancantiGeometria = []; // "stella" trovata ma colonna/riga non determinabile
    const paroleStella = words.filter(w=>/stella/i.test(w.text));
    for(const w of paroleStella){
      const centroX = (w.bbox.x0+w.bbox.x1)/2;
      const centroY = (w.bbox.y0+w.bbox.y1)/2;
      const colonna = colonnaDiX(centroX);
      const mod = modelliOrdinati[colonna];
      if(!mod){
        mancantiGeometria.push({ data:"", titolo:`"stella" in colonna ${colonna} (nessun modello con orario in quella posizione)`, oraInizio:"", oraFine:"" });
        continue;
      }
      // trova la riga-data (numeroGiorno) la cui Y è più vicina al centroY di "stella"
      let giornoVicino = null, distanzaY = Infinity;
      for(const [numGiorno, yRiga] of numeroGiorniRigheData){
        const d = Math.abs(yRiga-centroY);
        if(d<distanzaY){ distanzaY = d; giornoVicino = numGiorno; }
      }
      if(giornoVicino==null){
        mancantiGeometria.push({ data:"", titolo:`"stella" per ${mod.titolo} (nessuna riga-data vicina riconosciuta)`, oraInizio:"", oraFine:"" });
        continue;
      }
      risultati.push({ numGiorno: giornoVicino, modelloId: mod.id });
    }
    return { righeStella: risultati, mancantiStella: mancantiGeometria };
  }


  async function handleImportaJsonIncollato(){
    if(importando) return; // guardia esplicita: ignora click ripetuti mentre un'importazione è già in corso
    setImportando(true);
    setErrore("");
    setRisultatoImportOcr(null);
    let parsed;
    try{
      parsed = JSON.parse(testoJsonIncollato.trim());
    }catch(err){
      setErrore("Il testo incollato non è un JSON valido. Controlla di aver copiato tutto, comprese le parentesi { } o [ ].");
      setImportando(false);
      return;
    }

    const righeElaborate = [];
    // Stesso schema di ImportaTurniJsonDialog (righe scartate tracciate con
    // motivo, non solo ignorate con continue), così anche questo flusso
    // alimenta il registro persistente condiviso invece di perdere
    // silenziosamente l'informazione su cosa non è stato importato.
    const mancanti = [];
    const sospetti = [];

    if(Array.isArray(parsed)){
      // Formato "piatto": [{"data":"2026-07-01","turno":"Primo"}, ...]
      for(const t of parsed){
        if(!t || typeof t.data!=="string" || typeof t.turno!=="string"){
          sospetti.push({ data:t?.data||"", titolo:t?.turno||"(riga malformata)", oraInizio:"", oraFine:"", motivo:"formato_riga_non_valido" });
          continue;
        }
        if(!/^\d{4}-\d{2}-\d{2}$/.test(t.data)){
          sospetti.push({ data:t.data, titolo:t.turno, oraInizio:"", oraFine:"", motivo:"data_non_valida" });
          continue;
        }
        const mod = trovaModelloPerTesto(t.turno);
        if(!mod){
          mancanti.push({ data:t.data, titolo:t.turno, oraInizio:"", oraFine:"" });
          continue;
        }
        righeElaborate.push({ dateKey: t.data, modelloId: mod.id });
      }
    }else if(parsed && typeof parsed==="object"){
      // Formato "raggruppato per fascia oraria": un oggetto con un livello di
      // annidamento arbitrario (es. {"turni_stella": {"00.00_06.30": [date...]}})
      // dove le foglie sono array di date testuali italiane. Si scende
      // ricorsivamente finché non si trova un array: la CHIAVE che contiene
      // quell'array è trattata come fascia oraria da matchare per orario.
      const visita = (nodo)=>{
        if(Array.isArray(nodo)) return; // gestito dal chiamante tramite Object.entries
        if(nodo && typeof nodo==="object"){
          for(const [chiave, valore] of Object.entries(nodo)){
            if(Array.isArray(valore)){
              const minutiInizio = estraiMinutiInizioFascia(chiave);
              const mod = trovaModelloPerOrarioInizio(minutiInizio);
              if(!mod){
                for(const dataTesto of valore){
                  const iso = dataItalianaToISO(dataTesto) || dataTesto;
                  mancanti.push({ data:iso, titolo:`(fascia "${chiave}")`, oraInizio:"", oraFine:"" });
                }
                continue;
              }
              for(const dataTesto of valore){
                const iso = dataItalianaToISO(dataTesto);
                if(!iso){
                  sospetti.push({ data:dataTesto, titolo:mod.titolo, oraInizio:"", oraFine:"", motivo:"data_non_valida" });
                  continue;
                }
                righeElaborate.push({ dateKey: iso, modelloId: mod.id });
              }
            }else{
              visita(valore);
            }
          }
        }
      };
      visita(parsed);
    }else{
      setErrore("Formato JSON non riconosciuto.");
      setImportando(false);
      return;
    }

    if(righeElaborate.length===0 && mancanti.length===0 && sospetti.length===0){
      setErrore("Nessun turno riconosciuto in questo JSON (controlla formato date, nomi turno, o orari delle fasce).");
      setImportando(false);
      return;
    }
    const n = righeElaborate.length>0 ? await onConfirm(righeElaborate) : 0;
    registraProblemiImport(mancanti, sospetti);
    setNRigheAggiunte(n||0);
    setRisultatoImportOcr({ mancanti, sospetti });
    setImportando(false);
    setStep("riepilogo");
  }

  // URL del backend di doppio controllo OCR (Tesseract + confronto),
  // ospitato separatamente su Render. Se in futuro cambia dominio o si
  // sposta, va aggiornato solo qui.
  const URL_BACKEND_OCR = "https://ocr-mqup.onrender.com";

  // Stato del backend Render: "verificando" | "pronto" | "risveglio" | "assente"
  // Serve solo per informare l'utente PRIMA che clicchi "Verifica con
  // foto", così sa se aspettarsi una risposta rapida o un'attesa fino a
  // un minuto (il piano gratuito di Render va in sleep se inattivo).
  const [statoBackendOcr, setStatoBackendOcr] = useState("verificando");

  useEffect(()=>{
    if(step!=="incolla-json") return;
    let annullato = false;
    setStatoBackendOcr("verificando");

    // Primo tentativo: se risponde entro ~4 secondi, il backend era già
    // sveglio. Se non risponde in tempo, mostriamo "risveglio in corso" e
    // continuiamo ad aspettare la risposta reale (fino al timeout lungo),
    // senza far ripartire una seconda richiesta.
    const timerRisveglio = setTimeout(()=>{
      if(!annullato) setStatoBackendOcr("risveglio");
    }, 4000);

    const controller = new AbortController();
    const timeoutAssente = setTimeout(()=>controller.abort(), 70000); // 70s: oltre il tempo massimo plausibile di risveglio

    fetch(URL_BACKEND_OCR+"/", { signal: controller.signal })
      .then(resp=>{
        if(annullato) return;
        clearTimeout(timerRisveglio);
        setStatoBackendOcr(resp.ok ? "pronto" : "assente");
      })
      .catch(()=>{
        if(annullato) return;
        clearTimeout(timerRisveglio);
        setStatoBackendOcr("assente");
      })
      .finally(()=>clearTimeout(timeoutAssente));

    return ()=>{ annullato=true; clearTimeout(timerRisveglio); clearTimeout(timeoutAssente); controller.abort(); };
  }, [step]);

  async function handleVerificaConFoto(){
    if(verificandoOcr) return;
    if(!fotoVerifica){
      setErroreVerifica("Carica prima una foto della tabella turni.");
      return;
    }
    let parsed;
    try{
      parsed = JSON.parse(testoJsonIncollato.trim());
    }catch(err){
      setErroreVerifica("Il JSON incollato sopra non è valido: correggilo prima di verificare con la foto.");
      return;
    }
    if(!Array.isArray(parsed)){
      setErroreVerifica("La verifica con foto funziona solo con il formato JSON \"piatto\" (un array di {data, turno}), non con quello raggruppato per fascia.");
      return;
    }

    setVerificandoOcr(true);
    setErroreVerifica("");
    setRisultatoVerifica(null);
    try{
      const formData = new FormData();
      formData.append("foto", fotoVerifica);
      formData.append("json_gemini", JSON.stringify(parsed));
      formData.append("anno", String(year));
      formData.append("mese", String(month+1)); // month è 0-based in JS, il backend vuole 1-12
      formData.append("indice_gruppo_atteso", String(indiceGruppoVerifica));

      // Nota: il backend Render (piano gratuito) va in sleep dopo un
      // periodo di inattività — la prima chiamata dopo una pausa può
      // impiegare 30-60 secondi in più per "svegliarsi". Non è un errore,
      // solo un'attesa più lunga del solito.
      const resp = await fetch(`${URL_BACKEND_OCR}/confronta`, {
        method: "POST",
        body: formData
      });
      if(!resp.ok){
        const testoErrore = await resp.text().catch(()=>null);
        throw new Error(testoErrore || `Il backend ha risposto con errore (${resp.status})`);
      }
      const risultato = await resp.json();
      setRisultatoVerifica(risultato);
    }catch(err){
      segnalaErroreSoloLog(err, "Verifica OCR incrociata (backend Render)");
      setErroreVerifica(
        "Non sono riuscito a completare la verifica. Se il backend era inattivo da un po', "+
        "potrebbe aver bisogno di 30-60 secondi per svegliarsi: riprova tra poco. "+
        "Dettaglio tecnico: "+(err&&err.message?err.message:"errore sconosciuto")
      );
    }finally{
      setVerificandoOcr(false);
    }
  }


  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:700,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:420,maxHeight:"85vh",
        display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{padding:"18px 20px 12px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:16,fontWeight:900,color:T.text}}>📷 Importa da foto</div>
          <div style={{fontSize:12,color:"#444444",marginTop:2}}>
            Mese in corso: {NOMI_MESI_IT[month]} {year}. Per ora vengono importati solo Primo, Secondo, Terzo e Notturno.
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:16}}>

          {step==="scegli-tipo"&&(
            <div>
              <div style={{fontSize:13,color:"#1a1a1a",fontWeight:700,marginBottom:14}}>
                Che tipo di tabella stai importando?
              </div>
              <button onClick={()=>{ setTipoTabella("personale"); setStep("upload"); }}
                style={{display:"block",width:"100%",border:`2px dashed ${accent}`,borderRadius:12,
                  padding:"16px",textAlign:"center",cursor:"pointer",color:"#1a1a1a",fontSize:13,fontWeight:700,
                  background:"#ffffff",marginBottom:10}}>
                👤 Turni personali (Primo, Secondo, Terzo, Notte)
              </button>
              <button onClick={()=>{ setTipoTabella("stella"); setStep("upload"); }}
                style={{display:"block",width:"100%",border:`2px dashed ${accent}`,borderRadius:12,
                  padding:"16px",textAlign:"center",cursor:"pointer",color:"#1a1a1a",fontSize:13,fontWeight:700,
                  background:"#ffffff"}}>
                ⭐ Turni Stella (per fasce orarie)
              </button>
              <button onClick={()=>{ setRegistroOcr(leggiRegistroImportProblemi()); setStep("registro-ocr"); }}
                style={{display:"block",width:"100%",marginTop:10,border:"none",borderRadius:10,
                  padding:"10px 0",textAlign:"center",cursor:"pointer",color:T.sub,fontSize:12,fontWeight:700,
                  background:"transparent"}}>
                📋 Registro problemi import
              </button>
            </div>
          )}

          {step==="registro-ocr"&&(
            <div>
              <div style={{fontSize:16,fontWeight:900,color:"#1a1a1a",marginBottom:14}}>Registro problemi import</div>
              {(!registroOcr || registroOcr.length===0) ? (
                <div style={{fontSize:13,color:T.sub,marginBottom:16}}>Nessun problema registrato finora.</div>
              ) : (
                <div style={{maxHeight:440,overflowY:"auto",marginBottom:14}}>
                  {registroOcr.slice().reverse().map((sess,si)=>(
                    <div key={si} style={{marginBottom:16}}>
                      <div style={{fontSize:11,fontWeight:800,color:T.sub,marginBottom:6}}>
                        {new Date(sess.ts).toLocaleString("it-IT")}
                      </div>
                      {sess.mancanti?.length>0 && (
                        <div style={{background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10,marginBottom:8}}>
                          <div style={{fontSize:12,fontWeight:800,color:"#ef4444",marginBottom:6}}>
                            ⚠️ {sess.mancanti.length} senza modello corrispondente
                          </div>
                          {sess.mancanti.map((m,i)=>(
                            <div key={i} style={{fontSize:13,color:"#000",padding:"5px 0",
                              borderBottom: i<sess.mancanti.length-1?"1px solid #ddd":"none"}}>
                              {m.data?fmtDataIT(m.data):"(riga senza data)"} — {m.titolo} {m.oraInizio?`(${m.oraInizio}-${m.oraFine})`:"(tutto il giorno)"}
                            </div>
                          ))}
                        </div>
                      )}
                      {sess.sospetti?.length>0 && (
                        <div style={{background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10}}>
                          <div style={{fontSize:12,fontWeight:800,color:"#f59e0b",marginBottom:6}}>
                            🔶 {sess.sospetti.length} con titolo trovato ma orario non corrispondente
                          </div>
                          {sess.sospetti.map((m,i)=>(
                            <div key={i} style={{fontSize:13,color:"#000",padding:"5px 0",
                              borderBottom: i<sess.sospetti.length-1?"1px solid #ddd":"none"}}>
                              {m.data?fmtDataIT(m.data):"(riga senza data)"} — {m.titolo} {m.oraInizio?`(${m.oraInizio}-${m.oraFine})`:"(nessun orario nel file)"}
                              {" — "}{m.motivo==="ambiguo"?"più modelli con questo titolo":m.motivo==="data_non_valida"?"data non riconosciuta":m.motivo==="formato_riga_non_valido"?"riga malformata":"orario diverso dal modello salvato"}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {registroOcr?.length>0 && (
                <button onClick={()=>{
                    if(confirm("Cancellare tutto il registro dei problemi di import? L'azione non è reversibile.")){
                      cancellaRegistroImportProblemi();
                      setRegistroOcr([]);
                    }
                  }}
                  style={{width:"100%",background:"none",border:"1px solid #ef4444",borderRadius:10,color:"#ef4444",
                    padding:"10px 0",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:10}}>
                  Cancella registro
                </button>
              )}
              <button onClick={()=>setStep("scegli-tipo")}
                style={{width:"100%",background:"none",border:"none",color:T.sub,
                  padding:"6px 0 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>‹ Indietro</button>
            </div>
          )}

          {step==="upload"&&(
            <>
              {errore&&(
                <div style={{background:"#ef444422",border:"1px solid #ef4444",borderRadius:8,
                  padding:"8px 10px",fontSize:12,color:"#ef4444",marginBottom:12}}>
                  {errore}
                </div>
              )}
              <label style={{display:"block",border:`2px dashed ${T.border}`,borderRadius:12,
                padding:"32px 16px",textAlign:"center",cursor:"pointer",color:"#1a1a1a",fontSize:13,fontWeight:700}}>
                Tocca per scegliere la foto della tabella
                <input type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFile(f); }}/>
              </label>
              <label style={{display:"block",marginTop:10,border:`2px dashed ${accent}`,borderRadius:12,
                padding:"14px 16px",textAlign:"center",cursor:"pointer",color:"#1a1a1a",fontSize:13,fontWeight:700,
                background:"#ffffff"}}>
                🤖 Interpreta direttamente con l'AI (foto o PDF)
                <input type="file" accept="image/*,application/pdf" style={{display:"none"}}
                  onChange={e=>{ const f=e.target.files?.[0]; if(f){ pendingFile.current=f; setImgPreviewUrl(f.type.startsWith("image")?URL.createObjectURL(f):null); handleFileConGemini(f); } }}/>
              </label>
              <button onClick={()=>{ setErrore(""); setStep("incolla-json"); }}
                style={{display:"block",width:"100%",marginTop:10,border:`2px dashed #666`,borderRadius:12,
                  padding:"14px 16px",textAlign:"center",cursor:"pointer",color:"#1a1a1a",fontSize:13,fontWeight:700,
                  background:"transparent"}}>
                📋 Incolla un JSON già pronto
              </button>
            </>
          )}

          {step==="incolla-json"&&(
            <div>
              {errore&&(
                <div style={{background:"#ef444422",border:"1px solid #ef4444",borderRadius:8,
                  padding:"8px 10px",fontSize:12,color:"#ef4444",marginBottom:12}}>
                  {errore}
                </div>
              )}
              <div style={{fontSize:12,color:"#444444",marginBottom:8}}>
                Incolla qui l'array JSON con i turni, es: <code>[{"{"}"data":"2026-07-01","turno":"Primo"{"}"}]</code>
              </div>
              <textarea
                value={testoJsonIncollato}
                onChange={e=>setTestoJsonIncollato(e.target.value)}
                placeholder='[{"data":"2026-07-01","turno":"Primo"}]'
                style={{width:"100%",minHeight:160,borderRadius:10,border:`1px solid ${T.border}`,
                  background:T.s2,color:T.text,fontSize:12,fontFamily:"monospace",padding:10,
                  boxSizing:"border-box",resize:"vertical"}}
              />
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={()=>{ setStep("upload"); setErrore(""); }}
                  disabled={importando}
                  style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                    color:importando?T.border:T.sub,padding:"10px 0",
                    cursor:importando?"not-allowed":"pointer",fontWeight:700,fontSize:12}}>
                  Annulla
                </button>
                <button onClick={handleImportaJsonIncollato}
                  disabled={!testoJsonIncollato.trim()||importando}
                  style={{flex:1,background:importando?T.border:(testoJsonIncollato.trim()?accent:T.s2),border:"none",borderRadius:10,
                    color:importando?T.sub:(testoJsonIncollato.trim()?"#fff":T.sub),padding:"10px 0",
                    cursor:(testoJsonIncollato.trim()&&!importando)?"pointer":"not-allowed",fontWeight:700,fontSize:12}}>
                  {importando?"⏳ Importazione in corso…":"Importa"}
                </button>
              </div>

              {/* --- Doppio controllo OCR opzionale, prima dell'import --- */}
              <div style={{marginTop:20,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
                <div style={{fontSize:12,color:"#444444",marginBottom:8,fontWeight:700}}>
                  Verifica facoltativa: confronta questo JSON con una foto della tabella
                </div>
                <div style={{fontSize:11,color:"#444444",marginBottom:10}}>
                  Carica la foto originale: un secondo motore (Tesseract, indipendente da Gemini)
                  rilegge la tabella e segnala le celle dove non è d'accordo, da controllare a mano.
                </div>

                {/* Indicatore di stato del backend Render: informa l'utente
                    se aspettarsi una risposta rapida o un risveglio lento,
                    PRIMA che clicchi "Verifica con foto" */}
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,
                  fontSize:11,padding:"6px 10px",borderRadius:8,
                  background:
                    statoBackendOcr==="pronto" ? "#22c55e22" :
                    statoBackendOcr==="risveglio" ? "#f59e0b22" :
                    statoBackendOcr==="assente" ? "#ef444422" : T.s2,
                  border:`1px solid ${
                    statoBackendOcr==="pronto" ? "#22c55e" :
                    statoBackendOcr==="risveglio" ? "#f59e0b" :
                    statoBackendOcr==="assente" ? "#ef4444" : T.border
                  }`}}>
                  {statoBackendOcr==="verificando" && "⏳ Controllo se il backend di verifica è raggiungibile…"}
                  {statoBackendOcr==="pronto" && "🟢 Backend di verifica pronto — risposta rapida attesa"}
                  {statoBackendOcr==="risveglio" && "🟡 Il backend era inattivo e si sta risvegliando — la verifica può impiegare fino a 1 minuto"}
                  {statoBackendOcr==="assente" && "🔴 Backend di verifica non raggiungibile al momento — puoi comunque procedere solo con Gemini/Tesseract.js"}
                </div>

                <input type="file" accept="image/*"
                  onChange={e=>{ setFotoVerifica(e.target.files?.[0]||null); setRisultatoVerifica(null); setErroreVerifica(""); }}
                  style={{fontSize:12,marginBottom:10,width:"100%"}}
                />

                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <label style={{fontSize:12,color:"#444444"}}>Fascia oraria da controllare:</label>
                  <input type="number" min={0} value={indiceGruppoVerifica}
                    onChange={e=>setIndiceGruppoVerifica(Math.max(0, parseInt(e.target.value)||0))}
                    style={{width:50,padding:"4px 6px",borderRadius:6,border:`1px solid ${T.border}`,
                      background:T.s2,color:T.text,fontSize:12}}
                  />
                  <span style={{fontSize:11,color:"#444444"}}>(0 = prima fascia da sinistra, 1 = seconda, ecc.)</span>
                </div>

                {erroreVerifica&&(
                  <div style={{background:"#ef444422",border:"1px solid #ef4444",borderRadius:8,
                    padding:"8px 10px",fontSize:12,color:"#ef4444",marginBottom:10}}>
                    {erroreVerifica}
                  </div>
                )}

                <button onClick={handleVerificaConFoto}
                  disabled={verificandoOcr||!fotoVerifica}
                  style={{width:"100%",background:verificandoOcr?T.border:(fotoVerifica?T.s2:T.s2),
                    border:`1px solid ${T.border}`,borderRadius:10,
                    color:"#444444",padding:"10px 0",
                    cursor:(fotoVerifica&&!verificandoOcr)?"pointer":"not-allowed",fontWeight:700,fontSize:12,marginBottom:10}}>
                  {verificandoOcr?"⏳ Verifica in corso… (può richiedere fino a 1 minuto se il servizio era inattivo)":"🔍 Verifica con foto"}
                </button>

                {risultatoVerifica&&(
                  <div style={{background:risultatoVerifica.disaccordi.length===0?"#22c55e22":"#f59e0b22",
                    border:`1px solid ${risultatoVerifica.disaccordi.length===0?"#22c55e":"#f59e0b"}`,
                    borderRadius:8,padding:"10px",fontSize:12}}>
                    <div style={{fontWeight:700,marginBottom:6}}>
                      {risultatoVerifica.disaccordi.length===0
                        ? `✅ Nessun disaccordo su ${risultatoVerifica.totale_controllati} date controllate`
                        : `⚠️ ${risultatoVerifica.disaccordi.length} disaccordo${risultatoVerifica.disaccordi.length===1?"":"i"} su ${risultatoVerifica.totale_controllati} date controllate`}
                    </div>
                    <div style={{fontSize:11,color:"#444444",marginBottom:8}}>
                      Fasce orarie rilevate nella foto: {risultatoVerifica.numero_gruppi_rilevati}
                    </div>
                    {risultatoVerifica.disaccordi.map((d,i)=>(
                      <div key={i} style={{marginBottom:6,paddingBottom:6,
                        borderBottom:i<risultatoVerifica.disaccordi.length-1?`1px solid ${T.border}`:"none"}}>
                        <div style={{fontWeight:700}}>{d.data}</div>
                        <div style={{color:"#444444"}}>{d.dettaglio}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step==="riepilogo"&&(
            <div style={{textAlign:"left",padding:"24px 20px"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:12}}>✅</div>
                <div style={{fontSize:15,color:"#1a1a1a",fontWeight:800,marginBottom:8}}>
                  {nRigheAggiunte>0
                    ? `${nRigheAggiunte} turno${nRigheAggiunte===1?"":"i"} aggiunto${nRigheAggiunte===1?"":"i"} al calendario`
                    : "Nessun turno nuovo aggiunto"}
                </div>
                {nRigheAggiunte===0&&(!risultatoImportOcr || (risultatoImportOcr.mancanti.length===0 && risultatoImportOcr.sospetti.length===0))&&(
                  <div style={{fontSize:12,color:"#1a1a1a",marginBottom:8}}>
                    I turni trovati erano probabilmente già presenti nel calendario.
                  </div>
                )}
              </div>

              {risultatoImportOcr?.mancanti?.length>0 && (
                <div style={{marginTop:14}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#ef4444",marginBottom:8}}>
                    ⚠️ {risultatoImportOcr.mancanti.length} righe senza modello corrispondente:
                  </div>
                  <div style={{maxHeight:220,overflowY:"auto",background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10,marginBottom:14}}>
                    {risultatoImportOcr.mancanti.map((m,i)=>(
                      <div key={i} style={{fontSize:13,color:"#000",padding:"5px 0",
                        borderBottom: i<risultatoImportOcr.mancanti.length-1?"1px solid #ddd":"none"}}>
                        {m.data?fmtDataIT(m.data):"(riga senza data)"} — {m.titolo} {m.oraInizio?`(${m.oraInizio}-${m.oraFine})`:"(tutto il giorno)"}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {risultatoImportOcr?.sospetti?.length>0 && (
                <div>
                  <div style={{fontSize:12,fontWeight:800,color:"#f59e0b",marginBottom:8}}>
                    🔶 {risultatoImportOcr.sospetti.length} righe con titolo trovato ma orario non corrispondente:
                  </div>
                  <div style={{maxHeight:220,overflowY:"auto",background:"#fff",border:"1px solid #ddd",borderRadius:10,padding:10,marginBottom:14}}>
                    {risultatoImportOcr.sospetti.map((m,i)=>(
                      <div key={i} style={{fontSize:13,color:"#000",padding:"5px 0",
                        borderBottom: i<risultatoImportOcr.sospetti.length-1?"1px solid #ddd":"none"}}>
                        {m.data?fmtDataIT(m.data):"(riga senza data)"} — {m.titolo} {m.oraInizio?`(${m.oraInizio}-${m.oraFine})`:"(nessun orario nel file)"}
                        {" — "}{m.motivo==="ambiguo"?"più modelli con questo titolo":m.motivo==="data_non_valida"?"data non riconosciuta":m.motivo==="formato_riga_non_valido"?"riga malformata":"orario diverso dal modello salvato"}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={()=>{ onClose(); }}
                style={{width:"100%",marginTop:2,background:accent,border:"none",borderRadius:10,
                  color:getContrastTextColor(accent),padding:"11px 0",cursor:"pointer",fontWeight:700,fontSize:13}}>
                Fatto
              </button>
            </div>
          )}

          {step==="ocr"&&(
            <div style={{textAlign:"center",padding:"40px 16px"}}>
              {imgPreviewUrl&&<img src={imgPreviewUrl} alt="" style={{maxWidth:"100%",maxHeight:140,borderRadius:8,marginBottom:16}}/>}
              <div style={{fontSize:13,color:"#444444",marginBottom:10}}>Lettura della foto in corso… {progresso}%</div>
              <div style={{height:6,background:T.s2,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${progresso}%`,background:accent,transition:"width 0.2s"}}/>
              </div>
            </div>
          )}

          {step==="chiedi-gemini"&&(
            <div style={{textAlign:"center",padding:"20px 8px"}}>
              {imgPreviewUrl&&<img src={imgPreviewUrl} alt="" style={{maxWidth:"100%",maxHeight:140,borderRadius:8,marginBottom:16}}/>}
              {errore&&<div style={{fontSize:13,color:"#1a1a1a",fontWeight:600,marginBottom:16}}>{errore}</div>}
              {confidenzaRaggiunta!=null&&!nessunTurnoRilevato&&(
                <div style={{fontSize:12,color:"#1a1a1a",fontWeight:600,marginBottom:16}}>
                  Confidenza lettura locale raggiunta: {Math.round(confidenzaRaggiunta)}%
                </div>
              )}
              <div style={{fontSize:13,color:"#1a1a1a",marginBottom:16,fontWeight:700}}>
                Il file non è leggibile in locale. Vuoi provare con l'intelligenza artificiale (Gemini)?
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{ setStep("upload"); setErrore(""); }}
                  style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
                    color:"#444444",padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
                  No, riprovo la foto
                </button>
                <button onClick={()=>handleFileConGemini(pendingFile.current)}
                  style={{flex:1,background:accent,border:"none",borderRadius:10,
                    color:getContrastTextColor(accent),padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
                  🤖 Sì, usa l'AI
                </button>
              </div>
              <button onClick={()=>{ setErrore(""); setStep("incolla-json"); }}
                style={{width:"100%",marginTop:8,background:"transparent",border:`1px solid ${T.border}`,
                  borderRadius:10,color:"#444444",padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
                📋 Oppure incolla un JSON già pronto
              </button>
            </div>
          )}

          {step==="gemini-ocr"&&(
            <div style={{textAlign:"center",padding:"40px 16px"}}>
              {imgPreviewUrl&&<img src={imgPreviewUrl} alt="" style={{maxWidth:"100%",maxHeight:140,borderRadius:8,marginBottom:16}}/>}
              <div style={{fontSize:13,color:"#444444"}}>Lettura del file con l'AI in corso…</div>
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:8,padding:16,borderTop:`1px solid ${T.border}`}}>
          <button onClick={onClose}
            style={{flex:1,background:T.s2,border:`1px solid ${T.border}`,borderRadius:10,
              color:"#444444",padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:12}}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
// #endregion
