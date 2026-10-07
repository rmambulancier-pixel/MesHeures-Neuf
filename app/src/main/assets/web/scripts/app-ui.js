// Interface et navigation — MesHeures
function pushUndo(desc){
  _undo={days:JSON.stringify(DB.days),periods:JSON.stringify(DB.periods),desc};
}

function doUndo(){
  if(!_undo)return;
  DB.days=JSON.parse(_undo.days);
  DB.periods=JSON.parse(_undo.periods);
  _undo=null;save();mhRefresh();
  closeModal('undoModal');
}

function closeModal(id){$('undoModal').classList.remove('on')}

function tab(t){
  if(t==='jour' && !curDate){curDate=today();curMonth=curDate.slice(0,7)}
  if(t==='mois' && !curMonth){curMonth=today().slice(0,7);curDate=today()}
  curTab=t;
  ['home','jour','mois','paie','analyse','audit','bul','romi','reg'].forEach(x=>{
    const sec=$('s-'+x),btn=$('t-'+x);
    if(sec)sec.classList.toggle('on',x===t);
    if(btn)btn.classList.toggle('on',x===t);
  });
  window.scrollTo(0,0);
  mhRefresh();
}

// Impression robuste : Android utilise le moteur d'impression natif,
// le navigateur/PWA conserve window.print().
function mhPrint(){
  try{
    if(window.MesHeuresAndroid && typeof window.MesHeuresAndroid.printPage==='function'){
      window.MesHeuresAndroid.printPage();
      return;
    }
  }catch(e){console.warn('Impression Android',e)}
  try{window.print()}catch(e){alert('❌ Impression indisponible : '+e.message)}
}

function goDay(n){curDate=addD(curDate,n);mhRefresh('day-change') }

function goToday(){curDate=today();curMonth=curDate.slice(0,7);mhRefresh('today');window.scrollTo(0,0)}

