/* MesHeures V30.2.3 — Lot 4 : rapprochement paie / temps / preuves */
(function(){
  'use strict';
  const VERSION='30.0.2';
  const esc0=window.esc||((s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const euro=n=>Number(n||0).toFixed(2).replace('.',',')+' €';
  const fmt=m=>{m=Math.round(Number(m||0));return Math.floor(m/60)+'h'+String(Math.abs(m%60)).padStart(2,'0')};
  const isoMonth=s=>/^\d{4}-\d{2}$/.test(String(s||''))?s:'';
  function init(){
    if(!window.DB)return false;
    DB.bulletins=Array.isArray(DB.bulletins)?DB.bulletins:[];
    DB.reconciliation=Array.isArray(DB.reconciliation)?DB.reconciliation:[];
    return true;
  }
  function monthRange(month){
    const [y,m]=month.split('-').map(Number);
    const start=month+'-01';
    const last=new Date(y,m,0).getDate();
    return {start,end:month+'-'+String(last).padStart(2,'0')};
  }
  function calcMonth(month){
    const r=monthRange(month), days=Object.entries(DB.days||{}).filter(([k,d])=>d&&k>=r.start&&k<=r.end);
    let tte=0,normal=0,h25=0,h50=0,worked=0,anomalies=0;
    days.forEach(([k])=>{
      const m=window.mhCalcDay?window.mhCalcDay(k):cd(k);
      if(Number(m.tte||0)>0)worked++;
      tte+=Number(m.tte||0);
      anomalies+=Array.isArray(m.al)?m.al.length:0;
    });
    // Rejoue les quatorzaines qui touchent le mois et attribue les heures selon les journées présentes.
    const byDay={};
    let q=DB.s?.emb||r.start, guard=0;
    while(q<=r.end&&guard++<1000){
      const qEnd=addD(q,13); const relevant=[];
      for(let i=0;i<14;i++){const k=addD(q,i);if(k>=r.start&&k<=r.end&&DB.days?.[k])relevant.push(k)}
      if(relevant.length){
        const G=calcPer(q,1).G||{};
        const allDays=[];for(let i=0;i<14;i++){const k=addD(q,i);if(DB.days?.[k])allDays.push(k)}
        const allTte=allDays.reduce((s,k)=>s+Number((window.mhCalcDay?window.mhCalcDay(k):cd(k)).tte||0),0);
        const relevantTte=relevant.reduce((s,k)=>s+Number((window.mhCalcDay?window.mhCalcDay(k):cd(k)).tte||0),0);
        const ratio=allTte>0?relevantTte/allTte:relevant.length/Math.max(allDays.length,1);
        normal+=Number(G.nor||0)*ratio;h25+=Number(G.h25||0)*ratio;h50+=Number(G.h50||0)*ratio;
      }
      q=addD(q,14);
    }
    const b=DB.bulletins.find(x=>isoMonth(x.mois)===month)||null;
    const paidH25=Number(b?.hs25H)||0,paidH50=Number(b?.hs50H)||0,paidNorm=Number(b?.hNorm)||0;
    const paidMin=(paidNorm+paidH25+paidH50)*60;
    const calcMin=normal+h25+h50;
    const calcGross=brutOf({nor:Math.round(normal),h25:Math.round(h25),h50:Math.round(h50),amp:0,tte:Math.round(calcMin),seuil:Math.round(calcMin),trav:0,idaj:0,ir:0,iru:0,rc:0,fer:0,dim:0,nuit:0,hab:0,ferJ:[],dimJ:[]}).tot||0;
    const paidGross=Number(b?.brut)||0;
    return {month,worked,tte,normal,h25,h50,calcMin,paidMin,deltaMin:calcMin-paidMin,calcGross,paidGross,deltaGross:calcGross-paidGross,anomalies,bulletin:b};
  }
  function addD(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
  function months(){
    const keys=new Set();Object.keys(DB.days||{}).forEach(k=>{if(/^\d{4}-\d{2}/.test(k))keys.add(k.slice(0,7))});(DB.bulletins||[]).forEach(b=>{if(isoMonth(b.mois))keys.add(b.mois)});
    return [...keys].sort();
  }
  function severity(x){
    if(!x.bulletin)return x.tte>0?'info':'none';
    if(Math.abs(x.deltaGross)>=25||Math.abs(x.deltaMin)>=120)return 'critical';
    if(Math.abs(x.deltaGross)>=5||Math.abs(x.deltaMin)>=30)return 'check';
    return 'ok';
  }
  function label(s){return s==='critical'?'🔴 Écart important':s==='check'?'🟠 À vérifier':s==='ok'?'🟢 Cohérent':'⚪ Pas de bulletin'}
  function makeConstat(x){
    if(!DB.constats)DB.constats=[];
    const id='R30-'+x.month+'-'+Math.abs(Math.round(x.deltaMin));
    if(DB.constats.some(c=>c.id===id))return false;
    DB.constats.push({id,date_constat:new Date().toISOString(),jour_concerne:x.month+'-01',regle_violie:'Rapprochement paie / temps : écart détecté',article_source:'MesHeures — contrôle interne de rapprochement',source_url:'',calcul_brut:Math.round(x.deltaMin),calcul_montant_du:Number(x.deltaGross.toFixed(2)),calcul_base:Math.round(x.calcMin),niveau:severity(x)==='critical'?'critique':'a_verifier',message:`Mois ${x.month} : ${fmt(x.deltaMin)} d’écart calculé/payé, ${euro(x.deltaGross)} sur le brut.`});
    if(window.save)save(); return true;
  }
  function exportCsv(rows){
    const head=['Mois','Jours travaillés','TTE','Calcul heures','Heures payées','Écart heures','Brut calculé','Brut bulletin','Écart brut','Statut'];
    const lines=[head,...rows.map(x=>[x.month,x.worked,fmt(x.tte),fmt(x.calcMin),fmt(x.paidMin),fmt(x.deltaMin),x.calcGross.toFixed(2),x.paidGross.toFixed(2),x.deltaGross.toFixed(2),label(severity(x))])];
    const csv='\ufeff'+lines.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');
    if(typeof mhDownloadFile==='function') return mhDownloadFile('MesHeures-rapprochement-paie-'+today()+'.csv',csv,'text/csv;charset=utf-8'); const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='MesHeures-rapprochement-paie-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function today(){return new Date().toISOString().slice(0,10)}
  function render(){
    if(!init()||document.getElementById('mhV30Reconciliation'))return;
    const host=document.createElement('section');host.id='mhV30Reconciliation';
    const target=document.getElementById('s-audit')||document.body;target.appendChild(host);draw();
  }
  function draw(){
    const host=document.getElementById('mhV30Reconciliation');if(!host)return;
    const rows=months().map(calcMonth);const flagged=rows.filter(x=>severity(x)==='critical'||severity(x)==='check');
    host.innerHTML=`<div class="card mh-v30-card"><h2>💶 Rapprochement paie V30.2.3</h2><p class="mut">Compare automatiquement les temps enregistrés aux heures et au brut déclarés sur les bulletins importés. Un écart est un signal de contrôle, pas une preuve définitive d'une créance.</p><div class="mh-v30-kpis"><div><b>${rows.length}</b><span>mois analysés</span></div><div><b>${flagged.length}</b><span>écart(s) à vérifier</span></div><div><b>${euro(flagged.reduce((s,x)=>s+x.deltaGross,0))}</b><span>écart brut cumulé</span></div></div><div class="row"><button class="g" onclick="mhV30ReconciliationCSV()">⬇️ Export CSV</button><button class="g" onclick="mhV30ReconciliationRefresh()">🔄 Actualiser</button></div><div class="mh-v30-table">${rows.length?rows.map(x=>{const st=severity(x);return `<div class="mh-v30-row"><b>${esc0(x.month)}</b><span>${fmt(x.tte)} enregistrées</span><span>Calc. ${fmt(x.calcMin)}</span><span>Payé ${fmt(x.paidMin)}</span><strong class="${st==='critical'||st==='check'?'bad':'ok'}">${label(st)}</strong><span>${x.bulletin?`Δ ${fmt(x.deltaMin)} · ${euro(x.deltaGross)}`:'—'}</span>${x.bulletin&&(st==='critical'||st==='check')?`<button class="g" onclick="mhV30CreateReconciliationConstat('${x.month}')">＋ Constat</button>`:''}</div>`}).join(''):'<div class="mut">Aucun mois exploitable. Importez des bulletins ou saisissez des journées.</div>'}</div><details><summary>ℹ️ Méthode de contrôle</summary><p class="mut">Les heures calculées proviennent du moteur MesHeures et des quatorzaines. Les heures payées et le brut proviennent des champs du bulletin importé. Les primes, absences, régularisations, retenues et conventions particulières peuvent expliquer un écart de brut.</p></details></div>`;
  }
  window.mhV30ReconciliationCSV=()=>{init();exportCsv(months().map(calcMonth))};
  window.mhV30ReconciliationRefresh=()=>draw();
  window.mhV30CreateReconciliationConstat=(m)=>{const x=calcMonth(m);if(makeConstat(x)){alert('✅ Constat de rapprochement ajouté pour '+m+'.');if(window.mhV30RenderEvidence)window.mhV30RenderEvidence();draw()}else alert('ℹ️ Ce constat existe déjà.')};
  const old=window.renderAll;if(old&&!window.__mhV30ReconciliationPatch){window.__mhV30ReconciliationPatch=true;window.renderAll=function(){old();render()}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else setTimeout(render,0);
})();
