#!/usr/bin/env node
/*
 * V37.0.0 — Release final (version courante V37.1.1 depuis V37.1). Tests Node : version, cache, références d'assets, tolérance ROMI1 unique, valeurs de référence.
 * Lancer : node tests/v37-release.test.js
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const REPO=path.join(__dirname,'..'),WEBDIR=path.join(REPO,'app/src/main/assets/web'),WEB=path.join(WEBDIR,'scripts');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const read=p=>fs.readFileSync(path.join(REPO,p),'utf8');
const clone=o=>JSON.parse(JSON.stringify(o));
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+(e&&e.message))}}
const REL='37.4.0';   // version courante (V37.3.0 / 3730 → V37.4.0 / 3740)
/* V37.2 : la version reste 37.2.0 pendant les sous-lots ; la révision du cache change à chaque lot (37.2.0-B, -C…),
   sinon le service worker continuerait de servir les scripts du lot précédent sur le téléphone. */
const REV=(fs.readFileSync(path.join(REPO,'app/src/main/assets/web/sw.js'),'utf8').match(/const CACHE='mesheures-shell-v([^']+)'/)||[])[1];

console.log('Version Android');
t('version.properties : VERSION=37.4.0, VERSION_CODE=3740 (37.3.0 / 3730 → 37.4.0 / 3740, même schéma)',()=>{
  const p=Object.fromEntries(read('version.properties').trim().split(/\n/).map(l=>l.split('=')));assert.equal(p.VERSION,REL);assert.equal(p.VERSION_CODE,'3740');
  const [a,b,c]=p.VERSION.split('.').map(Number);assert.equal(Number(p.VERSION_CODE),a*100+b*10+c);assert.ok(Number(p.VERSION_CODE)>3730,'versionCode croissant (installation par-dessus V37.2.0)')});
t('build.gradle lit version.properties (versionName / versionCode non codés en dur)',()=>{
  const g=read('app/build.gradle');assert.ok(/versionCode releaseCode/.test(g)&&/versionName releaseVersion/.test(g)&&/version\.properties/.test(g))});
t('HybridCore : VERSION '+REL+', ENTRY_URL ?v=<révision du cache>',()=>{const j=read('app/src/main/java/com/mesheures/app/core/HybridCore.java');
  assert.ok(j.includes('VERSION = "'+REL+'"'));assert.ok(j.includes('index.html?v='+REV+'"'))});
t('révision du cache : '+REL+' ou '+REL+'-<lot>',()=>{assert.ok(REV===REL||new RegExp('^'+REL.replace(/\./g,'\\.')+'-[A-Z]$').test(REV),REV)});
t('version affichée et métadonnées web : '+REL+' partout, plus aucun 36.2.0',()=>{
  const idx=read('app/src/main/assets/web/index.html');assert.ok(idx.includes('<title>MesHeures V'+REL+'</title>'));assert.ok(idx.includes('content="'+REL+'"'));assert.ok(idx.includes('>V'+REL+'</span>'));
  assert.equal(JSON.parse(read('app/src/main/assets/web/manifest.json')).version,REL);
  const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='vendor'?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
  const left=walk(WEBDIR).filter(f=>/\.(js|html|json|css)$/.test(f)&&fs.readFileSync(f,'utf8').includes('36.2.0'));assert.deepEqual(left,[])});

