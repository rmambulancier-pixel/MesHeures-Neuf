package com.mesheures.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.os.SystemClock;

import com.mesheures.app.MainActivity;
import com.mesheures.app.R;

import org.json.JSONObject;

/** MesHeures widget: miroir passif des données de MesHeures. Aucun calcul réglementaire ici. */
public class MhWidgetProvider extends AppWidgetProvider {
    public static final String PREFS = "mh_widget";
    public static final String KEY_PAYLOAD = "payload";
    public static final String ACTION_REFRESH = "com.mesheures.app.widget.REFRESH";

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent != null && ACTION_REFRESH.equals(intent.getAction())) refreshAll(context);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) updateOne(context, manager, id);
    }

    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName name = new ComponentName(context, MhWidgetProvider.class);
        for (int id : manager.getAppWidgetIds(name)) updateOne(context, manager, id);
    }

    private static void updateOne(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_mesheures);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_PAYLOAD, null);

        String month="MesHeures", tteDay="—", tteMonth="—", week="—", period="—";
        String syncVersion="MesHeures", syncSource="MesHeures";
        String hs25="—", hs50="—", gross="—", net="—", netLabel="Net estimé";
        String status="Synchronise MesHeures", today="Aujourd'hui", rcBalance="—", nextDay="Aucune journée planifiée", nextHours="";
        int work=0,rest=0,cp=0,mal=0,alerts=0,critical=0,warn=0,day=0,days=30;
        int margin=Integer.MIN_VALUE;
        int rcMinutes=0;
        boolean timerRunning=false; long timerStartEpoch=0L;
        int dot=Color.parseColor("#68737D");

        if(raw!=null){
            try{
                JSONObject o=new JSONObject(raw);
                syncVersion=o.optString("version",syncVersion); syncSource=o.optString("source",syncSource);
                month=o.optString("monthLabel",month);
                day=o.optInt("dayIndex",0); days=Math.max(1,o.optInt("monthDays",30));
                tteDay=formatMinutes(o.optInt("tteJourMin",0));
                tteMonth=formatMinutes(o.optInt("tteMoisMin",0));
                week=formatMinutes(o.optInt("tteSemaineMin",0));
                period=formatMinutes(o.optInt("ttePeriodeMin",0));
                hs25=formatMinutes(o.optInt("hs25PeriodeMin",0));
                hs50=formatMinutes(o.optInt("hs50PeriodeMin",0));
                work=o.optInt("workCount",0); rest=o.optInt("restCount",0); cp=o.optInt("cpCount",0); mal=o.optInt("malCount",0);
                alerts=o.optInt("alertesMois",0); critical=o.optInt("alertesCritiques",0); warn=o.optInt("alertesAvertissements",0);
                if(o.has("grossCents")&&!o.isNull("grossCents"))gross=formatMoneyCents(o.optInt("grossCents",0));
                if(o.has("netCents")&&!o.isNull("netCents"))net=formatMoneyCents(o.optInt("netCents",0));
                netLabel=o.optString("netLabel","Net estimé");
                rcMinutes=o.optInt("rcSoldeMin",0);
                rcBalance=rcMinutes>0?formatMinutes(rcMinutes):"0h00";
                nextDay=o.optString("nextDayLabel","Aucune journée planifiée");
                nextHours=o.optString("nextDayHours","");
                timerRunning=o.optBoolean("timerRunning",false);
                timerStartEpoch=o.optLong("timerStartEpoch",0L);
                String type=o.optString("todayType","REPOS");
                today=typeLabel(type)+" · "+tteDay;
                if(o.has("margeAvant46hMin")&&!o.isNull("margeAvant46hMin")){
                    margin=o.optInt("margeAvant46hMin",Integer.MIN_VALUE);
                    if(margin<0){status="🔴 Seuil 46h dépassé de "+formatMinutes(-margin);dot=Color.parseColor("#C62828");}
                    else if(margin<300){status="🟠 Marge 46h : "+formatMinutes(margin);dot=Color.parseColor("#9A6700");}
                    else{status="🟢 Marge 46h : "+formatMinutes(margin);dot=Color.parseColor("#16803C");}
                }
                if(critical>0)status="🔴 "+critical+" critique"+(critical>1?"s":"")+" · "+warn+" avert."; else if(warn>0)status="🟠 "+warn+" avertissement"+(warn>1?"s":"");
                status += " · "+syncVersion;
            }catch(Exception e){ status="Données du widget invalides"; }
        }

        v.setTextViewText(R.id.widget_month, month+"  ·  J"+day+"/"+days);
        v.setTextViewText(R.id.widget_progress_text, progressBar(day, days));
        v.setTextViewText(R.id.widget_work, work+"\nTravail");
        v.setTextViewText(R.id.widget_rest, rest+"\nRepos");
        v.setTextViewText(R.id.widget_cp, cp+"\nCongé");
        v.setTextViewText(R.id.widget_mal, mal+"\nMaladie");
        v.setTextViewText(R.id.widget_tte_day, tteDay+"\nTTE jour");
        v.setTextViewText(R.id.widget_tte_month, tteMonth+"\nTTE mois");
        v.setTextViewText(R.id.widget_hs25, hs25+"\nHS25");
        v.setTextViewText(R.id.widget_hs50, hs50+"\nHS50");
        v.setTextViewText(R.id.widget_gross, gross+"\nBrut");
        v.setTextViewText(R.id.widget_net, net+"\n"+netLabel);
        v.setTextViewText(R.id.widget_today, today);
        if (timerRunning && timerStartEpoch > 0L) {
            v.setViewVisibility(R.id.widget_timer, android.view.View.VISIBLE);
            v.setChronometer(R.id.widget_timer, SystemClock.elapsedRealtime() - Math.max(0L, System.currentTimeMillis() - timerStartEpoch), null, true);
            v.setTextViewText(R.id.widget_timer_label, "EN SERVICE · "+(today));
        } else {
            v.setViewVisibility(R.id.widget_timer, android.view.View.GONE);
        }
        v.setTextViewText(R.id.widget_rc, rcBalance+"\nSolde RC");
        v.setTextViewText(R.id.widget_next_day, nextDay);
        v.setTextViewText(R.id.widget_next_hours, nextHours);
        v.setTextViewText(R.id.widget_status, status);
        v.setTextViewText(R.id.widget_period, "Semaine "+week+" · 14j "+period+" · "+syncSource);

        Intent open=new Intent(context,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi=PendingIntent.getActivity(context,widgetId,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_root,openPi);

        Intent add=new Intent(context,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        add.putExtra("mh_deeplink","jour");
        PendingIntent addPi=PendingIntent.getActivity(context,widgetId+10000,add,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_add,addPi);
        manager.updateAppWidget(widgetId,v);
    }

    private static String progressBar(int day, int days){
        int n=16; int filled=(int)Math.round((Math.max(0,Math.min(days,day))*n)/(double)Math.max(1,days));
        StringBuilder b=new StringBuilder(); for(int i=0;i<n;i++) b.append(i<filled?"━":"─"); return b.toString();
    }

    private static String typeLabel(String t){
        if("T".equals(t))return "Travail aujourd'hui";
        if("NUIT".equals(t))return "Nuit aujourd'hui";
        if("CP".equals(t))return "Congé payé";
        if("MAL".equals(t))return "Maladie";
        if("RC".equals(t))return "Repos compensateur";
        return "Repos aujourd'hui";
    }
    private static String formatMinutes(int total){
        int abs=Math.abs(total);
        return (total<0?"-":"")+(abs/60)+"h"+String.format(java.util.Locale.FRANCE,"%02d",abs%60);
    }
    private static String formatMoneyCents(int cents){
        return String.format(java.util.Locale.FRANCE,"%.0f €",cents/100.0);
    }
}
