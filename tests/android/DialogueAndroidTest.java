import android.app.AlertDialog;
import android.content.res.Resources;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import com.mesheures.app.DialogueRetour;
import com.mesheures.app.DialogueTheme;
import com.mesheures.app.LegacyWebViewActivity;

import java.lang.reflect.Method;

/*
 * V37.4.1 — bouton Retour pendant une fenêtre MHDialogue (garde-fous) et fenêtres natives restantes (Planning) aux
 * couleurs de MesHeures. Exécution JVM du vrai code (DialogueRetour, DialogueTheme, LegacyWebViewActivity) contre des
 * stubs d'API Android. Vérifie la logique de MesHeures ; le comportement réel reste à valider sur le Pixel.
 */
public final class DialogueAndroidTest {
    static int fails = 0, oks = 0;
    static void t(String name, boolean cond) { if (cond) { oks++; System.out.println("  ok  " + name); } else { fails++; System.out.println("FAIL  " + name); } }
    static Object bridge; static LegacyWebViewActivity act; static WebView web; static WebChromeClient chrome;
    static Object call(String m, Object... a) throws Exception {
        for (Method x : bridge.getClass().getDeclaredMethods()) if (x.getName().equals(m) && x.getParameterCount() == a.length) { x.setAccessible(true); return x.invoke(bridge, a); }
        throw new NoSuchMethodException(m);
    }
    static OnBackPressedCallback rappel() { return act.getOnBackPressedDispatcher().rappels.get(0); }
    static int systeme() { return act.getOnBackPressedDispatcher().systeme; }
    static void retour() { act.getOnBackPressedDispatcher().onBackPressed(); }
    static void repondre(String v) { web.retours.get(web.retours.size() - 1).onReceiveValue(v); }

