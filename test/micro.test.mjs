// Tests du micro comme generateur (banc d'essai du dashboard) : node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createExtracteur } = createRequire(import.meta.url)('../public/js/micro.js');

function hasard(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
// Un souffle : de petits entiers 16 bits autour de zero, rendus en flottants comme le navigateur
const souffle = (n, rnd, penche = 0.5) => Float32Array.from({ length: n }, () => {
  const k = Math.floor(rnd() * 8) * 2 + (rnd() < penche ? 1 : 0) - 8;
  return k / 32768;
});

test('un micro muet (que des zeros) se tait au lieu de mentir', () => {
  const x = createExtracteur();
  x.ajouter(new Float32Array(48000));
  assert.deepEqual(x.tirer(), []);
  assert.equal(x.controle().bitsUtiles, 0);
});

test('un bit bruit penché (70 % de 1) donne des tirages sans penchant apres la toilette', () => {
  const x = createExtracteur(), rnd = hasard(7);
  const zs = [];
  for (let s = 0; s < 40; s++) { x.ajouter(souffle(48000, rnd, 0.7)); zs.push(...x.tirer(10)); x.controle(); }
  const z = zs.reduce((a, b) => a + b, 0) / Math.sqrt(zs.length);
  assert.ok(zs.length >= 300, 'assez de tirages : ' + zs.length);
  assert.ok(Math.abs(z) < 3.5, 'z de l ensemble dans le hasard : ' + z);
});

test('controle : part de 1 avant toilette et debit de bits utiles', () => {
  const x = createExtracteur(), rnd = hasard(3);
  x.ajouter(souffle(10000, rnd, 0.7));
  const c = x.controle();
  assert.ok(c.partUns > 0.65 && c.partUns < 0.75);
  assert.equal(c.echantillons, 10000);
  assert.ok(c.bitsUtiles > 1500 && c.bitsUtiles < 2600);   // environ 2 x 0,7 x 0,3 x 5000 paires
  assert.equal(x.controle().echantillons, 0);               // remis a zero
});

test('au plus 10 tirages par seconde, et des octets pour l histogramme', () => {
  const x = createExtracteur(), rnd = hasard(9);
  x.ajouter(souffle(48000, rnd));
  assert.equal(x.tirer(10).length, 10);
  assert.equal(x.octets().length, 1000);
});
