/* ============================================================
   Noosfeerique — Sortie MIDI (U1 virtuel)
   Envoie les phrases du moteur (midi-engine.js) vers une sortie
   MIDI (Bus IAC -> MainStage). Panneau visible avec ?midi=1.

   Canal melodie : les phrases. Canal harmonie : les accords qui
   apparaissent quand la coherence monte. Un controleur continu (CC 20)
   suit le niveau de coherence : il ne fait rien tant qu'on ne le
   branche pas dans MainStage. Volumes et sons se reglent dans MainStage.

   Diagnostic : ?midi=debug ecrit chaque seconde dans la console ce que
   le module recoit et decide.
   ============================================================ */

import { SCALES, ENGINE_DEFAULTS, createEngine } from './midi-engine.js';
import { createCoherence } from './midi-coherence.js';

const STORAGE_KEY = 'noosphi_midi';
const VELOCITY = 100;          // frappe fixe, melodie et harmonie : les volumes se reglent dans MainStage
const CC_COHERENCE = 20;       // numero libre dans la norme MIDI : n'agit que si on l'assigne
const SAMPLE_MS = 1000;        // lecture du z une fois par seconde (le Sample Rate du U1)
const NOTE_NAMES = ['Do','Do#','Ré','Ré#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];

const DEFAULTS = {
  ...ENGINE_DEFAULTS,
  enabled: false,
  outputId: null,
  channel: 1,
  channelHarmony: 2,
  gamme: 'app',      // 'app' : gamme choisie dans l'app ; 'u1' : La majeur ; 'chromatic'
};

const settings = loadSettings();
let access = null;
let output = null;
let latestZ = null;
let clock = null;
let lastCc = -1;
let panel = null;

const coherence = createCoherence({ window: 60 });
const DEBUG = new URLSearchParams(location.search).get('midi') === 'debug';

// Chaque message part date : le systeme MIDI du Mac le joue a l'heure dite,
// meme si Chrome arrondit les minuteurs d'une fenetre cachee.
const channelOf = voice => (voice === 'h' ? settings.channelHarmony : settings.channel) - 1;
const engine = createEngine({
  noteOn: (n, voice, at) => send([0x90 | channelOf(voice), n, VELOCITY], at),
  noteOff: (n, voice, at) => send([0x80 | channelOf(voice), n, 0], at),
});

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

function send(bytes, at) {
  if (!output) return;
  if (at != null && at > performance.now()) output.send(bytes, at);
  else output.send(bytes);
}

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
  const coh = coherence.add(z);
  if (coh.cc !== lastCc) {
    lastCc = coh.cc;
    send([0xB0 | (settings.channel - 1), CC_COHERENCE, coh.cc]);
    send([0xB0 | (settings.channelHarmony - 1), CC_COHERENCE, coh.cc]);
  }
  let note = null;
  if (z != null && isFinite(z)) {
    configureEngine();   // suit un changement de gamme dans l'app
    note = engine.sample(z, now + (Math.abs(z) % 1) * SAMPLE_MS, coh.level);
  }
  // Relachements prevus avant la prochaine lecture, envoyes dates des maintenant
  engine.tick(now + SAMPLE_MS);
  updateReadout(note, coh);
  if (DEBUG) console.log(`[midi] ${Math.round(now)} z=${z} C=${coh.c.toFixed(2)} palier=${coh.level} note=${note} phase=${engine.state.phase}`);
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
  if (output && output.clear) output.clear();   // annule les messages dates pas encore partis
  for (let ch = 0; ch < 16; ch++) send([0xB0 | ch, 123, 0]);   // All Notes Off
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
  if (on) { configureEngine(); startClock(); }
  else { stopClock(); midiPanic(); }
  pickOutput();
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

function updateReadout(note, coh) {
  if (!panel) return;
  const z = latestZ != null && isFinite(latestZ) ? latestZ.toFixed(2) : '—';
  const { sounding, phase } = engine.state;
  const shown = note ?? sounding;
  panel.querySelector('[data-readout]').textContent =
    `z ${z}  ·  ${shown != null ? `${noteName(shown)} (${shown})` : '—'}  ·  ${phase}`;
  panel.querySelector('[data-coherence]').textContent =
    `Cohérence ${coh.c.toFixed(2)} · ${coh.name}`;
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
    numberField('Canal mélodie', 'channel', 1, 16, 1, midiPanic),
    numberField('Canal harmonie', 'channelHarmony', 1, 16, 1, midiPanic),
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
  panel.append(readout, coh, gauge, status, qr);

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

window.addEventListener('pagehide', midiPanic);
