#!/usr/bin/env node
/*
 * V37.0-F — Rapprochement ROMI1 dans l'application réelle (Chromium), depuis Compteur heures → Comparaison ROMI1.
 * Largeurs 360 / 412 (Pixel 10 Pro XL) / 448 px, thèmes clair et sombre.
 * Scénario « réel » : relevé ROMI1 avec totaux seulement. Scénario « détail » : détail journalier SYNTHÉTIQUE
 * (deux journées ROMI1 réduites) pour vérifier le rendu du contrôle journalier.
 * Usage : node tests/v37-romi-reconciliation.browser.js · sortie 0 = OK, 1 = échec, 2 = Playwright absent.
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible ('+e.message.split('\n')[0]+')');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm');
const ROOT=path.join(__dirname,'..','app/src/main/assets/web');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const BAD=/undefined|NaN|\bnull\b|\[object|Infinity/;
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const BASE={periodStart:'2026-08-24',periodEnd:'2026-09-20',ttePeriodH:150.25,hsPeriodH:39.42,presenceDays:16,rcBalanceH:174.15};

/* Détail journalier synthétique = valeurs du moteur, puis 16/09 −7h00 et 17/09 −6h40 côté ROMI1. */
function synthDaily(){
  const ctx={window:{},document:{getElementById:()=>null,dispatchEvent(){},addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:function(){},console,setTimeout:()=>0,Date,Math,JSON,Object,Array,Map,Number,String,Promise,Intl,RegExp,Set,Error};
  ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'scripts/app-core.js'),'utf8')+';DB.s={...DEF,...'+JSON.stringify(fx.s)+'};DB.days='+JSON.stringify(fx.days)+';mhNormalizeMealSettings();mhMigrateLegacyMealChoices();globalThis.__x={cd,addD};',ctx);
  const out=[],X=ctx.__x;
  for(let k=BASE.periodStart;k<=BASE.periodEnd;k=X.addD(k,1)){const d=fx.days[k],r=X.cd(k),w=d&&(d.t==='T'||d.t==='NUIT');
    const x={date:k,presence:!!w,tteMin:w?r.tte:0};if(w){x.debut=d.deb;x.fin=d.fin;x.pauseMin=r.pz}
    if(k==='2026-09-16')x.tteMin-=420;if(k==='2026-09-17')x.tteMin-=400;out.push(x)}
  return out;
}
const SCEN={reel:{...BASE},detail:{...BASE,jours:synthDaily()}};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});

