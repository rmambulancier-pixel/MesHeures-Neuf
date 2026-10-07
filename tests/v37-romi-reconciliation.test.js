#!/usr/bin/env node
/*
 * V37.0-F — Rapprochement MesHeures ↔ ROMI1 et contrôle journalier. Tests Node.
 * Lancer : node tests/v37-romi-reconciliation.test.js
 *
 * Le relevé ROMI1 réel (24/08 → 20/09/2026) ne contient que des totaux : 150h15, HS 39,42 h, 16 jours.
 * Les détails journaliers utilisés ci-dessous sont SYNTHÉTIQUES (construits pour tester le mécanisme) ;
 * ils ne prétendent pas expliquer l'écart réel de 17h40.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const clone=o=>JSON.parse(JSON.stringify(o));
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+(e&&e.message))}}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}
const PS='2026-08-24',PE='2026-09-20',REF={today:'2026-10-07',start:PS};
const ROMI_REF={periodStart:PS,periodEnd:PE,ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15};

function load(days,opts={}){
  const writes=[],win={};
  const ls={getItem:()=>null,setItem:k=>writes.push(k),removeItem:k=>writes.push(k)};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){}},localStorage:ls,CustomEvent:function(){},
    console:{...console,info(){},warn(){}},setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  const extra=opts.db?Object.entries(opts.db).map(([k,v])=>'DB.'+k+'='+JSON.stringify(v)+';').join(''):'';
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(fx.s)+'};DB.days='+JSON.stringify(days)+';DB.per={start:"2026-08-24",nb:2};'+extra+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,F,addD,Q:mhQuatorzaine};',ctx);
  const romi=opts.romi?clone(opts.romi):null;
  if(romi){if(opts.freeze)deepFreeze(romi);win.MH_ROMI={list:()=>romi}}
  if(opts.freeze){vm.runInContext('Object.freeze(DB);',ctx);deepFreeze(ctx.__x.DB)}
  for(const f of ['app-v37-romi-reconciliation.js','app-v37-compteur.js'])vm.runInContext(fs.readFileSync(path.join(WEB,f),'utf8'),ctx,{filename:f});
  return {R:win.MHRomiRecon,C:win.MHCompteur,X:ctx.__x,win,writes,ctx,romi};
}
const text=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
/* Détail journalier synthétique identique à MesHeures (valeurs du moteur), modifiable jour par jour. */
function dailyFromEngine(mod){
  const L=load(fx.days),out=[];
  for(let k=PS;k<=PE;k=L.X.addD(k,1)){const d=fx.days[k],r=L.X.cd(k),work=d&&(d.t==='T'||d.t==='NUIT');
    out.push({date:k,presence:!!work,debut:work?d.deb:undefined,fin:work?d.fin:undefined,pauseMin:work?r.pz:undefined,tteMin:work?r.tte:0})}
  return mod?out.map(x=>mod[x.date]?{...x,...mod[x.date]}:x):out;
}
const H=m=>m/60;                // minutes → heures décimales (format du relevé)
const TTE_MH=10075;             // 167h55, valeur du moteur (vérifiée ci-dessous)

console.log('Référence 24/08/2026 → 20/09/2026 (relevé réel : totaux seulement)');
const A=load(fx.days,{romi:[ROMI_REF]}),a=A.R.analyze({start:PS,end:PE});
t('MesHeures 167h55 (calcPer), ROMI1 150h15, écart 17h40, « à vérifier »',()=>{
  assert.equal(a.statut,'comparable');assert.equal(a.mesheures.tte,A.X.calcPer(PS,2).G.tte);assert.equal(a.mesheures.tte,TTE_MH);assert.equal(a.mesheures.source,'calcPer');
  assert.equal(A.X.F(a.mesheures.tte),'167h55');assert.equal(A.X.F(a.employeur.tte),'150h15');assert.equal(A.X.F(a.ecartTte),'17h40');assert.equal(a.niveau,'a_verifier')});
t('sans détail journalier ROMI1 : 0 journée comparable, écart expliqué « — », écart restant 17h40',()=>{
  const j=a.journalier;assert.equal(j.disponible,false);assert.equal(j.comparables,0);assert.equal(j.total,28);assert.equal(j.ecartExplique,null);assert.equal(j.ecartRestant,1060);
  assert.ok(j.lignes.every(l=>l.statut==='non_comparable'&&l.motif==='détail journalier ROMI1 absent'))});
