#!/usr/bin/env node
/*
 * V37.2.0-D — 📋 Prévu : sous-onglets 📅 Planning | 🔎 OCR / Validation, calendrier du prévisionnel validé.
 * Application réelle (Chromium), horloge figée au 09/10/2026 10h00. Fiches créées comme par la validation C3 (cas réel
 * reproduit : planning A 05/10 → 04/11 page 2, planning B 02/11 → 02/12 page 1 ; libellés de la ligne de l'utilisateur).
 * Usage : NODE_PATH=… node tests/v372-planning-calendrier.browser.js · 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const NOW=new Date('2026-10-09T10:00:00');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(WEB,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
const seed=()=>({s:R1.s,days:{...R1.days,...R2.days},periods:[],per:{start:'2026-09-21',nb:2},bul:{},bulletins:[],romi:{},cmp:{}});
const L={J:'Jour 7h',R:'Repos',C:'Condo m',F:'Jour Férié',K:'Congés 35',S:'Samu'};
const A_LAB='JJJJJRRJJJJJRRJJJJJRRJJJJJRRJJJ'.split('').map(x=>L[x]),B_LAB='JJJRRCCRRFJJRRJJJJJRRJJJJJRRJJJ'.split('').map(x=>L[x]);
const SHA='c6'.repeat(32),SHA2='d7'.repeat(32);
/* fiches validées (même chemin que la validation C3 : MHPlanning.creer + store.enregistrer, avec l'origine) */
function creerFiches(d){const P=MHPlanning,st=P.store(),add=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const imp=P.creerImport({sourceType:'fichier',format:'pdf',sha256:d.sha,localRef:'idb:'+d.sha+'.pdf',size:4321,originalFileName:'planning-scan.pdf',importedAt:'2026-10-09T09:00:00Z'});st.importEnregistrer(imp);
  const f=(o)=>{const p=P.creer({importeLe:imp.importedAt,source:{nom:o.nom||'planning-scan.pdf',mime:'application/pdf',taille:4321,sha256:o.sha||d.sha},periode:{debut:o.debut,fin:add(o.debut,o.labels.length-1),origine:'ocr'},
    salarie:{nom:'ROTH Mickael',ligne:3,confirme:true},ligne:{ligne:3,nomLu:'ROTH Mickael',nomConf:95,cellules:o.labels.map((x,i)=>({colonne:i,texte:x,conf:95,couleur:x==='Repos'?'#8f8f96':x==='Samu'?'#8c3c96':x==='Condo m'?'#0f3c37':x==='Congés 35'?'#e0a83a':'#1f7a3d'}))},
    ocr:{moteur:'tesseract.js',statut:'complet'},origine:{importId:o.importId===null?null:imp.id,sourceSha256:o.sha||d.sha,page:o.page,tableId:o.tableId,orientation:{exif:1,rotation180:!!o.ret}}});
    return st.enregistrer(Object.assign(p,{id:'pl-'+(o.sha||d.sha).slice(0,12)+'-t'+o.tableId+'-'+o.debut}))};
  const B=f({debut:'2026-11-02',labels:d.B,page:1,tableId:0}),A=f({debut:'2026-10-05',labels:d.A,page:2,tableId:1,ret:true});
  st.importMaj(imp.id,{planningIds:[B.id,A.id],planningId:B.id});return {A:A.id,B:B.id,imp:imp.id}}
async function open(b,W,theme,avecFiches){
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/planning-source|Failed to load resource/.test(m.text()))errs.push(m.text())});
  pg.__answers=[];pg.__dialogs=[];pg.on('dialog',d=>{pg.__dialogs.push(d.message());const a=pg.__answers.shift();a===false?d.dismiss():d.accept()});
  await pg.clock.setFixedTime(NOW);
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},{db:seed(),t:theme});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2000);
  let ids=null;if(avecFiches)ids=await pg.evaluate(creerFiches,{sha:SHA,A:A_LAB,B:B_LAB});
  return {ctx,pg,errs,ids};
}
const tabPrevu=async pg=>{await pg.locator('#mhV30Nav [data-nav-tab="prevu"]').click();await pg.waitForTimeout(250)};
const txt=pg=>pg.evaluate(()=>document.getElementById('s-prevu').innerText);
const cellule=(pg,d)=>pg.evaluate(d=>{const e=document.querySelector('#s-prevu .mh372-j[data-date="'+d+'"]');return e?{etat:e.dataset.etat,texte:e.innerText.replace(/\s+/g,' ').trim(),hors:e.dataset.hors}:null},d);
const moteur=pg=>pg.evaluate(()=>JSON.stringify({cd:Object.keys(DB.days).sort().map(k=>{const r=cd(k);return [k,r.tte,r.amp,r.pz,r.nuit,r.idaj,r.ir,r.iru]}),
  per:calcPer('2026-08-24',2).G,brut:brutOf(calcPer('2026-08-24',2).G),sc:MHControl.analyze({end:'2026-10-08'}).counts,days:JSON.parse(localStorage.getItem('mesheures_v3')).days}));
