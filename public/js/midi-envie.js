/* ============================================================
   Noosfeerique — L'envie de jouer (U1 virtuel)
   Logique pure, sans navigateur : testable dans Node.

   Le z decide s'il joue ou s'il se tait, comme un musicien qui choisit
   ses scenes. On lit la coherence signee de la derniere minute (C,
   Stouffer, voir midi-coherence.js). Le silence est une zone choisie :
   entre -`bas` et +`haut`, il se tait.
   - en silence, il ecoute sans arret et entre des que C sort de la zone,
     par le haut (C >= haut) ou par le bas (C <= -bas) ;
   - il s'engage alors pour `engagement` ms (une minute) ;
   - a la fin de la minute, il refait le point : si C est encore hors de
     la zone (d'un cote ou de l'autre), il reprend pour une minute de plus,
     sinon il se tait. Se taire ne coupe rien : la phrase finit (midi.js).
   Aucune minuterie ne decide seule : la minute ne fait que fixer le
   moment ou le z est consulte.

   Au pur hasard, zone -1,5 / +1,5, il joue un peu moins de la moitie du
   temps. Zone 0 / 0 : il joue toujours. `seuil` regle les deux bords a la
   fois (reglage d'avant la zone).
   ============================================================ */

export const ENVIE_DEFAULTS = {
  haut: 1.5,           // joue des que C >= +haut
  bas: 1.5,            // joue des que C <= -bas
  engagement: 60000,   // duree d'une scene avant de refaire le point (ms)
  minValeurs: 10,      // tirages frais necessaires avant de pouvoir entrer
};

export function createEnvie(options = {}) {
  let cfg = { ...ENVIE_DEFAULTS };
  let joue = false;
  let finAt = 0;

  function configure(next) {
    const { seuil, ...rest } = next;
    cfg = { ...cfg, ...(seuil != null ? { haut: seuil, bas: seuil } : {}), ...rest };
  }
  configure(options);

  const toujours = () => cfg.haut <= 0 && cfg.bas <= 0;
  const horsZone = s => s >= cfg.haut || s <= -cfg.bas;

  // s = coherence signee C de la derniere minute, n = tirages frais comptes, now en ms.
  // Renvoie l'etat, avec `change` vrai quand il vient d'entrer ou de sortir.
  function update(s, n, now) {
    const avant = joue;
    if (toujours()) {
      joue = true;
    } else if (!joue) {
      if (n >= cfg.minValeurs && horsZone(s)) { joue = true; finAt = now + cfg.engagement; }
    } else if (now >= finAt) {
      if (horsZone(s)) finAt += cfg.engagement;
      else joue = false;
    }
    return { ...state(now), change: joue !== avant };
  }

  function state(now = 0) {
    const reste = joue && !toujours() ? Math.max(0, finAt - now) : null;
    return { joue, reste };
  }

  function reset() { joue = false; finAt = 0; }

  return { configure, update, reset, state };
}
