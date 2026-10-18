// Tests des traits rapides (option) : node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, SCALES, scaleNotes } from '../public/js/midi-engine.js';
import { createBack } from '../public/js/midi-back.js';
import { createEnvie } from '../public/js/midi-envie.js';
import { createCoherence } from '../public/js/midi-coherence.js';
import { createScene } from '../public/js/midi-scene.js';

function gaussian(seed) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

function setup(traits) {
  const log = [];   // [genre, note, voix, heure]
  const engine = createEngine({
    noteOn: (n, v, at) => log.push(['on', n, v, at]),
    noteOff: (n, v, at) => log.push(['off', n, v, at]),
  });
  engine.configure({ traits }, SCALES.pentatonic, 0);
  const back = createBack({ noteOn() {}, noteOff() {} });
  back.configure({}, 0, 60, 21, 108);
  const scene = createScene({ engine, back, envie: createEnvie({ haut: 0, bas: 0 }), coherence: createCoherence({ window: 60 }) });
  const g = gaussian(17);
  const run = t => {
    const z = g();
    const at = t * 1000 + (Math.abs(z) % 1) * 1000;
    scene.step(z, t * 1000, { at, entree: 0 });
    engine.tick(t * 1000 + 1000);
  };
  return { log, engine, run };
}

// Durees des notes de lead, et ecarts entre deux debuts de notes
function mesures(log) {
  const ouvertes = new Map(), durees = [], debuts = [];
  for (const [k, n, v, at] of log.filter(e => e[2] === 'm').sort((a, b) => a[3] - b[3] || (a[0] === 'off' ? -1 : 1))) {
    if (k === 'on') { ouvertes.set(n, at); debuts.push(at); }
    else if (ouvertes.has(n)) { durees.push(at - ouvertes.get(n)); ouvertes.delete(n); }
  }
  const ecarts = debuts.slice(1).map((t, i) => t - debuts[i]);
  return { durees, ecarts };
}

test('sans traits, une note de lead par seconde au plus', () => {
  const { log, run } = setup(false);
  for (let t = 0; t < 3600; t++) run(t);
  const { ecarts } = mesures(log);
  assert.ok(Math.min(...ecarts) > 0);
  const parSeconde = new Map();
  for (const [k, , v, at] of log) if (k === 'on' && v === 'm') { const s = Math.floor(at / 1000); parSeconde.set(s, (parSeconde.get(s) || 0) + 1); }
  assert.ok([...parSeconde.values()].every(c => c === 1));
});

test('avec traits : des notes rapides, et les notes longues restent', () => {
  const { log, run } = setup(true);
  for (let t = 0; t < 3600; t++) run(t);
  const { durees, ecarts } = mesures(log);
  const rapides = ecarts.filter(e => e < 200).length;
  const longues = durees.filter(d => d >= 3000).length;
  console.log(`  1 h : ${rapides} enchainements rapides (< 0,2 s), ${longues} notes de 3 s et plus, plus longue ${(Math.max(...durees) / 1000).toFixed(0)} s`);
  assert.ok(rapides > 100, 'des traits');
  assert.ok(longues > 20, 'des tenues');
});

test('avec traits : toutes les notes dans la gamme, aucune ne reste allumee', () => {
  const { log, engine, run } = setup(true);
  for (let t = 0; t < 10 * 3600; t++) run(t);
  engine.tick(Infinity);
  const gamme = new Set(scaleNotes(SCALES.pentatonic, 0, 21, 108));
  assert.ok(log.filter(e => e[0] === 'on' && e[2] === 'm').every(e => gamme.has(e[1])));
  const open = new Map();
  for (const [k, n, v] of log) open.set(v + n, (open.get(v + n) || 0) + (k === 'on' ? 1 : -1));
  assert.ok([...open.values()].every(x => x === 0 || x === 1), 'jamais deux fois allumee');
  const allumees = [...open].filter(([, x]) => x === 1).map(([k]) => k).sort();
  const { sounding, chord } = engine.state;
  assert.deepEqual(allumees, [...(sounding != null ? ['m' + sounding] : []), ...chord.map(n => 'h' + n)].sort());
});

test('avec traits : chaque trait finit avant la lecture suivante', () => {
  const { log, run } = setup(true);
  for (let t = 0; t < 3600; t++) run(t);
  const parSeconde = new Map();
  for (const [k, , v, at] of log) if (k === 'on' && v === 'm') { const s = Math.floor(at / 1000); parSeconde.set(s, (parSeconde.get(s) || 0) + 1); }
  // une seconde peut porter un trait entier, jamais deux lectures melangees
  assert.ok(Math.max(...parSeconde.values()) <= 1 + 4);
});
