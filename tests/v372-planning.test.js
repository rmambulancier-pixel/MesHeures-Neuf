#!/usr/bin/env node
/*
 * V37.2.0-A — Planning prévu : cœur du module (logique pure). Tests Node, AVANT toute intégration dans l'application.
 * Lancer : node tests/v372-planning.test.js
 * Fixture : fixtures/planning-collectif-synthetique.json (17 lignes ; collègues aux noms inventés ;
 * ligne « ROTH Mickael » transcrite à la main depuis la photo du planning du 02/11 au 02/12/2026).
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web/scripts');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const PC=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/planning-collectif-synthetique.json'),'utf8'));
const SRC=fs.readFileSync(path.join(WEB,'app-v372-planning.js'),'utf8');
let fails=0;const tests=[];
function t(name,fn){tests.push([name,fn])}
const clone=o=>JSON.parse(JSON.stringify(o));
function fakeStorage(){const m=new Map(),w=[];return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{w.push(k);m.set(k,String(v))},removeItem:k=>{w.push(k);m.delete(k)},writes:w,map:m}}
/* Charge le module seul (sans moteur) */
function loadP(){const ctx={window:{},console,crypto:globalThis.crypto,TextEncoder,Date,Math,JSON,Object,Array,Map,Number,String,RegExp,Set,Error,Promise};ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(SRC,ctx,{filename:'app-v372-planning.js'});return ctx.window.MHPlanning}
const P=loadP();
/* Grille collective au format attendu de l'analyse d'image (lot C) : noms + cellules par ligne, avec confiance OCR */
const grille={noms:PC.lignes.map((l,i)=>({ligne:i,texte:l.nom,conf:88})),cellules:PC.lignes.map(l=>l.cellules.map(x=>({texte:x,conf:90})))};
const LROTH=PC.lignes.findIndex(l=>l.nom==='ROTH Mickael');
const SHA='a'.repeat(64);
const base=(extra)=>Object.assign({importeLe:'2026-10-08T21:00:00.000Z',source:{nom:'planning.jpg',mime:'image/jpeg',taille:123456,sha256:SHA},
  periode:{debut:'2026-11-02',fin:'2026-12-02',origine:'ocr'},salarie:{nom:'ROTH Mickael',ligne:LROTH,confirme:true},ligne:P.extraireLigne(grille,LROTH),
  ocr:{moteur:'tesseract.js fra',statut:'complet',titre:PC.titre}},extra||{});

console.log('Dictionnaire des libellés');
t('Jour 7h → JOUR, durée 7h00 lue dans le libellé, sans horaires inventés',()=>{const i=P.interpreter('Jour 7h');assert.deepEqual([i.type,i.dureeMin,i.horaires,i.correspondance],['JOUR',420,null,'exacte'])});
t('Jour 8h / Jour 7h30 : la durée suit le libellé',()=>{assert.equal(P.interpreter('Jour 8h').dureeMin,480);assert.equal(P.interpreter('jour 7h30').dureeMin,450)});
t('Repos → REPOS, sans durée',()=>{const i=P.interpreter('Repos');assert.deepEqual([i.type,i.dureeMin],['REPOS',null])});
t('Samu → garde SAMU 08:00 → 20:00 (amplitude 12h00), temps de travail effectif NON déduit',()=>{const i=P.interpreter('Samu');
  assert.deepEqual([i.type,i.horaires,i.amplitudeMin,i.dureeMin,i.applicable],['GARDE_SAMU',{debut:'08:00',fin:'20:00'},720,null,true])});
t('« Condo m » (sur deux lignes), « Condom », « Condo » → garde commerciale 08:00 → 20:00',()=>{['Condo\nm','Condom','CONDO M','Condo'].forEach(x=>{const i=P.interpreter(x);
  assert.deepEqual([i.type,i.horaires,i.amplitudeMin],['GARDE_COMMERCIALE',{debut:'08:00',fin:'20:00'},720],x)})});
