// Fonctions partagées entre le mode simple (FractionneGPS.jsx) et le mode Full Power.
// Dupliquées ici (plutôt que ré-exportées) pour ne pas toucher au fichier du mode simple
// qui fonctionne déjà en production.

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

export const TOLERANCE_RATIO = 0.04;
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
