# noosφ — Prototype Dashboard : Architecture technique

**Date** : 15 mars 2026
**Objectif** : Prototype localhost pour valider la faisabilité technique de noosφ en cumulant toutes les sources de données RNG et en calculant le z-index en temps réel depuis un MacBook Pro.

---

## Vue d'ensemble

Ce prototype est un **dashboard web** qui tourne en local (`http://localhost:3000`). Il n'est pas l'application finale React Native — c'est un banc d'essai pour vérifier que les APIs externes fonctionnent, que les calculs statistiques sont corrects, et pour visualiser le résultat de la combinaison de toutes les sources.

```
┌─────────────────────────────────────────────────────────┐
│                    NAVIGATEUR                           │
│                                                         │
│   ┌──────────┐  ┌────────────────────────────────┐     │
│   │  Dot GCP │  │  Graphe Z-Index 24h (Chart.js) │     │
│   │  coloré  │  │  ── GCP mondial (violet)       │     │
│   │          │  │  ── Local machine (cyan)        │     │
│   │ Z=-1.24  │  │                                │     │
│   │ Z local  │  │                                │     │
│   │ Z combiné│  └────────────────────────────────┘     │
│   └──────────┘                                         │
│   ┌──────────┬──────────┬──────────┬──────────┐        │
│   │ GCP 1.0  │ ANU QRNG │ NIST     │ Local    │        │
│   │ Princeton│ Photonic │ Beacon   │ MacBook  │        │
│   │ UP 500ms │ UP 230ms │ UP 89ms  │ UP 0ms   │        │
│   └──────────┴──────────┴──────────┴──────────┘        │
│   ┌─────────────────┬───────────────────────────┐      │
│   │ Stouffer Z      │ Histogramme distribution  │      │
│   │ combiné         │ RNG locale (bar chart)    │      │
│   └─────────────────┴───────────────────────────┘      │
└────────────────────┬────────────────────────────────────┘
                     │  fetch /api/*
                     ▼
┌─────────────────────────────────────────────────────────┐
│               SERVEUR EXPRESS (Node.js)                 │
│               http://localhost:3000                      │
│                                                         │
│   /api/gcp ──────────► gcpdot.com/gcpindex.php          │
│   /api/qrng ─────────► qrng.anu.edu.au/API/jsonI.php   │
│   /api/nist-beacon ──► beacon.nist.gov/beacon/2.0/...   │
│   /api/local-rng ────► crypto.randomBytes() (Node.js)   │
│   /api/status ───────► ping toutes les sources          │
│   /api/gcp/history ──► tableau en mémoire (24h)         │
└─────────────────────────────────────────────────────────┘
```

**Pourquoi un serveur intermédiaire ?** Les APIs externes (GCP, ANU, NIST) ne permettent pas d'être appelées directement depuis un navigateur à cause des restrictions CORS. Le serveur Express agit comme un **proxy** : le navigateur parle au serveur local, qui parle aux APIs, et retourne les données en JSON propre.

---

## Structure des fichiers

```
noosphi-proto/
├── package.json          ← Dépendances (express uniquement)
├── server.js             ← Serveur Express : proxy APIs + RNG local
└── public/               ← Fichiers servis au navigateur
    ├── index.html        ← Page unique du dashboard
    ├── css/
    │   └── style.css     ← Thème dark, layout, animations du dot
    └── js/
        ├── zindex.js     ← Fonctions mathématiques (Stouffer, CDF)
        ├── charts.js     ← Configuration des graphiques Chart.js
        └── app.js        ← Logique : polling, mise à jour du DOM
```

---

## Détail de chaque fichier

### 1. `server.js` — Le cerveau backend

C'est un serveur Express minimaliste qui fait deux choses :
- **Servir les fichiers statiques** (HTML/CSS/JS) du dossier `public/`
- **Proxyfier les APIs externes** pour contourner les restrictions CORS du navigateur

#### Routes API

