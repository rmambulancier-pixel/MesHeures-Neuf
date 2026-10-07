/*
 * MesHeures V34.1.2 — SMART CONTROL
 *
 * Couche insights + saisie rapide (window.MH302).
 * Ne rend PLUS l'Accueil : app-v31-home.js est l'unique propriétaire de #s-home.
 * Le moteur existant reste la source de vérité.
 */

(function () {
  'use strict';

  const V = '36.2.0';
  const PRIMARY = ['home', 'jour', 'mois', 'paie', 'analyse'];

  const $ = id => document.getElementById(id);

  function fmt(min) {
    if (!Number.isFinite(Number(min))) return '—';
    if (typeof F === 'function') return F(Math.round(Number(min)));
    const n = Math.max(0, Math.round(Number(min)));
    return Math.floor(n / 60) + 'h' +
      String(n % 60).padStart(2, '0');
  }

  function work(k) {
    return ['T', 'NUIT'].includes(DB?.days?.[k]?.t);
  }

  function average(values) {
    const a = values.filter(Number.isFinite);
    if (!a.length) return 0;
    return Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  }

  function minutesOf(k) {
    try {
      const r = cd(k);
      return Math.max(0, Number(r?.tte) || 0);
    } catch (_) {
      return 0;
    }
  }

  function timeToMinutes(v) {
    if (!/^\d{1,2}:\d{2}$/.test(String(v || ''))) return null;
    const [h, m] = String(v).split(':').map(Number);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  function smartTime(v) {
    v = String(v || '').trim().replace(/\s+/g, '');

    if (/^\d{1,2}$/.test(v)) {
      const h = Number(v);
      if (h <= 23)
        return String(h).padStart(2, '0') + ':00';
    }

    if (/^\d{3,4}$/.test(v)) {
      v = v.padStart(4, '0');

      const h = Number(v.slice(0, -2));
      const m = Number(v.slice(-2));

      if (h <= 23 && m <= 59)
        return String(h).padStart(2, '0') + ':' +
               String(m).padStart(2, '0');
    }

    return v;
  }

  function recentRows(days) {
    const out = [];

    for (let i = 0; i < days; i++) {
      const k = addD(today(), -i);

      if (!work(k)) continue;

      try {
        out.push({
          k,
          d: DB.days[k],
          r: cd(k)
        });
      } catch (_) {}
    }

    return out;
  }

  // ---------------------------------------------
  // INSIGHTS
  // ---------------------------------------------

  function insights() {
    const rows = recentRows(28);

    const tte = rows
      .map(x => Number(x.r?.tte))
      .filter(x => x > 0);

    const amp = rows
      .map(x => Number(x.r?.amp))
      .filter(x => x > 0);

    const pause = rows
      .map(x => Number(x.r?.pz))
      .filter(x => x >= 0);

    const starts = rows
      .map(x => timeToMinutes(x.d?.deb))
      .filter(x => x != null);

    const ends = rows
      .map(x => timeToMinutes(x.d?.fin))
      .filter(x => x != null);

    const month = today().slice(0, 7);

    const monthTte = Object.keys(DB.days || {})
      .filter(k => k.startsWith(month) && work(k))
      .map(minutesOf)
      .filter(x => x > 0);

    const weekTte = [];

    for (let i = 0; i < 7; i++) {
      const k = addD(today(), -i);
      if (work(k)) {
        const m = minutesOf(k);
        if (m > 0) weekTte.push(m);
      }
    }

    const avgTte = average(tte);
    const avgAmp = average(amp);
    const avgPause = average(pause);
    const avgStart = average(starts);
    const avgEnd = average(ends);

    const monthAvg = average(monthTte);
    const weekAvg = average(weekTte);

    return {
      count: rows.length,
      avgTte,
      avgAmp,
      avgPause,
      avgStart,
      avgEnd,
      monthAvg,
      weekAvg,
      delta:
        weekAvg && monthAvg
          ? weekAvg - monthAvg
          : null
    };
  }

  // ---------------------------------------------
  // ANOMALIES
  // ---------------------------------------------

  function anomalies() {
    const rows = recentRows(28);
    const out = [];

    const amplitudes = rows
      .map(x => Number(x.r?.amp))
      .filter(x => x > 0);

    const personalAverage = average(amplitudes);

    rows.forEach(({ k, d, r }) => {

      if (!d?.deb || !d?.fin) {
        out.push({
          level: 'warn',
          k,
          title: 'Journée incomplète',
          text: 'Début ou fin manquant.'
        });
        return;
      }

      const tte = Number(r?.tte) || 0;
      const pause = Number(r?.pz) || 0;

      if (tte <= 0) {
        out.push({
          level: 'warn',
          k,
          title: 'TTE non calculé',
          text: 'Le moteur ne retourne pas de TTE pour cette journée.'
        });
      }

      if (tte >= 360 && pause < 20) {
        out.push({
          level: 'warn',
          k,
          title: 'Pause à vérifier',
          text: 'Moins de 20 min de pause détectées par le moteur.'
        });
      }

      const amp = Number(r?.amp) || 0;

      if (
        personalAverage > 0 &&
        amp > personalAverage + 60
      ) {
        out.push({
          level: 'info',
          k,
          title: 'Amplitude inhabituelle',
          text:
            fmt(amp) +
            ' contre ' +
            fmt(personalAverage) +
            ' de moyenne récente.'
        });
      }

      if (Array.isArray(r?.al)) {
        r.al.slice(0, 2).forEach(a => {
          out.push({
            level: a?.lvl === 'b' ? 'bad' : 'warn',
            k,
            title: 'Contrôle du moteur',
            text: a?.m || 'Contrôle à vérifier.'
          });
        });
      }
    });

    return out;
  }

  // ---------------------------------------------
  // PAIE — UNIQUEMENT MOTEUR EXISTANT
  // ---------------------------------------------

  function payroll() {
    try {
      if (typeof calcPer !== 'function') return null;

      const p = DB.per || {};

      const start =
        p.start ||
        mhQuatorzaine.start(today());

      const nb = Math.max(
        2,
        Math.min(3, Number(p.nb) || 2)
      );

      const result = calcPer(start, nb);
      const G = result?.G || {};

      let gross = null;

      if (typeof brutOf === 'function') {
        try {
          const b = brutOf(G);
          gross = Number.isFinite(Number(b?.tot))
            ? Number(b.tot)
            : null;
        } catch (_) {}
      }

      return {
        start,
        nb,
        tte: Number(G.tte) || 0,
        h25: Number(G.h25) || 0,
        h50: Number(G.h50) || 0,
        trav: Number(G.trav) || 0,
        gross
      };

    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------
  // QUATORZAINE
  // ---------------------------------------------

  function period() {
    try {
      if (typeof calcPer !== 'function') return null;

      const start = mhQuatorzaine.start(today());

      const result = calcPer(start, 1);
      const q = result?.Q?.[0];

      if (!q) return null;

      const objective =
        Number(DB.s?.base || 35) * 120;

      const actual = Number(q.tte) || 0;

      return {
        start,
        end: addD(start, 13),
        actual,
        objective,
        gap: objective - actual
      };

    } catch (_) {
      return null;
    }
  }


  // ---------------------------------------------
  // QUICK ADD
  // ---------------------------------------------

  function bindSmartTimes(root) {
    root.querySelectorAll('[data-mh302-time]')
      .forEach(input => {

        if (input.dataset.bound) return;

        input.dataset.bound = '1';

        input.addEventListener('blur', () => {
          input.value = smartTime(input.value);
        });

        input.addEventListener('change', () => {
          input.value = smartTime(input.value);
        });
      });
  }

  window.mh302OpenQuickAdd = function () {

    let modal = $('mh302QuickAdd');

    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mh302QuickAdd';
      modal.className = 'mh302-modal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="mh302-sheet">

        <div class="mh302-sheet-head">
          <div>
            <small>MESHEURES</small>
            <b>Nouvelle journée</b>
          </div>

          <button onclick="mh302CloseQuickAdd()">×</button>
        </div>

        <label>
          Date
          <input
            id="mh302Date"
            type="date"
            value="${today()}">
        </label>

        <div class="mh302-form-grid">

          <label>
            Début
            <input
              id="mh302Deb"
              data-mh302-time
              inputmode="numeric"
              placeholder="07:50">
          </label>

          <label>
            Fin
            <input
              id="mh302Fin"
              data-mh302-time
              inputmode="numeric"
              placeholder="17:30">
          </label>

        </div>

        <label>
          Pause en minutes
          <input
            id="mh302Pause"
            type="number"
            inputmode="numeric"
            min="0"
            value="20">
        </label>

        <button
          class="mh302-save"
          onclick="mh302SaveQuickAdd()">
          Enregistrer
        </button>

      </div>
    `;

    modal.hidden = false;
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '1000';
    modal.style.alignItems = 'flex-end';
    modal.classList.add('on');

    bindSmartTimes(modal);
  };

  window.mh302CloseQuickAdd = function () {
    const modal = $('mh302QuickAdd');
    if (!modal) return;

    modal.classList.remove('on');
    modal.hidden = true;
    modal.style.display = 'none';
  };

  window.mh302SaveQuickAdd = function () {

    const k = $('mh302Date')?.value;
    const deb = smartTime($('mh302Deb')?.value);
    const fin = smartTime($('mh302Fin')?.value);
    const pause = Math.max(
      0,
      Number($('mh302Pause')?.value) || 0
    );

    if (!k || !deb || !fin) {
      alert('Date, début et fin sont obligatoires.');
      return;
    }

    if (
      timeToMinutes(deb) == null ||
      timeToMinutes(fin) == null
    ) {
      alert('Format horaire incorrect.');
      return;
    }

    DB.days = DB.days || {};

    const old = DB.days[k] || {};

    DB.days[k] = {
      ...old,
      t: 'T',
      deb,
      fin,
      p: Array.isArray(old.p) ? old.p : []
    };

    /*
     * Important :
     * On ne fabrique pas une structure de pause inconnue.
     * La journée est créée proprement puis le moteur existant
     * reste responsable de son calcul.
     *
     * Si aucune pause n'est renseignée, aucune pause fictive
     * n'est créée.
     */

    if (pause === 0)
      DB.days[k].p = [];

    if (typeof save === 'function')
      save();

    window.mh302CloseQuickAdd();

    /* mhRefresh passe par le scheduler V30, qui redessine l'Accueil (V31). */
    if (typeof mhRefresh === 'function')
      mhRefresh('smart-quick-add');
  };

  // ---------------------------------------------
  // FAB GLOBAL
  // ---------------------------------------------

  function ensureFab() {

    if ($('mh302Fab')) return;

    const b = document.createElement('button');

    b.id = 'mh302Fab';
    b.className = 'mh302-fab';
    b.textContent = '+';
    b.setAttribute(
      'aria-label',
      'Ajouter une journée'
    );

    b.onclick = window.mh302OpenQuickAdd;

    document.body.appendChild(b);
  }

  // ---------------------------------------------
  // SWIPE
  // ---------------------------------------------

  function ensureSwipe() {

    if (document.body.dataset.mh302Swipe)
      return;

    document.body.dataset.mh302Swipe = '1';

    let sx = 0;
    let sy = 0;

    document.addEventListener(
      'touchstart',
      e => {
        const t = e.changedTouches[0];
        sx = t.clientX;
        sy = t.clientY;
      },
      { passive: true }
    );

    document.addEventListener(
      'touchend',
      e => {

        const t = e.changedTouches[0];

        const dx = t.clientX - sx;
        const dy = t.clientY - sy;

        if (
          Math.abs(dx) < 80 ||
          Math.abs(dx) < Math.abs(dy) * 1.35
        )
          return;

        const current =
          window.curTab || 'home';

        const i = PRIMARY.indexOf(current);

        if (i < 0) return;

        const next =
          dx < 0
            ? PRIMARY[Math.min(PRIMARY.length - 1, i + 1)]
            : PRIMARY[Math.max(0, i - 1)];

        if (
          next &&
          next !== current &&
          typeof tab === 'function'
        )
          tab(next);
      },
      { passive: true }
    );
  }

  // ---------------------------------------------
  // BOOT
  // ---------------------------------------------

  function boot() {

    ensureFab();
    ensureSwipe();

    const strayQuickAdd = $('mh302QuickAdd');
    if (strayQuickAdd) {
      strayQuickAdd.classList.remove('on');
      strayQuickAdd.hidden = true;
      strayQuickAdd.style.display = 'none';
    }
  }

  window.MH302 = {
    version: V,
    insights,
    anomalies,
    payroll,
    period
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      { once: true }
    );
  } else {
    boot();
  }

})();
