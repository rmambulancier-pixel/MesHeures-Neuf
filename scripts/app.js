(() => {
'use strict';
const KEY='mesheures_neuf_data';
const $=id=>document.getElementById(id);
const DEFAULT={s:{nom:'',emb:'',taux:14.02,net:.787,base:35,maxAmp:14},days:{},cmp:{},periods:{},bul:{},bulletins:{},romi:{},per:{},exp:{}};
let DB=load(), currentDate=today(), currentMonth=today().slice(0,7);

function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){try{const raw=localStorage.getItem(KEY);return raw?normalize(JSON.parse(raw)):clone(DEFAULT)}catch(e){return clone(DEFAULT)}}
function normalize(x){const d=clone(DEFAULT);if(x&&typeof x==='object'){Object.assign(d,x);d.s={...DEFAULT.s,...(x.s||{})};d.days=x.days||{};['cmp','periods','bul','bulletins','romi','per','exp'].forEach(k=>d[k]=x[k]||{})}return d}
function save(){localStorage.setItem(KEY,JSON.stringify(DB));renderAll()}
function today(){return new Date().toISOString().slice(0,10)}
function pad(n){return String(n).padStart(2,'0')}
function addDays(k,n){const d=new Date(k+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function monthAdd(m,n){const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)}
function mins(t){if(!t||!t.includes(':'))return 0;const [h,m]=t.split(':').map(Number);return h*60+m}
function dur(a,b){let x=mins(b)-mins(a);if(x<0)x+=1440;return x}
function fmt(m){m=Math.max(0,Math.round(Number(m)||0));return Math.floor(m/60)+'h'+pad(m%60)}
function euro(v){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v)||0)}
function dayObj(k){return DB.days[k]||{t:'R',p:[]}}
function workMinutes(d){if(!d||d.t!=='T'||!d.deb||!d.fin)return 0;let m=dur(d.deb,d.fin);for(const p of (d.p||[]))m-=dur(p.d,p.f);return Math.max(0,m)}
function amplitude(d){return d&&d.deb&&d.fin?dur(d.deb,d.fin):0}
function pauseMinutes(d){return (d?.p||[]).reduce((s,p)=>s+dur(p.d,p.f),0)}
function isWork(d){return d&&d.t==='T'&&workMinutes(d)>0}
function periodStats(from,to){const out={minutes:0,days:0,weeks:{},ot25:0,ot50:0};for(const [k,d] of Object.entries(DB.days)){if((from&&k<from)||(to&&k>to)||!isWork(d))continue;const m=workMinutes(d);out.minutes+=m;out.days++;const dt=new Date(k+'T12:00:00');const mon=new Date(dt);const wd=(dt.getDay()+6)%7;mon.setDate(dt.getDate()-wd);const wk=mon.toISOString().slice(0,10);out.weeks[wk]=(out.weeks[wk]||0)+m}
const base=(Number(DB.s.base)||35)*60;for(const w of Object.values(out.weeks)){let ot=Math.max(0,w-base);const a=Math.min(ot,8*60);out.ot25+=a;out.ot50+=Math.max(0,ot-a)}return out}
function gross(stats){const r=Number(DB.s.taux)||0;const normal=Math.max(0,stats.minutes-stats.ot25-stats.ot50);return normal/60*r+stats.ot25/60*r*1.25+stats.ot50/60*r*1.5}
function showToast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>t.classList.remove('show'),2300)}
function nav(name){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===name&&b.closest('.bottom-nav')));if(name==='day')renderDay();if(name==='month')renderMonth();if(name==='pay')renderPay();if(name==='audit')renderAudit();if(name==='settings')renderSettings();window.scrollTo({top:0,behavior:'smooth'})}
document.addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(b)nav(b.dataset.nav)})

