/*
 * MesHeures V37.0-F — Rapprochement MesHeures ↔ ROMI1 et contrôle journalier.
 *
 * Lecture seule, informatif, traçable. Le module :
 *  - ne corrige rien et n'écrit nulle part (ni DB, ni stockage, ni relevé ROMI1) ;
 *  - n'attribue jamais une cause à un écart (absence, CP, pause, saisie, ROMI1, MesHeures) ;
 *  - ne fabrique aucune valeur : une donnée absente rend la journée « non comparable ».
 *
 * Sources :
 *  - MesHeures : calcPer() pour un relevé aligné sur les quatorzaines (mhQuatorzaine, ancre 19/05/2025) ;
 *    sur un relevé partiel, TTE journaliers du moteur (cd) sur les seules dates du relevé ;
 *    horaires et pauses : tels que saisis (affichage uniquement).
 *  - ROMI1 : MH_ROMI.list(), valeurs telles qu'importées.
 *    Détail journalier : champ optionnel « jours » (ou « days ») d'un relevé :
 *      [{date:'AAAA-MM-JJ', presence:true|false, debut:'HH:MM', fin:'HH:MM', pauseMin|pauseH, tteMin|tteH}]
 *    Le lecteur ROMI1 actuel ne produit pas ce champ : sans lui, seuls les totaux sont comparés
 *    et l'écart reste « à analyser ».
 * Tolérance : ±15 min (identique au Smart Control et au Compteur heures), par période et par journée.
 */