let mhDayMenuKey=null,mhLongTimer=null,mhLongTriggered=false;
function openDayMenu(k){
  mhDayMenuKey=k; curDate=k; curMonth=k.slice(0,7);
  const d=gd(k),r=cd(k);
  $('dayMenuTitle').textContent=shortY(k)+' · '+(d.t==='T'?'Travail':d.t==='NUIT'?'Nuit':d.t==='CP'?'Congé':d.t==='RC'?'RC':d.t==='MAL'?'Maladie':'Repos');
  $('dayMenuSummary').innerHTML=r.tte?`<b>${F(r.tte)} TTE</b> · ${F(r.amp)} amplitude${r.al.length?` · ⚠️ ${r.al.length} alerte(s)`:''}`:'Aucune heure saisie';
  $('dayDupTarget').value=addD(k,1);
  $('dayMenuModal').classList.add('on');
}
function dayMenuAction(action){
  const k=mhDayMenuKey; if(!k)return;
  if(action==='edit'){closeModal('dayMenuModal');mhOpenDay(k);return;}
  if(action==='detail'){closeModal('dayMenuModal');curDate=k;tab('jour');return;}
  if(action==='clear'){closeModal('dayMenuModal');curDate=k;clearDay();return;}
  if(action==='duplicate'){
    const target=$('dayDupTarget').value; if(!target)return alert('Choisis une date de destination.');
    if(target===k)return alert('La destination doit être différente.');
    const src=DB.days[k]; if(!src)return alert('Cette journée est vide.');
    if(DB.days[target] && DB.days[target].t!=='REPOS' && !confirm('La journée de destination contient déjà des données. Écraser ?'))return;
    pushUndo('Duplication '+short(k)+' → '+short(target));
    DB.days[target]=JSON.parse(JSON.stringify(src)); save(); closeModal('dayMenuModal'); curDate=target;curMonth=target.slice(0,7);tab('jour');
  }
}
function bindMonthLongPress(){
  const host=$('mCal'); if(!host||host.dataset.longpressBound)return; host.dataset.longpressBound='1';
  host.addEventListener('pointerdown',e=>{const b=e.target.closest('button.cel');if(!b)return;const m=b.getAttribute('onclick')?.match(/mhOpenDay\('([^']+)'\)/);if(!m)return;mhLongTriggered=false;mhLongTimer=setTimeout(()=>{mhLongTriggered=true;openDayMenu(m[1])},520)});
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>host.addEventListener(ev,()=>clearTimeout(mhLongTimer)));
  host.addEventListener('click',e=>{if(!mhLongTriggered)return;mhLongTriggered=false;e.preventDefault();e.stopPropagation()},{capture:true});
}


function setD(f,v){
  const d=gd(curDate);
  if(f==='t'&&d.t!==v)pushUndo('Changement type '+d.t+'→'+v+' le '+short(curDate));
  d[f]=v; if(f==='panier')d.mealV=3; save(); mhRefresh('day-field');
}

function setP(i,f,v){const d=gd(curDate);if(!d.p[i])d.p[i]={};d.p[i][f]=v;save();mhRefresh('day-pause');}

function addP(){gd(curDate).p.push({d:'',f:''});save();mhRefresh('day-pause');}

function clearDay(){
  const d=DB.days[curDate];
  if(!d || (d.t==='REPOS'&&!d.deb&&!d.fin&&!d.note&&!d.p?.length)) return;
  if(!confirm('Effacer les données de cette journée ?')) return;
  pushUndo('Effacement du '+short(curDate));
  DB.days[curDate]={t:'REPOS',p:[]};
  save();mhRefresh('day-pause');;
}

function delP(i){gd(curDate).p.splice(i,1);save();mhRefresh('day-pause');}

function dupliConfirm(){
  const prev=DB.days[addD(curDate,-1)];
  if(!prev)return alert('Rien la veille à copier.');
  const d=gd(curDate);
  if(d.t!=='REPOS'||d.deb){
    if(!confirm('Le jour courant a déjà des données. Écraser avec la veille ?'))return;
  }
  pushUndo('Copie veille → '+short(curDate));
  DB.days[curDate]=JSON.parse(JSON.stringify(prev));
  save(); mhRefresh('day-copy');
}

function renderDay(){
  const k=curDate,d=gd(k),r=cd(k);
  const isF=isFerie(k),isD=dowN(k)===0;
  $('dLbl').textContent=dow(k).toUpperCase()+' '+k.slice(8)+' '+MON[+k.slice(5,7)-1]+' '+k.slice(0,4)
    +(isF?' ☀️':'')+(isD&&!isF?' 🔵':'')+(k===today()?' • auj.':'');
  const TYPES={
  T:'Travail',
  REPOS:'Repos',
  NUIT:'Nuit',
  RC:'Repos compensateur',
  CP:'Congés payés',
  MAL:'Maladie',
  FORMATION:'Formation',
  MISE_A_NIVEAU:'Mise à niveau diplôme',
  VISITE_MEDICALE:'Visite médicale',
  REUNION:'Réunion',
  AUTRE_ACTIVITE:'Autre activité'
};
  $('dType').innerHTML=Object.entries(TYPES).map(([x,l])=>
    `<button class="${d.t===x?'on':''}" onclick="setD('t','${x}')">${l}</button>`).join('');
  let h='';
  if(d.t==='T'||d.t==='NUIT'){
    h=`<div class="g2">
<div><label>Début</label><input type="time" value="${d.deb||''}" onchange="setD('deb',this.value)"></div>
<div><label>Fin</label><input type="time" value="${d.fin||''}" onchange="setD('fin',this.value)"></div>
</div>
<div style="margin-top:11px"><label>Pauses</label>`;
    const _mealChoice = typeof mhMealChoice==='function' ? mhMealChoice(d) : (d.panier ?? null);
    const _mealExplicit = Object.prototype.hasOwnProperty.call(d,'panier');
    d.p.forEach((p,i)=>h+=`<div class="pz"><div class="row"><input type="time" value="${p.d||''}" onchange="setP(${i},'d',this.value)" style="flex:1"><input type="time" value="${p.f||''}" onchange="setP(${i},'f',this.value)" style="flex:1"><button class="r" onclick="delP(${i})" style="padding:8px 11px">✕</button></div></div>`);
    h+=`<button class="g" onclick="addP()" style="width:100%">+ Ajouter une pause</button></div>
<div style="margin-top:11px"><label>Panier repas</label>
<div class="chips">
<button class="${!_mealChoice?'on':''}" onclick="setD('panier',null)">Auto</button>
<button class="${_mealChoice==='EXT'?'on':''}" onclick="setD('panier','EXT')">🍽️ Extérieur (IR)</button>
<button class="${_mealChoice==='ENT'?'on':''}" onclick="setD('panier','ENT')">🍽️ Intérieur (IRU)</button>
<button class="${_mealExplicit&&d.panier==='NON'?'on':''}" onclick="setD('panier','NON')">Aucun</button>
</div>
<div class="mut">Extérieur (IR) = repas pris hors du bureau · Intérieur (IRU) = repas pris au bureau. En Auto, l'IR extérieur est compté si le service couvre une plage 11h00–14h30 ou 18h30–22h00.</div>
</div>
<div style="margin-top:11px">
<label style="text-transform:none;font-size:14px;color:var(--txt)">
<input type="checkbox" ${d.fer?'checked':''} onchange="setD('fer',this.checked)"> ☀️ Jour férié travaillé (majoration 100 %)
</label></div>`;
  }
  const stateLabel={T:'Journée travaillée',REPOS:'Repos',NUIT:'Nuit',RC:'Repos compensateur',CP:'Congé payé',MAL:'Maladie'}[d.t]||d.t;
  const stateClass=d.t==='T'?'ok':d.t==='REPOS'?'mut':d.t==='NUIT'?'pur':'warn';
  $('dWork').innerHTML=`<div class="day-state ${stateClass}"><span>${stateLabel}</span>${r.al.length?`<b>⚠️ ${r.al.length} alerte${r.al.length>1?'s':''}</b>`:''}</div>${h}`;
  $('dNote').value=d.note||'';
  $('dKpi').innerHTML=[
    ['Amplitude',F(r.amp)],['TTE',F(r.tte)],['Pauses',F(r.pz)],
    ['IDAJ',r.idaj?F(r.idaj):'—'],['Paniers',(r.ir+r.iru)||'—'],
    ['H. nuit',r.nuit?F(r.nuit):'—']
  ].map(x=>`<div class="kpi"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
  $('dAl').innerHTML=r.al.map(a=>`<div class="al ${a.lvl}">${a.m}</div>`).join('');
  const diff=nDays(DB.s.anchor,k);
  const qs=addD(DB.s.anchor,Math.floor(diff/14)*14);
  const o=calcPer(qs,1).Q[0],N=DB.s.base*120,pc=Math.min(100,o.seuil/N*100);
  const barCls=pc>=100?'bar bad':pc>=85?'bar warn':'bar';
  $('dQuat').innerHTML=`<div class="mut">${short(qs)} → ${short(addD(qs,13))}</div>
<div class="${barCls}"><i style="width:${pc.toFixed(1)}%"></i></div>
<div class="row" style="justify-content:space-between">
<span><b>${F(o.seuil)}</b> / ${F(N)}</span>
<span class="mut">${o.seuil<N?'reste '+F(N-o.seuil)+' avant HS':'🔥 HS : '+F(o.h25)+' à 25% · '+F(o.h50)+' à 50%'}</span>
</div>`;
  renderProj(k,qs);
  if(_undo){
    $('undoDesc').textContent=_undo.desc;
  }
}

function renderProj(k,qs){
  const qEnd=addD(qs,13);
  const today_=today();
  if(k>qEnd||k<qs){$('dProj').innerHTML='<span class="mut">Navigue dans la quatorzaine courante pour voir la projection.</span>';return}
  const restant=nDays(today_,qEnd);
  if(restant<=0){$('dProj').innerHTML='<span class="mut">Quatorzaine terminée.</span>';return}
  $('dProjLbl').textContent=short(qs)+' → '+short(qEnd);
  const o=calcPer(qs,1).Q[0];
  const N=DB.s.base*120;
  const trav=o.trav||1;
  const moyJ=o.seuil/trav;
  const joursTravRestants=Math.round(restant*trav/(nDays(qs,today_)+1||1));
  const proj=o.seuil+joursTravRestants*moyJ;
  const projH25=Math.min(Math.max(proj-N,0),DB.s.pl*60);
  const projH50=Math.max(proj-N-DB.s.pl*60,0);
  $('dProj').innerHTML=`
<div class="g2">
<div class="kpi"><b>${restant}</b><span>Jours restants</span></div>
<div class="kpi ${projH50>0?'bad':projH25>0?'warn':''}"><b>${F(Math.round(proj))}</b><span>TTE projetée</span></div>
</div>
<div class="mut" style="margin-top:6px">
Projection à rythme constant : <b>${F(Math.round(projH25))}</b> HS 25% · <b>${F(Math.round(projH50))}</b> HS 50%
<br>Marge avant HS : <b>${F(Math.max(N-o.seuil,0))}</b>
</div>`;
}

function goMonth(n){const d=dOf(curMonth+'-01');d.setMonth(d.getMonth()+n);curMonth=isoOf(d).slice(0,7);mhRefresh('month-change')}

function goPer(n){
  DB.per.start=addD(DB.per.start,n*14*DB.per.nb);
  save();mhRefresh('pay-field');
}

function regPer(){
  const s=DB.per.start,nb=DB.per.nb;
  const ex=DB.periods.find(p=>p.start===s);
  if(ex){
    ex.nb=nb;
  }else{
    const end=addD(s,nb*14-1);
    const overlap=DB.periods.some(p=>{
      if(!p||!p.start)return false;
      const pe=addD(p.start,p.nb*14-1);
      return s<=pe && p.start<=end;
    });
    if(overlap){
      alert('⚠️ Cette période chevauche déjà une période enregistrée. Elle n\'est pas ajoutée pour éviter un double comptage HS/RC.');
      return;
    }
    DB.periods.push({start:s,nb});
  }
  DB.periods.sort((a,b)=>a.start<b.start?-1:1);
  gb(s);save();
  alert('✅ Période enregistrée dans l\'audit');mhRefresh();
}

function renderPayBase(){
  const S=DB.s,st=DB.per.start,nb=DB.per.nb,B=gb(st);
  $('pS').value=st;$('pN').value=nb;
  $('pP25').value=B.p25??'';$('pP50').value=B.p50??'';
  $('pRC').value=B.rcOld??'';$('pRCA').value=B.rcAcq??'';
  $('pLbl').textContent=short(st)+' → '+short(addD(st,nb*14-1));
  const off=((nDays(S.anchor,st)%14)+14)%14;
  const reg=DB.periods.some(p=>p.start===st);
  $('pAlign').innerHTML=(off===0
    ?'<div class="al k">✅ Période alignée sur tes quatorzaines</div>'
    :'<div class="al w">⚠️ Décalage de '+off+' jour(s) — les HS peuvent être faussées. Ajuste la date de début.</div>')
    +(reg?'<div class="al i">📌 Période enregistrée dans l\'audit</div>':'');
  const{Q,AL,G}=calcPer(st,nb);
  $('pKpi').innerHTML=[
    ['Amplitude',F(G.amp)],['TTE',F(G.tte)],
    ['HS 25 %',F(G.h25),G.h25>0?'warn':''],
    ['HS 50 %',F(G.h50),G.h50>0?'bad':''],
    ['Jours trav.',G.trav],['Paniers',G.ir+G.iru],
    ['Dimanches',G.dim],['IDAJ',C2(G.idaj)+' h']
  ].map(x=>`<div class="kpi ${x[2]||''}"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
  let h='<tr><th>Détail</th><th class="n">Ampl.</th><th class="n">TTE</th><th class="n">Norm.</th><th class="n">HS 25%</th><th class="n">HS 50%</th></tr>';
  Q.forEach((o,i)=>{
    o.w.forEach((s,j)=>h+=`<tr><td>Sem. ${j+1} — ${short(s.start)}</td><td class="n">${F(s.amp)}</td><td class="n">${F(s.tte)}</td><td class="n mut" colspan="3">${s.trav} j</td></tr>`);
    h+=`<tr class="q"><td>Quatorzaine ${i+1}</td><td class="n">${F(o.amp)}</td><td class="n">${F(o.seuil)}</td><td class="n">${F(o.nor)}</td><td class="n">${F(o.h25)}</td><td class="n">${F(o.h50)}</td></tr>`;
  });
  h+=`<tr class="t"><td>TOTAL</td><td class="n">${F(G.amp)}</td><td class="n">${F(G.tte)}</td><td class="n">${F(G.nor)}</td><td class="n">${F(G.h25)}</td><td class="n">${F(G.h50)}</td></tr>`;
  $('pTab').innerHTML=h;
  $('pAlCount').textContent=AL.length?AL.length+' alerte(s)':'';
  $('pAl').innerHTML=AL.length
    ?AL.map(a=>`<div class="al ${a.lvl}"><b>${short(a.k)}</b> — ${esc(a.m)}</div>`).join('')
    :'<div class="al k">✅ Aucune anomalie détectée sur cette période</div>';
  const{L,tot,netEst,panIR,panIRTax,panIRU,panIRExon,panIRUT}=brutOf(G);
  /*
   * V36 HABILLAGE FIX
   * La fiche de paie officielle enregistre l'habillage/déshabillage
   * comme une ligne distincte en heures + taux + montant.
   * On ne modifie PAS le TTE ni l'amplitude réelle.
   * On ajoute uniquement le rapprochement avec le bulletin disponible.
   */
  const habEnd=addD(DB.per.start,DB.per.nb*14-1);
  const habMois=habEnd.slice(0,7);
  const habBul=(DB.bulletins||[]).find(b=>b && b.mois===habMois);
  let habRef='';
  if(habBul && Number.isFinite(Number(habBul.habH))){
    const habBulMin=Math.round(Number(habBul.habH)*60);   // bulletin : heures décimales -> minutes
    const habT=Number(habBul.habT)||0;
    const habM=Number(habBul.habM)||0;
    const habCalcMin=Math.round(Number(G.hab)||0);        // G.hab est DÉJÀ en minutes (jours travaillés × min/jour)
    const habDiffMin=habCalcMin-habBulMin;
    const habOk=Math.abs(habDiffMin)<=1;
    const calcTxt=` · MesHeures : <b>${F(habCalcMin)}</b> (${G.trav} j × ${S.hab} min)`
      +(habOk?'':` · écart <b>${habDiffMin>0?'+':'-'}${F(Math.abs(habDiffMin))}</b>`);
    habRef=`<tr><td colspan="4" style="padding:10px 8px">
      <div class="al ${habOk?'k':'w'}">
        👕 <b>Habillage / déshabillage — bulletin ${habMois}</b><br>
        Bulletin : <b>${F(habBulMin)}</b>${habT>0?` · taux <b>${habT.toFixed(4)} €/h</b>`:''}${habM>0?` · montant <b>${EUR(habM)}</b>`:''}
        ${calcTxt}
        ${habOk?' · ✅ conforme au bulletin':' · ⚠️ écart à rapprocher'}
      </div>
    </td></tr>`;
  }
  $('pBrut').innerHTML='<tr><th>Élément</th><th class="n">Qté</th><th class="n">Taux</th><th class="n">Montant</th></tr>'
    +L.map(x=>`<tr><td>${esc(x[0])}</td><td class="n">${x[1]}</td><td class="n mut">${x[2]}</td><td class="n">${EUR(x[3])}</td></tr>`).join('')
    +habRef
    +`<tr class="t"><td>Brut soumis à cotisations</td><td colspan="2"></td><td class="n">${EUR(tot)}</td></tr>`
    +`<tr><td>Net estimé (brut × ${S.net})</td><td colspan="2" class="n mut"></td><td class="n">${EUR(tot*S.net)}</td></tr>`
    +`<tr><td>+ IR extérieur — part exonérée (${G.ir} repas)</td><td colspan="2" class="n mut">${S.irT} €/repas</td><td class="n">+ ${EUR(panIRExon)}</td></tr>`
    +`<tr><td>+ IRU intérieur (${G.iru} repas)</td><td colspan="2" class="n mut">${S.iru} €/repas</td><td class="n">+ ${EUR(panIRU)}</td></tr>`
    +`<tr class="t"><td>Total versé estimé</td><td colspan="2"></td><td class="n">${EUR(netEst)}</td></tr>`;
  /*
   * V36 RC — distinction stricte entre donnée absente et zéro.
   * Une absence de référence employeur ne signifie pas « aucune heure payée ».
   * Sans p25/p50, le RC exact de la période reste inconnu.
   */
  const hasP25=B.p25!=null && Number.isFinite(Number(B.p25));
  const hasP50=B.p50!=null && Number.isFinite(Number(B.p50));
  const hasOld=B.rcOld!=null && Number.isFinite(Number(B.rcOld));
  const hasRcRef=B.rcAcq!=null && Number.isFinite(Number(B.rcAcq));
  // V36 FINAL RC — séparation stricte calcul local / référence employeur.
  // ROMI1 n'est utilisé ici que lorsqu'il correspond EXACTEMENT à la période Paie.
  const periodEnd=addD(st,nb*14-1);

  const romiExact=(window.MH_ROMI_SOURCE && typeof window.MH_ROMI_SOURCE.list==='function'
    ? window.MH_ROMI_SOURCE.list() : []).find(r=>{
    return r &&
      String(r.periodStart||'')===String(st) &&
      String(r.periodEnd||'')===String(periodEnd);
  })||null;

  const hs25Romi=romiExact && Number.isFinite(Number(romiExact.hs125PaidH))
    ? Number(romiExact.hs125PaidH) : null;
  const hs50Romi=romiExact && Number.isFinite(Number(romiExact.hs150PaidH))
    ? Number(romiExact.hs150PaidH) : null;

  const rcAcqRomi=romiExact && Number.isFinite(Number(romiExact.rcAcquiredH))
    ? Number(romiExact.rcAcquiredH) : null;
  const rcOldRomi=romiExact && Number.isFinite(Number(romiExact.rcPreviousH))
    ? Number(romiExact.rcPreviousH) : null;
  const rcSoldeRomi=romiExact && Number.isFinite(Number(romiExact.rcBalanceH))
    ? Number(romiExact.rcBalanceH) : null;

  const hs25Payees=B.p25!=null ? Number(B.p25) : hs25Romi;
  const hs50Payees=B.p50!=null ? Number(B.p50) : hs50Romi;

  const hs25Calculees=Number(G.h25)/60;
  const hs50Calculees=Number(G.h50)/60;

  const hs25NonPayees=hs25Payees==null
    ? null
    : Math.max(hs25Calculees-hs25Payees,0);

  const hs50NonPayees=hs50Payees==null
    ? null
    : Math.max(hs50Calculees-hs50Payees,0);

  // Équivalence purement théorique des HS non payées.
  let equivTheorique=null;
  if(hs25NonPayees!==null && hs50NonPayees!==null){
    equivTheorique=hs25NonPayees*1.25+hs50NonPayees*1.50;
  }

  // Référence réelle employeur.
  const rcBulletin= B.rcAcq!=null
    ? Number(B.rcAcq)
    : rcAcqRomi;

  const rcAnterieur= B.rcOld!=null
    ? Number(B.rcOld)
    : rcOldRomi;

  // Si ROMI1 donne directement le solde cumulé, c'est cette valeur
  // qui fait foi : aucun recalcul d'arrondi.
  const soldeRCReel=
    rcSoldeRomi!==null
      ? rcSoldeRomi
      : (rcAnterieur!==null && rcBulletin!==null
          ? rcAnterieur+rcBulletin
          : null);

  const ecartRC=
    equivTheorique!==null && rcBulletin!==null
      ? equivTheorique-rcBulletin
      : null;

  const sourceEmployeur=romiExact
    ? 'ROMI1'
    : (B.rcAcq!=null || B.rcOld!=null || B.p25!=null || B.p50!=null
        ? 'saisie bulletin'
        : null);

  // Affichage des références ROMI1 dans les champs si la période correspond.
  if(romiExact){
    if(B.p25==null && hs25Romi!=null) $('pP25').value=hs25Romi;
    if(B.p50==null && hs50Romi!=null) $('pP50').value=hs50Romi;
    if(B.rcOld==null && rcOldRomi!=null) $('pRC').value=rcOldRomi;
    if(B.rcAcq==null && rcAcqRomi!=null) $('pRCA').value=rcAcqRomi;
  }

  $('pRcOut').innerHTML=`<table>
<tr><th>Type</th><th class="n">Dues calc.</th><th class="n">Payées</th><th class="n">→ RC théorique</th><th class="n">× majo.</th></tr>
<tr><td>HS 25 %</td><td class="n">${C2(G.h25)}</td><td class="n">${hs25Payees!==null?hs25Payees.toFixed(2):'—'}</td><td class="n">${hs25NonPayees!==null?hs25NonPayees.toFixed(2):'—'}</td><td class="n">${hs25NonPayees!==null?(hs25NonPayees*1.25).toFixed(2):'—'}</td></tr>
<tr><td>HS 50 %</td><td class="n">${C2(G.h50)}</td><td class="n">${hs50Payees!==null?hs50Payees.toFixed(2):'—'}</td><td class="n">${hs50NonPayees!==null?hs50NonPayees.toFixed(2):'—'}</td><td class="n">${hs50NonPayees!==null?(hs50NonPayees*1.50).toFixed(2):'—'}</td></tr>
<tr class="t"><td>Équivalence théorique de majoration</td><td colspan="3"></td><td class="n">${equivTheorique!==null?equivTheorique.toFixed(2)+' h':'—'}</td></tr>
<tr class="t"><td>RC acquis — référence employeur</td><td colspan="3"></td><td class="n">${rcBulletin!==null?rcBulletin.toFixed(2)+' h':'—'}</td></tr>
<tr class="t"><td>Solde RC réel — référence employeur</td><td colspan="3"></td><td class="n">${soldeRCReel!==null?soldeRCReel.toFixed(2)+' h':'—'}</td></tr>
</table>
${ecartRC!==null?`<div class="al ${Math.abs(ecartRC)<0.01?'k':'i'}" style="margin-top:9px">
📊 Écart entre l'équivalence théorique MesHeures et le RC employeur : <b>${ecartRC.toFixed(2)} h</b>.
</div>`:''}
<div class="al i" style="margin-top:9px">
📌 <b>Référence employeur :</b> ${sourceEmployeur||'non renseignée'}.
L'équivalence théorique MesHeures ne remplace jamais le RC employeur.
</div>
${rcBulletin===null?`<div class="al w" style="margin-top:7px">
⚠️ RC employeur non renseigné pour cette période : le solde RC réel ne peut pas être déterminé.
</div>`:''}`;

  let c='<tr><th>Semaine</th><th class="n">TTE calculé</th><th class="n">TTE bulletin</th><th class="n">Écart</th></tr>';
  Q.forEach(o=>o.w.forEach(s=>{
    const v=DB.cmp[s.start]||'',e=v?P(v)-s.tte:null;
    c+=`<tr><td>${short(s.start)}</td><td class="n">${F(s.tte)}</td>
<td class="n"><input type="time" value="${v}" onchange="DB.cmp['${s.start}']=this.value;save();mhRefresh('pay-field')" style="width:100px"></td>
<td class="n ${e===null?'':e===0?'ok':'bad'}">${e===null?'—':e===0?'✓':F(e)}</td></tr>`;
  }));
  $('pCmp').innerHTML=c;
}

function renderAuditBase(){
  if(!DB.periods.length){
    $('aKpi').innerHTML='<div class="audit-empty">Aucune période enregistrée pour le moment.</div>';
    $('aAnn').innerHTML='<tr><td class="mut">Enregistre une période depuis l’écran Paie pour alimenter l’audit.</td></tr>';
    $('aTab').innerHTML='<tr><td class="mut">Aucune période enregistrée.</td></tr>';
    $('aRc').innerHTML='<div class="audit-empty">Le solde RC apparaîtra ici après l’enregistrement d’une période.</div>';
    $('aFer').innerHTML='<div class="al i">Aucun dimanche ou jour férié enregistré dans une période d’audit.</div>';
    $('aAl').innerHTML='<div class="al k">✅ Aucun contrôle d’audit à signaler.</div>';
    return;
  }
  const S=DB.s;
  // Une même période peut avoir été enregistrée plusieurs fois. On ne doit jamais
  // afficher deux fois les mêmes événements dans l'audit. Les périodes qui se
  // chevauchent restent visibles et sont signalées afin de ne supprimer aucune donnée.
  /*
   * V36 RC AUDIT — périmètre et dédoublonnage réel.
   * Le journal de preuves ne doit pas cumuler :
   *  - les périodes antérieures au dossier actuel (2019–2024) ;
   *  - plusieurs périodes qui couvrent les mêmes journées.
   *
   * Une période enregistrée est conservée comme unité de calcul uniquement
   * si elle ne recouvre pas une période déjà retenue. La période la plus
   * ancienne est prioritaire ; les suivantes qui la recouvrent sont ignorées
   * pour les totaux afin d'éviter le double comptage des HS/RC.
   */
  const AUDIT_START='2025-01-01';
  const seenPeriods=new Set(),rawPeriods=[];
  (DB.periods||[]).forEach(p=>{
    if(!p||!p.start||p.start<AUDIT_START)return;
    const key=p.start+'|'+p.nb;
    if(!seenPeriods.has(key)){seenPeriods.add(key);rawPeriods.push(p)}
  });
  rawPeriods.sort((a,b)=>a.start.localeCompare(b.start));
  const auditPeriods=[],overlaps=[];
  rawPeriods.forEach(p=>{
    const pEnd=addD(p.start,p.nb*14-1);
    const prev=auditPeriods[auditPeriods.length-1];
    if(prev){
      const prevEnd=addD(prev.start,prev.nb*14-1);
      if(p.start<=prevEnd){
        overlaps.push([prev,p]);
        return;
      }
    }
    auditPeriods.push(p);
  });
  let T={tte:0,h25:0,h50:0,acq:0,dec:0,ecart:0,fer:[],dim:[],trav:0,nor:0},AA=[];
  // V36 AUDIT FIX: le TTE reste dédupliqué par jour plus bas.
  // HS25/HS50/RC ne doivent pas être additionnés une seconde fois
  // lorsqu'une période enregistrée chevauche une période déjà traitée.
  let auditLastKeptEnd=null;
  // V36 AUDIT FIX: TTE must be counted once per calendar day.
  // DB.periods contains quatorzaine records; summing G.tte blindly can
  // double-count a day when periods overlap or are re-registered with
  // different spans. HS remain period-based below.
  const auditSeenDays=new Set();
  const auditUniqueTteByYear={};
  function auditAddUniqueDays(start,nb){
    for(let i=0;i<nb*14;i++){
      const k=addD(start,i);
      if(auditSeenDays.has(k))continue;
      auditSeenDays.add(k);
      const r=cd(k);
      const d=gd(k);
      if(!d || (d.t!=='T' && d.t!=='NUIT'))continue;
      const t=Number(r?.tte)||0;
      const y=k.slice(0,4);
      if(!auditUniqueTteByYear[y])auditUniqueTteByYear[y]=0;
      auditUniqueTteByYear[y]+=t;
    }
  }

  /*
   * V36 RC AUDIT V2 — référence employeur et inconnues.
   * Une cellule vide ne signifie PAS « 0 h payée ».
   * Si les heures payées HS25/HS50 ne sont pas connues, le RC exact
   * ne peut pas être déduit de MesHeures et la période est exclue
   * du cumul RC exact (pour éviter de recréer artificiellement 604,44 h).
   *
   * Priorité : saisie DB.bul, puis relevé ROMI1 enregistré sur la même
   * date de début.
   */
  function auditBulletin(start){
    const B=gb(start)||{};
    const R=DB.romi&&DB.romi[start]||null;
    return {
      ...B,
      p25:B.p25!=null?B.p25:(R&&R.hs125PayeesH!=null?R.hs125PayeesH:null),
      p50:B.p50!=null?B.p50:(R&&R.hs150PayeesH!=null?R.hs150PayeesH:null),
      rcAcq:B.rcAcq!=null?B.rcAcq:(R&&R.rcAcquis!=null?R.rcAcquis:null),
      source:R&&B.p25==null&&B.p50==null?'ROMI1':'bulletin'
    };
  }

  let h='<tr><th>Période</th><th class="n">TTE</th><th class="n">HS25</th><th class="n">HS50</th><th class="n">RC exact</th><th class="n">RC bulletin</th><th class="n">Écart</th></tr>';
  const byYear={};
  auditPeriods.forEach(p=>{
    auditAddUniqueDays(p.start,p.nb);
    const{G,AL}=calcPer(p.start,p.nb),B=auditBulletin(p.start);
    const hasPayRef=B.p25!=null&&B.p50!=null;
    const d25=hasPayRef?Math.max(G.h25/60-B.p25,0):null;
    const d50=hasPayRef?Math.max(G.h50/60-B.p50,0):null;
    const acq=hasPayRef?Math.floor((d25*1.25+d50*1.5)*100)/100:null;
    const ec=acq!=null&&B.rcAcq!=null?acq-B.rcAcq:null;
    const pEnd=addD(p.start,p.nb*14-1);
    const auditIsOverlap=auditLastKeptEnd!==null && p.start<=auditLastKeptEnd;

    // TTE is rebuilt from unique calendar days below; do not add G.tte here.
    // HS25/HS50/RC : une période chevauchante n'est pas additionnée une seconde fois.
    if(!auditIsOverlap){
      T.h25+=G.h25;T.h50+=G.h50;
      if(acq!=null)T.acq+=acq;
      if(B.rcAcq!=null)T.dec+=B.rcAcq;
      T.trav+=G.trav;T.nor+=G.nor;
      if(ec!==null)T.ecart+=ec;
    }else{
      // Le TTE, les jours et les alertes restent gérés par les mécanismes
      // existants de déduplication/contrôle ci-dessous.
      T.trav+=G.trav;T.nor+=G.nor;
    }
    G.ferJ.forEach(k=>T.fer.push(k));
    G.dimJ?.forEach(k=>T.dim.push(k));
    AL.forEach(a=>AA.push(a));
    const y=p.start.slice(0,4);
    if(!byYear[y])byYear[y]={tte:0,h25:0,h50:0,trav:0,nor:0};
    byYear[y].tte=auditUniqueTteByYear[y]||0;
    if(!auditIsOverlap){
      byYear[y].h25+=G.h25;byYear[y].h50+=G.h50;
    }
    byYear[y].trav+=G.trav;byYear[y].nor+=G.nor;
    auditLastKeptEnd=(auditLastKeptEnd===null||pEnd>auditLastKeptEnd)?pEnd:auditLastKeptEnd;
    h+=`<tr><td><a href="#" onclick="DB.per={start:'${p.start}',nb:${p.nb}};save();tab('paie');return false" style="color:var(--blue)">${short(p.start)}→${short(addD(p.start,p.nb*14-1))}</a></td>
<td class="n">${F(G.tte)}</td><td class="n">${C2(G.h25)}</td><td class="n">${C2(G.h50)}</td>
<td class="n">${acq!=null?acq.toFixed(2):'—'}</td><td class="n">${B.rcAcq!=null?B.rcAcq.toFixed(2):'—'}</td>
<td class="n ${ec===null?'':Math.abs(ec)<0.1?'ok':'bad'}">${ec===null?'—':Math.abs(ec)<0.1?'✓':ec.toFixed(2)}</td></tr>`;
  });
  T.tte=Object.values(auditUniqueTteByYear).reduce((a,b)=>a+b,0);
  h+=`<tr class="t"><td>TOTAL</td><td class="n">${F(T.tte)}</td><td class="n">${C2(T.h25)}</td><td class="n">${C2(T.h50)}</td><td class="n">${T.acq.toFixed(2)}</td><td class="n">${T.dec.toFixed(2)}</td><td class="n ${Math.abs(T.ecart)<0.1?'ok':'bad'}">${T.ecart.toFixed(2)}</td></tr>`;
  $('aTab').innerHTML=h;
  $('aKpi').innerHTML=[
    ['Périodes',auditPeriods.length],['Jours travaillés',T.trav],
    ['TTE total',F(T.tte)],['HS 25 %',C2(T.h25)],['HS 50 %',C2(T.h50)],
    ['Équiv. RC majoré',T.acq.toFixed(2)+' h'],
    ['Valeur RC théorique',EUR(T.acq*S.taux)],
    ['Écart bulletins',EUR(Math.abs(T.ecart)*S.taux),Math.abs(T.ecart)>0.5?'bad':'']
  ].map(x=>`<div class="kpi ${x[2]||''}"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
  let ay='<tr><th>Année</th><th class="n">Jours</th><th class="n">TTE</th><th class="n">HS 25%</th><th class="n">HS 50%</th><th class="n">Brut estimé</th></tr>';
  Object.entries(byYear).sort().forEach(([y,v])=>{
    const brt=v.nor/60*S.taux+(v.h25/60*S.taux*1.25)+(v.h50/60*S.taux*1.5);
    ay+=`<tr><td><b>${y}</b></td><td class="n">${v.trav}</td><td class="n">${F(v.tte)}</td><td class="n">${C2(v.h25)}</td><td class="n">${C2(v.h50)}</td><td class="n">${EUR(brt)}</td></tr>`;
  });
  $('aAnn').innerHTML=ay;
  const uniqueFer=[...new Set(T.fer)].sort();
  const uniqueDim=[...new Set(T.dim)].sort();
  const uniqueAlerts=[];const seenAlerts=new Set();
  AA.forEach(a=>{const key=a.k+'|'+a.lvl+'|'+a.m;if(!seenAlerts.has(key)){seenAlerts.add(key);uniqueAlerts.push(a)}});
  const overlapNote=overlaps.length
    ?`<div class="al w audit-overlap">⚠️ ${overlaps.length} période${overlaps.length>1?'s':''} chevauchante${overlaps.length>1?'s':''} ignorée${overlaps.length>1?'s':''} du cumul : les mêmes journées ne sont comptées qu’une seule fois.</div>`
    :'';
  $('aFer').innerHTML=overlapNote+(uniqueFer.length?uniqueFer.map(k=>{const r=cd(k);
    return `<div class="al w">☀️ <b>${shortY(k)}</b> — ${F(r.tte)} → maj. 100% = <b>${EUR(r.tte/60*S.taux)}</b></div>`}).join('')
    +`<div class="al i">Total fériés : <b>${EUR(uniqueFer.reduce((a,k)=>a+cd(k).tte/60*S.taux,0))}</b></div>`
    :'<div class="al k">✅ Aucun férié travaillé</div>')
    +(uniqueDim.length?uniqueDim.map(k=>`<div class="al w">🔵 <b>${shortY(k)}</b> dimanche travaillé</div>`).join(''):'');
  const rcSol=T.acq-T.dec;
  const barPct=Math.min(100,rcSol/S.rcAlerte*100);
  $('aRc').innerHTML=`<div class="kpis">
<div class="kpi"><b>${T.acq.toFixed(2)} h</b><span>RC théorique généré total</span></div>
<div class="kpi"><b>${T.dec.toFixed(2)} h</b><span>RC bulletin référencé</span></div>
<div class="kpi ${rcSol>S.rcAlerte?'bad':rcSol>S.rcAlerte*0.6?'warn':''}"><b>${rcSol.toFixed(2)} h</b><span>Solde RC théorique</span></div>
<div class="kpi ${rcSol>S.rcAlerte?'bad':''}"><b>${EUR(rcSol*S.taux)}</b><span>Valeur RC théorique</span></div>
</div>
<div class="${rcSol>S.rcAlerte?'bar bad':'bar warn'}" style="margin-top:9px"><i style="width:${barPct.toFixed(1)}%"></i></div>
${rcSol>S.rcAlerte?`<div class="al b" style="margin-top:6px">🚨 Solde RC théorique élevé (${rcSol.toFixed(1)}h / seuil ${S.rcAlerte}h) — risque de perdre des heures !</div>`:''}`;
  const crit=uniqueAlerts.filter(a=>a.lvl==='b');
  $('aAl').innerHTML=uniqueAlerts.length
    ?(crit.length?crit:uniqueAlerts).slice(0,50).map(a=>`<div class="al ${a.lvl}"><b>${shortY(a.k)}</b> — ${esc(a.m)}</div>`).join('')
    +(uniqueAlerts.length>50?`<div class="mut">… et ${uniqueAlerts.length-50} autres anomalies</div>`:'')
    :'<div class="al k">✅ Aucune anomalie sur les périodes enregistrées</div>';
}

function renderRegBase(){
  for(const g in RG)$(g).innerHTML=RG[g].map(([k,l])=>{
    const ty=['anchor','panDeb','panFin','nuitDeb','nuitFin'].includes(k)?
      (k==='anchor'?'date':'time'):'number';
    return `<div><label>${l}</label><input type="${ty}" step="any" value="${DB.s[k]??''}" onchange="DB.s['${k}']=this.type==='number'?parseFloat(this.value)||0:this.value;save();mhRefresh()"></div>`;
  }).join('');
  $('rMin').checked=DB.s.min;
  $('rNom').value=DB.s.nom||'';
  $('rEmb').value=DB.s.emb||'';
  $('rAnc').value=DB.s.anc||0;
  const anc=calcAnc(DB.s.emb||DEF.emb);
  const next=anc.y>=15?'plafond conventionnel atteint (8 %)':`prochain palier : ${anc.nextPct}% à ${anc.nextYears} ans`;
  $('rAncCalc').innerHTML=`<b>${anc.y} ans ${anc.m} mois</b> → <strong>${anc.pct}%</strong> d'ancienneté CCN · <span>${next}</span>`;
  $('rBk').innerHTML=DB.exp?'Dernier export : <b>'+DB.exp+'</b>':'<span style="color:var(--warn)">⚠️ Aucune sauvegarde</span>';
}

function renderAll(){
  if(curTab==='home')renderHome();
  if(curTab==='jour')renderDay();
  if(curTab==='mois')renderMonth();
  if(curTab==='paie')renderPay();
  if(curTab==='audit')renderAudit();
  if(curTab==='bul')renderBulHist();
  if(curTab==='romi')renderRomiTab();
  if(curTab==='reg')renderReg();
  let tot=0;
  DB.periods.forEach(p=>{const{AL}=calcPer(p.start,p.nb);tot+=AL.filter(a=>a.lvl==='b').length});
  const badge=$('hBadge');
  if(tot>0){badge.style.display='';badge.textContent=tot}else badge.style.display='none';
  $('t-audit')?.querySelector('.tb')?.remove();
  if(tot>0){const auditTab=$('t-audit');if(auditTab){const sp=document.createElement('span');sp.className='tb';sp.textContent=tot;auditTab.appendChild(sp)}}
}

function wipe(){
  if(!confirm('⚠️ Effacer toutes les données locales MesHeures ?\n\nCette action supprime les journées, bulletins, relevés, constats et réglages enregistrés sur cet appareil.'))return;
  try{localStorage.removeItem(LS)}catch(e){}
  DB={s:{...DEF},days:{},cmp:{},periods:[],bul:{},bulletins:[],romi:{},per:{start:DEF.anchor,nb:1},exp:null};
  curDate=today();curMonth=curDate.slice(0,7);curTab='home';_undo=null;
  save();tab('home');
  alert('✅ Données locales effacées.');
}

function copySum(){
  const{Q,G}=calcPer(DB.per.start,DB.per.nb);
  let t='MesHeures — Résumé\n';
  t+='Période : '+short(DB.per.start)+' → '+short(addD(DB.per.start,DB.per.nb*14-1))+'\n\n';
  Q.forEach((o,i)=>{
    o.w.forEach((s,j)=>t+='Sem. '+(j+1)+' ('+short(s.start)+') : Amp '+F(s.amp)+' · TTE '+F(s.tte)+'\n');
    t+='→ Q'+(i+1)+' : TTE '+F(o.seuil)+' | HS 25% '+F(o.h25)+' · HS 50% '+F(o.h50)+'\n\n';
  });
  t+='TOTAL : TTE '+F(G.tte)+' · Amp '+F(G.amp)+' · '+G.trav+' j · '+(G.ir+G.iru)+' paniers · IDAJ '+C2(G.idaj)+'h';
  navigator.clipboard.writeText(t).then(()=>alert('✅ Résumé copié !'),()=>prompt('Copie :',t));
}

