/* ============================================================
   Noosfeerique — L'envie de jouer (U1 virtuel)
   Logique pure, sans navigateur : testable dans Node.

   Le z decide s'il joue ou s'il se tait, comme un musicien qui choisit
   ses scenes. On lit la coherence de la derniere minute (C, Stouffer,
   voir midi-coherence.js) :
   - en silence, il ecoute sans arret et entre des que C atteint `seuil` ;
   - il s'engage alors pour `engagement` ms (une minute) ;
   - a la fin de la minute, il refait le point : si C est encore au-dessus
     du seuil, il reprend pour une minute de plus, sinon il se tait.
   Aucune minuterie ne decide seule : la minute ne fait que fixer le
   moment ou le z est consulte.

   Au pur hasard, avec un seuil de 1,5, il joue un peu moins de la moitie
   du temps. Seuil 0 : il joue toujours (comportement d'avant).
   ============================================================ */

export const ENVIE_DEFAULTS = {
  seuil: 1.5,          // coherence a atteindre pour jouer
  engagement: 60000,   // duree d'une scene avant de refaire le point (ms)
  minValeurs: 10,      // tirages frais necessaires avant de pouvoir entrer
};

export function createEnvie(options = {}) {
  let cfg = { ...ENVIE_DEFAULTS, ...options };
  let joue = false;
  let finAt = 0;

  function configure(next) { cfg = { ...cfg, ...next }; }

  // c = coherence |C| de la derniere minute, n = tirages frais comptes, now en ms.
  // Renvoie l'etat, avec `change` vrai quand il vient d'entrer ou de sortir.
  function update(c, n, now) {
    const avant = joue;
    if (cfg.seuil <= 0) {
      joue = true;
    } else if (!joue) {
      if (n >= cfg.minValeurs && c >= cfg.seuil) { joue = true; finAt = now + cfg.engagement; }
    } else if (now >= finAt) {
      if (c >= cfg.seuil) finAt += cfg.engagement;
      else joue = false;
    }
    return { ...state(now), change: joue !== avant };
  }

  function state(now = 0) {
    const reste = joue && cfg.seuil > 0 ? Math.max(0, finAt - now) : null;
    return { joue, reste };
  }

  function reset() { joue = false; finAt = 0; }

  return { configure, update, reset, state };
}
