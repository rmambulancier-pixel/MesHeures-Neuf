#!/usr/bin/env node
/*
 * V37.0-B — Audit réglementaire, Dossier & preuves : affichage mobile.
 * Appareil de référence : Pixel 10 Pro XL. Largeurs CSS testées : 448 et 412 (selon le réglage
 * « Taille d'affichage » d'Android), 360 (petit téléphone). Thèmes sombre et clair.
 * Données : historique embarqué (loadArchive : 252 journées, 38 quatorzaines) + période de référence.
 * Usage : node tests/v37-ux.browser.js   (Playwright + Chromium ; code 2 si indisponible)
 * Captures écrites dans le dossier temporaire du système (mh37b-<largeur>-<thème>.png).
 */
let chromium;
try{({chromium}=require('playwright'))}catch(e){console.log('SKIP : Playwright indisponible');process.exit(2)}
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const ROOT=path.join(__dirname,'..','app/src/main/assets/web');
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ref-2026-08-24.json'),'utf8'));
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
let fails=0;const ok=(c,m)=>{console.log((c?'  ok  ':'FAIL  ')+m);if(!c)fails++};
const MAX_AUDIT_H={448:3300,412:3400,360:3700}; // avant V37.0-B : 6291 px à 412

const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})});
srv.listen(0,async()=>{
  const b=await chromium.launch();
  for(const W of [448,412,360])for(const theme of ['dark','light']){
    console.log(`Largeur ${W} px · thème ${theme==='dark'?'sombre':'clair'}`);
    const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:W,height:900},colorScheme:theme,isMobile:true,hasTouch:true});
    const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.accept());
    await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d));localStorage.setItem('mesheures_theme',d.__t);sessionStorage.setItem('s','1')}}catch(e){}},
      {s:fx.s,days:fx.days,periods:[],per:{start:'2026-08-24',nb:2},bul:{},bulletins:[],romi:{},__t:theme});
    await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(1200);
    await pg.evaluate(()=>{loadArchive();tab('audit')});await pg.waitForTimeout(1000);
    const m=await pg.evaluate(()=>{
      const sec=document.getElementById('s-audit'),vw=document.documentElement.clientWidth;
      const tabs=[...sec.querySelectorAll('table')].map(t=>({id:t.id,w:t.scrollWidth,box:t.parentElement.clientWidth}));
      const aTab=document.getElementById('aTab'),old=aTab.querySelectorAll('tr.mh-old'),rows=aTab.querySelectorAll('tr:not(.mh-old-toggle):not(.t)');
      const visibleRows=[...rows].filter(r=>r.offsetParent!==null).length-1; // moins l'en-tête
      const journal=sec.querySelector('.mh-journal'),jr=journal?journal.querySelectorAll('.mh-v30-row:not(.mh-head)'):[];
      const jVisible=[...jr].filter(r=>r.offsetParent!==null).length;
      const hashEl=document.getElementById('mhV30DossierHash');
      const btns=[...sec.querySelectorAll('button')].filter(x=>x.offsetParent!==null).map(x=>x.getBoundingClientRect().height);
      return {vw,doc:document.documentElement.scrollWidth,h:Math.round(sec.getBoundingClientRect().height),tabs,
        periods:rows.length-1,old:old.length,visibleRows,journalRows:jr.length,jVisible,
        hashFits:!hashEl||hashEl.scrollWidth<=hashEl.clientWidth+1,minBtn:Math.min(...btns),theme:document.documentElement.dataset.theme,
        nPeriodsDB:new Set((DB.periods||[]).filter(p=>p.start>='2025-01-01').map(p=>p.start+'|'+p.nb)).size}});
    ok(theme==='dark'?(!m.theme||m.theme==='dark'):m.theme==='light','thème appliqué : '+(m.theme||'sombre (par défaut)'));
    ok(m.doc<=m.vw,'aucun débordement horizontal de la page ('+m.doc+' / '+m.vw+' px)');
    ok(m.h<=MAX_AUDIT_H[W],'hauteur de l\'onglet Audit '+m.h+' px (maximum '+MAX_AUDIT_H[W]+', 6291 avant V37.0-B à 412)');
    m.tabs.forEach(t=>ok(t.w<=t.box,'tableau '+t.id+' entièrement visible ('+t.w+' / '+t.box+' px)'));
    ok(m.hashFits,'empreinte SHA-256 contenue dans la carte');
    ok(m.minBtn>=36,'boutons accessibles au doigt (hauteur minimale '+Math.round(m.minBtn)+' px)');
    ok(m.old>0&&m.visibleRows===m.periods-m.old,'périodes : '+(m.periods-m.old)+' visibles, '+m.old+' repliées, aucune supprimée ('+m.periods+' au total)');
    ok(m.jVisible<m.journalRows,'journal : mois sans donnée repliés ('+m.jVisible+' visibles sur '+m.journalRows+')');
    // Déplier : toutes les lignes deviennent visibles, sans débordement
    const u=await pg.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('#aTab tr.mh-old-toggle button').click();document.querySelector('#s-audit .mh-empty-toggle')?.click();
      document.querySelectorAll('#s-audit details').forEach(d=>d.open=true);await w(200);
      const aTab=document.getElementById('aTab'),rows=[...aTab.querySelectorAll('tr:not(.mh-old-toggle):not(.t)')].filter(r=>r.offsetParent!==null).length-1;
      const jr=[...document.querySelectorAll('#s-audit .mh-journal .mh-v30-row:not(.mh-head)')];
      const proofs=[...document.querySelectorAll('#s-audit .mh-v30-proof')].map(x=>x.getBoundingClientRect().height);
      return {rows,all:aTab.querySelectorAll('tr:not(.mh-old-toggle):not(.t)').length-1,jVis:jr.filter(r=>r.offsetParent!==null).length,jAll:jr.length,
        doc:document.documentElement.scrollWidth,vw:document.documentElement.clientWidth,proofs:proofs.length,proofAvg:proofs.length?proofs.reduce((a,b)=>a+b,0)/proofs.length:0,
        label:document.querySelector('#aTab tr.mh-old-toggle button').textContent}});
    ok(u.rows===u.all&&/Masquer/.test(u.label),'bouton « Afficher les périodes antérieures » : '+u.rows+'/'+u.all+' périodes visibles');
    ok(u.jVis===u.jAll,'bouton « Afficher les mois sans donnée » : '+u.jVis+'/'+u.jAll+' mois visibles');
    ok(u.doc<=u.vw,'tout déplié : toujours aucun débordement ('+u.doc+' / '+u.vw+' px)');
    ok(u.proofs>0&&u.proofAvg<=80,'constats persistants compacts ('+u.proofs+' constats, '+Math.round(u.proofAvg)+' px en moyenne)');
    ok(errs.length===0,'0 erreur JavaScript'+(errs.length?' : '+errs.slice(0,2).join(' | '):''));
    await pg.screenshot({path:path.join(os.tmpdir(),`mh37b-${W}-${theme}.png`),fullPage:true});
    await ctx.close();
  }
  /* Données : l'affichage ne change aucune valeur produite par les moteurs */
  {
    const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:412,height:900}});const pg=await ctx.newPage();pg.on('dialog',d=>d.accept());
    await pg.addInitScript(d=>{try{if(!sessionStorage.getItem('s')){localStorage.setItem('mesheures_v3',JSON.stringify(d));sessionStorage.setItem('s','1')}}catch(e){}},{s:fx.s,days:fx.days,periods:[{start:'2026-08-24',nb:2}],per:{start:'2026-08-24',nb:2},bul:{},bulletins:[],romi:{}});
    await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);await pg.waitForTimeout(1200);
    const d=await pg.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));tab('audit');await w(800);
      const tot=[...document.querySelectorAll('#aTab tr.t td')].map(x=>x.textContent.trim());const G=calcPer('2026-08-24',2).G;
      const before=localStorage.getItem('mesheures_v3');tab('home');tab('audit');await w(300);
      return {tot,tte:F(G.tte),h25:C2(G.h25),h50:C2(G.h50),same:before===localStorage.getItem('mesheures_v3')}});
    console.log('Données');
    ok(d.tot[1]===d.tte&&d.tot[2]===d.h25&&d.tot[3]===d.h50,'TOTAL du tableau = moteur ('+d.tot.slice(1,4).join(' · ')+')');
    ok(d.tte==='167h55','référence : TTE 167h55');
    ok(d.same,'navigation dans l\'onglet Audit : données enregistrées inchangées');
    await ctx.close();
  }
  console.log(fails?`\n${fails} ÉCHEC(S)`:'\nTous les tests d\'affichage passent.');
  await b.close();srv.close();process.exit(fails?1:0);
});
