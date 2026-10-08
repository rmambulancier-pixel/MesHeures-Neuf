package android.content; public interface SharedPreferences{ Editor edit(); interface Editor{ Editor putString(String k,String v); void apply(); } }
