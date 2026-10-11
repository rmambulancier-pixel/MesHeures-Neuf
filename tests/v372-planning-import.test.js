#!/usr/bin/env node
/*
 * V37.2.0-B — Planning prévu : import des sources (photo, galerie, fichier, PDF), stockage, sauvegarde. Tests Node.
 * Lancer : node tests/v372-planning-import.test.js
 * Fichiers : fixtures/planning/ (tous synthétiques). Le pont Android est simulé en mémoire avec la même vérification
 * d'empreinte que LegacyWebViewActivity (le vrai code Java est exécuté par v372-planning-android.test.js).
 * pdf.js est simulé ici (texte par page) ; la vraie lecture PDF est vérifiée dans v372-planning.browser.js.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web'),SC=path.join(WEB,'scripts'),FX=path.join(__dirname,'fixtures/planning');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const CORE=fs.readFileSync(path.join(SC,'app-v372-planning.js'),'utf8'),IMP=fs.readFileSync(path.join(SC,'app-v372-planning-import.js'),'utf8');
let fails=0;const tests=[];const t=(n,f)=>tests.push([n,f]);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const rd=n=>new Uint8Array(fs.readFileSync(path.join(FX,n)));
function fakeStorage(){const m=new Map(),w=[];return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{w.push(k);m.set(k,String(v))},removeItem:k=>{m.delete(k)},writes:w,map:m}}
/* Pont natif simulé : mêmes règles que le Java (nom <sha256>.<ext>, empreinte vérifiée, 20 Mo). */
function fakeAndroid(){const files=new Map();let cur=null;const NAME=/^[0-9a-f]{64}\.(jpg|png|webp|pdf|txt)$/;const calls=[];
  return {files,calls,failFinish:false,
    planningSourceBegin(n,s){calls.push('begin:'+n);if(!NAME.test(n)||!/^[0-9a-f]{64}$/.test(s))return false;cur={n,s,parts:[]};return true},
    planningSourceAppend(b){if(!cur)return false;cur.parts.push(Buffer.from(b,'base64'));return true},
    planningSourceFinish(){if(!cur)return false;const buf=Buffer.concat(cur.parts),ok=!this.failFinish&&sha(buf)===cur.s&&buf.length<=20*1024*1024;if(ok)files.set(cur.n,buf);cur=null;return ok},
    planningSourceExists(n){return NAME.test(n)&&files.has(n)},planningSourceDelete(n){return files.delete(n)},planningLastPickStatus(){return ''}}}
function fakePdf(pagesFor){return {getDocument:({data})=>({promise:Promise.resolve({numPages:pagesFor(data).length,getPage:async i=>({getTextContent:async()=>({items:[{str:pagesFor(data)[i-1]}]})}),destroy(){}})}),GlobalWorkerOptions:{}}}
const PDF_TEXTES={['planning-texte.pdf']:['Planning du 02/11/2026 au 02/12/2026 Edite le 06/10/2026 Employe L 02/11 DUPONT Alice Jour 7h Repos Samu ROTH Mickael Jour 7h'],['planning-scan-image.pdf']:['']};
function load(opts){
  opts=opts||{};const S=fakeStorage(),A=opts.natif===false?null:fakeAndroid();
  const win={localStorage:S,crypto:globalThis.crypto,btoa:s=>Buffer.from(s,'binary').toString('base64')};
  if(A)win.MesHeuresAndroid=A;
  const bySize=new Map(Object.entries(PDF_TEXTES).map(([n,p])=>[fs.statSync(path.join(FX,n)).size,p]));
  win.mhLoadLib=async()=>{win.pdfjsLib=fakePdf(d=>bySize.get(d.length)||[''])};
  const ctx={window:win,console,crypto:globalThis.crypto,TextEncoder,TextDecoder,URL,Blob,Date,Math,JSON,Object,Array,Map,Number,String,RegExp,Set,Error,Promise,Uint8Array,ArrayBuffer};ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(CORE,ctx,{filename:'app-v372-planning.js'});vm.runInContext(IMP,ctx,{filename:'app-v372-planning-import.js'});
  return {P:win.MHPlanning,I:win.MHPlanningImport,S,A,win};
}
const file=(n,o)=>{const b=o&&o.bytes?o.bytes:rd(n);return {name:o&&o.name||n,size:o&&o.size!=null?o.size:b.length,type:o&&o.type||'',arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}};