t('« Congés 35 » → CONGES_35H (contrat 35 h), jamais une durée ni un CP automatique',()=>{const i=P.interpreter('Congés\n35');assert.deepEqual([i.type,i.dureeMin,i.applicable],['CONGES_35H',null,true]);assert.ok(/Jamais converti/.test(i.note))});
t('« Récup 39h » → ne concerne pas le salarié (applicable = false), pas de durée « 39h »',()=>{const i=P.interpreter('Récup\n39h');assert.deepEqual([i.type,i.applicable,i.dureeMin],['RECUP_39H',false,null])});
t('Matin / Après-midi → connus, sans horaires, déclarés non concernés',()=>{['Matin','Après\nMidi','apres-midi'].forEach(x=>{const i=P.interpreter(x);assert.equal(i.applicable,false,x);assert.equal(i.horaires,null,x);assert.equal(i.dureeMin,null,x)})});
t('Jour Férié, Formation',()=>{assert.equal(P.interpreter('Jour\nFérié').type,'FERIE');assert.equal(P.interpreter('Formation').type,'FORMATION');assert.equal(P.interpreter('Formation').dureeMin,null)});
t('casse, accents, ponctuation et retours à la ligne tolérés',()=>{['REPOS','repos.','Rep os'.replace(' ',''),' Repos '].forEach(x=>assert.equal(P.interpreter(x).type,'REPOS',x));assert.equal(P.interpreter('APRES MIDI').type,'APRES_MIDI')});
t('bruit OCR léger : « Jour 7n », « Repas », « Samv » → correspondance approchée',()=>{
  [['Jour 7n','JOUR',420],['Repas','REPOS',null],['Samv','GARDE_SAMU',null]].forEach(([x,ty,d])=>{const i=P.interpreter(x);assert.equal(i.type,ty,x);assert.equal(i.correspondance,'approchée',x);assert.equal(i.dureeMin,d,x)})});
t('jamais de rapprochement qui change un chiffre : « Jour 8n » non interprété (pas Jour 7h) ; « Récup 35h » ≠ Récup 39h',()=>{
  const j=P.interpreter('Jour 8n');assert.deepEqual([j.type,j.dureeMin],['NON_INTERPRETE',null]);assert.equal(P.interpreter('Récup 35h').type,'NON_INTERPRETE')});

t('« Repos » exact inchangé : REPOS, correspondance exacte, sans variante ni tolérance',()=>{const i=P.interpreter('Repos');
  assert.deepEqual([i.type,i.correspondance,i.variante,i.tolerance,i.dureeMin],['REPOS','exacte',null,null,null])});
t('« Repas » → REPOS, correspondance approchée par la variante déclarée « repas » (pas par la tolérance générale)',()=>{
  ['Repas','REPAS','repas.'].forEach(x=>{const i=P.interpreter(x);assert.equal(i.type,'REPOS',x);assert.equal(i.correspondance,'approchée',x);assert.equal(i.variante,'repas',x);assert.equal(i.tolerance,'variante',x)});
  assert.equal(P.interpreter('Repas').type==='REPOS'&&P.interpreter('Repas').correspondance==='approchée',true)});
t('la variante ne s’applique qu’au mot entier « repas » : « Repas midi », « Repasse » non transformés en REPOS',()=>{
  ['Repas midi','Repasse'].forEach(x=>assert.equal(P.interpreter(x).type,'NON_INTERPRETE',x))});
t('chiffres stricts : « Jour 7n » → Jour 7h (tolérance générale) ; « Jour 8n » jamais Jour 7h ; « Jour 1h » reste Jour 1h',()=>{
  const a=P.interpreter('Jour 7n');assert.deepEqual([a.type,a.dureeMin,a.correspondance,a.tolerance],['JOUR',420,'approchée','generale']);
  const b=P.interpreter('Jour 8n');assert.notEqual(b.dureeMin,420);assert.equal(b.type,'NON_INTERPRETE');
  const c=P.interpreter('Jour 1h');assert.deepEqual([c.type,c.dureeMin,c.correspondance],['JOUR',60,'exacte'])});
