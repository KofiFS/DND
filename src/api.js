// ── D&D 5e SRD API helper (https://www.dnd5eapi.co) ──
// CORS-enabled, no key required. We use the versioned /api/2014 endpoints
// directly to avoid a redirect hop.

const BASE = "https://www.dnd5eapi.co/api/2014";

// Categories we search across. label = how it shows in the UI.
const CATEGORIES = [
  { resource: "spells", label: "Spell" },
  { resource: "features", label: "Feature" },
  { resource: "traits", label: "Trait" },
  { resource: "equipment", label: "Gear" },
  { resource: "conditions", label: "Condition" },
  { resource: "magic-items", label: "Magic Item" },
];

// In-memory cache of each category's full index list, so typing is instant
// after the first fetch of each list.
const listCache = {};
const detailCache = {};

async function getList(resource) {
  if (listCache[resource]) return listCache[resource];
  const res = await fetch(`${BASE}/${resource}`);
  if (!res.ok) throw new Error(`${resource}: ${res.status}`);
  const json = await res.json();
  listCache[resource] = json.results || [];
  return listCache[resource];
}

// Search every category for names containing the query (case-insensitive).
// Returns a flat, ranked list of { index, name, resource, label, level? }.
export async function search(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const perCategory = await Promise.all(
    CATEGORIES.map(async ({ resource, label }) => {
      let items = [];
      try {
        items = await getList(resource);
      } catch {
        return [];
      }
      return items
        .filter((it) => it.name.toLowerCase().includes(q))
        .slice(0, 10)
        .map((it) => ({
          index: it.index,
          name: it.name,
          level: it.level,
          resource,
          label,
        }));
    })
  );

  const flat = perCategory.flat();
  // Rank: exact match first, then prefix match, then the rest — alphabetical.
  return flat
    .sort((a, b) => {
      const an = a.name.toLowerCase();
      const bn = b.name.toLowerCase();
      const score = (n) => (n === q ? 0 : n.startsWith(q) ? 1 : 2);
      return score(an) - score(bn) || an.localeCompare(bn);
    })
    .slice(0, 40);
}

// Fetch the full record for a single result.
export async function fetchDetail(resource, index) {
  const key = `${resource}/${index}`;
  if (detailCache[key]) return detailCache[key];
  const res = await fetch(`${BASE}/${resource}/${index}`);
  if (!res.ok) throw new Error(`${key}: ${res.status}`);
  const json = await res.json();
  detailCache[key] = json;
  return json;
}

// Look up a single name across the SRD and return formatted rules text,
// preferring an exact name match. Used by "Fetch from 5e SRD" buttons.
export async function describe(name) {
  const results = await search(name);
  if (!results.length) return null;
  const target = name.trim().toLowerCase();
  const exact = results.find((r) => r.name.toLowerCase() === target);
  const pick = exact || results[0];
  const raw = await fetchDetail(pick.resource, pick.index);
  return formatDetail(pick.resource, raw);
}

// Turn an API record into readable rules text for storing/display.
export function formatDetail(resource, d) {
  if (!d) return "";
  const lines = [];

  if (resource === "spells") {
    const meta = [];
    meta.push(d.level === 0 ? "Cantrip" : `Level ${d.level}`);
    if (d.school?.name) meta.push(d.school.name);
    if (d.casting_time) meta.push(d.casting_time);
    lines.push(meta.join(" · "));

    const sub = [];
    if (d.range) sub.push(`Range: ${d.range}`);
    if (Array.isArray(d.components)) {
      let comp = d.components.join(", ");
      if (d.material) comp += ` (${d.material})`;
      sub.push(`Components: ${comp}`);
    }
    if (d.duration) sub.push(`Duration: ${d.duration}`);
    if (d.concentration) sub.push("Concentration");
    if (d.ritual) sub.push("Ritual");
    if (sub.length) lines.push(sub.join(" · "));
  } else if (resource === "equipment") {
    const meta = [];
    if (d.equipment_category?.name) meta.push(d.equipment_category.name);
    if (d.cost) meta.push(`${d.cost.quantity} ${d.cost.unit}`);
    if (d.weight) meta.push(`${d.weight} lb`);
    if (d.damage) {
      meta.push(`${d.damage.damage_dice} ${d.damage.damage_type?.name || ""}`.trim());
    }
    if (d.armor_class) meta.push(`AC ${d.armor_class.base}`);
    if (meta.length) lines.push(meta.join(" · "));
    if (Array.isArray(d.properties) && d.properties.length) {
      lines.push("Properties: " + d.properties.map((p) => p.name).join(", "));
    }
  } else if (resource === "magic-items") {
    if (d.rarity?.name) lines.push(d.rarity.name);
    if (d.equipment_category?.name) lines.push(d.equipment_category.name);
  } else if (resource === "features") {
    const meta = [];
    if (d.class?.name) meta.push(d.class.name);
    if (d.level != null) meta.push(`Level ${d.level}`);
    if (meta.length) lines.push(meta.join(" · "));
  } else if (resource === "traits") {
    if (Array.isArray(d.races) && d.races.length) {
      lines.push("Races: " + d.races.map((r) => r.name).join(", "));
    }
  }

  // Body description (most records).
  const body = Array.isArray(d.desc) ? d.desc.join("\n\n") : d.desc;
  if (body) lines.push(body);

  if (Array.isArray(d.higher_level) && d.higher_level.length) {
    lines.push("At Higher Levels: " + d.higher_level.join(" "));
  }

  return lines.filter(Boolean).join("\n\n");
}
