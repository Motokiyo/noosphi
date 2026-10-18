/*
		Lead dans le 7 temps (convention MainStage : 60 = Do3)
		Remplace l'Arpeggiator sur la tranche de la lead : aucune note n'est ajoutée.
		Chaque note qui arrive est retardée jusqu'au prochain pas coché de la grille,
		la même que celle de « Percus 7 temps » : même horloge du concert, même
		pas 1. La note garde sa durée. La mélodie reste choisie par le z, elle
		tombe seulement dans le 7 temps des percussions.
		- Pas et Valeur d'un pas : à régler comme sur « Percus 7 temps » (7 et 1/16).
		- Pas 1 à 16 : coché = une note peut tomber sur ce pas. Par défaut les pas
		  forts des percussions (1, 3, 5 et 7) : une note attend au plus deux pas.
		- Deux notes ne tombent jamais sur le même pas : dans un trait rapide du
		  programme, chaque note prend le pas coché suivant (le trait court dans la
		  grille au lieu de s'empiler).
*/

var NeedsTimingInfo = true;

var DIVISIONS = [{ nom: "1/8", parTemps: 2 }, { nom: "1/16", parTemps: 4 }];
var PERMIS = [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var P = { PAS: 0, DIV: 1, PERMIS: 2 };
var retards = {};   // hauteur -> retard (en temps) appliqué à sa note
var dernier = -1;   // temps du dernier pas pris par une note

function maintenant(event) {
		if (event.beatPos !== undefined && event.beatPos > 0) return event.beatPos;
		return GetTimingInfo().blockStartBeat;
}

// Premier pas coché à partir de `beat` (inclus) ; sans pas coché, pas de retard
function prochainPas(beat) {
		var division = DIVISIONS[GetParameter(P.DIV)].parTemps;
		var longueur = GetParameter(P.PAS);
		var k = Math.ceil(beat * division - 1e-6);
		for (var i = 0; i < longueur; i++) {
				var pas = (((k + i) % longueur) + longueur) % longueur;
				if (GetParameter(P.PERMIS + pas)) return (k + i) / division;
		}
		return beat;
}

function HandleMIDI(event) {
		if (event instanceof NoteOn) {
				var t = maintenant(event);
				var division = DIVISIONS[GetParameter(P.DIV)].parTemps;
				var cible = prochainPas(Math.max(t, dernier + 0.5 / division));
				dernier = cible;
				retards[event.pitch] = cible - t;
				event.sendAtBeat(cible);
		} else if (event instanceof NoteOff) {
				var r = retards[event.pitch];
				delete retards[event.pitch];
				if (r === undefined || r <= 0) { event.send(); return; }
				event.sendAtBeat(maintenant(event) + r);
		} else {
				event.send();
		}
}

var PluginParameters = [
		{ name: "Pas", type: "lin", minValue: 1, maxValue: 16, numberOfSteps: 15, defaultValue: 7 },
		{ name: "Valeur d'un pas", type: "menu", valueStrings: DIVISIONS.map(function (d) { return d.nom; }), defaultValue: 1 },
];
for (var g = 0; g < 16; g++) {
		PluginParameters.push({ name: "Pas " + (g + 1), type: "checkbox", defaultValue: PERMIS[g] });
}
