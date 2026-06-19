// Local-preview payloads can be large: applying a background image to every page
// embeds the same multi-megabyte base64 image once per page, and photo galleries
// add more. sessionStorage caps out around ~5MB and throws QuotaExceededError, so
// we stash the payload in IndexedDB (much larger quota, async) instead.

const DB_NAME = "viup_preview";
const STORE_NAME = "kv";
const KEY = "viup_local_preview";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalPreview(payload: unknown): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      // Store the structured object directly — IndexedDB clones it, so there is no
      // giant JSON string to build and no per-key size limit to trip over.
      tx.objectStore(STORE_NAME).put(payload, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadLocalPreview<T = unknown>(): Promise<T | null> {
  const db = await openDB();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
