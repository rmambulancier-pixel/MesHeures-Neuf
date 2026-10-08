/* MesHeures Paie — Paie / Quatorzaines
 * Correctif autonome chargé après app.js.
 *
 * - 2 ou 3 quatorzaines, jamais 1
 * - synchronisation réelle du champ NB DE QUATORZAINES
 * - détail Q1/Q2/Q3
 * - navigation cohérente avec le nombre de quatorzaines
 * - contrôle automatique de cohérence de période
 * - détail transparent du brut estimé
 * - résumé copiable
 * - version d’interface synchronisée avec le socle actuel
 *
 * Aucun changement du moteur calcPer().
 */
(function () {
  'use strict';

  const MIN_Q = 2, MAX_Q = 3;

  function ensurePeriod() {
    if (!window.DB) return null;
    if (!DB.per) DB.per = {start:'2025-05-19', nb:MIN_Q};
    let n = Number(DB.per.nb);
    if (!Number.isFinite(n)) n = MIN_Q;
    n = Math.max(MIN_Q, Math.min(MAX_Q, Math.round(n)));
    DB.per.nb = n;
    return DB.per;
  }

  function qParts(start, nb) {
    const out = [];
    for (let i = 0; i < nb; i++) {
      const s = addD(start, i * 14);
      const e = addD(s, 13);
      out.push({n:i+1, start:s, end:e});
    }
    return out;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;')
      .replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function syncVersion() {
    document.title = document.title.replace(/V16\.1(?:\.0)?|V16\.2(?:\.0)?|V17(?:\.0\.1)?/g, 'V30.2.3');
    const meta = document.querySelector('meta[name="application-version"]');
    if (meta) meta.setAttribute('content','37.2.0');

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      if (/V16\.1\.0|V16\.2\.0/.test(n.nodeValue || '')) {
        n.nodeValue = n.nodeValue
          .replace(/V16\.1\.0/g,'V30.2.3')
          .replace(/V16\.2\.0/g,'V30.2.3');
      }
    });
  }

  function updatePeriodLabel() {
    const p = ensurePeriod();
    if (!p) return;
    const input = document.getElementById('pN');
    const label = document.getElementById('pLbl');

    if (input) {
      input.type = 'number';
      input.min = String(MIN_Q);
      input.max = String(MAX_Q);
      input.step = '1';
      input.inputMode = 'numeric';
      if (document.activeElement !== input) input.value = String(p.nb);
      input.title = 'Une période de paie couvre 2 ou 3 quatorzaines.';
    }

    if (label && p.start) {
      label.textContent = short(p.start) + ' → ' +
        short(addD(p.start, p.nb * 14 - 1));
    }
  }

  function setQuatorzaines(value) {
    const p = ensurePeriod();
    if (!p) return;
    let n = Number(value);
    if (!Number.isFinite(n)) n = MIN_Q;
    n = Math.max(MIN_Q, Math.min(MAX_Q, Math.round(n)));
    p.nb = n;
    if (typeof save === 'function') save();
    updatePeriodLabel();
    if (typeof mhRefresh === 'function') mhRefresh('pay-period-change');
    setTimeout(renderProPanel, 0);
  }

  window.mhSetQuatorzaines = setQuatorzaines;

  function insertAfter(anchor, node) {
    if (!anchor || !anchor.parentNode) return false;
    anchor.parentNode.insertBefore(node, anchor.nextSibling);
    return true;
  }

  function money(n) {
    return typeof n === 'number' && Number.isFinite(n)
      ? n.toFixed(2).replace('.', ',') + ' €'
      : '—';
  }

  function hours(min) {
    if (!Number.isFinite(min)) return '—';
    min = Math.round(min);
    return Math.floor(min / 60) + 'h' + String(Math.abs(min % 60)).padStart(2,'0');
  }

  function renderProPanel() {
    const p = ensurePeriod();
    if (!p || !p.start || typeof calcPer !== 'function') return;

    updatePeriodLabel();

    let panel = document.getElementById('mh-v163-pro');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'mh-v163-pro';
      panel.className = 'card';
      const anchor = document.getElementById('pAlign') ||
                     document.getElementById('pKpi') ||
                     document.getElementById('pLbl');
      if (!insertAfter(anchor, panel)) return;
    }

    const result = calcPer(p.start, p.nb);
    const Q = result.Q || [];
    const G = result.G || {};

    const parts = qParts(p.start, p.nb);
    let rows = '';
    parts.forEach((part, i) => {
      const q = Q[i] || {};
      rows += `
        <div style="border:1px solid var(--line);border-radius:12px;padding:11px;margin:7px 0;background:#0d1117">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
            <b style="color:var(--ok)">Q${part.n}</b>
            <span>${short(part.start)} → ${short(part.end)}</span>
          </div>
          <div class="kpis" style="margin-top:8px">
            <div class="kpi"><b>${hours(q.tte || 0)}</b><span>TTE</span></div>
            <div class="kpi"><b>${hours(q.seuil || 0)}</b><span>Seuil HS</span></div>
            <div class="kpi ${q.h25 ? 'warn':''}"><b>${hours(q.h25 || 0)}</b><span>HS 25 %</span></div>
            <div class="kpi ${q.h50 ? 'bad':''}"><b>${hours(q.h50 || 0)}</b><span>HS 50 %</span></div>
          </div>
        </div>`;
    });

    const alerts = result.AL || [];
    const critical = alerts.filter(a => a.lvl === 'b').length;
    const warnings = alerts.filter(a => a.lvl === 'w').length;

    let gross = null;
    try {
      if (typeof brutOf === 'function') gross = brutOf(G);
    } catch (_) {}

    const detail = gross && Array.isArray(gross.L)
      ? gross.L.map(x => `
          <tr>
            <td>${esc(x[0])}</td>
            <td class="n">${esc(x[1])}</td>
            <td class="n">${esc(x[3] != null ? money(x[3]) : '—')}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" class="mut">Détail indisponible.</td></tr>';

    panel.innerHTML = `
      <h2>🧭 Contrôle paie · Paie</h2>

      <div class="al k">
        ✅ <b>${p.nb} quatorzaines</b> · ${short(p.start)} →
        ${short(addD(p.start, p.nb * 14 - 1))}
      </div>

      <div class="mut" style="margin:7px 0 10px">
        Chaque quatorzaine est calculée séparément. Le total de période est ensuite
        additionné. Le moteur historique <b>calcPer()</b> reste inchangé.
      </div>

      ${rows}

      <div class="kpis" style="margin-top:10px">
        <div class="kpi"><b>${hours(G.tte || 0)}</b><span>TTE période</span></div>
        <div class="kpi ${G.h25 ? 'warn':''}"><b>${hours(G.h25 || 0)}</b><span>HS 25 %</span></div>
        <div class="kpi ${G.h50 ? 'bad':''}"><b>${hours(G.h50 || 0)}</b><span>HS 50 %</span></div>
        <div class="kpi"><b>${G.trav || 0}</b><span>Jours travaillés</span></div>
      </div>

      <div style="margin-top:11px">
        <button class="g" id="mhCopyPaySummary" style="width:100%">
          📋 Copier le résumé de la période
        </button>
      </div>

      <details style="margin-top:10px">
        <summary style="cursor:pointer;font-weight:700">💰 Détail du brut estimé</summary>
        <div style="overflow:auto;margin-top:8px">
          <table>
            <tr><th>Élément</th><th class="n">Base</th><th class="n">Montant</th></tr>
            ${detail}
            ${gross ? `<tr class="t">
              <td>TOTAL BRUT ESTIMÉ</td><td></td>
              <td class="n">${money(gross.tot)}</td>
            </tr>` : ''}
          </table>
        </div>
      </details>

      <div style="margin-top:10px">
        ${critical
          ? `<div class="al b">🚨 ${critical} anomalie(s) critique(s) sur la période.</div>`
          : `<div class="al k">✅ Aucune anomalie critique.</div>`}
        ${warnings
          ? `<div class="al w">⚠️ ${warnings} avertissement(s) à vérifier.</div>`
          : ''}
      </div>
    `;

    const copy = document.getElementById('mhCopyPaySummary');
    if (copy && !copy.dataset.bound) {
      copy.dataset.bound = '1';
      copy.addEventListener('click', async () => {
        const lines = [
          'MesHeures — résumé paie',
          `Période : ${short(p.start)} → ${short(addD(p.start,p.nb*14-1))}`,
          `Quatorzaines : ${p.nb}`,
          ...parts.map((x,i) => {
            const q=Q[i]||{};
            return `Q${x.n} ${short(x.start)}→${short(x.end)} : TTE ${hours(q.tte||0)}, HS25 ${hours(q.h25||0)}, HS50 ${hours(q.h50||0)}`;
          }),
          `TTE total : ${hours(G.tte||0)}`,
          `HS25 total : ${hours(G.h25||0)}`,
          `HS50 total : ${hours(G.h50||0)}`,
          gross ? `Brut estimé : ${money(gross.tot)}` : ''
        ].filter(Boolean).join('\\n');

        try {
          await navigator.clipboard.writeText(lines);
          copy.textContent = '✅ Résumé copié';
          setTimeout(() => copy.textContent = '📋 Copier le résumé de la période', 1800);
        } catch (_) {
          window.prompt('Copie ce résumé :', lines);
        }
      });
    }
  }

  function bindInput() {
    const input = document.getElementById('pN');
    if (!input || input.dataset.mhV163Bound) return;
    input.dataset.mhV163Bound = '1';
    ['input','change','blur'].forEach(evt => {
      input.addEventListener(evt, () => setQuatorzaines(input.value));
    });
  }

  function wrapRenderPay() {
    if (typeof window.renderPay !== 'function' || window.renderPay.__mhV163) return;
    const original = window.renderPay;
    const wrapped = function () {
      const r = original.apply(this, arguments);
      if (!window.__mhRenderingPro) setTimeout(() => {
        updatePeriodLabel();
        renderProPanel();
        syncVersion();
        bindInput();
      }, 0);
      return r;
    };
    wrapped.__mhV163 = true;
    window.renderPay = wrapped;
  }

  // Le panel et syncVersion() réécrivent le DOM (innerHTML / nodeValue).
  // Le MutationObserver ci-dessous observe justement ce DOM : sans garde,
  // chaque réécriture redéclenche l'observer, qui réécrit à nouveau, etc.
  // → boucle infinie qui sature le thread JS et fige l'app après quelques
  // secondes. mhSafeRun coupe l'observation pendant qu'on écrit.
  let mhObserverBusy = false;
  function mhSafeRun(fn) {
    if (mhObserverBusy) return;
    mhObserverBusy = true;
    try {
      observer.disconnect();
      fn();
    } finally {
      observer.observe(document.documentElement, {childList:true, subtree:true});
      mhObserverBusy = false;
    }
  }

  function boot() {
    ensurePeriod();
    wrapRenderPay();
    bindInput();
    mhSafeRun(() => {
      updatePeriodLabel();
      renderProPanel();
      syncVersion();
    });
  }

  /* L'observer doit exister AVANT le premier boot() : mhSafeRun() l'utilise
     (sinon ReferenceError « Cannot access 'observer' before initialization »,
     qui interrompait tout le script au démarrage). */
  const observer = new MutationObserver(() => {
    wrapRenderPay();
    bindInput();
    if (document.getElementById('pN')) {
      mhSafeRun(() => {
        updatePeriodLabel();
        renderProPanel();
        syncVersion();
      });
    }
  });
  observer.observe(document.documentElement, {childList:true, subtree:true});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  // L'ancien setInterval(...,1200) refaisait ce même travail toutes les
  // 1,2 s en continu, ce qui aggravait la boucle ci-dessus. Le
  // MutationObserver + wrapRenderPay() suffisent à garder le panel à jour ;
  // il est retiré.

  window.addEventListener('beforeunload', () => {
    observer.disconnect();
  });
})();

/* V30.2.3 — le résumé de paie canonique est exposé par app-core.js.
   app-pay.js ne redéfinit volontairement aucune formule pour les surfaces secondaires. */
