#!/usr/bin/env node
/*
 * V37.3.0 — 📊 Comparaison Prévu ↔ Réel. Tests Node (matrice + absence d'effet sur le Réel).
 * Lancer : node tests/v373-comparaison.test.js
 * Réel : le vrai moteur (app-core.js) chargé avec les journées de référence (fixtures 24/08 → 18/10/2026).
 * Prévu : fiches validées créées comme par la validation C3 (cœur du lot A). Noms inventés, aucune photo réelle.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web'),SC=path.join(WEB,'scripts');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const PL=['app-v372-planning.js','app-v372-planning-calendrier.js','app-v373-reel-lecture.js','app-v373-comparaison.js'];
const MODS=['app-v37-periode.js','app-legal.js','app-evidence.js','app-v371-nuit.js','app-v37-control.js','app-v37-romi-reconciliation.js','app-v37-compteur.js','app-v37-assistant-paie.js','app-v37-dossier.js'];
let fails=0;const tests=[];const t=(n,f)=>tests.push([n,f]);
const SHA_S='5a'.repeat(32),SHA_X='7c'.repeat(32),SHA_A='a1'.repeat(32),SHA_Y='9e'.repeat(32),AUJ='2026-10-25';
function fakeStorage(){const m=new Map(),w=[];return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{w.push(k);m.set(k,String(v))},removeItem:k=>{m.delete(k)},map:m,writes:w}}
/* application réelle (moteur + modules V37) dans un contexte isolé, avec ou sans les modules Prévu / Comparaison */
function app(avecV373){
  const st=fakeStorage(),win={localStorage:st,crypto:globalThis.crypto};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{},setAttribute(){},appendChild(){}}),body:{appendChild(){}},head:{appendChild(){}}},
    localStorage:st,CustomEvent:function(){},crypto:globalThis.crypto,TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,console:{...console,info(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SC,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(R1.s)+'};DB.days='+JSON.stringify({...R1.days,...R2.days})+';DB.per={start:"2026-08-24",nb:2};'+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,Q:mhQuatorzaine};',ctx);
  MODS.forEach(f=>vm.runInContext(fs.readFileSync(path.join(SC,f),'utf8'),ctx,{filename:f}));
  win.MH_ROMI={list:()=>[{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}]};
  if(win.MHAssistantPaie&&win.MHAssistantPaie.setRender)win.MHAssistantPaie.setRender(()=>{});
  if(avecV373)PL.forEach(f=>vm.runInContext(fs.readFileSync(path.join(SC,f),'utf8'),ctx,{filename:f}));
  return {ctx,win,ls:st,X:ctx.__x,P:win.MHPlanning,C:win.MHPrevuCalendrier,R:win.MHReelLecture,K:win.MHComparaison,st:win.MHPlanning&&win.MHPlanning.store(st)};
}
const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
function fiche(m,o){const fin=addJ(o.debut,o.labels.length-1);
  const p=m.P.creer({importeLe:'2026-10-09T09:00:00Z',source:{nom:o.nom||'planning.pdf',mime:'application/pdf',taille:1000,sha256:o.sha},periode:{debut:o.debut,fin,origine:'ocr'},
    salarie:{nom:'ROTH Mickael',ligne:3,confirme:true},ligne:{ligne:3,nomLu:'ROTH Mickael',cellules:o.labels.map((x,i)=>({colonne:i,texte:x,conf:95}))},
    ocr:{moteur:'tesseract.js',statut:'complet'},origine:{importId:null,sourceSha256:o.sha,page:o.page==null?null:o.page,tableId:o.tableId||0,orientation:{exif:1,rotation180:false}}});
  return m.st.enregistrer(Object.assign(p,{id:'pl-'+o.sha.slice(0,12)+'-t'+(o.tableId||0)+'-'+o.debut}))}
