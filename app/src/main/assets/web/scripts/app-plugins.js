/* MesHeures Extensions — V30.2.3 / Lot 6
   Ecosystème de plugins en lecture seule.
   Règle : une extension peut analyser/afficher/proposer, jamais modifier DB, les heures ou le moteur de paie.
   Format .mhplugin = JSON déclaratif : manifest + html + css + script optionnel.
   Exécution : iframe sandbox="allow-scripts", CSP sans réseau.
*/
const MH_PLUGIN_KEY='mesheures_plugins_v2';
const MH_PLUGIN_FORMAT='MesHeures Plugin';
const MH_PLUGIN_MAX_BYTES=180000;
const MH_PLUGIN_ALLOWED_PERMISSIONS=['snapshot','days','pay','evidence','legal'];
const MH_PLUGIN_PERMISSION_LABELS={
  snapshot:'Lecture des statistiques du mois',days:'Lecture de l’historique des journées',
  pay:'Lecture des données de paie et bulletins',evidence:'Lecture des constats et événements',
  legal:'Lecture des règles/audits disponibles'
};
const MH_PLUGIN_BUILTIN_VERSION='2.0.0';
const escP=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FMT_MIN=m=>{m=Math.max(0,Math.round(Number(m)||0));return String(Math.floor(m/60)).padStart(2,'0')+'h'+String(m%60).padStart(2,'0')};
function mhPluginSnapshot(){
  const ym=curMonth||today().slice(0,7),m=mhMonthStats(ym),anc=calcAnc(DB.s.emb||DEF.emb);
  return {version:MH_V,month:ym,trav:m.trav,tte:F(m.tte),amp:F(m.amp),nuit:C2(m.nuit)+' h',alerts:m.alerts.length,ancPct:anc.pct,ancYears:anc.y,ancMonths:anc.m};
}
function mhPluginDays(){
  return Object.keys(DB.days||{}).sort().map(k=>{const d=DB.days[k]||{},r=window.mhCalcDay?window.mhCalcDay(k):cd(k)||{};return {date:k,type:d.t||'',start:d.deb||'',end:d.fin||'',pause:d.pause||'',tte:F(r.tte||0),amplitude:F(r.amp||0),alerts:Array.isArray(r.al)?r.al.length:0}});
}
function mhPluginPay(){
  const p=DB.per||{}, q=(()=>{try{return calcPer(p.start||DEF.anchor,p.nb||1)||{}}catch(e){return {}}})();
  const b=(DB.bulletins||[]).map(x=>({mois:String(x.mois||''),brut:Number(x.brut)||0,net:Number(x.net)||0,hs25H:String(x.hs25H||''),hs50H:String(x.hs50H||''),rcH:String(x.rcH||'')}));
  return {quatorzaine:{start:p.start||'',nb:p.nb||1,normal:F(q.nor||0),hs25:F(q.h25||0),hs50:F(q.h50||0),brut:Number((q.brut||0).toFixed?.(2)||0)},bulletins:b};
}
function mhPluginEvidence(){
  return {constats:(DB.constats||[]).slice(-100).map(c=>({id:c.id,date:c.jour_concerne,rule:c.regle_violie,article:c.article_source,amount:Number(c.calcul_montant_du)||0,level:c.niveau,message:c.message})),events:(DB.events||[]).slice(-100).map(e=>({id:e.id,date:e.date,type:e.type,text:e.text}))};
}
function mhPluginLegal(){
  let audit=[];try{audit=window.mhLegalAudit?mhLegalAudit(curMonth||today().slice(0,7),1)||[]:[]}catch(e){}
  return {idcc:'0016',rules:[
    {id:'pause',label:'Pause minimale',value:'20 min après 6 h de travail'},
    {id:'amplitude',label:'Amplitude',value:'12 h de principe ; extensions encadrées'},
    {id:'tte',label:'TTE quotidienne',value:'10 h de principe ; encadrement jusqu’à 12 h'},
    {id:'weekly',label:'Maximum hebdomadaire',value:'48 h'},
    {id:'average46',label:'Moyenne glissante',value:'46 h sur 12 semaines'},
    {id:'rest',label:'Repos quotidien',value:'11 h'}
  ],auditCount:Array.isArray(audit)?audit.length:0};
}
const MH_BUILTIN_PLUGINS=[
 {id:'mes-droits-demo',name:'Mes Droits',version:MH_PLUGIN_BUILTIN_VERSION,author:'MesHeures',builtin:true,description:'Règles et indicateurs utiles, sans accès aux données de saisie.',permissions:['snapshot','legal'],html:`<div class="mhx"><div class="eyebrow">MESHEURES · OFFICIEL</div><h2>⚖️ Mes Droits</h2><div id="out" class="box">Chargement…</div><button onclick="req('snapshot');req('legal')">Actualiser</button></div>`,script:`let s={},l={};function req(a){parent.postMessage({type:'mhx-request',action:a},'*')}window.addEventListener('message',e=>{if(e.data?.type!=='mhx-data')return;if(e.data.action==='snapshot')s=e.data.data;if(e.data.action==='legal')l=e.data.data;document.getElementById('out').innerHTML=s.trav!=null?'<b>'+s.ancPct+'%</b> ancienneté · '+s.trav+' jour(s) · '+s.tte+' TTE ce mois<br><span class="mut">'+(l.rules?.length||0)+' règles de contrôle disponibles</span>':'Chargement…'});req('snapshot');req('legal');`},
 {id:'mesheures-statistiques',name:'Statistiques',version:MH_PLUGIN_BUILTIN_VERSION,author:'MesHeures',builtin:true,description:'Vue synthétique de l’historique : journées, TTE, amplitudes et alertes.',permissions:['snapshot','days'],html:`<div class="mhx"><div class="eyebrow">MESHEURES · OFFICIEL</div><h2>📊 Statistiques</h2><div id="out" class="box">Analyse…</div></div>`,script:`function req(a){parent.postMessage({type:'mhx-request',action:a},'*')}window.addEventListener('message',e=>{if(e.data?.type!=='mhx-data')return;const d=e.data.data||[];const t=d.reduce((s,x)=>s+(parseInt(x.tte)||0),0);const a=d.reduce((s,x)=>s+(x.alerts||0),0);document.getElementById('out').innerHTML='<b>'+d.length+'</b> journée(s) · <b>'+Math.floor(t/60)+'h'+String(t%60).padStart(2,'0')+'</b> TTE · <b>'+a+'</b> alerte(s) analysée(s).'});req('days');`},
 {id:'mesheures-bulletin-plus',name:'Bulletin+',version:MH_PLUGIN_BUILTIN_VERSION,author:'MesHeures',builtin:true,description:'Contrôle rapide des bulletins importés et de la quatorzaine courante.',permissions:['pay'],html:`<div class="mhx"><div class="eyebrow">MESHEURES · OFFICIEL</div><h2>🧾 Bulletin+</h2><div id="out" class="box">Lecture…</div></div>`,script:`parent.postMessage({type:'mhx-request',action:'pay'},'*');window.addEventListener('message',e=>{if(e.data?.type!=='mhx-data')return;const d=e.data.data||{};document.getElementById('out').innerHTML='<b>'+((d.bulletins||[]).length)+'</b> bulletin(s) importé(s)<br>Quatorzaine : '+(d.quatorzaine?.normal||'00h00')+' normal · '+(d.quatorzaine?.hs25||'00h00')+' HS25 · '+(d.quatorzaine?.hs50||'00h00')+' HS50';});`},
 {id:'mesheures-dossier',name:'Dossier Prud’hommes',version:MH_PLUGIN_BUILTIN_VERSION,author:'MesHeures',builtin:true,description:'Index des constats et événements disponibles pour le dossier de preuves.',permissions:['evidence'],html:`<div class="mhx"><div class="eyebrow">MESHEURES · OFFICIEL</div><h2>📁 Dossier Prud’hommes</h2><div id="out" class="box">Lecture…</div></div>`,script:`parent.postMessage({type:'mhx-request',action:'evidence'},'*');window.addEventListener('message',e=>{if(e.data?.type!=='mhx-data')return;const d=e.data.data||{};document.getElementById('out').innerHTML='<b>'+((d.constats||[]).length)+'</b> constat(s)<br><b>'+((d.events||[]).length)+'</b> événement(s)<br><span class="mut">Lecture seule : aucune modification des données.</span>';});`}
];
let MH_PLUGINS=[];
function mhLoadPlugins(){try{const x=JSON.parse(localStorage.getItem(MH_PLUGIN_KEY)||'[]');MH_PLUGINS=Array.isArray(x)?x:[]}catch(e){MH_PLUGINS=[]}}
function mhSavePlugins(){localStorage.setItem(MH_PLUGIN_KEY,JSON.stringify(MH_PLUGINS));}
function mhAllPlugins(){return [...MH_BUILTIN_PLUGINS,...MH_PLUGINS.filter(p=>!MH_BUILTIN_PLUGINS.some(b=>b.id===p.id))]}
function mhPluginFrame(p){
  const src=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';img-src data:;connect-src 'none';font-src 'none';frame-src 'none';object-src 'none';base-uri 'none'"><style>body{font:15px system-ui;background:#0d1117;color:#e6edf3;margin:0;padding:18px}.mhx{max-width:600px;margin:auto}.eyebrow{font-size:10px;letter-spacing:1.5px;color:#7f8b99;font-weight:800}h2{margin:6px 0 8px}.box{background:#161b22;border:1px solid #30363d;border-radius:14px;padding:14px;margin:14px 0}.mut{color:#8b949e;font-size:12px}button{background:#238636;color:#fff;border:0;border-radius:10px;padding:10px 14px;font-weight:700}</style>${p.css||''}</head><body>${p.html||''}<script>${String(p.script||'').replace(/<\\?\/script/gi,'<\\/script')}</script></body></html>`;
  const b64=btoa(unescape(encodeURIComponent(src)));return `<iframe class="mhx-frame" data-plugin-id="${escP(p.id)}" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${escP(p.name)}" src="data:text/html;base64,${b64}"></iframe>`;
}
function mhPluginPerms(p){return (p.permissions||[]).map(x=>`<span title="${escP(MH_PLUGIN_PERMISSION_LABELS[x]||x)}">${escP(MH_PLUGIN_PERMISSION_LABELS[x]||x)}</span>`).join('')||'<span>Aucune donnée</span>'}
function mhRenderPlugins(){const host=$('mhPluginList');if(!host)return;host.innerHTML=mhAllPlugins().map(p=>`<div class="mh-plugin-card"><div class="mh-plugin-top"><div class="mh-plugin-icon">🧩</div><div class="mh-plugin-info"><b>${escP(p.name)}</b><small>v${escP(p.version)} · ${escP(p.author||'Inconnu')}${p.builtin?' · officiel':''}</small></div><label class="mh-plugin-toggle"><input type="checkbox" ${p.enabled===false?'':'checked'} onchange="mhTogglePlugin('${escP(p.id)}',this.checked)"><span></span></label></div><p>${escP(p.description||'Aucune description.')}</p><div class="mh-plugin-perms">${mhPluginPerms(p)}</div>${p.enabled===false?'':'<div class="mh-plugin-body">'+mhPluginFrame(p)+'</div>'}${!p.builtin?`<button class="r" onclick="mhRemovePlugin('${escP(p.id)}')">Désinstaller</button>`:''}</div>`).join('')}
function mhTogglePlugin(id,on){const p=MH_PLUGINS.find(x=>x.id===id);if(p){p.enabled=on;mhSavePlugins();mhRenderPlugins()}}
function mhRemovePlugin(id){if(!confirm('Désinstaller cette extension ?'))return;MH_PLUGINS=MH_PLUGINS.filter(x=>x.id!==id);mhSavePlugins();mhRenderPlugins()}
function mhPluginInfo(){alert('🧩 MesHeures Plugins V30.2.3\n\n• Plugins officiels + extensions .mhplugin\n• Permissions explicites : statistiques, journées, paie, preuves, règles\n• Exécution iframe sandboxée + CSP sans réseau\n• API strictement en lecture seule\n• Un plugin ne peut jamais modifier DB, les heures ou le moteur de paie\n• Extensions importées : 180 Ko maximum')}
function mhPluginExport(){const payload={format:MH_PLUGIN_FORMAT,exportVersion:2,appVersion:MH_V,plugins:MH_PLUGINS.map(({id,name,version,author,description,permissions,html,css,script,enabled})=>({id,name,version,author,description,permissions,html,css,script,enabled}))};if(typeof mhDownloadFile==='function') return mhDownloadFile('mesheures-plugins-backup-v2.json',JSON.stringify(payload,null,2),'application/json'); const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download='mesheures-plugins-backup-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function mhImportPlugin(input){const f=input?.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{if(f.size>MH_PLUGIN_MAX_BYTES)throw new Error('Extension trop volumineuse (180 Ko maximum).');const p=JSON.parse(reader.result),m=p.manifest;if(p.format!==MH_PLUGIN_FORMAT||!m?.id)throw new Error('Format .mhplugin invalide.');if(!/^[a-z0-9._-]{3,60}$/.test(m.id))throw new Error('Identifiant invalide.');if(m.id.startsWith('mesheures-')&&!MH_BUILTIN_PLUGINS.some(x=>x.id===m.id))throw new Error('Préfixe mesheures- réservé aux extensions officielles.');const perms=Array.isArray(m.permissions)?m.permissions:[];const unknown=perms.filter(x=>!MH_PLUGIN_ALLOWED_PERMISSIONS.includes(x));if(unknown.length)throw new Error('Permission non autorisée : '+unknown.join(', '));const clean={id:m.id,name:String(m.name||m.id).slice(0,80),version:String(m.version||'1.0.0').slice(0,20),author:String(m.author||'Inconnu').slice(0,80),description:String(m.description||'').slice(0,240),permissions:perms,html:String(p.html||'').slice(0,50000),css:String(p.css||'').slice(0,30000),script:String(p.script||'').slice(0,50000),enabled:true};const pt=perms.map(x=>MH_PLUGIN_PERMISSION_LABELS[x]||x).join(', ')||'aucune donnée';if(!confirm(`Installer « ${clean.name} » v${clean.version} ?\n\nLecture autorisée : ${pt}.\n\nL’extension sera exécutée en lecture seule dans un cadre isolé.`))return;MH_PLUGINS=MH_PLUGINS.filter(x=>x.id!==clean.id);MH_PLUGINS.push(clean);mhSavePlugins();mhRenderPlugins();alert('✅ Extension installée : '+clean.name)}catch(e){alert('❌ Extension refusée : '+e.message)}finally{input.value=''}};reader.readAsText(f)}
window.addEventListener('message',e=>{if(e.data?.type!=='mhx-request'||!e.source)return;const frame=e.source;const host=[...document.querySelectorAll('.mhx-frame')].find(x=>x.contentWindow===frame);if(!host)return;const id=host.dataset.pluginId,p=MH_PLUGINS.find(x=>x.id===id)||MH_BUILTIN_PLUGINS.find(x=>x.id===id);if(!p||p.enabled===false)return;const action=String(e.data.action||'');if(!MH_PLUGIN_ALLOWED_PERMISSIONS.includes(action)||(p.permissions||[]).includes(action)===false)return;let data=null;if(action==='snapshot')data=mhPluginSnapshot();if(action==='days')data=mhPluginDays();if(action==='pay')data=mhPluginPay();if(action==='evidence')data=mhPluginEvidence();if(action==='legal')data=mhPluginLegal();e.source.postMessage({type:'mhx-data',action,data},'*')});
mhLoadPlugins();window.mhPluginInfo=mhPluginInfo;window.mhPluginExport=mhPluginExport;window.mhRenderPlugins=mhRenderPlugins;
