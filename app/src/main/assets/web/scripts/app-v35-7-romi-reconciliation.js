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
  /* V37.0.0 : une seule règle pour la même comparaison ROMI1 ↔ MesHeures.
     - TTE et HS période (minutes) : ±15 min, tolérance du rapprochement V37 (MHRomiRecon.TOLERANCE, Smart Control, Compteur).
     - Jours de présence (jours) : comparaison différente (un compte de jours, pas une durée) ; règle historique conservée,
       écart toléré ≤ 1 jour, inchangée.
     - ROMI1 ↔ bulletin (HS payées, en heures décimales) : comparaison entre deux documents employeur, tolérance 0,05 h conservée. */
  const TOL_JOURS=1;
  const tolMin=()=>(window.MHRomiRecon&&Number.isFinite(window.MHRomiRecon.TOLERANCE))?window.MHRomiRecon.TOLERANCE:15;
  const tolOf=unit=>unit==='j'?TOL_JOURS:tolMin();
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
  const dClass=(m,unit)=>m==null?'':Math.abs(m)<=tolOf(unit)?'ok':unit==='j'?'warn':Math.abs(m)<=30?'warn':'bad';

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
  const isoMonth=s=>/^\d{4}-\d{2}$/.test(String(s||''))?s:'';

  /*
   * Rapprochement ROMI1 ↔ bulletin de paie (V37) :
   * seul ROMI1 connaît la distinction éligible/payée/convertie en RC et le
   * taux de prime d'ancienneté ; seul le bulletin montre ce qui a vraiment
   * été payé en euros. Aucun des deux rapprochements existants (ROMI1 vs
   * calcul MesHeures, calcul MesHeures vs bulletin) ne les mettait face à
   * face — c'est ce que ce bloc ajoute, en lecture seule, sans rien deviner.
   */
  function monthRange(start,end){
    const out=[];
    const a=String(start||'').slice(0,7), b=String(end||'').slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(a)||!/^\d{4}-\d{2}$/.test(b))return out;
    let y=Number(a.slice(0,4)),m=Number(a.slice(5,7));
    const ey=Number(b.slice(0,4)),em=Number(b.slice(5,7));
    for(let guard=0;guard<240;guard++){
      out.push(String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0'));
      if(y===ey&&m===em)break;
      m++;
      if(m>12){m=1;y++;}
      if(y>ey||(y===ey&&m>em))break;
    }
    return out;
  }

  function getBulletins(r){
    try{
      const list=Array.isArray(DB?.bulletins)?DB.bulletins:[];
      if(!list.length)return [];
      const months=monthRange(r.start,r.end);
      return list
        .filter(b=>months.includes(isoMonth(b?.mois)))
        .sort((a,b)=>String(a?.mois||'').localeCompare(String(b?.mois||'')));
    }catch(e){return []}
  }
  const hDelta=(a,b)=>a==null||b==null?null:Math.round((a-b)*100)/100;
  const hClass=(d,tol)=>d==null?'':Math.abs(d)<=tol?'ok':'bad';
  const eur=v=>v==null?'—':Number(v).toFixed(2).replace('.',',')+' €';

  function calcExact(r){
    if(!r)return null;
    const span=daysBetween(r.start,r.end);
    let tte=0,presence=0,amp=0,pauses=0,alerts=0;
    const rows=[];
    for(let k=r.start;k<=r.end;k=addD(k,1)){
      const d=DB?.days?.[k];
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
    /* V37.0-C : les HS n'existent que par quatorzaine de paie. Un relevé qui ne couvre pas des
       quatorzaines entières (début et lendemain de fin sur le calendrier mhQuatorzaine) n'est pas
       comparable en HS : « — » plutôt qu'un chiffre calculé sur un découpage faux. */
    const aligned=mhQuatorzaine.isStart(r.start)&&mhQuatorzaine.isStart(addD(r.end,1));
    if(!aligned)return {span,tte,amp,presence,pauses,alerts,hs:null,hs25:null,hs50:null,rc,rows,qs,aligned:false};
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
    return {span,tte,amp,presence,pauses,alerts,hs,hs25,hs50,rc,rows,qs,aligned:true};
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
    const bulletins=getBulletins(r);
    const singleMonth=String(r.start||'').slice(0,7)===String(r.end||'').slice(0,7);

    const bulletinChecks=singleMonth&&bulletins[0]?[
      ['HS 125 % payées','h',rv(r,'hs125PayeesH'),num(bulletins[0].hs25H)],
      ['HS 150 % payées','h',rv(r,'hs150PayeesH'),num(bulletins[0].hs50H)],
      ['Habillage / Déshabillage','eur',rv(r,'habillageEur'),num(bulletins[0].habillageEur)]
    ].map(([label,unit,romiV,bulV])=>({
      label,unit,romi:romiV,bulletin:bulV,delta:hDelta(romiV,bulV)
    })):[ ];

    const seniorityPct=rv(r,'seniorityPct');
    const seniorityFlags=(seniorityPct!=null&&seniorityPct>0)
      ?bulletins.map(b=>({
        mois:b?.mois||'',
        seniorityPct,
        primeOnBulletin:num(b?.prime),
        missing:num(b?.prime)==null||num(b?.prime)===0
      }))
      :[];

    const hs125ToRc=rv(r,'hs125ToRcH')||0, hs150ToRc=rv(r,'hs150ToRcH')||0;
    const rcConversion=(hs125ToRc>0.01||hs150ToRc>0.01)?{hs125ToRc,hs150ToRc}:null;

    return {status:'ok',r,local,romi,checks,bad:checks.filter(x=>x.delta!=null&&Math.abs(x.delta)>tolOf(x.unit)),
      bulletins,bulletinChecks,singleMonth,seniorityFlags,rcConversion};
  }

  function render(){
    const host=document.getElementById(ID); if(!host)return;
    const b=build();
    if(b.status==='none'){host.innerHTML='<div class="card"><h2>🔎 Rapprochement ROMI1 ↔ MesHeures</h2><div class="al i">Aucun ROMI1 enregistré.</div></div>';return;}
    if(b.status==='error'){host.innerHTML='<div class="card"><h2>🔎 Rapprochement ROMI1 ↔ MesHeures</h2><div class="al w">⚠️ '+esc(b.error)+'</div></div>';return;}
    const ok=b.bad.length===0;
    const row=(x,sourceFmt)=>`<tr><td><b>${esc(x.label)}</b></td><td class="n">${x.local==null?'—':(x.unit==='j'?x.local:hm(x.local))}</td><td class="n">${x.source==null?'—':(x.unit==='j'?x.source:sourceFmt(x.source))}</td><td class="n ${dClass(x.delta,x.unit)}">${x.delta==null?'—':x.unit==='j'?((x.delta>0?'+':'')+x.delta+' j'):dText(x.delta)}</td></tr>`;
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
      ${b.bulletins.length?`<details style="margin-top:10px" open><summary><b>🧾 Rapprochement ROMI1 ↔ bulletins (${b.bulletins.map(x=>esc(x.mois||'')).join(' · ')})</b></summary>
        ${!b.singleMonth?`<div class="al w" style="margin-top:8px"><b>Période ROMI1 multi-mois</b><br><small>La période ${esc(b.r.start)} → ${esc(b.r.end)} chevauche plusieurs bulletins mensuels. Les valeurs ROMI1 couvrent toute la période et ne peuvent pas être soustraites directement à chaque bulletin mensuel complet. Les bulletins sont donc affichés comme références, sans fabriquer d'écart mensuel.</small></div>`:''}
        ${b.singleMonth&&b.bulletinChecks.length?`<div style="overflow:auto;margin-top:8px"><table><thead><tr><th>Poste</th><th class="n">ROMI1</th><th class="n">Bulletin</th><th class="n">Écart</th></tr></thead><tbody>
        ${b.bulletinChecks.map(x=>{const fmt=v=>v==null?'—':hh(v);const cls=hClass(x.delta,0.05);const dStr=x.delta==null?'—':(x.delta>0?'+':'')+x.delta.toFixed(2).replace('.',',')+' h';return `<tr><td>${esc(x.label)}</td><td class="n">${fmt(x.romi)}</td><td class="n">${fmt(x.bulletin)}</td><td class="n ${cls}">${dStr}</td></tr>`}).join('')}
        </tbody></table></div>`:''}
        <div style="overflow:auto;margin-top:8px"><table><thead><tr><th>Mois</th><th class="n">HS 125 %</th><th class="n">HS 150 %</th><th class="n">Habillage</th><th class="n">Prime ancienneté</th></tr></thead><tbody>
        ${b.bulletins.map(bul=>`<tr><td>${esc(bul.mois||'—')}</td><td class="n">${hh(num(bul.hs25H))}</td><td class="n">${hh(num(bul.hs50H))}</td><td class="n">${hh(num(bul.habH))}${num(bul.habillageEur)!=null?' · '+eur(num(bul.habillageEur)):''}</td><td class="n">${eur(num(bul.prime))}</td></tr>`).join('')}
        </tbody></table></div>
        ${b.seniorityFlags.length?b.seniorityFlags.map(f=>`<div class="al ${f.missing?'w':'k'}" style="margin-top:8px"><b>Prime d'ancienneté — ${esc(f.mois)}</b><br><small>Taux enregistré dans ROMI1 : ${f.seniorityPct}%. ${f.missing?'Absente ou nulle sur ce bulletin — à vérifier.':'Montant présent sur le bulletin : '+eur(f.primeOnBulletin)+'.'}</small></div>`).join(''):''}
        ${b.rcConversion?`<div class="al w" style="margin-top:8px"><b>⚠️ Conversion HS → RC à vérifier</b><br><small>${b.rcConversion.hs125ToRc>0?hh(b.rcConversion.hs125ToRc)+' converties à 125 %. ':''}${b.rcConversion.hs150ToRc>0?hh(b.rcConversion.hs150ToRc)+' converties à 150 %. ':''}Ce remplacement du paiement par du repos compensateur n'est régulier que sur demande écrite du salarié (art. 3.2, accord-cadre du 4 mai 2000, CCN IDCC 16). L'app ne sait pas si cette demande existe — à vérifier au cas par cas.</small></div>`:''}
      </details>`:`<div class="al i" style="margin-top:10px">Aucun bulletin importé pour la période ${esc(String(b.r.start||'').slice(0,7))} → ${esc(String(b.r.end||'').slice(0,7))}.</div>`}
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
