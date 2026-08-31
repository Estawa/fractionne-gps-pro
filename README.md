# Fractionné GPS Pro

Application de séances de fractionné guidées par %VMA et GPS (React + Vite + Tailwind, PWA installable).

## Fonctionnalités clés

- Guidage par bips selon la vitesse GPS (accélère / ralentis / silence dans la zone cible), gongs de transition entre phases
- Mode Simple et mode Full Power (séances personnalisées multi-types + Hazardous Mode)
- Bibliothèque de séances enregistrées, rejouables à l'identique
- Écran de course : minuteur de phase, distance de la phase en cours, distance totale de la séance, distance de travail cumulée, temps restant global de la séance, %VMA instantané et cible en grand
- Verrou d'écran (Wake Lock) actif pendant la course : l'écran ne s'éteint plus tout seul en pleine séance
- Reprise automatique après extinction/fermeture de l'appli : si l'écran s'éteint (bouton pressé, OS qui tue l'appli...) pendant une course, l'appli propose de reprendre la séance exactement où elle en était plutôt que de tout perdre

## Historique des changements notables

- **Fiabilité écran/GPS** : ajout du Wake Lock (mode Simple et Full Power), sauvegarde continue de la séance en cours (à chaque seconde + juste avant mise en arrière-plan) et écran de reprise après interruption
- **Cadran de régulation** : la zone verte (silence) est désormais calée exactement sur la tolérance réelle des bips (±7%), au lieu d'une zone visuelle plus large qui ne coïncidait pas avec l'arrêt effectif des bips
- **GPS** : position toujours demandée "fraîche" (`maximumAge: 0`) plutôt qu'une position en cache jusqu'à 1s, pour la meilleure précision possible — la fréquence de mise à jour (~1/s) dépend du GPS du téléphone et n'est pas réglable depuis le navigateur
- **Affichage course** : %VMA instantané/cible agrandis, compteurs permanents de distance totale et distance de travail, temps restant total de la séance
- **Sons** : trois signatures distinctes — départ d'un run, fin d'un run (entrée en récup'), pause de série (double gong)
- **Temps échauffement/récup finale** : affichés en minutes:secondes (presets et rappel en configuration) en plus de la saisie en secondes

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
