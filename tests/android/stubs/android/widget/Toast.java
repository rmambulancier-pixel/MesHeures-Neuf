package android.widget;
public class Toast{ public static final int LENGTH_LONG=1,LENGTH_SHORT=0; public static String last; public static Toast makeText(android.content.Context c,CharSequence s,int d){last=String.valueOf(s);return new Toast();} public void show(){} }
