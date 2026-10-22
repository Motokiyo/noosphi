/* ============================================================
   Noosfeerique — Experience (Sphere MVP)
   Three.js sphere + local Z-score + audio + API sources
   ============================================================ */

import * as THREE from 'three';
import { midiZ, midiSessionCode, midiZJoue } from './midi.js';
import { versRapportHTML, ficheJSON, tableauRapport, telephonesTexte, calculerRapport, nomFichier } from './rapport.js';
import { createSeance, zAffiche, versCSV, texteResume, texteParSource, etatCicada, choixInitial, basculer, titreTemoin, TEMOIN, TEMOIN_COULEUR, createCombinaison, etatSource, SALLE_CLES, SALLE_DEFAUT } from './seance.js';

const APP_VERSION = '1.6.0';

// ---- Constants ----
const Z_MAX = 3;               // z-score ceiling for visual/audio normalization
const VIBRATO_RATE = 5;        // Hz — bow vibrato
const VIBRATO_DEPTH = 3;       // Hz — subtle pitch wobble
const DETUNE_CENTS = 4;        // slight chorus between two strings

// ---- Musical scale system (A = 432 Hz) ----
const A4_FREQ = 432;           // Hz — concert pitch (432 Hz tuning)
// Convert MIDI note number to frequency: f = A4 * 2^((midi-69)/12)
function midiToFreq(midi) { return A4_FREQ * Math.pow(2, (midi - 69) / 12); }

// Scale intervals (semitones from root)
const SCALES = {
  free:        null,  // no quantization — continuous Hz sweep
  chromatic:   [0,1,2,3,4,5,6,7,8,9,10,11],
  major:       [0,2,4,5,7,9,11],
  minor:       [0,2,3,5,7,8,10],
  pentatonic:  [0,2,4,7,9],
  dorian:      [0,2,3,5,7,9,10],
};

// Build note frequencies for a scale across the cello range (C2=36 to E4=64 MIDI)
const MIDI_LOW = 36;   // C2
const MIDI_HIGH = 64;  // E4
const BASE_FREQ = midiToFreq(MIDI_LOW);   // ~64 Hz at 432
const MAX_FREQ = midiToFreq(MIDI_HIGH);   // ~324 Hz at 432

function buildScaleFreqs(scaleKey) {
  if (!SCALES[scaleKey]) return null; // free mode
  const intervals = SCALES[scaleKey];
  const freqs = [];
  for (let midi = MIDI_LOW; midi <= MIDI_HIGH; midi++) {
    const noteInOctave = midi % 12;
    // Check if this note's interval from C (midi%12=0) is in the scale
    // We use C as root for simplicity
    if (intervals.includes(noteInOctave)) {
      freqs.push(midiToFreq(midi));
    }
  }
  return freqs;
}

// Snap a frequency to the nearest note in the scale
function quantizeFreq(freq, scaleFreqs) {
  if (!scaleFreqs) return freq; // free mode
  let closest = scaleFreqs[0];
  let minDist = Math.abs(freq - closest);
  for (let i = 1; i < scaleFreqs.length; i++) {
    const dist = Math.abs(freq - scaleFreqs[i]);
    if (dist < minDist) { minDist = dist; closest = scaleFreqs[i]; }
  }
  return closest;
}

let currentScaleFreqs = null;
const API_POLL_INTERVAL = 60000; // 60s for API sources
const AUDIO_FADEOUT_TIME = 0.3;  // seconds — gain ramp when muting
const AUDIO_RAMP_TIME    = 0.5;  // seconds — pitch/filter/gain transitions

// ---- DOM refs ----
const canvas = document.getElementById('sphere-canvas');
const zDisplay = document.getElementById('z-display');
const zDisplayLabel = document.querySelector('.z-indicator .z-label');
const zDisplayTemoin = document.getElementById('z-temoin');
const sessionZTemoin = document.getElementById('session-z-temoin');
const loadingText = document.getElementById('loading-text');
const audioIndicator = document.getElementById('audio-indicator');
const sourceDots = document.querySelectorAll('.source-dot');
const spherePhotoEl = document.getElementById('sphere-photo');
const spherePhotoImg = spherePhotoEl?.querySelector('img');

// Sidebar z-score displays (cached — updated every second in combineAndUpdate)
const sidebarZLocal    = document.getElementById('sidebar-z-local');
const sidebarZNist     = document.getElementById('sidebar-z-nist');
const sidebarZQci      = document.getElementById('sidebar-z-qci');
const sidebarZCombined = document.getElementById('sidebar-z-combined');

// Graph overlay live z-score displays (cached — updated every second in combineAndUpdate)
const graphZValue   = document.getElementById('graph-z-value');
const graphZSources = document.getElementById('graph-z-sources');

// ============================================================
// EGG-method z-score (identical to Princeton methodology)
// 200 random bits → count 1s → z = (sum - 100) / sqrt(50)
// This produces a proper N(0,1) z-score by construction.
// ============================================================
const SQRT_50 = Math.sqrt(50);

const LOCAL_TRIALS = 10; // 10 trials per tick → Stouffer smoothing like a 10-EGG network

function localEggZ() {
  // 10 independent trials of 200 bits each, Stouffer combined
  const bytes = new Uint8Array(25 * LOCAL_TRIALS); // 250 bytes = 2000 bits
  crypto.getRandomValues(bytes);
  let zSum = 0;
  for (let t = 0; t < LOCAL_TRIALS; t++) {
    let sum = 0;
    const offset = t * 25;
    for (let i = 0; i < 25; i++) {
      let b = bytes[offset + i];
      b = b - ((b >> 1) & 0x55);
      b = (b & 0x33) + ((b >> 2) & 0x33);
      sum += (b + (b >> 4)) & 0x0F;
    }
    zSum += (sum - 100) / SQRT_50;
  }
  return zSum / Math.sqrt(LOCAL_TRIALS);
}

// ============================================================
// Three.js Scene
// ============================================================
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'low-power'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0B0E14);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 3.5;

// ---- Sphere ----
const sphereGeo = new THREE.SphereGeometry(1, 64, 64);
const sphereMat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0xF5F5F2),
  roughness: 0.15,
  metalness: 0.0,
  clearcoat: 0.8,
  clearcoatRoughness: 0.1,
  emissive: new THREE.Color(0x000000),
  emissiveIntensity: 0,
});
const sphere = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphere);

// ---- Lighting ----
// Ambient: very dim base
const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

// Key light (front-top-right)
const keyLight = new THREE.PointLight(0xffffff, 0.8, 20);
keyLight.position.set(2, 2, 4);
scene.add(keyLight);

// Fill light (left, dimmer)
const fillLight = new THREE.PointLight(0x4EC9C6, 0.1, 15);
fillLight.position.set(-3, 0, 2);
scene.add(fillLight);

// Rim light (behind, for edge glow)
const rimLight = new THREE.PointLight(0xC9A24D, 0.15, 15);
rimLight.position.set(0, -1, -3);
scene.add(rimLight);

// ---- Halo glow (additive sprite behind sphere) ----
const glowCanvas = document.createElement('canvas');
glowCanvas.width = 256;
glowCanvas.height = 256;
const glowCtx = glowCanvas.getContext('2d');
const gradient = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
gradient.addColorStop(0, 'rgba(255,255,255,0.3)');
gradient.addColorStop(0.4, 'rgba(255,255,255,0.05)');
gradient.addColorStop(1, 'rgba(255,255,255,0.0)');
glowCtx.fillStyle = gradient;
glowCtx.fillRect(0, 0, 256, 256);

const glowTexture = new THREE.CanvasTexture(glowCanvas);
const glowMat = new THREE.SpriteMaterial({
  map: glowTexture,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0,
});
const glowSprite = new THREE.Sprite(glowMat);
glowSprite.scale.set(4, 4, 1);
scene.add(glowSprite);

// ---- Resize (sphere responsive) ----
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  // Sphere diameter = 75% of the smallest screen dimension.
  // Visible half-height at distance z = z * tan(halfFov).
  // Visible half-width = half-height * aspect.
  // We want: sphere_diameter / min(screenW, screenH) = 0.75
  // → sphere_radius / min(half-width, half-height) = 0.75
  // → z = radius / (0.75 * tan(halfFov))        if height is smallest
  // → z = radius / (0.75 * tan(halfFov) * aspect) if width is smallest
  const tanFov = Math.tan(25 * Math.PI / 180);
  const target = 0.75; // 75% of smallest dimension
  if (camera.aspect < 1) {
    // Portrait: width is smallest → size by width
    camera.position.z = 1 / (target * tanFov * camera.aspect);
  } else {
    // Landscape: height is smallest → size by height
    camera.position.z = 1 / (target * tanFov);
  }
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);
onResize(); // apply immediately

// ============================================================
// Audio Engine — Meditative soundscape
//
// Three elements:
// 1. DRONE: Very soft tanpura — always present
// 2. CONTINUOUS LAYERS: Pad strings + cello — fade in with |z|
// 3. PERCUSSIVE: Struck bowls, bells, gongs — triggered by z changes
//
// All melodic elements quantized to the chosen scale (432 Hz).
// Designed for meditation: soothing, spacious, never aggressive.
// ============================================================
let audioCtx = null;
let masterGain = null;
let audioActive = false;
let lastStrikeTime = 0;
let prevQuantizedFreq = 0;

// Continuous layers
let droneOsc1, droneOsc2, droneGain, droneFilter;
let padOsc1, padOsc2, padGain, padFilter;
let celloOsc1, celloOsc2, celloGain, celloFilter, celloLFO, celloVibGain;

// Custom waves
function waveTanpura(ctx) {
  const r = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const i = new Float32Array([0, 1, 0, 0.12, 0, 0.04, 0, 0.02, 0]);
  return ctx.createPeriodicWave(r, i);
}
function wavePad(ctx) {
  const r = new Float32Array([0, 0, 0.3, 0, 0.1, 0, 0.03]);
  const i = new Float32Array([0, 1, 0, 0.2, 0, 0.08, 0]);
  return ctx.createPeriodicWave(r, i);
}
function waveCello(ctx) {
  const r = new Float32Array([0, 0, 0.4, 0.2, 0.1, 0.05]);
  const i = new Float32Array([0, 1, 0, 0.3, 0, 0.12]);
  return ctx.createPeriodicWave(r, i);
}

function initAudio() {
  if (audioCtx) return;
  // 'playback' latencyHint uses a larger buffer — prevents glitches on mobile
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;

  // Spacious reverb
  const revDelay1 = audioCtx.createDelay(2);
  revDelay1.delayTime.value = 0.2;
  const revDelay2 = audioCtx.createDelay(2);
  revDelay2.delayTime.value = 0.35;
  const revGain = audioCtx.createGain();
  revGain.gain.value = 0.35;
  const revFilter = audioCtx.createBiquadFilter();
  revFilter.type = 'lowpass';
  revFilter.frequency.value = 1200;

  // Compressor: prevents clipping/crackling on phone speakers
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 30;         // wide knee — very smooth compression
  compressor.ratio.value = 12;        // aggressive ratio for phone speakers
  compressor.attack.value = 0.003;    // 3ms — catches transients before they clip
  compressor.release.value = 0.25;    // smooth release

  masterGain.connect(compressor);
  compressor.connect(audioCtx.destination);
  masterGain.connect(revDelay1);
  masterGain.connect(revDelay2);
  revDelay1.connect(revFilter);
  revDelay2.connect(revFilter);
  revFilter.connect(revGain);
  revGain.connect(revDelay1);
  revGain.connect(compressor);

  // Drone: very soft tanpura — C2 432Hz
  const tanpura = waveTanpura(audioCtx);
  droneOsc1 = audioCtx.createOscillator();
  droneOsc2 = audioCtx.createOscillator();
  droneOsc1.setPeriodicWave(tanpura);
  droneOsc2.setPeriodicWave(tanpura);
  droneOsc1.frequency.value = midiToFreq(48); // C3 ~128Hz — audible on phone speakers
  droneOsc2.frequency.value = midiToFreq(48);
  droneOsc2.detune.value = 2;

  droneFilter = audioCtx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 150;
  droneFilter.Q.value = 0.2;

  droneGain = audioCtx.createGain();
  droneGain.gain.value = 0;

  droneOsc1.connect(droneFilter);
  droneOsc2.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(masterGain);
  droneOsc1.start();
  droneOsc2.start();

  // Pad: warm strings — appears at |z|>0.3
  const padW = wavePad(audioCtx);
  padOsc1 = audioCtx.createOscillator();
  padOsc2 = audioCtx.createOscillator();
  padOsc1.setPeriodicWave(padW);
  padOsc2.setPeriodicWave(padW);
  padOsc1.frequency.value = midiToFreq(48);
  padOsc2.frequency.value = midiToFreq(48);
  padOsc2.detune.value = 6;
  padFilter = audioCtx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 400;
  padFilter.Q.value = 0.3;
  padGain = audioCtx.createGain();
  padGain.gain.value = 0;
  padOsc1.connect(padFilter);
  padOsc2.connect(padFilter);
  padFilter.connect(padGain);
  padGain.connect(masterGain);
  padOsc1.start();
  padOsc2.start();

  // Cello: melodic voice — appears at |z|>0.7
  const celloW = waveCello(audioCtx);
  celloOsc1 = audioCtx.createOscillator();
  celloOsc2 = audioCtx.createOscillator();
  celloOsc1.setPeriodicWave(celloW);
  celloOsc2.setPeriodicWave(celloW);
  celloOsc1.frequency.value = midiToFreq(48);
  celloOsc2.frequency.value = midiToFreq(48);
  celloOsc2.detune.value = 4;
  celloFilter = audioCtx.createBiquadFilter();
  celloFilter.type = 'lowpass';
  celloFilter.frequency.value = 800;
  celloFilter.Q.value = 0.5;
  celloGain = audioCtx.createGain();
  celloGain.gain.value = 0;
  celloOsc1.connect(celloFilter);
  celloOsc2.connect(celloFilter);
  celloFilter.connect(celloGain);
  celloGain.connect(masterGain);
  celloOsc1.start();
  celloOsc2.start();

  // Cello vibrato
  celloLFO = audioCtx.createOscillator();
  celloLFO.type = 'sine';
  celloLFO.frequency.value = 4.5;
  celloVibGain = audioCtx.createGain();
  celloVibGain.gain.value = 1.5;
  celloLFO.connect(celloVibGain);
  celloVibGain.connect(celloOsc1.frequency);
  celloVibGain.connect(celloOsc2.frequency);
  celloLFO.start();
}

