#!/usr/bin/env node
/*
 * V37.5.0 — Export PDF des constats : aucun constat réparti entre deux pages, ordre et champs conservés, textes longs.
 * Lancer : node tests/v375-constats-pdf.test.js
 *
 * Référence : PDF réel validé le 11/10/2026 sur le Pixel, 139 constats sur 24 pages, numérotés 1 à 139.
 * Le PDF est relu par tests/pdf-reader.js (structure, xref, flux de longueur exacte, texte des opérateurs Tj).
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const {readPdf}=require('./pdf-reader');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+(e&&e.message))}}

/* Application réelle (scripts de production) dans un contexte isolé. window = objet global, comme dans le navigateur
   (createFromAudit lit MH_LEGAL, déclaré par app-legal.js sur window). */
function load(days){
  const out={alerts:[],files:[]};
  const ls={getItem:()=>null,setItem(){},removeItem(){}};
  const doc={readyState:'complete',getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{}}),dispatchEvent(){},addEventListener(){},body:{appendChild(){}}};
  const ctx={document:doc,localStorage:ls,CustomEvent:function(){},console:{...console,info(){},warn(){},error(){}},setTimeout:()=>0,setInterval:()=>0,
    alert:m=>out.alerts.push(String(m)),Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error,Uint8Array};
  ctx.globalThis=ctx;ctx.window=ctx;const win=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(fx.s)+'};DB.days='+JSON.stringify(days||{})+';mhNormalizeMealSettings();mhMigrateLegacyMealChoices();'+
    'function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB}};',ctx);
  for(const f of ['app-legal.js','app-evidence.js'])vm.runInContext(fs.readFileSync(path.join(WEB,f),'utf8'),ctx,{filename:f});
  win.mhDownloadBinary=(name,bytes,type)=>{out.files.push({name,bytes,type});return 'browser'};
  return {win,ctx,out,X:ctx.__x};
}
const L=load();
const GEN=new Date('2026-10-11T10:58:22Z');
const pdfDe=(list,o)=>{const b=L.win.mhConstatsPdfBytes(list,{generated:GEN,...(o||{})});return {b,P:readPdf(b)}};

/* Constats de forme réelle (champs de createFromAudit). */
const REGLES=['Pause minimale de 20 min à contrôler dès 6 h de TTE.','TTE > 10 h : dépassement quotidien encadré à justifier.','Amplitude > 12 h : indemnité de dépassement (IDAJ) à vérifier.'];
function constat(i,extra){
  const j=String(1+(i%28)).padStart(2,'0'),s=String(i%60).padStart(2,'0');
  return {id:'C18-'+(0x10000000+i*7919).toString(16).slice(-8),jour_concerne:'2025-'+String(5+Math.floor(i/28)).padStart(2,'0')+'-'+j,
    regle_violie:REGLES[i%3],article_source:i%2?'Accord transport sanitaire du 16/06/2016, art. 4':'Code du travail, art. L3121-16',
    calcul_brut:(i%5)*30,calcul_montant_du:Math.round((i%5)*1477)/100,date_constat:'2026-09-12T18:40:'+s+'.'+String(100+i).slice(-3)+'Z',...(extra||{})};
}
const LISTE=Array.from({length:139},(_,i)=>constat(i));
const CHAMPS=['Jour concerne : ','Regle : ','Source : ','Minutes calculees : ','Montant estime : ','Date de creation : '];

/* Découpe le PDF relu en constats : page de chaque ligne, pour vérifier qu'un constat ne change jamais de page. */
function constatsDuPdf(P){
  const res=[];let cur=null;
  P.pages.forEach((pg,pi)=>pg.ops.forEach(o=>{
    if(/^MesHeures - Page \d+ \/ \d+$/.test(o.tx))return;
    const m=o.tx.match(/^CONSTAT (\d+) - (.*?)( \(suite\))?$/);
    if(m&&!m[3]){cur={n:+m[1],id:m[2],lignes:[],pages:new Set([pi])};res.push(cur);return}
    if(m&&m[3]){if(cur)cur.pages.add(pi);return}
    if(cur&&o.tx!==''&&!/^Document genere|^Les estimations doivent/.test(o.tx)){cur.lignes.push(o.tx);cur.pages.add(pi)}
  }));
  return res;
}

console.log('Structure et référence réelle (139 constats)');
const R=pdfDe(LISTE);
t('PDF valide : xref exacte, flux de longueur exacte, fichier ASCII, Count = objets Page',()=>{
  assert.equal(R.P.pagesDecl,R.P.pageObjs);assert.equal(R.P.pagesDecl,R.b.pageCount)});
