/*
		Bols chantants (EXS24 « Tibetan Singing Bowls », convention MainStage : 60 = Do3)
		L'instrument range ses sons par zones : Swell (bols qui enflent) tout en bas
		(Do-2 à Si0), effets de bouche (Do1 à Mi2), coups de mailloche au milieu
		(Fa2 à Do#6, mailloche douce sous la force 69, dure au-dessus), Bowed (bols
		frottés) tout en haut (Ré6 à Do8). Les notes du programme tombaient toutes
		dans les mailloches, et frappaient fort quand la cohérence montait.
		- Chant : la plupart des notes partent vers la zone chantée choisie, sur la
		  même note (Do reste Do) : un accord reste le même accord.
		- Coups (%) : la part des notes qui restent des coups, toujours à la
		  mailloche douce (force plafonnée à « Force max des coups »).
		- Force max du chant : plafond de la force des notes chantées.
		- L'instrument transpose ses enregistrements selon la touche : les notes
		  chantées sont placées au bas de la zone Bowed (Ré6 à Do#7), au plus près
		  de leur hauteur d'origine. Pour les descendre encore (graves et médiums),
		  régler « Transpose » dans l'EXS24 de la tranche (-12, ou -24) : tout
		  l'instrument descend d'une ou deux octaves, accords compris.
		  ATTENTION : vérifié le 17/10/2026, le Transpose de l'EXS24 décale aussi les
		  touches. À -24, les notes chantées tombent dans les mailloches et frappent.
		  Le laisser à 0. Pour des bols graves, choisir Chant = Swell.
		- Hauteur du swell : « Naturelle » (Do0 à Si0, près de la hauteur d'origine)
		  ou « Grave » (Do-1 à Si-1, nettement plus bas).
*/

var CHANTS = ["Bowed (frotté)", "Swell (qui enfle)", "Les deux, en alternance"];
var P = { CHANT: 0, COUPS: 1, FCOUPS: 2, FCHANT: 3, HSWELL: 4 };
var HAUTEURS = ["Naturelle", "Grave"];
var ACTIVES = {};
var alterne = 0;

function HandleMIDI(event) {
		if (event instanceof NoteOn) {
				var pc = ((event.pitch % 12) + 12) % 12;
				var note, force;
				if (Math.random() * 100 < GetParameter(P.COUPS)) {
						note = event.pitch;
						while (note < 53) note += 12;    // zone des mailloches : Fa2 à Do#6
						while (note > 97) note -= 12;
						force = Math.min(event.velocity, GetParameter(P.FCOUPS));
				} else {
						var mode = GetParameter(P.CHANT);
						var bowed = mode === 0 || (mode === 2 && (alterne++ % 2 === 0));
						// Bowed : Ré6 à Do#7, au plus près de la hauteur d'origine des enregistrements
						// (l'instrument transpose selon la touche) ; Swell : Do-1 à Si-1
						// Swell « naturelle » : Do0 à Si0, à quelques demi-tons de la hauteur
						// d'origine ; « grave » : Do-1 à Si-1, 6 à 17 demi-tons plus bas
						var swell = GetParameter(P.HSWELL) === 0 ? 24 + pc : 12 + pc;
						note = bowed ? 98 + ((pc - 2 + 12) % 12) : swell;
						force = Math.min(event.velocity, GetParameter(P.FCHANT));
				}
				ACTIVES[event.pitch] = note;
				event.pitch = note;
				event.velocity = Math.max(1, force);
				event.send();
		} else if (event instanceof NoteOff) {
				var n = ACTIVES[event.pitch];
				if (n === undefined) return;
				delete ACTIVES[event.pitch];
				event.pitch = n;
				event.send();
		} else {
				event.send();
		}
}

var PluginParameters = [
		{ name: "Chant", type: "menu", valueStrings: CHANTS, defaultValue: 1 },
		{ name: "Coups (%)", type: "lin", minValue: 0, maxValue: 100, numberOfSteps: 100, defaultValue: 15 },
		{ name: "Force max des coups", type: "lin", minValue: 1, maxValue: 68, numberOfSteps: 67, defaultValue: 55 },
		{ name: "Force max du chant", type: "lin", minValue: 1, maxValue: 127, numberOfSteps: 126, defaultValue: 100 },
		{ name: "Hauteur du swell", type: "menu", valueStrings: HAUTEURS, defaultValue: 0 },
];
