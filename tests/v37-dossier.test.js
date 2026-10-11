#!/usr/bin/env node
/*
 * V37.0-D — Dossier probatoire : données, imprimable (HTML) et PDF signé.
 * Lancer : node tests/v37-dossier.test.js
 *
 * Le PDF est relu par un lecteur minimal intégré (structure, xref, flux, texte) : le test tourne aussi dans Termux,
 * sans outil externe. pdftotext est utilisé en plus lorsqu'il est installé.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process'),os=require('os');
const WEB=path.join(__dirname,'..','app/src/main/assets/web/scripts');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const clone=o=>JSON.parse(JSON.stringify(o));
let fails=0;
function t(name,fn){try{fn();console.log('  ok  '+name)}catch(e){fails++;console.log('FAIL  '+name+'\n      '+(e&&e.message))}}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}
const GEN='2026-09-21T08:00:00.000Z';
const ROMI_REF={periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15};

/* Application réelle (scripts de production) dans un contexte isolé. */
function load(days,opts={}){
  const writes=[],win={};
  const ls={getItem:()=>null,setItem:k=>writes.push(k),removeItem:k=>writes.push(k)};
  const doc={readyState:'complete',getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{}}),dispatchEvent(){},addEventListener(){},body:{appendChild(){}}};
  const ctx={window:win,document:doc,localStorage:ls,CustomEvent:function(){},console:{...console,info(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,
    Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error,Uint8Array};
  ctx.globalThis=ctx;vm.createContext(ctx);
  const extra=opts.db?Object.entries(opts.db).map(([k,v])=>'DB.'+k+'='+JSON.stringify(v)+';').join(''):'';
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-core.js'),'utf8')+
    ';DB.s={...DEF,...'+JSON.stringify(opts.s||fx.s)+'};DB.days='+JSON.stringify(days)+';'+extra+'mhNormalizeMealSettings();mhMigrateLegacyMealChoices();'+
    'function save(){MH30DataEngine.invalidate("save")}function mhRefresh(){}'+
    ';globalThis.__x={get DB(){return DB},cd,calcPer,brutOf,F,Q:mhQuatorzaine};',ctx);
  for(const f of ['app-legal.js','app-evidence.js','app-v371-nuit.js','app-v37-control.js','app-v37-romi-reconciliation.js'])   // V37.1 : MHNuit chargé comme dans index.html
  vm.runInContext(fs.readFileSync(path.join(WEB,f),'utf8'),ctx,{filename:f});
  if(opts.romi)win.MH_ROMI={list:()=>clone(opts.romi)};
  if(opts.freeze){vm.runInContext('Object.freeze(DB);',ctx);deepFreeze(ctx.__x.DB)}
  vm.runInContext(fs.readFileSync(path.join(WEB,'app-v37-dossier.js'),'utf8'),ctx,{filename:'app-v37-dossier.js'});
  return {M:win.MHDossier,X:ctx.__x,win,writes,ctx};
}
function build(days,opts={}){
  const L=load(days,opts),d=L.M.data({today:opts.today||'2026-10-07',generatedAt:GEN});
  const hash=crypto.createHash('sha256').update(L.M.canonical(d)).digest('hex');
  const bytes=L.M.pdf(d,{dataHash:hash}),html=L.M.html(d,{dataHash:hash});
  return {...L,d,hash,bytes,html,pdf:readPdf(bytes)};
}

const {readPdf}=require('./pdf-reader');
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
const shift=(days,n)=>{const out={};Object.entries(days).forEach(([k,v])=>{const d=new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);out[d]=v});return out};

/* ======================================================================= */
const R=build(fx.days,{romi:[ROMI_REF]});
const P=R.d.periodes.find(p=>p.debut==='2026-08-24');

console.log('PDF : structure');
t('PDF non vide, structure valide (xref exacte, flux de longueur exacte, fichier ASCII)',()=>{
  assert.ok(R.bytes.length>20000,'taille '+R.bytes.length);assert.ok(R.pdf.pages.every(p=>p.ops.length>20),'chaque page porte du texte')});
t('nombre de pages cohérent : Count = objets Page = bytes.pageCount = « Page i / N »',()=>{
  const N=R.bytes.pageCount;assert.ok(N>=2&&N<=6,'pages '+N);assert.equal(R.pdf.pagesDecl,N);assert.equal(R.pdf.pageObjs,N);
  R.pdf.pages.forEach((p,i)=>assert.ok(p.text.includes('Page '+(i+1)+' / '+N),'pied de page '+(i+1)))});
