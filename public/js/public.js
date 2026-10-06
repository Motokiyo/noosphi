/* ============================================================
   Noosfeerique — Page public (public.html)
   Le telephone d'un spectateur tire son z chaque seconde et l'envoie
   a la session collective. Ecran noir, muet, sans 3D.
   Adresse : public.html?code=NOOS-ABCD (le QR code projete la contient).
   ============================================================ */

// Meme tirage que localEggZ dans experience.js (methode EGG de Princeton) :
// 10 essais de 200 bits, chacun z = (somme - 100) / racine(50), combines par Stouffer.
const TRIALS = 10;
const SQRT_50 = Math.sqrt(50);

function eggZ() {
  const bytes = new Uint8Array(25 * TRIALS);
  crypto.getRandomValues(bytes);
  let zSum = 0;
  for (let t = 0; t < TRIALS; t++) {
    let sum = 0;
    for (let i = 0; i < 25; i++) {
      let b = bytes[t * 25 + i];
      b = b - ((b >> 1) & 0x55);
      b = (b & 0x33) + ((b >> 2) & 0x33);
      sum += (b + (b >> 4)) & 0x0F;
    }
    zSum += (sum - 100) / SQRT_50;
  }
  return zSum / Math.sqrt(TRIALS);
}

const joinPanel = document.getElementById('join');
const codeInput = document.getElementById('code');
const statusEl = document.getElementById('status');
const socket = io();

let code = null;
let joined = false;
let wakeLock = null;
let fadeTimer = null;

function setStatus(text, fade = true) {
  statusEl.textContent = text;
  statusEl.classList.remove('faded');
  clearTimeout(fadeTimer);
  if (fade) fadeTimer = setTimeout(() => statusEl.classList.add('faded'), 6000);
}

// Un telephone en veille ne tire plus aucun z : on garde l'ecran allume.
// Fonctionne seulement en HTTPS ; le navigateur le relache si on quitte la page.
async function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {}
}

function join(c) {
  code = c.trim().toUpperCase();
  if (!/^NOOS-[A-Z0-9]{4}$/.test(code)) { setStatus('Code invalide', false); return; }
  setStatus('Connexion…', false);
  socket.emit('collective:join', { code, userName: 'Public' });
}

socket.on('collective:joined', () => {
  joined = true;
  joinPanel.classList.add('hidden');
  document.body.classList.add('connected');
  keepAwake();
  setStatus(`Vous participez · ${code} · gardez cette page ouverte`);
});

socket.on('collective:error', msg => {
  joined = false;
  document.body.classList.remove('connected');
  joinPanel.classList.remove('hidden');
  setStatus(msg, false);
});

socket.on('collective:update', state => {
  if (joined && state) setStatus(`${state.participantCount} participants · ${code}`);
});

// Reconnexion (ecran rallume, reseau revenu) : nouvelle identite pour le
// serveur, donc on rejoint la session de nouveau.
socket.on('connect', () => { if (code && joined) join(code); });
socket.on('disconnect', () => { if (joined) setStatus('Connexion perdue, reconnexion…', false); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && joined) keepAwake();
});

setInterval(() => {
  if (joined && socket.connected) socket.emit('collective:z', { z: eggZ() });
}, 1000);

document.getElementById('btn-join').addEventListener('click', () => join(codeInput.value));
codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') join(codeInput.value); });

const fromUrl = new URLSearchParams(location.search).get('code');
if (fromUrl) { codeInput.value = fromUrl; join(fromUrl); }
