package com.turni.app;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte fra l'app (JavaScript) e il widget: riceve i dati dei giorni come testo JSON,
 * li salva sul telefono e fa ridisegnare il widget.
 */
@CapacitorPlugin(name = "TurniWidget")
public class TurniWidgetPlugin extends Plugin {

    @PluginMethod
    public void aggiorna(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json mancante");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(TurniWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit().putString(TurniWidgetProvider.CHIAVE, json).apply();
        TurniWidgetProvider.aggiornaTutti(ctx);
        call.resolve();
    }
}