// Strike a bowl/bell — creates a one-shot sound that decays naturally
// All ramps use exponentialRamp (smoother than linear, no discontinuities)
// exponentialRamp can't start from 0 — use 0.001 as floor
function strikeSound(freq, volume, decay, type) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const ATTACK = 0.03; // 30ms soft exponential attack

  if (type === 'bowl') {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 2.76;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 12;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.001), t + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);

    osc1.connect(filter);
    osc2.connect(gain);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + decay);
    osc2.stop(t + decay);

  } else if (type === 'bell') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume * 0.6, 0.001), t + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.6);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + decay * 0.6);

  } else if (type === 'gong') {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.5;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 3;
    filter.Q.value = 1;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.001), t + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + decay);
    osc2.stop(t + decay);
  }
}

function toggleAudio() {
  if (!audioCtx) {
    initAudio();
    audioActive = true;
    audioCtx.resume();
    updateAudio(smoothZ || 0);
  } else if (audioActive) {
    audioActive = false;
    masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 1.5);
  } else {
    audioActive = true;
    audioCtx.resume();
    updateAudio(smoothZ || 0);
  }
  audioIndicator.classList.toggle('active', audioActive);
  const sa = document.getElementById('btn-session-audio');
  if (sa) sa.classList.toggle('active', audioActive);
}

function updateAudio(zScore) {
  if (!audioCtx || !audioActive) return;
  const t = audioCtx.currentTime;
  const absZ = Math.abs(zScore);
  const intensity = Math.min(absZ / Z_MAX, 1);
  const now = Date.now();

  // === Master volume (scaled by user volume slider) ===
  const baseVol = 0.15 + intensity * 0.35;
  masterGain.gain.setTargetAtTime(baseVol * (userVolume * 2), t, 1.0);

  // === Drone: always, very quiet ===
  // Use midiToFreq(48) = C3 ~128Hz instead of C2 ~64Hz — audible on phone speakers
  droneGain.gain.setTargetAtTime(0.025 + intensity * 0.015, t, 2.0);
  droneFilter.frequency.setTargetAtTime(180 + intensity * 180, t, 1.0);

  // === Pad strings (|z|>0.3): one octave below cello ===
  // Plays harmonic intervals that evolve with intensity:
  // z low: unison/octave below. z mid: adds fifth. z high: varies between intervals.
  const padT = Math.max(0, (absZ - 0.3) / 0.7);
  padGain.gain.setTargetAtTime(Math.min(padT, 1) * 0.025, t, 1.2);
  padFilter.frequency.setTargetAtTime(250 + padT * 350, t, 0.8);

  // === Cello + Pad shared pitch ===
  // Cello frequency is computed first; pad plays one octave below it.
  const pitchT = Math.pow(intensity, 0.6);
  const celloFreqRaw = BASE_FREQ + pitchT * (MAX_FREQ - BASE_FREQ);
  const celloFreqQ = quantizeFreq(celloFreqRaw, currentScaleFreqs);

  // Pad: octave below as base, osc2 plays a slow-cycling harmonic interval
  const elapsed = audioCtx.currentTime;
  const INTERVALS = [0.5, 0.5, 0.667, 0.5, 0.75, 0.5]; // octave, octave, fifth below, octave, fourth below, octave
  const intervalIdx = Math.floor(elapsed / 8) % INTERVALS.length; // changes every ~8s
  const padBase = celloFreqQ * INTERVALS[intervalIdx];
  let padFreq = quantizeFreq(padBase, currentScaleFreqs) || padBase;
  const padTc = currentScaleFreqs ? 0.1 : 0.8;
  padOsc1.frequency.setTargetAtTime(padFreq, t, padTc);
  // Second oscillator on a neighboring note for richness
  const padFreq2 = quantizeFreq(celloFreqQ * 0.5, currentScaleFreqs) || celloFreqQ * 0.5;
  padOsc2.frequency.setTargetAtTime(padFreq2, t, padTc);

  // === Cello melody (|z|>0.7): follows scale ===
  const celloT = Math.max(0, (absZ - 0.7) / 1.0);
  celloGain.gain.setTargetAtTime(Math.min(celloT, 1) * 0.03, t, 0.6);
  celloFilter.frequency.setTargetAtTime(300 + celloT * 700, t, 0.5);
  celloVibGain.gain.setTargetAtTime(1 + celloT * 3, t, 0.5);

  const freq = celloFreqQ;
  const noteChanged = Math.abs(freq - prevQuantizedFreq) > 0.5;
  if (noteChanged) {
    const tc = currentScaleFreqs ? 0.1 : 0.4;
    celloOsc1.frequency.setTargetAtTime(freq, t, tc);
    celloOsc2.frequency.setTargetAtTime(freq, t, tc);
  }

  // === Percussive strikes (all quantized, humanized with randomness) ===
  // Interval between strikes: randomized ±25%
  const baseInterval = 8000 - intensity * 6500;
  const minInterval = baseInterval * (0.75 + Math.random() * 0.5);
  const timeSinceStrike = now - lastStrikeTime;

  if (noteChanged && timeSinceStrike > minInterval) {
    // Humanization helpers: ±30% on volume, ±40% on decay, 0–150ms timing stagger
    const rVol = () => 0.7 + Math.random() * 0.6;
    const rDec = () => 0.6 + Math.random() * 0.8;
    const rDelay = () => Math.random() * 0.15;
    prevQuantizedFreq = freq;
    lastStrikeTime = now;

    const strikeVol = 0.008 + intensity * 0.02;

    const bowlFreq = quantizeFreq(freq * 2, currentScaleFreqs) || freq * 2;
    const bellFreq = quantizeFreq(freq * 4, currentScaleFreqs) || freq * 4;
    const gongFreq = quantizeFreq(freq * 0.5, currentScaleFreqs) || freq * 0.5;

    if (absZ < 0.5) {
      strikeSound(bowlFreq, strikeVol * 0.4 * rVol(), 4 * rDec(), 'bowl');
    } else if (absZ < 1.0) {
      strikeSound(bowlFreq, strikeVol * rVol(), 5 * rDec(), 'bowl');
    } else if (absZ < 1.5) {
      strikeSound(bowlFreq, strikeVol * rVol(), 5 * rDec(), 'bowl');
      setTimeout(() => strikeSound(bellFreq, strikeVol * 0.3 * rVol(), 3 * rDec(), 'bell'), rDelay() * 1000);
    } else if (absZ < 2.0) {
      strikeSound(gongFreq, strikeVol * 0.7 * rVol(), 8 * rDec(), 'gong');
      setTimeout(() => strikeSound(bowlFreq, strikeVol * rVol(), 5 * rDec(), 'bowl'), rDelay() * 1000);
      setTimeout(() => strikeSound(bellFreq, strikeVol * 0.3 * rVol(), 3 * rDec(), 'bell'), rDelay() * 1000);
    } else {
      strikeSound(gongFreq, strikeVol * 0.8 * rVol(), 10 * rDec(), 'gong');
      setTimeout(() => strikeSound(bowlFreq, strikeVol * rVol(), 6 * rDec(), 'bowl'), rDelay() * 1000);
      setTimeout(() => strikeSound(bellFreq, strikeVol * 0.3 * rVol(), 3 * rDec(), 'bell'), rDelay() * 1000);
    }
  }
}

// Click on canvas toggles audio
canvas.addEventListener('click', toggleAudio);

// Volume slider: tap audio btn to show/hide, drag to adjust
let userVolume = parseFloat(localStorage.getItem('noosphi_volume') || '0.5');

// Audio button: tap = toggle sound. Long-press or second tap = show/hide volume slider.
let sliderVisible = false;

document.querySelectorAll('.audio-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const container = btn.closest('.audio-indicator') || btn.closest('.session-audio-fixed');
    const slider = container?.querySelector('.audio-slider');

    if (sliderVisible && slider?.classList.contains('visible')) {
      // Slider is showing — close it, don't toggle audio
      slider.classList.remove('visible');
      sliderVisible = false;
    } else {
      // Toggle audio and show slider briefly
      toggleAudio();
      if (slider) {
        slider.classList.add('visible');
        sliderVisible = true;
        clearTimeout(slider._hideTimer);
        slider._hideTimer = setTimeout(() => {
          slider.classList.remove('visible');
          sliderVisible = false;
        }, 5000);
      }
    }
  });
});

// Volume sliders — drag adjusts volume, doesn't toggle audio
document.querySelectorAll('.audio-slider input[type="range"]').forEach(input => {
  input.value = userVolume * 100;
  input.addEventListener('input', (e) => {
    userVolume = parseInt(e.target.value) / 100;
    localStorage.setItem('noosphi_volume', userVolume.toString());
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(userVolume * 0.5, audioCtx.currentTime, 0.3);
    }
    // Sync all sliders
    document.querySelectorAll('.audio-slider input[type="range"]').forEach(s => { s.value = e.target.value; });
    // Keep slider open while dragging
    document.querySelectorAll('.audio-slider').forEach(s => {
      clearTimeout(s._hideTimer);
      s._hideTimer = setTimeout(() => { s.classList.remove('visible'); sliderVisible = false; }, 5000);
    });
  });
  // Prevent all events from bubbling to parent (no toggle while dragging)
  ['click', 'mousedown', 'touchstart', 'touchmove'].forEach(evt => {
    input.addEventListener(evt, (e) => e.stopPropagation(), { passive: evt.startsWith('touch') });
  });
});

// ============================================================
// Visual updates based on Z-score
// ============================================================
let currentZ = 0;
let targetZ = 0;
let smoothZ = 0;

// Pre-allocated colors to avoid GC pressure in animation loop
const COLOR_CYAN = new THREE.Color(0x4EC9C6);
const COLOR_GOLD = new THREE.Color(0xC9A24D);

function updateVisuals(z) {
  targetZ = z;
}

