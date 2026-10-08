package android.webkit;
/* Stub de test : mémorise le pont JS et le WebChromeClient installés par l'activité. */
public class WebView extends android.view.View{ public static Object bridge; public static WebChromeClient chrome;
 public WebView(android.content.Context c){} public WebSettings getSettings(){return new WebSettings();} public void addJavascriptInterface(Object o,String n){bridge=o;}
 public void setWebViewClient(WebViewClient c){} public void setWebChromeClient(WebChromeClient c){chrome=c;} public void loadUrl(String u){} public void destroy(){}
 public void loadDataWithBaseURL(String a,String b,String c,String d,String e){} public android.print.PrintDocumentAdapter createPrintDocumentAdapter(String n){return null;} }
