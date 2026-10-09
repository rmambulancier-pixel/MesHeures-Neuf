/*
 * MesHeures V37.2.0-D — Planning prévu : vue calendrier du PRÉVISIONNEL validé (lecture seule).
 * Source unique : les fiches de planning validées (statut « enregistre ») du stockage Planning prévu. Une analyse OCR non
 * validée n'apparaît jamais. Les libellés sont ceux des fiches validées : aucune réinterprétation ici.
 * Plusieurs fiches pour une même date : jamais fusionnées en silence. Valeurs identiques → « identique » avec toutes les
 * provenances ; valeurs différentes → « conflit », aucune n'est retenue.
 * Structure prête pour la future comparaison Prévu ↔ Réel : entree(date) → {date, nature, etat, valeurs[], provenances[]}.
 * Une date sans valeur prévue est « aucun » : cela ne dit rien du travail réel. Aucun accès aux journées réelles.
 */
(function(root){
  'use strict';
  const V='37.2.0-D';
  const P=()=>root.MHPlanning;
  const ISO=/^\d{4}-\d{2}-\d{2}$/;
  const pad=n=>String(n).padStart(2,'0');
  const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

  /* fiches validées seulement */
  function fiches(st){st=st||P().store();return st.liste().filter(p=>p.statut==='enregistre'&&p.periode&&Array.isArray(p.interpretation))}
  function provenance(p){const o=p.origine||{};
    return {planningId:p.id,source:p.source&&p.source.nom||'',sha256:p.source&&p.source.sha256||null,importId:o.importId||null,page:o.page==null?null:o.page,
      tableau:o.tableId==null?null:o.tableId+1,periode:{debut:p.periode.debut,fin:p.periode.fin},salarie:p.salarie&&p.salarie.nom||'',
      valideLe:p.enregistreLe||null,pageRetournee:!!(o.orientation&&o.orientation.rotation180)}}
  /* couleur relevée sur la photo pour cette date (aide à la lecture, jamais la donnée) */
  function couleurDe(p,date){const c=(p.ocr&&p.ocr.cellules||[]).find(x=>x.date===date);return c&&typeof c.couleur==='string'?c.couleur:null}
  const memeValeur=(a,b)=>a.type===b.type&&a.libelle===b.libelle&&(a.dureeMin==null?null:a.dureeMin)===(b.dureeMin==null?null:b.dureeMin);

  /* Index date → entrée, sur toutes les fiches validées */
  function index(st){
    const m=new Map();
    fiches(st).sort((a,b)=>String(a.periode.debut).localeCompare(String(b.periode.debut))||String(a.id).localeCompare(String(b.id))).forEach(p=>{const pr=provenance(p);
      p.interpretation.forEach(i=>{if(!ISO.test(String(i.date||'')))return;
        const e=m.get(i.date)||{date:i.date,nature:'prévisionnel',valeurs:[]};
        e.valeurs.push({libelle:i.libelle,type:i.type,regle:i.regle||null,dureeMin:i.dureeMin==null?null:i.dureeMin,horaires:i.horaires||null,amplitudeMin:i.amplitudeMin==null?null:i.amplitudeMin,
          applicable:i.applicable,correspondance:i.correspondance||null,saisie:i.origine==='manuel'?'corrigée sur la fiche':'lecture validée',couleur:couleurDe(p,i.date),provenance:pr});
        m.set(i.date,e)})});
    m.forEach(e=>{const v=e.valeurs;e.provenances=v.map(x=>x.provenance);
      e.etat=v.length===1?'prévu':v.every(x=>memeValeur(x,v[0]))?'identique':'conflit';
      e.libelle=e.etat==='conflit'?null:v[0].libelle});
    return m;
  }
  function entree(st,date,idx){const e=(idx||index(st)).get(date);return e||{date,nature:'prévisionnel',etat:'aucun',valeurs:[],provenances:[],libelle:null}}
  /* Toutes les dates prévues d'une période (comparaison future) */
  function periode(st,debut,fin){const idx=index(st),out=[];for(let d=debut;d<=fin;d=addJ(d,1))out.push(entree(st,d,idx));return out}

  /* Mois affiché : semaines du lundi au dimanche */
  function ajouterMois(ym,n){const y=+ym.slice(0,4),mo=+ym.slice(5,7)-1+n,d=new Date(Date.UTC(y,mo,1));return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)}
  function titreMois(ym){const m=MOIS[+ym.slice(5,7)-1];return m.charAt(0).toUpperCase()+m.slice(1)+' '+ym.slice(0,4)}
  function mois(st,ym){
    if(!/^\d{4}-\d{2}$/.test(String(ym||'')))throw new Error('Mois invalide.');
    const idx=index(st),premier=ym+'-01',dow=(new Date(premier+'T12:00:00Z').getUTCDay()+6)%7;let d=addJ(premier,-dow);const semaines=[];
    do{const s=[];for(let k=0;k<7;k++){s.push({date:d,dansMois:d.slice(0,7)===ym,entree:entree(st,d,idx)});d=addJ(d,1)}semaines.push(s)}while(d.slice(0,7)===ym);
    const fin=addJ(ajouterMois(ym,1)+'-01',-1);
    const plannings=fiches(st).filter(p=>p.periode.debut<=fin&&p.periode.fin>=premier).map(provenance).sort((a,b)=>a.periode.debut.localeCompare(b.periode.debut));
    const jours=semaines.flat().filter(c=>c.dansMois);
    return {mois:ym,titre:titreMois(ym),semaines,plannings,
      resume:{prevus:jours.filter(c=>c.entree.etat!=='aucun').length,conflits:jours.filter(c=>c.entree.etat==='conflit').length,identiques:jours.filter(c=>c.entree.etat==='identique').length}};
  }
  /* Mois de départ : celui d'aujourd'hui s'il contient du prévu, sinon le prochain mois prévu, sinon le dernier */
  function moisInitial(st,aujourdhui){const ym=String(aujourdhui||'').slice(0,7),f=fiches(st);if(!f.length)return ym;
    const mois_=new Set();f.forEach(p=>{for(let d=p.periode.debut;d<=p.periode.fin;d=addJ(d,1))mois_.add(d.slice(0,7))});
    if(mois_.has(ym))return ym;const l=[...mois_].sort();return l.find(x=>x>ym)||l[l.length-1]}
  function dateLongue(k){const d=new Date(k+'T12:00:00Z');return JOURS[d.getUTCDay()].replace(/^./,c=>c.toUpperCase())+' '+k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4)}

  root.MHPrevuCalendrier={version:V,fiches,provenance,index,entree,periode,mois,moisInitial,ajouterMois,titreMois,dateLongue};
})(typeof window!=='undefined'?window:globalThis);
