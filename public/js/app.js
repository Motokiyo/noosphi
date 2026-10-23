// Noosféérique · Dashboard : logique de la page
//
// Sources : Noosféérique (clé Cicada), cet appareil (tirage fait ICI, dans le navigateur),
// QCI, NIST Beacon (une pulsation par minute). Princeton : collecte arrêtée le 03/04/2026.
// ANU : retirée.

const state = { zLocal: null, zNIST: null, zQCI: null, zCicada: null, zCombined: null };
const SOURCES = ['cicada', 'local', 'qci', 'nist'];
const NOMS = { local: 'Cet appareil', nist: 'NIST', qci: 'QCI', cicada: 'Noosféérique' };
const CLE_Z = { local: 'zLocal', nist: 'zNIST', qci: 'zQCI', cicada: 'zCicada' };

const fini = v => v != null && isFinite(v);
// 1,5 -> "1,50" ; -0,5 -> "−0,50" (virgule française, vrai signe moins)
const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',').replace('-', '−');

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  initTooltips();
  initLiens();
  initChoixLocal();

  fetchLocal();
  fetchNIST();
  fetchQCI();
  fetchCicada();

  setInterval(fetchLocal, 1_000);
  setInterval(fetchNIST, 20_000);     // une pulsation par minute, regardée toutes les 20 s
  setInterval(fetchQCI, 10_000);      // le quota QCI est partagé avec l'expérience
  setInterval(fetchCicada, 2_000);
  setInterval(pushChartPoint, 5_000);
  setTimeout(pushChartPoint, 1_500);
});

// Les liens gardent les paramètres d'URL (?midi=1…)
function initLiens() {
  for (const id of ['dashboard-fermer', 'lien-guide']) {
    const a = document.getElementById(id);
    if (a) a.href = '/experience.html' + location.search;
  }
}

