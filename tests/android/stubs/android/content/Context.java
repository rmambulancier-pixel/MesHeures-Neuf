package android.content;
/* Stub de test : dossiers privés réels (propriétés système), gestionnaire de paquets contrôlable. */
public abstract class Context{ public static final String PRINT_SERVICE="print"; public static final int MODE_PRIVATE=0;
 public java.io.File getFilesDir(){return new java.io.File(System.getProperty("mh.files"));}
 public java.io.File getCacheDir(){return new java.io.File(System.getProperty("mh.cache"));}
 public android.content.pm.PackageManager getPackageManager(){return android.content.pm.PackageManager.STUB;}
 public Object getSystemService(String n){return null;} public SharedPreferences getSharedPreferences(String n,int m){return null;} public ContentResolver getContentResolver(){return null;}
 /* V37.4.1 */ public android.content.res.Resources getResources(){return new android.content.res.Resources();} }