function lerpVisuals(dt) {
  smoothZ += (targetZ - smoothZ) * Math.min(dt * 2, 1);
  const absZ = Math.abs(smoothZ);
  const intensity = Math.min(absZ / Z_MAX, 1);

  // Sphere emissive: dark at z=0, bright at high |z|
  const emissiveVal = intensity * 0.6;
  sphereMat.emissive.setRGB(emissiveVal, emissiveVal, emissiveVal * 0.95);
  sphereMat.emissiveIntensity = 1;

  // Key light intensity scales up
  keyLight.intensity = 0.8 + intensity * 2.5;

  // Glow sprite opacity
  glowMat.opacity = intensity * 0.7;
  const glowScale = 3.5 + intensity * 2.5;
  glowSprite.scale.set(glowScale, glowScale, 1);

  // Tint accents at high z
  if (absZ > 2) {
    const t = Math.min((absZ - 2) / 2, 1);
    // Shift toward gold/cyan at extreme values
    const isPositive = smoothZ > 0;
    if (isPositive) {
      fillLight.color.lerp(COLOR_CYAN, t * 0.3);
      fillLight.intensity = 0.1 + t * 0.5;
    } else {
      rimLight.color.lerp(COLOR_GOLD, t * 0.3);
      rimLight.intensity = 0.15 + t * 0.5;
    }
  } else {
    fillLight.intensity = 0.1;
    rimLight.intensity = 0.15;
    fillLight.color.set(0x4EC9C6);
    rimLight.color.set(0xC9A24D);
  }

  // Franck's photo sphere — same size as 3D sphere, opacity follows |z|
  // Fixed size matching the 3D sphere (75% of smallest screen dimension)
  const sphereSize = Math.min(window.innerWidth, window.innerHeight) * 0.75;
  spherePhotoImg.style.width = sphereSize + 'px';
  spherePhotoImg.style.height = sphereSize + 'px';

  if (absZ > 2) {
    const photoT = Math.min((absZ - 2) / 1.5, 1); // 0→1 over z 2→3.5
    spherePhotoEl.style.opacity = photoT * 0.85; // 0% → 85% opacity
  } else if (parseFloat(spherePhotoEl.style.opacity) > 0) {
    spherePhotoEl.style.opacity = 0;
  }

  // Update z-display : pendant un enregistrement, le z de la seance (la maree) ;
  // la sphere, le son et le MIDI restent sur le z de l'instant
  if (localReady) {
    const aff = zAffiche({ enregistrement: sessionActive, zInstant: smoothZ, zSeance: seance ? seance.resume().zSalle : null });
    if (zDisplayLabel && zDisplayLabel.textContent !== aff.libelle) zDisplayLabel.textContent = aff.libelle;
    if (aff.valeur == null) {
      zDisplay.textContent = '--';
      zDisplay.style.color = '';
    } else {
      zDisplay.textContent = aff.valeur.toFixed(2);
      zDisplay.style.color = zColor(Math.abs(aff.valeur));
    }
  }
}

// ============================================================
// Animation Loop
// ============================================================
const clock = new THREE.Clock();
// Mode concert (?concert=1), pour un vieux Mac qui joue en MIDI : la sphere
// tourne a CONCERT_FPS images par seconde au lieu de 60, ou reste figee si
// le panneau MIDI le demande (localStorage noosphi_sphere = 'figee').
const CONCERT = new URLSearchParams(location.search).has('concert');
const CONCERT_FPS = 20;
let sphereFigee = false;
let lastFrame = 0;
try { sphereFigee = CONCERT && localStorage.getItem('noosphi_sphere') === 'figee'; } catch {}
window.addEventListener('noosphi:sphere', e => {
  sphereFigee = CONCERT && e.detail === 'figee';
  clock.getDelta();   // pas de saut a la reprise
});

function animate(now = 0) {
  requestAnimationFrame(animate);
  if (CONCERT) {
    if (sphereFigee || now - lastFrame < 1000 / CONCERT_FPS) return;
    lastFrame = now;
  }
  const dt = Math.min(clock.getDelta(), 0.25);

  // Slow rotation (meme vitesse a 20 images/s qu'a 60)
  const pas = CONCERT ? 60 / CONCERT_FPS : 1;
  sphere.rotation.y += 0.003 * pas;
  sphere.rotation.x += 0.001 * pas;

  lerpVisuals(dt);
  renderer.render(scene, camera);
}

// ============================================================
// Z-Score Engine (local RNG, 1 calc/second, EGG method)
// ============================================================
let localReady = false;

function tickLocalZ() {
  currentZ = localEggZ();
  localReady = true;
  combineAndUpdate();
  loadingText.classList.add('hidden');
}

// ============================================================
// API Sources (fetched in parallel, combined via Stouffer)
// ============================================================
// Princeton : collecte arretee le 03/04/2026. ANU : retiree (payante).
const apiZScores = {
  nist: null,
  qci: null,
  local_server: null,
};

function processApiResult(key, dotIndex, z) {
  if (z != null && isFinite(z)) {
    apiZScores[key] = z;
    dernierOk[key] = Date.now();
    sourceDots[dotIndex]?.classList.add('active');
  } else {
    apiZScores[key] = null;
    sourceDots[dotIndex]?.classList.remove('active');
  }
}

// NIST Beacon 2.0 : une pulsation par minute ; on regarde toutes les 20 s pour
// la prendre tot. La meme pulsation donne le meme z : elle ne compte qu'une fois.
async function fetchNIST() {
  try {
    const d = await fetch('/api/nist-beacon').then(r => r.json());
    processApiResult('nist', 1, d.status === 'ok' ? d.zIndex : null);
  } catch { processApiResult('nist', 1, null); }
  combineAndUpdate();
}

// QCI — polled every 1s (25 bytes/req = ~52% of 1B bits/month quota)
async function fetchQCI() {
  try {
    const d = await fetch('/api/qci').then(r => r.json());
    processApiResult('qci', 2, d.status === 'ok' ? d.zIndex : null);
  } catch { processApiResult('qci', 2, null); }
  combineAndUpdate();
}

// Local server — polled every 60s
async function fetchSlow() {
  const endpoints = [
    { key: 'local_server', dot: -1, url: '/api/local-rng' },
  ];

  const results = await Promise.allSettled(
    endpoints.map(ep =>
      fetch(ep.url)
        .then(r => r.json())
        .then(d => ({ key: ep.key, dot: ep.dot, z: d.zIndex, ok: d.status === 'ok' }))
    )
  );

  results.forEach((r, i) => {
    const ep = endpoints[i];
    if (r.status === 'fulfilled' && r.value.ok) {
      processApiResult(ep.key, ep.dot, r.value.z);
    } else {
      processApiResult(ep.key, ep.dot, null);
    }
  });
  combineAndUpdate();
}

// ============================================================
// Combine all Z-scores via Stouffer method
// ============================================================
function computeStoufferZ(zArray) {
  if (zArray.length === 0) return null;
  if (zArray.length === 1) return zArray[0];
  const pValues = zArray.map(z => {
    if (typeof normalCDF === 'function') return normalCDF(z);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-x*x);
    return 0.5 * (1 + sign * y);
  });
  return (typeof stoufferZ === 'function') ? stoufferZ(pValues) : zArray[0];
}

// Z envoye au MIDI : uniquement des tirages frais. Une source qui ne change
// qu'une fois par minute (Princeton, serveur) fabriquerait une fausse coherence.
// En session collective : le z combine des telephones et de cet ordinateur.
function midiSourceZ(displayZ) {
  if (isCollective) return jeuSources.telephones ? collectiveFreshZ : hostJeuZ();   // le MIDI n'ajoute qu'une fois une valeur identique
  if (selectedSource !== 'combined') return displayZ;
  return hostJeuZ();
}

// Sources du z joue par l'U1 virtuel (?midi) : en session, les cases « Local »
// (cet ordi), « QCI » et « Telephones » (session collective) decident vraiment
// de ce qui joue. NIST : une valeur par minute, elle fabriquerait
// une fausse coherence, donc affichage seulement. Seules les sources qui
// repondent ont une case.
const MIDI_ON = new URLSearchParams(location.search).has('midi');
const JEU_DEFAUT = { local: true, telephones: true, qci: false, cicada: false };
const jeuSources = (() => {
  try { return { ...JEU_DEFAUT, ...JSON.parse(localStorage.getItem('noosphi_jeu_sources') || '{}') }; }
  catch { return { ...JEU_DEFAUT }; }
})();
let telephonesActifs = 0;   // telephones qui ont envoye un z depuis moins de 3 s
let dernierZJoue = null;    // dernier z parti vers MainStage (courbe « Joue »)
let dernierZTrace = null;   // derniere valeur posee sur la courbe « Combine »
let cicadaZ = null;         // cle quantique de Franck (Cicada), lue par le serveur

// Cicada, la cle quantique Noosfeerique : lue partout (ecoute, seances, U1), une
// fois par seconde. Reservee ou injoignable, elle repond « off » : on ne conclut
// jamais sur un seul appel (au demarrage a froid, le premier repond souvent off
// le temps que le serveur la reveille). Sa pastille ne disparait jamais :
// indisponible, elle reste eteinte et grisee, et se rallume seule (etatCicada).
let cicadaEchecs = 0, cicadaVue = false, cicadaEtatServeur = null;
const cicadaEtat = () => etatCicada({ vue: cicadaVue, echecs: cicadaEchecs, etat: cicadaEtatServeur });
const cicadaPresente = () => cicadaEtat().disponible;
async function fetchCicada() {
  let z = null;
  try {
    const d = await fetch('/api/cicada').then(r => r.json());
    z = d.status === 'ok' && isFinite(d.zIndex) ? d.zIndex : null;
    cicadaEtatServeur = z != null ? 'active' : (d.etat || null);
  } catch { z = null; cicadaEtatServeur = null; }
  cicadaZ = z;
  if (z != null) { cicadaEchecs = 0; cicadaVue = true; } else cicadaEchecs++;
  sourceDots[3]?.classList.toggle('active', z != null);
  majPastilleCicada();
}

// Les sources qu'on ecoute (« la salle ») : plusieurs a la fois, memorisees.
// Elles font le z affiche, la sphere et le son, et la salle des seances.
// Sur la page U1, ce qui JOUE reste decide par ses cases (jeuSources, inchangees).
let salleChoix = (() => {
  try { return { ...SALLE_DEFAUT, ...JSON.parse(localStorage.getItem('noosphi_salle') || '{}') }; }
  catch { return { ...SALLE_DEFAUT }; }
})();
function memoSalle() { try { localStorage.setItem('noosphi_salle', JSON.stringify(salleChoix)); } catch {} }
const cicadaDansSalle = () => (MIDI_ON ? jeuSources.cicada : salleChoix.cicada) && cicadaPresente();

// Disponibilite de chaque source, pour griser sa pastille sans la faire disparaitre
const DEBUT_PAGE = Date.now();
const dernierOk = {};
function etatDe(cle) {
  if (cle === 'cicada') return cicadaEtat();
  if (cle === 'local') return etatSource('local', { dernierOk: localReady ? Date.now() : null, debut: DEBUT_PAGE });
  return etatSource(cle, { dernierOk: dernierOk[cle] ?? null, debut: DEBUT_PAGE });
}

// z de cet ordinateur selon les cases : son generateur, QCI, les deux ou rien
function hostJeuZ() {
  const z = [];
  if (jeuSources.local && localReady) z.push(currentZ);
  if (jeuSources.qci && apiZScores.qci != null && isFinite(apiZScores.qci)) z.push(apiZScores.qci);
  if (jeuSources.cicada && cicadaZ != null) z.push(cicadaZ);
  return z.length ? z.reduce((a, b) => a + b, 0) / Math.sqrt(z.length) : null;
}

function texteZJoue() {
  if (!isCollective && selectedSource !== 'combined') return `z joué : ${selectedSource} (menu des sources)`;
  const parts = [];
  if (isCollective && jeuSources.telephones) parts.push(`${telephonesActifs} téléphone${telephonesActifs > 1 ? 's' : ''}`);
  if (jeuSources.local) parts.push('cet ordi');
  if (jeuSources.qci) parts.push(apiZScores.qci != null ? 'QCI' : 'QCI (muet)');
  if (jeuSources.cicada) parts.push(cicadaZ != null ? 'Noosféérique' : 'Noosféérique (muette)');
  return 'z joué : ' + (parts.length ? parts.join(' + ') : 'aucune source');
}

// Cases de la session : seules les sources qui repondent, et la case
// Telephones en session collective
function majCasesSession() {
  if (!MIDI_ON) return;
  const repond = {
    combined: true, local: localReady, telephones: isCollective && telephonesActifs > 0,
    nist: apiZScores.nist != null, qci: apiZScores.qci != null,
    cicada: true,   // ne disparait jamais : grisee quand la cle est indisponible
  };
  document.querySelectorAll('#session-toggles > .graph-toggle').forEach(label => {
    label.classList.toggle('hidden', !repond[label.dataset.key]);
  });
  const tel = document.querySelector('#session-toggles [data-key="telephones"] span:last-child');
  if (tel) tel.textContent = `Téléphones · ${telephonesActifs}`;
  midiZJoue(texteZJoue());
}