t('« Jour 1h » sur une ligne majoritairement en Jour 7h → DUREE_INHABITUELLE ; « Repas » sur la ligne → REPOS sans anomalie',()=>{
  const g=clone(grille);g.cellules[LROTH][0].texte='Jour 1h';g.cellules[LROTH][3].texte='Repas';const p=P.creer(base({ligne:P.extraireLigne(g,LROTH)}));
  assert.ok(p.anomalies.some(a=>a.code==='DUREE_INHABITUELLE'&&a.date==='2026-11-02'));
  const r=p.interpretation.find(x=>x.date==='2026-11-05');assert.deepEqual([r.type,r.correspondance],['REPOS','approchée']);assert.equal(p.ocr.cellules[3].texte,'Repas','brut conservé');
  assert.ok(!p.anomalies.some(a=>a.date==='2026-11-05'))});

console.log('Libellé inconnu');
t('« Astreinte X » → NON_INTERPRETE, libellé brut conservé, aucune durée, aucun horaire',()=>{const i=P.interpreter('Astreinte X');
  assert.deepEqual([i.type,i.libelle,i.dureeMin,i.horaires,i.applicable],['NON_INTERPRETE','Astreinte X',null,null,null]);assert.ok(/aucune durée/.test(i.note))});
t('cellule vide → VIDE',()=>{assert.equal(P.interpreter('').type,'VIDE');assert.equal(P.interpreter('  ').type,'VIDE')});

console.log('Période et dates');
t('titre « Planning du 05/10/2026 au 04/11/2026 » → 05/10 → 04/11, 31 jours',()=>{const p=P.periodeDuTitre('Planning du 05/10/2026 au 04/11/2026');assert.deepEqual(p,{debut:'2026-10-05',fin:'2026-11-04'});
  assert.equal(P.datesPeriode(p.debut,p.fin).length,31)});
t('bruit OCR sur le titre (O pour 0, espaces autour des /)',()=>{assert.deepEqual(P.periodeDuTitre('Planning du O2/11/2026 au 02 / 12 / 2O26'),{debut:'2026-11-02',fin:'2026-12-02'})});
t('titre invalide : date impossible, fin avant début, période > 62 jours, texte absent → null',()=>{
  ['Planning du 31/02/2026 au 04/03/2026','Planning du 05/10/2026 au 04/09/2026','Planning du 01/01/2026 au 31/12/2026','Edité le 06/10/2026',''].forEach(x=>assert.equal(P.periodeDuTitre(x),null,x))});
t('en-têtes : « L 02/11 » → 2026-11-02, lettre du jour contrôlée ; passage d’année (31/12 → 01/01)',()=>{
  const per={debut:'2026-11-02',fin:'2026-12-02'};assert.deepEqual(P.dateEntete('L 02/11',per),{date:'2026-11-02',lettre:'L',lettreOk:true});
  assert.equal(P.dateEntete('M 02/11',per).lettreOk,false);
  const y={debut:'2026-12-15',fin:'2027-01-14'};assert.equal(P.dateEntete('J 31/12',y).date,'2026-12-31');assert.equal(P.dateEntete('V 01/01',y).date,'2027-01-01');assert.equal(P.dateEntete('V 01/01',y).lettreOk,true)});
t('colonnes : 31 en-têtes conformes → OK ; colonne perdue (cas réel du 05/10) → anomalies',()=>{
  const per={debut:'2026-11-02',fin:'2026-12-02'};assert.equal(P.verifierColonnes(PC.entetes,per).ok,true);
  const v=P.verifierColonnes(PC.entetes.slice(1),per);assert.equal(v.ok,false);assert.ok(v.anomalies.some(a=>a.code==='COLONNES'));assert.ok(v.anomalies.some(a=>a.code==='ENTETE_DECALEE'))});

console.log('Salarié (planning collectif)');
t('17 lignes ; noms lus, « ROTH Mickael » présélectionné (score 1), confirmation toujours requise',()=>{
  const c=P.candidats(grille.noms,'ROTH Mickael');assert.equal(c.candidats.length,17);assert.equal(c.preselection,LROTH);assert.equal(c.confirmationRequise,true)});
