#!/usr/bin/env node
/*
 * Validation navigateur de la mise à jour du cache (service worker).
 * Simule : app installée sur une ANCIENNE version (SW actif, cache rempli),
 * puis remplacement des assets par la NOUVELLE version (= installation du nouvel APK,
 * données et caches conservés), puis lancements successifs.
 * Usage : node tests/sw-update.browser.js <racine-ancienne-version> <racine-nouvelle-version>
 *   ex. git worktree add /tmp/old e2ddb16 && node tests/sw-update.browser.js /tmp/old .
 * Nécessite Playwright (Chromium). Sort en code 1 si l'ancien code reste servi au 2e lancement.
 */
const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const path0=require('path');const OLD=path0.resolve(process.argv[2])+'/app/src/main/assets/web',NEW=path0.resolve(process.argv[3])+'/app/src/main/assets/web';const results={};
let ROOT=OLD;const served=[];
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html');served.push(q.url);
 fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});r.end(b)})}).listen(0,async()=>{
 const url=`http://127.0.0.1:${srv.address().port}/index.html?v=36.2.0`;   // = HybridCore.ENTRY_URL (query fixe côté natif)
 const b=await chromium.launch(),ctx=await b.newContext(),pg=await ctx.newPage();
 const probe=async(label)=>{await pg.waitForTimeout(2500);const s=await pg.evaluate(async()=>({
   moteurCorrige:typeof mhEffectivePauses==='function',
   rowsPresent:(()=>{try{MHRoadmap.generate('2026-08-24');return true}catch(e){return false}})(),
   scriptsVersion:[...document.scripts].map(s=>s.getAttribute('src')||'').filter(s=>s.includes('app-core'))[0],
   swControle:!!navigator.serviceWorker.controller,
   caches:await caches.keys()}));
   const net=served.filter(u=>/app-core|app-roadmap|sw\.js/.test(u));served.length=0;
   results[label]=s;console.log(label.padEnd(36),JSON.stringify(s),'| réseau:',net.join(' '));};
 await pg.goto(url);await probe('1. e2ddb16, 1er lancement');
 await pg.reload();await probe('2. e2ddb16, relance (SW actif)');
 ROOT=NEW;  // « installation du nouvel APK » : les assets changent, données et caches conservés
 await pg.reload();await probe('3. nouvel APK, 1er lancement');
 await pg.reload();await probe('4. nouvel APK, 2e lancement');
 await pg.reload();await probe('5. nouvel APK, 3e lancement');
 await b.close();srv.close();
 const fin=results['4. nouvel APK, 2e lancement'];
 const ok=fin&&fin.moteurCorrige&&fin.rowsPresent&&fin.caches.length===1&&/-r1$/.test(fin.caches[0]);
 console.log(ok?'OK : à partir du 2e lancement, seul le nouveau cache existe et le code corrigé est servi.':'ÉCHEC : ancien code ou ancien cache encore présent.');process.exit(ok?0:1);});
