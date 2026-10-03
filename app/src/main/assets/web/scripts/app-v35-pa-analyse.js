/* MesHeures V35.2 — ROMI MASTER -> Paie / Analyse
 * Le PDF reste la propriété du MASTER.
 * Ce module ne relit pas le PDF et ne modifie aucune formule historique.
 * Il expose le relevé MASTER comme source de vérité aux surfaces Paie/Analyse.
 */
(function(root){
'use strict';
const VERSION='35.2.0';

function list(){
  try{
    return root.MH_ROMI && typeof root.MH_ROMI.list==='function'
      ? root.MH_ROMI.list().filter(Boolean) : [];
  }catch(e){ return []; }
}
function latest(){
  return list().sort((a,b)=>String(b.periodEnd||'').localeCompare(String(a.periodEnd||'')))[0]||null;
}
function monthRange(month){
  if(!/^\d{4}-\d{2}$/.test(String(month||''))) return null;
  const [y,m]=month.split('-').map(Number);
  const last=new Date(y,m,0).getDate();
  return {start:`${month}-01`,end:`${month}-${String(last).padStart(2,'0')}`};
}
function overlaps(r,start,end){
  return !!r && String(r.periodStart||'')<=String(end||'') &&
                 String(r.periodEnd||'')>=String(start||'');
}
function forMonth(month){
  const x=monthRange(month); if(!x) return null;
  const a=list().filter(r=>overlaps(r,x.start,x.end))
    .sort((p,q)=>String(q.periodEnd||'').localeCompare(String(p.periodEnd||'')));
  return a[0]||null;
}
function sourceLabel(r){
  if(!r)return 'Aucun ROMI1 MASTER pour cette période.';
  return `ROMI1 MASTER · ${r.periodStart||'—'} → ${r.periodEnd||'—'}`;
}
function num(v){return typeof v==='number'&&Number.isFinite(v)?v:null}
function h(v){return num(v)==null?'—':num(v).toFixed(2).replace('.',',')+' h'}
function d(v){return num(v)==null?'—':String(v)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function snapshot(r){
  if(!r)return null;
  return {
    periodStart:r.periodStart||null, periodEnd:r.periodEnd||null,
    ttePeriodH:num(r.ttePeriodH), presenceDays:num(r.presenceDays),
    hsPeriodH:num(r.hsPeriodH), tteYearH:num(r.tteYearH),
    hsYearH:num(r.hsYearH), presenceYearDays:num(r.presenceYearDays),
    cpN1PreviousBalance:num(r.cpN1PreviousBalance),
    cpN1Acquired:num(r.cpN1Acquired), cpN1Taken:num(r.cpN1Taken),
    cpN1Balance:num(r.cpN1Balance),
    cpNPreviousBalance:num(r.cpNPreviousBalance),
    cpNAcquired:num(r.cpNAcquired), cpNTaken:num(r.cpNTaken),
    cpNBalance:num(r.cpNBalance),
    rcPreviousH:num(r.rcPreviousH), rcAcquiredH:num(r.rcAcquiredH),
    rcTakenH:num(r.rcTakenH), rcBalanceH:num(r.rcBalanceH),
    salaryBaseH:num(r.salaryBaseH), amplitudeOverH:num(r.amplitudeOverH),
    hs125EligibleH:num(r.hs125EligibleH), hs125PaidH:num(r.hs125PaidH),
    hs125ToRcH:num(r.hs125ToRcH), hs150EligibleH:num(r.hs150EligibleH),
    hs150PaidH:num(r.hs150PaidH), hs150ToRcH:num(r.hs150ToRcH),
    seniorityPct:num(r.seniorityPct), habillageEur:num(r.habillageEur),
    mealCount:num(r.mealCount), uniqueMealCount:num(r.uniqueMealCount),
    source:'ROMI1 MASTER', engine:r.engine||'35.0.0'
  };
}

function compareTte(r, calculatedMinutes){
  const source=num(r?.ttePeriodH);
  const calc=num(calculatedMinutes);
  if(source==null || calc==null) return {status:'unavailable',sourceH:source,calculatedH:calc,deltaH:null};
  const calculatedH=calc/60, deltaH=calculatedH-source;
  return {status:Math.abs(deltaH)<0.01?'ok':'check',sourceH:source,calculatedH,deltaH};
}

function renderHost(id,title,month){
  const host=document.getElementById(id); if(!host)return;
  const r=forMonth(month)||latest();
  const s=snapshot(r);
  let html=`<div class="card mh-v35-romi-source" id="${id}-romi-source">
    <h2>${title} <span class="sub">source ROMI MASTER</span></h2>`;
  if(!s){
    html+=`<div class="al i">ℹ️ Aucun relevé ROMI1 MASTER enregistré.</div></div>`;
    host.appendChild(Object.assign(document.createElement('div'),{innerHTML:html}));
    return;
  }
  html+=`<div class="al k">🟢 ${esc(sourceLabel(r))} · données source conservées telles quelles.</div>
    <div class="kpis" style="margin-top:8px">
      <div class="kpi"><b>${h(s.ttePeriodH)}</b><span>TTE ROMI</span></div>
      <div class="kpi"><b>${h(s.hsPeriodH)}</b><span>HS ROMI</span></div>
      <div class="kpi"><b>${h(s.rcBalanceH)}</b><span>RC cumulé</span></div>
      <div class="kpi"><b>${d(s.presenceDays)}</b><span>Présence</span></div>
    </div>
    <details style="margin-top:9px">
      <summary style="cursor:pointer;font-weight:700">Voir les données ROMI utilisées</summary>
      <div style="overflow:auto;margin-top:8px">
      <table>
        <tr><th>Champ</th><th class="n">ROMI MASTER</th></tr>
        <tr><td>TTE période</td><td class="n">${h(s.ttePeriodH)}</td></tr>
        <tr><td>HS période</td><td class="n">${h(s.hsPeriodH)}</td></tr>
        <tr><td>TTE cumul année</td><td class="n">${h(s.tteYearH)}</td></tr>
        <tr><td>HS cumul année</td><td class="n">${h(s.hsYearH)}</td></tr>
        <tr><td>RC antérieur</td><td class="n">${h(s.rcPreviousH)}</td></tr>
        <tr><td>RC acquis</td><td class="n">${h(s.rcAcquiredH)}</td></tr>
        <tr><td>RC cumulé</td><td class="n">${h(s.rcBalanceH)}</td></tr>
        <tr><td>HS 125 % éligibles</td><td class="n">${h(s.hs125EligibleH)}</td></tr>
        <tr><td>HS 125 % payées</td><td class="n">${h(s.hs125PaidH)}</td></tr>
        <tr><td>HS 125 % → RC</td><td class="n">${h(s.hs125ToRcH)}</td></tr>
        <tr><td>HS 150 % éligibles</td><td class="n">${h(s.hs150EligibleH)}</td></tr>
        <tr><td>HS 150 % payées</td><td class="n">${h(s.hs150PaidH)}</td></tr>
        <tr><td>HS 150 % → RC</td><td class="n">${h(s.hs150ToRcH)}</td></tr>
      </table></div>
    </details></div>`;
  const node=document.createElement('div'); node.innerHTML=html; host.appendChild(node.firstElementChild);
}

function renderPaie(){
  const target=document.getElementById('s-paie'); if(!target)return;
  const old=document.getElementById('mhV35PaieRomSource'); if(old)old.remove();
  const host=document.createElement('div'); host.id='mhV35PaieRomSource';
  target.appendChild(host);
  const month=(root.DB?.per?.start||'').slice(0,7);
  renderHost('mhV35PaieRomSource','💶 Paie · référence ROMI1',month);
}
function renderAnalyse(){
  const target=document.getElementById('s-audit'); if(!target)return;
  const old=document.getElementById('mhV35AnalyseRomSource'); if(old)old.remove();
  const host=document.createElement('div'); host.id='mhV35AnalyseRomSource';
  target.appendChild(host);
  const month=new Date().toISOString().slice(0,7);
  renderHost('mhV35AnalyseRomSource','🔎 Analyse · référence ROMI1',month);
}

root.MH_ROMI_SOURCE={
  version:VERSION,list,latest,forMonth,snapshot,compareTte,
  diagnostics:()=>({version:VERSION,count:list().length,latest:snapshot(latest())})
};

function patch(){
  if(root.__mhV35PaieAnalysePatched)return;
  root.__mhV35PaieAnalysePatched=true;
  const old=root.renderAll;
  if(typeof old==='function'){
    root.renderAll=function(){
      const out=old.apply(this,arguments);
      setTimeout(()=>{renderPaie();renderAnalyse()},0);
      return out;
    };
  }
  setTimeout(()=>{renderPaie();renderAnalyse()},200);

  /* MH ROMI1 SAVED EVENT — PAIE / ANALYSE */
  document.addEventListener('mh:romi1-saved',()=>{
    try{
      renderPaie();
      renderAnalyse();
    }catch(e){}
  });

}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch,{once:true});
else patch();
})(typeof window!=='undefined'?window:globalThis);

