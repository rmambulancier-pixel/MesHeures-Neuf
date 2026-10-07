#!/usr/bin/env node
/*
 * V37.0-A — Smart Control explicable. Tests Node (sans navigateur).
 * Lancer : node tests/v37-control.test.js
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const clone=o=>JSON.parse(JSON.stringify(o));
const H=(h,m)=>h*60+m;
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+e.message)}}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}

/* Charge app-core + app-v37-control. romi : relevés renvoyés par MH_ROMI.list(). freeze : DB gelé (toute écriture lève une erreur). */
function load(days,opts={}){
  const writes=[],win={};
  const ls={getItem:()=>null,setItem:(k,v)=>writes.push(k),removeItem:k=>writes.push(k)};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){}},localStorage:ls,CustomEvent:function(){},
    console,setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(opts.s||fx.s)+'};DB.days='+JSON.stringify(days)+';mhNormalizeMealSettings();mhMigrateLegacyMealChoices();'+
    'globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F};',ctx);
  if(opts.romi)win.MH_ROMI={list:()=>clone(opts.romi)};
  if(opts.freeze)vm.runInContext('Object.freeze(DB);',ctx),deepFreeze(ctx.__x.DB);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-v37-control.js'),'utf8'),ctx,{filename:'app-v37-control.js'});
  return {C:win.MHControl,X:ctx.__x,writes,ctx,win};
}
const day=(deb,fin,p,extra)=>Object.assign({t:'T',deb,fin,p:p||[],mealV:3,panier:'NON'},extra||{});
const codes=s=>s.alerts.map(a=>a.code+':'+a.level).sort();

console.log('Cas de base');
t('aucune donnée : « Données insuffisantes », pas de score, aucune alerte',()=>{
  const {C}=load({});const s=C.analyze({end:'2026-09-20'});
  assert.equal(s.status,'insufficient');assert.equal(s.label,'Données insuffisantes');assert.equal(s.score,null);
  assert.equal(s.alerts.length,0);assert.equal(s.workedDays,0)});
t('données hors fenêtre de 28 jours : toujours « Données insuffisantes »',()=>{
  const {C}=load({'2026-06-01':day('08:00','16:00',[{d:'12:00',f:'12:30'}])});const s=C.analyze({end:'2026-09-20'});
  assert.equal(s.status,'insufficient');assert.equal(s.score,null)});
t('1 journée OK : 🟢, 7 contrôles conformes, score 100 %',()=>{
  const {C}=load({'2026-09-14':day('08:00','16:00',[{d:'12:00',f:'12:30'}])});const s=C.analyze({end:'2026-09-20'});
  assert.equal(s.status,'ok');assert.equal(s.label,'Dossier maîtrisé');assert.equal(s.alerts.length,0);
  assert.deepEqual(s.counts,{bad:0,warn:0,ok:8,total:8}); // 7 contrôles jour + 1 semaine
  assert.equal(s.score,100);assert.equal(s.next,null)});
t('1 alerte « à vérifier » (amplitude 12h30, TTE 10h00) : 🟠, explication complète',()=>{
  const {C}=load({'2026-09-14':day('06:00','18:30',[{d:'12:00',f:'13:30'},{d:'15:00',f:'16:00'}])});const s=C.analyze({end:'2026-09-20'});
  assert.equal(s.status,'warn');assert.deepEqual(codes(s),['AMPLITUDE:warn']);
  const a=s.alerts[0],data=Object.fromEntries(a.data);
  assert.equal(a.dateLabel,'14/09/2026');assert.ok(/12 h en principe/.test(a.rule));assert.ok(/art\. 3/.test(a.source));
  assert.equal(data.Amplitude,'12h30');assert.equal(data.TTE,'10h00');assert.equal(data['Pauses déduites'],'2h30 (2 saisies)');assert.equal(data.Seuil,'12h00 (principe)');
  assert.ok(/12h30/.test(a.result));assert.ok(/^À vérifier/.test(a.reason));
  assert.deepEqual(a.actions,[{label:'Ouvrir la journée du 14/09',kind:'day',target:'2026-09-14'}])});
