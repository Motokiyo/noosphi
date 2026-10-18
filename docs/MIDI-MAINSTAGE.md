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
| Gamme La majeur ou chromatique | **Gamme**, en haut du panneau : les gammes de l'app (les choisir ici change aussi la gamme de l'app, sans quitter la page), ou La majeur (U1) pour le MIDI seul |

Le z joue des **phrases**, et aucune horloge ne décide de leur longueur :

1. **Phrase** : la première note part du **centre**. Chaque z suivant est un intervalle à partir de la note qui sonne (z = -2 descend de 4 degrés depuis cette note).
2. **Cadence** : quand la mélodie revient sur le centre, ou touche un bord du clavier, cette note finale tient.
3. **Silence** : le mouvement suivant du z éteint la note. Le mouvement d'après ouvre une nouvelle phrase, depuis le centre.

Le z est lu à chaque seconde, mais ses décimales placent l'événement dans la seconde (z = 1,37 : 0,37 s après le tic). Les durées ne tombent donc pas sur une grille.

Chaque note sonne au moins la **durée minimale** (0,5 s par défaut). La force de frappe de chaque note se règle par voix (voir « La force de frappe »).

## Changement de patch par le z (17/10/2026)

Option du panneau, **Changer de patch : Non** par défaut. Deux événements, dans l'ordre et dans le temps imparti :
1. le z frais tombe sur **0,00** (moins de 0,005 en valeur absolue, environ une seconde sur 250) ;
2. dans les **Temps imparti** secondes qui suivent (5 par défaut), un z pousse franchement : au moins **+Poussée** (0,5) = patch suivant, au plus **−Poussée** = patch précédent. Sans poussée dans le temps imparti, rien ne change.

Un patch dure au moins **Durée min. d'un patch** (3 minutes) : un 0,00 plus tôt est ignoré. Le changement décidé attend la fin de la phrase de la lead (silence ou note finale), au plus 2 minutes. En simulation sur 10 heures : un changement toutes les 7,6 minutes en moyenne, jamais moins de 3. Le panneau affiche où on en est (« changement possible dans 2 min 58 », « 0,00 vu, attend la poussée », « suivant décidé, attend la fin de la phrase »).

Le programme envoie **CC 102 (suivant)** et **CC 103 (précédent)**, un seul message par appui. Les deux boutons du concert SiO2 ne réagissent pas pareil (essais du 18/10/2026) : « Patch suivant » saute à chaque 127 et ignore le 0, il reçoit donc 127 seul ; « Patch précédent » saute à chaque changement de valeur, il reçoit 127 et 0 en alternance. Si on refait un de ces boutons dans MainStage, refaire l'essai (trois clics de chaque côté), sur le **canal 16**, qu'aucun clavier n'écoute. Dans MainStage, **Assignations et mappages** : sélectionner le bouton « Patch suivant », cliquer **Apprendre**, cliquer **Tester suivant →** dans le panneau, arrêter l'apprentissage ; même chose pour « Patch précédent » avec **← Tester précédent**. Les deux notes qui changeaient de patch auparavant ont été retirées par Alexandre le 17/10/2026.

## Les traits rapides (essai du 17/10/2026)

Option du panneau, **Traits rapides : Non** par défaut. Sur un grand mouvement du z (au moins **Trait dès un saut de z**, 2 par défaut), la lead ne saute plus d'un coup vers sa nouvelle note : elle y court, avec quelques notes de passage de la gamme (au plus **Notes max par trait**, 4 par défaut), à environ 110 ms d'écart, puis elle se pose. Un z calme ne change rien, les notes longues restent. Les sources ne donnent qu'un tirage par seconde : la vitesse vient de ce qu'on joue à l'intérieur de la seconde, et un trait finit toujours avant la lecture suivante. En simulation sur une heure : 699 enchaînements rapides, et 287 notes de 3 s et plus gardées.

Sur le patch des 7 temps, le Scripter de la lead donne à chaque note du trait le pas suivant de la grille : le trait court en doubles croches au lieu de s'empiler.

## La force de frappe (vélocité)

