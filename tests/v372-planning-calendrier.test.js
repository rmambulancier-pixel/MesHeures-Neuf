#!/usr/bin/env node
/*
 * V37.2.0-D — Planning prévu : vue 📅 Planning (calendrier du prévisionnel VALIDÉ). Tests Node.
 * Lancer : node tests/v372-planning-calendrier.test.js
 * Données : fiches créées par le cœur du lot A (comme le fait la validation C3) et parcours OCR simulé (synthétique, noms
 * inventés). Le rendu réel (navigateur, 360/412/448 px, clair/sombre) est testé par v372-planning-calendrier.browser.js.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
const S=require('./lib/planning-synthetique.js');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web'),SC=path.join(WEB,'scripts');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const PL=['app-v372-planning.js','app-v372-planning-grid.js','app-v372-planning-analysis.js','app-v372-planning-validation.js','app-v372-planning-calendrier.js'];
const SRC=Object.fromEntries(PL.map(f=>[f,fs.readFileSync(path.join(SC,f),'utf8')]));
let fails=0;const tests=[];const t=(n,f)=>tests.push([n,f]);
const SHA_A='a1'.repeat(32),SHA_B='b2'.repeat(32),NOW='2026-10-09T10:00:00Z';
function fakeStorage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},map:m}}
function load(){const st=fakeStorage(),win={localStorage:st,crypto:globalThis.crypto};PL.forEach(f=>vm.compileFunction(SRC[f],['window'],{filename:f})(win));
  return {P:win.MHPlanning,A:win.MHPlanningAnalysis,V:win.MHPlanningValidation,C:win.MHPrevuCalendrier,ls:st,st:win.MHPlanning.store(st),win}}
const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
/* fiche validée, comme la crée la validation C3 (une par tableau, avec son origine) */
function fiche(m,o){const fin=addJ(o.debut,o.labels.length-1);
  const p=m.P.creer({importeLe:NOW,source:{nom:o.nom||'planning.pdf',mime:'application/pdf',taille:1000,sha256:o.sha||SHA_A},periode:{debut:o.debut,fin,origine:'ocr'},
    salarie:{nom:'ROTH Mickael',ligne:3,confirme:true},ligne:{ligne:3,nomLu:'ROTH Mickael',nomConf:95,cellules:o.labels.map((x,i)=>({colonne:i,texte:x,conf:95,couleur:o.couleur||'#1f7a3d'}))},
    ocr:{moteur:'tesseract.js',statut:'complet'},origine:{importId:o.importId||null,sourceSha256:o.sha||SHA_A,page:o.page==null?null:o.page,tableId:o.tableId==null?0:o.tableId,orientation:{exif:1,rotation180:!!o.retournee}}});
  return m.st.enregistrer(Object.assign(p,{id:'pl-'+(o.sha||SHA_A).slice(0,12)+'-t'+(o.tableId||0)+'-'+o.debut}))}
/* cas réel reproduit (libellés de la ligne de l'utilisateur sur les deux plannings papier du 06/10/2026) */
const L={J:'Jour 7h',R:'Repos',C:'Condo m',F:'Jour Férié',K:'Congés 35',S:'Samu'};
const A_LAB='JJJJJRRJJJJJRRJJJJJRRJJJJJRRJJJ'.split('').map(x=>L[x]);           /* 05/10 → 04/11 */
const B_LAB='JJJRRCCRRFJJRRJJJJJRRJJJJJRRJJJ'.split('').map(x=>L[x]);           /* 02/11 → 02/12 */
function casReel(m){return {A:fiche(m,{debut:'2026-10-05',labels:A_LAB,page:2,tableId:1,retournee:true}),B:fiche(m,{debut:'2026-11-02',labels:B_LAB,page:1,tableId:0})}}

console.log('Calendrier : fiches validées seulement');
t('1. une fiche validée apparaît dans le calendrier (libellé, provenance, nature « prévisionnel »)',()=>{const m=load();casReel(m);
  const e=m.C.entree(m.st,'2026-10-12');assert.equal(e.etat,'prévu');assert.equal(e.libelle,'Jour 7h');assert.equal(e.nature,'prévisionnel');
  assert.deepEqual([e.provenances[0].page,e.provenances[0].tableau,e.provenances[0].periode.debut,e.provenances[0].periode.fin],[2,2,'2026-10-05','2026-11-04'])});
