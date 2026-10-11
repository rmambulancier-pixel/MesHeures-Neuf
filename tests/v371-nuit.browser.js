#!/usr/bin/env node
/*
 * V37.1 — Travail de nuit (art. 9), application réelle (Chromium), horloge figée au 08/10/2026 10h00.
 * - données réelles (relevés de référence) : Compteur, Assistant Paie, Smart Control, Dossier ;
 * - JEU SYNTHÉTIQUE « travailleur de nuit » (50 nuits 20:00 → 04:00 en 2026, seuil de 270 h franchi) : il ne décrit pas
 *   la situation réelle de l'utilisateur ; il sert à vérifier l'affichage du statut établi, du repos et du contrôle de pause ;
 * - lecture seule (stockage identique), 360 / 412 / 448 px clair et sombre, 0 erreur JavaScript ;
 * - mise à jour V37.0.0 (c426b19, cache mesheures-shell-v37.0.0) → V37.1.1 : un seul cache, données conservées.
 * Usage : node tests/v371-nuit.browser.js · sortie 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),NEW=path.join(REPO,'app/src/main/assets/web');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const NOW=new Date('2026-10-08T10:00:00');
const REL='37.5.0';   // version affichée
const REV=(require('fs').readFileSync(require('path').join(__dirname,'..','app/src/main/assets/web/sw.js'),'utf8').match(/const CACHE='mesheures-shell-v([^']+)'/)||[])[1];   // révision du cache (37.2.0-B…)
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
let ROOT=NEW;
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
const addDay=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const day=(deb,fin,p)=>({t:'T',deb,fin,p:p||[],mealV:3,panier:'NON'});
const seed=days=>({s:R1.s,days,periods:[],per:{start:'2026-09-21',nb:2},bul:{},bulletins:[],romi:{},cmp:{}});
const REAL={...R1.days,...R2.days};
/* JEU SYNTHÉTIQUE : 50 nuits 20:00 → 04:00 avec pause de 30 min (6h00 d'amplitude de nuit chacune) + 1 nuit sans pause le 06/10/2026 */
const SYN=(()=>{const d={};for(let i=0;i<50;i++)d[addDay('2026-01-05',2*i)]=day('20:00','04:00',[{d:'00:00',f:'00:30'}]);d['2026-10-06']=day('20:00','04:00',[]);return d})();

