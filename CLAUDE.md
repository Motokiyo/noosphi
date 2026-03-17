# CLAUDE.md — Projet Noosfeerique (NAPP)

## QUI TU ES
Tu es le dev principal de l'application Noosfeerique. Alexandre (l'utilisateur) est ton interlocuteur.
Tu travailles dans ce dossier : `noosphi-proto/`.

## LE PROJET EN UNE PHRASE
App artistique qui visualise en temps reel l'impact de la conscience collective sur des generateurs de nombres aleatoires quantiques, via une sphere 3D reactive.

## DOCUMENTS A LIRE
- `BRIEF_NOOSFEERIQUE.md` — spec complete, vision artistique de Franck, charte graphique, specs techniques, phases
- `ARCHITECTURE.md` — architecture technique du proto dashboard existant

---

## BUG THREE.JS — CORRIGE (17 mars 2026)

Le fichier `three.module.min.js` (version "addons" cassee) a ete SUPPRIME.
Remplace par `public/js/three.module.js` (570KB, bundle standalone copie depuis le dossier de Franck).
L'importmap dans experience.html pointe vers `./js/three.module.js`.

---

## ETAT ACTUEL (17 mars 2026)

### PHASE 1 — SPHERE MVP : IMPLEMENTEE (mais bug Three.js a corriger, voir ci-dessus)
Les fichiers suivants ont ete crees et sont fonctionnels :

- `public/experience.html` — page Experience Noosfeerique (sphere plein ecran)
- `public/css/experience.css` — styles mobile-first, charte graphique Franck
- `public/js/experience.js` — logique complete :
  - Sphere Three.js (MeshPhysicalMaterial, clearcoat, roughness)
  - Eclairage multi-points (ambient + key + fill cyan + rim or), intensite = f(|Z|)
  - Halo/glow sprite additif, opacite = f(|Z|)
  - Rotation lente (Y 0.003, X 0.001), pulse subtil
  - ZScoreCalculator (12000 bits/s, fenetre 60s, 1 calcul/seconde)
  - Audio : triangle + lowpass + gain (0.02-0.10), toggle au clic sur sphere
  - Fetch des 4 APIs (/api/gcp, /api/qrng, /api/nist-beacon, /api/local-rng) toutes les 60s
  - Combinaison Stouffer via zindex.js
  - Transitions fluides (lerp)
- `public/js/three.module.min.js` — Three.js copie locale

### URLs
- http://localhost:3000/experience.html → sphere (NOUVEAU)
- http://localhost:3000/ → dashboard existant (INCHANGE)

---

## CE QU'IL RESTE A FAIRE

### Phase 2 — Integration donnees mondiales (A VALIDER)
La Phase 1 fetch deja les APIs et combine via Stouffer, mais il faut :
- [ ] Verifier visuellement que les donnees API influencent bien la sphere
- [ ] Afficher un indicateur discret du nombre de sources actives (4 dots en bas a gauche existent deja)
- [ ] Tester avec le serveur qui tourne (les APIs externes repondent-elles ?)

### Phase 3 — Sidebar + navigation
- [ ] Menu sidebar animee (slide from left)
  - Experience Noosfeerique (actif)
  - Festival Noosfeerique (placeholder)
  - Projet Noosfeerique (placeholder)
  - Profil utilisateur (placeholder)
  - Parametres
- [ ] Panneau parametres d'experience (accessible via icone engrenage) :
  - Intensite lumineuse maximale (slider)
  - Plages de frequences sonores (slider min/max)
  - Sensibilite des variations (slider)
  - Seuils de declenchement Z (slider, defaut 2)
  - Mode : Individuel / Collectif / Scene (radio buttons)
  - Vitesse d'animation (slider)
- [ ] Pages placeholder pour Festival et Projet

### Phase 4 — Conway sur sphere (avance, complexe)
- [ ] Photos rondes apparaissant sur la sphere quand Z > seuil
- [ ] Circle packing spherique (theoreme de Descartes)
- [ ] Animations naissance/croissance/deplacement/mort
- [ ] Full mapping photo-sphere 360 quand Z > 3
- [ ] Franck dispose de "dizaines de milliers de photos rondes" a integrer

---

## CE QUI EXISTE — NE PAS CASSER

### Backend (server.js, port 3000)
- Express servant `public/` en statique
- Routes API proxy :
  - `GET /api/gcp` → Princeton GCP (~60 EGGs quantiques mondiaux)
  - `GET /api/qrng` → ANU QRNG (photonique, Australie)
  - `GET /api/nist-beacon` → NIST Beacon 2.0 (US gov)
  - `GET /api/local-rng` → crypto.randomBytes local
  - `GET /api/status` → ping toutes les sources
  - `GET /api/gcp/history` → historique 24h en memoire

### Dashboard existant (NE PAS TOUCHER)
- `public/index.html` — dashboard avec dot GCP, graphe 24h, cartes
- `public/js/app.js` — orchestrateur polling
- `public/js/charts.js` — config Chart.js
- `public/js/zindex.js` — fonctions stats (inverseNormalCDF, stoufferZ, zToColor, chiSquareFromBytes, normalCDF)
- `public/css/style.css` — styles du dashboard

### Code de reference (NAP v1 de Franck)
`/Users/alexandre/Downloads/Code NAPv1ok by Franck/main.js` — ZScoreCalculator, getRandomBits, logique audio

---

## CHARTE GRAPHIQUE STRICTE
- Fond : `#0B0E14` (noir cosmique)
- Sphere : `#F5F5F2` (blanc chaud)
- Accent or : `#C9A24D`
- Accent cyan : `#4EC9C6`
- Texte principal : blanc opacity 0.9
- Texte secondaire : blanc opacity 0.5
- Style : "MYSTIQUE SOBRE, PREMIUM, NON KITSCH"
- Glass-morphism discret (backdrop-filter blur)
- Font : Inter ou system sans-serif
- Boutons fins et minimalistes

## COMMANDES UTILES
```bash
npm install          # installer express
npm start            # lancer le serveur (port 3000)
npm run dev          # lancer en mode watch (node --watch)
```

## REGLES
1. NE JAMAIS ecraser index.html, app.js, charts.js, style.css, zindex.js
2. Performance : 60fps, Three.js leger
3. Pas de scroll, tout dans le viewport
4. La sphere EST l'interface — le moins d'UI possible
5. Tester sur http://localhost:3000/experience.html
6. Le dashboard reste sur http://localhost:3000/
