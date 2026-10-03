/* MesHeures — référentiel légal transport sanitaire, vérifié le 11/09/2026 */
(function(){
  window.MH_LEGAL={
    version:'2026-09-11',
    ccn:'CCN transports routiers et activités auxiliaires du transport — IDCC 0016',
    transportSanitaire:'Accord du 16 juin 2016 relatif à la durée et à l’organisation du travail dans les activités du transport sanitaire',
    rules:{
      pause20:{value:20,label:'Pause minimale de 20 min dès 6 h de travail effectif',source:'Code du travail, art. L3121-16',url:'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020444'},
      ampNormal:{value:12,label:'Amplitude ambulancier : 12 h en principe',source:'Accord transport sanitaire du 16/06/2016, art. 3',url:'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000033415265'},
      ampMax:{value:14,label:'Amplitude pouvant atteindre 14 h dans les cas prévus',source:'Accord transport sanitaire du 16/06/2016, art. 3',url:'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000033415265'},
      tteDaily:{value:10,label:'Durée quotidienne maximale de TTE : 10 h, avec dépassement encadré jusqu’à 12 h',source:'Accord transport sanitaire du 16/06/2016, art. 4',url:'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000033415266'},
      weeklyMax:{value:48,label:'Maximum hebdomadaire : 48 h',source:'Accord transport sanitaire du 16/06/2016, art. 4',url:'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000033415266'},
      weeklyAvg12:{value:46,label:'Maximum moyen : 46 h sur 12 semaines consécutives',source:'Accord transport sanitaire du 16/06/2016, art. 4',url:'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000033415266'},
      dailyRest:{value:11,label:'Repos quotidien immédiatement suivant une amplitude > 12 h : au moins 11 h',source:'Accord transport sanitaire du 16/06/2016, art. 7',url:'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000033415274'},
      sundayHoliday:{value:23.90,label:'Indemnité dimanche/jour férié ambulanciers',source:'Avenant n°8 du 06/05/2025, applicable au 01/06/2025',url:'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000052051828'},
      smic:{value:12.31,label:'SMIC horaire brut au 01/06/2026',source:'Service-Public, arrêté du 22 mai 2026',url:'https://www.service-public.fr/particuliers/vosdroits/F2300'},
      ccnMin:{n1:11.89,n2:11.90,n3:12.79,source:'Avenant n°8 du 06/05/2025, étendu par arrêté du 22/07/2025'}
    }
  };
  window.mhLegalAudit=function(start,nb){
    const out=[]; const weeks={}; const end=addD(start,nb*14-1);
    const auditBegin=addD(start,-77);
    const auditFinish=end;
    for(let i=0;i<=nDays(auditBegin,auditFinish);i++){
      const k=addD(auditBegin,i); const r=cd(k);
      if(r.tte) { const wk=mono(k); weeks[wk]=(weeks[wk]||0)+r.tte; }
    }
    for(let i=0;i<nb*14;i++){
      const k=addD(start,i),r=cd(k); if(!r.tte&&!r.amp)continue;
      if(r.tte>=360&&r.pz<20)out.push({k,lvl:'b',m:'Pause minimale de 20 min à contrôler dès 6 h de TTE.',rule:'L3121-16'});
      if(r.amp>12&&r.amp<=14)out.push({k,lvl:'w',m:'Amplitude > 12 h : vérifier le motif permettant l’extension conventionnelle.',rule:'CCN transport sanitaire art. 3'});
      if(r.amp>14)out.push({k,lvl:'b',m:'Amplitude > 14 h : dépassement à vérifier impérativement.',rule:'CCN transport sanitaire art. 3'});
      if(r.tte>600&&r.tte<=720)out.push({k,lvl:'w',m:'TTE > 10 h : dépassement quotidien encadré à justifier.',rule:'CCN transport sanitaire art. 4'});
      if(r.tte>720)out.push({k,lvl:'b',m:'TTE > 12 h : dépassement quotidien au-delà de la limite conventionnelle.',rule:'CCN transport sanitaire art. 4'});
    }
    Object.entries(weeks).forEach(([wk,v])=>{if(v>2880)out.push({k:wk,lvl:'b',m:'Semaine > 48 h : '+F(v),rule:'CCN transport sanitaire art. 4'});});
    const weeksSorted=Object.keys(weeks).sort();
    const targetFirst=mono(start), targetLast=mono(end);
    for(let i=0;i<=weeksSorted.length-12;i++){
      const windowWeeks=weeksSorted.slice(i,i+12), w0=windowWeeks[0], w11=windowWeeks[11];
      if(w11<targetFirst || w0>targetLast) continue;
      const vals=windowWeeks.map(k=>weeks[k]||0);
      const avg=vals.reduce((a,b)=>a+b,0)/12;
      if(avg>2760)out.push({k:w0,lvl:'b',m:'Moyenne > 46 h sur 12 semaines : '+F(Math.round(avg))+'/semaine',rule:'CCN transport sanitaire art. 4'});
    }
    return out;
  };
})();