const overflow=(pg,sel)=>pg.evaluate(sel=>{const root=document.querySelector(sel),out=[];if(!root)return ['absent'];
  if(document.documentElement.scrollWidth>innerWidth+1)out.push('page '+document.documentElement.scrollWidth+' px');
  [...root.querySelectorAll('*')].forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&e.offsetParent&&r.right>innerWidth+1)out.push(e.tagName+'.'+String(e.className).slice(0,20))});return out.slice(0,4)},sel);

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    console.log('Sans fiche validée : OCR / Validation par défaut');
    {const {ctx,pg,errs}=await open(b,412,'light',false);await tabPrevu(pg);const t=await txt(pg);
      ok(await pg.locator('#s-prevu [data-k="onglet-ocr"][aria-selected="true"]').count()===1&&/Aucun planning enregistré/.test(t)&&/Importer un planning/.test(t),'aucune fiche : sous-onglet 🔎 OCR / Validation ouvert, import proposé');
      await pg.locator('#s-prevu [data-k="onglet-planning"]').click();await pg.waitForTimeout(100);
      ok(/Aucun planning prévisionnel validé/.test(await txt(pg))&&await pg.locator('#s-prevu .mh372-j').count()===0,'📅 Planning sans fiche : message, aucun jour inventé');
      ok(!errs.length,'0 erreur JS');await ctx.close()}

    console.log('📅 Planning : calendrier du prévisionnel validé (cas réel A + B)');
    {const {ctx,pg,errs,ids}=await open(b,412,'dark',true);const avant=await moteur(pg);await tabPrevu(pg);
      ok(await pg.locator('#s-prevu [data-k="onglet-planning"][aria-selected="true"]').count()===1&&await pg.locator('#s-prevu [data-k="calendrier"]').count()===1,'fiches validées : 📅 Planning est la vue principale');
      ok(/PRÉVU/.test(await txt(pg))&&/ne prouve pas une heure travaillée/.test(await txt(pg)),'« PRÉVU » et « ne prouve pas une heure travaillée » affichés');
      ok(await pg.locator('#s-prevu [data-k="mois-titre"]').innerText()==='Octobre 2026','mois du jour : Octobre 2026');
      ok(await pg.locator('#s-prevu .mh372-j').count()===35&&await pg.locator('#s-prevu .mh372-dow').count()===7,'grille : 5 semaines × 7 jours, du lundi au dimanche');
      ok((await cellule(pg,'2026-10-12')).texte==='12 Jour 7h'&&(await cellule(pg,'2026-10-10')).texte==='10 Repos'&&(await cellule(pg,'2026-10-04')).etat==='aucun','octobre : 12 « Jour 7h », 10 « Repos », 04 rien de prévu');
      ok((await cellule(pg,'2026-10-09')).etat==='prévu'&&await pg.locator('#s-prevu .mh372-j[data-aujourdhui="1"]').count()===1,'aujourd’hui (09/10) repéré');
      await pg.locator('#s-prevu [data-k="mois-suiv"]').click();await pg.waitForTimeout(100);
      ok(await pg.locator('#s-prevu [data-k="mois-titre"]').innerText()==='Novembre 2026','› : Novembre 2026');
      const c3=await cellule(pg,'2026-11-03'),c7=await cellule(pg,'2026-11-07'),c11=await cellule(pg,'2026-11-11'),c5=await cellule(pg,'2026-11-05');
      ok(c3.etat==='identique'&&/Jour 7h/.test(c3.texte)&&/×2/.test(c3.texte),'03/11 : chevauchement identique (×2), « Jour 7h »');
      ok(/Condo m/.test(c7.texte)&&/Jour f/i.test(c11.texte)&&/Repos/.test(c5.texte),'07/11 « Condo m », 11/11 « Jour férié », 05/11 « Repos » (planning B)');
      ok(/05\/10\/2026 → 04\/11\/2026[\s\S]*page 2[\s\S]*02\/11\/2026 → 02\/12\/2026[\s\S]*page 1/.test(await pg.locator('#s-prevu [data-k="sources"]').innerText()),'novembre : les deux plannings sources listés (période, fichier, page)');
      await pg.locator('#s-prevu .mh372-j[data-date="2026-11-03"]').click();await pg.waitForTimeout(100);
      const d3=await pg.locator('#s-prevu [data-k="jour-detail"]').innerText();
      ok(/Mardi 03\/11\/2026/.test(d3)&&/PRÉVISIONNEL/.test(d3)&&/Même valeur dans 2 plannings/.test(d3)&&(d3.match(/Prévu :\s*Jour 7h/g)||[]).length===2,'détail 03/11 : prévisionnel, deux provenances de la même valeur');
      ok(/page 2/.test(d3)&&/page 1/.test(d3)&&/05\/10\/2026 → 04\/11\/2026/.test(d3)&&/02\/11\/2026 → 02\/12\/2026/.test(d3)&&/Durée prévue\s*7h/.test(d3)&&/validé le/.test(d3),'détail : durée, source, page, tableau, période, statut de validation');
      ok(!/travaillé le|journée travaillée|heures réelles/i.test(d3)&&/ne prouve pas/.test(d3),'jamais présenté comme travaillé');
      await pg.locator('#s-prevu .mh372-j[data-date="2026-11-07"]').click();await pg.waitForTimeout(100);
      ok(/Horaires prévus\s*08:00 → 20:00 \(amplitude 12h\)/.test(await pg.locator('#s-prevu [data-k="jour-detail"]').innerText()),'07/11 « Condo m » : horaires 08:00 → 20:00 du dictionnaire');
      await pg.locator('#s-prevu [data-k="mois-suiv"]').click();await pg.waitForTimeout(100);
      ok(await pg.locator('#s-prevu [data-k="mois-titre"]').innerText()==='Décembre 2026'&&(await cellule(pg,'2026-12-02')).etat==='prévu'&&(await cellule(pg,'2026-12-03')).etat==='aucun','› : Décembre 2026 (01-02 prévus, 03 rien)');
      await pg.locator('#s-prevu [data-k="mois-suiv"]').click();await pg.waitForTimeout(100);
      ok(await pg.locator('#s-prevu [data-k="mois-titre"]').innerText()==='Janvier 2027'&&/Aucun planning validé ne couvre ce mois/.test(await txt(pg)),'› : Janvier 2027 (changement d’année), rien de prévu');
      await pg.locator('#s-prevu [data-k="aujourdhui"]').click();await pg.waitForTimeout(100);
      ok(await pg.locator('#s-prevu [data-k="mois-titre"]').innerText()==='Octobre 2026'&&/Vendredi 09\/10\/2026/.test(await txt(pg)),'Aujourd’hui : retour en octobre, détail du 09/10');
      /* conflit : un autre fichier prévoit « Samu » le 20/11 alors que B prévoit « Jour 7h » */
      await pg.evaluate(d=>{const P=MHPlanning,st=P.store();const p=P.creer({source:{nom:'autre.jpg',mime:'image/jpeg',taille:1,sha256:d},periode:{debut:'2026-11-20',fin:'2026-11-20',origine:'ocr'},
        salarie:{nom:'ROTH Mickael',ligne:0,confirme:true},ligne:{ligne:0,nomLu:'ROTH Mickael',cellules:[{colonne:0,texte:'Samu',conf:90}]},origine:{sourceSha256:d,page:null,tableId:0}});st.enregistrer(Object.assign(p,{id:'pl-autre'}))},SHA2);
      await pg.evaluate(()=>MHPrevu.jour('2026-11-20'));await pg.waitForTimeout(100);
      const c20=await cellule(pg,'2026-11-20'),d20=await pg.locator('#s-prevu [data-k="jour-detail"]').innerText();
      ok(c20.etat==='conflit'&&/⚠ Conflit/.test(c20.texte),'20/11 : ⚠ Conflit prévisionnel dans la case');
      ok(/Aucune n’est retenue automatiquement/.test(d20)&&/Prévu :\s*Jour 7h/.test(d20)&&/Prévu :\s*Samu/.test(d20)&&/autre\.jpg/.test(d20)&&/planning-scan\.pdf/.test(d20),'détail du conflit : les deux valeurs et leurs sources, aucune retenue');
      ok(/1 conflit/.test(await txt(pg)),'conflit signalé en tête du mois');
      /* fiche depuis le calendrier, puis suppression : le calendrier suit */
      await pg.locator('#s-prevu .mh372-j[data-date="2026-11-03"]').click();await pg.waitForTimeout(80);
      await pg.locator('#s-prevu [data-k="valeur"][data-planning="'+ids.A+'"] button').click();await pg.waitForTimeout(100);
      ok(await pg.locator('#s-prevu [data-k="fiche-planning"]').count()===1&&/05\/10\/2026 au 04\/11\/2026/.test(await txt(pg)),'« Ouvrir la fiche » : fiche du planning A');
      pg.__answers.push(true,false);await pg.locator('#s-prevu [data-k="fiche-planning"] [data-k="supprimer-fiche"]').click();await pg.waitForTimeout(250);
      ok(await pg.locator('#s-prevu [data-k="calendrier"]').count()===1,'après suppression : retour au calendrier');
      await pg.evaluate(()=>MHPrevu.jour('2026-11-03'));await pg.waitForTimeout(80);
      ok((await cellule(pg,'2026-11-03')).etat==='prévu'&&(await cellule(pg,'2026-10-26')).etat==='aucun','fiche A supprimée : 03/11 n’a plus qu’une provenance, fin octobre vide');
      /* sous-onglet OCR / Validation : l'existant */
      await pg.locator('#s-prevu [data-k="onglet-ocr"]').click();await pg.waitForTimeout(100);
      ok(/Importer un planning/.test(await txt(pg))&&await pg.locator('#s-prevu .mh372-row[data-planning]').count()===2,'🔎 OCR / Validation : import et fiches (B et l’autre)');
      await pg.locator('#s-prevu [data-k="onglet-planning"]').click();await pg.waitForTimeout(80);
      ok(await pg.locator('#s-prevu [data-k="calendrier"]').count()===1,'retour à 📅 Planning');
      /* séparation : journées réelles intactes, page réelle « Calendrier | Journées » */
      ok(await moteur(pg)===avant,'DB.days, cd(), TTE, HS, Smart Control : inchangés');
      await pg.locator('#mhV30Nav [data-nav-tab="mois"]').click();await pg.waitForTimeout(200);
      ok(await pg.evaluate(()=>document.getElementById('mModeCal').innerText.trim()+' | '+document.getElementById('mModePlan').innerText.trim())==='▦ Calendrier | ☰ Journées','page réelle : « Calendrier | Journées »');
      await pg.locator('#mModePlan').click();await pg.waitForTimeout(200);ok(await pg.evaluate(()=>document.getElementById('mModePlan').classList.contains('on')),'« Journées » ouvre toujours la vue réelle existante');
      ok(!JSON.stringify(await pg.evaluate(()=>localStorage.getItem('mh_planning_v372'))).match(/DUPONT|MARTIN|LEROY|GARNIER|BEZIAT|GALLATO|BLANCHARD/),'aucun collègue dans les données prévisionnelles');
      ok(!errs.length,'0 erreur JS'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));await ctx.close()}

    console.log('Responsive · 360 / 412 / 448 px, clair et sombre');
    for(const W of [360,412,448])for(const theme of ['dark','light']){const {ctx,pg,errs}=await open(b,W,theme,true);await tabPrevu(pg);
      await pg.evaluate(()=>{MHPrevu.moisSuivant();MHPrevu.jour('2026-11-03')});await pg.waitForTimeout(150);
      const o=await overflow(pg,'#s-prevu'),g=await pg.evaluate(()=>{const c=[...document.querySelectorAll('#s-prevu .mh372-j')].map(e=>e.getBoundingClientRect());const w=c.map(r=>Math.round(r.width));
        const lab=[...document.querySelectorAll('#s-prevu .mh372-j[data-date="2026-11-12"] .mh372-l')].map(e=>{const r=e.getBoundingClientRect();return r.height>8&&r.width>20});
        return {min:Math.min(...w),max:Math.max(...w),right:Math.max(...c.map(r=>r.right)),lab:lab[0]}});
      ok(!o.length&&g.right<=W&&g.max-g.min<=1&&g.min>=36&&g.lab&&!errs.length,W+' px · '+(theme==='dark'?'sombre':'clair')+' : calendrier sans défilement latéral, 7 colonnes égales ('+g.min+' px), libellés lisibles'+(o.length?' ('+o.join(', ')+')':''));
      if(W===360)await pg.screenshot({path:path.join(os.tmpdir(),'mh372-cal-360-'+theme+'.png'),fullPage:true});
      await ctx.close()}
  }catch(e){fails++;console.log('FAIL  exception : '+(e&&e.stack||e))}
  finally{await b.close();srv.close()}
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.2.0-D (planning prévisionnel) : OK');process.exit(fails?1:0);
});
