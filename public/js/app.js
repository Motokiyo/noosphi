// noosphi — Main application logic (tableau de bord)
//
// Sources : cet appareil (generateur du serveur), QCI, NIST Beacon (une pulsation
// par minute), Noosfeerique (cle Cicada). Princeton : collecte arretee le
// 03/04/2026, plus interrogee. ANU : retiree (payante).

const state = {
  zLocal: null,
  zNIST: null,
  zQCI: null,
  zCicada: null,
  zCombined: null,
  enabled: { gcp: false, local: true, nist: true, qci: true, cicada: true, combined: true }
};
const ARRETEES = ['gcp'];
const NOMS = { local: 'Local', nist: 'NIST', qci: 'QCI', cicada: 'Noosféérique' };

// --- Helpers ---
function setText(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) { child.textContent = text; return; }
  }
  const tn = document.createTextNode(text);
  el.firstChild ? el.insertBefore(tn, el.firstChild) : el.appendChild(tn);
}
const fini = v => v != null && isFinite(v);

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  initSourceRows();
  initFermer();

  // Princeton : collecte arretee, on ne l'interroge plus
  updateSourceCard('gcp', 'arretee', { lat: '--', eggs: '--', pmean: '--' });
  setText('eggs-count', 'Princeton : collecte arrêtée le 03/04/2026 ');

  fetchLocalRNG();
  fetchNIST();
  fetchQCI();
  fetchCicada();

  setInterval(fetchLocalRNG, 30_000);
  setInterval(fetchNIST, 20_000);     // une pulsation par minute, regardee toutes les 20 s
  setInterval(fetchQCI, 10_000);      // le quota QCI est partage avec l'experience : on reste sobre
  setInterval(fetchCicada, 2_000);
  setInterval(pushChartPoint, 5_000); // le graphique vit en continu
});

// --- Croix de fermeture : retour a l'experience, avec les parametres d'URL (?midi=1…) ---
function initFermer() {
  const croix = document.getElementById('dashboard-fermer');
  if (croix) croix.href = 'experience.html' + location.search;
}

// --- Source row switches ---
function initSourceRows() {
  document.querySelectorAll('.source-row').forEach(row => {
    const curveIdx = parseInt(row.dataset.curve);
    const sourceKey = row.dataset.source;
    const cb = row.querySelector('input[type="checkbox"]');

    // Princeton : a sa place, eteinte et grisee, avec la date de l'arret
    if (ARRETEES.includes(sourceKey)) {
      cb.checked = false;
      cb.disabled = true;
      row.classList.add('disabled', 'desactivee');
      row.title = 'Princeton · collecte arrêtée le 03/04/2026';
    }
    // Chaque courbe suit son interrupteur des le chargement
    if (chart24h.data.datasets[curveIdx]) chart24h.data.datasets[curveIdx].hidden = !cb.checked;

    cb.addEventListener('change', () => {
      state.enabled[sourceKey] = cb.checked;
      row.classList.toggle('disabled', !cb.checked);

      // Toggle chart curve visibility
      if (chart24h.data.datasets[curveIdx]) {
        chart24h.data.datasets[curveIdx].hidden = !cb.checked;
        chart24h.update();
      }

      // Recalc combined (only from enabled sources)
      recalcCombined();
      updateDotDisplay();
    });
  });
  if (chart24h) chart24h.update();
}

// --- Dot display: always shows the combined z of enabled sources ---
function updateDotDisplay() {
  const z = state.zCombined;
  const dot = document.getElementById('gcp-dot');
  const ring = document.getElementById('gcp-ring');
  const mainVal = document.getElementById('z-main-value');
  const label = document.getElementById('z-label');
  const sublabel = document.getElementById('z-sublabel');

  if (!fini(z)) {
    mainVal.textContent = '--';
    mainVal.style.color = 'var(--text-muted)';
    label.textContent = 'En attente des sources...';
    dot.style.background = 'var(--text-muted)';
    dot.style.boxShadow = 'none';
    ring.style.borderColor = 'var(--border)';
    return;
  }

  const info = zToColor(z);
  mainVal.textContent = z.toFixed(3);
  mainVal.style.color = info.color;
  label.textContent = info.label;
  sublabel.textContent = `Combiné : ${sourcesActives().map(k => k === 'local' ? (state.deviceName || 'Local') : NOMS[k]).join(' + ') || 'aucune source active'}`;

  dot.style.background = info.color;
  dot.style.boxShadow = `0 0 40px ${info.color}66, 0 0 80px ${info.color}26`;
  ring.style.borderColor = `${info.color}33`;
}