/* Planning de septembre construit pour couvrir chaque cas face aux journées réelles des fixtures */
const S_LAB=['Jour 7h','Jour 7h','Congés 35','Repos','Samu','Formation','Repos','Repos','Samu','Jour Férié','Xyz','Matin','Jour 7h','Jour 7h'];   /* 07/09 → 20/09 */
const A_LAB='JJJJJRRJJJJJRRJJJJJRRJJJJJRRJJJ'.split('').map(x=>x==='J'?'Jour 7h':'Repos');                                                   /* 05/10 → 04/11 */
function scenario(m,opts){opts=opts||{};const out={};
  const f={S:()=>out.S=fiche(m,{debut:'2026-09-07',labels:S_LAB,sha:SHA_S,nom:'septembre.pdf',page:1}),
    X:()=>out.X=fiche(m,{debut:'2026-09-19',labels:['Repos','Jour 7h'],sha:SHA_X,nom:'rectificatif.jpg'}),
    A:()=>out.A=fiche(m,{debut:'2026-10-05',labels:A_LAB,sha:SHA_A,nom:'octobre.pdf',page:2,tableId:1})};
  (opts.ordre||['S','X','A']).forEach(k=>f[k]());return out}
const L=(R,d)=>R.lignes.find(l=>l.date===d);
const res=(R,d)=>(L(R,d)||{resultat:'(absente)'}).resultat;

console.log('Matrice de comparaison (moteur réel + fiches validées)');
t('1. prévu = réel : « Jour 7h » / travail réel → 🟢 conforme, écart TTE affiché sans changer le résultat',()=>{const m=app(true);scenario(m);const R=m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}),l=L(R,'2026-09-07');
  assert.equal(l.resultat,'conforme');const tte=m.X.cd('2026-09-07').tte;assert.equal(l.reel.tte,tte);assert.deepEqual(l.ecarts.find(e=>e.type==='duree'),{type:'duree',prevu:420,reel:tte,ecart:tte-420,texte:l.ecarts[0].texte});
  assert.equal(res(R,'2026-09-09'),'conforme','Congés 35 / CP');assert.equal(res(R,'2026-09-13'),'conforme','Repos / REPOS');
  const g=L(R,'2026-09-15');assert.equal(g.resultat,'conforme');assert.deepEqual(g.ecarts.filter(e=>e.type!=='duree').map(e=>[e.type,e.ecart]),[['debut',-100],['fin',-340]],'garde 08:00–20:00 / réel 06:20–14:20')});
t('2. prévu différent du réel : « Jour 7h » / CP, « Repos » / CP, « Samu » / CP, « Jour 7h » / REPOS → 🟠 différent',()=>{const m=app(true);scenario(m);const R=m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ});
  ['2026-09-08','2026-09-10','2026-09-11','2026-09-20'].forEach(d=>assert.equal(res(R,d),'different',d));assert.match(L(R,'2026-09-08').motif,/prévu : travail ; réel : congé/)});
t('3. prévu sans réel : passé → 🔵 prévu sans réel ; après aujourd’hui → 🔵 « à venir » (jamais « non travaillé »)',()=>{const m=app(true);scenario(m);const R=m.K.mois('2026-10',{store:m.st,aujourdhui:AUJ});
  const p=L(R,'2026-10-19'),f=L(R,'2026-10-26');assert.deepEqual([p.resultat,p.futur,p.reel],['prevu_sans_reel',false,null]);assert.deepEqual([f.resultat,f.futur],['prevu_sans_reel',true]);
  assert.match(p.motif,/ne veut pas dire qu’elle n’a pas été travaillée/);assert.match(f.motif,/à venir/);assert.equal(R.stats.prevusSansReel,7);assert.equal(R.stats.aVenir,6)});
