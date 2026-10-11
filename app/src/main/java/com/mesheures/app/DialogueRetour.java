package com.mesheures.app;

/**
 * V37.4.1 — Bouton Retour Android pendant une fenêtre de dialogue intégrée (MHDialogue, app-v3741-dialogue.js).
 *
 * Logique pure (aucune API Android), testée dans la JVM. L'activité ne l'interroge que lorsqu'une fenêtre est déclarée
 * ouverte par le web ; sinon le bouton Retour garde son comportement habituel.
 *
 * Garde-fous : le Retour n'est JAMAIS bloqué.
 *  - le web ne répond pas « true » (fenêtre déjà fermée, erreur, module absent) : Retour rendu au système ;
 *  - aucune réponse dans le délai : Retour rendu au système ;
 *  - deuxième appui pendant l'attente d'une réponse : Retour rendu au système ;
 *  - rechargement de la page : état remis à zéro.
 */
public final class DialogueRetour {

    /** Délai d'attente de la réponse du web, en millisecondes. */
    public static final long DELAI_MS = 1500L;

    public enum Decision { SYSTEME, DEMANDER_WEB }

    private boolean ouvert;
    private boolean enAttente;

    /** Le web signale l'ouverture ou la fermeture d'une fenêtre. */
    public synchronized void etat(boolean estOuvert) {
        ouvert = estOuvert;
        if (!estOuvert) enAttente = false;
    }

    public synchronized boolean ouvert() { return ouvert; }

    public synchronized boolean enAttente() { return enAttente; }

    /** Appui sur Retour. */
    public synchronized Decision surRetour() {
        if (!ouvert) return Decision.SYSTEME;
        if (enAttente) { ouvert = false; enAttente = false; return Decision.SYSTEME; }
        enAttente = true;
        return Decision.DEMANDER_WEB;
    }

    /**
     * Réponse du web à MHDialogue.retour() (chaîne JSON renvoyée par evaluateJavascript : "true" si une fenêtre a été
     * fermée). Renvoie vrai si le Retour doit être rendu au système.
     */
    public synchronized boolean reponseWeb(String reponse) {
        if (!enAttente) return false;
        enAttente = false;
        if ("true".equals(reponse)) return false;
        ouvert = false;
        return true;
    }

    /** Délai écoulé sans réponse. Renvoie vrai si le Retour doit être rendu au système. */
    public synchronized boolean delaiDepasse() {
        if (!enAttente) return false;
        enAttente = false;
        ouvert = false;
        return true;
    }

    /** Nouvelle page chargée : aucune fenêtre n'est plus ouverte. */
    public synchronized void pageChargee() {
        ouvert = false;
        enAttente = false;
    }
}
