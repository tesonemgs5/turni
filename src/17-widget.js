// 17-widget.js — Ponte verso il widget Android "Turni - 2 settimane".
// Funziona solo dentro l'APK (Capacitor Android): altrove non fa nulla.
// Il plugin nativo "TurniWidget" (TurniWidgetPlugin.java) salva i dati sul telefono
// e fa ridisegnare il widget.
//
// NB: nell'APK l'oggetto window.Capacitor e' quello iniettato dal codice nativo e puo' NON avere
// registerPlugin (che esiste solo se l'app importa @capacitor/core). Per questo si usa anche
// nativePromise, il canale diretto verso i plugin Android.

function leggiCapacitor(){
  return (typeof window!=="undefined") ? window.Capacitor : null;
}

export function widgetDisponibile(){
  try{
    const C = leggiCapacitor();
    return !!(C && typeof C.isNativePlatform==="function" && C.isNativePlatform()
      && typeof C.getPlatform==="function" && C.getPlatform()==="android"
      && (typeof C.nativePromise==="function" || typeof C.registerPlugin==="function"));
  }catch(e){ return false; }
}

// Testo di diagnosi (finisce nel Log dell'app se qualcosa non va).
export function descriviStatoWidget(){
  try{
    const C = leggiCapacitor();
    if(!C) return "Capacitor assente";
    const piattaforma = typeof C.getPlatform==="function" ? C.getPlatform() : "?";
    const nativo = typeof C.isNativePlatform==="function" ? C.isNativePlatform() : "?";
    const plugin = typeof C.isPluginAvailable==="function" ? C.isPluginAvailable("TurniWidget") : "?";
    const canali = `nativePromise=${typeof C.nativePromise==="function"}, registerPlugin=${typeof C.registerPlugin==="function"}`;
    return `piattaforma=${piattaforma}, nativo=${nativo}, plugin TurniWidget disponibile=${plugin}, ${canali}`;
  }catch(e){ return "stato non leggibile"; }
}

let _plugin = null;
// Restituisce sempre un esito, cosi' chi chiama puo' scriverlo nel Log:
//   { ok:true }  |  { ok:false, saltato:true }  (non e' l'APK)  |  { ok:false, errore, stato }
export async function inviaAlWidget(dati){
  if(!widgetDisponibile()) return { ok:false, saltato:true };
  try{
    const C = leggiCapacitor();
    const opzioni = { json: JSON.stringify(dati) };
    if(typeof C.nativePromise==="function"){
      await C.nativePromise("TurniWidget", "aggiorna", opzioni);
    } else {
      if(!_plugin) _plugin = C.registerPlugin("TurniWidget");
      await _plugin.aggiorna(opzioni);
    }
    return { ok:true };
  }catch(e){
    // Il widget non deve mai dare problemi all'app: nessuna eccezione verso l'esterno.
    const msg = (e && e.message) ? e.message : (typeof e==="string" ? e : JSON.stringify(e));
    return { ok:false, errore: msg, stato: descriviStatoWidget() };
  }
}
