#!/usr/bin/env node
/*
 * V37.2.0-C — Planning prévu : analyse structurée (grille, dates, salarié, cellules, contrôles, validation). Tests Node.
 * Lancer : node tests/v372-planning-analysis.test.js
 * Images : plannings SYNTHÉTIQUES en pixels (tests/lib/planning-synthetique.js), noms inventés. La détection de grille
 * est réellement exécutée sur ces pixels ; le TEXTE est fourni par un OCR simulé (la disposition attendue). L'OCR réel
 * (tesseract.js) est exécuté dans le navigateur par v372-planning-analysis.browser.js. Aucune photo réelle n'est utilisée.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const S=require('./lib/planning-synthetique.js');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web'),SC=path.join(WEB,'scripts');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const PL=['app-v372-planning.js','app-v372-planning-grid.js','app-v372-planning-analysis.js','app-v372-planning-validation.js','app-v372-planning-loader.js'];
const SRC=Object.fromEntries(PL.map(f=>[f,fs.readFileSync(path.join(SC,f),'utf8')]));
let fails=0;const tests=[];const t=(n,f)=>tests.push([n,f]);
const SHA='5e'.repeat(32),NOW='2026-10-08T10:00:00Z';
function fakeStorage(){const m=new Map(),w=[];return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{w.push(k);m.set(k,String(v))},removeItem:k=>{m.delete(k)},writes:w,map:m}}
/* Modules chargés dans le contexte principal avec un « window » propre (paramètre) : même code qu'en vm, mais rapide
   (dans un contexte vm, chaque Math.* des boucles de pixels est une recherche globale lente). */
function load(){const st=fakeStorage(),win={localStorage:st,crypto:globalThis.crypto};
  PL.forEach(f=>vm.compileFunction(SRC[f],['window'],{filename:f})(win));
  return {P:win.MHPlanning,G:win.MHPlanningGrid,A:win.MHPlanningAnalysis,V:win.MHPlanningValidation,L:win.MHPlanningLoader,st,win}}
/* noms inventés */
const NOMS=['DUPONT Alice','MARTIN Paul','ROTH Mickael','LEROY Inès','GARNIER Hugo'];
const CYCLE=['Jour 7h','Repos','Samu','Condo\nm','Jour 7h','Jour 7h','Repos'];
function scenario(o){o=o||{};
  const debut=o.debut||'2026-11-02',n=o.n||31,cols=S.semaine(debut,n),noms=o.noms||NOMS.slice(0,4),moi=o.moi==null?2:o.moi;
  const lignes=noms.map((nom,i)=>({nom,cellules:cols.map((_,j)=>i===moi&&o.cellules&&o.cellules[j]!==undefined?o.cellules[j]:CYCLE[(i+j)%CYCLE.length])}));
  const fin=S.addJ(debut,n-1),tf=k=>k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4);
  const tables=[{titre:o.titre!==undefined?o.titre:'Planning du '+tf(debut)+' au '+tf(fin),colonnes:cols,lignes,entetes:o.entetes}];
  if(o.second)tables.push(o.second);
  return Object.assign(S.generer(Object.assign({W:o.W||1400,tables,inclinaison:o.inclinaison||0,bruit:o.bruit||0},o.fond?{fond:o.fond}:{})),{cols})}
async function analyse(sc,opts){const m=opts&&opts.mods||load();
  const a=await m.A.analyser(Object.assign({image:sc.image,sourceSha256:SHA,ocr:S.ocrSimule(sc.zones),nomRef:'ROTH Mickael',maintenant:NOW},opts||{},{mods:undefined}));return Object.assign(a,{_m:m})}
const codes=a=>a.warnings.map(w=>w.code);
const cel=(a,date)=>a.cells.find(c=>c.date===date);
const ref=s=>'Jour 7h';

console.log('Source et image');
t('image inexistante : analyse refusée (SOURCE_INVALIDE), aucune cellule',async()=>{const {A}=load();
  const a=await A.analyser({image:null,sourceSha256:SHA,ocr:{lire:async()=>({text:'',conf:0})}});
  assert.equal(a.status,'analyse_incomplète');assert.deepEqual(codes(a),['SOURCE_INVALIDE']);assert.equal(a.cells.length,0)});
t('SHA-256 invalide ou absent : analyse refusée avant toute lecture',async()=>{const {A}=load(),sc=scenario();let lu=0;const ocr={lire:async()=>{lu++;return {text:'',conf:0}}};
  for(const s of [undefined,'abc','Z'.repeat(64),SHA.toUpperCase()]){const a=await A.analyser({image:sc.image,sourceSha256:s,ocr});assert.equal(a.status,'analyse_incomplète');assert.ok(codes(a).includes('SOURCE_INVALIDE'))}
  assert.equal(lu,0)});
t('OCR indisponible : analyse incomplète annoncée, jamais de valeur',async()=>{const {A}=load(),sc=scenario();const a=await A.analyser({image:sc.image,sourceSha256:SHA,ocr:null});
  assert.deepEqual(codes(a),['OCR_INDISPONIBLE']);assert.equal(a.cells.length,0)});
t('image valide : analyse « à_valider », objet complet {sourceSha256, analyzedAt, tableCandidates, selectedEmployee, period, cells, warnings, confidence, status}',async()=>{
  const a=await analyse(scenario());
  ['sourceSha256','analyzedAt','tableCandidates','selectedEmployee','period','cells','warnings','confidence','status'].forEach(k=>assert.ok(k in a,k));
  assert.equal(a.status,'à_valider');assert.equal(a.sourceSha256,SHA);assert.equal(a.analyzedAt,NOW);assert.equal(a.cells.length,31);assert.deepEqual(a.warnings,[]);
  a.cells.forEach(c=>{['date','rawText','normalizedText','color','bounds','confidence','status'].forEach(k=>assert.ok(k in c,k));assert.ok(a._m.A.STATUTS.includes(c.status),c.status)})});
t('l’image analysée n’est jamais modifiée (copies pour les vues OCR)',async()=>{const sc=scenario(),h=()=>crypto.createHash('sha256').update(sc.image.data).digest('hex'),avant=h();
  const m=load();await analyse(sc,{mods:m});m.G.vueOcr(sc.image,{x:10,y:10,w:60,h:20},48);m.G.binaire(m.G.gris(sc.image));assert.equal(h(),avant)});
t('prétraitement : gris, contraste, agrandissement, binarisation (Otsu) produisent des copies',()=>{const {G}=load(),sc=scenario(),r={x:200,y:100,w:120,h:40};
  const c=G.recadrer(sc.image,r),g=G.gris(c),k=G.contraste(g),z=G.agrandir(c,3),b=G.binaire(g);
  assert.equal(c.width,120);assert.equal(z.width,360);assert.equal(z.height,120);assert.notEqual(g.data,c.data);
  for(let i=0;i<b.data.length;i+=4)assert.ok(b.data[i]===0||b.data[i]===255);for(let i=0;i<g.data.length;i+=4)assert.ok(g.data[i]===g.data[i+1]&&g.data[i]===g.data[i+2]);
  assert.ok(k.data.length===g.data.length)});

/* chargement de l'original : adaptateur de sources, lecture et décodeur simulés (le vrai décodage est testé dans le navigateur) */
function loaderDeps(fichiers,o){o=o||{};return {imp:{sources:{url:async ref=>fichiers.has(ref)?'mem:'+ref:null}},
  fetch:async u=>{const b=fichiers.get(u.slice(4));return b?{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}:{ok:false}},
  sha256:async b=>crypto.createHash('sha256').update(b).digest('hex'),
  decodeur:{image:async(bytes,mime,max)=>{const W=o.W||4000,H=o.H||3000,k=Math.min(1,max/Math.max(W,H));return {image:{width:Math.round(W*k),height:Math.round(H*k),data:new Uint8ClampedArray(4)},largeur:W,hauteur:H}},
    pdf:async()=>{throw new Error('pdf illisible')}}}}
