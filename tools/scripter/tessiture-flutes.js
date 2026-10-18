/*
		Tessiture des flûtes, en sons réels (convention MainStage : 60 = Do3)
		- Flûte traversière : Do3 à Do6 (60 à 96)
		- Piccolo : Ré4 à Do7 (74 à 108), il sonne une octave au-dessus de l'écrit
		- Flûte basse : Do2 à Do5 (48 à 84), elle sonne une octave en dessous
		Le menu « Instrument » règle les deux bornes. Pour des bornes à soi,
		choisir « Réglage libre » d'abord, puis tourner les deux boutons
		(sinon l'instrument choisi reprend ses bornes au prochain chargement).

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
		{ nom: "Flûte traversière", grave: 60, aigue: 96 },
		{ nom: "Piccolo", grave: 74, aigue: 108 },
		{ nom: "Flûte basse", grave: 48, aigue: 84 },
		{ nom: "Réglage libre" },
];

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
		defaultValue:96
}, {
		name:"Note la plus grave",
		type:"linear",
		minValue:0,
		maxValue:127,
		numberOfSteps:127,
		defaultValue:60
}, {
		name:"Instrument",
		type:"menu",
		valueStrings:INSTRUMENTS.map(function (i) { return i.nom; }),
		defaultValue:0
}];