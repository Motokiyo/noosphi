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
        d'apres ouvre une nouvelle phrase.
   - Chaque note sonne au moins `minDur` ms.
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
  seuil: 1.5,        // mouvement minimal du z pour une nouvelle note
  maison: 0,         // degres autour du centre qui comptent comme « retour a la maison »
  minDur: 500,       // duree minimale d'une note (ms)
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

// out = { noteOn(n), noteOff(n) } ; le temps est fourni par l'appelant (ms)
export function createEngine(out) {
  let cfg = { ...ENGINE_DEFAULTS };
  let notes = scaleNotes(SCALES.chromatic, 0, cfg.low, cfg.high);
  let sounding = null;     // note qui sonne
  let start = 0;           // debut de cette note
  let zRef = 0;            // z du dernier evenement (0 apres un silence)
  let phase = 'silence';   // 'silence' | 'phrase' | 'cadence'
  let count = 0;           // notes dans la phrase en cours
  const offs = new Map();  // note -> heure de relachement prevue

  function configure(next, intervals, root) {
    cfg = { ...cfg, ...next };
    notes = scaleNotes(intervals, root, cfg.low, cfg.high);
  }

  function release(note, at, now) {
    if (at <= now) { offs.delete(note); out.noteOff(note); }
    else offs.set(note, at);
  }

  function play(note, now) {
    if (sounding === note && now - start < cfg.minDur) return; // deja la, trop tot pour la refrapper
    if (sounding != null) release(sounding, start + cfg.minDur, now);
    if (offs.has(note)) { offs.delete(note); out.noteOff(note); }
    out.noteOn(note);
    sounding = note;
    start = now;
  }

  // Une mesure du z (une fois par seconde). Renvoie la note jouee ou null.
  function sample(z, now) {
    if (z == null || !isFinite(z) || !notes.length) return null;
    if (Math.abs(z - zRef) < cfg.seuil) return null;
    zRef = z;

    if (phase === 'cadence') {          // ce mouvement ouvre le silence
      if (sounding != null) release(sounding, start + cfg.minDur, now);
      sounding = null;
      phase = 'silence';
      zRef = 0;
      return null;
    }

    const centre = nearestIndex(notes, cfg.centre);
    if (phase === 'silence') { phase = 'phrase'; count = 0; }
    const base = count > 0 && sounding != null ? nearestIndex(notes, sounding) : centre;
    const i = Math.max(0, Math.min(notes.length - 1, base + Math.round(z * cfg.gain)));
    play(notes[i], now);
    count++;
    const home = count > 1 && Math.abs(i - centre) <= cfg.maison;
    const edge = i === 0 || i === notes.length - 1;
    if (home || edge) phase = 'cadence';
    return notes[i];
  }

  // Horloge fine (toutes les ~50 ms) : relachements differes
  function tick(now) {
    offs.forEach((at, note) => { if (at <= now) { offs.delete(note); out.noteOff(note); } });
  }

  function panic() {
    offs.forEach((_, note) => out.noteOff(note));
    offs.clear();
    if (sounding != null) out.noteOff(sounding);
    sounding = null;
    phase = 'silence';
    count = 0;
    zRef = 0;
  }

  return {
    configure, sample, tick, panic,
    get state() { return { sounding, phase, count }; },
  };
}
