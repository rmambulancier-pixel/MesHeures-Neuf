#!/usr/bin/env node
/*
 * V37.1 — Travail de nuit (accord du 16/06/2016, art. 9). Tests Node.
 * Lancer : node tests/v371-nuit.test.js
 * Références : fixtures/ref-2026-08-24.json et fixtures/ref-2026-09-21.json (journées réelles, sans identité).
 * Les années « travailleur de nuit » sont des JEUX SYNTHÉTIQUES construits pour franchir le seuil de 270 h :
 * ils ne décrivent pas la situation réelle de l'utilisateur (2h00 d'amplitude de nuit en 2026).
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web/scripts');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const ALL={...R1.days,...R2.days};
const clone=o=>JSON.parse(JSON.stringify(o));
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+(e&&e.message))}}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}
const NOW='2026-10-08';
const text=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
const addDay=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const day=(deb,fin,p,extra)=>Object.assign({t:'T',deb,fin,p:p||[],mealV:3,panier:'NON'},extra||{});

const MODULES=['app-v37-periode.js','app-legal.js','app-evidence.js','app-v371-nuit.js','app-v37-control.js','app-v37-romi-reconciliation.js','app-v37-compteur.js','app-v37-assistant-paie.js','app-v37-dossier.js'];
function load(days,opts={}){
  const writes=[],win={};
  const ls={getItem:()=>null,setItem:k=>writes.push(k),removeItem:k=>writes.push(k)};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{},setAttribute(){},appendChild(){}}),body:{appendChild(){}},head:{appendChild(){}}},
    localStorage:ls,CustomEvent:function(){},console:{...console,info(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,
    Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  const core=opts.core||fs.readFileSync(path.join(WEB,'app-core.js'),'utf8');
  vm.runInContext(core+';DB.s={...DEF,...'+JSON.stringify(opts.s||R1.s)+'};DB.days='+JSON.stringify(days)+';DB.per={start:"2026-08-24",nb:2};'+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F,minutesNuit,mhEffectivePauses};',ctx);
  if(opts.freeze){vm.runInContext('Object.freeze(DB);',ctx);deepFreeze(ctx.__x.DB)}
  (opts.modules||MODULES).forEach(f=>vm.runInContext(fs.readFileSync(path.join(WEB,f),'utf8'),ctx,{filename:f}));
  if(win.MHAssistantPaie&&win.MHAssistantPaie.setRender)win.MHAssistantPaie.setRender(()=>{});
  return {N:win.MHNuit,win,X:ctx.__x,writes,ctx};
}
/* JEU SYNTHÉTIQUE : n services 20:00 → 04:00 (6h00 d'amplitude 22 h → 5 h chacun), un jour sur deux à partir de « debut ». */
function nuits(debut,n,pauses){const out={};for(let i=0;i<n;i++)out[addDay(debut,2*i)]=day('20:00','04:00',pauses===undefined?[{d:'00:00',f:'00:30'}]:pauses);return out}
/* Année entièrement saisie (repos par défaut) */
function anneeComplete(y,extra){const out={};for(let k=y+'-01-01';k<=y+'-12-31';k=addDay(k,1))out[k]={t:'REPOS'};return Object.assign(out,extra||{})}

const L=load(ALL),F=L.X.F;

console.log('Moteur : ajout en lecture seule (mhEffectivePauses → iv)');
t('iv = intervalles fusionnés ; Σ iv = pz (pauses chevauchantes, hors service, invalides)',()=>{
  const cases=[[day('08:00','17:00',[{d:'12:00',f:'12:30'},{d:'12:15',f:'12:45'}])],[day('20:00','04:00',[{d:'23:30',f:'00:15'},{d:'02:00',f:'02:10'}])],
    [day('08:00','12:00',[{d:'07:00',f:'08:30'},{d:'11:50',f:'13:00'}])],[day('08:00','12:00',[{d:'10:00',f:'09:00'},{d:'',f:''}])]];
  cases.forEach(([d])=>{const A=load({'2026-09-22':d},{modules:[]}),r=A.X.cd('2026-09-22'),ep=A.X.mhEffectivePauses(d,r.deb,r.fin);
    assert.ok(Array.isArray(ep.iv));assert.equal(ep.iv.reduce((s,p)=>s+p[1]-p[0],0),ep.pz);assert.equal(ep.pz,r.pz);
    ep.iv.forEach((p,i)=>{assert.ok(p[0]<p[1]);if(i)assert.ok(p[0]>=ep.iv[i-1][1],'fusionnés')})})});
