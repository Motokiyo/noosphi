/* ============================================================
   Noosfeerique — Force de frappe d'une voix (U1 virtuel)
   Logique pure, sans navigateur : testable dans Node.

   La force flotte, comme la melodie : le z ne fixe pas une force, il la
   deplace a partir de celle de la note d'avant. z = +3 : la note suivante
   frappe `pas` x 3 plus fort que la precedente ; z = +3,1 un peu plus
   encore ; z = -1 : elle s'adoucit de `pas`. Le meme z ne donne donc
   jamais deux fois la meme force : tout depend du chemin.

   - La force part du milieu de la fourchette, et y reste bornee : elle
     peut toucher le mini ou le maxi, puis en repart au mouvement suivant.
   - Sens 'monte' : un z positif enfle, un z negatif adoucit.
   - Sens 'ecart' : un z fort (en + comme en -) enfle, un z calme adoucit.
     Le pas lit |z| - 0,8 : 0,8 est l'ecart moyen du z au pur hasard, de
     sorte que la force ne derive ni vers le haut ni vers le bas.
   - Une valeur strictement identique a la precedente ne bouge rien (les
     trois notes d'un accord, une source figee).
   - Mini = maxi : frappe fixe.
   ============================================================ */

export const FORCE_DEFAULTS = {
  min: 100,
  max: 100,
  pas: 5,         // force gagnee ou perdue par unite de z, a chaque note
  sens: 'monte',
};

const ECART_MOYEN = 0.8;   // moyenne de |z| sous le pur hasard (racine de 2/pi)

export function createForce(options = {}) {
  let cfg = { ...FORCE_DEFAULTS, ...options };
  let level = null;
  let last = null;

  const bounds = () => [Math.min(cfg.min, cfg.max), Math.max(cfg.min, cfg.max)];
  const clamp = v => { const [lo, hi] = bounds(); return Math.max(lo, Math.min(hi, v)); };
  const value = () => Math.max(1, Math.min(127, Math.round(level)));

  // x = le z qui fait la note (la tendance pour la nappe). Renvoie la force.
  function next(x) {
    const [lo, hi] = bounds();
    if (level == null) level = (lo + hi) / 2;
    if (x != null && isFinite(x) && x !== last) {
      last = x;
      const step = cfg.sens === 'ecart' ? Math.abs(x) - ECART_MOYEN : x;
      level = clamp(level + cfg.pas * step);
    }
    return value();
  }

  // Fourchette changee : la force y est ramenee, sans repartir du milieu
  function configure(next_) {
    cfg = { ...cfg, ...next_ };
    if (level != null) level = clamp(level);
  }

  function reset() { level = null; last = null; }

  return { next, configure, reset, get state() { return { level, value: level == null ? null : value() }; } };
}