t('OCR bruité « ROTH Mickae) » (cas réel) → présélection possible ; « ROTH Micican! » → aucune présélection',()=>{
  const n=clone(grille.noms);n[LROTH].texte='ROTH Mickae)';assert.equal(P.candidats(n,'ROTH Mickael').preselection,LROTH);
  n[LROTH].texte='ROTH Micican!';assert.equal(P.candidats(n,'ROTH Mickael').preselection,null)});
t('homonyme exact sur deux lignes → aucune présélection ; sans nom de référence → aucune présélection',()=>{
  const n=clone(grille.noms);n[0].texte='ROTH Mickael';assert.equal(P.candidats(n,'ROTH Mickael').preselection,null);assert.equal(P.candidats(grille.noms,'').preselection,null)});
t('création refusée sans confirmation explicite du salarié',()=>{
  assert.throws(()=>P.creer(base({salarie:{nom:'ROTH Mickael',ligne:LROTH}})),/non confirmé/);assert.throws(()=>P.creer(base({salarie:{nom:'ROTH Mickael',ligne:LROTH,confirme:'oui'}})),/non confirmé/)});
t('extraction d’une ligne : uniquement la ligne choisie (31 cellules), ligne absente → erreur',()=>{
  const l=P.extraireLigne(grille,LROTH);assert.equal(l.cellules.length,31);assert.equal(l.nomLu,'ROTH Mickael');assert.equal(l.cellules[5].texte,'Condo\nm');
  assert.throws(()=>P.extraireLigne(grille,40),/absente/)});
t('confidentialité : le planning enregistré ne contient AUCUN nom ni libellé propre aux collègues',()=>{
  const j=JSON.stringify(P.creer(base()));PC.lignes.filter((l,i)=>i!==LROTH).forEach(l=>assert.ok(!j.includes(l.nom.split(' ')[0]),l.nom));
  ['Astreinte','Récup','Samu','Congés','Formation'].forEach(x=>assert.ok(!j.includes(x),x+' (absent de la ligne de ROTH)'))});

console.log('Planning de la ligne ROTH (02/11 → 02/12/2026)');
const PL=P.creer(base());
t('31 journées interprétées, dates du 02/11 au 02/12, nature « prévisionnel », statut brouillon',()=>{
  assert.equal(PL.interpretation.length,31);assert.equal(PL.interpretation[0].date,'2026-11-02');assert.equal(PL.interpretation[30].date,'2026-12-02');
  assert.equal(PL.nature,'prévisionnel');assert.equal(PL.statut,'brouillon');assert.equal(PL.salarie.choix,'utilisateur')});
t('répartition : 11 Jour 7h, 12 Repos, 4 Condo m, 1 férié, 2 Matin, 1 Après-midi',()=>{const n={};PL.interpretation.forEach(x=>{n[x.type]=(n[x.type]||0)+1});
  assert.deepEqual(n,{JOUR:11,REPOS:12,GARDE_COMMERCIALE:4,FERIE:1,MATIN:2,APRES_MIDI:1})});
t('durée prévue : 11 × 7h00 = 77h00 pour les journées « Jour 7h » ; gardes : amplitude 8h00 → 20h00 sans durée de travail',()=>{
  assert.equal(PL.interpretation.filter(x=>x.type==='JOUR').reduce((s,x)=>s+x.dureeMin,0),77*60);
  PL.interpretation.filter(x=>x.type==='GARDE_COMMERCIALE').forEach(x=>{assert.equal(x.dureeMin,null);assert.equal(x.amplitudeMin,720)})});
t('anomalies : Matin (23/11, 26/11) et Après-midi (25/11) signalés « à vérifier », rien d’autre',()=>{
  assert.deepEqual(PL.anomalies.map(a=>a.code+' '+a.date),['NON_APPLICABLE 2026-11-23','NON_APPLICABLE 2026-11-25','NON_APPLICABLE 2026-11-26'])});
