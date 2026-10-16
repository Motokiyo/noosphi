// Tests du silence choisi et des passages son / silence : node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvie } from '../public/js/midi-envie.js';
import { createCoherence } from '../public/js/midi-coherence.js';
import { createEngine, SCALES } from '../public/js/midi-engine.js';

// ---------- Le silence choisi : zone entre -bas et +haut ----------

test('silence tant que la coherence signee reste entre -bas et +haut', () => {
  const e = createEnvie({ haut: 1.5, bas: 1.5 });
  for (let t = 0; t < 120; t++) {
    assert.equal(e.update(t % 2 ? 1.4 : -1.4, 60, t * 1000).joue, false);
  }
});

test('joue aussi quand la coherence plonge sous -bas', () => {
  const e = createEnvie({ haut: 1.5, bas: 1.5 });
  const s = e.update(-1.6, 60, 0);
  assert.equal(s.joue, true);
  assert.equal(s.change, true);
});

test('zone asymetrique : +1 suffit en haut, il faut -2 en bas', () => {
  const e = createEnvie({ haut: 1, bas: 2 });
  assert.equal(e.update(-1.9, 60, 0).joue, false);
  assert.equal(e.update(1.1, 60, 1000).joue, true);
  const f = createEnvie({ haut: 1, bas: 2 });
  assert.equal(f.update(-2.1, 60, 0).joue, true);
});

test('l ancien reglage unique `seuil` regle les deux bords', () => {
  const e = createEnvie({ seuil: 1.5 });
  assert.equal(e.update(-1.4, 60, 0).joue, false);
  assert.equal(e.update(-1.6, 60, 1000).joue, true);
});

test('fait le point avec le signe : une minute de plus si on est encore hors zone, d un cote ou de l autre', () => {
  const e = createEnvie({ haut: 1.5, bas: 1.5 });
  e.update(1.6, 60, 0);
  assert.equal(e.update(-1.8, 60, 60000).joue, true);   // passe de l'autre cote : reprend
  assert.equal(e.update(0.3, 60, 120000).joue, false);
});

test('la coherence donne aussi sa valeur signee', () => {
  const coh = createCoherence({ window: 60 });
  let s;
  for (let i = 0; i < 30; i++) s = coh.add(-0.5 - i * 0.001);
  assert.ok(s.s < -2);
  assert.ok(Math.abs(s.c - Math.abs(s.s)) < 1e-9);
});

test('le seuil des accords est reglable, le meme en + et en -', () => {
  const coh = createCoherence({ window: 4, accord: 2.6 });
  let s;
  for (let i = 0; i < 4; i++) s = coh.add(1.2 + i * 0.01);   // C = 2,46 : sous 2,6
  assert.ok(s.level < 2);
  const neg = createCoherence({ window: 4, accord: 2.6 });
  for (let i = 0; i < 4; i++) s = neg.add(-1.4 - i * 0.01);  // C = -2,86
  assert.equal(s.level, 2);
});

// ---------- La lead finit sa phrase avant le silence ----------

function setup(cfg = {}) {
  const log = [];
  const e = createEngine({
    noteOn: (n, v, at) => log.push(['on', n, v, at]),
    noteOff: (n, v, at) => log.push(['off', n, v, at]),
  });
  e.configure(cfg, SCALES.chromatic, 0);
  return { e, log };
}

test('fin de scene en pleine phrase : la lead marche vers le centre, sans couper', () => {
  const { e, log } = setup({ seuil: 1 });
  e.sample(3, 0);                              // 66
  assert.equal(e.finish(500), false);          // pas fini : il reste une phrase a conclure
  assert.equal(e.state.draining, true);
  const notes = [66];
  for (let t = 1; t < 10 && e.state.phase === 'phrase'; t++) {
    const n = e.sample(t % 2 ? 4.5 : 3, t * 1000);   // le z part loin vers le haut
    if (n != null) notes.push(n);
  }
  for (let i = 1; i < notes.length; i++) {
    assert.ok(Math.abs(notes[i] - 60) < Math.abs(notes[i - 1] - 60), `se rapproche du centre : ${notes}`);
  }
  assert.equal(notes.at(-1), 60);              // cadence sur le centre
  assert.equal(e.state.phase, 'cadence');
  assert.equal(e.state.sounding, 60);          // la note finale tient
  const offs60 = log.filter(([k, n]) => k === 'off' && n === 60);
  assert.equal(offs60.length, 0);
});

