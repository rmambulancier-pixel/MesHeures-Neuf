#!/usr/bin/env node
/*
 * V37.0-0 Fondations — tests Node (sans navigateur).
 * Lancer : node tests/v37-fondations.test.js
 * Couvre : unités du contrôle légal (seuil critique 14 h), moteur jamais remplacé par
 * app-v35-8, ancienneté en fin de période, heures de nuit comptées sans majoration,
 * sauvegarde / import / restauration avec les relevés ROMI1.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const clone=o=>JSON.parse(JSON.stringify(o));
const H=(h,m)=>h*60+m;
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+e.message)}}

/* localStorage fidèle : méthodes non énumérables, Object.keys(localStorage) = clés stockées. */
function makeStorage(init){
  const ls={};
  Object.defineProperties(ls,{
    getItem:{value:k=>Object.prototype.hasOwnProperty.call(ls,k)?ls[k]:null},
    setItem:{value:(k,v)=>{ls[k]=String(v)}},
    removeItem:{value:k=>{delete ls[k]}},
  });
  Object.entries(init||{}).forEach(([k,v])=>ls.setItem(k,v));
  return ls;
}
/* Contexte navigateur minimal. runTimers : exécute les setTimeout (pour les modules à boot différé). */
function ctxOf(opts={}){
  const win={},ls=opts.ls||makeStorage(),out={alerts:[],confirms:[],files:[]};
  const ctx={window:win,document:{readyState:'complete',getElementById:()=>null,querySelectorAll:()=>[],dispatchEvent(){},addEventListener(){},createElement:()=>({style:{},click(){},remove(){}}),body:{appendChild(){}}},
    localStorage:ls,CustomEvent:function(n,o){this.type=n;this.detail=o&&o.detail},console:{...console,info(){},warn(){}},
    setTimeout:opts.runTimers?(f=>{try{f()}catch(e){}return 0}):(()=>0),
    alert:m=>out.alerts.push(String(m)),confirm:m=>{out.confirms.push(String(m));return opts.confirm!==false},
    Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  win.MesHeuresAndroid={beginFileExport:(n)=>{out.files.push({name:n,text:''});return true},appendFileExportChunk:c=>{out.files[out.files.length-1].text+=c},finishFileExport(){}};
  ctx.FileReader=function(){this.readAsText=f=>this.onload({target:{result:f.__text}})};
  ctx.globalThis=ctx;vm.createContext(ctx);
  return {ctx,win,ls,out};
}
function loadCore(c,days,s){
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(s||fx.s)+'};DB.days='+JSON.stringify(days||fx.days)+';mhNormalizeMealSettings();mhMigrateLegacyMealChoices();'+ // = load() au démarrage
    
    'function save(){localStorage.setItem(LS,JSON.stringify(DB));MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F,MH30DataEngine,LS};',c.ctx);
  return c.ctx.__x;
}
const run=(c,f)=>vm.runInContext(fs.readFileSync(path.join(WEB,f),'utf8'),c.ctx,{filename:f});

console.log('Contrôle légal : unités et seuil critique 14 h');
function legal(days,start,nb){const c=ctxOf();const X=loadCore(c,days);c.ctx.cd=X.cd;run(c,'app-legal.js');return {al:c.win.mhLegalAudit(start,nb),X}}
t('référence 24/08→20/09 : aucune fausse alerte « Amplitude > 14 h » (18 avant correction)',()=>{
  const {al}=legal(null,'2026-08-24',2);assert.equal(al.filter(a=>/14 h/.test(a.m)).length,0)});
t('référence : seule la journée à 12h45 (01/09) déclenche « Amplitude > 12 h », en « à vérifier »',()=>{
  const {al}=legal(null,'2026-08-24',2),a=al.filter(x=>/Amplitude > 12 h/.test(x.m));
  assert.deepEqual(a.map(x=>x.k),['2026-09-01']);assert.equal(a[0].lvl,'w')});