function combineAndUpdate() {
  // Local browser RNG is always source #0
  sourceDots[0]?.classList.toggle('active', localReady);

  // Le z affiche : la combinaison des sources cochees (Stouffer des valeurs
  // fraiches de la seconde, calcule une fois par seconde par combinaison.tick)
  const fullCombinedZ = combinaison.z;

  // Update sidebar z-score displays
  if (localReady) sidebarZLocal.textContent = currentZ.toFixed(2);
  if (apiZScores.nist != null) sidebarZNist.textContent = apiZScores.nist.toFixed(2);
  if (apiZScores.qci != null) sidebarZQci.textContent = apiZScores.qci.toFixed(2);
  if (cicadaZ != null && sidebarZCicada) sidebarZCicada.textContent = cicadaZ.toFixed(2);
  if (fullCombinedZ != null) sidebarZCombined.textContent = fullCombinedZ.toFixed(2);

  // Plusieurs sources a la fois : le z affiche est toujours leur combinaison
  const displayZ = fullCombinedZ;
  if (displayZ == null) return;

  updateVisuals(displayZ);
  updateAudio(displayZ);
  midiZ(midiSourceZ(displayZ));
  majCasesSession();

  // Update live z-score in graph overlay
  graphZValue.textContent = displayZ.toFixed(2);
  graphZValue.style.color = zColor(Math.abs(displayZ));
  graphZSources.innerHTML = SOURCE_META.map(s => {
    const active = s.key === 'local' ? localReady : apiZScores[s.key] != null;
    return `<span class="live-z-source-dot ${active ? 'active' : ''}" style="background:${s.color}" title="${s.label}"></span>`;
  }).join('');

  // Feed session recording. Avec l'U1 virtuel, la courbe principale (« Joue »)
  // et le chiffre du centre sont le z qui part vers MainStage, selon les cases
  const zJoue = MIDI_ON ? midiSourceZ(displayZ) : null;
  dernierZJoue = zJoue != null && isFinite(zJoue) ? zJoue : null;
  // Note a l'instant ou il part, pour ne pas decaler la courbe
  // (une seule fois par valeur : cette fonction tourne plusieurs fois par seconde)
  if (MIDI_ON && dernierZJoue != null && dernierZJoue !== dernierZTrace) {
    dernierZTrace = dernierZJoue;
    pushHistory('combined', Date.now(), dernierZJoue);
  }
  recordSessionTick(dernierZJoue ?? displayZ);
}

// ============================================================
// Header buttons
// ============================================================
const btnMenu = document.getElementById('btn-menu');
const btnSettings = document.getElementById('btn-settings');
const btnHelp = document.getElementById('btn-help');

// Help modal
function createHelpModal() {
  if (document.querySelector('.modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-glass">
      <h2>Que revele cette sphere ?</h2>
      <p>Depuis 1998, le <strong>Global Consciousness Project</strong> de l'Universite
      de Princeton deploie un reseau de generateurs de nombres aleatoires quantiques
      (EGGs) a travers le monde. Ces appareils produisent en permanence des sequences
      qui devraient etre parfaitement aleatoires.</p>
      <p>Or, lors d'evenements qui synchronisent l'attention ou l'emotion de millions
      de personnes — attentats, elections, ceremonies mondiales — les donnees
      de ces capteurs deviennent statistiquement moins aleatoires.
      Comme si une coherence invisible emergait.</p>
      <p>Apres 25 ans de donnees, la probabilite que ce resultat soit du au
      hasard est de l'ordre de <strong>1 sur 1 000 milliards</strong>.</p>
      <p>Cette experience ne pretend rien prouver. Elle vous propose d'observer,
      en temps reel, ce que mesurent ces capteurs — et d'interroger ce que
      cela pourrait signifier.</p>
      <h3>Le z-score</h3>
      <p>Le z-score mesure l'ecart entre ce qu'on observe et ce que le hasard
      pur devrait produire. Plus il est eleve (en valeur absolue), plus
      l'anomalie est marquee :</p>
      <ul>
        <li><strong>|z| < 1</strong> — aleatoire normal</li>
        <li><strong>|z| > 1.5</strong> — coherence notable</li>
        <li><strong>|z| > 2</strong> — statistiquement significatif</li>
        <li><strong>|z| > 3</strong> — anomalie rare</li>
      </ul>
      <h3>Les sources</h3>
      <ul>
        <li>Le generateur de votre propre appareil</li>
        <li>Noosféérique : la clé quantique Cicada</li>
        <li>QCI uQRNG, photonique quantique (USA), chaque seconde</li>
        <li>NIST Beacon 2.0, une pulsation par minute (USA)</li>
        <li>Princeton (EGGs mondiaux) : collecte arrêtée le 03/04/2026</li>
      </ul>
      <h3>En haut</h3>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:rgba(255,255,255,0.5)">
        <div style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:rgba(255,255,255,0.5);stroke-width:1.5;fill:none;flex-shrink:0"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          <span>Choix des sources (plusieurs à la fois)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:rgba(255,255,255,0.5);stroke-width:1.5;fill:none;flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Gamme musicale (432 Hz)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:rgba(255,255,255,0.5);stroke-width:1.5;fill:none;flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>Cette page (aide et credits)</span>
        </div>
      </div>
      <h3>En bas</h3>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:rgba(255,255,255,0.5)">
        <div style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:rgba(255,255,255,0.5);stroke-width:1.5;fill:none;flex-shrink:0"><path d="M3 3h18v18H3z" fill="none"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
          <span>Sessions enregistrees</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:rgba(255,255,255,0.5);stroke-width:1.5;fill:none;flex-shrink:0"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="rgba(255,255,255,0.5)"/></svg>
          <span>Enregistrer une session (solo ou collective)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:rgba(255,255,255,0.5);stroke-width:1.5;fill:none;flex-shrink:0"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span>Historique des z-scores (24h)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:rgba(255,255,255,0.5);stroke-width:1.5;fill:none;flex-shrink:0"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          <span>Son on/off + volume</span>
        </div>
      </div>
      <h3>Pendant une session</h3>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:rgba(255,255,255,0.5)">
        <div style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:rgba(255,255,255,0.5);stroke-width:1.5;fill:none;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Retour sphere (l'enregistrement continue)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:14px;height:14px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0"><div style="width:5px;height:5px;border-radius:50%;background:#0B0E14"></div></div>
          <span>Session en cours — cliquez pour revenir</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:14px;height:14px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;gap:1px"><div style="width:2px;height:7px;background:#0B0E14;border-radius:1px"></div><div style="width:2px;height:7px;background:#0B0E14;border-radius:1px"></div></div>
          <span>Session en pause</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="display:flex;align-items:center;gap:3px;flex-shrink:0"><span style="width:5px;height:5px;border-radius:50%;background:#FF4444;display:inline-block"></span><span style="font-size:9px;color:rgba(255,255,255,0.5);font-variant-numeric:tabular-nums">03:42</span></div>
          <span>Temps ecoule (cliquez pour revenir)</span>
        </div>
      </div>
      <p class="help-hint">Cliquez sur la sphere pour activer le son</p>
      <p style="margin-top:16px"><a href="credits.html" target="_blank" style="color:#ffffff;font-size:11px;text-decoration:none;letter-spacing:0.05em;border-bottom:1px solid rgba(255,255,255,0.3)">Credits &amp; remerciements</a></p>
      <button class="modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></button>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

if (btnHelp) {
  btnHelp.addEventListener('click', createHelpModal);
}

// ============================================================
// Settings panel — scale selector
// ============================================================
const settingsPanel = document.getElementById('settings-panel');
const settingsBackdrop = document.getElementById('settings-backdrop');
const settingsClose = document.getElementById('settings-close');

function openSettings() {
  settingsPanel.classList.add('open');
  settingsBackdrop.classList.add('open');
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsBackdrop.classList.remove('open');
}

if (btnSettings) {
  btnSettings.addEventListener('click', openSettings);
}
if (settingsClose) {
  settingsClose.addEventListener('click', closeSettings);
}
if (settingsBackdrop) {
  settingsBackdrop.addEventListener('click', closeSettings);
}

// Scale radio buttons
const scaleOptions = document.querySelectorAll('.scale-option');
scaleOptions.forEach(label => {
  label.addEventListener('click', () => {
    scaleOptions.forEach(l => l.classList.remove('active'));
    label.classList.add('active');
    label.querySelector('input').checked = true;
    currentScaleFreqs = buildScaleFreqs(label.dataset.scale);
    localStorage.setItem('noosphi_scale', label.dataset.scale);
  });
});

// Restore saved scale on load — validate key before applying
const savedScale = localStorage.getItem('noosphi_scale');
if (savedScale && savedScale in SCALES && savedScale !== 'free') {
  currentScaleFreqs = buildScaleFreqs(savedScale);
  scaleOptions.forEach(l => {
    const isActive = l.dataset.scale === savedScale;
    l.classList.toggle('active', isActive);
    l.querySelector('input').checked = isActive;
  });
} else if (savedScale && !(savedScale in SCALES)) {
  // Stale or corrupted key — remove it
  localStorage.removeItem('noosphi_scale');
}

// ============================================================
// Sidebar — source selector
// ============================================================
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const sidebarClose = document.getElementById('sidebar-close');
let selectedSource = 'combined';

function openSidebar() {
  sidebar.classList.add('open');
  sidebarBackdrop.classList.add('open');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('open');
}

if (btnMenu) {
  btnMenu.addEventListener('click', openSidebar);
}
if (sidebarClose) {
  sidebarClose.addEventListener('click', closeSidebar);
}
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', closeSidebar);
}

// Le tableau de bord garde les parametres d'URL (?midi=1…), pour que sa croix y ramene
document.querySelector('.sidebar-link')?.setAttribute('href', '/' + location.search);

// Les sources se cochent ensemble : chaque ligne se coche et se decoche seule ;
// « Combinaison » n'est pas un choix, c'est le resultat des sources cochees
const sourceOptions = document.querySelectorAll('.source-option[data-source]');
const sidebarZCicada = document.getElementById('sidebar-z-cicada');
const combinaison = createCombinaison();

// Cocher ou decocher une source de l'ecoute (barre des sources, ou ligne de la
// seance hors page U1). Une source du temoin quitte le temoin.
function basculerSalle(cle) {
  const e = basculer({ salle: salleChoix, temoin: TEMOIN.includes(cle) ? temoinChoix : {} }, 'salle', cle);
  salleChoix = e.salle;
  if (TEMOIN.includes(cle)) { temoinChoix = { ...temoinChoix, ...e.temoin }; memoTemoin(); }
  memoSalle();
  majLignes();
}

sourceOptions.forEach(label => {
  label.addEventListener('click', e => {
    e.preventDefault();
    const cle = label.dataset.source;
    if (cle === 'combined') return;
    basculerSalle(cle);
  });
});

// Une seconde : la combinaison des sources cochees qui repondent
setInterval(() => {
  const valeurs = { local: localReady ? currentZ : null, cicada: cicadaZ, nist: apiZScores.nist, qci: apiZScores.qci };
  combinaison.tick(Date.now(), valeurs, SALLE_CLES.filter(k => salleChoix[k] && etatDe(k).disponible));
  combineAndUpdate();
  majLignes();
}, 1000);

// ============================================================
// Z-Score History (for graph overlay)
// ============================================================
const HISTORY_MAX = 86400; // 24h at 1 point/sec
const COLORS = {
  combined: '#CC44FF',
  local: '#00E5FF',
  nist: '#00CC66',
  qci: '#C9A24D',
  cicada: '#FF5FA2',
};
const SOURCE_LABELS = { combined: 'Combine', local: 'Local', nist: 'NIST', qci: 'QCI', cicada: 'Noosféérique' };
// Used for graph-overlay source dots (excludes 'combined' which has no API slot)
const SOURCE_META = [
  { key: 'local', color: '#00E5FF', label: 'Local' },
  { key: 'cicada', color: '#FF5FA2', label: 'Noosféérique' },
  { key: 'nist',  color: '#00CC66', label: 'NIST' },
  { key: 'qci',   color: '#C9A24D', label: 'QCI' },
];
const zHistory = {
  combined: [],
  local: [],
  nist: [],
  qci: [],
  cicada: [],
};

function recordHistory() {
  const now = Date.now();
  // Combined : la combinaison des sources cochees (celle qui fait la sphere).
  // Avec l'U1 virtuel, la courbe principale est le z joue, pas ce melange
  if (!MIDI_ON && combinaison.z != null) pushHistory('combined', now, combinaison.z);
  // Individual
  if (localReady) pushHistory('local', now, currentZ);
  if (apiZScores.nist != null) pushHistory('nist', now, apiZScores.nist);
  if (apiZScores.qci != null) pushHistory('qci', now, apiZScores.qci);
  if (cicadaZ != null) pushHistory('cicada', now, cicadaZ);
}

function pushHistory(key, t, z) {
  zHistory[key].push({ t, z });
  // Purge points older than 24h
  const cutoff = t - 86400000;
  while (zHistory[key].length > 0 && zHistory[key][0].t < cutoff) {
    zHistory[key].shift();
  }
}

// ============================================================
// Coherence highlights
// Slot 1: pure peak |z| (highest single z-score ever seen)
// Slots 2-5: scored by duration × average |z| (sustained coherence)
// ============================================================
function findHighlights(data, threshold = 1.5, minDuration = 5) {
  if (data.length < 2) return [];

  // 1. Find absolute peak z (single point)
  let peakIdx = 0;
  for (let i = 1; i < data.length; i++) {
    if (Math.abs(data[i].z) > Math.abs(data[peakIdx].z)) peakIdx = i;
  }
  const peak = {
    startTime: data[peakIdx].t,
    endTime: data[peakIdx].t,
    duration: 1,
    maxZ: data[peakIdx].z,
    avgZ: data[peakIdx].z,
    score: Math.abs(data[peakIdx].z),
    isPeak: true,
  };

  // 2. Find sustained coherence periods
  const periods = [];
  let start = null;
  let sumAbsZ = 0;
  let maxZ = 0;

  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i].z) >= threshold) {
      if (start == null) { start = i; sumAbsZ = 0; maxZ = 0; }
      sumAbsZ += Math.abs(data[i].z);
      if (Math.abs(data[i].z) > Math.abs(maxZ)) maxZ = data[i].z;
    } else if (start != null) {
      const dur = i - start;
      if (dur >= minDuration) {
        const avgZ = sumAbsZ / dur;
        periods.push({
          startTime: data[start].t,
          endTime: data[i - 1].t,
          duration: dur,
          maxZ,
          avgZ,
          score: dur * avgZ, // duration × average |z|
          isPeak: false,
        });
      }
      start = null;
    }
  }
  // Handle ongoing period
  if (start != null) {
    const dur = data.length - start;
    if (dur >= minDuration) {
      const avgZ = sumAbsZ / dur;
      periods.push({
        startTime: data[start].t,
        endTime: data[data.length - 1].t,
        duration: dur,
        maxZ,
        avgZ,
        score: dur * avgZ,
        isPeak: false,
      });
    }
  }

  // Sort sustained periods by score (duration × avgZ) descending
  periods.sort((a, b) => b.score - a.score);

  // Combine: peak first, then top 4 sustained
  return [peak, ...periods.slice(0, 4)];
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
}

