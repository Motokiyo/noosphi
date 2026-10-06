// Tests de la mesure de coherence et des paliers musicaux : node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoherence } from '../public/js/midi-coherence.js';
import { createEngine, SCALES } from '../public/js/midi-engine.js';

function gaussian(seed) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

test('sous le pur hasard, la coherence forte reste rare', () => {
  const coh = createCoherence({ window: 60 });
  const g = gaussian(7);
  const time = [0, 0, 0, 0];
  const S = 200000;
  for (let t = 0; t < S; t++) time[coh.add(g()).level]++;
  const pct = time.map(n => 100 * n / S);
  console.log('  % du temps par palier :', pct.map(p => p.toFixed(1)).join(' / '));
  assert.ok(pct[2] + pct[3] < 8, 'coherence (>=2) sous 8 % du temps');
  assert.ok(pct[3] < 3, 'forte (>=2,5) sous 3 % du temps');
});

test('un cap tenu fait monter la coherence', () => {
  const coh = createCoherence({ window: 60 });
  let s;
  for (let i = 0; i < 60; i++) s = coh.add(0.4 + (i % 2) * 0.01);   // z legerement positifs, tous differents
  assert.ok(s.c > 3);
  assert.equal(s.level, 3);
  assert.equal(s.cc, 127);
});

test('une valeur figee est ecartee (source lente, telephone en veille)', () => {
  const coh = createCoherence({ window: 60 });
  let s;
  for (let i = 0; i < 60; i++) s = coh.add(1.3);
  assert.equal(s.n, 1);
  assert.equal(s.level, 0);
});

test('hysteresis : on ne sort de la coherence que sous 1,7', () => {
  const coh = createCoherence({ window: 4 });
  coh.add(1); coh.add(1.01); coh.add(1.02); let s = coh.add(1.03);   // C = 4,06/2 = 2,03
  assert.equal(s.level, 2);
  s = coh.add(0.6);                                                   // C = 3,66/2 = 1,83 : on reste
  assert.equal(s.level, 2);
  s = coh.add(-0.5);                                                  // C = 2,13/2 = 1,07 : on sort
  assert.equal(s.level, 0);
});

function setup() {
  const log = [];
  const e = createEngine({
    noteOn: (n, v) => log.push(['on', n, v]),
    noteOff: (n, v) => log.push(['off', n, v]),
  });
  e.configure({}, SCALES.chromatic, 0);
  return { e, log };
}

test('approche : gamme chromatique rendue pentatonique, pas conjoints', () => {
  const { e } = setup();
  const pent = [0, 2, 4, 7, 9];
  const n1 = e.sample(1.5, 0, 1);
  const n2 = e.sample(0.4, 1000, 1);      // ecart 1,1 >= seuil 0,7 en approche
  assert.ok(pent.includes(n1 % 12) && pent.includes(n2 % 12));
  assert.equal(n1, 64);                   // Do3 + round(1,5) = 2 degres pentatoniques = Mi
  assert.equal(n2, 64);                   // round(0,4) = 0 : meme note
});

test('coherence : chaque note de melodie recoit un accord de trois sons sur la voix harmonie', () => {
  const { e, log } = setup();
  const n = e.sample(1.5, 0, 2);
  const chord = log.filter(([k, , v]) => k === 'on' && v === 'h').map(([, x]) => x);
  assert.equal(chord.length, 3);
  assert.ok(chord.every(x => x < n));
});

test('forte : la melodie se pose sur le centre, puis plus rien ne bouge tant que ca dure', () => {
  const { e } = setup();
  assert.equal(e.sample(2, 0, 3), 60);
  assert.equal(e.state.phase, 'grace');
  assert.equal(e.sample(-2, 1000, 3), null);
  assert.equal(e.state.chord.length, 3);
  assert.equal(e.sample(1, 2000, 1) != null, true);   // la coherence retombe : la phrase repart
});

test('en sortant de la coherence, l accord est relache', () => {
  const { e } = setup();
  e.sample(1.5, 0, 2);
  e.sample(0.2, 5000, 0);
  e.tick(6000);
  assert.equal(e.state.chord.length, 0);
});

test('aucune note coincee en traversant tous les paliers, voix par voix', () => {
  const { e, log } = setup();
  const coh = createCoherence({ window: 20 });
  const g = gaussian(3);
  for (let t = 0; t < 20000; t++) {
    const z = g() + (t % 600 < 120 ? 0.5 : 0);    // des periodes de cap tenu
    e.sample(z, t * 1000, coh.add(z).level);
    for (let k = 0; k < 20; k++) e.tick(t * 1000 + k * 50);
  }
  e.panic();
  const on = new Map();
  for (const [k, n, v] of log) on.set(v + n, (on.get(v + n) || 0) + (k === 'on' ? 1 : -1));
  assert.ok([...on.values()].every(x => x === 0));
});
