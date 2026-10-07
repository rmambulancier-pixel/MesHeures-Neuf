#!/usr/bin/env node
/*
 * V37.0-H — Cohérence paie et finition, dans l'application réelle (Chromium), horloge figée au 08/10/2026.
 * 360 / 412 (Pixel 10 Pro XL) / 448 px, sombre et clair ; synthèse et bulletin de référence ; comparaison bulletin ;
 * repos compensateur ; Assistant Paie ; Compteur ; débordements ; cache 37.0-G → 37.0-H.
 * Usage : node tests/v37-paie-coherence.browser.js · sortie 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),NEW=path.join(REPO,'app/src/main/assets/web');
const R1=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-09-21.json'),'utf8'));
const NOW=new Date('2026-10-08T10:00:00');
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
const N=' ',S=' ';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
let ROOT=NEW;
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
/* Semaine du 12/10 laissée sans aucune journée : elle doit être « non comparable ». */
const DAYS={...R1.days,...R2.days};['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18'].forEach(k=>delete DAYS[k]);
const seed=(start,cmp)=>({s:R1.s,days:DAYS,periods:[],per:{start,nb:2},bul:{},bulletins:[{mois:'2026-09',brut:3253.01,net:2722.62,hs25H:16,hs50H:4.33}],romi:{},cmp:cmp||{}});
const ROMI={'2026-08-24_2026-09-20':{data:{periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15}}};

