import React, { useState, useRef, useEffect } from "react";
import {
  Home, Dumbbell, ListChecks, ClipboardList, History, Timer as TimerIcon,
  Plus, Trash2, Play, Pause, RotateCcw, ChevronRight, Flame, Target, Info, Calculator,
  User, TrendingUp, Check, Share2, Copy, LogOut, Lock
} from "lucide-react";
import {
  slug, loadProfil, saveProfilStorage, clearProfilStorage, loadMapping, saveMapping,
  loadClassesIndex, addClasseToIndex, registerProfil, loadHistorique, saveHistorique,
  loadStudentHistoriqueByNumero, loadSeances, saveSeances, loadStudentSeancesByNumero,
  loadProjet, saveProjet, resetEleve, resetClasse, resetToutesLesDonnees, PROFS, findProfByPin,
} from "./storage.js";

// ---------------------------------------------------------------------------
// Données de référence (issues de la programmation)
// ---------------------------------------------------------------------------

const MOBILES = [
  { id: "r1", label: "R1", nom: "Force Maximale", reps: "1 à 3", charge: "100-90 %", recup: "3-5 min active", recupSec: 240, series: "3 à 8", effet: "Force maximale (mobile de référence, encadrement renforcé)", color: "fuchsia" },
  { id: "r6", label: "R6", nom: "Force", reps: "4 à 8", charge: "90-80 %", recup: "3-5 min active", recupSec: 240, series: "6 (6x6)", effet: "Développement de la force", color: "rose" },
  { id: "r10", label: "R10", nom: "Masse musculaire", reps: "8 à 12", charge: "80-70 %", recup: "1min30 à 2 min + étirements", recupSec: 105, series: "5 à 10 (10x10)", effet: "Hypertrophie / prise de masse", color: "sky" },
  { id: "r15", label: "R15", nom: "Endurance-Force", reps: "15 à 20", charge: "65-50 %", recup: "60-90 sec, étirements", recupSec: 75, series: "5/6 minimum", effet: "Endurance musculaire", color: "amber" },
  { id: "r25", label: "R25", nom: "Affinement", reps: "20 à 30", charge: "50-30 %", recup: "< 60 sec, travail aérobie", recupSec: 45, series: "5/6 minimum", effet: "Affinement / dépense énergétique", color: "emerald" },
];

const ZONES = [
  { id: "membres-sup", label: "Membres supérieurs", color: "violet", hasMobile: true },
  { id: "membres-inf", label: "Membres inférieurs", color: "teal", hasMobile: true },
  { id: "tronc-avant", label: "Tronc — face avant", color: "indigo", hasMobile: true },
  { id: "tronc-dos", label: "Tronc — face dorsale", color: "cyan", hasMobile: true },
  { id: "cardio", label: "Cardio", color: "lime", hasMobile: false },
];

const ATELIERS = [
  { nom: "Vis-à-vis (écarté poitrine)", muscles: "Pectoraux", zone: "tronc-avant" },
  { nom: "Vis-à-vis (rowing / oiseau)", muscles: "Deltoïdes postérieurs, trapèzes", zone: "tronc-dos" },
  { nom: "Vis-à-vis (triceps / biceps / deltoïdes)", muscles: "Triceps, biceps, deltoïdes", zone: "membres-sup" },
  { nom: "Chaise à dips", muscles: "Triceps, pectoraux", zone: "membres-sup" },
  { nom: "Abdos sous ombilical", muscles: "Grand droit de l'abdomen (bas)", zone: "tronc-avant" },
  { nom: "Développé incliné", muscles: "Pectoraux (haut), deltoïdes ant., triceps", zone: "tronc-avant" },
  { nom: "Développé couché", muscles: "Pectoraux, deltoïdes ant., triceps", zone: "tronc-avant" },
  { nom: "Soulevé de terre", muscles: "Lombaires, ischios, fessiers", zone: "tronc-dos" },
  { nom: "Rowing épaule", muscles: "Grand dorsal, trapèzes, deltoïdes post.", zone: "tronc-dos" },
  { nom: "Banc 2 haltères", muscles: "Épaules/bras selon exercice", zone: "membres-sup" },
  { nom: "Cage à squat", muscles: "Quadriceps, fessiers, ischios, gainage", zone: "membres-inf" },
  { nom: "Tirage barre haute", muscles: "Grand dorsal, biceps", zone: "tronc-dos" },
  { nom: "Tirage barre horizontale", muscles: "Grand dorsal, trapèzes, biceps", zone: "tronc-dos" },
  { nom: "Chaise quadriceps", muscles: "Quadriceps", zone: "membres-inf" },
  { nom: "Chaise ischios", muscles: "Ischio-jambiers", zone: "membres-inf" },
  { nom: "Chaise adducteurs", muscles: "Adducteurs", zone: "membres-inf" },
  { nom: "Chaise abducteurs", muscles: "Moyen fessier", zone: "membres-inf" },
  { nom: "Presse à cuisses", muscles: "Quadriceps, fessiers, ischios", zone: "membres-inf" },
  { nom: "Rameur", muscles: "Dorsaux, biceps, quadriceps + sollicitation cardio-vasculaire", zone: "cardio" },
  { nom: "Vélo / elliptique", muscles: "Quadriceps, mollets + sollicitation cardio-vasculaire", zone: "cardio" },
  { nom: "Corde à sauter", muscles: "Mollets, coordination + sollicitation cardio-vasculaire", zone: "cardio" },
  { nom: "Tapis de sol", muscles: "Abdos, gainage, pompes, étirements", zone: "tronc-avant" },
];

const RESSENTI = [
  { id: "adaptee", symbole: "=", label: "Adaptée" },
  { id: "lourde", symbole: "↑", label: "Trop lourde" },
  { id: "legere", symbole: "↓", label: "Trop légère" },
  { id: "adaptation", symbole: "~", label: "Adaptation" },
];

const BORG = [
  { v: 0, label: "Repos" }, { v: 1, label: "Très très facile" }, { v: 2, label: "Facile" },
  { v: 3, label: "Modéré" }, { v: 4, label: "Un peu difficile" }, { v: 5, label: "Difficile" },
  { v: 6, label: "" }, { v: 7, label: "Très difficile" }, { v: 8, label: "" },
  { v: 9, label: "Très très difficile" }, { v: 10, label: "Maximal" },
];

