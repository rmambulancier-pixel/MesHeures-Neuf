import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import com.mesheures.app.LegacyWebViewActivity;

import java.io.File;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Base64;

/*
 * V37.2.0-B — exécution JVM du vrai code Android de LegacyWebViewActivity (pont planningSource*, sélecteur
 * photo / galerie / fichier), contre des stubs d'API Android (tests/android/stubs). Vérifie la logique de
 * MesHeures, pas le comportement réel du téléphone : la validation finale reste celle du Pixel.
 */
public final class PlanningAndroidTest {
    static int fails = 0, oks = 0;
    static void t(String name, boolean cond) { if (cond) { oks++; System.out.println("  ok  " + name); } else { fails++; System.out.println("FAIL  " + name); } }
    static String sha(byte[] b) throws Exception { StringBuilder s = new StringBuilder(); for (byte x : MessageDigest.getInstance("SHA-256").digest(b)) s.append(String.format("%02x", x & 0xff)); return s.toString(); }
    static Object bridge; static LegacyWebViewActivity act;
    static Object call(String m, Object... a) throws Exception {
        for (Method x : bridge.getClass().getDeclaredMethods()) if (x.getName().equals(m) && x.getParameterCount() == a.length) { x.setAccessible(true); return x.invoke(bridge, a); }
        throw new NoSuchMethodException(m);
    }
    static void result(int req, int code, Intent data) throws Exception {
        Method m = LegacyWebViewActivity.class.getDeclaredMethod("onActivityResult", int.class, int.class, Intent.class); m.setAccessible(true); m.invoke(act, req, code, data);
    }
    static Uri[][] got = new Uri[1][]; static boolean[] called = new boolean[1];
    static ValueCallback<Uri[]> cb() { called[0] = false; got[0] = null; return v -> { called[0] = true; got[0] = v; }; }
    static WebChromeClient.FileChooserParams params(boolean capture, String... accept) {
        return new WebChromeClient.FileChooserParams() { public String[] getAcceptTypes() { return accept; } public boolean isCaptureEnabled() { return capture; } };
    }

