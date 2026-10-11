#!/usr/bin/env node
/*
 * V37.2.0-B — onglet « Prévu » (planning prévisionnel), application réelle (Chromium), horloge figée au 08/10/2026 10h00.
 * Import photo / galerie / fichier / PDF (vrai pdf.js), fiche, liste, suppression confirmée, doublon, annulation,
 * sauvegarde et restauration, sources disponibles / à vérifier, lecture seule du moteur, 360 / 412 / 448 px clair et sombre.
 * Fichiers : tests/fixtures/planning (synthétiques). Usage : node tests/v372-planning.browser.js · 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web'),FX=path.join(__dirname,'fixtures/planning');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const NOW=new Date('2026-10-08T10:00:00');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(WEB,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
const seed=()=>({s:R1.s,days:{...R1.days,...R2.days},periods:[],per:{start:'2026-09-21',nb:2},bul:{},bulletins:[],romi:{},cmp:{}});
const F=n=>path.join(FX,n),SHA=n=>crypto.createHash('sha256').update(fs.readFileSync(F(n))).digest('hex');
/* Pont Android simulé (mêmes règles que LegacyWebViewActivity) */
const NATIF=()=>{const files={};let cur=null;const NAME=/^[0-9a-f]{64}\.(jpg|png|webp|pdf|txt)$/;
  window.__mhFiles=files;window.__mhPick='';
  const prev=window.MesHeuresAndroid||{};
  window.MesHeuresAndroid=Object.assign(prev,{
    planningSourceBegin(n,s){if(!NAME.test(n))return false;cur={n,s,b:''};return true},planningSourceAppend(b){if(!cur)return false;cur.b+=atob(b);return true},
    planningSourceFinish(){if(!cur)return false;files[cur.n]=cur.b.length;cur=null;return true},planningSourceExists(n){return n in files},planningSourceDelete(n){const e=n in files;delete files[n];return e},
    planningLastPickStatus(){return window.__mhPick}})};

async function open(b,W,theme,opts){
  opts=opts||{};
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/planning-source|Failed to load resource/.test(m.text()))errs.push(m.text())});
  const dialogs=[];pg.on('dialog',d=>{dialogs.push(d.message());const a=(pg.__answers||[]).shift();a===false?d.dismiss():d.accept()});pg.__dialogs=dialogs;
  await pg.clock.setFixedTime(NOW);
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},{db:seed(),t:theme});
  if(opts.natif)await pg.addInitScript(NATIF);
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2200);
  return {ctx,pg,errs};
}
const tabPrevu=async pg=>{await pg.locator('#mhV30Nav [data-nav-tab="prevu"]').click();await pg.waitForTimeout(250)};
const txt=pg=>pg.evaluate(()=>document.getElementById('s-prevu').innerText);
async function importer(pg,src,fichier){
  if(await pg.locator('#s-prevu [data-k="fiche"]').count())await pg.locator('#s-prevu button:has-text("Plannings enregistrés")').click();
  if(!(await pg.locator('#mh372Imp').count()))await pg.locator('#mh372Open').click();
  await pg.locator('#mh372Imp input[data-src="'+src+'"]').setInputFiles(fichier?F(fichier):[]);
  await pg.waitForFunction(()=>!/Import en cours/.test(document.getElementById('s-prevu').innerText),null,{timeout:15000});await pg.waitForTimeout(150);
}
const moteur=pg=>pg.evaluate(()=>JSON.stringify({cd:Object.keys(DB.days).sort().map(k=>{const r=cd(k);return [k,r.tte,r.amp,r.pz,r.nuit,r.idaj,r.ir,r.iru]}),
  per:calcPer('2026-08-24',2).G,brut:brutOf(calcPer('2026-08-24',2).G),sc:MHControl.analyze({end:'2026-10-08'}).counts,days:JSON.parse(localStorage.getItem('mesheures_v3')).days}));
