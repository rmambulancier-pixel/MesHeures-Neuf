#!/usr/bin/env node
/*
 * V37.3.0 — 📋 Prévu › 📊 Comparaison Prévu ↔ Réel, application réelle (Chromium), horloge figée au 25/10/2026 10h00.
 * Réel : journées de référence (fixtures 24/08 → 18/10/2026). Prévu : fiches validées (septembre construit pour couvrir
 * chaque cas, rectificatif en conflit le 19/09, octobre = planning A du cas réel). Lecture seule vérifiée octet pour octet.
 * Usage : NODE_PATH=… node tests/v373-comparaison.browser.js · 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const NOW=new Date('2026-10-25T10:00:00');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(WEB,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
const seed=()=>({s:R1.s,days:{...R1.days,...R2.days},periods:[],per:{start:'2026-09-21',nb:2},bul:{},bulletins:[],romi:{},cmp:{}});
const S_LAB=['Jour 7h','Jour 7h','Congés 35','Repos','Samu','Formation','Repos','Repos','Samu','Jour Férié','Xyz','Matin','Jour 7h','Jour 7h'];
const A_LAB='JJJJJRRJJJJJRRJJJJJRRJJJJJRRJJJ'.split('').map(x=>x==='J'?'Jour 7h':'Repos');
function creerFiches(d){const P=MHPlanning,st=P.store(),add=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const f=o=>{const p=P.creer({importeLe:'2026-10-09T09:00:00Z',source:{nom:o.nom,mime:'application/pdf',taille:1000,sha256:o.sha},periode:{debut:o.debut,fin:add(o.debut,o.labels.length-1),origine:'ocr'},
    salarie:{nom:'ROTH Mickael',ligne:3,confirme:true},ligne:{ligne:3,nomLu:'ROTH Mickael',cellules:o.labels.map((x,i)=>({colonne:i,texte:x,conf:95}))},ocr:{moteur:'tesseract.js',statut:'complet'},
    origine:{importId:null,sourceSha256:o.sha,page:o.page,tableId:o.tableId||0,orientation:{exif:1,rotation180:false}}});return st.enregistrer(Object.assign(p,{id:'pl-'+o.sha.slice(0,12)+'-'+o.debut}))};
  f({debut:'2026-09-07',labels:d.S,sha:'5a'.repeat(32),nom:'septembre.pdf',page:1});f({debut:'2026-09-19',labels:['Repos','Jour 7h'],sha:'7c'.repeat(32),nom:'rectificatif.jpg',page:null});
  f({debut:'2026-10-05',labels:d.A,sha:'a1'.repeat(32),nom:'octobre.pdf',page:2,tableId:1})}
async function open(b,W,theme,now){
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/planning-source|Failed to load resource/.test(m.text()))errs.push(m.text())});
  await pg.clock.setFixedTime(now||NOW);
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},{db:seed(),t:theme});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2000);
  await pg.evaluate(creerFiches,{S:S_LAB,A:A_LAB});
  return {ctx,pg,errs};
}
const tabPrevu=async pg=>{await pg.locator('#mhV30Nav [data-nav-tab="prevu"]').click();await pg.waitForTimeout(250)};
const txt=pg=>pg.evaluate(()=>document.getElementById('s-prevu').innerText);
const ligne=(pg,d)=>pg.evaluate(d=>{const r=document.querySelector('#s-prevu tr[data-date="'+d+'"]');return r?{res:r.dataset.resultat,t:r.innerText.replace(/\s+/g,' ').trim()}:null},d);
const reel=pg=>pg.evaluate(()=>JSON.stringify({ls:localStorage.getItem('mesheures_v3'),cd:Object.keys(DB.days).sort().map(k=>{const r=cd(k);return [k,r.tte,r.amp,r.pz,r.nuit,r.idaj,r.ir,r.iru,r.al.length]}),
  per:calcPer('2026-08-24',2).G,brut:brutOf(calcPer('2026-08-24',2).G),sc:MHControl.analyze({end:'2026-10-24'}).counts,days:DB.days}));
const overflow=(pg,sel)=>pg.evaluate(sel=>{const root=document.querySelector(sel),out=[];if(!root)return ['absent'];
  if(document.documentElement.scrollWidth>innerWidth+1)out.push('page '+document.documentElement.scrollWidth+' px');
  [...root.querySelectorAll('*')].forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&e.offsetParent&&r.right>innerWidth+1)out.push(e.tagName+'.'+String(e.className).slice(0,20))});return out.slice(0,4)},sel);

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    console.log('📊 Comparaison : vue, catégories, statistiques');
    {const {ctx,pg,errs}=await open(b,412,'light');const avant=await reel(pg);await tabPrevu(pg);
      ok(await pg.locator('#s-prevu [data-k="onglets"] button').count()===3&&/📅 Planning[\s\S]*📊 Comparaison[\s\S]*🔎 OCR \/ Validation/.test(await pg.locator('#s-prevu [data-k="onglets"]').innerText()),'📋 Prévu : 📅 Planning | 📊 Comparaison | 🔎 OCR / Validation');
      await pg.locator('#s-prevu [data-k="onglet-comparaison"]').click();await pg.waitForTimeout(200);
      const t0=await txt(pg);
      ok(/ANALYSE · LECTURE SEULE/.test(t0)&&/Aucune donnée réelle n’est modifiée/.test(t0),'badge « ANALYSE · LECTURE SEULE » et rappel : aucune donnée réelle modifiée');
      ok(await pg.locator('#s-prevu [data-k="cmp-titre"]').innerText()==='Octobre 2026','mois du jour : Octobre 2026');
      ok(JSON.stringify(await pg.evaluate(()=>[...document.querySelectorAll('#s-prevu [data-k="cmp-table"] th')].map(x=>x.textContent)))==='["Date","Prévu","Réel","Résultat"]','tableau Date | Prévu | Réel | Résultat');
      const l5=await ligne(pg,'2026-10-05'),l8=await ligne(pg,'2026-10-08'),l10=await ligne(pg,'2026-10-10'),l19=await ligne(pg,'2026-10-19'),l26=await ligne(pg,'2026-10-26');
      ok(l5.res==='conforme'&&/05\/10 Jour 7h Travail 08:30–17:30/.test(l5.t)&&/🟢 Conforme/.test(l5.t),'05/10 : Jour 7h / Travail 08:30–17:30 → 🟢 Conforme');
      ok(l8.res==='different'&&/Repos 🟠 Différent/.test(l8.t),'08/10 : Jour 7h / Repos → 🟠 Différent');
      ok(l10.res==='conforme'&&/Repos Repos/.test(l10.t),'10/10 : Repos / Repos → 🟢 Conforme');
      ok(l19.res==='prevu_sans_reel'&&/aucun réel saisi/.test(l19.t)&&!/à venir/.test(l19.t),'19/10 (passé) : 🔵 Prévu mais aucun réel');
      ok(l26.res==='prevu_sans_reel'&&/à venir/.test(l26.t),'26/10 (futur) : 🔵 « à venir »');
      const st=await pg.locator('#s-prevu [data-k="stats"]').innerText(),tx=await pg.locator('#s-prevu [data-k="taux"]').innerText();
      ok(/Taux de conformité : 50 % \(7 conformes sur 14 jours comparables\)/.test(tx)&&/7 jour\(s\) à venir non comptés/.test(tx),'taux défini : conformes / jours comparables, à venir exclus ('+tx.split('\n')[0]+')');
      await pg.locator('#s-prevu tr[data-date="2026-10-05"]').click();await pg.waitForTimeout(100);
      const d5=await pg.locator('#s-prevu [data-k="cmp-detail"]').innerText();
      ok(/Lundi 05\/10\/2026/.test(d5)&&/TTE réel \d+h\d\d pour 7h00 prévues/.test(d5)&&/ne changent pas le résultat/.test(d5)&&/octobre\.pdf · page 2 · tableau 2/.test(d5)&&/lecture seule/.test(d5),'détail 05/10 : écart TTE (information), provenance, réel en lecture seule');
      await pg.locator('#s-prevu [data-k="cmp-prec"]').click();await pg.waitForTimeout(150);
      ok(await pg.locator('#s-prevu [data-k="cmp-titre"]').innerText()==='Septembre 2026','‹ : Septembre 2026');
      const s14=await ligne(pg,'2026-09-14'),s19=await ligne(pg,'2026-09-19'),s20=await ligne(pg,'2026-09-20'),s12=await ligne(pg,'2026-09-12'),s1=await ligne(pg,'2026-09-01'),s15=await ligne(pg,'2026-09-15');
      ok(s14.res==='reel_non_prevu'&&/🔴 Réel non prévu/.test(s14.t),'14/09 : Repos prévu / Travail → 🔴 Réel non prévu');
      ok(s19.res==='conflit'&&/Jour 7h Repos 2 sources/.test(s19.t)&&/⚠️ Conflit prévisionnel/.test(s19.t),'19/09 : deux prévisions différentes → ⚠️ Conflit, les deux affichées');
      ok(s20.res==='different'&&/×2 sources/.test(s20.t),'20/09 : deux prévisions identiques (×2 sources) comparées une fois');
      ok(s12.res==='non_comparable'&&/ℹ️ Non comparable/.test(s12.t)&&s1.res==='reel_non_prevu'&&/— Travail/.test(s1.t),'12/09 Formation → ℹ️ ; 01/09 travail sans planning → 🔴');
      ok(s15.res==='conforme'&&/Samu Travail 06:20–14:20/.test(s15.t),'15/09 : Samu / Travail → 🟢 (écarts horaires en détail)');
      await pg.locator('#s-prevu tr[data-date="2026-09-19"]').click();await pg.waitForTimeout(100);
      const d19=await pg.locator('#s-prevu [data-k="cmp-detail"]').innerText();
      ok(/aucune n’est retenue/.test(d19)&&/septembre\.pdf · page 1/.test(d19)&&/rectificatif\.jpg/.test(d19),'détail du conflit : deux sources, aucune retenue');
      await pg.locator('#s-prevu [data-k="filtre-ecarts"]').click();await pg.waitForTimeout(100);
      ok(await pg.locator('#s-prevu tr[data-resultat="conforme"]').count()===0&&await pg.locator('#s-prevu tr[data-resultat="different"]').count()===4,'filtre « Écarts » : conformes masqués');
      await pg.locator('#s-prevu [data-k="filtre-tous"]').click();await pg.waitForTimeout(80);
      /* les autres sous-onglets sont intacts */
      await pg.locator('#s-prevu [data-k="onglet-planning"]').click();await pg.waitForTimeout(100);ok(await pg.locator('#s-prevu [data-k="calendrier"]').count()===1,'📅 Planning toujours disponible');
      await pg.locator('#s-prevu [data-k="onglet-ocr"]').click();await pg.waitForTimeout(100);ok(/Importer un planning/.test(await txt(pg)),'🔎 OCR / Validation toujours disponible');
      ok(await reel(pg)===avant,'Réel strictement inchangé : mesheures_v3 octet pour octet, DB.days, cd(), TTE, HS, Smart Control');
      await pg.locator('#mhV30Nav [data-nav-tab="mois"]').click();await pg.waitForTimeout(150);
      ok(await pg.evaluate(()=>document.getElementById('mModePlan').innerText.trim())==='☰ Journées','page réelle : « Journées » inchangé');
      ok(await pg.evaluate(()=>document.getElementById('mhVersion').textContent)==='V37.3.0','version affichée V37.3.0');
      ok(!errs.length,'0 erreur JS'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));await ctx.close()}

    console.log('Cas Pixel (37.3.0-A) : horloge au 09/10, jours futurs ouverts dans Journées (« Repos » vide créé par gd())');
    {const {ctx,pg,errs}=await open(b,412,'light',new Date('2026-10-09T12:00:00'));
      const crees=await pg.evaluate(()=>{const out=[];for(let d=10;d<=31;d++){const k='2026-10-'+String(d).padStart(2,'0');if(!DB.days[k]){gd(k);out.push(k)}}return out.length});
      const vides=await pg.evaluate(()=>Object.keys(DB.days).filter(k=>k>='2026-10-10'&&k<='2026-10-31'&&DB.days[k].t==='REPOS'&&!DB.days[k].deb&&!DB.days[k].fin).length);
      ok(crees===13&&vides===22,'10/10 → 31/10 : 22 « Repos » vides (9 déjà dans les données, 13 créés par gd() en ouvrant les jours), comme sur le Pixel');
      const avant=await reel(pg);await tabPrevu(pg);await pg.locator('#s-prevu [data-k="onglet-comparaison"]').click();await pg.waitForTimeout(200);
      const fut=await pg.evaluate(()=>[...document.querySelectorAll('#s-prevu tr[data-date]')].filter(r=>r.dataset.date>='2026-10-09').map(r=>r.dataset.resultat));
      ok(fut.length===23&&fut.every(r=>r==='prevu_sans_reel'),'09/10 → 31/10 : 23 lignes 🔵 à venir, aucun 🟠 Différent ni 🟢 Conforme ('+[...new Set(fut)].join(',')+')');
      const l20=await ligne(pg,'2026-10-20');ok(/aucun réel saisi/.test(l20.t)&&/à venir/.test(l20.t),'20/10 : « aucun réel saisi · à venir » (le Repos par défaut n’est pas affiché comme réel)');
      const tx=await pg.locator('#s-prevu [data-k="taux"]').innerText();
      ok(/Taux de conformité : 75 % \(3 conformes sur 4 jours comparables\)/.test(tx)&&/23 jour\(s\) à venir non comptés/.test(tx),'taux : 05-07/10 conformes, 08/10 différent ; futurs hors taux ('+tx.split('\n')[0]+')');
      ok(await reel(pg)===avant,'Réel inchangé par la comparaison (les Repos créés par l’application restent tels quels)');
      ok(!errs.length,'0 erreur JS'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));await ctx.close()}

    console.log('Responsive · 360 / 412 / 448 px, clair et sombre');
    for(const W of [360,412,448])for(const theme of ['dark','light']){const {ctx,pg,errs}=await open(b,W,theme);await tabPrevu(pg);
      await pg.evaluate(()=>{MHPrevu.onglet('comparaison');MHComparaisonUI.mois(-1);MHComparaisonUI.date('2026-09-15')});await pg.waitForTimeout(150);
      const o=await overflow(pg,'#s-prevu'),tw=await pg.evaluate(()=>{const t=document.querySelector('#s-prevu [data-k="cmp-table"]');return t?t.getBoundingClientRect().right:9999});
      ok(!o.length&&tw<=W&&!errs.length,W+' px · '+(theme==='dark'?'sombre':'clair')+' : comparaison sans défilement latéral'+(o.length?' ('+o.join(', ')+')':''));
      if(W===360)await pg.screenshot({path:path.join(os.tmpdir(),'mh373-cmp-360-'+theme+'.png'),fullPage:true});
      await ctx.close()}
  }catch(e){fails++;console.log('FAIL  exception : '+(e&&e.stack||e))}
  finally{await b.close();srv.close()}
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.3.0 (comparaison Prévu ↔ Réel) : OK');process.exit(fails?1:0);
});
