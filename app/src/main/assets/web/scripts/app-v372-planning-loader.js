/*
 * MesHeures V37.2.0-C — Planning prévu : chargement de l'original conservé pour l'analyse (lecture seule).
 * 1. adresse de la source (MHPlanningImport.sources.url : servie par l'APK ou URL locale) ;
 * 2. octets relus et SHA-256 recalculé : refus si l'empreinte diffère de celle de l'import (source modifiée ou remplacée) ;
 * 3. décodage en COPIE : image orientée selon l'EXIF (createImageBitmap « from-image »), PDF page 1 rendue par pdf.js ;
 *    réduction éventuelle (côté max 3200 px) avec l'échelle conservée pour reporter les coordonnées dans l'original ;
 * 4. analyse (MHPlanningAnalysis) avec l'OCR du navigateur (MHPlanningOCR), puis libération du moteur.
 * Le fichier source n'est jamais réécrit. Aucun accès aux journées réelles.
 */
(function(root){
  'use strict';
  const V='37.2.0-C',MAX=3200,MAX_PAGES=6;
  const echec=(code,message)=>({ok:false,code,message});
  /* échelle de la copie d'analyse : jamais d'agrandissement, côté max ≤ max */
  function echelleCible(w,h,max){max=max||MAX;const m=Math.max(Number(w)||0,Number(h)||0);return m>max?max/m:1}

  async function octets(rec,deps){
    const I=deps.imp||root.MHPlanningImport;if(!I||!I.sources)return {err:echec('MODULE','Module d’import indisponible.')};
    const url=await I.sources.url(rec.source.localRef);if(!url)return {err:echec('SOURCE_ABSENTE','Original introuvable sur cet appareil (source à vérifier).')};
    try{const r=await(deps.fetch||root.fetch)(url);if(!r||!r.ok)return {err:echec('SOURCE_ABSENTE','Original introuvable sur cet appareil (source à vérifier).')};
      return {bytes:new Uint8Array(await r.arrayBuffer()),url}}
    catch(e){return {err:echec('SOURCE_ABSENTE','Lecture de l’original impossible : '+(e&&e.message||e)+'.')}}
    finally{if(/^blob:/.test(url)&&root.URL&&URL.revokeObjectURL)try{URL.revokeObjectURL(url)}catch(e){}}
  }
  /* décodeur navigateur : retourne {image:ImageData, largeur, hauteur} (dimensions de l'image orientée, avant réduction) */
  /* Image unique d'une page PDF (scan), sans transformation : {image, largeur, hauteur} ou null. */
  async function imageEmbarquee(lib,page,max){
    const ops=await page.getOperatorList(),O=lib.OPS,noms=[];let autres=0;
    for(let i=0;i<ops.fnArray.length;i++){const f=ops.fnArray[i];if(f===O.paintImageXObject||f===O.paintJpegXObject)noms.push(ops.argsArray[i][0]);
      else if(f===O.showText||f===O.fill||f===O.stroke||f===O.paintInlineImageXObject||f===O.paintImageMaskXObject)autres++}
    if(noms.length!==1||autres)return null;
    const obj=await new Promise(res=>{try{page.objs.get(noms[0],res)}catch(e){res(null)}});if(!obj||!(obj.width>200&&obj.height>200))return null;
    const W=obj.width,H=obj.height,k=echelleCible(W,H,max),c=document.createElement('canvas');c.width=Math.round(W*k);c.height=Math.round(H*k);
    const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingQuality='high';
    if(obj.bitmap)x.drawImage(obj.bitmap,0,0,c.width,c.height);
    else if(obj.data){const t=document.createElement('canvas');t.width=W;t.height=H;const tx=t.getContext('2d'),id=tx.createImageData(W,H),d=obj.data,n=W*H;
      if(obj.kind===3)id.data.set(d.subarray(0,n*4));else if(obj.kind===2)for(let i=0,j=0;i<n;i++,j+=3){id.data[i*4]=d[j];id.data[i*4+1]=d[j+1];id.data[i*4+2]=d[j+2];id.data[i*4+3]=255}
      else return null;tx.putImageData(id,0,0);x.drawImage(t,0,0,c.width,c.height)}
    else return null;
    return {image:x.getImageData(0,0,c.width,c.height),largeur:W,hauteur:H};
  }
  const decodeurNavigateur={
    async image(bytes,mime,max){
      const blob=new Blob([bytes],{type:mime||''});let src;
      try{src=await createImageBitmap(blob,{imageOrientation:'from-image'})}
      catch(e){src=await new Promise((res,rej)=>{const u=URL.createObjectURL(blob),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('image illisible'))};i.src=u})}
      const W=src.width||src.naturalWidth,H=src.height||src.naturalHeight,k=echelleCible(W,H,max);
      const c=document.createElement('canvas');c.width=Math.max(1,Math.round(W*k));c.height=Math.max(1,Math.round(H*k));
      const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingQuality='high';x.drawImage(src,0,0,c.width,c.height);if(src.close)src.close();
      return {image:x.getImageData(0,0,c.width,c.height),largeur:W,hauteur:H};
    },
    /* PDF : chaque page (6 au plus) rendue en image ; page 1 = image principale */
    async pdf(bytes,max){
      await root.mhLoadLib('pdf');const lib=root.pdfjsLib;if(!lib)throw new Error('pdf.js indisponible');
      const doc=await lib.getDocument({data:bytes.slice()}).promise;
      try{const pages=[];for(let n=1;n<=Math.min(doc.numPages,MAX_PAGES);n++){const page=await doc.getPage(n);
          /* PDF scanné (une seule image par page) : l'image embarquée est lue telle quelle, à sa résolution d'origine (le rendu
             de la page la rééchantillonne et dégrade le petit texte) ; sinon, rendu de la page */
          const emb=await imageEmbarquee(lib,page,max).catch(()=>null);
          if(emb){pages.push(Object.assign({page:n,source:'image embarquée'},emb));continue}
          const v1=page.getViewport({scale:1}),k=Math.min(4,echelleCible(v1.width*4,v1.height*4,max)*4),vp=page.getViewport({scale:k});
          const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);const x=c.getContext('2d',{willReadFrequently:true});
          x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await page.render({canvasContext:x,viewport:vp}).promise;
          pages.push({page:n,source:'rendu',image:x.getImageData(0,0,c.width,c.height),largeur:c.width,hauteur:c.height})}
        return {image:pages[0].image,largeur:pages[0].largeur,hauteur:pages[0].hauteur,pages:doc.numPages,images:pages}}
      finally{try{doc.destroy()}catch(e){}}
    }
  };
  /* Charge l'original d'un import. deps (tests) : {imp, fetch, sha256, decodeur, max}. */
  async function charger(rec,deps){
    deps=deps||{};const P=root.MHPlanning;
    if(!rec||!rec.source||!/^[0-9a-f]{64}$/.test(String(rec.source.sha256||'')))return echec('SOURCE_INVALIDE','Import sans empreinte SHA-256 valide.');
    const o=await octets(rec,deps);if(o.err)return o.err;
    const sha=await(deps.sha256||P.sha256)(o.bytes);
    if(sha!==rec.source.sha256)return echec('SOURCE_MODIFIEE','L’original ne correspond plus à l’empreinte enregistrée (SHA-256 différent) : analyse refusée.');
    const dec=deps.decodeur||decodeurNavigateur,f=rec.source.format,max=deps.max||MAX;
    let d;try{d=f==='pdf'?await dec.pdf(o.bytes,max):['jpeg','png','webp'].includes(f)?await dec.image(o.bytes,rec.source.mimeType,max):null}
    catch(e){return echec('DECODAGE','Image illisible : '+(e&&e.message||e)+'.')}
    if(!d||!d.image)return echec('FORMAT','Format non analysable.');
    /* Dimensions explicites : image ORIENTÉE (décodée, pleine résolution) et fichier ORIGINAL (avant orientation EXIF).
       L'original se déduit de l'image orientée (largeur ↔ hauteur pour les orientations 5 à 8) ; si le décodeur n'a pas
       appliqué une rotation EXIF (dimensions non échangées alors que l'en-tête l'exige), l'image analysée EST l'original :
       orientation 1 retenue pour les coordonnées, et signalée. */
    let orientation=f==='pdf'?1:Number(rec.source.orientation)||1,orientationAppliquee=true;
    const Lo=d.largeur,Ho=d.hauteur,W=Number(rec.source.largeur)||0,H=Number(rec.source.hauteur)||0;
    if([5,6,7,8].includes(orientation)&&W&&H&&W!==H&&Lo===W&&Ho===H){orientation=1;orientationAppliquee=false}
    const dO=root.MHPlanningGrid.dimsOrientees(Lo,Ho,orientation);
    return {ok:true,sha256:sha,image:d.image,echelle:d.image.width/Lo,orientation,orientationExif:Number(rec.source.orientation)||null,orientationAppliquee,
      largeurOrientee:Lo,hauteurOrientee:Ho,largeurOriginale:dO.largeur,hauteurOriginale:dO.hauteur,pages:d.pages||null,
      /* PDF de plusieurs pages : une image par page (coordonnées propres à chaque page, en pixels de rendu) */
      images:Array.isArray(d.images)&&d.images.length>1?d.images.map(x=>({page:x.page,source:x.source,image:x.image,orientation:1,echelle:x.image.width/x.largeur,largeurOrientee:x.largeur,hauteurOrientee:x.hauteur,largeurOriginale:x.largeur,hauteurOriginale:x.hauteur})):null};
  }
  /* Chaîne complète. opts : {nomRef, choix, progression(texte), ocr (moteur injecté), cache (Map, lectures déjà faites), deps} */
  async function analyser(rec,opts){
    opts=opts||{};const say=t=>{try{opts.progression&&opts.progression(t)}catch(e){}};
    say('Lecture de l’original…');const c=await charger(rec,opts.deps);
    if(!c.ok){const a=await root.MHPlanningAnalysis.analyser({sourceSha256:rec&&rec.source&&rec.source.sha256,image:null,ocr:null});a.warnings=[{code:c.code,texte:c.message}];return a}
    say('Chargement de l’OCR…');let ocr=opts.ocr,propre=false;
    if(!ocr){try{ocr=await root.MHPlanningOCR.creer({progression:n=>say('Lecture des zones… '+n)});propre=true}catch(e){ocr=null}}
    const moteur=ocr;
    /* cache des lectures (même original, mêmes zones) : un changement de ligne ne relit que ce qui manque */
    if(ocr&&opts.cache){const base=ocr,m=opts.cache;ocr={moteur:base.moteur,async lire(img,r,mode){const k=(img.cle||'')+'|'+mode+':'+[r.x,r.y,r.w,r.h].map(Math.round).join(',');
      if(m.has(k))return m.get(k);const v=await base.lire(img,r,mode);m.set(k,v);return v}}}
    try{say('Analyse du tableau…');
      if(c.images)c.images.forEach(p=>{p.image.cle='p'+p.page});else c.image.cle='p1';
      const a=await root.MHPlanningAnalysis.analyser({pages:c.images||undefined,image:c.image,orientation:c.orientation,largeurOrientee:c.largeurOrientee,hauteurOrientee:c.hauteurOrientee,largeurOriginale:c.largeurOriginale,hauteurOriginale:c.hauteurOriginale,echelle:c.echelle,
        sourceSha256:c.sha256,ocr,nomRef:opts.nomRef||'',choix:opts.choix||[]});
      if(!c.orientationAppliquee)a.warnings.push({code:'ORIENTATION_NON_APPLIQUEE',texte:'Orientation EXIF '+c.orientationExif+' non appliquée par l’appareil au décodage : image analysée telle que stockée (coordonnées sans rotation).'});
      return a}
    finally{if(propre&&moteur&&moteur.terminer)await moteur.terminer()}
  }
  root.MHPlanningLoader={version:V,MAX,echelleCible,charger,analyser};
})(typeof window!=='undefined'?window:globalThis);
