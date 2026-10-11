/*
 * MesHeures V37.1 — Travail de nuit des ambulanciers (lecture seule).
 *
 * Source : accord du 16 juin 2016 relatif à la durée et à l'organisation du travail dans les activités du transport
 * sanitaire (IDCC 16), article 9 (brochure 3085, BOCC 2016/36). Version en vigueur à confirmer sur Légifrance
 * (KALIARTI000033415276).
 *  - période de nuit : 22 h → 5 h ;
 *  - travailleur de nuit : au moins 3 h de travail quotidien de nuit au moins 2 fois par semaine selon l'horaire habituel,
 *    OU au moins 270 h d'amplitude de nuit dans l'année ;
 *  - contrepartie en repos (travailleurs de nuit) : 15 % des heures d'amplitude 22 h → 5 h en cas d'affectation exclusive
 *    de nuit prévue au contrat ou par avenant, 10 % pour les autres ambulanciers ; conversion pécuniaire partielle possible
 *    sur demande, repos conservé ≥ 5 % ;
 *  - information mensuelle des heures de nuit ; pause ≥ 20 min après 6 h de travail effectif continu en permanence de nuit.
 *
 * Aucun calcul propre : horaires du service et pauses effectives viennent du moteur (cd, mhEffectivePauses), les minutes
 * de nuit de minutesNuit() appelée avec la période de l'article 9. La plage « Nuit » du réglage paie (21 h → 6 h par
 * défaut) reste distincte et inchangée.
 * Choix validés (08/10/2026) : année civile pour le seuil de 270 h ; base du repos = toutes les heures d'amplitude
 * 22 h → 5 h de l'année, présentée « à confirmer » ; taux 10 % (pas d'affectation exclusive de nuit).
 * Les pourcentages sont une contrepartie en REPOS, jamais une majoration de salaire : aucun montant en euros.
 */