function renderHome(){
 const d=dayObj(today()), all=periodStats();
 $('hello').textContent=DB.s.nom?`Bonjour ${DB.s.nom.split(/\s+/)[0]} 👋`:'Bonjour 👋';
 $('todayLabel').textContent=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(today()+'T12:00:00'));
 const titles={T:'Service travaillé',CP:'Congés payés',RC:'Repos compensateur',ABS:'Absence',R:'Repos'};
 $('homeDayTitle').textContent=titles[d.t]||'À organiser';
 $('homeDayTte').textContent=isWork(d)?fmt(workMinutes(d)):'—';
 $('homeDayText').textContent=isWork(d)?`Amplitude ${fmt(amplitude(d))} · pauses ${fmt(pauseMinutes(d))}`:'Choisis ton type de journée puis saisis tes horaires.';
 $('metricTte').textContent=fmt(all.minutes);$('metricDays').textContent=all.days+' jour'+(all.days>1?'s':'')+' travaillé'+(all.days>1?'s':'');
 $('metricOvertime').textContent=fmt(all.ot25+all.ot50);$('metricGross').textContent=euro(gross(all));
 const issues=auditIssues();$('homeAlerts').innerHTML=issues.length?issues.slice(0,4).map(i=>`<div class="alert"><span class="dot ${i.level}"></span><div><b>${esc(i.title)}</b><small>${esc(i.text)}</small></div></div>`).join(''):`<div class="alert"><span class="dot"></span><div><b>Rien de critique détecté</b><small>Continue à saisir tes journées pour garder ton suivi à jour.</small></div></div>`;
}
function renderDay(){
 const d=dayObj(currentDate), dt=new Date(currentDate+'T12:00:00');
 $('dayDate').textContent=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(dt);
 $('dayMeta').textContent=currentDate;
 document.querySelectorAll('#dayTypes button').forEach(b=>b.classList.toggle('active',b.dataset.type===d.t));
 $('dayStart').value=d.deb||'';$('dayEnd').value=d.fin||'';$('dayNote').value=d.note||'';$('dayHoliday').checked=!!d.fer;
 $('workCard').style.display=d.t==='T'?'block':'none';renderPauses(d.p||[]);renderDayCalc()
}
function renderPauses(list){
 $('pauseList').innerHTML=list.map((p,i)=>`<div class="pause-row"><label>Début<input type="time" data-pause="${i}" data-field="d" value="${p.d||''}"></label><label>Fin<input type="time" data-pause="${i}" data-field="f" value="${p.f||''}"></label><button data-remove-pause="${i}" title="Supprimer">×</button></div>`).join('')||'<p class="muted tiny">Aucune pause saisie.</p>';
}
function readDayForm(){
 const old=dayObj(currentDate);const t=document.querySelector('#dayTypes button.active')?.dataset.type||old.t||'R';
 const p=[...$('pauseList').querySelectorAll('.pause-row')].map(row=>({d:row.querySelector('[data-field="d"]').value,f:row.querySelector('[data-field="f"]').value,ty:'ENT'})).filter(x=>x.d&&x.f);
 return {...old,t,p,deb:$('dayStart').value||'',fin:$('dayEnd').value||'',note:$('dayNote').value||'',fer:$('dayHoliday').checked}
}
function renderDayCalc(){const d=readDayForm();$('dayTte').textContent=fmt(workMinutes(d));$('dayAmplitude').textContent=fmt(amplitude(d));$('dayPauses').textContent=fmt(pauseMinutes(d));$('dayEffective').textContent=fmt(workMinutes(d))}
function renderMonth(){
 $('monthTitle').textContent=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(currentMonth+'-01T12:00:00'));
 const first=new Date(currentMonth+'-01T12:00:00'), offset=(first.getDay()+6)%7, y=first.getFullYear(), m=first.getMonth(), last=new Date(y,m+1,0).getDate();
 let html='';for(let i=0;i<offset;i++)html+='<div class="cal-day out"></div>';
 for(let n=1;n<=last;n++){const k=`${y}-${pad(m+1)}-${pad(n)}`,d=dayObj(k), w=workMinutes(d);html+=`<button class="cal-day ${DB.days[k]?'has':''} ${k===today()?'today':''}" data-cal="${k}"><b>${n}</b><small>${w?fmt(w):(d.t&&d.t!=='R'?d.t:'')}</small></button>`}
 $('calendar').innerHTML=html;
 const st=periodStats(currentMonth+'-01',`${y}-${pad(m+1)}-${pad(last)}`);$('monthTte').textContent=fmt(st.minutes);$('monthWorkDays').textContent=st.days;$('monthGross').textContent=euro(gross(st));
}
function renderPay(){
 const st=periodStats();const g=gross(st), net=g*(Number(DB.s.net)||0);
 $('payPeriodLabel').textContent=st.days?`${st.days} jours travaillés enregistrés`:'Aucune journée travaillée enregistrée';
 $('payGross').textContent=euro(g);$('payNetHint').textContent='Net estimé : '+euro(net);
 $('payBreakdown').innerHTML=`<div class="summary-row"><span>Temps total travaillé</span><strong>${fmt(st.minutes)}</strong></div><div class="summary-row"><span>Heures supplémentaires à +25 %</span><strong>${fmt(st.ot25)}</strong></div><div class="summary-row"><span>Heures supplémentaires à +50 %</span><strong>${fmt(st.ot50)}</strong></div><div class="summary-row accent"><span>Total brut estimé</span><strong>${euro(g)}</strong></div>`;
 $('payRate').textContent=(Number(DB.s.taux)||0).toFixed(2).replace('.',',')+' € / h';$('payBase').textContent=(Number(DB.s.base)||35)+' h / semaine';$('payNet').textContent=((Number(DB.s.net)||0)*100).toFixed(1)+' %';
}
function auditIssues(){
 const out=[], max=(Number(DB.s.maxAmp)||14)*60;
 for(const [k,d] of Object.entries(DB.days).sort()){if(d.t==='T'){const amp=amplitude(d),w=workMinutes(d),p=pauseMinutes(d);if(!d.deb||!d.fin)out.push({level:'bad',title:`${k} · horaires incomplets`,text:'Une journée travaillée n’a pas de début ou de fin.'});else if(w<=0)out.push({level:'bad',title:`${k} · durée invalide`,text:'Le temps effectif est nul ou négatif.'});if(amp>max)out.push({level:'warn',title:`${k} · amplitude élevée`,text:`${fmt(amp)} dépasse ta limite réglée de ${fmt(max)}.`});if(amp>=9*60&&p===0)out.push({level:'warn',title:`${k} · aucune pause`,text:'Une longue amplitude est enregistrée sans pause saisie.'})}}
 return out
}
function renderAudit(){const issues=auditIssues(), score=issues.filter(x=>x.level==='bad').length*2+issues.filter(x=>x.level==='warn').length;$('auditScore').textContent=score===0?'OK':score;$('auditScoreText').textContent=score===0?'Aucune anomalie détectée.':'Plus le score est élevé, plus il faut vérifier tes saisies.';$('auditList').innerHTML=issues.length?issues.map(i=>`<div class="alert"><span class="dot ${i.level}"></span><div><b>${esc(i.title)}</b><small>${esc(i.text)}</small></div></div>`).join(''):`<div class="alert"><span class="dot"></span><div><b>Audit propre</b><small>Aucune anomalie détectée avec les contrôles actuels.</small></div></div>`}
function renderSettings(){const s=DB.s;$('setName').value=s.nom||'';$('setEmb').value=s.emb||'';$('setRate').value=s.taux??14.02;$('setBase').value=s.base??35;$('setNet').value=s.net??.787;$('setMaxAmp').value=s.maxAmp??14;$('backupInfo').textContent=`${Object.keys(DB.days||{}).length} journées actuellement en mémoire. Export JSON compatible avec la structure de ta sauvegarde.`}
function renderAll(){renderHome();if($('view-day').classList.contains('active'))renderDay();if($('view-month').classList.contains('active'))renderMonth();if($('view-pay').classList.contains('active'))renderPay();if($('view-audit').classList.contains('active'))renderAudit();if($('view-settings').classList.contains('active'))renderSettings()}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