const recDe=(bytes,o)=>{const sha=crypto.createHash('sha256').update(bytes).digest('hex');return {id:'imp-x',source:Object.assign({sha256:sha,localRef:'android:'+sha+'.jpg',format:'jpeg',mimeType:'image/jpeg',orientation:6,largeur:3000,hauteur:4000},o||{})}};
t('chargement : original inexistant sur l’appareil → SOURCE_ABSENTE (jamais d’analyse sur autre chose)',async()=>{const {L}=load(),b=new Uint8Array([1,2,3]),rec=recDe(b);
  const r=await L.charger(rec,loaderDeps(new Map()));assert.equal(r.ok,false);assert.equal(r.code,'SOURCE_ABSENTE')});
t('chargement : octets différents de l’empreinte enregistrée → SOURCE_MODIFIEE, analyse refusée',async()=>{const {L}=load(),b=new Uint8Array([1,2,3]),rec=recDe(b);
  const r=await L.charger(rec,loaderDeps(new Map([[rec.source.localRef,new Uint8Array([1,2,4])]])));assert.equal(r.code,'SOURCE_MODIFIEE');
  const a=await L.analyser(rec,{deps:loaderDeps(new Map([[rec.source.localRef,new Uint8Array([9])]]))});assert.equal(a.status,'analyse_incomplète');assert.deepEqual(a.warnings.map(w=>w.code),['SOURCE_MODIFIEE'])});
t('chargement : original valide → copie réduite (côté max 3200), échelle et orientation EXIF conservées ; octets relus intacts',async()=>{const {L}=load(),b=new Uint8Array([5,6,7,8]),rec=recDe(b),m=new Map([[rec.source.localRef,b]]);
  const r=await L.charger(rec,loaderDeps(m));assert.equal(r.ok,true);assert.equal(r.sha256,rec.source.sha256);assert.equal(r.image.width,3200);assert.equal(r.echelle,0.8);assert.equal(r.orientation,6);
  assert.deepEqual([...m.get(rec.source.localRef)],[5,6,7,8]);assert.equal(L.echelleCible(1600,1200),1);assert.equal(L.echelleCible(6400,100),0.5)});
t('chargement : format non analysable ou décodage impossible → refus explicite',async()=>{const {L}=load(),b=new Uint8Array([1]),rec=recDe(b,{format:'pdf'});
  const r=await L.charger(rec,loaderDeps(new Map([[rec.source.localRef,b]])));assert.equal(r.code,'DECODAGE');
  assert.equal((await L.charger({source:{sha256:'x'}},loaderDeps(new Map()))).code,'SOURCE_INVALIDE')});

console.log('Tableaux et grille');
t('tableau absent : image unie ou photo sans grille → TABLEAU_ABSENT',async()=>{const {A}=load(),W=600,H=400,d=new Uint8ClampedArray(W*H*4).fill(230);
  for(let i=3;i<d.length;i+=4)d[i]=255;for(let y=100;y<300;y++)for(let x=100;x<500;x++){const i=(y*W+x)*4;d[i]=40;d[i+1]=90;d[i+2]=160}
  const a=await A.analyser({image:{width:W,height:H,data:d},sourceSha256:SHA,ocr:{lire:async()=>({text:'',conf:0})}});
  assert.equal(a.status,'analyse_incomplète');assert.deepEqual(codes(a),['TABLEAU_ABSENT'])});
t('tableau détecté : 4 lignes × 31 colonnes, limites et pas mesurés dans l’image (x/y/w/h par cellule)',()=>{const {G}=load(),sc=scenario(),T=G.detecterTableaux(sc.image);
  assert.equal(T.length,1);assert.equal(T[0].lignes,4);assert.equal(T[0].colonnes,31);assert.ok(Math.abs(T[0].pasColonne-33)<1.5);assert.ok(Math.abs(T[0].pasLigne-21)<1.5);
  sc.zones.cellule.forEach(z=>{const b=T[0].cellules[z.ligne][z.col].bounds;assert.ok(Math.abs(b.x+b.w/2-(z.x+z.w/2))<4&&Math.abs(b.y+b.h/2-(z.y+z.h/2))<4,JSON.stringify([z,b]))})});
t('grille inclinée (1,2°) et bruitée : cellules toujours alignées',()=>{const {G}=load(),sc=scenario({inclinaison:1.2,bruit:24}),T=G.detecterTableaux(sc.image);
  assert.equal(T.length,1);assert.equal(T[0].colonnes,31);assert.ok(Math.abs(T[0].inclinaison-1.2)<0.4,String(T[0].inclinaison));
  sc.zones.cellule.forEach(z=>{const b=T[0].cellules[z.ligne][z.col].bounds;assert.ok(Math.abs(b.x+b.w/2-(z.x+z.w/2))<5&&Math.abs(b.y+b.h/2-(z.y+z.h/2))<5)})});
t('peu de colonnes (14) et jambages des noms alignés d’une ligne à l’autre : le pas des colonnes reste celui des liserés',()=>{const {G}=load(),cols=S.semaine('2026-11-02',14);
  const {image,zones}=S.generer({W:1178,cell:[58,38],gap:4,x0:270,lettres:true,tables:[{titre:'x',colonnes:cols,lignes:NOMS.slice(0,4).map((nom,i)=>({nom,cellules:cols.map((_,j)=>CYCLE[(i+j)%CYCLE.length])}))}]});
  const T=G.detecterTableaux(image);assert.equal(T.length,1);assert.equal(T[0].colonnes,14);assert.equal(T[0].lignes,4);assert.ok(Math.abs(T[0].bounds.w/14-62)<2,String(T[0].bounds.w));
  zones.cellule.forEach(z=>{const b=T[0].cellules[z.ligne][z.col].bounds;assert.ok(Math.abs(b.x+b.w/2-(z.x+z.w/2))<5)})});
/* ---- photos réelles du 09/10/2026 (2576 px, PDF scanné) : cas reproduits en synthétique ---- */
const peindre=(img,x,y,w,h,c)=>{for(let yy=Math.max(0,Math.round(y));yy<Math.min(img.height,Math.round(y+h));yy++)for(let xx=Math.max(0,Math.round(x));xx<Math.min(img.width,Math.round(x+w));xx++){const i=(yy*img.width+xx)*4;img.data[i]=c[0];img.data[i+1]=c[1];img.data[i+2]=c[2]}};
const cellulesAlignees=(T,zones,tol)=>zones.cellule.every(z=>{const b=T.cellules[z.ligne]&&T.cellules[z.ligne][z.col]&&T.cellules[z.ligne][z.col].bounds;return b&&Math.abs(b.x+b.w/2-(z.x+z.w/2))<tol&&Math.abs(b.y+b.h/2-(z.y+z.h/2))<tol});
t('1re rangée aux 5 premières cellules délavées (« Formation » presque blanche) : la rangée est gardée (4 lignes, pas 3)',()=>{const {G}=load(),sc=scenario();
  sc.zones.cellule.filter(z=>z.ligne===0&&z.col<5).forEach(z=>peindre(sc.image,z.x,z.y,z.w,z.h,[246,246,244]));
  const T=G.detecterTableaux(sc.image);assert.equal(T.length,1);assert.equal(T[0].lignes,4);assert.equal(T[0].colonnes,31);
  assert.ok(cellulesAlignees(T[0],{cellule:sc.zones.cellule.filter(z=>!(z.ligne===0&&z.col<5))},4))});