// Returns a CSS color string that reflects z-score intensity.
// Used consistently across the sphere indicator, graph overlay, and session recording.
function zColor(absZ) {
  if (absZ > 2)   return '#C9A24D';
  if (absZ > 1.5) return 'rgba(255,255,255,0.9)';
  return 'rgba(255,255,255,0.6)';
}

// Returns a zero-padded MM:SS string for a duration in seconds.
function formatTimer(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ============================================================
// Shared chart configuration
// All three charts (history, session, detail) share the same base options.
// labelFn receives a Chart.js tooltip item and returns the label string.
// ============================================================
function makeChartOptions(labelFn) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'nearest', intersect: false },
    scales: {
      x: {
        type: 'linear',
        ticks: { callback: v => formatTime(v), color: 'rgba(255,255,255,0.3)', maxTicksLimit: 6, font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.05)' },
        suggestedMin: -3,
        suggestedMax: 3,
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(11,14,20,0.9)',
        titleColor: 'rgba(255,255,255,0.7)',
        bodyColor: 'rgba(255,255,255,0.9)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        callbacks: {
          title: items => items[0] ? formatTime(items[0].parsed.x) : '',
          label: labelFn,
        },
      },
    },
  };
}

// ============================================================
// Graph overlay
// ============================================================
const graphOverlay = document.getElementById('graph-overlay');
const btnGraph = document.getElementById('btn-graph');
const graphClose = document.getElementById('graph-close');
const highlightsList = document.getElementById('highlights-list');
let historyChart = null;
const graphVisibility = { combined: true, local: true, cicada: true, nist: true, qci: true };

function openGraph() {
  graphOverlay.classList.add('open');
  updateGraph();
}

function closeGraph() {
  graphOverlay.classList.remove('open');
}

if (btnGraph) {
  btnGraph.addEventListener('click', openGraph);
}
if (graphClose) {
  graphClose.addEventListener('click', closeGraph);
}

// Clear history
document.getElementById('btn-clear-history').addEventListener('click', () => {
  Object.keys(zHistory).forEach(key => { zHistory[key] = []; });
  highlightsList.innerHTML = '<div class="highlight-empty">Historique efface</div>';
  if (historyChart) {
    historyChart.data.datasets = [];
    historyChart.update('none');
  }
});

// Toggle sources drawer
const btnToggleSources = document.getElementById('btn-toggle-sources');
const graphTogglesPanel = document.getElementById('graph-toggles');
if (btnToggleSources && graphTogglesPanel) {
  btnToggleSources.addEventListener('click', () => {
    graphTogglesPanel.classList.toggle('collapsed');
    btnToggleSources.classList.toggle('expanded');
  });
}

// Toggle source visibility in graph (only graph-overlay toggles, not session toggles)
document.querySelectorAll('#graph-toggles .graph-toggle').forEach(label => {
  label.addEventListener('click', (e) => {
    e.preventDefault();
    const key = label.dataset.key;
    const nowActive = !label.classList.contains('active');
    label.classList.toggle('active', nowActive);
    label.querySelector('input').checked = nowActive;
    graphVisibility[key] = nowActive;
    updateGraph();
  });
});

function updateGraph() {
  if (!graphOverlay.classList.contains('open')) return;

  // Update highlights from all visible sources
  const allHighlights = [];
  Object.keys(COLORS).forEach(key => {
    if (!graphVisibility[key] || zHistory[key].length < 2) return;
    findHighlights(zHistory[key]).forEach(h => {
      allHighlights.push({ ...h, source: key, label: SOURCE_LABELS[key] });
    });
  });
  allHighlights.sort((a, b) => Math.abs(b.maxZ) - Math.abs(a.maxZ));
  const topHighlights = allHighlights.slice(0, 5);

  if (topHighlights.length > 0) {
    highlightsList.innerHTML = topHighlights.map(h => {
      const timeStr = h.isPeak
        ? formatTime(h.startTime)
        : `${formatTime(h.startTime)} — ${formatTime(h.endTime)}`;
      const durationStr = h.isPeak
        ? 'pic instantane'
        : formatDuration(h.duration);
      return `
        <div class="highlight-card ${h.isPeak ? 'highlight-peak' : ''}">
          <span class="highlight-z">z = ${h.maxZ.toFixed(2)}</span>
          <span class="highlight-time">${timeStr}</span>
          <span class="highlight-duration">${durationStr}</span>
          <span class="highlight-source" style="color:${COLORS[h.source]}">${h.label}</span>
        </div>
      `;
    }).join('');
  } else {
    highlightsList.innerHTML = '<div class="highlight-empty">Pas encore de coherence marquante</div>';
  }

  // Build/update chart
  const datasets = Object.keys(COLORS)
    .filter(key => graphVisibility[key] && zHistory[key].length > 0)
    .map(key => ({
      label: key,
      data: zHistory[key].map(p => ({ x: p.t, y: p.z })),
      borderColor: COLORS[key],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: false,
    }));

  if (historyChart) {
    historyChart.data.datasets = datasets;
    historyChart.update('none');
    return;
  }

  const ctx = document.getElementById('chart-history');
  if (!ctx || typeof Chart === 'undefined') return;

  historyChart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: makeChartOptions(item => `${item.dataset.label}: ${item.parsed.y.toFixed(3)}`),
  });
}

// Refresh graph every 5 seconds while open
setInterval(() => { if (graphOverlay.classList.contains('open')) updateGraph(); }, 5000);

// ============================================================
// Session Recording System (localStorage)
// ============================================================
const sessionOverlay = document.getElementById('session-overlay');
const sessionSetup = document.getElementById('session-setup');
const sessionRecording = document.getElementById('session-recording');
const sessionNameInput = document.getElementById('session-name');
const btnSession = document.getElementById('btn-session');
const btnStartSession = document.getElementById('btn-start-session');
const btnStopSession = document.getElementById('btn-stop-session');
const sessionClose = document.getElementById('session-close');
const sessionRecName = document.getElementById('session-rec-name');
const sessionRecTimer = document.getElementById('session-rec-timer');
const sessionZValue = document.getElementById('session-z-value');
const sessionZMax = document.getElementById('session-z-max');
const sessionsListOverlay = document.getElementById('sessions-list-overlay');
const sessionsList = document.getElementById('sessions-list');
const sessionsListClose = document.getElementById('sessions-list-close');
const sessionDetailOverlay = document.getElementById('session-detail-overlay');
const sessionDetailClose = document.getElementById('session-detail-close');
const sessionDetailContent = document.getElementById('session-detail-content');
const detailTitle = document.getElementById('detail-title');
const btnCreateCollective = document.getElementById('btn-create-collective');
const btnJoinCollective = document.getElementById('btn-join-collective');
const collectiveCodeInput = document.getElementById('collective-code');
const collectiveStatus = document.getElementById('collective-status');
const sessionParticipants = document.getElementById('session-participants');
const btnSessionAudio = document.getElementById('btn-session-audio');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnShareCode = document.getElementById('btn-share-code');

let sessionActive = false;
let sessionPaused = false;
let sessionPausedTotal = 0;
let sessionPauseStart = 0;
let isCollective = false;
let collectiveZ = null;
let collectiveFreshZ = null;   // z collectif ou chaque tirage compte une fois (pour le MIDI)
let zTelephonesSeuls = null;   // le meme, sans cet ordi : les telephones pour eux seuls (rapport)
let sessionStartTime = null;
let sessionTimerInterval = null;
let sessionData = [];   // { t, z, sources }
let seance = null;      // z de la seance (la maree) et son temoin, une valeur par seconde
const sessionRegleInput = document.getElementById('session-regle');

// Une nouvelle seance commence : z de la seance a zero, affichage remis a neuf
let sessionRegle = '';
function debutSeance() {
  // Le temoin est branche d'office a chaque enregistrement : ses sources quittent
  // la salle (et l'U1). On peut ensuite l'eteindre source par source.
  temoinChoix = Object.fromEntries(TEMOIN.map(k => [k, true]));
  memoTemoin();
  appliquerTemoinSurSalle();
  majLignes();
  document.body.classList.add('seance-en-cours');
  seance = createSeance();
  sessionRegle = sessionRegleInput ? sessionRegleInput.value.trim() : '';
  sessionData = [];
  sessionZMax.textContent = "z de l'instant : --";
}
let sessionChart = null;
let currentCollectiveCode = null;
const btnPauseSession = document.getElementById("btn-pause-session");
const pauseLabel = document.getElementById("pause-label");
const sessionVisibility = { combined: true, local: true, nist: true, qci: true, cicada: true };

// ---- La ligne des sources : la salle a gauche, le temoin a droite ----
// Une source n'est jamais des deux cotes (basculer). Le choix du temoin est
// memorise ; au chargement, une source deja dans la salle (case QCI de l'U1)
// garde sa place : on ne change jamais ce qui joue sans qu'on le demande.
const pastilleSalle = key => document.querySelector(`#session-toggles > .graph-toggle[data-key="${key}"]`);
const temoinPastilles = document.getElementById('temoin-pastilles');
let temoinChoix = choixInitial({
  memo: (() => { try { return JSON.parse(localStorage.getItem('noosphi_temoin') || 'null'); } catch { return null; } })(),
  salle: MIDI_ON ? { qci: jeuSources.qci } : salleChoix,
});
const temoinActif = () => TEMOIN.filter(k => temoinChoix[k]);
function memoTemoin() { try { localStorage.setItem('noosphi_temoin', JSON.stringify(temoinChoix)); } catch {} }

// Une pastille de gauche est « dans la salle » : sur la page U1, ce que ses cases
// font jouer ; ailleurs, la pastille allumee
function salleCoche(key) {
  if (MIDI_ON) return key in jeuSources ? !!jeuSources[key] : false;
  return !!salleChoix[key];
}

function allumerPastille(label, on) {
  if (!label) return;
  label.classList.toggle('active', on);
  const input = label.querySelector('input');
  if (input) input.checked = on;
}

