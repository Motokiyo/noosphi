/* ============================================================
   Noosfeerique — le rapport d'une seance
   Logique pure, sans navigateur : testable dans Node.

   Tout se refait a partir des secondes enregistrees (seance.js) :
   - chaque generateur pour lui seul (telephones sans cet ordi, cet ordi,
     Noosfeerique, QCI, NIST) : z de la seance (Stouffer), z moyen, min, max ;
   - la salle et le temoin, comme a l'ecran ;
   - le z commun : tous les generateurs ensemble, chaque tirage une fois ;
   - le z joue (ce qui est parti vers MainStage) : moyenne, min, max
     seulement, car une seconde le reprend souvent a la suivante.
   Le fichier HTML produit est autonome : il porte aussi les secondes (CSV)
   et la fiche (JSON), telechargeables depuis la page.
   ============================================================ */

import { SOURCES_RAPPORT, NOMS_RAPPORT, TEMOIN, stouffer, versCSV, versJSON } from './seance.js';

const fini = z => z != null && isFinite(z);

// Probabilite bilaterale d'un z sous le pur hasard (Abramowitz et Stegun 7.1.26)
export function pBilateral(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return Math.min(1, erfc);
}

// Ce que dit un z de seance, en clair
export function verdict(z) {
  if (!fini(z)) return 'pas de mesure';
  const a = Math.abs(z);
  if (a < 1.96) return 'dans le hasard';
  if (a < 3) return 'écart notable (moins d’une chance sur 20)';
  return 'écart fort (moins d’une chance sur 370)';
}

function stats(valeurs) {
  const v = valeurs.filter(fini);
  if (!v.length) return { n: 0, z: null, p: null, moyenne: null, min: null, max: null };
  const z = stouffer(v);
  return {
    n: v.length, z, p: pBilateral(z),
    moyenne: v.reduce((a, b) => a + b, 0) / v.length,
    min: Math.min(...v), max: Math.max(...v),
  };
}

// La maree au fil du temps : Stouffer cumule, un point par seconde
function cumul(lignes, valeursDe) {
  const pts = [];
  let somme = 0, n = 0;
  for (const l of lignes) {
    for (const v of valeursDe(l)) if (fini(v)) { somme += v; n++; }
    if (n) pts.push([l.t, somme / Math.sqrt(n)]);
  }
  return pts;
}

const valeursTemoin = l => TEMOIN.map(c => l.temoin?.[c]);
// Les trois mesures, dans l'ordre decide d'avance (la premiere est la principale) :
// 1. quantique : Noosfeerique (Cicada), et QCI seulement s'il etait dans la salle
//    (il reste au temoin, sauf evenement mondial) ;
// 2. graine : les generateurs calcules, telephones et ordinateurs ;
// 3. le melange : tout ce qui jouait ici (la salle).
const valeursQuantique = l => [l.brut?.cicada, (l.temoinActif || TEMOIN).includes('qci') ? null : l.brut?.qci];
const valeursGraine = l => [l.brut?.telephones, l.brut?.local];
const valeursCommun = l => SOURCES_RAPPORT.map(c => l.brut?.[c]);

export function calculerRapport(session) {
  const lignes = session.secondes || [];
  const sources = Object.fromEntries(SOURCES_RAPPORT.map(c => [c, stats(lignes.map(l => l.brut?.[c]))]));
  const nTel = lignes.map(l => l.telephones).filter(fini);
  const debut = session.startTime, fin = session.endTime;
  const duree = session.duration ?? Math.round((fin - debut) / 1000);
  return {
    nom: session.name || 'Séance',
    regle: session.regle || '',
    commentaire: session.comment || '',
    debut, fin, duree,
    secondesMesurees: lignes.length,
    pauses: Math.max(0, duree - lignes.length),
    version: session.version || '',
    detaille: lignes.some(l => l.brut),   // les seances d'avant le rapport n'ont que la salle et le temoin
    sources,
    telephones: {
      max: nTel.length ? Math.max(...nTel) : null,
      moyenne: nTel.length ? nTel.reduce((a, b) => a + b, 0) / nTel.length : null,
    },
    quantique: stats(lignes.flatMap(valeursQuantique)),
    graine: stats(lignes.flatMap(valeursGraine)),
    salle: stats(lignes.map(l => l.zSalle)),
    zSalle: lignes.length ? stoufferSalle(lignes) : session.zSalle ?? null,
    temoin: stats(lignes.flatMap(valeursTemoin)),
    temoinChoisi: session.temoinChoisi || [],
    commun: stats(lignes.flatMap(valeursCommun)),
    joue: stats(lignes.map(l => l.zJoue)),
    courbes: {
      quantique: cumul(lignes, valeursQuantique),
      salle: cumul(lignes, l => [l.zSalle]),
      temoin: cumul(lignes, valeursTemoin),
      commun: cumul(lignes, valeursCommun),
    },
  };
}

