package com.turni.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * Widget "Turni - 2 settimane": disegna la settimana in corso e la successiva
 * (turni, quartine, domeniche e festivi) leggendo i dati che l'app salva in
 * SharedPreferences tramite TurniWidgetPlugin.
 */
public class TurniWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "turni_widget";
    static final String CHIAVE = "data";
    private static final String[] INIZIALI = {"L", "M", "M", "G", "V", "S", "D"};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) aggiorna(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        aggiorna(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_DATE_CHANGED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            aggiornaTutti(ctx);
        }
    }

    /** Ridisegna tutti i widget presenti in home. */
    static void aggiornaTutti(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TurniWidgetProvider.class));
            for (int id : ids) aggiorna(ctx, mgr, id);
        } catch (Exception ignored) {
        }
    }

    private static void aggiorna(Context ctx, AppWidgetManager mgr, int id) {
        try {
            Bundle opt = mgr.getAppWidgetOptions(id);
            DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
            float d = dm.density;
            int wDp = opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 300);
            int hDp = opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 220);
            if (wDp <= 0) wDp = 300;
            if (hDp <= 0) hDp = 220;
            int w = Math.round(wDp * d);
            int h = Math.round(hDp * d);
            // limite di memoria per l'immagine passata al launcher
            while ((long) w * h > 1400000L) {
                w = w * 9 / 10;
                h = h * 9 / 10;
            }
            Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            disegna(ctx, new Canvas(bmp), w, h, d);

            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_turni);
            rv.setImageViewBitmap(R.id.widget_img, bmp);
            Intent it = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            if (it != null) {
                PendingIntent pi = PendingIntent.getActivity(ctx, 0, it,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                rv.setOnClickPendingIntent(R.id.widget_root, pi);
            }
            mgr.updateAppWidget(id, rv);
        } catch (Exception ignored) {
        }
    }

    private static JSONObject leggi(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String s = sp.getString(CHIAVE, null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    // ---------- colori ----------
    private static int col(String s, int def) {
        try {
            if (s == null || s.trim().isEmpty()) return def;
            return Color.parseColor(s.trim());
        } catch (Exception e) {
            return def;
        }
    }

    private static float lum(int c) {
        return (0.299f * Color.red(c) + 0.587f * Color.green(c) + 0.114f * Color.blue(c)) / 255f;
    }

    private static int mix(int a, int to, float t) {
        int r = Math.round(Color.red(a) + (Color.red(to) - Color.red(a)) * t);
        int g = Math.round(Color.green(a) + (Color.green(to) - Color.green(a)) * t);
        int b = Math.round(Color.blue(a) + (Color.blue(to) - Color.blue(a)) * t);
        return Color.rgb(r, g, b);
    }

    /** Colore del testo a contrasto con lo sfondo. */
    private static int contrasto(int sfondo) {
        return lum(sfondo) < 0.6f ? Color.WHITE : Color.parseColor("#111827");
    }

    /** Numero romano "colore su colore": stessa tinta, un po' più chiara o più scura. */
    private static int romano(int sfondo) {
        return lum(sfondo) < 0.6f ? mix(sfondo, Color.WHITE, 0.38f) : mix(sfondo, Color.BLACK, 0.30f);
    }

    private static String entra(Paint p, String s, float maxW) {
        if (s == null || s.isEmpty()) return "";
        if (p.measureText(s) <= maxW) return s;
        float puntini = p.measureText("\u2026");
        int n = p.breakText(s, true, Math.max(0f, maxW - puntini), null);
        return n <= 0 ? "" : s.substring(0, n) + "\u2026";
    }

    private static void centra(Canvas c, Paint p, String s, float cx, float cy) {
        Paint.FontMetrics fm = p.getFontMetrics();
        c.drawText(s, cx, cy - (fm.ascent + fm.descent) / 2f, p);
    }

    // ---------- disegno ----------
    private static void disegna(Context ctx, Canvas c, int w, int h, float d) {
        JSONObject root = leggi(ctx);
        boolean dark = root != null && root.optBoolean("dark", false);
        JSONObject giorni = root != null ? root.optJSONObject("giorni") : null;
        int sunCol = col(root != null ? root.optString("sunday", "") : "", dark ? 0xFF2D0A0A : 0xFFFFF5F5);
        int holCol = col(root != null ? root.optString("holiday", "") : "", dark ? 0xFF2D0A0A : 0xFFFFF5F5);

        int bg = dark ? 0xFF1B2030 : 0xFFF1F3FC;
        int cellBg = dark ? 0xFF242B3D : 0xFFFFFFFF;
        int txt = dark ? 0xFFE5E7EB : 0xFF111827;
        int sub = dark ? 0xFF9CA3AF : 0xFF6B7280;
        int rosso = 0xFFEF4444;

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        p.setColor(bg);
        float raggio = 14f * d;
        c.drawRoundRect(new RectF(0, 0, w, h), raggio, raggio, p);

        if (root == null) {
            p.setColor(sub);
            p.setTextAlign(Paint.Align.CENTER);
            p.setTextSize(13f * d);
            centra(c, p, "Apri l'app Turni per caricare i dati", w / 2f, h / 2f);
            return;
        }

        float pad = 6f * d;
        float gap = 2f * d;
        float headerH = 16f * d;
        float gridTop = pad + headerH;
        float cellW = (w - 2 * pad - 6 * gap) / 7f;
        float cellH = (h - gridTop - pad - gap) / 2f;
        float cr = 5f * d;

        // intestazione L M M G V S D
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(Typeface.DEFAULT_BOLD);
        p.setTextSize(10.5f * d);
        for (int i = 0; i < 7; i++) {
            p.setColor(i == 6 ? rosso : sub);
            centra(c, p, INIZIALI[i], pad + i * (cellW + gap) + cellW / 2f, pad + headerH / 2f);
        }

        // lunedì della settimana corrente
        Calendar oggi = Calendar.getInstance();
        int oy = oggi.get(Calendar.YEAR), om = oggi.get(Calendar.MONTH), od = oggi.get(Calendar.DAY_OF_MONTH);
        String chiaveOggi = String.format(Locale.US, "%04d-%02d-%02d", oy, om + 1, od);
        Calendar inizio = Calendar.getInstance();
        inizio.set(oy, om, od, 12, 0, 0);
        int offset = (inizio.get(Calendar.DAY_OF_WEEK) + 5) % 7; // lunedì = 0
        inizio.add(Calendar.DAY_OF_MONTH, -offset);

        for (int i = 0; i < 14; i++) {
            Calendar cd = (Calendar) inizio.clone();
            cd.add(Calendar.DAY_OF_MONTH, i);
            int y = cd.get(Calendar.YEAR), m = cd.get(Calendar.MONTH) + 1, dd = cd.get(Calendar.DAY_OF_MONTH);
            String key = String.format(Locale.US, "%04d-%02d-%02d", y, m, dd);
            int colonna = i % 7, riga = i / 7;
            boolean sabDom = colonna == 6;
            boolean eOggi = key.equals(chiaveOggi);

            JSONObject g = giorni != null ? giorni.optJSONObject(key) : null;
            boolean festivo = g != null && g.optInt("h", 0) == 1;
            String qNum = g != null ? g.optString("q", "") : "";
            int qCol = g != null ? col(g.optString("qc", ""), 0) : 0;
            boolean haQ = qCol != 0 && !qNum.isEmpty();

            float left = pad + colonna * (cellW + gap);
            float top = gridTop + riga * (cellH + gap);
            RectF r = new RectF(left, top, left + cellW, top + cellH);

            // sfondo della casella
            c.save();
            Path clip = new Path();
            clip.addRoundRect(r, cr, cr, Path.Direction.CW);
            c.clipPath(clip);
            RectF sopra = new RectF(r.left, r.top, r.right, r.top + cellH / 2f);
            RectF sotto = new RectF(r.left, r.top + cellH / 2f, r.right, r.bottom);
            p.setStyle(Paint.Style.FILL);
            if (haQ) {
                if (festivo) {
                    p.setColor(qCol); c.drawRect(sopra, p);
                    p.setColor(holCol); c.drawRect(sotto, p);
                } else {
                    p.setColor(qCol); c.drawRect(r, p);
                }
            } else if (sabDom && festivo) {
                p.setColor(sunCol); c.drawRect(sopra, p);
                p.setColor(holCol); c.drawRect(sotto, p);
            } else if (sabDom) {
                p.setColor(sunCol); c.drawRect(r, p);
            } else if (festivo) {
                p.setColor(holCol); c.drawRect(r, p);
            } else {
                p.setColor(cellBg); c.drawRect(r, p);
            }
            c.restore();

            // numero romano della quartina (colore su colore)
            if (haQ && !eOggi) {
                RectF area = festivo ? sopra : r;
                p.setTypeface(Typeface.DEFAULT_BOLD);
                p.setTextAlign(Paint.Align.CENTER);
                p.setTextSize(Math.min(area.height() * 0.62f, cellW * 0.60f));
                p.setColor(romano(qCol));
                centra(c, p, qNum, area.centerX(), area.centerY());
            }

            // numero del giorno
            float fsNum = 11.5f * d;
            float cyNum = top + 3f * d + fsNum * 0.62f;
            p.setTextAlign(Paint.Align.CENTER);
            p.setTypeface(Typeface.DEFAULT_BOLD);
            p.setTextSize(fsNum);
            int colNum;
            if (haQ) colNum = contrasto(qCol);
            else if (sabDom || festivo) colNum = rosso;
            else colNum = txt;
            if (eOggi) {
                p.setColor(dark ? 0xFFF3F4F6 : 0xFF1F2937);
                c.drawRoundRect(new RectF(r.centerX() - fsNum * 0.95f, cyNum - fsNum * 0.8f,
                        r.centerX() + fsNum * 0.95f, cyNum + fsNum * 0.8f), fsNum, fsNum, p);
                colNum = dark ? 0xFF111827 : Color.WHITE;
            }
            p.setColor(colNum);
            centra(c, p, String.valueOf(dd), r.centerX(), cyNum);

            // eventi (turni)
            JSONArray ev = g != null ? g.optJSONArray("e") : null;
            if (ev == null || ev.length() == 0) continue;
            int n = ev.length();
            float fs = 8.5f * d;
            float y0 = top + 3f * d + fsNum * 1.25f + 2f * d;
            float limite = top + cellH - 1.5f * d;
            float x1 = left + 1.5f * d, x2 = left + cellW - 1.5f * d;
            float yy = y0;
            int mostrati = 0;
            for (int k = 0; k < n; k++) {
                JSONObject e = ev.optJSONObject(k);
                if (e == null) continue;
                String a = e.optString("a", "");
                String b = e.optString("b", "");
                if (haQ && a.trim().equalsIgnoreCase("QUART")) continue; // la scritta QUART è sostituita dal numero romano
                float sh = b.isEmpty() ? fs + 4f * d : 2f * fs + 4f * d;
                // se resta almeno un altro evento e non c'e' posto per un "+N", cede il posto
                if (yy + sh > limite) break;
                int cE = col(e.optString("c", ""), 0xFF9CA3AF);
                p.setStyle(Paint.Style.FILL);
                p.setColor(cE);
                c.drawRoundRect(new RectF(x1, yy, x2, yy + sh), 3f * d, 3f * d, p);
                int tc = contrasto(cE);
                p.setColor(tc);
                p.setTextAlign(Paint.Align.CENTER);
                p.setTypeface(Typeface.DEFAULT_BOLD);
                p.setTextSize(fs);
                float maxW = x2 - x1 - 3f * d;
                // restringe un po' il testo prima di tagliarlo con i puntini
                float sz = fs;
                while (p.measureText(a) > maxW && sz > fs * 0.72f) {
                    sz -= 0.4f * d;
                    p.setTextSize(sz);
                }
                if (b.isEmpty()) {
                    centra(c, p, entra(p, a, maxW), (x1 + x2) / 2f, yy + sh / 2f);
                } else {
                    centra(c, p, entra(p, a, maxW), (x1 + x2) / 2f, yy + 2f * d + fs * 0.5f);
                    p.setTypeface(Typeface.DEFAULT);
                    p.setTextSize(fs * 0.92f);
                    centra(c, p, entra(p, b, maxW), (x1 + x2) / 2f, yy + 2f * d + fs * 1.5f);
                }
                yy += sh + 1f * d;
                mostrati++;
            }
            int visibili = 0;
            for (int k = 0; k < n; k++) {
                JSONObject e = ev.optJSONObject(k);
                if (e == null) continue;
                if (haQ && e.optString("a", "").trim().equalsIgnoreCase("QUART")) continue;
                visibili++;
            }
            if (visibili > mostrati) {
                p.setColor(haQ ? contrasto(qCol) : sub);
                p.setTextAlign(Paint.Align.RIGHT);
                p.setTypeface(Typeface.DEFAULT_BOLD);
                p.setTextSize(8f * d);
                c.drawText("+" + (visibili - mostrati), x2 - 1f * d, top + cellH - 2f * d, p);
            }
        }
    }
}
