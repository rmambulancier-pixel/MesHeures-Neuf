#!/usr/bin/env node
/*
 * V37.2.0-C — analyse du planning, application réelle (Chromium), VRAI OCR tesseract.js (fra) embarqué dans l'APK.
 * Planning SYNTHÉTIQUE dessiné dans le navigateur (canvas, noms inventés, mise en page proche de la photo réelle :
 * titre, en-têtes « L 02/11 », colonne des noms, cellules colorées séparées par des liserés clairs, texte blanc).
 * Parcours : import → Analyser → écran ANALYSE DU PLANNING → corrections / confirmations tracées → Valider (planning
 * prévisionnel ; journées réelles inchangées) ; Rejeter ; choix manuel de la ligne ; 360 / 412 / 448 px clair et sombre.
 * Le taux de lecture réel est MESURÉ et affiché ; le test exige seulement qu'aucune valeur fausse ne soit « OK ».
 * Usage : NODE_PATH=… node tests/v372-planning-analysis.browser.js · 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const NOW=new Date('2026-10-08T10:00:00');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};const info=m=>console.log('  ··  '+m);
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(WEB,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
const seed=()=>({s:R1.s,days:{...R1.days,...R2.days},periods:[],per:{start:'2026-09-21',nb:2},bul:{},bulletins:[],romi:{},cmp:{}});
const NOMS=['DUPONT Alice','MARTIN Paul','ROTH Mickael','LEROY Inès','GARNIER Hugo'];
const CYCLE=['Jour 7h','Repos','Samu','Jour 7h','Jour 7h','Repos','Condom'];
const COUL={'Jour 7h':'#1f7a3d','Repos':'#6e6e75','Samu':'#8c3c96','Condom':'#0f3c37'};
/* dessin du planning (exécuté dans la page) ; retourne un PNG en base64 et la vérité terrain de la ligne de ROTH */
function dessiner(o){
  const LT=['D','L','M','M','J','V','S'],add=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const cw=58,ch=38,g=4,nomW=230,x0=40+nomW,cols=o.n,W=x0+cols*(cw+g)+40,H=180+o.noms.length*(ch+g)+60;
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  x.fillStyle='#f6f6f4';x.fillRect(0,0,W,H);x.textBaseline='middle';
  x.fillStyle='#111';x.font='bold 26px Arial';x.fillText(o.titre,40,48);
  for(let j=0;j<cols;j++){const d=add(o.debut,j),t=LT[new Date(d+'T12:00:00Z').getUTCDay()]+' '+d.slice(8)+'/'+d.slice(5,7);
    x.font='bold 13px Arial';x.fillStyle='#111';x.textAlign='center';x.fillText(t,x0+j*(cw+g)+cw/2,128)}
  o.noms.forEach((nom,i)=>{const y=150+i*(ch+g);x.textAlign='left';x.font='bold 15px Arial';x.fillStyle='#111';x.fillText(nom,40,y+ch/2);
    o.lignes[i].forEach((lab,j)=>{x.fillStyle=o.coul[lab]||'#2a4aa0';x.fillRect(x0+j*(cw+g),y,cw,ch);x.fillStyle='#fff';x.textAlign='center';x.font='bold 13px Arial';
      String(lab).split('\n').forEach((l,k,a)=>x.fillText(l,x0+j*(cw+g)+cw/2,y+ch/2+(k-(a.length-1)/2)*15))})});
  if(o.retourne){const r=document.createElement('canvas');r.width=W;r.height=H;const rx=r.getContext('2d');rx.translate(W,H);rx.rotate(Math.PI);rx.drawImage(c,0,0);
    return {b64:r.toDataURL('image/jpeg',0.9).split(',')[1],w:W,h:H}}
  if(o.jpeg)return {b64:c.toDataURL('image/jpeg',0.9).split(',')[1],w:W,h:H};
  return c.toDataURL('image/png').split(',')[1];
}
/* PDF « scanné » minimal : une image JPEG (DCTDecode) pleine page par page, sans texte (comme un scan de téléphone) */
function pdfScan(pages){const parts=[],off=[];let n=0;const push=b=>{parts.push(Buffer.isBuffer(b)?b:Buffer.from(b,'latin1'));n+=parts[parts.length-1].length};
  push('%PDF-1.4\n');const nb=pages.length,kids=pages.map((_,i)=>(3+i*3)+' 0 R').join(' ');
  const obj=(id,body)=>{off[id]=n;push(id+' 0 obj\n');(Array.isArray(body)?body:[body]).forEach(push);push('\nendobj\n')};
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids ['+kids+'] /Count '+nb+' >>');
  pages.forEach((p,i)=>{const id=3+i*3,W=Math.round(p.w*0.4),H=Math.round(p.h*0.4),cs='q '+W+' 0 0 '+H+' 0 0 cm /Im0 Do Q';
    obj(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');
    obj(id+1,['<< /Type /XObject /Subtype /Image /Width '+p.w+' /Height '+p.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.jpeg.length+' >>\nstream\n',p.jpeg,'\nendstream']);
    obj(id+2,'<< /Length '+cs.length+' >>\nstream\n'+cs+'\nendstream')});
  const total=3+nb*3,x=n;push('xref\n0 '+total+'\n0000000000 65535 f \n');for(let i=1;i<total;i++)push(String(off[i]).padStart(10,'0')+' 00000 n \n');
  push('trailer\n<< /Size '+total+' /Root 1 0 R >>\nstartxref\n'+x+'\n%%EOF\n');return Buffer.concat(parts)}
async function open(b,W,theme){
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/planning-source|Failed to load resource/.test(m.text()))errs.push(m.text())});
  pg.__answers=[];pg.__dialogs=[];pg.on('dialog',d=>{pg.__dialogs.push(d.type()+':'+d.message());const a=pg.__answers.shift();if(a===false)d.dismiss();else if(d.type()==='prompt')d.accept(a==null?d.defaultValue():String(a));else d.accept()});
  await pg.clock.setFixedTime(NOW);
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mesheures_theme',d.t);if(d.pl)localStorage.setItem('mh_planning_v372',d.pl);sessionStorage.setItem('s','1')}}catch(e){}},{db:seed(),t:theme,pl:pg.__pl||null});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2200);
  return {ctx,pg,errs};
}
const tabPrevu=async pg=>{await pg.locator('#mhV30Nav [data-nav-tab="prevu"]').click();await pg.waitForTimeout(250)};
const txt=pg=>pg.evaluate(()=>document.getElementById('s-prevu').innerText);
const moteur=pg=>pg.evaluate(()=>JSON.stringify({cd:Object.keys(DB.days).sort().map(k=>{const r=cd(k);return [k,r.tte,r.amp,r.pz,r.nuit,r.idaj,r.ir,r.iru]}),
  per:calcPer('2026-08-24',2).G,brut:brutOf(calcPer('2026-08-24',2).G),sc:MHControl.analyze({end:'2026-10-08'}).counts,days:JSON.parse(localStorage.getItem('mesheures_v3')).days}));
