const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3000;

// --- In-memory cache for 24h history ---
const gcpHistory = [];
const MAX_HISTORY = 1440; // 24h at 1 point/min

// --- Cache for rate-limited APIs ---
let anuCache = { data: null, ts: 0 };
let nistCache = { data: null, ts: 0 };
const ANU_CACHE_TTL = 300_000;  // 5 min (ANU rate limit: 1 req/min)
const NIST_CACHE_TTL = 60_000;  // 1 min

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));

// === HELPERS ===

function parseGCPData(text) {
  // GCP returns XML: <gcpstats><serverTime>UNIX</serverTime><ss><s t='TS'>P_VALUE</s>...</ss></gcpstats>
  const timeMatch = text.match(/<serverTime>(\d+)<\/serverTime>/);
  const serverTime = timeMatch ? parseInt(timeMatch[1]) : null;

  const pValues = [];
  const regex = /<s t='(\d+)'>([\d.]+)<\/s>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    pValues.push(parseFloat(match[2]));
  }

  // Fallback: try plain text format (timestamp + concatenated floats)
  if (pValues.length === 0) {
    const floatRegex = /0\.\d+/g;
    while ((match = floatRegex.exec(text)) !== null) {
      pValues.push(parseFloat(match[0]));
    }
  }

  return { serverTime, pValues };
}

function inverseNormalCDF(p) {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  if (p === 0.5) return 0;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

function stoufferZ(pValues) {
  const zScores = pValues.map(p => inverseNormalCDF(p)).filter(z => isFinite(z));
  if (zScores.length === 0) return 0;
  return zScores.reduce((a, b) => a + b, 0) / Math.sqrt(zScores.length);
}

function zToColor(z) {
  const abs = Math.abs(z);
  if (abs < 1.0) return '#00CC66';
  if (abs < 1.5) return '#CCCC00';
  if (abs < 2.0) return '#FF8800';
  return '#FF2200';
}

function zToLabel(z) {
  const abs = Math.abs(z);
  if (abs < 1.0) return 'Coherence normale';
  if (abs < 1.5) return 'Coherence notable';
  if (abs < 2.0) return 'Coherence significative';
  return 'Anomalie detectee';
}

// === API ROUTES ===

// 1. GCP Proxy
app.get('/api/gcp', async (req, res) => {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('https://global-mind.org/gcpdot/gcpindex.php', {
      signal: controller.signal,
      headers: { 'User-Agent': 'noosphi-proto/0.1' }
    });
    clearTimeout(timeout);
    const text = await response.text();
    const latency = Date.now() - t0;

    const parsed = parseGCPData(text);
    if (!parsed) return res.status(502).json({ error: 'Failed to parse GCP data' });

    // Each value from GCP is the network-wide statistic for one second,
    // already combining all ~60 EGGs. Use the LAST value (most recent)
    // as the current z-index, NOT a Stouffer combination of all seconds.
    const lastP = parsed.pValues[parsed.pValues.length - 1];
    const z = inverseNormalCDF(lastP);
    const result = {
      serverTime: parsed.serverTime,
      eggsCount: parsed.pValues.length,
      pValues: parsed.pValues,
      lastPValue: lastP,
      zIndex: parseFloat(z.toFixed(4)),
      color: zToColor(z),
      label: zToLabel(z),
      status: 'ok',
      latency
    };

    // Store in history
    gcpHistory.push({ t: Date.now(), z: result.zIndex });
    if (gcpHistory.length > MAX_HISTORY) gcpHistory.shift();

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message, status: 'down', latency: Date.now() - t0 });
  }
});

// GCP 24h history
app.get('/api/gcp/history', (req, res) => {
  res.json(gcpHistory);
});

