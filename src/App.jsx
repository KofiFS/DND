import { useState, useEffect, useCallback, useRef } from "react";
import { search as srdSearch, fetchDetail, formatDetail, describe } from "./api.js";
import { addPhoto, getPhotos, deletePhoto, updatePhotoCaption, resizeImage, claimOrphanPhotos, deletePhotosFor } from "./idb.js";
import { WARLOCK_TABLE, rowFor, CLASS_FEATURES, PATRONS, INVOCATIONS, prereqText, meetsPrereq } from "./warlock.js";
import { loadOrMigrateRoster, saveRoster, loadCharacter, saveCharacter, removeCharacter, summarize, newId } from "./roster.js";
import { ROGUE_TABLE, rogueRowFor, ROGUE_FEATURES, ARCHETYPES, atSpellsFor } from "./rogue.js";
import { PRESETS } from "./presets.js";
import { requestUpdate, applyOps, loadApiKey, saveApiKey, MODEL as AI_MODEL } from "./ai.js";

const SHEET_VERSION = 2;

const INITIAL_CHARACTER = {
  sheetVersion: SHEET_VERSION,
  name: "Arc-Elf Tanner",
  class: "Warlock 4",
  race: "Orc/Elf",
  background: "Watching",
  level: 4,
  proficiencyBonus: 2,
  patron: "Archfey",
  pact: "",
  abilities: {
    strength: 13, dexterity: 12, constitution: 14,
    intelligence: 12, wisdom: 13, charisma: 14,
  },
  combat: {
    ac: 12, initiative: 1, speed: 30,
    hp: 42, maxHp: 42, tempHp: 0, hitDice: "4d8",
  },
  deathSaves: { successes: 0, failures: 0 },
  savingThrows: {
    strength: { prof: false }, dexterity: { prof: false }, constitution: { prof: false },
    intelligence: { prof: false }, wisdom: { prof: true }, charisma: { prof: true },
  },
  skills: {
    acrobatics: { ability: "dexterity", prof: false },
    animalHandling: { ability: "wisdom", prof: false },
    arcana: { ability: "intelligence", prof: false },
    athletics: { ability: "strength", prof: false },
    deception: { ability: "charisma", prof: true },
    history: { ability: "intelligence", prof: false },
    insight: { ability: "wisdom", prof: true },
    intimidation: { ability: "charisma", prof: true },
    investigation: { ability: "intelligence", prof: true },
    medicine: { ability: "wisdom", prof: false },
    nature: { ability: "intelligence", prof: false },
    perception: { ability: "wisdom", prof: false },
    performance: { ability: "charisma", prof: false },
    persuasion: { ability: "charisma", prof: false },
    religion: { ability: "intelligence", prof: false },
    sleightOfHand: { ability: "dexterity", prof: false },
    stealth: { ability: "dexterity", prof: true },
    survival: { ability: "wisdom", prof: false },
  },
  features: [
    "Agonizing Blast", "Mask of Many Faces", "Otherworldly Leap", "Adrenaline Rush",
    "Darkvision 120ft", "Relentless Endurance", "Steps of the Fey",
  ],
  equipment: [
    "Snake Staff", "Leather Armor", "2× Daggers", "Thieves' Tools", "Bedroll",
    "2× Pouches", "101 gp", "Traveler's Clothes", "Disguise Set",
  ],
  proficiencies: "Thieves' Tools, Simple Weapons, Light Armor",
  spellcasting: { ability: "CHA", saveDC: 12, attackBonus: 4 },
  spells: {
    cantrips: ["Minor Illusion", "Thunderclap", "Eldritch Blast"],
    level1: ["Charm Person", "Unseen Servant", "Illusory Script", "Sleep", "Faerie Fire", "Hex"],
    level2: ["Hold Person", "Phantasmal Force", "Mirror Step", "Calm Emotions"],
    level3: [], level4: [], level5: [],
  },
  notes: "",
  // name -> rules text / description (from SRD lookups or typed by hand)
  lore: {},
};

// An empty level-1 sheet for brand-new characters.
function blankCharacter(name = "New Character") {
  return {
    ...INITIAL_CHARACTER,
    name, class: "", race: "", background: "", level: 1, proficiencyBonus: 2, patron: "", pact: "",
    abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    combat: { ac: 10, initiative: 0, speed: 30, hp: 10, maxHp: 10, tempHp: 0, hitDice: "1d8" },
    deathSaves: { successes: 0, failures: 0 },
    savingThrows: Object.fromEntries(Object.keys(INITIAL_CHARACTER.savingThrows).map(k => [k, { prof: false }])),
    skills: Object.fromEntries(Object.entries(INITIAL_CHARACTER.skills).map(([k, v]) => [k, { ability: v.ability, prof: false }])),
    features: [], equipment: [], proficiencies: "",
    spellcasting: { ability: "CHA", saveDC: 10, attackBonus: 2 },
    spells: { cantrips: [], level1: [], level2: [], level3: [], level4: [], level5: [] },
    notes: "", lore: {},
  };
}

// Load the roster and the active character once at startup. Adopts an old
// single-sheet save, and seeds the default character when nothing is stored.
function bootstrap() {
  const { roster, migratedLegacyId } = loadOrMigrateRoster();
  if (migratedLegacyId) claimOrphanPhotos(migratedLegacyId).catch(() => {});
  if (!roster.ids.length) {
    const id = newId();
    const c = { ...INITIAL_CHARACTER, id };
    saveCharacter(id, c);
    const r = { activeId: id, ids: [id] };
    saveRoster(r);
    return { roster: r, char: c };
  }
  const id = roster.activeId;
  const stored = loadCharacter(id);
  const c = { ...(stored ? hydrate(stored) : blankCharacter()), id };
  // Persist one-time migrations immediately so they aren't re-applied.
  if (!stored || c.sheetVersion !== stored.sheetVersion) saveCharacter(id, c);
  return { roster, char: c };
}

const SKILL_LABELS = {
  acrobatics: "Acrobatics", animalHandling: "Animal Handling", arcana: "Arcana",
  athletics: "Athletics", deception: "Deception", history: "History",
  insight: "Insight", intimidation: "Intimidation", investigation: "Investigation",
  medicine: "Medicine", nature: "Nature", perception: "Perception",
  performance: "Performance", persuasion: "Persuasion", religion: "Religion",
  sleightOfHand: "Sleight of Hand", stealth: "Stealth", survival: "Survival",
};

const ABILITY_SHORT = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };

const PALETTE = {
  ink: "#2a1a0c", inkSoft: "#5c4422", gold: "#c9882a", goldLt: "#e8b84b",
  rust: "#7a1c1c", green: "#3d6a1c", parchment: "#f5ead6",
  darkA: "#1a0a02", darkB: "#3d1a05", darkC: "#5c2b0a",
};

const getMod = (score) => Math.floor((score - 10) / 2);
const fmtMod = (n) => (n >= 0 ? `+${n}` : `${n}`);
const pbFromLevel = (lvl) => 2 + Math.floor((Math.max(1, lvl) - 1) / 4);
const dieAvg = (size) => Math.floor(size / 2) + 1;

// Merge a stored character with the initial shape so new fields always exist.
function hydrate(stored) {
  if (!stored || typeof stored !== "object") return INITIAL_CHARACTER;
  stored = migrate(stored);
  return {
    ...INITIAL_CHARACTER,
    ...stored,
    abilities: { ...INITIAL_CHARACTER.abilities, ...stored.abilities },
    combat: { ...INITIAL_CHARACTER.combat, ...stored.combat },
    deathSaves: { ...INITIAL_CHARACTER.deathSaves, ...stored.deathSaves },
    savingThrows: { ...INITIAL_CHARACTER.savingThrows, ...stored.savingThrows },
    skills: { ...INITIAL_CHARACTER.skills, ...stored.skills },
    spellcasting: { ...INITIAL_CHARACTER.spellcasting, ...stored.spellcasting },
    spells: { ...INITIAL_CHARACTER.spells, ...stored.spells },
    lore: { ...(stored.lore || {}) },
  };
}

// One-time upgrades applied to sheets saved by older versions of the app.
function migrate(c) {
  const v = c.sheetVersion || 1;
  if (v < 2) {
    // Level 4: +2 STR ASI, max HP 42, d8 hit dice, Eldritch Blast + Hex, Archfey patron.
    const wasFull = c.combat?.hp === c.combat?.maxHp;
    const level = Math.max(4, c.level || 1);
    const cantrips = c.spells?.cantrips || [];
    const level1 = c.spells?.level1 || [];
    c = {
      ...c,
      level, proficiencyBonus: pbFromLevel(level),
      class: /^warlock 3/i.test(c.class || "") ? "Warlock 4" : c.class,
      patron: c.patron || "Archfey",
      abilities: { ...c.abilities, strength: (c.abilities?.strength ?? 11) + 2 },
      combat: { ...c.combat, maxHp: Math.max(42, c.combat?.maxHp || 0), hp: wasFull ? Math.max(42, c.combat?.maxHp || 0) : c.combat?.hp, hitDice: `${level}d8` },
      spells: {
        ...c.spells,
        cantrips: cantrips.includes("Eldritch Blast") ? cantrips : [...cantrips, "Eldritch Blast"],
        level1: level1.includes("Hex") ? level1 : [...level1, "Hex"],
      },
    };
  }
  return { ...c, sheetVersion: SHEET_VERSION };
}

// ── Inline editable field ──
function EditField({ value, onChange, style = {}, inputStyle = {}, multiline = false, type = "text" }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const commit = () => { setEditing(false); onChange(local); };

  if (editing) {
    if (multiline) return (
      <textarea autoFocus value={local} onChange={e => setLocal(e.target.value)} onBlur={commit}
        style={{ ...inputStyle, background: "rgba(201,136,42,0.15)", border: `1px solid ${PALETTE.gold}`, borderRadius: 4, color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: "2px 6px", width: "100%", resize: "vertical" }} />
    );
    return (
      <input autoFocus type={type} value={local}
        onChange={e => setLocal(type === "number" ? Number(e.target.value) : e.target.value)}
        onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()}
        style={{ ...inputStyle, background: "rgba(201,136,42,0.15)", border: `1px solid ${PALETTE.gold}`, borderRadius: 4, color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: "2px 6px", textAlign: style.textAlign || "left", width: "100%" }} />
    );
  }
  return (
    <span onClick={() => setEditing(true)}
      style={{ cursor: "text", borderBottom: "1px dashed rgba(201,136,42,0.4)", display: "inline-block", ...style }}
      title="Tap to edit">{value}</span>
  );
}