t('en-tête et pied de page sur chaque page (date FR, empreinte)',()=>{
  R.pdf.pages.forEach(p=>{assert.ok(p.text.includes('MesHeures · Dossier probatoire · généré le 21/09/2026 à '));assert.ok(p.text.includes('Empreinte des données (SHA-256) : '+R.hash.slice(0,16)+'…'))})});
t('aucun texte hors de la page A4 ni dans les marges (aucune ligne coupée)',()=>{
  R.pdf.pages.forEach(p=>p.ops.forEach(o=>{assert.ok(o.x>=39&&o.x<=556,'x '+o.x+' '+o.tx);assert.ok(o.y>=20&&o.y<=815,'y '+o.y+' '+o.tx)}))});
t('aucune valeur JS invalide (undefined, NaN, null, objet brut) dans le PDF, l’imprimable et le modèle',()=>{
  assert.ok(!BAD.test(R.pdf.text),R.pdf.text.match(BAD));assert.ok(!BAD.test(R.html.replace(/<[^>]+>/g,' ')));
  R.M.model(R.d,{dataHash:R.hash}).forEach(b=>JSON.stringify(b,(k,v)=>{if(typeof v==='string')assert.ok(!BAD.test(v),v);return v}))});
t('formats français : dates JJ/MM/AAAA, heures HHhMM, euros « 1 234,56 € », aucune date ISO',()=>{
  assert.ok(/\d{2}\/\d{2}\/\d{4}/.test(R.pdf.text));assert.ok(!/\d{4}-\d{2}-\d{2}/.test(R.pdf.text),'date ISO');
  assert.ok(R.pdf.text.includes('3 463,54 €'),'euros FR');assert.ok(!/\d\.\d{2} ?€/.test(R.pdf.text),'euro au point');assert.ok(/\b\d+h\d{2}\b/.test(R.pdf.text))});
t('accents conservés (WinAnsi), pas de « ? » de substitution',()=>{
  assert.ok(R.pdf.text.includes('Identité et configuration')&&R.pdf.text.includes('Relevés ROMI1')&&R.pdf.text.includes('Congé payé'));
  assert.ok(!/[A-Za-z]\?[a-z]/.test(R.pdf.text))});
t('pdftotext (si installé) relit le même contenu',()=>{
  let ok=false;try{cp.execFileSync('pdftotext',['-v'],{stdio:'ignore'});ok=true}catch(e){}
  if(!ok)return console.log('      (pdftotext absent : vérification ignorée)');
  const f=path.join(os.tmpdir(),'mh-v37d-'+process.pid+'.pdf');fs.writeFileSync(f,Buffer.from(R.bytes));
  const out=cp.execFileSync('pdftotext',['-layout',f,'-'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});fs.unlinkSync(f);
  ['167h55','173h25','32h00','30h55','150h15','Identité','Rapprochement paie','Smart Control'].forEach(x=>assert.ok(out.includes(x),x))});

console.log('Contenu principal');
t('les 13 sections sont présentes (PDF et imprimable ; V37.1 : 10. Travail de nuit ; V37.4 : 12. Plannings prévisionnels)',()=>{
  ['1. Identité et configuration','2. Synthèse Smart Control','3. Périodes de paie','4. Relevés ROMI1','5. Rapprochement paie','6. Bulletins importés',
   '7. Anomalies réglementaires','8. Constats enregistrés','9. Journées','10. Travail de nuit (art. 9)','11. Événements et chronologie',
   '12. Plannings prévisionnels (référence, pas une preuve)','13. Intégrité'].forEach(s=>{
    assert.ok(R.pdf.text.includes(s),'PDF '+s);assert.ok(R.html.includes(s.replace(/&/g,'&amp;')),'HTML '+s)})});
t('identité : embauche, ancienneté (moteur calcAnc), taux, CP ; nom absent → « non renseigné »',()=>{
  assert.ok(R.pdf.text.includes('09/09/2019'));assert.ok(R.pdf.text.includes('14,20 € / h'));assert.ok(/Salarié\nnon renseigné/.test(R.pdf.text));
  const a=R.ctx.calcAnc(fx.s.emb,'2026-10-07');assert.equal(R.d.identite.anciennete.pct,a.pct)});