const HREF=A.C.html(REF),TREF=text(HREF);
t('affichage : « À vérifier · écart à analyser », « Écart restant à analyser », aucune cause déduite',()=>{
  assert.ok(/Journées comparables détail journalier ROMI1 absent 0 \/ 28/.test(TREF));
  ['À vérifier · écart à analyser','Écart expliqué par les journées comparées','Écart restant à analyser','+17h40','ne peut pas encore être localisé'].forEach(x=>assert.ok(TREF.includes(x),x));
  assert.ok(!/erreur|probable|cause de l|s’explique par|due? à/i.test(TREF.replace('Aucune cause n’est déduite','')),'aucune explication inventée');
  assert.ok(!/data-date=/.test(HREF),'aucune ligne journalière fabriquée')});
t('volet fermé compact inchangé : « Comparaison ROMI1 · écart 17h40 ⚠️ »',()=>{
  assert.ok(/data-fold="romi"><summary><span>Comparaison ROMI1<\/span><b data-tone="warn">écart 17h40 ⚠️<\/b>/.test(HREF));assert.ok(!/<details[^>]* open/.test(HREF))});

console.log('Tolérance ±15 min (période)');
const per=dm=>load(fx.days,{romi:[{...ROMI_REF,ttePeriodH:H(TTE_MH-dm)}]}).R.analyze({start:PS,end:PE});
t('1. ROMI1 identique : écart 0, concordant',()=>{const r=per(0);assert.equal(r.ecartTte,0);assert.equal(r.niveau,'concordant');assert.equal(r.aVerifier,false)});
t('2. écart +15 min : concordant',()=>{const r=per(15);assert.equal(r.ecartTte,15);assert.equal(r.niveau,'concordant')});
t('3. écart +16 min : à vérifier',()=>{const r=per(16);assert.equal(r.ecartTte,16);assert.equal(r.niveau,'a_verifier')});
t('4. écart négatif (ROMI1 au-dessus) : −16 min à vérifier, −15 min concordant',()=>{assert.equal(per(-16).niveau,'a_verifier');assert.equal(per(-15).niveau,'concordant');
  const L=load(fx.days,{romi:[{...ROMI_REF,ttePeriodH:H(TTE_MH+125)}]});assert.ok(text(L.C.html(REF)).includes('−2h05'))});
t('TTE ROMI1 absent du relevé : non comparable, aucun écart',()=>{const r=load(fx.days,{romi:[{...ROMI_REF,ttePeriodH:null}]}).R.analyze({start:PS,end:PE});
  assert.equal(r.ecartTte,null);assert.equal(r.niveau,'non_comparable');assert.equal(r.journalier.ecartRestant,null)});

console.log('Cas sans relevé comparable');
t('5. aucun ROMI1 : « Pas de relevé ROMI1 disponible. »',()=>{const L=load(fx.days);assert.equal(L.R.analyze({start:PS,end:PE}).statut,'absent');
  assert.ok(text(L.C.html(REF)).includes('Pas de relevé ROMI1 disponible.'));assert.ok(!text(L.C.html(REF)).includes('Écart restant'))});
t('6. période différente (déborde) : « Non comparable · Périodes différentes », aucun écart calculé',()=>{
  const L=load(fx.days,{romi:[{...ROMI_REF,periodStart:'2026-09-07',periodEnd:'2026-10-04'}]}),r=L.R.analyze({start:PS,end:PE}),h=text(L.C.html(REF));
  assert.equal(r.statut,'non_comparable');assert.equal(r.ecartTte,undefined);assert.ok(h.includes('Non comparable'));assert.ok(h.includes('Périodes différentes'));assert.ok(!h.includes('Écart TTE'))});
t('7a. relevé partiel aligné (une quatorzaine) : « partiel — comparaison limitée », calcPer sur ses seules dates',()=>{
  const L=load(fx.days,{romi:[{periodStart:PS,periodEnd:'2026-09-06',ttePeriodH:H(6755-20),hsPeriodH:42}]}),r=L.R.analyze({start:PS,end:PE});
  assert.equal(r.statut,'partiel');assert.equal(r.mesheures.tte,L.X.calcPer(PS,1).G.tte);assert.equal(L.X.F(r.mesheures.tte),'112h35');assert.equal(r.ecartTte,20);assert.equal(r.niveau,'a_verifier');
  assert.equal(r.employeur.hs,2520);const h=text(L.C.html(REF));assert.ok(h.includes('Relevé ROMI1 partiel — comparaison limitée'));assert.ok(h.includes('uniquement sur ces dates'));
  assert.ok(!h.includes('167h55 150h15'),'pas de comparaison du total de la période complète')});
