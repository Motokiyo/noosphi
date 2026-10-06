// Tests du moteur de phrases MIDI : node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, scaleNotes, SCALES } from '../public/js/midi-engine.js';

function setup(cfg = {}, scale = SCALES.chromatic, root = 0) {
  const log = [];
  const e = createEngine({
    noteOn: n => log.push(['on', n]),
    noteOff: n => log.push(['off', n]),
  });
  e.configure(cfg, scale, root);
  return { e, log };
}

test('aucune note tant que le z bouge moins que le seuil', () => {
  const { e, log } = setup();
  assert.equal(e.sample(1.4, 0), null);
  assert.equal(e.sample(-1.0, 1000), null);
  assert.deepEqual(log, []);
});

test('la premiere note part du centre, les suivantes de la note en cours', () => {
  const { e } = setup();                    // centre 60, gain 2, chromatique
  assert.equal(e.sample(1.5, 0), 63);       // 60 + 3
  assert.equal(e.sample(-2, 1000), 59);     // 63 - 4, pas 60 - 4
});

test('la note precedente sonne au moins la duree minimale', () => {
  const { e, log } = setup({ minDur: 500 });
  e.sample(1.5, 0);
  e.sample(-1.0, 200);                      // 63 - 2 = 61, arrive avant 500 ms
  assert.deepEqual(log, [['on', 63], ['on', 61]]);
  e.tick(499);
  assert.equal(log.length, 2);
  e.tick(500);
  assert.deepEqual(log.at(-1), ['off', 63]);
});

test('retour au centre = cadence, puis silence, puis nouvelle phrase depuis le centre', () => {
  const { e, log } = setup();
  e.sample(2, 0);                           // 64
  assert.equal(e.sample(-2, 1000), 60);     // retour au centre
  assert.equal(e.state.phase, 'cadence');
  assert.equal(e.sample(-1.0, 2000), null); // mouvement < seuil : la note finale tient
  assert.equal(e.state.sounding, 60);
  assert.equal(e.sample(2.5, 3000), null);  // ce mouvement ouvre le silence
  assert.deepEqual(log.at(-1), ['off', 60]);
  assert.equal(e.state.phase, 'silence');
  assert.equal(e.state.sounding, null);
  assert.equal(e.sample(1.5, 4000), 63);    // nouvelle phrase, depuis le centre
});

test('toucher un bord du clavier termine aussi la phrase', () => {
  const { e } = setup({ low: 55, high: 65 });
  assert.equal(e.sample(4, 0), 65);
  assert.equal(e.state.phase, 'cadence');
});

test('la gamme est respectee', () => {
  const { e } = setup({}, SCALES.pentatonic, 0);
  const notes = scaleNotes(SCALES.pentatonic, 0, 21, 108);
  const n = e.sample(1.5, 0);
  assert.ok(notes.includes(n));
  assert.equal(n, 67);                      // Do + 3 degres pentatoniques = Sol
});

test('panique : plus aucune note ne sonne', () => {
  const { e, log } = setup({ minDur: 500 });
  e.sample(1.5, 0);
  e.sample(-1.0, 100);                      // 63 en attente de relachement, 61 sonne
  e.panic();
  const on = new Set();
  for (const [k, n] of log) k === 'on' ? on.add(n) : on.delete(n);
  assert.equal(on.size, 0);
});

test('100 heures de hasard : jamais de note coincee, phrases et silences varies', () => {
  const { e, log } = setup({}, SCALES.pentatonic, 0);
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let phrases = 0, prev = 'silence';
  for (let t = 0; t < 360000; t++) {
    e.sample(gauss(), t * 1000);
    for (let k = 0; k < 20; k++) e.tick(t * 1000 + k * 50);
    if (prev !== 'phrase' && e.state.phase === 'phrase') phrases++;
    prev = e.state.phase;
  }
  e.panic();
  const on = new Map();
  for (const [k, n] of log) on.set(n, (on.get(n) || 0) + (k === 'on' ? 1 : -1));
  assert.ok([...on.values()].every(v => v === 0), 'chaque note allumee est eteinte');
  console.log(`  ${(phrases / 100).toFixed(0)} phrases par heure`);
  assert.ok(phrases / 100 > 10 && phrases / 100 < 200);
});
