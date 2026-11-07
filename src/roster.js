// ── Roster: multiple characters in localStorage ──
// Layout:
//   dnd-sheet-roster-v1        → { activeId, ids: [charId, ...] }
//   dnd-sheet-char-<charId>    → the character JSON
// Older builds stored a single sheet under "dnd-sheet-v1"; on first load it is
// adopted as the first roster entry (the old key is left in place as a backup).

export const ROSTER_KEY = "dnd-sheet-roster-v1";
export const LEGACY_KEY = "dnd-sheet-v1";
const CHAR_PREFIX = "dnd-sheet-char-";

export const charKey = (id) => `${CHAR_PREFIX}${id}`;

export function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`;
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function loadRoster() {
  const r = readJSON(ROSTER_KEY);
  if (r && Array.isArray(r.ids)) return { activeId: r.activeId, ids: r.ids.filter(Boolean) };
  return null;
}

export function saveRoster(roster) {
  writeJSON(ROSTER_KEY, { activeId: roster.activeId, ids: roster.ids });
}

export function loadCharacter(id) {
  return readJSON(charKey(id));
}

export function saveCharacter(id, data) {
  return writeJSON(charKey(id), data);
}

export function removeCharacter(id) {
  try { localStorage.removeItem(charKey(id)); } catch {}
}

// Returns { roster, migratedLegacyId } — migratedLegacyId is set only when an
// old single-sheet save was just adopted, so callers can claim its photos.
export function loadOrMigrateRoster() {
  const existing = loadRoster();
  if (existing && existing.ids.length) {
    if (!existing.ids.includes(existing.activeId)) existing.activeId = existing.ids[0];
    return { roster: existing, migratedLegacyId: null };
  }
  const legacy = readJSON(LEGACY_KEY);
  if (legacy && typeof legacy === "object") {
    const id = newId();
    saveCharacter(id, { ...legacy, id });
    const roster = { activeId: id, ids: [id] };
    saveRoster(roster);
    return { roster, migratedLegacyId: id };
  }
  return { roster: { activeId: null, ids: [] }, migratedLegacyId: null };
}

// Lightweight summaries for the character picker (reads each stored sheet).
export function summarize(ids) {
  return ids.map((id) => {
    const c = loadCharacter(id) || {};
    return { id, name: c.name || "Unnamed", class: c.class || "", race: c.race || "", level: c.level || 1 };
  });
}