    public static void main(String[] args) throws Exception {
        File root = Files.createTempDirectory("mh-android").toFile();
        File files = new File(root, "files"), cache = new File(root, "cache"); files.mkdirs(); cache.mkdirs();
        System.setProperty("mh.files", files.getPath()); System.setProperty("mh.cache", cache.getPath());
        act = new LegacyWebViewActivity();
        Method oc = LegacyWebViewActivity.class.getDeclaredMethod("onCreate", android.os.Bundle.class); oc.setAccessible(true); oc.invoke(act, (Object) null);
        bridge = WebView.bridge;
        WebChromeClient chrome = WebView.chrome;
        File dir = new File(files, "plannings");

        System.out.println("Pont planningSource* (stockage privé files/plannings)");
        byte[] jpg = new byte[70000]; for (int i = 0; i < jpg.length; i++) jpg[i] = (byte) (i * 31); jpg[0] = (byte) 0xFF; jpg[1] = (byte) 0xD8; jpg[2] = (byte) 0xFF;
        String h = sha(jpg), name = h + ".jpg";
        t("dossier files/plannings créé (HybridCore / bridge)", dir.isDirectory());
        t("begin : nom <sha256>.jpg accepté", (Boolean) call("planningSourceBegin", name, h));
        String b64 = Base64.getEncoder().encodeToString(jpg);
        for (int i = 0; i < b64.length(); i += 32768) call("planningSourceAppend", b64.substring(i, Math.min(b64.length(), i + 32768)));
        t("finish : empreinte vérifiée, fichier rangé sous son nom", (Boolean) call("planningSourceFinish") && new File(dir, name).isFile());
        t("contenu identique octet pour octet à l'original", java.util.Arrays.equals(Files.readAllBytes(new File(dir, name).toPath()), jpg));
        t("aucun fichier temporaire restant", dir.listFiles((d, n) -> n.endsWith(".part")).length == 0);
        t("exists : true pour le fichier rangé", (Boolean) call("planningSourceExists", name));
        t("même fichier réimporté : accepté sans duplication", (Boolean) call("planningSourceBegin", name, h) && (Boolean) call("planningSourceAppend", b64) && (Boolean) call("planningSourceFinish") && dir.listFiles().length == 1);
        String other = sha(new byte[]{1, 2, 3});
        t("empreinte fausse : refus, aucun fichier écrit", (Boolean) call("planningSourceBegin", other + ".png", other) && (Boolean) call("planningSourceAppend", b64) && !(Boolean) call("planningSourceFinish") && !new File(dir, other + ".png").exists());
        for (String bad : new String[]{"../evil.jpg", "/data/x.jpg", h + ".exe", h + ".jpg/../x", "ABC.jpg", h.toUpperCase() + ".jpg", "", h + ".JPG"})
            t("nom refusé : « " + bad + " »", !(Boolean) call("planningSourceBegin", bad, h) && !(Boolean) call("planningSourceExists", bad) && !(Boolean) call("planningSourceDelete", bad));
        t("empreinte attendue mal formée : refus", !(Boolean) call("planningSourceBegin", name, "xyz"));
        t("append sans begin : refus", !(Boolean) call("planningSourceAppend", b64));
        byte[] big = new byte[1024 * 1024]; String bigB64 = Base64.getEncoder().encodeToString(big); boolean cut = false;
        call("planningSourceBegin", other + ".pdf", other);
        for (int i = 0; i < 21; i++) if (!(Boolean) call("planningSourceAppend", bigB64)) { cut = true; break; }
        t("au-delà de 20 Mo : écriture interrompue, rien de conservé", cut && !(Boolean) call("planningSourceFinish") && !new File(dir, other + ".pdf").exists() && dir.listFiles((d, n) -> n.endsWith(".part")).length == 0);
        t("delete : supprime le fichier visé seulement", (Boolean) call("planningSourceDelete", name) && !new File(dir, name).exists() && !(Boolean) call("planningSourceExists", name));
        t("delete d'un fichier inexistant : false", !(Boolean) call("planningSourceDelete", name));

        System.out.println("Sélecteur : appareil photo, galerie, fichier");
        PackageManager.camera = true;
        boolean r = chrome.onShowFileChooser(null, cb(), params(true, "image/*"));
        t("photo : ACTION_IMAGE_CAPTURE vers le cache privé (FileProvider), sans permission CAMERA", r && ComponentActivity.lastRequest == 7403 && MediaStore.ACTION_IMAGE_CAPTURE.equals(ComponentActivity.lastIntent.action)
            && String.valueOf(ComponentActivity.lastIntent.extras.get(MediaStore.EXTRA_OUTPUT)).startsWith("content://com.mesheures.app.fileprovider/") && (ComponentActivity.lastIntent.flags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0);
        File cap = new File(cache, "planning-capture"); File[] shot = cap.listFiles();
        Files.write(new File(cap, String.valueOf(ComponentActivity.lastIntent.extras.get(MediaStore.EXTRA_OUTPUT)).replaceAll(".*/", "")).toPath(), jpg);
        result(7403, ComponentActivity.RESULT_OK, null);
        t("photo prise : l'URI de la photo est remise au champ de fichier", called[0] && got[0] != null && got[0].length == 1 && got[0][0].toString().contains("photo-") && "ok".equals(call("planningLastPickStatus")));
        chrome.onShowFileChooser(null, cb(), params(true, "image/*"));
        result(7403, ComponentActivity.RESULT_CANCELED, null);
        t("photo annulée : aucun fichier remis, statut « annule », photo vide supprimée", called[0] && got[0] == null && "annule".equals(call("planningLastPickStatus")));
        chrome.onShowFileChooser(null, cb(), params(true, "image/*"));
        result(7403, ComponentActivity.RESULT_OK, null);
        t("appareil photo qui ne renvoie rien malgré OK : traité comme annulé", called[0] && got[0] == null && "annule".equals(call("planningLastPickStatus")));
        PackageManager.camera = false;
        r = chrome.onShowFileChooser(null, cb(), params(true, "image/*"));
        t("pas d'appareil photo : message, choix annulé proprement, statut « camera_absente »", r && called[0] && got[0] == null && "camera_absente".equals(call("planningLastPickStatus")) && Toast.last.contains("appareil photo"));
        PackageManager.camera = true;
        ComponentActivity.failNext = new android.content.ActivityNotFoundException();
        chrome.onShowFileChooser(null, cb(), params(true, "image/*"));
        t("aucune application appareil photo : statut « camera_absente »", called[0] && got[0] == null && "camera_absente".equals(call("planningLastPickStatus")));
        ComponentActivity.failNext = new SecurityException("refus");
        chrome.onShowFileChooser(null, cb(), params(true, "image/*"));
        t("accès refusé (SecurityException) : statut « permission_refusee », rien de cassé", called[0] && got[0] == null && "permission_refusee".equals(call("planningLastPickStatus")) && Toast.last.contains("refusé"));
        ComponentActivity.failNext = new IllegalStateException("x");
        chrome.onShowFileChooser(null, cb(), params(true, "image/*"));
        t("erreur d'accès inattendue : statut « erreur », choix annulé", called[0] && got[0] == null && "erreur".equals(call("planningLastPickStatus")));

        r = chrome.onShowFileChooser(null, cb(), params(false, "image/jpeg", "image/png", "image/webp"));
        t("galerie (images seulement) : sélecteur de photos Android (PICK_IMAGES), sans permission de stockage", r && ComponentActivity.lastRequest == 7402 && MediaStore.ACTION_PICK_IMAGES.equals(ComponentActivity.lastIntent.action));
        Intent picked = new Intent("x"); picked.data = Uri.parse("content://media/picker/1");
        result(7402, ComponentActivity.RESULT_OK, picked);
        t("galerie : image choisie remise au champ", called[0] && got[0] != null && "content://media/picker/1".equals(got[0][0].toString()));
        chrome.onShowFileChooser(null, cb(), params(false, "image/jpeg"));
        result(7402, ComponentActivity.RESULT_CANCELED, null);
        t("galerie annulée : aucun fichier, statut « annule »", called[0] && got[0] == null && "annule".equals(call("planningLastPickStatus")));
        r = chrome.onShowFileChooser(null, cb(), params(false, "image/jpeg", "image/png", "image/webp", "application/pdf"));
        t("fichier (images + PDF) : sélecteur de documents, types MIME transmis", r && Intent.ACTION_OPEN_DOCUMENT.equals(ComponentActivity.lastIntent.action) && "*/*".equals(ComponentActivity.lastIntent.type)
            && ((String[]) ComponentActivity.lastIntent.extras.get(Intent.EXTRA_MIME_TYPES)).length == 4);
        r = chrome.onShowFileChooser(null, cb(), params(false, ".json", "application/json"));
        t("import JSON existant inchangé : sélecteur de documents, « .json » écarté des types MIME", r && Intent.ACTION_OPEN_DOCUMENT.equals(ComponentActivity.lastIntent.action) && ((String[]) ComponentActivity.lastIntent.extras.get(Intent.EXTRA_MIME_TYPES)).length == 1);
        r = chrome.onShowFileChooser(null, cb(), params(false, ".pdf", "application/pdf", "image/*"));
        t("import ROMI1 existant (PDF + images) inchangé : sélecteur de documents", r && Intent.ACTION_OPEN_DOCUMENT.equals(ComponentActivity.lastIntent.action));
        r = chrome.onShowFileChooser(null, cb(), params(true, "image/*", "application/pdf"));
        t("capture demandée avec PDF : pas d'appareil photo, sélecteur de documents", r && Intent.ACTION_OPEN_DOCUMENT.equals(ComponentActivity.lastIntent.action));

        System.out.println(fails == 0 ? "\nTous les tests Android (JVM, stubs) passent : " + oks + "." : "\n" + fails + " échec(s).");
        System.exit(fails == 0 ? 0 : 1);
    }
}