t('4. réel sans prévu : travail réel prévu « Repos » → 🔴 réel non prévu ; travail réel sans aucun planning → 🔴 (compté à part)',()=>{const m=app(true);scenario(m);
  const S=m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}),A=m.K.mois('2026-08',{store:m.st,aujourdhui:AUJ});
  assert.equal(res(S,'2026-09-14'),'reel_non_prevu');assert.match(L(S,'2026-09-14').motif,/« Repos » était prévu/);
  assert.equal(res(A,'2026-08-24'),'reel_non_prevu');assert.equal(L(A,'2026-08-24').prevu.etat,'aucun');assert.equal(res(A,'2026-08-30'),'non_comparable','repos réel sans planning');
  assert.equal(A.stats.reelsSansPrevision,7);assert.equal(A.stats.comparables,0);assert.equal(A.stats.taux,null,'aucun taux sans jour comparable')});
t('5. deux prévisions identiques (20/09 : « Jour 7h » dans deux fichiers) : comparées une fois, deux provenances conservées',()=>{const m=app(true);scenario(m);const l=L(m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}),'2026-09-20');
  assert.equal(l.prevu.etat,'identique');assert.equal(l.resultat,'different');assert.deepEqual(l.prevu.valeurs.map(v=>v.provenance.source).sort(),['rectificatif.jpg','septembre.pdf'])});
t('6. deux prévisions différentes (19/09 : « Jour 7h » / « Repos ») → ⚠️ conflit, aucun gagnant, non compté au taux',()=>{const m=app(true);scenario(m);const R=m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}),l=L(R,'2026-09-19');
  assert.equal(l.resultat,'conflit');assert.equal(l.prevu.libelle,null);assert.deepEqual(l.prevu.valeurs.map(v=>v.libelle).sort(),['Jour 7h','Repos']);assert.equal(l.reel.t,'REPOS');assert.equal(R.stats.conflits,1)});
t('l’ordre d’enregistrement des fiches ne change aucun résultat',()=>{const a=app(true),b=app(true);scenario(a,{ordre:['S','X','A']});scenario(b,{ordre:['A','X','S']});
  ['2026-09','2026-10'].forEach(ym=>assert.equal(JSON.stringify(b.K.mois(ym,{store:b.st,aujourdhui:AUJ}).lignes.map(l=>[l.date,l.resultat,l.prevu.valeurs.map(v=>v.libelle).sort()])),
    JSON.stringify(a.K.mois(ym,{store:a.st,aujourdhui:AUJ}).lignes.map(l=>[l.date,l.resultat,l.prevu.valeurs.map(v=>v.libelle).sort()]))))});
t('7. ni prévision ni réel : date omise de la liste, comptée comme vide, aucun résultat inventé',()=>{const m=app(true);scenario(m);const R=m.K.mois('2026-12',{store:m.st,aujourdhui:AUJ});
  assert.equal(L(R,'2026-12-15'),undefined);assert.equal(R.vides,31);assert.deepEqual(R.lignes.map(l=>l.date),[]);const l=m.K.comparer('2026-12-15',m.C.entree(m.st,'2026-12-15'),null,AUJ);assert.deepEqual([l.resultat,l.motif],['non_comparable','ni prévu ni réel'])});
t('libellés non comparables : Formation, Jour férié, code inconnu, code non concerné → ℹ️ avec la raison',()=>{const m=app(true);scenario(m);const R=m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ});
  [['2026-09-12',/Formation/],['2026-09-16',/férié/],['2026-09-17',/non interprété/],['2026-09-18',/non concerné/]].forEach(([d,re])=>{assert.equal(res(R,d),'non_comparable',d);assert.match(L(R,d).motif,re)})});
