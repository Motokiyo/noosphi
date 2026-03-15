// ============================================================
// noosphi -- Statistical functions for z-index computation
// ============================================================

/**
 * Inverse Normal CDF (quantile function)
 * Peter Acklam's rational approximation -- precision ~1.15e-9
 * Converts a p-value (0,1) to a z-score
 */
function inverseNormalCDF(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01,  2.209460984245205e+02,
    -2.759285104469687e+02,  1.383577518672690e+02,
    -3.066479806614716e+01,  2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,  1.615858368580409e+02,
    -1.556989798598866e+02,  6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
     4.374664141464968e+00,  2.938163982698783e+00
  ];
  const d = [
     7.784695709041462e-03,  3.224671290700398e-01,
     2.445134137142996e+00,  3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

/**
 * Normal CDF approximation (Abramowitz & Stegun)
 */
function normalCDF(z) {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
}

/**
 * Stouffer's Z method -- combine multiple p-values into one z-score
 */
function stoufferZ(pValues) {
  if (!pValues || pValues.length === 0) return 0;
  const zScores = pValues.map(p => inverseNormalCDF(p));
  const validZ = zScores.filter(z => isFinite(z));
  if (validZ.length === 0) return 0;
  const sum = validZ.reduce((a, b) => a + b, 0);
  return sum / Math.sqrt(validZ.length);
}

/**
 * Z-score to color mapping (GCP Dot convention)
 */
function zToColor(z) {
  const abs = Math.abs(z);
  if (abs < 1.0) return { color: '#00CC66', label: 'Normal', level: 0 };
  if (abs < 1.5) return { color: '#CCCC00', label: 'Notable', level: 1 };
  if (abs < 2.0) return { color: '#FF8800', label: 'Significatif', level: 2 };
  return { color: '#FF2200', label: 'Anomalie', level: 3 };
}

/**
 * Chi-square test on byte array against uniform distribution
 */
function chiSquareFromBytes(bytes) {
  // Adaptive binning: use fewer bins for small samples
  // Rule: at least 5 expected per bin for chi-square validity
  const n = bytes.length;
  let numBins = 256;
  while (n / numBins < 5 && numBins > 4) numBins = Math.floor(numBins / 2);
  const binSize = 256 / numBins;

  const bins = new Array(numBins).fill(0);
  for (const b of bytes) bins[Math.min(Math.floor(b / binSize), numBins - 1)]++;

  const expected = n / numBins;
  let chiSq = 0;
  for (let i = 0; i < numBins; i++) {
    chiSq += Math.pow(bins[i] - expected, 2) / expected;
  }

  // Wilson-Hilferty: chi-square(k df) -> z-score
  const k = numBins - 1;
  const z = (Math.pow(chiSq / k, 1/3) - (1 - 2/(9*k))) / Math.sqrt(2/(9*k));
  return z;
}

/**
 * Compute statistics on a byte array
 */
function byteStats(bytes) {
  const n = bytes.length;
  const mean = bytes.reduce((a, b) => a + b, 0) / n;
  const variance = bytes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);
  // Expected for uniform [0,255]: mean=127.5, stddev=73.9
  const meanZ = (mean - 127.5) / (73.9 / Math.sqrt(n));
  return { mean: mean.toFixed(2), stddev: stddev.toFixed(2), meanZ: meanZ.toFixed(3), n };
}
