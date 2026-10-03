#!/usr/bin/env node
/*
 * Test de non-régression — géométrie des zones ROMI1 (specialized-reader.js)
 *
 * Pourquoi ce test existe :
 * Le 03/10/2026, plusieurs zones (salary, ampl, hs150E, hs150RC, prime, habil,
 * mealRow) débordaient sur la ligne voisine du tableau PDF — jusqu'à 12pt de
 * débordement, invisible à la simple lecture du code. Pour la plupart des
 * champs ça se traduisait juste par un faux "missing" (lecture stricte à un
 * seul nombre), mais pour mealRow (qui accepte plusieurs nombres), ça pouvait
 * faire lire silencieusement la mauvaise valeur. Un bug comme celui-ci ne se
 * voit qu'en superposant les zones au pixel sur un vrai PDF rendu — ce test
 * automatise l'invariant qui aurait permis de l'attraper avant livraison :
 * deux zones de Z ne doivent jamais se chevaucher géométriquement, sur la
 * même page.
 *
 * Usage (aucune dépendance, Node seul) :
 *   node specialized-reader-zones.test.js /chemin/vers/specialized-reader.js
 * Code de sortie 0 si tout passe, 1 sinon (utilisable dans un script CI/Termux).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const target = process.argv[2] ||
  path.join(__dirname, 'app/src/main/assets/web/scripts/specialized-reader.js');

if (!fs.existsSync(target)) {
  console.error('Fichier introuvable : ' + target);
  process.exit(1);
}

const src = fs.readFileSync(target, 'utf8');

// Extraction du bloc "const Z={ ... };" par comptage d'accolades — robuste
// aux commentaires et aux retours à la ligne à l'intérieur du bloc.
const start = src.indexOf('const Z={');
if (start === -1) {
  console.error('Bloc "const Z={" introuvable dans ' + target);
  process.exit(1);
}
let depth = 0, i = start + 'const Z='.length, end = -1;
for (; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end === -1) {
  console.error('Bloc Z mal formé (accolades non équilibrées) dans ' + target);
  process.exit(1);
}
const literal = src.slice(start + 'const Z='.length, end);

let Z;
try {
  // Littéral de données pur (nombres/objets) — aucune logique applicative
  // n'est exécutée, seulement l'objet de coordonnées lui-même.
  Z = Function('"use strict";return (' + literal + ');')();
} catch (e) {
  console.error('Échec de lecture du bloc Z : ' + e.message);
  process.exit(1);
}

const names = Object.keys(Z);
let failures = 0;

function overlaps(a, b) {
  if (a.p !== b.p) return false; // pages différentes = jamais de conflit
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

// 1) Aucune paire de zones ne doit se chevaucher géométriquement.
for (let x = 0; x < names.length; x++) {
  for (let y = x + 1; y < names.length; y++) {
    const a = Z[names[x]], b = Z[names[y]];
    if (overlaps(a, b)) {
      failures++;
      console.error(
        `❌ Chevauchement : "${names[x]}" ${JSON.stringify(a)} ` +
        `et "${names[y]}" ${JSON.stringify(b)}`
      );
    }
  }
}

// 2) Chaque zone doit avoir des bornes cohérentes (x1>x0, y1>y0) — attrape
//    une inversion de coordonnées lors d'une future recalibration manuelle.
for (const name of names) {
  const z = Z[name];
  if (!(z.x1 > z.x0) || !(z.y1 > z.y0)) {
    failures++;
    console.error(`❌ Bornes invalides pour "${name}" : ${JSON.stringify(z)}`);
  }
}

// 3) Repères connus (mesurés au pixel le 03/10/2026 sur un relevé réel) :
//    si l'un de ces champs sort de la plage de sa vraie ligne de grille,
//    c'est très probablement une régression plutôt qu'une correction.
const knownRows = {
  salary:  [216.2, 226.8],
  ampl:    [226.8, 238.2],
  hs125E:  [238.2, 260.8], // ligne "Heures normales" non lue incluse par tolérance
  hs125P:  [238.2, 260.8],
  hs150E:  [260.8, 272.0],
  hs150RC: [260.8, 272.0],
  prime:   [272.0, 283.5],
  habil:   [283.5, 294.8],
  mealRow: [294.8, 317.5],
};
for (const [name, [lo, hi]] of Object.entries(knownRows)) {
  const z = Z[name];
  if (!z) continue;
  if (z.y0 < lo - 0.5 || z.y1 > hi + 0.5) {
    failures++;
    console.error(
      `❌ "${name}" (y0:${z.y0}, y1:${z.y1}) sort de sa ligne connue ` +
      `[${lo} ; ${hi}]`
    );
  }
}

if (failures) {
  console.error(`\n${failures} problème(s) détecté(s) sur ${names.length} zones.`);
  process.exit(1);
}
console.log(`✅ ${names.length} zones OK — aucun chevauchement, bornes cohérentes.`);
process.exit(0);
