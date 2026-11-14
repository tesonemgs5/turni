package com.turni.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Salvataggio di file di testo sul telefono:
 *  - salvaConNome: selettore di Android "Salva con nome" (si sceglie cartella e nome);
 *  - scegliCartella / salvaInCartella: una cartella scelta una volta (permesso persistente)
 *    in cui salvare poi senza altre domande;
 *  - infoCartella / dimenticaCartella: stato della cartella scelta;
 *  - prendiCondivisi: file ricevuti da "Condividi" di altre app (vedi in fondo).
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

    // -- File ricevuti da "Condividi" (altre app -> Turni) ----------------------
    // Il permesso di lettura dato da Android e' temporaneo, quindi i file condivisi
    // vengono copiati subito in una cartella temporanea dell'app (files/in-arrivo).
    // L'app li legge con prendiCondivisi() e poi li sposta nell'archivio documenti.

    private static final String CARTELLA_IN_ARRIVO = "in-arrivo";
    private static final long MAX_BYTES_IN_ARRIVO = 25L * 1024 * 1024;
    private static final long ETA_MAX_IN_ARRIVO_MS = 24L * 60 * 60 * 1000;

    private final ExecutorService copiaExecutor = Executors.newSingleThreadExecutor();
    private final AtomicInteger contatoreCopie = new AtomicInteger(0);
    private final List<JSObject> pronti = new ArrayList<>();
    private int inCorso = 0;

    @Override
    public void load() {
        try {
            copiaExecutor.execute(this::eliminaVecchiInArrivo);
            if (getActivity() != null) raccogliCondivisi(getActivity().getIntent());
        } catch (Exception ignorato) { /* nessun file condiviso da raccogliere */ }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        raccogliCondivisi(intent);
    }

    private List<Uri> urisDa(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        String azione = intent.getAction();
        if (Intent.ACTION_SEND.equals(azione)) {
            Uri uri;
            if (Build.VERSION.SDK_INT >= 33) {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            }
            if (uri != null) uris.add(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(azione)) {
            ArrayList<Uri> lista;
            if (Build.VERSION.SDK_INT >= 33) {
                lista = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                lista = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            }
            if (lista != null) uris.addAll(lista);
        }
        return uris;
    }

    private void raccogliCondivisi(Intent intent) {
        try {
            if (intent == null) return;
            List<Uri> uris = urisDa(intent);
            if (uris.isEmpty()) return;
            // L'intent e' "consumato": se l'attivita' viene ricreata non va rielaborato.
            intent.removeExtra(Intent.EXTRA_STREAM);
            intent.setAction(Intent.ACTION_MAIN);
            synchronized (pronti) { inCorso += uris.size(); }
            for (Uri uri : uris) copiaExecutor.execute(() -> copiaInArrivo(uri));
        } catch (Exception ignorato) { /* niente da raccogliere */ }
    }

    private String nomeDa(ContentResolver cr, Uri uri) {
        String nome = null;
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) nome = c.getString(0);
        } catch (Exception ignorato) { /* si usa il nome di ripiego */ }
        if (nome == null || nome.trim().isEmpty()) {
            String ultimo = uri.getLastPathSegment();
            nome = (ultimo == null || ultimo.isEmpty()) ? "documento" : ultimo;
        }
        nome = nome.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", "_").trim();
        if (nome.isEmpty()) nome = "documento";
        if (nome.length() > 80) nome = nome.substring(nome.length() - 80);
        return nome;
    }

    private void copiaInArrivo(Uri uri) {
        JSObject voce = new JSObject();
        String nome = "documento";
        try {
            ContentResolver cr = getContext().getContentResolver();
            nome = nomeDa(cr, uri);
            String mime = cr.getType(uri);
            File cartella = new File(getContext().getFilesDir(), CARTELLA_IN_ARRIVO);
            if (!cartella.exists() && !cartella.mkdirs()) throw new Exception("cartella temporanea non creata");
            String nomeFile = System.currentTimeMillis() + "-" + contatoreCopie.incrementAndGet() + "-" + nome;
            File dest = new File(cartella, nomeFile);
            long totale = 0;
            try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(dest)) {
                if (in == null) throw new Exception("file non leggibile");
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    totale += n;
                    if (totale > MAX_BYTES_IN_ARRIVO) throw new Exception("File troppo grande (massimo 25 MB)");
                    out.write(buf, 0, n);
                }
            } catch (Exception e) {
                dest.delete();
                throw e;
            }
            voce.put("nome", nome);
            voce.put("mime", mime == null ? "" : mime);
            voce.put("size", totale);
            voce.put("path", CARTELLA_IN_ARRIVO + "/" + nomeFile);
        } catch (Exception e) {
            voce = new JSObject();
            voce.put("nome", nome);
            voce.put("errore", e.getMessage() == null ? "copia non riuscita" : e.getMessage());
        }
        synchronized (pronti) {
            pronti.add(voce);
            inCorso--;
        }
    }

    private void eliminaVecchiInArrivo() {
        try {
            File cartella = new File(getContext().getFilesDir(), CARTELLA_IN_ARRIVO);
            File[] files = cartella.listFiles();
            if (files == null) return;
            long limite = System.currentTimeMillis() - ETA_MAX_IN_ARRIVO_MS;
            for (File f : files) if (f.isFile() && f.lastModified() < limite) f.delete();
        } catch (Exception ignorato) { /* pulizia non essenziale */ }
    }

    /** Ritorna i file ricevuti da Condividi non ancora letti: { items: [...], inCorso: bool }. */
    @PluginMethod
    public void prendiCondivisi(PluginCall call) {
        JSArray items = new JSArray();
        boolean incorso;
        synchronized (pronti) {
            for (JSObject o : pronti) items.put(o);
            pronti.clear();
            incorso = inCorso > 0;
        }
        JSObject ret = new JSObject();
        ret.put("items", items);
        ret.put("inCorso", incorso);
        call.resolve(ret);
    }
}
