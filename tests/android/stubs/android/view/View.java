package android.view; /* V37.4.1 : postDelayed / removeCallbacks mémorisés pour simuler le délai du bouton Retour. */
public class View{ public java.util.List<Runnable> differes=new java.util.ArrayList<>(); public int[] marges;
 public void setPadding(int a,int b,int c,int d){marges=new int[]{a,b,c,d};} public boolean postDelayed(Runnable r,long ms){differes.add(r);return true;} public boolean removeCallbacks(Runnable r){return differes.remove(r);} }
