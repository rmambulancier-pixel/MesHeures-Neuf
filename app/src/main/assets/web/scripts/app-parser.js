// Import / analyse des bulletins, PDF, Excel et ROMI — MesHeures
async function parseBulFile(file){
  const out=$('bulOut');
  if(!file)return;

  out.innerHTML='<div class="al i">⏳ Lecture spécialisée du bulletin…</div>';

  try{
    if(!window.MHSpecializedReader ||
       typeof window.MHSpecializedReader.readBulletin!=='function'){
      throw new Error('Lecteur spécialisé bulletin indisponible');
    }

    await mhLoadLib('pdf');
    const lib=window.pdfjsLib||window['pdfjs-dist/build/pdf'];
    if(!lib)throw new Error('PDF.js non chargé');

    if(typeof _wset!=='undefined' && !_wset){
      lib.GlobalWorkerOptions.workerSrc=PDF_WORKER;
      _wset=true;
    }

    const res=await window.MHSpecializedReader.readBulletin(file,lib);
    if(!res || !res.fields){
      throw new Error('Le lecteur spécialisé n’a retourné aucune donnée');
    }

    const bul={...res.fields};

/*
 * Le PDF vient obligatoirement du lecteur spécialisé.
 * On force le marqueur ici également afin que afficherBulletin()
 * ne puisse jamais retomber sur le moteur historique.
 */
bul._specialized=true;
bul._bulletinMode='source-only';

    if(res.text){
      $('bulTxt').value=res.text;
    }else{
      $('bulTxt').value='LECTURE SPÉCIALISÉE — BULLETIN';
    }

    bul.importedAt=new Date().toLocaleDateString('fr-FR');

    const moisKey=bul.mois||('inconnu-'+Date.now());
    const existing=DB.bulletins.findIndex(b=>b.mois===moisKey);

    if(existing>=0)DB.bulletins[existing]=bul;
    else DB.bulletins.push(bul);

    DB.bulletins.sort((a,b)=>(a.mois||'')>(b.mois||'')?1:-1);

    save();
    afficherBulletin(bul);
    renderBulHist();

    out.innerHTML='<div class="al k">✅ Bulletin lu par le lecteur spécialisé.</div>';
  }catch(err){
    console.error('[MesHeures] parseBulFile:',err);
    out.innerHTML='<div class="al b">❌ Lecture spécialisée impossible : '+esc(err&&err.message?err.message:String(err))+'</div>';
  }finally{
    // On conserve le PDF sélectionné pour permettre une nouvelle analyse.
  }
}
async function analyserBulletin(){
  const input=$('fbul');

  // Si un PDF est sélectionné, c'est TOUJOURS le lecteur
  // spécialisé qui doit être utilisé.
  if(input && input.files && input.files.length){
    return parseBulFile(input.files[0]);
  }

  // Sinon seulement, on utilise le texte collé.
  return parseBulletin();
}