t('7b. relevé partiel hors quatorzaines entières : TTE des seules dates, HS non comparables',()=>{
  const L=load(fx.days,{romi:[{periodStart:'2026-08-26',periodEnd:'2026-09-04',ttePeriodH:70,hsPeriodH:10}]}),r=L.R.analyze({start:PS,end:PE});
  let s=0;for(let k='2026-08-26';k<='2026-09-04';k=L.X.addD(k,1))s+=L.X.cd(k).tte;
  assert.equal(r.statut,'partiel');assert.equal(r.mesheures.tte,s);assert.equal(r.mesheures.hs,null);assert.equal(r.employeur.hs,null);
  assert.ok(text(L.C.html(REF)).includes('HS non comparables'))});

console.log('Contrôle journalier (détails synthétiques)');
t('9. données journalières concordantes : 28 / 28 comparables, écart expliqué 0, restant 0',()=>{
  const L=load(fx.days,{romi:[{...ROMI_REF,ttePeriodH:H(TTE_MH),jours:dailyFromEngine()}]}),r=L.R.analyze({start:PS,end:PE}),j=r.journalier;
  assert.equal(j.disponible,true);assert.equal(j.comparables,28);assert.equal(j.aVerifier,0);assert.equal(j.ecartExplique,0);assert.equal(j.ecartRestant,0);assert.equal(r.niveau,'concordant');
  assert.ok(j.lignes.every(l=>l.statut==='concordant'))});
t('journée : +15 min concordante, +16 min à vérifier',()=>{
  const L=load(fx.days,{romi:[{...ROMI_REF,ttePeriodH:H(TTE_MH),jours:dailyFromEngine({'2026-08-24':{tteMin:655-15},'2026-08-25':{tteMin:630-16}})}]}),j=L.R.analyze({start:PS,end:PE}).journalier;
  const l=d=>j.lignes.find(x=>x.date===d);assert.deepEqual([l('2026-08-24').diff,l('2026-08-24').statut],[15,'concordant']);assert.deepEqual([l('2026-08-25').diff,l('2026-08-25').statut],[16,'a_verifier'])});
t('10. plusieurs journées avec écarts : écart expliqué 13h40, écart restant 4h00 à analyser',()=>{
  const daily=dailyFromEngine({'2026-09-16':{tteMin:660-420},'2026-09-17':{tteMin:600-400}});   // −7h00 et −6h40 côté ROMI1 (synthétique)
  const L=load(fx.days,{romi:[{...ROMI_REF,jours:daily}]}),r=L.R.analyze({start:PS,end:PE}),j=r.journalier;
  assert.equal(L.X.F(r.ecartTte),'17h40');assert.equal(L.X.F(j.ecartExplique),'13h40');assert.equal(L.X.F(j.ecartRestant),'4h00');assert.equal(j.aVerifier,2);
  const h=L.C.html(REF),tx=text(h);['28 / 28','+13h40','Écart restant à analyser +4h00'].forEach(x=>assert.ok(tx.includes(x),x));
  assert.ok(/data-statut="a_verifier" data-date="2026-09-16"/.test(h));assert.ok(tx.includes('+7h00'));assert.ok(tx.includes('+6h40'))});
t('8a. journée absente du relevé ROMI1 : « Non comparable — donnée manquante », exclue de l’écart expliqué',()=>{
  const daily=dailyFromEngine().filter(x=>x.date!=='2026-09-03');
  const L=load(fx.days,{romi:[{...ROMI_REF,jours:daily}]}),j=L.R.analyze({start:PS,end:PE}).journalier,l=j.lignes.find(x=>x.date==='2026-09-03');
  assert.equal(l.statut,'non_comparable');assert.equal(l.diff,null);assert.equal(l.motif,'journée absente du relevé ROMI1');assert.equal(j.comparables,27);assert.equal(j.ecartExplique,0);
  assert.ok(text(L.C.html(REF)).includes('Non comparable — donnée manquante (journée absente du relevé ROMI1)'))});
t('8b. journée non saisie dans MesHeures : non comparable, jamais comptée à 0',()=>{
  const days=clone(fx.days);delete days['2026-09-03'];
  const j=load(days,{romi:[{...ROMI_REF,jours:dailyFromEngine()}]}).R.analyze({start:PS,end:PE}).journalier,l=j.lignes.find(x=>x.date==='2026-09-03');
  assert.equal(l.statut,'non_comparable');assert.equal(l.motif,'journée non saisie dans MesHeures');assert.equal(l.diff,null)});
