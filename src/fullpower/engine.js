// Moteur du mode "Full Power".
// Construit une file de phases à plat ([{kind, pct, seconds, ...}, ...]) que l'écran
// de course consomme séquentiellement, plutôt que de recalculer une machine à états
// (comme le fait nextPhase() dans le mode simple). C'est plus adapté ici car
// l'enchaînement n'est plus un simple produit série×répétition mais une composition
// libre de blocs A/B/C/D.

// --- Construction manuelle ---
// repTypes: [{ id:'A', workPct, workSec, recupPct, recupSec }, ...] (1 à 4)
// seriesList: [{ id, blocks: [{ repTypeId, count }], repeatCount }, ...]
// globalRepeatCount: nombre de fois où l'on boucle l'ensemble des séries

export function buildManualQueue({ repTypes, seriesList, globalRepeatCount, warmupSec, finalRecupSec, startLatencySec }) {
  const queue = [];
  const byId = Object.fromEntries(repTypes.map(rt => [rt.id, rt]));

  if (warmupSec > 0) queue.push({ kind: "warmup", seconds: warmupSec });

  // La latence de départ (phase d'accélération, départ arrêté) s'applique uniquement
  // sur la toute première répétition de travail de chaque nouvelle série — c'est-à-dire
  // le premier bloc "work" rencontré depuis le début (ou depuis la dernière pause
  // entre séries "restSeries").
  let pendingSeriesStart = true;

  const totalLoops = Math.max(1, globalRepeatCount || 1);
  for (let loop = 0; loop < totalLoops; loop++) {
    seriesList.forEach((serie, sIdx) => {
      const isVeryLastSerie = loop === totalLoops - 1 && sIdx === seriesList.length - 1;
      const willHaveSeriesBreak = !isVeryLastSerie && serie.restSeriesSec > 0;
      const serieRepeat = Math.max(1, serie.repeatCount || 1);

      // Liste à plat des types de répétition à jouer pour une occurrence de cette série,
      // pour pouvoir repérer précisément la toute dernière unité de travail.
      const units = [];
      serie.blocks.forEach(block => {
        const rt = byId[block.repTypeId];
        if (!rt) return;
        for (let i = 0; i < Math.max(1, block.count || 1); i++) units.push(rt);
      });

      for (let sr = 0; sr < serieRepeat; sr++) {
        const isLastSerieRepeat = sr === serieRepeat - 1;
        units.forEach((rt, uIdx) => {
          const isVeryLastUnit = isLastSerieRepeat && uIdx === units.length - 1;
          const workPhase = {
            kind: "work", pct: rt.workPct, seconds: rt.workSec, repTypeId: rt.id,
            seriesLabel: serie.label || `Série ${sIdx + 1}`,
            repIndexInSeries: sr * units.length + uIdx + 1,
            repsInSeriesTotal: serieRepeat * units.length,
          };
          if (pendingSeriesStart && startLatencySec > 0) {
            workPhase.latencySec = startLatencySec;
          }
          pendingSeriesStart = false;
          queue.push(workPhase);
          // Dernière répétition de la série et une pause de série va suivre : on saute la
          // récup individuelle pour éviter un double repos (la pause de série suffit).
          if (!(isVeryLastUnit && willHaveSeriesBreak)) {
            queue.push({
              kind: "recup", pct: rt.recupPct, seconds: rt.recupSec, repTypeId: rt.id,
              seriesLabel: serie.label || `Série ${sIdx + 1}`,
              repIndexInSeries: workPhase.repIndexInSeries,
              repsInSeriesTotal: workPhase.repsInSeriesTotal,
            });
          }
        });
      }
      // pause entre séries, sauf après la toute dernière occurrence de la toute dernière série
      if (willHaveSeriesBreak) {
        queue.push({ kind: "restSeries", seconds: serie.restSeriesSec });
        pendingSeriesStart = true;
      }
    });
  }

  if (finalRecupSec > 0) queue.push({ kind: "finalRecup", seconds: finalRecupSec });
  queue.push({ kind: "finished", seconds: 0 });
  return queue;
}