function parseBulletin(){
  const raw=$('bulTxt').value;
  if(!raw.trim()){$('bulOut').innerHTML='<div class="al w">Colle d\'abord le texte du bulletin.</div>';return}
  const t=raw.replace(/\u00a0/g,' ').replace(/\r/g,'\n');
  const lines=t.split('\n').map(l=>l.trim()).filter(l=>l);
  const S=DB.s;
  const bul={};

  const moisNoms={janvier:'01',février:'02',mars:'03',avril:'04',mai:'05',juin:'06',
    juillet:'07',août:'08',aout:'08',septembre:'09',octobre:'10',novembre:'11',décembre:'12',decembre:'12'};
  for(const l of lines){
    const m=l.match(/[Pp][ée]riode\s*:?\s*([A-Za-zÀ-ÿ]+)\s+(\d{4})/i);
    if(m){
      const mn=moisNoms[m[1].toLowerCase()];
      if(mn)bul.mois=m[2]+'-'+mn;
      break;
    }
    const m2=l.match(/(\d{2})-(\d{4})/);
    if(m2&&!bul.mois)bul.mois=m2[2]+'-'+m2[1];
  }

  for(const l of lines){
    if(/Monsieur|Madame/i.test(l)){bul.nom=l.replace(/Monsieur|Madame/gi,'').trim();break}
  }

  for(const l of lines){
    const m=l.match(/(\d+)\s+ans?\s+et\s+(\d+)\s+mois?/i);
    if(m){bul.ancienneteTxt=m[0];break}
  }

  function parseNum(s){return parseFloat(s.replace(/\s/g,'').replace(',','.'))||0}

  // numsOfLine() est désormais défini globalement (partagé avec l'extracteur ROMI1)

  for(const l of lines){
    const ns=numsOfLine(l);
    if(/salaire de base/i.test(l)&&ns.length>=3){
      bul.hNorm=ns[0];
      bul.taux=ns[1];
      bul.montNorm=ns[ns.length-1];
    }
    else if(/suppl[ée]?mentaires?\s*25/i.test(l)){
      const ns2=numsOfLine(l.replace(/25\s*%/ig,''));
      if(ns2.length>=3){bul.hs25H=ns2[0];bul.hs25T=ns2[1];bul.hs25M=ns2[ns2.length-1];}
    }
    else if(/suppl[ée]?mentaires?\s*50/i.test(l)){
      const ns2=numsOfLine(l.replace(/50\s*%/ig,''));
      if(ns2.length>=3){bul.hs50H=ns2[0];bul.hs50T=ns2[1];bul.hs50M=ns2[ns2.length-1];}
    }
    else if(/habillage/i.test(l)&&!/prime/i.test(l)&&ns.length>=2){
      bul.habH=ns[0];
      bul.habT=ns.length>=3?ns[1]:S.habT;
      bul.habM=ns[ns.length-1];
    }
    else if(/d[eé]passement.*amplitude|IDAJ/i.test(l)){
      const clean=l.replace(/100\s*%/g,'').trim();
      const ns2=numsOfLine(clean);
      if(ns2.length>=2){
        bul.idajH=ns2[0];
        bul.idajM=ns2[ns2.length-1];
      }
    }
    else if(/^salaire brut/i.test(l)&&ns.length>=1){
      bul.brut=ns[ns.length-1];
    }
    else if(/repas\s+unique/i.test(l)&&ns.length>=2){
      bul.iruN=ns[0];
      bul.iruT=ns.length>=3?ns[1]:S.iru;
      bul.iruM=ns[ns.length-1];
    }
    else if(/indemnit[eé]\s+de\s+repas(?!\s+unique)/i.test(l)&&!/unique/i.test(l)){
      if(ns.length>=2&&!bul.irN){
        bul.irN=ns[0];
        bul.irT=ns[1];
        bul.irM=ns[ns.length-1];
      } else if(ns.length>=2&&bul.irN&&!bul.irTPlein){
        bul.irTPlein=ns[1];
        bul.irMPlein=ns[ns.length-1];
      }
    }
    else if(/net\s+(?:à\s+payer|pay[eé])\s+avant/i.test(l)&&ns.length>=1){
      bul.netAvant=ns[ns.length-1];
    }
    else if(/^net\s+pay[eé]/i.test(l)&&ns.length>=1){
      bul.net=ns[ns.length-1];
    }
    else if(/RC\s+cumul[eé]/i.test(l)&&ns.length>=2){
      bul.rcAvant=ns[0];
      bul.rcApres=ns[ns.length-1];
    }
    else if(/cong[eé]s?\s+pay[eé]s?\s+ann[eé]e\s+N[^-]/i.test(l)&&ns.length>=1){
      bul.cpN={acquis:ns[0],pris:ns.length>1?ns[1]:0,solde:ns.length>2?ns[2]:0};
    }
  }

  for(const l of lines){
    const m=l.match(/net\s+pay[eé]\s*:\s*([\d\s,.]+)\s*euros?/i);
    if(m){bul.net=parseNum(m[1]);break}
  }

  bul.importedAt=new Date().toLocaleDateString('fr-FR');
  const moisKey=bul.mois||('inconnu-'+Date.now());
  const existing=DB.bulletins.findIndex(b=>b.mois===moisKey);
  if(existing>=0)DB.bulletins[existing]=bul;else DB.bulletins.push(bul);
  DB.bulletins.sort((a,b)=>(a.mois||'')>(b.mois||'')?1:-1);
  save();
  afficherBulletin(bul);
  renderBulHist();
}

