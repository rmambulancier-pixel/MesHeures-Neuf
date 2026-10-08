/*
 * MesHeures V37.0-E — Compteur heures : synthèse d'un relevé de 4 semaines (2 quatorzaines).
 *
 * Lecture seule, aucun moteur propre. Sources :
 *  - calendrier : mhQuatorzaine (ancre 19/05/2025), jamais la date d'embauche ;
 *  - heures : calcPer(début, 2) pour le relevé et ses quatorzaines (TTE, amplitude, base HS, HS 25 / 50 %) ;
 *    calcPer(quatorzaine, 1).G pour nuit, IDAJ, habillage, paniers et RC de chaque quatorzaine ;
 *    CP valorisés = base HS − TTE (le moteur ajoute la valeur d'un CP à la base HS, rien d'autre) ;
 *  - paie : mhCurrentPaySummary() (calcPer + brutOf, netEst), affichée telle quelle, jamais recalculée ;
 *  - référence employeur : MH_ROMI.list(), affichée à part, jamais mélangée aux valeurs MesHeures ;
 *  - déjà payé : saisie de l'écran Paie (DB.bul, lu sans gb() qui créerait une entrée) et ROMI1.
 * Aucune écriture dans DB ni dans le stockage. Aucune correction automatique d'écart.
 */