console.log('Contrôle du contenu réel');
t('JPG, PNG, WEBP, PDF reconnus par leur contenu ; texte renommé en .jpg refusé',()=>{const {I}=load();
  assert.equal(I.detecter(rd('planning-photo-exif6.jpg')).format,'jpeg');assert.equal(I.detecter(rd('planning-galerie.png')).format,'png');
  assert.equal(I.detecter(rd('planning-galerie.webp')).format,'webp');assert.equal(I.detecter(rd('planning-texte.pdf')).format,'pdf');
  assert.equal(I.detecter(rd('pas-une-image.jpg')),null);assert.equal(I.detecter(new Uint8Array([0xFF,0xD8])),null)});
t('orientation EXIF : 6 lue sur la photo ; PNG et JPEG sans EXIF → null ; octets intacts',()=>{const {I}=load(),b=rd('planning-photo-exif6.jpg'),h=sha(b);
  assert.equal(I.orientationExif(b),6);assert.equal(I.orientationExif(rd('planning-galerie.png')),null);
  assert.equal(I.orientationExif(new Uint8Array([0xFF,0xD8,0xFF,0xDB,0,4,0,0,0xFF,0xDA,0,0])),null);assert.equal(sha(b),h)});
t('dimensions lues dans l’en-tête : 380 × 120 (JPG, PNG, WEBP)',()=>{const {I}=load();
  [['planning-photo-exif6.jpg','jpeg'],['planning-galerie.png','png'],['planning-galerie.webp','webp']].forEach(([n,f])=>assert.deepEqual(I.dimensions(rd(n),f),{largeur:380,hauteur:120},n))});
t('nom de fichier nettoyé (affichage seulement) : dossiers, caractères de contrôle et réservés retirés, longueur bornée',()=>{const {I}=load();
  assert.equal(I.nomPropre('/storage/emulated/0/DCIM/../planning<1>.jpg'),'planning1.jpg');assert.equal(I.nomPropre('C:\\x\\a\u0000b?.png'),'ab.png');
  assert.equal(I.nomPropre(''),'planning');const l=I.nomPropre('a'.repeat(300)+'.pdf');assert.ok(l.length<=100&&l.endsWith('.pdf'))});
t('PDF : texte sélectionnable (≥ 30 caractères) ou image',()=>{const {I}=load();assert.equal(I.classerPdf([]).textuel,false);assert.equal(I.classerPdf(['  ','']).textuel,false);
  assert.deepEqual(I.classerPdf(['Planning du 02/11/2026 au 02/12/2026']),{textuel:true,caracteres:32,pages:1})});

console.log('Import');
t('photo JPG : fiche « à analyser », original rangé intact (android:<sha256>.jpg), SHA-256 exact, aucune analyse',async()=>{
  const {I,A,P}=load(),b=rd('planning-photo-exif6.jpg'),r=await I.importer(file('planning-photo-exif6.jpg',{type:'image/jpeg'}),{sourceType:'photo',importedAt:'2026-10-08T21:00:00.000Z'});
  assert.equal(r.statut,'ok');const x=r.record,h=sha(b);
  assert.deepEqual([x.statut,x.sourceType,x.source.mimeType,x.source.size,x.source.sha256,x.source.localRef,x.source.originalFileName,x.source.orientation,x.source.largeur,x.source.hauteur],
    ['a_analyser','photo','image/jpeg',b.length,h,'android:'+h+'.jpg','planning-photo-exif6.jpg',6,380,120]);
  assert.deepEqual([x.periode,x.salarie,x.planningId,x.corrections,x.ocr.statut,x.nature],[{debut:null,fin:null},null,null,[],'a_venir','prévisionnel']);
  assert.ok(x.createdAt&&x.importedAt&&x.id);assert.deepEqual(x.versions,{module:P.version,dictionnaire:{id:'mh-planning',version:1}});
  assert.ok(Buffer.from(A.files.get(h+'.jpg')).equals(Buffer.from(b)),'original identique octet pour octet');assert.deepEqual(P.store().importLire(x.id),x)});