// Le z de la salle de l'ecran : Stouffer des z de chaque seconde
function stoufferSalle(lignes) {
  const v = lignes.map(l => l.zSalle).filter(fini);
  return v.length ? stouffer(v) : null;
}

// ---- Mise en page ----

const echappe = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nb = (x, d = 2) => (fini(x) ? x.toFixed(d).replace('.', ',').replace(/^-/, '−') : '');
const pTexte = p => (p == null ? '' : p < 0.001 ? '< 0,001' : nb(p, 3));
const heure = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function dureeTexte(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${h} h ` : '') + `${m} min ${String(sec).padStart(2, '0')} s`;
}

function ligneTableau(nom, st, { classe = '', unite = 'valeurs', stouffer: avecZ = true } = {}) {
  if (!st.n) return `<tr class="${classe} vide"><th>${nom}</th><td colspan="7">pas de mesure</td></tr>`;
  return `<tr class="${classe}"><th>${nom}</th>
    <td class="z">${avecZ ? nb(st.z) : ''}</td><td>${avecZ ? pTexte(st.p) : ''}</td><td class="verdict">${avecZ ? verdict(st.z) : 'non cumulable'}</td>
    <td>${nb(st.moyenne, 3)}</td><td>${nb(st.min)}</td><td>${nb(st.max)}</td><td>${st.n} ${unite === 'valeurs' && st.n < 2 ? 'valeur' : unite}</td></tr>`;
}

// Le tableau seul : sert dans le rapport et dans la fiche de la seance (app)
export function tableauRapport(r) {
  const tete = `<thead><tr><th>Mesure principale, décidée d'avance : la n° 1</th><th>z de la séance</th><th>p</th><th>lecture</th><th>z moyen</th><th>min</th><th>max</th><th>mesures</th></tr></thead>`;
  const groupes = [
    ligneTableau('1. Mesure quantique (' + (r.sources.qci.n && r.quantique.n > r.sources.cicada.n ? 'Noosféérique, QCI' : 'Noosféérique') + ')', r.quantique, { classe: 'groupe principale' }),
    ligneTableau('2. Mesure graine (téléphones, ordinateurs)', r.graine, { classe: 'groupe' }),
    ligneTableau('3. Le mélange (ce qui jouait ici)', r.salle, { classe: 'groupe', unite: 's' }),
    ligneTableau('Le témoin distant (' + (r.temoinChoisi.length ? r.temoinChoisi.map(c => NOMS_RAPPORT[c]).join(', ') : 'aucun') + ')', r.temoin, { classe: 'groupe' }),
    ligneTableau('Le z commun (tous les générateurs)', r.commun, { classe: 'groupe commun' }),
  ];
  const sources = r.detaille
    ? SOURCES_RAPPORT.map(c => ligneTableau(NOMS_RAPPORT[c], r.sources[c]))
    : ['<tr class="vide"><th>Générateurs un par un</th><td colspan="7">non enregistrés pour cette séance (antérieure au rapport)</td></tr>'];
  const joue = r.joue.n ? [ligneTableau('z joué vers MainStage', r.joue, { stouffer: false, unite: 's' })] : [];
  return `<table class="rapport-table">${tete}<tbody>${groupes.join('')}</tbody>
    <tbody><tr class="intertitre"><th colspan="8">Chaque générateur</th></tr>${sources.join('')}${joue.join('')}</tbody></table>`;
}

export function telephonesTexte(r) {
  if (r.telephones.max == null) return 'Pas de séance collective : aucun téléphone.';
  const s = r.sources.telephones;
  return `Téléphones : ${r.telephones.max} au plus, ${nb(r.telephones.moyenne, 1)} en moyenne` +
    (s.n ? ` ; leur z de la séance, sans cet ordi : ${nb(s.z)} (${verdict(s.z)}).` : '.');
}

