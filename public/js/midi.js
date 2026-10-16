/* ============================================================
   Noosfeerique — Sortie MIDI (U1 virtuel)
   Envoie les phrases du moteur (midi-engine.js) vers une sortie
   MIDI (Bus IAC -> MainStage). Panneau visible avec ?midi=1.

   Canal melodie : les phrases. Canal harmonie : les accords qui
   apparaissent quand la coherence monte. Un controleur continu (CC 20)
   suit le niveau de coherence : il ne fait rien tant qu'on ne le
   branche pas dans MainStage. Volumes et sons se reglent dans MainStage.

   Voix back (midi-back.js) : nappes sur les piliers I, IV, V, qui suivent
   la tendance lente du z, sur son propre canal.

   L'envie (midi-envie.js) decide des scenes : silence tant que la coherence
   signee de la derniere minute reste entre -bas et +haut ; hors de cette
   zone il s'engage pour une minute, et reprend tant que ca tient.

   Passages, jamais abrupts : a l'entree, la nappe vient d'abord et la lead
   `entree` s apres ; a la sortie, la lead finit sa phrase jusqu'a sa
   cadence (l'accord avec elle), puis la nappe s'eteint `queue` s plus tard.
   En option, un fondu sur le controleur 11 (expression) des trois canaux.

   Diagnostic : ?midi=debug ecrit chaque seconde dans la console ce que
   le module recoit et decide.
   ============================================================ */

import { SCALES, ENGINE_DEFAULTS, createEngine } from './midi-engine.js';
import { createCoherence } from './midi-coherence.js';
import { ENVIE_DEFAULTS, createEnvie } from './midi-envie.js';
import { BACK_DEFAULTS, createBack } from './midi-back.js';
import { createScene } from './midi-scene.js';

