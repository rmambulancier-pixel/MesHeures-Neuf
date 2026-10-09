/*
 * MesHeures V37.2.0-C — Planning prévu : corrections, validation et rejet d'une analyse.
 * « Valider » enregistre un PLANNING PRÉVISIONNEL (cœur du lot A) ; aucune journée réelle (DB.days) n'est créée ni modifiée.
 * 1 tableau distinct = 1 unité = 1 fiche de planning : chaque unité se sélectionne, se corrige et se valide seule ; deux tableaux
 * du même fichier ne sont jamais fusionnés (C3).
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
  const AN=()=>root.MHPlanningAnalysis;
  const recalc=a=>AN()&&AN().recalculer?AN().recalculer(a):a;
  const unite=(a,t)=>(a.unites||[]).find(u=>u.tableId===t);
  const nomU=(a,u)=>'Planning '+(u.tableId+1)+(u.page!=null?' (page '+u.page+')':'');
  const fermee=(a,x)=>{const u=unite(a,x.table);if(u&&u.status==='validé')throw new Error(nomU(a,u)+' déjà validé : corrections fermées pour ce planning.')};

  /* Correction d'une cellule : texte (réinterprété par les règles du lot A), date, type ou durée. */
  function corriger(analyse,c){
    const a=clone(analyse),x=a.cells[c&&c.index];if(!x)throw new Error('Cellule inconnue.');
    fermee(a,x);
    const le=c.le||new Date().toISOString(),raison=c.raison==null||c.raison===''?null:String(c.raison);
    if(c.champ==='texte'){const avant=x.interpretation?x.interpretation.libelle:null,I=P().interpreter(c.valeur);
      x.texteCorrige=String(c.valeur);x.interpretation=I.type==='VIDE'?null:{type:I.type,libelle:I.libelle,dureeMin:I.dureeMin,horaires:I.horaires,amplitudeMin:I.amplitudeMin,applicable:I.applicable,regle:I.regle,chemin:'manuel'};
      x.chemin='manuel';x.status=I.type==='NON_INTERPRETE'?'non_interprété':x.date?'interprété':'à vérifier';x.confidence=x.date?1:x.confidence;
      journal(a,{cellule:c.index,celluleId:x.id,champ:'texte',valeurOcr:x.rawText,avant,apres:x.interpretation?x.interpretation.libelle:'',le,raison})}
    else if(c.champ==='date'){if(!ISO.test(String(c.valeur||'')))throw new Error('Date invalide.');
      if(a.cells.some((y,i)=>i!==c.index&&y.table===x.table&&y.date===c.valeur))throw new Error('Le '+fr(c.valeur)+' est déjà attribué à une autre cellule de ce tableau.');
      const avant=x.date;x.date=c.valeur;x.dateProposee=null;if(x.status==='à vérifier'&&x.motif==='date de la colonne non sûre'){x.status=x.interpretation?'interprété':x.status;x.motif=null}
      journal(a,{cellule:c.index,celluleId:x.id,champ:'date',valeurOcr:x.rawText,avant,apres:c.valeur,le,raison})}
    else if(c.champ==='type'){if(!x.interpretation)throw new Error('Corrige d’abord le texte de la cellule.');const avant=x.interpretation.type;x.interpretation.type=String(c.valeur);x.interpretation.chemin='manuel';x.chemin='manuel';
      journal(a,{cellule:c.index,celluleId:x.id,champ:'type',valeurOcr:x.rawText,avant,apres:x.interpretation.type,le,raison})}
    else if(c.champ==='dureeMin'){if(!x.interpretation)throw new Error('Corrige d’abord le texte de la cellule.');const v=c.valeur==null||c.valeur===''?null:Math.round(Number(c.valeur));
      if(v!=null&&!(v>=0&&v<=1440))throw new Error('Durée invalide.');const avant=x.interpretation.dureeMin;x.interpretation.dureeMin=v;x.chemin='manuel';
      journal(a,{cellule:c.index,celluleId:x.id,champ:'dureeMin',valeurOcr:x.rawText,avant,apres:v,le,raison})}
    else throw new Error('Champ de correction inconnu.');
    x.revue=true;return recalc(a);
  }
  /* « OK, je confirme » sur une cellule à vérifier, sans changer sa lecture (tracé). */
  function confirmer(analyse,index,raison){const a=clone(analyse),x=a.cells[index];if(!x)throw new Error('Cellule inconnue.');fermee(a,x);
    if(!x.date&&x.dateProposee){x.date=x.dateProposee;x.dateProposee=null}
    x.revue=true;journal(a,{cellule:index,celluleId:x.id,champ:'confirmation',valeurOcr:x.rawText,avant:x.status,apres:x.status,raison:raison==null?null:String(raison)});return recalc(a)}
  /* Sélection d'un planning pour la validation groupée (les autres restent à valider plus tard ou ignorés). */
  function selectionner(analyse,tableId,oui){const a=recalc(clone(analyse)),u=unite(a,tableId);if(!u)throw new Error('Planning inconnu.');u.selected=!!oui;return a}
  /* Unités visées : celles demandées, sinon les unités sélectionnées non encore validées. */
  const visees=(a,tables)=>(a.unites||[]).filter(u=>Array.isArray(tables)?tables.includes(u.tableId):u.selected&&u.status!=='validé');

  /* Ce qui empêche la validation des unités visées (affiché tel quel à l'utilisateur). */
  function bloquants(analyse,tables){
    const a=analyse&&analyse.cells?recalc(clone(analyse)):analyse,out=[];
    if(!a||!a.cells){out.push('Analyse incomplète : '+((a&&a.warnings||[]).filter(w=>['TABLEAU_ABSENT','SOURCE_INVALIDE','OCR_INDISPONIBLE'].includes(w.code)).map(w=>w.texte).join(' ')||'aucune cellule datée.'));return out}
    const us=visees(a,tables);
    if(!us.length){out.push((a.unites||[]).length?'Aucun planning sélectionné à valider.':'Analyse incomplète : '+(a.warnings.filter(w=>['TABLEAU_ABSENT','SOURCE_INVALIDE','OCR_INDISPONIBLE'].includes(w.code)).map(w=>w.texte).join(' ')||'aucun tableau.'));return out}
    us.forEach(u=>{const n=nomU(a,u)+' : ';
      if(u.status==='validé'){out.push(n+'déjà validé.');return}
      if(!u.selectedEmployee){out.push(n+'ta ligne n’est pas choisie.');return}
      const cells=u.cellules.map(i=>a.cells[i]);if(!cells.some(c=>c.date)){out.push(n+'aucune cellule datée.');return}
      cells.forEach(c=>{if(!c.date)out.push(n+'cellule '+(c.colonne+1)+' : date à confirmer'+(c.dateProposee?' (proposée '+fr(c.dateProposee)+')':'')+'.');
        else if(A_REVOIR.includes(c.status)&&!c.revue)out.push(n+'le '+fr(c.date)+' : '+c.status+(c.motif?' ('+c.motif+')':'')+' : corrige ou confirme.')});
      const d=cells.filter(c=>c.date).map(c=>c.date).sort();for(let i=1;i<d.length;i++)if(addJ(d[i-1],1)!==d[i])out.push(n+'dates non continues entre le '+fr(d[i-1])+' et le '+fr(d[i])+'.')});
    return out;
  }
  /* Validation : une fiche de planning prévisionnel INDÉPENDANTE par unité visée (opts.tables, sinon unités sélectionnées),
     liée à sa page et à son tableau d'origine. Retourne {analyse, plannings}. */
  function valider(analyse,opts){
    opts=opts||{};const st=opts.store||P().store(),rec=opts.record;
    if(!rec||!rec.id)throw new Error('Import introuvable.');
    if(analyse.sourceSha256!==rec.source.sha256)throw new Error('L’analyse ne correspond pas à cette source (SHA-256 différent).');
    const b=bloquants(analyse,opts.tables);if(b.length){const e=new Error('Validation impossible :\n'+b.join('\n'));e.bloquants=b;throw e}
    const a=recalc(clone(analyse)),plannings=[],le=new Date().toISOString();
    visees(a,opts.tables).forEach(u=>{const t=u.tableId;
      const cells=u.cellules.map(i=>a.cells[i]).sort((x,y)=>x.date.localeCompare(y.date)),ch=a.selectedEmployee.parTableau.find(x=>x.table===t),tc=a.tableCandidates.find(x=>x.index===t)||{};
      const ligne={ligne:ch.ligne,nomLu:ch.nomLu,nomConf:ch.confOcr,cellules:cells.map(c=>({colonne:c.colonne,texte:c.texteCorrige!=null?c.texteCorrige:c.rawText,conf:c.chemin==='manuel'?100:c.confOcr,bbox:c.boundsOriginal,couleur:c.color&&c.color.hex}))};
      let p=P().creer({importeLe:rec.importedAt,source:{nom:rec.source.originalFileName,mime:rec.source.mimeType,taille:rec.source.size,sha256:rec.source.sha256},
        periode:{debut:cells[0].date,fin:cells[cells.length-1].date,origine:'ocr'},salarie:{nom:a.selectedEmployee.nom,ligne:ch.ligne,confirme:true},ligne,
        ocr:{moteur:a.moteur||'tesseract.js',statut:cells.some(c=>c.status==='illisible')?'partiel':'complet',titre:tc.titreLu||null},
        origine:{importId:rec.id,sourceSha256:rec.source.sha256,page:u.page,tableId:t,orientation:u.orientation,periodeTitre:u.periodeTitre,confiance:u.confidence}});
      /* corrections de type et de durée reportées dans le journal du planning (lot A) */
      cells.forEach(c=>{const i=p.interpretation.find(x=>x.date===c.date);if(!i||!c.interpretation)return;
        if(c.interpretation.type!==i.type)p=P().corriger(p,{date:c.date,champ:'type',valeur:c.interpretation.type});
        if(c.interpretation.dureeMin!==i.dureeMin)p=P().corriger(p,{date:c.date,champ:'dureeMin',valeur:c.interpretation.dureeMin})});
      const q=st.enregistrer(Object.assign(p,{id:'pl-'+rec.source.sha256.slice(0,12)+'-t'+t+'-'+cells[0].date}));plannings.push(q);
      u.planningId=q.id;u.validatedAt=le;u.status='validé';
    });
    a.selectedEmployee.confirme=true;recalc(a);if(a.status==='validé')a.validatedAt=le;
    a.planningIds=a.unites.map(u=>u.planningId).filter(Boolean);
    const r0=st.importLire(rec.id)||rec,ids=[...new Set((r0.planningIds||[]).concat(plannings.map(p=>p.id)))];
    st.importMaj(rec.id,{planningId:ids[0]||null,planningIds:ids,historique:{le,action:'planning(s) validé(s)',plannings:plannings.map(p=>p.id)}});
    st.analyseEnregistrer(rec.id,a);
    return {analyse:a,plannings};
  }
  /* Nouvelle lecture après le choix d'une ligne dans UN tableau : les autres tableaux gardent leurs cellules, corrections et
     validation (jamais perdues, jamais mélangées). */
  function fusionner(ancienne,nouvelle,tableChoisi){
    const O=recalc(clone(ancienne)),R=clone(nouvelle);
    const garder=(O.unites||[]).filter(u=>u.tableId!==tableChoisi&&(u.planningId||u.selectedEmployee)&&R.tableCandidates.some(t=>t.index===u.tableId&&t.page===u.page)).map(u=>u.tableId);
    if(!garder.length)return recalc(R);
    const ancId=new Map(O.cells.map((c,i)=>[i,c.id]));
    R.cells=R.cells.filter(c=>!garder.includes(c.table)).concat(O.cells.filter(c=>garder.includes(c.table))).sort((x,y)=>x.table-y.table||x.colonne-y.colonne);
    const idx=new Map(R.cells.map((c,i)=>[c.id,i]));
    const tableDe=w=>w.table!=null?w.table:w.celluleId?Number(String(w.celluleId).slice(1).split('-')[0]):null;
    R.warnings=R.warnings.filter(w=>!garder.includes(tableDe(w))).concat(O.warnings.filter(w=>garder.includes(tableDe(w))&&w.code!=='LIGNE_AMBIGUE'));
    R.warnings.forEach(w=>{if(w.celluleId&&idx.has(w.celluleId))w.cellule=idx.get(w.celluleId)});
    R.corrections=(O.corrections||[]).filter(c=>{const id=c.celluleId||ancId.get(c.cellule);return id&&garder.includes(Number(String(id).slice(1).split('-')[0]))}).map(c=>Object.assign(c,{cellule:idx.get(c.celluleId||ancId.get(c.cellule))})).concat(R.corrections||[]);
    const se=O.selectedEmployee?O.selectedEmployee.parTableau.filter(x=>garder.includes(x.table)):[];
    const nv=(R.selectedEmployee?R.selectedEmployee.parTableau:[]).filter(x=>!garder.includes(x.table));
    R.selectedEmployee=se.length||nv.length?{nom:(R.selectedEmployee||O.selectedEmployee).nom,parTableau:se.concat(nv).sort((x,y)=>x.table-y.table),confirme:false}:null;
    R.unites=(O.unites||[]).filter(u=>garder.includes(u.tableId));
    return recalc(R);
  }
  /* Rejet : l'analyse est retirée ; l'import et sa source restent ; la décision est tracée. */
  function rejeter(analyse,opts){opts=opts||{};const st=opts.store||P().store(),rec=opts.record;if(!rec)throw new Error('Import introuvable.');
    st.analyseSupprimer(rec.id);st.importMaj(rec.id,{historique:{le:new Date().toISOString(),action:'analyse rejetée',raison:opts.raison==null?null:String(opts.raison)}});return true}

  root.MHPlanningValidation={version:V,corriger,confirmer,selectionner,bloquants,valider,fusionner,rejeter};
})(typeof window!=='undefined'?window:globalThis);