srv.listen(0,async()=>{
  const b=await chromium.launch();
  try{
    for(const W of [412,360,448])for(const theme of ['dark','light'])for(const sc of ['reel','detail']){
      console.log(`${W} px · ${theme==='dark'?'sombre':'clair'} · ${sc==='reel'?'relevé réel (totaux)':'détail journalier synthétique'}`);
      const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:915},deviceScaleFactor:2,colorScheme:theme,isMobile:true,hasTouch:true});
      const pg=await ctx.newPage(),errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
      await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d.db));localStorage.setItem('mh_romi_master_v35',JSON.stringify(d.romi));localStorage.setItem('mesheures_theme',d.t);sessionStorage.setItem('s','1')}}catch(e){}},
        {db:{s:fx.s,days:fx.days,periods:[],per:{start:'2026-08-24',nb:2},bul:{},bulletins:[],romi:{}},romi:{'2026-08-24_2026-09-20':{data:SCEN[sc]}},t:theme});
      await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(2500);
      await pg.evaluate(()=>tab('home'));await pg.waitForTimeout(300);
      const before=await pg.evaluate(()=>[localStorage.getItem('mesheures_v3'),localStorage.getItem('mh_romi_master_v35')]);
      const fold=pg.locator('#mh37Compteur details[data-fold="romi"]');
      await fold.scrollIntoViewIfNeeded();
      const sumTxt=(await fold.locator(':scope > summary').innerText()).replace(/\s+/g,' ').trim();
      ok(/^Comparaison ROMI1 écart 17h40 ⚠️$/.test(sumTxt)&&!(await fold.evaluate(d=>d.open)),'volet fermé compact : « '+sumTxt+' »');
      await fold.locator(':scope > summary').click();await pg.waitForTimeout(150);
      const m=await fold.evaluate(d=>{const t=d.innerText,r=d.getBoundingClientRect();const v=k=>(d.querySelector('[data-k="'+k+'"]')||{}).textContent;
        const over=[...d.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&(b.right>r.right+1||b.left<r.left-1)}).map(e=>e.className||e.tagName).slice(0,3);
        return {t,jc:v('jc'),ex:v('ex'),rest:v('rest'),over,docW:document.documentElement.scrollWidth,vw:innerWidth,days:!!d.querySelector('details.mh37c-days')}});
      ok(/MESHEURES\s*167h55/i.test(m.t)&&/ROMI1 \(EMPLOYEUR\)\s*150h15/i.test(m.t)&&/ÉCART TTE\s*17h40/i.test(m.t)&&/À vérifier · écart à analyser/.test(m.t),'synthèse : MesHeures 167h55 · ROMI1 150h15 · écart 17h40 « À vérifier · écart à analyser »');
      if(sc==='reel'){
        ok(m.jc==='0 / 28'&&m.ex==='—'&&m.rest==='+17h40'&&!m.days,'totaux seuls : 0 / 28 comparables, expliqué « — », restant +17h40, aucun détail fabriqué');
        ok(/ne peut pas encore être localisé/.test(m.t)&&/Aucune cause n’est déduite/.test(m.t),'message honnête : écart non localisable sans détail ROMI1');
      }else{
        ok(m.jc==='28 / 28'&&m.ex==='+13h40'&&m.rest==='+4h00','décomposition : 28 / 28, écart expliqué +13h40, restant à analyser +4h00');
        await fold.locator('details.mh37c-days summary').click();await pg.waitForTimeout(150);
        const dd=await fold.evaluate(d=>{const r=d.getBoundingClientRect(),rows=[...d.querySelectorAll('.mh37c-dr')];
          const cut=[...d.querySelectorAll('.mh37c-dr>span,.mh37c-dr>b')].some(s=>s.scrollWidth>s.clientWidth+1||s.getClientRects().length>1);
          const over=[...d.querySelectorAll('.mh37c-days *')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.right>r.right+1}).length;
          const w=rows.filter(x=>x.dataset.statut==='a_verifier').map(x=>x.dataset.date+' '+x.querySelector('b').textContent);
          return {n:rows.length,w,cut,over,t:d.innerText}});
        ok(dd.n===18&&dd.w.join(',')==='2026-09-16 +7h00,2026-09-17 +6h40','détail : 18 journées travaillées, 2 à vérifier (16/09 +7h00, 17/09 +6h40)');
        ok(/MesHeures 05:45–17:10 · pause 12:20–12:50/.test(dd.t)&&/ROMI1 05:45–17:10 · pause 0h30/.test(dd.t),'horaires et pauses des deux sources affichés');
        ok(!dd.cut&&!dd.over,'lignes journalières lisibles, sans valeur coupée ni débordement');
      }
      ok(!BAD.test(m.t),'aucune valeur invalide');
      ok(m.docW<=m.vw&&!m.over.length,'aucun débordement horizontal'+(m.over.length?' : '+m.over.join(', '):''));
      if(sc==='detail'&&W===412)await fold.screenshot({path:path.join(os.tmpdir(),`mh37f-${W}-${theme}.png`)});
      if(sc==='reel'&&W===412)await fold.screenshot({path:path.join(os.tmpdir(),`mh37f-${W}-${theme}-reel.png`)});
      const after=await pg.evaluate(()=>[localStorage.getItem('mesheures_v3'),localStorage.getItem('mh_romi_master_v35')]);
      ok(before[0]===after[0]&&before[1]===after[1],'aucune écriture (journées, ROMI1)');
      ok(await pg.evaluate(()=>window.DB===undefined),'window.DB non exposé');
      ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,3).join(' | '):''));
      await ctx.close();
    }
  }catch(e){ok(false,'exception : '+e.message)}
  await b.close();srv.close();
  console.log(fails?`\n${fails} échec(s)`:'\nTest navigateur V37.0-F : OK');process.exit(fails?1:0);
});