// Les pastilles du temoin sont construites une fois, puis seulement mises a jour :
// les reconstruire chaque seconde ferait perdre le clic et l'info-bulle au survol
// (innerHTML sans risque : uniquement des constantes du code, aucune saisie)
function renderTemoin() {
  if (!temoinPastilles) return;
  if (!temoinPastilles.children.length) {
    temoinPastilles.style.setProperty('--temoin', TEMOIN_COULEUR);
    temoinPastilles.innerHTML = TEMOIN.map(k => `
      <label class="graph-toggle temoin" data-temoin="${k}">
        <input type="checkbox"><span class="toggle-swatch"></span><span>${{ nist: 'NIST', qci: 'QCI' }[k]}</span>
      </label>`).join('');
  }
  for (const label of temoinPastilles.querySelectorAll('[data-temoin]')) {
    const k = label.dataset.temoin, etat = etatDe(k);
    allumerPastille(label, !!temoinChoix[k] && etat.disponible);
    label.classList.toggle('indisponible', !etat.disponible);
    const titre = etat.disponible ? titreTemoin(k) : etat.titre;
    if (label.title !== titre) label.title = titre;
  }
}

// Toutes les lignes de sources d'un coup : la barre des sources, la ligne de la
// seance (salle a gauche, temoin a droite). Une source indisponible reste a sa
// place, eteinte et grisee, avec la raison au survol.
function majLignes() {
  sourceOptions.forEach(label => {
    const cle = label.dataset.source;
    if (cle === 'combined') return;
    const etat = etatDe(cle), on = !!salleChoix[cle];
    label.classList.toggle('active', on && etat.disponible);
    label.classList.toggle('indisponible', !etat.disponible);
    label.title = etat.titre;
    const input = label.querySelector('input');
    if (input) input.checked = on;
  });
  if (!MIDI_ON) {
    for (const cle of SALLE_CLES) {
      const label = pastilleSalle(cle);
      if (!label) continue;
      const etat = etatDe(cle);
      label.classList.remove('hidden');
      allumerPastille(label, !!salleChoix[cle] && etat.disponible);
      label.classList.toggle('indisponible', !etat.disponible);
      label.title = etat.titre;
    }
  } else {
    majPastilleCicada();
  }
  renderTemoin();
}

// Exclusion : une source cochee dans le temoin s'eteint dans la salle
function appliquerTemoinSurSalle() {
  for (const k of TEMOIN) {
    if (!temoinChoix[k]) continue;
    allumerPastille(pastilleSalle(k), false);
    if (!MIDI_ON && salleChoix[k]) { salleChoix = { ...salleChoix, [k]: false }; memoSalle(); }
    if (MIDI_ON && k in jeuSources && jeuSources[k]) {
      jeuSources[k] = false;
      try { localStorage.setItem('noosphi_jeu_sources', JSON.stringify(jeuSources)); } catch {}
    }
    sessionVisibility[k] = true;   // sa courbe reste visible : elle est dans le temoin
  }
}

if (temoinPastilles) {
  temoinPastilles.addEventListener('click', e => {
    const label = e.target.closest('[data-temoin]');
    if (!label) return;
    e.preventDefault();
    const k = label.dataset.temoin;
    const salle = Object.fromEntries(TEMOIN.map(c => [c, salleCoche(c)]));
    temoinChoix = basculer({ salle, temoin: temoinChoix }, 'temoin', k).temoin;
    memoTemoin();
    appliquerTemoinSurSalle();
    if (!temoinChoix[k]) sessionVisibility[k] = salleCoche(k);
    majLignes();
    if (MIDI_ON) majCasesSession();
    updateSessionChart();
  });
}

// La pastille Noosfeerique : allumee par defaut, grisee quand la cle est
// indisponible (sans disparaitre), avec son etat au survol
function majPastilleCicada() {
  const label = pastilleSalle('cicada');
  if (!label) return;
  const etat = cicadaEtat();
  const voulue = MIDI_ON ? !!jeuSources.cicada : !!salleChoix.cicada;
  label.classList.remove('hidden');
  label.classList.toggle('indisponible', !etat.disponible);
  label.title = etat.titre;
  allumerPastille(label, voulue && etat.disponible);
}

// Ce qui compose « la salle » d'une seance, une fois par seconde. En collective,
// le z des telephones contient deja ce que cet ordinateur envoie (sur la page U1 :
// ses cases) : on n'y ajoute que ce qu'il n'envoie pas, pour ne rien compter deux fois.
function salleComposantes() {
  const c = {};
  const envoyeParCetOrdi = k => isCollective && MIDI_ON && !!jeuSources[k];
  if (isCollective) c.telephones = collectiveFreshZ;
  else if (MIDI_ON || salleChoix.local) c.local = localReady ? currentZ : null;
  if (cicadaDansSalle() && !envoyeParCetOrdi('cicada')) c.cicada = cicadaZ;
  for (const k of TEMOIN) {
    if (temoinChoix[k] || !salleCoche(k) || envoyeParCetOrdi(k)) continue;
    c[k] = apiZScores[k];
  }
  return c;
}

// Sessions history from main setup screen
document.getElementById('btn-session-history-main').addEventListener('click', () => {
  renderSessionsList();
  sessionsListOverlay.classList.add('open');
});

// Flash a button into its "copied" state for 1.5s
function flashCopied(btn) {
  btn.classList.add('copied');
  setTimeout(() => btn.classList.remove('copied'), 1500);
}

// Session audio: btn-session-audio has its own .audio-btn inside,
// handled by the global .audio-btn click handler above.
// Click on sphere zone in session also toggles audio.
document.querySelector('.session-center-z')?.addEventListener('click', () => {
  toggleAudio();
  if (btnSessionAudio) btnSessionAudio.classList.toggle('active', audioActive);
});

// Session audio button direct click (for the outer div)
if (btnSessionAudio) {
  btnSessionAudio.addEventListener('click', (e) => {
    // Only toggle if click is not on the slider
    if (e.target.closest('.audio-slider')) return;
    if (e.target.closest('.audio-btn')) return; // handled by global .audio-btn handler
    toggleAudio();
    btnSessionAudio.classList.toggle('active', audioActive);
  });
}


// Pause/resume session
if (btnPauseSession) {
  btnPauseSession.addEventListener('click', () => {
    if (!sessionActive) return;
    sessionPaused = !sessionPaused;
    if (sessionPaused) {
      sessionPauseStart = Date.now();
      pauseLabel.textContent = 'Reprendre';
      btnPauseSession.classList.add('paused');
    } else {
      sessionPausedTotal += Date.now() - sessionPauseStart;
      pauseLabel.textContent = 'Pause';
      btnPauseSession.classList.remove('paused');
    }
    updateSessionBtnState();
  });
}

// Copy collective code to clipboard
if (btnCopyCode) {
  btnCopyCode.addEventListener('click', () => {
    if (!currentCollectiveCode) return;
    navigator.clipboard.writeText(currentCollectiveCode).then(() => flashCopied(btnCopyCode));
  });
}

// Share collective code via Web Share API, with clipboard fallback
if (btnShareCode) {
  btnShareCode.addEventListener('click', () => {
    if (!currentCollectiveCode) return;
    const text = `Rejoins ma session Noosfeerique !\nCode : ${currentCollectiveCode}`;
    if (navigator.share) {
      navigator.share({ title: 'Noosfeerique — Session collective', text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(`${text}\n${window.location.href}`).then(() => flashCopied(btnShareCode));
    }
  });
}

// Open/close session overlay
if (btnSession) {
  btnSession.addEventListener('click', () => {
    sessionOverlay.classList.add('open');
    if (recIndicator) recIndicator.classList.add('hidden');
    if (btnSessionAudio) {
      btnSessionAudio.classList.toggle('active', audioActive);
    }
    if (sessionActive) {
      // Session in progress — show recording view
      sessionSetup.classList.add('hidden');
      sessionRecording.classList.remove('hidden');
    } else {
      sessionSetup.classList.remove('hidden');
      sessionRecording.classList.add('hidden');
    }
  });
}


const recIndicator = document.getElementById('rec-indicator');
const recIndicatorTimer = document.getElementById('rec-indicator-timer');

// Close button: if recording → minimize to sphere. If not → close overlay.
if (sessionClose) {
  sessionClose.addEventListener('click', () => {
    if (sessionActive) {
      // Minimize: return to sphere, recording continues
      sessionOverlay.classList.remove('open');
      if (recIndicator) recIndicator.classList.remove('hidden');
    } else {
      sessionOverlay.classList.remove('open');
    }
  });
}

// Click on rec indicator reopens the session overlay
if (recIndicator) {
  recIndicator.addEventListener('click', () => {
    sessionOverlay.classList.add('open');
    recIndicator.classList.add('hidden');
  });
}

// Update rec indicator timer (synced with session timer)
setInterval(() => {
  if (sessionActive && !sessionOverlay.classList.contains('open') && recIndicatorTimer) {
    const elapsed = Math.floor((Date.now() - sessionStartTime - sessionPausedTotal - (sessionPaused ? Date.now() - sessionPauseStart : 0)) / 1000);
    recIndicatorTimer.textContent = formatTimer(Math.max(0, elapsed));
  }
}, 1000);

// Wake Lock — prevent screen from sleeping during sessions
let wakeLock = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* user denied or not supported */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

// Re-acquire wake lock when page becomes visible again (mobile tab switch)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sessionActive) requestWakeLock();
});

// Update session button icon based on state
const sessionBtnIcon = document.getElementById('session-btn-icon');
const btnSessionEl = document.getElementById('btn-session');

function updateSessionBtnState() {
  if (!sessionBtnIcon || !btnSessionEl) return;
  if (sessionActive && sessionPaused) {
    // Paused: white bg, black pause bars
    btnSessionEl.classList.add('recording');
    sessionBtnIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><rect x="8" y="7" width="3" height="10" fill="currentColor" stroke="none"/><rect x="13" y="7" width="3" height="10" fill="currentColor" stroke="none"/>';
  } else if (sessionActive) {
    // Recording: white bg, black dot
    btnSessionEl.classList.add('recording');
    sessionBtnIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>';
  } else {
    // Idle: normal style
    btnSessionEl.classList.remove('recording');
    sessionBtnIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/>';
  }
}

// Start recording
if (btnStartSession) {
  btnStartSession.addEventListener('click', () => {
  const name = sessionNameInput.value.trim() || 'Session sans nom';
  sessionRecName.textContent = name;
  sessionSetup.classList.add('hidden');
  sessionRecording.classList.remove('hidden');

  sessionActive = true;
  sessionStartTime = Date.now();
  debutSeance();
  requestWakeLock();
  updateSessionBtnState();

  // Timer
  sessionTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStartTime - sessionPausedTotal - (sessionPaused ? Date.now() - sessionPauseStart : 0)) / 1000);
    sessionRecTimer.textContent = formatTimer(elapsed);
  }, 1000);

  // Init chart
  if (sessionChart) { sessionChart.destroy(); sessionChart = null; }
  });
}

// Stop recording and save
if (btnStopSession) {
  btnStopSession.addEventListener('click', () => {
  sessionActive = false;
  document.body.classList.remove('seance-en-cours');
  clearInterval(sessionTimerInterval);
  releaseWakeLock();
  if (recIndicator) recIndicator.classList.add('hidden');
  updateSessionBtnState();

  const r = seance ? seance.resume() : { zSalle: null, nSalle: 0, zTemoin: null, nTemoin: 0 };
  const session = {
    id: Date.now().toString(36),
    name: sessionRecName.textContent,
    regle: sessionRegle,
    startTime: sessionStartTime,
    endTime: Date.now(),
    duration: Math.floor((Date.now() - sessionStartTime) / 1000),
    zSalle: r.zSalle, nSalle: r.nSalle,
    zTemoin: r.zTemoin, nTemoin: r.nTemoin,
    temoinChoisi: temoinActif(), parSource: r.parSource || {},
    secondes: seance ? seance.lignes : [],   // une ligne par seconde, pour l'export
    version: APP_VERSION,
    data: sessionData,
    comment: '',
  };

  // Save to localStorage. Une longue seance pese lourd : si la place manque,
  // on retire les plus anciennes, puis la courbe detaillee, jamais les secondes
  const saved = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
  saved.unshift(session);
  // Keep max 50 sessions
  if (saved.length > 50) saved.pop();
  let enregistree = false;
  while (!enregistree) {
    try { localStorage.setItem('noosphi_sessions', JSON.stringify(saved)); enregistree = true; }
    catch {
      if (saved.length > 1) saved.pop();
      else if (session.data.length) session.data = [];
      else break;
    }
  }

  sessionOverlay.classList.remove('open');
  sessionSetup.classList.remove('hidden');
  sessionRecording.classList.add('hidden');
  sessionNameInput.value = '';
  if (sessionRegleInput) sessionRegleInput.value = '';
  if (sessionChart) { sessionChart.destroy(); sessionChart = null; }
  seance = null;
  // A l'arret : le detail de la seance, avec la salle et le temoin
  majZTemoin();
  // Version concert : le rapport part tout seul dans les Telechargements du Mac,
  // ce qui le met aussi a l'abri d'une memoire du navigateur effacee
  if (MIDI_ON) telechargerRapport(session);
  if (enregistree) openSessionDetail(session.id);
  else { loadingText.textContent = texteResume(r); loadingText.classList.remove('hidden'); setTimeout(() => loadingText.classList.add('hidden'), 8000); }
  });
}