t('natures réelles : NUIT = travail, RC et MAL ≠ repos (différents), type inconnu → ℹ️ ; horaires incomplets : écart non calculé',()=>{const m=app(true);scenario(m);
  const e={etat:'prévu',libelle:'Jour 7h',valeurs:[{libelle:'Jour 7h',type:'JOUR',dureeMin:420,horaires:null,applicable:true,provenance:{}}],provenances:[]},rep={etat:'prévu',libelle:'Repos',valeurs:[{libelle:'Repos',type:'REPOS',dureeMin:null,applicable:true,provenance:{}}],provenances:[]};
  const j=(t,c)=>({date:'2026-09-01',t,deb:'20:00',fin:'08:00',calcul:Object.assign({tte:660,amp:720,horairesIncomplets:false},c||{})});
  assert.equal(m.K.comparer('2026-09-01',e,j('NUIT'),AUJ).resultat,'conforme');assert.equal(m.K.comparer('2026-09-01',rep,j('RC'),AUJ).resultat,'different');
  assert.equal(m.K.comparer('2026-09-01',e,j('MAL'),AUJ).resultat,'different');assert.equal(m.K.comparer('2026-09-01',e,j('ZZZ'),AUJ).resultat,'non_comparable');
  const inc=m.K.comparer('2026-09-01',e,j('T',{horairesIncomplets:true}),AUJ);assert.equal(inc.resultat,'conforme');assert.match(inc.ecarts[0].texte,/incomplets/)});
t('8. correction d’une fiche prévisionnelle : la comparaison suit',()=>{const m=app(true),{S}=scenario(m);assert.equal(res(m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}),'2026-09-08'),'different');
  m.st.enregistrer(m.P.corriger(m.st.lire(S.id),{date:'2026-09-08',champ:'libelle',valeur:'Congés 35'}));assert.equal(res(m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}),'2026-09-08'),'conforme')});
t('9. suppression d’une fiche : le conflit du 19/09 disparaît, la date redevient comparable',()=>{const m=app(true),{X}=scenario(m);m.st.ficheSupprimer(X.id);
  const R=m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ});assert.equal(res(R,'2026-09-19'),'different');assert.equal(L(R,'2026-09-20').prevu.etat,'prévu');assert.equal(R.stats.conflits,0)});
t('10. changement de mois : septembre → octobre, chaque mois limité à ses dates',()=>{const m=app(true);scenario(m);const s=m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}),o=m.K.mois('2026-10',{store:m.st,aujourdhui:AUJ});
  assert.ok(s.lignes.every(l=>l.date.startsWith('2026-09'))&&o.lignes.every(l=>l.date.startsWith('2026-10')));assert.equal(s.lignes.length,30);assert.equal(o.lignes.length,31);
  assert.equal(res(o,'2026-10-05'),'conforme');assert.equal(res(o,'2026-10-08'),'different');assert.equal(res(o,'2026-10-10'),'conforme');assert.equal(res(o,'2026-10-12'),'different')});
t('11. changement d’année : décembre 2026 → janvier 2027',()=>{const m=app(true);fiche(m,{debut:'2026-12-20',labels:Array(31).fill('Jour 7h'),sha:SHA_Y});
  const d=m.K.mois('2026-12',{store:m.st,aujourdhui:AUJ}),j=m.K.mois('2027-01',{store:m.st,aujourdhui:AUJ});assert.equal(d.lignes.length,12);assert.equal(j.lignes.length,19);
  assert.ok(j.lignes.every(l=>l.resultat==='prevu_sans_reel'&&l.futur));assert.equal(j.stats.aVenir,19);assert.equal(j.stats.taux,null)});
t('12. sauvegarde puis restauration du Prévu : comparaison identique',()=>{const m=app(true);scenario(m);const avant=JSON.stringify(m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}));
  const dump=JSON.parse(JSON.stringify(m.st.exporter())),n=app(true);n.st.importer(dump);assert.equal(JSON.stringify(n.K.mois('2026-09',{store:n.st,aujourdhui:AUJ})),avant)});
t('16. plusieurs sources : chaque prévision garde fichier, page, tableau, période',()=>{const m=app(true);scenario(m);const l=L(m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}),'2026-09-19');
  l.prevu.valeurs.forEach(v=>['planningId','source','sha256','periode'].forEach(k=>assert.ok(v.provenance[k]!=null,k)));assert.deepEqual(l.prevu.valeurs.map(v=>v.provenance.page).sort(),[1,null].sort())});