console.log('Cache et références d’assets');
const idx=read('app/src/main/assets/web/index.html'),sw=read('app/src/main/assets/web/sw.js'),appjs=read('app/src/main/assets/web/scripts/app.js');
const SHELL=JSON.parse(sw.match(/const SHELL=(\[[^\]]*\])/)[1].replace(/'/g,'"'));
t('cache unique : mesheures-shell-v<révision>',()=>{assert.equal(sw.match(/const CACHE='([^']+)'/)[1],'mesheures-shell-v'+REV);assert.ok(/k\.startsWith\('mesheures-shell-'\)&&k!==CACHE/.test(sw),'anciens caches supprimés à l’activation')});
t('index.html, sw.js, app.js : une seule révision ?v= (aucune révision 37.0-x ni 36.x)',()=>{
  [idx,sw,appjs].forEach(s=>{assert.ok(!/\?v=37\.0-[0A-Z]/.test(s));assert.ok(!/\?v=36\./.test(s))});
  assert.ok(appjs.includes("sw.js?v="+REV));(idx.match(/\?v=[^"']+/g)||[]).forEach(v=>assert.equal(v,'?v='+REV,v))});
t('chaque script / feuille de style de index.html existe et figure dans le cache du service worker',()=>{
  const refs=[...idx.matchAll(/(?:src|href)="(\.?\/?(?:scripts|style)\/[^"]+)"/g)].map(m=>m[1].replace(/^(?!\.\/)/,'./'));
  assert.ok(refs.length>35,'références '+refs.length);
  refs.forEach(r=>{assert.ok(fs.existsSync(path.join(WEBDIR,r.split('?')[0])),'fichier manquant '+r);assert.ok(SHELL.includes(r),'absent du cache '+r)})});
t('chaque entrée du cache du service worker existe sur disque',()=>{SHELL.filter(x=>x!=='./').forEach(x=>assert.ok(fs.existsSync(path.join(WEBDIR,x.split('?')[0])),x))});
t('aucun fichier de sauvegarde / historique dans les assets (.bak, .orig, ~, .old)',()=>{
  const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
  assert.deepEqual(walk(path.join(REPO,'app/src/main')).filter(f=>/(\.bak|\.orig|\.old|~|\.tmp|\.swp)$/i.test(f)),[])});

console.log('ROMI1 : une seule tolérance pour la même comparaison (V35.7 aligné sur V37)');
function v357(romi,days){
  const win={},doc={readyState:'complete',getElementById:()=>null,addEventListener(){},createElement:()=>({}),documentElement:{}};
  const ctx={window:win,document:doc,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:function(){},console:{...console,info(){},warn(){}},
    setTimeout:()=>0,clearTimeout(){},MutationObserver:function(){this.observe=()=>{}},Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(R1.s)+'};DB.days='+JSON.stringify(days||R1.days)+';mhNormalizeMealSettings();mhMigrateLegacyMealChoices();',ctx);
  vm.runInContext('window.MH30DataEngine=MH30DataEngine;window.mhCalcDay=window.mhCalcDay;',ctx);
  win.MH_ROMI={list:()=>clone(romi)};
  for(const f of ['app-v37-romi-reconciliation.js','app-v35-7-romi-reconciliation.js'])vm.runInContext(fs.readFileSync(path.join(WEB,f),'utf8'),ctx,{filename:f});
  return {old:win.mhRomiReconciliation.build(),neu:win.MHRomiRecon};
}
const BASE={periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:10075/60,hsPeriodH:3775/60,presenceDays:18};
const badOf=b=>b.bad.map(x=>x.label).sort();
t('TTE ROMI1 à +15 min : concordant dans V35.7 comme dans V37 (avant : écart signalé dès 2 min)',()=>{
  const {old,neu}=v357([{...BASE,ttePeriodH:(10075-15)/60}]);assert.ok(!badOf(old).includes('TTE'));assert.equal(neu.analyze({start:BASE.periodStart,end:BASE.periodEnd}).niveau,'concordant')});
t('TTE ROMI1 à +16 min : à vérifier dans les deux modules',()=>{
  const {old,neu}=v357([{...BASE,ttePeriodH:(10075-16)/60}]);assert.ok(badOf(old).includes('TTE'));assert.equal(neu.analyze({start:BASE.periodStart,end:BASE.periodEnd}).niveau,'a_verifier')});
t('HS période : même tolérance ±15 min (même comparaison en minutes)',()=>{
  assert.ok(!badOf(v357([{...BASE,hsPeriodH:(3775-15)/60}]).old).includes('HS période'));assert.ok(badOf(v357([{...BASE,hsPeriodH:(3775-16)/60}]).old).includes('HS période'))});
t('jours de présence : comparaison différente (compte de jours), règle historique ≤ 1 jour conservée',()=>{
  assert.ok(!badOf(v357([{...BASE,presenceDays:17}]).old).includes('Jours de présence'));assert.ok(badOf(v357([{...BASE,presenceDays:16}]).old).includes('Jours de présence'))});
t('référence réelle : TTE 167h55 / 150h15 → écart signalé dans les deux modules',()=>{
  const {old,neu}=v357([{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16}]);
  assert.ok(badOf(old).includes('TTE'));const r=neu.analyze({start:'2026-08-24',end:'2026-09-20'});assert.equal(r.ecartTte,1060);assert.equal(r.niveau,'a_verifier')});

console.log('Valeurs de référence (gel)');
function engine(){
  const ctx={window:{},document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:function(){},console,setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(R1.s)+'};DB.days='+JSON.stringify({...R1.days,...R2.days})+';mhNormalizeMealSettings();mhMigrateLegacyMealChoices();globalThis.__x={calcPer,brutOf,F};',ctx);
  return ctx.__x;
}
const X=engine(),F=X.F,eur=n=>n.toFixed(2).replace('.',',');
t('24/08 → 20/09/2026 : 167h55 · 173h25 · 32h00 · 30h55 · 62h55 · nuit 1h00 · IDAJ 0h45 · habillage 3h00 · CP 5 j / 35h00 · 13 IR / 2 IRU · brut 3463,54',()=>{
  const {G}=X.calcPer('2026-08-24',2),B=X.brutOf(G);
  assert.deepEqual([F(G.tte),F(G.amp),F(G.h25),F(G.h50),F(G.h25+G.h50),F(G.nuit),F(G.idaj),F(G.hab),F(G.seuil-G.tte),G.ir,G.iru,eur(B.tot)],
    ['167h55','173h25','32h00','30h55','62h55','1h00','0h45','3h00','35h00',13,2,'3463,54']);
  assert.equal(Object.values(R1.days).filter(d=>d.t==='CP').length,5)});
t('21/09 → 18/10/2026 : 110h50 · 116h20 · 16h00 · 0h50 · 16h50 · nuit 4h00 · IDAJ 0h00 · habillage 2h20 · aucun CP · 11 IR / 0 IRU · brut 1791,78 · net 1410,13 · IR exonéré 114,40 · IRU 0,00 · total 1524,53',()=>{
  const {G}=X.calcPer('2026-09-21',2),B=X.brutOf(G);
  assert.deepEqual([F(G.tte),F(G.amp),F(G.h25),F(G.h50),F(G.h25+G.h50),F(G.nuit),F(G.idaj),F(G.hab),G.seuil-G.tte,G.ir,G.iru,eur(B.tot),eur(B.netSal),eur(B.panIRExon),eur(B.panIRU),eur(B.netEst)],
    ['110h50','116h20','16h00','0h50','16h50','4h00','0h00','2h20',0,11,0,'1791,78','1410,13','114,40','0,00','1524,53'])});
t('ROMI1 : 150h15 · HS 39h25 (39,42 h) · 16 j · écart 17h40 non expliqué',()=>{
  const {neu}=v357([{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16}]),r=neu.analyze({start:'2026-08-24',end:'2026-09-20'});
  assert.deepEqual([F(r.employeur.tte),F(r.employeur.hs),r.employeur.presence,F(r.ecartTte)],['150h15','39h25',16,'17h40']);
  assert.equal(r.journalier.disponible,false);assert.equal(r.journalier.ecartExplique,null);assert.equal(r.journalier.ecartRestant,1060)});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests du Release (V'+REL+', révision '+REV+') passent.');
process.exit(fails?1:0);
