import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play, Pause, Square, MapPin, MapPinOff, Sliders, RotateCcw, Save, Check,
  Plus, Trash2, ArrowLeft, BookOpen, Zap, Shuffle, ChevronRight, ChevronUp, ChevronDown,
  Download, Upload
} from "lucide-react";
import { storage } from "../storage.js";
import {
  fmtDistance, fmtDuration, fmtTime, allureFromKmh,
  playGong, playGongStart, playGongStop, playBeep, playCountdownBeep, playGunshot, playApplause,
  TOLERANCE_RATIO, SILENCE_CHECK_MS, speedRatio, beepIntervalMs, beepFrequency, gaugePoint,
  ZONES, classifyZone, segmentCharge, StatRow, getOrder, setOrder, applyOrder,
  useWakeLock, saveActiveSession, loadActiveSession, clearActiveSession,
  APP_VERSION, exportSessionToFile, readSessionFile,
  createSpeedSmoother, TraceMap, googleMapsRouteUrl,
  CountSelect, DurationField, theoreticalDistanceMeters, GaugeTargetTick,
} from "../shared.jsx";
import { buildManualQueue, generateHazardousQueue } from "./engine.js";
import { pickText } from "./personalization.js";

const ACTIVE_SESSION_KEY = "activeSession-fullpower";

