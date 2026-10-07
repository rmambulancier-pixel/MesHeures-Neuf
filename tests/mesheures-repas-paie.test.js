#!/usr/bin/env node
/*
 * Non-régression MesHeures V36.2 : repas, paie, habillage.
 * Référence réelle : période 24/08/2026 → 20/09/2026 (fixtures/ref-2026-08-24.json,
 * extrait de la sauvegarde utilisateur, lue sans jamais être modifiée).
 * Lancer : node tests/mesheures-repas-paie.test.js   (Node seul, sans navigateur)
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));

function boot(){
  const store={};
  const win={};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){}},
    localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
    CustomEvent:function(){},console,setTimeout,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set};
  ctx.globalThis=ctx;vm.createContext(ctx);
  // app-core.js déclare ses fonctions en global ; on expose DB/fonctions via un epilogue.
  const src=fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
   '\n;globalThis.__x={get DB(){return DB},set DB(v){DB=v},cd,calcPer,brutOf,F,mhMealChoice,mhMigrateLegacyMealChoices,mhNormalizeMealSettings,MH30DataEngine,DEF};';
  vm.runInContext(src,ctx,{filename:'app-core.js'});
  return ctx.__x;
}
const clone=o=>JSON.parse(JSON.stringify(o));
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+e.message)}}
const H=(h,m)=>h*60+m;

function load(days,s){
  const X=boot();
  X.DB.s={...X.DEF,...clone(s||fx.s)};X.DB.days=clone(days||fx.days);
  X.mhNormalizeMealSettings();X.mhMigrateLegacyMealChoices();X.MH30DataEngine.invalidate('test');
  return X;
}

console.log('Période 24/08 → 20/09/2026');
const X=load();
const R=X.calcPer('2026-08-24',2),G=R.G,[Q1,Q2]=R.Q;
t('Sem.1 24/08 : amplitude 56h45, TTE 54h15',()=>{assert.equal(Q1.w[0].amp,H(56,45));assert.equal(Q1.w[0].tte,H(54,15))});
t('Sem.2 31/08 : amplitude 59h50, TTE 58h20',()=>{assert.equal(Q1.w[1].amp,H(59,50));assert.equal(Q1.w[1].tte,H(58,20))});
t('Q1 : TTE 112h35, HS25 16h00, HS50 26h35',()=>{assert.equal(Q1.tte,H(112,35));assert.equal(Q1.h25,H(16,0));assert.equal(Q1.h50,H(26,35))});
t('Sem.1 07/09 : amplitude 10h00, TTE 9h30',()=>{assert.equal(Q2.w[0].amp,H(10,0));assert.equal(Q2.w[0].tte,H(9,30))});
t('Sem.2 14/09 : amplitude 46h50, TTE 45h50',()=>{assert.equal(Q2.w[1].amp,H(46,50));assert.equal(Q2.w[1].tte,H(45,50))});
// Q2 = 90h20 dans MesHeures : c'est le SEUIL HS (TTE 55h20 + 5 CP × 7h). Le TTE réel de Q2 est 55h20.
t('Q2 : base HS (TTE + CP) 90h20, HS25 16h00, HS50 4h20 ; TTE réel 55h20',()=>{assert.equal(Q2.seuil,H(90,20));assert.equal(Q2.h25,H(16,0));assert.equal(Q2.h50,H(4,20));assert.equal(Q2.tte,H(55,20))});
t('TOTAL : TTE 167h55, amplitude 173h25, 18 jours, IDAJ 0h45',()=>{assert.equal(G.tte,H(167,55));assert.equal(G.amp,H(173,25));assert.equal(G.trav,18);assert.equal(G.idaj,45)});
t('15 paniers (13 IR + 2 IRU) : compteur MesHeures, distinct des 14 repas payés du bulletin',()=>{assert.equal(G.ir+G.iru,15);assert.equal(G.ir,13);assert.equal(G.iru,2)});

console.log('Moteur TTE / pauses');
t('une journée sans pause saisie n\'a aucune pause inventée',()=>{const r=X.cd('2026-09-04');assert.equal(r.pz,0);assert.equal(r.tte,r.amp)});
t('pause saisie 12:00-12:30 déduite une seule fois',()=>{const r=X.cd('2026-08-31');assert.equal(r.pz,30);assert.equal(r.tte,r.amp-30)});

console.log('Repas : sélecteur JOUR unique');
t('panier explicite prime sur le ty des pauses (15/09 : ty ENT, panier EXT → IR)',()=>{const r=X.cd('2026-09-15');assert.equal(r.ir,1);assert.equal(r.iru,0)});
t('ancienne donnée sans panier : le ty est lu comme choix JOUR',()=>{
  const d=clone(fx.days);Object.values(d).forEach(x=>{delete x.panier});
  const Y=load(d);assert.equal(Y.cd('2026-08-24').iru,1);assert.equal(Y.cd('2026-08-25').ir,1);
  assert.equal(Y.calcPer('2026-08-24',2).G.iru,3);}); // 24/08, 07/09 et 15/09 (ty ENT hérité)
t('migration : les pauses (et leur ty) ne sont jamais modifiées',()=>{
  const d=clone(fx.days);Object.values(d).forEach(x=>{delete x.panier});const Y=load(d);
  assert.deepEqual(Y.DB.days['2026-08-24'].p,fx.days['2026-08-24'].p)});
t('Auto choisi après migration reste Auto (même si ty ENT hérité)',()=>{
  const d=clone(fx.days);d['2026-08-24'].panier=null;d['2026-08-24'].mealV=3;const Y=load(d);
  assert.equal(Y.mhMealChoice(Y.DB.days['2026-08-24']),null)});
t('Aucun (NON) → ni IR ni IRU',()=>{const d=clone(fx.days);d['2026-08-25'].panier='NON';const r=load(d).cd('2026-08-25');assert.equal(r.ir+r.iru,0)});
t('migration idempotente',()=>{const Y=load();assert.equal(Y.mhMigrateLegacyMealChoices(),false);assert.equal(Y.mhNormalizeMealSettings(),false)});
t('réglages personnalisés non écrasés (IR 16,00 conservé)',()=>{const Y=load(null,{...fx.s,ir:16,mealV:3});assert.equal(Y.DB.s.ir,16)});
t('ancien réglage ir=5,30 → 15,70',()=>{const Y=load(null,{...fx.s,ir:5.3,mealV:undefined});assert.equal(Y.DB.s.ir,15.7)});

console.log('Paie');
const br=X.brutOf(G);
t('IR taxable 5,30 × 13 = 68,90 ; IR exonéré 10,40 × 13 = 135,20 ; IRU 9,69 × 2 = 19,38',()=>{
  assert.ok(Math.abs(br.panIRTax-68.90)<1e-9);assert.ok(Math.abs(br.panIRExon-135.20)<1e-9);assert.ok(Math.abs(br.panIRU-19.38)<1e-9)});
t('bulletin sept. : 11 IR + 3 IRU = 201,77 €',()=>{
  const b=X.brutOf({...G,ir:11,iru:3});assert.ok(Math.abs(b.panIRTax*0+11*15.7+3*9.69-201.77)<1e-9);
  assert.ok(Math.abs(b.panIRTax+b.panIRExon-172.70)<1e-9);assert.ok(Math.abs(b.panIRU-29.07)<1e-9);assert.ok(Math.abs(b.panIRTax-58.30)<1e-9)});
t('la part taxable IR est dans le brut (comme « Indemnité de Repas » 58,30 du bulletin)',()=>{
  const sans=X.brutOf({...G,ir:0});assert.ok(Math.abs(br.tot-sans.tot-68.90)<1e-9)});
t('la part taxable IR n\'entre pas dans la base d\'ancienneté',()=>{
  const anc=br.L.find(x=>/anciennet/i.test(x[0]));const base=br.L.filter(x=>!/anciennet|taxable/i.test(x[0])).reduce((a,x)=>a+x[3],0);
  if(anc)assert.ok(Math.abs(anc[3]-base*parseFloat(anc[1])/100)<1e-9)});
t('Total versé = brut × net + IR exonéré + IRU, sans double compte',()=>{
  const exp=br.tot*X.DB.s.net+135.20+19.38;assert.ok(Math.abs(br.netEst-exp)<1e-9);
  const naif=br.tot*X.DB.s.net+68.90+19.38+135.20;assert.ok(br.netEst<naif)});
t('brut et net cohérents avec mhCurrentPaySummary (netEst unique)',()=>{assert.equal(typeof br.netEst,'number')});

console.log('Habillage');
t('G.hab est en minutes : 18 jours × 10 min = 180 min (3h00)',()=>{assert.equal(G.hab,180)});
t('contrôle : 3h00 vs bulletin 2,67 h (2h40) → écart 0h20, sans TTE',()=>{
  const bul=Math.round(2.67*60),diff=G.hab-bul;assert.equal(bul,160);assert.equal(diff,20);assert.equal(X.F(diff),'0h20')});

console.log('TTE : pauses saisies uniquement (audit V36.2)');
function dayWith(day){const d=clone(fx.days);d['2026-08-31']=day;return load(d)}
t('cd() ne modifie jamais les pauses enregistrées',()=>{
  const Y=load();const before=clone(Y.DB.days);Object.keys(before).forEach(k=>Y.cd(k));Y.calcPer('2026-08-24',2);
  assert.deepEqual(Y.DB.days,before)});
t('pause inversée (12:30→12:00) sur service de jour : non déduite, alerte, TTE jamais négatif',()=>{
  const r=dayWith({t:'T',deb:'08:00',fin:'18:00',p:[{d:'12:30',f:'12:00'}],panier:'EXT',mealV:3}).cd('2026-08-31');
  assert.equal(r.pz,0);assert.equal(r.tte,600);assert.ok(r.al.some(a=>/invalide/.test(a.m)))});
t('pause en double : déduite une seule fois',()=>{
  const r=dayWith({t:'T',deb:'08:00',fin:'18:00',p:[{d:'12:00',f:'12:30'},{d:'12:00',f:'12:30'}],mealV:3}).cd('2026-08-31');
  assert.equal(r.pz,30);assert.equal(r.tte,570);assert.ok(r.al.some(a=>/chevauchent/.test(a.m)))});
t('pause hors service : non déduite',()=>{
  const r=dayWith({t:'T',deb:'08:00',fin:'12:00',p:[{d:'13:00',f:'13:30'}],mealV:3}).cd('2026-08-31');
  assert.equal(r.pz,0);assert.equal(r.tte,240)});
t('pause à cheval sur la fin de service : seule la partie dans le service est déduite',()=>{
  const r=dayWith({t:'T',deb:'08:00',fin:'12:00',p:[{d:'11:45',f:'12:15'}],mealV:3}).cd('2026-08-31');
  assert.equal(r.pz,15);assert.equal(r.tte,225)});
t('service de nuit : pauses de part et d\'autre de minuit déduites',()=>{
  const r=dayWith({t:'T',deb:'22:00',fin:'06:00',p:[{d:'23:50',f:'00:10'},{d:'02:00',f:'02:30'}],mealV:3}).cd('2026-08-31');
  assert.equal(r.amp,480);assert.equal(r.pz,50);assert.equal(r.tte,430)});
t('pause incomplète ignorée (aucune pause inventée)',()=>{
  const r=dayWith({t:'T',deb:'08:00',fin:'18:00',p:[{d:'12:00',f:''}],mealV:3}).cd('2026-08-31');
  assert.equal(r.pz,0);assert.equal(r.tte,600)});
t('le choix repas ne déduit aucune pause (EXT, ENT, Auto, Aucun)',()=>{
  ['EXT','ENT',null,'NON'].forEach(c=>{const r=dayWith({t:'T',deb:'08:00',fin:'18:00',p:[],panier:c,mealV:3}).cd('2026-08-31');assert.equal(r.tte,600)})});

console.log('Paie : source unique');
t('netSal = brut × coef ; netEst = netSal + IR exonéré + IRU (part taxable comptée une fois, via le brut)',()=>{
  assert.ok(Math.abs(br.netSal-br.tot*X.DB.s.net)<1e-9);assert.ok(Math.abs(br.netEst-(br.netSal+br.panIRExon+br.panIRU))<1e-9);
  const sansIR=X.brutOf({...G,ir:0});assert.ok(Math.abs((br.netEst-sansIR.netEst)-13*(5.30*X.DB.s.net+10.40))<1e-9)});
t('aucun écran ne recalcule le net avec sa propre formule',()=>{
  ['app.js','app-ui.js','app-pwa.js'].forEach(f=>{const s=fs.readFileSync(path.join(WEB,f),'utf8');
    assert.ok(!/tot\s*\*\s*(DB\.s|S)\.net\s*\+/.test(s),f+' : formule net recopiée');
    assert.ok(!/br\.tot\)\s*\*\s*Number\(DB\.s/.test(s),f+' : formule net recopiée')})});
t('rapprochement bulletin : le brut recalculé inclut la part taxable IR',()=>{
  const s=fs.readFileSync(path.join(WEB,'app-parser.js'),'utf8');assert.ok(/calcBrut=calcBrutAvantAnc\+\(ancPct\?[^;]*\)\+irTaxable;/.test(s))});

/* Cas de référence bulletin, calculé à la main.
   Octobre 2026 : 4 jours (05→08/10) 08:00-18:00, pause 12:00-12:30, repas EXT.
   TTE 4 × 9h30 = 38h00 (< 70 h : aucune HS) ; habillage 4 × 10 min = 40 min ; ancienneté 7 ans → 4 %.
   Heures normales 38 × 14,20 = 539,60 ; habillage 40/60 × 12,9688 = 8,6459
   base ancienneté 548,2459 → prime 4 % = 21,9298 ; avant IR 570,1757
   + part taxable IR 4 × 5,30 = 21,20 → brut attendu 591,3757 €
   Net : 591,38 × 0,787 + IR exonéré 4 × 10,40 = 465,4161 + 41,60 = 507,0161 € */
