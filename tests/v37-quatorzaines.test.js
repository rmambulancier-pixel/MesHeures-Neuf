#!/usr/bin/env node
/*
 * V37.0-C — Calendrier des quatorzaines et compteur heures.
 * Lancer : node tests/v37-quatorzaines.test.js
 *
 * Ancre métier : 19/05/2025 (feuille de décompte), corroborée par le décompte de septembre 2026 :
 * 24/08 → 06/09 et 07/09 → 20/09 = 33e et 34e quatorzaines après l'ancre.
 * Le calendrier ne dépend ni de la date d'embauche, ni du réglage DB.s.anchor, ni des journées saisies.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const clone=o=>JSON.parse(JSON.stringify(o));
const H=(h,m)=>h*60+m;
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+e.message)}}

function load(days,s,withEvidence){
  const win={};
  const doc={readyState:'complete',getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{}}),dispatchEvent(){},addEventListener(){}};
  const ctx={window:win,document:doc,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:function(){},console:{...console,info(){}},
    setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(s||fx.s)+'};DB.days='+JSON.stringify(days||fx.days)+';mhNormalizeMealSettings();mhMigrateLegacyMealChoices();'+
    'function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F,Q:mhQuatorzaine};',ctx);
  if(withEvidence){vm.runInContext(fs.readFileSync(path.join(WEB,'app-legal.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(WEB,'app-evidence.js'),'utf8'),ctx)}
  return {X:ctx.__x,win,ctx};
}
const {X}=load();const Q=X.Q;

console.log('Ancre 19/05/2025');
t('19/05/2025 → 01/06/2025 puis 02/06/2025 → 15/06/2025',()=>{
  assert.equal(Q.anchor,'2025-05-19');
  assert.equal(Q.start('2025-05-19'),'2025-05-19');assert.equal(Q.end('2025-05-19'),'2025-06-01');
  assert.equal(Q.start('2025-06-01'),'2025-05-19');assert.equal(Q.start('2025-06-02'),'2025-06-02');assert.equal(Q.end('2025-06-02'),'2025-06-15')});
t('dates antérieures à l\'ancre : même calendrier (18/05/2025 ∈ 05/05 → 18/05)',()=>{
  assert.equal(Q.start('2025-05-18'),'2025-05-05');assert.equal(Q.end('2025-05-18'),'2025-05-18');assert.equal(Q.index('2025-05-05'),-1)});
t('chaque quatorzaine dure exactement 14 jours, sans trou ni recouvrement (2024 → 2028)',()=>{
  const l=Q.between('2024-01-01','2028-12-31');for(let i=1;i<l.length;i++){assert.equal(Q.end(l[i-1]),new Date(Date.parse(l[i]+'T12:00:00Z')-864e5).toISOString().slice(0,10))}
  l.forEach(x=>assert.ok(Q.isStart(x)))});

console.log('Référence septembre 2026');
t('24/08/2026 → 06/09/2026 = 33e quatorzaine après l\'ancre',()=>{
  assert.equal(Q.start('2026-08-24'),'2026-08-24');assert.equal(Q.end('2026-08-24'),'2026-09-06');assert.equal(Q.index('2026-08-24'),33)});
t('07/09/2026 → 20/09/2026 = 34e',()=>{assert.equal(Q.start('2026-09-20'),'2026-09-07');assert.equal(Q.end('2026-09-07'),'2026-09-20');assert.equal(Q.index('2026-09-07'),34)});
t('le moteur de paie découpe la période de référence sur ces deux quatorzaines',()=>{
  const R=X.calcPer('2026-08-24',2);assert.deepEqual(R.Q.map(q=>q.start),['2026-08-24','2026-09-07']);R.Q.forEach(q=>assert.ok(Q.isStart(q.start)))});

console.log('Indépendance : date d\'embauche, réglage, données');
const EMB=['2019-09-09','2020-01-01','2025-01-01','2026-10-01'];
t('4 dates d\'embauche : calendrier strictement identique',()=>{
  const ref=EMB.map(()=>null);const dates=['2025-05-19','2025-12-31','2026-08-24','2026-09-20','2027-02-28'];
  const res=EMB.map(e=>{const L=load(null,{...fx.s,emb:e});return dates.map(d=>L.X.Q.start(d)+'|'+L.X.Q.end(d)+'|'+L.X.Q.payMonth(d)).join(',')});
  res.forEach(r=>assert.equal(r,res[0]))});
t('4 dates d\'embauche : quatorzaines du journal de preuves identiques',()=>{
  const res=EMB.map(e=>{const L=load(null,{...fx.s,emb:e},true);return JSON.stringify(L.win.mhV30MonthEvidence().map(r=>[r.mois,r.quatorzaines,r.calcMin]))});
  res.forEach(r=>assert.equal(r,res[0]))});
t('réglage DB.s.anchor modifié (ou vide) : calendrier inchangé',()=>{
  ['2030-01-03','2025-05-26','',null].forEach(a=>{const L=load(null,{...fx.s,anchor:a},true);
    assert.equal(L.X.Q.start('2026-08-30'),'2026-08-24');assert.deepEqual(L.win.mhV30MonthEvidence().find(r=>r.mois==='2026-09').quatorzaines,['2026-08-24','2026-09-07'])})});
t('journées saisies différentes : calendrier inchangé',()=>{
  const L=load({'2026-09-10':{t:'T',deb:'08:00',fin:'16:00',p:[],mealV:3}});assert.equal(L.X.Q.start('2026-09-10'),'2026-09-07')});

console.log('Rattachement mensuel (paie)');
t('relevés ROMI1 connus : 27/07 → 23/08 = août ; 24/08 → 20/09 = septembre',()=>{
  assert.deepEqual(Q.payPeriod('2026-07-27'),{start:'2026-07-27',end:'2026-08-23'});assert.deepEqual(Q.payPeriod('2026-08-15'),{start:'2026-07-27',end:'2026-08-23'});
  assert.deepEqual(Q.payPeriod('2026-08-24'),{start:'2026-08-24',end:'2026-09-20'});assert.deepEqual(Q.payPeriod('2026-09-20'),{start:'2026-08-24',end:'2026-09-20'});
  assert.equal(Q.payMonth('2026-07-27'),'2026-08');assert.equal(Q.payMonth('2026-08-10'),'2026-08');
  assert.equal(Q.payMonth('2026-08-24'),'2026-09');assert.equal(Q.payMonth('2026-09-07'),'2026-09')});
t('une quatorzaine à cheval sur deux mois n\'est jamais coupée ni rattachée au mois de son début',()=>{
  // 24/08 → 06/09 commence en août mais appartient au relevé de septembre
  assert.equal(Q.payMonth('2026-08-24'),'2026-09')});
t('journal : septembre 2026 = les deux quatorzaines du relevé, sans prorata',()=>{
  const L=load(null,null,true);const r=L.win.mhV30MonthEvidence().find(x=>x.mois==='2026-09');
  assert.deepEqual(r.quatorzaines,['2026-08-24','2026-09-07']);
  assert.equal(r.tteMin,H(167,55));            // TTE de la période ROMI1 24/08 → 20/09
  assert.equal(r.calcMin,H(112,35)+H(90,20));  // heures dues : Q1 112h35 + Q2 90h20 (55h20 TTE + 5 CP × 7h)
  const G=L.X.calcPer('2026-08-24',2).G;assert.equal(r.h25,G.h25);assert.equal(r.h50,G.h50)});
t('journal : chaque quatorzaine apparaît une seule fois, sur un seul mois',()=>{
  const L=load(null,null,true);const all=L.win.mhV30MonthEvidence().flatMap(r=>r.quatorzaines);assert.equal(new Set(all).size,all.length);all.forEach(q=>assert.ok(Q.isStart(q)))});
t('journal : un bulletin compare des heures dues (CP compris), pas le TTE seul',()=>{
  const L=load(null,null,true);vm.runInContext('DB.bulletins=[{mois:"2026-09",hNorm:140,hs25H:32,hs50H:30.92,brut:3400}];',L.ctx);
  const r=L.win.mhV30MonthEvidence().find(x=>x.mois==='2026-09');
  assert.ok(Math.abs(r.paidMin-(140+32+30.92)*60)<1e-6);assert.ok(Math.abs(r.ecartMin)<=1,'écart '+r.ecartMin+' min (avant : −35h00 = 5 CP)')});
t('mois où une autre lecture (« fin de chaque quatorzaine ») divergerait : novembre 2025 → avril 2026, puis novembre 2026',()=>{
  const diff=Q.between('2025-05-05','2027-01-10').filter(q=>Q.payMonth(q)!==Q.end(q).slice(0,7)).map(q=>q.slice(0,7));
  assert.deepEqual([...new Set(diff)],['2025-05','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-11','2026-12'])});

console.log('Une seule source de vérité');
const files=fs.readdirSync(WEB).filter(f=>f.endsWith('.js')&&!/^(romi-master|specialized-reader)\.js$/.test(f));
const src=Object.fromEntries(files.map(f=>[f,fs.readFileSync(path.join(WEB,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'')]));
t('aucun module ne reconstruit le calendrier par lui-même (floor(nDays/14)*14)',()=>{
  Object.entries(src).forEach(([f,s])=>assert.ok(!/\/\s*14\s*\)\s*\*\s*14/.test(s),f))});
t('aucun calendrier ne part de la date d\'embauche',()=>{
  Object.entries(src).forEach(([f,s])=>{assert.ok(!/(let|const|var)\s+\w+\s*=\s*DB\.s\??\.emb\b/.test(s),f+' : variable ancrée sur emb');
    assert.ok(!/mhLegalAudit\(\s*data\.s\?\.emb/.test(s),f+' : audit ancré sur emb')})});
t('aucun module ne lit DB.s.anchor pour bâtir une quatorzaine',()=>{
  Object.entries(src).forEach(([f,s])=>assert.ok(!/nDays\(\s*(DB\.s\??\.|S\.)anchor/.test(s)&&!/DB\??\.s\??\.anchor\s*\|\|/.test(s),f))});
t('modules branchés sur mhQuatorzaine : Paie, Journal, Smart Control, Audit, ROMI1, dossier, import',()=>{
  [['app-ui.js',/mhQuatorzaine\.offset\(st\)/],['app-ui.js',/mhQuatorzaine\.isStart\(p\.start\)/],['app-ui.js',/mhQuatorzaine\.start\(k\)/],
   ['app-evidence.js',/mhQuatorzaine\.between/],['app-evidence.js',/mhQuatorzaine\.payMonth/],['app-v37-control.js',/mhQuatorzaine\.start\(target\)/],
   ['app-v35-7-romi-reconciliation.js',/mhQuatorzaine\.isStart\(r\.start\)/],['app-dossier.js',/mhQuatorzaine\.start\(firstKey\)/],
   ['app-parser.js',/mhQuatorzaine\.start\(first\)/],['app-reconciliation.js',/mhQuatorzaine\.start\(r\.start\)/],
   ['app-projection.js',/mhQuatorzaine\.start\(today\(\)\)/],['app-v30.js',/mhQuatorzaine\.start\(k\)/],['app-v30-smart.js',/mhQuatorzaine\.start\(today\(\)\)/]]
   .forEach(([f,rx])=>assert.ok(rx.test(src[f]),f+' '+rx))});
t('le calendrier est figé (objet gelé, aucune réaffectation possible)',()=>{assert.ok(Object.isFrozen(Q))});

console.log('Écart avec le décompte ROMI1 du 24/08 au 20/09/2026 (analyse, aucune correction du moteur)');
/* Décompte : TTE 150h15, HS 39,42 h, présence 16. MesHeures : TTE 167h55, 18 jours, HS 62h55.
   Le décompte ne détaille pas les journées : l'analyse teste ce que les totaux imposent. */
