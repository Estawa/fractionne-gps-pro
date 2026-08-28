# Configurer Firebase pour Muscu Pro

L'appli a besoin d'une base de données pour que les données des élèves (mapping numéro/nom, historique des tests, séances) soient partagées entre tous les téléphones et consultables par toi. On utilise **Firebase Firestore**, gratuit pour ce volume d'usage.

## 1. Créer le projet Firebase

1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google.
2. Clique sur **"Ajouter un projet"**, nomme-le par exemple `muscu-pro`, continue (tu peux désactiver Google Analytics, pas nécessaire ici).
3. Une fois le projet créé, dans le menu de gauche, va dans **"Firestore Database"** > **"Créer une base de données"**.
   - Choisis une région proche (ex. `eur3 (europe-west)`).
   - Démarre en **mode production** (on collera nos propres règles juste après).

## 2. Récupérer la configuration de l'appli

1. Dans les paramètres du projet (icône ⚙️ en haut à gauche) > **"Paramètres du projet"**.
2. Dans l'onglet **"Général"**, descends jusqu'à **"Vos applications"**, clique sur l'icône **`</>`** (Web) pour enregistrer une nouvelle application web.
3. Donne-lui un nom (ex. `muscu-pro-web`), pas besoin de configurer Firebase Hosting (on utilise Vercel).
4. Firebase t'affiche un objet `firebaseConfig` avec des valeurs `apiKey`, `authDomain`, `projectId`, etc. **Garde cette page ouverte**, tu en as besoin à l'étape suivante.

## 3. Configurer les variables d'environnement

1. Dans le dossier du projet, copie `.env.example` en `.env.local` :
   ```
   cp .env.example .env.local
   ```
2. Ouvre `.env.local` et remplis chaque ligne avec les valeurs de `firebaseConfig` récupérées à l'étape 2 (par exemple `VITE_FIREBASE_API_KEY=AIza...`).
3. Renseigne `VITE_PROFS` avec la liste des professeurs qui utiliseront l'appli, au format JSON — par exemple pour toi seul :
   ```
   VITE_PROFS=[{"nom":"C. Guilhem","pin":"2025"}]
   ```
   Ou, si tu la partages avec des collègues, un élément par professeur, chacun avec son propre code :
   ```
   VITE_PROFS=[{"nom":"C. Guilhem","pin":"2025"},{"nom":"Collègue Untel","pin":"1234"}]
   ```
   Chaque professeur ne verra et ne pourra réinitialiser que ses propres classes dans le Mode professeur — jamais celles d'un collègue.

## 4. Règles de sécurité Firestore

Dans Firebase Console > **Firestore Database** > onglet **"Règles"**, remplace le contenu par :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /mapping/{classeId} {
      allow read, write: if true;
    }
    match /meta/{docId} {
      allow read, write: if true;
    }
    match /historique/{studentId} {
      allow read, write: if true;
    }
    match /seances/{studentId} {
      allow read, write: if true;
    }
    match /projets/{studentId} {
      allow read, write: if true;
    }
  }
}
```

Clique sur **"Publier"**.

**⚠️ Si tu as déjà déployé une version antérieure de l'appli** (sans la collection `projets`), pense à retourner dans Firebase Console > Firestore Database > Règles pour ajouter le bloc `match /projets/{studentId}` ci-dessus à tes règles existantes, puis republier — sinon la sauvegarde automatique du projet des élèves échouera silencieusement (sans erreur visible, mais sans effet).

**⚠️ Important à savoir** : ces règles sont ouvertes (pas d'authentification). Concrètement, n'importe qui qui récupérerait ta configuration Firebase (visible dans le code de l'appli une fois déployée) pourrait techniquement lire ou modifier la base directement, sans même passer par l'appli. C'est le même niveau de confiance que ce qu'on avait avec le stockage partagé de l'artifact Claude, mais en vrai base de données donc théoriquement plus exposée. Pour un usage en classe (données sans grande sensibilité, juste des charges d'entraînement), c'est un compromis raisonnable pour démarrer. Si tu veux renforcer ça plus tard (ex. limiter l'écriture à des formats précis, ou ajouter une authentification), dis-le-moi, on pourra faire évoluer les règles.

## 5. Tester en local

```
npm install
npm run dev
```

Ouvre l'URL affichée (ex. `http://localhost:5173`), crée un profil test, enregistre une séance, vérifie dans Firebase Console > Firestore Database que les documents apparaissent bien dans les collections `mapping`, `historique`, `seances`.

## 6. Déployer sur Vercel

Comme pour VMA Pro :
```
vercel
```
Puis, **avant le premier déploiement en production**, ajoute les mêmes variables d'environnement dans Vercel :
- Sur le dashboard Vercel du projet > **Settings** > **Environment Variables**, ajoute chacune des 7 variables de `.env.local` (les 6 `VITE_FIREBASE_*` + `VITE_PROFS`, en collant la chaîne JSON telle quelle comme valeur).
- Redéploie ensuite avec :
```
vercel --prod
```