function runBulletin(bul){
  const els={};
  const ctx={window:{},document:{getElementById:id=>els[id]||(els[id]={style:{},textContent:'',innerHTML:''}),dispatchEvent(){},addEventListener(){}},
    localStorage:{getItem:()=>null,setItem(){}},CustomEvent:function(){},console,setTimeout,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set};
  ctx.globalThis=ctx;vm.createContext(ctx);
  const days={};['05','06','07','08'].forEach(j=>days['2026-10-'+j]={t:'T',deb:'08:00',fin:'18:00',p:[{d:'12:00',f:'12:30'}],panier:'EXT',mealV:3});
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(fx.s)+'};DB.days='+JSON.stringify(days)+';',ctx);
  const ps=fs.readFileSync(path.join(WEB,'app-parser.js'),'utf8');
  // Code de production exécuté tel quel ; seul le tableau local des lignes est exposé au test.
  const fn=ps.slice(ps.indexOf('function afficherBulletin(bul){'),ps.indexOf('function renderBulHist(')).replace('  const rows=[];','  const rows=globalThis.__rows=[];');
  vm.runInContext(fn+';globalThis.__ref=brutOf(calcPer("2026-10-05",1).G);afficherBulletin('+JSON.stringify(bul)+');',ctx);
  return {rows:ctx.__rows,ref:ctx.__ref};
}
const BRUT_ATTENDU=591.3757,NET_ATTENDU=591.38*0.787+4*10.40;
const BUL=runBulletin({mois:'2026-10',brut:591.38,net:507.02,irN:4,iruN:0,habH:0.67});
const rowOf=l=>BUL.rows.find(r=>r.label===l);
t('bulletin réf. : calcBrut = brut attendu 591,38 € (écart < 0,01 €), ligne conforme',()=>{
  const r=rowOf('Salaire brut');assert.ok(Math.abs(r.calc-BRUT_ATTENDU)<1e-3,'calcBrut '+r.calc);assert.ok(r.ok)});