function AbilityBlock({ name, score, onChange }) {
  const mod = getMod(score);
  return (
    <div style={{
      background: `linear-gradient(150deg,${PALETTE.darkB},${PALETTE.darkC})`,
      border: `1.5px solid ${PALETTE.gold}`, borderRadius: 12,
      padding: "9px 6px 8px", textAlign: "center", flex: 1, minWidth: 0,
      boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
    }}>
      <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, color: "#c9882aaa", textTransform: "uppercase", marginBottom: 1 }}>{name}</div>
      <div style={{ fontFamily: "Cinzel,serif", fontSize: "1.05rem", color: PALETTE.goldLt, background: "rgba(201,136,42,0.18)", borderRadius: 6, padding: "0 4px", display: "inline-block", margin: "2px 0", minWidth: 34 }}>
        {fmtMod(mod)}
      </div>
      <EditField value={score} onChange={v => onChange(Number(v))} type="number"
        style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.35rem", color: PALETTE.goldLt, textShadow: "0 0 10px rgba(201,136,42,0.4)", textAlign: "center", display: "block", width: "100%", borderBottom: "1px dashed rgba(201,136,42,0.25)" }}
        inputStyle={{ width: "54px", textAlign: "center" }} />
    </div>
  );
}

// ── Entry row with expandable, editable, fetchable description ──
function EntryRow({ name, icon, desc, onSetDesc, onRemove, styles }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const hasDesc = !!(desc && desc.trim());

  const fetchDesc = async () => {
    setLoading(true); setErr("");
    try {
      const text = await describe(name);
      if (text) onSetDesc(text);
      else setErr("No 5e SRD match for that name — you can type one instead.");
    } catch {
      setErr("Couldn’t reach the SRD. Check your connection.");
    }
    setLoading(false);
  };

  return (
    <div style={{ borderBottom: "1px solid rgba(139,94,26,0.14)" }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", cursor: "pointer" }}>
        {icon && <span style={{ color: PALETTE.gold, fontSize: "0.72rem", width: 14, textAlign: "center", flexShrink: 0 }}>{icon}</span>}
        <span style={{ flex: 1, fontSize: "0.92rem", color: PALETTE.ink }}>{name}</span>
        {hasDesc && <span title="Has a description" style={{ width: 6, height: 6, borderRadius: "50%", background: PALETTE.green, flexShrink: 0 }} />}
        <span style={{ color: PALETTE.inkSoft, fontSize: "0.7rem", width: 12, textAlign: "center" }}>{open ? "▾" : "▸"}</span>
        {onRemove && <button style={styles.removeBtn} onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
      </div>
      {open && (
        <div style={{ padding: "0 0 12px 23px" }}>
          <textarea value={desc || ""} onChange={e => onSetDesc(e.target.value)}
            placeholder="Write a description, or fetch it from the 5e SRD…"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 64, background: "rgba(61,26,5,0.05)", border: "1px solid rgba(201,136,42,0.3)", borderRadius: 8, fontFamily: "'Crimson Text',serif", fontSize: "0.84rem", color: "#3d2b0a", padding: "8px 10px", resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <button style={styles.smallBtn} onClick={fetchDesc} disabled={loading}>
              {loading ? "Fetching…" : "⟳ Fetch from 5e SRD"}
            </button>
            {err && <span style={{ color: PALETTE.rust, fontSize: "0.72rem" }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Level-up helper modal ──
function LevelUpModal({ char, onApply, onClose, styles }) {
  const die = (() => { const m = /d(\d+)/.exec(char.combat.hitDice || ""); return m ? Number(m[1]) : 8; })();
  const conMod = getMod(char.abilities.constitution);
  const suggested = Math.max(1, dieAvg(die) + conMod);
  const [hpGain, setHpGain] = useState(suggested);
  const nextLevel = (char.level || 1) + 1;
  const newPb = pbFromLevel(nextLevel);
  const pbChanges = newPb !== char.proficiencyBonus;
  const asi = [4, 8, 12, 16, 19].includes(nextLevel);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: PALETTE.parchment, borderRadius: 14, border: `2px solid ${PALETTE.gold}`, padding: 18, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.2rem", color: PALETTE.rust, textAlign: "center", marginBottom: 4 }}>Level Up</div>
        <div style={{ textAlign: "center", fontFamily: "Cinzel,serif", color: PALETTE.inkSoft, fontSize: "0.8rem", marginBottom: 14 }}>
          Level {char.level || 1} → <span style={{ color: PALETTE.rust, fontWeight: 700 }}>{nextLevel}</span>
        </div>

        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.6rem", letterSpacing: 1.5, color: PALETTE.rust, textTransform: "uppercase", marginBottom: 6 }}>Hit Points Gained</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button style={styles.hpBtn} onClick={() => setHpGain(v => Math.max(1, v - 1))}>−</button>
          <input type="number" value={hpGain} onChange={e => setHpGain(Math.max(0, Number(e.target.value)))}
            style={{ flex: 1, textAlign: "center", fontFamily: "'Cinzel Decorative',serif", fontSize: "1.6rem", color: PALETTE.rust, background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 8, padding: "4px" }} />
          <button style={styles.hpBtn} onClick={() => setHpGain(v => v + 1)}>+</button>
        </div>
        <div style={{ fontSize: "0.74rem", color: PALETTE.inkSoft, marginBottom: 14, lineHeight: 1.4 }}>
          Suggested <b>{suggested}</b> (avg of d{die} {fmtMod(conMod)} CON). Or roll 1d{die}{fmtMod(conMod)} and enter it.
        </div>

        <div style={{ background: "rgba(201,136,42,0.1)", borderRadius: 8, padding: "10px 12px", fontSize: "0.8rem", color: PALETTE.ink, lineHeight: 1.5, marginBottom: 16 }}>
          On confirm: max HP <b>{char.combat.maxHp} → {char.combat.maxHp + hpGain}</b>
          {pbChanges && <> · proficiency <b>+{char.proficiencyBonus} → +{newPb}</b></>}
          {" · hit dice +1"}
          {asi && <div style={{ marginTop: 6, color: PALETTE.rust }}>★ Level {nextLevel} usually grants an Ability Score Increase or feat — set it on the Stats tab.</div>}
          <div style={{ marginTop: 6, color: PALETTE.inkSoft }}>Remember to add any new spells/features for this level (use the Codex).</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...styles.btn, flex: 1 }} onClick={() => onApply(hpGain)}>Confirm</button>
          <button style={{ ...styles.btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function DnDSheet() {
  const [boot] = useState(bootstrap);
  const [roster, setRoster] = useState(boot.roster);
  const [char, setChar] = useState(boot.char);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState("stats");
  const [saved, setSaved] = useState(false);
  const [addingFeature, setAddingFeature] = useState(false);
  const [newFeature, setNewFeature] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [addingSpell, setAddingSpell] = useState(null);
  const [newSpell, setNewSpell] = useState("");
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const fileInputRef = useRef(null);

  const save = useCallback((data) => {
    if (saveCharacter(data.id, data)) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }, []);

  // Every character carries its own id, so the updater can never move a sheet
  // onto another character's storage slot.
  const update = useCallback((updater) => {
    setChar(prev => { const next = { ...updater(prev), id: prev.id }; save(next); return next; });
  }, [save]);

  // ── Roster (multiple characters) ──
  const commitRoster = (r) => { setRoster(r); saveRoster(r); };

  const switchTo = (id) => {
    setPickerOpen(false);
    if (id === char.id) return;
    const stored = loadCharacter(id);
    const next = { ...(stored ? hydrate(stored) : blankCharacter()), id };
    if (!stored || next.sheetVersion !== stored.sheetVersion) saveCharacter(id, next);
    setChar(next);
    commitRoster({ ...roster, activeId: id });
    setTab("stats");
  };

  const addCharacter = (data) => {
    const id = newId();
    const next = { ...data, id };
    saveCharacter(id, next);
    commitRoster({ activeId: id, ids: [...roster.ids, id] });
    setChar(next);
    setPickerOpen(false);
    setTab("stats");
  };

  const duplicateCharacter = (id) => {
    const src = id === char.id ? char : loadCharacter(id);
    if (src) addCharacter({ ...hydrate(src), name: `${src.name || "Character"} (copy)` });
  };

  const deleteCharacter = (id) => {
    const src = id === char.id ? char : loadCharacter(id);
    const label = src?.name || "this character";
    if (!confirm(`Delete ${label}? This removes the sheet and its photos from this device.`)) return;
    removeCharacter(id);
    deletePhotosFor(id).catch(() => {});
    const ids = roster.ids.filter(x => x !== id);
    if (!ids.length) {
      // Always keep one sheet around.
      const nid = newId();
      const c = { ...blankCharacter(), id: nid };
      saveCharacter(nid, c);
      setChar(c);
      commitRoster({ activeId: nid, ids: [nid] });
      setTab("stats");
      return;
    }
    if (id === char.id) {
      const nextId = ids[0];
      const stored = loadCharacter(nextId);
      const next = { ...(stored ? hydrate(stored) : blankCharacter()), id: nextId };
      setChar(next);
      commitRoster({ activeId: nextId, ids });
      setTab("stats");
    } else {
      commitRoster({ ...roster, ids });
    }
  };

  const setAbility = (key, val) => update(c => ({ ...c, abilities: { ...c.abilities, [key]: val } }));
  const setCombat = (key, val) => update(c => ({ ...c, combat: { ...c.combat, [key]: val } }));
  const toggleSave = (key) => update(c => ({ ...c, savingThrows: { ...c.savingThrows, [key]: { ...c.savingThrows[key], prof: !c.savingThrows[key].prof } } }));
  // Tap cycles: none → proficient → expertise (double proficiency) → none.
  const toggleSkill = (key) => update(c => {
    const sk = c.skills[key];
    const next = !sk.prof ? { prof: true, expertise: false } : !sk.expertise ? { prof: true, expertise: true } : { prof: false, expertise: false };
    return { ...c, skills: { ...c.skills, [key]: { ...sk, ...next } } };
  });
  const toggleDS = (type) => update(c => { const cur = c.deathSaves[type]; return { ...c, deathSaves: { ...c.deathSaves, [type]: cur >= 3 ? 0 : cur + 1 } }; });
  const setLore = (name, text) => update(c => ({ ...c, lore: { ...c.lore, [name]: text } }));

  const applyLevelUp = (hpGain) => {
    update(c => {
      const nextLevel = (c.level || 1) + 1;
      let hd = c.combat.hitDice;
      const m = /^(\d+)d(\d+)$/.exec(hd || "");
      if (m) hd = `${Number(m[1]) + 1}d${m[2]}`;
      return {
        ...c, level: nextLevel, proficiencyBonus: pbFromLevel(nextLevel),
        combat: { ...c.combat, maxHp: c.combat.maxHp + hpGain, hp: c.combat.hp + hpGain, hitDice: hd },
      };
    });
    setLevelUpOpen(false);
  };

  const handleExport = () => {
    const { id: _id, ...portable } = char; // the id is per-device; imports get a fresh one
    const blob = new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dnd-${(char.name || "character").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { addCharacter(hydrate(JSON.parse(reader.result))); }
      catch { alert("That file could not be read as a character export."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const TABS = [
    { id: "stats", label: "Stats", icon: "❖" },
    { id: "skills", label: "Skills", icon: "✦" },
    { id: "combat", label: "Combat", icon: "⚔" },
    { id: "spells", label: "Spells", icon: "✷" },
    { id: "class", label: "Class", icon: "☽" },
    { id: "gear", label: "Gear", icon: "⚙" },
    { id: "codex", label: "Codex", icon: "❡" },
    { id: "paper", label: "Paper", icon: "❒" },
  ];

  const s = char;
  const pb = s.proficiencyBonus;
  const getSaveMod = (key) => getMod(s.abilities[key]) + (s.savingThrows[key].prof ? pb : 0);
  const getSkillMod = (key) => { const sk = s.skills[key]; return getMod(s.abilities[sk.ability]) + (sk.expertise ? pb * 2 : sk.prof ? pb : 0); };

  const styles = {
    app: { minHeight: "100vh", background: "#0f0804", backgroundImage: "radial-gradient(ellipse at top,#1a0a02 0%,#0a0402 100%)", fontFamily: "'Crimson Text',Georgia,serif", color: PALETTE.ink, maxWidth: 480, margin: "0 auto" },
    header: { background: `linear-gradient(135deg,${PALETTE.darkA},${PALETTE.darkB})`, borderBottom: `2px solid ${PALETTE.gold}`, padding: "12px 16px 10px", position: "sticky", top: 0, zIndex: 50 },
    charName: { fontFamily: "'Cinzel Decorative',serif", fontSize: "1.35rem", fontWeight: 900, color: PALETTE.goldLt, textShadow: "0 0 20px rgba(201,136,42,0.4)", lineHeight: 1.05 },
    charSub: { fontFamily: "Cinzel,serif", fontSize: "0.6rem", letterSpacing: 2, color: "#c9882aaa", marginTop: 4 },
    lvChip: { fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1, color: PALETTE.darkA, background: `linear-gradient(135deg,${PALETTE.goldLt},${PALETTE.gold})`, borderRadius: 20, padding: "3px 9px", fontWeight: 700, whiteSpace: "nowrap" },
    switchBtn: { fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1, color: PALETTE.goldLt, background: "rgba(201,136,42,0.12)", border: `1px solid ${PALETTE.gold}`, borderRadius: 20, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap" },
    savedBadge: { fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, color: "#7fe089", background: "rgba(76,175,80,0.15)", border: "1px solid rgba(76,175,80,0.35)", borderRadius: 20, padding: "2px 8px", transition: "opacity 0.3s", opacity: saved ? 1 : 0 },
    tabBar: { display: "flex", overflowX: "auto", background: "#0f0804", borderBottom: "1px solid #3d1a05", position: "sticky", top: 62, zIndex: 49, scrollbarWidth: "none" },
    tabBtn: (active) => ({ flex: "0 0 auto", minWidth: 62, padding: "7px 12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1, textTransform: "uppercase", border: "none", cursor: "pointer", background: active ? `linear-gradient(180deg,${PALETTE.darkB},${PALETTE.darkA})` : "transparent", color: active ? PALETTE.goldLt : "#8b5e1a", borderBottom: active ? `2px solid ${PALETTE.gold}` : "2px solid transparent", transition: "all 0.15s" }),
    tabIcon: (active) => ({ fontSize: "0.95rem", color: active ? PALETTE.goldLt : "#7a521a", lineHeight: 1 }),
    page: { padding: "16px 16px 110px", background: PALETTE.parchment, backgroundImage: "linear-gradient(160deg,#f8eedc 0%,#eedfc0 100%)", minHeight: "calc(100vh - 108px)" },
    sectionTitle: { fontFamily: "Cinzel,serif", fontSize: "0.58rem", letterSpacing: 3, textTransform: "uppercase", color: PALETTE.rust, display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid rgba(201,136,42,0.4)", paddingBottom: 5, marginBottom: 10, marginTop: 18 },
    card: { background: "rgba(255,250,240,0.65)", border: "1px solid rgba(201,136,42,0.3)", borderRadius: 12, padding: "10px 13px", marginBottom: 10, boxShadow: "0 1px 4px rgba(120,80,20,0.06)" },
    btn: { fontFamily: "Cinzel,serif", fontSize: "0.62rem", letterSpacing: 1.2, textTransform: "uppercase", background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, border: `1px solid ${PALETTE.gold}`, borderRadius: 8, color: PALETTE.goldLt, padding: "8px 14px", cursor: "pointer" },
    btnGhost: { fontFamily: "Cinzel,serif", fontSize: "0.62rem", letterSpacing: 1.2, textTransform: "uppercase", background: "transparent", border: `1px solid ${PALETTE.rust}`, borderRadius: 8, color: PALETTE.rust, padding: "8px 14px", cursor: "pointer" },
    addBtn: { fontFamily: "Cinzel,serif", fontSize: "0.6rem", letterSpacing: 1.2, textTransform: "uppercase", background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, border: `1px solid ${PALETTE.gold}`, borderRadius: 8, color: PALETTE.goldLt, padding: "6px 12px", cursor: "pointer", marginTop: 8 },
    smallBtn: { fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1, textTransform: "uppercase", background: "rgba(61,26,5,0.08)", border: `1px solid ${PALETTE.gold}`, borderRadius: 6, color: PALETTE.darkB, padding: "5px 10px", cursor: "pointer" },
    removeBtn: { background: "none", border: "none", color: PALETTE.rust, cursor: "pointer", fontSize: "1rem", padding: "0 2px", lineHeight: 1, flexShrink: 0 },
    input: { flex: 1, background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 8, color: PALETTE.ink, fontFamily: "inherit", padding: "7px 10px", fontSize: "0.9rem" },
    hpBtn: { width: 38, height: 38, borderRadius: "50%", border: `1.5px solid ${PALETTE.gold}`, background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, color: PALETTE.goldLt, fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 },
  };

  const SectionTitle = ({ children }) => (
    <div style={styles.sectionTitle}><span style={{ color: PALETTE.gold }}>❖</span>{children}</div>
  );

  // ── STATS ──
  const statsTab = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={styles.charName}>
            <EditField value={s.name} onChange={v => update(c => ({ ...c, name: v }))} style={{ color: PALETTE.rust, fontSize: "1.1rem" }} />
          </div>
          <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.62rem", color: PALETTE.inkSoft, marginTop: 3 }}>
            <EditField value={s.class} onChange={v => update(c => ({ ...c, class: v }))} style={{ color: PALETTE.inkSoft }} />
            {" · "}
            <EditField value={s.race} onChange={v => update(c => ({ ...c, race: v }))} style={{ color: PALETTE.inkSoft }} />
          </div>
        </div>
      </div>

      {/* Level / PB / Level-up */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", marginTop: 8 }}>
        <div style={{ ...styles.card, flex: 1, marginBottom: 0, textAlign: "center", padding: "8px 6px" }}>
          <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase" }}>Level</div>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.5rem", color: PALETTE.rust }}>
            <EditField value={s.level} onChange={v => update(c => ({ ...c, level: Math.max(1, Number(v)) }))} type="number" style={{ color: PALETTE.rust }} inputStyle={{ width: 44, textAlign: "center" }} />
          </div>
        </div>
        <div style={{ ...styles.card, flex: 1, marginBottom: 0, textAlign: "center", padding: "8px 6px" }}>
          <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase" }}>Prof Bonus</div>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.5rem", color: PALETTE.rust }}>
            +<EditField value={pb} onChange={v => update(c => ({ ...c, proficiencyBonus: Number(v) }))} type="number" style={{ color: PALETTE.rust }} inputStyle={{ width: 36, textAlign: "center" }} />
          </div>
          {pbFromLevel(s.level) !== pb && (
            <button style={{ ...styles.smallBtn, marginTop: 2, padding: "2px 6px" }} onClick={() => update(c => ({ ...c, proficiencyBonus: pbFromLevel(c.level) }))}>↻ +{pbFromLevel(s.level)} from level</button>
          )}
        </div>
        <button style={{ ...styles.btn, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }} onClick={() => setLevelUpOpen(true)}>
          <span style={{ fontSize: "1.1rem" }}>⤴</span>Level Up
        </button>
      </div>

      <SectionTitle>Ability Scores</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {Object.entries(s.abilities).map(([key, val]) => (
          <AbilityBlock key={key} name={ABILITY_SHORT[key]} score={val} onChange={v => setAbility(key, v)} />
        ))}
      </div>

      <SectionTitle>Saving Throws</SectionTitle>
      <div style={styles.card}>
        {Object.entries(s.savingThrows).map(([key]) => {
          const mod = getSaveMod(key);
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0", borderBottom: "1px solid rgba(139,94,26,0.14)" }}>
              <Dot on={s.savingThrows[key].prof} onClick={() => toggleSave(key)} />
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.7rem", fontWeight: 700, color: "#3d2b0a", minWidth: 30 }}>{fmtMod(mod)}</span>
              <span style={{ fontSize: "0.85rem", color: PALETTE.ink, textTransform: "capitalize" }}>{key.replace(/([A-Z])/g, ' $1')}</span>
            </div>
          );
        })}
      </div>

      <SectionTitle>Features & Traits</SectionTitle>
      <div style={styles.card}>
        {s.features.map((f, i) => (
          <EntryRow key={i} name={f} icon="✦" desc={s.lore[f]} styles={styles}
            onSetDesc={(t) => setLore(f, t)}
            onRemove={() => update(c => ({ ...c, features: c.features.filter((_, j) => j !== i) }))} />
        ))}
        {addingFeature ? (
          <AddInline value={newFeature} setValue={setNewFeature} placeholder="Feature name…" styles={styles}
            onAdd={() => { const v = newFeature.trim(); if (v) { update(c => ({ ...c, features: [...c.features, v] })); setNewFeature(""); setAddingFeature(false); } }}
            onCancel={() => setAddingFeature(false)} />
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.addBtn} onClick={() => setAddingFeature(true)}>+ Add Feature</button>
            <button style={{ ...styles.addBtn, background: "transparent", color: PALETTE.rust, borderColor: PALETTE.rust }} onClick={() => setTab("codex")}>🔍 Look up</button>
          </div>
        )}
      </div>

      <SectionTitle>Notes</SectionTitle>
      <textarea value={s.notes} onChange={e => update(c => ({ ...c, notes: e.target.value }))}
        placeholder="Session notes, lore, reminders…"
        style={{ width: "100%", boxSizing: "border-box", minHeight: 130, background: "rgba(255,250,240,0.6)", border: "1px solid rgba(201,136,42,0.3)", borderRadius: 10, fontFamily: "'Crimson Text',serif", fontSize: "0.92rem", color: PALETTE.ink, padding: "10px 12px", resize: "vertical", lineHeight: 1.5 }} />

      <SectionTitle>Backup</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={styles.addBtn} onClick={handleExport}>⬇ Export JSON</button>
        <button style={styles.addBtn} onClick={() => fileInputRef.current?.click()}>⬆ Import JSON</button>
        <button onClick={() => { if (confirm("Clear this sheet back to a blank level-1 character? Other characters are not affected.")) update(c => blankCharacter(c.name)); }}
          style={{ ...styles.addBtn, background: "rgba(122,28,28,0.15)", borderColor: PALETTE.rust, color: PALETTE.rust }}>↺ Clear Sheet</button>
      </div>
      <div style={{ fontSize: "0.72rem", color: PALETTE.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
        Auto-saves on this device. Export a JSON backup to copy this character to another device; importing adds it as a new character. (Photos in the Paper tab stay on this device.)
      </div>
    </div>
  );

  // ── SKILLS ──
  const skillsTab = () => (
    <div>
      <SectionTitle>Skills</SectionTitle>
      <div style={{ ...styles.card, padding: "6px 12px" }}>
        {Object.entries(s.skills).map(([key]) => {
          const mod = getSkillMod(key); const sk = s.skills[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", borderBottom: "1px solid rgba(139,94,26,0.14)" }}>
              <Dot on={sk.prof} expert={sk.expertise} onClick={() => toggleSkill(key)} />
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.7rem", fontWeight: 700, color: "#3d2b0a", minWidth: 30 }}>{fmtMod(mod)}</span>
              <span style={{ fontSize: "0.85rem", color: PALETTE.ink, flex: 1 }}>{SKILL_LABELS[key]}{sk.expertise && <span title="Expertise" style={{ color: PALETTE.gold, fontSize: "0.7rem", marginLeft: 5 }}>★</span>}</span>
              <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.52rem", color: PALETTE.inkSoft }}>{ABILITY_SHORT[sk.ability]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: "0.72rem", color: PALETTE.inkSoft, marginTop: 6, lineHeight: 1.45 }}>
        Tap a dot once for proficiency, twice for <b>★ Expertise</b> (double proficiency bonus), a third time to clear it.
      </div>
      <div style={{ ...styles.card, marginTop: 12, textAlign: "center" }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: PALETTE.rust, marginBottom: 4 }}>PASSIVE WISDOM (PERCEPTION)</div>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "2rem", color: "#3d2b0a" }}>{10 + getSkillMod("perception")}</div>
      </div>
    </div>
  );

  // ── COMBAT ──
  const combatTab = () => (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
        {[{ label: "Armor Class", key: "ac" }, { label: "Initiative", key: "initiative" }, { label: "Speed", key: "speed" }].map(({ label, key }) => (
          <div key={key} style={{ textAlign: "center" }}>
            <div style={{ width: 66, height: 66, borderRadius: "50%", background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, border: `2px solid ${PALETTE.gold}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 5px", boxShadow: "0 2px 10px rgba(201,136,42,0.25)" }}>
              <EditField value={s.combat[key]} onChange={v => setCombat(key, Number(v))} type="number"
                style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.3rem", color: PALETTE.goldLt, textAlign: "center", display: "block" }} inputStyle={{ width: 44, textAlign: "center" }} />
            </div>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase" }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ ...styles.card, background: "linear-gradient(135deg,rgba(122,28,28,0.1),rgba(122,28,28,0.04))", border: `1.5px solid ${PALETTE.rust}`, textAlign: "center" }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: PALETTE.rust, marginBottom: 4 }}>HIT POINTS</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <button style={styles.hpBtn} onClick={() => setCombat("hp", Math.max(0, s.combat.hp - 1))}>−</button>
          <div>
            <EditField value={s.combat.hp} onChange={v => setCombat("hp", Number(v))} type="number"
              style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "3rem", color: PALETTE.rust, lineHeight: 1 }} inputStyle={{ width: 70, textAlign: "center" }} />
            <span style={{ fontFamily: "Cinzel,serif", fontSize: "1rem", color: PALETTE.inkSoft }}>
              {" / "}<EditField value={s.combat.maxHp} onChange={v => setCombat("maxHp", Number(v))} type="number" style={{ color: PALETTE.inkSoft }} inputStyle={{ width: 40 }} />
            </span>
          </div>
          <button style={styles.hpBtn} onClick={() => setCombat("hp", Math.min(s.combat.maxHp, s.combat.hp + 1))}>+</button>
        </div>
        <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
          {[-10, -5, -1, "+1", "+5", "+10"].map(v => (
            <button key={v} onClick={() => { const d = typeof v === "number" ? v : parseInt(v); setCombat("hp", Math.max(0, Math.min(s.combat.maxHp, s.combat.hp + d))); }}
              style={{ fontFamily: "Cinzel,serif", fontSize: "0.6rem", padding: "4px 9px", background: typeof v === "number" ? "rgba(122,28,28,0.14)" : "rgba(61,43,10,0.12)", border: `1px solid ${typeof v === "number" ? PALETTE.rust : PALETTE.gold}`, borderRadius: 6, color: typeof v === "number" ? PALETTE.rust : "#3d2b0a", cursor: "pointer" }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ ...styles.card, textAlign: "center" }}>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: PALETTE.inkSoft, marginBottom: 4 }}>TEMP HP</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <button style={{ ...styles.hpBtn, width: 32, height: 32 }} onClick={() => setCombat("tempHp", Math.max(0, s.combat.tempHp - 1))}>−</button>
          <EditField value={s.combat.tempHp} onChange={v => setCombat("tempHp", Number(v))} type="number" style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.8rem", color: "#3d2b0a" }} inputStyle={{ width: 50, textAlign: "center" }} />
          <button style={{ ...styles.hpBtn, width: 32, height: 32 }} onClick={() => setCombat("tempHp", s.combat.tempHp + 1)}>+</button>
        </div>
      </div>

      <div style={{ ...styles.card, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, color: PALETTE.inkSoft, textTransform: "uppercase" }}>Hit Dice</span>
        <EditField value={s.combat.hitDice} onChange={v => setCombat("hitDice", v)} style={{ fontFamily: "Cinzel,serif", fontSize: "0.95rem", fontWeight: 700, color: "#3d2b0a" }} />
      </div>

      <SectionTitle>Death Saves</SectionTitle>
      <div style={{ ...styles.card, display: "flex", gap: 24, justifyContent: "center" }}>
        {[["successes", PALETTE.green, "Successes"], ["failures", PALETTE.rust, "Failures"]].map(([type, color, label]) => (
          <div key={type} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, color: PALETTE.inkSoft, marginBottom: 7 }}>{label.toUpperCase()}</div>
            <div style={{ display: "flex", gap: 7 }}>
              {[0, 1, 2].map(i => (
                <div key={i} onClick={() => toggleDS(type)} style={{ width: 19, height: 19, borderRadius: "50%", cursor: "pointer", background: i < s.deathSaves[type] ? color : "#e8d4a8", border: `2px solid ${color}`, transition: "all 0.2s" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── SPELLS ──
  const spellsTab = () => {
    const levelLabels = { cantrips: "Cantrips", level1: "1st Level", level2: "2nd Level", level3: "3rd Level", level4: "4th Level", level5: "5th Level" };
    const addSpell = (lvl, name) => {
      update(c => c.spells[lvl].includes(name) ? c : ({ ...c, spells: { ...c.spells, [lvl]: [...c.spells[lvl], name] } }));
      // Auto-fetch a description in the background for newly added spells.
      describe(name).then(t => { if (t) setLore(name, t); }).catch(() => {});
    };
    return (
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[["Ability", 0], ["Save DC", 1], ["Atk Bonus", 2]].map(([l, i]) => (
            <div key={l} style={{ flex: 1, textAlign: "center", border: "1px solid rgba(201,136,42,0.4)", borderRadius: 10, padding: "8px 4px", background: "rgba(201,136,42,0.06)" }}>
              <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.05rem", color: PALETTE.rust }}>
                {i === 0 ? <EditField value={s.spellcasting.ability} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, ability: v } }))} style={{ color: PALETTE.rust }} />
                  : i === 1 ? <EditField value={s.spellcasting.saveDC} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, saveDC: Number(v) } }))} type="number" style={{ color: PALETTE.rust }} />
                    : <span>+<EditField value={s.spellcasting.attackBonus} onChange={v => update(c => ({ ...c, spellcasting: { ...c.spellcasting, attackBonus: Number(v) } }))} type="number" style={{ color: PALETTE.rust }} /></span>}
              </div>
              <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        <button style={{ ...styles.addBtn, background: "transparent", color: PALETTE.rust, borderColor: PALETTE.rust, marginTop: 0, marginBottom: 8, width: "100%" }} onClick={() => setTab("codex")}>🔍 Look up a spell in the Codex</button>

        {Object.entries(s.spells).map(([lvl, spells]) => (
          <div key={lvl} style={{ border: "1px solid rgba(201,136,42,0.3)", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ background: `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})`, padding: "7px 13px", fontFamily: "Cinzel,serif", fontSize: "0.62rem", letterSpacing: 2, color: PALETTE.goldLt, textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
              <span>{levelLabels[lvl]}</span><span style={{ color: "#c9882aaa" }}>{spells.length}</span>
            </div>
            <div style={{ padding: "4px 13px 8px", background: "rgba(255,250,240,0.5)" }}>
              {spells.map((spell, i) => (
                <EntryRow key={i} name={spell} icon="✷" desc={s.lore[spell]} styles={styles}
                  onSetDesc={(t) => setLore(spell, t)}
                  onRemove={() => update(c => ({ ...c, spells: { ...c.spells, [lvl]: c.spells[lvl].filter((_, j) => j !== i) } }))} />
              ))}
              {addingSpell === lvl ? (
                <AddInline value={newSpell} setValue={setNewSpell} placeholder="Spell name…" styles={styles}
                  onAdd={() => { const v = newSpell.trim(); if (v) { addSpell(lvl, v); setNewSpell(""); setAddingSpell(null); } }}
                  onCancel={() => setAddingSpell(null)} />
              ) : (
                <button style={{ ...styles.addBtn, fontSize: "0.55rem", padding: "4px 10px" }} onClick={() => { setAddingSpell(lvl); setNewSpell(""); }}>+ Add</button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── GEAR ──
  const gearTab = () => (
    <div>
      <SectionTitle>Equipment</SectionTitle>
      <div style={styles.card}>
        {s.equipment.map((item, i) => (
          <EntryRow key={i} name={item} icon="⚔" desc={s.lore[item]} styles={styles}
            onSetDesc={(t) => setLore(item, t)}
            onRemove={() => update(c => ({ ...c, equipment: c.equipment.filter((_, j) => j !== i) }))} />
        ))}
        {addingItem ? (
          <AddInline value={newItem} setValue={setNewItem} placeholder="Item name…" styles={styles}
            onAdd={() => { const v = newItem.trim(); if (v) { update(c => ({ ...c, equipment: [...c.equipment, v] })); setNewItem(""); setAddingItem(false); } }}
            onCancel={() => setAddingItem(false)} />
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.addBtn} onClick={() => setAddingItem(true)}>+ Add Item</button>
            <button style={{ ...styles.addBtn, background: "transparent", color: PALETTE.rust, borderColor: PALETTE.rust }} onClick={() => setTab("codex")}>🔍 Look up</button>
          </div>
        )}
      </div>

      <SectionTitle>Proficiencies & Languages</SectionTitle>
      <div style={styles.card}>
        <EditField value={s.proficiencies} onChange={v => update(c => ({ ...c, proficiencies: v }))} multiline style={{ fontSize: "0.88rem", display: "block", width: "100%" }} inputStyle={{ fontSize: "0.88rem" }} />
      </div>
    </div>
  );

  return (
    <div style={styles.app}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
      <style>{`.dnd-tabs::-webkit-scrollbar{display:none} *{-webkit-tap-highlight-color:transparent}`}</style>

      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 0, cursor: "pointer" }} onClick={() => setPickerOpen(true)} title="Switch character">
            <div style={styles.charName}>{s.name}</div>
            <div style={styles.charSub}>{[s.class, s.race].filter(Boolean).join(" · ") || "Tap to switch character"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={styles.switchBtn} onClick={() => setPickerOpen(true)} title="Switch character">⇄ {roster.ids.length}</button>
              <span style={styles.lvChip}>LV {s.level}</span>
            </div>
            <span style={styles.savedBadge}>✓ SAVED</span>
          </div>
        </div>
      </div>

      <div className="dnd-tabs" style={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.id} style={styles.tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            <span style={styles.tabIcon(tab === t.id)}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={styles.page}>
        {tab === "stats" && statsTab()}
        {tab === "skills" && skillsTab()}
        {tab === "combat" && combatTab()}
        {tab === "spells" && spellsTab()}
        {tab === "gear" && gearTab()}
        {tab === "class" && <ClassTab char={s} update={update} setLore={setLore} styles={styles} SectionTitle={SectionTitle} />}
        {tab === "codex" && <CodexTab styles={styles} setLore={setLore} update={update} SectionTitle={SectionTitle} />}
        {tab === "paper" && <PhotoTab key={s.id} charId={s.id} styles={styles} SectionTitle={SectionTitle} />}
      </div>

      <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />

      <AiUpdateBar char={s} update={update} styles={styles} />

      {levelUpOpen && <LevelUpModal char={s} styles={styles} onApply={applyLevelUp} onClose={() => setLevelUpOpen(false)} />}
      {pickerOpen && (
        <CharacterPicker styles={styles} activeId={s.id}
          characters={summarize(roster.ids).map(x => x.id === s.id ? { ...x, name: s.name, class: s.class, race: s.race, level: s.level } : x)}
          onSelect={switchTo} onNew={() => addCharacter(blankCharacter())} onImport={() => fileInputRef.current?.click()}
          presets={[{ key: "warlock4", label: INITIAL_CHARACTER.name, sub: `${INITIAL_CHARACTER.class} · ${INITIAL_CHARACTER.race}`, data: INITIAL_CHARACTER }, ...PRESETS]}
          onPreset={(data) => addCharacter(hydrate(JSON.parse(JSON.stringify(data))))}
          onDuplicate={duplicateCharacter} onDelete={deleteCharacter} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

// ── DND Update: ask Claude to change the sheet in plain English ──
function AiUpdateBar({ char, update, styles }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);          // expanded result / settings panel
  const [result, setResult] = useState(null);       // { summary, applied, rejected, error }
  const [undo, setUndo] = useState(null);           // previous character for Undo
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

  const submit = async () => {
    const instruction = text.trim();
    if (!instruction || busy) return;
    if (!apiKey) { setEditingKey(true); setOpen(true); return; }
    setBusy(true); setOpen(true); setResult(null);
    try {
      const { ops, summary } = await requestUpdate({ apiKey, char, instruction });
      if (ops.length) {
        const before = char;
        let outcome = null;
        update((c) => { outcome = applyOps(c, ops); return outcome.char; });
        setUndo(before);
        setResult({ summary, applied: outcome?.applied || [], rejected: outcome?.rejected || [] });
      } else {
        setResult({ summary, applied: [], rejected: [] });
      }
      setText("");
    } catch (e) {
      const status = e?.status;
      const msg = status === 401 ? "That API key was rejected. Check it under ⚙."
        : status === 429 ? "Rate limited by the API. Try again in a moment."
        : status === 400 && /credit|billing/i.test(e?.message || "") ? "Your Anthropic account has no credit. Add some at console.anthropic.com."
        : e?.message || "The request failed.";
      setResult({ summary: "", applied: [], rejected: [], error: msg });
    }
    setBusy(false);
  };

  const doUndo = () => { if (!undo) return; update(() => ({ ...undo, id: char.id })); setUndo(null); setResult({ summary: "Reverted the last AI change.", applied: [], rejected: [] }); };
  const saveKey = () => { const k = keyDraft.trim(); saveApiKey(k); setApiKey(k); setKeyDraft(""); setEditingKey(false); };

  const label = { fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 2, textTransform: "uppercase", color: PALETTE.goldLt };
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ width: "100%", maxWidth: 480, pointerEvents: "auto", background: `linear-gradient(180deg,${PALETTE.darkB},${PALETTE.darkA})`, borderTop: `2px solid ${PALETTE.gold}`, boxShadow: "0 -6px 24px rgba(0,0,0,0.45)", padding: "8px 12px calc(10px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={label}>✦ DND Update</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {undo && <button onClick={doUndo} style={{ ...label, background: "none", border: "none", cursor: "pointer", color: "#f0c674" }}>↶ Undo</button>}
            {(result || editingKey) && <button onClick={() => setOpen((o) => !o)} style={{ ...label, background: "none", border: "none", cursor: "pointer", color: "#c9882aaa" }}>{open ? "Hide" : "Show"}</button>}
            <button title="API key settings" onClick={() => { setEditingKey((v) => !v); setOpen(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#c9882aaa", fontSize: "0.9rem", lineHeight: 1 }}>⚙</button>
          </div>
        </div>

        {open && editingKey && (
          <div style={{ background: "rgba(245,234,214,0.08)", border: "1px solid rgba(201,136,42,0.4)", borderRadius: 8, padding: "8px 10px", marginBottom: 8, color: "#f5ead6", fontSize: "0.78rem", lineHeight: 1.45 }}>
            <div style={{ ...label, marginBottom: 4 }}>Anthropic API key</div>
            {apiKey ? <div style={{ marginBottom: 6 }}>A key is saved on this device (…{apiKey.slice(-4)}).</div>
              : <div style={{ marginBottom: 6 }}>Paste an API key from <b>console.anthropic.com</b>. It is stored only in this browser and sent only to Anthropic. Each update costs a few cents (model: {AI_MODEL}).</div>}
            <div style={{ display: "flex", gap: 6 }}>
              <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-…" autoComplete="off"
                onKeyDown={(e) => { if (e.key === "Enter") saveKey(); }}
                style={{ flex: 1, background: "rgba(245,234,214,0.92)", border: `1px solid ${PALETTE.gold}`, borderRadius: 6, color: PALETTE.ink, fontFamily: "inherit", fontSize: "0.85rem", padding: "6px 8px" }} />
              <button onClick={saveKey} disabled={!keyDraft.trim()} style={{ ...styles.smallBtn, color: PALETTE.goldLt, background: "rgba(201,136,42,0.2)" }}>Save</button>
              {apiKey && <button onClick={() => { saveApiKey(""); setApiKey(""); }} style={{ ...styles.smallBtn, color: "#f0a0a0", borderColor: "#a04040", background: "transparent" }}>Forget</button>}
            </div>
          </div>
        )}

        {open && result && (
          <div style={{ background: "rgba(245,234,214,0.08)", border: `1px solid ${result.error ? "#a04040" : "rgba(201,136,42,0.4)"}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8, color: "#f5ead6", fontSize: "0.82rem", lineHeight: 1.45 }}>
            {result.error ? <span style={{ color: "#f0a0a0" }}>{result.error}</span> : <span>{result.summary}</span>}
            {result.applied.length > 0 && (
              <div style={{ marginTop: 5, fontSize: "0.7rem", color: "#c9b28a", fontFamily: "monospace", lineHeight: 1.4 }}>
                {result.applied.map((a, i) => <div key={i}>✓ {a}</div>)}
                {result.rejected.map((r, i) => <div key={"r" + i} style={{ color: "#f0a0a0" }}>✗ skipped: {r}</div>)}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={apiKey ? "e.g. “I took 8 damage” or “add Fireball”" : "Tap ⚙ to add your API key, then type here"}
            style={{ flex: 1, minWidth: 0, background: "rgba(245,234,214,0.92)", border: `1px solid ${PALETTE.gold}`, borderRadius: 8, color: PALETTE.ink, fontFamily: "'Crimson Text',serif", fontSize: "0.95rem", padding: "8px 10px" }} />
          <button onClick={submit} disabled={busy || !text.trim()}
            style={{ ...styles.btn, padding: "8px 14px", opacity: busy || !text.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}>{busy ? "…" : "Update"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Character picker (switch / create / duplicate / delete) ──
function CharacterPicker({ characters, activeId, onSelect, onNew, onImport, onDuplicate, onDelete, onClose, presets = [], onPreset, styles }) {
  const iconBtn = { background: "none", border: `1px solid rgba(201,136,42,0.5)`, borderRadius: 6, color: PALETTE.inkSoft, cursor: "pointer", fontSize: "0.85rem", width: 28, height: 28, lineHeight: 1, flexShrink: 0 };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, maxHeight: "85vh", overflowY: "auto", background: PALETTE.parchment, borderRadius: 14, border: `2px solid ${PALETTE.gold}`, padding: 18, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.2rem", color: PALETTE.rust, textAlign: "center", marginBottom: 2 }}>Characters</div>
        <div style={{ textAlign: "center", fontFamily: "Cinzel,serif", color: PALETTE.inkSoft, fontSize: "0.6rem", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>
          {characters.length} on this device
        </div>

        {characters.map(c => {
          const active = c.id === activeId;
          return (
            <div key={c.id} style={{ ...styles.card, display: "flex", alignItems: "center", gap: 10, padding: "9px 10px 9px 12px", cursor: "pointer",
              border: active ? `1.5px solid ${PALETTE.gold}` : styles.card.border, background: active ? "rgba(201,136,42,0.14)" : styles.card.background }}
              onClick={() => onSelect(c.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Cinzel,serif", fontWeight: 700, fontSize: "0.9rem", color: active ? PALETTE.rust : PALETTE.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {active && <span style={{ color: PALETTE.gold, marginRight: 6 }}>✦</span>}{c.name}
                </div>
                <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.58rem", letterSpacing: 1, color: PALETTE.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[c.class, c.race].filter(Boolean).join(" · ") || "No class set"}
                </div>
              </div>
              <span style={styles.lvChip}>LV {c.level}</span>
              <button style={iconBtn} title="Duplicate" onClick={e => { e.stopPropagation(); onDuplicate(c.id); }}>⧉</button>
              <button style={{ ...iconBtn, color: PALETTE.rust, borderColor: "rgba(122,28,28,0.5)" }} title="Delete" onClick={e => { e.stopPropagation(); onDelete(c.id); }}>×</button>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={{ ...styles.btn, flex: 1 }} onClick={onNew}>+ New Character</button>
          <button style={{ ...styles.btnGhost, flex: 1 }} onClick={onImport}>⬆ Import JSON</button>
        </div>
        {presets.length > 0 && (
          <>
            <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1.5, color: PALETTE.rust, textTransform: "uppercase", margin: "14px 0 6px" }}>Ready-made characters</div>
            {presets.map(p => (
              <button key={p.key} onClick={() => onPreset(p.data)}
                style={{ ...styles.card, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 6, fontFamily: "inherit" }}>
                <span style={{ color: PALETTE.gold }}>✚</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "Cinzel,serif", fontWeight: 700, fontSize: "0.85rem", color: PALETTE.ink }}>{p.label}</span>
                  <span style={{ display: "block", fontFamily: "Cinzel,serif", fontSize: "0.56rem", letterSpacing: 1, color: PALETTE.inkSoft, marginTop: 2 }}>{p.sub}</span>
                </span>
                <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", color: PALETTE.inkSoft }}>ADD</span>
              </button>
            ))}
          </>
        )}
        <button style={{ ...styles.btnGhost, width: "100%", marginTop: 8, borderColor: "rgba(92,68,34,0.5)", color: PALETTE.inkSoft }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── Small shared bits ──
function Dot({ on, expert = false, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 13, height: 13, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
      background: on ? "radial-gradient(circle at 35% 35%,#e8b84b,#c9882a)" : "#e8d4a8",
      border: `1.5px solid ${on ? "#c9882a" : "#8b5e1a"}`,
      boxShadow: expert ? "0 0 0 2px #f5ead6, 0 0 0 3.5px #c9882a" : on ? "0 0 6px rgba(201,136,42,0.5)" : "none",
    }} />
  );
}

function AddInline({ value, setValue, onAdd, onCancel, placeholder, styles }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <input autoFocus value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onAdd(); if (e.key === "Escape") onCancel(); }}
        placeholder={placeholder} style={styles.input} />
      <button style={styles.addBtn} onClick={onAdd}>Add</button>
      <button style={{ ...styles.addBtn, background: "transparent", color: "#8b5e1a" }} onClick={onCancel}>×</button>
    </div>
  );
}

// ── CLASS tab: picks the rules module from the class name ──
function ClassTab(props) {
  const cls = (props.char.class || "").toLowerCase();
  if (/rogue|thief|assassin|trickster/.test(cls)) return <RogueClassTab {...props} />;
  if (/warlock/.test(cls)) return <WarlockClassTab {...props} />;
  return (
    <div>
      <props.SectionTitle>Class Rules</props.SectionTitle>
      <div style={{ ...props.styles.card, fontSize: "0.86rem", color: PALETTE.inkSoft, lineHeight: 1.5 }}>
        This tab knows the rules for <b>Warlock</b> and <b>Rogue</b>. Put one of those words in the class field on the Stats tab
        (for example “Rogue 5” or “Arcane Trickster Rogue 12”) to see your features, tables and archetype here.
        For other classes, use the Codex to look up features and add them to your sheet.
      </div>
    </div>
  );
}

// Shared bits for the class tabs.
function ClassStat({ label, value, sub, warn }) {
  return (
    <div style={{ flex: 1, textAlign: "center", border: `1px solid ${warn ? PALETTE.rust : "rgba(201,136,42,0.4)"}`, borderRadius: 10, padding: "8px 4px", background: warn ? "rgba(122,28,28,0.06)" : "rgba(201,136,42,0.06)" }}>
      <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.05rem", color: PALETTE.rust }}>{value}</div>
      <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.48rem", letterSpacing: 1.5, color: PALETTE.inkSoft, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: "0.68rem", color: warn ? PALETTE.rust : PALETTE.inkSoft, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ClassFeatureRow({ f, gained, onSheet, onAdd, styles }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(139,94,26,0.14)", opacity: gained ? 1 : 0.55 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", cursor: "pointer" }}>
        <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", color: PALETTE.gold, width: 26, flexShrink: 0 }}>L{f.level}</span>
        <span style={{ flex: 1, fontSize: "0.9rem", color: PALETTE.ink }}>{f.name}</span>
        {gained && (onSheet
          ? <span style={{ fontSize: "0.62rem", color: PALETTE.green, fontFamily: "Cinzel,serif" }}>✓ on sheet</span>
          : <button style={{ ...styles.smallBtn, padding: "3px 8px" }} onClick={(e) => { e.stopPropagation(); onAdd(); }}>+ Add</button>)}
        <span style={{ color: PALETTE.inkSoft, fontSize: "0.7rem", width: 12, textAlign: "center" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && <div style={{ padding: "0 0 10px 35px", fontSize: "0.82rem", color: "#3d2b0a", lineHeight: 1.5 }}>{f.desc}</div>}
    </div>
  );
}

// A sheet feature counts as "on sheet" if it matches the rule name, ignoring a
// trailing qualifier such as "Sneak Attack (6d6)".
const featureOnSheet = (features, name) => features.some((f) => f === name || f.replace(/\s*\(.*\)\s*$/, "") === name);

// ── CLASS: Rogue ──
function RogueClassTab({ char, update, styles, SectionTitle }) {
  const level = char.level || 1;
  const row = rogueRowFor(level);
  const archetype = ARCHETYPES[char.archetype] ? char.archetype : "";
  const adata = archetype ? ARCHETYPES[archetype] : null;
  const at = archetype === "Arcane Trickster" ? atSpellsFor(level) : null;
  const [showAll, setShowAll] = useState(false);

  const cantripsKnown = char.spells.cantrips.length;
  const spellsKnown = Object.entries(char.spells).filter(([k]) => k !== "cantrips").reduce((n, [, arr]) => n + arr.length, 0);
  const hasFeature = (name) => featureOnSheet(char.features, name);
  const addFeature = (name, desc) => update((c) => ({
    ...c,
    features: featureOnSheet(c.features, name) ? c.features : [...c.features, name],
    lore: { ...c.lore, [name]: c.lore[name] || desc },
  }));
  const FeatureRow = ({ f, gained }) => <ClassFeatureRow f={f} gained={gained} onSheet={hasFeature(f.name)} onAdd={() => addFeature(f.name, f.desc)} styles={styles} />;
  const ordinal = (n) => `${n}${["st", "nd", "rd"][n - 1] || "th"}`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.05rem", color: PALETTE.rust }}>Rogue {level}</div>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.62rem", color: PALETTE.inkSoft }}>
          Archetype:{" "}
          <select value={archetype} onChange={(e) => update((c) => ({ ...c, archetype: e.target.value }))}
            style={{ fontFamily: "inherit", fontSize: "0.7rem", background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 6, color: PALETTE.ink, padding: "2px 4px" }}>
            <option value="">— (from 3rd level)</option>
            {Object.keys(ARCHETYPES).map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <SectionTitle>At Your Level</SectionTitle>
      <div style={{ display: "flex", gap: 6 }}>
        <ClassStat label="Sneak Attack" value={`${row.sneak}d6`} sub="once per turn" />
        <ClassStat label="Prof Bonus" value={`+${row.pb}`} sub={char.proficiencyBonus !== row.pb ? `sheet says +${char.proficiencyBonus}` : "matches sheet"} warn={char.proficiencyBonus !== row.pb} />
        <ClassStat label="Expertise" value={level >= 6 ? 4 : 2} sub={`have ${Object.values(char.skills).filter((k) => k.expertise).length} skills`} />
      </div>
      {at && (
        <>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <ClassStat label="Cantrips" value={at.cantrips} sub={`have ${cantripsKnown}`} warn={cantripsKnown < at.cantrips} />
            <ClassStat label="Spells Known" value={at.spellsKnown} sub={`have ${spellsKnown}`} warn={spellsKnown !== at.spellsKnown} />
            <ClassStat label="Spell Slots" value={at.slots.join(" / ")} sub={at.slots.map((_, i) => ordinal(i + 1)).join(" / ")} />
          </div>
          <div style={{ fontSize: "0.72rem", color: PALETTE.inkSoft, marginTop: 6, lineHeight: 1.45 }}>
            Wizard spells, Intelligence-based. Slots return on a <b>long</b> rest. Racial cantrips (e.g. High Elf) count on top of the table. Red boxes mean your sheet doesn't match the table for level {level}.
          </div>
        </>
      )}

      <SectionTitle>Class Features</SectionTitle>
      <div style={styles.card}>
        {ROGUE_FEATURES.filter((f) => showAll || f.level <= level).map((f) => <FeatureRow key={f.name} f={f} gained={f.level <= level} />)}
        <button style={{ ...styles.smallBtn, marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>{showAll ? "Hide future levels" : "Show future levels"}</button>
      </div>

      {adata && (
        <>
          <SectionTitle>{archetype}</SectionTitle>
          <div style={styles.card}>
            <div style={{ fontSize: "0.8rem", color: PALETTE.inkSoft, lineHeight: 1.45, marginBottom: 6 }}>{adata.blurb}</div>
            {adata.features.filter((f) => showAll || f.level <= level).map((f) => <FeatureRow key={f.name} f={f} gained={f.level <= level} />)}
          </div>
        </>
      )}

      <SectionTitle>Rogue Table</SectionTitle>
      <div style={{ ...styles.card, padding: "6px 8px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.74rem", fontFamily: "Cinzel,serif" }}>
          <thead>
            <tr style={{ color: PALETTE.rust, fontSize: "0.55rem", letterSpacing: 1 }}>
              <th style={{ textAlign: "left", padding: "4px 2px" }}>LV</th><th style={{ padding: "4px 2px" }}>PB</th><th style={{ padding: "4px 2px" }}>SNEAK</th>
              {at && <><th style={{ padding: "4px 2px" }}>CANT</th><th style={{ padding: "4px 2px" }}>SPELLS</th><th style={{ padding: "4px 2px" }}>SLOTS</th></>}
              <th style={{ textAlign: "left", padding: "4px 2px" }}>FEATURES</th>
            </tr>
          </thead>
          <tbody>
            {ROGUE_TABLE.map((r) => {
              const sp = archetype === "Arcane Trickster" ? atSpellsFor(r.level) : null;
              const names = [...ROGUE_FEATURES.filter((f) => f.level === r.level).map((f) => f.name), ...(adata ? adata.features.filter((f) => f.level === r.level).map((f) => f.name) : [])];
              return (
                <tr key={r.level} style={{ background: r.level === level ? "rgba(201,136,42,0.18)" : "transparent", color: r.level <= level ? PALETTE.ink : PALETTE.inkSoft, textAlign: "center" }}>
                  <td style={{ textAlign: "left", padding: "3px 2px", fontWeight: r.level === level ? 700 : 400 }}>{r.level}</td>
                  <td style={{ padding: "3px 2px" }}>+{r.pb}</td><td style={{ padding: "3px 2px" }}>{r.sneak}d6</td>
                  {at && <><td style={{ padding: "3px 2px" }}>{sp ? sp.cantrips : "—"}</td><td style={{ padding: "3px 2px" }}>{sp ? sp.spellsKnown : "—"}</td><td style={{ padding: "3px 2px", whiteSpace: "nowrap" }}>{sp ? sp.slots.join("/") : "—"}</td></>}
                  <td style={{ textAlign: "left", padding: "3px 2px", fontFamily: "'Crimson Text',serif", fontSize: "0.78rem" }}>{names.join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CLASS: Warlock ──
function WarlockClassTab({ char, update, setLore, styles, SectionTitle }) {
  const level = char.level || 1;
  const row = rowFor(level);
  const patron = PATRONS[char.patron] ? char.patron : "Archfey";
  const pdata = PATRONS[patron];
  const [showAll, setShowAll] = useState(false);
  const [invFilter, setInvFilter] = useState("available");

  const cantripsKnown = char.spells.cantrips.length;
  const spellsKnown = Object.entries(char.spells).filter(([k]) => k !== "cantrips").reduce((n, [, arr]) => n + arr.length, 0);
  const invNames = INVOCATIONS.map((i) => i.name);
  const invocationsHeld = char.features.filter((f) => invNames.includes(f));
  const ctx = { level, cantrips: char.spells.cantrips, pact: char.pact };

  const hasFeature = (name) => char.features.includes(name);
  const addFeature = (name, desc) => update((c) => ({
    ...c,
    features: c.features.includes(name) ? c.features : [...c.features, name],
    lore: { ...c.lore, [name]: c.lore[name] || desc },
  }));
  const removeFeature = (name) => update((c) => ({ ...c, features: c.features.filter((f) => f !== name) }));
  const hasSpell = (name) => Object.values(char.spells).some((arr) => arr.includes(name));
  const addSpell = (lvl, name) => update((c) => {
    const key = `level${lvl}`;
    const bucket = c.spells[key] || [];
    return bucket.includes(name) ? c : { ...c, spells: { ...c.spells, [key]: [...bucket, name] } };
  });

  const Stat = ClassStat;
  const FeatureRow = ({ f, gained }) => <ClassFeatureRow f={f} gained={gained} onSheet={hasFeature(f.name)} onAdd={() => addFeature(f.name, f.desc)} styles={styles} />;

  const invList = INVOCATIONS.filter((inv) => {
    const held = hasFeature(inv.name);
    if (invFilter === "held") return held;
    if (invFilter === "available") return held || meetsPrereq(inv.prereq, ctx);
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: "1.05rem", color: PALETTE.rust }}>Warlock {level}</div>
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.62rem", color: PALETTE.inkSoft }}>
          Patron:{" "}
          <select value={patron} onChange={(e) => update((c) => ({ ...c, patron: e.target.value }))}
            style={{ fontFamily: "inherit", fontSize: "0.7rem", background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 6, color: PALETTE.ink, padding: "2px 4px" }}>
            {Object.keys(PATRONS).map((p) => <option key={p}>{p}</option>)}
          </select>
          {" · "}Pact:{" "}
          <select value={char.pact || ""} onChange={(e) => update((c) => ({ ...c, pact: e.target.value }))}
            style={{ fontFamily: "inherit", fontSize: "0.7rem", background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 6, color: PALETTE.ink, padding: "2px 4px" }}>
            <option value="">—</option>{["Chain", "Blade", "Tome"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <SectionTitle>At Your Level</SectionTitle>
      <div style={{ display: "flex", gap: 6 }}>
        <Stat label="Spell Slots" value={row.slots} sub={`${row.slotLevel}${["st", "nd", "rd"][row.slotLevel - 1] || "th"} level`} />
        <Stat label="Cantrips" value={row.cantrips} sub={`have ${cantripsKnown}`} warn={cantripsKnown !== row.cantrips} />
        <Stat label="Spells Known" value={row.spellsKnown} sub={`have ${spellsKnown}`} warn={spellsKnown !== row.spellsKnown} />
        <Stat label="Invocations" value={row.invocations} sub={`have ${invocationsHeld.length}`} warn={invocationsHeld.length !== row.invocations} />
      </div>
      <div style={{ fontSize: "0.72rem", color: PALETTE.inkSoft, marginTop: 6, lineHeight: 1.45 }}>
        Pact Magic slots come back on a <b>short</b> rest. Red boxes mean your sheet doesn't match the table for level {level}.
      </div>

      <SectionTitle>Class Features</SectionTitle>
      <div style={styles.card}>
        {CLASS_FEATURES.filter((f) => showAll || f.level <= level).map((f) => <FeatureRow key={f.name} f={f} gained={f.level <= level} />)}
        <button style={{ ...styles.smallBtn, marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>{showAll ? "Hide future levels" : "Show future levels"}</button>
      </div>

      <SectionTitle>The {patron}</SectionTitle>
      <div style={styles.card}>
        {pdata.features.filter((f) => showAll || f.level <= level).map((f) => <FeatureRow key={f.name} f={f} gained={f.level <= level} />)}
        <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1.5, color: PALETTE.rust, textTransform: "uppercase", margin: "12px 0 4px" }}>Expanded spell list</div>
        {Object.entries(pdata.spells).map(([lvl, names]) => (
          <div key={lvl} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: "0.84rem", opacity: Number(lvl) <= row.slotLevel ? 1 : 0.5 }}>
            <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", color: PALETTE.gold, width: 26 }}>{lvl}{["st", "nd", "rd"][lvl - 1] || "th"}</span>
            <span style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {names.map((n) => hasSpell(n)
                ? <span key={n} style={{ color: PALETTE.green }}>✓ {n}</span>
                : <button key={n} disabled={Number(lvl) > row.slotLevel} style={{ ...styles.smallBtn, padding: "2px 7px", textTransform: "none", letterSpacing: 0, fontFamily: "inherit", fontSize: "0.8rem" }} onClick={() => addSpell(lvl, n)}>+ {n}</button>)}
            </span>
          </div>
        ))}
      </div>

      <SectionTitle>Eldritch Invocations</SectionTitle>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[["available", "Available"], ["held", "Mine"], ["all", "All"]].map(([k, l]) => (
          <button key={k} onClick={() => setInvFilter(k)} style={{ ...styles.smallBtn, background: invFilter === k ? `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})` : "rgba(61,26,5,0.08)", color: invFilter === k ? PALETTE.goldLt : PALETTE.darkB }}>{l}</button>
        ))}
      </div>
      <div style={styles.card}>
        {invList.map((inv) => <InvocationRow key={inv.name} inv={inv} held={hasFeature(inv.name)} ok={meetsPrereq(inv.prereq, ctx)}
          onAdd={() => addFeature(inv.name, inv.desc)} onRemove={() => removeFeature(inv.name)} styles={styles} />)}
        {!invList.length && <div style={{ fontSize: "0.8rem", color: PALETTE.inkSoft }}>Nothing here yet.</div>}
      </div>

      <SectionTitle>Warlock Table</SectionTitle>
      <div style={{ ...styles.card, padding: "6px 8px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.74rem", fontFamily: "Cinzel,serif" }}>
          <thead>
            <tr style={{ color: PALETTE.rust, fontSize: "0.5rem", letterSpacing: 1, textTransform: "uppercase" }}>
              {["Lv", "PB", "Cant", "Spells", "Slots", "Slot Lv", "Invoc"].map((h) => <th key={h} style={{ padding: "3px 4px", textAlign: "center", borderBottom: `1px solid ${PALETTE.gold}` }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {WARLOCK_TABLE.map((r) => (
              <tr key={r.level} style={{ background: r.level === level ? "rgba(201,136,42,0.25)" : "transparent", color: r.level === level ? PALETTE.rust : r.level < level ? PALETTE.inkSoft : PALETTE.ink, fontWeight: r.level === level ? 700 : 400 }}>
                {[r.level, `+${r.pb}`, r.cantrips, r.spellsKnown, r.slots, `${r.slotLevel}`, r.invocations || "—"].map((v, i) => <td key={i} style={{ padding: "3px 4px", textAlign: "center", borderBottom: "1px solid rgba(139,94,26,0.12)" }}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvocationRow({ inv, held, ok, onAdd, onRemove, styles }) {
  const [open, setOpen] = useState(false);
  const pre = prereqText(inv.prereq);
  return (
    <div style={{ borderBottom: "1px solid rgba(139,94,26,0.14)", opacity: held || ok ? 1 : 0.5 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", cursor: "pointer" }}>
        <span style={{ color: PALETTE.gold, fontSize: "0.72rem", width: 14, textAlign: "center" }}>✦</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "0.9rem", color: PALETTE.ink }}>{inv.name}</span>
          {pre && <span style={{ display: "block", fontSize: "0.66rem", color: ok ? PALETTE.inkSoft : PALETTE.rust }}>Requires {pre}</span>}
        </span>
        {held
          ? <button style={{ ...styles.smallBtn, padding: "3px 8px", borderColor: PALETTE.rust, color: PALETTE.rust }} onClick={(e) => { e.stopPropagation(); onRemove(); }}>− Drop</button>
          : <button style={{ ...styles.smallBtn, padding: "3px 8px" }} disabled={!ok} onClick={(e) => { e.stopPropagation(); onAdd(); }}>+ Take</button>}
        <span style={{ color: PALETTE.inkSoft, fontSize: "0.7rem", width: 12, textAlign: "center" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && <div style={{ padding: "0 0 10px 23px", fontSize: "0.82rem", color: "#3d2b0a", lineHeight: 1.5 }}>{inv.desc}</div>}
    </div>
  );
}

// ── CODEX (5e SRD lookup) ──
function CodexTab({ styles, setLore, update, SectionTitle }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [openItem, setOpenItem] = useState(null);
  const [details, setDetails] = useState({});
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setStatus("idle"); return; }
    setStatus("loading");
    debounceRef.current = setTimeout(async () => {
      try { setResults(await srdSearch(query)); setStatus("done"); }
      catch { setStatus("error"); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const openDetail = async (item) => {
    const key = `${item.resource}/${item.index}`;
    if (openItem === key) { setOpenItem(null); return; }
    setOpenItem(key);
    if (!details[key]) {
      try {
        const raw = await fetchDetail(item.resource, item.index);
        setDetails(d => ({ ...d, [key]: { text: formatDetail(item.resource, raw) } }));
      } catch {
        setDetails(d => ({ ...d, [key]: { text: "Could not load details." } }));
      }
    }
  };

  const addEntry = (item, target) => {
    const key = `${item.resource}/${item.index}`;
    const text = details[key]?.text || "";
    const name = item.name;
    if (target === "spell") {
      const lvl = item.level === 0 ? "cantrips" : `level${item.level}`;
      update(c => {
        const bucket = c.spells[lvl] || [];
        const spells = bucket.includes(name) ? c.spells : { ...c.spells, [lvl]: [...bucket, name] };
        return { ...c, spells, lore: { ...c.lore, [name]: text || c.lore[name] } };
      });
    } else if (target === "feature") {
      update(c => ({ ...c, features: c.features.includes(name) ? c.features : [...c.features, name], lore: { ...c.lore, [name]: text || c.lore[name] } }));
    } else if (target === "gear") {
      update(c => ({ ...c, equipment: c.equipment.includes(name) ? c.equipment : [...c.equipment, name], lore: { ...c.lore, [name]: text || c.lore[name] } }));
    } else if (target === "note") {
      update(c => ({ ...c, notes: (c.notes ? c.notes + "\n\n" : "") + `【${name}】\n${text}` }));
    }
  };

  const chipColor = { Spell: "#7a1c1c", Feature: "#3d6a1c", Trait: "#1c4a7a", Gear: "#5c2b0a", Condition: "#6a1c6a", "Magic Item": "#8a5a00", Monster: "#1c5a4a", Race: "#2a4a7a" };

  return (
    <div>
      <SectionTitle>Codex — 5e Rules Lookup</SectionTitle>
      <div style={{ fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: 10, lineHeight: 1.45 }}>
        Search official D&D 5e spells, features, traits, gear, conditions, monsters and races. Misspellings are okay — it suggests the closest match. Tap a result to read it, then add it to your sheet (or save it to Notes). Saved rules text can be read again later, even offline.
      </div>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Fireball, Darkvision, Rage…"
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(201,136,42,0.1)", border: `1px solid ${PALETTE.gold}`, borderRadius: 10, color: PALETTE.ink, fontFamily: "'Crimson Text',serif", fontSize: "1rem", padding: "10px 13px" }} />

      <div style={{ marginTop: 10 }}>
        {status === "loading" && <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem", padding: "8px 0" }}>Searching…</div>}
        {status === "error" && <div style={{ color: PALETTE.rust, fontSize: "0.82rem", padding: "8px 0" }}>Couldn’t reach the SRD API. Check your connection and try again.</div>}
        {status === "done" && results.length === 0 && <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem", padding: "8px 0" }}>No matches found — try fewer letters.</div>}
        {status === "done" && results.length > 0 && results[0].fuzzy && (
          <div style={{ color: PALETTE.rust, fontSize: "0.78rem", fontStyle: "italic", padding: "2px 0 8px" }}>No exact match — showing closest results:</div>
        )}

        {results.map(item => {
          const key = `${item.resource}/${item.index}`;
          const isOpen = openItem === key; const d = details[key];
          return (
            <div key={key} style={{ border: "1px solid rgba(201,136,42,0.3)", borderRadius: 10, marginBottom: 8, overflow: "hidden", background: "rgba(255,250,240,0.6)" }}>
              <div onClick={() => openDetail(item)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", cursor: "pointer" }}>
                <span style={{ fontFamily: "Cinzel,serif", fontSize: "0.5rem", letterSpacing: 1, textTransform: "uppercase", color: "#fff", background: chipColor[item.label] || PALETTE.darkC, borderRadius: 5, padding: "2px 7px", flexShrink: 0 }}>
                  {item.label}{item.resource === "spells" ? ` ${item.level === 0 ? "C" : item.level}` : ""}
                </span>
                <span style={{ flex: 1, fontSize: "0.92rem", color: PALETTE.ink }}>{item.name}</span>
                {item.fuzzy && <span title="Closest match" style={{ color: PALETTE.gold, fontSize: "0.8rem" }}>≈</span>}
                <span style={{ color: PALETTE.inkSoft, fontSize: "0.8rem" }}>{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div style={{ padding: "0 11px 11px" }}>
                  {!d ? <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem" }}>Loading…</div> : (
                    <>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.83rem", color: "#3d2b0a", lineHeight: 1.5, marginBottom: 8 }}>{d.text}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {item.resource === "spells" && <button style={styles.addBtn} onClick={() => addEntry(item, "spell")}>+ Add Spell</button>}
                        {(item.resource === "features" || item.resource === "traits" || item.resource === "conditions") && <button style={styles.addBtn} onClick={() => addEntry(item, "feature")}>+ Add Feature</button>}
                        {(item.resource === "equipment" || item.resource === "magic-items") && <button style={styles.addBtn} onClick={() => addEntry(item, "gear")}>+ Add to Gear</button>}
                        <button style={{ ...styles.addBtn, background: "transparent", color: PALETTE.rust, borderColor: PALETTE.rust }} onClick={() => addEntry(item, "note")}>+ Notes</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PAPER (photo attachments) ──
function PhotoTab({ styles, SectionTitle, charId }) {
  const [photos, setPhotos] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef(null);
  const cameraRef = useRef(null);

  const reload = async () => { try { setPhotos(await getPhotos(charId)); } catch { setPhotos([]); } };
  useEffect(() => { setPhotos(null); reload(); }, [charId]);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      try {
        const dataUrl = await resizeImage(f);
        const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        await addPhoto({ id, charId, dataUrl, caption: "", created: Date.now() });
      } catch {}
    }
    e.target.value = "";
    setBusy(false);
    reload();
  };

  const remove = async (id) => { await deletePhoto(id); reload(); };
  const openViewer = (p) => { setViewer(p); setZoom(false); };

  return (
    <div>
      <SectionTitle>Paper Sheet Photos</SectionTitle>
      <div style={{ fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: 12, lineHeight: 1.45 }}>
        Snap or upload photos of this character's paper sheet to keep as reference. Tap a photo to view it full-screen and zoom in while you copy values across.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={{ ...styles.btn, flex: 1 }} onClick={() => cameraRef.current?.click()} disabled={busy}>📷 Take Photo</button>
        <button style={{ ...styles.btn, flex: 1 }} onClick={() => uploadRef.current?.click()} disabled={busy}>🖼 Upload</button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFiles} style={{ display: "none" }} />
        <input ref={uploadRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
      </div>

      {busy && <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem", marginBottom: 10 }}>Processing photo…</div>}

      {photos === null ? (
        <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem" }}>Loading…</div>
      ) : photos.length === 0 ? (
        <div style={{ ...styles.card, textAlign: "center", color: PALETTE.inkSoft, fontSize: "0.85rem", padding: "26px 12px" }}>
          No photos yet. Tap <b>Take Photo</b> or <b>Upload</b> to add one.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {photos.map(p => (
            <div key={p.id} style={{ border: `1px solid ${PALETTE.gold}`, borderRadius: 10, overflow: "hidden", background: "#fff", position: "relative" }}>
              <img src={p.dataUrl} alt={p.caption || "sheet photo"} onClick={() => openViewer(p)}
                style={{ width: "100%", height: 130, objectFit: "cover", display: "block", cursor: "zoom-in" }} />
              <button onClick={() => remove(p.id)} title="Delete"
                style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(122,28,28,0.85)", color: "#fff", fontSize: "1rem", cursor: "pointer", lineHeight: 1 }}>×</button>
              <input value={p.caption || ""} placeholder="Caption…"
                onChange={e => { const v = e.target.value; setPhotos(ps => ps.map(x => x.id === p.id ? { ...x, caption: v } : x)); }}
                onBlur={e => updatePhotoCaption(p.id, e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", border: "none", borderTop: "1px solid rgba(201,136,42,0.3)", padding: "5px 8px", fontFamily: "'Crimson Text',serif", fontSize: "0.78rem", color: PALETTE.ink, background: "rgba(255,250,240,0.8)" }} />
            </div>
          ))}
        </div>
      )}

      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", zIndex: 300, overflow: "auto", display: "flex", alignItems: zoom ? "flex-start" : "center", justifyContent: "center", padding: zoom ? 0 : 12 }}>
          <img src={viewer.dataUrl} alt={viewer.caption || "sheet photo"} onClick={e => { e.stopPropagation(); setZoom(z => !z); }}
            style={zoom ? { width: "200%", maxWidth: "none", cursor: "zoom-out", display: "block" } : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in", display: "block" }} />
          <button onClick={() => setViewer(null)} style={{ position: "fixed", top: 14, right: 14, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: "1.5rem", cursor: "pointer", lineHeight: 1 }}>×</button>
          <div style={{ position: "fixed", bottom: 16, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.7)", fontFamily: "Cinzel,serif", fontSize: "0.65rem", letterSpacing: 1 }}>
            {viewer.caption ? viewer.caption + " · " : ""}TAP IMAGE TO {zoom ? "FIT" : "ZOOM"}
          </div>
        </div>
      )}
    </div>
  );
}
