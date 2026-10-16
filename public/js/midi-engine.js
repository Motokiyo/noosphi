/* ============================================================
   Noosfeerique — Moteur de phrases MIDI (U1 virtuel)
   Logique pure, sans navigateur : testable dans Node.

   Regles, inspirees du boitier U1 (Music of the Plants) :
   - Rien ne se passe tant que le z ne bouge pas d'au moins `seuil`
     depuis le dernier evenement (l'Event Filter du U1).
   - Trois temps, chacun ouvert par un mouvement du z, jamais par une horloge :
     1. PHRASE : nouvelle note = note en cours + z * gain (en degres de la
        gamme). La premiere note part du centre.
     2. CADENCE : quand la melodie revient au centre (a `maison` degres
        pres) ou touche un bord du clavier, cette note finale tient.
     3. SILENCE : le mouvement suivant eteint la note. Le mouvement
        d'apres ouvre une nouvelle phrase, depuis le centre.
   - Chaque note sonne au moins `minDur` ms.
   - FIN DE SCENE (finish) : rien n'est coupe. La phrase en cours marche
     vers le centre, a petits pas, a chaque mouvement du z, jusqu'a sa
     cadence ; l'accord qui sonne tient jusque-la et part avec elle.
     Garde-fou : apres `finMax` ms, la lead rejoint le centre ; la note
     finale tient alors au plus `finTenue` ms si le z ne bouge plus.
   ============================================================ */
export const SCALES = {
  chromatic:  [0,1,2,3,4,5,6,7,8,9,10,11],
  major:      [0,2,4,5,7,9,11],
  minor:      [0,2,3,5,7,8,10],
  pentatonic: [0,2,4,7,9],
  dorian:     [0,2,3,5,7,9,10],
};

export const ENGINE_DEFAULTS = {
  low: 21,           // La-1, bas du piano 88 touches (convention Apple)
  high: 108,         // Do7, haut du piano
  centre: 60,        // Do3, le « zero » de chaque phrase
  gain: 2,           // degres de gamme par unite de z
  seuil: 1,          // mouvement minimal du z pour une nouvelle note
  maison: 0,         // degres autour du centre qui comptent comme « retour a la maison »
  minDur: 500,       // duree minimale d'une note (ms)
  finMax: 15000,     // fin de scene : au-dela, la lead rejoint le centre sans attendre le z
  finTenue: 4000,    // fin de scene : tenue maximale de la note finale
};

// Notes MIDI de la gamme entre low et high. root = tonique (0 = Do, 9 = La)
export function scaleNotes(intervals, root, low, high) {
  const notes = [];
  for (let n = Math.min(low, high); n <= Math.max(low, high); n++) {
    if (intervals.includes(((n - root) % 12 + 12) % 12)) notes.push(n);
  }
  return notes;
}

function nearestIndex(notes, target) {
  let best = 0;
  for (let i = 1; i < notes.length; i++) {
    if (Math.abs(notes[i] - target) < Math.abs(notes[best] - target)) best = i;
  }
  return best;
}

const PENTATONIC = SCALES.pentatonic;

