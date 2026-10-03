package com.mesheures.app.core;

import android.content.Context;
import android.content.SharedPreferences;

/** Bounded persistence boundary; duplicate snapshots are skipped. */
public final class BackupManager {
    private static final String PREFS = "mesheures_android_backup";
    private static final String KEY = "local_storage_snapshot";
    private final SharedPreferences prefs;
    private volatile String lastSignature;
    public BackupManager(Context context) { prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    public void save(String json) {
        if (json == null) return;
        String sig = json.length() + ":" + json.hashCode();
        if (sig.equals(lastSignature)) return;
        lastSignature = sig;
        prefs.edit().putString(KEY, json).apply();
    }
    public String load() { return prefs.getString(KEY, null); }
}
