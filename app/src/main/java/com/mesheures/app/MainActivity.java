package com.mesheures.app;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.ComponentActivity;
import com.mesheures.app.core.storage.NativeStore;
import com.mesheures.app.migration.NativeMigrationActivity;

/** V36.2 — entrée principale: UI V35.8.1 restaurée. */
public final class MainActivity extends ComponentActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent next;
        if (NativeStore.hasMigration(this)) {
            next = new Intent(this, LegacyWebViewActivity.class);
        } else {
            next = new Intent(this, NativeMigrationActivity.class);
        }
        if (getIntent() != null && getIntent().getExtras() != null) {
            next.putExtras(getIntent().getExtras());
        }
        startActivity(next);
        finish();
    }
}
