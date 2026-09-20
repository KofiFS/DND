// ── Tiny IndexedDB wrapper for battle/region maps ──
// Maps are large images plus a list of pins, so they live in IndexedDB rather
// than localStorage (which holds the character JSON). Like photos, maps are NOT
// part of the JSON export — they stay on the device.
//
// This is a separate database from "dnd-photos" on purpose: adding a store to
// that one would mean bumping its version and migrating sheets that already
// have photos saved.

const DB_NAME = "dnd-maps";
const STORE = "maps";

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

export async function addMap(map) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(map);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMaps() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result || [])
          .sort((a, b) => a.created - b.created)
          .map((m) => ({ ...m, markers: m.markers || [] })),
      );
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMap(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Patch stored fields (name, markers, …) without re-reading the image blob into
// React state. Read-modify-write inside one transaction so a rename and a pin
// drag landing together cannot clobber each other.
export async function patchMap(id, fields) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const m = getReq.result;
      if (m) store.put({ ...m, ...fields });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Maps are read at high zoom, so they keep more detail than sheet photos: a
// larger cap, and PNG is preserved when it stays a sane size, because JPEG
// smears the thin lines of a grid and the small text of a label.
const MAX_DIM = 2400;
const PNG_BUDGET = 4 * 1024 * 1024;

export function prepareMapImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: width, naturalHeight: height } = img;
      const longest = Math.max(width, height);
      if (longest > MAX_DIM) {
        const scale = MAX_DIM / longest;
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
        let dataUrl = null;
        if (file.type === "image/png" || file.type === "image/webp") {
          const png = canvas.toDataURL("image/png");
          if (png.length <= PNG_BUDGET) dataUrl = png;
        }
        if (!dataUrl) dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        resolve({ dataUrl, w: width, h: height });
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