t('1 critique (amplitude 14h30, TTE 10h00) : 🔴',()=>{
  const {C}=load({'2026-09-14':day('05:30','20:00',[{d:'12:00',f:'14:00'},{d:'16:00',f:'18:00'},{d:'18:30',f:'19:00'}])});const s=C.analyze({end:'2026-09-20'});
  assert.equal(s.status,'bad');assert.deepEqual(codes(s),['AMPLITUDE:bad']);assert.equal(Object.fromEntries(s.alerts[0].data).Seuil,'14h00 (maximum)');
  assert.ok(/^Critique/.test(s.alerts[0].reason))});
t('seuils exacts : amplitude 12h00 et 14h00, TTE 10h00 et 12h00 (seuils non dépassés = pas de niveau supérieur)',()=>{
  const lv=(deb,fin,p)=>codes(load({'2026-09-14':day(deb,fin,p)}).C.analyze({end:'2026-09-20'}));
  assert.deepEqual(lv('06:00','18:00',[{d:'12:00',f:'14:00'}]),[]);                       // amp 12h00, TTE 10h00
  assert.deepEqual(lv('06:00','20:00',[{d:'12:00',f:'14:00'}]),['AMPLITUDE:warn','TTE:warn']); // amp 14h00 (pas critique), TTE 12h00 (pas critique)
});
t('pause : 6h00 de TTE sans pause → à vérifier ; 20 min de pause → conforme',()=>{
  const a=codes(load({'2026-09-14':day('08:00','14:00',[])}).C.analyze({end:'2026-09-20'}));
  const b=codes(load({'2026-09-14':day('08:00','14:20',[{d:'11:00',f:'11:20'}])}).C.analyze({end:'2026-09-20'}));
  assert.deepEqual(a,['PAUSE:warn']);assert.deepEqual(b,[])});

console.log('Plusieurs alertes, doublons, regroupement');
t('plusieurs alertes : critiques d\'abord, puis à vérifier, du plus récent au plus ancien',()=>{
  const {C}=load({'2026-09-14':day('05:30','20:00',[{d:'12:00',f:'13:00'},{d:'16:00',f:'17:00'},{d:'18:00',f:'18:30'}]),
    '2026-09-16':day('06:00','18:30',[{d:'12:00',f:'12:30'},{d:'15:00',f:'16:00'}]),'2026-09-17':day('08:00','15:00',[])});
  const s=C.analyze({end:'2026-09-20'});
  assert.deepEqual(s.groups.map(g=>g.level+' '+g.key),['bad 2026-09-14','warn 2026-09-17','warn 2026-09-16']);
  assert.equal(s.next.title,'Contrôler le 14/09');assert.deepEqual(s.next.action,{label:'Ouvrir la journée du 14/09',kind:'day',target:'2026-09-14'})});
t('doublon moteur + règle (amplitude 14h30) : une seule alerte, message du moteur rattaché',()=>{
  const {C,X}=load({'2026-09-14':day('05:30','20:00',[{d:'12:00',f:'13:00'},{d:'16:00',f:'17:00'},{d:'18:00',f:'18:30'}])});
  assert.ok(X.cd('2026-09-14').al.some(a=>/Amplitude .* > 14h réglementaires/.test(a.m)),'le moteur signale bien l\'amplitude');
  const s=C.analyze({end:'2026-09-20'}),amp=s.alerts.filter(a=>a.code==='AMPLITUDE');
  assert.equal(amp.length,1);assert.equal(amp[0].engineMessages.length,1)});
t('doublon moteur + règle (6 h sans pause) : une seule alerte PAUSE',()=>{
  const {C,X}=load({'2026-09-14':day('08:00','15:00',[])});assert.ok(X.cd('2026-09-14').al.some(a=>/sans pause/.test(a.m)));
  const s=C.analyze({end:'2026-09-20'});assert.deepEqual(codes(s),['PAUSE:warn']);assert.equal(s.alerts[0].engineMessages.length,1)});
