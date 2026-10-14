package com.turni.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Salvataggio di file di testo sul telefono:
 *  - salvaConNome: selettore di Android "Salva con nome" (si sceglie cartella e nome);
 *  - scegliCartella / salvaInCartella: una cartella scelta una volta (permesso persistente)
 *    in cui salvare poi senza altre domande;
 *  - infoCartella / dimenticaCartella: stato della cartella scelta.
 * (La condivisione resta gestita dal plugin Share.)
 */
@CapacitorPlugin(name = "TurniFile")
public class TurniFilePlugin extends Plugin {

    private static final String PREFS = "turni_file";
    private static final String CHIAVE_CARTELLA = "cartella_uri";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private byte[] bytesDa(PluginCall call) {
        String dati = call.getString("dati", "");
        return dati.getBytes(StandardCharsets.UTF_8);
    }

    private void scrivi(Uri uri, byte[] dati) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        try (OutputStream os = cr.openOutputStream(uri, "wt")) {
            if (os == null) throw new Exception("flusso di scrittura non disponibile");
            os.write(dati);
            os.flush();
        }
    }

    /** Cartella scelta in precedenza, solo se il permesso di scrittura e' ancora valido. */
    private Uri cartellaValida() {
        String s = prefs().getString(CHIAVE_CARTELLA, null);
        if (s == null) return null;
        Uri tree = Uri.parse(s);
        List<UriPermission> permessi = getContext().getContentResolver().getPersistedUriPermissions();
        for (UriPermission p : permessi) {
            if (p.getUri().equals(tree) && p.isWritePermission()) return tree;
        }
        return null;
    }

    private String nomeCartella(Uri tree) {
        try {
            String id = Uri.decode(DocumentsContract.getTreeDocumentId(tree)); // es. "primary:Download/Turni"
            int i = id.indexOf(':');
            String percorso = i >= 0 ? id.substring(i + 1) : id;
            return percorso.isEmpty() ? "Memoria interna" : percorso;
        } catch (Exception e) {
            return "cartella scelta";
        }
    }

    // -- Salva con nome -------------------------------------------------------
    @PluginMethod
    public void salvaConNome(PluginCall call) {
        String nome = call.getString("nome", "file.json");
        String mime = call.getString("mime", "application/json");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, nome);
        startActivityForResult(call, intent, "salvaConNomeRisultato");
    }

    @ActivityCallback
    private void salvaConNomeRisultato(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            ret.put("ok", false);
            ret.put("annullato", true);
            call.resolve(ret);
            return;
        }
        try {
            scrivi(result.getData().getData(), bytesDa(call));
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Scrittura non riuscita: " + e.getMessage());
        }
    }

    // -- Cartella predefinita -------------------------------------------------
    @PluginMethod
    public void scegliCartella(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "scegliCartellaRisultato");
    }

    @ActivityCallback
    private void scegliCartellaRisultato(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            ret.put("ok", false);
            ret.put("annullato", true);
            call.resolve(ret);
            return;
        }
        Uri tree = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                    tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            prefs().edit().putString(CHIAVE_CARTELLA, tree.toString()).apply();
            ret.put("ok", true);
            ret.put("nome", nomeCartella(tree));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Cartella non utilizzabile: " + e.getMessage());
        }
    }

    @PluginMethod
    public void infoCartella(PluginCall call) {
        JSObject ret = new JSObject();
        Uri tree = cartellaValida();
        ret.put("presente", tree != null);
        if (tree != null) ret.put("nome", nomeCartella(tree));
        call.resolve(ret);
    }

    @PluginMethod
    public void dimenticaCartella(PluginCall call) {
        try {
            String s = prefs().getString(CHIAVE_CARTELLA, null);
            if (s != null) {
                try {
                    getContext().getContentResolver().releasePersistableUriPermission(
                            Uri.parse(s), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } catch (Exception ignorato) { /* permesso gia' revocato */ }
            }
            prefs().edit().remove(CHIAVE_CARTELLA).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void salvaInCartella(PluginCall call) {
        JSObject ret = new JSObject();
        Uri tree = cartellaValida();
        if (tree == null) {
            ret.put("ok", false);
            ret.put("nessunaCartella", true);
            call.resolve(ret);
            return;
        }
        String nome = call.getString("nome", "file.json");
        String mime = call.getString("mime", "application/json");
        try {
            Uri radice = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri file = DocumentsContract.createDocument(getContext().getContentResolver(), radice, mime, nome);
            if (file == null) throw new Exception("impossibile creare il file nella cartella");
            scrivi(file, bytesDa(call));
            ret.put("ok", true);
            ret.put("cartella", nomeCartella(tree));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Salvataggio nella cartella non riuscito: " + e.getMessage());
        }
    }
}
