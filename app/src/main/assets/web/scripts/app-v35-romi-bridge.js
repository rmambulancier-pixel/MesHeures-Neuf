
/* ============================================================
 * V36 FINAL — SOURCE UNIQUE ROMI1
 *
 * Le ROMI1 enregistré est stocké dans :
 *     localStorage["mh_romi_records"]
 *
 * Le rapprochement doit utiliser exactement cette même source.
 * Aucun RC n'est calculé ou inventé ici.
 * ============================================================ */
function getActiveRomiList(){
    try{
        const raw=localStorage.getItem('mh_romi_records')||'[]';
        const parsed=JSON.parse(raw);

        const list=Array.isArray(parsed)
            ? parsed
            : Object.values(parsed||{});

        return list
            .filter(Boolean)
            .map(item=>{
                const start=item.start
                    || item.periodStart
                    || item.dateDebut
                    || null;

                const end=item.end
                    || item.periodEnd
                    || item.dateFin
                    || null;

                return {
                    ...item,

                    start:start,
                    end:end,

                    tte:item.tte!=null
                        ? Number(item.tte)
                        : (item.totalTTE!=null
                            ? Number(item.totalTTE)
                            : null),

                    hs:item.hs!=null
                        ? Number(item.hs)
                        : (item.totalHS!=null
                            ? Number(item.totalHS)
                            : null),

                    /*
                     * IMPORTANT :
                     * Le RC cumulé vient directement du ROMI1.
                     * Aucun montant par défaut.
                     * Aucun recalcul à partir de valeurs arrondies.
                     */
                    rcSolde:
                        item.rcCumule!=null
                            ? Number(item.rcCumule)
                            : (
                                item.rc_cumule!=null
                                    ? Number(item.rc_cumule)
                                    : (
                                        item.rcSolde!=null
                                            ? Number(item.rcSolde)
                                            : (
                                                item.rc!=null
                                                    ? Number(item.rc)
                                                    : null
                                            )
                                    )
                            )
                };
            });
    }catch(e){
        console.error('V36 ROMI1 getActiveRomiList:',e);
        return [];
    }
}

/* MesHeures ROMI MASTER 35.1 · bridge source de vérité
 * Le MASTER reste propriétaire de la lecture PDF.
 * Ce bridge ne relit rien et ne recalcule rien : il synchronise le JSON canonique
 * vers l'ancien format DB.romi pour les modules Paie/Analyse encore compatibles.
 */
(function(root){
'use strict';
const V='35.1.0';
const MAP={
  ttePeriodH:'tteH',presenceDays:'joursPresence',hsPeriodH:'hsPeriodeH',
  tteYearH:'tteAnneeH',hsYearH:'hsAnneeH',presenceYearDays:'joursAnnee',
  cpN1PreviousBalance:'cpN1SoldeOuverture',cpN1Acquired:'cpN1Acquis',
  cpN1Taken:'cpN1Pris',cpN1Balance:'cpN1Solde',
  cpNPreviousBalance:'cpNSoldeOuverture',cpNAcquired:'cpNAcquis',
  cpNTaken:'cpNPriS',cpNBalance:'cpNSolde',
  rcPreviousH:'rcAvant',rcAcquiredH:'rcAcquis',rcTakenH:'rcPris',rcBalanceH:'rcSolde',
  salaryBaseH:'salaireBaseH',amplitudeOverH:'depAmplH',
  hs125EligibleH:'hs125EligH',hs125PaidH:'hs125PayeesH',hs125ToRcH:'hs125RcH',
  hs150EligibleH:'hs150EligH',hs150PaidH:'hs150PayeesH',hs150ToRcH:'hs150RcH',
  seniorityPct:'primeAncPct',habillageEur:'habillageMontant',
  mealCount:'indemniteRepasN',uniqueMealCount:'indemniteRepasUniqueN'
};
function latest(){
  if(!root.MH_ROMI||typeof root.MH_ROMI.list!=='function') return null;
  const a=root.MH_ROMI.list().filter(Boolean).sort((x,y)=>String(y.periodEnd||'').localeCompare(String(x.periodEnd||'')));
  return a[0]||null;
}
function all(){return root.MH_ROMI&&typeof root.MH_ROMI.list==='function'?root.MH_ROMI.list():[]}
function mapRecord(r){
  if(!r)return null;
  const d={
  periodStart:r.periodStart||null,
  periodEnd:r.periodEnd||null,
  // Compatibilité avec les modules V36 qui utilisent start/end.
  start:r.periodStart||null,
  end:r.periodEnd||null,
  source:'ROMI1 MASTER',
  engine:'35.0.0'
};
  Object.keys(MAP).forEach(k=>{d[MAP[k]]=Object.prototype.hasOwnProperty.call(r,k)?r[k]:null});
  // clés canoniques conservées pour les nouveaux modules
  d.master={...r};
  return d;
}
function syncOne(r){
  if(!r||!root.DB||typeof root.DB!=='object') return {ok:false,reason:'DB indisponible'};
  const mapped=mapRecord(r),key=(r.periodStart||'')+'_'+(r.periodEnd||'');
  root.DB.romi=root.DB.romi&&typeof root.DB.romi==='object'?root.DB.romi:{};
  root.DB.romi[key]=mapped;
  try{if(typeof root.saveDB==='function')root.saveDB()}catch(e){}
  return {ok:true,key,record:mapped};
}
function syncLatest(){return syncOne(latest())}

/*
 * V36 FINAL — synchronisation automatique du MASTER vers DB.romi.
 * Nécessaire après un redémarrage lorsque le ROMI1 est déjà enregistré.
 */
function autoSync(){
  try{
    if(root.MH_ROMI && root.DB && typeof root.MH_ROMI.list==='function'){
      const a=root.MH_ROMI.list().filter(Boolean);
      a.forEach(syncOne);
      return true;
    }
  }catch(e){}
  return false;
}

(function(){
  let n=0;
  const timer=setInterval(function(){
    n++;
    if(autoSync() || n>=50) clearInterval(timer);
  },200);
})();
function diagnostics(){
  const r=latest(), d=r?mapRecord(r):null;
  return {version:V,masterAvailable:!!root.MH_ROMI,dbAvailable:!!root.DB,latest:r?{periodStart:r.periodStart,periodEnd:r.periodEnd,tte:r.ttePeriodH,hs:r.hsPeriodH,rc:r.rcBalanceH}:null,mapped:d?{tteH:d.tteH,hsPeriodeH:d.hsPeriodeH,rcSolde:d.rcSolde}:null};
}
root.MH_ROMI_BRIDGE={version:V,mapRecord,syncOne,syncLatest,latest,all,diagnostics};
})(typeof window!=='undefined'?window:globalThis);