(function(){
  'use strict';
  const V='37.1.1';
  const ART9={nuitDeb:'22:00',nuitFin:'05:00'};
  const SEUIL=270*60,JOUR_NUIT=3*60,PAUSE_MIN=20,CONTINU_MAX=6*60;
  const TAUX=0.10,TAUX_EXCLUSIF=0.15,PLANCHER=0.05;
  const SOURCE='Accord du 16/06/2016 (transport sanitaire), art. 9';
  const WORK=['T','NUIT'];
  const isoDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(String(k||''));
  const days=()=>(typeof DB!=='undefined'&&DB&&DB.days)||{};

  /* Une journée : amplitude de nuit, travail effectif de nuit, plus long travail effectif continu DE NUIT.
   * Pause de nuit (V37.1, correction) : seules les pauses d'au moins 20 min coupent le travail continu ; dans chaque bloc
   * continu, on ne compte que le travail effectif situé entre 22 h et 5 h (pauses courtes déduites). Six heures de
   * travail avant 22 h ne constituent donc pas un dépassement en permanence de nuit. */
  function jour(k){
    const d=days()[k];
    if(!d||!WORK.includes(d.t))return null;
    const r=cd(k);
    if(r.deb==null||r.fin==null)return {date:k,incomplet:true,amplitude:0,travail:0,continuNuit:0,continuService:0,pauses:[]};
    const ep=mhEffectivePauses(d,r.deb,r.fin),iv=Array.isArray(ep.iv)?ep.iv:[];
    const nuit=(a,b)=>b>a?minutesNuit(a,b,ART9):0;
    const amplitude=nuit(r.deb,r.fin);
    const pausesNuit=iv.reduce((s,p)=>s+nuit(p[0],p[1]),0);
    /* blocs de travail continu : le service découpé par les pauses d'au moins 20 min */
    const longues=iv.filter(p=>p[1]-p[0]>=PAUSE_MIN),courtes=iv.filter(p=>p[1]-p[0]<PAUSE_MIN),blocs=[];
    let debut=r.deb;longues.forEach(p=>{blocs.push([debut,p[0]]);debut=p[1]});blocs.push([debut,r.fin]);
    let continuNuit=0,continuService=0;
    blocs.forEach(([a,b])=>{if(b<=a)return;
      const court=courtes.reduce((s,p)=>s+Math.max(0,Math.min(p[1],b)-Math.max(p[0],a)),0),courtNuit=courtes.reduce((s,p)=>s+nuit(Math.max(p[0],a),Math.min(p[1],b)),0);
      continuService=Math.max(continuService,b-a-court);
      continuNuit=Math.max(continuNuit,nuit(a,b)-courtNuit)});
    return {date:k,incomplet:false,type:d.t,amplitude,travail:Math.max(0,amplitude-pausesNuit),continuNuit,continuService,pauses:iv};
  }

  function plage(debut,fin){const out=[];for(let k=debut;k<=fin;k=addD(k,1)){const j=jour(k);if(j)out.push(j)}return out}
  const somme=(l,f)=>l.reduce((s,j)=>s+j[f],0);

  /* Synthèse d'une période (Compteur, Assistant Paie). */
  function periode(debut,fin){
    const l=plage(debut,fin),nuit=l.filter(j=>j.amplitude>0);
    return {debut,fin,amplitude:somme(l,'amplitude'),travail:somme(l,'travail'),jours:nuit.length,jours3h:l.filter(j=>j.travail>=JOUR_NUIT).length};
  }

  /* Information mensuelle (douze mois de l'année civile). */
  function mensuel(annee){
    return Array.from({length:12},(_,i)=>{const m=annee+'-'+String(i+1).padStart(2,'0'),f=addD(addD(m+'-01',32).slice(0,7)+'-01',-1),p=periode(m+'-01',f);
      return {mois:m,amplitude:p.amplitude,travail:p.travail,jours:p.jours,jours3h:p.jours3h}});
  }

  /* Statut de travailleur de nuit pour une année civile, à la date « now ». */
  function annee(an,opts){
    opts=opts||{};
    const now=opts.today||today(),y=String(an||now.slice(0,4)),debut=y+'-01-01',finAn=y+'-12-31',fin=finAn<now?finAn:now;
    const l=debut<=fin?plage(debut,fin):[];
    let cumul=0,franchi=null;l.forEach(j=>{cumul+=j.amplitude;if(franchi==null&&cumul>=SEUIL)franchi=j.date});
    const semaines={};l.filter(j=>j.travail>=JOUR_NUIT).forEach(j=>{const w=mono(j.date);semaines[w]=(semaines[w]||0)+1});
    const semIndice=Object.keys(semaines).filter(w=>semaines[w]>=2).sort();
    let manquants=0;for(let k=debut;k<=fin;k=addD(k,1))if(!days()[k])manquants++;
    const incomplets=l.filter(j=>j.incomplet).map(j=>j.date);
    const close=finAn<now;
    let statut,texte;
    if(franchi){statut='etabli';texte='Travailleur de nuit : seuil de 270 h d’amplitude de nuit franchi le '+fr(franchi)+'.'}
    else if(semIndice.length){statut='indice';texte='Critère hebdomadaire à confirmer : '+semIndice.length+' semaine(s) avec au moins 2 journées de 3 h de travail de nuit. Le texte vise l’horaire habituel, qui ne se déduit pas des seules journées saisies.'}
    else if(close&&!manquants&&!incomplets.length){statut='non';texte='Non travailleur de nuit selon les données de '+y+' : seuil de 270 h non atteint, critère hebdomadaire jamais rempli.'}
    else{statut='non_determinable';texte='Statut non déterminable '+(close?'':'à ce jour ')+': '+(close?'':'année '+y+' en cours, ')+(manquants?manquants+' jour(s) non saisi(s), ':'')+(incomplets.length?incomplets.length+' journée(s) sans horaires complets, ':'')+'seuil de 270 h non atteint ('+F(Math.round(cumul))+').'}
    const etabli=statut==='etabli';
    const repos=etabli?{taux:TAUX,pourcentage:Math.round(TAUX*100),base:cumul,heures:Math.round(cumul*TAUX),plancher:Math.round(cumul*PLANCHER),
      note:'Contrepartie en repos, pas une majoration de salaire. Base retenue : toutes les heures d’amplitude 22 h → 5 h de l’année (à confirmer : le texte renvoie à des « modalités à définir » au franchissement des 270 h). 15 % seulement en cas d’affectation exclusive de nuit prévue au contrat ou par avenant (non applicable).'}:null;
    /* Pause de nuit : contrôlée pour un travailleur de nuit établi, sur les journées comportant des heures de nuit ;
       non conforme dès 6 h de travail effectif continu entre 22 h et 5 h sans pause d'au moins 20 min. */
    const pausesNuit=l.filter(j=>j.amplitude>0&&!j.incomplet).map(j=>({date:j.date,continuNuit:j.continuNuit,conforme:j.continuNuit<CONTINU_MAX}));
    return {version:V,annee:y,debut,fin,close,cumul,seuil:SEUIL,reste:Math.max(0,SEUIL-cumul),franchi,semainesIndice:semIndice,manquants,incomplets,
      statut,texte,repos,pausesNuit,pauseControlee:etabli,mensuel:mensuel(y),source:SOURCE};
  }
  function fr(k){return isoDay(k)?k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4):'—'}

  window.MHNuit={version:V,ART9,SEUIL,TAUX,TAUX_EXCLUSIF,PLANCHER,CONTINU_MAX,PAUSE_MIN,SOURCE,jour,periode,mensuel,annee};
})();
