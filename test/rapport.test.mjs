// Tests du rapport de seance : node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeance, stouffer, depuisCSV } from '../public/js/seance.js';
import { calculerRapport, versRapportHTML, ficheJSON, pBilateral, verdict, nomFichier } from '../public/js/rapport.js';

function gaussian(seed) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

// Une seance de concert simulee : telephones, cet ordi, Cicada, QCI chaque seconde, NIST a la minute
function seanceConcert(secondes = 300, seed = 3) {
  const g = gaussian(seed);
  const s = createSeance();
  const t0 = 1761200000000;
  const brutes = { telephones: [], local: [], cicada: [], qci: [], nist: [] };
  for (let sec = 0; sec < secondes; sec++) {
    const b = { telephones: g(), local: g(), cicada: g(), qci: g(), nist: Math.floor(sec / 60) * 0.4 - 0.6 };
    if (sec % 60 === 0 || sec === 0) brutes.nist.push(b.nist);
    for (const k of ['telephones', 'local', 'cicada', 'qci']) brutes[k].push(b[k]);
    s.tick(t0 + sec * 1000, {
      salle: { telephones: b.telephones + 0.1, cicada: b.cicada }, nTelephones: 3 + (sec % 4),
      mesures: { qci: b.qci, nist: b.nist }, brut: b, zJoue: (b.telephones + b.local) / Math.SQRT2,
    });
  }
  const r = s.resume();
  const session = {
    name: 'Concert / essai', regle: 'du premier au dernier son', startTime: t0, endTime: t0 + (secondes + 20) * 1000,
    duration: secondes + 20, zSalle: r.zSalle, nSalle: r.nSalle, zTemoin: r.zTemoin, nTemoin: r.nTemoin,
    temoinChoisi: ['qci', 'nist'], parSource: r.parSource, secondes: s.lignes, version: '1.6.0', comment: 'Belle salle',
  };
  return { session, brutes, r };
}

const proche = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);

test('chaque generateur pour lui seul : z de la seance, moyenne, min, max, nombre', () => {
  const { session, brutes } = seanceConcert();
  const rap = calculerRapport(session);
  for (const k of ['telephones', 'local', 'cicada', 'qci']) {
    const v = brutes[k];
    assert.equal(rap.sources[k].n, v.length);
    proche(rap.sources[k].z, stouffer(v));
    proche(rap.sources[k].moyenne, v.reduce((a, b) => a + b, 0) / v.length);
    proche(rap.sources[k].min, Math.min(...v));
    proche(rap.sources[k].max, Math.max(...v));
  }
  assert.equal(rap.sources.nist.n, 5);   // une valeur fraiche par minute
});

test('salle et temoin du rapport = ceux de l ecran ; z commun = tous les generateurs', () => {
  const { session, brutes, r } = seanceConcert();
  const rap = calculerRapport(session);
  proche(rap.zSalle, r.zSalle);
  proche(rap.temoin.z, r.zTemoin);
  assert.equal(rap.temoin.n, r.nTemoin);
  const tout = Object.values(brutes).flat();
  proche(rap.commun.z, stouffer(tout));
  assert.equal(rap.commun.n, tout.length);
});

test('telephones, duree, pauses, z joue', () => {
  const { session } = seanceConcert(120);
  const rap = calculerRapport(session);
  assert.equal(rap.telephones.max, 6);
  proche(rap.telephones.moyenne, 4.5);
  assert.equal(rap.duree, 140);
  assert.equal(rap.secondesMesurees, 120);
  assert.equal(rap.pauses, 20);
  assert.equal(rap.joue.n, 120);
});

test('le CSV seul refait les chiffres du rapport', () => {
  const { session } = seanceConcert();
  const html = versRapportHTML(session, '1.6.0');
  const csv = html.match(/<script type="text\/csv" id="donnees-csv">([\s\S]*?)<\/script>/)[1];
  const rap = calculerRapport(session);
  proche(depuisCSV(csv).zSalle, rap.zSalle, 1e-4);
  const lignes = csv.trim().split('\n');
  const col = lignes[0].split(',');
  for (const k of ['telephones', 'local', 'cicada', 'qci', 'nist']) {
    const i = col.indexOf('z_' + k);
    assert.ok(i > 0, 'colonne z_' + k);
    const v = lignes.slice(1).map(l => l.split(',')[i]).filter(x => x !== '').map(Number);
    proche(stouffer(v), rap.sources[k].z, 1e-4);
  }
});

