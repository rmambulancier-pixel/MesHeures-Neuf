/*
 * MesHeures V37.2.0-B — Planning prévu : import d'une source (photo, galerie, fichier, PDF).
 *
 * Aucun OCR, aucune détection de cellules, aucun salarié reconnu, aucune couleur interprétée, aucune journée créée.
 * Rôle : contrôler le fichier (contenu réel, taille), calculer son SHA-256, ranger l'ORIGINAL intact sur le téléphone,
 * lire le texte d'un PDF texte, enregistrer la fiche « à analyser » via le cœur (MHPlanning).
 *
 * Rangement des originaux :
 *  - dans l'APK : stockage privé de l'application (files/plannings/<sha256>.<ext>), via le pont MesHeuresAndroid ;
 *    la fiche garde la référence « android:<sha256>.<ext> », jamais le contenu ;
 *  - hors APK (navigateur, tests) : IndexedDB « mesheures-planning », référence « idb:<sha256>.<ext> ».
 * Le texte d'un PDF texte est rangé avec la source (<sha256>.txt), pas dans la fiche ni dans la sauvegarde JSON :
 * un planning collectif contient les noms et horaires des collègues (décision du 08/10/2026 : ne garder que sa ligne).
 * Aucun accès à DB ni au moteur.
 */
