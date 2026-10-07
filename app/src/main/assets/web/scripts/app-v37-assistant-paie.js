/*
 * MesHeures V37.0-G — Assistant Paie (remplace l'affichage de l'« Assistant paie V33 » dans l'onglet Paie).
 *
 * Orchestrateur de lecture, aucun moteur propre :
 *  - période : celle de l'écran Paie (mhCurrentPaySummary : DB.per, 2 ou 3 quatorzaines) ;
 *  - heures et brut : calcPer() + brutOf() (lignes du brut, net, IR, IRU) ; quatorzaines : calcPer(q, 1) ;
 *  - ROMI1 : MHRomiRecon (lot F) ; déjà payé : saisie Paie (DB.bul, lu sans gb()), ROMI1, bulletin rattaché ;
 *  - mois de paie : mhQuatorzaine.payMonth, présenté comme hypothèse à confirmer.
 * Simulation : brutOf() appliqué à une COPIE des totaux (HS 25 %, HS 50 %, IR, IRU), jamais aux données réelles.
 * Aucune écriture dans DB ni dans le stockage. Une valeur indisponible est dite indisponible.
 */
(function(){
  'use strict';
  const V='37.0-G';
  const TOL=15;
  const WORK=['T','NUIT'];
  const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const isoDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(String(k||''));
  const num=v=>v!==null&&v!==''&&v!==undefined&&typeof v!=='boolean'&&Number.isFinite(Number(v));
  const hm=m=>num(m)?(Number(m)<0?'−':'')+F(Math.abs(Math.round(Number(m)))):'—';
  const sgnHm=m=>num(m)?(m>0?'+':m<0?'−':'±')+F(Math.abs(Math.round(m))):'—';
  const hDec=h=>num(h)?Math.round(Number(h)*60):null;
  const eur=n=>num(n)?(Number(n)<0?'−':'')+Math.abs(Number(n)).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' €':'—';
  const sgnEur=n=>num(n)?(n>0?'+':n<0?'−':'±')+eur(Math.abs(n)):'—';
  const dShort=k=>isoDay(k)?k.slice(8)+'/'+k.slice(5,7):'—';
  const dFr=k=>isoDay(k)?k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4):'—';
  const mFr=ym=>/^\d{4}-\d{2}$/.test(String(ym||''))?MONTHS[+ym.slice(5,7)-1]+' '+ym.slice(0,4):'—';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const D=()=>(typeof DB!=='undefined'&&DB&&typeof DB==='object')?DB:{};
  const clone=o=>JSON.parse(JSON.stringify(o));
  const frNum=s=>esc(s).replace(/(\d)\.(\d)/g,'$1,$2');   // libellés du moteur : décimales à la française (affichage seul)
  const ICON={ok:'🟢',warn:'🟠',bad:'🔴',na:'⚪'};

  /* ---------- période et moteur ---------- */
  function period(opts){
    if(opts&&isoDay(opts.start))return {start:opts.start,nb:Math.max(2,Math.min(3,Math.round(Number(opts.nb)||2)))};
    let p=null;try{if(typeof window.mhCurrentPaySummary==='function')p=window.mhCurrentPaySummary()}catch(e){p=null}
    if(p&&isoDay(p.start))return {start:p.start,nb:p.nb};
    return {start:mhQuatorzaine.payPeriod(today()).start,nb:2};
  }
  function counts(ps,pe){
    const days=D().days||{},c={T:0,NUIT:0,CP:0,RC:0,MAL:0,autres:0,saisies:0};
    Object.keys(days).forEach(k=>{if(!isoDay(k)||k<ps||k>pe)return;const t=days[k]&&days[k].t;c.saisies++;if(t in c)c[t]++;else if(t&&t!=='REPOS')c.autres++});
    return c;
  }
  function snapshot(ps,nb){
    const pe=addD(ps,nb*14-1),R=calcPer(ps,nb),G=R.G,B=brutOf(G);
    const Q=R.Q.map(q=>{const g=calcPer(q.start,1).G;return {debut:q.start,fin:addD(q.start,13),tte:q.tte,base:q.seuil,nor:q.nor,h25:q.h25,h50:q.h50,jours:q.trav,
      cpMin:q.seuil-q.tte,nuit:g.nuit,idaj:g.idaj,hab:g.hab,ir:g.ir,iru:g.iru,rc:g.rc,fer:g.fer}});
    return {debut:ps,fin:pe,nb,R,G,B,Q,c:counts(ps,pe)};
  }

  /* ---------- contrôles du bulletin (déterministes) ---------- */
  function paidInfo(ps,romi){
    const x=D(),out=[];
    const bul=x.bul&&x.bul[ps];
    if(bul&&(num(bul.p25)||num(bul.p50)))out.push({source:'saisie Paie',h25:num(bul.p25)?Math.round(Number(bul.p25)*60):null,h50:num(bul.p50)?Math.round(Number(bul.p50)*60):null});
    const b=(Array.isArray(x.bulletins)?x.bulletins:[]).find(v=>v&&v.mois===mhQuatorzaine.payMonth(ps));
    if(b&&(num(b.hs25H)||num(b.hs50H)))out.push({source:'bulletin '+mFr(b.mois)+' (rattachement à confirmer)',h25:hDec(b.hs25H),h50:hDec(b.hs50H)});
    if(romi&&romi.statut==='comparable'){const e=romi.employeur;
      if(e.hs125Payees!=null||e.hs150Payees!=null)out.push({source:'ROMI1 (payées + en RC)',h25:(e.hs125Payees||0)+(e.hs125Rc||0),h50:(e.hs150Payees||0)+(e.hs150Rc||0)})}
    return out;
  }
  function checks(s,romi,paid,now){
    const G=s.G,AL=s.R.AL||[],L=[];
    const worked=G.trav>0,enCours=s.fin>=now;
    const incompl=AL.filter(a=>/Horaires incomplets/.test(a.m||'')).map(a=>a.k);
    const add=(key,titre,niveau,texte,source,cible,impact)=>L.push({key,titre,niveau,texte,source,cible,impact});
    add('saisie','Saisie des journées',!s.c.saisies?'na':incompl.length?'bad':'ok',
      !s.c.saisies?'Aucune journée saisie sur la période.':incompl.length?incompl.length+' journée(s) de travail sans début ou fin : '+incompl.map(dShort).join(', ')+'.':'Toutes les journées de travail ont un début et une fin.',
      'journées saisies (moteur)',incompl.length?'jour:'+incompl[0]:'jour',incompl.length?'important':'aucun');
    const prov=incompl.length?'provisoire tant que la saisie est incomplète':enCours?'relevé en cours : valeur provisoire':null;
    add('tte','TTE',!worked?'na':prov?'warn':'ok',!worked?'Aucune journée travaillée.':'TTE '+hm(G.tte)+' calculé par le moteur sur '+G.trav+' jour(s)'+(prov?' · '+prov:'')+'.','moteur TTE (calcPer)','compteur',prov?'possible':'aucun');
    add('hs25','HS 25 %',!worked?'na':prov?'warn':'ok',!worked?'Aucune journée travaillée.':hm(G.h25)+' calculées par quatorzaine'+(prov?' · '+prov:'')+'.','moteur HS / quatorzaine','compteur',prov?'possible':'aucun');
    add('hs50','HS 50 %',!worked?'na':prov?'warn':'ok',!worked?'Aucune journée travaillée.':hm(G.h50)+' calculées par quatorzaine'+(prov?' · '+prov:'')+'.','moteur HS / quatorzaine','compteur',prov?'possible':'aucun');
    const cpMin=G.seuil-G.tte;
    add('cp','CP',s.c.CP?'warn':s.c.saisies?'ok':'na',s.c.CP?s.c.CP+' jour(s) de CP valorisés '+hm(cpMin)+' selon le réglage (1 jour = '+hm(D().s&&D().s.cp)+'), à confirmer sur le bulletin.':'Aucun CP sur la période.','moteur CP (réglage « durée d’un CP »)','paie',s.c.CP?'possible':'aucun');
    const repasW=AL.filter(a=>/Repas déclaré, mais/.test(a.m||'')).map(a=>a.k);
    add('paniers','Paniers',!worked?'na':repasW.length?'warn':'ok',!worked?'Aucune journée travaillée.':G.ir+' IR · '+G.iru+' IRU (choix repas de la journée)'+(repasW.length?' · '+repasW.length+' repas déclaré(s) hors plage : '+repasW.map(dShort).join(', '):'')+'.','moteur paniers','jour:'+(repasW[0]||''),repasW.length?'possible':'aucun');
    const maj=Number(D().s&&D().s.nuitMaj)||0;
    add('nuit','Heures de nuit',!worked?'na':'ok',!worked?'Aucune journée travaillée.':hm(G.nuit)+' de nuit'+(maj?' · majoration '+maj+' %':' · majoration 0 % : aucune ligne de paie')+'.','moteur nuit','compteur','aucun');
    add('idaj','IDAJ',!worked?'na':'ok',!worked?'Aucune journée travaillée.':hm(G.idaj)+' d’amplitude au-delà de '+(D().s&&D().s.idaj)+' h.','moteur IDAJ','compteur','aucun');
    add('habillage','Habillage',!worked?'na':'ok',!worked?'Aucune journée travaillée.':hm(G.hab)+' ('+G.trav+' jour(s) × '+(D().s&&D().s.hab)+' min).','moteur habillage','compteur','aucun');
    let rN,rT,rI;
    if(!romi||romi.statut==='absent'){rN='na';rT='Pas de relevé ROMI1 disponible.';rI='aucun'}
    else if(romi.statut==='non_comparable'){rN='na';rT='Relevé ROMI1 sur une autre période : non comparable.';rI='aucun'}
    else if(romi.statut==='partiel'){rN='warn';rT='Relevé ROMI1 partiel — comparaison limitée'+(romi.ecartTte!=null?' · écart '+sgnHm(romi.ecartTte):'')+'.';rI='à déterminer'}
    else if(romi.ecartTte==null){rN='na';rT='TTE ROMI1 absent du relevé.';rI='aucun'}
    else if(romi.aVerifier){rN='warn';rT='Écart ROMI1 '+hm(Math.abs(romi.ecartTte))+' (MesHeures '+hm(romi.mesheures.tte)+' · ROMI1 '+hm(romi.employeur.tte)+') : à vérifier — écart à analyser.';rI='à déterminer'}
    else{rN='ok';rT='MesHeures et ROMI1 concordants (écart '+sgnHm(romi.ecartTte)+', tolérance ±'+TOL+' min).';rI='aucun'}
    add('romi','ROMI1',rN,rT,'rapprochement ROMI1 (lot F)','romi',rI);
    const hs=G.h25+G.h50;
    if(!worked)add('hsPayees','HS payées','na','Aucune journée travaillée.','saisie Paie · ROMI1 · bulletin','paie','aucun');
    else if(!hs)add('hsPayees','HS payées','ok','Aucune HS calculée sur la période.','moteur HS','paie','aucun');
    else if(!paid.length)add('hsPayees','HS payées','bad','HS payées non renseignées : '+hm(hs)+' d’HS calculées, aucun paiement saisi, importé ou relevé.','saisie Paie · ROMI1 · bulletin','paie','important');
    else{const p=paid[0],d25=p.h25==null?null:G.h25-p.h25,d50=p.h50==null?null:G.h50-p.h50,off=[d25,d50].some(d=>d==null||Math.abs(d)>TOL);
      add('hsPayees','HS payées',off?'warn':'ok',(off?'Écart entre HS calculées et HS payées':'HS payées conformes au calcul')+' ('+p.source+') : HS 25 % '+sgnHm(d25)+' · HS 50 % '+sgnHm(d50)+'.','HS payées ('+p.source+')','paie',off?'important':'aucun')}
    const regl=AL.filter(a=>a.lvl==='b'&&!/Horaires incomplets/.test(a.m||'')).length;
    add('reglementaire','Alertes réglementaires',!worked?'na':regl?'warn':'ok',!worked?'Aucune journée travaillée.':regl?regl+' alerte(s) critique(s) sur le relevé (voir Audit). Sans effet calculé sur le brut.':'Aucune alerte critique sur le relevé.','moteur (alertes de période) · Audit','audit','aucun effet calculé');
    return L;
  }

  /* ---------- données de l'assistant ---------- */
  let simState=null;          // {h25,h50,ir,iru} en écarts, ou null hors simulation
  const openSet=new Set();
  function data(opts){
    opts=opts||{};
    const now=opts.today||today(),P=period(opts),s=snapshot(P.start,P.nb),G=s.G,B=s.B;
    let romi=null;try{if(window.MHRomiRecon)romi=window.MHRomiRecon.analyze({start:s.debut,end:s.fin})}catch(e){romi=null}
    const paid=paidInfo(s.debut,romi),L=checks(s,romi,paid,now);
    const n={ok:0,warn:0,bad:0,na:0};L.forEach(x=>n[x.niveau]++);
    const evalues=n.ok+n.warn+n.bad,insuff=!G.trav;
    const score=insuff||!evalues?null:Math.round(n.ok/evalues*100);
    const verdict=insuff?{niveau:'na',texte:'DONNÉES INSUFFISANTES'}:n.bad?{niveau:'bad',texte:'BULLETIN BLOQUÉ'}:n.warn?{niveau:'warn',texte:'BULLETIN À VÉRIFIER'}:{niveau:'ok',texte:'BULLETIN PRÊT À CONTRÔLER'};
    const coef=Number(D().s&&D().s.net);
    /* Relevé précédent : même nombre de quatorzaines juste avant */
    const pst=addD(s.debut,-s.nb*14),prevC=counts(pst,addD(s.debut,-1));
    const prev=prevC.saisies?snapshot(pst,s.nb):null;
    return {version:V,periode:{debut:s.debut,fin:s.fin,nb:s.nb,enCours:s.fin>=now,moisPaie:mhQuatorzaine.payMonth(s.debut),moisPaieStatut:'rattachement à confirmer'},
      vide:!s.c.saisies,G,B,Q:s.Q,c:s.c,romi,paid,checks:L,compte:n,score,verdict,
      net:num(coef)&&coef>0?{salaire:B.netSal,total:B.netEst,coef,irExonere:B.panIRExon,iru:B.panIRU}:null,
      precedent:prev?{debut:prev.debut,fin:prev.fin,G:prev.G,B:prev.B,c:prev.c}:null,
      sim:simState?simulate(G,simState):null};
  }
  function simulate(G,st){
    const g=clone(G);                                  // copie : le G du moteur (mis en cache) n'est jamais touché
    g.h25=Math.max(0,g.h25+st.h25);g.h50=Math.max(0,g.h50+st.h50);g.ir=Math.max(0,g.ir+st.ir);g.iru=Math.max(0,g.iru+st.iru);
    const b=brutOf(g),r=brutOf(G);
    return {params:{h25:g.h25,h50:g.h50,ir:g.ir,iru:g.iru},ecarts:{...st},brut:b.tot,net:b.netEst,brutReel:r.tot,netReel:r.netEst,diffBrut:b.tot-r.tot,diffNet:b.netEst-r.netEst};
  }

  /* ---------- explications « Pourquoi ce chiffre ? » ---------- */
  function why(key,c){
    const Q=c.Q,qRows=(f,lab)=>Q.map((q,i)=>'<div class="mh37p-kv"><span>Q'+(i+1)+' · '+dShort(q.debut)+' → '+dShort(q.fin)+'</span><b>'+f(q)+'</b></div>').join('')+'<div class="mh37p-kv mh37p-tot"><span>Total</span><b>'+lab+'</b></div>';
    const S=D().s||{},G=c.G;
    switch(key){
      case 'Heures normales':return qRows(q=>hm(q.nor),hm(G.nor))+'<p>Par quatorzaine : base HS (TTE + CP) plafonnée à '+(Number(S.base)*2)+' h. Base HS du relevé : '+hm(G.seuil)+'.</p>';
      case 'HS 25 %':return qRows(q=>hm(q.h25),hm(G.h25))+'<p>Par quatorzaine : heures de base HS entre '+(Number(S.base)*2)+' h et '+(Number(S.base)*2+Number(S.pl))+' h.</p>';
      case 'HS 50 %':return qRows(q=>hm(q.h50),hm(G.h50))+'<p>Par quatorzaine : heures de base HS au-delà de '+(Number(S.base)*2+Number(S.pl))+' h.</p>';
      case 'Habillage/déshabillage':return qRows(q=>hm(q.hab),hm(G.hab))+'<p>'+G.trav+' jour(s) travaillé(s) × '+S.hab+' min.</p>';
      case 'IDAJ (dépassement amplitude)':return qRows(q=>hm(q.idaj),hm(G.idaj))+'<p>Amplitude journalière au-delà de '+S.idaj+' h.</p>';
      case 'Repos compensateur':return qRows(q=>hm(q.rc),hm(G.rc));
      case 'Majoration fériés 100 %':return qRows(q=>hm(q.fer),hm(G.fer));
      case 'Majoration heures de nuit':return qRows(q=>hm(q.nuit),hm(G.nuit));
      case 'Indemnité de repas IR (part taxable)':return qRows(q=>q.ir+' IR',G.ir+' IR')+'<p>Seule la part taxable de l’IR entre dans le brut ; la part exonérée et l’IRU sont versées hors brut.</p>';
      case "Prime d'ancienneté":return '<p>Ancienneté appréciée au '+dFr(G.end)+' (fin de période), appliquée au brut hors indemnités de repas.</p>';
      case 'TTE':return qRows(q=>hm(q.tte),hm(G.tte));
      case 'CP':return qRows(q=>q.cpMin?hm(q.cpMin):'—',hm(G.seuil-G.tte))+'<p>Valeur d’un jour de CP selon le réglage : '+hm(S.cp)+'. Les CP entrent dans la base HS.</p>';
      case 'Nuit':return qRows(q=>hm(q.nuit),hm(G.nuit));
      default:return '';
    }
  }

  /* ---------- rendu ---------- */
  const det=(id,summary,body,cls)=>'<details class="mh37p-d'+(cls?' '+cls:'')+'" data-open="'+id+'"'+(openSet.has(id)?' open':'')+' ontoggle="MHAssistantPaie.t(this)"><summary>'+summary+'</summary><div class="mh37p-db">'+body+'</div></details>';
  const btn=(t,l)=>'<button class="g mh37p-go" onclick="MHAssistantPaie.go(\''+t+'\')">'+l+'</button>';
  const TARGET={compteur:'Compteur',paie:'Paie',audit:'Audit',romi:'ROMI1',jour:'Saisie',dossier:'Dossier'};
  const linkFor=c=>{if(!c)return '';const t=String(c).split(':')[0];return TARGET[t]?btn(c,'→ '+TARGET[t]):''};
  function html(opts){
    const c=data(opts),p=c.periode,G=c.G,B=c.B,v=c.verdict;
    let h='<div class="mh37p" id="mh37Assistant">';
    /* 1. verdict */
    h+='<div class="mh37p-head"><div><h2>🧠 Assistant Paie</h2><b class="mh37p-mois">Bulletin — '+esc(mFr(p.moisPaie))+'</b>'+
      '<small>Relevé du '+dFr(p.debut)+' au '+dFr(p.fin)+(p.enCours?' · en cours':'')+' · ⚠️ Rattachement à confirmer</small></div></div>'+
      '<div class="mh37p-verdict" data-tone="'+v.niveau+'"><b data-k="verdict">'+ICON[v.niveau]+' '+v.texte+'</b><span data-k="score">'+(c.score==null?'Données insuffisantes':c.score+' % prêt')+'</span></div>'+
      '<div class="mh37p-counts"><span data-tone="bad"><b data-k="nbad">'+c.compte.bad+'</b> bloquant'+(c.compte.bad>1?'s':'')+'</span><span data-tone="warn"><b data-k="nwarn">'+c.compte.warn+'</b> à vérifier</span><span data-tone="ok"><b data-k="nok">'+c.compte.ok+'</b> contrôlé'+(c.compte.ok>1?'s':'')+'</span></div>'+
      (c.score!=null?'<div class="mh37p-note">Score : contrôles conformes / contrôles évalués ('+c.compte.ok+' / '+(c.compte.ok+c.compte.warn+c.compte.bad)+'), '+c.compte.na+' non évalué'+(c.compte.na>1?'s':'')+'. Spécifique au bulletin, distinct du Smart Control.</div>':'');
    if(c.vide)return h+'<div class="mh37p-note">Aucune journée saisie sur ce relevé : aucune estimation n’est affichée.</div>'+tools()+'</div>';
    /* 2. estimation */
    h+='<div class="mh37p-est"><span class="mh37p-eye">💰 ESTIMATION DU BULLETIN</span>'+
      '<div class="mh37p-money"><div><span>Brut estimé</span><b data-k="brut">'+eur(B.tot)+'</b></div><div><span>Net estimé</span><b data-k="net">'+(c.net?eur(c.net.total):'Net non disponible')+'</b></div></div>'+
      (c.net?'<small>Net : brut × '+String(c.net.coef).replace('.',',')+' (coefficient configuré) = '+eur(c.net.salaire)+', + IR exonéré '+eur(c.net.irExonere)+' + IRU '+eur(c.net.iru)+'.</small>':'<small>Coefficient brut → net non configuré.</small>')+
      '<small>Période '+dFr(p.debut)+' → '+dFr(p.fin)+'. <b>Estimation — ne constitue pas un bulletin de salaire.</b></small></div>';
    /* 3. anomalies (bloquants et à vérifier visibles) */
    const top=c.checks.filter(x=>x.niveau==='bad'||x.niveau==='warn').sort((a,b)=>(a.niveau==='bad'?0:1)-(b.niveau==='bad'?0:1));
    h+='<div class="mh37p-sec"><span class="mh37p-eye">🚨 POINTS À TRAITER</span>'+(top.length?top.map(x=>'<div class="mh37p-item" data-tone="'+x.niveau+'" data-key="'+x.key+'"><div><b>'+ICON[x.niveau]+' '+esc(x.titre)+'</b><small>'+esc(x.texte)+'</small><i>Source : '+esc(x.source)+'</i></div>'+linkFor(x.cible)+'</div>').join(''):'<div class="mh37p-note">Aucun point bloquant ni à vérifier.</div>')+'</div>';
    /* 4. décomposition du brut */
    const st=key=>{const m={'HS 25 %':'hs25','HS 50 %':'hs50','Habillage/déshabillage':'habillage','IDAJ (dépassement amplitude)':'idaj','Indemnité de repas IR (part taxable)':'paniers','Heures normales':'tte','Majoration heures de nuit':'nuit'}[key];const x=c.checks.find(y=>y.key===m);return x?'<i>État : '+ICON[x.niveau]+' '+(x.niveau==='ok'?'contrôlé':x.niveau==='warn'?'à vérifier':x.niveau==='bad'?'bloquant':'non évalué')+'</i>':''};
    const lines=B.L.map(l=>det('brut:'+l[0],'<span>'+esc(l[0])+'<small>'+frNum(l[1])+' · '+frNum(l[2])+'</small></span><b>'+eur(l[3])+'</b>',
      '<span class="mh37p-eye">Pourquoi '+esc(l[1])+' ?</span>'+(why(l[0],c)||'<p>Ligne du moteur de paie (brutOf).</p>')+'<i>Source : moteur de paie (brutOf)</i>'+st(l[0]),'mh37p-line')).join('');
    const hors=[];
    if(B.panIRExon)hors.push(['IR part exonérée',G.ir+' repas',B.panIRExon]);
    if(B.panIRU)hors.push(['IRU',G.iru+' repas',B.panIRU]);
    const info=[];
    if(G.seuil-G.tte>0)info.push(det('info:CP','<span>CP<small>'+c.c.CP+' j · inclus dans la base HS</small></span><b>'+hm(G.seuil-G.tte)+'</b>',why('CP',c)+st('CP')));
    if(G.nuit&&!(D().s&&Number(D().s.nuitMaj)))info.push(det('info:Nuit','<span>Nuit<small>majoration 0 % : pas de ligne de paie</small></span><b>'+hm(G.nuit)+'</b>',why('Nuit',c)));
    h+='<div class="mh37p-sec"><span class="mh37p-eye">🧾 D’OÙ VIENT MON BRUT ?</span>'+lines+
      '<div class="mh37p-kv mh37p-tot"><span>Brut estimé</span><b>'+eur(B.tot)+'</b></div>'+
      (hors.length?'<div class="mh37p-sub">Versé hors brut (non soumis)</div>'+hors.map(x=>'<div class="mh37p-kv"><span>'+x[0]+' · '+x[1]+'</span><b>'+eur(x[2])+'</b></div>').join(''):'')+
      (info.length?'<div class="mh37p-sub">Sans montant propre</div>'+info.join(''):'')+
      det('why:TTE','<span>TTE<small>'+G.trav+' jour(s) travaillé(s)</small></span><b>'+hm(G.tte)+'</b>',why('TTE',c)+st('Heures normales'),'mh37p-line')+'</div>';
    /* 5. impact potentiel */
    const order={important:0,'à déterminer':1,possible:2,'aucun effet calculé':3,aucun:4};
    const imp=c.checks.filter(x=>x.niveau!=='na').slice().sort((a,b)=>(order[a.impact]??5)-(order[b.impact]??5));
    const hsAmt=B.L.filter(l=>/^HS /.test(l[0])).reduce((s,l)=>s+l[3],0);
    h+=det('impact','<span>💥 Impact potentiel sur le bulletin</span><b data-tone="'+(imp.some(x=>x.impact==='important')?'bad':imp.some(x=>x.impact!=='aucun'&&x.impact!=='aucun effet calculé')?'warn':'ok')+'">'+imp.filter(x=>x.impact!=='aucun'&&x.impact!=='aucun effet calculé').length+'</b>',
      imp.map(x=>'<div class="mh37p-kv" data-tone="'+x.niveau+'"><span>'+ICON[x.niveau]+' '+esc(x.titre)+(x.key==='hsPayees'&&x.niveau!=='ok'&&hsAmt?'<small>HS dans le brut estimé : '+eur(hsAmt)+'</small>':'')+'</span><b>'+
        (x.impact==='aucun'?'Aucun problème détecté':x.impact==='aucun effet calculé'?'Aucun effet calculé sur le brut':x.impact==='important'?'Impact potentiel : important':x.impact==='possible'?'Impact : possible':'Impact à déterminer')+'</b></div>').join('')+
      '<p>Aucun montant d’impact n’est additionné : il ne peut pas être calculé de façon fiable.</p>');
    /* 6. ROMI1 */
    const r=c.romi;
    let rb;
    if(!r||r.statut==='absent')rb='<p>Pas de relevé ROMI1 disponible.</p>';
    else if(r.statut==='non_comparable')rb='<p>Non comparable : périodes différentes. Aucun écart calculé.</p>';
    else{rb='<div class="mh37p-kv"><span>MesHeures</span><b>'+hm(r.mesheures.tte)+'</b></div><div class="mh37p-kv"><span>ROMI1 (employeur)</span><b>'+hm(r.employeur.tte)+'</b></div>'+
      '<div class="mh37p-kv" data-tone="'+(r.aVerifier?'warn':'ok')+'"><span>Écart</span><b>'+hm(r.ecartTte)+'</b></div>'+
      (r.statut==='partiel'?'<p>Relevé ROMI1 partiel — comparaison limitée à ses dates.</p>':'')+
      (r.aVerifier?'<p><b>À vérifier — écart à analyser.</b></p>':'')+
      (r.journalier&&r.journalier.disponible?'<div class="mh37p-kv"><span>Journées comparables</span><b>'+r.journalier.comparables+' / '+r.journalier.total+'</b></div><div class="mh37p-kv"><span>Écart expliqué par les journées comparées</span><b>'+sgnHm(r.journalier.ecartExplique)+'</b></div><div class="mh37p-kv"><span>Écart restant à analyser</span><b>'+sgnHm(r.journalier.ecartRestant)+'</b></div>'
        :'<p>Le relevé ROMI1 actuel ne contient que les totaux. L’écart ne peut pas être localisé jour par jour.</p>')}
    const rck=c.checks.find(x=>x.key==='romi');
    h+=det('romi','<span>🔎 Contrôle ROMI1</span><b data-tone="'+rck.niveau+'" data-k="romi">'+(r&&r.ecartTte!=null&&(r.statut==='comparable'||r.statut==='partiel')?(r.aVerifier?ICON.warn+' Écart ROMI1 : '+hm(Math.abs(r.ecartTte)):ICON.ok+' concordant'):ICON.na+' '+(r&&r.statut==='non_comparable'?'non comparable':'pas de relevé'))+'</b>',rb+btn('romi','→ ROMI1')+btn('compteur','→ Compteur'));
    /* déjà payé */
    h+=det('paye','<span>🧾 Déjà payé</span><b data-tone="'+(c.paid.length?'ok':'na')+'">'+(c.paid.length?c.paid.length+' source'+(c.paid.length>1?'s':''):'non renseigné')+'</b>',
      (c.paid.length?c.paid.map(x=>'<div class="mh37p-kv"><span>'+esc(x.source)+'<small>HS 25 % · HS 50 %</small></span><b>'+hm(x.h25)+' · '+hm(x.h50)+'</b></div>').join(''):'<p>Aucun paiement renseigné pour ce relevé. L’absence d’information n’est pas un paiement nul.</p>')+btn('paie','→ Saisir les HS payées'));
    /* 7. évolution */
    h+=det('evol','<span>📈 Évolution</span><b data-tone="na">'+(c.precedent?'vs '+dShort(c.precedent.debut)+' → '+dShort(c.precedent.fin):'aucun relevé précédent')+'</b>',evolution(c));
    /* 8. vérifier / simuler / outils */
    h+=det('check','<span>🔍 Vérifier le bulletin</span><b data-tone="'+v.niveau+'">'+c.compte.ok+' / '+(c.compte.ok+c.compte.warn+c.compte.bad)+'</b>',
      c.checks.map(x=>'<div class="mh37p-item" data-tone="'+x.niveau+'" data-check="'+x.key+'"><div><b>'+esc(x.titre)+'</b><small>'+ICON[x.niveau]+' '+(x.niveau==='ok'?'contrôlé':x.niveau==='warn'?'à vérifier':x.niveau==='bad'?'bloquant':'non évalué')+' · '+esc(x.texte)+'</small></div>'+linkFor(x.cible)+'</div>').join(''),'mh37p-check');
    h+=det('sim','<span>🧪 Simuler</span><b data-tone="'+(c.sim?'warn':'na')+'">'+(c.sim?'simulation active':'copie temporaire')+'</b>',simHtml(c),'mh37p-simd');
    h+=tools();
    return h+'</div>';
  }
  function evolution(c){
    const P=c.precedent;
    if(!P)return '<p>Pas de relevé précédent saisi : aucune comparaison.</p>';
    const G=c.G,g=P.G,rows=[['TTE',G.tte,g.tte,'h'],['HS 25 %',G.h25,g.h25,'h'],['HS 50 %',G.h50,g.h50,'h'],['Total HS',G.h25+G.h50,g.h25+g.h50,'h'],['Brut estimé',c.B.tot,P.B.tot,'e'],
      ['Paniers IR',G.ir,g.ir,'n'],['Paniers IRU',G.iru,g.iru,'n'],['Nuit',G.nuit,g.nuit,'h'],['IDAJ',G.idaj,g.idaj,'h'],['Habillage',G.hab,g.hab,'h'],['Jours travaillés',G.trav,g.trav,'n']];
    const f=(v,u)=>u==='h'?hm(v):u==='e'?eur(v):String(v),d=(a,b,u)=>u==='h'?sgnHm(a-b):u==='e'?sgnEur(a-b):(a-b>0?'+':a-b<0?'−':'±')+Math.abs(a-b);
    let h='<div class="mh37p-ev"><div class="mh37p-evh"><span></span><span>Précédent</span><span>Actuel</span><span>Variation</span></div>'+
      rows.map(r=>'<div class="mh37p-evr" data-ev="'+r[0]+'"><span>'+r[0]+'</span><span>'+f(r[2],r[3])+'</span><span>'+f(r[1],r[3])+'</span><b>'+d(r[1],r[2],r[3])+'</b></div>').join('')+'</div>';
    const facts=[];const C=c.c,pc=P.c,lab={T:'Journées de travail',NUIT:'Journées de nuit',CP:'Jours de CP',RC:'Jours de RC',MAL:'Jours de maladie',autres:'Autres journées particulières',saisies:'Journées saisies'};
    Object.keys(lab).forEach(k=>{if(C[k]!==pc[k])facts.push(lab[k]+' : '+pc[k]+' → '+C[k])});
    h+='<span class="mh37p-eye">Pourquoi cette différence ?</span>'+(facts.length?'<p>Différences constatées dans les données saisies :</p><ul>'+facts.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p>Ces différences sont constatées, elles ne sont pas présentées comme la cause de la variation.</p>'
      :'<p>Variation constatée — cause non déterminable avec les données disponibles.</p>')+(c.periode.enCours?'<p>Relevé actuel en cours : comparaison provisoire.</p>':'');
    return h;
  }
  function simHtml(c){
    const s=c.sim,G=c.G,cur=s?s.params:{h25:G.h25,h50:G.h50,ir:G.ir,iru:G.iru};
    const ctl=(k,lab,val,step,fmt)=>'<div class="mh37p-simr"><span>'+lab+'</span><button class="g" aria-label="'+lab+' moins" onclick="MHAssistantPaie.sim(\''+k+'\','+(-step)+')">−</button><b data-sim="'+k+'">'+fmt(val)+'</b><button class="g" aria-label="'+lab+' plus" onclick="MHAssistantPaie.sim(\''+k+'\','+step+')">+</button></div>';
    let h='<p>Les valeurs ci-dessous sont une copie temporaire : aucune journée, pause, repas, CP, relevé ROMI1, constat ni donnée de paie n’est modifié. Le brut simulé est recalculé par le moteur de paie (brutOf) sur cette copie.</p>'+
      ctl('h25','HS 25 %',cur.h25,15,hm)+ctl('h50','HS 50 %',cur.h50,15,hm)+ctl('ir','Paniers IR',cur.ir,1,String)+ctl('iru','Paniers IRU',cur.iru,1,String);
    if(s)h+='<span class="mh37p-eye">Impact simulé</span><div class="mh37p-kv"><span>Brut actuel</span><b>'+eur(s.brutReel)+'</b></div><div class="mh37p-kv"><span>Brut simulé</span><b data-k="simBrut">'+eur(s.brut)+'</b></div>'+
      '<div class="mh37p-kv mh37p-tot"><span>Différence</span><b data-k="simDiff">'+sgnEur(s.diffBrut)+'</b></div><div class="mh37p-kv"><span>Net estimé simulé</span><b>'+eur(s.net)+' ('+sgnEur(s.diffNet)+')</b></div>'+
      '<button class="g mh37p-exit" onclick="MHAssistantPaie.simExit()">Quitter la simulation</button>';
    else h+='<p>Utilise − / + pour simuler ; le résultat s’affiche ici.</p>';
    return h;
  }
  function tools(){
    return '<div class="mh37p-tools">'+btn('detail','💶 Détail paie')+'<button class="g mh37p-go" onclick="MH33.export()">⬇ Sauvegarde</button><button class="g mh37p-go" onclick="MH33.documents()">📄 Feuille de route</button>'+
      btn('audit','🛡️ Audit')+btn('compteur','⏱️ Compteur')+btn('romi','🔎 ROMI1')+btn('dossier','📁 Dossier')+'</div>';
  }

  /* ---------- actions (aucune écriture de données) ---------- */
  let renderHook=null;
  function rerender(){try{if(renderHook)renderHook();else{const el=document.getElementById('mh33PayOut');if(el)el.innerHTML=html()}}catch(e){console.warn('Assistant Paie',e)}}
  function sim(k,delta){if(!['h25','h50','ir','iru'].includes(k)||!num(delta))return;simState=simState||{h25:0,h50:0,ir:0,iru:0};simState[k]+=Number(delta);openSet.add('sim');rerender()}
  function simExit(){simState=null;rerender()}
  function t(el){try{const id=el.getAttribute('data-open');if(el.open)openSet.add(id);else openSet.delete(id)}catch(e){}}
  function scrollTo(id){setTimeout(()=>{const el=document.getElementById(id);if(el&&el.scrollIntoView)el.scrollIntoView({block:'start'})},60)}
  function go(target){
    const t0=String(target||''),k=t0.split(':')[1];
    try{
      if(t0==='detail'){tab('paie');scrollTo('pSimCard')}
      else if(t0==='paie'){tab('paie');scrollTo('pRcOut')}
      else if(t0==='compteur'){tab('home');scrollTo('mh37Compteur')}
      else if(t0==='audit')tab('audit');
      else if(t0==='dossier'){tab('audit');scrollTo('mhV30Dossier')}
      else if(t0==='romi')tab('romi');
      else if(t0.startsWith('jour')){if(isoDay(k)&&typeof mhOpenDay==='function')mhOpenDay(k);else tab('jour')}
    }catch(e){console.warn('Assistant Paie · navigation',e)}
  }
  window.MHAssistantPaie={version:V,data,html,simulate,sim,simExit,t,go,setRender:f=>{renderHook=f},_simState:()=>simState?{...simState}:null};
})();
