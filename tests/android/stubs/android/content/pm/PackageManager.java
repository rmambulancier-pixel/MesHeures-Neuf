package android.content.pm;
public class PackageManager{ public static final String FEATURE_CAMERA_ANY="android.hardware.camera.any"; public static boolean camera=true; public static final PackageManager STUB=new PackageManager();
 public boolean hasSystemFeature(String f){return FEATURE_CAMERA_ANY.equals(f)&&camera;} }
