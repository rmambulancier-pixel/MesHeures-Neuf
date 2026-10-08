/*
 * MesHeures V37.2.0-A — Planning PRÉVU : cœur du module (logique pure, lecture contrôlée).
 *
 * Un planning importé est PRÉVISIONNEL. Il ne remplace ni ne modifie jamais les journées réellement saisies
 * (DB.days) et ne prouve pas une heure travaillée. Ce module n'accède pas à DB : il ne peut donc modifier ni cd(),
 * ni TTE, HS, amplitude, quatorzaines, CP, IDAJ, repas, ROMI1.
 *
 * Décisions de l'utilisateur (08/10/2026) :
 *  - SAMU = garde de 8h00 à 20h00 ; « Condo m » (CONDOM) = garde commerciale de 8h00 à 20h00 ;
 *  - « Congés 35 » = congés des salariés au contrat 35 h (son contrat) ; jamais converti automatiquement en CP ;
 *  - « Récup 39h » ne le concerne pas ; Matin / Après-midi déclarés non concernés (horaires non fournis) :
 *    s'ils apparaissent sur sa ligne, ils sont signalés à vérifier ;
 *  - seule la ligne du salarié est conservée (aucun nom ni planning de collègue enregistré) ;
 *  - sauvegarde JSON sans les photos (l'original reste sur l'appareil, identifié par son SHA-256).
 * Données OCR brutes et données interprétées sont séparées ; une correction s'ajoute au journal sans effacer le brut.
 * Aucun horaire n'est déduit d'un libellé dont le sens n'est pas défini dans le dictionnaire.
 */