t('2. une analyse non validée n’apparaît pas',async()=>{const m=load();await ocrNonValide(m);
  assert.equal(m.C.fiches(m.st).length,0);assert.equal(m.C.mois(m.st,'2026-11').resume.prevus,0);assert.equal(m.C.entree(m.st,'2026-11-05').etat,'aucun')});
t('3. 31 jours associés aux bonnes dates (05/10 → 04/11)',()=>{const m=load(),{A}=casReel(m);
  const l=m.C.periode(m.st,'2026-10-05','2026-11-04');assert.equal(l.length,31);l.forEach((e,i)=>{assert.equal(e.date,addJ('2026-10-05',i));assert.ok(e.valeurs.some(v=>v.provenance.planningId===A.id&&v.libelle===A_LAB[i]))});
  assert.equal(m.C.entree(m.st,'2026-10-04').etat,'aucun');assert.equal(m.C.entree(m.st,'2026-12-03').etat,'aucun')});
t('4. navigation octobre → novembre → décembre (titres, semaines du lundi, jours prévus)',()=>{const m=load();casReel(m);
  assert.equal(m.C.ajouterMois('2026-10',1),'2026-11');assert.equal(m.C.ajouterMois('2026-11',1),'2026-12');assert.equal(m.C.ajouterMois('2026-11',-1),'2026-10');
  const o=m.C.mois(m.st,'2026-10'),n=m.C.mois(m.st,'2026-11'),d=m.C.mois(m.st,'2026-12');
  assert.deepEqual([o.titre,n.titre,d.titre],['Octobre 2026','Novembre 2026','Décembre 2026']);assert.deepEqual([o.resume.prevus,n.resume.prevus,d.resume.prevus],[27,30,2]);
  [o,n,d].forEach(M=>{assert.equal(M.semaines[0][0].date>''&&new Date(M.semaines[0][0].date+'T12:00:00Z').getUTCDay(),1);M.semaines.forEach(s=>assert.equal(s.length,7))});
  assert.equal(n.semaines[0][0].date,'2026-10-26');assert.equal(n.semaines[0].find(c=>c.date==='2026-10-31').dansMois,false)});
t('5. changement d’année : décembre 2026 → janvier 2027',()=>{const m=load();fiche(m,{debut:'2026-12-20',labels:Array(31).fill('Jour 7h'),sha:SHA_B});
  assert.equal(m.C.ajouterMois('2026-12',1),'2027-01');assert.equal(m.C.ajouterMois('2027-01',-1),'2026-12');
  const j=m.C.mois(m.st,'2027-01');assert.equal(j.titre,'Janvier 2027');assert.equal(j.resume.prevus,19);assert.equal(m.C.entree(m.st,'2027-01-19').libelle,'Jour 7h');assert.equal(m.C.entree(m.st,'2027-01-20').etat,'aucun')});

console.log('Libellés validés (jamais réinterprétés)');
const LIB=[['6. Jour 7h','Jour 7h','JOUR',420,null],['7. Repos','Repos','REPOS',null,null],['8. Samu','Samu','GARDE_SAMU',null,{debut:'08:00',fin:'20:00'}],
  ['9. Condo m','Condo m','GARDE_COMMERCIALE',null,{debut:'08:00',fin:'20:00'}],['10. Congés 35','Congés 35','CONGES_35H',null,null]];
LIB.forEach(([n,lab,type,duree,h])=>t(n+' : libellé de la fiche affiché tel quel ; durée/horaires du dictionnaire',()=>{const m=load(),p=fiche(m,{debut:'2026-11-02',labels:[lab]});
  const e=m.C.entree(m.st,'2026-11-02'),v=e.valeurs[0],i=p.interpretation[0];
  assert.equal(e.libelle,i.libelle);assert.equal(v.type,type);assert.equal(v.dureeMin,duree);assert.deepEqual(v.horaires,h);if(h)assert.equal(v.amplitudeMin,720)}));
t('Jour Férié et code non interprété : affichés tels que la fiche validée les porte, sans valeur inventée',()=>{const m=load(),p=fiche(m,{debut:'2026-11-11',labels:['Jour Férié','Xyz']});
  assert.equal(m.C.entree(m.st,'2026-11-11').libelle,p.interpretation[0].libelle);assert.equal(p.interpretation[0].type,'FERIE');const v=m.C.entree(m.st,'2026-11-12').valeurs[0];assert.equal(v.type,'NON_INTERPRETE');assert.equal(v.dureeMin,null)});
