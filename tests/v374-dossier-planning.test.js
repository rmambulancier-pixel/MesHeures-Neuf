#!/usr/bin/env node
/*
 * V37.4.0 — Dossier : plannings prévisionnels (section 12). Tests Node.
 * Lancer : node tests/v374-dossier-planning.test.js
 *
 * 1. Préparation (stockage modifiable) : parcours réel du module Planning (OCR simulé d'un planning COLLECTIF avec des noms
 *    inventés, correction, validation C3), fiche créée directement (sans analyse), analyse retirée après validation, fiche
 *    supprimée, import non validé, correction après validation, conflit entre deux plannings.
 * 2. Dossier (application réelle : moteur + modules du dossier + Planning + calendrier) sur un stockage ESPION qui enregistre
 *    toute écriture : JSON (data/canonical), HTML imprimable et PDF.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const {readPdf}=require('./pdf-reader');
const REPO=path.join(__dirname,'..'),SC=path.join(REPO,'app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const KEY='mh_planning_v372',DBKEY='mesheures_v3';
const NOW='2026-10-09T10:00:00Z',GEN='2026-10-10T08:00:00.000Z';
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
const clone=o=>JSON.parse(JSON.stringify(o));
let fails=0;const tests=[];const t=(n,f)=>tests.push([n,f]);

/* ---------- 1. préparation : tests/lib/dossier-planning-store.js (parcours réel du module Planning) ---------- */
const {preparer,COLLEGUES,SHA_A,SHA_B,SHA_C,SHA_E}=require('./lib/dossier-planning-store.js');

/* ---------- 2. dossier : application réelle sur un stockage espion ---------- */
function espion(init){const m=new Map(Object.entries(init||{})),w=[];
  return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{w.push(['set',k])},removeItem:k=>{w.push(['remove',k])},clear:()=>{w.push(['clear'])},key:i=>[...m.keys()][i]||null,get length(){return m.size},writes:w,map:m}}
function dossier(planningStore,opts){opts=opts||{};
  const DBSTR=JSON.stringify({s:fx.s,days:fx.days});
  const ls=espion(Object.assign({[DBKEY]:DBSTR},planningStore!=null?{[KEY]:planningStore}:{})),win={localStorage:ls};
  const doc={readyState:'complete',getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{}}),dispatchEvent(){},addEventListener(){},body:{appendChild(){}}};
  const ctx={window:win,document:doc,localStorage:ls,CustomEvent:function(){},console:{...console,info(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,
    Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error,Uint8Array};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SC,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(fx.s)+'};DB.days='+JSON.stringify(fx.days)+';mhNormalizeMealSettings();mhMigrateLegacyMealChoices();'+
    'function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){};globalThis.__x={get DB(){return DB},cd};',ctx);
  for(const f of ['app-legal.js','app-evidence.js','app-v371-nuit.js','app-v37-control.js','app-v37-romi-reconciliation.js'].concat(opts.sansPlanning?[]:['app-v372-planning.js','app-v372-planning-calendrier.js']))
    vm.runInContext(fs.readFileSync(path.join(SC,f),'utf8'),ctx,{filename:f});
  if(opts.freeze)vm.runInContext('(function f(o){if(o&&typeof o==="object"&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(f)}})(DB);',ctx);
  const daysAvant=JSON.stringify(ctx.__x.DB.days),lsAvant=new Map(ls.map);
  vm.runInContext(fs.readFileSync(path.join(SC,'app-v37-dossier.js'),'utf8'),ctx,{filename:'app-v37-dossier.js'});
  const M=win.MHDossier,d=M.data({today:'2026-10-10',generatedAt:GEN}),canon=M.canonical(d),hash=crypto.createHash('sha256').update(canon).digest('hex');
  const bytes=M.pdf(d,{dataHash:hash}),html=M.html(d,{dataHash:hash});
  return {M,d,canon,hash,bytes,html,pdf:readPdf(bytes),ls,lsAvant,daysAvant,daysApres:JSON.stringify(ctx.__x.DB.days)};
}

