import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase.js";

// ---------------------------------------------------------------------------
// Cette couche remplace l'API window.storage (spécifique aux artifacts
// Claude) par : localStorage pour le profil personnel de l'élève (propre à
// son téléphone), et Firestore pour tout ce qui doit être partagé /
// consultable par le professeur (mapping numéro <-> nom, historiques).
//
// Isolation entre professeurs : chaque professeur a son propre code d'accès
// (VITE_PROFS) et ne voit/gère que SES classes. Toutes les clés Firestore
// sont donc préfixées par le professeur, pas seulement par la classe — deux
// collègues peuvent avoir chacun une classe "1G3" sans collision, et aucun
// des deux ne peut réinitialiser les données de l'autre.
//
// Schéma Firestore :
//   mapping/{profSlug-classeSlug}            { students: [{numero, nom, prenom}] }
//   meta/classes-{profSlug}                  { list: [classe, ...] }
//   historique/{profSlug-classeSlug-numero}  { entries: [...] }   (tests R15-R20)
//   seances/{profSlug-classeSlug-numero}     { entries: [...] }   (séances)
// ---------------------------------------------------------------------------

// Liste des professeurs autorisés à utiliser le Mode professeur, chacun avec
// son propre code d'accès. Configurable via VITE_PROFS (JSON), ex. :
// VITE_PROFS=[{"nom":"C. Guilhem","pin":"2025"},{"nom":"Collègue","pin":"1234"}]
export const PROFS = (() => {
  try {
    const raw = import.meta.env.VITE_PROFS;
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (e) {}
  return [{ nom: "Professeur", pin: "2025" }];
})();

export function findProfByPin(pin) {
  return PROFS.find((p) => p.pin === pin) || null;
}

export function slug(s) {
  return (s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

function classeDocId(prof, classe) {
  return `${slug(prof)}-${slug(classe)}`;
}
function studentDocId(prof, classe, numero) {
  return `${slug(prof)}-${slug(classe)}-${numero}`;
}
export function clearProfilStorage() {
  try { localStorage.removeItem("muscupro_profil"); } catch (e) {}
}

// ---------- Profil personnel (localStorage, propre à l'appareil) ----------

export async function loadProfil() {
  try {
    const raw = localStorage.getItem("muscupro_profil");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export async function saveProfilStorage(p) {
  try { localStorage.setItem("muscupro_profil", JSON.stringify(p)); } catch (e) {}
}

// ---------- Mapping numéro <-> nom (Firestore, par prof + classe) ----------

export async function loadMapping(prof, classe) {
  try {
    const snap = await getDoc(doc(db, "mapping", classeDocId(prof, classe)));
    return snap.exists() ? (snap.data().students || []) : [];
  } catch (e) { return []; }
}
export async function saveMapping(prof, classe, students) {
  try { await setDoc(doc(db, "mapping", classeDocId(prof, classe)), { students }); } catch (e) {}
}

// ---------- Index des classes connues, par professeur ----------

export async function loadClassesIndex(prof) {
  try {
    const snap = await getDoc(doc(db, "meta", `classes-${slug(prof)}`));
    return snap.exists() ? (snap.data().list || []) : [];
  } catch (e) { return []; }
}
export async function addClasseToIndex(prof, classe) {
  try {
    const list = await loadClassesIndex(prof);
    if (!list.includes(classe)) {
      list.push(classe);
      await setDoc(doc(db, "meta", `classes-${slug(prof)}`), { list });
    }
  } catch (e) {}
}
async function removeClasseFromIndex(prof, classe) {
  try {
    const list = await loadClassesIndex(prof);
    await setDoc(doc(db, "meta", `classes-${slug(prof)}`), { list: list.filter((c) => c !== classe) });
  } catch (e) {}
}

function genNumero(existants) {
  let n;
  do { n = Math.floor(1000 + Math.random() * 9000); } while (existants.includes(n));
  return n;
}

// Enregistre/relie un élève : réutilise son numéro existant si prof+classe
// sont inchangés, sinon en génère un nouveau et met à jour mapping + index.
export async function registerProfil(saisie, ancienProfil) {
  const reutiliser = ancienProfil && ancienProfil.classe === saisie.classe && ancienProfil.prof === saisie.prof && ancienProfil.numero;
  let numero = reutiliser ? ancienProfil.numero : null;
  const mapping = await loadMapping(saisie.prof, saisie.classe);
  if (!numero) {
    // Reconnexion après déconnexion (le profil local a été effacé) : si un
    // élève au même nom/prénom existe déjà dans cette classe, on retrouve
    // son numéro au lieu d'en créer un nouveau — sinon son historique, ses
    // séances et son projet seraient introuvables sous un numéro différent.
    const existantParNom = mapping.find((m) => slug(m.nom) === slug(saisie.nom) && slug(m.prenom) === slug(saisie.prenom));
    if (existantParNom) numero = existantParNom.numero;
  }
  if (!numero) numero = genNumero(mapping.map((m) => m.numero));
  const profilComplet = { ...saisie, numero };
  const existant = mapping.find((m) => m.numero === numero);
  if (existant) { existant.nom = saisie.nom; existant.prenom = saisie.prenom; }
  else mapping.push({ numero, nom: saisie.nom, prenom: saisie.prenom });
  await saveMapping(saisie.prof, saisie.classe, mapping);
  await addClasseToIndex(saisie.prof, saisie.classe);
  await saveProfilStorage(profilComplet);
  return profilComplet;
}

// ---------- Historique des tests de charge (R15-R20) ----------

export async function loadHistorique(profil) {
  try {
    const snap = await getDoc(doc(db, "historique", studentDocId(profil.prof, profil.classe, profil.numero)));
    return snap.exists() ? (snap.data().entries || []) : [];
  } catch (e) { return []; }
}
export async function saveHistorique(profil, entries) {
  try { await setDoc(doc(db, "historique", studentDocId(profil.prof, profil.classe, profil.numero)), { entries }); } catch (e) {}
}
export async function loadStudentHistoriqueByNumero(prof, classe, numero) {
  try {
    const snap = await getDoc(doc(db, "historique", studentDocId(prof, classe, numero)));
    return snap.exists() ? (snap.data().entries || []) : [];
  } catch (e) { return []; }
}

// ---------- Séances d'entraînement ----------

export async function loadSeances(profil) {
  try {
    const snap = await getDoc(doc(db, "seances", studentDocId(profil.prof, profil.classe, profil.numero)));
    return snap.exists() ? (snap.data().entries || []) : [];
  } catch (e) { return []; }
}
export async function saveSeances(profil, entries) {
  try { await setDoc(doc(db, "seances", studentDocId(profil.prof, profil.classe, profil.numero)), { entries }); } catch (e) {}
}
export async function loadStudentSeancesByNumero(prof, classe, numero) {
  try {
    const snap = await getDoc(doc(db, "seances", studentDocId(prof, classe, numero)));
    return snap.exists() ? (snap.data().entries || []) : [];
  } catch (e) { return []; }
}

// ---------- Projet individuel (mobiles/ateliers/justifications) ----------

export async function loadProjet(profil) {
  try {
    const snap = await getDoc(doc(db, "projets", studentDocId(profil.prof, profil.classe, profil.numero)));
    return snap.exists() ? snap.data().project : null;
  } catch (e) { return null; }
}
export async function saveProjet(profil, project) {
  try { await setDoc(doc(db, "projets", studentDocId(profil.prof, profil.classe, profil.numero)), { project }); } catch (e) {}
}

// ---------- Réinitialisation (Mode professeur, scopée à SES classes) ----------

// Supprime toutes les données d'une classe (uniquement pour le professeur
// concerné) : mapping, historique et séances de chaque élève, puis retire
// la classe de l'index de ce professeur.
// Réinitialise uniquement les données d'un élève (tests, séances, projet),
// sans le retirer de la classe — utile pour un profil de démonstration
// permanent que le professeur remet à zéro avant de montrer l'appli.
export async function resetEleve(prof, classe, numero) {
  try { await deleteDoc(doc(db, "historique", studentDocId(prof, classe, numero))); } catch (e) {}
  try { await deleteDoc(doc(db, "seances", studentDocId(prof, classe, numero))); } catch (e) {}
  try { await deleteDoc(doc(db, "projets", studentDocId(prof, classe, numero))); } catch (e) {}
}

export async function resetClasse(prof, classe) {
  const mapping = await loadMapping(prof, classe);
  for (const eleve of mapping) {
    try { await deleteDoc(doc(db, "historique", studentDocId(prof, classe, eleve.numero))); } catch (e) {}
    try { await deleteDoc(doc(db, "seances", studentDocId(prof, classe, eleve.numero))); } catch (e) {}
    try { await deleteDoc(doc(db, "projets", studentDocId(prof, classe, eleve.numero))); } catch (e) {}
  }
  try { await deleteDoc(doc(db, "mapping", classeDocId(prof, classe))); } catch (e) {}
  await removeClasseFromIndex(prof, classe);
}

// Supprime toutes les classes et données appartenant à CE professeur
// uniquement — n'affecte jamais les classes des autres professeurs.
export async function resetToutesLesDonnees(prof) {
  const classes = await loadClassesIndex(prof);
  for (const classe of classes) {
    await resetClasse(prof, classe);
  }
  try { await setDoc(doc(db, "meta", `classes-${slug(prof)}`), { list: [] }); } catch (e) {}
}
