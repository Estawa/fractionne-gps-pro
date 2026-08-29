// Séances prêtes à l'emploi — configurations fixes (hors VMA, qui reste celle de l'utilisateur).
// Chaque séance s'adapte donc automatiquement au niveau de la personne qui la charge.

export const PRESETS = [
  {
    id: "preset-recup-continu",
    title: "Récupération active",
    description: "Endurance fondamentale légère, une seule répétition longue.",
    config: {
      effortPct: 65, recupPct: 50,
      workSec: 1200, restSec: 0,
      reps: 1, series: 1, restSeriesSec: 0,
      warmupSec: 180, finalRecupSec: 180, startLatencySec: 5,
    },
  },
  {
    id: "preset-seuil-v1-3x8",
    title: "Seuil V1 — 3 × 8 min",
    description: "Résistance douce, filière aérobie, grosses répétitions.",
    config: {
      effortPct: 80, recupPct: 50,
      workSec: 480, restSec: 120,
      reps: 1, series: 3, restSeriesSec: 180,
      warmupSec: 300, finalRecupSec: 300, startLatencySec: 8,
    },
  },
  {
    id: "preset-15-15",
    title: "15/15 — VMA longue",
    description: "Puissance aérobie / VO2max, alternance rapide.",
    config: {
      effortPct: 100, recupPct: 60,
      workSec: 15, restSec: 15,
      reps: 16, series: 2, restSeriesSec: 240,
      warmupSec: 300, finalRecupSec: 300, startLatencySec: 5,
    },
  },
  {
    id: "preset-30-30",
    title: "30/30 — VMA courte",
    description: "Puissance maximale aérobie, format classique.",
    config: {
      effortPct: 108, recupPct: 50,
      workSec: 30, restSec: 30,
      reps: 10, series: 3, restSeriesSec: 180,
      warmupSec: 300, finalRecupSec: 300, startLatencySec: 8,
    },
  },
  {
    id: "preset-resistance-dure",
    title: "Résistance dure — 2 × (5 × 1 min)",
    description: "Tolérance lactique, efforts soutenus d'une minute, récup 1 min entre reps, 5 min entre les 2 séries.",
    config: {
      effortPct: 90, recupPct: 50,
      workSec: 60, restSec: 60,
      reps: 5, series: 2, restSeriesSec: 180,
      warmupSec: 300, finalRecupSec: 300, startLatencySec: 8,
    },
  },
  {
    id: "preset-sprint",
    title: "Sprints — 10 × 15 s",
    description: "Puissance / vitesse, filière anaérobie alactique.",
    config: {
      effortPct: 130, recupPct: 40,
      workSec: 15, restSec: 45,
      reps: 10, series: 1, restSeriesSec: 0,
      warmupSec: 300, finalRecupSec: 180, startLatencySec: 8,
    },
  },
  {
    id: "preset-fartlek-150-250",
    title: "Fartlek 150m/250m",
    description: "9 alternances de 150m à 100% VMA et 250m à 65% VMA, en continu (3 blocs de 1200m).",
    config: {
      effortPct: 100, recupPct: 65,
      workDistM: 150, restDistM: 250,
      reps: 9, series: 1, restSeriesSec: 0,
      warmupSec: 300, finalRecupSec: 300, startLatencySec: 8,
    },
  },
  {
    id: "preset-fartlek-50-150",
    title: "Fartlek 50m/150m",
    description: "18 alternances de 50m à 110% VMA (sprint) et 150m à 70% VMA, en continu (3 blocs de 1200m).",
    config: {
      effortPct: 110, recupPct: 70,
      workDistM: 50, restDistM: 150,
      reps: 18, series: 1, restSeriesSec: 0,
      warmupSec: 300, finalRecupSec: 300, startLatencySec: 8,
    },
  },
];
