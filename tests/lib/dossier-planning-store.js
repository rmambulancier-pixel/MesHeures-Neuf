/*
 * V37.4.0 — Stockage Planning de test pour le Dossier (partagé par les tests Node et navigateur).
 * Parcours réel du module Planning (OCR simulé d'un planning COLLECTIF, noms inventés), dans un stockage en mémoire :
 *  A : OCR, une lecture corrigée (texte) + une correction de type, validation C3, puis deux corrections de fiche après validation
 *      (l'une datée après la validation, l'autre avec une horloge revenue en arrière) ;
 *  B : fiche sans analyse (rectificatif) qui recouvre A : dates identiques et dates en conflit ;
 *  C : OCR validé puis analyse retirée, source « à vérifier » ;
 *  D : fiche validée puis supprimée ; E : import analysé jamais validé.
 * Retourne la chaîne JSON du stockage `mh_planning_v372`, les identifiants et la lecture OCR d'origine corrigée.
 */
const fs=require('fs'),path=require('path'),vm=require('vm');
const S=require('./planning-synthetique.js');
const SC=path.join(__dirname,'..','..','app/src/main/assets/web/scripts');
const PL=['app-v372-planning.js','app-v372-planning-grid.js','app-v372-planning-analysis.js','app-v372-planning-validation.js','app-v372-planning-calendrier.js'];
const SRC=Object.fromEntries(PL.map(f=>[f,fs.readFileSync(path.join(SC,f),'utf8')]));
const KEY='mh_planning_v372',NOW='2026-10-09T10:00:00Z';
const SHA_A='a1'.repeat(32),SHA_B='b2'.repeat(32),SHA_C='c3'.repeat(32),SHA_D='d4'.repeat(32),SHA_E='e5'.repeat(32);
const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const COLLEGUES=['DUPONT Alice','MARTIN Paul','LEROY Inès','GARNIER Hugo'];
const NOMS=['DUPONT Alice','MARTIN Paul','ROTH Mickael','LEROY Inès'];
const CYCLE=['Jour 7h','Repos','Samu','Condo\nm','Jour 7h','Jour 7h','Repos'];
function memoire(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},map:m}}
function modules(){const ls=memoire(),win={localStorage:ls,crypto:globalThis.crypto};PL.forEach(f=>vm.compileFunction(SRC[f],['window'],{filename:f})(win));
  return {P:win.MHPlanning,A:win.MHPlanningAnalysis,V:win.MHPlanningValidation,ls,st:win.MHPlanning.store(ls)}}
function imp(m,sha,nom,fmt){const r=m.P.creerImport({sourceType:'fichier',format:fmt||'jpeg',sha256:sha,localRef:'android:'+sha+(fmt==='pdf'?'.pdf':'.jpg'),size:2048,originalFileName:nom,importedAt:NOW});m.st.importEnregistrer(r);return r}
/* planning collectif synthétique ; le titre lu contient volontairement le nom d'un collègue (il ne doit jamais sortir) */
function synth(debut,n){const cols=S.semaine(debut,n),tf=k=>k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4);
  return S.generer({W:1400,tables:[{titre:'Planning du '+tf(cols[0])+' au '+tf(cols[n-1])+' équipe GARNIER Hugo',colonnes:cols,lignes:NOMS.map((nom,i)=>({nom,cellules:cols.map((_,j)=>CYCLE[(i+j)%CYCLE.length])}))}]})}
async function analyser(m,sha,debut,n){const sc=synth(debut,n);return m.A.analyser({image:sc.image,sourceSha256:sha,ocr:S.ocrSimule(sc.zones),nomRef:'ROTH Mickael',maintenant:NOW})}
function fiche(m,o){const fin=addJ(o.debut,o.labels.length-1);
  const p=m.P.creer({importeLe:NOW,source:{nom:o.nom,mime:'application/pdf',taille:1000,sha256:o.sha},periode:{debut:o.debut,fin,origine:'ocr'},
    salarie:{nom:'ROTH Mickael',ligne:2,confirme:true},ligne:{ligne:2,nomLu:'ROTH Mickael',nomConf:95,cellules:o.labels.map((x,i)=>({colonne:i,texte:x,conf:95}))},
    ocr:{moteur:'tesseract.js',statut:'complet',titre:o.titre||null},origine:o.origine===undefined?null:o.origine});
  return m.st.enregistrer(Object.assign(p,{id:'pl-'+o.sha.slice(0,12)+'-'+o.debut}))}