t('pauses en double et pause invalide le même jour : une seule alerte SAISIE, tous les messages conservés',()=>{
  const {C}=load({'2026-09-14':day('08:00','18:00',[{d:'12:00',f:'12:30'},{d:'12:00',f:'12:30'},{d:'15:30',f:'15:00'}])});
  const s=C.analyze({end:'2026-09-20'}),sa=s.alerts.filter(a=>a.code==='SAISIE');
  assert.equal(sa.length,1);assert.equal(sa[0].engineMessages.length,2);assert.equal(s.groups.length,1)});
t('une journée = une carte : ses contrôles en anomalie regroupés, niveau = le plus grave',()=>{
  const {C}=load({'2026-09-14':day('05:15','18:00',[{d:'12:00',f:'12:30'}])}); // amp 12h45 (🟠) + TTE 12h15 (🔴)
  const s=C.analyze({end:'2026-09-20'});assert.equal(s.groups.length,1);assert.equal(s.groups[0].level,'bad');
  assert.deepEqual(s.groups[0].alerts.map(a=>a.code),['TTE','AMPLITUDE'])});
t('alerte moteur inconnue : jamais masquée (famille MOTEUR, à vérifier)',()=>{
  const {C,X}=load({'2026-09-14':day('08:00','16:00',[{d:'12:00',f:'12:30'}])});
  const r=X.cd('2026-09-14');r.al.push({lvl:'w',m:'Message inédit du moteur'}); // cache du moteur
  const s=C.analyze({end:'2026-09-20'});assert.deepEqual(codes(s),['MOTEUR:warn']);assert.equal(s.alerts[0].result,'Message inédit du moteur')});

console.log('Journées particulières');
t('journée passée sans fin : 🔴 horaires incomplets (TTE et paie non calculés)',()=>{
  const {C}=load({'2026-09-14':{t:'T',deb:'08:00',p:[],mealV:3}});const s=C.analyze({end:'2026-09-20'});
  assert.deepEqual(codes(s),['HORAIRES:bad']);assert.equal(Object.fromEntries(s.alerts[0].data).Fin,'manquante')});
t('service en cours aujourd\'hui : non jugé',()=>{
  const {C,ctx}=load({});const k=vm.runInContext('today()',ctx);
  const L=load({[k]:{t:'T',deb:'08:00',p:[],mealV:3,running:true,startEpoch:1}});const s=L.C.analyze({end:k});
  assert.equal(s.workedDays,0);assert.equal(s.status,'insufficient')});
t('CP, repos, maladie : pas des journées travaillées, aucun contrôle',()=>{
  const {C}=load({'2026-09-14':{t:'CP',p:[],deb:'07:00',fin:'20:00'},'2026-09-15':{t:'REPOS',p:[]},'2026-09-16':{t:'MAL',p:[]}});
  assert.equal(C.analyze({end:'2026-09-20'}).status,'insufficient')});

console.log('Périodes');
t('repos entre services < 11 h : à vérifier ; < 9 h : critique',()=>{
  const w=codes(load({'2026-09-14':day('08:00','20:00',[{d:'12:00',f:'14:00'}]),'2026-09-15':day('06:30','12:00',[])}).C.analyze({end:'2026-09-20'}));
  const b=codes(load({'2026-09-14':day('08:00','22:00',[{d:'12:00',f:'14:00'},{d:'16:00',f:'18:00'}]),'2026-09-15':day('06:30','12:00',[])}).C.analyze({end:'2026-09-20'}));
  assert.ok(w.includes('REPOS:warn'));assert.ok(b.includes('REPOS:bad'))});
