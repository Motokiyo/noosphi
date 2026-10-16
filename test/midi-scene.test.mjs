// Tests des passages entre scenes, les trois voix ensemble : node --test test/*.test.mjs
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

function setup({ haut = 1.5, bas = 1.5 } = {}) {
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
  const envie = createEnvie({ haut, bas });
  const coherence = createCoherence({ window: 60 });
  const scene = createScene({ engine, back, envie, coherence });
  const run = (z, t) => {
    const r = scene.step(z, t * 1000);
    for (let k = 0; k < 20; k++) engine.tick(t * 1000 + k * 50);
    return r;
  };
  return { log, engine, back, scene, run };
}

test('entree : la nappe d abord, la lead seulement apres le delai d entree', () => {
  const { log, run } = setup({ haut: 0, bas: 0 });   // joue toujours : scene des la premiere seconde
  for (let t = 0; t < 4; t++) run(t % 2 ? 2 : -2, t);
  assert.ok(log.some(([k, , v]) => k === 'on' && v === 'b'), 'la nappe est entree');
  assert.ok(!log.some(([k, , v]) => k === 'on' && v === 'm'), 'la lead attend');
  for (let t = 4; t < 10; t++) run(t % 2 ? 2 : -2, t);
  assert.ok(log.some(([k, , v]) => k === 'on' && v === 'm'), 'la lead est entree');
});

test('sortie : la phrase finit, puis la nappe tient la queue, puis plus rien ne sonne', () => {
  const { log, engine, back, run } = setup();
  let t = 0;
  for (; t < 70; t++) run(0.6 + (t % 3) * 0.05, t);          // cap tenu : la scene s'ouvre
  assert.equal(back.state.active, true);
  const g = gaussian(4);
  let sortie = null, finLead = null, finBack = null;
  for (; t < 400; t++) {
    const r = run(g() * 0.3 - 0.2 * Math.sign(t % 2 - 0.5), t);   // coherence qui retombe
    if (sortie == null && r.scene.change && !r.scene.joue) sortie = t;
    if (sortie != null && finLead == null && !engine.state.draining) finLead = t;
    if (finLead != null && finBack == null && !back.state.active) finBack = t;
  }
  assert.ok(finLead != null && finBack != null, `fin lead ${finLead}, fin back ${finBack}`);
  assert.ok(finBack - finLead >= 4, 'la nappe s eteint apres la lead');
  const on = new Map();
  for (const [k, n, v] of log) on.set(v + n, (on.get(v + n) || 0) + (k === 'on' ? 1 : -1));
  assert.ok([...on.values()].every(x => x === 0), 'tout ce qui a ete allume est eteint');
});

test('la derniere note de lead d une scene est une cadence sur le centre', () => {
  const { log, engine, run } = setup();
  const g = gaussian(21);
  let fins = 0, surCentre = 0, reprises = 0, prevDraining = false;
  for (let t = 0; t < 40 * 3600; t++) {
    const r = run(g(), t);
    if (engine.state.draining) prevDraining = true;
    else if (prevDraining) {
      prevDraining = false;
      if (r.scene.joue) { reprises++; continue; }   // la scene est revenue : la phrase a repris
      fins++;
      const last = log.filter(([k, , v]) => k === 'on' && v === 'm').at(-1);
      if (last && last[1] === 60) surCentre++;
    }
  }
  console.log(`  ${fins} fins de scene en 40 h, ${surCentre} sur le centre, ${reprises} reprises en cours de fin`);
  assert.ok(fins > 20);
  assert.equal(surCentre, fins);
});

test('fondu : monte pendant l entree, descend pendant la queue', () => {
  const { scene, run } = setup({ haut: 0, bas: 0 });
  run(1, 0);
  assert.equal(Math.round(scene.exprAt(0)), 0);
  assert.equal(Math.round(scene.exprAt(2000)), 64);
  assert.equal(Math.round(scene.exprAt(4000)), 127);
});

test('apres une panique en pleine scene, la nappe reprend comme la lead', () => {
  const { engine, back, run } = setup({ haut: 0, bas: 0 });
  for (let t = 0; t < 10; t++) run(t % 2 ? 2 : -2, t);
  engine.panic();
  back.panic();
  run(1, 10);
  assert.equal(back.state.active, true);
});

test('40 heures de hasard, trois voix : jamais de note coincee (compte AVANT toute panique)', () => {
  const { log, engine, back, run } = setup();
  const g = gaussian(8);
  for (let t = 0; t < 40 * 3600; t++) run(g() + (t % 900 < 150 ? 0.4 : 0), t);
  engine.tick(Infinity);   // relachements prevus, emis
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
  assert.deepEqual(allumees, attendues, 'seules sonnent les notes que les voix croient jouer');
});

test('chaque seconde de 10 h : les notes allumees sont exactement celles que les voix jouent', () => {
  const { log, engine, back, run } = setup();
  const g = gaussian(31);
  const open = new Map();
  let lu = 0;
  for (let t = 0; t < 10 * 3600; t++) {
    run(g() + (t % 700 < 120 ? 0.45 : 0), t);
    for (; lu < log.length; lu++) {
      const [k, n, v, at] = log[lu];
      if (k === 'off' && at > t * 1000 + 1000) continue;   // liaison de la nappe : relache plus tard
      open.set(v + n, (open.get(v + n) || 0) + (k === 'on' ? 1 : -1));
    }
    const fuite = [...open].filter(([key, x]) => x > 0 && key[0] === 'm' && key !== 'm' + engine.state.sounding);
    assert.deepEqual(fuite, [], `seconde ${t} : lead allumee sans etre jouee`);
  }
  assert.ok(back.state !== undefined);
});

test('panique en pleine scene avec fondu : le volume reste plein', () => {
  const { engine, back, scene, run } = setup({ haut: 0, bas: 0 });
  for (let t = 0; t < 10; t++) run(t % 2 ? 2 : -2, t);
  assert.equal(Math.round(scene.exprAt(10000)), 127);
  engine.panic(); back.panic(); scene.panic();
  run(1, 10);
  assert.equal(Math.round(scene.exprAt(11000)), 127);
});

test('fondu : redescend a 0 pendant la queue de la nappe', () => {
  const { engine, back, scene, run } = setup();
  let t = 0;
  for (; t < 70; t++) run(0.6 + (t % 3) * 0.05, t);
  let fin = null;
  for (; t < 400 && fin == null; t++) {
    const r = run(t % 2 ? 0.2 : -0.2, t);
    if (!r.scene.joue && !engine.state.draining && back.state.active) fin = t;
  }
  assert.ok(fin != null);
  assert.ok(scene.exprAt(fin * 1000 + 2000) < 127 && scene.exprAt(fin * 1000 + 2000) > 0);
  assert.equal(Math.round(scene.exprAt(fin * 1000 + 4000)), 0);
});

test('panique pendant la fin de phrase : le fondu redescend quand meme', () => {
  const { engine, back, scene, run } = setup();
  let t = 0;
  for (; t < 70; t++) run(0.6 + (t % 3) * 0.05, t);
  for (; t < 2000 && !engine.state.draining; t++) run(t % 2 ? 1.3 : -1.3, t);   // des phrases jusqu'a la sortie
  assert.equal(engine.state.draining, true);
  engine.panic(); back.panic(); scene.panic();
  run(1, t); run(-1, t + 1);
  assert.equal(Math.round(scene.exprAt((t + 6) * 1000)), 0);
});
