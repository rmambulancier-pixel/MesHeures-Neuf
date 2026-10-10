#!/usr/bin/env node
/*
 * V37.0-D — Dossier probatoire dans l'application réelle (Chromium, largeur Pixel 10 Pro XL : 412 px).
 * Usage : node tests/v37-dossier.browser.js   (Playwright + Chromium)
 * Code de sortie : 0 = OK, 1 = échec, 2 = Playwright indisponible.
 *
 * 1. Pont natif simulé (comme le WebView du téléphone) : PDF signé + .sig.json via beginBinaryFileExport,
 *    imprimable via printHtml, JSON via beginFileExport. Le PDF est relu, l'empreinte et la signature ECDSA vérifiées.
 * 2. Sans pont (navigateur) : téléchargement réel du PDF, fenêtre imprimable non vide.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {readPdf}=require('./pdf-reader');
const ROOT=path.join(__dirname,'..','app/src/main/assets/web');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const constats=[{id:'C18-legacy-pause',jour_concerne:'2026-09-04',regle_violie:'Pause minimale de 20 min à contrôler dès 6 h de TTE.',article_source:'L3121-16',calcul_brut:20,calcul_montant_du:4.92,niveau:'critique',date_constat:'2026-10-01T00:00:00Z'}];
const DBSEED={s:fx.s,days:fx.days,periods:[{start:'2026-08-24',nb:2}],per:{start:'2026-08-24',nb:2},bul:{},bulletins:[],romi:{},constats};
const ROMI={'2026-08-24_2026-09-20':{data:{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}}};
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
const PIXEL={viewport:{width:412,height:915},deviceScaleFactor:3.5,isMobile:true,hasTouch:true};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};

const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});

async function openApp(b,bridge){
  const ctx=await b.newContext({...PIXEL,serviceWorkers:'block',acceptDownloads:true}),pg=await ctx.newPage();
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  /* V37.4.1 : plus aucune fenêtre native dans ces parcours (fenêtres intégrées MHDialogue) ; toute fenêtre native est comptée */
  pg.on('dialog',d=>{pg.__natifs=(pg.__natifs||[]).concat(d.type()+' : '+d.message().slice(0,60));d.type()==='prompt'?d.accept('Inspection du travail'):d.accept()});
  await pg.addInitScript(([d,romi,bridge])=>{
    try{if(!sessionStorage.getItem('seed')){localStorage.setItem('mesheures_v3',JSON.stringify(d));localStorage.setItem('mh_romi_master_v35',JSON.stringify(romi));sessionStorage.setItem('seed','1')}}catch(e){}
    if(bridge){const out=[];let cur=null;window.__exports=out;window.__prints=[];
      window.MesHeuresAndroid={
        beginFileExport:(n,m)=>{cur={name:n,mime:m,text:'',b64:[]};return true},appendFileExportChunk:c=>{cur.text+=c},finishFileExport:()=>{out.push(cur);cur=null;return true},
        beginBinaryFileExport:(n,m)=>{cur={name:n,mime:m,text:'',b64:[]};return true},appendBinaryFileExportChunk:c=>{cur.b64.push(c)},finishBinaryFileExport:()=>{out.push(cur);cur=null;return true},
        printHtml:h=>window.__prints.push(h)}}
  },[DBSEED,ROMI,bridge]);
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2500);
  await pg.evaluate(()=>tab('audit'));await pg.waitForTimeout(400);
  return {ctx,pg,errs};
}
/* fenêtre intégrée : texte affiché, puis « OK » / « Continuer » (après saisie éventuelle) */
async function fenetre(pg){await pg.waitForSelector('[data-k="mh-dialogue"]',{timeout:15000}).catch(()=>{});return pg.locator('[data-k="mh-dialogue"]').count()?pg.locator('[data-k="mh-dialogue"]').innerText():''}
async function valider(pg,texte){if(texte!=null)await pg.locator('[data-k="mh-dialogue"] input').fill(texte);await pg.locator('[data-k="mh-dialogue-ok"]').click();await pg.waitForTimeout(100)}
async function button(pg,label){
  const btn=pg.locator('#mhV30Dossier button',{hasText:label});await btn.scrollIntoViewIfNeeded();
  const box=await btn.boundingBox(),vis=await btn.isVisible();
  return {btn,ok:vis&&box&&box.x>=0&&box.x+box.width<=412&&box.height>=30,box};
}

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    console.log('Pixel 10 Pro XL (412 px) · pont natif Android simulé');
    const A=await openApp(b,true),pg=A.pg;
    const before=await pg.evaluate(()=>localStorage.getItem('mesheures_v3'));
    const sec=await pg.evaluate(()=>{const s=document.getElementById('mhV30Dossier');return s?{w:s.scrollWidth,cw:document.documentElement.clientWidth}:null});
    ok(sec&&sec.w<=sec.cw,'carte « Dossier complet » présente, sans débordement horizontal');
    await pg.locator('#mhV30Dossier').scrollIntoViewIfNeeded();await pg.waitForTimeout(800);
    const hashTxt=await pg.locator('#mhV30DossierHash').textContent();
    ok(/^Empreinte actuelle SHA-256 : [0-9a-f]{64}$/.test(hashTxt.trim()),'empreinte affichée dès que la carte devient visible (calcul suspendu hors écran)');

    const P=await button(pg,'PDF probatoire signé');ok(P.ok,'bouton « PDF probatoire signé » visible et accessible ('+(P.box&&Math.round(P.box.width)+'×'+Math.round(P.box.height))+')');
    await P.btn.click();
    await pg.waitForFunction(()=>window.__exports.length>=2,null,{timeout:15000}).catch(()=>{});
    const ex=await pg.evaluate(()=>window.__exports);
    const pdfX=ex.find(x=>/\.pdf$/.test(x.name)),sigX=ex.find(x=>/\.sig\.json$/.test(x.name));
    ok(pdfX&&pdfX.mime==='application/pdf'&&pdfX.b64.length>0,'PDF transmis au pont natif binaire ('+(pdfX?pdfX.b64.length+' bloc(s)':'aucun')+')');
    const bytes=pdfX?Buffer.concat(pdfX.b64.map(c=>Buffer.from(c,'base64'))):Buffer.alloc(0);
    let R=null;try{R=readPdf(bytes)}catch(e){ok(false,'PDF illisible : '+e.message)}
    if(R){
      /* V37.0-H : le nombre de pages dépend de la date (fenêtre Smart Control de 28 jours) ; critère précis plutôt qu'un seuil d'opérations :
         chaque page porte du contenu hors en-tête / pied, et aucune page n'est un fragment orphelin (titre ou tableau, ou au moins 5 lignes). */
      const body=p=>p.ops.filter(o=>!/^MesHeures · Dossier probatoire · généré le|^Empreinte des données \(SHA-256\)|^Page \d+ \/ \d+$/.test(o.tx));
      const N=R.pagesDecl;ok(N>=2&&R.pages.every(p=>{const b=body(p);return b.length>=3&&(b.some(o=>o.bold)||b.length>=5)}),'PDF valide et non vide : '+N+' pages, '+bytes.length+' octets, aucune page blanche ni orpheline');
      ok(['167h55','173h25','32h00','30h55','0h45','13 / 2','150h15','16 / 18'].every(v=>R.text.includes(v)),'valeurs de référence présentes (TTE, amplitude, HS, IDAJ, paniers, ROMI1)');
      ok(R.flat.includes('Smart Control')&&/\d+ % des contrôles conformes/.test(R.text),'Smart Control repris');
      ok(R.flat.includes('Pause minimale de 20 min')&&R.flat.includes('non chiffré')&&!R.text.includes('4,92'),'constat de pause hérité listé sans montant (pas de 4,92 €)');
      ok(!BAD.test(R.text),'aucune valeur undefined / NaN / null dans le PDF');
      const sig=sigX?JSON.parse(Buffer.from(sigX.b64.map(c=>Buffer.from(c,'base64')).reduce((a,c)=>Buffer.concat([a,c]),Buffer.alloc(0))).toString('utf8')):null;
      const pdfHash=crypto.createHash('sha256').update(bytes).digest('hex');
      ok(sig&&sig.pdfSha256===pdfHash&&sig.hash===pdfHash,'.sig.json : empreinte SHA-256 = PDF réellement exporté');
      const dataHash=sig?crypto.createHash('sha256').update(JSON.stringify(sig.dossier)).digest('hex'):'';
      ok(sig&&sig.dataSha256===dataHash&&R.text.includes(dataHash),'empreinte des données = SHA-256 du dossier joint, imprimée dans le PDF');
      let verified=false;try{const key=await crypto.webcrypto.subtle.importKey('jwk',sig.publicKeyJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
        verified=await crypto.webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,Buffer.from(sig.signature,'base64'),new TextEncoder().encode(pdfHash))}catch(e){}
      ok(verified,'signature ECDSA P-256 vérifiée avec la clé publique jointe');
      ok(sig&&sig.pages===N,'nombre de pages déclaré dans la signature = PDF');
      fs.writeFileSync(path.join(require('os').tmpdir(),'mesheures-v37d-pixel.pdf'),bytes);
    }
    const msgPdf=await fenetre(pg);ok(/Choisis où enregistrer le PDF/.test(msgPdf),'message Android « Choisis où enregistrer » affiché (fenêtre intégrée)');await valider(pg);

    const I=await button(pg,'Dossier imprimable');ok(I.ok,'bouton « Dossier imprimable / PDF » visible et accessible');
    await I.btn.click();ok(/Objet ou destinataire/.test(await fenetre(pg)),'objet demandé dans la fenêtre intégrée');await valider(pg,'Inspection du travail');
    await pg.waitForFunction(()=>window.__prints.length>=1,null,{timeout:10000}).catch(()=>{});
    const html=await pg.evaluate(()=>window.__prints[0]||'');
    ok(html.length>5000&&html.includes('167h55')&&html.includes('Objet : Inspection du travail')&&!BAD.test(html.replace(/<[^>]+>/g,' ')),'imprimable transmis à printHtml : complet, objet repris, aucune valeur invalide');
    const vp=await A.ctx.newPage();await vp.setContent(html);
    const v=await vp.evaluate(()=>({len:document.body.innerText.length,h2:document.querySelectorAll('h2').length,ow:document.documentElement.scrollWidth}));
    ok(v.len>3000&&v.h2===13,'imprimable rendu : 13 sections (V37.1 : travail de nuit ; V37.4 : plannings prévisionnels), '+v.len+' caractères (pas de page blanche)');
    await vp.screenshot({path:path.join(require('os').tmpdir(),'mesheures-v37d-imprimable.png')});await vp.close();

    const J=await button(pg,'Export dossier JSON');ok(J.ok,'bouton « Export dossier JSON » visible et accessible');
    await J.btn.click();await pg.waitForFunction(()=>window.__exports.some(x=>/\.json$/.test(x.name)&&!/sig/.test(x.name)),null,{timeout:10000}).catch(()=>{});
    ok(/Empreinte SHA-256 : [0-9a-f]{64}/.test(await fenetre(pg)),'JSON : aucune question d’objet, empreinte affichée dans la fenêtre intégrée');await valider(pg);
    const js=await pg.evaluate(()=>{const x=window.__exports.find(x=>/dossier-complet.*\.json$/.test(x.name));return x?x.text:''});
    let jsOk=false;try{const o=JSON.parse(js),{integrity,...rest}=o;jsOk=integrity.hash===crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex')&&rest.periodes.length>0&&rest.romi.length===1}catch(e){}
    ok(jsOk,'JSON : même dossier que le PDF, empreinte SHA-256 vérifiable, ROMI1 inclus');

    const after=await pg.evaluate(()=>localStorage.getItem('mesheures_v3'));
    ok(before===after,'aucune écriture dans les données (localStorage identique avant / après les 3 exports)');
    ok(await pg.evaluate(()=>window.DB===undefined),'window.DB toujours non exposé');
    ok(!(pg.__natifs||[]).length,'aucune fenêtre native dans les trois exports'+((pg.__natifs||[]).length?' : '+pg.__natifs.join(' | '):''));
    ok(A.errs.length===0,'0 erreur JavaScript'+(A.errs.length?' : '+A.errs.slice(0,3).join(' | '):''));
    await A.ctx.close();

    console.log('Navigateur sans pont natif (repli)');
    const B=await openApp(b,false),pb=B.pg;
    const dl=pb.waitForEvent('download',{timeout:15000}).catch(()=>null);
    await (await button(pb,'PDF probatoire signé')).btn.click();const d=await dl;await fenetre(pb);await valider(pb);
    let bb=null;if(d){const f=await d.path();bb=f?fs.readFileSync(f):null}
    let RB=null;try{RB=bb&&readPdf(bb)}catch(e){}
    ok(d&&/\.pdf$/.test(d.suggestedFilename())&&RB&&RB.pages.length>=2&&RB.text.includes('167h55'),'téléchargement du PDF : fichier récupéré, valide, '+(RB?RB.pages.length:0)+' pages');
    const pop=pb.waitForEvent('popup',{timeout:10000}).catch(()=>null);
    await (await button(pb,'Dossier imprimable')).btn.click();await fenetre(pb);await valider(pb,'');const w=await pop;
    let wl=0;if(w){await w.waitForLoadState().catch(()=>{});wl=await w.evaluate(()=>document.body.innerText.length).catch(()=>0)}
    ok(wl>3000,'fenêtre imprimable non vide ('+wl+' caractères)');
    ok(B.errs.length===0,'0 erreur JavaScript (repli)'+(B.errs.length?' : '+B.errs.slice(0,3).join(' | '):''));
    await B.ctx.close();
  }catch(e){ok(false,'exception : '+e.message)}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.0-D : OK');process.exit(fails?1:0);
});
