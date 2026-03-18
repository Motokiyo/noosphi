/* ============================================================
   Noosfeerique — Experience (Sphere MVP)
   Three.js sphere + local Z-score + audio + API sources
   ============================================================ */

import * as THREE from 'three';

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
const loadingText = document.getElementById('loading-text');
const audioIndicator = document.getElementById('audio-indicator');
const sourceDots = document.querySelectorAll('.source-dot');

// Sidebar z-score displays (cached — updated every second in combineAndUpdate)
const sidebarZLocal    = document.getElementById('sidebar-z-local');
const sidebarZGcp      = document.getElementById('sidebar-z-gcp');
const sidebarZQrng     = document.getElementById('sidebar-z-qrng');
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
renderer.toneMappingExposure = 1.0;

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
  roughness: 0.35,
  metalness: 0.0,
  clearcoat: 0.4,
  clearcoatRoughness: 0.2,
  emissive: new THREE.Color(0x000000),
  emissiveIntensity: 0,
});
const sphere = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphere);

// ---- Lighting ----
// Ambient: very dim base
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
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
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

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

  masterGain.connect(audioCtx.destination);
  masterGain.connect(revDelay1);
  masterGain.connect(revDelay2);
  revDelay1.connect(revFilter);
  revDelay2.connect(revFilter);
  revFilter.connect(revGain);
  revGain.connect(revDelay1);
  revGain.connect(audioCtx.destination);

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
function strikeSound(freq, volume, decay, type) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  if (type === 'bowl') {
    // Singing bowl: fundamental + slightly inharmonic overtone
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 2.76; // inharmonic partial (bowl character)

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 12; // very resonant

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, t);
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
    // Small bell: higher, shorter, brighter
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume * 0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.6);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + decay * 0.6);

  } else if (type === 'gong') {
    // Deep gong: very low, long decay
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
    gain.gain.setValueAtTime(volume, t);
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
  const baseVol = 0.05 + intensity * 0.04;
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
  const padTc = currentScaleFreqs ? 0.05 : 0.8;
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
    const tc = currentScaleFreqs ? 0.05 : 0.4;
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

document.querySelectorAll('.audio-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const slider = btn.parentElement.querySelector('.audio-slider') ||
                   btn.closest('.audio-control')?.querySelector('.audio-slider');
    if (slider) {
      slider.classList.toggle('visible');
      // Auto-hide after 4s
      clearTimeout(slider._hideTimer);
      if (slider.classList.contains('visible')) {
        slider._hideTimer = setTimeout(() => slider.classList.remove('visible'), 4000);
      }
    }
    toggleAudio();
  });
});