(function(root){
  'use strict';
  const V='37.2.0-A';
  const KEY='mh_planning_v372';
  const ISO=/^\d{4}-\d{2}-\d{2}$/;
  const MAX_JOURS=62;

  /* ---------- outils ---------- */
  const isIso=k=>ISO.test(String(k||''))&&!isNaN(Date.parse(k+'T12:00:00Z'))&&new Date(Date.parse(k+'T12:00:00Z')).toISOString().slice(0,10)===k;
  const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const nbJours=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5)+1;
  const pad=n=>String(n).padStart(2,'0');
  const clone=o=>JSON.parse(JSON.stringify(o));
  function norm(s){
    return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
      .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  }
  function lev(a,b){
    a=String(a);b=String(b);if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur}
    return prev[b.length];
  }
  const digits=s=>String(s).replace(/\D/g,'');
  const hm=m=>m==null?null:Math.floor(m/60)+'h'+pad(m%60);
  const minutes=t=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(t||''));return m?+m[1]*60+ +m[2]:null};

  /* ---------- dictionnaire de libellés (versionné) ---------- */
  /* motif : sur le libellé normalisé (minuscules, sans accents ni ponctuation). canon : formes pour la correspondance approchée. */
  const DICT_V1=Object.freeze({id:'mh-planning',version:1,date:'2026-10-08',source:'définitions données par l’utilisateur le 08/10/2026',regles:[
    {id:'JOUR',motif:'^jour ?(\\d{1,2}) ?h ?(\\d{2})?$',canon:['jour 7h'],type:'JOUR',libelle:'Jour {h}h',dureeDuLibelle:true,horaires:null,applicable:true,
      note:'Durée lue dans le libellé. Horaires non indiqués par le planning.'},
    {id:'REPOS',motif:'^repos$',canon:['repos'],type:'REPOS',libelle:'Repos',horaires:null,applicable:true,note:'Repos prévu.'},
    {id:'SAMU',motif:'^samu$',canon:['samu'],type:'GARDE_SAMU',libelle:'Samu',horaires:{debut:'08:00',fin:'20:00'},applicable:true,
      note:'Garde SAMU de 8h00 à 20h00 (amplitude prévue). Temps de travail effectif non indiqué.'},
    {id:'CONDOM',motif:'^condo ?m?$',canon:['condo m','condom','condo'],type:'GARDE_COMMERCIALE',libelle:'Condo m',horaires:{debut:'08:00',fin:'20:00'},applicable:true,
      note:'Garde commerciale de 8h00 à 20h00 (amplitude prévue). Temps de travail effectif non indiqué.'},
    {id:'CONGES_35',motif:'^conges? ?35 ?h?$',canon:['conges 35'],type:'CONGES_35H',libelle:'Congés 35',horaires:null,applicable:true,
      note:'Congés (contrat 35 h). Jamais converti automatiquement en CP MesHeures.'},
    {id:'RECUP_39',motif:'^recup ?39 ?h?$',canon:['recup 39h'],type:'RECUP_39H',libelle:'Récup 39h',horaires:null,applicable:false,
      note:'Ne concerne pas le salarié (contrat 35 h).'},
    {id:'MATIN',motif:'^matin$',canon:['matin'],type:'MATIN',libelle:'Matin',horaires:null,applicable:false,
      note:'Déclaré non concerné par l’utilisateur ; horaires non fournis.'},
    {id:'APRES_MIDI',motif:'^apres ?midi$',canon:['apres midi'],type:'APRES_MIDI',libelle:'Après-midi',horaires:null,applicable:false,
      note:'Déclaré non concerné par l’utilisateur ; horaires non fournis.'},
    {id:'FERIE',motif:'^jour ?ferie$',canon:['jour ferie'],type:'FERIE',libelle:'Jour férié',horaires:null,applicable:true,note:'Jour férié prévu.'},
    {id:'FORMATION',motif:'^formation$',canon:['formation'],type:'FORMATION',libelle:'Formation',horaires:null,applicable:true,
      note:'Formation prévue ; horaires non indiqués.'}
  ]});

  /* Interprétation d'un libellé : exacte (motif), approchée (faute d'OCR légère, chiffres identiques), sinon non interprétée. */
  function interpreter(brut,dict){
    dict=dict||DICT_V1;
    const n=norm(brut);
    const res=(r,m,mode)=>{
      let dureeMin=null,libelle=r.libelle;
      if(r.dureeDuLibelle&&m){dureeMin=(+m[1])*60+(m[2]?+m[2]:0);libelle=r.libelle.replace('{h}',m[1]+(m[2]?pad(+m[2]):''))}
      const h=r.horaires?{debut:r.horaires.debut,fin:r.horaires.fin}:null;
      const amp=h?((minutes(h.fin)-minutes(h.debut)+1440)%1440||1440):null;
      return {brut:String(brut==null?'':brut),normalise:n,regle:r.id,type:r.type,libelle,applicable:r.applicable,dureeMin,horaires:h,amplitudeMin:amp,
        correspondance:mode,note:r.note};
    };
    if(!n)return {brut:String(brut==null?'':brut),normalise:'',regle:null,type:'VIDE',libelle:'',applicable:null,dureeMin:null,horaires:null,amplitudeMin:null,correspondance:'aucune',note:'Cellule vide ou illisible.'};
    for(const r of dict.regles){const m=new RegExp(r.motif).exec(n);if(m)return res(r,m,'exacte')}
    /* correspondance approchée : distance faible ET mêmes chiffres (jamais « Jour 8h » pour « Jour 7h ») */
    let best=null;
    dict.regles.forEach(r=>(r.canon||[]).forEach(c=>{
      if(digits(c)!==digits(n))return;
      const d=lev(n.replace(/ /g,''),c.replace(/ /g,'')),tol=Math.max(1,Math.floor(c.replace(/ /g,'').length/5));
      if(d<=tol&&(!best||d<best.d))best={r,c,d};
    }));
    if(best){const m=new RegExp(best.r.motif).exec(best.c);return res(best.r,m,'approchée')}
    return {brut:String(brut),normalise:n,regle:null,type:'NON_INTERPRETE',libelle:String(brut).trim(),applicable:null,dureeMin:null,horaires:null,amplitudeMin:null,
      correspondance:'aucune',note:'Libellé inconnu : non interprété, aucune durée déduite. À définir dans le dictionnaire si besoin.'};
  }

  /* ---------- période et dates ---------- */
  /* « Planning du 05/10/2026 au 04/11/2026 » ; tolère le bruit d'OCR courant (O→0, l/I→1, espaces autour des /). */
  function periodeDuTitre(texte){
    const t=String(texte||'').replace(/[Oo](?=\d)|(?<=\d)[Oo]/g,'0').replace(/(?<=\d)[lI|](?=\d)|(?<=[\s/])[lI|](?=\d)/g,'1').replace(/\s*\/\s*/g,'/');
    const m=/du\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+au\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
    if(!m)return null;
    const debut=m[3]+'-'+pad(m[2])+'-'+pad(m[1]),fin=m[6]+'-'+pad(m[5])+'-'+pad(m[4]);
    return verifierPeriode(debut,fin).ok?{debut,fin}:null;
  }
  function verifierPeriode(debut,fin){
    if(!isIso(debut)||!isIso(fin))return {ok:false,raison:'date invalide'};
    if(fin<debut)return {ok:false,raison:'fin avant le début'};
    if(nbJours(debut,fin)>MAX_JOURS)return {ok:false,raison:'période de plus de '+MAX_JOURS+' jours'};
    return {ok:true,jours:nbJours(debut,fin)};
  }
  function datesPeriode(debut,fin){if(!verifierPeriode(debut,fin).ok)return [];const out=[];for(let k=debut;k<=fin;k=addJ(k,1))out.push(k);return out}
  /* En-tête de colonne « L 05/10 » → date ISO, avec l'année de la période et contrôle de la lettre du jour. */
  const LETTRES=['D','L','M','M','J','V','S'];
  function dateEntete(texte,periode){
    const m=/([LMJVSD])?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i.exec(String(texte||''));if(!m)return null;
    for(const y of [periode.debut.slice(0,4),periode.fin.slice(0,4)]){
      const k=y+'-'+pad(m[3])+'-'+pad(m[2]);
      if(isIso(k)&&k>=periode.debut&&k<=periode.fin){
        const l=LETTRES[new Date(k+'T12:00:00Z').getUTCDay()];
        return {date:k,lettre:m[1]?m[1].toUpperCase():null,lettreOk:m[1]?m[1].toUpperCase()===l:null};
      }
    }
    return null;
  }
  /* Contrôle des colonnes : nombre = jours de la période, dates consécutives, lettres cohérentes. */
  function verifierColonnes(entetes,periode){
    const att=datesPeriode(periode.debut,periode.fin),anomalies=[];
    if(entetes.length!==att.length)anomalies.push({code:'COLONNES',date:null,texte:entetes.length+' colonne(s) lue(s) pour '+att.length+' jour(s) de période.'});
    entetes.forEach((e,i)=>{const d=dateEntete(e,periode);
      if(!d)anomalies.push({code:'ENTETE_ILLISIBLE',date:att[i]||null,texte:'En-tête « '+e+' » illisible.'});
      else{if(d.date!==att[i])anomalies.push({code:'ENTETE_DECALEE',date:d.date,texte:'Colonne '+(i+1)+' : '+d.date+' au lieu de '+(att[i]||'—')+'.'});
        if(d.lettreOk===false)anomalies.push({code:'JOUR_SEMAINE',date:d.date,texte:'Lettre du jour incohérente pour '+d.date+'.'})}});
    return {ok:!anomalies.length,anomalies};
  }

  /* ---------- salarié ---------- */
  const nomNorm=s=>norm(s).replace(/ /g,'');
  function scoreNom(lu,ref){const a=nomNorm(lu),b=nomNorm(ref);if(!a||!b)return 0;return Math.max(0,1-lev(a,b)/Math.max(a.length,b.length))}
  /* Candidats triés ; présélection seulement si score ≥ 0,85 et nettement devant le suivant. Jamais de choix sans confirmation. */
  function candidats(noms,nomRef){
    const l=(noms||[]).map(n=>({ligne:n.ligne,texte:String(n.texte||''),conf:n.conf==null?null:n.conf,score:nomRef?Math.round(scoreNom(n.texte,nomRef)*100)/100:null}));
    if(nomRef)l.sort((a,b)=>b.score-a.score||a.ligne-b.ligne);
    const top=l[0],next=l[1];
    const preselection=nomRef&&top&&top.score>=0.85&&(!next||top.score-next.score>=0.15)?top.ligne:null;
    return {candidats:l,preselection,confirmationRequise:true};
  }
  /* Extrait UNIQUEMENT la ligne choisie : aucune autre ligne ni aucun autre nom n'est retourné. */
  function extraireLigne(grille,ligne){
    const row=grille&&grille.cellules&&grille.cellules[ligne];
    if(!Array.isArray(row))throw new Error('Ligne '+ligne+' absente de la grille.');
    const nom=(grille.noms||[]).find(n=>n.ligne===ligne);
    return {ligne,nomLu:nom?String(nom.texte||''):'',nomConf:nom&&nom.conf!=null?nom.conf:null,
      cellules:row.map((c,i)=>({colonne:i,texte:String(c&&c.texte||''),conf:c&&c.conf!=null?c.conf:null,bbox:c&&c.bbox||null,couleur:c&&c.couleur||null}))};
  }

  /* ---------- création d'un planning ---------- */
  function confiance(ocrConf,corresp){const o=ocrConf==null?0.6:Math.max(0,Math.min(1,ocrConf/100));return Math.round(o*(corresp==='exacte'?1:corresp==='approchée'?0.7:0)*100)/100}
  function interpretation(date,cellule,dict){
    const i=interpreter(cellule.texte,dict);
    return {date,colonne:cellule.colonne,libelle:i.libelle,type:i.type,regle:i.regle,applicable:i.applicable,dureeMin:i.dureeMin,horaires:i.horaires,amplitudeMin:i.amplitudeMin,
      correspondance:i.correspondance,confiance:confiance(cellule.conf,i.correspondance),origine:'texte'};
  }
  function anomaliesDe(p){
    const out=[],nb=datesPeriode(p.periode.debut,p.periode.fin).length;
    if(p.ocr.cellules.length!==nb)out.push({code:'COLONNES',date:null,texte:p.ocr.cellules.length+' cellule(s) pour '+nb+' jour(s) de période.'});
    p.interpretation.forEach(x=>{
      if(x.type==='NON_INTERPRETE')out.push({code:'NON_INTERPRETE',date:x.date,texte:'Libellé non interprété : « '+x.libelle+' ».'});
      else if(x.type==='VIDE')out.push({code:'VIDE',date:x.date,texte:'Cellule vide ou illisible.'});
      else if(x.applicable===false)out.push({code:'NON_APPLICABLE',date:x.date,texte:'« '+x.libelle+' » figure sur la ligne du salarié alors qu’il est déclaré non concerné : à vérifier.'});
      if(x.origine!=='manuel'&&x.type!=='VIDE'&&x.type!=='NON_INTERPRETE'&&x.confiance<0.5)out.push({code:'CONFIANCE_FAIBLE',date:x.date,texte:'Lecture peu sûre (confiance '+Math.round(x.confiance*100)+' %).'});
    });
    /* Durée « Jour Nh » différente de la durée dominante de la ligne : possible erreur de lecture (7 lu 1), signalée. */
    const j=p.interpretation.filter(x=>x.type==='JOUR'&&x.dureeMin!=null),freq={};j.forEach(x=>{freq[x.dureeMin]=(freq[x.dureeMin]||0)+1});
    const mode=Object.keys(freq).sort((a,b)=>freq[b]-freq[a])[0];
    if(j.length>=3&&mode!=null)j.filter(x=>String(x.dureeMin)!==mode&&x.origine!=='manuel').forEach(x=>out.push({code:'DUREE_INHABITUELLE',date:x.date,texte:'« '+x.libelle+' » alors que la ligne indique surtout '+hm(+mode)+' : à vérifier.'}));
    return out;
  }
  /* opts : {id, importeLe, source:{nom,mime,taille,sha256}, periode:{debut,fin,origine}, salarie:{nom,ligne,confirme}, ligne:(extraireLigne), ocr:{moteur,statut,titre}, dictionnaire} */
  function creer(opts){
    const o=opts||{},dict=o.dictionnaire||DICT_V1;
    if(!o.salarie||o.salarie.confirme!==true)throw new Error('Salarié non confirmé : le choix de la ligne doit être validé par l’utilisateur.');
    const per=o.periode||{},vp=verifierPeriode(per.debut,per.fin);if(!vp.ok)throw new Error('Période invalide : '+vp.raison+'.');
    const src=o.source||{};if(!/^[0-9a-f]{64}$/.test(String(src.sha256||'')))throw new Error('Empreinte SHA-256 de la source manquante.');
    const ligne=o.ligne;if(!ligne||!Array.isArray(ligne.cellules))throw new Error('Ligne du salarié manquante.');
    const dates=datesPeriode(per.debut,per.fin);
    const cellules=ligne.cellules.map((c,i)=>({date:dates[i]||null,colonne:c.colonne,texte:c.texte,conf:c.conf,bbox:c.bbox,couleur:c.couleur}));
    const p={
      id:o.id||null,format:'MesHeures Planning prévu',version:V,nature:'prévisionnel',importeLe:o.importeLe||new Date().toISOString(),statut:'brouillon',
      source:{nom:String(src.nom||''),mime:String(src.mime||''),taille:Number(src.taille)||null,sha256:src.sha256,original:'appareil'},
      periode:{debut:per.debut,fin:per.fin,origine:per.origine==='manuel'?'manuel':'ocr'},
      salarie:{nom:String(o.salarie.nom||ligne.nomLu||''),ligne:ligne.ligne,choix:'utilisateur',nomLu:ligne.nomLu,nomConf:ligne.nomConf},
      ocr:{moteur:String(o.ocr&&o.ocr.moteur||''),statut:String(o.ocr&&o.ocr.statut||'partiel'),titre:o.ocr&&o.ocr.titre?String(o.ocr.titre):null,cellules},
      interpretation:cellules.filter(c=>c.date).map(c=>interpretation(c.date,c,dict)),
      corrections:[],dictionnaire:{id:dict.id,version:dict.version},anomalies:[]
    };
    p.anomalies=anomaliesDe(p);
    return p;
  }

  /* ---------- corrections manuelles (journal ; l'OCR brut n'est jamais modifié) ---------- */
  const CHAMPS=['libelle','type','dureeMin','date','salarie'];
  function corriger(planning,c){
    if(!c||!CHAMPS.includes(c.champ))throw new Error('Champ de correction inconnu : '+(c&&c.champ));
    const p=clone(planning),le=c.le||new Date().toISOString();
    if(c.champ==='salarie'){const avant=p.salarie.nom;p.salarie.nom=String(c.valeur||'');p.corrections.push({date:null,champ:'salarie',avant,apres:p.salarie.nom,le});p.anomalies=anomaliesDe(p);return p}
    const x=p.interpretation.find(i=>i.date===c.date);if(!x)throw new Error('Aucune journée prévue le '+c.date+'.');
    let avant;
    if(c.champ==='libelle'){avant=x.libelle;const i=interpreter(c.valeur);Object.assign(x,{libelle:i.libelle,type:i.type,regle:i.regle,applicable:i.applicable,dureeMin:i.dureeMin,horaires:i.horaires,amplitudeMin:i.amplitudeMin,correspondance:i.correspondance})}
    else if(c.champ==='type'){avant=x.type;x.type=String(c.valeur||'NON_INTERPRETE')}
    else if(c.champ==='dureeMin'){avant=x.dureeMin;const v=c.valeur==null||c.valeur===''?null:Math.round(Number(c.valeur));if(v!=null&&!(v>=0&&v<=1440))throw new Error('Durée invalide.');x.dureeMin=v}
    else if(c.champ==='date'){avant=x.date;if(!isIso(c.valeur)||c.valeur<p.periode.debut||c.valeur>p.periode.fin)throw new Error('Date hors période.');
      if(p.interpretation.some(i=>i!==x&&i.date===c.valeur))throw new Error('Une journée existe déjà le '+c.valeur+'.');x.date=c.valeur;p.interpretation.sort((a,b)=>a.date.localeCompare(b.date))}
    x.origine='manuel';x.confiance=1;
    p.corrections.push({date:c.champ==='date'?avant:c.date,champ:c.champ,avant,apres:c.champ==='libelle'?x.libelle:c.champ==='date'?x.date:x[c.champ],le});
    p.anomalies=anomaliesDe(p);
    return p;
  }

  /* ---------- empreinte ---------- */
  async function sha256(bytes){
    const c=(root.crypto&&root.crypto.subtle)?root.crypto:(typeof crypto!=='undefined'?crypto:null);
    if(!c||!c.subtle)throw new Error('Empreinte SHA-256 indisponible sur cet appareil.');
    const buf=bytes instanceof ArrayBuffer?bytes:bytes.buffer?bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength):new TextEncoder().encode(String(bytes)).buffer;
    const h=await c.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  /* ---------- stockage (clé séparée, hors DB ; stockage injectable pour les tests) ---------- */
  function store(storage){
    const ls=storage||root.localStorage;
    const lire=()=>{try{const o=JSON.parse(ls.getItem(KEY)||'null');return o&&typeof o==='object'&&o.plannings&&typeof o.plannings==='object'?o:{version:1,plannings:{}}}catch(e){return {version:1,plannings:{}}}};
    const ecrire=o=>ls.setItem(KEY,JSON.stringify(o));
    return {
      key:KEY,
      liste(){return Object.values(lire().plannings).sort((a,b)=>String(b.periode.debut).localeCompare(String(a.periode.debut)))},
      lire(id){const p=lire().plannings[id];return p?clone(p):null},
      parEmpreinte(sha){return Object.values(lire().plannings).find(p=>p.source.sha256===sha)||null},
      /* Enregistre un planning validé. Doublon (même source) refusé sauf mise à jour du même planning. */
      enregistrer(p,id){
        const o=lire(),d=Object.values(o.plannings).find(x=>x.source.sha256===p.source.sha256&&x.salarie.ligne===p.salarie.ligne&&x.periode.debut===p.periode.debut&&x.id!==(p.id||id));
        if(d)throw new Error('Doublon : ce planning (même source) est déjà enregistré ('+d.id+').');
        const q=clone(p);q.id=p.id||id||('pl-'+p.source.sha256.slice(0,12)+'-'+p.periode.debut);q.statut='enregistre';q.enregistreLe=q.enregistreLe||new Date().toISOString();
        o.plannings[q.id]=q;ecrire(o);return clone(q);
      },
      supprimer(id){const o=lire();if(!o.plannings[id])return false;delete o.plannings[id];ecrire(o);return true},
      /* Journées en commun avec les plannings déjà enregistrés (dates prévues deux fois). Aucun arbitrage automatique. */
      chevauchements(p){
        const out=[];Object.values(lire().plannings).forEach(x=>{if(x.id===p.id)return;
          p.interpretation.forEach(i=>{const y=x.interpretation.find(j=>j.date===i.date);if(y)out.push({date:i.date,autre:x.id,identique:y.type===i.type&&y.dureeMin===i.dureeMin,ici:i.libelle,ailleurs:y.libelle})})});
        return out;
      },
      /* Lecture pour la comparaison future (prévu / réalisé / ROMI1 / bulletin). Lecture seule. */
      prevu(date){
        return Object.values(lire().plannings).filter(p=>p.statut==='enregistre').map(p=>{const i=p.interpretation.find(x=>x.date===date);
          return i?{planning:p.id,type:i.type,libelle:i.libelle,dureeMin:i.dureeMin,horaires:i.horaires,applicable:i.applicable,confiance:i.confiance,origine:i.origine}:null}).filter(Boolean);
      },
      /* Sauvegarde JSON : planning sans les photos (décision du 08/10/2026). */
      exporter(){const o=lire();return Object.keys(o.plannings).length?clone(o):null},
      valider(o){
        if(o==null)return null;
        if(typeof o!=='object'||!o.plannings||typeof o.plannings!=='object')throw new Error('Bloc plannings de la sauvegarde invalide.');
        Object.entries(o.plannings).forEach(([k,p])=>{if(!p||!p.periode||!isIso(p.periode.debut)||!isIso(p.periode.fin)||!p.source||!/^[0-9a-f]{64}$/.test(String(p.source.sha256||''))||!Array.isArray(p.interpretation))
          throw new Error('Planning invalide dans la sauvegarde ('+k+').')});
        return Object.keys(o.plannings).length;
      },
      importer(o){const n=this.valider(o);if(n==null)return null;const c=clone(o);Object.values(c.plannings).forEach(p=>{p.source.original='a_verifier'}) /* photo non incluse : présence sur l’appareil à vérifier (IndexedDB, lot B) */;ecrire({version:1,plannings:c.plannings});return n}
    };
  }

  root.MHPlanning={version:V,KEY,DICT_V1,norm,interpreter,periodeDuTitre,verifierPeriode,datesPeriode,dateEntete,verifierColonnes,
    scoreNom,candidats,extraireLigne,creer,corriger,sha256,store,hm};
})(typeof window!=='undefined'?window:globalThis);
