/* ============================================================
   Noosfeerique — z de la seance (la maree) et son temoin
   Logique pure, sans navigateur : testable dans Node.

   Pendant un enregistrement, chaque seconde compte UNE seule fois.
   La « salle » (telephones de la seance collective, ou en solo le
   generateur de cet appareil et la cle Noosfeerique) donne un z par
   seconde ; le z de la seance est leur Stouffer :
       Z = somme des z de chaque seconde / racine(nombre de secondes)
   Sous le pur hasard, Z suit une loi normale, quelle que soit la duree.

   Le « temoin » (sources lointaines : Princeton, ANU, NIST, QCI) se
   calcule a part, de la meme facon, mais chaque valeur fraiche n'y
   compte qu'une fois : ces sources ne changent qu'environ une fois par
   minute, et recompter la meme valeur chaque seconde fabriquerait une
   fausse coherence.

   Une valeur strictement identique a la precedente d'une meme source
   est ecartee (comme dans midi-coherence.js) : c'est une source figee,
   pas un tirage neuf.
   ============================================================ */

export const TEMOIN = ['gcp', 'qrng', 'nist', 'qci'];
export const NOMS = { gcp: 'Princeton', qrng: 'ANU', nist: 'NIST', qci: 'QCI', local: 'cet appareil', cicada: 'Noosféérique', telephones: 'téléphones' };

const fini = z => z != null && isFinite(z);

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

  const frais = (cle, z) => {
    if (!fini(z) || z === dernier[cle]) return false;
    dernier[cle] = z;
    return true;
  };

  // Appelee aussi souvent qu'on veut : seule la premiere fois de chaque seconde compte.
  // salle : { telephones?, local?, cicada? } ; mesures : { gcp, qrng, nist, qci }
  function tick(maintenant, { salle = {}, nTelephones = null, mesures = {} } = {}) {
    const s = Math.floor(maintenant / 1000);
    if (s === seconde) return null;
    seconde = s;

    const zs = [], sources = [];
    for (const [cle, z] of Object.entries(salle)) if (frais('salle:' + cle, z)) { zs.push(z); sources.push(cle); }
    const zSalle = zs.length ? stouffer(zs) : null;
    if (zSalle != null) { sommeSalle += zSalle; nSalle++; }

    const t = {};
    for (const cle of temoin) if (frais('temoin:' + cle, mesures[cle])) {
      t[cle] = mesures[cle]; sommeTemoin += mesures[cle]; nTemoin++; sources.push(cle);
    }
    const ligne = { t: s * 1000, zSalle, telephones: nTelephones, temoin: t, sources };
    lignes.push(ligne);
    return ligne;
  }

  function resume() {
    return {
      zSalle: nSalle ? sommeSalle / Math.sqrt(nSalle) : null, nSalle,
      zTemoin: nTemoin ? sommeTemoin / Math.sqrt(nTemoin) : null, nTemoin,
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
const COLONNES = ['heure_iso', 'z_salle', 'telephones', ...TEMOIN.map(c => 'z_temoin_' + c), 'sources'];
const nombre = z => (fini(z) ? z.toFixed(6) : '');

export function versCSV(lignes) {
  const corps = lignes.map(l => [
    new Date(l.t).toISOString(), nombre(l.zSalle), l.telephones ?? '',
    ...TEMOIN.map(c => nombre(l.temoin?.[c])), (l.sources || []).join(' '),
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
    calcul: 'Stouffer : somme des z / racine(nombre). Salle : un z par seconde. Témoin : chaque valeur fraîche une fois.',
    version_app: version,
  }, null, 2);
}

// Texte du resume : « la salle : z = … · le témoin : z = … »
export function texteResume(r) {
  const f = z => z.toFixed(2).replace('.', ',');
  const salle = fini(r.zSalle) ? `la salle : z = ${f(r.zSalle)} (${r.nSalle} s)` : 'la salle : pas de mesure';
  const temoin = fini(r.zTemoin) ? `le témoin : z = ${f(r.zTemoin)} (${r.nTemoin} valeur${r.nTemoin > 1 ? 's' : ''})` : 'le témoin : pas de mesure';
  return `${salle} · ${temoin}`;
}
