/*
		Arpège à phases (convention MainStage : 60 = Do3)
		Remplace l'Arpeggiator quand on veut des silences. L'arpège entre quand la
		note qu'il reçoit change (la nappe passe d'un pilier à l'autre : un
		changement d'harmonie du programme), au début de la mesure suivante.
		Il joue « Durée de jeu » temps, s'efface en fondu, et attend le changement
		suivant. Ses entrées tombent donc avec la musique, jamais au hasard.
		Rien n'est changé dans le programme.
		- Durée de jeu (temps) : combien de temps il joue après chaque changement.
		  La nappe change de note toutes les 10 s au moins : avec 8 temps à un
		  tempo lent, il joue à peu près la moitié du temps.
		- Mesure (temps) : les entrées ne tombent qu'en début de mesure.
		- Fondu (notes) : à l'entrée la force monte sur ce nombre de notes, à la
		  sortie elle redescend. Rien n'est coupé net.
		- Ordre, valeur d'une note, octaves, longueur : repris de l'Arpeggiator
		  de « Metal nocturne » (monte-descend, 1/16, 3 octaves, 90 %).
		(Une version qui suivait la cohérence par le CC 20 a été écartée le
		17/10/2026 : le contrôleur n'arrivait pas jusqu'au Scripter.)
*/

var NeedsTimingInfo = true;

var ORDRES = ["Montant", "Descendant", "Monte-descend", "Au hasard"];
var DIVISIONS = [{ nom: "1/8", parTemps: 2 }, { nom: "1/16", parTemps: 4 }];
var P = { ORDRE: 0, DIV: 1, OCT: 2, LONG: 3, DUREE: 4, MESURE: 5, FONDU: 6 };

var tenues = [];
var derniereHauteur = null;
var attendu = false;     // un changement attend le début de mesure
var debut = -1;          // temps où la phase de jeu a commencé (-1 : silence)
var dernier = -1;        // dernier pas traité (jamais deux fois le même)

function HandleMIDI(event) {
		if (event instanceof NoteOn) {
				if (event.pitch !== derniereHauteur) { attendu = true; derniereHauteur = event.pitch; }
				tenues.push({ pitch: event.pitch, velocity: event.velocity });
		} else if (event instanceof NoteOff) {
				for (var i = tenues.length - 1; i >= 0; i--) {
						if (tenues[i].pitch === event.pitch) { tenues.splice(i, 1); break; }
				}
		} else {
				event.send();
		}
}

// Force relative (0 à 1) au temps `beat`
function gain(beat, division) {
		var mesure = GetParameter(P.MESURE);
		var debutMesure = Math.abs(beat / mesure - Math.round(beat / mesure)) < 1e-6;
		if (attendu && debutMesure) { attendu = false; debut = beat; }
		if (debut < 0) return 0;
		var duree = GetParameter(P.DUREE);
		var fondu = GetParameter(P.FONDU) / division;
		var t = beat - debut;
		if (t >= duree) { debut = -1; return 0; }
		var pas = 1 / division;
		var g = 1;
		if (fondu > 0) g = Math.min(1, (t + pas) / (fondu + pas), (duree - t) / (fondu + pas));
		return Math.max(0, g);
}

function choisir(k) {
		var liste = tenues.slice().sort(function (a, b) { return a.pitch - b.pitch; });
		var octaves = GetParameter(P.OCT), notes = [];
		for (var o = 0; o < octaves; o++) for (var j = 0; j < liste.length; j++) notes.push({ pitch: liste[j].pitch + 12 * o, velocity: liste[j].velocity });
		var n = notes.length, i, ordre = GetParameter(P.ORDRE);
		if (ordre === 0) i = k % n;
		else if (ordre === 1) i = n - 1 - (k % n);
		else if (ordre === 2) { var c = Math.max(1, 2 * n - 2); var r = k % c; i = r < n ? r : c - r; }
		else i = Math.floor(Math.random() * n);
		return notes[i];
}

function ProcessMIDI() {
		var info = GetTimingInfo();
		var division = DIVISIONS[GetParameter(P.DIV)].parTemps;
		var beat = Math.ceil(info.blockStartBeat * division - 1e-9) / division;
		while (beat < info.blockEndBeat) {
				if (beat <= dernier + 1e-6) { beat += 1 / division; continue; }
				dernier = beat;
				var g = gain(beat, division);
				if (g > 0 && tenues.length) {
						var c = choisir(Math.abs(Math.round(beat * division)));
						var v = Math.round(c.velocity * g);
						if (v >= 1 && c.pitch <= 127) {
								var on = new NoteOn();
								on.pitch = c.pitch;
								on.velocity = v;
								on.sendAtBeat(beat);
								var off = new NoteOff(on);
								off.sendAtBeat(beat + (GetParameter(P.LONG) / 100) / division);
						}
				}
				beat += 1 / division;
		}
}

var PluginParameters = [
		{ name: "Ordre", type: "menu", valueStrings: ORDRES, defaultValue: 2 },
		{ name: "Valeur d'une note", type: "menu", valueStrings: DIVISIONS.map(function (d) { return d.nom; }), defaultValue: 1 },
		{ name: "Octaves", type: "lin", minValue: 1, maxValue: 4, numberOfSteps: 3, defaultValue: 3 },
		{ name: "Longueur des notes (%)", type: "lin", minValue: 10, maxValue: 100, numberOfSteps: 90, defaultValue: 90 },
		{ name: "Durée de jeu (temps)", type: "lin", minValue: 2, maxValue: 32, numberOfSteps: 30, defaultValue: 8 },
		{ name: "Mesure (temps)", type: "lin", minValue: 1, maxValue: 16, numberOfSteps: 15, defaultValue: 4 },
		{ name: "Fondu (notes)", type: "lin", minValue: 0, maxValue: 16, numberOfSteps: 16, defaultValue: 6 },
];