t('galerie PNG et WEBP : acceptés',async()=>{const {I}=load();for(const n of ['planning-galerie.png','planning-galerie.webp']){const r=await I.importer(file(n),{sourceType:'galerie'});assert.equal(r.statut,'ok',n);assert.equal(r.record.sourceType,'galerie')}});
t('PDF texte : texte extrait et rangé avec la source (<sha256>.txt), fiche sans le texte (noms des collègues)',async()=>{
  const {I,A}=load(),r=await I.importer(file('planning-texte.pdf'),{sourceType:'fichier'});assert.equal(r.statut,'ok');const x=r.record,h=x.source.sha256;
  assert.equal(x.ocr.statut,'pdf_texte');assert.equal(x.extraction.texte.disponible,true);assert.ok(x.extraction.texte.caracteres>=30);assert.equal(x.extraction.texte.ref,'android:'+h+'.txt');
  assert.ok(A.files.get(h+'.txt').toString('utf8').includes('Planning du 02/11/2026 au 02/12/2026'));assert.ok(!JSON.stringify(x).includes('DUPONT'));
  assert.deepEqual([x.periode.debut,x.salarie],[null,null],'aucune interprétation dans le lot B')});
t('PDF image : « PDF image — analyse OCR à venir », aucun texte inventé',async()=>{const {I,A}=load(),r=await I.importer(file('planning-scan-image.pdf'),{sourceType:'fichier'});
  assert.equal(r.statut,'ok');assert.equal(r.record.ocr.statut,'pdf_image_a_venir');assert.equal(r.record.ocr.libelle,'PDF image — analyse OCR à venir');
  assert.deepEqual([r.record.extraction.texte.disponible,r.record.extraction.texte.ref],[false,null]);assert.ok(![...A.files.keys()].some(k=>k.endsWith('.txt')))});
t('fichier invalide (texte renommé .jpg) : refus, rien rangé, aucune fiche',async()=>{const {I,A,P}=load(),r=await I.importer(file('pas-une-image.jpg'),{sourceType:'galerie'});
  assert.deepEqual([r.statut,r.code],['erreur','INVALIDE']);assert.equal(A.files.size,0);assert.equal(P.store().importsListe().length,0)});
t('annulation (aucun fichier) : statut « annule », rien rangé',async()=>{const {I,A,P}=load(),r=await I.importer(null,{sourceType:'photo'});assert.equal(r.statut,'annule');assert.equal(A.calls.length,0);assert.equal(P.store().importsListe().length,0)});
t('trop volumineux (21 Mo) : refus avant lecture ; vide : refus',async()=>{const {I,A}=load();let lu=false;
  const r=await I.importer({name:'gros.jpg',size:21*1024*1024,arrayBuffer:async()=>{lu=true;return new ArrayBuffer(0)}},{sourceType:'fichier'});
  assert.equal(r.code,'TROP_GROS');assert.equal(lu,false);assert.equal((await I.importer({name:'v.jpg',size:10,arrayBuffer:async()=>new ArrayBuffer(10)})).code,'INVALIDE');assert.equal(A.calls.length,0)});
t('doublon SHA-256 : même fichier (autre nom, autre source) refusé, aucune 2e fiche ni 2e écriture',async()=>{const {I,A,P}=load();
  const a=await I.importer(file('planning-galerie.png'),{sourceType:'galerie'}),n=A.calls.length;
  const b=await I.importer(file('planning-galerie.png',{name:'copie.png'}),{sourceType:'fichier'});
  assert.equal(b.statut,'doublon');assert.equal(b.existant.id,a.record.id);assert.equal(A.calls.length,n);assert.equal(P.store().importsListe().length,1);assert.ok(/déjà été importé/.test(b.message))});
t('deux fichiers différents : deux imports (un chevauchement éventuel de période n’est pas un doublon)',async()=>{const {I,P}=load();
  await I.importer(file('planning-galerie.png'),{sourceType:'galerie'});await I.importer(file('planning-galerie.webp'),{sourceType:'galerie'});assert.equal(P.store().importsListe().length,2)});
t('écriture refusée par le stockage (empreinte, espace) : erreur, aucune fiche',async()=>{const {I,A,P}=load();A.failFinish=true;
  const r=await I.importer(file('planning-galerie.png'),{sourceType:'galerie'});assert.equal(r.code,'STOCKAGE');assert.equal(P.store().importsListe().length,0)});
