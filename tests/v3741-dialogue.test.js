#!/usr/bin/env node
/*
 * V37.4.1 — Fenêtres de dialogue : garanties de périmètre (contrôles statiques). Le comportement est testé par
 * tests/v3741-dialogue.browser.js (application réelle) et tests/v3741-dialogue-android.test.js (code Android, JVM).
 * Lancer : node tests/v3741-dialogue.test.js
 */
const fs=require('fs'),path=require('path'),assert=require('assert'),cp=require('child_process');
const REPO=path.join(__dirname,'..'),WEB=path.join(REPO,'app/src/main/assets/web'),SC=path.join(WEB,'scripts');
const BASE='7339732';   /* V37.4.0 (commit local de référence, arbre c531a40f) */
let fails=0;const t=(n,f)=>{try{f();console.log('  ok  '+n)}catch(e){fails++;console.log('FAIL  '+n+'\n      '+e.message)}};
const read=f=>fs.readFileSync(path.join(REPO,f),'utf8');
const git=c=>cp.execSync('git '+c,{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
let base=null;try{git('cat-file -e '+BASE+'^{commit}');base=BASE}catch(e){}

console.log('Périmètre');
t('app-core.js, modules Planning (app-v372-*) et Comparaison (app-v373-*) identiques à V37.4.0',()=>{
  if(!base){console.log('      (commit '+BASE+' absent : contrôle par le tag v37.3.0 fait dans v374-dossier-planning.test.js)');return}
  const f=['app-core.js'].concat(fs.readdirSync(SC).filter(x=>/^app-v37[23]-/.test(x))).map(x=>'app/src/main/assets/web/scripts/'+x);
  assert.equal(git('diff --name-only '+base+' -- '+f.join(' ')),'')});
t('version des sauvegardes : convention formatVersion du lot V37.5.0 (remplace BACKUP_VERSION figé à 37.3.0)',()=>{const b=read('app/src/main/assets/web/scripts/app-backup.js');assert.ok(/BACKUP_FORMAT_VERSION=3;/.test(b)&&!/BACKUP_VERSION=/.test(b))});
t('module chargé avant les écrans (juste après app-core.js) et mis en cache par le service worker',()=>{
  const h=read('app/src/main/assets/web/index.html'),i=h.indexOf('app-v3741-dialogue.js'),c=h.indexOf('app-core.js'),u=h.indexOf('app-ui.js');
  /* V37.5.0 : révision du cache lue dans sw.js (elle change à chaque livraison) */
  const sw=read('app/src/main/assets/web/sw.js'),rev=(sw.match(/const CACHE='mesheures-shell-v([^']+)'/)||[])[1];
  assert.ok(i>c&&i<u);assert.ok(rev&&sw.includes("'./scripts/app-v3741-dialogue.js?v="+rev+"'"),rev)});
t('le module de dialogue n’accède à aucune donnée (ni DB, ni stockage)',()=>{
  const s=read('app/src/main/assets/web/scripts/app-v3741-dialogue.js').replace(/\/\*[\s\S]*?\*\//g,'');
  ['localStorage','sessionStorage','indexedDB','DB.','DB[','save('].forEach(w=>assert.ok(!s.includes(w),w))});

console.log('Parcours convertis : fenêtre intégrée, repli natif conservé');
const P={'app-dossier.js':['saisir(','info('],'app-v30.js':['MHDialogue.info','exclusif('],'app-backup.js':['confirmer(','danger:true'],'app-evidence.js':['formulaire(',"type:'password'",'confirmer('],
  'app-ui.js':['confirmer(','danger:true'],'romi-master.js':['confirmer(','danger:true'],'app-plugins.js':['confirmer(','danger:true'],'app-v33-assistant.js':['MHDialogue.info']};
Object.entries(P).forEach(([f,mots])=>t(f+' : '+mots.join(', '),()=>{const s=read('app/src/main/assets/web/scripts/'+f);mots.forEach(m=>assert.ok(s.includes(m),m))}));
t('objet du dossier : demandé pour l’imprimable seulement ; « Annuler » abandonne l’export',()=>{
  const s=read('app/src/main/assets/web/scripts/app-dossier.js');assert.ok(/if\(print\)\{const r=await demanderObjet\(\);if\(r==null\)return null;/.test(s))});
t('confirmations destructives : jamais remplacées par un simple message (bouton d’action explicite)',()=>{
  [['app-ui.js',["action:'Effacer tout'","action:'Effacer'","action:'Écraser'"]],['app-backup.js',["action:'Remplacer les données'","action:'Restaurer'"]],
   ['romi-master.js',["action:'Supprimer'"]],['app-plugins.js',["action:'Désinstaller'"]],['app-evidence.js',["action:'Restaurer'"]]].forEach(([f,a])=>{
    const s=read('app/src/main/assets/web/scripts/'+f);a.forEach(x=>assert.ok(s.includes(x),f+' '+x))})});
t('Android : bouton Retour (garde-fous) et fenêtres natives aux couleurs de MesHeures',()=>{
  const j=read('app/src/main/java/com/mesheures/app/LegacyWebViewActivity.java');
  ['new OnBackPressedCallback(false)','getOnBackPressedDispatcher().addCallback(retourDialogue)','public void dialogueEtat(boolean ouvert)','public boolean onJsConfirm(','public boolean onJsPrompt(','public boolean onJsAlert(','onPageStarted('].forEach(x=>assert.ok(j.includes(x),x))});

console.log(fails?`\n${fails} échec(s)`:'\nTous les tests V37.4.1 (dialogues, périmètre) passent.');process.exit(fails?1:0);