t('8c. TTE ROMI1 manquant sur une journée présente : non comparable',()=>{
  const j=load(fx.days,{romi:[{...ROMI_REF,jours:dailyFromEngine({'2026-09-03':{tteMin:undefined}})}]}).R.analyze({start:PS,end:PE}).journalier;
  assert.equal(j.lignes.find(x=>x.date==='2026-09-03').motif,'TTE ROMI1 non renseigné')});
t('valeurs ROMI1 invalides ignorées, jamais complétées (date hors période, heure invalide)',()=>{
  const daily=dailyFromEngine({'2026-08-24':{debut:'25:99'}}).concat([{date:'2026-10-01',presence:true,tteMin:600}]);
  const j=load(fx.days,{romi:[{...ROMI_REF,jours:daily}]}).R.analyze({start:PS,end:PE}).journalier;
  assert.equal(j.lignes.length,28);assert.equal(j.lignes[0].romi.debut,null);assert.ok(!j.lignes.some(l=>l.date==='2026-10-01'))});
t('affichage du détail : horaires et pauses réellement disponibles, jours sans travail des deux côtés masqués',()=>{
  const L=load(fx.days,{romi:[{...ROMI_REF,jours:dailyFromEngine()}]}),h=L.C.html(REF),tx=text(h);
  assert.ok(tx.includes('MesHeures 05:45–17:10 · pause 12:20–12:50'));assert.ok(tx.includes('ROMI1 05:45–17:10 · pause 0h30'));
  assert.ok(tx.includes('jours sans travail des deux côtés non affichés'));assert.ok(!/undefined|NaN|null|\[object/.test(tx))});

console.log('Lecture seule et conservation E / E-r1');
t('11. aucune écriture : journées, horaires, pauses, repas, CP, ROMI1, constats, paie (DB et ROMI1 gelés)',()=>{
  const romi=[{...ROMI_REF,jours:dailyFromEngine()}];
  const L=load(fx.days,{freeze:true,romi,db:{constats:[],bul:{},bulletins:[]}}),before=JSON.stringify(L.X.DB);
  L.R.analyze({start:PS,end:PE});L.C.html(REF);L.C.data({today:'2026-10-07'});
  assert.equal(JSON.stringify(L.X.DB),before);assert.deepEqual(L.writes,[]);assert.equal(JSON.stringify(L.romi),JSON.stringify(romi));
  const d=L.X.DB.days['2026-08-24'];assert.deepEqual([d.deb,d.fin,d.p,d.panier],[fx.days[PS].deb,fx.days[PS].fin,fx.days[PS].p,fx.days[PS].panier]);
  assert.equal(L.X.DB.days['2026-09-08'].t,'CP')});
t('aucune correction automatique : MesHeures identique avec ou sans ROMI1, quel que soit l’écart',()=>{
  const sans=load(fx.days).C.data(REF),avec=load(fx.days,{romi:[{...ROMI_REF,jours:dailyFromEngine({'2026-09-16':{tteMin:0}})}]}).C.data(REF);
  ['travail','hs','autres'].forEach(k=>assert.deepEqual(avec[k],sans[k],k))});
t('16. valeurs E / E-r1 conservées : 167h55, 173h25, 18 j, 32h00, 30h55, IDAJ 0h45, 13 IR, 2 IRU',()=>{
  const c=A.C.data(REF),F=A.X.F;assert.deepEqual([F(c.travail.tte),F(c.travail.amp),c.travail.jours,F(c.hs.h25),F(c.hs.h50),F(c.autres.idaj),c.autres.ir,c.autres.iru],
    ['167h55','173h25',18,'32h00','30h55','0h45',13,2]);assert.equal(c.romi.statut,'comparable');assert.equal(F(c.romi.ecartTte),'17h40')});
t('tolérance unique : 15 min (module, Compteur, Smart Control)',()=>{
  assert.equal(A.R.TOLERANCE,15);assert.ok(/ROMI.{0,80}15/.test(fs.readFileSync(path.join(WEB,'app-v37-control.js'),'utf8')),'Smart Control à 15 min')});
t('window.DB non exposé',()=>{assert.equal(A.win.DB,undefined)});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.0-F passent.');
process.exit(fails?1:0);