const work=Object.keys(fx.days).filter(k=>fx.days[k].t==='T').sort();
function without(a,b,s){const d=clone(fx.days);delete d[a];delete d[b];const L=load(d,s);const G=L.X.calcPer('2026-08-24',2).G;return {tte:G.tte,hs:G.h25+G.h50,trav:G.trav}}
t('MesHeures inchangé : TTE 167h55, amplitude 173h25, 18 jours, IDAJ 0h45, 13 IR + 2 IRU, HS 62h55',()=>{
  const G=X.calcPer('2026-08-24',2).G;assert.equal(G.tte,H(167,55));assert.equal(G.amp,H(173,25));assert.equal(G.trav,18);assert.equal(G.idaj,45);
  assert.equal(G.ir,13);assert.equal(G.iru,2);assert.equal(G.h25+G.h50,H(62,55))});
function pairs(s){const out=[];for(let i=0;i<work.length;i++)for(let j=i+1;j<work.length;j++){const r=without(work[i],work[j],s);if(r.tte===H(150,15))out.push({p:work[i].slice(5)+'+'+work[j].slice(5),hs:r.hs,trav:r.trav})}return out}
const P420=pairs(),P350=pairs({...fx.s,cp:350});
t('16 jours de présence = 2 journées de moins ; seules 3 paires donnent exactement 150h15',()=>{
  assert.deepEqual(P420.map(x=>x.p),['08-27+09-15','09-02+09-16','09-17+09-18']);P420.forEach(x=>assert.equal(x.trav,16))});
