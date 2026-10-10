package androidx.activity;
/* Stub de test : mémorise la dernière activité lancée ; peut simuler une absence d'application ou un refus. */
public class ComponentActivity extends android.content.Context{ public static final int RESULT_OK=-1,RESULT_CANCELED=0;
 public static android.content.Intent lastIntent; public static int lastRequest=-1; public static RuntimeException failNext;
 protected void onCreate(android.os.Bundle b){} protected void onDestroy(){} protected void onActivityResult(int a,int b,android.content.Intent d){}
 public void startActivityForResult(android.content.Intent i,int r){ if(failNext!=null){RuntimeException e=failNext;failNext=null;throw e;} lastIntent=i;lastRequest=r; }
 public void startActivity(android.content.Intent i){} public void setContentView(android.view.View v){} public void runOnUiThread(Runnable r){r.run();}
 /* V37.4.1 */ public final OnBackPressedDispatcher dispatcher=new OnBackPressedDispatcher(); public OnBackPressedDispatcher getOnBackPressedDispatcher(){return dispatcher;} public boolean finissant; public boolean isFinishing(){return finissant;} }
