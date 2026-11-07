// ── "DND Update": natural-language sheet edits via Claude ──
// The sheet is a static site, so the browser calls the Claude API directly with
// a key the player pastes in once. The key is kept in localStorage on this
// device only and is never sent anywhere except api.anthropic.com.
//
// Claude never edits the sheet directly. It returns a list of small patch
// operations (set / add / remove on dot-paths) which applyOps() validates and
// applies, so a bad response can't corrupt the character.

import Anthropic from "@anthropic-ai/sdk";

export const API_KEY_STORAGE = "dnd-sheet-anthropic-key";
export const MODEL = "claude-opus-5-5";

export function loadApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ""; } catch { return ""; }
}
export function saveApiKey(key) {
  try { key ? localStorage.setItem(API_KEY_STORAGE, key.trim()) : localStorage.removeItem(API_KEY_STORAGE); } catch {}
}

const SYSTEM = `You maintain a D&D 5e character sheet for a player. You will be given the character as JSON and an instruction such as "I took 8 damage", "long rest", "add Fireball", "I leveled up to 5", "mark Perception as expertise", or "set my AC to 16".

Reply by calling the update_sheet tool with a list of patch operations. Do not describe the changes in prose; the summary field is the only text the player sees.

Sheet schema (dot-paths):
- name, class, race, background: string. level, proficiencyBonus: number. patron, pact, archetype: string.
- abilities.strength|dexterity|constitution|intelligence|wisdom|charisma: number (the score, not the modifier).
- combat.hp, combat.maxHp, combat.tempHp, combat.ac, combat.initiative, combat.speed: number. combat.hitDice: string like "5d8".
- deathSaves.successes, deathSaves.failures: number 0-3.
- savingThrows.<ability>.prof: boolean.
- skills.<key>.prof and skills.<key>.expertise: boolean. Keys: acrobatics, animalHandling, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleightOfHand, stealth, survival.
- features, equipment: arrays of strings (names). spells.cantrips, spells.level1 … spells.level5: arrays of spell names.
- proficiencies, notes: strings. lore.<Name>: string rules text shown under a feature, item or spell of that exact name.
- spellcasting.ability ("INT"/"WIS"/"CHA"), spellcasting.saveDC, spellcasting.attackBonus: numbers.

Operations:
- {op:"set", path, value}: replace a scalar. Give numbers and booleans as strings ("17", "true"); they are converted to the field's existing type.
- {op:"add", path, value}: append a string to an array if not already present.
- {op:"remove", path, value}: remove a matching string from an array (case-insensitive).

Rules of thumb:
- Damage: subtract from combat.tempHp first, then combat.hp; never below 0. Healing never exceeds combat.maxHp unless the player says so. "Long rest" restores hp to maxHp, clears tempHp and death saves, and (for warlocks and other casters) says slots are restored in the summary.
- When you add a spell, feature or item, also set lore.<Name> with a 1-3 sentence SRD-accurate rules summary (damage, range, duration, save). Remove lore when removing the entry is not needed.
- Level up: set level, proficiencyBonus (2 + floor((level-1)/4)), and combat.hitDice; raise maxHp and hp by the stated or average hit die + CON modifier (CON mod = floor((score-10)/2)); mention new class features in the summary and add the ones the class grants at that level.
- Derived numbers (AC from armor, spell DC = 8 + prof + mod, attack = prof + mod) should be recomputed when the inputs change.
- Only change what the instruction implies. If it is genuinely ambiguous, return no ops and ask one short question in the summary.
- Keep the summary to one or two sentences, written to the player ("Took 8 damage: 42 → 34 HP.").`;

const TOOL = {
  name: "update_sheet",
  description: "Apply patch operations to the character sheet and tell the player what changed.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One or two sentences for the player describing what changed, or a clarifying question if ops is empty." },
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["set", "add", "remove"] },
            path: { type: "string", description: "Dot-path into the sheet, e.g. combat.hp, skills.stealth.expertise, spells.level1, lore.Fireball" },
            value: { type: "string", description: "New value as a string. Numbers and booleans are converted." },
          },
          required: ["op", "path", "value"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "ops"],
    additionalProperties: false,
  },
};

