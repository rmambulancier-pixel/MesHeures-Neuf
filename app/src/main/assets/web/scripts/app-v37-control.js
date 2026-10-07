/*
 * MesHeures V37.0-A — Smart Control explicable.
 *
 * Lecture seule. Ce module ne calcule ni TTE, ni amplitude, ni paie : il consomme les
 * résultats du moteur (cd() d'app-core.js) et les relevés ROMI1 (MH_ROMI.list()),
 * applique un registre de règles fixes et explique chaque résultat.
 * Il n'écrit jamais dans DB ni dans le stockage. Les corrections passent par les écrans métier.
 *
 * Accès aux données : DB est une variable globale déclarée par app-core.js (let) ; ce
 * script classique la lit directement. window.DB n'est volontairement pas exposé : cela
 * réactiverait des modules anciens qui écrivent dans DB (app-pay, app-reconciliation,
 * pont ROMI1).
 *
 * NIVEAUX
 *  🔴 Critique   : limite maximale dépassée (amplitude > 14 h, TTE > 12 h, semaine > 48 h,
 *                  moyenne > 46 h sur 12 semaines, repos entre services < 9 h), ou journée
 *                  passée sans début/fin (TTE et paie de la journée non calculables).
 *  🟠 À vérifier : seuil de vigilance franchi, justifiable (amplitude > 12 h, TTE > 10 h,
 *                  repos < 11 h, ≥ 6 h sans pause de 20 min), saisie incohérente signalée par
 *                  le moteur, ou écart avec la référence employeur ROMI1.
 *  🟢 OK         : contrôle évalué, aucune anomalie.
 *
 * SCORE = contrôles conformes / contrôles évalués (en %). Le niveau global est le pire niveau
 * rencontré, indépendamment du score. Aucun jour analysé : « Données insuffisantes ».
 */