t('139 constats → 24 pages, comme le PDF validé (5 constats en page 1, puis 6 par page)',()=>{
  assert.equal(R.b.pageCount,24);assert.equal(R.b.constatCount,139);
  const debuts=R.P.pages.slice(1).map(p=>p.ops[0].tx.match(/^CONSTAT (\d+) - /)[1]);
  assert.deepEqual(debuts.map(Number),Array.from({length:23},(_,i)=>6+6*i))});
t('numéros continus de 1 à 139, chaque page porte « Page i / N »',()=>{
  const c=constatsDuPdf(R.P);assert.deepEqual(c.map(x=>x.n),Array.from({length:139},(_,i)=>i+1));
  R.P.pages.forEach((p,i)=>assert.ok(p.text.includes('MesHeures - Page '+(i+1)+' / 24'),'pied de page '+(i+1)))});
t('RÉGRESSION : aucun constat réparti entre deux pages (date de création comprise)',()=>{
  const c=constatsDuPdf(R.P);c.forEach(x=>{assert.equal(x.pages.size,1,'constat '+x.n+' sur les pages '+[...x.pages].map(p=>p+1));
    assert.ok(x.lignes.some(l=>l.startsWith('Date de creation : ')),'date du constat '+x.n)})});
t('tous les champs de chaque constat sont présents, avec les valeurs d’origine, dans l’ordre des dates de création',()=>{
  const c=constatsDuPdf(R.P),tri=LISTE.slice().sort((a,b)=>a.date_constat.localeCompare(b.date_constat));
  c.forEach((x,i)=>{const s=tri[i];assert.equal(x.id,s.id,'ordre '+(i+1));
    CHAMPS.forEach(ch=>assert.ok(x.lignes.some(l=>l.startsWith(ch)),'champ '+ch+' du constat '+x.n));
    const v=x.lignes.join(' ');
    [s.jour_concerne,s.regle_violie,s.article_source,'Minutes calculees : '+s.calcul_brut,s.date_constat].forEach(w=>assert.ok(v.includes(w),'valeur '+w+' (constat '+x.n+')'));
    assert.ok(v.includes('Montant estime : '+s.calcul_montant_du.toFixed(2).replace('.',',')+' €'),'montant du constat '+x.n)})});
t('aucune ligne sous le pied de page ni hors de la largeur prévue',()=>{
  R.P.pages.forEach(p=>p.ops.forEach(o=>{if(!/^MesHeures - Page/.test(o.tx)){assert.ok(o.y>=790-49*14,'y '+o.y);assert.ok(o.tx.length<=88||/^CONSTAT /.test(o.tx),o.tx)}}))});
t('la liste d’origine n’est pas modifiée (copie triée, aucun champ ajouté)',()=>{
  const l=[constat(2),constat(1)],avant=JSON.stringify(l);L.win.mhConstatsPdfBytes(l,{generated:GEN});assert.equal(JSON.stringify(l),avant)});

console.log('Textes longs et cas limites');
t('règle longue (600 car.) : retour à la ligne, constat entier sur une page, texte complet',()=>{
  const long='Dépassement '+'de l’amplitude journalière autorisée '.repeat(16)+'FIN.';
  const {P}=pdfDe(Array.from({length:12},(_,i)=>constat(i,i===4?{regle_violie:long}:{})));
  const c=constatsDuPdf(P);c.forEach(x=>assert.equal(x.pages.size,1,'constat '+x.n));
  const v=c[4].lignes.join(' ');assert.ok(v.replace(/\s+/g,' ').includes(('Regle : '+long).replace(/\s+/g,' ')),'texte complet');
  P.pages.forEach(p=>p.ops.forEach(o=>assert.ok(o.tx.length<=88||/^CONSTAT /.test(o.tx),o.tx.length)))});
t('mot sans espace de 300 caractères : découpé à 88, rien ne sort de la page, rien n’est perdu',()=>{
  const mot='X'.repeat(300);const {P}=pdfDe([constat(0,{article_source:mot})]);
  const lignes=P.pages[0].ops.map(o=>o.tx);assert.ok(lignes.every(l=>l.length<=88),'longueur');
  assert.equal(lignes.join('').split('X').length-1,300)});
