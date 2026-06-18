// Private workspace storage (projects) in IndexedDB.
// Kept in a SEPARATE database from tracks so the two features never collide.
// Everything here lives only in THIS browser/device — nothing is uploaded.

const DB_NAME = 'experimentasound-studio';
const DB_VERSION = 1;
const STORE = 'projects';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function getProjects() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(project) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(project);
    req.onsuccess = () => resolve(project);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProject(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export function newProject(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    title: 'Novo projeto',
    status: 'ideia',
    bpm: 120,
    key: '',
    genre: '',
    notes: '',
    lyrics: '',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}
