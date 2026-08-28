// Adaptateur de stockage local (remplace window.storage, propre à l'aperçu Claude.ai,
// par localStorage pour un fonctionnement autonome une fois l'app déployée).
const PREFIX = "fractionne-gps-pro:";

export const storage = {
  async get(key) {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return { key, value: raw };
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
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
