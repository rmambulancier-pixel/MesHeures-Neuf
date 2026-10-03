/* MesHeures V30 — sauvegarde locale renforcée, JSON versionné et restauration sûre */
(function(){
  const BACKUP_VERSION='36.0.0';
  const PREFIX=LS+'_v30_backup_';

  function cloneDB(){return JSON.parse(JSON.stringify(DB));}
  function snapshot(){
    return {
      format:'MesHeures Backup',
      version:BACKUP_VERSION,
      createdAt:new Date().toISOString(),
      reason:'manual',
      data:cloneDB()
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
        if(!confirm('Importer cette sauvegarde ? Les données actuelles seront remplacées par celles du fichier. Une copie de sécurité sera créée avant import.'))return;
        const safety=window.mhV30Backup('before-import');
        if(!safety.ok)throw new Error('Impossible de créer la sauvegarde de sécurité avant import.');
        DB={s:{...DEF,...(data.s||{})},days:{...(data.days||{})},cmp:{...(data.cmp||{})},periods:Array.isArray(data.periods)?data.periods:[],bul:{...(data.bul||{})},bulletins:Array.isArray(data.bulletins)?data.bulletins:[],romi:{...(data.romi||{})},per:{start:DEF.anchor,nb:1,...(data.per||{})},exp:data.exp??null,constats:Array.isArray(data.constats)?data.constats:[],events:Array.isArray(data.events)?data.events:[],reconciliation:Array.isArray(data.reconciliation)?data.reconciliation:[]};
        save();mhRefresh();
        alert('✅ Import réussi. '+keys.length+' bloc(s) de données restauré(s).');
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
      if(!confirm('Restaurer ce point de sauvegarde ? Une copie de l’état actuel sera créée avant restauration.'))return false;
      const safety=window.mhV30Backup('before-restore');
      if(!safety.ok)throw new Error('Impossible de créer la sauvegarde de sécurité avant restauration.');
      DB={s:{...DEF,...(data.s||{})},days:{...(data.days||{})},cmp:{...(data.cmp||{})},periods:Array.isArray(data.periods)?data.periods:[],bul:{...(data.bul||{})},bulletins:Array.isArray(data.bulletins)?data.bulletins:[],romi:{...(data.romi||{})},per:{start:DEF.anchor,nb:1,...(data.per||{})},exp:data.exp??null,constats:Array.isArray(data.constats)?data.constats:[],events:Array.isArray(data.events)?data.events:[],reconciliation:Array.isArray(data.reconciliation)?data.reconciliation:[]};
      save();mhRefresh();alert('✅ Restauration terminée.');return true;
    }catch(e){alert('❌ Restauration impossible : '+e.message);return false;}
  };

})();