t('le calendrier n’interprète rien : aucun appel à interpreter(), aucune règle de couleur',()=>{const c=SRC['app-v372-planning-calendrier.js'].replace(/\/\*[\s\S]*?\*\//g,'');
  assert.ok(!/interpreter\(|DICT_V1|\b(vert|rouge|green|red)\b/.test(c))});

console.log('Plusieurs fiches, plusieurs fichiers, chevauchements');
t('11. plusieurs fiches issues du même fichier : provenances page/tableau distinctes',()=>{const m=load(),{A,B}=casReel(m);
  assert.equal(new Set([A,B].map(p=>p.source.sha256)).size,1);const n=m.C.mois(m.st,'2026-11');
  assert.deepEqual(n.plannings.map(x=>[x.page,x.tableau,x.periode.debut]),[[2,2,'2026-10-05'],[1,1,'2026-11-02']]);
  assert.equal(m.C.entree(m.st,'2026-10-20').provenances[0].page,2);assert.equal(m.C.entree(m.st,'2026-11-20').provenances[0].page,1)});
t('12. plusieurs fichiers : chaque date garde son fichier source',()=>{const m=load();fiche(m,{debut:'2026-11-02',labels:['Repos'],nom:'a.jpg',sha:SHA_A});fiche(m,{debut:'2026-12-01',labels:['Samu'],nom:'b.pdf',sha:SHA_B});
  assert.equal(m.C.entree(m.st,'2026-11-02').provenances[0].source,'a.jpg');assert.equal(m.C.entree(m.st,'2026-12-01').provenances[0].source,'b.pdf');assert.equal(m.C.entree(m.st,'2026-12-01').provenances[0].sha256,SHA_B)});
t('13. chevauchement à valeurs identiques (02, 03, 04/11 du cas réel) : affiché, deux provenances conservées',()=>{const m=load(),{A,B}=casReel(m);
  ['2026-11-02','2026-11-03','2026-11-04'].forEach(d=>{const e=m.C.entree(m.st,d);assert.equal(e.etat,'identique',d);assert.equal(e.libelle,'Jour 7h');
    assert.deepEqual(e.provenances.map(p=>p.planningId).sort(),[A.id,B.id].sort())});
  assert.equal(m.C.entree(m.st,'2026-11-01').etat,'prévu');assert.equal(m.C.entree(m.st,'2026-11-05').libelle,'Repos');assert.equal(m.C.mois(m.st,'2026-11').resume.identiques,3)});
t('14. chevauchement à valeurs différentes → ⚠ conflit, aucune valeur retenue, les deux visibles avec leur source',()=>{const m=load();
  fiche(m,{debut:'2026-11-02',labels:['Jour 7h','Repos'],sha:SHA_A,nom:'ancien.pdf'});fiche(m,{debut:'2026-11-03',labels:['Samu'],sha:SHA_B,nom:'nouveau.pdf'});
  const e=m.C.entree(m.st,'2026-11-03');assert.equal(e.etat,'conflit');assert.equal(e.libelle,null);
  assert.deepEqual(e.valeurs.map(v=>[v.libelle,v.provenance.source]).sort(),[['Repos','ancien.pdf'],['Samu','nouveau.pdf']]);assert.equal(m.C.mois(m.st,'2026-11').resume.conflits,1)});
t('le planning le plus récent n’écrase pas l’ancien (ordre d’enregistrement indifférent)',()=>{const a=load(),b=load();
  fiche(a,{debut:'2026-11-03',labels:['Repos'],sha:SHA_A});fiche(a,{debut:'2026-11-03',labels:['Samu'],sha:SHA_B});
  fiche(b,{debut:'2026-11-03',labels:['Samu'],sha:SHA_B});fiche(b,{debut:'2026-11-03',labels:['Repos'],sha:SHA_A});
  const ea=a.C.entree(a.st,'2026-11-03'),eb=b.C.entree(b.st,'2026-11-03');assert.equal(ea.etat,'conflit');assert.equal(eb.etat,'conflit');
  assert.deepEqual(ea.valeurs.map(v=>v.libelle),eb.valeurs.map(v=>v.libelle))});
t('24. plusieurs sources pour une même date : planningId, fichier, SHA, page, tableau, période et date de validation traçables',()=>{const m=load(),{A,B}=casReel(m);
  const e=m.C.entree(m.st,'2026-11-03');e.provenances.forEach(p=>['planningId','source','sha256','page','tableau','periode','valideLe','salarie'].forEach(k=>assert.ok(p[k]!=null,k)));
  assert.deepEqual(e.provenances.map(p=>p.page).sort(),[1,2])});

console.log('Mises à jour');
t('15. suppression d’une fiche : le calendrier suit (chevauchement levé, dates de l’autre fiche intactes)',()=>{const m=load(),{A,B}=casReel(m);
  m.st.ficheSupprimer(A.id);assert.equal(m.C.entree(m.st,'2026-11-03').etat,'prévu');assert.equal(m.C.entree(m.st,'2026-10-12').etat,'aucun');
  assert.equal(m.C.mois(m.st,'2026-11').resume.prevus,29);m.st.ficheSupprimer(B.id);assert.equal(m.C.fiches(m.st).length,0)});
t('16. validation OCR puis correction de la fiche : le calendrier suit',async()=>{const m=load(),{rec}=await ocrValide(m);
  const f=m.C.fiches(m.st);assert.equal(f.length,1);assert.equal(m.C.entree(m.st,'2026-11-02').libelle,'Samu');assert.equal(m.C.entree(m.st,'2026-11-02').provenances[0].importId,rec.id);
  const p=m.P.corriger(m.st.lire(f[0].id),{date:'2026-11-02',champ:'libelle',valeur:'Repos'});m.st.enregistrer(p);
  const e=m.C.entree(m.st,'2026-11-02');assert.equal(e.libelle,'Repos');assert.equal(e.valeurs[0].saisie,'corrigée sur la fiche')});
t('17. aucune donnée non validée n’apparaît comme prévue (planning 2 d’un PDF non validé)',async()=>{const m=load();const {a,rec}=await ocrDeuxPages(m);
  m.V.valider(a,{store:m.st,record:rec,tables:[0]});assert.equal(m.C.entree(m.st,'2026-11-10').etat,'prévu');
  assert.equal(m.C.entree(m.st,'2026-12-10').etat,'aucun','le tableau de décembre n’est pas validé')});
t('18. aucune donnée de collègue dans le calendrier',async()=>{const m=load();await ocrValide(m);const j=JSON.stringify([...m.C.index(m.st).values()])+JSON.stringify(m.C.mois(m.st,'2026-11'));
  assert.ok(!/DUPONT|MARTIN|LEROY|GARNIER|Alice|Paul|Inès|Hugo/.test(j));assert.ok(/ROTH Mickael/.test(j))});
t('23. sauvegarde puis restauration : le calendrier prévisionnel est identique',()=>{const m=load();casReel(m);const avant=JSON.stringify(m.C.mois(m.st,'2026-11').semaines.flat().map(c=>[c.date,c.entree.etat,c.entree.libelle]));
  const dump=JSON.parse(JSON.stringify(m.st.exporter())),n=load();n.st.importer(dump);
  assert.equal(JSON.stringify(n.C.mois(n.st,'2026-11').semaines.flat().map(c=>[c.date,c.entree.etat,c.entree.libelle])),avant)});
t('date sans valeur prévue : « aucun » (jamais « non travaillé ») ; mois initial = aujourd’hui s’il contient du prévu, sinon le prochain',()=>{const m=load();casReel(m);
  const e=m.C.entree(m.st,'2026-09-01');assert.deepEqual([e.etat,e.valeurs.length,e.libelle],['aucun',0,null]);
  assert.equal(m.C.moisInitial(m.st,'2026-10-09'),'2026-10');assert.equal(m.C.moisInitial(m.st,'2026-08-01'),'2026-10');assert.equal(m.C.moisInitial(m.st,'2027-03-01'),'2026-12')});

/* ---- parcours OCR simulés (noms inventés) ---- */
const NOMS=['DUPONT Alice','MARTIN Paul','ROTH Mickael','LEROY Inès'];const CYCLE=['Jour 7h','Repos','Samu','Condo\nm','Jour 7h','Jour 7h','Repos'];
function imp(m,sha,fmt){const rec=m.P.creerImport({sourceType:'fichier',format:fmt||'jpeg',sha256:sha,localRef:'android:'+sha+(fmt==='pdf'?'.pdf':'.jpg'),size:1000,originalFileName:'p.'+(fmt==='pdf'?'pdf':'jpg'),importedAt:NOW});m.st.importEnregistrer(rec);return rec}
function planningSynth(debut,n){const cols=S.semaine(debut,n),tf=k=>k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4);
  return S.generer({W:1400,tables:[{titre:'Planning du '+tf(cols[0])+' au '+tf(cols[n-1]),colonnes:cols,lignes:NOMS.map((nom,i)=>({nom,cellules:cols.map((_,j)=>CYCLE[(i+j)%CYCLE.length])}))}]})}
async function ocrNonValide(m){const sc=planningSynth('2026-11-02',31),rec=imp(m,SHA_A);const a=await m.A.analyser({image:sc.image,sourceSha256:SHA_A,ocr:S.ocrSimule(sc.zones),nomRef:'ROTH Mickael',maintenant:NOW});
  assert.equal(a.status,'à_valider');m.st.analyseEnregistrer(rec.id,m.A.serialiser(a));return {a,rec}}
async function ocrValide(m){const sc=planningSynth('2026-11-02',31),rec=imp(m,SHA_A);let a=await m.A.analyser({image:sc.image,sourceSha256:SHA_A,ocr:S.ocrSimule(sc.zones),nomRef:'ROTH Mickael',maintenant:NOW});
  a.cells.forEach((c,i)=>{if(c.status!=='interprété')a=m.V.confirmer(a,i)});m.V.valider(a,{store:m.st,record:rec});return {a,rec}}
async function ocrDeuxPages(m){const s1=planningSynth('2026-11-02',14),s2=planningSynth('2026-12-01',14),o1=S.ocrSimule(s1.zones),o2=S.ocrSimule(s2.zones),rec=imp(m,SHA_B,'pdf');
  let a=await m.A.analyser({pages:[{image:s1.image,page:1},{image:s2.image,page:2}],sourceSha256:SHA_B,ocr:{lire:(i,r,mo)=>(i===s1.image?o1:o2).lire(i,r,mo)},nomRef:'ROTH Mickael',maintenant:NOW});
  a.cells.forEach((c,i)=>{if(c.status!=='interprété')a=m.V.confirmer(a,i)});return {a,rec}}

console.log('Séparation Prévu / Réel');
const MODS=['app-v37-periode.js','app-legal.js','app-evidence.js','app-v371-nuit.js','app-v37-control.js','app-v37-romi-reconciliation.js','app-v37-compteur.js','app-v37-assistant-paie.js','app-v37-dossier.js'];
async function snapshot(avec){
  const st=fakeStorage(),win={localStorage:st,crypto:globalThis.crypto};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{},setAttribute(){},appendChild(){}}),body:{appendChild(){}},head:{appendChild(){}}},
    localStorage:st,CustomEvent:function(){},crypto:globalThis.crypto,TextEncoder,TextDecoder,URL,Uint8Array,Uint8ClampedArray,Uint32Array,Float32Array,Float64Array,ArrayBuffer,console:{...console,info(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SC,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(R1.s)+'};DB.days='+JSON.stringify({...R1.days,...R2.days})+';DB.per={start:"2026-08-24",nb:2};'+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,Q:mhQuatorzaine};',ctx);
  MODS.forEach(f=>vm.runInContext(fs.readFileSync(path.join(SC,f),'utf8'),ctx,{filename:f}));
  win.MH_ROMI={list:()=>[{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}]};
  if(win.MHAssistantPaie&&win.MHAssistantPaie.setRender)win.MHAssistantPaie.setRender(()=>{});
  const X=ctx.__x,avant=JSON.stringify(X.DB.days);
  if(avec){PL.forEach(f=>vm.runInContext(SRC[f],ctx,{filename:f}));const m={P:win.MHPlanning,C:win.MHPrevuCalendrier,st:win.MHPlanning.store()};
    /* plannings prévus sur des dates déjà présentes dans les journées réelles (août-septembre 2026), avec chevauchement et conflit */
    fiche(m,{debut:'2026-08-24',labels:Array(28).fill('Jour 7h'),sha:SHA_A});fiche(m,{debut:'2026-09-14',labels:Array(28).fill('Repos'),sha:SHA_B});
    ['2026-08','2026-09','2026-10'].forEach(ym=>m.C.mois(m.st,ym));m.C.periode(m.st,'2026-08-24','2026-10-11');
    assert.equal(m.C.entree(m.st,'2026-09-15').etat,'conflit');assert.equal(JSON.stringify(X.DB.days),avant,'DB.days inchangé')}
  const days=Object.keys(X.DB.days).sort();
  return {snap:JSON.stringify({cd:days.map(k=>{const r=X.cd(k);return [k,r.amp,r.tte,r.pz,r.nuit,r.idaj,r.ir,r.iru,r.al]}),
    per:['2026-08-24','2026-09-21'].map(s=>{const R=X.calcPer(s,2);return {G:R.G,Q:R.Q,B:X.brutOf(R.G)}}),q:['2026-08-24','2026-11-23'].map(k=>X.Q.payPeriod(k)),
    smart:win.MHControl.analyze({end:'2026-10-08'}),romi:win.MHRomiRecon.analyze({start:'2026-08-24',end:'2026-09-20'}),
    paie:(({score,compte,verdict,checks})=>({score,compte,verdict,checks}))(win.MHAssistantPaie.data({today:'2026-10-08',start:'2026-08-24'})),
    compteur:win.MHCompteur.data({today:'2026-10-08',start:'2026-08-24'}),nuit:win.MHNuit.annee('2026',{today:'2026-10-08'}),db:X.DB}),keys:[...st.map.keys()]};
}
t('19-20. plannings prévus sur des jours réels, chevauchement et conflit : DB.days, cd(), TTE, HS, amplitude, nuit, paniers, IDAJ, CP, Paie, quatorzaine, Smart Control, ROMI1, Compteur identiques',async()=>{
  const a=await snapshot(false),b=await snapshot(true);assert.equal(b.snap,a.snap);assert.deepEqual(b.keys,['mh_planning_v372'],'seule la clé Planning est écrite')});