const overflow=(pg,sel)=>pg.evaluate(sel=>{const root=document.querySelector(sel),out=[];if(!root)return ['absent'];
  if(document.documentElement.scrollWidth>innerWidth+1)out.push('page '+document.documentElement.scrollWidth+' px');
  [...root.querySelectorAll('*')].forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&e.offsetParent&&r.right>innerWidth+1&&!/mh372-txt/.test(e.className))out.push(e.tagName+'.'+String(e.className).slice(0,20))});return out.slice(0,4)},sel);

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    console.log('Onglet « Prévu » et état vide');
    {const {ctx,pg,errs}=await open(b,412,'dark');
      const nav=await pg.evaluate(()=>[...document.querySelectorAll('#mhV30Nav [data-nav-tab]')].map(x=>x.getAttribute('data-nav-tab')+':'+x.innerText.replace(/\s+/g,' ').trim()));
      ok(nav.length===6&&nav[5]==='prevu:📋 Prévu'&&nav[2]==='mois:▦ Planning','barre du bas : 6 boutons, « 📋 Prévu » ajouté, « Planning » (Mois) inchangé');
      const before=await moteur(pg);
      await tabPrevu(pg);
      const t0=await txt(pg);
      ok(await pg.evaluate(()=>document.getElementById('s-prevu').classList.contains('on')&&window.curTab==='prevu'),'onglet ouvert, section s-prevu affichée');
      ok(/Aucun planning enregistré/.test(t0)&&/Importer un planning/.test(t0)&&/ne prouve pas une heure réellement travaillée/.test(t0),'état vide : « Aucun planning enregistré », « Importer un planning », mention prévisionnel');
      await pg.locator('#mh372Open').click();await pg.waitForTimeout(100);
      const ins=await pg.evaluate(()=>[...document.querySelectorAll('#mh372Imp input')].map(i=>[i.dataset.src,i.accept,i.getAttribute('capture')]));
      ok(JSON.stringify(ins)===JSON.stringify([['photo','image/*','environment'],['galerie','image/jpeg,image/png,image/webp',null],['fichier','image/jpeg,image/png,image/webp,application/pdf',null]]),'3 entrées : Prendre une photo (capture), Galerie (images), Fichier (images + PDF)');

      console.log('Import (navigateur : originaux en IndexedDB)');
      await importer(pg,'photo','planning-photo-exif6.jpg');
      let f=await txt(pg);
      ok(/Planning importé/.test(f)&&f.includes(SHA('planning-photo-exif6.jpg'))&&/à analyser/.test(f)&&/source disponible/.test(f),'photo JPG : fiche ouverte, SHA-256 exact, « à analyser », « source disponible »');
      ok(/à pivoter de 90° \(sens horaire\)/.test(f)&&/380 × 120 px/.test(f)&&/original non modifié/.test(f),'orientation EXIF 6 lue, dimensions, original non modifié');
      ok(/Analyse du planning/.test(f)&&await pg.locator('#s-prevu [data-k="analyse"] button[data-k="lancer"]:not([disabled])').count()===1&&await pg.evaluate(()=>!JSON.parse(localStorage.getItem('mh_planning_v372')).analyses),'fiche : « Analyser le planning » disponible (lot C), aucune analyse lancée à l’import');
      await pg.waitForTimeout(300);
      ok(await pg.evaluate(()=>{const i=document.querySelector('#mh372Prev img');return !!i&&i.complete&&i.naturalWidth===120&&i.naturalHeight===380&&i.src.startsWith('blob:')}),'aperçu : original relu depuis le stockage local, affiché redressé selon l’EXIF (380 × 120 → 120 × 380)');
      ok(await pg.evaluate(async h=>{const r=MHPlanning.store().importsListe()[0];const u=await MHPlanningImport.sources.url(r.source.localRef);const b=new Uint8Array(await (await fetch(u)).arrayBuffer());return (await MHPlanning.sha256(b))===h},SHA('planning-photo-exif6.jpg')),'original stocké intact : SHA-256 relu identique (aucune rotation appliquée au fichier)');
      await importer(pg,'galerie','planning-galerie.png');await importer(pg,'galerie','planning-galerie.webp');
      ok(/Planning importé/.test(await txt(pg)),'galerie : PNG et WEBP importés');
      await importer(pg,'fichier','planning-texte.pdf');f=await txt(pg);
      ok(/PDF texte : texte extrait, analyse à venir/.test(f)&&/caractères sur 1 page/.test(f),'PDF texte (vrai pdf.js) : détecté textuel, texte extrait');
      await pg.locator('#s-prevu button:has-text("Afficher le texte")').click();await pg.waitForTimeout(200);
      ok(/Planning du 02\/11\/2026 au 02\/12\/2026/.test(await pg.locator('#s-prevu [data-k="texte"]').innerText()),'texte extrait relu depuis la source');
      ok(await pg.evaluate(()=>{const r=MHPlanning.store().importsListe().find(x=>x.source.format==='pdf');return r.periode.debut===null&&r.salarie===null&&!JSON.stringify(r).includes('DUPONT')}),'aucune interprétation (période, salarié) ; texte absent de la fiche');
      await importer(pg,'fichier','planning-scan-image.pdf');
      ok(/PDF image — analyse OCR à venir/.test(await txt(pg)),'PDF image : « PDF image — analyse OCR à venir »');
      const n5=await pg.evaluate(()=>MHPlanning.store().importsListe().length);
      await importer(pg,'galerie','pas-une-image.jpg');
      ok(/Fichier non reconnu/.test(await txt(pg))&&await pg.evaluate(()=>MHPlanning.store().importsListe().length)===n5,'fichier invalide : refusé, aucune fiche');
      await importer(pg,'fichier','planning-galerie.png');
      ok(/déjà été importé/.test(await txt(pg))&&await pg.evaluate(()=>MHPlanning.store().importsListe().length)===n5&&await pg.locator('#s-prevu [data-k="fiche"]').count()===1,'doublon SHA-256 : signalé, fiche existante ouverte, pas de 2e import');
      await importer(pg,'photo',null);
      ok(/Import annulé/.test(await txt(pg))&&await pg.evaluate(()=>MHPlanning.store().importsListe().length)===n5,'import annulé : message, rien d’enregistré');
      await pg.evaluate(()=>document.querySelector('#mh372Imp input[data-src="galerie"]').dispatchEvent(new Event('cancel')));await pg.waitForTimeout(100);
      ok(/Import annulé/.test(await txt(pg)),'annulation du sélecteur (événement cancel) : message');

      console.log('Liste et fiche');
      await pg.locator('#s-prevu button:has-text("Plannings enregistrés")').count()&&await pg.locator('#s-prevu button:has-text("Plannings enregistrés")').click();
      await pg.evaluate(()=>MHPrevu.retour());await pg.waitForTimeout(100);
      const rows=await pg.evaluate(()=>[...document.querySelectorAll('#s-prevu .mh372-row')].map(r=>r.innerText.replace(/\s+/g,' ')));
      ok(rows.length===5&&rows.every(r=>/Planning : période à déterminer/.test(r)&&/Salarié : à déterminer/.test(r)&&/État : à analyser/.test(r)&&/Importé le 08\/10\/2026/.test(r)&&/Ouvrir/.test(r)&&/Supprimer/.test(r)),'liste : 5 plannings, période / salarié / état / date d’import / actions');
      ok(rows.some(r=>/Source : photo · JPG/.test(r))&&rows.some(r=>/Source : galerie · WEBP/.test(r))&&rows.some(r=>/Source : fichier · PDF/.test(r)),'liste : type de source et format');
      await pg.locator('#s-prevu .mh372-row:has-text("photo") button:has-text("Ouvrir")').click();await pg.waitForTimeout(150);
      ok(/planning-photo-exif6\.jpg/.test(await txt(pg))&&/Corrections\s*aucune/.test(await txt(pg)),'fiche : fichier original, corrections (aucune)');

      console.log('Suppression confirmée');
      const pngRef=await pg.evaluate(()=>MHPlanning.store().importsListe().find(x=>x.source.format==='png').source.localRef);
      const pngId=await pg.evaluate(()=>MHPlanning.store().importsListe().find(x=>x.source.format==='png').id);
      await pg.evaluate(()=>MHPrevu.retour());
      pg.__answers=[false];await pg.locator('#s-prevu .mh372-row:has-text("PNG") button:has-text("Supprimer")').click();await pg.waitForTimeout(200);
      ok(/Suppression annulée/.test(await txt(pg))&&await pg.evaluate(id=>!!MHPlanning.store().importLire(id),pngId),'refus de la confirmation : rien supprimé');
      pg.__answers=[true,false];await pg.locator('#s-prevu .mh372-row:has-text("PNG") button:has-text("Supprimer")').click();await pg.waitForTimeout(300);
      ok(/fichier original conservé/.test(await txt(pg))&&await pg.evaluate(id=>!MHPlanning.store().importLire(id),pngId)&&await pg.evaluate(r=>MHPlanningImport.sources.existe(r),pngRef),'suppression confirmée, original conservé sur demande');
      ok(pg.__dialogs.some(d=>/Supprimer aussi le fichier original/.test(d)),'deuxième confirmation pour l’original');
      await importer(pg,'galerie','planning-galerie.png');
      const id2=await pg.evaluate(()=>MHPlanning.store().importsListe().find(x=>x.source.format==='png').id);await pg.evaluate(()=>MHPrevu.retour());
      pg.__answers=[true,true];await pg.locator('#s-prevu .mh372-row:has-text("PNG") button:has-text("Supprimer")').click();await pg.waitForTimeout(300);
      ok(/avec son fichier original/.test(await txt(pg))&&!(await pg.evaluate(r=>MHPlanningImport.sources.existe(r),pngRef)),'suppression avec l’original : seulement après la 2e confirmation');

      console.log('Sauvegarde et restauration');
      const k=await pg.evaluate(()=>window.mhV30Backup('test').key);
      const snap=await pg.evaluate(k=>JSON.parse(localStorage.getItem(k)),k);
      const sj=JSON.stringify(snap.plannings);
      ok(snap.plannings&&Object.keys(snap.plannings.imports).length===4&&!/base64|data:image/.test(sj)&&sj.includes(SHA('planning-photo-exif6.jpg')),'sauvegarde : 4 plannings (métadonnées, SHA-256), aucune image ni PDF');
      const webpRef=await pg.evaluate(()=>MHPlanning.store().importsListe().find(x=>x.source.format==='webp').source.localRef);
      await pg.evaluate(r=>MHPlanningImport.sources.supprimer(r),webpRef);
      await pg.evaluate(()=>{localStorage.removeItem('mh_planning_v372')});
      /* V37.4.1 : confirmation et message de restauration dans la fenêtre intégrée (MHDialogue) */
      await pg.evaluate(k=>{window.__rr=window.mhV30Restore(k)},k);await pg.waitForSelector('[data-k="mh-dialogue-ok"]',{timeout:5000});await pg.locator('[data-k="mh-dialogue-ok"]').click();
      await pg.waitForTimeout(1200);const restored=await pg.evaluate(()=>Promise.race([window.__rr,new Promise(r=>setTimeout(()=>r('EN ATTENTE'),3000))]))===true;
      await pg.waitForSelector('[data-k="mh-dialogue"]',{timeout:5000}).catch(()=>{});const msgRest=await pg.locator('[data-k="mh-dialogue"]').innerText().catch(()=>'');
      await pg.locator('[data-k="mh-dialogue-ok"]').click().catch(()=>{});
      const disp=await pg.evaluate(()=>MHPlanning.store().importsListe().map(r=>r.source.format+':'+r.source.disponibilite).sort());
      ok(restored&&disp.length===4&&JSON.stringify(disp)===JSON.stringify(['jpeg:disponible','pdf:disponible','pdf:disponible','webp:a_verifier']),'restauration : plannings revenus ; fichier retrouvé → disponible, fichier effacé → à vérifier');
      ok(/planning\(s\) prévisionnel\(s\) restauré\(s\)/.test(msgRest),'message de restauration : plannings restaurés, sources à vérifier (fenêtre intégrée)');
      await tabPrevu(pg);await pg.evaluate(()=>MHPrevu.retour());
      ok(/source à vérifier/.test(await txt(pg))&&!/source absente/i.test(await txt(pg)),'liste : « source à vérifier », jamais « source absente »');

      console.log('Lecture seule du moteur');
      ok(await moteur(pg)===before,'journées, TTE, amplitude, nuit, IDAJ, repas, HS (calcPer), brut, Smart Control identiques après imports, suppressions, restauration');
      ok(await pg.evaluate(()=>window.DB===undefined),'window.DB non exposé');
      ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));await ctx.close()}

    console.log('Application Android (pont simulé)');
    {const {ctx,pg,errs}=await open(b,412,'light',{natif:true});await tabPrevu(pg);
      await importer(pg,'photo','planning-photo-exif6.jpg');
      const r=await pg.evaluate(()=>MHPlanning.store().importsListe()[0]);
      ok(r.source.localRef==='android:'+SHA('planning-photo-exif6.jpg')+'.jpg'&&await pg.evaluate(n=>window.__mhFiles[n]>0,SHA('planning-photo-exif6.jpg')+'.jpg'),'photo rangée par l’application (référence android:<sha256>.jpg)');
      await pg.waitForTimeout(200);
      ok(await pg.evaluate(()=>(document.querySelector('#mh372Prev img')||{}).getAttribute?.('src'))==='/planning-source/'+SHA('planning-photo-exif6.jpg')+'.jpg','aperçu servi par l’application (/planning-source/…), jamais en base64');
      await pg.evaluate(()=>{window.__mhPick='camera_absente'});await importer(pg,'photo',null);
      ok(/Aucun appareil photo disponible/.test(await txt(pg)),'pas d’appareil photo : message clair');
      await pg.evaluate(()=>{window.__mhPick='permission_refusee'});await importer(pg,'photo',null);
      ok(/Accès à l’appareil photo refusé/.test(await txt(pg)),'accès refusé : message clair');
      await pg.evaluate(()=>{window.__mhPick='annule'});await importer(pg,'galerie',null);
      ok(/Import annulé/.test(await txt(pg)),'galerie annulée : « Import annulé »');
      ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));await ctx.close()}

    console.log('Responsive · barre du bas, liste et fiche');
    for(const W of [360,412,448])for(const theme of ['dark','light']){
      const {ctx,pg,errs}=await open(b,W,theme);await tabPrevu(pg);
      await importer(pg,'photo','planning-photo-exif6.jpg');await importer(pg,'fichier','planning-texte.pdf');
      const o1=await overflow(pg,'#s-prevu');await pg.evaluate(()=>MHPrevu.retour());await pg.waitForTimeout(100);const o2=await overflow(pg,'#s-prevu');
      const nav=await pg.evaluate(()=>[...document.querySelectorAll('#mhV30Nav button')].map(x=>{const r=x.getBoundingClientRect(),s=x.querySelector('span');return r.right<=innerWidth+1&&r.width>=44&&s.scrollWidth<=s.clientWidth+1}).every(Boolean));
      const col=await pg.evaluate(()=>[...document.querySelectorAll('#mhV30Nav button')].map(x=>x.getAttribute('data-nav-tab')+'='+getComputedStyle(x).color));
      const acc=theme==='dark'?'rgb(63, 185, 80)':'rgb(26, 127, 55)',on=col.filter(c=>c.endsWith('='+acc));
      ok(on.length===1&&on[0].startsWith('prevu='),W+' px · '+(theme==='dark'?'sombre':'clair')+' : seul l’onglet ouvert (Prévu) est mis en évidence, « Accueil » ne l’est plus'+(on.length===1?'':' → '+col.join(' ')));
      if(W===412)await pg.screenshot({path:path.join(os.tmpdir(),`mh372-prevu-${W}-${theme}.png`),fullPage:false});
      ok(!o1.length&&!o2.length&&nav&&errs.length===0,W+' px · '+(theme==='dark'?'sombre':'clair')+' : fiche et liste sans débordement, 6 boutons lisibles, 0 erreur JS'+(o1.concat(o2).length?' → '+o1.concat(o2).join(', '):'')+(errs.length?' · '+errs[0]:''));
      await ctx.close();
    }
  }catch(e){fails++;console.log('FAIL  exception : '+(e&&e.stack||e))}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.2.0-B (onglet Prévu) : OK');process.exit(fails?1:0);
});
