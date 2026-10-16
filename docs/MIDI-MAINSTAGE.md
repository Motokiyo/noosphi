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
6. Trois voix arrivent sur trois canaux : la **lead** sur le canal 1, les **accords** sur le 2, la **back** (nappes) sur le 3. Dans MainStage, mettre un son par canal (une tranche de console qui n'écoute que le canal 1, une autre le 2, une autre le 3).

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

## Le silence choisi : le z choisit ses scènes

Le U1 virtuel ne joue pas tout le temps. Comme un musicien qui choisit où il entre, il décide lui-même de jouer ou de se taire, à partir de la cohérence de la dernière minute. Cette cohérence a un signe : elle monte quand les z penchent vers le positif, elle plonge quand ils penchent vers le négatif.

Tu choisis une **zone de silence**, avec deux réglages : **Joue au-dessus de +** (1,5 par défaut) et **Joue au-dessous de −** (1,5 par défaut). Entre les deux, il se tait.

- **En silence, il écoute.** Il entre dès que la cohérence sort de la zone, par le haut ou par le bas.
- **Il s'engage pour une minute.** Même si le z retombe entre-temps, il finit sa minute.
- **Au bout de la minute, il fait le point.** Si la cohérence est encore hors de la zone, d'un côté ou de l'autre, il reprend pour une minute de plus. Sinon, il se tait, sans rien couper (voir « Les passages »).

Les deux bords sont indépendants. Exemple : + 1 et − 2, il joue dès que le public penche un peu vers le positif, mais seulement quand il plonge franchement vers le négatif. **0 et 0 : il joue toujours.** Un ancien réglage « seuil d'envie » est repris tel quel pour les deux bords.

Aucune minuterie ne décide seule : la minute fixe seulement le moment où le z est consulté. Le panneau affiche « Se tait, écoute », « Entre · la nappe d'abord », « Joue · fait le point dans 34 s », « Finit sa phrase » ou « La nappe s'éteint ».

## Trois voix

| Voix | Canal | Ce qu'elle joue |
|---|---|---|
| **Lead** | 1 | La mélodie, seconde par seconde : phrases, pas, cadences (voir plus bas) |
| **Accords** | 2 | Un accord de trois sons sous la lead, quand la cohérence est forte, en + comme en − |
| **Back** | 3 | Les nappes. Elle suit la tendance lente du z (les 30 dernières secondes) et ne joue que les piliers de la gamme, I, IV et V, une octave sous le centre de la lead. Tendance nulle : la tonique. Tendance qui monte : elle monte d'un pilier, puis d'un autre. Elle ne change de note qu'après sa **tenue minimale** (10 s par défaut), et la note suivante entre avant que l'ancienne s'éteigne, pour que la nappe ne se troue pas |

Les piliers I, IV et V sont pris dans la gamme chromatique de la tonique, même quand la lead joue en pentatonique (le IV n'existe pas en pentatonique).

## Les passages : rien d'abrupt

**Quand il entre**, la nappe vient d'abord, seule. La lead la rejoint après le délai d'**Entrée de la lead** (4 s par défaut).

**Quand il se tait**, rien n'est coupé :

1. La lead **finit sa phrase.** À chaque mouvement du z, elle fait un petit pas (un ou deux degrés) vers le centre, jusqu'à s'y poser. Le z donne la taille du pas, jamais la direction. Cette note finale tient, et le mouvement suivant du z l'éteint, comme une cadence ordinaire.
2. L'accord qui sonnait **tient jusqu'à cette cadence**, puis part avec elle. Aucun nouvel accord ne vient pendant la fin.
3. La nappe tient encore la **Queue de la back** (4 s par défaut) après la lead, puis s'éteint. Sa vraie queue est celle du son dans MainStage (son *release*).

Garde-fou : si le z ne bouge plus, la lead rejoint le centre au bout de 15 s, et sa note finale tient au plus 4 s. Une fin de phrase dure 8 s le plus souvent, 19 s au plus.

Si la cohérence ressort de la zone pendant que la lead finit sa phrase, la phrase reprend librement, sans repasser par l'entrée.

**Fondu (option).** Avec **Fondu CC 11 = Oui**, le contrôleur 11 (expression) monte de 0 à 127 pendant l'entrée et redescend à 0 pendant la queue, sur les trois canaux. Beaucoup d'instruments Logic et MainStage répondent d'eux-mêmes au CC 11. Revenir à « Non », ou couper le MIDI, rend le plein volume (127). Laisser sur « Non » si un son disparaît sans raison.

## La cohérence, rendue audible

La cohérence, au sens du Global Consciousness Project, c'est quand le z garde le même cap. Le U1 virtuel la mesure sur la dernière minute (méthode Stouffer de Princeton) et la musique change par paliers :

| Niveau | Mesure | Ce qu'on entend |
|---|---|---|
| Hasard | sous 1,5 | Phrases éparses, intervalles libres |
| Approche | 1,5 et plus | Mélodie liée, petits pas, gamme pentatonique si l'app est en chromatique |
| Cohérence | **Accords dès ±** (2 par défaut) | Un accord de trois sons sur le **canal 2** avec chaque note |
| Forte | 0,5 au-dessus (2,5 par défaut) | La mélodie se pose sur la note centrale, l'accord tient |

Ces niveaux lisent la force de la cohérence, sans son signe : même musique en + et en −. Le seuil des accords se règle (de 1,6 à 4). Plus haut : des accords plus rares, réservés aux moments vraiment forts.

On ne sort d'un niveau qu'en redescendant un peu sous son seuil d'entrée (1,3, puis 0,3 sous le seuil des accords, puis 0,3 sous le seuil fort), pour éviter que la musique clignote.

Sous le pur hasard, la cohérence (2 et plus) n'occupe qu'environ 6 % du temps. Relevé réel de 15 minutes sur les sources locale et QCI : 81,9 / 13,1 / 4,4 / 0,6 % du temps par niveau, conforme au hasard.

Le niveau est aussi envoyé en continu sur le **contrôleur 20** (0 à 127), sur les trois canaux. Il n'agit que si tu l'assignes dans MainStage. Toutes les notes ont la même frappe : les volumes se règlent dans MainStage.

**Sources utilisées pour le MIDI**, pour éviter toute fausse cohérence : en session collective, le z des téléphones et de l'ordinateur hôte (chaque tirage compte une fois, un téléphone muet depuis 3 s est écarté) ; sur « combiné », le hasard local et QCI seulement, sans les sources qui ne changent qu'une fois par minute.

## En concert : le lanceur

Double-cliquer sur `tools/U1-virtuel.command`. Il ouvre le U1 virtuel dans une fenêtre Chrome à part, protégée : sans elle, Chrome endort la page dès que MainStage passe devant. La première fois, autoriser le MIDI dans cette fenêtre.

Le lanceur ouvre le **mode concert** (`&concert=1`) : la sphère est dessinée une fois puis figée, la carte graphique ne travaille plus. Indispensable sur un vieux Mac qui chauffe.

Les notes partent datées à l'avance : le système MIDI du Mac les joue à l'heure exacte, même fenêtre cachée.

## Le public : page noire et QR code

Les spectateurs n'utilisent pas l'app normale, mais **`public.html`** : écran noir avec une lueur très faible, aucun son, pas de sphère 3D. Elle consomme peu de batterie et n'éclaire pas la salle. Elle tire le z du téléphone chaque seconde, garde l'écran allumé (en ligne, en https) et rejoint seule la séance après une coupure.

1. Dans la fenêtre du U1 virtuel, créer la **Session collective**.
2. Dans le panneau MIDI, cliquer sur **QR code pour le public** et projeter la page : le QR contient déjà le code de la séance.
3. Les spectateurs scannent : ils sont dans la séance, sans rien taper.

Pour un essai local (sans mise en ligne), le QR doit pointer vers l'adresse du Mac sur le réseau : ajouter `&base=http://ADRESSE-DU-MAC:3000` à l'adresse de la page QR.

## Réglages

| Réglage | Effet |
|---|---|
| Joue au-dessus de + / au-dessous de − | 1,5 et 1,5 par défaut. La zone de silence. 0 et 0 = joue toujours |
| Accords dès ± | 2 par défaut. Cohérence, en + ou en −, à partir de laquelle viennent les accords |
| Canal lead / accords / back | Canaux MIDI d'envoi (1, 2 et 3 par défaut) |
| Note la plus grave / aiguë | Étendue du clavier (21 à 108 = piano 88 touches) |
| Centre (départ) | Note de départ de chaque phrase (60 = Do3 dans MainStage) |
| Degrés par unité de z | Taille des intervalles (2 : z = 1 monte de 2 degrés de la gamme) |
| Seuil de mouvement | 1 par défaut. Plus haut : moins de notes, plus de tenues et de silences |
| Maison (± degrés) | 0 : la phrase finit sur le centre exact. Plus grand : des phrases plus courtes |
| Durée min. | Durée minimale d'une note de lead |
| Tenue min. back | 10 s par défaut. Durée minimale d'une note de nappe |
| Entrée de la lead | 4 s par défaut. Délai entre l'entrée de la nappe et celle de la lead |
| Queue de la back | 4 s par défaut. La nappe tient ce temps après la dernière note de lead |
| Fondu CC 11 | Non par défaut. Oui : fondu d'expression à l'entrée et à la sortie |

Les réglages sont gardés dans Chrome d'une séance à l'autre.

## À savoir

- **Vitesse maximale : une note par seconde.** Les sources ne livrent pas plus vite.
- **Princeton seul** ne change qu'une fois par minute : la mélodie reste immobile une minute.
- **Combiné** contient le hasard du serveur, qui ne change qu'une fois par minute. Pendant cette minute, il pousse toutes les notes dans la même direction, puis la minute suivante il peut faire repartir dans l'autre sens. QCI seul ou local seul n'ont pas cet effet.
- Il faut internet pour charger la page, même avec la source locale.

## Ordre de grandeur (10 heures simulées au pur hasard)

| Zone de silence | Son | Scènes par heure | Silence le plus courant | Nappes par heure |
|---|---|---|---|---|
| − 1,5 / + 1,5 (défaut) | 47 % du temps | 21 | 65 s (de 12 s à 4 min 30 le plus souvent) | 105 |
| − 2 / + 1 | 54 % | 23 | 57 s | 120 |
| − 2 / + 2 | 22 % | 11 | 3 min (de 28 s à 11 min) | 51 |

Une nappe dure 13 s le plus souvent, de 10 à 30 s d'habitude. Quand le public s'accorde, il joue plus souvent et plus longtemps d'affilée.

Pendant le son, la lead fait environ 85 phrases par heure et 27 notes par minute. Une note dure de 0,7 à 4,4 s d'habitude (1,5 s le plus souvent), parfois plus de 20 s. Un silence dure de 0,6 à 4,6 s d'habitude (1,6 s le plus souvent), au plus une quinzaine de secondes.
