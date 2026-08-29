import { storage } from "../storage.js";

const NAME_KEY = "runner-name";

export async function getRunnerName() {
  try {
    const r = await storage.get(NAME_KEY);
    return r?.value || "";
  } catch {
    return "";
  }
}

export async function setRunnerName(name) {
  return storage.set(NAME_KEY, name.trim());
}

export const TEXT_LISTS = {
  appOpen: [
    "Prêt à en découdre, {prenom} ?",
    "{prenom}, aujourd'hui on repousse les limites.",
    "Content de te revoir, {prenom}.",
    "{prenom}, ton corps est prêt, et toi ?",
    "On y retourne, {prenom} !",
    "{prenom}, une nouvelle séance t'attend.",
  ],
  appClose: [
    "Bien joué {prenom}, repose-toi bien.",
    "À bientôt {prenom}, tu l'as mérité.",
    "{prenom}, ton corps te remerciera demain.",
    "Séance enregistrée, {prenom}. Fier de toi.",
    "{prenom}, encore une brique posée vers ton objectif.",
    "On se retrouve vite, {prenom} !",
  ],
  raceStart: [
    "Alleeeez {prenom}, Gooooo ! ! !",
    "{prenom}, à toi de jouer.",
    "Allez {prenom}, c'est le moment !",
    "{prenom}, respire, et vas-y franchement.",
    "Top départ, {prenom} !",
    "{prenom}, montre ce que tu as dans le ventre.",
  ],
  seriesRecup: [
    "Souffle {prenom}, tu l'as bien mérité.",
    "{prenom}, récupère bien, la suite arrive.",
    "Bonne série {prenom}, on relâche un peu.",
    "{prenom}, profite de cette pause pour te recentrer.",
    "Respiration, {prenom}. La suite va piquer.",
    "{prenom}, tu tiens le rythme, continue comme ça.",
  ],
  recupEndingSoon: [
    "{prenom}, prépare-toi, ça repart !",
    "3... 2... 1... {prenom}, c'est reparti !",
    "{prenom}, dernière respiration avant l'effort.",
    "Concentre-toi {prenom}, ça va piquer.",
    "{prenom}, encore un souffle et on y retourne.",
    "Allez {prenom}, remonte en pression !",
  ],
  finish: [
    "Bravo {prenom}, séance terminée !",
    "{prenom}, tu peux être fier de cet entraînement.",
    "C'est dans la boîte, {prenom} !",
    "{prenom}, encore une séance qui paie.",
    "Beau travail {prenom}, place à la récup.",
    "{prenom}, chaque séance te rapproche du but.",
  ],
};

export function pickText(category, name) {
  const list = TEXT_LISTS[category];
  if (!list || list.length === 0) return "";
  const raw = list[Math.floor(Math.random() * list.length)];
  const safeName = name && name.trim() ? name.trim() : "champion";
  return raw.replaceAll("{prenom}", safeName);
}
