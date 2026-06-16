// Local track storage using IndexedDB.
// Lets the producer "upload" tracks straight from the browser and have them
// persist across reloads on this device — works fully on static GitHub Pages.
// These tracks are LOCAL to this browser; use the GitHub publish flow to make
// them public for every visitor.

const DB_NAME = 'experimentasound';
const DB_VERSION = 1;
const STORE = 'tracks';

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

export async function addLocalTrack(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalTracks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalTrack(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalTrack(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Turn a stored record (with Blobs) into a playable track object with object URLs.
export function recordToTrack(record) {
  return {
    id: record.id,
    title: record.title,
    artist: record.artist,
    genre: record.genre || '',
    src: URL.createObjectURL(record.audioBlob),
    cover: record.coverBlob ? URL.createObjectURL(record.coverBlob) : '',
    duration: record.duration ?? null,
    downloadable: record.downloadable !== false,
    fileName: record.fileName || (record.title + '.mp3'),
    source: 'local',
    addedAt: record.addedAt
  };
}