// Les sources cochees qui ont une valeur
const valeurs = () => ({ local: state.zLocal, nist: state.zNIST, qci: state.zQCI, cicada: state.zCicada });
function sourcesActives() {
  const v = valeurs();
  return Object.keys(v).filter(k => state.enabled[k] && fini(v[k]));
}

// --- Update z-values in source rows ---
function updateRowZ() {
  const pairs = [
    ['z-row-local', state.zLocal],
    ['z-row-nist', state.zNIST],
    ['z-row-qci', state.zQCI],
    ['z-row-cicada', state.zCicada],
    ['z-row-combined', state.zCombined],
    ['z-card-qci', state.zQCI],
    ['z-card-cicada', state.zCicada]
  ];
  for (const [id, val] of pairs) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (fini(val)) {
      el.textContent = val.toFixed(4);
      el.style.color = zToColor(val).color;
    } else {
      el.textContent = '--';
      el.style.color = 'var(--text-muted)';
    }
  }

  // Also bottom panel
  const ids = [['z-src-local','zLocal'],['z-src-nist','zNIST'],['z-src-qci','zQCI'],['z-src-cicada','zCicada'],['z-combined-final','zCombined']];
  for (const [id, key] of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const v = state[key];
    el.textContent = fini(v) ? v.toFixed(4) : '--';
    el.style.color = fini(v) ? zToColor(v).color : 'var(--text-muted)';
  }
}

// --- Recalc combined from enabled sources only ---
function recalcCombined() {
  const v = valeurs();
  const actives = sourcesActives();
  const zValues = actives.map(k => v[k]);

  state.zCombined = zValues.length > 0
    ? parseFloat((zValues.reduce((a, b) => a + b, 0) / Math.sqrt(zValues.length)).toFixed(4))
    : null;

  // (innerHTML sans risque : uniquement les noms constants des sources)
  const formule = document.getElementById('formula-display');
  if (formule) formule.innerHTML = zValues.length
    ? `Z<sub>combiné</sub> = (${actives.map(k => `z<sub>${NOMS[k]}</sub>`).join(' + ')}) / &radic;${zValues.length}`
    : 'Z<sub>combiné</sub> : aucune source active';

  updateRowZ();
}

// --- Push chart point (courbes : Princeton, local, NIST, combine) ---
function pushChartPoint() {
  addChartPoint(
    Date.now(),
    null,
    fini(state.zLocal) ? state.zLocal : null,
    fini(state.zNIST) ? state.zNIST : null,
    fini(state.zCombined) ? state.zCombined : null
  );
  document.getElementById('chart-points').textContent = `${chart24h.data.labels.length} pts`;
  document.getElementById('update-time').textContent = `MAJ: ${new Date().toLocaleTimeString('fr-FR')}`;
}

// === FETCH FUNCTIONS ===
// Une source qui ne repond pas n'est pas une erreur : sa carte passe « indisponible ».

async function fetchNIST() {
  try {
    const data = await fetch('/api/nist-beacon').then(r => r.json());
    if (data.status !== 'ok' || !fini(data.zIndex)) throw new Error('indisponible');
    state.zNIST = data.zIndex;
    updateSourceCard('nist', 'up', {
      lat: data.cached ? 'cache' : `${data.latency}ms`,
      pulse: data.pulseIndex ? `#${data.pulseIndex}` : '--',
      mean: data.mean
    });
  } catch {
    state.zNIST = null;
    updateSourceCard('nist', 'down', { lat: '--', pulse: '--', mean: '--' });
  }
  recalcCombined();
  updateDotDisplay();
}