const REP_COLOR_PALETTE = [
  { text: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/40", accent: "accent-fuchsia-500", hex: "#e879f9" },
  { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/40", accent: "accent-purple-500", hex: "#c084fc" },
  { text: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/40", accent: "accent-pink-500", hex: "#f472b6" },
  { text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/40", accent: "accent-violet-500", hex: "#a78bfa" },
  { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/40", accent: "accent-rose-500", hex: "#fb7185" },
  { text: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/40", accent: "accent-indigo-500", hex: "#818cf8" },
];

// Génère l'identifiant suivant façon colonnes Excel : A, B, ... Z, puis AA, AB... — permet
// un nombre illimité de types de répétition (plus de limite à 4).
function nextRepId(existingCount) {
  let num = existingCount, id = "";
  do {
    id = String.fromCharCode(65 + (num % 26)) + id;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);
  return id;
}

const PHASE_META = {
  warmup:     { label: "ÉCHAUFFEMENT", color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/40" },
  work:       { label: "TRAVAIL",      color: "text-fuchsia-300", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/40" },
  recup:      { label: "RÉCUP'",       color: "text-purple-300", bg: "bg-purple-500/10", border: "border-purple-500/40" },
  restSeries: { label: "PAUSE SÉRIE",  color: "text-violet-300", bg: "bg-violet-500/10", border: "border-violet-500/40" },
  finalRecup: { label: "RÉCUPÉRATION FINALE", color: "text-pink-300", bg: "bg-pink-500/10", border: "border-pink-500/40" },
  finished:   { label: "TERMINÉ",      color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40" },
};

function repColorFor(repTypes, id) {
  const idx = Math.max(0, repTypes.findIndex(rt => rt.id === id));
  return REP_COLOR_PALETTE[idx % REP_COLOR_PALETTE.length];
}

// Couleur d'un point du tracé : par type de répétition (A/B/C/D...) en travail/récup
// normale, par phase générique sinon (échauffement, pause série, récup finale, Hazardous).
const PHASE_TRACE_HEX_FP = { warmup: "#fbbf24", restSeries: "#a78bfa", finalRecup: "#f472b6", finished: "#34d399" };
function traceColorForPoint(p, repTypes) {
  if ((p.kind === "work" || p.kind === "recup") && p.repTypeId) {
    return repColorFor(repTypes, p.repTypeId).hex;
  }
  if (p.kind === "work") return "#e879f9"; // Hazardous, sans type identifié
  if (p.kind === "recup") return "#c084fc";
  return PHASE_TRACE_HEX_FP[p.kind] || "#94a3b8";
}

function emptyRepType(id) {
  return { id, enabled: true, workPct: 100, workSec: 30, recupPct: 50, recupSec: 30 };
}

function newSeries(idx) {
  return { id: `s${Date.now()}-${idx}`, label: `Série ${idx}`, blocks: [], repeatCount: 1, restSeriesSec: 120 };
}

// Durée totale estimée d'une séance sauvegardée, à partir de sa file de phases déjà
// construite (identique quelle que soit la config d'origine, manuel ou Hazardous).
function estimateQueueTotalSec(queue) {
  if (!queue || !queue.length) return 0;
  return queue.reduce((sum, p) => sum + (p.seconds || 0), 0);
}

export default function FullPower({ runnerName, onToast }) {
  const [screen, setScreen] = useState("config"); // config | run | library | libraryDetail
  const [configMode, setConfigMode] = useState("manual"); // manual | hazardous

  // --- Config manuelle ---
  const [vma, setVma] = useState(15);
  const [repTypes, setRepTypes] = useState(() => [emptyRepType("A")]);
  const [seriesList, setSeriesList] = useState([newSeries(1)]);
  const [globalRepeatCount, setGlobalRepeatCount] = useState(1);
  const [warmupSec, setWarmupSec] = useState(300);
  const [finalRecupSec, setFinalRecupSec] = useState(180);
  const [startLatencySec, setStartLatencySec] = useState(4);

  const manualEstimatedTotalSec = useMemo(() => {
    try {
      const queue = buildManualQueue({
        repTypes, seriesList, globalRepeatCount,
        warmupSec: Number(warmupSec) || 0,
        finalRecupSec: Number(finalRecupSec) || 0,
        startLatencySec: Number(startLatencySec) || 0,
      });
      return queue.reduce((acc, p) => acc + (p.seconds || 0), 0);
    } catch {
      return 0;
    }
  }, [repTypes, seriesList, globalRepeatCount, warmupSec, finalRecupSec, startLatencySec]);

  // --- Config Hazardous ---
  const [hzWarmupSec, setHzWarmupSec] = useState(300);
  const [hzWorkTotalSec, setHzWorkTotalSec] = useState(1200);
  const [hzFinalRecupSec, setHzFinalRecupSec] = useState(180);

  // --- Bibliothèque ---
  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryDetail, setLibraryDetail] = useState(null);
  const [importStatus, setImportStatus] = useState(null); // null | "error-format" | "error-kind" | "error"
  const importInputRef = useRef(null);
  const [prepTitle, setPrepTitle] = useState("");
  const [prepStatus, setPrepStatus] = useState("idle"); // idle | saving | saved | error

  // --- Course ---
  const [queue, setQueue] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [status, setStatus] = useState("paused"); // paused | running
  const [rocketCount, setRocketCount] = useState(null); // null = pas en décompte, sinon 10..0

  const [simMode, setSimMode] = useState(false);
  const [simSpeed, setSimSpeed] = useState(0);
  const [gpsStatus, setGpsStatus] = useState("idle");
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [distance, setDistance] = useState(0);

  const [saveComment, setSaveComment] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");

  const watchIdRef = useRef(null);
  const audioCtxRef = useRef(null);
  const beepTimeoutRef = useRef(null);
  const rocketTimeoutRef = useRef(null);
  const queueRef = useRef(queue);
  const qIndexRef = useRef(0);
  const statusRef = useRef(status);
  const liveSpeedRef = useRef(0);
  const secondsLeftRef = useRef(0);
  const recupTextFiredRef = useRef(false);
  const raceStartFiredRef = useRef(false);
  // Miroir synchrone de `distance`, utilisé pour les sauvegardes de séance.
  const distanceRef = useRef(0);
  // Évite que le reset automatique de distance (sur changement de phase) n'écrase la
  // distance qu'on vient de restaurer au moment précis d'une reprise de séance.
  const skipDistanceResetRef = useRef(false);
  const speedSmootherRef = useRef(createSpeedSmoother());
  // Points GPS capturés pendant la course (lat/lng + type de répétition/phase), pour le
  // tracé coloré affiché sur le récapitulatif final.
  const tracePointsRef = useRef([]);
  // Récap "distance réalisée / distance prévue" de la dernière répétition de travail
  // terminée, et de la dernière série achevée (accumulée uniquement sur les phases de
  // travail, hors récup) — affichés pendant les phases de récup'/pause de série.
  const lastRepRecapRef = useRef(null); // { actualDist, theoreticalDist, repIndexInSeries, repsInSeriesTotal }
  const lastSeriesRecapRef = useRef(null); // { actualDist, theoreticalDist, seriesLabel }
  const seriesWorkAccRef = useRef({ actualDist: 0, theoreticalDist: 0 });

  // --- Reprise après extinction/relance de l'appli ---
  const [resumeSnapshot, setResumeSnapshot] = useState(null);

  // Empêche l'écran de s'éteindre tout seul tant qu'une course est active.
  useWakeLock(screen === "run" && status === "running");

  // Au montage : une séance Full Power a-t-elle été interrompue (écran éteint, appli tuée) ?
  useEffect(() => {
    (async () => {
      const snap = await loadActiveSession(storage, ACTIVE_SESSION_KEY);
      if (snap?.queue?.length && snap.current?.kind && snap.current.kind !== "finished") {
        setResumeSnapshot(snap);
      } else if (snap) {
        clearActiveSession(storage, ACTIVE_SESSION_KEY);
      }
    })();
  }, []);

  function resumeFromSnapshot() {
    const snap = resumeSnapshot;
    if (!snap) return;
    setVma(snap.vma ?? 15);
    acc.current = snap.acc || {
      work: { dist: 0, time: 0 }, recup: { dist: 0, time: 0 },
      restSeries: { dist: 0, time: 0 }, warmupFinal: { dist: 0, time: 0 },
      maxSpeed: 0,
    };
    raceStartFiredRef.current = true; // évite de rejouer le texte "départ" en reprenant en pleine course
    recupTextFiredRef.current = true;
    distanceRef.current = snap.distance || 0;
    setDistance(snap.distance || 0);
    skipDistanceResetRef.current = true;
    setQueue(snap.queue);
    setQIndex(snap.qIndex || 0);
    setSecondsLeft(snap.secondsLeft || 0);
    setScreen("run");
    setStatus("paused"); // reprise en pause : l'utilisateur relance volontairement (GPS/bips/timer)
    setResumeSnapshot(null);
  }

  function discardSnapshot() {
    clearActiveSession(storage, ACTIVE_SESSION_KEY);
    setResumeSnapshot(null);
  }

  const isHazardous = queue.length > 0 && queue.some(p => p.hazard);

  const acc = useRef({
    work: { dist: 0, time: 0 }, recup: { dist: 0, time: 0 },
    restSeries: { dist: 0, time: 0 }, warmupFinal: { dist: 0, time: 0 },
    maxSpeed: 0,
  });

  const ensureAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { qIndexRef.current = qIndex; }, [qIndex]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { secondsLeftRef.current = secondsLeft; }, [secondsLeft]);
  // Pendant l'échauffement et la récup' finale, on ignore le mode simulation :
  // seule la vitesse GPS réelle compte, la simulation n'y a plus cours.
  useEffect(() => {
    const cur = queue[qIndex];
    const isWarmupOrFinal = cur && (cur.kind === "warmup" || cur.kind === "finalRecup");
    liveSpeedRef.current = (simMode && !isWarmupOrFinal) ? simSpeed : liveSpeed;
  }, [simMode, simSpeed, liveSpeed, queue, qIndex]);

  const current = queue[qIndex] || { kind: "finished", seconds: 0 };
  const targetSpeed = current.pct ? vma * (current.pct / 100) : 0;
  const inLatency = current.kind === "work" && current.latencySec > 0
    && (current.seconds - secondsLeft) < current.latencySec;
  const latencyRemaining = inLatency ? Math.ceil(current.latencySec - (current.seconds - secondsLeft)) : 0;

  function accumulate(kind, speedKmh) {
    const distInc = speedKmh / 3.6;
    const bucket = kind === "work" ? "work" : kind === "recup" ? "recup"
      : kind === "restSeries" ? "restSeries"
      : (kind === "warmup" || kind === "finalRecup") ? "warmupFinal" : null;
    if (bucket) {
      acc.current[bucket].dist += distInc;
      acc.current[bucket].time += 1;
    }
    if (speedKmh > acc.current.maxSpeed) acc.current.maxSpeed = speedKmh;
  }

  // --- Timer principal ---
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      const speedNow = liveSpeedRef.current;
      const cur = queueRef.current[qIndexRef.current];
      if (!cur) return;
      accumulate(cur.kind, speedNow);
      distanceRef.current += speedNow / 3.6;
      setDistance(distanceRef.current);

      setSecondsLeft(s => {
        let nextIdx = qIndexRef.current;
        let secondsForNext = s;
        if (s > 1) {
          // texte "5 secondes avant la fin de la récup" — uniquement en récup normale (hors récup finale)
          if (cur.kind === "recup" && s - 1 === 5 && !recupTextFiredRef.current) {
            recupTextFiredRef.current = true;
            onToast?.(pickText("recupEndingSoon", runnerName));
          }
          secondsForNext = s - 1;
        } else {
          // fin de la phase courante -> passage à la suivante
          nextIdx = qIndexRef.current + 1;
          const nextPhase = queueRef.current[nextIdx] || { kind: "finished", seconds: 0 };
          recupTextFiredRef.current = false;

          // Une répétition de travail vient de se terminer : récap distance réalisée/prévue,
          // et cumul pour le récap de la série en cours (travail uniquement, hors récup).
          if (cur.kind === "work") {
            const theoreticalRepDist = theoreticalDistanceMeters(vma * ((cur.pct || 0) / 100), cur.seconds);
            lastRepRecapRef.current = {
              actualDist: distanceRef.current, theoreticalDist: theoreticalRepDist,
              repIndexInSeries: cur.repIndexInSeries, repsInSeriesTotal: cur.repsInSeriesTotal,
            };
            seriesWorkAccRef.current = {
              actualDist: seriesWorkAccRef.current.actualDist + distanceRef.current,
              theoreticalDist: seriesWorkAccRef.current.theoreticalDist + theoreticalRepDist,
            };
          }
          // Fin d'une occurrence de série (la phase suivante n'est plus travail ni récup) :
          // récap de la série entière, puis on remet le cumul à zéro pour la suivante.
          if ((cur.kind === "work" || cur.kind === "recup") && nextPhase.kind !== "work" && nextPhase.kind !== "recup") {
            lastSeriesRecapRef.current = {
              actualDist: seriesWorkAccRef.current.actualDist,
              theoreticalDist: seriesWorkAccRef.current.theoreticalDist,
              seriesLabel: cur.seriesLabel,
            };
            seriesWorkAccRef.current = { actualDist: 0, theoreticalDist: 0 };
          }

          setQIndex(nextIdx);
          if (nextPhase.kind === "finished") setStatus("paused");
          secondsForNext = nextPhase.seconds;
        }
        const nextPhaseKind = (queueRef.current[nextIdx] || { kind: "finished" }).kind;
        if (nextPhaseKind === "finished") {
          clearActiveSession(storage, ACTIVE_SESSION_KEY);
        } else {
          saveActiveSession(storage, ACTIVE_SESSION_KEY, {
            vma, queue: queueRef.current, qIndex: nextIdx, secondsLeft: secondsForNext,
            distance: distanceRef.current, acc: acc.current,
            current: { kind: nextPhaseKind },
          });
        }
        return secondsForNext;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, runnerName, onToast, vma]);

  // Sauvegarde immédiate juste avant que l'écran s'éteigne ou que l'appli passe en
  // arrière-plan : c'est le moment où l'OS peut décider de tuer la page.
  useEffect(() => {
    function saveNow() {
      const cur = queueRef.current[qIndexRef.current];
      if (screen === "run" && cur && cur.kind !== "finished") {
        saveActiveSession(storage, ACTIVE_SESSION_KEY, {
          vma, queue: queueRef.current, qIndex: qIndexRef.current, secondsLeft: secondsLeftRef.current,
          distance: distanceRef.current, acc: acc.current,
          current: { kind: cur.kind },
        });
      }
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") saveNow();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", saveNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [screen, vma]);

  // reset distance à chaque changement de phase + textes contextuels
  // (sauf juste après une reprise de séance, où la distance restaurée doit être conservée)
  useEffect(() => {
    if (skipDistanceResetRef.current) { skipDistanceResetRef.current = false; return; }
    setDistance(0);
    distanceRef.current = 0;
    const cur = queue[qIndex];
    if (!cur) return;
    if (cur.kind === "work" && !raceStartFiredRef.current) {
      raceStartFiredRef.current = true;
      onToast?.(pickText("raceStart", runnerName));
    }
    if (cur.kind === "restSeries") {
      onToast?.(pickText("seriesRecup", runnerName));
    }
    if (cur.kind === "finished") {
      onToast?.(pickText("finish", runnerName));
    }
  }, [qIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- GPS ---
  // Reste actif pendant l'échauffement et la récup' finale même si la simulation
  // est activée pour le reste de la séance.
  useEffect(() => {
    const cur = queue[qIndex];
    const isWarmupOrFinal = cur && (cur.kind === "warmup" || cur.kind === "finalRecup");
    if (screen !== "run" || (simMode && !isWarmupOrFinal) || status !== "running") {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (!("geolocation" in navigator)) { setGpsStatus("error"); return; }
    setGpsStatus("active");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const speedMs = pos.coords.speed;
        if (speedMs != null && speedMs >= 0) setLiveSpeed(speedSmootherRef.current(speedMs * 3.6));
        const { latitude, longitude } = pos.coords;
        if (latitude != null && longitude != null) {
          const cur2 = queueRef.current[qIndexRef.current];
          tracePointsRef.current.push({ lat: latitude, lng: longitude, kind: cur2?.kind, repTypeId: cur2?.repTypeId });
        }
      },
      () => setGpsStatus("denied"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
    );
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [screen, simMode, status, queue, qIndex]);

  // --- Bips de régulation (seulement en work/recup, jamais pendant échauffement/pauses) ---
  const beepLoop = useCallback(() => {
    const cur = queueRef.current[qIndexRef.current];
    if (!cur || statusRef.current !== "running" || (cur.kind !== "work" && cur.kind !== "recup")) return;

    // Latence de départ (phase d'accélération, départ arrêté) — uniquement en
    // configuration manuelle, sur la 1ère répétition de travail de chaque série.
    if (cur.kind === "work" && cur.latencySec > 0) {
      const elapsed = cur.seconds - secondsLeftRef.current;
      if (elapsed < cur.latencySec) {
        beepTimeoutRef.current = setTimeout(beepLoop, 250);
        return;
      }
    }

    const ctx = ensureAudioCtx();
    const speed = liveSpeedRef.current;
    const target = vma * ((cur.pct || 0) / 100);
    if (speedRatio(speed, target) < TOLERANCE_RATIO) {
      beepTimeoutRef.current = setTimeout(beepLoop, SILENCE_CHECK_MS);
      return;
    }
    playBeep(ctx, beepFrequency(speed, target));
    beepTimeoutRef.current = setTimeout(beepLoop, beepIntervalMs(speed, target));
  }, [ensureAudioCtx, vma]);

  useEffect(() => {
    if (status === "running" && (current.kind === "work" || current.kind === "recup")) beepLoop();
    return () => { if (beepTimeoutRef.current) clearTimeout(beepTimeoutRef.current); };
  }, [status, current.kind, qIndex, beepLoop]);

  // --- Gong sur changement de phase : départ de run, fin de run (récup'), ou pause de série ---
  const prevKindRef = useRef(null);
  useEffect(() => {
    if (screen !== "run") { prevKindRef.current = null; return; }
    const prev = prevKindRef.current;
    if (prev !== null && prev !== current.kind) {
      const ctx = ensureAudioCtx();
      const boundary = prev === "restSeries" || current.kind === "restSeries";
      if (boundary) {
        playGong(ctx, 2);
      } else if (current.kind === "work") {
        playGongStart(ctx);
      } else if (current.kind === "recup") {
        playGongStop(ctx);
      } else {
        playGong(ctx, 1);
      }
      if (current.kind === "finished") {
        setTimeout(() => playApplause(ctx, 3), 400);
      }
    }
    prevKindRef.current = current.kind;
  }, [screen, current.kind, ensureAudioCtx]);

  // --- Actions : configuration manuelle ---
  function updateRepType(id, patch) {
    setRepTypes(list => list.map(rt => rt.id === id ? { ...rt, ...patch } : rt));
  }
  function toggleRepType(id) {
    setRepTypes(list => list.map(rt => rt.id === id ? { ...rt, enabled: !rt.enabled } : rt));
  }
  function addRepType() {
    setRepTypes(list => [...list, emptyRepType(nextRepId(list.length))]);
  }
  function removeRepType(id) {
    setRepTypes(list => list.length > 1 ? list.filter(rt => rt.id !== id) : list);
    setSeriesList(list => list.map(s => ({ ...s, blocks: s.blocks.filter(b => b.repTypeId !== id) })));
  }
  function addSeries() {
    setSeriesList(list => [...list, newSeries(list.length + 1)]);
  }
  function removeSeries(id) {
    setSeriesList(list => list.filter(s => s.id !== id));
  }
  function addBlockToSeries(seriesId, repTypeId) {
    setSeriesList(list => list.map(s => s.id === seriesId
      ? { ...s, blocks: [...s.blocks, { repTypeId, count: 1 }] }
      : s));
  }
  function updateBlock(seriesId, blockIdx, patch) {
    setSeriesList(list => list.map(s => s.id === seriesId
      ? { ...s, blocks: s.blocks.map((b, i) => i === blockIdx ? { ...b, ...patch } : b) }
      : s));
  }
  function removeBlock(seriesId, blockIdx) {
    setSeriesList(list => list.map(s => s.id === seriesId
      ? { ...s, blocks: s.blocks.filter((_, i) => i !== blockIdx) }
      : s));
  }
  function updateSeries(seriesId, patch) {
    setSeriesList(list => list.map(s => s.id === seriesId ? { ...s, ...patch } : s));
  }

  function resetAcc() {
    acc.current = {
      work: { dist: 0, time: 0 }, recup: { dist: 0, time: 0 },
      restSeries: { dist: 0, time: 0 }, warmupFinal: { dist: 0, time: 0 },
      maxSpeed: 0,
    };
    raceStartFiredRef.current = false;
    recupTextFiredRef.current = false;
    tracePointsRef.current = [];
    speedSmootherRef.current = createSpeedSmoother();
    lastRepRecapRef.current = null;
    lastSeriesRecapRef.current = null;
    seriesWorkAccRef.current = { actualDist: 0, theoreticalDist: 0 };
  }

  function startManualSession() {
    const activeTypes = repTypes.filter(rt => rt.enabled);
    const validSeries = seriesList
      .map(s => ({ ...s, blocks: s.blocks.filter(b => activeTypes.some(rt => rt.id === b.repTypeId)) }))
      .filter(s => s.blocks.length > 0);
    if (activeTypes.length === 0 || validSeries.length === 0) return;
    const q = buildManualQueue({
      repTypes: activeTypes, seriesList: validSeries,
      globalRepeatCount, warmupSec, finalRecupSec, startLatencySec,
    });
    resetAcc();
    distanceRef.current = 0;
    clearActiveSession(storage, ACTIVE_SESSION_KEY);
    setQueue(q);
    setQIndex(0);
    setSecondsLeft(q[0]?.seconds || 0);
    setScreen("run");
    setStatus("running");
  }

  function startHazardousSession() {
    const q = generateHazardousQueue({
      warmupSec: hzWarmupSec, workTotalSec: hzWorkTotalSec, finalRecupSec: hzFinalRecupSec,
    });
    resetAcc();
    distanceRef.current = 0;
    clearActiveSession(storage, ACTIVE_SESSION_KEY);
    setQueue(q);
    setQIndex(0);
    // décompte façon décollage de fusée avant de révéler l'écran de course
    setRocketCount(10);
    setScreen("run");
    setStatus("paused");
  }

  // Sauvegarde la configuration en cours dans la bibliothèque, sans la lancer,
  // pour pouvoir la reprendre et la réaliser un autre jour (via "Refaire cette séance").
  async function savePreparedSession() {
    setPrepStatus("saving");
    try {
      let q, mode, config;
      if (configMode === "manual") {
        const activeTypes = repTypes.filter(rt => rt.enabled);
        const validSeries = seriesList
          .map(s => ({ ...s, blocks: s.blocks.filter(b => activeTypes.some(rt => rt.id === b.repTypeId)) }))
          .filter(s => s.blocks.length > 0);
        if (activeTypes.length === 0 || validSeries.length === 0) { setPrepStatus("error"); return; }
        q = buildManualQueue({
          repTypes: activeTypes, seriesList: validSeries,
          globalRepeatCount, warmupSec, finalRecupSec, startLatencySec,
        });
        mode = "manual";
        config = { repTypes: activeTypes, seriesList, globalRepeatCount, warmupSec, finalRecupSec, startLatencySec };
      } else {
        q = generateHazardousQueue({
          warmupSec: hzWarmupSec, workTotalSec: hzWorkTotalSec, finalRecupSec: hzFinalRecupSec,
        });
        mode = "hazardous";
        config = { warmupSec: hzWarmupSec, workTotalSec: hzWorkTotalSec, finalRecupSec: hzFinalRecupSec };
      }
      const id = `fp-${Date.now()}`;
      const payload = {
        id,
        title: prepTitle.trim() || (mode === "hazardous" ? "Séance Hazardous préparée" : "Séance Full Power préparée"),
        mode,
        savedAt: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        comment: "",
        vma,
        queue: q,
        config,
        totals: null, // pas encore réalisée
      };
      const res = await storage.set(`fullpower-sessions:${id}`, JSON.stringify(payload));
      setPrepStatus(res ? "saved" : "error");
      if (res) setPrepTitle("");
    } catch {
      setPrepStatus("error");
    }
  }

  useEffect(() => {
    if (rocketCount === null) return;
    if (rocketCount === 0) {
      playGunshot(ensureAudioCtx());
      const t = setTimeout(() => {
        setRocketCount(null);
        setSecondsLeft(queueRef.current[0]?.seconds || 0);
        setStatus("running");
      }, 700);
      return () => clearTimeout(t);
    }
    playCountdownBeep(ensureAudioCtx(), rocketCount <= 3);
    const t = setTimeout(() => setRocketCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [rocketCount, ensureAudioCtx]);

  function togglePause() { setStatus(s => s === "running" ? "paused" : "running"); }
  function stopSession() {
    setStatus("paused");
    setScreen("config");
    setRocketCount(null);
    if (beepTimeoutRef.current) clearTimeout(beepTimeoutRef.current);
    if (rocketTimeoutRef.current) clearTimeout(rocketTimeoutRef.current);
    clearActiveSession(storage, ACTIVE_SESSION_KEY);
  }

  async function saveSession() {
    setSaveStatus("saving");
    try {
      const id = `fp-${Date.now()}`;
      const payload = {
        id,
        title: saveTitle.trim() || (isHazardous ? "Séance Hazardous" : "Séance Full Power"),
        mode: isHazardous ? "hazardous" : "manual",
        savedAt: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        comment: saveComment,
        vma,
        queue, // séquence exacte jouée, pour pouvoir refaire la séance à l'identique
        config: isHazardous
          ? { warmupSec: hzWarmupSec, workTotalSec: hzWorkTotalSec, finalRecupSec: hzFinalRecupSec }
          : { repTypes: repTypes.filter(rt => rt.enabled), seriesList, globalRepeatCount, warmupSec, finalRecupSec, startLatencySec },
        totals: {
          workDist: acc.current.work.dist, workTime: acc.current.work.time,
          recupDist: acc.current.recup.dist, recupTime: acc.current.recup.time,
          maxSpeed: acc.current.maxSpeed,
          workAvgSpeed, workAvgPctVma, sessionCharge,
          totalSessionTime, totalDistanceAll,
          primaryZone: { label: primaryZone.label, effect: primaryZone.effect },
        },
      };
      await storage.set(`fullpower-sessions:${id}`, JSON.stringify(payload));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  async function loadLibrary() {
    setLibraryLoading(true);
    try {
      const listRes = await storage.list("fullpower-sessions:");
      const keys = listRes?.keys || [];
      const items = [];
      for (const k of keys) {
        try {
          const r = await storage.get(k);
          if (r?.value) items.push(JSON.parse(r.value));
        } catch { /* ignore */ }
      }
      const order = await getOrder(storage, "fullpower-library-order");
      const ordered = applyOrder(items, order);
      setLibrary(ordered);
      await setOrder(storage, "fullpower-library-order", ordered.map(i => i.id));
    } catch { /* ignore */ }
    setLibraryLoading(false);
  }
  function openLibrary() { setScreen("library"); loadLibrary(); }

  async function moveLibraryItem(id, direction) {
    const idx = library.findIndex(s => s.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= library.length) return;
    const reordered = [...library];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setLibrary(reordered);
    await setOrder(storage, "fullpower-library-order", reordered.map(i => i.id));
  }

  async function deleteLibraryItem(id) {
    try { await storage.delete(`fullpower-sessions:${id}`); } catch { /* ignore */ }
    loadLibrary();
  }

  function exportLibrarySession(saved) {
    exportSessionToFile(saved, "fractionne-gps-pro-fullpower");
  }

  function triggerImport() {
    setImportStatus(null);
    importInputRef.current?.click();
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = await readSessionFile(file);
      if (parsed.exportKind !== "fractionne-gps-pro-fullpower") {
        setImportStatus("error-kind");
        return;
      }
      const saved = parsed.session;
      const id = `fp-${Date.now()}`;
      const payload = { ...saved, id, savedAt: Date.now() };
      await storage.set(`fullpower-sessions:${id}`, JSON.stringify(payload));
      setImportStatus(null);
      await loadLibrary();
    } catch {
      setImportStatus("error-format");
    }
  }

  function openLibraryDetail(saved) {
    setLibraryDetail(saved);
    setScreen("libraryDetail");
  }

  // Charge la configuration d'une séance sauvegardée sur l'écran de paramétrage (sans la
  // lancer), pour pouvoir l'adapter avant de démarrer — plutôt qu'une relance immédiate.
  function loadSessionConfig(saved) {
    if (!saved) return;
    setVma(saved.vma ?? vma);
    if (saved.mode === "hazardous") {
      const c = saved.config || {};
      setConfigMode("hazardous");
      setHzWarmupSec(c.warmupSec ?? 300);
      setHzWorkTotalSec(c.workTotalSec ?? 1200);
      setHzFinalRecupSec(c.finalRecupSec ?? 180);
    } else {
      const c = saved.config || {};
      setConfigMode("manual");
      setRepTypes(c.repTypes && c.repTypes.length ? c.repTypes : [emptyRepType("A")]);
      setSeriesList(c.seriesList && c.seriesList.length ? c.seriesList : [newSeries(1)]);
      setGlobalRepeatCount(c.globalRepeatCount ?? 1);
      setWarmupSec(c.warmupSec ?? 300);
      setFinalRecupSec(c.finalRecupSec ?? 180);
      setStartLatencySec(c.startLatencySec ?? 4);
    }
    setScreen("config");
  }

  // Relance la séance sauvegardée à l'identique (même file de phases, même VMA)
  function replaySavedSession(saved) {
    if (!saved?.queue?.length) return;
    resetAcc();
    distanceRef.current = 0;
    clearActiveSession(storage, ACTIVE_SESSION_KEY);
    setVma(saved.vma ?? vma);
    setQueue(saved.queue);
    setQIndex(0);
    setSaveComment("");
    setSaveTitle("");
    setSaveStatus("idle");
    if (saved.mode === "hazardous") {
      setScreen("run");
      setStatus("paused");
      setRocketCount(10);
    } else {
      setSecondsLeft(saved.queue[0]?.seconds || 0);
      setScreen("run");
      setStatus("running");
    }
  }

  const totalWorkTime = acc.current.work.time;
  const totalRecupTime = acc.current.recup.time;
  const workAvgSpeed = totalWorkTime > 0 ? (acc.current.work.dist / totalWorkTime) * 3.6 : 0;
  const workAvgPctVma = vma > 0 ? (workAvgSpeed / vma) * 100 : 0;
  const primaryZone = classifyZone(workAvgPctVma);
  const sessionCharge = segmentCharge(acc.current.work.dist, totalWorkTime, vma);
  const totalSessionTime = ["work", "recup", "restSeries", "warmupFinal"]
    .reduce((sum, k) => sum + acc.current[k].time, 0);
  const totalDistanceAll = ["work", "recup", "restSeries", "warmupFinal"]
    .reduce((sum, k) => sum + acc.current[k].dist, 0);
  const workDistanceAll = acc.current.work.dist;
  // Distance théorique totale de travail (somme sur toute la file de phases "work" déjà
  // construite), pour la comparer à la distance réellement parcourue en fin de séance.
  const theoreticalTotalWorkDist = queue.reduce((sum, p) => (
    p.kind === "work" ? sum + theoreticalDistanceMeters(vma * ((p.pct || 0) / 100), p.seconds) : sum
  ), 0);
  // Durée totale planifiée = somme des durées de toutes les phases de la file (connue dès le
  // départ, y compris en Hazardous Mode où elle est juste cachée à l'écran).
  const totalPlannedSeconds = queue.reduce((sum, p) => sum + (p.seconds || 0), 0);
  const sessionSecondsRemaining = Math.max(0, totalPlannedSeconds - totalSessionTime);

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-fuchsia-950 via-purple-950 to-slate-950 text-slate-100 flex flex-col items-center px-4 py-6 gap-6">
      {resumeSnapshot && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center px-6">
          <div className="w-full max-w-xs bg-slate-900 border border-fuchsia-500/40 rounded-2xl p-5 flex flex-col items-center gap-4">
            <Zap size={24} className="text-fuchsia-400" />
            <p className="text-sm text-slate-200 text-center">
              Une séance Full Power a été interrompue (écran éteint ou appli fermée). Veux-tu la reprendre là où tu t'étais arrêté ?
            </p>
            <div className="flex w-full gap-2">
              <button
                onClick={discardSnapshot}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-slate-200"
              >
                Ignorer
              </button>
              <button
                onClick={resumeFromSnapshot}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white"
              >
                Reprendre
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="w-full max-w-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-fuchsia-400" />
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-purple-300 bg-clip-text text-transparent">
            Full Power
          </h1>
          <span className="text-[9px] font-normal text-slate-600">v{APP_VERSION}</span>
        </div>
        {screen !== "config" && screen !== "run" && (
          <button
            onClick={() => setScreen(screen === "libraryDetail" ? "library" : "config")}
            className="text-slate-400 flex items-center gap-1 text-sm"
          >
            <ArrowLeft size={14} /> Retour
          </button>
        )}
        {screen === "config" && (
          <button onClick={openLibrary} className="text-fuchsia-300 flex items-center gap-1 text-sm">
            <BookOpen size={14} /> Bibliothèque
          </button>
        )}
      </header>

      {screen === "config" && (
        <div className="w-full max-w-md space-y-5">
          <div className="sticky top-0 z-10 bg-fuchsia-500/10 border border-fuchsia-500/40 rounded-2xl px-4 py-3 flex items-center justify-between backdrop-blur">
            <span className="text-xs uppercase tracking-wide text-fuchsia-300 flex items-center gap-1.5">
              <Sliders size={14} /> Durée totale estimée
            </span>
            <span className="font-mono font-bold text-lg text-fuchsia-300 tabular-nums">
              {fmtDuration(configMode === "manual" ? manualEstimatedTotalSec : (Number(hzWarmupSec) || 0) + (Number(hzWorkTotalSec) || 0) + (Number(hzFinalRecupSec) || 0))}
            </span>
          </div>

          <div className="flex bg-slate-900/60 rounded-xl p-1 border border-fuchsia-500/30">
            <button
              onClick={() => setConfigMode("manual")}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold ${configMode === "manual" ? "bg-fuchsia-600 text-white" : "text-slate-400"}`}
            >
              Configuration manuelle
            </button>
            <button
              onClick={() => setConfigMode("hazardous")}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 ${configMode === "hazardous" ? "bg-purple-600 text-white" : "text-slate-400"}`}
            >
              <Shuffle size={14} /> Hazardous Mode
            </button>
          </div>

          <div className="bg-slate-900/70 rounded-2xl p-4 border border-fuchsia-500/20">
            <label className="text-sm text-slate-300">VMA (km/h)</label>
            <input
              type="number" step="0.1" value={vma}
              onChange={e => setVma(parseFloat(e.target.value) || 0)}
              className="w-full mt-1 bg-slate-800 rounded-lg px-3 py-2 text-lg font-mono outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>

          {configMode === "manual" ? (
            <>
              <div className="bg-slate-900/70 rounded-2xl p-4 border border-fuchsia-500/20 space-y-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Types de répétition</p>
                {repTypes.map(rt => {
                  const c = repColorFor(repTypes, rt.id);
                  return (
                    <div key={rt.id} className={`rounded-xl border p-3 ${rt.enabled ? c.border : "border-slate-800"} ${rt.enabled ? c.bg : "bg-slate-900"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={rt.enabled} onChange={() => toggleRepType(rt.id)} className={c.accent} />
                          <span className={`font-bold ${c.text}`}>Type {rt.id}</span>
                        </label>
                        {repTypes.length > 1 && (
                          <button onClick={() => removeRepType(rt.id)} className="text-slate-500"><Trash2 size={14} /></button>
                        )}
                      </div>
                      {rt.enabled && (
                        <div className="grid grid-cols-2 gap-2">
                          <MiniField label="%VMA travail" value={rt.workPct} onChange={v => updateRepType(rt.id, { workPct: v })} />
                          <DurationField label="Temps travail" valueSec={rt.workSec} onChange={v => updateRepType(rt.id, { workSec: v })} />
                          <MiniField label="%VMA récup" value={rt.recupPct} onChange={v => updateRepType(rt.id, { recupPct: v })} />
                          <DurationField label="Temps récup" valueSec={rt.recupSec} onChange={v => updateRepType(rt.id, { recupSec: v })} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={addRepType}
                  className="w-full flex items-center justify-center gap-1.5 text-sm py-2 rounded-xl border border-dashed border-fuchsia-500/40 text-fuchsia-300"
                >
                  <Plus size={14} /> Ajouter un type de répétition
                </button>
              </div>

              <div className="bg-slate-900/70 rounded-2xl p-4 border border-fuchsia-500/20 space-y-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Séries — enchaînement des types</p>
                {seriesList.map((s, sIdx) => (
                  <div key={s.id} className="rounded-xl border border-slate-800 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <input
                        value={s.label} onChange={e => updateSeries(s.id, { label: e.target.value })}
                        className="bg-transparent font-semibold text-sm outline-none border-b border-dashed border-slate-700"
                      />
                      {seriesList.length > 1 && (
                        <button onClick={() => removeSeries(s.id)} className="text-slate-500"><Trash2 size={14} /></button>
                      )}
                    </div>

                    {s.blocks.map((b, bIdx) => (
                      <div key={bIdx} className="flex items-center gap-2">
                        <span className={`text-xs font-bold w-5 ${repColorFor(repTypes, b.repTypeId).text}`}>{b.repTypeId}</span>
                        <span className="text-xs text-slate-400">×</span>
                        <select
                          value={b.count}
                          onChange={e => updateBlock(s.id, bIdx, { count: parseInt(e.target.value) || 1 })}
                          className="w-16 bg-slate-800 rounded-lg px-2 py-1 text-sm font-mono outline-none"
                        >
                          {Array.from({ length: 40 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <span className="text-xs text-slate-500">répétition(s)</span>
                        <button onClick={() => removeBlock(s.id, bIdx)} className="ml-auto text-slate-500"><Trash2 size={13} /></button>
                      </div>
                    ))}

                    <div className="flex gap-1.5 flex-wrap">
                      {repTypes.filter(rt => rt.enabled).map(rt => (
                        <button
                          key={rt.id}
                          onClick={() => addBlockToSeries(s.id, rt.id)}
                          className={`text-xs px-2 py-1 rounded-lg border ${repColorFor(repTypes, rt.id).border} ${repColorFor(repTypes, rt.id).text} flex items-center gap-1`}
                        >
                          <Plus size={11} /> {rt.id}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                      <MiniField label="Répéter cette série ×" value={s.repeatCount} onChange={v => updateSeries(s.id, { repeatCount: v })} />
                      <DurationField label="Pause après série" valueSec={s.restSeriesSec} onChange={v => updateSeries(s.id, { restSeriesSec: v })} />
                    </div>
                  </div>
                ))}
                <button onClick={addSeries} className="w-full text-sm text-fuchsia-300 border border-dashed border-fuchsia-500/40 rounded-xl py-2 flex items-center justify-center gap-1">
                  <Plus size={14} /> Ajouter une série
                </button>
                <MiniField label="Boucler tout l'enchaînement de séries ×" value={globalRepeatCount} onChange={setGlobalRepeatCount} full />
              </div>

              <div className="bg-slate-900/70 rounded-2xl p-4 border border-fuchsia-500/20 grid grid-cols-2 gap-3">
                <MiniField label="Échauffement (s)" value={warmupSec} onChange={setWarmupSec} />
                <MiniField label="Récup' finale (s)" value={finalRecupSec} onChange={setFinalRecupSec} />
                <MiniField
                  label="Latence avant régulation (1ère rép. de chaque série, s)"
                  value={startLatencySec}
                  onChange={setStartLatencySec}
                  full
                />
                <p className="text-xs text-slate-500 col-span-2 -mt-1">
                  Soit {fmtTime(warmupSec)} d'échauffement et {fmtTime(finalRecupSec)} de récup' finale.
                </p>
                <p className="text-xs text-slate-500 col-span-2">
                  La latence correspond à la phase d'accélération au départ arrêté : pendant ce délai, choisi par toi, aucun bip de régulation ne retentit. Elle s'applique sur la 1ère répétition de chaque série.
                </p>
              </div>

              <SimToggle simMode={simMode} setSimMode={setSimMode} />

              <div className="bg-slate-900/70 rounded-2xl p-3 border border-slate-800 space-y-2">
                <input
                  type="text" value={prepTitle} onChange={e => { setPrepTitle(e.target.value); setPrepStatus("idle"); }}
                  placeholder="Titre (optionnel)"
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500"
                />
                <button
                  onClick={savePreparedSession}
                  disabled={prepStatus === "saving"}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-200 text-sm font-semibold rounded-xl py-2 flex items-center justify-center gap-2"
                >
                  {prepStatus === "saved" ? <><Check size={16} /> Séance sauvegardée</> : <><Save size={16} /> Sauvegarder pour plus tard</>}
                </button>
                {prepStatus === "error" && (
                  <p className="text-xs text-rose-400">Vérifie ta configuration (au moins un type de répétition actif dans une série), ou réessaie.</p>
                )}
              </div>

              <button
                onClick={startManualSession}
                className="w-full bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2"
              >
                <Play size={18} /> Démarrer la séance
              </button>
            </>
          ) : (
            <>
              <div className="bg-slate-900/70 rounded-2xl p-4 border border-purple-500/30 space-y-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Hazardous Mode</p>
                <p className="text-xs text-slate-500">
                  Tu ne verras pas la séance à l'avance. Indique juste les trois durées ci-dessous, l'application génère le reste au hasard, de façon cohérente.
                </p>
                <MiniField label="Échauffement (s)" value={hzWarmupSec} onChange={setHzWarmupSec} full />
                <MiniField label="Temps de travail désiré (s)" value={hzWorkTotalSec} onChange={setHzWorkTotalSec} full />
                <MiniField label="Récup' de fin de séance (s)" value={hzFinalRecupSec} onChange={setHzFinalRecupSec} full />
                <p className="text-xs text-slate-500">
                  Soit {fmtTime(hzWarmupSec)} d'échauffement, {fmtTime(hzWorkTotalSec)} de travail et {fmtTime(hzFinalRecupSec)} de récup' finale.
                </p>
              </div>

              <SimToggle simMode={simMode} setSimMode={setSimMode} />

              <div className="bg-slate-900/70 rounded-2xl p-3 border border-purple-500/30 space-y-2">
                <input
                  type="text" value={prepTitle} onChange={e => { setPrepTitle(e.target.value); setPrepStatus("idle"); }}
                  placeholder="Titre (optionnel)"
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={savePreparedSession}
                  disabled={prepStatus === "saving"}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-200 text-sm font-semibold rounded-xl py-2 flex items-center justify-center gap-2"
                >
                  {prepStatus === "saved" ? <><Check size={16} /> Séance sauvegardée</> : <><Save size={16} /> Sauvegarder pour plus tard</>}
                </button>
                {prepStatus === "error" && (
                  <p className="text-xs text-rose-400">L'enregistrement a échoué, réessaie.</p>
                )}
              </div>

              <button
                onClick={startHazardousSession}
                className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:opacity-90 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2"
              >
                <Shuffle size={18} /> Lancer le Hazardous Mode
              </button>
            </>
          )}
        </div>
      )}

      {screen === "library" && (
        <div className="w-full max-w-md space-y-3">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={triggerImport}
            className="w-full flex items-center justify-center gap-2 bg-fuchsia-500/10 border border-fuchsia-500/40 text-fuchsia-300 text-sm font-semibold rounded-xl py-2.5"
          >
            <Upload size={16} /> Importer
          </button>
          {importStatus === "error-format" && (
            <p className="text-xs text-rose-400 text-center">Fichier illisible ou invalide.</p>
          )}
          {importStatus === "error-kind" && (
            <p className="text-xs text-rose-400 text-center">Ce fichier vient du mode Simple, pas du mode Full Power.</p>
          )}
          {importStatus === "error" && (
            <p className="text-xs text-rose-400 text-center">Impossible d'enregistrer la séance importée.</p>
          )}
          {libraryLoading && <p className="text-sm text-slate-500 text-center">Chargement...</p>}
          {!libraryLoading && library.length === 0 && (
            <p className="text-sm text-slate-500 text-center">Aucune séance Full Power enregistrée.</p>
          )}
          {library.map((s, idx) => (
            <div key={s.id} className="bg-slate-900/70 rounded-2xl p-4 border border-fuchsia-500/20 space-y-1.5">
              <div className="flex justify-between items-start gap-2">
                <button onClick={() => openLibraryDetail(s)} className="text-left flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm block">{s.title || "Séance sans nom"}</span>
                    {!s.totals && (
                      <span className="text-[10px] uppercase tracking-wide bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded-full px-2 py-0.5">
                        Préparée
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500 block">{s.date}</span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => moveLibraryItem(s.id, -1)} disabled={idx === 0}
                    className="text-slate-500 hover:text-slate-200 disabled:opacity-30">
                    <ChevronUp size={16} />
                  </button>
                  <button onClick={() => moveLibraryItem(s.id, 1)} disabled={idx === library.length - 1}
                    className="text-slate-500 hover:text-slate-200 disabled:opacity-30">
                    <ChevronDown size={16} />
                  </button>
                  <button onClick={() => exportLibrarySession(s)} className="text-slate-500 hover:text-sky-400">
                    <Download size={16} />
                  </button>
                  <button onClick={() => deleteLibraryItem(s.id)} className="text-slate-500 hover:text-rose-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <button onClick={() => openLibraryDetail(s)} className="text-left w-full space-y-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full inline-block ${s.mode === "hazardous" ? "bg-purple-500/20 text-purple-300" : "bg-fuchsia-500/20 text-fuchsia-300"}`}>
                  {s.mode === "hazardous" ? "Hazardous" : "Manuel"}
                </span>
                <p className="text-xs text-slate-400">
                  {s.totals
                    ? <>Travail : {fmtDuration(s.totals?.workTime || 0)} · Vmax : {(s.totals?.maxSpeed || 0).toFixed(1)} km/h</>
                    : <>Durée totale estimée : {fmtDuration(estimateQueueTotalSec(s.queue))}</>}
                </p>
                {s.comment && <p className="text-sm italic text-slate-300">"{s.comment}"</p>}
              </button>
            </div>
          ))}
        </div>
      )}

      {screen === "libraryDetail" && libraryDetail && (
        <div className="w-full max-w-md space-y-4">
          <div className="bg-slate-900/70 rounded-2xl p-5 border border-fuchsia-500/20 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{libraryDetail.title || "Séance sans nom"}</h2>
              <div className="flex items-center gap-1.5">
                {!libraryDetail.totals && (
                  <span className="text-[10px] uppercase tracking-wide bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded-full px-2 py-0.5">
                    Préparée
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${libraryDetail.mode === "hazardous" ? "bg-purple-500/20 text-purple-300" : "bg-fuchsia-500/20 text-fuchsia-300"}`}>
                  {libraryDetail.mode === "hazardous" ? "Hazardous" : "Manuel"}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500">{libraryDetail.date}</p>
            {!libraryDetail.totals && (
              <p className="text-xs text-slate-500">Durée totale estimée : {fmtDuration(estimateQueueTotalSec(libraryDetail.queue))}</p>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500">Vitesses</p>
              <StatRow label="Vitesse maximale atteinte" value={`${(libraryDetail.totals?.maxSpeed || 0).toFixed(1)} km/h · ${allureFromKmh(libraryDetail.totals?.maxSpeed || 0)}`} />
              <StatRow label="Vitesse moy. de travail" value={`${(libraryDetail.totals?.workAvgSpeed || 0).toFixed(1)} km/h`}
                sub={`${(libraryDetail.totals?.workAvgPctVma || 0).toFixed(0)}% VMA`} />
            </div>

            {libraryDetail.totals?.primaryZone && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Objectif atteint</p>
                <StatRow label="Zone principale" value={libraryDetail.totals.primaryZone.label} sub={libraryDetail.totals.primaryZone.effect} />
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500">Charge</p>
              <StatRow label="Indicateur de charge" value={(libraryDetail.totals?.sessionCharge || 0).toFixed(1)} sub="1 min à 100% VMA = charge de 1" />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500">Temps &amp; distances</p>
              <StatRow label="Temps total" value={fmtDuration(libraryDetail.totals?.totalSessionTime || 0)} />
              <StatRow label="Temps de travail" value={fmtDuration(libraryDetail.totals?.workTime || 0)} />
              <StatRow label="Temps de récupération" value={fmtDuration(libraryDetail.totals?.recupTime || 0)} />
              <StatRow label="Distance totale" value={fmtDistance(libraryDetail.totals?.totalDistanceAll || 0)} />
            </div>

            {libraryDetail.comment && (
              <div className="pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Commentaire</p>
                <p className="text-sm italic text-slate-300">"{libraryDetail.comment}"</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => loadSessionConfig(libraryDetail)}
                className="flex-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2"
              >
                <RotateCcw size={18} /> Charger cette séance
              </button>
              <button
                onClick={() => exportLibrarySession(libraryDetail)}
                className="bg-slate-800 text-sky-400 rounded-xl px-4 flex items-center justify-center text-sm"
              >
                <Download size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "run" && rocketCount !== null && (
        <div className="w-full max-w-md flex flex-col items-center justify-center gap-4 py-16">
          <p className="text-sm uppercase tracking-[0.3em] text-purple-300">Préparation</p>
          <div className={`text-8xl font-mono font-black ${rocketCount <= 3 ? "text-rose-500 animate-pulse" : "text-fuchsia-400"}`}>
            {rocketCount}
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Décollage imminent</p>
        </div>
      )}

      {screen === "run" && rocketCount === null && (
        <div className="w-full max-w-md flex flex-col items-center gap-5">
          {!isHazardous && (
            <p className="text-xs text-slate-500 text-center">
              {current.kind === "finished" ? "Séance terminée"
                : current.kind === "warmup" ? "Échauffement"
                : current.kind === "finalRecup" ? "Récupération finale"
                : current.kind === "restSeries" ? "Pause entre séries"
                : `${current.seriesLabel || ""} · Type ${current.repTypeId}`}
            </p>
          )}

          {!isHazardous && (
            <div className={`w-full rounded-2xl border ${PHASE_META[current.kind].border} ${PHASE_META[current.kind].bg} p-6 flex flex-col items-center`}>
              <span className={`text-sm font-bold tracking-widest ${PHASE_META[current.kind].color}`}>{PHASE_META[current.kind].label}</span>
              <div className="flex items-end gap-3 mt-2">
                <span className="text-6xl font-mono font-bold tabular-nums">{fmtTime(secondsLeft)}</span>
                {(current.kind === "work" || current.kind === "recup") && current.repsInSeriesTotal > 0 && (
                  <span className="text-lg font-mono font-semibold text-slate-400 pb-1.5 tabular-nums">
                    {current.repIndexInSeries}/{current.repsInSeriesTotal}
                  </span>
                )}
              </div>
            </div>
          )}

          {isHazardous && current.kind !== "finished" && (
            <div className="w-full rounded-2xl border border-fuchsia-500/30 bg-slate-950/60 p-6 flex flex-col items-center">
              <span className="text-6xl font-mono font-bold tabular-nums text-slate-100">{fmtTime(secondsLeft)}</span>
            </div>
          )}

          {/* Compteurs permanents : distance depuis le début de la séance, distance de travail
              uniquement, et temps restant global — visibles sur toutes les phases, y compris
              en Hazardous Mode (ça ne révèle pas la structure cachée de la séance). */}
          {current.kind !== "finished" && (
            <div className="w-full grid grid-cols-3 gap-2">
              <div className="bg-slate-900/70 rounded-xl border border-fuchsia-500/20 p-3 flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wide text-slate-500 text-center">Distance séance</span>
                <span className="text-lg font-mono font-bold mt-1 tabular-nums">{fmtDistance(totalDistanceAll)}</span>
              </div>
              <div className="bg-slate-900/70 rounded-xl border border-fuchsia-500/20 p-3 flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wide text-slate-500 text-center">Distance travail</span>
                <span className="text-lg font-mono font-bold mt-1 tabular-nums text-fuchsia-300">{fmtDistance(workDistanceAll)}</span>
              </div>
              <div className="bg-slate-900/70 rounded-xl border border-fuchsia-500/20 p-3 flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wide text-slate-500 text-center">Reste séance</span>
                <span className="text-lg font-mono font-bold mt-1 tabular-nums text-slate-300">{fmtTime(sessionSecondsRemaining)}</span>
              </div>
            </div>
          )}

          {current.kind !== "finished" && (current.kind === "work" || current.kind === "recup") && inLatency ? (
            <div className="w-full bg-slate-900/70 rounded-2xl border border-fuchsia-500/20 p-4 flex flex-col items-center">
              <div className="py-6 text-center">
                <p className="text-sm font-semibold text-amber-400">Phase d'accélération</p>
                <p className="text-4xl font-mono font-bold mt-1">{latencyRemaining}s</p>
                <p className="text-xs text-slate-500 mt-1">Bips de régulation avant {latencyRemaining}s</p>
              </div>
            </div>
          ) : current.kind !== "finished" && (current.kind === "work" || current.kind === "recup") && (
            <div className="w-full bg-slate-900/70 rounded-2xl border border-fuchsia-500/20 p-4 flex flex-col items-center">
              <NeedleGauge currentSpeed={simMode ? simSpeed : liveSpeed} targetSpeed={targetSpeed} />
              <p className="text-[10px] text-slate-600 -mt-1">Repère jaune = objectif, au milieu de la zone verte</p>
              <div className="flex justify-between w-full mt-1 text-center">
                <div>
                  <p className="text-5xl font-mono font-black leading-none tabular-nums">{allureFromKmh(simMode ? simSpeed : liveSpeed)}</p>
                  <p className="text-xs text-slate-500 mt-1.5">Allure instantanée</p>
                  <p className="text-sm font-mono text-slate-400 mt-1">
                    {(simMode ? simSpeed : liveSpeed).toFixed(1)} km/h · {vma > 0 ? (((simMode ? simSpeed : liveSpeed) / vma) * 100).toFixed(0) : 0}% VMA
                  </p>
                </div>
                {/* %VMA cible affiché même en Hazardous Mode : c'est l'objectif de la phase
                    en cours, pas une info sur la suite de la séance — la surprise reste intacte. */}
                <div>
                  <p className="text-5xl font-mono font-black leading-none tabular-nums text-fuchsia-300">{allureFromKmh(targetSpeed)}</p>
                  <p className="text-xs text-slate-500 mt-1.5">Allure cible</p>
                  <p className="text-sm font-mono mt-1 text-fuchsia-300">{targetSpeed.toFixed(1)} km/h · {current.pct}% VMA</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                {simMode ? <Sliders size={12} /> : gpsStatus === "active" ? <MapPin size={12} className="text-emerald-400" /> : <MapPinOff size={12} className="text-rose-400" />}
                {simMode ? "Vitesse simulée" : gpsStatus === "active" ? "GPS actif" : "GPS indisponible"}
              </p>
              {simMode && (
                <input type="range" min="0" max="25" step="0.1" value={simSpeed}
                  onChange={e => setSimSpeed(parseFloat(e.target.value))}
                  className="w-full mt-3 accent-fuchsia-500" />
              )}
            </div>
          )}

          {(current.kind === "warmup" || current.kind === "finalRecup") && (
            <div className="w-full bg-slate-900/70 rounded-2xl border border-fuchsia-500/20 p-6 flex flex-col items-center">
              <span className="text-xs uppercase tracking-widest text-slate-500">%VMA instantané</span>
              <span className="text-5xl font-mono font-bold mt-2 text-fuchsia-300">
                {vma > 0 ? ((liveSpeed / vma) * 100).toFixed(0) : 0}%
              </span>
            </div>
          )}

          {(current.kind === "recup" || current.kind === "restSeries") && lastRepRecapRef.current && (
            <div className="w-full bg-slate-900/70 rounded-2xl border border-fuchsia-500/20 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Récap répétition{lastRepRecapRef.current.repsInSeriesTotal > 0 ? ` ${lastRepRecapRef.current.repIndexInSeries}/${lastRepRecapRef.current.repsInSeriesTotal}` : ""}
              </p>
              <StatRow
                label="Distance parcourue / prévue"
                value={`${fmtDistance(lastRepRecapRef.current.actualDist)} / ${fmtDistance(lastRepRecapRef.current.theoreticalDist)}`}
                sub={lastRepRecapRef.current.theoreticalDist > 0
                  ? `${lastRepRecapRef.current.actualDist >= lastRepRecapRef.current.theoreticalDist ? "+" : ""}${Math.round(((lastRepRecapRef.current.actualDist - lastRepRecapRef.current.theoreticalDist) / lastRepRecapRef.current.theoreticalDist) * 100)}% vs objectif`
                  : undefined}
              />
            </div>
          )}

          {current.kind === "restSeries" && lastSeriesRecapRef.current && (
            <div className="w-full bg-slate-900/70 rounded-2xl border border-violet-500/30 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Récap série{lastSeriesRecapRef.current.seriesLabel ? ` — ${lastSeriesRecapRef.current.seriesLabel}` : ""} (travail uniquement)
              </p>
              <StatRow
                label="Distance parcourue / prévue"
                value={`${fmtDistance(lastSeriesRecapRef.current.actualDist)} / ${fmtDistance(lastSeriesRecapRef.current.theoreticalDist)}`}
                sub={lastSeriesRecapRef.current.theoreticalDist > 0
                  ? `${lastSeriesRecapRef.current.actualDist >= lastSeriesRecapRef.current.theoreticalDist ? "+" : ""}${Math.round(((lastSeriesRecapRef.current.actualDist - lastSeriesRecapRef.current.theoreticalDist) / lastSeriesRecapRef.current.theoreticalDist) * 100)}% vs objectif`
                  : undefined}
              />
            </div>
          )}

          {(current.kind === "recup" || current.kind === "restSeries") && (
            <div className="w-full bg-slate-900/70 rounded-2xl border border-fuchsia-500/20 p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Récap' en cours</p>
              <StatRow label="Distance de travail cumulée" value={fmtDistance(acc.current.work.dist)} />
              <StatRow label="Temps de travail cumulé" value={fmtDuration(acc.current.work.time)} />
              <StatRow label="Temps de récupération cumulé" value={fmtDuration(acc.current.recup.time)} />
            </div>
          )}

          {current.kind === "finished" && (
            <div className="w-full bg-slate-900/70 rounded-2xl border border-fuchsia-500/20 p-5 space-y-4">
              <p className="text-emerald-400 font-semibold text-center">Séance terminée, bravo !</p>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Vitesses</p>
                <StatRow label="Vitesse maximale atteinte" value={`${acc.current.maxSpeed.toFixed(1)} km/h · ${allureFromKmh(acc.current.maxSpeed)}`} />
                <StatRow label="Vitesse moy. de travail" value={`${workAvgSpeed.toFixed(1)} km/h · ${allureFromKmh(workAvgSpeed)}`}
                  sub={`${workAvgPctVma.toFixed(0)}% VMA`} />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Objectif atteint</p>
                <StatRow label="Zone principale" value={primaryZone.label} sub={primaryZone.effect} />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Charge</p>
                <StatRow label="Indicateur de charge" value={sessionCharge.toFixed(1)} sub="1 min à 100% VMA = charge de 1" />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500">Temps &amp; distances</p>
                <StatRow label="Temps total" value={fmtDuration(totalSessionTime)} />
                <StatRow label="Temps de travail" value={fmtDuration(totalWorkTime)} />
                <StatRow label="Temps de récupération" value={fmtDuration(totalRecupTime)} />
                <StatRow label="Distance totale" value={fmtDistance(totalDistanceAll)} />
                <StatRow
                  label="Distance de travail réalisée / prévue"
                  value={`${fmtDistance(workDistanceAll)} / ${fmtDistance(theoreticalTotalWorkDist)}`}
                  sub={theoreticalTotalWorkDist > 0
                    ? `${workDistanceAll >= theoreticalTotalWorkDist ? "+" : ""}${Math.round(((workDistanceAll - theoreticalTotalWorkDist) / theoreticalTotalWorkDist) * 100)}% vs objectif, toutes répétitions de travail confondues (hors récup')`
                    : undefined}
                />
              </div>

              {tracePointsRef.current.length > 5 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Tracé de la séance</p>
                  <TraceMap points={tracePointsRef.current.map(p => ({ ...p, color: traceColorForPoint(p, repTypes) }))} />
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                    {repTypes.map(rt => (
                      <span key={rt.id} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: repColorFor(repTypes, rt.id).hex }} />Type {rt.id}
                      </span>
                    ))}
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: PHASE_TRACE_HEX_FP.restSeries }} />Pause série</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: PHASE_TRACE_HEX_FP.warmup }} />Échauf./récup' finale</span>
                  </div>
                  <a
                    href={googleMapsRouteUrl(tracePointsRef.current)} target="_blank" rel="noopener noreferrer"
                    className="block text-center text-xs text-sky-400 underline underline-offset-2 pt-1"
                  >
                    Ouvrir l'itinéraire dans Google Maps
                  </a>
                  <p className="text-[10px] text-slate-600 text-center">
                    Schéma sans fond de carte, coloré par séquence · le lien Google Maps affiche le vrai fond de carte mais sans ces couleurs.
                  </p>
                </div>
              )}

              <div className="space-y-3 pt-3 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Save size={14} /> Enregistrer dans la bibliothèque Full Power
                </p>
                <input
                  type="text" value={saveTitle} onChange={e => setSaveTitle(e.target.value)}
                  placeholder="Nom de la séance"
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500"
                />
                <textarea
                  value={saveComment} onChange={e => setSaveComment(e.target.value)}
                  rows={3} placeholder="Commentaire sur la séance..."
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500 resize-none"
                />
                <button
                  onClick={saveSession}
                  disabled={saveStatus === "saving" || saveStatus === "saved"}
                  className="w-full bg-gradient-to-r from-fuchsia-600 to-purple-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-2"
                >
                  {saveStatus === "saved" ? <><Check size={16} /> Séance enregistrée</> : <><Save size={16} /> Enregistrer</>}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3 w-full">
            {current.kind !== "finished" ? (
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
            <button onClick={stopSession} className="bg-slate-800 text-slate-300 rounded-xl px-4 flex items-center justify-center">
              <Square size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NeedleGauge({ currentSpeed, targetSpeed }) {
  // Aiguille relative à la cible (0.5x à 1.5x), même logique que le mode Simple : la zone
  // verte (silence) est calée exactement sur la tolérance réelle des bips (±TOLERANCE_RATIO),
  // pour que l'aiguille entre dans le vert pile quand les bips s'arrêtent.
  const ratio = targetSpeed > 0 ? currentSpeed / targetSpeed : 1;
  const clamped = Math.max(0.5, Math.min(1.5, ratio));
  const angle = (clamped - 1) * 180;
  const toleranceAngle = TOLERANCE_RATIO * 180;
  const left = gaugePoint(-90);
  const innerLeft = gaugePoint(-toleranceAngle);
  const innerRight = gaugePoint(toleranceAngle);
  const right = gaugePoint(90);
  return (
    <svg viewBox="0 0 200 110" className="w-56">
      <path d={`M ${left.x} ${left.y} A 85 85 0 0 1 ${innerLeft.x} ${innerLeft.y}`} fill="none" stroke="#c026d3" strokeWidth="10" strokeLinecap="round" />
      <path d={`M ${innerLeft.x} ${innerLeft.y} A 85 85 0 0 1 ${innerRight.x} ${innerRight.y}`} fill="none" stroke="#22c55e" strokeWidth="10" strokeLinecap="round" />
      <path d={`M ${innerRight.x} ${innerRight.y} A 85 85 0 0 1 ${right.x} ${right.y}`} fill="none" stroke="#ec4899" strokeWidth="10" strokeLinecap="round" />
      <GaugeTargetTick color="#facc15" />
      <g transform={`translate(100,100) rotate(${angle})`}>
        <line x1="0" y1="0" x2="0" y2="-75" stroke="#f5d0fe" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="5" fill="#f5d0fe" />
    </svg>
  );
}

function MiniField({ label, value, onChange, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type="number" value={value}
        onChange={e => onChange(parseInt(e.target.value) || 0)}
        className="w-full mt-1 bg-slate-800 rounded-lg px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-fuchsia-500"
      />
    </div>
  );
}

function SimToggle({ simMode, setSimMode }) {
  return (
    <div className="bg-slate-900/70 rounded-2xl p-4 border border-fuchsia-500/20">
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={simMode} onChange={e => setSimMode(e.target.checked)} className="accent-fuchsia-500" />
        Mode simulation (sans GPS, pour tester)
      </label>
    </div>
  );
}