t('moteur V37.0.0 (c426b19) et V37.1 : cd() identique sur toutes les journées de référence (TTE, amplitude, pauses, nuit, IDAJ, repas, alertes)',()=>{
  let old;try{old=cp.execSync('git show c426b19:app/src/main/assets/web/scripts/app-core.js',{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26})}catch(e){old=null}
  if(!old){console.log('      (commit c426b19 absent du dépôt local : comparaison ignorée)');return}
  const extra={'2026-11-02':day('20:00','04:00',[{d:'00:00',f:'00:30'}]),'2026-11-04':day('21:00','05:00',[{d:'01:00',f:'01:15'}]),'2026-11-06':day('22:00','07:00',[{d:'02:00',f:'02:30'},{d:'02:20',f:'02:40'}])};
  const days={...ALL,...extra},A=load(days,{core:old,modules:[]}),B=load(days,{modules:[]});
  Object.keys(days).forEach(k=>{const a=A.X.cd(k),b=B.X.cd(k);['amp','tte','pz','deb','fin','nuit','idaj','ir','iru'].forEach(f=>assert.deepEqual(b[f],a[f],k+' '+f));
    assert.deepEqual(JSON.parse(JSON.stringify(b.al)),JSON.parse(JSON.stringify(a.al)),k+' al')});
  ['2026-08-24','2026-09-21'].forEach(s=>assert.deepEqual(JSON.parse(JSON.stringify(B.X.calcPer(s,2).G)),JSON.parse(JSON.stringify(A.X.calcPer(s,2).G)),s))});
t('valeurs de référence inchangées : TTE 167h55, amplitude 173h25, Q1 112h35 / 16h00 / 26h35, Q2 55h20 / 90h20 / 16h00 / 4h20, nuit réglage paie 1h00',()=>{
  const R=L.X.calcPer('2026-08-24',2);assert.deepEqual([F(R.G.tte),F(R.G.amp),F(R.G.nuit),F(R.G.idaj)],['167h55','173h25','1h00','0h45']);
  assert.deepEqual([F(R.Q[0].tte),F(R.Q[0].h25),F(R.Q[0].h50)],['112h35','16h00','26h35']);assert.deepEqual([F(R.Q[1].tte),F(R.Q[1].seuil),F(R.Q[1].h25),F(R.Q[1].h50)],['55h20','90h20','16h00','4h20']);
  assert.equal(F(L.X.calcPer('2026-09-21',2).G.nuit),'4h00','réglage paie 21 h → 6 h')});

console.log('Journée (période de nuit 22 h → 5 h)');
const J=(d,k)=>{const A=load({[k||'2026-09-22']:d},{modules:['app-v371-nuit.js']});return {j:A.N.jour(k||'2026-09-22'),A}};
t('20:00 → 04:00, pause 00:00-00:30 : amplitude 6h00, travail 5h30, continu 4h00 ; réglage paie inchangé (7h00, 21 h → 6 h)',()=>{
  const {j,A}=J(day('20:00','04:00',[{d:'00:00',f:'00:30'}]));assert.deepEqual([F(j.amplitude),F(j.travail),F(j.continuMax)],['6h00','5h30','4h00']);assert.equal(F(A.X.cd('2026-09-22').nuit),'7h00')});
t('04:00 → 14:20 (journée réelle du 01/10) : 1h00 ; 06:30 → 14:20 : 0h00 ; 21:30 → 23:00 : 1h00',()=>{
  assert.equal(F(J(day('04:00','14:20',[{d:'11:40',f:'12:10'}])).j.amplitude),'1h00');assert.equal(J(day('06:30','14:20')).j.amplitude,0);assert.equal(F(J(day('21:30','23:00')).j.amplitude),'1h00')});
t('pause partiellement de nuit : seule la part 22 h → 5 h est déduite (20:00 → 03:00, pause 21:30-22:30 → travail 4h30)',()=>{
  const {j}=J(day('20:00','03:00',[{d:'21:30',f:'22:30'}]));assert.deepEqual([F(j.amplitude),F(j.travail)],['5h00','4h30'])});