t('modules : calendrier et onglet sans accès à DB, cd(), calcPer, save() ; app-core.js identique au tag v37.1.1',()=>{
  ['app-v372-planning-calendrier.js','app-v372-planning-ui.js'].forEach(f=>{const c=fs.readFileSync(path.join(SC,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    assert.ok(!/\bDB\b|\bcd\(|calcPer|brutOf|\bsave\(|mesheures_v3|eval\(|new Function/.test(c),f)});
  let old=null;try{old=cp.execSync('git show aa4f9b2:app/src/main/assets/web/scripts/app-core.js',{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26})}catch(e){}
  if(old!=null)assert.equal(fs.readFileSync(path.join(SC,'app-core.js'),'utf8'),old)});
const idx=fs.readFileSync(path.join(WEB,'index.html'),'utf8'),sw=fs.readFileSync(path.join(WEB,'sw.js'),'utf8'),ui=fs.readFileSync(path.join(SC,'app-v372-planning-ui.js'),'utf8');
t('intégration : calendrier chargé après le cœur et avant l’onglet, en cache ; sous-onglets 📅 Planning | 🔎 OCR / Validation',()=>{
  const pos=f=>idx.indexOf('scripts/'+f+'?v=');assert.ok(pos('app-v372-planning-calendrier.js')>pos('app-v372-planning.js'));assert.ok(pos('app-v372-planning-calendrier.js')<pos('app-v372-planning-ui.js'));
  assert.ok(sw.includes("'./scripts/app-v372-planning-calendrier.js?v="));assert.ok(ui.includes('📅 Planning')&&ui.includes('🔎 OCR / Validation'))});
t('page réelle : sous-onglets « Calendrier | Journées » (libellé seulement, même fonction)',()=>{
  assert.ok(idx.includes(`<button id="mModePlan" onclick="setMonthMode('planning')">☰ Journées</button>`));assert.ok(idx.includes(`<button id="mModeCal" class="on" onclick="setMonthMode('calendar')">▦ Calendrier</button>`))});

(async()=>{for(const [n,f] of tests){try{await f();console.log('  ok  '+n)}catch(e){fails++;console.log('FAIL  '+n+'\n      '+(e&&e.message))}}
  console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.2.0-D (calendrier prévisionnel) passent.');process.exit(fails?1:0)})();