t('statistiques : définitions et taux (conformes / comparables), sans dénominateur ambigu',()=>{const m=app(true);scenario(m);const s=m.K.mois('2026-09',{store:m.st,aujourdhui:AUJ}).stats;
  assert.deepEqual([s.conformes,s.differents,s.reelsNonPrevus,s.conflits,s.nonComparables,s.reelsSansPrevision],[4,4,1,1,7,13]);assert.equal(s.comparables,9);assert.equal(s.taux,44.4);
  /* 01-06/09 et 21-30/09 : hors de tout planning validé ; le travail y est « réel sans prévision », le repos « non comparable » ; ni l'un ni l'autre n'entre au taux */
  assert.equal(s.comparables,s.conformes+s.differents+s.reelsNonPrevus);assert.match(s.definitionTaux,/conformes \/ jours comparables/)});
t('17. aucune donnée de collègue dans la comparaison',()=>{const m=app(true);scenario(m);const j=JSON.stringify(['2026-08','2026-09','2026-10','2026-11'].map(ym=>m.K.mois(ym,{store:m.st,aujourdhui:AUJ})));
  assert.ok(!/DUPONT|MARTIN|LEROY|GARNIER|BEZIAT|GALLATO|BLANCHARD/.test(j));assert.ok(/ROTH Mickael/.test(JSON.stringify(m.C.index(m.st).get('2026-09-07'))))});

console.log('Aucun effet sur le Réel');
async function snapshot(avec){
  const m=app(avec),X=m.X,avant=JSON.stringify(X.DB.days),win=m.win;
  if(avec){scenario(m);['2026-08','2026-09','2026-10','2026-11','2026-12','2027-01'].forEach(ym=>m.K.mois(ym,{store:m.st,aujourdhui:AUJ}));
    /* tentative de modification d'une copie lue : sans effet sur le Réel */
    const j=m.R.jour('2026-09-07');try{j.t='REPOS'}catch(e){}try{j.calcul.tte=0}catch(e){}assert.equal(m.X.DB.days['2026-09-07'].t,'T');
    assert.equal(JSON.stringify(X.DB.days),avant,'DB.days inchangé')}
  const days=Object.keys(X.DB.days).sort();
  return {days:JSON.stringify(X.DB.days),snap:JSON.stringify({cd:days.map(k=>{const r=X.cd(k);return [k,r.amp,r.tte,r.pz,r.nuit,r.idaj,r.ir,r.iru,r.al]}),
    per:['2026-08-24','2026-09-21'].map(s=>{const R=X.calcPer(s,2);return {G:R.G,Q:R.Q,B:X.brutOf(R.G)}}),q:['2026-08-24','2026-11-23'].map(k=>X.Q.payPeriod(k)),
    smart:win.MHControl.analyze({end:'2026-10-08'}),romi:win.MHRomiRecon.analyze({start:'2026-08-24',end:'2026-09-20'}),
    paie:(({score,compte,verdict,checks})=>({score,compte,verdict,checks}))(win.MHAssistantPaie.data({today:'2026-10-08',start:'2026-08-24'})),
    compteur:win.MHCompteur.data({today:'2026-10-08',start:'2026-08-24'}),nuit:win.MHNuit.annee('2026',{today:'2026-10-08'})}),
    keys:[...m.ls.map.keys()],writes:m.ls.writes.filter(k=>k!=='mh_planning_v372')};
}
t('13. DB.days strictement identique (octet pour octet) après comparaison de 6 mois',async()=>{const a=await snapshot(false),b=await snapshot(true);assert.equal(b.days,a.days)});
t('14-15. TTE, HS25/50, amplitude, pauses, nuit, paniers, IDAJ, CP, Paie, quatorzaine, Smart Control, ROMI1, Compteur : identiques',async()=>{const a=await snapshot(false),b=await snapshot(true);
  assert.equal(b.snap,a.snap);assert.deepEqual(b.writes,[],'aucune écriture hors de la clé Planning prévu');assert.deepEqual(b.keys,['mh_planning_v372'])});
