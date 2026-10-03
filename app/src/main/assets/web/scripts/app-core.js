const LS='mesheures_v3';
const DEF={
  nom:'',emb:'2019-09-09',
  taux:14.20,net:0.787,
  hab:10,habT:12.9688,
  idaj:12,base:35,pl:16,
  ir:5.30,iru:9.69,irT:10.40,
  rc:420,cp:420,anc:0,
  min:false,maxAmp:14,
  anchor:'2025-05-19',
  panDeb:'11:45',panFin:'14:15',
  dimPrime:0,
  nuitDeb:'21:00',nuitFin:'06:00',nuitMaj:0,
  rcAlerte:400
};
let DB={s:{...DEF},days:{},cmp:{},periods:[],bul:{},bulletins:[],romi:{},per:{start:'2025-05-19',nb:1},exp:null};
let curDate,curMonth,curTab='home';
let _undo=null;

const $=i=>document.getElementById(i);
const pad=n=>String(n).padStart(2,'0');
const isoOf=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>isoOf(new Date());
const dOf=s=>new Date(s+'T12:00:00');
const addD=(s,n)=>{const d=dOf(s);d.setDate(d.getDate()+n);return isoOf(d)};
const nDays=(a,b)=>Math.round((dOf(b)-dOf(a))/864e5);
const DOW=['dim','lun','mar','mer','jeu','ven','sam'];
const MON=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const dow=s=>DOW[dOf(s).getDay()];
const dowN=s=>dOf(s).getDay();
const mono=s=>{const d=dOf(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return isoOf(d)};
const P=s=>{if(!s||!/^\d{1,2}:\d{2}/.test(s))return null;const[h,m]=s.split(':').map(Number);return h*60+m};
const F=m=>{if(m==null)return'—';const g=m<0;m=Math.abs(Math.round(m));return(g?'-':'')+Math.floor(m/60)+'h'+pad(m%60)};
const C2=m=>(m/60).toFixed(2);
const EUR=n=>typeof n==='number'?n.toFixed(2).replace('.',',')+' €':'—';
const short=s=>s.slice(8)+'/'+s.slice(5,7);
const shortY=s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(2,4);
const esc=s=>s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):'';
// Chargement paresseux des libs lourdes (xlsx, pdf.js, tesseract) :
// avant, les 3 étaient chargées à CHAQUE démarrage de l'app même sans import/OCR
// (plusieurs Mo de JS téléchargés et parsés pour rien à chaque ouverture).
// Maintenant : chargées une seule fois, seulement quand une fonction en a besoin.
const _mhLibCache={};
const _mhLibSrc={
  xlsx:'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  pdf:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js',
  tesseract:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  tesseractWorker:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  tesseractCore:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
  tesseractLang:'https://tessdata.projectnaptha.com/4.0.0'
};
function mhLoadLib(name){
  if(_mhLibCache[name])return _mhLibCache[name];
  return _mhLibCache[name]=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=_mhLibSrc[name];
    s.onload=()=>resolve(true);
    s.onerror=()=>{delete _mhLibCache[name];reject(new Error('Échec de chargement : '+name+' (vérifie la connexion)'))};
    document.head.appendChild(s);
  });
}
function parseNum(s){return parseFloat(s.replace(/\s/g,'').replace(',','.'))||0}
function numsOfLine(l){
  const matches=[...l.matchAll(/([\d][\d\s]*(?:[.,]\d+)?)/g)];
  return matches.map(m=>parseNum(m[0])).filter(n=>!isNaN(n)&&n>0);
}

function easterOf(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,
  f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
  i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,
  m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),
  da=((h+l-7*m+114)%31)+1;
  return new Date(y,mo-1,da,12);
}
const FC={};
function feriesY(y){
  if(FC[y])return FC[y];
  const s=new Set([y+'-01-01',y+'-05-01',y+'-05-08',y+'-07-14',y+'-08-15',y+'-11-01',y+'-11-11',y+'-12-25']);
  const e=easterOf(y);
  [1,39,50].forEach(n=>{const d=new Date(e);d.setDate(d.getDate()+n);s.add(isoOf(d))});
  return FC[y]=s;
}
const isFerie=k=>feriesY(+k.slice(0,4)).has(k);

