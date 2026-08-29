import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play, Pause, Square, MapPin, MapPinOff, Sliders, RotateCcw, Save, Check,
  Plus, Trash2, ArrowLeft, BookOpen, Zap, Shuffle, ChevronRight
} from "lucide-react";
import { storage } from "../storage.js";
import {
  fmtDistance, fmtDuration, fmtTime, allureFromKmh,
  playGong, playBeep, playCountdownBeep, playGunshot, playApplause,
  TOLERANCE_RATIO, SILENCE_CHECK_MS, speedRatio, beepIntervalMs, beepFrequency,
  ZONES, classifyZone, segmentCharge, StatRow,
} from "../shared.jsx";
import { buildManualQueue, generateHazardousQueue } from "./engine.js";
import { pickText } from "./personalization.js";

const REP_IDS = ["A", "B", "C", "D"];
const REP_COLORS = {
  A: { text: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/40", accent: "accent-fuchsia-500" },
  B: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/40", accent: "accent-purple-500" },
  C: { text: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/40", accent: "accent-pink-500" },
  D: { text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/40", accent: "accent-violet-500" },
};

const PHASE_META = {
  warmup:     { label: "ÉCHAUFFEMENT", color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/40" },
  work:       { label: "TRAVAIL",      color: "text-fuchsia-300", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/40" },
  recup:      { label: "RÉCUP'",       color: "text-purple-300", bg: "bg-purple-500/10", border: "border-purple-500/40" },
  restSeries: { label: "PAUSE SÉRIE",  color: "text-violet-300", bg: "bg-violet-500/10", border: "border-violet-500/40" },
  finalRecup: { label: "RÉCUPÉRATION FINALE", color: "text-pink-300", bg: "bg-pink-500/10", border: "border-pink-500/40" },
  finished:   { label: "TERMINÉ",      color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40" },
};

function emptyRepType(id) {
  return { id, enabled: id === "A", workPct: 100, workSec: 30, recupPct: 50, recupSec: 30 };
}

function newSeries(idx) {
  return { id: `s${Date.now()}-${idx}`, label: `Série ${idx}`, blocks: [], repeatCount: 1, restSeriesSec: 120 };
}

export default function FullPower({ runnerName, onToast }) {
  const [screen, setScreen] = useState("config"); // config | run | library
  const [configMode, setConfigMode] = useState("manual"); // manual | hazardous

  // --- Config manuelle ---
  const [vma, setVma] = useState(15);
  const [repTypes, setRepTypes] = useState(REP_IDS.map(emptyRepType));
  const [seriesList, setSeriesList] = useState([newSeries(1)]);
  const [globalRepeatCount, setGlobalRepeatCount] = useState(1);
  const [warmupSec, setWarmupSec] = useState(300);
  const [finalRecupSec, setFinalRecupSec] = useState(180);

  // --- Config Hazardous ---
  const [hzWarmupSec, setHzWarmupSec] = useState(300);
  const [hzWorkTotalSec, setHzWorkTotalSec] = useState(1200);
  const [hzFinalRecupSec, setHzFinalRecupSec] = useState(180);

  // --- Bibliothèque ---
  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

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
  const [saveStatus, setSaveStatus] = useState("idle");

  const watchIdRef = useRef(null);
  const audioCtxRef = useRef(null);
  const beepTimeoutRef = useRef(null);
  const rocketTimeoutRef = useRef(null);
  const queueRef = useRef(queue);
  const qIndexRef = useRef(0);
  const statusRef = useRef(status);
  const liveSpeedRef = useRef(0);
  const recupTextFiredRef = useRef(false);
  const raceStartFiredRef = useRef(false);

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
  useEffect(() => { liveSpeedRef.current = simMode ? simSpeed : liveSpeed; }, [simMode, simSpeed, liveSpeed]);

  const current = queue[qIndex] || { kind: "finished", seconds: 0 };
  const targetSpeed = current.pct ? vma * (current.pct / 100) : 0;

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
      setDistance(d => d + speedNow / 3.6);

      setSecondsLeft(s => {
        if (s > 1) {
          // texte "5 secondes avant la fin de la récup" — uniquement en récup normale (hors récup finale)
          if (cur.kind === "recup" && s - 1 === 5 && !recupTextFiredRef.current) {
            recupTextFiredRef.current = true;
            onToast?.(pickText("recupEndingSoon", runnerName));
          }
          return s - 1;
        }
        // fin de la phase courante -> passage à la suivante
        const nextIdx = qIndexRef.current + 1;
        const nextPhase = queueRef.current[nextIdx] || { kind: "finished", seconds: 0 };
        recupTextFiredRef.current = false;
        setQIndex(nextIdx);
        if (nextPhase.kind === "finished") setStatus("paused");
        return nextPhase.seconds;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [status, runnerName, onToast]);

  // reset distance à chaque changement de phase + textes contextuels
  useEffect(() => {
    setDistance(0);
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
  useEffect(() => {
    if (screen !== "run" || simMode || status !== "running") {
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
        if (speedMs != null && speedMs >= 0) setLiveSpeed(speedMs * 3.6);
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
  }, [screen, simMode, status]);

  // --- Bips de régulation (seulement en work/recup, jamais pendant échauffement/pauses) ---
  const beepLoop = useCallback(() => {
    const cur = queueRef.current[qIndexRef.current];
    if (!cur || statusRef.current !== "running" || (cur.kind !== "work" && cur.kind !== "recup")) return;
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

  // --- Gong sur changement de phase ---
  const prevKindRef = useRef(null);
  useEffect(() => {
    if (screen !== "run") { prevKindRef.current = null; return; }
    const prev = prevKindRef.current;
    if (prev !== null && prev !== current.kind) {
      const boundary = prev === "restSeries" || current.kind === "restSeries";
      playGong(ensureAudioCtx(), boundary ? 2 : 1);
      if (current.kind === "finished") {
        const ctx = ensureAudioCtx();
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
  }

  function startManualSession() {
    const activeTypes = repTypes.filter(rt => rt.enabled);
    const validSeries = seriesList
      .map(s => ({ ...s, blocks: s.blocks.filter(b => activeTypes.some(rt => rt.id === b.repTypeId)) }))
      .filter(s => s.blocks.length > 0);
    if (activeTypes.length === 0 || validSeries.length === 0) return;
    const q = buildManualQueue({
      repTypes: activeTypes, seriesList: validSeries,
      globalRepeatCount, warmupSec, finalRecupSec,
    });
    resetAcc();
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
    setQueue(q);
    setQIndex(0);
    // décompte façon décollage de fusée avant de révéler l'écran de course
    setRocketCount(10);
    setScreen("run");
    setStatus("paused");
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
  }

  async function saveSession() {
    setSaveStatus("saving");
    try {
      const id = `fp-${Date.now()}`;
      const payload = {
        id,
        mode: isHazardous ? "hazardous" : "manual",
        savedAt: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        comment: saveComment,
        vma,
        config: isHazardous
          ? { warmupSec: hzWarmupSec, workTotalSec: hzWorkTotalSec, finalRecupSec: hzFinalRecupSec }
          : { repTypes: repTypes.filter(rt => rt.enabled), seriesList, globalRepeatCount, warmupSec, finalRecupSec },
        totals: {
          workDist: acc.current.work.dist, workTime: acc.current.work.time,
          recupDist: acc.current.recup.dist, recupTime: acc.current.recup.time,
          maxSpeed: acc.current.maxSpeed,
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
      items.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      setLibrary(items);
    } catch { /* ignore */ }
    setLibraryLoading(false);
  }
  function openLibrary() { setScreen("library"); loadLibrary(); }

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

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-fuchsia-950 via-purple-950 to-slate-950 text-slate-100 flex flex-col items-center px-4 py-6 gap-6">
      <header className="w-full max-w-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-fuchsia-400" />
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-purple-300 bg-clip-text text-transparent">
            Full Power
          </h1>
        </div>
        {screen !== "config" && screen !== "run" && (
          <button onClick={() => setScreen("config")} className="text-slate-400 flex items-center gap-1 text-sm">
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
                <p className="text-xs uppercase tracking-wide text-slate-400">Types de répétition (jusqu'à 4)</p>
                {repTypes.map(rt => {
                  const c = REP_COLORS[rt.id];
                  return (
                    <div key={rt.id} className={`rounded-xl border p-3 ${rt.enabled ? c.border : "border-slate-800"} ${rt.enabled ? c.bg : "bg-slate-900"}`}>
                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={rt.enabled} onChange={() => toggleRepType(rt.id)} className={c.accent} />
                        <span className={`font-bold ${c.text}`}>Type {rt.id}</span>
                      </label>
                      {rt.enabled && (
                        <div className="grid grid-cols-2 gap-2">
                          <MiniField label="%VMA travail" value={rt.workPct} onChange={v => updateRepType(rt.id, { workPct: v })} />
                          <MiniField label="Temps travail (s)" value={rt.workSec} onChange={v => updateRepType(rt.id, { workSec: v })} />
                          <MiniField label="%VMA récup" value={rt.recupPct} onChange={v => updateRepType(rt.id, { recupPct: v })} />
                          <MiniField label="Temps récup (s)" value={rt.recupSec} onChange={v => updateRepType(rt.id, { recupSec: v })} />
                        </div>
                      )}
                    </div>
                  );
                })}
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
                        <span className={`text-xs font-bold w-5 ${REP_COLORS[b.repTypeId].text}`}>{b.repTypeId}</span>
                        <span className="text-xs text-slate-400">×</span>
                        <input
                          type="number" value={b.count}
                          onChange={e => updateBlock(s.id, bIdx, { count: parseInt(e.target.value) || 1 })}
                          className="w-16 bg-slate-800 rounded-lg px-2 py-1 text-sm font-mono outline-none"
                        />
                        <span className="text-xs text-slate-500">répétition(s)</span>
                        <button onClick={() => removeBlock(s.id, bIdx)} className="ml-auto text-slate-500"><Trash2 size={13} /></button>
                      </div>
                    ))}

                    <div className="flex gap-1.5 flex-wrap">
                      {repTypes.filter(rt => rt.enabled).map(rt => (
                        <button
                          key={rt.id}
                          onClick={() => addBlockToSeries(s.id, rt.id)}
                          className={`text-xs px-2 py-1 rounded-lg border ${REP_COLORS[rt.id].border} ${REP_COLORS[rt.id].text} flex items-center gap-1`}
                        >
                          <Plus size={11} /> {rt.id}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                      <MiniField label="Répéter cette série ×" value={s.repeatCount} onChange={v => updateSeries(s.id, { repeatCount: v })} />
                      <MiniField label="Pause après série (s)" value={s.restSeriesSec} onChange={v => updateSeries(s.id, { restSeriesSec: v })} />
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
              </div>

              <SimToggle simMode={simMode} setSimMode={setSimMode} />

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
                <div className="pt-2 border-t border-slate-800 flex justify-between text-sm">
                  <span className="text-slate-400">Temps total estimé</span>
                  <span className="font-mono font-semibold text-purple-300">
                    {fmtDuration(hzWarmupSec + hzWorkTotalSec + hzFinalRecupSec)}
                  </span>
                </div>
              </div>

              <SimToggle simMode={simMode} setSimMode={setSimMode} />

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
          {libraryLoading && <p className="text-sm text-slate-500 text-center">Chargement...</p>}
          {!libraryLoading && library.length === 0 && (
            <p className="text-sm text-slate-500 text-center">Aucune séance Full Power enregistrée.</p>
          )}
          {library.map(s => (
            <div key={s.id} className="bg-slate-900/70 rounded-2xl p-4 border border-fuchsia-500/20 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm">{s.date}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.mode === "hazardous" ? "bg-purple-500/20 text-purple-300" : "bg-fuchsia-500/20 text-fuchsia-300"}`}>
                  {s.mode === "hazardous" ? "Hazardous" : "Manuel"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Travail : {fmtDuration(s.totals?.workTime || 0)} · Vmax : {(s.totals?.maxSpeed || 0).toFixed(1)} km/h
              </p>
              {s.comment && <p className="text-sm italic text-slate-300">"{s.comment}"</p>}
            </div>
          ))}
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
              <span className="text-6xl font-mono font-bold mt-2 tabular-nums">{fmtTime(secondsLeft)}</span>
            </div>
          )}

          {isHazardous && current.kind !== "finished" && (
            <div className="w-full rounded-2xl border border-fuchsia-500/30 bg-slate-950/60 p-6 flex flex-col items-center">
              <span className="text-6xl font-mono font-bold tabular-nums text-slate-100">{fmtTime(secondsLeft)}</span>
            </div>
          )}

          {current.kind !== "finished" && (current.kind === "work" || current.kind === "recup") && (
            <div className="w-full bg-slate-900/70 rounded-2xl border border-fuchsia-500/20 p-4 flex flex-col items-center">
              <NeedleGauge currentSpeed={simMode ? simSpeed : liveSpeed} targetSpeed={targetSpeed} />
              <div className="flex justify-between w-full mt-1 text-center">
                <div>
                  <p className="text-2xl font-mono font-bold">{(simMode ? simSpeed : liveSpeed).toFixed(1)}</p>
                  <p className="text-xs text-slate-500">km/h actuelle</p>
                  <p className="text-sm font-mono text-slate-400 mt-0.5">{allureFromKmh(simMode ? simSpeed : liveSpeed)}</p>
                  <p className="text-sm font-mono text-slate-400 mt-0.5">{vma > 0 ? (((simMode ? simSpeed : liveSpeed) / vma) * 100).toFixed(0) : 0}% VMA</p>
                </div>
                {!isHazardous && (
                  <div>
                    <p className="text-2xl font-mono font-bold text-fuchsia-300">{targetSpeed.toFixed(1)}</p>
                    <p className="text-xs text-slate-500">km/h cible</p>
                    <p className="text-sm font-mono text-fuchsia-300 mt-0.5">{allureFromKmh(targetSpeed)}</p>
                    <p className="text-sm font-mono text-fuchsia-300 mt-0.5">{current.pct}% VMA</p>
                  </div>
                )}
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
                {vma > 0 ? (((simMode ? simSpeed : liveSpeed) / vma) * 100).toFixed(0) : 0}%
              </span>
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
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Save size={14} /> Enregistrer dans la bibliothèque Full Power
                </p>
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
  const maxScale = 25;
  const angle = -90 + (Math.min(currentSpeed, maxScale) / maxScale) * 180;
  return (
    <svg viewBox="0 0 200 110" className="w-56">
      <path d="M 15 100 A 85 85 0 0 1 65 20" fill="none" stroke="#c026d3" strokeWidth="10" strokeLinecap="round" />
      <path d="M 65 20 A 85 85 0 0 1 135 20" fill="none" stroke="#a855f7" strokeWidth="10" strokeLinecap="round" />
      <path d="M 135 20 A 85 85 0 0 1 185 100" fill="none" stroke="#ec4899" strokeWidth="10" strokeLinecap="round" />
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
