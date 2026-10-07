/* MesHeures V30 — sauvegarde locale renforcée, JSON versionné et restauration sûre */
(function(){
  const BACKUP_VERSION='37.0.0';
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

  function snapshot(){
    return {
      format:'MesHeures Backup',
      version:BACKUP_VERSION,
      createdAt:new Date().toISOString(),
      reason:'manual',
      data:cloneDB(),
      romiMaster:romiExport()
    };
  }
  function isValidPayload(raw){
    const data=raw?.format==='MesHeures Backup'?raw.data:raw;
    if(!data||typeof data!=='object'||!data.days||typeof data.days!=='object')
      throw new Error('Structure JSON MesHeures non reconnue.');
    return data;
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
      const key=PREFIX+Date.now();
      localStorage.setItem(key,JSON.stringify(s));
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
    }catch(e){alert('❌ Export impossible : '+e.message);return false;}
  };

  window.mhV30Import=function(input){
    const f=input?.files?.[0];if(!f){return false;}
    const r=new FileReader();
    r.onload=e=>{
      try{
        const raw=JSON.parse(e.target.result),data=isValidPayload(raw);
        const keys=Object.keys(data);
        const romi=raw&&raw.format==='MesHeures Backup'?raw.romiMaster:undefined;
        const romiN=romiValidate(romi);
        if(!confirm('Importer cette sauvegarde ? Les données actuelles seront remplacées par celles du fichier'+(romiN!=null?' (dont '+romiN+' relevé(s) ROMI1)':'')+'. Une copie de sécurité sera créée avant import.'))return;
        const safety=window.mhV30Backup('before-import');
        if(!safety.ok)throw new Error('Impossible de créer la sauvegarde de sécurité avant import.');
        DB={s:{...DEF,...(data.s||{})},days:{...(data.days||{})},cmp:{...(data.cmp||{})},periods:Array.isArray(data.periods)?data.periods:[],bul:{...(data.bul||{})},bulletins:Array.isArray(data.bulletins)?data.bulletins:[],romi:{...(data.romi||{})},per:{start:DEF.anchor,nb:1,...(data.per||{})},exp:data.exp??null,constats:Array.isArray(data.constats)?data.constats:[],events:Array.isArray(data.events)?data.events:[],reconciliation:Array.isArray(data.reconciliation)?data.reconciliation:[]};
        if(typeof mhNormalizeMealSettings==='function')mhNormalizeMealSettings();if(typeof mhMigrateLegacyMealChoices==='function')mhMigrateLegacyMealChoices();save();mhRefresh();
        const romiDone=romiImport(romi);
        alert('✅ Import réussi. '+keys.length+' bloc(s) de données restauré(s).\n'+romiLabel(romiDone));
      }catch(err){alert('❌ Import impossible : '+err.message)}
      finally{input.value=''}
    };
    r.onerror=()=>{input.value='';alert('❌ Lecture du fichier impossible.')};
    r.readAsText(f);
  };

  window.mhV30ListBackups=function(){
    return listKeys().map(k=>{
      try{const s=JSON.parse(localStorage.getItem(k));return {key:k,date:s.createdAt,version:s.version||BACKUP_VERSION,reason:s.reason||''};}
      catch(e){return null;}
    }).filter(Boolean);
  };

  window.mhV30Restore=function(key){
    try{
      const s=JSON.parse(localStorage.getItem(key));
      const data=isValidPayload(s);
      const romiN=romiValidate(s&&s.romiMaster);
      if(!confirm('Restaurer ce point de sauvegarde ? Une copie de l’état actuel sera créée avant restauration.'))return false;
      const safety=window.mhV30Backup('before-restore');
      if(!safety.ok)throw new Error('Impossible de créer la sauvegarde de sécurité avant restauration.');
      DB={s:{...DEF,...(data.s||{})},days:{...(data.days||{})},cmp:{...(data.cmp||{})},periods:Array.isArray(data.periods)?data.periods:[],bul:{...(data.bul||{})},bulletins:Array.isArray(data.bulletins)?data.bulletins:[],romi:{...(data.romi||{})},per:{start:DEF.anchor,nb:1,...(data.per||{})},exp:data.exp??null,constats:Array.isArray(data.constats)?data.constats:[],events:Array.isArray(data.events)?data.events:[],reconciliation:Array.isArray(data.reconciliation)?data.reconciliation:[]};
      if(typeof mhNormalizeMealSettings==='function')mhNormalizeMealSettings();if(typeof mhMigrateLegacyMealChoices==='function')mhMigrateLegacyMealChoices();save();const romiDone=romiImport(s&&s.romiMaster);mhRefresh();alert('✅ Restauration terminée.\n'+romiLabel(romiDone));return true;
    }catch(e){alert('❌ Restauration impossible : '+e.message);return false;}
  };

})();
