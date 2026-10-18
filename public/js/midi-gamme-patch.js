/* ============================================================
   Noosfeerique — Gamme du patch (U1 virtuel)
   Chaque patch MainStage annonce son genre de gamme a l'app : une tranche
   « Instrument externe » du patch, sortie MIDI « Retour Noos », envoie a son
   chargement un petit fichier MIDI (tools/mainstage-gammes/). Ce fichier ne
   contient qu'un message : CC 104 sur le canal 16, dont la valeur dit le genre.

   Le genre remplace celui du reglage general ; la tonique ne change pas.
   Valeur 0 : retour au reglage general. Un patch qui n'envoie rien garde
   le genre du patch d'avant.

   Pas de changement de programme : MainStage ecoute aussi Retour Noos et
   sauterait vers le patch qui porte ce numero (essai du 18/10/2026).
   ============================================================ */

export const CANAL_GAMME = 16;
export const CC_GAMME = 104;

// Valeur du CC -> gamme (cle de SCALES dans midi-engine.js). null = reglage general
export const GAMMES_PATCH = [
  [0, null, 'Générale'],
  [1, 'pentatonic', 'Pentatonique'],
  [2, 'major', 'Majeure'],
  [3, 'minor', 'Mineure'],
  [4, 'dorian', 'Dorienne'],
  [5, 'chromatic', 'Chromatique'],
];

// Message MIDI recu -> { gamme, nom } si c'est une annonce de gamme, sinon undefined
export function lireGammePatch(data) {
  if (!data || data.length < 3) return undefined;
  if (data[0] !== (0xB0 | (CANAL_GAMME - 1)) || data[1] !== CC_GAMME) return undefined;
  const entree = GAMMES_PATCH.find(([v]) => v === data[2]);
  return entree ? { gamme: entree[1], nom: entree[2] } : undefined;
}