t('semaine > 48 h : 🔴 sur la semaine, action « ouvrir la période de paie »',()=>{
  const d={};['14','15','16','17','18'].forEach(j=>d['2026-09-'+j]=day('07:00','17:30',[{d:'12:00',f:'12:30'}])); // 5 × 10h00 = 50h00
  const s=load(d).C.analyze({end:'2026-09-20'}),w=s.alerts.find(a=>a.code==='SEMAINE');
  assert.equal(w.level,'bad');assert.equal(w.key,'2026-09-14');assert.equal(w.dateLabel,'Semaine du 14/09 au 20/09');
  assert.equal(Object.fromEntries(w.data)['TTE de la semaine'],'50h00');assert.deepEqual(w.actions,[{label:'Ouvrir la période de paie',kind:'period',target:'2026-09-14'}])});
t('moyenne sur 12 semaines > 46 h : un seul contrôle, 🔴',()=>{
  const d={};let k='2026-06-29';for(let w=0;w<12;w++){for(let i=0;i<5;i++){const x=new Date(k+'T12:00:00');x.setDate(x.getDate()+w*7+i);
    d[x.toISOString().slice(0,10)]=day('07:00','16:45',[{d:'12:00',f:'12:30'}])}} // 5 × 9h15 = 46h15 / semaine
  const s=load(d).C.analyze({end:'2026-09-20'});const m=s.alerts.filter(a=>a.code==='MOYENNE');
  assert.equal(m.length,1);assert.equal(m[0].level,'bad');assert.equal(Object.fromEntries(m[0].data)['Moyenne hebdomadaire'],'46h15');
  assert.ok(!s.notEvaluated.some(x=>/12 semaines/.test(x)))});
t('moins de 12 semaines de données : moyenne non évaluée, et dit pourquoi',()=>{
  const s=load(clone(fx.days)).C.analyze({end:'2026-09-20'});assert.ok(s.notEvaluated.some(x=>/moins de 12 semaines/.test(x)))});

console.log('ROMI1 (référence employeur)');
const ROMI=(tte)=>[{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:tte}];
t('ROMI1 identique au calcul (167,92 h ≈ 167h55) : contrôle conforme',()=>{
  const s=load(clone(fx.days),{romi:ROMI(167.92)}).C.analyze({end:'2026-09-20'});
  assert.ok(!s.alerts.some(a=>a.code==='ROMI_TTE'))});
t('ROMI1 différent (160,00 h) : 🟠 avec les deux valeurs et l\'écart, action « ouvrir ROMI1 »',()=>{
  const s=load(clone(fx.days),{romi:ROMI(160)}).C.analyze({end:'2026-09-20'}),a=s.alerts.find(x=>x.code==='ROMI_TTE'),d=Object.fromEntries(a.data);
  assert.equal(a.level,'warn');assert.equal(d['TTE ROMI1 (employeur)'],'160h00 (160,00 h)');assert.equal(d['TTE MesHeures (calcul)'],'167h55');
  assert.equal(d['Écart MesHeures − ROMI1'],'+7h55');assert.deepEqual(a.actions,[{label:'Ouvrir ROMI1',kind:'romi',target:null}])});
t('ROMI1 sur une période sans aucune journée saisie : non comparé, et dit pourquoi',()=>{
  const s=load(clone(fx.days),{romi:[{periodStart:'2026-06-01',periodEnd:'2026-06-28',ttePeriodH:150}]}).C.analyze({end:'2026-09-20'});
  assert.ok(!s.alerts.some(a=>a.code==='ROMI_TTE'));assert.ok(s.notEvaluated.some(x=>/ROMI1 01\/06 → 28\/06/.test(x)))});
t('ROMI1 : seul le relevé le plus récent est comparé',()=>{
  const s=load(clone(fx.days),{romi:[{periodStart:'2026-07-27',periodEnd:'2026-08-23',ttePeriodH:1},...ROMI(167.92)]}).C.analyze({end:'2026-09-20'});
  assert.ok(!s.alerts.some(a=>a.code==='ROMI_TTE'))});