t('sans application Android ni IndexedDB : erreur de stockage claire, aucune fiche',async()=>{const {I,P}=load({natif:false});
  const r=await I.importer(file('planning-galerie.png'),{sourceType:'galerie'});assert.equal(r.code,'STOCKAGE');assert.ok(/Stockage local indisponible/.test(r.message));assert.equal(P.store().importsListe().length,0)});
t('référence locale contrôlée : une fiche avec un chemin arbitraire est refusée par le cœur',()=>{const {P}=load();
  ['android:../../x.jpg','file:///sdcard/x.jpg','idb:'+'a'.repeat(64)+'.exe','/data/user/0/x'].forEach(ref=>assert.throws(()=>P.creerImport({sourceType:'photo',format:'jpeg',sha256:'a'.repeat(64),localRef:ref,size:10}),/Référence locale/,ref))});

console.log('Stockage');
t('création, lecture, liste, suppression (fichier original conservé par défaut)',async()=>{const {I,A,P}=load(),st=P.store();
  const r=(await I.importer(file('planning-photo-exif6.jpg'),{sourceType:'photo'})).record,h=r.source.sha256;
  assert.equal(st.importsListe().length,1);assert.equal(st.importLire(r.id).source.sha256,h);
  const d=await I.supprimer(r.id);assert.deepEqual(d,{fiche:true,source:false});assert.equal(st.importLire(r.id),null);assert.ok(A.files.has(h+'.jpg'),'original conservé sans demande explicite')});
t('suppression avec l’original : seulement sur demande explicite (avecSource:true), texte extrait compris',async()=>{const {I,A}=load();
  const r=(await I.importer(file('planning-texte.pdf'),{sourceType:'fichier'})).record,h=r.source.sha256;
  assert.deepEqual(await I.supprimer(r.id,{avecSource:'oui'}),{fiche:true,source:false});assert.ok(A.files.has(h+'.pdf'));
  const r2=(await I.importer(file('planning-texte.pdf'),{sourceType:'fichier'})).record;assert.deepEqual(await I.supprimer(r2.id,{avecSource:true}),{fiche:true,source:true});
  assert.ok(!A.files.has(h+'.pdf')&&!A.files.has(h+'.txt'))});
t('source disponible / à vérifier : fichier présent → « disponible », retiré → « à vérifier » (jamais « absente »)',async()=>{const {I,A,P}=load(),st=P.store();
  const r=(await I.importer(file('planning-galerie.png'),{sourceType:'galerie'})).record;assert.equal(st.importLire(r.id).source.disponibilite,'disponible');
  A.files.delete(r.source.sha256+'.png');assert.deepEqual(await I.verifierSources(),{disponible:0,a_verifier:1});assert.equal(st.importLire(r.id).source.disponibilite,'a_verifier');
  assert.ok(!JSON.stringify(st.importLire(r.id)).includes('absent'))});
t('modifications limitées : disponibilité et lien planningId seulement ; source et SHA-256 jamais modifiés',async()=>{const {I,P}=load(),st=P.store();
  const r=(await I.importer(file('planning-galerie.png'),{sourceType:'galerie'})).record;assert.throws(()=>st.importMaj(r.id,{disponibilite:'absente'}),/invalide/);
  const m=st.importMaj(r.id,{planningId:'pl-x',sha256:'0'.repeat(64),source:{}});assert.equal(m.planningId,'pl-x');assert.equal(m.source.sha256,r.source.sha256)});

console.log('Sauvegarde JSON');
t('export : métadonnées, SHA-256, référence de la source, disponibilité ; aucun contenu d’image ou de PDF',async()=>{const {I,P}=load(),st=P.store();
  const a=(await I.importer(file('planning-photo-exif6.jpg'),{sourceType:'photo'})).record;await I.importer(file('planning-texte.pdf'),{sourceType:'fichier'});
  const e=st.exporter(),j=JSON.stringify(e),img=Buffer.from(rd('planning-photo-exif6.jpg')).toString('base64');
  assert.equal(Object.keys(e.imports).length,2);assert.ok(j.includes(a.source.sha256)&&j.includes(a.source.localRef)&&j.includes('"disponibilite":"disponible"'));
  assert.ok(!j.includes(img.slice(100,180))&&!/data:|base64/i.test(j),'aucun blob');assert.ok(!j.includes('DUPONT'),'texte du PDF absent de la sauvegarde');assert.ok(j.length<8000,'taille '+j.length)});
