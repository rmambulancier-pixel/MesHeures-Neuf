#!/usr/bin/env node
/*
 * V37.0-E — Compteur heures dans l'application réelle (Chromium).
 * Largeurs : 412 px (Pixel 10 Pro XL), 448 px et 360 px ; thèmes sombre et clair.
 * Usage : node tests/v37-compteur.browser.js   (Playwright + Chromium) · sortie 0 = OK, 1 = échec, 2 = Playwright absent.
 * Captures : <tmp>/mh37e-<largeur>-<thème>.png
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const ROOT=path.join(__dirname,'..','app/src/main/assets/web');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const ROMI={'2026-08-24_2026-09-20':{data:{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}}};
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    for(const W of [412,448,360])for(const theme of ['dark','light']){
      console.log(`Largeur ${W} px · thème ${theme==='dark'?'sombre':'clair'}${W===412?' (Pixel 10 Pro XL)':''}`);
      const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:W===412?3.5:2,colorScheme:theme,isMobile:true,hasTouch:true});
      const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
      await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mh_romi_master_v35',JSON.stringify(d.romi));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},
        {db:{s:fx.s,days:fx.days,periods:[],per:{start:'2026-08-24',nb:2},bul:{},bulletins:[],romi:{}},romi:ROMI,t:theme});
      await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2500);
      await pg.evaluate(()=>tab('home'));await pg.waitForTimeout(300);
      const before=await pg.evaluate(()=>localStorage.getItem('mesheures_v3'));
      const card=pg.locator('#mh37Compteur');
      ok(await card.count()===1,'bloc « Compteur heures » présent sur l’Accueil');
      await card.scrollIntoViewIfNeeded();
      const m=await pg.evaluate(()=>{const c=document.getElementById('mh37Compteur'),r=c.getBoundingClientRect(),v=k=>(c.querySelector('[data-k="'+k+'"]')||{}).textContent;
        const btns=[...c.querySelectorAll('button')].map(x=>x.getBoundingClientRect()).filter(x=>x.width);
        const over=[...c.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&(b.right>r.right+1||b.left<r.left-1)}).map(e=>e.className||e.tagName).slice(0,3);
        return {txt:c.innerText,head:c.querySelector('.mh31-card-head b').textContent,tte:v('tte'),amp:v('amp'),h25:v('h25'),h50:v('h50'),hs:v('hs'),nuit:v('nuit'),idaj:v('idaj'),hab:v('hab'),cp:v('cp'),pan:v('pan'),
          docW:document.documentElement.scrollWidth,vw:innerWidth,over,minH:Math.min(...btns.map(x=>x.height)),minW:Math.min(...btns.map(x=>x.width)),
          romi:(c.querySelector('[data-romi]')||{}).dataset?.romi,bg:getComputedStyle(c).backgroundColor,color:getComputedStyle(c.querySelector('.mh37c-row b')).color}});
      ok(m.head==='24/08 → 20/09/2026','relevé de référence affiché (dernier relevé saisi) : '+m.head);
      ok(m.tte==='167h55'&&m.amp==='173h25'&&/18 jours travaillés/.test(m.txt),'TTE 167h55, amplitude 173h25, 18 jours');
      ok(m.h25==='32h00'&&m.h50==='30h55'&&m.hs==='62h55','HS 25 % 32h00, HS 50 % 30h55, total 62h55');
      ok(m.nuit==='1h00'&&m.idaj==='0h45'&&m.hab==='3h00'&&m.cp==='5 j · 35h00'&&m.pan==='13 IR · 2 IRU','nuit 1h00, IDAJ 0h45, habillage 3h00, CP 5 j · 35h00, 13 IR · 2 IRU');
      ok(m.romi==='comparable'&&/MESHEURES\s*167h55/i.test(m.txt)&&/150h15/.test(m.txt)&&/17h40/.test(m.txt)&&/À vérifier/.test(m.txt),'comparaison MesHeures 167h55 / ROMI1 150h15, écart 17h40 « À vérifier »');
      ok(!BAD.test(m.txt),'aucune valeur invalide');
      ok(m.docW<=m.vw&&!m.over.length,'aucun débordement horizontal'+(m.over.length?' : '+m.over.join(', '):''));
      ok(m.minH>=36&&m.minW>=40,'boutons tactiles ≥ 36 px de haut ('+Math.round(m.minW)+'×'+Math.round(m.minH)+')');
      ok(m.bg!==m.color,'contraste texte / fond ('+m.color+' sur '+m.bg+')');
      /* quatorzaines */
      await pg.locator('#mh37Compteur details.mh37c-q summary').click();await pg.waitForTimeout(150);
      const q=await pg.evaluate(()=>{const c=document.getElementById('mh37Compteur'),r=c.getBoundingClientRect();
        const rows=[...c.querySelectorAll('.mh37c-qr')].map(x=>[...x.children].map(s=>s.innerText.replace(/\s+/g,' ').trim()));
        const over=[...c.querySelectorAll('.mh37c-qt *')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.right>r.right+1}).length;
        const wrap=[...c.querySelectorAll('.mh37c-qr span:not(:first-child)')].some(s=>s.getClientRects().length>1||s.scrollWidth>s.clientWidth+1);
        return {rows,over,wrap}});
      ok(q.rows.length===3&&q.rows[0][1]==='112h35'&&q.rows[0][3]==='16h00'&&q.rows[0][4]==='26h35','Q1 24/08 → 06/09 : 112h35, HS 16h00 / 26h35');
      ok(q.rows[1][1]==='55h20'&&q.rows[1][2]==='90h20'&&q.rows[1][3]==='16h00'&&q.rows[1][4]==='4h20','Q2 07/09 → 20/09 : 55h20, base 90h20, HS 16h00 / 4h20');
      ok(q.rows[2][1]==='167h55','total 167h55');
      ok(!q.over&&!q.wrap,'tableau des quatorzaines lisible, sans débordement ni valeur coupée');
      await pg.screenshot({path:path.join(os.tmpdir(),`mh37e-${W}-${theme}.png`),clip:await card.boundingBox().then(x=>({x:0,y:Math.max(0,x.y),width:W,height:Math.min(x.height+20,2600)})),fullPage:true});
      if(W===412&&theme==='dark'){
        await pg.locator('#mh37Compteur button[aria-label="Relevé précédent"]').click();await pg.waitForTimeout(300);
        const h1=await pg.locator('#mh37Compteur .mh31-card-head b').textContent();
        ok(h1==='27/07 → 23/08/2026','‹ : relevé précédent (27/07 → 23/08/2026)');
        ok(/Aucune journée saisie sur ce relevé/.test(await pg.locator('#mh37Compteur').innerText()),'relevé sans données : aucune valeur inventée');
        await pg.locator('#mh37Compteur button',{hasText:'Relevé actuel'}).click();await pg.waitForTimeout(300);
        ok(await pg.locator('#mh37Compteur .mh31-card-head b').textContent()==='21/09 → 18/10/2026','« Relevé actuel » : 21/09 → 18/10/2026');
        await pg.locator('#mh37Compteur button[aria-label="Relevé précédent"]').click();await pg.waitForTimeout(300);
        await pg.locator('#mh37Compteur button',{hasText:'Voir le calcul de paie'}).click();await pg.waitForTimeout(400);
        ok(await pg.evaluate(()=>document.getElementById('s-paie').classList.contains('on')),'« Voir le calcul de paie » ouvre l’écran Paie');
        const after=await pg.evaluate(()=>localStorage.getItem('mesheures_v3'));
        ok(before===after,'aucune écriture dans les données (navigation, ouverture des quatorzaines, lien Paie)');
        ok(await pg.evaluate(()=>window.DB===undefined),'window.DB non exposé');
      }
      ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,3).join(' | '):''));
      await ctx.close();
    }
  }catch(e){ok(false,'exception : '+e.message)}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.0-E : OK');process.exit(fails?1:0);
});