t('continuité : une pause de moins de 20 min n’interrompt pas le travail (8h00 continues) ; 20 min l’interrompt (4h00)',()=>{
  assert.equal(F(J(day('21:00','05:00',[{d:'01:00',f:'01:15'}])).j.continuMax),'8h00');assert.equal(F(J(day('21:00','05:00',[{d:'01:00',f:'01:20'}])).j.continuMax),'4h00')});
t('pauses chevauchantes fusionnées par le moteur : 22:00 → 07:00, 02:00-02:30 + 02:20-02:40 → une pause de 40 min',()=>{
  const {j}=J(day('22:00','07:00',[{d:'02:00',f:'02:30'},{d:'02:20',f:'02:40'}]));assert.deepEqual(j.pauses,[[1560,1600]]);
  assert.equal(F(j.amplitude),'7h00');assert.equal(F(j.travail),'6h20');assert.equal(F(j.continuMax),'4h20')});
t('journée sans fin : incomplète, aucune valeur ; repos / CP : hors champ',()=>{
  assert.equal(J(day('22:00','')).j.incomplet,true);assert.equal(J({t:'REPOS'}).j,null);assert.equal(J({t:'CP'}).j,null)});
t('type NUIT compté comme une journée de travail',()=>{assert.equal(F(J(day('20:00','04:00',[],{t:'NUIT'})).j.amplitude),'6h00')});

console.log('Données réelles (relevés de référence)');
const N=L.N;
t('24/08 → 20/09/2026 : 0h00 entre 22 h et 5 h (la nuit 1h00 du réglage paie est hors période de l’article 9)',()=>{const p=N.periode('2026-08-24','2026-09-20');assert.equal(p.amplitude,0);assert.equal(p.jours,0)});
t('21/09 → 18/10/2026 : 2h00 (01/10 et 07/10 à 04:00), aucune journée de 3 h de nuit',()=>{const p=N.periode('2026-09-21','2026-10-18');
  assert.equal(F(p.amplitude),'2h00');assert.equal(F(p.travail),'2h00');assert.equal(p.jours,2);assert.equal(p.jours3h,0)});
t('année 2026 au 08/10 : cumul 2h00 / 270h00, statut non déterminable (année en cours, jours non saisis), aucun repos affiché',()=>{
  const a=N.annee('2026',{today:NOW});assert.equal(F(a.cumul),'2h00');assert.equal(F(a.seuil),'270h00');assert.equal(a.statut,'non_determinable');assert.equal(a.repos,null);assert.equal(a.pauseControlee,false);
  assert.ok(a.texte.startsWith('Statut non déterminable à ce jour : année 2026 en cours, '));assert.ok(a.texte.includes('seuil de 270 h non atteint (2h00)'));assert.ok(a.manquants>0)});
t('information mensuelle : 12 mois, octobre 2026 = 2h00, somme = cumul',()=>{const a=N.annee('2026',{today:NOW});
  assert.equal(a.mensuel.length,12);assert.equal(F(a.mensuel[9].amplitude),'2h00');assert.equal(a.mensuel.reduce((s,m)=>s+m.amplitude,0),a.cumul);assert.deepEqual(a.mensuel.map(m=>m.mois).slice(0,2),['2026-01','2026-02'])});

console.log('Statut de travailleur de nuit (jeux synthétiques)');
const SYN=load(nuits('2025-01-06',50)),SA=SYN.N.annee('2025',{today:NOW});
t('SYNTHÉTIQUE 50 nuits de 6h00 : seuil de 270 h franchi à la 45e nuit, statut établi',()=>{
  assert.equal(F(SA.cumul),'300h00');assert.equal(SA.statut,'etabli');assert.equal(SA.franchi,addDay('2025-01-06',2*44));
  assert.ok(SA.texte.includes('seuil de 270 h d’amplitude de nuit franchi le '+addDay('2025-01-06',88).split('-').reverse().join('/')))});
