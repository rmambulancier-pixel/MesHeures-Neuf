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
  const ROMI_TOL=15; // minutes : même tolérance que le Smart Control (écart TTE ROMI1)
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

  function romiFor(ps,pe,G){
    let list=[];
    try{if(window.MH_ROMI&&typeof window.MH_ROMI.list==='function')list=(window.MH_ROMI.list()||[]).filter(x=>x&&isoDay(x.periodStart)&&isoDay(x.periodEnd))}catch(e){list=[]}
    const same=list.find(x=>x.periodStart===ps&&x.periodEnd===pe);
    if(same){
      const tteR=hDec(same.ttePeriodH),ecart=tteR==null?null:G.tte-tteR;
      return {statut:'comparable',debut:ps,fin:pe,
        mesheures:{tte:G.tte,hs:G.h25+G.h50,jours:G.trav},
        employeur:{tte:tteR,hs:hDec(same.hsPeriodH),presence:num(same.presenceDays)?Number(same.presenceDays):null,
          hs125Payees:hDec(same.hs125PaidH),hs125Rc:hDec(same.hs125ToRcH),hs150Payees:hDec(same.hs150PaidH),hs150Rc:hDec(same.hs150ToRcH),rcCumul:hDec(same.rcBalanceH)},
        ecartTte:ecart,aVerifier:ecart!=null&&Math.abs(ecart)>ROMI_TOL};
    }
    const overlap=list.filter(x=>x.periodStart<=pe&&x.periodEnd>=ps).sort((a,b)=>String(a.periodStart).localeCompare(String(b.periodStart)));
    if(overlap.length)return {statut:'non_comparable',releves:overlap.map(x=>({debut:x.periodStart,fin:x.periodEnd}))};
    return {statut:'absent'};
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
    const romi=romiFor(ps,pe,G);
    const alertes={critiques:R.AL.filter(a=>a.lvl==='b').length,aVerifier:R.AL.filter(a=>a.lvl!=='b').length};
    const controle=[];
    if(romi.statut==='comparable'&&romi.aVerifier)controle.push({niveau:'warn',texte:'Écart TTE avec le relevé ROMI1 : '+hm(romi.ecartTte)+'. Écart à analyser.'});
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
      quatorzaines,romi,alertes,controle,
      seuils:{h25:num(DB.s&&DB.s.base)?Number(DB.s.base)*2:NR,h50:num(DB.s&&DB.s.base)&&num(DB.s.pl)?Number(DB.s.base)*2+Number(DB.s.pl):NR},
      paye:{saisie:bul?{h25:num(bul.p25)?Math.round(Number(bul.p25)*60):null,h50:num(bul.p50)?Math.round(Number(bul.p50)*60):null}:null,
        bulletin:bulletin?{mois:bulletin.mois,h25:hDec(bulletin.hs25H),h50:hDec(bulletin.hs50H),ir:num(bulletin.irN)?Number(bulletin.irN):null,iru:num(bulletin.iruN)?Number(bulletin.iruN):null}:null},
      paie:paie?{brut:paie.grossEst,netEst:paie.netEst,debut:paie.start,fin:addD(paie.start,paie.nb*14-1),memePeriode:paie.start===ps&&paie.nb===2}:null
    };
  }

  /* ---------- rendu (bloc de l'Accueil) ---------- */
  const row=(label,value,sub)=>'<div class="mh37c-row"><span>'+label+(sub?'<small>'+sub+'</small>':'')+'</span><b>'+value+'</b></div>';
  function html(opts){
    const c=data(opts),p=c.periode,a=c.autres,r=c.romi;
    let h='<div class="mh31-card mh37c" id="mh37Compteur">'+
      '<div class="mh31-card-head"><div><span class="mh31-eyebrow">COMPTEUR HEURES</span><b>'+dShort(p.debut)+' → '+dFr(p.fin)+'</b></div>'+
      '<span class="mh31-pill" data-tone="mut">'+(p.enCours?'en cours':'relevé de 4 semaines')+'</span></div>'+
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
        row('Nuit','<span data-k="nuit">'+hm(a.nuit)+'</span>')+row('IDAJ','<span data-k="idaj">'+hm(a.idaj)+'</span>')+
        row('Habillage','<span data-k="hab">'+hm(a.hab)+'</span>')+
        row('CP','<span data-k="cp">'+(a.cpJours?a.cpJours+' j · '+hm(a.cpMin):'aucun')+'</span>',a.cpJours?'valorisés dans la base HS':'')+
        (a.rcJours?row('RC pris',a.rcJours+' j · '+hm(a.rcMin)):'')+
        row('Paniers','<span data-k="pan">'+a.ir+' IR · '+a.iru+' IRU</span>')+'</div>';
    /* Lecture par quatorzaine */
    h+='<details class="mh37c-q"><summary>Lecture par quatorzaine</summary><div class="mh37c-qt">'+
      '<div class="mh37c-qh"><span>Quatorzaine</span><span>TTE</span><span>Base HS</span><span>HS 25</span><span>HS 50</span></div>'+
      c.quatorzaines.map((q,i)=>'<div class="mh37c-qr" data-q="'+(i+1)+'"><span><b>Q'+(i+1)+'</b> '+dShort(q.debut)+' → '+dShort(q.fin)+
        (q.cpJours?'<small>'+q.cpJours+' CP · '+hm(q.cpMin)+'</small>':'')+'</span><span>'+hm(q.tte)+'</span><span>'+hm(q.base)+'</span><span>'+hm(q.h25)+'</span><span>'+hm(q.h50)+'</span></div>').join('')+
      '<div class="mh37c-qr mh37c-tot"><span><b>Total</b></span><span>'+hm(c.travail.tte)+'</span><span>'+hm(c.hs.base)+'</span><span>'+hm(c.hs.h25)+'</span><span>'+hm(c.hs.h50)+'</span></div>'+
      '</div><div class="mh31-note">HS calculées quatorzaine par quatorzaine par le moteur de paie (au-delà de '+c.seuils.h25+' h, puis de '+c.seuils.h50+' h de base HS).</div></details>';
    /* Comparaison : MesHeures et référence employeur, jamais mélangées */
    h+='<div class="mh37c-sec"><span class="mh31-eyebrow">COMPARAISON ROMI1</span>';
    if(r.statut==='absent')h+='<div class="mh31-note" data-romi="absent">Pas de relevé ROMI1 disponible.</div>';
    else if(r.statut==='non_comparable')h+='<div class="mh31-note" data-romi="non_comparable">Non comparable : relevé'+(r.releves.length>1?'s':'')+' du '+r.releves.map(x=>dShort(x.debut)+' au '+dShort(x.fin)).join(', ')+' (périodes différentes).</div>';
    else{
      h+='<div class="mh37c-cmp" data-romi="comparable"><div><span>MesHeures</span><b>'+hm(r.mesheures.tte)+'</b><small>HS '+hm(r.mesheures.hs)+' · '+r.mesheures.jours+' j</small></div>'+
        '<div><span>ROMI1 (employeur)</span><b>'+hm(r.employeur.tte)+'</b><small>HS '+hm(r.employeur.hs)+' · '+(r.employeur.presence!=null?r.employeur.presence+' j':'présence —')+'</small></div>'+
        '<div data-tone="'+(r.aVerifier?'warn':'ok')+'"><span>Écart TTE</span><b>'+hm(r.ecartTte)+'</b><small>'+(r.aVerifier?'⚠️ À vérifier · écart à analyser':'✓ concordant (±'+ROMI_TOL+' min)')+'</small></div></div>';
    }
    h+='</div>';
    /* Déjà payé : uniquement ce qui est renseigné */
    const s=c.paye.saisie,b=c.paye.bulletin,e=r.statut==='comparable'?r.employeur:null;
    const paid=[];
    if(s&&(s.h25!=null||s.h50!=null))paid.push(row('HS payées (saisie Paie)',hm(s.h25)+' · '+hm(s.h50),'HS 25 % · HS 50 %'));
    if(e&&(e.hs125Payees!=null||e.hs150Payees!=null))paid.push(row('HS payées (ROMI1)',hm(e.hs125Payees)+' · '+hm(e.hs150Payees),'125 % · 150 %'+(e.hs125Rc!=null||e.hs150Rc!=null?' · en RC '+hm(e.hs125Rc)+' · '+hm(e.hs150Rc):'')));
    if(b)paid.push(row('Bulletin '+esc(mFr(b.mois)),hm(b.h25)+' · '+hm(b.h50),'HS 25 % · HS 50 % · rattachement à confirmer'));
    h+='<div class="mh37c-sec"><span class="mh31-eyebrow">DÉJÀ PAYÉ</span>'+(paid.length?paid.join(''):'<div class="mh31-note">Aucun paiement renseigné pour ce relevé.</div>')+'</div>';
    /* Reste à contrôler */
    h+='<div class="mh37c-sec"><span class="mh31-eyebrow">RESTE À CONTRÔLER</span>'+(c.controle.length?'<ul class="mh37c-todo">'+c.controle.map(x=>'<li data-tone="'+x.niveau+'">'+esc(x.texte)+'</li>').join('')+'</ul>':'<div class="mh31-note">Rien à signaler sur ce relevé.</div>')+'</div>';
    /* Paie : affichée telle que l'écran Paie la calcule */
    if(c.paie)h+='<div class="mh31-quat-pay"><span>Brut estimé (écran Paie, '+dShort(c.paie.debut)+' → '+dShort(c.paie.fin)+')'+(c.paie.memePeriode?'':' · autre période')+'</span><b>'+eur(c.paie.brut)+'</b></div>';
    h+='<button class="mh31-link" onclick="tab(\'paie\')">Voir le calcul de paie <em>→</em></button>'+
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
