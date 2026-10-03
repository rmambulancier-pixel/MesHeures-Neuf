(function () {
  'use strict';

  const KEY = 'mesheures_theme';
  let media = null;

  function systemDark() {
    try {
      if (window.MesHeuresAndroid?.isSystemDark) {
        return window.MesHeuresAndroid.isSystemDark();
      }
    } catch (_) {}
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function apply(mode) {
    const root = document.documentElement;
    const dark = mode === 'dark' || (mode === 'auto' && systemDark());

    if (dark) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', 'light');

    root.style.colorScheme = dark ? 'dark' : 'light';

    try {
      window.MesHeuresAndroid?.setSystemBarsLight?.(!dark);
    } catch (_) {}

    document.querySelectorAll('[data-mh-theme]').forEach(b => {
      b.classList.toggle('on', b.dataset.mhTheme === mode);
    });
  }

  function getMode() {
    const v = localStorage.getItem(KEY);
    return ['auto', 'light', 'dark'].includes(v) ? v : 'auto';
  }

  function setMode(mode) {
    localStorage.setItem(KEY, mode);
    apply(mode);
  }

  function watchSystem() {
    if (!window.matchMedia) return;
    media = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => {
      if (getMode() === 'auto') apply('auto');
    };
    if (media.addEventListener) media.addEventListener('change', fn);
    else media.addListener(fn);
  }

  function addSettings() {
    if (!window.renderReg || window.__mhThemeWrapped) return;
    const original = window.renderReg;

    window.renderReg = function () {
      original.apply(this, arguments);

      const host = document.getElementById('rBk');
      if (!host || document.getElementById('mhThemeSettings')) return;

      const box = document.createElement('div');
      box.id = 'mhThemeSettings';
      box.className = 'card';
      box.style.marginTop = '10px';
      box.innerHTML = `
        <h2>🎨 Apparence</h2>
        <div class="mut" style="margin-bottom:8px">
          Le mode automatique suit le thème clair/sombre d'Android.
        </div>
        <div class="row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
          <button class="g" data-mh-theme="auto" onclick="window.MHTheme.set('auto')">🔄 Auto</button>
          <button class="g" data-mh-theme="light" onclick="window.MHTheme.set('light')">☀️ Clair</button>
          <button class="g" data-mh-theme="dark" onclick="window.MHTheme.set('dark')">🌙 Sombre</button>
        </div>
      `;

      host.parentNode.insertBefore(box, host);
      apply(getMode());
    };

    window.__mhThemeWrapped = true;
  }

  window.MHTheme = {
    set: setMode,
    get: getMode
  };

  apply(getMode());
  watchSystem();

  // Android WebView ne propage pas toujours immédiatement
  // prefers-color-scheme. En mode Auto, on utilise donc le
  // mode nuit Android natif comme source de vérité.
  let lastSystemDark = systemDark();
  setInterval(() => {
    if (getMode() !== 'auto') return;
    const now = systemDark();
    if (now !== lastSystemDark) {
      lastSystemDark = now;
      apply('auto');
    }
  }, 1500);

  // renderReg est défini par app.js avant ce fichier.
  addSettings();

  // Si Réglages est déjà affiché, injecte immédiatement.
  setTimeout(addSettings, 0);
})();