t('toutes les journées sont listées (28), y compris CP et repos',()=>{
  assert.equal(R.d.journees.length,Object.keys(fx.days).length);assert.equal(R.d.journees.filter(j=>j.type==='CP').length,5);
  ['24/08/2026','08/09/2026','20/09/2026'].forEach(x=>assert.ok(R.pdf.text.includes(x)))});

console.log('Valeurs de référence 24/08/2026 → 20/09/2026');
t('TTE 167h55, amplitude 173h25, 18 jours, IDAJ 0h45',()=>{
  assert.equal(R.X.F(P.tte),'167h55');assert.equal(R.X.F(P.amp),'173h25');assert.equal(P.jours,18);assert.equal(R.X.F(P.idaj),'0h45');
  const row=R.pdf.text.split('\n');['167h55','173h25','0h45'].forEach(v=>assert.ok(row.includes(v),v))});
t('HS 25 % 32h00, HS 50 % 30h55',()=>{assert.equal(R.X.F(P.h25),'32h00');assert.equal(R.X.F(P.h50),'30h55');assert.ok(R.pdf.text.includes('32h00')&&R.pdf.text.includes('30h55'))});
t('paniers : 13 IR, 2 IRU (moteur), affichés « 13 / 2 »',()=>{assert.equal(P.ir,13);assert.equal(P.iru,2);assert.ok(R.pdf.text.includes('13 / 2'))});
t('valeurs identiques à l’écran Paie (calcPer + brutOf sur 2 quatorzaines)',()=>{
  const {G}=R.X.calcPer('2026-08-24',2),b=R.X.brutOf(G);
  ['tte','amp','h25','h50','idaj','nuit','ir','iru'].forEach(k=>assert.equal(P[k],G[k],k));assert.equal(P.jours,G.trav);
  assert.equal(P.brut,b.tot);assert.equal(P.netSal,b.netSal);assert.equal(P.netEst,b.netEst)});
t('aucun double comptage des repas : IR taxable une seule fois dans le brut, total versé = net + exonéré + IRU',()=>{
  assert.equal(Number(P.irTaxable.toFixed(2)),68.90);assert.equal(Number(P.irExonere.toFixed(2)),135.20);assert.equal(Number(P.iru_eur.toFixed(2)),19.38);
  assert.equal(Number(P.netEst.toFixed(2)),Number((P.netSal+P.irExonere+P.iru_eur).toFixed(2)));
  assert.equal((R.pdf.text.match(/68,90 €/g)||[]).length,1,'part taxable citée une fois');
  assert.ok(R.pdf.text.includes('La part taxable IR figure une seule fois, dans le brut'))});

console.log('Quatorzaines (mhQuatorzaine, ancre 19/05/2025)');
t('période 24/08 → 20/09 = quatorzaines 24/08 et 07/09, mois de paie septembre 2026',()=>{
  assert.deepEqual(P.quatorzaines.map(q=>q.debut),['2026-08-24','2026-09-07']);assert.equal(P.moisPaie,'2026-09');
  assert.equal(R.d.meta.ancreQuatorzaines,'2025-05-19');assert.ok(R.pdf.text.includes('Quatorzaines ancrées au 19/05/2025'))});
t('mois de paie présenté comme hypothèse à confirmer, jamais comme règle établie',()=>{
  assert.equal(R.d.meta.regleMoisDePaieStatut,'à confirmer');
  assert.ok(R.pdf.flat.includes('Rattachement au mois de paie : règle actuellement configurée selon le mois de fin du relevé de 4 semaines. Validation documentaire complémentaire requise.'));
  assert.ok(R.html.includes('Validation documentaire complémentaire requise.'));
  assert.ok(R.pdf.flat.includes('Colonne « Mois » : rattachement à confirmer'));
  assert.ok(!/payé sur le mois de sa date de fin/.test(R.pdf.flat+R.html),'ancienne affirmation absente')});
t('la date d’embauche ne déplace aucune quatorzaine (4 dates testées)',()=>{
  const ref=JSON.stringify(R.d.periodes.map(p=>[p.debut,p.fin,p.quatorzaines.map(q=>q.debut)]));
  ['2020-01-01','2026-08-26','2026-09-01','2025-05-20'].forEach(e=>{const B=build(fx.days,{s:{...fx.s,emb:e}});
    assert.equal(JSON.stringify(B.d.periodes.map(p=>[p.debut,p.fin,p.quatorzaines.map(q=>q.debut)])),ref,e)})});
