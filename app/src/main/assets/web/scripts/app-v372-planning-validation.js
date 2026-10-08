/*
 * MesHeures V37.2.0-C — Planning prévu : corrections, validation et rejet d'une analyse.
 * « Valider » enregistre un PLANNING PRÉVISIONNEL (cœur du lot A) ; aucune journée réelle (DB.days) n'est créée ni modifiée.
 * Chaque correction est tracée (valeur OCR d'origine, avant, après, auteur = utilisateur, horodatage, raison) ; la lecture brute
 * (rawText) n'est jamais écrasée.
 */
(function(root){
  'use strict';
  const V='37.2.0-C';
  const P=()=>root.MHPlanning;
  const clone=o=>JSON.parse(JSON.stringify(o));
  const ISO=/^\d{4}-\d{2}-\d{2}$/;
  const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const fr=k=>ISO.test(String(k||''))?k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4):'—';
  const A_REVOIR=['à vérifier','illisible','non_interprété'];
  const journal=(a,c)=>{a.corrections.push(Object.assign({auteur:'utilisateur',le:new Date().toISOString(),raison:null},c))};

  /* Correction d'une cellule : texte (réinterprété par les règles du lot A), date, type ou durée. */
  function corriger(analyse,c){
    const a=clone(analyse),x=a.cells[c&&c.index];if(!x)throw new Error('Cellule inconnue.');
    if(a.status==='validé')throw new Error('Analyse déjà validée : corrections fermées.');
    const le=c.le||new Date().toISOString(),raison=c.raison==null||c.raison===''?null:String(c.raison);
    if(c.champ==='texte'){const avant=x.interpretation?x.interpretation.libelle:null,I=P().interpreter(c.valeur);
      x.texteCorrige=String(c.valeur);x.interpretation=I.type==='VIDE'?null:{type:I.type,libelle:I.libelle,dureeMin:I.dureeMin,horaires:I.horaires,amplitudeMin:I.amplitudeMin,applicable:I.applicable,regle:I.regle,chemin:'manuel'};
      x.chemin='manuel';x.status=I.type==='NON_INTERPRETE'?'non_interprété':x.date?'interprété':'à vérifier';x.confidence=x.date?1:x.confidence;
      journal(a,{cellule:c.index,champ:'texte',valeurOcr:x.rawText,avant,apres:x.interpretation?x.interpretation.libelle:'',le,raison})}
    else if(c.champ==='date'){if(!ISO.test(String(c.valeur||'')))throw new Error('Date invalide.');
      if(a.cells.some((y,i)=>i!==c.index&&y.table===x.table&&y.date===c.valeur))throw new Error('Le '+fr(c.valeur)+' est déjà attribué à une autre cellule de ce tableau.');
      const avant=x.date;x.date=c.valeur;x.dateProposee=null;if(x.status==='à vérifier'&&x.motif==='date de la colonne non sûre'){x.status=x.interpretation?'interprété':x.status;x.motif=null}
      journal(a,{cellule:c.index,champ:'date',valeurOcr:x.rawText,avant,apres:c.valeur,le,raison})}
    else if(c.champ==='type'){if(!x.interpretation)throw new Error('Corrige d’abord le texte de la cellule.');const avant=x.interpretation.type;x.interpretation.type=String(c.valeur);x.interpretation.chemin='manuel';x.chemin='manuel';
      journal(a,{cellule:c.index,champ:'type',valeurOcr:x.rawText,avant,apres:x.interpretation.type,le,raison})}
    else if(c.champ==='dureeMin'){if(!x.interpretation)throw new Error('Corrige d’abord le texte de la cellule.');const v=c.valeur==null||c.valeur===''?null:Math.round(Number(c.valeur));
      if(v!=null&&!(v>=0&&v<=1440))throw new Error('Durée invalide.');const avant=x.interpretation.dureeMin;x.interpretation.dureeMin=v;x.chemin='manuel';
      journal(a,{cellule:c.index,champ:'dureeMin',valeurOcr:x.rawText,avant,apres:v,le,raison})}
    else throw new Error('Champ de correction inconnu.');
    x.revue=true;return a;
  }
  /* « OK, je confirme » sur une cellule à vérifier, sans changer sa lecture (tracé). */
  function confirmer(analyse,index,raison){const a=clone(analyse),x=a.cells[index];if(!x)throw new Error('Cellule inconnue.');
    if(!x.date&&x.dateProposee){x.date=x.dateProposee;x.dateProposee=null}
    x.revue=true;journal(a,{cellule:index,champ:'confirmation',valeurOcr:x.rawText,avant:x.status,apres:x.status,raison:raison==null?null:String(raison)});return a}

  /* Ce qui empêche la validation (affiché tel quel à l'utilisateur). */
  function bloquants(a){
    const out=[];if(!a||a.status==='analyse_incomplète')out.push('Analyse incomplète : '+((a&&a.warnings||[]).filter(w=>['TABLEAU_ABSENT','LIGNE_AMBIGUE','SOURCE_INVALIDE','OCR_INDISPONIBLE'].includes(w.code)).map(w=>w.texte).join(' ')||'aucune cellule datée.'));
    if(!a||!a.cells)return out;
    a.cells.forEach((c,i)=>{if(!c.date)out.push('Cellule '+(i+1)+' : date à confirmer'+(c.dateProposee?' (proposée '+fr(c.dateProposee)+')':'')+'.');
      else if(A_REVOIR.includes(c.status)&&!c.revue)out.push('Le '+fr(c.date)+' : '+c.status+(c.motif?' ('+c.motif+')':'')+' : corrige ou confirme.')});
    /* dates continues dans chaque tableau */
    const tables=[...new Set(a.cells.map(c=>c.table))];
    tables.forEach(t=>{const d=a.cells.filter(c=>c.table===t&&c.date).map(c=>c.date).sort();for(let i=1;i<d.length;i++)if(addJ(d[i-1],1)!==d[i])out.push('Tableau '+(t+1)+' : dates non continues entre le '+fr(d[i-1])+' et le '+fr(d[i])+'.')});
    return out;
  }
  /* Validation : un planning prévisionnel par tableau (lot A), lié à l'import. Retourne {analyse, plannings}. */
  function valider(analyse,opts){
    opts=opts||{};const st=opts.store||P().store(),rec=opts.record;
    if(!rec||!rec.id)throw new Error('Import introuvable.');
    if(analyse.sourceSha256!==rec.source.sha256)throw new Error('L’analyse ne correspond pas à cette source (SHA-256 différent).');
    const b=bloquants(analyse);if(b.length){const e=new Error('Validation impossible :\n'+b.join('\n'));e.bloquants=b;throw e}
    const a=clone(analyse),plannings=[];
    const tables=[...new Set(a.cells.map(c=>c.table))].sort();
    tables.forEach(t=>{
      const cells=a.cells.filter(c=>c.table===t).sort((x,y)=>x.date.localeCompare(y.date)),ch=a.selectedEmployee.parTableau.find(x=>x.table===t);
      const ligne={ligne:ch.ligne,nomLu:ch.nomLu,nomConf:ch.confOcr,cellules:cells.map(c=>({colonne:c.colonne,texte:c.texteCorrige!=null?c.texteCorrige:c.rawText,conf:c.chemin==='manuel'?100:c.confOcr,bbox:c.boundsOriginal,couleur:c.color&&c.color.hex}))};
      let p=P().creer({importeLe:rec.importedAt,source:{nom:rec.source.originalFileName,mime:rec.source.mimeType,taille:rec.source.size,sha256:rec.source.sha256},
        periode:{debut:cells[0].date,fin:cells[cells.length-1].date,origine:'ocr'},salarie:{nom:a.selectedEmployee.nom,ligne:ch.ligne,confirme:true},ligne,
        ocr:{moteur:a.moteur||'tesseract.js',statut:cells.some(c=>c.status==='illisible')?'partiel':'complet',titre:(a.tableCandidates.find(x=>x.index===t)||{}).titreLu||null}});
      /* corrections de type et de durée reportées dans le journal du planning (lot A) */
      cells.forEach(c=>{const i=p.interpretation.find(x=>x.date===c.date);if(!i||!c.interpretation)return;
        if(c.interpretation.type!==i.type)p=P().corriger(p,{date:c.date,champ:'type',valeur:c.interpretation.type});
        if(c.interpretation.dureeMin!==i.dureeMin)p=P().corriger(p,{date:c.date,champ:'dureeMin',valeur:c.interpretation.dureeMin})});
      plannings.push(st.enregistrer(Object.assign(p,{id:'pl-'+rec.source.sha256.slice(0,12)+'-'+cells[0].date})));
    });
    a.status='validé';a.validatedAt=new Date().toISOString();a.selectedEmployee.confirme=true;a.planningIds=plannings.map(p=>p.id);
    st.importMaj(rec.id,{planningId:plannings[0]&&plannings[0].id,planningIds:a.planningIds,historique:{le:a.validatedAt,action:'analyse validée',plannings:a.planningIds.length}});
    st.analyseEnregistrer(rec.id,a);
    return {analyse:a,plannings};
  }
  /* Rejet : l'analyse est retirée ; l'import et sa source restent ; la décision est tracée. */
  function rejeter(analyse,opts){opts=opts||{};const st=opts.store||P().store(),rec=opts.record;if(!rec)throw new Error('Import introuvable.');
    st.analyseSupprimer(rec.id);st.importMaj(rec.id,{historique:{le:new Date().toISOString(),action:'analyse rejetée',raison:opts.raison==null?null:String(opts.raison)}});return true}

  root.MHPlanningValidation={version:V,corriger,confirmer,bloquants,valider,rejeter};
})(typeof window!=='undefined'?window:globalThis);
