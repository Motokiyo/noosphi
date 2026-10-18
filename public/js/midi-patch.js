/* ============================================================
   Noosfeerique — Changement de patch par le z (U1 virtuel)
   Logique pure, sans navigateur : testable dans Node.

   Le z choisit quand MainStage change d'univers sonore, et dans quel sens.
   Deux evenements, dans l'ordre et dans le temps imparti :
   1. le z frais tombe sur 0,00 (|z| < 0,005, environ une seconde sur 250) ;
   2. dans les `fenetre` ms qui suivent, un z pousse franchement :
      z >= +pousse : patch suivant ; z <= -pousse : patch precedent.
      Sans poussee dans le temps imparti, rien ne change.
   - Un patch dure au moins `minimum` ms : un 0,00 plus tot est ignore.
   - Le changement decide attend le silence de la lead (fin de phrase),
     au plus `attenteMax` ms, pour ne jamais couper une phrase.
   - Un z strictement identique au precedent est ecarte (source figee).
   ============================================================ */

export const PATCH_DEFAULTS = {
  zero: 0.005,          // |z| sous ce seuil : le z affiche 0,00
  pousse: 0.5,          // poussee necessaire juste apres
  fenetre: 5000,        // temps imparti pour la poussee (ms)
  minimum: 180000,      // duree minimale d'un patch (ms)
  attenteMax: 120000,   // attente maximale du silence (ms)
};

export function createPatchChanger(options = {}) {
  let cfg = { ...PATCH_DEFAULTS, ...options };
  let dernierChangement = null;   // heure du dernier changement envoye
  let zeroAt = null;              // heure du 0,00 qui attend sa poussee
  let decide = null;              // { sens, at } : decide, attend le silence
  let last = null;

  function configure(next) { cfg = { ...cfg, ...next }; }

  // z frais ou non, heure, et la lead se tait-elle ? Renvoie 'suivant',
  // 'precedent' ou null (rien a envoyer maintenant).
  function step(z, now, { silence = true } = {}) {
    if (dernierChangement == null) dernierChangement = now;   // le patch de depart compte
    const frais = z != null && isFinite(z) && z !== last;
    if (frais) last = z;

    if (decide) {
      if (silence || now - decide.at >= cfg.attenteMax) return envoyer(now);
      return null;
    }
    if (now - dernierChangement < cfg.minimum) { zeroAt = null; return null; }
    if (zeroAt != null && now - zeroAt > cfg.fenetre) zeroAt = null;   // temps imparti depasse
    if (!frais) return null;

    if (zeroAt == null) {
      if (Math.abs(z) < cfg.zero) zeroAt = now;
      return null;
    }
    if (z >= cfg.pousse || z <= -cfg.pousse) {
      decide = { sens: z > 0 ? 'suivant' : 'precedent', at: now };
      zeroAt = null;
      if (silence) return envoyer(now);
    }
    return null;
  }

  function envoyer(now) {
    const sens = decide.sens;
    decide = null;
    dernierChangement = now;
    return sens;
  }

  // Pour le panneau : ce qui se passe, et dans combien de temps c'est possible
  function etat(now) {
    if (decide) return { phase: 'attend-silence', sens: decide.sens };
    if (dernierChangement != null && now - dernierChangement < cfg.minimum) {
      return { phase: 'repos', reste: cfg.minimum - (now - dernierChangement) };
    }
    if (zeroAt != null) return { phase: 'attend-poussee', reste: Math.max(0, cfg.fenetre - (now - zeroAt)) };
    return { phase: 'guette' };
  }

  function reset() { dernierChangement = null; zeroAt = null; decide = null; last = null; }

  return { configure, step, etat, reset };
}
