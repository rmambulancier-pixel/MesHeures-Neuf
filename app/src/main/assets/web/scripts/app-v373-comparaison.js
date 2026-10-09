/*
 * MesHeures V37.3.0 — 📊 Comparaison Prévu ↔ Réel. ANALYSE UNIQUEMENT.
 * Entrées : le Prévu validé (MHPrevuCalendrier : fiches validées, provenances, conflits) et le Réel en lecture seule
 * (MHReelLecture : copie de DB.days[date] + calcul existant cd(date)). Sortie : des lignes d'analyse. Rien n'est écrit,
 * aucune prévision ne devient une journée réelle, aucune heure prévue n'entre dans un calcul de paie.
 *
 * Règles (dérivées des deux modèles existants, documentées dans docs/V37.3-COMPARAISON.md) :
 *  - correspondance par DATE : Prévu = date de la cellule du planning ; Réel = clé de DB.days (date de début de la journée,
 *    une nuit est rattachée à son jour de début). Une seule journée réelle par date dans le modèle.
 *  - nature du Prévu, tirée du dictionnaire validé (type + « concerné ») : JOUR, GARDE_SAMU, GARDE_COMMERCIALE → travail ;
 *    REPOS → repos ; CONGES_35H → congé ; FERIE, FORMATION → non comparables (le dictionnaire ne dit pas si le jour est
 *    travaillé) ; codes déclarés non concernés (MATIN, APRES_MIDI, RECUP_39H) et non interprétés → non comparables.
 *  - nature du Réel, tirée du type de journée : T, NUIT → travail ; REPOS → repos ; CP → congé ; RC → repos compensateur ;
 *    MAL → maladie ; autre → inconnue (non comparable).
 *  - résultat : conflit prévisionnel (2 fiches différentes) > non comparable > prévu sans réel > même nature = conforme ;
 *    travail réel sur un jour prévu sans travail = réel non prévu ; autre différence de nature = différent.
 *  - écarts d'heures (TTE réel − durée prévue ; début/fin réels − horaires prévus) : AFFICHÉS, ils ne changent jamais la
 *    catégorie (aucune tolérance inventée).
 *  - une date sans réel n'est jamais « non travaillée » ; après aujourd'hui elle est « à venir ».
 */
