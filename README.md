<p align="center">
  <img src="docs/eiffel-ai-logo.png" alt="EIFFEL AI" width="280" />
</p>

<h1 align="center">noos&phi; — Prototype Dashboard</h1>

<p align="center">
  <strong>Mesurer la conscience collective en temps r&eacute;el</strong><br/>
  Prototype de visualisation des sources de donn&eacute;es RNG quantiques
</p>

<p align="center">
  D&eacute;velopp&eacute; par <strong>EIFFEL AI</strong> — Alexandre Ferran<br/>
  Mars 2026
</p>

---

## Ce que c'est

Ce prototype est un **dashboard web** qui affiche en temps r&eacute;el le **z-index** provenant de plusieurs sources de nombres al&eacute;atoires quantiques, dans la lign&eacute;e du [Global Consciousness Project](https://global-mind.org) de l'Universit&eacute; de Princeton.

L'id&eacute;e : quand un &eacute;v&eacute;nement mondial synchronise les &eacute;motions de millions de personnes, des g&eacute;n&eacute;rateurs de nombres al&eacute;atoires quantiques r&eacute;partis sur la plan&egrave;te montrent des d&eacute;viations statistiquement significatives. Ce dashboard permet de **voir ces d&eacute;viations en direct** et de comparer plusieurs sources.

**Ce n'est pas l'application finale** — c'est un banc d'essai technique pour valider la faisabilit&eacute; et montrer le rendu visuel avant de lancer le d&eacute;veloppement de l'app mobile (React Native / Expo).

---

## Ce que vous allez y trouver

### Le cercle color&eacute; (le "Dot")

Un cercle lumineux au centre qui change de couleur selon l'&eacute;tat de la conscience collective :

| Couleur | Signification | Z-Index |
|---------|---------------|---------|
| Vert | Al&eacute;atoire normal, rien de sp&eacute;cial | |z| < 1 |
| Jaune | L&eacute;g&egrave;re coh&eacute;rence d&eacute;tect&eacute;e | 1 &le; |z| < 1.5 |
| Orange | Coh&eacute;rence significative | 1.5 &le; |z| < 2 |
| Rouge | Anomalie forte (tr&egrave;s rare) | |z| &ge; 2 |

### Les 4 sources de donn&eacute;es

Le dashboard combine **4 sources** de nombres al&eacute;atoires, chacune activable/d&eacute;sactivable :

| Source | Origine | Ce qu'elle mesure |
|--------|---------|-------------------|
| **Mondial** (Princeton, USA) | ~60 capteurs quantiques r&eacute;partis sur la plan&egrave;te | La coh&eacute;rence du r&eacute;seau mondial depuis 1998 |
| **Quantique** (ANU, Australie) | G&eacute;n&eacute;rateur photonique de l'Australian National University | Al&eacute;atoire quantique pur via des photons |
| **NIST Beacon** (USA) | Service gouvernemental am&eacute;ricain | 512 bits d'entropie v&eacute;rifiable chaque minute |
| **Votre machine** | Le processeur de l'appareil qui fait tourner l'app | Bruit thermique local (d&eacute;tection automatique : Mac, PC, Linux, etc.) |

### Le graphique temps r&eacute;el

Un graphe glissant qui montre l'&eacute;volution du z-index au cours du temps, avec une courbe par source. Des **switches** (cliquets on/off) permettent de choisir quelles courbes afficher.

### Les bulles d'information

Des petits boutons **(i)** sont pr&eacute;sents partout dans l'interface. Survolez-les pour obtenir une explication en langage simple de chaque &eacute;l&eacute;ment.

### Le score combin&eacute; (Stouffer)

Le dashboard fusionne toutes les sources actives en un **score unique** via la m&eacute;thode statistique de Stouffer. Plus il y a de sources, plus la mesure est fiable.

---

## Installation

### Pr&eacute;requis

- **Node.js** version 18 ou sup&eacute;rieure ([t&eacute;l&eacute;charger ici](https://nodejs.org))
- Un terminal (Terminal sur Mac, PowerShell sur Windows, ou tout &eacute;quivalent)
- Une connexion internet (pour recevoir les donn&eacute;es des capteurs mondiaux)

### &Eacute;tapes

```bash
# 1. Cloner le d&eacute;p&ocirc;t
git clone https://github.com/Motokiyo/noosphi.git
cd noosphi

# 2. Installer les d&eacute;pendances
npm install

# 3. Lancer le dashboard
npm start
```

Le terminal affichera :

```
  ╔═══════════════════════════════════════════╗
  ║         noosφ — Prototype Dashboard       ║
  ║                                           ║
  ║   http://localhost:3000                   ║
  ║                                           ║
  ║   Sources: GCP + ANU QRNG + NIST + Local  ║
  ╚═══════════════════════════════════════════╝
```

**Ouvrez http://localhost:3000 dans votre navigateur.**

Les donn&eacute;es mettent quelques secondes &agrave; arriver (le serveur de Princeton est aux &Eacute;tats-Unis). Le graphe ajoute un nouveau point chaque minute.

### Arr&ecirc;ter le dashboard

Faites `Ctrl+C` dans le terminal.

---

## Ce qui se passe sous le capot

```
Votre navigateur  ──►  Serveur local (Express)  ──►  APIs externes
                       http://localhost:3000
                              │
                              ├──► global-mind.org (Princeton)
                              ├──► qrng.anu.edu.au (Australie)
                              ├──► beacon.nist.gov (USA)
                              └──► crypto du processeur (local)
```

Le serveur local sert de **relais** entre votre navigateur et les APIs mondiales. Il :

- R&eacute;cup&egrave;re les donn&eacute;es de Princeton toutes les minutes
- Demande des nombres quantiques &agrave; l'Australie (avec cache pour respecter les limites)
- Re&ccedil;oit les pulses du NIST Beacon
- G&eacute;n&egrave;re des nombres al&eacute;atoires localement via le processeur de votre machine
- Calcule les z-scores et les combine
- Envoie tout &agrave; votre navigateur en JSON

**Aucune donn&eacute;e personnelle n'est collect&eacute;e ni transmise.**

---

## Structure du projet

```
noosphi/
├── server.js             ← Serveur (proxy APIs + RNG local)
├── public/
│   ├── index.html        ← Page du dashboard
│   ├── favicon.svg       ← Ic&ocirc;ne de l'onglet
│   ├── css/style.css     ← Th&egrave;me visuel (dark)
│   └── js/
│       ├── zindex.js     ← Calculs statistiques (Stouffer, CDF)
│       ├── charts.js     ← Graphiques (Chart.js)
│       └── app.js        ← Logique (polling, affichage, toggles)
├── docs/
│   └── eiffel-ai-logo.png
├── ARCHITECTURE.md       ← Documentation technique d&eacute;taill&eacute;e
├── package.json
└── .gitignore
```

---

## D&eacute;tection automatique de l'appareil

Le dashboard d&eacute;tecte automatiquement le type de machine sur laquelle il tourne et l'affiche dans l'interface :

| Plateforme | Affichage |
|------------|-----------|
| MacBook / iMac (Apple Silicon) | Mac Apple Silicon |
| MacBook / iMac (Intel) | Mac Intel |
| PC sous Windows | PC Windows |
| PC sous Linux | PC Linux |
| Raspberry Pi | Raspberry Pi |
| Android (via Termux) | Android |

---

## Co&ucirc;t

- **Toutes les sources de donn&eacute;es sont gratuites**
- Le dashboard tourne en local, aucun h&eacute;bergement n&eacute;cessaire
- Seule d&eacute;pendance : `express` (serveur web Node.js)

---

## Feuille de route

Ce prototype valide la faisabilit&eacute; technique. Les prochaines &eacute;tapes sont d&eacute;crites dans la proposition de projet :

1. **Phase 1** — MVP mobile (React Native + Expo) : dot GCP + timer m&eacute;ditation
2. **Phase 2** — App compl&egrave;te : RNG quantique personnel, sessions de groupe, historique
3. **Phase 3** — Hardware : bo&icirc;tier RAVA-BLE + partenariat HeartMath / GCP 2.0

---

## Documentation technique

Pour une description d&eacute;taill&eacute;e de chaque fichier, des calculs statistiques, des flux de donn&eacute;es et de l'architecture, voir **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## D&eacute;couverte technique

Lors du d&eacute;veloppement, nous avons constat&eacute; que le service **ETH Zurich QRNG** (`qrng.ethz.ch`), pr&eacute;vu comme source de secours dans la proposition, est **hors service** (le DNS ne r&eacute;sout plus). Deux alternatives fonctionnelles ont &eacute;t&eacute; int&eacute;gr&eacute;es :

- **ANU QRNG** (Australian National University) — g&eacute;n&eacute;rateur photonique, fonctionnel
- **NIST Beacon 2.0** — service gouvernemental US, gratuit, fiable

Pour l'app finale, la source principale reste **QCI uQRNG** (1 milliard bits/mois gratuit) comme pr&eacute;vu.

---

<p align="center">
  <img src="docs/eiffel-ai-logo.png" alt="EIFFEL AI" width="160" /><br/>
  <strong>EIFFEL AI</strong><br/>
  <em>Alexandre Ferran</em><br/>
  <sub>noos&phi; — Mesurer la conscience collective en temps r&eacute;el</sub>
</p>
