package android.graphics.drawable; public class GradientDrawable extends Drawable{ public int couleur,bordure,epaisseur; public float rayon;
 public void setColor(int c){couleur=c;} public void setCornerRadius(float r){rayon=r;} public void setStroke(int w,int c){epaisseur=w;bordure=c;} }
