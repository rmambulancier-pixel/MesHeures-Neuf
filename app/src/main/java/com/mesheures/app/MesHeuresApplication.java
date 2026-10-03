package com.mesheures.app;

import android.app.Application;
import androidx.webkit.ProcessGlobalConfig;

/** V24 WebView process bootstrap. */
public final class MesHeuresApplication extends Application {
    @Override public void onCreate() {
        try {
            ProcessGlobalConfig config = new ProcessGlobalConfig()
                    .setUiThreadStartupModeV2(this, ProcessGlobalConfig.UI_THREAD_STARTUP_MODE_ASYNC);
            ProcessGlobalConfig.apply(config);
        } catch (Throwable ignored) { }
        super.onCreate();
    }
}
