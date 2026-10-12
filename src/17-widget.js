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

let _plugin = null;
export async function inviaAlWidget(dati){
  if(!widgetDisponibile()) return;
  try{
    if(!_plugin) _plugin = window.Capacitor.registerPlugin("TurniWidget");
    await _plugin.aggiorna({ json: JSON.stringify(dati) });
  }catch(e){
    // Il widget non deve mai dare problemi all'app: errori ignorati.
    console.warn("Widget: aggiornamento non riuscito", e);
  }
}
