package androidx.activity;
/* Stub de test (V37.4.1) : le dernier rappel actif reçoit le Retour ; sinon « système » (fermeture de l'écran) compté. */
public class OnBackPressedDispatcher{ public final java.util.List<OnBackPressedCallback> rappels=new java.util.ArrayList<>(); public int systeme;
 public void addCallback(OnBackPressedCallback c){rappels.add(c);}
 public void onBackPressed(){for(int i=rappels.size()-1;i>=0;i--){OnBackPressedCallback c=rappels.get(i);if(c.isEnabled()){c.handleOnBackPressed();return;}}systeme++;} }