console.log('Score explicable');
t('score = conformes / évalués, explication chiffrée',()=>{
  const s=load(clone(fx.days)).C.analyze({end:'2026-09-20'});
  assert.equal(s.score,Math.round(100*s.counts.ok/s.counts.total));assert.equal(s.counts.ok+s.counts.bad+s.counts.warn,s.counts.total);
  assert.ok(s.explanation.includes(s.counts.ok+'/'+s.counts.total))});
t('le niveau global est la pire anomalie, pas le score',()=>{
  const s=load(clone(fx.days)).C.analyze({end:'2026-09-20'});assert.equal(s.status,'bad');assert.ok(s.score>50)});

console.log('Période de référence 24/08 → 20/09/2026');
const REF=load(clone(fx.days));const RS=REF.C.analyze({end:'2026-09-20'});
t('18 journées analysées ; 3 critiques réelles : TTE 12h15 le 01/09, semaines à 54h15 et 58h20',()=>{
  assert.equal(RS.workedDays,18);
  const bad=RS.alerts.filter(a=>a.level==='bad').map(a=>a.code+' '+a.key).sort();
  assert.deepEqual(bad,['SEMAINE 2026-08-24','SEMAINE 2026-08-31','TTE 2026-09-01']);
  assert.equal(Object.fromEntries(RS.alerts.find(a=>a.code==='SEMAINE'&&a.key==='2026-08-31').data)['TTE de la semaine'],'58h20')});
t('chaque alerte « à vérifier » correspond à une donnée réelle du moteur',()=>{
  RS.alerts.filter(a=>a.scope==='day'&&a.code!=='REPOS').forEach(a=>{const r=REF.X.cd(a.key);
    if(a.code==='AMPLITUDE')assert.ok(r.amp>720);if(a.code==='TTE')assert.ok(r.tte>600);
    if(a.code==='PAUSE')assert.ok(r.tte>=360&&r.pz<20);if(a.code==='REPAS')assert.ok(r.al.some(x=>/^Repas déclaré/.test(x.m)))})});
t('repas forcés hors plage (26/08, 15/09) signalés une fois chacun',()=>{
  assert.deepEqual(RS.alerts.filter(a=>a.code==='REPAS').map(a=>a.key).sort(),['2026-08-26','2026-09-15'])});
t('aucune amplitude critique (max 12h45 le 01/09)',()=>{
  assert.deepEqual(RS.alerts.filter(a=>a.code==='AMPLITUDE').map(a=>a.level+' '+a.key),['warn 2026-09-01'])});

console.log('Lecture seule');
t('DB gelé en profondeur : l\'analyse réussit (aucune écriture possible)',()=>{
  const {C}=load(clone(fx.days),{freeze:true,romi:ROMI(160)});const s=C.analyze({end:'2026-09-20'});assert.ok(s.alerts.length>0)});
t('DB strictement identique après analyse, aucune écriture dans le stockage',()=>{
  const L=load(clone(fx.days),{romi:ROMI(160)});const before=JSON.stringify(L.X.DB);L.C.analyze({end:'2026-09-20'});L.C.analyze();
  assert.equal(JSON.stringify(L.X.DB),before);assert.deepEqual(L.writes,[])});
t('moteur inchangé : TTE 167h55, amplitude 173h25, 18 jours, IDAJ 0h45, 13 IR + 2 IRU, brut identique',()=>{
  const L=load(clone(fx.days));const G0=L.X.calcPer('2026-08-24',2).G,b0=L.X.brutOf(G0).tot;L.C.analyze({end:'2026-09-20'});
  const G=L.X.calcPer('2026-08-24',2).G;
  assert.equal(G.tte,H(167,55));assert.equal(G.amp,H(173,25));assert.equal(G.trav,18);assert.equal(G.idaj,45);assert.equal(G.ir,13);assert.equal(G.iru,2);
  assert.ok(Math.abs(L.X.brutOf(G).tot-b0)<1e-9)});
