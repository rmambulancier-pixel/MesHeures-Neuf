#!/usr/bin/env node
/*
 * V37.0-G — Assistant Paie dans l'application réelle (Chromium).
 * 360 / 412 (Pixel 10 Pro XL) / 448 px, clair et sombre ; navigation ; simulation isolée ; cache (V37.0-F → V37.0-G).
 * Usage : node tests/v37-assistant-paie.browser.js   · sortie 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),NEW=path.join(REPO,'app/src/main/assets/web');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const DAYS={...R1.days,...R2.days};
const ROMI={'2026-08-24_2026-09-20':{data:{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}}};
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
let ROOT=NEW;
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
const seed=(start)=>({db:{s:R1.s,days:DAYS,periods:[],per:{start,nb:2},bul:{},bulletins:[],romi:{}},romi:ROMI});

async function open(b,W,theme,start){
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mh_romi_master_v35',JSON.stringify(d.romi));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},{...seed(start),t:theme});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2500);
  await pg.evaluate(()=>tab('paie'));await pg.waitForTimeout(400);
  return {ctx,pg,errs};
}
const store=pg=>pg.evaluate(()=>JSON.stringify([localStorage.getItem('mesheures_v3'),localStorage.getItem('mh_romi_master_v35')]));
const metrics=pg=>pg.evaluate(()=>{const c=document.getElementById('mh37Assistant'),r=c.getBoundingClientRect(),v=k=>(c.querySelector('[data-k="'+k+'"]')||{}).textContent;
  const over=[...c.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&(b.right>r.right+1||b.left<r.left-1)}).map(e=>e.className||e.tagName).slice(0,3);
  const btns=[...c.querySelectorAll('button')].filter(x=>x.offsetParent).map(x=>x.getBoundingClientRect());
  const vb=c.querySelector('.mh37p-verdict').getBoundingClientRect(),est=c.querySelector('.mh37p-est').getBoundingClientRect();
  return {txt:c.innerText,verdict:v('verdict'),score:v('score'),brut:v('brut'),net:v('net'),bad:v('nbad'),warn:v('nwarn'),ok:v('nok'),romi:v('romi'),
    over,docW:document.documentElement.scrollWidth,vw:innerWidth,minH:Math.min(...btns.map(x=>x.height)),
    page:document.getElementById('s-paie').innerText,verdictTop:vb.top+scrollY-(c.getBoundingClientRect().top+scrollY),estBottom:est.bottom-r.top,
    color:getComputedStyle(c.querySelector('.mh37p-money b')).color,bg:getComputedStyle(c.closest('.card')).backgroundColor}});

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    for(const W of [412,360,448])for(const theme of ['dark','light']){
      console.log(`${W} px · ${theme==='dark'?'sombre':'clair'}${W===412?' (Pixel 10 Pro XL)':''}`);
      const {ctx,pg,errs}=await open(b,W,theme,'2026-08-24');
      const before=await store(pg);
      ok(await pg.locator('#mh37Assistant').count()===1,'Assistant Paie présent dans l’onglet Paie');
      const m=await metrics(pg);
      ok(!/Assistant paie V33/i.test(m.page)&&/🧠 Assistant Paie/.test(m.txt)&&/Bulletin — septembre 2026/.test(m.txt),'en-tête V37 « Assistant Paie · Bulletin — septembre 2026 », plus aucun « Assistant paie V33 »');
      ok(m.verdict==='🔴 BULLETIN BLOQUÉ'&&m.score==='58 % prêt'&&m.bad==='1'&&m.warn==='4'&&m.ok==='7','verdict 🔴 BULLETIN BLOQUÉ · 58 % prêt · 1 / 4 / 7');
      ok(m.brut==='3 463,54 €'&&m.net==='2 880,39 €','brut 3 463,54 € et net 2 880,39 € visibles');
      ok(m.estBottom<1000,'verdict et estimation visibles sans ouvrir de volet ('+Math.round(m.estBottom)+' px)');
      ok(/HS payées non renseignées/.test(m.txt)&&/Écart ROMI1 17h40/.test(m.txt),'bloquant et écart ROMI1 affichés d’emblée');
      ok(m.romi==='🟠 Écart ROMI1 : 17h40','volet ROMI1 fermé : « 🟠 Écart ROMI1 : 17h40 »');
      ok(!BAD.test(m.txt),'aucune valeur invalide');
      ok(m.docW<=m.vw&&!m.over.length,'aucun débordement horizontal'+(m.over.length?' : '+m.over.join(', '):''));
      ok(m.minH>=40,'boutons tactiles ≥ 40 px ('+Math.round(m.minH)+' px)');
      ok(m.color!==m.bg,'contraste montant / fond');
      /* checklist, détail HS, simulation */
      await pg.locator('#mh37Assistant details[data-open="check"] > summary').click();await pg.waitForTimeout(150);
      const nCheck=await pg.locator('#mh37Assistant [data-check]').count();
      await pg.locator('#mh37Assistant details[data-open="brut:HS 50 %"] > summary').click();await pg.waitForTimeout(150);
      const why=(await pg.locator('#mh37Assistant details[data-open="brut:HS 50 %"]').innerText()).replace(/\s+/g,' ');
      ok(nCheck===12&&/Q1 · 24\/08 → 06\/09 26h35 Q2 · 07\/09 → 20\/09 4h20 Total 30h55/.test(why),'« Vérifier le bulletin » : 12 contrôles · « Pourquoi 30h55 ? » par quatorzaine');
      await pg.locator('#mh37Assistant details[data-open="sim"] > summary').click();await pg.waitForTimeout(150);
      for(let i=0;i<4;i++){await pg.locator('#mh37Assistant button[aria-label="HS 25 % plus"]').click();await pg.waitForTimeout(80)}
      await pg.locator('#mh37Assistant button[aria-label="Paniers IR plus"]').click();await pg.waitForTimeout(120);
      const s=await pg.evaluate(()=>{const c=document.getElementById('mh37Assistant'),G=JSON.parse(JSON.stringify(calcPer('2026-08-24',2).G));G.h25+=60;G.ir+=1;
        return {open:c.querySelector('details[data-open="sim"]').open,checkOpen:c.querySelector('details[data-open="check"]').open,h25:c.querySelector('[data-sim="h25"]').textContent,
          brut:c.querySelector('[data-k="simBrut"]').textContent,exp:brutOf(G).tot,real:brutOf(calcPer('2026-08-24',2).G).tot,diff:c.querySelector('[data-k="simDiff"]').textContent}});
      const fr=n=>n.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' €';
      ok(s.open&&s.checkOpen&&s.h25==='33h00'&&s.brut===fr(s.exp)&&s.diff==='+'+fr(s.exp-s.real),'simulation : HS 25 % 33h00 + 1 IR → brut simulé '+s.brut+' ('+s.diff+'), volets restés ouverts');
      await pg.locator('#mh37Assistant button',{hasText:'Quitter la simulation'}).click();await pg.waitForTimeout(120);
      const s2=await pg.evaluate(()=>({sim:!!document.querySelector('#mh37Assistant [data-k="simBrut"]'),brut:document.querySelector('#mh37Assistant [data-k="brut"]').textContent}));
      ok(!s2.sim&&s2.brut==='3 463,54 €','sortie de simulation : valeurs réelles inchangées');
      ok(before===await store(pg),'aucune donnée réelle modifiée (journées, paie, ROMI1)');
      if(W===412)await pg.locator('#mh37Assistant').screenshot({path:path.join(os.tmpdir(),`mh37g-${W}-${theme}.png`)});
      if(W===412&&theme==='dark'){
        const nav=async(sel,check,label)=>{await pg.evaluate(()=>tab('paie'));await pg.waitForTimeout(250);await pg.locator('#mh37Assistant '+sel).first().click();await pg.waitForTimeout(450);ok(await pg.evaluate(check),label)};
        await nav('.mh37p-tools button:has-text("Détail paie")',()=>document.getElementById('s-paie').classList.contains('on')&&Math.abs(document.getElementById('pSimCard').getBoundingClientRect().top)<200,'navigation → Détail paie (fiche estimative)');
        await nav('.mh37p-tools button:has-text("Compteur")',()=>document.getElementById('s-home').classList.contains('on')&&Math.abs(document.getElementById('mh37Compteur').getBoundingClientRect().top)<200,'navigation → Compteur heures');
        await nav('.mh37p-tools button:has-text("Audit")',()=>document.getElementById('s-audit').classList.contains('on'),'navigation → Audit');
        await nav('.mh37p-tools button:has-text("ROMI1")',()=>document.getElementById('s-romi').classList.contains('on'),'navigation → ROMI1');
        await nav('.mh37p-item[data-key="hsPayees"] .mh37p-go',()=>document.getElementById('s-paie').classList.contains('on'),'bloquant « HS payées » → Paie');
        ok(before===await store(pg),'navigation sans écriture');
        ok(await pg.evaluate(()=>window.DB===undefined),'window.DB non exposé');
      }
      ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,3).join(' | '):''));
      await ctx.close();
    }
    console.log('Relevé 21/09 → 18/10/2026 (412 px)');
    {const {ctx,pg,errs}=await open(b,412,'dark','2026-09-21');const m=await metrics(pg);
      ok(m.brut==='1 791,78 €'&&/Bulletin — octobre 2026/.test(m.txt),'brut 1 791,78 € · Bulletin — octobre 2026');
      await pg.locator('#mh37Assistant details[data-open="evol"] > summary').click();await pg.waitForTimeout(150);
      const ev=(await pg.locator('#mh37Assistant details[data-open="evol"]').innerText()).replace(/\s+/g,' ');
      ok(/TTE 167h55 110h50 −57h05/.test(ev)&&/Jours de CP : 5 → 0/.test(ev),'évolution : TTE 167h55 → 110h50 (−57h05), faits constatés');
      ok(errs.length===0,'0 erreur JavaScript');await ctx.close()}

    console.log('Cache : installation V37.0-F puis mise à jour V37.0-G');
    const OLD=fs.mkdtempSync(path.join(os.tmpdir(),'mh37f-'));
    cp.execSync('git archive b5979ad app/src/main/assets/web | tar -x -C '+JSON.stringify(OLD),{cwd:REPO,stdio:'ignore'});
    ROOT=path.join(OLD,'app/src/main/assets/web');
    const ctx=await b.newContext({viewport:{width:412,height:915}}),pg=await ctx.newPage();
    await pg.addInitScript(d=>{try{if(!localStorage.getItem('mesheures_v3'))localStorage.setItem('mesheures_v3',JSON.stringify(d.db))}catch(e){}},seed('2026-08-24'));
    const url=`http://127.0.0.1:${srv.address().port}/index.html?v=36.2.0`;
    const probe=async()=>{await pg.waitForTimeout(2500);await pg.evaluate(()=>{try{tab('paie')}catch(e){}});await pg.waitForTimeout(400);
      return pg.evaluate(async()=>({v33:/Assistant paie V33/i.test(document.getElementById('s-paie').innerText),v37:!!document.getElementById('mh37Assistant'),caches:await caches.keys(),sw:!!navigator.serviceWorker.controller}))};
    await pg.goto(url);let p=await probe();await pg.reload();p=await probe();
    ok(p.v33&&!p.v37&&p.sw,'V37.0-F installé : ancien Assistant paie V33 servi par le cache (situation de départ)');
    ROOT=NEW;await pg.reload();await probe();await pg.reload();p=await probe();
    ok(!p.v33&&p.v37&&p.caches.length===1&&p.caches[0]==='mesheures-shell-v37.0-G','après mise à jour : Assistant Paie V37 servi, seul le cache mesheures-shell-v37.0-G reste');
    await pg.reload();p=await probe();ok(!p.v33&&p.v37,'3e lancement : l’ancien Assistant V33 n’est plus jamais servi');
    await ctx.close();fs.rmSync(OLD,{recursive:true,force:true});
  }catch(e){ok(false,'exception : '+e.message)}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.0-G : OK');process.exit(fails?1:0);
});
