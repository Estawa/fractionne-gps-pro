import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Ces valeurs viennent des variables d'environnement (voir .env.example).
// Elles sont publiques par nature dans une appli web Firebase : la sécurité
// réelle se joue dans les règles Firestore (voir FIREBASE_SETUP.md), pas dans
// le fait de cacher ces clés.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
