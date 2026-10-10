#!/usr/bin/env node
/*
 * V37.4.0 — Dossier : plannings prévisionnels dans l'application réelle (Chromium, Pixel 10 Pro XL : 412 px).
 * Usage : NODE_PATH=… node tests/v374-dossier-planning.browser.js   · 0 = OK, 1 = échec, 2 = Playwright indisponible.
 *
 * Données : journées de référence (24/08 → 20/09/2026) + stockage Planning issu du parcours réel du module (tests/lib/
 * dossier-planning-store.js : planning collectif synthétique, noms de collègues inventés, correction, conflit, analyse
 * retirée, fiche supprimée, import non validé). Exports par le pont natif simulé : PDF signé, imprimable, JSON.
 * Lecture seule : enregistreur d'écritures posé juste avant les exports ; DB.days, mesheures_v3 et mh_planning_v372 comparés.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const {readPdf}=require('./pdf-reader');
const {preparer,KEY,COLLEGUES,SHA_A,SHA_B,SHA_C}=require('./lib/dossier-planning-store.js');
const ROOT=path.join(__dirname,'..','app/src/main/assets/web');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const DBSEED={s:fx.s,days:fx.days,periods:[{start:'2026-08-24',nb:2}],per:{start:'2026-08-24',nb:2},bul:{},bulletins:[],romi:{},constats:[]};
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
const PIXEL={viewport:{width:412,height:915},deviceScaleFactor:3.5,isMobile:true,hasTouch:true};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const sansNomCollegue=s=>COLLEGUES.every(n=>!s.includes(n)&&!s.includes(n.split(' ')[0]));

const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});

srv.listen(0,async()=>{
  const prep=await preparer();
  const b=await chromium.launch();
  try{
    const ctx=await b.newContext({...PIXEL,serviceWorkers:'block'}),pg=await ctx.newPage();
    const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/planning-source|Failed to load resource/.test(m.text()))errs.push(m.text())});
    pg.on('dialog',d=>{d.type()==='prompt'?d.accept('Contrôle'):d.accept()});
    await pg.addInitScript(([d,store,key])=>{
      try{if(!sessionStorage.getItem('seed')){localStorage.setItem('mesheures_v3',JSON.stringify(d));localStorage.setItem(key,store);sessionStorage.setItem('seed','1')}}catch(e){}
      const out=[];let cur=null;window.__exports=out;window.__prints=[];
      window.MesHeuresAndroid={
        beginFileExport:(n,m)=>{cur={name:n,mime:m,text:'',b64:[]};return true},appendFileExportChunk:c=>{cur.text+=c},finishFileExport:()=>{out.push(cur);cur=null;return true},
        beginBinaryFileExport:(n,m)=>{cur={name:n,mime:m,text:'',b64:[]};return true},appendBinaryFileExportChunk:c=>{cur.b64.push(c)},finishBinaryFileExport:()=>{out.push(cur);cur=null;return true},
        printHtml:h=>window.__prints.push(h)}
    },[DBSEED,prep.store,KEY]);
    await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2500);
    await pg.evaluate(()=>tab('audit'));await pg.waitForTimeout(400);
    await pg.locator('#mhV30Dossier').scrollIntoViewIfNeeded();await pg.waitForTimeout(800);

    /* état avant exports + enregistreur d'écritures (posé maintenant : le démarrage de l'application n'est pas concerné) */
    const etat=()=>pg.evaluate(k=>({db:localStorage.getItem('mesheures_v3'),pl:localStorage.getItem(k),days:JSON.stringify(DB.days)}),KEY);
    const avant=await etat();
    /* Au démarrage, le module V37.2 (app-v372-planning-ui.js) vérifie la présence des fichiers originaux et met à jour leur
       disponibilité (ici « à vérifier » : le navigateur de test n'a pas les fichiers Android). C'est avant tout export et hors
       du dossier, qui restitue ensuite ce dernier état enregistré. Aucune autre différence n'est admise. */
    const sansDispo=x=>{const o=JSON.parse(x);Object.values(o.imports||{}).forEach(r=>{delete r.source.disponibilite});return JSON.stringify(o)};
    ok(sansDispo(avant.pl)===sansDispo(prep.store),'stockage Planning de test chargé ; seule la disponibilité des sources a été mise à jour au démarrage (V37.2)');
    await pg.evaluate(()=>{window.__ecritures=[];const S=Storage.prototype,si=S.setItem,ri=S.removeItem,cl=S.clear;
      S.setItem=function(k,v){window.__ecritures.push(['set',k]);return si.call(this,k,v)};S.removeItem=function(k){window.__ecritures.push(['remove',k]);return ri.call(this,k)};
      S.clear=function(){window.__ecritures.push(['clear']);return cl.call(this)}});

    console.log('PDF probatoire signé (pont natif)');
    /* V37.4.1 : messages et objet dans la fenêtre intégrée (MHDialogue) */
    const fermer=async(texte)=>{await pg.waitForSelector('[data-k="mh-dialogue-ok"]',{timeout:15000}).catch(()=>{});if(texte!=null)await pg.locator('[data-k="mh-dialogue"] input').fill(texte).catch(()=>{});await pg.locator('[data-k="mh-dialogue-ok"]').click().catch(()=>{});await pg.waitForTimeout(100)};
    await pg.locator('#mhV30Dossier button',{hasText:'PDF probatoire signé'}).click();
    await pg.waitForFunction(()=>window.__exports.length>=2,null,{timeout:20000}).catch(()=>{});
    const ex=await pg.evaluate(()=>window.__exports);const pdfX=ex.find(x=>/\.pdf$/.test(x.name)),sigX=ex.find(x=>/\.sig\.json$/.test(x.name));
    const bytes=pdfX?Buffer.concat(pdfX.b64.map(c=>Buffer.from(c,'base64'))):Buffer.alloc(0);let R=null;try{R=readPdf(bytes)}catch(e){ok(false,'PDF illisible : '+e.message)}
    if(R){const T=R.text.replace(/\s+/g,' '),TT=T.replace(/ /g,'');
      ok(R.pagesDecl>=3&&R.pages.every((p,i)=>p.text.includes('Page '+(i+1)+' / '+R.pagesDecl))&&!BAD.test(R.text),'PDF valide et paginé : '+R.pagesDecl+' pages, aucune valeur invalide');
      ok(T.indexOf('12. Plannings prévisionnels (référence, pas une preuve)')>0&&T.indexOf('12. Plannings prévisionnels')<T.indexOf('13. Intégrité'),'section 12 « Plannings prévisionnels » avant « 13. Intégrité »');
      ok(T.includes('ne prouve pas le travail effectué')&&T.includes('n’entre dans aucun calcul'),'avertissement : prévisionnel, pas une preuve, hors calcul');
      ok([SHA_A,SHA_B,SHA_C].every(h=>TT.includes(h)),'empreintes SHA-256 des trois originaux, en entier');
      ok(['planning-novembre.jpg','planning-rectificatif.pdf','planning-decembre.pdf'].every(n=>T.includes(n)),'fichiers des trois plannings validés');
      ok(T.includes('conflit entre plannings : aucune valeur retenue')&&T.includes('identique dans 2 plannings'),'conflit restitué sans arbitrage ; identique regroupé');
      ok(T.includes('lecture OCR d’origine indisponible (analyse retirée)')&&T.includes('lu de travers')&&T.includes('après validation'),'traçabilité : journal de lecture, analyse retirée, correction après validation');
      ok(T.includes('fiche supprimée')&&T.includes('2 fichiers importés sans planning validé'),'historique (fiche supprimée) ; imports non validés comptés seulement');
      ok(sansNomCollegue(R.text),'aucun nom de collègue dans le PDF');
      ok(['167h55','173h25'].every(v=>R.text.includes(v)),'valeurs réelles de référence inchangées (TTE 167h55, amplitude 173h25)');
      const sig=sigX?JSON.parse(Buffer.concat(sigX.b64.map(c=>Buffer.from(c,'base64'))).toString('utf8')):null;
      const dataHash=sig?crypto.createHash('sha256').update(JSON.stringify(sig.dossier)).digest('hex'):'';
      ok(sig&&sig.dataSha256===dataHash&&TT.includes(dataHash)&&sig.dossier.plannings&&sig.dossier.plannings.fiches.length===3,'empreinte des données = SHA-256 du dossier joint (plannings compris), imprimée dans le PDF');
      ok(sig&&sig.pdfSha256===crypto.createHash('sha256').update(bytes).digest('hex'),'.sig.json : empreinte du PDF exporté');
      fs.writeFileSync(path.join(os.tmpdir(),'mesheures-v374-dossier.pdf'),bytes)}

    console.log('Imprimable et JSON');
    await fermer();
    await pg.locator('#mhV30Dossier button',{hasText:'Dossier imprimable'}).click();await fermer('Contrôle');await pg.waitForFunction(()=>window.__prints.length>=1,null,{timeout:10000}).catch(()=>{});
    const html=await pg.evaluate(()=>window.__prints[0]||'');
    const vp=await ctx.newPage();await vp.setContent(html);
    const v=await vp.evaluate(()=>{const h=[...document.querySelectorAll('h2')],i=h.findIndex(x=>/^12\. /.test(x.textContent)),cw=document.documentElement.clientWidth;
      /* éléments de la section 12 (entre son titre et « 13. Intégrité ») qui dépassent la largeur */
      let e=h[i]&&h[i].nextElementSibling,trop=[];while(e&&e!==h[i+1]){if(e.getBoundingClientRect().right>cw+1)trop.push(e.tagName);e=e.nextElementSibling}
      return {h2:h.map(x=>x.textContent),txt:document.body.innerText,trop,cw}});
    ok(v.h2.length===13&&v.h2[11]==='12. Plannings prévisionnels (référence, pas une preuve)'&&v.h2[12]==='13. Intégrité','imprimable : 13 sections, plannings en 12, Intégrité en 13');
    ok([SHA_A,SHA_B,SHA_C].every(h=>v.txt.includes(h))&&v.txt.includes('conflit entre plannings : aucune valeur retenue')&&v.txt.includes('ne prouve pas le travail effectué'),'imprimable : mêmes plannings que le PDF (empreintes, conflit, avertissement)');
    ok(sansNomCollegue(html),'aucun nom de collègue dans l’imprimable');
    ok(v.trop.length===0,'section 12 de l’imprimable sans débordement à 412 px (empreintes longues coupées)'+(v.trop.length?' : '+v.trop.join(', '):''));
    await vp.screenshot({path:path.join(os.tmpdir(),'mesheures-v374-imprimable.png'),fullPage:true});await vp.close();
    await pg.locator('#mhV30Dossier button',{hasText:'Export dossier JSON'}).click();
    await pg.waitForFunction(()=>window.__exports.some(x=>/dossier-complet.*\.json$/.test(x.name)),null,{timeout:10000}).catch(()=>{});
    await fermer();
    const js=await pg.evaluate(()=>{const x=window.__exports.find(x=>/dossier-complet.*\.json$/.test(x.name));return x?x.text:''});
    let o=null;try{o=JSON.parse(js)}catch(e){}
    const {integrity,...rest}=o||{};
    ok(o&&integrity.hash===crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex')&&rest.plannings.fiches.length===3&&rest.plannings.journees.some(j=>j.etat==='conflit'),'JSON : plannings inclus, empreinte vérifiable');
    ok(sansNomCollegue(js)&&!/"(titre|nomLu|bbox|couleur|localRef)"/.test(JSON.stringify(rest.plannings||{})),'JSON : aucun nom de collègue, liste fermée de champs');

    console.log('Lecture seule');
    const apres=await etat(),ecr=await pg.evaluate(()=>window.__ecritures);
    ok(!ecr.some(e=>e[1]==='mesheures_v3'||e[1]===KEY||e[0]==='clear'),'aucune écriture dans mesheures_v3 ni mh_planning_v372 pendant les trois exports'+(ecr.length?' (autres clés : '+[...new Set(ecr.map(e=>e[1]))].join(', ')+')':''));
    ok(apres.db===avant.db&&apres.pl===avant.pl&&apres.days===avant.days,'mesheures_v3, mh_planning_v372 et DB.days identiques avant / après');
    ok(await pg.evaluate(()=>window.DB===undefined),'window.DB toujours non exposé');
    ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,3).join(' | '):''));
    await ctx.close();
  }catch(e){ok(false,'exception : '+(e&&e.stack||e))}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.4.0 (Dossier : plannings prévisionnels) : OK');process.exit(fails?1:0);
});
