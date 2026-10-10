package android.widget; public class EditText extends TextView{ public boolean uneLigne,toutSelectionner; public int typeSaisie; public EditText(android.content.Context c){super(c);}
 public void setSingleLine(boolean b){uneLigne=b;} public void setInputType(int t){typeSaisie=t;} public void setSelectAllOnFocus(boolean b){toutSelectionner=b;} }