t('réglage DB.s.anchor ignoré par le dossier',()=>{const B=build(fx.days,{s:{...fx.s,anchor:'2026-08-31'}});assert.deepEqual(B.d.periodes.map(p=>p.debut),R.d.periodes.map(p=>p.debut))});
t('période ancienne (52 semaines plus tôt) : mêmes valeurs, calendrier de paie conservé',()=>{
  const B=build(shift(fx.days,-364)),p=B.d.periodes;assert.equal(p.length,1);assert.equal(p[0].debut,'2025-08-25');assert.equal(p[0].moisPaie,'2025-09');
  assert.equal(B.X.F(p[0].tte),'167h55');assert.equal(B.X.F(p[0].amp),'173h25');assert.equal(p[0].enCours,false);assert.ok(B.pdf.text.includes('25/08 -> 21/09'))});
t('période actuelle : relevé marqué « en cours »',()=>{
  const B=build(fx.days,{today:'2026-09-15'});assert.equal(B.d.periodes[0].enCours,true);assert.ok(B.pdf.flat.includes('20/09 (en cours)'))});
t('aucune ligne de période vide : seuls les relevés portant au moins une journée',()=>{
  const B=build({...shift(fx.days,-364),...fx.days});assert.deepEqual(B.d.periodes.map(p=>p.debut),['2025-08-25','2026-08-24'])});

console.log('ROMI1');
t('ROMI1 présent : période, TTE, HS, présence, RC, comparaison TTE',()=>{
  const r=R.d.romi[0];assert.equal(R.d.romi.length,1);assert.equal(r.alignee,true);assert.equal(R.X.F(r.tteMesHeures),'167h55');assert.equal(r.presenceMesHeures,18);
  ['24/08 -> 20/09','150h15','39h25','16 / 18','174h09','TTE : écart 17h40'].forEach(x=>assert.ok(R.pdf.text.includes(x),x));
  assert.equal(r.hsMesHeures,P.h25+P.h50,'HS MesHeures = moteur')});
t('ROMI1 absent : « Aucun relevé ROMI1 enregistré. », aucune valeur inventée',()=>{
  const B=build(fx.days);assert.equal(B.d.romi.length,0);assert.ok(B.pdf.text.includes('Aucun relevé ROMI1 enregistré.'));assert.ok(!B.pdf.text.includes('150h15'))});
t('ROMI1 hors quatorzaines entières : HS « non comparable », aucune HS inventée',()=>{
  const B=build(fx.days,{romi:[{...ROMI_REF,periodStart:'2026-08-26',hsPeriodH:null}]}),r=B.d.romi[0];
  assert.equal(r.alignee,false);assert.equal(r.hsMesHeures,null);assert.equal(r.hsRomiH,null);
  assert.ok(B.pdf.text.includes('non comparable'));assert.ok(B.pdf.flat.includes('HS non comparables (période hors quatorzaines entières)'))});
t('relevé ROMI1 sans journée saisie : « aucune journée saisie », TTE MesHeures « — »',()=>{
  const B=build(fx.days,{romi:[{...ROMI_REF,periodStart:'2025-04-21',periodEnd:'2025-05-18'}]});
  assert.equal(B.d.romi[0].tteMesHeures,null);assert.ok(B.pdf.flat.includes('aucune journée saisie'))});

console.log('Smart Control');
t('reprend MHControl.analyze sans recalcul : score, conformes, à vérifier, critiques, niveau',()=>{
  const s=R.win.MHControl.analyze({end:'2026-10-07'}),m=R.d.smartControl;
  assert.equal(m.score,s.score);assert.equal(m.conformes,s.counts.ok);assert.equal(m.aVerifier,s.counts.warn);assert.equal(m.critiques,s.counts.bad);assert.equal(m.libelle,s.label);
  assert.ok(R.pdf.text.includes(s.score+' % des contrôles conformes'));assert.ok(R.pdf.text.includes(s.counts.ok+' conformes · '+s.counts.warn+' à vérifier · '+s.counts.bad+' critique'))});
t('principales anomalies du Smart Control listées',()=>{
  const B=build(fx.days,{today:'2026-09-20',romi:[ROMI_REF]});assert.ok(B.d.smartControl.points.length>0);
  assert.ok(B.pdf.text.includes('Durée hebdomadaire'));assert.ok(B.pdf.text.includes('TTE hebdomadaire de 58h20'))});
