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
let noticeShown = false;
let visibleTimer = null;

// Sphere et z a peine visibles pendant `ms`, puis retour au noir
function montrer(ms) {
  document.body.classList.add('visible');
  clearTimeout(visibleTimer);
  visibleTimer = setTimeout(() => document.body.classList.remove('visible'), ms);
}

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

// Le micro comme générateur (micro.js) : chaque seconde, ses tirages de 200 bits
// réunis par Stouffer. Il s'ouvre au toucher sur « Participer » (l'iPhone l'exige).
// Micro refusé, ou 5 secondes sans aucun tirage : la graine prend le relais.
// ?graine=1 dans l'adresse : pas de micro, comme avant.
const AVEC_MICRO = !new URLSearchParams(location.search).has('graine') && !!window.NoosMicro && !!navigator.mediaDevices?.getUserMedia;
let extracteur = null, couperMicro = null, secondesVides = 0, source = 'graine';
const APPAREIL = Math.random().toString(36).slice(2, 8);

async function ouvrirLeMicro() {
  if (!AVEC_MICRO || extracteur) return;
  try {
    extracteur = NoosMicro.createExtracteur();
    couperMicro = await NoosMicro.ouvrirMicro(extracteur);
    source = 'micro';
  } catch { extracteur = null; source = 'graine'; }
}

// Le z de cette seconde, et de quoi il vient. null : seconde creuse du micro
function zDeLaSeconde() {
  if (source !== 'micro') return { z: eggZ(), zs: null, c: null };
  const zs = extracteur.tirer(TRIALS), c = extracteur.controle();
  if (!zs.length) {
    if (++secondesVides >= 5) {           // micro muet : la graine prend le relais
      couperMicro?.(); couperMicro = null; extracteur = null; source = 'graine';
      setStatus('Micro silencieux : le hasard du téléphone prend le relais');
    }
    return { z: null, zs, c };
  }
  secondesVides = 0;
  return { z: zs.reduce((a, b) => a + b, 0) / Math.sqrt(zs.length), zs, c };
}

// Mesure son contre z, pour vérifier que le son de la salle n'abîme pas le z :
// des chiffres seulement (niveau, bits bruts, z du micro, z témoin de la graine)
function envoyerMesure(z, zs, c) {
  if (!code) return;
  const ua = navigator.userAgent;
  fetch('/api/mesure-micro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({
      essai: 'concert-' + code.toLowerCase(), appareil: APPAREIL, t: Date.now(),
      type: /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'autre',
      navigateur: source, micro: couperMicro?.entree?.nom || null, khz: couperMicro?.entree?.khz || null,
      zs: zs || [], zMicro: source === 'micro' ? z : null, zTemoin: eggZ(), ...(c || {}),
    }) }).catch(() => {});
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
  setStatus(`Vous participez${source === 'micro' ? ' par le micro' : ''} · ${code} · gardez cette page ouverte`);
  // Rappel une seule fois, pas a chaque reconnexion
  if (!noticeShown) {
    noticeShown = true;
    const notice = document.getElementById('notice');
    if (document.fullscreenEnabled) document.getElementById('plein-ecran').classList.remove('hidden');
    notice.classList.add('show');
    document.body.classList.add('avis');
    setTimeout(() => { notice.classList.remove('show'); document.body.classList.remove('avis'); }, 12000);
    montrer(60000);   // la premiere minute : on voit qu'on est arrive
  }
});

socket.on('collective:error', msg => {
  joined = false;
  document.body.classList.remove('connected');
  joinPanel.classList.remove('hidden');
  setStatus(msg, false);
});

// z de la seance (telephones + ordinateur du concert), affiche quand la sphere est visible
socket.on('collective:z-update', ({ collectiveZ }) => {
  if (joined && collectiveZ != null && isFinite(collectiveZ)) {
    document.getElementById('zvaleur').firstChild.textContent = collectiveZ.toFixed(2);
  }
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
  if (!joined || !socket.connected) return;
  const avant = source;
  const { z, zs, c } = zDeLaSeconde();
  if (avant === 'micro') envoyerMesure(z, zs, c);
  if (z != null) socket.emit('collective:z', { z });
}, 1000);

// Plein ecran au premier toucher : la barre du navigateur disparait (Android ;
// l'iPhone ne le permet pas pour une page web)
// Un toucher : la sphere et le z reviennent a peine quelques secondes (on voit
// qu'on est toujours en ligne), et plein ecran la ou c'est permis
document.addEventListener('click', e => {
  if (!joined || e.target.closest('.panel')) return;
  montrer(8000);
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
});

// Avec le micro, il faut un toucher : le code du QR est prérempli, on touche « Participer »
const participer = async () => { await ouvrirLeMicro(); join(codeInput.value); };
document.getElementById('btn-join').addEventListener('click', participer);
codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') participer(); });

const fromUrl = new URLSearchParams(location.search).get('code');
if (!AVEC_MICRO) document.querySelector('.micro-avis')?.remove();
if (fromUrl) { codeInput.value = fromUrl; if (!AVEC_MICRO) join(fromUrl); }
