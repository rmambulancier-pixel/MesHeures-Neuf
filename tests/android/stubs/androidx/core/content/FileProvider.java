package androidx.core.content;
public class FileProvider{ public static android.net.Uri getUriForFile(android.content.Context c,String a,java.io.File f){return android.net.Uri.parse("content://"+a+"/cache/"+f.getName());} }
