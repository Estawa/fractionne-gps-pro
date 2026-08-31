# Fractionné GPS Pro

Application de séances de fractionné guidées par %VMA et GPS (React + Vite + Tailwind, PWA installable).

## Historique des changements — 31 août 2026

### Fiabilité écran / GPS tué en arrière-plan (Simple **et** Full Power, y compris Hazardous)
- **Wake Lock** : l'écran ne s'éteint plus tout seul pendant une course (n'empêche pas un appui volontaire/accidentel sur le bouton power — aucune appli web ne peut bloquer ça).
- **Sauvegarde continue de la séance en cours** : l'état complet (chrono, distance, phase, accumulateurs) est sauvegardé chaque seconde et juste avant que l'écran s'éteigne ou que l'appli passe en arrière-plan.
- **Reprise automatique** : si l'écran s'éteint ou que l'appli est tuée par l'OS pendant une course, un écran "Reprendre la séance ?" permet de repartir exactement où on en était, au lieu de tout perdre.
- Fichiers concernés : `src/shared.jsx` (fonctions communes `useWakeLock`, `saveActiveSession`, `loadActiveSession`, `clearActiveSession`), `src/FractionneGPS.jsx`, `src/fullpower/FullPower.jsx`.

### Cadran de régulation plus précis (Simple **et** Full Power, y compris Hazardous)
- La zone verte (silence, aucun bip) est désormais calée exactement sur la tolérance réelle des bips (±7%), au lieu d'une zone visuelle plus large (mode Simple) ou d'un cadran de vitesse absolue sans lien avec la cible (Full Power) — l'aiguille entre dans le vert pile quand les bips s'arrêtent, et en ressort pile quand ils reprennent.
- Fichiers concernés : `src/shared.jsx` (fonction commune `gaugePoint`), `src/FractionneGPS.jsx`, `src/fullpower/FullPower.jsx` (composant `NeedleGauge`).

### Précision GPS (Simple et Full Power)
- Position toujours demandée "fraîche" (`maximumAge: 0`) plutôt qu'une position en cache jusqu'à 1s, pour la meilleure précision possible.
- Limite à connaître : la fréquence de mise à jour (~1 fois par seconde) dépend du GPS du téléphone et n'est pas réglable depuis le navigateur — aucun réglage ne peut descendre en dessous de ce que le GPS du téléphone fournit.

### Affichage pendant la course (Simple et Full Power, y compris Hazardous)
- %VMA instantané et %VMA cible agrandis et mis en avant.
- Compteurs permanents visibles sur toutes les phases : distance totale de la séance (depuis le début de l'échauffement), distance de travail cumulée, temps restant total de la séance.
- En Hazardous Mode : le %VMA cible de la phase en cours est affiché en direct à côté de l'instantané (c'est l'objectif du moment présent, pas une info sur la suite de la séance — la structure cachée et la surprise restent intactes).

### Sons différenciés (Simple et Full Power)
- Trois signatures sonores distinctes désormais : gong clair et énergique au départ d'un run, gong grave et posé à la fin d'un run (entrée en récup'), double gong (inchangé) pour les pauses de série.
- Fichiers concernés : `src/shared.jsx` (fonctions communes `playGongStart`, `playGongStop`), `src/FractionneGPS.jsx`, `src/fullpower/FullPower.jsx`.

### Temps en minutes:secondes (Simple et Full Power, config manuelle et Hazardous)
- Échauffement et récup' finale affichés en minutes:secondes dans les presets et via un rappel sous les champs de configuration, en plus de la saisie en secondes.

## Fonctionnalités clés

- Guidage par bips selon la vitesse GPS (accélère / ralentis / silence dans la zone cible), gongs de transition entre phases
- Mode Simple et mode Full Power (séances personnalisées multi-types + Hazardous Mode)
- Bibliothèque de séances enregistrées, rejouables à l'identique
- Écran de course : minuteur de phase, distance de la phase en cours, distance totale de la séance, distance de travail cumulée, temps restant global de la séance, %VMA instantané et cible en grand
- Verrou d'écran (Wake Lock) actif pendant la course : l'écran ne s'éteint plus tout seul en pleine séance
- Reprise automatique après extinction/fermeture de l'appli : si l'écran s'éteint (bouton pressé, OS qui tue l'appli...) pendant une course, l'appli propose de reprendre la séance exactement où elle en était plutôt que de tout perdre

## 1. Tester en local

```bash
npm install
npm run dev
```
Ouvre l'adresse affichée (en général http://localhost:5173). Sur mobile, teste plutôt une fois déployé : le GPS est peu fiable en local/desktop.

## 2. Déployer sur Vercel (comme VMA Pro)

Deux options, comme pour VMA Pro :

**A. Avec un dépôt GitHub (recommandé, permet les mises à jour faciles)**
1. Crée un dépôt GitHub (ex. `fractionne-gps-pro`) et pousse ce dossier dedans.
2. Sur vercel.com, "Add New Project" → importe le dépôt → Vercel détecte Vite automatiquement → Deploy.

**B. En ligne de commande, sans dépôt (déploiement direct)**
```bash
npm install -g vercel   # si pas déjà fait pour VMA Pro
vercel login
vercel                  # première fois : suit les questions (nom du projet, etc.)
vercel --prod           # mises à jour suivantes
```

## 3. Après déploiement

- L'app est installable comme PWA (icône + manifest déjà configurés dans `vite.config.js`).
- Le GPS ne fonctionne qu'en HTTPS : Vercel fournit HTTPS automatiquement, donc rien à faire.
- La bibliothèque de séances utilise le `localStorage` du navigateur : elle est propre à chaque appareil/navigateur (pas de synchronisation entre appareils pour l'instant).
