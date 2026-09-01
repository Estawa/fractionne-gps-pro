// Fonctions partagées entre le mode simple (FractionneGPS.jsx) et le mode Full Power.
// Dupliquées ici (plutôt que ré-exportées) pour ne pas toucher au fichier du mode simple
// qui fonctionne déjà en production.

import { useRef, useCallback, useEffect } from "react";

// --- Numéro de version de l'application ---
// À incrémenter à chaque nouvel envoi (voir aussi VERSION.txt à la racine du projet).
export const APP_VERSION = "1.4.0";

// --- Wake Lock : empêche l'écran de s'éteindre tout seul pendant une séance active ---
// Le verrou est automatiquement relâché par le système quand l'onglet passe en
// arrière-plan (écran éteint) : on le redemande donc dès que l'écran redevient visible,
// tant que `active` est vrai. Ça ne peut pas empêcher un appui volontaire sur le bouton
// power (aucune appli web ne peut bloquer ça), mais ça supprime l'extinction automatique.
export function useWakeLock(active) {
  const lockRef = useRef(null);

  const acquire = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      lockRef.current = await navigator.wakeLock.request("screen");
    } catch (e) {
      // Refusé (ex. batterie faible) ou non supporté : on continue sans bloquer l'appli.
    }
  }, []);

  const release = useCallback(() => {
    if (lockRef.current) {
      lockRef.current.release().catch(() => {});
      lockRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (active) acquire(); else release();
    return release;
  }, [active, acquire, release]);

  useEffect(() => {
    function onVisibility() {
      if (active && document.visibilityState === "visible") acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, acquire]);
}

// --- Sauvegarde/reprise de la séance en cours ---
// But : si l'OS tue l'appli (écran éteint, mémoire faible...), on retrouve la séance
// en cours au lieu de repartir de zéro. `key` distingue mode simple / Full Power.
export async function saveActiveSession(storageObj, key, snapshot) {
  try {
    await storageObj.set(key, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
  } catch (e) {
    // Stockage plein ou indisponible : tant pis pour cette sauvegarde ponctuelle.
  }
}

export async function loadActiveSession(storageObj, key, maxAgeMs = 6 * 3600 * 1000) {
  try {
    const r = await storageObj.get(key);
    if (!r?.value) return null;
    const snap = JSON.parse(r.value);
    if (!snap || Date.now() - (snap.savedAt || 0) > maxAgeMs) return null;
    return snap;
  } catch (e) {
    return null;
  }
}

export async function clearActiveSession(storageObj, key) {
  try { await storageObj.delete(key); } catch (e) { /* déjà absent : rien à faire */ }
}

export function fmtDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function fmtDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function allureFromKmh(kmh) {
  if (!kmh || kmh <= 0) return "--:--";
  const secPerKm = 3600 / kmh;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export function playSingleGong(ctx) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  [110, 165].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.value = 0.6;
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.4 + i * 0.1);
    osc.stop(now + 1.6);
  });
  const strike = ctx.createOscillator();
  const strikeGain = ctx.createGain();
  strike.type = "square";
  strike.frequency.value = 880;
  strikeGain.gain.value = 0.35;
  strike.connect(strikeGain);
  strikeGain.connect(master);
  strike.start(now);
  strikeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  strike.stop(now + 0.2);
}

export function playGong(ctx, times = 1, gap = 380) {
  if (!ctx) return;
  for (let i = 0; i < times; i++) setTimeout(() => playSingleGong(ctx), i * gap);
}

// Gong de départ d'un run (entrée en phase de travail) : clair, énergique, plutôt aigu.
export function playGongStart(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  [220, 330].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.value = 0.55;
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + i * 0.05);
    osc.stop(now + 0.6);
  });
  const strike = ctx.createOscillator();
  const strikeGain = ctx.createGain();
  strike.type = "square";
  strike.frequency.value = 1400;
  strikeGain.gain.value = 0.3;
  strike.connect(strikeGain);
  strikeGain.connect(master);
  strike.start(now);
  strikeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  strike.stop(now + 0.12);
}

// Gong de fin d'un run (entrée en récupération) : grave, posé, plus long.
export function playGongStop(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  [80, 120].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.value = 0.6;
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.8 + i * 0.15);
    osc.stop(now + 2.0);
  });
}

// Point sur le cadran (cercle de rayon r centré sur cx,cy) pour un angle d'aiguille donné
// (0° = tout en haut, sens horaire positif). Partagé par les cadrans du mode Simple et Full Power.
export function gaugePoint(angleDeg, r = 85, cx = 100, cy = 100) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

export function playBeep(ctx, freq, duration = 0.09, gain = 0.15) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.stop(ctx.currentTime + duration + 0.02);
}

// Bip type "décompte fusée" — plus grave, plus sec, plus tendu qu'un bip normal
export function playCountdownBeep(ctx, urgent = false) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = urgent ? 220 : 150;
  g.gain.value = 0.25;
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
  osc.stop(ctx.currentTime + 0.2);
}