const STORAGE_KEY = 'noosphi_midi';
const VELOCITY = 100;          // frappe fixe, melodie et harmonie : les volumes se reglent dans MainStage
const CC_COHERENCE = 20;       // numero libre dans la norme MIDI : n'agit que si on l'assigne
const CC_EXPRESSION = 11;      // fondu d'entree et de sortie (option)
const EXPR_PAS = 100;          // une valeur de fondu toutes les 100 ms
const SAMPLE_MS = 1000;        // lecture du z une fois par seconde (le Sample Rate du U1)
const NOTE_NAMES = ['Do','Do#','Ré','Ré#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];

const DEFAULTS = {
  ...ENGINE_DEFAULTS,
  enabled: false,
  outputId: null,
  channel: 1,
  channelHarmony: 2,
  channelBack: 3,
  envieHaut: ENVIE_DEFAULTS.haut,  // joue des que la coherence >= +haut
  envieBas: ENVIE_DEFAULTS.bas,    // joue des que la coherence <= -bas ; 0 et 0 = joue toujours
  accord: 2,                       // coherence (+ ou -) a partir de laquelle viennent les accords
  backTenue: BACK_DEFAULTS.tenueMin / 1000,   // s
  entree: 4,         // s : la lead entre apres la nappe
  queue: 4,          // s : la nappe s'eteint apres la fin de la phrase
  fondu: 'non',      // 'oui' : fondu par CC 11 sur les trois canaux
  gamme: 'app',      // 'app' : gamme choisie dans l'app ; 'u1' : La majeur ; 'chromatic'
};

const settings = loadSettings();
let access = null;
let output = null;
let latestZ = null;
let clock = null;
let lastCc = -1;
let panel = null;

const coherence = createCoherence({ window: 60, accord: settings.accord });
const envie = createEnvie({ haut: settings.envieHaut, bas: settings.envieBas });
const DEBUG = new URLSearchParams(location.search).get('midi') === 'debug';

// Chaque message part date : le systeme MIDI du Mac le joue a l'heure dite,
// meme si Chrome arrondit les minuteurs d'une fenetre cachee.
const channelOf = voice => (voice === 'h' ? settings.channelHarmony : voice === 'b' ? settings.channelBack : settings.channel) - 1;
const engine = createEngine({
  noteOn: (n, voice, at) => send([0x90 | channelOf(voice), n, VELOCITY], at),
  noteOff: (n, voice, at) => send([0x80 | channelOf(voice), n, 0], at),
});
const back = createBack({
  noteOn: (n, at) => send([0x90 | channelOf('b'), n, VELOCITY], at),
  noteOff: (n, at) => send([0x80 | channelOf('b'), n, 0], at),
});
const conductor = createScene({ engine, back, envie, coherence });
let lastExpr = -1;    // derniere valeur de fondu CC 11 envoyee

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // Reglage d'avant la zone de silence : un seul seuil, pour les deux bords
    if (saved.envie != null && saved.envieHaut == null) { saved.envieHaut = saved.envie; saved.envieBas = saved.envie; }
    delete saved.envie;
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

let lastAt = 0;   // heure du dernier message date (Chrome ne sait pas les annuler)

function send(bytes, at) {
  if (!output) return;
  if (at != null && at > performance.now()) { output.send(bytes, at); lastAt = Math.max(lastAt, at); }
  else output.send(bytes);
}

// Juste apres le dernier message date : ce qui est envoye la passe apres lui
const afterScheduled = () => Math.max(performance.now(), lastAt + 5);

// Gamme et tonique selon le reglage (le mode « libre » de l'app devient chromatique)
function currentScale() {
  if (settings.gamme === 'u1') return { intervals: SCALES.major, root: 9 };
  if (settings.gamme === 'chromatic') return { intervals: SCALES.chromatic, root: 0 };
  let key = null;
  try { key = localStorage.getItem('noosphi_scale'); } catch {}
  return { intervals: SCALES[key] || SCALES.chromatic, root: 0 };
}

function configureEngine() {
  const { intervals, root } = currentScale();
  engine.configure({
    low: settings.low, high: settings.high, centre: settings.centre, gain: settings.gain,
    seuil: settings.seuil, maison: settings.maison, minDur: settings.minDur,
  }, intervals, root);
  back.configure({ tenueMin: settings.backTenue * 1000 }, root, settings.centre, settings.low, settings.high);
  envie.configure({ haut: settings.envieHaut, bas: settings.envieBas });
  coherence.configure({ accord: settings.accord });
}

const allChannels = () => [settings.channel, settings.channelHarmony, settings.channelBack];

function sendExpressionValue(v, at) {
  lastExpr = v;
  allChannels().forEach(ch => send([0xB0 | (ch - 1), CC_EXPRESSION, v], at));
}

// Fondu CC 11 : envoie, dates a l'avance, les valeurs de la seconde qui vient.
// Fondu coupe en cours de route : on rend le plein volume, une fois.
function sendExpression(now) {
  if (settings.fondu !== 'oui') {
    if (lastExpr !== -1 && lastExpr !== 127) sendExpressionValue(127);
    lastExpr = -1;
    return;
  }
  for (let t = now; t < now + SAMPLE_MS; t += EXPR_PAS) {
    const v = Math.round(conductor.exprAt(t));
    if (v !== lastExpr) sendExpressionValue(v, t);
  }
}

// Appele par experience.js quand cette fenetre ouvre ou quitte une session
// collective : le panneau propose alors le QR code a projeter pour le public.
export function midiSessionCode(code) {
  if (!panel) return;
  const link = panel.querySelector('[data-qr]');
  link.classList.toggle('hidden', !code);
  if (code) link.href = `qr.html?code=${encodeURIComponent(code)}`;
}

// Appele par experience.js a chaque nouvelle valeur du z destine au MIDI
// (tirages frais seulement : session collective, ou sources rapides)
export function midiZ(z) {
  latestZ = z;
}

// Une fois par seconde : coherence, puis evenement place dans la seconde par
// les decimales du z (1,37 -> 0,37 s apres le tic). Les durees ne tombent pas
// sur une grille, et c'est encore le z qui decide.
function onSample() {
  const now = performance.now();
  const z = latestZ;
  configureEngine();   // suit un changement de gamme dans l'app
  const at = z != null && isFinite(z) ? now + (Math.abs(z) % 1) * SAMPLE_MS : now;
  const { coh, scene, note, attend } = conductor.step(z, now, {
    entree: settings.entree * 1000, queue: settings.queue * 1000, at,
  });
  if (coh.cc !== lastCc) {
    lastCc = coh.cc;
    allChannels().forEach(ch => send([0xB0 | (ch - 1), CC_COHERENCE, coh.cc]));
  }
  sendExpression(now);
  // Relachements prevus avant la prochaine lecture, envoyes dates des maintenant
  engine.tick(now + SAMPLE_MS);
  updateReadout(note, coh, scene, attend);
  if (DEBUG) console.log(`[midi] ${Math.round(now)} z=${z} C=${coh.s.toFixed(2)} palier=${coh.level} joue=${scene.joue} note=${note} phase=${engine.state.phase} fin=${engine.state.draining} back=${back.state.sounding}`);
}

function startClock() {
  if (!clock) clock = setInterval(onSample, SAMPLE_MS);
}

function stopClock() {
  clearInterval(clock);
  clock = null;
}

export function midiPanic() {
  engine.panic();
  back.panic();
  conductor.panic();   // garde le fondu en cours : une panique ne coupe pas le volume
  if (output && output.clear) output.clear();   // Firefox seulement : annule les messages dates
  // All Notes Off tout de suite, et encore apres le dernier message date :
  // Chrome ne sait pas annuler une note deja datee dans la seconde qui vient
  const after = afterScheduled();
  for (let ch = 0; ch < 16; ch++) {
    send([0xB0 | ch, 123, 0]);
    if (after > performance.now()) send([0xB0 | ch, 123, 0], after);
  }
  lastExpr = -1;   // le fondu sera renvoye en entier a la prochaine lecture
}

async function ensureAccess() {
  if (access) return true;
  if (!navigator.requestMIDIAccess) {
    setStatus('Ce navigateur ne sait pas envoyer de MIDI. Ouvrir la page dans Chrome.');
    return false;
  }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = () => { fillOutputs(); pickOutput(); };
    return true;
  } catch {
    setStatus('Accès MIDI refusé. Autoriser le MIDI pour ce site dans Chrome.');
    return false;
  }
}

