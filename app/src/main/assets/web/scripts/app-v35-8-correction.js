/*
 * MesHeures V35.8.0 — correction d'affichage RC
 *
 * RC local majoré et RC ROMI1 sont séparés : ils ne sont jamais
 * présentés comme le même indicateur. Ce fichier ne touche plus au moteur
 * de calcul depuis V37.0-0.
 */
(function(){
  'use strict';
  if(window.__MH35_8_CORRECTION__) return;
  window.__MH35_8_CORRECTION__=true;

  /*
   * V37.0-0 : l'ancien patchEngine() remplaçait MH30DataEngine.day pour recalculer
   * amplitude et IDAJ depuis deb/fin quel que soit le type de journée (CP, REPOS…),
   * avec un seuil IDAJ de 12 h en dur. Il était inerte (il lisait window.DB, absent),
   * mais aurait faussé la paie dès que DB aurait été exposé. Retiré : le moteur
   * app-core.js (cdRaw) reste l'unique calcul d'amplitude, d'IDAJ et des alertes.
   */

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
