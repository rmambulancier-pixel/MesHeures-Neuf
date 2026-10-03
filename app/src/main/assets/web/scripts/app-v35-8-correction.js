/*
 * MesHeures V35.8.0 — correction métier ciblée
 *
 * 1. Amplitude = strictement fin - début, jamais une valeur dérivée.
 * 2. IDAJ = somme des minutes au-delà de 12 h par journée.
 * 3. >12 h : contrôle IDAJ / conditions d'extension.
 * 4. >14 h : contrôle du cadre conventionnel 14 h.
 * 5. >15 h : dépassement de la limite réglementaire applicable aux
 *    prolongations prévues par R3312-30.
 * 6. RC local majoré et RC ROMI1 sont séparés : ils ne sont jamais
 *    présentés comme le même indicateur.
 */
(function(){
  'use strict';
  if(window.__MH35_8_CORRECTION__) return;
  window.__MH35_8_CORRECTION__=true;

  function n(v,d){
    var x=Number(v);
    return Number.isFinite(x)?x:(d||0);
  }

  function hm(m){
    m=Math.max(0,Math.round(n(m)));
    return Math.floor(m/60)+'h'+String(m%60).padStart(2,'0');
  }

  function parseTime(v){
    if(typeof v!=='string') return null;
    var m=v.trim().match(/^(\d{1,2}):(\d{2})$/);
    if(!m) return null;
    var h=+m[1], mi=+m[2];
    if(h>23||mi>59) return null;
    return h*60+mi;
  }

  function exactAmplitude(d){
    var a=parseTime(d&&d.deb), b=parseTime(d&&d.fin);
    if(a==null||b==null) return null;
    if(b<=a) b+=1440;
    return b-a;
  }

  function levelForAmp(amp){
    if(amp>900) return 'b';
    if(amp>840) return 'w';
    if(amp>720) return 'w';
    return null;
  }

  function ampMessage(amp){
    if(amp>900)
      return 'Amplitude '+hm(amp)+' : dépasse 15 h — prolongation réglementaire à documenter.';
    if(amp>840)
      return 'Amplitude '+hm(amp)+' : dépasse 14 h conventionnelles — vérifier le cas d’extension applicable jusqu’à 15 h.';
    if(amp>720)
      return 'Amplitude '+hm(amp)+' : dépasse 12 h — IDAJ et conditions d’extension à vérifier.';
    return null;
  }

  function patchEngine(){
    var E=window.MH30DataEngine;
    if(!E || typeof E.day!=='function') return false;
    if(E.day.__mh358) return true;

    var original=E.day;
    var wrapped=function(k){
      var r=original.call(this,k);
      try{
        var d=window.DB && DB.days ? DB.days[k] : null;
        var amp=exactAmplitude(d);

        if(amp!=null && r && typeof r==='object'){
          r=Object.assign({},r);
          r.amp=amp;

          /*
           * IDAJ conventionnel : durée d’amplitude au-delà de 12 h.
           * On recalcule la valeur journalière depuis l’amplitude exacte.
           */
          r.idaj=Math.max(0,amp-720);

          if(Array.isArray(r.al)){
            r.al=r.al.filter(function(a){
              var s=String(a&&a.m||'');
              return !/amplitude/i.test(s);
            });
          }else{
            r.al=[];
          }

          var msg=ampMessage(amp);
          var lvl=levelForAmp(amp);
          if(msg && lvl){
            r.al.push({lvl:lvl,m:msg});
          }
        }
      }catch(e){}
      return r;
    };

    wrapped.__mh358=true;
    E.day=wrapped;
    return true;
  }

  function refresh(){
    try{
      if(typeof renderAll==='function') renderAll();
      else if(typeof renderDay==='function') renderDay();
    }catch(e){}
  }

  /*
   * Corrige les libellés du bloc RC existant sans toucher aux données.
   * Le calcul local 72h45 reste disponible, mais il est explicitement
   * présenté comme équivalent RC majoré, pas comme "RC acquis bulletin".
   */
  function fixRcLabels(){
    /*
     * V36 FINAL :
     * Le bloc RC officiel est désormais rendu par app-ui.js.
     * Cet ancien script ne doit plus recréer un deuxième résumé RC.
     *
     * On supprime uniquement les anciens encarts textuels connus.
     * Aucun calcul ni aucune donnée DB ne sont modifiés.
     */
    try{
      var root=document.getElementById('s-paie')||document.body;
      if(!root)return;

      root.querySelectorAll('.al').forEach(function(el){
        var t=String(el.innerText||el.textContent||'');
        if(
          /Valeur des HS converties en RC/i.test(t) ||
          /Valeur du solde RC référencé/i.test(t) ||
          /Valeur théorique des HS converties en RC/i.test(t) ||
          /Solde RC théorique.*cumul/i.test(t)
        ){
          el.remove();
        }
      });

      var old=document.getElementById('mh358-romi-rc-reference');
      if(old)old.remove();
    }catch(e){}
  }

  function boot(){
    if(!patchEngine()){
      setTimeout(boot,250);
      return;
    }
    refresh();
    setTimeout(fixRcLabels,50);
    setTimeout(fixRcLabels,250);
    setTimeout(fixRcLabels,700);
  }

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  else
    setTimeout(boot,0);
})();