function pickOutput() {
  if (!access) return;
  const outs = [...access.outputs.values()];
  const next = outs.find(o => o.id === settings.outputId) || outs[0] || null;
  if (next !== output) {
    midiPanic();
    output = next;
  }
  if (output) {
    settings.outputId = output.id;
    setStatus(settings.enabled ? `Envoi vers « ${output.name} »` : 'MIDI en pause');
  } else {
    setStatus('Aucune sortie MIDI. Activer le Bus IAC dans « Configuration audio et MIDI ».');
  }
}

function setEnabled(on) {
  settings.enabled = on;
  saveSettings();
  if (on) {
    envie.reset();
    coherence.reset();   // pas de cohérence périmée après une pause
    back.reset();
    conductor.reset();
    lastExpr = -1;
    configureEngine();
    startClock();
  }
  else {
    stopClock();
    midiPanic();
  }
  pickOutput();
  // Plein volume rendu a MainStage : a l'arret avec le fondu, et a l'activation
  // sans fondu (une seance precedente a pu le laisser a 0)
  if (!on ? settings.fondu === 'oui' : settings.fondu !== 'oui') restoreExpression();
}

function restoreExpression() {
  sendExpressionValue(127);
  sendExpressionValue(127, afterScheduled());
  lastExpr = -1;
}

// ============================================================
// Panneau de reglage (seulement avec ?midi=1)
// ============================================================
function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (text != null) e.textContent = text;
  return e;
}

