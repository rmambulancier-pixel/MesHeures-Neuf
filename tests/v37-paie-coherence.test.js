#!/usr/bin/env node
/*
 * V37.0-H — Cohérence paie et finition. Tests Node.
 * Lancer : node tests/v37-paie-coherence.test.js
 * Données : fixtures ref-2026-08-24 (24/08 → 20/09) et ref-2026-09-21 (21/09 → 18/10), aujourd'hui = 08/10/2026.
 * Bulletin de septembre 2026 importé (brut 3 253,01 €, net 2 722,62 €) : il est la référence PRÉCÉDENTE du relevé
 * 21/09 → 18/10 et ne doit jamais être présenté comme son bulletin.
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
const BUL_SEPT={mois:'2026-09',brut:3253.01,net:2722.62,hNorm:151.67,hs25H:16,hs50H:4.33,irN:11,iruN:3};
const NOW='2026-10-08';

function load(opts={}){
  const writes=[],win={};
  const ls={getItem:()=>null,setItem:k=>writes.push(k),removeItem:k=>writes.push(k)};
  const ctx={window:win,document:{readyState:'complete',getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{}}),dispatchEvent(){},addEventListener(){},body:{appendChild(){}}},localStorage:ls,CustomEvent:function(){},
    console:{...console,info(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error,Uint8Array};
  /* Horloge figée au 08/10/2026 : « relevé en cours » = 21/09 → 18/10/2026, quel que soit le jour du test. */
  ctx.Date=class extends Date{constructor(...a){a.length?super(...a):super(NOW+'T10:00:00')}static now(){return Date.parse(NOW+'T10:00:00')}};
  ctx.globalThis=ctx;vm.createContext(ctx);
  const db={per:{start:opts.start||'2026-09-21',nb:2},bulletins:opts.bulletins||[BUL_SEPT],...(opts.db||{})};
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(R1.s)+'};DB.days='+JSON.stringify(opts.days||ALL)+';'+Object.entries(db).map(([k,v])=>'DB.'+k+'='+JSON.stringify(v)+';').join('')+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F,addD};',ctx);
  if(opts.romi!==false)win.MH_ROMI={list:()=>clone(opts.romi||[ROMI_REF])};
  if(opts.freeze){vm.runInContext('Object.freeze(DB);',ctx);deepFreeze(ctx.__x.DB)}
  for(const f of ['app-v37-periode.js','app-legal.js','app-evidence.js','app-v37-control.js','app-v37-dossier.js','app-v37-romi-reconciliation.js','app-v37-compteur.js','app-v37-assistant-paie.js'])
    vm.runInContext(fs.readFileSync(path.join(WEB,f),'utf8'),ctx,{filename:f});
  win.MHAssistantPaie.setRender(()=>{});
  return {P:win.MHPeriode,A:win.MHAssistantPaie,C:win.MHCompteur,R:win.MHRomiRecon,D:win.MHDossier,S:win.MHControl,X:ctx.__x,win,writes,ctx};
}
const text=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const blk=(h,id)=>{const i=h.indexOf('data-open="'+id+'"');assert.ok(i>=0,id);return h.slice(i,h.indexOf('</details>',i))};
const OPT={today:NOW};

const L=load(),F=L.X.F,h=L.A.html(OPT),tx=text(h),d=L.A.data(OPT);
const L1=load({start:'2026-08-24'}),h1=L1.A.html(OPT),d1=L1.A.data(OPT);

console.log('1-3. Période et bulletin de référence');
t('1. relevé en cours au 08/10/2026 : 21/09 → 18/10/2026 (mhQuatorzaine) ; 24/08 → 20/09 « antérieur »',()=>{
  assert.deepEqual(L.P.courante(NOW),{debut:'2026-09-21',fin:'2026-10-18'});assert.equal(L.P.statut('2026-09-21','2026-10-18',NOW),'en cours');
  assert.equal(L.P.statut('2026-08-24','2026-09-20',NOW),'antérieur');assert.equal(L.P.libelle('2026-09-21','2026-10-18',NOW),'Relevé en cours · 21/09 → 18/10/2026');
  assert.deepEqual(L.P.paie(),{debut:'2026-09-21',fin:'2026-10-18',nb:2},'période de l’écran Paie lue via mhCurrentPaySummary')});
