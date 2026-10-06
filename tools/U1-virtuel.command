#!/bin/bash
# Lanceur de concert du U1 virtuel (Noosfeerique -> MIDI -> MainStage).
# Ouvre l'app dans une fenetre Chrome a part, avec son propre profil, et
# desactive le ralentissement que Chrome applique aux fenetres cachees :
# sans ca, des que MainStage passe devant, le U1 virtuel s'endort.
# concert=1 fige la sphere : la carte graphique ne travaille plus.
# Usage : double-clic, ou ./U1-virtuel.command [adresse]

URL="${1:-https://noosfeerique.leparede.org/experience.html?midi=1&concert=1}"
PROFIL="$HOME/Library/Application Support/U1-virtuel-Chrome"

open -na "Google Chrome" --args \
  --user-data-dir="$PROFIL" \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --disable-features=IntensiveWakeUpThrottling \
  --no-first-run --no-default-browser-check \
  --app="$URL"
