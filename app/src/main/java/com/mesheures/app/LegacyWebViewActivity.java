package com.mesheures.app;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import java.util.regex.Pattern;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.ArrayDeque;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;

import androidx.activity.ComponentActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.widget.FrameLayout;

import com.mesheures.app.core.HybridCore;

/**
 * V36 — ancienne interface (PWA HTML/JS complète : Paie, ROMI1, Planning,
 * Analyse, Dossier probatoire...).
 *
 * Conservée tant que les écrans natifs (feature/*) ne couvrent pas
 * l'intégralité des fonctionnalités de l'ancienne interface. Ouverte
 * explicitement (bouton "Ouvrir MesHeures" du dashboard natif), jamais
 * au démarrage de l'app : voir MainActivity, qui lance toujours
 * NativeDashboardActivity en premier.
 */
public final class LegacyWebViewActivity extends ComponentActivity {

    private WebView web;
    private HybridCore core;


    private static final int REQUEST_EXPORT_FILE = 7401;

    private ByteArrayOutputStream exportBuffer;
    private String exportName;
    private String exportMime;
    /* MH JSON IMPORT FILECHOOSER V2 */
    private ValueCallback<Uri[]> mhJsonFileCallback;
    private static final int REQUEST_IMPORT_JSON = 7402;

    /* V37.2 PLANNING — prise de photo (appareil photo du système) et galerie (sélecteur de photos).
     * Aucune permission CAMERA : ACTION_IMAGE_CAPTURE confie la prise de vue à l'application appareil photo du
     * système, ce qu'Android autorise sans permission tant que l'application ne déclare pas CAMERA.
     * La photo est écrite dans le cache privé (cache/planning-capture) via le FileProvider existant, puis le web
     * en range une copie contrôlée dans files/plannings (pont planningSource*). L'original n'est jamais modifié. */
    private static final int REQUEST_PLANNING_CAMERA = 7403;
    private static final String FILE_PROVIDER = "com.mesheures.app.fileprovider";
    private File planningCaptureFile;
    private Uri planningCaptureUri;
    private volatile String planningPickStatus = "";

    /* Sources des plannings : files/plannings/<sha256>.<ext>, noms contrôlés, contenu vérifié par SHA-256. */
    private static final Pattern PLANNING_NAME = Pattern.compile("^[0-9a-f]{64}\\.(jpg|png|webp|pdf|txt)$");
    private static final Pattern PLANNING_SHA = Pattern.compile("^[0-9a-f]{64}$");
    private static final long PLANNING_MAX_BYTES = 20L * 1024L * 1024L;
    private File planningTmp;
    private FileOutputStream planningOut;
    private MessageDigest planningDigest;
    private String planningName;
    private String planningExpectedSha;
    private long planningSize;

    private File planningDir() {
        File dir = new File(getFilesDir(), "plannings");
        if (!dir.isDirectory()) dir.mkdirs();
        return dir;
    }

    private synchronized void planningAbort() {
        try { if (planningOut != null) planningOut.close(); } catch (Exception ignored) { }
        if (planningTmp != null) planningTmp.delete();
        planningOut = null; planningTmp = null; planningDigest = null; planningName = null; planningExpectedSha = null; planningSize = 0;
    }

    private static String hex(byte[] h) {
        StringBuilder sb = new StringBuilder(h.length * 2);
        for (byte b : h) sb.append(String.format("%02x", b & 0xff));
        return sb.toString();
    }

    private void deliverChooser(Uri[] results) {
        if (mhJsonFileCallback != null) {
            mhJsonFileCallback.onReceiveValue(results);
            mhJsonFileCallback = null;
        }
    }