t('aucune donnée : « Données insuffisantes », aucun faux score',()=>{
  const B=build({});assert.equal(B.d.smartControl.score,null);assert.ok(B.pdf.text.includes('Données insuffisantes'));assert.ok(!/\d+ % des contrôles conformes/.test(B.pdf.text))});

console.log('Constats, anomalies, pauses');
const CONSTATS=[
  {id:'C18',jour_concerne:'2026-09-02',regle_violie:'Pause minimale de 20 min à contrôler dès 6 h de TTE.',article_source:'L3121-16',niveau:'critique',calcul_brut:40,calcul_montant_du:25.37,calcul_base:'ancien chiffrage'},
  {id:'C19',jour_concerne:'2026-09-01',regle_violie:'Amplitude > 12 h : vérifier le motif',article_source:'CCN art. 3',niveau:'a_verifier',calcul_brut:45,calcul_montant_du:12.34,calcul_base:'minutes au-delà de 12 h d’amplitude'}];
const C=build(fx.days,{db:{constats:CONSTATS,events:[{date:'2026-09-10',type:'Courrier',text:'Demande de régularisation envoyée'}]}});
t('constats enregistrés présents, triés par jour',()=>{assert.deepEqual(C.d.constats.map(c=>c.id),['C19','C18']);assert.ok(C.pdf.text.includes('Pause minimale de 20 min'))});
t('aucun faux montant de pause : constat pause « non chiffré » même si un ancien montant est stocké',()=>{
  assert.equal(C.d.constats.find(c=>c.id==='C18').montant,0);assert.ok(!C.pdf.text.includes('25,37'));assert.ok(C.pdf.text.includes('non chiffré'));
  assert.ok(C.pdf.text.includes('12,34 €'),'un constat chiffrable garde son montant')});
t('constats C18 non régénérés : sans constat enregistré, le dossier n’en crée aucun',()=>{
  assert.equal(R.d.constats.length,0);assert.ok(R.pdf.text.includes('Aucun constat enregistré.'));assert.equal(R.X.DB.constats,undefined)});
t('anomalies réglementaires (mhLegalAudit) : critiques et à vérifier, dates FR',()=>{
  assert.ok(R.d.anomalies.some(a=>a.niveau==='Critique')&&R.d.anomalies.some(a=>a.niveau==='À vérifier'));assert.ok(R.pdf.text.includes('Semaine > 48 h : 58h20'))});
t('événements dans la chronologie',()=>{assert.ok(C.pdf.text.includes('Courrier : Demande de régularisation envoyée'))});
t('pauses : uniquement celles saisies ; journée sans pause = « aucune »',()=>{
  const j=R.d.journees.find(x=>x.date==='2026-09-02');assert.deepEqual(j.pauses,[]);const k=R.d.journees.find(x=>x.date==='2026-08-24');assert.deepEqual(k.pauses,['12:20-12:50'])});

console.log('Bulletins et rapprochement');
const BUL={mois:'2026-09',brut:3200.5,net:2500.1,hNorm:151.67,hs25H:16,hs50H:4.33,habH:3,irN:11,iruN:3};
const Bb=build(fx.days,{db:{bulletins:[BUL]}});
t('bulletin importé listé (mois FR, euros FR, heures HHhMM, 11 IR / 3 IRU)',()=>{
  ['septembre 2026','3 200,50 €','2 500,10 €','151h40','16h00','4h20','11 / 3'].forEach(x=>assert.ok(Bb.pdf.text.includes(x),x))});
t('rapprochement = journal de preuves (mhV30MonthEvidence), sans recalcul',()=>{
  const ev=Bb.win.mhV30MonthEvidence().filter(r=>r.bulletin);assert.equal(Bb.d.rapprochement.length,ev.length);
  assert.equal(Bb.d.rapprochement[0].du,ev[0].calcMin);assert.equal(Bb.d.rapprochement[0].ecartEur,ev[0].ecartEur);assert.ok(Bb.pdf.text.includes('24/08, 07/09'))});
t('paniers MesHeures (13/2) et bulletin (11/3) restent indépendants',()=>{assert.equal(Bb.d.periodes.find(p=>p.debut==='2026-08-24').ir,13);assert.equal(Bb.d.bulletins[0].ir,11)});