La force **flotte**, comme la mélodie. Le z ne fixe pas une force, il la déplace à partir de celle de la note d'avant : z = +3, la note suivante frappe plus fort que la précédente ; z = +3,1, un peu plus encore ; z = −1, elle s'adoucit. Le même z ne donne donc jamais deux fois la même force, tout dépend du chemin. La lead et les accords flottent avec le z qui fait la note, la nappe avec sa tendance lente.

Réglages :
- **mini** et **maxi** pour chaque voix (de 1 à 127) : la force part du milieu et reste entre les deux. Elle peut toucher un bord, et en repart au mouvement suivant.
- **Pas par unité de z** (5 par défaut, commun aux trois voix) : de combien la force bouge à chaque note. Avec 5, z = +3 fait 15 de plus, z = −1 fait 5 de moins. Plus grand : des nuances plus marquées d'une note à l'autre.
- **Sens** : « z positif = plus fort » (par défaut), ou « z fort (+ ou −) = plus fort » : un z loin de 0 enfle, un z calme adoucit.

| Exemple | Ce qu'on entend |
|---|---|
| 100 / 100 (par défaut) | Frappe fixe, comme avant |
| 40 / 120, pas 5 | La force se promène sur toute la fourchette, environ 4 d'écart d'une note à l'autre en moyenne |
| 40 / 120, pas 12 | Des contrastes nets d'une note à l'autre |

Le panneau affiche la dernière force envoyée par chaque voix. Si un son réagit trop ou pas assez à la même fourchette, on corrige sa courbe de vélocité dans MainStage, son par son.

## Le silence choisi : le z choisit ses scènes

Le U1 virtuel ne joue pas tout le temps. Comme un musicien qui choisit où il entre, il décide lui-même de jouer ou de se taire, à partir de la cohérence de la dernière minute. Cette cohérence a un signe : elle monte quand les z penchent vers le positif, elle plonge quand ils penchent vers le négatif.

Tu choisis une **zone de silence**, avec deux réglages : **Joue au-dessus de +** (1,5 par défaut) et **Joue au-dessous de −** (1,5 par défaut). Entre les deux, il se tait.

- **En silence, il écoute.** Il entre dès que la cohérence sort de la zone, par le haut ou par le bas.
- **Il s'engage pour une minute.** Même si le z retombe entre-temps, il finit sa minute.
- **Au bout de la minute, il fait le point.** Si la cohérence est encore hors de la zone, d'un côté ou de l'autre, il reprend pour une minute de plus. Sinon, il se tait, sans rien couper (voir « Les passages »).

Les deux bords sont indépendants. Exemple : + 1 et − 2, il joue dès que le public penche un peu vers le positif, mais seulement quand il plonge franchement vers le négatif. **0 et 0 : il joue toujours.** Un ancien réglage « seuil d'envie » est repris tel quel pour les deux bords.

Aucune minuterie ne décide seule : la minute fixe seulement le moment où le z est consulté.

### Deux zones : la nappe et le jeu

La nappe (canal 3) et le jeu (lead et accords, canaux 1 et 2) ont **chacun leur zone de silence**, avec deux réglages chacun : **Nappe : joue au-dessus de + / au-dessous de −** et **Jeu : joue au-dessus de + / au-dessous de −**. Les deux lisent la même cohérence, et chacun s'engage pour sa propre minute.

Selon les seuils, on obtient trois moments, en plus du silence :

| Exemple de réglage | Ce qu'on entend |
|---|---|
| Nappe ± 1, jeu ± 2 | Cohérence moyenne : la nappe seule. Forte : la nappe et le jeu |
| Nappe + 1 / − 3, jeu + 3 / − 1 | Le public penche vers le positif : la nappe seule. Vers le négatif : le jeu seul. Très fort d'un côté ou de l'autre : les deux |
| Les quatre à 1,5 (par défaut) | Les deux entrent et sortent ensemble, comme avant |

Un réglage d'avant (une seule zone) est repris tel quel pour les deux.

Dans MainStage, la nappe et le jeu sont deux claviers séparés : un objet clavier qui écoute le canal 3, un autre qui écoute le canal 1 (et un troisième pour les accords sur le canal 2, pour leur garder un son à eux).