// 2. ANU QRNG Proxy (replaces ETH Zurich which is down)
app.get('/api/qrng', async (req, res) => {
  const t0 = Date.now();

  // Check cache
  if (anuCache.data && (Date.now() - anuCache.ts) < ANU_CACHE_TTL) {
    return res.json({ ...anuCache.data, cached: true, latency: 0 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      'https://qrng.anu.edu.au/API/jsonI.php?length=100&type=uint8',
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = await response.json();
    const latency = Date.now() - t0;

    if (!data.success) throw new Error('ANU API returned success=false');

    const bytes = data.data;
    const mean = (bytes.reduce((a, b) => a + b, 0) / bytes.length).toFixed(2);
    const result = {
      source: 'ANU QRNG (Photonic)',
      type: data.type,
      count: data.length,
      data: bytes,
      mean,
      status: 'ok',
      latency,
      cached: false
    };

    anuCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    // Fallback: use NIST Beacon data as quantum source
    try {
      const nistRes = await fetch('https://beacon.nist.gov/beacon/2.0/pulse/last', {
        signal: AbortSignal.timeout(8000)
      });
      const nistData = await nistRes.json();
      const hexStr = nistData.pulse.localRandomValue;
      const bytes = [];
      for (let i = 0; i < Math.min(hexStr.length, 200); i += 2) {
        bytes.push(parseInt(hexStr.substring(i, i + 2), 16));
      }
      const mean = (bytes.reduce((a, b) => a + b, 0) / bytes.length).toFixed(2);
      const result = {
        source: 'NIST Beacon (fallback)',
        type: 'uint8',
        count: bytes.length,
        data: bytes,
        mean,
        status: 'ok',
        latency: Date.now() - t0,
        cached: false,
        fallback: true
      };
      anuCache = { data: result, ts: Date.now() };
      res.json(result);
    } catch (nistErr) {
      res.status(502).json({ error: err.message, source: 'ANU QRNG', status: 'down', latency: Date.now() - t0 });
    }
  }
});

// 3. NIST Beacon 2.0
app.get('/api/nist-beacon', async (req, res) => {
  const t0 = Date.now();

  if (nistCache.data && (Date.now() - nistCache.ts) < NIST_CACHE_TTL) {
    return res.json({ ...nistCache.data, cached: true, latency: 0 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      'https://beacon.nist.gov/beacon/2.0/pulse/last',
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = await response.json();
    const latency = Date.now() - t0;

    const pulse = data.pulse;
    // Convert hex string to byte array (first 100 bytes)
    const hexStr = pulse.localRandomValue;
    const bytes = [];
    for (let i = 0; i < Math.min(hexStr.length, 200); i += 2) {
      bytes.push(parseInt(hexStr.substring(i, i + 2), 16));
    }
    const mean = (bytes.reduce((a, b) => a + b, 0) / bytes.length).toFixed(2);

    const result = {
      source: 'NIST Beacon 2.0',
      pulseIndex: pulse.pulseIndex,
      timestamp: pulse.timeStamp,
      count: bytes.length,
      data: bytes,
      mean,
      status: 'ok',
      latency,
      cached: false
    };

    nistCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message, source: 'NIST Beacon', status: 'down', latency: Date.now() - t0 });
  }
});

// 4. Local RNG (Node.js crypto)
function getDeviceName() {
  const os = require('os');
  const p = process.platform;
  const a = process.arch;
  const hostname = os.hostname().replace(/\.local$/, '');

  let type;
  if (p === 'darwin') {
    type = a === 'arm64' ? 'Mac Apple Silicon' : 'Mac Intel';
  } else if (p === 'win32') {
    type = 'PC Windows';
  } else if (p === 'linux') {
    // Check for Android (Termux) or common SBC
    if (a === 'arm64' || a === 'arm') {
      const model = os.cpus()[0]?.model || '';
      if (process.env.ANDROID_ROOT || process.env.TERMUX_VERSION) type = 'Android';
      else if (model.toLowerCase().includes('raspberry')) type = 'Raspberry Pi';
      else type = 'Linux ARM';
    } else {
      type = 'PC Linux';
    }
  } else if (p === 'android') {
    type = 'Android';
  } else {
    type = p + ' ' + a;
  }

  return { type, hostname, platform: p, arch: a };
}

app.get('/api/local-rng', (req, res) => {
  const t0 = Date.now();
  const count = 1000;
  const buffer = crypto.randomBytes(count);
  const bytes = Array.from(buffer);

  const mean = (bytes.reduce((a, b) => a + b, 0) / bytes.length).toFixed(2);
  const variance = bytes.reduce((a, b) => a + Math.pow(b - parseFloat(mean), 2), 0) / bytes.length;
  const stddev = Math.sqrt(variance).toFixed(2);

  // Chi-square test
  const bins = new Array(256).fill(0);
  for (const b of bytes) bins[b]++;
  const expected = count / 256;
  let chiSq = 0;
  for (let i = 0; i < 256; i++) {
    chiSq += Math.pow(bins[i] - expected, 2) / expected;
  }
  // Wilson-Hilferty z-score approximation for chi-square
  const k = 255;
  const chiZ = (Math.pow(chiSq / k, 1/3) - (1 - 2/(9*k))) / Math.sqrt(2/(9*k));

  const device = getDeviceName();
  res.json({
    source: 'Local RNG (crypto)',
    device: device.type,
    hostname: device.hostname,
    platform: device.platform + ' ' + device.arch,
    count,
    data: bytes.slice(0, 100), // Send first 100 for visualization
    mean,
    stddev,
    chiSquare: chiSq.toFixed(2),
    zScore: chiZ.toFixed(4),
    status: 'ok',
    latency: Date.now() - t0
  });
});

// 5. Status of all sources
app.get('/api/status', async (req, res) => {
  const sources = {};

  // GCP
  try {
    const t0 = Date.now();
    const r = await fetch('https://global-mind.org/gcpdot/gcpindex.php', {
      signal: AbortSignal.timeout(5000)
    });
    sources.gcp = { status: r.ok ? 'up' : 'down', latency: Date.now() - t0, name: 'GCP 1.0 (Princeton)' };
  } catch { sources.gcp = { status: 'down', latency: -1, name: 'GCP 1.0 (Princeton)' }; }

  // ANU
  try {
    const t0 = Date.now();
    const r = await fetch('https://qrng.anu.edu.au/API/jsonI.php?length=1&type=uint8', {
      signal: AbortSignal.timeout(5000)
    });
    sources.anu = { status: r.ok ? 'up' : 'down', latency: Date.now() - t0, name: 'ANU QRNG (Photonic)' };
  } catch { sources.anu = { status: 'down', latency: -1, name: 'ANU QRNG (Photonic)' }; }

  // NIST
  try {
    const t0 = Date.now();
    const r = await fetch('https://beacon.nist.gov/beacon/2.0/pulse/last', {
      signal: AbortSignal.timeout(5000)
    });
    sources.nist = { status: r.ok ? 'up' : 'down', latency: Date.now() - t0, name: 'NIST Beacon 2.0' };
  } catch { sources.nist = { status: 'down', latency: -1, name: 'NIST Beacon 2.0' }; }

  // Local is always up
  sources.local = { status: 'up', latency: 0, name: 'Local RNG (crypto)' };

  const upCount = Object.values(sources).filter(s => s.status === 'up').length;
  res.json({ sources, upCount, total: 4 });
});

// === START ===
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║         noos\u03C6 — Prototype Dashboard       ║
  ║                                           ║
  ║   http://localhost:${PORT}                   ║
  ║                                           ║
  ║   Sources: GCP + ANU QRNG + NIST + Local  ║
  ╚═══════════════════════════════════════════╝
  `);
});
