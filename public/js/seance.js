/* ============================================================
   Noosfeerique — z de la seance (la maree) et son temoin
   Logique pure, sans navigateur : testable dans Node.

   Pendant un enregistrement, chaque seconde compte UNE seule fois.
   La « salle » (telephones de la seance collective, ou en solo le
   generateur de cet appareil et la cle Noosfeerique) donne un z par
   seconde ; le z de la seance est leur Stouffer :
       Z = somme des z de chaque seconde / racine(nombre de secondes)
   Sous le pur hasard, Z suit une loi normale, quelle que soit la duree.

   Le « temoin » (sources lointaines : QCI et la balise NIST) se calcule
   a part, de la meme facon, mais chaque valeur fraiche n'y compte
   qu'une fois : NIST ne change qu'une fois par minute, et recompter la
   meme pulsation chaque seconde fabriquerait une fausse coherence.
   (Princeton : collecte arretee le 03/04/2026. ANU : retiree, payante.)

   Une valeur strictement identique a la precedente d'une meme source
   est ecartee (comme dans midi-coherence.js) : c'est une source figee,
   pas un tirage neuf.
   ============================================================ */

export const TEMOIN = ['qci', 'nist'];
export const NOMS = { nist: 'NIST', qci: 'QCI', local: 'cet appareil', cicada: 'Noosféériques', telephones: 'téléphones' };

// La couleur du temoin : une brume bleutee, distincte des pastilles de la salle
// (violet, cyan, orange, vert, or, rose) et de la charte
export const TEMOIN_COULEUR = '#B8C4D6';

// Rythme reel de chaque source (experience.js : QCI chaque seconde, NIST une
// pulsation par minute)
export const RYTHMES = {
  nist: 'une valeur par minute',
  qci: 'chaque seconde',
};
export const titreTemoin = cle => `${NOMS[cle]} · ${RYTHMES[cle]}`;

// Choix du temoin au chargement : ce qui a ete memorise, sinon tout le temoin,
// sauf une source deja cochee dans la salle (la salle garde la priorite :
// on ne change jamais ce qui joue sans qu'on le demande)
export function choixInitial({ memo = null, salle = {} } = {}) {
  const t = {};
  for (const cle of TEMOIN) t[cle] = salle[cle] ? false : (memo && cle in memo ? !!memo[cle] : true);
  return t;
}

// Une source n'est jamais des deux cotes : la cocher d'un cote l'eteint de l'autre
export function basculer({ salle, temoin }, cote, cle) {
  const s = { ...salle }, t = { ...temoin };
  const ici = cote === 'temoin' ? t : s, la = cote === 'temoin' ? s : t;
  ici[cle] = !ici[cle];
  if (ici[cle] && cle in la) la[cle] = false;
  return { salle: s, temoin: t };
}

// La pastille Noosfeerique (cle Cicada) ne disparait jamais : indisponible, elle
// reste a sa place, eteinte et grisee, et ne compte pas. On ne conclut jamais sur
// un seul appel : disponible apres une premiere valeur, indisponible apres
// `patience` echecs d'affilee ; au demarrage a froid, « en attente de la cle ».
// etat : ce que dit le serveur quand il repond « off » (« reservee », « injoignable »…)
export function etatCicada({ vue = false, echecs = 0, etat = null } = {}, patience = 3) {
  if (vue && echecs < patience) return { disponible: true, titre: 'Noosféériques · chaque seconde' };
  if (etat === 'reservee') return { disponible: false, titre: 'Noosféériques · réservée' };
  if (!vue && echecs < 10) return { disponible: false, titre: 'Noosféériques · en attente de la clé' };
  return { disponible: false, titre: 'Noosféériques · indisponible' };
}

const fini = z => z != null && isFinite(z);

// Les generateurs du rapport, chacun pour lui seul. Ils sont independants :
// leur Stouffer commun (le z commun) ne compte aucun tirage deux fois.
export const SOURCES_RAPPORT = ['telephones', 'local', 'cicada', 'qci', 'nist'];
export const NOMS_RAPPORT = { telephones: 'Téléphones', local: 'Cet ordi', cicada: 'Noosféériques (Cicada)', qci: 'QCI', nist: 'NIST' };

// ---- Les sources de l'ecoute (page principale) ----
// Plusieurs sources se cochent ensemble ; le z affiche est le Stouffer des
// sources cochees qui ont une valeur FRAICHE dans la seconde (une source a la
// minute ne compte qu'une fois par valeur neuve, comme dans le z de seance).
// Sans aucune valeur fraiche dans la seconde, le dernier z reste affiche.
// Par defaut, la salle = cet appareil et Noosfeerique ; QCI et NIST sont au temoin
// (on peut les faire passer dans l'ecoute, ils quittent alors le temoin)
export const SALLE_CLES = ['local', 'cicada', 'qci', 'nist'];
export const SALLE_DEFAUT = { local: true, cicada: true, qci: false, nist: false };

