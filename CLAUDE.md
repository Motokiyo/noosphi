# CLAUDE.md — Noosfeerique v1.0.2

## QUI TU ES
Tu es le dev principal de l'application Noosfeerique. Alexandre (l'utilisateur) est ton interlocuteur.
Franck Laharrague est le commanditaire et directeur artistique.

## LE PROJET EN UNE PHRASE
App artistique mesurant la conscience collective en temps reel via des generateurs de nombres aleatoires quantiques (lignee du Global Consciousness Project de Princeton), visualisee par une sphere 3D reactive et un soundscape meditatif.

## VERSION : 1.0.2 (19 mars 2026)
## URL : https://noosfeerique.leparede.org/experience.html

---

## ARCHITECTURE

### Frontend (public/)
- `experience.html` — page Experience Noosfeerique (sphere + son + sessions)
- `credits.html` — page credits (Franck, Alexandre, Claude Code, QCI)
- `index.html` — dashboard existant (NE PAS TOUCHER)
- `manifest.json` — PWA config
- `sw.js` — service worker (cache offline, version v4)
- `css/experience.css` — styles mobile-first
- `js/experience.js` — logique complete (~1800 lignes)
- `js/zindex.js` — fonctions stats (NE PAS TOUCHER)
- `js/three.module.js` — Three.js standalone 570KB
- `assets/icons/` — icon-512 (sphere Franck), icon-192, apple-touch-icon, favicons
- `assets/images/` — logo EIFFEL AI

### Backend (server.js)
- Express + socket.io + dotenv
- Routes API proxy : /api/gcp, /api/qrng, /api/nist-beacon, /api/qci, /api/local-rng, /api/status
- WebSocket : sessions collectives (creer, rejoindre, z-score combine)
- Credentials dans .env (gitignore)