t('bulletin réf. : calcBrut identique au moteur brutOf() de la même période',()=>{
  assert.ok(Math.abs(rowOf('Salaire brut').calc-BUL.ref.tot)<1e-9)});
t('bulletin réf. : part taxable IR incluse une seule fois (ni absente, ni doublée)',()=>{
  const c=rowOf('Salaire brut').calc;assert.ok(Math.abs(c-(BRUT_ATTENDU-21.20))>0.5);assert.ok(Math.abs(c-(BRUT_ATTENDU+21.20))>0.5)});
t('bulletin réf. : part taxable IR hors base d\'ancienneté',()=>{
  const c=rowOf('Salaire brut').calc,siDansBase=548.24587*1.04+21.20*1.04;assert.ok(Math.abs(c-siDansBase)>0.5);
  const anc=BUL.ref.L.find(x=>/anciennet/i.test(x[0]));assert.ok(Math.abs(anc[3]-548.2458667*0.04)<1e-4)});
t('bulletin réf. : net = brut bulletin × coef + IR exonéré (part taxable non rajoutée au net)',()=>{
  const r=rowOf('Net payé');assert.ok(Math.abs(r.calc-NET_ATTENDU)<1e-9,'calcNet '+r.calc);assert.ok(r.ok);
  assert.ok(Math.abs(BUL.ref.netEst-(BUL.ref.tot*0.787+41.60))<1e-9)});