function calcAnc(emb,refDate){
  if(!emb)return{y:0,m:0,pct:0,nextPct:2,nextYears:2};
  const e=dOf(emb);
  const n=refDate
    ? new Date(String(refDate).slice(0,10)+'T12:00:00')
    : new Date();
  let y=n.getFullYear()-e.getFullYear(),mo=n.getMonth()-e.getMonth();
  /*
   * Un mois n'est compté que lorsqu'il est entièrement écoulé.
   * Exemple : entrée le 09/09/2019 et date du 02/10/2026
   * = 7 ans et 0 mois, pas 7 ans et 1 mois.
   */
  if(n.getDate()<e.getDate()){
    mo--;
  }
  if(mo<0){y--;mo+=12}
  // Convention collective nationale des transports routiers — transport sanitaire.
  // L'ambulancier relève du personnel ouvrier : 2 % après 2 ans, 4 % après 5 ans,
  // 6 % après 10 ans et 8 % après 15 ans. On ne doit surtout pas appliquer 1 point
  // supplémentaire par année (ancien comportement erroné de l'application).
  const steps=[[2,2],[5,4],[10,6],[15,8]];
  let pct=0,nextPct=2,nextYears=2;
  for(const [years,rate] of steps){
    if(y>=years)pct=rate;
    else if(nextYears===2&&years>y) { nextYears=years; nextPct=rate; }
  }
  if(y>=15){nextYears=15;nextPct=8}
  return{y,m:mo,pct,nextPct,nextYears};
}


function cdRaw(k){
  const d=DB.days[k],S=DB.s;
  const r={amp:0,tte:0,seuil:0,idaj:0,ir:0,iru:0,rc:0,fer:0,dim:0,trav:0,pz:0,nuit:0,al:[],deb:null,fin:null,t:d?d.t:null};
  if(!d)return r;
  const isDim=dowN(k)===0;
  if(d.t==='T'){
    const a=P(d.deb);
    let b0=P(d.fin);
    if(b0==null && d.running && d.startEpoch){ const now=new Date(); b0=now.getHours()*60+now.getMinutes(); }
    if(a==null||b0==null){r.al.push({lvl:'b',m:'Horaires incomplets'});return r}
    const b=b0<=a?b0+1440:b0, br=b-a;
    const pd=P(S.panDeb),pf=P(S.panFin),panOK=a<=pd&&b>=pf;
    (d.p||[]).forEach(p=>{
      const x=P(p.d); let y=P(p.f);
      if(x!=null&&y!=null){if(y<x)y+=1440;r.pz+=y-x}
    });
    // Panier repas : plus besoin de saisir une pause pour qu'il soit compté.
    // d.panier ('EXT'/'ENT'/'NON') = choix explicite en 1 tap qui prévaut toujours.
    // Sans choix explicite : si des pauses ENT/EXT sont déjà saisies (import AmbuTrack), on les garde ;
    // sinon, dès que le service couvre toute la plage repas, un panier extérieur est compté automatiquement.
    if(d.panier==='NON'){/* aucun panier, forcé */}
    else if(d.panier==='ENT')r.iru=1;
    else if(d.panier==='EXT')r.ir=1;
    else if(panOK&&(d.p||[]).length){
      // Un seul panier par jour, même si plusieurs pauses sont saisies : priorité au repas intérieur si les deux types coexistent.
      const hasEnt=(d.p||[]).some(p=>p.ty==='ENT');
      if(hasEnt)r.iru=1;else r.ir=1;
    }
    else if(panOK)r.ir=1;
    r.amp=br; r.tte=br-r.pz;
    if(S.min&&r.tte<270)r.tte=270;
    r.seuil=r.tte; r.trav=1;
    r.deb=a; r.fin=b;
    r.idaj=Math.max(0,r.amp-S.idaj*60);
    if(d.fer)r.fer=r.tte;
    if(isDim)r.dim=1;
    r.nuit=minutesNuit(a,b,S);
    if(r.amp>S.maxAmp*60)r.al.push({lvl:'b',m:'Amplitude '+F(r.amp)+' > '+S.maxAmp+'h réglementaires'});
    if(r.pz===0&&r.tte>=360)r.al.push({lvl:'w',m:'≥ 6h travaillées sans pause — 20 min dues (art. L3121-16)'});
    if(isFerie(k)&&!d.fer)r.al.push({lvl:'w',m:'Jour férié travaillé — majoration 100 % non cochée'});
    if(r.tte>660)r.al.push({lvl:'w',m:'TTE > 11h — journée exceptionnellement longue'});
  }
  else if(d.t==='CP')r.seuil=S.cp;
  else if(d.t==='RC')r.rc=S.rc;
  else if(d.t==='NUIT'){
    const a=P(d.deb);
    let b0=P(d.fin);
    if(b0==null && d.running && d.startEpoch){ const now=new Date(); b0=now.getHours()*60+now.getMinutes(); }
    if(a!=null&&b0!=null){
      const b=b0<=a?b0+1440:b0,br=b-a;
      (d.p||[]).forEach(p=>{const x=P(p.d);let y=P(p.f);if(x!=null&&y!=null){if(y<x)y+=1440;r.pz+=y-x}});
      r.amp=br; r.tte=br-r.pz;
      r.seuil=r.tte; r.trav=1; r.deb=a; r.fin=b;
      r.nuit=minutesNuit(a,b,S);
    }
  }
  return r;
}

