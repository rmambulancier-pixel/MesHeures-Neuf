/*
 * MesHeures V37.2.0-C — Planning prévu : analyse structurée d'un planning photographié (lecture contrôlée).
 *
 * Chaîne : image (orientée, jamais modifiée) → tableaux et grille (MHPlanningGrid) → titre, en-têtes de dates, noms (OCR)
 * → ligne du salarié → cellules de CETTE ligne seulement → interprétation par les règles du lot A (MHPlanning.interpreter)
 * → contrôles → objet d'analyse « à valider ».
 * Principes : une cellule illisible n'a jamais de valeur inventée ; une date peu sûre vaut null (avec une date proposée
 * affichée comme telle) ; la couleur n'est qu'un indice, apprise dans la même image, jamais une valeur ; aucune donnée des
 * autres salariés n'est conservée (leurs noms ne servent qu'au choix, en mémoire, et sont retirés par serialiser()).
 * Aucun accès à DB ni au moteur des heures réelles.
 */
(function(root){
  'use strict';
  const V='37.2.0-C';
  const P=()=>root.MHPlanning,G=()=>root.MHPlanningGrid;
  const ISO=/^\d{4}-\d{2}-\d{2}$/;
  const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const ecartJ=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
  const LETTRES=['D','L','M','M','J','V','S'];
  const pad=n=>String(n).padStart(2,'0');
  const fr=k=>ISO.test(String(k||''))?k.slice(8)+'/'+k.slice(5,7):'—';
  const CHEMIN={exacte:'exacte',variante:'variante OCR déclarée',generale:'tolérance générale',aucune:'aucune',manuel:'correction manuelle'};
  const FACTEUR={exacte:1,variante:0.9,generale:0.7,aucune:0,manuel:1};
  const STATUTS=['lu','interprété','à vérifier','illisible','vide','non_interprété'];

  /* ---------- dates ---------- */
  /* « L 05/10 » sans période connue : l'année est choisie au plus près de la date de référence (± 6 mois). */
  function dateLibre(texte,ref){
    const m=/([LMJVSD])?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i.exec(String(texte||''));if(!m)return null;
    const y0=+String(ref||'').slice(0,4)||new Date().getFullYear();let best=null;
    for(const y of [y0-1,y0,y0+1]){const k=y+'-'+pad(m[3])+'-'+pad(m[2]);if(!P().verifierPeriode(k,k).ok)continue;
      const d=Math.abs(ecartJ(ref,k));if(!best||d<best.d)best={k,d}}
    if(!best||best.d>190)return null;const l=LETTRES[new Date(best.k+'T12:00:00Z').getUTCDay()];
    return {date:best.k,lettre:m[1]?m[1].toUpperCase():null,lettreOk:m[1]?m[1].toUpperCase()===l:null};
  }
  /* Association colonne → date, avec contrôles. Une colonne n'a une date que si son en-tête est lu ET cohérent avec la suite. */
  function datesColonnes(entetes,periode,ref){
    const n=entetes.length,lus=entetes.map(e=>{const d=periode?P().dateEntete(e.text,periode):dateLibre(e.text,ref);return d?Object.assign(d,{conf:e.conf}):null});
    /* première date la plus probable : vote (date lue − rang) */
    const votes={};lus.forEach((d,j)=>{if(d&&d.lettreOk!==false){const d0=addJ(d.date,-j);votes[d0]=(votes[d0]||0)+1}});
    const tri=Object.entries(votes).sort((a,b)=>b[1]-a[1]),d0=tri.length&&tri[0][1]>=Math.max(2,Math.ceil(lus.filter(Boolean).length*0.3))?tri[0][0]:null;
    const cols=[],warnings=[],vus={};
    lus.forEach((d,j)=>{const attendu=d0?addJ(d0,j):null;let date=null,statut='à vérifier',raison;
      if(!d){raison=entetes[j].text?'en-tête illisible (« '+entetes[j].text+' »)':'en-tête illisible';warnings.push({code:'DATE_MANQUANTE',colonne:j,texte:'Colonne '+(j+1)+' : '+raison+(attendu?' ; date proposée '+fr(attendu)+' (position)':'')+'.'})}
      else if(d.lettreOk===false){raison='jour de la semaine incohérent';warnings.push({code:'DATE_INCOHERENTE',colonne:j,date:d.date,texte:'Colonne '+(j+1)+' : « '+entetes[j].text+' » ne correspond pas au jour de la semaine du '+fr(d.date)+'.'})}
      else if(attendu&&d.date!==attendu){raison='hors de la suite chronologique';warnings.push({code:'DATE_INCOHERENTE',colonne:j,date:d.date,texte:'Colonne '+(j+1)+' : '+fr(d.date)+' lu, '+fr(attendu)+' attendu dans la suite des colonnes.'})}
      else if(periode&&(d.date<periode.debut||d.date>periode.fin)){raison='hors période';warnings.push({code:'COLONNE_IMPOSSIBLE',colonne:j,date:d.date,texte:'Colonne '+(j+1)+' : '+fr(d.date)+' hors de la période du titre.'})}
      else if(!d0){raison='suite chronologique non établie'}
      else{date=d.date;statut='fiable'}
      if(date){if(vus[date]!=null){warnings.push({code:'DOUBLON',colonne:j,date,texte:'Date '+fr(date)+' en double (colonnes '+(vus[date]+1)+' et '+(j+1)+').'});date=null;statut='à vérifier';raison='date en double'}else vus[date]=j}
      cols.push({colonne:j,date,dateProposee:date?null:attendu,statut,raison:raison||null,entete:entetes[j].text,confEntete:entetes[j].conf})});
    if(periode&&d0){
      if(d0!==periode.debut)warnings.push({code:'COLONNE_DECALEE',colonne:0,texte:'La 1re colonne lue correspond au '+fr(d0)+' alors que le titre commence le '+fr(periode.debut)+' : colonne perdue ou décalée.'});
      const jours=ecartJ(periode.debut,periode.fin)+1;if(n!==jours)warnings.push({code:'PERIODE_INCOMPLETE',texte:n+' colonne(s) détectée(s) pour '+jours+' jour(s) de période ('+fr(periode.debut)+' → '+fr(periode.fin)+').'});
    }
    if(!d0)warnings.push({code:'DATE_MANQUANTE',texte:'Suite des dates non établie : trop peu d’en-têtes lisibles.'});
    return {colonnes:cols,premiere:d0,warnings};
  }

  /* ---------- une cellule ---------- */
  /* Liserés lus comme caractères aux BORDS du texte (« | », « [ », « ] », « { », « } ») : retirés avant interprétation, et dit
     dans la justification. Jamais une lettre ni un chiffre ; rawText reste la lecture brute. */
  const BORD=/^[|\[\]{}]+\s*|\s*[|\[\]{}]+$/g;
  function cellule(lecture,col,couleur){
    const brut=String(lecture.text||''),net=brut.trim().replace(BORD,'').trim(),bords=net!==brut.trim();
    const I=P().interpreter(net),txt=net,conf=lecture.conf==null?0:lecture.conf;
    const chemin=I.correspondance==='exacte'?'exacte':I.correspondance==='approchée'?(I.tolerance==='variante'?'variante':'generale'):'aucune';
    const fiable=!!col.date,confiance=Math.round((conf/100)*FACTEUR[chemin]*(fiable?1:0.6)*100)/100;
    let status,motif;
    if(!txt&&couleur&&!couleur.rempli){status='vide';motif='cellule sans couleur ni texte'}
    else if(!txt||conf<35){status='illisible';motif=!txt?'aucun texte lu':'lecture trop peu sûre ('+conf+' %)'}
    else if(I.type==='NON_INTERPRETE'){status='non_interprété';motif='code inconnu du dictionnaire'}
    else if(!fiable){status='à vérifier';motif='date de la colonne non sûre'}
    else if(chemin==='generale'){status='à vérifier';motif='lecture approchée (tolérance générale)'}
    else if(conf<70){status='à vérifier';motif='lecture peu sûre ('+conf+' %)'}
    else if(I.applicable===false){status='à vérifier';motif='« '+I.libelle+' » déclaré non concerné'}
    else{status='interprété';motif=null}
    const ok=status!=='illisible'&&status!=='vide';
    const justification=!txt?'Aucun texte lu : aucune valeur n’est déduite.':
      'Lecture « '+brut.trim().replace(/\n/g,' ')+' »'+(bords?' (bords « | [ ] { } » retirés : « '+txt.replace(/\n/g,' ')+' »)':'')+' (confiance OCR '+conf+' %) → '+(I.regle?'règle '+I.regle+' ('+CHEMIN[chemin]+(I.variante?' « '+I.variante+' »':'')+')':'aucune règle')+'.'+(motif?' À vérifier : '+motif+'.':'');
    return {date:col.date,dateProposee:col.dateProposee,colonne:col.colonne,rawText:String(lecture.text||''),normalizedText:I.normalise,confOcr:conf,
      color:couleur?{rgb:couleur.rgb,hex:couleur.hex,hsl:couleur.hsl,rempli:couleur.rempli,groupe:null}:null,bounds:null,boundsOriginal:null,
      interpretation:ok&&I.type!=='VIDE'?{type:I.type,libelle:I.libelle,dureeMin:I.dureeMin,horaires:I.horaires,amplitudeMin:I.amplitudeMin,applicable:I.applicable,regle:I.regle,chemin}:null,
      chemin:ok?chemin:'aucune',confidence:confiance,status,motif,justification,revue:false};
  }

  /* ---------- analyse complète ---------- */
  /* Copie tournée de 180° (page scannée à l'envers) ; l'image reçue n'est jamais modifiée. */
  function tourner180(img){const W=img.width,H=img.height,s=img.data,o=new Uint8ClampedArray(s.length);
    for(let p=0,q=(W*H-1)*4;p<s.length;p+=4,q-=4){o[q]=s[p];o[q+1]=s[p+1];o[q+2]=s[p+2];o[q+3]=s[p+3]}return {width:W,height:H,data:o,cle:(img.cle||'')+':180'}}
  /* opts : {image (ImageData de l'image ORIENTÉE, éventuellement réduite), orientation (EXIF 1-8),
   *        largeurOrientee, hauteurOrientee (image orientée, pleine résolution), largeurOriginale, hauteurOriginale (fichier stocké,
   *        AVANT orientation), echelle (image analysée / image orientée pleine résolution), sourceSha256, ocr:{lire}, nomRef,
   *        choix:[{table,ligne}], maintenant}
   *   ou pages:[{image, orientation, largeurOrientee, hauteurOrientee, largeurOriginale, hauteurOriginale, echelle, page}] (PDF de
   *        plusieurs pages) ; les tableaux sont numérotés de suite d'une page à l'autre.
   * Sans dimensions fournies : image orientée = image analysée / échelle, original déduit de l'orientation (largeur ↔ hauteur en 5-8).
   * Une page sans tableau daté est relue tournée de 180° (scan à l'envers) ; la rotation est reportée dans les coordonnées. */
  async function analyser(opts){
    opts=opts||{};const now=opts.maintenant||new Date().toISOString(),ref=now.slice(0,10);
    const base={version:V,sourceSha256:opts.sourceSha256||null,analyzedAt:now,tableCandidates:[],selectedEmployee:null,period:null,cells:[],warnings:[],confidence:0,status:'analyse_incomplète',corrections:[],
      moteur:opts.ocr&&opts.ocr.moteur||'',_candidats:null};
    if(!/^[0-9a-f]{64}$/.test(String(opts.sourceSha256||''))){base.warnings.push({code:'SOURCE_INVALIDE',texte:'Empreinte SHA-256 de la source invalide : analyse refusée.'});base.status='analyse_incomplète';return base}
    const pages=Array.isArray(opts.pages)&&opts.pages.length?opts.pages:[Object.assign({},opts,{page:null})];
    if(pages.some(p=>!p.image||!p.image.width||!p.image.height||!p.image.data)){base.warnings.push({code:'SOURCE_INVALIDE',texte:'Image indisponible ou illisible.'});return base}
    if(!opts.ocr||typeof opts.ocr.lire!=='function'){base.warnings.push({code:'OCR_INDISPONIBLE',texte:'Lecture OCR indisponible sur cet appareil.'});return base}
    /* lecture des tableaux d'une image : titre, en-têtes (dates), noms */
    const lireTables=async(img,vers)=>{const out=[];for(const t of G().detecterTableaux(img)){
      const titre=await opts.ocr.lire(img,t.zoneTitre(),'titre'),periode=P().periodeDuTitre(titre.text);
      const entetes=[];for(let j=0;j<t.colonnes;j++)entetes.push(await opts.ocr.lire(img,t.zoneEntete(j),'entete'));
      const D=datesColonnes(entetes,periode,ref);
      const noms=[];for(let i=0;i<t.lignes;i++){const r=await opts.ocr.lire(img,t.zoneNom(i),'nom');noms.push({ligne:i,texte:r.text.replace(/\n/g,' ').trim(),conf:r.conf})}
      out.push({t,titre,periode,D,noms,img,vers})}return out};
    const score=l=>l.reduce((s,x)=>s+x.D.colonnes.filter(c=>c.date).length+(x.periode?5:0),0);
    const tables=[];
    for(const pg of pages){
      const img=pg.image,k=pg.echelle||1,o=Number(pg.orientation)||1;
      const Lo=pg.largeurOrientee||img.width/k,Ho=pg.hauteurOrientee||img.height/k,inv=G().dimsOrientees(Lo,Ho,o);   // l'échange largeur/hauteur est sa propre réciproque
      const W0=pg.largeurOriginale||inv.largeur,H0=pg.hauteurOriginale||inv.hauteur;
      const vers=b=>G().versOriginal({x:b.x/k,y:b.y/k,w:b.w/k,h:b.h/k},o,W0,H0);
      let lus=await lireTables(img,vers),rot=false;
      if(opts.essai180!==false&&score(lus)===0){const r=tourner180(img),vers180=b=>vers({x:img.width-b.x-b.w,y:img.height-b.y-b.h,w:b.w,h:b.h});
        const l2=await lireTables(r,vers180);if(score(l2)>score(lus)){lus=l2;rot=true}}
      lus.forEach(x=>{x.gi=tables.length;x.page=pg.page;x.rot180=rot;x.lecturePage=pg.source||null;tables.push(x)});
      if(rot)base.warnings.push({code:'PAGE_RETOURNEE',page:pg.page,texte:(pg.page!=null?'Page '+pg.page:'Image')+' à l’envers : lue tournée de 180° (l’original n’est pas modifié).'});
    }
    if(!tables.length){base.warnings.push({code:'TABLEAU_ABSENT',texte:'Aucun tableau de planning reconnu dans l’image (cadrage, netteté, éclairage).'});return base}
    const candidatsParTable=[];
    tables.forEach(x=>{const {t,titre,periode,D,noms,gi}=x;
      const cand=P().candidats(noms,opts.nomRef||'');
      candidatsParTable.push({table:gi,candidats:cand.candidats,preselection:cand.preselection});
      base.tableCandidates.push({index:gi,page:x.page,lecturePage:x.lecturePage,rotation180:x.rot180,bounds:t.bounds,boundsOriginal:x.vers(t.bounds),lignes:t.lignes,colonnes:t.colonnes,pasLigne:t.pasLigne,pasColonne:t.pasColonne,
        inclinaison:t.inclinaison,titreLu:titre.text,periodeTitre:periode,premiereDate:D.premiere,datesFiables:D.colonnes.filter(c=>c.date).length});
      D.warnings.forEach(w=>base.warnings.push(Object.assign({table:gi},w)));
      if(!periode)base.warnings.push({code:'DATE_MANQUANTE',table:gi,texte:'Tableau '+(gi+1)+' : titre « Planning du … au … » non lu ; dates établies par les en-têtes seuls.'});
    });
    base._candidats=candidatsParTable;
    /* ligne du salarié : choix manuel, sinon présélection sûre et unique dans chaque tableau */
    const choisies=[];
    tables.forEach(({t,noms,gi})=>{const c=candidatsParTable.find(x=>x.table===gi),man=(opts.choix||[]).find(x=>x.table===gi);
      const ligne=man?man.ligne:c.preselection;
      if(ligne==null||ligne<0||ligne>=t.lignes){base.warnings.push({code:'LIGNE_AMBIGUE',table:gi,texte:'Tableau '+(gi+1)+' : '+(opts.nomRef?'aucune ligne ne correspond avec certitude à « '+opts.nomRef+' »':'nom de référence non renseigné')+' : choisis ta ligne.'});return}
      const lu=noms[ligne],sc=c.candidats.find(x=>x.ligne===ligne);
      choisies.push({table:gi,ligne,nomLu:lu.texte,confOcr:lu.conf,score:sc&&sc.score,auto:!man});
    });
    if(choisies.length)base.selectedEmployee={nom:opts.nomRef||choisies[0].nomLu,parTableau:choisies,confirme:false};
    /* cellules de la ligne choisie, et seulement elle */
    for(const ch of choisies){
      const {t,D,img,vers,page}=tables[ch.table],row=t.cellules[ch.ligne];
      const couleursTable=t.cellules.map(r=>r.map(c=>G().couleur(img,c.bounds)));   // couleurs de tout le tableau : en mémoire, pour l'indice seulement
      const groupes=G().grouper(couleursTable.flat());
      const gid=(i,j)=>{const idx=i*t.colonnes+j,g=groupes.find(x=>x.membres.includes(idx));return g?g.id:null};
      for(let j=0;j<row.length;j++){const b=row[j].bounds,lec=await opts.ocr.lire(img,b,'cellule'),c=cellule(lec,D.colonnes[j],couleursTable[ch.ligne][j]);
        c.table=ch.table;if(page!=null)c.page=page;c.bounds=b;c.boundsOriginal=vers(b);if(c.color)c.color.groupe=gid(ch.ligne,j);base.cells.push(c)}
    }
    controles(base);
    /* période et confiance globales */
    const dates=base.cells.map(c=>c.date).filter(Boolean).sort();
    base.period=dates.length?{debut:dates[0],fin:dates[dates.length-1],titres:base.tableCandidates.map(x=>x.periodeTitre).filter(Boolean)}:null;
    const lisibles=base.cells.filter(c=>c.status!=='vide');
    base.confidence=lisibles.length?Math.round(lisibles.reduce((s,c)=>s+c.confidence,0)/lisibles.length*100)/100:0;
    base.status=base.selectedEmployee&&base.cells.length&&dates.length?'à_valider':'analyse_incomplète';
    return base;
  }

  /* ---------- contrôles transverses (jamais de correction silencieuse) ---------- */
  function controles(a){
    const W=a.warnings,cells=a.cells;
    cells.forEach((c,i)=>{c.index=i;
      if(c.status==='illisible')W.push({code:'CELLULE_ILLISIBLE',cellule:i,date:c.date,texte:'Cellule '+(c.date?'du '+fr(c.date):'colonne '+(c.colonne+1))+' illisible : aucune valeur déduite.'});
      if(c.status==='non_interprété')W.push({code:'CODE_INCONNU',cellule:i,date:c.date,texte:'Code « '+c.rawText.replace(/\n/g,' ')+' » inconnu du dictionnaire.'});
      if(/^[LMJVSD]\s*\d{1,2}\s*\/\s*\d{1,2}$/i.test(c.rawText.trim())||/^(planning|employ)/i.test(c.normalizedText)){c.status='à vérifier';c.motif='texte d’en-tête lu dans une cellule';
        W.push({code:'CONTRADICTION_STRUCTURE',cellule:i,date:c.date,texte:'Cellule '+fr(c.date)+' : « '+c.rawText+' » ressemble à un en-tête : grille probablement décalée.'})}});
    /* durée inhabituelle (règle du lot A, sur les journées « Jour Nh » de la ligne) */
    const jours=cells.filter(c=>c.interpretation&&c.interpretation.type==='JOUR'&&c.interpretation.dureeMin!=null),freq={};
    jours.forEach(c=>{freq[c.interpretation.dureeMin]=(freq[c.interpretation.dureeMin]||0)+1});
    const mode=Object.keys(freq).sort((x,y)=>freq[y]-freq[x])[0];
    if(jours.length>=3)jours.filter(c=>String(c.interpretation.dureeMin)!==mode).forEach(c=>{if(c.status==='interprété'){c.status='à vérifier';c.motif='durée inhabituelle sur la ligne'}
      W.push({code:'DUREE_INHABITUELLE',cellule:c.index,date:c.date,texte:'« '+c.interpretation.libelle+' » le '+fr(c.date)+' alors que la ligne indique surtout '+P().hm(+mode)+'.'})});
    /* couleur : indice appris dans la même image (groupes de couleurs des cellules interprétées avec certitude) */
    const parGroupe={};cells.forEach(c=>{if(c.status==='interprété'&&c.confidence>=0.8&&c.color&&c.color.groupe!=null){const g=parGroupe[c.color.groupe]||(parGroupe[c.color.groupe]={});g[c.interpretation.type]=(g[c.interpretation.type]||0)+1}});
    const dominant=g=>{const e=Object.entries(parGroupe[g]||{}).sort((x,y)=>y[1]-x[1]),n=e.reduce((s,x)=>s+x[1],0);return e.length&&e[0][1]>=3&&e[0][1]/n>=0.8?e[0][0]:null};
    cells.forEach(c=>{if(!c.color||c.color.groupe==null)return;const d=dominant(c.color.groupe);
      if(d&&c.interpretation&&c.interpretation.type!==d){c.status=c.status==='interprété'?'à vérifier':c.status;c.motif='couleur habituelle d’un autre code';
        W.push({code:'CONTRADICTION_COULEUR',cellule:c.index,date:c.date,texte:'Cellule '+fr(c.date)+' : texte « '+c.interpretation.libelle+' », mais sa couleur est celle des cellules « '+d+' » de ta ligne. À vérifier.'})}
      if(d&&!c.interpretation)c.indiceCouleur={type:d,note:'couleur proche des cellules « '+d+' » (indice seulement, aucune valeur retenue)'}});
    /* même date dans deux tableaux (plannings qui se chevauchent) */
    const parDate={};cells.forEach(c=>{if(c.date)(parDate[c.date]=parDate[c.date]||[]).push(c)});
    Object.entries(parDate).forEach(([d,l])=>{if(l.length<2)return;const types=new Set(l.map(c=>c.interpretation?c.interpretation.type:'?'));
      if(types.size>1)l.forEach(c=>{c.status=c.status==='interprété'?'à vérifier':c.status;c.motif='date présente dans deux plannings avec des lectures différentes'});
      W.push({code:'DOUBLON',date:d,texte:'Le '+fr(d)+' figure dans '+l.length+' tableaux'+(types.size>1?' avec des lectures différentes : à vérifier.':' (lectures identiques).')})});
  }

  /* Objet à conserver : sans la liste des noms lus (collègues) ni les données transitoires. */
  function serialiser(a){const o=JSON.parse(JSON.stringify(Object.assign({},a,{_candidats:undefined})));delete o._candidats;return o}

  root.MHPlanningAnalysis={version:V,STATUTS,CHEMIN,analyser,tourner180,serialiser,datesColonnes,dateLibre,cellule,controles};
})(typeof window!=='undefined'?window:globalThis);
