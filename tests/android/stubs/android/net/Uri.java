package android.net;
public class Uri implements android.os.Parcelable{ private final String s; public Uri(String s){this.s=s;} public static Uri parse(String s){return new Uri(s);} @Override public String toString(){return s;} }
