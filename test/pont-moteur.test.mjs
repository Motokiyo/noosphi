// Le moteur de la page « U1 corrigé » doit écrire le même journal que le pont Thétys v4 en C
// (VegeOhm/docs/thetys-oui-non/outils/pont-thetys.c, binaire x86 du vieux Mac, sans fusion
// multiplication-addition). Référence produite par `pont-thetys --rejoue` sur un extrait de la
// séance 8 (07/11/2026, Res L, Gain 1/2 puis max puis 3/4, Note 1). Vérifié aussi hors test,
// le 08/11/2026, sur 1 140 409 lignes (relevé de quatre jours) et sur six variantes de réglages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rejouer } from '../public/js/pont-moteur.js';

const F = new URL('./fixtures/', import.meta.url);
const t0 = +readFileSync(new URL('pont-seance-8-extrait-T0.txt', F), 'utf8').trim();
const csv = readFileSync(new URL('pont-seance-8-extrait.csv', F), 'utf8');
const ref = readFileSync(new URL('pont-seance-8-extrait-journal-c.csv', F), 'utf8').split('\n').slice(1).filter(Boolean);

test('pont-moteur : journal identique au pont en C, ligne à ligne', () => {
  const { lignes } = rejouer(csv, { t0 });
  assert.equal(lignes.length, ref.length);
  for (let i = 0; i < ref.length; i++) assert.equal(lignes[i], ref[i], `ligne ${i + 2}`);
});

test('pont-moteur : il joue, recoud et passe par les couches sur cet extrait', () => {
  const { etat, sorties } = rejouer(csv, { t0, journal: false });
  assert.ok(etat.stats.notes_jouees > 100);
  assert.ok(etat.stats.recentrages > 0 && etat.stats.arrivees > 0 && etat.stats.sommets > 0);
  assert.ok(sorties.some(s => s[0] === 3), 'le geste a joué');
});