Le panneau affiche une ligne par groupe : « Nappe : joue · point dans 34 s » ou « s'éteint » ou « se tait », et « Jeu : entre après la nappe », « joue », « finit sa phrase » ou « se tait ».

## Trois voix

| Voix | Canal | Ce qu'elle joue |
|---|---|---|
| **Lead** | 1 | La mélodie, seconde par seconde : phrases, pas, cadences (voir plus bas) |
| **Accords** | 2 | Un accord de trois sons sous la lead, quand la cohérence est forte, en + comme en − |
| **Back** | 3 | Les nappes. Elle suit la tendance lente du z (les 30 dernières secondes) et ne joue que les piliers de la gamme, I, IV et V, une octave sous le centre de la lead. Tendance nulle : la tonique. Tendance qui monte : elle monte d'un pilier, puis d'un autre. Elle ne change de note qu'après sa **tenue minimale** (10 s par défaut), et la note suivante entre avant que l'ancienne s'éteigne, pour que la nappe ne se troue pas |

Les piliers I, IV et V sont pris dans la gamme chromatique de la tonique, même quand la lead joue en pentatonique (le IV n'existe pas en pentatonique).

## Les passages : rien d'abrupt

**Quand les deux entrent ensemble**, la nappe vient d'abord, seule. La lead la rejoint après le délai d'**Entrée de la lead** (4 s par défaut). Quand le jeu entre seul, ou rejoint une nappe qui sonne déjà, la lead entre tout de suite.

**Quand il se tait**, rien n'est coupé :

1. La lead **finit sa phrase.** À chaque mouvement du z, elle fait un petit pas (un ou deux degrés) vers le centre, jusqu'à s'y poser. Le z donne la taille du pas, jamais la direction. Cette note finale tient, et le mouvement suivant du z l'éteint, comme une cadence ordinaire.
2. L'accord qui sonnait **tient jusqu'à cette cadence**, puis part avec elle. Aucun nouvel accord ne vient pendant la fin.
3. La nappe tient encore la **Queue de la back** (4 s par défaut) après la lead, puis s'éteint. Sa vraie queue est celle du son dans MainStage (son *release*).

Quand la nappe sort seule (le jeu continue, ou se taisait déjà), elle tient sa queue à partir du moment où elle sort, puis s'éteint.

Garde-fou : si le z ne bouge plus, la lead rejoint le centre au bout de 15 s, et sa note finale tient au plus 4 s. Une fin de phrase dure 8 s le plus souvent, 19 s au plus.

Si la cohérence ressort de la zone pendant que la lead finit sa phrase, la phrase reprend librement, sans repasser par l'entrée.

**Fondu (option).** Avec **Fondu CC 11 = Oui**, le contrôleur 11 (expression) monte de 0 à 127 pendant l'entrée et redescend à 0 pendant la queue. La nappe a son fondu (canal 3), le jeu le sien (canaux 1 et 2) : quand la nappe sort seule, le jeu garde son plein volume. Beaucoup d'instruments Logic et MainStage répondent d'eux-mêmes au CC 11. Revenir à « Non », ou couper le MIDI, rend le plein volume (127). Laisser sur « Non » si un son disparaît sans raison.

## La cohérence, rendue audible

La cohérence, au sens du Global Consciousness Project, c'est quand le z garde le même cap. Le U1 virtuel la mesure sur la dernière minute (méthode Stouffer de Princeton) et la musique change par paliers :

| Niveau | Mesure | Ce qu'on entend |
|---|---|---|
| Hasard | sous 1,5 | Phrases éparses, intervalles libres |
| Approche | 1,5 et plus | Mélodie liée, petits pas, gamme pentatonique si l'app est en chromatique |
| Cohérence | **Accords dès ±** (2 par défaut) | Un accord de trois sons sur le **canal 2** avec chaque note |
| Forte | 0,5 au-dessus (2,5 par défaut) | La mélodie se pose sur la note centrale, l'accord tient |

Au niveau Forte, l'accord tient **tant que la cohérence reste forte**, sans limite de durée. C'est voulu (confirmé par Alexandre le 17/10/2026), ce n'est pas une note coincée. En simulation : jusqu'à 60 s au pur hasard, plusieurs minutes avec une source qui penche. Pour des accords plus courts, monter **Accords dès ±**.

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
| Nappe : joue au-dessus de + / au-dessous de − | 1,5 et 1,5 par défaut. La zone de silence de la nappe. 0 et 0 = joue toujours |
| Jeu : joue au-dessus de + / au-dessous de − | 1,5 et 1,5 par défaut. La zone de silence de la lead et des accords. 0 et 0 = joue toujours |
| Accords dès ± | 2 par défaut. Cohérence, en + ou en −, à partir de laquelle viennent les accords |
| Canal lead / accords / back | Canaux MIDI d'envoi (1, 2 et 3 par défaut) |
| Note la plus grave / aiguë | Étendue du clavier (21 à 108 = piano 88 touches) |
| Centre (départ) | Note de départ de chaque phrase (60 = Do3 dans MainStage) |
| Degrés par unité de z | Taille des intervalles (2 : z = 1 monte de 2 degrés de la gamme) |
| Seuil de mouvement | 1 par défaut. Plus haut : moins de notes, plus de tenues et de silences |
| Maison (± degrés) | 0 : la phrase finit sur le centre exact. Plus grand : des phrases plus courtes |
| Durée min. | Durée minimale d'une note de lead |
| Gamme | En haut du panneau. Les gammes de l'app (change aussi celle de l'app), ou La majeur (U1, MIDI seul) |
| Lead / Accords / Nappe : mini et maxi | 100 et 100 par défaut. Bornes de la force de la voix, qui part du milieu |
| Pas par unité de z | 5 par défaut. De combien la force bouge à chaque note |
| Sens | z positif = plus fort (par défaut), ou z fort (+ ou −) = plus fort |
| Tenue min. back | 10 s par défaut. Durée minimale d'une note de nappe |
| Entrée de la lead | 4 s par défaut. Délai entre l'entrée de la nappe et celle de la lead, quand elles entrent ensemble. Aussi la durée du fondu d'entrée |
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

