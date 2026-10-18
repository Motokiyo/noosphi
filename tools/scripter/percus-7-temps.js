/*
		Percus 7 temps (kit « Orchestral Kit » d'EXS24, convention MainStage : 60 = Do3)
		Remplace l'Arpeggiator sur la tranche des percussions, qui n'a qu'un effet MIDI.
		Sur le tempo du concert, la grille joue ses pas tant que des notes tiennent.

		Mode « Toutes les notes tenues » (comme l'Arpeggiator d'avant) : chaque pas
		prend la note tenue suivante, dans l'ordre choisi, et la joue sur sa touche
		du kit. Plusieurs notes tenues = plusieurs instruments mêlés sur les pas.
		Les touches qui sonnent mal en boucle (tam-tam, gongs, cymbales, trémolos,
		fouet, crécelle, « orchestral hit ») sont déviées vers la touche permise
		la plus proche : elles ne sonnent jamais.
		Mode « Piliers I / IV / V » : la note la plus récente choisit sa percussion
		dans les menus I, IV et V (« Tonique » : Do pour les gammes de l'app, La
		pour La majeur du U1).

		- Pas : longueur de la grille (7 = un 7 temps). Valeur d'un pas : 1/8 ou 1/16.
		- Pas 1 à 16 : force de chaque pas, 0 = silence. La force suit aussi celle
		  de la note reçue (la force flottante du programme).
		- Octave pas 1 à 16 : chaque pas peut jouer sa note une ou deux octaves plus
		  haut ou plus bas. Dans un kit, une autre octave est un autre instrument :
		  c'est ce qui mêle plusieurs percussions sur les pas, même avec une seule
		  note tenue (comme la grille de l'Arpeggiator d'avant).
		- Hasard des instruments (%) : à chaque pas, la chance qu'il prenne une autre
		  octave au hasard, donc un autre instrument. C'est ce qui évite d'entendre
		  la boucle se répéter (comme la « Variation » de l'Arpeggiator).
		- Hasard des forces (%) : chaque frappe varie un peu autour de sa force.
		- La grille est calée sur l'horloge du concert : le pas 1 tombe toujours
		  au même endroit, quelle que soit l'heure d'arrivée des notes.
*/

var NeedsTimingInfo = true;

// Touches du kit qui ne doivent jamais sonner en boucle
var INTERDITES = [32, 33, 34, 42, 44, 46, 49, 53, 55, 56, 57, 58, 59, 69, 70, 71, 72, 78, 79, 80, 81, 85, 104];