t('1b. chaque zone qualifie sa période : Assistant « Relevé en cours », période antérieure signalée avec le relevé en cours',()=>{
  assert.ok(tx.includes('Relevé en cours · 21/09 → 18/10/2026 · période de l’écran Paie'));
  const x=text(h1);assert.ok(x.includes('Relevé antérieur · 24/08 → 20/09/2026'));assert.ok(x.includes('Relevé en cours : 21/09 → 18/10/2026'))});
t('1c. Compteur : statut du relevé et note quand l’écran Paie porte sur une autre période',()=>{
  const c=text(L1.C.html({today:NOW,start:'2026-09-21'}));assert.ok(c.includes('relevé en cours'));assert.ok(c.includes('L’écran Paie porte sur une autre période : 24/08 → 20/09/2026.'));
  const same=text(L.C.html({today:NOW,start:'2026-09-21'}));assert.ok(!same.includes('autre période'))});
t('2. bulletin de septembre 2026 = référence PRÉCÉDENTE du relevé 21/09 → 18/10 (mois de paie octobre, à confirmer)',()=>{
  const r=L.P.bulletinReference('2026-09-21');assert.equal(r.statut,'precedent');assert.equal(r.mois,'2026-09');
  assert.ok(r.texte.includes('Dernier bulletin disponible : septembre 2026. Référence précédente — pas le bulletin de la période courante.'));
  assert.equal(L.P.bulletinReference('2026-08-24').statut,'rattache');assert.equal(load({bulletins:[]}).P.bulletinReference('2026-09-21').statut,'absent')});
t('3. aucune confusion : brut estimé 1 791,78 € pour 21/09 → 18/10 ; 3 253,01 € seulement comme référence précédente qualifiée',()=>{
  assert.ok(tx.includes('Brut estimé 1 791,78 €'));const card=text(h.slice(h.indexOf('mh37p-ref'),h.indexOf('POINTS À TRAITER')));
  assert.ok(card.includes('Bulletin de référence Septembre 2026'));assert.ok(card.includes('référence précédente, pas le bulletin de la période courante'));
  const occ=tx.split('3 253,01 €').length-1;assert.equal(occ,1,'une seule mention, dans les sources');assert.ok(/brut 3 253,01 € \(référence précédente\)/.test(tx))});

console.log('4-7. Sources des données');
const src=text(blk(h,'sources')),cut=(a,b)=>src.slice(src.indexOf(a),b?src.indexOf(b):undefined);
t('4. « Calculé par MesHeures » : TTE, amplitude, HS, nuit, habillage, paniers, brut, net (valeurs du moteur)',()=>{
  const x=cut('Calculé par MesHeures','Fourni par l’employeur');
  ['TTE 110h50','Amplitude 116h20','HS 25 % · HS 50 % 16h00 · 0h50','Nuit 4h00','Habillage 2h20','Paniers 11 IR · 0 IRU','Brut estimé 1 791,78 €','Net salaire estimé 1 410,13 €'].forEach(v=>assert.ok(x.includes(v),v));
  assert.equal(d.G.tte,L.X.calcPer('2026-09-21',2).G.tte)});
t('5. « Fourni par l’employeur » : ROMI1, HS payées, RC employeur, bulletin ; absent = « non renseigné »',()=>{
  const x=cut('Fourni par l’employeur','Hypothèse');['TTE ROMI1 non renseigné','HS réellement payées non renseigné','RC employeur non renseigné','Bulletin septembre 2026 · brut 3 253,01 € (référence précédente)'].forEach(v=>assert.ok(x.includes(v),v));
  const y=text(blk(h1,'sources'));assert.ok(y.includes('TTE ROMI1 150h15'));assert.ok(y.includes('RC employeur solde 174h09 (ROMI1)'))});