(async()=>{
const prep=await preparer();
const R=dossier(prep.store);
const pl=R.d.plannings,F=id=>pl.fiches.find(f=>f.id===id),T=R.pdf.text.replace(/\s+/g,' '),H=R.html;

console.log('A — Lecture seule');
t('aucune écriture pendant data(), canonical(), html() et pdf() : ni setItem, ni removeItem, ni clear',()=>{assert.deepEqual(R.ls.writes,[])});
t('mh_planning_v372 et mesheures_v3 identiques octet pour octet avant / après les trois exports',()=>{
  assert.equal(R.ls.map.get(KEY),R.lsAvant.get(KEY));assert.equal(R.ls.map.get(DBKEY),R.lsAvant.get(DBKEY));assert.equal(R.ls.map.get(KEY),prep.store)});
t('DB.days identique avant / après',()=>{assert.equal(R.daysApres,R.daysAvant)});
t('DB gelé (Object.freeze profond) : le dossier se génère, plannings compris',()=>{const Z=dossier(prep.store,{freeze:true});
  assert.equal(Z.d.plannings.fiches.length,3);assert.deepEqual(Z.ls.writes,[]);assert.equal(Z.daysApres,Z.daysAvant)});
t('aucun planning créé, modifié ou supprimé : mêmes fiches, imports et analyses dans le stockage',()=>{const o=JSON.parse(R.ls.map.get(KEY)),p=JSON.parse(prep.store);
  assert.deepEqual(Object.keys(o.plannings).sort(),Object.keys(p.plannings).sort());assert.deepEqual(Object.keys(o.imports).sort(),Object.keys(p.imports).sort());assert.deepEqual(Object.keys(o.analyses||{}).sort(),Object.keys(p.analyses||{}).sort())});
t('contrôle statique : le dossier n’appelle aucune fonction d’écriture du Planning ni la vérification de disponibilité',()=>{
  const s=fs.readFileSync(path.join(SC,'app-v37-dossier.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  ['setItem','removeItem','importMaj','enregistrer(','importEnregistrer','analyseEnregistrer','analyseSupprimer','ficheSupprimer','supprimer(','importer(','reglagesMaj','corriger(',
   'verifierSources','MHPlanningImport','existe('].forEach(w=>assert.ok(!s.includes(w),w))});

console.log('B — Métadonnées');
t('trois fiches validées restituées (A, B, C), triées par période ; la fiche supprimée D absente',()=>{
  assert.deepEqual(pl.fiches.map(f=>f.id),[prep.ids.A,prep.ids.B,prep.ids.C]);assert.ok(!F(prep.ids.D))});
t('A : fichier, type, taille, SHA-256 de l’original, période, salarié, page/tableau, import, validation, OCR, source',()=>{const f=F(prep.ids.A);
  assert.deepEqual(f.fichier,{nom:'planning-novembre.jpg',type:'image/jpeg',taille:2048,sha256:SHA_A});assert.deepEqual(f.periode,{debut:'2026-11-02',fin:'2026-11-15'});
  assert.equal(f.salarie,'ROTH Mickael');assert.equal(f.ligneChoisiePar,'utilisateur');assert.equal(f.tableau,1);assert.equal(f.importeLe,NOW);assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(f.valideLe));
  assert.equal(f.ocr.statut,'complet');assert.equal(f.ocr.moteur,JSON.parse(prep.store).plannings[prep.ids.A].ocr.moteur);assert.deepEqual(f.source,{etat:'disponible',importId:prep.imports.A});assert.equal(f.jours,14);assert.equal(f.journalLecture,'analyse')});
t('SHA-256 : celui de l’original, jamais recalculé ; affiché en entier dans le PDF et le HTML',()=>{[SHA_A,SHA_B,SHA_C].forEach(h=>{assert.ok(T.replace(/ /g,'').includes(h),'PDF '+h);assert.ok(H.includes(h),'HTML '+h)})});
t('B (sans analyse liée) : champs absents « non renseigné », lecture d’origine indisponible (aucune analyse liée)',()=>{const f=F(prep.ids.B);
  assert.equal(f.page,null);assert.equal(f.tableau,null);assert.equal(f.source.etat,null);assert.equal(f.journalLecture,'aucune_analyse');
  assert.ok(T.includes('lecture OCR d’origine indisponible (aucune analyse liée)'))});
t('C : source « à vérifier » (dernier état enregistré), jamais déclarée disponible',()=>{const f=F(prep.ids.C);assert.equal(f.source.etat,'a_verifier');
  assert.ok(T.includes('à vérifier (non retrouvée lors de la dernière vérification)'));assert.ok(T.includes('disponible lors de la dernière vérification enregistrée'))});

console.log('B — Traçabilité de la lecture');
t('A : la correction de lecture garde la lecture OCR d’origine (journal de l’analyse), avant, après, raison',()=>{
  const c=pl.corrections.find(x=>x.planningId===prep.ids.A&&x.champ==='texte');assert.ok(c);
  assert.deepEqual([c.origine,c.date,c.lectureOcrDisponible,c.lectureOcr,c.apres,c.raison],['analyse','2026-11-03',true,prep.brutA,'Jour 7h','lu de travers'])});
t('A : correction après validation distinguée (« après validation »), sans lecture OCR',()=>{
  const c=pl.corrections.filter(x=>x.planningId===prep.ids.A&&x.origine==='apres_validation');assert.equal(c.length,1);
  assert.deepEqual([c[0].date,c[0].champ,c[0].lectureOcr,c[0].lectureOcrDisponible],['2026-11-10','libelle',null,false]);assert.equal(F(prep.ids.A).corrections.apresValidation,1);
  assert.ok(T.includes('après validation'))});
t('horloge revenue en arrière : une correction de fiche datée avant la validation reste affichée (jamais masquée)',()=>{
  const c=pl.corrections.filter(x=>x.planningId===prep.ids.A&&x.date==='2026-11-14');assert.equal(c.length,1);assert.equal(c[0].origine,'validation');assert.equal(c[0].apres,'Samu')});
t('correction de type dans l’analyse, reportée sur la fiche à la validation : affichée une seule fois, avec sa lecture OCR',()=>{
  const c=pl.corrections.filter(x=>x.planningId===prep.ids.A&&x.date==='2026-11-04'&&x.champ==='type');assert.equal(c.length,1);
  assert.deepEqual([c[0].origine,c[0].apres,c[0].lectureOcrDisponible],['analyse','FORMATION',true]);
  const f=JSON.parse(prep.store).plannings[prep.ids.A];assert.ok(f.corrections.some(x=>x.date==='2026-11-04'&&x.champ==='type'),'le report existe bien sur la fiche')});
t('A : les corrections reportées sur la fiche à la validation ne sont pas affichées une seconde fois (journal de l’analyse disponible)',()=>{
  /* seule l'entrée du 14/11 (correction de fiche datée avant la validation, cas « horloge ») reste en « validation » : aucun doublon de l'analyse */
  assert.deepEqual(pl.corrections.filter(x=>x.planningId===prep.ids.A&&x.origine==='validation').map(x=>x.date),['2026-11-14'])});
t('C : analyse retirée → « lecture OCR d’origine indisponible (analyse retirée) » ; aucune lecture inventée',()=>{const f=F(prep.ids.C);
  assert.equal(f.journalLecture,'analyse_retiree');assert.ok(pl.corrections.filter(x=>x.planningId===prep.ids.C).every(x=>x.lectureOcr===null&&!x.lectureOcrDisponible));
  assert.ok(T.includes('lecture OCR d’origine indisponible (analyse retirée)'))});
t('historique : validation, analyse rejetée (raison), fiche supprimée',()=>{const a=pl.historique.map(h=>h.action);
  assert.ok(a.includes('planning(s) validé(s)'));assert.ok(pl.historique.some(h=>h.action==='analyse rejetée'&&h.raison==='analyse retirée pour le test'));
  assert.ok(pl.historique.some(h=>h.action==='fiche supprimée'&&h.plannings[0]===prep.ids.D&&h.fichier==='planning-supprime.jpg'));assert.ok(T.includes('fiche supprimée'))});
t('import analysé mais jamais validé : compté seulement, contenu non repris',()=>{assert.equal(pl.importsSansPlanning,2);   /* E + D (sa seule fiche a été supprimée) */
  assert.ok(T.includes('2 fichiers importés sans planning validé'));assert.ok(!pl.fiches.some(f=>f.fichier.sha256===SHA_E))});

console.log('C — Confidentialité et preuve');
t('aucun nom de collègue dans le JSON, le HTML ni le PDF (titre lu et rectificatif en contenaient)',()=>{
  const fiches=JSON.parse(prep.store).plannings;assert.ok(JSON.stringify(fiches).includes('GARNIER Hugo')&&JSON.stringify(fiches).includes('MARTIN Paul'),'le stockage en contient bien (titres lus)');
  COLLEGUES.forEach(n=>{[n,n.split(' ')[0]].forEach(x=>{assert.ok(!R.canon.includes(x),'JSON '+x);assert.ok(!H.includes(x),'HTML '+x);assert.ok(!T.includes(x),'PDF '+x)})})});
t('liste fermée : ni titre lu, ni nom lu, ni coordonnées, ni couleurs, ni référence locale, ni candidats dans le JSON des plannings',()=>{
  const j=JSON.stringify(pl);['titre','nomLu','nomConf','bbox','couleur','localRef','android:','tableCandidates','candidats','cellules'].forEach(k=>assert.ok(!j.includes(k),k))});
t('avertissement : prévisionnel, ne prouve pas le travail, hors de tout calcul (JSON, HTML, PDF)',()=>{
  assert.ok(/ne prouve pas le travail effectué/.test(pl.avertissement));[T,H.replace(/&#39;/g,'’')].forEach(x=>{assert.ok(x.includes('ne prouve pas le travail effectué'));assert.ok(x.includes('n’entre dans aucun calcul'))})});
t('conflit A / B le 12/11 : les deux valeurs restituées, aucune retenue',()=>{const j=pl.journees.find(x=>x.date==='2026-11-12');
  assert.equal(j.etat,'conflit');assert.equal(j.valeurs.length,2);assert.deepEqual(j.valeurs.map(v=>v.planningId).sort(),[prep.ids.A,prep.ids.B].sort());
  assert.ok(T.includes('conflit entre plannings : aucune valeur retenue'));assert.ok(!/retenu(e)? :/.test(T))});
t('identique A / B le 09/11 : une ligne, deux plannings',()=>{const j=pl.journees.find(x=>x.date==='2026-11-09');assert.equal(j.etat,'identique');assert.equal(j.valeurs.length,2);
  assert.ok(T.includes('identique dans 2 plannings'))});
t('10/11 (corrigé après validation sur A) : A et B diffèrent → conflit, pas d’arbitrage',()=>{const j=pl.journees.find(x=>x.date==='2026-11-10');assert.equal(j.etat,'conflit')});
t('ordre d’enregistrement sans effet : stockage réordonné → JSON des plannings identique',()=>{const o=JSON.parse(prep.store),r={};Object.keys(o.plannings).reverse().forEach(k=>{r[k]=o.plannings[k]});
  o.plannings=r;const ri={};Object.keys(o.imports).reverse().forEach(k=>{ri[k]=o.imports[k]});o.imports=ri;const Z=dossier(JSON.stringify(o));
  assert.equal(JSON.stringify(Z.d.plannings),JSON.stringify(pl))});
t('les plannings ne changent aucun chiffre réel du dossier (journées, périodes, totaux, ROMI1, rapprochement, contrôles)',()=>{const Z=dossier(null);
  const sans=k=>{const o=JSON.parse(k.canon);delete o.plannings;return JSON.stringify(o)};assert.equal(sans(R),sans(Z))});

console.log('D — Exports et intégrité');
t('PDF valide, paginé (« Page i / N »), toutes les lignes dans les marges, aucune valeur invalide',()=>{const N=R.bytes.pageCount;
  assert.equal(R.pdf.pagesDecl,N);R.pdf.pages.forEach((p,i)=>{assert.ok(p.text.includes('Page '+(i+1)+' / '+N));p.ops.forEach(o=>{assert.ok(o.x>=39&&o.x<=556,'x '+o.x);assert.ok(o.y>=20&&o.y<=815,'y '+o.y)})});
  assert.ok(!BAD.test(R.pdf.text))});
t('section 12 avant « 13. Intégrité » ; le HTML et le PDF portent les mêmes plannings que le JSON',()=>{
  assert.ok(T.indexOf('12. Plannings prévisionnels')<T.indexOf('13. Intégrité'));
  pl.fiches.forEach(f=>{assert.ok(T.includes(f.fichier.nom)&&H.includes(f.fichier.nom),f.fichier.nom)});
  assert.equal((T.match(/conflit entre plannings : aucune valeur retenue/g)||[]).length,pl.journees.filter(j=>j.etat==='conflit').length);
  assert.equal((H.match(/conflit entre plannings : aucune valeur retenue/g)||[]).length,pl.journees.filter(j=>j.etat==='conflit').length)});
t('empreinte globale = SHA-256 du JSON canonique (plannings compris), affichée en section 13 et en pied de page',()=>{
  assert.ok(R.canon.includes('"plannings":'));assert.ok(T.replace(/ /g,'').includes(R.hash));assert.ok(H.includes(R.hash))});
t('sans planning enregistré : « Aucun planning prévisionnel enregistré. » dans le PDF et le HTML ; JSON vide cohérent',()=>{const Z=dossier(null);
  assert.deepEqual([Z.d.plannings.disponible,Z.d.plannings.fiches.length,Z.d.plannings.journees.length,Z.d.plannings.corrections.length,Z.d.plannings.importsSansPlanning],[true,0,0,0,0]);
  assert.ok(Z.pdf.text.includes('Aucun planning prévisionnel enregistré.'));assert.ok(Z.html.includes('Aucun planning prévisionnel enregistré.'));assert.deepEqual(Z.ls.writes,[])});
t('module Planning absent : « indisponible », aucune erreur',()=>{const Z=dossier(prep.store,{sansPlanning:true});
  assert.equal(Z.d.plannings.disponible,false);assert.ok(Z.pdf.text.includes('Module de planning prévisionnel indisponible'))});
t('stockage Planning illisible (JSON corrompu) : état vide, aucune écriture, aucune erreur',()=>{const Z=dossier('{corrompu');
  assert.equal(Z.d.plannings.fiches.length,0);assert.deepEqual(Z.ls.writes,[])});

console.log('E — Non-régression');
/* V37.4.1 : app-backup.js modifié (fenêtres d'import et de restauration, accord du 10/10/2026) ; BACKUP_VERSION inchangé (décision du lot V37.4.0) */
t('fichiers hors périmètre identiques au tag v37.3.0 : app-core.js, modules Planning, Comparaison V37.3 ; BACKUP_VERSION toujours 37.3.0',()=>{
  assert.ok(/const BACKUP_VERSION='37\.3\.0';/.test(fs.readFileSync(path.join(SC,'app-backup.js'),'utf8')),'BACKUP_VERSION');
  const fichiers=['app-core.js'].concat(fs.readdirSync(SC).filter(f=>/^app-v37[23]-/.test(f))).map(f=>'app/src/main/assets/web/scripts/'+f);
  let base;try{base=cp.execSync('git rev-parse --verify -q v37.3.0^{commit} || git ls-remote origin "refs/tags/v37.3.0^{}" | cut -f1',{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n')[0]}catch(e){base=''}
  if(!base)base='bad6ce635c0f521c07da0038c2eea9c760c238b4';
  const diff=cp.execSync('git diff --name-only '+base+' -- '+fichiers.join(' '),{cwd:REPO,encoding:'utf8'}).trim();assert.equal(diff,'')});

for(const [n,f] of tests){try{await f();console.log('  ok  '+n)}catch(e){fails++;console.log('FAIL  '+n+'\n      '+(e&&e.message))}}
console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.4.0 (Dossier : plannings prévisionnels) passent ('+tests.length+').');process.exit(fails?1:0);
})().catch(e=>{console.log('FAIL  préparation : '+(e&&e.stack||e));process.exit(1)});
