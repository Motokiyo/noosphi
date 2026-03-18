/* ============================================================
   Noosfeerique — Experience (Sphere MVP)
   Three.js sphere + local Z-score + audio + API sources
   ============================================================ */

import * as THREE from 'three';

// ---- Constants ----
const DRAW_RATE = 12000;       // bits per second (12000 bits/s)
const WINDOW_SIZE = 60;        // sliding window in seconds
const Z_MAX = 3;               // z-score ceiling for normalization (practical range)
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

// ============================================================
// Z-Score Calculator (sliding window, from NAP v1 pattern)
// ============================================================
class ZScoreCalculator {
  constructor(windowSize) {
    this.windowSize = windowSize;
    this.sums = [];
  }

  update(sum) {
    this.sums.push(sum);
    if (this.sums.length > this.windowSize) this.sums.shift();
    if (this.sums.length < 2) return 0;
    const n = this.sums.length;
    const mean = this.sums.reduce((a, b) => a + b, 0) / n;
    const variance = this.sums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    return stdDev > 0 ? (sum - mean) / stdDev : 0;
  }

  get ready() {
    return this.sums.length >= 5;
  }
}

function getRandomBits(count) {
  const bytes = new Uint8Array(Math.ceil(count / 8));
  crypto.getRandomValues(bytes);
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    // Count set bits using bit manipulation
    let b = bytes[i];
    b = b - ((b >> 1) & 0x55);
    b = (b & 0x33) + ((b >> 2) & 0x33);
    sum += (b + (b >> 4)) & 0x0F;
  }
  // Only count up to 'count' bits
  const extraBits = bytes.length * 8 - count;
  if (extraBits > 0) {
    const lastByte = bytes[bytes.length - 1];
    for (let i = 0; i < extraBits; i++) {
      if ((lastByte >> i) & 1) sum--;
    }
  }
  return sum;
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
// Audio Engine — Cello synthesis
// Two detuned sawtooth oscillators + lowpass + vibrato LFO
// ============================================================
let audioCtx = null;
let osc1 = null;        // main "string"
let osc2 = null;        // detuned second "string" for chorus
let vibratoLFO = null;  // pitch wobble (bow vibrato)
let vibratoGain = null;
let biquadFilter = null;
let gainNode = null;
let audioActive = false;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const t = audioCtx.currentTime;

  // Two sawtooth oscillators — rich harmonics like bowed strings
  osc1 = audioCtx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(BASE_FREQ, t);

  osc2 = audioCtx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(BASE_FREQ, t);
  osc2.detune.setValueAtTime(DETUNE_CENTS, t);

  // Vibrato LFO → modulates both oscillator frequencies
  vibratoLFO = audioCtx.createOscillator();
  vibratoLFO.type = 'sine';
  vibratoLFO.frequency.setValueAtTime(VIBRATO_RATE, t);
  vibratoGain = audioCtx.createGain();
  vibratoGain.gain.setValueAtTime(VIBRATO_DEPTH, t);

  vibratoLFO.connect(vibratoGain);
  vibratoGain.connect(osc1.frequency);
  vibratoGain.connect(osc2.frequency);

  // Lowpass filter — tames the sawtooth buzz into a warm cello tone
  biquadFilter = audioCtx.createBiquadFilter();
  biquadFilter.type = 'lowpass';
  biquadFilter.frequency.setValueAtTime(120, t); // rest value — dark/muffled at z~0
  biquadFilter.Q.setValueAtTime(0.7, t);

  // Master gain
  gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, t);

  // Routing: osc1 + osc2 → filter → gain → output
  osc1.connect(biquadFilter);
  osc2.connect(biquadFilter);
  biquadFilter.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc1.start();
  osc2.start();
  vibratoLFO.start();
}

function toggleAudio() {
  if (!audioCtx) {
    initAudio();
    audioActive = true;
    audioCtx.resume();
    // Immediately set audible frequency and volume
    updateAudio(smoothZ || 0);
  } else if (audioActive) {
    audioActive = false;
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + AUDIO_FADEOUT_TIME);
  } else {
    audioActive = true;
    audioCtx.resume();
    // Restore sound immediately on re-toggle
    updateAudio(smoothZ || 0);
  }
  audioIndicator.classList.toggle('active', audioActive);
}

let prevQuantizedFreq = 0; // track note changes for sharp transitions

