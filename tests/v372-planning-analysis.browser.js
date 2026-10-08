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
  return c.toDataURL('image/png').split(',')[1];
}
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
const stockees=pg=>pg.evaluate(()=>JSON.parse(localStorage.getItem('mh_planning_v372')||'{}'));

srv.listen(0,async()=>{
  const b=await chromium.launch();let etat=null;
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
      await tabPrevu(pg);const id=await pg.evaluate(()=>document.querySelector('#s-prevu .mh372-row[data-id]').dataset.id);
      await pg.evaluate(id=>{MHPrevu.ouvrir(id);MHPrevu.voirAnalyse()},id);await pg.waitForTimeout(200);
      const o=await overflow(pg,'#s-prevu');
      await pg.evaluate(()=>{});
      const vis=await pg.evaluate(()=>{const t=document.querySelector('#s-prevu table[data-k="cellules"]');return t&&t.getBoundingClientRect().width<=innerWidth});
      ok(!o.length&&vis&&!errs.length,W+' px · '+(theme==='dark'?'sombre':'clair')+' : écran d’analyse sans débordement, tableau lisible'+(o.length?' ('+o.join(', ')+')':''));
      if(W===360&&theme==='dark')await pg.screenshot({path:path.join(require('os').tmpdir(),'mh372-analyse-360.png'),fullPage:true});
      await ctx.close()}
  }catch(e){fails++;console.log('FAIL  exception : '+(e&&e.stack||e))}
  finally{await b.close();srv.close()}
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.2.0-C (analyse du planning, OCR réel) : OK');process.exit(fails?1:0);
});
