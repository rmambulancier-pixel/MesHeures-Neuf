/* MesHeures V34.1.2 — canonical runtime
 * One calculation engine, one UI/live runtime, one scheduler.
 * Historical V24/V25/V26/V27/V28 runtime files are removed.
 */
(function(){
  'use strict';

  const V='37.1.0';
  const SECTIONS=['home','jour','mois','paie','analyse','audit','bul','romi','reg'];
  const q=s=>document.querySelector(s);
  const el=id=>document.getElementById(id);
  const fmt=m=>typeof F==='function'?F(Math.round(m||0)):'0h00';
  const money=n=>typeof EUR==='function'?EUR(n):'—';
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function day(){return today();}
  function dayData(k=day()){return (DB.days&&DB.days[k])||{t:'REPOS',p:[]};}
  function ensureDay(k=day()){
    if(typeof gd==='function')return gd(k);
    if(!DB.days[k])DB.days[k]={t:'REPOS',p:[]};
    DB.days[k].p=DB.days[k].p||[];
    return DB.days[k];
  }
  function nowHHMM(){const n=new Date();return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');}
  function debEpoch(k,hhmm){
    if(!hhmm||!/^\d{1,2}:\d{2}$/.test(hhmm))return Date.now();
    const d=new Date(k+'T'+hhmm.padStart(5,'0')+':00');
    return isNaN(d.getTime())?Date.now():d.getTime();
  }

  /* ---------- Live service: DB-backed, restart-safe ---------- */
  const Live={
    tick:null,
    active(){const d=dayData();return d.t==='T'&&!!d.running&&Number(d.startEpoch)>0;},
    elapsedMs(){const d=dayData();if(!this.active())return 0;return Math.max(0,Date.now()-Number(d.startEpoch));},
    elapsedClock(){const s=Math.floor(this.elapsedMs()/1000);return `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;},
    start(){
      const k=day(),d=ensureDay(k),t=nowHHMM();
      d.t='T';d.deb=d.deb||t;d.fin=null;d.running=true;d.startEpoch=debEpoch(k,d.deb);
      d.p=d.p||[];
      if(typeof save==='function')save();
      this.render();
      if(typeof mhRefresh==='function')mhRefresh('live-mutation');
    },
    stop(){
      const k=day(),d=ensureDay(k);if(!this.active())return;
      d.fin=nowHHMM();d.running=false;d.startEpoch=0;
      if(typeof save==='function')save();
      this.render();
      if(typeof mhRefresh==='function')mhRefresh('live-mutation');
    },
    toggle(){this.active()?this.stop():this.start();},
    render(){
      const d=dayData(),r=typeof cd==='function'?cd(day()):null;
      const live=this.active();
      document.querySelectorAll('[data-live-state]').forEach(x=>{x.textContent=live?'EN SERVICE':'SERVICE ARRÊTÉ';x.classList.toggle('is-live',live)});
      document.querySelectorAll('[data-live-clock]').forEach(x=>x.textContent=live?this.elapsedClock():fmt(r?.tte||0));
      document.querySelectorAll('[data-live-tte]').forEach(x=>x.textContent=fmt(r?.tte||0));
      document.querySelectorAll('[data-live-amp]').forEach(x=>x.textContent=fmt(r?.amp||0));
      document.querySelectorAll('[data-live-pause]').forEach(x=>x.textContent=fmt(r?.pz||0));
      document.querySelectorAll('[data-live-start]').forEach(x=>x.textContent=d.deb||'—');
      document.querySelectorAll('[data-live-end]').forEach(x=>x.textContent=d.fin||(live?'En cours':'—'));
      document.querySelectorAll('[data-live-action]').forEach(x=>{x.textContent=live?'■ Arrêter le service':'▶ Démarrer le service';x.classList.toggle('stop',live)});
      document.querySelectorAll('[data-live-action]').forEach(x=>{x.onclick=()=>this.toggle();});
      const note=live&&r?.pz===0&&r?.tte>=360?'Pause de 20 min à prévoir':'Calcul automatique · synchronisé avec la journée';
      document.querySelectorAll('[data-live-note]').forEach(x=>x.textContent=note);
    }
  };
  window.MH30Live=Live;

  function quickSetTime(k,field,value){
    const d=ensureDay(k);d.t='T';d[field]=value;
    if(field==='deb'){
      // Saisir l'heure de début démarre le direct tout seul (si le jour est
      // aujourd'hui et pas déjà clôturé), en comptant depuis cette heure-là
      // et non depuis l'instant de la saisie.
      if(k===day()&&value&&!d.fin){d.running=true;d.startEpoch=debEpoch(k,value);}
      else{d.running=false;d.startEpoch=0;}
    }
    if(field==='fin'){d.running=false;d.startEpoch=0;}
    if(typeof save==='function')save();mhRefresh('live-field');
    if(typeof mhRefresh==='function')mhRefresh('live-mutation');
  }
  window.mh30SetTime=quickSetTime;

  function normalizeTimeInput(input){
    const raw=(input.value||'').trim().replace(/\s+/g,'');
    if(/^\d{1,2}$/.test(raw)){input.value=String(Number(raw)).padStart(2,'0')+':00';input.dispatchEvent(new Event('change',{bubbles:true}));return;}
    if(/^\d{3,4}$/.test(raw)){
      const n=raw.padStart(4,'0');const h=n.slice(0,-2),m=n.slice(-2);
      if(Number(h)<=23&&Number(m)<=59){input.value=String(Number(h)).padStart(2,'0')+':'+m;input.dispatchEvent(new Event('change',{bubbles:true}));}
    }
  }
  function bindSmartTimeInputs(root=document){
    root.querySelectorAll('input[type="time"],input[data-time-smart]').forEach(i=>{
      if(i.dataset.mh30bound)return;i.dataset.mh30bound='1';i.addEventListener('blur',()=>normalizeTimeInput(i));
    });
  }

  /* ---------- Shared compact components ---------- */
  function liveCard(compact=false){
    return `<div class="mh30-live ${compact?'compact':''}">
      <div class="mh30-live-top"><div><span class="mh30-kicker">SERVICE · TEMPS RÉEL</span><div class="mh30-live-state" data-live-state>—</div></div><button class="mh30-live-btn" data-live-action>▶ Démarrer le service</button></div>
      <div class="mh30-live-main"><strong data-live-clock>0h00</strong><div class="mh30-live-meta"><span>TTE <b data-live-tte>0h00</b></span><span>Amplitude <b data-live-amp>0h00</b></span><span>Pause <b data-live-pause>0h00</b></span></div></div>
      <div class="mh30-live-foot"><span>Début <b data-live-start>—</b> · Fin <b data-live-end>En cours</b></span><span data-live-note>Calcul automatique · synchronisé avec la journée</span></div>
    </div>`;
  }

  function periodInfo(){
    const k=day(),qs=mhQuatorzaine.start(k);
    const q=calcPer(qs,1).Q[0],N=DB.s.base*120,pc=N?Math.min(100,q.seuil/N*100):0;
    return {qs,q,N,pc};
  }

  /* ---------- Day: single editor, live-first ---------- */
  function renderDay(){
    const host=el('s-jour');if(!host)return;
    const k=curDate||day(),d=dayData(k),r=cd(k),isToday=k===day();
    const type=d.t||'REPOS';
    const types=[['T','Travail'],['REPOS','Repos'],['NUIT','Nuit'],['RC','RC'],['CP','Congé'],['MAL','Maladie']];
    host.innerHTML=`<div class="mh30-shell mh30-day-shell">
      <div class="mh30-daynav"><button class="mh30-iconbtn" onclick="goDay(-1)">‹</button><div><span>${dow(k).toUpperCase()}</span><b>${shortY(k)} ${isToday?'· AUJ.':''}</b></div><button class="mh30-iconbtn" onclick="goDay(1)">›</button></div>
      ${isToday?liveCard(true):''}
      <div class="mh30-typebar">${types.map(([v,l])=>`<button class="${type===v?'on':''}" onclick="mh30SetType('${v}')">${l}</button>`).join('')}</div>
      <div class="mh30-editor" id="mh30Editor"></div>
      <div class="mh30-day-summary"><div><span>Amplitude</span><b>${fmt(r.amp)}</b></div><div><span>TTE</span><b>${fmt(r.tte)}</b></div><div><span>Pauses</span><b>${fmt(r.pz)}</b></div><div><span>Paniers</span><b>${(r.ir+r.iru)||0}</b></div></div>
      ${r.al.length?`<div class="mh30-alerts">${r.al.map(a=>`<div class="mh30-alert ${a.lvl==='b'?'bad':'warn'}">${a.lvl==='b'?'🔴':'🟠'} ${escapeHtml(a.m)}</div>`).join('')}</div>`:''}
      <div class="mh30-bottom-actions"><button onclick="goToday()">Aujourd’hui</button><button onclick="dupliConfirm()">Copier veille</button><button class="danger" onclick="clearDay()">Effacer</button></div>
    </div>`;
    renderDayEditor();Live.render();bindSmartTimeInputs(host);
  }
  function renderDayEditor(){
    const k=curDate||day(),d=ensureDay(k),host=el('mh30Editor');if(!host)return;
    if(d.t==='T'||d.t==='NUIT'){
      host.innerHTML=`<div class="mh30-card"><div class="mh30-row2"><label>Début<input type="text" inputmode="numeric" data-time-smart value="${d.deb||''}" onchange="mh30SetTime('${k}','deb',this.value)"></label><label>Fin<input type="text" inputmode="numeric" data-time-smart value="${d.fin||''}" onchange="mh30SetTime('${k}','fin',this.value)"></label></div>
      <div class="mh30-meal"><span>🍽️ Panier repas</span><div>${[['', 'Auto'],['EXT','Extérieur'],['ENT','Intérieur'],['NON','Aucun']].map(([v,l])=>`<button class="${((typeof mhMealChoice==='function'?mhMealChoice(d):d.panier)||'')===v?'on':''}" onclick="mh30SetPanier('${v}')">${l}</button>`).join('')}</div></div>
      <div class="mh30-pauses"><div class="mh30-cardtitle"><span>Pauses</span><button onclick="mh30AddPause()">＋ Ajouter</button></div>${(d.p||[]).map((p,i)=>`<div class="mh30-pause"><input type="time" value="${p.d||''}" onchange="mh30SetPause(${i},'d',this.value)"><span>→</span><input type="time" value="${p.f||''}" onchange="mh30SetPause(${i},'f',this.value)" ><button onclick="mh30DelPause(${i})">×</button></div>`).join('')}</div>
      <label class="mh30-note">Note<input maxlength="120" value="${escapeHtml(d.note||'')}" onchange="mh30SetNote(this.value)" placeholder="Remarque, incident…"></label>
      <label class="mh30-check"><input type="checkbox" ${d.fer?'checked':''} onchange="mh30SetField('fer',this.checked)"> Jour férié travaillé · majoration 100 %</label></div>`;
    }else{
      host.innerHTML=`<div class="mh30-card mh30-empty-editor"><b>${({REPOS:'Journée de repos',RC:'Repos compensateur',CP:'Congé payé',MAL:'Journée maladie'})[d.t]||'Journée'}</b><span>Rien à saisir. Le planning et les compteurs s’actualiseront automatiquement.</span></div>`;
    }
  }
  window.mh30SetType=function(v){const d=ensureDay(curDate||day());d.t=v;d.p=d.p||[];if(v!=='T'&&v!=='NUIT'){d.running=false;d.startEpoch=0;}if(typeof save==='function')save();mhRefresh('live-field');};
  window.mh30SetPanier=function(v){const d=ensureDay(curDate||day());d.panier=v||null;d.mealV=3;save();mhRefresh('live-mutation');};
  window.mh30AddPause=function(){ensureDay(curDate||day()).p.push({d:'',f:''});save();mhRefresh('live-mutation');};
  window.mh30DelPause=function(i){ensureDay(curDate||day()).p.splice(i,1);save();mhRefresh('live-mutation');};
  window.mh30SetPause=function(i,f,v){const d=ensureDay(curDate||day());d.p[i]=d.p[i]||{};d.p[i][f]=v;save();mhRefresh('live-mutation');};
  window.mh30SetNote=function(v){ensureDay(curDate||day()).note=v;save();};
  window.mh30SetField=function(f,v){ensureDay(curDate||day())[f]=v;save();mhRefresh('live-mutation');};

  /* ---------- Analysis: all intelligence in one place ---------- */
  function buildAnalysis(){
    if(el('s-analyse'))return;
    const sec=document.createElement('section');sec.id='s-analyse';
    sec.innerHTML=`<div class="mh30-shell"><header class="mh30-pagehead"><div><span class="mh30-kicker">MESHEURES · ANALYSE</span><h2>Centre de pilotage</h2><p>Une seule vue pour les tendances, risques et droits à vérifier.</p></div></header><div id="mh30Analysis"></div><div class="mh30-tools"><button onclick="tab('audit')">🛡️ Contrôle légal</button><button onclick="tab('bul')">📄 Bulletin</button><button onclick="tab('romi')">📋 ROMI1</button><button onclick="tab('reg')">⚙ Réglages</button></div></div>`;
    const main=document.querySelector('main');const pay=el('s-paie');main.insertBefore(sec,pay?.nextSibling||null);
  }
  function renderAnalysis(){
    const host=el('mh30Analysis');if(!host)return;
    const month=mhMonthStats(day().slice(0,7));
    let intel=null;try{intel=window.mhV30IntelligenceData?.();}catch(e){}
    const proj=intel?.projection||{};
    const patterns=intel?.patterns||[];
    const {q,N,pc}=periodInfo();
    const recent=[];for(let i=13;i>=0;i--){const k=addD(day(),-i),r=cd(k);if(r.tte>0)recent.push({k,m:r.tte});}
    const max=Math.max(1,...recent.map(x=>x.m));
    host.innerHTML=`<div class="mh30-card mh30-risk"><div class="mh30-cardtitle"><span>Trajectoire</span><b>${proj.avg?fmt(proj.avg):'—'} / semaine</b></div><div class="mh30-progress"><i style="width:${Math.min(100,Math.max(0,(proj.avg||0)/2760*100)).toFixed(1)}%"></i></div><div class="mh30-period-foot"><span>Marge avant 46 h · ${proj.margin!=null?fmt(proj.margin):'—'}</span><span>${proj.firstRisk?'⚠️ '+shortY(proj.firstRisk):'Aucun dépassement projeté'}</span></div></div>
      <div class="mh30-grid2 mh30-gap"><div class="mh30-stat"><span>TTE mois</span><b>${fmt(month.tte)}</b><small>${month.trav} jour(s) travaillé(s)</small></div><div class="mh30-stat"><span>Amplitude moyenne</span><b>${month.trav?fmt(month.amp/month.trav):'—'}</b><small>sur les jours travaillés</small></div><div class="mh30-stat"><span>Alertes</span><b class="${month.hard?'bad':''}">${month.alerts.length}</b><small>${month.hard} critique(s) · ${month.warn} attention</small></div><div class="mh30-stat"><span>HS période</span><b>${fmt(q.h25+q.h50)}</b><small>${fmt(q.h25)} à 25 % · ${fmt(q.h50)} à 50 %</small></div></div>
      <div class="mh30-card"><div class="mh30-cardtitle"><span>14 derniers jours</span><small>TTE</small></div><div class="mh30-bars">${recent.map(x=>`<button onclick="mhOpenDay('${x.k}')" title="${shortY(x.k)} · ${fmt(x.m)}"><i style="height:${Math.max(6,Math.round(x.m/max*100))}%"></i><span>${dOf(x.k).getDate()}</span></button>`).join('')}</div></div>
      <div class="mh30-card"><div class="mh30-cardtitle"><span>À surveiller</span><b>${patterns.length+month.alerts.length}</b></div>${patterns.slice(0,4).map(x=>`<div class="mh30-alert ${x.level==='bad'?'bad':'warn'}"><b>${escapeHtml(x.title)}</b><span>${escapeHtml(x.text)}</span></div>`).join('')}${month.alerts.slice(0,4).map(a=>`<button class="mh30-alert mh30-alert-btn ${a.lvl==='b'?'bad':'warn'}" onclick="mhOpenDay('${a.k}')"><b>${shortY(a.k)}</b><span>${escapeHtml(a.m)}</span> ›</button>`).join('')}${!patterns.length&&!month.alerts.length?'<div class="mh30-ok">✓ Aucun point à surveiller.</div>':''}</div>`;
  }

  window.MH30RenderAnalysis=renderAnalysis;

  /* ---------- Navigation ---------- */
  function buildNav30(){
    let nav=el('mhV30Nav');
    if(!nav){
      nav=document.createElement('nav');
      nav.id='mhV30Nav';
      document.body.appendChild(nav);
    }
    nav.className='mh-v30-nav mh30-nav';
    nav.setAttribute('aria-label','Navigation principale');
    nav.innerHTML=`<button data-nav-tab="home" onclick="tab('home')">⌂<span>Accueil</span></button><button data-nav-tab="jour" onclick="tab('jour')">＋<span>Saisie</span></button><button data-nav-tab="mois" onclick="tab('mois')">▦<span>Planning</span></button><button data-nav-tab="paie" onclick="tab('paie')">€<span>Paie</span></button><button data-nav-tab="analyse" onclick="tab('analyse')">◌<span>Analyse</span></button>`;
    syncNav30();
  }

  function syncNav30(){
    const t=window.curTab||'home';
    document.querySelectorAll('#mhV30Nav [data-nav-tab]').forEach(b=>{
      const on=b.getAttribute('data-nav-tab')===t;
      b.setAttribute('aria-current',on?'page':'false');
      b.classList.toggle('active',on);
    });
  }


  /* V30: one render gateway. Legacy call sites never invoke renderAll directly. */
  window.mhRefresh=function(reason){
    try{
      if(window.MH30 && typeof window.MH30.refresh==='function') return window.MH30.refresh(reason||'mutation');
      if(typeof window.renderAll==='function') return window.renderAll();
    }catch(e){console.warn('MesHeures V30 refresh',e)}
  };


  /* Wrap the single mutation gateway so every save invalidates derived data. */
  function patchSave(){
    if(window.__mh30SavePatch||typeof window.save!=='function')return;
    const base=window.save;
    window.save=function(){
      const out=base.apply(this,arguments);
      window.MH30DataEngine?.invalidate?.('save');
      schedule('save');
      return out;
    };
    window.__mh30SavePatch=true;
  }

  let raf=0,liveTimer=0,booted=false,navHistory=['home'];
  let dirty=new Set(['home']);
  function safe(fn,label){try{return typeof fn==='function'?fn():null}catch(e){console.warn('MesHeures V30 '+label,e);return null}}
  function schedule(reason){
    if(reason)dirty.add(window.curTab||'home');
    if(raf)return;
    raf=requestAnimationFrame(()=>{raf=0;renderActive()});
  }

  function periodInfo(){
    const k=today(),qs=mhQuatorzaine.start(k);
    const qd=window.MH30DataEngine?.period?.(qs,1),q=qd.Q?.[0]||{},N=(DB.s.base||0)*120,pc=N?Math.min(100,(q.seuil||0)/N*100):0;
    return {qs,q,N,pc,qG:qd.G||{}};
  }

  function liveCard(){return `<div class="mh30-live" id="mh30Live">
    <div class="mh30-live-top"><div><span class="mh30-kicker">SERVICE · TEMPS RÉEL</span><div class="mh30-live-state" data-live-state>—</div></div><button class="mh30-live-btn" data-live-action>▶ Démarrer le service</button></div>
    <div class="mh30-live-main"><strong data-live-clock>0h00</strong><div class="mh30-live-meta"><span>TTE <b data-live-tte>0h00</b></span><span>Amplitude <b data-live-amp>0h00</b></span><span>Pause <b data-live-pause>0h00</b></span></div></div>
    <div class="mh30-live-foot"><span>Début <b data-live-start>—</b> · Fin <b data-live-end>En cours</b></span><span data-live-note>Calcul automatique · synchronisé avec la journée</span></div>
  </div>`}

  /* L'Accueil appartient à app-v31-home.js : ce runtime ne fait que le déclencher. */
  function renderHome(){
    window.MH31?.renderHome?.();
    safe(()=>window.MH30Live?.render?.(),'live');
  }

  function renderActive(){
    const t=window.curTab||'home';
    if(t==='home')return renderHome();
    if(!dirty.has(t))return;
    dirty.delete(t);
    if(t==='jour')safe(window.renderDay,'day');
    else if(t==='mois')safe(window.renderMonth,'month');
    else if(t==='paie')safe(window.renderPay,'pay');
    else if(t==='analyse')safe(window.MH30RenderAnalysis,'analysis');
    else if(t==='audit')safe(window.renderAudit,'audit');
    else if(t==='bul')safe(window.renderBulHist,'bulletins');
    else if(t==='romi')safe(window.renderRomiTab,'romi');
    else if(t==='reg')safe(window.renderReg,'settings');
    /* V30: modules that historically piggy-backed on renderAll are refreshed only
       when their owning tab is active. */
    if(t==='audit'){
      safe(window.mhV30RenderEvidence,'evidence');
      safe(window.mhV30ReconciliationRefresh,'reconciliation');
      safe(window.mhV30DossierRefresh,'dossier');
    }
    safe(()=>window.MH30Live?.render?.(),'live');
  }

  function activate(t){
    t=t||'home'; window.curTab=t;
    SECTIONS.forEach(x=>{$('s-'+x)?.classList.toggle('on',x===t);$('t-'+x)?.classList.toggle('on',x===t)});
    window.scrollTo(0,0);
  }
  function navigation(t){
    t=t||'home';
    if(!SECTIONS.includes(t))t='home';
    if(t!==(window.curTab||'home'))navHistory.push(t);
    activate(t);
    syncNav30();
    try{window.MesHeuresAndroid?.setCurrentTab?.(t)}catch(e){}
    dirty.add(t);
    schedule('navigate');
  }
  function goBack(){
    if(navHistory.length<=1){
      if((window.curTab||'home')!=='home'){
        navHistory=['home'];
        navigation('home');
        return true;
      }
      return false;
    }
    navHistory.pop();
    const prev=navHistory[navHistory.length-1]||'home';
    activate(prev);
    syncNav30();
    try{window.MesHeuresAndroid?.setCurrentTab?.(prev)}catch(e){}
    dirty.add(prev);
    schedule('back');
    return true;
  }

  async function notifySystem(title,body,tag){try{if('Notification' in window&&Notification.permission==='granted'){new Notification(title,{body,tag});return true}const reg=await navigator.serviceWorker?.ready;if(reg?.showNotification)return reg.showNotification(title,{body,tag});}catch(e){}return false}

  let lastLiveMinute=-1;
  function liveTick(){
    liveTimer=0;
    if(document.visibilityState!=='visible')return;
    const active=!!safe(()=>window.MH30Live?.active?.(),'live-active');
    if(!active)return;
    const now=new Date(), minute=now.getMinutes();
    safe(()=>window.MH30Live?.render?.(),'live-render');
    try{const r=window.MH30DataEngine?.day(today())||{};const due=!!(Number(r.tte||0)>=360&&Number(r.pz||0)<20);if(due&&!window.__mh30PauseNotified){window.__mh30PauseNotified=true;notifySystem('MesHeures — pause obligatoire','20 min de pause à prévoir : le seuil de 6 h de TTE est atteint.','mh30-pause');}if(!due)window.__mh30PauseNotified=false;}catch(e){}
    if(minute!==lastLiveMinute){ lastLiveMinute=minute; schedule('live-minute'); }
    liveTimer=setTimeout(liveTick,15000);
  }

  function startLive(){if(liveTimer)clearTimeout(liveTimer);liveTimer=0;liveTick()}
  function stopLive(){if(liveTimer){clearTimeout(liveTimer);liveTimer=0}}

  async function registerBackgroundChecks(){
    try{
      if(!('serviceWorker' in navigator))return;
      const reg=await navigator.serviceWorker.ready;
      if('periodicSync' in reg){
        try{await reg.periodicSync.register('mesheures-background-check',{minInterval:6*60*60*1000});}catch(e){/* permission/platform dependent */}
      }
      await syncBackgroundSnapshot(reg);
    }catch(e){console.warn('MesHeures V30 background',e)}
  }
  async function syncBackgroundSnapshot(reg){
    try{
      if(!window.DB||!('indexedDB' in window))return;
      const intel=window.mhV30IntelligenceData?.(); const todayKey=today(); const todayRec=window.MH30DataEngine?.day(todayKey)||{}; const pauseDue=!!(window.MH30Live?.active?.() && Number(todayRec.tte||0)>=360 && Number(todayRec.pz||0)<20); const payload={version:V,updatedAt:new Date().toISOString(),days:DB.days||{},settings:{base:DB.s?.base||0,anchor:mhQuatorzaine.anchor},alerts:{firstRisk:intel?.projection?.firstRisk||null,pauseDue}};
      const req=indexedDB.open('mesheures-v30',1);
      req.onupgradeneeded=()=>{try{req.result.createObjectStore('state')}catch(e){}};
      req.onsuccess=()=>{try{const db=req.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put(payload,'snapshot');}catch(e){}};
    }catch(e){}
  }
  function scheduleBackgroundSnapshot(){try{syncBackgroundSnapshot()}catch(e){}}

  function boot(){
    if(booted)return; booted=true;
    document.documentElement.dataset.mhVersion=V;
    if($('mhVersion'))$('mhVersion').textContent='V37.1.0';
    document.title='MesHeures V37.1.0';
    patchSave();
    if(window.__mh30PendingRefresh){ const pending=window.__mh30PendingRefresh; delete window.__mh30PendingRefresh; schedule(pending); }
    /* V30 est l’unique propriétaire du runtime. */
    try{if(window.MH30Live?.tick){clearInterval(window.MH30Live.tick);window.MH30Live.tick=null}}catch(e){}
    window.renderHome=renderHome;
    /* Final compatibility boundary: legacy renderAll callers are routed into the
       reactive scheduler instead of executing the historical full redraw chain. */
    window.renderAll=function(reason){ return schedule(reason||'legacy-renderAll'); };
    window.MH30={version:V,navigate:navigation,goBack:goBack,refresh:(reason)=>schedule(reason||'refresh'),invalidate:r=>window.MH30DataEngine?.invalidate?.(r),stats:()=>window.MH30DataEngine?.stats?.()};
    window.tab=navigation;
    buildAnalysis();
    buildNav30();
    activate(window.curTab||'home');
    syncNav30();
    try{window.MesHeuresAndroid?.setCurrentTab?.(window.curTab||'home')}catch(e){}
    dirty=new Set(SECTIONS.filter(x=>$('s-'+x)));
    schedule('boot');
    startLive();
    registerBackgroundChecks();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){window.MH30DataEngine?.invalidate?.('visibility');schedule('visibility');startLive()}else stopLive()});
    window.addEventListener('pageshow',()=>{window.MH30DataEngine?.invalidate?.('pageshow');schedule('pageshow');startLive()});
    window.addEventListener('pagehide',stopLive);
    document.addEventListener('mh:state-changed',()=>{window.MH30DataEngine?.invalidate?.('event');schedule('event')});
    /* V31.1.0: tactile retour de secours */
    let touchX=0,touchY=0;
    document.addEventListener('touchstart',e=>{
      const t=e.touches?.[0];
      if(!t)return;
      touchX=t.clientX;
      touchY=t.clientY;
    },{passive:true});

    document.addEventListener('touchend',e=>{
      const t=e.changedTouches?.[0];
      if(!t)return;
      const dx=t.clientX-touchX;
      const dy=t.clientY-touchY;
      const target=e.target;
      const blocked=target?.closest?.('input,textarea,select,[contenteditable="true"],.mh30-bars');

      if(touchX<=42 && dx>=70 && Math.abs(dx)>Math.abs(dy)*1.35 && !blocked){
        window.MH30?.goBack?.();
      }
    },{passive:true});

  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);


'use strict';
/* V37.0-D : PDF probatoire signé.
   Causes du PDF vide : (1) les données étaient lues dans window.DB, jamais exposé (DB est un « let » global) : dossier sans contenu ;
   (2) le flux PDF était entouré de « \\n » littéraux au lieu de vrais sauts de ligne : contenu de page illisible, page blanche ;
   (3) l'enregistrement passait par <a download>, ignoré par le WebView Android : aucun fichier.
   Désormais : données et mise en page par MHDossier (app-v37-dossier.js, lecture seule, moteur existant),
   enregistrement par le pont natif binaire (mhDownloadBinary). window.DB n'est pas réactivé. */
const PDF_V='37.1.0';
async function sha(bytes){const h=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function keypair(){const k='mh30-signing-key';return new Promise((resolve,reject)=>{const r=indexedDB.open('mesheures-v30-keys',1);r.onupgradeneeded=()=>{try{r.result.createObjectStore('keys')}catch(e){}};r.onerror=()=>reject(r.error);r.onsuccess=async()=>{try{const db=r.result,tx=db.transaction('keys','readonly'),st=tx.objectStore('keys'),g=st.get(k);g.onsuccess=async()=>{if(g.result){resolve(g.result);return}const kp=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const pub=await crypto.subtle.exportKey('jwk',kp.publicKey),priv=await crypto.subtle.exportKey('jwk',kp.privateKey);const w=db.transaction('keys','readwrite');w.objectStore('keys').put({pub,priv},k);resolve({pub,priv})}}catch(e){reject(e)}}})}
async function sign(hash){const kp=await keypair();const priv=await crypto.subtle.importKey('jwk',kp.priv,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},priv,new TextEncoder().encode(hash));return {algorithm:'ECDSA-P256-SHA256',hashAlgorithm:'SHA-256',hash,signature:btoa(String.fromCharCode(...new Uint8Array(sig))),publicKeyJwk:kp.pub,signedAt:new Date().toISOString(),note:'Signature detachee du PDF; verifier avec la cle publique et l empreinte SHA-256.'}}
window.mhV30ExportSignedPDF=async function(){
  try{
    if(!window.MHDossier)throw new Error('module dossier absent');
    if(!window.crypto||!crypto.subtle)throw new Error('empreinte SHA-256 indisponible sur cet appareil');
    const d=window.MHDossier.data(),canon=window.MHDossier.canonical(d),dataHash=await sha(new TextEncoder().encode(canon));
    const pdf=window.MHDossier.pdf(d,{dataHash}),pdfHash=await sha(pdf),sig=await sign(pdfHash),date=today();
    const name='MesHeures-dossier-probatoire-'+date;
    const proof={...sig,version:PDF_V,document:name+'.pdf',pdfSha256:pdfHash,pages:pdf.pageCount,
      dataSha256:dataHash,dataCanonicalization:'JSON.stringify(dossier)',dossier:d,
      note:'Signature ECDSA détachée de l’empreinte SHA-256 du PDF. dataSha256 = SHA-256 de JSON.stringify(dossier), imprimée dans le PDF.'};
    const mode=window.mhDownloadBinary(name+'.pdf',pdf,'application/pdf');
    window.mhDownloadBinary(name+'.sig.json',new TextEncoder().encode(JSON.stringify(proof,null,2)),'application/json');
    alert((mode==='android'?'📁 Choisis où enregistrer le PDF, puis le fichier de signature.\n':'✅ PDF probatoire exporté.\n')+
      'Pages : '+pdf.pageCount+'\nEmpreinte SHA-256 du PDF : '+pdfHash+'\nEmpreinte des données : '+dataHash);
    return {mode,pages:pdf.pageCount,pdfHash,dataHash};
  }catch(e){alert('❌ Export PDF signé impossible : '+e.message);return null}
};
window.mhV30DossierRefresh=function(){};

})();