const colorMap = {
  rose: { bg: "bg-rose-500", bgSoft: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/40", ring: "ring-rose-500" },
  sky: { bg: "bg-sky-500", bgSoft: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/40", ring: "ring-sky-500" },
  amber: { bg: "bg-amber-500", bgSoft: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/40", ring: "ring-amber-500" },
  emerald: { bg: "bg-emerald-500", bgSoft: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/40", ring: "ring-emerald-500" },
  violet: { bg: "bg-violet-500", bgSoft: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/40", ring: "ring-violet-500" },
  teal: { bg: "bg-teal-500", bgSoft: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/40", ring: "ring-teal-500" },
  cyan: { bg: "bg-cyan-500", bgSoft: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/40", ring: "ring-cyan-500" },
  fuchsia: { bg: "bg-fuchsia-500", bgSoft: "bg-fuchsia-500/10", text: "text-fuchsia-400", border: "border-fuchsia-500/40", ring: "ring-fuchsia-500" },
  indigo: { bg: "bg-indigo-500", bgSoft: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/40", ring: "ring-indigo-500" },
  lime: { bg: "bg-lime-500", bgSoft: "bg-lime-500/10", text: "text-lime-400", border: "border-lime-500/40", ring: "ring-lime-500" },
};

const mobileById = (id) => MOBILES.find((m) => m.id === id);
const zoneById = (id) => ZONES.find((z) => z.id === id);
const atelierZone = (nom) => ATELIERS.find((a) => a.nom === nom)?.zone;

// ---------------------------------------------------------------------------
// Identité élève + stockage persistant
//
// Confidentialité : chaque élève se voit attribuer un numéro aléatoire, non
// affiché dans son appli. Les données de séance partagées (historique) sont
// indexées par ce numéro, jamais par nom — un élève qui consulterait les
// données partagées ne verrait que des numéros. Seul le Mode professeur
// (protégé par un code) fait la correspondance numéro → nom, via la table
// "mapping" tenue à part.
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function Header({ title, subtitle }) {
  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-black tracking-tight text-neutral-50 uppercase">{title}</h1>
      </div>
      {subtitle && <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-neutral-900 border border-neutral-800 rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran : Accueil
// ---------------------------------------------------------------------------

function ConnexionProf({ onValidate }) {
  const [profChoisi, setProfChoisi] = useState(PROFS.length === 1 ? PROFS[0].nom : "");
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState(false);
  const pret = profChoisi && pin;

  const valider = () => {
    const trouve = findProfByPin(pin);
    if (trouve && trouve.nom === profChoisi) {
      setErreur(false);
      onValidate({ type: "prof", nom: trouve.nom });
    } else {
      setErreur(true);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
          <Lock size={24} className="text-orange-400" />
        </div>
        <h1 className="text-xl font-black uppercase tracking-tight text-neutral-50">Connexion professeur</h1>
        <p className="text-sm text-neutral-500 mt-1">Ton nom et ton code d'accès personnel</p>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-neutral-500 mb-1.5 px-1">Ton nom</p>
          <div className="space-y-1.5">
            {PROFS.map((p) => (
              <button
                key={p.nom}
                onClick={() => { setProfChoisi(p.nom); setErreur(false); }}
                className={`w-full text-left rounded-xl px-4 py-2.5 text-sm font-semibold border transition ${profChoisi === p.nom ? "bg-orange-500/10 border-orange-500/40 text-orange-300" : "bg-neutral-900 border-neutral-800 text-neutral-300"}`}
              >
                {p.nom}
              </button>
            ))}
          </div>
        </div>
        <input
          type="password" value={pin} onChange={(e) => { setPin(e.target.value); setErreur(false); }}
          placeholder="Code d'accès"
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-lg font-bold text-neutral-100 text-center tracking-widest placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        {erreur && <p className="text-xs text-rose-400 text-center">Nom ou code incorrect.</p>}
      </div>
      <button
        disabled={!pret}
        onClick={valider}
        className={`w-full mt-5 rounded-xl py-3 font-bold transition ${pret ? "bg-orange-500 text-neutral-950 active:scale-[0.98]" : "bg-neutral-900 text-neutral-600"}`}
      >
        Se connecter
      </button>
    </div>
  );
}

function Identification({ onValidateEleve, onValidateProf, initial }) {
  const [mode, setMode] = useState("eleve"); // "eleve" | "prof"
  const [nom, setNom] = useState(initial?.nom || "");
  const [prenom, setPrenom] = useState(initial?.prenom || "");
  const [classe, setClasse] = useState(initial?.classe || "");
  const [prof, setProf] = useState(initial?.prof || (PROFS.length === 1 ? PROFS[0].nom : ""));
  const pret = nom.trim() && prenom.trim() && classe.trim() && prof;

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6">
      {mode === "eleve" ? (
        <div className="w-full max-w-sm">
          <button onClick={() => setMode("prof")} className="w-full mb-6 flex items-center justify-center gap-1.5 text-xs font-bold text-orange-400/80 bg-orange-500/5 border border-orange-500/20 rounded-xl py-2.5">
            Tu es professeur ? Connexion ici →
          </button>
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
              <User size={26} className="text-orange-400" />
            </div>
            <h1 className="text-xl font-black uppercase tracking-tight text-neutral-50">Qui es-tu ?</h1>
            <p className="text-sm text-neutral-500 mt-1">Pour que ton professeur puisse suivre ta progression</p>
          </div>
          <div className="space-y-3">
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            <input value={classe} onChange={(e) => setClasse(e.target.value)} placeholder="Classe (ex : 1G3)"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500" />

            {PROFS.length > 1 && (
              <div>
                <p className="text-xs text-neutral-500 mb-1.5 px-1">Ton professeur d'EPS</p>
                <div className="space-y-1.5">
                  {PROFS.map((p) => (
                    <button
                      key={p.nom}
                      onClick={() => setProf(p.nom)}
                      className={`w-full text-left rounded-xl px-4 py-2.5 text-sm font-semibold border transition ${prof === p.nom ? "bg-orange-500/10 border-orange-500/40 text-orange-300" : "bg-neutral-900 border-neutral-800 text-neutral-300"}`}
                    >
                      {p.nom}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            disabled={!pret}
            onClick={() => onValidateEleve({ type: "eleve", nom: nom.trim(), prenom: prenom.trim(), classe: classe.trim(), prof })}
            className={`w-full mt-5 rounded-xl py-3 font-bold transition ${pret ? "bg-orange-500 text-neutral-950 active:scale-[0.98]" : "bg-neutral-900 text-neutral-600"}`}
          >
            Commencer
          </button>
          <p className="text-[10px] text-neutral-600 text-center mt-4">Tes séances sont enregistrées de façon anonyme (par numéro) pour ton suivi et ta notation de cycle — ton nom n'est jamais visible des autres élèves.</p>
        </div>
      ) : (
        <div className="w-full max-w-sm">
          <ConnexionProf onValidate={onValidateProf} />
          <button onClick={() => setMode("eleve")} className="w-full mt-6 text-center text-xs font-semibold text-neutral-600">
            ← Je suis élève
          </button>
        </div>
      )}
    </div>
  );
}

function PartagerApp() {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(url)}`;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch (e) {}
  };

  return (
    <Card>
      <button onClick={() => setOuvert((o) => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
            <Share2 size={14} className="text-neutral-400" />
          </div>
          <p className="text-sm font-bold text-neutral-100">Partager l'appli</p>
        </div>
        <ChevronRight size={16} className={`text-neutral-600 transition ${ouvert ? "rotate-90" : ""}`} />
      </button>

      {ouvert && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="bg-white p-2.5 rounded-xl">
            <img src={qrSrc} alt="QR code de l'appli" width={160} height={160} />
          </div>
          <p className="text-xs text-neutral-400 text-center break-all px-2">{url || "Adresse disponible une fois l'appli déployée"}</p>
          <button onClick={copier} className="w-full bg-neutral-800 text-neutral-200 text-xs font-bold rounded-lg py-2.5 flex items-center justify-center gap-1.5">
            {copie ? <><Check size={13} /> Lien copié</> : <><Copy size={13} /> Copier le lien</>}
          </button>
          <p className="text-[10px] text-neutral-600 text-center">Fais scanner ce code ou transmets le lien pour que chaque élève installe l'appli sur son téléphone.</p>
        </div>
      )}
    </Card>
  );
}

function Accueil({ setTab, sessions, project, profil, onEditProfil, onDeconnexion }) {
  const lastSession = sessions[sessions.length - 1];
  const totalTonnage = sessions.reduce((a, s) => a + s.tonnage, 0);

  return (
    <div className="px-5 pb-6 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onEditProfil} className="flex-1 flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center">
              <User size={15} className="text-orange-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-neutral-100">{profil.prenom} {profil.nom}</p>
              <p className="text-[11px] text-neutral-500">{profil.classe}</p>
            </div>
          </div>
          <span className="text-[10px] text-neutral-600">modifier</span>
        </button>
        <button onClick={onDeconnexion} className="w-12 h-12 shrink-0 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
          <LogOut size={16} className="text-neutral-500" />
        </button>
      </div>

      <PartagerApp />

      <Card className="bg-gradient-to-br from-neutral-900 to-neutral-950">
        <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Mon projet, zone par zone</p>
        <div className="space-y-2">
          {ZONES.map((z) => {
            const mId = project.mobiles[z.id];
            const m = mId ? mobileById(mId) : null;
            const zc = colorMap[z.color];
            return (
              <div key={z.id} className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${zc.text}`}>{z.label}</span>
                {!z.hasMobile ? (
                  <span className="text-xs text-neutral-500 italic">durée / intensité</span>
                ) : m ? (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${colorMap[m.color].bgSoft} ${colorMap[m.color].text}`}>
                    {m.label} · {m.nom}
                  </span>
                ) : (
                  <span className="text-xs text-neutral-600">non défini</span>
                )}
              </div>
            );
          })}
        </div>
        {ZONES.filter((z) => z.hasMobile).every((z) => !project.mobiles[z.id]) && (
          <button onClick={() => setTab("projet")} className="mt-3 text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-2">
            Construire mon projet →
          </button>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">Séances loguées</p>
          <p className="text-3xl font-black text-neutral-50 mt-1">{sessions.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">Tonnage cumulé</p>
          <p className="text-3xl font-black text-neutral-50 mt-1">{totalTonnage.toLocaleString("fr-FR")}<span className="text-base font-semibold text-neutral-500"> kg</span></p>
        </Card>
      </div>

      {lastSession && (
        <Card>
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-2">Dernière séance</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-200 font-semibold">{lastSession.date}</p>
              <p className="text-sm text-neutral-500">RPE {lastSession.rpe}/10 · {lastSession.duree} min</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-orange-400">{lastSession.charge}<span className="text-sm text-neutral-500 font-semibold"> UA</span></p>
              <p className="text-xs text-neutral-500">charge de séance</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran : Mobiles
// ---------------------------------------------------------------------------

function Mobiles() {
  return (
    <div className="px-5 pb-6 space-y-3">
      {MOBILES.map((m) => {
        const c = colorMap[m.color];
        return (
          <Card key={m.id} className={`border-l-4 ${c.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-black uppercase tracking-widest ${c.text}`}>{m.label}</p>
                <p className="text-lg font-bold text-neutral-50">{m.nom}</p>
              </div>
              <div className={`px-3 py-1.5 rounded-full ${c.bgSoft} ${c.text} text-xs font-bold`}>{m.reps} rép.</div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-center">
              <div className="bg-neutral-950 rounded-xl py-2">
                <p className="text-[10px] uppercase text-neutral-500 font-semibold">Charge</p>
                <p className="text-sm font-bold text-neutral-200">{m.charge}</p>
              </div>
              <div className="bg-neutral-950 rounded-xl py-2">
                <p className="text-[10px] uppercase text-neutral-500 font-semibold">Séries</p>
                <p className="text-sm font-bold text-neutral-200">{m.series}</p>
              </div>
              <div className="bg-neutral-950 rounded-xl py-2">
                <p className="text-[10px] uppercase text-neutral-500 font-semibold">Récup</p>
                <p className="text-sm font-bold text-neutral-200">{m.recup}</p>
              </div>
              <div className="bg-neutral-950 rounded-xl py-2">
                <p className="text-[10px] uppercase text-neutral-500 font-semibold">Effet</p>
                <p className="text-[11px] font-semibold text-neutral-300 leading-tight mt-0.5">{m.effet.split(" / ")[0]}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran : Ateliers
// ---------------------------------------------------------------------------

function Ateliers() {
  const [q, setQ] = useState("");
  const filtered = ATELIERS.filter(a => a.nom.toLowerCase().includes(q.toLowerCase()) || a.muscles.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="px-5 pb-6 space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Chercher un atelier ou un muscle…"
        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      {filtered.map((a) => (
        <Card key={a.nom} className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-neutral-100">{a.nom}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{a.muscles}</p>
          </div>
          <Dumbbell size={16} className="text-neutral-600 shrink-0 ml-2" />
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran : Projet individuel
// ---------------------------------------------------------------------------

function Projet({ project, setProject }) {
  const toggleAtelier = (nom) => {
    setProject((p) => {
      const exists = p.ateliers.includes(nom);
      return { ...p, ateliers: exists ? p.ateliers.filter((n) => n !== nom) : [...p.ateliers, nom] };
    });
  };

  const setZoneMobile = (zoneId, mobileId) => {
    setProject((p) => ({ ...p, mobiles: { ...p.mobiles, [zoneId]: p.mobiles[zoneId] === mobileId ? null : mobileId } }));
  };

  return (
    <div className="px-5 pb-6 space-y-4">
      <Card className="bg-neutral-900/60">
        <div className="flex gap-2">
          <Info size={15} className="text-neutral-500 shrink-0 mt-0.5" />
          <p className="text-xs text-neutral-400 leading-relaxed">
            Ton projet peut mêler plusieurs mobiles différents selon les zones (masse en membres inférieurs, affinement en tronc avant, puissance en membres supérieurs…) — ou un seul mobile appliqué à tout le corps. Ce qui compte, c'est d'argumenter ton choix zone par zone.
          </p>
        </div>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">1. Mon mobile, zone par zone</p>
        <div className="space-y-4">
          {ZONES.map((z) => {
            const zc = colorMap[z.color];
            return (
              <div key={z.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${zc.bg}`} />
                  <p className={`text-sm font-bold ${zc.text}`}>{z.label}</p>
                </div>
                {z.hasMobile ? (
                  <div className="grid grid-cols-5 gap-1">
                    {MOBILES.map((m) => {
                      const c = colorMap[m.color];
                      const active = project.mobiles[z.id] === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setZoneMobile(z.id, m.id)}
                          className={`rounded-lg py-2 text-center border transition ${active ? `${c.bgSoft} ${c.border} ring-1 ${c.ring}` : "bg-neutral-950 border-neutral-800"}`}
                        >
                          <p className={`text-[11px] font-black ${active ? c.text : "text-neutral-500"}`}>{m.label}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-500 italic bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                    Pas de mobile R1-R25 ici : le travail cardio se pilote en durée / intensité, pas en régime de répétitions.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">2. Mes ateliers ({project.ateliers.length})</p>
        </div>
        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {ZONES.map((z) => {
            const zc = colorMap[z.color];
            const mId = project.mobiles[z.id];
            const m = mId ? mobileById(mId) : null;
            return (
              <div key={z.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${zc.bg}`} />
                  <p className={`text-[11px] font-bold uppercase tracking-wide ${zc.text}`}>{z.label}</p>
                  {m && <span className="text-[10px] text-neutral-500">— objectif {m.label}</span>}
                </div>
                <div className="space-y-1.5">
                  {ATELIERS.filter((a) => a.zone === z.id).map((a) => {
                    const active = project.ateliers.includes(a.nom);
                    return (
                      <button
                        key={a.nom}
                        onClick={() => toggleAtelier(a.nom)}
                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 border transition ${active ? `${zc.bgSoft} ${zc.border}` : "bg-neutral-950 border-neutral-800"}`}
                      >
                        <span className={`text-sm font-medium ${active ? zc.text : "text-neutral-300"}`}>{a.nom}</span>
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? `${zc.bg} border-transparent` : "border-neutral-700"}`}>
                          {active && <span className="w-2 h-2 rounded-full bg-neutral-950" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-1">3. Pourquoi ces choix ?</p>
        <p className="text-[11px] text-neutral-500 mb-3">L'argumentation compte plus que le choix lui-même : explique ton mobile pour chaque zone que tu travailles (envie, besoin, nécessité).</p>
        <div className="space-y-3">
          {ZONES.map((z) => {
            const zc = colorMap[z.color];
            const mId = project.mobiles[z.id];
            const m = mId ? mobileById(mId) : null;
            return (
              <div key={z.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${zc.bg}`} />
                  <p className={`text-xs font-bold ${zc.text}`}>{z.label}</p>
                  {m && <span className="text-[10px] text-neutral-500">— {m.label} · {m.nom}</span>}
                </div>
                <textarea
                  value={project.justifications[z.id]}
                  onChange={(e) => setProject((p) => ({ ...p, justifications: { ...p.justifications, [z.id]: e.target.value } }))}
                  placeholder={`Pourquoi ce choix pour ${z.label.toLowerCase()} ?`}
                  rows={2}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran : Séance / Historique (tonnage + charge RPE)
// ---------------------------------------------------------------------------

function derniereMoyenne(seancesHistorique, atelier) {
  for (let i = seancesHistorique.length - 1; i >= 0; i--) {
    const found = (seancesHistorique[i].ateliers || []).find((a) => a.atelier === atelier);
    if (found) return { ...found, date: seancesHistorique[i].date };
  }
  return null;
}

function SeanceHistorique({ project, seancesHistorique, onNouvelleSeance }) {
  const [rows, setRows] = useState([{ atelier: project.ateliers[0] || "", series: [{ charge: "", reps: "" }], ressenti: "" }]);
  const [rpe, setRpe] = useState(5);
  const [duree, setDuree] = useState(90);
  const [showForm, setShowForm] = useState(seancesHistorique.length === 0);

  const addRow = () => setRows((r) => [...r, { atelier: "", series: [{ charge: "", reps: "" }], ressenti: "" }]);
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));
  const addSerie = (i) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, series: [...row.series, { charge: "", reps: "" }] } : row)));
  const removeSerie = (i, si) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, series: row.series.filter((_, sidx) => sidx !== si) } : row)));
  const updateSerie = (i, si, field, val) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, series: row.series.map((s, sidx) => (sidx === si ? { ...s, [field]: val } : s)) } : row)));

  // Statistiques par atelier (moyenne des charges / répétitions sur les séries renseignées)
  const statsRow = (row) => {
    const remplies = row.series.filter((s) => s.charge && s.reps);
    const nb = remplies.length;
    const chargeMoy = nb ? remplies.reduce((a, s) => a + parseFloat(s.charge), 0) / nb : 0;
    const repsMoy = nb ? remplies.reduce((a, s) => a + parseFloat(s.reps), 0) / nb : 0;
    const tonnage = remplies.reduce((a, s) => a + parseFloat(s.charge) * parseFloat(s.reps), 0);
    return { nb, chargeMoy, repsMoy, tonnage };
  };

  const tonnageTotal = rows.reduce((sum, row) => sum + statsRow(row).tonnage, 0);
  const chargeSeance = Math.round(rpe * duree);

  const enregistrer = () => {
    const ateliersData = rows.filter((row) => row.atelier && statsRow(row).nb > 0).map((row) => {
      const s = statsRow(row);
      return {
        atelier: row.atelier,
        zone: atelierZone(row.atelier),
        nbSeries: s.nb,
        chargeMoyenne: Math.round(s.chargeMoy * 10) / 10,
        repsMoyenne: Math.round(s.repsMoy * 10) / 10,
        tonnage: Math.round(s.tonnage),
        ressenti: row.ressenti || null,
      };
    });
    const entry = {
      date: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
      tonnage: Math.round(tonnageTotal),
      rpe, duree, charge: chargeSeance,
      ateliers: ateliersData,
    };
    onNouvelleSeance(entry);
    setRows([{ atelier: "", series: [{ charge: "", reps: "" }], ressenti: "" }]);
    setRpe(5); setDuree(90);
    setShowForm(false);
  };

  const maxCharge = Math.max(...seancesHistorique.map((s) => s.charge), 1);

  return (
    <div className="px-5 pb-6 space-y-4">
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-orange-500 text-neutral-950 font-bold rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition"
        >
          <Plus size={18} /> Nouvelle séance
        </button>
      )}

      {showForm && (
        <Card>
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Ateliers travaillés</p>
          <div className="space-y-4">
            {rows.map((row, i) => {
              const zone = atelierZone(row.atelier);
              const z = zone ? zoneById(zone) : null;
              const mId = zone ? project.mobiles[zone] : null;
              const m = mId ? mobileById(mId) : null;
              const dernier = row.atelier ? derniereMoyenne(seancesHistorique, row.atelier) : null;
              const s = statsRow(row);
              return (
                <div key={i} className="border-b border-neutral-900 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={row.atelier}
                      onChange={(e) => updateRow(i, "atelier", e.target.value)}
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-[11px] text-neutral-300"
                    >
                      <option value="">Atelier…</option>
                      {ATELIERS.map((a) => <option key={a.nom} value={a.nom}>{a.nom}</option>)}
                    </select>
                    <button onClick={() => removeRow(i)} className="text-neutral-600 px-1">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {row.atelier && z && (
                    <p className={`text-[10px] mt-1 ${colorMap[z.color].text}`}>
                      {z.label}{!z.hasMobile ? " · piloté en durée / intensité" : m ? ` · objectif ${m.label} (${m.reps} rép.)` : " · aucun mobile défini pour cette zone"}
                    </p>
                  )}
                  {dernier && (
                    <p className="text-[10px] mt-0.5 text-neutral-500">
                      Dernière fois ({dernier.date}) : {dernier.nbSeries} séries · {dernier.chargeMoyenne}kg (moy.) · {dernier.repsMoyenne} rép (moy.)
                    </p>
                  )}

                  {row.atelier && (
                    <div className="mt-2 space-y-1.5">
                      {row.series.map((serie, si) => (
                        <div key={si} className="grid grid-cols-12 gap-1.5 items-center">
                          <span className="col-span-2 text-[10px] font-black text-neutral-500">Série {si + 1}</span>
                          <input value={serie.charge} onChange={(e) => updateSerie(i, si, "charge", e.target.value)} placeholder="kg" type="number"
                            className="col-span-4 bg-neutral-950 border border-neutral-800 rounded-lg px-1.5 py-1.5 text-[11px] text-neutral-300 text-center" />
                          <input value={serie.reps} onChange={(e) => updateSerie(i, si, "reps", e.target.value)} placeholder="rép" type="number"
                            className="col-span-4 bg-neutral-950 border border-neutral-800 rounded-lg px-1.5 py-1.5 text-[11px] text-neutral-300 text-center" />
                          <button onClick={() => removeSerie(i, si)} className="col-span-2 text-neutral-600 flex justify-center">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addSerie(i)} className="text-[10px] font-semibold text-orange-400 flex items-center gap-1">
                        <Plus size={12} /> Ajouter une série
                      </button>
                    </div>
                  )}

                  {row.atelier && s.nb > 0 && (
                    <div className="mt-2 bg-neutral-950 rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold">Série moyenne ({s.nb})</span>
                      <span className="text-xs font-bold text-neutral-200">{Math.round(s.chargeMoy * 10) / 10}kg × {Math.round(s.repsMoy * 10) / 10} rép</span>
                    </div>
                  )}

                  {row.atelier && (
                    <div className="flex gap-1 mt-2">
                      {RESSENTI.map((r) => {
                        const active = row.ressenti === r.id;
                        return (
                          <button
                            key={r.id}
                            onClick={() => updateRow(i, "ressenti", active ? "" : r.id)}
                            className={`flex-1 rounded-lg py-1.5 text-[10px] font-semibold flex items-center justify-center gap-1 border ${active ? "bg-orange-500/15 border-orange-500/40 text-orange-300" : "bg-neutral-950 border-neutral-800 text-neutral-500"}`}
                          >
                            <span className="font-black">{r.symbole}</span> {r.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={addRow} className="mt-3 text-xs font-semibold text-orange-400 flex items-center gap-1">
            <Plus size={14} /> Ajouter un atelier
          </button>
          <div className="mt-3 bg-neutral-950 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-neutral-500 font-semibold uppercase">Tonnage de la séance</span>
            <span className="text-xl font-black text-neutral-100">{Math.round(tonnageTotal).toLocaleString("fr-FR")} kg</span>
          </div>
        </Card>
      )}

      {showForm && (
        <Card>
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Ressenti de la séance (Borg)</p>
          <input
            type="range" min={0} max={10} value={rpe}
            onChange={(e) => setRpe(parseInt(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-2xl font-black text-orange-400">{rpe}</span>
            <span className="text-xs text-neutral-400">{BORG.find((b) => b.v === rpe)?.label}</span>
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-2">Durée de la séance (min)</p>
            <input
              type="number" value={duree} onChange={(e) => setDuree(parseInt(e.target.value) || 0)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200"
            />
          </div>

          <div className="mt-4 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-xs text-orange-300/80 font-semibold uppercase block">Charge de séance</span>
              <span className="text-[10px] text-neutral-500">RPE × durée</span>
            </div>
            <span className="text-2xl font-black text-orange-400">{chargeSeance} UA</span>
          </div>

          <button onClick={enregistrer} className="w-full mt-4 bg-orange-500 text-neutral-950 font-bold rounded-xl py-3 active:scale-[0.98] transition">
            Enregistrer la séance
          </button>
        </Card>
      )}

      {seancesHistorique.length > 0 && (
        <Card>
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Historique — charge de séance</p>
          <div className="flex items-end gap-2 h-32">
            {seancesHistorique.map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full bg-neutral-800 rounded-t-md relative flex items-end" style={{ height: "100%" }}>
                  <div
                    className="w-full bg-orange-500 rounded-t-md transition-all"
                    style={{ height: `${(s.charge / maxCharge) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-neutral-500">{s.date}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {seancesHistorique.slice().reverse().map((s, i) => (
              <div key={i} className="border-t border-neutral-800 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-400">{s.date}</span>
                  <span className="text-neutral-500">{s.tonnage} kg</span>
                  <span className="text-neutral-500">RPE {s.rpe}</span>
                  <span className="font-bold text-orange-400">{s.charge} UA</span>
                </div>
                {s.ateliers && s.ateliers.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {s.ateliers.map((a, ai) => (
                      <div key={ai} className="flex items-center justify-between text-[10px] text-neutral-600">
                        <span>{a.atelier}</span>
                        <span>{a.nbSeries}× · {a.chargeMoyenne}kg (moy.) · {a.repsMoyenne} rép (moy.)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran : Chrono récup
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Écran : Convertisseur de charge (%charge max ↔ répétitions)
// ---------------------------------------------------------------------------

// % représentatif de chaque mobile, pour la conversion (milieu de fourchette d'intensité)
const PCT_MOBILE = { r1: 0.95, r6: 0.80, r10: 0.70, r15: 0.55, r25: 0.40 };

// Correspondance répétitions réalisées → % de charge max (tableau de conversion)
function repsToPercent(reps) {
  const table = [
    { max: 1, pct: 100 }, { max: 2, pct: 95 }, { max: 3, pct: 90 }, { max: 5, pct: 85 },
    { max: 6, pct: 80 }, { max: 8, pct: 75 }, { max: 10, pct: 70 }, { max: 12, pct: 65 },
    { max: 15, pct: 60 }, { max: 20, pct: 55 }, { max: 25, pct: 50 }, { max: 28, pct: 40 },
  ];
  for (const t of table) if (reps <= t.max) return t.pct;
  return 35;
}

function ResultatsConversion({ charge100, mobileActif, zoneAtelier }) {
  return (
    <>
      <Card className="bg-orange-500/10 border-orange-500/30">
        <p className="text-xs uppercase tracking-widest text-orange-300/80 font-semibold">Charge théorique R1 estimée (100 %)</p>
        <p className="text-3xl font-black text-orange-400 mt-1">{charge100.toFixed(1)} <span className="text-base font-semibold text-neutral-500">kg</span></p>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Charges théoriques par mobile</p>
        <div className="space-y-2">
          {MOBILES.map((m) => {
            const c = colorMap[m.color];
            const val = charge100 * PCT_MOBILE[m.id];
            const isRef = mobileActif && m.id === mobileActif.id;
            return (
              <div key={m.id} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${isRef ? c.bgSoft : "bg-neutral-950"}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${c.bg}`} />
                  <span className={`text-sm font-semibold ${isRef ? c.text : "text-neutral-300"}`}>{m.label} · {m.nom}</span>
                  {zoneAtelier && zoneAtelier.mobileId === m.id && (
                    <span className="text-[9px] uppercase font-bold text-neutral-500 bg-neutral-900 rounded px-1.5 py-0.5">mon projet</span>
                  )}
                </div>
                <span className={`text-sm font-black ${isRef ? c.text : "text-neutral-200"}`}>{val.toFixed(1)} kg</span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-neutral-600 mt-3">Estimation à titre informatif à partir des % moyens de chaque mobile (R1 95 %, R6 80 %, R10 70 %, R15 55 %, R25 40 %) — à ajuster selon le ressenti réel.</p>
      </Card>
    </>
  );
}

function Convertisseur() {
  const [charge, setCharge] = useState("");
  const [mobileRef, setMobileRef] = useState(MOBILES[1]);
  const chargeNum = parseFloat(charge) || 0;
  const charge100Manuel = chargeNum > 0 ? chargeNum / PCT_MOBILE[mobileRef.id] : 0;

  return (
    <div className="px-5 pb-6 space-y-4">
      <Card className="bg-neutral-900/60">
        <div className="flex gap-2">
          <Info size={15} className="text-neutral-500 shrink-0 mt-0.5" />
          <p className="text-xs text-neutral-400 leading-relaxed">
            Renseigne une charge connue et le mobile auquel elle correspond : l'appli estime ta charge maximale (100 %) et la charge équivalente pour chacun des autres mobiles. Pour la recherche guidée de ta charge de référence atelier par atelier, va dans l'onglet Suivi.
          </p>
        </div>
      </Card>

      <Card>
        <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Charge connue</p>
        <input
          type="number" value={charge} onChange={(e) => setCharge(e.target.value)}
          placeholder="ex : 40"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-lg font-bold text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mt-4 mb-2">Correspond au mobile</p>
        <div className="grid grid-cols-5 gap-1">
          {MOBILES.map((m) => {
            const c = colorMap[m.color];
            const active = mobileRef.id === m.id;
            return (
              <button key={m.id} onClick={() => setMobileRef(m)}
                className={`rounded-lg py-2 text-center border transition ${active ? `${c.bgSoft} ${c.border} ring-1 ${c.ring}` : "bg-neutral-950 border-neutral-800"}`}>
                <p className={`text-[11px] font-black ${active ? c.text : "text-neutral-500"}`}>{m.label}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {chargeNum > 0 && <ResultatsConversion charge100={charge100Manuel} mobileActif={mobileRef} zoneAtelier={null} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran : Suivi — recherche de charge R15-R20 atelier par atelier + historique
// ---------------------------------------------------------------------------

function EssaiForm({ atelier, zone, mobileZoneId, onValider, onAnnuler }) {
  const [essais, setEssais] = useState([{ charge: "", reps: "" }, { charge: "", reps: "" }, { charge: "", reps: "" }, { charge: "", reps: "" }]);
  const updateEssai = (i, field, val) => setEssais((e) => e.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));
  const essaisRemplis = essais.filter((e) => e.charge && e.reps);
  const dernierEssai = essaisRemplis[essaisRemplis.length - 1];
  const pctDernier = dernierEssai ? repsToPercent(parseFloat(dernierEssai.reps)) : null;
  const charge100 = dernierEssai ? parseFloat(dernierEssai.charge) / (pctDernier / 100) : 0;
  const mobileCharge = mobileZoneId ? charge100 * PCT_MOBILE[mobileZoneId] : null;

  return (
    <Card className="border-orange-500/30">
      <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Essais sur « {atelier} » (viser 15 à 20 rép.)</p>
      <div className="space-y-2">
        {essais.map((e, i) => {
          const pct = e.charge && e.reps ? repsToPercent(parseFloat(e.reps)) : null;
          const est = pct ? parseFloat(e.charge) / (pct / 100) : null;
          const isLast = dernierEssai === e;
          return (
            <div key={i} className={`rounded-xl p-2.5 border ${isLast ? "bg-orange-500/10 border-orange-500/40" : "bg-neutral-950 border-neutral-800"}`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-neutral-500 w-10">Essai {i + 1}</span>
                <input value={e.charge} onChange={(ev) => updateEssai(i, "charge", ev.target.value)} placeholder="kg" type="number"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-neutral-200 text-center" />
                <input value={e.reps} onChange={(ev) => updateEssai(i, "reps", ev.target.value)} placeholder="rép. réalisées" type="number"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-neutral-200 text-center" />
              </div>
              {est && (
                <p className={`text-[10px] mt-1.5 ml-12 ${isLast ? "text-orange-300" : "text-neutral-600"}`}>
                  ≈ {est.toFixed(1)} kg en R1 théorique {isLast && "· essai retenu"}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {dernierEssai && (
        <div className="mt-3 bg-neutral-950 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500 font-semibold uppercase">R1 théorique</span>
            <span className="text-lg font-black text-orange-400">{charge100.toFixed(1)} kg</span>
          </div>
          {mobileCharge != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-semibold uppercase">Charge mobile projet</span>
              <span className="text-lg font-black text-neutral-100">{mobileCharge.toFixed(1)} kg</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button onClick={onAnnuler} className="flex-1 rounded-xl py-2.5 text-xs font-bold text-neutral-500 bg-neutral-950 border border-neutral-800">
          Annuler
        </button>
        <button
          disabled={!dernierEssai}
          onClick={() => onValider({
            atelier, zone,
            essais: essaisRemplis,
            chargeRef: parseFloat(dernierEssai.charge),
            repsRef: parseFloat(dernierEssai.reps),
            r1Theorique: charge100,
            mobileId: mobileZoneId || null,
            mobileCharge: mobileCharge,
          })}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 ${dernierEssai ? "bg-orange-500 text-neutral-950" : "bg-neutral-900 text-neutral-700"}`}
        >
          <Check size={14} /> Enregistrer
        </button>
      </div>
    </Card>
  );
}

function Suivi({ project, profil, historique, onNouvelleEntree }) {
  const [atelierOuvert, setAtelierOuvert] = useState(null);
  const ateliersProjet = project.ateliers.length > 0 ? project.ateliers : [];
  const entriesFor = (atelier) => historique.filter((h) => h.atelier === atelier);

  return (
    <div className="px-5 pb-6 space-y-4">
      <Card className="bg-neutral-900/60">
        <div className="flex gap-2">
          <Info size={15} className="text-neutral-500 shrink-0 mt-0.5" />
          <p className="text-xs text-neutral-400 leading-relaxed">
            Pour chaque atelier de ton projet, cherche ta charge de référence en 3-4 essais (15 à 20 rép.), puis enregistre. Tu retrouves ici ta progression, atelier par atelier. Ces données sont enregistrées de façon anonyme (par numéro) pour ton professeur.
          </p>
        </div>
      </Card>

      {ateliersProjet.length === 0 && (
        <Card><p className="text-sm text-neutral-500">Ajoute d'abord des ateliers dans l'onglet Projet.</p></Card>
      )}

      {ateliersProjet.map((atelier) => {
        const zone = atelierZone(atelier);
        const z = zone ? zoneById(zone) : null;
        const mobileZoneId = zone ? project?.mobiles?.[zone] : null;
        const entries = entriesFor(atelier);
        const dernier = entries[entries.length - 1];
        const maxCharge = Math.max(...entries.map((e) => e.chargeRef), 1);
        const isOuvert = atelierOuvert === atelier;

        return (
          <Card key={atelier}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-neutral-100">{atelier}</p>
                {z && <p className={`text-[10px] ${colorMap[z.color].text}`}>{z.label}</p>}
              </div>
              {dernier ? (
                <div className="text-right">
                  <p className="text-sm font-black text-orange-400">{dernier.chargeRef} kg</p>
                  <p className="text-[9px] text-neutral-600">{dernier.date}</p>
                </div>
              ) : (
                <span className="text-[10px] text-neutral-600">non testé</span>
              )}
            </div>

            {entries.length > 1 && (
              <div className="flex items-end gap-1 h-10 mt-3">
                {entries.map((e, i) => (
                  <div key={i} className="flex-1 bg-neutral-800 rounded-t-sm flex items-end" style={{ height: "100%" }}>
                    <div className="w-full bg-orange-500/70 rounded-t-sm" style={{ height: `${(e.chargeRef / maxCharge) * 100}%` }} />
                  </div>
                ))}
              </div>
            )}

            {!isOuvert && (
              <button onClick={() => setAtelierOuvert(atelier)} className="w-full mt-3 rounded-xl py-2 text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30">
                Nouveau test
              </button>
            )}

            {isOuvert && (
              <div className="mt-3">
                <EssaiForm
                  atelier={atelier}
                  zone={zone}
                  mobileZoneId={mobileZoneId}
                  onAnnuler={() => setAtelierOuvert(null)}
                  onValider={(entry) => { onNouvelleEntree(entry); setAtelierOuvert(null); }}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran : Mode professeur — PIN, sélection de classe, correspondance numéro → nom
// ---------------------------------------------------------------------------

function ProfEspace({ profNom, onDeconnexion }) {
  const [pin, setPin] = useState("");
  const [profConnecte, setProfConnecte] = useState(profNom ? { nom: profNom } : null);
  const [erreur, setErreur] = useState(false);
  const [classes, setClasses] = useState(null);
  const [classeChoisie, setClasseChoisie] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [dataEleves, setDataEleves] = useState({});
  const [eleveOuvert, setEleveOuvert] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [confirmReset, setConfirmReset] = useState(null); // null | "classe" | "tout"
  const [resetEnCours, setResetEnCours] = useState(false);
  const [confirmResetEleve, setConfirmResetEleve] = useState(null); // numero de l'élève à réinitialiser, ou null
  const [rafraichissement, setRafraichissement] = useState(false);

  useEffect(() => {
    if (profNom) {
      (async () => { const c = await loadClassesIndex(profNom); setClasses(c); })();
    }
  }, [profNom]);

  const valider = async () => {
    const p = findProfByPin(pin);
    if (p) { setProfConnecte(p); setErreur(false); const c = await loadClassesIndex(p.nom); setClasses(c); }
    else setErreur(true);
  };

  const rafraichirClasses = async () => {
    setRafraichissement(true);
    const c = await loadClassesIndex(profConnecte.nom);
    setClasses(c);
    setRafraichissement(false);
  };

  const choisirClasse = async (classe) => {
    setClasseChoisie(classe);
    setChargement(true);
    const m = await loadMapping(profConnecte.nom, classe);
    setMapping(m.slice().sort((a, b) => a.nom.localeCompare(b.nom)));
    setDataEleves({});
    setEleveOuvert(null);
    setChargement(false);
  };

  const rafraichirClasse = async () => {
    setRafraichissement(true);
    const m = await loadMapping(profConnecte.nom, classeChoisie);
    setMapping(m.slice().sort((a, b) => a.nom.localeCompare(b.nom)));
    setDataEleves({});
    setEleveOuvert(null);
    setRafraichissement(false);
  };

  const ouvrirEleve = async (numero) => {
    if (eleveOuvert === numero) { setEleveOuvert(null); return; }
    setEleveOuvert(numero);
    if (!dataEleves[numero]) {
      const tests = await loadStudentHistoriqueByNumero(profConnecte.nom, classeChoisie, numero);
      const seances = await loadStudentSeancesByNumero(profConnecte.nom, classeChoisie, numero);
      setDataEleves((d) => ({ ...d, [numero]: { tests, seances } }));
    }
  };

  const confirmerReset = async () => {
    setResetEnCours(true);
    if (confirmReset === "classe") {
      await resetClasse(profConnecte.nom, classeChoisie);
      setClasses((c) => (c || []).filter((x) => x !== classeChoisie));
      setClasseChoisie(null);
      setMapping([]);
    } else if (confirmReset === "tout") {
      await resetToutesLesDonnees(profConnecte.nom);
      setClasses([]);
      setClasseChoisie(null);
      setMapping([]);
    }
    setResetEnCours(false);
    setConfirmReset(null);
  };

  const confirmerResetEleve = async (numero) => {
    setResetEnCours(true);
    await resetEleve(profConnecte.nom, classeChoisie, numero);
    setDataEleves((d) => ({ ...d, [numero]: { tests: [], seances: [] } }));
    setResetEnCours(false);
    setConfirmResetEleve(null);
  };

  if (!profConnecte) {
    return (
      <div className="px-5 pb-6 space-y-4">
        <Card className="bg-neutral-900/60">
          <div className="flex gap-2">
            <Info size={15} className="text-neutral-500 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-400 leading-relaxed">Espace réservé au professeur : ton code d'accès personnel te donne uniquement accès à tes propres classes — jamais à celles d'un collègue.</p>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Ton code d'accès</p>
          <input
            type="password" value={pin} onChange={(e) => { setPin(e.target.value); setErreur(false); }}
            placeholder="Code"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-lg font-bold text-neutral-100 text-center tracking-widest placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {erreur && <p className="text-xs text-rose-400 mt-2">Code incorrect.</p>}
          <button onClick={valider} className="w-full mt-3 bg-orange-500 text-neutral-950 font-bold rounded-xl py-3">Déverrouiller</button>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-5 pb-6 space-y-4">
      {onDeconnexion && (
        <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center">
              <User size={15} className="text-orange-400" />
            </div>
            <p className="text-sm font-bold text-neutral-100">{profConnecte.nom}</p>
          </div>
          <button onClick={onDeconnexion} className="w-9 h-9 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center">
            <LogOut size={15} className="text-neutral-500" />
          </button>
        </div>
      )}
      {!classeChoisie && (
        <>
          <Card className="bg-neutral-900/60">
            <div className="flex gap-2">
              <Info size={15} className="text-neutral-500 shrink-0 mt-0.5" />
              <p className="text-xs text-neutral-400 leading-relaxed">Connecté en tant que <span className="text-neutral-200 font-semibold">{profConnecte.nom}</span>. Choisis la classe que tu veux observer.</p>
            </div>
          </Card>
          <button onClick={rafraichirClasses} disabled={rafraichissement} className="w-full flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-800 rounded-xl py-2.5 text-xs font-bold text-neutral-400">
            <RotateCcw size={13} className={rafraichissement ? "animate-spin" : ""} /> {rafraichissement ? "Actualisation…" : "Actualiser les classes"}
          </button>
          {classes && classes.length === 0 && <Card><p className="text-sm text-neutral-500">Aucune classe enregistrée pour l'instant.</p></Card>}
          {classes && classes.map((c) => (
            <button key={c} onClick={() => choisirClasse(c)} className="w-full flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3.5">
              <span className="text-sm font-bold text-neutral-100">{c}</span>
              <ChevronRight size={16} className="text-neutral-600" />
            </button>
          ))}

          {classes && classes.length > 0 && confirmReset !== "tout" && (
            <button onClick={() => setConfirmReset("tout")} className="w-full text-center text-xs font-semibold text-rose-500/70 py-2">
              Réinitialiser toutes les données
            </button>
          )}
          {confirmReset === "tout" && (
            <Card className="border-rose-500/40 bg-rose-500/5">
              <p className="text-sm font-bold text-rose-400">Tout réinitialiser ?</p>
              <p className="text-xs text-neutral-400 mt-1">Supprime définitivement toutes les classes et toutes les données de tous les élèves. Impossible à annuler.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setConfirmReset(null)} className="flex-1 rounded-xl py-2.5 text-xs font-bold text-neutral-400 bg-neutral-900 border border-neutral-800">Annuler</button>
                <button disabled={resetEnCours} onClick={confirmerReset} className="flex-1 rounded-xl py-2.5 text-xs font-bold text-neutral-950 bg-rose-500">
                  {resetEnCours ? "…" : "Confirmer la suppression"}
                </button>
              </div>
            </Card>
          )}
        </>
      )}

      {classeChoisie && (
        <>
          <button onClick={() => { setClasseChoisie(null); setConfirmReset(null); }} className="text-xs font-semibold text-neutral-500">← Changer de classe</button>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">{classeChoisie} — {mapping.length} élève(s)</p>
            <button onClick={rafraichirClasse} disabled={rafraichissement} className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-500">
              <RotateCcw size={12} className={rafraichissement ? "animate-spin" : ""} /> Actualiser
            </button>
          </div>

          {chargement && <Card><p className="text-sm text-neutral-500">Chargement…</p></Card>}

          {mapping.map((eleve) => {
            const data = dataEleves[eleve.numero];
            const isOuvert = eleveOuvert === eleve.numero;
            return (
              <Card key={eleve.numero}>
                <button onClick={() => ouvrirEleve(eleve.numero)} className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                      <User size={14} className="text-neutral-400" />
                    </div>
                    <p className="text-sm font-bold text-neutral-100">{eleve.prenom} {eleve.nom}</p>
                  </div>
                  <ChevronRight size={16} className={`text-neutral-600 transition ${isOuvert ? "rotate-90" : ""}`} />
                </button>

                {isOuvert && (
                  <div className="mt-3 space-y-3">
                    {!data && <p className="text-xs text-neutral-600">Chargement…</p>}

                    {data && (
                      <div>
                        <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1.5">Tests de charge de référence (R15-R20)</p>
                        {data.tests.length === 0 && <p className="text-xs text-neutral-600">Aucun test enregistré.</p>}
                        <div className="space-y-1.5">
                          {data.tests.slice().reverse().map((e, i) => (
                            <div key={i} className="bg-neutral-950 rounded-lg px-3 py-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-neutral-200">{e.atelier}</span>
                                <span className="text-neutral-600">{e.date}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-500">
                                <span>Réf. {e.chargeRef}kg × {e.repsRef}rép</span>
                                <span>R1 ≈ {e.r1Theorique.toFixed(1)}kg</span>
                                {e.mobileId && <span>{mobileById(e.mobileId)?.label} ≈ {e.mobileCharge.toFixed(1)}kg</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {data && (
                      <div>
                        <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1.5">Séances d'entraînement</p>
                        {data.seances.length === 0 && <p className="text-xs text-neutral-600">Aucune séance enregistrée.</p>}
                        <div className="space-y-2">
                          {data.seances.slice().reverse().map((s, i) => (
                            <div key={i} className="bg-neutral-950 rounded-lg px-3 py-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-neutral-200">{s.date}</span>
                                <span className="text-neutral-500">{s.tonnage}kg · RPE {s.rpe} · {s.charge} UA</span>
                              </div>
                              {s.ateliers && s.ateliers.length > 0 && (
                                <div className="mt-1.5 space-y-1">
                                  {s.ateliers.map((a, ai) => (
                                    <div key={ai} className="flex items-center justify-between text-[10px] text-neutral-500">
                                      <span>{a.atelier}</span>
                                      <span>
                                        {a.nbSeries}× · {a.chargeMoyenne}kg (moy.) · {a.repsMoyenne} rép (moy.)
                                        {a.ressenti && ` · ${RESSENTI.find((r) => r.id === a.ressenti)?.symbole || ""}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {data && confirmResetEleve !== eleve.numero && (
                      <button onClick={() => setConfirmResetEleve(eleve.numero)} className="w-full text-center text-[11px] font-semibold text-rose-500/60 py-1.5">
                        Réinitialiser cet élève
                      </button>
                    )}
                    {confirmResetEleve === eleve.numero && (
                      <div className="bg-rose-500/5 border border-rose-500/40 rounded-xl p-3">
                        <p className="text-xs text-neutral-300">Effacer toutes les données de <span className="font-bold">{eleve.prenom} {eleve.nom}</span> (tests, séances, projet) ? L'élève reste dans la classe, prêt pour une nouvelle utilisation à zéro.</p>
                        <div className="flex gap-2 mt-2.5">
                          <button onClick={() => setConfirmResetEleve(null)} className="flex-1 rounded-lg py-2 text-[11px] font-bold text-neutral-400 bg-neutral-900 border border-neutral-800">Annuler</button>
                          <button disabled={resetEnCours} onClick={() => confirmerResetEleve(eleve.numero)} className="flex-1 rounded-lg py-2 text-[11px] font-bold text-neutral-950 bg-rose-500">
                            {resetEnCours ? "…" : "Confirmer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {!chargement && confirmReset !== "classe" && (
            <button onClick={() => setConfirmReset("classe")} className="w-full text-center text-xs font-semibold text-rose-500/70 py-2">
              Réinitialiser cette classe
            </button>
          )}
          {confirmReset === "classe" && (
            <Card className="border-rose-500/40 bg-rose-500/5">
              <p className="text-sm font-bold text-rose-400">Réinitialiser {classeChoisie} ?</p>
              <p className="text-xs text-neutral-400 mt-1">Supprime définitivement les {mapping.length} élève(s) de cette classe et toutes leurs données (tests, séances). Impossible à annuler.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setConfirmReset(null)} className="flex-1 rounded-xl py-2.5 text-xs font-bold text-neutral-400 bg-neutral-900 border border-neutral-800">Annuler</button>
                <button disabled={resetEnCours} onClick={confirmerReset} className="flex-1 rounded-xl py-2.5 text-xs font-bold text-neutral-950 bg-rose-500">
                  {resetEnCours ? "…" : "Confirmer la suppression"}
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ChronoRecup() {
  const [mobile, setMobile] = useState(MOBILES[1]);
  const [seconds, setSeconds] = useState(mobile.recupSec);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);

  const beep = () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = setInterval(() => setSeconds((s) => s - 1), 1000);
    } else if (running && seconds === 0) {
      beep();
      setRunning(false);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, seconds]);

  const selectMobile = (m) => {
    setMobile(m);
    setSeconds(m.recupSec);
    setRunning(false);
  };

  const reset = () => { setSeconds(mobile.recupSec); setRunning(false); };
  const c = colorMap[mobile.color];
  const pct = 1 - seconds / mobile.recupSec;

  return (
    <div className="px-5 pb-6 space-y-4">
      <Card>
        <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold mb-3">Mobile travaillé</p>
        <div className="grid grid-cols-5 gap-1">
          {MOBILES.map((m) => {
            const active = mobile.id === m.id;
            const cc = colorMap[m.color];
            return (
              <button key={m.id} onClick={() => selectMobile(m)}
                className={`rounded-lg py-2 text-xs font-bold ${active ? `${cc.bg} text-neutral-950` : "bg-neutral-950 text-neutral-500 border border-neutral-800"}`}>
                {m.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col items-center py-8">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#262626" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="45" fill="none" strokeWidth="6" strokeLinecap="round"
              className={c.text.replace("text-", "stroke-")}
              strokeDasharray={2 * Math.PI * 45}
              strokeDashoffset={2 * Math.PI * 45 * (1 - pct)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="text-5xl font-black text-neutral-50 tabular-nums">{seconds}</span>
        </div>
        <p className="text-xs text-neutral-500 mt-3">récupération {mobile.label} — {mobile.recup}</p>

        <div className="flex gap-3 mt-6">
          <button onClick={() => setRunning((r) => !r)} className={`w-16 h-16 rounded-full flex items-center justify-center ${c.bg} text-neutral-950`}>
            {running ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
          </button>
          <button onClick={reset} className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300">
            <RotateCcw size={20} />
          </button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const TABS = [
  { id: "accueil", label: "Accueil", icon: Home },
  { id: "ateliers", label: "Ateliers", icon: Dumbbell },
  { id: "mobiles", label: "Mobiles", icon: Target },
  { id: "projet", label: "Projet", icon: ClipboardList },
  { id: "suivi", label: "Suivi", icon: TrendingUp },
  { id: "seance", label: "Séances", icon: History },
  { id: "convert", label: "Calc.", icon: Calculator },
  { id: "chrono", label: "Chrono", icon: TimerIcon },
];

const PROJET_VIDE = {
  mobiles: { "membres-sup": null, "membres-inf": null, "tronc-avant": null, "tronc-dos": null, cardio: null },
  ateliers: [],
  justifications: { "membres-sup": "", "membres-inf": "", "tronc-avant": "", "tronc-dos": "", cardio: "" },
};

export default function MuscuPro() {
  const [tab, setTab] = useState("accueil");
  const [project, setProject] = useState(PROJET_VIDE);

  const [profil, setProfil] = useState(null);
  const [profilLoaded, setProfilLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [historique, setHistorique] = useState([]);
  const [seancesHistorique, setSeancesHistorique] = useState([]);
  const [projetCharge, setProjetCharge] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await loadProfil();
      setProfil(p);
      setProfilLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!profil || profil.type !== "eleve") return;
    setProjetCharge(false);
    (async () => {
      const h = await loadHistorique(profil);
      setHistorique(h);
      const s = await loadSeances(profil);
      setSeancesHistorique(s);
      const proj = await loadProjet(profil);
      setProject(proj || PROJET_VIDE);
      setProjetCharge(true);
    })();
  }, [profil]);

  // Enregistrement automatique du projet à chaque modification (une fois le
  // chargement initial terminé, pour ne pas écraser les données existantes
  // par le projet vide avant qu'elles n'aient eu le temps d'arriver).
  useEffect(() => {
    if (!profil || profil.type !== "eleve" || !projetCharge) return;
    saveProjet(profil, project);
  }, [project, profil, projetCharge]);

  const handleValiderEleve = async (saisie) => {
    const complet = await registerProfil(saisie, profil && profil.type === "eleve" ? profil : null);
    setProfil(complet);
    setEditing(false);
  };

  const handleValiderProf = (identiteProf) => {
    saveProfilStorage(identiteProf);
    setProfil(identiteProf);
    setEditing(false);
  };

  const handleNouvelleEntree = async (entry) => {
    const withDate = { ...entry, date: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) };
    const next = [...historique, withDate];
    setHistorique(next);
    await saveHistorique(profil, next);
  };

  const handleNouvelleSeance = async (entry) => {
    const next = [...seancesHistorique, entry];
    setSeancesHistorique(next);
    await saveSeances(profil, next);
  };

  const handleDeconnexion = async () => {
    if (profil && profil.type === "eleve") {
      await saveProjet(profil, project);
    }
    clearProfilStorage();
    setProfil(null);
    setHistorique([]);
    setSeancesHistorique([]);
    setProject(PROJET_VIDE);
    setProjetCharge(false);
    setTab("accueil");
  };

  const titles = {
    accueil: ["Muscu Pro", "by C. Guilhem"],
    mobiles: ["Les mobiles", "R1 · R6 · R10 · R15 · R25"],
    ateliers: ["Les ateliers", "Matériel de la salle"],
    projet: ["Mon projet", "Zone par zone, argumenté"],
    seance: ["Mes séances", "Tonnage & charge perçue"],
    suivi: ["Suivi", "Charge de référence & progression"],
    convert: ["Calculateur", "Charge ↔ % ↔ répétitions"],
    chrono: ["Chrono récup", "Adapté au mobile choisi"],
  };

  if (!profilLoaded) {
    return <div className="min-h-screen bg-neutral-950" />;
  }
  if (!profil || editing) {
    return (
      <Identification
        onValidateEleve={handleValiderEleve}
        onValidateProf={handleValiderProf}
        initial={editing && profil && profil.type === "eleve" ? profil : null}
      />
    );
  }

  // ---- Connecté en tant que professeur : espace dédié, sans onglets élève ----
  if (profil.type === "prof") {
    return (
      <div className="min-h-screen bg-neutral-950 flex justify-center">
        <div className="w-full max-w-sm bg-neutral-950 min-h-screen flex flex-col">
          <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur border-b border-neutral-900">
            <Header title="Mode professeur" subtitle="Correspondance numéro ↔ nom" />
          </div>
          <div className="flex-1 overflow-y-auto pt-4">
            <ProfEspace profNom={profil.nom} onDeconnexion={handleDeconnexion} />
          </div>
        </div>
      </div>
    );
  }

  // ---- Connecté en tant qu'élève : appli complète ----
  return (
    <div className="min-h-screen bg-neutral-950 flex justify-center">
      <div className="w-full max-w-sm bg-neutral-950 min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur border-b border-neutral-900">
          <Header title={titles[tab][0]} subtitle={titles[tab][1]} />
        </div>

        <div className="flex-1 overflow-y-auto pt-4">
          {tab === "accueil" && <Accueil setTab={setTab} sessions={seancesHistorique} project={project} profil={profil} onEditProfil={() => setEditing(true)} onDeconnexion={handleDeconnexion} />}
          {tab === "mobiles" && <Mobiles />}
          {tab === "ateliers" && <Ateliers />}
          {tab === "projet" && <Projet project={project} setProject={setProject} />}
          {tab === "seance" && <SeanceHistorique project={project} seancesHistorique={seancesHistorique} onNouvelleSeance={handleNouvelleSeance} />}
          {tab === "suivi" && <Suivi project={project} profil={profil} historique={historique} onNouvelleEntree={handleNouvelleEntree} />}
          {tab === "convert" && <Convertisseur />}
          {tab === "chrono" && <ChronoRecup />}
        </div>

        <div className="sticky bottom-0 bg-neutral-950 border-t border-neutral-900 flex justify-around py-2 px-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} className="flex flex-col items-center gap-1 px-2 py-1.5 min-w-0">
                <Icon size={18} className={active ? "text-orange-400" : "text-neutral-600"} />
                <span className={`text-[9px] font-semibold ${active ? "text-orange-400" : "text-neutral-600"}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