document.querySelectorAll('.audio-slider input[type="range"]').forEach(slider => {
  slider.value = userVolume * 100;
  slider.addEventListener('input', (e) => {
    e.stopPropagation();
    userVolume = parseInt(e.target.value) / 100;
    localStorage.setItem('noosphi_volume', userVolume.toString());
    if (masterGain) masterGain.gain.setTargetAtTime(userVolume * 0.12, audioCtx.currentTime, 0.1);
    // Sync all sliders
    document.querySelectorAll('.audio-slider input[type="range"]').forEach(s => { s.value = e.target.value; });
  });
  slider.addEventListener('click', (e) => e.stopPropagation());
  slider.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
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
  keyLight.intensity = 0.3 + intensity * 2.5;

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

  // Update z-display
  if (localReady) {
    zDisplay.textContent = smoothZ.toFixed(2);
    zDisplay.style.color = zColor(absZ);
  }
}

// ============================================================
// Animation Loop
// ============================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // Slow rotation
  sphere.rotation.y += 0.003;
  sphere.rotation.x += 0.001;

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
const apiZScores = {
  gcp: null,
  qrng: null,
  nist: null,
  qci: null,
  local_server: null,
};

function processApiResult(key, dotIndex, z) {
  if (z != null && isFinite(z)) {
    apiZScores[key] = z;
    sourceDots[dotIndex]?.classList.add('active');
  } else {
    apiZScores[key] = null;
    sourceDots[dotIndex]?.classList.remove('active');
  }
}

// GCP (Princeton) — polled every 1s (no rate limit)
async function fetchGCP() {
  try {
    const d = await fetch('/api/gcp').then(r => r.json());
    processApiResult('gcp', 1, d.status === 'ok' ? d.zIndex : null);
  } catch { processApiResult('gcp', 1, null); }
  combineAndUpdate();
}

// QCI — polled every 1s (25 bytes/req = ~52% of 1B bits/month quota)
async function fetchQCI() {
  try {
    const d = await fetch('/api/qci').then(r => r.json());
    processApiResult('qci', 4, d.status === 'ok' ? d.zIndex : null);
  } catch { processApiResult('qci', 4, null); }
  combineAndUpdate();
}

// ANU + NIST + local server — polled every 60s (rate-limited)
async function fetchSlow() {
  const endpoints = [
    { key: 'qrng', dot: 2, url: '/api/qrng' },
    { key: 'nist', dot: 3, url: '/api/nist-beacon' },
    { key: 'local_server', dot: 5, url: '/api/local-rng' },
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

function combineAndUpdate() {
  // Local browser RNG is always source #0
  sourceDots[0]?.classList.toggle('active', localReady);

  // Collect all available z-scores
  const allZ = [];
  if (localReady) allZ.push(currentZ);
  Object.values(apiZScores).forEach(z => {
    if (z != null && isFinite(z)) allZ.push(z);
  });

  // Compute combined Stouffer Z
  const fullCombinedZ = computeStoufferZ(allZ);

  // Update sidebar z-score displays
  if (localReady) sidebarZLocal.textContent = currentZ.toFixed(2);
  if (apiZScores.gcp != null) sidebarZGcp.textContent = apiZScores.gcp.toFixed(2);
  if (apiZScores.qrng != null) sidebarZQrng.textContent = apiZScores.qrng.toFixed(2);
  if (apiZScores.nist != null) sidebarZNist.textContent = apiZScores.nist.toFixed(2);
  if (apiZScores.qci != null) sidebarZQci.textContent = apiZScores.qci.toFixed(2);
  if (fullCombinedZ != null) sidebarZCombined.textContent = fullCombinedZ.toFixed(2);

  // Pick the z-score based on selected source
  let displayZ;
  switch (selectedSource) {
    case 'local':
      displayZ = localReady ? currentZ : null;
      break;
    case 'gcp':
      displayZ = apiZScores.gcp;
      break;
    case 'qrng':
      displayZ = apiZScores.qrng;
      break;
    case 'nist':
      displayZ = apiZScores.nist;
      break;
    case 'qci':
      displayZ = apiZScores.qci;
      break;
    default: // 'combined'
      displayZ = fullCombinedZ;
  }

  if (displayZ == null) return;

  updateVisuals(displayZ);
  updateAudio(displayZ);

  // Update live z-score in graph overlay
  graphZValue.textContent = displayZ.toFixed(2);
  graphZValue.style.color = zColor(Math.abs(displayZ));
  graphZSources.innerHTML = SOURCE_META.map(s => {
    const active = s.key === 'local' ? localReady : apiZScores[s.key] != null;
    return `<span class="live-z-source-dot ${active ? 'active' : ''}" style="background:${s.color}" title="${s.label}"></span>`;
  }).join('');

  // Feed session recording
  recordSessionTick(displayZ);
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
        <li>~60 EGGs quantiques mondiaux (Princeton, USA)</li>
        <li>ANU QRNG — photonique (Australie)</li>
        <li>NIST Beacon 2.0 (gouvernement US)</li>
        <li>Le generateur de votre propre appareil</li>
      </ul>
      <p class="help-hint">Cliquez sur la sphere pour activer le son</p>
      <p style="margin-top:16px"><a href="credits.html" style="color:rgba(255,255,255,0.3);font-size:11px;text-decoration:none;letter-spacing:0.05em">Credits &amp; remerciements</a></p>
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

// Source radio buttons
const sourceOptions = document.querySelectorAll('.source-option');
sourceOptions.forEach(label => {
  label.addEventListener('click', () => {
    sourceOptions.forEach(l => l.classList.remove('active'));
    label.classList.add('active');
    selectedSource = label.dataset.source;
    label.querySelector('input').checked = true;
    combineAndUpdate();
  });
});

// ============================================================
// Z-Score History (for graph overlay)
// ============================================================
const HISTORY_MAX = 86400; // 24h at 1 point/sec
const COLORS = {
  combined: '#CC44FF',
  local: '#00E5FF',
  gcp: '#6C63FF',
  qrng: '#FF8800',
  nist: '#00CC66',
  qci: '#C9A24D',
};
const SOURCE_LABELS = { combined: 'Combine', local: 'Local', gcp: 'Princeton', qrng: 'ANU', nist: 'NIST', qci: 'QCI' };
// Used for graph-overlay source dots (excludes 'combined' which has no API slot)
const SOURCE_META = [
  { key: 'local', color: '#00E5FF', label: 'Local' },
  { key: 'gcp',   color: '#6C63FF', label: 'Princeton' },
  { key: 'qrng',  color: '#FF8800', label: 'ANU' },
  { key: 'nist',  color: '#00CC66', label: 'NIST' },
  { key: 'qci',   color: '#C9A24D', label: 'QCI' },
];
const zHistory = {
  combined: [],
  local: [],
  gcp: [],
  qrng: [],
  nist: [],
  qci: [],
};

function recordHistory() {
  const now = Date.now();
  // Combined
  const allZ = [];
  if (localReady) allZ.push(currentZ);
  Object.values(apiZScores).forEach(z => { if (z != null && isFinite(z)) allZ.push(z); });
  const cz = computeStoufferZ(allZ);
  if (cz != null) pushHistory('combined', now, cz);
  // Individual
  if (localReady) pushHistory('local', now, currentZ);
  if (apiZScores.gcp != null) pushHistory('gcp', now, apiZScores.gcp);
  if (apiZScores.qrng != null) pushHistory('qrng', now, apiZScores.qrng);
  if (apiZScores.nist != null) pushHistory('nist', now, apiZScores.nist);
  if (apiZScores.qci != null) pushHistory('qci', now, apiZScores.qci);
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
const graphVisibility = { combined: true, local: true, gcp: true, qrng: true, nist: true, qci: true };

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
let sessionStartTime = null;
let sessionTimerInterval = null;
let sessionData = [];   // { t, z, sources }
let sessionMaxZ = 0;
let sessionChart = null;
let currentCollectiveCode = null;
const btnPauseSession = document.getElementById("btn-pause-session");
const pauseLabel = document.getElementById("pause-label");
const sessionVisibility = { combined: true, local: true, gcp: true, qrng: true, nist: true, qci: true };

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
    if (btnSessionAudio) {
      btnSessionAudio.classList.toggle('active', audioActive);
    }
    if (!sessionActive) {
      sessionSetup.classList.remove('hidden');
      sessionRecording.classList.add('hidden');
    }
  });
}

if (sessionClose) {
  sessionClose.addEventListener('click', () => {
    if (!sessionActive) sessionOverlay.classList.remove('open');
  });
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
  sessionData = [];
  sessionMaxZ = 0;
  sessionZMax.textContent = 'max: --';

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
  clearInterval(sessionTimerInterval);

  const session = {
    id: Date.now().toString(36),
    name: sessionRecName.textContent,
    startTime: sessionStartTime,
    endTime: Date.now(),
    duration: Math.floor((Date.now() - sessionStartTime) / 1000),
    maxZ: sessionMaxZ,
    data: sessionData,
    comment: '',
  };

  // Save to localStorage
  const saved = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
  saved.unshift(session);
  // Keep max 50 sessions
  if (saved.length > 50) saved.pop();
  localStorage.setItem('noosphi_sessions', JSON.stringify(saved));

  sessionOverlay.classList.remove('open');
  sessionSetup.classList.remove('hidden');
  sessionRecording.classList.add('hidden');
  sessionNameInput.value = '';
  if (sessionChart) { sessionChart.destroy(); sessionChart = null; }
  });
}

