import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play, Pause, Square, Settings2, MapPin, MapPinOff,
  Zap, Wind, Timer as TimerIcon, ChevronRight, RotateCcw, Sliders,
  BookOpen, Save, Trash2, ArrowLeft, Check, ChevronUp, ChevronDown
} from "lucide-react";
import { storage } from "./storage.js";
import { PRESETS } from "./presets.js";
import { playApplause, getOrder, setOrder, applyOrder } from "./shared.jsx";

// ---------- Constantes & helpers ----------

const PHASE_META = {
  warmup:     { label: "ÉCHAUFFEMENT", color: "text-amber-400", ring: "stroke-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/40" },
  effort:     { label: "EFFORT",   color: "text-orange-400", ring: "stroke-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/40" },
  recup:      { label: "RÉCUP'",   color: "text-sky-400",    ring: "stroke-sky-500",    bg: "bg-sky-500/10",    border: "border-sky-500/40" },
  restSeries: { label: "PAUSE SÉRIE", color: "text-violet-400", ring: "stroke-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/40" },
  finalRecup: { label: "RÉCUPÉRATION FINALE", color: "text-teal-400", ring: "stroke-teal-500", bg: "bg-teal-500/10", border: "border-teal-500/40" },
  finished:   { label: "TERMINÉ",  color: "text-emerald-400", ring: "stroke-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/40" },
};

function fmtDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function fmtDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function allureFromKmh(kmh) {
  if (!kmh || kmh <= 0) return "--:--";
  const secPerKm = 3600 / kmh;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function nextPhase(state, cfg) {
  const { phase, series, rep } = state;
  if (phase === "warmup") {
    return { phase: "effort", series: 1, rep: 1, secondsLeft: cfg.workSec };
  }
  if (phase === "effort") {
    return { phase: "recup", series, rep, secondsLeft: cfg.restSec };
  }
  if (phase === "recup") {
    if (rep < cfg.reps) {
      return { phase: "effort", series, rep: rep + 1, secondsLeft: cfg.workSec };
    }
    if (series < cfg.series) {
      return { phase: "restSeries", series, rep, secondsLeft: cfg.restSeriesSec };
    }
    if (cfg.finalRecupSec > 0) {
      return { phase: "finalRecup", series, rep, secondsLeft: cfg.finalRecupSec };
    }
    return { phase: "finished", series, rep, secondsLeft: 0 };
  }
  if (phase === "restSeries") {
    return { phase: "effort", series: series + 1, rep: 1, secondsLeft: cfg.workSec };
  }
  if (phase === "finalRecup") {
    return { phase: "finished", series, rep, secondsLeft: 0 };
  }
  return state;
}

// Gong marquant un changement de phase : plus grave, plus long, plus intense qu'un bip
function playGong(ctx, times = 1, gap = 380) {
  if (!ctx) return;
  for (let i = 0; i < times; i++) {
    setTimeout(() => playSingleGong(ctx), i * gap);
  }
}

function playSingleGong(ctx) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Corps grave du gong (deux oscillateurs légèrement désaccordés pour la richesse)
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

  // Attaque courte et brillante ("frappe")
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
function playBeep(ctx, freq, duration = 0.09, gain = 0.15) {
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

// Zone de tolérance : dans cet écart relatif autour de la cible, silence total
const TOLERANCE_RATIO = 0.07; // ±7% de la vitesse cible
const SILENCE_CHECK_MS = 350; // fréquence de recontrôle pendant le silence

function speedRatio(speed, target) {
  if (!target || target <= 0) return 0;
  return Math.abs(speed - target) / target;
}

// Intervalle entre bips selon l'écart relatif à la vitesse cible (hors zone de tolérance)
function beepIntervalMs(speed, target) {
  const ratio = Math.min(speedRatio(speed, target), 0.3);
  const minInt = 260, maxInt = 1000;
  return maxInt - (maxInt - minInt) * (ratio / 0.3);
}

function beepFrequency(speed, target) {
  return speed < target ? 880 : 330; // accélérer / ralentir
}

// Zones d'intensité %VMA — mêmes bornes que VMA Pro, pour rester cohérent entre les deux outils
const ZONES = [
  { max: 65,       label: "Récup",               effect: "Récupération / régénération" },
  { max: 75,       label: "Fond.",                effect: "Endurance fondamentale (filière aérobie, brûlage des graisses)" },
  { max: 81,       label: "Seuil V1 (aérobie)",   effect: "Résistance douce (seuil aérobie)" },
  { max: 92,       label: "Seuil V2 (anaérobie)", effect: "Résistance dure (tolérance lactique)" },
  { max: 105,      label: "VMA longue",           effect: "Puissance aérobie / VO2max" },
  { max: 120,      label: "VMA courte",           effect: "Puissance maximale aérobie" },
  { max: Infinity, label: "Sprint",               effect: "Puissance / vitesse (anaérobie alactique)" },
];

function classifyZone(pct) {
  for (const z of ZONES) { if (pct <= z.max) return z; }
  return ZONES[ZONES.length - 1];
}

// Charge d'un segment : 1 min de travail à 100% VMA = charge de 1 (même convention que VMA Pro)
function segmentCharge(distMeters, timeSec, vmaKmh) {
  if (timeSec <= 0 || vmaKmh <= 0) return 0;
  const avgSpeed = (distMeters / timeSec) * 3.6;
  const avgPct = (avgSpeed / vmaKmh) * 100;
  return (avgPct / 100) * (timeSec / 60);
}

// Convertit une distance cible (m) à une allure %VMA donnée en durée (s), selon la VMA de l'utilisateur
function distanceToSeconds(distMeters, pctVma, vmaKmh) {
  const speedKmh = vmaKmh * (pctVma / 100);
  if (speedKmh <= 0) return 0;
  const speedMs = (speedKmh * 1000) / 3600;
  return distMeters / speedMs;
}

// ---------- Composant principal ----------

export default function FractionneGPS() {
  const [screen, setScreen] = useState("config"); // config | run | library | presets | libraryDetail

  // --- Bibliothèque de séances ---
  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryDetail, setLibraryDetail] = useState(null);
  const pendingReplayRef = useRef(false);

  // --- Enregistrement de la séance terminée ---
  const [saveTitle, setSaveTitle] = useState("");
  const [saveDate, setSaveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saveObservation, setSaveObservation] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error

  // --- Configuration séance ---
  const [vma, setVma] = useState(15);
  const [effortPct, setEffortPct] = useState(100);
  const [recupPct, setRecupPct] = useState(50);
  const [workSec, setWorkSec] = useState(30);
  const [restSec, setRestSec] = useState(30);
  const [reps, setReps] = useState(9);
  const [series, setSeries] = useState(3);
  const [restSeriesSec, setRestSeriesSec] = useState(180);
  const [warmupSec, setWarmupSec] = useState(0);
  const [finalRecupSec, setFinalRecupSec] = useState(0);
  const [startLatencySec, setStartLatencySec] = useState(4);

  const cfg = useMemo(() => ({
    vma, effortPct, recupPct, workSec, restSec, reps, series, restSeriesSec,
    warmupSec, finalRecupSec, startLatencySec,
  }), [vma, effortPct, recupPct, workSec, restSec, reps, series, restSeriesSec, warmupSec, finalRecupSec, startLatencySec]);

  const effortSpeed = vma * (effortPct / 100);
  const recupSpeed = vma * (recupPct / 100);

  // --- État de la séance en cours ---
  const [run, setRun] = useState({ phase: "effort", series: 1, rep: 1, secondsLeft: workSec });
  const [status, setStatus] = useState("paused"); // paused | running

  // --- GPS / simulation ---
  const [simMode, setSimMode] = useState(false);
  const [simSpeed, setSimSpeed] = useState(0);
  const [gpsStatus, setGpsStatus] = useState("idle"); // idle | active | error | denied
  const [liveSpeed, setLiveSpeed] = useState(0); // km/h affichée
  const [distance, setDistance] = useState(0); // m, cumulé sur la répétition en cours

  const watchIdRef = useRef(null);
  const audioCtxRef = useRef(null);
  const beepTimeoutRef = useRef(null);

  const runRef = useRef(run);
  const statusRef = useRef(status);
  const liveSpeedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const prevPhaseRef = useRef(null);

  // Accumulateurs (mètres et secondes) — série en cours
  const seriesAccRef = useRef({ series: 1, effortDist: 0, effortTime: 0, recupDist: 0, recupTime: 0 });
  // Accumulateurs — séance entière
  const globalAccRef = useRef({
    effortDist: 0, effortTime: 0,
    recupDist: 0, recupTime: 0,
    restSeriesDist: 0, restSeriesTime: 0,
    warmupFinalDist: 0, warmupFinalTime: 0,
    maxSpeed: 0,
  });

  function accumulate(phase, seriesNum, speedKmh) {
    if (seriesAccRef.current.series !== seriesNum) {
      seriesAccRef.current = { series: seriesNum, effortDist: 0, effortTime: 0, recupDist: 0, recupTime: 0 };
    }
    const distInc = speedKmh / 3.6; // mètres pour 1 seconde à cette vitesse
    if (phase === "effort") {
      seriesAccRef.current.effortDist += distInc;
      seriesAccRef.current.effortTime += 1;
      globalAccRef.current.effortDist += distInc;
      globalAccRef.current.effortTime += 1;
    } else if (phase === "recup") {
      seriesAccRef.current.recupDist += distInc;
      seriesAccRef.current.recupTime += 1;
      globalAccRef.current.recupDist += distInc;
      globalAccRef.current.recupTime += 1;
    } else if (phase === "restSeries") {
      globalAccRef.current.restSeriesDist += distInc;
      globalAccRef.current.restSeriesTime += 1;
    } else if (phase === "warmup" || phase === "finalRecup") {
      globalAccRef.current.warmupFinalDist += distInc;
      globalAccRef.current.warmupFinalTime += 1;
    }
    if (speedKmh > globalAccRef.current.maxSpeed) globalAccRef.current.maxSpeed = speedKmh;
  }

  const ensureAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  useEffect(() => { runRef.current = run; }, [run]);
  useEffect(() => { statusRef.current = status; }, [status]);
  // Pendant l'échauffement et la récup' finale, on ignore le mode simulation :
  // seule la vitesse GPS réelle compte, la simulation n'y a plus cours.
  useEffect(() => {
    const isWarmupOrFinal = run.phase === "warmup" || run.phase === "finalRecup";
    liveSpeedRef.current = (simMode && !isWarmupOrFinal) ? simSpeed : liveSpeed;
  }, [simMode, simSpeed, liveSpeed, run.phase]);
  useEffect(() => {
    targetSpeedRef.current = run.phase === "effort" ? effortSpeed : run.phase === "recup" ? recupSpeed : 0;
  }, [run.phase, effortSpeed, recupSpeed]);

  // --- Timer principal (1 Hz) ---
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      const speedNow = liveSpeedRef.current;
      accumulate(runRef.current.phase, runRef.current.series, speedNow);
      setDistance(d => d + speedNow / 3.6);
      setRun(prev => {
        if (prev.secondsLeft > 1) {
          return { ...prev, secondsLeft: prev.secondsLeft - 1 };
        }
        const next = nextPhase(prev, cfg);
        if (next.phase === "finished") setStatus("paused");
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, cfg]);

  // reset distance à chaque changement de phase
  useEffect(() => { setDistance(0); }, [run.phase, run.rep, run.series]);

  // --- GPS ---
  // Le GPS reste actif pendant l'échauffement et la récup' finale même si le mode
  // simulation est activé pour le reste de la séance : la simulation n'y a plus cours.
  useEffect(() => {
    const isWarmupOrFinal = run.phase === "warmup" || run.phase === "finalRecup";
    if (screen !== "run" || (simMode && !isWarmupOrFinal) || status !== "running") {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (!("geolocation" in navigator)) {
      setGpsStatus("error");
      return;
    }
    setGpsStatus("active");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const speedMs = pos.coords.speed;
        if (speedMs != null && speedMs >= 0) {
          setLiveSpeed(speedMs * 3.6);
        }
      },
      () => setGpsStatus("denied"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 8000 }
    );
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [screen, simMode, status, run.phase]);

  // --- Boucle de bips ---
  const beepLoop = useCallback(() => {
    const currentRun = runRef.current;
    const phase = currentRun.phase;
    if (statusRef.current !== "running" || (phase !== "effort" && phase !== "recup")) return;

    // Latence de départ (phase d'accélération) sur la 1ère répétition de chaque série
    if (phase === "effort" && currentRun.rep === 1) {
      const elapsed = cfg.workSec - currentRun.secondsLeft;
      if (elapsed < cfg.startLatencySec) {
        beepTimeoutRef.current = setTimeout(beepLoop, 250);
        return;
      }
    }

    const ctx = ensureAudioCtx();
    const speed = liveSpeedRef.current;
    const target = targetSpeedRef.current;
    if (speedRatio(speed, target) < TOLERANCE_RATIO) {
      // dans le bon rythme : silence, on recontrôle un peu plus tard
      beepTimeoutRef.current = setTimeout(beepLoop, SILENCE_CHECK_MS);
      return;
    }
    playBeep(ctx, beepFrequency(speed, target));
    beepTimeoutRef.current = setTimeout(beepLoop, beepIntervalMs(speed, target));
  }, [ensureAudioCtx, cfg]);

  useEffect(() => {
    if (status === "running" && (run.phase === "effort" || run.phase === "recup")) {
      beepLoop();
    }
    return () => {
      if (beepTimeoutRef.current) clearTimeout(beepTimeoutRef.current);
    };
  }, [status, run.phase, beepLoop]);

  // Réinitialise le formulaire de sauvegarde à chaque nouvelle séance terminée
  useEffect(() => {
    if (run.phase === "finished") {
      setSaveTitle("");
      setSaveDate(new Date().toISOString().slice(0, 10));
      setSaveObservation("");
      setSaveStatus("idle");
    }
  }, [run.phase]);
  // Double gong pour les pauses entre séries (avant et après), simple gong sinon
  useEffect(() => {
    if (screen !== "run") { prevPhaseRef.current = null; return; }
    const prev = prevPhaseRef.current;
    if (prev !== null && prev !== run.phase) {
      const isSeriesBoundary = prev === "restSeries" || run.phase === "restSeries";
      playGong(ensureAudioCtx(), isSeriesBoundary ? 2 : 1);
      if (run.phase === "finished") {
        const ctx = ensureAudioCtx();
        setTimeout(() => playApplause(ctx, 3), 400);
      }
    }
    prevPhaseRef.current = run.phase;
  }, [screen, run.phase, ensureAudioCtx]);

  // --- Actions ---
  async function loadLibrary() {
    setLibraryLoading(true);
    setLibraryError(false);
    try {
      const listRes = await storage.list("sessions:");
      const keys = listRes?.keys || [];
      const items = [];
      for (const k of keys) {
        try {
          const r = await storage.get(k);
          if (r?.value) items.push(JSON.parse(r.value));
        } catch (e) { /* entrée ignorée si illisible */ }
      }
      const order = await getOrder(storage, "simple-library-order");
      const ordered = applyOrder(items, order);
      setLibrary(ordered);
      await setOrder(storage, "simple-library-order", ordered.map(i => i.id));
    } catch (e) {
      setLibraryError(true);
    }
    setLibraryLoading(false);
  }

  async function moveLibraryItem(id, direction) {
    const idx = library.findIndex(s => s.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= library.length) return;
    const reordered = [...library];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setLibrary(reordered);
    await setOrder(storage, "simple-library-order", reordered.map(i => i.id));
  }

  function openLibrary() {
    setScreen("library");
    loadLibrary();
  }

  function applySessionConfig(saved) {
    const c = saved.config || {};
    setVma(c.vma ?? 15);
    setEffortPct(c.effortPct ?? 100);
    setRecupPct(c.recupPct ?? 50);
    setWorkSec(c.workSec ?? 30);
    setRestSec(c.restSec ?? 30);
    setReps(c.reps ?? 9);
    setSeries(c.series ?? 3);
    setRestSeriesSec(c.restSeriesSec ?? 180);
    setWarmupSec(c.warmupSec ?? 0);
    setFinalRecupSec(c.finalRecupSec ?? 0);
    setStartLatencySec(c.startLatencySec ?? 4);
  }

  function loadSessionConfig(saved) {
    applySessionConfig(saved);
    setScreen("config");
  }

  function openLibraryDetail(saved) {
    setLibraryDetail(saved);
    setScreen("libraryDetail");
  }

  // Relance la séance sauvegardée directement, sans repasser par l'écran de configuration
  function replaySavedSession(saved) {
    applySessionConfig(saved);
    pendingReplayRef.current = true;
  }

  useEffect(() => {
    if (pendingReplayRef.current) {
      pendingReplayRef.current = false;
      startSession();
    }
  }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadPresetConfig(preset) {
    const c = preset.config || {};
    setEffortPct(c.effortPct ?? 100);
    setRecupPct(c.recupPct ?? 50);
    // Séances à distance fixe (ex. fartlek) : la durée de chaque phase est calculée
    // à partir de la VMA déjà saisie, pour que la séance s'adapte au niveau de chacun.
    if (c.workDistM != null) {
      setWorkSec(Math.round(distanceToSeconds(c.workDistM, c.effortPct ?? 100, vma)));
    } else {
      setWorkSec(c.workSec ?? 30);
    }
    if (c.restDistM != null) {
      setRestSec(Math.round(distanceToSeconds(c.restDistM, c.recupPct ?? 50, vma)));
    } else {
      setRestSec(c.restSec ?? 30);
    }
    setReps(c.reps ?? 9);
    setSeries(c.series ?? 3);
    setRestSeriesSec(c.restSeriesSec ?? 180);
    setWarmupSec(c.warmupSec ?? 0);
    setFinalRecupSec(c.finalRecupSec ?? 0);
    setStartLatencySec(c.startLatencySec ?? 4);
    // La VMA n'est pas modifiée : la séance s'adapte au niveau déjà renseigné.
    setScreen("config");
  }

  async function deleteSession(id) {
    try { await storage.delete(id); } catch (e) { /* ignoré */ }
    loadLibrary();
  }

  async function saveSession() {
    setSaveStatus("saving");
    const id = `sessions:${Date.now()}`;
    const payload = {
      id,
      title: saveTitle.trim() || "Séance sans titre",
      date: saveDate,
      observation: saveObservation.trim(),
      savedAt: Date.now(),
      config: cfg,
      recap: {
        maxSpeed: gAcc.maxSpeed,
        workAvgSpeed, workAvgPctVma, workPlusRecupAvgSpeed,
        totalDistanceAll, workDistance, recupDistanceAll, warmupFinalDist,
        totalSessionTime, workTime: gAcc.effortTime, recupTimeAll, warmupFinalTime,
        sessionCharge,
        primaryZone: { label: primaryZone.label, effect: primaryZone.effect },
        secondaryZone: { label: secondaryZone.label, effect: secondaryZone.effect },
      },
    };
    try {
      const res = await storage.set(id, JSON.stringify(payload));
      setSaveStatus(res ? "saved" : "error");
    } catch (e) {
      setSaveStatus("error");
    }
  }

  function startSession() {
    const initialPhase = cfg.warmupSec > 0 ? "warmup" : "effort";
    const initialSeconds = cfg.warmupSec > 0 ? cfg.warmupSec : cfg.workSec;
    setRun({ phase: initialPhase, series: 1, rep: 1, secondsLeft: initialSeconds });
    setDistance(0);
    seriesAccRef.current = { series: 1, effortDist: 0, effortTime: 0, recupDist: 0, recupTime: 0 };
    globalAccRef.current = {
      effortDist: 0, effortTime: 0,
      recupDist: 0, recupTime: 0,
      restSeriesDist: 0, restSeriesTime: 0,
      warmupFinalDist: 0, warmupFinalTime: 0,
      maxSpeed: 0,
    };
    setScreen("run");
    setStatus("running");
  }
  function togglePause() {
    setStatus(s => (s === "running" ? "paused" : "running"));
  }
  function stopSession() {
    setStatus("paused");
    setScreen("config");
    if (beepTimeoutRef.current) clearTimeout(beepTimeoutRef.current);
  }

  const totalReps = cfg.series * cfg.reps;
  let doneReps;
  if (run.phase === "warmup") {
    doneReps = 0;
  } else if (run.phase === "finalRecup" || run.phase === "finished") {
    doneReps = totalReps;
  } else {
    doneReps = (run.series - 1) * cfg.reps + (run.phase === "restSeries" ? cfg.reps : run.rep - (run.phase === "effort" ? 1 : 0));
  }
  const progressPct = Math.min(100, Math.round((doneReps / totalReps) * 100));

  const meta = PHASE_META[run.phase];
  const currentSpeed = simMode ? simSpeed : liveSpeed;
  const targetSpeed = run.phase === "effort" ? effortSpeed : run.phase === "recup" ? recupSpeed : null;

  const inLatency = run.phase === "effort" && run.rep === 1
    && (cfg.workSec - run.secondsLeft) < cfg.startLatencySec;
  const latencyRemaining = inLatency ? Math.ceil(cfg.startLatencySec - (cfg.workSec - run.secondsLeft)) : 0;

  // Aiguille du cadran : -90° (0.5x cible) à +90° (1.5x cible)
  const needleAngle = useMemo(() => {
    if (!targetSpeed) return 0;
    const ratio = currentSpeed / targetSpeed;
    const clamped = Math.max(0.5, Math.min(1.5, ratio));
    return (clamped - 1) * 180; // -90 .. +90
  }, [currentSpeed, targetSpeed]);

  // --- Stats dérivées : récap de la série en cours (pendant récup' / pause série) ---
  const sAcc = seriesAccRef.current;
  const seriesTotalDist = sAcc.effortDist + sAcc.recupDist;
  const seriesEffortAvgSpeed = sAcc.effortTime > 0 ? (sAcc.effortDist / sAcc.effortTime) * 3.6 : 0;
  const seriesGlobalAvgSpeed = (sAcc.effortTime + sAcc.recupTime) > 0
    ? (seriesTotalDist / (sAcc.effortTime + sAcc.recupTime)) * 3.6 : 0;

  // --- Stats dérivées : récap final de la séance ---
  const gAcc = globalAccRef.current;
  const warmupFinalDist = gAcc.warmupFinalDist;
  const warmupFinalTime = gAcc.warmupFinalTime;
  const totalDistanceAll = gAcc.effortDist + gAcc.recupDist + gAcc.restSeriesDist + warmupFinalDist;
  const workDistance = gAcc.effortDist;
  const recupDistanceAll = gAcc.recupDist + gAcc.restSeriesDist;
  const workAvgSpeed = gAcc.effortTime > 0 ? (gAcc.effortDist / gAcc.effortTime) * 3.6 : 0;
  const workAvgPctVma = vma > 0 ? (workAvgSpeed / vma) * 100 : 0;
  const workPlusRecupTime = gAcc.effortTime + gAcc.recupTime;
  const workPlusRecupAvgSpeed = workPlusRecupTime > 0
    ? ((gAcc.effortDist + gAcc.recupDist) / workPlusRecupTime) * 3.6 : 0;
  const recupTimeAll = gAcc.recupTime + gAcc.restSeriesTime;
  const totalSessionTime = gAcc.effortTime + gAcc.recupTime + gAcc.restSeriesTime + warmupFinalTime;

  // Vitesse/%.VMA moyens réellement atteints en récupération (inter-répétitions)
  const recupAvgSpeed = gAcc.recupTime > 0 ? (gAcc.recupDist / gAcc.recupTime) * 3.6 : 0;
  const recupAvgPctVma = vma > 0 ? (recupAvgSpeed / vma) * 100 : 0;

  // Objectifs réellement atteints (basés sur les %VMA moyens réalisés, pas seulement visés)
  const primaryZone = classifyZone(workAvgPctVma);
  const secondaryZone = classifyZone(recupAvgPctVma);

  // Indicateur de charge de la séance (1 min à 100% VMA = charge 1), tous segments confondus
  const sessionCharge =
    segmentCharge(gAcc.effortDist, gAcc.effortTime, vma) +
    segmentCharge(gAcc.recupDist, gAcc.recupTime, vma) +
    segmentCharge(gAcc.restSeriesDist, gAcc.restSeriesTime, vma) +
    segmentCharge(gAcc.warmupFinalDist, gAcc.warmupFinalTime, vma);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-6 font-sans">
      <header className="w-full max-w-md flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Fractionné GPS Pro</h1>
          <p className="text-xs text-slate-500">by C. Guilhem</p>
        </div>
        {screen === "run" && (
          <button
            onClick={stopSession}
            className="flex items-center gap-1 text-xs text-slate-400 border border-slate-700 rounded-full px-3 py-1.5 hover:bg-slate-800"
          >
            <Settings2 size={14} /> Config
          </button>
        )}
        {screen === "config" && (
          <button
            onClick={openLibrary}
            className="flex items-center gap-1 text-xs text-slate-400 border border-slate-700 rounded-full px-3 py-1.5 hover:bg-slate-800"
          >
            <BookOpen size={14} /> Bibliothèque
          </button>
        )}
        {screen === "library" && (
          <button
            onClick={() => setScreen("config")}
            className="flex items-center gap-1 text-xs text-slate-400 border border-slate-700 rounded-full px-3 py-1.5 hover:bg-slate-800"
          >
            <ArrowLeft size={14} /> Retour
          </button>
        )}
        {screen === "presets" && (
          <button
            onClick={() => setScreen("library")}
            className="flex items-center gap-1 text-xs text-slate-400 border border-slate-700 rounded-full px-3 py-1.5 hover:bg-slate-800"
          >
            <ArrowLeft size={14} /> Retour
          </button>
        )}
        {screen === "libraryDetail" && (
          <button
            onClick={() => setScreen("library")}
            className="flex items-center gap-1 text-xs text-slate-400 border border-slate-700 rounded-full px-3 py-1.5 hover:bg-slate-800"
          >
            <ArrowLeft size={14} /> Retour
          </button>
        )}
      </header>

      {screen === "presets" && (
        <div className="w-full max-w-md space-y-3">
          {PRESETS.map(p => (
            <div key={p.id} className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-2">
              <p className="font-semibold text-slate-100">{p.title}</p>
              <p className="text-sm text-slate-400">{p.description}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-300 font-mono pt-1 border-t border-slate-800">
                <div><dt className="inline text-slate-500">Effort : </dt><dd className="inline">{p.config.effortPct}% VMA{p.config.workDistM != null ? ` · ${p.config.workDistM} m` : ` · ${p.config.workSec} s`}</dd></div>
                <div><dt className="inline text-slate-500">Récup : </dt><dd className="inline">{p.config.recupPct}% VMA{p.config.restDistM != null ? ` · ${p.config.restDistM} m` : ` · ${p.config.restSec} s`}</dd></div>
                <div><dt className="inline text-slate-500">Répétitions : </dt><dd className="inline">{p.config.reps}</dd></div>
                <div><dt className="inline text-slate-500">Séries : </dt><dd className="inline">{p.config.series}</dd></div>
                <div><dt className="inline text-slate-500">Pause entre séries : </dt><dd className="inline">{p.config.restSeriesSec > 0 ? `${p.config.restSeriesSec} s` : "aucune"}</dd></div>
                <div><dt className="inline text-slate-500">Latence départ : </dt><dd className="inline">{p.config.startLatencySec > 0 ? `${p.config.startLatencySec} s` : "aucune"}</dd></div>
                <div><dt className="inline text-slate-500">Échauffement : </dt><dd className="inline">{p.config.warmupSec > 0 ? `${p.config.warmupSec} s` : "aucun"}</dd></div>
                <div><dt className="inline text-slate-500">Récup finale : </dt><dd className="inline">{p.config.finalRecupSec > 0 ? `${p.config.finalRecupSec} s` : "aucune"}</dd></div>
              </dl>
              <button
                onClick={() => loadPresetConfig(p)}
                className="w-full mt-1 bg-orange-500 text-slate-950 text-sm font-semibold rounded-xl py-2 flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Charger cette séance
              </button>
            </div>
          ))}
        </div>
      )}

      {screen === "library" && (
        <div className="w-full max-w-md space-y-6">
          <button
            onClick={() => setScreen("presets")}
            className="w-full flex items-center justify-center gap-2 bg-orange-500/10 border border-orange-500/40 text-orange-400 text-sm font-semibold rounded-xl py-2.5"
          >
            <Zap size={16} /> Presets
          </button>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <BookOpen size={14} className="text-sky-400" /> Mes séances
            </p>
            {libraryLoading && (
              <p className="text-sm text-slate-500 text-center py-6">Chargement de la bibliothèque…</p>
            )}
            {!libraryLoading && libraryError && (
              <p className="text-sm text-rose-400 text-center py-6">Impossible de charger la bibliothèque.</p>
            )}
            {!libraryLoading && !libraryError && library.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">Aucune séance enregistrée pour l'instant.</p>
            )}
            {!libraryLoading && library.map((s, idx) => (
            <div key={s.id} className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => openLibraryDetail(s)} className="text-left flex-1">
                  <p className="font-semibold text-slate-100">{s.title}</p>
                  <p className="text-xs text-slate-500">{s.date}</p>
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveLibraryItem(s.id, -1)} disabled={idx === 0}
                    className="text-slate-500 hover:text-slate-200 disabled:opacity-30">
                    <ChevronUp size={16} />
                  </button>
                  <button onClick={() => moveLibraryItem(s.id, 1)} disabled={idx === library.length - 1}
                    className="text-slate-500 hover:text-slate-200 disabled:opacity-30">
                    <ChevronDown size={16} />
                  </button>
                  <button onClick={() => deleteSession(s.id)} className="text-slate-500 hover:text-rose-400 ml-1">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <button onClick={() => openLibraryDetail(s)} className="text-left w-full space-y-2">
                <p className="text-xs text-slate-400 font-mono">
                  VMA {s.config?.vma} km/h · {s.config?.effortPct}%/{s.config?.recupPct}% VMA · {s.config?.series}×{s.config?.reps} · {s.config?.workSec}-{s.config?.restSec}
                </p>
                {s.recap && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300 pt-1 border-t border-slate-800">
                    <span>Charge : <span className="font-mono font-semibold text-slate-100">{s.recap.sessionCharge?.toFixed(1)}</span></span>
                    <span>Travail : <span className="font-mono font-semibold text-slate-100">{fmtDuration(s.recap.workTime || 0)}</span></span>
                    {s.recap.primaryZone && (
                      <span>Objectif : <span className="font-semibold text-slate-100">{s.recap.primaryZone.label}</span>
                        {s.recap.secondaryZone && <span className="text-slate-500"> + {s.recap.secondaryZone.label}</span>}
                      </span>
                    )}
                  </div>
                )}
                {s.observation && (
                  <p className="text-sm text-slate-300 italic">"{s.observation}"</p>
                )}
              </button>
              <button
                onClick={() => replaySavedSession(s)}
                className="w-full mt-1 bg-slate-100 text-slate-950 text-sm font-semibold rounded-xl py-2 flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Refaire cette séance
              </button>
            </div>
            ))}
          </div>
        </div>
      )}

      {screen === "libraryDetail" && libraryDetail && (
        <div className="w-full max-w-md space-y-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-100">{libraryDetail.title}</h2>
            <p className="text-xs text-slate-500">{libraryDetail.date}</p>

            <p className="text-xs text-slate-400 font-mono pt-2 border-t border-slate-800">
              VMA {libraryDetail.config?.vma} km/h · {libraryDetail.config?.effortPct}%/{libraryDetail.config?.recupPct}% VMA · {libraryDetail.config?.series}×{libraryDetail.config?.reps} · {libraryDetail.config?.workSec}-{libraryDetail.config?.restSec}
            </p>

            {libraryDetail.recap && (
              <>
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Vitesses</p>
                  <StatRow label="Vitesse maximale atteinte" value={`${(libraryDetail.recap.maxSpeed || 0).toFixed(1)} km/h · ${allureFromKmh(libraryDetail.recap.maxSpeed || 0)}`} />
                  <StatRow label="Vitesse moy. de travail" value={`${(libraryDetail.recap.workAvgSpeed || 0).toFixed(1)} km/h · ${allureFromKmh(libraryDetail.recap.workAvgSpeed || 0)}`}
                    sub={`${(libraryDetail.recap.workAvgPctVma || 0).toFixed(0)}% VMA`} />
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Objectifs atteints</p>
                  {libraryDetail.recap.primaryZone && (
                    <StatRow label="Principal (travail)" value={libraryDetail.recap.primaryZone.label} sub={libraryDetail.recap.primaryZone.effect} />
                  )}
                  {libraryDetail.recap.secondaryZone && (
                    <StatRow label="Secondaire (récup')" value={libraryDetail.recap.secondaryZone.label} sub={libraryDetail.recap.secondaryZone.effect} />
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Charge</p>
                  <StatRow label="Indicateur de charge" value={(libraryDetail.recap.sessionCharge || 0).toFixed(1)} sub="1 min à 100% VMA = charge de 1" />
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Temps &amp; distances</p>
                  <StatRow label="Temps total" value={fmtDuration(libraryDetail.recap.totalSessionTime || 0)} />
                  <StatRow label="Temps de travail" value={fmtDuration(libraryDetail.recap.workTime || 0)} />
                  <StatRow label="Distance totale" value={fmtDistance(libraryDetail.recap.totalDistanceAll || 0)} />
                </div>
              </>
            )}

            {libraryDetail.observation && (
              <div className="pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Observation</p>
                <p className="text-sm italic text-slate-300">"{libraryDetail.observation}"</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => replaySavedSession(libraryDetail)}
                className="flex-1 bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold rounded-xl py-3 flex items-center justify-center gap-2"
              >
                <RotateCcw size={18} /> Refaire cette séance
              </button>
              <button
                onClick={() => loadSessionConfig(libraryDetail)}
                className="bg-slate-800 text-slate-300 rounded-xl px-4 flex items-center justify-center text-sm"
              >
                Modifier
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "config" && (
        <div className="w-full max-w-md space-y-5">
          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
              <Zap size={14} className="text-orange-400" /> Vitesse de référence
            </p>
            <label className="text-sm text-slate-300">VMA (km/h)</label>
            <input
              type="number" step="0.1" value={vma}
              onChange={e => setVma(parseFloat(e.target.value) || 0)}
              className="w-full mt-1 bg-slate-800 rounded-lg px-3 py-2 text-lg font-mono outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 space-y-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <Wind size={14} className="text-sky-400" /> Intensités
            </p>
            <div>
              <div className="flex justify-between text-sm text-slate-300 mb-1">
                <span>Effort — %VMA</span>
                <span className="font-mono text-orange-400">{effortPct}% · {effortSpeed.toFixed(1)} km/h · {allureFromKmh(effortSpeed)}</span>
              </div>
              <input type="range" min="50" max="130" value={effortPct}
                onChange={e => setEffortPct(parseInt(e.target.value))}
                className="w-full accent-orange-500" />
            </div>
            <div>
              <div className="flex justify-between text-sm text-slate-300 mb-1">
                <span>Récup' — %VMA</span>
                <span className="font-mono text-sky-400">{recupPct}% · {recupSpeed.toFixed(1)} km/h · {allureFromKmh(recupSpeed)}</span>
              </div>
              <input type="range" min="0" max="100" value={recupPct}
                onChange={e => setRecupPct(parseInt(e.target.value))}
                className="w-full accent-sky-500" />
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 space-y-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <TimerIcon size={14} className="text-slate-300" /> Structure de la séance
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Effort (s)" value={workSec} onChange={setWorkSec} />
              <Field label="Récup' (s)" value={restSec} onChange={setRestSec} />
              <Field label="Répétitions / série" value={reps} onChange={setReps} />
              <Field label="Nombre de séries" value={series} onChange={setSeries} />
              <Field label="Pause entre séries (s)" value={restSeriesSec} onChange={setRestSeriesSec} full />
            </div>
            <button
              onClick={() => { setWorkSec(30); setRestSec(30); setReps(9); setSeries(3); setRestSeriesSec(180); }}
              className="text-xs text-slate-400 underline underline-offset-2"
            >
              Préremplir avec 3 × 9 × 30-30
            </button>
          </div>

          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 space-y-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <TimerIcon size={14} className="text-amber-400" /> Échauffement, latence & récup' finale
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Échauffement (s)" value={warmupSec} onChange={setWarmupSec} />
              <Field label="Récup' finale (s)" value={finalRecupSec} onChange={setFinalRecupSec} />
              <Field
                label="Latence avant régulation (1ère rép. de chaque série, s)"
                value={startLatencySec}
                onChange={setStartLatencySec}
                full
              />
            </div>
            <p className="text-xs text-slate-500">
              La latence correspond à la phase d'accélération au départ arrêté : pendant ce délai, choisi par le coureur, aucun bip de régulation ne retentit. Échauffement et récup' finale peuvent être laissés à 0.
            </p>
          </div>

          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={simMode} onChange={e => setSimMode(e.target.checked)} className="accent-violet-500" />
              Mode simulation (sans GPS, pour tester)
            </label>
            <p className="text-xs text-slate-500 mt-1">À activer si le GPS n'est pas disponible dans cet aperçu.</p>
          </div>

          <button
            onClick={startSession}
            className="w-full bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold rounded-xl py-3 flex items-center justify-center gap-2"
          >
            <Play size={18} /> Démarrer la séance
          </button>
        </div>
      )}

      {screen === "run" && (
        <div className="w-full max-w-md flex flex-col items-center gap-5">
          {/* Progression globale */}
          <div className="w-full">
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-slate-400" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1 text-center">
              {run.phase === "finished" ? "Séance terminée"
                : run.phase === "warmup" ? "Échauffement"
                : run.phase === "finalRecup" ? "Récupération finale"
                : `Série ${run.series}/${cfg.series} · Répétition ${run.rep}/${cfg.reps}`}
            </p>
          </div>

          {/* Bloc phase */}
          <div className={`w-full rounded-2xl border ${meta.border} ${meta.bg} p-6 flex flex-col items-center`}>
            <span className={`text-sm font-bold tracking-widest ${meta.color}`}>{meta.label}</span>
            <span className="text-6xl font-mono font-bold mt-2 tabular-nums">{fmtTime(run.secondsLeft)}</span>
          </div>

          {run.phase !== "finished" && (
            <>
              {(run.phase === "effort" || run.phase === "recup") && (
                <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-4 flex flex-col items-center">
                  {inLatency ? (
                    <div className="py-6 text-center">
                      <p className="text-sm font-semibold text-amber-400">Phase d'accélération</p>
                      <p className="text-4xl font-mono font-bold mt-1">{latencyRemaining}s</p>
                      <p className="text-xs text-slate-500 mt-1">Bips de régulation avant {latencyRemaining}s</p>
                    </div>
                  ) : (
                    <>
                      <svg viewBox="0 0 200 110" className="w-56">
                        <path d="M 15 100 A 85 85 0 0 1 65 20" fill="none" stroke="#38bdf8" strokeWidth="10" strokeLinecap="round" />
                        <path d="M 65 20 A 85 85 0 0 1 135 20" fill="none" stroke="#22c55e" strokeWidth="10" strokeLinecap="round" />
                        <path d="M 135 20 A 85 85 0 0 1 185 100" fill="none" stroke="#f97316" strokeWidth="10" strokeLinecap="round" />
                        <g transform={`translate(100,100) rotate(${needleAngle})`}>
                          <line x1="0" y1="0" x2="0" y2="-75" stroke="#f1f5f9" strokeWidth="3" strokeLinecap="round" />
                        </g>
                        <circle cx="100" cy="100" r="5" fill="#f1f5f9" />
                      </svg>
                      <div className="flex justify-between w-full mt-1 text-center">
                        <div>
                          <p className="text-2xl font-mono font-bold">{currentSpeed.toFixed(1)}</p>
                          <p className="text-xs text-slate-500">km/h actuelle</p>
                          <p className="text-sm font-mono text-slate-400 mt-0.5">{allureFromKmh(currentSpeed)}</p>
                          <p className="text-sm font-mono text-slate-400 mt-0.5">{vma > 0 ? ((currentSpeed / vma) * 100).toFixed(0) : 0}% VMA</p>
                        </div>
                        <div>
                          <p className={`text-2xl font-mono font-bold ${meta.color}`}>{targetSpeed?.toFixed(1)}</p>
                          <p className="text-xs text-slate-500">km/h cible</p>
                          <p className={`text-sm font-mono mt-0.5 ${meta.color}`}>{allureFromKmh(targetSpeed)}</p>
                          <p className={`text-sm font-mono mt-0.5 ${meta.color}`}>{run.phase === "effort" ? effortPct : recupPct}% VMA</p>
                        </div>
                      </div>
                    </>
                  )}
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    {simMode ? <Sliders size={12} /> : gpsStatus === "active" ? <MapPin size={12} className="text-emerald-400" /> : <MapPinOff size={12} className="text-rose-400" />}
                    {simMode ? "Vitesse simulée" : gpsStatus === "active" ? "GPS actif" : gpsStatus === "denied" ? "GPS refusé" : "GPS indisponible"}
                  </p>
                  {simMode && (
                    <input type="range" min="0" max="25" step="0.1" value={simSpeed}
                      onChange={e => setSimSpeed(parseFloat(e.target.value))}
                      className="w-full mt-3 accent-violet-500" />
                  )}
                </div>
              )}

              {(run.phase === "warmup" || run.phase === "finalRecup") && (
                <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col items-center">
                  <span className="text-xs uppercase tracking-widest text-slate-500">%VMA instantané</span>
                  <span className={`text-5xl font-mono font-bold mt-2 ${meta.color}`}>
                    {vma > 0 ? ((liveSpeed / vma) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              )}

              <p className="text-xs text-slate-500">Distance phase : {Math.round(distance)} m</p>

              {(run.phase === "recup" || run.phase === "restSeries") && (
                <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Récap série {run.series}</p>
                  <StatRow label="Distance parcourue (série)" value={fmtDistance(seriesTotalDist)} />
                  <StatRow label="Vitesse moy. de travail (série)" value={`${seriesEffortAvgSpeed.toFixed(1)} km/h`} />
                  <StatRow label="Vitesse moy. générale (série, récup incluse)" value={`${seriesGlobalAvgSpeed.toFixed(1)} km/h`} />
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <StatRow label="Temps total travail + récup' (hors pauses séries)" value={fmtDuration(workPlusRecupTime)} />
                    <StatRow label="Temps de récupération (hors pauses séries)" value={fmtDuration(gAcc.recupTime)} />
                  </div>
                </div>
              )}
            </>
          )}

          {run.phase === "finished" && (
            <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
              <p className="text-emerald-400 font-semibold text-center">Séance terminée, bravo !</p>
              <p className="text-sm text-slate-400 text-center">{cfg.series} séries × {cfg.reps} répétitions réalisées.</p>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Vitesses</p>
                <StatRow label="Vitesse maximale atteinte" value={`${gAcc.maxSpeed.toFixed(1)} km/h · ${allureFromKmh(gAcc.maxSpeed)}`} />
                <StatRow
                  label="Vitesse moy. de travail"
                  value={`${workAvgSpeed.toFixed(1)} km/h · ${allureFromKmh(workAvgSpeed)}`}
                  sub={`${workAvgPctVma.toFixed(0)}% VMA (objectif séance : ${effortPct}% VMA)`}
                />
                <StatRow
                  label="Vitesse moy. travail + récup' (hors pauses séries)"
                  value={`${workPlusRecupAvgSpeed.toFixed(1)} km/h · ${allureFromKmh(workPlusRecupAvgSpeed)}`}
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Objectifs atteints</p>
                <StatRow
                  label="Principal (travail)"
                  value={primaryZone.label}
                  sub={`${primaryZone.effect} · ${workAvgPctVma.toFixed(0)}% VMA réalisés`}
                />
                <StatRow
                  label="Secondaire (récup')"
                  value={secondaryZone.label}
                  sub={`${secondaryZone.effect} · ${recupAvgPctVma.toFixed(0)}% VMA réalisés`}
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Charge</p>
                <StatRow
                  label="Indicateur de charge"
                  value={sessionCharge.toFixed(1)}
                  sub="1 min à 100% VMA = charge de 1 (même échelle que VMA Pro)"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Temps</p>
                <StatRow label="Temps total de la séance" value={fmtDuration(totalSessionTime)} />
                <StatRow label="Temps total de travail" value={fmtDuration(gAcc.effortTime)} />
                <StatRow label="Temps total de récupération" value={fmtDuration(recupTimeAll)} />
                <StatRow label="Temps échauffement + récup' finale" value={fmtDuration(warmupFinalTime)} />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Distances</p>
                <StatRow label="Distance totale" value={fmtDistance(totalDistanceAll)} />
                <StatRow label="Distance de travail" value={fmtDistance(workDistance)} />
                <StatRow label="Distance de récupération" value={fmtDistance(recupDistanceAll)} />
                <StatRow label="Distance échauffement + récup' finale" value={fmtDistance(warmupFinalDist)} />
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Save size={14} /> Enregistrer cette séance
                </p>
                <div>
                  <label className="text-xs text-slate-400">Titre</label>
                  <input
                    type="text" value={saveTitle} onChange={e => setSaveTitle(e.target.value)}
                    placeholder="Ex. Séance seuil du jeudi"
                    className="w-full mt-1 bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Date</label>
                  <input
                    type="date" value={saveDate} onChange={e => setSaveDate(e.target.value)}
                    className="w-full mt-1 bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Observation</label>
                  <textarea
                    value={saveObservation} onChange={e => setSaveObservation(e.target.value)}
                    rows={3} placeholder="Sensations, météo, douleurs..."
                    className="w-full mt-1 bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
                <button
                  onClick={saveSession}
                  disabled={saveStatus === "saving" || saveStatus === "saved"}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-semibold rounded-xl py-2.5 flex items-center justify-center gap-2"
                >
                  {saveStatus === "saved" ? <><Check size={16} /> Séance enregistrée</> : <><Save size={16} /> Enregistrer dans ma bibliothèque</>}
                </button>
                {saveStatus === "error" && (
                  <p className="text-xs text-rose-400">L'enregistrement a échoué, réessaie.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 w-full">
            {run.phase !== "finished" ? (
              <button onClick={togglePause}
                className="flex-1 bg-slate-100 text-slate-950 font-semibold rounded-xl py-3 flex items-center justify-center gap-2">
                {status === "running" ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Reprendre</>}
              </button>
            ) : (
              <button onClick={() => setScreen("config")}
                className="flex-1 bg-slate-100 text-slate-950 font-semibold rounded-xl py-3 flex items-center justify-center gap-2">
                <RotateCcw size={18} /> Nouvelle séance
              </button>
            )}
            <button onClick={stopSession}
              className="bg-slate-800 text-slate-300 rounded-xl px-4 flex items-center justify-center">
              <Square size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, sub }) {
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

function Field({ label, value, onChange, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type="number" value={value}
        onChange={e => onChange(parseInt(e.target.value) || 0)}
        className="w-full mt-1 bg-slate-800 rounded-lg px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-slate-500"
      />
    </div>
  );
}
