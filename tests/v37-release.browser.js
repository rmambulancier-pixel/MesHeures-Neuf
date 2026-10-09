#!/usr/bin/env node
/*
 * V37.0.0 — Release final, application réelle (Chromium), horloge figée au 08/10/2026.
 * - Audit « État des périodes » : conformes / évaluées, « Données insuffisantes » sans données ;
 * - lecture seule : Paie, Assistant Paie, Compteur, Audit, widget, Dossier → stockage identique avant / après ;
 * - responsive : tous les onglets à 360 / 412 / 448 px, sombre et clair (débordement, montants coupés, erreurs JS) ;
 * - cache : installation V37.0-H (entrée ?v=36.2.0) puis APK V37.0.0 (entrée ?v=37.0.0).
 * Usage : node tests/v37-release.browser.js · sortie 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),NEW=path.join(REPO,'app/src/main/assets/web');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const NOW=new Date('2026-10-08T10:00:00');
const REL='37.3.0';   // version affichée
const REV=(require('fs').readFileSync(require('path').join(__dirname,'..','app/src/main/assets/web/sw.js'),'utf8').match(/const CACHE='mesheures-shell-v([^']+)'/)||[])[1];   // révision du cache (37.2.0-B…)
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
let ROOT=NEW;
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
const ROMI={'2026-08-24_2026-09-20':{data:{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}}};
const seed=extra=>({s:R1.s,days:{...R1.days,...R2.days},periods:[],per:{start:'2026-09-21',nb:2},bul:{},bulletins:[{mois:'2026-09',brut:3253.01,net:2722.62}],romi:{},cmp:{},...(extra||{})});
const TABS=['home','jour','mois','paie','analyse','audit','bul','romi','reg'];

async function open(b,W,theme,db,url){
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.clock.setFixedTime(NOW);
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mh_romi_master_v35',JSON.stringify(d.romi));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},{db,romi:ROMI,t:theme});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html${url||''}`);await pg.waitForTimeout(2500);
  return {ctx,pg,errs};
}
const snap=pg=>pg.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k)}return JSON.stringify(o,Object.keys(o).sort())});

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    console.log('Audit · État des périodes');
    {const {ctx,pg,errs}=await open(b,412,'dark',seed());await pg.evaluate(()=>tab('audit'));await pg.waitForTimeout(400);
      const a=await pg.evaluate(()=>{const h=document.querySelector('#aKpi .audit-health');return {txt:h.innerText,score:h.dataset.score}});
      ok(a.score===''&&/ÉTAT DES PÉRIODES\s*—/.test(a.txt)&&/Données insuffisantes/.test(a.txt)&&!/100/.test(a.txt),'aucune période enregistrée : « Données insuffisantes », aucun 100 %');
      ok(errs.length===0,'0 erreur JavaScript');await ctx.close()}
    {const {ctx,pg,errs}=await open(b,412,'dark',seed({periods:[{start:'2026-08-24',nb:2}]}));await pg.evaluate(()=>tab('audit'));await pg.waitForTimeout(400);
      const a=await pg.evaluate(()=>{const h=document.querySelector('#aKpi .audit-health');let ev=0,cf=0;for(let i=0;i<28;i++){const k=addD('2026-08-24',i),d=DB.days[k];if(d&&['T','NUIT'].includes(d.t)){ev++;if(!cd(k).al.length)cf++}}
        return {txt:h.innerText,score:h.dataset.score,ev,cf}});
      ok(a.ev===18&&a.score===String(Math.round(a.cf/a.ev*100))&&a.txt.includes('Journées conformes : '+a.cf+' / 18 évaluées'),'période 24/08 → 20/09 : score = '+a.cf+' / 18 journées conformes = '+a.score+' %');
      ok(/🔴 Contrôle nécessaire/.test(a.txt),'statut réglementaire réel conservé (alertes critiques présentes → 🔴)');
      ok(errs.length===0,'0 erreur JavaScript');await ctx.close()}

    console.log('Lecture seule : simple ouverture des écrans');
    {const {ctx,pg,errs}=await open(b,412,'dark',seed({periods:[{start:'2026-08-24',nb:2}]}));
      const before=await snap(pg);   // juste après le démarrage, avant toute ouverture d'écran
      for(const t of TABS){await pg.evaluate(t=>tab(t),t);await pg.waitForTimeout(150)}
      for(const t of ['paie','home','audit','analyse','romi','bul']){await pg.evaluate(t=>tab(t),t);await pg.waitForTimeout(250)}
      await pg.evaluate(()=>tab('paie'));await pg.waitForTimeout(200);
      for(const id of ['check','sources','impact','romi','paye','evol']){const s=pg.locator('#mh37Assistant details[data-open="'+id+'"] > summary');if(await s.count())await s.click()}
      await pg.evaluate(()=>{tab('home');const c=document.querySelector('#mh37Compteur details[data-fold="romi"]');if(c)c.open=true;MHCompteur.go(-1);MHCompteur.go(0)});await pg.waitForTimeout(200);
      await pg.evaluate(()=>{try{window.MH33&&MH33.syncWidgetV33&&MH33.syncWidgetV33()}catch(e){}try{const d=MHDossier.data();MHDossier.html(d,{});MHDossier.pdf(d,{})}catch(e){}tab('audit')});await pg.waitForTimeout(600);
      const after=await snap(pg);
      ok(before===after,'Paie, Assistant Paie, Compteur, Audit, widget, Dossier : stockage strictement identique avant / après');
      ok(errs.length===0,'0 erreur JavaScript');await ctx.close()}

    console.log('Responsive · tous les onglets');
    for(const W of [360,412,448])for(const theme of ['dark','light']){
      const {ctx,pg,errs}=await open(b,W,theme,seed({periods:[{start:'2026-08-24',nb:2}]}));const bad=[];
      for(const t of TABS){await pg.evaluate(t=>tab(t),t);await pg.waitForTimeout(250);
        const r=await pg.evaluate(t=>{const sec=document.getElementById('s-'+t),out=[];if(!sec)return {miss:true};
          if(document.documentElement.scrollWidth>innerWidth+1)out.push('page '+document.documentElement.scrollWidth+' px');
          const scrollable=e=>{for(let p=e;p&&p!==sec;p=p.parentElement){const cs=getComputedStyle(p);if(/auto|scroll/.test(cs.overflowX))return true}return false};
          [...sec.querySelectorAll('*')].forEach(e=>{const b=e.getBoundingClientRect();if(!b.width||!e.offsetParent)return;if(b.right>innerWidth+1&&!scrollable(e))out.push(e.tagName+'.'+String(e.className).slice(0,30))});
          const money=[...sec.querySelectorAll('b,strong,td,span')].filter(e=>/\d,\d{2}\s?€$/.test(e.textContent.trim())&&e.offsetParent&&(e.scrollWidth>e.clientWidth+1)&&getComputedStyle(e).display!=='inline');
          money.forEach(e=>out.push('montant coupé '+e.textContent.trim()));
          const h=[...sec.querySelectorAll('h2')].filter(e=>e.offsetParent&&e.scrollWidth>e.clientWidth+1);h.forEach(e=>out.push('titre coupé '+e.textContent.trim().slice(0,30)));
          return {out:out.slice(0,4)}},t);
        if(r.miss)continue;if(r.out.length)bad.push(t+' : '+r.out.join(', '))}
      ok(!bad.length,W+' px · '+(theme==='dark'?'sombre':'clair')+' : 9 onglets sans débordement, titre ni montant coupé'+(bad.length?' → '+bad.slice(0,3).join(' | '):''));
      ok(errs.length===0,W+' px · '+(theme==='dark'?'sombre':'clair')+' : 0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));
      await ctx.close();
    }

    console.log('Cache : V37.0-H (entrée ?v=36.2.0) → V'+REL+' (entrée ?v='+REV+')');
    const OLD=fs.mkdtempSync(path.join(os.tmpdir(),'mh37h-'));
    const CUR=(fs.readFileSync(path.join(NEW,'sw.js'),'utf8').match(/const CACHE='([^']+)'/)||[])[1];
    cp.execSync('git archive 3a10803 app/src/main/assets/web | tar -x -C '+JSON.stringify(OLD),{cwd:REPO,stdio:'ignore'});
    ROOT=path.join(OLD,'app/src/main/assets/web');
    const ctx=await b.newContext({viewport:{width:412,height:915}}),pg=await ctx.newPage();await pg.clock.setFixedTime(NOW);
    await pg.addInitScript(d=>{try{if(!localStorage.getItem('mesheures_v3'))localStorage.setItem('mesheures_v3',JSON.stringify(d))}catch(e){}},seed());
    const served=[];pg.on('request',r=>served.push(r.url()));
    const probe=async()=>{await pg.waitForTimeout(2500);return pg.evaluate(async()=>({ver:(document.getElementById('mhVersion')||{}).textContent,title:document.title,caches:await caches.keys(),sw:!!navigator.serviceWorker.controller,
      scripts:[...document.scripts].map(s=>s.getAttribute('src')||'').filter(s=>/app-core|romi-master/.test(s))}))};
    const base=`http://127.0.0.1:${srv.address().port}/index.html`;
    await pg.goto(base+'?v=36.2.0');let p=await probe();await pg.reload();p=await probe();
    ok(p.sw&&p.ver==='V36.2.0'&&p.caches.includes('mesheures-shell-v37.0-H'),'V37.0-H installé (cache mesheures-shell-v37.0-H)');
    ROOT=NEW;served.length=0;await pg.goto(base+'?v='+REV);await probe();await pg.goto(base+'?v='+REV);p=await probe();
    ok(p.ver==='V'+REL&&p.title==='MesHeures V'+REL,'2e lancement du nouvel APK : V'+REL+' affichée');
    ok(p.caches.length===1&&p.caches[0]===CUR,'seul le cache '+CUR+' reste (ancien cache 37.0-H supprimé)');
    ok(p.scripts.every(s=>s.endsWith('?v='+REV)),'scripts servis en ?v='+REV+' (dont romi-master.js, auparavant sans révision)');
    ok(!served.some(u=>/\?v=37\.0-[A-H]/.test(u)),'aucun asset 37.0-G / 37.0-H demandé après la mise à jour');
    await pg.goto(base+'?v='+REV);p=await probe();ok(p.ver==='V'+REL&&p.caches.length===1,'3e lancement : stable');
    await ctx.close();fs.rmSync(OLD,{recursive:true,force:true});
  }catch(e){ok(false,'exception : '+e.message)}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur Release (V'+REL+') : OK');process.exit(fails?1:0);
});
