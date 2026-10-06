/* ============================================================
   Noosfeerique — Mesure de coherence pour la sortie MIDI
   Logique pure, sans navigateur : testable dans Node.

   Coherence = le z garde le meme cap. On cumule les z frais de la
   derniere fenetre (60 s par defaut) : C = somme / racine(n), la
   methode Stouffer de Princeton. Sous le pur hasard, C suit une loi
   normale : |C| >= 2 n'occupe que ~4,5 % du temps.

   Une valeur strictement identique a la precedente est ecartee : c'est
   une source figee (Princeton, serveur, telephone en veille), pas un
   tirage neuf. La compter fabriquerait une fausse coherence.

   Paliers avec hysteresis (on entre a `in`, on ne sort que sous `out`)
   pour que la musique ne clignote pas.
   ============================================================ */

export const LEVELS = [
  { name: 'hasard',    in: 0,   out: 0 },
  { name: 'approche',  in: 1.5, out: 1.3 },
  { name: 'cohérence', in: 2,   out: 1.7 },
  { name: 'forte',     in: 2.5, out: 2.2 },
];

export function createCoherence({ window = 60 } = {}) {
  const values = [];
  let last = null;
  let level = 0;

  function add(z) {
    if (z == null || !isFinite(z) || z === last) return state();
    last = z;
    values.push(z);
    while (values.length > window) values.shift();
    const c = Math.abs(values.reduce((a, b) => a + b, 0)) / Math.sqrt(values.length);
    while (level < LEVELS.length - 1 && c >= LEVELS[level + 1].in) level++;
    while (level > 0 && c < LEVELS[level].out) level--;
    return state(c);
  }

  function state(c = current()) {
    // Niveau continu 0..127 : 0 sous |C| = 1, 127 a |C| = 3
    const cc = Math.round(Math.max(0, Math.min(1, (c - 1) / 2)) * 127);
    return { c, level, name: LEVELS[level].name, cc, n: values.length };
  }

  function current() {
    if (!values.length) return 0;
    return Math.abs(values.reduce((a, b) => a + b, 0)) / Math.sqrt(values.length);
  }

  function reset() { values.length = 0; last = null; level = 0; }

  return { add, reset, get state() { return state(); } };
}