(function(){
  'use strict';
  const V='37.0-A';
  const WINDOW_DAYS=28;
  const WORK=['T','NUIT'];
  const NB=' ';

  const LEVELS={
    bad:{rank:0,icon:'🔴',label:'Critique',reason:'Critique : une limite maximale est dépassée, ou une donnée manquante empêche le calcul.'},
    warn:{rank:1,icon:'🟠',label:'À vérifier',reason:'À vérifier : un seuil de vigilance est franchi ou une saisie paraît incohérente ; la situation peut être justifiée.'},
    ok:{rank:2,icon:'🟢',label:'OK',reason:'Contrôle conforme.'}
  };

  /* Registre des règles. Seuils fixes, en minutes. */
  const RULES={
    HORAIRES:{scope:'day',title:'Horaires incomplets',rule:'Une journée travaillée doit avoir un début et une fin pour calculer TTE, amplitude et paie.',source:'Saisie MesHeures'},
    AMPLITUDE:{scope:'day',title:'Amplitude',rule:'Amplitude : 12 h en principe ; jusqu’à 14 h dans les cas prévus. Au-delà de 14 h : critique.',source:'Accord transport sanitaire du 16/06/2016, art. 3',warn:720,bad:840},
    TTE:{scope:'day',title:'Temps de travail effectif',rule:'TTE quotidien : 10 h ; dépassement encadré jusqu’à 12 h. Au-delà de 12 h : critique.',source:'Accord transport sanitaire du 16/06/2016, art. 4',warn:600,bad:720},
    PAUSE:{scope:'day',title:'Pause insuffisante',rule:'Dès 6 h de travail effectif, une pause d’au moins 20 min est due.',source:'Code du travail, art. L3121-16',tte:360,pause:20},
    SAISIE:{scope:'day',title:'Saisie des pauses',rule:'Une pause doit être comprise dans le service, avoir une fin après son début et ne pas en chevaucher une autre.',source:'Moteur MesHeures (pauses déduites du TTE)'},
    REPAS:{scope:'day',title:'Repas hors plage',rule:'Un panier déclaré suppose un service couvrant une plage repas (11h00–14h30 ou 18h30–22h00).',source:'Règles repas MesHeures'},
    FERIE:{scope:'day',title:'Jour férié',rule:'Un jour férié travaillé ouvre droit à la majoration de 100 %, à cocher sur la journée.',source:'Règles paie MesHeures'},
    MOTEUR:{scope:'day',title:'Contrôle du moteur',rule:'Alerte émise par le moteur de calcul de la journée.',source:'Moteur MesHeures'},
    REPOS:{scope:'day',title:'Repos entre deux services',rule:'Repos quotidien : 11 h. En dessous de 9 h : critique.',source:'Code du travail, art. L3131-1 ; accord du 16/06/2016, art. 7',warn:660,bad:540},
    SEMAINE:{scope:'week',title:'Durée hebdomadaire',rule:'Le TTE d’une semaine (lundi → dimanche) ne doit pas dépasser 48 h.',source:'Accord transport sanitaire du 16/06/2016, art. 4',bad:2880},
    MOYENNE:{scope:'period',title:'Moyenne sur 12 semaines',rule:'La moyenne hebdomadaire de TTE sur 12 semaines consécutives ne doit pas dépasser 46 h.',source:'Accord transport sanitaire du 16/06/2016, art. 4',bad:2760},
    ROMI_TTE:{scope:'romi',title:'TTE ROMI1 / MesHeures',rule:'Le TTE du relevé ROMI1 (référence employeur) est comparé au TTE calculé par MesHeures sur exactement la même période. Écart toléré : 15 min.',source:'Relevé ROMI1 (référence employeur)',tol:15}
  };
  const DAY_FAMILIES=['HORAIRES','AMPLITUDE','TTE','PAUSE','SAISIE','REPAS','FERIE'];

  /* Alertes du moteur (cd(k).al) rattachées à une famille : une famille = un seul contrôle. */
  const ENGINE_MAP=[
    [/^Horaires incomplets/,'HORAIRES'],
    [/^Amplitude .*réglementaires/,'AMPLITUDE'],
    [/sans pause/,'PAUSE'],
    [/^TTE > /,'TTE'],
    [/^Pause .*(invalide|hors du service)|^Pauses qui se chevauchent/,'SAISIE'],
    [/^Repas déclaré/,'REPAS'],
    [/^Jour férié travaillé/,'FERIE']
  ];
  const engineFamily=m=>{for(const [rx,f] of ENGINE_MAP)if(rx.test(m))return f;return 'MOTEUR'};

  const hasDB=()=>typeof DB!=='undefined'&&DB&&DB.days&&typeof DB.days==='object';
  const fmt=m=>typeof F==='function'?F(Math.round(m)):Math.floor(m/60)+'h'+String(Math.round(m)%60).padStart(2,'0');
  const dShort=k=>k.slice(8)+'/'+k.slice(5,7);
  const dLong=k=>k.slice(8)+'/'+k.slice(5,7)+'/'+k.slice(0,4);
  const isWork=d=>!!d&&WORK.includes(d.t);
  const levelOf=(v,r)=>v>r.bad?'bad':v>r.warn?'warn':null;

  function dayData(k,d,r){
    const n=(Array.isArray(d.p)?d.p:[]).filter(p=>p&&(p.d||p.f)).length;
    return [['Début',d.deb||'—'],['Fin',d.fin||'—'],['Amplitude',fmt(r.amp)],['TTE',fmt(r.tte)],['Pauses déduites',fmt(r.pz)+' ('+n+' saisie'+(n>1?'s':'')+')']];
  }
  function mk(code,level,key,label,data,result,actions,extra){
    const R=RULES[code];
    return Object.assign({id:code+'|'+key,code,level,scope:R.scope,key,dateLabel:label,title:R.title,rule:R.rule,source:R.source,
      data,result,reason:LEVELS[level].reason,actions,engineMessages:[]},extra||{});
  }
  const actDay=k=>({label:'Ouvrir la journée du '+dShort(k),kind:'day',target:k});
  const actPeriod=k=>({label:'Ouvrir la période de paie',kind:'period',target:k});
  const actRomi=()=>({label:'Ouvrir ROMI1',kind:'romi',target:null});

  function weekStart(k){return typeof mono==='function'?mono(k):k}

  function analyze(opts){
    opts=opts||{};
    const end=opts.end||today();
    const start=addD(end,-(WINDOW_DAYS-1));
    const out={version:V,window:{start,end,days:WINDOW_DAYS},alerts:[],controls:0,failed:0,workedDays:0,notEvaluated:[]};
    if(!hasDB())return finish(out);
    const days=DB.days,now=today();

    /* 1. Journées travaillées de la fenêtre */
    const worked=[];
    for(let k=start;k<=end;k=addD(k,1)){
      const d=days[k];if(!isWork(d))continue;
      if(k===now&&d.running)continue; // service en cours : jugé une fois terminé
      worked.push(k);
    }
    out.workedDays=worked.length;
    const R={};worked.forEach(k=>{R[k]=cd(k)});

    worked.forEach(k=>{
      const d=days[k],r=R[k],data=dayData(k,d,r),fam={};
      const add=a=>{fam[a.code]=a};
      const complete=!!(d.deb&&d.fin);
      if(!complete){
        out.controls++;
        add(mk('HORAIRES',k<now?'bad':'warn',k,dLong(k),[['Début',d.deb||'manquant'],['Fin',d.fin||'manquante']],
          k<now?'Journée passée sans '+(!d.deb&&!d.fin?'horaires':(!d.deb?'début':'fin'))+' : TTE et paie de la journée non calculés.':'Journée du jour à compléter.',[actDay(k)]));
      }else{
        out.controls+=DAY_FAMILIES.length;
        const la=levelOf(r.amp,RULES.AMPLITUDE);
        if(la)add(mk('AMPLITUDE',la,k,dLong(k),data.concat([['Seuil',la==='bad'?'14h00 (maximum)':'12h00 (principe)']]),
          'Amplitude '+fmt(r.amp)+(la==='bad'?' : dépasse 14 h.':' : dépasse 12 h, motif d’extension à vérifier.'),[actDay(k)]));
        const lt=levelOf(r.tte,RULES.TTE);
        if(lt)add(mk('TTE',lt,k,dLong(k),data.concat([['Seuil',lt==='bad'?'12h00 (maximum)':'10h00']]),
          'TTE '+fmt(r.tte)+(lt==='bad'?' : dépasse 12 h.':' : dépasse 10 h, dépassement à justifier.'),[actDay(k)]));
        if(r.tte>=RULES.PAUSE.tte&&r.pz<RULES.PAUSE.pause)add(mk('PAUSE','warn',k,dLong(k),data.concat([['Seuil','20 min dès 6h00 de TTE']]),
          'TTE '+fmt(r.tte)+' avec '+fmt(r.pz)+' de pause déduite : seuil de contrôle atteint.',[actDay(k)]));
      }
      /* Alertes du moteur : rattachées à leur famille (jamais affichées deux fois), jamais masquées. */
      (Array.isArray(r.al)?r.al:[]).forEach(a=>{
        const m=String(a&&a.m||'');if(!m)return;
        const f=engineFamily(m);
        if(fam[f]){if(!fam[f].engineMessages.includes(m))fam[f].engineMessages.push(m);return}
        if(f==='HORAIRES')return; // déjà évalué ci-dessus à partir de deb/fin
        if(f==='MOTEUR')out.controls++;
        const x=mk(f,'warn',k,dLong(k),data,m,[actDay(k)]);x.engineMessages.push(m);add(x);
      });
      Object.values(fam).forEach(a=>out.alerts.push(a));
    });

    /* 2. Repos entre deux services sur deux jours consécutifs */
    worked.forEach(k=>{
      const p=addD(k,-1),dp=days[p],dk=days[k];
      if(!isWork(dp)||!dp.deb||!dp.fin||!dk.deb||!dk.fin)return;
      const rp=R[p]||cd(p),rk=R[k];
      if(rp.fin==null||rk.deb==null)return;
      out.controls++;
      const rest=1440+rk.deb-rp.fin;
      const lv=rest<RULES.REPOS.bad?'bad':rest<RULES.REPOS.warn?'warn':null;
      if(lv)out.alerts.push(mk('REPOS',lv,k,dLong(k),[['Fin du service du '+dShort(p),dp.fin],['Début du service du '+dShort(k),dk.deb],['Repos',fmt(rest)],['Seuil',lv==='bad'?'9h00 (minimum)':'11h00']],
        'Repos de '+fmt(rest)+' entre les deux services.',[actDay(k),actDay(p)]));
    });

    /* 3. Semaines (lundi → dimanche) touchant la fenêtre */
    const weeks=[];for(let w=weekStart(start);w<=end;w=addD(w,7))weeks.push(w);
    const weekTte=w=>{let s=0,n=0;for(let i=0;i<7;i++){const k=addD(w,i),d=days[k];if(!isWork(d))continue;if(k===now&&d.running)continue;s+=Number(cd(k).tte)||0;n++}return {s,n}};
    weeks.forEach(w=>{
      const {s,n}=weekTte(w);if(!n)return;
      out.controls++;
      if(s>RULES.SEMAINE.bad)out.alerts.push(mk('SEMAINE','bad',w,'Semaine du '+dShort(w)+' au '+dShort(addD(w,6)),
        [['TTE de la semaine',fmt(s)],['Journées travaillées',String(n)],['Seuil','48h00 (maximum)']],
        'TTE hebdomadaire de '+fmt(s)+' : dépasse 48 h de '+fmt(s-2880)+'.',[actPeriod(w)]));
    });

    /* 4. Moyenne sur 12 semaines : un seul contrôle, valeur maximale sur les fenêtres finissant dans la période */
    const firstWorked=Object.keys(days).filter(k=>isWork(days[k])).sort()[0];
    let worst=null;
    weeks.forEach(w=>{
      const w0=addD(w,-77);
      if(!firstWorked||firstWorked>w0)return; // moins de 12 semaines de données : non évalué
      let s=0;for(let i=0;i<12;i++)s+=weekTte(addD(w0,i*7)).s;
      const avg=s/12;if(!worst||avg>worst.avg)worst={w,w0,avg};
    });
    if(worst){
      out.controls++;
      if(worst.avg>RULES.MOYENNE.bad)out.alerts.push(mk('MOYENNE','bad',worst.w,'12 semaines du '+dShort(worst.w0)+' au '+dShort(addD(worst.w,6)),
        [['Moyenne hebdomadaire',fmt(worst.avg)],['Seuil','46h00 (maximum)']],'Moyenne de '+fmt(worst.avg)+' par semaine sur 12 semaines.',[actPeriod(worst.w)]));
    }else out.notEvaluated.push('Moyenne sur 12 semaines : moins de 12 semaines de données.');

    /* 5. ROMI1 : dernier relevé, comparé sur exactement la même période */
    try{
      const list=window.MH_ROMI&&typeof window.MH_ROMI.list==='function'?window.MH_ROMI.list().filter(Boolean):[];
      const last=list.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x.periodStart||''))&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.periodEnd||'')))
        .sort((a,b)=>String(b.periodEnd).localeCompare(String(a.periodEnd)))[0];
      if(last&&Number.isFinite(Number(last.ttePeriodH))){
        let s=0,n=0;for(let k=last.periodStart;k<=last.periodEnd;k=addD(k,1)){if(!isWork(days[k]))continue;s+=Number(cd(k).tte)||0;n++}
        if(!n)out.notEvaluated.push('ROMI1 '+dShort(last.periodStart)+' → '+dShort(last.periodEnd)+' : aucune journée saisie dans MesHeures sur cette période.');
        else{
          out.controls++;
          const ref=Math.round(Number(last.ttePeriodH)*60),diff=s-ref;
          if(Math.abs(diff)>RULES.ROMI_TTE.tol)out.alerts.push(mk('ROMI_TTE','warn',last.periodEnd,'ROMI1 du '+dShort(last.periodStart)+' au '+dShort(last.periodEnd),
            [['TTE ROMI1 (employeur)',fmt(ref)+' ('+Number(last.ttePeriodH).toFixed(2).replace('.',',')+' h)'],['TTE MesHeures (calcul)',fmt(s)],['Écart MesHeures − ROMI1',(diff>0?'+':'−')+fmt(Math.abs(diff))],['Journées saisies',String(n)]],
            'Écart de '+fmt(Math.abs(diff))+' entre le calcul MesHeures et la référence employeur.',[actRomi()]));
        }
      }
    }catch(e){out.notEvaluated.push('ROMI1 : relevés illisibles.')}

    return finish(out);
  }

  function finish(out){
    out.alerts.sort((a,b)=>LEVELS[a.level].rank-LEVELS[b.level].rank||(a.key<b.key?1:a.key>b.key?-1:0)||a.code.localeCompare(b.code));
    out.failed=out.alerts.length;
    const bad=out.alerts.filter(a=>a.level==='bad').length,warn=out.failed-bad,ok=Math.max(0,out.controls-out.failed);
    out.counts={bad,warn,ok,total:out.controls};
    if(!out.workedDays){
      out.status='insufficient';out.score=null;out.label='Données insuffisantes';out.icon='◌';
      out.explanation='Aucune journée travaillée dans les '+WINDOW_DAYS+' derniers jours : rien à analyser.';
    }else{
      out.status=bad?'bad':warn?'warn':'ok';
      out.label={bad:'Contrôle prioritaire',warn:'Points à vérifier',ok:'Dossier maîtrisé'}[out.status];
      out.icon=LEVELS[out.status].icon;
      out.score=out.controls?Math.round(100*ok/out.controls):null;
      out.explanation='Score = contrôles conformes / contrôles évalués = '+ok+'/'+out.controls+' ('+out.workedDays+' journée'+(out.workedDays>1?'s':'')+' travaillée'+(out.workedDays>1?'s':'')+' du '+dShort(out.window.start)+' au '+dShort(out.window.end)+'). Le niveau affiché est celui de l’anomalie la plus grave.';
    }
    /* Regroupement par date pour l'affichage : un jour = une carte, ses contrôles en anomalie dessous. */
    const g=new Map();
    out.alerts.forEach(a=>{const k=a.scope+'|'+a.key;if(!g.has(k))g.set(k,{key:a.key,scope:a.scope,label:a.dateLabel,level:a.level,alerts:[]});const x=g.get(k);x.alerts.push(a);if(LEVELS[a.level].rank<LEVELS[x.level].rank)x.level=a.level});
    out.groups=[...g.values()].sort((a,b)=>LEVELS[a.level].rank-LEVELS[b.level].rank||(a.key<b.key?1:a.key>b.key?-1:0));
    const first=out.groups[0];
    out.next=first?{level:first.level,title:'Contrôler '+(first.scope==='day'?'le '+dShort(first.key):first.label.charAt(0).toLowerCase()+first.label.slice(1)),
      text:first.alerts.map(a=>a.title).join(' · '),action:first.alerts[0].actions[0]}:null;
    return out;
  }

  /* Navigation : passe par les écrans existants, sans écrire soi-même dans DB. */
  function open(kind,target){
    try{
      if(kind==='day'&&typeof mhOpenDay==='function')return mhOpenDay(target);
      if(kind==='romi')return tab('romi');
      if(kind==='paie')return tab('paie');
      if(kind==='period'){
        tab('paie');
        const q=mhQuatorzaine.start(target);
        const el=document.getElementById('pS');
        if(el&&el.value!==q){el.value=q;el.dispatchEvent(new Event('change'))} // écriture faite par l'écran Paie (onchange)
      }
    }catch(e){console.warn('Smart Control : navigation impossible',e)}
  }

  /* Rendu de la carte d'Accueil (design MesHeures : mh31-card, mh31-counts, mh31-row). */
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tone=l=>l==='bad'?'bad':l==='warn'?'warn':'ok';
  const call=a=>"MHControl.open('"+a.kind+"',"+(a.target==null?'null':"'"+esc(a.target)+"'")+")";
  function detail(a){
    return '<div class="mh37-item" data-tone="'+tone(a.level)+'">'+
      '<div class="mh37-k"><span>'+LEVELS[a.level].icon+' '+esc(a.title)+'</span><em>'+LEVELS[a.level].label+'</em></div>'+
      '<dl><dt>Date</dt><dd>'+esc(a.dateLabel)+'</dd>'+
      '<dt>Règle</dt><dd>'+esc(a.rule)+'<small>'+esc(a.source)+'</small></dd>'+
      '<dt>Données</dt><dd>'+a.data.map(([l,v])=>'<span>'+esc(l)+' : <b>'+esc(v)+'</b></span>').join('')+'</dd>'+
      '<dt>Résultat</dt><dd>'+esc(a.result)+(a.engineMessages.length&&!(a.engineMessages.length===1&&a.engineMessages[0]===a.result)?'<small>Aussi signalé par le moteur : '+a.engineMessages.map(esc).join(' · ')+'</small>':'')+'</dd>'+
      '<dt>Classement</dt><dd>'+esc(a.reason)+'</dd></dl>'+
      '<div class="mh37-acts">'+a.actions.map(x=>'<button class="mh31-mini" onclick="'+call(x)+'">→ '+esc(x.label)+'</button>').join('')+'</div></div>';
  }
  function groupRow(gp){
    const titles=gp.alerts.map(a=>a.title).join(' · ');
    return '<details class="mh37-g" data-tone="'+tone(gp.level)+'"><summary class="mh31-row" data-tone="'+tone(gp.level)+'"><i>'+LEVELS[gp.level].icon+'</i>'+
      '<div><b>'+esc(gp.label)+'</b><small>'+esc(titles)+'</small></div><em>›</em></summary>'+gp.alerts.map(detail).join('')+'</details>';
  }
  function cardHtml(s,extraRows){
    const count=(t,n,l)=>'<div class="mh31-count" data-tone="'+t+'"><strong>'+n+'</strong><span>'+l+'</span></div>';
    const head='<div class="mh31-card-head"><div><span class="mh31-eyebrow">SMART CONTROL · '+WINDOW_DAYS+' DERNIERS JOURS</span><b>'+esc(s.icon+' '+s.label)+'</b></div>'+
      '<strong class="mh31-badge" data-tone="'+(s.status==='insufficient'?'mut':tone(s.status))+'">'+(s.score==null?'—':s.score+'%')+'</strong></div>';
    if(s.status==='insufficient')
      return '<div class="mh31-card mh37-card" data-mh37="insufficient">'+head+'<div class="mh31-note">'+esc(s.explanation)+'</div>'+(extraRows||'')+'</div>';
    const bad=s.groups.filter(g=>g.level==='bad'),warn=s.groups.filter(g=>g.level==='warn');
    const section=(lst,title)=>lst.length?'<div class="mh37-sec">'+title+'</div>'+lst.slice(0,3).map(groupRow).join('')+
      (lst.length>3?'<details class="mh37-more"><summary>'+(lst.length-3>1?'Voir les '+(lst.length-3)+' autres':'Voir l’autre point')+' ›</summary>'+lst.slice(3).map(groupRow).join('')+'</details>':''):'';
    return '<div class="mh31-card mh37-card" data-mh37="'+s.status+'">'+head+
      '<div class="mh31-counts">'+count('bad',s.counts.bad,'critique'+(s.counts.bad>1?'s':''))+count('warn',s.counts.warn,'à vérifier')+count('ok',s.counts.ok,'contrôles OK')+'</div>'+
      '<div class="mh31-note">'+esc(s.explanation)+'</div>'+
      section(bad,'🔴 Critiques')+section(warn,'🟠 À vérifier')+
      (s.notEvaluated.length?'<div class="mh31-note">Non évalué : '+s.notEvaluated.map(esc).join(' · ')+'</div>':'')+
      (extraRows||'')+'</div>';
  }

  window.MHControl={version:V,LEVELS,RULES,WINDOW_DAYS,analyze,open,cardHtml};
})();
