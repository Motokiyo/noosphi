# INDEX.md — Catalogue wiki Noosfeerique

> Lis ceci EN PREMIER. Ouvre les fichiers SEULEMENT pour les sections liees a ta tache.
> Mis a jour : 08/04/2026

## CLAUDE.md — instructions dev

- App artistique : conscience collective via QRNG, sphere 3D Three.js, soundscape meditatif
- URL : https://noosfeerique.leparede.org/experience.html
- Stack : Express + socket.io backend, Three.js + Web Audio frontend, PWA
- Charte : fond #0B0E14, sphere #F5F5F2, or #C9A24D, cyan #4EC9C6, mystique sobre
- Regles : 60fps, exponentialRamp audio, compressor obligatoire, ne pas casser index.html/app.js/zindex.js
- Deadline : Festival Noosfeerique, 3-4 octobre 2026

## Backend — server.js

- Express + socket.io + dotenv
- Routes API proxy : /api/gcp, /api/qrng, /api/nist-beacon, /api/qci, /api/local-rng, /api/status
- WebSocket : sessions collectives (creer, rejoindre, z-score combine)
- Deploy : Hetzner VPS, HTTPS Let's Encrypt

## Frontend — public/

- `experience.html` — page principale (sphere + son + sessions)
- `credits.html` — page credits
- `index.html` — dashboard existant (NE PAS TOUCHER)
- `js/experience.js` — logique complete (~1800 lignes) : sphere 3D, son, sessions, UI
- `js/zindex.js` — fonctions stats (NE PAS TOUCHER)
- `js/three.module.js` — Three.js standalone 570KB
- `css/experience.css` — styles mobile-first
- `sw.js` — service worker v4, cache offline

## Sources de donnees (5 actives)

- GCP Princeton (60s), QCI uQRNG (1s), ANU QRNG (60s), NIST Beacon (60s), Local RNG (1s)
- Calcul z-score : methode Princeton EGG, 200 bits -> z = (sum-100)/sqrt(50), Stouffer combine

## Documentation

- `METHODOLOGY_ZSCORE.md` — methode Princeton EGG + difference avec le Dot
- `ARCHITECTURE.md` — architecture detaillee
- `BRIEF_NOOSFEERIQUE.md` — brief artistique Franck Laharrague
- `CHANGELOG.md` — historique versions
- `PATHS.txt` — chemins fichiers

## A faire

- Phase 3 : navigation (festival, profil, parametres)
- Phase 4 : Conway sur sphere (photos rondes, circle packing)
- Futur : indicateur cumule, app native React Native + Supabase