async function preparer(){
  const m=modules();
  /* A : OCR réel simulé, une cellule corrigée (lecture d'origine gardée), les autres confirmées, validation C3 */
  const recA=imp(m,SHA_A,'planning-novembre.jpg');let a=await analyser(m,SHA_A,'2026-11-02',14);
  const iA=a.cells.findIndex(c=>c.date==='2026-11-03');
  a=m.V.corriger(a,{index:iA,champ:'texte',valeur:'Jour 7h',raison:'lu de travers',le:'2026-10-09T10:05:00.000Z'});
  /* correction de TYPE dans l'analyse : la validation la reporte aussi sur la fiche (doublon à ne pas afficher deux fois) */
  const iT=a.cells.findIndex(c=>c.date==='2026-11-04');a=m.V.corriger(a,{index:iT,champ:'type',valeur:'FORMATION',raison:'type corrigé',le:'2026-10-09T10:06:00.000Z'});
  a.cells.forEach((c,i)=>{if(c.status!=='interprété'&&!c.revue)a=m.V.confirmer(a,i,'confirmé par l’utilisateur')});
  const vA=m.V.valider(a,{store:m.st,record:m.st.importLire(recA.id)});const A=vA.plannings[0];
  /* B : fiche sans analyse (créée directement), recouvre A du 09/11 au 12/11 : 09-11 identiques, 12/11 différent (conflit) */
  const labA=d=>m.st.lire(A.id).interpretation.find(x=>x.date===d).libelle;
  const B=fiche(m,{debut:'2026-11-09',nom:'planning-rectificatif.pdf',sha:SHA_B,labels:[labA('2026-11-09'),labA('2026-11-10'),labA('2026-11-11'),labA('2026-11-12')==='Repos'?'Samu':'Repos'],
    titre:'Rectificatif MARTIN Paul'});
  /* corrections faites sur la fiche A APRÈS sa validation (API du lot A) : l'une datée normalement (après la validation),
     l'autre avec une horloge revenue en arrière (datée avant la validation) : elle ne doit jamais être masquée */
  const apresLe=new Date(Date.parse(m.st.lire(A.id).enregistreLe)+3600e3).toISOString();
  let A2=m.P.corriger(m.st.lire(A.id),{date:'2026-11-10',champ:'libelle',valeur:labA('2026-11-10')==='Repos'?'Samu':'Repos',le:apresLe});
  A2=m.P.corriger(A2,{date:'2026-11-14',champ:'libelle',valeur:'Samu',le:'2020-01-01T00:00:00.000Z'});m.st.enregistrer(A2);
  /* C : OCR réel, validé, puis analyse retirée (la lecture d'origine devient indisponible) ; source « à vérifier » */
  const recC=imp(m,SHA_C,'planning-decembre.pdf','pdf');let c=await analyser(m,SHA_C,'2026-12-07',14);
  c.cells.forEach((x,i)=>{if(x.status!=='interprété'&&!x.revue)c=m.V.confirmer(c,i)});
  const vC=m.V.valider(c,{store:m.st,record:m.st.importLire(recC.id)});const C=vC.plannings[0];
  m.V.rejeter(m.st.analyseLire(recC.id),{store:m.st,record:m.st.importLire(recC.id),raison:'analyse retirée pour le test'});
  m.st.importMaj(recC.id,{disponibilite:'a_verifier'});
  /* D : fiche validée puis supprimée (trace dans l'historique de l'import) */
  const recD=imp(m,SHA_D,'planning-supprime.jpg');let d=await analyser(m,SHA_D,'2027-01-04',14);
  d.cells.forEach((x,i)=>{if(x.status!=='interprété'&&!x.revue)d=m.V.confirmer(d,i)});
  const D=m.V.valider(d,{store:m.st,record:m.st.importLire(recD.id)}).plannings[0];m.st.ficheSupprimer(D.id);
  /* E : import analysé, jamais validé */
  const recE=imp(m,SHA_E,'planning-non-valide.jpg');m.st.analyseEnregistrer(recE.id,m.A.serialiser(await analyser(m,SHA_E,'2027-02-01',14)));
  return {store:m.ls.map.get(KEY),ids:{A:A.id,B:B.id,C:C.id,D:D.id},imports:{A:recA.id,C:recC.id,D:recD.id,E:recE.id},iA,brutA:a.cells[iA].rawText};
}

module.exports={preparer,KEY,NOW,COLLEGUES,SHA_A,SHA_B,SHA_C,SHA_D,SHA_E};