test('la page est autonome : chiffres, regle echappee, donnees, aucun cadratin', () => {
  const { session } = seanceConcert();
  session.regle = 'a < b & "c"';
  const html = versRapportHTML(session, '1.6.0');
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes('a &lt; b &amp; &quot;c&quot;'));
  assert.ok(html.includes('Téléphones : 6 au plus'));
  assert.ok(html.includes('z commun'));
  assert.ok(!html.includes('—'), 'pas de cadratin');
  assert.ok(!/src="http/.test(html), 'aucune ressource exterieure');
  const fiche = JSON.parse(html.match(/id="donnees-json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(fiche.rapport.sources.local.n, 300);
  assert.equal(fiche.regle, 'a < b & "c"');
});

test('une seance d avant le rapport donne quand meme un rapport', () => {
  const s = createSeance();
  for (let sec = 0; sec < 10; sec++) s.tick(sec * 1000, { salle: { local: (sec % 3) / 2 } });
  const lignes = s.lignes.map(({ brut, zJoue, ...l }) => l);   // format d'avant
  const session = { name: 'Ancienne', startTime: 0, endTime: 10000, duration: 10, secondes: lignes };
  const rap = calculerRapport(session);
  assert.equal(rap.detaille, false);
  assert.equal(rap.salle.n, 10);
  assert.ok(versRapportHTML(session).includes('non enregistrés pour cette séance'));
  JSON.parse(ficheJSON(session, '1.6.0'));
});

test('lecture d un z et nom de fichier', () => {
  proche(pBilateral(1.96), 0.05, 1e-3);
  proche(pBilateral(0), 1, 1e-6);
  assert.equal(verdict(0.5), 'dans le hasard');
  assert.match(verdict(-2.5), /notable/);
  assert.match(verdict(3.4), /fort/);
  assert.match(nomFichier({ name: 'Concert / essai', startTime: new Date(2026, 9, 23, 20, 5).getTime() }), /^noosfeerique-2026-10-23-20h05-Concert-essai$/);
});

test('les trois mesures : quantique (Cicada, QCI au temoin), graine (telephones + ordi), melange (salle)', () => {
  const { session, brutes, r } = seanceConcert();
  const rap = calculerRapport(session);
  proche(rap.quantique.z, stouffer(brutes.cicada));          // QCI est au temoin : hors de la mesure quantique
  assert.equal(rap.quantique.n, brutes.cicada.length);
  proche(rap.graine.z, stouffer([...brutes.telephones, ...brutes.local]));
  proche(rap.zSalle, r.zSalle);
  const html = versRapportHTML(session, '1.6.0');
  assert.ok(html.indexOf('1. Mesure quantique') < html.indexOf('2. Mesure graine'));
  assert.ok(html.includes("Mesure principale, décidée d'avance"));
});

test('QCI passe dans la mesure quantique quand il est dans la salle (evenement mondial)', () => {
  const s = createSeance();
  for (let sec = 0; sec < 5; sec++) s.tick(sec * 1000, { salle: { qci: 0.5 + sec / 10 }, temoinActif: ['nist'], brut: { cicada: 1 + sec / 10, qci: 0.5 + sec / 10 } });
  const rap = calculerRapport({ name: 'Mondial', startTime: 0, endTime: 5000, duration: 5, secondes: s.lignes, temoinChoisi: ['nist'] });
  assert.equal(rap.quantique.n, 10);
});

// Reglages de la musique : dans la fiche et le rapport, seulement depuis la page du concert
test('reglages MIDI : fiche JSON et rapport, changements notes', async () => {
  const { reglagesMidi } = await import('../public/js/seance.js');
  const { reglagesMidiHTML } = await import('../public/js/rapport.js');
  const base = { page: 'concert', nappeHaut: 0.8, nappeBas: 0.8, jeuHaut: 1.2, jeuBas: 1.2, engagement: 20, accord: 2.8, seuil: 1,
    traits: 'oui', patchAuto: 'oui', patchPousse: 0.5, patchFenetre: 5, patchMin: 3, gamme: 'app', gammeApp: 'pentatonic', gammePatch: null,
    velLeadMin: 30, velLeadMax: 100, velAccordsMin: 50, velAccordsMax: 100, velNappeMin: 50, velNappeMax: 70, channel: 1, channelHarmony: 2, channelBack: 3 };
  assert.equal(reglagesMidi(null, null), null);
  const m = reglagesMidi({ ...base, accord: 2.5 }, base);
  assert.equal(m.page, 'concert');
  assert.equal(m.reglages.accord, 2.8);
  assert.equal('page' in m.reglages, false);
  assert.deepEqual(m.changes, [{ cle: 'accord', debut: 2.5, fin: 2.8 }]);
  const html = reglagesMidiHTML(m);
  assert.match(html, /La musique \(réglages MIDI\)/);
  assert.match(html, /±2,8 \(palier fort ±3,3\)/);
  assert.match(html, /Accords dès ± : 2\.5 → 2\.8/);
  assert.equal(reglagesMidiHTML(null), '');
  const t0 = 1761200000000;
  const session = { name: 'Concert', startTime: t0, endTime: t0 + 1000, duration: 1, secondes: [], midi: m };
  assert.deepEqual(JSON.parse(ficheJSON(session, '1.7.6')).midi, m);
  assert.match(versRapportHTML(session, '1.7.6'), /Changés pendant la séance/);
  const sansMidi = JSON.parse(ficheJSON({ ...session, midi: null }, '1.7.6'));
  assert.equal('midi' in sansMidi, false);
});
