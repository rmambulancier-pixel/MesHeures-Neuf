/*
 * MesHeures V37.3.0 — Comparaison Prévu ↔ Réel : PONT DE LECTURE du Réel (lecture seule).
 * Seul fichier de la comparaison qui touche aux données réelles. Il LIT une journée (DB.days[date]) et son calcul
 * existant (cd(date), moteur inchangé), puis renvoie une COPIE figée. Il n'écrit rien, n'enregistre rien, ne recalcule
 * rien à sa façon : TTE, amplitude, pauses, nuit… sont ceux du moteur réel.
 * Une date sans enregistrement réel donne null (« aucun réel saisi ») : jamais « repos » ni « non travaillé ».
 */
(function(root){
  'use strict';
  const V='37.3.0';
  const ISO=/^\d{4}-\d{2}-\d{2}$/;
  const fige=o=>{Object.values(o).forEach(v=>{if(v&&typeof v==='object')fige(v)});return Object.freeze(o)};
  /* accès en lecture aux liaisons globales du moteur (déclarées par app-core.js) */
  function source(){
    let jours=null,calc=null;
    try{if(typeof DB!=='undefined'&&DB&&DB.days&&typeof DB.days==='object')jours=DB.days}catch(e){}
    try{if(typeof cd==='function')calc=cd}catch(e){}
    return {jours,calc};
  }
  function jour(k){
    if(!ISO.test(String(k||'')))return null;
    const {jours,calc}=source();if(!jours)return null;
    const d=jours[k];if(!d||typeof d!=='object')return null;
    let r=null;try{r=calc?calc(k):null}catch(e){r=null}
    const nb=x=>typeof x==='number'&&isFinite(x)?x:null;
    /* journée « vide » : REPOS sans horaires, pauses ni note. L'application en crée une dès qu'on ouvre un jour (gd() de app.js)
       et la traite elle-même comme vide (app-ui.js) : ce n'est pas une saisie. */
    const vide=d.t==='REPOS'&&!d.deb&&!d.fin&&!d.note&&!(Array.isArray(d.p)&&d.p.length);
    return fige({date:k,t:typeof d.t==='string'?d.t:null,deb:typeof d.deb==='string'?d.deb:null,fin:typeof d.fin==='string'?d.fin:null,
      ferie:!!d.fer,enCours:!!d.running,vide,
      calcul:r?{tte:nb(r.tte),amp:nb(r.amp),pz:nb(r.pz),nuit:nb(r.nuit),debMin:nb(r.deb),finMin:nb(r.fin),
        horairesIncomplets:Array.isArray(r.al)&&r.al.some(a=>a&&/Horaires incomplets/.test(String(a.m||'')))}:null});
  }
  /* dates réelles enregistrées dans un intervalle (lecture des clés seulement) */
  function dates(debut,fin){const {jours}=source();if(!jours)return [];return Object.keys(jours).filter(k=>ISO.test(k)&&k>=debut&&k<=fin).sort()}
  root.MHReelLecture={version:V,jour,dates};
})(typeof window!=='undefined'?window:globalThis);