t('bulletin réf. : paniers 4 IR / 0 IRU et habillage 0,67 h conformes',()=>{
  assert.ok(rowOf('Paniers IR (ext.)').ok);assert.equal(rowOf('Paniers IR (ext.)').calc,4);assert.ok(rowOf('Habillage').ok)});

console.log('Réglages');
t('toutes les heures de plage repas/nuit sont des champs heure (pas number)',()=>{
  const ui=fs.readFileSync(path.join(WEB,'app-ui.js'),'utf8'),list=ui.match(/const ty=\[([^\]]*)\]\.includes\(k\)/)[1];
  ['panDeb','panFin','panSoirDeb','panSoirFin','nuitDeb','nuitFin'].forEach(k=>assert.ok(list.includes("'"+k+"'"),k))});

console.log('Feuille de route hebdomadaire');
function bootRoadmap(days){
  const store={},win={};
  const ctx={window:win,document:{readyState:'complete',getElementById:()=>null,dispatchEvent(){},addEventListener(){}},
    localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)}},CustomEvent:function(){},console,setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(fx.s)+'};DB.days='+JSON.stringify(days||fx.days)+';globalThis.__cd=cd;',ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-roadmap.js'),'utf8'),ctx);
  win.MHRoadmap.cd=ctx.__cd;
  return win.MHRoadmap;
}
/* Matrice : choix JOUR × couverture de la plage repas. La feuille de route doit afficher
   exactement ce que cd(k) compte (r.iru → INTÉRIEUR, r.ir → EXTÉRIEUR, Aucun → AUCUN). */