/* V30 DATA ENGINE — canonical memoized calculation layer.
 * Raw records remain in DB. Derived legal/pay metrics are cached by revision.
 * A save() invalidates the revision; renders then reuse the same computed snapshot.
 */
const MH30DataEngine=(function(){
  let revision=0;
  const dayCache=new Map(), monthCache=new Map(), periodCache=new Map(), brutCache=new Map();
  function invalidate(reason){
    revision++;
    dayCache.clear(); monthCache.clear(); periodCache.clear(); brutCache.clear();
    try{document.dispatchEvent(new CustomEvent('mh30:data-invalidated',{detail:{revision,reason:reason||'state'}}))}catch(e){}
    return revision;
  }
  function day(k){
    if(dayCache.has(k))return dayCache.get(k);
    const r=cdRaw(k); dayCache.set(k,r); return r;
  }
  function month(ym){
    if(monthCache.has(ym))return monthCache.get(ym);
    const [y,m]=ym.split('-').map(Number),last=isoOf(new Date(y,m+1,0));
    const out={amp:0,tte:0,trav:0,ir:0,iru:0,idaj:0,nuit:0,fer:0,dim:0,alerts:[],hard:0,warn:0,days:0};
    for(let k=ym+'-01';k<=last;k=addD(k,1)){
      const r=day(k),d=DB.days[k];
      if(d)out.days++;
      out.amp+=r.amp;out.tte+=r.tte;out.trav+=r.trav;out.ir+=r.ir;out.iru+=r.iru;out.idaj+=r.idaj;out.nuit+=r.nuit;out.fer+=r.fer;out.dim+=r.dim;
      r.al.forEach(a=>{out.alerts.push({k,...a});a.lvl==='b'?out.hard++:out.warn++});
    }
    monthCache.set(ym,out); return out;
  }
  function period(start,nb){
    const key=start+'|'+nb;
    if(periodCache.has(key))return periodCache.get(key);
    /* calcPer is patched below to call cd(), so this delegates to the canonical engine. */
    const result=calcPerRaw(start,nb); periodCache.set(key,result); return result;
  }
  function brut(G){
    const key=JSON.stringify(G);
    if(brutCache.has(key))return brutCache.get(key);
    const result=brutOfRaw(G); brutCache.set(key,result); return result;
  }
  function stats(){return {revision,day:dayCache.size,month:monthCache.size,period:periodCache.size,brut:brutCache.size}}
  return {invalidate,day,month,period,brut,stats};
})();
function cd(k){return MH30DataEngine.day(k)}
window.MH30DataEngine=MH30DataEngine

