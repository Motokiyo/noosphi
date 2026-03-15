// noosphi — Chart.js configuration (4 curves + toggles)

let chart24h = null;
let chartDistribution = null;

function initCharts() {
  const ctx24h = document.getElementById('chart-24h').getContext('2d');

  chart24h = new Chart(ctx24h, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Mondial (Princeton)',
          data: [],
          borderColor: '#6C63FF',
          backgroundColor: 'rgba(108, 99, 255, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8
        },
        {
          label: 'Ma machine (local)',
          data: [],
          borderColor: '#00E5FF',
          backgroundColor: 'rgba(0, 229, 255, 0.1)',
          borderWidth: 1.5,
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8
        },
        {
          label: 'Australie (ANU QRNG)',
          data: [],
          borderColor: '#FF8800',
          backgroundColor: 'rgba(255, 136, 0, 0.1)',
          borderWidth: 1.5,
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8
        },
        {
          label: 'Combine (Stouffer)',
          data: [],
          borderColor: '#CC44FF',
          backgroundColor: 'rgba(204, 68, 255, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8,
          hidden: true  // off by default
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false }, // we use our own toggles
        tooltip: {
          backgroundColor: 'rgba(10, 10, 26, 0.95)',
          titleColor: '#e8e8f0',
          bodyColor: '#8888aa',
          borderColor: 'rgba(108, 99, 255, 0.3)',
          borderWidth: 1,
          padding: 12,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
          filter: (item) => item.dataset.hidden !== true
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#555570', font: { size: 10, family: 'Inter' }, maxTicksLimit: 12 }
        },
        y: {
          min: -3.5,
          max: 3.5,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#555570',
            font: { size: 10, family: 'Inter' },
            callback: v => v.toFixed(1)
          }
        }
      }
    },
    plugins: [{
      id: 'zBands',
      beforeDraw(chart) {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { y } } = chart;
        const bands = [
          { from: -1, to: 1, color: 'rgba(0, 204, 102, 0.04)' },
          { from: 1, to: 1.5, color: 'rgba(204, 204, 0, 0.04)' },
          { from: -1.5, to: -1, color: 'rgba(204, 204, 0, 0.04)' },
          { from: 1.5, to: 2, color: 'rgba(255, 136, 0, 0.04)' },
          { from: -2, to: -1.5, color: 'rgba(255, 136, 0, 0.04)' },
          { from: 2, to: 3.5, color: 'rgba(255, 34, 0, 0.04)' },
          { from: -3.5, to: -2, color: 'rgba(255, 34, 0, 0.04)' },
        ];
        ctx.save();
        for (const band of bands) {
          const yTop = y.getPixelForValue(band.to);
          const yBottom = y.getPixelForValue(band.from);
          ctx.fillStyle = band.color;
          ctx.fillRect(left, Math.min(yTop, yBottom), right - left, Math.abs(yBottom - yTop));
        }
        const yZero = y.getPixelForValue(0);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(left, yZero);
        ctx.lineTo(right, yZero);
        ctx.stroke();
        ctx.restore();
      }
    }]
  });

  // Wire up curve toggles
  document.querySelectorAll('.curve-toggle input').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.curve);
      chart24h.data.datasets[idx].hidden = !cb.checked;
      chart24h.update();
    });
  });

  // --- Distribution bar chart ---
  const ctxDist = document.getElementById('chart-distribution').getContext('2d');
  chartDistribution = new Chart(ctxDist, {
    type: 'bar',
    data: {
      labels: Array.from({ length: 32 }, (_, i) => (i * 8).toString()),
      datasets: [{
        label: 'Distribution octets (bins x8)',
        data: new Array(32).fill(0),
        backgroundColor: 'rgba(108, 99, 255, 0.5)',
        borderColor: 'rgba(108, 99, 255, 0.8)',
        borderWidth: 1,
        borderRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#555570', font: { size: 9, family: 'Inter' }, maxTicksLimit: 8 }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#555570', font: { size: 9, family: 'Inter' } }
        }
      }
    }
  });
}

// Add a data point to all 4 curves at once
function addChartPoint(time, zGCP, zLocal, zQRNG, zCombined) {
  const label = new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  chart24h.data.labels.push(label);
  chart24h.data.datasets[0].data.push(zGCP);
  chart24h.data.datasets[1].data.push(zLocal);
  chart24h.data.datasets[2].data.push(zQRNG);
  chart24h.data.datasets[3].data.push(zCombined);

  // Keep max 1440 points (24h)
  if (chart24h.data.labels.length > 1440) {
    chart24h.data.labels.shift();
    chart24h.data.datasets.forEach(ds => ds.data.shift());
  }
  chart24h.update();
}

function updateDistribution(bytes) {
  const bins = new Array(32).fill(0);
  for (const b of bytes) bins[Math.floor(b / 8)]++;
  chartDistribution.data.datasets[0].data = bins;
  chartDistribution.update();
}