async function open(b,W,theme,db,sw){
  const ctx=await b.newContext({serviceWorkers:sw?'allow':'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.clock.setFixedTime(NOW);
  await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mh_romi_master_v35',JSON.stringify(d.romi));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},{db,romi:ROMI,t:theme});
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2500);
  await pg.evaluate(()=>tab('paie'));await pg.waitForTimeout(400);
  return {ctx,pg,errs};
}
const overflow=(pg,sel)=>pg.evaluate(s=>{const root=document.querySelector(s),r=root.getBoundingClientRect();
  return {doc:document.documentElement.scrollWidth-innerWidth,el:[...root.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.right>r.right+1&&!e.closest('[style*="overflow"]')}).map(e=>e.tagName+'.'+e.className).slice(0,3)}},sel);

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    /* semaine du 21/09 : TTE bulletin saisi égal au TTE MesHeures ; 28/09 : valeur différente (> 24 h) ; 05/10 vide ; 12/10 sans journée */
    for(const W of [412,360,448])for(const theme of ['dark','light']){
      console.log(`${W} px · ${theme==='dark'?'sombre':'clair'}${W===412?' (Pixel 10 Pro XL)':''} · relevé en cours 21/09 → 18/10`);
      const {ctx,pg,errs}=await open(b,W,theme,seed('2026-09-21',{}));
      const before=await pg.evaluate(()=>localStorage.getItem('mesheures_v3'));
      const m=await pg.evaluate(()=>({gap:document.getElementById('proGap').textContent,ref:document.getElementById('proGap').dataset.ref,per:(document.getElementById('proPeriod')||{}).textContent,
        net:[...document.querySelectorAll('#pProSummary span')].map(s=>s.textContent).join('|'),align:(document.querySelector('#pAlign [data-periode]')||{}).textContent,
        assist:document.getElementById('mh37Assistant').innerText}));
      ok(m.ref==='precedent'&&/^septembre 2026 · brut 3\s?253,01\s?€ · net 2\s?722,62\s?€/.test(m.gap)&&/Référence précédente — pas le bulletin de la période courante\./.test(m.gap),'2-3. synthèse : « Bulletin de référence » septembre 2026 qualifié « référence précédente »');
      ok(/Bulletin de référence/.test(m.net)&&!/Écart bulletin/.test(m.net)&&/Net salaire estimé/.test(m.net),'libellés : « Bulletin de référence », « Net salaire estimé » (plus d’« Écart bulletin »)');
      ok(/^Relevé en cours · 21\/09 → 18\/10\/2026 · calculé par MesHeures · mois de paie octobre 2026 \(rattachement à confirmer\)$/.test(m.per),'1. période qualifiée dans la synthèse');
      ok(/Relevé en cours · 21\/09 → 18\/10\/2026/.test(m.align||''),'1. écran Paie : relevé en cours annoncé');
      ok(/Relevé en cours · 21\/09 → 18\/10\/2026/.test(m.assist)&&/Brut estimé\s*1\s?791,78/.test(m.assist.replace(/ /g,' '))&&/Bulletin de référence\s*Septembre 2026/i.test(m.assist),'Assistant : même période, brut 1 791,78 €, bulletin de référence qualifié');
      /* comparaison bulletin */
      const weeks=await pg.evaluate(()=>[...document.querySelectorAll('#pCmp tr[data-week]')].map(r=>({w:r.dataset.week,st:r.dataset.statut,tte:r.children[1].textContent,txt:r.lastElementChild.textContent})));
      const w1=weeks.find(x=>x.w==='2026-09-21');
      await pg.locator('#pCmp tr[data-week="2026-09-21"] input').fill(w1.tte.replace('h',':'));await pg.locator('#pCmp tr[data-week="2026-09-21"] input').dispatchEvent('change');await pg.waitForTimeout(250);
      await pg.locator('#pCmp tr[data-week="2026-09-28"] input').fill('41h00');await pg.locator('#pCmp tr[data-week="2026-09-28"] input').dispatchEvent('change');await pg.waitForTimeout(250);
      const w2=await pg.evaluate(()=>[...document.querySelectorAll('#pCmp tr[data-week]')].map(r=>[r.dataset.week,r.dataset.statut,r.lastElementChild.textContent,r.children[3].textContent]));
      const st=Object.fromEntries(w2.map(x=>[x[0],x]));
      ok(st['2026-09-21'][1]==='ok'&&/🟢 Concordant/.test(st['2026-09-21'][2]),'12. semaine du 21/09 : TTE bulletin = TTE MesHeures ('+w1.tte+') → 🟢 Concordant');
      ok(st['2026-09-28'][1]==='warn'&&/🟠 Écart à vérifier/.test(st['2026-09-28'][2])&&/^[+−]\d+h\d{2}$/.test(st['2026-09-28'][3]),'12. semaine du 28/09 : 41:00 (> 24 h accepté) → 🟠 Écart à vérifier '+st['2026-09-28'][3]);
      ok(st['2026-10-05'][1]==='na'&&/⚪ Non renseigné/.test(st['2026-10-05'][2])&&st['2026-10-05'][3]==='—','7/12. cellule vide → ⚪ Non renseigné, jamais 0');
      ok(st['2026-10-12'][1]==='nc'&&/⚫ Non comparable/.test(st['2026-10-12'][2]),'12. semaine sans journée saisie → ⚫ Non comparable');
      /* repos compensateur */
      const rc=(await pg.locator('#pRcOut').innerText()).replace(/\s+/g,' ');
      ok(/HS calculées MesHeures/i.test(rc)&&/HS payées \(employeur\)/i.test(rc)&&/RC théorique MesHeures/i.test(rc)&&/RC employeur \(acquis\)\s*non renseigné/.test(rc)&&/Solde RC employeur\s*non renseigné/.test(rc),'10. RC : HS calculées / payées / RC théorique / RC employeur / solde employeur distincts');
      ok(rc.includes('La valeur théorique MesHeures ne constitue pas le solde officiel de repos compensateur.')&&rc.includes('RC employeur non renseigné — solde réel indéterminable.')&&!/\d\.\d{2}/.test(rc),'10. RC : avertissements exacts, décimales françaises');
      /* Assistant : sources, impact, simulation */
      await pg.locator('#mh37Assistant details[data-open="sources"] > summary').click();await pg.waitForTimeout(120);
      const src=(await pg.locator('#mh37Assistant details[data-open="sources"]').innerText()).replace(/\s+/g,' ');
      ok(/CALCULÉ PAR MESHEURES/i.test(src)&&/FOURNI PAR L’EMPLOYEUR/i.test(src)&&/HYPOTHÈSE \/ À CONFIRMER/i.test(src)&&/HS réellement payées non renseigné/.test(src),'4-7. sources : calculé / fourni / à confirmer, absence = « non renseigné »');
      await pg.locator('#mh37Assistant details[data-open="impact"] > summary').click();await pg.waitForTimeout(120);
      const imp=(await pg.locator('#mh37Assistant details[data-open="impact"]').innerText()).replace(/\s+/g,' ');
      ok(imp.includes('Impact financier : non déterminable avec les données disponibles.')&&!/\d,\d{2}\s?€/.test(imp),'11. impact : aucun montant inventé');
      await pg.locator('#mh37Assistant details[data-open="sim"] > summary').click();await pg.waitForTimeout(120);
      for(const k of ['HS 25 % plus','HS 50 % plus','Paniers IR plus','Paniers IRU plus'])await pg.locator('#mh37Assistant button[aria-label="'+k+'"]').click();
      await pg.waitForTimeout(150);
      const sim=await pg.evaluate(()=>({bar:!!document.querySelector('#mh37Assistant [data-k="simbar"]'),brut:document.querySelector('#mh37Assistant [data-k="simBrut"]').textContent}));
      await pg.locator('#mh37Assistant button',{hasText:'Quitter la simulation'}).click();await pg.waitForTimeout(150);
      const after=await pg.evaluate(()=>({bar:!!document.querySelector('#mh37Assistant [data-k="simbar"]'),brut:document.querySelector('#mh37Assistant [data-k="brut"]').textContent,ls:localStorage.getItem('mesheures_v3')}));
      ok(sim.bar&&!after.bar&&after.brut==='1'+N+'791,78'+S+'€','8. simulation : bandeau « 🧪 SIMULATION — aucune donnée réelle modifiée », sortie = valeurs réelles');
      const cmpOnly=JSON.parse(after.ls),ref=JSON.parse(before);ref.cmp={'2026-09-21':w1.tte.replace('h',':'),'2026-09-28':'41h00'};
      ok(JSON.stringify(cmpOnly.days)===JSON.stringify(ref.days)&&JSON.stringify(cmpOnly.bulletins)===JSON.stringify(ref.bulletins)&&JSON.stringify(cmpOnly.bul||{})===JSON.stringify(ref.bul||{}),'8. aucune donnée réelle modifiée (journées, bulletins, paie) ; seules les deux saisies volontaires du TTE bulletin sont enregistrées');
      /* débordements et cibles tactiles */
      const o1=await overflow(pg,'#s-paie'),bt=await pg.evaluate(()=>Math.min(...[...document.querySelectorAll('#mh37Assistant button,#pCmp input')].filter(x=>x.offsetParent).map(x=>x.getBoundingClientRect().height)));
      ok(o1.doc<=0&&!o1.el.length,'20. aucun débordement horizontal dans Paie'+(o1.el.length?' : '+o1.el.join(', '):''));
      ok(bt>=40,'15-17. boutons et champs tactiles ≥ 40 px ('+Math.round(bt)+' px)');
      const all=await pg.evaluate(()=>document.getElementById('s-paie').innerText);ok(!BAD.test(all),'aucune valeur invalide dans Paie');
      if(W===412){await pg.locator('#pProSummary').screenshot({path:path.join(os.tmpdir(),`mh37h-synthese-${theme}.png`)});await pg.locator('#mh37Assistant').screenshot({path:path.join(os.tmpdir(),`mh37h-assistant-${theme}.png`)});
        await pg.locator('#pCmp').screenshot({path:path.join(os.tmpdir(),`mh37h-cmp-${theme}.png`)})}
      /* compteur */
      await pg.evaluate(()=>tab('home'));await pg.waitForTimeout(300);
      const c=await pg.evaluate(()=>{const e=document.getElementById('mh37Compteur');return {st:(e.querySelector('[data-k="statut"]')||{}).textContent,head:e.querySelector('.mh31-card-head b').textContent,autre:!!e.querySelector('[data-k="autrePaie"]')}});
      ok(c.st==='relevé en cours'&&c.head==='21/09 → 18/10/2026'&&!c.autre,'1. Compteur : même relevé que Paie (21/09 → 18/10), « relevé en cours »');
      const o2=await overflow(pg,'#s-home');ok(o2.doc<=0&&!o2.el.length,'20. aucun débordement sur l’Accueil');
      ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,3).join(' | '):''));
      await ctx.close();
    }
    console.log('Période antérieure choisie dans Paie (24/08 → 20/09)');
    {const {ctx,pg,errs}=await open(b,412,'dark',seed('2026-08-24'));
      const m=await pg.evaluate(()=>({align:(document.querySelector('#pAlign [data-periode]')||{}).textContent,gap:document.getElementById('proGap').textContent,ref:document.getElementById('proGap').dataset.ref,assist:document.getElementById('mh37Assistant').innerText}));
      ok(/Relevé antérieur · 24\/08 → 20\/09\/2026 · relevé en cours : 21\/09 → 18\/10\/2026/.test(m.align),'1. période antérieure explicitement qualifiée, relevé en cours rappelé');
      ok(m.ref==='rattache'&&/Bulletin rattaché à ce relevé — rattachement à confirmer\./.test(m.gap),'2. septembre 2026 = bulletin rattaché à ce relevé, « rattachement à confirmer »');
      await pg.locator('#mh37Assistant details[data-open="romi"] > summary').click();await pg.waitForTimeout(120);
      const r=(await pg.locator('#mh37Assistant details[data-open="romi"]').innerText()).replace(/\s+/g,' ');
      ok(/MesHeures calcul interne 167h55/.test(r)&&/ROMI1 source employeur 150h15/.test(r)&&/Écart \+17h40/.test(r)&&r.includes('Écart non localisé faute de détail journalier ROMI1.'),'9. ROMI1 : calcul interne 167h55 / source employeur 150h15 / +17h40, écart non localisé');
      await pg.evaluate(()=>tab('home'));await pg.waitForTimeout(300);
      ok(await pg.evaluate(()=>{const e=document.getElementById('mh37Compteur');return !!e.querySelector('[data-k="autrePaie"]')&&/24\/08 → 20\/09\/2026/.test(e.querySelector('[data-k="autrePaie"]').textContent)}),'1. Compteur (relevé en cours) signale que Paie porte sur 24/08 → 20/09/2026');
      ok(errs.length===0,'0 erreur JavaScript');await ctx.close()}

    console.log('21. Cache 37.0-G → 37.0-H');
    const OLD=fs.mkdtempSync(path.join(os.tmpdir(),'mh37g-'));
    const CUR=(fs.readFileSync(path.join(NEW,'sw.js'),'utf8').match(/const CACHE='([^']+)'/)||[])[1];
    cp.execSync('git archive 7ada3ed app/src/main/assets/web | tar -x -C '+JSON.stringify(OLD),{cwd:REPO,stdio:'ignore'});
    ROOT=path.join(OLD,'app/src/main/assets/web');
    const ctx=await b.newContext({viewport:{width:412,height:915}}),pg=await ctx.newPage();await pg.clock.setFixedTime(NOW);
    await pg.addInitScript(d=>{try{if(!localStorage.getItem('mesheures_v3'))localStorage.setItem('mesheures_v3',JSON.stringify(d))}catch(e){}},seed('2026-09-21'));
    const served=[];pg.on('request',r=>served.push(r.url()));
    const probe=async()=>{await pg.waitForTimeout(2500);await pg.evaluate(()=>{try{tab('paie')}catch(e){}});await pg.waitForTimeout(400);
      return pg.evaluate(async()=>({sources:!!document.querySelector('#mh37Assistant details[data-open="sources"]'),gap:(document.getElementById('proGap')||{}).textContent||'',statut:!!document.querySelector('#pCmp tr[data-statut]'),
        periode:typeof window.MHPeriode,caches:await caches.keys(),sw:!!navigator.serviceWorker.controller}))};
    await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html?v=36.2.0`);let p=await probe();await pg.reload();p=await probe();
    ok(p.sw&&!p.sources&&!p.statut&&p.periode==='undefined'&&/^2026-09/.test(p.gap),'V37.0-G installé : ancienne synthèse (« 2026-09 · brut … ») et ancien Assistant servis par le cache');
    ROOT=NEW;served.length=0;await pg.reload();await probe();await pg.reload();p=await probe();
    ok(p.sources&&p.statut&&p.periode==='object'&&/Référence précédente/.test(p.gap)&&p.caches.length===1&&p.caches[0]===CUR,'après mise à jour : nouvel Assistant, comparaison bulletin, MHPeriode et synthèse corrigée servis ; seul le cache '+CUR+' reste');
    ok(!served.some(u=>/\?v=37\.0-G/.test(u)),'aucun asset ?v=37.0-G demandé après la mise à jour');
    await pg.reload();p=await probe();ok(p.sources&&p.statut,'3e lancement : aucun ancien JS critique conservé');
    await ctx.close();fs.rmSync(OLD,{recursive:true,force:true});
  }catch(e){ok(false,'exception : '+e.message)}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.0-H : OK');process.exit(fails?1:0);
});