async function fetchQCI() {
  try {
    const data = await fetch('/api/qci').then(r => r.json());
    if (data.status !== 'ok' || !fini(data.zIndex)) throw new Error('indisponible');
    state.zQCI = data.zIndex;
    updateSourceCard('qci', 'up', {});
  } catch {
    state.zQCI = null;
    updateSourceCard('qci', 'down', {});
  }
  recalcCombined();
  updateDotDisplay();
}

async function fetchCicada() {
  try {
    const data = await fetch('/api/cicada').then(r => r.json());
    if (data.status !== 'ok' || !fini(data.zIndex)) throw new Error(data.etat || 'indisponible');
    state.zCicada = data.zIndex;
    updateSourceCard('cicada', 'up', {});
  } catch (err) {
    state.zCicada = null;
    updateSourceCard('cicada', err.message === 'reservee' ? 'reservee' : 'down', {});
  }
  recalcCombined();
  updateDotDisplay();
}

async function fetchLocalRNG() {
  try {
    const data = await fetch('/api/local-rng').then(r => r.json());
    if (data.status !== 'ok') throw new Error(data.error || 'indisponible');

    // le serveur donne le z EGG dans zIndex (l'ancien champ zScore n'existe plus)
    const z = parseFloat(data.zIndex ?? data.zScore);
    state.zLocal = fini(z) ? z : null;
    updateSourceCard('local', 'up', { lat: `${data.latency}ms`, count: data.count, mean: data.mean });

    // Update device name dynamically
    if (data.device && !state.deviceName) state.deviceName = data.device;
    if (data.device) {
      const devLabel = document.getElementById('local-device-name');
      if (devLabel) devLabel.textContent = `(${data.device})`;
      const cardName = document.getElementById('card-local-name');
      if (cardName) cardName.textContent = data.device;
      const cardDesc = document.getElementById('card-local-desc');
      if (cardDesc) cardDesc.textContent = `RNG de ${data.hostname || 'cet appareil'} (bruit thermique)`;
    }

    if (data.data) updateDistribution(data.data);
  } catch {
    state.zLocal = null;
    updateSourceCard('local', 'down', { lat: '--', count: '--', mean: '--' });
  }
  recalcCombined();
  updateDotDisplay();
}

// === SOURCE CARD UPDATE ===

const ETIQUETTES = { up: 'ACTIVE', down: 'INDISPONIBLE', arretee: 'ARRÊTÉE', reservee: 'RÉSERVÉE' };

function updateSourceCard(source, status, stats) {
  const statusEl = document.getElementById(`status-${source}`);
  if (!statusEl) return;
  statusEl.className = `source-status ${status}`;
  statusEl.querySelector('span').textContent = ETIQUETTES[status] || status.toUpperCase();
  document.getElementById(`card-${source}`)?.classList.toggle('source-eteinte', status !== 'up');

  const ids = {
    gcp:   ['lat-gcp', 'eggs-gcp', 'pmean-gcp'],
    nist:  ['lat-nist', 'pulse-nist', 'mean-nist'],
    local: ['lat-local', 'count-local', 'mean-local']
  };
  const keys = { gcp: ['lat','eggs','pmean'], nist: ['lat','pulse','mean'], local: ['lat','count','mean'] };

  (keys[source] || []).forEach((key, i) => {
    const el = document.getElementById(ids[source]?.[i]);
    if (el && stats[key] !== undefined) el.textContent = stats[key];
  });

  updateGlobalStatus();
}

// Le badge du haut : les sources qui repondent, sur celles qu'on interroge
function updateGlobalStatus() {
  const suivies = ['local', 'nist', 'qci', 'cicada'];
  let up = 0;
  for (const s of suivies) {
    const el = document.getElementById(`status-${s}`);
    if (el && el.classList.contains('up')) up++;
  }
  document.getElementById('status-text').textContent = `${up}/${suivies.length} sources actives`;
  const badge = document.getElementById('global-status');
  badge.className = 'status-badge' + (up === suivies.length ? ' up' : up > 0 ? ' partial' : ' down');
}
