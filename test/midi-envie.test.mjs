// Tests de l'envie de jouer : node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvie } from '../public/js/midi-envie.js';

test('se tait tant que la coherence reste sous le seuil', () => {
  const e = createEnvie({ seuil: 1.5 });
  for (let t = 0; t < 120; t++) assert.equal(e.update(1.4, 60, t * 1000).joue, false);
});

test('entre des que le seuil est atteint, et s engage pour une minute', () => {
  const e = createEnvie({ seuil: 1.5 });
  const entree = e.update(1.6, 60, 0);
  assert.equal(entree.joue, true);
  assert.equal(entree.change, true);
  // la coherence retombe : il finit quand meme sa minute
  assert.equal(e.update(0.2, 60, 30000).joue, true);
  assert.equal(e.update(0.2, 60, 59999).joue, true);
  const sortie = e.update(0.2, 60, 60000);
  assert.equal(sortie.joue, false);
  assert.equal(sortie.change, true);
});

test('au bout de la minute, une minute de plus si le z est encore au-dessus', () => {
  const e = createEnvie({ seuil: 1.5 });
  e.update(1.6, 60, 0);
  assert.equal(e.update(1.8, 60, 60000).joue, true);    // reprend jusqu'a 120 s
  assert.equal(e.update(0.5, 60, 90000).joue, true);
  assert.equal(e.update(0.5, 60, 120000).joue, false);
});

test('pas d entree sur trop peu de tirages', () => {
  const e = createEnvie({ seuil: 1.5 });
  assert.equal(e.update(2.5, 3, 0).joue, false);
});

test('seuil 0 : joue toujours', () => {
  const e = createEnvie({ seuil: 0 });
  assert.equal(e.update(0, 0, 0).joue, true);
});

test('au hasard pur, seuil 1,5 : joue entre 30 et 55 % du temps', async () => {
  const { createCoherence } = await import('../public/js/midi-coherence.js');
  let graine = 7;
  const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(alea())) * Math.cos(2 * Math.PI * alea());
  const coh = createCoherence({ window: 60 });
  const e = createEnvie({ seuil: 1.5 });
  let joue = 0;
  const N = 20 * 3600;
  for (let t = 0; t < N; t++) {
    const s = coh.add(gauss());
    if (e.update(s.c, s.n, t * 1000).joue) joue++;
  }
  const part = joue / N;
  assert.ok(part > 0.3 && part < 0.55, `part jouee ${part}`);
});
