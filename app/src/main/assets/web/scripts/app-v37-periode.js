/*
 * MesHeures V37.0-H — Période active : un seul vocabulaire pour toutes les zones.
 *
 * Lecture seule. Deux périodes existent dans l'application et ne doivent jamais être confondues :
 *  - le relevé en cours : relevé de paie de 4 semaines (2 quatorzaines mhQuatorzaine, ancre 19/05/2025) contenant aujourd'hui ;
 *  - la période de l'écran Paie : DB.per (choisie par l'utilisateur, 2 ou 3 quatorzaines), lue via mhCurrentPaySummary.
 * Toute zone qui affiche une période la qualifie : « relevé en cours », « relevé antérieur » ou « relevé à venir ».
 * Le mois de paie reste une hypothèse (mois de fin du relevé) : il est toujours suivi de « rattachement à confirmer ».
 */
(function(){
  'use strict';
  const isoDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(String(k||''));
  const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const dShort=k=>isoDay(k)?k.slice(8)+'/'+k.slice(5,7):'—';
  const dFr=k=>isoDay(k)?k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4):'—';
  const mFr=ym=>/^\d{4}-\d{2}$/.test(String(ym||''))?MONTHS[+ym.slice(5,7)-1]+' '+ym.slice(0,4):'—';
  const now=t=>isoDay(t)?t:today();

  /* Relevé en cours (4 semaines). */
  function courante(t){const p=mhQuatorzaine.payPeriod(now(t));return {debut:p.start,fin:p.end}}
  /* Période de l'écran Paie, telle que mhCurrentPaySummary la lit (aucune écriture). */
  function paie(){
    let p=null;try{if(typeof window.mhCurrentPaySummary==='function')p=window.mhCurrentPaySummary()}catch(e){p=null}
    if(!p||!isoDay(p.start))return null;
    return {debut:p.start,fin:addD(p.start,p.nb*14-1),nb:p.nb};
  }
  /* Statut d'une période par rapport à aujourd'hui. */
  function statut(debut,fin,t){const n=now(t);return fin<n?'antérieur':debut>n?'à venir':'en cours'}
  function libelle(debut,fin,t){return 'Relevé '+statut(debut,fin,t)+' · '+dShort(debut)+' → '+dFr(fin)}
  function memePeriode(a,b){return !!(a&&b&&a.debut===b.debut&&a.fin===b.fin)}
  /* Mois de paie : hypothèse (lot C), jamais présentée comme établie. */
  function moisPaie(debut){return {mois:mhQuatorzaine.payMonth(debut),libelle:mFr(mhQuatorzaine.payMonth(debut)),statut:'rattachement à confirmer'}}

  /* Bulletin de référence d'une période : jamais présenté comme le bulletin de la période s'il ne l'est pas. */
  function bulletinReference(debut){
    const list=((typeof DB!=='undefined'&&DB&&Array.isArray(DB.bulletins))?DB.bulletins:[]).filter(b=>b&&/^\d{4}-\d{2}$/.test(String(b.mois||''))).slice().sort((a,b)=>String(a.mois).localeCompare(String(b.mois)));
    const m=mhQuatorzaine.payMonth(debut);
    const same=list.find(b=>b.mois===m);
    if(same)return {statut:'rattache',bulletin:same,mois:same.mois,libelle:mFr(same.mois),
      texte:'Bulletin de '+mFr(same.mois)+' : mois de paie de ce relevé (rattachement à confirmer).'};
    const prev=list.filter(b=>b.mois<m).pop();
    if(prev)return {statut:'precedent',bulletin:prev,mois:prev.mois,libelle:mFr(prev.mois),
      texte:'Dernier bulletin disponible : '+mFr(prev.mois)+'. Référence précédente — pas le bulletin de la période courante.'};
    return {statut:'absent',bulletin:null,mois:null,libelle:null,texte:'Bulletin non renseigné pour ce relevé.'};
  }

  window.MHPeriode={courante,paie,statut,libelle,memePeriode,moisPaie,bulletinReference,dShort,dFr,mFr};
})();
