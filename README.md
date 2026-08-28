# Muscu Pro

Application compagnon de la programmation musculation Première/Terminale — by C. Guilhem.

React + Vite + Tailwind CSS + Firebase Firestore, déployable sur Vercel, installable en PWA sur téléphone.

## Démarrage

**Avant toute chose**, suis le guide [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) pour créer la base de données (obligatoire, l'appli ne fonctionnera pas sans).

```bash
npm install
npm run dev
```

## Déploiement (Vercel)

```bash
vercel        # premier déploiement / preview
vercel --prod # mise en production
```

Pense à renseigner les variables d'environnement dans Vercel (Settings > Environment Variables) — voir FIREBASE_SETUP.md étape 6.

## Structure

- `src/App.jsx` — toute l'interface et la logique (onglets Accueil, Mobiles, Ateliers, Projet, Séances, Suivi, Calculateur, Prof, Chrono)
- `src/storage.js` — couche de persistance (localStorage pour le profil personnel, Firestore pour les données partagées)
- `src/firebase.js` — connexion à Firebase, configurée via variables d'environnement

## Confidentialité des données élèves

Chaque élève se voit attribuer un numéro aléatoire à l'inscription (non affiché dans son appli). Les données de séance sont indexées par ce numéro **et par le professeur choisi à l'inscription**, jamais par nom. Le Mode professeur (protégé par un code personnel à chaque professeur, `VITE_PROFS` dans `.env.local`) fait la correspondance numéro → nom via la table de mapping, classe par classe — et un professeur ne voit ni ne peut réinitialiser que ses propres classes, jamais celles d'un collègue partageant la même appli.

**Limite à connaître** : le code d'accès au Mode professeur est vérifié côté client (dans le navigateur), ce n'est pas une protection cryptographique — un utilisateur technique déterminé pourrait la contourner. Voir aussi la note sur les règles Firestore dans FIREBASE_SETUP.md.
