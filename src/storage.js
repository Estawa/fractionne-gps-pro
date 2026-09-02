// Adaptateur de stockage local (remplace window.storage, propre à l'aperçu Claude.ai,
// par localStorage pour un fonctionnement autonome une fois l'app déployée).
const PREFIX = "fractionne-gps-pro:";

export const storage = {
  async get(key) {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return { key, value: raw };
  },
  // Écrit puis relit immédiatement la valeur pour s'assurer qu'elle a bien été
  // persistée (protection contre un stockage plein, corrompu ou refusé par le
  // navigateur qui laisserait croire à une sauvegarde réussie alors que la
  // séance serait en réalité vide ou absente à la prochaine ouverture).
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
    const check = localStorage.getItem(PREFIX + key);
    if (check !== value) return null;
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true };
  },
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
    }
    return { keys };
  },
};
