// ── Tiny IndexedDB wrapper for sheet photos ──
// Photos are binary-ish and can be large, so they live in IndexedDB rather than
// localStorage (which holds the character JSON). Note: photos are therefore NOT
// part of the JSON export — they stay on the device.
// Each photo carries a `charId` so every character in the roster has its own
// Paper tab. Photos saved before the roster existed have no charId; the app
// assigns them to the migrated character via claimOrphanPhotos().

const DB_NAME = "dnd-photos";
const STORE = "photos";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addPhoto(photo) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(photo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Photos for one character, oldest first. Without a charId, returns everything.
export async function getPhotos(charId) {
  const all = await getAllPhotos();
  return all
    .filter((p) => !charId || p.charId === charId)
    .sort((a, b) => a.created - b.created);
}

async function putMany(photos) {
  if (!photos.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    photos.forEach((p) => store.put(p));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Attach any photos saved before the roster existed to the given character.
export async function claimOrphanPhotos(charId) {
  const all = await getAllPhotos();
  await putMany(all.filter((p) => !p.charId).map((p) => ({ ...p, charId })));
}

// Remove every photo belonging to a character (used when deleting it).
export async function deletePhotosFor(charId) {
  const all = await getAllPhotos();
  const ids = all.filter((p) => p.charId === charId).map((p) => p.id);
  if (!ids.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updatePhotoCaption(id, caption) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const p = getReq.result;
      if (p) {
        p.caption = caption;
        store.put(p);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Downscale/compress an image File into a JPEG data URL so storage stays sane.
export function resizeImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      if (longest > maxDim) {
        const scale = maxDim / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}