### Deploiement
- Serveur : Hetzner VPS (meme serveur qu'OpenClaw)
- HTTPS : Let's Encrypt via noosfeerique.leparede.org
- Repo : https://github.com/Motokiyo/noosphi

### Calcul z-score — Methode Princeton EGG
Toutes les sources : 200 bits → z = (sum-100)/√50, Stouffer combine.
Notre z-score est INSTANTANE (derniere seconde). Le Dot Princeton est CUMULE (fenetre glissante, percentile).
Doc : METHODOLOGY_ZSCORE.md (section 5b explique la difference).

---

## CE QUI EST IMPLEMENTE

### Sphere 3D
- [x] Three.js MeshPhysicalMaterial (roughness 0.15, clearcoat 0.8)
- [x] Eclairage reactif au z-score (key 0.8 base + fill cyan + rim or + ambient 0.35)
- [x] Exposure 1.3, halo/glow sprite additif
- [x] Rotation lente (Y 0.003, X 0.001)
- [x] Responsive (75% de la plus petite dimension, jamais coupee)
- [x] Photo sphere de Franck (icon-512.png) apparait a |z| > 2 — taille fixe = sphere 3D, seule l'opacite change (0% → 85%)

### Son meditatif
- [x] 3 couches continues : drone tanpura (C3 128Hz) + pad cordes (octave sous cello, intervalles harmoniques variables) + cello melodique
- [x] 3 percussions : bol tibetain frappe (|z|>0.5) + cloche (|z|>1.5) + gong (|z|>2)
- [x] Frappes humanisees (±30% volume, ±40% decay, ±25% intervalle, stagger 0-150ms)
- [x] TOUTES les rampes en exponentialRamp (JAMAIS linearRamp, JAMAIS .value= direct)
- [x] Attack 30ms minimum sur les frappes (soft exponential)
- [x] Transitions notes : 100ms en gamme, 400ms en libre
- [x] Compressor avant destination (threshold -24, knee 30, ratio 12, attack 3ms, release 250ms)
- [x] AudioContext({ latencyHint: 'playback' }) — anti-glitch mobile
- [x] Reverb cathedrale (dual delay feedback, lowpass 1200Hz)
- [x] 6 gammes musicales (432 Hz) — persiste en localStorage
- [x] Volume slider pilule flottante — persiste en localStorage
- [x] baseVol = 0.15 + intensity * 0.35 (gain max 1.0 a slider 100%)
- [x] Speaker blanc vif (#ffffff) quand actif, gris quand inactif

### Sources de donnees (5 actives)
- [x] GCP Princeton (60s) — p-values reseau → inverseNormalCDF
- [x] QCI uQRNG (1s) — 50 octets = 2 trials EGG, token via .env
- [x] ANU QRNG (60s) — 100 octets = 4 trials EGG
- [x] NIST Beacon (60s) — 64 octets = 2 trials EGG
- [x] Local RNG (1s) — 10 trials de 200 bits, Stouffer combine

### Interface
- [x] Header : hamburger (sources) + engrenage (gammes) + ? (aide)
- [x] 4 boutons bas-droite : sessions enregistrees + session + historique + son
- [x] Sidebar sources (choix source individuelle pour sphere + z-score)
- [x] Panneau settings (choix gamme)
- [x] Modale help avec SVG inline de tous les boutons + explications
- [x] Overlay graphique : historique 24h glissant, toggles, coherences marquantes
- [x] Header cache quand overlays ouverts (CSS :has())
- [x] Boutons cercle+X uniformes partout
- [x] Credits dans nouvel onglet (ne coupe pas le son)
- [x] Responsive mobile-first
- [x] 5 dots sources en bas a gauche (cyan = actif)

### Sessions
- [x] Solo : nommer, enregistrer, pause/reprendre, arreter
- [x] Collective (WebSocket) : creer code NOOS-XXXX, rejoindre, partager
- [x] Web Share API (Telegram/WhatsApp/Signal) — necessite HTTPS
- [x] Copier le code dans le presse-papier
- [x] Z-score centre + graphe temps reel + toggles sources independants
- [x] Minimize session : X ferme l'overlay, enregistrement continue
- [x] Pastille rouge en haut avec timer (clic pour revenir)
- [x] Bouton session en negatif (blanc/noir) quand enregistrement actif
- [x] Bouton session en negatif pause quand en pause
- [x] Clic bouton session ou pastille rouvre l'enregistrement
- [x] Wake Lock API : empeche mise en veille pendant sessions
- [x] Son activable dans sessions (bouton + clic zone sphere)
- [x] Sauvegarde localStorage (max 50), renommer inline, supprimer
- [x] Detail : graphe par source avec toggles, commentaire editable
- [x] Donnees par source sauvegardees (local, gcp, qrng, nist, qci + combine)

### PWA
- [x] manifest.json avec icones (192, 512, apple-touch-icon, favicons)
- [x] Service worker (cache offline, network-first, version v4)
- [x] Favicon sphere de Franck

### Documentation
- [x] METHODOLOGY_ZSCORE.md — methode Princeton EGG + difference avec le Dot
- [x] CHANGELOG.md — historique des versions
- [x] README.md — installation, boutons, sessions, son, credits
- [x] Page credits — Franck, Alexandre, Claude Code, QCI, lien repo

---

## CE QU'IL RESTE A FAIRE

### Court terme
- [ ] Audio mobile : surveiller glitches (fix latencyHint applique, compressor actif)

### Phase 3 — Navigation
- [ ] Festival Noosfeerique (placeholder)
- [ ] Projet Noosfeerique (placeholder)
- [ ] Profil utilisateur (placeholder)
- [ ] Parametres avances (sliders intensite, frequences, seuils, modes)

### Phase 4 — Conway sur sphere
- [ ] Photos rondes apparaissant sur la sphere quand Z > seuil
- [ ] Circle packing spherique
- [ ] Full mapping photo-sphere 360 quand Z > 3

### Futur
- [ ] Indicateur cumule type "Dot Princeton" (chi2 cumule → percentile)
- [ ] App native React Native + Expo SDK 52 + Supabase
- [ ] Comptes utilisateurs, synchro cross-device

### Deadline : Festival Noosfeerique, 3-4 octobre 2026

---

## NE PAS CASSER
- `public/index.html`, `public/js/app.js`, `public/js/charts.js`
- `public/js/zindex.js`, `public/css/style.css`

---

## CHARTE GRAPHIQUE
- Fond : `#0B0E14` (noir cosmique)
- Sphere : `#F5F5F2` (blanc chaud, brillant)
- Accent or : `#C9A24D`
- Accent cyan : `#4EC9C6`
- Texte principal : blanc opacity 0.9
- Texte secondaire : blanc opacity 0.5
- Liens cliquables : blanc pur #ffffff
- Speaker actif : blanc pur #ffffff
- Style : "MYSTIQUE SOBRE, PREMIUM, NON KITSCH"
- Glass-morphism discret (backdrop-filter blur)
- Font : Inter ou system sans-serif

## COMMANDES
```bash
npm install          # installer les dependances
npm start            # lancer le serveur (port 3000)
npm run dev          # lancer en mode watch
```

## REGLES
1. NE JAMAIS ecraser index.html, app.js, charts.js, style.css, zindex.js
2. NE JAMAIS committer .env ou des credentials
3. Performance : 60fps, Three.js leger
4. Pas de scroll, tout dans le viewport
5. La sphere EST l'interface — le moins d'UI possible
6. TOUTES les rampes audio en exponentialRamp, JAMAIS linearRamp
7. AudioContext avec latencyHint 'playback'
8. Compressor obligatoire avant destination audio
9. Bumper la version SW a chaque deploy
10. Tester sur https://noosfeerique.leparede.org/experience.html
