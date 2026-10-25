// Tests du choix du temoin (QCI et NIST) : exclusion salle / temoin, memoire, comptes par source, export, Noosfeerique
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeance, choixInitial, basculer, titreTemoin, texteParSource, versCSV, depuisCSV, versJSON, etatCicada, TEMOIN, TEMOIN_COULEUR } from '../public/js/seance.js';

test('le temoin, ce sont QCI et NIST (Princeton arrete, ANU retiree)', () => {
  assert.deepEqual(TEMOIN, ['qci', 'nist']);
});

test('Noosfeerique au demarrage a froid : un premier « off » ne conclut rien', () => {
  const e = etatCicada({ vue: false, echecs: 1, etat: 'en attente' });
  assert.equal(e.disponible, false);
  assert.equal(e.titre, 'Noosféériques · en attente de la clé');
});

test('Noosfeerique disponible des la premiere valeur, et un echec isole ne l eteint pas', () => {
  assert.equal(etatCicada({ vue: true, echecs: 0 }).disponible, true);
  assert.equal(etatCicada({ vue: true, echecs: 2 }).disponible, true);
  assert.equal(etatCicada({ vue: true, echecs: 0 }).titre, 'Noosféériques · chaque seconde');
});

test('Noosfeerique indisponible ou reservee : grisee, avec la raison au survol', () => {
  assert.deepEqual(etatCicada({ vue: true, echecs: 3, etat: 'injoignable' }), { disponible: false, titre: 'Noosféériques · indisponible' });
  assert.deepEqual(etatCicada({ vue: true, echecs: 5, etat: 'reservee' }), { disponible: false, titre: 'Noosféériques · réservée' });
  assert.equal(etatCicada({ vue: false, echecs: 12 }).titre, 'Noosféériques · indisponible');
  assert.equal(etatCicada({ vue: false, echecs: 2, etat: 'reservee' }).titre, 'Noosféériques · réservée');
});

test('Noosfeerique se rallume seule quand la cle revient', () => {
  assert.equal(etatCicada({ vue: true, echecs: 7, etat: 'injoignable' }).disponible, false);
  assert.equal(etatCicada({ vue: true, echecs: 0, etat: 'active' }).disponible, true);
});

test('Noosfeerique compte dans la salle quand elle repond', () => {
  const s = createSeance();
  s.tick(0, { salle: { local: 1, cicada: 1 } });
  s.tick(1000, { salle: { local: 0.5, cicada: null } });   // cle muette : seule la salle locale compte
  const r = s.resume();
  assert.equal(r.nSalle, 2);
  assert.ok(Math.abs(r.zSalle - (2 / Math.sqrt(2) + 0.5) / Math.sqrt(2)) < 1e-12);
});

test('au premier chargement, tout le temoin est allume', () => {
  assert.deepEqual(choixInitial(), { qci: true, nist: true });
});

test('une source deja dans la salle n entre pas dans le temoin au chargement (la salle garde la priorite)', () => {
  assert.equal(choixInitial({ salle: { qci: true } }).qci, false);
  assert.equal(choixInitial({ memo: { qci: true }, salle: { qci: true } }).qci, false);
});

test('le choix memorise est repris', () => {
  const t = choixInitial({ memo: { nist: false } });
  assert.equal(t.nist, false);
  assert.equal(t.qci, true);
});

test('cocher une source dans le temoin l eteint dans la salle, et inversement', () => {
  let e = { salle: { local: true, qci: true }, temoin: { nist: true, qci: false } };
  e = basculer(e, 'temoin', 'qci');
  assert.equal(e.temoin.qci, true);
  assert.equal(e.salle.qci, false);
  e = basculer(e, 'salle', 'qci');
  assert.equal(e.salle.qci, true);
  assert.equal(e.temoin.qci, false);
  e = basculer(e, 'temoin', 'nist');   // decocher : rien ne s'allume de l'autre cote
  assert.equal(e.temoin.nist, false);
  assert.equal(e.salle.nist, undefined);
  assert.equal(e.salle.local, true);
});

test('une source eteinte du temoin n est pas comptee ; une pulsation NIST compte une fois', () => {
  const s = createSeance();
  for (let sec = 0; sec < 120; sec++) {
    s.tick(sec * 1000, {
      salle: { telephones: (sec % 5) / 10 },
      mesures: { nist: sec < 60 ? 0.7 : -0.2, qci: Math.sin(sec) },
      temoinActif: ['nist'],
    });
  }
  const r = s.resume();
  assert.equal(r.parSource.nist, 2);
  assert.equal(r.parSource.qci, 0);
  assert.equal(r.nTemoin, 2);
  assert.ok(Math.abs(r.zTemoin - 0.5 / Math.sqrt(2)) < 1e-12);
});

test('le resume donne le nombre de valeurs par source du temoin', () => {
  const s = createSeance();
  for (let sec = 0; sec < 5; sec++) s.tick(sec * 1000, { mesures: { nist: sec < 3 ? 1 : 2, qci: sec / 10 }, temoinActif: ['qci', 'nist'] });
  const r = { ...s.resume(), temoinChoisi: ['qci', 'nist'] };
  assert.equal(texteParSource(r), 'QCI 5 · NIST 2');
});

test('l export porte le choix du temoin, et le CSV refait toujours les z', () => {
  const s = createSeance();
  for (let sec = 0; sec < 90; sec++) s.tick(1760000000000 + sec * 1000, { salle: { local: Math.cos(sec) }, mesures: { nist: Math.floor(sec / 60), qci: Math.sin(sec) }, temoinActif: ['nist'] });
  const csv = versCSV(s.lignes);
  assert.match(csv.split('\n')[0], /,temoin_choisi,z_telephones,z_local,z_cicada,z_qci,z_nist,z_joue$/);
  assert.match(csv.split('\n')[1], /,nist,,,,,,$/);
  const re = depuisCSV(csv), r = s.resume();
  assert.ok(Math.abs(re.zTemoin - r.zTemoin) < 1e-4);
  assert.equal(re.nTemoin, r.nTemoin);
  const j = JSON.parse(versJSON({ name: 'x', startTime: 0, endTime: 1000, duration: 1, ...r, temoinChoisi: ['nist'] }, '1.5.0'));
  assert.deepEqual(j.temoin_choisi, ['nist']);
  assert.equal(j.valeurs_par_source_temoin.nist, 2);
});

test('chaque pastille du temoin dit son rythme au survol, et le temoin a sa couleur', () => {
  assert.equal(titreTemoin('nist'), 'NIST · une valeur par minute');
  assert.equal(titreTemoin('qci'), 'QCI · chaque seconde');
  assert.ok(TEMOIN.every(c => titreTemoin(c).includes(' · ') && !titreTemoin(c).includes('—')));
  assert.match(TEMOIN_COULEUR, /^#[0-9A-F]{6}$/);
});
