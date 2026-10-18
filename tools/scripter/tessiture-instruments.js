/*
		Tessiture de l'instrument, en sons réels (convention MainStage : 60 = Do3)
		Le menu « Instrument » règle les deux bornes. Les notes de la tessiture
		ne bougent pas ; une note trop grave joue dans l'octave la plus basse,
		une note trop aiguë dans l'octave la plus haute.
		Pour des bornes à soi, choisir « Réglage libre » d'abord, puis tourner
		les deux boutons (sinon l'instrument choisi reprend ses bornes au
		prochain chargement). DEFAUT = l'instrument choisi au premier lancement.

		D'après le préréglage Apple « Octave Wrapper.pst », retouches : libellés
		en français, menu des instruments, et un relâchement sans note connue
		n'est pas envoyé.

		Octave Wrapper.pst
		
		This PST allows you to set a range of active notes. If notes fall outside of
		this range, they will be transposed up or down until they are within the 
		range. If a transposed note falls outside of the defined range, it will be
		filtered out (not sent). Any actives notes that fall outside of this range
		will be canceled (noteOff will be sent). 
		
		The high range can never be less than the low range, and vice versa. 
*/

var INSTRUMENTS = [
		{ nom: "Flûte traversière", grave: 60, aigue: 96 },   // Do3 à Do6
		{ nom: "Piccolo", grave: 74, aigue: 108 },            // Ré4 à Do7
		{ nom: "Flûte basse", grave: 48, aigue: 84 },         // Do2 à Do5
		{ nom: "Hautbois", grave: 58, aigue: 91 },            // Si♭2 à Sol5
		{ nom: "Clarinette", grave: 50, aigue: 91 },          // Ré2 à Sol5
		{ nom: "Basson", grave: 34, aigue: 72 },              // Si♭0 à Do4
		{ nom: "Cor", grave: 41, aigue: 77 },                 // Fa1 à Fa4
		{ nom: "Trompette", grave: 55, aigue: 82 },           // Sol2 à Si♭4
		{ nom: "Trombone", grave: 40, aigue: 72 },            // Mi1 à Do4
		{ nom: "Tuba", grave: 28, aigue: 58 },                // Mi0 à Si♭2
		{ nom: "Violon", grave: 55, aigue: 96 },              // Sol2 à Do6
		{ nom: "Alto", grave: 48, aigue: 84 },                // Do2 à Do5
		{ nom: "Violoncelle", grave: 36, aigue: 76 },         // Do1 à Mi4
		{ nom: "Contrebasse", grave: 28, aigue: 55 },         // Mi0 à Sol2
		{ nom: "Hang / Halo (Pan Drums)", grave: 48, aigue: 84 },  // Do2 à Do5, évite les changements de frappe Do1 à Mi1
		{ nom: "Réglage libre" },
];
var DEFAUT = 6;   // Cor (changer ce numéro pour un autre instrument par défaut)

var ACTIVE_NOTES = {};
var HIGH_RANGE;
var LOW_RANGE;

function HandleMIDI (event) {	
		if (event instanceof NoteOn) {
				var originalNote = event.pitch;
				var newNote = originalNote;
			
				if (newNote > HIGH_RANGE) {
						while (newNote > HIGH_RANGE) {
								newNote -= 12;
						}
				}
				
				if (newNote < LOW_RANGE) {
						while (newNote < LOW_RANGE) {
								newNote += 12;
						}
				}
								
				if(newNote > HIGH_RANGE || newNote < LOW_RANGE) {
						//don't send 		
				} else {
						ACTIVE_NOTES[originalNote] = newNote;
						event.pitch = newNote;
						event.send();
 				} 				
		} else if (event instanceof NoteOff) {
				var temp = event.pitch;
				if (ACTIVE_NOTES[temp] === undefined) return;   // note jamais envoyee
				event.pitch = ACTIVE_NOTES[temp];
				delete ACTIVE_NOTES[temp];
				event.send();
		} else {
				event.send();		
		}
}

function ParameterChanged (param, value) {
		switch (param) {
				case 0:
						HIGH_RANGE = value;
						if (value < LOW_RANGE) {
								SetParameter(1, value);
						} 
						break;
				case 1:
						LOW_RANGE = value;
						if (value > HIGH_RANGE) {
								SetParameter(0, value);
						}
						break;
				case 2:
						var instrument = INSTRUMENTS[value];
						if (instrument && instrument.grave != null) {
								SetParameter(0, instrument.aigue);
								SetParameter(1, instrument.grave);
						}
						break;
				default:
						//nothing
		}
		
		for (var key in ACTIVE_NOTES) {				
				if (ACTIVE_NOTES[key] > HIGH_RANGE || ACTIVE_NOTES[key] < LOW_RANGE) {
						var noteOff = new NoteOff();
						noteOff.pitch = ACTIVE_NOTES[key];
						noteOff.send();
						delete ACTIVE_NOTES[key];
				}
		}
}

var PluginParameters = [{
		name:"Note la plus aiguë",
		type:"linear",
		minValue:0,
		maxValue:127,
		numberOfSteps:127,
		defaultValue:INSTRUMENTS[DEFAUT].aigue
}, {
		name:"Note la plus grave",
		type:"linear",
		minValue:0,
		maxValue:127,
		numberOfSteps:127,
		defaultValue:INSTRUMENTS[DEFAUT].grave
}, {
		name:"Instrument",
		type:"menu",
		valueStrings:INSTRUMENTS.map(function (i) { return i.nom; }),
		defaultValue:DEFAUT
}];