function afficherBulletin(bul){
  const S=DB.s;
  $('bulResultCard').style.display='';
  $('bulMois').textContent=bul.mois||'';

  let calcTTE=0,calcH25=0,calcH50=0,calcIR=0,calcIRU=0,calcIDAJ=0,calcHab=0,calcFer=0,calcTrav=0,calcDim=0,calcRC=0;
  const mKey=bul.mois;
  let ancRefDate=null;

  if(mKey&&/^\d{4}-\d{2}$/.test(mKey)){
    const yr=+mKey.slice(0,4),mo=+mKey.slice(5,7);
    const first=mKey+'-01';
    const lastDate=new Date(yr,mo,0);
    const last=isoOf(lastDate);
    ancRefDate=last;

    let cur=first;
    while(cur<=last){
      const r=cd(cur);
      calcTTE   +=r.tte;
      calcIR    +=r.ir;
      calcIRU   +=r.iru;
      calcIDAJ  +=r.idaj;
      calcTrav  +=r.trav;
      calcRC    +=r.rc;
      if(r.fer)  calcFer+=r.tte;
      if(r.dim&&r.trav) calcDim++;
      cur=addD(cur,1);
    }
    calcHab=calcTrav*S.hab;

    const anchor=S.anchor;
    const diffFirst=nDays(anchor,first);
    let qStart=addD(anchor,Math.floor(diffFirst/14)*14);
    if(qStart>first)qStart=addD(qStart,-14);

    let qc=qStart;
    while(qc<=last){
      const qEnd=addD(qc,13);
      if(qc<=last&&qEnd>=first){
        const{Q}=calcPer(qc,1);
        const o=Q[0];
        const overlapStart=qc<first?first:qc;
        const overlapEnd=qEnd>last?last:qEnd;
        const jQuat=nDays(qc,qEnd)+1;
        const jOverlap=nDays(overlapStart,overlapEnd)+1;
        const ratio=jOverlap/jQuat;
        calcH25+=o.h25*ratio;
        calcH50+=o.h50*ratio;
      }
      qc=addD(qc,14);
      if(nDays(qStart,qc)>90)break;
    }
  }

  const rows=[];

  function addRow(label,bv,cv,unit,info){
    if(bv==null||isNaN(bv))return;

    /*
     * BULLETIN SPÉCIALISÉ :
     * les valeurs sont directement issues du bulletin employeur.
     * Le moteur historique ROMI/TTE n'est donc pas utilisé pour
     * fabriquer un faux "Calculé".
     */
    if(bul._specialized){
      rows.push({
        label,
        bul:bv,
        calc:null,
        diff:null,
        ok:true,
        unit,
        info:'Valeur extraite directement du bulletin — non recalculée'
      });
      return;
    }

    const tol=unit==='€'?0.50:unit==='€/h'?0.01:0.20;
    const d=bv-cv;
    const ok=Math.abs(d)<=tol;

    rows.push({
      label,
      bul:bv,
      calc:cv,
      diff:d,
      ok,
      unit,
      info:info||''
    });
  }

  const calcNorm=Math.max(calcTTE-calcH25-calcH50,0)/60;
  addRow('Heures normales',bul.hNorm,calcNorm,'h','Base 35h + CP/RC');
  if(bul.hs25H!=null)addRow('HS 25%',bul.hs25H,calcH25/60,'h','Heures au-delà des 70h/quatorzaine');
  if(bul.hs50H!=null)addRow('HS 50%',bul.hs50H,calcH50/60,'h','Heures au-delà du plafond HS 25%');
  if(bul.habH!=null)addRow('Habillage',bul.habH,calcHab/60,'h',''+calcTrav+' jours × '+S.hab+' min');
  if(bul.idajH!=null)addRow('IDAJ',bul.idajH,calcIDAJ/60,'h','Dépassement amplitude > '+S.idaj+'h');
  if(bul.irN!=null)addRow('Paniers IR (ext.)',bul.irN,calcIR,'repas','Pause extérieure couvrant la plage repas');
  if(bul.iruN!=null)addRow('Paniers IRU (int.)',bul.iruN,calcIRU,'repas','Pause intérieure couvrant la plage repas');
  if(bul.taux!=null)addRow('Taux horaire',bul.taux,S.taux,'€/h','');
  if(bul.brut!=null){
    const anc=calcAnc(S.emb||DEF.emb,ancRefDate),ancPct=S.anc||anc.pct;
    const calcBrutAvantAnc=
      calcNorm*S.taux
      +(calcH25/60)*S.taux*1.25
      +(calcH50/60)*S.taux*1.5
      +(calcHab/60)*S.habT
      +(calcIDAJ/60)*S.taux
      +calcFer/60*S.taux
      +(calcRC/60)*S.taux
      +(calcDim*S.dimPrime||0);
    // Part taxable IR (IR extérieur − part exonérée) : dans le brut comme sur le bulletin, hors base d'ancienneté.
    const irTaxable=calcIR*Math.max(0,(Number(S.ir)||0)-(Number(S.irT)||0));
    const calcBrut=calcBrutAvantAnc+(ancPct?calcBrutAvantAnc*ancPct/100:0)+irTaxable;
    addRow('Salaire brut',bul.brut,calcBrut,'€',(ancPct?'Inclut RC payé + prime ancienneté '+ancPct+'%':'Inclut RC payé')+(irTaxable?' + part taxable IR':''));
  }
  if(bul.net!=null){
    const calcNet=(bul.brut||0)*S.net+(calcIR*S.irT)+(calcIRU*S.iru);
    addRow('Net payé',bul.net,calcNet,'€','Brut × '+S.net+' + paniers');
  }

  const anomalies=rows.filter(r=>!r.ok);
  $('bulKpi').innerHTML=[
    ['Mois',bul.mois||'?'],
    ['Net payé',bul.net!=null?EUR(bul.net):'?',bul.net?'':'warn'],
    ['Brut',bul.brut!=null?EUR(bul.brut):'?',bul.brut?'':'warn'],
    ['HS 25%',bul.hs25H!=null?bul.hs25H.toFixed(2)+' h':'?',bul.hs25H?'warn':''],
    ['Écarts',anomalies.length,anomalies.length>0?'bad':''],
    ['Ancienneté',bul.ancienneteTxt||'?']
  ].map(x=>`<div class="kpi ${x[2]||''}"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');

  let tab='<tr><th>Élément</th><th class="n">Bulletin</th><th class="n">Calculé</th><th class="n">Écart</th><th></th></tr>';
  rows.forEach(r=>{
    const fmt=(v,u)=>{
      if(u==='€')return EUR(v);
      if(u==='€/h')return v.toFixed(4)+' €/h';
      if(u==='repas')return v.toFixed(0)+' repas';
      return v.toFixed(2)+' h';
    };
    const dAbs=Math.abs(r.diff);
    const dFmt=(r.diff>0?'+':'-')+fmt(dAbs,r.unit);
    tab+=`<tr title="${esc(r.info)}">
<td>${esc(r.label)}</td>
<td class="n">${fmt(r.bul,r.unit)}</td>
<td class="n">${r.calc==null?'—':fmt(r.calc,r.unit)}</td>
<td class="n ${r.ok?'ok':'bad'}">${r.ok?'✓':dFmt}</td>
<td>${r.ok?'✅':'🚩'}</td>
</tr>`;
  });
  $('bulTab').innerHTML=tab;

  let al='';
  if(anomalies.length===0){
    al='<div class="al k">✅ Bulletin lu et contrôlé — valeurs extraites directement du bulletin. Aucun recalcul automatique effectué.</div>';
  } else {
    al=`<div class="al b">🚩 <b>${anomalies.length} écart(s) détecté(s)</b> :</div>`;
    anomalies.forEach(r=>{
      const fmt=(v,u)=>u==='€'?EUR(v):(v.toFixed(u==='repas'?0:2)+' '+(u==='repas'?'repas':u));
      const sens=r.diff>0?'bulletin SUPÉRIEUR':'bulletin INFÉRIEUR';
      const ecart=fmt(Math.abs(r.diff),r.unit);
      al+=`<div class="al b">🚩 <b>${esc(r.label)}</b> : ${sens} de <b>${ecart}</b>
<br><span class="mut">Bulletin : ${fmt(r.bul,r.unit)} · Calculé : ${fmt(r.calc,r.unit)}${r.info?' · '+esc(r.info):''}</span></div>`;
    });
    al+=`<div class="al w" style="margin-top:6px">
⚠️ Un écart peut venir d'un arrondi, d'un jour non saisi dans l'appli, ou d'une vraie erreur de l'employeur.<br>
<b>Tolérance appliquée :</b> ±0,20h pour les durées, ±0,50€ pour les montants, ±0,01€/h pour les taux.
</div>`;
  }

  if(bul.ancienneteTxt){
    const ancCalc=calcAnc(S.emb||DEF.emb,ancRefDate);
    const ok2=ancCalc.y===parseInt(bul.ancienneteTxt)||bul.ancienneteTxt.includes(ancCalc.y+' an');
    al+=`<div class="al ${ok2?'i':'w'}">
👤 Ancienneté bulletin : <b>${bul.ancienneteTxt}</b>
— Calculée depuis le ${S.emb} : <b>${ancCalc.y} ans ${ancCalc.m} mois</b>
(taux CCN auto : <b>${ancCalc.pct}%</b>)
</div>`;
  }

  if(bul.rcAvant!=null&&bul.rcApres!=null){
    al+=`<div class="al i">⏱️ RC bulletin : avant <b>${bul.rcAvant.toFixed(2)}h</b> → après <b>${bul.rcApres.toFixed(2)}h</b> (acquis ce mois : <b>${(bul.rcApres-bul.rcAvant).toFixed(2)}h</b>)</div>`;
  }

  if(bul.cpN1){
    al+=`<div class="al i">🏖️ CP année N-1 — Acquis : <b>${bul.cpN1.acquis}</b> · Pris : <b>${bul.cpN1.pris}</b> · Solde : <b>${bul.cpN1.solde}</b></div>`;
  }

  if(bul.cpN){
    al+=`<div class="al i">🏖️ CP année N — Acquis : <b>${bul.cpN.acquis}</b> · Pris : <b>${bul.cpN.pris}</b> · Solde : <b>${bul.cpN.solde}</b></div>`;
  }

  $('bulAl').innerHTML=al;
  $('bulOut').innerHTML='<div class="al k">✅ Bulletin analysé avec succès.</div>';
}

function renderBulHist(){
  if(!DB.bulletins||!DB.bulletins.length){
    $('bulHist').innerHTML='<div class="al i">Aucun bulletin importé pour l\'instant.</div>';
    return;
  }
  let h='<table><tr><th>Mois</th><th class="n">Brut</th><th class="n">Net</th><th class="n">HS 25%</th><th class="n">HS 50%</th><th></th></tr>';
  DB.bulletins.forEach((b,i)=>{
    h+=`<tr>
<td><a href="#" onclick="afficherBulletin(DB.bulletins[${i}]);$('bulResultCard').style.display='';return false" style="color:var(--blue)">${b.mois||'?'}</a></td>
<td class="n">${b.brut?EUR(b.brut):'?'}</td>
<td class="n">${b.net?EUR(b.net):'?'}</td>
<td class="n">${b.hs25H!=null?b.hs25H.toFixed(2)+' h':'—'}</td>
<td class="n">${b.hs50H!=null?b.hs50H.toFixed(2)+' h':'—'}</td>
<td><button class="r" style="padding:4px 8px;font-size:11px" onclick="DB.bulletins.splice(${i},1);save();mhRefresh('bulletin-delete')">✕</button></td>
</tr>`;
  });
  h+='</table>';
  $('bulHist').innerHTML=h;
}

function numsOfLineStrict(l){
  return [...l.matchAll(/\d+(?:[.,]\d+)?/g)].map(m=>parseNum(m[0])).filter(n=>!isNaN(n)&&n>0);
}

function cap(v,max){return(v!=null&&v<=max)?v:undefined}

function extractRomiFields(raw){
  const t=String(raw||'')
    .replace(/\u00a0/g,' ')
    .replace(/[–—−]/g,'-')
    .replace(/\r/g,'\n');

  const lines=t.split('\n')
    .map(x=>x.replace(/\s+/g,' ').trim())
    .filter(Boolean);

  const f={};
  const rejected=[];

  function num(v){
    const n=parseFloat(String(v).replace(/\s/g,'').replace(',','.'));
    return Number.isFinite(n)?n:null;
  }

  function nums(line){
    return (String(line||'').match(/-?\d+(?:[.,]\d+)?/g)||[])
      .map(num).filter(v=>v!=null);
  }

  function set(k,v,min,max){
    if(v==null||!Number.isFinite(v))return;
    if((min!=null&&v<min)||(max!=null&&v>max)){
      rejected.push(k+':'+v);
      return;
    }
    f[k]=v;
  }

  function after(re){
    for(let i=0;i<lines.length;i++){
      if(re.test(lines[i])){
        for(let j=i;j<Math.min(lines.length,i+6);j++){
          const n=nums(lines[j]);
          if(n.length)return n;
        }
      }
    }
    return [];
  }

  function afterExcluding(re,excluded){
    for(let i=0;i<lines.length;i++){
      if(re.test(lines[i])){
        const out=[];
        for(let j=i;j<Math.min(lines.length,i+6);j++){
          const clean=lines[j].replace(excluded,' ');
          nums(clean).forEach(v=>out.push(v));
        }
        if(out.length)return out;
      }
    }
    return [];
  }

  const per=t.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})[\s\S]{0,500}?(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if(per){
    f.start=per[3]+'-'+per[2]+'-'+per[1];
    f.end=per[6]+'-'+per[5]+'-'+per[4];
  }

  let a;

  a=after(/heures?\s*T\.?\s*T\.?\s*E\.?/i);
  if(a.length>=2){
    set('tteH',a[0],0,400);
    set('tteAnneeH',a[1],0,3000);
  }

  a=after(/jours?\s+de\s+pr[eé]sence/i);
  if(a.length>=2){
    set('joursPresence',a[0],0,31);
    set('joursAnnee',a[1],0,366);
  }

  a=after(/heures?\s+suppl[eé]mentaires?/i);
  if(a.length>=2){
    set('hsPeriodeH',a[0],0,200);
    set('hsAnneeH',a[1],0,1000);
  }

  a=after(/CP\s*N-?1|cong[eé]s\s+N-?1/i);
  if(a.length)set('cpN1Solde',a[0],0,60);

  a=after(/CP\s*N\b|cong[eé]s\s+N\b/i);
  if(a.length>=3){
    set('cpNAcquis',a[0],0,60);
    set('cpNPris',a[1],0,60);
    set('cpNSolde',a[2],0,60);
  }

  a=after(/RC\s+(?:solde\s+ant[eé]rieur|ant[eé]rieur)/i);
  if(a.length)set('rcAvant',a[0],0,1000);

  a=after(/RC\s+acquis/i);
  if(a.length)set('rcAcquis',a[0],0,500);

  a=after(/RC\s+(?:cumul[eé]|solde\s+cumul[eé])/i);
  if(a.length)set('rcSolde',a[0],0,1000);

  a=after(/salaire\s+de\s+base/i);
  if(a.length)set('salaireBaseH',a[0],0,400);

  a=afterExcluding(/d[eé]passement.*amplitude|amplitude.*d[eé]passement/i,/100\s*%/i);
  if(a.length)set('depAmplH',a[0],0,50);

  a=afterExcluding(/125\s*%/i,/125\s*%/gi);
  if(a.length>=1)set('hs125EligH',a[0],0,200);
  if(a.length>=2)set('hs125PayeesH',a[1],0,200);

  a=afterExcluding(/150\s*%/i,/150\s*%/gi);
  if(a.length>=1)set('hs150EligH',a[0],0,200);
  if(a.length>=2)set('hs150PayeesH',a[1],0,200);

  a=after(/anciennet[eé]/i);
  if(a.length)set('primeAncPct',a[0],0,20);

  a=after(/habillage|d[eé]shabillage/i);
  if(a.length)set('habillageMontant',a[a.length-1],0,500);

  a=after(/repas\s+unique/i);
  if(a.length)set('indemniteRepasUniqueN',a[0],0,31);

  a=after(/indemnit[eé].*repas/i);
  if(a.length)set('indemniteRepasN',a[0],0,31);

  if(f.hs125EligH!=null&&f.hs125PayeesH!=null&&f.hs125PayeesH>f.hs125EligH){
    const x=f.hs125EligH;
    f.hs125EligH=f.hs125PayeesH;
    f.hs125PayeesH=x;
  }

  if(f.hs150EligH!=null&&f.hs150PayeesH!=null&&f.hs150PayeesH>f.hs150EligH){
    const x=f.hs150EligH;
    f.hs150EligH=f.hs150PayeesH;
    f.hs150PayeesH=x;
  }

  const required=[
    'tteH','joursPresence','hsPeriodeH','tteAnneeH','hsAnneeH',
    'rcAvant','rcAcquis','rcSolde','salaireBaseH','depAmplH',
    'hs125EligH','hs125PayeesH','hs150EligH','hs150PayeesH'
  ];

  f._missing=required.filter(k=>f[k]==null);
  f._rejected=rejected;

  return f;
}

function renderRomiTab(){
  const keys=Object.keys(DB.romi).sort();
  const last=keys.length?DB.romi[keys[keys.length-1]]:null;
  if(!romiTmp._loaded&&last){romiTmp={...last};romiTmp._loaded=true}
  $('rmStart').value=romiTmp.start||'';
  $('rmStart').onchange=e=>{romiTmp.start=e.target.value};
  $('rmEnd').value=romiTmp.end||'';
  $('rmEnd').onchange=e=>{romiTmp.end=e.target.value};
  $('rmFields').innerHTML=RM_FIELDS.map(([k,l])=>
    `<div><label>${l}</label><input type="number" step="0.01" value="${romiTmp[k]??0}" oninput="romiTmp['${k}']=parseFloat(this.value)||0"></div>`
  ).join('');
  renderRomiHist();
  if(last)afficherRomi(last);
}

function saveRomi(){
  const start=$('rmStart').value,end=$('rmEnd').value;
  if(!start||!end){$('romiOut').innerHTML='<div class="al w">Renseigne au moins le début et la fin de période.</div>';return}
  const entry={...romiTmp,start,end,importedAt:new Date().toLocaleDateString('fr-FR')};
  delete entry._loaded;delete entry._rejected;
  DB.romi[start]=entry;
  save();
  $('romiOut').innerHTML='<div class="al k">✅ Relevé ROMI1 enregistré.</div>';
  afficherRomi(entry);
  renderRomiHist();
  romiTmp={_loaded:true};
  $('romiRawTxt').value='';
  $('romiOcrOut').innerHTML='';
  renderRomiTab();
}

function loadRomi(start){
  const e=DB.romi[start];if(!e)return;
  romiTmp={...e,_loaded:true};
  renderRomiTab();
  window.scrollTo(0,0);
}

function deleteRomi(start){
  delete DB.romi[start];save();mhRefresh('romi-save');
}

function afficherRomi(e){
  $('romiResultCard').style.display='';
  $('romiPerLbl').textContent=short(e.start)+' → '+short(e.end);
  const rcNonPaye=Math.max((e.hs125EligH||0)-(e.hs125PayeesH||0),0)+Math.max((e.hs150EligH||0)-(e.hs150PayeesH||0),0);
  $('romiKpi').innerHTML=[
    ['TTE période',e.tteH?F(e.tteH*60):'—'],
    ['Jours présence',e.joursPresence||'—'],
    ['RC solde cumulé',e.rcSolde?e.rcSolde.toFixed(2)+' h':'—',e.rcSolde>DB.s.rcAlerte?'bad':''],
    ['HS converties en RC',rcNonPaye?rcNonPaye.toFixed(2)+' h':'0 h',rcNonPaye>0?'warn':''],
    ['Prime ancienneté',e.primeAncPct?e.primeAncPct+' %':'—'],
    ['Valeur RC',EUR(rcNonPaye*DB.s.taux)]
  ].map(x=>`<div class="kpi ${x[2]||''}"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');

  let al='';
  if(rcNonPaye>0.05){
    al+=`<div class="al b">🚩 <b>${rcNonPaye.toFixed(2)} h</b> d'heures supplémentaires converties en repos compensateur au lieu d'être payées.
<br><span class="mut">Article 3.2 de l'accord-cadre du 4 mai 2000 (CCN IDCC 16) : cette conversion nécessite une demande écrite du salarié. Sans cette demande, tu peux exiger le paiement en espèces du stock de RC correspondant.</span></div>`;
  } else {
    al+='<div class="al k">✅ Aucune conversion HS → RC détectée sur ce relevé.</div>';
  }
  const keys=Object.keys(DB.romi).sort();
  const idx=keys.indexOf(e.start);
  if(idx>0){
    const prev=DB.romi[keys[idx-1]];
    if(prev.rcSolde!=null&&e.rcAvant!=null){
      const ec=e.rcAvant-prev.rcSolde;
      if(Math.abs(ec)>0.1)al+=`<div class="al w">⚠️ Le solde RC antérieur de ce relevé (${e.rcAvant.toFixed(2)} h) ne correspond pas au solde cumulé du relevé précédent (${prev.rcSolde.toFixed(2)} h) — écart de ${ec.toFixed(2)} h.</div>`;
    }
  }
  if(e.primeAncPct!=null){
    const anc=calcAnc(DB.s.emb||DEF.emb);
    if(e.primeAncPct!==anc.pct)al+=`<div class="al w">⚠️ Prime ancienneté du relevé : ${e.primeAncPct} % — calculée depuis le ${DB.s.emb} : ${anc.y} ans ${anc.m} mois → ${anc.pct} % attendu (art. 12.4 CCN).</div>`;
  }
  if(e.start&&e.end){
    let calcTte=0,cur=e.start;
    while(cur<=e.end){calcTte+=cd(cur).tte;cur=addD(cur,1)}
    if(calcTte>0&&e.tteH){
      const ec=e.tteH-calcTte/60;
      al+=`<div class="al ${Math.abs(ec)<0.3?'k':'i'}">${Math.abs(ec)<0.3?'✅':'ℹ️'} TTE app (saisie jour par jour) sur la même période : <b>${F(calcTte)}</b> vs ROMI1 : <b>${e.tteH.toFixed(2)} h</b>${Math.abs(ec)>=0.3?' — écart '+ec.toFixed(2)+' h':''}</div>`;
    }
  }
  $('romiAl').innerHTML=al;
}

function renderRomiHist(){
  const keys=Object.keys(DB.romi).sort();
  if(!keys.length){$('romiHist').innerHTML='<div class="al i">Aucun relevé ROMI1 enregistré pour l\'instant.</div>';return}
  let h='<table><tr><th>Période</th><th class="n">TTE</th><th class="n">RC solde</th><th></th></tr>';
  keys.forEach(k=>{
    const e=DB.romi[k];
    h+=`<tr><td><a href="#" onclick="loadRomi('${k}');return false" style="color:var(--blue)">${short(e.start)}→${short(e.end)}</a></td>
<td class="n">${e.tteH?e.tteH.toFixed(2)+' h':'—'}</td>
<td class="n">${e.rcSolde?e.rcSolde.toFixed(2)+' h':'—'}</td>
<td><button class="r" style="padding:4px 8px;font-size:11px" onclick="deleteRomi('${k}')">✕</button></td></tr>`;
  });
  h+='</table>';
  $('romiHist').innerHTML=h;
}

async function parsePdfFile(file){
  const out=$('impOut');if(!file)return;
  out.innerHTML='<div class="al i">⏳ Chargement du lecteur PDF…</div>';
  try{await mhLoadLib('pdf')}catch(err){out.innerHTML='<div class="al b">❌ '+esc(err.message)+'</div>';return}
  const lib=window.pdfjsLib||window['pdfjs-dist/build/pdf'];
  if(!lib){out.innerHTML='<div class="al b">❌ PDF.js non chargé.</div>';return}
  if(!_wset){lib.GlobalWorkerOptions.workerSrc=PDF_WORKER;_wset=true;}
  out.innerHTML='<div class="al i">⏳ Lecture du PDF AmbuTrack…</div>';
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const pdf=await lib.getDocument({data:new Uint8Array(e.target.result)}).promise;
      let text='';
      for(let p=1;p<=pdf.numPages;p++){
        const pg=await pdf.getPage(p),ct=await pg.getTextContent();
        let line='',py=null,px=null;
        ct.items.forEach(it=>{
          const x=it.transform[4],y=it.transform[5];
          if(py!=null&&Math.abs(y-py)>2){text+=line+'\n';line=''}
          else if(px!=null&&x-px>(it.height||10)*0.22)line+=' ';
          line+=it.str;py=y;px=x+(it.width||0);
        });
        text+=line+'\n';
      }
      if(!text.trim()){out.innerHTML='<div class="al b">❌ Aucun texte extrait.</div>';return}
      $('impTxt').value=text;parsePDF();
    }catch(err){out.innerHTML='<div class="al b">❌ '+esc(err.message)+'</div>';}
  };
  reader.onerror=()=>{out.innerHTML='<div class="al b">❌ Fichier illisible.</div>'};
  reader.readAsArrayBuffer(file);$('fpdf').value='';
}

