package android.webkit;
/* Stub de test : mémorise le pont JS, le WebChromeClient, le WebViewClient et les scripts évalués (V37.4.1). */
public class WebView extends android.view.View{ public static Object bridge; public static WebChromeClient chrome; public static WebViewClient client; public static WebView derniere;
 public java.util.List<String> scripts=new java.util.ArrayList<>(); public java.util.List<ValueCallback<String>> retours=new java.util.ArrayList<>();
 public WebView(android.content.Context c){derniere=this;} public WebSettings getSettings(){return new WebSettings();} public void addJavascriptInterface(Object o,String n){bridge=o;}
 public void setWebViewClient(WebViewClient c){client=c;} public void setWebChromeClient(WebChromeClient c){chrome=c;} public void loadUrl(String u){} public void destroy(){}
 public void evaluateJavascript(String s,ValueCallback<String> r){scripts.add(s);retours.add(r);}
 public void loadDataWithBaseURL(String a,String b,String c,String d,String e){} public android.print.PrintDocumentAdapter createPrintDocumentAdapter(String n){return null;} }
