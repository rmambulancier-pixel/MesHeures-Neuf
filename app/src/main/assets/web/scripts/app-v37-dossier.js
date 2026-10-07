/*
 * MesHeures V37.0-D — Dossier probatoire : données, imprimable (HTML) et PDF.
 *
 * Lecture seule. Le dossier ne recalcule rien : il consomme les résultats existants
 *  - journées : cd() (TTE, amplitude, pauses, nuit, IDAJ, repas, alertes) ;
 *  - périodes de paie : mhQuatorzaine (ancre 19/05/2025) + calcPer() + brutOf() ;
 *  - Smart Control : MHControl.analyze() ; anomalies : mhLegalAudit() ;
 *  - rapprochement : journal de preuves (mhV30MonthEvidence) ; ROMI1 : MH_ROMI.list() ;
 *  - constats et événements : tels qu'enregistrés (aucune régénération des C18).
 * Aucune écriture dans DB ni dans le stockage. Une donnée absente est écrite « non renseigné ».
 */
(function(){
  'use strict';
  const V='37.0.0';   // version de l'application inscrite dans le dossier (format inchangé depuis V37.0-D)
  const NR='non renseigné';
  const NC='non comparable';
  const MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const TYPES={T:'Travail',NUIT:'Nuit',REPOS:'Repos',CP:'Congé payé',RC:'Repos compensateur',MAL:'Maladie',FORMATION:'Formation',
    MISE_A_NIVEAU:'Mise à niveau diplôme',VISITE_MEDICALE:'Visite médicale',REUNION:'Réunion',AUTRE_ACTIVITE:'Autre activité'};

  /* ---------- formats français, sans valeur JS brute ---------- */
  const num=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
  const p2=n=>String(n).padStart(2,'0');
  const isoDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(String(k||''));
  const dFr=k=>isoDay(k)?k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4):NR;
  const dShort=k=>isoDay(k)?k.slice(8)+'/'+k.slice(5,7):NR;
  const mFr=ym=>/^\d{4}-\d{2}$/.test(String(ym||''))?MONTHS[+ym.slice(5,7)-1]+' '+ym.slice(0,4):NR;
  const hm=m=>num(m)?F(Math.round(Number(m))):NR;               // F() = format moteur HHhMM
  const hDec=h=>num(h)?F(Math.round(Number(h)*60)):NR;           // heures décimales (bulletin, ROMI1) → HHhMM
  const eur=n=>{if(!num(n))return NR;const v=Number(n),s=Math.abs(v).toFixed(2).split('.');
    return (v<0?'−':'')+s[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ')+','+s[1]+' €'};
  const dtFr=iso=>{const d=new Date(iso);return isNaN(d.getTime())?NR:p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()+' à '+p2(d.getHours())+'h'+p2(d.getMinutes())};
  const txt=v=>v===null||v===undefined||v===''||(typeof v==='number'&&!Number.isFinite(v))?NR:String(v);

  /* ---------- 1. Données (lecture seule) ---------- */
  function data(opts){
    opts=opts||{};
    const now=opts.today||today();
    const D0=(typeof DB!=='undefined'&&DB&&typeof DB==='object')?DB:{};
    const S=D0.s||{};
    const days=D0.days||{};
    const keys=Object.keys(days).filter(isoDay).sort();
    const first=keys[0]||null,last=keys[keys.length-1]||null;
    const anc=typeof calcAnc==='function'&&S.emb?calcAnc(S.emb,now):null;

    const journees=keys.map(k=>{
      const d=days[k]||{},r=cd(k),work=d.t==='T'||d.t==='NUIT';
      const choice=typeof mhMealChoice==='function'?mhMealChoice(d):null;
      return {date:k,type:d.t||'REPOS',libelle:TYPES[d.t]||txt(d.t),work,deb:d.deb||null,fin:d.fin||null,
        pauses:(Array.isArray(d.p)?d.p:[]).filter(p=>p&&(p.d||p.f)).map(p=>(p.d||'?')+'-'+(p.f||'?')),
        amp:work?r.amp:0,tte:work?r.tte:0,pz:work?r.pz:0,nuit:r.nuit||0,idaj:r.idaj||0,ir:r.ir||0,iru:r.iru||0,
        repas:r.ir?'Extérieur (IR)':r.iru?'Intérieur (IRU)':(choice==='NON'?'Aucun (choisi)':'Aucun panier'),
        ferie:!!d.fer,note:d.note||'',alertes:(Array.isArray(r.al)?r.al:[]).map(a=>String(a&&a.m||'')).filter(Boolean)};
    });

    /* Périodes de paie : relevés de 4 semaines (2 quatorzaines) du calendrier mhQuatorzaine */
    const periodes=[];
    if(first){
      for(let ps=mhQuatorzaine.payPeriod(first).start;ps<=now;ps=addD(ps,28)){
        const pe=addD(ps,27);
        if(!journees.some(j=>j.date>=ps&&j.date<=pe))continue;   // relevé sans aucune journée saisie : pas de ligne vide
        const R=calcPer(ps,2),G=R.G,b=brutOf(G);
        const count=t=>journees.filter(j=>j.date>=ps&&j.date<=pe&&j.type===t).length;
        const ancL=(b.L||[]).find(x=>/anciennet/i.test(x[0]));
        periodes.push({debut:ps,fin:pe,moisPaie:mhQuatorzaine.payMonth(ps),enCours:pe>=now,
          quatorzaines:R.Q.map(q=>({debut:q.start,fin:addD(q.start,13),tte:q.tte,seuil:q.seuil,h25:q.h25,h50:q.h50})),
          jours:G.trav,tte:G.tte,amp:G.amp,h25:G.h25,h50:G.h50,idaj:G.idaj,nuit:G.nuit,hab:G.hab,ir:G.ir,iru:G.iru,
          cp:count('CP'),rc:count('RC'),mal:count('MAL'),autres:journees.filter(j=>j.date>=ps&&j.date<=pe&&!['T','NUIT','REPOS','CP','RC','MAL'].includes(j.type)).length,
          ancPct:ancL?ancL[1]:'0 %',ancMontant:ancL?ancL[3]:0,
          brut:b.tot,netSal:b.netSal,netEst:b.netEst,irTaxable:b.panIRTax,irExonere:b.panIRExon,iru_eur:b.panIRU});
      }
    }

    /* Smart Control : résultat du module, sans recalcul */
    let smart=null;
    try{if(window.MHControl&&typeof window.MHControl.analyze==='function'){const s=window.MHControl.analyze({end:now});
      smart={statut:s.status,libelle:s.label,score:s.score,conformes:s.counts?s.counts.ok:0,aVerifier:s.counts?s.counts.warn:0,critiques:s.counts?s.counts.bad:0,
        total:s.counts?s.counts.total:0,fenetre:s.window,explication:s.explanation,
        points:(s.groups||[]).map(g=>({date:g.label,niveau:g.level,titres:g.alerts.map(a=>a.title).join(' · '),resultat:g.alerts[0]&&g.alerts[0].result||''}))}}}catch(e){smart=null}

    /* Anomalies réglementaires : mhLegalAudit sur toutes les quatorzaines saisies */
    let anomalies=[];
    try{if(first&&typeof window.mhLegalAudit==='function'){const st=mhQuatorzaine.start(first);
      anomalies=(window.mhLegalAudit(st,Math.max(1,mhQuatorzaine.between(st,now).length))||[]).map(a=>({date:a.k,niveau:a.lvl==='b'?'Critique':'À vérifier',message:a.m,regle:a.rule||''}))
        .sort((a,b)=>String(a.date).localeCompare(String(b.date)))}}catch(e){anomalies=[]}

    /* ROMI1 : relevés enregistrés, comparés seulement sur des quatorzaines entières */
    let romi=[];
    try{const list=window.MH_ROMI&&typeof window.MH_ROMI.list==='function'?(window.MH_ROMI.list()||[]).filter(Boolean):[];
      romi=list.filter(x=>isoDay(x.periodStart)&&isoDay(x.periodEnd)).sort((a,b)=>String(a.periodStart).localeCompare(String(b.periodStart))).map(x=>{
        const aligned=mhQuatorzaine.isStart(x.periodStart)&&mhQuatorzaine.isStart(addD(x.periodEnd,1));
        let tte=0,pres=0,hs=null,detail=false;
        /* V37.0-H : même rapprochement que le Compteur et l'Assistant Paie (MHRomiRecon, lot F) ; repli historique sinon. */
        const rr=window.MHRomiRecon&&typeof window.MHRomiRecon.analyze==='function'?window.MHRomiRecon.analyze({start:x.periodStart,end:x.periodEnd}):null;
        if(rr&&rr.mesheures){tte=rr.mesheures.tte;pres=rr.mesheures.jours;hs=pres?rr.mesheures.hs:null;detail=!!(rr.journalier&&rr.journalier.disponible)}
        else{for(let k=x.periodStart;k<=x.periodEnd;k=addD(k,1)){const d=days[k];if(d&&(d.t==='T'||d.t==='NUIT')){tte+=Number(cd(k).tte)||0;pres++}}
          if(aligned&&pres){const n=Math.round((nDays(x.periodStart,x.periodEnd)+1)/14),G=calcPer(x.periodStart,n).G;hs=G.h25+G.h50}}
        return {debut:x.periodStart,fin:x.periodEnd,tteRomiH:num(x.ttePeriodH)?Number(x.ttePeriodH):null,hsRomiH:num(x.hsPeriodH)?Number(x.hsPeriodH):null,
          presenceRomi:num(x.presenceDays)?Number(x.presenceDays):null,rcRomiH:num(x.rcBalanceH)?Number(x.rcBalanceH):null,
          alignee:aligned,tteMesHeures:pres?tte:null,presenceMesHeures:pres,hsMesHeures:hs,detailJournalier:detail}})}catch(e){romi=[]}

    /* Rapprochement paie : journal de preuves (mois portant un bulletin) */
    let rapprochement=[];
    try{if(typeof window.mhV30MonthEvidence==='function')rapprochement=window.mhV30MonthEvidence().filter(r=>r.bulletin).map(r=>({mois:r.mois,du:r.calcMin,paye:r.paidMin,ecart:r.ecartMin,ecartEur:r.ecartEur,quatorzaines:r.quatorzaines||[]}))}catch(e){rapprochement=[]}

    /* Pause non prise : jamais chiffrée, même si un ancien constat porte encore un montant. */
    const isPause=c=>typeof window.mhV30ConstatType==='function'&&window.mhV30ConstatType(c.regle_violie||c.message)==='pause20';
    const constats=(Array.isArray(D0.constats)?D0.constats:[]).slice().sort((a,b)=>String(a.jour_concerne).localeCompare(String(b.jour_concerne)))
      .map(c=>({id:c.id,jour:c.jour_concerne,regle:c.regle_violie||c.message||'',niveau:c.niveau||'',source:c.article_source||'',montant:!isPause(c)&&num(c.calcul_montant_du)&&Number(c.calcul_montant_du)>0?Number(c.calcul_montant_du):0,base:c.calcul_base||''}));
    const evenements=(Array.isArray(D0.events)?D0.events:[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(e=>({date:e.date,type:e.type||'',texte:e.text||''}));
    const bulletins=(Array.isArray(D0.bulletins)?D0.bulletins:[]).slice().sort((a,b)=>String(a.mois).localeCompare(String(b.mois)))
      .map(b=>({mois:b.mois||null,brut:num(b.brut)?Number(b.brut):null,net:num(b.net)?Number(b.net):null,hNorm:num(b.hNorm)?Number(b.hNorm):null,
        hs25H:num(b.hs25H)?Number(b.hs25H):null,hs50H:num(b.hs50H)?Number(b.hs50H):null,habH:num(b.habH)?Number(b.habH):null,ir:num(b.irN)?Number(b.irN):null,iru:num(b.iruN)?Number(b.iruN):null}));

    const chronologie=[]
      .concat(first?[{date:first,quoi:'Première journée enregistrée'}]:[])
      .concat(romi.map(r=>({date:r.fin,quoi:'Relevé ROMI1 du '+dFr(r.debut)+' au '+dFr(r.fin)})))
      .concat(bulletins.filter(b=>/^\d{4}-\d{2}$/.test(String(b.mois))).map(b=>({date:b.mois,quoi:'Bulletin de '+mFr(b.mois)+' importé'})))
      .concat(evenements.map(e=>({date:e.date,quoi:(e.type?e.type+' : ':'')+e.texte})))
      .concat(last?[{date:last,quoi:'Dernière journée enregistrée'}]:[])
      .sort((a,b)=>String(a.date).localeCompare(String(b.date)));

    return {
      meta:{format:'MesHeures Dossier probatoire',version:V,generatedAt:opts.generatedAt||new Date().toISOString(),couverture:{debut:first,fin:now},
        ancreQuatorzaines:mhQuatorzaine.anchor,/* Hypothèse du lot C, non confirmée par un relevé ROMI1 de novembre 2025 à avril 2026 : présentée comme telle, jamais comme une règle établie. */
        regleMoisDePaie:'Rattachement au mois de paie : règle actuellement configurée selon le mois de fin du relevé de 4 semaines. Validation documentaire complémentaire requise.',regleMoisDePaieStatut:'à confirmer',
        source:'Données locales MesHeures, calculs du moteur de l’application (aucun recalcul propre au dossier).'},
      identite:{nom:S.nom||null,embauche:S.emb||null,tauxHoraire:num(S.taux)?Number(S.taux):null,baseHebdo:num(S.base)?Number(S.base):null,
        dureeCpMin:num(S.cp)?Number(S.cp):null,habillageMinJour:num(S.hab)?Number(S.hab):null,coefNet:num(S.net)?Number(S.net):null,
        anciennete:anc?{annees:anc.y,mois:anc.m,pct:anc.pct,forcee:num(S.anc)&&Number(S.anc)>0?Number(S.anc):null}:null},
      totaux:{journees:journees.length,travaillees:journees.filter(j=>j.work).length,tte:journees.reduce((s,j)=>s+j.tte,0),amp:journees.reduce((s,j)=>s+j.amp,0)},
      periodes,journees,smartControl:smart,anomalies,romi,rapprochement,bulletins,constats,evenements,chronologie
    };
  }
  /* JSON canonique : base de l'empreinte SHA-256 des données */
  function canonical(d){return JSON.stringify(d)}

  /* ---------- 2. Modèle de document (commun HTML / PDF) ---------- */
  function model(d,o){
    o=o||{};const B=[];
    const H1=t=>B.push({k:'h1',t}),H2=t=>B.push({k:'h2',t}),P=(t,s)=>B.push({k:'p',t,small:!!s}),
      KV=rows=>B.push({k:'kv',rows}),T=(cols,rows,empty)=>B.push({k:'table',cols,rows,empty});
    const id=d.identite,sm=d.smartControl;
    H1('MesHeures · Dossier probatoire');
    P('Généré le '+dtFr(d.meta.generatedAt)+' · version '+d.meta.version+(o.objet?' · Objet : '+o.objet:''));
    P('Couverture : '+(d.meta.couverture.debut?dFr(d.meta.couverture.debut)+' → '+dFr(d.meta.couverture.fin):'aucune journée enregistrée')+
      ' · Quatorzaines ancrées au '+dFr(d.meta.ancreQuatorzaines)+'.',true);
    P(d.meta.regleMoisDePaie,true);

    H2('1. Identité et configuration');
    KV([['Salarié',txt(id.nom)],['Date d’embauche',id.embauche?dFr(id.embauche):NR],
      ['Ancienneté au '+dFr(d.meta.couverture.fin),id.anciennete?id.anciennete.annees+' ans '+id.anciennete.mois+' mois · taux '+(id.anciennete.forcee!=null?id.anciennete.forcee+' % (forcé)':id.anciennete.pct+' %'):NR],
      ['Taux horaire',id.tauxHoraire!=null?eur(id.tauxHoraire)+' / h':NR],['Base hebdomadaire',id.baseHebdo!=null?id.baseHebdo+' h':NR],
      ['Valeur d’un jour de CP',id.dureeCpMin!=null?hm(id.dureeCpMin):NR],['Habillage',id.habillageMinJour!=null?id.habillageMinJour+' min par jour travaillé':NR],
      ['Coefficient brut → net',id.coefNet!=null?String(id.coefNet).replace('.',','):NR]]);

    H2('2. Synthèse Smart Control');
    if(!sm)P('Smart Control indisponible.');
    else if(sm.statut==='insufficient'){KV([['Niveau','Données insuffisantes'],['Score','aucun (aucune journée travaillée sur la fenêtre analysée)']])}
    else{
      KV([['Niveau global',sm.libelle],['Score',sm.score+' % des contrôles conformes'],['Contrôles',sm.conformes+' conformes · '+sm.aVerifier+' à vérifier · '+sm.critiques+' critique'+(sm.critiques>1?'s':'')+' (sur '+sm.total+')'],
        ['Fenêtre',dFr(sm.fenetre.start)+' → '+dFr(sm.fenetre.end)]]);
      T([{t:'Date',w:80},{t:'Niveau',w:62},{t:'Points',w:150},{t:'Résultat',w:223}],
        sm.points.slice(0,30).map(x=>[x.date,x.niveau==='bad'?'Critique':'À vérifier',x.titres,x.resultat]),'Aucune anomalie sur la fenêtre analysée.');
      if(sm.points.length>30)P('… et '+(sm.points.length-30)+' autres points (voir l’application).',true);
    }

    H2('3. Périodes de paie (relevés de 4 semaines)');
    P('Valeurs du moteur de paie (identiques à l’écran Paie sur 2 quatorzaines). HS 25 % / HS 50 % calculées par quatorzaine. Colonne « Mois » : rattachement à confirmer (voir en-tête).',true);
    T([{t:'Période',w:70},{t:'Mois',w:52},{t:'Jours',w:28,a:'r'},{t:'TTE',w:42,a:'r'},{t:'Amplitude',w:46,a:'r'},{t:'HS 25 %',w:40,a:'r'},{t:'HS 50 %',w:40,a:'r'},
       {t:'IDAJ',w:34,a:'r'},{t:'Nuit',w:34,a:'r'},{t:'IR / IRU',w:38,a:'r'},{t:'CP',w:22,a:'r'},{t:'Brut estimé',w:69,a:'r'}],
      d.periodes.slice().reverse().map(p=>[dShort(p.debut)+' → '+dShort(p.fin)+(p.enCours?' (en cours)':''),mFr(p.moisPaie),String(p.jours),hm(p.tte),hm(p.amp),hm(p.h25),hm(p.h50),
        hm(p.idaj),hm(p.nuit),p.ir+' / '+p.iru,String(p.cp),eur(p.brut)]),'Aucune période : aucune journée enregistrée.');
    if(d.periodes.length){
      const p=d.periodes.filter(x=>!x.enCours).slice(-1)[0]||d.periodes[d.periodes.length-1];
      P('Détail de la période du '+dFr(p.debut)+' au '+dFr(p.fin)+' : ancienneté '+p.ancPct+' ('+eur(p.ancMontant)+') · brut '+eur(p.brut)+
        ' (dont IR part taxable '+eur(p.irTaxable)+') · net salaire '+eur(p.netSal)+' · + IR exonéré '+eur(p.irExonere)+' · + IRU '+eur(p.iru_eur)+
        ' · total versé estimé '+eur(p.netEst)+'. La part taxable IR figure une seule fois, dans le brut.',true);
    }

    H2('4. Relevés ROMI1 (référence employeur)');
    T([{t:'Période',w:84},{t:'TTE ROMI1',w:56,a:'r'},{t:'TTE MesHeures',w:62,a:'r'},{t:'Présence',w:56,a:'r'},{t:'HS ROMI1',w:52,a:'r'},{t:'HS MesHeures',w:62,a:'r'},{t:'RC cumulé',w:50,a:'r'},{t:'Comparaison',w:93}],
      d.romi.map(r=>[dShort(r.debut)+' → '+dShort(r.fin),hDec(r.tteRomiH),r.tteMesHeures!=null?hm(r.tteMesHeures):'—',
        (r.presenceRomi!=null?r.presenceRomi:'—')+' / '+r.presenceMesHeures,hDec(r.hsRomiH),r.alignee?(r.hsMesHeures!=null?hm(r.hsMesHeures):'—'):NC,hDec(r.rcRomiH),
        !r.alignee?'HS non comparables (période hors quatorzaines entières)':r.tteMesHeures==null?'aucune journée saisie':'TTE : écart '+hm(r.tteMesHeures-Math.round(r.tteRomiH*60))+(r.detailJournalier?'':' (non localisé : totaux ROMI1 seuls)')]),
      'Aucun relevé ROMI1 enregistré.');

    H2('5. Rapprochement paie (journal de preuves)');
    T([{t:'Mois de paie',w:90},{t:'Quatorzaines',w:120},{t:'Dû (TTE+CP+RC)',w:80,a:'r'},{t:'Payé',w:70,a:'r'},{t:'Écart',w:70,a:'r'},{t:'Écart brut',w:85,a:'r'}],
      d.rapprochement.map(r=>[mFr(r.mois),r.quatorzaines.map(dShort).join(', ')||'—',hm(r.du),hm(r.paye),hm(r.ecart),eur(r.ecartEur)]),'Aucun bulletin importé : rapprochement impossible.');

    H2('6. Bulletins importés');
    T([{t:'Mois',w:90},{t:'Brut',w:70,a:'r'},{t:'Net',w:70,a:'r'},{t:'H. normales',w:60,a:'r'},{t:'HS 25 %',w:55,a:'r'},{t:'HS 50 %',w:55,a:'r'},{t:'Habillage',w:55,a:'r'},{t:'IR / IRU',w:60,a:'r'}],
      d.bulletins.map(b=>[mFr(b.mois),eur(b.brut),eur(b.net),hDec(b.hNorm),hDec(b.hs25H),hDec(b.hs50H),hDec(b.habH),(b.ir!=null?b.ir:'—')+' / '+(b.iru!=null?b.iru:'—')]),'Aucun bulletin importé.');

    H2('7. Anomalies réglementaires');
    T([{t:'Date',w:70},{t:'Niveau',w:62},{t:'Constat',w:263},{t:'Règle',w:120}],
      d.anomalies.map(a=>[isoDay(a.date)?dFr(a.date):txt(a.date),a.niveau,a.message,a.regle]),'Aucune anomalie réglementaire détectée.');

    H2('8. Constats enregistrés');
    T([{t:'Jour',w:62},{t:'Constat',w:220},{t:'Niveau',w:58},{t:'Source',w:110},{t:'Chiffrage',w:65,a:'r'}],
      d.constats.map(c=>[dFr(c.jour),c.regle,c.niveau==='critique'?'Critique':c.niveau==='a_verifier'?'À vérifier':txt(c.niveau),txt(c.source),c.montant>0?eur(c.montant):'non chiffré']),'Aucun constat enregistré.');

    H2('9. Journées');
    P('Toutes les journées enregistrées. Pauses : celles réellement saisies. Repas : choix de la journée appliqué par le moteur.',true);
    T([{t:'Date',w:50},{t:'Type',w:50},{t:'Horaires',w:56},{t:'Pauses saisies',w:62},{t:'Amplitude',w:44,a:'r'},{t:'TTE',w:36,a:'r'},{t:'Nuit',w:30,a:'r'},{t:'IDAJ',w:30,a:'r'},{t:'Repas',w:60},{t:'Alertes',w:97}],
      d.journees.map(j=>[dFr(j.date),j.libelle+(j.ferie?' (férié)':''),j.work?(j.deb||'?')+' → '+(j.fin||'?'):'—',j.work?(j.pauses.join(', ')||'aucune'):'—',
        j.work?hm(j.amp):'—',j.work?hm(j.tte):'—',j.nuit?hm(j.nuit):'—',j.idaj?hm(j.idaj):'—',j.work?j.repas:'—',j.alertes.length?j.alertes.join(' · '):'—']),'Aucune journée enregistrée.');

    H2('10. Événements et chronologie');
    T([{t:'Date',w:80},{t:'Élément',w:435}],d.chronologie.map(c=>[isoDay(c.date)?dFr(c.date):/^\d{4}-\d{2}$/.test(String(c.date))?mFr(c.date):txt(c.date),c.quoi]),'Aucun élément chronologique.');

    H2('11. Intégrité');
    KV([['Empreinte SHA-256 des données',o.dataHash||NR],['Contenu haché','JSON canonique du dossier (données ci-dessus, même génération)']]);
    P('Ce document est un export des données locales de MesHeures. Les estimations et contrôles doivent être confrontés aux documents originaux (bulletins, relevés ROMI1, planning, contrat) et aux règles applicables.',true);
    return B;
  }

  /* ---------- 3. Rendu HTML (Dossier imprimable) ---------- */
  const escH=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function html(d,o){
    const body=model(d,o).map(b=>{
      if(b.k==='h1')return '<h1>'+escH(b.t)+'</h1>';
      if(b.k==='h2')return '<h2>'+escH(b.t)+'</h2>';
      if(b.k==='p')return '<p'+(b.small?' class="s"':'')+'>'+escH(b.t)+'</p>';
      if(b.k==='kv')return '<table class="kv">'+b.rows.map(r=>'<tr><th>'+escH(r[0])+'</th><td>'+escH(r[1])+'</td></tr>').join('')+'</table>';
      if(b.k==='table')return b.rows.length?'<table><thead><tr>'+b.cols.map(c=>'<th'+(c.a==='r'?' class="r"':'')+'>'+escH(c.t)+'</th>').join('')+'</tr></thead><tbody>'+
        b.rows.map(r=>'<tr>'+r.map((v,i)=>'<td'+(b.cols[i].a==='r'?' class="r"':'')+'>'+escH(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p class="s">'+escH(b.empty)+'</p>';
      return '';
    }).join('\n');
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MesHeures · Dossier probatoire</title><style>'+
      '@page{size:A4;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10pt;line-height:1.35;margin:0}'+
      'h1{font-size:17pt;margin:0 0 4px}h2{font-size:12pt;margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #999;break-after:avoid}'+
      'p{margin:4px 0}p.s{font-size:8.5pt;color:#444}table{border-collapse:collapse;width:100%;font-size:8pt;margin:4px 0 8px}'+
      'th,td{border:1px solid #bbb;padding:3px 4px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}.r{text-align:right;white-space:nowrap}'+
      'thead{display:table-header-group}tr{break-inside:avoid}table.kv th{width:32%;background:#f5f5f5}'+
      '</style></head><body>'+body+'</body></html>';
  }

  /* ---------- 4. Rendu PDF (A4, Helvetica WinAnsi, pagination) ---------- */
  const WR=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
  const WB=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
  const CP1252={0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,
    0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,
    0x017E:0x9E,0x0178:0x9F};
  const SUBST={'→':'->','−':'-','≥':'>=','≤':'<=',' ':' ','✓':'OK','⚠':'!'};
  function bytesOf(str){const out=[];for(const ch of String(str)){const s=SUBST[ch];if(s!==undefined){for(const c of s)out.push(c.charCodeAt(0));continue}
    const c=ch.codePointAt(0);if(c>=32&&c<127)out.push(c);else if(c>=160&&c<=255)out.push(c);else if(CP1252[c])out.push(CP1252[c]);else if(c>0xFFFF||/\p{Extended_Pictographic}/u.test(ch)){/* emoji ignoré */}else out.push(63)}return out}
  const widthOf=(str,size,bold)=>bytesOf(str).reduce((s,b)=>s+((bold?WB:WR)[b-32]||556),0)*size/1000;
  const pdfStr=str=>'('+bytesOf(str).map(b=>b===40||b===41||b===92?'\\'+String.fromCharCode(b):b>=32&&b<127?String.fromCharCode(b):'\\'+b.toString(8).padStart(3,'0')).join('')+')';
  function wrap(str,width,size,bold){
    const words=String(str).split(/(\s+)/).filter(w=>w!=='');const lines=[];let cur='';
    const push=()=>{lines.push(cur.trimEnd());cur=''};
    words.forEach(w=>{
      if(/^\s+$/.test(w)){if(cur)cur+=' ';return}
      if(widthOf(cur+w,size,bold)<=width){cur+=w;return}
      if(cur.trim())push();
      while(widthOf(w,size,bold)>width){let i=1;while(i<w.length&&widthOf(w.slice(0,i+1),size,bold)<=width)i++;lines.push(w.slice(0,i));w=w.slice(i)}
      cur=w;
    });
    if(cur.trim()||!lines.length)push();
    return lines;
  }
  function pdf(d,o){
    o=o||{};
    const PW=595.28,PH=841.89,ML=40,MR=40,MT=48,MB=46,CW=PW-ML-MR;
    const pages=[];let ops,y;
    const newPage=()=>{ops=[];pages.push(ops);y=PH-MT};
    const T=(x,yy,s,size,bold,gray)=>ops.push((gray!=null?gray+' g ':'0 g ')+'BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x.toFixed(2)+' '+yy.toFixed(2)+' Td '+pdfStr(s)+' Tj ET');
    const need=h=>{if(y-h<MB)newPage()};
    /* hauteur minimale du bloc suivant un titre : un titre n'est jamais laissé seul en bas de page */
    const TS=7,TLH=8.6,TP=2.5;
    const tableRowH=(cols,cells,bold)=>{const tw=cols.reduce((s,c)=>s+c.w,0);return Math.max(...cells.map((v,i)=>wrap(v,cols[i].w*CW/tw-2*TP,TS,bold).length))*TLH+2*TP};
    const minH=b=>!b?0:b.k==='table'?(b.rows.length?tableRowH(b.cols,b.cols.map(c=>c.t),true)+tableRowH(b.cols,b.rows[0],false):14)
      :b.k==='p'?(b.small?7.5:9)*1.3*Math.min(2,wrap(b.t,CW,b.small?7.5:9,false).length):b.k==='kv'?24:0;
    newPage();
    const blocks=model(d,o);
    blocks.forEach((b,bi)=>{
      if(b.k==='h1'){need(26);T(ML,y-16,b.t,16,true);y-=24}
      else if(b.k==='h2'){
        /* V37.0-H : une section courte sans tableau (ex. « Intégrité ») reste entière sur une page : pas de dernière page presque vide */
        let j=bi+1,full=0,small=true;while(j<blocks.length&&blocks[j].k!=='h2'){const x=blocks[j];if(x.k==='table'){small=false;break}
          full+=x.k==='p'?wrap(x.t,CW,x.small?7.5:9,false).length*(x.small?7.5:9)*1.3+3:x.k==='kv'?x.rows.reduce((s,r)=>s+wrap(r[1],CW-156,8.5,false).length*11+2,0)+4:0;j++}
        need(29+(small&&full<220?full:minH(blocks[bi+1])));y-=8;T(ML,y-11,b.t,11.5,true);y-=15;ops.push('0.6 G 0.6 w '+ML+' '+y.toFixed(2)+' m '+(ML+CW)+' '+y.toFixed(2)+' l S');y-=6}
      else if(b.k==='p'){const size=b.small?7.5:9,lh=size*1.3;wrap(b.t,CW,size,false).forEach(l=>{need(lh);T(ML,y-size,l,size,false,b.small?0.3:null);y-=lh});y-=3}
      else if(b.k==='kv'){const size=8.5,lh=11,kw=150;b.rows.forEach(r=>{const L=wrap(r[1],CW-kw-6,size,false),h=L.length*lh+2;need(h);T(ML,y-size,r[0],size,true);L.forEach((l,i)=>T(ML+kw,y-size-i*lh,l,size,false));y-=h});y-=4}
      else if(b.k==='table'){
        if(!b.rows.length){need(12);T(ML,y-8,b.empty,7.5,false,0.3);y-=14;return}
        const size=TS,lh=TLH,pad=TP,tw=b.cols.reduce((s,c)=>s+c.w,0),k=CW/tw,cols=b.cols.map(c=>({...c,w:c.w*k}));
        const drawRow=(cells,bold,fill)=>{
          const L=cells.map((v,i)=>wrap(v,cols[i].w-2*pad,size,bold)),h=Math.max(...L.map(l=>l.length))*lh+2*pad;
          let x=ML;if(fill)ops.push('0.92 g '+ML+' '+(y-h).toFixed(2)+' '+CW.toFixed(2)+' '+h.toFixed(2)+' re f');
          ops.push('0.75 G 0.4 w '+ML+' '+(y-h).toFixed(2)+' '+CW.toFixed(2)+' '+h.toFixed(2)+' re S');
          L.forEach((lines,i)=>{const c=cols[i];if(i)ops.push('0.75 G 0.4 w '+x.toFixed(2)+' '+(y-h).toFixed(2)+' m '+x.toFixed(2)+' '+y.toFixed(2)+' l S');
            lines.forEach((l,j)=>{const tx=c.a==='r'?x+c.w-pad-widthOf(l,size,bold):x+pad;T(tx,y-pad-size-j*lh+1,l,size,bold)});x+=c.w});
          y-=h;
        };
        const head=()=>drawRow(cols.map(c=>c.t),true,true);
        const rowH=cells=>Math.max(...cells.map((v,i)=>wrap(v,cols[i].w-2*pad,size,false).length))*lh+2*pad;
        need(rowH(b.cols.map(c=>c.t))+rowH(b.rows[0]));head();
        b.rows.forEach(r=>{const h=rowH(r);if(y-h<MB){newPage();head()}drawRow(r,false,false)});
        y-=8;
      }
    });
    /* en-têtes et pieds de page */
    const N=pages.length,gen=dtFr(d.meta.generatedAt),hash=o.dataHash?o.dataHash.slice(0,16)+'…':NR;
    pages.forEach((p,i)=>{
      p.unshift('0.3 g BT /F1 7 Tf '+ML+' '+(PH-28)+' Td '+pdfStr('MesHeures · Dossier probatoire · généré le '+gen)+' Tj ET');
      p.push('0.75 G 0.4 w '+ML+' '+(MB-14)+' m '+(ML+CW)+' '+(MB-14)+' l S');
      p.push('0.3 g BT /F1 7 Tf '+ML+' '+(MB-24)+' Td '+pdfStr('Empreinte des données (SHA-256) : '+hash)+' Tj ET');
      const pg='Page '+(i+1)+' / '+N;p.push('0.3 g BT /F1 7 Tf '+(ML+CW-widthOf(pg,7,false)).toFixed(2)+' '+(MB-24)+' Td '+pdfStr(pg)+' Tj ET');
    });
    /* assemblage : objets, flux avec vrais sauts de ligne, table xref exacte */
    const objs=[];const add=s=>{objs.push(s);return objs.length};
    const f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pagesId=add(null),kids=[];
    pages.forEach(p=>{const st=p.join('\n');const cid=add('<< /Length '+st.length+' >>\nstream\n'+st+'\nendstream');
      kids.push(add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /Font << /F1 '+f1+' 0 R /F2 '+f2+' 0 R >> >> /Contents '+cid+' 0 R >>'))});
    objs[pagesId-1]='<< /Type /Pages /Kids ['+kids.map(k=>k+' 0 R').join(' ')+'] /Count '+kids.length+' >>';
    const info=add('<< /Title '+pdfStr('MesHeures - Dossier probatoire')+' /Producer '+pdfStr('MesHeures '+V)+' >>');
    const cat=add('<< /Type /Catalog /Pages '+pagesId+' 0 R >>');
    let out='%PDF-1.4\n';const off=[];
    objs.forEach((s,i)=>{off.push(out.length);out+=(i+1)+' 0 obj\n'+s+'\nendobj\n'});
    const xref=out.length;
    out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+off.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
    out+='trailer\n<< /Size '+(objs.length+1)+' /Root '+cat+' 0 R /Info '+info+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
    const bytes=new Uint8Array(out.length);for(let i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&255;   // fichier 100 % ASCII
    bytes.pageCount=N;
    return bytes;
  }

  window.MHDossier={version:V,data,canonical,model,html,pdf};
})();