t('OCR brut et interprétation séparés ; confiance = OCR × correspondance',()=>{assert.equal(PL.ocr.cellules[5].texte,'Condo\nm');assert.equal(PL.interpretation[5].libelle,'Condo m');assert.equal(PL.interpretation[0].confiance,0.9)});
t('« Jour 1h » lu au milieu de « Jour 7h » → anomalie DUREE_INHABITUELLE (possible 7 lu 1)',()=>{
  const g=clone(grille);g.cellules[LROTH][0].texte='Jour 1h';const p=P.creer(base({ligne:P.extraireLigne(g,LROTH)}));assert.ok(p.anomalies.some(a=>a.code==='DUREE_INHABITUELLE'&&a.date==='2026-11-02'))});
t('libellé inconnu et faible confiance OCR signalés',()=>{const g=clone(grille);g.cellules[LROTH][1]={texte:'Astreinte X',conf:90};g.cellules[LROTH][2]={texte:'Repos',conf:30};
  const p=P.creer(base({ligne:P.extraireLigne(g,LROTH)}));assert.ok(p.anomalies.some(a=>a.code==='NON_INTERPRETE'&&a.date==='2026-11-03'));assert.ok(p.anomalies.some(a=>a.code==='CONFIANCE_FAIBLE'&&a.date==='2026-11-04'))});
t('colonne manquante (30 cellules pour 31 jours) → anomalie COLONNES',()=>{const g=clone(grille);g.cellules[LROTH]=g.cellules[LROTH].slice(1);
  assert.ok(P.creer(base({ligne:P.extraireLigne(g,LROTH)})).anomalies.some(a=>a.code==='COLONNES'))});
t('création refusée : période invalide, empreinte manquante',()=>{assert.throws(()=>P.creer(base({periode:{debut:'2026-11-02',fin:'2026-10-02'}})),/Période invalide/);
  assert.throws(()=>P.creer(base({source:{nom:'x'}})),/SHA-256/)});

console.log('Corrections manuelles');
t('correction du libellé : réinterprétation, origine « manuel », journal, OCR brut intact, original non modifié',()=>{
  const avant=clone(PL),c=P.corriger(PL,{date:'2026-11-23',champ:'libelle',valeur:'Jour 7h',le:'2026-10-08T21:10:00Z'});
  const x=c.interpretation.find(i=>i.date==='2026-11-23');assert.deepEqual([x.type,x.dureeMin,x.origine,x.confiance],['JOUR',420,'manuel',1]);
  assert.deepEqual(c.corrections,[{date:'2026-11-23',champ:'libelle',avant:'Matin',apres:'Jour 7h',le:'2026-10-08T21:10:00Z'}]);
  assert.deepEqual(c.ocr,PL.ocr);assert.deepEqual(PL,avant);assert.ok(!c.anomalies.some(a=>a.date==='2026-11-23'))});
t('correction du type, de la durée, de la date et du salarié ; refus des valeurs invalides',()=>{
  let c=P.corriger(PL,{date:'2026-11-07',champ:'type',valeur:'GARDE_SAMU'});assert.equal(c.interpretation[5].type,'GARDE_SAMU');
  c=P.corriger(c,{date:'2026-11-07',champ:'dureeMin',valeur:600});assert.equal(c.interpretation[5].dureeMin,600);
  assert.throws(()=>P.corriger(c,{date:'2026-11-07',champ:'dureeMin',valeur:2000}),/Durée invalide/);
  assert.throws(()=>P.corriger(c,{date:'2026-11-07',champ:'date',valeur:'2026-11-08'}),/existe déjà/);
  assert.throws(()=>P.corriger(c,{date:'2026-11-07',champ:'date',valeur:'2026-12-25'}),/hors période/);
  assert.throws(()=>P.corriger(c,{date:'2026-11-07',champ:'heure',valeur:1}),/inconnu/);
  c=P.corriger(c,{champ:'salarie',valeur:'ROTH Mickaël'});assert.equal(c.salarie.nom,'ROTH Mickaël');assert.equal(c.corrections.length,3)});