## Tessiture de chaque instrument (Scripter, dans MainStage)

Le programme ne sait pas quel son joue sur un canal : la tessiture se règle dans MainStage, instrument par instrument. Un Scripter dans les MIDI FX de la tranche replie à l'octave les notes hors tessiture. Une note trop grave joue dans l'octave la plus basse de l'instrument, une note trop aiguë dans sa plus haute. Les notes de la tessiture ne bougent pas.

Script des flûtes : `tools/scripter/tessiture-flutes.js` (copie sur le vieux Mac : `~/Music/Scripts-MainStage/`). Il vient du préréglage Apple « Octave Wrapper ». Son menu **Instrument** donne Flûte traversière (60 à 96, Do3 à Do6), Piccolo (74 à 108, Ré4 à Do7), Flûte basse (48 à 84, Do2 à Do5) ou Réglage libre. Pour des bornes à soi, choisir « Réglage libre » avant de tourner les boutons. Installé le 17/10/2026 sur la flûte du concert « Le Clavier des Noos-SIO2-2026 ».

Script de tous les instruments : `tools/scripter/tessiture-instruments.js`, même fonctionnement, menu de quatorze instruments (flûtes, hautbois, clarinette, basson, cor, trompette, trombone, tuba, violon, alto, violoncelle, contrebasse) plus Réglage libre. La ligne `var DEFAUT` choisit l'instrument du premier lancement (6 = Cor). Installé le 17/10/2026 sur la tranche « Instr. 48 » (les cors) du même concert. Entrée « Hang / Halo (Pan Drums) » (48 à 84, Do2 à Do5) ajoutée le même jour et installée sur la tranche « Instr. 55 » (Kontakt, Pan Drums) : elle tient le programme loin des touches Do1 à Mi1, qui changent la frappe en mode Chromatic au lieu de jouer une note.