t('CP valorisés 7h00 (réglage MesHeures) : aucune paire ne donne 39,42 h de HS (toujours 45h15)',()=>{
  P420.forEach(x=>assert.equal(x.hs,H(45,15),x.p))});
t('CP valorisés 5h50 (35 h ÷ 6 jours ouvrables) : 27/08 + 15/09 ou 02/09 + 16/09 donnent 150h15 ET 39h25 (= 39,42 h)',()=>{
  const ok=P350.filter(x=>x.hs===H(39,25)).map(x=>x.p);assert.deepEqual(ok,['08-27+09-15','09-02+09-16']);
  assert.equal(P350.find(x=>x.p==='09-17+09-18').hs,H(42,35)) // la 2e quatorzaine passerait sous 70 h : exclue
});
t('identité : HS ROMI1 = TTE + CP − 140 h quand les deux quatorzaines dépassent 70 h ⇒ CP = 29,17 h = 5 × 5h50',()=>{
  const cp=39.42+140-150.25;assert.ok(Math.abs(cp-5*35/6)<0.01,cp)});
t('le moteur n\'est pas modifié par cette analyse (réglage cp toujours 420 min par défaut)',()=>{
  const s=fs.readFileSync(path.join(WEB,'app-core.js'),'utf8');assert.ok(/rc:420,cp:420/.test(s))});

console.log(fails?`\n${fails} ÉCHEC(S)`:'\nTous les tests passent.');process.exit(fails?1:0);
