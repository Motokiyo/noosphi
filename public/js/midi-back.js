/* ============================================================
   Noosfeerique — Voix back (U1 virtuel) : les nappes
   Logique pure, sans navigateur : testable dans Node.

   La lead suit le z seconde par seconde. La back suit sa tendance lente :
   T = somme des z frais des `fenetre` dernieres secondes / racine(n)
   (Stouffer, comme la coherence, sur 30 s au lieu de 60). Sous le pur
   hasard, T suit une loi normale : elle derive doucement.

   - Elle ne joue que les piliers de la gamme (I, IV, V), autour d'une
     note d'accueil une octave sous le centre de la lead.
   - T = 0 : le pilier d'accueil. Chaque unite de T deplace de `gain` piliers.
   - Elle ne change de note que si T s'eloigne nettement de la note qui
     sonne (hysteresis de 0,75 pilier) et apres `tenueMin` ms : des notes
     longues, pour des nappes.
   - Passage lie : la nouvelle note entre, l'ancienne s'eteint `liaison` ms
     apres, pour que la nappe ne se troue pas.
   ============================================================ */
import { scaleNotes } from './midi-engine.js';

export const BACK_DEFAULTS = {
  fenetre: 30,        // secondes de tendance
  gain: 1,            // piliers par unite de tendance
  tenueMin: 10000,    // duree minimale d'une note (ms)
  liaison: 300,       // chevauchement entre deux notes (ms)
  piliers: [0, 5, 7], // I, IV, V
  octave: -12,        // place de la note d'accueil par rapport au centre de la lead
};

const HYSTERESIS = 0.75;

function nearestIndex(notes, target) {
  let best = 0;
  for (let i = 1; i < notes.length; i++) {
    if (Math.abs(notes[i] - target) < Math.abs(notes[best] - target)) best = i;
  }
  return best;
}

// out = { noteOn(n, at), noteOff(n, at) } ; `at` peut etre dans le futur (liaison).
export function createBack(out) {
  let cfg = { ...BACK_DEFAULTS };
  let place = { root: 0, centre: 60, low: 21, high: 108 };
  const values = [];
  let last = null;
  let active = false;
  let sounding = null;
  let idx = null;      // indice du pilier qui sonne
  let start = 0;

  function configure(next, root, centre, low, high) {
    cfg = { ...cfg, ...next };
    place = { root, centre, low, high };
  }

  function notes() {
    return scaleNotes(cfg.piliers, place.root, place.low, place.high);
  }

  // Une valeur strictement identique a la precedente est ecartee (source figee)
  function add(z) {
    if (z == null || !isFinite(z) || z === last) return;
    last = z;
    values.push(z);
    while (values.length > cfg.fenetre) values.shift();
  }

  function trend() {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / Math.sqrt(values.length);
  }

  // Position visee, en piliers (fractionnaire), et bornee au clavier
  function target(list) {
    const home = nearestIndex(list, place.centre + cfg.octave);
    return Math.max(0, Math.min(list.length - 1, home + trend() * cfg.gain));
  }

  function play(list, i, now) {
    const prev = sounding;
    idx = i;
    sounding = list[i];
    start = now;
    out.noteOn(sounding, now);
    if (prev != null) out.noteOff(prev, now + cfg.liaison);
  }

  // Lance la nappe (entree de scene). Sans effet si elle sonne deja.
  function start_(now) {
    if (active) return;
    active = true;
    const list = notes();
    if (list.length) play(list, Math.round(target(list)), now);
  }

  // Une fois par seconde, apres add()
  function update(now) {
    if (!active) return null;
    const list = notes();
    if (!list.length) return null;
    const t = target(list);
    if (sounding == null) { play(list, Math.round(t), now); return sounding; }
    if (Math.abs(t - idx) <= HYSTERESIS || now - start < cfg.tenueMin) return null;
    const next = Math.round(t);
    if (next === idx || list[next] === sounding) return null;
    play(list, next, now);
    return sounding;
  }

  // Fin de la nappe : sa queue est celle du son dans MainStage (release)
  function stop(now) {
    active = false;
    if (sounding != null) out.noteOff(sounding, now);
    sounding = null;
    idx = null;
  }

  function panic() {
    if (sounding != null) out.noteOff(sounding);
    active = false;
    sounding = null;
    idx = null;
  }

  function reset() { values.length = 0; last = null; }

  return {
    configure, add, start: start_, update, stop, panic, reset,
    get state() { return { active, sounding, trend: trend() }; },
  };
}