t('constat plus long qu’une page : suite annoncée sur la page suivante, aucune ligne perdue ni hors page',()=>{
  const enorme=Array.from({length:140},(_,i)=>'mot'+i+' commentaire détaillé').join(' ');
  const liste=[constat(0),constat(1,{regle_violie:enorme}),constat(2)];const {b,P}=pdfDe(liste);
  assert.ok(b.pageCount>=3,'pages '+b.pageCount);
  const c=constatsDuPdf(P);assert.deepEqual(c.map(x=>x.n),[1,2,3]);
  assert.equal(c[0].pages.size,1);assert.equal(c[2].pages.size,1);
  assert.ok(P.text.includes('CONSTAT 2 - '+liste[1].id+' (suite)'),'suite annoncée');
  const v=c[1].lignes.join(' ');for(let i=0;i<140;i++)assert.ok(v.includes('mot'+i+' commentaire'),'mot'+i);
  assert.ok(v.includes('Date de creation : '+liste[1].date_constat));
  P.pages.forEach(p=>p.ops.forEach(o=>{if(!/^MesHeures - Page/.test(o.tx))assert.ok(o.y>=790-49*14,'y '+o.y)}))});
t('aucun constat : une page, « Aucun constat enregistre. »',()=>{
  const {b,P}=pdfDe([]);assert.equal(b.pageCount,1);assert.ok(P.text.includes('Nombre de constats : 0'));assert.ok(P.text.includes('Aucun constat enregistre.'))});
t('caractères spéciaux : accents, €, apostrophe typographique, parenthèses et barre oblique inverse conservés',()=>{
  const r='Règle (été) : 1\\2 l’équipe — « œuvre » 3 €';const {P}=pdfDe([constat(0,{regle_violie:r})]);
  assert.ok(P.text.includes('Regle : Règle (été) : 1\\2 l’équipe — '),P.text.slice(0,400));assert.ok(P.text.includes('œuvre'))});
t('champs absents ou dates manquantes : libellés « non renseigné », tri sans erreur',()=>{
  const {P}=pdfDe([{id:'A'},{id:'B',date_constat:'2026-01-01T00:00:00Z'}]);
  assert.ok(P.text.includes('Jour concerne : non renseigne'));assert.ok(P.text.includes('Date de creation : non renseignee'));
  assert.deepEqual(constatsDuPdf(P).map(x=>x.id),['A','B'])});
t('volumineux : 2 000 constats, tous présents et jamais coupés',()=>{
  const l=Array.from({length:2000},(_,i)=>constat(i,{date_constat:'2026-'+String(1+i%12).padStart(2,'0')+'-01T00:00:'+String(i%60).padStart(2,'0')+'.'+String(i).padStart(4,'0')+'Z'}));
  const {b,P}=pdfDe(l);const c=constatsDuPdf(P);assert.equal(c.length,2000);assert.equal(b.constatCount,2000);
  assert.deepEqual(c.map(x=>x.n),Array.from({length:2000},(_,i)=>i+1));c.forEach(x=>assert.equal(x.pages.size,1,'constat '+x.n))});

console.log('Bouton « Exporter les constats » (application réelle)');
t('mhV30ConstatsPDF : constats de l’application, PDF téléchargé (mhDownloadBinary), aucune fenêtre ouverte',()=>{
  const A=load(fx.days);const ouvert=[];A.win.open=()=>{ouvert.push(1);return null};
  A.win.mhV30ConstatsPDF();
  assert.equal(ouvert.length,0);assert.equal(A.out.files.length,1);const f=A.out.files[0];
  assert.ok(/^MesHeures-constats-\d{4}-\d{2}-\d{2}\.pdf$/.test(f.name),f.name);assert.equal(f.type,'application/pdf');
  const P=readPdf(f.bytes),n=A.X.DB.constats.length;assert.ok(n>0,'des constats sont créés depuis la référence');
  assert.equal(constatsDuPdf(P).length,n);assert.ok(P.text.includes('Nombre de constats : '+n));
  assert.ok(/PDF genere : \d+ constat/.test(A.out.alerts.pop()))});
t('source : plus de window.open ni de print() dans l’export des constats',()=>{
  const s=fs.readFileSync(path.join(WEB,'app-evidence.js'),'utf8'),i=s.indexOf('window.mhV30ConstatsPDF='),f=s.slice(i,s.indexOf('async function deriveKey',i));
  assert.ok(i>0&&!/window\.open|\.print\(/.test(f))});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.5.0 (PDF des constats) passent.');process.exit(fails?1:0);
