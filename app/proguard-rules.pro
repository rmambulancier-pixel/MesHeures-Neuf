# MesHeures native bridge / widget entry points.
-keepclassmembers class com.mesheures.app.MainActivity$AndroidBridge { <methods>; }
-keep class com.mesheures.app.widget.MhWidgetProvider { *; }
-keep class com.mesheures.app.nativeui.NativeDashboardActivity { *; }
