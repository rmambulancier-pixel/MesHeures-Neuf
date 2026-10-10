package android.webkit; public class WebChromeClient{ public boolean onShowFileChooser(WebView w,ValueCallback<android.net.Uri[]> c,FileChooserParams p){return false;}
 public boolean onJsAlert(WebView v,String u,String m,JsResult r){return false;} public boolean onJsConfirm(WebView v,String u,String m,JsResult r){return false;}
 public boolean onJsPrompt(WebView v,String u,String m,String d,JsPromptResult r){return false;}
 public abstract static class FileChooserParams{ public abstract String[] getAcceptTypes(); public abstract boolean isCaptureEnabled(); } }
