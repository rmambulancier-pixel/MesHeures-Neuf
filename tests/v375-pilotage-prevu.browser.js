#!/usr/bin/env node
/*
 * V37.5.0 — Pilotage de l'Accueil (app-v31-home.js) et calendrier « Prévu » (application réelle, Chromium).
 * Usage : NODE_PATH=… node tests/v375-pilotage-prevu.browser.js   · 0 = OK, 1 = échec, 2 = Playwright ou Chromium indisponible.
 *   Paquet « playwright » (navigateurs Playwright) ou, à défaut, « playwright-core » avec un Chromium du système :
 *   CHROMIUM_PATH=/usr/bin/chromium NODE_PATH=… node tests/v375-pilotage-prevu.browser.js
 *
 * Règles vérifiées :
 *  - le réalisé vient uniquement des journées réelles (DB.days) ; une prévision n'est jamais une heure réalisée ;
 *  - un service futur validé dans « Prévu » (Jour, Samu, Condo) alimente projection, restant planifié, services à venir,
 *    prochain service et quatorzaine ; Samu / Condo : service à durée inconnue (jamais les 12 h d'amplitude) ;
 *  - repos, congés, jour férié prévus : jamais comptés comme service ;
 *  - conflit entre fiches : exclu des calculs et signalé ;
 *  - journée réelle et prévision à la même date : la journée réelle prime, aucun double comptage ;
 *  - aucune écriture : DB.days et le stockage Planning sont identiques avant et après l'affichage.
 * Horloge fixée au vendredi 09/10/2026 10:00. Journées réelles : référence 24/08 → 09/10/2026 (6 journées en octobre, 42h50).
 */