async function open(b,W,theme,db){
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.clock.setFixedTime(NOW);
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},{db,t:theme});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2500);
  return {ctx,pg,errs};
}
const snap=pg=>pg.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k)}return JSON.stringify(o,Object.keys(o).sort())});
const overflow=(pg,sel)=>pg.evaluate(sel=>{const root=document.querySelector(sel),out=[];if(!root)return ['absent'];
  if(document.documentElement.scrollWidth>innerWidth+1)out.push('page '+document.documentElement.scrollWidth+' px');
  [...root.querySelectorAll('*')].forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&e.offsetParent&&r.right>innerWidth+1)out.push(e.tagName+'.'+String(e.className).slice(0,24))});return out.slice(0,4)},sel);

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    console.log('Données réelles (2h00 entre 22 h et 5 h en 2026)');
    {const {ctx,pg,errs}=await open(b,412,'dark',seed(REAL));
      const before=await snap(pg);
      await pg.evaluate(()=>{tab('home');MHCompteur.go(0)});await pg.waitForTimeout(300);
      const c=await pg.evaluate(()=>{const q=k=>(document.querySelector('#mh37Compteur [data-k="'+k+'"]')||{}).textContent;return {n9:q('nuit9'),an:q('nuit9an'),st:q('nuit9st'),nuit:q('nuit'),txt:document.getElementById('mh37Compteur').innerText}});
      ok(c.n9==='2h00'&&c.an==='2h00'&&c.st==='statut non déterminable','Compteur 21/09 → 18/10 : Nuit art. 9 2h00 · cumul 2026 2h00 / 270h00 · statut non déterminable');
      ok(c.nuit==='4h00'&&/réglage paie 21h00 → 06h00/.test(c.txt),'ligne « Nuit » 4h00 conservée, identifiée comme réglage paie 21h00 → 06h00');
      ok(!/repos 10 %/.test(c.txt),'aucun repos affiché tant que le statut n’est pas établi');
      const sc=await pg.evaluate(()=>{const s=MHControl.analyze({});return {ne:s.notEvaluated,codes:s.alerts.map(a=>a.code),card:(document.querySelector('.mh37-card')||{}).innerText||''}});
      ok(sc.ne.includes('Pause de nuit (art. 9) : 2 journées avec heures de nuit, statut de travailleur de nuit non établi.')&&!sc.codes.includes('NUIT_PAUSE'),'Smart Control : pause de nuit « non évaluée » (statut non établi), aucune alerte inventée');
      ok(/Non évalué : .*Pause de nuit \(art\. 9\)/.test(sc.card),'Smart Control (Accueil) : mention « Non évalué » visible');
      await pg.evaluate(()=>tab('paie'));await pg.waitForTimeout(400);
      const s=pg.locator('#mh37Assistant details[data-open="nuit"] > summary');ok(await s.count()===1,'Assistant Paie : volet « 🌙 Travail de nuit (art. 9) » présent');
      await s.click();await pg.waitForTimeout(200);
      const a=await pg.evaluate(()=>{const d=document.querySelector('#mh37Assistant details[data-open="nuit"]');return {sum:d.querySelector('summary').innerText,txt:d.innerText,score:(document.querySelector('#mh37Assistant [data-k="score"]')||{}).textContent}});
      ok(/🌙 Travail de nuit \(art\. 9\)\s*2h00/.test(a.sum)&&/2h00 \/ 270h00/.test(a.txt)&&/Statut non déterminable à ce jour/.test(a.txt),'Assistant Paie : 2h00 sur le relevé, cumul 2h00 / 270h00, statut non déterminable');
      ok(!/€/.test(a.txt)&&/pas une majoration de salaire/.test(a.txt)&&/hors score/.test(a.txt),'Assistant Paie : information hors score, aucun montant, repos ≠ majoration');
      const ov=await overflow(pg,'#mh37Assistant details[data-open="nuit"]');ok(!ov.length,'volet nuit sans débordement'+(ov.length?' → '+ov.join(', '):''));
      const dz=await pg.evaluate(()=>{const d=MHDossier.data(),h=MHDossier.html(d,{}),pdf=MHDossier.pdf(d,{});const div=document.createElement('div');div.innerHTML=h.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g,'');
        const h2=[...div.querySelectorAll('h2')].map(x=>x.textContent);const i=h2.indexOf('10. Travail de nuit (art. 9)');return {h2,sec:i<0?'':h.slice(h.indexOf('10. Travail de nuit'),h.indexOf('11. Événements')),pages:pdf.pageCount}});
      ok(dz.h2.length===13&&dz.h2[9]==='10. Travail de nuit (art. 9)'&&dz.h2[10]==='11. Événements et chronologie'&&dz.h2[11]==='12. Plannings prévisionnels (référence, pas une preuve)'&&dz.h2[12]==='13. Intégrité','Dossier : 13 sections (V37.4 : 12. Plannings), « 10. Travail de nuit (art. 9) » avant chronologie, plannings et intégrité');
      ok(/octobre 2026/.test(dz.sec)&&/2h00/.test(dz.sec)&&!/€/.test(dz.sec)&&dz.pages>=1,'Dossier : information mensuelle (octobre 2026 · 2h00), PDF généré ('+dz.pages+' pages)');
      ok(before===await snap(pg),'lecture seule : stockage strictement identique après Compteur, Smart Control, Assistant, Dossier');
      ok(await pg.evaluate(()=>window.DB===undefined),'window.DB non exposé');
      ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));await ctx.close()}

    console.log('JEU SYNTHÉTIQUE « travailleur de nuit » (306h00 en 2026 — pas la situation réelle)');
    {const {ctx,pg,errs}=await open(b,412,'dark',seed(SYN));
      const before=await snap(pg);
      const n=await pg.evaluate(()=>{const a=MHNuit.annee('2026');return {cumul:F(a.cumul),st:a.statut,franchi:a.franchi,repos:a.repos&&F(a.repos.heures)}});
      ok(n.cumul==='306h00'&&n.st==='etabli'&&n.franchi==='2026-04-03'&&n.repos==='30h36','statut établi : 306h00, seuil franchi le 03/04/2026, repos 10 % = 30h36');
      await pg.evaluate(()=>{tab('home');MHCompteur.go(0)});await pg.waitForTimeout(300);
      const c=await pg.evaluate(()=>({st:(document.querySelector('#mh37Compteur [data-k="nuit9st"]')||{}).textContent,txt:document.getElementById('mh37Compteur').innerText}));
      ok(c.st==='travailleur de nuit'&&/repos 10 % : 30h36 \(à confirmer\)/.test(c.txt),'Compteur : « travailleur de nuit », repos 10 % 30h36 à confirmer');
      const sc=await pg.evaluate(()=>{const s=MHControl.analyze({});return s.alerts.filter(a=>a.code==='NUIT_PAUSE').map(a=>[a.key,a.level,a.result])});
      ok(sc.length===1&&sc[0][0]==='2026-10-06'&&sc[0][1]==='warn'&&/6h00 entre 22 h et 5 h/.test(sc[0][2]),'Smart Control : 🟠 Pause de nuit le 06/10 (6h00 de travail continu entre 22 h et 4 h sans pause de 20 min)');
      await pg.evaluate(()=>tab('paie'));await pg.waitForTimeout(400);await pg.locator('#mh37Assistant details[data-open="nuit"] > summary').click();await pg.waitForTimeout(200);
      const t=await pg.evaluate(()=>document.querySelector('#mh37Assistant details[data-open="nuit"]').innerText);
      ok(/Contrepartie en repos 10 %/.test(t)&&/au moins 5 % conservés en repos/.test(t)&&/\(non applicable\)/.test(t)&&!/€/.test(t),'Assistant Paie : repos 10 % (15 % non applicable), plancher 5 %, aucun euro');
      ok(before===await snap(pg),'lecture seule (jeu synthétique)');
      ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));await ctx.close()}

    console.log('Pause de nuit : travail effectif continu entre 22 h et 5 h (JEU SYNTHÉTIQUE, travailleur de nuit établi)');
    {/* base synthétique (statut établi) sans la nuit du 06/10, puis une journée par cas dans la fenêtre du Smart Control */
      const base={...SYN};delete base['2026-10-06'];
      const CAS={'2026-09-14':[day('14:00','23:00'),false,'14h → 23h, 6 h avant 22 h'],'2026-09-16':[day('18:00','02:00'),false,'18h → 02h sans pause (4h00 de nuit)'],
        '2026-09-18':[day('18:00','02:00',[{d:'23:00',f:'23:20'}]),false,'18h → 02h, pause de 20 min'],'2026-09-20':[day('22:00','05:00',[{d:'01:00',f:'01:15'}]),true,'22h → 05h, pause de 15 min (6h45)'],
        '2026-09-22':[day('23:00','06:00'),true,'23h → 06h après minuit (6h00)'],'2026-09-24':[day('22:00','05:00',[{d:'00:00',f:'00:10'},{d:'02:00',f:'02:30'}]),false,'plusieurs pauses'],
        '2026-09-26':[day('22:00','05:00',[{d:'01:00',f:'01:15'},{d:'01:10',f:'01:25'}]),false,'pauses chevauchantes (25 min)'],'2026-09-28':[day('22:00','05:00',[{d:'01:00',f:'01:10'},{d:'01:15',f:'01:30'}]),true,'pause interrompue (6h35)'],
        '2026-09-30':[day('04:00','12:00'),false,'1h00 de nuit seulement']};
      const days={...base};Object.entries(CAS).forEach(([k,v])=>{days[k]=v[0]});
      const {ctx,pg,errs}=await open(b,412,'dark',seed(days));const before=await snap(pg);
      const r=await pg.evaluate(()=>{const s=MHControl.analyze({});return {al:s.alerts.filter(a=>a.code==='NUIT_PAUSE').map(a=>a.key).sort(),card:(document.querySelector('.mh37-card')||{}).innerText||''}});
      const att=Object.keys(CAS).filter(k=>CAS[k][1]).sort();
      ok(JSON.stringify(r.al)===JSON.stringify(att),'alertes « Pause de nuit » exactement sur : '+att.map(k=>CAS[k][2]).join(' · ')+(JSON.stringify(r.al)===JSON.stringify(att)?'':' → obtenu '+r.al.join(', ')));
      Object.keys(CAS).filter(k=>!CAS[k][1]).forEach(k=>ok(!r.al.includes(k),'pas d’alerte : '+CAS[k][2]));
      ok(/Pause de nuit/.test(r.card),'carte Smart Control (Accueil) : points « Pause de nuit » affichés');
      ok(before===await snap(pg),'lecture seule');ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs[0]:''));await ctx.close()}

    console.log('Responsive · Compteur et Assistant Paie');
    for(const W of [360,412,448])for(const theme of ['dark','light'])for(const [lbl,days] of [['réel',REAL],['synthétique',SYN]]){
      const {ctx,pg,errs}=await open(b,W,theme,seed(days));
      await pg.evaluate(()=>{tab('home');MHCompteur.go(0)});await pg.waitForTimeout(250);const o1=await overflow(pg,'#mh37Compteur');
      await pg.evaluate(()=>tab('paie'));await pg.waitForTimeout(300);const s=pg.locator('#mh37Assistant details[data-open="nuit"] > summary');if(await s.count())await s.click();await pg.waitForTimeout(150);
      const o2=await overflow(pg,'#mh37Assistant');
      if(W===412&&lbl==='réel')await pg.locator('#mh37Assistant details[data-open="nuit"]').screenshot({path:path.join(os.tmpdir(),`mh371-nuit-${W}-${theme}.png`)});
      ok(!o1.length&&!o2.length&&errs.length===0,W+' px · '+(theme==='dark'?'sombre':'clair')+' · '+lbl+' : sans débordement, 0 erreur JS'+(o1.concat(o2).length?' → '+o1.concat(o2).join(', '):'')+(errs.length?' · '+errs[0]:''));
      await ctx.close();
    }

    console.log('Mise à jour V37.0.0 (c426b19) → V'+REL);
    const OLD=fs.mkdtempSync(path.join(os.tmpdir(),'mh370-'));
    let haveOld=true;try{cp.execSync('git archive c426b19 app/src/main/assets/web | tar -x -C '+JSON.stringify(OLD),{cwd:REPO,stdio:'ignore'})}catch(e){haveOld=false}
    if(!haveOld)console.log('  (commit c426b19 absent du dépôt local : scénario de mise à jour ignoré)');
    else{
      ROOT=path.join(OLD,'app/src/main/assets/web');
      const ctx=await b.newContext({viewport:{width:412,height:915}}),pg=await ctx.newPage();await pg.clock.setFixedTime(NOW);
      await pg.addInitScript(d=>{try{if(!localStorage.getItem('mesheures_v3'))localStorage.setItem('mesheures_v3',JSON.stringify(d))}catch(e){}},seed(REAL));
      const served=[];pg.on('request',r=>served.push(r.url()));
      const probe=async()=>{await pg.waitForTimeout(2500);return pg.evaluate(async()=>({ver:(document.getElementById('mhVersion')||{}).textContent,caches:await caches.keys(),sw:!!navigator.serviceWorker.controller,
        nuit:typeof window.MHNuit,days:Object.keys(JSON.parse(localStorage.getItem('mesheures_v3')||'{}').days||{}).length}))};
      const base=`http://127.0.0.1:${srv.address().port}/index.html`;
      await pg.goto(base+'?v=37.0.0');let p=await probe();await pg.reload();p=await probe();
      ok(p.sw&&p.ver==='V37.0.0'&&p.caches.includes('mesheures-shell-v37.0.0')&&p.nuit==='undefined','V37.0.0 installé (cache mesheures-shell-v37.0.0, pas de module de nuit)');
      const daysBefore=p.days;
      ROOT=NEW;served.length=0;await pg.goto(base+'?v='+REV);await probe();await pg.goto(base+'?v='+REV);p=await probe();
      ok(p.ver==='V'+REL&&p.nuit==='object','2e lancement du nouvel APK : V'+REL+' affichée, module de nuit chargé');
      ok(p.caches.length===1&&p.caches[0]==='mesheures-shell-v'+REV,'seul le cache mesheures-shell-v'+REV+' reste');
      ok(served.some(u=>u.includes('app-v371-nuit.js?v='+REV))&&!served.some(u=>/\?v=37\.0\.0/.test(u)&&!/index\.html/.test(u)),'app-v371-nuit.js servi, aucun asset 37.0.0 demandé après la mise à jour');
      ok(p.days===daysBefore&&p.days>0,'données conservées ('+p.days+' journées)');
      ROOT=NEW;await ctx.close();
    }
  }catch(e){fails++;console.log('FAIL  exception : '+(e&&e.stack||e))}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.1 travail de nuit : OK');process.exit(fails?1:0);
});
