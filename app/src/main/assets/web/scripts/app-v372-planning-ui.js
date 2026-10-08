/*
 * MesHeures V37.2.0-B — onglet « Prévu » : planning prévisionnel (import, liste, fiche, suppression).
 * Affichage et import seulement. Aucune analyse (OCR au lot suivant), aucune écriture dans DB ni dans les journées.
 */
(function(root){
  'use strict';
  const V='37.2.0-B';
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
      '.mh372-txt{white-space:pre-wrap;max-height:260px;overflow:auto;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:8px}';
    document.head.appendChild(s);
  }
  const P=()=>root.MHPlanning,I=()=>root.MHPlanningImport;
  const st=()=>P().store();

  function dispo(r){const d=r.source.disponibilite;return d==='disponible'?'<span class="mh372-pill" data-tone="ok" data-k="dispo">source disponible</span>':'<span class="mh372-pill" data-tone="warn" data-k="dispo">source à vérifier</span>'}
  function titre(r){return r.periode&&r.periode.debut?'Planning du '+dFr(r.periode.debut)+' au '+dFr(r.periode.fin):'Planning : période à déterminer'}
  function journees(r){if(!r.planningId)return null;const p=st().lire(r.planningId);return p&&Array.isArray(p.interpretation)?p.interpretation.length:null}
  function msgHtml(){if(!message)return '';return '<div class="al '+(message.tone||'i')+'" data-k="msg" role="status">'+esc(message.texte)+'</div>'}

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
        '<p>'+esc(r.salarie&&r.salarie.nom?r.salarie.nom:'Salarié : à déterminer')+'</p>'+
        '<p>Source : '+esc((I().LIBELLE_SOURCE[r.sourceType]||r.sourceType).toLowerCase())+' · '+esc(FORMAT[r.source.format]||'')+' · '+taille(r.source.size)+' '+dispo(r)+'</p>'+
        '<p>État : <b data-k="etat">'+esc(ETAT[r.statut]||r.statut)+'</b>'+(n!=null?' · '+n+' journée'+(n>1?'s':''):'')+' · '+esc(r.ocr.libelle)+'</p>'+
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
        kv('Période',r.periode&&r.periode.debut?dFr(r.periode.debut)+' → '+dFr(r.periode.fin):'à déterminer (analyse à venir)')+
        kv('Salarié',r.salarie&&r.salarie.nom?esc(r.salarie.nom):'à déterminer (analyse à venir)')+
        kv('Source',esc(I().LIBELLE_SOURCE[r.sourceType]||r.sourceType))+
        kv('Fichier original',esc(s.originalFileName)+'<br><span class="mut">'+esc(FORMAT[s.format])+' · '+taille(s.size)+(s.largeur?' · '+s.largeur+' × '+s.hauteur+' px':'')+(s.pages?' · '+s.pages+' page'+(s.pages>1?'s':''):'')+'</span><br>'+dispo(r))+
        (img?kv('Orientation (EXIF)',s.orientation?esc(ORIENT[s.orientation]||String(s.orientation))+' <span class="mut">(original non modifié)</span>':'non indiquée'):'')+
        kv('SHA-256','<span class="mh372-hash" data-k="sha">'+esc(s.sha256)+'</span>')+
        kv('Statut','<b>'+esc(ETAT[r.statut]||r.statut)+'</b>')+
        kv('Analyse',esc(r.ocr.libelle))+
        kv('Importé le',dtFr(r.importedAt))+
        kv('Données extraites',t?(t.disponible?t.caracteres+' caractères sur '+t.pages+' page'+(t.pages>1?'s':'')+' <button class="g" onclick="MHPrevu.texte(\''+esc(r.id)+'\')">Afficher le texte</button>':'aucun texte sélectionnable'):'aucune (image : analyse à venir)')+
        kv('Corrections',r.corrections&&r.corrections.length?r.corrections.length+' correction(s)':'aucune')+
      '</dl><div id="mh372Txt"></div>'+
      (img?'<div id="mh372Prev" data-k="apercu"></div>':'')+
      '<div class="card" style="margin-top:10px" data-k="analyse"><h2>Analyse du planning</h2><p class="mut">Lecture du tableau, choix de ta ligne et contrôle des journées : prochain lot. Aucune donnée n’est déduite de la source pour l’instant.</p>'+
      '<button disabled>Analyser le planning (à venir)</button></div>'+
      '<div class="mh372-row"><div class="mh372-acts" style="margin-top:0"><button class="g" onclick="MHPrevu.supprimer(\''+esc(r.id)+'\')">Supprimer ce planning</button></div></div></div>';
  }

  function render(){
    const sec=$('s-prevu');if(!sec||!P()||!I())return;
    css();urls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});urls=[];
    const r=vue.fiche&&st().importLire(vue.fiche);
    if(vue.fiche&&!r)vue.fiche=null;
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
    retour(){vue={fiche:null};message=null;render()},supprimer,texte};
  /* Disponibilité des sources vérifiée au démarrage et après une restauration. */
  try{document.addEventListener('mh:plannings-restored',verifier);root.addEventListener&&root.addEventListener('load',()=>setTimeout(verifier,800))}catch(e){}
})(window);