function updateAudio(zScore) {
  if (!audioCtx || !audioActive) return;
  const t = audioCtx.currentTime;
  const intensity = Math.min(Math.abs(zScore) / Z_MAX, 1);

  // --- Pitch ---
  // Map intensity across cello range with flattened curve
  const pitchT = Math.pow(intensity, 0.6);
  let freq = BASE_FREQ + pitchT * (MAX_FREQ - BASE_FREQ);
  freq = quantizeFreq(freq, currentScaleFreqs);

  // Note transitions:
  // - Quantized (gamme): snap rapide comme un changement de corde (30ms)
  // - Libre: glide doux mais perceptible (200ms time constant)
  const noteChanged = Math.abs(freq - prevQuantizedFreq) > 0.5;
  if (noteChanged) {
    const tc = currentScaleFreqs ? 0.03 : 0.2;
    osc1.frequency.setTargetAtTime(freq, t, tc);
    osc2.frequency.setTargetAtTime(freq, t, tc);
  }
  prevQuantizedFreq = freq;

  // --- Volume: driven by intensity ---
  // Z ~ 0: barely audible whisper. Z high: full presence.
  // Soft attack via long ramp time at low intensity, shorter at high.
  const vol = 0.01 + intensity * 0.12;
  const attackTime = 0.8 - intensity * 0.5; // 0.8s at rest → 0.3s at peak
  gainNode.gain.setTargetAtTime(vol, t, attackTime);

  // --- Filter: "melodicity" ---
  // Z ~ 0: very dark, muffled (120 Hz cutoff) — just a hum
  // Z high: open, rich harmonics (1200 Hz) — full cello voice
  const cutoff = 120 + intensity * 1080;
  biquadFilter.frequency.setTargetAtTime(cutoff, t, 0.3);

  // --- Vibrato: more expressive at high Z ---
  const vibDepth = 1 + intensity * 6; // subtle 1Hz wobble → expressive 7Hz
  vibratoGain.gain.setTargetAtTime(vibDepth, t, 0.3);
}

// Click on canvas toggles audio
canvas.addEventListener('click', toggleAudio);

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
  if (calculator.ready) {
    zDisplay.textContent = smoothZ.toFixed(2);
    // Color the z value text subtly
    if (absZ > 2) {
      zDisplay.style.color = '#C9A24D';
    } else if (absZ > 1.5) {
      zDisplay.style.color = 'rgba(255,255,255,0.9)';
    } else {
      zDisplay.style.color = 'rgba(255,255,255,0.6)';
    }
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
// Adaptive z-score normalizer
// Tracks running stddev per source, rescales so variance ≈ 1
// (aligned with Princeton which is the reference standard).
// Princeton (gcp) is NOT normalized — it's the reference.
// ============================================================
class ZNormalizer {
  constructor(warmup = 30) {
    this.warmup = warmup; // min samples before normalizing
    this.values = [];
    this.maxWindow = 300;  // rolling window
  }
  push(z) {
    this.values.push(z);
    if (this.values.length > this.maxWindow) this.values.shift();
  }
  normalize(z) {
    if (this.values.length < this.warmup) return z; // not enough data yet
    const n = this.values.length;
    const mean = this.values.reduce((a, b) => a + b, 0) / n;
    const variance = this.values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);
    if (stddev < 0.01) return z; // avoid division by near-zero
    return (z - mean) / stddev;  // rescale to unit variance, zero mean
  }
}

const normalizers = {
  local: new ZNormalizer(10),    // warms up fast (1/sec)
  qrng: new ZNormalizer(5),      // slower (1/min)
  nist: new ZNormalizer(5),
  qci: new ZNormalizer(5),
  local_server: new ZNormalizer(5),
};
// gcp (Princeton) is NOT in normalizers — it's already calibrated

// ============================================================
// Z-Score Engine (local RNG, 1 calc/second)
// ============================================================
const calculator = new ZScoreCalculator(WINDOW_SIZE);