const overflow=(pg,sel)=>pg.evaluate(sel=>{const root=document.querySelector(sel),out=[];if(!root)return ['absent'];
  if(document.documentElement.scrollWidth>innerWidth+1)out.push('page '+document.documentElement.scrollWidth+' px');
  [...root.querySelectorAll('*')].forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&e.offsetParent&&r.right>innerWidth+1)out.push(e.tagName+'.'+String(e.className).slice(0,20))});return out.slice(0,4)},sel);
async function importerPng(pg,b64,nom){
  await tabPrevu(pg);if(!(await pg.locator('#mh372Imp').count()))await pg.locator('#mh372Open').click();
  await pg.locator('#mh372Imp input[data-src="fichier"]').setInputFiles({name:nom,mimeType:'image/png',buffer:Buffer.from(b64,'base64')});
  await pg.waitForFunction(()=>!/Import en cours/.test(document.getElementById('s-prevu').innerText),null,{timeout:20000});await pg.waitForTimeout(150);
}
async function analyser(pg){const t0=Date.now();await pg.locator('#s-prevu [data-k="lancer"]').click();
  await pg.waitForFunction(()=>!document.querySelector('#s-prevu [data-k="progression"]')&&document.querySelector('#s-prevu [data-k="analyse-ecran"],#s-prevu [data-k="msg"]'),null,{timeout:420000});
  return Date.now()-t0}
