import { useState, useEffect, useRef } from "react";
import { Zap, Power, Share2, Copy, Check, X } from "lucide-react";
import FractionneGPS from "./FractionneGPS.jsx";
import FullPower from "./fullpower/FullPower.jsx";
import { getRunnerName, setRunnerName, pickText } from "./fullpower/personalization.js";

const APP_URL = "https://fractionne-gps-pro.vercel.app";

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
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);

  // URL réelle de l'appli telle que déployée (utile si un jour hébergée ailleurs que APP_URL).
  const shareUrl = typeof window !== "undefined" && window.location.origin.startsWith("http")
    ? window.location.origin
    : APP_URL;
  const shareText = "Fractionné GPS Pro — mon appli de séances de fractionné guidées par GPS";

  function openShare() { setCopied(false); setShowShare(true); }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* presse-papiers indisponible, tant pis */ }
  }

  function shareViaWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText + " : " + shareUrl)}`, "_blank");
  }

  function shareViaEmail() {
    window.location.href = `mailto:?subject=${encodeURIComponent("Fractionné GPS Pro")}&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`;
  }

  async function shareViaSystem() {
    if (navigator.share) {
      try { await navigator.share({ title: "Fractionné GPS Pro", text: shareText, url: shareUrl }); }
      catch { /* annulé par l'utilisateur, rien à faire */ }
    }
  }

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
            onClick={openShare}
            aria-label="Partager l'application"
            className="p-2 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-slate-800/60"
          >
            <Share2 size={18} />
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

      {showShare && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center px-6">
          <div className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col items-center gap-4 relative">
            <button
              onClick={() => setShowShare(false)}
              aria-label="Fermer"
              className="absolute top-3 right-3 text-slate-500 hover:text-slate-200"
            >
              <X size={18} />
            </button>
            <Share2 size={22} className="text-sky-400" />
            <p className="text-sm font-semibold text-slate-100 text-center">Partager Fractionné GPS Pro</p>

            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`}
              alt="QR code de l'application"
              width={160}
              height={160}
              className="rounded-lg bg-white p-2"
            />
            <p className="text-[11px] text-slate-500 text-center -mt-2">
              Le flashcode est généré via un service externe (api.qrserver.com), à qui seule l'adresse de l'appli est transmise.
            </p>

            <div className="w-full flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-300 truncate flex-1">{shareUrl}</p>
              <button onClick={copyShareLink} className="text-slate-400 hover:text-slate-100 shrink-0">
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </div>

            <div className="w-full grid grid-cols-2 gap-2">
              <button
                onClick={shareViaWhatsApp}
                className="py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                WhatsApp
              </button>
              <button
                onClick={shareViaEmail}
                className="py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                E-mail
              </button>
            </div>

            {typeof navigator !== "undefined" && navigator.share && (
              <button
                onClick={shareViaSystem}
                className="w-full py-2 rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center gap-2"
              >
                <Share2 size={16} /> Autre application...
              </button>
            )}
          </div>
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