function parsePDF(){
  const out=$('impOut'),raw=$('impTxt').value;
  if(!raw.trim()){out.innerHTML='<div class="al w">Colle d\'abord le texte.</div>';return}
  const t=raw.replace(/\u00a0/g,' ').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
  RX_PER.lastIndex=0;
  const marks=[...t.matchAll(RX_PER)];
  if(!marks.length){out.innerHTML='<div class="al b">❌ Ligne « Période du … au … » introuvable.</div>';return}
  pushUndo('Import PDF AmbuTrack');
  let html='',tot=0,allFer=[];
  marks.forEach((m,i)=>{
    const blk=t.slice(m.index,i+1<marks.length?marks[i+1].index:t.length);
    const st=m[3]+'-'+pad(+m[2])+'-'+pad(+m[1]),en=m[6]+'-'+pad(+m[5])+'-'+pad(+m[4]);
    const R=parseBlock(blk,st,en);tot+=R.n;R.fer.forEach(k=>allFer.push(k));
    html+=`<div class="al ${R.n?'k':'b'}"><b>${shortY(st)} → ${shortY(en)}</b> — ${R.n} journées</div>`;
    if(R.warn.length)html+='<div class="al w">⚠️ '+R.warn.join(' · ')+'</div>';
  });
  save();
  out.innerHTML=`<div class="al k"><b>✅ ${tot} journées importées</b></div>`+html
    +(allFer.length?'<div class="al w">☀️ Fériés : '+allFer.map(shortY).join(', ')+'</div>':'');
  if(tot){curDate=marks[0][3]+'-'+pad(+marks[0][2])+'-'+pad(+marks[0][1]);curMonth=curDate.slice(0,7)}
  mhRefresh();
}

