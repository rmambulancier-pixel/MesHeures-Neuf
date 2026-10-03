/* MesHeures · ROMI MASTER 35.0.0
 * Moteur ROMI1 unique et isolé. Ne dépend d'aucun ancien parseur.
 *
 * PDF -> items PDF.js (x/y/w/h) -> lignes -> cellules -> adresses (libellé de ligne + chaîne d'en-têtes)
 *     -> association STRICTE valeur <-> champ -> normalisation FR -> validation -> JSON canonique
 *     -> affichage -> stockage.
 *
 * Règle : une valeur n'existe que si UNE cellule numérique porte l'adresse du champ.
 * Zéro cellule = "non trouvé". Plusieurs cellules différentes = "ambigu". Dans les deux cas : blocage.
 * Aucun décalage, aucun repli, aucun recalcul, aucune permutation de valeurs.
 */
(function(root){
'use strict';
const VERSION='35.0.0', SCHEMA_ID='romi1/1', STORE_KEY='mh_romi_master_v35', DEBUG_KEY='mh_romi_debug';

/* ============ L0 · utilitaires ============ */
const nrm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[\u2018\u2019\u00b4`]/g,"'").replace(/[\u00a0\u202f]/g,' ')
  .replace(/\s*\/\s*/g,'/').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ')
  .replace(/\s*\([^)]*\)\s*$/,'').replace(/\s*:\s*$/,'').trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const r2=n=>Math.round(n*100)/100;
const round1=n=>Math.round(n*10)/10;

/* ============ L5 · nombres français (utilisé dès le typage des cellules) ============ */
const UNIT_OK={h:[null,'h'],j:[null,'j','jour','jours'],n:[null],eur:[null,'€','eur'],pct:[null,'%']};
function parseFrNumber(text){
  let t=String(text==null?'':text).replace(/[\u00a0\u202f]/g,' ').trim();
  let unit=null;
  const um=t.match(/\s*(h|€|eur|%|jours?|j)$/i);
  if(um){unit=um[1].toLowerCase();t=t.slice(0,um.index).trim()}
  let neg=false;
  if(/^[-\u2212\u2013]/.test(t)){neg=true;t=t.replace(/^[-\u2212\u2013]\s*/,'')}
  if(!/^\d+(?:[ .]\d{3})*(?:[,.]\d+)?$/.test(t))return null;
  let body=t;
  const hasComma=body.includes(','),dots=(body.match(/\./g)||[]).length;
  if(!hasComma&&dots===1&&/^\d{1,3}\.\d{3}$/.test(body))return {ambiguous:true,raw:text,unit};
  if(hasComma){body=body.replace(/[ .]/g,'').replace(',','.')}
  else if(dots>1){body=body.replace(/[ .]/g,'')}
  else{body=body.replace(/ /g,'')}
  const v=parseFloat(body);
  if(!Number.isFinite(v))return null;
  return {value:neg?-v:v,unit,raw:text};
}

/* ============ L1 · PDF.js -> items géométriques ============ */
async function extractItemsFromPdf(pdfjsLib,data){
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(data)}).promise;
  const items=[],fonts={},pages=[];let rot=0,total=0;
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p),vp=page.getViewport({scale:1});
    const tc=await page.getTextContent({normalizeWhitespace:false});
    pages.push({page:p,width:r2(vp.width),height:r2(vp.height),rotation:vp.rotation});
    for(const it of tc.items){
      if(!('str' in it)||!String(it.str).trim())continue;
      const t=pdfjsLib.Util.transform(vp.transform,it.transform);
      const h=Math.hypot(t[2],t[3])||Math.abs(it.height)||1,w=Math.abs(it.width)||0;
      total++;if(Math.abs(t[1])>0.3*Math.abs(t[0]))rot++;
      const fam=(tc.styles&&tc.styles[it.fontName]&&tc.styles[it.fontName].fontFamily)||'';
      fonts[it.fontName+'|'+fam]=(fonts[it.fontName+'|'+fam]||0)+1;
      items.push({p,str:String(it.str),x0:t[4],x1:t[4]+w,yc:t[5]-0.3*h,h,font:it.fontName,src:'pdf'});
    }
  }
  return {items,pdf,info:{pages,items:total,rotated:rot,fonts,glyphless:Object.keys(fonts).some(k=>/glyphless/i.test(k))}};
}


/* ============ L2 · lignes et cellules ============ */
function buildCells(items){
  const byPage={};items.forEach(it=>(byPage[it.p]=byPage[it.p]||[]).push(it));
  const cells=[];let rowId=0;
  Object.keys(byPage).map(Number).sort((a,b)=>a-b).forEach(p=>{
    const arr=byPage[p].slice().sort((a,b)=>a.yc-b.yc||a.x0-b.x0),rows=[];
    for(const it of arr){
      const row=rows.find(r=>Math.abs(r.yc-it.yc)<=0.5*Math.min(r.h,it.h));
      if(row){row.items.push(it);row.yc=(row.yc*(row.items.length-1)+it.yc)/row.items.length;row.h=Math.max(row.h,it.h)}
      else rows.push({yc:it.yc,h:it.h,items:[it]});
    }
    rows.sort((a,b)=>a.yc-b.yc);
    rows.forEach(r=>{
      r.items.sort((a,b)=>a.x0-b.x0);rowId++;
      let cur=null;
      for(const it of r.items){
        const gap=cur?it.x0-cur.x1:0,isPct=it.str.trim()==='%'||it.str.trim()==='€'||it.str.trim().toLowerCase()==='h';
        if(cur&&(gap<=0.7*Math.max(cur.h,it.h)||(isPct&&gap<=2*it.h))){
          cur.text+=(gap>0.12*it.h?' ':'')+it.str;cur.x1=Math.max(cur.x1,it.x1);cur.h=Math.max(cur.h,it.h);
        }else{
          if(cur)cells.push(cur);
          cur={p,row:rowId,text:it.str,x0:it.x0,x1:it.x1,yc:r.yc,h:it.h};
        }
      }
      if(cur)cells.push(cur);
    });
  });
  cells.forEach((c,i)=>{c.id=i;c.text=c.text.replace(/\s+/g,' ').trim();c.n=nrm(c.text);
    const num=parseFrNumber(c.text);c.num=num;c.isNum=!!num;
    c.ignorable=/^[:.\-|\u2013\u2014]+$/.test(c.text)||/^(h|€|%|j)$/i.test(c.text)});
  return cells;
}

/* ============ L3 · schéma ROMI1 (déclaratif, calé sur la structure réelle du relevé) ============ */
// Vocabulaire fermé des en-têtes de colonnes. Une cellule hors vocabulaire ne peut jamais servir d'en-tête.
// Le relevé contient trois tableaux :
//   1. période / Année        : lignes Heures T.T.E., Jours de présence, Heures supplémentaires
//   2. Solde a | Acquis | Pris | Solde a : lignes CP N-1, CP N, RC cumulé
//   3. Base H. | Base | Taux | Montant | R.C. (H) : lignes de paie
const COL={
  per:/^periode$/, ann:/^annee$/,
  sa:/^solde(?: a)?$/, acq:/^acquis$/, pris:/^pris$/,
  baseH:/^base h\.?$/, base:/^base$/, taux:/^taux$/, montant:/^montant$/, rcCol:/^r\.? ?c\.?$/
};
const ROW={
  tte:/^heures t\.? ?t\.? ?e\.?$/, pres:/^jours de presence$/, hs:/^heures supplementaires$/,
  n1:/^conges payes annee n-1(?: en jours)?$/, n:/^conges payes annee n(?: en jours)?$/,
  rcc:/^rc cumule(?: \(centieme\))?(?:-base 100 ?%)?$/,
  hs125:/^heures supplementaires a 125 ?%$/, hs150:/^heures supplementaires a 150 ?%$/,
  base:/^salaire de base$/, ampl:/^dep(?:assement|\.)? ?d'? ?amplitude(?: a 100 ?%)?$/,
  prime:/^prime d'anciennete$/, habil:/^indemnite habillage\/deshabillage$/,
  repas:/^indemnite de repas$/, repasU:/^indemnite de repas unique$/
};
// Une colonne peut apparaître deux fois (« Solde a » à gauche et à droite) : [regex,'first'|'last'].
const SA1=[COL.sa,'first'],SA2=[COL.sa,'last'];
// allowEmpty : la cellule peut être VIDE dans le document (ligne et colonne trouvées, aucune valeur dedans).
// Une cellule vide est enregistrée null, jamais 0. Une cellule introuvable reste « non trouvé » et bloque.
const F=(key,label,kind,min,max,m,allowEmpty)=>({key,label,kind,min,max,m,allowEmpty:!!allowEmpty,int:false});
const FIELDS=[
  F('ttePeriodH','TTE période (h)','h',0,400,[{row:ROW.tte,col:[COL.per]}]),
  F('presenceDays','Jours de présence','j',0,31,[{row:ROW.pres,col:[COL.per]}]),
  F('hsPeriodH','HS période (h)','h',0,200,[{row:ROW.hs,col:[COL.per]}]),
  F('tteYearH','TTE cumul année (h)','h',0,3000,[{row:ROW.tte,col:[COL.ann]}]),
  F('hsYearH','HS cumul année (h)','h',0,1000,[{row:ROW.hs,col:[COL.ann]}]),
  F('presenceYearDays','Jours présence année','j',0,366,[{row:ROW.pres,col:[COL.ann]}]),
  F('cpN1PreviousBalance','CP N-1 solde d\u2019ouverture (j)','j',0,60,[{row:ROW.n1,col:[SA1]}]),
  F('cpN1Acquired','CP N-1 acquis (j)','j',0,60,[{row:ROW.n1,col:[COL.acq]}],true),
  F('cpN1Taken','CP N-1 pris (j)','j',0,60,[{row:ROW.n1,col:[COL.pris]}],true),
  F('cpN1Balance','CP N-1 solde (j)','j',0,60,[{row:ROW.n1,col:[SA2]}]),
  F('cpNPreviousBalance','CP N solde d\u2019ouverture (j)','j',0,60,[{row:ROW.n,col:[SA1]}]),
  F('cpNAcquired','CP N acquis (j)','j',0,60,[{row:ROW.n,col:[COL.acq]}],true),
  F('cpNTaken','CP N pris (j)','j',0,60,[{row:ROW.n,col:[COL.pris]}],true),
  F('cpNBalance','CP N solde (j)','j',0,60,[{row:ROW.n,col:[SA2]}]),
  F('rcPreviousH','RC solde antérieur (h)','h',-1000,1000,[{row:ROW.rcc,col:[SA1]}]),
  F('rcAcquiredH','RC acquis (h)','h',0,500,[{row:ROW.rcc,col:[COL.acq]}]),
  F('rcTakenH','RC pris (h)','h',0,1000,[{row:ROW.rcc,col:[COL.pris]}],true),
  F('rcBalanceH','RC cumulé (h)','h',-1000,1000,[{row:ROW.rcc,col:[SA2]}]),
  F('salaryBaseH','Salaire de base (h)','h',0,400,[{row:ROW.base,col:[COL.base]}]),
  F('amplitudeOverH','Dépassement amplitude 100 % (h, col. Base H.)','h',0,50,[{row:ROW.ampl,col:[COL.baseH]}]),
  F('hs125EligibleH','HS 125 % éligibles (h, col. Base H.)','h',0,200,[{row:ROW.hs125,col:[COL.baseH]}]),
  F('hs125PaidH','HS 125 % payées (h, col. Base)','h',0,200,[{row:ROW.hs125,col:[COL.base]}],true),
  F('hs125ToRcH','HS 125 % versées en RC (h, col. R.C.)','h',0,200,[{row:ROW.hs125,col:[COL.rcCol]}],true),
  F('hs150EligibleH','HS 150 % éligibles (h, col. Base H.)','h',0,200,[{row:ROW.hs150,col:[COL.baseH]}]),
  F('hs150PaidH','HS 150 % payées (h, col. Base)','h',0,200,[{row:ROW.hs150,col:[COL.base]}],true),
  F('hs150ToRcH','HS 150 % versées en RC (h, col. R.C.)','h',0,200,[{row:ROW.hs150,col:[COL.rcCol]}],true),
  F('seniorityPct','Prime ancienneté (%, col. Taux)','pct',0,30,[{row:ROW.prime,col:[COL.taux]}]),
  F('habillageEur','Habillage / déshabillage (€)','eur',0,1000,[{row:ROW.habil,col:[COL.base]}]),
  F('mealCount','Indemnités de repas (nb)','n',0,62,[{row:ROW.repas,col:[COL.base]}]),
  F('uniqueMealCount','Repas unique (nb)','n',0,62,[{row:ROW.repasU,col:[COL.base]}])
];
FIELDS.forEach(f=>{if(['presenceDays','presenceYearDays','mealCount','uniqueMealCount'].includes(f.key))f.int=true});
const REQUIRED=['periodStart','periodEnd'].concat(FIELDS.map(f=>f.key));
const LABELS=Object.fromEntries(FIELDS.map(f=>[f.key,f.label]).concat([['periodStart','Début de période'],['periodEnd','Fin de période']]));

/* ============ L4 · adresses et association stricte ============ */
const isRowVocab=n=>Object.values(ROW).some(r=>r.test(n));
const isColVocab=n=>Object.values(COL).some(r=>r.test(n));
function overlapX(a,b,tol){return a.x0<=b.x1+tol&&b.x0<=a.x1+tol}

// En-têtes reconnus, avec rang parmi les en-têtes identiques de la même ligne (ord/cnt).
function headerList(cells){
  const hd=cells.filter(c=>!c.isNum&&isColVocab(c.n)&&
    // une cellule suivie de valeurs sur sa propre ligne est un libellé de ligne, pas un en-tête
    !cells.some(o=>o.isNum&&o.p===c.p&&Math.abs(o.yc-c.yc)<=0.6*Math.min(o.h,c.h)&&o.x0>=c.x1-1));
  hd.forEach(h=>{
    const same=hd.filter(o=>o.p===h.p&&o.n===h.n&&Math.abs(o.yc-h.yc)<=0.6*Math.min(o.h,h.h)).sort((a,b)=>a.x0-b.x0);
    h.ord=same.indexOf(h);h.cnt=same.length;
  });
  return hd;
}
function addressOf(V,cells,hdrs){
  const sameRow=cells.filter(c=>c.p===V.p&&Math.abs(c.yc-V.yc)<=0.6*Math.min(c.h,V.h));
  // Libellé de ligne : cellule texte la plus proche à gauche dans la même ligne (les valeurs numériques sont sautées).
  const label=sameRow.filter(c=>c!==V&&!c.isNum&&!c.ignorable&&c.x1<=V.x0+1).sort((a,b)=>b.x1-a.x1)[0]||null;
  let idx=-1,runLen=0;const rowCands=[];
  if(label){
    const after=sameRow.filter(c=>c.x0>=label.x1-1&&c!==label).sort((a,b)=>a.x0-b.x0);
    const run=[];
    for(const c of after){if(c.ignorable)continue;if(c.isNum)run.push(c);else break}
    let tail=null;
    if(run.length&&run[0].num&&run[0].num.unit==='%'&&run[0]!==V&&/^\d+ ?%$/.test(run[0].text))tail=run.shift();
    idx=run.indexOf(V);runLen=run.length;
    rowCands.push(label.n);
    if(tail)rowCands.push(nrm(label.text+' '+tail.text));
    // libellé sur deux lignes : on teste aussi la concaténation avec la cellule juste au-dessus / au-dessous
    const near=cells.filter(c=>c.p===label.p&&c!==label&&!c.isNum&&Math.abs(c.x0-label.x0)<=0.8*label.h&&Math.abs(c.yc-label.yc)<=1.9*label.h);
    const above=near.filter(c=>c.yc<label.yc).sort((a,b)=>b.yc-a.yc)[0],below=near.filter(c=>c.yc>label.yc).sort((a,b)=>a.yc-b.yc)[0];
    if(above)rowCands.push(nrm(above.text+' '+label.text));
    if(below)rowCands.push(nrm(label.text+' '+below.text));
    if(above&&below)rowCands.push(nrm(above.text+' '+label.text+' '+below.text));
  }
  // chaîne d'en-têtes : on remonte de cellule en cellule, uniquement dans le vocabulaire fermé.
  const extent=c=>{const nx=hdrs.filter(o=>o!==c&&o.p===c.p&&Math.abs(o.yc-c.yc)<=0.6*Math.min(o.h,c.h)&&o.x0>c.x0+1).map(o=>o.x0);return {x0:c.x0,x1:nx.length?Math.min(...nx):Infinity}};
  const chain=[];let cur=V;
  for(let d=0;d<3;d++){
    const cx=(cur.x0+cur.x1)/2,tol=0.4*cur.h;
    const ups=hdrs.filter(c=>c.p===V.p&&c.yc<cur.yc-0.3*Math.min(c.h,cur.h)&&cur.yc-c.yc<=25*cur.h&&!chain.includes(c)&&
      (overlapX(c,cur,tol)||(()=>{const e=extent(c);return cx>=e.x0-tol&&cx<e.x1-tol})()));
    if(!ups.length)break;
    ups.sort((a,b)=>(b.yc-a.yc)||(Math.abs((a.x0+a.x1)/2-cx)-Math.abs((b.x0+b.x1)/2-cx)));
    chain.push(ups[0]);cur=ups[0];
  }
  chain.reverse();
  return {label,rowCands,idx,runLen,isRowLabel:rowCands.some(isRowVocab),
    chain:chain.map(h=>({n:h.n,ord:h.ord,cnt:h.cnt})),
    chainNames:chain.map(h=>h.n+(h.cnt>1?'#'+(h.ord+1)+'/'+h.cnt:''))};
}
const colRe=e=>e instanceof RegExp?e:e[0];
const colAt=e=>e instanceof RegExp?null:e[1];
const atOk=(h,at)=>!at||(h.cnt>1&&(at==='first'?h.ord===0:h.ord===h.cnt-1));
function matchAddr(a,p){
  if(!p.row&&a.isRowLabel)return false; // une valeur qui porte un libellé de ligne reconnu ne peut pas être lue par colonne seule
  if(p.row&&!a.rowCands.some(t=>p.row.test(t)))return false;
  if(p.idx!=null&&a.idx!==p.idx)return false;
  if(p.runLen&&!(a.runLen>=p.runLen[0]&&a.runLen<=p.runLen[1]))return false;
  if(p.col){let k=0;for(const h of a.chain){if(k<p.col.length&&colRe(p.col[k]).test(h.n)&&atOk(h,colAt(p.col[k])))k++}if(k<p.col.length)return false}
  return true;
}
// Cellule VIDE prouvée : ligne trouvée, colonne trouvée (en-tête le plus proche au-dessus), et aucune cellule
// dans la tranche de cette colonne sur cette ligne. Sinon, ce n'est pas « vide », c'est « non trouvé ».
function isProvenEmpty(spec,cells,hdrs){
  let combos=0,empties=0;
  for(const p of spec.m){
    if(!p.row||!p.col)continue;
    const last=p.col[p.col.length-1],re=colRe(last),at=colAt(last);
    for(const L of cells.filter(c=>!c.isNum&&p.row.test(c.n))){
      const hh=hdrs.filter(h=>h.p===L.p&&re.test(h.n)&&atOk(h,at)&&h.yc<L.yc&&L.yc-h.yc<=25*L.h);
      if(!hh.length)continue;
      const top=Math.max(...hh.map(h=>h.yc)),H=hh.filter(h=>h.yc>=top-0.6*h.h);
      if(H.length!==1)continue;
      const h=H[0];combos++;
      const sib=hdrs.filter(o=>o!==h&&o.p===h.p&&Math.abs(o.yc-h.yc)<=0.6*Math.min(o.h,h.h)).sort((a,b)=>a.x0-b.x0);
      const prev=sib.filter(o=>o.x1<=h.x0+1).pop(),next=sib.filter(o=>o.x0>=h.x1-1)[0];
      const lo=prev?(prev.x1+h.x0)/2:h.x0-30,hi=next?(h.x1+next.x0)/2:h.x1+30;
      const occupied=cells.some(c=>c!==L&&c.p===L.p&&!c.ignorable&&Math.abs(c.yc-L.yc)<=0.6*Math.min(c.h,L.h)&&(c.x0+c.x1)/2>=lo&&(c.x0+c.x1)/2<=hi);
      if(!occupied)empties++;
    }
  }
  return combos>0&&empties===combos;
}
function resolveField(spec,numCells,cells,hdrs){
  const out={key:spec.key,status:'missing',value:null,sources:[]};
  const hit=V=>V.addr&&spec.m.some(p=>matchAddr(V.addr,p));
  const amb=numCells.filter(V=>V.num&&V.num.ambiguous&&hit(V));
  if(amb.length){out.status='ambiguous';out.reason='nombre à séparateur ambigu : '+amb[0].text;return out}
  const cands=numCells.filter(V=>hit(V)&&V.num&&!V.num.ambiguous&&UNIT_OK[spec.kind].includes(V.num.unit));
  if(!cands.length){
    if(spec.allowEmpty&&isProvenEmpty(spec,cells,hdrs)){out.status='empty';out.reason='cellule vide dans le document'}
    return out;
  }
  const vals=[...new Set(cands.map(c=>r2(c.num.value)))];
  out.sources=cands.map(c=>({page:c.p,x:round1(c.x0),y:round1(c.yc),text:c.text,row:c.addr.rowCands[0]||null,chain:c.addr.chainNames}));
  if(vals.length>1){out.status='ambiguous';out.reason='plusieurs valeurs candidates : '+vals.join(' / ');return out}
  const v=vals[0];
  if(spec.int&&!Number.isInteger(v)){out.status='implausible';out.value=v;out.reason='entier attendu';return out}
  if(v<spec.min||v>spec.max){out.status='implausible';out.value=v;out.reason='hors bornes ['+spec.min+' ; '+spec.max+']';return out}
  out.status='ok';out.value=v;return out;
}
function resolvePeriod(cells){
  const rows={};cells.forEach(c=>(rows[c.row]=rows[c.row]||[]).push(c));
  const found=new Set();
  Object.values(rows).forEach(r=>{
    const t=nrm(r.sort((a,b)=>a.x0-b.x0).map(c=>c.text).join(' '));
    const re=/\bdu (\d\d)\/(\d\d)\/(\d{4}) au (\d\d)\/(\d\d)\/(\d{4})/g;let m;
    while((m=re.exec(t)))found.add(m.slice(1,7).join(','));
  });
  const mk=(d,m,y)=>{const dt=new Date(Date.UTC(+y,+m-1,+d));return dt.getUTCFullYear()==+y&&dt.getUTCMonth()==+m-1&&dt.getUTCDate()==+d?y+'-'+m+'-'+d:null};
  const res={periodStart:{key:'periodStart',status:'missing',value:null,sources:[]},periodEnd:{key:'periodEnd',status:'missing',value:null,sources:[]}};
  if(found.size===1){
    const a=[...found][0].split(',');const s=mk(a[0],a[1],a[2]),e=mk(a[3],a[4],a[5]);
    if(s&&e){res.periodStart.value=s;res.periodEnd.value=e;res.periodStart.status=res.periodEnd.status='ok'}
    else res.periodStart.status=res.periodEnd.status='implausible';
  }else if(found.size>1){res.periodStart.status=res.periodEnd.status='ambiguous';res.periodStart.reason=res.periodEnd.reason='plusieurs périodes "du … au …" : '+[...found].join(' | ')}
  return res;
}

/* ============ L6 · validation (ne modifie jamais une valeur) ============ */
// Les contrôles arithmétiques reprennent la logique propre du document : ouverture + acquis - pris = solde ;
// HS éligibles = HS payées + HS versées en RC. Une cellule vide compte 0 dans ces contrôles uniquement.
function validate(fields,source){
  const blocking=[],warnings=[];
  const specs=Object.fromEntries(FIELDS.map(f=>[f.key,f]));
  REQUIRED.forEach(k=>{
    const f=fields[k],okEmpty=f&&f.status==='empty'&&specs[k]&&specs[k].allowEmpty;
    if(!f||(f.status!=='ok'&&!okEmpty))blocking.push({key:k,why:f?f.status+(f.reason?' : '+f.reason:''):'missing'});
  });
  const has=k=>fields[k]&&(fields[k].status==='ok'||fields[k].status==='empty');
  const v=k=>fields[k]&&fields[k].status==='ok'?fields[k].value:null;
  const z=k=>fields[k]&&fields[k].status==='empty'?0:v(k);
  const hard=(cond,msg,key)=>{if(cond===false)blocking.push({key:key||'coherence',why:'incohérent : '+msg})};
  const soft=(cond,msg)=>{if(cond===false)(source==='ocr'?blocking:warnings).push({key:'coherence',why:msg})};
  const S=v('periodStart'),E=v('periodEnd');
  if(S&&E){const d=(Date.parse(E)-Date.parse(S))/864e5;hard(d>=0&&d<=62,'fin de période avant le début ou période > 62 jours','periodEnd');soft(d===27,'période de '+(d+1)+' jours (28 attendus)')}
  const pair=(a,b,msg)=>{if(v(a)!=null&&v(b)!=null)hard(v(a)<=v(b)+1e-9,msg,a)};
  pair('presenceDays','presenceYearDays','jours de présence période > année');
  pair('ttePeriodH','tteYearH','TTE période > TTE année');
  pair('hsPeriodH','hsYearH','HS période > HS année');
  pair('hsPeriodH','ttePeriodH','HS période > TTE période');
  const roll=(pre,acq,pris,bal,label,tol)=>{
    if(v(pre)!=null&&v(bal)!=null&&has(acq)&&has(pris))
      hard(Math.abs(v(pre)+z(acq)-Math.abs(z(pris))-v(bal))<=tol,label+' : ouverture + acquis - pris ≠ solde ('+v(pre)+' + '+z(acq)+' - '+Math.abs(z(pris))+' ≠ '+v(bal)+')',bal);
  };
  roll('cpN1PreviousBalance','cpN1Acquired','cpN1Taken','cpN1Balance','CP N-1',0.01);
  roll('cpNPreviousBalance','cpNAcquired','cpNTaken','cpNBalance','CP N',0.01);
  roll('rcPreviousH','rcAcquiredH','rcTakenH','rcBalanceH','RC',0.05);
  const split=(elig,paid,rc,label)=>{
    if(v(elig)!=null&&has(paid)&&has(rc))hard(Math.abs(v(elig)-z(paid)-z(rc))<=0.01,label+' : éligibles ≠ payées + versées en RC ('+v(elig)+' ≠ '+z(paid)+' + '+z(rc)+')',elig);
  };
  split('hs125EligibleH','hs125PaidH','hs125ToRcH','HS 125 %');
  split('hs150EligibleH','hs150PaidH','hs150ToRcH','HS 150 %');
  if(v('hsPeriodH')!=null&&v('hs125EligibleH')!=null&&v('hs150EligibleH')!=null)
    hard(Math.abs(v('hs125EligibleH')+v('hs150EligibleH')-v('hsPeriodH'))<=0.05,'HS période ≠ HS 125 % éligibles + HS 150 % éligibles','hsPeriodH');
  return {ok:blocking.length===0,blocking,warnings};
}

/* ============ Pipeline pur : items -> résultat ============ */
function analyzeItems(items,meta){
  meta=meta||{};
  const cells=buildCells(items),numCells=cells.filter(c=>c.isNum&&c.p!=null),hdrs=headerList(cells);
  numCells.forEach(V=>{V.addr=addressOf(V,cells,hdrs)});
  const fields=Object.assign({},resolvePeriod(cells));
  FIELDS.forEach(f=>{fields[f.key]=resolveField(f,numCells,cells,hdrs)});
  const check=validate(fields,meta.source||'pdf');
  const canonical={};
  REQUIRED.forEach(k=>{canonical[k]=fields[k]&&fields[k].status==='ok'?fields[k].value:null});
  return {fields,check,canonical,cells,ok:check.ok,
    textStats:{cells:cells.length,numeric:numCells.length,chars:cells.reduce((s,c)=>s+c.text.length,0)}};
}
function hasTextLayer(items){const chars=items.reduce((s,i)=>s+i.str.length,0),nums=items.filter(i=>parseFrNumber(i.str)).length;return chars>=80&&nums>=10}

/* ============ Orchestration fichier ============ */
async function readFile(file,opts){
  opts=opts||{};
  const lib=root.pdfjsLib;if(!lib)throw new Error('PDF.js indisponible');
  const buf=new Uint8Array(await file.arrayBuffer());
  const ex=await extractItemsFromPdf(lib,buf);
  if(!hasTextLayer(ex.items)){
    if(!root.MHSpecializedReader)throw new Error('Lecteur spécialisé indisponible');
    const res=await root.MHSpecializedReader.readRomi1(file,lib);
    res.source='zones';
    res.note='PDF image : lecture spécialisée des zones ROMI1. Aucune lecture OCR pleine page.';
    res.pdfInfo=ex.info;
    res.fileName=file.name;
    return res;
  }
  let items=ex.items,source='pdf',note=null;
  if(ex.info.rotated>0.3*ex.info.items){note='Texte pivoté détecté : lecture non fiable.'}
  const res=analyzeItems(items,{source});
  if(note){res.check.blocking.push({key:'coherence',why:note});res.ok=false;res.check.ok=false}
  res.source=source;res.note=note;res.pdfInfo=ex.info;res.fileName=file.name;
  return res;
}

/* ============ L7 · stockage ============ */
const store={
  all(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){return {}}},
  save(rec){const a=store.all();a[rec.data.periodStart+'_'+rec.data.periodEnd]=rec;localStorage.setItem(STORE_KEY,JSON.stringify(a));return true},
  del(k){const a=store.all();delete a[k];localStorage.setItem(STORE_KEY,JSON.stringify(a))}
};

/* ============ L8 · affichage + DEBUG ============ */
let S={res:null,err:null,busy:false};
const debugOn=()=>localStorage.getItem(DEBUG_KEY)==='1';
const fmt=v=>v==null?'':String(v).replace('.',',');
function debugJson(){
  const r=S.res;if(!r)return '';
  const prov={};Object.keys(r.fields).forEach(k=>{const f=r.fields[k];prov[k]={status:f.status,value:f.value,reason:f.reason||undefined,sources:f.sources}});
  return JSON.stringify({engine:VERSION,schema:SCHEMA_ID,file:r.fileName,method:r.source,ok:r.ok,canonical:r.canonical,blocking:r.check.blocking,warnings:r.check.warnings,fields:prov,pdf:r.pdfInfo},null,1);
}
function geometryJson(){
  const r=S.res;if(!r)return '';
  return JSON.stringify({engine:VERSION,file:r.fileName,cells:r.cells.map(c=>[c.p,c.row,round1(c.x0),round1(c.x1),round1(c.yc),round1(c.h),c.text,c.isNum?1:0])},null,0);
}
function copy(text){
  try{if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text)}catch(e){}
  const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();
}
function render(){
  const rootEl=document.getElementById('s-romi');if(!rootEl)return;
  const r=S.res,dbg=debugOn();
  const st=k=>r&&r.fields[k]?r.fields[k]:null;
  const badge=k=>{const f=st(k);if(!f)return '';if(f.status==='ok')return '<span class="sub" style="color:var(--ok,#3ecf8e)">lu</span>';if(f.status==='empty')return '<span class="sub">vide dans le document</span>';
    const t={missing:'non trouvé',ambiguous:'ambigu',implausible:'invalide',empty:'vide dans le document'}[f.status];return '<span class="sub" style="color:var(--danger,#ff6b6b)">'+t+'</span>'};
  const cell=k=>{const f=st(k),bad=f&&f.status!=='ok'&&f.status!=='empty';return '<div><label>'+esc(LABELS[k])+' '+badge(k)+'</label><input readonly value="'+esc(f?fmt(f.value):'')+'"'+(bad?' style="border-color:var(--danger,#ff6b6b)"':'')+' title="'+esc(f&&f.reason||'')+'"></div>'};
  const blocking=r?r.check.blocking:[];
  const banner=S.busy?'<div class="al i">Lecture en cours…</div>':S.err?'<div class="al w">'+esc(S.err)+'</div>'
    :!r?'<div class="al i">Choisis le PDF du ROMI1. Rien n\'est enregistré tant que tous les champs ne sont pas lus sans ambiguïté.</div>'
    :r.ok?'<div class="al ok">🟢 ROMI1 lu et cohérent. Enregistrement autorisé.</div>'
    :'<div class="al w">🔴 Enregistrement bloqué.<br>'+blocking.map(b=>esc((LABELS[b.key]||b.key)+' : '+b.why)).join('<br>')+'</div>';
  const warn=r&&r.check.warnings.length?'<div class="al i">⚠️ '+r.check.warnings.map(w=>esc(w.why)).join('<br>⚠️ ')+'</div>':'';
  const note=r&&r.note?'<div class="al i">'+esc(r.note)+'</div>':'';
  const hist=Object.entries(store.all()).sort((a,b)=>b[0].localeCompare(a[0]));
  rootEl.innerHTML='<div class="card"><h2>📋 ROMI1 <span class="sub">MASTER '+VERSION+'</span></h2>'
   +'<div class="al i">Lecture géométrique du PDF. Chaque valeur est rattachée à son libellé et à sa colonne. Rien n\'est deviné ni recalculé.</div>'
   +'<input id="mhRomiFile" type="file" accept=".pdf,application/pdf" style="width:100%">'
   +(r?'<div class="al i">Source : '+esc(r.fileName)+' · méthode : '+(r.source==='zones'?'zones spécialisées':'texte du PDF')+'</div>':'')
   +banner+warn+note
   +'<div class="grid">'+['periodStart','periodEnd'].concat(FIELDS.map(f=>f.key)).map(cell).join('')+'</div>'
   +'<button id="mhRomiSave" class="ok" style="margin-top:9px;width:100%"'+(r&&r.ok?'':' disabled')+'>💾 Enregistrer le ROMI1</button>'
   +'<label style="display:block;margin-top:10px"><input type="checkbox" id="mhRomiDbg"'+(dbg?' checked':'')+'> Mode DEBUG</label>'
   +(dbg?'<div class="card"><b>JSON détecté (avant enregistrement)</b>'
     +'<div style="display:flex;gap:6px;margin:6px 0"><button id="mhRomiCopyJson">Copier le JSON</button><button id="mhRomiCopyGeo">Copier la géométrie</button></div>'
     +'<textarea readonly rows="10" style="width:100%;font-size:11px" id="mhRomiJsonBox">'+esc(debugJson())+'</textarea></div>':'')
   +'</div><div class="card"><h2>Historique ROMI1</h2>'
   +(hist.length?hist.map(([k,h])=>'<div class="al i"><b>'+esc(h.data.periodStart)+' → '+esc(h.data.periodEnd)+'</b> · TTE '+fmt(h.data.ttePeriodH)+' h · HS '+fmt(h.data.hsPeriodH)+' h · RC '+fmt(h.data.rcBalanceH)+' h <button data-del="'+esc(k)+'" style="float:right">✕</button></div>').join(''):'<div class="al i">Aucun relevé enregistré.</div>')
   +'</div>';
  document.getElementById('mhRomiFile').onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    S={res:null,err:null,busy:true};render();
    try{S={res:await readFile(f),err:null,busy:false}}catch(x){S={res:null,err:'Lecture impossible : '+x.message,busy:false}}
    render();
  };
  document.getElementById('mhRomiSave').onclick=()=>{
    if(!S.res||!S.res.ok)return;
    store.save({schema:SCHEMA_ID,engine:VERSION,method:S.res.source,fileName:S.res.fileName,savedAt:new Date().toISOString(),data:S.res.canonical});
    try{
      document.dispatchEvent(new CustomEvent('mh:romi1-saved'));
    }catch(e){}
    render();
    /* V36 FINAL — rafraîchir le rapprochement après enregistrement ROMI1 */
    try{
      if(window.mhRomiReconciliation &&
         typeof window.mhRomiReconciliation.render==='function'){
        window.mhRomiReconciliation.render();
      }
    }catch(e){}
  };
  document.getElementById('mhRomiDbg').onchange=e=>{localStorage.setItem(DEBUG_KEY,e.target.checked?'1':'0');render()};
  const cj=document.getElementById('mhRomiCopyJson'),cg=document.getElementById('mhRomiCopyGeo');
  if(cj)cj.onclick=()=>copy(debugJson());if(cg)cg.onclick=()=>copy(geometryJson());
  rootEl.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{if(confirm('Supprimer ce relevé ?')){store.del(b.getAttribute('data-del'));render()}});
}

/* ============ API publique ============ */
const API={version:VERSION,schema:SCHEMA_ID,analyzeItems,extractItemsFromPdf,readFile,parseFrNumber,
  list:()=>Object.values(store.all()).map(h=>h.data),get:k=>{const h=store.all()[k];return h?h.data:null},render,FIELDS};
root.MH_ROMI=API;
if(typeof module!=='undefined'&&module.exports)module.exports=API;
if(root.document){
  root.renderRomiTab=render;   // point d'entrée utilisé par la navigation d'onglets (app-ui.js, app-v30.js)
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
}
})(typeof window!=='undefined'?window:globalThis);