t('6. « Hypothèse / à confirmer » : rattachement du mois, durée d’un CP, cause de l’écart ROMI1, RC non renseigné',()=>{
  const x=cut('Hypothèse');['Rattachement du mois de paie octobre 2026 · à confirmer','Durée réelle d’un jour de CP 7h00 (réglage) · à confirmer','RC employeur non renseigné · solde indéterminable','HS payées donnée absente · traitement inconnu (jamais 0)'].forEach(v=>assert.ok(x.includes(v),v));
  assert.ok(text(blk(h1,'sources')).includes('Cause de l’écart ROMI1 non déterminée'));
  assert.ok(/data-tone="warn"><span>Rattachement du mois de paie/.test(blk(h,'sources')),'hypothèse en 🟠, jamais en 🟢')});
t('7. absence de donnée ≠ zéro : HS payées et RC absents restent « non renseigné », jamais conformes ni 0h00',()=>{
  const c=d.checks.find(x=>x.key==='hsPayees');assert.equal(c.niveau,'bad');assert.ok(!/HS réellement payées 0h00/.test(src));
  assert.equal(d.rcEmployeur.acquis,null);assert.equal(d.rcEmployeur.solde,null);
  assert.equal(d.checks.find(x=>x.key==='romi').niveau,'na','ROMI1 absent : non évalué, pas conforme');assert.equal(d.score,Math.round(d.compte.ok/(d.compte.ok+d.compte.warn+d.compte.bad)*100))});

console.log('8-11. Simulation, ROMI1, RC, impact');
t('8. simulation : HS 25 %, HS 50 %, IR, IRU → brut et net = brutOf() sur copie ; bandeau ; sortie sans aucune mutation',()=>{
  const M=load({freeze:true,romi:[ROMI_REF],db:{bul:{},constats:[{id:'C1'}],cmp:{'2026-09-21':'40:00'}}}),snap=JSON.stringify(M.X.DB),G0=JSON.stringify(M.X.calcPer('2026-09-21',2).G);
  M.A.sim('h25',60);M.A.sim('h50',45);M.A.sim('ir',2);M.A.sim('iru',1);
  const s=M.A.data(OPT).sim,G=clone(M.X.calcPer('2026-09-21',2).G);G.h25+=60;G.h50+=45;G.ir+=2;G.iru+=1;const b=M.X.brutOf(G);
  assert.equal(s.brut,b.tot);assert.equal(s.net,b.netEst);assert.ok(text(M.A.html(OPT)).includes('🧪 SIMULATION — aucune donnée réelle modifiée'));
  M.A.simExit();const r=M.A.data(OPT);assert.equal(r.sim,null);assert.equal(r.B.tot,M.X.brutOf(M.X.calcPer('2026-09-21',2).G).tot);
  assert.ok(!text(M.A.html(OPT)).includes('🧪 SIMULATION —'));assert.equal(JSON.stringify(M.X.DB),snap);assert.equal(JSON.stringify(M.X.calcPer('2026-09-21',2).G),G0);assert.deepEqual(M.writes,[])});
t('9. ROMI1 sans détail journalier : « Écart non localisé faute de détail journalier ROMI1. » (Assistant, Compteur, Dossier)',()=>{
  const x=text(blk(h1,'romi'));assert.ok(x.includes('Écart non localisé faute de détail journalier ROMI1.'));assert.ok(x.includes('MesHeures calcul interne 167h55'));assert.ok(x.includes('ROMI1 source employeur 150h15'));assert.ok(x.includes('Écart +17h40'));
  assert.ok(text(L1.C.html({today:NOW,start:'2026-08-24'})).includes('Écart non localisé faute de détail journalier ROMI1.'));
  const dd=L1.D.data({today:NOW});assert.equal(dd.romi[0].detailJournalier,false);assert.ok(L1.D.model(dd,{}).some(b=>b.k==='table'&&b.rows.some(r=>r.some(c=>String(c).includes('non localisé : totaux ROMI1 seuls')))))});
