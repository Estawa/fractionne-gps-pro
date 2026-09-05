// Fonctions partagées entre le mode simple (FractionneGPS.jsx) et le mode Full Power.
// Dupliquées ici (plutôt que ré-exportées) pour ne pas toucher au fichier du mode simple
// qui fonctionne déjà en production.

import { useRef, useCallback, useEffect } from "react";

// --- Numéro de version de l'application ---
// À incrémenter à chaque nouvel envoi (voir aussi VERSION.txt à la racine du projet).
export const APP_VERSION = "1.8.0";

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

// Fin d'un run (entrée en récupération) : double bip net et aigu, nettement plus audible
// sur les haut-parleurs de smartphone que l'ancien gong grave (signalé inaudible en usage réel).
export function playGongStop(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  function strike(t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 660;
    g.gain.value = 0.4;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.stop(t + 0.25);
  }
  strike(now);
  strike(now + 0.28);
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
// (élargie de 7 à 9% : avec le lissage/anticipation de la vitesse GPS ci-dessous, une
// tolérance un peu plus large absorbe le bruit résiduel du capteur sans perdre en exigence)
export const TOLERANCE_RATIO = 0.09;
export const SILENCE_CHECK_MS = 350;

// --- Lissage + anticipation de la vitesse GPS ---
// Le GPS d'un smartphone renvoie une vitesse bruitée (± plusieurs dixièmes de km/h même à
// allure stable) et avec un léger retard par rapport au mouvement réel. On combine :
//  1) une moyenne pondérée récente (les mesures les plus fraîches comptent plus), qui lisse
//     le bruit sans effacer les vraies variations d'allure ;
//  2) une extrapolation de tendance (régression linéaire sur l'historique récent), qui
//     anticipe de `lookaheadMs` la vitesse pour compenser le retard du capteur.
// Retourne une fonction à appeler à chaque nouvelle mesure GPS (en km/h), qui renvoie la
// vitesse lissée/anticipée à utiliser pour l'affichage et le déclenchement des bips.
export function createSpeedSmoother({ historyMs = 4000, lookaheadMs = 1200 } = {}) {
  let samples = [];
  return function pushSpeed(speedKmh, now = Date.now()) {
    samples.push({ t: now, speed: speedKmh });
    samples = samples.filter(s => now - s.t <= historyMs);
    if (samples.length < 2) return speedKmh;

    let wSum = 0, vSum = 0;
    for (const s of samples) {
      const age = now - s.t;
      const w = Math.max(0.05, 1 - age / historyMs);
      wSum += w; vSum += w * s.speed;
    }
    const smoothed = vSum / wSum;

    const n = samples.length;
    const t0 = samples[0].t;
    const xs = samples.map(s => (s.t - t0) / 1000);
    const ys = samples.map(s => s.speed);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (ys[i] - yMean); den += (xs[i] - xMean) ** 2; }
    const slope = den > 0 ? num / den : 0; // tendance en km/h par seconde
    const predicted = smoothed + slope * (lookaheadMs / 1000);

    // Anticipation bornée pour ne pas s'emballer sur un sursaut isolé du signal GPS.
    return Math.max(0, Math.min(predicted, smoothed + 3));
  };
}

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

// --- Tracé GPS coloré par zone/séquence, affiché sur le récapitulatif final ---
// L'appli n'embarque pas de clé Google Maps : on dessine donc nous-mêmes un schéma
// (vue de dessus, sans fond de carte) du parcours, coloré selon la phase/séquence
// traversée à chaque point. Un bouton complémentaire ouvre le tracé dans Google Maps
// (fond de carte réel, mais sans les couleurs par séquence : limite du lien public Maps).
export function TraceMap({ points, height = 220 }) {
  if (!points || points.length < 2) return null;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  // Correction de l'aspect ratio : 1° de longitude vaut cos(latitude) fois moins de
  // distance réelle qu'1° de latitude.
  const lngScale = Math.cos((midLat * Math.PI) / 180) || 1;
  const spanLat = Math.max(1e-6, maxLat - minLat);
  const spanLng = Math.max(1e-6, (maxLng - minLng) * lngScale);
  const pad = 16;
  const w = 320, h = height;
  const scale = Math.min((w - pad * 2) / spanLng, (h - pad * 2) / spanLat);
  const project = (p) => {
    const x = pad + ((p.lng - minLng) * lngScale) * scale + (w - pad * 2 - spanLng * scale) / 2;
    const y = pad + (maxLat - p.lat) * scale + (h - pad * 2 - spanLat * scale) / 2;
    return { x, y };
  };
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = project(points[i - 1]);
    const b = project(points[i]);
    segments.push({ a, b, color: points[i].color || "#94a3b8" });
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-xl bg-slate-950 border border-slate-800">
      {segments.map((s, i) => (
        <line key={i} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={s.color} strokeWidth="3" strokeLinecap="round" />
      ))}
      <circle cx={project(points[0]).x} cy={project(points[0]).y} r="4" fill="#f1f5f9" />
      <circle cx={project(points[points.length - 1]).x} cy={project(points[points.length - 1]).y} r="4" fill="#f1f5f9" stroke="#0f172a" strokeWidth="1.5" />
    </svg>
  );
}