(function(root){
  'use strict';
  const V='37.3.0';
  const CAL=()=>root.MHPrevuCalendrier,REEL=()=>root.MHReelLecture,P=()=>root.MHPlanning;
  const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const min=s=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(s||''));return m?(+m[1])*60+(+m[2]):null};
  const hm=m=>m==null?'—':(m<0?'−':'+')+Math.floor(Math.abs(m)/60)+'h'+String(Math.abs(m)%60).padStart(2,'0');

  const RESULTATS={
    conforme:{emoji:'🟢',libelle:'Conforme'},different:{emoji:'🟠',libelle:'Différent'},reel_non_prevu:{emoji:'🔴',libelle:'Réel non prévu'},
    prevu_sans_reel:{emoji:'🔵',libelle:'Prévu mais aucun réel'},conflit:{emoji:'⚠️',libelle:'Conflit prévisionnel'},non_comparable:{emoji:'ℹ️',libelle:'Non comparable'}};
  const NATURES={travail:'travail',repos:'repos',conge:'congé',repos_compensateur:'repos compensateur',maladie:'maladie'};

  function naturePrevu(v){
    if(!v)return {nature:null,raison:'aucune valeur prévue'};
    if(v.applicable===false)return {nature:null,raison:'« '+v.libelle+' » est déclaré non concerné'};
    switch(v.type){
      case 'JOUR':case 'GARDE_SAMU':case 'GARDE_COMMERCIALE':return {nature:'travail'};
      case 'REPOS':return {nature:'repos'};
      case 'CONGES_35H':return {nature:'conge'};
      case 'FERIE':return {nature:null,raison:'« Jour férié » : le planning ne dit pas si le jour est travaillé'};
      case 'FORMATION':return {nature:null,raison:'« Formation » : le planning ne dit pas comment elle se compare à une journée réelle'};
      default:return {nature:null,raison:'libellé non interprété (« '+(v.libelle||'?')+' »)'};
    }
  }
  function natureReel(j){
    if(!j)return {nature:null};
    switch(j.t){case 'T':case 'NUIT':return {nature:'travail'};case 'REPOS':return {nature:'repos'};case 'CP':return {nature:'conge'};
      case 'RC':return {nature:'repos_compensateur'};case 'MAL':return {nature:'maladie'};default:return {nature:null,raison:'type de journée réelle inconnu ('+(j.t||'vide')+')'}}
  }
  function libelleReel(j){if(!j)return null;
    const h=j.deb||j.fin?(j.deb||'?')+'–'+(j.fin||'?'):'';
    switch(j.t){case 'T':return 'Travail'+(h?' '+h:'');case 'NUIT':return 'Nuit'+(h?' '+h:'');case 'REPOS':return 'Repos';case 'CP':return 'Congé';case 'RC':return 'Repos compensateur';case 'MAL':return 'Maladie';default:return j.t||'?'}}
  /* écarts d'heures, à titre d'information seulement */
  function ecarts(v,j){const out=[];if(!v||!j||!j.calcul)return out;
    if(j.calcul.horairesIncomplets){out.push({type:'note',texte:'horaires réels incomplets : écart non calculable'});return out}
    if(v.dureeMin!=null&&j.calcul.tte!=null){const e=j.calcul.tte-v.dureeMin;out.push({type:'duree',prevu:v.dureeMin,reel:j.calcul.tte,ecart:e,texte:'TTE réel '+hm(j.calcul.tte).slice(1)+' pour '+hm(v.dureeMin).slice(1)+' prévues : '+(e===0?'identique':hm(e))})}
    if(v.horaires){const pd=min(v.horaires.debut),pf=min(v.horaires.fin),rd=min(j.deb),rf=min(j.fin);
      if(pd!=null&&rd!=null){const e=rd-pd;out.push({type:'debut',ecart:e,texte:'début réel '+j.deb+' pour '+v.horaires.debut+' prévu : '+(e===0?'identique':hm(e))})}
      if(pf!=null&&rf!=null){let e=rf-pf;if(e<-720)e+=1440;if(e>720)e-=1440;out.push({type:'fin',ecart:e,texte:'fin réelle '+j.fin+' pour '+v.horaires.fin+' prévue : '+(e===0?'identique':hm(e))})}}
    return out}

  /* Une date : entrée prévue (calendrier D), journée réelle (pont de lecture), date du jour. */
  function comparer(date,e,j,aujourdhui){
    const futur=!!aujourdhui&&date>aujourdhui;
    const ligne={date,futur,prevu:{etat:e.etat,libelle:e.libelle,valeurs:e.valeurs.map(v=>({libelle:v.libelle,type:v.type,dureeMin:v.dureeMin,horaires:v.horaires,provenance:v.provenance})),
      provenances:e.provenances},reel:j?{t:j.t,libelle:libelleReel(j),deb:j.deb,fin:j.fin,tte:j.calcul?j.calcul.tte:null,amp:j.calcul?j.calcul.amp:null}:null,resultat:null,motif:'',ecarts:[]};
    const fin=(r,m)=>{ligne.resultat=r;ligne.motif=m;return ligne};
    if(e.etat==='conflit')return fin('conflit',e.valeurs.length+' plannings validés prévoient des valeurs différentes : aucune n’est retenue, la date n’est pas comparée.');
    const nr=natureReel(j);
    if(e.etat==='aucun'){
      if(!j)return fin('non_comparable','ni prévu ni réel');
      if(nr.nature==='travail')return fin('reel_non_prevu','travail réel ; aucun planning validé ne prévoit cette date.');
      return fin('non_comparable','aucun planning validé ne prévoit cette date.');
    }
    const v=e.valeurs[0],np=naturePrevu(v);
    if(!np.nature)return fin('non_comparable',np.raison+'.');
    if(!j)return fin('prevu_sans_reel',futur?'à venir : aucun réel saisi pour l’instant.':'aucune journée réelle saisie pour cette date (cela ne veut pas dire qu’elle n’a pas été travaillée).');
    if(!nr.nature)return fin('non_comparable',nr.raison+'.');
    if(np.nature===nr.nature){ligne.ecarts=np.nature==='travail'?ecarts(v,j):[];return fin('conforme','même nature de journée ('+NATURES[np.nature]+').'+(ligne.ecarts.some(x=>x.ecart)?' Écarts d’heures affichés à titre d’information.':''))}
    if(nr.nature==='travail')return fin('reel_non_prevu','travail réel alors que « '+v.libelle+' » était prévu.');
    return fin('different','prévu : '+NATURES[np.nature]+' ; réel : '+NATURES[nr.nature]+'.');
  }

  /* Période : une ligne par date ; dates « vides » (ni prévu ni réel) omises de la liste mais comptées. */
  function periode(debut,fin,opts){
    opts=opts||{};const st=opts.store||P().store(),idx=CAL().index(st),lire=opts.reel||REEL().jour,auj=opts.aujourdhui||null;
    const lignes=[];let vides=0;
    for(let d=debut;d<=fin;d=addJ(d,1)){const e=CAL().entree(st,d,idx),j=lire(d),l=comparer(d,e,j,auj);if(e.etat==='aucun'&&!j){vides++;continue}lignes.push(l)}
    return {debut,fin,aujourdhui:auj,lignes,vides,stats:statistiques(lignes)};
  }
  /* Statistiques. Taux de conformité = conformes / jours comparables, où « comparable » = une prévision unique de nature
     comparable ET une journée réelle de nature connue (conformes + différents + réels non prévus sur un jour prévu).
     Pas de taux si aucun jour n'est comparable. Les prévus sans réel, à venir, conflits et non comparables n'entrent pas au
     dénominateur. */
  function statistiques(lignes){
    const n=r=>lignes.filter(l=>l.resultat===r).length;
    const rnpPrevu=lignes.filter(l=>l.resultat==='reel_non_prevu'&&l.prevu.etat!=='aucun').length;
    const s={jours:lignes.length,conformes:n('conforme'),differents:n('different'),reelsNonPrevus:rnpPrevu,reelsSansPrevision:n('reel_non_prevu')-rnpPrevu,
      prevusSansReel:lignes.filter(l=>l.resultat==='prevu_sans_reel'&&!l.futur).length,aVenir:lignes.filter(l=>l.resultat==='prevu_sans_reel'&&l.futur).length,
      conflits:n('conflit'),nonComparables:n('non_comparable')};
    s.comparables=s.conformes+s.differents+s.reelsNonPrevus;
    s.taux=s.comparables?Math.round(s.conformes/s.comparables*1000)/10:null;
    s.definitionTaux='conformes / jours comparables (prévision unique comparable ET journée réelle saisie)';
    return s;
  }
  function mois(ym,opts){const d=ym+'-01',f=addJ(new Date(Date.UTC(+ym.slice(0,4),+ym.slice(5,7),1)).toISOString().slice(0,10),-1);return Object.assign(periode(d,f,opts),{mois:ym})}

  root.MHComparaison={version:V,RESULTATS,NATURES,naturePrevu,natureReel,comparer,periode,mois,statistiques};
})(typeof window!=='undefined'?window:globalThis);
