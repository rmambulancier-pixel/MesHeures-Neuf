/* MesHeures V36.2 — lecteur spécialisé des 2 maquettes fixes.
 * Entrée: PDF. Rendu interne: 4x. Lecture: petites zones connues uniquement.
 * Aucun OCR pleine page. Les champs non lisibles restent absents/vides.
 */
(function(root){
'use strict';

const PDF_W=595.32, PDF_H=841.92, SCALE=4;
const TESS=(_mhLibSrc&&_mhLibSrc.tesseractWorker)||'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js';
const CORE=(_mhLibSrc&&_mhLibSrc.tesseractCore)||'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
const LANG=(_mhLibSrc&&_mhLibSrc.tesseractLang)||'https://tessdata.projectnaptha.com/4.0.0';

function num(v){
  const s=String(v==null?'':v).replace(/\s+/g,'').replace(/,/g,'.');
  const m=s.match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}
function nums(v){
  return (String(v==null?'':v).replace(/\s+/g,' ').match(/-?\d+(?:[.,]\d+)?/g)||[])
    .map(num).filter(Number.isFinite);
}
function unique(a){return [...new Set(a.map(x=>Math.round(x*100)/100))]}

async function makeWorker(){
  if(typeof root.mhLoadLib!=='function')throw new Error('Bibliothèque OCR indisponible');
  await root.mhLoadLib('tesseract');
  if(!root.Tesseract)throw new Error('Tesseract indisponible');
  return root.Tesseract.createWorker('fra',1,{workerPath:TESS,corePath:CORE,langPath:LANG});
}

async function renderPdf(file,lib){
  const buf=new Uint8Array(await file.arrayBuffer());
  const pdf=await lib.getDocument({data:buf}).promise;
  const pages=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const vp=page.getViewport({scale:SCALE});
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    pages.push(canvas);
  }
  return pages;
}

function crop(canvas,z){
  const c=document.createElement('canvas');
  c.width=Math.max(8,Math.round((z.x1-z.x0)*SCALE));
  c.height=Math.max(8,Math.round((z.y1-z.y0)*SCALE));
  c.getContext('2d').drawImage(canvas,
    Math.round(z.x0*SCALE),Math.round(z.y0*SCALE),c.width,c.height,
    0,0,c.width,c.height);
  return c;
}

async function ocr(worker,canvas,{numeric=true,psm=6}={}){
  await worker.setParameters({
    tessedit_pageseg_mode:String(psm),
    tessedit_char_whitelist:numeric?'0123456789,.-':''
  });
  const r=await worker.recognize(canvas);
  return String(r.data&&r.data.text||'').trim();
}

async function readNum(worker,canvas,z,opts){
  const text=await ocr(worker,crop(canvas,z),opts);
  const a=nums(text);
  if(a.length!==1)return {value:null,raw:text};
  return {value:a[0],raw:text};
}

async function readMany(worker,canvas,z,opts){
  const text=await ocr(worker,crop(canvas,z),opts);
  return {values:nums(text),raw:text};
}

async function readText(worker,canvas,z){
  return ocr(worker,crop(canvas,z),{numeric:false,psm:7});
}

function field(key,label,kind,min,max,allowEmpty,value,raw,zone){
  const out={key,label,status:'missing',value:null,sources:raw? [{page:zone.p,x:zone.x0,y:zone.y0,text:raw,zone:[zone.x0,zone.y0,zone.x1,zone.y1]}]:[]};
  if(value==null){
    if(allowEmpty){out.status='empty';out.reason='cellule vide dans le document'}
    return out;
  }
  if(!Number.isFinite(value)){out.status='implausible';out.reason='valeur non numérique';return out}
  if(value<min||value>max){out.status='implausible';out.value=value;out.reason='hors bornes ['+min+' ; '+max+']';return out}
  if(kind==='int'&&!Number.isInteger(value)){out.status='implausible';out.value=value;out.reason='entier attendu';return out}
  out.status='ok';out.value=Math.round(value*100)/100;return out;
}

function dateField(key,label,value,raw,z){
  const out={key,label,status:'missing',value:null,sources:raw?[{page:z.p,x:z.x0,y:z.y0,text:raw,zone:[z.x0,z.y0,z.x1,z.y1]}]:[]};
  if(!value){out.status='missing';return out}
  out.status='ok';out.value=value;return out;
}
function parsePeriod(t){
  const m=String(t||'').match(/du\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if(!m)return null;
  return {start:`${m[3]}-${m[2]}-${m[1]}`,end:`${m[6]}-${m[5]}-${m[4]}`};
}

const Z={
 period:{p:1,x0:350,y0:15,x1:480,y1:30},
 tteP:{p:1,x0:480,y0:57,x1:522,y1:70}, tteY:{p:1,x0:525,y0:57,x1:570,y1:70},
 presP:{p:1,x0:480,y0:72,x1:522,y1:84}, presY:{p:1,x0:525,y0:72,x1:570,y1:84},
 hsP:{p:1,x0:480,y0:84,x1:522,y1:98}, hsY:{p:1,x0:525,y0:84,x1:570,y1:98},
 cpN1Open:{p:1,x0:397,y0:112,x1:439,y1:124},cpN1Acq:{p:1,x0:441,y0:112,x1:483,y1:124},cpN1Taken:{p:1,x0:487,y0:112,x1:510,y1:124},cpN1Bal:{p:1,x0:530,y0:112,x1:570,y1:124},
 cpNOpen:{p:1,x0:397,y0:124,x1:439,y1:136},cpNAcq:{p:1,x0:441,y0:124,x1:483,y1:136},cpNTaken:{p:1,x0:487,y0:124,x1:510,y1:136},cpNBal:{p:1,x0:530,y0:124,x1:570,y1:136},
 rcPrev:{p:1,x0:397,y0:136,x1:439,y1:149},rcAcq:{p:1,x0:441,y0:136,x1:483,y1:149},rcTaken:{p:1,x0:487,y0:136,x1:510,y1:149},rcBal:{p:1,x0:530,y0:136,x1:570,y1:149},
 salary:{p:1,x0:380,y0:217,x1:430,y1:226},ampl:{p:1,x0:345,y0:227,x1:385,y1:238},
 hs125E:{p:1,x0:345,y0:250,x1:385,y1:260},hs125P:{p:1,x0:390,y0:250,x1:430,y1:260},
 hs150E:{p:1,x0:345,y0:261,x1:385,y1:271},hs150RC:{p:1,x0:525,y0:261,x1:570,y1:271},
 prime:{p:1,x0:430,y0:273,x1:470,y1:283},habil:{p:1,x0:390,y0:284,x1:430,y1:294},
 mealRow:{p:1,x0:330,y0:295,x1:435,y1:317}
};

async function readRomi1(file,lib){
  const pages=await renderPdf(file,lib),w=await makeWorker();
  try{
    const c=pages[0];
    const periodRaw=await readText(w,c,Z.period),per=parsePeriod(periodRaw);
    const fields={};
    fields.periodStart=dateField('periodStart','Début de période',per&&per.start,periodRaw,Z.period);
    fields.periodEnd=dateField('periodEnd','Fin de période',per&&per.end,periodRaw,Z.period);
    const spec=[
      ['ttePeriodH','TTE période (h)','num',0,400,false,'tteP'],['presenceDays','Jours de présence','int',0,31,false,'presP'],['hsPeriodH','HS période (h)','num',0,200,false,'hsP'],
      ['tteYearH','TTE cumul année (h)','num',0,3000,false,'tteY'],['hsYearH','HS cumul année (h)','num',0,1000,false,'hsY'],['presenceYearDays','Jours présence année','int',0,366,false,'presY'],
      ['cpN1PreviousBalance','CP N-1 solde d’ouverture (j)','num',0,60,false,'cpN1Open'],['cpN1Acquired','CP N-1 acquis (j)','num',0,60,true,'cpN1Acq'],['cpN1Taken','CP N-1 pris (j)','num',0,60,true,'cpN1Taken'],['cpN1Balance','CP N-1 solde (j)','num',0,60,false,'cpN1Bal'],
      ['cpNPreviousBalance','CP N solde d’ouverture (j)','num',0,60,false,'cpNOpen'],['cpNAcquired','CP N acquis (j)','num',0,60,true,'cpNAcq'],['cpNTaken','CP N pris (j)','num',0,60,true,'cpNTaken'],['cpNBalance','CP N solde (j)','num',0,60,false,'cpNBal'],
      ['rcPreviousH','RC solde antérieur (h)','num',-1000,1000,false,'rcPrev'],['rcAcquiredH','RC acquis (h)','num',0,500,false,'rcAcq'],['rcTakenH','RC pris (h)','num',0,1000,true,'rcTaken'],['rcBalanceH','RC cumulé (h)','num',-1000,1000,false,'rcBal'],
      ['salaryBaseH','Salaire de base (h)','num',0,400,false,'salary'],['amplitudeOverH','Dépassement amplitude 100% (h, col. Base H.)','num',0,50,false,'ampl'],
      ['hs125EligibleH','HS 125 % éligibles (h, col. Base H.)','num',0,200,false,'hs125E'],['hs125PaidH','HS 125 % payées (h, col. Base)','num',0,200,true,'hs125P'],['hs125ToRcH','HS 125 % versées en RC (h, col. R.C.)','num',0,200,true,null],
      ['hs150EligibleH','HS 150 % éligibles (h, col. Base H.)','num',0,200,false,'hs150E'],['hs150PaidH','HS 150 % payées (h, col. Base)','num',0,200,true,null],['hs150ToRcH','HS 150 % versées en RC (h, col. R.C.)','num',0,200,true,'hs150RC'],
      ['seniorityPct','Prime ancienneté (%, col. Taux)','num',0,30,false,'prime'],['habillageEur','Habillage / déshabillage (€)','num',0,1000,false,'habil']
    ];
    for(const [k,l,kind,min,max,empty,zk] of spec){
      if(!zk){fields[k]=field(k,l,kind,min,max,empty,null,'',{p:1,x0:0,y0:0,x1:0,y1:0});continue}
      const z=Z[zk],r=await readNum(w,c,z,{numeric:true,psm:6});
      fields[k]=field(k,l,kind,min,max,empty,r.value,r.raw,z);
    }
    const mr=await readMany(w,c,Z.mealRow,{numeric:true,psm:11});
    const meals=mr.values;
    fields.mealCount=field('mealCount','Indemnités de repas (nb)','num',0,62,false,meals[0],mr.raw,Z.mealRow);
    fields.uniqueMealCount=field('uniqueMealCount','Repas unique (nb)','num',0,62,false,meals[1],mr.raw,Z.mealRow);
    // Champs explicitement vides dans cette maquette: aucune cellule ne contient une valeur.
    fields.cpN1Acquired=fields.cpN1Acquired.status==='missing'?{...fields.cpN1Acquired,status:'empty',reason:'cellule vide dans le document'}:fields.cpN1Acquired;
    fields.cpNTaken=fields.cpNTaken.status==='missing'?{...fields.cpNTaken,status:'empty',reason:'cellule vide dans le document'}:fields.cpNTaken;
    fields.rcTakenH=fields.rcTakenH.status==='missing'?{...fields.rcTakenH,status:'empty',reason:'cellule vide dans le document'}:fields.rcTakenH;
    fields.hs125ToRcH={key:'hs125ToRcH',label:'HS 125 % versées en RC (h, col. R.C.)',status:'empty',value:null,reason:'cellule vide dans le document',sources:[]};
    fields.hs150PaidH={key:'hs150PaidH',label:'HS 150 % payées (h, col. Base)',status:'empty',value:null,reason:'cellule vide dans le document',sources:[]};
    const required=['periodStart','periodEnd','ttePeriodH','presenceDays','hsPeriodH','tteYearH','hsYearH','presenceYearDays','cpN1PreviousBalance','cpN1Acquired','cpN1Taken','cpN1Balance','cpNPreviousBalance','cpNAcquired','cpNTaken','cpNBalance','rcPreviousH','rcAcquiredH','rcTakenH','rcBalanceH','salaryBaseH','amplitudeOverH','hs125EligibleH','hs125PaidH','hs125ToRcH','hs150EligibleH','hs150PaidH','hs150ToRcH','seniorityPct','habillageEur','mealCount','uniqueMealCount'];
    const blocking=[];const warnings=[];
    const okOrEmpty=k=>fields[k]&&(['ok','empty'].includes(fields[k].status));
    required.forEach(k=>{if(!okOrEmpty(k))blocking.push({key:k,why:fields[k]?fields[k].status+(fields[k].reason?' : '+fields[k].reason:''):'missing'})});
    const v=k=>fields[k]&&fields[k].status==='ok'?fields[k].value:null,z=k=>fields[k]&&fields[k].status==='empty'?0:v(k);
    if(v('periodStart')&&v('periodEnd')){const d=(Date.parse(v('periodEnd'))-Date.parse(v('periodStart')))/864e5;if(d<0||d>62)blocking.push({key:'periodEnd',why:'période invalide'});else if(d!==27)warnings.push({key:'periodEnd',why:'période de '+(d+1)+' jours (28 attendus)'});}
    const pair=(a,b,msg)=>{if(v(a)!=null&&v(b)!=null&&v(a)>v(b))blocking.push({key:a,why:'incohérent : '+msg})};
    pair('presenceDays','presenceYearDays','présence période > année');pair('ttePeriodH','tteYearH','TTE période > année');pair('hsPeriodH','hsYearH','HS période > année');pair('hsPeriodH','ttePeriodH','HS période > TTE période');
    const roll=(a,b,c,d,label,tol)=>{if(v(a)!=null&&v(d)!=null) {const lhs=v(a)+z(b)-Math.abs(z(c));if(Math.abs(lhs-v(d))>tol)blocking.push({key:d,why:'incohérent : '+label})}};
    roll('cpN1PreviousBalance','cpN1Acquired','cpN1Taken','cpN1Balance','CP N-1',0.01);roll('cpNPreviousBalance','cpNAcquired','cpNTaken','cpNBalance','CP N',0.01);roll('rcPreviousH','rcAcquiredH','rcTakenH','rcBalanceH','RC',0.05);
    const split=(a,b,c,label)=>{if(v(a)!=null){const lhs=v(a),rhs=z(b)+z(c);if(Math.abs(lhs-rhs)>0.01)blocking.push({key:a,why:'incohérent : '+label+' éligibles ≠ payées + RC'})}};
    split('hs125EligibleH','hs125PaidH','hs125ToRcH','HS 125 %');split('hs150EligibleH','hs150PaidH','hs150ToRcH','HS 150 %');
    if(v('hsPeriodH')!=null&&v('hs125EligibleH')!=null&&v('hs150EligibleH')!=null&&v('hsPeriodH')+0.05<v('hs125EligibleH')+v('hs150EligibleH'))blocking.push({key:'hsPeriodH',why:'incohérent : HS période < HS 125 + HS 150'});
    const canonical={};required.forEach(k=>canonical[k]=fields[k]&&fields[k].status==='ok'?fields[k].value:null);
    return {fields,check:{ok:blocking.length===0,blocking,warnings},canonical,cells:[],ok:blocking.length===0,source:'zones',note:'Lecture spécialisée des zones ROMI1 — aucun OCR pleine page.',pdfInfo:{pages:pages.length,width:PDF_W,height:PDF_H,scale:SCALE},fileName:file.name,textStats:{cells:0,numeric:0,chars:0}};
  }finally{try{await w.terminate()}catch(e){}}
}


/*
 * BULLETIN — lecture géométrique
 *
 * Même moteur de cellules/colonnes que ROMI1 :
 *   PDF -> Tesseract -> items bbox -> MH_ROMI.analyzeItems()
 *
 * Aucun calibrage de petites zones.
 */


/*
 * BULLETIN — OCR géométrique ROMI1
 *
 * PDF image
 *   -> Tesseract mots + bbox
 *   -> reconstruction lignes/cellules
 *   -> MH_ROMI.analyzeItems()
 *
 * Important :
 * Tesseract fournit des MOTS.
 * ROMI1 travaille sur des CELLULES.
 * On reconstruit donc les cellules avant d'appeler le moteur ROMI1.
 */

function buildOcrCells(words){
  const clean=[];

  for(const w of (words||[])){
    const text=String(w&&w.text||'').trim();
    const b=w&&w.bbox;
    if(!text||!b)continue;

    clean.push({
      text,
      x0:b.x0/SCALE,
      x1:b.x1/SCALE,
      y0:b.y0/SCALE,
      y1:b.y1/SCALE,
      yc:((b.y0+b.y1)/2)/SCALE,
      h:Math.max(1,(b.y1-b.y0)/SCALE)
    });
  }

  /*
   * 1 — reconstruction des lignes.
   *
   * Tesseract travaille en pixels, puis on repasse en points PDF.
   * Deux mots appartiennent à la même ligne si leurs centres verticaux
   * sont suffisamment proches.
   */
  const rows=[];

  for(const w of clean.sort((a,b)=>a.yc-b.yc||a.x0-b.x0)){
    let row=null;

    for(const r of rows){
      const tol=Math.max(2,0.65*Math.min(r.h,w.h));
      if(Math.abs(r.yc-w.yc)<=tol){
        row=r;
        break;
      }
    }

    if(row){
      row.words.push(w);
      row.yc=(row.yc*(row.words.length-1)+w.yc)/row.words.length;
      row.h=Math.max(row.h,w.h);
    }else{
      rows.push({
        yc:w.yc,
        h:w.h,
        words:[w]
      });
    }
  }

  /*
   * 2 — reconstruction des cellules.
   *
   * Petit espace = même cellule.
   * Gros espace = nouvelle cellule / nouvelle colonne.
   *
   * Le seuil est volontairement plus large que celui du buildCells()
   * de ROMI1, car Tesseract fragmente beaucoup plus les mots.
   */
  const cells=[];

  for(const row of rows.sort((a,b)=>a.yc-b.yc)){
    row.words.sort((a,b)=>a.x0-b.x0);

    let cur=null;

    for(const w of row.words){
      if(!cur){
        cur={
          words:[w],
          x0:w.x0,
          x1:w.x1,
          yc:row.yc,
          h:w.h
        };
        continue;
      }

      const gap=w.x0-cur.x1;
      const h=Math.max(cur.h,w.h);

      /*
       * Règle de séparation :
       *
       * - <= 1.25 hauteur : même cellule
       * - > 1.25 hauteur : nouvelle cellule
       *
       * Cela permet de reconstruire :
       *   "Heures" + "T.T.E." -> "Heures T.T.E."
       *   "Base" + "H."        -> "Base H."
       * tout en séparant les colonnes numériques.
       */
      if(gap<=1.25*h){
        cur.words.push(w);
        cur.x1=Math.max(cur.x1,w.x1);
        cur.h=Math.max(cur.h,w.h);
      }else{
        cells.push(cur);
        cur={
          words:[w],
          x0:w.x0,
          x1:w.x1,
          yc:row.yc,
          h:w.h
        };
      }
    }

    if(cur)cells.push(cur);
  }

  /*
   * 3 — conversion en items compatibles avec ROMI1.
   */
  return cells.map(c=>({
    p:c.p||1,
    str:c.words.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim(),
    x0:c.x0,
    x1:c.x1,
    yc:c.yc,
    h:c.h,
    src:'ocr-cell'
  }));
}



/*
 * BULLETIN V2
 *
 * PDF image
 * -> Tesseract OCR
 * -> lignes OCR + bbox
 * -> schéma spécifique BULLETIN
 *
 * IMPORTANT :
 * Ce parseur ne force plus le bulletin de salaire
 * dans le schéma ROMI1.
 */

function bulletinNum(v){
  if(v==null)return null;

  let t=String(v)
    .replace(/\u00a0/g,' ')
    .replace(/\s/g,'')
    .replace(',','.');

  if(!/^-?\d+(?:\.\d+)?$/.test(t))return null;

  const n=Number(t);
  return Number.isFinite(n)?n:null;
}

function bulletinNumbers(text){
  const s=String(text||'')
    .replace(/\u00a0/g,' ');

  /*
   * Accepte :
   * 151.67
   * 151,67
   * 3 253.01
   * 3 253,01
   * 29.00
   */
  const re=/-?\d{1,3}(?:[ .]\d{3})*(?:[,.]\d+)?|-?\d+(?:[,.]\d+)?/g;

  return (s.match(re)||[])
    .map(x=>bulletinNum(x.replace(/ /g,'')))
    .filter(v=>v!==null);
}

function bulletinLineMatch(lines,patterns){
  for(const line of lines){
    const n=String(line.text||'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/\s+/g,' ')
      .trim();

    for(const p of patterns){
      if(p.test(n))return line;
    }
  }

  return null;
}

function bulletinFirstNumber(lines,patterns){
  const line=bulletinLineMatch(lines,patterns);
  if(!line)return null;

  const nums=bulletinNumbers(line.text);

  return nums.length?nums[0]:null;
}

function bulletinCP(lines){
  const out={
    n1:{acquis:null,pris:null,solde:null},
    n:{acquis:null,pris:null,solde:null}
  };

  const findLine=label=>{
    const re=new RegExp('^'+label+'\\b','i');

    for(const line of lines){
      const n=String(line.text||'')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .toLowerCase()
        .replace(/\s+/g,' ')
        .trim();

      if(re.test(n))return line;
    }

    return null;
  };

  const acquis=findLine('acquis');
  const pris=findLine('pris');
  const solde=findLine('solde');

  if(acquis){
    const v=bulletinNumbers(acquis.text);
    if(v.length>0)out.n1.acquis=v[0];
    if(v.length>1)out.n.acquis=v[1];
  }

  if(pris){
    /*
     * Une ligne OCR peut concaténer "Net payé ..."
     * à la ligne "Pris 16.00".
     * On ne doit jamais prendre le montant du net
     * comme un nombre de jours de CP.
     */
    const beforeNet=String(pris.text||'')
      .split(/net\s+pay[eé]/i)[0];

    const v=bulletinNumbers(beforeNet);

    if(v.length>0)out.n1.pris=v[0];
    if(v.length>1)out.n.pris=v[1];
  }

  if(solde){
    const v=bulletinNumbers(solde.text);
    if(v.length>0)out.n1.solde=v[0];
    if(v.length>1)out.n.solde=v[1];
  }

  return out;
}


async function readBulletin(file,lib){
  const pages=await renderPdf(file,lib);
  const w=await makeWorker();

  try{
    const lines=[];
    let fullText='';

    for(let p=0;p<pages.length;p++){
      const canvas=pages[p];

      await w.setParameters({
        tessedit_pageseg_mode:'3',
        tessedit_char_whitelist:''
      });

      /*
       * Tesseract :
       * blocs -> paragraphes -> lignes
       *
       * On conserve la ligne complète car le bulletin
       * est organisé en lignes de paie.
       */
      const r=await w.recognize(
        canvas,
        {},
        {blocks:true}
      );

      const data=r&&r.data?r.data:{};

      if(data.text){
        fullText+=String(data.text)+'\n';
      }

      if(Array.isArray(data.blocks)){
        for(const block of data.blocks){

          for(const paragraph of (block.paragraphs||[])){

            for(const line of (paragraph.lines||[])){

              const text=String(line.text||'').trim();

              if(!text)continue;

              const b=line.bbox||{};

              lines.push({
                page:p+1,
                text,
                x0:Number(b.x0||0)/SCALE,
                x1:Number(b.x1||0)/SCALE,
                y0:Number(b.y0||0)/SCALE,
                y1:Number(b.y1||0)/SCALE
              });
            }
          }
        }
      }
    }

    /*
     * Sécurité si Tesseract ne fournit pas la hiérarchie
     * des lignes.
     */
    if(!lines.length && fullText){

      for(const text of fullText.split(/\r?\n/)){

        const t=text.trim();

        if(!t)continue;

        lines.push({
          page:1,
          text:t,
          x0:0,
          x1:PDF_W,
          y0:0,
          y1:0
        });
      }
    }

    if(!lines.length){
      throw new Error('OCR : aucune ligne exploitable détectée');
    }

    /*
     * ============================
     * SCHÉMA BULLETIN DE SALAIRE
     * ============================
     */

    const salaryBase=bulletinFirstNumber(
      lines,
      [/^salaire de base\b/]
    );

    const hs25=bulletinLineMatch(
      lines,
      [/^heures supplementaires 25 ?%/]
    );

    const hs25H=hs25
      ? bulletinNumbers(String(hs25.text).replace(/^.*?25 ?%/i,'')).shift() ?? null
      : null;

    const hs50=bulletinLineMatch(
      lines,
      [/^heures supplementaires 50 ?%/]
    );

    const hs50H=hs50
      ? bulletinNumbers(String(hs50.text).replace(/^.*?50 ?%/i,'')).shift() ?? null
      : null;

    const habillage=bulletinFirstNumber(
      lines,
      [/^indemnite d'habillage et de deshabillage\b/]
    );

    const amplitude=bulletinFirstNumber(
      lines,
      [
        /^indemnite de depassement d'amplitude journaliere 100 ?%/,
        /^depassement d'amplitude/
      ]
    );

    const repas=bulletinFirstNumber(
      lines,
      [/^indemnite de repas\b(?! unique)/]
    );

    const repasUnique=bulletinFirstNumber(
      lines,
      [/^indemnite de repas unique\b/]
    );

    const brut=bulletinFirstNumber(
      lines,
      [/^salaire brut\b/]
    );

    const net=bulletinFirstNumber(
      lines,
      [/^net paye\b/]
    );

    /*
     * Prime d'ancienneté :
     * on ne confond surtout pas avec "Prime exceptionnelle".
     */
    const primeAnciennete=bulletinFirstNumber(
      lines,
      [/^prime d'anciennete\b/]
    );

    /*
     * Ancienneté du salarié :
     * exemple OCR : "Ancienneté : 7 ans"
     * À ne surtout pas confondre avec la prime d'ancienneté.
     */
    let anciennete=null;
    const ancLine=lines.find(x =>
      /anciennet[eé]\s*:/i.test(String(x.text||''))
    );

    if(ancLine){
      const m=String(ancLine.text||'').match(
        /anciennet[eé]\s*:\s*(\d+(?:[.,]\d+)?)\s*ans?/i
      );
      if(m){
        anciennete=parseFloat(m[1].replace(',','.'));
      }
    }

    /*
     * Congés.
     */
    const cp=bulletinCP(lines);

    /*
     * Mois.
     */
    const monthNames={
      janvier:'01',
      fevrier:'02',
      février:'02',
      mars:'03',
      avril:'04',
      mai:'05',
      juin:'06',
      juillet:'07',
      aout:'08',
      août:'08',
      septembre:'09',
      octobre:'10',
      novembre:'11',
      decembre:'12',
      décembre:'12'
    };

    let mois=null;

    const mm=String(fullText).match(
      /P[ée]riode\s*:?\s*([A-Za-zÀ-ÿ]+)\s+(20\d{2})/i
    );

    if(mm){
      const m=monthNames[
        mm[1]
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g,'')
          .toLowerCase()
      ];

      if(m)mois=mm[2]+'-'+m;
    }

    if(!mois){

      const fm=String(file.name||'').match(
        /(janvier|février|fevrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|décembre|decembre)[ _-]?(20\d{2})/i
      );

      if(fm){

        const m=monthNames[
          fm[1]
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'')
            .toLowerCase()
        ];

        if(m)mois=fm[2]+'-'+m;
      }
    }

    /*
     * Objet bulletin attendu par app-parser.js.
     */
    const bul={

      mois,

      /*
       * Valeurs paie.
       */
      brut,
      net,

      hNorm:salaryBase,

      hs25H:hs25H,
      hs50H:hs50H,

      idajH:amplitude,

      prime:primeAnciennete,
      anciennete:anciennete,
      ancienneteTxt:anciennete!=null ? anciennete+' ans' : null,

      habH:habillage,

      irN:repas,
      iruN:repasUnique,

      /*
       * Congés.
       */
      cpN1:{
        acquis:cp.n1.acquis,
        pris:cp.n1.pris,
        solde:cp.n1.solde
      },

      cpN:{
        acquis:cp.n.acquis,
        pris:cp.n.pris,
        solde:cp.n.solde
      },

      /*
       * Ce bulletin ne contient pas le tableau RC ROMI1.
       * On ne fabrique donc aucune valeur.
       */
      rcAvant:null,
      rcApres:null,

      periodStart:null,
      periodEnd:null,

      /*
       * Métadonnées.
       */
      _specialized:true,
      _source:'bulletin-ocr-lines-v2',

      _ocrLines:lines.length,
      _ocrChars:fullText.length,

      _ocrDebug:lines.map(l=>({
        page:l.page,
        text:l.text
      }))
    };

    /*
     * Petit état de lecture pour le module d'affichage.
     */
    const status={
      brut:brut!=null?'ok':'missing',
      net:net!=null?'ok':'missing',
      hNorm:salaryBase!=null?'ok':'missing',
      hs25H:hs25H!=null?'ok':'missing',
      hs50H:hs50H!=null?'ok':'missing',
      idajH:amplitude!=null?'ok':'missing',
      prime:primeAnciennete!=null?'ok':'missing',
      habH:habillage!=null?'ok':'missing',
      irN:repas!=null?'ok':'missing',
      iruN:repasUnique!=null?'ok':'missing'
    };

    return {
      fields:bul,

      text:fullText.trim(),

      fileName:file.name,

      pdfInfo:{
        pages:pages.length,
        width:PDF_W,
        height:PDF_H,
        scale:SCALE
      },

      analysis:{
        type:'bulletin',
        source:'ocr',
        status,
        lines:lines.length
      }
    };

  }finally{

    try{
      await w.terminate();
    }catch(e){}

  }
}

root.MHSpecializedReader={version:'1.0.0',readRomi1,readBulletin};
})(typeof window!=='undefined'?window:globalThis);