function parseBlock(b,st,en){
  const S=DB.s,pd=P(S.panDeb),pf=P(S.panFin);
  RX_DAY.lastIndex=0;const rows=[...b.matchAll(RX_DAY)];
  const rep={T:0,REPOS:0,RC:0,CP:0,MAL:0},fer=[],warn=[];
  let cur=st,n=0;
  rows.forEach(r=>{
    const dn=+r[1];let g=0;
    while(+cur.slice(8)!==dn&&g<45){cur=addD(cur,1);g++}
    if(g>=45){warn.push('jour '+dn+' non replacé');return}
    const k=cur,txt=r[3];cur=addD(cur,1);
    let ty='REPOS';
    if(/REPOS ?COMP/i.test(txt))ty='RC';
    else if(/TRAVAIL/i.test(txt))ty='T';
    else if(/CONG[EÉ]/i.test(txt))ty='CP';
    else if(/MALAD|ACCID|\bAT\b/i.test(txt))ty='MAL';
    const d={t:ty,p:[]};
    if(ty==='T'){
      RX_HOR.lastIndex=0;const hh=txt.match(RX_HOR);
      if(hh){d.deb=hh[1];d.fin=hh[2]}else warn.push(short(k)+' horaires illisibles');
      const a=P(d.deb),z=P(d.fin);RX_PZ.lastIndex=0;
      const mealTypes=[]; [...txt.matchAll(RX_PZ)].forEach(p=>{d.p.push({d:p[1],f:p[2]});mealTypes.push(p[3])}); if(mealTypes.includes('ENT'))d.panier='ENT'; else if(mealTypes.includes('EXT'))d.panier='EXT';
      if(isFerie(k)){d.fer=true;fer.push(k)}
    }
    rep[ty]++;DB.days[k]=d;n++;
  });
  if(n){
    const days=nDays(st,en)+1,nb=Math.max(1,Math.round(days/14));
    const ex=DB.periods.find(p=>p.start===st);
    if(ex)ex.nb=nb;else DB.periods.push({start:st,nb});
    DB.periods.sort((a,b)=>a.start<b.start?-1:1);gb(st);DB.per={start:st,nb};
  }
  return{n,rep,fer,warn};
}