// Compact view of the character for the prompt: lore text is replaced by its keys.
function sheetForPrompt(char) {
  const { id, lore, ...rest } = char;
  const mods = Object.fromEntries(Object.entries(char.abilities || {}).map(([k, v]) => [k, Math.floor((v - 10) / 2)]));
  return { ...rest, abilityModifiers: mods, loreEntries: Object.keys(lore || {}) };
}

export async function requestUpdate({ apiKey, char, instruction }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools: [TOOL],
    messages: [{
      role: "user",
      content: `Character sheet:\n${JSON.stringify(sheetForPrompt(char))}\n\nInstruction: ${instruction}\n\nCall update_sheet.`,
    }],
  });

  if (response.stop_reason === "refusal") {
    return { ops: [], summary: "The assistant declined that request." };
  }
  const call = response.content.find((b) => b.type === "tool_use" && b.name === "update_sheet");
  if (call && call.input && Array.isArray(call.input.ops)) {
    return { ops: call.input.ops, summary: String(call.input.summary || "") };
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return { ops: [], summary: text || "No changes were suggested." };
}

// ── Patch application (pure) ──
const splitPath = (path) => {
  if (path.startsWith("lore.")) return ["lore", path.slice(5)];
  return path.split(".").filter(Boolean);
};

function coerce(existing, value) {
  if (typeof existing === "number") { const n = Number(value); return Number.isFinite(n) ? n : existing; }
  if (typeof existing === "boolean") return /^(true|yes|1|on)$/i.test(String(value).trim());
  return value;
}

const describe = (op, path, value) => `${op} ${path}${value !== undefined ? ` → ${value}` : ""}`;

// Returns { char, applied: [string], rejected: [string] }.
export function applyOps(char, ops) {
  let next = char;
  const applied = [], rejected = [];
  for (const o of ops || []) {
    if (!o || typeof o.path !== "string") { rejected.push("malformed op"); continue; }
    const keys = splitPath(o.path);
    if (!keys.length || keys[0] === "id" || keys[0] === "sheetVersion") { rejected.push(describe(o.op, o.path, o.value)); continue; }
    // Walk to the parent, cloning along the way.
    const root = { ...next };
    let cur = root;
    let ok = true;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== "object") {
        // Only lore (string map) may grow new branches.
        if (keys[0] === "lore" && i === 0) cur[k] = {}; else { ok = false; break; }
      } else {
        cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] };
      }
      cur = cur[k];
    }
    if (!ok) { rejected.push(describe(o.op, o.path, o.value)); continue; }
    const last = keys[keys.length - 1];
    const existing = cur[last];
    const value = typeof o.value === "string" ? o.value : o.value == null ? "" : String(o.value);

    if (o.op === "set") {
      if (Array.isArray(existing) || (existing !== undefined && typeof existing === "object")) { rejected.push(describe(o.op, o.path, value)); continue; }
      if (existing === undefined && keys[0] !== "lore") { rejected.push(describe(o.op, o.path, value)); continue; }
      cur[last] = coerce(existing, value);
      applied.push(describe("set", o.path, cur[last]));
    } else if (o.op === "add") {
      if (!Array.isArray(existing)) { rejected.push(describe(o.op, o.path, value)); continue; }
      if (!value.trim()) { rejected.push(describe(o.op, o.path, value)); continue; }
      if (!existing.some((x) => String(x).toLowerCase() === value.toLowerCase())) cur[last] = [...existing, value];
      applied.push(describe("add", o.path, value));
    } else if (o.op === "remove") {
      if (!Array.isArray(existing)) { rejected.push(describe(o.op, o.path, value)); continue; }
      const before = existing.length;
      cur[last] = existing.filter((x) => String(x).toLowerCase() !== value.toLowerCase());
      if (cur[last].length === before) { rejected.push(describe(o.op, o.path, value)); continue; }
      applied.push(describe("remove", o.path, value));
    } else {
      rejected.push(describe(o.op, o.path, value)); continue;
    }
    next = root;
  }
  return { char: next, applied, rejected };
}
