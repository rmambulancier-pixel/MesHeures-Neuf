/*
 * MesHeures V37.2.0-C — Planning prévu : lecture OCR de zones (navigateur).
 * Réutilise tesseract.js déjà embarqué (mhLoadLib('tesseract'), mêmes chemins que specialized-reader.js, langue fra).
 * Chaque zone est lue sur une COPIE agrandie, contrastée et binarisée (MHPlanningGrid.vueOcr) : l'image source n'est jamais modifiée.
 * Interface commune (aussi utilisée par les tests avec un moteur simulé) : lire(image, rect, mode) → {text, conf 0-100}.
 * Modes : 'titre', 'entete' (date « L 05/10 »), 'nom', 'cellule'.
 */
(function(root){
  'use strict';
  const V='37.2.0-C';
  const SRC=()=>root._mhLibSrc||{};
  const PARAMS={titre:{psm:'6',wl:''},entete:{psm:'7',wl:'LMJVSDlmjvsd0123456789/ '},nom:{psm:'7',wl:''},cellule:{psm:'6',wl:''}};
  /* hauteur visée de la zone agrandie (le texte d'une cellule fait ~1/3 de sa hauteur) et marge intérieure (liserés exclus) */
  const HAUTEUR={titre:110,entete:120,nom:100,cellule:130},MARGE={titre:0,entete:0.06,nom:0.04,cellule:0.07};

  async function creer(opts){
    opts=opts||{};
    if(typeof root.mhLoadLib!=='function')throw new Error('Bibliothèque OCR indisponible.');
    await root.mhLoadLib('tesseract');
    if(!root.Tesseract)throw new Error('Tesseract indisponible.');
    const s=SRC(),worker=await root.Tesseract.createWorker('fra',1,{workerPath:s.tesseractWorker||'vendor/tesseract/worker.min.js',corePath:s.tesseractCore||'vendor/tesseract/core',langPath:s.tesseractLang||'vendor/tesseract/lang'});
    let mode=null,n=0;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    async function lire(img,rect,m){
      const p=PARAMS[m]||PARAMS.cellule;
      if(mode!==m){await worker.setParameters({tessedit_pageseg_mode:p.psm,tessedit_char_whitelist:p.wl,preserve_interword_spaces:'1'});mode=m}
      const v=root.MHPlanningGrid.vueOcr(img,rect,HAUTEUR[m]||100,MARGE[m]||0);
      canvas.width=v.width+40;canvas.height=v.height+40;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.putImageData(new ImageData(v.data,v.width,v.height),20,20);
      const r=await worker.recognize(canvas);n++;
      if(opts.progression)try{opts.progression(n)}catch(e){}
      return {text:String(r&&r.data&&r.data.text||'').replace(/\s+\n/g,'\n').trim(),conf:Math.max(0,Math.min(100,Math.round(Number(r&&r.data&&r.data.confidence)||0)))};
    }
    return {version:V,moteur:'tesseract.js (fra)',lire,lectures:()=>n,terminer:async()=>{try{await worker.terminate()}catch(e){}}};
  }
  root.MHPlanningOCR={version:V,creer};
})(window);
