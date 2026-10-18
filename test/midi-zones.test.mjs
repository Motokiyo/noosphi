// Tests des deux zones, nappe et jeu chacun ses seuils : node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, SCALES } from '../public/js/midi-engine.js';
import { createBack } from '../public/js/midi-back.js';
import { createEnvie } from '../public/js/midi-envie.js';
import { createCoherence } from '../public/js/midi-coherence.js';
import { createScene } from '../public/js/midi-scene.js';

function gaussian(seed) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

function setup({ nappe = [1.5, 1.5], jeu = [1.5, 1.5] } = {}) {
  const log = [];   // [genre, note, voix, heure]
  const engine = createEngine({
    noteOn: (n, v, at) => log.push(['on', n, v, at]),
    noteOff: (n, v, at) => log.push(['off', n, v, at]),
  });
  engine.configure({}, SCALES.pentatonic, 0);
  const back = createBack({
    noteOn: (n, at) => log.push(['on', n, 'b', at]),
    noteOff: (n, at) => log.push(['off', n, 'b', at]),
  });
  back.configure({}, 0, 60, 21, 108);
  const envieNappe = createEnvie({ haut: nappe[0], bas: nappe[1] });
  const envieJeu = createEnvie({ haut: jeu[0], bas: jeu[1] });
  const coherence = createCoherence({ window: 60 });
  const scene = createScene({ engine, back, envieNappe, envieJeu, coherence });
  const run = (z, t) => {
    const r = scene.step(z, t * 1000);
    for (let k = 0; k < 20; k++) engine.tick(t * 1000 + k * 50);
    return r;
  };
  const joue = v => log.some(([k, , voix]) => k === 'on' && voix === v);
  return { log, engine, back, scene, run, joue };
}

test('nappe seule : la nappe joue, le jeu se tait', () => {
  const { run, joue } = setup({ nappe: [0, 0], jeu: [9, 9] });
  for (let t = 0; t < 120; t++) run(t % 2 ? 1 : -1, t);
  assert.ok(joue('b'), 'la nappe joue');
  assert.ok(!joue('m') && !joue('h'), 'ni lead ni accords');
});

test('jeu seul : la lead entre tout de suite, sans nappe', () => {
  const { run, joue } = setup({ nappe: [9, 9], jeu: [0, 0] });
  for (let t = 0; t < 3; t++) run(t % 2 ? 2 : -2, t);
  assert.ok(joue('m'), 'la lead n attend pas une nappe qui ne vient pas');
  for (let t = 3; t < 120; t++) run(t % 2 ? 2 : -2, t);
  assert.ok(!joue('b'), 'pas de nappe');
});

test('nappe d abord, puis le jeu quand la coherence monte encore', () => {
  const { run } = setup({ nappe: [1, 9], jeu: [2.5, 9] });
  let nappeAt = null, jeuAt = null;
  for (let t = 0; t < 200; t++) {
    const r = run(0.4 + (t % 3) * 0.02, t);   // la coherence monte lentement
    if (nappeAt == null && r.nappe.joue) nappeAt = t;
    if (jeuAt == null && r.jeu.joue) jeuAt = t;
  }
  assert.ok(nappeAt != null && jeuAt != null && nappeAt < jeuAt, `nappe ${nappeAt}, jeu ${jeuAt}`);
});

test('la nappe sort pendant que le jeu continue : elle tient la queue, puis s eteint', () => {
  const { back, engine, run } = setup({ nappe: [1, 9], jeu: [0, 0] });
  let t = 0;
  for (; t < 70; t++) run(0.6 + (t % 3) * 0.05, t);
  assert.equal(back.state.active, true);
  let sortie = null, fin = null;
  for (; t < 400 && fin == null; t++) {
    const r = run(t % 2 ? 0.2 : -0.2, t);
    if (sortie == null && r.nappe.change && !r.nappe.joue) sortie = t;
    if (sortie != null && !back.state.active) fin = t;
    assert.equal(r.jeu.joue, true);
  }
  assert.ok(sortie != null && fin != null, `sortie ${sortie}, fin ${fin}`);
  assert.ok(fin - sortie >= 4, 'la queue est tenue');
  assert.equal(engine.state.draining, false, 'le jeu ne s arrete pas');
});

test('fondus separes : la nappe redescend, le jeu reste plein', () => {
  const { scene, back, run } = setup({ nappe: [1, 9], jeu: [0, 0] });
  let t = 0;
  for (; t < 70; t++) run(0.6 + (t % 3) * 0.05, t);
  for (; t < 400 && back.state.active; t++) run(t % 2 ? 0.2 : -0.2, t);
  assert.equal(Math.round(scene.exprAt(t * 1000)), 0);
  assert.equal(Math.round(scene.exprJeuAt(t * 1000)), 127);
});

test('40 heures de hasard, zones differentes : jamais de note coincee', () => {
  const { log, engine, back, run } = setup({ nappe: [1, 2], jeu: [2, 1] });
  const g = gaussian(12);
  for (let t = 0; t < 40 * 3600; t++) run(g() + (t % 900 < 150 ? 0.4 : t % 900 > 750 ? -0.4 : 0), t);
  engine.tick(Infinity);
  const open = new Map();
  for (const [k, n, v] of log) open.set(v + n, (open.get(v + n) || 0) + (k === 'on' ? 1 : -1));
  assert.ok([...open.values()].every(x => x === 0 || x === 1), 'jamais deux fois allumee');
  const allumees = [...open].filter(([, x]) => x === 1).map(([k]) => k).sort();
  const { sounding, chord } = engine.state;
  const attendues = [
    ...(sounding != null ? ['m' + sounding] : []),
    ...chord.map(n => 'h' + n),
    ...(back.state.sounding != null ? ['b' + back.state.sounding] : []),
  ].sort();
  assert.deepEqual(allumees, attendues);
});

test('40 heures, zones differentes : on entend les trois moments', () => {
  const { run } = setup({ nappe: [1, 2], jeu: [2, 1] });
  const g = gaussian(5);
  const vu = { nappe: 0, deux: 0, jeu: 0 };
  for (let t = 0; t < 40 * 3600; t++) {
    const r = run(g() + (t % 900 < 150 ? 0.4 : t % 900 > 750 ? -0.4 : 0), t);
    if (r.nappe.joue && r.jeu.joue) vu.deux++;
    else if (r.nappe.joue) vu.nappe++;
    else if (r.jeu.joue) vu.jeu++;
  }
  console.log(`  secondes : nappe seule ${vu.nappe}, les deux ${vu.deux}, jeu seul ${vu.jeu}`);
  assert.ok(vu.nappe > 0 && vu.deux > 0 && vu.jeu > 0);
});