**Kontakt dans MainStage** : charger un `.nki` en le faisant glisser depuis le Finder dans le rack de la fenêtre Kontakt de la tranche (zone noire à droite). Un double-clic dans le Finder l'ouvre dans l'application Kontakt autonome, qui ne joue pas dans MainStage. Les bibliothèques Soundiron (bambous) n'ont pas de `.nicnt` : elles ne paraissent pas dans l'onglet Libraries, passer par l'onglet Files.

Pour un autre instrument : Scripter dans un MIDI FX, puis menu des réglages en haut du Scripter, préréglage **« Tessiture instruments »** (enregistré le 17/10/2026 sur le vieux Mac, `~/Music/Audio Music Apps/Plug-In Settings/Scripter/`), puis choisir l'instrument dans le menu « Instrument ». À défaut : « Open Script in Editor », coller le script, « Run Script ». Garder au moins 12 notes entre les deux bornes.

## Rythmique en 7 temps (Scripter, dans MainStage)

Le programme n'a pas de tempo : c'est le z qui place ses notes. Pour une rythmique, on passe par l'horloge du concert MainStage, dans deux Scripters qui partagent la même grille (même horloge, même pas 1). Sur cette version de MainStage, une tranche n'a qu'un effet MIDI, d'où un script qui fait tout.

- `tools/scripter/percus-7-temps.js`, sur la tranche des percussions (kit « Orchestral Kit ») : grille de 7 pas en 1/16 tant que des notes tiennent, force par pas, octave par pas (une autre octave est un autre instrument du kit), hasard des instruments (40 %) et des forces (20 %) pour qu'on n'entende pas la boucle. Les touches qui sonnent mal en boucle (tam-tam, gongs, cymbales, trémolos, fouet, crécelle, orchestral hit) sont déviées vers la touche permise la plus proche. Mode « Piliers I / IV / V » en option. Installé le 17/10/2026 sur « Instr. 57 ».
- `tools/scripter/lead-7-temps.js`, sur la lead : aucune note ajoutée, chaque note est retardée jusqu'au prochain pas coché (1, 3, 5, 7 par défaut, au plus un demi-temps d'attente) et garde sa durée. Installé le 17/10/2026 sur « Instr. 56 », à la place d'un Arpeggiator éteint.
- **Pas** et **Valeur d'un pas** doivent rester identiques dans les deux scripts.
- `tools/scripter/arpege-phases.js` : arpège qui entre quand la note reçue change (la nappe passe d'un pilier à l'autre, un changement d'harmonie du programme), au début de la mesure suivante. Il joue « Durée de jeu » (8 temps), s'efface en fondu de 6 notes et attend le changement suivant : environ la moitié du temps en simulation. Reprend 1/16, monte-descend, 3 octaves, notes à 90 %. Installé le 17/10/2026 sur « Metal nocturne » (Scripter + Alchemy, fenêtre « Instr. 48 »). Versions écartées le même jour : phases tirées au hasard (« là c'est aléatoire ») ; phases sur la cohérence par le CC 20 (le CC 20 n'arrivait pas jusqu'au Scripter, l'Alchemy restait muet) ; un CC 21 ajouté au programme a été retiré, le changement devait rester propre à la piste.
- `tools/scripter/bols-chantants.js`, sur la tranche des bols tibétains (EXS24 « Tibetan Singing Bowls », « Metal nocturne », Instr. 50) : les notes partent vers la zone chantée, sur la même note, et 15 % restent des coups de mailloche douce (force plafonnée à 55). Chant par défaut **Swell** (bols qui enflent, bas du clavier), hauteur « Naturelle » (Do0 à Si0) ou « Grave » (Do-1 à Si-1). Les bols frottés (Bowed, haut du clavier) sonnent trop aigus pour être reconnus. **Laisser le Transpose de l'EXS24 à 0** : il décale aussi les touches, et à -24 les bols retombent dans les mailloches (vérifié à l'oreille par Alexandre le 17/10/2026).

## Gamme par patch (genre seulement)

Chaque patch peut imposer son genre de gamme (pentatonique, majeure, mineure, dorienne, chromatique) à toute la musique de l'app, sans toucher au réglage général. La tonique ne change pas.