t('restauration : fiches et hash conservés, sources « à vérifier » puis « disponible » si le fichier est retrouvé',async()=>{const src=load(),st=src.P.store();
  const a=(await src.I.importer(file('planning-photo-exif6.jpg'),{sourceType:'photo'})).record,b=(await src.I.importer(file('planning-galerie.png'),{sourceType:'galerie'})).record;
  const e=JSON.parse(JSON.stringify(st.exporter()));
  const dst=load();dst.A.files.set(a.source.sha256+'.jpg',Buffer.from(rd('planning-photo-exif6.jpg')));   // même appareil : la photo est encore là ; la PNG non
  assert.equal(dst.P.store().importer(e),2);dst.P.store().importsListe().forEach(r=>assert.equal(r.source.disponibilite,'a_verifier'));
  assert.deepEqual(await dst.I.verifierSources(),{disponible:1,a_verifier:1});
  assert.equal(dst.P.store().importLire(a.id).source.disponibilite,'disponible');assert.equal(dst.P.store().importLire(b.id).source.disponibilite,'a_verifier');
  assert.equal(dst.P.store().importLire(b.id).source.sha256,b.source.sha256,'hash conservé')});
t('ancienne sauvegarde sans bloc imports (lot A) : acceptée ; bloc invalide (référence arbitraire) : refusé',()=>{const {P}=load(),st=P.store();
  assert.equal(st.valider({version:1,plannings:{}}),0);
  assert.throws(()=>st.valider({plannings:{},imports:{x:{sourceType:'photo',source:{sha256:'a'.repeat(64),localRef:'android:../x.jpg'}}}}),/invalide/)});

console.log('Non-régression');
const MODS=['app-v37-periode.js','app-legal.js','app-evidence.js','app-v371-nuit.js','app-v37-control.js','app-v37-romi-reconciliation.js','app-v37-compteur.js','app-v37-assistant-paie.js','app-v37-dossier.js'];
async function snapshot(withPlanning){
  const S=fakeStorage(),A=fakeAndroid(),win={localStorage:S,crypto:globalThis.crypto,btoa:s=>Buffer.from(s,'binary').toString('base64'),MesHeuresAndroid:A};
  const ctx={window:win,document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{},setAttribute(){},appendChild(){}}),body:{appendChild(){}},head:{appendChild(){}}},
    localStorage:S,CustomEvent:function(){},crypto:globalThis.crypto,TextEncoder,TextDecoder,URL,Blob,Uint8Array,ArrayBuffer,console:{...console,info(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SC,'app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(R1.s)+'};DB.days='+JSON.stringify({...R1.days,...R2.days})+';DB.per={start:"2026-08-24",nb:2};'+
    'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,Q:mhQuatorzaine};',ctx);
  MODS.forEach(f=>vm.runInContext(fs.readFileSync(path.join(SC,f),'utf8'),ctx,{filename:f}));
  win.MH_ROMI={list:()=>[{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}]};
  if(win.MHAssistantPaie&&win.MHAssistantPaie.setRender)win.MHAssistantPaie.setRender(()=>{});
  if(withPlanning){vm.runInContext(CORE,ctx);vm.runInContext(IMP,ctx);win.mhLoadLib=async()=>{win.pdfjsLib=fakePdf(()=>[''])};
    for(const n of ['planning-photo-exif6.jpg','planning-galerie.png','planning-scan-image.pdf']){const r=await win.MHPlanningImport.importer(file(n),{sourceType:'fichier'});assert.equal(r.statut,'ok',n)}}
  const X=ctx.__x,days=Object.keys(X.DB.days).sort();
  return {snap:JSON.stringify({cd:days.map(k=>{const r=X.cd(k);return [k,r.amp,r.tte,r.pz,r.nuit,r.idaj,r.ir,r.iru,r.al]}),
    per:['2026-08-24','2026-09-21'].map(s=>{const R=X.calcPer(s,2);return {G:R.G,Q:R.Q,B:X.brutOf(R.G)}}),q:['2026-08-24','2026-11-23'].map(k=>X.Q.payPeriod(k)),
    smart:win.MHControl.analyze({end:'2026-10-08'}),romi:win.MHRomiRecon.analyze({start:'2026-08-24',end:'2026-09-20'}),
    paie:(({score,compte,verdict,checks})=>({score,compte,verdict,checks}))(win.MHAssistantPaie.data({today:'2026-10-08',start:'2026-08-24'})),
    compteur:win.MHCompteur.data({today:'2026-10-08',start:'2026-08-24'}),nuit:win.MHNuit.annee('2026',{today:'2026-10-08'}),db:X.DB}),keys:[...S.map.keys()]};
}
t('cd(), TTE, HS25, HS50, amplitude, quatorzaines, CP, IDAJ, repas, ROMI1, Paie, Smart Control, Compteur, nuit : identiques avec 3 imports enregistrés',async()=>{
  const a=await snapshot(false),b=await snapshot(true);assert.equal(b.snap,a.snap);assert.deepEqual(b.keys,['mh_planning_v372'],'seule la clé Planning est écrite')});