function createNoiseBuffer(ctx, durationSec) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// Coup de pistolet type départ de course (bruit filtré + thump grave)
export function playGunshot(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.3);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1200;
  bandpass.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(1, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.3);

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
  oscGain.gain.setValueAtTime(0.8, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function playSingleClap(ctx, when) {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.06);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1000 + Math.random() * 2000;
  const gain = ctx.createGain();
  const vol = 0.15 + Math.random() * 0.15;
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(when);
  noise.stop(when + 0.1);
}

// Applaudissements de fin de séance, ~durationSec secondes
export function playApplause(ctx, durationSec = 3) {
  if (!ctx) return;
  const now = ctx.currentTime;
  let t = 0;
  while (t < durationSec) {
    playSingleClap(ctx, now + t);
    t += 0.03 + Math.random() * 0.07;
  }
}

// Zone de tolérance : dans cet écart relatif autour de la cible, silence total
export const TOLERANCE_RATIO = 0.07;
export const SILENCE_CHECK_MS = 350;

export function speedRatio(speed, target) {
  if (!target || target <= 0) return 0;
  return Math.abs(speed - target) / target;
}

export function beepIntervalMs(speed, target) {
  const ratio = Math.min(speedRatio(speed, target), 0.3);
  const minInt = 260, maxInt = 1000;
  return maxInt - (maxInt - minInt) * (ratio / 0.3);
}

export function beepFrequency(speed, target) {
  return speed < target ? 880 : 330;
}

export const ZONES = [
  { max: 65, label: "Récup", effect: "Récupération / régénération" },
  { max: 75, label: "Fond.", effect: "Endurance fondamentale (filière aérobie, brûlage des graisses)" },
  { max: 81, label: "Seuil V1 (aérobie)", effect: "Résistance douce (seuil aérobie)" },
  { max: 92, label: "Seuil V2 (anaérobie)", effect: "Résistance dure (tolérance lactique)" },
  { max: 105, label: "VMA longue", effect: "Puissance aérobie / VO2max" },
  { max: 120, label: "VMA courte", effect: "Puissance maximale aérobie" },
  { max: Infinity, label: "Sprint", effect: "Puissance / vitesse (anaérobie alactique)" },
];

export function classifyZone(pct) {
  for (const z of ZONES) if (pct <= z.max) return z;
  return ZONES[ZONES.length - 1];
}

export function segmentCharge(distMeters, timeSec, vmaKmh) {
  if (timeSec <= 0 || vmaKmh <= 0) return 0;
  const avgSpeed = (distMeters / timeSec) * 3.6;
  const avgPct = (avgSpeed / vmaKmh) * 100;
  return (avgPct / 100) * (timeSec / 60);
}

export function StatRow({ label, value, sub }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-right">
        <span className="block text-sm font-mono font-semibold text-slate-100">{value}</span>
        {sub && <span className="block text-[11px] text-slate-500">{sub}</span>}
      </span>
    </div>
  );
}

// --- Ordre personnalisé des bibliothèques (mode simple et Full Power) ---
// Un tableau d'ids stocké à part, appliqué par-dessus la liste chargée.

// --- Export / import de séances au format JSON (partage entre coureurs) ---

// Déclenche le téléchargement d'une séance sous forme de fichier .json.
// `kind` sert de marqueur pour distinguer les deux bibliothèques à l'import.
export function exportSessionToFile(saved, kind) {
  const payload = {
    exportKind: kind, // "fractionne-gps-pro-simple" | "fractionne-gps-pro-fullpower"
    exportVersion: APP_VERSION,
    exportedAt: Date.now(),
    session: saved,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeTitle = (saved.title || "seance").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "seance";
  a.href = url;
  a.download = `${safeTitle}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Lit un fichier sélectionné par l'utilisateur et retourne son contenu JSON parsé.
// Rejette si le fichier est illisible ou n'a pas la forme attendue (exportKind/session).
export function readSessionFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || !parsed.session || !parsed.exportKind) {
          reject(new Error("format-invalide"));
          return;
        }
        resolve(parsed);
      } catch (e) {
        reject(new Error("format-invalide"));
      }
    };
    reader.onerror = () => reject(new Error("lecture-impossible"));
    reader.readAsText(file);
  });
}

export async function getOrder(storageObj, key) {
  try {
    const r = await storageObj.get(key);
    if (!r?.value) return [];
    return JSON.parse(r.value);
  } catch {
    return [];
  }
}

export async function setOrder(storageObj, key, ids) {
  try {
    return await storageObj.set(key, JSON.stringify(ids));
  } catch {
    return null;
  }
}

// Applique un ordre d'ids sur une liste d'items ; les items absents de l'ordre
// (nouveaux) sont ajoutés à la fin, triés par date d'enregistrement décroissante.
export function applyOrder(items, order) {
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const ordered = order.filter(id => byId[id]).map(id => byId[id]);
  const orderedIds = new Set(ordered.map(i => i.id));
  const missing = items.filter(i => !orderedIds.has(i.id));
  missing.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return [...ordered, ...missing];
}