// --- Hazardous Mode : génération aléatoire cohérente ---
// Zones de travail avec bornes %VMA, durée logique de travail (s) et ratio de récup
// associé (%VMA récup + coefficient de durée par rapport au travail).
const HAZARD_ZONES = [
  { name: "sprint", workPct: [105, 120], workSec: [10, 20], recupPct: [50, 60], recupRatio: [2.2, 3.0] },
  { name: "vma-courte", workPct: [95, 105], workSec: [20, 45], recupPct: [55, 65], recupRatio: [0.8, 1.2] },
  { name: "vma-moyenne", workPct: [90, 100], workSec: [45, 90], recupPct: [55, 65], recupRatio: [0.8, 1.1] },
  { name: "vma-longue", workPct: [85, 95], workSec: [120, 240], recupPct: [60, 70], recupRatio: [0.35, 0.6] },
  { name: "seuil", workPct: [80, 90], workSec: [240, 480], recupPct: [65, 75], recupRatio: [0.2, 0.4] },
  { name: "endurance", workPct: [65, 80], workSec: [300, 720], recupPct: [60, 70], recupRatio: [0.15, 0.3] },
];

function randInt(min, max) {
  return Math.round(min + Math.random() * (max - min));
}
function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Génère un bloc travail+récup cohérent, piochant une zone d'intensité au hasard
function generateHazardBlock() {
  const zone = randChoice(HAZARD_ZONES);
  const workPct = randInt(zone.workPct[0], zone.workPct[1]);
  const workSec = randInt(zone.workSec[0], zone.workSec[1]);
  const recupPct = randInt(zone.recupPct[0], zone.recupPct[1]);
  const recupRatio = zone.recupRatio[0] + Math.random() * (zone.recupRatio[1] - zone.recupRatio[0]);
  const recupSec = Math.max(10, Math.round(workSec * recupRatio));
  return { workPct, workSec, recupPct, recupSec, zoneName: zone.name };
}

// Génère la séance Hazardous en respectant strictement le budget de temps de travail
// fourni par le coureur : le dernier bloc (travail, récup ou pause de série) est tronqué
// pour que la somme retombe exactement sur workTotalSec.
export function generateHazardousQueue({ warmupSec, workTotalSec, finalRecupSec }) {
  const queue = [];
  if (warmupSec > 0) queue.push({ kind: "warmup", seconds: warmupSec });

  let remaining = workTotalSec;
  let sinceLastSeriesBreak = 0;
  const seriesBreakThreshold = randInt(360, 600);

  while (remaining > 0) {
    const block = generateHazardBlock();
    let workSec = Math.min(block.workSec, remaining);
    let recupSec = Math.min(block.recupSec, Math.max(0, remaining - workSec));

    queue.push({ kind: "work", pct: block.workPct, seconds: workSec, hazard: true });
    remaining -= workSec;

    if (recupSec > 0) {
      queue.push({ kind: "recup", pct: block.recupPct, seconds: recupSec, hazard: true });
      remaining -= recupSec;
    }
    sinceLastSeriesBreak += workSec + recupSec;

    if (remaining <= 0) break;

    if (sinceLastSeriesBreak >= seriesBreakThreshold) {
      const breakSec = Math.min(randInt(90, 180), remaining);
      if (breakSec > 0) {
        queue.push({ kind: "restSeries", seconds: breakSec, hazard: true });
        remaining -= breakSec;
      }
      sinceLastSeriesBreak = 0;
    }
  }

  if (finalRecupSec > 0) queue.push({ kind: "finalRecup", seconds: finalRecupSec });
  queue.push({ kind: "finished", seconds: 0 });
  return queue;
}

export function estimateHazardousTotal({ warmupSec, workTotalSec, finalRecupSec }) {
  // Estimation affichée avant lancement (l'appli annonce un temps total, pas le détail)
  return (warmupSec || 0) + (workTotalSec || 0) + (finalRecupSec || 0);
}