console.log('Empreinte SHA-256 et lecture seule');
t('empreinte complète dans la section Intégrité, = SHA-256 du JSON canonique',()=>{
  assert.ok(R.pdf.text.includes(R.hash));assert.equal(crypto.createHash('sha256').update(JSON.stringify(R.d)).digest('hex'),R.hash)});
t('JSON canonique déterministe pour une même génération',()=>{const L=load(fx.days,{romi:[ROMI_REF]});
  assert.equal(L.M.canonical(L.M.data({today:'2026-10-07',generatedAt:GEN})),R.M.canonical(R.d))});
t('aucune écriture dans DB ni dans le stockage pendant l’export (DB gelé)',()=>{
  const B=build(fx.days,{freeze:true,romi:[ROMI_REF],db:{constats:CONSTATS,bulletins:[BUL]}});
  assert.ok(B.bytes.length>20000);assert.deepEqual(B.writes,[]);assert.ok(B.html.length>5000)});
t('DB identique avant / après (données sans constats ni événements : rien n’est créé)',()=>{
  const L=load(fx.days),before=JSON.stringify(L.X.DB);L.M.pdf(L.M.data(),{});L.M.html(L.M.data(),{});L.win.mhV30MonthEvidence();
  assert.equal(JSON.stringify(L.X.DB),before);assert.deepEqual(L.writes,[])});
t('window.DB n’est pas exposé',()=>{assert.equal(R.win.DB,undefined)});

console.log('Cas limites');
/* V37.4 : la section 12 (une ligne quand il n'y a pas de planning) remplit la page 1 ; « 13. Intégrité », section courte,
   reste entière et passe en page 2 (règle de mise en page V37.0-H). Avant V37.4 : une seule page. */
t('aucune donnée : PDF de deux pages, lisible, sans valeur invalide ; « 13. Intégrité » entière en page 2',()=>{
  const B=build({});assert.equal(B.bytes.pageCount,2);assert.ok(B.pdf.text.includes('Aucune journée enregistrée.'));assert.ok(B.pdf.text.includes('aucune journée enregistrée'));
  assert.ok(!BAD.test(B.pdf.text));assert.ok(B.pdf.text.includes('Page 1 / 2')&&B.pdf.text.includes('Page 2 / 2'));
  const p1=B.pdf.pages[0].text,p2=B.pdf.pages[1].text;
  assert.ok(p1.includes('12. Plannings prévisionnels')&&/planning prévisionnel indisponible|Aucun planning prévisionnel enregistré/.test(p1),'section 12 en page 1');
  assert.ok(p2.includes('13. Intégrité')&&p2.includes('Empreinte SHA-256 des données')&&p2.includes('JSON canonique du dossier'),'Intégrité entière en page 2')});
t('gros historique (2 ans) : pagination, en-tête de tableau répété, aucune page vide',()=>{
  let days={};for(let w=-52;w<52;w+=4)Object.assign(days,shift(fx.days,w*7));
  const B=build(days,{romi:[ROMI_REF]});assert.ok(B.bytes.pageCount>15,'pages '+B.bytes.pageCount);
  assert.equal(B.pdf.pagesDecl,B.bytes.pageCount);B.pdf.pages.forEach((p,i)=>assert.ok(p.ops.length>10,'page '+(i+1)));
  const heads=B.pdf.pages.filter(p=>p.ops.some(o=>o.bold&&o.tx==='Pauses saisies')).length;assert.ok(heads>5,'en-têtes répétés '+heads);
  assert.ok(!BAD.test(B.pdf.text))});
t('données incomplètes (journée sans fin, type inconnu, bulletin vide) : « non renseigné », jamais undefined',()=>{
  const days={...fx.days,'2026-09-19':{t:'T',deb:'08:00',p:[]},'2026-09-20':{t:'XYZ'}};
  const B=build(days,{db:{bulletins:[{mois:'2026-09'}],events:[{date:'2026-09-01'}]}});assert.ok(!BAD.test(B.pdf.text),B.pdf.text.match(BAD));assert.ok(B.pdf.text.includes('non renseigné'))});
t('caractères spéciaux (parenthèses, antislash, emoji) correctement échappés',()=>{
  const B=build(fx.days,{db:{events:[{date:'2026-09-02',type:'Note',text:'Appel (RH) \\ chef 📞 ok'}]}});assert.ok(B.pdf.text.includes('Appel (RH) \\ chef  ok'))});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.0-D passent.');
process.exit(fails?1:0);