// Les chiffres de la seance (z de la seance, temoin) se cachent ou se montrent :
// caches par defaut, pour qu'on regarde la sphere et non le compteur.
const btnChiffres = document.getElementById('btn-chiffres');
let chiffresVisibles = (() => { try { return localStorage.getItem('noosphi_chiffres') === '1'; } catch { return false; } })();
function appliquerChiffres() {
  document.body.classList.toggle('chiffres-caches', !chiffresVisibles);
  if (btnChiffres) {
    btnChiffres.classList.toggle('active', chiffresVisibles);
    btnChiffres.setAttribute('aria-label', chiffresVisibles ? 'Cacher les chiffres' : 'Montrer les chiffres');
    btnChiffres.title = btnChiffres.getAttribute('aria-label');
  }
}
if (btnChiffres) btnChiffres.addEventListener('click', () => {
  chiffresVisibles = !chiffresVisibles;
  try { localStorage.setItem('noosphi_chiffres', chiffresVisibles ? '1' : '0'); } catch {}
  appliquerChiffres();
});
appliquerChiffres();

// Le seul chiffre du temoin : son z de seance, petit, dans sa couleur, sous le
// z de la salle (au centre de la seance et sous la sphere) ; rien hors enregistrement
function majZTemoin() {
  const r = sessionActive && seance ? seance.resume() : null;
  const texte = r && r.zTemoin != null ? `témoin : ${r.zTemoin.toFixed(2)}` : (r ? 'témoin : --' : '');
  for (const el of [sessionZTemoin, zDisplayTemoin]) {
    if (!el) continue;
    el.textContent = texte;
    el.style.color = TEMOIN_COULEUR;
    el.classList.toggle('hidden', !texte);
  }
}

// Record data point during session (called from combineAndUpdate)
function recordSessionTick(displayZ) {
  if (!sessionActive || sessionPaused) return;

  const point = {
    t: Date.now(),
    z: displayZ,
    local: localReady ? currentZ : null,
    nist: apiZScores.nist,
    qci: apiZScores.qci,
    cicada: cicadaZ,
  };
  sessionData.push(point);

  // Au centre : le z de la seance, en direct ; dessous, discret, le z de l'instant
  const zSeance = seance ? seance.resume().zSalle : null;
  if (zSeance == null) {
    sessionZValue.textContent = '--';
    sessionZValue.style.color = '';
  } else {
    sessionZValue.textContent = zSeance.toFixed(2);
    sessionZValue.style.color = zColor(Math.abs(zSeance));
  }
  sessionZMax.textContent = `z de l'instant : ${displayZ.toFixed(2)}`;
  majZTemoin();

  updateSessionChart();
}

// La maree : une valeur par seconde, sur sa propre horloge (les autres mises a
// jour tournent a des rythmes variables). La salle = ce qui est ici (telephones
// de la seance collective, ou en solo cet appareil et la cle Noosfeerique) ;
// le temoin = les sources lointaines, chaque valeur fraiche une fois.
// Une valeur qui n'a pas change depuis la seconde d'avant n'est pas recomptee.
setInterval(() => {
  if (!sessionActive || sessionPaused || !seance) return;
  seance.tick(Date.now(), {
    salle: salleComposantes(),
    nTelephones: isCollective ? telephonesActifs : null,
    mesures: { nist: apiZScores.nist, qci: apiZScores.qci },
    temoinActif: temoinActif(),
    // Pour le rapport : chaque generateur pour lui seul, qu'il joue ou non
    brut: {
      telephones: isCollective ? zTelephonesSeuls : null,
      local: localReady ? currentZ : null,
      cicada: cicadaZ,
      qci: apiZScores.qci,
      nist: apiZScores.nist,
    },
    zJoue: MIDI_ON ? dernierZJoue : null,
  });
}, 1000);

function updateSessionChart() {
  if (!sessionActive || !sessionOverlay.classList.contains('open')) return;

  // Build datasets from sessionData + zHistory (only data during session)
  const start = sessionStartTime;
  const datasets = [];

  Object.keys(COLORS).forEach(key => {
    if (!sessionVisibility[key]) return;
    const srcData = zHistory[key].filter(p => p.t >= start);
    if (srcData.length === 0) return;
    datasets.push({
      label: SOURCE_LABELS[key] || key,
      data: srcData.map(p => ({ x: p.t, y: p.z })),
      borderColor: COLORS[key],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: false,
    });
  });

  if (sessionChart) {
    sessionChart.data.datasets = datasets;
    sessionChart.update('none');
    return;
  }

  const ctx = document.getElementById('chart-session');
  if (!ctx || typeof Chart === 'undefined') return;

  sessionChart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: makeChartOptions(item => `${item.dataset.label}: ${item.parsed.y.toFixed(3)}`),
  });
}

// Session toggles (la salle, a gauche)
document.querySelectorAll('#session-toggles > .graph-toggle').forEach(label => {
  label.addEventListener('click', (e) => {
    e.preventDefault();
    const key = label.dataset.key;
    // Hors page U1, les sources de la salle sont celles de l'ecoute : meme choix
    // que la barre des sources (plusieurs a la fois, temoin exclu)
    if (!MIDI_ON && SALLE_CLES.includes(key)) {
      basculerSalle(key);
      sessionVisibility[key] = !!salleChoix[key] || !!temoinChoix[key];
      updateSessionChart();
      return;
    }
    // Page U1 : ses cases (jeuSources). Noosfeerique allumee seulement si la cle repond
    const nowActive = key === 'cicada' ? !jeuSources.cicada : !label.classList.contains('active');
    if (key !== 'cicada') allumerPastille(label, nowActive);
    if (MIDI_ON && key in jeuSources) {
      jeuSources[key] = nowActive;
      try { localStorage.setItem('noosphi_jeu_sources', JSON.stringify(jeuSources)); } catch {}
      majCasesSession();
    }
    if (key === 'cicada') majPastilleCicada();
    // Exclusion : cochee dans la salle, elle quitte le temoin
    if (nowActive && TEMOIN.includes(key) && temoinChoix[key]) {
      temoinChoix = { ...temoinChoix, [key]: false };
      memoTemoin();
      renderTemoin();
    }
    if (key === 'telephones') return;   // pas une courbe
    sessionVisibility[key] = nowActive || !!temoinChoix[key];
    updateSessionChart();
  });
});

// Avec l'U1 virtuel : les cases partent de ce qui joue, et NIST se dit « vue »
// (une pulsation par minute, il ne joue jamais)
if (MIDI_ON) {
  document.querySelectorAll('#session-toggles > .graph-toggle').forEach(label => {
    const key = label.dataset.key;
    if (key in jeuSources) {
      label.classList.toggle('active', jeuSources[key]);
      label.querySelector('input').checked = jeuSources[key];
      if (key !== 'telephones') sessionVisibility[key] = jeuSources[key];
    } else if (key === 'combined') {
      label.title = 'Le z qui part vers MainStage, selon les cases';
    } else {
      label.title = 'Affichage seulement : une valeur par minute, ne joue pas';
      label.querySelector('span:last-child').textContent += ' · vue';
    }
  });
}

// Les lignes au chargement : l'exclusion appliquee, la salle, le temoin a droite, Noosfeerique
appliquerTemoinSurSalle();
majLignes();
majPastilleCicada();

// ============================================================
// Saved Sessions List
// ============================================================
// btn-session-history-main is in the main page bottom controls

if (sessionsListClose) {
  sessionsListClose.addEventListener('click', () => {
    sessionsListOverlay.classList.remove('open');
  });
}

// Delegate clicks on session list — cards, rename, delete
if (sessionsList) {
  sessionsList.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.saved-session-delete');
  if (deleteBtn) {
    e.stopPropagation();
    const id = deleteBtn.dataset.id;
    const sessions = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
    localStorage.setItem('noosphi_sessions', JSON.stringify(sessions.filter(s => s.id !== id)));
    renderSessionsList();
    return;
  }
  const card = e.target.closest('.saved-session-card');
  if (card && !e.target.closest('.saved-session-name-input')) openSessionDetail(card.dataset.id);
  });

  // Delegate blur on rename inputs
  sessionsList.addEventListener('focusout', (e) => {
  if (!e.target.classList.contains('saved-session-name-input')) return;
  const id = e.target.dataset.id;
  const newName = e.target.value.trim();
  if (!newName) return;
  const sessions = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
  const s = sessions.find(s => s.id === id);
  if (s) { s.name = newName; localStorage.setItem('noosphi_sessions', JSON.stringify(sessions)); }
  });
}

// Session toggles drawer
const btnSessionToggleSources = document.getElementById('btn-session-toggle-sources');
const sessionTogglesPanel = document.getElementById('session-toggles');
if (btnSessionToggleSources && sessionTogglesPanel) {
  btnSessionToggleSources.addEventListener('click', () => {
    sessionTogglesPanel.classList.toggle('collapsed');
    btnSessionToggleSources.classList.toggle('expanded');
  });
}

// Les seances d'avant la v1.4.0 n'ont qu'un z max
function resumeSeance(s) {
  if ('zSalle' in s) return texteResume(s);
  return s.maxZ != null ? `z max = ${s.maxZ.toFixed(2)} (ancienne séance)` : '';
}