t('moteur : app-core.js identique au tag v37.1.1 ; modules Planning sans accès à DB, cd(), calcPer, save()',()=>{
  let old=null;try{old=cp.execSync('git show aa4f9b2:app/src/main/assets/web/scripts/app-core.js',{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26})}catch(e){}
  if(old!=null)assert.equal(fs.readFileSync(path.join(SC,'app-core.js'),'utf8'),old);
  ['app-v372-planning.js','app-v372-planning-import.js','app-v372-planning-ui.js'].forEach(f=>{const c=fs.readFileSync(path.join(SC,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    assert.ok(!/\bDB\b|\bcd\(|calcPer|brutOf|\bsave\(|mesheures_v3|eval\(|new Function|innerHTML\s*=\s*[^'"]*\.(texte|text)\b/.test(c),f)})});

console.log('Intégration (fichiers)');
const idx=fs.readFileSync(path.join(WEB,'index.html'),'utf8'),sw=fs.readFileSync(path.join(WEB,'sw.js'),'utf8'),v30=fs.readFileSync(path.join(SC,'app-v30.js'),'utf8');
const man=fs.readFileSync(path.join(REPO,'app/src/main/AndroidManifest.xml'),'utf8'),paths=fs.readFileSync(path.join(REPO,'app/src/main/res/xml/file_paths.xml'),'utf8');
t('onglet « 📋 Prévu » (6e bouton), section s-prevu, rendu branché ; « Planning » (Mois) inchangé',()=>{
  assert.ok(v30.includes(`<button data-nav-tab="prevu" onclick="tab('prevu')">📋<span>Prévu</span></button>`));assert.ok(v30.includes(`<button data-nav-tab="mois" onclick="tab('mois')">▦<span>Planning</span></button>`));
  assert.ok(/SECTIONS=\[[^\]]*'prevu'/.test(v30));assert.ok(v30.includes("else if(t==='prevu')safe(()=>window.MHPrevu?.render?.(),'prevu');"));assert.ok(idx.includes('<section id="s-prevu"'))});
t('3 scripts chargés après app-core.js et présents dans le cache du service worker',()=>{['app-v372-planning.js','app-v372-planning-import.js','app-v372-planning-ui.js'].forEach(f=>{
  const i=idx.indexOf('scripts/'+f+'?v=');assert.ok(i>idx.indexOf('scripts/app-core.js?v='),f);assert.ok(sw.includes("'./scripts/"+f+"?v="),f)})});
t('service worker : /planning-source/ jamais mis en cache (originaux servis par l’application)',()=>{assert.ok(sw.includes("if(u.pathname.indexOf('/planning-source/')>=0)return;"))});
t('manifeste : aucune permission CAMERA ni d’accès global au stockage ou aux médias ; FileProvider et chemin cache existants',()=>{
  const perms=[...man.matchAll(/uses-permission android:name="([^"]+)"/g)].map(m=>m[1]).sort();assert.deepEqual(perms,['android.permission.INTERNET','android.permission.POST_NOTIFICATIONS']);
  assert.ok(man.includes('androidx.core.content.FileProvider')&&man.includes('com.mesheures.app.fileprovider'));assert.ok(/<cache-path name="cache" path="\."\/>/.test(paths))});

(async()=>{for(const [n,f] of tests){try{await f();console.log('  ok  '+n)}catch(e){fails++;console.log('FAIL  '+n+'\n      '+(e&&e.message))}}
  console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.2.0-B (import planning) passent.');process.exit(fails?1:0)})();