console.log('Empreinte SHA-256');
t('vecteur connu : SHA-256("abc")',async()=>{assert.equal(await P.sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')});
t('octets binaires (4 Ko synthétiques) : empreinte stable, 64 hex, différente si un octet change',async()=>{
  const b=new Uint8Array(4096).map((_,i)=>(i*31)&255),h1=await P.sha256(b),h2=await P.sha256(b);b[100]^=1;const h3=await P.sha256(b);
  assert.ok(/^[0-9a-f]{64}$/.test(h1));assert.equal(h1,h2);assert.notEqual(h1,h3)});

console.log('Stockage, doublon, chevauchement, sauvegarde');
t('enregistrer : clé séparée « mh_planning_v372 », statut « enregistre », relecture identique',()=>{
  const S=fakeStorage(),st=P.store(S),p=st.enregistrer(PL);assert.deepEqual(S.writes,['mh_planning_v372']);assert.equal(p.statut,'enregistre');
  assert.deepEqual(st.lire(p.id).interpretation,PL.interpretation);assert.equal(st.liste().length,1);assert.equal(st.parEmpreinte(SHA).id,p.id)});
t('doublon : même source, même ligne, même période → refusé ; même photo, autre tableau (autre période) → accepté',()=>{
  const S=fakeStorage(),st=P.store(S);st.enregistrer(PL);assert.throws(()=>st.enregistrer(clone(PL)),/Doublon/);
  const g2=clone(grille);const p2=P.creer(base({periode:{debut:'2026-10-05',fin:'2026-11-04'},ligne:P.extraireLigne(g2,LROTH)}));assert.equal(st.enregistrer(p2).statut,'enregistre');assert.equal(st.liste().length,2)});
t('chevauchement : 05/10 → 04/11 et 02/11 → 02/12 partagent 02, 03 et 04/11, signalés sans arbitrage',()=>{
  const S=fakeStorage(),st=P.store(S);const a=st.enregistrer(PL);
  const p2=P.creer(base({source:{nom:'autre.jpg',mime:'image/jpeg',taille:1,sha256:'b'.repeat(64)},periode:{debut:'2026-10-05',fin:'2026-11-04'}}));
  const ch=st.chevauchements(p2);assert.deepEqual(ch.map(x=>x.date),['2026-11-02','2026-11-03','2026-11-04']);assert.ok(ch.every(x=>x.autre===a.id));
  assert.equal(st.liste().length,1,'rien d’écrit par le contrôle')});
t('prévu(date) : lecture seule des plannings enregistrés ; un brouillon n’est jamais lu',()=>{
  const S=fakeStorage(),st=P.store(S);assert.deepEqual(st.prevu('2026-11-02'),[]);st.enregistrer(PL);const w=S.writes.length;
  assert.deepEqual(st.prevu('2026-11-07').map(x=>[x.type,x.libelle,x.dureeMin]),[['GARDE_COMMERCIALE','Condo m',null]]);assert.deepEqual(st.prevu('2027-01-01'),[]);assert.equal(S.writes.length,w)});
t('sauvegarde : planning sans photo (aucune donnée d’image), restauration validée, original « à vérifier »',()=>{
  const S=fakeStorage(),st=P.store(S);assert.equal(st.exporter(),null);st.enregistrer(PL);const e=st.exporter(),j=JSON.stringify(e);
  assert.ok(!/data:image|base64/i.test(j));assert.deepEqual(Object.keys(e.plannings[Object.keys(e.plannings)[0]].source).sort(),['mime','nom','original','sha256','taille']);
  const S2=fakeStorage(),st2=P.store(S2);assert.equal(st2.importer(e),1);assert.equal(st2.liste()[0].source.original,'a_verifier');assert.equal(st2.importer(null),null);
  assert.throws(()=>st2.valider({plannings:{x:{periode:{debut:'nope'}}}}),/invalide/)});
t('suppression : seulement le planning visé',()=>{const S=fakeStorage(),st=P.store(S);const a=st.enregistrer(PL);assert.equal(st.supprimer('inconnu'),false);assert.equal(st.supprimer(a.id),true);assert.equal(st.liste().length,0)});

console.log('Non-régression du moteur (module chargé, plannings enregistrés)');
function loadEngine(withPlanning){
  const S=fakeStorage(),win={localStorage:S};   /* comme dans l'application : window.localStorage */
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){}},localStorage:S,CustomEvent:function(){},crypto:globalThis.crypto,TextEncoder,
    console:{...console,info(){},warn(){}},setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(R1.s)+'};DB.days='+JSON.stringify({...R1.days,...R2.days})+';DB.per={start:"2026-08-24",nb:2};'+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F,Q:mhQuatorzaine};',ctx);
  if(withPlanning){vm.runInContext(SRC,ctx,{filename:'app-v372-planning.js'});const M=win.MHPlanning,st=M.store();st.enregistrer(M.creer(Object.assign(base(),{ligne:M.extraireLigne(grille,LROTH)})))}
  const X=ctx.__x,days=Object.keys(X.DB.days).sort();
  const snap={cd:days.map(k=>{const r=X.cd(k);return [k,r.amp,r.tte,r.pz,r.nuit,r.idaj,r.ir,r.iru,r.deb,r.fin,JSON.stringify(r.al)]}),
    per:['2026-08-24','2026-09-21'].map(s=>{const R=X.calcPer(s,2);return JSON.stringify({G:R.G,Q:R.Q,B:X.brutOf(R.G)})}),
    q:['2026-08-24','2026-10-08','2026-11-23'].map(k=>JSON.stringify(X.Q.payPeriod(k))),db:JSON.stringify(X.DB)};
  return {snap,S,X};
}
t('cd() de toutes les journées, TTE, HS25, HS50, amplitude, CP, IDAJ, repas, brut et quatorzaines identiques avec et sans le module',()=>{
  const a=loadEngine(false),b=loadEngine(true);assert.deepEqual(b.snap,a.snap);
  assert.deepEqual([...b.S.map.keys()],['mh_planning_v372'],'seule la clé du module est écrite');
  const R=b.X.calcPer('2026-08-24',2);assert.deepEqual([b.X.F(R.G.tte),b.X.F(R.G.amp),b.X.F(R.Q[0].h25),b.X.F(R.Q[0].h50),b.X.F(R.Q[1].h25),b.X.F(R.Q[1].h50),b.X.F(R.G.idaj),R.G.ir,R.G.iru],
    ['167h55','173h25','16h00','26h35','16h00','4h20','0h45',13,2])});
