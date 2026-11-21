package com.turni.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.zip.GZIPInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TurniUpdate")
public class TurniUpdatePlugin extends Plugin {

    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void scaricaEInstalla(PluginCall call) {
        String tag = call.getString("tag");
        if (tag == null || tag.trim().isEmpty()) {
            call.reject("Tag della release non valido");
            return;
        }
        downloadExecutor.execute(() -> {
            try {
                File apk = scaricaApk(tag);
                getActivity().runOnUiThread(() -> avviaInstallazione(call, apk));
            } catch (Exception e) {
                call.reject("Download APK non riuscito: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void scaricaPatchEInstalla(PluginCall call) {
            String tag = call.getString("tag");
            String buildText = call.getString("build");
            if (tag == null || buildText == null) {
                call.reject("Dati aggiornamento mancanti");
                return;
            }
            int build;
            try { build = Integer.parseInt(buildText); } catch (Exception e) {
                call.reject("Numero build installata non valido");
                return;
            }
            downloadExecutor.execute(() -> {
                try {
                    String releaseTag = tag.replace("#", "%23");
                    String releaseBase = "https://github.com/tesonemgs5/turni/releases/download/" + releaseTag + "/";
                    File work = new File(getContext().getCacheDir(), "turni-patch");
                    if (work.exists()) eliminaRicorsivo(work);
                    work.mkdirs();
                    File manifestFile = scaricaAsset(releaseBase + "patches.json", new File(work, "patches.json"));
                    JSONObject manifest = new JSONObject(new String(java.nio.file.Files.readAllBytes(manifestFile.toPath()), "UTF-8"));
                    JSONObject current = manifest.getJSONObject("current");
                    int target = current.getInt("build");
                    if (build >= target) {
                        call.reject("Aggiornamento gia' installato");
                        return;
                    }

                    JSONObject base = manifest.getJSONObject("base");
                    JSONArray patches = manifest.getJSONArray("patches");
                    File oldApk = null;
                    boolean fromInstalled = true;
                    String fromSha = sha256(new File(getContext().getApplicationInfo().sourceDir));
                    JSONArray chain = new JSONArray();
                    int cursor = build;
                    while (cursor != target) {
                        JSONObject edge = trovaPatch(patches, cursor);
                        if (edge == null) { fromInstalled = false; break; }
                        chain.put(edge);
                        cursor = edge.getInt("to");
                    }
                    if (fromInstalled) {
                        oldApk = new File(getContext().getApplicationInfo().sourceDir);
                        if (!sha256(oldApk).equals(chain.getJSONObject(0).getString("from_sha"))) fromInstalled = false;
                    }
                    if (!fromInstalled) {
                        oldApk = scaricaAsset(releaseBase + base.getString("asset"), new File(work, "base.apk"));
                        if (!sha256(oldApk).equals(base.getString("sha256"))) {
                            throw new Exception("APK base non valido");
                        }
                        chain = new JSONArray();
                        cursor = base.getInt("build");
                        while (cursor != target) {
                            JSONObject edge = trovaPatch(patches, cursor);
                            if (edge == null) throw new Exception("Catena patch incompleta");
                            chain.put(edge);
                            cursor = edge.getInt("to");
                        }
                    }
                    if (oldApk == null) throw new Exception("APK di partenza non disponibile");

                    File currentApk = oldApk;
                    for (int i = 0; i < chain.length(); i++) {
                        JSONObject edge = chain.getJSONObject(i);
                        File patch = scaricaAsset(releaseBase + edge.getString("asset"),
                            new File(work, "patch-" + edge.getInt("from") + "-" + edge.getInt("to") + ".dpat"));
                        File out = i == chain.length() - 1
                            ? new File(work, "turni-update.apk")
                            : new File(work, "step-" + i + ".apk");
                        applicaDpat(currentApk, patch, out);
                        currentApk = out;
                        if (!sha256(currentApk).equals(edge.getString("to_sha"))) {
                            throw new Exception("Patch verificata ma APK ricostruito non valido");
                        }
                    }
                    if (!sha256(currentApk).equals(current.getString("sha256"))) {
                        throw new Exception("Impronta APK finale non valida");
                    }
                    File apk = new File(getContext().getCacheDir(), "turni-update.apk");
                    if (apk.exists()) apk.delete();
                    if (!currentApk.renameTo(apk)) {
                        try (InputStream in = new FileInputStream(currentApk);
                             FileOutputStream out = new FileOutputStream(apk)) {
                            copiaFlusso(in, out);
                        }
                    }
                    getActivity().runOnUiThread(() -> avviaInstallazione(call, apk));
                } catch (Exception e) {
                    call.reject("Aggiornamento patch non riuscito: " + e.getMessage());
                }
            });
        }
    // ---- Aggiornamento guidato dall'app (finestre come in DartPDF) ------------------------------
    // L'app sceglie i pezzi da scaricare (APK base e/o patch) e li passa qui: si scaricano nella
    // cache dell'app (mai nella cartella Download del telefono), si applicano le patch e si apre
    // l'installatore. L'avanzamento arriva all'app con l'evento "avanzamentoAggiornamento".
    private static final String URL_RELEASE = "https://github.com/tesonemgs5/turni/releases/download/";
    private volatile boolean aggiornamentoAnnullato = false;

    @PluginMethod
    public void leggiTesto(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith(URL_RELEASE)) {
            call.reject("Indirizzo non valido");
            return;
        }
        downloadExecutor.execute(() -> {
            File tmp = new File(getContext().getCacheDir(), "turni-testo.tmp");
            try {
                scaricaAsset(url, tmp);
                if (tmp.length() > 2L * 1024 * 1024) throw new Exception("file troppo grande");
                String testo = new String(java.nio.file.Files.readAllBytes(tmp.toPath()), "UTF-8");
                JSObject out = new JSObject();
                out.put("testo", testo);
                call.resolve(out);
            } catch (Exception e) {
                call.reject("Lettura non riuscita: " + e.getMessage());
            } finally {
                tmp.delete();
            }
        });
    }

    @PluginMethod
    public void annullaAggiornamento(PluginCall call) {
        aggiornamentoAnnullato = true;
        call.resolve();
    }

    @PluginMethod
    public void eseguiAggiornamento(PluginCall call) {
        final String baseUrl = call.getString("baseUrl");
        final JSONArray passi = call.getArray("passi");
        final String partenza = call.getString("partenza", "installata");
        final String shaBase = call.getString("shaBase", "");
        final String shaFinale = call.getString("shaFinale", "");
        if (baseUrl == null || !baseUrl.startsWith(URL_RELEASE) || passi == null || passi.length() == 0
                || shaFinale == null || shaFinale.isEmpty()) {
            call.reject("Dati aggiornamento mancanti");
            return;
        }
        aggiornamentoAnnullato = false;
        downloadExecutor.execute(() -> {
            File work = new File(getContext().getCacheDir(), "turni-patch");
            try {
                if (work.exists()) eliminaRicorsivo(work);
                work.mkdirs();
                File corrente = "base".equals(partenza)
                        ? null : new File(getContext().getApplicationInfo().sourceDir);
                final int n = passi.length();
                for (int i = 0; i < n; i++) {
                    JSONObject passo = passi.getJSONObject(i);
                    String tipo = passo.getString("tipo");
                    File scaricato = new File(work, "passo-" + i + ("base".equals(tipo) ? ".apk" : ".dpat"));
                    scaricaConAvanzamento(URL_RELEASE_DI(baseUrl) + passo.getString("asset"), scaricato,
                            i, n, passo.optLong("size", 0));
                    if ("base".equals(tipo)) {
                        eventoAvanzamento(i, n, "verifica", 0, 0);
                        if (!shaBase.isEmpty() && !sha256(scaricato).equals(shaBase)) {
                            throw new Exception("APK base non valido");
                        }
                        corrente = scaricato;
                    } else {
                        if (corrente == null) throw new Exception("APK di partenza non disponibile");
                        eventoAvanzamento(i, n, "applico", 0, 0);
                        String daSha = passo.optString("from_sha", "");
                        if (!daSha.isEmpty() && !sha256(corrente).equals(daSha)) {
                            throw new Exception("L'APK installato non coincide con quello della patch");
                        }
                        File uscita = new File(work, "passo-" + i + ".apk");
                        applicaDpat(corrente, scaricato, uscita);
                        String aSha = passo.optString("to_sha", "");
                        if (!aSha.isEmpty() && !sha256(uscita).equals(aSha)) {
                            throw new Exception("APK ricostruito non valido");
                        }
                        scaricato.delete();
                        if (corrente.getParentFile() != null && corrente.getParentFile().equals(work)) {
                            corrente.delete();
                        }
                        corrente = uscita;
                    }
                    if (aggiornamentoAnnullato) throw new Exception("Aggiornamento annullato");
                }
                if (corrente == null || !sha256(corrente).equals(shaFinale)) {
                    throw new Exception("Impronta dell'APK finale non valida");
                }
                if (!apkValido(corrente)) throw new Exception("File APK non valido");
                File apk = new File(getContext().getCacheDir(), "turni-update.apk");
                if (apk.exists()) apk.delete();
                if (!corrente.renameTo(apk)) {
                    try (InputStream in = new FileInputStream(corrente);
                         FileOutputStream out = new FileOutputStream(apk)) {
                        copiaFlusso(in, out);
                    }
                }
                eliminaRicorsivo(work);
                eventoAvanzamento(n, n, "pronto", 0, 0);
                getActivity().runOnUiThread(() -> avviaInstallazione(call, apk));
            } catch (Exception e) {
                eliminaRicorsivo(work);
                String msg = e.getMessage();
                call.reject(msg == null || msg.isEmpty() ? "Aggiornamento non riuscito" : msg);
            }
        });
    }

    private static String URL_RELEASE_DI(String baseUrl) {
        return baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    }

    private void eventoAvanzamento(int indice, int totale, String fase, long letti, long byteTotali) {
        JSObject dati = new JSObject();
        dati.put("indice", indice);
        dati.put("totale", totale);
        dati.put("fase", fase);
        dati.put("byteLetti", letti);
        dati.put("byteTotali", byteTotali);
        notifyListeners("avanzamentoAggiornamento", dati);
    }

    private void scaricaConAvanzamento(String urlText, File destinazione, int indice, int totale,
                                       long attesa) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlText).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "Turni-Android-Updater");
        try {
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new Exception("Download non riuscito (HTTP " + conn.getResponseCode() + ")");
            }
            long byteTotali = conn.getContentLengthLong() > 0 ? conn.getContentLengthLong() : attesa;
            long letti = 0;
            long ultimoEvento = 0;
            try (InputStream input = conn.getInputStream();
                 FileOutputStream output = new FileOutputStream(destinazione)) {
                byte[] buffer = new byte[32768];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (aggiornamentoAnnullato) throw new Exception("Aggiornamento annullato");
                    output.write(buffer, 0, read);
                    letti += read;
                    long ora = System.currentTimeMillis();
                    if (ora - ultimoEvento > 150) {
                        ultimoEvento = ora;
                        eventoAvanzamento(indice, totale, "scarico", letti, byteTotali);
                    }
                }
                output.getFD().sync();
            }
            eventoAvanzamento(indice, totale, "scarico", letti, byteTotali);
        } finally {
            conn.disconnect();
        }
    }

    private File scaricaApk(String tag) throws Exception {
        String releaseTag = tag.replace("#", "%23");
        URL url = new URL("https://github.com/tesonemgs5/turni/releases/download/" + releaseTag + "/turni.apk");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "Turni-Android-Updater");
        conn.setRequestProperty("Accept", "application/octet-stream");

        File parziale = new File(getContext().getCacheDir(), "turni-update.apk.part");
        File apk = new File(getContext().getCacheDir(), "turni-update.apk");
        try {
            int stato = conn.getResponseCode();
            if (stato != HttpURLConnection.HTTP_OK) {
                throw new Exception("GitHub ha risposto con HTTP " + stato);
            }
            try (InputStream input = new BufferedInputStream(conn.getInputStream());
                 FileOutputStream output = new FileOutputStream(parziale)) {
                byte[] buffer = new byte[16384];
                int letti;
                while ((letti = input.read(buffer)) != -1) output.write(buffer, 0, letti);
                output.getFD().sync();
            }
            if (parziale.length() < 4 || !apkValido(parziale)) {
                throw new Exception("Il file ricevuto non sembra un APK valido");
            }
            if (apk.exists() && !apk.delete()) throw new Exception("Impossibile sostituire l'APK precedente");
            if (!parziale.renameTo(apk)) throw new Exception("Impossibile salvare l'APK scaricato");
            return apk;
        } finally {
            conn.disconnect();
            if (parziale.exists()) parziale.delete();
        }
    }

    private boolean apkValido(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file)) {
            return input.read() == 'P' && input.read() == 'K' && input.read() == 3 && input.read() == 4;
        }
    }

    private File scaricaAsset(String urlText, File destination) throws Exception {
        URL url = new URL(urlText);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "Turni-Android-Updater");
        try {
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new Exception("Asset HTTP " + conn.getResponseCode());
            }
            try (InputStream input = conn.getInputStream();
                 FileOutputStream output = new FileOutputStream(destination)) {
                copiaFlusso(input, output);
            }
            return destination;
        } finally {
            conn.disconnect();
        }
    }

    private static void copiaFlusso(InputStream input, FileOutputStream output) throws Exception {
        byte[] buffer = new byte[16384];
        int read;
        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        output.getFD().sync();
    }

    private static JSONObject trovaPatch(JSONArray patches, int from) throws Exception {
        for (int i = 0; i < patches.length(); i++) {
            JSONObject edge = patches.getJSONObject(i);
            if (edge.getInt("from") == from) return edge;
        }
        return null;
    }

    private static void eliminaRicorsivo(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) eliminaRicorsivo(child);
        }
        file.delete();
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder out = new StringBuilder();
        for (byte b : digest.digest()) out.append(String.format("%02x", b & 0xff));
        return out.toString();
    }

    private static void applicaDpat(File oldFile, File patchFile, File outFile) throws Exception {
        try (RandomAccessFile old = new RandomAccessFile(oldFile, "r");
             GZIPInputStream patch = new GZIPInputStream(new FileInputStream(patchFile));
             FileOutputStream out = new FileOutputStream(outFile)) {
            byte[] head = leggiEsatto(patch, 86);
            if (!new String(head, 0, 6, "ISO-8859-1").equals("DPAT1\u0000")) {
                throw new Exception("patch DPAT1 non valida");
            }
            ByteBuffer buffer = ByteBuffer.wrap(head).order(ByteOrder.LITTLE_ENDIAN);
            long oldSize = buffer.getLong(6);
            long newSize = buffer.getLong(46);
            if (old.length() != oldSize) throw new Exception("patch non adatta all'APK installato");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long written = 0;
            while (true) {
                int op = patch.read();
                if (op == -1) throw new Exception("patch troncata");
                if (op == 0) break;
                if (op == 1) {
                    byte[] raw = leggiEsatto(patch, 16);
                    ByteBuffer copy = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
                    long position = copy.getLong(0);
                    long length = copy.getLong(8);
                    if (position + length > oldSize) throw new Exception("copia patch fuori intervallo");
                    old.seek(position);
                    while (length > 0) {
                        int size = (int) Math.min(length, 16384);
                        byte[] chunk = new byte[size];
                        if (old.read(chunk) != size) throw new Exception("APK installato troncato");
                        out.write(chunk);
                        digest.update(chunk);
                        written += size;
                        length -= size;
                    }
                } else if (op == 2) {
                    byte[] rawLength = leggiEsatto(patch, 8);
                    long length = ByteBuffer.wrap(rawLength).order(ByteOrder.LITTLE_ENDIAN).getLong();
                    while (length > 0) {
                        int size = (int) Math.min(length, 16384);
                        byte[] chunk = leggiEsatto(patch, size);
                        out.write(chunk);
                        digest.update(chunk);
                        written += size;
                        length -= size;
                    }
                } else {
                    throw new Exception("operazione patch sconosciuta");
                }
            }
            out.getFD().sync();
            byte[] expected = java.util.Arrays.copyOfRange(head, 54, 86);
            if (written != newSize || !java.util.Arrays.equals(digest.digest(), expected)) {
                throw new Exception("APK ricostruito non valido");
            }
        }
    }

    private static byte[] leggiEsatto(InputStream input, int length) throws Exception {
        byte[] out = new byte[length];
        int offset = 0;
        while (offset < length) {
            int read = input.read(out, offset, length - offset);
            if (read == -1) throw new Exception("patch troncata");
            offset += read;
        }
        return out;
    }

    private void avviaInstallazione(PluginCall call, File apk) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, settings, "permessoInstallazioneRisultato");
            return;
        }
        apriInstallatore(call, apk);
    }

    @ActivityCallback
    private void permessoInstallazioneRisultato(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Autorizzazione Android per installare app non concessa");
            return;
        }
        File apk = new File(getContext().getCacheDir(), "turni-update.apk");
        if (!apk.isFile()) {
            call.reject("APK scaricato non più disponibile; riprova il download");
            return;
        }
        apriInstallatore(call, apk);
    }

    private void apriInstallatore(PluginCall call, File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(install);
            JSObject result = new JSObject();
            result.put("avviato", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Impossibile aprire l'installatore Android: " + e.getMessage());
        }
    }
}
