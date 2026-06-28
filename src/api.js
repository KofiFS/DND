// ── D&D 5e SRD API helper (https://www.dnd5eapi.co) ──
// CORS-enabled, no key required. We use the versioned /api/2014 endpoints
// directly to avoid a redirect hop. Full per-category name lists are cached,
// which lets us do client-side fuzzy ("did you mean") matching on typos.

const BASE = "https://www.dnd5eapi.co/api/2014";

// Categories we search across. label = how it shows in the UI.
const CATEGORIES = [
  { resource: "spells", label: "Spell" },
  { resource: "features", label: "Feature" },
  { resource: "traits", label: "Trait" },
  { resource: "equipment", label: "Gear" },
  { resource: "magic-items", label: "Magic Item" },
  { resource: "conditions", label: "Condition" },
  { resource: "monsters", label: "Monster" },
  { resource: "races", label: "Race" },
];

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

// ── Fuzzy matching helpers ──

// Levenshtein edit distance with an early-exit ceiling (returns max+1 if it
// blows past the ceiling — keeps it cheap across thousands of names).
function levenshtein(a, b, max) {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    const cur = new Array(bl + 1);
    cur[0] = i;
    let rowBest = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowBest) rowBest = v;
    }
    if (rowBest > max) return max + 1;
    prev = cur;
  }
  return prev[bl];
}

