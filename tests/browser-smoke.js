#!/usr/bin/env node
/*
 * Banc navigateur MesHeures (V37.0-0) : charge l'application réelle (index.html et ses 29 scripts)
 * dans Chromium avec les données de référence, comme le WebView du téléphone.
 * Usage : node tests/browser-smoke.js          (nécessite Playwright + Chromium)
 * Code de sortie : 0 = OK, 1 = échec, 2 = Playwright indisponible (test non exécuté).
 *
 * Données injectées : période 24/08→20/09/2026, plus
 *  - un CP qui garde des horaires (08/09 07:00→20:00) ;
 *  - deux constats C18 « hérités » de V36 : une fausse « Amplitude > 14 h » et une pause chiffrée 4,92 €.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','app/src/main/assets/web');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const days=JSON.parse(JSON.stringify(fx.days));days['2026-09-08']={t:'CP',p:[],deb:'07:00',fin:'20:00'};
const constats=[
  {id:'C18-legacy-amp',jour_concerne:'2026-08-25',regle_violie:'Amplitude > 14 h : dépassement à vérifier impérativement.',calcul_brut:0,calcul_montant_du:0,niveau:'critique',date_constat:'2026-10-01T00:00:00Z'},
  {id:'C18-legacy-pause',jour_concerne:'2026-09-04',regle_violie:'Pause minimale de 20 min à contrôler dès 6 h de TTE.',calcul_brut:20,calcul_montant_du:4.92,niveau:'critique',date_constat:'2026-10-01T00:00:00Z'}];
const DBSEED={s:fx.s,days,periods:[{start:'2026-08-24',nb:2}],per:{start:'2026-08-24',nb:2},bul:{},bulletins:[],romi:{},constats};
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};

const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
srv.listen(0,async()=>{
  const b=await chromium.launch(),ctx=await b.newContext({serviceWorkers:'block'}),pg=await ctx.newPage();
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('seed')){localStorage.setItem('mesheures_v3',JSON.stringify(d));sessionStorage.setItem('seed','1')}}catch(e){}},DBSEED);
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2500);
  for(const t of ['home','jour','mois','paie','audit','bul','romi','reg']){await pg.evaluate(t=>{try{tab(t)}catch(e){console.error('tab '+t+' : '+e.message)}},t);await pg.waitForTimeout(250)}
  const o=await pg.evaluate(()=>{
    const R=calcPer('2026-08-24',2),G=R.G,cp=cd('2026-09-08'),C=DB.constats||[];
    let road=null;try{road=MHRoadmap.generate('2026-08-24').includes('54h15')}catch(e){road=e.message}
    return {tte:F(G.tte),amp:F(G.amp),trav:G.trav,ir:G.ir,iru:G.iru,idaj:F(G.idaj),h25:F(G.h25),h50:F(G.h50),nuit:G.nuit,end:G.end,
      brut:brutOf(G).tot,cpAmp:cp.amp,cpIdaj:cp.idaj,patched:!!MH30DataEngine.day.__mh358,road,
      legalAmp14:mhLegalAudit('2026-08-24',2).filter(a=>/14 h/.test(a.m)).length,
      constats:C.length,amp14:C.filter(c=>/Amplitude > 14 h/.test(c.regle_violie)).length,
      legacyAmp:C.some(c=>c.id==='C18-legacy-amp'),legacyPause:C.find(c=>c.id==='C18-legacy-pause')||null,
      pauseEuros:C.filter(c=>/Pause minimale/.test(c.regle_violie)).reduce((s,c)=>s+(+c.calcul_montant_du||0),0)}});
  console.log('Application réelle (Chromium)');
  ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,3).join(' | '):''));
  ok(o.tte==='167h55'&&o.amp==='173h25'&&o.trav===18&&o.idaj==='0h45','référence : TTE 167h55, amplitude 173h25, 18 jours, IDAJ 0h45 (obtenu '+[o.tte,o.amp,o.trav,o.idaj].join(', ')+')');
  ok(o.ir===13&&o.iru===2&&o.h25==='32h00'&&o.h50==='30h55','référence : 13 IR + 2 IRU, HS25 32h00, HS50 30h55');
  ok(!o.patched,'moteur MH30DataEngine.day non remplacé par app-v35-8');
  ok(o.cpAmp===0&&o.cpIdaj===0,'CP avec horaires résiduels : amplitude et IDAJ nulles');
  ok(o.nuit===60&&o.end==='2026-09-20','heures de nuit comptées (1h00) ; ancienneté appréciée au 20/09/2026');
  ok(o.legalAmp14===0,'contrôle légal : 0 « Amplitude > 14 h » sur la période (18 avant V37.0-0)');
  ok(o.amp14===0&&!o.legacyAmp,'constat hérité « Amplitude > 14 h » purgé au chargement, aucun recréé');
  ok(o.legacyPause&&o.legacyPause.calcul_montant_du===0&&o.legacyPause.calcul_brut===0,'constat hérité « pause » conservé mais rechiffré à 0 € (était 4,92 €)');
  ok(o.pauseEuros===0,'aucun montant en euros sur les constats de pause');
  ok(o.road===true,'feuille de route générée (semaine 24/08 : 54h15)');
  /* V37.0-A — Smart Control sur l'Accueil */
  await pg.setViewportSize({width:390,height:2400});
  const sc=await pg.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
    const before=localStorage.getItem('mesheures_v3');
    tab('home');await w(400);const s=MHControl.analyze();MH31.renderHome();await w(200);
    const card=document.querySelector('#s-home .mh37-card');const txt=card?card.innerText:'';
    const after=localStorage.getItem('mesheures_v3');
    const det=card&&card.querySelector('details.mh37-g');if(det)det.open=true;await w(100);
    const detTxt=det?det.innerText:'';
    const homeTxt=document.getElementById('s-home').innerText;
    return {present:!!card,status:card&&card.dataset.mh37,label:s.label,score:s.score,counts:s.counts,txt,
      groupsShown:card?card.querySelectorAll(':scope > details.mh37-g').length:0,groups:s.groups.length,
      hasLabel:txt.includes(s.label),has100:/100\s*\/\s*100/.test(homeTxt),explanation:txt.includes(s.counts.ok+'/'+s.counts.total),
      detTxt,unchanged:before===after,mh314:MH314.audit().score,firstAction:s.groups[0]&&s.groups[0].alerts[0].actions[0]}});
  ok(sc.present,'Accueil : carte Smart Control affichée');
  ok(!sc.has100,'Accueil : plus de « 100/100 » affiché');
  ok(sc.hasLabel&&sc.explanation,'carte : niveau « '+sc.label+' » et explication du score ('+sc.counts.ok+'/'+sc.counts.total+', '+sc.score+' %)');
  ok(sc.mh314===sc.score,'MH314.audit (ancien score) = score MHControl');
  ok(/Date/.test(sc.detTxt)&&/Règle/.test(sc.detTxt)&&/Données/.test(sc.detTxt)&&/Résultat/.test(sc.detTxt)&&/Classement/.test(sc.detTxt)&&/→/.test(sc.detTxt),'détail d\'une alerte : date, règle, données, résultat, classement, action');
  ok(sc.unchanged,'analyse + rendu de l\'Accueil : données enregistrées inchangées');
  await pg.screenshot({path:path.join(require('os').tmpdir(),'mh37-home.png'),fullPage:true});
  if(sc.firstAction){
    const nav=await pg.evaluate(async a=>{const w=ms=>new Promise(r=>setTimeout(r,ms));MHControl.open(a.kind,a.target);await w(300);
      return {tab:document.querySelector('section.on')?.id,curDate:typeof curDate!=='undefined'?curDate:null,pS:document.getElementById('pS')?.value,per:DB.per.start}},sc.firstAction);
    if(sc.firstAction.kind==='day')ok(nav.tab==='s-jour'&&nav.curDate===sc.firstAction.target,'action « '+sc.firstAction.label+' » : journée ouverte');
    else ok(nav.tab==='s-paie','action « '+sc.firstAction.label+' » : onglet Paie ouvert');
  }
  const per=await pg.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));MHControl.open('period','2026-09-01');await w(400);
    return {tab:document.querySelector('section.on')?.id,pS:document.getElementById('pS').value,start:DB.per.start}});
  ok(per.tab==='s-paie'&&per.pS==='2026-08-24'&&per.start==='2026-08-24','action « ouvrir la période » : Paie sur la quatorzaine du 24/08 (via l\'écran Paie)');
  const rm=await pg.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));MHControl.open('romi',null);await w(300);return document.querySelector('section.on')?.id});
  ok(rm==='s-romi','action « ouvrir ROMI1 » : onglet ROMI1');
  /* V37.0-C — calendrier des quatorzaines dans l'application réelle */
  const qz=await pg.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
    mhOpenDay('2026-08-30');await w(300);const dq=document.getElementById('dQuat')?.innerText||'';
    tab('reg');await w(300);const inp=[...document.querySelectorAll('#rg2 input')].find(i=>i.type==='date');
    tab('paie');const el=document.getElementById('pS');el.value='2026-08-24';el.dispatchEvent(new Event('change'));await w(300);
    const align=document.getElementById('pAlign').innerText;
    const sep=mhV30MonthEvidence().find(r=>r.mois==='2026-09');
    return {dq,anchorVal:inp&&inp.value,anchorDisabled:inp&&inp.disabled,align,sep:sep&&{q:sep.quatorzaines,tte:F(sep.tteMin),du:F(sep.calcMin)},api:typeof mhQuatorzaine}});
  ok(qz.api==='object','mhQuatorzaine disponible dans l\'application');
  ok(/24\/08 → 06\/09/.test(qz.dq),'onglet Saisie, 30/08 : quatorzaine 24/08 → 06/09');
  ok(qz.anchorVal==='2025-05-19'&&qz.anchorDisabled,'Réglages : ancrage 19/05/2025 affiché en lecture seule');
  ok(/alignée/.test(qz.align),'Paie : période du 24/08 alignée sur les quatorzaines');
  ok(qz.sep&&qz.sep.q.join()==='2026-08-24,2026-09-07'&&qz.sep.tte==='167h55'&&qz.sep.du==='202h55','journal de preuves, septembre : 24/08 + 07/09, TTE 167h55, dû 202h55 (CP compris)');
  ok(errs.length===0,'0 erreur JavaScript après les actions'+(errs.length?' : '+errs.slice(0,3).join(' | '):''));
  console.log(fails?`\n${fails} ÉCHEC(S)`:'\nTous les tests navigateur passent.');
  await b.close();srv.close();process.exit(fails?1:0);
});