Le patch l'annonce par un message CC 104 sur le canal 16, envoyé à son chargement sur un second bus IAC, **Retour Noos** (créé le 18/10/2026 dans Configuration audio et MIDI, à côté du Bus 1). Les six fichiers à envoyer sont dans `tools/mainstage-gammes/`, copiés sur le Mac de concert dans `~/Music/MainStage/Gammes Noos/` : `0-generale` (retour au réglage général), `1-pentatonique`, `2-majeure`, `3-mineure`, `4-dorienne`, `5-chromatique`.

Dans chaque patch : une tranche **Instrument externe** (entrée MIDI Aucun, sortie MIDI Retour Noos, canal 16, entrée audio Pas d'entrée, sortie Pas de Sortie). Dans son inspecteur, onglet **Sortie MIDI** : cocher **Envoyer fichier MIDI** et choisir le fichier du genre. Laisser décochés « Envoyer changement de programme » et « Expression d'envoi ». Dans l'onglet **Entrée MIDI**, rubrique Contrôleurs, mettre la **Sortie** sur un numéro que rien n'écoute (CC 85), pas sur Expression (11).

**Pourquoi l'Expression doit rester coupée (mesuré le 18/10/2026).** Avec « Expression d'envoi » coché et la sortie des contrôleurs sur Expression (11), chaque tranche renvoyait le CC 11 sur Retour Noos ; MainStage l'y recevait, l'appliquait à l'expression de toutes ses tranches, et la tranche le réémettait. Boucle : plus de 1 300 messages par seconde, MainStage à 2,3 cœurs, mémoire qui grimpe de 10 Mo/s, blocage au troisième ou quatrième changement de patch. Après correction : 0,3 à 0,5 cœur, mémoire stable, un seul message (l'annonce de gamme) par changement de patch. Une tranche collée depuis une autre garde ces réglages ; une tranche créée à neuf repart avec l'Expression cochée.

Un patch sans cette tranche garde le genre du patch précédent. Pour qu'il revienne au réglage général, lui donner `0-generale`. Le panneau MIDI affiche la ligne « Gamme du patch ».

**Ne jamais envoyer de changement de programme vers Retour Noos.** MainStage écoute aussi ce bus et saute vers le patch qui porte ce numéro (essai du 18/10/2026 : le patch « le plateau de nuit » renvoyait sans cesse sur Celeste, et MainStage s'est figé une minute).

## Ce qui fait jouer l'U1 virtuel (sources du z)

Dans l'écran de session, avec `?midi=1`, les cases décident vraiment du z envoyé à MainStage. La ligne « z joué » du panneau dit ce qui joue.

- **Local** : le générateur de cet ordinateur.
- **Téléphones · N** : en séance collective, les téléphones qui ont envoyé un z depuis moins de 3 s. La case n'apparaît qu'à partir d'un téléphone actif.
- **QCI** : générateur quantique de Quantum Computing Inc., un z par seconde.
- **Cicada** : clé quantique de Franck Laharrague (temple-pc, par Tailscale), lue par le serveur en ligne. N'apparaît que si la clé répond ; réservée aux expériences de la Napp du 10 au 18/11, elle disparaît alors d'elle-même.
- **Princeton, ANU, NIST** : affichage seulement (« vue »). Une valeur par minute : les jouer répéterait la même valeur et fabriquerait une fausse cohérence.

Par défaut : Local + Téléphones. La courbe « Combine » est le z joué. En séance collective elle suit « Local » avec environ une seconde de retard : le tirage de l'ordinateur passe par le serveur, qui le combine avec les téléphones (chaque tirage ne compte qu'une fois).

Les réglages du panneau sont propres à chaque adresse (page d'essai du MacBook, page en ligne). Pour les reporter : « Copier mes réglages » d'un côté, « Coller mes réglages » puis Cmd+V de l'autre. La sortie MIDI se choisit à la main dans chaque fenêtre.

Les sessions enregistrées restent dans le navigateur qui les a faites (50 au plus), aucune copie sur le serveur.