t('photo à l’ombre (papier gris ~178, Repos ~139) et en-têtes encadrés : ni le titre ni les en-têtes ne deviennent une rangée',()=>{const {G}=load(),cols=S.semaine('2026-11-02',31);
  const lignes=NOMS.slice(0,4).map((nom,i)=>({nom,cellules:cols.map((_,j)=>{const l=CYCLE[(i+j)%CYCLE.length];return l==='Repos'?{t:l,couleur:[139,139,142]}:l})}));
  const {image,zones}=S.generer({W:1400,fond:[178,178,175],tables:[{titre:'Planning du 02/11/2026 au 02/12/2026',colonnes:cols,lignes}]});
  zones.entete.forEach(z=>{peindre(image,z.x-2,z.y-2,z.w+4,z.h+4,[192,192,190]);peindre(image,z.x,z.y,z.w,z.h,[170,170,168])});
  zones.titre.forEach(z=>{for(let k=0;k<31;k++)peindre(image,200+k*33-2,z.y+z.h-6,3,10,[192,192,190])});
  const T=G.detecterTableaux(image);assert.equal(T.length,1);assert.deepEqual([T[0].lignes,T[0].colonnes],[4,31]);assert.ok(cellulesAlignees(T[0],zones,4))});
t('pli du papier : deux colonnes délavées et un faux trait sombre → une seule rangée de 31 colonnes (liserés comblés), alignée',()=>{const {G}=load(),sc=scenario();
  sc.zones.cellule.filter(z=>z.col===15||z.col===16).forEach(z=>peindre(sc.image,z.x-3,z.y,z.w+3,z.h,[250,250,250]));
  sc.zones.cellule.filter(z=>z.col===15).forEach(z=>peindre(sc.image,z.x+12,z.y,4,z.h,[60,60,60]));
  const T=G.detecterTableaux(sc.image);assert.equal(T.length,1);assert.equal(T[0].colonnes,31);assert.ok(T[0].liseresComblés>=2);
  assert.ok(cellulesAlignees(T[0],{cellule:sc.zones.cellule.filter(z=>z.col!==15&&z.col!==16)},6))});
t('textures (moins de 7 colonnes, ou cellules de moins de 15 px) : jamais prises pour un tableau',()=>{const {G}=load();
  const cols5=S.semaine('2026-11-02',5),t5=S.generer({W:600,tables:[{titre:'x',colonnes:cols5,lignes:NOMS.slice(0,4).map(nom=>({nom,cellules:cols5.map(()=>'Repos')}))}]});
  assert.deepEqual(G.detecterTableaux(t5.image),[]);
  const cols=S.semaine('2026-11-02',20),petit=S.generer({W:700,cell:[9,7],gap:3,x0:200,tables:[{titre:'x',colonnes:cols,lignes:NOMS.slice(0,4).map(nom=>({nom,cellules:cols.map(()=>'Samu')}))}]});
  assert.deepEqual(G.detecterTableaux(petit.image),[])});
t('recalage vertical : une case du maillage décalée d’un tiers de hauteur est recalée sur la cellule, une case pâle reste telle quelle',()=>{const {G}=load(),sc=scenario(),z=sc.zones.cellule.find(z=>z.ligne===1&&z.col===4);
  const pas=21,decal={x:Math.round(z.x),y:Math.round(z.y+6),w:Math.round(z.w),h:Math.round(z.h)},r=G._interne.recaler(sc.image,decal,pas);
  assert.ok(Math.abs(r.y-z.y)<=2&&Math.abs(r.y+r.h-(z.y+z.h))<=2,JSON.stringify([z,r]));
  peindre(sc.image,z.x,z.y,z.w,z.h,[250,250,250]);assert.deepEqual(G._interne.recaler(sc.image,decal,pas),decal)});
t('plusieurs tableaux : deux périodes analysées séparément, une ligne utilisateur par tableau',async()=>{
  const c2=S.semaine('2026-12-03',31),l2=NOMS.slice(0,4).map((nom,i)=>({nom,cellules:c2.map((_,j)=>CYCLE[(i+j+3)%CYCLE.length])}));
  const a=await analyse(scenario({second:{titre:'Planning du 03/12/2026 au 02/01/2027',colonnes:c2,lignes:l2}}));
  assert.equal(a.tableCandidates.length,2);assert.equal(a.status,'à_valider');assert.equal(a.cells.length,62);
  assert.deepEqual(a.tableCandidates.map(x=>x.periodeTitre),[{debut:'2026-11-02',fin:'2026-12-02'},{debut:'2026-12-03',fin:'2027-01-02'}]);
  assert.deepEqual(a.period,{debut:'2026-11-02',fin:'2027-01-02',titres:a.tableCandidates.map(x=>x.periodeTitre)});
  assert.deepEqual(a.selectedEmployee.parTableau.map(x=>[x.table,x.ligne,x.auto]),[[0,2,true],[1,2,true]]);assert.ok(!codes(a).includes('DOUBLON'))});
t('tableaux qui se chevauchent : même date lue différemment → DOUBLON, cellules à vérifier',async()=>{
  const c2=S.semaine('2026-12-01',10),l2=NOMS.slice(0,4).map((nom,i)=>({nom,cellules:c2.map(()=>i===2?'Samu':'Repos')}));
  const a=await analyse(scenario({second:{titre:'Planning du 01/12/2026 au 10/12/2026',colonnes:c2,lignes:l2}}));
  assert.ok(codes(a).includes('DOUBLON'));const d=a.cells.filter(c=>c.date==='2026-12-01');assert.equal(d.length,2);
  if(d[0].interpretation.type!==d[1].interpretation.type)d.forEach(c=>assert.equal(c.status,'à vérifier'))});

console.log('Dates');
t('dates valides : 31 colonnes datées en suite, contrôlées contre le titre (jour de semaine, chronologie, changement de mois)',async()=>{
  const sc=scenario(),a=await analyse(sc);assert.deepEqual(a.cells.map(c=>c.date),sc.cols);assert.deepEqual(a.period,{debut:'2026-11-02',fin:'2026-12-02',titres:[{debut:'2026-11-02',fin:'2026-12-02'}]});
  assert.equal(a.tableCandidates[0].datesFiables,31);assert.ok(a.cells.some(c=>c.date==='2026-11-30')&&a.cells.some(c=>c.date==='2026-12-01'))});
t('changement d’année (14/12/2026 → 13/01/2027) : 2027 attribué aux colonnes de janvier',async()=>{const sc=scenario({debut:'2026-12-14'}),a=await analyse(sc);
  assert.equal(a.status,'à_valider');assert.equal(a.cells[17].date,'2026-12-31');assert.equal(a.cells[18].date,'2027-01-01');assert.equal(a.cells[30].date,'2027-01-13')});
t('changement d’année sans titre lisible : année déduite au plus près de la date du jour, dates proposées « à vérifier » via DATE_MANQUANTE',async()=>{
  const sc=scenario({debut:'2026-12-14',titre:''}),a=await analyse(sc);assert.ok(codes(a).includes('DATE_MANQUANTE'));
  assert.equal(a.cells[18].date,'2027-01-01');assert.equal(a.tableCandidates[0].periodeTitre,null)});
t('lettre du jour incohérente : date = null, date proposée affichée, statut « à vérifier », DATE_INCOHERENTE',async()=>{
  const sc=scenario(),e=sc.zones.entete.find(z=>z.col===5);e.text='L 07/11';   /* le 07/11/2026 est un samedi */
  const a=await analyse(sc),c=a.cells[5];assert.equal(c.date,null);assert.equal(c.dateProposee,'2026-11-07');assert.equal(c.status,'à vérifier');
  assert.ok(a.warnings.some(w=>w.code==='DATE_INCOHERENTE'&&w.colonne===5))});
