/* ============================================================
   Noosfeerique — Sortie MIDI (U1 virtuel)
   Envoie les phrases du moteur (midi-engine.js) vers une sortie
   MIDI (Bus IAC -> MainStage). Panneau visible avec ?midi=1.
   ============================================================ */

import { SCALES, ENGINE_DEFAULTS, createEngine } from './midi-engine.js';

const STORAGE_KEY = 'noosphi_midi';
const VELOCITY = 100;          // frappe fixe
const SAMPLE_MS = 1000;        // lecture du z une fois par seconde (le Sample Rate du U1)
const TICK_MS = 50;
const NOTE_NAMES = ['Do','Do#','Ré','Ré#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];

const DEFAULTS = {
  ...ENGINE_DEFAULTS,
  enabled: false,
  outputId: null,
  channel: 1,
  gamme: 'app',      // 'app' : gamme choisie dans l'app ; 'u1' : La majeur ; 'chromatic'
};

const settings = loadSettings();
let access = null;
let output = null;
let latestZ = null;
let sampleTimer = null;
let tickTimer = null;
let panel = null;

const engine = createEngine({
  noteOn: n => send([0x90 | (settings.channel - 1), n, VELOCITY]),
  noteOff: n => send([0x80 | (settings.channel - 1), n, 0]),
});

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

function send(bytes) {
  if (output) output.send(bytes);
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

// Appele par experience.js a chaque nouvelle valeur du z-score de la source choisie
export function midiZ(z) {
  latestZ = z;
}

function onSample() {
  configureEngine();   // suit un changement de gamme dans l'app
  const note = engine.sample(latestZ, performance.now());
  updateReadout(note);
}

function startClock() {
  if (sampleTimer) return;
  sampleTimer = setInterval(onSample, SAMPLE_MS);
  tickTimer = setInterval(() => engine.tick(performance.now()), TICK_MS);
}

function stopClock() {
  clearInterval(sampleTimer);
  clearInterval(tickTimer);
  sampleTimer = tickTimer = null;
}

export function midiPanic() {
  engine.panic();
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

function updateReadout(note) {
  if (!panel) return;
  const z = latestZ != null && isFinite(latestZ) ? latestZ.toFixed(2) : '—';
  const { sounding, phase } = engine.state;
  const shown = note ?? sounding;
  panel.querySelector('[data-readout]').textContent =
    `z ${z}  ·  ${shown != null ? `${noteName(shown)} (${shown})` : '—'}  ·  ${phase}`;
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

function numberField(label, key, min, max, step = 1) {
  const input = el('input', { type: 'number', min, max, step, value: settings[key] });
  input.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Number(input.value)));
    if (!isFinite(v)) { input.value = settings[key]; return; }
    input.value = v;
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
    .midi-status { margin-top: 4px; color: rgba(255,255,255,.5); }
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
    numberField('Canal', 'channel', 1, 16),
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
  // Un changement de canal en cours de jeu laisserait des notes coincees sur l'ancien
  panel.querySelector('input').addEventListener('change', midiPanic);

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
  const status = el('div', { className: 'midi-status' }, 'MIDI en pause');
  status.dataset.status = '';
  panel.append(readout, status);

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