t('SYNTHÉTIQUE : repos 10 % (pas d’affectation exclusive) = 30h00, au moins 5 % conservés = 15h00, présenté « à confirmer », sans montant',()=>{
  assert.equal(SA.repos.taux,0.10);assert.equal(SA.repos.pourcentage,10);assert.equal(F(SA.repos.heures),'30h00');assert.equal(F(SA.repos.plancher),'15h00');
  assert.ok(SA.repos.note.includes('pas une majoration de salaire'));assert.ok(SA.repos.note.includes('à confirmer'));assert.ok(SA.repos.note.includes('15 % seulement en cas d’affectation exclusive'));assert.ok(SA.repos.note.includes('(non applicable)'));
  assert.ok(!/€|\beuros?\b/i.test(JSON.stringify(SA)))});
t('SYNTHÉTIQUE 44 nuits : 264h00, sous le seuil, pas de statut établi',()=>{const a=load(nuits('2025-01-06',44)).N.annee('2025',{today:NOW});assert.equal(F(a.cumul),'264h00');assert.notEqual(a.statut,'etabli');assert.equal(a.repos,null)});
t('SYNTHÉTIQUE critère hebdomadaire : 2 journées de 3 h de travail de nuit dans une semaine → « à confirmer » (horaire habituel), jamais établi seul',()=>{
  const a=load({'2026-03-02':day('21:00','03:00'),'2026-03-04':day('21:00','03:00')}).N.annee('2026',{today:NOW});
  assert.equal(a.statut,'indice');assert.deepEqual(a.semainesIndice,['2026-03-02']);assert.ok(a.texte.includes('horaire habituel'));assert.equal(a.repos,null)});
t('année close entièrement saisie, sous les seuils : non travailleur de nuit',()=>{
  const a=load(anneeComplete('2025',{'2025-03-03':day('04:00','12:00')})).N.annee('2025',{today:NOW});assert.equal(a.statut,'non');assert.equal(a.manquants,0);assert.equal(F(a.cumul),'1h00')});
t('année close avec une journée sans fin : non déterminable',()=>{
  const a=load(anneeComplete('2025',{'2025-03-03':day('04:00','')})).N.annee('2025',{today:NOW});assert.equal(a.statut,'non_determinable');assert.deepEqual(a.incomplets,['2025-03-03'])});
t('aucune donnée : non déterminable, cumul 0h00, aucune valeur invalide',()=>{const a=load({}).N.annee('2026',{today:NOW});assert.equal(a.statut,'non_determinable');assert.equal(a.cumul,0);assert.ok(!BAD.test(a.texte))});

console.log('Pause de nuit (20 min après 6 h continues)');
t('SYNTHÉTIQUE établi : nuit 20:00 → 04:00 sans pause = 8h00 continues → non conforme ; avec pause de 30 min → conforme',()=>{
  const days={...nuits('2025-01-06',50),'2025-12-01':day('20:00','04:00',[])};const a=load(days).N.annee('2025',{today:NOW});
  assert.equal(a.pauseControlee,true);const x=a.pausesNuit.find(p=>p.date==='2025-12-01');assert.equal(F(x.continuMax),'8h00');assert.equal(x.conforme,false);
  assert.ok(a.pausesNuit.filter(p=>p.date!=='2025-12-01').every(p=>p.conforme))});

console.log('Smart Control');
const scKey=s=>JSON.stringify({c:s.controls,f:s.failed,n:s.notEvaluated,a:s.alerts.map(a=>a.id+a.level)});
t('relevés réels : résultat identique avec et sans le module de nuit (aucune heure de nuit dans la fenêtre du 24/08)',()=>{
  const sans=load(ALL,{modules:['app-v37-control.js']}).win.MHControl.analyze({end:'2026-09-20'}),avec=L.win.MHControl.analyze({end:'2026-09-20'});assert.equal(scKey(avec),scKey(sans))});
t('relevés réels au 08/10 : 2 journées de nuit, statut non établi → « Non évalué », aucun contrôle ajouté',()=>{
  const sans=load(ALL,{modules:['app-v37-control.js']}).win.MHControl.analyze({end:NOW}),avec=L.win.MHControl.analyze({end:NOW});
  assert.equal(avec.controls,sans.controls);assert.equal(avec.failed,sans.failed);
  assert.ok(avec.notEvaluated.includes('Pause de nuit (art. 9) : 2 journées avec heures de nuit, statut de travailleur de nuit non établi.'),avec.notEvaluated.join(' | '))});