$('dayTypes').addEventListener('click',e=>{const b=e.target.closest('button[data-type]');if(!b)return;document.querySelectorAll('#dayTypes button').forEach(x=>x.classList.toggle('active',x===b));$('workCard').style.display=b.dataset.type==='T'?'block':'none';renderDayCalc()});
$('addPause').onclick=()=>{const d=readDayForm();d.p.push({d:'',f:'',ty:'ENT'});renderPauses(d.p)};
$('pauseList').addEventListener('click',e=>{const b=e.target.closest('[data-remove-pause]');if(!b)return;const d=readDayForm();d.p.splice(Number(b.dataset.removePause),1);renderPauses(d.p);renderDayCalc()});
$('workCard').addEventListener('input',renderDayCalc);
$('saveDay').onclick=()=>{DB.days[currentDate]=readDayForm();save();showToast('Journée enregistrée ✓')};
$('prevDay').onclick=()=>{currentDate=addDays(currentDate,-1);renderDay()};$('nextDay').onclick=()=>{currentDate=addDays(currentDate,1);renderDay()};$('dayToday').onclick=()=>{currentDate=today();renderDay()};
$('quickToday').onclick=$('homeToday').onclick=$('openToday').onclick=()=>{currentDate=today();nav('day')};
$('copyYesterday').onclick=()=>{const y=DB.days[addDays(today(),-1)];if(!y){showToast('Aucune journée à copier hier');return}DB.days[today()]=clone(y);save();showToast('La veille a été copiée sur aujourd’hui')};
$('prevMonth').onclick=()=>{currentMonth=monthAdd(currentMonth,-1);renderMonth()};$('nextMonth').onclick=()=>{currentMonth=monthAdd(currentMonth,1);renderMonth()};
$('calendar').addEventListener('click',e=>{const b=e.target.closest('[data-cal]');if(!b)return;currentDate=b.dataset.cal;nav('day')});
$('saveSettings').onclick=()=>{DB.s={...DB.s,nom:$('setName').value.trim(),emb:$('setEmb').value,taux:Number($('setRate').value)||0,base:Number($('setBase').value)||35,net:Number($('setNet').value)||0,maxAmp:Number($('setMaxAmp').value)||14};save();showToast('Réglages enregistrés ✓')};
function exportBackup(){const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mesheures-'+today()+'.json';a.click();URL.revokeObjectURL(url);showToast('Sauvegarde exportée ✓')}
$('exportBackup').onclick=$('exportQuick').onclick=exportBackup;
$('importBackup').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x||typeof x!=='object'||!x.days||!x.s)throw Error('Structure invalide');DB=normalize(x);localStorage.setItem(KEY,JSON.stringify(DB));renderAll();showToast('Sauvegarde importée sans transformation ✓')}catch(err){showToast('Import impossible : JSON invalide')}};r.readAsText(f);e.target.value=''});
$('resetApp').onclick=()=>{if(confirm('Réinitialiser l’application ? Ta sauvegarde exportée ne sera pas supprimée.')){DB=clone(DEFAULT);save();showToast('Application réinitialisée')}};
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
renderAll();
})();