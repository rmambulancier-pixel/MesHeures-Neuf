/* MesHeures V35.7 — ROMI1 reconciliation FIX
 * IMPORTANT:
 * - ROMI1 period is the source of truth for the comparison period.
 * - Never uses DB.per (current payroll fortnight) to choose the ROMI period.
 * - ROMI1 values are displayed exactly as imported.
 * - MesHeures values are calculated independently for exactly the ROMI dates.
 * - No ROMI value is written into DB.days, DB.per, DB.bul or calculation caches.
 */
(function(){
  'use strict';
  const ID='mhRomiReconciliation';
  const TOL_MIN=1;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const dateRE=/^\d{4}-\d{2}-\d{2}$/;
  const addD=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
  const daysBetween=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000)+1;
  const hm=m=>{m=Math.round(Number(m)||0);const sign=m<0?'−':'';m=Math.abs(m);return sign+Math.floor(m/60)+'h'+String(m%60).padStart(2,'0')};
  const hh=h=>h==null?'—':Number(h).toFixed(2).replace('.',',')+' h';
  const hToMin=h=>h==null?null:Math.round(Number(h)*60);
  const delta=(a,b)=>a==null||b==null?null:a-b;
  const dText=m=>m==null?'—':(m>0?'+':m<0?'−':'')+hm(Math.abs(m));
  const dClass=m=>m==null?'':Math.abs(m)<=TOL_MIN?'ok':Math.abs(m)<=30?'warn':'bad';

  function records(){
    /*
     * V36 FINAL — même source que Paie / Analyse.
     * ROMI MASTER est l'unique source de vérité.
     * Aucune lecture de DB.romi pour le rapprochement.
     */
    try{
      if(window.MH_ROMI_SOURCE &&
         typeof window.MH_ROMI_SOURCE.list==='function'){
        const a=window.MH_ROMI_SOURCE.list().filter(Boolean);
        if(a.length){
          return a
            .filter(r=>dateRE.test(String(r.periodStart||'')) &&
                       dateRE.test(String(r.periodEnd||'')))
            .map(r=>({
              ...r,
              start:String(r.periodStart),
              end:String(r.periodEnd),
              tteH:r.ttePeriodH,
              hsPeriodeH:r.hsPeriodH,
              joursPresence:r.presenceDays,
              rcAcquis:r.rcAcquiredH,
              rcSolde:r.rcBalanceH,
              hs125EligH:r.hs125EligibleH,
              hs125PayeesH:r.hs125PaidH,
              hs150EligH:r.hs150EligibleH,
              hs150PayeesH:r.hs150PaidH
            }))
            .sort((a,b)=>String(b.end).localeCompare(String(a.end)) ||
                         String(b.start).localeCompare(String(a.start)));
        }
      }

      if(window.MH_ROMI && typeof window.MH_ROMI.list==='function'){
        return (window.MH_ROMI.list()||[])
          .filter(r=>r &&
            dateRE.test(String(r.periodStart||'')) &&
            dateRE.test(String(r.periodEnd||'')))
          .map(r=>({
            ...r,
            start:String(r.periodStart),
            end:String(r.periodEnd),
            tteH:r.ttePeriodH,
            hsPeriodeH:r.hsPeriodH,
            joursPresence:r.presenceDays,
            rcAcquis:r.rcAcquiredH,
            rcSolde:r.rcBalanceH,
            hs125EligH:r.hs125EligibleH,
            hs125PayeesH:r.hs125PaidH,
            hs150EligH:r.hs150EligibleH,
            hs150PayeesH:r.hs150PaidH
          }))
          .sort((a,b)=>String(b.end).localeCompare(String(a.end)) ||
                       String(b.start).localeCompare(String(a.start)));
      }
    }catch(e){}

    return [];
  }

  function getRomi(){return records()[0]||null}
  function rv(r,...keys){for(const k of keys){const n=num(r?.[k]);if(n!=null)return n}return null}

  function calcExact(r){
    if(!r)return null;
    const span=daysBetween(r.start,r.end);
    let tte=0,presence=0,amp=0,pauses=0,alerts=0;
    const rows=[];
    for(let k=r.start;k<=r.end;k=addD(k,1)){
      const d=window.DB?.days?.[k];
      const work=d?.t==='T'||d?.t==='NUIT'||d?.work;
      let x=null;
      try{
        x=window.MH30DataEngine?.day
          ? window.MH30DataEngine.day(k)
          : (typeof mhCalcDay==='function'?mhCalcDay(k):null);
      }catch(_e){x=null}
      const m=num(x?.tte)||0;
      const a=num(x?.amp)||0;
      const p=num(x?.pz)||0;
      if(work&&m>0){
        presence++; tte+=m; amp+=a; pauses+=p;
        alerts+=Array.isArray(x?.al)?x.al.length:0;
        rows.push({k,tte:m,amp:a,pause:p,alerts:Array.isArray(x?.al)?x.al:[]});
      }
    }

    // Canonical pay engine. calcPer(start,1).Q[0] is the confirmed structure.
    // The ROMI period is processed as consecutive 14-day blocks, never using DB.per.
    let hs25=0,hs50=0,hs=0,rc=null,qs=[];
    for(let q=r.start;q<=r.end;q=addD(q,14)){
      if(typeof calcPer!=='function')break;
      try{
        const p=calcPer(q,1);
        const one=p?.Q?.[0];
        if(one){
          const a=num(one.h25)||0, b=num(one.h50)||0;
          hs25+=a; hs50+=b; hs+=a+b;
          qs.push({start:q,seuil:num(one.seuil)||0,h25:a,h50:b});
        }
      }catch(_){}
    }
    return {span,tte,amp,presence,pauses,alerts,hs,hs25,hs50,rc,rows,qs};
  }

  function build(){
    const r=getRomi(); if(!r)return {status:'none'};
    const local=calcExact(r); if(!local)return {status:'error',r,error:'Calcul local indisponible'};
    const romi={
      tteH:rv(r,'tteH'), hsH:rv(r,'hsPeriodeH'), presence:rv(r,'joursPresence'),
      rcAcqH:rv(r,'rcAcquis'), rcCumH:rv(r,'rcSolde','rcCumulH'),
      hs125EligH:rv(r,'hs125EligH'),hs125PayH:rv(r,'hs125PayeesH'),
      hs150EligH:rv(r,'hs150EligH'),hs150PayH:rv(r,'hs150PayeesH')
    };
    const checks=[
      ['TTE','h',local.tte,hToMin(romi.tteH)],
      ['HS période','h',local.hs,hToMin(romi.hsH)],
      ['Jours de présence','j',local.presence,romi.presence]
    ].map(([label,unit,l,s])=>({label,unit,local:l,source:s,delta:delta(l,s)}));
    return {status:'ok',r,local,romi,checks,bad:checks.filter(x=>x.delta!=null&&Math.abs(x.delta)>TOL_MIN)};
  }

  function render(){
    const host=document.getElementById(ID); if(!host)return;
    const b=build();
    if(b.status==='none'){host.innerHTML='<div class="card"><h2>🔎 Rapprochement ROMI1 ↔ MesHeures</h2><div class="al i">Aucun ROMI1 enregistré.</div></div>';return;}
    if(b.status==='error'){host.innerHTML='<div class="card"><h2>🔎 Rapprochement ROMI1 ↔ MesHeures</h2><div class="al w">⚠️ '+esc(b.error)+'</div></div>';return;}
    const ok=b.bad.length===0;
    const row=(x,sourceFmt)=>`<tr><td><b>${esc(x.label)}</b></td><td class="n">${x.unit==='j'?x.local:hm(x.local)}</td><td class="n">${x.source==null?'—':(x.unit==='j'?x.source:sourceFmt(x.source))}</td><td class="n ${dClass(x.delta)}">${x.delta==null?'—':x.unit==='j'?((x.delta>0?'+':'')+x.delta+' j'):dText(x.delta)}</td></tr>`;
    const dayRows=b.local.rows.map(x=>`<tr><td>${x.k}</td><td class="n">${hm(x.tte)}</td><td class="n">${hm(x.amp)}</td><td>${x.alerts.length?'⚠️ '+x.alerts.length:'✓'}</td></tr>`).join('');
    host.innerHTML=`<div class="card mh-romi35-card">
      <h2>🔎 Rapprochement ROMI1 ↔ MesHeures</h2>
      <div class="al ${ok?'k':'w'}"><b>${ok?'Contrôle terminé':'Écarts à vérifier'}</b><br><small>Période ROMI1 utilisée : ${esc(b.r.start)} → ${esc(b.r.end)} · ${b.local.span} jours. La quatorzaine Paie sélectionnée n'intervient pas.</small></div>
      <div class="kpis"><div class="kpi"><b>${hh(b.romi.tteH)}</b><span>TTE ROMI1</span></div><div class="kpi"><b>${hh(b.romi.hsH)}</b><span>HS ROMI1</span></div><div class="kpi"><b>${b.romi.presence??'—'}</b><span>Jours ROMI1</span></div><div class="kpi"><b>${hh(b.romi.rcCumH)}</b><span>RC cumulé ROMI1</span></div></div>
      <div style="overflow:auto;margin-top:10px"><table><thead><tr><th>Indicateur</th><th class="n">MesHeures</th><th class="n">ROMI1</th><th class="n">Écart</th></tr></thead><tbody>
      ${row(b.checks[0],x=>hh(x/1))}${row(b.checks[1],x=>hh(x/1))}${row(b.checks[2],x=>String(x))}
      </tbody></table></div>
      <div style="margin-top:10px"><div class="al i">ROMI1 : TTE <b>${hh(b.romi.tteH)}</b> · HS <b>${hh(b.romi.hsH)}</b> · RC acquis employeur <b>${hh(b.romi.rcAcqH)}</b> · RC cumulé employeur <b>${hh(b.romi.rcCumH)}</b>.</div></div>
      <details style="margin-top:10px"><summary><b>HS ROMI1 — détail employeur</b></summary><p class="mut">125 % : ${hh(b.romi.hs125EligH)} éligibles · ${hh(b.romi.hs125PayH)} payées. 150 % : ${hh(b.romi.hs150EligH)} éligibles · ${hh(b.romi.hs150PayH)} payées.</p></details>
      <details style="margin-top:10px"><summary><b>📅 Journées MesHeures de la même période</b></summary><div style="overflow:auto;margin-top:8px"><table><thead><tr><th>Date</th><th class="n">TTE</th><th class="n">Amplitude</th><th>Alertes</th></tr></thead><tbody>${dayRows||'<tr><td colspan="4">Aucune journée travaillée.</td></tr>'}</tbody></table></div></details>
      <details style="margin-top:10px"><summary><b>ℹ️ Règle</b></summary><p class="mut">Ce bloc est un rapprochement en lecture seule. ROMI1 ne modifie jamais les journées ni les calculs MesHeures. Le RC cumulé ROMI1 est affiché comme référence employeur et n'est pas remplacé par un calcul local.</p></details>
    </div>`;
  }

  function ensureHost(){
    /*
 * V36 FINAL — le rapprochement ne doit PAS être enfant de #s-romi.
 * romi-master.js reconstruit #s-romi avec innerHTML lors de
 * l'enregistrement du ROMI1, ce qui supprimerait le rapprochement.
 * On utilise donc une zone stable hors de #s-romi.
 */
const section=document.getElementById('s-paie')||document.getElementById('s-analyse')||document.body;
    let host=document.getElementById(ID);
    if(!host){host=document.createElement('section');host.id=ID;section.appendChild(host);}
    render();
  }
  function patch(name){
    const f=window[name]; if(typeof f!=='function'||f.__mh35r)return;
    const w=function(){const r=f.apply(this,arguments);setTimeout(ensureHost,0);return r};w.__mh35r=true;window[name]=w;
  }
  /* MH ROMI1 SAVED EVENT — RECONCILIATION */
document.addEventListener('mh:romi1-saved',()=>{
  try{
    ensureHost();
    render();
  }catch(e){}
});

function boot(){patch('renderRomiTab');patch('afficherRomi');ensureHost();}
  let timer=0;const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!document.getElementById(ID))ensureHost()},180)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  try{obs.observe(document.documentElement,{childList:true,subtree:true})}catch(_){ }
  window.mhRomiReconciliation={build,render};
})();