t('pont de lecture : copies figées, une date sans réel donne null (jamais « repos »)',()=>{const m=app(true);
  const j=m.R.jour('2026-09-07');assert.ok(Object.isFrozen(j)&&Object.isFrozen(j.calcul));assert.deepEqual([j.t,j.deb,j.fin],['T','08:00','18:00']);assert.equal(j.calcul.tte,m.X.cd('2026-09-07').tte);
  assert.equal(m.R.jour('2026-11-20'),null);assert.equal(m.R.jour('pas une date'),null);assert.deepEqual(m.R.dates('2026-10-15','2026-10-31'),['2026-10-15','2026-10-16','2026-10-17','2026-10-18'])});
t('code : la comparaison ne touche jamais au Réel (aucune écriture, aucun save, aucun calcul de paie) ; seul le pont lit DB',()=>{
  const nc=f=>fs.readFileSync(path.join(SC,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  const pont=nc('app-v373-reel-lecture.js');assert.ok(!/DB(\.\w+|\[[^\]]+\])*\s*(=(?!=)|\+=|-=)|delete\s+DB|\bsave\(|mhRefresh|calcPer|brutOf|localStorage|setItem/.test(pont),'pont en lecture seule');
  ['app-v373-comparaison.js','app-v373-comparaison-ui.js'].forEach(f=>{const c=nc(f);assert.ok(!/\bDB\b|\bcd\(|calcPer|brutOf|\bsave\(|mesheures_v3|localStorage|eval\(|new Function/.test(c),f)});
  ['app-v372-planning-ui.js','app-v372-planning-calendrier.js'].forEach(f=>assert.ok(!/\bDB\b|\bcd\(/.test(nc(f)),f))});
t('app-core.js identique au tag v37.2.0 et à v37.1.1',()=>{const cur=fs.readFileSync(path.join(SC,'app-core.js'),'utf8');
  for(const ref of ['v37.2.0','aa4f9b2']){let old=null;try{old=cp.execSync('git show '+ref+':app/src/main/assets/web/scripts/app-core.js',{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26})}catch(e){}if(old!=null)assert.equal(cur,old,ref)}});

console.log('Intégration');
const idx=fs.readFileSync(path.join(WEB,'index.html'),'utf8'),sw=fs.readFileSync(path.join(WEB,'sw.js'),'utf8'),ui=fs.readFileSync(path.join(SC,'app-v372-planning-ui.js'),'utf8');
t('scripts V37.3 chargés après le moteur et le calendrier prévu, avant l’onglet ; en cache',()=>{const pos=f=>idx.indexOf('scripts/'+f+'?v=');
  let prev=pos('app-v372-planning-calendrier.js');assert.ok(prev>pos('app-core.js'));
  ['app-v373-reel-lecture.js','app-v373-comparaison.js','app-v373-comparaison-ui.js'].forEach(f=>{assert.ok(pos(f)>prev,f);prev=pos(f);assert.ok(sw.includes("'./scripts/"+f+"?v="),f)});
  assert.ok(pos('app-v372-planning-ui.js')>prev)});
t('📋 Prévu : 📅 Planning | 📊 Comparaison | 🔎 OCR / Validation ; page réelle « Calendrier | Journées » inchangée',()=>{
  assert.ok(ui.includes('📅 Planning')&&ui.includes('📊 Comparaison')&&ui.includes('🔎 OCR / Validation'));assert.ok(idx.includes('☰ Journées</button>')&&idx.includes('▦ Calendrier</button>'))});

(async()=>{for(const [n,f] of tests){try{await f();console.log('  ok  '+n)}catch(e){fails++;console.log('FAIL  '+n+'\n      '+(e&&e.message))}}
  console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.3.0 (comparaison Prévu ↔ Réel) passent.');process.exit(fails?1:0)})();
