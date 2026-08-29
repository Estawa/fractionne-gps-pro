import { useState, useEffect, useRef } from "react";
import { Zap, Power } from "lucide-react";
import FractionneGPS from "./FractionneGPS.jsx";
import FullPower from "./fullpower/FullPower.jsx";
import { getRunnerName, setRunnerName, pickText } from "./fullpower/personalization.js";

export default function App() {
  const [mode, setMode] = useState("simple"); // simple | fullpower
  const [runnerName, setName] = useState("");
  const [nameChecked, setNameChecked] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const openToastFiredRef = useRef(false);
  const [showOffConfirm, setShowOffConfirm] = useState(false);
  const [poweredOff, setPoweredOff] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getRunnerName();
      setName(stored);
      setNameChecked(true);
    })();
  }, []);

  function showToast(text) {
    if (!text) return;
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(text);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    if (!nameChecked || !runnerName || openToastFiredRef.current) return;
    openToastFiredRef.current = true;
    showToast(pickText("appOpen", runnerName));
  }, [nameChecked, runnerName]);

  useEffect(() => {
    if (!runnerName) return;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        showToast(pickText("appClose", runnerName));
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [runnerName]);

  async function confirmName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    await setRunnerName(trimmed);
    setName(trimmed);
  }

  function requestPowerOff() {
    setShowOffConfirm(true);
  }
  function confirmPowerOff() {
    setShowOffConfirm(false);
    setPoweredOff(true);
  }
  function cancelPowerOff() {
    setShowOffConfirm(false);
  }
  function powerBackOn() {
    setPoweredOff(false);
  }

  if (poweredOff) {
    return (
      <button
        onClick={powerBackOn}
        className="min-h-full w-full bg-black text-slate-500 flex flex-col items-center justify-center gap-4"
      >
        <Power size={28} className="text-slate-700" />
        <p className="text-sm">Application éteinte</p>
        <p className="text-xs text-slate-700">Touche l'écran pour la rallumer</p>
      </button>
    );
  }

  if (nameChecked && !runnerName) {
    return (
      <div className="min-h-full w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 gap-5">
        <Zap size={32} className="text-fuchsia-400" />
        <h1 className="text-xl font-bold">Bienvenue !</h1>
        <p className="text-sm text-slate-400 text-center max-w-xs">
          Comment veux-tu que l'application t'appelle pendant tes séances ?
        </p>
        <input
          autoFocus
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && confirmName()}
          placeholder="Ton prénom"
          className="w-full max-w-xs bg-slate-800 rounded-lg px-4 py-3 text-center text-lg outline-none focus:ring-2 focus:ring-fuchsia-500"
        />
        <button
          onClick={confirmName}
          className="w-full max-w-xs bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold rounded-xl py-3"
        >
          Valider
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-full w-full">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 flex justify-center">
        <div className="flex w-full max-w-md p-2 gap-2 items-center">
          <button
            onClick={() => setMode("simple")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold ${mode === "simple" ? "bg-slate-100 text-slate-950" : "text-slate-400"}`}
          >
            Mode Simple
          </button>
          <button
            onClick={() => setMode("fullpower")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${mode === "fullpower" ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white" : "text-slate-400"}`}
          >
            <Zap size={14} /> Full Power
          </button>
          <button
            onClick={requestPowerOff}
            aria-label="Éteindre l'application"
            className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800/60"
          >
            <Power size={18} />
          </button>
        </div>
      </div>

      {mode === "simple" ? <FractionneGPS /> : <FullPower runnerName={runnerName} onToast={showToast} />}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90%] bg-slate-900/95 border border-fuchsia-500/40 text-slate-100 text-sm font-medium px-4 py-3 rounded-xl shadow-lg shadow-fuchsia-900/40 text-center">
          {toast}
        </div>
      )}

      {showOffConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center px-6">
          <div className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col items-center gap-4">
            <Power size={24} className="text-rose-400" />
            <p className="text-sm text-slate-200 text-center">Voulez-vous vraiment éteindre l'application ?</p>
            <div className="flex w-full gap-2">
              <button
                onClick={cancelPowerOff}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-slate-200"
              >
                Annuler
              </button>
              <button
                onClick={confirmPowerOff}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-rose-600 text-white"
              >
                Éteindre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