(function(){
  'use strict';
  const V='37.0-F';
  const TOL=15;
  const isoDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(String(k||''));
  const isHm=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s||''));
  const num=v=>v!==null&&v!==''&&v!==undefined&&typeof v!=='boolean'&&Number.isFinite(Number(v));
  const hDec=h=>num(h)?Math.round(Number(h)*60):null;
  const span=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5)+1;
  const DBX=()=>(typeof DB!=='undefined'&&DB&&typeof DB==='object')?DB:{};
  const WORK=['T','NUIT'];

  function releves(){
    try{
      if(!window.MH_ROMI||typeof window.MH_ROMI.list!=='function')return [];
      return (window.MH_ROMI.list()||[]).filter(x=>x&&isoDay(x.periodStart)&&isoDay(x.periodEnd)&&x.periodStart<=x.periodEnd);
    }catch(e){return []}
  }

  /* Détail journalier ROMI1, normalisé sans rien compléter. */
  function romiJours(rec){
    const src=Array.isArray(rec&&rec.jours)?rec.jours:Array.isArray(rec&&rec.days)?rec.days:null;
    if(!src)return null;
    const out={};
    src.forEach(x=>{
      if(!x||!isoDay(x.date)||x.date<rec.periodStart||x.date>rec.periodEnd)return;
      const presence=typeof x.presence==='boolean'?x.presence:null;
      let tte=num(x.tteMin)?Math.round(Number(x.tteMin)):hDec(x.tteH);
      if(tte==null&&presence===false)tte=0;                          // absence déclarée par ROMI1 : 0, pas une supposition
      out[x.date]={presence,debut:isHm(x.debut)?x.debut:null,fin:isHm(x.fin)?x.fin:null,
        pauseMin:num(x.pauseMin)?Math.round(Number(x.pauseMin)):hDec(x.pauseH),tte};
    });
    return out;
  }

  /* Journée MesHeures : valeurs du moteur, horaires et pauses tels que saisis. */
  function jourMesHeures(k){
    const d=(DBX().days||{})[k];
    if(!d)return {saisie:false};
    const r=cd(k),work=WORK.includes(d.t);
    const pauses=(Array.isArray(d.p)?d.p:[]).filter(p=>p&&(p.d||p.f)).map(p=>(p.d||'?')+'–'+(p.f||'?'));
    return {saisie:true,type:d.t||null,presence:work,debut:work&&isHm(d.deb)?d.deb:null,fin:work&&isHm(d.fin)?d.fin:null,
      pauses:work?pauses:[],pauseMin:work?Number(r.pz)||0:0,tte:work?Number(r.tte)||0:0};
  }

  function detail(rec){
    const J=romiJours(rec);
    const lignes=[];
    for(let k=rec.periodStart;k<=rec.periodEnd;k=addD(k,1)){
      const mh=jourMesHeures(k),ro=J?J[k]||null:null;
      let statut,motif=null,diff=null;
      if(!J){statut='non_comparable';motif='détail journalier ROMI1 absent'}
      else if(!mh.saisie){statut='non_comparable';motif='journée non saisie dans MesHeures'}
      else if(!ro){statut='non_comparable';motif='journée absente du relevé ROMI1'}
      else if(ro.tte==null){statut='non_comparable';motif='TTE ROMI1 non renseigné'}
      else{diff=mh.tte-ro.tte;statut=Math.abs(diff)<=TOL?'concordant':'a_verifier'}
      lignes.push({date:k,mh,romi:ro,diff,statut,motif});
    }
    const comp=lignes.filter(l=>l.diff!=null);
    return {disponible:!!J,lignes,total:lignes.length,comparables:comp.length,
      aVerifier:comp.filter(l=>l.statut==='a_verifier').length,
      ecartExplique:J?comp.reduce((s,l)=>s+l.diff,0):null};
  }

  /* Analyse d'une période [start, end] (relevé de paie du Compteur heures en pratique). */
  function analyze(opts){
    opts=opts||{};
    const ps=opts.start,pe=opts.end;
    if(!isoDay(ps)||!isoDay(pe)||ps>pe)return {version:V,statut:'absent',tolerance:TOL};
    const list=releves();
    const same=list.find(x=>x.periodStart===ps&&x.periodEnd===pe);
    const inside=list.filter(x=>x!==same&&x.periodStart>=ps&&x.periodEnd<=pe).sort((a,b)=>span(b.periodStart,b.periodEnd)-span(a.periodStart,a.periodEnd)||String(a.periodStart).localeCompare(String(b.periodStart)));
    const rec=same||inside[0]||null;
    if(!rec){
      const overlap=list.filter(x=>x.periodStart<=pe&&x.periodEnd>=ps).sort((a,b)=>String(a.periodStart).localeCompare(String(b.periodStart)));
      if(overlap.length)return {version:V,statut:'non_comparable',tolerance:TOL,periode:{debut:ps,fin:pe},releves:overlap.map(x=>({debut:x.periodStart,fin:x.periodEnd}))};
      return {version:V,statut:'absent',tolerance:TOL,periode:{debut:ps,fin:pe}};
    }
    const partiel=!same;
    const aligned=mhQuatorzaine.isStart(rec.periodStart)&&mhQuatorzaine.isStart(addD(rec.periodEnd,1));
    let mh;
    if(aligned){
      const G=calcPer(rec.periodStart,Math.round(span(rec.periodStart,rec.periodEnd)/14)).G;
      mh={tte:G.tte,hs:G.h25+G.h50,jours:G.trav,source:'calcPer'};
    }else{
      let tte=0,jours=0;for(let k=rec.periodStart;k<=rec.periodEnd;k=addD(k,1)){const j=jourMesHeures(k);if(j.presence){tte+=j.tte;jours++}}
      mh={tte,hs:null,jours,source:'journées du moteur'};                 // HS hors quatorzaines entières : non comparables
    }
    const tteR=hDec(rec.ttePeriodH);
    const ecart=tteR==null?null:mh.tte-tteR;
    const det=detail(rec);
    return {version:V,statut:partiel?'partiel':'comparable',tolerance:TOL,periode:{debut:ps,fin:pe},
      releve:{debut:rec.periodStart,fin:rec.periodEnd,jours:span(rec.periodStart,rec.periodEnd)},autresPartiels:partiel?inside.length-1:0,
      mesheures:mh,
      employeur:{tte:tteR,hs:aligned?hDec(rec.hsPeriodH):null,presence:num(rec.presenceDays)?Number(rec.presenceDays):null,
        hs125Payees:hDec(rec.hs125PaidH),hs125Rc:hDec(rec.hs125ToRcH),hs150Payees:hDec(rec.hs150PaidH),hs150Rc:hDec(rec.hs150ToRcH),rcCumul:hDec(rec.rcBalanceH)},
      ecartTte:ecart,aVerifier:ecart!=null&&Math.abs(ecart)>TOL,niveau:ecart==null?'non_comparable':Math.abs(ecart)>TOL?'a_verifier':'concordant',
      journalier:{...det,ecartRestant:ecart!=null&&det.ecartExplique!=null?ecart-det.ecartExplique:ecart}};
  }

  window.MHRomiRecon={version:V,TOLERANCE:TOL,analyze};
})();
