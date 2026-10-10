package com.mesheures.app;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * V37.4.1 — Couleurs des fenêtres natives restantes (alert / confirm / prompt du module Planning), reprises du thème
 * MesHeures transmis par le web (MHDialogue.envoyerTheme : variables CSS --card, --txt, --dim, --acc, --bad, --line).
 * Logique pure (aucune API Android), testée dans la JVM. Valeurs par défaut : thème sombre de l'application.
 */
public final class DialogueTheme {

    public final boolean sombre;
    public final int fond, texte, secondaire, action, danger, bord;

    private DialogueTheme(boolean sombre, int fond, int texte, int secondaire, int action, int danger, int bord) {
        this.sombre = sombre; this.fond = fond; this.texte = texte; this.secondaire = secondaire;
        this.action = action; this.danger = danger; this.bord = bord;
    }

    public static DialogueTheme parDefaut(boolean sombre) {
        return sombre
                ? new DialogueTheme(true, 0xFF111820, 0xFFEDF3F8, 0xFF91A0AE, 0xFF18A957, 0xFFF85149, 0xFF26313D)
                : new DialogueTheme(false, 0xFFFFFFFF, 0xFF1F2328, 0xFF57606A, 0xFF1A7F37, 0xFFCF222E, 0xFFD0D7DE);
    }

    /** Thème décrit par le web (JSON plat) ; toute valeur absente ou illisible reprend la valeur par défaut. */
    public static DialogueTheme depuis(String json, boolean sombreSysteme) {
        if (json == null || json.isEmpty()) return parDefaut(sombreSysteme);
        Boolean s = booleen(json, "sombre");
        boolean sombre = s != null ? s : sombreSysteme;
        DialogueTheme d = parDefaut(sombre);
        return new DialogueTheme(sombre,
                couleur(chaine(json, "fond"), d.fond), couleur(chaine(json, "texte"), d.texte),
                couleur(chaine(json, "secondaire"), d.secondaire), couleur(chaine(json, "action"), d.action),
                couleur(chaine(json, "danger"), d.danger), couleur(chaine(json, "bord"), d.bord));
    }

    private static Boolean booleen(String json, String cle) {
        Matcher m = Pattern.compile("\"" + cle + "\"\\s*:\\s*(true|false)").matcher(json);
        return m.find() ? Boolean.valueOf(m.group(1)) : null;
    }

    private static String chaine(String json, String cle) {
        Matcher m = Pattern.compile("\"" + cle + "\"\\s*:\\s*\"([^\"]*)\"").matcher(json);
        return m.find() ? m.group(1) : null;
    }

    /** #rgb, #rrggbb, rgb(r, g, b) ou rgba(r, g, b, a) → ARGB opaque ; sinon la valeur par défaut. */
    public static int couleur(String v, int defaut) {
        if (v == null) return defaut;
        String s = v.trim().toLowerCase();
        try {
            if (s.matches("#[0-9a-f]{6}")) return 0xFF000000 | Integer.parseInt(s.substring(1), 16);
            if (s.matches("#[0-9a-f]{3}")) {
                int r = Integer.parseInt(s.substring(1, 2), 16), g = Integer.parseInt(s.substring(2, 3), 16), b = Integer.parseInt(s.substring(3, 4), 16);
                return 0xFF000000 | (r * 17) << 16 | (g * 17) << 8 | (b * 17);
            }
            Matcher m = Pattern.compile("rgba?\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})").matcher(s);
            if (m.find()) {
                int r = Integer.parseInt(m.group(1)), g = Integer.parseInt(m.group(2)), b = Integer.parseInt(m.group(3));
                if (r > 255 || g > 255 || b > 255) return defaut;
                return 0xFF000000 | r << 16 | g << 8 | b;
            }
        } catch (NumberFormatException e) { return defaut; }
        return defaut;
    }

    /**
     * Confirmation destructive (bouton « OK » en rouge) : le message annonce une suppression, un rejet, un effacement ou un
     * remplacement. Ne change jamais les boutons ni le résultat : seulement leur couleur.
     */
    public static boolean destructif(String message) {
        if (message == null) return false;
        String m = message.toLowerCase();
        return m.startsWith("supprimer") || m.startsWith("rejeter") || m.startsWith("effacer")
                || m.contains("supprimer définitivement") || m.contains("remplacer") || m.contains("écraser");
    }
}
