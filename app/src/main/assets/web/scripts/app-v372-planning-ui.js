/*
 * MesHeures V37.2.0-D — onglet « Prévu » : 📅 Planning (calendrier du prévisionnel validé) | 🔎 OCR / Validation (import,
 * analyse, corrections, validation, fiches). Le calendrier ne lit que les fiches validées (MHPrevuCalendrier).
 * Lot C : « Analyser le planning » lit l'original conservé (MHPlanningLoader), affiche l'analyse de TA ligne, permet de
 * corriger (tracé), confirmer, valider (planning PRÉVISIONNEL) ou rejeter. Aucune écriture dans DB ni dans les journées.
 */
(function(root){
  'use strict';
  const V='37.2.0-D';
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
  /* sous-onglet de Prévu ('planning' | 'ocr') ; null = choix par défaut (Planning dès qu'une fiche validée existe) */
  let onglet=null,calMois=null,calJour=null;
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
      '.mh372-an .mh372-nom{display:flex;gap:6px;margin-top:6px}.mh372-an .mh372-nom input{flex:1;min-width:0}'+
      '.mh372-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 10px}.mh372-tabs button{min-height:44px;font-size:14px;font-weight:600;border-radius:12px}'+
      '.mh372-tabs button[aria-selected="false"]{background:var(--card);color:var(--txt);border:1px solid var(--line)}'+
      '.mh372-prevu-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:999px;border:1.5px solid #5b8def;color:#5b8def}'+
      '.mh372-cal .mh372-nav{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:6px;margin:8px 0 4px}.mh372-cal .mh372-nav h2{margin:0;text-align:center;font-size:18px}'+
      '.mh372-cal .mh372-nav button{min-height:44px;padding:0;font-size:20px}'+
      '.mh372-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;margin-top:6px}'+
      '.mh372-grid .mh372-dow{font-size:11px;color:var(--dim);text-align:center;font-weight:600;padding:2px 0}'+
      '.mh372-grid .mh372-j{min-height:58px;padding:3px 2px 3px 4px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--txt);text-align:left;display:flex;flex-direction:column;gap:1px;position:relative;overflow:hidden;font-weight:400;margin:0;min-width:0}'+
      '.mh372-grid .mh372-j[data-hors="1"]{opacity:.38}.mh372-grid .mh372-j[data-etat="aucun"] .mh372-l{color:var(--dim)}'+
      '.mh372-grid .mh372-j .mh372-n{font-size:12px;font-weight:700;line-height:1.1}.mh372-grid .mh372-j .mh372-l{font-size:10.5px;line-height:1.15;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}'+
      '.mh372-grid .mh372-j .mh372-c{position:absolute;left:0;top:0;bottom:0;width:3px}'+
      '.mh372-grid .mh372-j[data-etat="conflit"]{border:2px solid #b26a00}.mh372-grid .mh372-j[data-aujourdhui="1"]{box-shadow:inset 0 0 0 2px #5b8def}'+
      '.mh372-grid .mh372-j[aria-pressed="true"]{outline:2px solid var(--txt);outline-offset:1px}'+
      '.mh372-grid .mh372-j .mh372-x{font-size:10px;color:var(--dim)}'+
      '.mh372-jour{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:10px}.mh372-jour h3{margin:0 0 4px;font-size:16px}'+
      '.mh372-jour .mh372-val{border-top:1px solid var(--line);padding-top:8px;margin-top:8px;font-size:13px}.mh372-jour .mh372-val .mh372-prev{font-size:16px}'+
      '.mh372-src{font-size:12.5px;margin-top:8px}.mh372-src li{margin:2px 0}';
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
  /* Liste : une ligne par FICHE de planning (un fichier peut en donner plusieurs, C3), puis les imports encore à analyser,
     à compléter ou à valider. */
  function unitesDe(a){return a&&Array.isArray(a.unites)?a.unites:[]}
  function aTraiter(r){const a=analyseDe(r),us=unitesDe(a);const fiches=st().fichesDeSource(r.source.sha256);
    if(!a)return !fiches.length;return us.some(u=>u.status!=='validé')||!us.length}
  function ficheLigneHtml(p){const o=p.origine||{},n=p.interpretation.length,r=o.importId&&st().importLire(o.importId);
    return '<div class="mh372-row" data-planning="'+esc(p.id)+'"><h3>Planning du '+dFr(p.periode.debut)+' au '+dFr(p.periode.fin)+'</h3>'+
      '<p>'+esc(p.salarie&&p.salarie.nom||'Salarié : à déterminer')+'</p>'+
      '<p>Source : '+esc(p.source.nom||'fichier')+(o.page!=null?' · page '+o.page:'')+(o.tableId!=null?' · tableau '+(o.tableId+1):'')+(r?' '+dispo(r):'')+'</p>'+
      '<p>État : <b data-k="etat">validé (prévisionnel)</b> · '+n+' journée'+(n>1?'s':'')+'</p>'+
      '<div class="mh372-acts"><button onclick="MHPrevu.ouvrirFiche(\''+esc(p.id)+'\')">Ouvrir</button><button class="g" data-k="supprimer-fiche" onclick="MHPrevu.supprimerFiche(\''+esc(p.id)+'\')">Supprimer</button></div></div>'}
  function listeHtml(){
    const l=st().importsListe().filter(aTraiter),f=st().liste();
    if(!l.length&&!f.length)return '<div class="card" data-k="vide"><h2>Plannings enregistrés</h2><p class="mut">Aucun planning enregistré</p>'+
      '<button onclick="MHPrevu.ouvrirImport()">＋ Importer un planning</button></div>';
    return '<div class="card"><h2>Plannings enregistrés <span class="mut" style="font-size:13px;font-weight:500">('+(l.length+f.length)+')</span></h2>'+f.map(ficheLigneHtml).join('')+l.map(r=>{
      const a=analyseDe(r),us=unitesDe(a),val=us.filter(u=>u.status==='validé').length;
      return '<div class="mh372-row" data-id="'+esc(r.id)+'"><h3>'+esc(us.length>1?us.length+' plannings dans '+(r.source.format==='pdf'?'ce PDF':'cette image'):titre(r))+'</h3>'+
        '<p>'+esc(salarieDe(r)||'Salarié : à déterminer')+'</p>'+
        '<p>Source : '+esc((I().LIBELLE_SOURCE[r.sourceType]||r.sourceType).toLowerCase())+' · '+esc(FORMAT[r.source.format]||'')+' · '+taille(r.source.size)+' '+dispo(r)+'</p>'+
        '<p>État : <b data-k="etat">'+esc(us.length>1&&val?val+' validé'+(val>1?'s':'')+', '+(us.length-val)+' à valider ou compléter':etatDe(r))+'</b>'+(a?'':' · '+esc(r.ocr.libelle))+'</p>'+
        '<p>Importé le '+dtFr(r.importedAt)+'</p>'+
        '<div class="mh372-acts"><button onclick="MHPrevu.ouvrir(\''+esc(r.id)+'\')">Ouvrir</button><button class="g" onclick="MHPrevu.supprimer(\''+esc(r.id)+'\')">Supprimer</button></div></div>'}).join('')+'</div>';
  }
  /* Fiche d'un planning validé (une par tableau) */
  function fichePlanningHtml(p){const o=p.origine||{},r=o.importId&&st().importLire(o.importId),kv=(k,v)=>'<dt>'+k+'</dt><dd>'+v+'</dd>';
    const freres=st().fichesDeSource(p.source.sha256).filter(x=>x.id!==p.id);
    return '<div class="card mh372" data-k="fiche-planning" data-planning="'+esc(p.id)+'"><button class="g" onclick="MHPrevu.retour()">‹ Plannings enregistrés</button>'+
      '<h2 style="margin-top:10px">Planning du '+dFr(p.periode.debut)+' au '+dFr(p.periode.fin)+'</h2>'+
      '<div class="al i">Planning prévisionnel : il ne prouve pas une heure réellement travaillée et ne modifie jamais tes journées.</div>'+
      '<dl class="mh372-kv">'+kv('Salarié',esc(p.salarie&&p.salarie.nom||'—'))+kv('Source',esc(p.source.nom||'—')+(o.page!=null?' · page '+o.page:'')+(o.tableId!=null?' · tableau '+(o.tableId+1):'')+(o.orientation&&o.orientation.rotation180?' · page lue retournée':''))+
        kv('SHA-256','<span class="mh372-hash">'+esc(p.source.sha256)+'</span>')+kv('Journées prévues',String(p.interpretation.length))+
        kv('Autres fiches du même fichier',freres.length?freres.map(x=>'du '+dFr(x.periode.debut)+' au '+dFr(x.periode.fin)).join('<br>'):'aucune')+
        kv('Corrections',p.corrections&&p.corrections.length?p.corrections.length+' correction(s)':'aucune')+'</dl>'+
      '<table class="mh372-prevu" data-k="journees" style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px"><thead><tr><th style="text-align:left">Date</th><th style="text-align:left">Prévu</th></tr></thead><tbody>'+
        p.interpretation.map(x=>'<tr><td style="padding:3px 4px;border-bottom:1px solid var(--line)">'+dFr(x.date)+'</td><td style="padding:3px 4px;border-bottom:1px solid var(--line)">'+esc(x.libelle||'—')+'</td></tr>').join('')+'</tbody></table>'+
      '<div class="mh372-row"><div class="mh372-acts" style="margin-top:0"><button class="g" data-k="supprimer-fiche" onclick="MHPrevu.supprimerFiche(\''+esc(p.id)+'\')">Supprimer cette fiche</button>'+
      (r?'<button class="g" onclick="MHPrevu.ouvrir(\''+esc(r.id)+'\')">Fichier d’origine</button>':'')+'</div></div></div>'}
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
  function candidatsHtml(a,tableId){
    const C=a._candidats&&a._candidats.filter(t=>tableId==null||t.table===tableId);
    if(!C)return '<div class="al i" data-k="candidats">Pour choisir une autre ligne, relance l’analyse : la liste des lignes n’est jamais enregistrée (données des collègues).'+
      '<br><button class="g" style="margin-top:6px" onclick="MHPrevu.analyser()"'+(occupe?' disabled':'')+'>Relancer l’analyse</button></div>';
    return '<div class="mh372-cand" data-k="candidats"><p class="mut" style="font-size:12.5px;margin:6px 0 0">Choisis TA ligne (les autres lignes ne sont ni lues ni enregistrées) :</p>'+C.map(t=>
      t.candidats.slice().sort((x,y)=>x.ligne-y.ligne).map(c=>
        '<button class="g" data-ligne="'+c.ligne+'" onclick="MHPrevu.choisirLigne('+t.table+','+c.ligne+')"'+(occupe?' disabled':'')+'>Ligne '+(c.ligne+1)+' · '+esc(c.texte||'(nom illisible)')+(c.score!=null?' <span class="mut">('+Math.round(c.score*100)+' %)</span>':'')+'</button>').join('')).join('')+'</div>';
  }
  function lignesHtml(a,u){
    const ferme=u.status==='validé';
    return u.cellules.map(i=>{const c=a.cells[i];
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
  const statutU=u=>u.status==='validé'?['Validé','ok']:u.status==='à_valider'?['À valider','warn']:['À compléter','warn'];
  const nomPlanning=(r,u,n)=>'Planning '+(u.tableId+1)+(u.page!=null?' — page '+u.page:n>1?' — tableau '+(u.tableId+1):'');
  const aRevoir=(a,u)=>u.cellules.filter(i=>{const c=a.cells[i];return (A_REVOIR.includes(c.status)||!c.date)&&!c.revue}).length;
  function analyseHtml(r,a){const us=unitesDe(a);
    if(us.length>1&&vue.unite==null)return ensembleHtml(r,a);
    const u=us.find(x=>x.tableId===vue.unite)||us[0];
    return u?detailHtml(r,a,u,us.length):videHtml(r,a)}
  function enteteAnalyse(r){return '<span class="mh31-eyebrow" style="display:block;margin-top:10px">ANALYSE DU PLANNING</span>'+
      '<div class="al i">Planning prévisionnel : valider enregistre un planning prévu ; aucune journée réelle n’est créée ni modifiée.</div>'+
      (occupe?'<div class="al i" data-k="progression" role="status">⏳ <span id="mh372Prog">'+esc(progression||'Analyse en cours…')+'</span></div>':'')}
  function videHtml(r,a){return '<div class="card mh372 mh372-an" data-k="analyse-ecran" data-id="'+esc(r.id)+'"><button class="g" onclick="MHPrevu.fermerAnalyse()">‹ Fiche du planning</button>'+enteteAnalyse(r)+
      '<ul class="mh372-warn" data-k="alertes">'+a.warnings.map(w=>'<li data-code="'+esc(w.code)+'">'+esc(w.texte)+'</li>').join('')+'</ul>'+
      '<div class="mh372-bar"><button class="g" data-k="rejeter" onclick="MHPrevu.rejeterAnalyse()">Rejeter l’analyse</button></div></div>'}
  /* Vue d'ensemble : un planning par tableau détecté, chacun sélectionnable, ouvrable, validable seul (C3) */
  function ensembleHtml(r,a){const us=unitesDe(a),src=r.source.format==='pdf'?'ce PDF':'cette image';
    const nbSel=us.filter(u=>u.selected&&u.status==='à_valider').length;
    return '<div class="card mh372 mh372-an" data-k="analyse-ecran" data-vue="ensemble" data-id="'+esc(r.id)+'"><button class="g" onclick="MHPrevu.fermerAnalyse()">‹ Fiche du fichier</button>'+enteteAnalyse(r)+
      '<h2 style="margin:8px 0 2px" data-k="nb-plannings">'+us.length+' plannings détectés dans '+src+'</h2>'+
      '<p class="mut" style="font-size:12.5px;margin:0">Chaque planning donne sa propre fiche : coche ceux à valider, ouvre-les pour vérifier.</p>'+
      us.map(u=>{const se=u.selectedEmployee,st_=statutU(u),n=aRevoir(a,u),per=u.periodeTitre||u.period,val=u.status==='validé';
        return '<div class="mh372-row" data-k="unite" data-table="'+u.tableId+'" data-statut="'+esc(u.status)+'"><label style="display:flex;gap:8px;align-items:flex-start;text-transform:none;letter-spacing:0;margin:0;font-size:14px;color:var(--txt)">'+
          '<input type="checkbox" data-k="choisir" style="width:20px;height:20px;margin-top:2px"'+(u.selected||val?' checked':'')+(val||occupe?' disabled':'')+' onchange="MHPrevu.selectionnerUnite('+u.tableId+',this.checked)">'+
          '<span><b>'+esc(nomPlanning(r,u,us.length))+'</b>'+(u.orientation&&u.orientation.rotation180?' <span class="mut">(page lue retournée)</span>':'')+'<br>'+
          (per?dFr(per.debut)+' → '+dFr(per.fin):'période à déterminer')+'<br>'+esc(se?se.nom:'ta ligne : à choisir')+'<br>confiance '+pct(u.confidence)+
          ' · <span class="mh372-pill" data-tone="'+st_[1]+'">'+st_[0]+'</span>'+(n&&!val?' · <span class="mh372-pill" data-tone="warn">'+n+' à vérifier</span>':'')+'</span></label>'+
          '<div class="mh372-acts"><button class="g" data-k="detail" onclick="MHPrevu.ouvrirUnite('+u.tableId+')">'+(val?'Voir le détail':'Ouvrir et vérifier')+'</button>'+
          (val&&u.planningId?'<button class="g" onclick="MHPrevu.ouvrirFiche(\''+esc(u.planningId)+'\')">Voir la fiche</button>':'')+'</div></div>'}).join('')+
      '<div class="mh372-bar">'+(us.every(u=>u.status==='validé')?'<div class="al k" data-k="valide" style="flex:1 1 100%">✅ Tous les plannings de ce fichier sont validés ('+us.length+' fiches).</div>':
        '<button data-k="valider-selection" onclick="MHPrevu.validerSelection()"'+(occupe||!nbSel?' disabled':'')+'>Valider les plannings sélectionnés'+(nbSel?' ('+nbSel+')':'')+'</button>')+
      '<button class="g" data-k="rejeter" onclick="MHPrevu.rejeterAnalyse()">Rejeter l’analyse</button></div></div>'}
  function detailHtml(r,a,u,nb){
    const se=u.selectedEmployee,ferme=u.status==='validé',kv=(k,v,dk)=>'<dt>'+k+'</dt><dd'+(dk?' data-k="'+dk+'"':'')+'>'+v+'</dd>';
    const revoir=aRevoir(a,u),ambigu=!se;
    const nomTxt=se?esc(se.nom)+'<br><span class="mut">ligne '+(se.ligne+1)+' lue « '+esc(se.nomLu)+' »'+(se.auto?' (proposée)':' (choisie par toi)')+'</span>':'<b>non déterminé</b>';
    const corr=(a.corrections||[]).filter(c=>{const x=c.celluleId?a.cells.find(y=>y.id===c.celluleId):a.cells[c.cellule];return x&&x.table===u.tableId}).length;
    return '<div class="card mh372 mh372-an" data-k="analyse-ecran" data-vue="detail" data-table="'+u.tableId+'" data-id="'+esc(r.id)+'">'+
      (nb>1?'<button class="g" data-k="toutes" onclick="MHPrevu.toutesUnites()">‹ Tous les plannings ('+nb+')</button>':'<button class="g" onclick="MHPrevu.fermerAnalyse()">‹ Fiche du planning</button>')+enteteAnalyse(r)+
      (nb>1?'<h2 style="margin:8px 0 0">'+esc(nomPlanning(r,u,nb))+'</h2>':'')+
      '<dl class="mh372-head">'+kv('Source','<div id="mh372AnSrc" data-k="source"><span class="mut">'+esc(r.source.originalFileName)+(u.page!=null?' · page '+u.page:'')+'</span></div>')+
        kv('Salarié détecté',nomTxt+(ferme?'':'<br><button class="g" data-k="modifier-salarie" style="margin-top:4px" onclick="MHPrevu.modifierSalarie()">Modifier</button>'),'salarie')+
        kv('Période',u.period?dFr(u.period.debut)+' → '+dFr(u.period.fin):'à déterminer','periode')+
        kv('Confiance','<span class="mh372-conf" data-k="confiance">'+pct(u.confidence)+'</span>')+
        kv('Statut','<b data-k="statut">'+esc(ferme?'validé':u.status==='à_valider'?'à valider':'analyse incomplète')+'</b>'+(revoir&&!ferme?' · <span class="mh372-pill" data-tone="warn" data-k="nb-revoir">'+revoir+' à vérifier</span>':''))+
        kv('Lecture',esc(a.moteur||'—')+(corr?'<br>'+corr+' correction(s) tracée(s)':''))+'</dl>'+
      (!ferme&&(choixOuvert||ambigu)?candidatsHtml(a,u.tableId):'')+
      (u.warnings.length?'<details'+(u.warnings.length<=6?' open':'')+' data-k="alertes"><summary style="font-size:13px">Contrôles ('+u.warnings.length+')</summary><ul class="mh372-warn">'+u.warnings.map(w=>'<li data-code="'+esc(w.code)+'">'+esc(w.texte)+'</li>').join('')+'</ul></details>':'<p class="mut" style="font-size:12.5px" data-k="alertes">Aucune alerte de contrôle.</p>')+
      (u.cellules.length?'<table data-k="cellules" lang="fr"><colgroup><col class="c-d"><col class="c-l"><col class="c-i"><col class="c-c"><col class="c-s"></colgroup><thead><tr><th>Date</th><th>Lecture</th><th>Interpré&shy;tation</th><th>Confi&shy;ance</th><th>Statut</th></tr></thead><tbody>'+lignesHtml(a,u)+'</tbody></table>':'')+
      (ferme?'<div class="al k" data-k="valide" style="margin-top:10px">✅ '+(nb>1?'Planning validé':'Analyse validée')+' le '+dtFr(u.validatedAt)+' : planning prévisionnel enregistré.'+(u.planningId?' <button class="g" onclick="MHPrevu.ouvrirFiche(\''+esc(u.planningId)+'\')">Voir la fiche</button>':'')+'</div>':
        '<div class="mh372-bar"><button data-k="valider" onclick="MHPrevu.validerUnite('+u.tableId+')"'+(occupe||u.status!=='à_valider'?' disabled':'')+'>'+(nb>1?'Valider ce planning':'Valider cette analyse')+'</button>'+
        '<button class="g" data-k="modifier" aria-pressed="'+(edition?'true':'false')+'" onclick="MHPrevu.modifierAnalyse()">'+(edition?'Terminer les modifications':'Modifier')+'</button>'+
        (nb>1?'':'<button class="g" data-k="rejeter" onclick="MHPrevu.rejeterAnalyse()">Rejeter l’analyse</button>')+'</div>')+'</div>';
  }
  async function sourceVignette(r){const el=$('mh372AnSrc');if(!el||r.source.format==='pdf'||r.source.disponibilite!=='disponible')return;
    const u=await I().sources.url(r.source.localRef);if(!u||!$('mh372AnSrc'))return;if(u.startsWith('blob:'))urls.push(u);
    $('mh372AnSrc').innerHTML='<img class="mh372-prev" style="max-height:180px;margin:0" alt="Planning analysé (original)" src="'+esc(u)+'">'}
  let cacheOcr={sha:null,map:null};
  function enregistrer(r,a){try{return st().analyseEnregistrer(r.id,AN().serialiser(a))}catch(e){return null}}
  async function lancerAnalyse(choix,tableChoisi){
    const r=vue.fiche&&st().importLire(vue.fiche);if(!r||occupe)return;
    const inp=$('mh372Nom');if(inp)try{st().reglagesMaj({nomRef:inp.value})}catch(e){message={tone:'b',texte:'❌ '+e.message};render();return}
    const nomRef=st().reglages().nomRef;
    if(cacheOcr.sha!==r.source.sha256)cacheOcr={sha:r.source.sha256,map:new Map()};
    occupe=true;progression='Lecture de l’original…';message=null;render();
    let a;try{a=await L().analyser(r,{nomRef,choix:choix||[],cache:cacheOcr.map,progression:t=>{progression=t;const el=$('mh372Prog');if(el)el.textContent=t}})}
    catch(e){a=null;message={tone:'b',texte:'❌ Analyse impossible : '+(e&&e.message||e)+'. Aucune donnée n’a été modifiée.'}}
    occupe=false;progression='';
    if(a){if(a.warnings.some(w=>w.code==='SOURCE_ABSENTE'))try{st().importMaj(r.id,{disponibilite:'a_verifier'})}catch(e){}
      /* choix d'une ligne dans UN tableau : les autres plannings gardent cellules, corrections et validation */
      const prec=tableChoisi!=null&&courante&&courante.sourceSha256===a.sourceSha256?courante:null;
      if(prec)a=VA().fusionner(prec,a,tableChoisi);
      courante=a;edition=false;choixOuvert=false;enregistrer(r,a);vue={fiche:r.id,analyse:true,unite:tableChoisi!=null?tableChoisi:null};
      const us=unitesDe(a);
      message=us.length>1?{tone:'i',texte:us.length+' plannings détectés : chacun donnera sa propre fiche. Ouvre-les pour vérifier.'}:
        a.status==='à_valider'?{tone:'i',texte:'Analyse terminée : vérifie les lignes signalées puis valide.'}:{tone:'w',texte:'⚠️ Analyse incomplète : '+(a.warnings[0]?a.warnings[0].texte:'aucune cellule datée.')}}
    render();try{root.scrollTo(0,0)}catch(e){}
  }
  function analyseCourante(r){if(!courante||courante.sourceSha256!==r.source.sha256){courante=st().analyseLire(r.id);if(courante&&AN().recalculer)courante=AN().recalculer(courante);edition=false;choixOuvert=false}return courante}
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
  function validerTables(tables){const r=vue.fiche&&st().importLire(vue.fiche),a=r&&analyseCourante(r);if(!a)return;
    const b=VA().bloquants(a,tables);if(b.length){message={tone:'w',texte:'⚠️ Validation impossible pour l’instant :\n'+b.slice(0,8).join('\n')+(b.length>8?'\n… et '+(b.length-8)+' autre(s).':'')};render();return}
    const us=unitesDe(a).filter(u=>tables.includes(u.tableId)),desc=us.map(u=>'· '+nomPlanning(r,u,unitesDe(a).length)+' : '+dFr(u.period.debut)+' → '+dFr(u.period.fin)).join('\n');
    if(!root.confirm('Valider '+(us.length>1?'ces '+us.length+' plannings':'ce planning')+' ?\n\n'+desc+'\n\nUne fiche de planning PRÉVISIONNEL sera enregistrée pour chacun, pour '+(a.selectedEmployee&&a.selectedEmployee.nom||'toi')+'.\nTes journées réelles ne sont ni créées ni modifiées.'))return;
    try{const res=VA().valider(a,{record:r,tables});courante=res.analyse;edition=false;choixOuvert=false;
      message={tone:'k',texte:'✅ '+(res.plannings.length>1?res.plannings.length+' fiches de planning prévisionnel enregistrées':'Planning prévisionnel enregistré')+' ('+res.plannings.reduce((n,p)=>n+p.interpretation.length,0)+' journées prévues). Tes journées réelles n’ont pas changé.'}}
    catch(e){message={tone:'b',texte:'❌ '+(e&&e.message||e)}}
    render()}
  function validerUnite(t){validerTables([t])}
  function validerSelection(){const r=vue.fiche&&st().importLire(vue.fiche),a=r&&analyseCourante(r);if(!a)return;
    validerTables(unitesDe(a).filter(u=>u.selected&&u.status==='à_valider').map(u=>u.tableId))}
  function validerAnalyse(){const r=vue.fiche&&st().importLire(vue.fiche),a=r&&analyseCourante(r);if(!a)return;const us=unitesDe(a);
    validerTables(us.length===1?[us[0].tableId]:us.filter(u=>u.selected&&u.status==='à_valider').map(u=>u.tableId))}
  function selectionnerUnite(t,oui){appliquer(a=>VA().selectionner(a,t,oui))}
  function rejeterAnalyse(){const r=vue.fiche&&st().importLire(vue.fiche),a=r&&analyseCourante(r);if(!a)return;
    if(!root.confirm('Rejeter cette analyse ?\nL’analyse est supprimée ; le planning importé et son original sont conservés.'))return;
    const raison=root.prompt('Raison du rejet (facultatif) :','');
    try{VA().rejeter(a,{record:r,raison:raison||null});courante=null;edition=false;vue={fiche:r.id};message={tone:'i',texte:'Analyse rejetée. L’original est conservé : tu peux relancer une analyse.'}}
    catch(e){message={tone:'b',texte:'❌ '+(e&&e.message||e)}}
    render()}
  function choisirLigne(table,ligne){const a=courante,prev=a&&a.selectedEmployee?a.selectedEmployee.parTableau.filter(x=>x.table!==table).map(x=>({table:x.table,ligne:x.ligne})):[];
    lancerAnalyse(prev.concat([{table,ligne}]),table)}
  /* Suppression d'UNE fiche : les autres fiches du même fichier restent. L'original n'est proposé à la suppression que lorsque
     plus aucune fiche n'en dépend, et seulement après une confirmation explicite. */
  async function supprimerFiche(id){const p=st().lire(id);if(!p)return;
    const freres=st().fichesDeSource(p.source.sha256).filter(x=>x.id!==id).length;
    if(!root.confirm('Supprimer cette fiche (planning du '+dFr(p.periode.debut)+' au '+dFr(p.periode.fin)+') ?\n'+(freres?'Les '+freres+' autre(s) fiche(s) issue(s) du même fichier sont conservées.\n':'')+'Tes journées réelles ne changent pas.')){message={tone:'i',texte:'Suppression annulée.'};render();return}
    const res=st().ficheSupprimer(id);let txt='Fiche supprimée'+(freres?' ; les autres fiches du même fichier sont conservées.':'.');
    const imp=res&&res.importId&&st().importLire(res.importId);
    if(res&&!res.restantes.length&&imp){
      if(root.confirm('Plus aucune fiche ne dépend de « '+imp.source.originalFileName+' ».\nSupprimer aussi ce fichier importé et son original enregistré sur le téléphone ?\n\nOK : supprimer définitivement.\nAnnuler : conserver le fichier.')){
        const d=await I().supprimer(imp.id,{avecSource:true});txt+=d.source?' Fichier original supprimé.':' Fichier importé retiré ; l’original n’a pas été retrouvé.'}
      else txt+=' Fichier original conservé.'}
    else if(res&&res.restantes.length)txt+=' Fichier original conservé ('+res.restantes.length+' fiche(s) en dépendent).';
    if(courante&&courante.sourceSha256===p.source.sha256)courante=null;
    vue={fiche:null};message={tone:'k',texte:txt};render()}

  /* ---------- 📅 Planning : calendrier du prévisionnel validé (lot D) ---------- */
  const CAL=()=>root.MHPrevuCalendrier;
  const aujourdhui=()=>{try{const d=new Date();return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())}catch(e){return ''}};
  const hm=m=>m==null?'—':Math.floor(m/60)+'h'+(m%60?p2(m%60):'');
  function ongletCourant(){if(onglet)return onglet;return CAL()&&CAL().fiches(st()).length?'planning':'ocr'}
  function ongletsHtml(o){return '<div class="mh372-tabs" role="tablist" data-k="onglets">'+
    '<button role="tab" data-k="onglet-planning" aria-selected="'+(o==='planning')+'" onclick="MHPrevu.onglet(\'planning\')">📅 Planning</button>'+
    '<button role="tab" data-k="onglet-ocr" aria-selected="'+(o==='ocr')+'" onclick="MHPrevu.onglet(\'ocr\')">🔎 OCR / Validation</button></div>'}
  function provTxt(pr){return esc(pr.source||'fichier')+(pr.page!=null?' · page '+pr.page:'')+(pr.tableau!=null?' · tableau '+pr.tableau:'')}
  /* correction faite pendant la validation OCR (journal de l'analyse) pour cette date */
  function correctionOcr(pr,date){try{const a=pr.importId&&st().analyseLire(pr.importId);if(!a)return null;
    const c=(a.cells||[]).find(x=>x.date===date&&(pr.tableau==null||x.table===pr.tableau-1)&&x.texteCorrige!=null);return c?{lu:String(c.rawText||'').replace(/\n/g,' '),corrige:c.texteCorrige}:null}catch(e){return null}}
  function valeurHtml(v,date){const pr=v.provenance,cor=correctionOcr(pr,date),kv=(k,x)=>'<dt>'+k+'</dt><dd>'+x+'</dd>';
    return '<div class="mh372-val" data-k="valeur" data-planning="'+esc(pr.planningId)+'"><div>Prévu : <span class="mh372-prev" style="font-weight:700;display:inline;border:0;padding:0;background:none">'+esc(v.libelle||'—')+'</span></div>'+
      '<dl class="mh372-kv">'+(v.dureeMin!=null?kv('Durée prévue',hm(v.dureeMin)):'')+
        (v.horaires?kv('Horaires prévus',esc(v.horaires.debut)+' → '+esc(v.horaires.fin)+(v.amplitudeMin!=null?' (amplitude '+hm(v.amplitudeMin)+')':'')):'')+
        (v.applicable===false?kv('Remarque','code déclaré non concerné'):'')+
        kv('Source',provTxt(pr)+(pr.pageRetournee?' <span class="mut">(page lue retournée)</span>':''))+
        kv('Période du planning',dFr(pr.periode.debut)+' → '+dFr(pr.periode.fin))+
        kv('Statut','validé'+(pr.valideLe?' le '+dtFr(pr.valideLe):''))+
        kv('Correction',cor?'oui : lu « '+esc(cor.lu)+' », corrigé en « '+esc(cor.corrige)+' »':v.saisie==='corrigée sur la fiche'?'oui, sur la fiche':'non')+'</dl>'+
      '<button class="g" onclick="MHPrevu.ouvrirFiche(\''+esc(pr.planningId)+'\',\'planning\')">Ouvrir la fiche</button></div>'}
  function jourHtml(e){
    const t=CAL().dateLongue(e.date);
    if(e.etat==='aucun')return '<div class="mh372-jour" data-k="jour-detail" data-date="'+e.date+'" data-etat="aucun"><h3>'+t+'</h3><span class="mh372-prevu-badge">PRÉVISIONNEL</span>'+
      '<p class="mut" style="font-size:13px;margin:8px 0 0">Aucune valeur prévue pour cette date dans les plannings validés. Cela ne dit rien de ton travail réel.</p></div>';
    return '<div class="mh372-jour" data-k="jour-detail" data-date="'+e.date+'" data-etat="'+esc(e.etat)+'"><h3>'+t+'</h3><span class="mh372-prevu-badge">PRÉVISIONNEL</span>'+
      '<p class="mut" style="font-size:12.5px;margin:6px 0 0">Valeur prévue par un planning validé : elle ne prouve pas que cette journée a été travaillée.</p>'+
      (e.etat==='conflit'?'<div class="al w" data-k="conflit" style="margin-top:8px">⚠ Conflit prévisionnel : '+e.valeurs.length+' plannings validés prévoient des valeurs différentes. Aucune n’est retenue automatiquement.</div>':'')+
      (e.etat==='identique'?'<div class="al i" data-k="identique" style="margin-top:8px">Même valeur dans '+e.valeurs.length+' plannings validés (provenances conservées ci-dessous).</div>':'')+
      e.valeurs.map(v=>valeurHtml(v,e.date)).join('')+'</div>'}
  function calendrierHtml(){
    const C=CAL();if(!C)return '<div class="card"><p class="mut">Calendrier indisponible.</p></div>';
    const auj=aujourdhui(),f=C.fiches(st());
    if(!f.length)return '<div class="card mh372 mh372-cal" data-k="calendrier" data-vide="1"><span class="mh372-prevu-badge">PRÉVU</span><h2 style="margin:6px 0">Planning prévisionnel</h2>'+
      '<p class="mut">Aucun planning prévisionnel validé pour l’instant.</p><p class="mut" style="font-size:13px">Importe un planning et valide son analyse dans 🔎 OCR / Validation : il apparaîtra ici.</p>'+
      '<button onclick="MHPrevu.onglet(\'ocr\')">🔎 Aller à OCR / Validation</button></div>';
    if(!calMois)calMois=C.moisInitial(st(),auj);
    const M=C.mois(st(),calMois),DOW=['L','M','M','J','V','S','D'];
    const cel=c=>{const e=c.entree,lab=e.etat==='conflit'?'⚠ Conflit':e.libelle||'',coul=e.valeurs[0]&&e.valeurs[0].couleur;
      return '<button class="mh372-j" data-date="'+c.date+'" data-etat="'+esc(e.etat)+'" data-hors="'+(c.dansMois?0:1)+'" data-aujourdhui="'+(c.date===auj?1:0)+'" aria-pressed="'+(calJour===c.date)+'"'+
        ' aria-label="'+esc(C.dateLongue(c.date)+(lab?' : prévu '+lab:' : rien de prévu'))+'" onclick="MHPrevu.jour(\''+c.date+'\')">'+
        (coul&&e.etat!=='conflit'?'<span class="mh372-c" style="background:'+esc(coul)+'"></span>':'')+
        '<span class="mh372-n">'+(+c.date.slice(8))+'</span><span class="mh372-l">'+esc(lab)+'</span>'+(e.etat==='identique'?'<span class="mh372-x">×'+e.valeurs.length+'</span>':'')+'</button>'};
    const e=calJour&&C.entree(st(),calJour);
    return '<div class="card mh372 mh372-cal" data-k="calendrier" data-mois="'+M.mois+'"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="mh372-prevu-badge" data-k="badge-prevu">PRÉVU</span>'+
      '<button class="g" data-k="aujourdhui" style="min-height:36px;padding:4px 12px;font-size:13px" onclick="MHPrevu.aujourdhui()">Aujourd’hui</button></div>'+
      '<div class="mh372-nav"><button class="g" data-k="mois-prec" aria-label="Mois précédent" onclick="MHPrevu.moisPrecedent()">‹</button><h2 data-k="mois-titre">'+esc(M.titre)+'</h2>'+
      '<button class="g" data-k="mois-suiv" aria-label="Mois suivant" onclick="MHPrevu.moisSuivant()">›</button></div>'+
      '<p class="mut" style="font-size:12px;margin:0;text-align:center">Planning prévisionnel validé · ne prouve pas une heure travaillée'+(M.resume.conflits?' · <b style="color:#b26a00">'+M.resume.conflits+' conflit'+(M.resume.conflits>1?'s':'')+'</b>':'')+'</p>'+
      '<div class="mh372-grid" data-k="grille">'+DOW.map(d=>'<div class="mh372-dow">'+d+'</div>').join('')+M.semaines.flat().map(cel).join('')+'</div>'+
      (e?jourHtml(e):'<p class="mut" style="font-size:12.5px;margin:8px 0 0">Touche une date pour voir le détail prévu et sa provenance.</p>')+
      (M.plannings.length?'<div class="mh372-src" data-k="sources"><b>Plannings de ce mois</b><ul style="padding-left:18px;margin:4px 0 0">'+M.plannings.map(pr=>'<li>'+dFr(pr.periode.debut)+' → '+dFr(pr.periode.fin)+' · '+provTxt(pr)+'</li>').join('')+'</ul></div>':
        '<p class="mut" style="font-size:12.5px" data-k="sources">Aucun planning validé ne couvre ce mois.</p>')+'</div>'}

  function render(){
    const sec=$('s-prevu');if(!sec||!P()||!I())return;
    css();urls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});urls=[];
    const r=vue.fiche&&st().importLire(vue.fiche);
    if(vue.fiche&&!r)vue.fiche=null;
    const fp=vue.planning&&st().lire(vue.planning);if(vue.planning&&!fp)vue.planning=null;
    if(fp){sec.innerHTML=msgHtml()+fichePlanningHtml(fp);return}
    if(r&&vue.analyse){const a=analyseCourante(r);if(a){sec.innerHTML=msgHtml()+analyseHtml(r,a);sourceVignette(r);return}vue={fiche:r.id}}
    if(r){sec.innerHTML=msgHtml()+ficheHtml(r);apercu(r);return}
    const og=ongletCourant();
    if(og==='planning'){sec.innerHTML='<div class="mh372">'+ongletsHtml(og)+'</div>'+msgHtml()+calendrierHtml();return}
    sec.innerHTML='<div class="mh372">'+ongletsHtml(og)+'</div><div class="card mh372"><span class="mh31-eyebrow">PLANNING PRÉVISIONNEL · OCR / VALIDATION</span><h2 style="margin:4px 0 6px">📋 Prévu</h2>'+
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
    const dep=st().fichesDeSource(r.source.sha256);
    if(dep.length){message={tone:'w',texte:'⚠️ '+dep.length+' fiche(s) de planning dépendent de ce fichier : supprime-les d’abord. Le fichier et son original sont conservés.'};render();return}
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
    onglet(o){onglet=o==='planning'?'planning':'ocr';vue={fiche:null};message=null;render();try{root.scrollTo(0,0)}catch(e){}},
    moisPrecedent(){calMois=CAL().ajouterMois(calMois,-1);calJour=null;render()},
    moisSuivant(){calMois=CAL().ajouterMois(calMois,1);calJour=null;render()},
    aujourdhui(){const a=aujourdhui();calMois=a.slice(0,7);calJour=a;render()},
    jour(d){calJour=calJour===d?null:d;if(d&&d.slice(0,7)!==calMois)calMois=d.slice(0,7);render();try{const el=document.querySelector('#s-prevu [data-k="jour-detail"]');if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'})}catch(e){}},
    ouvrirImport(){onglet='ocr';vue={fiche:null,import:true};message=null;render();try{const b=$('mh372Imp');if(b&&b.scrollIntoView)b.scrollIntoView({block:'nearest'})}catch(e){}},
    ouvrir(id){onglet='ocr';vue={fiche:id};message=null;render();try{root.scrollTo(0,0)}catch(e){}},
    retour(){vue={fiche:null};message=null;render()},supprimer,texte,
    analyser(){return lancerAnalyse([])},choisirLigne,corrigerCellule,confirmerCellule,validerAnalyse,rejeterAnalyse,
    validerUnite,validerSelection,selectionnerUnite,supprimerFiche,
    ouvrirFiche(id,depuis){if(depuis)onglet=depuis;vue={planning:id};message=null;render();try{root.scrollTo(0,0)}catch(e){}},
    ouvrirUnite(t){if(!vue.fiche)return;vue={fiche:vue.fiche,analyse:true,unite:t};edition=false;choixOuvert=false;message=null;render();try{root.scrollTo(0,0)}catch(e){}},
    toutesUnites(){if(!vue.fiche)return;vue={fiche:vue.fiche,analyse:true,unite:null};edition=false;choixOuvert=false;message=null;render()},
    voirAnalyse(){if(!vue.fiche)return;vue={fiche:vue.fiche,analyse:true};message=null;render();try{root.scrollTo(0,0)}catch(e){}},
    fermerAnalyse(){vue={fiche:vue.fiche};edition=false;choixOuvert=false;message=null;render()},
    modifierSalarie(){choixOuvert=!choixOuvert;render()},modifierAnalyse(){edition=!edition;render()}};
  /* Disponibilité des sources vérifiée au démarrage et après une restauration. */
  try{document.addEventListener('mh:plannings-restored',verifier);root.addEventListener&&root.addEventListener('load',()=>setTimeout(verifier,800))}catch(e){}
})(window);
