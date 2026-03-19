# CLAUDE.md — Noosfeerique v1.0.0

## QUI TU ES
Tu es le dev principal de l'application Noosfeerique. Alexandre (l'utilisateur) est ton interlocuteur.
Franck Laharrague est le commanditaire et directeur artistique.

## LE PROJET EN UNE PHRASE
App artistique mesurant la conscience collective en temps reel via des generateurs de nombres aleatoires quantiques (lignee du Global Consciousness Project de Princeton), visualisee par une sphere 3D reactive et un soundscape meditatif.

## VERSION : 1.0.0 (19 mars 2026)

---

## ARCHITECTURE

### Frontend (public/)
- `experience.html` — page Experience Noosfeerique (sphere + son + sessions)
- `credits.html` — page credits (Franck, Alexandre, Claude Code, QCI)
- `index.html` — dashboard existant (NE PAS TOUCHER)
- `manifest.json` — PWA config
- `sw.js` — service worker (cache offline)
- `css/experience.css` — styles mobile-first
- `js/experience.js` — logique complete (~1500 lignes)
- `js/zindex.js` — fonctions stats (NE PAS TOUCHER)
- `js/three.module.js` — Three.js standalone 570KB
- `assets/icons/` — icones PWA (icon-512, icon-192, apple-touch-icon, favicons)
- `assets/images/` — logo EIFFEL AI

### Backend (server.js)
- Express + socket.io
- Routes API proxy : /api/gcp, /api/qrng, /api/nist-beacon, /api/qci, /api/local-rng, /api/status
- WebSocket : sessions collectives (creer, rejoindre, z-score combine)
- dotenv pour les credentials (.env gitignore)

### Calcul z-score — Methode Princeton EGG
Toutes les sources utilisent la meme methode : 200 bits → z = (sum-100)/√50
- Local : 10 trials/sec, Stouffer combine
- QCI : 50 octets = 2 trials, 1 req/sec
- ANU/NIST : octets → bits → trials, 1 req/min
- GCP : p-values reseau → inverseNormalCDF (deja combine par Princeton)
- Doc : METHODOLOGY_ZSCORE.md

---

## CE QUI EST IMPLEMENTE

### Sphere 3D
- [x] Three.js MeshPhysicalMaterial (roughness 0.15, clearcoat 0.8)
- [x] Eclairage reactif au z-score (key + fill cyan + rim or + ambient)
- [x] Halo/glow sprite additif
- [x] Rotation lente
- [x] Responsive (75% de la plus petite dimension, jamais coupee)
- [x] Photo sphere de Franck apparait a |z| > 2 (opacite progressive, taille fixe)

### Son meditatif
- [x] 6 couches : drone tanpura + pad cordes + cello + bol frappe + cloche + gong
- [x] Frappes humanisees (aleatoire volume/decay/intervalle/stagger)
- [x] 6 gammes musicales (432 Hz) — persiste en localStorage
- [x] Pad joue octave sous le cello avec intervalles harmoniques variables
- [x] Volume slider (pilule flottante) — persiste en localStorage
- [x] Compressor audio (anti-saturation mobile)
- [x] Toutes rampes exponentialRamp, attack 30ms, latencyHint 'playback'
- [x] Reverb cathedrale (dual delay feedback)

### Sources de donnees (5 actives)
- [x] GCP Princeton (60s) — ~60 EGGs quantiques mondiaux
- [x] QCI uQRNG (1s) — photonique quantique cloud, token via .env
- [x] ANU QRNG (60s) — photonique quantique, Australie
- [x] NIST Beacon (60s) — entropie gouvernementale US
- [x] Local RNG (1s) — CSPRNG, 10 trials EGG

### Interface
- [x] Sidebar sources (hamburger) — choix source individuelle
- [x] Panneau settings (engrenage) — choix gamme musicale
- [x] Modale help (?) — contexte Princeton, z-score explique, lien credits
- [x] Overlay graphique — historique 24h glissant, toggles, coherences marquantes
- [x] Header cache quand overlays ouverts (CSS :has())
- [x] Boutons cercle+X uniformes partout
- [x] Speaker blanc vif quand actif
- [x] Responsive mobile-first

### Sessions
- [x] Solo : nommer, enregistrer, pause/reprendre, arreter
- [x] Collective (WebSocket) : creer code NOOS-XXXX, rejoindre, partager
- [x] Web Share API (Telegram/WhatsApp/Signal)
- [x] Z-score centre + graphe temps reel + toggles sources
- [x] Sauvegarde localStorage (max 50), renommer, supprimer
- [x] Detail : graphe par source, commentaire editable
- [x] Son activable dans les sessions (bouton + clic zone sphere)

### PWA
- [x] manifest.json avec icones
- [x] Service worker (cache offline, network-first)
- [x] Favicon sphere

---

## CE QU'IL RESTE A FAIRE

### Deploiement
- [ ] Domaine + HTTPS (Let's Encrypt) sur Hetzner — necessaire pour Web Share API
- [ ] Deja deploye en HTTP sur VPS Hetzner (meme serveur qu'OpenClaw)

### Phase 3 — Sidebar navigation
- [ ] Festival Noosfeerique (placeholder)
- [ ] Projet Noosfeerique (placeholder)
- [ ] Profil utilisateur (placeholder)
- [ ] Parametres avances (sliders intensite, frequences, seuils)

### Phase 4 — Conway sur sphere
- [ ] Photos rondes apparaissant sur la sphere quand Z > seuil
- [ ] Circle packing spherique
- [ ] Animations naissance/croissance/deplacement/mort
- [ ] Full mapping photo-sphere 360 quand Z > 3

### Deadline : Festival Noosfeerique, 3-4 octobre 2026

---

## NE PAS CASSER

### Dashboard existant
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
- Style : "MYSTIQUE SOBRE, PREMIUM, NON KITSCH"
- Glass-morphism discret (backdrop-filter blur)
- Font : Inter ou system sans-serif
- Liens cliquables : blanc pur #ffffff

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
6. Toutes les rampes audio en exponentialRamp, jamais linearRamp
7. AudioContext avec latencyHint 'playback'
8. Tester sur http://localhost:3000/experience.html
