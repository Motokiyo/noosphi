/* ============================================================
   Noosfeerique — Conduite des scenes (U1 virtuel)
   Logique pure, sans navigateur : testable dans Node.

   Relie la coherence, les envies, le jeu (lead + accords, midi-engine.js)
   et la nappe (back, midi-back.js), et fait les passages son / silence,
   jamais abrupts.

   Deux envies, deux zones : la nappe et le jeu ont chacun leurs seuils
   (`envieNappe`, `envieJeu`) sur la meme coherence signee. Selon les
   seuils, on a des moments nappe seule, les deux, ou jeu seul. Une seule
   `envie` partagee = les deux entrent et sortent ensemble.

   - ENTREE DU JEU : si la nappe entre au meme moment, elle vient d'abord
     et la lead `entree` ms apres. Sinon la lead entre tout de suite. Si
     elle finissait encore sa phrase, elle reprend tout de suite.
   - SORTIE DU JEU : la lead finit sa phrase jusqu'a sa cadence (l'accord
     avec elle, voir finish() dans midi-engine.js).
   - SORTIE DE LA NAPPE : elle tient encore `queue` ms, et s'eteint. Si le
     jeu finit sa phrase, la queue commence a la fin de la phrase.
   - FONDU (option, CC 11) : un fondu par groupe, nappe et jeu. Il monte de
     0 a 127 pendant `entree`, et redescend de 127 a 0 pendant `queue`.
     exprAt(t) donne la nappe, exprJeuAt(t) le jeu.
   ============================================================ */

function createFade() {
  let f = { from: 0, to: 0, t0: 0, dur: 0 };
  const at = t => {
    if (f.dur <= 0 || t >= f.t0 + f.dur) return f.to;
    return f.from + (f.to - f.from) * Math.max(0, (t - f.t0) / f.dur);
  };
  return {
    at,
    to: (to, now, dur) => { f = { from: at(now), to, t0: now, dur }; },
    get target() { return f.to; },
    reset: () => { f = { from: 0, to: 0, t0: 0, dur: 0 }; },
  };
}

export function createScene({ engine, back, envie, envieNappe = envie, envieJeu = envie, coherence }) {
  let entreeAt = 0;       // heure ou la lead peut jouer dans la scene en cours
  let finNappeAt = null;  // heure ou la queue de la nappe a commence
  const fadeNappe = createFade();
  const fadeJeu = createFade();

  function enterJeu(now, entree, avecNappe) {
    const enCours = engine.state.draining || engine.state.sounding != null;
    engine.resume();
    entreeAt = enCours || !avecNappe ? now : now + entree;
    fadeJeu.to(127, now, entree);
  }

  function enterNappe(now, entree) {
    finNappeAt = null;
    back.start(now);
    fadeNappe.to(127, now, entree);
  }

  // Une lecture par seconde. `at` = heure de la note de lead dans la seconde.
  // Renvoie ce qu'il faut afficher et envoyer.
  function step(z, now, { entree = 4000, queue = 4000, at = now, fin = now + 1000 } = {}) {
    const coh = coherence.add(z);
    back.add(z);
    const jeu = envieJeu.update(coh.s, coh.n, now);
    const nappe = envieNappe === envieJeu ? jeu : envieNappe.update(coh.s, coh.n, now);
    const nappeEntre = nappe.change && nappe.joue;

    if (jeu.change && jeu.joue) enterJeu(now, entree, nappeEntre);
    if (jeu.change && !jeu.joue) engine.finish(now);
    if (nappeEntre) enterNappe(now, entree);

    // Le jeu
    let note = null;
    const leadOn = jeu.joue ? now >= entreeAt : engine.state.draining;
    if (leadOn && z != null && isFinite(z)) note = engine.sample(z, at, coh.level, fin);
    if (!jeu.joue && !engine.state.draining && fadeJeu.target !== 0) {
      fadeJeu.to(0, now, queue);   // phrase finie (ou panique) : le fondu du jeu redescend
    }

    // La nappe
    if (nappe.joue) {
      if (!back.state.active) back.start(now);   // apres une panique, comme la lead
      back.update(now);
    } else if (back.state.active) {
      // Le jeu qui vient de sortir finit sa phrase : la nappe l'attend
      const attendPhrase = engine.state.draining && !jeu.joue;
      if (finNappeAt == null && !attendPhrase) { finNappeAt = now; fadeNappe.to(0, now, queue); }
      if (finNappeAt != null && now >= finNappeAt + queue) back.stop(now);
    } else if (fadeNappe.target !== 0) {
      fadeNappe.to(0, now, queue);   // silence atteint sans queue (panique) : le fondu redescend quand meme
    }

    return {
      coh, jeu, nappe, note,
      scene: jeu,   // nom d'avant les deux zones
      attend: jeu.joue && now < entreeAt,
    };
  }

  // Apres une panique : plus rien ne sonne, mais les fondus continuent leur course
  // (une panique en pleine scene ne doit pas laisser le volume a 0)
  function panic() {
    entreeAt = 0;
    finNappeAt = null;
  }

  function reset() {
    entreeAt = 0;
    finNappeAt = null;
    fadeNappe.reset();
    fadeJeu.reset();
  }

  return { step, exprAt: fadeNappe.at, exprJeuAt: fadeJeu.at, panic, reset };
}
