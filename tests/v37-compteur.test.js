#!/usr/bin/env node
/*
 * V37.0-E — Compteur heures (synthèse d'un relevé de 4 semaines). Tests Node.
 * Lancer : node tests/v37-compteur.test.js
 * Le compteur ne calcule rien : chaque valeur est comparée à la sortie du moteur (calcPer, mhCurrentPaySummary).
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const clone=o=>JSON.parse(JSON.stringify(o));
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+(e&&e.message))}}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}
const ROMI_REF={periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15,hs125PaidH:16,hs150PaidH:4.33,hs125ToRcH:0,hs150ToRcH:0};
const REF={today:'2026-10-07',start:'2026-08-24'};

function load(days,opts={}){
  const writes=[],win={};
  const ls={getItem:()=>null,setItem:k=>writes.push(k),removeItem:k=>writes.push(k)};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){}},localStorage:ls,CustomEvent:function(){},
    console:{...console,info(){},warn(){}},setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  const extra=opts.db?Object.entries(opts.db).map(([k,v])=>'DB.'+k+'='+JSON.stringify(v)+';').join(''):'';
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(opts.s||fx.s)+'};DB.days='+JSON.stringify(days)+';DB.per={start:"2026-08-24",nb:2};'+extra+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F,Q:mhQuatorzaine};',ctx);
  if(opts.romi)win.MH_ROMI={list:()=>clone(opts.romi)};
  if(opts.freeze){vm.runInContext('Object.freeze(DB);',ctx);deepFreeze(ctx.__x.DB)}
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-v37-romi-reconciliation.js'),'utf8'),ctx,{filename:'app-v37-romi-reconciliation.js'});   // V37.0-F : source de la comparaison ROMI1
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-v37-compteur.js'),'utf8'),ctx,{filename:'app-v37-compteur.js'});
  return {C:win.MHCompteur,X:ctx.__x,win,writes,ctx};
}
const day=(deb,fin,p,extra)=>Object.assign({t:'T',deb,fin,p:p||[],mealV:3,panier:'NON'},extra||{});
const shift=(days,n)=>{const out={};Object.entries(days).forEach(([k,v])=>{out[new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10)]=v});return out};
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
const text=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

const L=load(fx.days,{romi:[ROMI_REF]}),F=L.X.F,c=L.C.data(REF),H=L.C.html(REF);

console.log('Référence 24/08/2026 → 20/09/2026');
t('période = relevé de 4 semaines du calendrier mhQuatorzaine (ancre 19/05/2025)',()=>{
  assert.equal(c.periode.debut,'2026-08-24');assert.equal(c.periode.fin,'2026-09-20');assert.equal(c.periode.ancre,'2025-05-19');
  assert.ok(L.X.Q.isStart(c.periode.debut));assert.ok(text(H).includes('24/08 → 20/09/2026'))});
t('TTE 167h55, amplitude 173h25, 18 jours',()=>{assert.equal(F(c.travail.tte),'167h55');assert.equal(F(c.travail.amp),'173h25');assert.equal(c.travail.jours,18)});
t('HS 25 % 32h00, HS 50 % 30h55, total HS 62h55',()=>{assert.equal(F(c.hs.h25),'32h00');assert.equal(F(c.hs.h50),'30h55');assert.equal(F(c.hs.total),'62h55')});
t('IDAJ 0h45, nuit 1h00, habillage 3h00 (18 × 10 min)',()=>{assert.equal(F(c.autres.idaj),'0h45');assert.equal(F(c.autres.nuit),'1h00');assert.equal(F(c.autres.hab),'3h00')});
t('paniers 13 IR, 2 IRU',()=>{assert.equal(c.autres.ir,13);assert.equal(c.autres.iru,2);assert.ok(text(H).includes('13 IR · 2 IRU'))});
t('CP : 5 jours, 35h00 valorisés dans la base HS',()=>{assert.equal(c.autres.cpJours,5);assert.equal(F(c.autres.cpMin),'35h00');assert.ok(text(H).includes('5 j · 35h00'))});
t('affichage : valeurs de référence présentes, aucune valeur invalide',()=>{
  ['167h55','173h25','32h00','30h55','62h55','0h45','1h00','3h00'].forEach(v=>assert.ok(H.includes(v),v));assert.ok(!BAD.test(text(H)),text(H).match(BAD))});

console.log('Deux quatorzaines');
t('Q1 24/08 → 06/09 : TTE 112h35, HS 25 16h00, HS 50 26h35',()=>{const q=c.quatorzaines[0];
  assert.deepEqual([q.debut,q.fin],['2026-08-24','2026-09-06']);assert.deepEqual([F(q.tte),F(q.h25),F(q.h50)],['112h35','16h00','26h35'])});
t('Q2 07/09 → 20/09 : TTE réel 55h20, base HS avec CP 90h20, HS 25 16h00, HS 50 4h20',()=>{const q=c.quatorzaines[1];
  assert.deepEqual([q.debut,q.fin],['2026-09-07','2026-09-20']);assert.deepEqual([F(q.tte),F(q.base),F(q.h25),F(q.h50)],['55h20','90h20','16h00','4h20']);
  assert.equal(q.cpJours,5)});
t('total des quatorzaines = relevé (TTE 167h55)',()=>{assert.equal(c.quatorzaines.reduce((s,q)=>s+q.tte,0),c.travail.tte);
  assert.equal(c.quatorzaines.reduce((s,q)=>s+q.h50,0),c.hs.h50);assert.ok(/Total\s+167h55\s+202h55\s+32h00\s+30h55/.test(text(H)),'ligne Total')});
t('quatorzaines identiques au moteur (calcPer(début, 2).Q)',()=>{const R=L.X.calcPer('2026-08-24',2);
  c.quatorzaines.forEach((q,i)=>{assert.equal(q.tte,R.Q[i].tte);assert.equal(q.base,R.Q[i].seuil);assert.equal(q.h25,R.Q[i].h25);assert.equal(q.h50,R.Q[i].h50)})});
t('la date d’embauche ne déplace pas le relevé (4 dates)',()=>{
  ['2019-09-09','2026-08-26','2025-05-20','2026-09-01'].forEach(e=>{const d=load(fx.days,{s:{...fx.s,emb:e}}).C.data(REF);
    assert.deepEqual(d.quatorzaines.map(q=>q.debut),['2026-08-24','2026-09-07'],e)})});
t('n’importe quel jour du relevé ouvre le même relevé',()=>{['2026-08-24','2026-09-02','2026-09-20'].forEach(k=>assert.equal(L.C.data({today:'2026-10-07',start:k}).periode.debut,'2026-08-24'))});

console.log('Cas de données');
t('aucune donnée : aucune valeur affichée, pas de faux zéro',()=>{const A=load({});const d=A.C.data({today:'2026-10-07'}),h=text(A.C.html({today:'2026-10-07'}));
  assert.equal(d.vide,true);assert.ok(h.includes('Aucune journée saisie sur ce relevé'));assert.ok(!/\d+h\d{2}/.test(h.replace(/\d{2}\/\d{2}/g,'')),'aucune durée');assert.ok(!BAD.test(h))});
t('une journée : TTE et amplitude du moteur, pas d’HS',()=>{const A=load({'2026-09-30':day('08:00','16:30',[{d:'12:00',f:'12:30'}])});const d=A.C.data({today:'2026-10-07'});
  assert.equal(d.periode.debut,'2026-09-21');assert.equal(F(d.travail.tte),'8h00');assert.equal(F(d.travail.amp),'8h30');assert.equal(d.hs.total,0);assert.equal(d.travail.jours,1)});
t('plusieurs journées : HS 25 % seules (base 80h00 sur une quatorzaine)',()=>{const days={};
  for(let i=0;i<8;i++)days[A2(i)]=day('07:00','17:30',[{d:'12:00',f:'12:30'}]);
  function A2(i){return new Date(Date.parse('2026-09-21T12:00:00Z')+i*864e5).toISOString().slice(0,10)}
  const d=load(days).C.data({today:'2026-10-07'});assert.equal(F(d.quatorzaines[0].tte),'80h00');assert.equal(F(d.hs.h25),'10h00');assert.equal(d.hs.h50,0)});
t('HS 50 % au-delà de 86 h de base',()=>{const days={};for(let i=0;i<9;i++)days[new Date(Date.parse('2026-09-21T12:00:00Z')+i*864e5).toISOString().slice(0,10)]=day('06:00','17:00',[{d:'12:00',f:'12:30'}]);
  const d=load(days).C.data({today:'2026-10-07'});assert.equal(F(d.quatorzaines[0].tte),'94h30');assert.equal(F(d.hs.h25),'16h00');assert.equal(F(d.hs.h50),'8h30')});
t('nuit : service 20:00 → 04:00 compte 7h00 de nuit (21:00 → 04:00)',()=>{const d=load({'2026-09-22':day('20:00','04:00',[{d:'00:00',f:'00:30'}])}).C.data({today:'2026-10-07'});assert.equal(F(d.autres.nuit),'7h00')});
t('IDAJ : amplitude 13h00 → IDAJ 1h00 (au-delà de 12 h)',()=>{const d=load({'2026-09-22':day('06:00','19:00',[{d:'12:00',f:'12:30'}])}).C.data({today:'2026-10-07'});assert.equal(F(d.autres.idaj),'1h00')});
t('habillage = jours travaillés × réglage (minutes du moteur)',()=>{const d=load({'2026-09-22':day('08:00','16:00'),'2026-09-23':day('08:00','16:00')},{s:{...fx.s,hab:15}}).C.data({today:'2026-10-07'});assert.equal(F(d.autres.hab),'0h30')});
t('CP seuls : jours et valeur (réglage CP), aucune HS sous la base',()=>{const d=load({'2026-09-22':{t:'CP',p:[]},'2026-09-23':{t:'CP',p:[]}}).C.data({today:'2026-10-07'});
  assert.equal(d.autres.cpJours,2);assert.equal(F(d.autres.cpMin),'14h00');assert.equal(d.travail.tte,0);assert.equal(d.hs.total,0)});
t('période actuelle par défaut, sinon dernier relevé contenant une journée',()=>{
  assert.equal(load({'2026-10-05':day('08:00','16:00')}).C.data({today:'2026-10-07'}).periode.debut,'2026-09-21');
  assert.equal(L.C.data({today:'2026-10-07'}).periode.debut,'2026-08-24')});
t('données historiques (52 semaines plus tôt) : mêmes valeurs, relevé 25/08/2025 → 21/09/2025',()=>{
  const d=load(shift(fx.days,-364)).C.data({today:'2026-10-07'});assert.equal(d.periode.debut,'2025-08-25');assert.equal(d.periode.fin,'2025-09-21');
  assert.equal(F(d.travail.tte),'167h55');assert.equal(F(d.hs.h25),'32h00');assert.equal(F(d.hs.h50),'30h55');assert.equal(d.periode.moisPaie,'2025-09')});

console.log('ROMI1 (référence employeur, jamais mélangée)');
t('ROMI1 présent et comparable : deux valeurs et l’écart, statut « À vérifier », « Écart à analyser »',()=>{
  assert.equal(c.romi.statut,'comparable');assert.equal(F(c.romi.mesheures.tte),'167h55');assert.equal(F(c.romi.employeur.tte),'150h15');assert.equal(F(c.romi.ecartTte),'17h40');
  assert.equal(c.romi.aVerifier,true);const h=text(H);['MesHeures 167h55','ROMI1 (employeur) 150h15','Écart TTE 17h40','À vérifier','écart à analyser'].forEach(x=>assert.ok(h.includes(x),x))});
t('valeurs MesHeures et ROMI1 dans des blocs séparés, TTE MesHeures inchangé par ROMI1',()=>{
  const sans=load(fx.days).C.data(REF);assert.equal(sans.travail.tte,c.travail.tte);assert.equal(sans.hs.total,c.hs.total);
  assert.notEqual(c.romi.mesheures.tte,c.romi.employeur.tte)});
t('ROMI1 absent : « Pas de relevé ROMI1 disponible », aucune valeur employeur',()=>{const A=load(fx.days),h=text(A.C.html(REF));
  assert.equal(A.C.data(REF).romi.statut,'absent');assert.ok(h.includes('Pas de relevé ROMI1 disponible'));assert.ok(!h.includes('150h15'))});
t('ROMI1 non comparable (période différente) : « Non comparable », aucun écart',()=>{const A=load(fx.days,{romi:[{...ROMI_REF,periodStart:'2026-08-26',periodEnd:'2026-09-27'}]});
  const d=A.C.data(REF),h=text(A.C.html(REF));assert.equal(d.romi.statut,'non_comparable');assert.ok(h.includes('Non comparable'));assert.ok(!h.includes('Écart TTE'));assert.ok(!h.includes('150h15'))});
t('ROMI1 différent mais dans la tolérance (±15 min) : « concordant »',()=>{const A=load(fx.days,{romi:[{...ROMI_REF,ttePeriodH:167.75}]});
  const d=A.C.data(REF);assert.equal(F(d.romi.ecartTte),'0h10');assert.equal(d.romi.aVerifier,false);assert.ok(text(A.C.html(REF)).includes('concordant'))});
t('ROMI1 très différent dans l’autre sens : écart négatif affiché, aucune correction',()=>{const A=load(fx.days,{romi:[{...ROMI_REF,ttePeriodH:180}]});
  const d=A.C.data(REF);assert.equal(d.romi.ecartTte,-725);assert.ok(A.C.html(REF).includes('−12h05'));assert.equal(F(d.travail.tte),'167h55')});
t('HS payées issues du ROMI1 affichées dans « Déjà payé »',()=>{assert.ok(/HS payées \(ROMI1\) 125 % · 150 %[^·]*· en RC 0h00 · 0h00 16h00 · 4h20/.test(text(H)),text(H))});

console.log('Paie, mois de paie et reste à contrôler');
t('paie = mhCurrentPaySummary() telle quelle (brut, total versé), lien vers la paie',()=>{
  const s=L.win.mhCurrentPaySummary();assert.equal(c.paie.brut,s.grossEst);assert.equal(c.paie.netEst,s.netEst);assert.equal(c.paie.memePeriode,true);
  assert.ok(H.includes("tab('paie')"));assert.ok(text(H).includes('Voir le calcul de paie'));assert.ok(text(H).includes('3 463,54 €'))});
t('période de paie différente : signalée « autre période »',()=>{const A=load(fx.days,{db:{per:{start:'2026-09-21',nb:2}}});assert.ok(text(A.C.html(REF)).includes('autre période'))});
t('mois de paie présenté comme hypothèse à confirmer',()=>{assert.equal(c.periode.moisPaieStatut,'hypothèse à confirmer');assert.ok(text(H).includes('Mois de paie : septembre 2026 (rattachement à confirmer)'))});
t('reste à contrôler : écart ROMI1, alertes de la période (moteur)',()=>{const R=L.X.calcPer('2026-08-24',2);
  assert.equal(c.alertes.critiques,R.AL.filter(a=>a.lvl==='b').length);assert.ok(c.controle.some(x=>/Écart à analyser/.test(x.texte)))});
t('HS non payées renseignées : signalées à contrôler ; saisie Paie lue sans créer d’entrée',()=>{
  const A=load(fx.days),d=A.C.data(REF);assert.ok(d.controle.some(x=>/HS payées non renseignées/.test(x.texte)));assert.equal(A.X.DB.bul['2026-08-24'],undefined,'aucune entrée DB.bul créée');
  const B=load(fx.days,{db:{bul:{'2026-08-24':{p25:16,p50:4.33,rcOld:null,rcAcq:null}}}}).C;assert.ok(text(B.html(REF)).includes('HS payées (saisie Paie) HS 25 % · HS 50 % 16h00 · 4h20'))});
t('bulletin du mois rattaché : affiché avec « rattachement à confirmer », 11 IR / 3 IRU non mélangés aux 13 / 2',()=>{
  const B=load(fx.days,{db:{bulletins:[{mois:'2026-09',hs25H:16,hs50H:4.33,irN:11,iruN:3}]}}),d=B.C.data(REF);
  assert.equal(d.paye.bulletin.ir,11);assert.equal(d.autres.ir,13);assert.ok(text(B.C.html(REF)).includes('Bulletin septembre 2026'))});

console.log('Affichage compact (V37.0-E-r1)');
const fold=(h,k)=>{const m=h.match(new RegExp('<details class="mh37c-q mh37c-fold" data-fold="'+k+'"><summary><span>([^<]*)</span><b data-tone="([a-z]+)">([^<]*)</b>'));return m&&{label:m[1],tone:m[2],resume:m[3]}};
t('ROMI1, déjà payé, reste à contrôler repliés (aucun volet ouvert par défaut)',()=>{
  ['romi','paye','controle'].forEach(k=>assert.ok(fold(H,k),k));assert.ok(!/<details[^>]* open/.test(H))});
t('titres des volets : l’essentiel reste visible replié',()=>{
  assert.deepEqual(fold(H,'romi'),{label:'Comparaison ROMI1',tone:'warn',resume:'écart 17h40 ⚠️'});
  assert.deepEqual(fold(H,'controle'),{label:'Reste à contrôler',tone:'bad',resume:c.controle.length+' points'});
  assert.equal(fold(H,'paye').resume,'1 source')});
t('titres sans ROMI1, non comparable, concordant, sans paiement',()=>{
  assert.equal(fold(load(fx.days).C.html(REF),'romi').resume,'pas de relevé');
  assert.equal(fold(load(fx.days,{romi:[{...ROMI_REF,periodStart:'2026-08-26',periodEnd:'2026-09-27'}]}).C.html(REF),'romi').resume,'non comparable');
  const ok=fold(load(fx.days,{romi:[{...ROMI_REF,ttePeriodH:167.75}]}).C.html(REF),'romi');assert.deepEqual([ok.resume,ok.tone],['concordant ✓','ok']);
  assert.equal(fold(load(fx.days).C.html(REF),'paye').resume,'non renseigné')});
t('chiffres principaux toujours hors des volets (TTE, HS, autres temps)',()=>{
  const top=H.split('<details')[0];['167h55','173h25','32h00','30h55','62h55','0h45','3h00'].forEach(v=>assert.ok(top.includes(v),v))});
t('note des quatorzaines en style lisible (mh37c-note), plus en note atténuée',()=>{
  assert.ok(/<div class="mh37c-note">HS calculées quatorzaine par quatorzaine/.test(H));assert.ok(!/mh31-note">HS calculées/.test(H))});

console.log('Aucun double calcul, lecture seule');
t('ne recalcule pas le TTE : les valeurs suivent strictement calcPer (moteur substitué)',()=>{
  const A=load(fx.days);vm.runInContext('calcPer=function(s,nb){return {Q:Array.from({length:nb},(_,i)=>({start:addD(s,i*14),tte:111,amp:222,seuil:333,trav:4,nor:5,h25:6,h50:7})),AL:[],G:{tte:111*nb,amp:222*nb,seuil:333*nb,trav:4*nb,nor:5,h25:6*nb,h50:7*nb,nuit:8,idaj:9,hab:10,ir:1,iru:2,rc:0}}}',A.ctx);
  const d=A.C.data(REF);assert.equal(d.travail.tte,222);assert.equal(d.travail.amp,444);assert.equal(d.hs.h25,12);assert.equal(d.quatorzaines[1].tte,111);assert.equal(d.autres.nuit,8)});
t('aucune formule horaire dans le module (pas de lecture des horaires ni des pauses)',()=>{
  const src=fs.readFileSync(path.join(WEB,'app-v37-compteur.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.ok(!/\.deb\b|\]\.p\b|\.pz\b|mhEffectivePauses|mhMealChoice|minutesNuit|\bcd\(|cdRaw/.test(src),'lecture brute des journées')});
t('DB gelé : data() et html() sans aucune écriture (DB, pauses, repas, paie, constats)',()=>{
  const A=load(fx.days,{freeze:true,romi:[ROMI_REF],db:{constats:[],bulletins:[{mois:'2026-09',hs25H:16}]}});
  const before=JSON.stringify(A.X.DB);A.C.data(REF);A.C.html(REF);A.C.data({today:'2026-10-07'});assert.equal(JSON.stringify(A.X.DB),before);assert.deepEqual(A.writes,[])});
t('DB identique avant / après, aucun constat créé, ROMI1 intact',()=>{
  const romi=[clone(ROMI_REF)],A=load(fx.days,{romi}),before=JSON.stringify(A.X.DB);A.C.html(REF);A.C.html({today:'2026-10-07'});
  assert.equal(JSON.stringify(A.X.DB),before);assert.equal(A.X.DB.constats,undefined);assert.deepEqual(A.win.MH_ROMI.list(),romi);
  const d0=A.X.DB.days['2026-08-24'];assert.deepEqual(d0.p,fx.days['2026-08-24'].p);assert.equal(d0.panier,fx.days['2026-08-24'].panier)});
t('navigation ‹ › : change de relevé sans écrire, appelle le rendu de l’Accueil',()=>{
  const A=load(fx.days,{freeze:true});let n=0;A.win.MH31={renderHome:()=>n++};const before=JSON.stringify(A.X.DB);
  A.C.go(-1);const p1=A.C.data({today:'2026-10-07'}).periode.debut;A.C.go(1);const p2=A.C.data({today:'2026-10-07'}).periode.debut;A.C.go(0);const p3=A.C.data({today:'2026-10-07'}).periode.debut;
  assert.deepEqual([p1,p2,p3],['2026-07-27','2026-08-24','2026-09-21']);assert.equal(n,3);assert.equal(JSON.stringify(A.X.DB),before);assert.deepEqual(A.writes,[])});
t('window.DB non exposé',()=>{assert.equal(L.win.DB,undefined)});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.0-E passent.');
process.exit(fails?1:0);
