// Tests de la voix back (nappes) : node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBack } from '../public/js/midi-back.js';

function setup(cfg = {}, root = 0) {
  const log = [];
  const b = createBack({
    noteOn: (n, at) => log.push(['on', n, at]),
    noteOff: (n, at) => log.push(['off', n, at]),
  });
  b.configure(cfg, root, 60, 21, 108);
  return { b, log };
}

function gaussian(seed) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

test('muette tant qu on ne l a pas lancee', () => {
  const { b, log } = setup();
  for (let t = 0; t < 30; t++) { b.add(1 + t * 0.01); b.update(t * 1000); }
  assert.deepEqual(log, []);
});

test('entre sur le pilier d accueil, une octave sous le centre, quand la tendance est nulle', () => {
  const { b, log } = setup();
  b.start(0);
  assert.deepEqual(log, [['on', 48, 0]]);      // Do2 sous le centre Do3
});

test('ne joue que les piliers I, IV, V de la gamme', () => {
  const { b, log } = setup({ tenueMin: 1000 }, 9);   // La majeur : La, Re, Mi
  b.start(0);
  const g = gaussian(5);
  for (let t = 0; t < 3000; t++) { b.add(g() + (t % 400 < 100 ? 0.6 : 0)); b.update(t * 1000); }
  const piliers = new Set([9, 2, 4]);
  const on = log.filter(([k]) => k === 'on').map(([, n]) => n);
  assert.ok(on.length > 5);
  assert.ok(on.every(n => piliers.has(n % 12)), `notes hors piliers : ${on.filter(n => !piliers.has(n % 12))}`);
});

test('une tendance qui monte fait monter la back', () => {
  const { b, log } = setup({ tenueMin: 0 });
  b.start(0);
  for (let t = 1; t <= 20; t++) { b.add(0.8 + t * 0.001); b.update(t * 1000); }   // T ~ 3,6
  const last = log.filter(([k]) => k === 'on').at(-1)[1];
  assert.ok(last > 48);
});

test('chaque note tient au moins tenueMin', () => {
  const { b, log } = setup({ tenueMin: 6000 });
  b.start(0);
  const g = gaussian(11);
  for (let t = 1; t < 5000; t++) { b.add(g() * 2); b.update(t * 1000); }
  const on = log.filter(([k]) => k === 'on');
  for (let i = 1; i < on.length; i++) assert.ok(on[i][2] - on[i - 1][2] >= 6000);
});

test('passage lie : la nouvelle note entre avant que l ancienne s eteigne', () => {
  const { b, log } = setup({ tenueMin: 0, liaison: 300 });
  b.start(0);
  for (let t = 1; t <= 20; t++) { b.add(1 + t * 0.001); b.update(t * 1000); }
  const iOn = log.findIndex(([k, n]) => k === 'on' && n !== 48);
  const off48 = log.find(([k, n]) => k === 'off' && n === 48);
  assert.ok(iOn >= 0 && off48);
  assert.equal(off48[2], log[iOn][2] + 300);   // relache 300 ms apres l'entree de la suivante
});

test('stop : la nappe s eteint, et tout ce qui a ete allume est eteint', () => {
  const { b, log } = setup({ tenueMin: 1000 });
  b.start(0);
  const g = gaussian(2);
  for (let t = 1; t < 600; t++) { b.add(g() * 1.5); b.update(t * 1000); }
  b.stop(600000);
  const on = new Map();
  for (const [k, n] of log) on.set(n, (on.get(n) || 0) + (k === 'on' ? 1 : -1));
  assert.ok([...on.values()].every(v => v === 0));
  assert.equal(b.state.sounding, null);
});

test('start deux fois : une seule nappe', () => {
  const { b, log } = setup();
  b.start(0);
  b.start(1000);
  assert.equal(log.length, 1);
});

test('au hasard pur, des notes longues : mediane d au moins 10 s', () => {
  const { b, log } = setup();                  // reglages par defaut
  b.start(0);
  const g = gaussian(9);
  for (let t = 1; t < 36000; t++) { b.add(g()); b.update(t * 1000); }
  const on = log.filter(([k]) => k === 'on').map(([, , at]) => at);
  const durees = on.slice(1).map((t, i) => t - on[i]).sort((a, c) => a - c);
  const med = durees[Math.floor(durees.length / 2)];
  console.log(`  back : ${durees.length + 1} notes en 10 h, duree mediane ${(med / 1000).toFixed(0)} s`);
  assert.ok(med >= 10000);
});
