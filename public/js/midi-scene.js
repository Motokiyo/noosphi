/* ============================================================
   Noosfeerique — Conduite des scenes (U1 virtuel)
   Logique pure, sans navigateur : testable dans Node.

   Relie la coherence, l'envie, la lead (midi-engine.js) et la back
   (midi-back.js), et fait les passages son / silence, jamais abrupts :
   - ENTREE : la nappe vient d'abord, la lead `entree` ms apres. Si la lead
     finissait encore sa phrase, elle reprend tout de suite.
   - SORTIE : la lead finit sa phrase jusqu'a sa cadence (l'accord avec elle,
     voir finish() dans midi-engine.js), puis la nappe tient encore `queue` ms
     et s'eteint.
   - FONDU (option, CC 11) : monte de 0 a 127 pendant l'entree, descend de
     127 a 0 pendant la queue. exprAt(t) donne la valeur a l'instant t.
   ============================================================ */

export function createScene({ engine, back, envie, coherence }) {
  let entreeAt = 0;     // heure ou la lead peut jouer dans la scene en cours
  let finAt = null;     // heure ou la lead a fini sa derniere phrase (sortie)
  let expr = { from: 0, to: 0, t0: 0, dur: 0 };

  function exprAt(t) {
    if (expr.dur <= 0 || t >= expr.t0 + expr.dur) return expr.to;
    return expr.from + (expr.to - expr.from) * Math.max(0, (t - expr.t0) / expr.dur);
  }

  function fadeTo(to, now, dur) {
    expr = { from: exprAt(now), to, t0: now, dur };
  }

  function enter(now, entree) {
    const enCours = engine.state.draining || engine.state.sounding != null;
    engine.resume();
    finAt = null;
    entreeAt = enCours ? now : now + entree;
    back.start(now);
    fadeTo(127, now, entree);
  }

  // Une lecture par seconde. `at` = heure de la note de lead dans la seconde.
  // Renvoie ce qu'il faut afficher et envoyer.
  function step(z, now, { entree = 4000, queue = 4000, at = now } = {}) {
    const coh = coherence.add(z);
    back.add(z);
    const scene = envie.update(coh.s, coh.n, now);
    if (scene.change && scene.joue) enter(now, entree);
    if (scene.change && !scene.joue) { finAt = null; engine.finish(now); }

    let note = null;
    const leadOn = scene.joue ? now >= entreeAt : engine.state.draining;
    if (leadOn && z != null && isFinite(z)) note = engine.sample(z, at, coh.level);

    if (scene.joue) {
      if (!back.state.active) back.start(now);   // apres une panique, comme la lead
      back.update(now);
    } else if (back.state.active) {
      if (finAt == null && !engine.state.draining) { finAt = now; fadeTo(0, now, queue); }
      if (finAt != null && now >= finAt + queue) back.stop(now);
    } else if (expr.to !== 0 && !engine.state.draining) {
      fadeTo(0, now, queue);   // silence atteint sans queue (panique) : le fondu redescend quand meme
    }
    return { coh, scene, note, attend: scene.joue && now < entreeAt };
  }

  // Apres une panique : plus rien ne sonne, mais le fondu continue sa course
  // (une panique en pleine scene ne doit pas laisser le volume a 0)
  function panic() {
    entreeAt = 0;
    finAt = null;
  }

  function reset() {
    entreeAt = 0;
    finAt = null;
    expr = { from: 0, to: 0, t0: 0, dur: 0 };
  }

  return { step, exprAt, panic, reset };
}
