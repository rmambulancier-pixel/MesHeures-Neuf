/*
 * MesHeures V37.4.1 — Fenêtres de dialogue intégrées (remplacent alert / confirm / prompt dans les parcours convertis).
 *
 * MHDialogue.info({titre, message, details, bouton})                    → Promise<void>
 * MHDialogue.confirmer({titre, message, action, annuler, danger})       → Promise<boolean>
 * MHDialogue.saisir({titre, message, libelle, valeur, type, inputmode, enterkeyhint, autocomplete, autocapitalize,
 *                    placeholder, facultatif, action, annuler, valider}) → Promise<string|null>   (null = Annuler)
 * MHDialogue.formulaire({titre, message, champs:[{nom, libelle, type, valeur, requis, inputmode, autocomplete,
 *                    multiligne, placeholder}], action, annuler, valider}) → Promise<objet|null>
 * MHDialogue.exclusif(cle, fn) : une seule exécution à la fois d'un même parcours (double appui ignoré).
 * MHDialogue.retour() : appelé par Android (bouton Retour) ; ferme la fenêtre ouverte comme « Annuler ». Vrai si fermée.
 *
 * Règles : une seule fenêtre à la fois (file d'attente) ; textes insérés sans interprétation HTML ; Échap et Retour
 * Android = Annuler ; appui hors de la fenêtre = Annuler pour info et confirmation, ignoré pour une saisie (rien n'est
 * perdu) ; action destructive (danger) : bouton rouge au verbe explicite, focus initial sur « Annuler ».
 * Thème : variables CSS de l'application (clair / sombre). Les couleurs sont aussi transmises à Android pour les
 * fenêtres natives restantes (Planning). Sans DOM disponible : repli sur les fenêtres natives (aucune régression).
 * Aucun accès aux données : ce module n'écrit rien.
 */
