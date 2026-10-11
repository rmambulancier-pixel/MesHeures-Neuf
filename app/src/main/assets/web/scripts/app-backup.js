/* MesHeures V30 — sauvegarde locale renforcée, JSON versionné et restauration sûre */
(function(){
  /* V37.5.0 — Convention de version des sauvegardes (docs/V37.5-SAUVEGARDES.md).
     format        : identifiant du fichier, 'MesHeures Backup'.
     formatVersion : version de la STRUCTURE du fichier (entier) : 1 = DB seule, 2 = + romiMaster (V37.0),
                     3 = + plannings (V37.2). Absent = fichier antérieur à V37.5.0 : structure déduite des blocs présents.
                     Valeur supérieure à BACKUP_FORMAT_VERSION = fichier d'une version plus récente : refusé.
     version       : version de l'application qui a écrit le fichier (meta application-version). Information seulement :
                     jamais utilisée pour accepter ou refuser un fichier (les fichiers historiques portent 36.x, 37.0.0,
                     37.1.1, 37.2.0, 37.3.0 et la valeur figée 37.3.0 des builds V37.4.x). */
  const BACKUP_FORMAT='MesHeures Backup',BACKUP_FORMAT_VERSION=3;
  const FORMAT_V33='MesHeures V33 Export';   /* « ⬇ Sauvegarde » de l'Assistant (app-v33-assistant.js) : { data: DB }, sans ROMI1 ni plannings */
  function appVersion(){try{const m=document.querySelector('meta[name="application-version"]'),v=m&&m.getAttribute('content');if(v)return String(v)}catch(e){}return 'inconnue'}
  const PREFIX=LS+'_v30_backup_';

  function cloneDB(){return JSON.parse(JSON.stringify(DB));}

  /* V37.0-0 — Relevés ROMI1. Ils sont stockés par romi-master.js hors de DB
     (localStorage['mh_romi_master_v35']) : sans ce bloc, aucune sauvegarde ne les contenait. */
  const ROMI_KEY='mh_romi_master_v35';
  function romiExport(){
    try{const raw=localStorage.getItem(ROMI_KEY);if(!raw)return null;const o=JSON.parse(raw);return o&&typeof o==='object'&&!Array.isArray(o)?o:null}
    catch(e){return null}
  }
  // Valide un bloc ROMI1 d'une sauvegarde : null = absent (ancien fichier), sinon nombre de relevés.
  function romiValidate(o){
    if(o==null)return null;
    if(typeof o!=='object'||Array.isArray(o))throw new Error('Bloc ROMI1 de la sauvegarde invalide.');
    Object.entries(o).forEach(([k,rec])=>{
      const d=rec&&rec.data;
      if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(String(d.periodStart||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(d.periodEnd||'')))
        throw new Error('Relevé ROMI1 invalide dans la sauvegarde ('+k+').');
    });
    return Object.keys(o).length;
  }
  // Remplace les relevés ROMI1 par ceux de la sauvegarde. Absent (ancien fichier) : relevés actuels conservés.
  function romiImport(o){
    if(romiValidate(o)==null)return null;
    localStorage.setItem(ROMI_KEY,JSON.stringify(o));
    try{document.dispatchEvent(new CustomEvent('mh:romi1-saved',{detail:{source:'restore'}}))}catch(e){}
    return Object.keys(o).length;
  }
  function romiLabel(n){return n==null?'Relevés ROMI1 : absents du fichier, relevés actuels conservés.':n+' relevé(s) ROMI1 restauré(s).'}
  window.mhRomiStore={key:ROMI_KEY,export:romiExport,validate:romiValidate,import:romiImport,label:romiLabel};

  /* V37.2 — Plannings prévisionnels (clé séparée mh_planning_v372, module MHPlanning). Sauvegardés SANS les photos ni PDF :
     métadonnées, données structurées, SHA-256, référence de la source. À la restauration, la source est « à vérifier »
     puis « disponible » si le fichier est retrouvé sur l'appareil. Absent du fichier (ancienne sauvegarde) : plannings actuels conservés. */
  const planStore=()=>window.MHPlanning&&typeof window.MHPlanning.store==='function'?window.MHPlanning.store():null;
  function planExport(){try{const s=planStore();return s?s.exporter():null}catch(e){return null}}
  function planValidate(o){if(o==null)return null;const s=planStore();if(!s)throw new Error('Module Planning indisponible : plannings de la sauvegarde non restaurables.');return s.valider(o)}
  function planImport(o){if(planValidate(o)==null)return null;const n=planStore().importer(o);
    try{document.dispatchEvent(new CustomEvent('mh:plannings-restored',{detail:{source:'restore'}}))}catch(e){}return n}
  function planLabel(n){return n==null?'Plannings : absents du fichier, plannings actuels conservés.':n+' planning(s) prévisionnel(s) restauré(s) (sources à vérifier sur l’appareil).'}
  window.mhPlanningBackup={export:planExport,validate:planValidate,import:planImport,label:planLabel};

  function snapshot(){
    return {
      format:BACKUP_FORMAT,
      formatVersion:BACKUP_FORMAT_VERSION,
      version:appVersion(),
      createdAt:new Date().toISOString(),
      reason:'manual',
      data:cloneDB(),
      romiMaster:romiExport(),
      plannings:planExport()
    };
  }

  /* V37.5.0 — Validation complète AVANT toute confirmation et toute écriture. Un champ facultatif absent (ou null) garde le
     comportement historique (valeur par défaut) ; un champ présent avec un type faux est refusé au lieu d'être remplacé
     en silence par une valeur vide. Le contenu métier (pauses, horaires, paie) n'est pas réinterprété ici. */
  const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const BLOCS_OBJETS=['s','cmp','bul','romi','per'],BLOCS_TABLEAUX=['periods','bulletins','constats','events','reconciliation'];
  function isValidPayload(raw){
    if(!isObj(raw))throw new Error('Le fichier ne contient pas un objet JSON MesHeures.');
    let data;
    if(raw.format==null)data=raw;                                   /* DB brute (très anciens exports) */
    else if(raw.format===BACKUP_FORMAT||raw.format===FORMAT_V33)data=raw.data;
    else if(raw.format==='MesHeures Encrypted Backup')throw new Error('Sauvegarde chiffrée : utilise « Restaurer une sauvegarde chiffrée ».');
    else throw new Error('Format de fichier non pris en charge ('+String(raw.format).slice(0,60)+').');
    if(raw.formatVersion!=null){
      if(!Number.isInteger(raw.formatVersion)||raw.formatVersion<1)throw new Error('Version de format de sauvegarde invalide.');
      if(raw.formatVersion>BACKUP_FORMAT_VERSION)throw new Error('Sauvegarde écrite par une version plus récente de MesHeures (format '+raw.formatVersion+', format pris en charge : '+BACKUP_FORMAT_VERSION+'). Mets l’application à jour avant de l’importer.');
    }
    if(!isObj(data)||!isObj(data.days))throw new Error('Structure JSON MesHeures non reconnue.');
    Object.keys(data.days).forEach(k=>{if(!isObj(data.days[k]))throw new Error('Journée invalide dans la sauvegarde ('+k+').')});
    BLOCS_OBJETS.forEach(k=>{if(data[k]!=null&&!isObj(data[k]))throw new Error('Bloc « '+k+' » invalide dans la sauvegarde.')});
    BLOCS_TABLEAUX.forEach(k=>{if(data[k]!=null&&!Array.isArray(data[k]))throw new Error('Bloc « '+k+' » invalide dans la sauvegarde.')});
    return data;
  }
  /* Même construction de DB qu'avant V37.5.0 (champs et valeurs par défaut inchangés). */
  function construireDB(data){
    return {s:{...DEF,...(data.s||{})},days:{...(data.days||{})},cmp:{...(data.cmp||{})},periods:Array.isArray(data.periods)?data.periods:[],bul:{...(data.bul||{})},bulletins:Array.isArray(data.bulletins)?data.bulletins:[],romi:{...(data.romi||{})},per:{start:DEF.anchor,nb:1,...(data.per||{})},exp:data.exp??null,constats:Array.isArray(data.constats)?data.constats:[],events:Array.isArray(data.events)?data.events:[],reconciliation:Array.isArray(data.reconciliation)?data.reconciliation:[]};
  }
  /* Prépare une restauration : valide DB, ROMI1 et plannings, construit la nouvelle DB. N'écrit rien. ROMI1 et plannings ne
     sont lus que dans un fichier 'MesHeures Backup' (absents ailleurs : données actuelles conservées, comme avant). */
  function preparer(raw){
    const data=isValidPayload(raw),complet=raw.format===BACKUP_FORMAT;
    const romi=complet?raw.romiMaster:undefined,plans=complet?raw.plannings:undefined;
    const romiN=romiValidate(romi),plansN=planValidate(plans);
    const next=construireDB(data);JSON.stringify(next);
    return {keys:Object.keys(data),romi,plans,romiN,plansN,next};
  }

  /* Application avec retour arrière. localStorage n'a pas de transaction : on garde en mémoire les trois valeurs brutes
     touchées (DB, ROMI1, plannings) et on les réécrit telles quelles si une étape échoue. Limite : ce retour arrière peut
     lui-même échouer (stockage plein) ; la copie de sécurité créée juste avant reste alors le recours, et le message le dit. */
  const planKey=()=>{try{return planStore()?.key||'mh_planning_v372'}catch(e){return 'mh_planning_v372'}};
  function lireCle(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function retablir(prev){
    const echecs=[];DB=prev.db;
    [[LS,prev.ls],[ROMI_KEY,prev.romi],[prev.planKey,prev.plan]].forEach(([k,v])=>{
      try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);if(lireCle(k)!==(v==null?null:v))throw new Error(k)}catch(e){echecs.push(k)}});
    try{window.MH30DataEngine?.invalidate?.('restore-rollback')}catch(e){}
    try{document.dispatchEvent(new CustomEvent('mh:romi1-saved',{detail:{source:'rollback'}}))}catch(e){}
    try{document.dispatchEvent(new CustomEvent('mh:plannings-restored',{detail:{source:'rollback'}}))}catch(e){}
    return echecs;
  }
  function appliquer(p,raison){
    const prev={db:DB,ls:lireCle(LS),romi:lireCle(ROMI_KEY),planKey:planKey()};prev.plan=lireCle(prev.planKey);
    const safety=window.mhV30Backup(raison);
    if(!safety.ok)throw new Error('Impossible de créer la copie de sécurité'+(safety.error?' ('+safety.error+')':'')+'. Aucune donnée modifiée.');
    let romiDone,plansDone;
    try{
      DB=p.next;
      if(typeof mhNormalizeMealSettings==='function')mhNormalizeMealSettings();
      if(typeof mhMigrateLegacyMealChoices==='function')mhMigrateLegacyMealChoices();
      save();
      if(lireCle(LS)!==JSON.stringify(DB))throw new Error('Les données n’ont pas pu être enregistrées (stockage plein ?).');
      romiDone=romiImport(p.romi);plansDone=planImport(p.plans);
    }catch(e){
      const echecs=retablir(prev);
      try{if(typeof mhRefresh==='function')mhRefresh()}catch(_e){}
      throw new Error(e.message+(echecs.length
        ?'\nRetour à l’état précédent incomplet ('+echecs.join(', ')+') : restaure le point de sécurité du '+safety.date+'.'
        :'\nDonnées précédentes rétablies : rien n’a été modifié.'));
    }
    try{if(typeof mhRefresh==='function')mhRefresh()}catch(e){console.warn('MesHeures : affichage après restauration',e)}
    return {romiDone,plansDone,safety};
  }
  function listKeys(){
    return Object.keys(localStorage)
      .filter(k=>k.indexOf(PREFIX)===0)
      .sort()
      .reverse();
  }
  function prune(){
    const keys=Object.keys(localStorage).filter(k=>k.indexOf(PREFIX)===0).sort();
    while(keys.length>5)localStorage.removeItem(keys.shift());
  }
  function stamp(){
    const now=new Date().toISOString();
    localStorage.setItem(LS+'_v30_last',now);
    localStorage.setItem(LS+'_manualAt',now);
    return now;
  }


  // Export robuste : le téléchargement <a download> n'est pas fiable dans le WebView Android.
  // Le pont natif utilise le sélecteur Android « Enregistrer sous » ; le navigateur conserve le fallback Blob.
  window.mhDownloadFile=function(name,text,type){
    try{
      if(window.MesHeuresAndroid && typeof window.MesHeuresAndroid.beginFileExport==='function' && typeof window.MesHeuresAndroid.appendFileExportChunk==='function' && typeof window.MesHeuresAndroid.finishFileExport==='function'){
        if(window.MesHeuresAndroid.beginFileExport(String(name),String(type||'application/octet-stream'))){
          const chunkSize=12000, value=String(text);
          for(let i=0;i<value.length;i+=chunkSize) window.MesHeuresAndroid.appendFileExportChunk(value.slice(i,i+chunkSize));
          window.MesHeuresAndroid.finishFileExport();
          return 'android';
        }
      }
    }catch(e){console.warn('Export natif indisponible, fallback navigateur',e)}
    const blob=new Blob([text],{type:type||'application/octet-stream'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.style.display='none';
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
    return 'browser';
  };

  /* V37.0-D : export binaire (PDF). Pont natif en base64 par blocs de 24 576 octets (multiple de 3 : chaque bloc se décode seul).
     Sans pont (navigateur), repli Blob. Retourne 'android' ou 'browser'. */
  window.mhDownloadBinary=function(name,bytes,type){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
    try{
      const A=window.MesHeuresAndroid;
      if(A && typeof A.beginBinaryFileExport==='function' && typeof A.appendBinaryFileExportChunk==='function' && typeof A.finishBinaryFileExport==='function'){
        if(A.beginBinaryFileExport(String(name),String(type||'application/octet-stream'))){
          const step=24576;
          for(let i=0;i<data.length;i+=step){let s='';const part=data.subarray(i,i+step);for(let j=0;j<part.length;j++)s+=String.fromCharCode(part[j]);A.appendBinaryFileExportChunk(btoa(s))}
          A.finishBinaryFileExport();
          return 'android';
        }
      }
    }catch(e){console.warn('Export binaire natif indisponible, fallback navigateur',e)}
    const blob=new Blob([data],{type:type||'application/octet-stream'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.style.display='none';
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
    return 'browser';
  };

  window.mhV30Backup=function(reason){
    try{
      const s=snapshot();s.reason=reason||'manual';
      const key=PREFIX+Date.now(),txt=JSON.stringify(s);
      localStorage.setItem(key,txt);
      if(localStorage.getItem(key)!==txt)throw new Error('copie de sécurité non relue à l’identique');   /* V37.5.0 */
      const at=stamp();
      prune();
      return {ok:true,key,date:at};
    }catch(e){console.warn('MesHeures backup',e);return {ok:false,error:e.message};}
  };

  window.mhV30BackupStatus=function(){
    const keys=listKeys();
    let last=localStorage.getItem(LS+'_v30_last')||'';
    if(!last&&keys.length){
      try{last=JSON.parse(localStorage.getItem(keys[0]))?.createdAt||''}catch(e){}
    }
    return {count:keys.length,last};
  };

  window.mhV30Export=function(){
    try{
      const s=snapshot();s.reason='export';
      const result=window.mhV30Backup('export');
      if(!result.ok)throw new Error('Impossible de créer le point de sécurité avant export.');
      const mode=window.mhDownloadFile('MesHeures-backup-V30-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(s,null,2),'application/json;charset=utf-8');
      if(mode){
        // DB.exp est le champ que l'UI affiche réellement ("Dernier export").
        // mhV30Export a remplacé l'ancien expo() sans jamais le mettre à jour :
        // l'affichage restait figé à la dernière exécution de l'ancien code.
        try{
          if(typeof DB!=='undefined'){DB.exp=new Date().toLocaleDateString('fr-FR');if(typeof save==='function')save();}
          if(typeof mhRefresh==='function')mhRefresh();
        }catch(_e){}
      }
      return !!mode;
    }catch(e){informer('Export JSON','❌ Export impossible : '+e.message);return false;}
  };

  /* V37.4.1 — fenêtres intégrées (MHDialogue) pour l'import et la restauration. Les données, la copie de sécurité et la
     restauration elles-mêmes sont inchangées. Sans le module : confirm() / alert() d'origine, synchrones (comportement
     d'avant à l'identique). */
  const DLG=()=>window.MHDialogue;
  function informer(titre,message){const d=DLG();if(d)d.info({titre,message});else alert(message)}
  /* confirmation puis suite(ok) : synchrone sans le module (résultat de suite renvoyé), sinon Promise */
  function demanderPuis(o,natif,suite){const d=DLG();if(!d)return suite(confirm(natif));return d.confirmer(o).then(suite)}

  window.mhV30Import=function(input){
    const f=input?.files?.[0];if(!f){return false;}
    const r=new FileReader();
    r.onload=e=>{
      let attente=false;
      try{
        const raw=JSON.parse(e.target.result),p=preparer(raw);
        const detail=(p.romiN!=null?' (dont '+p.romiN+' relevé(s) ROMI1)':'')+(p.plansN!=null?' (et '+p.plansN+' planning(s) prévisionnel(s))':'');
        const suite=ok=>{try{
          if(!ok)return;
          const r=appliquer(p,'before-import');
          informer('Import réussi','✅ Import réussi. '+p.keys.length+' bloc(s) de données restauré(s).\n'+romiLabel(r.romiDone)+'\n'+planLabel(r.plansDone));
        }catch(err){informer('Import impossible','❌ Import impossible : '+err.message)}finally{input.value=''}};
        const res=demanderPuis({titre:'Importer cette sauvegarde ?',message:'Les données actuelles seront remplacées par celles du fichier'+detail+'.\nUne copie de sécurité sera créée avant import.',action:'Remplacer les données',danger:true},
          'Importer cette sauvegarde ? Les données actuelles seront remplacées par celles du fichier'+detail+'. Une copie de sécurité sera créée avant import.',suite);
        attente=!!(res&&typeof res.then==='function');
      }catch(err){informer('Import impossible','❌ Import impossible : '+err.message)}
      finally{if(!attente)input.value=''}
    };
    r.onerror=()=>{input.value='';informer('Import impossible','❌ Lecture du fichier impossible.')};
    r.readAsText(f);
  };

  window.mhV30ListBackups=function(){
    return listKeys().map(k=>{
      try{const s=JSON.parse(localStorage.getItem(k));return {key:k,date:s.createdAt,version:s.version||'',formatVersion:s.formatVersion||null,reason:s.reason||''};}
      catch(e){return null;}
    }).filter(Boolean);
  };

  window.mhV30Restore=function(key){
    try{
      const p=preparer(JSON.parse(localStorage.getItem(key)));
      const suite=ok=>{try{
        if(!ok)return false;
        const r=appliquer(p,'before-restore');
        informer('Restauration terminée','✅ Restauration terminée.\n'+romiLabel(r.romiDone)+'\n'+planLabel(r.plansDone));return true;
      }catch(e){informer('Restauration impossible','❌ Restauration impossible : '+e.message);return false;}};
      return demanderPuis({titre:'Restaurer ce point de sauvegarde ?',message:'Les données actuelles seront remplacées par celles de ce point.\nUne copie de l’état actuel sera créée avant restauration.',action:'Restaurer',danger:true},
        'Restaurer ce point de sauvegarde ? Une copie de l’état actuel sera créée avant restauration.',suite);
    }catch(e){informer('Restauration impossible','❌ Restauration impossible : '+e.message);return false;}
  };

  /* V37.5.0 — Même chemin (validation puis application avec retour arrière) pour la restauration chiffrée (app-evidence.js). */
  window.mhV30RestoreCore={FORMAT:BACKUP_FORMAT,FORMAT_VERSION:BACKUP_FORMAT_VERSION,preparer,appliquer,romiLabel,planLabel};

})();
