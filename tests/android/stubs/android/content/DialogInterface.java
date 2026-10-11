package android.content; public interface DialogInterface{ int BUTTON_POSITIVE=-1,BUTTON_NEGATIVE=-2;
 interface OnClickListener{void onClick(DialogInterface d,int w);} interface OnCancelListener{void onCancel(DialogInterface d);}
 interface OnDismissListener{void onDismiss(DialogInterface d);} interface OnShowListener{void onShow(DialogInterface d);} }