    public static void main(String[] args) throws Exception {
        System.out.println("DialogueRetour (logique pure)");
        DialogueRetour d = new DialogueRetour();
        t("aucune fenêtre : Retour rendu au système", d.surRetour() == DialogueRetour.Decision.SYSTEME);
        d.etat(true);
        t("fenêtre ouverte : le web est interrogé", d.surRetour() == DialogueRetour.Decision.DEMANDER_WEB && d.enAttente());
        t("réponse « true » : Retour consommé (fenêtre fermée par le web)", !d.reponseWeb("true") && !d.enAttente());
        d.etat(true); d.surRetour();
        t("réponse « false » : garde-fou, Retour rendu au système, état remis à zéro", d.reponseWeb("false") && !d.ouvert());
        d.etat(true); d.surRetour();
        t("réponse nulle (erreur JS) : Retour rendu au système", d.reponseWeb(null) && !d.ouvert());
        d.etat(true); d.surRetour();
        t("deuxième appui pendant l'attente : Retour rendu au système", d.surRetour() == DialogueRetour.Decision.SYSTEME && !d.ouvert());
        d.etat(true); d.surRetour();
        t("délai dépassé : Retour rendu au système", d.delaiDepasse() && !d.ouvert());
        t("réponse tardive après le délai : ignorée", !d.reponseWeb("true"));
        d.etat(true); d.pageChargee();
        t("nouvelle page : plus aucune fenêtre ouverte", !d.ouvert() && d.surRetour() == DialogueRetour.Decision.SYSTEME);

        System.out.println("DialogueTheme (logique pure)");
        t("#18a957 → ARGB opaque", DialogueTheme.couleur("#18a957", 0) == 0xFF18A957);
        t("#fff → blanc", DialogueTheme.couleur(" #FFF ", 0) == 0xFFFFFFFF);
        t("rgb(17, 24, 32) → #111820", DialogueTheme.couleur("rgb(17, 24, 32)", 0) == 0xFF111820);
        t("valeur illisible → défaut", DialogueTheme.couleur("var(--x)", 7) == 7 && DialogueTheme.couleur("rgb(300,0,0)", 7) == 7);
        DialogueTheme clair = DialogueTheme.depuis("{\"sombre\":false,\"fond\":\"#ffffff\",\"texte\":\"#1f2328\",\"action\":\"#1a7f37\",\"danger\":\"#cf222e\"}", true);
        t("thème clair transmis par le web (prioritaire sur le système)", !clair.sombre && clair.fond == 0xFFFFFFFF && clair.action == 0xFF1A7F37 && clair.bord == DialogueTheme.parDefaut(false).bord);
        t("aucun thème transmis : thème du système, couleurs MesHeures", DialogueTheme.depuis(null, true).sombre && DialogueTheme.depuis(null, true).fond == 0xFF111820);
        t("confirmations destructives du Planning reconnues (bouton rouge)",
                DialogueTheme.destructif("Supprimer cette fiche (planning du 05/10/2026 au 04/11/2026) ?")
                && DialogueTheme.destructif("Rejeter cette analyse ?\nL’analyse est supprimée")
                && DialogueTheme.destructif("Plus aucune fiche ne dépend de « p.jpg ».\nSupprimer aussi ce fichier importé et son original enregistré sur le téléphone ?\n\nOK : supprimer définitivement.\nAnnuler : conserver le fichier.")
                && DialogueTheme.destructif("Supprimer aussi le fichier original enregistré sur le téléphone ?"));
        t("validation d'un planning : non destructive (bouton vert)", !DialogueTheme.destructif("Valider ce planning ?\n\nPlanning 1 (page 2) : 31 jours"));

        System.out.println("LegacyWebViewActivity : bouton Retour");
        java.nio.file.Path tmp = java.nio.file.Files.createTempDirectory("mh-dlg");
        System.setProperty("mh.files", tmp.resolve("files").toString()); System.setProperty("mh.cache", tmp.resolve("cache").toString());
        java.nio.file.Files.createDirectories(tmp.resolve("files")); java.nio.file.Files.createDirectories(tmp.resolve("cache"));
        act = new LegacyWebViewActivity();
        Method oc = LegacyWebViewActivity.class.getDeclaredMethod("onCreate", android.os.Bundle.class); oc.setAccessible(true); oc.invoke(act, (Object) null);
        bridge = WebView.bridge; web = WebView.derniere; chrome = WebView.chrome;
        t("rappel Retour enregistré, inactif au démarrage", act.getOnBackPressedDispatcher().rappels.size() == 1 && !rappel().isEnabled());
        retour();
        t("sans fenêtre : Retour habituel (système)", systeme() == 1 && web.scripts.isEmpty());
        call("dialogueEtat", true);
        t("fenêtre ouverte (pont dialogueEtat) : rappel actif", rappel().isEnabled());
        retour();
        t("Retour : MHDialogue.retour() demandé au web, délai de garde programmé", web.scripts.size() == 1 && web.scripts.get(0).contains("MHDialogue.retour()") && web.differes.size() == 1 && systeme() == 1);
        repondre("true");
        t("le web ferme la fenêtre : Retour consommé, délai annulé, application non fermée", systeme() == 1 && web.differes.isEmpty());
        call("dialogueEtat", false);
        t("fenêtre fermée (pont) : rappel désactivé", !rappel().isEnabled());
        call("dialogueEtat", true); retour(); repondre("false");
        t("garde-fou : le web ne ferme rien → Retour rendu au système, rappel désactivé", systeme() == 2 && !rappel().isEnabled());
        call("dialogueEtat", true); retour(); Runnable delai = web.differes.get(0); delai.run();
        t("garde-fou : aucune réponse dans le délai → Retour rendu au système", systeme() == 3 && !rappel().isEnabled());
        repondre("true");
        t("réponse tardive ignorée (aucun double Retour)", systeme() == 3);
        call("dialogueEtat", true); retour(); retour();
        t("garde-fou : deuxième appui pendant l'attente → Retour rendu au système", systeme() == 4);
        call("dialogueEtat", true);
        WebView.client.onPageStarted(web, "https://x/index.html", null);
        t("rechargement de la page : rappel désactivé", !rappel().isEnabled());

        System.out.println("LegacyWebViewActivity : fenêtres natives (Planning)");
        JsResult r = new JsResult();
        t("confirm pris en charge par MesHeures", chrome.onJsConfirm(web, "u", "Supprimer cette fiche (planning du 05/10/2026 au 04/11/2026) ?", r));
        AlertDialog a = AlertDialog.dernier;
        t("titre « MesHeures », message intact, boutons « OK » / « Annuler » (les messages du Planning y font référence)",
                "MesHeures".contentEquals(a.titre) && a.message.toString().startsWith("Supprimer cette fiche") && "OK".contentEquals(a.libOk) && "Annuler".contentEquals(a.libNon) && a.affichee);
        DialogueTheme sombre = DialogueTheme.parDefaut(true);
        t("thème sombre MesHeures : fond arrondi, message, OK rouge (destructif), Annuler secondaire",
                a.theme == android.R.style.Theme_DeviceDefault_Dialog_Alert && a.fenetre.fond instanceof android.graphics.drawable.GradientDrawable
                && ((android.graphics.drawable.GradientDrawable) a.fenetre.fond).couleur == sombre.fond && ((android.graphics.drawable.GradientDrawable) a.fenetre.fond).rayon > 0
                && a.vueMessage.couleur == sombre.texte && a.boutonOk.couleur == sombre.danger && a.boutonNon.couleur == sombre.secondaire);
        a.appuyerAnnuler();
        t("Annuler : résultat « annulé » rendu une seule fois", r.annulations == 1 && r.confirmations == 0);
        r = new JsResult(); chrome.onJsConfirm(web, "u", "Supprimer ce planning ?", r); AlertDialog.dernier.appuyerOk();
        t("OK : résultat « confirmé » rendu une seule fois", r.confirmations == 1 && r.annulations == 0);
        r = new JsResult(); chrome.onJsConfirm(web, "u", "Supprimer ce planning ?", r); AlertDialog.dernier.cancel();
        t("Retour ou appui hors de la fenêtre sur une confirmation : « annulé », une seule fois", r.annulations == 1 && r.confirmations == 0);
        r = new JsResult(); chrome.onJsConfirm(web, "u", "Valider ce planning ?", r);
        t("confirmation non destructive : OK vert (couleur d'action)", AlertDialog.dernier.boutonOk.couleur == sombre.action);
        AlertDialog.dernier.appuyerOk();
        r = new JsResult(); chrome.onJsAlert(web, "u", "Information", r); a = AlertDialog.dernier;
        t("alert : un seul bouton « OK »", a.libNon == null && "OK".contentEquals(a.libOk));
        a.cancel();
        t("alert fermée par Retour : considérée comme lue (une seule fois)", r.confirmations == 1 && r.annulations == 0);
        JsPromptResult p = new JsPromptResult();
        t("prompt pris en charge", chrome.onJsPrompt(web, "u", "Raison du rejet (facultatif) :", "", p));
        a = AlertDialog.dernier; EditText champ = (EditText) ((FrameLayout) a.vue).enfants.get(0);
        t("prompt : champ texte d'une ligne, valeur par défaut, appui hors de la fenêtre sans effet", champ.uneLigne && "".contentEquals(champ.getText()) && !a.annulableHors);
        champ.setText("doublon"); a.appuyerOk();
        t("prompt OK : texte saisi rendu", "doublon".equals(p.valeur) && p.confirmations == 1);
        p = new JsPromptResult(); chrome.onJsPrompt(web, "u", "Date :", "05/10/2026", p); a = AlertDialog.dernier;
        t("prompt : valeur proposée pré-remplie", "05/10/2026".contentEquals(((EditText) ((FrameLayout) a.vue).enfants.get(0)).getText()));
        a.cancel();
        t("prompt annulé : null rendu (Annuler), une seule fois", p.valeur == null && p.annulations == 1 && p.confirmations == 0);
        call("dialogueTheme", "{\"sombre\":false,\"fond\":\"#ffffff\",\"texte\":\"#1f2328\",\"secondaire\":\"#57606a\",\"action\":\"#1a7f37\",\"danger\":\"#cf222e\",\"bord\":\"#d0d7de\"}");
        r = new JsResult(); chrome.onJsConfirm(web, "u", "Valider ce planning ?", r); a = AlertDialog.dernier;
        t("thème clair transmis par le web : fenêtre claire aux couleurs MesHeures",
                a.theme == android.R.style.Theme_DeviceDefault_Light_Dialog_Alert && ((android.graphics.drawable.GradientDrawable) a.fenetre.fond).couleur == 0xFFFFFFFF && a.boutonOk.couleur == 0xFF1A7F37);
        a.appuyerOk();
        act.finissant = true; r = new JsResult();
        t("activité en fermeture : fenêtre laissée au WebView (aucun blocage)", !chrome.onJsConfirm(web, "u", "x", r));

        System.out.println(fails == 0 ? "\nTous les tests Android V37.4.1 (dialogues) passent : " + oks + "." : "\n" + fails + " échec(s)");
        System.exit(fails == 0 ? 0 : 1);
    }
}
