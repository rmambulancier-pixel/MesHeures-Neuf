/* MesHeures V30.2.3 — Lot 3 : dossier complet, empreinte d'intégrité et export probatoire */
(function(){
  'use strict';
  const VERSION='30.0.2';
  const esc0=window.esc||((s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const euro=window.EUR||((n)=>Number(n||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'}));
  const fmt=window.F||((n)=>{const m=Number(n||0);return Math.floor(m/60)+'h'+String(Math.round(m%60)).padStart(2,'0')});
  function safeClone(){try{return JSON.parse(JSON.stringify(DB))}catch{return {}}}
  function digestText(text){
    if(window.crypto?.subtle){
      return crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)).then(buf=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''));
    }
    let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return Promise.resolve(('00000000'+(h>>>0).toString(16)).slice(-8));
  }
  function months(){return window.mhV30IntelligenceData?null:null}
  function snapshot(){
    const data=safeClone();
    const days=Object.entries(data.days||{}).filter(([,d])=>d&&typeof d==='object').map(([k,d])=>{
      const r=window.mhCalcDay?window.mhCalcDay(k):{};
      return {...d,k,computed:{amp:Number(r.amp)||0,tte:Number(r.tte)||0,pauseMinutes:Number(r.pz)||0,worked:Number(r.trav)||0,alerts:Array.isArray(r.al)?r.al.map(a=>({...a})):[]}};
    }).sort((a,b)=>String(a.k).localeCompare(String(b.k)));
    const bulletins=Array.isArray(data.bulletins)?data.bulletins:[];
    const constats=Array.isArray(data.constats)?data.constats:[];
    const events=Array.isArray(data.events)?data.events:[];
    const intel=window.mhV30IntelligenceData?.()||{};
    /* V37.0-C : l'audit couvre toutes les quatorzaines de paie depuis la première journée saisie.
       Avant : mhLegalAudit(date d'embauche, 1), soit les 14 jours suivant le 09/09/2019 : audit vide. */
    const firstKey=Object.keys(data.days||{}).sort()[0];
    const auditStart=firstKey?mhQuatorzaine.start(firstKey):mhQuatorzaine.start(today());
    const auditNb=Math.max(1,mhQuatorzaine.between(auditStart,today()).length);
    const audit=window.mhLegalAudit?(window.mhLegalAudit(auditStart,auditNb)||[]):[];
    const worked=days.filter(d=>Number(d.computed?.tte||0)>0);
    const totalTte=worked.reduce((s,d)=>s+Number(d.computed?.tte||0),0);
    const anomalies=worked.reduce((s,d)=>s+(Array.isArray(d.computed?.alerts)?d.computed.alerts.length:0),0);
    return {
      meta:{application:'MesHeures',version:VERSION,generatedAt:new Date().toISOString(),periodStart:auditStart,periodEnd:today()},
      identity:{nom:data.s?.nom||'',emb:data.s?.emb||'',taux:Number(data.s?.taux||0),base:Number(data.s?.base||0)},
      summary:{days:days.length,workedDays:worked.length,totalTteMinutes:totalTte,anomalies,constats:constats.length,events:events.length,bulletins:bulletins.length},
      days,bulletins,constats,events,intelligence:intel,auditCurrent:audit,settings:data.s||{},
      source:'Données locales MesHeures — export généré par l’utilisateur.'
    };
  }
  function compact(s){return JSON.stringify(s)}
  function download(name,text,type){if(typeof mhDownloadFile==='function')return mhDownloadFile(name,text,type);const blob=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function rowsDays(days){return days.map(d=>`<tr><td>${esc0(d.k||'')}</td><td>${fmt(d.computed?.tte||0)}</td><td>${fmt(d.computed?.amp||0)}</td><td>${fmt(d.computed?.pauseMinutes||0)}</td><td>${Array.isArray(d.computed?.alerts)&&d.computed.alerts.length?esc0(d.computed.alerts.map(a=>a.m||'').join(' · ')):'—'}</td></tr>`).join('')}
  function rowsConstats(cs){return cs.map(c=>`<tr><td>${esc0(c.id)}</td><td>${esc0(c.jour_concerne)}</td><td>${esc0(c.regle_violie)}</td><td>${esc0(c.article_source)}</td><td>${euro(c.calcul_montant_du||0)}</td></tr>`).join('')}
  function reportHtml(s,hash,title,recipient){
    const p=s.meta.periodStart&&s.meta.periodEnd?`${esc0(s.meta.periodStart)} → ${esc0(s.meta.periodEnd)}`:'Historique disponible';
    const patterns=s.intelligence?.patterns||[]; const proj=s.intelligence?.projection||{};
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc0(title||'MesHeures — Dossier complet')}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#111;line-height:1.35}h1{font-size:24px;margin:0 0 6px}h2{font-size:17px;margin-top:26px;border-bottom:1px solid #bbb;padding-bottom:5px}small,.mut{color:#666}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.k{border:1px solid #bbb;padding:10px}.k b{display:block;font-size:18px}.box{border:1px solid #bbb;padding:12px;margin:10px 0;break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccc;padding:5px;text-align:left;vertical-align:top}th{background:#eee}.hash{font-family:monospace;word-break:break-all;font-size:10px}.page{break-before:page}footer{margin-top:28px;font-size:10px;color:#666}@media print{.no-print{display:none}}
    </style></head><body>
    <h1>MesHeures — Dossier complet</h1><div><b>Version ${VERSION}</b> · Généré le ${esc0(new Date().toLocaleString('fr-FR'))}</div>
    <p>Période couverte : <b>${p}</b>${recipient?`<br>Destinataire / objet : <b>${esc0(recipient)}</b>`:''}</p>
    <div class="grid"><div class="k"><b>${s.summary.workedDays}</b>Journées travaillées</div><div class="k"><b>${fmt(s.summary.totalTteMinutes)}</b>TTE cumulé</div><div class="k"><b>${s.summary.constats}</b>Constats</div><div class="k"><b>${s.summary.bulletins}</b>Bulletins importés</div></div>
    <h2>1. Synthèse</h2><div class="box"><b>Salarié :</b> ${esc0(s.identity.nom||'Non renseigné')}<br><b>Date d'embauche :</b> ${esc0(s.identity.emb||'Non renseignée')}<br><b>Taux horaire configuré :</b> ${euro(s.identity.taux)}/h<br><b>Base configurée :</b> ${s.identity.base} h/semaine</div>
    <h2>2. Constats et éléments chiffrés</h2>${s.constats.length?`<table><thead><tr><th>ID</th><th>Jour</th><th>Constat</th><th>Source</th><th>Estimation</th></tr></thead><tbody>${rowsConstats(s.constats)}</tbody></table>`:'<div class="mut">Aucun constat persistant enregistré.</div>'}
    <h2>3. Historique des journées</h2>${s.days.length?`<table><thead><tr><th>Date</th><th>TTE</th><th>Amplitude</th><th>Pauses</th><th>Alertes</th></tr></thead><tbody>${rowsDays(s.days)}</tbody></table>`:'<div class="mut">Aucune journée enregistrée.</div>'}
    <h2>4. Intelligence locale</h2><div class="box"><b>Projection 12 semaines :</b> ${esc0(proj.message||'Aucune projection disponible')}<br><b>Patterns détectés :</b> ${patterns.length}</div>${patterns.length?`<table><thead><tr><th>Type</th><th>Détail</th><th>Niveau</th></tr></thead><tbody>${patterns.map(x=>`<tr><td>${esc0(x.type||'')}</td><td>${esc0(x.message||x.text||'')}</td><td>${esc0(x.level||'information')}</td></tr>`).join('')}</tbody></table>`:''}
    <h2>5. Événements et pièces</h2>${s.events.length?`<table><thead><tr><th>Date</th><th>Type</th><th>Description</th></tr></thead><tbody>${s.events.map(e=>`<tr><td>${esc0(e.date)}</td><td>${esc0(e.type)}</td><td>${esc0(e.text)}</td></tr>`).join('')}</tbody></table>`:'<div class="mut">Aucun événement manuel.</div>'}
    <h2>6. Bulletins importés</h2>${s.bulletins.length?`<table><thead><tr><th>Mois</th><th>Brut</th><th>HS 25%</th><th>HS 50%</th></tr></thead><tbody>${s.bulletins.map(b=>`<tr><td>${esc0(b.mois||'')}</td><td>${esc0(b.brut||'')}</td><td>${esc0(b.hs25H||'')}</td><td>${esc0(b.hs50H||'')}</td></tr>`).join('')}</tbody></table>`:'<div class="mut">Aucun bulletin importé.</div>'}
    <h2>7. Empreinte d'intégrité</h2><div class="box hash">SHA-256 du dossier JSON : ${esc0(hash)}</div>
    <footer>Ce document est un export des données locales de MesHeures. Les estimations et contrôles doivent être confrontés aux documents originaux, au contrat, au planning et aux règles applicables à la situation concernée.</footer>
    </body></html>`;
  }
  /* V37.0-D : JSON et imprimable reprennent le même dossier que le PDF signé (MHDossier : lecture seule, moteur existant).
     L'ancien snapshot() reste disponible en repli si le module n'est pas chargé. */
  function dossierData(){return window.MHDossier?window.MHDossier.data():snapshot()}
  /* V37.4.1 : fenêtres intégrées (MHDialogue). Objet demandé pour l'imprimable seulement (le JSON ne l'utilise pas) ;
     « Annuler » abandonne l'export ; un objet vide garde le comportement d'avant (aucune ligne « Objet »). Un deuxième
     appui pendant l'export est ignoré. */
  const DLG=()=>window.MHDialogue;
  async function demanderObjet(){
    const D=DLG();
    if(!D)return prompt('Objet / destinataire du dossier (facultatif) :','');
    return D.saisir({titre:'Dossier imprimable',message:'Objet ou destinataire du dossier (facultatif). Laisse vide pour ne rien indiquer.',
      libelle:'Objet ou destinataire',placeholder:'Ex. : Inspection du travail',facultatif:true,inputmode:'text',autocapitalize:'sentences',enterkeyhint:'done',action:'Continuer'});
  }
  const informer=(titre,message,details)=>{const D=DLG();if(D)return D.info({titre,message,details});alert([message,details].filter(Boolean).join('\n'))};
  async function makeDossier(print){
    const run=async()=>{
    let recipient='';
    if(print){const r=await demanderObjet();if(r==null)return null;recipient=String(r).trim()}
    const d=dossierData(); const canonical=compact(d); const hash=await digestText(canonical);
    if(print){
      const html=window.MHDossier?window.MHDossier.html(d,{dataHash:hash,objet:recipient}):reportHtml(d,hash,'MesHeures — Dossier complet',recipient);
      try{
        if(window.MesHeuresAndroid && typeof window.MesHeuresAndroid.printHtml==='function'){
          window.MesHeuresAndroid.printHtml(html);
          return 'android';
        }
      }catch(e){console.warn('Impression dossier Android',e)}
      const w=window.open('','_blank');if(!w){informer('Dossier imprimable','Autorise les fenêtres contextuelles pour générer le dossier.');return null}w.document.write(html);w.document.close();setTimeout(()=>w.print(),500);return 'browser'
    }
    const out={...d,integrity:{algorithm:'SHA-256',hash,canonicalization:'JSON.stringify(dossier sans ce bloc integrity)'}};
    const mode=download('MesHeures-dossier-complet-'+today()+'.json',JSON.stringify(out,null,2),'application/json');
    informer('Dossier JSON',mode==='android'?'📁 Choisis où enregistrer le dossier JSON.':'✅ Dossier JSON exporté.','Empreinte SHA-256 : '+hash);return mode;
    };
    const D=DLG();return D?D.exclusif('dossier-'+(print?'imprimable':'json'),run):run();
  }
  function render(){
    const target=document.getElementById('s-audit')||document.body;if(document.getElementById('mhV30Dossier'))return;
    const sec=document.createElement('section');sec.id='mhV30Dossier';sec.innerHTML=`<div class="card mh-v30-card"><h2>📁 Dossier complet</h2><p class="mut">Périodes de paie, journées, Smart Control, anomalies, ROMI1, bulletins, rapprochement, constats, chronologie et plannings prévisionnels (référence, pas une preuve) : mêmes valeurs que l’application, aucun recalcul.</p><div class="row"><button onclick="mhV30ExportDossier()">⬇️ Export dossier JSON</button><button class="g" onclick="mhV30PrintDossier()">🖨️ Dossier imprimable / PDF</button><button class="g" onclick="mhV30ExportSignedPDF()">🔏 PDF probatoire signé</button></div><div id="mhV30DossierHash" class="mut" style="margin-top:8px"></div></div>`;target.appendChild(sec);if('IntersectionObserver' in window)new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))refreshHash()}).observe(sec);else refreshHash();
  }
  async function refreshHash(){try{const sec=document.getElementById('mhV30Dossier');if(!sec||!sec.offsetParent)return;const h=await digestText(compact(dossierData()));const el=document.getElementById('mhV30DossierHash');if(el)el.textContent='Empreinte actuelle SHA-256 : '+h}catch(e){}}
  window.mhV30ExportDossier=()=>makeDossier(false);
  window.mhV30PrintDossier=()=>makeDossier(true);
  window.mhV30DossierSnapshot=dossierData;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else setTimeout(render,0);
  setInterval(refreshHash,30000); /* V37.0-D : sans effet tant que l'onglet Audit n'est pas affiché */
})();