t('date hors de la suite chronologique, en-tête illisible, colonne hors période : signalés, jamais corrigés silencieusement',async()=>{
  const sc=scenario(),E=j=>sc.zones.entete.find(z=>z.col===j);E(3).text='J 12/11';E(8).text='~#';E(30).text='J 03/12';
  const a=await analyse(sc),w=a.warnings;
  assert.ok(w.some(x=>x.code==='DATE_INCOHERENTE'&&x.colonne===3));assert.ok(w.some(x=>x.code==='DATE_MANQUANTE'&&x.colonne===8));
  assert.ok(w.some(x=>x.colonne===30&&['DATE_INCOHERENTE','COLONNE_IMPOSSIBLE','DATE_MANQUANTE'].includes(x.code)));
  [3,8,30].forEach(j=>{assert.equal(a.cells[j].date,null);assert.equal(a.cells[j].status,'à vérifier')});assert.equal(a.cells[8].dateProposee,'2026-11-10')});
t('doublon de date dans les en-têtes : DOUBLON, la 2e colonne n’a pas de date',()=>{const {A}=load();
  const e=['L 02/11','M 03/11','M 04/11','M 04/11','V 06/11'].map(text=>({text,conf:85}));
  const D=A.datesColonnes(e,{debut:'2026-11-02',fin:'2026-11-06'},'2026-10-08');assert.ok(D.warnings.some(w=>w.code==='DOUBLON'||w.code==='DATE_INCOHERENTE'));assert.equal(D.colonnes[3].date,null)});
t('colonne décalée (1re colonne perdue) et période incomplète : COLONNE_DECALEE, PERIODE_INCOMPLETE',async()=>{
  const sc=scenario({titre:'Planning du 01/11/2026 au 02/12/2026'}),a=await analyse(sc);
  assert.ok(codes(a).includes('COLONNE_DECALEE'));assert.ok(codes(a).includes('PERIODE_INCOMPLETE'));assert.equal(a.cells[0].date,'2026-11-02')});
t('trop peu d’en-têtes lisibles : aucune date, analyse incomplète',async()=>{const sc=scenario();sc.zones.entete.forEach(z=>{z.text=''});const a=await analyse(sc);
  assert.ok(a.cells.every(c=>c.date===null));assert.equal(a.status,'analyse_incomplète');assert.ok(codes(a).includes('DATE_MANQUANTE'))});

console.log('Salarié');
t('ligne utilisateur unique : présélection sûre (score 1), confirmation toujours requise',async()=>{const a=await analyse(scenario());
  assert.deepEqual(a.selectedEmployee.parTableau.map(x=>[x.ligne,x.nomLu,x.auto]),[[2,'ROTH Mickael',true]]);assert.equal(a.selectedEmployee.confirme,false)});
t('nom lu avec une faute d’OCR (« R0TH Mickael ») : présélectionné ; deux fautes (« R0TH Mickaei ») : choix manuel',async()=>{
  const sc=scenario();sc.zones.nom[2].text='R0TH Mickael';const a=await analyse(sc);assert.equal(a.selectedEmployee.parTableau[0].ligne,2);
  sc.zones.nom[2].text='R0TH Mickaei';const b=await analyse(sc);assert.equal(b.selectedEmployee,null);assert.ok(codes(b).includes('LIGNE_AMBIGUE'))});
t('homonyme : aucune présélection, LIGNE_AMBIGUE, analyse incomplète ; choix manuel → à valider',async()=>{
  const sc=scenario({noms:['DUPONT Alice','ROTH Mickael','ROTH Mickaël','LEROY Inès']}),a=await analyse(sc);
  assert.equal(a.selectedEmployee,null);assert.ok(codes(a).includes('LIGNE_AMBIGUE'));assert.equal(a.status,'analyse_incomplète');assert.equal(a.cells.length,0);
  const b=await analyse(sc,{choix:[{table:0,ligne:2}]});assert.equal(b.status,'à_valider');assert.deepEqual(b.selectedEmployee.parTableau.map(x=>[x.ligne,x.auto]),[[2,false]])});
t('nom de référence absent : pas de choix automatique',async()=>{const a=await analyse(scenario(),{nomRef:''});assert.equal(a.selectedEmployee,null);assert.ok(codes(a).includes('LIGNE_AMBIGUE'))});
t('aucune donnée des autres salariés : seules les cellules de la ligne choisie sont lues et gardées ; noms des collègues retirés à l’enregistrement',async()=>{
  const sc=scenario(),m=load(),ocr=S.ocrSimule(sc.zones);
  const a=await m.A.analyser({image:sc.image,sourceSha256:SHA,ocr,nomRef:'ROTH Mickael',maintenant:NOW});
  const lues=ocr.lus.filter(x=>x.mode==='cellule');assert.equal(lues.length,31);
  lues.forEach(x=>{const z=sc.zones.cellule.find(z=>Math.abs(z.x+z.w/2-(x.r.x+x.r.w/2))<6&&Math.abs(z.y+z.h/2-(x.r.y+x.r.h/2))<6);assert.equal(z.ligne,2)});
  const s=JSON.stringify(m.A.serialiser(a));['DUPONT','MARTIN','LEROY','Alice','Paul','Inès'].forEach(n=>assert.ok(!s.includes(n),n));assert.ok(!('_candidats' in m.A.serialiser(a)))});

console.log('Cellules');
const CAS=async cellules=>{const sc=scenario({cellules});return analyse(sc)};
t('cellule vide (sans couleur ni texte) : « vide », aucune valeur',async()=>{const a=await CAS({4:{t:'',couleur:[252,252,252]}}),c=a.cells[4];
  assert.equal(c.status,'vide');assert.equal(c.interpretation,null);assert.equal(c.color.rempli,false)});
t('cellule illisible (colorée, aucun texte ou lecture < 35 %) : « illisible », aucune valeur inventée, CELLULE_ILLISIBLE',async()=>{
  const a=await CAS({4:{t:'Jour 7h',lu:''},6:{t:'Jour 7h',lu:'Jour 7h',conf:20}});
  [4,6].forEach(j=>{const c=a.cells[j];assert.equal(c.status,'illisible');assert.equal(c.interpretation,null);assert.ok(a.warnings.some(w=>w.code==='CELLULE_ILLISIBLE'&&w.cellule===j))});
  assert.match(a.cells[4].justification,/aucune valeur/)});
t('OCR ambigu (confiance 55 %) : interprétation proposée mais « à vérifier »',async()=>{const a=await CAS({4:{t:'Repos',conf:55}}),c=a.cells[4];
  assert.equal(c.status,'à vérifier');assert.equal(c.interpretation.type,'REPOS');assert.match(c.motif,/55/)});
t('« Jour 7n » : Jour 7h par tolérance générale, toujours « à vérifier »',async()=>{const a=await CAS({4:'Jour 7n'}),c=a.cells[4];
  assert.equal(c.interpretation.libelle,'Jour 7h');assert.equal(c.interpretation.dureeMin,420);assert.equal(c.chemin,'generale');assert.equal(c.status,'à vérifier');assert.equal(c.rawText,'Jour 7n')});
t('« Jour 8n » : non interprété (chiffre jamais transformé), CODE_INCONNU',async()=>{const a=await CAS({4:'Jour 8n'}),c=a.cells[4];
  assert.equal(c.status,'non_interprété');assert.equal(c.interpretation.type,'NON_INTERPRETE');assert.equal(c.interpretation.dureeMin,null);assert.ok(a.warnings.some(w=>w.code==='CODE_INCONNU'&&w.cellule===4))});
