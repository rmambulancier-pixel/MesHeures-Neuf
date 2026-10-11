/*
 * MesHeures V37.3.0 — 📊 Comparaison Prévu ↔ Réel : rendu (sous-onglet de 📋 Prévu).
 * Affiche l'analyse de MHComparaison : Date | Prévu | Réel | Résultat, statistiques, détail d'une date (provenances,
 * écarts, motif). Lecture seule : aucun bouton ne modifie une journée réelle ni une fiche prévue.
 */
(function(root){
  'use strict';
  const V='37.3.0';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const p2=n=>String(n).padStart(2,'0');
  const dCourt=k=>k.slice(8)+'/'+k.slice(5,7);
  const dFr=k=>k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4);
  const CMP=()=>root.MHComparaison,CAL=()=>root.MHPrevuCalendrier;
  const etat={mois:null,date:null,filtre:'tous'};
  const aujourdhui=()=>{const d=new Date();return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())};
  const FILTRES=[['tous','Tout'],['ecarts','Écarts'],['conforme','Conformes']];
  const ECARTS=['different','reel_non_prevu','prevu_sans_reel','conflit'];

  function css(){if(document.getElementById('mh373Css'))return;const s=document.createElement('style');s.id='mh373Css';
    s.textContent='.mh373 .mh373-ana{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:999px;border:1.5px solid var(--dim);color:var(--dim)}'+
      '.mh373 .mh373-nav{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:6px;margin:8px 0 4px}.mh373 .mh373-nav h2{margin:0;text-align:center;font-size:18px}.mh373 .mh373-nav button{min-height:44px;padding:0;font-size:20px}'+
      '.mh373 .mh373-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px}.mh373 .mh373-stats div{border:1px solid var(--line);border-radius:10px;padding:6px 6px;font-size:11.5px;line-height:1.25;overflow-wrap:anywhere}.mh373 .mh373-stats b{display:block;font-size:17px}'+
      '.mh373 .mh373-taux{font-size:13px;margin-top:8px}.mh373 .mh373-f{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}.mh373 .mh373-f button{min-height:36px;padding:4px 12px;font-size:13px;flex:1 1 auto}'+
      '.mh373 .mh373-f button[aria-pressed="false"]{background:var(--card);color:var(--txt);border:1px solid var(--line)}'+
      '.mh373 table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;margin-top:8px}.mh373 th,.mh373 td{padding:6px 3px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}'+
      '.mh373 th{font-size:10.5px;color:var(--dim);font-weight:600;text-transform:none;letter-spacing:0}.mh373 col.c1{width:15%}.mh373 col.c2{width:26%}.mh373 col.c3{width:29%}.mh373 col.c4{width:30%}.mh373 td:first-child{white-space:nowrap;overflow-wrap:normal;font-size:11.5px}'+
      '.mh373 tr[data-resultat]{cursor:pointer}.mh373 tr[aria-selected="true"] td{background:rgba(91,141,239,.12)}.mh373 td .mut{font-size:11px}'+
      '.mh373 .mh373-det{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:10px;font-size:13px}.mh373 .mh373-det h3{margin:0 0 4px;font-size:15px}.mh373 .mh373-det ul{padding-left:18px;margin:4px 0}';
    document.head.appendChild(s)}

  function resultatHtml(l){const r=CMP().RESULTATS[l.resultat];return '<span data-k="resultat">'+r.emoji+' '+esc(r.libelle)+(l.resultat==='prevu_sans_reel'&&l.futur?'<br><span class="mut">à venir</span>':'')+'</span>'}
  function prevuHtml(l){const p=l.prevu;if(p.etat==='aucun')return '<span class="mut">—</span>';
    if(p.etat==='conflit')return p.valeurs.map(v=>esc(v.libelle)).join('<br>')+'<br><span class="mut">'+p.valeurs.length+' sources</span>';
    return esc(p.libelle)+(p.etat==='identique'?'<br><span class="mut">×'+p.valeurs.length+' sources</span>':'')}
  function reelHtml(l){const r=l.reel;if(!r)return '<span class="mut">aucun réel saisi</span>';
    const t=r.t==='T'||r.t==='NUIT';return esc(t?(r.t==='T'?'Travail':'Nuit'):r.libelle)+(t&&(r.deb||r.fin)?'<br><span class="mut">'+esc((r.deb||'?')+'–'+(r.fin||'?'))+(r.tte!=null?' · TTE '+Math.floor(r.tte/60)+'h'+p2(r.tte%60):'')+'</span>':'')}
  function detailHtml(l){const pr=l.prevu.valeurs;
    return '<div class="mh373-det" data-k="cmp-detail" data-date="'+l.date+'"><h3>'+esc(CAL().dateLongue(l.date))+'</h3>'+resultatHtml(l)+
      '<p style="margin:6px 0 0">'+esc(l.motif)+'</p>'+
      (l.ecarts.length?'<p style="margin:8px 0 0"><b>Écarts (information, ne changent pas le résultat)</b></p><ul>'+l.ecarts.map(e=>'<li>'+esc(e.texte)+'</li>').join('')+'</ul>':'')+
      '<p style="margin:8px 0 0"><b>Prévu</b> <span class="mut">(planning validé)</span></p>'+(pr.length?'<ul>'+pr.map(v=>'<li>'+esc(v.libelle)+' — '+esc(v.provenance.source||'fichier')+(v.provenance.page!=null?' · page '+v.provenance.page:'')+(v.provenance.tableau!=null?' · tableau '+v.provenance.tableau:'')+
        ' · planning du '+dFr(v.provenance.periode.debut)+' au '+dFr(v.provenance.periode.fin)+'</li>').join('')+'</ul>':'<p class="mut" style="margin:2px 0">aucune prévision validée</p>')+
      '<p style="margin:8px 0 0"><b>Réel</b> <span class="mut">(journée saisie, lecture seule)</span></p><p style="margin:2px 0">'+(l.reel?esc(l.reel.libelle)+(l.reel.tte!=null&&(l.reel.t==='T'||l.reel.t==='NUIT')?' · TTE '+Math.floor(l.reel.tte/60)+'h'+p2(l.reel.tte%60)+' · amplitude '+Math.floor(l.reel.amp/60)+'h'+p2(l.reel.amp%60):''):'<span class="mut">aucune journée réelle saisie</span>')+'</p></div>'}

  function html(st){css();const C=CMP();
    if(!C||!CAL()||!root.MHReelLecture)return '<div class="card"><p class="mut">Comparaison indisponible.</p></div>';
    const auj=aujourdhui();if(!etat.mois)etat.mois=CAL().moisInitial(st,auj);
    const R=C.mois(etat.mois,{store:st,aujourdhui:auj}),S=R.stats;
    const lignes=R.lignes.filter(l=>etat.filtre==='tous'||(etat.filtre==='ecarts'?ECARTS.includes(l.resultat):l.resultat===etat.filtre));
    const sel=etat.date&&R.lignes.find(l=>l.date===etat.date);
    const tuile=(n,lab,k)=>'<div data-k="'+k+'"><b>'+n+'</b>'+lab+'</div>';
    return '<div class="card mh373" data-k="comparaison" data-mois="'+R.mois+'"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="mh373-ana" data-k="badge-analyse">ANALYSE · LECTURE SEULE</span></div>'+
      '<p class="mut" style="font-size:12px;margin:6px 0 0">Comparaison du planning PRÉVU validé avec tes journées RÉELLES. Aucune donnée réelle n’est modifiée ; une prévision ne prouve aucun travail.</p>'+
      '<div class="mh373-nav"><button class="g" data-k="cmp-prec" aria-label="Mois précédent" onclick="MHComparaisonUI.mois(-1)">‹</button><h2 data-k="cmp-titre">'+esc(CAL().titreMois(R.mois))+'</h2><button class="g" data-k="cmp-suiv" aria-label="Mois suivant" onclick="MHComparaisonUI.mois(1)">›</button></div>'+
      '<div class="mh373-stats" data-k="stats">'+tuile(S.conformes,'🟢 conformes','st-conformes')+tuile(S.differents,'🟠 différents','st-differents')+tuile(S.reelsNonPrevus+S.reelsSansPrevision,'🔴 réels non prévus'+(S.reelsSansPrevision?' <span class="mut">(dont '+S.reelsSansPrevision+' sans planning)</span>':''),'st-rnp')+
        tuile(S.prevusSansReel,'🔵 prévus sans réel','st-psr')+tuile(S.conflits,'⚠️ conflits','st-conflits')+tuile(S.nonComparables,'ℹ️ non comparables','st-nc')+'</div>'+
      '<p class="mh373-taux" data-k="taux">'+(S.taux==null?'Taux de conformité : non calculé (aucun jour comparable ce mois-ci).':'Taux de conformité : <b>'+String(S.taux).replace('.',',')+' %</b> ('+S.conformes+' conforme'+(S.conformes>1?'s':'')+' sur '+S.comparables+' jour'+(S.comparables>1?'s':'')+' comparable'+(S.comparables>1?'s':'')+')')+
        '<br><span class="mut" style="font-size:11.5px">Jour comparable : une prévision unique comparable et une journée réelle saisie. '+(S.aVenir?S.aVenir+' jour(s) à venir non comptés. ':'')+(S.reelsSansPrevision?S.reelsSansPrevision+' jour(s) travaillés sans planning validé. ':'')+'</span></p>'+
      '<div class="mh373-f" role="group" aria-label="Filtre">'+FILTRES.map(([k,lab])=>'<button data-k="filtre-'+k+'" aria-pressed="'+(etat.filtre===k)+'" onclick="MHComparaisonUI.filtre(\''+k+'\')">'+lab+'</button>').join('')+'</div>'+
      (R.lignes.length?(lignes.length?'<table data-k="cmp-table" lang="fr"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup><thead><tr><th>Date</th><th>Prévu</th><th>Réel</th><th>Résultat</th></tr></thead><tbody>'+
        lignes.map(l=>'<tr data-date="'+l.date+'" data-resultat="'+l.resultat+'" aria-selected="'+(etat.date===l.date)+'" onclick="MHComparaisonUI.date(\''+l.date+'\')"><td>'+dCourt(l.date)+'</td><td>'+prevuHtml(l)+'</td><td>'+reelHtml(l)+'</td><td>'+resultatHtml(l)+'</td></tr>'+
          (etat.date===l.date?'<tr data-k="cmp-detail-ligne"><td colspan="4" style="padding:0">'+detailHtml(l)+'</td></tr>':'')).join('')+'</tbody></table>':'<p class="mut" data-k="cmp-vide">Aucune date pour ce filtre.</p>'):
        '<p class="mut" data-k="cmp-vide" style="margin-top:10px">Ni prévu validé ni réel saisi ce mois-ci.</p>')+'</div>'}

  root.MHComparaisonUI={version:V,html,etat,
    mois(n){etat.mois=CAL().ajouterMois(etat.mois,n);etat.date=null;root.MHPrevu&&root.MHPrevu.render()},
    filtre(f){etat.filtre=f;root.MHPrevu&&root.MHPrevu.render()},
    date(d){etat.date=etat.date===d?null:d;root.MHPrevu&&root.MHPrevu.render()}};
})(window);