// Echappe le texte saisi avant de le poser dans la page
const echappe = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Le rapport : une page HTML autonome (chiffres, courbe, secondes et fiche
// telechargeables depuis la page). « Données » : le CSV et la fiche JSON seuls.
function telecharger(contenu, nom, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function telechargerRapport(s) {
  telecharger(versRapportHTML(s, s.version || APP_VERSION), nomFichier(s) + '-rapport.html', 'text/html');
}
function exporterDonnees(s) {
  telecharger(versCSV(s.secondes || []), nomFichier(s) + '.csv', 'text/csv');
  setTimeout(() => telecharger(ficheJSON(s, s.version || APP_VERSION), nomFichier(s) + '.json', 'application/json'), 300);
}

function renderSessionsList() {
  const saved = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
  if (saved.length === 0) {
    sessionsList.innerHTML = '<div class="highlight-empty">Aucune session enregistree</div>';
    return;
  }
  sessionsList.innerHTML = saved.map(s => {
    const date = new Date(s.startTime);
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const durStr = formatDuration(s.duration);
    return `
      <div class="saved-session-card" data-id="${s.id}">
        <div class="saved-session-top">
          <input class="saved-session-name-input" data-id="${s.id}" value="${s.name}" maxlength="100">
          <button class="saved-session-delete" data-id="${s.id}" aria-label="Supprimer">
            <svg viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <span class="saved-session-meta">
          <span>${dateStr} ${timeStr}</span>
          <span>${durStr}</span>
        </span>
        <span class="saved-session-zmax">${resumeSeance(s)}</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// Session Detail View
// ============================================================
let detailChart = null;

sessionDetailClose.addEventListener('click', () => {
  sessionDetailOverlay.classList.remove('open');
  if (detailChart) { detailChart.destroy(); detailChart = null; }
});

function openSessionDetail(id) {
  const saved = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
  const session = saved.find(s => s.id === id);
  if (!session) return;

  detailTitle.textContent = session.name;
  const date = new Date(session.startTime);
  const dateStr = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const durStr = formatDuration(session.duration);

  // Les anciennes seances peuvent porter des courbes Princeton ou ANU : on les
  // montre encore, avec leur mention, seulement si la seance en contient
  const aDes = k => (session.data || []).some(p => p[k] != null);
  const DETAIL_SOURCES = [
    { key: 'z', label: 'Combine', color: '#CC44FF' },
    { key: 'local', label: 'Local', color: '#00E5FF' },
    { key: 'cicada', label: 'Noosféérique', color: '#FF5FA2' },
    { key: 'nist', label: 'NIST', color: '#00CC66' },
    { key: 'qci', label: 'QCI', color: '#C9A24D' },
    ...(aDes('gcp') ? [{ key: 'gcp', label: 'Princeton · collecte arrêtée le 03/04/2026', color: '#6C63FF' }] : []),
    ...(aDes('qrng') ? [{ key: 'qrng', label: 'ANU · retirée', color: '#FF8800' }] : []),
  ];

  const rap = 'zSalle' in session ? calculerRapport(session) : null;
  sessionDetailContent.innerHTML = `
    <div class="detail-meta">
      <span>${dateStr}</span>
      <span>${timeStr}</span>
      <span>${durStr}</span>
    </div>
    <div class="detail-seance">${resumeSeance(session)}</div>
    ${session.parSource ? `<div class="detail-regle detail-temoin" style="color:${TEMOIN_COULEUR}">Témoin, valeurs reçues : ${texteParSource(session) || 'aucune source cochée'}</div>` : ''}
    ${session.regle ? `<div class="detail-regle">Règle : ${echappe(session.regle)}</div>` : ''}
    ${rap ? `<div class="detail-rapport">${tableauRapport(rap)}<p>${telephonesTexte(rap)}</p></div>
    <div class="detail-export-row"><button class="detail-export-btn detail-rapport-btn">Rapport</button><button class="detail-export-btn detail-donnees-btn">Données</button></div>` : ''}
    <textarea class="detail-comment" placeholder="Ajoutez un commentaire..." data-id="${id}">${session.comment || ''}</textarea>
    <div class="detail-toggles">
      ${DETAIL_SOURCES.map(s => `
        <label class="graph-toggle active" data-key="${s.key}">
          <input type="checkbox" checked>
          <span class="toggle-swatch" style="background:${s.color}"></span>
          <span>${s.label}</span>
        </label>
      `).join('')}
    </div>
    <div class="detail-chart-container">
      <canvas id="chart-detail"></canvas>
    </div>
    <button class="detail-delete-btn" data-id="${id}">Supprimer cette session</button>
  `;

  // Comment save on blur
  sessionDetailContent.querySelector('.detail-comment').addEventListener('blur', (e) => {
    const sessions = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
    const s = sessions.find(s => s.id === id);
    if (s) { s.comment = e.target.value; localStorage.setItem('noosphi_sessions', JSON.stringify(sessions)); }
  });

  // Export : CSV des secondes + fiche JSON
  sessionDetailContent.querySelector('.detail-rapport-btn')?.addEventListener('click', () => telechargerRapport(session));
  sessionDetailContent.querySelector('.detail-donnees-btn')?.addEventListener('click', () => exporterDonnees(session));

  // Delete button
  sessionDetailContent.querySelector('.detail-delete-btn').addEventListener('click', () => {
    const sessions = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
    const filtered = sessions.filter(s => s.id !== id);
    localStorage.setItem('noosphi_sessions', JSON.stringify(filtered));
    sessionDetailOverlay.classList.remove('open');
    renderSessionsList();
  });

  // Detail toggles
  const detailVisibility = { z: true, local: true, cicada: true, nist: true, qci: true, gcp: true, qrng: true };

  function buildDetailChart() {
    if (detailChart) { detailChart.destroy(); detailChart = null; }
    const ctx = document.getElementById('chart-detail');
    if (!ctx || !session.data || session.data.length === 0) return;

    const datasets = DETAIL_SOURCES
      .filter(s => detailVisibility[s.key])
      .filter(s => session.data.some(p => p[s.key] != null))
      .map(s => ({
        label: s.label,
        data: session.data.filter(p => p[s.key] != null).map(p => ({ x: p.t, y: p[s.key] })),
        borderColor: s.color,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      }));

    detailChart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: makeChartOptions(item => `${item.dataset.label}: ${item.parsed.y.toFixed(3)}`),
    });
  }

  // Toggle handlers for detail view
  sessionDetailContent.querySelectorAll('.detail-toggles .graph-toggle').forEach(label => {
    label.addEventListener('click', (e) => {
      e.preventDefault();
      const key = label.dataset.key;
      const nowActive = !label.classList.contains('active');
      label.classList.toggle('active', nowActive);
      label.querySelector('input').checked = nowActive;
      detailVisibility[key] = nowActive;
      buildDetailChart();
    });
  });

  sessionDetailOverlay.classList.add('open');
  setTimeout(buildDetailChart, 100);
}

// ============================================================
// WebSocket — Collective sessions
// ============================================================
const socket = (typeof io !== 'undefined') ? io() : null;
let rejoining = false;

function startCollectiveSession(mode) {
  const name = sessionNameInput.value.trim() || 'Session collective';
  const userName = 'Participant'; // TODO: ask user name

  if (mode === 'create') {
    socket.emit('collective:create', { name, hostName: userName });
  } else {
    const code = collectiveCodeInput.value.trim().toUpperCase();
    if (!code) return;
    socket.emit('collective:join', { code, userName });
  }
}

if (btnCreateCollective) {
  btnCreateCollective.addEventListener('click', () => {
    if (!socket) return;
    isCollective = true;
    startCollectiveSession('create');
  });
}

if (btnJoinCollective) {
  btnJoinCollective.addEventListener('click', () => {
    if (!socket) return;
    isCollective = true;
    startCollectiveSession('join');
  });
}

// Shared setup for both collective:created and collective:joined
function onCollectiveSessionStart({ code, name, statusText }) {
  currentCollectiveCode = code;
  midiSessionCode(code);
  collectiveStatus.textContent = statusText;
  collectiveStatus.classList.remove('hidden');
  btnCopyCode.classList.remove('hidden');
  btnShareCode.classList.remove('hidden');
  sessionRecName.textContent = `${name} (${code})`;
  sessionSetup.classList.add('hidden');
  sessionRecording.classList.remove('hidden');
  sessionParticipants.classList.remove('hidden');
  sessionActive = true;
  requestWakeLock();   // un telephone en veille ne tire plus aucun z : on garde l'ecran allume
  sessionStartTime = Date.now();
  debutSeance();
  sessionTimerInterval = setInterval(() => {
    sessionRecTimer.textContent = formatTimer(Math.floor((Date.now() - sessionStartTime) / 1000));
  }, 1000);
  if (sessionChart) { sessionChart.destroy(); sessionChart = null; }
}

if (socket) {
  socket.on('collective:created', ({ code, name }) => {
    onCollectiveSessionStart({ code, name, statusText: `Session creee : ${code}` });
  });

  socket.on('collective:joined', ({ code, name }) => {
    if (rejoining) {   // reconnexion : la session continue, on ne la remet pas a zero
      rejoining = false;
      collectiveStatus.textContent = `Rejoint : ${code}`;
      return;
    }
    onCollectiveSessionStart({ code, name, statusText: `Rejoint : ${code}` });
  });

  // Ecran verrouille, reseau coupe : socket.io se reconnecte sous une nouvelle
  // identite, que le serveur a retiree de la session. On la rejoint seul,
  // sinon l'appareil croit participer alors qu'il n'est plus compte.
  socket.on('connect', () => {
    if (!sessionActive || !isCollective || !currentCollectiveCode) return;
    rejoining = true;
    socket.emit('collective:join', { code: currentCollectiveCode, userName: 'Participant' });
  });

  socket.on('collective:error', (msg) => {
    rejoining = false;
    collectiveStatus.textContent = msg;
    collectiveStatus.classList.remove('hidden');
  });

  socket.on('collective:update', (state) => {
    if (state) sessionParticipants.textContent = `${state.participantCount} connecte${state.participantCount > 1 ? 's' : ''}`;
  });

  socket.on('collective:z-fresh', ({ z, telephones, zTelephones }) => {
    collectiveFreshZ = z;
    zTelephonesSeuls = zTelephones ?? null;
    if (telephones != null) telephonesActifs = telephones;
  });

  socket.on('collective:z-update', ({ collectiveZ: cz, participantCount, telephones }) => {
    collectiveZ = cz;
    if (telephones != null) telephonesActifs = telephones;
    sessionParticipants.textContent = `${participantCount} connecte${participantCount > 1 ? 's' : ''}`;
  });

  // Send local z-score to collective every second
  setInterval(() => {
    if (sessionActive && isCollective) {
      // Avec l'U1 virtuel, cet ordi envoie ce que ses cases cochent (ou rien)
      const z = MIDI_ON ? hostJeuZ() : (localReady ? currentZ : null);
      if (z != null) socket.emit('collective:z', { z });
    }
  }, 1000);
}

// On stop: also leave the collective if active
btnStopSession.addEventListener('click', () => {
  if (isCollective && socket) {
    socket.emit('collective:leave');
    isCollective = false;
    collectiveZ = null;
    collectiveFreshZ = null;
    zTelephonesSeuls = null;
    telephonesActifs = 0;
    currentCollectiveCode = null;
    midiSessionCode(null);
    sessionParticipants.classList.add('hidden');
    collectiveStatus.classList.add('hidden');
    btnCopyCode.classList.add('hidden');
    btnShareCode.classList.add('hidden');
  }
});

// ============================================================
// Bootstrap
// ============================================================
function init() {
  // Start animation loop
  renderer.render(scene, camera);   // premiere image, meme figee
  animate();

  // Start local Z-score engine (1 tick/second)
  tickLocalZ();
  setInterval(tickLocalZ, 1000);

  // NIST Beacon : une pulsation par minute, regardee toutes les 20 s
  fetchNIST();
  setInterval(fetchNIST, 20000);

  // QCI every 1s (25 bytes/req = ~52% of 1B free quota)
  fetchQCI();
  setInterval(fetchQCI, 1000);

  // Cicada, la cle Noosfeerique : partout, une fois par seconde
  fetchCicada(); setInterval(fetchCicada, 1000);

  // Generateur du serveur, toutes les 60 s
  fetchSlow();
  setInterval(fetchSlow, API_POLL_INTERVAL);

  // Record history every second
  setInterval(recordHistory, 1000);

  // Hide loading after a few seconds
  setTimeout(() => {
    loadingText.classList.add('hidden');
  }, 6000);

  // ── URL parameters for external integration (Pierres de la Paix) ──
  const urlParams = new URLSearchParams(window.location.search);

  // ?autoplay=1 → start audio automatically after user gesture
  if (urlParams.get('autoplay') === '1') {
    // Browsers require user gesture for audio. We start on first touch/click.
    const autoplayHandler = () => {
      toggleAudio();
      document.removeEventListener('click', autoplayHandler);
      document.removeEventListener('touchstart', autoplayHandler);
    };
    // Small delay to let page render, then trigger on next interaction
    setTimeout(() => {
      document.addEventListener('click', autoplayHandler, { once: true });
      document.addEventListener('touchstart', autoplayHandler, { once: true });
      // Show a hint
      if (loadingText) {
        loadingText.textContent = 'Touche l\'ecran pour demarrer le son';
        loadingText.classList.remove('hidden');
        setTimeout(() => loadingText.classList.add('hidden'), 5000);
      }
    }, 1500);
  }

  // ?session=1 → open session overlay automatically
  if (urlParams.get('session') === '1') {
    setTimeout(() => {
      if (btnSession) btnSession.click();
    }, 2000);
  }

  // ?pierre=X&ange=Y → show stone theme in title + back button
  const pierreName = urlParams.get('pierre');
  const angeName = urlParams.get('ange');
  if (pierreName) {
    const titleEl = document.querySelector('.experience-title, h1, .header-title');
    if (titleEl) {
      titleEl.textContent = 'Meditation — ' + pierreName;
    }
    if (sessionNameInput) {
      sessionNameInput.placeholder = pierreName + (angeName ? ' (' + angeName + ')' : '');
    }
    // Add floating "back to stone" button
    const backBtn = document.createElement('a');
    backBtn.href = 'https://leparede.org/ma-pierre/';
    backBtn.textContent = '← Ma pierre';
    backBtn.style.cssText = 'position:fixed;top:12px;left:12px;z-index:9999;background:rgba(255,255,255,0.9);color:#8B6914;padding:8px 16px;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
    document.body.appendChild(backBtn);
  }

  // ?sessions=1 or #sessions → open sessions list
  if (urlParams.get('sessions') === '1' || window.location.hash === '#sessions') {
    setTimeout(() => {
      if (typeof renderSessionsList === 'function') renderSessionsList();
      if (sessionsListOverlay) sessionsListOverlay.classList.add('open');
    }, 2000);
  }
}

init();
