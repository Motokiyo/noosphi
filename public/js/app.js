// noosphi — Main application logic

const state = {
  zGCP: null,
  zLocal: null,
  zQRNG: null,
  zCombined: null,
  enabled: { gcp: true, local: true, qrng: true, combined: true }
};

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

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  initSourceRows();

  fetchGCP();
  fetchLocalRNG();
  fetchQRNG();
  fetchNIST();

  setInterval(fetchGCP, 60_000);
  setInterval(fetchLocalRNG, 30_000);
  setInterval(fetchQRNG, 120_000);
  setInterval(fetchNIST, 60_000);
});

// --- Source row switches ---
function initSourceRows() {
  document.querySelectorAll('.source-row').forEach(row => {
    const curveIdx = parseInt(row.dataset.curve);
    const sourceKey = row.dataset.source;
    const cb = row.querySelector('input[type="checkbox"]');

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
}

// --- Dot display: always shows the combined z of enabled sources ---
function updateDotDisplay() {
  const z = state.zCombined;
  const dot = document.getElementById('gcp-dot');
  const ring = document.getElementById('gcp-ring');
  const mainVal = document.getElementById('z-main-value');
  const label = document.getElementById('z-label');
  const sublabel = document.getElementById('z-sublabel');

  if (z === null) {
    mainVal.textContent = '--';
    mainVal.style.color = 'var(--text-muted)';
    label.textContent = 'En attente...';
    return;
  }

  const info = zToColor(z);
  mainVal.textContent = z.toFixed(3);
  mainVal.style.color = info.color;
  label.textContent = info.label;

  // Build sublabel from enabled sources
  const names = [];
  if (state.enabled.gcp) names.push('Princeton');
  if (state.enabled.local) names.push('MacBook');
  if (state.enabled.qrng) names.push('Australie');
  sublabel.textContent = names.length > 0
    ? `Combine : ${names.join(' + ')}`
    : 'Aucune source active';

  dot.style.background = info.color;
  dot.style.boxShadow = `0 0 40px ${info.color}66, 0 0 80px ${info.color}26`;
  ring.style.borderColor = `${info.color}33`;
}

// --- Update z-values in source rows ---
function updateRowZ() {
  const pairs = [
    ['z-row-gcp', state.zGCP],
    ['z-row-local', state.zLocal],
    ['z-row-qrng', state.zQRNG],
    ['z-row-combined', state.zCombined]
  ];
  for (const [id, val] of pairs) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (val !== null) {
      el.textContent = val.toFixed(4);
      el.style.color = zToColor(val).color;
    } else {
      el.textContent = '--';
      el.style.color = 'var(--text-muted)';
    }
  }

  // Also bottom panel
  const ids = [['z-src-gcp','zGCP'],['z-src-qrng','zQRNG'],['z-src-local','zLocal'],['z-combined-final','zCombined']];
  for (const [id, key] of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const v = state[key];
    el.textContent = v !== null ? v : '--';
    if (v !== null) el.style.color = zToColor(v).color;
  }
}

// --- Recalc combined from enabled sources only ---
function recalcCombined() {
  const zValues = [];
  if (state.enabled.gcp && state.zGCP !== null) zValues.push(state.zGCP);
  if (state.enabled.qrng && state.zQRNG !== null) zValues.push(state.zQRNG);
  if (state.enabled.local && state.zLocal !== null) zValues.push(state.zLocal);

  state.zCombined = zValues.length > 0
    ? parseFloat((zValues.reduce((a, b) => a + b, 0) / Math.sqrt(zValues.length)).toFixed(4))
    : null;

  updateRowZ();
}

// --- Push chart point ---
function pushChartPoint() {
  addChartPoint(
    Date.now(),
    state.zGCP || 0,
    state.zLocal || 0,
    state.zQRNG || 0,
    state.zCombined || 0
  );
  document.getElementById('chart-points').textContent = `${chart24h.data.labels.length} pts`;
  document.getElementById('update-time').textContent = `MAJ: ${new Date().toLocaleTimeString('fr-FR')}`;
}

// === FETCH FUNCTIONS ===

async function fetchGCP() {
  try {
    const res = await fetch('/api/gcp');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.error || 'GCP error');

    state.zGCP = data.zIndex;
    setText('eggs-count', `${data.eggsCount} secondes `);

    const pMean = (data.pValues.reduce((a, b) => a + b, 0) / data.pValues.length).toFixed(4);
    updateSourceCard('gcp', 'up', { lat: `${data.latency}ms`, eggs: data.eggsCount, pmean: pMean });

    recalcCombined();
    updateDotDisplay();
    pushChartPoint();
  } catch (err) {
    console.error('GCP:', err);
    updateSourceCard('gcp', 'down', { lat: '--', eggs: '--', pmean: '--' });
  }
}

