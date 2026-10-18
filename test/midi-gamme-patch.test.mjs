import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireGammePatch } from '../public/js/midi-gamme-patch.js';

test('CC 104 canal 16 : le genre du patch', () => {
  assert.deepEqual(lireGammePatch([0xBF, 104, 3]), { gamme: 'minor', nom: 'Mineure' });
  assert.deepEqual(lireGammePatch([0xBF, 104, 1]), { gamme: 'pentatonic', nom: 'Pentatonique' });
});

test('valeur 0 : retour au reglage general', () => {
  assert.deepEqual(lireGammePatch([0xBF, 104, 0]), { gamme: null, nom: 'Générale' });
});

test('le reste est ignore', () => {
  assert.equal(lireGammePatch([0xB0, 104, 3]), undefined);   // autre canal
  assert.equal(lireGammePatch([0xBF, 102, 127]), undefined); // patch suivant
  assert.equal(lireGammePatch([0xBF, 104, 99]), undefined);  // valeur inconnue
  assert.equal(lireGammePatch([0xCF, 7]), undefined);        // changement de programme
});