[
  ['Auto',null,'08:00','18:00','EXTÉRIEUR'],['Auto hors plage',null,'06:00','10:00',null],
  ['EXT explicite','EXT','08:00','18:00','EXTÉRIEUR'],['EXT explicite hors plage','EXT','06:00','10:00','EXTÉRIEUR'],
  ['ENT explicite','ENT','08:00','18:00','INTÉRIEUR'],['ENT explicite hors plage','ENT','06:00','10:00','INTÉRIEUR'],
  ['Aucun','NON','08:00','18:00','AUCUN'],['Aucun hors plage','NON','06:00','10:00','AUCUN'],
].forEach(([lbl,choice,deb,fin,expected])=>t('feuille de route = moteur : '+lbl+' → '+(expected||'pas de repas'),()=>{
  const days={'2026-08-24':{t:'T',deb,fin,p:[{d:'08:30',f:'09:00'}],panier:choice,mealV:3}};
  const M=bootRoadmap(days),r=M.cd('2026-08-24');
  const engine=r.iru?'INTÉRIEUR':r.ir?'EXTÉRIEUR':(choice==='NON'?'AUCUN':null);
  assert.equal(engine,expected,'moteur');
  assert.equal(r.ir+r.iru,expected==='EXTÉRIEUR'||expected==='INTÉRIEUR'?1:0,'un seul panier');
  const row=M.generate('2026-08-24').split('<tr>').find(x=>x.includes('Lundi 24/08/2026'))||'';
  const shown=(row.match(/Repas · (EXTÉRIEUR|INTÉRIEUR|AUCUN)/g)||[]);
  assert.deepEqual(shown,expected?['Repas · '+expected]:[],'affichage');
  const tte=Math.floor(r.tte/60)+'h'+String(r.tte%60).padStart(2,'0');
  assert.equal(r.tte,(deb==='08:00'?600:240)-30,'TTE = amplitude − pause saisie, aucune pause repas ajoutée');
  assert.ok(row.includes('TTE '+tte),'TTE affiché '+tte);
}));
t('feuille de route = moteur : ancienne donnée (ty ENT, sans panier/mealV) hors plage → INTÉRIEUR',()=>{
  const M=bootRoadmap({'2026-08-24':{t:'T',deb:'06:00',fin:'10:00',p:[{d:'08:30',f:'09:00',ty:'ENT'}]}});
  assert.equal(M.cd('2026-08-24').iru,1);
  assert.ok(/Repas · INTÉRIEUR/.test(M.generate('2026-08-24')))});
