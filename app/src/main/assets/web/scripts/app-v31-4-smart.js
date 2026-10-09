/*
 * MesHeures V34.1.2 — Smart Control
 * Moteur de contrôle uniquement.
 * Aucun timer / observer / listener global / renderer.
 */

(function () {
  'use strict';

  const V = '37.3.0';

  function getDays() {
    // V37.0-A : DB est une variable globale (let) d'app-core.js, absente de window.
    return (typeof DB !== 'undefined' && DB && DB.days) || {};
  }

  function isWork(day) {
    const type = String(day?.t || '').toUpperCase();
    return type === 'T' || type === 'NUIT';
  }

  function safeDay(key) {
    try {
      if (typeof window.MH30DataEngine?.day === 'function') {
        return window.MH30DataEngine.day(key) || {};
      }

      if (typeof window.cd === 'function') {
        return window.cd(key) || {};
      }
    } catch (_) {}

    return {};
  }

  function anomalies() {
    try {
      const fn = window.MH302?.anomalies;
      return typeof fn === 'function' ? (fn() || []) : [];
    } catch (_) {
      return [];
    }
  }

  function previousDate(key) {
    const d = new Date(key + 'T12:00:00');
    d.setDate(d.getDate() - 1);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${y}-${m}-${day}`;
  }

  function dossier() {
    const days = getDays();
    const list = anomalies();

    const byDay = {};

    for (const item of list) {
      if (!item?.k) continue;

      if (!byDay[item.k]) {
        byDay[item.k] = [];
      }

      byDay[item.k].push(item);
    }

    const keys = Object.keys(days)
      .filter(k => isWork(days[k]))
      .sort()
      .slice(-28);

    let complete = 0;
    let toComplete = 0;
    let toCheck = 0;
    let critical = 0;

    const items = [];

    for (const k of keys) {
      const anomaliesForDay = byDay[k] || [];

      if (!anomaliesForDay.length) {
        complete++;
        continue;
      }

      const criticalDay = anomaliesForDay.some(x =>
        x.level === 'bad' ||
        x.tone === 'bad' ||
        x.severity === 'critical'
      );

      const incomplete = anomaliesForDay.some(x =>
        String(x.title || '').toLowerCase().includes('incompl')
      );

      const first = anomaliesForDay[0] || {};

      if (criticalDay) {
        critical++;
        items.push({
          k,
          level: 'bad',
          title: first.title || 'Point critique',
          text: first.text || 'Contrôle prioritaire.'
        });
      } else if (incomplete) {
        toComplete++;
        items.push({
          k,
          level: 'warn',
          title: first.title || 'Journée à compléter',
          text: first.text || 'Des données sont manquantes.'
        });
      } else {
        toCheck++;
        items.push({
          k,
          level: 'warn',
          title: first.title || 'Journée à vérifier',
          text: first.text || 'Un contrôle est recommandé.'
        });
      }
    }

    return {
      complete,
      toComplete,
      toCheck,
      critical,
      total: keys.length,
      items
    };
  }

  function reconciliation() {
    /*
     * V31.4 prépare le rapprochement sans supposer
     * une structure de bulletin qui pourrait varier.
     */
    try {
      const db = window.DB || {};
      const bulletins = Array.isArray(db.bulletins)
        ? db.bulletins
        : [];

      if (!bulletins.length) {
        return {
          available: false,
          flagged: 0,
          critical: 0
        };
      }

      return {
        available: true,
        flagged: 0,
        critical: 0
      };
    } catch (_) {
      return {
        available: false,
        flagged: 0,
        critical: 0
      };
    }
  }

  function score(dossierData, reconciliationData) {
    let value = 100;

    value -= Math.min(40, dossierData.critical * 20);
    value -= Math.min(24, dossierData.toComplete * 8);
    value -= Math.min(20, dossierData.toCheck * 4);

    if (reconciliationData.available) {
      value -= Math.min(20, reconciliationData.critical * 10);
      value -= Math.min(
        10,
        Math.max(
          0,
          reconciliationData.flagged - reconciliationData.critical
        ) * 3
      );
    }

    return Math.max(0, Math.min(100, value));
  }

  function status(value) {
    if (value >= 90) {
      return {
        tone: 'ok',
        label: 'Dossier maîtrisé'
      };
    }

    if (value >= 70) {
      return {
        tone: 'warn',
        label: 'À surveiller'
      };
    }

    return {
      tone: 'bad',
      label: 'Contrôle prioritaire'
    };
  }

  function audit() {
    /* V37.0-A : le score vient de MHControl (règles explicables, données réelles).
       Aucun jour analysé : score null et « Données insuffisantes », jamais 100/100. */
    const C = window.MHControl;
    if (C && typeof C.analyze === 'function') {
      const s = C.analyze();
      const tone = s.status === 'insufficient' ? 'mut' : s.status;
      return {
        version: V,
        score: s.score,
        status: { tone, label: s.label },
        explanation: s.explanation,
        counts: s.counts,
        control: s,
        priority: s.groups.slice(0, 3).map(g => ({
          k: g.key, level: g.level === 'bad' ? 'bad' : 'warn',
          title: g.label, text: g.alerts.map(a => a.title).join(' · ')
        }))
      };
    }
    const d = dossier();
    const r = reconciliation();
    const value = score(d, r);

    const priority = d.items
      .slice()
      .sort((a, b) => {
        const rank = {
          bad: 0,
          warn: 1
        };

        return (rank[a.level] ?? 2) - (rank[b.level] ?? 2);
      })
      .slice(0, 3);

    return {
      version: V,
      score: value,
      status: status(value),
      dossier: d,
      reconciliation: r,
      priority
    };
  }

  window.MH314 = {
    version: V,
    audit,
    dossier,
    reconciliation
  };

})();