function tickLocalZ() {
  const bitSum = getRandomBits(DRAW_RATE);
  const z = calculator.update(bitSum);
  if (calculator.ready) {
    normalizers.local.push(z);
    currentZ = normalizers.local.normalize(z);
    combineAndUpdate();
    loadingText.classList.add('hidden');
  }
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

async function fetchAPIs() {
  const endpoints = [
    { key: 'gcp', url: '/api/gcp', extract: d => d.zIndex },
    { key: 'qrng', url: '/api/qrng', extract: d => {
      if (d.data && typeof chiSquareFromBytes === 'function') {
        return chiSquareFromBytes(d.data);
      }
      return null;
    }},
    { key: 'nist', url: '/api/nist-beacon', extract: d => {
      if (d.data && typeof chiSquareFromBytes === 'function') {
        return chiSquareFromBytes(d.data);
      }
      return null;
    }},
    { key: 'qci', url: '/api/qci', extract: d => {
      if (d.data && typeof chiSquareFromBytes === 'function') {
        return chiSquareFromBytes(d.data);
      }
      return null;
    }},
    { key: 'local_server', url: '/api/local-rng', extract: d => parseFloat(d.zScore) },
  ];

  const results = await Promise.allSettled(
    endpoints.map(ep =>
      fetch(ep.url)
        .then(r => r.json())
        .then(d => ({ key: ep.key, z: ep.extract(d), ok: d.status === 'ok' }))
    )
  );

  results.forEach((r, i) => {
    const key = endpoints[i].key;
    if (r.status === 'fulfilled' && r.value.ok && r.value.z != null && isFinite(r.value.z)) {
      let z = r.value.z;
      // Normalize non-Princeton sources to unit variance
      if (normalizers[key]) {
        normalizers[key].push(z);
        z = normalizers[key].normalize(z);
      }
      apiZScores[key] = z;
      sourceDots[i + 1]?.classList.add('active');
    } else {
      apiZScores[key] = null;
      sourceDots[i + 1]?.classList.remove('active');
    }
  });
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
  sourceDots[0]?.classList.toggle('active', calculator.ready);

  // Collect all available z-scores
  const allZ = [];
  if (calculator.ready) allZ.push(currentZ);
  Object.values(apiZScores).forEach(z => {
    if (z != null && isFinite(z)) allZ.push(z);
  });

  // Compute combined Stouffer Z
  const fullCombinedZ = computeStoufferZ(allZ);

  // Update sidebar z-score displays
  if (calculator.ready) sidebarZLocal.textContent = currentZ.toFixed(2);
  if (apiZScores.gcp != null) sidebarZGcp.textContent = apiZScores.gcp.toFixed(2);
  if (apiZScores.qrng != null) sidebarZQrng.textContent = apiZScores.qrng.toFixed(2);
  if (apiZScores.nist != null) sidebarZNist.textContent = apiZScores.nist.toFixed(2);
  if (apiZScores.qci != null) sidebarZQci.textContent = apiZScores.qci.toFixed(2);
  if (fullCombinedZ != null) sidebarZCombined.textContent = fullCombinedZ.toFixed(2);

  // Pick the z-score based on selected source
  let displayZ;
  switch (selectedSource) {
    case 'local':
      displayZ = calculator.ready ? currentZ : null;
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
      <button class="modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></button>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

btnHelp.addEventListener('click', createHelpModal);

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

btnSettings.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsBackdrop.addEventListener('click', closeSettings);

// Scale radio buttons
const scaleOptions = document.querySelectorAll('.scale-option');
scaleOptions.forEach(label => {
  label.addEventListener('click', () => {
    scaleOptions.forEach(l => l.classList.remove('active'));
    label.classList.add('active');
    label.querySelector('input').checked = true;
    currentScaleFreqs = buildScaleFreqs(label.dataset.scale);
  });
});

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

btnMenu.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
sidebarBackdrop.addEventListener('click', closeSidebar);

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
  if (calculator.ready) allZ.push(currentZ);
  Object.values(apiZScores).forEach(z => { if (z != null && isFinite(z)) allZ.push(z); });
  const cz = computeStoufferZ(allZ);
  if (cz != null) pushHistory('combined', now, cz);
  // Individual
  if (calculator.ready) pushHistory('local', now, currentZ);
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

btnGraph.addEventListener('click', openGraph);
graphClose.addEventListener('click', closeGraph);

// Toggle sources drawer
const btnToggleSources = document.getElementById('btn-toggle-sources');
const graphTogglesPanel = document.getElementById('graph-toggles');
btnToggleSources.addEventListener('click', () => {
  graphTogglesPanel.classList.toggle('collapsed');
  btnToggleSources.classList.toggle('expanded');
});

// Toggle source visibility in graph
document.querySelectorAll('.graph-toggle').forEach(label => {
  label.addEventListener('click', (e) => {
    e.preventDefault(); // prevent checkbox from double-toggling
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
  const SOURCE_LABELS = { combined: 'Combine', local: 'Local', gcp: 'Princeton', qrng: 'ANU', nist: 'NIST', qci: 'QCI' };
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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            callback: v => formatTime(v),
            color: 'rgba(255,255,255,0.3)',
            maxTicksLimit: 6,
            font: { size: 10 },
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: {
            color: 'rgba(255,255,255,0.3)',
            font: { size: 10 },
          },
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
            label: item => `${item.dataset.label}: ${item.parsed.y.toFixed(3)}`,
          },
        },
      },
    },
  });
}

// Refresh graph every 5 seconds while open
setInterval(() => { if (graphOverlay.classList.contains('open')) updateGraph(); }, 5000);

// ============================================================
// Bootstrap
// ============================================================
function init() {
  // Start animation loop
  animate();

  // Start local Z-score engine (1 tick/second)
  tickLocalZ();
  setInterval(tickLocalZ, 1000);

  // Fetch API sources immediately, then every 60s
  fetchAPIs();
  setInterval(fetchAPIs, API_POLL_INTERVAL);

  // Record history every second
  setInterval(recordHistory, 1000);

  // Hide loading after a few seconds
  setTimeout(() => {
    loadingText.classList.add('hidden');
  }, 6000);
}

init();
