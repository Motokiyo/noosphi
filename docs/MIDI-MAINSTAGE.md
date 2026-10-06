# Jouer le z-score dans MainStage (U1 virtuel)

L'app Noosfeerique peut envoyer le z-score en notes MIDI, comme le boîtier U1 le fait avec une plante. MainStage reçoit ces notes comme s'il s'agissait d'un clavier branché.

Il faut un Mac avec Chrome (Safari ne sait pas envoyer de MIDI). Aucune autre installation n'est nécessaire.

## Une seule fois : activer le câble MIDI virtuel du Mac

1. Ouvrir **Configuration audio et MIDI** (dans Applications > Utilitaires).
2. Menu **Fenêtre > Afficher le studio MIDI**.
3. Double-cliquer sur **Gestionnaire IAC**.
4. Cocher **Le gestionnaire est en ligne**, puis cliquer sur Appliquer.

Un « Bus 1 » apparaît. C'est le câble virtuel entre Chrome et MainStage.

## À chaque séance

1. Dans Chrome, ouvrir `https://noosfeerique.leparede.org/experience.html?midi=1`. Le `?midi=1` affiche le panneau MIDI, qui reste caché sans lui.
2. Choisir la source dans le menu de l'app (combiné, QCI, local…). Le MIDI suit cette source, comme le son et la sphère.
3. Cliquer sur **Activer le MIDI**, et accepter la demande d'accès MIDI de Chrome.
4. Vérifier que la sortie indique **Bus IAC**.
5. Dans MainStage, régler l'entrée du clavier voulu sur **IAC Bus 1** (ou « Tous les ports »), à la place du U1.

**Panique** coupe immédiatement toutes les notes.

## Ce que fait le U1 virtuel

| Le U1 | Le U1 virtuel |
|---|---|
| Une note quand la résistance de la plante bouge | Une note quand le z-score bouge |
| Event Filter : taille minimale du changement | **Seuil de mouvement** (1,5 par défaut) |
| Sample Rate | Le z est lu une fois par seconde |
| Gamme La majeur ou chromatique | **Gamme** : celle de l'app, La majeur (U1) ou chromatique |

Le z joue des **phrases**, et aucune horloge ne décide de leur longueur :

1. **Phrase** : la première note part du **centre**. Chaque z suivant est un intervalle à partir de la note qui sonne (z = -2 descend de 4 degrés depuis cette note).
2. **Cadence** : quand la mélodie revient sur le centre, ou touche un bord du clavier, cette note finale tient.
3. **Silence** : le mouvement suivant du z éteint la note. Le mouvement d'après ouvre une nouvelle phrase.

Chaque note sonne au moins la **durée minimale** (0,5 s par défaut). Toutes les notes ont la même force de frappe.

## Réglages

| Réglage | Effet |
|---|---|
| Canal | Canal MIDI d'envoi (1 à 16) |
| Note la plus grave / aiguë | Étendue du clavier (21 à 108 = piano 88 touches) |
| Centre (départ) | Note de départ de chaque phrase (60 = Do3 dans MainStage) |
| Degrés par unité de z | Taille des intervalles (2 : z = 1 monte de 2 degrés de la gamme) |
| Seuil de mouvement | Plus haut : moins de notes, plus de tenues et de silences |
| Maison (± degrés) | 0 : la phrase finit sur le centre exact. Plus grand : des phrases plus courtes |
| Durée min. | Durée minimale d'une note |

Les réglages sont gardés dans Chrome d'une séance à l'autre.

## À savoir

- **Vitesse maximale : une note par seconde.** Les sources ne livrent pas plus vite.
- **Princeton seul** ne change qu'une fois par minute : la mélodie reste immobile une minute.
- **Combiné** contient le hasard du serveur, qui ne change qu'une fois par minute. Pendant cette minute, il pousse toutes les notes dans la même direction, puis la minute suivante il peut faire repartir dans l'autre sens. QCI seul ou local seul n'ont pas cet effet.
- Il faut internet pour charger la page, même avec la source locale.

## Ordre de grandeur (100 heures simulées, réglages par défaut)

Environ 45 phrases par heure. Une phrase compte de 3 à 50 notes (15 d'habitude) et dure de quelques secondes à quelques minutes. Les silences vont de 1 à 16 secondes, parfois près d'une minute.