t('10. RC employeur distinct du RC théorique : saisie Paie (acquis) ou ROMI1 (solde), jamais fabriqué',()=>{
  assert.deepEqual(L1.A.data(OPT).rcEmployeur,{acquis:null,solde:10449,source:'ROMI1'});
  assert.deepEqual(load({db:{bul:{'2026-09-21':{rcAcq:3.5}}}}).A.data(OPT).rcEmployeur,{acquis:210,solde:null,source:'saisie Paie'});
  assert.deepEqual(d.rcEmployeur,{acquis:null,solde:null,source:null})});
t('11. aucun impact financier inventé : catégories, « non déterminable », aucun montant',()=>{
  const x=text(blk(h,'impact'));assert.ok(x.includes('Impact financier : non déterminable avec les données disponibles.'));assert.ok(!/\d,\d{2} €/.test(x));
  assert.ok(x.includes('🔴 Impact potentiellement financier direct'));assert.ok(x.includes('🟠 Impact possible'))});

console.log('13-14. Verdict, score, statuts');
t('13. verdict cohérent avec les contrôles et définitions affichées',()=>{
  assert.equal(d.verdict.texte,d.compte.bad?'BULLETIN BLOQUÉ':d.compte.warn?'BULLETIN À VÉRIFIER':'BULLETIN PRÊT À CONTRÔLER');
  const x=text(blk(h,'check'));['🔴 Bloquant Une donnée indispensable au contrôle du bulletin manque ou présente une incohérence importante.','🟠 À vérifier Une donnée existe mais nécessite une confirmation ou une vérification.','🟢 Contrôlé La donnée a pu être vérifiée sans anomalie détectée.'].forEach(v=>assert.ok(x.includes(v),v))});
t('14. score = conformes / évalués ; aucun 100 % sans contrôle évalué',()=>{
  assert.equal(d.score,55);assert.deepEqual(d.compte,{ok:6,warn:4,bad:1,na:1});
  const E=load({days:{}}).A.data(OPT);assert.equal(E.score,null);assert.equal(E.verdict.texte,'DONNÉES INSUFFISANTES')});
t('statuts homogènes : Smart Control « Données insuffisantes » en neutre (⚪), jamais rouge ni orange',()=>{
  const E=load({days:{}}),s=E.S.analyze({end:NOW});assert.equal(s.status,'insufficient');const ht=E.S.cardHtml(s,'');assert.ok(/mh31-badge" data-tone="mut"/.test(ht),ht.slice(0,300))});

console.log('Cohérence entre modules (24/08 → 20/09)');
t('Assistant, Compteur, ROMI1 et Dossier donnent les mêmes valeurs (moteur unique)',()=>{
  const c=L1.C.data({today:NOW,start:'2026-08-24'}),r=L1.R.analyze({start:'2026-08-24',end:'2026-09-20'}),dd=L1.D.data({today:NOW}),p=dd.periodes.find(x=>x.debut==='2026-08-24');
  assert.equal(d1.G.tte,c.travail.tte);assert.equal(c.travail.tte,p.tte);assert.equal(r.mesheures.tte,d1.G.tte);assert.equal(dd.romi[0].tteMesHeures,r.mesheures.tte);
  assert.equal(d1.G.h25+d1.G.h50,c.hs.total);assert.equal(c.hs.total,p.h25+p.h50);assert.equal(dd.romi[0].hsMesHeures,r.mesheures.hs);
  assert.equal(c.romi.ecartTte,d1.romi.ecartTte);assert.equal(F(r.ecartTte),'17h40');assert.equal(d1.B.tot,p.brut)});
t('mois de paie jamais présenté comme établi (Assistant, Compteur, Dossier)',()=>{
  [tx,text(h1),text(L.C.html({today:NOW,start:'2026-09-21'}))].forEach(x=>{assert.ok(/[Rr]attachement à confirmer/.test(x));assert.ok(!/payé sur le mois de sa date de fin/.test(x))});
  assert.equal(L1.D.data({today:NOW}).meta.regleMoisDePaieStatut,'à confirmer')});
t('aucune valeur invalide affichée',()=>{[tx,text(h1)].forEach(x=>assert.ok(!/undefined|NaN|\bnull\b|\[object/.test(x)))});
t('window.DB non exposé',()=>{assert.equal(L.win.DB,undefined)});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.0-H passent.');
process.exit(fails?1:0);