(function(){
  'use strict';
  const V='37.0-E';
  const NR='non renseigné';
  const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const isoDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(String(k||''));
  const num=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
  const hm=m=>num(m)?(Number(m)<0?'−':'')+F(Math.abs(Math.round(Number(m)))):'—';
  const hDec=h=>num(h)?Math.round(Number(h)*60):null;
  const dShort=k=>isoDay(k)?k.slice(8)+'/'+k.slice(5,7):'—';
  const dFr=k=>isoDay(k)?k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4):'—';
  const mFr=ym=>/^\d{4}-\d{2}$/.test(String(ym||''))?MONTHS[+ym.slice(5,7)-1]+' '+ym.slice(0,4):NR;
  const eur=n=>num(n)?Number(n).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' €':NR;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const days=()=>(typeof DB!=='undefined'&&DB&&DB.days)||{};
  const WORK=['T','NUIT'];

  /* Relevé affiché : celui choisi par ‹ ›, sinon le relevé du jour, sinon le dernier relevé contenant une journée. */
  let selected=null;
  function hasDays(ps){const pe=addD(ps,27);return Object.keys(days()).some(k=>isoDay(k)&&k>=ps&&k<=pe)}
  function defaultStart(now){
    const cur=mhQuatorzaine.payPeriod(now).start;
    if(hasDays(cur))return cur;
    const past=Object.keys(days()).filter(k=>isoDay(k)&&k<=now).sort();
    return past.length?mhQuatorzaine.payPeriod(past[past.length-1]).start:cur;
  }

  /* V37.0-F : la comparaison ROMI1 vient du module de rapprochement (MHRomiRecon), seule source. */
  function romiFor(ps,pe){
    try{if(window.MHRomiRecon&&typeof window.MHRomiRecon.analyze==='function')return window.MHRomiRecon.analyze({start:ps,end:pe})}catch(e){console.warn('Rapprochement ROMI1',e)}
    return {statut:'indisponible'};
  }

  /* ---------- données (lecture seule) ---------- */
  function data(opts){
    opts=opts||{};
    const now=opts.today||today();
    const ps=opts.start?mhQuatorzaine.payPeriod(opts.start).start:(selected||defaultStart(now)),pe=addD(ps,27);
    const D=days(),keys=Object.keys(D).filter(k=>isoDay(k)&&k>=ps&&k<=pe);
    const count=(t,a,b)=>keys.filter(k=>k>=a&&k<=b&&D[k]&&D[k].t===t).length;
    const R=calcPer(ps,2),G=R.G;
    const quatorzaines=R.Q.map(q=>{
      const qe=addD(q.start,13),g=calcPer(q.start,1).G;
      return {debut:q.start,fin:qe,jours:q.trav,tte:q.tte,amp:q.amp,base:q.seuil,nor:q.nor,h25:q.h25,h50:q.h50,
        cpMin:q.seuil-q.tte,cpJours:count('CP',q.start,qe),rcMin:g.rc,rcJours:count('RC',q.start,qe),
        nuit:g.nuit,idaj:g.idaj,hab:g.hab,ir:g.ir,iru:g.iru};
    });
    const bul=(typeof DB!=='undefined'&&DB&&DB.bul&&DB.bul[ps])||null;          // lecture directe : gb() créerait l'entrée
    const bulletin=((typeof DB!=='undefined'&&DB&&Array.isArray(DB.bulletins))?DB.bulletins:[]).find(b=>b&&b.mois===mhQuatorzaine.payMonth(ps))||null;
    let paie=null;try{if(typeof window.mhCurrentPaySummary==='function')paie=window.mhCurrentPaySummary()}catch(e){paie=null}
    const romi=romiFor(ps,pe);
    /* V37.1 : travail de nuit (art. 9), module MHNuit en lecture seule ; absent = bloc non affiché. */
    let nuit9=null;
    try{if(window.MHNuit){const an=window.MHNuit.annee(pe.slice(0,4),{today:now}),pr=window.MHNuit.periode(ps,pe);
      nuit9={amplitude:pr.amplitude,travail:pr.travail,jours:pr.jours,annee:an.annee,cumul:an.cumul,seuil:an.seuil,statut:an.statut,texte:an.texte,repos:an.repos}}}catch(e){console.warn('Travail de nuit',e);nuit9=null}
    const alertes={critiques:R.AL.filter(a=>a.lvl==='b').length,aVerifier:R.AL.filter(a=>a.lvl!=='b').length};
    const controle=[];
    if(romi.statut==='comparable'&&romi.aVerifier)controle.push({niveau:'warn',texte:'Écart TTE avec le relevé ROMI1 : '+hm(romi.ecartTte)+'. Écart à analyser.'});
    if(romi.statut==='partiel')controle.push({niveau:'mut',texte:'Relevé ROMI1 partiel ('+dShort(romi.releve.debut)+' → '+dShort(romi.releve.fin)+') : comparaison limitée à ses dates.'+(romi.aVerifier?' Écart TTE '+hm(romi.ecartTte)+' à analyser.':'')});
    if(romi.statut==='non_comparable')controle.push({niveau:'mut',texte:'Relevé ROMI1 non comparable à ce relevé de 4 semaines.'});
    if(romi.statut==='absent'&&keys.length)controle.push({niveau:'mut',texte:'Pas de relevé ROMI1 disponible pour cette période.'});
    if(alertes.critiques)controle.push({niveau:'bad',texte:alertes.critiques+' alerte'+(alertes.critiques>1?'s':'')+' critique'+(alertes.critiques>1?'s':'')+' sur la période (voir Paie et Audit).'});
    if(alertes.aVerifier)controle.push({niveau:'warn',texte:alertes.aVerifier+' point'+(alertes.aVerifier>1?'s':'')+' à vérifier sur la période.'});
    const hsPayeesSaisie=bul&&(num(bul.p25)||num(bul.p50));
    if(G.h25+G.h50>0&&!hsPayeesSaisie&&!(romi.statut==='comparable'&&(romi.employeur.hs125Payees!=null||romi.employeur.hs150Payees!=null)))
      controle.push({niveau:'mut',texte:'HS payées non renseignées : paiement des '+hm(G.h25+G.h50)+' d’HS à contrôler.'});
    return {
      version:V,vide:keys.length===0,
      periode:{debut:ps,fin:pe,enCours:ps<=now&&now<=pe,actuelle:ps===mhQuatorzaine.payPeriod(now).start,
        moisPaie:mhQuatorzaine.payMonth(ps),moisPaieStatut:'hypothèse à confirmer',ancre:mhQuatorzaine.anchor},
      travail:{tte:G.tte,amp:G.amp,jours:G.trav},
      hs:{h25:G.h25,h50:G.h50,total:G.h25+G.h50,base:G.seuil,normales:G.nor},
      autres:{nuit:G.nuit,idaj:G.idaj,hab:G.hab,cpMin:G.seuil-G.tte,cpJours:count('CP',ps,pe),rcMin:G.rc,rcJours:count('RC',ps,pe),ir:G.ir,iru:G.iru},
      nuit9,quatorzaines,romi,alertes,controle,
      seuils:{h25:num(DB.s&&DB.s.base)?Number(DB.s.base)*2:NR,h50:num(DB.s&&DB.s.base)&&num(DB.s.pl)?Number(DB.s.base)*2+Number(DB.s.pl):NR},
      paye:{saisie:bul?{h25:num(bul.p25)?Math.round(Number(bul.p25)*60):null,h50:num(bul.p50)?Math.round(Number(bul.p50)*60):null}:null,
        bulletin:bulletin?{mois:bulletin.mois,h25:hDec(bulletin.hs25H),h50:hDec(bulletin.hs50H),ir:num(bulletin.irN)?Number(bulletin.irN):null,iru:num(bulletin.iruN)?Number(bulletin.iruN):null}:null},
      periodePaie:paie?{debut:paie.start,fin:addD(paie.start,paie.nb*14-1),meme:paie.start===ps&&paie.nb===2}:null,
      paie:paie?{brut:paie.grossEst,netEst:paie.netEst,debut:paie.start,fin:addD(paie.start,paie.nb*14-1),memePeriode:paie.start===ps&&paie.nb===2}:null
    };
  }

  /* ---------- rendu (bloc de l'Accueil) ---------- */
  const row=(label,value,sub)=>'<div class="mh37c-row"><span>'+label+(sub?'<small>'+sub+'</small>':'')+'</span><b>'+value+'</b></div>';
  /* V37.0-F : synthèse, décomposition et détail journalier du rapprochement ROMI1 (affichage seul). */
  const WD=['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
  const wd=k=>WD[new Date(k+'T12:00:00Z').getUTCDay()];
  const sgn=m=>m==null?'—':(m>0?'+':m<0?'−':'±')+F(Math.abs(Math.round(m)));
  function romiDetail(r){
    const j=r.journalier,tol=r.tolerance;
    let h='';
    if(r.statut==='partiel')h+='<div class="mh37c-note" data-romi="partiel"><b>Relevé ROMI1 partiel — comparaison limitée</b><br>Le relevé couvre du '+dFr(r.releve.debut)+' au '+dFr(r.releve.fin)+' ('+r.releve.jours+' jours). La comparaison porte uniquement sur ces dates'+(r.mesheures.hs==null?' ; HS non comparables (hors quatorzaines entières)':'')+'.'+(r.autresPartiels?' '+r.autresPartiels+' autre(s) relevé(s) partiel(s) non affiché(s).':'')+'</div>';
    h+='<div class="mh37c-cmp" data-romi="'+r.statut+'"><div><span>MesHeures</span><b>'+hm(r.mesheures.tte)+'</b><small>Calcul interne · HS '+hm(r.mesheures.hs)+' · '+r.mesheures.jours+' j</small></div>'+
      '<div><span>ROMI1 (employeur)</span><b>'+hm(r.employeur.tte)+'</b><small>Source employeur · HS '+hm(r.employeur.hs)+' · '+(r.employeur.presence!=null?r.employeur.presence+' j':'présence —')+'</small></div>'+
      '<div data-tone="'+(r.ecartTte==null?'mut':r.aVerifier?'warn':'ok')+'"><span>Écart TTE</span><b>'+hm(r.ecartTte)+'</b><small>'+(r.ecartTte==null?'non comparable — donnée manquante':r.aVerifier?'⚠️ À vérifier · écart à analyser':'✓ concordant (±'+tol+' min)')+'</small></div></div>';
    h+='<div class="mh37c-dec">'+row('Journées comparables','<span data-k="jc">'+j.comparables+' / '+j.total+'</span>',j.disponible?'écart journalier au-delà de ±'+tol+' min : '+j.aVerifier:'détail journalier ROMI1 absent')+
      row('Écart expliqué par les journées comparées','<span data-k="ex">'+(j.ecartExplique==null?'—':sgn(j.ecartExplique))+'</span>')+
      row('Écart restant à analyser','<span data-k="rest">'+(j.ecartRestant==null?'—':sgn(j.ecartRestant))+'</span>')+'</div>';
    if(!j.disponible){
      h+='<div class="mh37c-note" data-detail="absent"><b>Écart non localisé faute de détail journalier ROMI1.</b> Le relevé ROMI1 ne contient que les totaux de la période : l’écart ne peut pas encore être localisé jour par jour. Aucune cause n’est déduite (absence, CP, pause, saisie ou relevé).</div>';
      return h;
    }
    const shown=j.lignes.filter(l=>!(l.statut==='concordant'&&!l.mh.presence&&!(l.romi&&l.romi.presence)));
    const hidden=j.lignes.length-shown.length;
    const side=(lab,x)=>{if(!x)return '';const p=[];if(x.debut||x.fin)p.push((x.debut||'?')+'–'+(x.fin||'?'));
      if(x.pauses&&x.pauses.length)p.push('pause '+x.pauses.join(', '));else if(x.pauseMin!=null&&(x.presence||x.pauseMin))p.push('pause '+F(x.pauseMin));
      return p.length?'<i>'+lab+' '+esc(p.join(' · '))+'</i>':''};
    h+='<details class="mh37c-days"><summary>Détail journalier · '+shown.length+' jour'+(shown.length>1?'s':'')+'</summary>'+
      '<div class="mh37c-dh"><span>Date</span><span>MesHeures</span><span>ROMI1</span><span>Écart</span></div>'+
      shown.map(l=>{const tone=l.statut==='concordant'?'ok':l.statut==='a_verifier'?'warn':'mut';
        const mh=l.mh.saisie?(l.mh.presence?hm(l.mh.tte):'0h00'):'—',ro=l.romi&&l.romi.tte!=null?hm(l.romi.tte):'—';
        const sub=l.statut==='non_comparable'?'<i>Non comparable — donnée manquante ('+esc(l.motif)+')</i>':side('MesHeures',l.mh)+side('ROMI1',l.romi);
        return '<div class="mh37c-dr" data-statut="'+l.statut+'" data-date="'+l.date+'"><span>'+wd(l.date)+' '+dShort(l.date)+'</span><span>'+mh+'</span><span>'+ro+'</span><b data-tone="'+tone+'">'+(l.diff==null?'—':sgn(l.diff))+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</div>'}).join('')+
      (hidden?'<div class="mh37c-note">'+hidden+' jour'+(hidden>1?'s':'')+' sans travail des deux côtés non affiché'+(hidden>1?'s':'')+'.</div>':'')+'</details>';
    return h;
  }

  /* V37.1 : plage « Nuit » du réglage paie (moteur), distincte de la période de nuit de l'article 9. */
  function plageNuit(){const S=(typeof DB!=='undefined'&&DB&&DB.s)||{};return String(S.nuitDeb||'21:00').replace(':','h')+' → '+String(S.nuitFin||'06:00').replace(':','h')}
  const STATUT9={etabli:'travailleur de nuit',indice:'critère hebdomadaire à confirmer',non:'non travailleur de nuit',non_determinable:'statut non déterminable'};
  function nuit9Row(n){
    if(!n)return '';
    return row('Nuit art. 9 (22h → 5h)','<span data-k="nuit9">'+hm(n.amplitude)+'</span>','amplitude de nuit · cumul '+n.annee+' : <span data-k="nuit9an">'+hm(n.cumul)+'</span> / '+hm(n.seuil)+' · <span data-k="nuit9st">'+STATUT9[n.statut]+'</span>'+
      (n.repos?' · repos '+n.repos.pourcentage+' % : '+hm(n.repos.heures)+' (à confirmer)':''));
  }
  function html(opts){
    const c=data(opts),p=c.periode,a=c.autres,r=c.romi;
    let h='<div class="mh31-card mh37c" id="mh37Compteur">'+
      '<div class="mh31-card-head"><div><span class="mh31-eyebrow">COMPTEUR HEURES</span><b>'+dShort(p.debut)+' → '+dFr(p.fin)+'</b></div>'+
      '<span class="mh31-pill" data-tone="'+(p.enCours?'info':'mut')+'" data-k="statut">relevé '+(window.MHPeriode?window.MHPeriode.statut(p.debut,p.fin,opts&&opts.today):p.enCours?'en cours':'antérieur')+'</span></div>'+
      '<div class="mh37c-nav"><button class="g" onclick="MHCompteur.go(-1)" aria-label="Relevé précédent">‹</button>'+
      (p.actuelle?'<span>Relevé actuel</span>':'<button class="g" onclick="MHCompteur.go(0)">Relevé actuel</button>')+
      '<button class="g" onclick="MHCompteur.go(1)" aria-label="Relevé suivant">›</button></div>';
    if(c.vide){
      h+='<div class="mh31-note">Aucune journée saisie sur ce relevé. Aucune valeur n’est affichée.</div>';
      return h+'</div>';
    }
    h+='<div class="mh37c-sec"><span class="mh31-eyebrow">TEMPS DE TRAVAIL</span>'+
        row('TTE','<span data-k="tte">'+hm(c.travail.tte)+'</span>',c.travail.jours+' jour'+(c.travail.jours>1?'s':'')+' travaillé'+(c.travail.jours>1?'s':''))+
        row('Amplitude','<span data-k="amp">'+hm(c.travail.amp)+'</span>')+'</div>'+
      '<div class="mh37c-sec"><span class="mh31-eyebrow">HEURES SUPPLÉMENTAIRES</span>'+
        row('HS 25 %','<span data-k="h25">'+hm(c.hs.h25)+'</span>')+row('HS 50 %','<span data-k="h50">'+hm(c.hs.h50)+'</span>')+
        row('Total HS','<span data-k="hs">'+hm(c.hs.total)+'</span>','calculées par quatorzaine · base HS '+hm(c.hs.base)+' (TTE + CP)')+'</div>'+
      '<div class="mh37c-sec"><span class="mh31-eyebrow">AUTRES TEMPS</span>'+
        row('Nuit','<span data-k="nuit">'+hm(a.nuit)+'</span>',c.nuit9?'réglage paie '+esc(plageNuit())+'':'')+nuit9Row(c.nuit9)+row('IDAJ','<span data-k="idaj">'+hm(a.idaj)+'</span>')+
        row('Habillage','<span data-k="hab">'+hm(a.hab)+'</span>')+
        row('CP','<span data-k="cp">'+(a.cpJours?a.cpJours+' j · '+hm(a.cpMin):'aucun')+'</span>',a.cpJours?'valorisés dans la base HS':'')+
        (a.rcJours?row('RC pris',a.rcJours+' j · '+hm(a.rcMin)):'')+
        row('Paniers','<span data-k="pan">'+a.ir+' IR · '+a.iru+' IRU</span>')+'</div>';
    /* Lecture par quatorzaine */
    h+='<details class="mh37c-q"><summary><span>Lecture par quatorzaine</span><b data-tone="mut">'+c.quatorzaines.length+' quatorzaines</b></summary><div class="mh37c-qt">'+
      '<div class="mh37c-qh"><span>Quatorzaine</span><span>TTE</span><span>Base HS</span><span>HS 25</span><span>HS 50</span></div>'+
      c.quatorzaines.map((q,i)=>'<div class="mh37c-qr" data-q="'+(i+1)+'"><span><b>Q'+(i+1)+'</b> '+dShort(q.debut)+' → '+dShort(q.fin)+
        (q.cpJours?'<small>'+q.cpJours+' CP · '+hm(q.cpMin)+'</small>':'')+'</span><span>'+hm(q.tte)+'</span><span>'+hm(q.base)+'</span><span>'+hm(q.h25)+'</span><span>'+hm(q.h50)+'</span></div>').join('')+
      '<div class="mh37c-qr mh37c-tot"><span><b>Total</b></span><span>'+hm(c.travail.tte)+'</span><span>'+hm(c.hs.base)+'</span><span>'+hm(c.hs.h25)+'</span><span>'+hm(c.hs.h50)+'</span></div>'+
      '</div><div class="mh37c-note">HS calculées quatorzaine par quatorzaine par le moteur de paie (au-delà de '+c.seuils.h25+' h, puis de '+c.seuils.h50+' h de base HS).</div></details>';
    /* V37.0-E-r1 : ROMI1, déjà payé et reste à contrôler repliés ; le titre de chaque volet garde l'essentiel. */
    const fold=(key,label,resume,tone,body)=>'<details class="mh37c-q mh37c-fold" data-fold="'+key+'"><summary><span>'+label+'</span><b data-tone="'+tone+'">'+resume+'</b></summary><div class="mh37c-body">'+body+'</div></details>';
    /* Comparaison : MesHeures et référence employeur, jamais mélangées */
    let romiBody,romiRes,romiTone;
    if(r.statut==='comparable'||r.statut==='partiel'){
      romiRes=r.statut==='partiel'?'partiel'+(r.aVerifier?' · écart '+hm(r.ecartTte)+' ⚠️':''):r.aVerifier?'écart '+hm(r.ecartTte)+' ⚠️':r.ecartTte==null?'TTE ROMI1 absent':'concordant ✓';
      romiTone=r.aVerifier?'warn':r.statut==='partiel'||r.ecartTte==null?'mut':'ok';
      romiBody=romiDetail(r);
    }else if(r.statut==='non_comparable'){romiRes='non comparable';romiTone='mut';romiBody='<div class="mh37c-note" data-romi="non_comparable"><b>Non comparable</b><br>Périodes différentes : relevé'+(r.releves.length>1?'s':'')+' du '+r.releves.map(x=>dShort(x.debut)+' au '+dShort(x.fin)).join(', ')+'. Aucun écart n’est calculé.</div>'}
    else if(r.statut==='indisponible'){romiRes='indisponible';romiTone='mut';romiBody='<div class="mh37c-note" data-romi="indisponible">Module de rapprochement ROMI1 indisponible.</div>'}
    else{romiRes='pas de relevé';romiTone='mut';romiBody='<div class="mh37c-note" data-romi="absent">Pas de relevé ROMI1 disponible.</div>'}
    h+=fold('romi','Comparaison ROMI1',romiRes,romiTone,romiBody);
    /* Déjà payé : uniquement ce qui est renseigné */
    const s=c.paye.saisie,b=c.paye.bulletin,e=r.statut==='comparable'?r.employeur:null;
    const paid=[];
    if(s&&(s.h25!=null||s.h50!=null))paid.push(row('HS payées (saisie Paie)',hm(s.h25)+' · '+hm(s.h50),'HS 25 % · HS 50 %'));
    if(e&&(e.hs125Payees!=null||e.hs150Payees!=null))paid.push(row('HS payées (ROMI1)',hm(e.hs125Payees)+' · '+hm(e.hs150Payees),'125 % · 150 %'+(e.hs125Rc!=null||e.hs150Rc!=null?' · en RC '+hm(e.hs125Rc)+' · '+hm(e.hs150Rc):'')));
    if(b)paid.push(row('Bulletin '+esc(mFr(b.mois)),hm(b.h25)+' · '+hm(b.h50),'HS 25 % · HS 50 % · rattachement à confirmer'));
    h+=fold('paye','Déjà payé',paid.length?paid.length+' source'+(paid.length>1?'s':''):'non renseigné','mut',
      paid.length?paid.join(''):'<div class="mh37c-note">Aucun paiement renseigné pour ce relevé.</div>');
    /* Reste à contrôler : le niveau le plus élevé colore le titre */
    const worst=c.controle.some(x=>x.niveau==='bad')?'bad':c.controle.some(x=>x.niveau==='warn')?'warn':c.controle.length?'mut':'ok';
    h+=fold('controle','Reste à contrôler',c.controle.length?c.controle.length+' point'+(c.controle.length>1?'s':''):'rien à signaler',worst,
      c.controle.length?'<ul class="mh37c-todo">'+c.controle.map(x=>'<li data-tone="'+x.niveau+'">'+esc(x.texte)+'</li>').join('')+'</ul>':'<div class="mh37c-note">Rien à signaler sur ce relevé.</div>');
    /* Paie : affichée telle que l'écran Paie la calcule */
    if(c.paie)h+='<div class="mh31-quat-pay"><span>Brut estimé (écran Paie, '+dShort(c.paie.debut)+' → '+dShort(c.paie.fin)+')'+(c.paie.memePeriode?'':' · autre période')+'</span><b>'+eur(c.paie.brut)+'</b></div>';
    h+='<button class="mh31-link" onclick="tab(\'paie\')">Voir le calcul de paie <em>→</em></button>'+
      (c.periodePaie&&!c.periodePaie.meme?'<div class="mh31-note" data-k="autrePaie">L’écran Paie porte sur une autre période : '+dShort(c.periodePaie.debut)+' → '+dFr(c.periodePaie.fin)+'.</div>':'')+
      '<div class="mh31-note">Lecture indicative des calculs MesHeures. Mois de paie : '+esc(mFr(p.moisPaie))+' (rattachement à confirmer). Quatorzaines ancrées au '+dFr(p.ancre)+'.</div>';
    return h+'</div>';
  }

  function go(step){
    const now=today(),cur=selected||defaultStart(now);
    selected=step===0?mhQuatorzaine.payPeriod(now).start:addD(cur,step*28);
    try{if(window.MH31&&typeof window.MH31.renderHome==='function')window.MH31.renderHome()}catch(e){console.warn('Compteur heures',e)}
    try{const el=document.getElementById('mh37Compteur');if(el&&el.scrollIntoView)el.scrollIntoView({block:'start'})}catch(e){}
  }

  window.MHCompteur={version:V,data,html,go};
})();
