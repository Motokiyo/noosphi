// Tests de l'ecoute a plusieurs sources : combinaison des sources cochees, etat de chaque pastille
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombinaison, etatSource, choixInitial, basculer, SALLE_DEFAUT, SALLE_CLES } from '../public/js/seance.js';

test('les sources de l ecoute : cet appareil, Noosfeerique, QCI, NIST (plus Princeton ni ANU)', () => {
  assert.deepEqual(SALLE_CLES, ['local', 'cicada', 'qci', 'nist']);
});

test('le z affiche est le Stouffer des sources cochees fraiches dans la seconde', () => {
  const c = createCombinaison();
  const z = c.tick(0, { local: 1, qci: 1, cicada: 1, nist: 5 }, ['local', 'qci', 'cicada']);
  assert.ok(Math.abs(z - 3 / Math.sqrt(3)) < 1e-12);   // NIST n'est pas cochee
  assert.equal(c.n, 3);
});

test('une pulsation NIST ne compte qu une fois par valeur fraiche', () => {
  const c = createCombinaison();
  c.tick(0, { local: 0.2, nist: 2 }, ['local', 'nist']);
  assert.equal(c.n, 2);
  const z = c.tick(1000, { local: 0.4, nist: 2 }, ['local', 'nist']);   // meme pulsation
  assert.equal(c.n, 1);
  assert.equal(z, 0.4);
});

test('plusieurs appels dans la meme seconde ne changent rien', () => {
  const c = createCombinaison();
  const a = c.tick(5000, { local: 1 }, ['local']);
  const b = c.tick(5600, { local: -3 }, ['local']);
  assert.equal(a, b);
});

test('sans valeur fraiche, le dernier z reste affiche ; sans rien de coche, rien', () => {
  const c = createCombinaison();
  c.tick(0, { qci: 1.5 }, ['qci']);
  assert.equal(c.tick(1000, { qci: 1.5 }, ['qci']), 1.5);
  assert.equal(createCombinaison().tick(0, { qci: 1 }, []), null);
});

test('par defaut : cet appareil et Noosfeerique dans l ecoute, QCI et NIST au temoin', () => {
  assert.deepEqual(SALLE_DEFAUT, { local: true, cicada: true, qci: false, nist: false });
  assert.deepEqual(choixInitial({ salle: SALLE_DEFAUT }), { qci: true, nist: true });
});

test('cocher QCI dans les sources la retire du temoin', () => {
  const e = basculer({ salle: { ...SALLE_DEFAUT }, temoin: { qci: true, nist: true } }, 'salle', 'qci');
  assert.equal(e.salle.qci, true);
  assert.equal(e.temoin.qci, false);
  assert.equal(e.temoin.nist, true);
});

test('etat des pastilles : disponible, en attente, indisponible', () => {
  const debut = 0;
  assert.equal(etatSource('nist', { maintenant: 10000, debut }).titre, 'NIST · en attente');
  assert.equal(etatSource('nist', { maintenant: 90000, debut }).titre, 'NIST · indisponible');
  assert.equal(etatSource('nist', { dernierOk: 1000, maintenant: 100000, debut }).titre, 'NIST · une valeur par minute');   // a la minute : patience 3 min
  assert.equal(etatSource('qci', { dernierOk: 9000, maintenant: 10000, debut }).titre, 'QCI · chaque seconde');
  assert.equal(etatSource('qci', { dernierOk: 1000, maintenant: 20000, debut }).disponible, false);
  assert.equal(etatSource('local', { dernierOk: 9000, maintenant: 10000, debut }).titre, 'Cet appareil · chaque seconde');
});
