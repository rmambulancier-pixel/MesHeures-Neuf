#!/usr/bin/env node
/*
 * V37.4.1 — Fenêtres de dialogue intégrées (MHDialogue) dans l'application réelle (Chromium).
 * Usage : NODE_PATH=… node tests/v3741-dialogue.browser.js   · 0 = OK, 1 = échec, 2 = Playwright indisponible.
 *
 * A. Composant : rôles ARIA, texte non interprété, focus (entrée, piège, retour), Échap / Retour Android = Annuler,
 *    appui hors fenêtre, saisie facultative / obligatoire, formulaire, file d'attente, exclusivité, pont Android.
 * B. Affichage : 360 / 412 / 448 px, clair et sombre, clavier ouvert simulé (hauteur 420 px) : aucun débordement,
 *    boutons visibles, contraste lisible.
 * C. Parcours convertis, chacun annulé puis confirmé : dossier imprimable (objet saisi, vide, annulé), export JSON (plus
 *    de question), PDF signé, double appui, import JSON, restauration, Effacer tout, effacement d'une journée, suppression
 *    d'un relevé ROMI1, sauvegarde chiffrée (mots de passe différents puis identiques), événement.
 *    Dans tous ces parcours : AUCUNE fenêtre native (alert / confirm / prompt) ne s'ouvre ; données inchangées si Annuler.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const ROOT=path.join(__dirname,'..','app/src/main/assets/web');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const DBSEED={s:fx.s,days:fx.days,periods:[{start:'2026-08-24',nb:2}],per:{start:'2026-08-24',nb:2},bul:{},bulletins:[],romi:{},constats:[],events:[]};
const ROMI={'2026-08-24_2026-09-20':{schema:'romi1/1',savedAt:'2026-09-28T10:00:00Z',data:{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}}};
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});

async function ouvrir(b,o){o=o||{};
  const ctx=await b.newContext({viewport:{width:o.W||412,height:o.H||915},deviceScaleFactor:2,isMobile:true,hasTouch:true,colorScheme:o.theme||'dark',serviceWorkers:'block'});
  const pg=await ctx.newPage(),errs=[],natifs=[];
  pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/planning-source|Failed to load resource/.test(m.text()))errs.push(m.text())});
  pg.on('dialog',d=>{natifs.push(d.type()+' : '+d.message().slice(0,60));d.dismiss().catch(()=>{})});
  await pg.addInitScript(([db,romi,theme])=>{
    try{if(!sessionStorage.getItem('seed')){localStorage.setItem('mesheures_v3',JSON.stringify(db));localStorage.setItem('mh_romi_master_v35',JSON.stringify(romi));localStorage.setItem('mesheures_theme',theme);sessionStorage.setItem('seed','1')}}catch(e){}
    const out=[];let cur=null;window.__exports=out;window.__prints=[];window.__etats=[];window.__themes=[];
    window.MesHeuresAndroid={
      beginFileExport:(n,m)=>{cur={name:n,mime:m,text:'',b64:[]};return true},appendFileExportChunk:c=>{cur.text+=c},finishFileExport:()=>{out.push(cur);cur=null;return true},
      beginBinaryFileExport:(n,m)=>{cur={name:n,mime:m,text:'',b64:[]};return true},appendBinaryFileExportChunk:c=>{cur.b64.push(c)},finishBinaryFileExport:()=>{out.push(cur);cur=null;return true},
      printHtml:h=>window.__prints.push(h),dialogueEtat:v=>window.__etats.push(v),dialogueTheme:j=>window.__themes.push(j)}
  },[DBSEED,ROMI,o.theme||'dark']);
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2200);
  return {ctx,pg,errs,natifs};
}
const fenetre=pg=>pg.locator('[data-k="mh-dialogue"]');
const nb=pg=>pg.locator('[data-k="mh-dialogue"]').count();
const attendre=async pg=>{await pg.waitForSelector('[data-k="mh-dialogue"]',{timeout:5000}).catch(()=>{});await pg.waitForTimeout(80)};
const okBtn=pg=>pg.locator('[data-k="mh-dialogue-ok"]'),annBtn=pg=>pg.locator('[data-k="mh-dialogue-annuler"]');
const lum=c=>{const m=c.match(/\d+(\.\d+)?/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*m[0]+0.7152*m[1]+0.0722*m[2]};
const contraste=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
const db=pg=>pg.evaluate(()=>localStorage.getItem('mesheures_v3'));
/* valeur d'une promesse de la page, sans jamais bloquer le test : « EN ATTENTE » si elle n'est pas résolue en 3 s */
const val=(pg,n)=>pg.evaluate(n=>Promise.race([window[n],new Promise(r=>setTimeout(()=>r('EN ATTENTE'),3000))]),n);
const vider=async pg=>{for(let i=0;i<6&&await nb(pg);i++){await okBtn(pg).click();await pg.waitForTimeout(60)}};

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    console.log('A. Composant MHDialogue');
    {const {ctx,pg,errs,natifs}=await ouvrir(b);
      ok(await pg.evaluate(()=>!!window.MHDialogue&&window.MHDialogue.version==='37.4.1'),'module MHDialogue chargé (37.4.1)');
      const th=await pg.evaluate(()=>window.__themes.length?JSON.parse(window.__themes[window.__themes.length-1]):null);
      ok(th&&th.sombre===true&&/\S/.test(th.fond)&&/\S/.test(th.action)&&/\S/.test(th.danger),'thème transmis à Android au démarrage (sombre, couleurs de l’application)');
      /* info : texte non interprété, rôles, focus rendu à l'élément d'origine */
      await pg.evaluate(()=>{const bt=document.createElement('button');bt.id='origine';bt.textContent='origine';document.body.appendChild(bt);bt.focus();
        window.__r=MHDialogue.info({titre:'Titre <b>x</b>',message:'<img src=x onerror="window.__xss=1">Ligne 1\nLigne 2',details:'abc'}).then(()=>window.__fini=true)});
      await attendre(pg);
      const a=await pg.evaluate(()=>{const d=document.querySelector('[data-k="mh-dialogue"]');const lb=document.getElementById(d.getAttribute('aria-labelledby')),ds=document.getElementById(d.getAttribute('aria-describedby'));
        return {role:d.getAttribute('role'),modal:d.getAttribute('aria-modal'),titre:lb&&lb.textContent,img:!!d.querySelector('img'),msg:ds&&ds.textContent,focus:document.activeElement&&document.activeElement.getAttribute('data-k'),etats:window.__etats.slice()}});
      ok(a.role==='dialog'&&a.modal==='true'&&a.titre==='Titre <b>x</b>'&&!a.img&&/Ligne 1\nLigne 2/.test(a.msg),'info : role=dialog, aria-modal, titre et message reliés, texte inséré tel quel (aucun HTML interprété)');
      ok(a.focus==='mh-dialogue-ok'&&a.etats[a.etats.length-1]===true,'focus sur « OK » ; Android informé de l’ouverture (dialogueEtat(true))');
      await pg.keyboard.press('Tab');await pg.keyboard.press('Tab');
      ok(await pg.evaluate(()=>!!document.activeElement.closest('[data-k="mh-dialogue"]')),'Tab : le focus reste dans la fenêtre');
      await okBtn(pg).click();await pg.waitForTimeout(80);
      ok(await nb(pg)===0&&await pg.evaluate(()=>window.__fini&&document.activeElement&&document.activeElement.id==='origine'&&window.__etats[window.__etats.length-1]===false&&!window.__xss),'OK : fenêtre fermée, focus rendu au bouton d’origine, Android informé (dialogueEtat(false))');
      /* confirmation destructive */
      await pg.evaluate(()=>{window.__c=MHDialogue.confirmer({titre:'Supprimer ?',message:'m',action:'Supprimer',danger:true})});await attendre(pg);
      const c=await pg.evaluate(()=>{const d=document.querySelector('[data-k="mh-dialogue"]'),o=d.querySelector('[data-k="mh-dialogue-ok"]');
        return {role:d.getAttribute('role'),focus:document.activeElement.getAttribute('data-k'),txt:o.textContent,bg:getComputedStyle(o).backgroundColor,bad:getComputedStyle(document.documentElement).getPropertyValue('--bad').trim()}});
      ok(c.role==='alertdialog'&&c.focus==='mh-dialogue-annuler'&&c.txt==='Supprimer','danger : role=alertdialog, focus initial sur « Annuler », verbe explicite');
      ok(/rgb/.test(c.bg)&&c.bg!=='rgba(0, 0, 0, 0)','danger : bouton d’action coloré (rouge du thème : '+c.bg+')');
      await pg.keyboard.press('Escape');await pg.waitForTimeout(60);
      ok((await (async v=>(v===false))(await val(pg,'__c'))),'Échap = Annuler (false)');
      await pg.evaluate(()=>{window.__c=MHDialogue.confirmer({titre:'x',message:'m'})});await attendre(pg);
      await pg.mouse.click(200,40);await pg.waitForTimeout(60);
      ok((await (async v=>(v===false))(await val(pg,'__c'))),'appui hors de la fenêtre sur une confirmation = Annuler');
      await pg.evaluate(()=>{window.__c=MHDialogue.confirmer({titre:'x',message:'m'})});await attendre(pg);
      ok(await pg.evaluate(()=>MHDialogue.retour()===true&&MHDialogue.retour()===false),'Retour Android (MHDialogue.retour) : ferme la fenêtre ouverte (true), rien ensuite (false)');
      ok((await (async v=>(v===false))(await val(pg,'__c'))),'Retour Android = Annuler');
      await pg.evaluate(()=>{window.__c=MHDialogue.confirmer({titre:'x',message:'m',action:'Valider'})});await attendre(pg);await okBtn(pg).click();
      ok((await (async v=>(v===true))(await val(pg,'__c'))),'confirmation : « Valider » = true');
      /* saisie facultative */
      await pg.evaluate(()=>{window.__s=MHDialogue.saisir({titre:'Objet',libelle:'Objet',facultatif:true,inputmode:'text',enterkeyhint:'done',placeholder:'Ex.'})});await attendre(pg);
      const s=await pg.evaluate(()=>{const i=document.querySelector('[data-k="mh-dialogue"] input');return {focus:document.activeElement===i,type:i.type,im:i.getAttribute('inputmode'),ek:i.getAttribute('enterkeyhint'),fs:parseFloat(getComputedStyle(i).fontSize),lab:document.querySelector('label[for="'+i.id+'"]').textContent}});
      ok(s.focus&&s.type==='text'&&s.im==='text'&&s.ek==='done'&&s.fs>=16&&s.lab==='Objet','saisie : focus dans le champ, clavier texte, touche « Terminé », 16 px (pas de zoom), libellé relié');
      await pg.keyboard.press('Enter');
      ok((await (async v=>(v===''))(await val(pg,'__s'))),'saisie facultative vide + Entrée : chaîne vide (comportement d’origine conservé)');
      await pg.evaluate(()=>{window.__s=MHDialogue.saisir({titre:'Objet',facultatif:true})});await attendre(pg);await pg.keyboard.type('Inspection');await annBtn(pg).click();
      ok((await (async v=>(v===null))(await val(pg,'__s'))),'saisie : « Annuler » = null');
      await pg.evaluate(()=>{window.__s=MHDialogue.saisir({titre:'Objet',facultatif:true})});await attendre(pg);await pg.mouse.click(200,40);await pg.waitForTimeout(60);
      ok(await nb(pg)===1,'saisie : un appui hors de la fenêtre ne la ferme pas (rien de saisi n’est perdu)');
      await pg.keyboard.type('Inspection du travail');await pg.keyboard.press('Enter');
      ok((await (async v=>(v==='Inspection du travail'))(await val(pg,'__s'))),'saisie : texte rendu à la validation');
      /* saisie obligatoire, formulaire */
      await pg.evaluate(()=>{window.__s=MHDialogue.saisir({titre:'Mot de passe',type:'password'})});await attendre(pg);await okBtn(pg).click();await pg.waitForTimeout(60);
      ok(await nb(pg)===1&&/obligatoire/.test(await pg.locator('[data-k="mh-dialogue-erreur"]').textContent())&&await pg.evaluate(()=>document.querySelector('[data-k="mh-dialogue"] input').type==='password'),'saisie obligatoire vide : message dans la fenêtre, pas de fermeture ; mot de passe masqué');
      await pg.keyboard.press('Escape');
      await pg.evaluate(()=>{window.__f=MHDialogue.formulaire({titre:'F',champs:[{nom:'a',libelle:'A',requis:true},{nom:'b',libelle:'B',requis:true}],valider:x=>x.a===x.b?null:'différents'})});await attendre(pg);
      await pg.locator('[data-k="mh-dialogue"] input').nth(0).fill('x');await pg.locator('[data-k="mh-dialogue"] input').nth(1).fill('y');await okBtn(pg).click();await pg.waitForTimeout(60);
      ok(await nb(pg)===1&&(await pg.locator('[data-k="mh-dialogue-erreur"]').textContent())==='différents','formulaire : erreur de validation affichée dans la fenêtre');
      await pg.locator('[data-k="mh-dialogue"] input').nth(1).fill('x');await okBtn(pg).click();
      ok((await (async v=>(v&&v.a==='x'&&v.b==='x'))(await val(pg,'__f'))),'formulaire : valeurs rendues');
      /* file d'attente et exclusivité */
      await pg.evaluate(()=>{window.__q1=MHDialogue.info({titre:'1'});window.__q2=MHDialogue.info({titre:'2'})});await attendre(pg);
      ok(await nb(pg)===1&&(await pg.locator('[data-k="mh-dialogue"] h3').textContent())==='1','deux demandes : une seule fenêtre à la fois (la première)');
      await okBtn(pg).click();await attendre(pg);
      ok(await nb(pg)===1&&(await pg.locator('[data-k="mh-dialogue"] h3').textContent())==='2','puis la seconde');await okBtn(pg).click();
      ok(await pg.evaluate(async()=>{let n=0;const f=()=>MHDialogue.exclusif('k',async()=>{n++;await new Promise(r=>setTimeout(r,50))});await Promise.all([f(),f()]);return n===1}),'exclusif : un deuxième appui pendant le traitement est ignoré');
      /* thème clair : renvoyé à Android */
      const avant=await pg.evaluate(()=>window.__themes.length);await pg.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));await pg.waitForTimeout(80);
      ok(await pg.evaluate(n=>window.__themes.length>n&&JSON.parse(window.__themes[window.__themes.length-1]).sombre===false,avant),'changement de thème : couleurs claires renvoyées à Android');
      ok(!natifs.length&&!errs.length,'aucune fenêtre native, 0 erreur JS'+(natifs.length?' : '+natifs.join(' | '):'')+(errs.length?' : '+errs.slice(0,2).join(' | '):''));await ctx.close()}

    console.log('B. Affichage mobile (clair / sombre, clavier ouvert)');
    for(const W of [360,412,448])for(const theme of ['dark','light']){const {ctx,pg,errs,natifs}=await ouvrir(b,{W,theme});
      await pg.evaluate(()=>{MHDialogue.saisir({titre:'Dossier imprimable',message:'Objet ou destinataire du dossier (facultatif). Laisse vide pour ne rien indiquer.',libelle:'Objet ou destinataire',facultatif:true,placeholder:'Ex. : Inspection du travail'})});await attendre(pg);
      const m=async()=>pg.evaluate(()=>{const d=document.querySelector('[data-k="mh-dialogue"]'),r=d.getBoundingClientRect(),bs=[...d.querySelectorAll('.mhdlg-acts button')].map(x=>x.getBoundingClientRect()),
        i=d.querySelector('input').getBoundingClientRect(),vh=window.visualViewport?visualViewport.height:innerHeight,cs=getComputedStyle(d),p=d.querySelector('.mhdlg-msg'),o=d.querySelector('[data-k="mh-dialogue-ok"]');
        return {l:r.left,r:r.right,b:r.bottom,top:r.top,W:innerWidth,vh,sw:document.documentElement.scrollWidth,bs:bs.map(x=>[x.left,x.right,x.top,x.bottom]),i:[i.top,i.bottom],
          fg:getComputedStyle(p).color,bg:cs.backgroundColor,okfg:getComputedStyle(o).color,okbg:getComputedStyle(o).backgroundColor}});
      let x=await m();
      const dedans=x=>x.l>=0&&x.r<=x.W+0.5&&x.bs.every(q=>q[0]>=0&&q[1]<=x.W+0.5&&q[3]<=x.vh+0.5&&q[2]>=0)&&x.i[0]>=0&&x.i[1]<=x.vh+0.5;
      ok(dedans(x)&&x.sw<=x.W+1&&x.b<=x.vh+0.5,W+' px · '+(theme==='dark'?'sombre':'clair')+' : fenêtre, champ et boutons visibles, aucun débordement');
      ok(contraste(x.fg,x.bg)>=4.5&&contraste(x.okfg,x.okbg)>=3,W+' px · '+(theme==='dark'?'sombre':'clair')+' : contraste du texte '+contraste(x.fg,x.bg).toFixed(1)+' : 1, bouton '+contraste(x.okfg,x.okbg).toFixed(1)+' : 1');
      if(W===360)await pg.screenshot({path:path.join(os.tmpdir(),'mh3741-dialogue-360-'+theme+'.png')});
      await pg.setViewportSize({width:W,height:420});await pg.waitForTimeout(150);x=await m();
      ok(dedans(x)&&x.b<=x.vh+0.5,W+' px · '+(theme==='dark'?'sombre':'clair')+' · clavier ouvert (420 px de haut) : champ et boutons toujours visibles');
      if(W===360)await pg.screenshot({path:path.join(os.tmpdir(),'mh3741-dialogue-360-clavier-'+theme+'.png')});
      ok(!natifs.length&&!errs.length,W+' px · '+theme+' : 0 erreur, 0 fenêtre native');await ctx.close()}

    console.log('C. Parcours convertis');
    {const {ctx,pg,errs,natifs}=await ouvrir(b);
      await pg.evaluate(()=>tab('audit'));await pg.waitForTimeout(300);await pg.locator('#mhV30Dossier').scrollIntoViewIfNeeded();
      const carte=await pg.locator('#mhV30Dossier').innerText();
      ok(/plannings prévisionnels \(référence, pas une preuve\)/.test(carte),'carte « Dossier complet » : mentionne les plannings prévisionnels');
      await pg.evaluate(()=>tab('analyse'));await pg.waitForTimeout(200);
      ok(await pg.locator('#s-analyse button',{hasText:'🛡️ Contrôle légal · Dossier'}).count()===1,'Analyse : bouton « 🛡️ Contrôle légal · Dossier »');
      await pg.locator('#s-analyse button',{hasText:'Contrôle légal · Dossier'}).click();await pg.waitForTimeout(300);
      const bouton=t=>pg.locator('#mhV30Dossier button',{hasText:t});
      /* imprimable : objet saisi */
      await bouton('Dossier imprimable').click();await attendre(pg);
      ok((await pg.locator('[data-k="mh-dialogue"] h3').textContent())==='Dossier imprimable'&&await pg.evaluate(()=>window.__prints.length===0),'imprimable : la fenêtre intégrée demande l’objet (rien n’est encore imprimé)');
      await pg.keyboard.type('Inspection du travail');await okBtn(pg).click();await pg.waitForFunction(()=>window.__prints.length>=1,null,{timeout:8000}).catch(()=>{});
      ok(await pg.evaluate(()=>window.__prints.length===1&&window.__prints[0].includes('Objet : Inspection du travail')),'objet saisi : repris dans l’imprimable');
      /* vide */
      await bouton('Dossier imprimable').click();await attendre(pg);await okBtn(pg).click();await pg.waitForFunction(()=>window.__prints.length>=2,null,{timeout:8000}).catch(()=>{});
      ok(await pg.evaluate(()=>window.__prints.length===2&&!window.__prints[1].includes('Objet :')),'objet vide : imprimable sans ligne « Objet » (comme avant)');
      /* annulé */
      await bouton('Dossier imprimable').click();await attendre(pg);await annBtn(pg).click();await pg.waitForTimeout(500);
      ok(await pg.evaluate(()=>window.__prints.length===2),'« Annuler » : export abandonné, rien n’est imprimé');
      /* JSON : plus de question, résultat avec empreinte */
      const nJ=await pg.evaluate(()=>window.__exports.length);
      await bouton('Export dossier JSON').click();await pg.waitForFunction(n=>window.__exports.length>n,nJ,{timeout:8000}).catch(()=>{});await attendre(pg);
      const j=await pg.evaluate(()=>{const x=window.__exports[window.__exports.length-1],d=document.querySelector('[data-k="mh-dialogue-details"]');return {name:x&&x.name,hash:x&&JSON.parse(x.text).integrity.hash,det:d&&d.textContent,titre:document.querySelector('[data-k="mh-dialogue"] h3').textContent}});
      ok(/dossier-complet.*\.json$/.test(j.name)&&j.titre==='Dossier JSON','export JSON : aucune question d’objet, fichier exporté directement');
      ok(j.det==='Empreinte SHA-256 : '+j.hash,'export JSON : empreinte affichée dans la fenêtre (texte sélectionnable), identique au fichier');
      await okBtn(pg).click();
      /* double appui */
      const nD=await pg.evaluate(()=>window.__exports.length);
      await pg.evaluate(()=>{const b=[...document.querySelectorAll('#mhV30Dossier button')].find(x=>/Export dossier JSON/.test(x.textContent));b.click();b.click()});
      await pg.waitForTimeout(1500);await attendre(pg);
      ok(await pg.evaluate(n=>window.__exports.length===n+1,nD),'double appui sur « Export dossier JSON » : un seul fichier');
      await vider(pg);
      /* PDF signé */
      const nP=await pg.evaluate(()=>window.__exports.length);
      await bouton('PDF probatoire signé').click();await pg.waitForFunction(n=>window.__exports.length>=n+2,nP,{timeout:15000}).catch(()=>{});await attendre(pg);
      const pdf=await pg.evaluate(()=>({t:document.querySelector('[data-k="mh-dialogue"] h3')&&document.querySelector('[data-k="mh-dialogue"] h3').textContent,d:(document.querySelector('[data-k="mh-dialogue-details"]')||{}).textContent||''}));
      ok(pdf.t==='PDF probatoire signé'&&/Pages : \d+\nEmpreinte SHA-256 du PDF : [0-9a-f]{64}\nEmpreinte des données : [0-9a-f]{64}/.test(pdf.d),'PDF signé : PDF + signature exportés, résultat et empreintes dans la fenêtre intégrée');
      await okBtn(pg).click();
      /* sauvegarde chiffrée */
      const nC=await pg.evaluate(()=>window.__exports.length);
      await pg.locator('button',{hasText:'🔐 Backup chiffré'}).click();await attendre(pg);
      const ins=pg.locator('[data-k="mh-dialogue"] input');
      ok(await ins.count()===2&&await pg.evaluate(()=>[...document.querySelectorAll('[data-k="mh-dialogue"] input')].every(i=>i.type==='password')),'sauvegarde chiffrée : une fenêtre, deux champs mot de passe masqués');
      await ins.nth(0).fill('abc123');await ins.nth(1).fill('abc124');await okBtn(pg).click();await pg.waitForTimeout(150);
      ok(await nb(pg)===1&&/ne correspondent pas/.test(await pg.locator('[data-k="mh-dialogue-erreur"]').textContent())&&await pg.evaluate(n=>window.__exports.length===n,nC),'mots de passe différents : erreur dans la fenêtre, aucun fichier');
      await ins.nth(1).fill('abc123');await okBtn(pg).click();await pg.waitForFunction(n=>window.__exports.length>n,nC,{timeout:10000}).catch(()=>{});await attendre(pg);
      ok(await pg.evaluate(n=>window.__exports.length===n+1&&/backup-chiffre.*\.mhbackup\.json$/.test(window.__exports[window.__exports.length-1].name)&&JSON.parse(window.__exports[window.__exports.length-1].text).cipher==='AES-256-GCM',nC),'mots de passe identiques : sauvegarde chiffrée AES-256-GCM exportée');
      await okBtn(pg).click();
      /* événement */
      const nE=await pg.evaluate(()=>(DB.events||[]).length);
      await pg.locator('button',{hasText:'＋ Événement'}).click();await attendre(pg);
      const f=pg.locator('[data-k="mh-dialogue"] input, [data-k="mh-dialogue"] textarea');
      ok(await f.count()===3&&await pg.evaluate(()=>document.querySelector('[data-k="mh-dialogue"] input').type==='date'),'événement : une seule fenêtre (date avec sélecteur, type, description)');
      await annBtn(pg).click();await pg.waitForTimeout(80);
      ok(await pg.evaluate(n=>(DB.events||[]).length===n,nE),'événement annulé : rien ajouté');
      await pg.locator('button',{hasText:'＋ Événement'}).click();await attendre(pg);await f.nth(2).fill('Courrier de relance envoyé');await okBtn(pg).click();await pg.waitForTimeout(200);
      ok(await pg.evaluate(n=>(DB.events||[]).length===n+1&&DB.events[DB.events.length-1].text==='Courrier de relance envoyé'&&DB.events[DB.events.length-1].type==='Courrier',nE),'événement ajouté (date du jour, type « Courrier », description)');
      await vider(pg);
      ok(!natifs.length&&!errs.length,'dossier, PDF, sauvegarde chiffrée, événement : aucune fenêtre native, 0 erreur JS'+(natifs.length?' : '+natifs.join(' | '):'')+(errs.length?' : '+errs.slice(0,2).join(' | '):''));
      await ctx.close()}

    {const {ctx,pg,errs,natifs}=await ouvrir(b);
      console.log('C. Import, restauration, effacement, suppression');
      const fichier=path.join(os.tmpdir(),'mh3741-import.json');
      fs.writeFileSync(fichier,JSON.stringify({format:'MesHeures Backup',version:'37.4.1',data:{s:fx.s,days:{'2026-09-01':{t:'T',deb:'08:00',fin:'16:00',p:[]}}}}));
      await pg.evaluate(()=>tab('reg'));await pg.waitForTimeout(200);
      const d0=await db(pg);
      await pg.setInputFiles('#impJ',fichier);await attendre(pg);
      const ic=await pg.evaluate(()=>({t:document.querySelector('[data-k="mh-dialogue"] h3').textContent,a:document.querySelector('[data-k="mh-dialogue-ok"]').textContent,role:document.querySelector('[data-k="mh-dialogue"]').getAttribute('role')}));
      ok(ic.t==='Importer cette sauvegarde ?'&&ic.a==='Remplacer les données'&&ic.role==='alertdialog','import JSON : confirmation destructive explicite (« Remplacer les données »)');
      await annBtn(pg).click();await pg.waitForTimeout(150);
      ok(await db(pg)===d0&&await pg.evaluate(()=>document.getElementById('impJ').value===''),'import annulé : données strictement inchangées, champ fichier réinitialisé');
      await pg.setInputFiles('#impJ',fichier);await attendre(pg);await okBtn(pg).click();await pg.waitForTimeout(300);await attendre(pg);
      ok(await pg.evaluate(()=>Object.keys(DB.days).length===1&&!!DB.days['2026-09-01'])&&/Import réussi/.test(await pg.locator('[data-k="mh-dialogue"]').innerText()),'import confirmé : données remplacées, copie de sécurité, résultat affiché');
      await okBtn(pg).click();
      /* restauration du point « before-import » : l'état d'avant revient */
      const key=await pg.evaluate(()=>mhV30ListBackups().find(x=>x.reason==='before-import').key);
      const d1=await db(pg);
      await pg.evaluate(k=>{window.__rr=mhV30Restore(k)},key);await attendre(pg);
      ok((await pg.locator('[data-k="mh-dialogue"] h3').textContent())==='Restaurer ce point de sauvegarde ?'&&(await okBtn(pg).textContent())==='Restaurer','restauration : confirmation explicite (« Restaurer »)');
      await pg.keyboard.press('Escape');await pg.waitForTimeout(100);
      ok(await db(pg)===d1&&(await (async v=>(v===false))(await val(pg,'__rr'))),'restauration annulée (Échap) : données inchangées, résultat false');
      await pg.evaluate(k=>{window.__rr=mhV30Restore(k)},key);await attendre(pg);await okBtn(pg).click();await pg.waitForTimeout(250);
      ok((await val(pg,'__rr'))===true&&await pg.evaluate(n=>Object.keys(DB.days).length===n,Object.keys(fx.days).length)&&/Restauration terminée/.test(await pg.locator('[data-k="mh-dialogue"]').innerText()),'restauration confirmée : journées d’origine restaurées');
      await okBtn(pg).click();
      /* journée */
      const jour='2026-08-24',avantJ=await pg.evaluate(k=>JSON.stringify(DB.days[k]),jour);
      await pg.evaluate(k=>{curDate=k;clearDay()},jour);await attendre(pg);
      ok((await pg.locator('[data-k="mh-dialogue"] h3').textContent())==='Effacer la journée du '+await pg.evaluate(k=>short(k),jour)+' ?'&&(await okBtn(pg).textContent())==='Effacer','journée : confirmation explicite (« Effacer »)');
      await annBtn(pg).click();await pg.waitForTimeout(80);
      ok(await pg.evaluate(k=>JSON.stringify(DB.days[k]),jour)===avantJ,'effacement annulé : journée inchangée');
      await pg.evaluate(k=>{curDate=k;clearDay()},jour);await attendre(pg);await pg.evaluate(()=>{curDate='2026-08-25'});await okBtn(pg).click();await pg.waitForTimeout(150);
      ok(await pg.evaluate(k=>DB.days[k].t==='REPOS'&&!DB.days[k].deb,jour)&&await pg.evaluate(()=>!!DB.days['2026-08-25'].deb),'effacement confirmé : la journée demandée est effacée, même si la date affichée a changé entre-temps');
      /* ROMI1 */
      await pg.evaluate(()=>tab('romi'));await pg.waitForTimeout(400);
      const del=pg.locator('[data-del]');
      ok(await del.count()===1,'ROMI1 : un relevé enregistré, bouton de suppression');
      await del.first().click();await attendre(pg);
      ok((await okBtn(pg).textContent())==='Supprimer'&&await pg.evaluate(()=>document.querySelector('[data-k="mh-dialogue"]').getAttribute('role')==='alertdialog'),'ROMI1 : confirmation explicite (« Supprimer »)');
      await annBtn(pg).click();await pg.waitForTimeout(80);
      ok(await pg.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mh_romi_master_v35'))).length===1),'suppression annulée : relevé conservé');
      await pg.locator('[data-del]').first().click();await attendre(pg);await okBtn(pg).click();await pg.waitForTimeout(150);
      ok(await pg.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mh_romi_master_v35')||'{}')).length===0),'suppression confirmée : relevé supprimé');
      /* Effacer tout : annulation, puis confirmation */
      await pg.evaluate(()=>tab('reg'));await pg.waitForTimeout(150);
      const d2=await db(pg);
      await pg.locator('button',{hasText:'🗑 Effacer tout'}).click();await attendre(pg);
      ok((await okBtn(pg).textContent())==='Effacer tout'&&await pg.evaluate(()=>document.activeElement.getAttribute('data-k')==='mh-dialogue-annuler'),'Effacer tout : confirmation explicite, focus sur « Annuler »');
      await pg.evaluate(()=>MHDialogue.retour());await pg.waitForTimeout(100);
      ok(await db(pg)===d2,'Effacer tout annulé (Retour Android) : données inchangées');
      await pg.locator('button',{hasText:'🗑 Effacer tout'}).click();await attendre(pg);await okBtn(pg).click();await pg.waitForTimeout(250);
      ok(await pg.evaluate(()=>Object.keys(DB.days).length===0)&&/Données locales effacées/.test(await pg.locator('[data-k="mh-dialogue"]').innerText()),'Effacer tout confirmé : données effacées, message affiché');
      await okBtn(pg).click();
      ok(!natifs.length&&!errs.length,'import, restauration, journée, ROMI1, Effacer tout : aucune fenêtre native, 0 erreur JS'+(natifs.length?' : '+natifs.join(' | '):'')+(errs.length?' : '+errs.slice(0,2).join(' | '):''));
      await ctx.close()}
  }catch(e){ok(false,'exception : '+(e&&e.stack||e))}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.4.1 (fenêtres de dialogue) : OK');process.exit(fails?1:0);
});
