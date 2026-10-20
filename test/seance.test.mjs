// Tests du z de la seance (la maree), du temoin et de l'export : node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeance, stouffer, zAffiche, versCSV, depuisCSV, versJSON, texteResume } from '../public/js/seance.js';

function gaussian(seed) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

test('z de la seance sur une serie connue : somme / racine(n)', () => {
  const s = createSeance();
  const zs = [1, 2, -0.5, 1.5];
  zs.forEach((z, i) => s.tick(i * 1000, { salle: { telephones: z } }));
  const r = s.resume();
  assert.equal(r.nSalle, 4);
  assert.ok(Math.abs(r.zSalle - 4 / 2) < 1e-12);      // (1 + 2 - 0,5 + 1,5) / racine(4) = 2
});

test('une seule valeur par seconde, meme si le tick est appele plusieurs fois', () => {
  const s = createSeance();
  for (let k = 0; k < 7; k++) s.tick(5000 + k * 100, { salle: { telephones: 1.2 + k * 0.01 } });
  s.tick(6000, { salle: { telephones: 0.8 } });
  const r = s.resume();
  assert.equal(r.nSalle, 2);
  assert.equal(s.lignes.length, 2);
  assert.ok(Math.abs(r.zSalle - (1.2 + 0.8) / Math.sqrt(2)) < 1e-12);
});

test('en solo, la salle combine cet appareil et la cle Noosfeerique chaque seconde', () => {
  const s = createSeance();
  s.tick(0, { salle: { local: 1, cicada: 1 } });
  const r = s.resume();
  assert.ok(Math.abs(r.zSalle - 2 / Math.sqrt(2) / Math.sqrt(1)) < 1e-12);
});

test('une valeur figee de la salle n est pas recomptee', () => {
  const s = createSeance();
  s.tick(0, { salle: { telephones: 1.5 } });
  s.tick(1000, { salle: { telephones: 1.5 } });   // serveur muet : meme valeur
  s.tick(2000, { salle: { telephones: 0.5 } });
  assert.equal(s.resume().nSalle, 2);
});

test('le temoin ne compte qu une fois chaque valeur fraiche (une par minute)', () => {
  const s = createSeance();
  for (let sec = 0; sec < 180; sec++) {
    const nist = sec < 60 ? 1.1 : sec < 120 ? -0.4 : 2.0;   // une pulsation par minute
    s.tick(sec * 1000, { salle: { telephones: (sec % 7) / 10 }, mesures: { nist } });
  }
  const r = s.resume();
  assert.equal(r.nTemoin, 3);
  assert.ok(Math.abs(r.zTemoin - (1.1 - 0.4 + 2.0) / Math.sqrt(3)) < 1e-12);
  assert.equal(r.nSalle > 100, true);
});

test('sous le pur hasard, le z de la seance reste une loi normale (longue seance)', () => {
  const g = gaussian(11);
  const zs = [];
  for (let k = 0; k < 400; k++) {
    const s = createSeance();
    for (let sec = 0; sec < 600; sec++) s.tick(sec * 1000, { salle: { telephones: g() } });
    zs.push(s.resume().zSalle);
  }
  const moy = zs.reduce((a, b) => a + b, 0) / zs.length;
  const sd = Math.sqrt(zs.reduce((a, b) => a + (b - moy) ** 2, 0) / zs.length);
  assert.ok(Math.abs(moy) < 0.2, 'moyenne proche de 0');
  assert.ok(sd > 0.85 && sd < 1.15, 'ecart-type proche de 1');
});

test('export CSV : les deux z se refont a partir du fichier seul', () => {
  const g = gaussian(5);
  const s = createSeance();
  for (let sec = 0; sec < 300; sec++) {
    s.tick(1760000000000 + sec * 1000, {
      salle: { telephones: g() }, nTelephones: 12,
      mesures: { nist: Math.floor(sec / 60) * 0.3 - 0.5, qci: g() },
    });
  }
  const r = s.resume();
  const csv = versCSV(s.lignes);
  const re = depuisCSV(csv);
  assert.equal(re.nSalle, r.nSalle);
  assert.equal(re.nTemoin, r.nTemoin);
  assert.ok(Math.abs(re.zSalle - r.zSalle) < 1e-4);
  assert.ok(Math.abs(re.zTemoin - r.zTemoin) < 1e-4);
  assert.match(csv.split('\n')[0], /^heure_iso,z_salle,telephones,z_temoin_qci,z_temoin_nist,/);
  assert.match(csv.split('\n')[1], /^2025|^2026/);
});

test('export JSON : nom, regle, debut, fin, les deux z et la version', () => {
  const j = JSON.parse(versJSON({ name: 'Concert', regle: 'du premier au dernier son', startTime: 0, endTime: 60000, duration: 60, zSalle: 1.2, nSalle: 60, zTemoin: 0.1, nTemoin: 2 }, '1.4.0'));
  assert.equal(j.regle, 'du premier au dernier son');
  assert.equal(j.z_salle, 1.2);
  assert.equal(j.version_app, '1.4.0');
  assert.equal(j.duree_s, 60);
});

test('affichage : pendant un enregistrement, le chiffre sous la sphere est le z de la seance', () => {
  assert.deepEqual(zAffiche({ enregistrement: true, zInstant: 2.7, zSeance: 0.4 }), { valeur: 0.4, libelle: 'z de la séance' });
  assert.deepEqual(zAffiche({ enregistrement: false, zInstant: 2.7, zSeance: 0.4 }), { valeur: 2.7, libelle: 'z-score' });
});

test('resume lisible, sans cadratin', () => {
  const t = texteResume({ zSalle: 1.234, nSalle: 1200, zTemoin: null, nTemoin: 0 });
  assert.equal(t, 'la salle : z = 1,23 (1200 s) · le témoin : pas de mesure');
  assert.equal(texteResume({ zSalle: -0.5, nSalle: 60, zTemoin: 0.81, nTemoin: 3 }), 'la salle : z = -0,50 (60 s) · le témoin : z = 0,81 (3 valeurs)');
  assert.ok(!t.includes('—'));
  assert.equal(stouffer([]), 0);
});
