#!/usr/bin/env node
/*
 * V37.0-G — Assistant Paie 2.0. Tests Node.
 * Lancer : node tests/v37-assistant-paie.test.js
 * Références : fixtures/ref-2026-08-24.json (24/08 → 20/09/2026) et fixtures/ref-2026-09-21.json
 * (21/09 → 18/10/2026, journées extraites de la sauvegarde du 07/10/2026, sans identité).
 * Chaque valeur attendue est aussi comparée au moteur (calcPer, brutOf) : rien n'est recalculé par l'assistant.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const ALL={...R1.days,...R2.days};
const clone=o=>JSON.parse(JSON.stringify(o));
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+(e&&e.message))}}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}
const ROMI_REF={periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15};
const NOW={today:'2026-10-08'};

function load(days,opts={}){
  const writes=[],win={};
  const ls={getItem:()=>null,setItem:k=>writes.push(k),removeItem:k=>writes.push(k)};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){}},localStorage:ls,CustomEvent:function(){},
    console:{...console,info(){},warn(){}},setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  const db={per:{start:opts.start||'2026-08-24',nb:opts.nb||2},...(opts.db||{})};
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(opts.s||R1.s)+'};DB.days='+JSON.stringify(days)+';'+Object.entries(db).map(([k,v])=>'DB.'+k+'='+JSON.stringify(v)+';').join('')+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F,addD};',ctx);
  if(opts.romi)win.MH_ROMI={list:()=>clone(opts.romi)};
  if(opts.freeze){vm.runInContext('Object.freeze(DB);',ctx);deepFreeze(ctx.__x.DB)}
  for(const f of ['app-v37-romi-reconciliation.js','app-v37-assistant-paie.js'])vm.runInContext(fs.readFileSync(path.join(WEB,f),'utf8'),ctx,{filename:f});
  const A=win.MHAssistantPaie;let rendered=0;A.setRender(()=>{rendered++});
  return {A,X:ctx.__x,win,writes,ctx,rendered:()=>rendered};
}
const text=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;

const L1=load(ALL,{romi:[ROMI_REF]}),F=L1.X.F,d1=L1.A.data(NOW),h1=L1.A.html(NOW),t1=text(h1);
const L2=load(ALL,{start:'2026-09-21',romi:[ROMI_REF]}),d2=L2.A.data(NOW),h2=L2.A.html(NOW),t2=text(h2);

console.log('Références (valeurs du moteur)');
t('fixture 24/08 → 20/09 : TTE 167h55, amplitude 173h25, HS 32h00 / 30h55, nuit 1h00, IDAJ 0h45, habillage 3h00, 13 IR / 2 IRU, brut 3 463,54 €',()=>{
  const G=d1.G;assert.deepEqual([F(G.tte),F(G.amp),F(G.h25),F(G.h50),F(G.h25+G.h50),F(G.nuit),F(G.idaj),F(G.hab),G.ir,G.iru,d1.c.CP,F(G.seuil-G.tte)],
    ['167h55','173h25','32h00','30h55','62h55','1h00','0h45','3h00',13,2,5,'35h00']);assert.equal(d1.B.tot.toFixed(2),'3463.54')});
t('fixture 21/09 → 18/10 : TTE 110h50, amplitude 116h20, HS 16h00 / 0h50, nuit 4h00, IDAJ 0h00, habillage 2h20, 11 IR / 0 IRU, aucun CP, brut 1 791,78 €',()=>{
  const G=d2.G;assert.deepEqual([F(G.tte),F(G.amp),F(G.h25),F(G.h50),F(G.h25+G.h50),F(G.nuit),F(G.idaj),F(G.hab),G.ir,G.iru,d2.c.CP],
    ['110h50','116h20','16h00','0h50','16h50','4h00','0h00','2h20',11,0,0]);assert.equal(d2.B.tot.toFixed(2),'1791.78')});
t('l’assistant lit le moteur : G = calcPer(début, 2).G, B = brutOf(G), période = écran Paie (mhCurrentPaySummary)',()=>{
  assert.deepEqual(d1.G,L1.X.calcPer('2026-08-24',2).G);assert.equal(d1.B.tot,L1.X.brutOf(d1.G).tot);
  const s=L1.win.mhCurrentPaySummary();assert.equal(d1.periode.debut,s.start);assert.equal(d1.B.tot,s.grossEst)});

console.log('1-3. Verdict et score');
t('1. verdict : HS payées non renseignées → 🔴 BULLETIN BLOQUÉ',()=>{assert.deepEqual(d1.verdict,{niveau:'bad',texte:'BULLETIN BLOQUÉ'});assert.ok(t1.includes('🔴 BULLETIN BLOQUÉ'))});
t('1b. HS payées saisies conformes → 🟠 BULLETIN À VÉRIFIER (points à vérifier restants)',()=>{
  const d=load(ALL,{romi:[ROMI_REF],db:{bul:{'2026-08-24':{p25:32,p50:30+55/60}}}}).A.data(NOW);
  assert.equal(d.checks.find(x=>x.key==='hsPayees').niveau,'ok');assert.deepEqual(d.verdict,{niveau:'warn',texte:'BULLETIN À VÉRIFIER'})});
t('1c. relevé sans aucun point → 🟢 BULLETIN PRÊT À CONTRÔLER, score 100 % sur contrôles réellement évalués',()=>{
  const days={};for(let i=0;i<5;i++)days['2026-08-'+String(24+i)]={t:'T',deb:'08:00',fin:'15:00',p:[],mealV:3,panier:'NON'};
  const d=load(days).A.data(NOW);assert.deepEqual(d.verdict,{niveau:'ok',texte:'BULLETIN PRÊT À CONTRÔLER'});assert.equal(d.score,100);assert.ok(d.compte.ok>0);assert.equal(d.compte.na,1)});
t('2. score = contrôlés / évalués (7 / 12 = 58 %), non évalués exclus',()=>{
  assert.deepEqual(d1.compte,{ok:7,warn:4,bad:1,na:0});assert.equal(d1.score,58);assert.ok(t1.includes('58 % prêt'));assert.ok(t1.includes('(7 / 12)'))});
t('3. données insuffisantes : aucun score, aucun 100 %, aucune estimation',()=>{
  const L=load({}),d=L.A.data(NOW),tx=text(L.A.html(NOW));assert.equal(d.score,null);assert.equal(d.verdict.texte,'DONNÉES INSUFFISANTES');
  assert.ok(tx.includes('Données insuffisantes'));assert.ok(!/\d+ % prêt/.test(tx));assert.ok(!tx.includes('Brut estimé'));assert.ok(!BAD.test(tx))});
t('synthèse : 🔴 bloquants, 🟠 à vérifier, 🟢 contrôlés affichés',()=>{assert.ok(/1 bloquant 4 à vérifier 7 contrôlés/.test(t1))});

console.log('4-6. Estimation et décomposition');
t('4. brut estimé avec la période exacte',()=>{assert.ok(t1.includes('Brut estimé 3 463,54 €'));assert.ok(t1.includes('Période 24/08/2026 → 20/09/2026'));assert.ok(t2.includes('Brut estimé 1 791,78 €'))});
t('5. net estimé = brutOf().netEst (coefficient configuré), sinon « Net non disponible »',()=>{
  assert.equal(d1.net.total,d1.B.netEst);assert.ok(t1.includes('Net estimé 2 880,39 €'));
  const L=load(ALL,{s:{...R1.s,net:0}}),tx=text(L.A.html(NOW));assert.equal(L.A.data(NOW).net,null);assert.ok(tx.includes('Net non disponible'));
  assert.ok(t1.includes('Estimation — ne constitue pas un bulletin de salaire.'))});
t('6. décomposition : chaque ligne du moteur (libellé et montant) et le total, IR exonéré et IRU hors brut',()=>{
  d1.B.L.forEach(l=>{assert.ok(h1.includes(l[0].replace(/'/g,'&#39;')),l[0]);const m=l[3].toFixed(2).replace('.',',');assert.ok(t1.includes(m.replace(/\B(?=(\d{3})+(?!\d))/g,' ')),l[0]+' '+m)});
  assert.ok(t1.includes('IR part exonérée · 13 repas 135,20 €'));assert.ok(t1.includes('IRU · 2 repas 19,38 €'));assert.ok(/14,20 €\/h/.test(t1)&&!/14\.20/.test(t1),'décimales françaises')});

console.log('7-12. Pourquoi ce chiffre ?');
const why=(h,lab)=>{const i=h.indexOf('data-open="brut:'+lab+'"');assert.ok(i>=0,lab);return text(h.slice(i,h.indexOf('</details>',i)))};
t('7. HS : quatorzaines du moteur (24/08 : 16h00 + 16h00, 26h35 + 4h20 ; 21/09 : HS 50 % 0h50 + 0h00)',()=>{
  assert.ok(/Q1 · 24\/08 → 06\/09 16h00 Q2 · 07\/09 → 20\/09 16h00 Total 32h00/.test(why(h1,'HS 25 %')));
  assert.ok(/Q1 · 24\/08 → 06\/09 26h35 Q2 · 07\/09 → 20\/09 4h20 Total 30h55/.test(why(h1,'HS 50 %')));
  assert.ok(/Q1 · 21\/09 → 04\/10 0h50 Q2 · 05\/10 → 18\/10 0h00 Total 0h50/.test(why(h2,'HS 50 %')));
  assert.ok(why(h1,'HS 50 %').includes('Source : moteur de paie'));assert.ok(why(h1,'HS 50 %').includes('État : 🟢 contrôlé'));
  const R=L1.X.calcPer('2026-08-24',2);assert.deepEqual(d1.Q.map(q=>[q.h25,q.h50]),R.Q.map(q=>[q.h25,q.h50]))});
t('8. CP : 5 j, 35h00 dans la base HS (Q2), réglage 7h00, « à confirmer »',()=>{
  const i=h1.indexOf('data-open="info:CP"'),x=text(h1.slice(i,h1.indexOf('</details>',i)));assert.ok(/CP 5 j · inclus dans la base HS 35h00/.test(x));assert.ok(/Q2 · 07\/09 → 20\/09 35h00/.test(x));
  assert.ok(x.includes('7h00'));assert.equal(d1.checks.find(c=>c.key==='cp').niveau,'warn');assert.equal(d2.checks.find(c=>c.key==='cp').niveau,'ok')});
t('9. paniers : 13 IR / 2 IRU et 11 IR / 0 IRU ; repas hors plage signalés (moteur)',()=>{
  assert.ok(d1.checks.find(c=>c.key==='paniers').texte.startsWith('13 IR · 2 IRU'));assert.ok(d2.checks.find(c=>c.key==='paniers').texte.startsWith('11 IR · 0 IRU'));
  assert.ok(why(h1,"Indemnité de repas IR (part taxable)").includes('Total 13 IR'))});
t('10. nuit : 1h00 et 4h00 ; majoration 0 % → pas de ligne de paie, montré sans montant',()=>{
  assert.ok(h1.includes('data-open="info:Nuit"'));assert.ok(/Nuit majoration 0 % : pas de ligne de paie 4h00/.test(t2));assert.ok(!d1.B.L.some(l=>/nuit/i.test(l[0])))});
t('11. IDAJ : 0h45 (ligne du brut, Q1 0h45) ; 0h00 sans ligne',()=>{assert.ok(/Q1 · 24\/08 → 06\/09 0h45 Q2 · 07\/09 → 20\/09 0h00 Total 0h45/.test(why(h1,'IDAJ (dépassement amplitude)')));assert.ok(!d2.B.L.some(l=>/IDAJ/.test(l[0])))});
t('12. habillage : 3h00 (18 × 10 min) et 2h20 (14 × 10 min)',()=>{assert.ok(why(h1,'Habillage/déshabillage').includes('18 jour(s) travaillé(s) × 10 min'));assert.ok(why(h2,'Habillage/déshabillage').includes('14 jour(s) travaillé(s) × 10 min'));
  assert.ok(why(h2,'Habillage/déshabillage').includes('Total 2h20'))});

console.log('13-14. Évolution');
t('13. relevé précédent : TTE 167h55 → 110h50 (−57h05), brut, HS, paniers',()=>{
  const i=h2.indexOf('data-open="evol"'),x=text(h2.slice(i,h2.indexOf('</details>',i)));
  ['TTE 167h55 110h50 −57h05','HS 50 % 30h55 0h50 −30h05','Total HS 62h55 16h50 −46h05','Brut estimé 3 463,54 € 1 791,78 € −1 671,76 €','Paniers IR 13 11 −2','Jours travaillés 18 14 −4'].forEach(v=>assert.ok(x.includes(v),v));
  assert.ok(x.includes('Journées de travail : 18 → 14'));assert.ok(x.includes('Jours de CP : 5 → 0'));assert.ok(x.includes('ne sont pas présentées comme la cause'));assert.ok(x.includes('comparaison provisoire'))});
t('13b. variation sans différence de données identifiable : « cause non déterminable »',()=>{
  const days={...R1.days};Object.entries(R1.days).forEach(([k,v])=>{days[L1.X.addD(k,28)]=clone(v)});days['2026-09-22']={...days['2026-09-22'],fin:'18:00'};
  const L=load(days,{start:'2026-09-21'}),i=L.A.html(NOW).indexOf('data-open="evol"'),h=L.A.html(NOW),x=text(h.slice(i,h.indexOf('</details>',i)));
  assert.ok(x.includes('Variation constatée — cause non déterminable avec les données disponibles.'),x)});
t('14. aucun relevé précédent : « Pas de relevé précédent saisi »',()=>{assert.equal(d1.precedent,null);assert.ok(t1.includes('Pas de relevé précédent saisi'))});

console.log('15-18. ROMI1 (module du lot F)');
t('15. ROMI1 identique : 🟢 concordant',()=>{const d=load(ALL,{romi:[{...ROMI_REF,ttePeriodH:10075/60}]}).A.data(NOW),c=d.checks.find(x=>x.key==='romi');assert.equal(c.niveau,'ok');assert.ok(c.texte.includes('concordants'))});
t('16. ROMI1 absent : non évalué, « Pas de relevé ROMI1 disponible. »',()=>{const L=load(ALL),d=L.A.data(NOW);assert.equal(d.checks.find(x=>x.key==='romi').niveau,'na');assert.ok(text(L.A.html(NOW)).includes('Pas de relevé ROMI1 disponible.'))});
t('17. ROMI1 avec écart : « Écart ROMI1 : 17h40 », « À vérifier — écart à analyser », totaux seuls signalés',()=>{
  assert.ok(t1.includes('Écart ROMI1 : 17h40'));assert.ok(t1.includes('À vérifier — écart à analyser.'));
  assert.ok(t1.includes('Le relevé ROMI1 actuel ne contient que les totaux. L’écart ne peut pas être localisé jour par jour.'));assert.ok(!/s’explique|cause de l’écart/.test(t1))});
t('18. intégration du lot F : même analyse que MHRomiRecon ; détail journalier repris quand il existe',()=>{
  assert.deepEqual(d1.romi,L1.win.MHRomiRecon.analyze({start:'2026-08-24',end:'2026-09-20'}));
  const jours=[];for(let k='2026-08-24';k<='2026-09-20';k=L1.X.addD(k,1)){const r=L1.X.cd(k),w=ALL[k]&&ALL[k].t==='T';jours.push({date:k,presence:w,tteMin:w?r.tte:0})}
  jours.find(x=>x.date==='2026-09-16').tteMin-=420;
  const tx=text(load(ALL,{romi:[{...ROMI_REF,jours}]}).A.html(NOW));assert.ok(tx.includes('Journées comparables 28 / 28'));assert.ok(tx.includes('Écart restant à analyser +10h40'))});

console.log('19-20. Checklist et bloquants');
const KEYS=['saisie','tte','hs25','hs50','cp','paniers','nuit','idaj','habillage','romi','hsPayees','reglementaire'];
t('19. checklist : 12 contrôles, chacun avec titre, explication, source et écran cible',()=>{
  assert.deepEqual(d1.checks.map(x=>x.key),KEYS);d1.checks.forEach(x=>{assert.ok(x.titre&&x.texte&&x.source&&x.cible,x.key)});
  KEYS.forEach(k=>assert.ok(h1.includes('data-check="'+k+'"'),k));['→ Compteur','→ Paie','→ Audit','→ ROMI1','→ Saisie'].forEach(l=>assert.ok(t1.includes(l),l))});
t('20. bloquants : HS payées non renseignées ; journée sans fin → saisie bloquante, TTE et HS provisoires',()=>{
  assert.equal(d1.checks.find(x=>x.key==='hsPayees').niveau,'bad');assert.ok(t1.includes('HS payées non renseignées'));
  const days=clone(ALL);delete days['2026-09-03'].fin;const d=load(days).A.data(NOW);
  assert.equal(d.checks.find(x=>x.key==='saisie').niveau,'bad');assert.ok(d.checks.find(x=>x.key==='saisie').cible==='jour:2026-09-03');assert.equal(d.checks.find(x=>x.key==='tte').niveau,'warn')});
t('20b. HS payées différentes du calcul : 🟠 écart (saisie Paie prioritaire)',()=>{const d=load(ALL,{db:{bul:{'2026-08-24':{p25:16,p50:4.33}}}}).A.data(NOW),c=d.checks.find(x=>x.key==='hsPayees');
  assert.equal(c.niveau,'warn');assert.ok(c.texte.includes('HS 25 % +16h00'))});
t('impact potentiel : classé, sans aucune somme d’impact inventée',()=>{
  const i=h1.indexOf('data-open="impact"'),x=text(h1.slice(i,h1.indexOf('</details>',i)));
  ['HS payées HS dans le brut estimé : 1 226,53 € Impact potentiel : important','ROMI1 Impact à déterminer','CP Impact : possible','Paniers Impact : possible','Aucun problème détecté','Aucun montant d’impact n’est additionné'].forEach(v=>assert.ok(x.includes(v),v));
  assert.ok(x.indexOf('Impact potentiel : important')<x.indexOf('Impact à déterminer'))});
t('mois de paie : « Bulletin — septembre 2026 », « ⚠️ Rattachement à confirmer »',()=>{assert.ok(t1.includes('Bulletin — septembre 2026'));assert.ok(t1.includes('⚠️ Rattachement à confirmer'));assert.ok(t2.includes('Bulletin — octobre 2026'))});
t('déjà payé : absence ≠ paiement nul ; sources saisie Paie, ROMI1, bulletin',()=>{
  assert.ok(t1.includes('L’absence d’information n’est pas un paiement nul.'));
  const tx=text(load(ALL,{romi:[{...ROMI_REF,hs125PaidH:16,hs150PaidH:4.33}],db:{bul:{'2026-08-24':{p25:1}},bulletins:[{mois:'2026-09',hs25H:16,hs50H:4.33}]}}).A.html(NOW));
  ['saisie Paie','bulletin septembre 2026 (rattachement à confirmer)','ROMI1 (payées + en RC)'].forEach(v=>assert.ok(tx.includes(v),v))});
t('outils : Détail paie, Sauvegarde, Feuille de route, Audit, Compteur, ROMI1, Dossier',()=>{['💶 Détail paie','⬇ Sauvegarde','📄 Feuille de route','🛡️ Audit','⏱️ Compteur','🔎 ROMI1','📁 Dossier'].forEach(v=>assert.ok(t1.includes(v),v))});
t('aucune valeur invalide affichée (deux références, aucune donnée)',()=>{[t1,t2].forEach(x=>assert.ok(!BAD.test(x),x.match(BAD)))});

console.log('21-23. Simulation isolée');
t('21. simulation : brut simulé = brutOf() sur une copie (HS 25 % +1h00, HS 50 % +0h30, IR +2)',()=>{
  const L=load(ALL,{romi:[ROMI_REF]}),A=L.A;A.sim('h25',60);A.sim('h50',30);A.sim('ir',1);A.sim('ir',1);
  const d=A.data(NOW),G=clone(L.X.calcPer('2026-08-24',2).G);G.h25+=60;G.h50+=30;G.ir+=2;const exp=L.X.brutOf(G);
  assert.equal(d.sim.brut,exp.tot);assert.equal(d.sim.brutReel,d.B.tot);assert.equal(d.sim.diffBrut,exp.tot-d.B.tot);assert.equal(d.sim.net,exp.netEst);
  const tx=text(A.html(NOW));assert.ok(tx.includes('Impact simulé'));assert.ok(tx.includes('Brut actuel 3 463,54 €'));assert.ok(tx.includes('Différence +'+(exp.tot-d.B.tot).toFixed(2).replace('.',',')+' €'));
  assert.equal(L.rendered(),4,'rendu relancé après chaque réglage')});
t('21b. simulation bornée à 0 et limitée aux paramètres du moteur (clé inconnue ignorée)',()=>{
  const A=load(ALL,{start:'2026-09-21'}).A;A.sim('h50',-600);A.sim('tte',60);A.sim('h25','x');const d=A.data(NOW);assert.equal(d.sim.params.h50,0);assert.deepEqual(A._simState(),{h25:0,h50:-600,ir:0,iru:0})});
t('22. sortie de simulation : retour aux valeurs réelles, plus d’impact simulé',()=>{
  const A=load(ALL).A;A.sim('h25',120);A.simExit();const d=A.data(NOW);assert.equal(d.sim,null);assert.equal(A._simState(),null);assert.ok(!text(A.html(NOW)).includes('Impact simulé'))});
t('23. TEST CRITIQUE : snapshot complet avant, plusieurs simulations, snapshot après → aucune donnée réelle modifiée',()=>{
  const L=load(ALL,{freeze:true,romi:[ROMI_REF],db:{constats:[{id:'C1',jour_concerne:'2026-09-02'}],bul:{},bulletins:[],periods:[{start:'2026-08-24',nb:2}]}});
  const snap=JSON.stringify(L.X.DB),G0=JSON.stringify(L.X.calcPer('2026-08-24',2).G),B0=L.X.brutOf(L.X.calcPer('2026-08-24',2).G).tot;
  const A=L.A;for(let i=0;i<5;i++){A.sim('h25',15*i);A.sim('h50',-15);A.sim('ir',1);A.sim('iru',-1);A.html(NOW)}A.simExit();A.sim('h50',600);A.html(NOW);A.simExit();
  for(const k of ['jour:2026-09-03','paie','compteur','audit','romi','dossier','detail'])try{A.go(k)}catch(e){}
  assert.equal(JSON.stringify(L.X.DB),snap,'Aucune donnée réelle modifiée');assert.equal(JSON.stringify(L.X.calcPer('2026-08-24',2).G),G0,'moteur intact');
  assert.equal(L.X.brutOf(L.X.calcPer('2026-08-24',2).G).tot,B0);assert.deepEqual(L.writes,[]);console.log('      → Aucune donnée réelle modifiée.')});
t('aucune duplication du moteur : pas de taux, de seuil HS ni de formule de brut dans le module',()=>{
  const src=fs.readFileSync(path.join(WEB,'app-v37-assistant-paie.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.ok(!/1\.25|1\.5\b|\*\s*S\.taux|S\.taux\s*\*|\.taux\b/.test(src),'taux ou majoration recalculés');assert.ok(!/calcPerRaw|cdRaw|minutesNuit|mhEffectivePauses/.test(src))});
t('window.DB non exposé',()=>{assert.equal(L1.win.DB,undefined)});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.0-G passent.');
process.exit(fails?1:0);