function excelDate(v){
  if(v==null||v==='')return null;
  if(v instanceof Date)return isoOf(v);
  if(typeof v==='number')return isoOf(new Date(Math.round((v-25569)*86400*1000)));
  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return m[1]+'-'+pad(+m[2])+'-'+pad(+m[3]);
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return m[3]+'-'+pad(+m[2])+'-'+pad(+m[1]);
  return null;
}

async function parseExcel(file){
  const out=$('impOut');if(!file)return;
  if(typeof XLSX==='undefined'){
    out.innerHTML='<div class="al i">⏳ Chargement du lecteur Excel…</div>';
    try{await mhLoadLib('xlsx')}catch(err){out.innerHTML='<div class="al b">❌ '+esc(err.message)+'</div>';return}
  }
  const reader=new FileReader();
  reader.onload=function(e){
    let wb;
    try{wb=XLSX.read(e.target.result,{type:'array',cellDates:true})}
    catch(err){out.innerHTML='<div class="al b">❌ Fichier Excel invalide.</div>';return}
    const wsName=wb.SheetNames.includes('Gardes')?'Gardes':wb.SheetNames[0];
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wsName],{defval:''});
    if(!rows.length){out.innerHTML='<div class="al b">❌ Aucune ligne.</div>';return}
    const S=DB.s,pdMin=P(S.panDeb),pfMin=P(S.panFin);
    const rep={T:0,REPOS:0,RC:0,CP:0,MAL:0},fer=[],warnNuit=[],warnH=[],dates=[];
    let n=0;
    pushUndo('Import Excel');
    rows.forEach(row=>{
      const k=excelDate(row['Date']);if(!k)return;
      const type=String(row['Type']||'').trim();if(!type)return;
      let ty='REPOS';
      if(/travail/i.test(type))ty='T';
      else if(/repos ?comp/i.test(type))ty='RC';
      else if(/repos/i.test(type))ty='REPOS';
      else if(/cong[eé]/i.test(type))ty='CP';
      else if(/malad|accid|\bAT\b/i.test(type))ty='MAL';
      else return;
      const d={t:ty,p:[]};
      if(ty==='T'){
        const nuit=String(row['Nuit']||'').trim();
        const deb=String(row['Début']||'').trim(),fin=String(row['Fin']||'').trim();
        if(nuit&&deb==='00:00'&&fin==='00:00'){warnNuit.push(k);return}
        if(!/^\d{1,2}:\d{2}$/.test(deb)||!/^\d{1,2}:\d{2}$/.test(fin)){warnH.push(k);return}
        d.deb=deb;d.fin=fin;
        const sa=P(deb);let sb=P(fin);if(sb<=sa)sb+=1440;
        const panOK=sa<=pdMin&&sb>=pfMin;
        const pz=String(row['Pauses']||'').trim();
        if(pz&&pz!=='-'){
          const pm=pz.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):?(\d{2})$/);
          if(pm){const pS=pad(+pm[1])+':'+pm[2],pE=pad(+pm[3])+':'+pm[4];
            d.p.push({d:pS,f:pE});}
        }
        if(isFerie(k)){d.fer=true;fer.push(k)}
      }
      const note=String(row['Note']||'').trim();if(note)d.note=note;
      DB.days[k]=d;rep[ty]++;n++;dates.push(k);
    });
    if(!n){out.innerHTML='<div class="al b">❌ Aucune journée exploitable.</div>';return}
    dates.sort();const first=dates[0],last=dates[dates.length-1];
    let qs=addD(S.anchor,Math.floor(nDays(S.anchor,first)/14)*14),nbPer=0;
    while(qs<=last){if(!DB.periods.some(p=>p.start===qs)){DB.periods.push({start:qs,nb:1});nbPer++}gb(qs);qs=addD(qs,14);}
    DB.periods.sort((a,b)=>a.start<b.start?-1:1);
    DB.per={start:DB.periods[DB.periods.length-1].start,nb:1};save();
    out.innerHTML=`<div class="al k"><b>✅ ${n} journées importées</b> du ${shortY(first)} au ${shortY(last)}</div>`
      +(fer.length?'<div class="al w">☀️ Fériés : '+fer.map(shortY).join(', ')+'</div>':'')
      +(warnNuit.length?'<div class="al b">🌙 '+warnNuit.length+' nuit(s) 00:00-00:00 à corriger manuellement.</div>':'')
      +(warnH.length?'<div class="al w">⚠️ Horaires illisibles : '+warnH.map(shortY).join(', ')+'</div>':'');
    curDate=last;curMonth=last.slice(0,7);mhRefresh();
  };
  reader.readAsArrayBuffer(file);$('fx').value='';
}