// Convention Apple (MainStage, Logic) : Do central 60 = Do3
function noteName(n) {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 2}`;
}

function setStatus(msg) {
  if (panel) panel.querySelector('[data-status]').textContent = msg;
}

function updateReadout(note, coh, scene, attend) {
  if (!panel) return;
  const z = latestZ != null && isFinite(latestZ) ? latestZ.toFixed(2) : '—';
  const { sounding, phase, draining } = engine.state;
  const shown = note ?? sounding;
  const nappe = back.state.sounding;
  panel.querySelector('[data-readout]').textContent =
    `z ${z}  ·  lead ${shown != null ? noteName(shown) : '—'}  ·  back ${nappe != null ? noteName(nappe) : '—'}  ·  ${phase}`;
  panel.querySelector('[data-envie]').textContent = !scene.joue
    ? (draining ? 'Finit sa phrase' : back.state.active ? 'La nappe s’éteint' : 'Se tait, écoute')
    : attend ? 'Entre · la nappe d’abord'
    : scene.reste == null ? 'Joue (sans silence)'
    : `Joue · fait le point dans ${Math.ceil(scene.reste / 1000)} s`;
  panel.querySelector('[data-coherence]').textContent =
    `Cohérence ${coh.s >= 0 ? '+' : '−'}${coh.c.toFixed(2)} · ${coh.name}`;
  panel.querySelector('[data-bar]').style.width = `${Math.round(coh.cc / 1.27)}%`;
}

function fillOutputs() {
  if (!panel || !access) return;
  const select = panel.querySelector('[data-output]');
  select.replaceChildren();
  access.outputs.forEach(o => {
    const opt = el('option', { value: o.id }, o.name);
    opt.selected = o.id === settings.outputId;
    select.append(opt);
  });
}

function row(label, input) {
  const wrap = el('label', { className: 'midi-row' }, label);
  wrap.append(input);
  return wrap;
}

function numberField(label, key, min, max, step = 1, onChange) {
  const input = el('input', { type: 'number', min, max, step, value: settings[key] });
  input.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Number(input.value)));
    if (!isFinite(v)) { input.value = settings[key]; return; }
    input.value = v;
    if (onChange) onChange();   // avant le changement : couper sur l'ancien canal
    settings[key] = v;
    saveSettings();
    configureEngine();
  });
  return row(label, input);
}

function selectField(label, key, options) {
  const select = el('select');
  options.forEach(([value, text]) => {
    const opt = el('option', { value }, text);
    opt.selected = settings[key] === value;
    select.append(opt);
  });
  select.addEventListener('change', () => {
    settings[key] = select.value;
    saveSettings();
    configureEngine();
  });
  return row(label, select);
}

function buildPanel() {
  const style = el('style', {}, `
    .midi-panel { position: fixed; left: 12px; top: 64px; z-index: 50; width: 260px;
      max-height: calc(100vh - 80px); overflow-y: auto;
      background: rgba(11,14,20,.92); border: 1px solid #4EC9C6; border-radius: 10px;
      padding: 10px 12px; color: rgba(255,255,255,.9); font: 12px/1.4 Inter, -apple-system, sans-serif;
      backdrop-filter: blur(8px); }
    .midi-panel h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #4EC9C6; }
    .midi-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 4px 0; }
    .midi-panel input, .midi-panel select { background: #1a1f2a; color: rgba(255,255,255,.9);
      border: 1px solid #333; border-radius: 4px; padding: 2px 4px; width: 80px; font: inherit; }
    .midi-panel select { width: 130px; }
    .midi-buttons { display: flex; gap: 6px; margin-top: 8px; }
    .midi-buttons button { flex: 1; padding: 5px; border-radius: 6px; border: 1px solid #4EC9C6;
      background: transparent; color: #4EC9C6; font: inherit; cursor: pointer; }
    .midi-buttons button.on { background: #4EC9C6; color: #0B0E14; }
    .midi-readout { margin-top: 8px; font-family: ui-monospace, Menlo, monospace; color: #C9A24D; }
    .midi-coherence { margin-top: 4px; color: rgba(255,255,255,.7); }
    .midi-gauge { height: 4px; margin-top: 3px; background: #1a1f2a; border-radius: 2px; overflow: hidden; }
    .midi-gauge div { height: 100%; width: 0; background: #C9A24D; transition: width .8s ease; }
    .midi-status { margin-top: 4px; color: rgba(255,255,255,.5); }
    .midi-qr { display: block; margin-top: 8px; color: #C9A24D; }
    .midi-qr.hidden { display: none; }
  `);
  document.head.append(style);

  panel = el('div', { className: 'midi-panel' });
  panel.append(el('h3', {}, 'Sortie MIDI · U1 virtuel'));

  const output = el('select');
  output.dataset.output = '';
  output.addEventListener('change', () => {
    settings.outputId = output.value;
    saveSettings();
    pickOutput();
  });
  panel.append(row('Sortie', output));

  panel.append(
    numberField('Joue au-dessus de +', 'envieHaut', 0, 4, 0.1),
    numberField('Joue au-dessous de −', 'envieBas', 0, 4, 0.1),
    numberField('Accords dès ± (cohérence)', 'accord', 1.6, 4, 0.1),
    numberField('Canal lead', 'channel', 1, 16, 1, midiPanic),
    numberField('Canal accords', 'channelHarmony', 1, 16, 1, midiPanic),
    numberField('Canal back (nappes)', 'channelBack', 1, 16, 1, midiPanic),
    selectField('Gamme', 'gamme', [
      ['app', 'Celle de l’app'],
      ['u1', 'La majeur (U1)'],
      ['chromatic', 'Chromatique'],
    ]),
    numberField('Note la plus grave', 'low', 0, 127),
    numberField('Note la plus aiguë', 'high', 0, 127),
    numberField('Centre (départ)', 'centre', 0, 127),
    numberField('Degrés par unité de z', 'gain', 0.5, 12, 0.5),
    numberField('Seuil de mouvement', 'seuil', 0.1, 5, 0.1),
    numberField('Maison (± degrés)', 'maison', 0, 6, 1),
    numberField('Durée min. (ms)', 'minDur', 50, 5000, 50),
    numberField('Tenue min. back (s)', 'backTenue', 2, 60, 1),
    numberField('Entrée de la lead (s)', 'entree', 0, 20, 1),
    numberField('Queue de la back (s)', 'queue', 0, 30, 1),
    selectField('Fondu CC 11', 'fondu', [['non', 'Non'], ['oui', 'Oui']]),
  );

  const buttons = el('div', { className: 'midi-buttons' });
  const toggle = el('button', { type: 'button' });
  const refreshToggle = () => {
    toggle.textContent = settings.enabled ? 'MIDI actif' : 'Activer le MIDI';
    toggle.classList.toggle('on', settings.enabled);
  };
  toggle.addEventListener('click', async () => {
    if (!settings.enabled && !(await ensureAccess())) return;
    fillOutputs();
    setEnabled(!settings.enabled);
    refreshToggle();
  });
  const panic = el('button', { type: 'button' }, 'Panique');
  panic.title = 'Coupe toutes les notes';
  panic.addEventListener('click', midiPanic);
  buttons.append(toggle, panic);
  panel.append(buttons);

  const readout = el('div', { className: 'midi-readout' }, 'z —');
  readout.dataset.readout = '';
  const envieLine = el('div', { className: 'midi-coherence' }, 'Envie —');
  envieLine.dataset.envie = '';
  const coh = el('div', { className: 'midi-coherence' }, 'Cohérence —');
  coh.dataset.coherence = '';
  const gauge = el('div', { className: 'midi-gauge' });
  const bar = el('div');
  bar.dataset.bar = '';
  gauge.append(bar);
  const status = el('div', { className: 'midi-status' }, 'MIDI en pause');
  status.dataset.status = '';
  const qr = el('a', { className: 'midi-qr hidden', target: '_blank', rel: 'noopener' }, 'QR code pour le public ↗');
  qr.dataset.qr = '';
  panel.append(readout, envieLine, coh, gauge, status, qr);

  document.body.append(panel);
  refreshToggle();
  return refreshToggle;
}

if (new URLSearchParams(location.search).has('midi')) {
  const refreshToggle = buildPanel();
  // Reprise si le MIDI etait actif a la derniere visite
  if (settings.enabled) {
    ensureAccess().then(ok => {
      if (ok) { fillOutputs(); setEnabled(true); }
      else { settings.enabled = false; }
      refreshToggle();
    });
  }
} else {
  settings.enabled = false;   // jamais de MIDI sans le panneau visible
}

window.addEventListener('pagehide', () => {
  midiPanic();
  if (settings.enabled && settings.fondu === 'oui') restoreExpression();
});