t('« Jour 1h » : reste 1 h (jamais 7 h) et déclenche DUREE_INHABITUELLE',async()=>{const a=await CAS({4:'Jour 1h'}),c=a.cells[4];
  assert.equal(c.interpretation.dureeMin,60);assert.equal(c.status,'à vérifier');assert.ok(a.warnings.some(w=>w.code==='DUREE_INHABITUELLE'&&w.cellule===4))});
t('« Repos » : correspondance exacte, interprété',async()=>{const a=await CAS({4:'Repos'}),c=a.cells[4];assert.equal(c.chemin,'exacte');assert.equal(c.status,'interprété');assert.equal(c.interpretation.type,'REPOS')});
t('« Repas » : variante OCR déclarée de Repos (chemin « variante »), confiance réduite',async()=>{const a=await CAS({4:'Repas',5:'Repos'}),c=a.cells[4];
  assert.equal(c.chemin,'variante');assert.equal(c.interpretation.type,'REPOS');assert.equal(c.status,'interprété');assert.ok(c.confidence<a.cells[5].confidence);assert.match(c.justification,/variante OCR déclarée/)});
t('« Repas midi » et « Repasse » : jamais transformés en Repos',async()=>{const a=await CAS({4:'Repas midi',5:'Repasse'});
  [4,5].forEach(j=>{assert.equal(a.cells[j].status,'non_interprété');assert.notEqual(a.cells[j].interpretation.type,'REPOS')})});