// Construit un lien Google Maps (mode marche) à partir du tracé, en sous-échantillonnant
// si besoin pour rester dans une longueur d'URL et un nombre d'étapes raisonnables.
// Note : Google Maps ne permet pas de colorer l'itinéraire par séquence — seul le schéma
// dessiné par TraceMap ci-dessus distingue les zones de travail par couleur.
export function googleMapsRouteUrl(points, maxWaypoints = 40) {
  if (!points || points.length < 2) return null;
  const step = Math.max(1, Math.ceil(points.length / maxWaypoints));
  const sampled = points.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1]);
  const path = sampled.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("/");
  return `https://www.google.com/maps/dir/${path}?travelmode=walking`;
}

// --- Sélection d'un nombre de répétitions/occurrences sous forme de menu déroulant ---
// (au lieu d'un champ numérique libre) — mode Simple et Full Power.
export function CountSelect({ label, value, onChange, max = 40, full }) {
  const options = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-xs text-slate-400">{label}</label>
      <select
        value={value}
        onChange={e => onChange(parseInt(e.target.value) || 1)}
        className="w-full mt-1 bg-slate-800 rounded-lg px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-slate-500"
      >
        {options.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

// --- Saisie d'une durée en minutes:secondes (au lieu de secondes brutes) ---
// La valeur manipulée par l'appli reste des secondes totales (aucun changement de modèle
// de données) : ce composant ne fait que convertir à l'affichage/à la saisie.
export function DurationField({ label, valueSec, onChange, full }) {
  const totalSec = Math.max(0, Math.floor(Number(valueSec) || 0));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  function setMin(v) {
    const m = Math.max(0, Math.floor(Number(v)) || 0);
    onChange(m * 60 + ss);
  }
  function setSec(v) {
    const s = Math.max(0, Math.min(59, Math.floor(Number(v)) || 0));
    onChange(mm * 60 + s);
  }
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-xs text-slate-400">{label}</label>
      <div className="flex items-center gap-1.5 mt-1">
        <input
          type="number" min="0" value={mm} onChange={e => setMin(e.target.value)}
          className="w-full bg-slate-800 rounded-lg px-2 py-2 font-mono text-center outline-none focus:ring-2 focus:ring-slate-500"
        />
        <span className="text-[11px] text-slate-500 shrink-0">min</span>
        <input
          type="number" min="0" max="59" value={ss} onChange={e => setSec(e.target.value)}
          className="w-full bg-slate-800 rounded-lg px-2 py-2 font-mono text-center outline-none focus:ring-2 focus:ring-slate-500"
        />
        <span className="text-[11px] text-slate-500 shrink-0">s</span>
      </div>
    </div>
  );
}

// --- Saisie d'une durée en minutes:secondes via deux menus déroulants ---
// Utilisé pour l'échauffement et la récup' finale (Simple et Full Power) : durées plutôt
// longues et rarement fines, un menu déroulant est plus rapide qu'un champ libre. La valeur
// manipulée par l'appli reste des secondes totales (aucun changement de modèle de données).
export function DurationSelectField({ label, valueSec, onChange, maxMin = 30, secStep = 5, full }) {
  const totalSec = Math.max(0, Math.floor(Number(valueSec) || 0));
  const mm = Math.min(maxMin, Math.floor(totalSec / 60));
  const ssRaw = totalSec % 60;
  const secOptions = Array.from({ length: Math.ceil(60 / secStep) }, (_, i) => i * secStep);
  const ss = secOptions.includes(ssRaw) ? ssRaw : secOptions.reduce((a, b) => (Math.abs(b - ssRaw) < Math.abs(a - ssRaw) ? b : a), 0);
  const minOptions = Array.from({ length: maxMin + 1 }, (_, i) => i);
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-xs text-slate-400">{label}</label>
      <div className="flex items-center gap-1.5 mt-1">
        <select
          value={mm}
          onChange={e => onChange(parseInt(e.target.value) * 60 + ss)}
          className="w-full bg-slate-800 rounded-lg px-2 py-2 font-mono text-center outline-none focus:ring-2 focus:ring-slate-500"
        >
          {minOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-[11px] text-slate-500 shrink-0">min</span>
        <select
          value={ss}
          onChange={e => onChange(mm * 60 + parseInt(e.target.value))}
          className="w-full bg-slate-800 rounded-lg px-2 py-2 font-mono text-center outline-none focus:ring-2 focus:ring-slate-500"
        >
          {secOptions.map(s => <option key={s} value={s}>{String(s).padStart(2, "0")}</option>)}
        </select>
        <span className="text-[11px] text-slate-500 shrink-0">s</span>
      </div>
    </div>
  );
}

// Distance théorique (m) parcourue à une vitesse cible (km/h) pendant une durée (s) donnée —
// sert de référence pour les récapitulatifs "distance réalisée / distance prévue".
export function theoreticalDistanceMeters(speedKmh, seconds) {
  return ((speedKmh || 0) * 1000 / 3600) * Math.max(0, seconds || 0);
}

// Petit repère fixe marquant le centre de la zone verte (= la cible) sur le cadran,
// pour bien distinguer "objectif" (fixe, au milieu) et "aiguille" (mobile, position actuelle).
export function GaugeTargetTick({ color = "#f1f5f9" }) {
  const p = gaugePoint(0, 95);
  return <circle cx={p.x} cy={p.y} r="3" fill={color} />;
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