    /* Photo : appareil photo du système. Absence d'appareil, refus et erreurs : message + annulation propre. */
    private void launchPlanningCamera() {
        if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            planningPickStatus = "camera_absente";
            Toast.makeText(this, "Aucun appareil photo sur cet appareil.", Toast.LENGTH_LONG).show();
            deliverChooser(null);
            return;
        }
        try {
            File dir = new File(getCacheDir(), "planning-capture");
            if (!dir.isDirectory()) dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 3600_000L) f.delete();
            planningCaptureFile = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
            planningCaptureUri = FileProvider.getUriForFile(this, FILE_PROVIDER, planningCaptureFile);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, planningCaptureUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            planningPickStatus = "en_cours";
            startActivityForResult(intent, REQUEST_PLANNING_CAMERA);
        } catch (ActivityNotFoundException e) {
            planningPickStatus = "camera_absente";
            Toast.makeText(this, "Aucune application appareil photo disponible.", Toast.LENGTH_LONG).show();
            deliverChooser(null);
        } catch (SecurityException e) {
            planningPickStatus = "permission_refusee";
            Toast.makeText(this, "Accès à l'appareil photo refusé.", Toast.LENGTH_LONG).show();
            deliverChooser(null);
        } catch (Exception e) {
            android.util.Log.e("MesHeuresPlanning", "camera", e);
            planningPickStatus = "erreur";
            Toast.makeText(this, "Appareil photo inaccessible : " + e.getMessage(), Toast.LENGTH_LONG).show();
            deliverChooser(null);
        }
    }

    private final ArrayDeque<PendingExport> exportQueue =
            new ArrayDeque<>();

    private PendingExport activeExport;

    private static final class PendingExport {
        final String name;
        final String mime;
        final byte[] data;

        PendingExport(String name, String mime, byte[] data) {
            this.name = name;
            this.mime = mime;
            this.data = data;
        }
    }

    private void beginExport(String name, String mime) {
        exportBuffer = new ByteArrayOutputStream();
        exportName = name;
        exportMime =
                (mime == null || mime.isEmpty())
                        ? "application/octet-stream"
                        : mime;
    }

    private void appendExportText(String chunk) {
        if (exportBuffer == null || chunk == null) return;

        try {
            exportBuffer.write(
                    chunk.getBytes(
                            java.nio.charset.StandardCharsets.UTF_8
                    )
            );
        } catch (Exception e) {
            android.util.Log.e(
                    "MesHeuresExport",
                    "append text",
                    e
            );
        }
    }

    private void appendExportBase64(String base64) {
        if (exportBuffer == null || base64 == null) return;

        try {
            exportBuffer.write(
                    android.util.Base64.decode(
                            base64,
                            android.util.Base64.DEFAULT
                    )
            );
        } catch (Exception e) {
            android.util.Log.e(
                    "MesHeuresExport",
                    "append binary",
                    e
            );
        }
    }

    private boolean finishExport() {
        if (exportBuffer == null) return false;

        exportQueue.add(
                new PendingExport(
                        exportName,
                        exportMime,
                        exportBuffer.toByteArray()
                )
        );

        exportBuffer = null;
        exportName = null;
        exportMime = null;

        launchNextExport();

        return true;
    }

    private void launchNextExport() {
        if (activeExport != null || exportQueue.isEmpty()) {
            return;
        }

        activeExport = exportQueue.removeFirst();

        try {
            Intent intent =
                    new Intent(Intent.ACTION_CREATE_DOCUMENT);

            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(activeExport.mime);
            intent.putExtra(
                    Intent.EXTRA_TITLE,
                    activeExport.name
            );

            startActivityForResult(
                    intent,
                    REQUEST_EXPORT_FILE
            );

        } catch (Exception e) {
            android.util.Log.e(
                    "MesHeuresExport",
                    "create document",
                    e
            );

            Toast.makeText(
                    this,
                    "Impossible d'ouvrir l'enregistrement",
                    Toast.LENGTH_LONG
            ).show();

            activeExport = null;
            launchNextExport();
        }
    }

    private final class MesHeuresAndroidBridge {

        @JavascriptInterface
        public boolean beginFileExport(
                String name,
                String mime
        ) {
            beginExport(name, mime);
            return true;
        }

        @JavascriptInterface
        public void appendFileExportChunk(
                String chunk
        ) {
            appendExportText(chunk);
        }

        @JavascriptInterface
        public boolean finishFileExport() {
            return finishExport();
        }

        @JavascriptInterface
        public boolean beginBinaryFileExport(
                String name,
                String mime
        ) {
            beginExport(name, mime);
            return true;
        }

        @JavascriptInterface
        public void appendBinaryFileExportChunk(
                String base64
        ) {
            appendExportBase64(base64);
        }

        @JavascriptInterface
        public boolean finishBinaryFileExport() {
            return finishExport();
        }

        /* MH NATIVE PRINT — impression via android.print.PrintManager.
         * Le web appelle ce pont dès qu'il existe (app-roadmap.js, app-dossier.js,
         * app-v33-assistant.js) ; sans lui, il retombe sur window.open()+print(),
         * qui ne crée pas de vraie fenêtre (multi-fenêtres jamais activé côté
         * WebView) et se contente de remplacer l'app en place — jamais un vrai PDF.
         */
        @JavascriptInterface
        public void printHtml(String html) {
            if (html == null) return;
            runOnUiThread(() -> startPrintJob(html));
        }

        /* MH WIDGET BRIDGE — le web appelle updateWidgetData(json) à chaque
         * rafraîchissement (app-pwa.js, app-v33-assistant.js) en s'attendant à
         * ce que ce pont existe. Sans lui, le JSON n'est jamais écrit dans les
         * SharedPreferences que MhWidgetProvider lit — le widget reste figé sur
         * sa dernière valeur connue (ou une valeur par défaut), quelle que soit
         * la fréquence à laquelle Android déclenche son cycle de 30 minutes :
         * onUpdate() n'a jamais rien de neuf à afficher.
         */
        /* V37.2 PLANNING — écriture contrôlée d'une source (original ou texte extrait) dans files/plannings.
         * Nom imposé « <sha256>.<ext> » (jamais de chemin fourni), 20 Mo au plus, SHA-256 des octets reçus vérifié. */
        @JavascriptInterface
        public synchronized boolean planningSourceBegin(String name, String expectedSha256) {
            planningAbort();
            if (name == null || expectedSha256 == null || !PLANNING_NAME.matcher(name).matches() || !PLANNING_SHA.matcher(expectedSha256).matches()) return false;
            try {
                File dir = planningDir();
                planningTmp = File.createTempFile("source-", ".part", dir);
                planningOut = new FileOutputStream(planningTmp);
                planningDigest = MessageDigest.getInstance("SHA-256");
                planningName = name;
                planningExpectedSha = expectedSha256;
                planningSize = 0;
                return true;
            } catch (Exception e) {
                android.util.Log.e("MesHeuresPlanning", "begin", e);
                planningAbort();
                return false;
            }
        }

        @JavascriptInterface
        public synchronized boolean planningSourceAppend(String base64) {
            if (planningOut == null || base64 == null) return false;
            try {
                byte[] part = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                planningSize += part.length;
                if (planningSize > PLANNING_MAX_BYTES) { planningAbort(); return false; }
                planningDigest.update(part);
                planningOut.write(part);
                return true;
            } catch (Exception e) {
                android.util.Log.e("MesHeuresPlanning", "append", e);
                planningAbort();
                return false;
            }
        }

        @JavascriptInterface
        public synchronized boolean planningSourceFinish() {
            if (planningOut == null || planningTmp == null) return false;
            try {
                planningOut.flush();
                planningOut.close();
                planningOut = null;
                String got = hex(planningDigest.digest());
                if (!got.equals(planningExpectedSha)) { planningAbort(); return false; }
                File dest = new File(planningDir(), planningName);
                if (dest.isFile()) { planningAbort(); return true; }           // même nom = même empreinte : déjà conservé
                boolean ok = planningTmp.renameTo(dest);
                if (!ok) { planningAbort(); return false; }
                planningTmp = null;
                planningAbort();
                return true;
            } catch (Exception e) {
                android.util.Log.e("MesHeuresPlanning", "finish", e);
                planningAbort();
                return false;
            }
        }

        @JavascriptInterface
        public boolean planningSourceExists(String name) {
            if (name == null || !PLANNING_NAME.matcher(name).matches()) return false;
            return new File(planningDir(), name).isFile();
        }

        /* Appelé seulement après confirmation explicite de l'utilisateur (onglet Prévu). */
        @JavascriptInterface
        public boolean planningSourceDelete(String name) {
            if (name == null || !PLANNING_NAME.matcher(name).matches()) return false;
            File f = new File(planningDir(), name);
            return f.isFile() && f.delete();
        }

        /* Raison du dernier choix sans fichier : annule, camera_absente, permission_refusee, erreur. */
        @JavascriptInterface
        public String planningLastPickStatus() {
            return planningPickStatus == null ? "" : planningPickStatus;
        }

        @JavascriptInterface
        public void updateWidgetData(String json) {
            if (json == null) return;
            try {
                getSharedPreferences(
                        com.mesheures.app.widget.MhWidgetProvider.PREFS,
                        MODE_PRIVATE
                ).edit()
                        .putString(com.mesheures.app.widget.MhWidgetProvider.KEY_PAYLOAD, json)
                        .apply();
                com.mesheures.app.widget.MhWidgetProvider.refreshAll(LegacyWebViewActivity.this);
            } catch (Exception e) {
                android.util.Log.e("MesHeuresWidget", "updateWidgetData", e);
            }
        }
    }

    private WebView printWebView;

    private void startPrintJob(String html) {
        try {
            WebView pw = new WebView(this);
            printWebView = pw; // référence forte : évite le GC pendant le job d'impression
            pw.getSettings().setJavaScriptEnabled(false);
            pw.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    android.print.PrintManager printManager =
                            (android.print.PrintManager) getSystemService(PRINT_SERVICE);
                    if (printManager == null) {
                        Toast.makeText(
                                LegacyWebViewActivity.this,
                                "Impression indisponible sur cet appareil",
                                Toast.LENGTH_LONG
                        ).show();
                        return;
                    }
                    String jobName = "MesHeures-Document";
                    android.print.PrintDocumentAdapter adapter =
                            view.createPrintDocumentAdapter(jobName);
                    android.print.PrintAttributes attrs =
                            new android.print.PrintAttributes.Builder()
                                    .setMediaSize(
                                            android.print.PrintAttributes.MediaSize.ISO_A4
                                                    .asLandscape()
                                    )
                                    .setColorMode(
                                            android.print.PrintAttributes.COLOR_MODE_MONOCHROME
                                    )
                                    .build();
                    printManager.print(jobName, adapter, attrs);
                }
            });
            pw.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            android.util.Log.e("MesHeuresPrint", "printHtml", e);
            Toast.makeText(
                    this,
                    "Impression impossible : " + e.getMessage(),
                    Toast.LENGTH_LONG
            ).show();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // V36 FIX — le contenu Web ne doit pas passer sous la barre système.
        web = new WebView(this);
        core = new HybridCore(this);
        core.prepare(web);

        web.addJavascriptInterface(
                new MesHeuresAndroidBridge(),
                "MesHeuresAndroid"
        );


        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = core.intercept(request);
                return response != null ? response : super.shouldInterceptRequest(view, request);
            }
        });

        /* MH JSON IMPORT FILECHOOSER V2 */
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {

                if (mhJsonFileCallback != null) {
                    mhJsonFileCallback.onReceiveValue(null);
                }
                mhJsonFileCallback = callback;
                planningPickStatus = "";

                /* V37.2 PLANNING : <input accept="image/*" capture> → appareil photo ; accept limité aux images → sélecteur
                 * de photos Android (sans permission de stockage). Tout autre champ garde le sélecteur de documents. */
                String[] acceptedTypes = params == null ? null : params.getAcceptTypes();
                boolean imagesOnly = acceptedTypes != null && acceptedTypes.length > 0;
                if (acceptedTypes != null) {
                    for (String type : acceptedTypes) {
                        String t = type == null ? "" : type.trim();
                        if (t.isEmpty() || !t.startsWith("image/")) { imagesOnly = false; break; }
                    }
                }
                if (imagesOnly && params.isCaptureEnabled()) {
                    launchPlanningCamera();
                    return true;
                }
                if (imagesOnly && Build.VERSION.SDK_INT >= 33) {
                    try {
                        Intent pick = new Intent(MediaStore.ACTION_PICK_IMAGES);
                        pick.setType("image/*");
                        startActivityForResult(pick, REQUEST_IMPORT_JSON);
                        return true;
                    } catch (Exception e) {
                        android.util.Log.w("MesHeuresPlanning", "photo picker indisponible, sélecteur de documents", e);
                    }
                }

                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);

                    // Ne retenir que de vrais types MIME (type/sous-type). Les
                    // accept="" HTML contiennent souvent des extensions (".json",
                    // ".pdf"...) qui ne sont PAS des types MIME valides : passées
                    // telles quelles à setType(), ACTION_OPEN_DOCUMENT ne trouve
                    // aucun fournisseur de documents et lève une exception.
                    String[] accepted = params == null ? null : params.getAcceptTypes();
                    java.util.ArrayList<String> validMimes = new java.util.ArrayList<>();

                    if (accepted != null) {
                        for (String type : accepted) {
                            if (type == null) continue;
                            String t = type.trim();
                            if (t.isEmpty() || "*/*".equals(t)) continue;
                            if (t.indexOf('/') > 0) validMimes.add(t);
                        }
                    }

                    // "*/*" garantit que le sélecteur système s'ouvre toujours ;
                    // les vrais types MIME trouvés servent juste de filtre
                    // indicatif pour l'UI du sélecteur, sans jamais bloquer l'appel.
                    intent.setType("*/*");
                    if (!validMimes.isEmpty()) {
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, validMimes.toArray(new String[0]));
                    }
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                    startActivityForResult(intent, REQUEST_IMPORT_JSON);
                    return true;

                } catch (Exception e) {
                    android.util.Log.e("MesHeuresImport", "open file chooser", e);
                    if (mhJsonFileCallback != null) {
                        mhJsonFileCallback.onReceiveValue(null);
                        mhJsonFileCallback = null;
                    }
                    Toast.makeText(LegacyWebViewActivity.this, "Impossible d'ouvrir le fichier JSON", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        // Android 15/16 : gestion explicite des WindowInsets.
        // Le Web/PWA reste intégralement conservé.
        FrameLayout root = new FrameLayout(this);

        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout()
            );

            view.setPadding(
                    bars.left,
                    bars.top,
                    bars.right,
                    bars.bottom
            );

            return WindowInsetsCompat.CONSUMED;
        });

        setContentView(root);
        ViewCompat.requestApplyInsets(root);

        web.loadUrl(HybridCore.ENTRY_URL);
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {
        if (requestCode == REQUEST_IMPORT_JSON) {
            if (mhJsonFileCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    Uri uri = data.getData();
                    if (uri != null) results = new Uri[]{uri};
                }
                if (results == null) planningPickStatus = "annule";
                mhJsonFileCallback.onReceiveValue(results);
                mhJsonFileCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_PLANNING_CAMERA) {
            File f = planningCaptureFile;
            boolean ok = resultCode == RESULT_OK && f != null && f.isFile() && f.length() > 0;
            if (!ok && f != null) f.delete();
            planningPickStatus = ok ? "ok" : "annule";
            deliverChooser(ok ? new Uri[]{planningCaptureUri} : null);
            planningCaptureFile = null;
            planningCaptureUri = null;
            return;
        }

        super.onActivityResult(
                requestCode,
                resultCode,
                data
        );

        if (requestCode != REQUEST_EXPORT_FILE) {
            return;
        }

        PendingExport finished = activeExport;
        activeExport = null;

        if (finished != null &&
                resultCode == RESULT_OK &&
                data != null &&
                data.getData() != null) {

            try {
                Uri uri = data.getData();

                OutputStream out =
                        getContentResolver()
                                .openOutputStream(uri);

                if (out == null) {
                    throw new java.io.IOException(
                            "OutputStream null"
                    );
                }

                out.write(finished.data);
                out.flush();
                out.close();

                Toast.makeText(
                        this,
                        "Fichier enregistré : "
                                + finished.name,
                        Toast.LENGTH_SHORT
                ).show();

            } catch (Exception e) {

                android.util.Log.e(
                        "MesHeuresExport",
                        "write file",
                        e
                );

                Toast.makeText(
                        this,
                        "Erreur d'enregistrement : "
                                + e.getMessage(),
                        Toast.LENGTH_LONG
                ).show();
            }
        }

        activeExport = null;
        launchNextExport();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
        }
        if (printWebView != null) {
            printWebView.destroy();
            printWebView = null;
        }
        super.onDestroy();
    }


}