// Current — canonical read-only day metrics for dossier/reconciliation/plugins.
// Raw DB.days entries intentionally remain untouched; all derived legal metrics come from cd().
window.mhRepairDataIntegrity=function(){
  try{
    if(!window.DB || !DB.days) return {changed:false,removed:0};

    /*
     * Correction canonique validée :
     * ROMI1 actuel : 15/08/2026 = 06:30 -> 21:00
     * pause 12:00 -> 12:30
     * jour férié travaillé.
     */
    const k='2026-08-15';

    const canonical={
      t:'T',
      deb:'06:30',
      fin:'21:00',
      p:[{d:'12:00',f:'12:30',ty:'EXT'}],
      fer:true
    };

    const cur=DB.days[k];

    const same=
      cur &&
      cur.t===canonical.t &&
      cur.deb===canonical.deb &&
      cur.fin===canonical.fin &&
      cur.fer===true &&
      Array.isArray(cur.p) &&
      cur.p.length===1 &&
      cur.p[0] &&
      cur.p[0].d==='12:00' &&
      cur.p[0].f==='12:30';

    if(!same){
      DB.days[k]=canonical;
    }

    /*
     * Nettoyage strict des anciens C18 quotidiens.
     *
     * On ne supprime que les constats :
     * - C18
     * - portant une date réelle
     * - correspondant à une règle quotidienne identifiable
     * - et qui ne sont plus vrais selon mhCalcDay().
     *
     * ROMI1 / paie / RC / bulletins / autres constats : intouchés.
     */
    let removed=0;

    if(Array.isArray(DB.constats)){

      const isDaily=function(c){
        if(!c || !String(c.id||'').startsWith('C18-')) return false;

        const d=String(c.jour_concerne||'');

        if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;

        const m=String(c.regle_violie||c.message||'');

        return /Pause minimale de 20 min|Amplitude > 14 h|Amplitude > 12 h|TTE > 12 h|TTE > 10 h/.test(m);
      };

      const valid=function(c){

        const r=window.mhCalcDay(c.jour_concerne)||{};
        const m=String(c.regle_violie||c.message||'');

        if(m.includes('Pause minimale de 20 min'))
          return Number(r.tte)>=360 && Number(r.pz)<20;

        if(m.includes('Amplitude > 14 h'))
          return Number(r.amp)>840;

        if(m.includes('Amplitude > 12 h'))
          return Number(r.amp)>720 && Number(r.amp)<=840;

        if(m.includes('TTE > 12 h'))
          return Number(r.tte)>720;

        if(m.includes('TTE > 10 h'))
          return Number(r.tte)>600 && Number(r.tte)<=720;

        return true;
      };

      const before=DB.constats.length;

      DB.constats=DB.constats.filter(function(c){
        return !isDaily(c) || valid(c);
      });

      removed=before-DB.constats.length;
    }

    const changed=!same || removed>0;

    if(changed && typeof save==='function'){
      save();
    }

    return {
      changed:changed,
      removed:removed
    };

  }catch(e){
    console.error('mhRepairDataIntegrity',e);

    return {
      changed:false,
      removed:0,
      error:String(e)
    };
  }
};
window.mhCalcDay = function(k){
  try{return cd(k)||{amp:0,tte:0,pz:0,al:[],trav:0,seuil:0,idaj:0,ir:0,iru:0,rc:0,fer:0,dim:0,nuit:0}}
  catch(e){return {amp:0,tte:0,pz:0,al:[],trav:0,seuil:0,idaj:0,ir:0,iru:0,rc:0,fer:0,dim:0,nuit:0}}
};

function calcPerRaw(start,nb){
  const S=DB.s,Q=[],AL=[];
  let pk=null,pe=null;
  const G={amp:0,tte:0,seuil:0,trav:0,idaj:0,ir:0,iru:0,rc:0,fer:0,dim:0,nuit:0,nor:0,h25:0,h50:0,hab:0,ferJ:[],dimJ:[]};
  for(let q=0;q<nb;q++){
    const o={start:addD(start,q*14),w:[],amp:0,tte:0,seuil:0,trav:0,h25:0,h50:0,nor:0};
    for(let w=0;w<2;w++){
      const s={start:addD(start,q*14+w*7),amp:0,tte:0,trav:0};
      for(let i=0;i<7;i++){
        const k=addD(start,q*14+w*7+i),r=cd(k);
        s.amp+=r.amp; s.tte+=r.tte; s.trav+=r.trav;
        o.seuil+=r.seuil;
        G.idaj+=r.idaj; G.ir+=r.ir; G.iru+=r.iru;
        G.rc+=r.rc; G.fer+=r.fer; G.nuit+=r.nuit;
        if(r.fer)G.ferJ.push(k);
        if(r.dim&&DB.days[k]&&DB.days[k].t==='T'){G.dim++;G.dimJ.push(k)}
        r.al.forEach(a=>AL.push({k,...a}));
        if(r.deb!=null){
          if(pe!=null&&pk){
            const gapJours=nDays(pk,k);
            if(gapJours===1){
              const gap=1440+r.deb-pe;
              if(gap>0&&gap<660)AL.push({k,lvl:'w',m:'Repos quotidien de '+F(gap)+' seulement (11h requises entre deux postes)'});
            }
          }
          pk=k; pe=r.fin;
        }
      }
      if(s.tte>2880)AL.push({k:s.start,lvl:'b',m:'Semaine à '+F(s.tte)+' — plafond légal 48h dépassé'});
      o.w.push(s); o.amp+=s.amp; o.tte+=s.tte; o.trav+=s.trav;
    }
    const N=S.base*120;
    o.nor=Math.min(o.seuil,N);
    o.h25=Math.min(Math.max(o.seuil-N,0),S.pl*60);
    o.h50=Math.max(o.seuil-N-S.pl*60,0);
    ['amp','tte','seuil','trav','nor','h25','h50'].forEach(x=>G[x]+=o[x]);
    Q.push(o);
  }
  G.hab=G.trav*S.hab;
  return{Q,AL,G};
}