// --- Info-bulles : une seule bulle, calée dans l'écran (survol, focus ou toucher) ---
function initTooltips() {
  const bulle = document.getElementById('tooltip');
  let courant = null;
  const montrer = el => {
    courant = el;
    bulle.textContent = el.dataset.tooltip;
    bulle.classList.add('on');
    const r = el.getBoundingClientRect();
    const w = bulle.offsetWidth, h = bulle.offsetHeight;
    let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = r.top - h - 8;
    bulle.style.left = `${x}px`;
    bulle.style.top = `${Math.max(8, y)}px`;
  };
  const cacher = () => { courant = null; bulle.classList.remove('on'); };
  document.querySelectorAll('.info-btn').forEach(el => {
    el.addEventListener('mouseenter', () => montrer(el));
    el.addEventListener('mouseleave', cacher);
    el.addEventListener('focus', () => montrer(el));
    el.addEventListener('blur', cacher);
    el.addEventListener('click', e => { e.preventDefault(); courant === el ? cacher() : montrer(el); });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.info-btn')) cacher(); });
  window.addEventListener('scroll', cacher, { passive: true });
}

// --- Réunion des sources (méthode de Stouffer) ---
const actives = () => SOURCES.filter(k => fini(state[CLE_Z[k]]));

function recalcCombined() {
  const act = actives();
  const zs = act.map(k => state[CLE_Z[k]]);
  state.zCombined = zs.length ? zs.reduce((a, b) => a + b, 0) / Math.sqrt(zs.length) : null;

  const f = document.getElementById('formula-display');
  if (zs.length) {
    const somme = zs.map((v, i) => i === 0 ? fmt(v) : (v < 0 ? `− ${fmt(-v)}` : `+ ${fmt(v)}`)).join(' ');
    f.textContent = `(${somme}) / √${zs.length} = ${fmt(state.zCombined)}`;
  } else {
    f.textContent = 'Aucune source disponible pour le moment';
  }
  updateRows();
  updateBig();
}

// --- Le grand z et sa lecture sur l'échelle unifiée ---
function updateBig() {
  const z = state.zCombined;
  const sphere = document.getElementById('sphere-mini');
  const val = document.getElementById('z-main-value');
  const lect = document.getElementById('z-label');
  if (!fini(z)) {
    val.textContent = '--';
    lect.textContent = 'En attente des sources';
    sphere.className = 'sphere-mini vide';
    return;
  }
  const info = zToColor(z);
  val.textContent = fmt(z);
  val.style.color = info.level === 0 ? '#fff' : info.color;
  lect.textContent = info.label;
  sphere.className = `sphere-mini niv-${info.level}`;
}

// --- Lignes des sources ---
function updateRows() {
  for (const k of SOURCES) {
    const v = state[CLE_Z[k]];
    const z = document.getElementById(`z-row-${k}`);
    const dot = document.getElementById(`dot-${k}`);
    if (fini(v)) {
      z.textContent = fmt(v);
      z.style.color = '#fff';
      dot.style.background = zToColor(v).color;
    } else {
      z.textContent = '--';
      z.style.color = 'var(--texte-3)';
      dot.style.background = 'rgba(255,255,255,0.2)';
    }
  }
}

function pushChartPoint() {
  addChartPoint(Date.now(), {
    combined: fini(state.zCombined) ? state.zCombined : null,
    cicada: fini(state.zCicada) ? state.zCicada : null,
    qci: fini(state.zQCI) ? state.zQCI : null,
    local: fini(state.zLocal) ? state.zLocal : null,
    nist: fini(state.zNIST) ? state.zNIST : null
  });
  document.getElementById('chart-points').textContent = `${chart24h.data.labels.length} points`;
  document.getElementById('update-time').textContent = `Mise à jour : ${new Date().toLocaleTimeString('fr-FR')}`;
}

// === Sources ===
// Une source qui ne répond pas n'est pas une erreur : sa ligne passe « indisponible ».

async function fetchNIST() {
  try {
    const data = await fetch('/api/nist-beacon').then(r => r.json());
    if (data.status !== 'ok' || !fini(data.zIndex)) throw new Error('indisponible');
    state.zNIST = data.zIndex;
    document.getElementById('pulse-nist').textContent = data.pulseIndex ? `n° ${data.pulseIndex}` : '--';
    setEtat('nist', 'up');
  } catch {
    state.zNIST = null;
    setEtat('nist', 'down');
  }
  recalcCombined();
}

async function fetchQCI() {
  try {
    const data = await fetch('/api/qci').then(r => r.json());
    if (data.status !== 'ok' || !fini(data.zIndex)) throw new Error('indisponible');
    state.zQCI = data.zIndex;
    setEtat('qci', 'up');
  } catch {
    state.zQCI = null;
    setEtat('qci', 'down');
  }
  recalcCombined();
}

async function fetchCicada() {
  try {
    const data = await fetch('/api/cicada').then(r => r.json());
    if (data.status !== 'ok' || !fini(data.zIndex)) throw new Error(data.etat || 'indisponible');
    state.zCicada = data.zIndex;
    setEtat('cicada', 'up');
  } catch (err) {
    state.zCicada = null;
    setEtat('cicada', err.message === 'reservee' ? 'reservee' : 'down');
  }
  recalcCombined();
}

// Cet appareil : tirage fait dans le navigateur, aucun appel au serveur.
// Même méthode EGG que l'expérience : 200 bits, z = (piles − 100) / √50,
// 10 essais réunis par Stouffer.
const SQRT_50 = Math.sqrt(50);
const ESSAIS = 10;
// Banc d'essai : « Cet appareil » tire soit de sa graine (le générateur calculé
// du navigateur), soit du souffle de son micro (micro.js). On compare les deux
// sur le même appareil. Le micro ne s'ouvre que sur un clic, et se coupe en
// revenant à la graine.
let modeLocal = 'graine';
let extracteur = null, couperMicro = null, secondesVides = 0;
function initChoixLocal() {
  const boutons = document.querySelectorAll('#choix-local button');
  const diag = document.getElementById('diag-local');
  const marquer = () => boutons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === modeLocal)));
  boutons.forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.mode === modeLocal) return;
    if (b.dataset.mode === 'micro') {
      diag.textContent = 'Autorisation du micro…';
      try {
        extracteur = NoosMicro.createExtracteur();
        couperMicro = await NoosMicro.ouvrirMicro(extracteur);
        modeLocal = 'micro';
        diag.textContent = 'Le micro sert seulement à lire son souffle électronique : rien n’est enregistré ni envoyé.';
      } catch (e) {
        extracteur = null;
        diag.textContent = 'Micro refusé ou indisponible : on reste sur la graine.';
      }
    } else {
      couperMicro?.(); couperMicro = null; extracteur = null;
      modeLocal = 'graine';
      diag.textContent = '';
    }
    document.getElementById('detail-local').textContent = modeLocal === 'micro'
      ? 'Le souffle électronique de votre micro, après toilette'
      : 'Le générateur de votre ordinateur ou téléphone';
    document.getElementById('titre-local').textContent = modeLocal === 'micro' ? 'DU MICRO DE CET APPAREIL' : 'DE CET APPAREIL';
    marquer();
  }));
  marquer();
}

