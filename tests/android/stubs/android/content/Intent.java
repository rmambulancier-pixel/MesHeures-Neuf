package android.content;
public class Intent{ public static final String ACTION_OPEN_DOCUMENT="android.intent.action.OPEN_DOCUMENT",ACTION_CREATE_DOCUMENT="android.intent.action.CREATE_DOCUMENT",CATEGORY_OPENABLE="android.intent.category.OPENABLE",EXTRA_MIME_TYPES="android.intent.extra.MIME_TYPES",EXTRA_ALLOW_MULTIPLE="android.intent.extra.ALLOW_MULTIPLE",EXTRA_TITLE="android.intent.extra.TITLE";
 public static final int FLAG_GRANT_WRITE_URI_PERMISSION=2,FLAG_GRANT_READ_URI_PERMISSION=1;
 public final String action; public String type; public int flags; public final java.util.Map<String,Object> extras=new java.util.HashMap<>(); public android.net.Uri data;
 public Intent(String a){action=a;} public Intent(Context c,Class<?> k){action="class:"+k.getName();}
 public Intent addCategory(String c){return this;} public Intent setType(String t){type=t;return this;}
 public Intent putExtra(String k,String[] v){extras.put(k,v);return this;} public Intent putExtra(String k,boolean v){extras.put(k,v);return this;}
 public Intent putExtra(String k,String v){extras.put(k,v);return this;} public Intent putExtra(String k,android.os.Parcelable v){extras.put(k,v);return this;}
 public Intent addFlags(int f){flags|=f;return this;} public android.net.Uri getData(){return data;} }
