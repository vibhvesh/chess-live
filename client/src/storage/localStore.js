/**
 * Persist seats, settings, and games in the browser so refresh/reconnect
 * and PGN review work with no backend. Seats live in localStorage (small,
 * sync). Game records go to IndexedDB with a localStorage fallback.
 */

const PREFIX = "chess-live";
const DB_NAME = "chess-live";
const DB_VERSION = 1;
const GAMES = "games";

function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function seatKey(gameId) {
  return `${PREFIX}:seat:${gameId}`;
}

export function saveSeat(gameId, seat) {
  lsSet(seatKey(gameId), seat);
}

export function loadSeat(gameId) {
  return lsGet(seatKey(gameId));
}

export function saveSettings(settings) {
  lsSet(`${PREFIX}:settings`, { ...loadSettings(), ...settings });
}

export function loadSettings() {
  return lsGet(`${PREFIX}:settings`, {});
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GAMES)) {
        const store = db.createObjectStore(GAMES, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const mem = new Map();

function fallbackSave(game) {
  mem.set(game.id, game);
  try {
    const index = lsGet(`${PREFIX}:games-index`, []);
    const next = [game.id, ...index.filter((id) => id !== game.id)].slice(0, 50);
    lsSet(`${PREFIX}:games-index`, next);
    lsSet(`${PREFIX}:game:${game.id}`, game);
  } catch {
    /* quota */
  }
}

function fallbackLoad(id) {
  return mem.get(id) || lsGet(`${PREFIX}:game:${id}`);
}

function fallbackList() {
  const index = lsGet(`${PREFIX}:games-index`, []);
  return index.map((id) => fallbackLoad(id)).filter(Boolean);
}

export async function saveGame(game) {
  if (!game?.id) return game;
  const record = { ...game, updatedAt: game.updatedAt || new Date().toISOString() };
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(GAMES, "readwrite");
      tx.objectStore(GAMES).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    fallbackSave(record);
  }
  return record;
}

export async function loadGame(id) {
  try {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(GAMES, "readonly");
      const req = tx.objectStore(GAMES).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row || fallbackLoad(id);
  } catch {
    return fallbackLoad(id);
  }
}

export async function listGames() {
  try {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(GAMES, "readonly");
      const req = tx.objectStore(GAMES).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  } catch {
    return fallbackList();
  }
}