t('moteur : app-core.js strictement identique au tag v37.1.1 (aa4f9b2)',()=>{let old;try{old=cp.execSync('git show aa4f9b2:app/src/main/assets/web/scripts/app-core.js',{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26})}catch(e){old=null}
  if(old==null){console.log('      (aa4f9b2 absent : comparaison ignorée)');return}assert.equal(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8'),old)});
t('module sans accès au moteur ni aux journées : aucune référence à DB, cd(), calcPer, save(), ROMI',()=>{
  const code=SRC.replace(/\/\*[\s\S]*?\*\//g,'');assert.ok(!/\bDB\b|\bcd\(|calcPer|brutOf|\bsave\(|MH_ROMI|mesheures_v3/.test(code))});
t('intégré à l’application depuis V37.2.0-B : chargé une seule fois, après app-core.js, et dans le cache du service worker',()=>{const idx=fs.readFileSync(path.join(REPO,'app/src/main/assets/web/index.html'),'utf8'),sw=fs.readFileSync(path.join(REPO,'app/src/main/assets/web/sw.js'),'utf8');
  assert.equal((idx.match(/scripts\/app-v372-planning\.js\?v=/g)||[]).length,1);assert.ok(idx.indexOf('app-v372-planning.js')>idx.indexOf('app-core.js'));assert.ok(sw.includes("'./scripts/app-v372-planning.js?v="))});

(async()=>{for(const [name,fn] of tests){try{await fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+(e&&e.message))}}
  console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.2.0-A (planning prévu, cœur) passent.');process.exit(fails?1:0)})();
