# Changelog — Noosfeerique

## [Non publie] — branche feat/midi-u1-virtuel

### Sortie MIDI « U1 virtuel »
- Le z-score de la source choisie joue des phrases MIDI vers MainStage (Bus IAC), dans Chrome
- Une note quand le z bouge d'au moins le seuil (1,5) ; le z est un intervalle depuis la note en cours
- Phrase -> cadence (retour au centre ou bord du clavier) -> silence, chaque temps ouvert par un mouvement du z
- Duree minimale de note (500 ms), frappe fixe, bouton panique
- Seuil par defaut 1 (choisi a l'ecoute) ; les decimales du z placent la note dans la seconde (plus de grille) ; le silence finit au prochain mouvement du z
- Panneau visible seulement avec ?midi=1 ; notice docs/MIDI-MAINSTAGE.md ; tests test/midi-engine.test.mjs
- Service worker v5 (cache des deux nouveaux fichiers)

## [1.0.0] — 2026-03-19

Premiere version complete du prototype.

### Experience
- Sphere 3D Three.js responsive (75% de la plus petite dimension)
- Sphere blanche brillante (clearcoat 0.8, roughness 0.15)
- Eclairage reactif au z-score (key + fill cyan + rim or)

### Son
- Soundscape meditatif 6 couches : drone tanpura, pad cordes, bol tibetain frappe, cello melodique, cloche, gong
- Frappes humanisees (aleatoire sur volume, decay, intervalle, stagger)
- Gammes musicales : libre / pentatonique / majeure / mineure / dorienne / chromatique (432 Hz)
- Volume slider (pilule verticale flottante), persiste en localStorage
- Compressor audio pour eviter la saturation sur haut-parleurs mobiles
- Soft attack (10ms ramp) sur toutes les frappes

### Sources de donnees
- 5 sources actives : Princeton GCP, QCI uQRNG, ANU QRNG, NIST Beacon, Local RNG
- Methode Princeton EGG (200 bits/trial) pour toutes les sources
- Princeton : 60s (leur rythme). QCI : 1s. ANU/NIST : 60s. Local : 1s (10 trials)
- Combinaison Stouffer multi-sources

### Sessions
- Session solo : nommer, enregistrer, pause/reprendre, arreter
- Session collective (WebSocket/socket.io) : creer, rejoindre avec code NOOS-XXXX
- Partage via Web Share API (Telegram, WhatsApp, Signal) + clipboard fallback
- Nombre de participants en temps reel
- Z-score centre + graphe temps reel pendant l'enregistrement
- Toggles sources independants par overlay

### Sessions enregistrees
- Sauvegarde en localStorage (max 50)
- Liste avec renommer inline + supprimer
- Detail : graphe rejouable avec toggles par source, commentaire editable
- Donnees par source sauvegardees (local, gcp, qrng, nist, qci + combine)

### Historique
- Overlay graphique plein ecran, historique 24h glissant (Chart.js)
- Coherences marquantes : pic z (slot 1) + duree x moyenne |z| (slots 2-5)
- Nom de la source en couleur sur chaque highlight
- Toggles sources avec tirette collapsible
- Bouton poubelle pour effacer l'historique

### Interface
- Responsive mobile-first (sidebar/settings pleine largeur sur tel)
- Header "Noosfeerique" cache quand overlays ouverts
- Boutons cercle+X uniformes partout (sidebar, settings, help, graphe)
- Speaker blanc vif quand actif, gris quand inactif
- Modale help : contexte Princeton GCP, z-score explique, 5 sources
- Page credits : Franck Laharrague, Alexandre Ferran, Claude Code, QCI remerciements

### PWA
- manifest.json avec icones (192, 512, apple-touch-icon)
- Service worker (cache offline, network-first)
- Favicon sphere

### Documentation
- METHODOLOGY_ZSCORE.md : methode Princeton EGG complete
- README.md : installation, sources, remerciements QCI

---

## [0.1.0] — 2026-03-16

Dashboard prototype initial (index.html).
- 4 sources : GCP, ANU, NIST, Local
- Graphe Chart.js 24h
- Score Stouffer combine
