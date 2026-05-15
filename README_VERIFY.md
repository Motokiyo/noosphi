# Guide d'Utilisation - Vérification Automatisée du Système de Sessions

## Fichiers

- **verify-sessions.js** — Script Puppeteer automatisé (11 tests, ~20-30s)
- **VERIFY_SESSIONS_REPORT.md** — Rapport détaillé en Markdown
- **VERIFY_SESSIONS_SUMMARY.txt** — Résumé exécutif en texte brut

## Démarrage Rapide

### Prérequis

```bash
node --version  # v18+ recommandé
npm list puppeteer  # Doit être installé
```

### Lancer la vérification

```bash
# 1. S'assurer que le serveur tourne
node server.js

# 2. Dans un autre terminal, lancer le script de vérification
node verify-sessions.js
```

### Résultats

Le script produit :
1. **Sortie console** — Progression détaillée, 11 checks avec statut
2. **Screenshots** — 11 PNG dans `/tmp/verify-screenshots/`

### Exemple de sortie

```
[1] Chargement de la page http://localhost:3000/experience.html
  ✅ Page loaded successfully

[2] Vérification des erreurs JS en console
  ✅ Aucune erreur JS en console

...

======================================================================
RÉSUMÉ DE LA VÉRIFICATION
======================================================================
[PASS] Page loads
[PASS] JS errors
[PASS] 3 round buttons present
...
Résultats: 11 PASS, 0 FAIL, 0 WARN
Screenshots: /tmp/verify-screenshots
======================================================================
```

## Checklist Vérifiée

### Infrastructure
- [x] Page charge sans erreur (`http://localhost:3000/experience.html`)
- [x] Zéro erreur JavaScript en console

### UI - Boutons
- [x] 3 boutons ronds visibles en bas à droite
- [x] Bouton session (#btn-session) cliquable

### Session Setup
- [x] Overlay transparente s'ouvre au clic
- [x] Champ texte "Nommez votre session..." présent
- [x] Bouton "Enregistrer" présent et cliquable

### Recording
- [x] Mode recording démarre après clic Enregistrer
- [x] Dot rouge visible (#session-rec-dot)
- [x] Timer avance (format MM:SS)
- [x] Z-score live s'affiche et se met à jour
- [x] Graphe se remplIT avec les données
- [x] Sphère 3D reste visible en arrière-plan

### Stop & Sauvegarde
- [x] Bouton "Arrêter la session" cliquable
- [x] Session sauvegardée après arrêt

### Historique
- [x] Bouton historique (#btn-session-history) ouvre la liste
- [x] Session apparaît dans la liste avec:
  - Nom de la session
  - Date et heure
  - Durée (6s capturée)
  - Z-max

### Détails
- [x] Clic sur session ouvre la vue détail
- [x] Détail affiche:
  - Titre (nom de session)
  - Métadonnées (date, durée, z-max)
  - Champ commentaire
  - Graphe complet Chart.js
  - Bouton "Supprimer cette session"

## Fichiers Sources Vérifiés

### HTML Structure
```
public/experience.html
├── .session-overlay (visible après clic session button)
├── .session-setup (avant recording)
├── .session-recording (pendant recording)
├── .sessions-list-overlay (historique)
└── .session-detail-overlay (détail d'une session)
```

### CSS
```
public/css/experience.css
├── .session-overlay { ... }
├── .session-header { ... }
├── .session-recording { ... }
├── .session-toggles { ... }
├── .session-chart-container { ... }
└── .sessions-list-overlay { ... }
```

### JavaScript
```
public/js/experience.js
├── Session state management
├── Timer logic (formatTime)
├── Recording data capture
├── Session persistence (localStorage/IndexedDB)
└── Event listeners
```

## Arrêt et Relance

### Tuer le serveur (si nécessaire)

```bash
lsof -i :3000  # Voir le PID
kill <PID>      # Tuer le processus

# Ou simplement relancer
node server.js
```

### Revalider après changement de code

```bash
# Apres modification de experience.html, experience.css, ou experience.js
node verify-sessions.js
```

## Logs et Debugging

### Voir les erreurs du serveur

```bash
tail -f /tmp/server.log  # Si lancé avec redirection
```

### Voir les screenshots

```bash
ls -lh /tmp/verify-screenshots/
open /tmp/verify-screenshots/06-recording-started.png  # macOS
```

### Modifier les timeouts

Éditer `verify-sessions.js` ligne ~26:
```javascript
page.setDefaultTimeout(10000);  // 10 secondes par défaut
```

### Ajouter des logs

Ajouter dans le script:
```javascript
console.log('[DEBUG]', variable);
```

## Astuces

1. **Exécution rapide:** Déjà lancé? Just run `node verify-sessions.js` again — le serveur reste actif
2. **Capture d'erreur:** Un screenshot sera pris automatiquement en cas d'erreur
3. **Données persistantes:** Les sessions sauvegardées restent dans le localStorage — vider si besoin:
   ```javascript
   // Dans la console du navigateur
   localStorage.clear();  // OU
   sessionStorage.clear();
   ```
4. **Vérification du DOM:** Inspecter via DevTools:
   ```bash
   # Lancer chrome manuellement avec debugging
   google-chrome --remote-debugging-port=9222 http://localhost:3000/experience.html
   ```

## Limitations Actuelles

- Script de vérification ne teste pas les données persistantes entre rafraîchissements (TODO)
- Ne teste pas la suppression de session (le bouton existe mais action non vérifiée)
- Ne teste pas le champ commentaire (UI présente mais non testée)
- Audio indicator présent mais non clickable dans cette version

## Roadmap

- [ ] Ajouter test de suppression de session
- [ ] Ajouter test de persistance localStorage (refresh page)
- [ ] Ajouter test commentaire + sauvegarde
- [ ] Tester responsiveness mobile (375x812)
- [ ] Tester export de session (JSON)
- [ ] Mesurer performance mémoire (no leaks)

## Support

Questions? Vérifier:
1. `/Users/alexandre/.claude/projects/-Users-...-memory/MEMORY.md`
2. `BRIEF_NOOSFEERIQUE.md`
3. `ARCHITECTURE.md`

---

**Dernière mise à jour:** 18 mars 2026
**Généré par:** Claude Agent (Haiku 4.5)
**Durée typique:** 20-30 secondes