var PERCUS = [
		{ nom: "Taiko grave", note: 47 }, { nom: "Taiko", note: 48 }, { nom: "Taiko aigu", note: 50 },
		{ nom: "Roto-tom grave", note: 41 }, { nom: "Roto-tom", note: 43 }, { nom: "Roto-tom aigu", note: 45 },
		{ nom: "Grosse caisse", note: 36 }, { nom: "Grosse caisse étouffée", note: 35 },
		{ nom: "Caisse claire", note: 37 }, { nom: "Tambour de marche", note: 39 },
		{ nom: "Wood block 1 (grave)", note: 60 }, { nom: "Wood block 2", note: 61 }, { nom: "Wood block 3", note: 62 },
		{ nom: "Wood block 4", note: 63 }, { nom: "Wood block 5 (aigu)", note: 64 },
		{ nom: "Claves", note: 75 }, { nom: "Tambour à fente", note: 76 }, { nom: "Tambourin", note: 54 },
		{ nom: "Shaker", note: 82 }, { nom: "Grelots", note: 52 }, { nom: "Silence", note: -1 },
];
var NOTES = ["Do", "Do#", "Ré", "Ré#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
var MODES = ["Toutes les notes tenues", "Piliers I / IV / V"];
var ORDRES = ["Montant", "Descendant", "Monte-descend", "Au hasard"];
var DIVISIONS = [{ nom: "1/8", parTemps: 2 }, { nom: "1/16", parTemps: 4 }];
var GRILLE = [110, 30, 105, 15, 60, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0];   // la grille d'avant : appuis 1, 3, 5
var OCTAVES = ["-2", "-1", "0", "+1", "+2"];
var GRILLE_OCT = [0, 1, -1, 1, 0, 2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0];   // un instrument différent presque à chaque pas
var P = { MODE: 0, ORDRE: 1, TONIQUE: 2, I: 3, IV: 4, V: 5, PAS: 6, DIV: 7, LONG: 8, GRILLE: 9, OCT: 25, H_INSTR: 41, H_FORCE: 42 };

var tenues = [];   // notes qui tiennent, dans l'ordre d'arrivée

function permise(n) {
		if (INTERDITES.indexOf(n) < 0) return n;
		for (var d = 1; d < 24; d++) {
				if (n - d >= 21 && INTERDITES.indexOf(n - d) < 0) return n - d;
				if (n + d <= 103 && INTERDITES.indexOf(n + d) < 0) return n + d;
		}
		return -1;
}

function pilier(pitch) {
		var degre = ((pitch - GetParameter(P.TONIQUE)) % 12 + 12) % 12;
		var p = degre === 5 ? P.IV : degre === 7 ? P.V : P.I;
		return PERCUS[GetParameter(p)].note;
}

// La note tenue que joue le pas numéro k (compté depuis le début du concert)
function choisir(k) {
		if (GetParameter(P.MODE) === 1) {
				var t = tenues[tenues.length - 1];
				return { note: pilier(t.pitch), velocity: t.velocity };
		}
		var liste = tenues.slice().sort(function (a, b) { return a.pitch - b.pitch; });
		var n = liste.length, i;
		var ordre = GetParameter(P.ORDRE);
		if (ordre === 0) i = k % n;
		else if (ordre === 1) i = n - 1 - (k % n);
		else if (ordre === 2) { var c = Math.max(1, 2 * n - 2); var j = k % c; i = j < n ? j : c - j; }
		else i = Math.floor(Math.random() * n);
		return { note: liste[i].pitch, velocity: liste[i].velocity };
}

function HandleMIDI(event) {
		if (event instanceof NoteOn) {
				tenues.push({ pitch: event.pitch, velocity: event.velocity });
		} else if (event instanceof NoteOff) {
				for (var i = tenues.length - 1; i >= 0; i--) {
						if (tenues[i].pitch === event.pitch) { tenues.splice(i, 1); break; }
				}
		} else {
				event.send();
		}
}

function ProcessMIDI() {
		if (!tenues.length) return;
		var info = GetTimingInfo();
		var division = DIVISIONS[GetParameter(P.DIV)].parTemps;
		var longueur = GetParameter(P.PAS);
		var duree = (GetParameter(P.LONG) / 100) / division;
		var beat = Math.ceil(info.blockStartBeat * division - 1e-9) / division;
		while (beat < info.blockEndBeat) {
				var k = Math.round(beat * division);
				var pas = ((k % longueur) + longueur) % longueur;
				var force = GetParameter(P.GRILLE + pas);
				var c = choisir(Math.abs(k));
				var note = c.note;
				if (note >= 0 && GetParameter(P.MODE) === 0) {
						var oct = GetParameter(P.OCT + pas) - 2;
						if (Math.random() * 100 < GetParameter(P.H_INSTR)) oct = Math.floor(Math.random() * 4) - 1;   // -1 à +2
						note = permise(Math.max(21, Math.min(103, note + 12 * oct)));
				}
				var h = GetParameter(P.H_FORCE) / 100;
				force = force * (1 + h * (2 * Math.random() - 1));
				if (force > 0 && note >= 0) {
						var on = new NoteOn();
						on.pitch = note;
						on.velocity = Math.max(1, Math.min(127, Math.round(force * c.velocity / 127)));
						on.sendAtBeat(beat);
						var off = new NoteOff(on);
						off.sendAtBeat(beat + duree);
				}
				beat += 1 / division;
		}
}

var NOMS = PERCUS.map(function (p) { return p.nom; });
var PluginParameters = [
		{ name: "Mode", type: "menu", valueStrings: MODES, defaultValue: 0 },
		{ name: "Ordre", type: "menu", valueStrings: ORDRES, defaultValue: 0 },
		{ name: "Tonique (piliers)", type: "menu", valueStrings: NOTES, defaultValue: 0 },
		{ name: "I (piliers)", type: "menu", valueStrings: NOMS, defaultValue: 1 },
		{ name: "IV (piliers)", type: "menu", valueStrings: NOMS, defaultValue: 4 },
		{ name: "V (piliers)", type: "menu", valueStrings: NOMS, defaultValue: 12 },
		{ name: "Pas", type: "lin", minValue: 1, maxValue: 16, numberOfSteps: 15, defaultValue: 7 },
		{ name: "Valeur d'un pas", type: "menu", valueStrings: DIVISIONS.map(function (d) { return d.nom; }), defaultValue: 1 },
		{ name: "Longueur des notes (%)", type: "lin", minValue: 10, maxValue: 100, numberOfSteps: 90, defaultValue: 90 },
];
for (var g = 0; g < 16; g++) {
		PluginParameters.push({ name: "Pas " + (g + 1), type: "lin", minValue: 0, maxValue: 127, numberOfSteps: 127, defaultValue: GRILLE[g] });
}
for (var o = 0; o < 16; o++) {
		PluginParameters.push({ name: "Octave pas " + (o + 1), type: "menu", valueStrings: OCTAVES, defaultValue: GRILLE_OCT[o] + 2 });
}
PluginParameters.push({ name: "Hasard des instruments (%)", type: "lin", minValue: 0, maxValue: 100, numberOfSteps: 100, defaultValue: 40 });
PluginParameters.push({ name: "Hasard des forces (%)", type: "lin", minValue: 0, maxValue: 50, numberOfSteps: 50, defaultValue: 20 });

// Contrôle : écrit dans la console les réglages réellement chargés
function ParameterChanged(param, value) {
		if (param !== PluginParameters.length - 1) return;
		var o = [];
		for (var i = 0; i < 7; i++) o.push(OCTAVES[GetParameter(P.OCT + i)]);
		Trace("CONTROLE octaves " + o.join(" ") + " | hasard instruments " + GetParameter(P.H_INSTR) + " | hasard forces " + GetParameter(P.H_FORCE));
}