// Closest edit distance of the query to the whole name or any of its words.
function fuzzyDistance(name, q, max) {
  let best = levenshtein(name, q, max);
  if (best <= max) return best;
  for (const word of name.split(/[^a-z0-9]+/)) {
    if (!word) continue;
    const d = levenshtein(word, q, max);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

// Lower score = better. null = not a substring match at all.
function substringScore(name, q) {
  if (name === q) return 0;
  if (name.startsWith(q)) return 1 + name.length * 0.001;
  const idx = name.indexOf(q);
  if (idx >= 0) return 2 + idx * 0.01;
  return null;
}

// Search every category. Returns ranked { index, name, resource, label, level?, fuzzy }.
// Exact/substring matches come first; if there are few, we add the closest
// fuzzy matches (typo tolerance) flagged with fuzzy:true.
export async function search(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const all = (
    await Promise.all(
      CATEGORIES.map(async ({ resource, label }) => {
        let items = [];
        try { items = await getList(resource); } catch { return []; }
        return items.map((it) => ({
          index: it.index, name: it.name, level: it.level, resource, label,
        }));
      })
    )
  ).flat();

  const subs = [];
  for (const it of all) {
    const sc = substringScore(it.name.toLowerCase(), q);
    if (sc !== null) subs.push({ ...it, _score: sc, fuzzy: false });
  }
  subs.sort((a, b) => a._score - b._score || a.name.localeCompare(b.name));

  let out = subs;
  // Few literal hits → offer the closest names as "did you mean".
  if (subs.length < 12) {
    const have = new Set(subs.map((x) => `${x.resource}/${x.index}`));
    const threshold = Math.max(1, Math.min(3, Math.floor(q.length / 3) + 1));
    const fuzz = [];
    for (const it of all) {
      if (have.has(`${it.resource}/${it.index}`)) continue;
      const d = fuzzyDistance(it.name.toLowerCase(), q, threshold);
      if (d <= threshold) fuzz.push({ ...it, _score: 10 + d, fuzzy: true });
    }
    fuzz.sort((a, b) => a._score - b._score || a.name.localeCompare(b.name));
    out = subs.concat(fuzz);
  }

  return out.slice(0, 40);
}

export async function fetchDetail(resource, index) {
  const key = `${resource}/${index}`;
  if (detailCache[key]) return detailCache[key];
  const res = await fetch(`${BASE}/${resource}/${index}`);
  if (!res.ok) throw new Error(`${key}: ${res.status}`);
  const json = await res.json();
  detailCache[key] = json;
  return json;
}

// Look up a single name (typo-tolerant) and return formatted rules text.
export async function describe(name) {
  const results = await search(name);
  if (!results.length) return null;
  const target = name.trim().toLowerCase();
  const exact = results.find((r) => r.name.toLowerCase() === target);
  const pick = exact || results[0];
  const raw = await fetchDetail(pick.resource, pick.index);
  return formatDetail(pick.resource, raw);
}

// ── Detail formatting ──
const ABILS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

export function formatDetail(resource, d) {
  if (!d) return "";
  const lines = [];

  if (resource === "spells") {
    const meta = [d.level === 0 ? "Cantrip" : `Level ${d.level}`];
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
    if (d.damage) meta.push(`${d.damage.damage_dice} ${d.damage.damage_type?.name || ""}`.trim());
    if (d.armor_class) meta.push(`AC ${d.armor_class.base}`);
    if (meta.length) lines.push(meta.join(" · "));
    if (Array.isArray(d.properties) && d.properties.length) lines.push("Properties: " + d.properties.map((p) => p.name).join(", "));
  } else if (resource === "magic-items") {
    if (d.rarity?.name) lines.push(d.rarity.name);
    if (d.equipment_category?.name) lines.push(d.equipment_category.name);
  } else if (resource === "features") {
    const meta = [];
    if (d.class?.name) meta.push(d.class.name);
    if (d.level != null) meta.push(`Level ${d.level}`);
    if (meta.length) lines.push(meta.join(" · "));
  } else if (resource === "traits") {
    if (Array.isArray(d.races) && d.races.length) lines.push("Races: " + d.races.map((r) => r.name).join(", "));
  } else if (resource === "monsters") {
    const head = `${d.size || ""} ${d.type || ""}${d.subtype ? ` (${d.subtype})` : ""}`.trim();
    lines.push([head, d.alignment].filter(Boolean).join(" · "));
    const ac = Array.isArray(d.armor_class) ? d.armor_class.map((a) => a.value).join("/") : d.armor_class;
    lines.push(`AC ${ac} · HP ${d.hit_points} (${d.hit_points_roll || d.hit_dice || ""}) · CR ${d.challenge_rating}${d.xp != null ? ` (${d.xp} XP)` : ""}`);
    if (d.speed) lines.push("Speed: " + Object.entries(d.speed).map(([k, v]) => (k === "walk" ? v : `${k} ${v}`)).join(", "));
    lines.push(ABILS.map((a) => `${a.slice(0, 3).toUpperCase()} ${d[a]} (${fmtMod(d[a])})`).join(" · "));
    const extra = [];
    if (d.senses) extra.push("Senses: " + Object.entries(d.senses).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", "));
    if (d.languages) extra.push("Languages: " + d.languages);
    if (extra.length) lines.push(extra.join("\n"));
    if (Array.isArray(d.special_abilities) && d.special_abilities.length) {
      lines.push("— Traits —");
      d.special_abilities.forEach((a) => lines.push(`${a.name}. ${a.desc}`));
    }
    if (Array.isArray(d.actions) && d.actions.length) {
      lines.push("— Actions —");
      d.actions.forEach((a) => lines.push(`${a.name}. ${a.desc}`));
    }
    if (Array.isArray(d.legendary_actions) && d.legendary_actions.length) {
      lines.push("— Legendary Actions —");
      d.legendary_actions.forEach((a) => lines.push(`${a.name}. ${a.desc}`));
    }
    return lines.filter(Boolean).join("\n\n");
  } else if (resource === "races") {
    const meta = [];
    if (d.size) meta.push(d.size);
    if (d.speed) meta.push(`Speed ${d.speed}`);
    if (meta.length) lines.push(meta.join(" · "));
    if (Array.isArray(d.ability_bonuses) && d.ability_bonuses.length)
      lines.push("Ability: " + d.ability_bonuses.map((b) => `${b.ability_score?.name || ""} +${b.bonus}`).join(", "));
    if (d.alignment) lines.push(d.alignment);
    if (d.size_description) lines.push(d.size_description);
    if (d.age) lines.push("Age: " + d.age);
    if (d.language_desc) lines.push(d.language_desc);
    if (Array.isArray(d.traits) && d.traits.length) lines.push("Traits: " + d.traits.map((t) => t.name).join(", "));
    if (Array.isArray(d.subraces) && d.subraces.length) lines.push("Subraces: " + d.subraces.map((t) => t.name).join(", "));
    return lines.filter(Boolean).join("\n\n");
  }

  const body = Array.isArray(d.desc) ? d.desc.join("\n\n") : d.desc;
  if (body) lines.push(body);
  if (Array.isArray(d.higher_level) && d.higher_level.length) lines.push("At Higher Levels: " + d.higher_level.join(" "));

  return lines.filter(Boolean).join("\n\n");
}

function fmtMod(score) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}