t('cellule colorée : couleur dominante RGB/HSL/hex mesurée, groupe de couleurs de l’image',async()=>{const a=await analyse(scenario()),c=a.cells.find(c=>c.rawText==='Samu');
  assert.ok(Math.abs(c.color.rgb[0]-140)<=3&&Math.abs(c.color.rgb[1]-60)<=3&&Math.abs(c.color.rgb[2]-150)<=3);assert.match(c.color.hex,/^#[0-9a-f]{6}$/);
  assert.ok(c.color.hsl&&typeof c.color.hsl==='object');assert.equal(c.color.rempli,true);assert.notEqual(c.color.groupe,null);
  a.cells.filter(x=>x.rawText==='Samu').forEach(x=>assert.equal(x.color.groupe,c.color.groupe))});
t('contradiction couleur/texte : « Jour 7h » dans la couleur des cellules Repos → CONTRADICTION_COULEUR, à vérifier ; la couleur ne crée jamais de valeur',async()=>{
  const a=await CAS({4:{t:'Jour 7h',couleur:[160,160,165]},9:{t:'x',lu:'',couleur:[160,160,165]}}),c=a.cells[4];
  assert.equal(c.status,'à vérifier');assert.equal(c.interpretation.type,'JOUR');assert.ok(a.warnings.some(w=>w.code==='CONTRADICTION_COULEUR'&&w.cellule===4));
  const ill=a.cells[9];assert.equal(ill.status,'illisible');assert.equal(ill.interpretation,null);assert.equal(ill.indiceCouleur.type,'REPOS');assert.match(ill.indiceCouleur.note,/indice seulement/)});
t('aucune couleur codée en dur : une palette inversée ne change pas les lectures',async()=>{const sc=scenario({cellules:{}});
  const inv=S.generer({W:1400,tables:[{titre:'Planning du 02/11/2026 au 02/12/2026',colonnes:sc.cols,lignes:NOMS.slice(0,4).map((nom,i)=>({nom,cellules:sc.cols.map((_,j)=>{const l=CYCLE[(i+j)%CYCLE.length];return {t:l,couleur:S.COUL[l].map(v=>255-v).map(v=>Math.min(v,200))}})}))}]});
  const a=await analyse(sc),b=await analyse(inv);assert.deepEqual(b.cells.map(c=>[c.date,c.interpretation&&c.interpretation.type,c.status]),a.cells.map(c=>[c.date,c.interpretation&&c.interpretation.type,c.status]));
  assert.ok(!/\b(vert|rouge|green|red)\b/i.test(SRC['app-v372-planning-analysis.js'].replace(/\/\*[\s\S]*?\*\//g,'')))});
t('texte d’en-tête lu dans une cellule : CONTRADICTION_STRUCTURE, à vérifier',async()=>{const a=await CAS({4:'L 06/11'});
  assert.equal(a.cells[4].status,'à vérifier');assert.ok(a.warnings.some(w=>w.code==='CONTRADICTION_STRUCTURE'&&w.cellule===4))});
t('code déclaré non concerné (« Matin ») : à vérifier, jamais ignoré',async()=>{const a=await CAS({4:'Matin'});assert.equal(a.cells[4].status,'à vérifier');assert.match(a.cells[4].motif,/non concerné/)});

t('liserés lus aux bords (« Jour 7h| », « | Repos », « [repos ») : retirés et dits dans la justification ; jamais une lettre ni un chiffre',()=>{const {A}=load(),col={date:'2026-11-02',colonne:0};
  const c1=A.cellule({text:'Jour 7h|',conf:90},col,null),c2=A.cellule({text:'| Repos',conf:90},col,null),c3=A.cellule({text:'Jour 7h 1)',conf:90},col,null),c4=A.cellule({text:'|',conf:90},col,null),c5=A.cellule({text:'x|y',conf:90},col,null);
  assert.deepEqual([c1.status,c1.interpretation.regle,c1.rawText],['interprété','JOUR','Jour 7h|']);assert.match(c1.justification,/retirés/);
  assert.equal(c2.interpretation.regle,'REPOS');assert.equal(c3.status,'non_interprété');assert.equal(c4.status,'illisible');assert.equal(c4.interpretation,null);assert.equal(c5.status,'non_interprété')});

console.log('Pages, rotation');
/* page scannée à l'envers : image tournée de 180°, texte lisible seulement une fois l'image remise à l'endroit */
function retourner(sc){const W=sc.image.width,H=sc.image.height,s=sc.image.data,o=new Uint8ClampedArray(s.length);for(let p=0,q=(W*H-1)*4;p<s.length;p+=4,q-=4){o[q]=s[p];o[q+1]=s[p+1];o[q+2]=s[p+2];o[q+3]=255}
  const r=z=>Object.assign({},z,{x:W-z.x-z.w,y:H-z.y-z.h});const zones=Object.fromEntries(Object.entries(sc.zones).map(([k,l])=>[k,l.map(r)]));
  return {image:{width:W,height:H,data:o},zones,W,H}}
function ocrPhysique(ud){const sim=S.ocrSimule(ud.zones);   /* lit ce qui est imprimé à l'endroit seulement */
  return {moteur:'OCR simulé',async lire(img,r,mode){if(!String(img.cle||'').endsWith(':180'))return {text:'',conf:0};return sim.lire(img,{x:ud.W-r.x-r.w,y:ud.H-r.y-r.h,w:r.w,h:r.h},mode)}}}
t('page à l’envers : relue tournée de 180°, PAGE_RETOURNEE, dates et ligne trouvées, coordonnées reportées dans l’image reçue',async()=>{
  const sc=scenario(),ud=retourner(sc),m=load();ud.image.cle='p1';
  const a=await m.A.analyser({image:ud.image,sourceSha256:SHA,ocr:ocrPhysique(ud),nomRef:'ROTH Mickael',maintenant:NOW});
  assert.equal(a.status,'à_valider');assert.ok(codes(a).includes('PAGE_RETOURNEE'));assert.equal(a.tableCandidates[0].rotation180,true);
  assert.deepEqual(a.cells.map(c=>c.date),sc.cols);assert.equal(a.cells[0].interpretation.regle,'SAMU');
  a.cells.forEach((c,j)=>{const z=ud.zones.cellule.find(z=>z.ligne===2&&z.col===j),b=c.boundsOriginal;assert.ok(Math.abs(b.x+b.w/2-(z.x+z.w/2))<4&&Math.abs(b.y+b.h/2-(z.y+z.h/2))<4,j)});
  const b=await m.A.analyser({image:ud.image,sourceSha256:SHA,ocr:ocrPhysique(ud),nomRef:'ROTH Mickael',maintenant:NOW,essai180:false});
  assert.notEqual(b.status,'à_valider');assert.ok(!codes(b).includes('PAGE_RETOURNEE'))});
t('page à l’endroit : jamais relue tournée',async()=>{const a=await analyse(scenario());assert.ok(!codes(a).includes('PAGE_RETOURNEE'));assert.equal(a.tableCandidates[0].rotation180,false)});
t('PDF de deux pages : tableaux numérotés de suite, chaque cellule porte sa page, contrôles sur l’ensemble',async()=>{const m=load();
  const s1=scenario(),c2=S.semaine('2026-12-03',31),s2=S.generer({W:1400,tables:[{titre:'Planning du 03/12/2026 au 02/01/2027',colonnes:c2,lignes:NOMS.slice(0,4).map((nom,i)=>({nom,cellules:c2.map((_,j)=>CYCLE[(i+j+2)%CYCLE.length])}))}]});
  const o1=S.ocrSimule(s1.zones),o2=S.ocrSimule(s2.zones),ocr={moteur:'sim',lire:(img,r,mo)=>(img===s1.image?o1:o2).lire(img,r,mo)};
  const a=await m.A.analyser({pages:[{image:s1.image,page:1},{image:s2.image,page:2}],sourceSha256:SHA,ocr,nomRef:'ROTH Mickael',maintenant:NOW});
  assert.equal(a.status,'à_valider');assert.deepEqual(a.tableCandidates.map(t=>[t.index,t.page]),[[0,1],[1,2]]);assert.equal(a.cells.length,62);
  assert.deepEqual([...new Set(a.cells.map(c=>c.page))],[1,2]);assert.deepEqual(a.period,{debut:'2026-11-02',fin:'2027-01-02',titres:a.tableCandidates.map(t=>t.periodeTitre)})});
t('chargement d’un PDF de plusieurs pages : une image par page transmise à l’analyse (échelle propre à chaque page)',async()=>{const m=load(),sc=scenario(),b=new Uint8Array([4,2]);
  const rec=recDe(b,{format:'pdf',mimeType:'application/pdf',orientation:null}),deps=loaderDeps(new Map([[rec.source.localRef,b]]));
  deps.decodeur.pdf=async()=>({image:sc.image,largeur:sc.image.width,hauteur:sc.image.height,pages:2,images:[{page:1,image:sc.image,largeur:sc.image.width,hauteur:sc.image.height},{page:2,image:sc.image,largeur:sc.image.width*2,hauteur:sc.image.height*2}]});
  const r=await m.L.charger(rec,deps);assert.equal(r.ok,true);assert.deepEqual(r.images.map(p=>[p.page,p.echelle,p.orientation]),[[1,1,1],[2,0.5,1]])});

console.log('Confiance');
t('confiance = OCR × chemin (exacte 1, variante 0,9, générale 0,7) × date sûre ; globale = moyenne des cellules non vides',async()=>{
  const a=await CAS({4:{t:'Repos',conf:80},5:{t:'Repas',conf:80},6:{t:'Jour 7n',conf:80},7:{t:'Repos',conf:80,couleur:[252,252,252],lu:''}});
  assert.equal(a.cells[4].confidence,0.8);assert.equal(a.cells[5].confidence,0.72);assert.equal(a.cells[6].confidence,0.56);
  const l=a.cells.filter(c=>c.status!=='vide');assert.equal(a.confidence,Math.round(l.reduce((s,c)=>s+c.confidence,0)/l.length*100)/100)});
t('date non sûre : confiance × 0,6 ; illisible = 0',async()=>{const sc=scenario({cellules:{4:{t:'Repos',lu:'',conf:0}}});sc.zones.entete.find(z=>z.col===6).text='~';
  const a=await analyse(sc);assert.equal(a.cells[4].confidence,0);assert.equal(a.cells[6].confidence,Math.round(0.9*1*0.6*100)/100)});
/* Référence INDÉPENDANTE du code testé : orientation EXIF appliquée pixel par pixel à un original W0 × H0 (définition EXIF :
   6 = rotation de 90° dans le sens horaire pour l'affichage, etc.). Un rectangle connu de l'original est marqué, l'image
   orientée est construite, son rectangle y est mesuré, puis reporté dans l'original par versOriginal(). */
const EXIF_PIX={1:(u,v,W,H)=>[u,v],2:(u,v,W,H)=>[W-1-u,v],3:(u,v,W,H)=>[W-1-u,H-1-v],4:(u,v,W,H)=>[u,H-1-v],
  5:(u,v,W,H)=>[v,u],6:(u,v,W,H)=>[H-1-v,u],7:(u,v,W,H)=>[H-1-v,W-1-u],8:(u,v,W,H)=>[v,W-1-u]};
function orienter(W0,H0,R,o){const rot=[5,6,7,8].includes(o),Wd=rot?H0:W0,Hd=rot?W0:H0,m=new Uint8Array(Wd*Hd);
  for(let v=0;v<H0;v++)for(let u=0;u<W0;u++)if(u>=R.x&&u<R.x+R.w&&v>=R.y&&v<R.y+R.h){const [x,y]=EXIF_PIX[o](u,v,W0,H0);m[y*Wd+x]=1}
  let x0=Infinity,y0=Infinity,x1=-1,y1=-1;for(let y=0;y<Hd;y++)for(let x=0;x<Wd;x++)if(m[y*Wd+x]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
  return {Wd,Hd,b:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}}}
const W0=40,H0=24,RECT={x:5,y:3,w:10,h:6};   /* original paysage, rectangle non centré : toute erreur d'axe se voit */
for(const o of [1,2,3,4,5,6,7,8])t('EXIF '+o+' : rectangle connu de l’original retrouvé exactement (x/y/w/h) depuis l’image orientée',()=>{const {G}=load(),r=orienter(W0,H0,RECT,o);
  assert.deepEqual(G.dimsOrientees(W0,H0,o),{largeur:r.Wd,hauteur:r.Hd});assert.deepEqual(G.versOriginal(r.b,o,W0,H0),RECT,JSON.stringify(r.b))});
t('EXIF 6, 7, 8 : versOriginal attend les dimensions de l’ORIGINAL (les dimensions orientées donneraient un autre rectangle ; 5 n’en dépend pas)',()=>{const {G}=load();
  for(const o of [6,7,8]){const r=orienter(W0,H0,RECT,o);assert.deepEqual(G.versOriginal(r.b,o,W0,H0),RECT);assert.notDeepEqual(G.versOriginal(r.b,o,r.Wd,r.Hd),RECT,'orientation '+o)}});
t('analyse : échelle + orientation 1 à 8 → boundsOriginal = cellule dans le fichier stocké (dimensions orientée et originale explicites)',async()=>{
  const sc=scenario(),m=load(),k=0.5,Lo=sc.image.width/k,Ho=sc.image.height/k;
  for(const o of [1,2,3,4,5,6,7,8]){const d=m.G.dimsOrientees(Lo,Ho,o);   /* original : échange largeur/hauteur en 5-8 */
    const a=await analyse(sc,{mods:m,orientation:o,echelle:k,largeurOrientee:Lo,hauteurOrientee:Ho,largeurOriginale:d.largeur,hauteurOriginale:d.hauteur});
    a.cells.slice(0,3).forEach(c=>{const b=c.bounds,full={x:b.x/k,y:b.y/k,w:b.w/k,h:b.h/k},att=EXIF_PIX[o];
      /* les deux coins du rectangle original, renvoyés dans l'image orientée par la transformation EXIF directe, redonnent la cellule */
      const O=c.boundsOriginal,cs=[[O.x,O.y],[O.x+O.w-1,O.y+O.h-1]].map(([u,v])=>att(u,v,d.largeur,d.hauteur));
      const xs=cs.map(p=>p[0]),ys=cs.map(p=>p[1]);
      assert.deepEqual({x:Math.min(...xs),y:Math.min(...ys),w:Math.abs(xs[1]-xs[0])+1,h:Math.abs(ys[1]-ys[0])+1},full,'orientation '+o)});
    /* sans dimensions explicites : même résultat (original déduit de l'orientation) */
    const b=await analyse(sc,{mods:m,orientation:o,echelle:k});assert.deepEqual(b.cells.map(c=>c.boundsOriginal),a.cells.map(c=>c.boundsOriginal),'déduction '+o)}});
t('chargement : dimensions orientée et originale explicites ; rotation EXIF non appliquée par le décodeur → orientation 1 et alerte',async()=>{
  const {L}=load(),b=new Uint8Array([7,7]);
  for(const o of [1,3,6,8]){const rec=recDe(b,{orientation:o,largeur:3000,hauteur:4000}),rot=[5,6,7,8].includes(o),deps=loaderDeps(new Map([[rec.source.localRef,b]]),{W:rot?4000:3000,H:rot?3000:4000});
    const r=await L.charger(rec,deps);assert.equal(r.ok,true);
    assert.deepEqual([r.largeurOrientee,r.hauteurOrientee,r.largeurOriginale,r.hauteurOriginale,r.orientation,r.orientationAppliquee],[rot?4000:3000,rot?3000:4000,3000,4000,o,true],'orientation '+o)}
  const rec=recDe(b,{orientation:6,largeur:3000,hauteur:4000}),r=await L.charger(rec,loaderDeps(new Map([[rec.source.localRef,b]]),{W:3000,H:4000}));
  assert.deepEqual([r.orientation,r.orientationAppliquee,r.orientationExif,r.largeurOriginale,r.hauteurOriginale],[1,false,6,3000,4000])});

console.log('Corrections, validation, rejet');
function avecImport(m){const st=m.P.store(),rec=m.P.creerImport({sourceType:'photo',format:'jpeg',sha256:SHA,localRef:'android:'+SHA+'.jpg',size:1234,originalFileName:'planning.jpg',importedAt:'2026-10-08T09:00:00Z'});
  st.importEnregistrer(rec);return {st,rec}}
t('correction tracée : valeur OCR d’origine, avant, après, auteur utilisateur, horodatage, raison ; rawText jamais écrasé',async()=>{
  const a=await CAS({4:'Jour 8n'}),V=a._m.V;const b=V.corriger(a,{index:4,champ:'texte',valeur:'Jour 8h',raison:'lu sur le papier',le:'2026-10-08T10:05:00Z'});
  const c=b.cells[4];assert.equal(c.rawText,'Jour 8n');assert.equal(c.texteCorrige,'Jour 8h');assert.equal(c.interpretation.dureeMin,480);assert.equal(c.chemin,'manuel');
  assert.deepEqual(b.corrections[0],{auteur:'utilisateur',le:'2026-10-08T10:05:00Z',raison:'lu sur le papier',cellule:4,champ:'texte',valeurOcr:'Jour 8n',avant:'Jour 8n',apres:'Jour 8h'});
  assert.equal(a.cells[4].rawText,'Jour 8n');assert.equal(a.corrections.length,0,'analyse d’origine intacte')});
t('validation refusée tant qu’il reste des cellules à vérifier ou sans date',async()=>{const m=load(),{st,rec}=avecImport(m);
  const a=await analyse(scenario({cellules:{4:'Jour 7n',5:{t:'Jour 7h',lu:''}}}),{mods:m});
  assert.throws(()=>m.V.valider(a,{store:st,record:rec}),e=>e.bloquants&&e.bloquants.length===2);assert.equal(st.liste().length,0)});
t('validation : planning PRÉVISIONNEL créé (lot A), lié à l’import, analyse « validé » ; corrections reportées',async()=>{const m=load(),{st,rec}=avecImport(m);
  let a=await analyse(scenario({cellules:{4:'Jour 7n',5:{t:'Jour 7h',lu:''}}}),{mods:m});
  a=m.V.confirmer(a,4,'7h sur le papier');a=m.V.corriger(a,{index:5,champ:'texte',valeur:'Repos'});
  const r=m.V.valider(a,{store:st,record:rec});assert.equal(r.analyse.status,'validé');assert.equal(r.plannings.length,1);
  const p=st.lire(r.plannings[0].id);assert.equal(p.nature||'prévisionnel','prévisionnel');assert.deepEqual(p.periode.debut,'2026-11-02');assert.equal(p.interpretation.length,31);
  assert.equal(p.interpretation.find(x=>x.date==='2026-11-07').type,'REPOS');assert.equal(p.salarie.nom,'ROTH Mickael');assert.equal(p.salarie.choix,'utilisateur');assert.equal(p.salarie.ligne,2);
  const i=st.importLire(rec.id);assert.deepEqual(i.planningIds,[p.id]);assert.equal(i.historique.at(-1).action,'analyse validée');
  const s=st.analyseLire(rec.id);assert.equal(s.status,'validé');assert.equal(s.corrections.length,2);assert.ok(!JSON.stringify(st.exporter()).match(/DUPONT|MARTIN|LEROY/));
  assert.throws(()=>m.V.corriger(s,{index:1,champ:'texte',valeur:'Repos'}),/validée/)});
t('validation : SHA de l’analyse différent de la source → refus',async()=>{const m=load(),{st,rec}=avecImport(m),a=await analyse(scenario(),{mods:m});
  assert.throws(()=>m.V.valider(Object.assign({},a,{sourceSha256:'0'.repeat(64)}),{store:st,record:rec}),/SHA-256/)});
t('rejet : analyse retirée, import et source conservés, décision tracée',async()=>{const m=load(),{st,rec}=avecImport(m),a=await analyse(scenario(),{mods:m});
  st.analyseEnregistrer(rec.id,m.A.serialiser(a));assert.ok(st.analyseLire(rec.id));
  m.V.rejeter(a,{store:st,record:rec,raison:'mauvaise photo'});assert.equal(st.analyseLire(rec.id),null);
  const i=st.importLire(rec.id);assert.equal(i.source.sha256,SHA);assert.equal(i.historique.at(-1).action,'analyse rejetée');assert.equal(st.liste().length,0)});
t('analyse enregistrée seulement pour un import existant et la même source',async()=>{const m=load(),{st,rec}=avecImport(m),a=await analyse(scenario(),{mods:m});
  assert.throws(()=>st.analyseEnregistrer('imp-inconnu',a),/inconnu/);assert.throws(()=>st.analyseEnregistrer(rec.id,Object.assign({},a,{sourceSha256:'1'.repeat(64)})),/SHA/);
  st.importSupprimer(rec.id);assert.equal(st.analyseLire(rec.id),null)});

t('chargement : cache des lectures (changement de ligne sans tout relire) et moteur OCR libéré',async()=>{const m=load(),sc=scenario(),b=new Uint8Array([3,1,4]),rec=recDe(b,{orientation:1});
  const deps=loaderDeps(new Map([[rec.source.localRef,b]]));deps.decodeur.image=async()=>({image:sc.image,largeur:sc.image.width,hauteur:sc.image.height});
  let lus=0,fin=0;const sim=S.ocrSimule(sc.zones);m.win.MHPlanningOCR={creer:async()=>({moteur:'sim',lire:async(i,r,mo)=>{lus++;return sim.lire(i,r,mo)},terminer:async()=>{fin++}})};
  const cache=new Map(),a=await m.L.analyser(rec,{deps,nomRef:'ROTH Mickael',cache});const n1=lus;assert.equal(a.status,'à_valider');assert.equal(fin,1);
  const b2=await m.L.analyser(rec,{deps,nomRef:'ROTH Mickael',cache,choix:[{table:0,ligne:1}]});assert.equal(fin,2);assert.equal(b2.selectedEmployee.parTableau[0].ligne,1);
  assert.ok(lus-n1<=31,'seules les cellules de la nouvelle ligne sont relues ('+(lus-n1)+')');assert.equal(a.sourceSha256,rec.source.sha256)});
t('réglages : nom de référence enregistré dans la clé Planning seulement, restauré avec la sauvegarde',()=>{const m=load(),st=m.P.store();
  assert.equal(st.reglages().nomRef,'');st.reglagesMaj({nomRef:'  ROTH   Mickael '});assert.equal(st.reglages().nomRef,'ROTH Mickael');assert.throws(()=>st.reglagesMaj({nomRef:'x'.repeat(81)}),/long/);
  assert.deepEqual([...m.st.map.keys()],['mh_planning_v372']);const {st:st2}=avecImport(load());const e={version:1,plannings:{},imports:{},reglages:{nomRef:'ROTH Mickael'}};
  const d=load().P.store();d.importer(e);assert.equal(d.reglages().nomRef,'ROTH Mickael')});

console.log('Non-régression');
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
  if(avec){PL.forEach(f=>vm.runInContext(SRC[f],ctx,{filename:f}));const m={P:win.MHPlanning,G:win.MHPlanningGrid,A:win.MHPlanningAnalysis,V:win.MHPlanningValidation};
    /* planning sur des dates déjà présentes dans DB.days (septembre 2026) */
    const sc=scenario({debut:'2026-08-24',n:28}),{st,rec}=avecImport(m);let a=await m.A.analyser({image:sc.image,sourceSha256:SHA,ocr:S.ocrSimule(sc.zones),nomRef:'ROTH Mickael',maintenant:NOW});
    assert.equal(a.status,'à_valider');a.cells.forEach((c,i)=>{if(m.V.bloquants(a).length&&c.status!=='interprété')a=m.V.confirmer(a,i)});m.V.valider(a,{store:st,record:rec});
    assert.equal(JSON.stringify(X.DB.days),avant,'DB.days inchangé')}
  const days=Object.keys(X.DB.days).sort();
  return {snap:JSON.stringify({cd:days.map(k=>{const r=X.cd(k);return [k,r.amp,r.tte,r.pz,r.nuit,r.idaj,r.ir,r.iru,r.al]}),
    per:['2026-08-24','2026-09-21'].map(s=>{const R=X.calcPer(s,2);return {G:R.G,Q:R.Q,B:X.brutOf(R.G)}}),q:['2026-08-24','2026-11-23'].map(k=>X.Q.payPeriod(k)),
    smart:win.MHControl.analyze({end:'2026-10-08'}),romi:win.MHRomiRecon.analyze({start:'2026-08-24',end:'2026-09-20'}),
    paie:(({score,compte,verdict,checks})=>({score,compte,verdict,checks}))(win.MHAssistantPaie.data({today:'2026-10-08',start:'2026-08-24'})),
    compteur:win.MHCompteur.data({today:'2026-10-08',start:'2026-08-24'}),nuit:win.MHNuit.annee('2026',{today:'2026-10-08'}),db:X.DB}),keys:[...st.map.keys()]};
}
t('analyse + validation d’un planning couvrant des jours réels : AUCUNE écriture dans DB.days ; cd(), TTE, HS, amplitude, quatorzaines, CP, IDAJ, repas, ROMI1, Paie, Smart Control, Compteur, nuit identiques',async()=>{
  const a=await snapshot(false),b=await snapshot(true);assert.equal(b.snap,a.snap);assert.deepEqual(b.keys,['mh_planning_v372'],'seule la clé Planning est écrite')});
t('moteur : app-core.js identique au tag v37.1.1 ; modules d’analyse sans accès à DB, cd(), calcPer, save()',()=>{
  let old=null;try{old=cp.execSync('git show aa4f9b2:app/src/main/assets/web/scripts/app-core.js',{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26})}catch(e){}
  if(old!=null)assert.equal(fs.readFileSync(path.join(SC,'app-core.js'),'utf8'),old);
  ['app-v372-planning-grid.js','app-v372-planning-ocr.js','app-v372-planning-analysis.js','app-v372-planning-validation.js','app-v372-planning-loader.js'].forEach(f=>{const c=fs.readFileSync(path.join(SC,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    assert.ok(!/\bDB\b|\bcd\(|calcPer|brutOf|\bsave\(|mesheures_v3|eval\(|new Function/.test(c),f)})});
t('versions : modules d’analyse alignés sur le cœur (37.2.0-C)',()=>{const m=load();[m.G,m.A,m.V].forEach(x=>assert.equal(x.version,m.P.version))});
const idx=fs.readFileSync(path.join(WEB,'index.html'),'utf8'),sw=fs.readFileSync(path.join(WEB,'sw.js'),'utf8'),ui=fs.readFileSync(path.join(SC,'app-v372-planning-ui.js'),'utf8');
t('intégration : 5 modules d’analyse chargés après le cœur et l’import, avant l’onglet, et dans le cache du service worker',()=>{
  const pos=f=>idx.indexOf('scripts/'+f+'?v=');let prev=pos('app-v372-planning-import.js');assert.ok(prev>pos('app-core.js'));
  ['app-v372-planning-grid.js','app-v372-planning-ocr.js','app-v372-planning-analysis.js','app-v372-planning-validation.js','app-v372-planning-loader.js'].forEach(f=>{
    assert.ok(pos(f)>prev,f);prev=pos(f);assert.equal(idx.split('scripts/'+f+'?v=').length,2,f);assert.ok(sw.includes("'./scripts/"+f+"?v="),f)});
  assert.ok(pos('app-v372-planning-ui.js')>prev)});
t('onglet : bouton « Analyser le planning » actif (plus « à venir »), écran ANALYSE DU PLANNING, colonnes Date | Lecture | Interprétation | Confiance | Statut, trois décisions',()=>{
  assert.ok(!ui.includes('Analyser le planning (à venir)'));assert.ok(ui.includes('>Analyser le planning</button>'));assert.ok(ui.includes('ANALYSE DU PLANNING'));
  assert.ok(ui.replace(/&shy;/g,'').includes('<th>Date</th><th>Lecture</th><th>Interprétation</th><th>Confiance</th><th>Statut</th>'),'en-têtes (césure possible sur petit écran)');
  ['Valider cette analyse','Modifier','Rejeter l’analyse','Salarié détecté','Période','Confiance'].forEach(x=>assert.ok(ui.includes(x),x));
  const c=ui.replace(/\/\*[\s\S]*?\*\//g,'');assert.ok(!/\bDB\b|\bcd\(|calcPer|brutOf|\bsave\(|mesheures_v3|eval\(|new Function/.test(c))});

(async()=>{for(const [n,f] of tests){try{await f();console.log('  ok  '+n)}catch(e){fails++;console.log('FAIL  '+n+'\n      '+(e&&e.message))}}
  console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.2.0-C (analyse planning) passent.');process.exit(fails?1:0)})();