let chromium;try{({chromium}=require('playwright'))}catch(e){try{({chromium}=require('playwright-core'))}catch(e2){console.log('SKIP : Playwright indisponible (ni playwright ni playwright-core)');process.exit(2)}}
const LAUNCH=process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{};
const http=require('http'),fs=require('fs'),path=require('path');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const NOW=new Date('2026-10-09T10:00:00'),TODAY='2026-10-09';
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(WEB,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
const REEL={};Object.entries({...R1.days,...R2.days}).forEach(([k,v])=>{if(k<=TODAY)REEL[k]=v});
const seed=extra=>({s:R1.s,days:{...REEL,...(extra||{})},periods:[],per:{start:'2026-09-21',nb:2},bul:{},bulletins:[],romi:{},cmp:{}});
const DONE=2570,DONE_DAYS=6,AVG=DONE/DONE_DAYS;              /* 42h50 sur 6 journées réelles d'octobre jusqu'au 09/10 */
const hm=m=>{m=Math.round(m);return Math.floor(m/60)+'h'+String(m%60).padStart(2,'0')};

/* Fiches validées, même chemin que l'application (MHPlanning.creer + store.enregistrer), une fiche par source. */
function creerFiches(fs_){const P=MHPlanning,st=P.store(),add=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  return fs_.map((o,n)=>{const imp=P.creerImport({sourceType:'fichier',format:'pdf',sha256:o.sha,localRef:'idb:'+o.sha+'.pdf',size:4321,originalFileName:'planning-'+n+'.pdf',importedAt:'2026-10-09T09:00:00Z'});st.importEnregistrer(imp);
    const p=P.creer({importeLe:imp.importedAt,source:{nom:'planning-'+n+'.pdf',mime:'application/pdf',taille:4321,sha256:o.sha},periode:{debut:o.debut,fin:add(o.debut,o.labels.length-1),origine:'ocr'},
      salarie:{nom:'ROTH Mickael',ligne:3,confirme:true},ligne:{ligne:3,nomLu:'ROTH Mickael',nomConf:95,cellules:o.labels.map((x,i)=>({colonne:i,texte:x,conf:95,couleur:'#1f7a3d'}))},
      ocr:{moteur:'tesseract.js',statut:'complet'},origine:{importId:imp.id,sourceSha256:o.sha,page:1,tableId:n,orientation:{exif:1,rotation180:false}}});
    const r=st.enregistrer(Object.assign(p,{id:'pl-'+o.sha.slice(0,12)+'-t'+n+'-'+o.debut}));st.importMaj(imp.id,{planningIds:[r.id],planningId:r.id});return r.id})}
const SHA=n=>(n.toString(16)+'e').repeat(64).slice(0,64);

async function scenario(b,{reel,fiches,now,parcours}){
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:412,height:915}});const pg=await ctx.newPage(),errs=[];
  pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());
  await pg.clock.setFixedTime(now||NOW);
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d));sessionStorage.setItem('s','1')}}catch(e){}},seed(reel));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(1500);
  if(fiches&&fiches.length)await pg.evaluate(creerFiches,fiches);
  /* parcours de l'utilisateur avant l'Accueil (ex. onglet « Mois », qui crée des « Repos » vides par gd() pour chaque jour affiché) */
  for(const t of parcours||[]){await pg.evaluate(t=>tab(t),t);await pg.waitForTimeout(300)}
  const r=await pg.evaluate(()=>{const vides=Object.entries(DB.days).filter(([k,d])=>k>'2026-10-09'&&d.t==='REPOS'&&!d.deb&&!d.fin&&!d.note&&!(d.p&&d.p.length)).length;const avant={db:localStorage.getItem('mesheures_v3'),plan:localStorage.getItem('mh_planning_v372'),days:JSON.stringify(DB.days)};
    if(typeof tab==='function')tab('home');window.MH31.renderHome();
    const home=document.querySelector('#s-home'),card=[...home.querySelectorAll('.mh31-card')].find(c=>/PILOTAGE/.test(c.textContent));
    const metric=l=>{const m=[...card.querySelectorAll('.mh31-metric')].find(x=>x.querySelector('span').textContent===l);return m?{v:m.querySelector('strong').textContent,s:m.querySelector('small').textContent}:null};
    const cap=card.querySelector('.mh31-bar-cap').textContent;
    return {vides,realise:(cap.match(/^(\S+) réalisées/)||[])[1],projection:metric('PROJECTION FIN DE MOIS'),restant:metric('RESTANT PLANIFIÉ'),aVenir:metric('SERVICES À VENIR'),
      travailles:metric('JOURS TRAVAILLÉS'),pilotage:card.innerText.replace(/\s+/g,' '),quat:(card.querySelector('.mh31-quat')||{innerText:''}).innerText.replace(/\s+/g,' '),accueil:home.innerText.replace(/\s+/g,' '),
      ecrit:avant.db!==localStorage.getItem('mesheures_v3')||avant.plan!==localStorage.getItem('mh_planning_v372')||avant.days!==JSON.stringify(DB.days)}});
  r.errs=errs;await ctx.close();return r;
}
const J7='Jour 7h';
(async()=>{
  await new Promise(r=>srv.listen(0,r));let b;
  try{b=await chromium.launch(LAUNCH)}catch(e){console.log('SKIP : Chromium introuvable ('+String(e.message).split('\n')[0]+'). Indiquer son chemin : CHROMIUM_PATH=/usr/bin/chromium');srv.close();process.exit(2)}
  console.log('Navigateur : '+b.version()+(LAUNCH.executablePath?' ('+LAUNCH.executablePath+')':' (navigateurs Playwright)'));
  try{
    console.log('Référence : journées réelles seules, aucun Prévu');
    let r=await scenario(b,{});
    ok(r.realise===hm(DONE)&&r.travailles.v===String(DONE_DAYS),'réalisé '+hm(DONE)+' sur '+DONE_DAYS+' journées réelles ('+r.realise+', '+r.travailles.v+')');
    ok(r.aVenir.v==='0'&&r.restant.v==='0h00'&&r.projection.v===hm(DONE),'date sans service : 0 service, restant 0h00, projection = réalisé ('+r.projection.v+')');
    ok(!r.ecrit&&!r.errs.length,'aucune écriture, aucune erreur');

    console.log('Un service futur dans Prévu (Jour 7h le 12/10)');
    r=await scenario(b,{fiches:[{sha:SHA(1),debut:'2026-10-12',labels:[J7]}]});
    ok(r.realise===hm(DONE),'réalisé inchangé ('+r.realise+') : une prévision n’est jamais une heure réalisée');
    ok(r.aVenir.v==='1','1 service à venir ('+r.aVenir.v+')');
    ok(r.restant.v==='7h00','restant planifié 7h00 ('+r.restant.v+')');
    ok(r.projection.v===hm(DONE+420),'projection = réalisé + 7h00 = '+hm(DONE+420)+' ('+r.projection.v+')');
    ok(/prochain service \(prévu\)\s+\S+\s+12\/10 · Jour 7h/i.test(r.accueil),'prochain service : prévu, 12/10 · Jour 7h ('+((r.accueil.match(/rochain service[^›]{0,40}/)||['absent'])[0])+')');
    ok(!r.ecrit&&!r.errs.length,'aucune écriture (DB.days, mesheures_v3, mh_planning_v372), aucune erreur');

    console.log('Plusieurs services futurs (Jour 7h, Samu, Condo m)');
    r=await scenario(b,{fiches:[{sha:SHA(2),debut:'2026-10-12',labels:[J7,'Samu','Condo m']}]});
    ok(r.aVenir.v==='3','3 services à venir ('+r.aVenir.v+')');
    ok(/3\s+services dont 2 sans horaires/.test(r.restant.s),'Samu et Condo : services à durée inconnue (« '+r.restant.s+' »)');
    ok(r.projection.v===hm(DONE+420+2*AVG),'projection = réalisé + 7h00 + 2 × moyenne réalisée = '+hm(DONE+420+2*AVG)+', jamais 2 × 12h d’amplitude ('+r.projection.v+')');
    ok(r.realise===hm(DONE)&&!r.ecrit,'réalisé inchangé, aucune écriture');

    console.log('Repos, congés et jour férié prévus');
    r=await scenario(b,{fiches:[{sha:SHA(3),debut:'2026-10-12',labels:['Repos','Congés 35','Jour Férié']}]});
    ok(r.aVenir.v==='0'&&r.restant.v==='0h00'&&r.projection.v===hm(DONE),'aucun service compté ('+r.aVenir.v+', '+r.restant.v+')');

    console.log('Conflit entre deux fiches validées (12/10 : Jour 7h contre Samu)');
    r=await scenario(b,{fiches:[{sha:SHA(4),debut:'2026-10-12',labels:[J7]},{sha:SHA(5),debut:'2026-10-12',labels:['Samu']}]});
    ok(r.aVenir.v==='0'&&r.restant.v==='0h00'&&r.projection.v===hm(DONE),'conflit exclu des calculs ('+r.aVenir.v+', '+r.restant.v+', '+r.projection.v+')');
    ok(/1\s+conflit/.test(r.pilotage),'conflit signalé dans le pilotage');

    console.log('Prévision identique sur deux fiches (même date, même valeur)');
    r=await scenario(b,{fiches:[{sha:SHA(6),debut:'2026-10-12',labels:[J7]},{sha:SHA(7),debut:'2026-10-12',labels:[J7]}]});
    ok(r.aVenir.v==='1'&&r.restant.v==='7h00','compté une seule fois, aucun doublon ('+r.aVenir.v+', '+r.restant.v+')');

    console.log('Journée réelle et prévision à la même date future (12/10)');
    r=await scenario(b,{reel:{'2026-10-12':{t:'T',deb:'08:00',fin:'15:30',p:[{d:'12:00',f:'12:30'}]}},fiches:[{sha:SHA(8),debut:'2026-10-12',labels:['Samu',J7]}]});
    ok(r.aVenir.v==='2','journée réelle du 12 + Jour 7h du 13 = 2 services ('+r.aVenir.v+')');
    ok(r.restant.v==='14h00'&&/2\s+services$/.test(r.restant.s),'12/10 : la journée réelle (7h00) prime sur « Samu », sans double comptage ; 13/10 : 7h00 ('+r.restant.v+', « '+r.restant.s+' »)');
    ok(r.realise===hm(DONE),'réalisé inchangé : une journée réelle future n’est pas réalisée');

    console.log('Prévisions sur des dates passées');
    r=await scenario(b,{fiches:[{sha:SHA(9),debut:'2026-10-01',labels:Array(9).fill(J7)}]});
    ok(r.realise===hm(DONE)&&r.travailles.v===String(DONE_DAYS),'dates passées : jamais comptées comme réalisées ('+r.realise+', '+r.travailles.v+')');
    ok(r.aVenir.v==='0','aucun service à venir ('+r.aVenir.v+')');

    console.log('Quatorzaine 05/10 → 18/10 (Jour 7h du 12 au 16/10)');
    r=await scenario(b,{fiches:[{sha:SHA(10),debut:'2026-10-12',labels:Array(5).fill(J7)}]});
    ok(!/Quatorzaine sans service planifié/.test(r.accueil),'plus d’alerte « Quatorzaine sans service planifié »');
    ok(/35h00 planifiées pour/.test(r.accueil),'quatorzaine : 35h00 planifiées (5 × 7h00)');
    ok(!r.ecrit,'aucune écriture');

    console.log('Après l’onglet « Mois » (cas réel du Pixel : « Repos » vides créés par gd() sur tous les jours affichés)');
    r=await scenario(b,{parcours:['mois','home'],fiches:[{sha:SHA(17),debut:'2026-10-12',labels:[J7,J7,'Samu']}]});
    ok(r.vides>=20,'l’onglet « Mois » a créé '+r.vides+' « Repos » vides sur les jours futurs d’octobre (comportement existant, inchangé)');
    ok(r.aVenir.v==='3'&&r.restant.v===hm(840+AVG)&&/3\s+services dont 1 sans horaires/.test(r.restant.s),'les « Repos » vides ne masquent pas « Prévu » : 3 services ('+r.aVenir.v+', '+r.restant.v+', « '+r.restant.s+' »)');
    ok(/prochain service \(prévu\)\s+\S+\s+12\/10 · Jour 7h/i.test(r.accueil),'prochain service : prévu, 12/10 · Jour 7h');
    ok(/Objectif de quatorzaine à confirmer\s+14h00 planifiées \+ 1\s+service sans durée connue/.test(r.accueil),'quatorzaine : 14h00 planifiées + 1 service sans durée connue');

    console.log('« Repos » saisi par l’utilisateur (avec une note) le 12/10, Jour 7h prévu le même jour');
    r=await scenario(b,{reel:{'2026-10-12':{t:'REPOS',p:[],note:'Repos posé'}},fiches:[{sha:SHA(18),debut:'2026-10-12',labels:[J7]}]});
    ok(r.aVenir.v==='0'&&r.restant.v==='0h00','une vraie saisie de repos prime sur « Prévu » ('+r.aVenir.v+', '+r.restant.v+')');

    console.log('Quatorzaine : gardes seules (Samu 12/10, Condo 13/10)');
    r=await scenario(b,{fiches:[{sha:SHA(11),debut:'2026-10-12',labels:['Samu','Condo m']}]});
    ok(/Objectif de quatorzaine non évaluable\s+2\s+services sans durée connue d’ici le 18\/10 : 46h00 restantes à confirmer/.test(r.accueil),'durée inconnue citée, objectif non évaluable, aucune heure inventée');
    ok(!/Quatorzaine sans service planifié|difficile/.test(r.accueil),'ni « sans service » ni « difficile »');

    console.log('Quatorzaine : Jour 7h les 12 et 13/10, Samu le 14/10');
    r=await scenario(b,{fiches:[{sha:SHA(12),debut:'2026-10-12',labels:[J7,J7,'Samu']}]});
    ok(/Objectif de quatorzaine à confirmer\s+14h00 planifiées \+ 1\s+service sans durée connue pour 46h00 restantes/.test(r.accueil),'14h00 planifiées + 1 service sans durée connue (Samu jamais converti en 12 h)');

    console.log('Quatorzaine : conflit seul le 12/10');
    r=await scenario(b,{fiches:[{sha:SHA(13),debut:'2026-10-12',labels:[J7]},{sha:SHA(14),debut:'2026-10-12',labels:['Samu']}]});
    ok(/Quatorzaine sans service planifié[^›]*aucun service prévu d’ici le 18\/10\.\s+1\s+conflit dans Prévu, non compté\./.test(r.accueil),'alerte de quatorzaine : conflit cité, non compté');
    ok(/1\s+conflit dans Prévu sur la quatorzaine, non compté/.test(r.quat),'bloc quatorzaine : conflit signalé');

    console.log('Quatorzaine à cheval sur deux mois (aujourd’hui 28/10, quatorzaine 19/10 → 01/11), conflit le 01/11');
    r=await scenario(b,{now:new Date('2026-10-28T10:00:00'),fiches:[{sha:SHA(15),debut:'2026-11-01',labels:[J7]},{sha:SHA(16),debut:'2026-11-01',labels:['Samu']}]});
    ok(/19\/10 → 01\/11/.test(r.quat),'quatorzaine 19/10 → 01/11');
    ok(!/conflit dans Prévu ce mois-ci/.test(r.pilotage),'conflit de novembre : pas compté dans le mois d’octobre');
    ok(/1\s+conflit dans Prévu sur la quatorzaine, non compté/.test(r.quat),'mais signalé dans le bloc quatorzaine');
    ok(!r.ecrit&&!r.errs.length,'aucune écriture, aucune erreur');
  }finally{await b.close();srv.close()}
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.5.0 (pilotage et Prévu) : OK');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
