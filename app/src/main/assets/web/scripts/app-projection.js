/* MesHeures — projection planning-aware */
(function(){
  function currentPeriodStart(){
    const anchor=DB?.s?.anchor||today();
    const diff=nDays(anchor,today());
    return addD(anchor,Math.floor(diff/14)*14);
  }
  function recentAverage(start){
    const vals=[];
    const begin=addD(start,-56), end=addD(start,-1);
    Object.keys(DB.days||{}).filter(k=>k>=begin&&k<=end).sort().forEach(k=>{
      const d=DB.days[k]; if(!d||!['T','NUIT'].includes(d.t))return;
      const r=cd(k); if(r.tte>0) vals.push(r.tte);
    });
    if(!vals.length)return 0;
    vals.sort((a,b)=>a-b);
    const trimmed=vals.length>4?vals.slice(1,-1):vals;
    return Math.round(trimmed.reduce((a,b)=>a+b,0)/trimmed.length);
  }
  window.mhProjection=function(start,nb){
    start=start||currentPeriodStart(); nb=nb||1;
    const end=addD(start,nb*14-1), now=today();
    const calcEnd=now<end?now:end;
    let actual=0, actualDays=0;
    for(let i=0;i<nb*14;i++){
      const k=addD(start,i); if(k>calcEnd)break;
      const r=cd(k); actual+=r.tte; if(r.trav)actualDays++;
    }
    const avg=recentAverage(start);
    let planned=0, plannedDays=0, estimatedDays=0, unknownDays=0;
    for(let i=0;i<nb*14;i++){
      const k=addD(start,i); if(k<=calcEnd)continue;
      const d=DB.days[k];
      if(!d){unknownDays++;continue;}
      if(['T','NUIT'].includes(d.t)){
        plannedDays++;
        const r=cd(k);
        if(r.tte>0)planned+=r.tte;
        else if(avg>0){planned+=avg;estimatedDays++;}
        else unknownDays++;
      }
    }
    const projected=actual+planned;
    const threshold=(DB.s.base||35)*120*nb;
    return {start,end,actual,actualDays,planned,plannedDays,estimatedDays,unknownDays,projected,threshold,margin:threshold-projected,avg};
  };
})();
