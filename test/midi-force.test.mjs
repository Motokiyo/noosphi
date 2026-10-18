// Tests de la force de frappe qui flotte avec le z : node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createForce } from '../public/js/midi-force.js';

function gaussian(seed) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

test('mini = maxi : frappe fixe', () => {
  const f = createForce({ min: 100, max: 100 });
  for (const z of [0, 3, -2, 3.1]) assert.equal(f.next(z), 100);
});

test('flottant : le z deplace la force a partir de la note d avant', () => {
  const f = createForce({ min: 40, max: 120, pas: 5 });
  assert.equal(f.next(0.0001), 80);   // part du milieu
  assert.equal(f.next(3), 95);        // +3 : 15 plus fort
  assert.equal(f.next(-1), 90);       // -1 : 5 plus doux
});

test('le meme z ne donne pas la meme force : tout depend du chemin', () => {
  const f = createForce({ min: 1, max: 127, pas: 5 });
  const a = f.next(2);
  const b = f.next(2.01);
  assert.ok(b > a, `${a} puis ${b}`);
});

test('3,1 pousse plus que 3, et 2,9 moins', () => {
  const step = z => { const f = createForce({ min: 1, max: 127, pas: 10 }); f.next(0.0001); return f.next(z); };
  assert.ok(step(3.1) > step(3));
  assert.ok(step(2.9) < step(3));
});

test('touche les bornes sans y rester collee', () => {
  const f = createForce({ min: 40, max: 120, pas: 5 });
  for (let i = 0; i < 20; i++) f.next(3 + i * 0.01);
  assert.equal(f.state.value, 120);
  assert.ok(f.next(-2) < 120, 'repart au mouvement suivant');
});

test('meme valeur repetee : rien ne bouge (accords, source figee)', () => {
  const f = createForce({ min: 40, max: 120 });
  const v = f.next(1.5);
  assert.equal(f.next(1.5), v);
});

test('une heure de hasard : la force se promene dans toute la fourchette', () => {
  for (const sens of ['monte', 'ecart']) {
    const f = createForce({ min: 40, max: 120, sens });
    const g = gaussian(3);
    const vals = [];
    for (let i = 0; i < 3600; i++) vals.push(f.next(g()));
    assert.ok(vals.every(v => v >= 40 && v <= 120));
    const pas = vals.slice(1).reduce((a, v, i) => a + Math.abs(v - vals[i]), 0) / 3599;
    const sorted = [...vals].sort((a, b) => a - b);
    console.log(`  ${sens} 40 a 120 : de ${sorted[0]} a ${sorted.at(-1)}, mediane ${sorted[1800]}, ecart moyen d une note a l autre ${pas.toFixed(1)}`);
    assert.ok(sorted.at(-1) - sorted[0] > 40);
  }
});
