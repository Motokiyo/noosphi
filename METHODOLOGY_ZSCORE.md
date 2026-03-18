# Methodologie de calcul du Z-score — noosphi

**Version** : 18 mars 2026
**Auteur** : Equipe noosphi (EIFFEL AI)
**Reference** : Global Consciousness Project, Princeton University (1998-present)

---

## 1. Principe general

Toutes les sources de nombres aleatoires de noosphi sont normalisees selon la **methode EGG du Global Consciousness Project** de Princeton. Cela garantit que les z-scores de chaque source sont directement comparables et combinables.

Un z-score de 0 signifie "aleatoire pur" (pas de deviation). Un |z| > 2 est statistiquement significatif (probabilite < 5% sous l'hypothese nulle).

---

## 2. Methode EGG (Princeton)

### 2.1 Par trial (unite de base)

1. Generer **200 bits** aleatoires
2. Compter le nombre de bits a `1` → `trialsum`
3. Distribution theorique sous H0 : **Binomiale(200, 0.5)**
   - Esperance : μ = 100
   - Variance : σ² = 200 × 0.5 × 0.5 = 50
   - Ecart-type : σ = √50 ≈ 7.071
4. Z-score du trial :

```
z = (trialsum - 100) / √50
```

Sous l'hypothese nulle, z ~ N(0,1).

### 2.2 Combinaison multi-trials (methode de Stouffer)

Quand plusieurs trials independants sont disponibles (N trials), on les combine via la **methode de Stouffer** :

```
Z_combine = (z_1 + z_2 + ... + z_N) / √N
```

Le Z combine suit egalement N(0,1) sous H0, grace au theoreme central limite.

### 2.3 Filtrage qualite (rotten egg)

Tout trial avec trialsum < 50 ou > 150 (soit |z| > 7) est rejete comme aberrant. C'est le seuil utilise par Princeton.

---

## 3. Application par source

### 3.1 GCP Princeton (~60 EGGs mondiaux)

| Parametre | Valeur |
|-----------|--------|
| **Type de generateur** | REG materiels (Random Event Generators) |
| **Technologie** | Bruit electronique quantique (diodes Zener, effet tunnel) |
| **Bits par trial** | 200 |
| **Trials par seconde** | 1 par EGG |
| **Nombre d'EGGs actifs** | ~60 (repartis dans le monde) |
| **Correction de biais** | XOR avec masque fixe (cote appareil) |
| **Frequence de rafraichissement** | **1 seconde** (pas de rate limit) |
| **Endpoint** | `https://global-mind.org/gcpdot/gcpindex.php` |
| **Format de reponse** | XML : 60 p-values (une par seconde d'historique) |

**Calcul cote noosphi :**
Le serveur GCP effectue deja le Stouffer Z sur les ~60 EGGs et nous transmet le resultat sous forme de **p-value cumulative** (entre 0 et 1). Nous reconvertissons en z-score :

```
z = inverseNormalCDF(p)
```

Nous utilisons la derniere p-value (seconde la plus recente).

**C'est la source de reference.** Toutes les autres sources sont calibrees pour produire des z-scores comparables.

---

### 3.2 QCI uQRNG (Quantum Computing Inc.)

| Parametre | Valeur |
|-----------|--------|
| **Type de generateur** | Photonique quantique (detection de photons uniques) |
| **Technologie** | Source de photons → detection → distribution de Poisson |
| **Localisation** | Cloud (serveurs QCI, USA) |
| **Donnees recues** | 25 octets (200 bits) par requete = exactement 1 trial EGG |
| **Nombre de trials** | 200 / 200 = **1 trial** |
| **Frequence de rafraichissement** | **1 seconde** |
| **Quota gratuit** | 1 milliard de bits / mois |
| **Consommation** | 200 bits/s × 86400 s/jour × 30 jours ≈ 518M bits/mois (**52% du quota**) |
| **Endpoint** | `POST https://api.qci-prod.com/qrng/random_numbers` |
| **Authentification** | Bearer token OAuth2 (refresh token → access token) |
| **Format de requete** | `{"distribution": "uniform_discrete", "n_samples": 25, "n_bits": 8}` |
| **Format de reponse** | Array JSON d'entiers [0-255] |

**Calcul cote noosphi :**

```
1. Recevoir 25 octets = 200 bits = exactement 1 trial EGG Princeton
2. Compter les bits a 1 → trialsum
3. z = (trialsum - 100) / √50
```

Pas de Stouffer necessaire : un seul trial, comme un EGG individuel de Princeton.

---

### 3.3 ANU QRNG (Australian National University)

| Parametre | Valeur |
|-----------|--------|
| **Type de generateur** | Photonique quantique (bruit quantique du vide) |
| **Technologie** | Mesure des fluctuations du vide quantique via photons |
| **Localisation** | Canberra, Australie |
| **Donnees recues** | 100 octets (800 bits) par requete |
| **Nombre de trials** | 800 / 200 = **4 trials** |
| **Frequence de rafraichissement** | 60 secondes (rate limit : 1 req/min gratuit) |
| **Endpoint** | `https://qrng.anu.edu.au/API/jsonI.php?length=100&type=uint8` |
| **Authentification** | Aucune (gratuit, rate-limite) |
| **Format de reponse** | `{"success": true, "data": [42, 187, ...], "type": "uint8"}` |
| **Fallback** | Si ANU est down, utilise les donnees NIST Beacon |

**Calcul** : identique a QCI (octets → bits → trials de 200 → Stouffer).

---

### 3.4 NIST Beacon 2.0 (National Institute of Standards and Technology)

| Parametre | Valeur |
|-----------|--------|
| **Type de generateur** | Source d'entropie certifiee par le gouvernement americain |
| **Technologie** | Non divulguee (probablement photonique + post-traitement) |
| **Localisation** | USA (gouvernement federal) |
| **Donnees recues** | 512 bits (64 octets) par pulse |
| **Nombre de trials** | 512 / 200 = **2 trials** (112 bits restants ignores) |
| **Frequence de rafraichissement** | 60 secondes (1 pulse/minute) |
| **Endpoint** | `https://beacon.nist.gov/beacon/2.0/pulse/last` |
| **Authentification** | Aucune (service public gratuit) |
| **Format de reponse** | JSON avec `pulse.localRandomValue` (hex string 128 chars) |

**Calcul** : identique (octets → bits → trials de 200 → Stouffer). Seuls 2 trials possibles avec 512 bits.

---

### 3.5 RNG Local (navigateur web)

| Parametre | Valeur |
|-----------|--------|
| **Type de generateur** | CSPRNG du systeme d'exploitation |
| **Technologie** | Bruit thermique des composants electroniques (pas quantique) |
| **Localisation** | L'appareil de l'utilisateur |
| **Donnees generees** | 200 bits par trial |
| **Nombre de trials** | **1 trial** par seconde |
| **Frequence** | 1 seconde |
| **API** | `crypto.getRandomValues()` (Web Crypto API) |

**Calcul** :

```
1. Generer 25 octets = 200 bits via crypto.getRandomValues()
2. Compter les bits a 1 → trialsum
3. z = (trialsum - 100) / √50
```

Un seul trial par tick — pas de Stouffer. C'est exactement ce que fait un EGG Princeton individuel.

**Note** : cette source n'est pas quantique. C'est un generateur pseudo-aleatoire cryptographique alimente par le bruit thermique du CPU. Elle sert de reference locale et de source de controle.

---

### 3.6 RNG Local (serveur Node.js)

| Parametre | Valeur |
|-----------|--------|
| **Type de generateur** | `crypto.randomBytes()` (Node.js) |
| **Technologie** | CSPRNG du noyau OS (meme source que le navigateur) |
| **Donnees generees** | 1000 octets = 8000 bits |
| **Nombre de trials** | 8000 / 200 = **40 trials** |
| **Frequence** | 60 secondes |

**Calcul** : identique aux autres (octets → bits → 40 trials de 200 → Stouffer).

---

## 4. Combinaison globale (Stouffer multi-sources)

Quand l'utilisateur selectionne "Combine" (mode par defaut), les z-scores de toutes les sources actives sont combines via Stouffer :

```
Z_global = (z_GCP + z_QCI + z_ANU + z_NIST + z_local + ...) / √K
```

ou K = nombre de sources actives.

Chaque source contribue avec le meme poids car toutes produisent des z ~ N(0,1) par construction.

---

## 5. Interpretation des seuils

| Z-score | Probabilite (hasard) | Interpretation |
|---------|---------------------|----------------|
| |z| < 1.0 | 68% | Aleatoire normal |
| |z| > 1.5 | 13% | Coherence notable |
| |z| > 2.0 | 4.6% | Statistiquement significatif |
| |z| > 2.5 | 1.2% | Fortement significatif |
| |z| > 3.0 | 0.27% | Anomalie rare |

Ces seuils sont les memes que ceux utilises par le GCP depuis 1998.

---

## 6. Limites et considerations

### Qualite statistique par source

### Qualite statistique et frequence par source

| Source | Trials/requete | Frequence | Robustesse | Notes |
|--------|---------------|-----------|------------|-------|
| GCP Princeton | ~60 EGGs × 1 trial | **1s** | **Excellente** | Stouffer sur 60 appareils independants |
| QCI uQRNG | 1 trial (25 octets) | **1s** | **Standard** | 1 trial quantique photonique, identique a 1 EGG |
| Local navigateur | 1 trial (25 octets) | **1s** | **Standard** | 1 trial CSPRNG, identique a 1 EGG (pas quantique) |
| Local serveur | 40 trials (1000 octets) | 60s | **Bonne** | Grand echantillon, CSPRNG |
| ANU QRNG | 4 trials (100 octets) | 60s | **Moderee** | Rate-limite, source quantique photonique |
| NIST Beacon | 2 trials (64 octets) | 60s | **Limitee** | 512 bits/pulse, 1 pulse/min |

### Pourquoi Princeton est plus stable

Princeton combine ~60 EGGs independants via Stouffer : `Z = Σ(z_i) / √60`. La variance effective est reduite par √60 ≈ 7.7×. Un EGG seul (ou QCI, ou le local) fluctue naturellement entre -2 et +2 (95% du temps).

Les sources a 1 trial (QCI, local) ne sont pas "fausses" — elles sont plus bruyantes. C'est normal et attendu. La combinaison Stouffer multi-sources reduit ce bruit.

---

## 7. Implementation (code de reference)

### Z-score d'un trial (JavaScript)

```javascript
const SQRT_50 = Math.sqrt(50);

function trialZ(bits200) {
  // bits200 : Uint8Array de 25 octets (200 bits)
  let sum = 0;
  for (let i = 0; i < 25; i++) {
    let b = bits200[i];
    b = b - ((b >> 1) & 0x55);
    b = (b & 0x33) + ((b >> 2) & 0x33);
    sum += (b + (b >> 4)) & 0x0F;
  }
  return (sum - 100) / SQRT_50;
}
```

### Stouffer combine (JavaScript)

```javascript
function stoufferCombine(zScores) {
  const valid = zScores.filter(z => z != null && isFinite(z));
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / Math.sqrt(valid.length);
}
```

### Octets → Z EGG (JavaScript, cote serveur)

```javascript
function bytesToEggZ(bytes) {
  const totalBits = bytes.length * 8;
  const numTrials = Math.floor(totalBits / 200);
  if (numTrials === 0) return null;

  const zScores = [];
  for (let t = 0; t < numTrials; t++) {
    let sum = 0;
    const startBit = t * 200;
    for (let b = 0; b < 200; b++) {
      const bitIndex = startBit + b;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = 7 - (bitIndex % 8);
      if ((bytes[byteIndex] >> bitOffset) & 1) sum++;
    }
    zScores.push((sum - 100) / SQRT_50);
  }
  return stoufferCombine(zScores);
}
```

---

## 8. References

- Nelson, R.D. et al. — "Correlations of Continuous Random Data with Major World Events" (2002)
- [GCP: Analysis, Chisquare Calculation](https://noosphere.princeton.edu/analysis_chi.html)
- [GCP: The Data](https://noosphere.princeton.edu/gcpdata.html)
- [GCP: Methodology](https://noosphere.princeton.edu/methodology.html)
- May, E.C. & Spottiswoode, S.J.P. — "Global Consciousness Project: An Independent Analysis of the 11 September 2001 Events" (2001)
- [Global Consciousness Project 2.0](https://gcp2.net/about)
- Stouffer, S.A. et al. — "The American Soldier" (1949) — methode originale de combinaison