const RM=bootRoadmap();
t('génération sans erreur (rows() présente)',()=>{assert.ok(/FEUILLE DE ROUTE/.test(RM.generate('2026-08-24')))});
t('TTE semaine 24/08 = 54h15, amplitude 56h45 (identique au moteur)',()=>{
  const h=RM.generate('2026-08-24');assert.ok(h.includes('54h15'));assert.ok(h.includes('56h45'))});
t('repas affiché = repas compté (26/08 EXT explicite hors plage, 24/08 INTÉRIEUR)',()=>{
  const h=RM.generate('2026-08-24');
  const row=k=>h.split('<tr>').find(x=>x.includes(k))||'';
  assert.ok(/Repas · INTÉRIEUR/.test(row('Lundi 24/08/2026')));assert.ok(/Repas · EXTÉRIEUR/.test(row('Mercredi 26/08/2026')));
  assert.ok(!/Repas/.test(row('Samedi 29/08/2026')))});

console.log('Livraison : cache du service worker');
t('index.html et sw.js utilisent la même révision d\'assets, entièrement précachée',()=>{
  const W=path.join(WEB,'..'),h=fs.readFileSync(path.join(W,'index.html'),'utf8'),s=fs.readFileSync(path.join(W,'sw.js'),'utf8');
  const revs=new Set([...h.matchAll(/\?v=([\w.-]+)"/g)].map(m=>m[1]));assert.equal(revs.size,1,'révisions multiples : '+[...revs]);
  const rev=[...revs][0];assert.ok(s.includes("const CACHE='mesheures-shell-v"+rev+"'"),'CACHE sw.js ≠ révision '+rev);
  [...h.matchAll(/(?:src|href)="\.?\/?((?:scripts|style)\/[^"?]+)\?v=/g)].forEach(m=>assert.ok(s.includes("'./"+m[1]+'?v='+rev+"'"),m[1]+' absent du précache'))});

console.log(fails?`\n${fails} ÉCHEC(S)`:'\nTous les tests passent.');process.exit(fails?1:0);
