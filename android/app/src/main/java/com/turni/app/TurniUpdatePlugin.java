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
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TurniUpdate")
public class TurniUpdatePlugin extends Plugin {

    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void scaricaEInstalla(PluginCall call) {
        String tag = call.getString("tag");
        if (tag == null || !tag.matches("^v[0-9]+(\\.[0-9]+){2}$")) {
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

    private File scaricaApk(String tag) throws Exception {
        URL url = new URL("https://github.com/tesonemgs5/turni/releases/download/" + tag + "/turni.apk");
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
        String tag = call.getString("tag");
        File apk = new File(getContext().getCacheDir(), "turni-update.apk");
        if (tag == null || !tag.matches("^v[0-9]+(\\.[0-9]+){2}$") || !apk.isFile()) {
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