function brutOfRaw(G){
  const S=DB.s,T=S.taux,L=[];
  const anc=calcAnc(S.emb);
  const ancPct=S.anc||anc.pct;
  L.push(['Heures normales',F(G.nor),T.toFixed(2)+' €/h',G.nor/60*T]);
  if(G.h25)L.push(['HS 25 %',F(G.h25),(T*1.25).toFixed(2)+' €/h',G.h25/60*T*1.25]);
  if(G.h50)L.push(['HS 50 %',F(G.h50),(T*1.5).toFixed(2)+' €/h',G.h50/60*T*1.5]);
  if(G.fer)L.push(['Majoration fériés 100 %',F(G.fer),T.toFixed(2)+' €/h',G.fer/60*T]);
  if(G.rc)L.push(['Repos compensateur',F(G.rc),T.toFixed(2)+' €/h',G.rc/60*T]);
  if(G.hab)L.push(['Habillage/déshabillage',C2(G.hab)+' h',S.habT.toFixed(4)+' €/h',G.hab/60*S.habT]);
  if(G.idaj)L.push(['IDAJ (dépassement amplitude)',C2(G.idaj)+' h',T.toFixed(2)+' €/h',G.idaj/60*T]);
  if(G.dim&&S.dimPrime)L.push(['Prime dimanche',G.dim+' dim.',S.dimPrime.toFixed(2)+' €/dim.',G.dim*S.dimPrime]);
  if(G.nuit&&S.nuitMaj)L.push(['Majoration heures de nuit',C2(G.nuit)+' h',(S.nuitMaj)+'%',G.nuit/60*T*S.nuitMaj/100]);
  const sub=L.reduce((a,x)=>a+x[3],0);
  if(ancPct)L.push(["Prime d'ancienneté",ancPct+' %','sur brut',sub*ancPct/100]);
  const tot=L.reduce((a,x)=>a+x[3],0);
  const panIR=G.ir*S.ir, panIRU=G.iru*S.iru, panIRUT=G.iru*S.irT;
  return{L,tot,panIR,panIRU,panIRUT};
}

/* Current — source unique paie pour toutes les surfaces (Web/PWA/widget).
   Le calcul reste celui de calcPer() + brutOf(); aucune formule n'est dupliquée. */
window.mhCurrentPaySummary=function(){
  try{
    if(typeof calcPer!=='function'||typeof brutOf!=='function'||typeof DB==='undefined')return null;
    const st=DB.per?.start||DB.s?.anchor||'2025-05-19';
    const raw=Number(DB.per?.nb)||2;
    const nb=Math.max(2,Math.min(3,Math.round(raw)));
    const result=calcPer(st,nb),G=result.G,br=brutOf(G);
    const netEst=br.tot*Number(DB.s.net||0)+Number(br.panIR||0)+Number(br.panIRU||0);
    return {grossEst:br.tot,netEst,hs25:G.h25,hs50:G.h50,tte:G.tte,start:st,nb};
  }catch(e){return null}
};

function minutesNuit(a,b,S){
  const nd=P(S.nuitDeb),nf=P(S.nuitFin);
  if(nd==null||nf==null||!S.nuitMaj)return 0;
  let mn=0;
  for(let t=a;t<b;t++){
    const tm=t%1440; // ramène chaque minute à 0-1439, même pour un service qui franchit minuit
    if(tm>=nd||tm<nf)mn++;
  }
  return mn;
}

function calcPer(start,nb){return MH30DataEngine.period(start,nb)}
function brutOf(G){return MH30DataEngine.brut(G)}

