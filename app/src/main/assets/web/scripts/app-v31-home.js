/*
 * MesHeures V34.1.2 · Accueil « Command Center »
 *
 * Propriétaire UNIQUE de #s-home.
 * Aucun calcul métier n'est refait ici : tout provient des modules existants
 *   - MH30DataEngine (journées, quatorzaines, brut)
 *   - MH302.period / insights / anomalies (app-v30-smart.js)
 *   - mhV30IntelligenceData (app-intelligence.js)
 *   - MH30Live (service en direct, horloge mise à jour par le tick V30)
 *
 * Appelé uniquement par le scheduler V30 (renderActive), par app.js / app-ui.js
 * via window.MH31.renderHome, et une fois au chargement. Aucun timer, aucun
 * observer, aucun listener global : les boutons utilisent des onclick inline
 * et les mises à jour passent par le scheduler existant.
 */
(function () {
  'use strict';

  const V = '37.4.0';
  const WORK = ['T', 'NUIT'];
  const WINDOW_DAYS = 28;
  const NB = '\u00a0';

  const $ = id => document.getElementById(id);

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const db = () => (typeof DB !== 'undefined' && DB && DB.days ? DB : null);
  const isWork = d => !!d && WORK.includes(d.t);
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const plural = (n, one, many) => n + NB + (n > 1 ? many : one);

  function fmt(m) {
    if (m == null || !Number.isFinite(Number(m))) return '—';
    return typeof F === 'function'
      ? F(Math.round(Number(m)))
      : Math.floor(Math.abs(m) / 60) + 'h' + String(Math.round(Math.abs(m)) % 60).padStart(2, '0');
  }

  function euro(v) {
    if (!Number.isFinite(Number(v))) return '—';
    return typeof EUR === 'function'
      ? EUR(v)
      : Number(v).toFixed(2).replace('.', ',') + NB + '€';
  }

  function engineDay(k) {
    try {
      return window.MH30DataEngine?.day?.(k) || (typeof cd === 'function' ? cd(k) : null) || {};
    } catch (_) {
      return {};
    }
  }

  function shortDate(k) {
    try {
      return (typeof dow === 'function' ? dow(k) + ' ' : '') + short(k);
    } catch (_) {
      return k;
    }
  }

  function longDate(k) {
    try {
      const t = new Date(k + 'T12:00:00')
        .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return t.charAt(0).toUpperCase() + t.slice(1);
    } catch (_) {
      return k;
    }
  }

  const goTab = t => "tab('" + t + "')";
  const goDay = k => "mhOpenDay('" + esc(k) + "')";

  /* Chaque bloc est isolé : une erreur dans un module n'emporte jamais tout l'Accueil. */
  function block(name, fn) {
    try {
      return fn() || '';
    } catch (e) {
      console.warn('MesHeures V31 · bloc « ' + name + ' » indisponible', e);
      return '<div class="mh31-card mh31-fail" data-tone="warn"><b>' + esc(name) +
        '</b><small>Bloc momentanément indisponible.</small></div>';
    }
  }

  function safe(fn, fallback) {
    try {
      const v = fn();
      return v == null ? fallback : v;
    } catch (e) {
      console.warn('MesHeures V31', e);
      return fallback;
    }
  }

  /* ------------------------------------------------------------------ */
  /* COLLECTE : lecture unique des modules existants                     */
  /* ------------------------------------------------------------------ */

  function collectPeriod(now, days) {
    const base = window.MH302?.period?.();
    if (!base) return null;

    const res = window.MH30DataEngine?.period?.(base.start, 1);
    const q = res?.Q?.[0];
    if (!q) return null;

    let brut = null;
    if (typeof brutOf === 'function') {
      try {
        const b = brutOf(res.G || {});
        if (Number.isFinite(Number(b?.tot)) && Number(b.tot) > 0) brut = Number(b.tot);
      } catch (_) { /* brut indisponible */ }
    }

    const actual = num(q.seuil ?? q.tte);
    const objective = num(base.objective);

    let planned = 0;
    let plannedDays = 0;
    for (let k = addD(now, 1); k <= base.end; k = addD(k, 1)) {
      const d = days[k];
      if (!isWork(d)) continue;
      plannedDays++;
      planned += num(engineDay(k).tte);
    }

    return {
      start: base.start,
      end: base.end,
      actual,
      objective,
      gap: Math.max(0, objective - actual),
      pct: objective > 0 ? Math.min(100, actual / objective * 100) : 0,
      h25: num(q.h25),
      h50: num(q.h50),
      brut,
      planned,
      plannedDays
    };
  }

  function collectMonth(now, days) {
    const ym = now.slice(0, 7);
    const Y = Number(ym.slice(0, 4));
    const M = Number(ym.slice(5, 7));
    const lastDay = new Date(Y, M, 0).getDate();

    let done = 0, doneDays = 0, ampSum = 0;
    let planned = 0, plannedDays = 0, plannedUnknown = 0;

    for (let n = 1; n <= lastDay; n++) {
      const k = ym + '-' + String(n).padStart(2, '0');
      if (!isWork(days[k])) continue;
      const r = engineDay(k);
      const t = num(r.tte);

      if (k <= now) {
        if (t > 0) {
          done += t;
          doneDays++;
          ampSum += num(r.amp);
        }
      } else {
        plannedDays++;
        if (t > 0) planned += t; else plannedUnknown++;
      }
    }

    const avg = doneDays ? done / doneDays : 0;
    const projected = done + planned + (avg ? plannedUnknown * avg : 0);

    return {
      label: (typeof MON !== 'undefined' ? MON[M - 1] : ym) + ' ' + Y,
      remainingDays: lastDay - Number(now.slice(8, 10)),
      done,
      doneDays,
      avg,
      avgAmp: doneDays ? ampSum / doneDays : 0,
      planned,
      plannedDays,
      plannedUnknown,
      projected,
      remaining: Math.max(0, projected - done),
      pct: projected > 0 ? Math.min(100, done / projected * 100) : 0,
      confidence: doneDays >= 5 ? 'Bonne base' : doneDays > 0 ? 'Base partielle' : 'En attente de données'
    };
  }

  /* État du dossier : V37.0-A, source unique MHControl (app-v37-control.js), en lecture seule.
     Les blocs Intelligence, État du dossier et Prochaine action lisent la même analyse. */
  function collectDossier() {
    const sc = window.MHControl?.analyze?.() || null;
    const out = { sc, total: sc ? sc.workedDays : 0, critical: 0, toComplete: 0, toCheck: 0, items: [] };
    if (!sc) return Object.assign(out, { todo: 0 });
    sc.groups.forEach(g => {
      const kind = g.alerts.some(a => a.code === 'HORAIRES') ? 'toComplete' : g.level === 'bad' ? 'critical' : 'toCheck';
      out[kind]++;
      const a = g.alerts[0].actions[0];
      out.items.push({ k: g.key, label: g.label, kind, reason: g.alerts.map(x => x.title).join(' · '),
        title: 'Contrôler ' + (g.scope === 'day' ? 'le ' + g.key.slice(8) + '/' + g.key.slice(5, 7) : g.label.charAt(0).toLowerCase() + g.label.slice(1)),
        go: "MHControl.open('" + a.kind + "'," + (a.target == null ? 'null' : "'" + esc(a.target) + "'") + ")" });
    });
    out.todo = out.critical + out.toComplete + out.toCheck;
    return out;
  }

  function collectNextService(now, days) {
    const k = Object.keys(days).filter(x => x > now && isWork(days[x])).sort()[0];
    return k ? { k, d: days[k] } : null;
  }

  /* Dernier export réel : DB.exp, posé par app.js à chaque export (jj/mm/aaaa). */
  function backupAgeDays() {
    try {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(DB.exp || ''));
      if (!m) return null;
      const t = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
      return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null;
    } catch (_) {
      return null;
    }
  }

  function collect() {
    const data = db();
    const now = today();
    const days = data.days;
    const live = !!window.MH30Live?.active?.();
    const d = days[now] || null;
    const r = engineDay(now);

    return {
      now, days, live, d, r,
      per: safe(() => collectPeriod(now, days), null),
      month: collectMonth(now, days),
      dossier: collectDossier(),
      next: collectNextService(now, days),
      intel: safe(() => window.mhV30IntelligenceData?.(), null),
      smart: safe(() => window.MH302?.insights?.(), null),
      anomalies: safe(() => window.MH302?.anomalies?.(), []),
      backupAge: backupAgeDays()
    };
  }

  /* ------------------------------------------------------------------ */
  /* ANALYSE : états, insights, prochaine action                         */
  /* ------------------------------------------------------------------ */

  function heroState(c) {
    const { d, r, live } = c;
    if (live) return { tone: 'ok', label: 'En service', sub: 'Début ' + (d?.deb || '—') + ' · amplitude ' + fmt(r.amp) };
    if (!d) return { tone: 'mut', label: 'Non saisie', sub: 'Aucune donnée pour aujourd’hui' };

    if (isWork(d)) {
      if (d.deb && d.fin) {
        return {
          tone: 'ok',
          label: d.t === 'NUIT' ? 'Service de nuit terminé' : 'Journée terminée',
          sub: fmt(r.tte) + ' de travail effectif · amplitude ' + fmt(r.amp)
        };
      }
      if (d.deb) return { tone: 'warn', label: 'À compléter', sub: 'L’heure de fin manque' };
      return { tone: 'warn', label: 'À saisir', sub: 'Horaires non renseignés' };
    }

    const label = { CP: 'Congé payé', MAL: 'Arrêt maladie', RC: 'Repos compensateur' }[d.t] || 'Repos';
    return { tone: 'info', label, sub: 'Aucun service aujourd’hui' };
  }

  const RANK = { bad: 0, warn: 1, info: 2, ok: 3 };

  function buildInsights(c) {
    const out = [];
    const { live, r, dossier, per, intel, smart, anomalies, now, month } = c;
    const proj = intel?.projection || null;

    if (live && num(r.tte) >= 360 && num(r.pz) < 20) {
      out.push({ lvl: 'bad', icon: '☕', title: 'Pause à prendre',
        text: 'Plus de 6 h de travail sans 20 min de pause détectées.', go: goTab('jour') });
    }

    if (proj?.firstRisk) {
      out.push({ lvl: 'bad', icon: '⚠️', title: 'Trajectoire 46 h à surveiller',
        text: 'Une moyenne de plus de 46 h sur 12 semaines est possible vers le ' + shortY(proj.firstRisk) + '.',
        go: goTab('analyse') });
    }

    if (dossier.critical) {
      const it = dossier.items.find(x => x.kind === 'critical');
      out.push({ lvl: 'bad', icon: '🔴', title: plural(dossier.critical, 'point critique', 'points critiques'),
        text: it.label + ' · ' + it.reason, go: it.go });
    }

    if (dossier.toComplete) {
      const it = dossier.items.find(x => x.kind === 'toComplete');
      out.push({ lvl: 'warn', icon: '🟠', title: plural(dossier.toComplete, 'journée à compléter', 'journées à compléter'),
        text: 'Début ou fin manquant, par exemple le ' + shortDate(it.k) + '.', go: it.go });
    }

    if (dossier.toCheck) {
      const it = dossier.items.find(x => x.kind === 'toCheck');
      out.push({ lvl: 'warn', icon: '🔎', title: plural(dossier.toCheck, 'point à vérifier', 'points à vérifier'),
        text: it.label + ' · ' + it.reason, go: it.go });
    }

    const todayAmp = anomalies.find(a => a.k === now && a.title === 'Amplitude inhabituelle');
    if (todayAmp) {
      out.push({ lvl: 'info', icon: '⏱', title: 'Amplitude importante aujourd’hui', text: todayAmp.text, go: goDay(now) });
    }

    /* Pas d'objectif « en retard » tant qu'aucune journée n'est enregistrée (pas de donnée inventée). */
    if (per && per.gap > 0 && num(smart?.count) > 0) {
      if (per.plannedDays === 0) {
        out.push({ lvl: 'info', icon: '🎯', title: 'Quatorzaine sans service planifié',
          text: 'Il reste ' + fmt(per.gap) + ' pour atteindre l’objectif, aucun service prévu d’ici le ' + short(per.end) + '.',
          go: goTab('mois') });
      } else if (per.planned > 0 && per.planned < per.gap) {
        out.push({ lvl: 'warn', icon: '🎯', title: 'Objectif de quatorzaine difficile',
          text: fmt(per.planned) + ' planifiées pour ' + fmt(per.gap) + ' restantes.', go: goTab('mois') });
      }
    }

    if (smart && smart.weekAvg && smart.monthAvg && Math.abs(num(smart.delta)) >= 45) {
      const under = smart.delta < 0;
      out.push({ lvl: 'info', icon: under ? '📉' : '📈', title: under ? 'Rythme en retrait cette semaine' : 'Rythme soutenu cette semaine',
        text: 'Moyenne de la semaine ' + fmt(smart.weekAvg) + ' contre ' + fmt(smart.monthAvg) + ' sur le mois.',
        go: goTab('analyse') });
    }

    const pattern = intel?.patterns?.[0];
    if (pattern) {
      out.push({ lvl: pattern.level === 'bad' ? 'bad' : 'warn', icon: '🔁', title: pattern.title || 'Motif récurrent',
        text: pattern.text || '', go: goTab('analyse') });
    }

    out.sort((a, b) => RANK[a.lvl] - RANK[b.lvl]);

    /* V37.0-A : plus d'insertion « priorité MH314 » : elle doublait les points ci-dessus. */

    if (!out.length) {
      if (month.doneDays < 3 && !(proj && proj.avg > 0)) {
        out.push({ lvl: 'info', icon: '◌', title: 'Données insuffisantes',
          text: 'Pas encore assez de journées enregistrées pour une analyse fiable.', go: goTab('jour') });
      } else {
        const tail = proj && proj.avg > 0
          ? ' Moyenne hebdomadaire de ' + fmt(proj.avg) + ', marge de ' + fmt(proj.margin) + ' avant 46 h.'
          : '';
        out.push({ lvl: 'ok', icon: '✓', title: 'Aucune anomalie prioritaire',
          text: 'Les données connues sont cohérentes.' + tail, go: goTab('analyse') });
      }
    }

    return out;
  }

  function buildNextAction(c) {
    const { d, r, live, now, dossier, next } = c;

    const service = next && {
      tone: 'info', icon: '📅', title: 'Prochain service',
      text: shortDate(next.k) + ' · ' + (next.d.deb || 'horaire à définir') + (next.d.fin ? ' → ' + next.d.fin : ''),
      go: goDay(next.k)
    };

    let main = null;

    if (live && num(r.tte) >= 360 && num(r.pz) < 20) {
      main = { tone: 'bad', icon: '☕', title: 'Prendre la pause', text: '20 min de pause sont dues après 6 h de travail.', go: goTab('jour') };
    } else if (live) {
      main = { tone: 'ok', icon: '⏱', title: 'Service en cours', text: 'Arrête le service à la fin pour figer la journée.', go: goTab('jour') };
    } else if (isWork(d) && d.deb && !d.fin) {
      main = { tone: 'warn', icon: '✎', title: 'Compléter la journée', text: 'L’heure de fin d’aujourd’hui manque.', go: goDay(now) };
    } else if (!d) {
      main = { tone: 'warn', icon: '＋', title: 'Saisir la journée', text: 'Aucune donnée pour aujourd’hui.', go: goTab('jour') };
    } else if (dossier.critical) {
      const it = dossier.items.find(x => x.kind === 'critical');
      main = { tone: 'bad', icon: '🔴', title: it.title, text: it.reason, go: it.go };
    } else if (dossier.toComplete) {
      const it = dossier.items.find(x => x.kind === 'toComplete');
      main = { tone: 'warn', icon: '✎', title: 'Compléter une journée', text: shortDate(it.k) + ' · début ou fin manquant.', go: it.go };
    } else if (dossier.toCheck) {
      const it = dossier.items.find(x => x.kind === 'toCheck');
      main = { tone: 'warn', icon: '🔎', title: it.title, text: it.reason, go: it.go };
    } else if (service) {
      main = service;
    } else {
      main = { tone: 'ok', icon: '✓', title: 'Aucune action nécessaire', text: 'Dossier à jour, aucun service planifié à venir.', go: goTab('mois') };
    }

    return { main, then: main !== service ? service : null };
  }

  /* ------------------------------------------------------------------ */
  /* RENDU                                                               */
  /* ------------------------------------------------------------------ */

  function heroBlock(c) {
    const st = heroState(c);
    const per = c.per;
    const hs = per
      ? (per.h25 || per.h50
        ? 'HS quatorzaine · 25' + NB + '% ' + fmt(per.h25) + ' · 50' + NB + '% ' + fmt(per.h50)
        : 'Aucune heure supplémentaire sur la quatorzaine')
      : '';

    return '<div class="mh31-hero">' +
      '<div class="mh31-hero-top">' +
        '<div><span class="mh31-eyebrow">AUJOURD’HUI</span><b class="mh31-date">' + esc(longDate(c.now)) + '</b></div>' +
        '<button class="mh31-live" data-live-action>▶ Démarrer</button>' +
      '</div>' +
      '<div class="mh31-state" data-tone="' + st.tone + '"><i></i><b>' + esc(st.label) + '</b><span>' + esc(st.sub) + '</span></div>' +
      '<div class="mh31-clock" data-live-clock>' + fmt(c.r.tte) + '</div>' +
      '<div class="mh31-caption">Temps de travail effectif</div>' +
      '<div class="mh31-meta">' +
        '<div><span>Début</span><b data-live-start>—</b></div>' +
        '<div><span>Fin</span><b data-live-end>—</b></div>' +
        '<div><span>Pause</span><b data-live-pause>—</b></div>' +
        '<div><span>Amplitude</span><b data-live-amp>—</b></div>' +
      '</div>' +
      (hs ? '<div class="mh31-chip">' + esc(hs) + '</div>' : '') +
    '</div>';
  }

  function metric(label, value, sub) {
    return '<div class="mh31-metric"><span>' + label + '</span><strong>' + value + '</strong><small>' + sub + '</small></div>';
  }

  function pilotBlock(c) {
    const m = c.month;
    const p = c.per;

    const unknown = m.plannedUnknown
      ? ' dont ' + m.plannedUnknown + ' sans horaires'
      : '';

    let html = '<div class="mh31-card">' +
      '<div class="mh31-card-head"><div><span class="mh31-eyebrow">PILOTAGE</span><b>' + esc(m.label) + '</b></div>' +
      '<span class="mh31-pill">' + esc(m.confidence) + '</span></div>' +
      '<div class="mh31-bar"><i style="width:' + m.pct.toFixed(1) + '%"></i></div>' +
      '<div class="mh31-bar-cap"><span>' + fmt(m.done) + ' réalisées</span><span>' +
        (m.projected ? fmt(m.projected) + ' projetées' : 'projection en attente') + '</span></div>' +
      '<div class="mh31-grid">' +
        metric('PROJECTION FIN DE MOIS', m.projected ? fmt(m.projected) : '—', 'réalisé + planifié') +
        metric('RESTANT PLANIFIÉ', m.projected ? fmt(m.remaining) : '—', plural(m.plannedDays, 'service', 'services') + unknown) +
        metric('JOURS TRAVAILLÉS', String(m.doneDays), plural(m.remainingDays, 'jour restant', 'jours restants')) +
        metric('RYTHME MOYEN', m.avg ? fmt(m.avg) : '—', 'par journée travaillée') +
        metric('AMPLITUDE MOYENNE', m.avgAmp ? fmt(m.avgAmp) : '—', 'par journée travaillée') +
        metric('SERVICES À VENIR', String(m.plannedDays), 'planifiés ce mois-ci') +
      '</div>';

    if (c.live) html += '<div class="mh31-note">Service en cours non compté tant qu’il n’est pas arrêté.</div>';

    if (p) {
      html += '<div class="mh31-quat">' +
        '<div class="mh31-quat-head"><span>QUATORZAINE · ' + short(p.start) + ' → ' + short(p.end) + '</span>' +
        '<b>' + fmt(p.actual) + ' / ' + fmt(p.objective) + '</b></div>' +
        '<div class="mh31-bar"><i style="width:' + p.pct.toFixed(1) + '%"></i></div>' +
        '<div class="mh31-quat-row">' +
          '<span>Restant <b>' + fmt(p.gap) + '</b></span>' +
          '<span>HS' + NB + '25' + NB + '% <b>' + fmt(p.h25) + '</b></span>' +
          '<span>HS' + NB + '50' + NB + '% <b>' + fmt(p.h50) + '</b></span>' +
        '</div>' +
        (p.brut != null
          ? '<div class="mh31-quat-pay"><span>Brut estimé de la quatorzaine</span><b>' + euro(p.brut) + '</b></div>'
          : '') +
      '</div>';
    }

    return html + '</div>';
  }

  function intelBlock(c) {
    const list = buildInsights(c);
    const main = list[0];
    const more = list.slice(1, 3);
    const proj = c.intel?.projection;

    const rows = more.map(x =>
      '<button class="mh31-row" data-tone="' + x.lvl + '" onclick="' + x.go + '">' +
        '<i>' + x.icon + '</i><div><b>' + esc(x.title) + '</b><small>' + esc(x.text) + '</small></div><em>›</em></button>'
    ).join('');

    const sc = c.dossier.sc;
    const smartNote = sc
      ? '<div class="mh31-note">🧠 Smart Control · ' + esc(sc.label) +
        (sc.score == null ? '' : ' · ' + sc.score + NB + '% des contrôles conformes (' + sc.counts.ok + '/' + sc.counts.total + ')') + '</div>'
      : '<div class="mh31-note">🧠 Smart Control · module indisponible</div>';

    const metrics = proj && proj.avg > 0
      ? '<div class="mh31-note">Moyenne sur 12 semaines ' + fmt(proj.avg) + ' / 46' + NB + 'h · marge ' + fmt(proj.margin) + '</div>'
      : '';

    const smartPriorityNote = '';

    return '<div class="mh31-card mh31-intel" data-tone="' + main.lvl + '">' +
      '<div class="mh31-card-head"><div><span class="mh31-eyebrow">INTELLIGENCE</span><b>' + esc(main.title) + '</b></div>' +
      '<i class="mh31-ico">' + main.icon + '</i></div>' +
      '<p>' + esc(main.text) + '</p>' +
      rows + metrics + smartNote + smartPriorityNote +
      '<button class="mh31-link" onclick="' + main.go + '">Ouvrir le détail <em>›</em></button>' +
    '</div>';
  }

  function dossierBlock(c) {
    const backup = c.backupAge == null || c.backupAge >= 14
      ? '<button class="mh31-row" data-tone="warn" onclick="' + goTab('reg') + '"><i>🛡️</i><div><b>Sauvegarde externe</b><small>' +
        (c.backupAge == null ? 'Aucune sauvegarde exportée sur cet appareil.' : 'Dernier export il y a ' + plural(c.backupAge, 'jour', 'jours') + '.') +
        '</small></div><em>›</em></button>'
      : '';
    if (!c.dossier.sc || typeof window.MHControl?.cardHtml !== 'function')
      return '<div class="mh31-card"><div class="mh31-card-head"><div><span class="mh31-eyebrow">SMART CONTROL</span><b>Module indisponible</b></div></div>' + backup + '</div>';
    return window.MHControl.cardHtml(c.dossier.sc, backup);
  }

  function nextBlock(c) {
    const { main, then } = buildNextAction(c);
    return '<div class="mh31-card">' +
      '<div class="mh31-card-head"><div><span class="mh31-eyebrow">PROCHAINE ACTION</span></div>' +
      '<button class="mh31-mini" onclick="' + goTab('mois') + '">Planning ›</button></div>' +
      '<button class="mh31-cta" data-tone="' + main.tone + '" onclick="' + main.go + '">' +
        '<i>' + main.icon + '</i><div><b>' + esc(main.title) + '</b><small>' + esc(main.text) + '</small></div><em>›</em></button>' +
      (then ? '<div class="mh31-note">Ensuite · ' + esc(then.title.toLowerCase()) + ' ' + esc(then.text) + '</div>' : '') +
    '</div>';
  }

  function footerBlock() {
    const add = typeof window.mh302OpenQuickAdd === 'function' ? 'mh302OpenQuickAdd()' : goTab('jour');
    return '<div class="mh31-foot">' +
      '<button onclick="' + add + '">＋ Ajouter une journée</button>' +
      '<button onclick="' + goTab('reg') + '">⚙ Réglages</button>' +
    '</div>';
  }

  function build() {
    const c = collect();
    return '<div class="mh31-home">' +
      block('Aujourd’hui', () => heroBlock(c)) +
      block('Pilotage', () => pilotBlock(c)) +
      block('Compteur heures', () => (window.MHCompteur ? window.MHCompteur.html() : '')) +   /* V37.0-E : lecture seule */
      block('Intelligence', () => intelBlock(c)) +
      block('Smart Control', () => dossierBlock(c)) +
      block('Prochaine action', () => nextBlock(c)) +
      footerBlock() +
    '</div>';
  }

  let lastHtml = '';

  function renderHome() {
    const host = $('s-home');
    if (!host || !db()) return;

    let html;
    try {
      html = build();
    } catch (e) {
      console.error('MesHeures V31 · Accueil', e);
      html = '<div class="mh31-home"><div class="mh31-card" data-tone="warn"><b>Accueil indisponible</b>' +
        '<small>' + esc(e?.message || e) + '</small>' +
        '<button class="mh31-link" onclick="location.reload()">Recharger <em>↻</em></button></div></div>';
    }

    const mounted = host.firstElementChild?.classList.contains('mh31-home');
    if (html !== lastHtml || !mounted) {
      host.innerHTML = html;
      lastHtml = html;
    }

    /* Les valeurs « live » sont remplies par le module Live existant. */
    safe(() => window.MH30Live?.render?.(), null);
  }

  window.MH31 = { version: V, renderHome };

  if ((window.curTab || 'home') === 'home') renderHome();
})();