// out = { noteOn(n, voix, at), noteOff(n, voix, at) } ; voix 'm' = melodie, 'h' = harmonie.
// Le temps est fourni par l'appelant (ms) ; `at` est l'heure exacte de l'evenement,
// pour que la sortie MIDI puisse le dater a l'avance.
export function createEngine(out) {
  let cfg = { ...ENGINE_DEFAULTS };
  let scale = { intervals: SCALES.chromatic, root: 0 };
  let sounding = null;     // note de melodie qui sonne
  let start = 0;           // debut de cette note
  let chord = [];          // accord qui sonne (voix harmonie)
  let chordStart = 0;
  let zRef = 0;            // z du dernier evenement
  let phase = 'silence';   // 'silence' | 'phrase' | 'cadence' | 'grace'
  let count = 0;           // notes dans la phrase en cours
  let draining = false;    // fin de scene : la phrase va vers sa cadence
  let drainStart = 0;
  const offs = new Map();  // 'voix:note' -> heure de relachement prevue

  function configure(next, intervals, root) {
    cfg = { ...cfg, ...next };
    scale = { intervals, root };
  }

  // Des l'approche, une gamme chromatique devient pentatonique : plus consonant
  function notesFor(level) {
    const intervals = level >= 1 && scale.intervals.length === 12 ? PENTATONIC : scale.intervals;
    return scaleNotes(intervals, scale.root, cfg.low, cfg.high);
  }

  function off(note, voice, at) {
    offs.delete(`${voice}:${note}`);
    out.noteOff(note, voice, at);
  }

  function release(note, voice, at, now) {
    if (at <= now) off(note, voice, now);
    else offs.set(`${voice}:${note}`, at);
  }

  function on(note, voice, now) {
    if (offs.has(`${voice}:${note}`)) off(note, voice, now);   // encore en train de sonner : on la relache avant
    out.noteOn(note, voice, now);
  }

  function play(note, now) {
    if (sounding === note && now - start < cfg.minDur) return false; // trop tot pour la refrapper
    if (sounding != null) release(sounding, 'm', start + cfg.minDur, now);
    on(note, 'm', now);
    sounding = note;
    start = now;
    return true;
  }

  function releaseChord(now) {
    chord.forEach(n => release(n, 'h', chordStart + cfg.minDur, now));
    chord = [];
  }

  // Accord de trois sons (degres i, i+2, i+4 de la gamme), une octave sous la melodie
  function playChord(melody, notes, now) {
    const j = nearestIndex(notes, melody - 12);
    const next = [j, j + 2, j + 4].filter(k => k < notes.length).map(k => notes[k]);
    releaseChord(now);
    next.forEach(n => on(n, 'h', now));
    chord = next;
    chordStart = now;
  }

  // Une mesure du z (une fois par seconde), avec le palier de coherence (0 a 3).
  // Renvoie la note de melodie jouee, ou null.
  function sample(z, now, level = 0) {
    if (z == null || !isFinite(z)) return null;
    if (draining) level = Math.min(level, 2);   // pas de note posee en fin de scene
    const notes = notesFor(level);
    if (!notes.length) return null;
    const centre = nearestIndex(notes, cfg.centre);

    // Coherence forte : la melodie se pose sur le centre et l'accord tient
    if (level >= 3) {
      if (phase !== 'grace') {
        phase = 'grace';
        play(notes[centre], now);
        playChord(notes[centre], notes, now);
        zRef = z;
        count = 1;
        return notes[centre];
      }
      return null;
    }
    if (phase === 'grace') phase = 'phrase';   // la phrase repart de la note posee
    if (!draining && level < 2 && chord.length) releaseChord(now);   // en fin de scene, l'accord attend la cadence

    const seuil = level >= 1 || draining ? cfg.seuil * 0.7 : cfg.seuil;   // plus de notes enchainees
    const gain = level >= 1 ? 1 : cfg.gain;                    // pas conjoints, une ligne chantable
    const late = draining && phase === 'phrase' && now - drainStart >= cfg.finMax;
    const held = draining && phase === 'cadence' && now - start >= cfg.finTenue;
    if (!late && !held && Math.abs(z - zRef) < seuil) return null;
    zRef = z;

    if (phase === 'cadence') {          // ce mouvement ouvre le silence
      if (sounding != null) release(sounding, 'm', start + cfg.minDur, now);
      sounding = null;
      releaseChord(now);
      phase = 'silence';   // zRef garde ce z : le prochain mouvement ouvre la phrase
      draining = false;    // fin de scene faite
      return null;
    }

    if (phase === 'silence') { phase = 'phrase'; count = 0; }
    const base = count > 0 && sounding != null ? nearestIndex(notes, sounding) : centre;
    let i;
    if (draining) {
      // vers le centre : le z donne la taille du pas (1 ou 2 degres), jamais la direction
      const d = centre - base;
      i = late ? centre : base + Math.sign(d) * Math.min(Math.abs(d), Math.max(1, Math.min(2, Math.abs(Math.round(z)))));
    } else {
      i = Math.max(0, Math.min(notes.length - 1, base + Math.round(z * gain)));
    }
    if (play(notes[i], now) && level >= 2 && !draining) playChord(notes[i], notes, now);
    count++;
    const home = (count > 1 || draining) && Math.abs(i - centre) <= cfg.maison;
    const edge = i === 0 || i === notes.length - 1;
    if (home || edge) phase = 'cadence';
    return notes[i];
  }

  // Relachements differes : emet ceux prevus jusqu'a `horizon`, a leur heure exacte.
  // L'appelant ne doit pas placer de nouvel evenement avant `horizon`.
  function tick(horizon) {
    offs.forEach((at, key) => {
      if (at > horizon) return;
      const [voice, note] = key.split(':');
      off(Number(note), voice, at);
    });
  }

  // Fin de scene (l'envie retombe) : la phrase continue vers sa cadence, voir
  // sample(). Renvoie vrai si c'est deja fini (aucune note ne sonnait).
  function finish(now) {
    if (phase === 'silence' || sounding == null) { rest(now); return true; }
    if (phase === 'grace') phase = 'cadence';   // la note posee sur le centre est deja une fin
    if (!draining) { draining = true; drainStart = now; }
    return false;
  }

  // La scene revient avant la fin de la phrase : elle reprend librement.
  function resume() { draining = false; }

  // Arret sans phrase a finir : la note et l'accord finissent leur duree
  // minimale puis s'eteignent ; la scene suivante repartira du centre.
  function rest(now) {
    if (sounding != null) release(sounding, 'm', start + cfg.minDur, now);
    sounding = null;
    releaseChord(now);
    phase = 'silence';
    count = 0;
    draining = false;
  }

  function panic() {
    offs.forEach((_, key) => { const [voice, note] = key.split(':'); out.noteOff(Number(note), voice); });
    offs.clear();
    if (sounding != null) out.noteOff(sounding, 'm');
    chord.forEach(n => out.noteOff(n, 'h'));
    sounding = null;
    chord = [];
    phase = 'silence';
    count = 0;
    zRef = 0;
    draining = false;
  }

  return {
    configure, sample, tick, finish, resume, rest, panic,
    get state() { return { sounding, chord: [...chord], phase, count, draining }; },
  };
}
