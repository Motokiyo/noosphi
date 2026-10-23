// Noosféérique · Chart.js (historique en direct + distribution de cet appareil)
// Courbes : 0 réunies, 1 Noosféérique, 2 QCI, 3 cet appareil, 4 NIST

let chart24h = null;
let chartDistribution = null;

const POLICE = 'Inter';
const GRAD_TICKS = { color: 'rgba(255,255,255,0.4)', font: { size: 10, family: POLICE } };

function courbe(label, couleur, epaisseur) {
  return {
    label, data: [], borderColor: couleur, backgroundColor: couleur,
    borderWidth: epaisseur, fill: false, tension: 0.3,
    pointRadius: 0, pointHitRadius: 8, spanGaps: true
  };
}

function initCharts() {
  chart24h = new Chart(document.getElementById('chart-24h').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        courbe('Réunies', '#F5F5F2', 2),
        courbe('Noosféérique', '#4EC9C6', 1.2),
        courbe('QCI', '#C9A24D', 1.2),
        courbe('Cet appareil', '#8FA3B8', 1.2),
        courbe('NIST', '#9C8FB8', 1.2)
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(21, 26, 36, 0.96)',
          titleColor: 'rgba(255,255,255,0.9)',
          bodyColor: 'rgba(255,255,255,0.7)',
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: POLICE, weight: '500' },
          bodyFont: { family: POLICE },
          callbacks: { label: c => `${c.dataset.label} : ${c.parsed.y == null ? '--' : c.parsed.y.toFixed(2).replace('.', ',')}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { ...GRAD_TICKS, maxTicksLimit: 8, maxRotation: 0 } },
        y: {
          min: -4, max: 4,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { ...GRAD_TICKS, callback: v => String(v).replace('-', '−') }
        }
      }
    },
    plugins: [{
      // Ligne du zéro pleine, lignes pointillées à ±1,96 (limite du hasard ordinaire)
      id: 'seuils',
      beforeDraw(chart) {
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        const trace = (v, couleur, tirets) => {
          const py = y.getPixelForValue(v);
          ctx.save();
          ctx.strokeStyle = couleur; ctx.lineWidth = 1; ctx.setLineDash(tirets);
          ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
          ctx.restore();
        };
        trace(0, 'rgba(255,255,255,0.25)', []);
        trace(1.96, 'rgba(255,255,255,0.22)', [4, 4]);
        trace(-1.96, 'rgba(255,255,255,0.22)', [4, 4]);
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `10px ${POLICE}`; ctx.textAlign = 'right';
        ctx.fillText('+1,96', right - 4, y.getPixelForValue(1.96) - 4);
        ctx.fillText('−1,96', right - 4, y.getPixelForValue(-1.96) + 12);
        ctx.restore();
      }
    }]
  });

  // Légende cliquable : masque ou montre une courbe
  document.querySelectorAll('#legende button').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.curve);
      const visible = chart24h.isDatasetVisible(i);
      chart24h.setDatasetVisibility(i, !visible);
      btn.classList.toggle('off', visible);
      chart24h.update();
    });
  });

  // Distribution des 1000 derniers octets de cet appareil, 16 colonnes
  chartDistribution = new Chart(document.getElementById('chart-distribution').getContext('2d'), {
    type: 'bar',
    data: {
      labels: Array.from({ length: 16 }, (_, i) => `${i * 16}`),
      datasets: [{
        data: new Array(16).fill(0),
        backgroundColor: 'rgba(245,245,242,0.55)',
        borderWidth: 0,
        borderRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(21, 26, 36, 0.96)', bodyFont: { family: POLICE },
          titleFont: { family: POLICE },
          callbacks: {
            title: items => `Octets de ${items[0].label} à ${parseInt(items[0].label) + 15}`,
            label: c => `${c.parsed.y} tirages`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { ...GRAD_TICKS, font: { size: 9, family: POLICE } } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { ...GRAD_TICKS, font: { size: 9, family: POLICE } } }
      }
    }
  });
}

// Ajoute un point à toutes les courbes (null = pas de valeur)
function addChartPoint(time, z) {
  const label = new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  chart24h.data.labels.push(label);
  const ordre = ['combined', 'cicada', 'qci', 'local', 'nist'];
  ordre.forEach((k, i) => chart24h.data.datasets[i].data.push(z[k] ?? null));

  // 1440 points au plus (2 h à un point toutes les 5 s)
  if (chart24h.data.labels.length > 1440) {
    chart24h.data.labels.shift();
    chart24h.data.datasets.forEach(ds => ds.data.shift());
  }
  chart24h.update();
}

// bytes : les 1000 derniers octets de cet appareil
function updateDistribution(bytes) {
  const bins = new Array(16).fill(0);
  for (const b of bytes) bins[b >> 4]++;
  chartDistribution.data.datasets[0].data = bins;
  chartDistribution.update();
}
