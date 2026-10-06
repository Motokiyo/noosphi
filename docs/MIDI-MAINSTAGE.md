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
| Event Filter : taille minimale du changement | **Seuil de mouvement** (1 par défaut) |
| Sample Rate | Le z est lu une fois par seconde, et ses décimales placent la note dans la seconde |
| Gamme La majeur ou chromatique | **Gamme** : celle de l'app, La majeur (U1) ou chromatique |

Le z joue des **phrases**, et aucune horloge ne décide de leur longueur :

1. **Phrase** : la première note part du **centre**. Chaque z suivant est un intervalle à partir de la note qui sonne (z = -2 descend de 4 degrés depuis cette note).
2. **Cadence** : quand la mélodie revient sur le centre, ou touche un bord du clavier, cette note finale tient.
3. **Silence** : le mouvement suivant du z éteint la note. Le mouvement d'après ouvre une nouvelle phrase, depuis le centre.

Le z est lu à chaque seconde, mais ses décimales placent l'événement dans la seconde (z = 1,37 : 0,37 s après le tic). Les durées ne tombent donc pas sur une grille.

Chaque note sonne au moins la **durée minimale** (0,5 s par défaut). Toutes les notes ont la même force de frappe.

## La cohérence, rendue audible

La cohérence, au sens du Global Consciousness Project, c'est quand le z garde le même cap. Le U1 virtuel la mesure sur la dernière minute (méthode Stouffer de Princeton) et la musique change par paliers :

| Niveau | Mesure | Ce qu'on entend |
|---|---|---|
| Hasard | sous 1,5 | Phrases éparses, intervalles libres |
| Approche | 1,5 et plus | Mélodie liée, petits pas, gamme pentatonique si l'app est en chromatique |
| Cohérence | 2 et plus | Un accord de trois sons sur le **canal 2** avec chaque note |
| Forte | 2,5 et plus | La mélodie se pose sur la note centrale, l'accord tient |

On ne sort d'un niveau qu'en redescendant un peu sous son seuil d'entrée (1,3 / 1,7 / 2,2), pour éviter que la musique clignote.

Sous le pur hasard, la cohérence (2 et plus) n'occupe qu'environ 6 % du temps. Relevé réel de 15 minutes sur les sources locale et QCI : 81,9 / 13,1 / 4,4 / 0,6 % du temps par niveau, conforme au hasard.

Le niveau est aussi envoyé en continu sur le **contrôleur 20** (0 à 127), sur les deux canaux. Il n'agit que si tu l'assignes dans MainStage. Toutes les notes ont la même frappe : les volumes se règlent dans MainStage.

**Sources utilisées pour le MIDI**, pour éviter toute fausse cohérence : en session collective, le z des téléphones et de l'ordinateur hôte (chaque tirage compte une fois, un téléphone muet depuis 3 s est écarté) ; sur « combiné », le hasard local et QCI seulement, sans les sources qui ne changent qu'une fois par minute.

## En concert : le lanceur

Double-cliquer sur `tools/U1-virtuel.command`. Il ouvre le U1 virtuel dans une fenêtre Chrome à part, protégée : sans elle, Chrome endort la page dès que MainStage passe devant. La première fois, autoriser le MIDI dans cette fenêtre.

Les notes partent datées à l'avance : le système MIDI du Mac les joue à l'heure exacte, même fenêtre cachée.

## Réglages

| Réglage | Effet |
|---|---|
| Canal mélodie / harmonie | Canaux MIDI d'envoi (1 et 2 par défaut) |
| Note la plus grave / aiguë | Étendue du clavier (21 à 108 = piano 88 touches) |
| Centre (départ) | Note de départ de chaque phrase (60 = Do3 dans MainStage) |
| Degrés par unité de z | Taille des intervalles (2 : z = 1 monte de 2 degrés de la gamme) |
| Seuil de mouvement | 1 par défaut. Plus haut : moins de notes, plus de tenues et de silences |
| Maison (± degrés) | 0 : la phrase finit sur le centre exact. Plus grand : des phrases plus courtes |
| Durée min. | Durée minimale d'une note |

Les réglages sont gardés dans Chrome d'une séance à l'autre.

## À savoir

- **Vitesse maximale : une note par seconde.** Les sources ne livrent pas plus vite.
- **Princeton seul** ne change qu'une fois par minute : la mélodie reste immobile une minute.
- **Combiné** contient le hasard du serveur, qui ne change qu'une fois par minute. Pendant cette minute, il pousse toutes les notes dans la même direction, puis la minute suivante il peut faire repartir dans l'autre sens. QCI seul ou local seul n'ont pas cet effet.
- Il faut internet pour charger la page, même avec la source locale.

## Ordre de grandeur (10 heures simulées, réglages par défaut)

Environ 85 phrases par heure et 27 notes par minute. Une note dure de 0,7 à 4,4 s d'habitude (1,5 s le plus souvent), parfois plus de 20 s. Un silence dure de 0,6 à 4,6 s d'habitude (1,6 s le plus souvent), au plus une quinzaine de secondes.