| Route | Source externe | Ce qu'elle fait |
|-------|---------------|-----------------|
| `GET /api/gcp` | `gcpdot.com/gcpindex.php` | Récupère les données des ~60 EGGs de Princeton, parse le XML, calcule le z-index Stouffer, retourne un JSON avec z-score, couleur, label |
| `GET /api/qrng` | `qrng.anu.edu.au` | Récupère 100 octets aléatoires quantiques (photoniques) depuis l'Australian National University. Cache de 2 minutes pour respecter le rate limit |
| `GET /api/nist-beacon` | `beacon.nist.gov` | Récupère le dernier pulse du NIST Randomness Beacon 2.0 (512 bits d'entropie). Cache de 1 minute |
| `GET /api/local-rng` | `crypto.randomBytes()` | Génère 1000 octets aléatoires via le TRNG du MacBook (bruit thermique du CPU Apple Silicon). Calcule un test chi-carré pour mesurer la déviation |
| `GET /api/status` | Toutes | Ping les 4 sources, mesure la latence, retourne un statut up/down |
| `GET /api/gcp/history` | Mémoire | Retourne les 1440 derniers points GCP (24h à 1 point/min) |

#### Parsing du GCP

Le endpoint de Princeton retourne du XML brut :
```xml
<gcpstats>
  <serverTime>1773601598</serverTime>
  <ss>
    <s t='1773601500'>0.4633143</s>
    <s t='1773601501'>0.4877027</s>
    ...
  </ss>
</gcpstats>
```

Chaque `<s>` contient une **p-value** (probabilité entre 0 et 1) issue d'un des ~60 générateurs quantiques (EGGs) répartis dans le monde. Le parser utilise une regex simple (`/<s t='(\d+)'>([\d.]+)<\/s>/g`) plutôt qu'une bibliothèque XML complète — le format est trivial et stable depuis 20 ans.

#### Cache en mémoire

Le serveur garde un tableau circulaire de 1440 entrées (= 24h à raison d'1 point par minute) pour alimenter le graphe historique sans re-requêter Princeton. Ce tableau est perdu au redémarrage du serveur — c'est un proto, pas une base de données.

#### Gestion des erreurs et timeouts

Chaque appel API externe a un timeout de 8 secondes (`AbortSignal`). Si une source tombe, le serveur retourne un JSON d'erreur structuré (`{ error, status: 'down', latency }`) au lieu de crasher.

---

### 2. `public/js/zindex.js` — Les mathématiques

Ce fichier contient les fonctions statistiques pures utilisées côté navigateur. C'est le cœur scientifique du prototype.

#### `inverseNormalCDF(p)` — La pièce maîtresse

Convertit une p-value (probabilité entre 0 et 1) en z-score (nombre d'écarts-types par rapport à la moyenne). Utilise l'approximation rationnelle de Peter Acklam, précise à 10⁻⁹.

**Pourquoi c'est nécessaire** : Les EGGs de Princeton fournissent des p-values. Pour les combiner via la méthode de Stouffer, il faut d'abord les convertir en z-scores. Une p-value de 0.5 donne un z de 0 (parfaitement aléatoire). Une p-value de 0.01 donne un z d'environ -2.33 (très déviant).

#### `stoufferZ(pValues)` — La combinaison

La méthode de Stouffer combine N z-scores indépendants en un seul :

```
Z_combiné = Σ(z_i) / √N
```

C'est exactement ce que fait le Global Consciousness Project pour calculer son z-index mondial : chaque EGG produit un z-score indépendant, et Stouffer les agrège.

#### `zToColor(z)` — Le code couleur

| |z| | Couleur | Signification |
|-----|---------|---------------|
| < 1.0 | Vert `#00CC66` | Cohérence normale |
| 1.0 – 1.5 | Jaune `#CCCC00` | Cohérence notable |
| 1.5 – 2.0 | Orange `#FF8800` | Cohérence significative |
| ≥ 2.0 | Rouge `#FF2200` | Anomalie détectée |

Convention identique au GCP Dot de Princeton.

#### `chiSquareFromBytes(bytes)` — Test du RNG local

Pour savoir si le RNG de ta machine est « bien aléatoire », on fait un test chi-carré sur la distribution des octets : si les 256 valeurs possibles (0-255) apparaissent avec des fréquences proches, le générateur est normal. Si la distribution est déviante, le z-score sera élevé.

La transformation de Wilson-Hilferty convertit le chi-carré (255 degrés de liberté) en z-score pour permettre la comparaison directe avec les z-scores GCP.

---

### 3. `public/js/charts.js` — Les graphiques

Deux graphiques Chart.js :

#### Graphe principal : Z-Index 24h glissant

- **Type** : ligne (`line`)
- **Deux courbes** :
  - Violette : Z-index GCP mondial (les 60 EGGs de Princeton combinés par Stouffer)
  - Cyan : Z-index local (chi-carré du RNG de ta machine)
- **Bandes colorées en fond** : un plugin custom dessine des zones semi-transparentes correspondant aux seuils de significativité (vert, jaune, orange, rouge) — tu vois immédiatement si le z-score est dans une zone normale ou anormale
- **Ligne pointillée à z=0** : la référence (aléatoire pur)
- **Mise à jour** : un nouveau point toutes les 60 secondes, maximum 1440 points (24h)

#### Mini-histogramme : Distribution RNG

- **Type** : barres (`bar`)
- **32 bins** (groupes de 8 valeurs sur 0-255)
- Permet de visualiser d'un coup d'œil si le RNG local produit une distribution uniforme. Une distribution parfaite donnerait 32 barres de hauteur identique.

---

### 4. `public/css/style.css` — L'identité visuelle

Thème dark inspiré de l'univers du projet (noosphère, cosmos, quantique) :

- **Fond** : `#0a0a1a` (noir bleuté profond) + halos subtils violet et cyan en fond
- **Cards** : fond semi-transparent avec `backdrop-filter: blur(12px)` pour un effet verre dépoli
- **Palette d'accents** :
  - `#6C63FF` — violet/indigo (couleur principale noosφ)
  - `#00E5FF` — cyan (données quantiques)
  - Les verts/jaunes/oranges/rouges du code couleur GCP
- **Le Dot GCP** : cercle de 120px avec :
  - Couleur dynamique selon le z-index
  - `box-shadow` en glow (halo lumineux) qui change avec la couleur
  - Animation `pulse` CSS (respiration lente de 3 secondes)
  - Un anneau concentrique qui pulse et disparaît (`ring-pulse`)
- **Layout** : CSS Grid avec sidebar gauche (dot + valeurs) et panneau principal droit (graphe). Responsive sur une colonne pour les petits écrans.
- **Typographie** : Inter (Google Fonts), chiffres tabulaires (`font-variant-numeric: tabular-nums`) pour que les valeurs ne "sautent" pas quand elles changent.

---

### 5. `public/index.html` — La structure

Page unique, pas de framework. Les zones :

1. **Header** : logo `noosφ` + badge de statut global (X/4 sources actives)
2. **Panneau dot** (gauche) : le cercle coloré GCP, le z-score numérique, le label, le nombre d'EGGs actifs, les z-scores local et combiné, l'heure de dernière mise à jour
3. **Panneau graphe** (droite) : le graphe 24h glissant
4. **4 cartes de statut** : une par source (GCP, ANU, NIST, Local), chacune avec indicateur up/down, latence, et métriques clés
5. **Panneau combiné** (bas) : la formule Stouffer affichée, les z-scores de chaque source, le z-score combiné final ; et l'histogramme de distribution du RNG local

Les scripts sont chargés dans l'ordre : `zindex.js` (maths), `charts.js` (graphes), `app.js` (logique).

---

### 6. `public/js/app.js` — L'orchestrateur

C'est le chef d'orchestre côté navigateur. Il gère :

#### Polling multi-sources

| Source | Intervalle | Pourquoi cet intervalle |
|--------|-----------|------------------------|
| GCP | 60 sec | Les données GCP changent toutes les secondes, mais 1/min suffit pour un graphe 24h |
| ANU QRNG | 120 sec | Rate limit gratuit (100 req/mois), cache serveur de 2 min |
| NIST Beacon | 60 sec | Le beacon émet 1 pulse/min, synchrone avec GCP |
| Local RNG | 30 sec | Pas de rate limit, c'est notre propre machine |

#### Cycle de vie d'un fetch

1. `fetchGCP()` appelle `GET /api/gcp`
2. Met à jour le dot (couleur CSS + glow)
3. Met à jour les valeurs numériques dans le DOM
4. Pousse un point dans le graphe Chart.js
5. Met à jour la carte de statut de la source
6. Recalcule le z-index combiné Stouffer

#### Z-index combiné

Le z-index combiné prend les z-scores de toutes les sources actives et les combine par Stouffer :

```
Z_combiné = (z_GCP + z_QRNG + z_local) / √3
```

Si une source est down, elle est ignorée et N diminue. Le calcul s'adapte dynamiquement.

---

## Les 4 sources de données

### Source 1 : GCP 1.0 (Princeton)

- **Quoi** : 60-70 générateurs de nombres aléatoires quantiques (EGGs, basés sur des diodes Zener) répartis dans le monde entier
- **URL** : `gcpdot.com/gcpindex.php`
- **Format** : XML avec timestamp + ~60 p-values
- **Ce qu'on en fait** : Chaque p-value est convertie en z-score via `inverseNormalCDF()`, puis les ~60 z-scores sont combinés par Stouffer en un z-index mondial unique
- **Rôle dans l'app finale** : Le z-index mondial temps réel — l'indicateur principal

### Source 2 : ANU QRNG (remplacement ETH Zurich)

- **Quoi** : Générateur quantique photonique de l'Australian National University. Mesure le bruit quantique du vide via des photons.
- **URL** : `qrng.anu.edu.au/API/jsonI.php?length=100&type=uint8`
- **Format** : JSON avec tableau d'octets (uint8)
- **Note** : ETH Zurich (`qrng.ethz.ch`) est DOWN (DNS ne résout plus). ANU est le fallback. Rate limit : ~100 req/mois en gratuit.
- **Ce qu'on en fait** : Test chi-carré sur la distribution des octets → z-score de déviation
- **Rôle dans l'app finale** : RNG quantique personnel (seed pour les sessions de méditation)

### Source 3 : NIST Randomness Beacon 2.0

- **Quoi** : Service du gouvernement américain qui émet un "pulse" cryptographique toutes les minutes, contenant 512 bits d'entropie vérifiable
- **URL** : `beacon.nist.gov/beacon/2.0/pulse/last`
- **Format** : JSON riche avec `localRandomValue` (hex 512 bits), `pulseIndex`, `timeStamp`
- **Ce qu'on en fait** : Les 512 bits sont convertis en 64 octets, statistiques et visualisation
- **Rôle dans l'app finale** : Source de secours (fallback si ANU ou QCI sont down)

### Source 4 : RNG local (MacBook Pro)

- **Quoi** : Le TRNG (True Random Number Generator) intégré dans la puce Apple Silicon de ta machine. Basé sur le bruit thermique des oscillateurs en anneau de la Secure Enclave.
- **API** : `crypto.randomBytes()` (Node.js) côté serveur ; dans l'app finale ce serait `expo-crypto: getRandomBytes()` (même source matérielle sur iOS)
- **Format** : Buffer de 1000 octets
- **Ce qu'on en fait** : Test chi-carré → z-score + histogramme de distribution
- **Rôle dans l'app finale** : Mesure personnelle complémentaire, résultat immédiat sans internet

---

## Ce qui change entre ce prototype et l'app finale

| Aspect | Prototype (ici) | App finale (proposition) |
|--------|----------------|--------------------------|
| Stack | HTML/CSS/JS + Express | React Native + Expo SDK 52 |
| Plateforme | Navigateur desktop | iOS / Android / PWA |
| RNG cloud | ANU QRNG (fallback) | QCI uQRNG (photonique, 1G bits/mois) |
| RNG local | `crypto.randomBytes` (Node) | `expo-crypto: getRandomBytes` (téléphone) |
| Z-index mondial | Polling direct → Express | Cloudflare Worker → Firebase RTDB (push) |
| Données | En mémoire (perdu au restart) | Supabase PostgreSQL (persistant) |
| Auth | Aucune | Supabase Auth (email, Google, Apple) |
| Temps réel | Polling 60s | Firebase RTDB WebSocket (push) |
| Sessions | Non | Méditation guidée + timer + enregistrement |
| Groupes | Non | Sessions synchronisées via Supabase Realtime |

---

## Comment lancer

```bash
cd noosphi-proto
npm install
npm start
# → http://localhost:3000
```

Le serveur contacte les 4 sources dès le premier chargement du dashboard. Les données se rafraîchissent automatiquement selon les intervalles de polling.

---

## Découverte technique importante

**ETH Zurich QRNG (`qrng.ethz.ch`) est hors service.** Le DNS ne résout plus. Cette source prévue dans la proposition comme "fallback" n'est pas utilisable en l'état. Deux alternatives fonctionnelles ont été intégrées :
- **ANU QRNG** (photonique, Australie) — fonctionne, rate limit à surveiller
- **NIST Beacon 2.0** — fonctionne, gratuit, sans rate limit excessif

Pour l'app finale, la source principale reste **QCI uQRNG** (1 milliard bits/mois gratuit) comme prévu dans la proposition. ANU et NIST servent de fallback.