export function createCombinaison() {
  const dernier = {};
  let seconde = null, z = null, n = 0;
  function tick(maintenant, valeurs = {}, coches = []) {
    const s = Math.floor(maintenant / 1000);
    if (s === seconde) return z;
    seconde = s;
    const frais = [];
    for (const k of coches) {
      const v = valeurs[k];
      if (fini(v) && v !== dernier[k]) { dernier[k] = v; frais.push(v); }
    }
    if (frais.length) { z = stouffer(frais); n = frais.length; }
    return z;
  }
  return { tick, get z() { return z; }, get n() { return n; } };
}

// Etat d'une source pour sa pastille : disponible, en attente (au demarrage)
// ou indisponible (plus de reponse). NIST, a la minute, a droit a 3 min de patience.
const PATIENCE_S = { local: 5, qci: 6, nist: 180, cicada: 6 };
export function etatSource(cle, { dernierOk = null, maintenant = Date.now(), debut = maintenant } = {}) {
  const nom = NOMS[cle] === 'cet appareil' ? 'Cet appareil' : NOMS[cle];
  if (dernierOk != null && maintenant - dernierOk < (PATIENCE_S[cle] || 180) * 1000) {
    return { disponible: true, titre: RYTHMES[cle] ? `${nom} · ${RYTHMES[cle]}` : `${nom} · chaque seconde` };
  }
  if (dernierOk == null && maintenant - debut < 75000) return { disponible: false, titre: `${nom} · en attente` };
  return { disponible: false, titre: `${nom} · indisponible` };
}

// Stouffer : somme / racine(n), 0 si rien
export function stouffer(valeurs) {
  const v = valeurs.filter(fini);
  return v.length ? v.reduce((a, b) => a + b, 0) / Math.sqrt(v.length) : 0;
}

export function createSeance({ temoin = TEMOIN } = {}) {
  const lignes = [];          // une par seconde : { t, zSalle, telephones, temoin: {cle: z frais}, sources }
  const dernier = {};         // derniere valeur vue par source (salle et temoin)
  let seconde = null;
  let sommeSalle = 0, nSalle = 0;
  let sommeTemoin = 0, nTemoin = 0;
  const parSource = Object.fromEntries(temoin.map(c => [c, 0]));   // valeurs recues par source du temoin

  const frais = (cle, z) => {
    if (!fini(z) || z === dernier[cle]) return false;
    dernier[cle] = z;
    return true;
  };

  // Appelee aussi souvent qu'on veut : seule la premiere fois de chaque seconde compte.
  // salle : { telephones?, local?, cicada?, ... } ; mesures : { gcp, qrng, nist, qci } ;
  // temoinActif : les sources du temoin cochees a cette seconde (toutes par defaut)
  // brut : chaque generateur pour lui seul, pour le rapport (telephones sans cet
  // ordi, cet ordi, Noosfeerique, QCI, NIST), qu'il compte ou non dans la salle ;
  // zJoue : le z parti vers MainStage a cette seconde
  function tick(maintenant, { salle = {}, nTelephones = null, mesures = {}, temoinActif = temoin, brut = {}, zJoue = null } = {}) {
    const s = Math.floor(maintenant / 1000);
    if (s === seconde) return null;
    seconde = s;

    const zs = [], sources = [];
    for (const [cle, z] of Object.entries(salle)) if (frais('salle:' + cle, z)) { zs.push(z); sources.push(cle); }
    const zSalle = zs.length ? stouffer(zs) : null;
    if (zSalle != null) { sommeSalle += zSalle; nSalle++; }

    const t = {};
    const actifs = temoin.filter(c => temoinActif.includes(c));
    for (const cle of actifs) if (frais('temoin:' + cle, mesures[cle])) {
      t[cle] = mesures[cle]; sommeTemoin += mesures[cle]; nTemoin++; parSource[cle]++; sources.push(cle);
    }
    const b = {};
    for (const cle of SOURCES_RAPPORT) if (frais('brut:' + cle, brut[cle])) b[cle] = brut[cle];
    const ligne = { t: s * 1000, zSalle, telephones: nTelephones, temoin: t, temoinActif: actifs, sources, brut: b, zJoue: fini(zJoue) ? zJoue : null };
    lignes.push(ligne);
    return ligne;
  }

  function resume() {
    return {
      zSalle: nSalle ? sommeSalle / Math.sqrt(nSalle) : null, nSalle,
      zTemoin: nTemoin ? sommeTemoin / Math.sqrt(nTemoin) : null, nTemoin,
      parSource: { ...parSource },
      secondes: lignes.length,
    };
  }

  return { tick, resume, get lignes() { return lignes; } };
}