[['12h00','08:00','20:00',null],['12h01','08:00','20:01','w'],['14h00','06:00','20:00','w'],['14h01','06:00','20:01','b']].forEach(([lbl,deb,fin,lvl])=>
  t('amplitude '+lbl+' → '+(lvl==='b'?'critique (> 14 h)':lvl==='w'?'à vérifier (> 12 h)':'aucune alerte d\'amplitude'),()=>{
    const {al}=legal({'2026-08-24':{t:'T',deb,fin,p:[{d:'12:00',f:'12:30'}],mealV:3}},'2026-08-24',1);
    const a=al.filter(x=>/Amplitude/.test(x.m));
    if(!lvl)assert.equal(a.length,0);else{assert.equal(a.length,1);assert.equal(a[0].lvl,lvl)}}));
t('assistant V33 : seuil critique d\'amplitude aligné sur 14 h',()=>{
  const s=fs.readFileSync(path.join(WEB,'app-v33-assistant.js'),'utf8');
  assert.ok(/const C=\{ampWarn:720,ampMax:840,/.test(s));assert.ok(!/AMP_GT15|dépasse 15 h/.test(s))});

console.log('Moteur : jamais remplacé par app-v35-8 (même si DB est exposé)');
t('MH30DataEngine.day reste celui d\'app-core ; un CP qui garde des horaires ne compte ni amplitude ni IDAJ',()=>{
  const days=clone(fx.days);days['2026-09-08']={t:'CP',p:[],deb:'07:00',fin:'20:00'};
  const c=ctxOf({runTimers:true});const X=loadCore(c,days);const orig=X.MH30DataEngine.day;
  vm.runInContext('window.DB=DB;window.MH30DataEngine=MH30DataEngine;',c.ctx); // pire cas : DB exposé
  run(c,'app-v35-8-correction.js');
  assert.strictEqual(X.MH30DataEngine.day,orig,'moteur remplacé');
  const r=X.cd('2026-09-08');assert.equal(r.amp,0);assert.equal(r.idaj,0);
  const G=X.calcPer('2026-08-24',2).G;assert.equal(G.idaj,45);assert.equal(G.tte,H(167,55))});

console.log('Ancienneté appréciée en fin de période (embauche 09/09/2019)');
function anc(start,nb,s){const days={};days[start]={t:'T',deb:'08:00',fin:'16:00',p:[{d:'12:00',f:'12:30'}],mealV:3};
  const c=ctxOf();const X=loadCore(c,days,s||fx.s);const G=X.calcPer(start,nb).G;const b=X.brutOf(G);
  const l=b.L.find(x=>/anciennet/i.test(x[0]));return {G,b,l,X}}
t('période finissant le 01/09/2024 (4 ans) → 2 %',()=>{const {G,l}=anc('2024-08-19',1);assert.equal(G.end,'2024-09-01');assert.equal(l[1],'2 %')});
t('période finissant le 15/09/2024 (5 ans révolus le 09/09) → 4 %',()=>{const {G,l}=anc('2024-09-02',1);assert.equal(G.end,'2024-09-15');assert.equal(l[1],'4 %')});
t('le montant de la prime suit le taux de la période (2 % de la base, hors IR)',()=>{
  const {b,l}=anc('2024-08-19',1);const base=b.L.filter(x=>!/anciennet|taxable/i.test(x[0])).reduce((a,x)=>a+x[3],0);
  assert.ok(Math.abs(l[3]-base*0.02)<1e-9)});
t('taux forcé dans les réglages (anc) toujours prioritaire',()=>{const {l}=anc('2024-08-19',1,{...fx.s,anc:6});assert.equal(l[1],'6 %')});
t('référence 24/08→20/09/2026 : fin 20/09/2026, 7 ans → 4 %, brut inchangé',()=>{
  const c=ctxOf();const X=loadCore(c);const G=X.calcPer('2026-08-24',2).G;assert.equal(G.end,'2026-09-20');
  assert.equal(X.brutOf(G).L.find(x=>/anciennet/i.test(x[0]))[1],'4 %')});

console.log('Heures de nuit (21:00–06:00) comptées même avec une majoration à 0 %');
t('référence : 05:45→ 15 min (24/08) + 05:15→ 45 min (01/09) = 1h00',()=>{const c=ctxOf();const X=loadCore(c);assert.equal(X.calcPer('2026-08-24',2).G.nuit,60)});
t('majoration à 0 % : aucune ligne de paie de nuit, brut identique au calcul sans heures de nuit',()=>{
  const c=ctxOf();const X=loadCore(c);const G=X.calcPer('2026-08-24',2).G;const b=X.brutOf(G);
  assert.ok(!b.L.some(x=>/nuit/i.test(x[0])));assert.ok(Math.abs(b.tot-X.brutOf({...G,nuit:0}).tot)<1e-9)});
t('majoration à 25 % : ligne de nuit payée sur les heures comptées',()=>{
  const c=ctxOf();const X=loadCore(c,null,{...fx.s,nuitMaj:25});const G=X.calcPer('2026-08-24',2).G;
  const l=X.brutOf(G).L.find(x=>/nuit/i.test(x[0]));assert.ok(l);assert.ok(Math.abs(l[3]-60/60*14.2*0.25)<1e-9)});
t('service de nuit 22:00→06:00 : 8h00 de nuit',()=>{
  const c=ctxOf();const X=loadCore(c,{'2026-08-24':{t:'T',deb:'22:00',fin:'06:00',p:[],mealV:3}});assert.equal(X.cd('2026-08-24').nuit,480)});

console.log('Sauvegarde : relevés ROMI1 inclus');
const ROMI={'2026-07-27_2026-08-23':{schema:'romi1/1',savedAt:'2026-08-30T10:00:00Z',data:{periodStart:'2026-07-27',periodEnd:'2026-08-23',ttePeriodH:151.5,rcBalanceH:12.25}}};
const ROMI2={'2026-08-24_2026-09-20':{schema:'romi1/1',savedAt:'2026-09-28T10:00:00Z',data:{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:167.92}}};
function backupCtx(romi,opts){const c=ctxOf({...opts,ls:makeStorage(romi?{mh_romi_master_v35:JSON.stringify(romi)}:{})});const X=loadCore(c);run(c,'app-backup.js');return {c,X}}
const importFile=(c,obj)=>c.win.mhV30Import({files:[{__text:JSON.stringify(obj)}],value:'x'});
t('export JSON : contient DB et les relevés ROMI1',()=>{
  const {c}=backupCtx(ROMI);c.win.mhV30Export();const f=JSON.parse(c.out.files.pop().text);
  assert.equal(f.format,'MesHeures Backup');assert.ok(f.data.days['2026-08-24']);assert.deepEqual(f.romiMaster,ROMI)});
t('point de sécurité interne : contient les relevés ROMI1',()=>{
  const {c}=backupCtx(ROMI);const r=c.win.mhV30Backup('test');assert.ok(r.ok);assert.deepEqual(JSON.parse(c.ls.getItem(r.key)).romiMaster,ROMI)});
t('import d\'un fichier avec ROMI1 : relevés remplacés, copie de sécurité de l\'état précédent (ROMI1 compris)',()=>{
  const {c,X}=backupCtx(ROMI);const before=X.DB.days['2026-08-25'];
  importFile(c,{format:'MesHeures Backup',version:'37',data:{s:fx.s,days:{'2026-09-01':{t:'T',deb:'08:00',fin:'16:00',p:[]}}},romiMaster:ROMI2});
  assert.deepEqual(JSON.parse(c.ls.getItem('mh_romi_master_v35')),ROMI2);assert.ok(!X.DB.days['2026-08-25']);assert.ok(before);
  const safety=Object.keys(c.ls).filter(k=>k.includes('_v30_backup_')).map(k=>JSON.parse(c.ls.getItem(k))).find(x=>x.reason==='before-import');
  assert.deepEqual(safety.romiMaster,ROMI);assert.ok(safety.data.days['2026-08-25']);
  assert.ok(/dont 1 relevé\(s\) ROMI1/.test(c.out.confirms.pop()));assert.ok(/1 relevé\(s\) ROMI1 restauré/.test(c.out.alerts.pop()))});
t('import d\'un ancien fichier sans ROMI1 : relevés actuels conservés, jamais effacés',()=>{
  const {c}=backupCtx(ROMI);importFile(c,{format:'MesHeures Backup',version:'36.2.0',data:{s:fx.s,days:fx.days}});
  assert.deepEqual(JSON.parse(c.ls.getItem('mh_romi_master_v35')),ROMI);assert.ok(/absents du fichier, relevés actuels conservés/.test(c.out.alerts.pop()))});
t('import d\'un bloc ROMI1 invalide : refus, aucune donnée modifiée',()=>{
  const {c,X}=backupCtx(ROMI);const n=Object.keys(X.DB.days).length;
  importFile(c,{format:'MesHeures Backup',data:{s:fx.s,days:{}},romiMaster:{x:{data:{periodStart:'n/a'}}}});
  assert.equal(Object.keys(X.DB.days).length,n);assert.deepEqual(JSON.parse(c.ls.getItem('mh_romi_master_v35')),ROMI);
  assert.ok(/ROMI1 invalide/.test(c.out.alerts.pop()));assert.equal(c.out.confirms.length,0)});
t('import annulé (refus de confirmation) : rien n\'est modifié',()=>{
  const {c,X}=backupCtx(ROMI,{confirm:false});const n=Object.keys(X.DB.days).length;
  importFile(c,{format:'MesHeures Backup',data:{s:fx.s,days:{}},romiMaster:ROMI2});
  assert.equal(Object.keys(X.DB.days).length,n);assert.deepEqual(JSON.parse(c.ls.getItem('mh_romi_master_v35')),ROMI)});
t('restauration d\'un point de sécurité : DB et ROMI1 restaurés ensemble',()=>{
  const {c,X}=backupCtx(ROMI);const r=c.win.mhV30Backup('test');
  c.ls.setItem('mh_romi_master_v35',JSON.stringify(ROMI2));vm.runInContext('DB.days={};',c.ctx);
  assert.equal(c.win.mhV30Restore(r.key),true);
  assert.deepEqual(JSON.parse(c.ls.getItem('mh_romi_master_v35')),ROMI);assert.equal(Object.keys(X.DB.days).length,Object.keys(fx.days).length)});
t('aller-retour export → import : DB identique, ROMI1 identique',()=>{
  const {c}=backupCtx(ROMI);c.win.mhV30Export();const file=JSON.parse(c.out.files.pop().text);
  const d=backupCtx(null);importFile(d.c,file);
  assert.deepEqual(d.X.DB.days,file.data.days);assert.deepEqual(JSON.parse(d.c.ls.getItem('mh_romi_master_v35')),ROMI)});
t('sauvegarde chiffrée : ROMI1 inclus à l\'export, validé et restauré',()=>{
  const s=fs.readFileSync(path.join(WEB,'app-evidence.js'),'utf8');
  assert.ok(/data:DB,romiMaster:window\.mhRomiStore\?\.export\?\.\(\)/.test(s));
  assert.ok(/mhRomiStore\?\.validate\?\.\(payload\.romiMaster\)/.test(s));assert.ok(/mhRomiStore\?\.import\?\.\(payload\.romiMaster\)/.test(s))});

console.log(fails?`\n${fails} ÉCHEC(S)`:'\nTous les tests passent.');process.exit(fails?1:0);
