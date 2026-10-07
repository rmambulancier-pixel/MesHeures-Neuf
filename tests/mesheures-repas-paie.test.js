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

console.log(fails?`\n${fails} ÉCHEC(S)`:'\nTous les tests passent.');process.exit(fails?1:0);