// Record data point during session (called from combineAndUpdate)
function recordSessionTick(displayZ) {
  if (!sessionActive || sessionPaused) return;

  const point = {
    t: Date.now(),
    z: displayZ,
    local: localReady ? currentZ : null,
    gcp: apiZScores.gcp,
    qrng: apiZScores.qrng,
    nist: apiZScores.nist,
    qci: apiZScores.qci,
  };
  sessionData.push(point);

  if (Math.abs(displayZ) > Math.abs(sessionMaxZ)) {
    sessionMaxZ = displayZ;
    sessionZMax.textContent = `max: ${sessionMaxZ.toFixed(2)}`;
  }

  sessionZValue.textContent = displayZ.toFixed(2);
  sessionZValue.style.color = zColor(Math.abs(displayZ));

  updateSessionChart();
}

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

// Session toggles
document.querySelectorAll('#session-toggles .graph-toggle').forEach(label => {
  label.addEventListener('click', (e) => {
    e.preventDefault();
    const key = label.dataset.key;
    const nowActive = !label.classList.contains('active');
    label.classList.toggle('active', nowActive);
    label.querySelector('input').checked = nowActive;
    sessionVisibility[key] = nowActive;
    updateSessionChart();
  });
});

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
        <span class="saved-session-zmax">z max = ${s.maxZ.toFixed(2)}</span>
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

  const DETAIL_SOURCES = [
    { key: 'z', label: 'Combine', color: '#CC44FF' },
    { key: 'local', label: 'Local', color: '#00E5FF' },
    { key: 'gcp', label: 'Princeton', color: '#6C63FF' },
    { key: 'qrng', label: 'ANU', color: '#FF8800' },
    { key: 'nist', label: 'NIST', color: '#00CC66' },
    { key: 'qci', label: 'QCI', color: '#C9A24D' },
  ];

  sessionDetailContent.innerHTML = `
    <div class="detail-meta">
      <span>${dateStr}</span>
      <span>${timeStr}</span>
      <span>${durStr}</span>
      <span style="color:var(--accent-gold)">z max = ${session.maxZ.toFixed(2)}</span>
    </div>
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

  // Delete button
  sessionDetailContent.querySelector('.detail-delete-btn').addEventListener('click', () => {
    const sessions = JSON.parse(localStorage.getItem('noosphi_sessions') || '[]');
    const filtered = sessions.filter(s => s.id !== id);
    localStorage.setItem('noosphi_sessions', JSON.stringify(filtered));
    sessionDetailOverlay.classList.remove('open');
    renderSessionsList();
  });

  // Detail toggles
  const detailVisibility = { z: true, local: true, gcp: true, qrng: true, nist: true, qci: true };

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
  collectiveStatus.textContent = statusText;
  collectiveStatus.classList.remove('hidden');
  btnCopyCode.classList.remove('hidden');
  btnShareCode.classList.remove('hidden');
  sessionRecName.textContent = `${name} (${code})`;
  sessionSetup.classList.add('hidden');
  sessionRecording.classList.remove('hidden');
  sessionParticipants.classList.remove('hidden');
  sessionActive = true;
  sessionStartTime = Date.now();
  sessionData = [];
  sessionMaxZ = 0;
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
    onCollectiveSessionStart({ code, name, statusText: `Rejoint : ${code}` });
  });

  socket.on('collective:error', (msg) => {
    collectiveStatus.textContent = msg;
    collectiveStatus.classList.remove('hidden');
  });

  socket.on('collective:update', (state) => {
    if (state) sessionParticipants.textContent = `${state.participantCount} connecte${state.participantCount > 1 ? 's' : ''}`;
  });

  socket.on('collective:z-update', ({ collectiveZ: cz, participantCount }) => {
    collectiveZ = cz;
    sessionParticipants.textContent = `${participantCount} connecte${participantCount > 1 ? 's' : ''}`;
  });

  // Send local z-score to collective every second
  setInterval(() => {
    if (sessionActive && isCollective && localReady) {
      socket.emit('collective:z', { z: currentZ });
    }
  }, 1000);
}

// On stop: also leave the collective if active
btnStopSession.addEventListener('click', () => {
  if (isCollective && socket) {
    socket.emit('collective:leave');
    isCollective = false;
    collectiveZ = null;
    currentCollectiveCode = null;
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
  animate();

  // Start local Z-score engine (1 tick/second)
  tickLocalZ();
  setInterval(tickLocalZ, 1000);

  // GCP every 60s (Princeton updates data every ~60s)
  fetchGCP();
  setInterval(fetchGCP, 60000);

  // QCI every 1s (25 bytes/req = ~52% of 1B free quota)
  fetchQCI();
  setInterval(fetchQCI, 1000);

  // ANU + NIST + local server every 60s (rate-limited)
  fetchSlow();
  setInterval(fetchSlow, API_POLL_INTERVAL);

  // Record history every second
  setInterval(recordHistory, 1000);

  // Hide loading after a few seconds
  setTimeout(() => {
    loadingText.classList.add('hidden');
  }, 6000);
}

init();