// Courbe SVG : la maree (z cumule) de la salle, du temoin et du commun
function courbeSVG(r) {
  const series = [
    { cle: 'quantique', nom: 'quantique', couleur: '#4EC9C6' },
    { cle: 'salle', nom: 'mélange', couleur: '#7d8796' },
    { cle: 'temoin', nom: 'témoin', couleur: '#8C9AB0' },
    { cle: 'commun', nom: 'commun', couleur: '#C9A24D' },
  ].filter(s => r.courbes[s.cle].length > 1);
  if (!series.length) return '';
  const W = 720, H = 240, M = 34;
  const tous = series.flatMap(s => r.courbes[s.cle]);
  const t0 = Math.min(...tous.map(p => p[0])), t1 = Math.max(...tous.map(p => p[0]));
  const zMax = Math.max(3, ...tous.map(p => Math.abs(p[1])));
  const x = t => M + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * M);
  const y = z => H / 2 - (z / zMax) * (H / 2 - 16);
  const reperes = [1.96, -1.96].map(z => `<line x1="${M}" x2="${W - M}" y1="${y(z)}" y2="${y(z)}" class="seuil"/><text x="${W - M + 3}" y="${y(z) + 4}" class="axe">${nb(z)}</text>`).join('');
  const traces = series.map(s => {
    const pts = r.courbes[s.cle];
    const pas = Math.max(1, Math.floor(pts.length / 1500));   // une longue seance reste legere
    const d = pts.filter((_, i) => i % pas === 0 || i === pts.length - 1).map(([t, z], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(z).toFixed(1)}`).join('');
    return `<path d="${d}" fill="none" stroke="${s.couleur}" stroke-width="1.6"/>`;
  }).join('');
  const legende = series.map(s => `<span><i style="background:${s.couleur}"></i>${s.nom}</span>`).join('');
  return `<figure><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="z de la séance au fil du temps">
    <line x1="${M}" x2="${W - M}" y1="${y(0)}" y2="${y(0)}" class="zero"/>${reperes}${traces}
    <text x="${M}" y="${H - 4}" class="axe">${heure(t0)}</text><text x="${W - M}" y="${H - 4}" class="axe" text-anchor="end">${heure(t1)}</text>
  </svg><figcaption>${legende}<span class="note">z de la séance cumulé seconde après seconde ; au-delà des pointillés (±1,96), moins d’une chance sur 20.</span></figcaption></figure>`;
}

// La fiche JSON : celle de l'export d'avant, plus tous les chiffres du rapport
export function ficheJSON(session, version) {
  const { courbes, ...r } = calculerRapport(session);
  return JSON.stringify({ ...JSON.parse(versJSON(session, version || r.version)), rapport: r }, null, 2);
}

export function nomFichier(session) {
  const d = new Date(session.startTime);
  const p = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}`;
  return `noosfeerique-${date}-${((session.name || 'seance').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'seance')}`;
}

// Le rapport complet, une page HTML autonome
export function versRapportHTML(session, version) {
  const r = calculerRapport(session);
  const csv = versCSV(session.secondes || []);
  const json = ficheJSON(session, version);
  const base = nomFichier(session);
  const date = new Date(r.debut).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  // </script> ne doit jamais fermer le bloc de donnees avant l'heure
  const bloc = t => t.replace(/<\/(script)/gi, '<\\/$1');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport · ${echappe(r.nom)}</title>
<style>
:root { --fond:#ffffff; --texte:#14181f; --doux:#5b6472; --ligne:#e3e6eb; --cyan:#2a9d9a; --or:#a8842f; --groupe:#f5f7f9; }
@media (prefers-color-scheme: dark) { :root { --fond:#0B0E14; --texte:rgba(255,255,255,.9); --doux:rgba(255,255,255,.55); --ligne:#232a36; --cyan:#4EC9C6; --or:#C9A24D; --groupe:#121722; } }
@media print { :root { --fond:#fff; --texte:#000; --doux:#555; --ligne:#ccc; --groupe:#f3f3f3; } .boutons { display:none; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--fond); color:var(--texte); font:14px/1.5 Inter, -apple-system, "Helvetica Neue", sans-serif; }
main { max-width: 900px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { font-size: 24px; margin: 0 0 4px; font-weight: 600; }
.sous { color: var(--doux); margin: 0 0 24px; }
.meta { display:grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 12px; margin: 0 0 28px; }
.meta div { border:1px solid var(--ligne); border-radius:8px; padding:10px 12px; }
.meta b { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--doux); font-weight:500; }
.meta span { font-size:16px; font-variant-numeric: tabular-nums; }
h2 { font-size: 15px; margin: 28px 0 10px; color: var(--cyan); font-weight: 600; }
.defile { overflow-x:auto; }
.rapport-table { width:100%; border-collapse:collapse; font-variant-numeric: tabular-nums; }
.rapport-table th, .rapport-table td { padding:7px 8px; border-bottom:1px solid var(--ligne); text-align:right; white-space:nowrap; }
.rapport-table th:first-child { text-align:left; font-weight:500; white-space:normal; }
.rapport-table thead th { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--doux); font-weight:500; }
.rapport-table .groupe { background:var(--groupe); }
.rapport-table .groupe th { font-weight:600; }
.rapport-table .commun .z { color:var(--or); font-weight:600; }
.rapport-table .principale th, .rapport-table .principale .z { color:var(--cyan); }
.rapport-table .z { font-weight:600; }
.rapport-table .verdict { text-align:left; color:var(--doux); white-space:normal; }
.rapport-table .vide td { text-align:left; color:var(--doux); }
.rapport-table .intertitre th { padding-top:18px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--doux); }
figure { margin: 8px 0 0; }
svg { width:100%; height:auto; }
svg .zero { stroke: var(--doux); stroke-width:.6; }
svg .seuil { stroke: var(--doux); stroke-width:.6; stroke-dasharray:4 4; }
svg .axe { fill: var(--doux); font-size:11px; }
figcaption { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12px; color:var(--doux); margin-top:6px; }
figcaption i { display:inline-block; width:12px; height:3px; margin-right:6px; vertical-align:middle; }
figcaption .note { flex-basis:100%; }
.texte { white-space: pre-wrap; border-left:3px solid var(--ligne); padding-left:12px; }
.methode { color: var(--doux); font-size: 13px; }
.boutons { display:flex; flex-wrap:wrap; gap:10px; margin-top: 12px; }
.boutons button { font: inherit; padding:8px 14px; border-radius:8px; border:1px solid var(--cyan); background:transparent; color:var(--cyan); cursor:pointer; }
</style></head><body><main>
<h1>${echappe(r.nom)}</h1>
<p class="sous">${date} · Noosféérique, U1 virtuel${r.version ? ' · version ' + echappe(r.version) : ''}</p>
<div class="meta">
  <div><b>Début</b><span>${heure(r.debut)}</span></div>
  <div><b>Fin</b><span>${heure(r.fin)}</span></div>
  <div><b>Durée</b><span>${dureeTexte(r.duree)}</span></div>
  <div><b>Secondes mesurées</b><span>${r.secondesMesurees}${r.pauses ? ` (pause ${dureeTexte(r.pauses)})` : ''}</span></div>
  <div><b>1. Mesure quantique</b><span>${nb(r.quantique.z) || '--'}</span></div>
  <div><b>2. Mesure graine</b><span>${nb(r.graine.z) || '--'}</span></div>
  <div><b>3. Le mélange</b><span>${nb(r.zSalle) || '--'}</span></div>
  <div><b>z commun</b><span>${nb(r.commun.z) || '--'}</span></div>
</div>
${r.regle ? `<h2>Règle</h2><p class="texte">${echappe(r.regle)}</p>` : ''}
<h2>Les chiffres</h2>
<div class="defile">${tableauRapport(r)}</div>
<p>${telephonesTexte(r)}</p>
<h2>La marée</h2>
${courbeSVG(r)}
${r.commentaire ? `<h2>Commentaire</h2><p class="texte">${echappe(r.commentaire)}</p>` : ''}
<h2>Méthode</h2>
<p class="methode">Méthode des œufs de Princeton : chaque générateur donne 200 bits, z = (somme − 100) / √50.
Le z de la séance est le Stouffer de toutes les valeurs : leur somme divisée par la racine de leur nombre. Sous le pur hasard, il suit une loi normale quelle que soit la durée.
Chaque valeur ne compte qu'une fois : une valeur identique à la précédente d'une même source est écartée (NIST ne change qu'une fois par minute).
Trois mesures, dans un ordre fixé avant la séance : 1. la mesure quantique (Noosféérique, dont chaque bit naît d'un événement quantique, et QCI s'il était dans la salle) ; 2. la mesure graine (téléphones et ordinateurs, dont les nombres sont calculés à partir d'une graine physique) ; 3. le mélange, ce qui jouait ici seconde par seconde. La première est la mesure principale : la décider d'avance évite de choisir après coup celle qui arrange.
Le témoin, ce sont les sources lointaines (QCI, NIST), sans personne autour. Le z commun réunit les cinq générateurs, chacun pour lui seul (les téléphones sans cet ordi, pour ne rien compter deux fois).
Le z joué vers MainStage reprend souvent la même valeur d'une seconde à l'autre : il n'a donc ni z de séance ni p, seulement sa moyenne et ses bornes.
Le z moyen est la simple moyenne des valeurs ; il dit dans quel sens penchait la séance, le z de la séance dit si ce penchant dépasse le hasard.</p>
<h2>Les données</h2>
<p class="methode">Les secondes (CSV) refont tous les chiffres de cette page ; la fiche (JSON) les résume.</p>
<div class="boutons"><button data-f="csv">Secondes (CSV)</button><button data-f="json">Fiche (JSON)</button><button onclick="print()">Imprimer</button></div>
<script type="text/csv" id="donnees-csv">${bloc(csv)}</script>
<script type="application/json" id="donnees-json">${bloc(json)}</script>
<script>
document.querySelectorAll('[data-f]').forEach(function (b) {
  b.addEventListener('click', function () {
    var f = b.dataset.f, t = document.getElementById('donnees-' + f).textContent;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: f === 'csv' ? 'text/csv' : 'application/json' }));
    a.download = ${JSON.stringify(base)} + '.' + f; document.body.appendChild(a); a.click(); a.remove();
  });
});
</script>
</main></body></html>
`;
}
