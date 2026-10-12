// 17-widget.js — Ponte verso il widget Android "Turni - 2 settimane".
// Funziona solo dentro l'APK (Capacitor Android): altrove non fa nulla.
// Il plugin nativo "TurniWidget" (TurniWidgetPlugin.java) salva i dati sul telefono
// e fa ridisegnare il widget.

export function widgetDisponibile(){
  try{
    const C = typeof window!=="undefined" ? window.Capacitor : null;
    return !!(C && typeof C.isNativePlatform==="function" && C.isNativePlatform()
      && typeof C.getPlatform==="function" && C.getPlatform()==="android"
      && typeof C.registerPlugin==="function");
  }catch(e){ return false; }
}

// Testo di diagnosi (finisce nel Log dell'app se qualcosa non va).
export function descriviStatoWidget(){
  try{
    const C = typeof window!=="undefined" ? window.Capacitor : null;
    if(!C) return "Capacitor assente";
    const piattaforma = typeof C.getPlatform==="function" ? C.getPlatform() : "?";
    const nativo = typeof C.isNativePlatform==="function" ? C.isNativePlatform() : "?";
    const plugin = typeof C.isPluginAvailable==="function" ? C.isPluginAvailable("TurniWidget") : "?";
    return `piattaforma=${piattaforma}, nativo=${nativo}, plugin TurniWidget disponibile=${plugin}`;
  }catch(e){ return "stato non leggibile"; }
}

let _plugin = null;
// Restituisce sempre un esito, cosi' chi chiama puo' scriverlo nel Log:
//   { ok:true }  |  { ok:false, saltato:true }  (non e' l'APK)  |  { ok:false, errore, stato }
export async function inviaAlWidget(dati){
  if(!widgetDisponibile()) return { ok:false, saltato:true };
  try{
    if(!_plugin) _plugin = window.Capacitor.registerPlugin("TurniWidget");
    await _plugin.aggiorna({ json: JSON.stringify(dati) });
    return { ok:true };
  }catch(e){
    // Il widget non deve mai dare problemi all'app: nessuna eccezione verso l'esterno.
    return { ok:false, errore: (e && e.message) ? e.message : String(e), stato: descriviStatoWidget() };
  }
}
