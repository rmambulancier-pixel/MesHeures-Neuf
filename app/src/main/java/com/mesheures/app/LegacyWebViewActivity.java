package com.mesheures.app;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
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
                mhJsonFileCallback.onReceiveValue(results);
                mhJsonFileCallback = null;
            }
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