// Une seconde de micro : jusqu'à 10 tirages de 200 bits, réunis par Stouffer
function tirerMicro() {
  const zs = extracteur.tirer(ESSAIS);
  const c = extracteur.controle();
  const pct = c.partUns == null ? '--' : fmt(100 * c.partUns, 1) + ' %';
  document.getElementById('diag-local').textContent =
    `Bits bruts : ${pct} de 1 (attendu 50 %) · ${c.bitsUtiles} bits utiles par seconde · ${zs.length} tirage${zs.length > 1 ? 's' : ''}` +
    (c.resolution ? ` · micro ${c.resolution} bits` : c.echantillons ? ' · silence numérique' : ' · aucun son reçu');
  const octets = extracteur.octets();
  if (octets.length) {
    let total = 0;
    for (const b of octets) total += b;
    document.getElementById('mean-local').textContent = fmt(total / octets.length);
    updateDistribution(octets);
  }
  // Une seconde creuse ne rend pas la source indisponible : le dernier z reste,
  // et il faut 5 secondes sans aucun tirage pour la dire muette
  if (!zs.length) {
    secondesVides++;
    if (secondesVides >= 5) { state.zLocal = null; setEtat('local', 'down'); }
    return;
  }
  secondesVides = 0;
  state.zLocal = zs.reduce((a, b) => a + b, 0) / Math.sqrt(zs.length);
  setEtat('local', 'up');
}

function fetchLocal() {
  if (modeLocal === 'micro' && extracteur) { tirerMicro(); recalcCombined(); return; }
  try {
    const octets = new Uint8Array(1000);
    // getRandomValues plafonne à 65 536 octets par appel : 1000 passe sans souci
    crypto.getRandomValues(octets);
    let zSomme = 0;
    for (let t = 0; t < ESSAIS; t++) {
      let piles = 0;
      for (let i = 0; i < 25; i++) {
        let b = octets[t * 25 + i];
        b = b - ((b >> 1) & 0x55);
        b = (b & 0x33) + ((b >> 2) & 0x33);
        piles += (b + (b >> 4)) & 0x0F;
      }
      zSomme += (piles - 100) / SQRT_50;
    }
    state.zLocal = zSomme / Math.sqrt(ESSAIS);
    let total = 0;
    for (const b of octets) total += b;
    document.getElementById('mean-local').textContent = fmt(total / octets.length);
    updateDistribution(octets);
    setEtat('local', 'up');
  } catch {
    state.zLocal = null;
    setEtat('local', 'down');
  }
  recalcCombined();
}

const ETIQUETTES = { up: 'active', down: 'indisponible', reservee: 'réservée' };
function setEtat(source, statut) {
  const el = document.getElementById(`status-${source}`);
  if (!el) return;
  el.className = `source-etat ${statut}`;
  el.querySelector('span').textContent = ETIQUETTES[statut] || statut;
  document.getElementById(`card-${source}`)?.classList.toggle('source-eteinte', statut !== 'up');
  updateGlobalStatus();
}

// La pilule du haut : les sources qui répondent, sur celles qu'on interroge
function updateGlobalStatus() {
  let up = 0;
  for (const s of SOURCES) {
    if (document.getElementById(`status-${s}`)?.classList.contains('up')) up++;
  }
  document.getElementById('status-text').textContent = `${up} source${up > 1 ? 's' : ''} sur ${SOURCES.length} répond${up > 1 ? 'ent' : ''}`;
  document.getElementById('global-status').className = 'pilule' + (up === SOURCES.length ? ' up' : up > 0 ? ' partial' : '');
}
