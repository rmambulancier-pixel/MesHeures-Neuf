/* MesHeures V30.0.0 — persistance locale + synchronisation widget Android. */
function save(){
  let persisted=false;
  try{localStorage.setItem(LS,JSON.stringify(DB));persisted=true}
  catch(e){alert('Stockage plein : exportez vos données !\n'+e.message)}
  if(persisted&&window.MH30DataEngine)window.MH30DataEngine.invalidate('save');
  pushWidgetData();
}

/* Le widget est un miroir : toutes les valeurs viennent des fonctions de calcul
   existantes. Aucun calcul légal ou paie n'est réimplémenté côté Android. */
function pushWidgetData(){
  try{
    if(!window.MesHeuresAndroid||typeof window.MesHeuresAndroid.updateWidgetData!=='function')return false;
    if(typeof DB==='undefined'||typeof today!=='function')return false;
    const k=today(), ym=k.slice(0,7);
    const r=(typeof cd==='function')?cd(k):null;
    const m=(typeof mhMonthStats==='function')?mhMonthStats(ym):null;

    // SOURCE UNIQUE : le moteur MesHeures. Android ne recalcule rien.
    let weekMin=0;
    if(typeof mono==='function'&&typeof cd==='function'){
      const ws=mono(k);
      for(let x=ws;x<=addD(ws,6);x=addD(x,1))weekMin+=Math.round(cd(x)?.tte||0);
    }

    let periodMin=0,periodH25=0,periodH50=0,grossCents=null,netCents=null;
    let payReady=false;
    try{
      const ps=DB.per||{}, start=ps.start||DB.s?.anchor||'2025-05-19';
      const nb=Math.max(2,Math.min(3,Math.round(Number(ps.nb)||2)));
      if(typeof calcPer==='function'&&typeof brutOf==='function'){
        const result=calcPer(start,nb), G=result.G||{};
        periodMin=Math.round(Number(G.tte)||0);
        periodH25=Math.round(Number(G.h25)||0);
        periodH50=Math.round(Number(G.h50)||0);
        // Prefer the canonical summary exposed by the pay engine.
        let sum=null;
        try{sum=(typeof window.mhCurrentPaySummary==='function')?window.mhCurrentPaySummary():null}catch(e){sum=null}
        if(sum&&Number.isFinite(Number(sum.grossEst))){
          grossCents=Math.round(Number(sum.grossEst)*100);
          if(Number.isFinite(Number(sum.netEst)))netCents=Math.round(Number(sum.netEst)*100);
          payReady=true;
        }else{
          const br=brutOf(G);
          if(br&&Number.isFinite(Number(br.tot))){
            grossCents=Math.round(Number(br.tot)*100);
            const net=Number(br.tot)*Number(DB.s?.net||0)+Number(br.panIR||0)+Number(br.panIRU||0);
            if(Number.isFinite(net))netCents=Math.round(net*100);
            payReady=Number.isFinite(grossCents)&&(netCents!==null);
          }
        }
      }
    }catch(e){console.warn('Widget paie',e)}

    // Si un bulletin du mois courant existe, le réel prime sur l'estimation.
    try{
      const bs=Array.isArray(DB.bulletins)?DB.bulletins.filter(b=>b&&String(b.mois||'')===ym):[];
      const b=bs.length?bs[bs.length-1]:null;
      if(b&&Number.isFinite(Number(b.brut)))grossCents=Math.round(Number(b.brut)*100);
      if(b&&Number.isFinite(Number(b.net)))netCents=Math.round(Number(b.net)*100);
    }catch(e){console.warn('Widget bulletin',e)}

    let rcSoldeMin=0;
    try{
      const keys=Object.keys(DB.romi||{}).filter(k=>DB.romi[k]&&Number.isFinite(Number(DB.romi[k].rcSolde))).sort();
      if(keys.length) rcSoldeMin=Math.round(Number(DB.romi[keys[keys.length-1]].rcSolde)*60);
      if(!rcSoldeMin && typeof calcPer==='function' && typeof gb==='function'){
        const ps=DB.per||{}, start=ps.start||DB.s?.anchor||k, nb=Math.max(2,Math.min(3,Math.round(Number(ps.nb)||2)));
        const G=calcPer(start,nb).G||{}, B=gb(start), d25=Math.max((Number(G.h25)||0)/60-(Number(B.p25)||0),0), d50=Math.max((Number(G.h50)||0)/60-(Number(B.p50)||0),0);
        rcSoldeMin=Math.round(((Number(B.rcOld)||0)+d25*1.25+d50*1.5)*60);
      }
    }catch(e){console.warn('Widget RC',e)}

    let nextDayLabel='Aucune journée planifiée', nextDayHours='';
    try{
      for(let i=1;i<=180;i++){
        const nk=addD(k,i), d=DB.days?.[nk];
        if(!d || d.t==='REPOS') continue;
        const labels={T:'Travail',NUIT:'Nuit',CP:'Congé payé',MAL:'Maladie',RC:'Repos compensateur',REPOS:'Repos'};
        const parts=nk.split('-');
        nextDayLabel=`${parts[2]}/${parts[1]} · ${labels[d.t]||d.t||'Journée'}`;
        if(d.t==='T' || d.t==='NUIT') nextDayHours=(d.deb&&d.fin)?`${d.deb} → ${d.fin}`:'';
        break;
      }
    }catch(e){console.warn('Widget planning',e)}

    let marginMin=null;
    try{
      const intel=(typeof window.mhV30IntelligenceData==='function')?window.mhV30IntelligenceData():null;
      if(intel&&intel.projection&&typeof intel.projection.margin==='number')marginMin=Math.round(intel.projection.margin);
    }catch(e){}

    let work=0,rest=0,cp=0,mal=0;
    try{
      const last=lastDayOfMonth(ym);
      for(let i=1;i<=last;i++){
        const d=DB.days[ym+'-'+String(i).padStart(2,'0')];
        if(!d)continue;
        if(d.t==='T'||d.t==='NUIT')work++;
        else if(d.t==='CP')cp++;
        else if(d.t==='MAL')mal++;
        else rest++;
      }
    }catch(e){}

    const type=DB.days[k]?.t||'REPOS';
    const payload={
      dateISO:k,
      monthLabel:(['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][Number(k.slice(5,7))-1]||ym)+' '+k.slice(0,4),
      dayIndex:Number(k.slice(8)),monthDays:Number(lastDayOfMonth(ym)),todayType:type,
      tteJourMin:r?Math.round(r.tte||0):0,tteMoisMin:m?Math.round(m.tte||0):0,
      tteSemaineMin:weekMin,ttePeriodeMin:periodMin,hs25PeriodeMin:periodH25,hs50PeriodeMin:periodH50,
      workCount:work,restCount:rest,cpCount:cp,malCount:mal,
      margeAvant46hMin:marginMin,alertesMois:m?(m.alerts||[]).length:0,
      grossCents,netCents,netLabel:'Net estimé',paySource:payReady?'MesHeures':'indisponible',payReady,
      rcSoldeMin,nextDayLabel,nextDayHours,
      timerRunning:!!(DB.days?.[k]?.running),
      timerStartEpoch:Number(DB.days?.[k]?.startEpoch||0),
      timerStart:DB.days?.[k]?.deb||'',
      timerElapsedMin:(DB.days?.[k]?.running&&DB.days?.[k]?.startEpoch)?Math.max(0,Math.floor((Date.now()-Number(DB.days[k].startEpoch))/60000)):0,
      updatedAt:Date.now()
    };
    window.MesHeuresAndroid.updateWidgetData(JSON.stringify(payload));
    return true;
  }catch(e){console.warn('Widget MesHeures',e);return false}
}

/* Le WebView peut démarrer avant que toutes les couches de calcul soient prêtes.
   On retente brièvement : cela évite qu'un premier payload incomplet fige le widget. */
function scheduleWidgetSync(){
  const delays=[0,250,750,1500,3000,5000,8000,12000];
  delays.forEach(ms=>setTimeout(()=>{try{pushWidgetData()}catch(e){}},ms));
}
window.mhForceWidgetSync=scheduleWidgetSync;
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleWidgetSync()});
window.addEventListener('pageshow',scheduleWidgetSync);

function lastDayOfMonth(ym){
  const [y,m]=String(ym).split('-').map(Number);
  return new Date(y,m,0).getDate();
}

function load(){
  try{
    const r=JSON.parse(localStorage.getItem(LS));
    if(r){
      DB={...DB,...r};
      DB.s={...DEF,...(r.s||{})};
      DB.per={...DB.per,...(r.per||{})};
      DB.periods=r.periods||[];
      DB.bul=r.bul||{};
      DB.bulletins=r.bulletins||[];
      DB.romi=r.romi||{};
      DB.constats=Array.isArray(r.constats)?r.constats:[];
      DB.events=Array.isArray(r.events)?r.events:[];
      DB.reconciliation=Array.isArray(r.reconciliation)?r.reconciliation:[];
    }
  }catch(e){console.warn('Chargement local impossible',e)}
  scheduleWidgetSync();
}