// Le chiffre sous la sphere : pendant un enregistrement, le z de la seance ;
// sinon le z de l'instant. Le MIDI et la sphere ne lisent jamais ceci.
export function zAffiche({ enregistrement, zInstant, zSeance }) {
  if (enregistrement) return { valeur: zSeance, libelle: 'z de la séance' };
  return { valeur: zInstant, libelle: 'z-score' };
}

// ---- Export ----
const COLONNES = ['heure_iso', 'z_salle', 'telephones', ...TEMOIN.map(c => 'z_temoin_' + c), 'sources', 'temoin_choisi',
  ...SOURCES_RAPPORT.map(c => 'z_' + c), 'z_joue'];
const nombre = z => (fini(z) ? z.toFixed(6) : '');

export function versCSV(lignes) {
  const corps = lignes.map(l => [
    new Date(l.t).toISOString(), nombre(l.zSalle), l.telephones ?? '',
    ...TEMOIN.map(c => nombre(l.temoin?.[c])), (l.sources || []).join(' '), (l.temoinActif || []).join(' '),
    ...SOURCES_RAPPORT.map(c => nombre(l.brut?.[c])), nombre(l.zJoue),
  ].join(','));
  return [COLONNES.join(','), ...corps].join('\n') + '\n';
}

// Refait les deux Z a partir du CSV seul : la preuve que l'export suffit.
export function depuisCSV(csv) {
  const [tete, ...rangs] = csv.trim().split('\n');
  const col = tete.split(',');
  const iSalle = col.indexOf('z_salle');
  const iTemoin = TEMOIN.map(c => col.indexOf('z_temoin_' + c));
  const salle = [], temoin = [];
  for (const r of rangs) {
    const v = r.split(',');
    if (v[iSalle] !== '') salle.push(parseFloat(v[iSalle]));
    for (const i of iTemoin) if (v[i] !== '') temoin.push(parseFloat(v[i]));
  }
  return {
    zSalle: salle.length ? stouffer(salle) : null, nSalle: salle.length,
    zTemoin: temoin.length ? stouffer(temoin) : null, nTemoin: temoin.length,
  };
}

export function versJSON(seance, version) {
  return JSON.stringify({
    nom: seance.name,
    regle: seance.regle || '',
    debut: new Date(seance.startTime).toISOString(),
    fin: new Date(seance.endTime).toISOString(),
    duree_s: seance.duration,
    z_salle: seance.zSalle, secondes_salle: seance.nSalle,
    z_temoin: seance.zTemoin, valeurs_temoin: seance.nTemoin,
    temoin_choisi: seance.temoinChoisi || [],
    valeurs_par_source_temoin: seance.parSource || {},
    calcul: 'Stouffer : somme des z / racine(nombre). Salle : un z par seconde. Témoin : chaque valeur fraîche une fois.',
    version_app: version,
    ...(seance.midi ? { midi: seance.midi } : {}),
  }, null, 2);
}

// Les reglages de la musique pour la fiche : ceux de la fin, et ce qui a
// change depuis le debut. null hors de la page du concert (?midi).
export function reglagesMidi(debut, fin) {
  if (!fin) return null;
  const { page, ...reglages } = fin;
  const changes = debut
    ? Object.keys(reglages).filter(k => JSON.stringify(debut[k]) !== JSON.stringify(reglages[k]))
      .map(cle => ({ cle, debut: debut[cle] ?? null, fin: reglages[cle] }))
    : [];
  return { page, reglages, changes };
}

// Texte du resume : « la salle : z = … · le témoin : z = … »
export function texteResume(r) {
  const f = z => z.toFixed(2).replace('.', ',');
  const salle = fini(r.zSalle) ? `la salle : z = ${f(r.zSalle)} (${r.nSalle} s)` : 'la salle : pas de mesure';
  const temoin = fini(r.zTemoin) ? `le témoin : z = ${f(r.zTemoin)} (${r.nTemoin} valeur${r.nTemoin > 1 ? 's' : ''})` : 'le témoin : pas de mesure';
  return `${salle} · ${temoin}`;
}

// Le detail du temoin : valeurs recues par source cochee
// (« Princeton 3 · QCI 1180 · ANU 0 ») ; vide pour une seance d'avant le choix du temoin
export function texteParSource(r) {
  const choisi = r.temoinChoisi || (r.parSource ? Object.keys(r.parSource) : []);
  return choisi.map(c => `${NOMS[c]} ${r.parSource?.[c] ?? 0}`).join(' · ');
}
