package android.app;
/* Stub de test (V37.4.1) : mémorise la dernière fenêtre créée (titre, message, boutons, thème) et permet de simuler
   « OK », « Annuler », Retour et l'affichage (OnShowListener). */
public class AlertDialog implements android.content.DialogInterface{
 public static AlertDialog dernier;
 public CharSequence titre,message,libOk,libNon; public int theme; public android.view.View vue; public boolean affichee,annulableHors=true;
 public android.content.DialogInterface.OnClickListener ok,non; public android.content.DialogInterface.OnCancelListener annul; public android.content.DialogInterface.OnDismissListener ferm; public android.content.DialogInterface.OnShowListener montre;
 public final android.widget.Button boutonOk=new android.widget.Button(null),boutonNon=new android.widget.Button(null); public final android.widget.TextView vueMessage=new android.widget.TextView(null); public final android.view.Window fenetre=new android.view.Window();
 public void setCanceledOnTouchOutside(boolean b){annulableHors=b;} public void setOnShowListener(android.content.DialogInterface.OnShowListener l){montre=l;}
 public android.view.Window getWindow(){return fenetre;} public android.widget.Button getButton(int w){return w==BUTTON_POSITIVE?boutonOk:w==BUTTON_NEGATIVE&&libNon!=null?boutonNon:null;}
 @SuppressWarnings("unchecked") public <T extends android.view.View> T findViewById(int id){return id==android.R.id.message?(T)vueMessage:null;}
 public void show(){affichee=true;if(montre!=null)montre.onShow(this);}
 public void cancel(){if(annul!=null)annul.onCancel(this);dismiss();} public void dismiss(){affichee=false;if(ferm!=null)ferm.onDismiss(this);}
 public void appuyerOk(){if(ok!=null)ok.onClick(this,BUTTON_POSITIVE);dismiss();} public void appuyerAnnuler(){if(non!=null)non.onClick(this,BUTTON_NEGATIVE);dismiss();}
 public static class Builder{ final AlertDialog d=new AlertDialog(); public Builder(android.content.Context c,int theme){d.theme=theme;}
  public Builder setTitle(CharSequence t){d.titre=t;return this;} public Builder setMessage(CharSequence m){d.message=m;return this;} public Builder setView(android.view.View v){d.vue=v;return this;}
  public Builder setPositiveButton(CharSequence t,android.content.DialogInterface.OnClickListener l){d.libOk=t;d.ok=l;return this;}
  public Builder setNegativeButton(CharSequence t,android.content.DialogInterface.OnClickListener l){d.libNon=t;d.non=l;return this;}
  public Builder setOnCancelListener(android.content.DialogInterface.OnCancelListener l){d.annul=l;return this;}
  public Builder setOnDismissListener(android.content.DialogInterface.OnDismissListener l){d.ferm=l;return this;}
  public AlertDialog create(){dernier=d;return d;} } }