t('SYNTHÉTIQUE établi : nuit sans pause → 🟠 « Pause de nuit » sourcée art. 9 ; nuits avec pause → contrôles conformes',()=>{
  const days={...nuits('2025-01-06',50),...nuits('2025-12-02',3),'2025-12-09':day('20:00','04:00',[])};const A=load(days),s=A.win.MHControl.analyze({end:'2025-12-10'});
  const al=s.alerts.filter(a=>a.code==='NUIT_PAUSE');assert.equal(al.length,1);assert.equal(al[0].key,'2025-12-09');assert.equal(al[0].level,'warn');
  assert.ok(al[0].source.includes('art. 9'));assert.ok(al[0].result.includes('8h00'));assert.ok(al[0].data.some(([l,v])=>l==='Plus long travail continu'&&v==='8h00'));
  const sans=load(days,{modules:['app-v37-control.js']}).win.MHControl.analyze({end:'2025-12-10'});assert.equal(s.controls-sans.controls,4,'4 nuits contrôlées');
  assert.ok(!s.notEvaluated.some(x=>/Pause de nuit/.test(x)))});

console.log('Compteur, Assistant Paie, Dossier');
t('Compteur 21/09 → 18/10 : ligne « Nuit art. 9 » 2h00, cumul 2026 2h00 / 270h00, statut non déterminable ; ligne « Nuit » 4h00 marquée réglage paie',()=>{
  const C=L.win.MHCompteur,c=C.data({today:NOW,start:'2026-09-21'}),h=C.html({today:NOW,start:'2026-09-21'});
  assert.equal(F(c.nuit9.amplitude),'2h00');assert.equal(F(c.autres.nuit),'4h00');
  assert.ok(h.includes('<span data-k="nuit9">2h00</span>'));assert.ok(h.includes('<span data-k="nuit9an">2h00</span> / 270h00'));assert.ok(h.includes('<span data-k="nuit9st">statut non déterminable</span>'));
  assert.ok(text(h).includes('réglage paie 21h00 → 06h00'));assert.ok(!BAD.test(text(h)));assert.ok(!/repos 10 %/.test(h))});
t('Compteur 24/08 → 20/09 : valeurs V37 inchangées (nuit 1h00, IDAJ 0h45) et art. 9 0h00',()=>{
  const c=L.win.MHCompteur.data({today:NOW,start:'2026-08-24'});assert.equal(F(c.autres.nuit),'1h00');assert.equal(F(c.autres.idaj),'0h45');assert.equal(c.nuit9.amplitude,0)});
t('Assistant Paie : bloc « 🌙 Travail de nuit (art. 9) » hors score (score et comptes identiques sans le module), sans montant',()=>{
  const A=L.win.MHAssistantPaie,d=A.data({today:NOW,start:'2026-09-21'}),h=A.html({today:NOW,start:'2026-09-21'});
  const S=load(ALL,{modules:['app-v37-romi-reconciliation.js','app-v37-assistant-paie.js']}).win.MHAssistantPaie.data({today:NOW,start:'2026-09-21'});
  assert.equal(d.score,S.score);assert.deepEqual(d.compte,S.compte);assert.equal(d.checks.length,S.checks.length);
  const blk=h.slice(h.indexOf('data-open="nuit"'),h.indexOf('data-open="evol"'));assert.ok(blk.includes('🌙 Travail de nuit (art. 9)'));
  assert.ok(text(blk).includes('Cumul 2026 (année civile)'));assert.ok(text(blk).includes('2h00 / 270h00'));assert.ok(blk.includes('sans objet tant que le statut de travailleur de nuit n’est pas établi'));
  assert.ok(blk.includes('pas une majoration de salaire'));assert.ok(!/€/.test(blk));assert.ok(!BAD.test(text(blk)))});
t('Assistant Paie SYNTHÉTIQUE établi : repos 10 % « à confirmer », plancher 5 %, aucun euro',()=>{
  const A=load(nuits('2026-01-05',50)).win.MHAssistantPaie,h=A.html({today:NOW,start:'2026-01-05'});const blk=h.slice(h.indexOf('data-open="nuit"'),h.indexOf('data-open="evol"'));
  assert.ok(text(blk).includes('Contrepartie en repos 10 %'));assert.ok(text(blk).includes('au moins 5 % conservés en repos'));assert.ok(!/€/.test(blk))});
