// Tests du changement de patch par le z : node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatchChanger } from '../public/js/midi-patch.js';

function gaussian(seed) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

test('0,00 puis une poussee dans le temps imparti : on change, dans le sens du z', () => {
  const p = createPatchChanger({ minimum: 0 });
  p.step(1.2, 0);
  assert.equal(p.step(0.003, 1000), null);
  assert.equal(p.step(0.8, 2000), 'suivant');
  p.step(0.002, 3000);
  assert.equal(p.step(-0.7, 4000), 'precedent');
});

test('pas de poussee assez franche : rien ne change', () => {
  const p = createPatchChanger({ minimum: 0 });
  p.step(1, 0); p.step(0.001, 1000);
  for (let t = 2; t < 5; t++) assert.equal(p.step(t % 2 ? 0.3 : -0.3, t * 1000), null);
});

test('poussee hors du temps imparti : rien ne change', () => {
  const p = createPatchChanger({ minimum: 0, fenetre: 5000 });
  p.step(1, 0); p.step(0.001, 1000);
  for (let t = 2; t < 7; t++) p.step(t % 2 ? 0.2 : -0.2, t * 1000);
  assert.equal(p.step(1.5, 7000), null, 'six secondes apres le 0,00');
});

test('dans le bon ordre seulement : une poussee avant le 0,00 ne compte pas', () => {
  const p = createPatchChanger({ minimum: 0 });
  p.step(1.5, 0);
  assert.equal(p.step(0.004, 1000), null);
  assert.equal(p.step(0.1, 2000), null);
});

test('temps minimum par patch : un 0,00 trop tot est ignore', () => {
  const p = createPatchChanger({ minimum: 180000 });
  p.step(1, 0);
  p.step(0.001, 60000);
  assert.equal(p.step(1, 61000), null);
  p.step(0.001, 181000);
  assert.equal(p.step(1, 182000), 'suivant');
});

test('le changement attend la fin de la phrase', () => {
  const p = createPatchChanger({ minimum: 0 });
  p.step(1, 0); p.step(0.001, 1000);
  assert.equal(p.step(1, 2000, { silence: false }), null);
  assert.equal(p.etat(2500).phase, 'attend-silence');
  assert.equal(p.step(0.5, 3000, { silence: false }), null);
  assert.equal(p.step(0.4, 4000, { silence: true }), 'suivant');
});

test('sans silence, il finit par changer quand meme', () => {
  const p = createPatchChanger({ minimum: 0, attenteMax: 120000 });
  p.step(1, 0); p.step(0.001, 1000); p.step(1, 2000, { silence: false });
  assert.equal(p.step(0.3, 100000, { silence: false }), null);
  assert.equal(p.step(0.2, 122000, { silence: false }), 'suivant');
});

test('source figee : le meme z repete ne fait rien', () => {
  const p = createPatchChanger({ minimum: 0 });
  p.step(1, 0);
  p.step(0.001, 1000);
  assert.equal(p.step(0.001, 2000), null);
  assert.equal(p.step(0.001, 3000), null);
});

test('dix heures de hasard : rythme des changements et minimum respecte', () => {
  const p = createPatchChanger();
  const g = gaussian(5);
  const quand = [];
  for (let t = 0; t < 10 * 3600; t++) {
    const r = p.step(g(), t * 1000, { silence: t % 20 < 12 });
    if (r) quand.push(t);
  }
  const ecarts = quand.slice(1).map((t, i) => t - quand[i]);
  const moyen = ecarts.reduce((a, b) => a + b, 0) / ecarts.length;
  console.log(`  10 h : ${quand.length} changements, un toutes les ${(moyen / 60).toFixed(1)} min en moyenne, le plus court ${(Math.min(...ecarts) / 60).toFixed(1)} min`);
  assert.ok(Math.min(...ecarts) >= 180);
  assert.ok(quand.length > 20 && quand.length < 200);
});
