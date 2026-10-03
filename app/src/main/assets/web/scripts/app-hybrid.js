/* MesHeures V30 — Hybrid Core.
   UI bridge only: all métier/calculation logic remains in the canonical JS engine. */
(function(){
  const V='30.2.5';
  function bridge(){return window.MesHeuresAndroid||null}
  function capabilities(){
    try{
      const b=bridge();
      if(!b||typeof b.capabilities!=='function')return null;
      return JSON.parse(b.capabilities());
    }catch(e){return null}
  }
  function openNative(){
    const b=bridge();
    if(b&&typeof b.openNativeDashboard==='function')b.openNativeDashboard();
    else alert('Le dashboard natif est disponible uniquement dans l’application Android V22.');
  }
  function render(){
    const host=document.getElementById('mhHybrid');
    if(!host)return;
    const c=capabilities();
    host.innerHTML=`<div class="card mh-hybrid-card">
      <div class="section-head"><h2>⚡ MesHeures Hybrid Core</h2><span class="period-pill">V${V}</span></div>
      <p class="mut">Le moteur métier reste unique. Android fournit désormais une couche native dédiée aux fonctions système et aux futurs écrans Compose.</p>
      <div class="mh-v19-kpis"><div><b>${c?'OK':'WEB'}</b><span>Bridge Android</span></div><div><b>${c?.nativeDashboard?'OK':'—'}</b><span>Dashboard natif</span></div><div><b>${c?.widgetBridge?'OK':'—'}</b><span>Widget</span></div><div><b>${c?.fileExport?'OK':'—'}</b><span>Fichiers</span></div></div>
      ${c?.nativeDashboard?'<button class="b" style="width:100%;margin-top:9px" onclick="mhOpenNativeDashboard()">📱 Ouvrir le Dashboard natif</button>':''}
    </div>`;
  }
  window.mhOpenNativeDashboard=openNative;
  window.mhCapabilities=capabilities;
  function inject(){
    if(document.getElementById('mhHybrid'))return;
    const host=document.createElement('section');host.id='mhHybrid';
    const target=document.getElementById('s-home')||document.getElementById('s-reg')||document.body;
    target.appendChild(host);render();
  }
  function boot(){inject();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