(function(root){
  'use strict';
  const V='37.4.1';
  const doc=root.document;
  let ouverte=null,file=Promise.resolve(),seq=0;
  const enCours=new Set();

  /* ---------- pont Android (facultatif) ---------- */
  const pont=(m,...a)=>{try{const A=root.MesHeuresAndroid;if(A&&typeof A[m]==='function')return A[m](...a)}catch(e){}return undefined};
  function envoyerTheme(){
    try{const cs=root.getComputedStyle(doc.documentElement),v=n=>(cs.getPropertyValue(n)||'').trim();
      const t={sombre:doc.documentElement.getAttribute('data-theme')!=='light',fond:v('--card'),texte:v('--txt'),secondaire:v('--dim'),
        action:v('--acc'),danger:v('--bad'),bord:v('--line')};
      pont('dialogueTheme',JSON.stringify(t))}catch(e){}
  }

  /* ---------- styles ---------- */
  function css(){if(doc.getElementById('mhdlgCss'))return;const s=doc.createElement('style');s.id='mhdlgCss';s.textContent=
    '.mhdlg-fond{position:fixed;left:0;right:0;top:0;height:var(--mhdlg-h,100%);z-index:1000;display:flex;align-items:flex-end;justify-content:center;'+
      'background:rgba(0,0,0,.55);box-sizing:border-box;padding:12px 0 0}'+
    '.mhdlg{box-sizing:border-box;width:100%;max-width:560px;max-height:100%;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--card);color:var(--txt);'+
      'border:1px solid var(--line);border-bottom:0;border-radius:18px 18px 0 0;padding:18px 16px calc(14px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.35);outline:none}'+
    '@media(min-width:600px){.mhdlg-fond{align-items:center;padding:16px}.mhdlg{border-radius:18px;border-bottom:1px solid var(--line)}}'+
    '.mhdlg h3{margin:0 0 8px;font-size:17px;line-height:1.3}'+
    '.mhdlg .mhdlg-msg{margin:0 0 12px;white-space:pre-line;overflow-wrap:anywhere;font-size:14.5px;line-height:1.45}'+
    '.mhdlg .mhdlg-details{display:block;margin:0 0 12px;padding:8px 10px;font:12px/1.4 ui-monospace,monospace;overflow-wrap:anywhere;white-space:pre-wrap;'+
      'user-select:text;-webkit-user-select:text;background:var(--bg);border:1px solid var(--line);border-radius:10px}'+
    '.mhdlg .mhdlg-champ{margin:0 0 10px}.mhdlg .mhdlg-champ label{display:block;margin:0 0 4px;font-size:12.5px;color:var(--dim);text-transform:none;letter-spacing:0}'+
    '.mhdlg input,.mhdlg textarea{box-sizing:border-box;width:100%;font-size:16px;background:var(--bg);color:var(--txt);border:1px solid var(--line);border-radius:10px;padding:11px 12px;font-family:inherit}'+
    '.mhdlg textarea{min-height:84px;resize:vertical}'+
    '.mhdlg input:focus,.mhdlg textarea:focus{outline:2px solid var(--acc);outline-offset:1px}'+
    '.mhdlg .mhdlg-err{color:var(--bad);font-size:13px;margin:2px 0 0}.mhdlg .mhdlg-err:empty{display:none}'+
    '.mhdlg .mhdlg-acts{display:flex;gap:10px;margin-top:14px}.mhdlg .mhdlg-acts button{flex:1 1 0;min-width:0;min-height:48px;font-size:15px;border-radius:12px}'+
    '.mhdlg .mhdlg-acts .mhdlg-annuler{background:transparent;border:1px solid var(--line);color:var(--txt)}'+
    '.mhdlg .mhdlg-acts .mhdlg-danger{background:var(--bad);color:#fff}'+
    '.mhdlg button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}';
    doc.head.appendChild(s)}

  /* ---------- clavier virtuel : la fenêtre reste au-dessus du clavier ---------- */
  function suivreClavier(fond){
    const vv=root.visualViewport;if(!vv)return ()=>{};
    const maj=()=>{fond.style.setProperty('--mhdlg-h',Math.round(vv.height+vv.offsetTop)+'px')};
    maj();vv.addEventListener('resize',maj);vv.addEventListener('scroll',maj);
    return ()=>{vv.removeEventListener('resize',maj);vv.removeEventListener('scroll',maj)};
  }

  /* ---------- construction ---------- */
  const el=(tag,cls,txt)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=String(txt);return e};
  function bouton(txt,cls,type){const b=el('button',cls,txt);b.type=type||'button';return b}
  function champ(c,id){
    const w=el('div','mhdlg-champ'),lab=el('label',null,c.libelle||'');lab.htmlFor=id;
    const i=c.multiligne?el('textarea'):el('input');i.id=id;i.name=c.nom||id;
    if(!c.multiligne)i.type=c.type||'text';
    i.value=c.valeur==null?'':String(c.valeur);
    if(c.placeholder)i.placeholder=c.placeholder;
    i.setAttribute('autocomplete',c.autocomplete||(c.type==='password'?'new-password':'off'));
    if(c.inputmode)i.setAttribute('inputmode',c.inputmode);
    i.setAttribute('enterkeyhint',c.enterkeyhint||'done');
    if(c.autocapitalize)i.setAttribute('autocapitalize',c.autocapitalize);
    if(c.type==='password'){i.setAttribute('autocapitalize','none');i.setAttribute('spellcheck','false')}
    if(c.requis)i.setAttribute('aria-required','true');
    if(c.libelle)w.appendChild(lab);else i.setAttribute('aria-label',c.ariaLabel||'Saisie');
    w.appendChild(i);return {w,i};
  }
  const focusables=n=>[...n.querySelectorAll('button,input,textarea,[href],[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.offsetParent!==null);

  /* ouvre une fenêtre ; resout(valeur) ferme et renvoie ; mode : info | confirmer | saisir */
  function ouvrir(o){
    return new Promise(resolve=>{
      css();const id='mhdlg'+(++seq),retourFocus=doc.activeElement;
      const fond=el('div','mhdlg-fond');fond.setAttribute('data-k','mh-dialogue-fond');
      const d=el('div','mhdlg');d.setAttribute('role',o.mode==='confirmer'&&o.danger?'alertdialog':'dialog');d.setAttribute('aria-modal','true');
      d.setAttribute('tabindex','-1');d.setAttribute('data-k','mh-dialogue');d.setAttribute('data-mode',o.mode);if(o.danger)d.setAttribute('data-danger','1');
      const form=el('form');form.setAttribute('novalidate','');form.addEventListener('submit',e=>{e.preventDefault();valider()});
      if(o.titre){const h=el('h3',null,o.titre);h.id=id+'-t';d.setAttribute('aria-labelledby',h.id);form.appendChild(h)}
      if(o.message){const p=el('p','mhdlg-msg',o.message);p.id=id+'-m';d.setAttribute('aria-describedby',p.id);form.appendChild(p)}
      if(o.details){const c=el('code','mhdlg-details',o.details);c.setAttribute('data-k','mh-dialogue-details');form.appendChild(c)}
      const champs=(o.champs||[]).map((c,k)=>Object.assign(champ(c,id+'-c'+k),{def:c}));champs.forEach(c=>form.appendChild(c.w));
      const err=el('p','mhdlg-err');err.setAttribute('role','alert');err.setAttribute('data-k','mh-dialogue-erreur');form.appendChild(err);
      const acts=el('div','mhdlg-acts');
      const bAnnuler=o.mode==='info'?null:bouton(o.annuler||'Annuler','mhdlg-annuler');
      const bOk=bouton(o.mode==='info'?(o.bouton||'OK'):(o.action||'Continuer'),o.danger?'mhdlg-danger':'mhdlg-ok','submit');
      if(bAnnuler){bAnnuler.setAttribute('data-k','mh-dialogue-annuler');acts.appendChild(bAnnuler)}
      bOk.setAttribute('data-k','mh-dialogue-ok');acts.appendChild(bOk);form.appendChild(acts);d.appendChild(form);fond.appendChild(d);
      let fini=false,stopClavier=()=>{};
      function fermer(v){if(fini)return;fini=true;stopClavier();doc.removeEventListener('keydown',clavier,true);
        fond.remove();ouverte=null;pont('dialogueEtat',false);
        try{if(retourFocus&&retourFocus.focus&&doc.contains(retourFocus))retourFocus.focus({preventScroll:true})}catch(e){}
        resolve(v)}
      function annuler(){fermer(o.mode==='info'?undefined:o.mode==='confirmer'?false:null)}
      function valider(){
        if(o.mode==='info')return fermer(undefined);
        if(o.mode==='confirmer')return fermer(true);
        const vals={};champs.forEach(c=>{vals[c.def.nom]=c.i.value});
        const manque=champs.find(c=>c.def.requis&&!String(c.i.value).trim());
        if(manque){err.textContent=(manque.def.libelle||'Ce champ')+' : obligatoire.';manque.i.focus();return}
        const e=o.valider?o.valider(o.mode==='saisir'?vals[champs[0].def.nom]:vals):null;
        if(e){err.textContent=String(e);return}
        fermer(o.mode==='saisir'?vals[champs[0].def.nom]:vals)}
      function clavier(e){
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();annuler();return}
        if(e.key==='Tab'){const f=focusables(d);if(!f.length)return;const i=f.indexOf(doc.activeElement);
          if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}
      }
      if(bAnnuler)bAnnuler.addEventListener('click',annuler);
      fond.addEventListener('click',e=>{if(e.target===fond&&(o.mode==='info'||o.mode==='confirmer'))annuler()});
      /* saisie : un appui hors de la fenêtre ne ferme rien et ne retire pas le focus du champ (le clavier reste ouvert) */
      fond.addEventListener('pointerdown',e=>{if(e.target===fond&&champs.length){e.preventDefault();const f=champs.find(c=>c.i===doc.activeElement)||champs[0];try{f.i.focus({preventScroll:true})}catch(x){}}});
      fond.addEventListener('mousedown',e=>{if(e.target===fond&&champs.length)e.preventDefault()});
      doc.addEventListener('keydown',clavier,true);
      doc.body.appendChild(fond);stopClavier=suivreClavier(fond);
      ouverte={annuler};pont('dialogueEtat',true);
      const premier=o.danger?bAnnuler:(champs[0]&&champs[0].i)||bOk;
      try{premier.focus({preventScroll:true});if(champs[0]&&premier===champs[0].i&&champs[0].i.select&&champs[0].i.value)champs[0].i.select()}catch(e){}
    });
  }
  /* file d'attente : une seule fenêtre à la fois */
  function enFile(o){const p=file.then(()=>ouvrir(o));file=p.catch(()=>{});return p}

  const natif={
    info:o=>{root.alert([o.titre,o.message,o.details].filter(Boolean).join('\n\n'))},
    confirmer:o=>root.confirm([o.titre,o.message].filter(Boolean).join('\n\n')),
    saisir:o=>root.prompt([o.titre,o.message].filter(Boolean).join('\n\n'),o.valeur||'')};
  const dispo=()=>!!(doc&&doc.body&&doc.createElement);

  const API={version:V,
    info(o){o=o||{};return dispo()?enFile(Object.assign({},o,{mode:'info'})):Promise.resolve(natif.info(o))},
    confirmer(o){o=o||{};return dispo()?enFile(Object.assign({},o,{mode:'confirmer'})):Promise.resolve(!!natif.confirmer(o))},
    saisir(o){o=o||{};if(!dispo())return Promise.resolve(natif.saisir(o));
      return enFile(Object.assign({},o,{mode:'saisir',champs:[{nom:'v',libelle:o.libelle,ariaLabel:o.titre,type:o.type,valeur:o.valeur,placeholder:o.placeholder,
        inputmode:o.inputmode,enterkeyhint:o.enterkeyhint,autocomplete:o.autocomplete,autocapitalize:o.autocapitalize,requis:!o.facultatif}]}))},
    formulaire(o){o=o||{};if(!dispo()){const r={};for(const c of o.champs||[]){const v=root.prompt(c.libelle||'',c.valeur||'');if(v==null)return Promise.resolve(null);r[c.nom]=v}return Promise.resolve(r)}
      return enFile(Object.assign({},o,{mode:'formulaire'}))},
    async exclusif(cle,fn){if(enCours.has(cle))return undefined;enCours.add(cle);try{return await fn()}finally{enCours.delete(cle)}},
    ouvert:()=>!!ouverte,
    retour(){if(!ouverte)return false;ouverte.annuler();return true},
    envoyerTheme};
  root.MHDialogue=API;

  /* thème transmis à Android au démarrage et à chaque changement (clair / sombre) */
  function initTheme(){envoyerTheme();try{new MutationObserver(()=>setTimeout(envoyerTheme,0)).observe(doc.documentElement,{attributes:true,attributeFilter:['data-theme','style']})}catch(e){}}
  if(doc){if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',initTheme,{once:true});else initTheme()}
})(window);