t('Dossier : section « 10. Travail de nuit (art. 9) » (années 2026, mensuel octobre 2h00), sections suivantes renumérotées',()=>{
  const M=L.win.MHDossier,d=M.data({today:NOW,generatedAt:'2026-10-08T10:00:00'}),h=M.html(d,{dataHash:'x'});
  assert.deepEqual(d.nuit.map(y=>[y.annee,F(y.cumul),y.statut]),[['2026','2h00','non_determinable']]);assert.deepEqual(d.nuit[0].mois.map(m=>[m.mois,F(m.amplitude)]),[['2026-10','2h00']]);
  const t10=h.indexOf('10. Travail de nuit (art. 9)'),t11=h.indexOf('11. Événements et chronologie'),t12=h.indexOf('12. Intégrité');assert.ok(t10>0&&t11>t10&&t12>t11);
  const sec=text(h.slice(t10,t11));assert.ok(sec.includes('octobre 2026 2h00 2h00 2 0'));assert.ok(sec.includes('non contrôlée, statut de travailleur de nuit non établi'));assert.ok(!/€/.test(sec))});
t('Dossier SYNTHÉTIQUE établi (51 nuits, 306h00) : repos 30h36 (à confirmer), tableau des pauses de nuit non conformes',()=>{
  const M=load({...nuits('2025-01-06',50),'2025-12-01':day('20:00','04:00',[])}).win.MHDossier,d=M.data({today:NOW,generatedAt:'2026-10-08T10:00:00'}),h=text(M.html(d,{}));
  const y=d.nuit.find(x=>x.annee==='2025');assert.equal(y.statut,'etabli');assert.equal(F(y.repos.heures),'30h36');assert.deepEqual(y.pausesNonConformes.map(x=>x.date),['2025-12-01']);
  assert.ok(h.includes('Repos 10 % : 30h36 (à confirmer)'));assert.ok(h.includes('01/12/2025 8h00 Plus de 6 h de travail continu sans pause de 20 min'))});

console.log('Lecture seule');
t('aucune écriture : DB gelée, aucun accès en écriture au stockage, window.DB non exposé',()=>{
  const A=load(ALL,{freeze:true}),before=JSON.stringify(A.X.DB);
  A.N.annee('2026',{today:NOW});A.N.mensuel('2026');A.win.MHControl.analyze({end:NOW});A.win.MHCompteur.html({today:NOW,start:'2026-09-21'});A.win.MHAssistantPaie.html({today:NOW,start:'2026-09-21'});
  const M=A.win.MHDossier;M.pdf(M.data({today:NOW}),{});
  assert.equal(JSON.stringify(A.X.DB),before);assert.deepEqual(A.writes,[]);assert.equal(A.win.DB,undefined)});
t('module sans calcul propre : réutilise minutesNuit / mhEffectivePauses / cd, aucun taux de salaire ni montant',()=>{
  const src=fs.readFileSync(path.join(WEB,'app-v371-nuit.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.ok(/minutesNuit\(/.test(src)&&/mhEffectivePauses\(/.test(src)&&/\bcd\(/.test(src));assert.ok(!/S\.taux|brutOf|calcPer|€|nuitMaj|localStorage|save\(/.test(src))});
t('enregistré dans index.html (après app-core.js) et dans le cache du service worker',()=>{
  const idx=fs.readFileSync(path.join(REPO,'app/src/main/assets/web/index.html'),'utf8'),sw=fs.readFileSync(path.join(REPO,'app/src/main/assets/web/sw.js'),'utf8');
  assert.ok(idx.indexOf('app-v371-nuit.js?v=37.1.0')>idx.indexOf('app-core.js?v=37.1.0'));assert.ok(idx.indexOf('app-v371-nuit.js')<idx.indexOf('app-v37-control.js'));assert.ok(sw.includes("'./scripts/app-v371-nuit.js?v=37.1.0'"))});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.1 travail de nuit passent.');
process.exit(fails?1:0);
