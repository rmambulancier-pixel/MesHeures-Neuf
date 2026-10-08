/*
 * MesHeures V37.2.0-C — onglet « Prévu » : planning prévisionnel (import, liste, fiche, suppression, analyse à valider).
 * Lot C : « Analyser le planning » lit l'original conservé (MHPlanningLoader), affiche l'analyse de TA ligne, permet de
 * corriger (tracé), confirmer, valider (planning PRÉVISIONNEL) ou rejeter. Aucune écriture dans DB ni dans les journées.
 */
(function(root){
  'use strict';
  const V='37.2.0-C';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const p2=n=>String(n).padStart(2,'0');
  const dFr=k=>/^\d{4}-\d{2}-\d{2}/.test(String(k||''))?k.slice(8,10)+'/'+k.slice(5,7)+'/'+k.slice(0,4):'—';
  const dtFr=iso=>{const d=new Date(iso);return isNaN(d)?'—':p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()+' à '+p2(d.getHours())+'h'+p2(d.getMinutes())};
  const taille=n=>!(n>0)?'—':n<1024?n+' o':n<1048576?(n/1024).toFixed(0)+' Ko':(n/1048576).toFixed(1).replace('.',',')+' Mo';
  const ORIENT={1:'normale',2:'miroir horizontal',3:'retournée (180°)',4:'miroir vertical',5:'miroir + 90°',6:'à pivoter de 90° (sens horaire)',7:'miroir + 270°',8:'à pivoter de 90° (sens antihoraire)'};
  const ETAT={a_analyser:'à analyser',brouillon:'brouillon',enregistre:'enregistré'};
  const FORMAT={jpeg:'JPG',png:'PNG',webp:'WEBP',pdf:'PDF'};
  let vue={fiche:null},message=null,occupe=false,urls=[];
  /* analyse en cours d'affichage : en mémoire seulement (les noms des autres lignes, nécessaires au choix manuel, n'y restent que le temps de l'écran) */
  let courante=null,edition=false,choixOuvert=false,progression='';
  const STATUT_UI={'interprété':['OK','ok'],'lu':['Lu','ok'],'à vérifier':['À vérifier','warn'],'illisible':['Illisible','warn'],'vide':['Vide','dim'],'non_interprété':['Non interprété','warn']};
  const A_REVOIR=['à vérifier','illisible','non_interprété'];

  function css(){
    if($('mh372Css'))return;
    const s=document.createElement('style');s.id='mh372Css';
    s.textContent='.mh372 .mh372-imp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}'+
      '.mh372 .mh372-imp label{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:64px;padding:8px 4px;border:1px solid var(--line);border-radius:12px;background:var(--card);font-size:13px;font-weight:600;text-align:center;cursor:pointer;text-transform:none;letter-spacing:0;color:var(--txt);margin:0}'+
      '.mh372 .mh372-imp label b{font-size:20px;line-height:1}.mh372 .mh372-imp input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}'+
      '.mh372 .mh372-imp[aria-disabled="true"] label{opacity:.5;pointer-events:none}'+
      '.mh372-row{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:8px;overflow-wrap:anywhere}'+
      '.mh372-row h3{margin:0 0 4px;font-size:15px}.mh372-row p{margin:2px 0;font-size:13px;color:var(--dim)}'+
      '.mh372-row .mh372-acts{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}.mh372-row .mh372-acts button{min-height:40px}'+
      '.mh372-kv{display:grid;grid-template-columns:minmax(0,40%) minmax(0,60%);gap:4px 10px;font-size:13px;margin:6px 0}.mh372-kv dt{color:var(--dim)}.mh372-kv dd{margin:0;overflow-wrap:anywhere}'+
      '.mh372-hash{font-family:ui-monospace,monospace;font-size:11.5px;word-break:break-all}'+
      '.mh372-pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--line)}'+
      '.mh372-pill[data-tone="ok"]{border-color:#2e7d32;color:#2e7d32}.mh372-pill[data-tone="warn"]{border-color:#b26a00;color:#b26a00}'+
      '.mh372-prev{display:block;max-width:100%;max-height:340px;margin:8px auto 0;border-radius:8px;border:1px solid var(--line)}'+
      '.mh372-txt{white-space:pre-wrap;max-height:260px;overflow:auto;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:8px}'+
      '.mh372-an table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;margin-top:8px}.mh372-an th,.mh372-an td{padding:5px 3px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}'+
      '.mh372-an th{font-size:10px;color:var(--dim);font-weight:600;text-transform:none;letter-spacing:0;white-space:normal;padding-left:2px;padding-right:2px}.mh372-an col.c-d{width:13%}.mh372-an col.c-l{width:21%}.mh372-an col.c-i{width:24%}.mh372-an col.c-c{width:17%}.mh372-an col.c-s{width:25%}'+
      '.mh372-an td:first-child,.mh372-an td:nth-child(4),.mh372-an td .mh372-pill{white-space:nowrap}'+
      '.mh372-an tr[data-revoir="1"] td{background:rgba(178,106,0,.14)}.mh372-an tr[data-revoir="1"] td:first-child{box-shadow:inset 3px 0 0 #b26a00}'+
      '.mh372-an td .mh372-pill{font-size:11px;padding:0 6px}.mh372-pill[data-tone="dim"]{color:var(--dim)}'+
      '.mh372-an tr.mh372-act td{background:rgba(178,106,0,.07);padding-top:2px}.mh372-an tr.mh372-act button{min-height:36px;padding:4px 10px;font-size:12px;margin:0 6px 2px 0}'+
      '.mh372-an .mh372-head{display:grid;grid-template-columns:minmax(0,38%) minmax(0,62%);gap:4px 10px;font-size:13px;margin:6px 0}.mh372-an .mh372-head dt{color:var(--dim)}.mh372-an .mh372-head dd{margin:0;overflow-wrap:anywhere}'+
      '.mh372-an .mh372-conf{font-size:22px;font-weight:700}.mh372-an .mh372-warn{font-size:12.5px;margin:4px 0 0;padding-left:18px}.mh372-an .mh372-warn li{margin:2px 0}'+
      '.mh372-an .mh372-cand button{display:block;width:100%;text-align:left;margin-top:6px;min-height:40px}.mh372-an .mh372-bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.mh372-an .mh372-bar button{flex:1 1 30%;min-height:44px}'+
      '.mh372-an .mh372-nom{display:flex;gap:6px;margin-top:6px}.mh372-an .mh372-nom input{flex:1;min-width:0}';
    document.head.appendChild(s);
  }
  const P=()=>root.MHPlanning,I=()=>root.MHPlanningImport;
  const st=()=>P().store();

  function dispo(r){const d=r.source.disponibilite;return d==='disponible'?'<span class="mh372-pill" data-tone="ok" data-k="dispo">source disponible</span>':'<span class="mh372-pill" data-tone="warn" data-k="dispo">source à vérifier</span>'}
  const analyseDe=r=>{try{return st().analyseLire(r.id)}catch(e){return null}};
  function periodeDe(r){if(r.periode&&r.periode.debut)return r.periode;const a=analyseDe(r);return a&&a.period?a.period:null}
  function titre(r){const p=periodeDe(r);return p&&p.debut?'Planning du '+dFr(p.debut)+' au '+dFr(p.fin):'Planning : période à déterminer'}
  function etatDe(r){const a=analyseDe(r);if(a&&a.status==='validé')return 'validé (prévisionnel)';if(a&&a.status==='à_valider')return 'analyse à valider';if(a)return 'analyse incomplète';return ETAT[r.statut]||r.statut}
  function salarieDe(r){if(r.salarie&&r.salarie.nom)return r.salarie.nom;const a=analyseDe(r);return a&&a.selectedEmployee?a.selectedEmployee.nom:null}
  function journees(r){const ids=r.planningIds&&r.planningIds.length?r.planningIds:r.planningId?[r.planningId]:[];if(!ids.length)return null;
    return ids.reduce((n,id)=>{const p=st().lire(id);return n+(p&&Array.isArray(p.interpretation)?p.interpretation.length:0)},0)}
  function msgHtml(){if(!message)return '';return '<div class="al '+(message.tone||'i')+'" data-k="msg" role="status" style="white-space:pre-line">'+esc(message.texte)+'</div>'}

  function importHtml(){
    const dis=occupe?' aria-disabled="true"':'';
    return '<div class="mh372-imp" id="mh372Imp"'+dis+'>'+
      '<label>'+'<b>📷</b>Prendre une photo<input type="file" accept="image/*" capture="environment" data-src="photo" aria-label="Prendre une photo"></label>'+
      '<label>'+'<b>🖼️</b>Galerie<input type="file" accept="image/jpeg,image/png,image/webp" data-src="galerie" aria-label="Choisir dans la galerie"></label>'+
      '<label>'+'<b>📁</b>Fichier<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-src="fichier" aria-label="Choisir un fichier"></label>'+
      '</div><p class="mut" style="font-size:12px;margin:8px 0 0">JPG, PNG, WEBP ou PDF · 20 Mo au maximum · l’original est conservé intact sur le téléphone.</p>';
  }
  function listeHtml(){
    const l=st().importsListe();
    if(!l.length)return '<div class="card" data-k="vide"><h2>Plannings enregistrés</h2><p class="mut">Aucun planning enregistré</p>'+
      '<button onclick="MHPrevu.ouvrirImport()">＋ Importer un planning</button></div>';
    return '<div class="card"><h2>Plannings enregistrés <span class="mut" style="font-size:13px;font-weight:500">('+l.length+')</span></h2>'+l.map(r=>{
      const n=journees(r);
      return '<div class="mh372-row" data-id="'+esc(r.id)+'"><h3>'+esc(titre(r))+'</h3>'+
        '<p>'+esc(salarieDe(r)||'Salarié : à déterminer')+'</p>'+
        '<p>Source : '+esc((I().LIBELLE_SOURCE[r.sourceType]||r.sourceType).toLowerCase())+' · '+esc(FORMAT[r.source.format]||'')+' · '+taille(r.source.size)+' '+dispo(r)+'</p>'+
        '<p>État : <b data-k="etat">'+esc(etatDe(r))+'</b>'+(n!=null?' · '+n+' journée'+(n>1?'s':''):'')+(analyseDe(r)?'':' · '+esc(r.ocr.libelle))+'</p>'+
        '<p>Importé le '+dtFr(r.importedAt)+'</p>'+
        '<div class="mh372-acts"><button onclick="MHPrevu.ouvrir(\''+esc(r.id)+'\')">Ouvrir</button><button class="g" onclick="MHPrevu.supprimer(\''+esc(r.id)+'\')">Supprimer</button></div></div>'}).join('')+'</div>';
  }
  function ficheHtml(r){
    const s=r.source,img=s.format!=='pdf',t=r.extraction&&r.extraction.texte;
    const kv=(k,v)=>'<dt>'+k+'</dt><dd>'+v+'</dd>';
    return '<div class="card mh372" data-k="fiche" data-id="'+esc(r.id)+'"><button class="g" onclick="MHPrevu.retour()">‹ Plannings enregistrés</button>'+
      '<h2 style="margin-top:10px">'+esc(titre(r))+'</h2>'+
      '<div class="al i">Planning prévisionnel : il ne prouve pas une heure réellement travaillée et ne modifie jamais tes journées.</div>'+
      '<dl class="mh372-kv">'+
        kv('Période',periodeDe(r)?dFr(periodeDe(r).debut)+' → '+dFr(periodeDe(r).fin):'à déterminer (analyse)')+
        kv('Salarié',salarieDe(r)?esc(salarieDe(r)):'à déterminer (analyse)')+
        kv('Source',esc(I().LIBELLE_SOURCE[r.sourceType]||r.sourceType))+
        kv('Fichier original',esc(s.originalFileName)+'<br><span class="mut">'+esc(FORMAT[s.format])+' · '+taille(s.size)+(s.largeur?' · '+s.largeur+' × '+s.hauteur+' px':'')+(s.pages?' · '+s.pages+' page'+(s.pages>1?'s':''):'')+'</span><br>'+dispo(r))+
        (img?kv('Orientation (EXIF)',s.orientation?esc(ORIENT[s.orientation]||String(s.orientation))+' <span class="mut">(original non modifié)</span>':'non indiquée'):'')+
        kv('SHA-256','<span class="mh372-hash" data-k="sha">'+esc(s.sha256)+'</span>')+
        kv('Statut','<b>'+esc(etatDe(r))+'</b>')+
        kv('Analyse',analyseDe(r)?'analysée le '+dtFr(analyseDe(r).analyzedAt):esc(r.ocr.libelle))+
        kv('Importé le',dtFr(r.importedAt))+
        kv('Données extraites',t?(t.disponible?t.caracteres+' caractères sur '+t.pages+' page'+(t.pages>1?'s':'')+' <button class="g" onclick="MHPrevu.texte(\''+esc(r.id)+'\')">Afficher le texte</button>':'aucun texte sélectionnable'):'aucune (image : analyse à venir)')+
        kv('Corrections',r.corrections&&r.corrections.length?r.corrections.length+' correction(s)':'aucune')+
      '</dl><div id="mh372Txt"></div>'+
      (img?'<div id="mh372Prev" data-k="apercu"></div>':'')+
      analyseCarte(r)+
      '<div class="mh372-row"><div class="mh372-acts" style="margin-top:0"><button class="g" onclick="MHPrevu.supprimer(\''+esc(r.id)+'\')">Supprimer ce planning</button></div></div></div>';
  }

  /* ---------- analyse (lot C) ---------- */
  const L=()=>root.MHPlanningLoader,AN=()=>root.MHPlanningAnalysis,VA=()=>root.MHPlanningValidation;
  const pct=x=>Math.round((Number(x)||0)*100)+' %';
  const dCourt=k=>/^\d{4}-\d{2}-\d{2}$/.test(String(k||''))?k.slice(8,10)+'/'+k.slice(5,7):'—';
  function analyseCarte(r){
    const a=analyseDe(r),dispoOk=r.source.disponibilite==='disponible',mods=!!(L()&&AN()&&VA());
    const nom=st().reglages().nomRef,dis=occupe||!dispoOk||!mods?' disabled':'';
    const raison=!mods?'Module d’analyse indisponible.':!dispoOk?'Original à vérifier sur ce téléphone : analyse impossible tant qu’il n’est pas retrouvé.':'';
    return '<div class="card" style="margin-top:10px" data-k="analyse"><h2>Analyse du planning</h2>'+
      '<p class="mut" style="font-size:12.5px">Lecture du tableau (OCR sur le téléphone), choix de ta ligne uniquement, contrôle des dates et des journées. Rien n’est enregistré sans ta validation, et tes journées réelles ne changent jamais.</p>'+
      '<label for="mh372Nom" style="font-size:12.5px">Ton nom tel qu’il figure sur le planning</label><div class="mh372-nom" style="display:flex;gap:6px;margin-top:4px"><input id="mh372Nom" data-k="nomref" autocomplete="off" maxlength="80" value="'+esc(nom)+'" placeholder="NOM Prénom" style="flex:1;min-width:0"></div>'+
      (raison?'<div class="al w" data-k="analyse-indispo">'+esc(raison)+'</div>':'')+
      (occupe?'<div class="al i" data-k="progression" role="status">⏳ <span id="mh372Prog">'+esc(progression||'Analyse en cours…')+'</span></div>':'')+
      (a?'<p style="margin:8px 0 0;font-size:13px" data-k="analyse-resume">Analyse du '+dtFr(a.analyzedAt)+' : <b>'+esc(a.status==='validé'?'validée':a.status==='à_valider'?'à valider':'incomplète')+'</b> · confiance '+pct(a.confidence)+'</p>':'')+
      '<div class="mh372-acts" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'+
      (a?'<button data-k="voir" onclick="MHPrevu.voirAnalyse()"'+(occupe?' disabled':'')+'>Voir l’analyse</button>'+(a.status!=='validé'?'<button class="g" data-k="lancer" onclick="MHPrevu.analyser()"'+dis+'>Relancer l’analyse</button>':'')
        :'<button data-k="lancer" onclick="MHPrevu.analyser()"'+dis+'>Analyser le planning</button>')+'</div></div>';
  }
  function candidatsHtml(a){
    const C=a._candidats;
    if(!C)return '<div class="al i" data-k="candidats">Pour choisir une autre ligne, relance l’analyse : la liste des lignes n’est jamais enregistrée (données des collègues).'+
      '<br><button class="g" style="margin-top:6px" onclick="MHPrevu.analyser()"'+(occupe?' disabled':'')+'>Relancer l’analyse</button></div>';
    return '<div class="mh372-cand" data-k="candidats"><p class="mut" style="font-size:12.5px;margin:6px 0 0">Choisis TA ligne (les autres lignes ne sont ni lues ni enregistrées) :</p>'+C.map(t=>
      (C.length>1?'<p style="margin:8px 0 0;font-size:12.5px"><b>Tableau '+(t.table+1)+'</b></p>':'')+t.candidats.slice().sort((x,y)=>x.ligne-y.ligne).map(c=>
        '<button class="g" data-ligne="'+c.ligne+'" onclick="MHPrevu.choisirLigne('+t.table+','+c.ligne+')"'+(occupe?' disabled':'')+'>Ligne '+(c.ligne+1)+' · '+esc(c.texte||'(nom illisible)')+(c.score!=null?' <span class="mut">('+Math.round(c.score*100)+' %)</span>':'')+'</button>').join('')).join('')+'</div>';
  }
  function lignesHtml(a){
    const ferme=a.status==='validé';
    return a.cells.map((c,i)=>{
      const revoir=(A_REVOIR.includes(c.status)||!c.date)&&!c.revue,u=STATUT_UI[c.status]||[c.status,'dim'];
      const statut=c.revue&&A_REVOIR.includes(c.status)?'<span class="mh372-pill" data-tone="ok">Confirmé</span>':'<span class="mh372-pill" data-tone="'+u[1]+'">'+esc(u[0])+'</span>';
      const lec=esc(String(c.rawText||'').replace(/\n/g,' '))||'<span class="mut">—</span>';
      const cor=c.texteCorrige!=null?'<br><span class="mut">corrigé : '+esc(c.texteCorrige)+'</span>':'';
      const date=c.date?dCourt(c.date):'<b>?</b>'+(c.dateProposee?'<br><span class="mut">proposée '+dCourt(c.dateProposee)+'</span>':'');
      const interp=c.interpretation&&c.interpretation.type!=='NON_INTERPRETE'?esc(c.interpretation.libelle):'—';
      const motif=revoir&&c.motif?'<br><span class="mut">'+esc(c.motif)+'</span>':'';
      const acts=!ferme&&(revoir||edition)?'<tr class="mh372-act"><td colspan="5"><button class="g" data-k="corriger" onclick="MHPrevu.corrigerCellule('+i+')">Corriger</button>'+
        (revoir?'<button class="g" data-k="confirmer" onclick="MHPrevu.confirmerCellule('+i+')">OK, c’est juste</button>':'')+'</td></tr>':'';
      return '<tr data-i="'+i+'" data-statut="'+esc(c.status)+'" data-revoir="'+(revoir?1:0)+'"><td>'+date+'</td><td>'+lec+cor+'</td><td>'+interp+motif+'</td><td>'+pct(c.confidence)+'</td><td>'+statut+'</td></tr>'+acts}).join('');
  }
  function analyseHtml(r,a){
    const se=a.selectedEmployee,ferme=a.status==='validé',kv=(k,v,dk)=>'<dt>'+k+'</dt><dd'+(dk?' data-k="'+dk+'"':'')+'>'+v+'</dd>';
    const revoir=a.cells.filter(c=>(A_REVOIR.includes(c.status)||!c.date)&&!c.revue).length;
    const ambigu=!se||a.warnings.some(w=>w.code==='LIGNE_AMBIGUE');
    const nomTxt=se?esc(se.nom)+'<br><span class="mut">'+se.parTableau.map(x=>(se.parTableau.length>1?'tableau '+(x.table+1)+' : ':'')+'ligne '+(x.ligne+1)+' lue « '+esc(x.nomLu)+' »'+(x.auto?' (proposée)':' (choisie par toi)')).join(' · ')+'</span>':'<b>non déterminé</b>';
    return '<div class="card mh372 mh372-an" data-k="analyse-ecran" data-id="'+esc(r.id)+'"><button class="g" onclick="MHPrevu.fermerAnalyse()">‹ Fiche du planning</button>'+
      '<span class="mh31-eyebrow" style="display:block;margin-top:10px">ANALYSE DU PLANNING</span>'+
      '<div class="al i">Planning prévisionnel : valider cette analyse enregistre un planning prévu ; aucune journée réelle n’est créée ni modifiée.</div>'+
      (occupe?'<div class="al i" data-k="progression" role="status">⏳ <span id="mh372Prog">'+esc(progression||'Analyse en cours…')+'</span></div>':'')+
      '<dl class="mh372-head">'+kv('Source','<div id="mh372AnSrc" data-k="source"><span class="mut">'+esc(r.source.originalFileName)+'</span></div>')+
        kv('Salarié détecté',nomTxt+(ferme?'':'<br><button class="g" data-k="modifier-salarie" style="margin-top:4px" onclick="MHPrevu.modifierSalarie()">Modifier</button>'),'salarie')+
        kv('Période',a.period?dFr(a.period.debut)+' → '+dFr(a.period.fin):'à déterminer','periode')+
        kv('Confiance','<span class="mh372-conf" data-k="confiance">'+pct(a.confidence)+'</span>')+
        kv('Statut','<b data-k="statut">'+esc(ferme?'validé':a.status==='à_valider'?'à valider':'analyse incomplète')+'</b>'+(revoir?' · <span class="mh372-pill" data-tone="warn" data-k="nb-revoir">'+revoir+' à vérifier</span>':''))+
        kv('Lecture',esc(a.moteur||'—')+(a.corrections&&a.corrections.length?'<br>'+a.corrections.length+' correction(s) tracée(s)':''))+'</dl>'+
      (!ferme&&(choixOuvert||ambigu)?candidatsHtml(a):'')+
      (a.warnings.length?'<details'+(a.warnings.length<=6?' open':'')+' data-k="alertes"><summary style="font-size:13px">Contrôles ('+a.warnings.length+')</summary><ul class="mh372-warn">'+a.warnings.map(w=>'<li data-code="'+esc(w.code)+'">'+esc(w.texte)+'</li>').join('')+'</ul></details>':'<p class="mut" style="font-size:12.5px" data-k="alertes">Aucune alerte de contrôle.</p>')+
      (a.cells.length?'<table data-k="cellules" lang="fr"><colgroup><col class="c-d"><col class="c-l"><col class="c-i"><col class="c-c"><col class="c-s"></colgroup><thead><tr><th>Date</th><th>Lecture</th><th>Interpré&shy;tation</th><th>Confi&shy;ance</th><th>Statut</th></tr></thead><tbody>'+lignesHtml(a)+'</tbody></table>':'')+
      (ferme?'<div class="al k" data-k="valide" style="margin-top:10px">✅ Analyse validée le '+dtFr(a.validatedAt)+' : planning prévisionnel enregistré'+(a.planningIds&&a.planningIds.length>1?' ('+a.planningIds.length+' tableaux)':'')+'.</div>':
        '<div class="mh372-bar"><button data-k="valider" onclick="MHPrevu.validerAnalyse()"'+(occupe||a.status!=='à_valider'?' disabled':'')+'>Valider cette analyse</button>'+
        '<button class="g" data-k="modifier" aria-pressed="'+(edition?'true':'false')+'" onclick="MHPrevu.modifierAnalyse()">'+(edition?'Terminer les modifications':'Modifier')+'</button>'+
        '<button class="g" data-k="rejeter" onclick="MHPrevu.rejeterAnalyse()">Rejeter l’analyse</button></div>')+'</div>';
  }
  async function sourceVignette(r){const el=$('mh372AnSrc');if(!el||r.source.format==='pdf'||r.source.disponibilite!=='disponible')return;
    const u=await I().sources.url(r.source.localRef);if(!u||!$('mh372AnSrc'))return;if(u.startsWith('blob:'))urls.push(u);
    $('mh372AnSrc').innerHTML='<img class="mh372-prev" style="max-height:180px;margin:0" alt="Planning analysé (original)" src="'+esc(u)+'">'}
  let cacheOcr={sha:null,map:null};
  function enregistrer(r,a){try{return st().analyseEnregistrer(r.id,AN().serialiser(a))}catch(e){return null}}
  async function lancerAnalyse(choix){
    const r=vue.fiche&&st().importLire(vue.fiche);if(!r||occupe)return;
    const inp=$('mh372Nom');if(inp)try{st().reglagesMaj({nomRef:inp.value})}catch(e){message={tone:'b',texte:'❌ '+e.message};render();return}
    const nomRef=st().reglages().nomRef;
    if(cacheOcr.sha!==r.source.sha256)cacheOcr={sha:r.source.sha256,map:new Map()};
    occupe=true;progression='Lecture de l’original…';message=null;render();
    let a;try{a=await L().analyser(r,{nomRef,choix:choix||[],cache:cacheOcr.map,progression:t=>{progression=t;const el=$('mh372Prog');if(el)el.textContent=t}})}
    catch(e){a=null;message={tone:'b',texte:'❌ Analyse impossible : '+(e&&e.message||e)+'. Aucune donnée n’a été modifiée.'}}
    occupe=false;progression='';
    if(a){if(a.warnings.some(w=>w.code==='SOURCE_ABSENTE'))try{st().importMaj(r.id,{disponibilite:'a_verifier'})}catch(e){}
      courante=a;edition=false;choixOuvert=false;enregistrer(r,a);vue={fiche:r.id,analyse:true};
      message=a.status==='à_valider'?{tone:'i',texte:'Analyse terminée : vérifie les lignes signalées puis valide.'}:{tone:'w',texte:'⚠️ Analyse incomplète : '+(a.warnings[0]?a.warnings[0].texte:'aucune cellule datée.')}}
    render();try{root.scrollTo(0,0)}catch(e){}
  }
  function analyseCourante(r){if(!courante||courante.sourceSha256!==r.source.sha256){courante=st().analyseLire(r.id);edition=false;choixOuvert=false}return courante}
  function appliquer(fn){const r=vue.fiche&&st().importLire(vue.fiche),a=r&&analyseCourante(r);if(!a)return;
    try{const b=fn(a,r);if(b){courante=b;enregistrer(r,b)}}catch(e){message={tone:'b',texte:'❌ '+(e&&e.message||e)}}render()}
  function demanderDate(c){const v=root.prompt('Date de cette cellule (JJ/MM/AAAA) :',c.dateProposee?dFr(c.dateProposee):'');if(v==null)return null;
    const m=/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(v);if(!m)throw new Error('Date attendue au format JJ/MM/AAAA.');return m[3]+'-'+p2(+m[2])+'-'+p2(+m[1])}
  function corrigerCellule(i){appliquer(a=>{const c=a.cells[i];if(!c)return null;let b=a;message=null;
    if(!c.date){const d=demanderDate(c);if(d==null)return null;b=VA().corriger(b,{index:i,champ:'date',valeur:d,raison:'date saisie par l’utilisateur'})}
    const v=root.prompt('Texte de la cellule du '+dFr(b.cells[i].date)+' (lecture : « '+String(c.rawText||'').replace(/\n/g,' ')+' ») :',c.texteCorrige!=null?c.texteCorrige:String(c.rawText||'').replace(/\n/g,' '));
    if(v==null)return b===a?null:b;
    return VA().corriger(b,{index:i,champ:'texte',valeur:v,raison:'correction manuelle'})})}
  function confirmerCellule(i){appliquer(a=>{const c=a.cells[i];if(!c)return null;message=null;
    if(!c.date&&!c.dateProposee){const d=demanderDate(c);if(d==null)return null;return VA().confirmer(VA().corriger(a,{index:i,champ:'date',valeur:d,raison:'date saisie par l’utilisateur'}),i,'confirmé par l’utilisateur')}
    return VA().confirmer(a,i,'confirmé par l’utilisateur')})}
  function validerAnalyse(){const r=vue.fiche&&st().importLire(vue.fiche),a=r&&analyseCourante(r);if(!a)return;
    const b=VA().bloquants(a);if(b.length){message={tone:'w',texte:'⚠️ Validation impossible pour l’instant :\n'+b.slice(0,8).join('\n')+(b.length>8?'\n… et '+(b.length-8)+' autre(s).':'')};render();return}
    if(!root.confirm('Valider cette analyse ?\n\nUn planning PRÉVISIONNEL sera enregistré pour '+(a.selectedEmployee&&a.selectedEmployee.nom||'toi')+' ('+dFr(a.period.debut)+' → '+dFr(a.period.fin)+').\nTes journées réelles ne sont ni créées ni modifiées.'))return;
    try{const res=VA().valider(a,{record:r});courante=res.analyse;edition=false;choixOuvert=false;message={tone:'k',texte:'✅ Planning prévisionnel enregistré ('+res.plannings.reduce((n,p)=>n+p.interpretation.length,0)+' journées prévues). Tes journées réelles n’ont pas changé.'}}
    catch(e){message={tone:'b',texte:'❌ '+(e&&e.message||e)}}
    render()}
  function rejeterAnalyse(){const r=vue.fiche&&st().importLire(vue.fiche),a=r&&analyseCourante(r);if(!a)return;
    if(!root.confirm('Rejeter cette analyse ?\nL’analyse est supprimée ; le planning importé et son original sont conservés.'))return;
    const raison=root.prompt('Raison du rejet (facultatif) :','');
    try{VA().rejeter(a,{record:r,raison:raison||null});courante=null;edition=false;vue={fiche:r.id};message={tone:'i',texte:'Analyse rejetée. L’original est conservé : tu peux relancer une analyse.'}}
    catch(e){message={tone:'b',texte:'❌ '+(e&&e.message||e)}}
    render()}
  function choisirLigne(table,ligne){const a=courante,prev=a&&a.selectedEmployee?a.selectedEmployee.parTableau.filter(x=>x.table!==table).map(x=>({table:x.table,ligne:x.ligne})):[];
    lancerAnalyse(prev.concat([{table,ligne}]))}

  function render(){
    const sec=$('s-prevu');if(!sec||!P()||!I())return;
    css();urls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});urls=[];
    const r=vue.fiche&&st().importLire(vue.fiche);
    if(vue.fiche&&!r)vue.fiche=null;
    if(r&&vue.analyse){const a=analyseCourante(r);if(a){sec.innerHTML=msgHtml()+analyseHtml(r,a);sourceVignette(r);return}vue={fiche:r.id}}
    if(r){sec.innerHTML=msgHtml()+ficheHtml(r);apercu(r);return}
    sec.innerHTML='<div class="card mh372"><span class="mh31-eyebrow">PLANNING PRÉVISIONNEL</span><h2 style="margin:4px 0 6px">📋 Prévu</h2>'+
      '<div class="al i">Planning prévisionnel : il ne prouve pas une heure réellement travaillée et ne modifie jamais tes journées.</div>'+
      '<button id="mh372Open" onclick="MHPrevu.ouvrirImport()" aria-expanded="'+(vue.import?'true':'false')+'">＋ Importer un planning</button>'+
      (vue.import?importHtml():'')+msgHtml()+'</div>'+listeHtml();
    lier();
  }
  async function apercu(r){
    const el=$('mh372Prev');if(!el||r.source.disponibilite!=='disponible')return;
    const u=await I().sources.url(r.source.localRef);if(!u||!$('mh372Prev'))return;if(u.startsWith('blob:'))urls.push(u);
    $('mh372Prev').innerHTML='<img class="mh372-prev" alt="Aperçu du planning importé (original)" src="'+esc(u)+'">';
  }
  /* Choix terminé sans fichier : raison donnée par l'application Android si elle existe, sinon « annulé ». */
  function annulation(){
    let r='';try{const A=root.MesHeuresAndroid;if(A&&typeof A.planningLastPickStatus==='function')r=String(A.planningLastPickStatus()||'')}catch(e){}
    if(r==='camera_absente')return {tone:'w',texte:'Aucun appareil photo disponible sur ce téléphone : utilise Galerie ou Fichier.'};
    if(r==='permission_refusee')return {tone:'w',texte:'Accès à l’appareil photo refusé : utilise Galerie ou Fichier, ou autorise l’appareil photo dans les réglages Android.'};
    if(r==='erreur')return {tone:'b',texte:'❌ Appareil photo inaccessible. Aucune donnée n’a été modifiée.'};
    return {tone:'i',texte:'Import annulé.'};
  }
  function lier(){
    document.querySelectorAll('#mh372Imp input[type=file]').forEach(inp=>{
      inp.addEventListener('change',()=>choisi(inp));
      inp.addEventListener('cancel',()=>{message=annulation();render()});
    });
  }
  async function choisi(inp){
    const f=inp.files&&inp.files[0],src=inp.getAttribute('data-src');
    if(!f){message=annulation();render();return}
    occupe=true;message={tone:'i',texte:'⏳ Import en cours…'};render();
    let res;try{res=await I().importer(f,{sourceType:src})}catch(e){res={statut:'erreur',message:String(e&&e.message||e)}}
    occupe=false;
    if(res.statut==='ok'){vue={fiche:res.record.id};message={tone:'k',texte:'✅ Planning importé. Original conservé sur le téléphone (SHA-256 '+res.record.source.sha256.slice(0,12)+'…). Analyse à venir.'}}
    else if(res.statut==='doublon'){vue={fiche:res.existant.id};message={tone:'w',texte:'⚠️ '+res.message}}
    else if(res.statut==='annule')message={tone:'i',texte:'Import annulé.'};
    else message={tone:'b',texte:'❌ '+res.message};
    render();
  }
  async function supprimer(id){
    const r=st().importLire(id);if(!r)return;
    if(!root.confirm('Supprimer ce planning ('+titre(r)+') ?\nLe planning prévisionnel est retiré de la liste. Tes journées réelles ne changent pas.')){message={tone:'i',texte:'Suppression annulée.'};render();return}
    const avecSource=root.confirm('Supprimer aussi le fichier original enregistré sur le téléphone ?\n\nOK : supprimer le fichier.\nAnnuler : conserver le fichier.');
    const res=await I().supprimer(id,{avecSource});
    vue={fiche:null};message={tone:'k',texte:'Planning supprimé'+(avecSource?(res.source?' avec son fichier original.':' ; le fichier original n’a pas été retrouvé.'):' ; fichier original conservé sur le téléphone.')};render();
  }
  async function texte(id){
    const r=st().importLire(id),t=r&&r.extraction&&r.extraction.texte;if(!t||!t.ref)return;
    const v=await I().sources.texte(t.ref);const el=$('mh372Txt');if(!el)return;
    el.innerHTML=v==null?'<div class="al w">Texte introuvable sur cet appareil (source à vérifier).</div>':'<div class="mh372-txt" data-k="texte">'+esc(v)+'</div>';
  }
  async function verifier(){try{await I().verifierSources()}catch(e){}if(root.curTab==='prevu')render()}

  root.MHPrevu={version:V,render,verifier,
    ouvrirImport(){vue={fiche:null,import:true};message=null;render();try{const b=$('mh372Imp');if(b&&b.scrollIntoView)b.scrollIntoView({block:'nearest'})}catch(e){}},
    ouvrir(id){vue={fiche:id};message=null;render();try{root.scrollTo(0,0)}catch(e){}},
    retour(){vue={fiche:null};message=null;render()},supprimer,texte,
    analyser(){return lancerAnalyse([])},choisirLigne,corrigerCellule,confirmerCellule,validerAnalyse,rejeterAnalyse,
    voirAnalyse(){if(!vue.fiche)return;vue={fiche:vue.fiche,analyse:true};message=null;render();try{root.scrollTo(0,0)}catch(e){}},
    fermerAnalyse(){vue={fiche:vue.fiche};edition=false;choixOuvert=false;message=null;render()},
    modifierSalarie(){choixOuvert=!choixOuvert;render()},modifierAnalyse(){edition=!edition;render()}};
  /* Disponibilité des sources vérifiée au démarrage et après une restauration. */
  try{document.addEventListener('mh:plannings-restored',verifier);root.addEventListener&&root.addEventListener('load',()=>setTimeout(verifier,800))}catch(e){}
})(window);