t('le module ne contient aucune écriture dans DB ni dans le stockage',()=>{
  const s=fs.readFileSync(path.join(WEB,'app-v37-control.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  assert.ok(!/(^|[^\w.])DB\s*=[^=>]/m.test(s),'réaffectation de DB');assert.ok(!/\bDB\.[\w.\[\]'"]+\s*(=[^=]|\+=|-=)/.test(s),'écriture dans DB');
  assert.ok(!/localStorage\.(setItem|removeItem)|\bsave\(\)|DB\.[\w.]+\.(push|splice|pop|shift|unshift)\(/.test(s),'écriture stockage')});
t('window.DB n\'est pas exposé (anciens modules écrivains inactifs)',()=>{
  const all=fs.readdirSync(WEB).filter(f=>f.endsWith('.js')).map(f=>fs.readFileSync(path.join(WEB,f),'utf8')).join('\n');
  assert.ok(!/window\.DB\s*=[^=]|globalThis\.DB\s*=[^=]|defineProperty\(\s*window\s*,\s*['"]DB['"]/.test(all))});

console.log('Affichage');
t('aucune classe mh37-* ne tombe sous les règles génériques [class*=…] du thème clair',()=>{
  const css=fs.readFileSync(path.join(WEB,'..','style','v30.css'),'utf8');
  const subs=[...new Set([...css.matchAll(/data-theme="light"\] \[class\*="([^"]+)"\]/g)].map(m=>m[1]))];
  const js=fs.readFileSync(path.join(WEB,'app-v37-control.js'),'utf8');
  const cls=[...new Set([...js.matchAll(/mh37-[\w-]+/g)].map(m=>m[0]))];
  assert.ok(subs.length>0&&cls.length>0);
  cls.forEach(c=>subs.forEach(x=>assert.ok(!c.includes(x),c+' contient « '+x+' »')))});
t('carte : « Données insuffisantes » sans compteurs ni score',()=>{
  const {C}=load({});const h=C.cardHtml(C.analyze({end:'2026-09-20'}),'');
  assert.ok(/Données insuffisantes/.test(h));assert.ok(!/contrôles OK/.test(h));assert.ok(/>—</.test(h))});
t('carte : chaque alerte affiche date, règle, données, résultat, classement et une action',()=>{
  const {C}=load(clone(fx.days));const s=C.analyze({end:'2026-09-20'}),h=C.cardHtml(s,'');
  ['Date','Règle','Données','Résultat','Classement'].forEach(x=>assert.ok(h.includes('<dt>'+x+'</dt>'),x));
  assert.equal((h.match(/class="mh37-item"/g)||[]).length,s.alerts.length);
  assert.ok(h.includes("MHControl.open('day','2026-09-01')"));assert.ok(h.includes('Voir les '+(s.groups.filter(g=>g.level==='warn').length-3)+' autres'))});

console.log('Compatibilité MH314 (ancien score de l\'Accueil)');
t('MH314.audit délègue à MHControl : plus jamais 100/100 sans journée analysée',()=>{
  const L=load({});vm.runInContext(fs.readFileSync(path.join(WEB,'app-v31-4-smart.js'),'utf8'),L.ctx);
  const a=L.win.MH314.audit();assert.equal(a.score,null);assert.equal(a.status.label,'Données insuffisantes')});
t('MH314.audit sur des données réelles : même score et mêmes priorités que MHControl',()=>{
  const L=load(clone(fx.days));vm.runInContext(fs.readFileSync(path.join(WEB,'app-v31-4-smart.js'),'utf8'),L.ctx);
  const a=L.win.MH314.audit(),s=L.C.analyze();assert.equal(a.score,s.score);assert.equal(a.priority.length,Math.min(3,s.groups.length))});

console.log(fails?`\n${fails} ÉCHEC(S)`:'\nTous les tests passent.');process.exit(fails?1:0);
