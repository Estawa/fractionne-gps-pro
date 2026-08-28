# Fractionné GPS Pro

Application de séances de fractionné guidées par %VMA et GPS (React + Vite + Tailwind, PWA installable).

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
