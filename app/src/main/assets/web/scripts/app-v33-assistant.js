(function(){
'use strict';
const V='33.1.0', WORK=new Set(['T','NUIT']);
const C={ampWarn:720,ampMax:900,tteWarn:600,tteMax:720,weekMax:2880,avg3m:2760,restWarn:660,restMin:540,pauseMin:20,mealMin:30};
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const days=()=>DB?.days||{};
const isWork=k=>WORK.has(days()[k]?.t);
const mm=t=>{if(!t||!/^\d{1,2}:\d{2}$/.test(t))return null;const [h,m]=t.split(':').map(Number);return h*60+m};
const dur=(a,b)=>{a=mm(a);b=mm(b);if(a==null||b==null)return null;return b>=a?b-a:b+1440-a};
const Fm=m=>typeof F==='function'?F(Math.round(m||0)):`${Math.floor((m||0)/60)}h${String(Math.abs(Math.round(m||0))%60).padStart(2,'0')}`;
const dateLabel=k=>typeof shortY==='function'?shortY(k):k;
const get=k=>{const d=days()[k]||{t:'REPOS',p:[]};let r={};try{r=typeof cd==='function'?cd(k):{amp:0,tte:0,pz:0,meal:null}}catch(e){};return {k,d,r,work:isWork(k)};};
function pauseList(d){return (d.p||[]).map((p,i)=>({i,d:p.d||'',f:p.f||'',ty:p.ty||'ENT',min:dur(p.d,p.f)})).filter(p=>p.min!=null)}
function mealRequired(d){const a=mm(d.deb),b=mm(d.fin);if(a==null||b==null)return false;const end=b>=a?b:b+1440;return (a<=660&&end>=870)||(a<=1110&&end>=1320)}
function scan(){
 const out=[]; const ks=Object.keys(days()).filter(isWork).sort();
 for(const k of ks){
  const {d,r}=get(k), p=pauseList(d), amp=Number(r.amp)||dur(d.deb,d.fin)||0, tte=Number(r.tte)||0;
  if(!d.deb||!d.fin)out.push({lvl:'bad',code:'MISSING_TIME',k,msg:'Journée de travail incomplète : début ou fin manquant.'});
  if(d.deb&&d.fin&&amp<0)out.push({lvl:'bad',code:'TIME_INVALID',k,msg:'Horaires incohérents.'});
  if(amp>C.ampMax)out.push({lvl:'bad',code:'AMP_GT15',k,msg:`Amplitude ${Fm(amp)} : dépasse 15 h, à documenter immédiatement.`});
  else if(amp>C.ampWarn)out.push({lvl:'warn',code:'AMP_GT12',k,msg:`Amplitude ${Fm(amp)} : dépasse 12 h, motif/contrepartie à vérifier.`});
  if(tte>C.tteMax)out.push({lvl:'bad',code:'TTE_GT12',k,msg:`TTE ${Fm(tte)} : dépasse 12 h, situation à justifier.`});
  else if(tte>C.tteWarn)out.push({lvl:'warn',code:'TTE_GT10',k,msg:`TTE ${Fm(tte)} : dépasse 10 h, vérifier le motif prévu par les règles applicables.`});
  const short=p.filter(x=>x.min<C.pauseMin);
  if(short.length)out.push({lvl:'warn',code:'SHORT_PAUSE',k,msg:`${short.length} pause(s) de moins de 20 min : ne pas les compter automatiquement comme pause légale.`});
  if(tte>=360 && (Number(r.pz)||0)<C.pauseMin)out.push({lvl:'warn',code:'NO_PAUSE20',k,msg:'Au moins 6 h de TTE et aucune pause d’au moins 20 min détectée.'});
  if(mealRequired(d)){
    const ok=p.some(x=>x.min>=C.mealMin && ((mm(x.d)>=660&&mm(x.f)<=870)||(mm(x.d)>=1110&&mm(x.f)<=1320))) || !!(r.meal&&r.meal.auto);
    if(!ok)out.push({lvl:'warn',code:'MEAL_MISSING',k,msg:'Journée couvrant une plage repas : aucune pause repas de 30 min détectée dans la plage concernée.'});
    else if(r.meal?.auto)out.push({lvl:'info',code:'MEAL_AUTO',k,msg:'Repas automatique de 30 min appliqué au calcul TTE.'});
  }
  if(d.panier&&d.panier!=='NON'&&!p.some(x=>x.min>=30))out.push({lvl:'info',code:'BASKET_WITHOUT_PAUSE',k,msg:`Panier ${d.panier} renseigné sans pause de 30 min enregistrée : vérifier la saisie.`});
 }
 for(let i=1;i<ks.length;i++){
  const a=ks[i-1],b=ks[i],fa=days()[a]?.fin,db=days()[b]?.deb;if(!fa||!db)continue;
  const rest=(typeof nDays==='function'?nDays(a,b):Math.round((new Date(b)-new Date(a))/86400000));
  if(rest<=1){const end=mm(fa),start=mm(db);if(end!=null&&start!=null){let delta=(24*60-end)+start;if(delta<C.restMin)out.push({lvl:'bad',code:'REST_LT9',k:b,msg:`Repos entre services ${Fm(delta)} : inférieur à 9 h.`});else if(delta<C.restWarn)out.push({lvl:'warn',code:'REST_LT11',k:b,msg:`Repos entre services ${Fm(delta)} : inférieur à 11 h, vérifier une éventuelle dérogation/contrepartie.`});}}}
 const week={}; for(const k of ks){const w=typeof mono==='function'?mono(k):k;week[w]=(week[w]||0)+(Number(get(k).r.tte)||0)}
 Object.entries(week).forEach(([w,m])=>{if(m>C.weekMax)out.push({lvl:'bad',code:'WEEK_GT48',k:w,msg:`Semaine ${w} : TTE ${Fm(m)} > 48 h.`})});
 const now=today(), from=addD(now,-90), weekly={};
 for(let k=from;k<=now;k=addD(k,1)){
   if(!isWork(k)) continue;
   const w=typeof mono==='function'?mono(k):k;
   weekly[w]=(weekly[w]||0)+(Number(get(k).r.tte)||0);
 }
 const weeks=Object.keys(weekly).sort();
 if(weeks.length>=13){
   const last13=weeks.slice(-13);
   const rolling13=last13.reduce((a,w)=>a+(weekly[w]||0),0)/13;
   if(rolling13>C.avg3m) out.push({lvl:'bad',code:'AVG_GT46',k:last13[0],msg:`Moyenne glissante sur 13 semaines : ${Fm(rolling13)} / semaine > 46 h. Vérification détaillée requise.`});
 }
 return out;
}
function stats(){const ks=Object.keys(days()).filter(isWork).sort(), a=scan(), tte=ks.reduce((s,k)=>s+(Number(get(k).r.tte)||0),0), amp=ks.reduce((s,k)=>s+(Number(get(k).r.amp)||0),0);return {days:ks.length,tte,amp,alerts:a,critical:a.filter(x=>x.lvl==='bad').length,warn:a.filter(x=>x.lvl==='warn').length,info:a.filter(x=>x.lvl==='info').length};}
function search(q){q=String(q||'').trim().toLowerCase();return Object.keys(days()).filter(k=>!q||k.includes(q)||String(days()[k].note||'').toLowerCase().includes(q)).sort().reverse().slice(0,80).map(k=>{const x=get(k);return {k,type:x.d.t,tte:Number(x.r.tte)||0,amp:Number(x.r.amp)||0,note:x.d.note||''}})}
function widget(){try{const b=window.MesHeuresAndroid;if(!b||typeof b.updateWidgetData!=='function')return;const s=stats(),k=today(),x=get(k), payload={version:V,monthLabel:k.slice(0,7),dayIndex:Number(k.slice(-2)),monthDays:new Date(Number(k.slice(0,4)),Number(k.slice(5,7)),0).getDate(),tteJourMin:Number(x.r.tte)||0,tteMoisMin:0,tteSemaineMin:0,ttePeriodeMin:0,workCount:0,restCount:0,cpCount:0,malCount:0,alertesMois:s.alerts.filter(a=>String(a.k||'').slice(0,7)===k.slice(0,7)).length,grossCents:null,netCents:null,netLabel:'Net estimé',rcSoldeMin:0,todayType:x.d.t||'REPOS',timerRunning:!!x.d.running,timerStartEpoch:Number(x.d.startEpoch)||0,assistantCritical:s.critical,assistantWarnings:s.warn};
  const mon=k.slice(0,7);let wk=0,mo=0;Object.keys(days()).forEach(q=>{const r=get(q).r;const m=Number(r.tte)||0;if(q.slice(0,7)===mon)mo+=m;if(typeof mono==='function'&&mono(q)===mono(k))wk+=m;payload.workCount+=isWork(q)?1:0;if(days()[q]?.t==='REPOS')payload.restCount++;if(days()[q]?.t==='CP')payload.cpCount++;if(days()[q]?.t==='MAL')payload.malCount++});payload.tteMoisMin=mo;payload.tteSemaineMin=wk;b.updateWidgetData(JSON.stringify(payload));}catch(e){}}
function renderHome(){const host=$('#mh33AssistantHome');if(!host)return;const s=stats(),top=s.alerts.filter(x=>x.lvl!=='info').sort((a,b)=>(a.lvl==='bad'?0:1)-(b.lvl==='bad'?0:1)).slice(0,4);host.innerHTML=`<div class="mh33-card"><div class="mh33-head"><div><span class="mh33-kicker">MESHEURES V33 · ASSISTANT</span><h2>🧠 Pilotage ambulancier</h2></div><span class="mh33-badge">${s.critical?'À TRAITER':s.warn?'À VÉRIFIER':'OK'}</span></div><div class="mh33-kpis"><div><b>${s.days}</b><span>jours travail</span></div><div><b>${Fm(s.tte)}</b><span>TTE enregistré</span></div><div class="${s.critical?'bad':s.warn?'warn':'ok'}"><b>${s.alerts.length}</b><span>points détectés</span></div></div>${top.length?top.map(x=>`<button class="mh33-alert" onclick="MH33.open('${x.k}')"><span>${x.lvl==='bad'?'🔴':'🟠'}</span><div><b>${esc(dateLabel(x.k))}</b><small>${esc(x.msg)}</small></div></button>`).join(''):'<div class="mh33-ok">✓ Aucun point prioritaire détecté dans les données connues.</div>'}<div class="mh33-actions"><button onclick="MH33.open()">🔎 Centre assistant</button><button onclick="tab(&quot;paie&quot;)">💶 Préparer la paie</button><button onclick="MH33.documents()">📄 Documents</button></div></div>`}
function ensure(){if($('#mh33AssistantHome'))return;const home=$('#s-home');if(!home)return;const sec=document.createElement('div');sec.id='mh33AssistantHome';home.insertBefore(sec,home.firstChild);renderHome()}
function open(k){let modal=$('#mh33Modal');if(!modal){modal=document.createElement('div');modal.id='mh33Modal';modal.className='mh33-modal';document.body.appendChild(modal)}let q='';if(k){q=k;}
 const s=stats(), rows=(q?search(q):search('')).sort((a,b)=>String(b.k).localeCompare(String(a.k))).slice(0,30);modal.innerHTML=`<div class="mh33-sheet"><div class="mh33-head"><div><span class="mh33-kicker">V33 · CENTRE ASSISTANT</span><h2>Contrôle & historique</h2></div><button class="g" onclick="MH33.close()">Fermer</button></div><div class="mh33-kpis"><div><b>${s.critical}</b><span>critique</span></div><div><b>${s.warn}</b><span>à vérifier</span></div><div><b>${s.info}</b><span>informatif</span></div></div><input id="mh33Search" placeholder="Rechercher une date, note…" value="${esc(q)}"><div id="mh33Results">${rows.map(r=>`<button class="mh33-result" onclick="MH33.open('${r.k}')"><b>${esc(dateLabel(r.k))}</b><span>${esc(r.type)} · TTE ${Fm(r.tte)} · Amp ${Fm(r.amp)}</span>${r.note?`<small>${esc(r.note)}</small>`:''}</button>`).join('')||'<div class="mh33-ok">Aucun résultat.</div>'}</div><div class="mh33-footer"><button onclick="MH33.export()">⬇ Export V33</button><button onclick="MH33.backup()">🛡️ Point de sauvegarde</button></div></div>`;modal.classList.add('on');const inp=$('#mh33Search');if(inp)inp.oninput=()=>{const rs=search(inp.value);$('#mh33Results').innerHTML=rs.map(r=>`<button class="mh33-result" onclick="MH33.open('${r.k}')"><b>${esc(dateLabel(r.k))}</b><span>${esc(r.type)} · TTE ${Fm(r.tte)} · Amp ${Fm(r.amp)}</span></button>`).join('')||'<div class="mh33-ok">Aucun résultat.</div>'};}
function close(){const m=$('#mh33Modal');if(m)m.classList.remove('on')}
function backup(){try{if(typeof mhV30Backup==='function'){const r=mhV30Backup('v33-assistant');alert(r.ok?'🛡️ Point de sauvegarde V33 créé.':'Sauvegarde impossible.');return r}throw new Error('Backup V32 indisponible')}catch(e){alert('❌ '+e.message)}}
function exportData(){try{const data={format:'MesHeures V33 Export',version:V,createdAt:new Date().toISOString(),data:JSON.parse(JSON.stringify(DB))};const fn=`MesHeures-V33-${new Date().toISOString().slice(0,10)}.json`;if(typeof mhDownloadFile==='function')mhDownloadFile(fn,JSON.stringify(data,null,2),'application/json;charset=utf-8');else throw new Error('Export natif indisponible');}catch(e){alert('❌ Export impossible : '+e.message)}}
function documents(){try{if(window.MHRoadmap?.generate&&window.MesHeuresAndroid?.printHtml){const h=window.MHRoadmap.generate(today());window.MesHeuresAndroid.printHtml(h);return true}if(typeof mhPrint==='function'){mhPrint();return true}return false}catch(e){alert('❌ Document impossible : '+e.message);return false}}
function payCard(){const host=$('#s-paie');if(!host||$('#mh33PayCard'))return;const c=document.createElement('div');c.id='mh33PayCard';c.className='card';c.innerHTML='<h2>🧠 Assistant paie V33 <span class="sub">contrôle avant bulletin</span></h2><div id="mh33PayOut"></div>';const anchor=$('#pAlign')?.parentElement;host.insertBefore(c,anchor?anchor.nextSibling:host.firstChild);renderPayCard()}
function renderPayCard(){const h=$('#mh33PayOut');if(!h)return;let p=null;try{p=window.mhCurrentPaySummary?.()}catch(e){}const s=stats();const hard=s.alerts.filter(x=>x.lvl==='bad').length;const pay=p?`<div class="mh33-kpis"><div><b>${Fm(p.tte)}</b><span>TTE période</span></div><div><b>${Fm(p.hs25)}</b><span>HS 25 %</span></div><div><b>${Fm(p.hs50)}</b><span>HS 50 %</span></div></div><div class="mh33-payline">Brut estimé <b>${typeof EUR==='function'?EUR(p.grossEst):'—'}</b></div>`:'<div class="mh33-ok">Calcul paie indisponible pour cette période.</div>';h.innerHTML=pay+(hard?`<div class="al b">🔴 ${hard} point(s) critique(s) doivent être vérifiés avant validation du bulletin.</div>`:'<div class="al k">🟢 Aucun point critique détecté par l’assistant.</div>')+'<div class="mh33-actions"><button onclick="tab(&quot;paie&quot;)">💶 Détail paie</button><button onclick="MH33.export()">⬇ Sauvegarde</button><button onclick="MH33.documents()">📄 Feuille route</button></div>'}
function injectCss(){if($('#mh33css'))return;const s=document.createElement('style');s.id='mh33css';s.textContent=`.mh33-card{background:linear-gradient(145deg,#171d25,#0f141a);border:1px solid #29333e;border-radius:19px;padding:14px;margin-bottom:12px}.mh33-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.mh33-head h2{margin:3px 0 8px!important;color:#eef3f7!important}.mh33-kicker{font-size:9px;letter-spacing:1.3px;color:#8b98a6;font-weight:800}.mh33-badge{font-size:9px;padding:5px 8px;border-radius:999px;background:#1c2128;border:1px solid #303944}.mh33-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:8px 0}.mh33-kpis>div{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:8px;text-align:center}.mh33-kpis b{display:block;font-size:17px}.mh33-kpis span{display:block;color:#8b949e;font-size:9px}.mh33-kpis .bad b{color:#f85149}.mh33-kpis .warn b{color:#d29922}.mh33-kpis .ok b{color:#3fb950}.mh33-alert{display:flex;width:100%;gap:8px;text-align:left;background:#121820;border:1px solid #2b3540;color:#e6edf3;border-radius:10px;padding:8px;margin:5px 0}.mh33-alert div{min-width:0}.mh33-alert small{display:block;color:#9aa4b0;font-size:10px;margin-top:2px}.mh33-ok{padding:10px;border-radius:10px;background:#102318;color:#6ddd96;font-size:11px}.mh33-payline{display:flex;justify-content:space-between;border-top:1px solid #30363d;padding-top:8px;font-size:11px;margin:8px 0}.mh33-payline b{font-size:14px}.mh33-actions,.mh33-footer{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}.mh33-actions button,.mh33-footer button{font-size:10px;padding:8px}.mh33-modal{display:none;position:fixed;inset:0;background:#000b;z-index:1000;align-items:flex-end}.mh33-modal.on{display:flex}.mh33-sheet{width:100%;max-width:720px;margin:auto auto 0;background:#161b22;border:1px solid #30363d;border-radius:18px 18px 0 0;padding:14px;max-height:88vh;overflow:auto}.mh33-sheet input{margin:8px 0;background:#0d1117}.mh33-result{display:block;width:100%;text-align:left;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:9px;padding:8px;margin:5px 0}.mh33-result b,.mh33-result span,.mh33-result small{display:block}.mh33-result span,.mh33-result small{font-size:10px;color:#8b949e;margin-top:2px}@media(max-width:600px){.mh33-actions{grid-template-columns:1fr 1fr 1fr}.mh33-kpis b{font-size:15px}}
/* V33.1.1 LIGHT CONTRAST */
:root[data-theme="light"] .mh33-card,
:root[data-theme="light"] .mh33-sheet{
  background:#fff!important;color:#1f2328!important;border-color:#d0d7de!important;
  box-shadow:0 2px 10px rgba(31,35,40,.08);
}
:root[data-theme="light"] .mh33-card h2,
:root[data-theme="light"] .mh33-card h2 .sub,
:root[data-theme="light"] .mh33-kicker,
:root[data-theme="light"] .mh33-payline,
:root[data-theme="light"] .mh33-payline b{color:#1f2328!important}
:root[data-theme="light"] .mh33-kpis>div{
  background:#f8fafc!important;border-color:#d0d7de!important;color:#1f2328!important;
}
:root[data-theme="light"] .mh33-kpis span,
:root[data-theme="light"] .mh33-alert small,
:root[data-theme="light"] .mh33-result span,
:root[data-theme="light"] .mh33-result small{color:#57606a!important}
:root[data-theme="light"] .mh33-kpis .ok b{color:#146c2e!important}
:root[data-theme="light"] .mh33-kpis .warn b{color:#7a4b00!important}
:root[data-theme="light"] .mh33-kpis .bad b{color:#b4232b!important}
:root[data-theme="light"] .mh33-payline{border-top-color:#d0d7de!important}
:root[data-theme="light"] .mh33-ok{
  background:#dafbe1!important;color:#146c2e!important;border:1px solid #82dca0!important;
}
:root[data-theme="light"] .mh33-alert{
  background:#fff!important;color:#1f2328!important;border-color:#d0d7de!important;
}
:root[data-theme="light"] .mh33-actions button{
  background:#1a7f37!important;color:#fff!important;
}
:root[data-theme="light"] .mh33-result{
  background:#fff!important;color:#1f2328!important;border-color:#d0d7de!important;
}
/* Paie historique */
:root[data-theme="light"] #s-paie .pay-sim-card,
:root[data-theme="light"] #s-paie .pay-sim-grid>div,
:root[data-theme="light"] #s-paie .pay-sim-net,
:root[data-theme="light"] #s-paie .pro-summary{
  background:#fff!important;color:#1f2328!important;border-color:#d0d7de!important;
}
:root[data-theme="light"] #s-paie .pay-sim-card h2,
:root[data-theme="light"] #s-paie .pay-sim-total strong,
:root[data-theme="light"] #s-paie .pay-sim-grid b,
:root[data-theme="light"] #s-paie .pay-sim-net strong{color:#1f2328!important}
:root[data-theme="light"] #s-paie .pay-sim-total span,
:root[data-theme="light"] #s-paie .pay-sim-grid span,
:root[data-theme="light"] #s-paie .pay-sim-net span,
:root[data-theme="light"] #s-paie .sim-disclaimer{color:#57606a!important}
:root[data-theme="light"] #s-paie .pay-sim-net{
  background:#dafbe1!important;border-color:#82dca0!important;
}
:root[data-theme="light"] #s-paie .pay-sim-net strong{color:#146c2e!important}
:root[data-theme="light"] #s-paie .status-ok{
  background:#dafbe1!important;color:#146c2e!important;border-color:#82dca0!important;
}
:root[data-theme="light"] #s-paie .status-bad{
  background:#ffebe9!important;color:#b4232b!important;border-color:#ffb8b3!important;
}`;
document.head.appendChild(s)}
function boot(){injectCss();ensure();payCard();widget();if(typeof mhRefresh==='function'&&!window.__mh33Wrapped){const old=mhRefresh;window.mhRefresh=function(){const r=old.apply(this,arguments);try{renderHome();payCard();renderPayCard();widget()}catch(e){}return r};window.__mh33Wrapped=true}}
window.MH33={version:V,config:C,scan,stats,search,render:renderHome,open,close,backup,export:exportData,widget,documents};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();


/* =========================================================
   V34.1.2 — SYNCHRONISATION MOTEUR CANONIQUE
   Une seule source : MH30DataEngine + DB.
   Le widget ne calcule jamais les règles métier.
   ========================================================= */
(function(){
  'use strict';
  if(window.__MH33_CANONICAL_SYNC__) return;
  window.__MH33_CANONICAL_SYNC__=true;

  var scheduled=null, lastJson='';

  function safe(fn,d){try{return fn()}catch(e){return d}}
  function n(v,d){v=Number(v);return Number.isFinite(v)?v:(d||0)}
  function min(v){return Math.max(0,Math.round(n(v,0)))}
  function eurosCents(v){
    if(v===null||v===undefined||v==='') return null;
    var x=Number(v);
    return Number.isFinite(x)?Math.round(x*100):null;
  }
  function dayRecord(k){
    return safe(function(){return DB&&DB.days?DB.days[k]:null},null);
  }
  function dayCalc(k){
    return safe(function(){
      return window.MH30DataEngine?MH30DataEngine.day(k):
        (typeof mhCalcDay==='function'?mhCalcDay(k):null);
    },null);
  }
  function weekStart(k){return typeof mono==='function'?mono(k):k}
  function sumRange(start,count){
    var t=0,amp=0;
    for(var i=0;i<count;i++){
      var k=safe(function(){return addD(start,i)},null);
      if(!k)continue;
      var r=dayCalc(k);
      if(r){t+=n(r.tte);amp+=n(r.amp)}
    }
    return {tte:t,amp:amp};
  }
  function counts(start,count){
    var c={T:0,R:0,CP:0,MAL:0,RC:0,NUIT:0};
    for(var i=0;i<count;i++){
      var k=safe(function(){return addD(start,i)},null);
      var d=k?dayRecord(k):null;
      var t=d?String(d.t||''):'';
      if(c[t]!==undefined)c[t]++;
    }
    return c;
  }
  function build(){
    scheduled=null;
    if(!window.MesHeuresAndroid||typeof DB==='undefined')return null;

    var d=safe(function(){return today()},null);
    if(!d)return null;

    var nowDate=safe(function(){return new Date(d+'T12:00:00')},new Date());
    var monthKey=d.slice(0,7);
    var month=safe(function(){
      return window.MH30DataEngine?MH30DataEngine.month(monthKey):null;
    },null);
    var week=sumRange(weekStart(d),7);
    var day=dayCalc(d)||{tte:0,amp:0};

    var per=safe(function(){
      return typeof mhCurrentPaySummary==='function'?mhCurrentPaySummary():null;
    },null);

    var c=counts(monthKey+'-01',nowDate.getDate());
    var alerts=safe(function(){
      return window.MH33&&typeof MH33.scan==='function'?MH33.scan():[];
    },[]);
    if(!Array.isArray(alerts))alerts=[];

    var bad=alerts.filter(function(a){return a&&a.lvl==='bad'}).length;
    var warn=alerts.filter(function(a){return a&&a.lvl==='warn'}).length;
    var info=alerts.filter(function(a){return a&&a.lvl==='info'}).length;
    var rec=dayRecord(d)||{};

    var payload={
      schema:"mesheures.widget.v33",
      version:"34.1.2",
      revision:safe(function(){return MH30DataEngine.stats().revision},0),
      updatedAt:Date.now(),
      source:"MH30DataEngine",
      monthLabel:nowDate.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}),
      dayIndex:nowDate.getDate(),
      monthDays:new Date(nowDate.getFullYear(),nowDate.getMonth()+1,0).getDate(),
      today:d,
      todayType:String(rec.t||'REPOS'),
      tteJourMin:min(day.tte),
      amplitudeJourMin:min(day.amp),
      tteMoisMin:min(month?month.tte:0),
      tteSemaineMin:min(week.tte),
      ttePeriodeMin:min(per?per.tte:0),
      workCount:c.T||0, restCount:c.R||0, cpCount:c.CP||0,
      malCount:c.MAL||0, rcCount:c.RC||0, nuitCount:c.NUIT||0,
      alertesMois:bad+warn,
      alertesCritiques:bad,
      alertesAvertissements:warn,
      alertesInfos:info,
      anomaliesTotal:alerts.length,
      hs25PeriodeMin:min(per?per.hs25:0),
      hs50PeriodeMin:min(per?per.hs50:0),
      grossCents:per?eurosCents(per.grossEst):null,
      netCents:per?eurosCents(per.netEst):null,
      netLabel:"Net estimé",
      rcSoldeMin:min(safe(function(){return DB.s.rc},0)),
      margeAvant46hMin:per?Math.round(2760-(Number(per.tte)||0)):null,
      timerRunning:Boolean(rec.running),
      timerStartEpoch:n(rec.startEpoch,0)
    };

    var json=JSON.stringify(payload);
    if(json!==lastJson){
      lastJson=json;
      try{window.MesHeuresAndroid.updateWidgetData(json)}catch(e){}
    }
    window.__MH33_LAST_WIDGET_PAYLOAD__=payload;
    return payload;
  }

  function schedule(delay){
    if(scheduled!==null)clearTimeout(scheduled);
    scheduled=setTimeout(build,Math.max(0,delay||0));
  }

  window.MH33.syncWidgetV33=build;
  window.MH33.syncNow=function(){schedule(0)};

  document.addEventListener('mh30:data-invalidated',function(){schedule(120)});

  if(typeof window.mhRefresh==='function' && !window.mhRefresh.__mh33Canonical){
    var oldRefresh=window.mhRefresh;
    var wrapped=function(){
      var r=oldRefresh.apply(this,arguments);
      schedule(150);
      return r;
    };
    wrapped.__mh33Canonical=true;
    window.mhRefresh=wrapped;
  }

  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible')schedule(80);
  });
  window.addEventListener('pageshow',function(){schedule(100)});

  setInterval(function(){
    if(document.visibilityState==='visible')build();
  },60000);

  schedule(250);
})();
