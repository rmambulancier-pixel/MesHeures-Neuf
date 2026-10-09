package com.mesheures.app.core;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

/** V30 secure WebView boundary. */
public final class HybridCore {
    public static final String VERSION = "37.2.0";
    public static final String DOMAIN = "appassets.androidplatform.net";
    public static final String ENTRY_URL = "https://" + DOMAIN + "/assets/web/index.html?v=37.2.0-D";
    private final WebViewAssetLoader assetLoader;
    public HybridCore(Context context) {
        /* V37.2 : originaux des plannings prévisionnels, servis en lecture seule depuis files/plannings uniquement
           (InternalStoragePathHandler refuse toute sortie de ce dossier). */
        java.io.File plannings = new java.io.File(context.getFilesDir(), "plannings");
        if (!plannings.isDirectory()) plannings.mkdirs();
        assetLoader = new WebViewAssetLoader.Builder().setDomain(DOMAIN)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context))
                .addPathHandler("/planning-source/", new WebViewAssetLoader.InternalStoragePathHandler(context, plannings)).build();
    }
    public WebResourceResponse intercept(WebResourceRequest request) {
        if (request == null || request.getUrl() == null) return null;
        return assetLoader.shouldInterceptRequest(request.getUrl());
    }
    public WebResourceResponse intercept(String url) {
        if (url == null) return null;
        return assetLoader.shouldInterceptRequest(Uri.parse(url));
    }
    private void configureServiceWorker() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) return;
        ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return intercept(request); }
        });
    }
    public void prepare(WebView webView) {
        if (webView == null) return;
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setAllowFileAccessFromFileURLs(false);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(false);
        configureServiceWorker();
    }
}