/* Revue des lignes « à vérifier » du planning ouvert : confirmer ce qui est juste, corriger le reste avec la vérité terrain. */
async function revoirLignes(pg,V,typ){let n=0;
  for(let k=0;k<80;k++){const row=pg.locator('#s-prevu tr[data-revoir="1"]').first();if(!(await row.count()))break;
    const i=+await row.getAttribute('data-i'),A=Object.values(JSON.parse(await pg.evaluate(()=>localStorage.getItem('mh_planning_v372'))).analyses)[0],cell=A.cells[i];
    const ver=V[cell.table],v=ver.find(x=>x.date===(cell.date||cell.dateProposee))||ver[cell.colonne];
    const juste=cell.interpretation&&cell.interpretation.regle===typ[v.lab]&&(cell.date||cell.dateProposee)===v.date;pg.__answers.length=0;
    if(juste){if(!cell.date&&!cell.dateProposee)pg.__answers.push(v.date.slice(8)+'/'+v.date.slice(5,7)+'/'+v.date.slice(0,4));await pg.locator('#s-prevu tr.mh372-act').first().locator('[data-k="confirmer"]').click()}
    else{if(!cell.date)pg.__answers.push(v.date.slice(8)+'/'+v.date.slice(5,7)+'/'+v.date.slice(0,4));pg.__answers.push(v.lab);await pg.locator('#s-prevu tr.mh372-act').first().locator('[data-k="corriger"]').click()}
    n++;await pg.waitForTimeout(60)}
  pg.__answers.length=0;return n}
const stockees=pg=>pg.evaluate(()=>JSON.parse(localStorage.getItem('mh_planning_v372')||'{}'));