(function(root){
  'use strict';
  const V='37.2.0-B';
  const MAX_OCTETS=20*1024*1024, MIN_OCTETS=64;
  const SEUIL_TEXTE=30;            // caractères visibles minimum pour qu'un PDF soit « texte »
  const MAX_TEXTE=400000;
  const EXT={jpeg:'jpg',png:'png',webp:'webp',pdf:'pdf'};
  const LIBELLE_SOURCE={photo:'Photo',galerie:'Galerie',fichier:'Fichier'};

  /* ---------- contrôle du contenu réel (jamais l'extension ni le type annoncé) ---------- */
  function detecter(b){
    if(!b||b.length<12)return null;
    const s=(i,n)=>String.fromCharCode.apply(null,Array.from(b.subarray(i,i+n)));
    if(b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF)return {format:'jpeg',mime:'image/jpeg',ext:'jpg'};
    if(b[0]===0x89&&s(1,3)==='PNG'&&b[4]===0x0D&&b[5]===0x0A&&b[6]===0x1A&&b[7]===0x0A)return {format:'png',mime:'image/png',ext:'png'};
    if(s(0,4)==='RIFF'&&s(8,4)==='WEBP')return {format:'webp',mime:'image/webp',ext:'webp'};
    if(s(0,5)==='%PDF-')return {format:'pdf',mime:'application/pdf',ext:'pdf'};
    return null;
  }
  /* Nom affiché seulement (jamais utilisé comme chemin) : sans dossier, sans caractères de contrôle ni réservés. */
  function nomPropre(nom){
    let n=String(nom==null?'':nom).split(/[\\/]/).pop().normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'').replace(/\s+/g,' ').trim();
    if(n.length>100){const m=/(\.[A-Za-z0-9]{1,5})$/.exec(n);n=n.slice(0,100-(m?m[1].length:0))+(m?m[1]:'')}
    return n||'planning';
  }
  /* Orientation EXIF (balise 0x0112) d'un JPEG : 1 à 8, ou null. Lecture seule, l'original n'est jamais modifié. */
  function orientationExif(b){
    if(!b||b[0]!==0xFF||b[1]!==0xD8)return null;
    let i=2;
    while(i+4<b.length){
      if(b[i]!==0xFF)return null;
      const mk=b[i+1],len=(b[i+2]<<8)|b[i+3];
      if(mk===0xDA||mk===0xD9)return null;
      if(mk===0xE1&&String.fromCharCode(b[i+4],b[i+5],b[i+6],b[i+7])==='Exif'){
        const t=i+10,le=b[t]===0x49&&b[t+1]===0x49;if(!le&&!(b[t]===0x4D&&b[t+1]===0x4D))return null;
        const u16=o=>le?b[o]|(b[o+1]<<8):(b[o]<<8)|b[o+1],u32=o=>le?(b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0:((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0;
        const ifd=t+u32(t+4);if(ifd+2>b.length)return null;
        const n=u16(ifd);
        for(let k=0;k<n;k++){const e=ifd+2+k*12;if(e+12>b.length)return null;if(u16(e)===0x0112){const v=u16(e+8);return v>=1&&v<=8?v:null}}
        return null;
      }
      i+=2+len;
    }
    return null;
  }
  /* Dimensions lues dans l'en-tête (sans décoder l'image). */
  function dimensions(b,format){
    try{
      if(format==='png')return {largeur:((b[16]<<24)|(b[17]<<16)|(b[18]<<8)|b[19])>>>0,hauteur:((b[20]<<24)|(b[21]<<16)|(b[22]<<8)|b[23])>>>0};
      if(format==='jpeg'){let i=2;while(i+9<b.length){if(b[i]!==0xFF)return null;const mk=b[i+1],len=(b[i+2]<<8)|b[i+3];
        if(mk>=0xC0&&mk<=0xCF&&mk!==0xC4&&mk!==0xC8&&mk!==0xCC)return {hauteur:(b[i+5]<<8)|b[i+6],largeur:(b[i+7]<<8)|b[i+8]};
        if(mk===0xDA||mk===0xD9)return null;i+=2+len}return null}
      if(format==='webp'){const c=String.fromCharCode(b[12],b[13],b[14],b[15]);
        if(c==='VP8X')return {largeur:1+(b[24]|(b[25]<<8)|(b[26]<<16)),hauteur:1+(b[27]|(b[28]<<8)|(b[29]<<16))};
        if(c==='VP8 ')return {largeur:(b[26]|(b[27]<<8))&0x3FFF,hauteur:(b[28]|(b[29]<<8))&0x3FFF};
        if(c==='VP8L'){const x=b[21]|(b[22]<<8)|(b[23]<<16)|(b[24]<<24);return {largeur:(x&0x3FFF)+1,hauteur:((x>>>14)&0x3FFF)+1}}}
    }catch(e){}
    return null;
  }
  /* PDF texte ou PDF image, d'après le texte sélectionnable de chaque page. */
  function classerPdf(pages){
    const l=Array.isArray(pages)?pages:[],car=l.reduce((s,t)=>s+String(t||'').replace(/\s+/g,'').length,0);
    return {textuel:car>=SEUIL_TEXTE,caracteres:car,pages:l.length};
  }

  /* ---------- lecture d'un PDF (pdf.js déjà présent dans MesHeures) ---------- */
  async function textesPdf(bytes){
    if(typeof root.mhLoadLib!=='function')throw new Error('Lecteur PDF indisponible.');
    await root.mhLoadLib('pdf');
    const lib=root.pdfjsLib||root['pdfjs-dist/build/pdf'];if(!lib)throw new Error('PDF.js non chargé.');
    if(lib.GlobalWorkerOptions&&!lib.GlobalWorkerOptions.workerSrc)lib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';
    const pdf=await lib.getDocument({data:bytes.slice(),isEvalSupported:false}).promise,pages=[];
    for(let p=1;p<=pdf.numPages;p++){const ct=await (await pdf.getPage(p)).getTextContent();pages.push(ct.items.map(it=>it.str).join(' '))}
    try{pdf.destroy()}catch(e){}
    return pages;
  }

  /* ---------- rangement des originaux ---------- */
  const NOM=/^[0-9a-f]{64}\.(jpg|png|webp|pdf|txt)$/;
  const b64=part=>{let s='';for(let j=0;j<part.length;j++)s+=String.fromCharCode(part[j]);return root.btoa(s)};
  function natif(){const A=root.MesHeuresAndroid;
    return A&&['planningSourceBegin','planningSourceAppend','planningSourceFinish','planningSourceExists','planningSourceDelete'].every(f=>typeof A[f]==='function')?A:null}
  const IDB={
    open(){return new Promise((res,rej)=>{if(!root.indexedDB)return rej(new Error('Stockage local indisponible.'));const r=root.indexedDB.open('mesheures-planning',1);
      r.onupgradeneeded=()=>{try{r.result.createObjectStore('sources')}catch(e){}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error||new Error('IndexedDB'))})},
    async tx(mode,fn){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('sources',mode),q=fn(t.objectStore('sources'));t.oncomplete=()=>{db.close();res(q&&q.result)};t.onerror=()=>{db.close();rej(t.error)}})}
  };
  const sources={
    mode(){return natif()?'android':'idb'},
    /* Écrit un fichier sous son nom contrôlé ; le natif vérifie lui-même le SHA-256 des octets reçus. Retourne la référence. */
    async put(nom,bytes,sha,mime){
      if(!NOM.test(nom))throw new Error('Nom de source invalide.');
      const A=natif();
      if(A){if(!A.planningSourceBegin(nom,sha))throw new Error('Stockage de la source refusé par l’application.');
        const step=24576;for(let i=0;i<bytes.length;i+=step)A.planningSourceAppend(b64(bytes.subarray(i,i+step)));
        if(!A.planningSourceFinish())throw new Error('Écriture de la source impossible (empreinte ou espace).');return 'android:'+nom}
      await IDB.tx('readwrite',s=>s.put({nom,mime:mime||'',sha256:sha,octets:bytes.slice().buffer},nom));return 'idb:'+nom;
    },
    async existe(ref){const m=/^(android|idb):(.+)$/.exec(String(ref||''));if(!m||!NOM.test(m[2]))return false;
      try{if(m[1]==='android'){const A=natif();return !!(A&&A.planningSourceExists(m[2]))}
        return !!(await IDB.tx('readonly',s=>s.getKey(m[2])))}catch(e){return false}},
    async supprimer(ref){const m=/^(android|idb):(.+)$/.exec(String(ref||''));if(!m||!NOM.test(m[2]))return false;
      try{if(m[1]==='android'){const A=natif();return !!(A&&A.planningSourceDelete(m[2]))}
        await IDB.tx('readwrite',s=>s.delete(m[2]));return true}catch(e){return false}},
    /* Adresse d'affichage : servie par l'application (APK) ou URL locale temporaire (navigateur). */
    async url(ref){const m=/^(android|idb):(.+)$/.exec(String(ref||''));if(!m||!NOM.test(m[2]))return null;
      if(m[1]==='android')return natif()?'/planning-source/'+m[2]:null;
      try{const r=await IDB.tx('readonly',s=>s.get(m[2]));return r?URL.createObjectURL(new Blob([r.octets],{type:r.mime||''})):null}catch(e){return null}},
    async texte(ref){const m=/^(android|idb):(.+\.txt)$/.exec(String(ref||''));if(!m||!NOM.test(m[2]))return null;
      try{if(m[1]==='android'){const r=await fetch('/planning-source/'+m[2]);return r.ok?await r.text():null}
        const r=await IDB.tx('readonly',s=>s.get(m[2]));return r?new TextDecoder().decode(r.octets):null}catch(e){return null}}
  };

  /* ---------- import ---------- */
  const erreur=(message,code)=>({statut:'erreur',code:code||'ERREUR',message});
  async function importer(file,opts){
    opts=opts||{};
    const P=root.MHPlanning;if(!P)return erreur('Module Planning indisponible.');
    if(!file)return {statut:'annule',message:'Import annulé : aucun fichier choisi.'};
    const sourceType=['photo','galerie','fichier'].includes(opts.sourceType)?opts.sourceType:'fichier';
    if(!(file.size>=MIN_OCTETS))return erreur('Fichier vide ou invalide.','INVALIDE');
    if(file.size>MAX_OCTETS)return erreur('Fichier trop volumineux ('+Math.round(file.size/1048576)+' Mo) : 20 Mo au maximum.','TROP_GROS');
    let bytes;try{bytes=new Uint8Array(await file.arrayBuffer())}catch(e){return erreur('Lecture du fichier impossible.','LECTURE')}
    const f=detecter(bytes);
    if(!f)return erreur('Fichier non reconnu : seuls les JPG, PNG, WEBP et PDF sont acceptés.','INVALIDE');
    const sha=await P.sha256(bytes),st=P.store();
    const dup=st.importParEmpreinte(sha);
    if(dup)return {statut:'doublon',code:'DOUBLON',existant:dup,message:'Ce fichier a déjà été importé le '+String(dup.importedAt).slice(8,10)+'/'+String(dup.importedAt).slice(5,7)+'/'+String(dup.importedAt).slice(0,4)+' : il n’est pas importé une seconde fois.'};
    let texte=null,pages=null,orientation=null,dim=null;
    if(f.format==='pdf'){
      let t;try{t=await textesPdf(bytes)}catch(e){return erreur('PDF illisible : '+(e&&e.message||e),'PDF')}
      const c=classerPdf(t);pages=c.pages;texte={textuel:c.textuel,caracteres:c.caracteres,pages:c.pages};
      if(c.textuel){const txt=t.join('\f').slice(0,MAX_TEXTE),tb=new TextEncoder().encode(txt);texte.sha256=await P.sha256(tb);texte._octets=tb}
    }else{orientation=f.format==='jpeg'?orientationExif(bytes):null;dim=dimensions(bytes,f.format)}
    let ref,tref=null;
    try{ref=await sources.put(sha+'.'+f.ext,bytes,sha,f.mime)}catch(e){return erreur(e.message||'Stockage de la source impossible.','STOCKAGE')}
    if(texte&&texte._octets){try{tref=await sources.put(sha+'.txt',texte._octets,texte.sha256,'text/plain')}catch(e){tref=null}texte.ref=tref;if(!tref)texte.textuel=false;delete texte._octets}
    let rec;
    try{
      rec=P.creerImport({sourceType,format:f.format,sha256:sha,localRef:ref,size:bytes.length,originalFileName:nomPropre(file.name),orientation,
        largeur:dim&&dim.largeur,hauteur:dim&&dim.hauteur,pages,texte,importedAt:opts.importedAt});
      st.importEnregistrer(rec);
    }catch(e){await sources.supprimer(ref);if(tref)await sources.supprimer(tref);return erreur(e.message,e.code||'ENREGISTREMENT')}
    return {statut:'ok',record:rec};
  }
  /* Disponibilité des sources : « disponible » si le fichier est retrouvé, sinon « à vérifier » (jamais « absente »). */
  async function verifierSources(){
    const P=root.MHPlanning;if(!P)return {disponible:0,a_verifier:0};const st=P.store(),n={disponible:0,a_verifier:0};
    for(const r of st.importsListe()){const ok=await sources.existe(r.source.localRef),d=ok?'disponible':'a_verifier';n[d]++;if(r.source.disponibilite!==d)st.importMaj(r.id,{disponibilite:d})}
    return n;
  }
  /* Suppression d'un import ; l'original n'est effacé que si « avecSource » est demandé explicitement. */
  async function supprimer(id,opts){
    const P=root.MHPlanning,st=P.store(),r=st.importLire(id);if(!r)return {fiche:false,source:false};
    const fiche=st.importSupprimer(id);let source=false;
    if(opts&&opts.avecSource===true){source=await sources.supprimer(r.source.localRef);const t=r.extraction&&r.extraction.texte&&r.extraction.texte.ref;if(t)await sources.supprimer(t)}
    return {fiche,source};
  }

  root.MHPlanningImport={version:V,MAX_OCTETS,SEUIL_TEXTE,LIBELLE_SOURCE,detecter,nomPropre,orientationExif,dimensions,classerPdf,sources,importer,verifierSources,supprimer};
})(typeof window!=='undefined'?window:globalThis);
