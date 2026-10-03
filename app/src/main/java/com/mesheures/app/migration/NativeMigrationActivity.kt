package com.mesheures.app.migration

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import com.mesheures.app.core.HybridCore
import com.mesheures.app.core.storage.NativeStore
import com.mesheures.app.LegacyWebViewActivity

class NativeMigrationActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var core: HybridCore

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (NativeStore.hasMigration(this)) {
            openDashboard()
            return
        }

        web = WebView(this)
        core = HybridCore(this)

        core.prepare(web)

        web.settings.javaScriptEnabled = true
        web.addJavascriptInterface(Bridge(), "NativeMigration")

        web.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView?,
                request: android.webkit.WebResourceRequest?
            ): android.webkit.WebResourceResponse? {
                if (request == null) return null
                val response = core.intercept(request)
                return response ?: super.shouldInterceptRequest(view, request)
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                web.evaluateJavascript(
                    """
                    (function(){
                      try {
                        var raw=localStorage.getItem('mesheures_v3');
                        if(raw){
                          NativeMigration.receive(raw);
                        } else {
                          NativeMigration.error('localStorage mesheures_v3 absent');
                        }
                      } catch(e) {
                        NativeMigration.error(String(e));
                      }
                    })();
                    """.trimIndent(),
                    null
                )
            }
        }

        setContentView(web)
        web.loadUrl(HybridCore.ENTRY_URL)
    }

    private inner class Bridge {

        @JavascriptInterface
        fun receive(raw: String) {
            runOnUiThread {
                try {
                    NativeStore.saveLegacyDb(this@NativeMigrationActivity, raw)

                    val db = NativeStore.rawDb(this@NativeMigrationActivity)
                    val days = db.optJSONObject("days")?.length() ?: 0

                    Toast.makeText(
                        this@NativeMigrationActivity,
                        "Migration native OK · $days journées",
                        Toast.LENGTH_LONG
                    ).show()

                    openDashboard()
                } catch (e: Exception) {
                    Toast.makeText(
                        this@NativeMigrationActivity,
                        "Migration impossible : ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        @JavascriptInterface
        fun error(message: String) {
            runOnUiThread {
                Toast.makeText(
                    this@NativeMigrationActivity,
                    "Migration : $message",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun openDashboard() {
        startActivity(
            android.content.Intent(
                this,
                LegacyWebViewActivity::class.java
            )
        )
        finish()
    }
}