async function fetchQRNG() {
  try {
    const res = await fetch('/api/qrng');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.error || 'QRNG error');

    state.zQRNG = parseFloat(chiSquareFromBytes(data.data).toFixed(4));
    updateSourceCard('anu', 'up', {
      lat: data.cached ? 'cache' : `${data.latency}ms`,
      count: data.count,
      mean: data.mean
    });

    recalcCombined();
    updateDotDisplay();
  } catch (err) {
    console.error('QRNG:', err);
    updateSourceCard('anu', 'down', { lat: '--', count: '--', mean: '--' });
  }
}

async function fetchNIST() {
  try {
    const res = await fetch('/api/nist-beacon');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.error || 'NIST error');

    updateSourceCard('nist', 'up', {
      lat: data.cached ? 'cache' : `${data.latency}ms`,
      pulse: data.pulseIndex ? `#${data.pulseIndex}` : '--',
      mean: data.mean
    });
  } catch (err) {
    console.error('NIST:', err);
    updateSourceCard('nist', 'down', { lat: '--', pulse: '--', mean: '--' });
  }
}

async function fetchLocalRNG() {
  try {
    const res = await fetch('/api/local-rng');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.error || 'Local error');

    state.zLocal = parseFloat(data.zScore);
    updateSourceCard('local', 'up', { lat: `${data.latency}ms`, count: data.count, mean: data.mean });

    if (data.data) updateDistribution(data.data);
    recalcCombined();
    updateDotDisplay();
  } catch (err) {
    console.error('Local:', err);
    updateSourceCard('local', 'down', { lat: '--', count: '--', mean: '--' });
  }
}

// === SOURCE CARD UPDATE ===

function updateSourceCard(source, status, stats) {
  const statusEl = document.getElementById(`status-${source}`);
  if (!statusEl) return;
  statusEl.className = `source-status ${status}`;
  statusEl.querySelector('span').textContent = status.toUpperCase();

  const ids = {
    gcp:   ['lat-gcp', 'eggs-gcp', 'pmean-gcp'],
    anu:   ['lat-anu', 'count-anu', 'mean-anu'],
    nist:  ['lat-nist', 'pulse-nist', 'mean-nist'],
    local: ['lat-local', 'count-local', 'mean-local']
  };
  const keys = { gcp: ['lat','eggs','pmean'], anu: ['lat','count','mean'], nist: ['lat','pulse','mean'], local: ['lat','count','mean'] };

  (keys[source] || []).forEach((key, i) => {
    const el = document.getElementById(ids[source]?.[i]);
    if (el && stats[key] !== undefined) el.textContent = stats[key];
  });

  updateGlobalStatus();
}

function updateGlobalStatus() {
  let up = 0;
  for (const s of ['gcp', 'anu', 'nist', 'local']) {
    const el = document.getElementById(`status-${s}`);
    if (el && el.classList.contains('up')) up++;
  }
  document.getElementById('status-text').textContent = `${up}/4 sources actives`;
  const badge = document.getElementById('global-status');
  badge.className = 'status-badge' + (up === 4 ? ' up' : up > 0 ? ' partial' : ' down');
}