srv.listen(0,async()=>{
  const b=await chromium.launch();let etat=null,etatPdf=null,etatPdf2=null;
  try{
    const debut='2026-11-02',n=31,add=(k,i)=>new Date(Date.parse(k+'T12:00:00Z')+i*864e5).toISOString().slice(0,10);
    const lignes=NOMS.map((_,i)=>Array.from({length:n},(_,j)=>CYCLE[(i+j)%CYCLE.length]));
    const verite=lignes[2].map((l,j)=>({date:add(debut,j),lab:l}));
    console.log('Analyse réelle (tesseract.js) d’un planning synthétique');
    {const {ctx,pg,errs}=await open(b,412,'light');
      const png=await pg.evaluate(dessiner,{debut,n,titre:'Planning du 02/11/2026 au 02/12/2026',noms:NOMS,lignes,coul:COUL});
      const avant=await moteur(pg);
      await importerPng(pg,png,'planning-synthetique.png');
      ok(/Analyse du planning/.test(await txt(pg))&&await pg.locator('#s-prevu [data-k="lancer"]:not([disabled])').count()===1,'fiche : « Analyser le planning » actif');
      await pg.locator('#mh372Nom').fill('ROTH Mickael');
      const ms=await analyser(pg);const t=await txt(pg);
      info('durée de l’analyse (Chromium, '+n+' colonnes × '+NOMS.length+' lignes) : '+(ms/1000).toFixed(1)+' s');
      ok(/ANALYSE DU PLANNING/.test(t)&&/Salarié détecté/.test(t)&&/Période/.test(t)&&/Confiance/.test(t),'écran « ANALYSE DU PLANNING » : source, salarié détecté, période, confiance');
      const st=await stockees(pg),imp=Object.values(st.imports)[0],a=st.analyses&&st.analyses[imp.id];
      ok(a&&a.sourceSha256===imp.source.sha256,'analyse enregistrée, liée à l’import par le SHA-256 de l’original');
      ok(a&&a.selectedEmployee&&a.selectedEmployee.parTableau[0].ligne===2,'ligne de « ROTH Mickael » trouvée par l’OCR réel ('+(a&&a.selectedEmployee?'lue « '+a.selectedEmployee.parTableau[0].nomLu+' »':'aucune')+')');
      ok(a&&a.period&&a.period.debut===debut&&a.period.fin==='2026-12-02','période lue : 02/11/2026 → 02/12/2026');
      const heads=await pg.evaluate(()=>[...document.querySelectorAll('#s-prevu table[data-k="cellules"] th')].map(x=>x.textContent.replace(/\u00ad/g,'')));
      ok(JSON.stringify(heads)===JSON.stringify(['Date','Lecture','Interprétation','Confiance','Statut']),'tableau : Date | Lecture | Interprétation | Confiance | Statut'+(JSON.stringify(heads)===JSON.stringify(['Date','Lecture','Interprétation','Confiance','Statut'])?'':' '+JSON.stringify(heads)));
      /* mesure honnête : lectures justes / « OK » faux */
      const typ={'Jour 7h':'JOUR','Repos':'REPOS','Samu':'SAMU','Condom':'CONDOM'};   /* règle du dictionnaire (lot A) attendue */
      let justes=0,okFaux=0,okN=0,revoir=0;
      (a?a.cells:[]).forEach(c=>{const v=verite.find(x=>x.date===(c.date||c.dateProposee));const bon=v&&c.interpretation&&c.interpretation.regle===typ[v.lab];if(bon)justes++;
        if(c.status==='interprété'){okN++;if(!bon||c.date!==v.date)okFaux++}else revoir++});
      info('OCR réel : '+justes+'/'+n+' cellules interprétées justement ; '+okN+' « OK », '+revoir+' à vérifier / illisibles ; confiance globale '+Math.round((a?a.confidence:0)*100)+' %');
      ok(a&&a.cells.length===n,'31 cellules : ta ligne seulement');
      ok(okFaux===0,'aucune cellule « OK » avec une valeur fausse ('+okFaux+')');
      ok(!/DUPONT|MARTIN|LEROY|GARNIER|Alice|Inès|Hugo/.test(JSON.stringify(st)),'aucun nom de collègue enregistré');
      const rv=await pg.locator('#s-prevu tr[data-revoir="1"]').count();
      ok(rv===a.cells.filter(c=>(['à vérifier','illisible','non_interprété'].includes(c.status)||!c.date)&&!c.revue).length,'lignes « À vérifier » mises en évidence ('+rv+')');
      /* Valider avec des lignes à vérifier → refus expliqué */
      if(rv){await pg.locator('#s-prevu [data-k="valider"]').click();await pg.waitForTimeout(150);ok(/Validation impossible/.test(await txt(pg)),'Valider : refusé tant que des lignes restent à vérifier (motifs affichés)')}
      /* corriger chaque ligne à vérifier avec la vérité terrain (saisie utilisateur), confirmer les autres */
      for(let k=0;k<60;k++){const row=pg.locator('#s-prevu tr[data-revoir="1"]').first();if(!(await row.count()))break;
        const i=+await row.getAttribute('data-i'),c=(await pg.evaluate(i=>JSON.parse(localStorage.getItem('mh_planning_v372')),i));
        const cell=Object.values(c.analyses)[0].cells[i],v=verite.find(x=>x.date===(cell.date||cell.dateProposee))||verite[cell.colonne];
        const juste=cell.interpretation&&cell.interpretation.regle===typ[v.lab]&&(cell.date||cell.dateProposee)===v.date;
        if(juste){pg.__answers.push(true);await pg.locator('#s-prevu tr.mh372-act').first().locator('[data-k="confirmer"]').click()}
        else{if(!cell.date)pg.__answers.push(v.date.slice(8)+'/'+v.date.slice(5,7)+'/'+v.date.slice(0,4));pg.__answers.push(v.lab);await pg.locator('#s-prevu tr.mh372-act').first().locator('[data-k="corriger"]').click()}
        await pg.waitForTimeout(80)}
      const a2=Object.values((await stockees(pg)).analyses)[0];
      ok(await pg.locator('#s-prevu tr[data-revoir="1"]').count()===0,'toutes les lignes revues ('+a2.corrections.length+' décision(s) tracée(s))');
      ok(a2.corrections.every(x=>x.auteur==='utilisateur'&&x.le&&'valeurOcr' in x&&'avant' in x&&'apres' in x),'journal : valeur OCR, avant, après, auteur utilisateur, horodatage');
      ok(a2.cells.every(c=>typeof c.rawText==='string')&&a2.cells.filter(c=>c.texteCorrige!=null).every(c=>c.rawText!==undefined),'lecture brute conservée à côté des corrections');
      pg.__answers.push(true);await pg.locator('#s-prevu [data-k="valider"]').click();await pg.waitForTimeout(300);
      const t2=await txt(pg),st2=await stockees(pg),pl=Object.values(st2.plannings);
      ok(/Planning prévisionnel enregistré/.test(t2)&&/Analyse validée/.test(t2),'Valider cette analyse : planning prévisionnel enregistré');
      ok(pl.length===1&&pl[0].nature==='prévisionnel'&&pl[0].interpretation.length===n&&pl[0].salarie.nom==='ROTH Mickael','planning : 31 journées prévues, ta ligne, nature prévisionnelle');
      ok(pl.length===1&&pl[0].interpretation.every(x=>{const v=verite.find(y=>y.date===x.date);return v&&x.regle===typ[v.lab]}),'planning validé conforme au planning dessiné (après tes corrections)');
      ok(await moteur(pg)===avant,'journées réelles (DB.days), cd(), TTE, HS, Smart Control : inchangés');
      ok(Object.keys(await pg.evaluate(()=>({...localStorage}))).filter(k=>!['mesheures_v3','mesheures_theme'].includes(k)).every(k=>k==='mh_planning_v372'||!/planning/i.test(k)),'seule la clé Planning est écrite');
      await pg.evaluate(()=>MHPrevu.fermerAnalyse());await pg.evaluate(()=>MHPrevu.retour());await pg.waitForTimeout(100);
      ok(/validé \(prévisionnel\)/.test(await txt(pg))&&/31 journées/.test(await txt(pg)),'liste : « validé (prévisionnel) · 31 journées »');
      ok(!errs.length,'0 erreur JS'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));
      etat=await pg.evaluate(()=>localStorage.getItem('mh_planning_v372'));
      await ctx.close()}

    console.log('PDF scanné de deux pages (la 2e à l’envers), image embarquée, OCR réel');
    {const {ctx,pg,errs}=await open(b,412,'light');
      const debutO='2026-10-05',lO=NOMS.map((_,i)=>Array.from({length:31},(_,j)=>CYCLE[(i+j+3)%CYCLE.length])),verO=lO[2].map((l,j)=>({date:add(debutO,j),lab:l}));
      const p1=await pg.evaluate(dessiner,{debut,n:31,titre:'Planning du 02/11/2026 au 02/12/2026',noms:NOMS,lignes,coul:COUL,jpeg:true});
      const p2=await pg.evaluate(dessiner,{debut:debutO,n:31,titre:'Planning du 05/10/2026 au 04/11/2026',noms:NOMS,lignes:lO,coul:COUL,retourne:true});
      const pdf=pdfScan([p1,p2].map(p=>({jpeg:Buffer.from(p.b64,'base64'),w:p.w,h:p.h})));
      await tabPrevu(pg);await pg.locator('#mh372Open').click();
      await pg.locator('#mh372Imp input[data-src="fichier"]').setInputFiles({name:'planning-scan.pdf',mimeType:'application/pdf',buffer:pdf});
      await pg.waitForFunction(()=>!/Import en cours/.test(document.getElementById('s-prevu').innerText),null,{timeout:20000});await pg.waitForTimeout(150);
      await pg.locator('#mh372Nom').fill('ROTH Mickael');const ms=await analyser(pg);
      const st=await stockees(pg),imp=Object.values(st.imports)[0],a=st.analyses&&st.analyses[imp.id];
      info('PDF 2 pages : '+(ms/1000).toFixed(1)+' s');
      ok(a&&a.tableCandidates.length===2&&a.tableCandidates.map(t=>t.page).join()==='1,2','deux pages, un tableau par page');
      ok(a&&a.tableCandidates.every(t=>t.lecturePage==='image embarquée'),'scan lu sur l’image embarquée de chaque page (pas un rendu rééchantillonné)');
      ok(a&&a.tableCandidates[1].rotation180===true&&a.warnings.some(w=>w.code==='PAGE_RETOURNEE'),'page 2 à l’envers : lue tournée de 180° et signalée');
      ok(a&&JSON.stringify(a.tableCandidates.map(t=>t.periodeTitre))===JSON.stringify([{debut:'2026-11-02',fin:'2026-12-02'},{debut:'2026-10-05',fin:'2026-11-04'}]),'périodes des deux pages lues');
      ok(a&&a.selectedEmployee&&a.selectedEmployee.parTableau.length===2&&a.selectedEmployee.parTableau.every(x=>x.ligne===2),'ta ligne trouvée sur les deux pages');
      const typ={'Jour 7h':'JOUR','Repos':'REPOS','Samu':'SAMU','Condom':'CONDOM'},V={0:verite,1:verO};let justes=0,okFaux=0,okN=0;
      (a?a.cells:[]).forEach(c=>{const v=V[c.table].find(x=>x.date===(c.date||c.dateProposee))||V[c.table][c.colonne],bon=c.interpretation&&c.interpretation.regle===typ[v.lab];if(bon)justes++;
        if(c.status==='interprété'){okN++;if(!bon||c.date!==v.date)okFaux++}});
      info('OCR réel PDF : '+justes+'/62 justes ; '+okN+' « OK »');
      ok(a&&a.cells.length===62&&okFaux===0,'62 cellules (ta ligne, 2 pages), aucune « OK » fausse ('+okFaux+')');
      ok(a&&a.cells.every(c=>c.page===1||c.page===2),'chaque cellule porte sa page');
      console.log('C3 · deux plannings indépendants issus du même PDF');
      const avant=await moteur(pg),t0=await txt(pg);etatPdf=await pg.evaluate(()=>localStorage.getItem('mh_planning_v372'));
      ok(/2 plannings détectés dans ce PDF/.test(t0)&&await pg.locator('#s-prevu [data-k="unite"]').count()===2,'« 2 plannings détectés dans ce PDF » : une ligne par planning');
      ok(/Planning 1 — page 1[\s\S]*02\/11\/2026 → 02\/12\/2026[\s\S]*ROTH Mickael[\s\S]*confiance \d+ %/.test(t0)&&/Planning 2 — page 2[\s\S]*05\/10\/2026 → 04\/11\/2026[\s\S]*ROTH Mickael/.test(t0),'chaque planning : page, période, salarié, confiance');
      ok(a.unites&&a.unites.length===2&&a.unites[0].sourceSha256===a.unites[1].sourceSha256&&a.unites[0].page===1&&a.unites[1].page===2&&a.unites[0].orientation.rotation180===false&&a.unites[1].orientation.rotation180===true,'unités : même SHA, pages 1 et 2, orientations différentes');
      ok(a.unites[0].cellules.every(i=>a.cells[i].table===0)&&a.unites[1].cellules.every(i=>a.cells[i].table===1)&&a.unites[0].cellules.length===31&&a.unites[1].cellules.length===31,'cellules propres à chaque planning (31 + 31, jamais mélangées)');
      /* P2 désélectionné : la validation groupée ne vise que P1 */
      await pg.locator('#s-prevu [data-k="unite"][data-table="1"] input[data-k="choisir"]').uncheck();await pg.waitForTimeout(100);
      ok(/Valider les plannings sélectionnés \(1\)/.test(await txt(pg))||/Valider les plannings sélectionnés$/m.test(await txt(pg)),'désélection de P2 prise en compte');
      await pg.locator('#s-prevu [data-k="unite"][data-table="0"] [data-k="detail"]').click();await pg.waitForTimeout(100);
      ok(/Planning 1 — page 1/.test(await txt(pg))&&await pg.locator('#s-prevu table[data-k="cellules"] tbody tr[data-i]').count()===31,'détail de P1 : ses 31 jours seulement');
      await revoirLignes(pg,V,typ);pg.__answers.push(true);await pg.locator('#s-prevu [data-k="valider"]').click();await pg.waitForTimeout(300);
      let S=await stockees(pg),pls=Object.values(S.plannings);
      ok(pls.length===1&&pls[0].origine.page===1&&pls[0].origine.tableId===0&&pls[0].periode.debut==='2026-11-02','P1 validé sans P2 : une fiche, liée à la page 1 / tableau 1');
      let A=Object.values(S.analyses)[0];ok(A.unites[0].status==='validé'&&A.unites[1].status==='à_valider','P2 reste à valider, indépendant');
      await pg.locator('#s-prevu [data-k="toutes"]').click();await pg.waitForTimeout(100);
      await pg.locator('#s-prevu [data-k="unite"][data-table="1"] [data-k="detail"]').click();await pg.waitForTimeout(100);
      await revoirLignes(pg,V,typ);pg.__answers.push(true);await pg.locator('#s-prevu [data-k="valider"]').click();await pg.waitForTimeout(300);
      S=await stockees(pg);pls=Object.values(S.plannings).sort((x,y)=>x.origine.page-y.origine.page);
      ok(pls.length===2&&pls[1].origine.page===2&&pls[1].origine.orientation.rotation180===true&&pls[1].periode.debut==='2026-10-05'&&pls[1].periode.fin==='2026-11-04'&&pls[0].periode.fin==='2026-12-02','P2 validé : deuxième fiche, page 2 retournée, période propre (jamais fusionnée)');
      etatPdf2=await pg.evaluate(()=>localStorage.getItem('mh_planning_v372'));
      ok(pls.every(p=>p.source.sha256===imp.source.sha256&&p.salarie.nom==='ROTH Mickael'&&p.interpretation.length===31),'deux fiches : même source SHA, même salarié, 31 jours chacune');
      ok(pls.every(p=>p.interpretation.every(x=>{const v=(p.origine.page===1?verite:verO).find(y=>y.date===x.date);return v&&x.regle===typ[v.lab]})),'chaque fiche conforme à son planning dessiné');
      await pg.evaluate(()=>MHPrevu.retour());await pg.waitForTimeout(100);
      ok(await pg.locator('#s-prevu .mh372-row[data-planning]').count()===2&&await pg.locator('#s-prevu .mh372-row[data-id]').count()===0,'📋 Prévu : deux fiches issues du même PDF');
      const ids=pls.map(p=>p.id);
      pg.__answers.length=0;pg.__answers.push(true);await pg.evaluate(id=>MHPrevu.supprimerFiche(id),ids[0]);await pg.waitForTimeout(300);
      S=await stockees(pg);ok(!S.plannings[ids[0]]&&S.plannings[ids[1]]&&S.imports[imp.id]&&await pg.evaluate(async n=>!!(await MHPlanningImport.sources.existe(n)),imp.source.localRef),'suppression de P1 : P2, l’import et l’original sont conservés');
      ok(pg.__dialogs.filter(d=>/Plus aucune fiche/.test(d)).length===0,'aucune proposition de supprimer l’original tant qu’une fiche en dépend');
      ok(await pg.evaluate(async id=>(await MHPlanningImport.supprimer(id,{avecSource:true})).bloque==='fiches',imp.id),'suppression directe du fichier refusée tant qu’une fiche en dépend');
      pg.__answers.length=0;pg.__answers.push(true,true);await pg.evaluate(id=>MHPrevu.supprimerFiche(id),ids[1]);await pg.waitForTimeout(400);
      S=await stockees(pg);ok(!Object.keys(S.plannings).length&&!S.imports[imp.id]&&!(await pg.evaluate(async n=>!!(await MHPlanningImport.sources.existe(n)),imp.source.localRef))&&pg.__dialogs.some(d=>/Plus aucune fiche/.test(d)),'dernière fiche supprimée : confirmation explicite, puis original supprimé');
      ok(await moteur(pg)===avant,'journées réelles (DB.days) et calculs inchangés');
      ok(!/DUPONT|MARTIN|LEROY|GARNIER|Alice|Inès|Hugo/.test(JSON.stringify(await stockees(pg)))&&!/DUPONT|MARTIN|LEROY|GARNIER/.test(JSON.stringify(pls)),'aucun collègue dans les fiches ni l’analyse');
      ok(!errs.length,'0 erreur JS'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));
      await ctx.close()}

    console.log('Homonyme : choix manuel de la ligne, puis rejet');
    {const {ctx,pg,errs}=await open(b,360,'dark');
      const noms=['DUPONT Alice','ROTH Mickael','ROTH Mickaël','LEROY Inès'],l=noms.map((_,i)=>lignes[i+1]);
      const png=await pg.evaluate(dessiner,{debut,n:14,titre:'Planning du 02/11/2026 au 15/11/2026',noms,lignes:l.map(x=>x.slice(0,14)),coul:COUL});
      await importerPng(pg,png,'planning-homonyme.png');await pg.locator('#mh372Nom').fill('ROTH Mickael');await analyser(pg);
      const t=await txt(pg),a=Object.values((await stockees(pg)).analyses)[0];
      ok(a.status==='analyse_incomplète'&&a.selectedEmployee===null&&a.warnings.some(w=>w.code==='LIGNE_AMBIGUE'),'homonyme : aucune ligne choisie automatiquement (LIGNE_AMBIGUE)'+(a.selectedEmployee===null&&a.status==='analyse_incomplète'?'':' '+JSON.stringify(a.selectedEmployee)+' '+a.status)+' ['+[...new Set(a.warnings.map(w=>w.code))].join(',')+']');
      ok(await pg.locator('#s-prevu [data-k="candidats"] button[data-ligne]').count()===4&&/Choisis TA ligne/.test(t),'sélection manuelle proposée (4 lignes, à l’écran seulement)');
      ok(!/DUPONT|LEROY/.test(JSON.stringify(await stockees(pg))),'noms des lignes affichées jamais enregistrés');
      await pg.locator('#s-prevu [data-k="candidats"] button[data-ligne="2"]').click();
      await pg.waitForFunction(()=>!document.querySelector('#s-prevu [data-k="progression"]')&&document.querySelector('#s-prevu [data-k="analyse-ecran"]'),null,{timeout:300000});
      const a2=Object.values((await stockees(pg)).analyses)[0];
      ok(a2.selectedEmployee&&a2.selectedEmployee.parTableau[0].ligne===2&&a2.selectedEmployee.parTableau[0].auto===false,'ligne 3 choisie par l’utilisateur (« choisie par toi »)'+(a2.selectedEmployee&&a2.selectedEmployee.parTableau[0].ligne===2&&a2.selectedEmployee.parTableau[0].auto===false?'':' '+JSON.stringify(a2.selectedEmployee)+' '+a2.status+' '+[...new Set(a2.warnings.map(w=>w.code))]));
      ok(/choisie par toi/.test(await txt(pg)),'écran : choix manuel affiché');
      pg.__answers.push(true,'pas ma semaine');await pg.locator('#s-prevu [data-k="rejeter"]').click();await pg.waitForTimeout(300);
      const st=await stockees(pg),imp=Object.values(st.imports)[0];
      ok(!st.analyses[imp.id]&&imp.historique.some(h=>h.action==='analyse rejetée'&&h.raison==='pas ma semaine')&&!Object.keys(st.plannings).length,'Rejeter l’analyse : analyse retirée, raison tracée, import et original conservés, aucun planning');
      ok(/Analyse rejetée/.test(await txt(pg))&&await pg.locator('#s-prevu [data-k="lancer"]').count()===1,'retour à la fiche, nouvelle analyse possible');
      ok(!errs.length,'0 erreur JS'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));
      await ctx.close()}

    console.log('Responsive · écran d’analyse (analyse enregistrée, rouverte)');
    for(const W of [360,412,448])for(const theme of ['dark','light']){
      const ctx0=await b.newContext();await ctx0.close();
      const {ctx,pg,errs}=await (async()=>{const o={};const c=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
        const p=await c.newPage(),e=[];p.on('pageerror',x=>e.push(x.message));await p.clock.setFixedTime(NOW);
        await p.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mesheures_theme',d.t);localStorage.setItem('mh_planning_v372',d.pl);sessionStorage.setItem('s','1')}}catch(x){}},{db:seed(),t:theme,pl:etat});
        await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await p.waitForTimeout(1800);return {ctx:c,pg:p,errs:e}})();
      await tabPrevu(pg);const id=await pg.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mh_planning_v372')).imports)[0]);
      await pg.evaluate(id=>{MHPrevu.ouvrir(id);MHPrevu.voirAnalyse()},id);await pg.waitForTimeout(200);
      const o=await overflow(pg,'#s-prevu');
      await pg.evaluate(()=>{});
      const vis=await pg.evaluate(()=>{const t=document.querySelector('#s-prevu table[data-k="cellules"]');return t&&t.getBoundingClientRect().width<=innerWidth});
      ok(!o.length&&vis&&!errs.length,W+' px · '+(theme==='dark'?'sombre':'clair')+' : écran d’analyse sans débordement, tableau lisible'+(o.length?' ('+o.join(', ')+')':''));
      if(W===360&&theme==='dark')await pg.screenshot({path:path.join(require('os').tmpdir(),'mh372-analyse-360.png'),fullPage:true});
      /* vue d'ensemble « 2 plannings » et fiche d'un planning (PDF) */
      await pg.evaluate(e=>{localStorage.setItem('mh_planning_v372',e)},etatPdf2);
      const idp=await pg.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mh_planning_v372')).imports)[0]);
      await pg.evaluate(id=>{MHPrevu.retour();MHPrevu.ouvrir(id);MHPrevu.voirAnalyse()},idp);await pg.waitForTimeout(200);
      const o2=await overflow(pg,'#s-prevu'),ens=/2 plannings détectés/.test(await txt(pg));
      const pid=await pg.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mh_planning_v372')).plannings)[0]);
      await pg.evaluate(id=>MHPrevu.ouvrirFiche(id),pid);await pg.waitForTimeout(150);const o3=await overflow(pg,'#s-prevu'),fic=await pg.locator('#s-prevu [data-k="fiche-planning"]').count()===1;
      await pg.evaluate(()=>MHPrevu.retour());await pg.waitForTimeout(100);const o4=await overflow(pg,'#s-prevu');
      ok(ens&&fic&&!o2.length&&!o3.length&&!o4.length&&!errs.length,W+' px · '+(theme==='dark'?'sombre':'clair')+' : vue « 2 plannings », fiche et liste sans débordement'+([...o2,...o3,...o4].length?' ('+[...o2,...o3,...o4].join(', ')+')':''));
      if(W===360&&theme==='dark'){await pg.evaluate(id=>{MHPrevu.ouvrir(id);MHPrevu.voirAnalyse()},idp);await pg.waitForTimeout(150);await pg.screenshot({path:path.join(require('os').tmpdir(),'mh372-ensemble-360.png'),fullPage:true})}
      await ctx.close()}
  }catch(e){fails++;console.log('FAIL  exception : '+(e&&e.stack||e))}
  finally{await b.close();srv.close()}
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.2.0-C (analyse du planning, OCR réel) : OK');process.exit(fails?1:0);
});