test('apres la cadence, le mouvement suivant eteint la note et la fin est faite', () => {
  const { e } = setup({ seuil: 1 });
  e.sample(1, 0);                              // 62
  e.finish(100);
  e.sample(-0.5, 1000);                        // 61... ou 60
  for (let t = 2; t < 30 && e.state.phase === 'phrase'; t++) e.sample(t % 2 ? 2 : 0.5, t * 1000);
  assert.equal(e.state.phase, 'cadence');
  e.sample(5, 20000);                          // mouvement : silence
  assert.equal(e.state.sounding, null);
  assert.equal(e.state.draining, false);
});

test('garde-fou : au-dela de finMax la lead rejoint le centre, puis tient finTenue', () => {
  const { e } = setup({ seuil: 1, finMax: 15000, finTenue: 4000 });
  e.sample(4, 0);                              // 68
  e.finish(0);
  for (let t = 1; t < 15; t++) e.sample(4 + (t % 2) * 0.01, t * 1000);   // z immobile : rien ne bouge
  assert.equal(e.state.sounding, 68);
  assert.equal(e.sample(4.01, 15000), 60);     // 15 s : rejoint le centre sans attendre le z
  assert.equal(e.state.phase, 'cadence');
  e.sample(4.0, 18000);
  assert.equal(e.state.sounding, 60);          // tient encore
  e.sample(4.01, 19000);                       // 4 s de tenue : s'eteint
  assert.equal(e.state.sounding, null);
  assert.equal(e.state.draining, false);
});

test('l accord qui sonne tient jusqu a la cadence de la lead, puis part avec elle', () => {
  const { e } = setup({ seuil: 1 });
  e.sample(2, 0, 2);                           // 64 + accord
  assert.equal(e.state.chord.length, 3);
  e.finish(100);
  e.sample(0.5, 1000, 0);                      // la coherence est retombee : l'accord reste
  assert.equal(e.state.chord.length, 3);
  for (let t = 2; t < 30 && e.state.phase === 'phrase'; t++) e.sample(t % 2 ? 2 : 0.5, t * 1000, 0);
  assert.equal(e.state.chord.length, 3);       // tient sur la note finale
  e.sample(5, 30000, 0);
  assert.equal(e.state.chord.length, 0);
});

test('pas de nouvel accord pendant la fin de phrase', () => {
  const { e, log } = setup({ seuil: 1 });
  e.sample(3, 0, 0);
  e.finish(100);
  const avant = log.filter(([, , v]) => v === 'h').length;
  e.sample(1, 1000, 2);
  assert.equal(log.filter(([, , v]) => v === 'h').length, avant);
});

test('fin de scene deja en silence : fini tout de suite', () => {
  const { e } = setup();
  assert.equal(e.finish(0), true);
  assert.equal(e.state.draining, false);
});

test('la scene revient pendant la fin : la phrase reprend librement', () => {
  const { e } = setup({ seuil: 1 });
  e.sample(3, 0);
  e.finish(100);
  e.resume();
  assert.equal(e.state.draining, false);
  assert.equal(e.sample(1.5, 1000), 69);       // 66 + 3 : s'eloigne du centre, la marche vers lui est levee
});

test('forte en cours a la fin de scene : la note posee est deja une cadence', () => {
  const { e } = setup({ seuil: 1 });
  e.sample(2, 0, 3);                           // grace, sur le centre, accord tenu
  e.finish(100);
  assert.equal(e.state.phase, 'cadence');
  assert.equal(e.state.sounding, 60);
  assert.equal(e.state.chord.length, 3);
});
